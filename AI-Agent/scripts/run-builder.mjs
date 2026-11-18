import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const portable = path.join(root, 'AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe')
if (Number(process.versions.node.split('.')[0]) !== 24) {
    if (!fs.existsSync(portable)) throw new Error('Cần Node 24. Cài Node 24 theo .nvmrc rồi chạy lại.')
    const child = spawn(portable, ['--max-old-space-size=4096', fileURLToPath(import.meta.url)], {cwd: root, stdio: 'inherit', windowsHide: true})
    child.on('exit', (code) => process.exit(code || 0))
} else {
    process.chdir(root)
    const require = createRequire(path.join(root, 'packages/server/package.json'))
    const envFile = path.join(root, 'AI-Agent/.local/builder.env')
    if (fs.existsSync(envFile)) require('dotenv').config({path: envFile})
    const runtimeName = process.env.BUILDER_RUNTIME_NAME || 'builder-runtime'
    if (!/^[a-zA-Z0-9_-]+$/.test(runtimeName)) throw new Error('BUILDER_RUNTIME_NAME chỉ nhận tên thư mục đơn giản')
    const runtime = path.join(root, 'AI-Agent/.local', runtimeName)
    for (const name of ['db', 'keys', 'logs', 'storage']) fs.mkdirSync(path.join(runtime, name), {recursive: true})
    const env = {...process.env, NODE_OPTIONS: '--max-old-space-size=4096', HOST: '127.0.0.1', PORT: process.env.BUILDER_PORT || '3037',
        DATABASE_TYPE: 'sqlite', DATABASE_PATH: path.join(runtime, 'db'), SECRETKEY_PATH: path.join(runtime, 'keys'),
        LOG_PATH: path.join(runtime, 'logs'), BLOB_STORAGE_PATH: path.join(runtime, 'storage')}
    const children = []
    const launcherLog = path.join(runtime, 'launcher.log')
    const launch = (args, cwd = root, overrides = {}) => {
        const child = spawn(process.execPath, args, {cwd, stdio: ['inherit', 'pipe', 'pipe'], env: {...env, ...overrides}, windowsHide: true})
        children.push(child)
        child.stdout.on('data', (chunk) => {process.stdout.write(chunk); fs.appendFileSync(launcherLog, chunk)})
        child.stderr.on('data', (chunk) => {process.stderr.write(chunk); fs.appendFileSync(launcherLog, chunk)})
        child.on('error', (error) => {console.error(error.message); stop(1)})
        return child
    }
    const stop = (code = 0) => { for (const child of children) child.kill(); process.exit(code) }
    process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop())
    try {
        const net = await import('node:net')
        await new Promise((resolve, reject) => {
            const probe = net.createServer().once('error', reject).listen(Number(env.PORT), env.HOST, () => probe.close(resolve))
        })
    } catch { throw new Error(`Cổng ${env.PORT} đang bận. Dừng instance cũ hoặc đổi BUILDER_PORT.`) }
    const server = launch(['packages/server/bin/run', 'start'])
    server.on('exit', (code) => stop(code ?? 1))
    let ready = false
    for (let i = 0; i < 120; i++) {
        try { const response = await fetch(`http://127.0.0.1:${env.PORT}/api/v1/ping`); if(response.ok) {ready = true; break} } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (!ready) { console.error('Backend chưa sẵn sàng; kiểm tra log ở AI-Agent/.local.'); stop(1) }
    const ui = launch(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', process.env.BUILDER_UI_PORT || '8080', '--strictPort'], path.join(root, 'packages/ui'), {
        BUILDER_DEV_NO_OPEN: 'true', FLOWISE_SERVER_PORT: env.PORT
    })
    ui.on('exit', (code) => stop(code ?? 1))
    console.log(`\nMở http://127.0.0.1:${process.env.BUILDER_UI_PORT || '8080'}/agent-builder — Ctrl+C để dừng.\n`)
}
