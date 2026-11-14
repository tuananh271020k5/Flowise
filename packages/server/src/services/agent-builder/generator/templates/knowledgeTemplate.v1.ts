import { AgentSpec } from '../../types'
import { AgentflowEdge, AgentflowNode, FlowiseAgentflowGraph } from './assistantTemplate.v1'

export const KNOWLEDGE_TEMPLATE_ID = 'knowledge-flow-template'
export const KNOWLEDGE_TEMPLATE_VERSION = '1.0'

/**
 * Khởi tạo Flowise Agentflow V2 Graph từ AgentSpec theo Knowledge Template v1.0 (PH4-T03 / B-017).
 * Cấu trúc gồm: Start Node 1.4 -> Agent Node 3.2 liên kết DocumentStoreTool (retrieval thực tế) và Chat Model.
 */
export const instantiateKnowledgeTemplate = (spec: AgentSpec): FlowiseAgentflowGraph => {
    const startNodeId = 'startAgentflow_0'
    const agentNodeId = 'agentAgentflow_0'
    const docToolNodeId = 'documentStoreTool_0'

    // Lấy thông tin Document Store từ spec.dataSources
    const primaryDataSource = spec.dataSources && spec.dataSources.length > 0 ? spec.dataSources[0] : undefined
    const storeId = primaryDataSource?.id || 'fixture-docstore-company-policy'
    const storeName = primaryDataSource?.name || 'Quy chế làm việc nội bộ'

    // 1. Start Node (Phiên bản 1.4 chuẩn)
    const startNode: AgentflowNode = {
        id: startNodeId,
        type: 'agentFlow',
        position: { x: 80, y: 160 },
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

    // 2. Model Node (OpenAI / Gemini / Anthropic)
    const modelProvider = spec.modelProfileRef === 'default-builder-model' ? 'chatOpenAI' : spec.modelProfileRef || 'chatOpenAI'
    const modelNodeId = `${modelProvider}_0`
    const isGemini = modelProvider === 'chatGoogleGenerativeAI'

    const modelNode: AgentflowNode = {
        id: modelNodeId,
        type: 'agentFlow',
        position: { x: 480, y: 460 },
        data: {
            id: modelNodeId,
            label: modelProvider === 'chatOpenAI' ? 'ChatOpenAI (GPT-4o)' : modelProvider,
            name: modelProvider,
            version: isGemini ? 2.0 : 5.0,
            type: isGemini ? 'ChatGoogleGenerativeAI' : 'ChatOpenAI',
            category: 'Chat Models',
            color: isGemini ? '#4285F4' : '#10A37F',
            baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
            description: 'Mô hình ngôn ngữ xử lý suy luận và trả lời theo tài liệu',
            inputs: {
                modelName: isGemini ? 'gemini-1.5-pro' : 'gpt-4o',
                // Với RAG/Knowledge agent, hạ temperature xuống 0.2 để giảm thiểu ảo giác (hallucination)
                temperature: 0.2
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

    // 3. Document Store Tool Node (Retrieval Tool liên kết DocumentStore Flowise)
    const docStoreToolNode: AgentflowNode = {
        id: docToolNodeId,
        type: 'agentFlow',
        position: { x: 880, y: 160 },
        data: {
            id: docToolNodeId,
            label: `Kho tri thức: ${storeName}`,
            name: 'documentStoreTool',
            version: 1.0,
            type: 'DocumentStoreTool',
            category: 'Tools',
            color: '#0284C7',
            baseClasses: ['Tool', 'DynamicTool'],
            description: `Truy xuất các quy chế, điều khoản và tài liệu tham khảo từ kho "${storeName}"`,
            inputs: {
                selectedStore: storeId,
                storeName: storeName,
                description: `Tìm kiếm và trích xuất thông tin liên quan trong kho tài liệu "${storeName}"`,
                topK: 4,
                returnSourceDocuments: true
            },
            outputAnchors: [
                {
                    id: `${docToolNodeId}-output-documentStoreTool`,
                    label: 'Document Store Tool',
                    name: 'documentStoreTool'
                }
            ]
        }
    }

    // 4. Chuẩn hóa chỉ dẫn RAG: yêu cầu trích dẫn nguồn, từ chối suy diễn nếu thiếu căn cứ
    const baseInstruction =
        spec.instructions ||
        'Bạn là trợ lý AI chuyên trách giải đáp thắc mắc dựa trên kho tài liệu tri thức nội bộ được cung cấp.'
    const ragGuideline = [
        baseInstruction,
        '',
        '--- NGUYÊN TẮC HỎI ĐÁP THEO TÀI LIỆU (KNOWLEDGE RAG RULES) ---',
        '1. Luôn tra cứu và tìm kiếm thông tin bằng công cụ truy xuất tài liệu (documentStoreTool) trước khi trả lời.',
        '2. Mọi câu trả lời bắt buộc phải trích dẫn rõ nguồn gốc (tên tài liệu, điều khoản, chương mục cụ thể).',
        '3. Nếu tài liệu không chứa đủ căn cứ hoặc câu hỏi nằm ngoài phạm vi tài liệu, hãy thông báo lịch sự rằng tài liệu hiện tại không đề cập, tuyệt đối không tự bịa đặt hay suy diễn sai lệch.'
    ].join('\n')

    // 5. Agent Node (Phiên bản 3.2 chuẩn)
    const boundTools: Array<Record<string, unknown>> = [
        {
            agentSelectedTool: 'documentStoreTool',
            selectedStore: storeId
        }
    ]

    // Bổ sung các công cụ phụ nếu spec có (ví dụ calculator, webSearch)
    if (spec.tools && spec.tools.length > 0) {
        spec.tools.forEach((tool) => {
            boundTools.push({
                agentSelectedTool: tool.type === 'webSearch' ? 'webSearch' : 'calculator'
            })
        })
    }

    const agentNode: AgentflowNode = {
        id: agentNodeId,
        type: 'agentFlow',
        position: { x: 480, y: 160 },
        data: {
            id: agentNodeId,
            label: spec.name || 'Knowledge Assistant',
            name: 'agentAgentflow',
            version: 3.2,
            type: 'Agent',
            category: 'Agent Flows',
            color: '#4DD0E1',
            baseClasses: ['Agent'],
            description: spec.goal || 'Knowledge RAG retrieval agent',
            inputs: {
                agentModel: modelProvider,
                agentMessages: [
                    {
                        role: 'system',
                        content: ragGuideline
                    }
                ],
                agentTools: boundTools
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

    const nodes: AgentflowNode[] = [startNode, modelNode, docStoreToolNode, agentNode]
    const edges: AgentflowEdge[] = []

    // 6. Cạnh kết nối Start -> Agent
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

    // Bổ sung tool nodes phụ nếu có trong spec
    if (spec.tools && spec.tools.length > 0) {
        spec.tools.forEach((tool, index) => {
            const extraToolId = `tool_${tool.type || 'calc'}_${index}`
            const extraToolNode: AgentflowNode = {
                id: extraToolId,
                type: 'agentFlow',
                position: { x: 880, y: 280 + index * 120 },
                data: {
                    id: extraToolId,
                    label: tool.name || 'Công cụ phụ trợ',
                    name: tool.type === 'webSearch' ? 'webSearch' : 'calculator',
                    version: 1.0,
                    type: tool.type === 'webSearch' ? 'WebSearch' : 'Calculator',
                    category: 'Tools',
                    color: '#6366F1',
                    baseClasses: ['Tool'],
                    description: `Công cụ phụ ${tool.name}`,
                    inputs: {}
                }
            }
            nodes.push(extraToolNode)
        })
    }

    return {
        templateId: KNOWLEDGE_TEMPLATE_ID,
        templateVersion: KNOWLEDGE_TEMPLATE_VERSION,
        nodes,
        edges
    }
}
