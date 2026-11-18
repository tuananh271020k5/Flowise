import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuildJob } from '../../../database/entities/BuildJob'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { DocumentStore } from '../../../database/entities/DocumentStore'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AgentSpec } from '../types'
import { createAgentPlan, validateAgentPlan } from '../generator/agentPlan'
import compiler from '../generator/compiler'
import { validateFlowGraph } from '../generator/flowValidator'
import { FlowiseDraftAdapter } from '../adapter/flowiseDraftAdapter'
import { BuildJobManager } from './buildJobManager'
import collectorService from '../collectorService'
import modelSettingsService from '../modelSettingsService'
import { AdapterError, BuildPipelineError, CompilerError } from '../errors/builderErrors'

export interface BuildExecutionResult {
    success: boolean
    isExisting: boolean
    flowId: string
    draftRevisionId: string
    buildKey: string
    flowName: string
    revisionNo: number
    jobId?: string
    cancelled?: boolean
    message?: string
}

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

export class BuildPipelineService {
    private draftAdapter: FlowiseDraftAdapter
    private jobManager: BuildJobManager

    constructor(private customDataSource?: DataSource) {
        this.draftAdapter = new FlowiseDraftAdapter(customDataSource)
        this.jobManager = new BuildJobManager(customDataSource)
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

    private get jobRepo(): Repository<BuildJob> {
        return this.ds.getRepository(BuildJob)
    }

    /**
     * Tìm DocumentStore thật theo tên: collector có thể dính kèm mô tả vào tên kho
     * (vd "Iphone làm nguồn kiến thức..."). Thứ tự: trùng chính xác > tên store nằm trong chuỗi
     * trích ra > chuỗi trích ra nằm trong tên store. Ưu tiên tên dài nhất khớp để tránh trúng kho ngắn chung chung.
     */
    private async findStoreByName(workspaceId: string, rawName: string): Promise<DocumentStore | undefined> {
        const name = rawName.trim().toLowerCase()
        if (!name) return undefined
        const stores = await this.ds.getRepository(DocumentStore).find({ where: { workspaceId } })
        const candidates = stores
            .map((store) => ({ store, name: (store.name || '').trim().toLowerCase() }))
            .filter((candidate) => candidate.name.length >= 2)
        const exact = candidates.find((candidate) => candidate.name === name)
        if (exact) return exact.store
        const inside = candidates.filter((candidate) => name.includes(candidate.name)).sort((a, b) => b.name.length - a.name.length)
        if (inside.length) return inside[0].store
        const outside = candidates.filter((candidate) => candidate.name.includes(name)).sort((a, b) => b.name.length - a.name.length)
        if (outside.length) return outside[0].store
        return undefined
    }

    /**
     * Đổi id dataSources type documentStore sang ID DocumentStore thật trong workspace theo tên (case-insensitive).
     * Không tìm thấy hoặc chưa upsert thì chặn build; không lưu graph trỏ vào ID mẫu/nguồn không truy cập được.
     */
    private async resolveDataSourceStoreIds(spec: AgentSpec, workspaceId: string) {
        if (!Array.isArray(spec.dataSources) || spec.dataSources.length === 0) return
        for (const source of spec.dataSources) {
            if (!source || source.type !== 'documentStore') continue
            const oldId = source.id
            let store = await this.ds.getRepository(DocumentStore).findOneBy({ id: source.id, workspaceId })
            if (!store && !/^[a-f0-9-]{36}$/i.test(source.id)) store = (await this.findStoreByName(workspaceId, source.name)) || null
            if (!store || store.status !== 'UPSERTED')
                throw new CompilerError(
                    'KNOWLEDGE_SOURCE_NOT_READY',
                    `Nguồn ${source.name || source.id} không có trong workspace hoặc chưa sẵn sàng truy xuất.`
                )
            if (store) {
                source.id = store.id
                source.name = store.name
                for (const step of spec.workflow?.steps || [])
                    if (step.sourceIds) step.sourceIds = step.sourceIds.map((id) => (id === oldId ? store!.id : id))
            }
        }
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

        // 4. Kiểm tra Idempotency thông qua buildKey & BuildJob (PH2-T09)
        const buildKey = customBuildKey || `${sessionId}:${targetRevision.id}`
        const { job, isNew } = await this.jobManager.createOrGetJob({
            sessionId,
            workspaceId,
            specRevisionId: targetRevision.id,
            customBuildKey: buildKey
        })

        const existingDraftRevision = await this.draftRevisionRepo.findOneBy({ buildKey })

        if (existingDraftRevision && !isNew && job.state === 'completed') {
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
                    revisionNo: targetRevision.revisionNo,
                    jobId: job.id
                }
            } catch {
                // Nếu flow đã bị xóa trước đó, tiếp tục quy trình tái tạo mới
            }
        }

        // 4.1. Kiểm tra nếu Job đã bị hủy từ trước (PH3-T06 Cancel Guard)
        if (job.state === 'cancelled') {
            return {
                success: false,
                isExisting: false,
                cancelled: true,
                flowId: '',
                draftRevisionId: '',
                buildKey,
                flowName: '',
                revisionNo: targetRevision.revisionNo,
                jobId: job.id,
                message: `Tác vụ build ${job.id} đã bị hủy (${job.cancelReason || 'cancelled'})`
            }
        }

        // Bắt đầu job
        await this.jobManager.startJob(job.id, workspaceId)

        try {
            // 5. Chuyển đổi và thẩm định Spec
            let spec: AgentSpec
            try {
                spec = JSON.parse(targetRevision.spec)
            } catch (e: any) {
                throw new BuildPipelineError('INVALID_SPEC_JSON', `Dữ liệu spec không phải JSON hợp lệ: ${e.message}`)
            }

            // 5.5. Nối kho tài liệu trong spec với DocumentStore thật của workspace theo tên (B-029/PH4).
            // Collector chỉ trích được tên kho từ hội thoại; ID thật mới giúp Agent truy xuất được tài liệu.
            if (!this.customDataSource) await this.resolveDataSourceStoreIds(spec, workspaceId)

            // 6. Lập AgentPlan và Validate Plan
            const plan = createAgentPlan(spec, targetRevision.id)
            const planValidation = validateAgentPlan(plan)
            if (!planValidation.valid) {
                throw new CompilerError('COMPILER_INVALID_PLAN', `Kế hoạch biên dịch không hợp lệ: ${planValidation.errors.join('; ')}`)
            }

            // 7. Biên dịch Graph tất định
            const compiledGraph = compiler.compile(plan)
            if (!this.customDataSource) {
                const profile = await modelSettingsService.getProfile(workspaceId)
                const app = getRunningExpressApp()
                for (const node of compiledGraph.nodes) {
                    const metadata = app.nodesPool.componentNodes[node.data.name]
                    if (!metadata) throw new CompilerError('NODE_UNAVAILABLE', `Runtime chưa nạp node ${node.data.name}`)
                    node.data.version = metadata.version
                    node.data.inputParams = metadata.inputs || []
                    if (node.data.name === 'agentAgentflow')
                        node.data.inputs.agentModelConfig = {
                            modelName: profile.modelName,
                            basepath: profile.baseUrl,
                            FLOWISE_CREDENTIAL_ID: profile.credentialId,
                            temperature: 0.3,
                            streaming: false,
                            timeout: 30000
                        }
                    if (node.data.name === 'llmAgentflow')
                        node.data.inputs.llmModelConfig = {
                            modelName: profile.modelName,
                            basepath: profile.baseUrl,
                            FLOWISE_CREDENTIAL_ID: profile.credentialId,
                            temperature: 0.3,
                            streaming: false,
                            timeout: 30000
                        }
                }
            }

            // 8. Server Flow Validation
            const flowValidation = validateFlowGraph(compiledGraph)
            if (!flowValidation.valid) {
                throw new CompilerError('COMPILER_INVALID_GRAPH', `Đồ thị sinh ra không hợp lệ: ${flowValidation.errors.join('; ')}`)
            }

            // 8.1. Kiểm tra Hủy bỏ hoặc Superseded Guard (PH3-T06)
            const currentJob = await this.jobRepo.findOneBy({ id: job.id })
            if (currentJob?.state === 'cancelled') {
                return {
                    success: false,
                    isExisting: false,
                    cancelled: true,
                    flowId: '',
                    draftRevisionId: '',
                    buildKey,
                    flowName: '',
                    revisionNo: targetRevision.revisionNo,
                    jobId: job.id,
                    message: `Tác vụ build ${job.id} đã bị hủy (${currentJob.cancelReason || 'cancelled'})`
                }
            }

            const newerRevisions = await this.revisionRepo.find({
                where: { sessionId },
                order: { revisionNo: 'DESC' },
                take: 1
            })
            if (newerRevisions.length > 0 && newerRevisions[0].revisionNo > targetRevision.revisionNo) {
                await this.jobManager.cancelJob(job.id, workspaceId, `superseded by revision ${newerRevisions[0].revisionNo}`)
                return {
                    success: false,
                    isExisting: false,
                    cancelled: true,
                    flowId: '',
                    draftRevisionId: '',
                    buildKey,
                    flowName: '',
                    revisionNo: targetRevision.revisionNo,
                    jobId: job.id,
                    message: `Tác vụ build của revision ${targetRevision.revisionNo} đã bị superseded bởi revision mới hơn (${newerRevisions[0].revisionNo})`
                }
            }

            // 9. Save a distinct flow for this revision.
            // Preserve each draft revision instead of overwriting a previously tested graph.
            const targetFlow: ChatFlow = await this.draftAdapter.createDraft(workspaceId, compiledGraph)

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

            // 12. Hoàn thành Job
            await this.jobManager.completeJob(job.id, workspaceId, targetFlow.id)

            // 13. Phát SSE thông báo build hoàn tất
            collectorService.broadcastSSE(sessionId, {
                type: 'build_completed',
                data: {
                    flowId: targetFlow.id,
                    buildKey,
                    flowName: targetFlow.name,
                    revisionNo: targetRevision.revisionNo,
                    jobId: job.id
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
                revisionNo: targetRevision.revisionNo,
                jobId: job.id
            }
        } catch (error: any) {
            await this.jobManager.failJob(job.id, workspaceId, error.message || 'Build failed')
            throw error
        }
    }

    /**
     * Hủy bỏ tác vụ build đang chạy (PH2-T09).
     */
    async cancelBuild(jobId: string, workspaceId: string, reason?: string): Promise<BuildJob> {
        return this.jobManager.cancelJob(jobId, workspaceId, reason)
    }

    /**
     * Lấy trạng thái của tác vụ build theo jobId.
     */
    async getBuildJob(jobId: string, workspaceId: string): Promise<BuildJob> {
        return this.jobManager.getJobById(jobId, workspaceId)
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
