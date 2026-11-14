import { AgentSpec } from '../types'
import { createAgentPlan } from './agentPlan'
import compiler, { AgentflowCompiler } from './compiler'

describe('Deterministic AgentflowCompiler (PH2-T04 / B-008)', () => {
    const validSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ Lý Tư Vấn Tuyển Sinh',
        goal: 'Hỗ trợ học sinh và phụ huynh tìm hiểu ngành học và học phí',
        language: 'vi',
        instructions: 'Chào đón thân thiện, giải thích chi tiết các phương thức xét tuyển và học bổng.',
        outputExpectations: ['Ngắn gọn', 'Lịch sự', 'Rõ ràng'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [],
        tools: [
            { id: 't1', name: 'Máy tính điểm chuẩn', type: 'calculator' },
            { id: 't2', name: 'Tìm kiếm thông tin ngành', type: 'webSearch' }
        ],
        policy: {
            visibility: 'private',
            executionMode: 'controlled-test',
            allowWrite: false
        },
        evaluationExamples: [
            {
                input: 'Ngành CNTT lấy bao nhiêu điểm?',
                assertions: ['Điểm chuẩn từ 26.5 trở lên']
            }
        ]
    }

    it('biên dịch AgentPlan thành CompiledFlowGraph hoàn chỉnh', () => {
        const plan = createAgentPlan(validSpec, 'rev-001')
        const result = compiler.compile(plan)

        expect(result.templateId).toBe('assistant-flow-template')
        expect(result.templateVersion).toBe('1.0')
        expect(result.planId).toBe(plan.id)
        expect(result.flowConfig.chatflowType).toBe('AGENTFLOW')
        expect(result.flowConfig.name).toBe('Trợ Lý Tư Vấn Tuyển Sinh')

        // Start node (1.4)
        const startNode = result.nodes.find((n) => n.data.name === 'startAgentflow')
        expect(startNode).toBeDefined()
        expect(startNode?.data.version).toBe(1.4)

        // Agent node (3.2)
        const agentNode = result.nodes.find((n) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        expect(agentNode?.data.version).toBe(3.2)
        expect(agentNode?.data.inputs.agentModel).toBe('chatOpenAI')

        // Tool nodes
        expect(result.nodes.some((n) => n.data.name === 'calculator')).toBe(true)
        expect(result.nodes.some((n) => n.data.name === 'webSearch')).toBe(true)

        // Edges
        const startEdge = result.edges.find((e) => e.source === 'startAgentflow_0' && e.target === 'agentAgentflow_0')
        expect(startEdge).toBeDefined()
        expect(startEdge?.sourceHandle).toBe('startAgentflow_0-output-startAgentflow')
    })

    it('tính tất định (Deterministic): chạy 10 lần cùng input trả về cùng graph 100%', () => {
        const customCompiler = new AgentflowCompiler()
        const plan = createAgentPlan(validSpec, 'rev-stable')

        const firstRunJson = JSON.stringify(customCompiler.compile(plan))

        for (let i = 1; i < 10; i++) {
            const subsequentRunJson = JSON.stringify(customCompiler.compile(plan))
            expect(subsequentRunJson).toBe(firstRunJson)
        }
    })

    it('từ chối biên dịch khi AgentPlan không hợp lệ', () => {
        const invalidPlan: any = {
            id: 'plan_invalid',
            templateId: 'wrong_template',
            capabilityBindings: []
        }

        expect(() => compiler.compile(invalidPlan)).toThrow('AgentPlan không hợp lệ')
    })
})
