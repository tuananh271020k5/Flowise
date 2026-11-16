/* eslint-disable */
import { instantiateApiTemplate, API_TEMPLATE_ID, API_TEMPLATE_VERSION } from './apiTemplate.v1'
import { AgentSpec } from '../../types'

describe('ApiTemplate v1 (PH6-T03)', () => {
    const sampleSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'api-readonly',
        name: 'Trợ lý Thời tiết Hà Nội',
        goal: 'Tra cứu nhiệt độ thời gian thực',
        language: 'vi',
        instructions: 'Cung cấp nhiệt độ và độ ẩm cho người dùng tại Hà Nội',
        outputExpectations: ['Ngắn gọn'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [],
        tools: [],
        apiConnectors: [
            {
                connectorId: 'conn-weather-hanoi',
                name: 'Hanoi Weather API',
                baseUrl: 'https://api.openweathermap.org/data/2.5',
                allowedOperations: ['getWeatherByCity']
            }
        ],
        policy: {
            visibility: 'private',
            executionMode: 'controlled-test',
            allowWrite: false
        },
        evaluationExamples: []
    }

    it('should instantiate valid Flowise graph with Start, Model, RequestsGet and Agent', () => {
        const graph = instantiateApiTemplate(sampleSpec)

        expect(graph.nodes.length).toBe(4)
        expect(graph.edges.length).toBe(3)

        const startNode = graph.nodes.find((n) => n.data.name === 'startAgentflow')
        const modelNode = graph.nodes.find((n) => n.data.name === 'chatOpenAI')
        const apiToolNode = graph.nodes.find((n) => n.data.name === 'requestsGet')
        const agentNode = graph.nodes.find((n) => n.data.name === 'agentAgentflow')

        expect(startNode).toBeDefined()
        expect(modelNode).toBeDefined()
        expect(apiToolNode).toBeDefined()
        expect(agentNode).toBeDefined()

        // Kiểm tra cấu hình RequestsGet
        expect(apiToolNode?.data.inputs.requestsGetUrl).toBe('https://api.openweathermap.org/data/2.5')
        expect(apiToolNode?.data.inputs.requestsGetName).toBe('api_conn-weather-hanoi')

        // Kiểm tra hướng dẫn API Readonly được nhúng vào Agent system prompt
        const systemMessage = (agentNode?.data.inputs.agentMessages as any)?.[0]?.content
        expect(systemMessage).toContain('NGUYÊN TẮC AN TOÀN TRUY VẤN API (API READONLY RULES)')
        expect(systemMessage).toContain('READONLY')
    })
})
