import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AdapterError, BuildPipelineError } from '../errors/builderErrors'
import { AgentSpec } from '../types'
import collectorService from '../collectorService'
import { BuilderAuditService } from '../audit/builderAuditService'
import { EvaluationRunnerService } from './evaluationRunnerService'

export interface PublishParams {
    sessionId: string
    workspaceId: string
    userId?: string
    isPublic?: boolean
    minPassRate?: number
    notes?: string
}

export interface PublishResult {
    success: boolean
    flowId: string
    flowName: string
    deployed: boolean
    isPublic: boolean
    revisionNo: number
    passRate?: number
    publishedAt: string
    message: string
}

export interface UnpublishResult {
    success: boolean
    flowId: string
    flowName: string
    deployed: boolean
    isPublic: boolean
    message: string
}

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

/**
 * Service Cổng Phê Duyệt và Xuất Bản An Toàn cho Agent Builder (PH5-T01).
 * Kiểm soát chất lượng (Quality Gate), phân quyền cách ly workspace và chuyển trạng thái deployed/isPublic.
 */
export class PublishService {
    private auditService: BuilderAuditService
    private evalRunner: EvaluationRunnerService

    constructor(private customDataSource?: DataSource) {
        this.auditService = new BuilderAuditService(customDataSource)
        this.evalRunner = new EvaluationRunnerService(customDataSource)
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

    private get chatflowRepo(): Repository<ChatFlow> {
        return this.ds.getRepository(ChatFlow)
    }

    /**
     * Xuất bản Agent đã kiểm thử (PH5-T01).
     * Kiểm tra chặt chẽ Quality Gate và ghi nhận Audit Log.
     */
    async publishAgent(params: PublishParams): Promise<PublishResult> {
        const { sessionId, workspaceId, userId, isPublic = false, minPassRate = 0.8, notes } = params

        if (!sessionId) {
            throw new AdapterError('SESSION_ID_REQUIRED', 'Session ID is required', StatusCodes.BAD_REQUEST)
        }
        if (!workspaceId) {
            throw new AdapterError('WORKSPACE_REQUIRED', 'Workspace ID is required', StatusCodes.BAD_REQUEST)
        }

        // 1. Kiểm tra session và cách ly workspace (Negative Auth: 403 Forbidden)
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new AdapterError('SESSION_NOT_FOUND', `Phiên thiết kế ${sessionId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (session.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        // 2. Tìm AgentSpecRevision hiện tại
        if (!session.currentSpecRevisionId) {
            throw new BuildPipelineError('NO_SPEC_REVISION', 'Phiên thiết kế chưa có bản đặc tả nào')
        }

        const targetRevision = await this.revisionRepo.findOneBy({ id: session.currentSpecRevisionId, sessionId })
        if (!targetRevision) {
            throw new AdapterError('REVISION_NOT_FOUND', `Bản đặc tả ${session.currentSpecRevisionId} không tồn tại`, StatusCodes.NOT_FOUND)
        }

        if (!targetRevision.buildReady) {
            throw new BuildPipelineError(
                'SPEC_NOT_READY',
                `Bản đặc tả v${targetRevision.revisionNo} chưa sẵn sàng để xuất bản (buildReady: false)`
            )
        }

        // 3. Tìm bản draft revision mới nhất
        const draftRevision = await this.draftRevisionRepo.findOne({
            where: { sessionId },
            order: { createdDate: 'DESC' }
        })

        if (!draftRevision) {
            throw new AdapterError(
                'NO_DRAFT_FOUND',
                `Phiên ${sessionId} chưa có bản biên dịch Chatflow draft nào. Vui lòng build trước khi xuất bản.`,
                StatusCodes.NOT_FOUND
            )
        }

        // 4. Tìm ChatFlow tương ứng
        const chatflow = await this.chatflowRepo.findOneBy({ id: draftRevision.flowId })
        if (!chatflow) {
            throw new AdapterError('FLOW_NOT_FOUND', `Bản flow ${draftRevision.flowId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (chatflow.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        // 5. Cổng Kiểm Soát Chất Lượng (Quality Gate)
        let spec: AgentSpec
        try {
            spec = JSON.parse(targetRevision.spec)
        } catch {
            throw new BuildPipelineError('INVALID_SPEC_JSON', 'Dữ liệu spec không phải JSON hợp lệ')
        }

        let passRate: number | undefined
        if (spec.evaluationExamples && spec.evaluationExamples.length > 0) {
            const suiteResult = await this.evalRunner.runTestSuite({
                flowId: chatflow.id,
                workspaceId,
                examples: spec.evaluationExamples
            })

            passRate = suiteResult.totalCount > 0 ? suiteResult.passedCount / suiteResult.totalCount : 0

            if (passRate < minPassRate) {
                // Ghi nhận Audit Log từ chối
                await this.auditService.logAction({
                    sessionId,
                    workspaceId,
                    userId,
                    action: 'AGENT_PUBLISHED',
                    status: 'REJECTED',
                    targetRevisionNo: targetRevision.revisionNo,
                    flowId: chatflow.id,
                    metadata: {
                        reason: 'QUALITY_GATE_FAILED',
                        passRate: (passRate * 100).toFixed(1) + '%',
                        minPassRate: (minPassRate * 100).toFixed(1) + '%',
                        failedCount: suiteResult.failedCount,
                        notes
                    }
                })

                throw new BuildPipelineError(
                    'PUBLISH_QUALITY_GATE_FAILED',
                    `Chất lượng Agent chưa đạt ngưỡng an toàn xuất bản (Tỷ lệ đạt: ${(passRate * 100).toFixed(0)}% < ${(
                        minPassRate * 100
                    ).toFixed(0)}%). Vui lòng kiểm tra lại kịch bản kiểm thử.`
                )
            }
        }

        // 6. Thực thi chuyển đổi trạng thái Xuất Bản
        chatflow.deployed = true
        chatflow.isPublic = isPublic
        await this.chatflowRepo.save(chatflow)

        session.state = 'published'
        await this.sessionRepo.save(session)

        // 7. Ghi nhận Audit Log thành công (PH5-T02)
        await this.auditService.logAction({
            sessionId,
            workspaceId,
            userId,
            action: 'AGENT_PUBLISHED',
            status: 'SUCCESS',
            targetRevisionNo: targetRevision.revisionNo,
            flowId: chatflow.id,
            metadata: {
                isPublic,
                passRate: passRate !== undefined ? (passRate * 100).toFixed(1) + '%' : 'untested',
                notes
            }
        })

        // 8. Phát sự kiện realtime SSE tới client
        collectorService.broadcastSSE(sessionId, {
            type: 'agent_published',
            data: {
                flowId: chatflow.id,
                deployed: true,
                isPublic,
                revisionNo: targetRevision.revisionNo
            },
            timestamp: new Date().toISOString()
        })

        return {
            success: true,
            flowId: chatflow.id,
            flowName: chatflow.name,
            deployed: true,
            isPublic,
            revisionNo: targetRevision.revisionNo,
            passRate,
            publishedAt: new Date().toISOString(),
            message: `Trợ lý ${chatflow.name} đã được phê duyệt và xuất bản thành công!`
        }
    }

    /**
     * Thu hồi xuất bản (Unpublish) đưa Agent về trạng thái nháp (draft).
     */
    async unpublishAgent(params: { sessionId: string; workspaceId: string; userId?: string }): Promise<UnpublishResult> {
        const { sessionId, workspaceId, userId } = params

        if (!sessionId || !workspaceId) {
            throw new AdapterError('REQUIRED_FIELDS_MISSING', 'Session ID and Workspace ID are required', StatusCodes.BAD_REQUEST)
        }

        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new AdapterError('SESSION_NOT_FOUND', `Phiên thiết kế ${sessionId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (session.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        const draftRevision = await this.draftRevisionRepo.findOne({
            where: { sessionId },
            order: { createdDate: 'DESC' }
        })

        if (!draftRevision) {
            throw new AdapterError('NO_DRAFT_FOUND', 'Không tìm thấy bản flow draft', StatusCodes.NOT_FOUND)
        }

        const chatflow = await this.chatflowRepo.findOneBy({ id: draftRevision.flowId })
        if (!chatflow) {
            throw new AdapterError('FLOW_NOT_FOUND', 'Không tìm thấy Chatflow', StatusCodes.NOT_FOUND)
        }
        if (chatflow.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        chatflow.deployed = false
        chatflow.isPublic = false
        await this.chatflowRepo.save(chatflow)

        session.state = 'ready'
        await this.sessionRepo.save(session)

        await this.auditService.logAction({
            sessionId,
            workspaceId,
            userId,
            action: 'AGENT_UNPUBLISHED',
            status: 'SUCCESS',
            flowId: chatflow.id
        })

        collectorService.broadcastSSE(sessionId, {
            type: 'agent_unpublished',
            data: { flowId: chatflow.id, deployed: false },
            timestamp: new Date().toISOString()
        })

        return {
            success: true,
            flowId: chatflow.id,
            flowName: chatflow.name,
            deployed: false,
            isPublic: false,
            message: `Trợ lý ${chatflow.name} đã được thu hồi xuất bản.`
        }
    }
}

export default new PublishService()
