import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { ChatFlow, EnumChatflowType } from '../../../database/entities/ChatFlow'
import { AdapterError } from '../errors/builderErrors'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { CompiledFlowGraph } from '../generator/compiler'
import { validateFlowGraph } from '../generator/flowValidator'

export interface SerializedFlowData {
    nodes: unknown[]
    edges: unknown[]
    viewport: { x: number; y: number; zoom: number }
}

export interface FlowDraftSnapshot {
    chatflow: ChatFlow
    parsedFlowData: SerializedFlowData
}

/**
 * Resolves the active TypeORM DataSource.
 */
const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

/**
 * Adapter thực hiện CRUD cho bản draft ChatFlow trên runtime Flowise (PH2-T06).
 * Serialize flowData đúng 1 lần, đặt type AGENTFLOW, áp dụng policy an toàn deployed=false,
 * isPublic=false và cách ly theo workspaceId.
 */
export class FlowiseDraftAdapter {
    constructor(private customDataSource?: DataSource) {}

    private get chatflowRepo(): Repository<ChatFlow> {
        return getActiveDataSource(this.customDataSource).getRepository(ChatFlow)
    }

    /**
     * Serialize flow graph đúng 1 lần thành JSON string (chống double stringify).
     */
    serializeFlowData(graph: CompiledFlowGraph): string {
        const payload: SerializedFlowData = {
            nodes: graph.nodes || [],
            edges: graph.edges || [],
            viewport: graph.viewport || { x: 0, y: 0, zoom: 0.85 }
        }
        return JSON.stringify(payload)
    }

    /**
     * Tạo mới một bản draft ChatFlow từ CompiledFlowGraph (PH2-T06).
     */
    async createDraft(
        workspaceId: string,
        graph: CompiledFlowGraph,
        metadata?: { deployed?: boolean; isPublic?: boolean }
    ): Promise<ChatFlow> {
        if (!workspaceId) {
            throw new AdapterError('ADAPTER_WORKSPACE_REQUIRED', 'Workspace ID is required', StatusCodes.BAD_REQUEST)
        }

        // 1. Thẩm định graph bằng Server Flow Validator (PH2-T05)
        const validation = validateFlowGraph(graph)
        if (!validation.valid) {
            throw new AdapterError(
                'ADAPTER_INVALID_GRAPH',
                `Đồ thị Agentflow không hợp lệ: ${validation.errors.join('; ')}`,
                StatusCodes.BAD_REQUEST,
                validation.errors
            )
        }

        // 2. Serialize flowData 1 lần duy nhất
        const serializedFlowData = this.serializeFlowData(graph)

        // 3. Tạo ChatFlow record theo chuẩn Flowise Agentflow V2
        const chatflow = this.chatflowRepo.create({
            name: graph.flowConfig?.name || 'Trợ lý Agentflow mới',
            flowData: serializedFlowData,
            type: EnumChatflowType.AGENTFLOW,
            deployed: metadata?.deployed ?? false, // Mặc định an toàn cho draft
            isPublic: metadata?.isPublic ?? false, // Mặc định an toàn cho draft
            workspaceId,
            category: graph.flowConfig?.category || 'Agent Flows'
        })

        return this.chatflowRepo.save(chatflow)
    }

    /**
     * Cập nhật bản draft ChatFlow hiện có.
     */
    async updateDraft(flowId: string, workspaceId: string, graph: CompiledFlowGraph): Promise<ChatFlow> {
        if (!flowId) {
            throw new AdapterError('ADAPTER_FLOW_ID_REQUIRED', 'Flow ID is required', StatusCodes.BAD_REQUEST)
        }
        if (!workspaceId) {
            throw new AdapterError('ADAPTER_WORKSPACE_REQUIRED', 'Workspace ID is required', StatusCodes.BAD_REQUEST)
        }

        const existingFlow = await this.chatflowRepo.findOneBy({ id: flowId })
        if (!existingFlow) {
            throw new AdapterError('ADAPTER_DRAFT_NOT_FOUND', `Chatflow ${flowId} not found`, StatusCodes.NOT_FOUND)
        }

        // Cách ly chéo workspace (Negative Auth: 403 Forbidden)
        if (existingFlow.workspaceId !== workspaceId) {
            throw new AdapterError('ADAPTER_WORKSPACE_MISMATCH', 'Access denied: Workspace mismatch', StatusCodes.FORBIDDEN)
        }

        // Thẩm định graph trước khi cập nhật
        const validation = validateFlowGraph(graph)
        if (!validation.valid) {
            throw new AdapterError(
                'ADAPTER_INVALID_GRAPH',
                `Đồ thị Agentflow không hợp lệ: ${validation.errors.join('; ')}`,
                StatusCodes.BAD_REQUEST,
                validation.errors
            )
        }

        existingFlow.name = graph.flowConfig?.name || existingFlow.name
        existingFlow.flowData = this.serializeFlowData(graph)

        return this.chatflowRepo.save(existingFlow)
    }

    /**
     * Đọc bản draft ChatFlow theo ID và parse flowData an toàn.
     */
    async getDraftById(flowId: string, workspaceId: string): Promise<FlowDraftSnapshot> {
        const flow = await this.chatflowRepo.findOneBy({ id: flowId })
        if (!flow) {
            throw new AdapterError('ADAPTER_DRAFT_NOT_FOUND', `Chatflow ${flowId} not found`, StatusCodes.NOT_FOUND)
        }

        // Cách ly chéo workspace
        if (flow.workspaceId !== workspaceId) {
            throw new AdapterError('ADAPTER_WORKSPACE_MISMATCH', 'Access denied: Workspace mismatch', StatusCodes.FORBIDDEN)
        }

        let parsedFlowData: SerializedFlowData
        try {
            parsedFlowData = typeof flow.flowData === 'string' ? JSON.parse(flow.flowData) : flow.flowData
        } catch {
            parsedFlowData = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
        }

        return {
            chatflow: flow,
            parsedFlowData
        }
    }
}

export default new FlowiseDraftAdapter()
