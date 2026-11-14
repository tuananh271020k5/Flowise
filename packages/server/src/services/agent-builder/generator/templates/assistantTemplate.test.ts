import { AgentSpec } from '../../types'
import { validateNodeMetadata } from '../nodeRegistry'
import { ASSISTANT_TEMPLATE_ID, ASSISTANT_TEMPLATE_VERSION, instantiateAssistantTemplate } from './assistantTemplate.v1'

describe('Assistant Flow Template v1.0 (PH2-T01 / B-007)', () => {
    const sampleSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ Lý Tư Vấn Tiếng Việt',
        goal: 'Hỗ trợ khách hàng tra cứu chính sách và giải đáp câu hỏi',
        language: 'vi',
        instructions: 'Luôn trả lời lịch sự, thân thiện và chính xác theo thông tin sản phẩm.',
        outputExpectations: ['Ngắn gọn', 'Lịch sự'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [],
        tools: [
            { id: 't1', name: 'Máy tính tính giá', type: 'calculator' },
            { id: 't2', name: 'Tra cứu thông tin', type: 'webSearch' }
        ],
        policy: {
            visibility: 'private',
            executionMode: 'controlled-test',
            allowWrite: false
        },
        evaluationExamples: [
            {
                input: 'Chính sách đổi trả trong bao nhiêu ngày?',
                assertions: ['Đúng chính sách 30 ngày']
            }
        ]
    }

    it('khởi tạo template có version và định danh chuẩn', () => {
        const graph = instantiateAssistantTemplate(sampleSpec)

        expect(graph.templateId).toBe(ASSISTANT_TEMPLATE_ID)
        expect(graph.templateVersion).toBe(ASSISTANT_TEMPLATE_VERSION)
        expect(graph.nodes.length).toBeGreaterThanOrEqual(3)
        expect(graph.edges.length).toBeGreaterThanOrEqual(1)
    })

    it('tạo Start node phiên bản 1.4 và Agent node 3.2 chuẩn theo runtime', () => {
        const graph = instantiateAssistantTemplate(sampleSpec)

        const startNode = graph.nodes.find((n) => n.data.name === 'startAgentflow')
        expect(startNode).toBeDefined()
        expect(startNode?.data.version).toBe(1.4)
        expect(startNode?.data.inputs.startInputType).toBe('chatInput')

        const agentNode = graph.nodes.find((n) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        expect(agentNode?.data.version).toBe(3.2)
        expect(agentNode?.data.label).toBe('Trợ Lý Tư Vấn Tiếng Việt')
        expect(agentNode?.data.inputs.agentModel).toBe('chatOpenAI')

        const messages = agentNode?.data.inputs.agentMessages as any[]
        expect(messages[0].role).toBe('system')
        expect(messages[0].content).toContain('Luôn trả lời lịch sự')
    })

    it('tạo Tool nodes khi spec có tools và liên kết vào Agent', () => {
        const graph = instantiateAssistantTemplate(sampleSpec)

        const calcNode = graph.nodes.find((n) => n.data.name === 'calculator')
        const searchNode = graph.nodes.find((n) => n.data.name === 'webSearch')

        expect(calcNode).toBeDefined()
        expect(searchNode).toBeDefined()

        const agentNode = graph.nodes.find((n) => n.data.name === 'agentAgentflow')
        const agentTools = agentNode?.data.inputs.agentTools as any[]
        expect(agentTools).toHaveLength(2)
        expect(agentTools.map((t) => t.agentSelectedTool)).toContain('calculator')
        expect(agentTools.map((t) => t.agentSelectedTool)).toContain('webSearch')
    })

    it('tất cả các nodes được sinh ra đều vượt qua Node Registry validation 100%', () => {
        const graph = instantiateAssistantTemplate(sampleSpec)

        for (const node of graph.nodes) {
            const validation = validateNodeMetadata({
                name: node.data.name,
                version: node.data.version,
                type: node.data.type,
                inputs: node.data.inputs
            })
            expect(validation.valid).toBe(true)
            expect(validation.errors).toHaveLength(0)
        }
    })

    it('kết nối cạnh Start -> Agent chính xác theo format Agentflow V2', () => {
        const graph = instantiateAssistantTemplate(sampleSpec)

        const edge = graph.edges.find((e) => e.source === 'startAgentflow_0' && e.target === 'agentAgentflow_0')
        expect(edge).toBeDefined()
        expect(edge?.type).toBe('agentFlow')
        expect(edge?.sourceHandle).toBe('startAgentflow_0-output-startAgentflow')
    })
})
