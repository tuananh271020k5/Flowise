import { AgentPlan, CapabilityBinding } from './agentPlan'
import { CompiledFlowGraph } from './compiler'
import { AgentflowEdge, AgentflowNode } from './templates/assistantTemplate.v1'
import { agentIdentity, formatDirectReplyMessage, requiresNoneReasoningForFunctionTools } from '../agentBehaviorPolicy'
import { normalizeBranchIndex, WorkflowSpec } from '../workflow'
import { computeWorkflowLayout } from './layoutWorkflow'
import { getArchetypeById } from '../agentArchetypes'

const WHITELIST_PARAM_TYPES = new Set([
    'asyncOptions',
    'asyncMultiOptions',
    'options',
    'multiOptions',
    'array',
    'datagrid',
    'string',
    'number',
    'boolean',
    'password',
    'json',
    'code',
    'date',
    'file',
    'folder',
    'tabs',
    'conditionFunction',
    'timePicker',
    'weekDaysPicker',
    'monthDaysPicker',
    'datePicker'
])

interface FallbackNodeDef {
    label: string
    name: string
    version: number
    type: string
    icon: string
    category: string
    description: string
    baseClasses: string[]
    credential?: Record<string, any>
    inputs: Array<Record<string, any>>
    outputs?: Array<Record<string, any>>
    hideOutput?: boolean
}

const FALLBACK_V1_SCHEMAS: Record<string, FallbackNodeDef> = {
    chatOpenAI: {
        label: 'ChatOpenAI',
        name: 'chatOpenAI',
        version: 8.3,
        type: 'ChatOpenAI',
        icon: 'openai.svg',
        category: 'Chat Models',
        description: 'Wrapper around OpenAI large language models that use the Chat endpoint',
        baseClasses: ['ChatOpenAI', 'BaseChatModel', 'BaseLanguageModel', 'Runnable'],
        credential: { label: 'Connect Credential', name: 'credential', type: 'credential', credentialNames: ['openAIApi'] },
        inputs: [
            { label: 'Cache', name: 'cache', type: 'BaseCache', optional: true },
            { label: 'Model Name', name: 'modelName', type: 'asyncOptions', default: 'gpt-4o-mini' },
            { label: 'Temperature', name: 'temperature', type: 'number', default: 0.3, optional: true },
            { label: 'Streaming', name: 'streaming', type: 'boolean', default: false, optional: true, additionalParams: true },
            { label: 'Reasoning Effort', name: 'reasoningEffort', type: 'options', optional: true, additionalParams: true },
            { label: 'Timeout', name: 'timeout', type: 'number', optional: true, additionalParams: true },
            { label: 'BasePath', name: 'basepath', type: 'string', optional: true, additionalParams: true }
        ]
    },
    agentMemory: {
        label: 'Agent Memory',
        name: 'agentMemory',
        version: 2.0,
        type: 'AgentMemory',
        icon: 'agentmemory.svg',
        category: 'Memory',
        description: 'Memory for agentflow to remember the state of the conversation',
        baseClasses: ['AgentMemory', 'BaseCheckpointSaver'],
        inputs: [
            { label: 'Database', name: 'databaseType', type: 'options', default: 'sqlite' },
            { label: 'Database File Path', name: 'databaseFilePath', type: 'string', optional: true, additionalParams: true }
        ]
    },
    seqState: {
        label: 'State',
        name: 'seqState',
        version: 2.0,
        type: 'State',
        icon: 'state.svg',
        category: 'Sequential Agents',
        description: 'A centralized state object, updated by nodes in the graph, passing from one node to another',
        baseClasses: ['State'],
        inputs: [{ label: 'Custom State', name: 'stateMemory', type: 'tabs', default: 'stateMemoryUI', additionalParams: true }]
    },
    seqStart: {
        label: 'Start',
        name: 'seqStart',
        version: 2.0,
        type: 'Start',
        icon: 'start.svg',
        category: 'Sequential Agents',
        description: 'Starting point of the conversation',
        baseClasses: ['Start'],
        inputs: [
            { label: 'Chat Model', name: 'model', type: 'BaseChatModel' },
            { label: 'Agent Memory', name: 'agentMemory', type: 'BaseCheckpointSaver', optional: true },
            { label: 'State', name: 'state', type: 'State', optional: true },
            { label: 'Input Moderation', name: 'inputModeration', type: 'Moderation', optional: true, list: true }
        ]
    },
    seqAgent: {
        label: 'Agent',
        name: 'seqAgent',
        version: 4.1,
        type: 'Agent',
        icon: 'seqAgent.png',
        category: 'Sequential Agents',
        description: 'Agent that can execute tools',
        baseClasses: ['Agent'],
        inputs: [
            { label: 'Agent Name', name: 'agentName', type: 'string', placeholder: 'Agent' },
            { label: 'System Prompt', name: 'systemMessagePrompt', type: 'string', rows: 4, optional: true },
            {
                label: 'Conversation History',
                name: 'conversationHistorySelection',
                type: 'options',
                default: 'all_messages',
                optional: true
            },
            { label: 'Human Prompt', name: 'humanMessagePrompt', type: 'string', rows: 4, optional: true },
            { label: 'Tools', name: 'tools', type: 'Tool', list: true, optional: true },
            {
                label: 'Sequential Node',
                name: 'sequentialNode',
                type: 'Start | Agent | Condition | LLMNode | ToolNode | CustomFunction | ExecuteFlow',
                list: true
            },
            { label: 'Chat Model', name: 'model', type: 'BaseChatModel', optional: true },
            { label: 'Require Approval', name: 'interrupt', type: 'boolean', optional: true },
            { label: 'Approval Prompt', name: 'approvalPrompt', type: 'string', optional: true, additionalParams: true },
            {
                label: 'Approve Button Text',
                name: 'approveButtonText',
                type: 'string',
                default: 'Phê duyệt',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Reject Button Text',
                name: 'rejectButtonText',
                type: 'string',
                default: 'Từ chối',
                optional: true,
                additionalParams: true
            },
            { label: 'Max Iterations', name: 'maxIterations', type: 'number', optional: true, additionalParams: true }
        ]
    },
    seqLLMNode: {
        label: 'LLM Node',
        name: 'seqLLMNode',
        version: 3.1,
        type: 'LLMNode',
        icon: 'llm.svg',
        category: 'Sequential Agents',
        description: 'LLM Node to process prompt and return response',
        baseClasses: ['LLMNode'],
        inputs: [
            { label: 'Name', name: 'llmNodeName', type: 'string', placeholder: 'LLM Node' },
            {
                label: 'Sequential Node',
                name: 'sequentialNode',
                type: 'Start | Agent | Condition | LLMNode | ToolNode | CustomFunction | ExecuteFlow',
                list: true
            },
            { label: 'Chat Model', name: 'model', type: 'BaseChatModel', optional: true },
            { label: 'System Prompt', name: 'systemMessagePrompt', type: 'string', rows: 4, optional: true },
            {
                label: 'Conversation History',
                name: 'conversationHistorySelection',
                type: 'options',
                default: 'all_messages',
                optional: true
            },
            { label: 'Human Prompt', name: 'humanMessagePrompt', type: 'string', rows: 4, optional: true }
        ]
    },
    seqConditionAgent: {
        label: 'Condition Agent',
        name: 'seqConditionAgent',
        version: 3.1,
        type: 'ConditionAgent',
        icon: 'condition.svg',
        category: 'Sequential Agents',
        description: 'Uses an agent to determine which route to take next',
        baseClasses: ['ConditionAgent'],
        inputs: [
            { label: 'Name', name: 'conditionAgentName', type: 'string', placeholder: 'Condition Agent' },
            {
                label: 'Sequential Node',
                name: 'sequentialNode',
                type: 'Start | Agent | LLMNode | ToolNode | CustomFunction | ExecuteFlow',
                list: true
            },
            { label: 'Chat Model', name: 'model', type: 'BaseChatModel', optional: true },
            { label: 'System Prompt', name: 'systemMessagePrompt', type: 'string', rows: 4, optional: true },
            {
                label: 'Conversation History',
                name: 'conversationHistorySelection',
                type: 'options',
                default: 'all_messages',
                optional: true
            },
            { label: 'Human Prompt', name: 'humanMessagePrompt', type: 'string', rows: 4, optional: true },
            { label: 'JSON Structured Output', name: 'conditionAgentStructuredOutput', type: 'datagrid', optional: true },
            { label: 'Condition', name: 'condition', type: 'tabs', default: 'conditionUI' }
        ],
        outputs: [{ label: 'Next', name: 'next', baseClasses: ['Condition'], isAnchor: true }]
    },
    seqCustomFunction: {
        label: 'Custom JS Function',
        name: 'seqCustomFunction',
        version: 1.0,
        type: 'CustomFunction',
        icon: 'customfunction.svg',
        category: 'Sequential Agents',
        description: 'Execute custom javascript function',
        baseClasses: ['CustomFunction'],
        inputs: [
            {
                label: 'Sequential Node',
                name: 'sequentialNode',
                type: 'Start | Agent | Condition | LLMNode | ToolNode | CustomFunction | ExecuteFlow',
                list: true
            },
            { label: 'Function Name', name: 'functionName', type: 'string' },
            { label: 'Javascript Function', name: 'javascriptFunction', type: 'code' },
            { label: 'Return Value As', name: 'returnValueAs', type: 'options', default: 'aiMessage' }
        ]
    },
    seqLoop: {
        label: 'Loop',
        name: 'seqLoop',
        version: 2.1,
        type: 'Loop',
        icon: 'loop.svg',
        category: 'Sequential Agents',
        description: 'Loop back to the specific sequential node',
        baseClasses: ['Loop'],
        hideOutput: true,
        inputs: [
            {
                label: 'Sequential Node',
                name: 'sequentialNode',
                type: 'Agent | Condition | LLMNode | ToolNode | CustomFunction | ExecuteFlow',
                list: true
            },
            { label: 'Loop To', name: 'loopToName', type: 'string' }
        ]
    },
    seqEnd: {
        label: 'End',
        name: 'seqEnd',
        version: 2.1,
        type: 'End',
        icon: 'end.svg',
        category: 'Sequential Agents',
        description: 'End conversation',
        baseClasses: ['End'],
        hideOutput: true,
        inputs: [
            {
                label: 'Sequential Node',
                name: 'sequentialNode',
                type: 'Agent | Condition | LLMNode | ToolNode | CustomFunction | ExecuteFlow'
            }
        ]
    },
    documentStoreVS: {
        label: 'Document Store (Vector)',
        name: 'documentStoreVS',
        version: 1.0,
        type: 'DocumentStoreVS',
        icon: 'dstore.svg',
        category: 'Vector Stores',
        description: 'Search and retrieve documents from Document Store',
        baseClasses: ['DocumentStoreVS'],
        inputs: [{ label: 'Select Store', name: 'selectedStore', type: 'asyncOptions' }],
        outputs: [
            { label: 'Retriever', name: 'retriever', baseClasses: ['BaseRetriever'] },
            { label: 'Vector Store', name: 'vectorStore', baseClasses: ['VectorStore'] }
        ]
    },
    retrieverTool: {
        label: 'Retriever Tool',
        name: 'retrieverTool',
        version: 3.0,
        type: 'RetrieverTool',
        icon: 'retrievertool.svg',
        category: 'Tools',
        description: 'Use a retriever as allowed tool for agent',
        baseClasses: ['RetrieverTool', 'DynamicTool', 'Tool', 'StructuredTool', 'Runnable'],
        inputs: [
            { label: 'Retriever Name', name: 'name', type: 'string' },
            { label: 'Retriever Description', name: 'description', type: 'string', rows: 3 },
            { label: 'Retriever', name: 'retriever', type: 'BaseRetriever' },
            { label: 'Return Source Documents', name: 'returnSourceDocuments', type: 'boolean', optional: true }
        ]
    },
    stickyNote: {
        label: 'Sticky Note',
        name: 'stickyNote',
        version: 2.0,
        type: 'StickyNote',
        icon: 'stickyNote.svg',
        category: 'Utilities',
        description: 'Add notes to the agent flow',
        baseClasses: ['StickyNote'],
        inputs: [{ label: '', name: 'note', type: 'string', rows: 5, optional: true }]
    }
}

function escapePromptBraces(text: string): string {
    return (text || '').replace(/\{/g, '{{').replace(/\}/g, '}}')
}

function sanitizeSlug(raw: string, fallback: string): string {
    const ascii = (raw || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
    return ascii.slice(0, 32) || fallback
}

function hydrateV1Node(
    nodeName: string,
    nodeId: string,
    inputValues: Record<string, unknown>,
    position: { x: number; y: number },
    options: {
        componentNodes?: Record<string, any>
        labelOverride?: string
        credentialId?: string
        customOutputAnchors?: any[]
        outputsOverride?: Record<string, unknown>
    } = {}
): AgentflowNode {
    const liveDef = options.componentNodes?.[nodeName]
    const fallbackDef = FALLBACK_V1_SCHEMAS[nodeName] || {
        label: options.labelOverride || nodeName,
        name: nodeName,
        version: 1.0,
        type: nodeName,
        icon: 'tool.svg',
        category: 'Tools',
        description: options.labelOverride || nodeName,
        baseClasses: [nodeName, 'Tool'],
        inputs: []
    }
    const def = liveDef || fallbackDef

    const inputAnchors: any[] = []
    const inputParams: any[] = []
    const defaults: Record<string, unknown> = {}

    const rawInputs: any[] = Array.isArray(def.inputs) ? def.inputs : []
    for (const inp of rawInputs) {
        const cloned = { ...inp, id: `${nodeId}-input-${inp.name}-${inp.type}` }
        if (WHITELIST_PARAM_TYPES.has(inp.type)) {
            inputParams.push(cloned)
        } else {
            inputAnchors.push(cloned)
        }
        if (inp.default !== undefined) defaults[inp.name] = inp.default
        else defaults[inp.name] = ''
    }

    if (def.credential) {
        inputParams.unshift({
            ...def.credential,
            id: `${nodeId}-input-${def.credential.name}-${def.credential.type}`
        })
    }

    let outputAnchors: any[] = []
    let outputsObj: Record<string, unknown> = {}
    if (options.customOutputAnchors) {
        outputAnchors = options.customOutputAnchors
        outputsObj = options.outputsOverride || { output: options.customOutputAnchors[0]?.default || 'next' }
    } else if (def.hideOutput) {
        outputAnchors = []
    } else if (Array.isArray(def.outputs) && def.outputs.length > 0) {
        const anchorOptions = def.outputs.map((out: any) => ({
            id: `${nodeId}-output-${out.name}-${(out.baseClasses || [def.type]).join('|')}`,
            name: out.name,
            label: out.label,
            description: out.description ?? '',
            type: (out.baseClasses || [def.type]).join(' | '),
            isAnchor: out.isAnchor
        }))
        outputAnchors = [
            {
                name: 'output',
                label: 'Output',
                type: 'options',
                description: '',
                options: anchorOptions,
                default: def.outputs[0].name
            }
        ]
        outputsObj = { output: def.outputs[0].name, ...(options.outputsOverride || {}) }
    } else {
        const baseClasses = Array.isArray(def.baseClasses) && def.baseClasses.length ? def.baseClasses : [def.type || nodeName]
        outputAnchors = [
            {
                id: `${nodeId}-output-${def.name}-${baseClasses.join('|')}`,
                name: def.name,
                label: def.type || def.label || nodeName,
                description: def.description || '',
                type: baseClasses.join(' | ')
            }
        ]
    }

    const mergedInputs: Record<string, unknown> = { ...defaults, ...inputValues }
    const credId =
        options.credentialId || (typeof inputValues.FLOWISE_CREDENTIAL_ID === 'string' ? inputValues.FLOWISE_CREDENTIAL_ID : undefined)
    if (credId) {
        mergedInputs.FLOWISE_CREDENTIAL_ID = credId
    }

    const nodeData: any = {
        id: nodeId,
        label: options.labelOverride || def.label || nodeName,
        version: def.version ?? 1.0,
        name: def.name || nodeName,
        type: def.type || nodeName,
        baseClasses: Array.isArray(def.baseClasses) ? [...def.baseClasses] : [def.type || nodeName],
        category: def.category || 'Sequential Agents',
        description: def.description || '',
        color: '#4DD0E1',
        inputParams,
        inputAnchors,
        inputs: mergedInputs,
        outputAnchors,
        outputs: outputsObj,
        selected: false
    }
    if (def.hideOutput) nodeData.hideOutput = true
    if (credId) nodeData.credential = credId

    return {
        id: nodeId,
        type: (nodeName === 'stickyNote' ? 'stickyNote' : 'customNode') as any,
        position,
        data: nodeData
    }
}

function getOutputHandleId(node: AgentflowNode, optionNameOrLabel?: string): string {
    const anchors: any[] = (node.data.outputAnchors as any[]) || []
    if (!anchors.length) return ''
    if (Array.isArray(anchors[0]?.options)) {
        if (optionNameOrLabel) {
            const match = anchors[0].options.find((opt: any) => opt.name === optionNameOrLabel || opt.label === optionNameOrLabel)
            if (match?.id) return match.id
        }
        return anchors[0].options[0]?.id || ''
    }
    return anchors[0]?.id || ''
}

function getInputHandleId(node: AgentflowNode, inputName: string): string {
    const anchors: any[] = (node.data.inputAnchors as any[]) || []
    const found = anchors.find((a: any) => a.name === inputName)
    return found?.id || `${node.id}-input-${inputName}-Any`
}

function connectV1(
    edges: AgentflowEdge[],
    sourceNode: AgentflowNode,
    targetNode: AgentflowNode,
    targetInputName: string,
    sourceOptionNameOrLabel?: string,
    asList = false
) {
    const sourceHandle = getOutputHandleId(sourceNode, sourceOptionNameOrLabel)
    const targetHandle = getInputHandleId(targetNode, targetInputName)
    const instanceRef = `{{${sourceNode.id}.data.instance}}`

    if (asList) {
        const cur = targetNode.data.inputs[targetInputName]
        const arr = Array.isArray(cur) ? cur : []
        if (!arr.includes(instanceRef)) arr.push(instanceRef)
        targetNode.data.inputs[targetInputName] = arr
    } else {
        targetNode.data.inputs[targetInputName] = instanceRef
    }

    const edgeId = `${sourceNode.id}-${sourceHandle}-${targetNode.id}-${targetHandle}`
    if (!edges.some((e) => e.id === edgeId)) {
        edges.push({
            id: edgeId,
            source: sourceNode.id,
            sourceHandle,
            target: targetNode.id,
            targetHandle,
            type: 'buttonedge' as any
        })
    }
}

function selectBindingsForStep(allToolBindings: CapabilityBinding[], mcpServerIds?: string[], nativeTools?: string[]): CapabilityBinding[] {
    const selected: CapabilityBinding[] = []
    if (mcpServerIds?.length) {
        const idSet = new Set(mcpServerIds)
        selected.push(
            ...allToolBindings.filter(
                (b) => b.nodeName === 'customMcpServerTool' && typeof b.config?.mcpServerId === 'string' && idSet.has(b.config.mcpServerId)
            )
        )
    }
    if (nativeTools?.length) {
        const nameSet = new Set(nativeTools)
        selected.push(...allToolBindings.filter((b) => b.nodeName !== 'customMcpServerTool' && nameSet.has(b.nodeName)))
    }
    if (!mcpServerIds?.length && !nativeTools?.length) {
        return allToolBindings
    }
    return selected
}

/**
 * Bộ biên dịch Flowise Agentflow V1 (Sequential Agents / MULTIAGENT — mở trực tiếp trên `/agentcanvas/:id`).
 * Hiển thị đầy đủ mọi cục node rời trên Canvas (`ChatOpenAI`, `Agent Memory`, `State`, `Document Store`, `Retriever Tool`,
 * từng node Tool / MCP riêng, `Start`, `Condition Agent`, `Agent` có `Require Approval`, `LLM Node`, `Custom JS Function`, `Loop`, `End`)
 * với bố cục phân tầng rõ ràng và thực thi thật qua LangGraph `StateGraph`.
 */
export function compileWorkflowV1(
    plan: AgentPlan,
    options: {
        componentNodes?: Record<string, any>
        modelProfile?: { modelName: string; baseUrl?: string; credentialId?: string }
    } = {}
): CompiledFlowGraph {
    const workflow: WorkflowSpec = plan.spec.workflow || {
        summary: plan.spec.goal,
        enableMemory: true,
        steps: [
            {
                id: 'main_agent',
                type: 'agent',
                label: plan.spec.name || 'Trợ lý Chính',
                instruction: plan.spec.instructions,
                inputFrom: ['start'],
                nativeTools: (plan.spec.tools || []).map((t) => t.type).filter(Boolean),
                mcpServerIds: (plan.spec.mcpServers || []).map((m) => m.id).filter(Boolean)
            }
        ],
        edges: [{ source: 'start', target: 'main_agent' }],
        questions: [],
        blockers: []
    }

    const componentNodes = options.componentNodes
    const nodes: AgentflowNode[] = []
    const edges: AgentflowEdge[] = []

    const modelBinding = plan.capabilityBindings.find((b) => b.type === 'model')
    const allToolBindings = plan.capabilityBindings.filter((b) => b.type === 'tool')
    const dataSourceBindings = plan.capabilityBindings.filter((b) => b.type === 'datasource')

    const modelName = options.modelProfile?.modelName || (modelBinding?.config?.modelName as string) || 'gpt-4o-mini'
    const basepath = options.modelProfile?.baseUrl || (modelBinding?.config?.basepath as string) || ''
    const credentialId = options.modelProfile?.credentialId || (modelBinding?.config?.FLOWISE_CREDENTIAL_ID as string) || ''
    const needsNoneReasoning = requiresNoneReasoningForFunctionTools(modelName)

    // 1. Tính thứ tự topo & phân tầng cho toàn bộ các bước, sau đó tính tọa độ Swimlane động
    // dựa trên kích thước thẻ thật của Flowise V1 để đảm bảo TUYỆT ĐỐI KHÔNG ĐÈ NHAU (0px overlap).
    const humanInputStepIds = new Set(workflow.steps.filter((s) => s.type === 'humanInput').map((s) => s.id))
    const approvalTargetIds = new Set<string>()
    const humanInputPromptByTarget = new Map<string, string>()
    for (const edge of workflow.edges) {
        if (humanInputStepIds.has(edge.source) && (edge.branch === '0' || edge.branch === 'true' || !edge.branch)) {
            approvalTargetIds.add(edge.target)
            const hStep = workflow.steps.find((s) => s.id === edge.source)
            if (hStep?.instruction) humanInputPromptByTarget.set(edge.target, hStep.instruction)
        }
    }

    const topoLayout = computeWorkflowLayout(workflow, { startX: 0, centerY: 0, colGap: 1, rowGap: 1 })
    const boundToolsByStepId = new Map<string, CapabilityBinding[]>()
    for (const step of workflow.steps) {
        if (['agent', 'iteration', 'http'].includes(step.type)) {
            boundToolsByStepId.set(step.id, selectBindingsForStep(allToolBindings, step.mcpServerIds, step.nativeTools))
        } else {
            boundToolsByStepId.set(step.id, [])
        }
    }

    const estimateV1CardHeight = (stepType: string): number => {
        if (['agent', 'retriever', 'iteration', 'http'].includes(stepType)) return 1120
        if (['conditionAgent', 'condition'].includes(stepType)) return 820
        if (stepType === 'llm') return 780
        if (stepType === 'reply') return 520
        return 300
    }

    const activeSteps = workflow.steps.filter((s) => !humanInputStepIds.has(s.id))
    const stepsByDepth = new Map<number, typeof activeSteps>()
    for (const step of activeSteps) {
        const d = Math.max(1, topoLayout.get(step.id)?.depth ?? 1)
        if (!stepsByDepth.has(d)) stepsByDepth.set(d, [])
        stepsByDepth.get(d)!.push(step)
    }
    const sortedDepths = [...stepsByDepth.keys()].sort((a, b) => a - b)
    for (const d of sortedDepths) {
        stepsByDepth.get(d)!.sort((a, b) => (topoLayout.get(a.id)?.row ?? 0) - (topoLayout.get(b.id)?.row ?? 0))
    }

    const CENTER_Y = 420
    const START_X = 560
    const BASE_COL_STEP = 540
    const TOOL_COL_WIDTH = 440
    const TOOL_ROW_HEIGHT = 500
    const LANE_GAP = 220

    const layerX = new Map<number, number>([[0, START_X]])
    let prevX = START_X
    for (const d of sortedDepths) {
        const layerSteps = stepsByDepth.get(d)!
        const maxToolCols = Math.max(
            0,
            ...layerSteps.map((s) => {
                const count = (boundToolsByStepId.get(s.id) || []).length
                return count === 0 ? 0 : Math.min(3, Math.ceil(count / 3))
            })
        )
        const nextX = prevX + BASE_COL_STEP + maxToolCols * TOOL_COL_WIDTH
        layerX.set(d, nextX)
        prevX = nextX
    }
    const maxLayerX = Math.max(START_X, ...layerX.values())

    const stepPosMap = new Map<string, { x: number; y: number }>()
    const toolPosMap = new Map<string, Array<{ x: number; y: number }>>()
    for (const d of sortedDepths) {
        const layerSteps = stepsByDepth.get(d)!
        const x = layerX.get(d)!
        const laneHeights = layerSteps.map((s) => {
            const count = (boundToolsByStepId.get(s.id) || []).length
            const toolCols = count === 0 ? 0 : Math.min(3, Math.ceil(count / 3))
            const toolRows = toolCols > 0 ? Math.ceil(count / toolCols) : 0
            return Math.max(estimateV1CardHeight(s.type), toolRows * TOOL_ROW_HEIGHT) + LANE_GAP
        })
        const totalHeight = laneHeights.reduce((sum, h) => sum + h, 0) - LANE_GAP
        let cursorY = CENTER_Y - totalHeight / 2

        layerSteps.forEach((step, idx) => {
            const laneTop = Math.round(cursorY)
            stepPosMap.set(step.id, { x, y: laneTop })

            const tools = boundToolsByStepId.get(step.id) || []
            if (tools.length > 0) {
                const toolCols = Math.min(3, Math.ceil(tools.length / 3))
                const toolRows = Math.ceil(tools.length / toolCols)
                const positions = tools.map((_t, toolIdx) => {
                    const colFromRight = Math.floor(toolIdx / toolRows)
                    const rowInCol = toolIdx % toolRows
                    return {
                        x: x - (colFromRight + 1) * TOOL_COL_WIDTH,
                        y: Math.round(laneTop + rowInCol * TOOL_ROW_HEIGHT)
                    }
                })
                toolPosMap.set(step.id, positions)
            }
            cursorY += laneHeights[idx]
        })
    }

    const startPos = { x: START_X, y: CENTER_Y - 170 }

    // 2. Tạo ChatOpenAI node rời ở cột ngoài cùng bên trái (tách thoáng hoàn toàn khỏi Agent Memory & State)
    const chatModelNode = hydrateV1Node(
        'chatOpenAI',
        'chatOpenAI_0',
        {
            modelName,
            temperature: 0.2,
            streaming: false,
            timeout: 120000,
            ...(basepath ? { basepath } : {}),
            ...(needsNoneReasoning ? { reasoningEffort: 'none' } : {})
        },
        { x: 60, y: CENTER_Y - 600 },
        { componentNodes, credentialId }
    )
    nodes.push(chatModelNode)

    // 3. Tạo Start node (`seqStart_0`)
    const startNode = hydrateV1Node('seqStart', 'seqStart_0', {}, { x: startPos.x, y: startPos.y }, { componentNodes })
    nodes.push(startNode)
    connectV1(edges, chatModelNode, startNode, 'model', undefined, false)

    // 4. Tạo Agent Memory node rời (cách ChatOpenAI >= 180px, không bao giờ chạm viền)
    const enableMemory = workflow.enableMemory !== false
    if (enableMemory) {
        const memoryNode = hydrateV1Node(
            'agentMemory',
            'agentMemory_0',
            { databaseType: 'sqlite' },
            { x: 60, y: CENTER_Y + 200 },
            { componentNodes }
        )
        nodes.push(memoryNode)
        connectV1(edges, memoryNode, startNode, 'agentMemory', undefined, false)
    }

    // 5. Tạo State node rời nếu workflow khai báo Flow State
    if (Array.isArray(workflow.initialState) && workflow.initialState.length > 0) {
        const stateRows = workflow.initialState.map((entry, idx) => ({
            key: entry.key,
            type: 'Replace',
            defaultValue: entry.value || '',
            id: idx + 1
        }))
        const stateNode = hydrateV1Node(
            'seqState',
            'seqState_0',
            {
                selectedStateTab_seqState_0: 'stateMemoryUI',
                stateMemoryUI: JSON.stringify(stateRows)
            },
            { x: 60, y: CENTER_Y + 700 },
            { componentNodes }
        )
        nodes.push(stateNode)
        connectV1(edges, stateNode, startNode, 'state', undefined, false)
    }

    // Bộ đếm ID chuẩn V1
    const typeCounters: Record<string, number> = {}
    const nextNodeId = (prefix: string) => {
        const idx = typeCounters[prefix] ?? 0
        typeCounters[prefix] = idx + 1
        return `${prefix}_${idx}`
    }

    // Ánh xạ stepId -> V1 node + metadata nhánh cho ConditionAgent
    const stepToV1Node = new Map<string, AgentflowNode>()
    const stepDisplayName = new Map<string, string>()
    const conditionBranchLabels = new Map<string, Map<string, string>>() // condStepId -> (normalizedBranch -> anchorLabel)
    let toolSpawnCounter = 0

    // Tạo sẵn bộ node DocumentStoreVS -> RetrieverTool ở hàng trên cùng riêng biệt nếu có tài liệu đính kèm
    const minStepY = Math.min(
        chatModelNode.position.y,
        ...[...stepPosMap.values()].map((p) => p.y),
        ...[...toolPosMap.values()].flat().map((p) => p.y)
    )
    const ragRetrieverToolNodes: Array<{ sourceId: string; retrieverToolNode: AgentflowNode }> = []
    if (dataSourceBindings.length > 0) {
        dataSourceBindings.forEach((ds, idx) => {
            const dsId = nextNodeId('documentStoreVS')
            const rtId = nextNodeId('retrieverTool')
            const dsY = minStepY - 560 - idx * 460
            const storeId = String(ds.config?.selectedStore || ds.capabilityId)
            const storeLabel = String(ds.config?.storeName || ds.capabilityId)
            const dsNode = hydrateV1Node(
                'documentStoreVS',
                dsId,
                { selectedStore: storeId },
                { x: START_X, y: dsY },
                { componentNodes, outputsOverride: { output: 'retriever' } }
            )
            const rtNode = hydrateV1Node(
                'retrieverTool',
                rtId,
                {
                    name: sanitizeSlug(storeLabel, `doc_store_${idx + 1}`),
                    description: `Tra cứu tài liệu chính xác từ kho "${storeLabel}"`,
                    returnSourceDocuments: true
                },
                { x: START_X + 480, y: dsY },
                { componentNodes }
            )
            connectV1(edges, dsNode, rtNode, 'retriever', 'retriever', false)
            nodes.push(dsNode, rtNode)
            ragRetrieverToolNodes.push({ sourceId: storeId, retrieverToolNode: rtNode })
        })
    }

    // 6. Tạo node V1 cho từng bước workflow
    for (const step of workflow.steps) {
        if (step.type === 'humanInput') {
            // humanInput trong V1 được biểu diễn trực tiếp bằng công tắc Require Approval (`interrupt: true`) trên seqAgent đích
            continue
        }

        const pos = stepPosMap.get(step.id) || { x: START_X + BASE_COL_STEP, y: CENTER_Y }
        const stepUniqueName = `${step.label}`.slice(0, 60)
        stepDisplayName.set(step.id, stepUniqueName)

        const baseSystem = escapePromptBraces(
            [
                agentIdentity(plan.spec.name),
                `Mục tiêu tổng thể: ${plan.spec.goal}`,
                `Chỉ dẫn chủ Agent: ${plan.spec.instructions}`,
                `Ngôn ngữ phản hồi: ${plan.spec.language || 'Tiếng Việt'}`,
                `NHIỆM VỤ BƯỚC "${step.label}": ${step.instruction}`,
                'Không giả vờ đã gọi công cụ hoặc cập nhật dữ liệu ngoài khi chưa nhận kết quả công cụ thật.'
            ].join('\n')
        )

        if (step.type === 'conditionAgent' || step.type === 'condition') {
            const nodeId = nextNodeId('seqConditionAgent')
            const outEdges = workflow.edges.filter((e) => e.source === step.id)
            const branchEntries =
                step.type === 'conditionAgent' && step.scenarios?.length
                    ? step.scenarios.map((scenario, idx) => ({
                          branchKey: String(idx),
                          enumCode: `ROUTE_${idx}`,
                          label: `Branch_${idx + 1}`,
                          description: scenario
                      }))
                    : [
                          { branchKey: '0', enumCode: 'ROUTE_0', label: 'True_Branch', description: 'Đáp ứng điều kiện' },
                          { branchKey: '1', enumCode: 'ROUTE_1', label: 'False_Branch', description: 'Không đáp ứng điều kiện' }
                      ]

            const branchMap = new Map<string, string>()
            branchEntries.forEach((b) => branchMap.set(b.branchKey, b.label))
            conditionBranchLabels.set(step.id, branchMap)

            const structuredOutput = JSON.stringify([
                {
                    key: 'route',
                    type: 'Enum',
                    enumValues: branchEntries.map((b) => b.enumCode).join(', '),
                    description: 'Chọn chính xác mã ROUTE phù hợp nhất với yêu cầu hiện tại',
                    actions: '',
                    id: 1
                }
            ])

            const conditionUI = JSON.stringify(
                branchEntries.map((b, idx) => ({
                    variable: '$flow.output.route',
                    operation: idx === branchEntries.length - 1 ? 'Is Not Empty' : 'Is',
                    value: idx === branchEntries.length - 1 ? '' : b.enumCode,
                    output: b.label,
                    actions: '',
                    id: idx + 1
                }))
            )

            const customOutputAnchors = [
                {
                    name: 'output',
                    label: 'Output',
                    type: 'options',
                    description: '',
                    options: branchEntries.map((b) => ({
                        id: `${nodeId}-output-${sanitizeSlug(b.label, b.enumCode.toLowerCase())}-Condition`,
                        name: sanitizeSlug(b.label, b.enumCode.toLowerCase()),
                        label: b.label,
                        type: 'Condition',
                        isAnchor: true
                    })),
                    default: 'next'
                }
            ]

            const routeGuide = branchEntries.map((b) => `- Trả "${b.enumCode}" nếu: ${b.description}`).join('\n')
            const condNode = hydrateV1Node(
                'seqConditionAgent',
                nodeId,
                {
                    conditionAgentName: stepUniqueName,
                    systemMessagePrompt: escapePromptBraces(
                        `Bạn là bộ điều phối định tuyến thông minh cho trợ lý "${plan.spec.name}".\n` +
                            `Nhiệm vụ: ${step.instruction}\n` +
                            `Phân loại chính xác vào MỘT trong các mã tuyến sau:\n${routeGuide}`
                    ),
                    humanMessagePrompt: escapePromptBraces(
                        `Dựa trên tin nhắn gần nhất của người dùng và ngữ cảnh hội thoại, chọn đúng 1 mã route phù hợp nhất (${branchEntries
                            .map((b) => b.enumCode)
                            .join(' / ')}).`
                    ),
                    conversationHistorySelection: 'all_messages',
                    conditionAgentStructuredOutput: structuredOutput,
                    [`selectedConditionFunctionTab_${nodeId}`]: 'conditionUI',
                    conditionUI
                },
                { x: pos.x, y: pos.y },
                { componentNodes, labelOverride: step.label, customOutputAnchors }
            )
            // Ensure outEdges exist check doesn't warn unused
            void outEdges
            nodes.push(condNode)
            stepToV1Node.set(step.id, condNode)
        } else if (step.type === 'reply') {
            const nodeId = nextNodeId('seqCustomFunction')
            const fixedText = formatDirectReplyMessage(step.instruction, plan.spec.name)
            const replyNode = hydrateV1Node(
                'seqCustomFunction',
                nodeId,
                {
                    functionName: stepUniqueName,
                    javascriptFunction: `return ${JSON.stringify(fixedText)};`,
                    returnValueAs: 'aiMessage'
                },
                { x: pos.x, y: pos.y },
                { componentNodes, labelOverride: step.label }
            )
            nodes.push(replyNode)
            stepToV1Node.set(step.id, replyNode)
        } else if (step.type === 'loop') {
            const nodeId = nextNodeId('seqLoop')
            const targetName = (step.loopBackTo && stepDisplayName.get(step.loopBackTo)) || step.loopBackTo || 'Agent'
            const loopNode = hydrateV1Node(
                'seqLoop',
                nodeId,
                { loopToName: targetName },
                { x: pos.x, y: pos.y },
                { componentNodes, labelOverride: step.label }
            )
            nodes.push(loopNode)
            stepToV1Node.set(step.id, loopNode)
        } else if (step.type === 'llm') {
            const nodeId = nextNodeId('seqLLMNode')
            const llmNode = hydrateV1Node(
                'seqLLMNode',
                nodeId,
                {
                    llmNodeName: stepUniqueName,
                    systemMessagePrompt: baseSystem,
                    humanMessagePrompt: escapePromptBraces(`Thực hiện nhiệm vụ "${step.label}": ${step.instruction}`),
                    conversationHistorySelection: 'all_messages'
                },
                { x: pos.x, y: pos.y },
                { componentNodes, labelOverride: step.label }
            )
            nodes.push(llmNode)
            stepToV1Node.set(step.id, llmNode)
        } else {
            // 'agent' | 'retriever' | 'iteration' | 'http' -> seqAgent có gắn đầy đủ các cục Tool rời ngay trên Canvas!
            const nodeId = nextNodeId('seqAgent')
            const requireApproval = approvalTargetIds.has(step.id)
            const approvalHint =
                humanInputPromptByTarget.get(step.id) ||
                'Hệ thống sắp thực thi thao tác cập nhật dữ liệu quan trọng bằng công cụ: {tools}. Bạn xác nhận tiếp tục chứ?'

            const agentNode = hydrateV1Node(
                'seqAgent',
                nodeId,
                {
                    agentName: stepUniqueName,
                    systemMessagePrompt: baseSystem,
                    humanMessagePrompt: escapePromptBraces(
                        `Xử lý yêu cầu hiện tại theo đúng nhiệm vụ "${step.label}" và sử dụng công cụ đã cấp khi cần.`
                    ),
                    conversationHistorySelection: 'all_messages',
                    interrupt: requireApproval,
                    ...(requireApproval
                        ? {
                              approvalPrompt: approvalHint,
                              approveButtonText: 'Phê duyệt',
                              rejectButtonText: 'Từ chối'
                          }
                        : {}),
                    maxIterations: 10
                },
                { x: pos.x, y: pos.y },
                { componentNodes, labelOverride: step.label }
            )
            nodes.push(agentNode)
            stepToV1Node.set(step.id, agentNode)

            // Gắn các cục Tool rời trong đúng cột Tool riêng bên trái seqAgent (không chồng lấn sang nhánh khác)
            const boundTools = boundToolsByStepId.get(step.id) || []
            const precomputedToolPositions = toolPosMap.get(step.id) || []

            boundTools.forEach((binding, toolIdx) => {
                const toolNodeId = `${binding.nodeName}_${toolSpawnCounter++}`
                const toolCredId =
                    typeof binding.config?.FLOWISE_CREDENTIAL_ID === 'string' ? binding.config.FLOWISE_CREDENTIAL_ID : undefined
                const toolInputs = { ...(binding.config || {}) }
                const tPos = precomputedToolPositions[toolIdx] || {
                    x: pos.x - TOOL_COL_WIDTH,
                    y: pos.y + toolIdx * TOOL_ROW_HEIGHT
                }
                const toolNode = hydrateV1Node(binding.nodeName, toolNodeId, toolInputs, tPos, {
                    componentNodes,
                    credentialId: toolCredId
                })
                nodes.push(toolNode)
                connectV1(edges, toolNode, agentNode, 'tools', undefined, true)
            })

            // Nếu bước là retriever hoặc cần nguồn tài liệu RAG -> nối cục RetrieverTool (đã nối sẵn DocumentStoreVS) vào seqAgent
            if (step.type === 'retriever' || (step.sourceIds && step.sourceIds.length > 0)) {
                const selectedIds = step.sourceIds?.length ? new Set(step.sourceIds) : null
                for (const rag of ragRetrieverToolNodes) {
                    if (!selectedIds || selectedIds.has(rag.sourceId)) {
                        connectV1(edges, rag.retrieverToolNode, agentNode, 'tools', undefined, true)
                    }
                }
            }
        }
    }

    // 7. Nối toàn bộ các cạnh điều khiển tuần tự (xuyên qua humanInput nếu có)
    const resolveEffectiveSource = (rawSourceId: string): Array<{ id: string; branch?: string }> => {
        if (!humanInputStepIds.has(rawSourceId)) return [{ id: rawSourceId }]
        return workflow.edges.filter((e) => e.target === rawSourceId).map((e) => ({ id: e.source, branch: e.branch }))
    }

    const nodesWithOutgoing = new Set<string>()
    for (const edge of workflow.edges) {
        if (humanInputStepIds.has(edge.target)) continue
        if (humanInputStepIds.has(edge.source) && (edge.branch === '1' || edge.branch === 'false')) continue
        const targetNode = stepToV1Node.get(edge.target)
        if (!targetNode) continue

        const sources = resolveEffectiveSource(edge.source)
        for (const src of sources) {
            const sourceNode = src.id === 'start' ? startNode : stepToV1Node.get(src.id)
            if (!sourceNode) continue
            const effectiveBranch = src.branch ?? edge.branch
            const branchMap = conditionBranchLabels.get(src.id)
            const branchLabel = branchMap ? branchMap.get(normalizeBranchIndex(effectiveBranch) || '0') : undefined
            connectV1(edges, sourceNode, targetNode, 'sequentialNode', branchLabel, true)
            nodesWithOutgoing.add(sourceNode.id)
        }
    }

    // 8. Tự động gắn node `End` (`seqEnd_N`) gọn gàng ở cột ngoài cùng bên phải (không bao giờ đè lên cột tool/agent khác)
    const terminalNodes = workflow.steps
        .filter((step) => step.type !== 'loop' && step.type !== 'humanInput')
        .map((step) => stepToV1Node.get(step.id))
        .filter((node): node is AgentflowNode => Boolean(node && !nodesWithOutgoing.has(node.id)))
        .sort((a, b) => a.position.y - b.position.y)

    const endColX = maxLayerX + 520
    let lastEndY = Number.NEGATIVE_INFINITY
    for (const node of terminalNodes) {
        const endId = nextNodeId('seqEnd')
        const desiredY = Math.round(node.position.y + 240)
        const endY = Number.isFinite(lastEndY) ? Math.max(desiredY, lastEndY + 280) : desiredY
        lastEndY = endY
        const endNode = hydrateV1Node('seqEnd', endId, {}, { x: endColX, y: endY }, { componentNodes })
        nodes.push(endNode)
        connectV1(edges, node, endNode, 'sequentialNode', undefined, false)
    }

    // 9. Thêm 1 Sticky Note gọn gàng tóm tắt kiến trúc Agent (văn bản thuần, không dùng emoji, cách biệt hoàn toàn phía trên ChatOpenAI)
    const archetypeTitle = getArchetypeById(workflow.archetype)?.titleVi || 'Trợ lý Agentflow V1'
    const toolNames = [...new Set(allToolBindings.map((b) => b.nodeName))]
    const noteLines = [
        `${plan.spec.name}`,
        `Phân loại: ${archetypeTitle}`,
        `Bộ nhớ: ${enableMemory ? 'Đã bật (Agent Memory SQLite)' : 'Tắt'}`,
        ...(toolNames.length ? [`Công cụ gắn rời: ${toolNames.join(', ')}`] : []),
        ...(workflow.schedule?.cronExpression
            ? [`Lịch định kỳ đề xuất: ${workflow.schedule.cronExpression} (${workflow.schedule.timezone || 'Asia/Ho_Chi_Minh'})`]
            : []),
        `Luồng: ${workflow.summary}`
    ]
    const noteText = noteLines
        .join('\n')
        .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
        .replace(/[ \t]{2,}/g, ' ')
    const estimatedStickyHeight = Math.max(420, 140 + Math.ceil(noteText.length / 28) * 26)
    const minY = Math.min(...nodes.map((n) => n.position.y), 0)
    const stickyNode = hydrateV1Node(
        'stickyNote',
        'stickyNote_0',
        { note: noteText },
        { x: 60, y: Math.min(chatModelNode.position.y, minY) - estimatedStickyHeight - 140 },
        { componentNodes }
    )
    nodes.push(stickyNode)

    return {
        templateId: 'sequential_v1',
        templateVersion: '1.0.0',
        planId: plan.id,
        nodes,
        edges,
        viewport: { x: 40, y: 120, zoom: 0.45 },
        flowConfig: {
            chatflowType: 'MULTIAGENT' as any,
            name: plan.spec.name,
            description: plan.spec.goal,
            category: 'Sequential Agents'
        }
    }
}
