// Controlled B-032 runtime integration check:
// 1) Verifies ExcelOfficeTool & WordOfficeTool are loaded into Flowise NodesPool (/api/v1/nodes) & /api/v1/agent-builder/native-tools
// 2) Chat -> Planner selects nativeTools: ["excelOfficeTool", "wordOfficeTool"] -> "xong" -> compiles V2 Agent
// 3) Real Agentflow V2 runtime invokes excel_create_workbook & word_create_document, writes real .xlsx & .docx, and downloads via /exports
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
process.chdir(root)
const require = createRequire(path.join(root, 'packages/components/package.json'))
const XLSX = require('xlsx')

const local = path.join(root, 'AI-Agent/.local/B-032')
fs.mkdirSync(local, { recursive: true })
const runName = `B032-smoke-${Date.now()}`
const runtime = path.join(root, 'AI-Agent/.local', runName)
for (const directory of ['db', 'keys', 'logs', 'storage']) fs.mkdirSync(path.join(runtime, directory), { recursive: true })
const logs = path.join(local, `${runName}.log`)

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

    // Live Agent tool-calling with excel_create_workbook & word_create_document
    if (Array.isArray(body.tools) && body.tools.some((t) => t.function?.name === 'excel_create_workbook')) {
        const toolMsgs = messages.filter((m) => m.role === 'tool')
        if (toolMsgs.length === 0) {
            return res.end(
                JSON.stringify({
                    id: 'chatcmpl-office-1',
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
                                        id: 'call_excel_1',
                                        type: 'function',
                                        function: {
                                            name: 'excel_create_workbook',
                                            arguments: JSON.stringify({
                                                fileName: 'Thong_Ke_Y_Tuong.xlsx',
                                                sheets: [
                                                    {
                                                        sheetName: 'YTuong2026',
                                                        columns: ['#', 'Tên ý tưởng', 'Mô tả chung', 'PIC'],
                                                        rows: [
                                                            [1, 'Build agent từ A->Z bằng chat', 'Tự động lắp node Flowise V2', 'Tuan Anh'],
                                                            [2, 'Tích hợp Word & Excel nội bộ', 'Xuất file trực tiếp không cần MCP', 'AI Team']
                                                        ]
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
                    usage: { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 }
                })
            )
        }
        if (toolMsgs.length === 1) {
            return res.end(
                JSON.stringify({
                    id: 'chatcmpl-office-2',
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
                                        id: 'call_word_2',
                                        type: 'function',
                                        function: {
                                            name: 'word_create_document',
                                            arguments: JSON.stringify({
                                                fileName: 'Bien_Ban_De_Xuat.docx',
                                                title: 'BIÊN BẢN ĐỀ XUẤT HỆ THỐNG CHAT-TO-AGENT',
                                                sections: [
                                                    {
                                                        heading: '1. Mục tiêu dự án',
                                                        paragraphs: ['Xây dựng Agent từ A đến Z hoàn toàn qua giao diện hội thoại tiếng Việt.'],
                                                        bullets: ['Tự động nhận diện kho Node công cụ Flowise', 'Hỗ trợ xuất file Word và Excel trực tiếp'],
                                                        table: {
                                                            headers: ['Hạng mục', 'Trạng thái'],
                                                            rows: [
                                                                ['Node Excel nội bộ', 'Hoàn thành'],
                                                                ['Node Word nội bộ', 'Hoàn thành']
                                                            ]
                                                        }
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
                    usage: { prompt_tokens: 55, completion_tokens: 35, total_tokens: 90 }
                })
            )
        }
        // Deliberately omit markdownLink in prose so runtimePredictionService auto-attachment is ALSO verified!
        return res.end(
            JSON.stringify({
                id: 'chatcmpl-office-3',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: 'Tôi đã tạo xong bảng tính Excel thống kê ý tưởng và biên bản đề xuất Word cho bạn!'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: { prompt_tokens: 70, completion_tokens: 20, total_tokens: 90 }
            })
        )
    }

    if (system.includes('Bạn thu thập yêu cầu')) {
        const state = JSON.parse(messages.at(-1).content)
        const nativeList = state.workspaceSettings?.availableNativeTools || []
        assert.ok(nativeList.some((t) => t.nodeName === 'excelOfficeTool' && t.ready === true))
        assert.ok(nativeList.some((t) => t.nodeName === 'wordOfficeTool' && t.ready === true))
        return res.end(
            JSON.stringify({
                id: 'chatcmpl-plan-office',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: JSON.stringify({
                                name: 'Trợ lý Văn phòng Excel & Word',
                                goal: 'Tạo bảng tính Excel thống kê và soạn văn bản Word theo yêu cầu',
                                instructions: 'Sử dụng công cụ Excel và Word nội bộ để xuất file thật cho người dùng.',
                                workflow: {
                                    summary: 'Dùng Agent gắn trực tiếp node Excel (.xlsx) và Word (.docx) nội bộ của Flowise.',
                                    steps: [
                                        {
                                            id: 'office_worker',
                                            type: 'agent',
                                            label: 'Soạn thảo Excel & Word',
                                            instruction: 'Tạo file Excel và file Word theo nội dung người dùng yêu cầu.',
                                            inputFrom: ['start'],
                                            nativeTools: ['excelOfficeTool', 'wordOfficeTool']
                                        }
                                    ],
                                    edges: [{ source: 'start', target: 'office_worker' }],
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

    const email = `b032-${randomBytes(4).toString('hex')}@example.invalid`
    const password = 'Aa1!' + randomBytes(16).toString('hex')
    await api('POST', '/account/register', { user: { name: 'B032 verifier', email, credential: password } })
    const login = await api('POST', '/auth/login', { email, password })
    cookie = login.response.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; ')

    await api('PUT', '/agent-builder/model-profile', {
        modelName: 'fixture-chat',
        baseUrl: fixtureUrl,
        apiKey: 'test-only-b032-fixture-key'
    })

    // 1) Verify NodesPool (/nodes) AND /agent-builder/native-tools expose ExcelOfficeTool, WordOfficeTool & Flowise native catalog
    const allNodes = await api('GET', '/nodes')
    assert.ok(allNodes.data.some((n) => n.name === 'excelOfficeTool'), 'NodesPool must contain excelOfficeTool')
    assert.ok(allNodes.data.some((n) => n.name === 'wordOfficeTool'), 'NodesPool must contain wordOfficeTool')

    const nativeCatalog = await api('GET', '/agent-builder/native-tools')
    assert.ok(nativeCatalog.data.length >= 20, `Expected >=20 native Flowise tools, got ${nativeCatalog.data.length}`)
    assert.ok(nativeCatalog.data.some((t) => t.nodeName === 'excelOfficeTool' && t.ready === true))
    assert.ok(nativeCatalog.data.some((t) => t.nodeName === 'wordOfficeTool' && t.ready === true))
    assert.ok(nativeCatalog.data.some((t) => t.nodeName === 'googleSheetsTool' && t.requiresCredential === true))

    // 2) Build Office Agent via Chat + "xong"
    const created = await api('POST', '/agent-builder/sessions', {
        initialGoal: 'Tạo trợ lý lập bảng tính Excel thống kê ý tưởng và soạn biên bản Word.'
    })
    assert.equal(created.data.readiness.buildReady, true)
    const built = await api('POST', `/agent-builder/sessions/${created.data.session.id}/messages`, {
        content: 'xong',
        clientMessageId: randomBytes(12).toString('hex'),
        expectedRevision: created.data.currentSpecRevision.revisionNo
    })
    assert.equal(built.data.buildResult?.success, true)

    // 3) Execute real Agentflow V2 preview -> generates real .xlsx & .docx + auto-attaches download links!
    const preview = await api('POST', `/agent-builder/drafts/${built.data.buildResult.flowId}/preview`, {
        question: 'Hãy xuất bảng Excel thống kê 2 ý tưởng và file Word biên bản đề xuất.'
    })
    const exportUrls = [...preview.data.text.matchAll(/(\/api\/v1\/agent-builder\/exports\/[0-9a-f-]{36}\/[^)\s]+)/gi)].map((m) => m[1])
    assert.equal(exportUrls.length, 2, `Expected 2 download links (.xlsx & .docx) in reply, got: ${preview.data.text}`)

    const xlsxPathUrl = exportUrls.find((u) => u.endsWith('.xlsx')).replace('/api/v1', '')
    const docxPathUrl = exportUrls.find((u) => u.endsWith('.docx')).replace('/api/v1', '')

    // Download & parse real .xlsx binary!
    const xlsxRes = await fetch(base + xlsxPathUrl, { headers: { Cookie: cookie, 'x-request-from': 'internal' } })
    assert.equal(xlsxRes.status, 200)
    const xlsxBuf = Buffer.from(await xlsxRes.arrayBuffer())
    const parsedWb = XLSX.read(xlsxBuf, { type: 'buffer' })
    assert.deepEqual(parsedWb.SheetNames, ['YTuong2026'])
    const rows = XLSX.utils.sheet_to_json(parsedWb.Sheets.YTuong2026)
    assert.equal(rows.length, 2)
    assert.equal(rows[0]['Tên ý tưởng'], 'Build agent từ A->Z bằng chat')

    // Download & verify real .docx OOXML ZIP binary!
    const docxRes = await fetch(base + docxPathUrl, { headers: { Cookie: cookie, 'x-request-from': 'internal' } })
    assert.equal(docxRes.status, 200)
    const docxBuf = Buffer.from(await docxRes.arrayBuffer())
    assert.equal(docxBuf.subarray(0, 2).toString('utf8'), 'PK', 'Generated .docx must be a valid ZIP/OOXML container')
    assert.ok(docxBuf.toString('utf8').includes('BIÊN BẢN ĐỀ XUẤT HỆ THỐNG CHAT-TO-AGENT'))

    // Anonymous download must be blocked
    const anonRes = await fetch(base + xlsxPathUrl)
    assert.ok([401, 403].includes(anonRes.status), `Anonymous export download must be blocked, got ${anonRes.status}`)

    fs.writeFileSync(
        path.join(local, 'integration-result.json'),
        JSON.stringify(
            {
                passed: true,
                runName,
                nativeToolsCount: nativeCatalog.data.length,
                exportUrls,
                excelRowsVerified: rows.length
            },
            null,
            2
        )
    )
    console.log('PASS: B-032 NodesPool native catalog + real Excel (.xlsx) & Word (.docx) generation and authenticated download!')
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
    console.log('Closed owned B-032 test backend and fixture. User processes untouched.')
}
