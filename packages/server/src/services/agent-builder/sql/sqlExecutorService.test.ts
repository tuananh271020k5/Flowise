/* eslint-disable */
import { SqlExecutorService, DEFAULT_ROW_LIMIT, MAX_ALLOWED_ROW_LIMIT } from './sqlExecutorService'
import { mkdtempSync, unlinkSync, rmdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Database } from 'sqlite3'

describe('SqlExecutorService (PH6-T05)', () => {
    let service: SqlExecutorService
    let tempDir: string
    const originalConnections = process.env.BUILDER_SQL_CONNECTIONS
    beforeAll(async () => {
        tempDir = mkdtempSync(join(tmpdir(), 'builder-sql-test-'))
        const file = join(tempDir, 'readonly.sqlite')
        const db = new Database(file)
        await new Promise<void>((resolve, reject) =>
            db.exec('CREATE TABLE orders(id INTEGER, total_amount INTEGER); INSERT INTO orders VALUES(1,25),(2,50),(3,75);', (error) =>
                error ? reject(error) : resolve()
            )
        )
        await new Promise<void>((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())))
        process.env.BUILDER_SQL_CONNECTIONS = JSON.stringify({ fixture: { workspaceId: 'ws-exec', type: 'sqlite', path: file } })
    })
    afterAll(() => {
        if (originalConnections === undefined) delete process.env.BUILDER_SQL_CONNECTIONS
        else process.env.BUILDER_SQL_CONNECTIONS = originalConnections
        unlinkSync(join(tempDir, 'readonly.sqlite'))
        rmdirSync(tempDir)
    })

    beforeEach(() => {
        service = new SqlExecutorService()
    })

    describe('registerDatabase & listDatabases', () => {
        it('should register a new valid readonly database and list by workspace', async () => {
            const db = await service.registerDatabase({
                workspaceId: 'ws-sql-1',
                name: 'Data Warehouse',
                databaseType: 'postgres',
                allowedTables: ['dim_user', 'fact_revenue'],
                defaultRowLimit: 25,
                maxRowLimit: 100
            })

            expect(db.id).toBeDefined()
            expect(db.name).toBe('Data Warehouse')
            expect(db.isReadonly).toBe(true)

            const list = await service.listDatabases('ws-sql-1')
            expect(list.length).toBe(1)
            expect(list[0].id).toBe(db.id)
        })

        it('should reject when allowedTables is empty', async () => {
            await expect(
                service.registerDatabase({
                    workspaceId: 'ws-sql-1',
                    name: 'Invalid DB',
                    databaseType: 'postgres',
                    allowedTables: []
                })
            ).rejects.toThrow('Phải cấu hình ít nhất 1 bảng')
        })

        it('should reject access across workspaces (Negative Auth)', async () => {
            const db = await service.registerDatabase({
                workspaceId: 'ws-owner',
                name: 'Owner DB',
                databaseType: 'mysql',
                allowedTables: ['inventory']
            })

            await expect(service.getDatabase(db.id, 'ws-intruder')).rejects.toThrow('Khác workspace')
        })
    })

    describe('validateSqlQuery - Safe Queries & Row Limit Enforcement', () => {
        const config = {
            id: 'db-test',
            workspaceId: 'ws-test',
            name: 'Test DB',
            databaseType: 'sqlite' as const,
            allowedTables: ['orders', 'customers', 'products'],
            defaultRowLimit: 50,
            maxRowLimit: 100,
            isReadonly: true,
            enabled: true
        }

        it('should allow simple SELECT and append default LIMIT if missing', () => {
            const result = service.validateSqlQuery('SELECT id, total_amount FROM orders WHERE status = "completed"', config)
            expect(result.valid).toBe(true)
            expect(result.appliedLimit).toBe(DEFAULT_ROW_LIMIT)
            expect(result.sanitizedQuery).toContain('LIMIT 50')
            expect(result.targetTables).toEqual(['orders'])
        })

        it('should allow SELECT with JOIN on allowed tables', () => {
            const query = 'SELECT o.id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id LIMIT 20'
            const result = service.validateSqlQuery(query, config)
            expect(result.valid).toBe(true)
            expect(result.appliedLimit).toBe(20)
            expect(result.sanitizedQuery).toContain('LIMIT 20')
            expect(result.targetTables).toContain('orders')
            expect(result.targetTables).toContain('customers')
        })

        it('should cap requested LIMIT if it exceeds maxRowLimit', () => {
            const query = 'SELECT * FROM products LIMIT 5000'
            const result = service.validateSqlQuery(query, config)
            expect(result.valid).toBe(true)
            expect(result.appliedLimit).toBe(MAX_ALLOWED_ROW_LIMIT)
            expect(result.sanitizedQuery).toContain(`LIMIT ${MAX_ALLOWED_ROW_LIMIT}`)
            expect(result.sanitizedQuery).not.toContain('LIMIT 5000')
        })

        it('should allow WITH (CTE) read query', () => {
            const query = 'WITH recent_orders AS (SELECT id, customer_id FROM orders) SELECT * FROM recent_orders'
            const result = service.validateSqlQuery(query, config)
            expect(result.valid).toBe(true)
            expect(result.sanitizedQuery).toContain('LIMIT 50')
        })
    })

    describe('validateSqlQuery - Negative Security Cases (PH6-T08)', () => {
        const config = {
            id: 'db-test',
            workspaceId: 'ws-test',
            name: 'Test DB',
            databaseType: 'sqlite' as const,
            allowedTables: ['orders', 'customers'],
            defaultRowLimit: 50,
            maxRowLimit: 100,
            isReadonly: true,
            enabled: true
        }

        it('should block DROP TABLE attack', () => {
            const result = service.validateSqlQuery('DROP TABLE orders', config)
            expect(result.valid).toBe(false)
            expect(result.violationType).toBe('MUTATION_BLOCKED')
        })

        it('should block DELETE FROM query', () => {
            const result = service.validateSqlQuery('DELETE FROM orders WHERE id = 1', config)
            expect(result.valid).toBe(false)
            expect(result.violationType).toBe('MUTATION_BLOCKED')
        })

        it('should block UPDATE query', () => {
            const result = service.validateSqlQuery('UPDATE orders SET status = "cancelled"', config)
            expect(result.valid).toBe(false)
            expect(result.violationType).toBe('MUTATION_BLOCKED')
        })

        it('should block INSERT INTO query', () => {
            const result = service.validateSqlQuery('INSERT INTO orders (id) VALUES (999)', config)
            expect(result.valid).toBe(false)
            expect(result.violationType).toBe('MUTATION_BLOCKED')
        })

        it('should block TRUNCATE query', () => {
            const result = service.validateSqlQuery('TRUNCATE TABLE orders', config)
            expect(result.valid).toBe(false)
            expect(result.violationType).toBe('MUTATION_BLOCKED')
        })

        it('should block multi-statement SQL injection with semicolon', () => {
            const result = service.validateSqlQuery('SELECT * FROM orders; DROP TABLE customers;', config)
            expect(result.valid).toBe(false)
            expect(result.violationType).toBe('MULTI_STATEMENT_BLOCKED')
        })

        it('should block tables not in allowlist', () => {
            const result = service.validateSqlQuery('SELECT * FROM secret_financial_credentials', config)
            expect(result.valid).toBe(false)
            expect(result.violationType).toBe('TABLE_NOT_ALLOWED')
            expect(result.error).toContain('không nằm trong danh mục bảng được phép')
        })

        it('should block queries on system tables (sqlite_master, pg_catalog)', () => {
            const result = service.validateSqlQuery('SELECT name FROM sqlite_master WHERE type="table"', config)
            expect(result.valid).toBe(false)
            expect(result.violationType).toBe('TABLE_NOT_ALLOWED')
            expect(result.error).toContain('bảng hệ thống')
        })

        it('should neutralize comment bypass attempts', () => {
            const queryWithComment = 'SELECT * FROM orders /* harmless comment */ WHERE id = 1'
            const result = service.validateSqlQuery(queryWithComment, config)
            expect(result.valid).toBe(true)
            expect(result.sanitizedQuery).not.toContain('/* harmless comment */')
        })
    })

    describe('executeQuery - Safe Execution', () => {
        it('should execute query successfully and return structured rows and columns', async () => {
            const db = await service.registerDatabase({
                workspaceId: 'ws-exec',
                name: 'Exec DB',
                databaseType: 'sqlite',
                credentialRef: 'fixture',
                allowedTables: ['orders']
            })

            const res = await service.executeQuery('ws-exec', db.id, 'SELECT * FROM orders LIMIT 2')
            expect(res.columns).toContain('id')
            expect(res.columns).toContain('total_amount')
            expect(res.rows.length).toBe(2)
            expect(res.rows).toEqual([
                { id: 1, total_amount: 25 },
                { id: 2, total_amount: 50 }
            ])
            expect(res.executionTimeMs).toBeGreaterThanOrEqual(0)
            expect(res.sanitizedQuery).toContain('LIMIT 2')
            const empty = await service.executeQuery('ws-exec', db.id, 'SELECT * FROM orders WHERE 1=0')
            expect(empty.rows).toEqual([])
            expect(empty.rowCount).toBe(0)
        })

        it('fails closed without a workspace-owned server connection', async () => {
            const db = await service.registerDatabase({
                workspaceId: 'ws-other',
                name: 'Missing',
                databaseType: 'sqlite',
                credentialRef: 'fixture',
                allowedTables: ['orders']
            })
            await expect(service.executeQuery('ws-other', db.id, 'SELECT * FROM orders')).rejects.toThrow('chưa có kết nối')
        })

        it('should reject execution when SQL is dangerous', async () => {
            const db = await service.registerDatabase({
                workspaceId: 'ws-exec',
                name: 'Exec DB',
                databaseType: 'sqlite',
                allowedTables: ['orders']
            })

            await expect(service.executeQuery('ws-exec', db.id, 'DROP TABLE orders')).rejects.toThrow()
        })
    })
})
