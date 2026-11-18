jest.mock('flowise-components', () => ({}))
jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { StatusCodes } from 'http-status-codes'
import { BuilderSession } from '../../database/entities/BuilderSession'
import { BuilderMessage } from '../../database/entities/BuilderMessage'
import { AgentSpecRevision } from '../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../database/entities/AgentDraftRevision'
import { BuilderSessionService } from './sessionService'
import agentBuilderController from '../../controllers/agent-builder'
import sessionService from './sessionService'
import knowledgeStoreService from './knowledge/knowledgeStoreService'
import publishService from './pipeline/publishService'
import builderAuditService from './audit/builderAuditService'
import { Request, Response, NextFunction } from 'express'

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
            return items.map((i) => ({ ...i }))
        }),
        clear: () => store.clear()
    }
}

describe('BuilderSessionService & API Integration (B-004)', () => {
    let sessionMockRepo: ReturnType<typeof createMockRepository<BuilderSession>>
    let messageMockRepo: ReturnType<typeof createMockRepository<BuilderMessage>>
    let revisionMockRepo: ReturnType<typeof createMockRepository<AgentSpecRevision>>
    let draftRevisionMockRepo: ReturnType<typeof createMockRepository<AgentDraftRevision>>
    let mockDataSource: any
    let service: BuilderSessionService

    beforeEach(() => {
        sessionMockRepo = createMockRepository<BuilderSession>()
        messageMockRepo = createMockRepository<BuilderMessage>()
        revisionMockRepo = createMockRepository<AgentSpecRevision>()
        draftRevisionMockRepo = createMockRepository<AgentDraftRevision>()

        mockDataSource = {
            getRepository: jest.fn((entity: any) => {
                if (entity === BuilderSession) return sessionMockRepo
                if (entity === BuilderMessage) return messageMockRepo
                if (entity === AgentSpecRevision) return revisionMockRepo
                if (entity === AgentDraftRevision) return draftRevisionMockRepo
                throw new Error(`Unknown entity in test: ${entity}`)
            })
        }

        service = new BuilderSessionService(mockDataSource)
    })

    describe('createSession', () => {
        it('tạo session mới thành công với giá trị mặc định', async () => {
            const snapshot = await service.createSession({
                workspaceId: 'ws-123',
                organizationId: 'org-123',
                userId: 'user-1'
            })

            expect(snapshot.session).toBeDefined()
            expect(snapshot.session.id).toBeDefined()
            expect(snapshot.session.workspaceId).toBe('ws-123')
            expect(snapshot.session.title).toBe('Trợ lý mới')
            expect(snapshot.session.state).toBe('collecting')
            expect(snapshot.session.currentRevisionNo).toBe(0)
            expect(snapshot.messages).toHaveLength(0)
            expect(snapshot.currentSpecRevision).toBeNull()
        })

        it('tạo session có initialGoal tự tạo message, spec revision và hướng dẫn collector', async () => {
            const snapshot = await service.createSession({
                workspaceId: 'ws-123',
                organizationId: 'org-123',
                userId: 'user-1',
                initialGoal: 'Tạo trợ lý hỗ trợ onboarding nhân viên mới tiếng Việt'
            })

            expect(snapshot.session.currentRevisionNo).toBe(1)
            expect(snapshot.session.currentSpecRevisionId).toBeDefined()
            expect(snapshot.messages).toHaveLength(2)

            // Message 1: user
            expect(snapshot.messages[0].role).toBe('user')
            expect(snapshot.messages[0].content).toContain('onboarding')

            // Message 2: assistant
            expect(snapshot.messages[1].role).toBe('assistant')
            expect(snapshot.messages[1].content).toContain('Tên trợ lý')

            // Spec revision
            expect(snapshot.currentSpecRevision).toBeDefined()
            expect(snapshot.currentSpecRevision?.revisionNo).toBe(1)
            expect(snapshot.readiness?.missingFields).toContain('name')
            expect(snapshot.readiness?.missingFields).toContain('instructions')
        })

        it('từ chối khi thiếu workspaceId', async () => {
            await expect(
                service.createSession({
                    workspaceId: '',
                    organizationId: 'org-1',
                    userId: 'user-1'
                })
            ).rejects.toThrow('Workspace ID is required')
        })
    })

    describe('getSessionById & Cross-Workspace Isolation', () => {
        it('đọc snapshot phiên thành công khi đúng workspace', async () => {
            const created = await service.createSession({
                workspaceId: 'ws-alpha',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý tuyển dụng'
            })

            const fetched = await service.getSessionById(created.session.id, 'ws-alpha')
            expect(fetched.session.id).toBe(created.session.id)
            expect(fetched.session.title).toBe('Trợ lý tuyển dụng')
        })

        it('chặn truy cập chéo workspace (Negative Auth: 403 Forbidden)', async () => {
            const created = await service.createSession({
                workspaceId: 'ws-victim',
                organizationId: 'org-victim',
                userId: 'user-victim'
            })

            // User từ ws-attacker cố đọc session của ws-victim
            await expect(service.getSessionById(created.session.id, 'ws-attacker')).rejects.toThrow('Access denied: Workspace mismatch')
        })

        it('trả về 404 khi session không tồn tại', async () => {
            await expect(service.getSessionById('00000000-0000-0000-0000-000000000000', 'ws-1')).rejects.toThrow('not found')
        })
    })

    describe('addMessage (Idempotency & Revision Conflict)', () => {
        it('thêm tin nhắn mới thành công và nhận phản hồi từ assistant', async () => {
            const { session } = await service.createSession({
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })

            const response = await service.addMessage(session.id, 'ws-1', {
                clientMessageId: 'msg-client-001',
                content: 'Tôi muốn xây dựng trợ lý chăm sóc khách hàng',
                specPatch: {
                    name: 'Trợ lý CSKH',
                    goal: 'Hỗ trợ giải đáp thắc mắc khách hàng về đơn hàng'
                }
            })

            expect(response.userMessage.content).toBe('Tôi muốn xây dựng trợ lý chăm sóc khách hàng')
            expect(response.assistantMessage).toBeDefined()
            expect(response.session.currentRevisionNo).toBe(1)
            expect(response.currentSpecRevision?.revisionNo).toBe(1)
            expect(response.readiness?.missingFields).toContain('instructions')
        })

        it('idempotency: gửi lại cùng clientMessageId không tạo tin nhắn trùng', async () => {
            const { session } = await service.createSession({
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })

            // Gửi lần 1
            const res1 = await service.addMessage(session.id, 'ws-1', {
                clientMessageId: 'msg-idempotent-key',
                content: 'Tin nhắn gửi lần 1'
            })

            // Gửi lần 2 cùng clientMessageId (ví dụ client retry mạng)
            const res2 = await service.addMessage(session.id, 'ws-1', {
                clientMessageId: 'msg-idempotent-key',
                content: 'Tin nhắn gửi lại'
            })

            expect(res2.idempotentReplay).toBe(true)
            expect(res2.userMessage.id).toBe(res1.userMessage.id)

            // Xác minh trong DB chỉ có 1 tin nhắn user với key đó
            const allMessages = await messageMockRepo.find({
                where: { sessionId: session.id, clientMessageId: 'msg-idempotent-key' }
            })
            expect(allMessages).toHaveLength(1)
        })

        it('từ chối khi xảy ra xung đột revision (409 Conflict)', async () => {
            const { session } = await service.createSession({
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })

            // Cập nhật spec lên revision 1
            await service.addMessage(session.id, 'ws-1', {
                clientMessageId: 'msg-patch-1',
                content: 'Đặt tên trợ lý',
                specPatch: { name: 'Trợ lý Onboarding' }
            })

            // Gửi tin nhắn với expectedRevision cũ (revision 0)
            await expect(
                service.addMessage(session.id, 'ws-1', {
                    clientMessageId: 'msg-outdated',
                    content: 'Tôi muốn sửa thêm thông tin',
                    expectedRevision: 0 // Outdated! Current is 1
                })
            ).rejects.toThrow('Revision conflict')
        })

        it('chặn thêm message từ workspace khác (Negative Auth: 403 Forbidden)', async () => {
            const { session } = await service.createSession({
                workspaceId: 'ws-target',
                organizationId: 'org-1',
                userId: 'user-1'
            })

            await expect(
                service.addMessage(session.id, 'ws-intruder', {
                    clientMessageId: 'msg-hack',
                    content: 'Injected message'
                })
            ).rejects.toThrow('Access denied: Workspace mismatch')
        })

        it('cập nhật spec đầy đủ đạt buildReady: true và chuyển state sang ready', async () => {
            const { session } = await service.createSession({
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })

            const response = await service.addMessage(session.id, 'ws-1', {
                clientMessageId: 'msg-complete',
                content: 'Bổ sung đầy đủ thông tin trợ lý',
                specPatch: {
                    name: 'Trợ lý Onboarding tiếng Việt',
                    goal: 'Hướng dẫn nhân viên mới về văn hóa và nội quy công ty',
                    instructions: 'Giải thích từng bước chi tiết và chào mừng thân thiện'
                }
            })

            expect(response.readiness?.buildReady).toBe(true)
            expect(response.session.state).toBe('ready')
            expect(response.buildIntent).toBeDefined()
            expect(response.buildIntent?.status).toBe('dispatched')
            expect(response.session.buildIntent).toContain('"status":"dispatched"')
            expect(response.assistantMessage?.content).toContain('sẵn sàng (buildReady)')
            expect(response.assistantMessage?.content).toContain('"xong"')
            expect(response.buildResult).toBeUndefined()
        })

        it('chỉ kích hoạt autoBuild khi người dùng nhắn "xong", không tự build sớm và không tạo thêm revision rác', async () => {
            const executeBuild = jest.fn().mockResolvedValue({ success: true, flowId: 'flow-built-on-xong' })
            const customService = new BuilderSessionService(mockDataSource, undefined, { executeBuild } as any)
            const { session } = await customService.createSession({
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1',
                initialGoal: 'Tôi cần tạo bot hỗ trợ nhân viên mới'
            })

            const turn1 = await customService.addMessage(session.id, 'ws-1', {
                clientMessageId: 'turn-1-spec',
                content: 'Đặt tên là Trợ lý Nội bộ và hướng dẫn là luôn lịch sự, giải thích rõ ràng'
            })
            expect(turn1.readiness?.buildReady).toBe(true)
            expect(turn1.buildResult).toBeUndefined()
            expect(executeBuild).not.toHaveBeenCalled()

            const revBeforeXong = turn1.currentSpecRevision?.revisionNo
            const turn2 = await customService.addMessage(session.id, 'ws-1', {
                clientMessageId: 'turn-2-confirm',
                content: 'xong'
            })
            expect(executeBuild).toHaveBeenCalledTimes(1)
            expect(turn2.buildResult).toEqual({ success: true, flowId: 'flow-built-on-xong' })
            expect(turn2.currentSpecRevision?.revisionNo).toBe(revBeforeXong)
            expect(turn2.assistantMessage?.content).toContain('Đã nhận xác nhận **"xong"**')
        })

        it('tự động trích xuất patch tiếng Việt từ nội dung chat không cần specPatch (PH1-T09)', async () => {
            const { session } = await service.createSession({
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1',
                initialGoal: 'Trợ lý bán hàng'
            })

            const response = await service.addMessage(session.id, 'ws-1', {
                clientMessageId: 'auto-extract-1',
                content: 'Tôi muốn đặt tên là Trợ Lý Phụ Kiện và hướng dẫn là chào khách niềm nở, tư vấn tận tình.'
            })

            expect(response.currentSpecRevision).toBeDefined()
            const parsedSpec = JSON.parse(response.currentSpecRevision!.spec)
            expect(parsedSpec.name).toBe('Trợ Lý Phụ Kiện')
            expect(parsedSpec.instructions).toContain('chào khách niềm nở')
        })
    })

    describe('getRevisions', () => {
        it('lấy toàn bộ lịch sử revision theo thứ tự tăng dần', async () => {
            const { session } = await service.createSession({
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })

            await service.addMessage(session.id, 'ws-1', {
                clientMessageId: 'p1',
                content: 'Patch 1',
                specPatch: { name: 'V1' }
            })

            await service.addMessage(session.id, 'ws-1', {
                clientMessageId: 'p2',
                content: 'Patch 2',
                specPatch: { name: 'V2', goal: 'Goal 2' }
            })

            const revisions = await service.getRevisions(session.id, 'ws-1')
            expect(revisions).toHaveLength(2)
            expect(revisions[0].revisionNo).toBe(1)
            expect(revisions[1].revisionNo).toBe(2)
            expect(JSON.parse(revisions[1].spec).name).toBe('V2')
        })
    })

    describe('agentBuilderController HTTP Handlers', () => {
        const makeReq = (overrides: Partial<Request> = {}): Request =>
            ({
                body: {},
                params: {},
                query: {},
                user: {
                    activeWorkspaceId: 'ws-controller-test',
                    activeOrganizationId: 'org-controller-test',
                    id: 'user-controller-test'
                },
                ...overrides
            } as unknown as Request)

        const makeRes = () => {
            const res: any = {}
            res.status = jest.fn().mockReturnValue(res)
            res.json = jest.fn().mockReturnValue(res)
            return res as Response & { status: jest.Mock; json: jest.Mock }
        }

        const makeNext = (): NextFunction => jest.fn()

        beforeEach(() => {
            jest.spyOn(sessionService, 'createSession').mockResolvedValue({
                session: { id: 'sess-1' } as any,
                messages: [],
                currentSpecRevision: null,
                readiness: null
            })
            jest.spyOn(sessionService, 'getSessionById').mockResolvedValue({
                session: { id: 'sess-1' } as any,
                messages: [],
                currentSpecRevision: null,
                readiness: null
            })
            jest.spyOn(sessionService, 'addMessage').mockResolvedValue({
                userMessage: { id: 'msg-1' } as any,
                session: { id: 'sess-1' } as any,
                currentSpecRevision: null,
                readiness: null
            })
            jest.spyOn(sessionService, 'getRevisions').mockResolvedValue([])
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('createSession trả về HTTP 201 CREATED', async () => {
            const req = makeReq({ body: { title: 'Test Session' } })
            const res = makeRes()
            const next = makeNext()

            await agentBuilderController.createSession(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED)
            expect(res.json).toHaveBeenCalled()
        })

        it('getSessionById trả về HTTP 200 OK', async () => {
            const req = makeReq({ params: { id: 'sess-1' } })
            const res = makeRes()
            const next = makeNext()

            await agentBuilderController.getSessionById(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('addMessage trả về HTTP 200 OK', async () => {
            const req = makeReq({
                params: { id: 'sess-1' },
                body: {
                    clientMessageId: 'ctrl-msg-1',
                    content: 'Xin chào builder'
                }
            })
            const res = makeRes()
            const next = makeNext()

            await agentBuilderController.addMessage(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('getRevisions trả về HTTP 200 OK', async () => {
            const req = makeReq({ params: { id: 'sess-1' } })
            const res = makeRes()
            const next = makeNext()

            await agentBuilderController.getRevisions(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('subscribeEvents thiết lập SSE stream', async () => {
            const req = makeReq({ params: { id: 'sess-1' } })
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(sessionService, 'subscribeEvents').mockResolvedValue(undefined)

            await agentBuilderController.subscribeEvents(req, res, next)
            expect(sessionService.subscribeEvents).toHaveBeenCalledWith('sess-1', 'ws-controller-test', res)
        })

        it('rollbackRevision trả về HTTP 200 OK', async () => {
            const req = makeReq({
                params: { id: 'sess-1' },
                body: { revisionId: 'rev-target' }
            })
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(sessionService, 'rollbackRevision').mockResolvedValue({} as any)

            await agentBuilderController.rollbackRevision(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('getSpecDiff trả về HTTP 200 OK', async () => {
            const req = makeReq({
                params: { id: 'sess-1' },
                query: { rev1: 'rev-1', rev2: 'rev-2' }
            })
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(sessionService, 'getSpecDiff').mockResolvedValue({} as any)

            await agentBuilderController.getSpecDiff(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('listKnowledgeStores trả về HTTP 200 OK', async () => {
            const req = makeReq()
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(knowledgeStoreService, 'listWorkspaceStores').mockResolvedValue([] as any)

            await agentBuilderController.listKnowledgeStores(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('getKnowledgeStore trả về HTTP 200 OK', async () => {
            const req = makeReq({ params: { id: 'ks-1' } })
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(knowledgeStoreService, 'getStoreById').mockResolvedValue({ id: 'ks-1' } as any)

            await agentBuilderController.getKnowledgeStore(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('getKnowledgeStoreChunks trả về HTTP 200 OK', async () => {
            const req = makeReq({ params: { id: 'ks-1' }, query: { limit: '10' } })
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(knowledgeStoreService, 'getStoreChunks').mockResolvedValue([] as any)

            await agentBuilderController.getKnowledgeStoreChunks(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('seedKnowledgeStore trả về HTTP 201 CREATED', async () => {
            const req = makeReq()
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(knowledgeStoreService, 'seedSampleDocumentStore').mockResolvedValue({ id: 'ks-seeded' } as any)

            await agentBuilderController.seedKnowledgeStore(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED)
            expect(res.json).toHaveBeenCalled()
        })

        it('publishAgent trả về HTTP 200 OK (PH5-T01)', async () => {
            const req = makeReq({ params: { id: 'sess-1' }, body: { isPublic: true } })
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(publishService, 'publishAgent').mockResolvedValue({
                success: true,
                flowId: 'f1',
                flowName: 'Test Bot',
                deployed: true,
                isPublic: true,
                revisionNo: 1,
                publishedAt: new Date().toISOString(),
                message: 'Published'
            })

            await agentBuilderController.publishAgent(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('unpublishAgent trả về HTTP 200 OK (PH5-T01)', async () => {
            const req = makeReq({ params: { id: 'sess-1' } })
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(publishService, 'unpublishAgent').mockResolvedValue({
                success: true,
                flowId: 'f1',
                flowName: 'Test Bot',
                deployed: false,
                isPublic: false,
                message: 'Unpublished'
            })

            await agentBuilderController.unpublishAgent(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })

        it('getAuditLogs trả về HTTP 200 OK (PH5-T02)', async () => {
            const req = makeReq({ params: { id: 'sess-1' }, query: { limit: '20' } })
            const res = makeRes()
            const next = makeNext()
            jest.spyOn(builderAuditService, 'getSessionAuditLogs').mockResolvedValue([] as any)

            await agentBuilderController.getAuditLogs(req, res, next)
            expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
            expect(res.json).toHaveBeenCalled()
        })
    })

    describe('rollbackRevision (PH3-T05)', () => {
        it('tạo revision mới kế thừa cấu hình cũ và giữ nguyên lịch sử', async () => {
            const session = await sessionMockRepo.save({
                id: 'sess-rb-1',
                workspaceId: 'ws-123',
                organizationId: 'org-123',
                userId: 'user-1',
                title: 'Phiên Rollback',
                state: 'ready',
                currentRevisionNo: 2
            })

            const oldSpec = {
                name: 'Trợ Lý Ban Đầu',
                goal: 'Hỗ trợ kỹ thuật',
                instructions: 'Luôn trả lời ngắn gọn',
                tools: ['calculator']
            }

            const rev1 = await revisionMockRepo.save({
                id: 'rev-old-1',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify(oldSpec),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            const rev2 = await revisionMockRepo.save({
                id: 'rev-new-2',
                sessionId: session.id,
                revisionNo: 2,
                spec: JSON.stringify({ ...oldSpec, name: 'Trợ Lý Bản 2 Đã Đổi Tên' }),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            session.currentSpecRevisionId = rev2.id
            await sessionMockRepo.save(session)

            // Thực hiện khôi phục về rev1
            const snapshot = await service.rollbackRevision(session.id, 'ws-123', rev1.id)

            // Revision mới tạo phải có revisionNo = 3 (không làm mất lịch sử rev1 và rev2)
            expect(snapshot.currentSpecRevision).toBeDefined()
            expect(snapshot.currentSpecRevision?.revisionNo).toBe(3)
            expect(snapshot.currentSpecRevision?.reasonCodes).toContain('Khôi phục về phiên bản #1')

            const restoredSpec = JSON.parse(snapshot.currentSpecRevision!.spec)
            expect(restoredSpec.name).toBe('Trợ Lý Ban Đầu')

            // Đảm bảo có tin nhắn thông báo trong lịch sử
            const messages = await messageMockRepo.find({ where: { sessionId: session.id } })
            expect(messages.some((m) => m.content.includes('Đã khôi phục cấu hình'))).toBe(true)
        })

        it('từ chối khôi phục khi khác workspace (Negative Auth: 403 Forbidden)', async () => {
            const session = await sessionMockRepo.save({
                id: 'sess-rb-2',
                workspaceId: 'ws-team-alpha',
                organizationId: 'org-123',
                userId: 'user-1'
            })

            await expect(service.rollbackRevision(session.id, 'ws-team-beta', 'rev-any')).rejects.toThrow(
                'Access denied: Workspace mismatch'
            )
        })
    })

    describe('getSpecDiff (PH3-T05)', () => {
        it('so sánh diff chính xác giữa 2 revision trong phiên', async () => {
            const session = await sessionMockRepo.save({
                id: 'sess-diff-1',
                workspaceId: 'ws-123',
                organizationId: 'org-123',
                userId: 'user-1'
            })

            const rev1 = await revisionMockRepo.save({
                id: 'rev-diff-1',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify({ name: 'Trợ Lý Alpha', goal: 'Mục tiêu 1' }),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]'
            })

            const rev2 = await revisionMockRepo.save({
                id: 'rev-diff-2',
                sessionId: session.id,
                revisionNo: 2,
                spec: JSON.stringify({ name: 'Trợ Lý Beta', goal: 'Mục tiêu 2' }),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]'
            })

            const diff = await service.getSpecDiff(session.id, 'ws-123', rev1.id, rev2.id)
            expect(diff.hasChanges).toBe(true)
            expect(diff.name.from).toBe('Trợ Lý Alpha')
            expect(diff.name.to).toBe('Trợ Lý Beta')
        })
    })
})
