import redactionService from '../security/redactionService'
import sessionService from '../sessionService'
import buildPipelineService from '../pipeline/buildPipelineService'
import evaluationRunnerService from '../pipeline/evaluationRunnerService'

export interface McpToolParameterSchema {
    type: string
    properties: Record<string, { type: string; description: string }>
    required?: string[]
}

export interface McpToolDefinition {
    name: string
    description: string
    inputSchema: McpToolParameterSchema
}

export interface McpToolCallResult {
    content: Array<{
        type: 'text'
        text: string
    }>
    isError?: boolean
}

/**
 * Service Đóng Gói Các Khả Năng Của Builder Thành Chuẩn MCP Tools (PH6-T12 / B-026).
 * Cho phép external AI clients (Claude Code, Cursor, Codex, Gemini CLI) khám phá
 * và tương tác với Agent Builder qua giao thức Model Context Protocol.
 */
export class BuilderMcpService {
    /**
     * Danh mục MCP Tools được cấp phép (Tools Discovery).
     */
    listTools(): McpToolDefinition[] {
        return [
            {
                name: 'builder_list_templates',
                description: 'Lấy danh sách các mẫu Agentflow V2 được hỗ trợ (assistant, knowledge, api, sql).',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'builder_get_session',
                description: 'Đọc thông tin phiên làm việc, trạng thái hiện tại và cấu hình AgentSpec mới nhất.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string', description: 'ID của phiên làm việc (Session ID)' }
                    },
                    required: ['sessionId']
                }
            },
            {
                name: 'builder_send_message',
                description: 'Gửi yêu cầu hoặc câu trả lời đàm thoại tiếng Việt vào phiên làm việc để Collector tự động trích xuất spec.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string', description: 'ID của phiên làm việc' },
                        content: { type: 'string', description: 'Nội dung tin nhắn yêu cầu bằng tiếng Việt' },
                        clientMessageId: { type: 'string', description: 'Khóa idempotency ngẫu nhiên của tin nhắn' }
                    },
                    required: ['sessionId', 'content', 'clientMessageId']
                }
            },
            {
                name: 'builder_compile_draft',
                description: 'Kích hoạt biên dịch AgentSpec đạt chuẩn thành Flowise Agentflow V2 Draft (idempotent qua buildKey).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string', description: 'ID của phiên làm việc' }
                    },
                    required: ['sessionId']
                }
            },
            {
                name: 'builder_run_tests',
                description: 'Chạy kiểm thử có kiểm soát (Evaluation Runner) đánh giá độ chính xác của Agent Draft.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string', description: 'ID của phiên làm việc' },
                        maxExamples: { type: 'number', description: 'Số lượng câu hỏi kiểm thử tối đa (mặc định 5)' }
                    },
                    required: ['sessionId']
                }
            }
        ]
    }

    /**
     * Thực thi một MCP Tool theo giao thức chuẩn (Tool Execution).
     */
    async callTool(params: { workspaceId: string; toolName: string; arguments?: Record<string, unknown> }): Promise<McpToolCallResult> {
        const { workspaceId, toolName, arguments: args = {} } = params

        try {
            switch (toolName) {
                case 'builder_list_templates': {
                    const templates = [
                        { id: 'assistant-flow-template', version: '1.0', description: 'Trợ lý đàm thoại tiếng Việt tổng quát' },
                        { id: 'knowledge-flow-template', version: '1.0', description: 'Trợ lý tra cứu hỏi đáp tài liệu tri thức (RAG)' },
                        { id: 'api-flow-template', version: '1.0', description: 'Trợ lý kết nối API bên ngoài (Readonly)' },
                        { id: 'sql-flow-template', version: '1.0', description: 'Trợ lý phân tích cơ sở dữ liệu SQL Readonly' }
                    ]
                    return {
                        content: [{ type: 'text', text: JSON.stringify(templates, null, 2) }]
                    }
                }

                case 'builder_get_session': {
                    const sessionId = String(args.sessionId || '')
                    if (!sessionId) {
                        return { isError: true, content: [{ type: 'text', text: 'Thiếu tham số sessionId' }] }
                    }
                    const session = await sessionService.getSessionById(sessionId, workspaceId)
                    const sanitized = redactionService.redactObject(session)
                    return {
                        content: [{ type: 'text', text: JSON.stringify(sanitized, null, 2) }]
                    }
                }

                case 'builder_send_message': {
                    const sessionId = String(args.sessionId || '')
                    const content = String(args.content || '')
                    const clientMessageId = (args.clientMessageId as string) || `mcp_msg_${Date.now()}`

                    if (!sessionId || !content) {
                        return { isError: true, content: [{ type: 'text', text: 'Thiếu sessionId hoặc content' }] }
                    }

                    const result = await sessionService.addMessage(sessionId, workspaceId, {
                        content,
                        clientMessageId
                    })

                    const sanitized = redactionService.redactObject(result)
                    return {
                        content: [{ type: 'text', text: JSON.stringify(sanitized, null, 2) }]
                    }
                }

                case 'builder_compile_draft': {
                    const sessionId = String(args.sessionId || '')
                    if (!sessionId) {
                        return { isError: true, content: [{ type: 'text', text: 'Thiếu sessionId' }] }
                    }

                    const buildResult = await buildPipelineService.executeBuild({ sessionId, workspaceId })
                    const sanitized = redactionService.redactObject(buildResult)
                    return {
                        content: [{ type: 'text', text: JSON.stringify(sanitized, null, 2) }]
                    }
                }

                case 'builder_run_tests': {
                    const sessionId = String(args.sessionId || '')
                    if (!sessionId) {
                        return { isError: true, content: [{ type: 'text', text: 'Thiếu sessionId' }] }
                    }

                    const snapshot = await sessionService.getSessionById(sessionId, workspaceId)
                    const drafts = await buildPipelineService.getDraftHistory(sessionId, workspaceId)
                    const draft = drafts.filter((item) => item.specRevisionId === snapshot.currentSpecRevision?.id).at(-1)
                    if (!draft) throw new Error('Chưa có draft cho revision hiện tại. Build trước khi chạy test.')
                    const flowId = draft.flowId
                    const maxExamples = typeof args.maxExamples === 'number' ? args.maxExamples : 5

                    let parsedSpec: any = {}
                    try {
                        parsedSpec = snapshot.currentSpecRevision?.spec ? JSON.parse(snapshot.currentSpecRevision.spec) : {}
                    } catch {
                        parsedSpec = {}
                    }
                    const examples = parsedSpec?.evaluationExamples || []

                    const testResult = await evaluationRunnerService.runTestSuite({
                        flowId,
                        workspaceId,
                        examples,
                        maxExamples
                    })
                    const sanitized = redactionService.redactObject(testResult)
                    return {
                        content: [{ type: 'text', text: JSON.stringify(sanitized, null, 2) }]
                    }
                }

                default:
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `MCP Tool "${toolName}" không được hỗ trợ trong catalog của Builder` }]
                    }
            }
        } catch (error: any) {
            return {
                isError: true,
                content: [{ type: 'text', text: `Lỗi thực thi MCP Tool ${toolName}: ${error?.message || String(error)}` }]
            }
        }
    }
}

export default new BuilderMcpService()
