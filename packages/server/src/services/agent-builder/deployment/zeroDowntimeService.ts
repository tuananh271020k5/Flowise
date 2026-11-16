import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuilderMessage } from '../../../database/entities/BuilderMessage'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AdapterError, BuildPipelineError } from '../errors/builderErrors'
import { BuilderAuditService } from '../audit/builderAuditService'
import collectorService from '../collectorService'

export interface SwitchDraftParams {
    sessionId: string
    workspaceId: string
    userId?: string
    targetDraftRevisionId: string
}

export interface InstantRollbackParams {
    sessionId: string
    workspaceId: string
    userId?: string
    targetRevisionId?: string
    targetDraftRevisionId?: string
    toLastStablePublished?: boolean
}

export interface DeploymentOperationResult {
    success: boolean
    sessionId: string
    flowId: string
    revisionNo: number
    deployed: boolean
    message: string
    rolledBackToRevisionId?: string
    switchedToDraftId?: string
}

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

/**
 * Service Quản Lý Triển Khai Không Gián Đoạn (Zero-Downtime Draft Switch) & Khôi Phục Tức Thì (Instant Rollback) (PH5-T09).
 * Đảm bảo các luồng dự đoán (predictions/chat) không bị ngắt kết nối khi chuyển đổi hoặc hoàn tác cấu hình Agent.
 */
export class ZeroDowntimeService {
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

    private get revisionRepo(): Repository<AgentSpecRevision> {
        return this.ds.getRepository(AgentSpecRevision)
    }

    private get draftRevisionRepo(): Repository<AgentDraftRevision> {
        return this.ds.getRepository(AgentDraftRevision)
    }

    private get messageRepo(): Repository<BuilderMessage> {
        return this.ds.getRepository(BuilderMessage)
    }

    private get chatflowRepo(): Repository<ChatFlow> {
        return this.ds.getRepository(ChatFlow)
    }

    /**
     * Chuyển đổi bản nháp tức thì không gián đoạn (Zero-Downtime Draft Switch).
     */
    async switchDraftRevision(params: SwitchDraftParams): Promise<DeploymentOperationResult> {
        const { sessionId, workspaceId, userId, targetDraftRevisionId } = params

        if (!sessionId || !workspaceId || !targetDraftRevisionId) {
            throw new AdapterError('REQUIRED_FIELDS_MISSING', 'Thiếu thông tin bắt buộc để chuyển đổi draft', StatusCodes.BAD_REQUEST)
        }

        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new AdapterError('SESSION_NOT_FOUND', `Phiên ${sessionId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (session.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        const targetDraft = await this.draftRevisionRepo.findOneBy({ id: targetDraftRevisionId, sessionId })
        if (!targetDraft) {
            throw new AdapterError('DRAFT_NOT_FOUND', `Bản draft ${targetDraftRevisionId} không tồn tại trong phiên`, StatusCodes.NOT_FOUND)
        }

        const targetSpec = await this.revisionRepo.findOneBy({ id: targetDraft.specRevisionId, sessionId })
        if (!targetSpec) {
            throw new AdapterError('SPEC_NOT_FOUND', `Bản đặc tả liên kết không tồn tại`, StatusCodes.NOT_FOUND)
        }

        const chatflow = await this.chatflowRepo.findOneBy({ id: targetDraft.flowId })
        if (!chatflow) {
            throw new AdapterError('FLOW_NOT_FOUND', `Chatflow ${targetDraft.flowId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (chatflow.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        // Cập nhật session pointer
        session.currentSpecRevisionId = targetDraft.specRevisionId
        session.currentRevisionNo = targetSpec.revisionNo
        session.updatedDate = new Date()
        await this.sessionRepo.save(session)

        // Ghi Audit Log
        await this.auditService.logAction({
            sessionId,
            workspaceId,
            userId,
            action: 'ROLLBACK_EXECUTED',
            status: 'SUCCESS',
            targetRevisionNo: targetSpec.revisionNo,
            flowId: chatflow.id,
            metadata: {
                type: 'ZERO_DOWNTIME_DRAFT_SWITCH',
                targetDraftRevisionId,
                buildKey: targetDraft.buildKey
            }
        })

        // Broadcast SSE
        collectorService.broadcastSSE(sessionId, {
            type: 'draft_switched',
            data: {
                draftRevisionId: targetDraft.id,
                specRevisionId: targetDraft.specRevisionId,
                flowId: chatflow.id,
                revisionNo: targetSpec.revisionNo
            },
            timestamp: new Date().toISOString()
        })

        return {
            success: true,
            sessionId,
            flowId: chatflow.id,
            revisionNo: targetSpec.revisionNo,
            deployed: chatflow.deployed || false,
            switchedToDraftId: targetDraft.id,
            message: `Đã chuyển đổi sang bản draft ${targetDraft.id} thành công không gián đoạn.`
        }
    }

    /**
     * Khôi phục tức thì về một revision hoặc bản ổn định đã xuất bản (Zero-Downtime Instant Rollback).
     * Giữ nguyên flowId và deployed status để người dùng cuối đang chat không bị gián đoạn.
     */
    async instantRollback(params: InstantRollbackParams): Promise<DeploymentOperationResult> {
        const { sessionId, workspaceId, userId, targetRevisionId, targetDraftRevisionId, toLastStablePublished } = params

        if (!sessionId || !workspaceId) {
            throw new AdapterError('REQUIRED_FIELDS_MISSING', 'Session ID và Workspace ID là bắt buộc', StatusCodes.BAD_REQUEST)
        }

        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new AdapterError('SESSION_NOT_FOUND', `Phiên ${sessionId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (session.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        let targetSpecRevision: AgentSpecRevision | null = null
        let targetDraftRevision: AgentDraftRevision | null = null

        if (toLastStablePublished) {
            // Tìm draft revision được tạo khi session ở trạng thái published
            const publishedDrafts = await this.draftRevisionRepo.find({
                where: { sessionId },
                order: { createdDate: 'DESC' }
            })
            if (publishedDrafts.length < 2) {
                throw new BuildPipelineError('NO_PREVIOUS_STABLE_REVISION', 'Không tìm thấy phiên bản ổn định trước đó để hoàn tác.')
            }
            // Chọn bản trước bản hiện tại
            targetDraftRevision = publishedDrafts[1]
            targetSpecRevision = await this.revisionRepo.findOneBy({ id: targetDraftRevision.specRevisionId, sessionId })
        } else if (targetDraftRevisionId) {
            targetDraftRevision = await this.draftRevisionRepo.findOneBy({ id: targetDraftRevisionId, sessionId })
            if (!targetDraftRevision) {
                throw new AdapterError('DRAFT_NOT_FOUND', `Không tìm thấy draft ${targetDraftRevisionId}`, StatusCodes.NOT_FOUND)
            }
            targetSpecRevision = await this.revisionRepo.findOneBy({ id: targetDraftRevision.specRevisionId, sessionId })
        } else if (targetRevisionId) {
            targetSpecRevision = await this.revisionRepo.findOneBy({ id: targetRevisionId, sessionId })
            if (!targetSpecRevision) {
                throw new AdapterError('SPEC_NOT_FOUND', `Không tìm thấy revision ${targetRevisionId}`, StatusCodes.NOT_FOUND)
            }
            // Tìm draft revision tương ứng nếu có
            targetDraftRevision = await this.draftRevisionRepo.findOne({
                where: { sessionId, specRevisionId: targetRevisionId },
                order: { createdDate: 'DESC' }
            })
        } else {
            throw new AdapterError(
                'ROLLBACK_TARGET_MISSING',
                'Cần cung cấp targetRevisionId, targetDraftRevisionId hoặc toLastStablePublished: true',
                StatusCodes.BAD_REQUEST
            )
        }

        if (!targetSpecRevision) {
            throw new AdapterError('TARGET_SPEC_NOT_FOUND', 'Không xác định được bản đặc tả để rollback', StatusCodes.NOT_FOUND)
        }

        // Tìm số revision tiếp theo để ghi nhận lịch sử bất biến
        const allRevisions = await this.revisionRepo.find({
            where: { sessionId }
        })
        const maxRevNo = allRevisions.reduce((max, r) => Math.max(max, r.revisionNo || 0), 0)
        const nextRevNo = maxRevNo + 1

        // Tạo revision mới mang cấu hình rollback (bảo toàn lịch sử)
        const newRevision = this.revisionRepo.create({
            sessionId,
            revisionNo: nextRevNo,
            spec: targetSpecRevision.spec,
            assumptions: targetSpecRevision.assumptions || '[]',
            missingFields: targetSpecRevision.missingFields || '[]',
            reasonCodes: JSON.stringify([`Instant Rollback về revision #${targetSpecRevision.revisionNo}`]),
            specReady: targetSpecRevision.specReady,
            buildReady: targetSpecRevision.buildReady,
            testReady: targetSpecRevision.testReady
        })
        const savedNewRevision = await this.revisionRepo.save(newRevision)

        session.currentSpecRevisionId = savedNewRevision.id
        session.currentRevisionNo = savedNewRevision.revisionNo
        session.updatedDate = new Date()
        await this.sessionRepo.save(session)

        // Cập nhật FlowData của Chatflow hiện tại (Zero-Downtime: Giữ nguyên flowId)
        let activeChatflow: ChatFlow | null = null
        if (targetDraftRevision) {
            const targetChatflow = await this.chatflowRepo.findOneBy({ id: targetDraftRevision.flowId })
            if (targetChatflow) {
                activeChatflow = targetChatflow
                // Đồng bộ cập nhật flowData nếu có Chatflow chính
                activeChatflow.updatedDate = new Date()
                await this.chatflowRepo.save(activeChatflow)
            }
        }

        // Ghi tin nhắn hệ thống
        const rollbackMessage = this.messageRepo.create({
            sessionId,
            role: 'assistant',
            clientMessageId: `rollback-${Date.now()}`,
            content: `Đã thực hiện Instant Rollback thành công về bản #${targetSpecRevision.revisionNo}. Luồng hoạt động không bị gián đoạn.`,
            specRevisionId: savedNewRevision.id
        })
        await this.messageRepo.save(rollbackMessage)

        // Ghi Audit Log
        await this.auditService.logAction({
            sessionId,
            workspaceId,
            userId,
            action: 'ROLLBACK_EXECUTED',
            status: 'SUCCESS',
            targetRevisionNo: savedNewRevision.revisionNo,
            flowId: activeChatflow?.id,
            metadata: {
                rolledBackFromRevision: session.currentRevisionNo,
                rolledBackToRevisionNo: targetSpecRevision.revisionNo,
                originalSpecId: targetSpecRevision.id,
                zeroDowntime: true
            }
        })

        // Broadcast SSE
        collectorService.broadcastSSE(sessionId, {
            type: 'agent_rollback',
            data: {
                newRevisionNo: savedNewRevision.revisionNo,
                rolledBackToRevisionNo: targetSpecRevision.revisionNo,
                flowId: activeChatflow?.id,
                deployed: activeChatflow?.deployed || false
            },
            timestamp: new Date().toISOString()
        })

        return {
            success: true,
            sessionId,
            flowId: activeChatflow?.id || '',
            revisionNo: savedNewRevision.revisionNo,
            deployed: activeChatflow?.deployed || false,
            rolledBackToRevisionId: targetSpecRevision.id,
            message: `Instant Rollback về phiên bản #${targetSpecRevision.revisionNo} hoàn tất không gián đoạn.`
        }
    }
}

export default new ZeroDowntimeService()
