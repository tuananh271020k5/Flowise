// Test-only OpenAI-compatible protocol fixture. Never used as a product fallback.
import http from 'node:http'
let calls = 0
http.createServer(async (req, res) => {
    if(req.url === '/count') {res.end(JSON.stringify({calls})); return}
    let raw = ''; for await(const chunk of req) raw += chunk
    let input; try {input = JSON.parse(raw)} catch {res.writeHead(400).end(); return}
    calls++
    const messages = input.messages || []
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n')
    let text
    if(system.includes('Bạn thu thập yêu cầu')) {
        let state = {}; try {state = JSON.parse(messages.at(-1).content)} catch {}
        const user = state.message || ''
        const patch = {}
        if(user.includes('Tôi cần bot')) patch.goal = user
        const name = user.match(/(?:Đặt tên là|Đổi tên thành)\s+(.+)/i)
        if(name) patch.name = name[1].trim()
        const instructions = user.match(/Hướng dẫn:\s*(.+)/i)
        if(instructions) {
            patch.instructions = instructions[1]
            patch.evaluationExamples = [{input:'Xin chào', assertions:['B028-OK']}]
        }
        text = JSON.stringify(patch)
    } else {
        text = system.includes('B028-NEW') ? 'B028-NEW' : 'B028-OK'
    }
    res.writeHead(200, {'Content-Type':'application/json'})
    res.end(JSON.stringify({id:'chatcmpl-b028',object:'chat.completion',created:Math.floor(Date.now()/1000),model:input.model,choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:25,completion_tokens:15,total_tokens:40}}))
}).listen(3038,'127.0.0.1',()=>console.log('Test protocol fixture on 127.0.0.1:3038'))
