import { AgentSpec } from '../types'
import { createAgentPlan, validateAgentPlan, calculatePlanHash } from './agentPlan'
import { ASSISTANT_TEMPLATE_ID, ASSISTANT_TEMPLATE_VERSION } from './templates/assistantTemplate.v1'

describe('AgentPlan & Validation (PH2-T03 / B-008)', () => {
    const validSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ Lý CSKH Phụ Kiện',
        goal: 'Tư vấn sản phẩm và giải đáp chính sách bảo hành',
        language: 'vi',
        instructions: 'Luôn lịch sự, niềm nở, chỉ trả lời thông tin trong phạm vi cửa hàng phụ kiện.',
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
                input: 'Bảo hành bao lâu?',
                assertions: ['12 tháng chính hãng']
            }
        ]
    }

    describe('createAgentPlan', () => {
        it('ánh xạ đúng capabilities và metadata từ AgentSpec', () => {
            const plan = createAgentPlan(validSpec, 'rev-101')

            expect(plan.id).toBeDefined()
            expect(plan.specRevisionId).toBe('rev-101')
            expect(plan.templateId).toBe(ASSISTANT_TEMPLATE_ID)
            expect(plan.templateVersion).toBe(ASSISTANT_TEMPLATE_VERSION)
            expect(plan.capabilityBindings).toHaveLength(3) // 1 model + 2 tools

            const modelBinding = plan.capabilityBindings.find((c) => c.type === 'model')
            expect(modelBinding?.nodeName).toBe('chatOpenAI')

            const toolBindings = plan.capabilityBindings.filter((c) => c.type === 'tool')
            expect(toolBindings).toHaveLength(2)
            expect(toolBindings.map((t) => t.nodeName)).toContain('calculator')
            expect(toolBindings.map((t) => t.nodeName)).toContain('webSearch')
        })

        it('tính toán plan hash ổn định (deterministic)', () => {
            const hash1 = calculatePlanHash(validSpec, 'rev-1')
            const hash2 = calculatePlanHash(validSpec, 'rev-1')
            expect(hash1).toBe(hash2)
        })
    })

    describe('validateAgentPlan', () => {
        it('chấp nhận AgentPlan hợp lệ với đầy đủ capabilities chuẩn', () => {
            const plan = createAgentPlan(validSpec, 'rev-1')
            const result = validateAgentPlan(plan)

            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
        })

        it('từ chối plan khi spec chưa đạt buildReady: true', () => {
            const incompleteSpec = {
                ...validSpec,
                name: '' // Thiếu tên
            }
            const plan = createAgentPlan(incompleteSpec as any, 'rev-incomplete')
            const result = validateAgentPlan(plan)

            expect(result.valid).toBe(false)
            expect(result.errors.some((e) => e.includes('buildReady'))).toBe(true)
        })

        it('từ chối plan có templateId không khớp', () => {
            const plan = createAgentPlan(validSpec, 'rev-1')
            plan.templateId = 'unsupported-legacy-template'

            const result = validateAgentPlan(plan)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('không được hỗ trợ')
        })

        it('từ chối plan chứa capability trỏ tới node không thuộc whitelist', () => {
            const plan = createAgentPlan(validSpec, 'rev-1')
            plan.capabilityBindings.push({
                capabilityId: 'cap_hack',
                nodeName: 'maliciousShellExecutor',
                nodeVersion: 1.0,
                type: 'tool'
            })

            const result = validateAgentPlan(plan)
            expect(result.valid).toBe(false)
            expect(result.errors.some((e) => e.includes('không nằm trong whitelist'))).toBe(true)
        })

        it('từ chối plan khi phát hiện code injection trong capability config', () => {
            const plan = createAgentPlan(validSpec, 'rev-1')
            plan.capabilityBindings[0].config = {
                script: '<script>alert("hack")</script>'
            }

            const result = validateAgentPlan(plan)
            expect(result.valid).toBe(false)
            expect(result.errors.some((e) => e.includes('chứa tham số nguy hiểm'))).toBe(true)
        })

        it('Knowledge Agent Plan: ánh xạ templateId knowledge và datasource binding (PH4-T03 / B-017)', () => {
            const knowledgeSpec: AgentSpec = {
                schemaVersion: '1.0',
                kind: 'knowledge',
                name: 'Trợ Lý Quy Chế Nội Bộ',
                goal: 'Tra cứu quy định và chính sách công ty',
                language: 'vi',
                instructions: 'Giải đáp theo quy chế và trích dẫn điều khoản.',
                outputExpectations: ['Trích dẫn nguồn'],
                modelProfileRef: 'chatOpenAI',
                dataSources: [
                    {
                        id: 'store_company_policy_01',
                        name: 'Quy chế làm việc nội bộ',
                        type: 'documentStore'
                    }
                ],
                tools: [],
                policy: {
                    visibility: 'private',
                    executionMode: 'controlled-test',
                    allowWrite: false
                },
                evaluationExamples: [
                    {
                        input: 'Nghỉ phép năm được bao nhiêu ngày?',
                        assertions: ['12 ngày phép năm']
                    }
                ]
            }

            const plan = createAgentPlan(knowledgeSpec, 'rev-k1')
            expect(plan.templateId).toBe('knowledge-flow-template')
            expect(plan.expectedChecks).toContain('knowledgeStoreReady')
            expect(plan.expectedChecks).toContain('retrievalConfigured')

            const dsBinding = plan.capabilityBindings.find((c) => c.type === 'datasource')
            expect(dsBinding).toBeDefined()
            expect(dsBinding?.nodeName).toBe('documentStoreTool')
            expect(dsBinding?.config?.selectedStore).toBe('store_company_policy_01')

            const result = validateAgentPlan(plan)
            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
        })
    })
})
