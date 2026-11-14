import { AgentflowEdge, AgentflowNode } from './templates/assistantTemplate.v1'
import { AgentPlan, validateAgentPlan } from './agentPlan'
import { ALLOWED_AGENTFLOW_NODES, validateNodeMetadata } from './nodeRegistry'

export interface CompiledFlowGraph {
    templateId: string
    templateVersion: string
    planId: string
    nodes: AgentflowNode[]
    edges: AgentflowEdge[]
    viewport: {
        x: number
        y: number
        zoom: number
    }
    flowConfig: {
        chatflowType: 'AGENTFLOW'
        name: string
        description: string
        category?: string
    }
}

/**
 * Bộ biên dịch tất định (Deterministic Compiler) chuyển đổi từ AgentPlan sang
 * cấu trúc đồ thị Flowise Agentflow V2 hoàn chỉnh mà không cần dựa vào LLM (PH2-T04).
 */
export class AgentflowCompiler {
    /**
     * Biên dịch AgentPlan thành CompiledFlowGraph hoàn chỉnh và ổn định.
     */
    compile(plan: AgentPlan): CompiledFlowGraph {
        // 1. Thẩm định tính hợp lệ của Plan trước khi biên dịch
        const planValidation = validateAgentPlan(plan)
        if (!planValidation.valid) {
            throw new Error(`AgentPlan không hợp lệ: ${planValidation.errors.join('; ')}`)
        }

        const nodes: AgentflowNode[] = []
        const edges: AgentflowEdge[] = []

        const startNodeId = 'startAgentflow_0'
        const agentNodeId = 'agentAgentflow_0'

        // 2. Sinh Start Node (Phiên bản 1.4 chuẩn theo runtime)
        const startMeta = ALLOWED_AGENTFLOW_NODES.startAgentflow
        const startNode: AgentflowNode = {
            id: startNodeId,
            type: 'agentFlow',
            position: { x: 80, y: 160 },
            data: {
                id: startNodeId,
                label: startMeta.label,
                name: startMeta.name,
                version: startMeta.recommendedVersion,
                type: startMeta.type,
                category: startMeta.category,
                color: startMeta.color,
                hideInput: true,
                baseClasses: [...startMeta.baseClasses],
                description: startMeta.description,
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
        nodes.push(startNode)

        // 3. Sinh Model Node từ capability binding
        const modelBinding = plan.capabilityBindings.find((c) => c.type === 'model')
        const modelNodeName = modelBinding?.nodeName || 'chatOpenAI'
        const modelMeta = ALLOWED_AGENTFLOW_NODES[modelNodeName] || ALLOWED_AGENTFLOW_NODES.chatOpenAI
        const modelNodeId = `${modelNodeName}_0`

        const modelNode: AgentflowNode = {
            id: modelNodeId,
            type: 'agentFlow',
            position: { x: 480, y: 460 },
            data: {
                id: modelNodeId,
                label: modelMeta.label,
                name: modelMeta.name,
                version: modelMeta.recommendedVersion,
                type: modelMeta.type,
                category: modelMeta.category,
                color: modelMeta.color,
                baseClasses: [...modelMeta.baseClasses],
                description: modelMeta.description,
                inputs: {
                    modelName: (modelBinding?.config?.modelName as string) || 'gpt-4o',
                    temperature: (modelBinding?.config?.temperature as number) || 0.7
                },
                outputAnchors: [
                    {
                        id: `${modelNodeId}-output-${modelMeta.name}`,
                        label: modelMeta.label,
                        name: modelMeta.name
                    }
                ]
            }
        }
        nodes.push(modelNode)

        // 4. Sinh Tool Nodes từ capability bindings
        const toolBindings = plan.capabilityBindings.filter((c) => c.type === 'tool')
        const boundToolsForAgent: Array<{ agentSelectedTool: string }> = []

        toolBindings.forEach((toolBind, index) => {
            const toolMeta = ALLOWED_AGENTFLOW_NODES[toolBind.nodeName] || ALLOWED_AGENTFLOW_NODES.calculator
            const toolNodeId = `tool_${toolMeta.name}_${index}`

            const toolNode: AgentflowNode = {
                id: toolNodeId,
                type: 'agentFlow',
                position: { x: 880, y: 120 + index * 140 },
                data: {
                    id: toolNodeId,
                    label: toolMeta.label,
                    name: toolMeta.name,
                    version: toolMeta.recommendedVersion,
                    type: toolMeta.type,
                    category: toolMeta.category,
                    color: toolMeta.color,
                    baseClasses: [...toolMeta.baseClasses],
                    description: toolMeta.description,
                    inputs: {}
                }
            }
            nodes.push(toolNode)
            boundToolsForAgent.push({ agentSelectedTool: toolMeta.name })
        })

        // 5. Sinh Agent Node (Phiên bản 3.2 chuẩn)
        const agentMeta = ALLOWED_AGENTFLOW_NODES.agentAgentflow
        const systemInstruction = plan.spec.instructions || 'Bạn là trợ lý AI thông minh, hỗ trợ người dùng bằng tiếng Việt chuẩn mực.'
        const agentNode: AgentflowNode = {
            id: agentNodeId,
            type: 'agentFlow',
            position: { x: 480, y: 160 },
            data: {
                id: agentNodeId,
                label: plan.spec.name || 'Trợ lý AI',
                name: agentMeta.name,
                version: agentMeta.recommendedVersion,
                type: agentMeta.type,
                category: agentMeta.category,
                color: agentMeta.color,
                baseClasses: [...agentMeta.baseClasses],
                description: plan.spec.goal || agentMeta.description,
                inputs: {
                    agentModel: modelMeta.name,
                    agentMessages: [
                        {
                            role: 'system',
                            content: systemInstruction
                        }
                    ],
                    agentTools: boundToolsForAgent
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
        nodes.push(agentNode)

        // 6. Sinh Edges deterministic
        edges.push({
            id: `${startNodeId}-${startNodeId}-output-startAgentflow-${agentNodeId}-${agentNodeId}`,
            source: startNodeId,
            sourceHandle: `${startNodeId}-output-startAgentflow`,
            target: agentNodeId,
            targetHandle: agentNodeId,
            type: 'agentFlow',
            data: {
                sourceColor: startMeta.color,
                targetColor: agentMeta.color,
                isHumanInput: false
            }
        })

        // 7. Thẩm định toàn bộ nodes sinh ra qua Node Registry Whitelist
        for (const node of nodes) {
            const validation = validateNodeMetadata({
                name: node.data.name,
                version: node.data.version,
                type: node.data.type,
                inputs: node.data.inputs
            })
            if (!validation.valid) {
                throw new Error(`Compiler sinh ra node không hợp lệ (${node.id}): ${validation.errors.join('; ')}`)
            }
        }

        return {
            templateId: plan.templateId,
            templateVersion: plan.templateVersion,
            planId: plan.id,
            nodes,
            edges,
            viewport: {
                x: 0,
                y: 0,
                zoom: 0.85
            },
            flowConfig: {
                chatflowType: 'AGENTFLOW',
                name: plan.spec.name,
                description: plan.spec.goal,
                category: 'Agent Flows'
            }
        }
    }
}

export default new AgentflowCompiler()
