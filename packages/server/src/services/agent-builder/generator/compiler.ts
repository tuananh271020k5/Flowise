import { AgentflowEdge, AgentflowNode } from './templates/assistantTemplate.v1'
import { AgentPlan, validateAgentPlan } from './agentPlan'
import { ALLOWED_AGENTFLOW_NODES } from './nodeRegistry'
import { agentIdentity } from '../agentBehaviorPolicy'
import { compileWorkflow } from './compileWorkflow'

export interface CompiledFlowGraph {
    templateId: string
    templateVersion: string
    planId: string
    nodes: AgentflowNode[]
    edges: AgentflowEdge[]
    viewport: { x: number; y: number; zoom: number }
    flowConfig: { chatflowType: 'AGENTFLOW'; name: string; description: string; category?: string }
}

// V2 models/tools are nested configuration of Agent, not execution nodes.
export class AgentflowCompiler {
    compile(plan: AgentPlan): CompiledFlowGraph {
        const validation = validateAgentPlan(plan)
        if (!validation.valid) throw new Error(`AgentPlan không hợp lệ: ${validation.errors.join('; ')}`)
        if (plan.spec.workflow) return compileWorkflow(plan)
        const model = plan.capabilityBindings.find((binding) => binding.type === 'model')
        const dataSources = plan.capabilityBindings.filter((binding) => binding.type === 'datasource')
        const tools = plan.capabilityBindings.filter((binding) => binding.type === 'tool')
        const startId = 'startAgentflow_0'
        const agentId = 'agentAgentflow_0'
        const node = (name: string, id: string, inputs: Record<string, unknown>, x: number): AgentflowNode => {
            const meta = ALLOWED_AGENTFLOW_NODES[name]
            return {
                id,
                type: 'agentFlow',
                position: { x, y: 160 },
                data: {
                    id,
                    name,
                    label: name === 'agentAgentflow' ? plan.spec.name : meta.label,
                    type: meta.type,
                    version: meta.recommendedVersion,
                    category: meta.category,
                    color: meta.color,
                    baseClasses: [...meta.baseClasses],
                    description: meta.description,
                    inputs,
                    inputParams: [],
                    inputAnchors: [],
                    outputAnchors: [{ id: `${id}-output-${name}`, label: meta.label, name }]
                }
            }
        }
        let instructions = `${agentIdentity(plan.spec.name)}\n\nHướng dẫn của chủ Agent:\n${plan.spec.instructions}\n\nMục tiêu: ${
            plan.spec.goal
        }\nNgôn ngữ: ${plan.spec.language}`
        if (plan.spec.outputExpectations?.length) instructions += '\nYêu cầu đầu ra: ' + plan.spec.outputExpectations.join('; ')
        if (dataSources.length)
            instructions +=
                '\nNGUYÊN TẮC HỎI ĐÁP THEO TÀI LIỆU: Chỉ trả lời dựa trên tài liệu được truy xuất. Trích dẫn nguồn; thiếu bằng chứng thì nói rõ, không tự tạo nguồn.'
        if (plan.spec.kind === 'api-readonly')
            instructions += '\nAPI READONLY RULES: Chỉ đọc dữ liệu qua các công cụ đã cấp; không thực hiện thao tác ghi.'
        if (plan.spec.sqlConfig)
            instructions += `\nSQL READONLY RULES: Chỉ SELECT trên bảng ${plan.spec.sqlConfig.allowedTables.join(', ')}, tối đa ${
                plan.spec.sqlConfig.rowLimit || 50
            } dòng. Không ghi hay sửa schema.`
        const nodes = [
            node(
                'startAgentflow',
                startId,
                { startInputType: 'chatInput', startEphemeralMemory: false, startState: [], startPersistState: false },
                80
            ),
            node(
                'agentAgentflow',
                agentId,
                {
                    agentModel: model?.nodeName || 'chatOpenAI',
                    agentModelConfig: { ...model?.config, streaming: false, temperature: model?.config?.temperature ?? 0.3 },
                    agentMessages: [{ role: 'system', content: instructions }],
                    agentTools: tools.map((tool) => ({
                        agentSelectedTool: tool.nodeName,
                        agentSelectedToolConfig: { ...tool.config },
                        agentSelectedToolRequiresHumanInput: false
                    })),
                    agentKnowledgeDocumentStores: dataSources.map((source) => ({
                        documentStore: source.config?.selectedStore,
                        docStoreDescription: source.config?.storeName || 'Tra cứu tài liệu',
                        returnSourceDocuments: true
                    })),
                    agentKnowledgeVSEmbeddings: [],
                    agentEnableMemory: true,
                    agentMemoryType: 'allMessages',
                    // V2 memory already includes the current question; an extra message duplicates it.
                    agentUserMessage: '',
                    agentReturnResponseAs: 'userMessage',
                    agentMaxIterations: 5
                },
                480
            )
        ]
        return {
            templateId: plan.templateId,
            templateVersion: plan.templateVersion,
            planId: plan.id,
            nodes,
            edges: [
                {
                    id: `${startId}-${agentId}`,
                    source: startId,
                    sourceHandle: `${startId}-output-startAgentflow`,
                    target: agentId,
                    targetHandle: agentId,
                    type: 'agentFlow'
                }
            ],
            viewport: { x: 0, y: 0, zoom: 0.85 },
            flowConfig: { chatflowType: 'AGENTFLOW', name: plan.spec.name, description: plan.spec.goal }
        }
    }
}
export default new AgentflowCompiler()
