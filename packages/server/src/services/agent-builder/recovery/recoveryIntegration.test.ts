jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { BuildJob } from '../../../database/entities/BuildJob'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuilderAuditLog } from '../../../database/entities/BuilderAuditLog'
import { RecoveryService } from './recoveryService'
import { BuilderAuditService } from '../audit/builderAuditService'
import { TokenUsageService } from '../cost/tokenUsageService'

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
        find: jest.fn(async (opts?: any) => {
            let items = Array.from(store.values())
            if (opts?.where) {
                items = items.filter((item) => {
                    return Object.entries(opts.where).every(([k, v]) => {
                        if (typeof v === 'object' && v !== null && (v as any)._type === 'in') {
                            return ((v as any)._value || []).includes((item as any)[k])
                        }
                        if (typeof v === 'object' && v !== null) return true
                        return (item as any)[k] === v
                    })
                })
            }
            return items
        })
    }
}

describe('PH5-T05 & PH5-T07: Token Usage Tracking & Crash Recovery Integration Suite', () => {
    let mockDataSource: any
    let jobRepo: any
    let sessionRepo: any
    let specRepo: any
    let draftRepo: any
    let auditRepo: any

    let auditService: BuilderAuditService
    let recoveryService: RecoveryService
    let usageService: TokenUsageService

    beforeEach(() => {
        jobRepo = createMockRepository<BuildJob>()
        sessionRepo = createMockRepository<BuilderSession>()
        specRepo = createMockRepository<AgentSpecRevision>()
        draftRepo = createMockRepository<AgentDraftRevision>()
        auditRepo = createMockRepository<BuilderAuditLog>()

        mockDataSource = {
            getRepository: jest.fn((entity: any) => {
                if (entity === BuildJob) return jobRepo
                if (entity === BuilderSession) return sessionRepo
                if (entity === AgentSpecRevision) return specRepo
                if (entity === AgentDraftRevision) return draftRepo
                if (entity === BuilderAuditLog) return auditRepo
                return createMockRepository()
            })
        }

        auditService = new BuilderAuditService(mockDataSource)
        recoveryService = new RecoveryService(mockDataSource, auditService)
        usageService = new TokenUsageService()
    })

    describe('PH5-T07: Crash Recovery & Job Reconcile (Không mất revision/draft)', () => {
        it('Khôi phục phiên bị kẹt khi server restart/crash mà giữ nguyên 100% revisions và drafts', async () => {
            const workspaceId = 'ws-corp-auto'

            // 1. Tạo session đã có Revision #1 và Draft #1
            const session = await sessionRepo.save({
                id: 'sess-rec-001',
                workspaceId,
                userId: 'dev-anh',
                title: 'Trợ lý Pháp lý Tự Động',
                state: 'building', // Server bị crash khi đang build revision 2
                currentRevisionNo: 2,
                currentSpecRevisionId: 'spec-rev-2'
            })

            const _specRev1 = await specRepo.save({
                id: 'spec-rev-1',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify({ name: 'V1' })
            })

            const draftRev1 = await draftRepo.save({
                id: 'draft-rev-1',
                sessionId: session.id,
                revisionNo: 1,
                flowId: 'flow-001',
                status: 'success'
            })

            const _specRev2 = await specRepo.save({
                id: 'spec-rev-2',
                sessionId: session.id,
                revisionNo: 2,
                spec: JSON.stringify({ name: 'V2' })
            })

            // 2. Tạo build job bị treo từ 2 phút trước
            const pastDate = new Date(Date.now() - 120000)
            const orphanedJob = await jobRepo.save({
                id: 'job-orphaned-1',
                sessionId: session.id,
                workspaceId,
                specRevisionId: 'spec-rev-2',
                buildKey: 'sess-rec-001:spec-rev-2',
                state: 'running',
                timeoutMs: 30000,
                startedDate: pastDate,
                createdDate: pastDate
            })

            // 3. Kích hoạt cơ chế Recovery đối soát
            const reconcileResult = await recoveryService.reconcileStaleJobs({
                maxStaleMs: 30000,
                workspaceId,
                actorId: 'system_startup'
            })

            expect(reconcileResult.reconciledJobsCount).toBe(1)
            expect(reconcileResult.reconciledJobIds).toContain(orphanedJob.id)
            expect(reconcileResult.reconciledSessionsCount).toBe(1)
            expect(reconcileResult.reconciledSessionIds).toContain(session.id)

            // 4. Kiểm tra trạng thái session đã unblock về 'ready'
            const restoredSession = await sessionRepo.findOneBy({ id: session.id })
            expect(restoredSession.state).toBe('ready')
            expect(restoredSession.currentRevisionNo).toBe(2)
            expect(restoredSession.currentSpecRevisionId).toBe('spec-rev-2')

            // 5. Kiểm tra tính toàn vẹn: Revisions và Drafts cũ không bị mất hay ghi đè
            const allSpecs = await specRepo.find()
            expect(allSpecs.length).toBe(2)
            expect(allSpecs.map((s: any) => s.id)).toEqual(['spec-rev-1', 'spec-rev-2'])

            const allDrafts = await draftRepo.find()
            expect(allDrafts.length).toBe(1)
            expect(allDrafts[0].id).toBe(draftRev1.id)

            // 6. Kiểm tra Audit Log
            const auditLogs = await auditService.getSessionAuditLogs(session.id, workspaceId)
            const recoveryLog = auditLogs.find((l: any) => l.action === 'RECOVERY_EXECUTED')
            expect(recoveryLog).toBeDefined()
            expect(recoveryLog?.status).toBe('SUCCESS')
        })
    })

    describe('PH5-T05: Token Usage & Cost Accounting Tracking', () => {
        it('Theo dõi chi phí thực và lượng token tiêu thụ theo từng giai đoạn và provider', () => {
            const sessionId = 'sess-rec-001'
            const workspaceId = 'ws-corp-auto'

            // Ghi nhận lượt hội thoại GPT-4o-mini
            usageService.recordUsage({
                sessionId,
                workspaceId,
                source: 'conversation',
                provider: 'openai',
                model: 'gpt-4o-mini',
                promptTokens: 850,
                completionTokens: 250
            })

            // Ghi nhận đợt chạy test evaluation với Claude 3.5 Sonnet
            usageService.recordUsage({
                sessionId,
                workspaceId,
                source: 'evaluation',
                provider: 'anthropic',
                model: 'claude-3-5-sonnet',
                promptTokens: 4500,
                completionTokens: 1200
            })

            // Ghi nhận lượt dự đoán thực tế
            usageService.recordUsage({
                sessionId,
                workspaceId,
                source: 'prediction',
                provider: 'google',
                model: 'gemini-1.5-flash',
                promptTokens: 300,
                completionTokens: 100
            })

            const summary = usageService.getSessionSummary(sessionId, workspaceId)

            expect(summary.recordsCount).toBe(3)
            expect(summary.totalPromptTokens).toBe(850 + 4500 + 300)
            expect(summary.totalCompletionTokens).toBe(250 + 1200 + 100)
            expect(summary.totalTokens).toBe(7200)

            // Phân biệt rõ usage theo từng mục đích (conversation, evaluation, prediction)
            expect(summary.bySource.conversation.totalTokens).toBe(1100)
            expect(summary.bySource.evaluation.totalTokens).toBe(5700)
            expect(summary.bySource.prediction.totalTokens).toBe(400)

            // Phân loại theo provider
            expect(summary.byProvider['openai']).toBeDefined()
            expect(summary.byProvider['anthropic']).toBeDefined()
            expect(summary.byProvider['google']).toBeDefined()

            // Chi phí USD được tính toán chính xác
            expect(summary.totalCostUsd).toBeGreaterThan(0)
        })
    })
})
