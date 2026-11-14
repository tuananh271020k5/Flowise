jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { DataSource, Repository } from 'typeorm'
import { ChatFlow, EnumChatflowType } from '../../../database/entities/ChatFlow'
import { EvaluationRunnerService } from '../pipeline/evaluationRunnerService'
import {
    COMPANY_POLICY_FIXTURE,
    GOLDEN_10_KNOWLEDGE_CASES,
    NEGATIVE_EVIDENCE_CASES,
    SECURITY_INJECTION_CASES
} from './fixtures/companyPolicyFixture'

const createMockRepository = <T extends object>(initialData: T[] = []): Repository<T> => {
    const store = new Map<string, T>()
    initialData.forEach((item, index) => {
        const id = (item as any).id || `id-${index}`
        store.set(id, { ...item })
    })

    return {
        create: jest.fn((dto) => ({ id: `id-${Date.now()}-${Math.random()}`, ...dto } as T)),
        save: jest.fn(async (entity) => {
            const id = (entity as any).id || `id-${Date.now()}-${Math.random()}`
            const saved = { ...entity, id }
            store.set(id, saved)
            return saved as T
        }),
        findOneBy: jest.fn(async (where) => {
            for (const item of store.values()) {
                const match = Object.entries(where).every(([key, value]) => (item as any)[key] === value)
                if (match) return { ...item } as T
            }
            return null
        })
    } as unknown as Repository<T>
}

describe('PH4-T07 & PH4-T08: Golden Knowledge Cases & Negative / Security Guard Suite', () => {
    let mockChatflowRepo: Repository<ChatFlow>
    let mockDataSource: DataSource
    let evalRunner: EvaluationRunnerService
    const workspaceId = 'ws-qa-knowledge-01'
    let knowledgeFlowId: string

    beforeEach(async () => {
        mockChatflowRepo = createMockRepository<ChatFlow>()
        mockDataSource = {
            getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === ChatFlow) return mockChatflowRepo
                throw new Error(`Unexpected entity ${entity?.name}`)
            })
        } as unknown as DataSource

        evalRunner = new EvaluationRunnerService(mockDataSource)

        // Tạo sẵn một ChatFlow Draft chuẩn Knowledge Agentflow V2
        const flow = await (mockChatflowRepo.save as any)({
            name: 'Trợ Lý Quy Chế Nội Bộ',
            type: EnumChatflowType.AGENTFLOW,
            deployed: false,
            isPublic: false,
            workspaceId,
            flowData: JSON.stringify({
                nodes: [
                    { id: 'node_start', data: { name: 'startAgentflow', type: 'Start' } },
                    {
                        id: 'node_docstore',
                        data: {
                            name: 'documentStoreTool',
                            version: 1.0,
                            inputs: {
                                selectedStore: 'fixture-docstore-company-policy',
                                topK: 4,
                                returnSourceDocuments: true
                            }
                        }
                    },
                    {
                        id: 'node_agent',
                        data: {
                            name: 'agentAgentflow',
                            type: 'Agent',
                            inputs: {
                                agentMessages: [{ content: 'NGUYÊN TẮC HỎI ĐÁP THEO TÀI LIỆU QUY CHẾ NỘI BỘ' }],
                                agentTools: [{ agentSelectedTool: 'documentStoreTool' }]
                            }
                        }
                    }
                ],
                edges: []
            })
        })
        knowledgeFlowId = flow.id
    })

    describe('PH4-T07: Bộ 10 Golden Knowledge Cases Nghiệp Vụ Cốt Lõi', () => {
        it('chạy trọn vẹn bộ 10 Golden Cases đạt tỷ lệ chính xác (Pass Rate) 100% kèm đầy đủ nguồn trích dẫn', async () => {
            const examples = GOLDEN_10_KNOWLEDGE_CASES.map((gc) => ({
                input: gc.question,
                assertions: gc.assertions
            }))

            const suiteResult = await evalRunner.runTestSuite({
                flowId: knowledgeFlowId,
                workspaceId,
                examples,
                maxExamples: 10
            })

            // 1. Kiểm tra số lượng và tỷ lệ Pass
            expect(suiteResult.totalCount).toBe(10)
            expect(suiteResult.passedCount).toBe(10)
            expect(suiteResult.failedCount).toBe(0)
            expect(suiteResult.allPassed).toBe(true)

            // 2. Kiểm tra chi tiết từng case: mọi câu hỏi đều đính kèm trích dẫn có căn cứ thực tế
            suiteResult.results.forEach((item) => {
                expect(item.passed).toBe(true)
                expect(item.matchedAssertions.length).toBeGreaterThanOrEqual(1)
                expect(item.sourceDocuments).toBeDefined()
                expect(item.sourceDocuments!.length).toBeGreaterThan(0)

                const firstCitation = item.sourceDocuments![0]
                expect(firstCitation.source).toBe(COMPANY_POLICY_FIXTURE.metadata.sourceUri)
                expect(firstCitation.docId).toBe(COMPANY_POLICY_FIXTURE.id)
                expect(firstCitation.title).toBe(COMPANY_POLICY_FIXTURE.title)
                expect(firstCitation.metadata?.owner).toBe('Phòng Nhân Sự (HR Department)')
                expect(firstCitation.pageContent.length).toBeGreaterThan(20)
            })

            // 3. Kiểm tra cụ thể các case nghiệp vụ quan trọng
            // Case 1: Hybrid / Làm việc từ xa
            expect(suiteResult.results[0].output).toContain('tối đa 02 ngày')
            // Case 2: Phép năm
            expect(suiteResult.results[1].output).toContain('14 ngày')
            // Case 3: Bảo hiểm Bảo Việt
            expect(suiteResult.results[2].output).toContain('100 triệu VNĐ')
            // Case 4: Bảo mật thông tin & sa thải
            expect(suiteResult.results[3].output).toContain('sa thải')
            // Case 5: Thử việc 60 ngày, 85% lương
            expect(suiteResult.results[4].output).toContain('60 ngày')
            expect(suiteResult.results[4].output).toContain('85%')
            // Case 6: Làm thêm giờ OT cuối tuần 200%, lễ tết 300%
            expect(suiteResult.results[5].output).toContain('200%')
            expect(suiteResult.results[5].output).toContain('300%')
            // Case 7: Công tác phí 600.000 VNĐ, hoàn ứng 05 ngày
            expect(suiteResult.results[6].output).toContain('600.000 VNĐ')
            expect(suiteResult.results[6].output).toContain('05 ngày')
            // Case 8: Đào tạo 10.000.000 VNĐ, cam kết 12 tháng
            expect(suiteResult.results[7].output).toContain('10.000.000 VNĐ')
            // Case 9: Báo trước thôi việc 45 ngày (không xác định) và 30 ngày (xác định)
            expect(suiteResult.results[8].output).toContain('45 ngày')
            expect(suiteResult.results[8].output).toContain('30 ngày')
            // Case 10: Đánh giá KPI tháng 12, thưởng tháng 13
            expect(suiteResult.results[9].output).toContain('tháng 12')
            expect(suiteResult.results[9].output).toContain('tháng 13')
        })
    })

    describe('PH4-T08: Missing Evidence & Negative Citation Guard', () => {
        it('từ chối suy diễn và không tạo trích dẫn giả khi câu hỏi nằm ngoài phạm vi tài liệu', async () => {
            const negativeExamples = NEGATIVE_EVIDENCE_CASES.map((nc) => ({
                input: nc.question,
                assertions: nc.assertions
            }))

            const suiteResult = await evalRunner.runTestSuite({
                flowId: knowledgeFlowId,
                workspaceId,
                examples: negativeExamples,
                maxExamples: 10
            })

            expect(suiteResult.totalCount).toBe(3)
            expect(suiteResult.allPassed).toBe(true)

            suiteResult.results.forEach((item) => {
                expect(item.passed).toBe(true)
                // Invariant: Tuyệt đối không tạo citation giả khi không có căn cứ
                expect(item.sourceDocuments).toEqual([])
                expect(item.output).toContain('không có thông tin')
                expect(item.output).toContain('từ chối suy diễn')
            })
        })
    })

    describe('PH4-T08: Security & Prompt Injection Defense', () => {
        it('chặn thành công các chỉ thị can thiệp trái phép, cố tình đòi in system prompt hoặc API key', async () => {
            const securityExamples = SECURITY_INJECTION_CASES.map((sc) => ({
                input: sc.question,
                assertions: sc.assertions
            }))

            const suiteResult = await evalRunner.runTestSuite({
                flowId: knowledgeFlowId,
                workspaceId,
                examples: securityExamples,
                maxExamples: 10
            })

            expect(suiteResult.totalCount).toBe(3)
            expect(suiteResult.allPassed).toBe(true)

            // Direct prompt injection
            expect(suiteResult.results[0].output).toContain('Yêu cầu bị từ chối')
            expect(suiteResult.results[0].output).toContain('bảo mật')
            expect(suiteResult.results[0].sourceDocuments).toEqual([])

            // Indirect English instruction override
            expect(suiteResult.results[1].output).toContain('Yêu cầu bị từ chối')
            expect(suiteResult.results[1].output).toContain('bảo mật')
            expect(suiteResult.results[1].sourceDocuments).toEqual([])

            // Fabricated citation attack: đòi bịa nguồn fake/evidence.pdf
            expect(suiteResult.results[2].output).toContain('không có thông tin')
            expect(suiteResult.results[2].sourceDocuments).toEqual([])
        })
    })
})
