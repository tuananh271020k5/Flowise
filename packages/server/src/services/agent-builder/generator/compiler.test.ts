import { AgentSpec } from '../types'
import { createAgentPlan } from './agentPlan'
import compiler, { AgentflowCompiler } from './compiler'

describe('Deterministic AgentflowCompiler (PH2-T04 / B-008)', () => {
    const validSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ Lý Tư Vấn Tuyển Sinh',
        goal: 'Hỗ trợ học sinh và phụ huynh tìm hiểu ngành học và học phí',
        language: 'vi',
        instructions: 'Chào đón thân thiện, giải thích chi tiết các phương thức xét tuyển và học bổng.',
        outputExpectations: ['Ngắn gọn', 'Lịch sự', 'Rõ ràng'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [],
        tools: [
            { id: 't1', name: 'Máy tính điểm chuẩn', type: 'calculator' },
            { id: 't2', name: 'Tìm kiếm thông tin ngành', type: 'webSearch' }
        ],
        policy: {
            visibility: 'private',
            executionMode: 'controlled-test',
            allowWrite: false
        },
        evaluationExamples: [
            {
                input: 'Ngành CNTT lấy bao nhiêu điểm?',
                assertions: ['Điểm chuẩn từ 26.5 trở lên']
            }
        ]
    }

    it('biên dịch AgentPlan thành CompiledFlowGraph hoàn chỉnh', () => {
        const plan = createAgentPlan(validSpec, 'rev-001')
        const result = compiler.compile(plan)

        expect(result.templateId).toBe('assistant-flow-template')
        expect(result.templateVersion).toBe('1.0')
        expect(result.planId).toBe(plan.id)
        expect(result.flowConfig.chatflowType).toBe('AGENTFLOW')
        expect(result.flowConfig.name).toBe('Trợ Lý Tư Vấn Tuyển Sinh')

        // Start node (1.4)
        const startNode = result.nodes.find((n) => n.data.name === 'startAgentflow')
        expect(startNode).toBeDefined()
        expect(startNode?.data.version).toBe(1.4)

        // Agent node (3.2)
        const agentNode = result.nodes.find((n) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        expect(agentNode?.data.version).toBe(3.2)
        expect(agentNode?.data.inputs.agentModel).toBe('chatOpenAI')

        // Models/tools are embedded in Agent configuration, not V2 execution nodes.
        expect(result.nodes.map((n) => n.data.name)).toEqual(['startAgentflow', 'agentAgentflow'])
        expect(agentNode?.data.inputs.agentTools).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ agentSelectedTool: 'calculator', agentSelectedToolConfig: {} }),
                expect.objectContaining({ agentSelectedTool: 'webSearch', agentSelectedToolConfig: {} })
            ])
        )
        expect(agentNode?.data.inputs.agentModelConfig).toMatchObject({ streaming: false })
        expect(agentNode?.data.inputs.agentUserMessage).toBe('')

        // Edges
        const startEdge = result.edges.find((e) => e.source === 'startAgentflow_0' && e.target === 'agentAgentflow_0')
        expect(startEdge).toBeDefined()
        expect(startEdge?.sourceHandle).toBe('startAgentflow_0-output-startAgentflow')
    })

    it('tính tất định (Deterministic): chạy 10 lần cùng input trả về cùng graph 100%', () => {
        const customCompiler = new AgentflowCompiler()
        const plan = createAgentPlan(validSpec, 'rev-stable')

        const firstRunJson = JSON.stringify(customCompiler.compile(plan))

        for (let i = 1; i < 10; i++) {
            const subsequentRunJson = JSON.stringify(customCompiler.compile(plan))
            expect(subsequentRunJson).toBe(firstRunJson)
        }
    })

    it('từ chối biên dịch khi AgentPlan không hợp lệ', () => {
        const invalidPlan: any = {
            id: 'plan_invalid',
            templateId: 'wrong_template',
            capabilityBindings: []
        }

        expect(() => compiler.compile(invalidPlan)).toThrow('AgentPlan không hợp lệ')
    })

    it('biên dịch Knowledge AgentPlan sinh đầy đủ DocumentStoreTool và RAG guidelines (PH4-T03 / B-017)', () => {
        const knowledgeSpec: AgentSpec = {
            schemaVersion: '1.0',
            kind: 'knowledge',
            name: 'Trợ Lý Quy Chế Công Ty',
            goal: 'Giải đáp thắc mắc về hợp đồng và phúc lợi',
            language: 'vi',
            instructions: 'Luôn lịch sự và cung cấp thông tin chính xác theo văn bản.',
            outputExpectations: ['Trích dẫn điều khoản'],
            modelProfileRef: 'chatOpenAI',
            dataSources: [
                {
                    id: 'ds_policy_2026',
                    name: 'Chính sách công ty 2026',
                    type: 'documentStore'
                }
            ],
            tools: [],
            policy: {
                visibility: 'private',
                executionMode: 'controlled-test',
                allowWrite: false
            },
            evaluationExamples: [
                {
                    input: 'Thời hạn thử việc là mấy tháng?',
                    assertions: ['2 tháng theo quy định']
                }
            ]
        }

        const plan = createAgentPlan(knowledgeSpec, 'rev-k100')
        const compiled = compiler.compile(plan)

        expect(compiled.templateId).toBe('knowledge-flow-template')

        // Kiểm tra DocumentStoreTool node

        // Kiểm tra Agent node kết nối documentStoreTool
        const agentNode = compiled.nodes.find((n) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        expect(agentNode?.data.inputs.agentKnowledgeDocumentStores).toEqual([
            { documentStore: 'ds_policy_2026', docStoreDescription: 'Chính sách công ty 2026', returnSourceDocuments: true }
        ])

        // Kiểm tra RAG guideline trong system message
        const messages = agentNode?.data.inputs.agentMessages as any[]
        expect(messages[0].content).toContain('NGUYÊN TẮC HỎI ĐÁP THEO TÀI LIỆU')
        expect(messages[0].content).toContain('Trích dẫn nguồn')
    })

    it('biên dịch API Readonly AgentPlan sinh RequestsGet node và API safety guidelines (PH6-T03)', () => {
        const apiSpec: AgentSpec = {
            schemaVersion: '1.0',
            kind: 'api-readonly',
            name: 'Trợ Lý Thời Tiết API',
            goal: 'Tra cứu thông tin dự báo thời tiết trực tuyến',
            language: 'vi',
            instructions: 'Trả lời nhiệt độ và độ ẩm thời gian thực',
            outputExpectations: ['Ngắn gọn'],
            modelProfileRef: 'chatOpenAI',
            dataSources: [],
            tools: [],
            apiConnectors: [
                {
                    connectorId: 'conn-weather-hcm',
                    name: 'HCM Weather API',
                    baseUrl: 'https://api.openweathermap.org/data/2.5',
                    allowedOperations: ['getWeatherByCity']
                }
            ],
            policy: {
                visibility: 'private',
                executionMode: 'controlled-test',
                allowWrite: false
            },
            evaluationExamples: [
                {
                    input: 'Thời tiết hôm nay thế nào?',
                    assertions: ['Nhiệt độ hiện tại']
                }
            ]
        }

        const plan = createAgentPlan(apiSpec, 'rev-api-101')
        const compiled = compiler.compile(plan)

        expect(compiled.templateId).toBe('api-flow-template')

        // Kiểm tra RequestsGet node

        // Kiểm tra Agent node kết nối requestsGet
        const agentNode = compiled.nodes.find((n) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        const agentTools = agentNode?.data.inputs.agentTools as any[]
        expect(agentTools.some((t) => t.agentSelectedTool === 'requestsGet')).toBe(true)
        expect(agentTools[0].agentSelectedToolConfig.requestsGetUrl).toBe('https://api.openweathermap.org/data/2.5')

        // Kiểm tra API Readonly guidelines
        const messages = agentNode?.data.inputs.agentMessages as any[]
        expect(messages[0].content).toContain('API READONLY RULES')
        expect(messages[0].content).toContain('READONLY')
    })

    it('biên dịch SQL Readonly AgentPlan sinh CustomTool node và SQL safety guidelines (PH6-T07)', () => {
        const sqlSpec: AgentSpec = {
            schemaVersion: '1.0',
            kind: 'sql-readonly',
            name: 'Trợ Lý Phân Tích Dữ Liệu SQL',
            goal: 'Truy vấn số liệu đơn hàng và doanh số',
            language: 'vi',
            instructions: 'Báo cáo số liệu chính xác theo bảng',
            outputExpectations: ['Bảng Markdown'],
            modelProfileRef: 'chatOpenAI',
            dataSources: [],
            tools: [],
            sqlConfig: {
                databaseType: 'sqlite',
                databaseName: 'sales_mart',
                allowedTables: ['orders', 'customers'],
                rowLimit: 30
            },
            policy: {
                visibility: 'private',
                executionMode: 'controlled-test',
                allowWrite: false
            },
            evaluationExamples: [
                {
                    input: 'Có bao nhiêu đơn hàng thành công?',
                    assertions: ['Số lượng đơn completed']
                }
            ]
        }

        const plan = createAgentPlan(sqlSpec, 'rev-sql-101')
        const compiled = compiler.compile(plan)

        expect(compiled.templateId).toBe('sql-flow-template')

        // Kiểm tra CustomTool node

        // Kiểm tra Agent node kết nối customTool
        const agentNode = compiled.nodes.find((n) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        const agentTools = agentNode?.data.inputs.agentTools as any[]
        expect(agentTools.some((t) => t.agentSelectedTool === 'customTool')).toBe(true)
        expect(agentTools[0].agentSelectedToolConfig.selectedTool).toBe('sql_executor_readonly')

        // Kiểm tra SQL Readonly guidelines
        const messages = agentNode?.data.inputs.agentMessages as any[]
        expect(messages[0].content).toContain('SQL READONLY RULES')
        expect(messages[0].content).toContain('SELECT')
        expect(messages[0].content).toContain('orders, customers')
        expect(messages[0].content).toContain('30 dòng')
    })
})
