jest.mock('flowise-components', () => ({}))
// Unit-test prediction boundary; real runtime is covered by the B-028 browser smoke.
jest.mock('../runtimePredictionService', () => ({ predictDraft: jest.fn(async () => ({ text: 'Trợ Lý Kiểm Thử Xuất Bản' })) }))
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
import { BuilderAuditLog } from '../../../database/entities/BuilderAuditLog'
import { PublishService } from './publishService'
import { BuilderAuditService } from '../audit/builderAuditService'

function createMockRepository<T extends { id?: string; createdDate?: Date }>() {
    const store = new Map<string, T>()
    let idCounter = 1

    return {
        create: jest.fn((dto: any) => ({
            id: `id-${idCounter++}`,
            createdDate: new Date(),
            ...dto
        })),
        save: jest.fn(async (entity: any) => {
            if (!entity.id) {
                entity.id = `id-${idCounter++}`
            }
            if (!entity.createdDate) {
                entity.createdDate = new Date()
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
        findOne: jest.fn(async (options: any) => {
            const where = options.where || options
            const items = Array.from(store.values()).filter((item) => {
                return Object.entries(where).every(([k, v]) => (item as any)[k] === v)
            })
            if (options.order?.createdDate === 'DESC') {
                items.sort((a: any, b: any) => new Date(b.createdDate || 0).getTime() - new Date(a.createdDate || 0).getTime())
            }
            return items[0] || null
        }),
        find: jest.fn(async (options: any) => {
            const where = options?.where || {}
            let items = Array.from(store.values()).filter((item) => {
                return Object.entries(where).every(([k, v]) => (item as any)[k] === v)
            })
            if (options?.order?.createdDate === 'DESC') {
                items.sort((a: any, b: any) => new Date(b.createdDate || 0).getTime() - new Date(a.createdDate || 0).getTime())
            }
            if (options?.skip) {
                items = items.slice(options.skip)
            }
            if (options?.take) {
                items = items.slice(0, options.take)
            }
            return items
        }),
        clear: () => store.clear()
    }
}

describe('PH5-T01 & PH5-T02: Publishing Gate & Audit Logging Suite', () => {
    let mockSessionRepo: ReturnType<typeof createMockRepository<BuilderSession>>
    let mockRevisionRepo: ReturnType<typeof createMockRepository<AgentSpecRevision>>
    let mockDraftRepo: ReturnType<typeof createMockRepository<AgentDraftRevision>>
    let mockChatflowRepo: ReturnType<typeof createMockRepository<ChatFlow>>
    let mockAuditRepo: ReturnType<typeof createMockRepository<BuilderAuditLog>>
    let mockDataSource: any

    let publishService: PublishService
    let auditService: BuilderAuditService

    const workspaceId = 'ws-corp-qa'
    let testSessionId: string
    let testRevisionId: string
    let testFlowId: string

    beforeEach(async () => {
        mockSessionRepo = createMockRepository<BuilderSession>()
        mockRevisionRepo = createMockRepository<AgentSpecRevision>()
        mockDraftRepo = createMockRepository<AgentDraftRevision>()
        mockChatflowRepo = createMockRepository<ChatFlow>()
        mockAuditRepo = createMockRepository<BuilderAuditLog>()

        mockDataSource = {
            getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === BuilderSession) return mockSessionRepo
                if (entity === AgentSpecRevision) return mockRevisionRepo
                if (entity === AgentDraftRevision) return mockDraftRepo
                if (entity === ChatFlow) return mockChatflowRepo
                if (entity === BuilderAuditLog) return mockAuditRepo
                throw new Error(`Unexpected entity ${entity?.name}`)
            })
        }

        publishService = new PublishService(mockDataSource)
        auditService = new BuilderAuditService(mockDataSource)

        // Khởi tạo Chatflow draft
        const flow = await mockChatflowRepo.save({
            name: 'Trợ Lý Kiểm Thử Xuất Bản',
            type: EnumChatflowType.AGENTFLOW,
            deployed: false,
            isPublic: false,
            workspaceId,
            flowData: JSON.stringify({
                nodes: [
                    { id: 'start', data: { name: 'startAgentflow', type: 'Start' } },
                    { id: 'agent', data: { name: 'agentAgentflow', type: 'Agent', inputs: { agentMessages: [{ content: 'Bot CSKH' }] } } }
                ],
                edges: []
            })
        })
        testFlowId = flow.id!

        // Khởi tạo Revision hợp lệ có kịch bản test
        const revision = await mockRevisionRepo.save({
            sessionId: 'dummy',
            revisionNo: 1,
            buildReady: true,
            spec: JSON.stringify({
                schemaVersion: '1.0',
                name: 'Trợ Lý Kiểm Thử Xuất Bản',
                goal: 'Hỗ trợ giải đáp nghiệp vụ',
                instructions: 'Trả lời ngắn gọn',
                evaluationExamples: [{ input: 'Xin chào', assertions: ['Trợ Lý Kiểm Thử Xuất Bản'] }]
            })
        })
        testRevisionId = revision.id!

        // Khởi tạo Session
        const session = await mockSessionRepo.save({
            workspaceId,
            organizationId: 'org-1',
            userId: 'user-tester',
            title: 'Phiên tạo bot CSKH',
            state: 'ready',
            currentRevisionNo: 1,
            currentSpecRevisionId: testRevisionId
        })
        testSessionId = session.id!

        // Cập nhật lại sessionId cho revision
        await mockRevisionRepo.save({ ...revision, sessionId: testSessionId })

        // Khởi tạo Draft Revision
        await mockDraftRepo.save({
            sessionId: testSessionId,
            specRevisionId: testRevisionId,
            buildKey: `${testSessionId}:${testRevisionId}`,
            flowId: testFlowId,
            planId: 'plan-1',
            templateId: 'assistant-flow-template',
            templateVersion: '1.0'
        })
    })

    describe('PH5-T01: Cổng Phê Duyệt & Xuất Bản (Publishing Gate)', () => {
        it('từ chối xuất bản khi thiếu sessionId hoặc workspaceId (400 Bad Request)', async () => {
            await expect(publishService.publishAgent({ sessionId: '', workspaceId })).rejects.toThrow('Session ID is required')

            await expect(publishService.publishAgent({ sessionId: testSessionId, workspaceId: '' })).rejects.toThrow(
                'Workspace ID is required'
            )
        })

        it('chặn xuất bản khi thao tác từ workspace khác (Negative Auth: 403 Forbidden)', async () => {
            try {
                await publishService.publishAgent({
                    sessionId: testSessionId,
                    workspaceId: 'other-workspace-attack'
                })
                fail('Expected to throw 403')
            } catch (err: any) {
                expect(err.statusCode).toBe(StatusCodes.FORBIDDEN)
                expect(err.message).toContain('Khác workspace')
            }
        })

        it('từ chối khi phiên làm việc chưa đạt buildReady: true', async () => {
            // Sửa revision thành chưa sẵn sàng
            await mockRevisionRepo.save({
                id: testRevisionId,
                sessionId: testSessionId,
                revisionNo: 1,
                buildReady: false,
                spec: JSON.stringify({ schemaVersion: '1.0' })
            })

            await expect(publishService.publishAgent({ sessionId: testSessionId, workspaceId })).rejects.toThrow(
                'chưa sẵn sàng để xuất bản'
            )
        })

        it('từ chối khi phiên làm việc chưa từng thực hiện build bản draft nào (404 Not Found)', async () => {
            mockDraftRepo.clear()

            try {
                await publishService.publishAgent({ sessionId: testSessionId, workspaceId })
                fail('Expected to throw 404')
            } catch (err: any) {
                expect(err.statusCode).toBe(StatusCodes.NOT_FOUND)
                expect(err.message).toContain('chưa có bản biên dịch Chatflow draft nào')
            }
        })

        it('Quality Gate: từ chối xuất bản và ghi log REJECTED khi tỷ lệ test không đạt ngưỡng an toàn', async () => {
            // Cập nhật spec với câu hỏi assertion cố tình không khớp
            await mockRevisionRepo.save({
                id: testRevisionId,
                sessionId: testSessionId,
                revisionNo: 1,
                buildReady: true,
                spec: JSON.stringify({
                    schemaVersion: '1.0',
                    name: 'Trợ Lý Kiểm Thử Xuất Bản',
                    goal: 'Hỗ trợ giải đáp nghiệp vụ',
                    instructions: 'Trả lời ngắn gọn',
                    evaluationExamples: [{ input: 'Hỏi câu 1', assertions: ['Từ Khóa Chắc Chắn Không Khớp 123456'] }]
                })
            })

            try {
                await publishService.publishAgent({
                    sessionId: testSessionId,
                    workspaceId,
                    userId: 'user-qa',
                    minPassRate: 0.8
                })
                fail('Expected quality gate to fail')
            } catch (err: any) {
                expect(err.message).toContain('Chất lượng Agent chưa đạt ngưỡng an toàn xuất bản')
            }

            // Kiểm tra: Chatflow vẫn giữ nguyên trạng thái an toàn deployed: false
            const flow = await mockChatflowRepo.findOneBy({ id: testFlowId })
            expect(flow!.deployed).toBe(false)

            // Kiểm tra: Đã ghi nhận bản ghi Audit Log bị từ chối REJECTED
            const logs = await mockAuditRepo.find({ where: { sessionId: testSessionId } })
            expect(logs.length).toBeGreaterThan(0)
            const rejectedLog = logs.find((l) => l.action === 'AGENT_PUBLISHED' && l.status === 'REJECTED')
            expect(rejectedLog).toBeDefined()
            expect(rejectedLog!.metadata).toContain('QUALITY_GATE_FAILED')
        })

        it('xuất bản thành công: chuyển deployed = true, session state = published và ghi Audit Log SUCCESS', async () => {
            const result = await publishService.publishAgent({
                sessionId: testSessionId,
                workspaceId,
                userId: 'user-leader',
                isPublic: true,
                minPassRate: 0.8,
                notes: 'Phê duyệt triển khai bản production v1'
            })

            expect(result.success).toBe(true)
            expect(result.deployed).toBe(true)
            expect(result.isPublic).toBe(true)
            expect(result.flowId).toBe(testFlowId)
            expect(result.revisionNo).toBe(1)
            expect(result.message).toContain('xuất bản thành công')

            // Kiểm tra ChatFlow trong database
            const flow = await mockChatflowRepo.findOneBy({ id: testFlowId })
            expect(flow!.deployed).toBe(true)
            expect(flow!.isPublic).toBe(true)

            // Kiểm tra Session chuyển sang trạng thái published
            const session = await mockSessionRepo.findOneBy({ id: testSessionId })
            expect(session!.state).toBe('published')

            // Kiểm tra Audit Log
            const auditLogs = await mockAuditRepo.find({ where: { sessionId: testSessionId } })
            const successLog = auditLogs.find((l) => l.action === 'AGENT_PUBLISHED' && l.status === 'SUCCESS')
            expect(successLog).toBeDefined()
            expect(successLog!.userId).toBe('user-leader')
            expect(successLog!.metadata).toContain('Phê duyệt triển khai bản production v1')
        })

        it('thu hồi xuất bản (Unpublish): chuyển deployed = false và session state = ready', async () => {
            // Trước tiên xuất bản
            await publishService.publishAgent({ sessionId: testSessionId, workspaceId })

            // Sau đó thu hồi
            const unpublishRes = await publishService.unpublishAgent({
                sessionId: testSessionId,
                workspaceId,
                userId: 'user-ops'
            })

            expect(unpublishRes.success).toBe(true)
            expect(unpublishRes.deployed).toBe(false)
            expect(unpublishRes.isPublic).toBe(false)

            const flow = await mockChatflowRepo.findOneBy({ id: testFlowId })
            expect(flow!.deployed).toBe(false)

            const session = await mockSessionRepo.findOneBy({ id: testSessionId })
            expect(session!.state).toBe('ready')

            // Kiểm tra Audit Log thu hồi
            const logs = await mockAuditRepo.find({ where: { sessionId: testSessionId } })
            const unpublishLog = logs.find((l) => l.action === 'AGENT_UNPUBLISHED')
            expect(unpublishLog).toBeDefined()
            expect(unpublishLog!.status).toBe('SUCCESS')
        })
    })

    describe('PH5-T02: Audit Logging Service & Workspace Isolation', () => {
        it('ghi nhận và truy xuất đầy đủ danh sách audit logs theo session', async () => {
            await auditService.logAction({
                sessionId: testSessionId,
                workspaceId,
                action: 'SESSION_CREATED',
                status: 'SUCCESS',
                metadata: { channel: 'web-chat' }
            })

            await auditService.logAction({
                sessionId: testSessionId,
                workspaceId,
                action: 'BUILD_EXECUTED',
                status: 'SUCCESS',
                flowId: testFlowId,
                targetRevisionNo: 1
            })

            const logs = await auditService.getSessionAuditLogs(testSessionId, workspaceId)
            expect(logs).toHaveLength(2)
            expect(logs[0].sessionId).toBe(testSessionId)
            expect(logs[0].workspaceId).toBe(workspaceId)
        })

        it('chặn xem lịch sử audit logs từ workspace khác (Negative Auth: 403 Forbidden)', async () => {
            try {
                await auditService.getSessionAuditLogs(testSessionId, 'ws-attacker-other')
                fail('Expected to throw 403')
            } catch (err: any) {
                expect(err.statusCode).toBe(StatusCodes.FORBIDDEN)
                expect(err.message).toContain('Khác workspace')
            }
        })
    })
})
