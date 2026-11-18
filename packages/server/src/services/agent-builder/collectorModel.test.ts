jest.mock('./modelSettingsService', () => ({ __esModule: true, default: { getProfile: jest.fn(), getModel: jest.fn() } }))
import settings from './modelSettingsService'
import { CollectorService } from './collectorService'
import { computeReadiness } from './readiness'

describe('Model collector patch boundary', () => {
    const invoke = jest.fn()
    const collector = new CollectorService()
    beforeEach(() => {
        jest.clearAllMocks()
        ;(settings.getProfile as jest.Mock).mockResolvedValue({
            ready: true,
            modelName: 'custom-model',
            baseUrl: 'https://provider.example/v1'
        })
        ;(settings.getModel as jest.Mock).mockResolvedValue({ invoke })
    })
    it('keeps only allowed fields and reports provider usage', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({ name: 'Updated', workspaceId: 'attacker', modelProfileRef: 'untrusted' }),
            usage_metadata: { input_tokens: 123, output_tokens: 12 }
        })
        const result = await collector.extractWithModel('Rename it', { goal: 'Keep this goal' }, 'ws')
        expect(result.patch).toEqual({ name: 'Updated' })
        expect(result.usage).toMatchObject({ model: 'custom-model', promptTokens: 123, completionTokens: 12 })
        expect(invoke.mock.calls[0][0][1].content).toContain('Keep this goal')
    })
    it('keeps a typed multi-step plan from natural conversation and only accepts already attached source IDs', async () => {
        const workflow = {
            summary: 'Tóm tắt rồi lập danh sách việc',
            steps: [
                { id: 'summarize', type: 'llm', label: 'Tóm tắt', instruction: 'Tóm tắt văn bản đầu vào.', inputFrom: ['start'] },
                {
                    id: 'tasks',
                    type: 'llm',
                    label: 'Lập việc',
                    instruction: 'Tạo danh sách công việc từ bản tóm tắt.',
                    inputFrom: ['summarize']
                }
            ],
            edges: [
                { source: 'start', target: 'summarize' },
                { source: 'summarize', target: 'tasks' }
            ],
            questions: [],
            blockers: []
        }
        invoke.mockResolvedValue({ content: JSON.stringify({ workflow, dataSources: [] }) })
        const result = await collector.extractWithModel(
            'Tóm tắt trước rồi chuyển thành việc cần làm, bỏ tài liệu cũ.',
            { dataSources: [{ id: 'owned-source', name: 'guide', type: 'documentStore' }] },
            'ws'
        )
        expect(result.patch.workflow?.steps).toHaveLength(2)
        expect(result.patch.workflow?.edges[1]).toMatchObject({ source: 'summarize', target: 'tasks' })
        expect(result.patch.dataSources).toEqual([])
        invoke.mockResolvedValue({ content: JSON.stringify({ dataSources: ['foreign-source'] }) })
        await expect(collector.extractWithModel('Dùng nguồn khác', { dataSources: [] }, 'ws')).rejects.toThrow('chưa được')
    })
    it('leaves usage unmeasured when the provider omits it', async () => {
        invoke.mockResolvedValue({ content: '{}' })
        expect((await collector.extractWithModel('hello', {}, 'ws')).usage).toBeUndefined()
    })
    it('repairs a malformed graph once internally and accounts for both provider calls', async () => {
        const fixed = {
            summary: 'Trợ lý trả lời',
            steps: [{ id: 'answer', type: 'llm', label: 'Trả lời', instruction: 'Trả lời theo yêu cầu.', inputFrom: ['start'] }],
            edges: [{ source: 'start', target: 'answer' }],
            questions: [],
            blockers: []
        }
        invoke.mockResolvedValueOnce({
            content: JSON.stringify({ workflow: { ...fixed, edges: [] } }),
            usage_metadata: { input_tokens: 10, output_tokens: 5 }
        })
        invoke.mockResolvedValueOnce({ content: JSON.stringify(fixed), usage_metadata: { input_tokens: 7, output_tokens: 3 } })
        const result = await collector.extractWithModel('Tạo trợ lý trả lời câu hỏi ngắn.', {}, 'ws')
        expect(result.patch.workflow?.edges).toEqual(fixed.edges)
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(result.usage).toMatchObject({ promptTokens: 17, completionTokens: 8 })
    })
    it('normalizes a textual output expectation without losing the rest of the extracted spec', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                name: 'Tank',
                goal: 'Support customers',
                instructions: 'Reply politely',
                outputExpectations: '  At most three sentences  ',
                evaluationExamples: null
            })
        })
        const result = await collector.extractWithModel('Build the assistant', {}, 'ws')
        expect(result.patch).toEqual({
            name: 'Tank',
            goal: 'Support customers',
            instructions: 'Reply politely',
            outputExpectations: ['At most three sentences']
        })
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke.mock.calls[0][0][0].content).toContain('outputExpectations là string[]')
        expect(computeReadiness({ schemaVersion: '1.0', ...result.patch }).buildReady).toBe(true)
    })
    it('treats null fields as no update instead of erasing an existing spec', async () => {
        invoke.mockResolvedValue({ content: JSON.stringify({ name: null, outputExpectations: null, evaluationExamples: null }) })
        const previous = { name: 'Tank', outputExpectations: ['Keep this expectation'] }
        const result = await collector.extractWithModel('Unrelated message', previous, 'ws')
        expect(result.patch).toEqual({})
        expect({ ...previous, ...result.patch }).toEqual(previous)
    })
    it('trims list entries and preserves an explicit empty list', async () => {
        invoke.mockResolvedValueOnce({ content: JSON.stringify({ outputExpectations: ['  concise  ', ' '] }) })
        expect((await collector.extractWithModel('hello', {}, 'ws')).patch.outputExpectations).toEqual(['concise'])
        invoke.mockResolvedValueOnce({ content: '{"outputExpectations":[]}' })
        expect((await collector.extractWithModel('hello', {}, 'ws')).patch.outputExpectations).toEqual([])
    })
    it.each([{ value: {} }, { value: ['valid', 42] }, { value: ['x'.repeat(501)] }, { value: Array(11).fill('item') }])(
        'still rejects invalid or oversized expectation values: %p',
        async ({ value: outputExpectations }) => {
            invoke.mockResolvedValue({ content: JSON.stringify({ outputExpectations }) })
            await expect(collector.extractWithModel('hello', {}, 'ws')).rejects.toThrow('outputExpectations')
        }
    )
    it('rejects structured values that would break rendering/readiness', async () => {
        invoke.mockResolvedValue({ content: '{"name":{"bad":"type"}}' })
        await expect(collector.extractWithModel('hello', {}, 'ws')).rejects.toThrow('không hợp lệ')
    })
    it('propagates model failure instead of pretending a patch was extracted', async () => {
        invoke.mockRejectedValue(new Error('Provider offline'))
        await expect(collector.extractWithModel('hello', {}, 'ws')).rejects.toThrow('Provider offline')
    })
})
