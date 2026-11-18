import { randomUUID } from 'crypto'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { AgentDraftRevision } from '../../database/entities/AgentDraftRevision'
import { AgentSpecRevision } from '../../database/entities/AgentSpecRevision'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { utilBuildChatflow } from '../../utils/buildChatflow'
import modelSettingsService from './modelSettingsService'
import { AdapterError } from './errors/builderErrors'
import { prepareAgentPreview } from './agentBehaviorPolicy'

export async function predictDraft(flowId: string, workspaceId: string, input: { question: string; chatId?: string; history?: unknown[] }) {
    const app = getRunningExpressApp()
    const flow = await app.AppDataSource.getRepository(ChatFlow).findOneBy({ id: flowId, workspaceId })
    if (!flow) throw new AdapterError('DRAFT_NOT_FOUND', 'Không có quyền truy cập Agent này', 404)
    if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 16000)
        throw new AdapterError('INVALID_INPUT', 'Câu hỏi phải có 1–16000 ký tự', 400)
    if (input.chatId !== undefined && (typeof input.chatId !== 'string' || !/^[\w-]{1,128}$/.test(input.chatId)))
        throw new AdapterError('INVALID_INPUT', 'chatId không hợp lệ', 400)
    if (
        input.history !== undefined &&
        (!Array.isArray(input.history) ||
            input.history.length > 40 ||
            input.history.some(
                (item: any) =>
                    !item ||
                    !['userMessage', 'apiMessage'].includes(item.role) ||
                    typeof item.content !== 'string' ||
                    item.content.length > 16000
            ))
    )
        throw new AdapterError('INVALID_INPUT', 'Lịch sử chat không hợp lệ', 400)
    const profile = await modelSettingsService.getProfile(workspaceId)
    if (!profile.ready) throw new AdapterError('MODEL_NOT_CONFIGURED', 'Mở Cấu hình model, nhập API key và lưu trước khi chat thử.', 400)
    const host = `127.0.0.1:${process.env.PORT || 3000}`
    const request = {
        params: { id: flowId },
        body: { question: input.question, history: input.history, chatId: input.chatId || randomUUID(), streaming: false },
        headers: {},
        files: [],
        protocol: 'http',
        get: (name: string) => (name === 'host' ? host : undefined)
    }
    let workflowSteps: Array<{ id: string; type: string; instruction: string }> | undefined
    if (/"directReplyMessage"\s*:\s*"[^"]*\{\{\s*(?:conditionAgentflow_|retrieverAgentflow_|question\b)/.test(flow.flowData)) {
        try {
            const draft = await app.AppDataSource.getRepository(AgentDraftRevision).findOneBy({ flowId })
            if (draft?.specRevisionId) {
                const specRev = await app.AppDataSource.getRepository(AgentSpecRevision).findOneBy({ id: draft.specRevisionId })
                const parsedSpec = specRev?.spec ? JSON.parse(specRev.spec) : undefined
                if (Array.isArray(parsedSpec?.workflow?.steps)) workflowSteps = parsedSpec.workflow.steps
            }
        } catch {
            // Fallback message in prepareAgentPreview will still replace unresolved placeholders.
        }
    }
    const previewFlowData = prepareAgentPreview(
        flow.flowData,
        flow.name,
        Boolean(profile.webSearchEnabled),
        new Date(),
        profile,
        workflowSteps
    )
    try {
        return await utilBuildChatflow(request as any, true, undefined, previewFlowData)
    } catch (error) {
        if (profile.webSearchEnabled)
            throw new AdapterError(
                'WEB_SEARCH_EXECUTION_FAILED',
                'Chat thử không thực hiện được khi bật tra cứu web. Kiểm tra model, key và endpoint có hỗ trợ OpenAI Responses + web_search; không có câu trả lời thay thế khi provider lỗi.',
                502
            )
        throw error
    }
}
