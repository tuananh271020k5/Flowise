// Bounded local protocol test: one fixture request, no real API key or persistent server.
import http from 'node:http'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs'
const require=createRequire(new URL('../../../packages/components/package.json',import.meta.url))
const {ChatOpenAI}=require('@langchain/openai')
const {extractWebCitations}=require('./dist/nodes/agentflow/webCitations.js')
let calls=0
const server=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk
 const body=JSON.parse(raw)
 assert.equal(req.url,'/v1/responses')
 assert.equal(body.model,'gpt-4o-mini')
 assert.equal(body.tools[0].type,'web_search')
 calls++
 res.writeHead(200,{'Content-Type':'application/json'})
 res.end(JSON.stringify({id:'resp_fixture',object:'response',created_at:1,status:'completed',model:'gpt-4o-mini',
  output:[{id:'ws_fixture',type:'web_search_call',status:'completed',action:{type:'search',query:'current product information'}},
   {id:'msg_fixture',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Verified fixture answer ([Source](https://example.org/product)).',annotations:[{type:'url_citation',start_index:0,end_index:23,title:'Official fixture',url:'https://example.org/product'}]}]}],
  usage:{input_tokens:10,output_tokens:10,total_tokens:20,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}))
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
try{
 const model=new ChatOpenAI({apiKey:'test-only-fixture',model:'gpt-4o-mini',streaming:false,maxRetries:0,timeout:10000,configuration:{baseURL:`http://127.0.0.1:${server.address().port}/v1`}})
 const result=await model.bindTools([{type:'web_search'}]).invoke([{role:'system',content:'Use sources for current information.'},{role:'user',content:'Check a current product.'}])
 assert.equal(calls,1)
 fs.mkdirSync('AI-Agent/.local/B-029',{recursive:true})
 fs.writeFileSync('AI-Agent/.local/B-029/responses-fixture-debug.json',JSON.stringify({content:result.content,metadata:result.response_metadata},null,2))
 const citations=extractWebCitations(result.response_metadata,result.content)
 assert.equal(citations[0]?.source,'https://example.org/product')
 fs.mkdirSync('AI-Agent/.local/B-029',{recursive:true})
 fs.writeFileSync('AI-Agent/.local/B-029/responses-result.json',JSON.stringify({passed:true,calls,citations,metadataKeys:Object.keys(result.response_metadata)},null,2))
 console.log('PASS: installed LangChain routes web_search to Responses; real provider annotations become source citations; fixture closed.')
}finally{await new Promise(resolve=>server.close(resolve))}
