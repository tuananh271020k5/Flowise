import { AgentSpec } from '../../types'
import { AgentflowEdge, AgentflowNode, FlowiseAgentflowGraph } from './assistantTemplate.v1'

export const SQL_TEMPLATE_ID = 'sql-flow-template'
export const SQL_TEMPLATE_VERSION = '1.0'

/**
 * Khởi tạo Flowise Agentflow V2 Graph từ AgentSpec theo SQL Readonly Template v1.0 (PH6-T07).
 * Cấu trúc gồm: Start Node 1.4 -> Agent Node 3.2 liên kết CustomTool (SQL Readonly Query) và Chat Model.
 */
export const instantiateSqlTemplate = (spec: AgentSpec): FlowiseAgentflowGraph => {
    const startNodeId = 'startAgentflow_0'
    const agentNodeId = 'agentAgentflow_0'
    const sqlToolNodeId = 'customTool_0'

    const sqlConfig = spec.sqlConfig
    const dbName = sqlConfig?.databaseName || 'sales_mart'
    const allowedTables = sqlConfig?.allowedTables && sqlConfig.allowedTables.length > 0
        ? sqlConfig.allowedTables
        : ['orders', 'customers']
    const rowLimit = sqlConfig?.rowLimit || 50

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
            description: 'Mô hình ngôn ngữ phân tích yêu cầu và sinh câu truy vấn SQL an toàn',
            inputs: {
                modelName: isGemini ? 'gemini-1.5-pro' : 'gpt-4o',
                temperature: 0.1 // Thấp để đảm bảo tính tất định và cú pháp SQL chuẩn xác
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

    // 3. CustomTool Node (SQL Readonly Query Executor)
    const sqlToolNode: AgentflowNode = {
        id: sqlToolNodeId,
        type: 'agentFlow',
        position: { x: 880, y: 160 },
        data: {
            id: sqlToolNodeId,
            label: `SQL: ${dbName}`,
            name: 'customTool',
            version: 3.0,
            type: 'CustomTool',
            category: 'Tools',
            color: '#8B5CF6',
            baseClasses: ['CustomTool', 'Tool', 'StructuredTool'],
            description: `Thực thi truy vấn SQL Readonly trên database ${dbName}`,
            inputs: {
                selectedTool: 'sql_executor_readonly',
                returnDirect: false
            },
            outputAnchors: [
                {
                    id: `${sqlToolNodeId}-output-customTool`,
                    label: 'Custom Tool',
                    name: 'customTool'
                }
            ]
        }
    }

    // 4. Chuẩn hóa chỉ dẫn an toàn SQL Readonly (Safety Guidelines)
    const baseInstruction = spec.instructions || 'Bạn là trợ lý AI chuyên gia phân tích dữ liệu và báo cáo qua cơ sở dữ liệu SQL.'
    const sqlGuideline = [
        baseInstruction,
        '',
        '--- NGUYÊN TẮC AN TOÀN TRUY VẤN CƠ SỞ DỮ LIỆU (SQL READONLY RULES) ---',
        '1. BẮT BUỘC CHỈ SỬ DỤNG câu lệnh truy vấn đọc: SELECT hoặc WITH ... SELECT.',
        '2. NGHIÊM CẤM TUYỆT ĐỐI các thao tác thay đổi hoặc phá hủy dữ liệu/cấu trúc: DROP, TRUNCATE, ALTER, CREATE, INSERT, UPDATE, DELETE, GRANT, REVOKE.',
        `3. DANH SÁCH BẢNG ĐƯỢC PHÉP TRUY VẤN: [${allowedTables.join(', ')}]. Tuyệt đối không truy vấn các bảng khác hoặc bảng hệ thống.`,
        `4. GIỚI HẠN SỐ DÒNG: Mọi truy vấn phải có mệnh đề LIMIT tối đa ${rowLimit} dòng để tránh quá tải tài nguyên.`,
        '5. Khi trình bày kết quả, hãy giải thích ý nghĩa các chỉ số và định dạng dữ liệu dưới dạng bảng Markdown tiếng Việt rõ ràng, mạch lạc.'
    ].join('\n')

    // 5. Agent Node (Phiên bản 3.2 chuẩn)
    const boundTools: Array<Record<string, unknown>> = [
        {
            agentSelectedTool: 'customTool',
            toolName: 'sql_executor_readonly',
            allowedTables: allowedTables,
            rowLimit: rowLimit
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
            label: spec.name || 'SQL Readonly Analyst',
            name: 'agentAgentflow',
            version: 3.2,
            type: 'Agent',
            category: 'Agent Flows',
            color: '#4DD0E1',
            baseClasses: ['Agent'],
            description: spec.goal || 'SQL Readonly data analytics agent',
            inputs: {
                agentModel: modelProvider,
                agentMessages: [
                    {
                        role: 'system',
                        content: sqlGuideline
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
            source: sqlToolNodeId,
            sourceHandle: `${sqlToolNodeId}-output-customTool`,
            target: agentNodeId,
            targetHandle: `${agentNodeId}-input-agentTools-Tool`,
            id: `${sqlToolNodeId}-${agentNodeId}`,
            type: 'agentFlow'
        }
    ]

    return {
        templateId: SQL_TEMPLATE_ID,
        templateVersion: SQL_TEMPLATE_VERSION,
        nodes: [startNode, modelNode, sqlToolNode, agentNode],
        edges
    }
}
