jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { BuildJob } from '../../../database/entities/BuildJob'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { RecoveryService } from './recoveryService'
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

describe('RecoveryService (PH5-T07)', () => {
    let mockDataSource: any
    let jobRepo: any
    let sessionRepo: any
    let mockAuditService: any
    let recovery: RecoveryService

    beforeEach(() => {
        jobRepo = createMockRepository<BuildJob>()
        sessionRepo = createMockRepository<BuilderSession>()

        mockDataSource = {
            getRepository: jest.fn((entity: any) => {
                if (entity === BuildJob) return jobRepo
                if (entity === BuilderSession) return sessionRepo
                return createMockRepository()
            })
        }

        mockAuditService = {
            logAction: jest.fn().mockResolvedValue({ id: 'audit-rec-1' })
        }

        recovery = new RecoveryService(mockDataSource, mockAuditService as unknown as BuilderAuditService)
    })

    it('should reconcile stale running build jobs and unblock session state', async () => {
        const now = Date.now()
        const pastTime = new Date(now - 60000) // 1 minute ago (exceeds 30s timeout)

        const session = await sessionRepo.save({
            id: 'sess-crash-1',
            workspaceId: 'ws-main',
            state: 'building',
            currentRevisionNo: 2
        })

        const staleJob = await jobRepo.save({
            id: 'job-stale-1',
            sessionId: session.id,
            workspaceId: 'ws-main',
            buildKey: 'sess-crash-1:rev-2',
            state: 'running',
            timeoutMs: 30000,
            startedDate: pastTime,
            createdDate: pastTime
        })

        const result = await recovery.reconcileStaleJobs({ maxStaleMs: 30000, workspaceId: 'ws-main' })

        expect(result.reconciledJobsCount).toBe(1)
        expect(result.reconciledJobIds).toContain(staleJob.id)
        expect(result.reconciledSessionsCount).toBe(1)
        expect(result.reconciledSessionIds).toContain(session.id)

        // Kiểm tra job đã được đánh dấu failed do timeout/crash
        const updatedJob = await jobRepo.findOneBy({ id: staleJob.id })
        expect(updatedJob.state).toBe('failed')
        expect(updatedJob.error).toContain('RECOVERY_CRASH_OR_TIMEOUT')

        // Kiểm tra session đã được khôi phục về trạng thái ready
        const updatedSession = await sessionRepo.findOneBy({ id: session.id })
        expect(updatedSession.state).toBe('ready')
        expect(updatedSession.currentRevisionNo).toBe(2) // Giữ nguyên revision!

        // Kiểm tra audit log
        expect(mockAuditService.logAction).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: session.id,
                action: 'RECOVERY_EXECUTED',
                status: 'SUCCESS'
            })
        )
    })

    it('should not modify jobs that are still within timeout window', async () => {
        const session = await sessionRepo.save({
            id: 'sess-active-1',
            workspaceId: 'ws-main',
            state: 'building'
        })

        const activeJob = await jobRepo.save({
            id: 'job-active-1',
            sessionId: session.id,
            workspaceId: 'ws-main',
            buildKey: 'sess-active-1:rev-1',
            state: 'running',
            timeoutMs: 60000,
            startedDate: new Date(), // Just started
            createdDate: new Date()
        })

        const result = await recovery.reconcileStaleJobs({ maxStaleMs: 30000, workspaceId: 'ws-main' })

        expect(result.reconciledJobsCount).toBe(0)
        const job = await jobRepo.findOneBy({ id: activeJob.id })
        expect(job.state).toBe('running')
    })

    it('should support manual session reconcile if blocked in building state', async () => {
        await sessionRepo.save({
            id: 'sess-stuck-1',
            workspaceId: 'ws-test',
            state: 'building'
        })

        const res = await recovery.reconcileSession('sess-stuck-1', 'ws-test')
        expect(res.success).toBe(true)
        expect(res.sessionState).toBe('ready')

        const session = await sessionRepo.findOneBy({ id: 'sess-stuck-1' })
        expect(session.state).toBe('ready')
    })
})
