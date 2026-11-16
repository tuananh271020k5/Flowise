import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { AgentSpecRevision } from '../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../database/entities/AgentDraftRevision'
import { BuilderMessage } from '../../database/entities/BuilderMessage'
import { BuilderSession } from '../../database/entities/BuilderSession'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import collectorService, { CollectorService } from './collectorService'
import { BuildPipelineService } from './pipeline/buildPipelineService'
import { computeReadiness } from './readiness'
import { computeSpecDiff, SpecDiffResult } from './specDiffService'
import tokenUsageService from './cost/tokenUsageService'
import { AgentSpec, BuildIntent, ReadinessResult } from './types'
import { Response } from 'express'

export interface CreateSessionDTO {
    workspaceId: string
    organizationId: string
    userId: string
    title?: string
    initialGoal?: string
}

export interface AddMessageDTO {
    content: string
    clientMessageId: string
    role?: 'user' | 'assistant'
    expectedRevision?: number
    specPatch?: Partial<AgentSpec>
}

export interface SessionSnapshot {
    session: BuilderSession
    messages: BuilderMessage[]
    currentSpecRevision: AgentSpecRevision | null
    readiness: ReadinessResult | null
}

export interface AddMessageResponse {
    userMessage: BuilderMessage
    assistantMessage?: BuilderMessage
    session: BuilderSession
    currentSpecRevision: AgentSpecRevision | null
    readiness: ReadinessResult | null
    buildIntent?: BuildIntent | null
    idempotentReplay?: boolean
}

/**
 * Resolves the active TypeORM DataSource.
 */
export const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

/**
 * Service managing conversational builder sessions, messages, and spec revisions.
 */
export class BuilderSessionService {
    private collector: CollectorService
    private buildPipeline: BuildPipelineService

    constructor(private customDataSource?: DataSource, customCollector?: CollectorService, customPipeline?: BuildPipelineService) {
        this.collector = customCollector || collectorService
        this.buildPipeline = customPipeline || new BuildPipelineService(this.customDataSource)
    }

    private get sessionRepo(): Repository<BuilderSession> {
        return getActiveDataSource(this.customDataSource).getRepository(BuilderSession)
    }

    private get messageRepo(): Repository<BuilderMessage> {
        return getActiveDataSource(this.customDataSource).getRepository(BuilderMessage)
    }

    private get revisionRepo(): Repository<AgentSpecRevision> {
        return getActiveDataSource(this.customDataSource).getRepository(AgentSpecRevision)
    }

    private get draftRevisionRepo(): Repository<AgentDraftRevision> {
        return getActiveDataSource(this.customDataSource).getRepository(AgentDraftRevision)
    }

    /**
     * Creates a new Builder session.
     */
    async createSession(data: CreateSessionDTO): Promise<SessionSnapshot> {
        if (!data.workspaceId) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Workspace ID is required')
        }

        const title = data.title?.trim() || (data.initialGoal ? data.initialGoal.slice(0, 50) : 'Trợ lý mới')

        const session = this.sessionRepo.create({
            workspaceId: data.workspaceId,
            organizationId: data.organizationId || 'default',
            userId: data.userId || 'default',
            title,
            state: 'collecting',
            currentRevisionNo: 0,
            currentSpecRevisionId: null,
            buildIntent: null
        })

        const savedSession = await this.sessionRepo.save(session)
        const messages: BuilderMessage[] = []
        let currentRevision: AgentSpecRevision | null = null
        let readiness: ReadinessResult | null = null

        if (data.initialGoal && data.initialGoal.trim().length > 0) {
            const goalText = data.initialGoal.trim()

            // 1. Save user initial message
            const userMsg = this.messageRepo.create({
                sessionId: savedSession.id,
                role: 'user',
                clientMessageId: `init-${Date.now()}`,
                content: goalText
            })
            const savedUserMsg = await this.messageRepo.save(userMsg)
            messages.push(savedUserMsg)

            // 2. Trích xuất patch ban đầu từ initial goal
            const patchResult = this.collector.extractPatch(goalText)
            const initialSpec: Partial<AgentSpec> = {
                schemaVersion: '1.0',
                kind: 'assistant',
                goal: patchResult.patch.goal || goalText,
                language: patchResult.patch.language || 'vi',
                modelProfileRef: 'default-builder-model',
                ...patchResult.patch
            }

            readiness = computeReadiness(initialSpec)

            // 3. Create first revision
            const revision = this.revisionRepo.create({
                sessionId: savedSession.id,
                revisionNo: 1,
                spec: JSON.stringify(initialSpec),
                assumptions: JSON.stringify(readiness.assumptions),
                missingFields: JSON.stringify(readiness.missingFields),
                reasonCodes: JSON.stringify(readiness.reasonCodes),
                specReady: readiness.specReady,
                buildReady: readiness.buildReady,
                testReady: readiness.testReady
            })
            currentRevision = await this.revisionRepo.save(revision)

            savedSession.currentSpecRevisionId = currentRevision.id
            savedSession.currentRevisionNo = 1
            await this.sessionRepo.save(savedSession)

            // 4. Create assistant guidance message using Collector
            const assistantContent = this.collector.generateCollectorResponse(
                readiness.missingFields,
                initialSpec,
                patchResult.extractedFields
            )
            const assistantMsg = this.messageRepo.create({
                sessionId: savedSession.id,
                role: 'assistant',
                clientMessageId: `reply-${Date.now()}`,
                content: assistantContent,
                specRevisionId: currentRevision.id
            })
            const savedAssistantMsg = await this.messageRepo.save(assistantMsg)
            messages.push(savedAssistantMsg)
        }

        return {
            session: savedSession,
            messages,
            currentSpecRevision: currentRevision,
            readiness
        }
    }

    /**
     * Retrieves full session snapshot by ID, scoped to workspace.
     */
    async getSessionById(id: string, workspaceId: string): Promise<SessionSnapshot> {
        const session = await this.sessionRepo.findOneBy({ id })
        if (!session) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Session ${id} not found`)
        }

        if (session.workspaceId !== workspaceId) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Access denied: Workspace mismatch')
        }

        const messages = await this.messageRepo.find({
            where: { sessionId: id },
            order: { createdDate: 'ASC' }
        })

        let currentSpecRevision: AgentSpecRevision | null = null
        let readiness: ReadinessResult | null = null

        if (session.currentSpecRevisionId) {
            currentSpecRevision = await this.revisionRepo.findOneBy({ id: session.currentSpecRevisionId })
            if (currentSpecRevision) {
                try {
                    const parsedSpec = JSON.parse(currentSpecRevision.spec)
                    readiness = computeReadiness(parsedSpec)
                } catch {
                    readiness = null
                }
            }
        }

        return {
            session,
            messages,
            currentSpecRevision,
            readiness
        }
    }

    /**
     * Appends a message to the session with idempotency check, structured patch extraction,
     * revision conflict detection, and auto-dispatch of build intent when ready.
     */
    async addMessage(sessionId: string, workspaceId: string, data: AddMessageDTO): Promise<AddMessageResponse> {
        if (!data.content || !data.content.trim()) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Message content cannot be empty')
        }
        if (!data.clientMessageId || !data.clientMessageId.trim()) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'clientMessageId is required for idempotency')
        }

        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Session ${sessionId} not found`)
        }

        if (session.workspaceId !== workspaceId) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Access denied: Workspace mismatch')
        }

        // 1. Idempotency Check
        const existingMsg = await this.messageRepo.findOneBy({
            sessionId,
            clientMessageId: data.clientMessageId
        })
        if (existingMsg) {
            const snapshot = await this.getSessionById(sessionId, workspaceId)
            let existingIntent: BuildIntent | null = null
            if (session.buildIntent) {
                try {
                    existingIntent = JSON.parse(session.buildIntent)
                } catch {
                    existingIntent = null
                }
            }
            return {
                userMessage: existingMsg,
                session: snapshot.session,
                currentSpecRevision: snapshot.currentSpecRevision,
                readiness: snapshot.readiness,
                buildIntent: existingIntent,
                idempotentReplay: true
            }
        }

        // 2. Revision Conflict Check
        if (typeof data.expectedRevision === 'number' && data.expectedRevision !== session.currentRevisionNo) {
            throw new InternalFlowiseError(
                StatusCodes.CONFLICT,
                `Revision conflict: expected revision ${data.expectedRevision} but current revision is ${session.currentRevisionNo}. Please reload snapshot.`
            )
        }

        // 3. Save User Message
        const userMsg = this.messageRepo.create({
            sessionId,
            role: data.role || 'user',
            clientMessageId: data.clientMessageId,
            content: data.content.trim()
        })
        const savedUserMsg = await this.messageRepo.save(userMsg)

        // Phát sự kiện SSE: user message
        this.collector.broadcastSSE(sessionId, {
            type: 'message',
            data: savedUserMsg,
            timestamp: new Date().toISOString()
        })

        // 4. Load Base Spec
        let baseSpec: Partial<AgentSpec> = {
            schemaVersion: '1.0',
            kind: 'assistant',
            language: 'vi',
            modelProfileRef: 'default-builder-model'
        }

        let currentRevision: AgentSpecRevision | null = null
        if (session.currentSpecRevisionId) {
            const prevRev = await this.revisionRepo.findOneBy({ id: session.currentSpecRevisionId })
            if (prevRev) {
                try {
                    baseSpec = { ...baseSpec, ...JSON.parse(prevRev.spec) }
                    currentRevision = prevRev
                } catch {
                    // Keep baseSpec
                }
            }
        }

        // 5. Trích xuất Patch từ nội dung chat (PH1-T09)
        const extracted = this.collector.extractPatch(data.content, baseSpec)
        const mergedPatch: Partial<AgentSpec> = {
            ...extracted.patch,
            ...(data.specPatch || {})
        }

        const hasSpecChanges = Object.keys(mergedPatch).length > 0
        let readiness: ReadinessResult | null = null
        let dispatchedIntent: BuildIntent | null = null

        if (hasSpecChanges) {
            const updatedSpec = {
                ...baseSpec,
                ...mergedPatch
            }

            readiness = computeReadiness(updatedSpec)

            // Lưu Revision mới
            const nextRevisionNo = session.currentRevisionNo + 1
            const newRevision = this.revisionRepo.create({
                sessionId,
                revisionNo: nextRevisionNo,
                spec: JSON.stringify(updatedSpec),
                assumptions: JSON.stringify(readiness.assumptions),
                missingFields: JSON.stringify(readiness.missingFields),
                reasonCodes: JSON.stringify(readiness.reasonCodes),
                specReady: readiness.specReady,
                buildReady: readiness.buildReady,
                testReady: readiness.testReady
            })
            currentRevision = await this.revisionRepo.save(newRevision)

            session.currentRevisionNo = nextRevisionNo
            session.currentSpecRevisionId = currentRevision.id

            // 6. Tự động dispatch Build Intent khi đạt buildReady: true (PH1-T10)
            if (readiness.buildReady) {
                dispatchedIntent = await this.collector.dispatchBuildIntent(sessionId, nextRevisionNo, updatedSpec as AgentSpec)
                session.buildIntent = JSON.stringify(dispatchedIntent)
                session.state = 'ready'

                // Tự động cập nhật draft ChatFlow sang revision mới nếu session đã có draft trước đó (PH3-T04)
                try {
                    const existingDraft = await this.draftRevisionRepo.findOneBy({ sessionId })
                    if (existingDraft) {
                        await this.buildPipeline.executeBuild({
                            sessionId,
                            workspaceId,
                            specRevisionId: currentRevision.id
                        })
                    }
                } catch {
                    // Không chặn luồng chat nếu auto sync gặp lỗi
                }
            }

            await this.sessionRepo.save(session)

            // Phát sự kiện SSE: revision & readiness
            this.collector.broadcastSSE(sessionId, {
                type: 'revision',
                data: currentRevision,
                timestamp: new Date().toISOString()
            })
            this.collector.broadcastSSE(sessionId, {
                type: 'readiness',
                data: readiness,
                timestamp: new Date().toISOString()
            })
        } else if (currentRevision) {
            try {
                readiness = computeReadiness(JSON.parse(currentRevision.spec))
            } catch {
                readiness = null
            }
        }

        // 7. Sinh phản hồi đàm thoại của Collector (Anti-reask)
        let assistantMsg: BuilderMessage | undefined
        if (data.role !== 'assistant') {
            const currentSpecState = hasSpecChanges ? { ...baseSpec, ...mergedPatch } : baseSpec
            const missing = readiness ? readiness.missingFields : []
            const replyText = this.collector.generateCollectorResponse(missing, currentSpecState, extracted.extractedFields)

            const assistantRecord = this.messageRepo.create({
                sessionId,
                role: 'assistant',
                clientMessageId: `asst-${Date.now()}`,
                content: replyText,
                specRevisionId: currentRevision?.id || null
            })
            assistantMsg = await this.messageRepo.save(assistantRecord)

            // Phát sự kiện SSE: assistant message
            this.collector.broadcastSSE(sessionId, {
                type: 'message',
                data: assistantMsg,
                timestamp: new Date().toISOString()
            })
        }

        // Ghi nhận Token Usage (PH5-T05)
        const promptTokens = Math.max(1, Math.ceil(savedUserMsg.content.length / 3.5))
        const completionTokens = assistantMsg ? Math.max(1, Math.ceil(assistantMsg.content.length / 3.5)) : 0
        tokenUsageService.recordUsage({
            sessionId,
            workspaceId,
            source: 'conversation',
            provider: 'default',
            model: 'gpt-4o-mini',
            promptTokens,
            completionTokens
        })

        return {
            userMessage: savedUserMsg,
            assistantMessage: assistantMsg,
            session,
            currentSpecRevision: currentRevision,
            readiness,
            buildIntent: dispatchedIntent
        }
    }

    /**
     * Lists all spec revisions of a session in chronological order.
     */
    async getRevisions(sessionId: string, workspaceId: string): Promise<AgentSpecRevision[]> {
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Session ${sessionId} not found`)
        }
        if (session.workspaceId !== workspaceId) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Access denied: Workspace mismatch')
        }

        return this.revisionRepo.find({
            where: { sessionId },
            order: { revisionNo: 'ASC' }
        })
    }

    /**
     * Tính toán diff giữa 2 revision trong phiên (PH3-T05).
     */
    async getSpecDiff(sessionId: string, workspaceId: string, rev1Id?: string, rev2Id?: string): Promise<SpecDiffResult> {
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Session ${sessionId} not found`)
        }
        if (session.workspaceId !== workspaceId) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Access denied: Workspace mismatch')
        }

        let rev1: AgentSpecRevision | null = null
        let rev2: AgentSpecRevision | null = null

        if (rev1Id && rev2Id) {
            rev1 = await this.revisionRepo.findOneBy({ id: rev1Id, sessionId })
            rev2 = await this.revisionRepo.findOneBy({ id: rev2Id, sessionId })
        } else {
            // Mặc định lấy 2 revisions mới nhất
            const revisions = await this.revisionRepo.find({
                where: { sessionId },
                order: { revisionNo: 'DESC' },
                take: 2
            })
            rev2 = revisions[0] || null
            rev1 = revisions[1] || null
        }

        let spec1: AgentSpec | null = null
        let spec2: AgentSpec | null = null

        if (rev1) {
            try {
                spec1 = JSON.parse(rev1.spec)
            } catch {
                spec1 = null
            }
        }
        if (rev2) {
            try {
                spec2 = JSON.parse(rev2.spec)
            } catch {
                spec2 = null
            }
        }

        return computeSpecDiff(spec1, spec2)
    }

    /**
     * Khôi phục (Rollback) cấu hình về một revision trước đó (PH3-T05).
     * Tạo một revision mới kế thừa spec cũ (bảo toàn lịch sử) và tự động đồng bộ draft nếu sẵn sàng.
     */
    async rollbackRevision(sessionId: string, workspaceId: string, targetRevisionId: string): Promise<SessionSnapshot> {
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Session ${sessionId} not found`)
        }
        if (session.workspaceId !== workspaceId) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Access denied: Workspace mismatch')
        }

        const targetRevision = await this.revisionRepo.findOneBy({ id: targetRevisionId, sessionId })
        if (!targetRevision) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Bản đặc tả ${targetRevisionId} không tồn tại trong phiên`)
        }

        let targetSpec: AgentSpec
        try {
            targetSpec = JSON.parse(targetRevision.spec)
        } catch (e: any) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `Dữ liệu spec không hợp lệ: ${e.message}`)
        }

        // Tìm revisionNo lớn nhất hiện tại
        const latestRevisions = await this.revisionRepo.find({
            where: { sessionId },
            order: { revisionNo: 'DESC' },
            take: 1
        })
        const nextRevNo = (latestRevisions[0]?.revisionNo || 0) + 1

        // Tạo revision mới mang nội dung của spec cũ (giữ toàn vẹn lịch sử)
        const newRevision = this.revisionRepo.create({
            sessionId,
            revisionNo: nextRevNo,
            spec: targetRevision.spec,
            assumptions: targetRevision.assumptions || '[]',
            missingFields: targetRevision.missingFields || '[]',
            reasonCodes: JSON.stringify([`Khôi phục về phiên bản #${targetRevision.revisionNo} (${targetSpec.name || 'Agent'})`]),
            specReady: targetRevision.specReady,
            buildReady: targetRevision.buildReady,
            testReady: targetRevision.testReady
        })
        const savedRevision = await this.revisionRepo.save(newRevision)

        session.currentSpecRevisionId = savedRevision.id
        await this.sessionRepo.save(session)

        // Thêm tin nhắn hệ thống thông báo việc khôi phục
        const rollbackMessage = this.messageRepo.create({
            sessionId,
            role: 'assistant',
            clientMessageId: `rollback-${Date.now()}`,
            content: `Đã khôi phục cấu hình Agent về phiên bản #${targetRevision.revisionNo} (${targetSpec.name || 'Trợ lý'}).`,
            specRevisionId: savedRevision.id
        })
        await this.messageRepo.save(rollbackMessage)

        // Phát sự kiện SSE thông báo spec được cập nhật
        const readiness = computeReadiness(targetSpec)
        this.collector.broadcastSSE(sessionId, {
            type: 'revision',
            data: {
                revisionNumber: savedRevision.revisionNo,
                spec: targetSpec,
                readiness
            },
            timestamp: new Date().toISOString()
        })

        // Tự động đồng bộ draft nếu spec đạt buildReady và session đã từng có draft trước đó
        if (savedRevision.buildReady) {
            try {
                const previousDrafts = await this.draftRevisionRepo.find({
                    where: { sessionId },
                    order: { createdDate: 'DESC' },
                    take: 1
                })
                if (previousDrafts.length > 0) {
                    await this.buildPipeline.executeBuild({
                        sessionId,
                        workspaceId,
                        specRevisionId: savedRevision.id
                    })
                }
            } catch (err: any) {
                // eslint-disable-next-line no-console
                console.error('Không thể tự động đồng bộ draft sau khi rollback:', err?.message)
            }
        }

        return this.getSessionById(sessionId, workspaceId)
    }

    /**
     * Đăng ký kết nối SSE cho phiên làm việc.
     */
    async subscribeEvents(sessionId: string, workspaceId: string, res: Response): Promise<void> {
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Session ${sessionId} not found`)
        }
        if (session.workspaceId !== workspaceId) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Access denied: Workspace mismatch')
        }

        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders?.()

        this.collector.addSSEClient(sessionId, res)

        // Gửi sự kiện ban đầu 'connected' với thông tin phiên phục vụ khôi phục kết nối (PH3-T07)
        const initialPayload = JSON.stringify({
            type: 'connected',
            data: {
                sessionId: session.id,
                state: session.state,
                title: session.title,
                currentSpecRevisionId: session.currentSpecRevisionId
            },
            timestamp: new Date().toISOString()
        })
        res.write(`data: ${initialPayload}\n\n`)
    }

    /**
     * Danh sách tất cả các phiên theo workspaceId.
     */
    async listSessions(workspaceId?: string, options?: { limit?: number; offset?: number }): Promise<BuilderSession[]> {
        const queryWhere: Record<string, unknown> = {}
        if (workspaceId && workspaceId !== 'default') {
            queryWhere.workspaceId = workspaceId
        }

        return this.sessionRepo.find({
            where: queryWhere,
            order: { updatedDate: 'DESC' },
            take: options?.limit || 50,
            skip: options?.offset || 0
        })
    }

    /**
     * Xóa một phiên và toàn bộ dữ liệu phụ thuộc (messages, revisions, drafts).
     */
    async deleteSession(sessionId: string, workspaceId: string): Promise<boolean> {
        const session = await this.sessionRepo.findOneBy({ id: sessionId })
        if (!session) {
            return false
        }
        if (workspaceId !== 'default' && session.workspaceId !== workspaceId) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Access denied: Workspace mismatch')
        }

        // Xóa cascade các bản ghi con
        await this.messageRepo.delete({ sessionId })
        await this.revisionRepo.delete({ sessionId })
        await this.draftRevisionRepo.delete({ sessionId })
        await this.sessionRepo.delete({ id: sessionId })

        return true
    }
}

export default new BuilderSessionService()
