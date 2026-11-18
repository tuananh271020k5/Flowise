// Tests the actual dialog against route mocks. No login, real key, backend write or new server.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const version=fs.readdirSync(path.join(root,'node_modules/.pnpm')).find(name=>/^playwright@\d/.test(name))
const {chromium}=await import(pathToFileURL(path.join(root,'node_modules/.pnpm',version,'node_modules/playwright/index.mjs')).href)
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})
const page=await browser.newPage({viewport:{width:1200,height:1000}})
page.setDefaultTimeout(20000)
let profile={modelName:'gpt-4o-mini',baseUrl:'https://gateway.example/v1',ready:true,webSearchEnabled:false}
const writes=[];let catalogCalls=0;let failCatalog=false;const errors=[];const consoleErrors=[]
page.on('pageerror',error=>errors.push(error.message))
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
await page.route('**/api/v1/agent-builder/model-profile',async route=>{
 if(route.request().method()==='PUT'){const body=route.request().postDataJSON();writes.push(body);profile={...profile,...body}}
 await route.fulfill({json:profile})
})
await page.route('**/api/v1/agent-builder/models',route=>{
 catalogCalls++
 return route.fulfill(failCatalog?{status:404,json:{message:'Fixture: catalog unavailable'}}:{json:{models:['qwen/company-agent','gpt-5.4','gpt-5.4']}})
})
await page.route('**/__model-picker-smoke',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><div id="root"></div>
<script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module">import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import Dialog from '/src/views/agent-builder/ModelSettingsDialog.jsx';
function Harness(){const [open,setOpen]=React.useState(true);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setOpen(true)},'Mở cấu hình kiểm tra'),React.createElement(Dialog,{open,onClose:()=>setOpen(false),onSaved:(data)=>{window.savedProfile=data}}))}ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));</script>`}))
try{
 await page.goto('http://127.0.0.1:8080/__model-picker-smoke',{waitUntil:'domcontentloaded',timeout:60000})
 const model=page.getByRole('combobox',{name:'Tên model'})
 const load=page.getByRole('button',{name:'Tải model từ provider',exact:true})
 await model.waitFor()
 await load.waitFor({state:'visible'})
 await page.waitForFunction(()=>document.querySelector('input[role="combobox"]')?.value==='gpt-4o-mini')
 assert.equal(catalogCalls,0)
 await model.click();await model.press('ArrowDown')
 await page.getByRole('option',{name:'gpt-5.4',exact:true}).click()
 await page.getByRole('button',{name:'Lưu cấu hình',exact:true}).click()
 await page.waitForFunction(()=>window.savedProfile?.modelName==='gpt-5.4')
 assert.equal(writes[0].modelName,'gpt-5.4');assert.equal(writes[0].apiKey,undefined)
 await page.getByRole('button',{name:'Mở cấu hình kiểm tra'}).click()
 await page.waitForFunction(()=>document.querySelector('input[role="combobox"]')?.value==='gpt-5.4')
 await load.click()
 await page.getByText(/Provider trả 3 model/).waitFor()
 await model.click();await model.press('ArrowDown')
 await page.getByRole('option',{name:'qwen/company-agent',exact:true}).click()
 await page.getByRole('button',{name:'Lưu cấu hình',exact:true}).click()
 await page.waitForFunction(()=>window.savedProfile?.modelName==='qwen/company-agent')
 await page.getByRole('button',{name:'Mở cấu hình kiểm tra'}).click()
 await page.waitForFunction(()=>document.querySelector('input[role="combobox"]')?.value==='qwen/company-agent')
 await page.getByLabel('Base URL (tùy chọn)').fill('https://other.example/v1')
 assert.equal(await load.isDisabled(),true)
 assert.equal(catalogCalls,1)
 await model.fill('my-team/agent-v2')
 await model.press('Tab')
 await page.getByRole('button',{name:'Lưu cấu hình',exact:true}).click()
 await page.waitForFunction(()=>window.savedProfile?.modelName==='my-team/agent-v2')
 await page.getByRole('button',{name:'Mở cấu hình kiểm tra'}).click()
 failCatalog=true;await load.click()
 await page.getByText('Fixture: catalog unavailable').waitFor()
 assert.equal(await model.inputValue(),'my-team/agent-v2')
 await model.click();await model.press('ArrowDown')
 await page.getByRole('option',{name:'gpt-5.4-mini',exact:true}).waitFor()
 await model.press('Escape')
 assert.deepEqual(errors,[])
 fs.mkdirSync('AI-Agent/.local/B-029',{recursive:true})
 await page.screenshot({path:'AI-Agent/.local/B-029/model-picker.png',fullPage:true})
 fs.writeFileSync('AI-Agent/.local/B-029/model-picker-browser.json',JSON.stringify({passed:true,checks:['preset select/save','provider select/save','custom ID/save','saved-provider-only discovery','catalog error preserves custom selection'],catalogCalls,errors},null,2))
 console.log('PASS: real model picker interactions; API fully mocked; no real credential or backend write.')
}catch(error){console.error(error.message);console.error({errors,consoleErrors});console.error((await page.locator('body').innerText()).slice(-1800));process.exitCode=1}
finally{await browser.close()}
