import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { AgentSpecRevision } from '../../database/entities/AgentSpecRevision'
import { BuilderMessage } from '../../database/entities/BuilderMessage'
import { BuilderSession } from '../../database/entities/BuilderSession'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { computeReadiness } from './readiness'
import { AgentSpec, ReadinessResult } from './types'

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
    constructor(private customDataSource?: DataSource) {}

    private get sessionRepo(): Repository<BuilderSession> {
        return getActiveDataSource(this.customDataSource).getRepository(BuilderSession)
    }

    private get messageRepo(): Repository<BuilderMessage> {
        return getActiveDataSource(this.customDataSource).getRepository(BuilderMessage)
    }

    private get revisionRepo(): Repository<AgentSpecRevision> {
        return getActiveDataSource(this.customDataSource).getRepository(AgentSpecRevision)
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
            currentSpecRevisionId: null
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

            // 2. Compute readiness on initial goal
            const initialSpec: Partial<AgentSpec> = {
                schemaVersion: '1.0',
                kind: 'assistant',
                goal: goalText,
                language: 'vi',
                modelProfileRef: 'default-builder-model'
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

            // 4. Create assistant guidance message
            const assistantContent = this.generateGuidanceMessage(readiness)
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
     * Appends a message to the session with idempotency check and revision conflict detection.
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

        // 1. Idempotency Check: if clientMessageId already exists in this session, return existing snapshot
        const existingMsg = await this.messageRepo.findOneBy({
            sessionId,
            clientMessageId: data.clientMessageId
        })
        if (existingMsg) {
            const snapshot = await this.getSessionById(sessionId, workspaceId)
            return {
                userMessage: existingMsg,
                session: snapshot.session,
                currentSpecRevision: snapshot.currentSpecRevision,
                readiness: snapshot.readiness,
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

        // 4. Handle Spec Update / Collector Patch
        let currentRevision: AgentSpecRevision | null = null
        let readiness: ReadinessResult | null = null

        if (data.specPatch && typeof data.specPatch === 'object') {
            // Load existing spec
            let baseSpec: Partial<AgentSpec> = {
                schemaVersion: '1.0',
                kind: 'assistant',
                language: 'vi',
                modelProfileRef: 'default-builder-model'
            }

            if (session.currentSpecRevisionId) {
                const prevRev = await this.revisionRepo.findOneBy({ id: session.currentSpecRevisionId })
                if (prevRev) {
                    try {
                        baseSpec = { ...baseSpec, ...JSON.parse(prevRev.spec) }
                    } catch {
                        // Keep baseSpec
                    }
                }
            }

            const updatedSpec = {
                ...baseSpec,
                ...data.specPatch
            }

            readiness = computeReadiness(updatedSpec)

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
            if (readiness.buildReady) {
                session.state = 'ready'
            }
            await this.sessionRepo.save(session)
        } else if (session.currentSpecRevisionId) {
            currentRevision = await this.revisionRepo.findOneBy({ id: session.currentSpecRevisionId })
            if (currentRevision) {
                try {
                    readiness = computeReadiness(JSON.parse(currentRevision.spec))
                } catch {
                    readiness = null
                }
            }
        }

        // 5. Generate Assistant Guidance Response
        let assistantMsg: BuilderMessage | undefined
        if (data.role !== 'assistant') {
            const replyText = readiness
                ? this.generateGuidanceMessage(readiness)
                : 'Tôi đã ghi nhận thông tin của bạn. Hãy cho tôi biết thêm chi tiết về trợ lý bạn muốn xây dựng.'

            const assistantRecord = this.messageRepo.create({
                sessionId,
                role: 'assistant',
                clientMessageId: `asst-${Date.now()}`,
                content: replyText,
                specRevisionId: currentRevision?.id || null
            })
            assistantMsg = await this.messageRepo.save(assistantRecord)
        }

        return {
            userMessage: savedUserMsg,
            assistantMessage: assistantMsg,
            session,
            currentSpecRevision: currentRevision,
            readiness
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
     * Generates a helpful natural language response based on readiness evaluation.
     */
    private generateGuidanceMessage(readiness: ReadinessResult): string {
        if (readiness.buildReady) {
            return 'Tuyệt vời! Thông tin thiết kế trợ lý đã đầy đủ và đạt chuẩn sẵn sàng (buildReady). Hệ thống có thể tự động tạo bản draft Agentflow V2 bất cứ lúc nào.'
        }

        if (readiness.missingFields.length > 0) {
            const fieldLabels: Record<string, string> = {
                name: 'Tên trợ lý',
                goal: 'Mục tiêu hoạt động chính',
                instructions: 'Hướng dẫn / Chỉ dẫn phong cách trả lời'
            }
            const missingText = readiness.missingFields.map((f) => fieldLabels[f] || f).join(', ')
            return `Chào bạn! Tôi đã ghi nhận thông tin. Để hoàn thiện thiết kế trợ lý, bạn hãy cung cấp thêm: ${missingText}.`
        }

        return 'Tôi đã ghi nhận thông tin. Hãy tiếp tục chia sẻ chi tiết về yêu cầu của bạn.'
    }
}

export default new BuilderSessionService()
