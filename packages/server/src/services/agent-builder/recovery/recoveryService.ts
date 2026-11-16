import { DataSource, In, Repository } from 'typeorm'
import { BuildJob } from '../../../database/entities/BuildJob'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import builderAuditService, { BuilderAuditService } from '../audit/builderAuditService'
import builderLogger from '../observability/builderLogger'

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

export interface ReconcileResult {
    scannedJobsCount: number
    reconciledJobsCount: number
    reconciledJobIds: string[]
    reconciledSessionsCount: number
    reconciledSessionIds: string[]
    executedAt: string
}

export class RecoveryService {
    private auditService: BuilderAuditService

    constructor(private customDataSource?: DataSource, customAuditService?: BuilderAuditService) {
        this.auditService = customAuditService || builderAuditService
    }

    private get ds(): DataSource {
        return getActiveDataSource(this.customDataSource)
    }

    private get jobRepo(): Repository<BuildJob> {
        return this.ds.getRepository(BuildJob)
    }

    private get sessionRepo(): Repository<BuilderSession> {
        return this.ds.getRepository(BuilderSession)
    }

    /**
     * Đối soát và dọn dẹp các Build Jobs bị treo hoặc mồ côi (orphaned) khi server bị crash hoặc restart (PH5-T07).
     * Khôi phục trạng thái session liên quan mà KHÔNG làm mất revision hay draft đã tạo.
     */
    async reconcileStaleJobs(options?: { maxStaleMs?: number; workspaceId?: string; actorId?: string }): Promise<ReconcileResult> {
        const maxStaleMs = options?.maxStaleMs ?? 30000 // Mặc định 30 giây
        const now = Date.now()

        // 1. Tìm các job đang ở trạng thái chưa kết thúc ('running' hoặc 'pending')
        const queryWhere: Record<string, unknown> = {
            state: In(['running', 'pending'])
        }
        if (options?.workspaceId && options.workspaceId !== 'default') {
            queryWhere.workspaceId = options.workspaceId
        }

        const activeJobs = await this.jobRepo.find({ where: queryWhere })
        const reconciledJobIds: string[] = []
        const affectedSessionIds = new Set<string>()

        for (const job of activeJobs) {
            const referenceTime = job.startedDate ? new Date(job.startedDate).getTime() : new Date(job.createdDate).getTime()
            const elapsed = now - referenceTime
            const timeoutThreshold = Math.max(job.timeoutMs || 30000, maxStaleMs)

            if (elapsed > timeoutThreshold) {
                // Đánh dấu job thất bại do server crash/restart hoặc timeout
                job.state = 'failed'
                job.error = 'RECOVERY_CRASH_OR_TIMEOUT: Job was interrupted by server restart or exceeded timeout'
                job.completedDate = new Date()
                await this.jobRepo.save(job)

                reconciledJobIds.push(job.id)
                affectedSessionIds.add(job.sessionId)

                builderLogger.warn(
                    'compilation',
                    'JOB_RECONCILED',
                    {
                        jobId: job.id,
                        buildKey: job.buildKey,
                        elapsedMs: elapsed
                    },
                    {
                        sessionId: job.sessionId,
                        workspaceId: job.workspaceId
                    }
                )
            }
        }

        // 2. Khôi phục trạng thái session: Nếu đang 'building' thì đưa về 'ready' để không bị khóa
        const reconciledSessionIds: string[] = []
        for (const sessionId of affectedSessionIds) {
            const session = await this.sessionRepo.findOneBy({ id: sessionId })
            if (session && session.state === 'building') {
                session.state = 'ready'
                await this.sessionRepo.save(session)
                reconciledSessionIds.push(sessionId)

                await this.auditService.logAction({
                    sessionId: session.id,
                    workspaceId: session.workspaceId,
                    userId: options?.actorId || 'system_recovery',
                    action: 'RECOVERY_EXECUTED',
                    status: 'SUCCESS',
                    metadata: {
                        reason: 'Unblocked session state from building to ready after server restart/crash',
                        reconciledJobsCount: reconciledJobIds.length
                    }
                })
            }
        }

        return {
            scannedJobsCount: activeJobs.length,
            reconciledJobsCount: reconciledJobIds.length,
            reconciledJobIds,
            reconciledSessionsCount: reconciledSessionIds.length,
            reconciledSessionIds,
            executedAt: new Date().toISOString()
        }
    }

    /**
     * Đối soát và mở khóa thủ công một phiên cụ thể nếu bị kẹt.
     */
    async reconcileSession(sessionId: string, workspaceId: string): Promise<{ success: boolean; sessionState: string }> {
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            return { success: false, sessionState: 'not_found' }
        }
        if (workspaceId !== 'default' && session.workspaceId !== workspaceId) {
            return { success: false, sessionState: 'forbidden' }
        }

        if (session.state === 'building') {
            session.state = 'ready'
            await this.sessionRepo.save(session)

            await this.auditService.logAction({
                sessionId: session.id,
                workspaceId: session.workspaceId,
                action: 'RECOVERY_EXECUTED',
                status: 'SUCCESS',
                metadata: { reason: 'Manual session reconcile unblocked building state' }
            })
        }

        return { success: true, sessionState: session.state }
    }
}

export const recoveryService = new RecoveryService()
export default recoveryService
