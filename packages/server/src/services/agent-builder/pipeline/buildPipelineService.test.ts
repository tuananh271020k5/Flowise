jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { StatusCodes } from 'http-status-codes'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { ChatFlow, EnumChatflowType } from '../../../database/entities/ChatFlow'
import { BuildPipelineService } from './buildPipelineService'
import { AgentSpec } from '../types'
import collectorService from '../collectorService'

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

describe('BuildPipelineService & Idempotency (PH2-T08)', () => {
    let mockSessionRepo: ReturnType<typeof createMockRepository<BuilderSession>>
    let mockRevisionRepo: ReturnType<typeof createMockRepository<AgentSpecRevision>>
    let mockDraftRevisionRepo: ReturnType<typeof createMockRepository<AgentDraftRevision>>
    let mockChatflowRepo: ReturnType<typeof createMockRepository<ChatFlow>>
    let mockDataSource: any
    let pipelineService: BuildPipelineService

    const readySpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ lý Bán Hàng Máy Tính',
        goal: 'Tư vấn cấu hình máy tính cho khách hàng',
        language: 'vi',
        instructions: 'Chào hỏi lịch sự, báo giá linh kiện chuẩn xác.',
        outputExpectations: ['Rõ ràng'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [],
        tools: [{ id: 't1', name: 'Calculator', type: 'calculator' }],
        policy: { visibility: 'private', executionMode: 'controlled-test', allowWrite: false },
        evaluationExamples: [{ input: 'Giá màn hình?', assertions: ['Màn hình'] }]
    }

    beforeEach(() => {
        mockSessionRepo = createMockRepository<BuilderSession>()
        mockRevisionRepo = createMockRepository<AgentSpecRevision>()
        mockDraftRevisionRepo = createMockRepository<AgentDraftRevision>()
        mockChatflowRepo = createMockRepository<ChatFlow>()

        mockDataSource = {
            getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === BuilderSession) return mockSessionRepo
                if (entity === AgentSpecRevision) return mockRevisionRepo
                if (entity === AgentDraftRevision) return mockDraftRevisionRepo
                if (entity === ChatFlow) return mockChatflowRepo
                throw new Error(`Unexpected entity ${entity?.name}`)
            })
        }

        pipelineService = new BuildPipelineService(mockDataSource)
        jest.spyOn(collectorService, 'broadcastSSE').mockImplementation(jest.fn())
    })

    describe('Xác thực Session & Quyền Workspace', () => {
        it('từ chối khi thiếu sessionId hoặc workspaceId', async () => {
            await expect(pipelineService.executeBuild({ sessionId: '', workspaceId: 'ws-1' })).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST
            })
            await expect(pipelineService.executeBuild({ sessionId: 's-1', workspaceId: '' })).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST
            })
        })

        it('từ chối khi session không tồn tại (404)', async () => {
            await expect(pipelineService.executeBuild({ sessionId: 's-not-found', workspaceId: 'ws-1' })).rejects.toMatchObject({
                statusCode: StatusCodes.NOT_FOUND
            })
        })

        it('từ chối khi session thuộc workspace khác (Negative Auth: 403 Forbidden)', async () => {
            const session = await mockSessionRepo.save({
                id: 'sess-1',
                workspaceId: 'ws-alpha',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý mới',
                state: 'collecting',
                currentRevisionNo: 1
            })

            await expect(pipelineService.executeBuild({ sessionId: session.id, workspaceId: 'ws-other' })).rejects.toMatchObject({
                statusCode: StatusCodes.FORBIDDEN
            })
        })
    })

    describe('Kiểm tra Tính sẵn sàng (Readiness check)', () => {
        it('từ chối khi session chưa có bản đặc tả nào', async () => {
            const session = await mockSessionRepo.save({
                id: 'sess-2',
                workspaceId: 'ws-alpha',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý mới',
                state: 'collecting',
                currentRevisionNo: 0
            })

            await expect(pipelineService.executeBuild({ sessionId: session.id, workspaceId: 'ws-alpha' })).rejects.toMatchObject({
                statusCode: StatusCodes.NOT_FOUND
            })
        })

        it('từ chối khi bản đặc tả chưa sẵn sàng để biên dịch (buildReady: false)', async () => {
            const session = await mockSessionRepo.save({
                id: 'sess-3',
                workspaceId: 'ws-alpha',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý mới',
                state: 'collecting',
                currentRevisionNo: 1
            })

            await mockRevisionRepo.save({
                id: 'rev-incomplete',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify({ name: 'Chưa đủ thông tin' }),
                assumptions: '[]',
                missingFields: JSON.stringify(['goal', 'instructions']),
                reasonCodes: '[]',
                specReady: false,
                buildReady: false,
                testReady: false
            })

            await expect(pipelineService.executeBuild({ sessionId: session.id, workspaceId: 'ws-alpha' })).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST,
                message: expect.stringContaining('chưa sẵn sàng để biên dịch')
            })
        })
    })

    describe('Thực thi Build Pipeline & Idempotency', () => {
        it('biên dịch và tạo ChatFlow draft thành công khi spec đạt buildReady: true', async () => {
            const session = await mockSessionRepo.save({
                id: 'sess-4',
                workspaceId: 'ws-alpha',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý mới',
                state: 'collecting',
                currentRevisionNo: 1
            })

            const revision = await mockRevisionRepo.save({
                id: 'rev-ready-1',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify(readySpec),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            const result = await pipelineService.executeBuild({
                sessionId: session.id,
                workspaceId: 'ws-alpha',
                specRevisionId: revision.id
            })

            expect(result.success).toBe(true)
            expect(result.isExisting).toBe(false)
            expect(result.flowId).toBeDefined()
            expect(result.draftRevisionId).toBeDefined()
            expect(result.buildKey).toBe(`${session.id}:${revision.id}`)
            expect(result.flowName).toBe('Trợ lý Bán Hàng Máy Tính')

            // Kiểm tra ChatFlow record trong mock DB
            const createdFlow = await mockChatflowRepo.findOneBy({ id: result.flowId })
            expect(createdFlow).toBeDefined()
            expect(createdFlow!.type).toBe(EnumChatflowType.AGENTFLOW)
            expect(createdFlow!.deployed).toBe(false)
            expect(createdFlow!.isPublic).toBe(false)
            expect(createdFlow!.workspaceId).toBe('ws-alpha')

            // Kiểm tra AgentDraftRevision record
            const draftRev = await mockDraftRevisionRepo.findOneBy({ id: result.draftRevisionId })
            expect(draftRev).toBeDefined()
            expect(draftRev!.sessionId).toBe(session.id)
            expect(draftRev!.specRevisionId).toBe(revision.id)
            expect(draftRev!.flowId).toBe(result.flowId)

            // Kiểm tra Session cập nhật
            const updatedSession = await mockSessionRepo.findOneBy({ id: session.id })
            expect(updatedSession).toBeDefined()
            expect(updatedSession!.state).toBe('ready')
            expect(updatedSession!.title).toBe('Trợ lý Bán Hàng Máy Tính')

            // Kiểm tra SSE event phát ra
            expect(collectorService.broadcastSSE).toHaveBeenCalledWith(
                session.id,
                expect.objectContaining({
                    type: 'build_completed',
                    data: expect.objectContaining({
                        flowId: result.flowId,
                        flowName: 'Trợ lý Bán Hàng Máy Tính'
                    })
                })
            )
        })

        it('Idempotency: gọi lại build cùng key không tạo ChatFlow hay DraftRevision mới', async () => {
            const session = await mockSessionRepo.save({
                id: 'sess-5',
                workspaceId: 'ws-alpha',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý mới',
                state: 'collecting',
                currentRevisionNo: 1
            })

            const revision = await mockRevisionRepo.save({
                id: 'rev-ready-2',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify(readySpec),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            // Lần build đầu tiên
            const firstResult = await pipelineService.executeBuild({
                sessionId: session.id,
                workspaceId: 'ws-alpha',
                specRevisionId: revision.id
            })
            expect(firstResult.isExisting).toBe(false)

            const totalFlowsAfterFirst = (await mockChatflowRepo.find()).length
            const totalDraftsAfterFirst = (await mockDraftRevisionRepo.find()).length

            // Lần build thứ 2 với cùng tham số
            const secondResult = await pipelineService.executeBuild({
                sessionId: session.id,
                workspaceId: 'ws-alpha',
                specRevisionId: revision.id
            })

            expect(secondResult.success).toBe(true)
            expect(secondResult.isExisting).toBe(true)
            expect(secondResult.flowId).toBe(firstResult.flowId)
            expect(secondResult.draftRevisionId).toBe(firstResult.draftRevisionId)
            expect(secondResult.buildKey).toBe(firstResult.buildKey)

            // Số lượng record không đổi (không duplicate)
            const totalFlowsAfterSecond = (await mockChatflowRepo.find()).length
            const totalDraftsAfterSecond = (await mockDraftRevisionRepo.find()).length
            expect(totalFlowsAfterSecond).toBe(totalFlowsAfterFirst)
            expect(totalDraftsAfterSecond).toBe(totalDraftsAfterFirst)
        })

        it('cập nhật bản draft hiện có khi cùng session có revision tiếp theo', async () => {
            const session = await mockSessionRepo.save({
                id: 'sess-6',
                workspaceId: 'ws-alpha',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý mới',
                state: 'collecting',
                currentRevisionNo: 2
            })

            const rev1 = await mockRevisionRepo.save({
                id: 'rev-1',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify(readySpec),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            // Build revision 1
            const result1 = await pipelineService.executeBuild({
                sessionId: session.id,
                workspaceId: 'ws-alpha',
                specRevisionId: rev1.id
            })

            // Tạo revision 2 với tên mới
            const updatedSpec = { ...readySpec, name: 'Trợ lý Nâng Cấp v2' }
            const rev2 = await mockRevisionRepo.save({
                id: 'rev-2',
                sessionId: session.id,
                revisionNo: 2,
                spec: JSON.stringify(updatedSpec),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            // Build revision 2
            const result2 = await pipelineService.executeBuild({
                sessionId: session.id,
                workspaceId: 'ws-alpha',
                specRevisionId: rev2.id
            })

            // Tái sử dụng cùng một ChatFlow ID để update graph mới
            expect(result2.flowId).toBe(result1.flowId)
            expect(result2.flowName).toBe('Trợ lý Nâng Cấp v2')

            // Tạo mapping mới cho rev2
            expect(result2.draftRevisionId).not.toBe(result1.draftRevisionId)
            expect(result2.buildKey).toBe(`${session.id}:${rev2.id}`)
        })

        it('đọc lịch sử draft revisions qua getDraftHistory', async () => {
            const session = await mockSessionRepo.save({
                id: 'sess-7',
                workspaceId: 'ws-alpha',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý mới',
                state: 'ready',
                currentRevisionNo: 1
            })

            await mockDraftRevisionRepo.save({
                sessionId: session.id,
                specRevisionId: 'rev-1',
                buildKey: `${session.id}:rev-1`,
                flowId: 'flow-1',
                planId: 'plan-1',
                templateId: 'assistant-v1',
                templateVersion: '1.0'
            })

            const history = await pipelineService.getDraftHistory(session.id, 'ws-alpha')
            expect(history).toHaveLength(1)
            expect(history[0].buildKey).toBe(`${session.id}:rev-1`)
        })
    })
})
