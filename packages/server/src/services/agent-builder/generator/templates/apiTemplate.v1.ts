import { AgentSpec } from '../../types'
import { AgentflowEdge, AgentflowNode, FlowiseAgentflowGraph } from './assistantTemplate.v1'

export const API_TEMPLATE_ID = 'api-flow-template'
export const API_TEMPLATE_VERSION = '1.0'

/**
 * Khởi tạo Flowise Agentflow V2 Graph từ AgentSpec theo API Readonly Template v1.0 (PH6-T03).
 * Cấu trúc gồm: Start Node 1.4 -> Agent Node 3.2 liên kết RequestsGet (hoặc CustomTool) và Chat Model.
 */
export const instantiateApiTemplate = (spec: AgentSpec): FlowiseAgentflowGraph => {
    const startNodeId = 'startAgentflow_0'
    const agentNodeId = 'agentAgentflow_0'
    const apiToolNodeId = 'requestsGet_0'

    // Lấy thông tin API connector từ spec.apiConnectors
    const primaryConnector = spec.apiConnectors && spec.apiConnectors.length > 0 ? spec.apiConnectors[0] : undefined
    const connectorName = primaryConnector?.name || 'Dịch vụ API bên ngoài'
    const baseUrl = primaryConnector?.baseUrl || 'https://api.openweathermap.org/data/2.5'

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
            description: 'Mô hình ngôn ngữ xử lý phân tích và gọi công cụ API',
            inputs: {
                modelName: isGemini ? 'gemini-1.5-pro' : 'gpt-4o',
                temperature: 0.1 // Thấp để đảm bảo gọi chính xác tham số API
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

    // 3. RequestsGet Tool Node (Công cụ gọi HTTP GET an toàn)
    const apiToolNode: AgentflowNode = {
        id: apiToolNodeId,
        type: 'agentFlow',
        position: { x: 880, y: 160 },
        data: {
            id: apiToolNodeId,
            label: `API: ${connectorName}`,
            name: 'requestsGet',
            version: 2.0,
            type: 'RequestsGet',
            category: 'Tools',
            color: '#3B82F6',
            baseClasses: ['RequestsGet', 'Tool'],
            description: `Truy vấn dữ liệu thời gian thực từ ${connectorName}`,
            inputs: {
                requestsGetUrl: baseUrl,
                requestsGetName: `api_${primaryConnector?.connectorId || 'requests_get'}`,
                requestsGetDescription: `Gửi yêu cầu HTTP GET đến ${connectorName} (${baseUrl}) để lấy thông tin.`
            },
            outputAnchors: [
                {
                    id: `${apiToolNodeId}-output-requestsGet`,
                    label: 'Requests Get',
                    name: 'requestsGet'
                }
            ]
        }
    }

    // 4. Chuẩn hóa chỉ dẫn an toàn API Readonly
    const baseInstruction = spec.instructions || 'Bạn là trợ lý AI chuyên trách tra cứu thông tin qua dịch vụ API được tích hợp.'
    const apiGuideline = [
        baseInstruction,
        '',
        '--- NGUYÊN TẮC AN TOÀN TRUY VẤN API (API READONLY RULES) ---',
        '1. Chỉ sử dụng công cụ requestsGet để lấy dữ liệu từ các endpoints được cấp quyền; không tự bịa đặt tham số hay dữ liệu trả về.',
        '2. Chế độ hoạt động là READONLY: Tuyệt đối từ chối và cảnh báo nếu người dùng yêu cầu thực hiện thao tác xóa, cập nhật hoặc thay đổi dữ liệu.',
        '3. Nếu dịch vụ API bên ngoài trả về lỗi hoặc timeout, hãy thông báo lịch sự cho người dùng về trạng thái dịch vụ.'
    ].join('\n')

    // 5. Agent Node (Phiên bản 3.2 chuẩn)
    const boundTools: Array<Record<string, unknown>> = [
        {
            agentSelectedTool: 'requestsGet',
            baseUrl: baseUrl
        }
    ]

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
            label: spec.name || 'API Readonly Assistant',
            name: 'agentAgentflow',
            version: 3.2,
            type: 'Agent',
            category: 'Agent Flows',
            color: '#4DD0E1',
            baseClasses: ['Agent'],
            description: spec.goal || 'API Readonly agentflow agent',
            inputs: {
                agentModel: modelProvider,
                agentMessages: [
                    {
                        role: 'system',
                        content: apiGuideline
                    }
                ],
                agentTools: boundTools
            },
            inputAnchors: [
                {
                    id: `${agentNodeId}-input-startAgentflow-Start`,
                    label: 'Start',
                    name: 'startAgentflow',
                    type: 'Start'
                },
                {
                    id: `${agentNodeId}-input-agentModel-BaseChatModel`,
                    label: 'Model',
                    name: 'agentModel',
                    type: 'BaseChatModel'
                },
                {
                    id: `${agentNodeId}-input-agentTools-Tool`,
                    label: 'Tools',
                    name: 'agentTools',
                    type: 'Tool',
                    list: true
                }
            ],
            outputAnchors: [
                {
                    id: `${agentNodeId}-output-agentAgentflow`,
                    label: 'Agent',
                    name: 'agentAgentflow'
                }
            ]
        }
    }

    // 6. Định nghĩa Edges
    const edges: AgentflowEdge[] = [
        {
            source: startNodeId,
            sourceHandle: `${startNodeId}-output-startAgentflow`,
            target: agentNodeId,
            targetHandle: `${agentNodeId}-input-startAgentflow-Start`,
            id: `${startNodeId}-${agentNodeId}`,
            type: 'agentFlow'
        },
        {
            source: modelNodeId,
            sourceHandle: `${modelNodeId}-output-${modelProvider}`,
            target: agentNodeId,
            targetHandle: `${agentNodeId}-input-agentModel-BaseChatModel`,
            id: `${modelNodeId}-${agentNodeId}`,
            type: 'agentFlow'
        },
        {
            source: apiToolNodeId,
            sourceHandle: `${apiToolNodeId}-output-requestsGet`,
            target: agentNodeId,
            targetHandle: `${agentNodeId}-input-agentTools-Tool`,
            id: `${apiToolNodeId}-${agentNodeId}`,
            type: 'agentFlow'
        }
    ]

    return {
        templateId: API_TEMPLATE_ID,
        templateVersion: API_TEMPLATE_VERSION,
        nodes: [startNode, modelNode, apiToolNode, agentNode],
        edges
    }
}
