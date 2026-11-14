#!/usr/bin/env node
// Local context/handoff helpers. No dependencies, network, LLM or MCP calls.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'

export const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
const STATE = 'AI-Agent/state/project.json'
const LOCAL = 'AI-Agent/.local'
const digest = (value) => createHash('sha256').update(value).digest('hex')

export function inside(root, relative) {
    if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /^[A-Za-z]:|^[/\\]/.test(relative)) {
        throw new Error('Expected a repository-relative path')
    }
    const target = path.resolve(root, relative)
    const rel = path.relative(path.resolve(root), target)
    if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Path escapes repository')
    return target
}

function assertRealInside(root, target) {
    const rel = path.relative(fs.realpathSync(root), fs.realpathSync(target))
    if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Real path escapes repository')
}

export function readSafe(root, relative, maxBytes = 131072) {
    const target = inside(root, relative)
    assertRealInside(root, target)
    const stat = fs.statSync(target)
    if (!stat.isFile() || stat.size > maxBytes) throw new Error(`Not a bounded text file: ${relative}`)
    return fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, '')
}

export function redact(text) {
    return text
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_KEY]')
        .replace(
            /((?:["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,
            '$1"[REDACTED]"'
        )
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
}

export function bounded(text, limit) {
    if (!Number.isInteger(limit) || limit < 32) throw new Error('Invalid character budget')
    if (text.length <= limit) return text
    const marker = '\n[TRUNCATED: open the relevant section explicitly]\n'
    if (marker.length >= limit) return marker.slice(0, limit)
    return text.slice(0, limit - marker.length) + marker
}

function git(root, args) {
    const result = spawnSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 2 * 1024 * 1024
    })
    return result.status === 0 && !result.error ? result.stdout.trimEnd() : null
}

export function snapshot(root) {
    const head = git(root, ['rev-parse', 'HEAD'])
    const branch = git(root, ['branch', '--show-current'])
    const scopes = ['packages', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.nvmrc', 'turbo.json']
    const changed = git(root, ['diff', '--name-only', '-z', 'HEAD', '--', ...scopes])
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...scopes])
    let sourceFingerprint = null
    if (changed !== null && untracked !== null) {
        const files = [...new Set((changed + '\0' + untracked).split('\0').filter(Boolean))].sort()
        const hash = createHash('sha256')
        for (const file of files) {
            hash.update(file + '\0')
            try {
                const target = inside(root, file)
                assertRealInside(root, target)
                const stat = fs.statSync(target)
                if (stat.isFile() && stat.size <= 10 * 1024 * 1024) hash.update(fs.readFileSync(target))
                else hash.update(`metadata:${stat.size}:${stat.mtimeMs}`)
            } catch {
                hash.update('[missing-or-unreadable]')
            }
        }
        sourceFingerprint = hash.digest('hex')
    }
    return { head, branch, sourceFingerprint }
}

function loadConfig(root) {
    const config = JSON.parse(readSafe(root, 'AI-Agent/harness/config.json'))
    if (
        config.schemaVersion !== 1 ||
        !Number.isInteger(config.maxPackChars) ||
        config.maxPackChars < 512 ||
        config.maxPackChars > 24000 ||
        !Number.isInteger(config.maxSectionChars) ||
        config.maxSectionChars < 256 ||
        config.maxSectionChars > config.maxPackChars ||
        !Number.isInteger(config.maxSourceBytes) ||
        config.maxSourceBytes < 1 ||
        config.maxSourceBytes > 1048576 ||
        !Number.isInteger(config.maxLogBytes) ||
        config.maxLogBytes < 1 ||
        config.maxLogBytes > 10485760 ||
        !Number.isInteger(config.maxLogLines) ||
        config.maxLogLines < 1 ||
        config.maxLogLines > 200 ||
        !Array.isArray(config.baseFiles) ||
        !Array.isArray(config.allowedContextFiles) ||
        !config.allowedContextFiles.includes(config.defaultTask)
    ) {
        throw new Error('Invalid harness config or budgets')
    }
    return config
}

function staleWarnings(state, live) {
    const warnings = []
    if (!live.head) warnings.push('Git snapshot unavailable; verify workspace manually.')
    if (live.head && live.head !== (state.snapshot?.head ?? state.baselineGitHead))
        warnings.push('Git HEAD differs from checkpoint/baseline.')
    if (state.snapshot?.sourceFingerprint && live.sourceFingerprint !== state.snapshot.sourceFingerprint)
        warnings.push('Product source/dependency changes differ from checkpoint.')
    if (!state.snapshot) warnings.push('No checkpoint source fingerprint yet; runtime knowledge remains unverified.')
    return warnings
}

export function makePack(root, config, task, extras = [], live = snapshot(root)) {
    const paths = [...new Set([...config.baseFiles, task, ...extras])]
    if (paths.length > 6) throw new Error('Too many context sources; select at most six')
    const sections = paths.map((relative) => {
        if (!config.allowedContextFiles.includes(relative)) throw new Error(`Context file is not allowlisted: ${relative}`)
        const source = readSafe(root, relative, config.maxSourceBytes)
        return { relative, hash: digest(source), content: bounded(redact(source), config.maxSectionChars) }
    })
    const state = JSON.parse(readSafe(root, STATE))
    const warnings = staleWarnings(state, live)
    const header = `# Selected project context\nState revision: ${state.revision}\nLive Git: ${live.head ?? 'unknown'}; branch: ${
        live.branch ?? 'unknown'
    }\n${warnings
        .map((w) => `WARNING: ${w}\n`)
        .join('')}Root instructions load separately. Referenced plans are design, not implemented behavior.\n\n`
    const body = sections.map((s) => `## ${s.relative}\nSource SHA256: ${s.hash}\n${s.content}\n`).join('\n')
    return bounded(header + body, config.maxPackChars)
}

function localDir(root) {
    const dir = inside(root, LOCAL)
    fs.mkdirSync(dir, { recursive: true })
    assertRealInside(root, dir)
    return dir
}

function writeLocal(root, name, content, append = false) {
    const dir = localDir(root)
    if (!/^[a-z0-9.-]+$/i.test(name)) throw new Error('Invalid local output name')
    const target = path.join(dir, name)
    if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Output cannot be a symlink')
        assertRealInside(root, target)
    }
    if (append) fs.appendFileSync(target, content, 'utf8')
    else fs.writeFileSync(target, content, 'utf8')
}

export function validateCheckpoint(payload) {
    const fields = [
        'currentTask',
        'status',
        'productStage',
        'summary',
        'decisions',
        'changedFiles',
        'checks',
        'blockers',
        'nextActions',
        'nextTask'
    ]
    if (!payload || Array.isArray(payload) || typeof payload !== 'object' || Object.keys(payload).some((k) => !fields.includes(k)))
        throw new Error('Unexpected checkpoint field')
    for (const key of ['currentTask', 'status', 'productStage', 'summary', 'nextTask']) {
        if (typeof payload[key] !== 'string' || !payload[key].trim() || payload[key].length > (key === 'summary' ? 1000 : 100))
            throw new Error(`Invalid checkpoint ${key}`)
    }
    if (!['not_started', 'in_progress', 'completed', 'needs_input'].includes(payload.status)) throw new Error('Invalid checkpoint status')
    for (const key of ['currentTask', 'nextTask'])
        if (!/^[A-Z][A-Z0-9]*-\d+$/.test(payload[key])) throw new Error(`Invalid task ID: ${key}`)
    for (const key of ['decisions', 'changedFiles', 'checks', 'blockers', 'nextActions']) {
        if (
            !Array.isArray(payload[key]) ||
            payload[key].length > (key === 'changedFiles' ? 30 : 8) ||
            payload[key].some((v) => typeof v !== 'string' || v.length > 500)
        )
            throw new Error(`Invalid checkpoint ${key}`)
    }
    return Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [key, Array.isArray(value) ? value.map(redact) : redact(value)])
    )
}

export function applyCheckpoint(root, payload, expectedRevision, live = snapshot(root)) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Expected revision must be a positive integer')
    const patch = validateCheckpoint(payload)
    const dir = localDir(root)
    const lock = path.join(dir, 'checkpoint.lock')
    const fd = fs.openSync(lock, 'wx')
    let temp
    try {
        const state = JSON.parse(readSafe(root, STATE))
        if (state.revision !== expectedRevision)
            throw new Error(`Revision conflict: expected ${expectedRevision}, current ${state.revision}`)
        const updated = { ...state, ...patch, revision: state.revision + 1, updatedAt: new Date().toISOString(), snapshot: live }
        const target = inside(root, STATE)
        assertRealInside(root, target)
        temp = `${target}.${randomUUID()}.tmp`
        fs.writeFileSync(temp, JSON.stringify(updated, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
        fs.renameSync(temp, target)
        temp = null
        return updated.revision
    } finally {
        if (temp && fs.existsSync(temp)) fs.unlinkSync(temp)
        fs.closeSync(fd)
        fs.unlinkSync(lock)
    }
}

export function sliceLog(text, maxLines = 80) {
    if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 200) throw new Error('Invalid log line budget')
    const lines = redact(text).split(/\r?\n/)
    const selected = new Set()
    lines.forEach((line, i) => {
        if (/error|fail|exception|fatal|assert|warn/i.test(line))
            for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) selected.add(j)
    })
    const indexes = selected.size
        ? [...selected].sort((a, b) => a - b).slice(0, maxLines)
        : Array.from({ length: Math.min(maxLines, lines.length) }, (_, i) => Math.max(0, lines.length - maxLines) + i)
    const body = indexes.map((i) => `${i + 1}: ${lines[i]}`).join('\n')
    return bounded(`Selected ${indexes.length}/${lines.length} lines; inspect the original if cause is missing.\n${body}`, 12000)
}

export function usageRecord(options) {
    if (
        !['codex', 'claude', 'gemini'].includes(options.agent) ||
        !['baseline', 'harness'].includes(options.variant) ||
        !/^[A-Z][A-Z0-9]*-\d+$/.test(options.task ?? '') ||
        !['yes', 'no'].includes(options.accepted)
    )
        throw new Error('Usage requires agent, task, variant and accepted yes|no')
    const count = (name) => {
        if (options[name] === undefined) return null
        const value = Number(options[name])
        if (!Number.isSafeInteger(value) || value < 0 || String(options[name]).trim() === '') throw new Error(`Invalid usage ${name}`)
        return value
    }
    return {
        at: new Date().toISOString(),
        agent: options.agent,
        task: options.task,
        variant: options.variant,
        accepted: options.accepted === 'yes',
        inputTokens: count('input'),
        outputTokens: count('output'),
        cachedInputTokens: count('cached'),
        toolCalls: count('tools'),
        filesRead: count('files'),
        durationSeconds: count('seconds')
    }
}

function parseArgs(args) {
    const [command = 'help', ...rest] = args
    const options = {}
    for (let i = 0; i < rest.length; i += 2) {
        if (!/^--[a-z-]+$/.test(rest[i]) || rest[i + 1] === undefined || rest[i + 1].startsWith('--'))
            throw new Error('Use --option value pairs')
        const key = rest[i].slice(2)
        if (key in options) throw new Error(`Duplicate option: ${key}`)
        options[key] = rest[i + 1]
    }
    const allowed = {
        help: [],
        doctor: [],
        context: ['task', 'extra'],
        checkpoint: ['file', 'expect-revision'],
        'log-slice': ['file', 'lines'],
        usage: ['agent', 'task', 'variant', 'accepted', 'input', 'output', 'cached', 'tools', 'files', 'seconds']
    }
    if (!(command in allowed) || Object.keys(options).some((key) => !allowed[command].includes(key)))
        throw new Error('Unknown command or option; run help')
    return { command, options }
}

export function main(args = process.argv.slice(2), root = ROOT) {
    const { command, options } = parseArgs(args)
    if (command === 'help') {
        console.log(
            'Local harness: doctor | context [--task path] [--extra allowlisted-path] | checkpoint --file path --expect-revision N | log-slice --file AI-Agent/.local/file --lines 80 | usage --agent codex|claude|gemini --task TASK-001 --variant baseline|harness --accepted yes|no [--input N --output N --cached N --tools N --files N --seconds N]'
        )
        return
    }
    const config = loadConfig(root)
    if (command === 'context') {
        const pack = makePack(root, config, options.task ?? config.defaultTask, options.extra ? [options.extra] : [])
        writeLocal(root, 'context-pack.md', pack)
        console.log(
            `Wrote ${LOCAL}/context-pack.md: ${pack.length} UTF-16 code units; max ${config.maxPackChars}. Not a billable token count.`
        )
    } else if (command === 'checkpoint') {
        const payload = JSON.parse(readSafe(root, options.file, config.maxSourceBytes))
        console.log(
            `Checkpoint revision ${applyCheckpoint(
                root,
                payload,
                Number(options['expect-revision'])
            )}; shared state updated. Review the Git diff before sharing.`
        )
    } else if (command === 'log-slice') {
        if (typeof options.file !== 'string' || !options.file.replaceAll('\\', '/').startsWith(`${LOCAL}/`))
            throw new Error('Log input must be under AI-Agent/.local/')
        const target = inside(root, options.file)
        assertRealInside(path.join(root, LOCAL), target)
        const text = readSafe(root, options.file, config.maxLogBytes)
        const output = sliceLog(text, options.lines === undefined ? config.maxLogLines : Number(options.lines))
        writeLocal(root, 'log-slice.txt', output)
        console.log(output)
    } else if (command === 'usage') {
        const record = { ...usageRecord(options), snapshot: snapshot(root) }
        writeLocal(root, 'usage.jsonl', JSON.stringify(record) + '\n', true)
        console.log(
            `Recorded usage; input=${record.inputTokens ?? 'unknown'}, output=${
                record.outputTokens ?? 'unknown'
            }. No savings claim computed.`
        )
    } else if (command === 'doctor') {
        const state = JSON.parse(readSafe(root, STATE))
        if (state.schemaVersion !== 1 || !Number.isInteger(state.revision) || state.revision < 1) throw new Error('Invalid shared state')
        for (const file of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', ...config.allowedContextFiles])
            readSafe(root, file, config.maxSourceBytes)
        const live = snapshot(root)
        const pack = makePack(root, config, config.defaultTask, [], live)
        const major = Number(process.versions.node.split('.')[0])
        const ignore = git(root, ['check-ignore', `${LOCAL}/probe.txt`])
        if (!ignore) throw new Error('Local harness outputs must be Git ignored')
        console.log(
            JSON.stringify(
                {
                    harness: 'pass',
                    node: process.version,
                    flowiseNodeEngineSatisfied: major === 24,
                    flowiseRuntimeProbe: 'not run by doctor',
                    reportedProductStage: state.productStage,
                    codegraphIndexPresent: fs.existsSync(path.join(root, '.codegraph')),
                    mcpConnectivity: 'not probed by doctor',
                    stateRevision: state.revision,
                    packChars: pack.length,
                    maxPackChars: config.maxPackChars,
                    localOutputsIgnored: true,
                    live,
                    warnings: staleWarnings(state, live),
                    tokenSavings: 'not measured'
                },
                null,
                2
            )
        )
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main()
    } catch (error) {
        console.error(`Harness: ${error.message}`)
        process.exitCode = 1
    }
}
