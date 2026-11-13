import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inside, readSafe, redact, makePack, applyCheckpoint, validateCheckpoint, usageRecord, sliceLog, main } from './harness.mjs'

const live = { head: 'abc123', branch: 'test', sourceFingerprint: 'sample' }
const statePath = 'AI-Agent/state/project.json'
const taskPath = 'AI-Agent/tasks/TASK-001.md'
const mapPath = 'AI-Agent/context/PROJECT_MAP.md'
const config = {
    schemaVersion: 1,
    maxPackChars: 1800,
    maxSectionChars: 500,
    maxSourceBytes: 4096,
    maxLogBytes: 8192,
    maxLogLines: 20,
    baseFiles: [statePath, mapPath],
    defaultTask: taskPath,
    allowedContextFiles: [statePath, mapPath, taskPath]
}
const patch = {
    currentTask: 'TASK-001',
    nextTask: 'B-002',
    status: 'in_progress',
    productStage: 'baseline',
    summary: 'Runtime still unverified',
    decisions: [],
    changedFiles: [],
    checks: [],
    blockers: [],
    nextActions: ['Verify local runtime']
}

function sandbox(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flowise-harness-test-'))
    t.after(() => {
        const absolute = path.resolve(root)
        if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('flowise-harness-test-'))
            throw new Error('Unsafe cleanup target')
        fs.rmSync(absolute, { recursive: true, force: true })
    })
    const write = (relative, content) => {
        const target = path.join(root, relative)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content))
    }
    write(statePath, {
        schemaVersion: 1,
        revision: 1,
        baselineGitHead: live.head,
        authorization: 'planning-only',
        summary: 'Planning completed',
        snapshot: live
    })
    write(mapPath, '# Minimal map\nRuntime not verified\n')
    write(taskPath, '# TASK-001\nVerify environment\n')
    write('AI-Agent/harness/config.json', config)
    return { root, write }
}

test('context includes state/map/task with source hashes within a hard character cap', (t) => {
    const { root, write } = sandbox(t)
    write(taskPath, 'X'.repeat(3000))
    const pack = makePack(root, config, taskPath, [], live)
    assert.ok(pack.length <= config.maxPackChars)
    assert.match(pack, /State revision: 1/)
    assert.match(pack, /AI-Agent\/state\/project.json/)
    assert.match(pack, /AI-Agent\/context\/PROJECT_MAP.md/)
    assert.match(pack, /AI-Agent\/tasks\/TASK-001.md/)
    assert.match(pack, /Source SHA256: [a-f0-9]{64}/)
    assert.match(pack, /TRUNCATED/)
})

test('non-allowlisted documents and path traversal are rejected without reading them', (t) => {
    const { root, write } = sandbox(t)
    write('.env', 'API_KEY=must-not-read')
    assert.throws(() => makePack(root, config, '.env', [], live), /allowlisted/)
    for (const unsafe of ['../outside', 'C:\\private\\secret', '/private/secret', '\\\\server\\share'])
        assert.throws(() => inside(root, unsafe), /path|Path/)
})

test('realpath checks reject a symlink or junction escaping the repo', (t) => {
    const { root } = sandbox(t)
    const { root: outside, write } = sandbox(t)
    write('private.md', 'Must not be read')
    const link = path.join(root, 'AI-Agent/context/escape')
    try {
        fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
        if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
            t.skip('Host disallows symlink/junction creation')
            return
        }
        throw error
    }
    assert.throws(() => readSafe(root, 'AI-Agent/context/escape/private.md'), /escapes/)
})

test('oversized context input is refused before being loaded', (t) => {
    const { root, write } = sandbox(t)
    write(taskPath, 'X'.repeat(config.maxSourceBytes + 1))
    assert.throws(() => makePack(root, config, taskPath, [], live), /bounded text file/)
})

test('changed HEAD or dirty product fingerprint warns that saved context may be stale', (t) => {
    const { root } = sandbox(t)
    const pack = makePack(root, config, taskPath, [], { ...live, head: 'different', sourceFingerprint: 'changed' })
    assert.match(pack, /Git HEAD differs/)
    assert.match(pack, /source\/dependency changes differ/)
})

test('common bearer, key, password and URL credentials are redacted', () => {
    const output = redact('Bearer a-b.c\napi_key="secret-one"\npassword=secret-two\nsk-123456789012345\nhttps://user:pass@example.test')
    for (const secret of ['a-b.c', 'secret-one', 'secret-two', 'sk-123456789012345', 'user:pass']) assert.ok(!output.includes(secret))
    assert.match(output, /REDACTED/)
})

test('checkpoint updates one canonical state, retains authorization, increments revision', (t) => {
    const { root } = sandbox(t)
    assert.equal(applyCheckpoint(root, patch, 1, live), 2)
    const updated = JSON.parse(readSafe(root, statePath))
    assert.equal(updated.nextTask, 'B-002')
    assert.equal(updated.authorization, 'planning-only')
    assert.deepEqual(updated.snapshot, live)
    assert.ok(!fs.existsSync(path.join(root, 'AI-Agent/.local/checkpoint.lock')))
})

test('stale checkpoint revision cannot overwrite newer progress', (t) => {
    const { root } = sandbox(t)
    applyCheckpoint(root, patch, 1, live)
    const before = readSafe(root, statePath)
    assert.throws(() => applyCheckpoint(root, { ...patch, summary: 'stale writer' }, 1, live), /Revision conflict/)
    assert.equal(readSafe(root, statePath), before)
})

test('existing writer lock prevents a second writer from touching state', (t) => {
    const { root, write } = sandbox(t)
    write('AI-Agent/.local/checkpoint.lock', 'other writer')
    assert.throws(() => applyCheckpoint(root, patch, 1, live), /EEXIST/)
    assert.equal(JSON.parse(readSafe(root, statePath)).revision, 1)
    assert.equal(readSafe(root, 'AI-Agent/.local/checkpoint.lock'), 'other writer')
})

test('checkpoint rejects unknown fields, malformed statuses and oversized notes', () => {
    assert.throws(() => validateCheckpoint({ ...patch, authorization: 'all-access' }), /Unexpected/)
    assert.throws(() => validateCheckpoint({ ...patch, status: 'made-up' }), /status/)
    assert.throws(() => validateCheckpoint({ ...patch, summary: 'x'.repeat(1001) }), /summary/)
    assert.equal(validateCheckpoint({ ...patch, summary: 'Found api_key=private-value in log' }).summary.includes('private-value'), false)
})

test('missing usage remains null and failures stay in the sample', () => {
    const result = usageRecord({ agent: 'claude', task: 'TASK-001', variant: 'harness', accepted: 'no' })
    assert.equal(result.inputTokens, null)
    assert.equal(result.outputTokens, null)
    assert.equal(result.accepted, false)
    assert.throws(
        () => usageRecord({ agent: 'gemini', task: 'TASK-001', variant: 'harness', accepted: 'yes', input: '-1' }),
        /Invalid usage/
    )
})

test('log slice keeps matching diagnostics, redacts secrets and respects the line budget', () => {
    const result = sliceLog(Array.from({ length: 300 }, (_, i) => (i === 150 ? 'ERROR password=private-value' : `line ${i}`)).join('\n'), 5)
    assert.match(result, /ERROR/)
    assert.ok(!result.includes('private-value'))
    assert.ok(result.split('\n').length <= 6)
})

test('log command cannot use a local-looking path to read elsewhere in repo', (t) => {
    const { root, write } = sandbox(t)
    write('AI-Agent/.local/dummy.txt', 'init')
    write('.env', 'Must not be read')
    assert.throws(() => main(['log-slice', '--file', 'AI-Agent/.local/../../.env'], root), /ENOENT|escapes/)
    assert.throws(() => main(['log-slice', '--file', 'AI-Agent/.local/../../../.env'], root), /ENOENT|escapes/)
})

test('context CLI writes only an ignored-location pack, not shared state', (t) => {
    const { root } = sandbox(t)
    const before = readSafe(root, statePath)
    main(['context', '--task', taskPath], root)
    assert.ok(fs.statSync(path.join(root, 'AI-Agent/.local/context-pack.md')).size > 0)
    assert.equal(readSafe(root, statePath), before)
})

test('unknown CLI options and invalid budgets fail instead of silently widening context', (t) => {
    const { root, write } = sandbox(t)
    assert.throws(() => main(['context', '--all', 'yes'], root), /Unknown/)
    write('AI-Agent/harness/config.json', { ...config, maxPackChars: 1000000 })
    assert.throws(() => main(['context'], root), /budgets/)
})
