// Prepare the Builder overlay on an existing Flowise dist. No install or full rebuild.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const read = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', windowsHide: true})
    if (result.status !== 0) throw new Error('Cannot read Git changes')
    return result.stdout.trim().split(/\r?\n/).filter(Boolean)
}
if (!fs.existsSync(path.join(root, 'packages/server/dist/index.js'))) throw new Error('Thiếu baseline dist. Xem AI-Agent/GUI_TEST_GUIDE.md.')
const builderRoot = path.join(root, 'packages/server/src/services/agent-builder')
const builderFiles = fs.readdirSync(builderRoot, {recursive: true}).map((file) => 'packages/server/src/services/agent-builder/' + file.replaceAll('\\', '/'))
const files = [...new Set([...builderFiles,
    'packages/server/src/controllers/agent-builder/index.ts', 'packages/server/src/controllers/predictions/index.ts',
    'packages/server/src/routes/agent-builder/index.ts',
    'packages/server/src/utils/buildChatflow.ts', 'packages/server/src/utils/buildAgentflow.ts',
    'packages/server/src/utils/buildAgentGraph.ts',
    'packages/components/src/utils.ts',
    'packages/components/nodes/agentflow/Agent/Agent.ts', 'packages/components/nodes/agentflow/webCitations.ts',
    'packages/components/nodes/agentflow/Retriever/Retriever.ts',
    'packages/components/nodes/chatmodels/ChatOpenAI/ChatOpenAI.ts',
    'packages/components/nodes/chatmodels/ChatOpenAI/FlowiseChatOpenAI.ts',
    'packages/components/nodes/tools/ExcelOfficeTool/ExcelOfficeTool.ts',
    'packages/components/nodes/tools/WordOfficeTool/WordOfficeTool.ts',
    'packages/components/nodes/tools/ProjectTrackerTool/ProjectTrackerTool.ts',
    'packages/components/nodes/tools/HelpdeskTicketTool/HelpdeskTicketTool.ts',
    'packages/components/nodes/tools/TelegramNotifyTool/TelegramNotifyTool.ts',
    'packages/components/nodes/vectorstores/DocumentStoreVS/DocStoreVector.ts',
    'packages/components/nodes/vectorstores/DocumentStoreVS/builderKnowledge.ts',
    ...read(['diff', '--name-only']), ...read(['diff', '--cached', '--name-only']), ...read(['ls-files', '--others', '--exclude-standard'])])]
const config = ts.readConfigFile(path.join(root, 'packages/server/tsconfig.json'), ts.sys.readFile)
const {options} = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, path.join(root, 'packages/server'))
const componentConfig = ts.readConfigFile(path.join(root,'packages/components/tsconfig.json'),ts.sys.readFile)
const {options:componentOptions} = ts.convertCompilerOptionsFromJson(componentConfig.config.compilerOptions,path.join(root,'packages/components'))
let count = 0
for (const file of files) {
    const isServer = file.startsWith('packages/server/src/')
    const isComponent = ['packages/components/src/utils.ts',
        'packages/components/nodes/agentflow/Agent/Agent.ts','packages/components/nodes/agentflow/webCitations.ts',
        'packages/components/nodes/agentflow/Retriever/Retriever.ts',
        'packages/components/nodes/chatmodels/ChatOpenAI/ChatOpenAI.ts',
        'packages/components/nodes/chatmodels/ChatOpenAI/FlowiseChatOpenAI.ts',
        'packages/components/nodes/tools/ExcelOfficeTool/ExcelOfficeTool.ts',
        'packages/components/nodes/tools/WordOfficeTool/WordOfficeTool.ts',
        'packages/components/nodes/tools/ProjectTrackerTool/ProjectTrackerTool.ts',
        'packages/components/nodes/tools/HelpdeskTicketTool/HelpdeskTicketTool.ts',
        'packages/components/nodes/tools/TelegramNotifyTool/TelegramNotifyTool.ts',
        'packages/components/nodes/vectorstores/DocumentStoreVS/DocStoreVector.ts',
        'packages/components/nodes/vectorstores/DocumentStoreVS/builderKnowledge.ts'].includes(file)
    if ((!isServer && !isComponent) || !file.endsWith('.ts') || file.endsWith('.test.ts') || file.endsWith('.d.ts')) continue
    const source = path.join(root, file)
    const target = path.join(root, file.replace('packages/server/src/', 'packages/server/dist/').replace('packages/components/src/', 'packages/components/dist/src/').replace('packages/components/nodes/','packages/components/dist/nodes/').replace(/\.ts$/, '.js'))
    const output = ts.transpileModule(fs.readFileSync(source, 'utf8'), {compilerOptions: isComponent ? componentOptions : options, fileName: source, reportDiagnostics: true})
    const errors = (output.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error)
    if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {getCanonicalFileName: (x) => x, getCurrentDirectory: () => root, getNewLine: () => '\n'}))
    fs.mkdirSync(path.dirname(target), {recursive: true})
    fs.writeFileSync(target, output.outputText)
    count++
}
for (const asset of [
    'packages/components/nodes/tools/ExcelOfficeTool/excel.svg',
    'packages/components/nodes/tools/WordOfficeTool/word.svg',
    'packages/components/nodes/tools/ProjectTrackerTool/project.svg',
    'packages/components/nodes/tools/HelpdeskTicketTool/ticket.svg',
    'packages/components/nodes/tools/TelegramNotifyTool/telegram.svg'
]) {
    const srcAsset = path.join(root, asset)
    const dstAsset = path.join(root, asset.replace('packages/components/nodes/', 'packages/components/dist/nodes/'))
    if (fs.existsSync(srcAsset)) {
        fs.mkdirSync(path.dirname(dstAsset), {recursive: true})
        fs.copyFileSync(srcAsset, dstAsset)
    }
}
console.log(`Prepared ${count} backend overlay files. This checks emit syntax, not full typechecking.`)
