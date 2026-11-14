import { AgentSpec } from '../../types'

export interface AgentflowNodeData {
    id: string
    label: string
    name: string
    version: number
    type: string
    category: string
    color: string
    hideInput?: boolean
    hideOutput?: boolean
    baseClasses: string[]
    description: string
    inputs: Record<string, unknown>
    inputParams?: unknown[]
    inputAnchors?: unknown[]
    outputAnchors?: unknown[]
    outputs?: Record<string, unknown>
    position?: { x: number; y: number }
    selected?: boolean
}

export interface AgentflowNode {
    id: string
    type: 'agentFlow'
    position: { x: number; y: number }
    data: AgentflowNodeData
    width?: number
    height?: number
}

export interface AgentflowEdge {
    id: string
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
    type: 'agentFlow'
    data?: {
        sourceColor?: string
        targetColor?: string
        isHumanInput?: boolean
    }
}

export interface FlowiseAgentflowGraph {
    templateId: string
    templateVersion: string
    nodes: AgentflowNode[]
    edges: AgentflowEdge[]
}

export const ASSISTANT_TEMPLATE_ID = 'assistant-flow-template'
export const ASSISTANT_TEMPLATE_VERSION = '1.0'

/**
 * Khởi tạo Flowise Agentflow V2 Graph từ AgentSpec theo Assistant Template v1.0 chuẩn (PH2-T01).
 * Cấu trúc kế thừa từ fixture đã được kiểm chứng ở TASK-001 (Start node 1.4, Agent node 3.2, Chat Model).
 */
export const instantiateAssistantTemplate = (spec: AgentSpec): FlowiseAgentflowGraph => {
    const startNodeId = 'startAgentflow_0'
    const agentNodeId = 'agentAgentflow_0'
    const modelNodeId = `${spec.modelProfileRef || 'chatOpenAI'}_0`

    // 1. Start Node (Phiên bản 1.4 chuẩn)
    const startNode: AgentflowNode = {
        id: startNodeId,
        type: 'agentFlow',
        position: { x: 100, y: 150 },
        data: {
            id: startNodeId,
            label: 'Start',
            name: 'startAgentflow',
            version: 1.4,
            type: 'Start',
            category: 'Agent Flows',
            color: '#7EE787',
            hideInput: true,
            baseClasses: ['Start'],
            description: 'Starting point of the agentflow',
            inputs: {
                startInputType: 'chatInput',
                startEphemeralMemory: false,
                startPersistState: true
            },
            outputAnchors: [
                {
                    id: `${startNodeId}-output-startAgentflow`,
                    label: 'Start',
                    name: 'startAgentflow'
                }
            ]
        }
    }

    // 2. Model Node (OpenAI / Gemini / Anthropic / Ollama)
    const modelProvider = spec.modelProfileRef === 'default-builder-model' ? 'chatOpenAI' : spec.modelProfileRef
    const modelNode: AgentflowNode = {
        id: modelNodeId,
        type: 'agentFlow',
        position: { x: 450, y: 400 },
        data: {
            id: modelNodeId,
            label: modelProvider === 'chatOpenAI' ? 'ChatOpenAI (GPT-4o)' : modelProvider,
            name: modelProvider,
            version: modelProvider === 'chatOpenAI' ? 5.0 : 2.0,
            type: modelProvider === 'chatOpenAI' ? 'ChatOpenAI' : 'ChatGoogleGenerativeAI',
            category: 'Chat Models',
            color: '#10A37F',
            baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
            description: 'Model cung cấp trí tuệ nhân tạo cho Agent',
            inputs: {
                modelName: 'gpt-4o',
                temperature: 0.7
            },
            outputAnchors: [
                {
                    id: `${modelNodeId}-output-${modelProvider}`,
                    label: modelProvider,
                    name: modelProvider
                }
            ]
        }
    }

    // 3. Agent Node (Phiên bản 3.2 chuẩn)
    const systemInstruction = spec.instructions || 'Bạn là trợ lý AI thông minh, hỗ trợ người dùng bằng tiếng Việt chuẩn mực.'
    const agentNode: AgentflowNode = {
        id: agentNodeId,
        type: 'agentFlow',
        position: { x: 450, y: 150 },
        data: {
            id: agentNodeId,
            label: spec.name || 'Trợ lý AI',
            name: 'agentAgentflow',
            version: 3.2,
            type: 'Agent',
            category: 'Agent Flows',
            color: '#4DD0E1',
            baseClasses: ['Agent'],
            description: spec.goal || 'Dynamically choose and utilize tools during runtime',
            inputs: {
                agentModel: modelProvider,
                agentMessages: [
                    {
                        role: 'system',
                        content: systemInstruction
                    }
                ],
                agentTools: []
            },
            outputAnchors: [
                {
                    id: `${agentNodeId}-output-agentAgentflow`,
                    label: 'Agent',
                    name: 'agentAgentflow'
                }
            ]
        }
    }

    const nodes: AgentflowNode[] = [startNode, modelNode, agentNode]
    const edges: AgentflowEdge[] = []

    // 4. Kết nối Start -> Agent
    edges.push({
        id: `${startNodeId}-${startNodeId}-output-startAgentflow-${agentNodeId}-${agentNodeId}`,
        source: startNodeId,
        sourceHandle: `${startNodeId}-output-startAgentflow`,
        target: agentNodeId,
        targetHandle: agentNodeId,
        type: 'agentFlow',
        data: {
            sourceColor: '#7EE787',
            targetColor: '#4DD0E1',
            isHumanInput: false
        }
    })

    // 5. Kết nối Tool Nodes (nếu có trong spec)
    if (spec.tools && spec.tools.length > 0) {
        spec.tools.forEach((tool, index) => {
            const toolId = `tool_${tool.type || 'calc'}_${index}`
            const toolNode: AgentflowNode = {
                id: toolId,
                type: 'agentFlow',
                position: { x: 800, y: 150 + index * 120 },
                data: {
                    id: toolId,
                    label: tool.name || 'Công cụ',
                    name: tool.type === 'webSearch' ? 'webSearch' : 'calculator',
                    version: 1.0,
                    type: tool.type === 'webSearch' ? 'WebSearch' : 'Calculator',
                    category: 'Tools',
                    color: '#6366F1',
                    baseClasses: ['Tool'],
                    description: `Công cụ ${tool.name}`,
                    inputs: {}
                }
            }
            nodes.push(toolNode)

            // Cập nhật mảng tools của Agent node
            const currentTools = agentNode.data.inputs.agentTools as unknown[]
            currentTools.push({
                agentSelectedTool: toolNode.data.name
            })
        })
    }

    return {
        templateId: ASSISTANT_TEMPLATE_ID,
        templateVersion: ASSISTANT_TEMPLATE_VERSION,
        nodes,
        edges
    }
}
