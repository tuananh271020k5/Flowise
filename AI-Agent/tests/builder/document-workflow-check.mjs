// Controlled integration check. Own backend/fixture/browser are always closed; user app is untouched.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
process.chdir(root)
const local = path.join(root, 'AI-Agent/.local/B-030')
fs.mkdirSync(local, { recursive: true })
const runName = `B030-smoke-${Date.now()}`
const runtime = path.join(root, 'AI-Agent/.local', runName)
for (const directory of ['db', 'keys', 'logs', 'storage']) fs.mkdirSync(path.join(runtime, directory), { recursive: true })
const logs = path.join(local, `${runName}.log`)
const count = { collector: 0, runtime: 0, embeddings: 0 }
const plan = (sources) => ({ summary: 'Hướng dẫn DeskFlow từ tài liệu, kiểm tra bằng chứng trước khi trả lời.', steps: [
    { id: 'find', type: 'retriever', label: 'Tìm tài liệu', instruction: 'Tìm các đoạn hướng dẫn phù hợp câu hỏi.', inputFrom: ['start'], sourceIds: sources.map((source) => source.id) },
    { id: 'evidence', type: 'condition', label: 'Kiểm tra bằng chứng', instruction: 'Kiểm tra kết quả truy xuất không rỗng.', inputFrom: ['find'], condition: { operation: 'notEmpty' } },
    { id: 'answer', type: 'llm', label: 'Hướng dẫn từng bước', instruction: 'Trả lời dựa trên tài liệu và dẫn [số nguồn].', inputFrom: ['find'] },
    { id: 'missing', type: 'reply', label: 'Hỏi rõ khi thiếu dữ liệu', instruction: 'Tôi chưa tìm thấy thông tin này trong tài liệu. Bạn có thể bổ sung hướng dẫn phù hợp không?', inputFrom: ['evidence'] }
], edges: [{ source: 'start', target: 'find' }, { source: 'find', target: 'evidence' }, { source: 'evidence', target: 'answer', branch: 'true' }, { source: 'evidence', target: 'missing', branch: 'false' }], questions: sources.length ? [] : ['Hãy đính kèm tài liệu hướng dẫn.'], blockers: [] })
const scriptPlan = () => ({ summary: 'Viết kịch bản, chia cảnh, tạo prompt.', steps: [
    { id: 'script', type: 'llm', label: 'Viết kịch bản', instruction: 'Viết kịch bản từ ý tưởng người dùng.', inputFrom: ['start'] },
    { id: 'scenes', type: 'llm', label: 'Chia cảnh', instruction: 'Chia kịch bản thành các cảnh.', inputFrom: ['script'] },
    { id: 'prompts', type: 'llm', label: 'Tạo prompt', instruction: 'Tạo prompt từ danh sách cảnh.', inputFrom: ['scenes'] }
], edges: [{ source: 'start', target: 'script' }, { source: 'script', target: 'scenes' }, { source: 'scenes', target: 'prompts' }], questions: [], blockers: [] })
const fixture = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/embeddings') {
        count.embeddings++
        fs.appendFileSync(path.join(local, 'embedding-protocol.jsonl'), JSON.stringify({ encoding: body.encoding_format, inputs: Array.isArray(body.input) ? body.input.length : 1, model: body.model }) + '\n')
        const inputs = Array.isArray(body.input) ? body.input : [body.input]
        return res.end(JSON.stringify({ object: 'list', model: body.model, data: inputs.map((input, index) => ({ object: 'embedding', index, embedding: /mật khẩu|password|6314/i.test(input) ? [1, 0, 0] : [0, 1, 0] })), usage: { prompt_tokens: 10, total_tokens: 10 } }))
    }
    if (req.url !== '/v1/chat/completions') return res.writeHead(404).end('{}')
    const system = body.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n')
    let text
    if (system.includes('Bạn thu thập yêu cầu')) {
        count.collector++
        const state = JSON.parse(body.messages.at(-1).content)
        if (/kịch bản|Veo/.test(state.message)) {
            const workflow = scriptPlan()
            if (/Veo/.test(state.message)) {
                workflow.steps.push({ id: 'video', type: 'external', label: 'Tạo video Veo', instruction: 'Tạo video theo các cảnh.', capability: 'veo-video', inputFrom: ['prompts'] })
                workflow.edges.push({ source: 'prompts', target: 'video' })
            }
            text = JSON.stringify({ name: 'Xưởng kịch bản', goal: 'Viết kịch bản và chia cảnh từ ý tưởng', instructions: 'Thực hiện từng bước theo đầu vào được nối, không giả vờ xuất file hay tạo video.', workflow })
        } else {
            const workflow = plan(state.currentSpec?.dataSources || [])
            if (/chuẩn hóa/.test(state.message) || state.currentSpec.workflow?.steps?.some((step) => step.id === 'normalize')) {
                workflow.steps.unshift({ id: 'normalize', type: 'llm', label: 'Chuẩn hóa câu hỏi', instruction: 'Làm rõ câu hỏi ngắn gọn, giữ nguyên ý nghĩa và từ khóa.', inputFrom: ['start'] })
                workflow.steps.find((step) => step.id === 'find').inputFrom = ['normalize']
                workflow.edges[0] = { source: 'start', target: 'normalize' }
                workflow.edges.splice(1, 0, { source: 'normalize', target: 'find' })
            }
            text = JSON.stringify({ name: 'Trợ lý DeskFlow', goal: 'Hướng dẫn phần mềm DeskFlow theo tài liệu được cấp', instructions: 'Trả lời tiếng Việt theo tài liệu, dẫn nguồn, thiếu bằng chứng thì hỏi rõ.', workflow })
        }
    } else {
        count.runtime++
        const context = body.messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n')
        if (system.includes('NHIỆM VỤ BƯỚC Viết kịch bản:')) text = 'SCENARIO_STORY'
        else if (system.includes('NHIỆM VỤ BƯỚC Chia cảnh:')) text = context.includes('SCENARIO_STORY') ? 'SCENE_1' : 'NO_UPSTREAM_RESPONSE'
        else if (system.includes('NHIỆM VỤ BƯỚC Tạo prompt:')) text = context.includes('SCENE_1') ? 'PROMPT_READY' : 'NO_UPSTREAM_RESPONSE'
        else if (system.includes('NHIỆM VỤ BƯỚC Chuẩn hóa câu hỏi:')) text = context
        else {
            const [questionPart = '', docPart = ''] = context.split('\n\nDữ liệu từ bước')
            if (!questionPart.startsWith('Câu hỏi / yêu cầu của người dùng:\n') || !docPart) text = 'MISSING_QUESTION_OR_DOCUMENT_CONTEXT'
            else if (/Tôi là Owner, muốn mời đồng đội/i.test(questionPart) && docPart.includes('48 giờ')) text = 'Owner mở Cài đặt → Thành viên → Mời thành viên, chọn Editor hoặc Viewer rồi bấm Gửi lời mời. Hiệu lực 48 giờ. [1]'
            else if (/mật khẩu/i.test(questionPart) && docPart.includes('6314')) text = 'Mở Hồ sơ → Bảo mật → Đổi mật khẩu, rồi bấm Lưu. Mã xác nhận demo là 6314. [1]'
            else text = 'UNMATCHED_QUESTION_OR_DOCUMENT'
        }
    }
    res.end(JSON.stringify({ id: 'chatcmpl-b030', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } }))
})
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}/v1`
const probe = net.createServer()
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise((resolve) => probe.close(resolve))
const base = `http://127.0.0.1:${port}/api/v1`
const node = path.join(root, 'AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe')
const backend = spawn(node, ['--max-old-space-size=4096', 'packages/server/bin/run', 'start'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, NODE_OPTIONS: '--max-old-space-size=4096', HOST: '127.0.0.1', PORT: String(port), DATABASE_TYPE: 'sqlite',
    DATABASE_PATH: path.join(runtime, 'db'), SECRETKEY_PATH: path.join(runtime, 'keys'), LOG_PATH: path.join(runtime, 'logs'), BLOB_STORAGE_PATH: path.join(runtime, 'storage'),
    BUILDER_ALLOW_LOCAL_MODEL: 'true', OPENAI_API_KEY: '', BUILDER_CREDENTIAL_ID: '', BUILDER_MODEL_BASE_URL: '', BUILDER_MODEL_NAME: 'fixture-chat', DISABLE_FLOWISE_ANALYTICS: 'true'
} })
backend.stdout.on('data', (chunk) => fs.appendFileSync(logs, chunk))
backend.stderr.on('data', (chunk) => fs.appendFileSync(logs, chunk))
let browser, uiServer, cookie = ''
async function api(method, resource, body) {
    const multipart = body instanceof FormData
    const response = await fetch(base + resource, { method, signal: AbortSignal.timeout(60000), headers: { Cookie: cookie, 'x-request-from': 'internal', ...(!multipart && body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}) })
    const raw = await response.text(); let data; try { data = JSON.parse(raw) } catch { data = raw }
    if (!response.ok) throw new Error(`${method} ${resource} ${response.status}: ${JSON.stringify(data).slice(0, 900)}`)
    return { response, data }
}
async function confirmBuild(sessionId, expectedRevision) {
    const collectorBefore = count.collector
    const { data } = await api('POST', `/agent-builder/sessions/${sessionId}/messages`, {
        content: 'xong',
        clientMessageId: randomBytes(12).toString('hex'),
        expectedRevision
    })
    assert.equal(count.collector, collectorBefore, 'Pure "xong" confirmation must not waste an extra LLM planner call')
    assert.equal(data.buildResult?.success, true, JSON.stringify(data.buildResult))
    return data
}
async function upload(name, bytes, mode = 'lexical') {
    const { data: created } = await api('POST', '/agent-builder/sessions', {})
    const body = new FormData()
    body.append('files', new Blob([bytes]), name)
    body.append('content', 'Tạo trợ lý hướng dẫn sử dụng phần mềm theo tài liệu đính kèm, kiểm tra bằng chứng và dẫn nguồn.')
    body.append('expectedRevision', String(created.session.currentRevisionNo))
    body.append('clientMessageId', randomBytes(12).toString('hex'))
    body.append('retrievalMode', mode); body.append('embeddingModel', 'fixture-embedding')
    const { data } = await api('POST', `/agent-builder/sessions/${created.session.id}/documents`, body)
    assert.equal(data.buildResult, undefined, 'Must wait for explicit "xong" confirmation before building')
    assert.match(data.assistantMessage?.content || '', /xong/i)
    assert.equal(JSON.parse(data.currentSpecRevision.spec).dataSources[0].name, name)
    return confirmBuild(created.session.id, data.currentSpecRevision.revisionNo)
}
function pdf() {
    const stream = 'BT /F1 12 Tf 50 700 Td (Reset password demo code 6314.) Tj ET'
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
    let content = '%PDF-1.4\n'; const offsets = [0]
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n` })
    const xref = Buffer.byteLength(content)
    content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(content)
}
function docx() {
    const entries = { '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', 'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Reset password demo code 6314.</w:t></w:r></w:p></w:body></w:document>' }
    const localParts = [], central = []; let offset = 0
    for (const [filename, value] of Object.entries(entries)) {
        const name = Buffer.from(filename), data = Buffer.from(value); let crc = -1
        for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
        crc = (crc ^ -1) >>> 0
        const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26)
        const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42)
        localParts.push(header, name, data); central.push(directory, name); offset += header.length + name.length + data.length
    }
    const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(3, 8); end.writeUInt16LE(3, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
    return Buffer.concat([...localParts, directory, end])
}
try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
        if (backend.exitCode !== null) throw new Error('Test backend exited; inspect own ignored log')
        try { if ((await fetch(base + '/ping')).ok) { ready = true; break } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    assert.equal(ready, true, 'Test backend not ready')
    const email = `b030-${randomBytes(4).toString('hex')}@example.invalid`, password = 'Aa1!' + randomBytes(16).toString('hex')
    await api('POST', '/account/register', { user: { name: 'B030 fixture', email, credential: password } })
    const login = await api('POST', '/auth/login', { email, password })
    cookie = login.response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    await api('PUT', '/agent-builder/model-profile', { modelName: 'fixture-chat', baseUrl: fixtureUrl, apiKey: 'test-only-b030-protocol-fixture' })
    const md = fs.readFileSync('AI-Agent/fixtures/deskflow-guide.md')
    const built = await upload('deskflow-guide.md', md)
    const preview = await api('POST', `/agent-builder/drafts/${built.buildResult.flowId}/preview`, { question: 'Làm sao đổi mật khẩu? Tôi cần mã xác nhận demo.' })
    fs.writeFileSync(path.join(local, 'fixture-runtime-preview.json'), JSON.stringify(preview.data, null, 2))
    assert.match(preview.data.text, /6314/)
    const invitePreview = await api('POST', `/agent-builder/drafts/${built.buildResult.flowId}/preview`, { question: 'Tôi là Owner, muốn mời đồng đội vào DeskFlow. Làm ở đâu và lời mời có hiệu lực bao lâu?' })
    assert.match(invitePreview.data.text, /Cài đặt → Thành viên → Mời thành viên/)
    assert.match(invitePreview.data.text, /48 giờ/)
    assert.ok(preview.data.sourceDocuments?.some((doc) => doc.pageContent.includes('6314')))
    assert.ok(preview.data.agentFlowExecutedData.some((step) => step.data?.name === 'retrieverAgentflow' || step.nodeLabel === 'Tìm tài liệu'))
    const before = count.runtime
    const missing = await api('POST', `/agent-builder/drafts/${built.buildResult.flowId}/preview`, { question: 'thiên văn sao hỏa' })
    assert.match(missing.data.text, /chưa tìm thấy/)
    assert.equal(count.runtime, before, 'No-evidence branch must not call the LLM')
    const source = preview.data.sourceDocuments[0].metadata.source.replace('/api/v1', '')
    assert.match((await api('GET', source)).data, /6314/)
    const anonymous = await fetch(base + source)
    assert.ok([401, 403].includes(anonymous.status))
    const vector = await upload('semantic-guide.md', md, 'vector')
    const semantic = await api('POST', `/agent-builder/drafts/${vector.buildResult.flowId}/preview`, { question: 'mật khẩu' })
    assert.match(semantic.data.text, /6314/)
    assert.equal(semantic.data.sourceDocuments[0].metadata.retrievalMode, 'vector')
    assert.ok(count.embeddings >= 2, 'Ingest and query must both call the actual local embedding HTTP fixture')
    await upload('deskflow.pdf', pdf())
    await upload('deskflow.docx', docx())
    const creative = await api('POST', '/agent-builder/sessions', { initialGoal: 'Tạo Agent viết kịch bản rồi chia cảnh và tạo prompt từ ý tưởng đầu vào.' })
    assert.equal(creative.data.buildResult, undefined, 'Initial goal without "xong" must not auto-build prematurely')
    assert.match(creative.data.messages[1]?.content || '', /Hướng dẫn sử dụng[\s\S]*xong/)
    const creativeBuilt = await confirmBuild(creative.data.session.id, creative.data.currentSpecRevision.revisionNo)
    const creativeResult = await api('POST', `/agent-builder/drafts/${creativeBuilt.buildResult.flowId}/preview`, { question: 'Một câu chuyện về khu rừng.' })
    assert.equal(creativeResult.data.text, 'PROMPT_READY')
    assert.equal(creativeResult.data.agentFlowExecutedData.filter((step) => step.data?.name === 'llmAgentflow').length, 3)
    const external = await api('POST', '/agent-builder/sessions', { initialGoal: 'Tạo Agent viết kịch bản rồi tạo video bằng Veo.' })
    assert.equal(external.data.readiness.buildReady, false)
    assert.equal(external.data.buildResult, undefined)
    assert.ok(JSON.parse(external.data.currentSpecRevision.spec).workflow.steps.some((step) => step.type === 'external'))
    console.log('PASS: upload/chunk/real V2 graph branches/source auth/vector HTTP/PDF/DOCX using own test backend.')
    if (process.env.BUILDER_SKIP_BROWSER !== 'true') {
        // Use a real isolated Vite proxy: browser request interception omits multipart
        // file bytes on Chromium and cannot verify an actual file upload.
        const uiProbe = net.createServer(); await new Promise((resolve) => uiProbe.listen(0, '127.0.0.1', resolve))
        const uiPort = uiProbe.address().port; await new Promise((resolve) => uiProbe.close(resolve))
        process.env.FLOWISE_SERVER_PORT = String(port); process.env.BUILDER_DEV_NO_OPEN = 'true'
        const { createServer } = await import(pathToFileURL(path.join(root, 'packages/ui/node_modules/vite/dist/node/index.js')).href)
        uiServer = await createServer({ root: path.join(root, 'packages/ui'), configFile: path.join(root, 'packages/ui/vite.config.js'), cacheDir: path.join(runtime, 'vite-cache'), server: { host: '127.0.0.1', port: uiPort, strictPort: true, open: false } })
        await uiServer.listen()
        const uiBase = `http://127.0.0.1:${uiPort}`
        const version = fs.readdirSync(path.join(root, 'node_modules/.pnpm')).find((name) => /^playwright@\d/.test(name))
        const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/.pnpm', version, 'node_modules/playwright/index.mjs')).href)
        browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(30000)
        const errors = []; page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(uiBase + '/signin', { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(password)
        await page.getByRole('button', { name: 'Login', exact: true }).click()
        await page.waitForURL((url) => !url.pathname.includes('signin'))
        await page.goto(uiBase + '/agent-builder', { waitUntil: 'domcontentloaded' })
        const input = page.getByPlaceholder('Mô tả trợ lý', { exact: false })
        await input.fill('Tạo trợ lý hướng dẫn DeskFlow dựa trên tài liệu, thiếu bằng chứng thì hỏi rõ.')
        await page.locator('input[name=documents]').setInputFiles({ name: 'deskflow-guide.md', mimeType: 'text/markdown', buffer: md })
        const uploaded = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/documents'))
        await page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click()
        const uploadResponse = await uploaded
        assert.equal(uploadResponse.ok(), true, `Browser upload ${uploadResponse.status()}: ${(await uploadResponse.text()).slice(0, 1500)}`)
        await page.getByRole('tab', { name: 'Luồng thực hiện', exact: true }).click()
        await page.getByText('Kế hoạch: 4 bước xử lý · 4 kết nối', { exact: true }).waitFor()
        const confirmResPromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/messages'))
        await page.getByRole('button', { name: 'Xong — Tạo Agent', exact: true }).click()
        const confirmedJson = await (await confirmResPromise).json()
        assert.equal(confirmedJson.buildResult?.success, true)
        await page.getByRole('tab', { name: 'Chat Thử Nghiệm', exact: true }).click()
        const question = page.getByPlaceholder('Nhập câu hỏi để thử nghiệm với Agent...')
        await question.fill('Làm sao đổi mật khẩu?'); await question.press('Enter')
        await page.getByText(/Mã xác nhận demo là 6314/).waitFor()
        await page.getByText(/Nguồn trích dẫn \(/).click()
        await page.getByRole('link', { name: 'Mở nguồn tham khảo' }).first().waitFor()
        const oldFlowId = confirmedJson.buildResult.flowId
        const editedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/messages'))
        await input.fill('Bổ sung bước chuẩn hóa câu hỏi trước khi tìm tài liệu, giữ nguyên nguồn.')
        await input.press('Enter')
        const edited = await (await editedResponse).json()
        assert.equal(edited.buildResult, undefined)
        const editedConfirmPromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/messages'))
        await input.fill('xong')
        await input.press('Enter')
        const editedConfirmed = await (await editedConfirmPromise).json()
        assert.equal(editedConfirmed.buildResult?.success, true)
        assert.notEqual(editedConfirmed.buildResult.flowId, oldFlowId)
        await question.fill('Làm sao đổi mật khẩu?'); await question.press('Enter')
        await page.getByText(/Mã xác nhận demo là 6314/).waitFor()
        const url = page.url(); await page.reload({ waitUntil: 'domcontentloaded' })
        assert.equal(page.url(), url)
        await page.getByRole('tab', { name: 'Luồng thực hiện', exact: true }).click()
        await page.getByText('Kế hoạch: 5 bước xử lý · 5 kết nối', { exact: true }).waitFor()
        assert.deepEqual(errors, [])
        await page.screenshot({ path: path.join(local, 'document-workflow.png'), fullPage: true })
        console.log('PASS: browser attaches file, auto-builds, previews cited answer and reloads the same plan.')
    }
    fs.writeFileSync(path.join(local, 'integration-result.json'), JSON.stringify({ passed: true, runName, count, checks: ['upload markdown', 'RAG true/false branches', 'no evidence avoids model call', 'authenticated source link', 'vector ingest and query', 'PDF parse', 'DOCX parse', 'distinct workflow with 3 LLM nodes and upstream outputs', 'unsupported external step blocks build', ...(browser ? ['browser upload/build/preview/sources/edit/refresh'] : [])] }, null, 2))
} catch (error) {
    console.error(error.stack || error.message)
    const page = browser?.contexts()[0]?.pages()[0]
    if (page) { await page.screenshot({ path: path.join(local, 'browser-failure.png'), fullPage: true }); console.error((await page.locator('body').innerText()).slice(-900)) }
    process.exitCode = 1
} finally {
    if (browser) await browser.close()
    if (uiServer) await uiServer.close()
    backend.kill()
    if (backend.exitCode === null) await Promise.race([new Promise((resolve) => backend.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5000))])
    await new Promise((resolve) => fixture.close(resolve))
    console.log('Closed owned test backend, fixture and browser. User processes were not changed.')
}
