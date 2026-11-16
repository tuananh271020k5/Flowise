/* eslint-disable */
import { instantiateSqlTemplate, SQL_TEMPLATE_ID, SQL_TEMPLATE_VERSION } from './sqlTemplate.v1'
import { AgentSpec } from '../../types'

describe('SqlTemplate v1 (PH6-T07)', () => {
    it('should instantiate valid Flowise graph with Start, Model, CustomTool (SQL) and Agent', () => {
        const spec: AgentSpec = {
            schemaVersion: '1.0',
            kind: 'sql-readonly',
            name: 'Trợ Lý Phân Tích Doanh Số',
            goal: 'Truy vấn báo cáo đơn hàng và khách hàng',
            language: 'vi',
            instructions: 'Báo cáo số liệu trung thực, chi tiết',
            outputExpectations: ['Bảng số liệu Markdown'],
            modelProfileRef: 'default-builder-model',
            dataSources: [],
            tools: [],
            sqlConfig: {
                databaseType: 'sqlite',
                databaseName: 'sales_mart',
                allowedTables: ['orders', 'customers', 'products'],
                rowLimit: 25
            },
            policy: {
                visibility: 'private',
                executionMode: 'controlled-test',
                allowWrite: false
            },
            evaluationExamples: []
        }

        const graph = instantiateSqlTemplate(spec)

        expect(graph.templateId).toBe(SQL_TEMPLATE_ID)
        expect(graph.templateVersion).toBe(SQL_TEMPLATE_VERSION)
        expect(graph.nodes.length).toBe(4)
        expect(graph.edges.length).toBe(3)

        // Kiểm tra start node
        const startNode = graph.nodes.find((n) => n.data.name === 'startAgentflow')
        expect(startNode).toBeDefined()

        // Kiểm tra custom tool node
        const toolNode = graph.nodes.find((n) => n.data.name === 'customTool')
        expect(toolNode).toBeDefined()
        expect(toolNode?.data.label).toContain('sales_mart')

        // Kiểm tra agent node và safety guidelines
        const agentNode = graph.nodes.find((n) => n.data.name === 'agentAgentflow')
        expect(agentNode).toBeDefined()
        const systemPrompt = (agentNode?.data.inputs.agentMessages as any)?.[0]?.content
        expect(systemPrompt).toContain('SQL READONLY RULES')
        expect(systemPrompt).toContain('SELECT')
        expect(systemPrompt).toContain('orders, customers, products')
        expect(systemPrompt).toContain('25 dòng')
    })
})
