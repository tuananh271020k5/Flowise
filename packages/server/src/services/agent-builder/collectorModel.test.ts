jest.mock('./modelSettingsService', () => ({ __esModule: true, default: { getProfile: jest.fn(), getModel: jest.fn() } }))
import settings from './modelSettingsService'
import {
    bindDataSourcesToExistingWorkflow,
    CollectorService,
    isPureDocumentAttachmentMessage,
    reconcileWorkflowDataSourceIds
} from './collectorService'
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
    it('deterministically binds attached data sources into an existing retriever workflow and recovers from partial model patches', async () => {
        const existingWorkflow = {
            summary: 'Hỗ trợ CSKH 3 tầng',
            steps: [
                {
                    id: 'retriever_l1',
                    type: 'retriever' as const,
                    label: 'Tìm kiếm Sổ tay CSKH',
                    instruction: 'Tra cứu Sổ tay CSKH.',
                    inputFrom: ['start'],
                    sourceIds: []
                },
                {
                    id: 'answer_l1',
                    type: 'llm' as const,
                    label: 'Trả lời L1',
                    instruction: 'Trả lời theo tài liệu.',
                    inputFrom: ['start', 'retriever_l1']
                }
            ],
            edges: [
                { source: 'start', target: 'retriever_l1' },
                { source: 'retriever_l1', target: 'answer_l1' }
            ],
            questions: [],
            blockers: ['Thiếu tài liệu Sổ tay CSKH cho bước tra cứu L1 (retriever_l1). Vui lòng đính kèm tài liệu.']
        }
        const attached = [{ id: 'store-cskh-1', type: 'documentStore', name: 'So_Tay_CSKH.docx' }]
        expect(
            isPureDocumentAttachmentMessage('Dùng các tài liệu đính kèm làm nguồn cho Agent.\n\nTài liệu đính kèm: So_Tay_CSKH.docx')
        ).toBe(true)
        const bound = bindDataSourcesToExistingWorkflow(existingWorkflow, attached)
        expect(bound.steps[0].sourceIds).toEqual(['store-cskh-1'])
        expect(bound.blockers).toEqual([])

        // Simulate a provider (e.g. Gemini) returning a partial workflow fragment on a doc-attachment turn
        invoke.mockResolvedValueOnce({
            content: JSON.stringify({ workflow: { steps: [{ id: 'retriever_l1', sourceIds: ['store-cskh-1'] }] } })
        })
        invoke.mockResolvedValueOnce({ content: JSON.stringify({ steps: [{ id: 'retriever_l1' }] }) })
        const recovered = await collector.extractWithModel(
            'Dùng các tài liệu đính kèm làm nguồn cho Agent.\n\nTài liệu đính kèm: So_Tay_CSKH.docx',
            { dataSources: attached, workflow: existingWorkflow },
            'ws'
        )
        expect(recovered.patch.workflow?.steps).toHaveLength(2)
        expect(recovered.patch.workflow?.steps[0].sourceIds).toEqual(['store-cskh-1'])
        expect(recovered.patch.workflow?.blockers).toEqual([])
    })
    it('auto-corrects LLM 1-character UUID typos and filename references in retriever sourceIds so readiness passes', async () => {
        const realId = '30d19c38-e383-48d8-a37e-8b73385bbb8c'
        const typoId = '30d19c38-e383-48d8-a37e-8b73383bbb8c'
        const sources = [{ id: realId, type: 'documentStore', name: 'So_Tay_CSKH_Dien_Thoai_SmartMobile_2026.docx' }]
        const wf = {
            summary: 'Hỗ trợ CSKH theo sổ tay',
            steps: [
                {
                    id: 'retriever_l1',
                    type: 'retriever' as const,
                    label: 'Tra cứu Sổ tay',
                    instruction: 'Tra cứu sổ tay.',
                    inputFrom: ['start'],
                    sourceIds: [typoId, 'So_Tay_CSKH_Dien_Thoai_SmartMobile_2026.docx', 'unknown-fake-id']
                },
                {
                    id: 'answer_l1',
                    type: 'llm' as const,
                    label: 'Trả lời',
                    instruction: 'Trả lời từ sổ tay.',
                    inputFrom: ['start', 'retriever_l1']
                }
            ],
            edges: [
                { source: 'start', target: 'retriever_l1' },
                { source: 'retriever_l1', target: 'answer_l1' }
            ],
            questions: [],
            blockers: []
        }
        const reconciled = reconcileWorkflowDataSourceIds(wf, sources)
        expect(reconciled.steps[0].sourceIds).toEqual([realId])

        invoke.mockResolvedValueOnce({ content: JSON.stringify({ workflow: wf, dataSources: [typoId] }) })
        const extracted = await collector.extractWithModel(
            'Tạo trợ lý CSKH theo tài liệu đính kèm',
            { name: 'SmartMobile CSKH', goal: 'Giải đáp CSKH', instructions: 'Trả lời theo tài liệu', dataSources: sources },
            'ws'
        )
        expect(extracted.patch.workflow?.steps[0].sourceIds).toEqual([realId])
        expect(extracted.patch.dataSources?.map((s) => s.id)).toEqual([realId])
        const readiness = computeReadiness({
            schemaVersion: '1.0',
            kind: 'knowledge',
            name: 'SmartMobile CSKH',
            goal: 'Giải đáp CSKH theo tài liệu',
            instructions: 'Trả lời theo tài liệu đính kèm.',
            dataSources: sources,
            workflow: extracted.patch.workflow
        })
        expect(readiness.buildReady).toBe(true)
        expect(readiness.errors || []).toEqual([])
    })
})
