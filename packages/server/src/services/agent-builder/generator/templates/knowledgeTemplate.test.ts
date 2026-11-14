import { AgentSpec } from '../../types'
import { validateNodeMetadata } from '../nodeRegistry'
import { validateFlowGraph } from '../flowValidator'
import { KNOWLEDGE_TEMPLATE_ID, KNOWLEDGE_TEMPLATE_VERSION, instantiateKnowledgeTemplate } from './knowledgeTemplate.v1'

describe('Knowledge Flow Template v1.0 (PH4-T03 / B-017)', () => {
    const sampleKnowledgeSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'knowledge',
        name: 'Trợ Lý Quy Chế Nội Bộ',
        goal: 'Hỗ trợ nhân viên tra cứu các chính sách, quy định và chế độ phúc lợi của công ty',
        language: 'vi',
        instructions: 'Giải đáp thắc mắc dựa trên quy chế công ty với văn phong lịch sự, chuẩn mực.',
        outputExpectations: ['Trích dẫn rõ điều khoản quy định', 'Từ chối suy diễn nếu không có căn cứ'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [
            {
                id: 'store_policy_2026',
                name: 'Quy chế làm việc và phúc lợi 2026',
                type: 'documentStore',
                config: { topK: 4 }
            }
        ],
        tools: [{ id: 'tool_calc', name: 'Tính toán lương thưởng', type: 'calculator' }],
        policy: {
            visibility: 'private',
            executionMode: 'controlled-test',
            allowWrite: false
        },
        evaluationExamples: [
            {
                input: 'Thời gian thử việc tối đa theo quy chế là bao lâu?',
                assertions: ['Thời gian thử việc tối đa là 60 ngày', 'Theo Điều 5 Quy chế làm việc']
            }
        ]
    }

    it('khởi tạo Knowledge template có templateId và version chuẩn', () => {
        const graph = instantiateKnowledgeTemplate(sampleKnowledgeSpec)

        expect(graph.templateId).toBe(KNOWLEDGE_TEMPLATE_ID)
        expect(graph.templateVersion).toBe(KNOWLEDGE_TEMPLATE_VERSION)
        expect(graph.nodes.length).toBeGreaterThanOrEqual(4) // Start, Model, DocStoreTool, Agent, ExtraTool
        expect(graph.edges.length).toBeGreaterThanOrEqual(1) // Start -> Agent
    })

    it('tạo Start node phiên bản 1.4 và Agent node 3.2 chuẩn theo runtime', () => {
        const graph = instantiateKnowledgeTemplate(sampleKnowledgeSpec)

        const startNode = graph.nodes.find((n) => n.data.name === 'startAgentflow')
        expect(startNode).toBeDefined()
        expect(startNode?.data.version).toBe(1.4)
        expect(startNode?.data.inputs.startInputType).toBe('chatInput')

        const agentNode = graph.nodes.find((n) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        expect(agentNode?.data.version).toBe(3.2)
        expect(agentNode?.data.label).toBe('Trợ Lý Quy Chế Nội Bộ')
        expect(agentNode?.data.inputs.agentModel).toBe('chatOpenAI')

        const messages = agentNode?.data.inputs.agentMessages as any[]
        expect(messages[0].role).toBe('system')
        expect(messages[0].content).toContain('NGUYÊN TẮC HỎI ĐÁP THEO TÀI LIỆU')
        expect(messages[0].content).toContain('documentStoreTool')
        expect(messages[0].content).toContain('trích dẫn rõ nguồn gốc')
    })

    it('tạo DocumentStoreTool node với selectedStore được gán đúng từ dataSources', () => {
        const graph = instantiateKnowledgeTemplate(sampleKnowledgeSpec)

        const docTool = graph.nodes.find((n) => n.data.name === 'documentStoreTool')
        expect(docTool).toBeDefined()
        expect(docTool?.data.version).toBe(1.0)
        expect(docTool?.data.type).toBe('DocumentStoreTool')
        expect(docTool?.data.category).toBe('Tools')
        expect(docTool?.data.inputs.selectedStore).toBe('store_policy_2026')
        expect(docTool?.data.inputs.topK).toBe(4)
        expect(docTool?.data.inputs.returnSourceDocuments).toBe(true)

        // Kiểm tra Agent node có đăng ký documentStoreTool vào agentTools
        const agentNode = graph.nodes.find((n) => n.data.name === 'agentAgentflow')
        const agentTools = agentNode?.data.inputs.agentTools as any[]
        expect(agentTools.some((t) => t.agentSelectedTool === 'documentStoreTool')).toBe(true)
        expect(agentTools.some((t) => t.selectedStore === 'store_policy_2026')).toBe(true)
    })

    it('tạo Chat Model node với temperature 0.2 để giảm thiểu ảo giác (hallucination)', () => {
        const graph = instantiateKnowledgeTemplate(sampleKnowledgeSpec)

        const modelNode = graph.nodes.find((n) => n.data.name === 'chatOpenAI')
        expect(modelNode).toBeDefined()
        expect(modelNode?.data.version).toBe(5.0)
        expect(modelNode?.data.inputs.temperature).toBe(0.2)
    })

    it('tất cả các nodes đều vượt qua Node Registry allowlist validation', () => {
        const graph = instantiateKnowledgeTemplate(sampleKnowledgeSpec)

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

    it('toàn bộ đồ thị Knowledge Agentflow vượt qua flowValidator', () => {
        const graph = instantiateKnowledgeTemplate(sampleKnowledgeSpec)

        const flowResult = validateFlowGraph(graph)
        expect(flowResult.valid).toBe(true)
        expect(flowResult.errors).toHaveLength(0)
        expect(flowResult.nodeCount).toBe(graph.nodes.length)
        expect(flowResult.edgeCount).toBe(graph.edges.length)
    })
})
