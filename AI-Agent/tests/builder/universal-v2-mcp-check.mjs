// Controlled B-031 runtime integration check:
// 1) Real Workspace MCP Server registration (encrypted Bearer token, Streamable HTTP handshake, tool discovery & secret masking)
// 2) Real Agentic RAG execution on Flowise Agentflow V2 engine (ConditionAgent + Flow State + Loop self-correction)
// 3) Real Planner -> "xong" -> Agent + customMcpServerTool live multi-tool execution (Drive -> Excel MCP tools)
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Server } from '../../../packages/server/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js'
import { StreamableHTTPServerTransport } from '../../../packages/server/node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '../../../packages/server/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
process.chdir(root)
const local = path.join(root, 'AI-Agent/.local/B-031')
fs.mkdirSync(local, { recursive: true })
const runName = `B031-smoke-${Date.now()}`
const runtime = path.join(root, 'AI-Agent/.local', runName)
for (const directory of ['db', 'keys', 'logs', 'storage']) fs.mkdirSync(path.join(runtime, directory), { recursive: true })
const logs = path.join(local, `${runName}.log`)

const MCP_BEARER = 'mcp-office-secret-token-2026'
const mcpInvocations = []

const agenticRagWorkflow = (sources) => ({
    summary: 'Agentic RAG tự kiểm tra câu hỏi, sinh truy vấn và lặp tự sửa truy vấn khi chưa tìm thấy tài liệu.',
    initialState: { query: '' },
    steps: [
        {
            id: 'check_query',
            type: 'conditionAgent',
            label: 'Kiểm tra câu hỏi hợp lệ',
            instruction: 'Xác định câu hỏi thuộc phạm vi DeskFlow hay ngoài phạm vi.',
            inputFrom: ['start'],
            scenarios: ['Câu hỏi về sử dụng phần mềm DeskFlow', 'Câu hỏi ngoài phạm vi']
        },
        {
            id: 'gen_query',
            type: 'llm',
            label: 'Tạo câu truy vấn lần đầu',
            instruction: 'Tạo câu truy vấn ban đầu từ câu hỏi.',
            inputFrom: ['start'],
            updateState: 'query'
        },
        {
            id: 'out_scope',
            type: 'reply',
            label: 'Ngoài phạm vi',
            instruction: 'Xin lỗi, tôi chỉ hỗ trợ hướng dẫn phần mềm DeskFlow theo tài liệu đính kèm.'
        },
        {
            id: 'find_docs',
            type: 'retriever',
            label: 'Tìm tài liệu DeskFlow',
            instruction: 'Tra cứu tài liệu theo biến trạng thái query.',
            inputFrom: ['gen_query'],
            stateKeys: ['query'],
            sourceIds: sources.map((s) => s.id)
        },
        {
            id: 'check_relevant',
            type: 'conditionAgent',
            label: 'Đánh giá tài liệu tìm được',
            instruction: 'Kiểm tra tài liệu truy xuất được có chứa câu trả lời liên quan hay không.',
            inputFrom: ['start', 'find_docs'],
            scenarios: ['Tài liệu có thông tin liên quan để trả lời', 'Tài liệu chưa liên quan, cần viết lại câu truy vấn']
        },
        {
            id: 'answer',
            type: 'llm',
            label: 'Tổng hợp câu trả lời',
            instruction: 'Trả lời trực tiếp câu hỏi theo tài liệu và dẫn nguồn.',
            inputFrom: ['start', 'find_docs']
        },
        {
            id: 'rewrite_query',
            type: 'llm',
            label: 'Viết lại câu truy vấn',
            instruction: 'Viết lại câu truy vấn chính xác hơn để tìm lại trong tài liệu.',
            inputFrom: ['start', 'find_docs'],
            updateState: 'query'
        },
        {
            id: 'retry_loop',
            type: 'loop',
            label: 'Lặp lại Tìm tài liệu',
            instruction: 'Quay lại bước Tìm tài liệu DeskFlow với câu truy vấn đã viết lại.',
            inputFrom: ['rewrite_query'],
            loopBackTo: 'find_docs',
            maxLoops: 3,
            fallbackMessage: 'Không tìm thấy thông tin phù hợp sau khi thử lại.'
        }
    ],
    edges: [
        { source: 'start', target: 'check_query' },
        { source: 'check_query', target: 'gen_query', branch: '0' },
        { source: 'check_query', target: 'out_scope', branch: '1' },
        { source: 'gen_query', target: 'find_docs' },
        { source: 'find_docs', target: 'check_relevant' },
        { source: 'check_relevant', target: 'answer', branch: '0' },
        { source: 'check_relevant', target: 'rewrite_query', branch: '1' },
        { source: 'rewrite_query', target: 'retry_loop' }
    ],
    questions: [],
    blockers: []
})

const fixture = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const rawBody = Buffer.concat(chunks).toString('utf8')
    const body = rawBody ? JSON.parse(rawBody) : {}

    // Real Streamable HTTP MCP Server endpoint (Drive + Excel tools) protected by Bearer token
    if (req.url?.startsWith('/mcp/office-suite')) {
        if (req.headers.authorization !== `Bearer ${MCP_BEARER}`) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ error: 'Unauthorized MCP token' }))
        }
        const mcpServer = new Server({ name: 'office-suite-mcp', version: '1.0.0' }, { capabilities: { tools: {} } })
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
        mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'drive_read_report',
                    description: 'Đọc nội dung báo cáo từ Google Drive theo tên file',
                    inputSchema: {
                        type: 'object',
                        properties: { fileName: { type: 'string' } },
                        required: ['fileName']
                    }
                },
                {
                    name: 'excel_append_summary',
                    description: 'Ghi dòng tóm tắt doanh thu vào bảng tính Excel',
                    inputSchema: {
                        type: 'object',
                        properties: { sheetName: { type: 'string' }, summary: { type: 'string' } },
                        required: ['sheetName', 'summary']
                    }
                }
            ]
        }))
        mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
            mcpInvocations.push({ name: request.params.name, arguments: request.params.arguments })
            if (request.params.name === 'drive_read_report') {
                return {
                    content: [{ type: 'text', text: 'Báo cáo Q4 từ Google Drive: Doanh thu đạt 420 tỷ VNĐ, tăng trưởng 18%.' }]
                }
            }
            if (request.params.name === 'excel_append_summary') {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Đã ghi vào sheet "${request.params.arguments?.sheetName}": ${request.params.arguments?.summary}`
                        }
                    ]
                }
            }
            throw new Error(`Unknown MCP tool: ${request.params.name}`)
        })
        res.on('close', () => {
            void mcpServer.close()
        })
        await mcpServer.connect(transport)
        return transport.handleRequest(req, res, body)
    }

    res.setHeader('Content-Type', 'application/json')
    if (req.url !== '/v1/chat/completions') return res.writeHead(404).end('{}')

    const messages = body.messages || []
    const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n')
    const userContent = messages
        .filter((m) => m.role === 'user')
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
        .join('\n')

    // Tool-calling Agent execution (Agent + customMcpServerTool)
    if (Array.isArray(body.tools) && body.tools.some((t) => t.function?.name === 'drive_read_report')) {
        const toolMsgs = messages.filter((m) => m.role === 'tool')
        if (toolMsgs.length === 0) {
            return res.end(
                JSON.stringify({
                    id: 'chatcmpl-mcp-1',
                    object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000),
                    model: body.model,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: null,
                                tool_calls: [
                                    {
                                        id: 'call_drive_1',
                                        type: 'function',
                                        function: {
                                            name: 'drive_read_report',
                                            arguments: JSON.stringify({ fileName: 'BaoCao_Q4.docx' })
                                        }
                                    }
                                ]
                            },
                            finish_reason: 'tool_calls'
                        }
                    ],
                    usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 }
                })
            )
        }
        if (toolMsgs.length === 1) {
            return res.end(
                JSON.stringify({
                    id: 'chatcmpl-mcp-2',
                    object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000),
                    model: body.model,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: null,
                                tool_calls: [
                                    {
                                        id: 'call_excel_2',
                                        type: 'function',
                                        function: {
                                            name: 'excel_append_summary',
                                            arguments: JSON.stringify({
                                                sheetName: 'TongHop2026',
                                                summary: 'Doanh thu Q4 đạt 420 tỷ VNĐ (+18%)'
                                            })
                                        }
                                    }
                                ]
                            },
                            finish_reason: 'tool_calls'
                        }
                    ],
                    usage: { prompt_tokens: 40, completion_tokens: 25, total_tokens: 65 }
                })
            )
        }
        return res.end(
            JSON.stringify({
                id: 'chatcmpl-mcp-3',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: 'Đã đọc BaoCao_Q4.docx trên Google Drive (420 tỷ VNĐ) và ghi dòng tổng hợp vào sheet TongHop2026 trên Excel!'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 }
            })
        )
    }

    let text = ''
    if (system.includes('Bạn thu thập yêu cầu')) {
        const state = JSON.parse(messages.at(-1).content)
        if (/Drive|Excel|MCP/i.test(state.message)) {
            const availableMcp = state.workspaceSettings?.availableMcpServers || []
            assert.ok(availableMcp.length >= 1, 'Planner must see authorized Workspace MCP servers in workspaceSettings')
            const mcpId = availableMcp[0].id
            text = JSON.stringify({
                name: 'Trợ lý Drive sang Excel',
                goal: 'Đọc báo cáo từ Google Drive và cập nhật sang bảng Excel qua MCP',
                instructions: 'Gọi tuần tự công cụ đọc file Drive rồi ghi tóm tắt sang Excel.',
                mcpServers: [mcpId],
                workflow: {
                    summary: 'Dùng Agent gắn MCP Tools (Drive & Excel) của Workspace để đồng bộ báo cáo.',
                    steps: [
                        {
                            id: 'sync_office',
                            type: 'agent',
                            label: 'Đồng bộ Drive sang Excel',
                            instruction: 'Đọc báo cáo trên Drive rồi ghi kết quả tóm tắt vào Excel.',
                            inputFrom: ['start'],
                            mcpServerIds: [mcpId]
                        }
                    ],
                    edges: [{ source: 'start', target: 'sync_office' }],
                    questions: [],
                    blockers: []
                }
            })
        } else {
            text = JSON.stringify({
                name: 'Trợ lý DeskFlow Agentic RAG',
                goal: 'Hỏi đáp tài liệu DeskFlow với cơ chế tự viết lại truy vấn khi chưa tìm thấy bằng chứng',
                instructions: 'Trả lời tiếng Việt chính xác theo tài liệu và dẫn nguồn.',
                workflow: agenticRagWorkflow(state.currentSpec?.dataSources || [])
            })
        }
    } else if (userContent.includes('"scenarios":')) {
        if (userContent.includes('Câu hỏi về sử dụng phần mềm DeskFlow')) {
            const isOutScope = /neutrino|sao hỏa/i.test(userContent)
            text = JSON.stringify({
                output: isOutScope ? 'Câu hỏi ngoài phạm vi' : 'Câu hỏi về sử dụng phần mềm DeskFlow'
            })
        } else {
            const hasRelevantDoc = userContent.includes('6314')
            text = JSON.stringify({
                output: hasRelevantDoc
                    ? 'Tài liệu có thông tin liên quan để trả lời'
                    : 'Tài liệu chưa liên quan, cần viết lại câu truy vấn'
            })
        }
    } else if (system.includes('NHIỆM VỤ BƯỚC Tạo câu truy vấn lần đầu:')) {
        text = 'quỹ đạo thiên hà xa xôi'
    } else if (system.includes('NHIỆM VỤ BƯỚC Viết lại câu truy vấn:')) {
        text = 'Đổi mật khẩu mã xác nhận 6314'
    } else if (system.includes('NHIỆM VỤ BƯỚC Tổng hợp câu trả lời:')) {
        text =
            userContent.includes('Làm sao đổi mật khẩu') && userContent.includes('6314')
                ? 'Mở Hồ sơ → Bảo mật → Đổi mật khẩu. Mã xác nhận demo sau khi tự sửa truy vấn là 6314. [1]'
                : 'MISSING_CONTEXT'
    } else {
        text = 'OK'
    }

    res.end(
        JSON.stringify({
            id: 'chatcmpl-b031',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
        })
    )
})

await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
const fixturePort = fixture.address().port
const fixtureUrl = `http://127.0.0.1:${fixturePort}/v1`
const mcpServerUrl = `http://127.0.0.1:${fixturePort}/mcp/office-suite`

const probe = net.createServer()
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise((resolve) => probe.close(resolve))

const base = `http://127.0.0.1:${port}/api/v1`
const node = path.join(root, 'AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe')
const backend = spawn(node, ['--max-old-space-size=4096', 'packages/server/bin/run', 'start'], {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=4096',
        HOST: '127.0.0.1',
        PORT: String(port),
        DATABASE_TYPE: 'sqlite',
        DATABASE_PATH: path.join(runtime, 'db'),
        SECRETKEY_PATH: path.join(runtime, 'keys'),
        LOG_PATH: path.join(runtime, 'logs'),
        BLOB_STORAGE_PATH: path.join(runtime, 'storage'),
        BUILDER_ALLOW_LOCAL_MODEL: 'true',
        HTTP_SECURITY_CHECK: 'false',
        OPENAI_API_KEY: '',
        BUILDER_CREDENTIAL_ID: '',
        BUILDER_MODEL_BASE_URL: '',
        BUILDER_MODEL_NAME: 'fixture-chat',
        DISABLE_FLOWISE_ANALYTICS: 'true'
    }
})
backend.stdout.on('data', (chunk) => fs.appendFileSync(logs, chunk))
backend.stderr.on('data', (chunk) => fs.appendFileSync(logs, chunk))

let cookie = ''
async function api(method, resource, body) {
    const multipart = body instanceof FormData
    const response = await fetch(base + resource, {
        method,
        signal: AbortSignal.timeout(60000),
        headers: {
            Cookie: cookie,
            'x-request-from': 'internal',
            ...(!multipart && body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: multipart ? body : JSON.stringify(body) } : {})
    })
    const raw = await response.text()
    let data
    try {
        data = JSON.parse(raw)
    } catch {
        data = raw
    }
    if (!response.ok) throw new Error(`${method} ${resource} ${response.status}: ${JSON.stringify(data).slice(0, 900)}`)
    return { response, data }
}

try {
    let ready = false
    for (let attempt = 0; attempt < 240; attempt++) {
        if (backend.exitCode !== null) throw new Error('Test backend exited early')
        try {
            if ((await fetch(base + '/ping')).ok) {
                ready = true
                break
            }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    assert.equal(ready, true, 'Test backend did not become ready within 120s')

    const email = `b031-${randomBytes(4).toString('hex')}@example.invalid`
    const password = 'Aa1!' + randomBytes(16).toString('hex')
    await api('POST', '/account/register', { user: { name: 'B031 verifier', email, credential: password } })
    const login = await api('POST', '/auth/login', { email, password })
    cookie = login.response.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; ')

    await api('PUT', '/agent-builder/model-profile', {
        modelName: 'fixture-chat',
        baseUrl: fixtureUrl,
        apiKey: 'test-only-b031-fixture-key'
    })

    // 1) Register Workspace MCP Server with Bearer token -> Streamable HTTP handshake & secret masking
    const mcpCreated = await api('POST', '/agent-builder/mcp-servers', {
        name: 'Google Drive & Excel MCP',
        serverUrl: mcpServerUrl,
        bearerToken: MCP_BEARER
    })
    assert.equal(mcpCreated.data.status, 'AUTHORIZED')
    assert.equal(mcpCreated.data.toolCount, 2)
    assert.equal(mcpCreated.data.hasCustomHeaders, true)
    assert.equal(mcpCreated.data.authConfig, undefined, 'Encrypted authConfig must never be returned')
    assert.ok(!JSON.stringify(mcpCreated.data).includes(MCP_BEARER), 'Bearer token must never leak in API response')
    assert.match(mcpCreated.data.serverUrl, /\*{6,}/, 'Server URL path must be masked')
    assert.deepEqual(
        mcpCreated.data.actions.map((a) => a.name),
        ['drive_read_report', 'excel_append_summary']
    )

    const mcpRefreshed = await api('POST', `/agent-builder/mcp-servers/${mcpCreated.data.id}/refresh`)
    assert.equal(mcpRefreshed.data.status, 'AUTHORIZED')
    assert.equal(mcpRefreshed.data.toolCount, 2)

    // 2) Agentic RAG (ConditionAgent + Flow State + Loop self-correction!) on real Flowise V2 runtime
    const { data: ragSession } = await api('POST', '/agent-builder/sessions', {})
    const md = fs.readFileSync('AI-Agent/fixtures/deskflow-guide.md')
    const form = new FormData()
    form.append('files', new Blob([md]), 'deskflow-guide.md')
    form.append('content', 'Tạo trợ lý Agentic RAG tự viết lại truy vấn và lặp tìm lại khi tài liệu chưa khớp.')
    form.append('expectedRevision', String(ragSession.session.currentRevisionNo))
    form.append('clientMessageId', randomBytes(12).toString('hex'))
    form.append('retrievalMode', 'lexical')
    const uploaded = await api('POST', `/agent-builder/sessions/${ragSession.session.id}/documents`, form)
    assert.equal(uploaded.data.buildResult, undefined, 'Must wait for "xong" before building')

    const ragBuilt = await api('POST', `/agent-builder/sessions/${ragSession.session.id}/messages`, {
        content: 'xong',
        clientMessageId: randomBytes(12).toString('hex'),
        expectedRevision: uploaded.data.currentSpecRevision.revisionNo
    })
    assert.equal(ragBuilt.data.buildResult?.success, true, JSON.stringify(ragBuilt.data.buildResult))

    const ragPreview = await api('POST', `/agent-builder/drafts/${ragBuilt.data.buildResult.flowId}/preview`, {
        question: 'Làm sao đổi mật khẩu? Cho biết mã xác nhận demo.'
    })
    assert.match(ragPreview.data.text, /6314/)
    const executedNodes = ragPreview.data.agentFlowExecutedData.map((item) => item.data?.name)
    const retrieverExecs = executedNodes.filter((n) => n === 'retrieverAgentflow')
    const loopExecs = executedNodes.filter((n) => n === 'loopAgentflow')
    const condAgentExecs = executedNodes.filter((n) => n === 'conditionAgentAgentflow')
    assert.equal(retrieverExecs.length, 2, `Expected Retriever to run twice across Loop self-correction, got ${retrieverExecs.length}`)
    assert.equal(loopExecs.length, 1, `Expected Loop node to trigger once, got ${loopExecs.length}`)
    assert.equal(condAgentExecs.length, 3, `Expected ConditionAgent to run 3 times, got ${condAgentExecs.length}`)
    assert.ok(ragPreview.data.sourceDocuments?.some((doc) => doc.pageContent.includes('6314')))

    const outPreview = await api('POST', `/agent-builder/drafts/${ragBuilt.data.buildResult.flowId}/preview`, {
        question: 'Tính quỹ đạo neutrino trên sao hỏa.'
    })
    assert.match(outPreview.data.text, /chỉ hỗ trợ hướng dẫn phần mềm DeskFlow/)

    // 3) Planner auto-binding Workspace MCP Server -> "xong" -> live Agent execution calling BOTH Drive & Excel MCP tools!
    const mcpChat = await api('POST', '/agent-builder/sessions', {
        initialGoal: 'Tạo Agent đọc báo cáo trên Google Drive rồi ghi bảng tổng hợp vào Excel.'
    })
    assert.equal(mcpChat.data.readiness.buildReady, true)
    const mcpBuilt = await api('POST', `/agent-builder/sessions/${mcpChat.data.session.id}/messages`, {
        content: 'xong',
        clientMessageId: randomBytes(12).toString('hex'),
        expectedRevision: mcpChat.data.currentSpecRevision.revisionNo
    })
    assert.equal(mcpBuilt.data.buildResult?.success, true)

    const mcpPreview = await api('POST', `/agent-builder/drafts/${mcpBuilt.data.buildResult.flowId}/preview`, {
        question: 'Hãy đọc BaoCao_Q4.docx trên Drive rồi điền tóm tắt vào sheet TongHop2026 trên Excel.'
    })
    assert.match(mcpPreview.data.text, /420 tỷ VNĐ/)
    assert.match(mcpPreview.data.text, /TongHop2026/)
    assert.deepEqual(
        mcpInvocations.map((inv) => inv.name),
        ['drive_read_report', 'excel_append_summary'],
        'Real Flowise customMcpServerTool must invoke both Drive and Excel MCP tools over Streamable HTTP with decrypted Bearer auth!'
    )

    fs.writeFileSync(
        path.join(local, 'integration-result.json'),
        JSON.stringify(
            {
                passed: true,
                runName,
                mcpToolsDiscovered: mcpCreated.data.actions.map((a) => a.name),
                mcpInvocations,
                agenticRagExecutionTrace: executedNodes
            },
            null,
            2
        )
    )
    console.log(
        'PASS: B-031 Workspace MCP discovery + live Drive/Excel MCP tool execution + real Agentic RAG (ConditionAgent + Flow State + Loop)!'
    )
} catch (error) {
    console.error(error.stack || error.message)
    process.exitCode = 1
} finally {
    backend.kill()
    if (backend.exitCode === null) {
        await Promise.race([
            new Promise((resolve) => backend.once('exit', resolve)),
            new Promise((resolve) => setTimeout(resolve, 5000))
        ])
    }
    await new Promise((resolve) => fixture.close(resolve))
    console.log('Closed owned B-031 test backend and fixture. User processes untouched.')
}
