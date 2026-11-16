/* eslint-disable */
import apiConnectorService from '../api-connectors/apiConnectorService'
import sqlExecutorService from '../sql/sqlExecutorService'
import customToolSandboxService from '../custom-tools/customToolSandboxService'
import { createAgentPlan, validateAgentPlan } from '../generator/agentPlan'
import { AgentflowCompiler } from '../generator/compiler'
import { AgentSpec } from '../types'

describe('PH6-T11: Multi-Source Agent Integration Suite (API + SQL + Custom Tools)', () => {
    const workspaceId = 'ws-multi-source-test'
    let connectorId: string
    let dbId: string
    let toolId: string

    beforeAll(async () => {
        // 1. Đăng ký API Connector (Tỷ giá ngoại tệ)
        const conn = await apiConnectorService.registerConnector({
            workspaceId,
            name: 'Tỷ Giá Ngoại Tệ (Currency API)',
            description: 'Tra cứu tỷ giá USD/VND trực tuyến',
            baseUrl: 'https://api.exchangerate.host',
            enabled: true,
            operations: [
                {
                    id: 'getLatestRates',
                    name: 'Lấy tỷ giá mới nhất',
                    method: 'GET',
                    path: '/latest',
                    description: 'Tỷ giá hối đoái thời gian thực',
                    isReadonly: true
                }
            ]
        })
        connectorId = conn.id

        // 2. Đăng ký SQL Database Readonly
        const db = await sqlExecutorService.registerDatabase({
            workspaceId,
            name: 'Kho Dữ Liệu Bán Hàng',
            databaseType: 'sqlite',
            databaseName: 'retail_warehouse',
            allowedTables: ['orders', 'customers', 'products'],
            defaultRowLimit: 25,
            maxRowLimit: 100
        })
        dbId = db.id

        // 3. Đăng ký Custom Tool Sandbox (Quy đổi tiền tệ & Chiết khấu)
        const customTool = await customToolSandboxService.registerCustomTool({
            workspaceId,
            name: 'Quy Đổi Tỷ Giá Và Chiết Khấu',
            description: 'Chuyển đổi USD sang VND và tính toán chiết khấu đơn hàng',
            inputSchema: {
                amountUsd: { type: 'number', required: true },
                rate: { type: 'number', required: true },
                discountPercent: { type: 'number', required: true }
            },
            code: `
                const vnd = amountUsd * rate;
                const discount = (vnd * discountPercent) / 100;
                return {
                    originalVnd: vnd,
                    discountVnd: discount,
                    finalVnd: vnd - discount
                };
            `,
            enabled: true
        })
        toolId = customTool.id
    })

    it('Hoàn thành toàn bộ chu trình Agent Đa Nguồn: Thu thập -> Plan -> Compile -> Kiểm tra phối hợp 3 nguồn an toàn', async () => {
        // 1. Khai báo Spec Agent Đa Nguồn (Multi-source Spec)
        const multiSpec: AgentSpec = {
            schemaVersion: '1.0',
            kind: 'sql-readonly',
            name: 'Trợ Lý Kinh Doanh Quốc Tế',
            goal: 'Truy vấn đơn hàng, cập nhật tỷ giá ngoại tệ và tính chiết khấu thanh toán',
            language: 'vi',
            instructions: 'Báo cáo số liệu chi tiết bằng bảng Markdown tiếng Việt',
            outputExpectations: ['Bảng báo cáo tài chính'],
            modelProfileRef: 'default-builder-model',
            dataSources: [],
            tools: [
                {
                    id: 't_custom_calc',
                    name: 'Quy Đổi Tỷ Giá Và Chiết Khấu',
                    type: 'customTool',
                    config: { selectedTool: toolId }
                }
            ],
            apiConnectors: [
                {
                    connectorId,
                    name: 'Currency API',
                    baseUrl: 'https://api.exchangerate.host',
                    allowedOperations: ['getLatestRates']
                }
            ],
            sqlConfig: {
                databaseType: 'sqlite',
                databaseName: 'retail_warehouse',
                allowedTables: ['orders', 'customers'],
                rowLimit: 25
            },
            policy: {
                visibility: 'private',
                executionMode: 'controlled-test',
                allowWrite: false
            },
            evaluationExamples: [
                {
                    input: 'Báo cáo doanh số đơn hàng quốc tế kèm chiết khấu',
                    assertions: ['Có bảng số liệu']
                }
            ]
        }

        // 2. Lập kế hoạch AgentPlan
        const plan = createAgentPlan(multiSpec, 'rev-multi-100')
        expect(plan.templateId).toBe('sql-flow-template')

        const planCheck = validateAgentPlan(plan)
        expect(planCheck.valid).toBe(true)

        // 3. Biên dịch Deterministic sang Flowise Agentflow V2
        const compiler = new AgentflowCompiler()
        const graph = compiler.compile(plan)

        expect(graph.nodes.length).toBeGreaterThanOrEqual(4)
        expect(graph.edges.length).toBeGreaterThanOrEqual(3)

        // 4. Kiểm tra độc lập tính an toàn của cả 3 nguồn:
        // Nguồn 1: API Connector Allowlist
        const apiCheck = apiConnectorService.validateApiCall({
            workspaceId,
            connectorId,
            operationId: 'getLatestRates',
            url: 'https://api.exchangerate.host/latest',
            method: 'GET',
            isReadonlyContext: true
        })
        expect(apiCheck.allowed).toBe(true)

        // Nguồn 2: SQL Readonly & Table Allowlist
        const sqlResult = await sqlExecutorService.executeQuery(
            workspaceId,
            dbId,
            'SELECT customer_id, sum(total_amount) as total FROM orders GROUP BY customer_id LIMIT 10'
        )
        expect(sqlResult.sanitizedQuery).toContain('LIMIT 10')
        expect(sqlResult.rowCount).toBeGreaterThan(0)

        // Nguồn 3: Custom Tool Sandbox
        const toolResult = await customToolSandboxService.executeTool(workspaceId, toolId, {
            amountUsd: 100,
            rate: 25400,
            discountPercent: 10
        })
        expect(toolResult.success).toBe(true)
        expect((toolResult.output as any).finalVnd).toBe(2286000)
    })
})
