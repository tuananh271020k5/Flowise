import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AgentSpec } from '../types'
import { createAgentPlan, validateAgentPlan } from '../generator/agentPlan'
import compiler from '../generator/compiler'
import { validateFlowGraph } from '../generator/flowValidator'
import { FlowiseDraftAdapter } from '../adapter/flowiseDraftAdapter'
import collectorService from '../collectorService'
import { AdapterError, BuildPipelineError, CompilerError } from '../errors/builderErrors'

export interface BuildExecutionResult {
    success: boolean
    isExisting: boolean
    flowId: string
    draftRevisionId: string
    buildKey: string
    flowName: string
    revisionNo: number
}

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

export class BuildPipelineService {
    private draftAdapter: FlowiseDraftAdapter

    constructor(private customDataSource?: DataSource) {
        this.draftAdapter = new FlowiseDraftAdapter(customDataSource)
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

    /**
     * Điều phối toàn bộ quy trình build từ Spec Revision thành Flowise Draft Chatflow (PH2-T08).
     * Đảm bảo tính Idempotency tuyệt đối theo buildKey (hoặc sessionId:revisionId).
     */
    async executeBuild(params: {
        sessionId: string
        workspaceId: string
        specRevisionId?: string
        customBuildKey?: string
    }): Promise<BuildExecutionResult> {
        const { sessionId, workspaceId, specRevisionId, customBuildKey } = params

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

        // 2. Tìm AgentSpecRevision phù hợp
        let targetRevision: AgentSpecRevision | null = null
        if (specRevisionId) {
            targetRevision = await this.revisionRepo.findOneBy({ id: specRevisionId, sessionId })
        } else if (session.currentSpecRevisionId) {
            targetRevision = await this.revisionRepo.findOneBy({ id: session.currentSpecRevisionId, sessionId })
        } else {
            const revisions = await this.revisionRepo.find({
                where: { sessionId },
                order: { revisionNo: 'DESC' },
                take: 1
            })
            targetRevision = revisions.length > 0 ? revisions[0] : null
        }

        if (!targetRevision) {
            throw new BuildPipelineError('NO_SPEC_REVISION', 'Không tìm thấy bản đặc tả nào trong phiên này', StatusCodes.NOT_FOUND)
        }

        // 3. Kiểm tra tính sẵn sàng (Readiness check)
        if (!targetRevision.buildReady) {
            throw new BuildPipelineError(
                'SPEC_NOT_READY_FOR_BUILD',
                'Bản đặc tả chưa sẵn sàng để biên dịch (buildReady: false). Vui lòng cung cấp đầy đủ thông tin bắt buộc.',
                StatusCodes.BAD_REQUEST
            )
        }

        // 4. Kiểm tra Idempotency thông qua buildKey
        const buildKey = customBuildKey || `${sessionId}:${targetRevision.id}`
        const existingDraftRevision = await this.draftRevisionRepo.findOneBy({ buildKey })

        if (existingDraftRevision) {
            try {
                // Kiểm tra flow còn tồn tại trong DB không
                const existingDraft = await this.draftAdapter.getDraftById(existingDraftRevision.flowId, workspaceId)
                return {
                    success: true,
                    isExisting: true,
                    flowId: existingDraftRevision.flowId,
                    draftRevisionId: existingDraftRevision.id,
                    buildKey,
                    flowName: existingDraft.chatflow.name,
                    revisionNo: targetRevision.revisionNo
                }
            } catch {
                // Nếu flow đã bị xóa trước đó, tiếp tục quy trình tái tạo mới
            }
        }

        // 5. Chuyển đổi và thẩm định Spec
        let spec: AgentSpec
        try {
            spec = JSON.parse(targetRevision.spec)
        } catch (e: any) {
            throw new BuildPipelineError('INVALID_SPEC_JSON', `Dữ liệu spec không phải JSON hợp lệ: ${e.message}`)
        }

        // 6. Lập AgentPlan và Validate Plan
        const plan = createAgentPlan(spec, targetRevision.id)
        const planValidation = validateAgentPlan(plan)
        if (!planValidation.valid) {
            throw new CompilerError('COMPILER_INVALID_PLAN', `Kế hoạch biên dịch không hợp lệ: ${planValidation.errors.join('; ')}`)
        }

        // 7. Biên dịch Graph tất định
        const compiledGraph = compiler.compile(plan)

        // 8. Server Flow Validation
        const flowValidation = validateFlowGraph(compiledGraph)
        if (!flowValidation.valid) {
            throw new CompilerError('COMPILER_INVALID_GRAPH', `Đồ thị sinh ra không hợp lệ: ${flowValidation.errors.join('; ')}`)
        }

        // 9. Lưu trữ hoặc cập nhật ChatFlow Draft
        // Tìm draft trước đó của cùng session nếu có
        const previousDrafts = await this.draftRevisionRepo.find({
            where: { sessionId },
            order: { createdDate: 'DESC' },
            take: 1
        })

        let targetFlow: ChatFlow
        if (previousDrafts.length > 0) {
            try {
                targetFlow = await this.draftAdapter.updateDraft(previousDrafts[0].flowId, workspaceId, compiledGraph)
            } catch {
                targetFlow = await this.draftAdapter.createDraft(workspaceId, compiledGraph)
            }
        } else {
            targetFlow = await this.draftAdapter.createDraft(workspaceId, compiledGraph)
        }

        // 10. Ghi nhận AgentDraftRevision mapping
        const draftRevision = this.draftRevisionRepo.create({
            sessionId,
            specRevisionId: targetRevision.id,
            buildKey,
            flowId: targetFlow.id,
            planId: plan.id,
            templateId: plan.templateId,
            templateVersion: plan.templateVersion
        })
        const savedDraftRevision = await this.draftRevisionRepo.save(draftRevision)

        // 11. Cập nhật BuilderSession
        session.state = 'ready'
        session.title = compiledGraph.flowConfig?.name || session.title
        await this.sessionRepo.save(session)

        // 12. Phát SSE thông báo build hoàn tất
        collectorService.broadcastSSE(sessionId, {
            type: 'build_completed',
            data: {
                flowId: targetFlow.id,
                buildKey,
                flowName: targetFlow.name,
                revisionNo: targetRevision.revisionNo
            },
            timestamp: new Date().toISOString()
        })

        return {
            success: true,
            isExisting: false,
            flowId: targetFlow.id,
            draftRevisionId: savedDraftRevision.id,
            buildKey,
            flowName: targetFlow.name,
            revisionNo: targetRevision.revisionNo
        }
    }

    /**
     * Lấy lịch sử draft mappings theo sessionId.
     */
    async getDraftHistory(sessionId: string, workspaceId: string): Promise<AgentDraftRevision[]> {
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new AdapterError('SESSION_NOT_FOUND', `Phiên thiết kế ${sessionId} không tồn tại`, StatusCodes.NOT_FOUND)
        }
        if (session.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        return this.draftRevisionRepo.find({
            where: { sessionId },
            order: { createdDate: 'ASC' }
        })
    }
}

export default new BuildPipelineService()
