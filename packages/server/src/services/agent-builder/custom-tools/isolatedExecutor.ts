import { spawn } from 'child_process'

// Only JSON crosses the process boundary. No host constructors/functions enter the VM.
const WORKER = `
const vm = require('node:vm');
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; if(raw.length > 100000) process.exit(2) });
process.stdin.on('end', () => {
  try {
    const {code, params, timeout} = JSON.parse(raw);
    const context = vm.createContext(Object.create(null), {codeGeneration:{strings:false,wasm:false},microtaskMode:'afterEvaluate'});
    const init = 'const input = JSON.parse(' + JSON.stringify(JSON.stringify(params)) + '); for (const key of Object.keys(input)) Object.defineProperty(globalThis,key,{value:input[key]});';
    new vm.Script(init).runInContext(context,{timeout});
    const result = new vm.Script('JSON.stringify((function(){' + code + '\\n})())').runInContext(context,{timeout});
    if(typeof result === 'string' && result.length > 1000000) throw new Error('Output exceeds limit');
    process.stdout.write(JSON.stringify({success:true,output:result === undefined ? null : JSON.parse(result)}));
  } catch(error) { process.stdout.write(JSON.stringify({success:false,error:String(error.message).slice(0,300)})); }
});
`

export function executeIsolated(
    code: string,
    params: Record<string, unknown>,
    timeoutMs: number
): Promise<{ success: boolean; output?: unknown; error?: string }> {
    const timeout = Math.max(1, Math.min(Number.isFinite(timeoutMs) ? timeoutMs : 3000, 3000))
    const reserved =
        /^(?:__proto__|prototype|constructor|globalThis|process|require|module|exports|Object|String|Number|Array|Math|JSON|Date|input)$/
    if (Object.keys(params).some((key) => !/^[a-zA-Z_$][\w$]*$/.test(key) || reserved.test(key)))
        return Promise.resolve({ success: false, error: 'Tên tham số không được phép' })
    const payload = JSON.stringify({ code, params, timeout })
    if (payload.length > 100000 || code.length > 32000) return Promise.resolve({ success: false, error: 'Mã nguồn hoặc input quá lớn' })
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['--permission', '--disable-proto=throw', '--max-old-space-size=48', '-e', WORKER], {
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {}
        })
        let output = '',
            done = false
        const finish = (result: { success: boolean; output?: unknown; error?: string }) => {
            if (done) return
            done = true
            clearTimeout(timer)
            child.kill()
            resolve(result)
        }
        const timer = setTimeout(() => finish({ success: false, error: 'Sandbox execution timed out' }), timeout + 1000)
        child.stdout.on('data', (data) => {
            output += data.toString()
            if (output.length > 1000000) finish({ success: false, error: 'Output exceeds limit' })
        })
        child.stderr.resume()
        child.on('error', () => finish({ success: false, error: 'Không khởi động được tiến trình sandbox' }))
        child.on('close', () => {
            try {
                finish(JSON.parse(output))
            } catch {
                finish({ success: false, error: 'Sandbox process stopped' })
            }
        })
        child.stdin.on('error', () => {})
        child.stdin.end(payload)
    })
}
