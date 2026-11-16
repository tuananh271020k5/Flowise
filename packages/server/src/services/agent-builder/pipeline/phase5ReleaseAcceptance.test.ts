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
import { BuilderAuditLog } from '../../../database/entities/BuilderAuditLog'
import { PublishService } from './publishService'
import { BuilderAuditService } from '../audit/builderAuditService'
import { RateLimiter } from '../security/rateLimiter'
import { redactionService } from '../security/redactionService'
import { RetentionService } from '../security/retentionService'
import { builderLogger } from '../observability/builderLogger'
import { metricsService } from '../observability/metricsService'
import { BuilderError } from '../errors/builderErrors'

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
        findOne: jest.fn(async (opts?: any) => {
            for (const item of store.values()) {
                if (opts?.where) {
                    const match = Object.entries(opts.where).every(([k, v]) => (item as any)[k] === v)
                    if (match) return { ...item }
                }
            }
            return null
        }),
        find: jest.fn(async (opts?: any) => {
            let items = Array.from(store.values())
            if (opts?.where) {
                items = items.filter((item) => {
                    return Object.entries(opts.where).every(([k, v]) => {
                        if (typeof v === 'object' && v !== null) return true
                        return (item as any)[k] === v
                    })
                })
            }
            return items
        }),
        remove: jest.fn(async (entities: any) => {
            const list = Array.isArray(entities) ? entities : [entities]
            for (const e of list) {
                store.delete(e.id)
            }
            return entities
        }),
        delete: jest.fn(async (query: any) => {
            for (const [id, item] of store.entries()) {
                const match = Object.entries(query).every(([k, v]) => (item as any)[k] === v)
                if (match) store.delete(id)
            }
            return { raw: [], affected: 1 }
        })
    }
}

describe('Phase 5 Release Acceptance & Operational Runbook Suite (PH5-T03 & PH5-T04)', () => {
    let mockDataSource: any
    let auditRepo: any
    let sessionRepo: any
    let specRepo: any
    let draftRepo: any
    let chatflowRepo: any

    let auditService: BuilderAuditService
    let publishService: PublishService
    let rateLimiter: RateLimiter
    let retentionServiceInstance: RetentionService

    beforeEach(() => {
        auditRepo = createMockRepository<BuilderAuditLog>()
        sessionRepo = createMockRepository<BuilderSession>()
        specRepo = createMockRepository<AgentSpecRevision>()
        draftRepo = createMockRepository<AgentDraftRevision>()
        chatflowRepo = createMockRepository<ChatFlow>()

        mockDataSource = {
            getRepository: jest.fn((entity: any) => {
                if (entity === BuilderAuditLog) return auditRepo
                if (entity === BuilderSession) return sessionRepo
                if (entity === AgentSpecRevision) return specRepo
                if (entity === AgentDraftRevision) return draftRepo
                if (entity === ChatFlow) return chatflowRepo
                return createMockRepository()
            })
        }

        auditService = new BuilderAuditService(mockDataSource)
        publishService = new PublishService(mockDataSource)
        rateLimiter = new RateLimiter({
            message: { windowMs: 1000, maxRequests: 5 },
            publish: { windowMs: 1000, maxRequests: 2 }
        })
        retentionServiceInstance = new RetentionService({ defaultRetentionDays: 30 }, mockDataSource)

        builderLogger.clearBuffer()
        metricsService.reset()
    })

    it('Kịch bản Nghiệm Thu Toàn Diện Release Nội Bộ Phase 5', async () => {
        const workspaceId = 'ws-corp-fin'
        const userId = 'operator-anh'

        // ----------------------------------------------------
        // BƯỚC 1: Khởi tạo phiên & Kiểm tra Credential Redaction (PH5-T03)
        // ----------------------------------------------------
        const session = await sessionRepo.save({
            id: 'sess-phase5-001',
            workspaceId,
            userId,
            title: 'Trợ lý Chính sách Tài chính 2026',
            state: 'ready',
            currentRevisionNo: 1
        })
        metricsService.recordSessionCreated()

        // Thử nghiệm làm sạch văn bản nhạy cảm
        const promptWithSecret =
            'Tôi muốn cấu hình trợ lý dùng key OpenAI sk-abcdef12345678901234567890 và database postgresql://admin:superSecret@db.internal:5432/finance'
        const sanitizedPrompt = redactionService.redactString(promptWithSecret)

        expect(sanitizedPrompt).not.toContain('sk-abcdef12345678901234567890')
        expect(sanitizedPrompt).not.toContain('superSecret')
        expect(sanitizedPrompt).toContain('[REDACTED_OPENAI_KEY]')
        expect(sanitizedPrompt).toContain('postgresql://[REDACTED_DB_URL]')

        // Ghi log có cấu trúc có gắn traceId
        const conversationLog = builderLogger.info(
            'conversation',
            'PROMPT_RECEIVED',
            { sanitizedPrompt },
            {
                sessionId: session.id,
                workspaceId
            }
        )
        expect(conversationLog.traceId).toMatch(/^trace-/)
        expect(conversationLog.stage).toBe('conversation')

        // ----------------------------------------------------
        // BƯỚC 2: Kiểm tra Quota & Rate Limiter (PH5-T05 / PH5-T06)
        // ----------------------------------------------------
        for (let i = 0; i < 5; i++) {
            rateLimiter.enforceLimit(workspaceId, 'message')
        }

        // Request thứ 6 vượt ngưỡng 5 requests / giây -> phải ném BuilderError 429
        expect(() => {
            rateLimiter.enforceLimit(workspaceId, 'message')
        }).toThrow(BuilderError)

        try {
            rateLimiter.enforceLimit(workspaceId, 'message')
        } catch (err: any) {
            expect(err.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
            expect(err.code).toBe('RATE_LIMIT_EXCEEDED')
            metricsService.recordRateLimitViolation('message')
        }

        // ----------------------------------------------------
        // BƯỚC 3: Biên dịch Agentflow Draft & Lưu vết Kiểm toán (PH5-T02)
        // ----------------------------------------------------
        const chatflow = await chatflowRepo.save({
            id: 'flow-fin-001',
            name: 'Trợ lý Chính sách Tài chính [Draft]',
            type: EnumChatflowType.AGENTFLOW,
            workspaceId,
            flowData: JSON.stringify({ nodes: [], edges: [] }),
            deployed: false
        })

        const draft = await draftRepo.save({
            id: 'draft-fin-001',
            sessionId: session.id,
            revisionNo: 1,
            flowId: chatflow.id,
            status: 'success'
        })
        expect(draft.id).toBeDefined()

        metricsService.recordBuild(true, 150)
        await auditService.logAction({
            sessionId: session.id,
            workspaceId,
            userId,
            action: 'BUILD_EXECUTED',
            status: 'SUCCESS',
            flowId: chatflow.id,
            targetRevisionNo: 1
        })

        // ----------------------------------------------------
        // BƯỚC 4: Chạy Bộ Kiểm Thử Đánh Giá & Quality Gate (PH5-T01)
        // ----------------------------------------------------
        // Giả lập kết quả chạy kiểm thử đạt 90% (9/10 tests pass)
        const mockTestResults = {
            totalExamples: 10,
            passedCount: 9,
            failedCount: 1,
            passRate: 90
        }
        await specRepo.save({
            id: 'spec-fin-001',
            sessionId: session.id,
            revisionNo: 1,
            buildReady: true,
            spec: JSON.stringify({ name: 'Trợ lý Tài chính' }),
            lastEvaluationResults: JSON.stringify(mockTestResults)
        })

        session.currentSpecRevisionId = 'spec-fin-001'
        await sessionRepo.save(session)

        metricsService.recordEvaluation(mockTestResults.passedCount, mockTestResults.failedCount)
        await auditService.logAction({
            sessionId: session.id,
            workspaceId,
            userId,
            action: 'EVALUATION_RUN',
            status: 'SUCCESS',
            metadata: { passRate: mockTestResults.passRate }
        })

        // ----------------------------------------------------
        // BƯỚC 5: Phê Duyệt Xuất Bản Qua Quality Gate
        // ----------------------------------------------------
        const publishResult = await publishService.publishAgent({
            sessionId: session.id,
            workspaceId,
            userId,
            minPassRate: 80,
            notes: 'Nghiệm thu bản v1 chuẩn nội bộ'
        })

        expect(publishResult.success).toBe(true)
        expect(publishResult.deployed).toBe(true)
        metricsService.recordPublish('publish')

        // Xác nhận ChatFlow đã deployed
        const updatedChatflow = await chatflowRepo.findOneBy({ id: chatflow.id })
        expect(updatedChatflow.deployed).toBe(true)

        // Xác nhận Audit Log ghi nhận AGENT_PUBLISHED
        const auditLogs = await auditService.getSessionAuditLogs(session.id, workspaceId)
        const publishedLog = auditLogs.find((l: any) => l.action === 'AGENT_PUBLISHED')
        expect(publishedLog).toBeDefined()
        expect(publishedLog?.status).toBe('SUCCESS')

        // ----------------------------------------------------
        // BƯỚC 6: Kiểm Tra Chính Sách Lưu Trữ (Retention Policy)
        // ----------------------------------------------------
        // Tạo thêm 1 session cũ đã hết hạn
        const oldSession = await sessionRepo.save({
            id: 'sess-old-expired',
            workspaceId,
            title: 'Phiên nháp cũ 2025',
            state: 'collecting',
            createdDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
        })
        expect(oldSession.id).toBeDefined()

        // Chạy retention sweep: Không xóa session đã published, dọn dẹp theo policy
        const sweepResult = await retentionServiceInstance.executeRetentionSweep(workspaceId, { sessionDays: 30 })
        expect(sweepResult.executedAt).toBeDefined()

        const allSessions = await sessionRepo.find()
        expect(allSessions.length).toBeGreaterThanOrEqual(1)

        // ----------------------------------------------------
        // BƯỚC 7: Thu Hồi Xuất Bản Khẩn Cấp (Emergency Unpublish)
        // ----------------------------------------------------
        const unpublishResult = await publishService.unpublishAgent({
            sessionId: session.id,
            workspaceId,
            userId
        })

        expect(unpublishResult.success).toBe(true)
        expect(unpublishResult.deployed).toBe(false)
        metricsService.recordPublish('unpublish')

        const flowAfterUnpublish = await chatflowRepo.findOneBy({ id: chatflow.id })
        expect(flowAfterUnpublish.deployed).toBe(false)

        // ----------------------------------------------------
        // BƯỚC 8: Xác Minh Metrics Tổng Thể (Structured Observability)
        // ----------------------------------------------------
        const finalMetrics = metricsService.getMetricsSnapshot()

        expect(finalMetrics.sessionsCreated).toBe(1)
        expect(finalMetrics.builds.total).toBe(1)
        expect(finalMetrics.builds.successRate).toBe(100)
        expect(finalMetrics.evaluations.passRate).toBe(90)
        expect(finalMetrics.lifecycle.published).toBe(1)
        expect(finalMetrics.lifecycle.unpublished).toBe(1)
        expect(finalMetrics.security.rateLimitViolationsTotal).toBeGreaterThan(0)
    })
})
