// Controlled B-034 runtime integration check:
// 1) Tests Self-Critic Architect Guard (decomposes lazy 1-node response into multi-branch ConditionAgent workflow)
// 2) Compiles Flowise V1 (MULTIAGENT — /agentcanvas) graph hydrated from live NodesPool
// 3) Executes the compiled V1 LangGraph StateGraph live via /agent-builder/drafts/:id/preview
//    (seqStart -> seqConditionAgent -> seqAgent -> pm_create_tasks tool -> seqEnd)
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
process.chdir(root)

const local = path.join(root, 'AI-Agent/.local/B-034')
fs.mkdirSync(local, { recursive: true })
const runName = `B034-v1-smoke-${Date.now()}`
const runtime = path.join(root, 'AI-Agent/.local', runName)
for (const directory of ['db', 'keys', 'logs', 'storage']) fs.mkdirSync(path.join(runtime, directory), { recursive: true })
const logs = path.join(local, `${runName}.log`)

let collectorCalls = 0
let runtimeRouterCalls = 0
let runtimeAgentCalls = 0

const fixture = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
    res.setHeader('Content-Type', 'application/json')
    if (req.url !== '/v1/chat/completions') return res.writeHead(404).end('{}')

    const messages = body.messages || []
    const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n')

    // 1. Live V1 seqConditionAgent structured output routing (`withStructuredOutput(..., { method: 'functionCalling' })`)
    const routeTool = Array.isArray(body.tools) ? body.tools.find((t) => t.function?.parameters?.properties?.route) : null
    if (routeTool) {
        runtimeRouterCalls++
        return res.end(
            JSON.stringify({
                id: 'chatcmpl-v1-router',
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
                                    id: 'call_route_1',
                                    type: 'function',
                                    function: {
                                        name: routeTool.function.name,
                                        arguments: JSON.stringify({ route: 'ROUTE_0' })
                                    }
                                }
                            ]
                        },
                        finish_reason: 'tool_calls'
                    }
                ],
                usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
            })
        )
    }

    // 2. Live V1 seqAgent calling pm_create_tasks tool
    if (Array.isArray(body.tools) && body.tools.some((t) => t.function?.name === 'pm_create_tasks')) {
        runtimeAgentCalls++
        const toolMsgs = messages.filter((m) => m.role === 'tool')
        if (toolMsgs.length === 0) {
            return res.end(
                JSON.stringify({
                    id: 'chatcmpl-v1-agent-1',
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
                                        id: 'call_pm_1',
                                        type: 'function',
                                        function: {
                                            name: 'pm_create_tasks',
                                            arguments: JSON.stringify({
                                                projectKey: 'google_login_v1',
                                                tasks: [
                                                    {
                                                        title: 'Thiết kế giao diện nút Đăng nhập Google',
                                                        description: 'Thiết kế UI/UX chuẩn Google Branding',
                                                        priority: 'P1',
                                                        deadline: '2026-11-22',
                                                        acceptanceCriteria: ['Responsive mobile & desktop']
                                                    },
                                                    {
                                                        title: 'Tích hợp OAuth2 & Backend xác thực',
                                                        description: 'Xác thực id_token Google và tạo session JWT',
                                                        priority: 'P0',
                                                        deadline: '2026-11-24',
                                                        acceptanceCriteria: ['Pass test xác thực token'],
                                                        dependencies: ['TASK-1']
                                                    }
                                                ]
                                            })
                                        }
                                    }
                                ]
                            },
                            finish_reason: 'tool_calls'
                        }
                    ],
                    usage: { prompt_tokens: 45, completion_tokens: 35, total_tokens: 80 }
                })
            )
        }
        return res.end(
            JSON.stringify({
                id: 'chatcmpl-v1-agent-2',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: 'Đã phân rã và tạo thành công 2 task (TASK-1, TASK-2) cho tính năng Đăng nhập Google trên Flowise V1!'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: { prompt_tokens: 60, completion_tokens: 25, total_tokens: 85 }
            })
        )
    }

    // 3. Collector Pass 1 (intentionally returns lazy 1-step graph to verify Self-Critic triggers Pass 2)
    if (system.includes('Bạn thu thập yêu cầu tạo trợ lý')) {
        collectorCalls++
        return res.end(
            JSON.stringify({
                id: 'chatcmpl-collector-lazy',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: JSON.stringify({
                                name: 'AI Quản Lý Dự Án V1',
                                goal: 'Tự động chia nhỏ task, giao việc, kiểm tra tiến độ và báo cáo dự án',
                                instructions: 'Điều phối toàn bộ quy trình quản lý dự án phần mềm tự động bằng tiếng Việt.',
                                workflow: {
                                    summary: 'Bản nháp đơn 1 bước.',
                                    steps: [
                                        {
                                            id: 'lazy_single',
                                            type: 'agent',
                                            label: 'Agent Chung',
                                            instruction: 'Xử lý tất cả.',
                                            inputFrom: ['start'],
                                            nativeTools: ['projectTrackerTool']
                                        }
                                    ],
                                    edges: [{ source: 'start', target: 'lazy_single' }],
                                    questions: [],
                                    blockers: []
                                }
                            })
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: { prompt_tokens: 30, completion_tokens: 25, total_tokens: 55 }
            })
        )
    }

    // 4. Collector Pass 2 (Self-Critic Architect Decomposition)
    if (system.includes('Kiến trúc sư Flowise chuyên nghiệp')) {
        collectorCalls++
        return res.end(
            JSON.stringify({
                id: 'chatcmpl-collector-critic',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: JSON.stringify({
                                summary: 'Điều phối đa nhánh Quản lý Dự án Tự động (Tạo task / Tiến độ & Rủi ro / Dời deadline & Báo cáo).',
                                archetype: 'mcp_automation',
                                enableMemory: true,
                                steps: [
                                    {
                                        id: 'route_pm',
                                        type: 'conditionAgent',
                                        label: 'Điều phối Dự án',
                                        instruction: 'Phân loại yêu cầu vào đúng nhánh nghiệp vụ.',
                                        inputFrom: ['start'],
                                        scenarios: ['Phân rã và tạo task mới', 'Kiểm tra tiến độ và phát hiện rủi ro', 'Dời deadline và gửi báo cáo']
                                    },
                                    {
                                        id: 'branch_create',
                                        type: 'agent',
                                        label: 'Phân rã & Tạo Task',
                                        instruction: 'Chia nhỏ yêu cầu và gọi pm_create_tasks tạo task chống trùng lặp.',
                                        inputFrom: ['start'],
                                        nativeTools: ['projectTrackerTool', 'currentDateTime']
                                    },
                                    {
                                        id: 'branch_progress',
                                        type: 'agent',
                                        label: 'Kiểm tra Tiến độ & Rủi ro',
                                        instruction: 'Truy vấn task quá hạn, bị chặn và phát hiện rủi ro.',
                                        inputFrom: ['start'],
                                        nativeTools: ['projectTrackerTool']
                                    },
                                    {
                                        id: 'branch_report',
                                        type: 'agent',
                                        label: 'Báo cáo & Dời Deadline',
                                        instruction: 'Phân tích dời deadline và gửi báo cáo Telegram.',
                                        inputFrom: ['start'],
                                        nativeTools: ['projectTrackerTool', 'telegramNotifyTool']
                                    }
                                ],
                                edges: [
                                    { source: 'start', target: 'route_pm' },
                                    { source: 'route_pm', target: 'branch_create', branch: '0' },
                                    { source: 'route_pm', target: 'branch_progress', branch: '1' },
                                    { source: 'route_pm', target: 'branch_report', branch: '2' }
                                ],
                                questions: [],
                                blockers: []
                            })
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: { prompt_tokens: 40, completion_tokens: 50, total_tokens: 90 }
            })
        )
    }

    res.end('{}')
})

await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}/v1`

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
    const response = await fetch(base + resource, {
        method,
        signal: AbortSignal.timeout(60000),
        headers: {
            Cookie: cookie,
            'x-request-from': 'internal',
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
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

    const email = `b034-${randomBytes(4).toString('hex')}@example.invalid`
    const password = 'Aa1!' + randomBytes(16).toString('hex')
    await api('POST', '/account/register', { user: { name: 'B034 V1 Verifier', email, credential: password } })
    const login = await api('POST', '/auth/login', { email, password })
    cookie = login.response.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; ')

    await api('PUT', '/agent-builder/model-profile', {
        modelName: 'fixture-chat',
        baseUrl: fixtureUrl,
        apiKey: 'test-only-b034-fixture-key'
    })

    // 1. Create session with canvasVersion='v1' and complex 4-module PM prompt -> Self-Critic decomposes it!
    const created = await api('POST', '/agent-builder/sessions', {
        canvasVersion: 'v1',
        initialGoal:
            'Xây dựng AI Agent quản lý công việc dự án phần mềm tự động:\n' +
            '1. Tiếp nhận yêu cầu, chia nhỏ công việc và tạo task trên GitHub Issues / Trello.\n' +
            '2. Tự động giao việc theo khối lượng công việc sau khi tôi xác nhận.\n' +
            '3. Kiểm tra tiến độ, phát hiện rủi ro trễ deadline và gửi báo cáo 17h qua Telegram.\n' +
            '4. Xử lý yêu cầu dời deadline thêm 3 ngày có xác nhận trước khi đổi dữ liệu thật.'
    })
    assert.equal(collectorCalls, 2, 'Self-Critic Architect Guard must trigger Pass 2 decomposition')
    const spec = JSON.parse(created.data.currentSpecRevision.spec)
    assert.equal(spec.canvasVersion, 'v1')
    assert.equal(spec.workflow.steps.length, 4, 'Decomposed workflow must have 4 steps (ConditionAgent + 3 branches)')

    // 2. Confirm "xong" -> compiles V1 MULTIAGENT flow hydrated from live NodesPool
    const built = await api('POST', `/agent-builder/sessions/${created.data.session.id}/messages`, {
        content: 'xong',
        clientMessageId: `confirm-${Date.now()}`,
        canvasVersion: 'v1'
    })
    assert.equal(built.data.buildResult?.success, true, 'V1 build must succeed')
    assert.equal(built.data.buildResult?.flowType, 'MULTIAGENT', 'Compiled flowType must be MULTIAGENT')
    const flowId = built.data.buildResult.flowId

    // 3. Inspect persisted ChatFlow to verify real V1 MULTIAGENT nodes hydrated from NodesPool
    const flowRes = await api('GET', `/chatflows/${flowId}`)
    assert.equal(flowRes.data.type, 'MULTIAGENT')
    const graph = JSON.parse(flowRes.data.flowData)
    const names = graph.nodes.map((n) => n.data.name)
    for (const expected of ['chatOpenAI', 'seqStart', 'agentMemory', 'seqConditionAgent', 'seqAgent', 'projectTrackerTool', 'telegramNotifyTool', 'seqEnd', 'stickyNote']) {
        assert.ok(names.includes(expected), `V1 graph must contain hydrated ${expected} node`)
    }
    const startNode = graph.nodes.find((n) => n.data.name === 'seqStart')
    assert.ok(startNode.data.inputAnchors.length >= 3, 'seqStart must have hydrated inputAnchors from live NodesPool')

    // 4. Execute live V1 LangGraph preview!
    const preview = await api('POST', `/agent-builder/drafts/${flowId}/preview`, {
        question: 'Xây dựng chức năng đăng nhập bằng Google cho website'
    })
    assert.ok(preview.data.text.includes('TASK-1'), `Expected V1 live LangGraph output to mention TASK-1, got: ${preview.data.text}`)
    assert.equal(runtimeRouterCalls, 1, 'V1 seqConditionAgent must execute live')
    assert.equal(runtimeAgentCalls, 2, 'V1 seqAgent must invoke pm_create_tasks tool and return final answer')

    console.log(
        JSON.stringify(
            {
                status: 'PASS',
                flowId,
                flowType: flowRes.data.type,
                v1NodeCount: graph.nodes.length,
                v1EdgeCount: graph.edges.length,
                collectorCalls,
                runtimeRouterCalls,
                runtimeAgentCalls,
                previewText: preview.data.text
            },
            null,
            2
        )
    )
} finally {
    fixture.close()
    if (backend.exitCode === null) backend.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 600))
    fs.rmSync(runtime, { recursive: true, force: true })
}
