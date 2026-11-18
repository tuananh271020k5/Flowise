import fs from 'node:fs'
import {randomBytes} from 'node:crypto'
if(process.env.BUILDER_SMOKE_TEST!=='true')throw Error('Run only against B028-smoke; see AI-Agent/tests/builder/README.md')
fs.mkdirSync('AI-Agent/.local/B-028',{recursive:true})
const base='http://127.0.0.1:3037/api/v1'
const file='AI-Agent/.local/B-028/api-state.json'
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{email:`b028-${randomBytes(4).toString('hex')}@example.invalid`,password:randomBytes(20).toString('base64url')}
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2))
if(!state.registered)state.password='Aa1!'+randomBytes(16).toString('hex')
save()
let cookie=''
async function api(method,path,body,anonymous=false){
 const res=await fetch(base+path,{method,signal:AbortSignal.timeout(60000),headers:{...(body?{'Content-Type':'application/json'}:{}),...(!anonymous&&cookie?{Cookie:cookie,'x-request-from':'internal'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const raw=await res.text(); let data;try{data=JSON.parse(raw)}catch{data=raw}
 if(res.status>=400)throw new Error(`${method} ${path} ${res.status} ${JSON.stringify(data).slice(0,500)}`)
 return {res,data}
}
if(!state.registered){const {res}=await api('POST','/account/register',{user:{name:'B028 smoke',email:state.email,credential:state.password}});if(res.status!==201)throw Error('Register failed');state.registered=true;save()}
const login=await api('POST','/auth/login',{email:state.email,password:state.password});cookie=login.res.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')
await api('PUT','/agent-builder/model-profile',{modelName:'gpt-4o-mini',baseUrl:'http://127.0.0.1:3038/v1',apiKey:'test-only-protocol-fixture'})
const created=await api('POST','/agent-builder/sessions',{initialGoal:'Tôi cần bot hỗ trợ khách hàng về giờ mở cửa và đổi trả.'})
state.sessionId=created.data.session.id;delete state.flowId;save()
console.log('created',created.data.readiness)
let revision=created.data.currentSpecRevision.revisionNo
for(const content of ['Đặt tên là Hỗ trợ cửa hàng','Hướng dẫn: Chỉ trả lời B028-OK, lịch sự và ngắn gọn.']){
 const result=await api('POST',`/agent-builder/sessions/${state.sessionId}/messages`,{content,clientMessageId:randomBytes(8).toString('hex'),expectedRevision:revision})
 revision=result.data.currentSpecRevision.revisionNo
 console.log('message',revision,result.data.readiness,result.data.buildResult)
 if(result.data.buildResult?.success)state.flowId=result.data.buildResult.flowId
}
save()
if(!state.flowId)throw Error('Auto-build did not create a flow')
const reply=await api('POST',`/agent-builder/drafts/${state.flowId}/preview`,{question:'Xin chào'})
console.log('preview',JSON.stringify(reply.data).slice(0,800))
const suite=await api('POST',`/agent-builder/sessions/${state.sessionId}/test-suite`,{maxExamples:1})
console.log('suite',suite.data.passedCount,suite.data.failedCount)
