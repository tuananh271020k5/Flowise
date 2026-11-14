import { validateAgentSpec } from './schema'
import { computeReadiness } from './readiness'
import { AgentSpec } from './types'

describe('AgentSpec v1 & Readiness Service (B-003)', () => {
    const validOnboardingSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ lý Onboarding tiếng Việt',
        goal: 'Hướng dẫn nhân viên mới về văn hóa, quy định và thiết bị trong ngày đầu đi làm',
        language: 'vi',
        instructions: 'Chào đón thân thiện, giải thích rõ ràng từng bước theo checklist ngày đầu tiên',
        outputExpectations: ['Danh sách các bước thực hiện tuần tự', 'Lời chúc ngày đầu đi làm'],
        modelProfileRef: 'default-builder-model',
        dataSources: [],
        tools: [],
        policy: {
            visibility: 'private',
            executionMode: 'controlled-test',
            allowWrite: false
        },
        evaluationExamples: [
            {
                input: 'Chào bạn, ngày đầu tiên đi làm tôi cần chuẩn bị gì và gặp ai?',
                assertions: ['Trả lời bằng tiếng Việt', 'Liệt kê gặp lễ tân/HR và nhận máy tính']
            }
        ]
    }

    describe('validateAgentSpec', () => {
        it('chấp nhận AgentSpec v1 hợp lệ đầy đủ với tiếng Việt có dấu chuẩn', () => {
            const result = validateAgentSpec(validOnboardingSpec)
            expect(result.success).toBe(true)
            expect(result.data).toBeDefined()
            expect(result.data?.name).toBe('Trợ lý Onboarding tiếng Việt')
            expect(result.data?.policy.visibility).toBe('private')
            expect(result.data?.policy.allowWrite).toBe(false)
        })

        it('từ chối khi thiếu trường bắt buộc (ví dụ thiếu instructions)', () => {
            const { instructions: _instructions, ...incomplete } = validOnboardingSpec
            const result = validateAgentSpec(incomplete)
            expect(result.success).toBe(false)
            expect(result.errors).toBeDefined()
            expect(result.errors?.some((e) => e.includes('instructions'))).toBe(true)
        })

        it('từ chối schemaVersion không phải 1.0', () => {
            const invalidVersion = { ...validOnboardingSpec, schemaVersion: '2.0' }
            const result = validateAgentSpec(invalidVersion)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('schemaVersion'))).toBe(true)
        })

        it('từ chối khi goal quá ngắn (< 5 ký tự)', () => {
            const shortGoal = { ...validOnboardingSpec, goal: 'Alo' }
            const result = validateAgentSpec(shortGoal)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('goal'))).toBe(true)
        })

        it('từ chối khi name vượt quá 100 ký tự', () => {
            const longName = { ...validOnboardingSpec, name: 'A'.repeat(101) }
            const result = validateAgentSpec(longName)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('name'))).toBe(true)
        })

        it('từ chối khi goal vượt quá 1000 ký tự', () => {
            const longGoal = { ...validOnboardingSpec, goal: 'G'.repeat(1001) }
            const result = validateAgentSpec(longGoal)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('goal'))).toBe(true)
        })

        it('từ chối khi instructions vượt quá 4000 ký tự', () => {
            const longInstructions = { ...validOnboardingSpec, instructions: 'I'.repeat(4001) }
            const result = validateAgentSpec(longInstructions)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('instructions'))).toBe(true)
        })

        it('từ chối khi spec chứa trường lạ không xác định (chống bypass auth/tenant)', () => {
            const injectedSpec = { ...validOnboardingSpec, tenantId: 'tenant-evil-123' }
            const result = validateAgentSpec(injectedSpec)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('unrecognized_keys') || e.includes('tenantId'))).toBe(true)
        })

        it('từ chối khi spec chứa API key bí mật trong instructions hoặc goal', () => {
            const secretSpec = {
                ...validOnboardingSpec,
                instructions: 'Dùng khóa này sk-1234567890abcdef1234567890abcdef để gọi API'
            }
            const result = validateAgentSpec(secretSpec)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('credential'))).toBe(true)
        })

        it('từ chối khi modelProfileRef chứa API key bí mật thay vì ref name logic', () => {
            const secretModelSpec = {
                ...validOnboardingSpec,
                modelProfileRef: 'sk-abcdef1234567890abcdef1234567890'
            }
            const result = validateAgentSpec(secretModelSpec)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('modelProfileRef'))).toBe(true)
        })

        it('từ chối khi spec chứa thẻ script độc hại (XSS prevention)', () => {
            const scriptSpec = {
                ...validOnboardingSpec,
                name: '<script>alert("hack")</script>'
            }
            const result = validateAgentSpec(scriptSpec)
            expect(result.success).toBe(false)
            expect(result.errors?.some((e) => e.includes('mã script không an toàn'))).toBe(true)
        })

        it('chấp nhận spec có tools và dataSources hợp lệ', () => {
            const specWithTools = {
                ...validOnboardingSpec,
                tools: [{ id: 'tool-1', name: 'Calculator', type: 'calculator' }],
                dataSources: [{ id: 'ds-1', type: 'file', name: 'handbook.pdf' }]
            }
            const result = validateAgentSpec(specWithTools)
            expect(result.success).toBe(true)
            expect(result.data?.tools.length).toBe(1)
            expect(result.data?.dataSources.length).toBe(1)
        })
    })

    describe('computeReadiness', () => {
        it('trả về buildReady: true và testReady: true cho spec hoàn chỉnh có test examples', () => {
            const readiness = computeReadiness(validOnboardingSpec)
            expect(readiness.specReady).toBe(true)
            expect(readiness.buildReady).toBe(true)
            expect(readiness.testReady).toBe(true)
            expect(readiness.missingFields).toEqual([])
            expect(readiness.reasonCodes).toContain('READY_FOR_BUILD')
            expect(readiness.reasonCodes).toContain('READY_FOR_TEST')
        })

        it('trả về buildReady: true nhưng testReady: false khi chưa có evaluationExamples', () => {
            const specNoTests = { ...validOnboardingSpec, evaluationExamples: [] }
            const readiness = computeReadiness(specNoTests)
            expect(readiness.specReady).toBe(true)
            expect(readiness.buildReady).toBe(true)
            expect(readiness.testReady).toBe(false)
            expect(readiness.missingFields).toEqual([])
            expect(readiness.reasonCodes).toContain('NO_EVALUATION_EXAMPLES')
        })

        it('xử lý spec rỗng hoặc không phải object', () => {
            const readiness = computeReadiness(null)
            expect(readiness.specReady).toBe(false)
            expect(readiness.buildReady).toBe(false)
            expect(readiness.testReady).toBe(false)
            expect(readiness.missingFields).toEqual(['name', 'goal', 'instructions'])
            expect(readiness.reasonCodes).toContain('EMPTY_SPEC')
        })

        it('xử lý spec chứa chuỗi toàn khoảng trắng', () => {
            const whitespaceSpec = {
                name: '   ',
                goal: '   ',
                instructions: '    '
            }
            const readiness = computeReadiness(whitespaceSpec)
            expect(readiness.buildReady).toBe(false)
            expect(readiness.missingFields).toContain('name')
            expect(readiness.missingFields).toContain('goal')
            expect(readiness.missingFields).toContain('instructions')
        })

        it('nhận diện đúng các trường còn thiếu trong cuộc hội thoại khởi đầu (chỉ mới có goal)', () => {
            const partialTurn1 = {
                goal: 'Tạo trợ lý hướng dẫn nhân viên mới hòa nhập công ty'
            }
            const readiness = computeReadiness(partialTurn1)
            expect(readiness.buildReady).toBe(false)
            expect(readiness.missingFields).toContain('name')
            expect(readiness.missingFields).toContain('instructions')
            expect(readiness.missingFields).not.toContain('goal')
            expect(readiness.reasonCodes).toContain('MISSING_REQUIRED_FIELDS')
            expect(readiness.assumptions.length).toBeGreaterThan(0)
            expect(readiness.assumptions.some((a) => a.includes('tiếng Việt'))).toBe(true)
        })

        it('phát hiện và từ chối trường injection lạ trong computeReadiness', () => {
            const dirtySpec = {
                name: 'Trợ lý Test',
                goal: 'Hướng dẫn nhân viên mới',
                instructions: 'Chi tiết từng bước',
                maliciousPayload: 'DROP TABLE users;'
            }
            const readiness = computeReadiness(dirtySpec)
            expect(readiness.specReady).toBe(false)
            expect(readiness.buildReady).toBe(false)
            expect(readiness.reasonCodes).toContain('UNKNOWN_FIELDS')
            expect(readiness.errors?.some((e) => e.includes('maliciousPayload'))).toBe(true)
        })

        it('phát hiện token/secret trong computeReadiness', () => {
            const secretSpec = {
                name: 'Trợ lý Test',
                goal: 'Hướng dẫn nhân viên mới',
                instructions: 'Khóa kết nối: sk-abcdefghijklmnopqrstuvwxyz123456'
            }
            const readiness = computeReadiness(secretSpec)
            expect(readiness.specReady).toBe(false)
            expect(readiness.buildReady).toBe(false)
            expect(readiness.reasonCodes).toContain('SECRET_DETECTED')
        })

        it('phát hiện evaluation example không hợp lệ (ví dụ assertions rỗng)', () => {
            const invalidTestSpec = {
                ...validOnboardingSpec,
                evaluationExamples: [{ input: 'Câu hỏi test', assertions: [] }]
            }
            const readiness = computeReadiness(invalidTestSpec)
            expect(readiness.testReady).toBe(false)
            expect(readiness.reasonCodes).toContain('INVALID_EVALUATION_EXAMPLES')
        })

        it('tính toán deterministic: chạy 10 lần cùng input trả về cùng kết quả', () => {
            const results = Array.from({ length: 10 }, () => computeReadiness(validOnboardingSpec))
            const first = JSON.stringify(results[0])
            for (let i = 1; i < results.length; i++) {
                expect(JSON.stringify(results[i])).toBe(first)
            }
        })

        it('Knowledge Agent: từ chối buildReady khi thiếu dataSources (PH4-T04 / B-017)', () => {
            const knowledgeNoSource = {
                kind: 'knowledge',
                name: 'Trợ lý Quy chế',
                goal: 'Hỗ trợ tra cứu quy chế nội bộ',
                instructions: 'Giải đáp theo quy định công ty.',
                dataSources: []
            }
            const readiness = computeReadiness(knowledgeNoSource)
            expect(readiness.buildReady).toBe(false)
            expect(readiness.missingFields).toContain('dataSources')
            expect(readiness.reasonCodes).toContain('MISSING_KNOWLEDGE_STORE')
            expect(readiness.reasonCodes).toContain('KNOWLEDGE_CITATION_ASSUMED')
        })

        it('Knowledge Agent: từ chối buildReady khi dataSources chứa phần tử không hợp lệ', () => {
            const knowledgeInvalidSource = {
                kind: 'knowledge',
                name: 'Trợ lý Quy chế',
                goal: 'Hỗ trợ tra cứu quy chế nội bộ',
                instructions: 'Giải đáp theo quy định công ty.',
                dataSources: [{ id: '', name: '  ' }]
            }
            const readiness = computeReadiness(knowledgeInvalidSource)
            expect(readiness.buildReady).toBe(false)
            expect(readiness.missingFields).toContain('dataSources')
            expect(readiness.reasonCodes).toContain('INVALID_DATA_SOURCE')
        })

        it('Knowledge Agent: đạt buildReady: true khi có đủ name, goal, instructions và dataSources hợp lệ', () => {
            const validKnowledgeSpec = {
                schemaVersion: '1.0',
                kind: 'knowledge',
                name: 'Trợ lý Quy chế',
                goal: 'Hỗ trợ tra cứu quy chế nội bộ',
                language: 'vi',
                instructions: 'Giải đáp theo quy định công ty và trích dẫn điều khoản.',
                modelProfileRef: 'chatOpenAI',
                dataSources: [
                    {
                        id: 'store_company_policy_01',
                        name: 'Quy chế làm việc nội bộ',
                        type: 'documentStore'
                    }
                ],
                tools: [],
                outputExpectations: ['Trích dẫn nguồn'],
                policy: {
                    visibility: 'private',
                    executionMode: 'controlled-test',
                    allowWrite: false
                }
            }
            const readiness = computeReadiness(validKnowledgeSpec)
            expect(readiness.specReady).toBe(true)
            expect(readiness.buildReady).toBe(true)
            expect(readiness.missingFields).toHaveLength(0)
            expect(readiness.assumptions.some((a) => a.includes('trích dẫn nguồn tài liệu'))).toBe(true)
            expect(readiness.reasonCodes).toContain('KNOWLEDGE_CITATION_ASSUMED')
            expect(readiness.reasonCodes).toContain('READY_FOR_BUILD')
        })
    })
})
