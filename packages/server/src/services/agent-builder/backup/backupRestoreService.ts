import * as crypto from 'crypto'
import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { BuilderMessage } from '../../../database/entities/BuilderMessage'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuildJob } from '../../../database/entities/BuildJob'
import { BuilderAuditLog } from '../../../database/entities/BuilderAuditLog'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AdapterError } from '../errors/builderErrors'
import { BuilderAuditService } from '../audit/builderAuditService'

export interface SessionBackupBundle {
    version: string
    exportedAt: string
    sessionId: string
    workspaceId: string
    title: string
    session: Partial<BuilderSession>
    messages: Partial<BuilderMessage>[]
    specRevisions: Partial<AgentSpecRevision>[]
    draftRevisions: Partial<AgentDraftRevision>[]
    buildJobs: Partial<BuildJob>[]
    auditLogs: Partial<BuilderAuditLog>[]
    checksum: string
}

export interface ImportBackupOptions {
    overwrite?: boolean
    remapIds?: boolean
}

export interface SchemaValidationResult {
    valid: boolean
    tablesChecked: string[]
    orphanedRecords: {
        messages: number
        specRevisions: number
        draftRevisions: number
        buildJobs: number
        auditLogs: number
    }
    totalOrphaned: number
    errors: string[]
}

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

/**
 * Service Quản Lý Sao Lưu (Backup), Phục Hồi (Restore) và Xác Minh Toàn Vẹn CSDL (PH5-T08).
 * Đảm bảo dữ liệu Agent Builder có thể sao lưu an toàn, phục hồi nguyên vẹn và kiểm tra schema invariants.
 */
export class BackupRestoreService {
    private auditService: BuilderAuditService

    constructor(private customDataSource?: DataSource) {
        this.auditService = new BuilderAuditService(customDataSource)
    }

    private get ds(): DataSource {
        return getActiveDataSource(this.customDataSource)
    }

    private get sessionRepo(): Repository<BuilderSession> {
        return this.ds.getRepository(BuilderSession)
    }

    private get messageRepo(): Repository<BuilderMessage> {
        return this.ds.getRepository(BuilderMessage)
    }

    private get specRevisionRepo(): Repository<AgentSpecRevision> {
        return this.ds.getRepository(AgentSpecRevision)
    }

    private get draftRevisionRepo(): Repository<AgentDraftRevision> {
        return this.ds.getRepository(AgentDraftRevision)
    }

    private get buildJobRepo(): Repository<BuildJob> {
        return this.ds.getRepository(BuildJob)
    }

    private get auditLogRepo(): Repository<BuilderAuditLog> {
        return this.ds.getRepository(BuilderAuditLog)
    }

    private computeChecksum(payload: Omit<SessionBackupBundle, 'checksum'>): string {
        const str = JSON.stringify({
            sessionId: payload.sessionId,
            workspaceId: payload.workspaceId,
            session: payload.session,
            messages: payload.messages,
            specRevisions: payload.specRevisions,
            draftRevisions: payload.draftRevisions,
            buildJobs: payload.buildJobs
        })
        return crypto.createHash('sha256').update(str).digest('hex')
    }

    /**
     * Xuất dữ liệu sao lưu (backup) của một phiên làm việc (PH5-T08).
     */
    async exportSessionBackup(sessionId: string, workspaceId: string): Promise<SessionBackupBundle> {
        if (!sessionId || !workspaceId) {
            throw new AdapterError('REQUIRED_FIELDS_MISSING', 'Session ID and Workspace ID are required', StatusCodes.BAD_REQUEST)
        }

        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new AdapterError('SESSION_NOT_FOUND', `Phiên ${sessionId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (session.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        const [messages, specRevisions, draftRevisions, buildJobs, auditLogs] = await Promise.all([
            this.messageRepo.find({ where: { sessionId }, order: { createdDate: 'ASC' } }),
            this.specRevisionRepo.find({ where: { sessionId }, order: { revisionNo: 'ASC' } }),
            this.draftRevisionRepo.find({ where: { sessionId }, order: { createdDate: 'ASC' } }),
            this.buildJobRepo.find({ where: { sessionId }, order: { createdDate: 'ASC' } }),
            this.auditLogRepo.find({ where: { sessionId }, order: { createdDate: 'ASC' } })
        ])

        const bundlePayload: Omit<SessionBackupBundle, 'checksum'> = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            sessionId: session.id,
            workspaceId: session.workspaceId,
            title: session.title,
            session: {
                id: session.id,
                workspaceId: session.workspaceId,
                organizationId: session.organizationId,
                userId: session.userId,
                title: session.title,
                state: session.state,
                currentSpecRevisionId: session.currentSpecRevisionId,
                currentRevisionNo: session.currentRevisionNo,
                buildIntent: session.buildIntent,
                createdDate: session.createdDate,
                updatedDate: session.updatedDate
            },
            messages,
            specRevisions,
            draftRevisions,
            buildJobs,
            auditLogs
        }

        const checksum = this.computeChecksum(bundlePayload)
        return {
            ...bundlePayload,
            checksum
        }
    }

    /**
     * Nhập và khôi phục (restore) phiên làm việc từ bản sao lưu (PH5-T08).
     */
    async importSessionBackup(
        bundle: SessionBackupBundle,
        targetWorkspaceId: string,
        userId?: string,
        options: ImportBackupOptions = { overwrite: true }
    ): Promise<{
        success: boolean
        sessionId: string
        restoredEntities: Record<string, number>
    }> {
        if (!bundle || !bundle.sessionId || !bundle.session) {
            throw new AdapterError('INVALID_BACKUP_BUNDLE', 'Dữ liệu sao lưu không hợp lệ', StatusCodes.BAD_REQUEST)
        }

        // Kiểm tra tính toàn vẹn checksum
        const { checksum, ...payload } = bundle
        const expectedChecksum = this.computeChecksum(payload)
        if (checksum && checksum !== expectedChecksum) {
            throw new AdapterError('CHECKSUM_MISMATCH', 'Toàn vẹn dữ liệu backup bị vi phạm (checksum mismatch)', StatusCodes.BAD_REQUEST)
        }

        const existingSession = await this.sessionRepo.findOneBy({ id: bundle.sessionId })
        if (existingSession && !options.overwrite) {
            throw new AdapterError('SESSION_EXISTS', `Phiên ${bundle.sessionId} đã tồn tại và overwrite = false`, StatusCodes.CONFLICT)
        }

        // Tạo hoặc cập nhật session
        const sessionToSave = this.sessionRepo.create({
            ...bundle.session,
            workspaceId: targetWorkspaceId,
            userId: userId || bundle.session.userId || 'system'
        })
        await this.sessionRepo.save(sessionToSave)

        // Phục hồi Messages
        let restoredMessagesCount = 0
        if (bundle.messages && bundle.messages.length > 0) {
            for (const msg of bundle.messages) {
                const messageEntity = this.messageRepo.create({
                    ...msg,
                    sessionId: bundle.sessionId
                })
                await this.messageRepo.save(messageEntity)
                restoredMessagesCount++
            }
        }

        // Phục hồi Spec Revisions
        let restoredSpecsCount = 0
        if (bundle.specRevisions && bundle.specRevisions.length > 0) {
            for (const specRev of bundle.specRevisions) {
                const specEntity = this.specRevisionRepo.create({
                    ...specRev,
                    sessionId: bundle.sessionId
                })
                await this.specRevisionRepo.save(specEntity)
                restoredSpecsCount++
            }
        }

        // Phục hồi Draft Revisions
        let restoredDraftsCount = 0
        if (bundle.draftRevisions && bundle.draftRevisions.length > 0) {
            for (const draft of bundle.draftRevisions) {
                const draftEntity = this.draftRevisionRepo.create({
                    ...draft,
                    sessionId: bundle.sessionId
                })
                await this.draftRevisionRepo.save(draftEntity)
                restoredDraftsCount++
            }
        }

        // Phục hồi Build Jobs
        let restoredJobsCount = 0
        if (bundle.buildJobs && bundle.buildJobs.length > 0) {
            for (const job of bundle.buildJobs) {
                const jobEntity = this.buildJobRepo.create({
                    ...job,
                    sessionId: bundle.sessionId,
                    workspaceId: targetWorkspaceId
                })
                await this.buildJobRepo.save(jobEntity)
                restoredJobsCount++
            }
        }

        // Ghi Audit Log phục hồi thành công
        await this.auditService.logAction({
            sessionId: bundle.sessionId,
            workspaceId: targetWorkspaceId,
            userId,
            action: 'SESSION_CREATED',
            status: 'SUCCESS',
            metadata: {
                restoredFromBackup: true,
                exportedAt: bundle.exportedAt,
                restoredMessagesCount,
                restoredSpecsCount,
                restoredDraftsCount
            }
        })

        return {
            success: true,
            sessionId: bundle.sessionId,
            restoredEntities: {
                messages: restoredMessagesCount,
                specRevisions: restoredSpecsCount,
                draftRevisions: restoredDraftsCount,
                buildJobs: restoredJobsCount
            }
        }
    }

    /**
     * Xác minh tính toàn vẹn (Schema Invariants) của toàn bộ các bảng Agent Builder (PH5-T08).
     * Phát hiện các bản ghi mồ côi (orphaned records) hoặc vi phạm toàn vẹn quan hệ.
     */
    async validateSchemaInvariants(): Promise<SchemaValidationResult> {
        const tablesChecked = [
            'builder_session',
            'builder_message',
            'agent_spec_revision',
            'agent_draft_revision',
            'build_job',
            'builder_audit_log'
        ]

        const sessions = await this.sessionRepo.find({ select: ['id'] })
        const sessionIds = new Set(sessions.map((s) => s.id))

        const [messages, specRevisions, draftRevisions, buildJobs, auditLogs] = await Promise.all([
            this.messageRepo.find({ select: ['id', 'sessionId'] }),
            this.specRevisionRepo.find({ select: ['id', 'sessionId'] }),
            this.draftRevisionRepo.find({ select: ['id', 'sessionId'] }),
            this.buildJobRepo.find({ select: ['id', 'sessionId'] }),
            this.auditLogRepo.find({ select: ['id', 'sessionId'] })
        ])

        const orphaned = {
            messages: messages.filter((m) => !sessionIds.has(m.sessionId)).length,
            specRevisions: specRevisions.filter((s) => !sessionIds.has(s.sessionId)).length,
            draftRevisions: draftRevisions.filter((d) => !sessionIds.has(d.sessionId)).length,
            buildJobs: buildJobs.filter((j) => !sessionIds.has(j.sessionId)).length,
            auditLogs: auditLogs.filter((a) => !sessionIds.has(a.sessionId)).length
        }

        const totalOrphaned = orphaned.messages + orphaned.specRevisions + orphaned.draftRevisions + orphaned.buildJobs + orphaned.auditLogs

        const errors: string[] = []
        if (totalOrphaned > 0) {
            errors.push(`Phát hiện ${totalOrphaned} bản ghi mồ côi không có session tương ứng trong cơ sở dữ liệu.`)
        }

        return {
            valid: errors.length === 0,
            tablesChecked,
            orphanedRecords: orphaned,
            totalOrphaned,
            errors
        }
    }
}

export default new BackupRestoreService()
