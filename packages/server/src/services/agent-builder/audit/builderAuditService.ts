import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { BuilderAuditLog, AuditActionType, AuditStatusType } from '../../../database/entities/BuilderAuditLog'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AdapterError } from '../errors/builderErrors'

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

export interface CreateAuditLogParams {
    sessionId: string
    workspaceId: string
    userId?: string
    action: AuditActionType
    status: AuditStatusType
    targetRevisionNo?: number
    flowId?: string
    metadata?: Record<string, unknown> | string
}

/**
 * Service quản lý ghi nhận và tra cứu kiểm toán (Audit Logging) cho Agent Builder (PH5-T02).
 * Đảm bảo truy vết đầy đủ và cách ly tuyệt đối theo workspace.
 */
export class BuilderAuditService {
    constructor(private customDataSource?: DataSource) {}

    private get ds(): DataSource {
        return getActiveDataSource(this.customDataSource)
    }

    private get auditRepo(): Repository<BuilderAuditLog> {
        return this.ds.getRepository(BuilderAuditLog)
    }

    private get sessionRepo(): Repository<BuilderSession> {
        return this.ds.getRepository(BuilderSession)
    }

    /**
     * Ghi nhận một bản ghi kiểm toán mới (PH5-T02).
     */
    async logAction(params: CreateAuditLogParams): Promise<BuilderAuditLog> {
        const { sessionId, workspaceId, userId, action, status, targetRevisionNo, flowId, metadata } = params
        const metadataString = typeof metadata === 'object' ? JSON.stringify(metadata) : metadata

        const log = this.auditRepo.create({
            sessionId,
            workspaceId,
            userId,
            action,
            status,
            targetRevisionNo,
            flowId,
            metadata: metadataString
        })

        return this.auditRepo.save(log)
    }

    /**
     * Lấy danh sách lịch sử kiểm toán của một phiên làm việc, đảm bảo cách ly workspace (PH5-T02).
     */
    async getSessionAuditLogs(
        sessionId: string,
        workspaceId: string,
        options?: { limit?: number; offset?: number }
    ): Promise<BuilderAuditLog[]> {
        if (!sessionId) {
            throw new AdapterError('SESSION_ID_REQUIRED', 'Session ID is required', StatusCodes.BAD_REQUEST)
        }
        if (!workspaceId) {
            throw new AdapterError('WORKSPACE_REQUIRED', 'Workspace ID is required', StatusCodes.BAD_REQUEST)
        }

        // 1. Kiểm tra session và cách ly workspace
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new AdapterError('SESSION_NOT_FOUND', `Phiên thiết kế ${sessionId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (session.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        const logs = await this.auditRepo.find({
            where: { sessionId, workspaceId },
            order: { createdDate: 'DESC' },
            take: options?.limit || 50,
            skip: options?.offset || 0
        })

        return logs
    }
}

export default new BuilderAuditService()
