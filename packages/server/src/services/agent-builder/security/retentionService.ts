import { DataSource, LessThan } from 'typeorm'
import { BuilderAuditLog } from '../../../database/entities/BuilderAuditLog'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import sessionService from '../sessionService'
import builderAuditService from '../audit/builderAuditService'

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

export interface RetentionPolicyConfig {
    defaultRetentionDays: number
    auditLogRetentionDays: number
    allowPurgePublished: boolean
}

export interface RetentionSweepResult {
    workspaceId?: string
    purgedSessionsCount: number
    purgedSessionIds: string[]
    purgedAuditLogsCount: number
    executedAt: string
}

export class RetentionService {
    private config: RetentionPolicyConfig
    private customDataSource?: DataSource

    constructor(config?: Partial<RetentionPolicyConfig>, customDataSource?: DataSource) {
        this.customDataSource = customDataSource
        this.config = {
            defaultRetentionDays: Number(process.env.BUILDER_DATA_RETENTION_DAYS) || 30,
            auditLogRetentionDays: Number(process.env.BUILDER_AUDIT_RETENTION_DAYS) || 90,
            allowPurgePublished: false,
            ...config
        }
    }

    /**
     * Dọn dẹp các session không hoạt động cũ hơn số ngày quy định.
     * Quy tắc an toàn: Không xóa các session đang ở trạng thái 'published'.
     */
    async purgeExpiredSessions(workspaceId?: string, olderThanDays?: number): Promise<{ count: number; sessionIds: string[] }> {
        const days = olderThanDays ?? this.config.defaultRetentionDays
        const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000

        // Lấy tất cả session theo workspace
        let allSessions: any[] = []
        try {
            allSessions = await sessionService.listSessions(workspaceId, { limit: 500 })
        } catch {
            allSessions = []
        }

        const purgedIds: string[] = []

        for (const session of allSessions) {
            // Không xóa session đã xuất bản trừ khi được cho phép đặc biệt
            if ((session.state === 'published' || session.state === 'deployed') && !this.config.allowPurgePublished) {
                continue
            }

            const updatedTime = new Date(session.updatedDate || session.createdDate).getTime()
            if (updatedTime < cutoffTime) {
                const deleted = await sessionService.deleteSession(session.id, session.workspaceId)
                if (deleted) {
                    purgedIds.push(session.id)
                }
            }
        }

        return {
            count: purgedIds.length,
            sessionIds: purgedIds
        }
    }

    /**
     * Dọn dẹp các bản ghi Audit Log cũ hơn số ngày quy định.
     */
    async purgeExpiredAuditLogs(workspaceId?: string, olderThanDays?: number): Promise<number> {
        const days = olderThanDays ?? this.config.auditLogRetentionDays
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

        try {
            const appDataSource = getActiveDataSource(this.customDataSource)
            const auditRepo = appDataSource.getRepository(BuilderAuditLog)

            const queryWhere: Record<string, unknown> = {
                createdDate: LessThan(cutoffDate)
            }
            if (workspaceId && workspaceId !== 'default') {
                queryWhere.workspaceId = workspaceId
            }

            const oldLogs = await auditRepo.find({ where: queryWhere })
            if (oldLogs.length > 0) {
                await auditRepo.remove(oldLogs)
            }
            return oldLogs.length
        } catch {
            // Trường hợp datasource chưa khởi tạo (unit test in-memory)
            return 0
        }
    }

    /**
     * Thực hiện chu kỳ quét và dọn dẹp dữ liệu lưu trữ (Retention Sweep) toàn diện.
     */
    async executeRetentionSweep(
        workspaceId = 'default',
        options?: { sessionDays?: number; auditDays?: number; actorId?: string }
    ): Promise<RetentionSweepResult> {
        const sessionResult = await this.purgeExpiredSessions(workspaceId, options?.sessionDays)
        const auditLogsCount = await this.purgeExpiredAuditLogs(workspaceId, options?.auditDays)

        const result: RetentionSweepResult = {
            workspaceId,
            purgedSessionsCount: sessionResult.count,
            purgedSessionIds: sessionResult.sessionIds,
            purgedAuditLogsCount: auditLogsCount,
            executedAt: new Date().toISOString()
        }

        // Ghi lại sự kiện audit nếu có dọn dẹp
        if (sessionResult.count > 0 || auditLogsCount > 0) {
            await builderAuditService.logAction({
                sessionId: 'system_retention',
                workspaceId,
                userId: options?.actorId || 'system_worker',
                action: 'DATA_RETENTION_PURGE',
                status: 'SUCCESS',
                metadata: {
                    purgedSessionsCount: sessionResult.count,
                    purgedAuditLogsCount: auditLogsCount,
                    sessionDays: options?.sessionDays ?? this.config.defaultRetentionDays,
                    auditDays: options?.auditDays ?? this.config.auditLogRetentionDays
                }
            })
        }

        return result
    }

    getConfig(): RetentionPolicyConfig {
        return { ...this.config }
    }
}

export const retentionService = new RetentionService()
export default retentionService
