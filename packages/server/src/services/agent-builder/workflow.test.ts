import { WorkflowSchema, workflowProblems, WorkflowSpec } from './workflow'
import { computeReadiness } from './readiness'
import { createAgentPlan } from './generator/agentPlan'
import compiler from './generator/compiler'
import { validateFlowGraph } from './generator/flowValidator'
import { AgentSpec } from './types'

export const guideWorkflow = (): WorkflowSpec =>
    WorkflowSchema.parse({
        summary: 'Đọc đúng tài liệu hướng dẫn phần mềm, kiểm tra bằng chứng và trả lời hoặc hỏi rõ.',
        steps: [
            {
                id: 'find',
                type: 'retriever',
                label: 'Tìm tài liệu',
                instruction: 'Tìm hướng dẫn liên quan đến câu hỏi.',
                inputFrom: ['start']
            },
            {
                id: 'evidence',
                type: 'condition',
                label: 'Kiểm tra bằng chứng',
                instruction: 'Kiểm tra có đoạn tài liệu hay không.',
                inputFrom: ['find'],
                condition: { operation: 'notEmpty' }
            },
            {
                id: 'answer',
                type: 'llm',
                label: 'Hướng dẫn từng bước',
                instruction: 'Hướng dẫn theo tài liệu và dẫn nguồn [số].',
                inputFrom: ['start', 'find']
            },
            {
                id: 'missing',
                type: 'reply',
                label: 'Hỏi thêm',
                instruction: 'Tôi chưa tìm thấy hướng dẫn phù hợp trong tài liệu. Bạn dùng phiên bản phần mềm nào?'
            }
        ],
        edges: [
            { source: 'start', target: 'find' },
            { source: 'find', target: 'evidence' },
            { source: 'evidence', target: 'answer', branch: 'true' },
            { source: 'evidence', target: 'missing', branch: 'false' }
        ],
        questions: [],
        blockers: []
    })
const spec = (workflow = guideWorkflow()): AgentSpec => ({
    schemaVersion: '1.0',
    kind: 'knowledge',
    name: 'Trợ lý phần mềm',
    goal: 'Hướng dẫn sử dụng phần mềm theo tài liệu',
    language: 'vi',
    instructions: 'Chỉ trả lời theo tài liệu; thiếu bằng chứng thì hỏi rõ.',
    modelProfileRef: 'default-builder-model',
    dataSources: [{ id: 'store-id', name: 'Hướng dẫn sử dụng', type: 'documentStore' }],
    tools: [],
    outputExpectations: [],
    evaluationExamples: [],
    policy: { visibility: 'private', allowWrite: false, executionMode: 'controlled-test' },
    workflow
})

describe('Typed workflow planning and real V2 compilation', () => {
    it('compiles a document workflow with a retriever, condition and two actual branch handles', () => {
        const workflow = guideWorkflow()
        expect(workflowProblems(workflow)).toEqual([])
        expect(computeReadiness(spec()).buildReady).toBe(true)
        const graph = compiler.compile(createAgentPlan(spec(), 'rev-1'))
        expect(graph.nodes.map((node) => node.data.name)).toEqual([
            'startAgentflow',
            'retrieverAgentflow',
            'conditionAgentflow',
            'llmAgentflow',
            'directReplyAgentflow'
        ])
        expect(graph.nodes.find((node) => node.data.name === 'retrieverAgentflow')?.data.inputs.retrieverQuery).toBe('{{question}}')
        expect(graph.edges).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ sourceHandle: 'conditionAgentflow_evidence-output-0', target: 'llmAgentflow_answer' }),
                expect.objectContaining({ sourceHandle: 'conditionAgentflow_evidence-output-1', target: 'directReplyAgentflow_missing' })
            ])
        )
        expect(graph.nodes.find((node) => node.id === 'llmAgentflow_answer')?.data.inputs.llmMessages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    role: 'user',
                    content: expect.stringMatching(/\{\{question\}\}[\s\S]*\{\{retrieverAgentflow_find\}\}/)
                })
            ])
        )
        expect(validateFlowGraph(graph)).toMatchObject({ valid: true, nodeCount: 5, edgeCount: 4 })
    })
    it('keeps {{question}} in downstream RAG answer steps even when planner inputFrom only lists the retriever (B-030-T06)', () => {
        const workflow = guideWorkflow()
        workflow.steps.find((step) => step.id === 'answer')!.inputFrom = ['find']
        workflow.steps.find((step) => step.id === 'missing')!.inputFrom = ['evidence']
        expect(workflowProblems(workflow)).toEqual([])
        const graph = compiler.compile(createAgentPlan(spec(workflow), 'rev-deskflow'))
        const conditionInputs = graph.nodes.find((node) => node.id === 'conditionAgentflow_evidence')?.data.inputs as any
        expect(conditionInputs.conditions[0].value1).toBe('{{retrieverAgentflow_find}}')
        const replyInputs = graph.nodes.find((node) => node.id === 'directReplyAgentflow_missing')?.data.inputs as any
        expect(replyInputs.directReplyMessage).toBe('Tôi chưa tìm thấy hướng dẫn phù hợp trong tài liệu. Bạn dùng phiên bản phần mềm nào?')
        expect(replyInputs.directReplyMessage).not.toContain('{{conditionAgentflow_')
        const answerMessages = graph.nodes.find((node) => node.id === 'llmAgentflow_answer')?.data.inputs.llmMessages as any[]
        const userMsg = answerMessages.find((msg) => msg.role === 'user')
        expect(userMsg.content).toContain('{{question}}')
        expect(userMsg.content).toContain('{{retrieverAgentflow_find}}')
        expect(userMsg.content.match(/\{\{question\}\}/g)).toHaveLength(1)
        const systemMsg = answerMessages.find((msg) => msg.role === 'system')
        expect(systemMsg.content).toContain('không chỉ liệt kê mục lục')
    })
    it('creates distinct LLM stages for a script/scenes/prompts request instead of one generic Agent', () => {
        const workflow = WorkflowSchema.parse({
            summary: 'Viết kịch bản, chia cảnh và tạo prompt',
            steps: ['script', 'scenes', 'prompts'].map((id, index) => ({
                id,
                type: 'llm',
                label: id,
                instruction: `Thực hiện bước ${id} theo yêu cầu.`,
                inputFrom: [index === 0 ? 'start' : ['script', 'scenes'][index - 1]]
            })),
            edges: [
                { source: 'start', target: 'script' },
                { source: 'script', target: 'scenes' },
                { source: 'scenes', target: 'prompts' }
            ],
            questions: [],
            blockers: []
        })
        const data = { ...spec(workflow), kind: 'assistant' as const, dataSources: [] }
        const graph = compiler.compile(createAgentPlan(data))
        expect(graph.nodes).toHaveLength(4)
        expect(graph.nodes[1].data.inputs.llmMessages).toEqual(
            expect.arrayContaining([expect.objectContaining({ role: 'user', content: '{{question}}' })])
        )
        expect(graph.nodes[2].data.inputs.llmMessages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    role: 'user',
                    content: expect.stringMatching(/\{\{question\}\}[\s\S]*\{\{llmAgentflow_script\}\}/)
                })
            ])
        )
        expect(validateFlowGraph(graph).valid).toBe(true)
        expect(createAgentPlan({ ...data, workflow: { ...workflow, summary: 'Đã sửa yêu cầu' } }).id).not.toBe(createAgentPlan(data).id)
    })
    it('blocks unsupported video/file capabilities and preserves the actual requirement', () => {
        const workflow = WorkflowSchema.parse({
            summary: 'Tạo phim bằng Veo',
            steps: [
                {
                    id: 'video',
                    type: 'external',
                    label: 'Tạo video Veo',
                    instruction: 'Tạo video theo kịch bản.',
                    capability: 'veo-video',
                    inputFrom: ['start']
                }
            ],
            edges: [{ source: 'start', target: 'video' }],
            questions: ['Bạn muốn dùng dịch vụ Veo nào?'],
            blockers: []
        })
        expect(computeReadiness(spec(workflow)).buildReady).toBe(false)
        expect(workflowProblems(workflow).join(' ')).toContain('veo-video')
        expect(() => compiler.compile(createAgentPlan(spec(workflow)))).toThrow()
    })
    it('rejects cycles, disconnected nodes and data references that are not guaranteed to execute', () => {
        const cycle = guideWorkflow()
        cycle.edges.push({ source: 'answer', target: 'find' })
        expect(workflowProblems(cycle).join(' ')).toContain('vòng lặp')
        const detached = guideWorkflow()
        detached.steps.push({ id: 'detached', type: 'llm', label: 'Rời', instruction: 'Không nối.', inputFrom: [] })
        expect(workflowProblems(detached).join(' ')).toContain('không nối')
        const badRef = guideWorkflow()
        badRef.steps[2].inputFrom = ['missing']
        expect(workflowProblems(badRef).join(' ')).toContain('chưa chắc')
    })
    it('requires document retrieval and never treats an unattached file as evidence', () => {
        expect(computeReadiness({ ...spec(), dataSources: [] }).buildReady).toBe(false)
        const workflow = guideWorkflow()
        workflow.steps[0].sourceIds = ['other-tenant']
        expect(computeReadiness(spec(workflow)).buildReady).toBe(false)
    })
    it('requires both condition branches and disallows model-supplied runtime input/credentials', () => {
        const workflow = guideWorkflow()
        workflow.edges.pop()
        expect(workflowProblems(workflow).join(' ')).toContain('true/false')
        expect(WorkflowSchema.safeParse({ ...guideWorkflow(), arbitraryNodeCode: 'eval()' }).success).toBe(false)
        const bad = guideWorkflow()
        ;(bad.steps[0] as any).credential = 'hidden-key'
        expect(WorkflowSchema.safeParse(bad).success).toBe(false)
    })
})
