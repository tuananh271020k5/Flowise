/* eslint-disable */
import { ApiConnectorService } from './apiConnectorService'
import collectorService from '../collectorService'
import { computeReadiness } from '../readiness'
import { createAgentPlan, validateAgentPlan } from '../generator/agentPlan'
import { AgentflowCompiler } from '../generator/compiler'
import { AgentSpec } from '../types'

describe('PH6-T01, PH6-T02, PH6-T03: API Agent Integration Suite', () => {
    let apiConnectorService: ApiConnectorService
    let compiler: AgentflowCompiler

    beforeEach(() => {
        apiConnectorService = new ApiConnectorService()
        compiler = new AgentflowCompiler()
    })

    it('Hoàn thành toàn bộ chu trình đăng ký connector -> thu thập spec -> lập plan -> compile Agentflow API Readonly', async () => {
        const workspaceId = 'ws-api-demo'

        // 1. PH6-T01: Đăng ký API Connector vào Registry
        const connector = await apiConnectorService.registerConnector({
            workspaceId,
            name: 'OpenWeather Map API',
            description: 'Tra cứu thông tin dự báo thời tiết',
            baseUrl: 'https://api.openweathermap.org/data/2.5',
            enabled: true,
            operations: [
                {
                    id: 'getWeatherByCity',
                    name: 'Xem thời tiết',
                    method: 'GET',
                    path: '/weather',
                    description: 'Lấy nhiệt độ hiện tại',
                    isReadonly: true
                }
            ]
        })
        expect(connector.id).toBeDefined()

        // 2. PH6-T02: Thu thập yêu cầu tiếng Việt qua Collector
        const userPrompt = 'Tôi muốn làm bot gọi API thời tiết Hà Nội và giải đáp nhiệt độ cho người dùng'
        const patchResult = collectorService.extractPatch(userPrompt)

        expect(patchResult.patch.kind).toBe('api-readonly')
        expect(patchResult.patch.apiConnectors).toBeDefined()
        expect(patchResult.extractedFields).toContain('apiConnectors')

        // Giả lập hoàn thiện đầy đủ Spec sau đàm thoại
        const apiSpec: AgentSpec = {
            schemaVersion: '1.0',
            kind: 'api-readonly',
            name: 'Trợ Lý Thời Tiết Hà Nội',
            goal: 'Cung cấp thông tin thời tiết thời gian thực cho người dùng',
            language: 'vi',
            instructions: 'Luôn lịch sự, trả lời nhiệt độ và độ ẩm chi tiết.',
            outputExpectations: ['Rõ ràng'],
            modelProfileRef: 'chatOpenAI',
            dataSources: [],
            tools: [],
            apiConnectors: [
                {
                    connectorId: connector.id,
                    name: connector.name,
                    baseUrl: connector.baseUrl,
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
                    input: 'Thời tiết Hà Nội hôm nay thế nào?',
                    assertions: ['Nhiệt độ hiện tại']
                }
            ]
        }

        // Kiểm tra Readiness
        const readiness = computeReadiness(apiSpec)
        expect(readiness.specReady).toBe(true)
        expect(readiness.buildReady).toBe(true)
        expect(readiness.assumptions).toContain('Áp dụng cơ chế an toàn API Readonly: Chặn mọi thao tác sửa/xóa dữ liệu bên ngoài')

        // 3. PH6-T03: Tạo AgentPlan và Thẩm định
        const plan = createAgentPlan(apiSpec, 'spec-rev-api-1')
        expect(plan.templateId).toBe('api-flow-template')
        expect(plan.connectionRefs.api).toBe('requestsGet')

        const planValidation = validateAgentPlan(plan)
        expect(planValidation.valid).toBe(true)

        // 4. PH6-T03: Biên dịch tất định ra Flowise Agentflow V2 Graph
        const compiledGraph = compiler.compile(plan)
        expect(compiledGraph.templateId).toBe('api-flow-template')

        // Kiểm tra 4 nodes cốt lõi
        const startNode = compiledGraph.nodes.find((n) => n.data.name === 'startAgentflow')
        const modelNode = compiledGraph.nodes.find((n) => n.data.name === 'chatOpenAI')
        const toolNode = compiledGraph.nodes.find((n) => n.data.name === 'requestsGet')
        const agentNode = compiledGraph.nodes.find((n) => n.data.name === 'agentAgentflow')

        expect(startNode).toBeDefined()
        expect(modelNode).toBeDefined()
        expect(toolNode).toBeDefined()
        expect(agentNode).toBeDefined()

        // Kiểm tra URL được cấu hình đúng vào tool
        expect(toolNode?.data.inputs.requestsGetUrl).toBe('https://api.openweathermap.org/data/2.5')

        // 5. PH6-T01: Kiểm tra tính nghiêm ngặt của Operation Allowlist
        // Gọi hợp lệ
        const validCall = apiConnectorService.validateApiCall({
            workspaceId,
            connectorId: connector.id,
            operationId: 'getWeatherByCity',
            url: 'https://api.openweathermap.org/data/2.5/weather?q=Hanoi',
            method: 'GET',
            isReadonlyContext: true
        })
        expect(validCall.allowed).toBe(true)

        // Gọi vi phạm URL ngoài Base URL
        const invalidUrlCall = apiConnectorService.validateApiCall({
            workspaceId,
            connectorId: connector.id,
            operationId: 'getWeatherByCity',
            url: 'https://external-untrusted-server.com/api',
            method: 'GET'
        })
        expect(invalidUrlCall.allowed).toBe(false)
        expect(invalidUrlCall.reason).toContain('không thuộc phạm vi Base URL được phép')

        // Gọi vi phạm Readonly Policy (thử gọi POST)
        const invalidMethodCall = apiConnectorService.validateApiCall({
            workspaceId,
            connectorId: connector.id,
            operationId: 'getWeatherByCity',
            url: 'https://api.openweathermap.org/data/2.5/weather',
            method: 'POST',
            isReadonlyContext: true
        })
        expect(invalidMethodCall.allowed).toBe(false)
    })
})
