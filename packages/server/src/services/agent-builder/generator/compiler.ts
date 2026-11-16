import { AgentflowEdge, AgentflowNode } from './templates/assistantTemplate.v1'
import { KNOWLEDGE_TEMPLATE_ID } from './templates/knowledgeTemplate.v1'
import { API_TEMPLATE_ID } from './templates/apiTemplate.v1'
import { SQL_TEMPLATE_ID } from './templates/sqlTemplate.v1'
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

        // 4. Sinh Tool Nodes và DataSource Nodes từ capability bindings
        const toolBindings = plan.capabilityBindings.filter((c) => c.type === 'tool')
        const dsBindings = plan.capabilityBindings.filter((c) => c.type === 'datasource')
        const boundToolsForAgent: Array<{ agentSelectedTool: string; selectedStore?: string }> = []

        // 4a. Sinh Document Store Tool nodes (nếu có datasource capability)
        dsBindings.forEach((dsBind, index) => {
            const dsMeta = ALLOWED_AGENTFLOW_NODES[dsBind.nodeName] || ALLOWED_AGENTFLOW_NODES.documentStoreTool
            const dsNodeId = `documentStoreTool_${index}`
            const storeName = (dsBind.config?.storeName as string) || 'Kho tài liệu'
            const selectedStore = (dsBind.config?.selectedStore as string) || 'default-docstore'

            const dsNode: AgentflowNode = {
                id: dsNodeId,
                type: 'agentFlow',
                position: { x: 880, y: 120 + index * 140 },
                data: {
                    id: dsNodeId,
                    label: `Kho tri thức: ${storeName}`,
                    name: dsMeta.name,
                    version: dsMeta.recommendedVersion,
                    type: dsMeta.type,
                    category: dsMeta.category,
                    color: dsMeta.color,
                    baseClasses: [...dsMeta.baseClasses],
                    description: `Truy xuất thông tin từ kho tài liệu ${storeName}`,
                    inputs: {
                        selectedStore,
                        storeName,
                        description: `Truy xuất các quy chế, điều khoản và tài liệu từ ${storeName}`,
                        topK: (dsBind.config?.topK as number) || 4,
                        returnSourceDocuments: true
                    },
                    outputAnchors: [
                        {
                            id: `${dsNodeId}-output-${dsMeta.name}`,
                            label: dsMeta.label,
                            name: dsMeta.name
                        }
                    ]
                }
            }
            nodes.push(dsNode)
            boundToolsForAgent.push({ agentSelectedTool: dsMeta.name, selectedStore })
        })

        // 4b. Sinh Extra Tool nodes
        toolBindings.forEach((toolBind, index) => {
            const toolMeta = ALLOWED_AGENTFLOW_NODES[toolBind.nodeName] || ALLOWED_AGENTFLOW_NODES.calculator
            const toolNodeId = `tool_${toolMeta.name}_${index}`
            const yOffset = 120 + (dsBindings.length + index) * 140

            const toolInputs: Record<string, unknown> = { ...(toolBind.config || {}) }
            if (toolMeta.name === 'requestsGet') {
                toolInputs.requestsGetUrl = toolBind.config?.requestsGetUrl || 'https://api.openweathermap.org/data/2.5'
                toolInputs.requestsGetName = toolBind.config?.requestsGetName || 'requests_get'
                toolInputs.requestsGetDescription = toolBind.config?.requestsGetDescription || 'Thực thi truy vấn HTTP GET'
            } else if (toolMeta.name === 'customTool') {
                toolInputs.selectedTool = toolBind.config?.selectedTool || 'default-tool'
                delete toolInputs.databaseName
                delete toolInputs.allowedTables
                delete toolInputs.rowLimit
            }

            const toolNode: AgentflowNode = {
                id: toolNodeId,
                type: 'agentFlow',
                position: { x: 880, y: yOffset },
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
                    inputs: toolInputs
                }
            }
            nodes.push(toolNode)
            boundToolsForAgent.push({ agentSelectedTool: toolMeta.name })
        })

        // 5. Sinh Agent Node (Phiên bản 3.2 chuẩn)
        const agentMeta = ALLOWED_AGENTFLOW_NODES.agentAgentflow
        let systemInstruction = plan.spec.instructions || 'Bạn là trợ lý AI thông minh, hỗ trợ người dùng bằng tiếng Việt chuẩn mực.'
        if (plan.templateId === KNOWLEDGE_TEMPLATE_ID || dsBindings.length > 0) {
            systemInstruction += [
                '',
                '',
                '--- NGUYÊN TẮC HỎI ĐÁP THEO TÀI LIỆU (KNOWLEDGE RAG RULES) ---',
                '1. Luôn tra cứu và tìm kiếm thông tin bằng công cụ truy xuất tài liệu (documentStoreTool) trước khi trả lời.',
                '2. Mọi câu trả lời bắt buộc phải trích dẫn rõ nguồn gốc (tên tài liệu, điều khoản, chương mục cụ thể).',
                '3. Nếu tài liệu không chứa đủ căn cứ hoặc câu hỏi nằm ngoài phạm vi tài liệu, hãy thông báo lịch sự rằng tài liệu hiện tại không đề cập, tuyệt đối không tự bịa đặt hay suy diễn sai lệch.'
            ].join('\n')
        } else if (plan.templateId === API_TEMPLATE_ID) {
            systemInstruction += [
                '',
                '',
                '--- NGUYÊN TẮC AN TOÀN TRUY VẤN API (API READONLY RULES) ---',
                '1. Chỉ sử dụng công cụ requestsGet để lấy dữ liệu từ các endpoints được cấp quyền; không tự bịa đặt tham số hay dữ liệu trả về.',
                '2. Chế độ hoạt động là READONLY: Tuyệt đối từ chối và cảnh báo nếu người dùng yêu cầu thực hiện thao tác xóa, cập nhật hoặc thay đổi dữ liệu.',
                '3. Nếu dịch vụ API bên ngoài trả về lỗi hoặc timeout, hãy thông báo lịch sự cho người dùng về trạng thái dịch vụ.'
            ].join('\n')
        } else if (plan.templateId === SQL_TEMPLATE_ID) {
            const sqlCfg = plan.spec.sqlConfig
            const allowedTables = sqlCfg?.allowedTables || ['orders', 'customers']
            const rowLimit = sqlCfg?.rowLimit || 50
            systemInstruction += [
                '',
                '',
                '--- NGUYÊN TẮC AN TOÀN TRUY VẤN CƠ SỞ DỮ LIỆU (SQL READONLY RULES) ---',
                '1. BẮT BUỘC CHỈ SỬ DỤNG câu lệnh truy vấn đọc: SELECT hoặc WITH ... SELECT.',
                '2. NGHIÊM CẤM TUYỆT ĐỐI các thao tác thay đổi hoặc phá hủy dữ liệu/cấu trúc: DROP, TRUNCATE, ALTER, CREATE, INSERT, UPDATE, DELETE, GRANT, REVOKE.',
                `3. DANH SÁCH BẢNG ĐƯỢC PHÉP TRUY VẤN: [${allowedTables.join(', ')}]. Tuyệt đối không truy vấn các bảng khác hoặc bảng hệ thống.`,
                `4. GIỚI HẠN SỐ DÒNG: Mọi truy vấn phải có mệnh đề LIMIT tối đa ${rowLimit} dòng để tránh quá tải tài nguyên.`,
                '5. Khi trình bày kết quả, hãy giải thích ý nghĩa các chỉ số và định dạng dữ liệu dưới dạng bảng Markdown tiếng Việt rõ ràng, mạch lạc.'
            ].join('\n')
        }
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
