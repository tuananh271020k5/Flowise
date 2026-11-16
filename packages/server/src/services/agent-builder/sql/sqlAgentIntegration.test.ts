/* eslint-disable */
import sqlExecutorService from './sqlExecutorService'
import collectorService from '../collectorService'
import { createAgentPlan, validateAgentPlan } from '../generator/agentPlan'
import { AgentflowCompiler } from '../generator/compiler'
import { AgentSpec } from '../types'

describe('PH6-T05 đến PH6-T08: SQL Agent Readonly & Security Integration Suite', () => {
    const workspaceId = 'ws-sql-integration'
    let dbId: string

    beforeAll(async () => {
        const db = await sqlExecutorService.registerDatabase({
            workspaceId,
            name: 'Production Analytics DB',
            description: 'Kho dữ liệu phân tích vận hành',
            databaseType: 'sqlite',
            databaseName: 'prod_mart',
            allowedTables: ['orders', 'customers', 'products', 'order_items'],
            defaultRowLimit: 30,
            maxRowLimit: 100
        })
        dbId = db.id
    })

    it('Hoàn thành toàn bộ chu trình: Đăng ký CSDL -> Thu thập Chat tiếng Việt -> Plan -> Biên dịch -> Thực thi SQL an toàn', async () => {
        // Bước 1: Người dùng chat tiếng Việt yêu cầu tạo SQL Agent
        const userPrompt = 'Tôi muốn tạo một trợ lý phân tích dữ liệu truy vấn SQL bảng orders và customers với giới hạn 20 dòng'
        const patchRes = collectorService.extractPatch(userPrompt)

        expect(patchRes.patch.kind).toBe('sql-readonly')
        expect(patchRes.patch.sqlConfig?.allowedTables).toContain('orders')
        expect(patchRes.patch.sqlConfig?.allowedTables).toContain('customers')
        expect(patchRes.patch.sqlConfig?.rowLimit).toBe(20)

        // Bước 2: Hoàn thiện AgentSpec đạt buildReady
        const spec: AgentSpec = {
            schemaVersion: '1.0',
            kind: 'sql-readonly',
            name: 'Trợ Lý Phân Tích Đơn Hàng',
            goal: 'Truy vấn và phân tích báo cáo doanh số đơn hàng và khách hàng',
            language: 'vi',
            instructions: 'Luôn trả lời trung thực, chính xác theo số liệu trong bảng cơ sở dữ liệu',
            outputExpectations: ['Bảng Markdown'],
            modelProfileRef: 'default-builder-model',
            dataSources: [],
            tools: [],
            sqlConfig: {
                databaseType: 'sqlite',
                databaseName: 'prod_mart',
                allowedTables: ['orders', 'customers'],
                rowLimit: 20
            },
            policy: {
                visibility: 'private',
                executionMode: 'controlled-test',
                allowWrite: false
            },
            evaluationExamples: [
                {
                    input: 'Báo cáo tổng đơn hàng hôm nay',
                    assertions: ['Có kết quả thống kê đơn hàng']
                }
            ]
        }

        // Bước 3: Lập AgentPlan
        const plan = createAgentPlan(spec, 'rev-sql-001')
        expect(plan.templateId).toBe('sql-flow-template')
        expect(plan.expectedChecks).toContain('sqlReadonlyPolicyEnforced')
        expect(plan.expectedChecks).toContain('rowLimitEnforced')

        const validation = validateAgentPlan(plan)
        expect(validation.valid).toBe(true)

        // Bước 4: Biên dịch sang Flowise Agentflow V2
        const compiler = new AgentflowCompiler()
        const graph = compiler.compile(plan)

        expect(graph.templateId).toBe('sql-flow-template')
        expect(graph.nodes.some((n) => n.data.name === 'startAgentflow')).toBe(true)
        expect(graph.nodes.some((n) => n.data.name === 'customTool')).toBe(true)
        expect(graph.nodes.some((n) => n.data.name === 'agentAgentflow')).toBe(true)

        // Bước 5: Thực thi an toàn câu lệnh SQL
        const query = 'SELECT customer_id, count(id) as order_count FROM orders GROUP BY customer_id'
        const execResult = await sqlExecutorService.executeQuery(workspaceId, dbId, query)

        expect(execResult.sanitizedQuery).toContain('LIMIT 30')
        expect(execResult.rowCount).toBeGreaterThan(0)
        expect(execResult.columns.length).toBeGreaterThan(0)
    })

    describe('PH6-T08: Bộ 10 Kịch Bản SQL An Toàn và Negative Security Cases', () => {
        let dbConfig: any

        beforeAll(async () => {
            dbConfig = await sqlExecutorService.getDatabase(dbId, workspaceId)
        })

        // 1. SELECT đơn giản
        it('Kịch bản 1: Cho phép SELECT đơn giản và tự động gán LIMIT', () => {
            const res = sqlExecutorService.validateSqlQuery('SELECT id, status FROM orders', dbConfig)
            expect(res.valid).toBe(true)
            expect(res.sanitizedQuery).toContain('LIMIT 30')
        })

        // 2. SELECT GROUP BY và COUNT
        it('Kịch bản 2: Cho phép SELECT hàm tổng hợp và GROUP BY', () => {
            const res = sqlExecutorService.validateSqlQuery('SELECT status, count(*) FROM orders GROUP BY status', dbConfig)
            expect(res.valid).toBe(true)
            expect(res.targetTables).toContain('orders')
        })

        // 3. SELECT JOIN nhiều bảng trong allowlist
        it('Kịch bản 3: Cho phép JOIN các bảng nằm trong allowlist', () => {
            const res = sqlExecutorService.validateSqlQuery(
                'SELECT o.id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id',
                dbConfig
            )
            expect(res.valid).toBe(true)
            expect(res.targetTables).toContain('orders')
            expect(res.targetTables).toContain('customers')
        })

        // 4. Giới hạn LIMIT khi người dùng yêu cầu vượt quá maxRowLimit
        it('Kịch bản 4: Ép buộc giới hạn LIMIT tối đa (Cap Max Limit)', () => {
            const res = sqlExecutorService.validateSqlQuery('SELECT * FROM orders LIMIT 9999', dbConfig)
            expect(res.valid).toBe(true)
            expect(res.appliedLimit).toBe(100)
            expect(res.sanitizedQuery).toContain('LIMIT 100')
        })

        // 5. Cho phép WITH (CTE) đọc
        it('Kịch bản 5: Cho phép CTE WITH read query', () => {
            const res = sqlExecutorService.validateSqlQuery(
                'WITH summary AS (SELECT customer_id FROM orders) SELECT * FROM summary',
                dbConfig
            )
            expect(res.valid).toBe(true)
        })

        // 6. Chặn DROP TABLE
        it('Kịch bản 6 (Negative): Chặn tuyệt đối câu lệnh DROP TABLE', () => {
            const res = sqlExecutorService.validateSqlQuery('DROP TABLE orders', dbConfig)
            expect(res.valid).toBe(false)
            expect(res.violationType).toBe('MUTATION_BLOCKED')
        })

        // 7. Chặn DELETE FROM
        it('Kịch bản 7 (Negative): Chặn tuyệt đối câu lệnh DELETE FROM', () => {
            const res = sqlExecutorService.validateSqlQuery('DELETE FROM orders WHERE id = 1', dbConfig)
            expect(res.valid).toBe(false)
            expect(res.violationType).toBe('MUTATION_BLOCKED')
        })

        // 8. Chặn UPDATE / INSERT / TRUNCATE
        it('Kịch bản 8 (Negative): Chặn các câu lệnh thay đổi dữ liệu UPDATE / INSERT', () => {
            const resUpdate = sqlExecutorService.validateSqlQuery('UPDATE customers SET name = "Hacked"', dbConfig)
            expect(resUpdate.valid).toBe(false)
            expect(resUpdate.violationType).toBe('MUTATION_BLOCKED')

            const resInsert = sqlExecutorService.validateSqlQuery('INSERT INTO orders (id) VALUES (10)', dbConfig)
            expect(resInsert.valid).toBe(false)
            expect(resInsert.violationType).toBe('MUTATION_BLOCKED')
        })

        // 9. Chặn Multi-statement SQL Injection
        it('Kịch bản 9 (Negative): Chặn Multi-statement nối chuỗi với dấu chấm phẩy', () => {
            const res = sqlExecutorService.validateSqlQuery('SELECT * FROM orders; DROP TABLE customers;', dbConfig)
            expect(res.valid).toBe(false)
            expect(res.violationType).toBe('MULTI_STATEMENT_BLOCKED')
        })

        // 10. Chặn bảng ngoài allowlist và bảng hệ thống
        it('Kịch bản 10 (Negative): Chặn truy cập bảng bí mật ngoài danh mục và bảng hệ thống', () => {
            const resForbiddenTable = sqlExecutorService.validateSqlQuery('SELECT * FROM payroll_salaries', dbConfig)
            expect(resForbiddenTable.valid).toBe(false)
            expect(resForbiddenTable.violationType).toBe('TABLE_NOT_ALLOWED')

            const resSysTable = sqlExecutorService.validateSqlQuery('SELECT * FROM sqlite_master', dbConfig)
            expect(resSysTable.valid).toBe(false)
            expect(resSysTable.violationType).toBe('TABLE_NOT_ALLOWED')
        })
    })
})
