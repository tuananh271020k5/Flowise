import fs from 'node:fs'
if(process.env.BUILDER_SMOKE_TEST!=='true')throw Error('Run only against B028-smoke; see AI-Agent/tests/builder/README.md')
const state=JSON.parse(fs.readFileSync('AI-Agent/.local/B-028/api-state.json','utf8'))
const base='http://127.0.0.1:3037/api/v1'
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:state.email,password:state.password})})
const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')
const headers={'Content-Type':'application/json',Cookie:cookie,'x-request-from':'internal'}
const created=await fetch(base+'/agent-builder/sessions',{method:'POST',headers,body:JSON.stringify({initialGoal:'Tôi cần bot trả lời chào khách.\nĐặt tên là Bot chào khách\nHướng dẫn: Chỉ trả lời B028-OK.'})})
const data=await created.json()
if(!created.ok||!data.buildResult?.success)throw Error('Single-message automatic build failed: '+JSON.stringify(data).slice(0,600))
const usage=await(await fetch(base+'/agent-builder/sessions/'+data.session.id+'/usage',{headers})).json()
if(usage.totalPromptTokens!==25||usage.totalCompletionTokens!==15)throw Error('Usage does not match provider response')
const preview=await(await fetch(base+'/agent-builder/drafts/'+data.buildResult.flowId+'/preview',{method:'POST',headers,body:JSON.stringify({question:'Xin chào'})})).json()
if(preview.text!=='B028-OK'||!preview.executionId)throw Error('Single-message runtime preview failed')
const messages=preview.agentFlowExecutedData?.find(node=>node.nodeId==='agentAgentflow_0')?.data?.input?.messages || []
if(messages.filter(message=>message.role==='user').length!==1)throw Error('Runtime duplicated the current question')
console.log('PASS: one-message auto-build, runtime execution, provider usage 25/15')
fs.writeFileSync('AI-Agent/.local/B-028/first-message-result.json',JSON.stringify({passed:true,flowId:data.buildResult.flowId,usage:{input:usage.totalPromptTokens,output:usage.totalCompletionTokens}},null,2))
