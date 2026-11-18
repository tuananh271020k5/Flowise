import { validateFlowGraph } from './flowValidator'
import compiler from './compiler'
import { createAgentPlan } from './agentPlan'
import { AgentSpec } from '../types'

describe('Server Flow Validator (PH2-T05 / B-009)', () => {
    const sampleSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ Lý Kiểm Tra Flow',
        goal: 'Kiểm tra tính hợp lệ của graph',
        language: 'vi',
        instructions: 'Luôn lịch sự và chính xác.',
        outputExpectations: ['Ngắn gọn'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [],
        tools: [{ id: 't1', name: 'Calculator', type: 'calculator' }],
        policy: { visibility: 'private', executionMode: 'controlled-test', allowWrite: false },
        evaluationExamples: [{ input: '1 + 1', assertions: ['2'] }]
    }

    it('chấp nhận đồ thị hợp lệ được sinh ra từ AgentflowCompiler', () => {
        const plan = createAgentPlan(sampleSpec, 'rev-val-1')
        const compiled = compiler.compile(plan)

        const result = validateFlowGraph(compiled)
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
        expect(result.nodeCount).toBe(2)
        expect(result.edgeCount).toBeGreaterThanOrEqual(1)
    })

    it('từ chối đồ thị rỗng (0 node)', () => {
        const result = validateFlowGraph({ nodes: [], edges: [] })
        expect(result.valid).toBe(false)
        expect(result.errors[0]).toContain('không được để rỗng')
    })

    it('từ chối đồ thị thiếu Start node', () => {
        const result = validateFlowGraph({
            nodes: [
                {
                    id: 'agent_1',
                    data: { name: 'agentAgentflow', version: 3.2, type: 'Agent', inputs: { agentModel: 'chatOpenAI' } }
                }
            ],
            edges: []
        })

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes('phải có 1 Start node'))).toBe(true)
    })

    it('từ chối đồ thị có nhiều hơn 1 Start node', () => {
        const result = validateFlowGraph({
            nodes: [
                {
                    id: 'start_1',
                    data: { name: 'startAgentflow', version: 1.4, type: 'Start', inputs: { startInputType: 'chatInput' } }
                },
                {
                    id: 'start_2',
                    data: { name: 'startAgentflow', version: 1.4, type: 'Start', inputs: { startInputType: 'chatInput' } }
                },
                {
                    id: 'agent_1',
                    data: { name: 'agentAgentflow', version: 3.2, type: 'Agent', inputs: { agentModel: 'chatOpenAI' } }
                }
            ],
            edges: [{ source: 'start_1', target: 'agent_1' }]
        })

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes('chỉ được phép có đúng 1 Start node'))).toBe(true)
    })

    it('từ chối đồ thị khi Start node bị mồ côi (không kết nối tới Agent)', () => {
        const result = validateFlowGraph({
            nodes: [
                {
                    id: 'start_1',
                    data: { name: 'startAgentflow', version: 1.4, type: 'Start', inputs: { startInputType: 'chatInput' } }
                },
                {
                    id: 'agent_1',
                    data: { name: 'agentAgentflow', version: 3.2, type: 'Agent', inputs: { agentModel: 'chatOpenAI' } }
                }
            ],
            edges: [] // Không có edge
        })

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes('chưa được kết nối tới bất kỳ node nào'))).toBe(true)
    })

    it('từ chối đồ thị có cạnh tham chiếu tới node không tồn tại', () => {
        const result = validateFlowGraph({
            nodes: [
                {
                    id: 'start_1',
                    data: { name: 'startAgentflow', version: 1.4, type: 'Start', inputs: { startInputType: 'chatInput' } }
                },
                {
                    id: 'agent_1',
                    data: { name: 'agentAgentflow', version: 3.2, type: 'Agent', inputs: { agentModel: 'chatOpenAI' } }
                }
            ],
            edges: [
                { source: 'start_1', target: 'agent_1' },
                { source: 'agent_1', target: 'ghost_node_nonexistent' }
            ]
        })

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes('trỏ tới target không tồn tại'))).toBe(true)
    })

    it('từ chối đồ thị có node không vượt qua Node Registry whitelist', () => {
        const result = validateFlowGraph({
            nodes: [
                {
                    id: 'start_1',
                    data: { name: 'startAgentflow', version: 1.4, type: 'Start', inputs: { startInputType: 'chatInput' } }
                },
                {
                    id: 'evil_node',
                    data: { name: 'unauthorizedCommandRunner', version: 1.0, type: 'Evil' }
                }
            ],
            edges: [{ source: 'start_1', target: 'evil_node' }]
        })

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes('không nằm trong danh mục whitelist'))).toBe(true)
    })
})
