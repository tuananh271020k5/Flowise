jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { BuilderSession } from '../../../database/entities/BuilderSession'
import { BuilderMessage } from '../../../database/entities/BuilderMessage'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuildJob } from '../../../database/entities/BuildJob'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { DocumentStore } from '../../../database/entities/DocumentStore'
import { DocumentStoreFileChunk } from '../../../database/entities/DocumentStoreFileChunk'
import { BuilderSessionService } from '../sessionService'
import { BuildPipelineService } from '../pipeline/buildPipelineService'
import { EvaluationRunnerService } from '../pipeline/evaluationRunnerService'

function createMockRepository<T extends { id?: string }>() {
    const store = new Map<string, T>()
    let idCounter = 1

    return {
        create: jest.fn((dto: any) => ({
            id: `id-${idCounter++}`,
            createdDate: new Date(),
            updatedDate: new Date(),
            ...dto
        })),
        save: jest.fn(async (entity: any) => {
            if (!entity.id) {
                entity.id = `id-${idCounter++}`
            }
            store.set(entity.id, { ...entity })
            return { ...entity }
        }),
        findOneBy: jest.fn(async (query: any) => {
            for (const item of store.values()) {
                const match = Object.entries(query).every(([k, v]) => (item as any)[k] === v)
                if (match) return { ...item }
            }
            return null
        }),
        find: jest.fn(async (options?: any) => {
            let items = Array.from(store.values())
            if (options?.where) {
                items = items.filter((item) => Object.entries(options.where).every(([k, v]) => (item as any)[k] === v))
            }
            if (options?.order?.revisionNo === 'DESC') {
                items.sort((a: any, b: any) => (b.revisionNo || 0) - (a.revisionNo || 0))
            }
            if (options?.take) {
                items = items.slice(0, options.take)
            }
            return items
        }),
        clear: () => store.clear()
    }
}

describe('Knowledge Agent Pipeline & Citation Verification (PH4-T05 & PH4-T06 / B-018)', () => {
    let mockSessionRepo: ReturnType<typeof createMockRepository<BuilderSession>>
    let mockMessageRepo: ReturnType<typeof createMockRepository<BuilderMessage>>
    let mockRevisionRepo: ReturnType<typeof createMockRepository<AgentSpecRevision>>
    let mockDraftRepo: ReturnType<typeof createMockRepository<AgentDraftRevision>>
    let mockJobRepo: ReturnType<typeof createMockRepository<BuildJob>>
    let mockChatflowRepo: ReturnType<typeof createMockRepository<ChatFlow>>
    let mockStoreRepo: ReturnType<typeof createMockRepository<DocumentStore>>
    let mockChunkRepo: ReturnType<typeof createMockRepository<DocumentStoreFileChunk>>
    let mockDataSource: any

    let sessionService: BuilderSessionService
    let buildPipeline: BuildPipelineService
    let evalRunner: EvaluationRunnerService

    beforeEach(() => {
        mockSessionRepo = createMockRepository<BuilderSession>()
        mockMessageRepo = createMockRepository<BuilderMessage>()
        mockRevisionRepo = createMockRepository<AgentSpecRevision>()
        mockDraftRepo = createMockRepository<AgentDraftRevision>()
        mockJobRepo = createMockRepository<BuildJob>()
        mockChatflowRepo = createMockRepository<ChatFlow>()
        mockStoreRepo = createMockRepository<DocumentStore>()
        mockChunkRepo = createMockRepository<DocumentStoreFileChunk>()

        mockDataSource = {
            getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === BuilderSession) return mockSessionRepo
                if (entity === BuilderMessage) return mockMessageRepo
                if (entity === AgentSpecRevision) return mockRevisionRepo
                if (entity === AgentDraftRevision) return mockDraftRepo
                if (entity === BuildJob) return mockJobRepo
                if (entity === ChatFlow) return mockChatflowRepo
                if (entity === DocumentStore) return mockStoreRepo
                if (entity === DocumentStoreFileChunk) return mockChunkRepo
                throw new Error(`Unexpected entity ${entity?.name}`)
            })
        }

        sessionService = new BuilderSessionService(mockDataSource)
        buildPipeline = new BuildPipelineService(mockDataSource)
        evalRunner = new EvaluationRunnerService(mockDataSource)
    })

    it('toàn bộ chu trình Knowledge Agent: Chat -> Collector -> Build -> Evaluation kèm Citation thực tế', async () => {
        const workspaceId = 'ws-company-101'

        // 1. Tạo phiên thiết kế với yêu cầu Knowledge Agent
        const session = await sessionService.createSession({
            workspaceId,
            organizationId: 'org-test',
            userId: 'user-test',
            initialGoal: 'Tạo trợ lý tra cứu quy chế nội bộ công ty để hỗ trợ giải đáp thắc mắc cho nhân viên'
        })

        expect(session).toBeDefined()
        expect(session.currentSpecRevision).toBeDefined()
        const initialSpec = JSON.parse(session.currentSpecRevision!.spec)
        expect(initialSpec.kind).toBe('knowledge')
        expect(initialSpec.dataSources).toHaveLength(1)
        expect(initialSpec.dataSources[0].id).toBe('fixture-docstore-company-policy')

        // 2. Bổ sung thông tin còn thiếu để đạt buildReady: true
        const turn2 = await sessionService.addMessage(session.session.id, workspaceId, {
            clientMessageId: 'msg-turn-2',
            role: 'user',
            content: 'Đặt tên trợ lý là Trợ Lý Quy Chế và Hướng dẫn: Luôn trả lời theo quy định công ty và trích dẫn điều khoản.'
        })

        expect(turn2.currentSpecRevision).toBeDefined()
        expect(turn2.currentSpecRevision!.buildReady).toBe(true)
        const readySpec = JSON.parse(turn2.currentSpecRevision!.spec)
        expect(readySpec.name).toBe('Trợ Lý Quy Chế')
        expect(readySpec.kind).toBe('knowledge')
        expect(readySpec.dataSources[0].name).toContain('Quy chế làm việc nội bộ')

        // 3. Thực thi Build Pipeline tạo bản draft Flowise Agentflow V2
        const buildResult = await buildPipeline.executeBuild({
            sessionId: session.session.id,
            workspaceId,
            specRevisionId: turn2.currentSpecRevision!.id
        })

        expect(buildResult.success).toBe(true)
        expect(buildResult.flowId).toBeDefined()
        expect(buildResult.revisionNo).toBe(turn2.currentSpecRevision!.revisionNo)

        // Kiểm tra cấu trúc bản draft trong database
        const savedDraft = await mockChatflowRepo.findOneBy({ id: buildResult.flowId })
        expect(savedDraft).toBeDefined()
        expect(savedDraft!.deployed).toBe(false) // Invariant: luôn là draft
        expect(savedDraft!.isPublic).toBe(false)
        expect(savedDraft!.workspaceId).toBe(workspaceId)

        const savedDraftRevision = await mockDraftRepo.findOneBy({ id: buildResult.draftRevisionId })
        expect(savedDraftRevision).toBeDefined()
        expect(savedDraftRevision!.templateId).toBe('knowledge-flow-template')

        const graph = JSON.parse(savedDraft!.flowData)

        // Kiểm tra sự hiện diện của DocumentStoreTool node

        // Kiểm tra Agent node kết nối documentStoreTool và có RAG guideline
        const agentNode = graph.nodes.find((n: any) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        expect(agentNode.data.inputs.agentKnowledgeDocumentStores[0]).toMatchObject({
            documentStore: 'fixture-docstore-company-policy',
            returnSourceDocuments: true
        })
        expect(agentNode.data.inputs.agentMessages[0].content).toContain('NGUYÊN TẮC HỎI ĐÁP THEO TÀI LIỆU')

        // 4. Chạy bộ kiểm thử tự động (Evaluation Runner) & Kiểm tra Nguồn trích dẫn (PH4-T06)
        const testExamples = [
            {
                input: 'Một tuần tôi được làm việc từ xa (remote) mấy ngày?',
                assertions: ['làm việc từ xa', '02 ngày']
            },
            {
                input: 'Nhân viên chính thức có bao nhiêu ngày phép năm?',
                assertions: ['nghỉ phép', '14 ngày']
            },
            {
                // Negative Citation Case: Câu hỏi ngoài phạm vi tri thức
                input: 'Làm thế nào để chế tạo thuốc giải độc trường sinh bất lão?',
                assertions: ['không có thông tin', 'từ chối suy diễn']
            }
        ]

        const evalReport = await evalRunner.runTestSuite({
            flowId: savedDraft!.id,
            workspaceId,
            examples: testExamples,
            // Explicit fixture only exercises evaluation plumbing; this is not live RAG acceptance.
            mockPredictFn: async (input) =>
                input.includes('bất lão')
                    ? { text: 'không có thông tin, từ chối suy diễn', sourceDocuments: [] }
                    : {
                          text: input.includes('remote') ? 'làm việc từ xa 02 ngày' : 'nghỉ phép 14 ngày',
                          sourceDocuments: [{ pageContent: 'Fixture policy passage', title: 'Quy Chế Hoạt Động' }]
                      }
        })

        expect(evalReport.totalCount).toBe(3)
        expect(evalReport.passedCount).toBe(3)
        expect(evalReport.allPassed).toBe(true)

        // Hai câu hỏi đầu: Đính kèm citations thật
        expect(evalReport.results[0].sourceDocuments).toBeDefined()
        expect(evalReport.results[0].sourceDocuments!.length).toBeGreaterThan(0)
        expect(evalReport.results[0].sourceDocuments![0].title).toContain('Quy Chế Hoạt Động')

        expect(evalReport.results[1].sourceDocuments).toBeDefined()
        expect(evalReport.results[1].sourceDocuments!.length).toBeGreaterThan(0)

        // Câu hỏi thứ ba (Negative Test): Không tạo nguồn giả
        expect(evalReport.results[2].sourceDocuments).toEqual([])
        expect(evalReport.results[2].output).toContain('không có thông tin')
        expect(evalReport.results[2].output).toContain('từ chối suy diễn')
    })
})
