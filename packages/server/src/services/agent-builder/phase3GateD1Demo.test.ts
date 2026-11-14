jest.mock('flowise-components', () => ({}))
jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { BuilderSession } from '../../database/entities/BuilderSession'
import { BuilderMessage } from '../../database/entities/BuilderMessage'
import { AgentSpecRevision } from '../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../database/entities/AgentDraftRevision'
import { BuildJob } from '../../database/entities/BuildJob'
import { ChatFlow, EnumChatflowType } from '../../database/entities/ChatFlow'
import { BuilderSessionService } from './sessionService'
import { BuildPipelineService } from './pipeline/buildPipelineService'
import { EvaluationRunnerService } from './pipeline/evaluationRunnerService'
import { AgentSpec } from './types'

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
            if (!entity.createdDate) {
                entity.createdDate = new Date()
            }
            entity.updatedDate = new Date()
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
        find: jest.fn(async (opts?: any) => {
            let items = Array.from(store.values())
            if (opts?.where) {
                items = items.filter((item) => Object.entries(opts.where).every(([k, v]) => (item as any)[k] === v))
            }
            if (opts?.order) {
                const [orderKey, orderDir] = Object.entries(opts.order)[0] as [string, string]
                items.sort((a, b) => {
                    const valA = (a as any)[orderKey]
                    const valB = (b as any)[orderKey]
                    return orderDir === 'ASC' ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1
                })
            }
            if (opts?.take) {
                items = items.slice(0, opts.take)
            }
            return items.map((i) => ({ ...i }))
        }),
        clear: () => store.clear()
    }
}

describe('PH3-T08 / Gate D1 Nghiệm Thu Toàn Diện Ba Kịch Bản', () => {
    let sessionRepo: ReturnType<typeof createMockRepository<BuilderSession>>
    let messageRepo: ReturnType<typeof createMockRepository<BuilderMessage>>
    let revisionRepo: ReturnType<typeof createMockRepository<AgentSpecRevision>>
    let draftRevisionRepo: ReturnType<typeof createMockRepository<AgentDraftRevision>>
    let jobRepo: ReturnType<typeof createMockRepository<BuildJob>>
    let chatflowRepo: ReturnType<typeof createMockRepository<ChatFlow>>
    let mockDataSource: any

    let sessionService: BuilderSessionService
    let buildPipelineService: BuildPipelineService
    let evaluationRunner: EvaluationRunnerService

    const workspaceId = 'ws-d1-demo'
    const orgId = 'org-d1-demo'
    const userId = 'user-d1-tester'

    beforeEach(() => {
        sessionRepo = createMockRepository<BuilderSession>()
        messageRepo = createMockRepository<BuilderMessage>()
        revisionRepo = createMockRepository<AgentSpecRevision>()
        draftRevisionRepo = createMockRepository<AgentDraftRevision>()
        jobRepo = createMockRepository<BuildJob>()
        chatflowRepo = createMockRepository<ChatFlow>()

        mockDataSource = {
            getRepository: jest.fn((entity: any) => {
                if (entity === BuilderSession) return sessionRepo
                if (entity === BuilderMessage) return messageRepo
                if (entity === AgentSpecRevision) return revisionRepo
                if (entity === AgentDraftRevision) return draftRevisionRepo
                if (entity === BuildJob) return jobRepo
                if (entity === ChatFlow) return chatflowRepo
                throw new Error(`Unknown entity in test: ${entity}`)
            })
        }

        buildPipelineService = new BuildPipelineService(mockDataSource)
        sessionService = new BuilderSessionService(mockDataSource, undefined, buildPipelineService)
        evaluationRunner = new EvaluationRunnerService(mockDataSource)
    })

    // =========================================================================
    // KỊCH BẢN 1: Tạo Agent bằng Chat tiếng Việt và Tự động Biên dịch (End-to-End)
    // =========================================================================
    describe('Kịch bản 1: Tạo Agent qua chat tiếng Việt → Thu thập yêu cầu → Tự động Build', () => {
        it('tạo phiên, đàm thoại thu thập đủ trường và biên dịch Agentflow V2 Draft', async () => {
            // 1.1. Người dùng khởi tạo phiên với yêu cầu ban đầu
            const snapshot = await sessionService.createSession({
                workspaceId,
                organizationId: orgId,
                userId,
                title: 'Trợ lý Bán Hàng Thời Trang',
                initialGoal: 'Tôi muốn tạo một trợ lý bán hàng thời trang cho shop quần áo'
            })

            const sessionId = snapshot.session.id
            expect(sessionId).toBeDefined()
            expect(snapshot.session.workspaceId).toBe(workspaceId)

            // 1.2. Người dùng gửi tin nhắn bổ sung thông tin với patch đặc tả hoàn chỉnh
            const completeSpecPatch: Partial<AgentSpec> = {
                name: 'Trợ Lý Thời Trang Xinh',
                goal: 'Tư vấn phối đồ và hỗ trợ đặt hàng thời trang',
                instructions: 'Luôn lịch sự, thân thiện, hỏi chiều cao cân nặng để tư vấn size phù hợp',
                tools: [
                    { id: 'tool-calc', name: 'calculator', type: 'calculator' },
                    { id: 'tool-search', name: 'webSearch', type: 'search' }
                ],
                evaluationExamples: [
                    { input: 'Shop có áo sơ mi trắng không?', assertions: ['áo sơ mi', 'size'] },
                    { input: 'Tư vấn size cho người 1m60 nặng 50kg', assertions: ['size M', 'vừa'] }
                ]
            }

            const messageRes = await sessionService.addMessage(sessionId, workspaceId, {
                content: 'Tên là Trợ Lý Thời Trang Xinh, dùng công cụ tính toán và tìm kiếm, tư vấn phối đồ và hỗ trợ đặt hàng',
                clientMessageId: 'msg-k1-complete',
                specPatch: completeSpecPatch
            })

            expect(messageRes.currentSpecRevision).toBeDefined()
            expect(messageRes.readiness?.buildReady).toBe(true)

            // 1.3. Biên dịch Spec sang Flowise Agentflow V2 Draft
            const buildRes = await buildPipelineService.executeBuild({
                sessionId,
                workspaceId,
                specRevisionId: messageRes.currentSpecRevision!.id
            })

            expect(buildRes.success).toBe(true)
            expect(buildRes.flowId).toBeDefined()
            expect(buildRes.flowName).toBe('Trợ Lý Thời Trang Xinh')

            // Kiểm tra tính bất biến bảo mật của Flowise ChatFlow entity
            const savedChatflow = await chatflowRepo.findOneBy({ id: buildRes.flowId })
            expect(savedChatflow).toBeDefined()
            expect(savedChatflow?.deployed).toBe(false)
            expect(savedChatflow?.isPublic).toBe(false)
            expect(savedChatflow?.type).toBe(EnumChatflowType.AGENTFLOW)

            // Đồ thị lưu trữ có Start node và Agent node
            const parsedData = JSON.parse(savedChatflow!.flowData)
            const nodeNames = parsedData.nodes.map((n: any) => n.data.name)
            expect(nodeNames).toContain('startAgentflow')
            expect(nodeNames).toContain('agentAgentflow')
        })
    })

    // =========================================================================
    // KỊCH BẢN 2: Chat Thử Nghiệm Có Kiểm Soát & So Khớp Assertions
    // =========================================================================
    describe('Kịch bản 2: Chat thử nghiệm prediction & Chạy Batch Evaluation Runner', () => {
        it('so khớp assertions chính xác và chạy batch evaluation bảo vệ budget', async () => {
            // 2.1. Kiểm tra so khớp assertion đơn lẻ
            const singleCheck = evaluationRunner.checkAssertions(
                'Dạ shop có nhiều mẫu áo sơ mi trắng kiểu dáng Hàn Quốc, bạn mặc size M là vừa đẹp ạ.',
                ['áo sơ mi', 'size']
            )
            expect(singleCheck.passed).toBe(true)
            expect(singleCheck.matched).toHaveLength(2)

            // 2.2. Tạo ChatFlow draft giả lập trong DB
            const mockFlow = await chatflowRepo.save({
                id: 'flow-k2-test',
                name: 'Trợ Lý Test Chat',
                workspaceId,
                deployed: false,
                isPublic: false,
                type: EnumChatflowType.AGENTFLOW,
                flowData: JSON.stringify({ nodes: [], edges: [] })
            })

            // 2.3. Chạy batch evaluation runner có kiểm soát ngân sách
            const batchResult = await evaluationRunner.runTestSuite({
                flowId: mockFlow.id,
                workspaceId,
                examples: [
                    { input: 'Shop có áo sơ mi trắng không?', assertions: ['áo sơ mi', 'size'] },
                    { input: 'Tư vấn size cho tôi', assertions: ['size'] },
                    { input: 'Chính sách đổi trả', assertions: ['đổi trả trong 7 ngày'] }
                ],
                maxExamples: 2 // Giới hạn ngân sách tối đa 2 kịch bản
            })

            expect(batchResult.flowId).toBe(mockFlow.id)
            expect(batchResult.totalCount).toBe(2) // Đã cắt bớt theo maxExamples
            expect(batchResult.results).toHaveLength(2)
            expect(batchResult.passedCount).toBeGreaterThanOrEqual(0)
            expect(batchResult.executionTimeMs).toBeGreaterThanOrEqual(0)
        })
    })

    // =========================================================================
    // KỊCH BẢN 3: Sửa Agent qua Chat, Diff, Rollback & Quản Lý Vòng Đời Build
    // =========================================================================
    describe('Kịch bản 3: Sửa đổi Agent bằng chat, Diff, Rollback và Guards', () => {
        it('thực hiện toàn bộ chu trình sửa, diff, rollback và đảm bảo không ghi đè draft khi bị hủy', async () => {
            // 3.1. Tạo phiên làm việc có bản đặc tả ban đầu
            const initialSpec: AgentSpec = {
                schemaVersion: '1.0',
                kind: 'assistant',
                name: 'Trợ Lý Bản 1',
                goal: 'Hỗ trợ tư vấn bán hàng cơ bản',
                language: 'vi',
                instructions: 'Trả lời ngắn gọn và lịch sự',
                outputExpectations: ['Câu trả lời chuẩn xác'],
                modelProfileRef: 'gpt-4o-mini',
                dataSources: [],
                tools: [{ id: 't1', name: 'calculator', type: 'calculator' }],
                policy: { visibility: 'private', executionMode: 'standard', allowWrite: false },
                evaluationExamples: [{ input: 'Xin chào', assertions: ['chào'] }]
            }

            const session = await sessionRepo.save({
                id: 'sess-k3-lifecycle',
                workspaceId,
                organizationId: orgId,
                userId,
                title: 'Trợ Lý Bản 1',
                state: 'ready',
                currentRevisionNo: 1
            })

            const rev1 = await revisionRepo.save({
                id: 'rev-k3-1',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify(initialSpec),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })
            session.currentSpecRevisionId = rev1.id
            await sessionRepo.save(session)

            // Build bản draft cho revision 1
            const build1 = await buildPipelineService.executeBuild({
                sessionId: session.id,
                workspaceId,
                specRevisionId: rev1.id
            })
            expect(build1.success).toBe(true)

            // 3.2. Người dùng sửa đổi qua chat (PH3-T04)
            const updatedSpecPatch: Partial<AgentSpec> = {
                name: 'Trợ Lý VIP Nâng Cấp',
                instructions: 'Trả lời chi tiết, tặng voucher cho khách hàng thân thiết, không nhắc đến đối thủ',
                tools: [
                    { id: 't1', name: 'calculator', type: 'calculator' },
                    { id: 't2', name: 'webSearch', type: 'search' }
                ]
            }

            const editRes = await sessionService.addMessage(session.id, workspaceId, {
                content: 'Hãy nâng cấp thành Trợ Lý VIP Nâng Cấp và thêm công cụ tìm kiếm',
                clientMessageId: 'msg-k3-edit',
                specPatch: updatedSpecPatch
            })

            const rev2 = editRes.currentSpecRevision!
            expect(rev2.revisionNo).toBe(2)

            // 3.3. So sánh Diff giữa Revision 1 và Revision 2 (PH3-T05)
            const diff = await sessionService.getSpecDiff(session.id, workspaceId, rev1.id, rev2.id)
            expect(diff.hasChanges).toBe(true)
            expect(diff.name.from).toBe('Trợ Lý Bản 1')
            expect(diff.name.to).toBe('Trợ Lý VIP Nâng Cấp')
            expect(diff.tools.added).toContain('webSearch')
            expect(diff.summary.some((s) => s.includes('Đổi tên trợ lý'))).toBe(true)
            expect(diff.summary.some((s) => s.includes('Thêm 1 công cụ'))).toBe(true)

            // 3.4. Khôi phục (Rollback) về Revision 1 (PH3-T05)
            const rollbackSnapshot = await sessionService.rollbackRevision(session.id, workspaceId, rev1.id)
            const rev3 = rollbackSnapshot.currentSpecRevision!
            expect(rev3.revisionNo).toBe(3) // Không xóa lịch sử, tạo revision 3 mới
            expect(rev3.reasonCodes).toContain('Khôi phục về phiên bản #1')

            const restoredSpec = JSON.parse(rev3.spec)
            expect(restoredSpec.name).toBe('Trợ Lý Bản 1')

            // 3.5. Kiểm tra Superseded Guard (PH3-T06)
            // Tạo revision 4 cũ chưa từng build
            const rev4Old = await revisionRepo.save({
                id: 'rev-k3-4-old',
                sessionId: session.id,
                revisionNo: 4,
                spec: JSON.stringify({ ...initialSpec, name: 'Bản Cũ Rev 4' }),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            // Trong lúc rev4 chưa kịp build, người dùng đã cập nhật sang revision 5
            await revisionRepo.save({
                id: 'rev-k3-5-new',
                sessionId: session.id,
                revisionNo: 5,
                spec: JSON.stringify({ ...initialSpec, name: 'Bản Mới Rev 5' }),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            // Khi rev4 được kích hoạt build, hệ thống phát hiện có rev5 mới hơn -> Supersede Guard hủy và discard
            const supersededBuild = await buildPipelineService.executeBuild({
                sessionId: session.id,
                workspaceId,
                specRevisionId: rev4Old.id
            })
            expect(supersededBuild.cancelled).toBe(true)
            expect(supersededBuild.success).toBe(false)
            expect(supersededBuild.message).toContain('superseded')
        })
    })
})
