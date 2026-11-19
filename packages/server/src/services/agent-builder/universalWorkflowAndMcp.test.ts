jest.mock('./modelSettingsService', () => ({ __esModule: true, default: { getProfile: jest.fn(), getModel: jest.fn() } }))
jest.mock('./mcp/workspaceMcpRegistryService', () => {
    const actual = jest.requireActual('./mcp/workspaceMcpRegistryService')
    return {
        __esModule: true,
        ...actual,
        default: {
            listAuthorizedMcpServersForPlanner: jest.fn(),
            listWorkspaceMcpServers: jest.fn(),
            registerWorkspaceMcpServer: jest.fn(),
            refreshWorkspaceMcpServer: jest.fn(),
            deleteWorkspaceMcpServer: jest.fn()
        }
    }
})

import settings from './modelSettingsService'
import workspaceMcpRegistryService, { parseDiscoveredMcpActions } from './mcp/workspaceMcpRegistryService'
import { CollectorService } from './collectorService'
import { AGENT_ARCHETYPES, buildContextualSuggestions, detectAgentArchetypes } from './agentArchetypes'
import { WorkflowSchema, workflowProblems } from './workflow'
import { computeReadiness } from './readiness'
import { createAgentPlan } from './generator/agentPlan'
import compiler from './generator/compiler'
import { validateFlowGraph } from './generator/flowValidator'
import { prepareAgentPreview } from './agentBehaviorPolicy'
import { AgentSpec } from './types'

const baseSpec = (overrides: Partial<AgentSpec> = {}): AgentSpec => ({
    schemaVersion: '1.0',
    kind: 'knowledge',
    name: 'Trợ lý Universal V2',
    goal: 'Tự động hóa quy trình đa bước và tra cứu tài liệu tự sửa sai',
    language: 'vi',
    instructions: 'Trả lời chính xác bằng tiếng Việt dựa trên dữ liệu thực tế.',
    modelProfileRef: 'default-builder-model',
    dataSources: [{ id: 'store-rag-1', name: 'Tài liệu nội bộ', type: 'documentStore' }],
    tools: [],
    outputExpectations: [],
    evaluationExamples: [],
    policy: { visibility: 'private', allowWrite: false, executionMode: 'controlled-test' },
    ...overrides
})

describe('B-031 Universal Agentflow V2 Control Primitives & Workspace MCP Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(settings.getProfile as jest.Mock).mockResolvedValue({
            ready: true,
            modelName: 'gpt-5.4-mini',
            baseUrl: 'https://provider.example/v1',
            webSearchEnabled: false
        })
        ;(workspaceMcpRegistryService.listAuthorizedMcpServersForPlanner as jest.Mock).mockResolvedValue([])
    })

    it('compiles a full Marketplace-grade Agentic RAG workflow (ConditionAgent + Flow State + Loop) and injects model configs', () => {
        const workflow = WorkflowSchema.parse({
            summary: 'Agentic RAG tự phân loại câu hỏi, sinh truy vấn tìm kiếm và lặp tự sửa truy vấn khi tài liệu chưa khớp.',
            initialState: { query: '' },
            steps: [
                {
                    id: 'check_query',
                    type: 'conditionAgent',
                    label: 'Kiểm tra câu hỏi hợp lệ',
                    instruction: 'Phân loại xem câu hỏi có thuộc chủ đề tài liệu nội bộ hay là câu chào hỏi/ngoài lề.',
                    inputFrom: ['start'],
                    scenarios: ['Câu hỏi cần tra cứu tài liệu nội bộ', 'Câu chào hỏi hoặc ngoài phạm vi']
                },
                {
                    id: 'gen_query',
                    type: 'llm',
                    label: 'Tạo câu truy vấn tìm kiếm',
                    instruction: 'Viết câu truy vấn ngắn gọn tối ưu tìm kiếm từ câu hỏi gốc.',
                    inputFrom: ['start'],
                    updateState: 'query'
                },
                {
                    id: 'out_of_scope',
                    type: 'reply',
                    label: 'Phản hồi ngoài phạm vi',
                    instruction: 'Xin chào! Tôi chuyên hỗ trợ giải đáp theo tài liệu nội bộ đã đính kèm.'
                },
                {
                    id: 'find_docs',
                    type: 'retriever',
                    label: 'Tìm tài liệu',
                    instruction: 'Tìm các đoạn tài liệu khớp với biến query.',
                    inputFrom: ['gen_query'],
                    stateKeys: ['query'],
                    sourceIds: ['store-rag-1']
                },
                {
                    id: 'check_relevant',
                    type: 'conditionAgent',
                    label: 'Đánh giá độ liên quan',
                    instruction: 'Kiểm tra đoạn tài liệu thu được đã đủ trả lời câu hỏi gốc hay chưa.',
                    inputFrom: ['start', 'find_docs'],
                    scenarios: ['Tài liệu có thông tin liên quan để trả lời', 'Tài liệu chưa liên quan, cần viết lại câu truy vấn']
                },
                {
                    id: 'answer',
                    type: 'llm',
                    label: 'Tổng hợp câu trả lời',
                    instruction: 'Trả lời chi tiết từng bước và trích dẫn nguồn.',
                    inputFrom: ['find_docs']
                },
                {
                    id: 'rewrite_query',
                    type: 'llm',
                    label: 'Viết lại truy vấn tốt hơn',
                    instruction: 'Đổi từ khóa truy vấn khác sát nghĩa hơn để tìm lại.',
                    inputFrom: ['start', 'find_docs'],
                    updateState: ['query']
                },
                {
                    id: 'retry_search',
                    type: 'loop',
                    label: 'Quay lại Tìm tài liệu',
                    instruction: 'Lặp lại bước tìm kiếm với câu truy vấn mới.',
                    inputFrom: ['rewrite_query'],
                    loopBackTo: 'find_docs',
                    maxLoops: 3,
                    fallbackMessage: 'Đã thử tìm kiếm nhiều lần nhưng tài liệu hiện tại chưa có thông tin phù hợp.'
                }
            ],
            edges: [
                { source: 'start', target: 'check_query' },
                { source: 'check_query', target: 'gen_query', branch: '0' },
                { source: 'check_query', target: 'out_of_scope', branch: '1' },
                { source: 'gen_query', target: 'find_docs' },
                { source: 'find_docs', target: 'check_relevant' },
                { source: 'check_relevant', target: 'answer', branch: '0' },
                { source: 'check_relevant', target: 'rewrite_query', branch: '1' },
                { source: 'rewrite_query', target: 'retry_search' }
            ],
            questions: [],
            blockers: []
        })

        expect(workflowProblems(workflow)).toEqual([])
        const spec = baseSpec({ workflow })
        expect(computeReadiness(spec).buildReady).toBe(true)

        const graph = compiler.compile(createAgentPlan(spec, 'rev-agentic-rag'))
        expect(validateFlowGraph(graph)).toMatchObject({ valid: true, errors: [] })

        // Verify Start node Flow State initialization
        const startNode = graph.nodes.find((n) => n.data.name === 'startAgentflow')!
        expect(startNode.data.inputs.startState).toEqual([{ key: 'query', value: '' }])

        // Verify ConditionAgent scenarios & handles
        const checkQueryNode = graph.nodes.find((n) => n.id === 'conditionAgentAgentflow_check_query')!
        expect(checkQueryNode.data.inputs.conditionAgentScenarios).toEqual([
            { scenario: 'Câu hỏi cần tra cứu tài liệu nội bộ' },
            { scenario: 'Câu chào hỏi hoặc ngoài phạm vi' }
        ])

        // Verify Flow State write & read bindings
        const genQueryNode = graph.nodes.find((n) => n.id === 'llmAgentflow_gen_query')!
        expect(genQueryNode.data.inputs.llmUpdateState).toEqual([{ key: 'query', value: '{{ output }}' }])

        const retrieverNode = graph.nodes.find((n) => n.id === 'retrieverAgentflow_find_docs')!
        expect(retrieverNode.data.inputs.retrieverQuery).toBe('{{$flow.state.query}}')

        // Verify Loop node target format (split('-')[0] must resolve exact node ID in Loop.ts!)
        const loopNode = graph.nodes.find((n) => n.id === 'loopAgentflow_retry_search')!
        const loopBackToNode = String(loopNode.data.inputs.loopBackToNode)
        expect(loopBackToNode.split('-')[0]).toBe('retrieverAgentflow_find_docs')
        expect(loopNode.data.inputs.maxLoopCount).toBe(3)
        expect(loopNode.data.hideOutput).toBe(true)
        expect(graph.edges.filter((e) => e.source === loopNode.id)).toHaveLength(0)

        // Verify prepareAgentPreview injects workspace model config into conditionAgentAgentflow too
        const previewFlowJson = prepareAgentPreview(
            JSON.stringify(graph),
            spec.name,
            false,
            new Date('2026-11-18T00:00:00Z'),
            {
                modelName: 'gpt-5.4-mini',
                baseUrl: 'https://gateway.example/v1',
                credentialId: 'cred-123'
            },
            workflow.steps
        )
        const previewGraph = JSON.parse(previewFlowJson)
        const previewCondAgent = previewGraph.nodes.find((n: any) => n.id === 'conditionAgentAgentflow_check_query')
        expect(previewCondAgent.data.inputs.conditionAgentModel).toBe('chatOpenAI')
        expect(previewCondAgent.data.inputs.conditionAgentModelConfig).toMatchObject({
            modelName: 'gpt-5.4-mini',
            basepath: 'https://gateway.example/v1',
            FLOWISE_CREDENTIAL_ID: 'cred-123'
        })
    })

    it('rejects loopBackTo pointing to a step on another branch that does not dominate the loop', () => {
        const badLoop = {
            summary: 'Loop trỏ sang nhánh rẽ khác không hợp lệ',
            steps: [
                {
                    id: 'split',
                    type: 'condition',
                    label: 'Rẽ nhánh',
                    instruction: 'Kiểm tra rỗng',
                    inputFrom: ['start'],
                    condition: { operation: 'notEmpty' }
                },
                { id: 'left_step', type: 'llm', label: 'Nhánh trái', instruction: 'Xử lý trái', inputFrom: ['start'] },
                {
                    id: 'right_loop',
                    type: 'loop',
                    label: 'Lặp sai nhánh',
                    instruction: 'Quay lại nhánh trái',
                    inputFrom: ['start'],
                    loopBackTo: 'left_step',
                    maxLoops: 2
                }
            ],
            edges: [
                { source: 'start', target: 'split' },
                { source: 'split', target: 'left_step', branch: 'true' },
                { source: 'split', target: 'right_loop', branch: 'false' }
            ],
            questions: [],
            blockers: []
        }
        expect(workflowProblems(badLoop).join(' ')).toContain('tổ tiên')
    })

    it('compiles iteration (with child processor node), humanInput (dual approval edges), and allowlisted http steps', () => {
        const workflow = WorkflowSchema.parse({
            summary: 'Lặp danh sách mục việc, xin người dùng duyệt rồi gọi HTTP API tra cứu.',
            steps: [
                {
                    id: 'extract_items',
                    type: 'llm',
                    label: 'Tách danh sách JSON',
                    instruction: 'Trích xuất mảng JSON các mục cần xử lý.',
                    inputFrom: ['start']
                },
                {
                    id: 'map_items',
                    type: 'iteration',
                    label: 'Xử lý từng mục',
                    instruction: 'Chuẩn hóa từng mục trong danh sách.',
                    inputFrom: ['extract_items']
                },
                {
                    id: 'confirm_send',
                    type: 'humanInput',
                    label: 'Duyệt kết quả',
                    instruction: 'Bạn có đồng ý tra cứu hệ thống ngoài với danh sách đã chuẩn hóa không?',
                    inputFrom: ['map_items']
                },
                {
                    id: 'call_api',
                    type: 'http',
                    label: 'Gọi API đối chiếu',
                    instruction: 'Gọi endpoint kiểm tra trạng thái.',
                    inputFrom: ['map_items'],
                    http: { connectorId: 'conn-erp', method: 'GET', path: '/v1/status' }
                },
                {
                    id: 'cancelled',
                    type: 'reply',
                    label: 'Đã hủy thao tác',
                    instruction: 'Đã dừng thao tác theo yêu cầu của bạn.'
                }
            ],
            edges: [
                { source: 'start', target: 'extract_items' },
                { source: 'extract_items', target: 'map_items' },
                { source: 'map_items', target: 'confirm_send' },
                { source: 'confirm_send', target: 'call_api', branch: '0' },
                { source: 'confirm_send', target: 'cancelled', branch: '1' }
            ],
            questions: [],
            blockers: []
        })

        const spec = baseSpec({
            kind: 'assistant',
            dataSources: [],
            apiConnectors: [
                {
                    connectorId: 'conn-erp',
                    name: 'ERP API',
                    baseUrl: 'https://erp.example.com/api',
                    allowedOperations: ['GET /v1/status']
                }
            ],
            workflow
        })

        expect(computeReadiness(spec).buildReady).toBe(true)
        const graph = compiler.compile(createAgentPlan(spec, 'rev-iter-human-http'))
        expect(validateFlowGraph(graph)).toMatchObject({ valid: true, errors: [] })

        // Iteration container + child node
        const iterContainer = graph.nodes.find((n) => n.id === 'iterationAgentflow_map_items')!
        expect(iterContainer.type).toBe('iteration')
        const iterChild = graph.nodes.find((n) => n.parentNode === 'iterationAgentflow_map_items')!
        expect(iterChild).toBeDefined()
        expect(iterChild.extent).toBe('parent')
        expect(JSON.stringify(iterChild.data.inputs)).toContain('{{$iteration}}')

        // HumanInput edges
        const humanEdges = graph.edges.filter((e) => e.source === 'humanInputAgentflow_confirm_send')
        expect(humanEdges).toHaveLength(2)
        expect(humanEdges.every((e) => e.data?.isHumanInput === true)).toBe(true)

        // HTTP URL composition & traversal blocking
        const httpNode = graph.nodes.find((n) => n.id === 'httpAgentflow_call_api')!
        expect(httpNode.data.inputs.url).toBe('https://erp.example.com/api/v1/status')
        expect(httpNode.data.inputs.method).toBe('GET')

        const traversalSpec = baseSpec({
            ...spec,
            workflow: {
                ...workflow,
                steps: workflow.steps.map((s) =>
                    s.id === 'call_api' ? { ...s, http: { connectorId: 'conn-erp', method: 'GET', path: '../../internal/admin' } } : s
                )
            }
        })
        expect(() => compiler.compile(createAgentPlan(traversalSpec, 'rev-traversal'))).toThrow('tương đối')

        // Write method blocked when allowWrite=false
        const writeSpec = baseSpec({
            ...spec,
            workflow: {
                ...workflow,
                steps: workflow.steps.map((s) =>
                    s.id === 'call_api' ? { ...s, http: { connectorId: 'conn-erp', method: 'POST', path: '/v1/status' } } : s
                )
            }
        })
        expect(computeReadiness(writeSpec).buildReady).toBe(false)
        expect(computeReadiness(writeSpec).errors?.join(' ')).toContain('allowWrite')
    })

    it('discovers & sanitizes Workspace MCP tools, enforces workspace authorization in Collector, and binds customMcpServerTool per Agent step', async () => {
        const actions = parseDiscoveredMcpActions(
            JSON.stringify({
                tools: [
                    { name: 'google.drive/search files', description: 'Tìm file trên Google Drive\u200B' },
                    { name: 'sheets_append_row', description: 'Thêm dòng mới vào Google Sheets / Excel' }
                ]
            })
        )
        expect(actions).toEqual([
            { name: 'google_drive_search_files', description: 'Tìm file trên Google Drive' },
            { name: 'sheets_append_row', description: 'Thêm dòng mới vào Google Sheets / Excel' }
        ])
        ;(workspaceMcpRegistryService.listAuthorizedMcpServersForPlanner as jest.Mock).mockResolvedValue([
            {
                id: 'mcp-drive-1',
                name: 'Google Drive MCP',
                actions: ['google_drive_search_files'],
                description: 'google_drive_search_files'
            },
            {
                id: 'mcp-excel-2',
                name: 'Excel & Sheets MCP',
                actions: ['sheets_append_row'],
                description: 'sheets_append_row'
            }
        ])

        const invoke = jest.fn()
        ;(settings.getModel as jest.Mock).mockResolvedValue({ invoke })
        const collector = new CollectorService()

        const plannedWorkflow = {
            summary: 'Tìm tài liệu trên Google Drive rồi ghi bảng tổng hợp vào Excel/Sheets.',
            steps: [
                {
                    id: 'read_drive',
                    type: 'agent',
                    label: 'Đọc file từ Google Drive',
                    instruction: 'Dùng công cụ tìm và đọc tài liệu trên Google Drive.',
                    inputFrom: ['start'],
                    mcpServerIds: ['mcp-drive-1']
                },
                {
                    id: 'write_excel',
                    type: 'agent',
                    label: 'Ghi báo cáo vào Excel',
                    instruction: 'Tổng hợp kết quả và thêm dòng vào file bảng tính.',
                    inputFrom: ['read_drive'],
                    mcpServerIds: ['mcp-excel-2']
                }
            ],
            edges: [
                { source: 'start', target: 'read_drive' },
                { source: 'read_drive', target: 'write_excel' }
            ],
            questions: [],
            blockers: []
        }

        invoke.mockResolvedValueOnce({
            content: JSON.stringify({
                name: 'Trợ lý Drive sang Excel',
                goal: 'Đọc dữ liệu Drive và cập nhật bảng Excel',
                instructions: 'Thực hiện tuần tự từng bước và báo cáo kết quả.',
                workflow: plannedWorkflow
            })
        })

        const extracted = await collector.extractWithModel(
            'Tạo bot tìm báo cáo trên Google Drive rồi điền tóm tắt sang bảng Excel.',
            {},
            'ws-prod'
        )
        // Verify planner received availableMcpServers in workspaceSettings
        expect(invoke.mock.calls[0][0][1].content).toContain('mcp-drive-1')
        expect(invoke.mock.calls[0][0][1].content).toContain('google_drive_search_files')
        // Verify auto-populated authorized mcpServers on patch
        expect(extracted.patch.mcpServers?.map((m) => m.id)).toEqual(['mcp-drive-1', 'mcp-excel-2'])

        const fullSpec = baseSpec({
            kind: 'assistant',
            dataSources: [],
            ...extracted.patch
        })
        expect(computeReadiness(fullSpec).buildReady).toBe(true)

        const graph = compiler.compile(createAgentPlan(fullSpec, 'rev-mcp-pipeline'))
        expect(validateFlowGraph(graph)).toMatchObject({ valid: true, errors: [] })

        // Step 1 only receives Google Drive MCP tool, Step 2 only receives Excel MCP tool!
        const step1Tools = graph.nodes.find((n) => n.id === 'agentAgentflow_read_drive')!.data.inputs.agentTools as any[]
        expect(step1Tools).toEqual([
            {
                agentSelectedTool: 'customMcpServerTool',
                agentSelectedToolConfig: {
                    mcpServerId: 'mcp-drive-1',
                    mcpActions: ['google_drive_search_files']
                },
                agentSelectedToolRequiresHumanInput: false
            }
        ])

        const step2Tools = graph.nodes.find((n) => n.id === 'agentAgentflow_write_excel')!.data.inputs.agentTools as any[]
        expect(step2Tools).toEqual([
            {
                agentSelectedTool: 'customMcpServerTool',
                agentSelectedToolConfig: {
                    mcpServerId: 'mcp-excel-2',
                    mcpActions: ['sheets_append_row']
                },
                agentSelectedToolRequiresHumanInput: false
            }
        ])

        // Unauthorized/foreign MCP server ID must be rejected
        invoke.mockResolvedValueOnce({
            content: JSON.stringify({ mcpServers: ['mcp-other-workspace'] })
        })
        await expect(collector.extractWithModel('Dùng MCP trái phép', {}, 'ws-prod')).rejects.toThrow('MCP Server')
    })

    it('classifies Agent Archetypes at zero token cost and generates ChatGPT/Gemini-style proactive follow-up suggestions', () => {
        expect(AGENT_ARCHETYPES).toHaveLength(8)

        // 1. Detects RAG vs Agentic RAG vs MCP Automation vs Router Triage accurately
        expect(detectAgentArchetypes('Tạo bot hỏi đáp quy chế nhân sự từ file PDF')[0].id).toBe('knowledge_rag')
        expect(detectAgentArchetypes('Tạo Agentic RAG tự viết lại truy vấn khi tìm chưa thấy')[0].id).toBe('agentic_rag')
        expect(detectAgentArchetypes('Đọc file Google Drive rồi đồng bộ sang bảng Excel')[0].id).toBe('mcp_api_automation')
        expect(detectAgentArchetypes('Tự động phân loại ticket khách hàng khẩn cấp hay bình thường')[0].id).toBe('router_triage')

        // 2. Generates smart gap-filling suggestions without repeating already configured parts
        const ragSpec = baseSpec({
            workflow: WorkflowSchema.parse({
                summary: 'Tra cứu tài liệu nội bộ.',
                archetype: 'knowledge_rag',
                steps: [
                    { id: 'find', type: 'retriever', label: 'Tìm tài liệu', instruction: 'Tra cứu.', inputFrom: ['start'] },
                    { id: 'answer', type: 'llm', label: 'Trả lời', instruction: 'Trả lời.', inputFrom: ['start', 'find'] }
                ],
                edges: [
                    { source: 'start', target: 'find' },
                    { source: 'find', target: 'answer' }
                ]
            })
        })
        const suggestions = buildContextualSuggestions(ragSpec)
        expect(suggestions.length).toBeGreaterThanOrEqual(2)
        expect(suggestions.join(' ')).toContain('Agentic RAG')

        const collector = new CollectorService()
        const reply = collector.generateCollectorResponse([], ragSpec, ['workflow'])
        expect(reply).toContain('Phân loại Agent:')
        expect(reply).toContain('Gợi ý tinh chỉnh thêm')
        expect(reply).toContain('xong')

        // 3. Regression for 3-branch CSKH Ticket Triage: optional clarifying questions must NEVER block "xong" buildReady!
        const triageSpec = baseSpec({
            kind: 'assistant',
            name: 'Phân loại Ticket CSKH',
            goal: 'Đọc nội dung ticket khách gửi và chia thành 3 nhánh xử lý riêng',
            instructions: 'Định tuyến chính xác và phản hồi lịch sự bằng tiếng Việt.',
            dataSources: [],
            workflow: WorkflowSchema.parse({
                summary: 'Đọc nội dung ticket CSKH và định tuyến vào một trong ba nhánh xử lý chuyên trách.',
                archetype: 'router_triage',
                steps: [
                    {
                        id: 'classify_ticket',
                        type: 'conditionAgent',
                        label: 'Phân loại ticket',
                        instruction: 'Phân loại ticket khách hàng vào đúng nhóm.',
                        inputFrom: ['start'],
                        scenarios: ['Lỗi sập hệ thống khẩn cấp', 'Hỏi cách sử dụng tính năng', 'Yêu cầu xuất hóa đơn kế toán']
                    },
                    {
                        id: 'outage',
                        type: 'llm',
                        label: 'Xử lý lỗi sập hệ thống khẩn cấp',
                        instruction: 'Trấn an và ghi nhận P1.',
                        inputFrom: ['start']
                    },
                    {
                        id: 'usage',
                        type: 'llm',
                        label: 'Xử lý câu hỏi sử dụng tính năng',
                        instruction: 'Hướng dẫn thao tác.',
                        inputFrom: ['start']
                    },
                    {
                        id: 'billing',
                        type: 'llm',
                        label: 'Xử lý yêu cầu xuất hóa đơn',
                        instruction: 'Tiếp nhận thông tin MST.',
                        inputFrom: ['start']
                    }
                ],
                edges: [
                    { source: 'start', target: 'classify_ticket' },
                    { source: 'classify_ticket', target: 'outage', branch: '0' },
                    { source: 'classify_ticket', target: 'usage', branch: '1' },
                    { source: 'classify_ticket', target: 'billing', branch: '2' }
                ],
                questions: [
                    'Xác định đầu ra mong muốn của mỗi nhánh: chỉ trả nhãn phân loại hay tạo phản hồi cho khách hàng.',
                    'Xác định bộ phận và SLA tương ứng cho ba nhóm ticket.'
                ],
                blockers: []
            })
        })
        expect(workflowProblems(triageSpec.workflow)).toEqual([])
        expect(computeReadiness(triageSpec).buildReady).toBe(true)
        const triageGraph = compiler.compile(createAgentPlan(triageSpec, 'rev-triage'))
        expect(validateFlowGraph(triageGraph)).toMatchObject({ valid: true, nodeCount: 5, edgeCount: 4 })
    })

    it('binds built-in Flowise Native Tools (excelOfficeTool, wordOfficeTool, calculator...) per step and guides missing OAuth credentials', async () => {
        const invoke = jest.fn()
        ;(settings.getModel as jest.Mock).mockResolvedValue({ invoke })
        const collector = new CollectorService()

        invoke.mockResolvedValueOnce({
            content: JSON.stringify({
                name: 'Trợ lý Xuất Báo Cáo Excel & Word',
                goal: 'Tổng hợp số liệu ra bảng tính Excel và xuất biên bản Word',
                instructions: 'Tạo bảng tính và biên bản đầy đủ, gửi link tải file cho người dùng.',
                workflow: {
                    summary: 'Bước 1 lập bảng tính Excel (.xlsx), Bước 2 xuất biên bản tổng kết ra Word (.docx).',
                    steps: [
                        {
                            id: 'make_excel',
                            type: 'agent',
                            label: 'Tạo bảng tính Excel',
                            instruction: 'Dùng công cụ Excel tạo file thống kê.',
                            inputFrom: ['start'],
                            nativeTools: ['excelOfficeTool', 'calculator']
                        },
                        {
                            id: 'make_word',
                            type: 'agent',
                            label: 'Soạn văn bản Word',
                            instruction: 'Dùng công cụ Word tạo biên bản tổng hợp.',
                            inputFrom: ['make_excel'],
                            nativeTools: ['wordOfficeTool']
                        }
                    ],
                    edges: [
                        { source: 'start', target: 'make_excel' },
                        { source: 'make_excel', target: 'make_word' }
                    ],
                    questions: [],
                    blockers: []
                }
            })
        })

        const extracted = await collector.extractWithModel(
            'Tạo agent thống kê số liệu ra trang tính Excel rồi xuất thêm 1 file biên bản Word.',
            {},
            'ws-office'
        )
        expect(invoke.mock.calls[0][0][1].content).toContain('excelOfficeTool')
        expect(invoke.mock.calls[0][0][1].content).toContain('wordOfficeTool')
        expect(extracted.patch.tools?.map((t) => t.type)).toEqual(['excelOfficeTool', 'calculator', 'wordOfficeTool'])

        const readySpec = baseSpec({
            kind: 'assistant',
            dataSources: [],
            ...extracted.patch
        })
        expect(computeReadiness(readySpec).buildReady).toBe(true)

        const graph = compiler.compile(createAgentPlan(readySpec, 'rev-native-office'))
        expect(validateFlowGraph(graph)).toMatchObject({ valid: true, errors: [] })

        const step1Tools = graph.nodes.find((n) => n.id === 'agentAgentflow_make_excel')!.data.inputs.agentTools as any[]
        expect(step1Tools.map((t) => t.agentSelectedTool)).toEqual(['excelOfficeTool', 'calculator'])

        const step2Tools = graph.nodes.find((n) => n.id === 'agentAgentflow_make_word')!.data.inputs.agentTools as any[]
        expect(step2Tools.map((t) => t.agentSelectedTool)).toEqual(['wordOfficeTool'])

        // Unconfigured cloud OAuth tool (e.g. googleSheetsTool without googleSheetsOAuth2 in Credentials) blocks build with clear guidance
        invoke.mockResolvedValueOnce({
            content: JSON.stringify({
                name: 'Bot Google Sheets Cloud',
                goal: 'Ghi trực tiếp lên Google Sheets đám mây',
                instructions: 'Ghi vào Google Sheets.',
                workflow: {
                    summary: 'Đồng bộ lên Google Sheets đám mây.',
                    steps: [
                        {
                            id: 'sync_gsheet',
                            type: 'agent',
                            label: 'Ghi Google Sheets',
                            instruction: 'Thêm dòng vào Google Sheets.',
                            inputFrom: ['start'],
                            nativeTools: ['googleSheetsTool']
                        }
                    ],
                    edges: [{ source: 'start', target: 'sync_gsheet' }],
                    questions: [],
                    blockers: []
                }
            })
        })
        const cloudExtracted = await collector.extractWithModel('Ghi trực tiếp vào Google Sheets của tôi.', {}, 'ws-office')
        const cloudReadiness = computeReadiness(baseSpec({ kind: 'assistant', dataSources: [], ...cloudExtracted.patch }))
        expect(cloudReadiness.buildReady).toBe(false)
        expect(cloudReadiness.errors?.join(' ')).toContain('googleSheetsOAuth2')
    })

    it('compiles & executes the 7-module Autonomous Project Manager Agent (Memory, ScheduleBeat 17:00, ProjectTrackerTool, TelegramNotifyTool)', async () => {
        const workflow = WorkflowSchema.parse({
            summary: 'Quản lý dự án phần mềm tự động: chia task, đề xuất giao việc có xác nhận, phát hiện rủi ro và báo cáo 17h.',
            archetype: 'mcp_automation',
            enableMemory: true,
            schedule: {
                cronExpression: '0 17 * * *',
                timezone: 'Asia/Ho_Chi_Minh',
                defaultInput: 'Tổng hợp báo cáo tiến độ dự án hằng ngày lúc 17h và gửi qua Telegram',
                description: 'Báo cáo tiến độ tự động 17h00 hằng ngày'
            },
            steps: [
                {
                    id: 'pm_orchestrator',
                    type: 'agent',
                    label: 'Điều phối Dự án & Báo cáo',
                    instruction: 'Tự động phân tích yêu cầu, quản lý task, hỏi xác nhận trước khi giao việc/dời hạn và gửi báo cáo.',
                    inputFrom: ['start'],
                    nativeTools: ['projectTrackerTool', 'telegramNotifyTool', 'currentDateTime']
                }
            ],
            edges: [{ source: 'start', target: 'pm_orchestrator' }],
            questions: [],
            blockers: []
        })

        const spec = baseSpec({
            name: 'AI Quản Lý Dự Án Phần Mềm',
            kind: 'assistant',
            dataSources: [],
            tools: [
                { id: 'native_projectTrackerTool', name: 'Project Tracker', type: 'projectTrackerTool', config: {} },
                { id: 'native_telegramNotifyTool', name: 'Telegram Bot', type: 'telegramNotifyTool', config: {} },
                { id: 'native_currentDateTime', name: 'CurrentDateTime', type: 'currentDateTime', config: {} }
            ],
            workflow
        })

        expect(computeReadiness(spec).buildReady).toBe(true)
        const graph = compiler.compile(createAgentPlan(spec, 'rev-pm-autonomous'))
        expect(validateFlowGraph(graph)).toMatchObject({ valid: true, errors: [] })

        const startNode = graph.nodes.find((n) => n.id === 'startAgentflow_0')!
        expect(startNode.data.inputs.startPersistState).toBe(true)

        const agentNode = graph.nodes.find((n) => n.id === 'agentAgentflow_pm_orchestrator')!
        expect(agentNode.data.inputs.agentEnableMemory).toBe(true)
        expect(agentNode.data.inputs.agentMemoryType).toBe('windowSize')
        expect(agentNode.data.inputs.agentMemoryWindowSize).toBe(20)
        expect((agentNode.data.inputs.agentTools as any[]).map((t) => t.agentSelectedTool)).toEqual([
            'projectTrackerTool',
            'telegramNotifyTool',
            'currentDateTime'
        ])

        // Execute all 7 functional scenarios directly against the compiled tool nodes
        const prevBlobPath = process.env.BLOB_STORAGE_PATH
        const tempStorageDir = require('path').join(require('os').tmpdir(), `flowise_pm_test_${Date.now()}`)
        process.env.BLOB_STORAGE_PATH = tempStorageDir
        try {
            const {
                nodeClass: ProjectTrackerNode
            } = require('../../../../components/dist/nodes/tools/ProjectTrackerTool/ProjectTrackerTool.js')
            const {
                nodeClass: TelegramNotifyNode
            } = require('../../../../components/dist/nodes/tools/TelegramNotifyTool/TelegramNotifyTool.js')
            const wsId = `ws_pm_test_${Date.now()}`
            const pmTools: any[] = await new ProjectTrackerNode().init({ id: 'pm_node', inputs: {} }, '', { workspaceId: wsId })
            const tgTools: any[] = await new TelegramNotifyNode().init({ id: 'tg_node', inputs: {} }, '', { workspaceId: wsId })

            const byName = Object.fromEntries([...pmTools, ...tgTools].map((t) => [t.name, t]))

            // 1 & 2. Create decomposed Google Login tasks + verify anti-duplication
            const createRes1 = JSON.parse(
                await byName.pm_create_tasks.invoke({
                    projectKey: 'web_auth',
                    tasks: [
                        {
                            title: 'Thiết kế giao diện nút Đăng nhập Google',
                            description: 'Thiết kế UI/UX màn hình đăng nhập và popup OAuth',
                            priority: 'P1',
                            deadline: '2026-11-16',
                            acceptanceCriteria: ['Chuẩn guideline Google Branding', 'Responsive mobile']
                        },
                        {
                            title: 'Tích hợp Google OAuth2 & Backend JWT',
                            description: 'Xử lý callback OAuth2, xác thực id_token và cấp JWT session',
                            priority: 'P0',
                            deadline: '2026-11-19',
                            acceptanceCriteria: ['Xác thực token hợp lệ', 'Lưu user mới vào DB'],
                            dependencies: ['TASK-1']
                        },
                        {
                            title: 'Kiểm thử nghiệm thu luồng đăng nhập Google',
                            description: 'Viết E2E test cho thành công, hủy đăng nhập và token hết hạn',
                            priority: 'P1',
                            deadline: '2026-11-20',
                            acceptanceCriteria: ['Pass 100% test case E2E'],
                            dependencies: ['TASK-2']
                        }
                    ]
                })
            )
            expect(createRes1.createdCount).toBe(3)
            expect(createRes1.skippedDuplicates).toHaveLength(0)

            const dupRes = JSON.parse(
                await byName.pm_create_tasks.invoke({
                    projectKey: 'web_auth',
                    tasks: [
                        {
                            title: 'Thiết kế giao diện nút Đăng nhập Google',
                            description: 'Bị gửi trùng',
                            priority: 'P1',
                            deadline: '2026-11-16',
                            acceptanceCriteria: ['Không tạo trùng']
                        }
                    ]
                })
            )
            expect(dupRes.createdCount).toBe(0)
            expect(dupRes.skippedDuplicates).toHaveLength(1)

            // 3. Propose assignees by skill/workload & block unconfirmed assignment, then assign after confirmation
            const proposalRes = JSON.parse(await byName.pm_list_members_and_propose.invoke({ projectKey: 'web_auth' }))
            expect(proposalRes.proposedAssignments).toHaveLength(3)
            expect(proposalRes.proposedAssignments[0].recommendedAssignee).toBe('Minh Anh')
            expect(proposalRes.proposedAssignments[1].recommendedAssignee).toBe('Hoàng Nam')
            expect(proposalRes.proposedAssignments[2].recommendedAssignee).toBe('Thu Hà')

            const blockedAssign = JSON.parse(
                await byName.pm_assign_tasks.invoke({
                    projectKey: 'web_auth',
                    confirmedByUser: false,
                    assignments: [{ taskCodeOrId: 'TASK-1', assignee: 'Minh Anh' }]
                })
            )
            expect(blockedAssign.success).toBe(false)

            const okAssign = JSON.parse(
                await byName.pm_assign_tasks.invoke({
                    projectKey: 'web_auth',
                    confirmedByUser: true,
                    assignments: [
                        { taskCodeOrId: 'TASK-1', assignee: 'Minh Anh' },
                        { taskCodeOrId: 'TASK-2', assignee: 'Hoàng Nam' },
                        { taskCodeOrId: 'TASK-3', assignee: 'Thu Hà' }
                    ]
                })
            )
            expect(okAssign.assignedCount).toBe(3)

            // 4 & 5. Check progress ("Dự án đang chậm ở đâu?") & detect deadline/dependency risks
            const progressRes = JSON.parse(
                await byName.pm_check_progress_and_risks.invoke({
                    projectKey: 'web_auth',
                    referenceDate: '2026-11-18'
                })
            )
            expect(progressRes.overdueTasks.map((t: any) => t.code)).toContain('TASK-1')
            expect(progressRes.blockedTasks.map((t: any) => t.code)).toEqual(expect.arrayContaining(['TASK-2', 'TASK-3']))
            expect(progressRes.atRiskTasks.length).toBeGreaterThanOrEqual(2)

            // 7. Shift deadlines +3 days: dryRun=true first (no mutation), then dryRun=false (confirmed)
            const previewShift = JSON.parse(
                await byName.pm_shift_deadlines.invoke({
                    projectKey: 'web_auth',
                    shiftDays: 3,
                    dryRun: true
                })
            )
            expect(previewShift.applied).toBe(false)
            expect(previewShift.affectedTaskCount).toBe(3)
            expect(previewShift.impactedPlan[0]).toMatchObject({
                code: 'TASK-1',
                oldDeadline: '2026-11-16',
                newDeadline: '2026-11-19'
            })

            const appliedShift = JSON.parse(
                await byName.pm_shift_deadlines.invoke({
                    projectKey: 'web_auth',
                    shiftDays: 3,
                    dryRun: false
                })
            )
            expect(appliedShift.applied).toBe(true)
            expect(appliedShift.updatedTaskCount).toBe(3)

            // 6. Send daily 17:00 report via Telegram tool
            const tgRes = JSON.parse(
                await byName.telegram_send_report.invoke({
                    title: 'Báo cáo tiến độ dự án 17h00',
                    message: progressRes.dailyReportText
                })
            )
            expect(tgRes.success).toBe(true)
            expect(tgRes.recordedInWorkspaceOutbox).toBe(true)
        } finally {
            if (prevBlobPath === undefined) delete process.env.BLOB_STORAGE_PATH
            else process.env.BLOB_STORAGE_PATH = prevBlobPath
            require('fs').rmSync(tempStorageDir, { recursive: true, force: true })
        }
    })

    it('compiles full Flowise V1 (MULTIAGENT /agentcanvas) graph with separated nodes, Require Approval, Memory, RAG RetrieverTool, and layered auto-layout (B-034)', async () => {
        const { prepareAgentPreview } = require('./agentBehaviorPolicy')
        const workflow = WorkflowSchema.parse({
            summary: 'Hệ thống Quản lý Dự án Đa nhánh trên Flowise V1 (Sequential Agents).',
            archetype: 'mcp_automation',
            canvasVersion: 'v1',
            enableMemory: true,
            initialState: [{ key: 'projectKey', value: 'web_auth' }],
            steps: [
                {
                    id: 'route_intent',
                    type: 'conditionAgent',
                    label: 'Phân loại yêu cầu dự án',
                    instruction: 'Phân loại yêu cầu vào đúng nhánh nghiệp vụ.',
                    inputFrom: ['start'],
                    scenarios: ['Tạo và chia nhỏ task mới', 'Kiểm tra tiến độ và rủi ro', 'Dời deadline có xác nhận']
                },
                {
                    id: 'create_tasks_branch',
                    type: 'agent',
                    label: 'Phân rã & Tạo Task',
                    instruction: 'Chia nhỏ yêu cầu và tạo task chống trùng lặp, đề xuất người phụ trách.',
                    inputFrom: ['start'],
                    nativeTools: ['projectTrackerTool', 'currentDateTime']
                },
                {
                    id: 'progress_risk_branch',
                    type: 'agent',
                    label: 'Kiểm tra Tiến độ & Rủi ro',
                    instruction: 'Truy vấn task quá hạn, bị chặn, phát hiện rủi ro và gửi báo cáo.',
                    inputFrom: ['start'],
                    nativeTools: ['projectTrackerTool', 'telegramNotifyTool'],
                    sourceIds: ['store-pm-1']
                },
                {
                    id: 'approve_shift',
                    type: 'humanInput',
                    label: 'Duyệt dời deadline',
                    instruction: 'Trình phương án dời deadline +3 ngày và chờ phê duyệt.',
                    inputFrom: ['start']
                },
                {
                    id: 'shift_deadline_branch',
                    type: 'agent',
                    label: 'Thực thi Dời Deadline',
                    instruction: 'Cập nhật deadline các task bị ảnh hưởng sau khi được phê duyệt.',
                    inputFrom: ['start'],
                    nativeTools: ['projectTrackerTool']
                },
                {
                    id: 'reject_shift',
                    type: 'reply',
                    label: 'Hủy dời deadline',
                    instruction: 'Đã hủy thao tác dời deadline, giữ nguyên dữ liệu dự án.'
                }
            ],
            edges: [
                { source: 'start', target: 'route_intent' },
                { source: 'route_intent', target: 'create_tasks_branch', branch: '0' },
                { source: 'route_intent', target: 'progress_risk_branch', branch: '1' },
                { source: 'route_intent', target: 'approve_shift', branch: '2' },
                { source: 'approve_shift', target: 'shift_deadline_branch', branch: '0' },
                { source: 'approve_shift', target: 'reject_shift', branch: '1' }
            ],
            questions: [],
            blockers: []
        })

        const spec = baseSpec({
            name: 'PM Agent V1 Full Nodes',
            kind: 'knowledge',
            canvasVersion: 'v1',
            dataSources: [{ id: 'store-pm-1', type: 'documentStore', name: 'Quy trình Dự án', config: {} }],
            tools: [
                { id: 'native_projectTrackerTool', name: 'Project Tracker', type: 'projectTrackerTool', config: {} },
                { id: 'native_telegramNotifyTool', name: 'Telegram Bot', type: 'telegramNotifyTool', config: {} },
                { id: 'native_currentDateTime', name: 'CurrentDateTime', type: 'currentDateTime', config: {} }
            ],
            workflow
        })

        const v1Graph = compiler.compile(createAgentPlan(spec, 'rev-v1-pm'), {
            modelProfile: { modelName: 'gpt-6-sol', baseUrl: 'https://gateway.example/v1', credentialId: 'cred-1' }
        })
        expect(v1Graph.flowConfig.chatflowType).toBe('MULTIAGENT')
        expect(validateFlowGraph(v1Graph)).toMatchObject({ valid: true, errors: [] })

        // Verify all separated V1 cards exist on Canvas
        const nodeNames = v1Graph.nodes.map((n) => n.data.name)
        expect(nodeNames).toEqual(
            expect.arrayContaining([
                'chatOpenAI',
                'seqStart',
                'agentMemory',
                'seqState',
                'seqConditionAgent',
                'seqAgent',
                'documentStoreVS',
                'retrieverTool',
                'projectTrackerTool',
                'telegramNotifyTool',
                'currentDateTime',
                'seqEnd',
                'stickyNote'
            ])
        )

        // Verify Require Approval (`interrupt: true`) was automatically enabled on the shift deadline branch
        const shiftNode = v1Graph.nodes.find((n) => n.data.label === 'Thực thi Dời Deadline')!
        expect(shiftNode.data.inputs.interrupt).toBe(true)

        // Verify ChatOpenAI got reasoningEffort='none' for gpt-6-sol and prepareAgentPreview preserves V1 cleanly
        const chatNode = v1Graph.nodes.find((n) => n.data.name === 'chatOpenAI')!
        expect(chatNode.data.inputs.reasoningEffort).toBe('none')
        const previewed = JSON.parse(
            prepareAgentPreview(JSON.stringify(v1Graph), 'PM Agent V1 Full Nodes', false, new Date('2026-11-19T00:00:00Z'), {
                modelName: 'gpt-5.6-luna',
                baseUrl: 'https://gateway.example/v1',
                credentialId: 'cred-2'
            })
        )
        const updatedChat = previewed.nodes.find((n: any) => n.data.name === 'chatOpenAI')
        expect(updatedChat.data.inputs.modelName).toBe('gpt-5.6-luna')
        expect(updatedChat.data.inputs.reasoningEffort).toBe('none')

        // Verify Layered DAG Auto-Layout fans the 3 branches vertically without collapsing onto the same Y
        const createNode = v1Graph.nodes.find((n) => n.data.label === 'Phân rã & Tạo Task')!
        const progressNode = v1Graph.nodes.find((n) => n.data.label === 'Kiểm tra Tiến độ & Rủi ro')!
        const condNode = v1Graph.nodes.find((n) => n.data.name === 'seqConditionAgent')!
        expect(createNode.position.x).toBeGreaterThan(condNode.position.x)
        expect(createNode.position.y).not.toBe(progressNode.position.y)
    })

    it('triggers Self-Critic Architect Guard when a complex multi-module prompt is lazily collapsed to 1 node (B-034)', async () => {
        const invoke = jest
            .fn()
            // Pass 1: lazy 1-step Agent
            .mockResolvedValueOnce({
                content: JSON.stringify({
                    name: 'AI Quản lý Dự án',
                    goal: 'Quản lý công việc dự án tự động',
                    instructions: 'Xử lý mọi việc dự án.',
                    workflow: {
                        summary: 'Một bước xử lý chung.',
                        steps: [
                            {
                                id: 'single_agent',
                                type: 'agent',
                                label: 'Agent Chung',
                                instruction: 'Làm hết tất cả mọi thứ.',
                                inputFrom: ['start'],
                                nativeTools: ['projectTrackerTool']
                            }
                        ],
                        edges: [{ source: 'start', target: 'single_agent' }],
                        questions: [],
                        blockers: []
                    }
                })
            })
            // Pass 2: Self-Critic Architect decomposes into ConditionAgent + 3 specialized branches
            .mockResolvedValueOnce({
                content: JSON.stringify({
                    summary: 'Điều phối 3 nhánh chuyên trách Quản lý Dự án.',
                    archetype: 'mcp_automation',
                    enableMemory: true,
                    steps: [
                        {
                            id: 'router',
                            type: 'conditionAgent',
                            label: 'Điều phối Dự án',
                            instruction: 'Phân loại ý định người dùng.',
                            inputFrom: ['start'],
                            scenarios: ['Tạo & giao task', 'Kiểm tra tiến độ & rủi ro', 'Dời deadline & báo cáo']
                        },
                        {
                            id: 'branch_create',
                            type: 'agent',
                            label: 'Tạo & Giao Task',
                            instruction: 'Phân rã task và đề xuất giao việc.',
                            inputFrom: ['start'],
                            nativeTools: ['projectTrackerTool', 'currentDateTime']
                        },
                        {
                            id: 'branch_progress',
                            type: 'agent',
                            label: 'Kiểm tra Tiến độ & Rủi ro',
                            instruction: 'Phát hiện task quá hạn và rủi ro.',
                            inputFrom: ['start'],
                            nativeTools: ['projectTrackerTool']
                        },
                        {
                            id: 'branch_change',
                            type: 'agent',
                            label: 'Dời Deadline & Báo cáo',
                            instruction: 'Phân tích tác động dời deadline và gửi Telegram.',
                            inputFrom: ['start'],
                            nativeTools: ['projectTrackerTool', 'telegramNotifyTool']
                        }
                    ],
                    edges: [
                        { source: 'start', target: 'router' },
                        { source: 'router', target: 'branch_create', branch: '0' },
                        { source: 'router', target: 'branch_progress', branch: '1' },
                        { source: 'router', target: 'branch_change', branch: '2' }
                    ],
                    questions: [],
                    blockers: []
                })
            })

        ;(settings.getProfile as jest.Mock).mockResolvedValue({
            nodeName: 'chatOpenAI',
            modelName: 'gpt-6-sol',
            ready: true,
            webSearchEnabled: false
        })
        ;(settings.getModel as jest.Mock).mockResolvedValue({ invoke } as any)
        ;(workspaceMcpRegistryService.listAuthorizedMcpServersForPlanner as jest.Mock).mockResolvedValue([])

        const collector = new CollectorService()
        const complexPrompt =
            'Xây dựng AI Agent quản lý công việc dự án phần mềm tự động:\n' +
            '1. Tiếp nhận yêu cầu, chia nhỏ công việc và tạo task trên GitHub Issues / Trello.\n' +
            '2. Tự động giao việc theo khối lượng công việc sau khi tôi xác nhận.\n' +
            '3. Kiểm tra tiến độ, phát hiện rủi ro trễ deadline và gửi báo cáo 17h qua Telegram.\n' +
            '4. Xử lý yêu cầu dời deadline thêm 3 ngày có xác nhận trước khi đổi dữ liệu thật.'

        const res = await collector.extractWithModel(complexPrompt, {}, 'ws-pm-critic')
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(res.patch.workflow?.steps.length).toBe(4)
        expect(res.patch.workflow?.steps[0].type).toBe('conditionAgent')
        expect(res.patch.workflow?.enableMemory).toBe(true)
    })

    it('lays out a dense 4-branch V1 PM Studio graph with zero card overlap and strips all decorative emojis', () => {
        const workflow = WorkflowSchema.parse({
            summary: '🤖 Bộ điều phối 4 nhánh PM Studio Bot tự động quản lý task, rủi ro, dời hạn và báo cáo.',
            archetype: 'mcp_automation',
            enableMemory: true,
            schedule: {
                cronExpression: '0 17 * * *',
                timezone: 'Asia/Ho_Chi_Minh',
                defaultInput: 'Tổng hợp báo cáo tiến độ hằng ngày',
                description: 'Báo cáo tiến độ 17:00 hằng ngày'
            },
            initialState: [{ key: 'projectKey', value: 'pm_studio' }],
            steps: [
                {
                    id: 'router',
                    type: 'conditionAgent',
                    label: 'Bộ điều phối PM Studio',
                    instruction: 'Phân loại yêu cầu vào 4 nhánh chuyên trách.',
                    inputFrom: ['start'],
                    scenarios: ['Tạo & giao task', 'Tiến độ & rủi ro', 'Dời deadline', 'Báo cáo 17h & xuất Excel/Word']
                },
                {
                    id: 'branch_create',
                    type: 'agent',
                    label: 'Nhánh 1: Tạo & Giao Task',
                    instruction: 'Phân rã công việc, kiểm tra trùng và đề xuất giao việc.',
                    inputFrom: ['start'],
                    nativeTools: ['projectTrackerTool', 'currentDateTime', 'sequentialThinkingMCP', 'excelOfficeTool']
                },
                {
                    id: 'branch_progress',
                    type: 'agent',
                    label: 'Nhánh 2: Kiểm tra Tiến độ & Rủi ro',
                    instruction: 'Truy vấn task quá hạn, bị chặn và tính điểm rủi ro.',
                    inputFrom: ['start'],
                    nativeTools: ['projectTrackerTool', 'currentDateTime', 'sequentialThinkingMCP']
                },
                {
                    id: 'branch_shift',
                    type: 'agent',
                    label: 'Nhánh 3: Phân tích & Dời Deadline',
                    instruction: 'Phân tích tác động dời deadline và cập nhật sau xác nhận.',
                    inputFrom: ['start'],
                    nativeTools: ['projectTrackerTool', 'currentDateTime', 'telegramNotifyTool']
                },
                {
                    id: 'branch_report',
                    type: 'agent',
                    label: 'Nhánh 4: Báo cáo 17h & Xuất File',
                    instruction: 'Tổng hợp báo cáo, xuất file Excel/Word và gửi Telegram.',
                    inputFrom: ['start'],
                    nativeTools: ['projectTrackerTool', 'currentDateTime', 'excelOfficeTool', 'wordOfficeTool', 'telegramNotifyTool']
                }
            ],
            edges: [
                { source: 'start', target: 'router' },
                { source: 'router', target: 'branch_create', branch: '0' },
                { source: 'router', target: 'branch_progress', branch: '1' },
                { source: 'router', target: 'branch_shift', branch: '2' },
                { source: 'router', target: 'branch_report', branch: '3' }
            ],
            suggestions: ['💡 Bật cảnh báo sớm cho task còn dưới 2 ngày', '✅ Chuẩn hóa mẫu báo cáo Word'],
            questions: ['📌 Có cần đồng bộ thêm GitHub repo ngoài không?'],
            blockers: []
        })

        const spec = baseSpec({
            name: 'PM Studio Bot',
            kind: 'knowledge',
            canvasVersion: 'v1',
            dataSources: [{ id: 'store-pm', type: 'documentStore', name: 'Sổ tay Quy trình PM', config: {} }],
            tools: [
                { id: 'native_projectTrackerTool', name: 'Quản lý Task Dự án', type: 'projectTrackerTool', config: {} },
                { id: 'native_currentDateTime', name: 'Ngày giờ Hệ thống', type: 'currentDateTime', config: {} },
                { id: 'native_sequentialThinkingMCP', name: 'Sequential Thinking', type: 'sequentialThinkingMCP', config: {} },
                { id: 'native_excelOfficeTool', name: 'Excel Bảng tính Nội bộ', type: 'excelOfficeTool', config: {} },
                { id: 'native_wordOfficeTool', name: 'Word Văn bản Nội bộ', type: 'wordOfficeTool', config: {} },
                { id: 'native_telegramNotifyTool', name: 'Telegram Bot', type: 'telegramNotifyTool', config: {} }
            ],
            workflow
        })

        const v1Graph = compiler.compile(createAgentPlan(spec, 'rev-v1-pm-dense'), {
            modelProfile: { modelName: 'gpt-6-sol', baseUrl: 'https://gateway.example/v1', credentialId: 'cred-1' }
        })
        expect(validateFlowGraph(v1Graph)).toMatchObject({ valid: true, errors: [] })

        // Pairwise bounding-box non-overlap check using real Flowise V1 card dimensions
        const boxForNode = (node: any) => {
            const name = String(node.data?.name || '')
            const width = 320
            let height = 450
            if (name === 'seqAgent') height = 1040
            else if (name === 'seqConditionAgent') height = 780
            else if (name === 'seqLLMNode') height = 740
            else if (name === 'chatOpenAI') height = 620
            else if (name === 'agentMemory') height = 360
            else if (name === 'seqStart') height = 340
            else if (name === 'seqState') height = 340
            else if (name === 'seqEnd') height = 200
            else if (name === 'stickyNote') height = 420
            return {
                id: node.id,
                x1: node.position.x,
                y1: node.position.y,
                x2: node.position.x + width,
                y2: node.position.y + height
            }
        }

        const boxes = v1Graph.nodes.map(boxForNode)
        const overlaps: string[] = []
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i]
                const b = boxes[j]
                const intersects = a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
                if (intersects) overlaps.push(`${a.id} <-> ${b.id}`)
            }
        }
        expect(overlaps).toEqual([])

        // Zero decorative emojis in Sticky Note and Collector chat replies
        const emojiRe = /\p{Extended_Pictographic}/u
        const stickyNode = v1Graph.nodes.find((n) => n.data.name === 'stickyNote')!
        expect(emojiRe.test(String(stickyNode.data.inputs.note || ''))).toBe(false)

        const collector = new CollectorService()
        const chatReply = collector.generateCollectorResponse([], spec, ['workflow'], undefined, { isFirstReply: true })
        expect(emojiRe.test(chatReply)).toBe(false)
        expect(chatReply).toContain('Phân loại Agent:')
        expect(chatReply).toContain('Node công cụ Flowise đã gắn:')

        // Descriptive language strings like "Tiếng Việt chuyên nghiệp" must auto-normalize to "vi" and never block buildReady
        const longLangSpec = baseSpec({ ...spec, language: 'Tiếng Việt chuyên nghiệp, không emoji' })
        const longLangReadiness = computeReadiness(longLangSpec)
        expect(longLangReadiness.buildReady).toBe(true)
        expect(longLangReadiness.errors).toBeUndefined()
    })

    it('uploads real .xlsx and .docx files into workspace storage for ExcelOfficeTool/WordOfficeTool read & append with workspace isolation', async () => {
        const fs = require('fs')
        const os = require('os')
        const path = require('path')
        const prevBlobPath = process.env.BLOB_STORAGE_PATH
        const tempDir = path.join(os.tmpdir(), `flowise_office_upload_${Date.now()}`)
        process.env.BLOB_STORAGE_PATH = tempDir

        try {
            const { default: nativeToolCatalogService } = await import('./tools/nativeToolCatalogService')
            const { nodeClass: ExcelNode } = require('../../../../components/dist/nodes/tools/ExcelOfficeTool/ExcelOfficeTool.js')
            const { nodeClass: WordNode } = require('../../../../components/dist/nodes/tools/WordOfficeTool/WordOfficeTool.js')

            const fixtureDir = path.resolve(__dirname, '../../../../../AI-Agent/fixtures')
            const xlsxBuf = fs.readFileSync(path.join(fixtureDir, 'Chi_Phi_Mau_Thang_11.xlsx'))
            const docxBuf = fs.readFileSync(path.join(fixtureDir, 'To_Trinh_Mau_Thang_11.docx'))
            const wsId = `ws_upload_${Date.now()}`

            // 1. Reject spoofed non-ZIP files
            expect(() =>
                nativeToolCatalogService.saveUploadedOfficeFile(wsId, {
                    originalname: 'fake.xlsx',
                    buffer: Buffer.from('not a real zip file')
                })
            ).toThrow()

            // 2. Upload real .xlsx and read + append via ExcelOfficeTool
            const uploadedXlsx = nativeToolCatalogService.saveUploadedOfficeFile(wsId, {
                originalname: 'Chi_Phi_Mau_Thang_11.xlsx',
                buffer: xlsxBuf
            })
            expect(uploadedXlsx.ext).toBe('xlsx')
            expect(uploadedXlsx.sheetNames).toEqual(['ChiTiet', 'DinhMucNganSach', 'TongHopPhongBan'])

            const excelTools: any[] = await new ExcelNode().init({ id: 'ex_up', inputs: {} }, '', { workspaceId: wsId })
            const excelByName = Object.fromEntries(excelTools.map((t) => [t.name, t]))
            const readEx = JSON.parse(await excelByName.excel_read_workbook.invoke({ fileId: uploadedXlsx.fileId, sheetName: 'ChiTiet' }))
            expect(readEx.rowCountReturned).toBe(24)

            const appendEx = JSON.parse(
                await excelByName.excel_append_rows.invoke({
                    fileId: uploadedXlsx.fileId,
                    sheetName: 'ChiTiet',
                    rows: [
                        [
                            25,
                            'CT-2611-25',
                            '2026-11-19',
                            'Thuê phần mềm Kế toán MISA',
                            'Phòng Nhân sự & HC',
                            'MISA JSC',
                            3500000,
                            280000,
                            3780000,
                            'Chờ duyệt',
                            'Bổ sung qua test'
                        ]
                    ]
                })
            )
            expect(appendEx.success).toBe(true)
            const readExAfter = JSON.parse(
                await excelByName.excel_read_workbook.invoke({ fileId: uploadedXlsx.fileId, sheetName: 'ChiTiet' })
            )
            expect(readExAfter.rowCountReturned).toBe(25)

            // 3. Upload real .docx and read + append section via WordOfficeTool while preserving original text
            const uploadedDocx = nativeToolCatalogService.saveUploadedOfficeFile(wsId, {
                originalname: 'To_Trinh_Mau_Thang_11.docx',
                buffer: docxBuf
            })
            expect(uploadedDocx.ext).toBe('docx')
            expect(uploadedDocx.paragraphCount).toBeGreaterThan(10)

            const wordTools: any[] = await new WordNode().init({ id: 'wd_up', inputs: {} }, '', { workspaceId: wsId })
            const wordByName = Object.fromEntries(wordTools.map((t) => [t.name, t]))
            const readWd = JSON.parse(await wordByName.word_read_document.invoke({ fileId: uploadedDocx.fileId }))
            expect(readWd.content).toContain('TỜ TRÌNH TỔNG HỢP')

            const appendWd = JSON.parse(
                await wordByName.word_append_section.invoke({
                    fileId: uploadedDocx.fileId,
                    section: {
                        heading: '7. Phụ lục kiểm tra chứng từ',
                        bullets: ['Đã đối chiếu hóa đơn VAT điện tử tháng 11/2026']
                    }
                })
            )
            expect(appendWd.success).toBe(true)
            const readWdAfter = JSON.parse(await wordByName.word_read_document.invoke({ fileId: uploadedDocx.fileId }))
            expect(readWdAfter.content).toContain('TỜ TRÌNH TỔNG HỢP')
            expect(readWdAfter.content).toContain('Phụ lục kiểm tra chứng từ')

            // 4. Listing + download isolation across workspaces
            const listed = nativeToolCatalogService.listWorkspaceOfficeFiles(wsId)
            expect(listed.map((f) => f.fileId)).toEqual(expect.arrayContaining([uploadedXlsx.fileId, uploadedDocx.fileId]))
            expect(() => nativeToolCatalogService.resolveExportedFileForDownload('other-ws', uploadedXlsx.fileId)).toThrow()
        } finally {
            if (prevBlobPath === undefined) delete process.env.BLOB_STORAGE_PATH
            else process.env.BLOB_STORAGE_PATH = prevBlobPath
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    })

    it('compiles 3-tier CSKH L1/L2/L3 V1 Agent with HelpdeskTicketTool and syncs tickets between End-User tool and Admin inbox (B-035)', async () => {
        const fs = require('fs')
        const os = require('os')
        const path = require('path')
        const prevBlobPath = process.env.BLOB_STORAGE_PATH
        const tempDir = path.join(os.tmpdir(), `flowise_helpdesk_test_${Date.now()}`)
        process.env.BLOB_STORAGE_PATH = tempDir

        try {
            const workflow = WorkflowSchema.parse({
                summary: 'Trợ lý CSKH 3 tầng: L1 tra cứu tài liệu RAG, L2 điều hướng ứng dụng, L3 tạo phiếu Helpdesk kèm ngữ cảnh.',
                archetype: 'router_triage',
                enableMemory: true,
                steps: [
                    {
                        id: 'triage',
                        type: 'conditionAgent',
                        label: 'Phân loại CSKH L1/L2/L3',
                        instruction: 'Phân loại yêu cầu khách hàng vào L1, L2 hoặc L3.',
                        inputFrom: ['start'],
                        scenarios: ['L1: Hỏi đáp nghiệp vụ theo tài liệu', 'L2: Dẫn tới đúng ứng dụng', 'L3: Báo lỗi tạo ticket hỗ trợ']
                    },
                    {
                        id: 'l1_qa',
                        type: 'agent',
                        label: 'L1 - Giải đáp từ tài liệu',
                        instruction: 'Tra cứu tài liệu Admin đã tải lên và trả lời kèm nguồn.',
                        inputFrom: ['start'],
                        sourceIds: ['store-cskh-doc']
                    },
                    {
                        id: 'l2_redirect',
                        type: 'llm',
                        label: 'L2 - Điều hướng ứng dụng',
                        instruction: 'Cung cấp đúng đường dẫn ứng dụng và bước mở màn hình chức năng.',
                        inputFrom: ['start']
                    },
                    {
                        id: 'l3_ticket',
                        type: 'agent',
                        label: 'L3 - Tạo & Tra cứu Ticket CSKH',
                        instruction:
                            'Tóm tắt ngữ cảnh, hỏi xác nhận rồi gọi helpdesk_create_ticket hoặc tra cứu bằng helpdesk_list_tickets.',
                        inputFrom: ['start'],
                        nativeTools: ['helpdeskTicketTool', 'currentDateTime']
                    }
                ],
                edges: [
                    { source: 'start', target: 'triage' },
                    { source: 'triage', target: 'l1_qa', branch: '0' },
                    { source: 'triage', target: 'l2_redirect', branch: '1' },
                    { source: 'triage', target: 'l3_ticket', branch: '2' }
                ],
                questions: [],
                blockers: []
            })

            const spec = baseSpec({
                name: 'CSKH 3 Tầng Doanh Nghiệp',
                kind: 'knowledge',
                canvasVersion: 'v1',
                dataSources: [{ id: 'store-cskh-doc', type: 'documentStore', name: 'Tài liệu HDSD Hệ thống', config: {} }],
                tools: [
                    {
                        id: 'native_helpdeskTicketTool',
                        name: 'Quản lý Ticket CSKH / Helpdesk (L3)',
                        type: 'helpdeskTicketTool',
                        config: {}
                    },
                    { id: 'native_currentDateTime', name: 'CurrentDateTime', type: 'currentDateTime', config: {} }
                ],
                workflow
            })

            const v1Graph = compiler.compile(createAgentPlan(spec, 'rev-cskh-b035'), {
                modelProfile: { modelName: 'gpt-5.6-sol', baseUrl: 'https://gateway.example/v1', credentialId: 'cred-1' }
            })
            expect(validateFlowGraph(v1Graph)).toMatchObject({ valid: true, errors: [] })
            const nodeNames = v1Graph.nodes.map((n) => n.data.name)
            expect(nodeNames).toEqual(
                expect.arrayContaining(['helpdeskTicketTool', 'documentStoreVS', 'retrieverTool', 'agentMemory', 'seqConditionAgent'])
            )
            expect(nodeNames).not.toContain('projectTrackerTool')

            // Live two-role loop: End-User creates L3 ticket -> Admin sees & updates -> End-User checks updated status
            const { default: nativeToolCatalogService } = await import('./tools/nativeToolCatalogService')
            const { nodeClass: HelpdeskNode } = require('../../../../components/dist/nodes/tools/HelpdeskTicketTool/HelpdeskTicketTool.js')
            const wsId = `ws_cskh_${Date.now()}`
            const tools: any[] = await new HelpdeskNode().init({ id: 'hd_node', inputs: {} }, '', { workspaceId: wsId })
            const byName = Object.fromEntries(tools.map((t) => [t.name, t]))

            const created = JSON.parse(
                await byName.helpdesk_create_ticket.invoke({
                    title: 'Không đăng nhập được SSO sau khi đổi mật khẩu',
                    category: 'Tài khoản & Bảo mật',
                    priority: 'P1',
                    customerName: 'Trần Minh Quân',
                    customerContact: 'quan.tm@khachhang.vn',
                    contextSummary: 'Khách đã thử hướng dẫn đặt lại mật khẩu ở L1 nhưng hệ thống vẫn báo lỗi 403.',
                    expectedResult: 'Đăng nhập thành công vào cổng dịch vụ',
                    actualResult: 'Hiển thị lỗi 403 Forbidden',
                    stepsTried: ['Xóa cache trình duyệt', 'Đặt lại mật khẩu mới']
                })
            )
            expect(created.success).toBe(true)
            expect(created.ticketId).toBe('TCK-1001')
            expect(created.assignedGroup).toBe('Đội Bảo mật & Tài khoản')
            expect(created.slaHours).toBe(4)

            // Anti-duplication check
            const dup = JSON.parse(
                await byName.helpdesk_create_ticket.invoke({
                    title: 'Không đăng nhập được SSO sau khi đổi mật khẩu',
                    category: 'Tài khoản & Bảo mật',
                    priority: 'P1',
                    customerContact: 'quan.tm@khachhang.vn',
                    contextSummary: 'Gửi lặp lại cùng sự cố.'
                })
            )
            expect(dup.duplicatePrevented).toBe(true)
            expect(dup.ticket.ticketId).toBe('TCK-1001')

            // Admin lists tickets (and other workspace is isolated)
            const adminList = nativeToolCatalogService.listWorkspaceHelpdeskTickets(wsId)
            expect(adminList).toHaveLength(1)
            expect(adminList[0].ticketId).toBe('TCK-1001')
            expect(nativeToolCatalogService.listWorkspaceHelpdeskTickets('other-workspace')).toEqual([])

            // Admin updates status + adds staff response note
            const updated = nativeToolCatalogService.updateWorkspaceHelpdeskTicket(wsId, 'TCK-1001', {
                status: 'Đang xử lý',
                note: 'Đã mở khóa phiên SSO, mời khách đăng nhập lại sau 5 phút.',
                author: 'Admin CSKH'
            })
            expect(updated.status).toBe('Đang xử lý')

            // End-User queries ticket status via tool and sees live Admin note
            const userLookup = JSON.parse(await byName.helpdesk_list_tickets.invoke({ ticketId: 'TCK-1001' }))
            expect(userLookup.total).toBe(1)
            expect(userLookup.tickets[0].status).toBe('Đang xử lý')
            expect(userLookup.tickets[0].notes.some((n: any) => String(n.content).includes('mở khóa phiên SSO'))).toBe(true)
        } finally {
            if (prevBlobPath === undefined) delete process.env.BLOB_STORAGE_PATH
            else process.env.BLOB_STORAGE_PATH = prevBlobPath
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    })
})
