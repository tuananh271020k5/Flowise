import fs from 'node:fs'
if(process.env.BUILDER_SMOKE_TEST!=='true')throw Error('Run only against B028-smoke; see AI-Agent/tests/builder/README.md')
import {Client} from '../../../packages/server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import {StreamableHTTPClientTransport} from '../../../packages/server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js'
const state=JSON.parse(fs.readFileSync('AI-Agent/.local/B-028/api-state.json','utf8'))
const base='http://127.0.0.1:3037/api/v1'
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:state.email,password:state.password})})
if(!login.ok)throw Error('Login failed')
const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')
const client=new Client({name:'b028-acceptance',version:'1.0.0'},{capabilities:{}})
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/agent-builder/mcp'),{requestInit:{headers:{Cookie:cookie,'x-request-from':'internal'}}}))
 const catalog=await client.listTools()
 if(catalog.tools.length!==5)throw Error('Unexpected catalog')
 const session=await client.callTool({name:'builder_get_session',arguments:{sessionId:state.sessionId}})
 if(session.isError)throw Error(session.content[0].text)
 const suite=await client.callTool({name:'builder_run_tests',arguments:{sessionId:state.sessionId,maxExamples:1}})
 if(suite.isError)throw Error(suite.content[0].text)
 const result=JSON.parse(suite.content[0].text)
 if(result.passedCount!==1)throw Error('MCP evaluation did not use current runtime draft')
 const invalid=await client.callTool({name:'builder_send_message',arguments:{sessionId:state.sessionId,content:'invalid-without-id'}}).catch(e=>({isError:true}))
 if(!invalid.isError)throw Error('Missing message ID was accepted')
 const external=await fetch(base+'/prediction/'+state.flowId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'Anonymous draft access'})})
 if(![401,403].includes(external.status))throw Error('Private draft exposed: '+external.status)
 const anonymous=await fetch(base+'/agent-builder/model-profile?workspaceId=spoof')
 if(![401,403].includes(anonymous.status))throw Error('Anonymous model profile accepted')
 const summary={passed:true,tools:catalog.tools.map(t=>t.name),mcpEvaluation:result.passedCount,privatePredictionStatus:external.status,anonymousProfileStatus:anonymous.status}
 fs.writeFileSync('AI-Agent/.local/B-028/mcp-result.json',JSON.stringify(summary,null,2))
 console.log(summary)
}finally{await client.close()}
