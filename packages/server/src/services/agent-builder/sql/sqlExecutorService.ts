import { StatusCodes } from 'http-status-codes'
import { AdapterError } from '../errors/builderErrors'

export type DatabaseType = 'sqlite' | 'postgres' | 'mysql'

export interface SqlDatabaseConfig {
    id: string
    workspaceId: string
    name: string
    description?: string
    databaseType: DatabaseType
    databaseName?: string
    credentialRef?: string
    allowedTables: string[]
    defaultRowLimit?: number
    maxRowLimit?: number
    schemaOverview?: Record<string, string[]> // table -> columns
    isReadonly: boolean
    enabled: boolean
}

export interface SqlValidationResult {
    valid: boolean
    sanitizedQuery?: string
    targetTables: string[]
    appliedLimit: number
    error?: string
    violationType?: 'MUTATION_BLOCKED' | 'TABLE_NOT_ALLOWED' | 'SYNTAX_INVALID' | 'MULTI_STATEMENT_BLOCKED'
}

export interface SqlQueryResult {
    columns: string[]
    rows: Record<string, unknown>[]
    rowCount: number
    executionTimeMs: number
    sanitizedQuery: string
}

/**
 * Danh sách từ khóa DDL / DML hoặc lệnh can thiệp dữ liệu/hệ thống bị cấm tuyệt đối (Blacklist).
 */
const FORBIDDEN_SQL_KEYWORDS = [
    'DROP',
    'TRUNCATE',
    'ALTER',
    'CREATE',
    'RENAME',
    'INSERT',
    'UPDATE',
    'DELETE',
    'GRANT',
    'REVOKE',
    'EXEC',
    'EXECUTE',
    'CALL',
    'MERGE',
    'REPLACE',
    'LOCK',
    'ATTACH',
    'DETACH',
    'PRAGMA',
    'COPY',
    'INTO OUTFILE',
    'LOAD_FILE',
    'XP_CMDSHELL',
    'SHUTDOWN',
    'WAITFOR',
    'BENCHMARK',
    'SLEEP',
    'PG_SLEEP'
]

/**
 * Các bảng hệ thống nhạy cảm bị cấm truy cập.
 */
const SYSTEM_TABLES_BLACKLIST = [
    'information_schema',
    'pg_catalog',
    'sqlite_master',
    'sqlite_schema',
    'sqlite_temp_master',
    'mysql.user',
    'mysql.db',
    'sys.tables',
    'sys.columns'
]

export const DEFAULT_ROW_LIMIT = 50
export const MAX_ALLOWED_ROW_LIMIT = 100

/**
 * Service Kiểm Soát Và Thực Thi SQL Readonly (PH6-T05).
 * Áp dụng AST/Regex Safety Filter, Table Allowlist và Row Limit Enforcement.
 */
export class SqlExecutorService {
    private dbConfigs: Map<string, SqlDatabaseConfig> = new Map()

    constructor() {
        this.seedDefaultConfigs('default')
    }

    private seedDefaultConfigs(workspaceId: string): void {
        const sampleDb: SqlDatabaseConfig = {
            id: 'db-sales-analytics',
            workspaceId,
            name: 'Cơ Sở Dữ Liệu Bán Hàng (Sales DB)',
            description: 'Phân tích doanh số, đơn hàng và danh sách khách hàng',
            databaseType: 'sqlite',
            databaseName: 'sales_mart',
            allowedTables: ['orders', 'customers', 'products', 'order_items'],
            defaultRowLimit: 50,
            maxRowLimit: 100,
            schemaOverview: {
                customers: ['id', 'name', 'email', 'city', 'created_at'],
                orders: ['id', 'customer_id', 'total_amount', 'status', 'created_at'],
                products: ['id', 'name', 'price', 'category', 'stock_quantity'],
                order_items: ['id', 'order_id', 'product_id', 'quantity', 'unit_price']
            },
            isReadonly: true,
            enabled: true
        }
        this.dbConfigs.set(sampleDb.id, sampleDb)
    }

    async registerDatabase(
        params: Omit<SqlDatabaseConfig, 'id' | 'isReadonly' | 'enabled'> & { isReadonly?: boolean; enabled?: boolean }
    ): Promise<SqlDatabaseConfig> {
        if (!params.name || !params.workspaceId || !params.databaseType) {
            throw new AdapterError('REQUIRED_FIELDS_MISSING', 'Name, workspaceId và databaseType là bắt buộc', StatusCodes.BAD_REQUEST)
        }

        if (!params.allowedTables || params.allowedTables.length === 0) {
            throw new AdapterError('ALLOWED_TABLES_REQUIRED', 'Phải cấu hình ít nhất 1 bảng được phép đọc trong allowedTables', StatusCodes.BAD_REQUEST)
        }

        const id = `sql-cfg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
        const config: SqlDatabaseConfig = {
            ...params,
            id,
            isReadonly: true, // Luôn enforce readonly
            defaultRowLimit: params.defaultRowLimit || DEFAULT_ROW_LIMIT,
            maxRowLimit: params.maxRowLimit || MAX_ALLOWED_ROW_LIMIT,
            enabled: params.enabled ?? true
        }

        this.dbConfigs.set(id, config)
        return config
    }

    async getDatabase(id: string, workspaceId: string): Promise<SqlDatabaseConfig | null> {
        const config = this.dbConfigs.get(id)
        if (!config) return null
        if (config.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }
        return config
    }

    async listDatabases(workspaceId: string): Promise<SqlDatabaseConfig[]> {
        return Array.from(this.dbConfigs.values()).filter((c) => c.workspaceId === workspaceId)
    }

    /**
     * Thẩm định độ an toàn của câu lệnh SQL (Safety Guard).
     * 1. Loại bỏ comments
     * 2. Chặn multi-statement
     * 3. Chặn từ khóa DDL/DML gây biến đổi dữ liệu (chỉ cho SELECT/WITH)
     * 4. Kiểm tra Table Allowlist
     * 5. Enforce Row Limit
     */
    validateSqlQuery(query: string, config: SqlDatabaseConfig): SqlValidationResult {
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return {
                valid: false,
                targetTables: [],
                appliedLimit: 0,
                error: 'Câu lệnh SQL không được để trống',
                violationType: 'SYNTAX_INVALID'
            }
        }

        // 1. Loại bỏ comment (-- comment hoặc /* comment */) để chống bypass
        let cleanQuery = query
            .replace(/--.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim()

        // 2. Chặn multi-statements (dấu ; nối nhiều câu lệnh)
        const statements = cleanQuery.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
        if (statements.length > 1) {
            return {
                valid: false,
                targetTables: [],
                appliedLimit: 0,
                error: 'Chặn câu lệnh chứa nhiều truy vấn nối tiếp (Multi-statement SQL injection defense)',
                violationType: 'MULTI_STATEMENT_BLOCKED'
            }
        }

        cleanQuery = statements[0]

        // 3. Kiểm tra câu lệnh có bắt đầu bằng SELECT hoặc WITH (CTE) không
        const startsWithRead = /^(SELECT|WITH|EXPLAIN)\s+/i.test(cleanQuery)
        if (!startsWithRead) {
            return {
                valid: false,
                targetTables: [],
                appliedLimit: 0,
                error: 'Chỉ chấp nhận các câu lệnh truy vấn đọc dữ liệu (SELECT hoặc WITH ... SELECT)',
                violationType: 'MUTATION_BLOCKED'
            }
        }

        // 4. Quét từ khóa cấm (Forbidden Keywords Blacklist)
        for (const kw of FORBIDDEN_SQL_KEYWORDS) {
            // Sử dụng word boundary \b để tránh khớp nhầm phần tử của từ khác
            const regex = new RegExp(`\\b${kw}\\b`, 'i')
            if (regex.test(cleanQuery)) {
                return {
                    valid: false,
                    targetTables: [],
                    appliedLimit: 0,
                    error: `Từ khóa "${kw}" bị nghiêm cấm vì có nguy cơ làm thay đổi cấu trúc hoặc dữ liệu CSDL`,
                    violationType: 'MUTATION_BLOCKED'
                }
            }
        }

        // 5. Kiểm tra bảng hệ thống bị cấm
        for (const sysTable of SYSTEM_TABLES_BLACKLIST) {
            if (new RegExp(`\\b${sysTable.replace('.', '\\.')}\\b`, 'i').test(cleanQuery)) {
                return {
                    valid: false,
                    targetTables: [sysTable],
                    appliedLimit: 0,
                    error: `Truy vấn đến bảng hệ thống "${sysTable}" bị từ chối vì lý do bảo mật`,
                    violationType: 'TABLE_NOT_ALLOWED'
                }
            }
        }

        // 6. Trích xuất tên bảng từ FROM và JOIN, trừ các CTE alias (WITH cte_name AS (...))
        const cteAliases = this.extractCteAliases(cleanQuery)
        const extractedTables = this.extractTables(cleanQuery).filter(
            (t) => !cteAliases.map((c) => c.toLowerCase()).includes(t.toLowerCase())
        )
        const allowedLower = config.allowedTables.map((t) => t.toLowerCase())

        for (const table of extractedTables) {
            if (!allowedLower.includes(table.toLowerCase())) {
                return {
                    valid: false,
                    targetTables: extractedTables,
                    appliedLimit: 0,
                    error: `Bảng "${table}" không nằm trong danh mục bảng được phép truy vấn (${config.allowedTables.join(', ')})`,
                    violationType: 'TABLE_NOT_ALLOWED'
                }
            }
        }

        // 7. Enforce Row Limit
        const maxLimit = config.maxRowLimit || MAX_ALLOWED_ROW_LIMIT
        const defaultLimit = config.defaultRowLimit || DEFAULT_ROW_LIMIT

        const limitMatch = cleanQuery.match(/\bLIMIT\s+(\d+)\b/i)
        let appliedLimit = defaultLimit
        let finalQuery = cleanQuery

        if (limitMatch) {
            const requestedLimit = parseInt(limitMatch[1], 10)
            if (requestedLimit > maxLimit) {
                // Điều chỉnh lại limit tối đa
                finalQuery = cleanQuery.replace(/\bLIMIT\s+\d+\b/i, `LIMIT ${maxLimit}`)
                appliedLimit = maxLimit
            } else {
                appliedLimit = requestedLimit
            }
        } else {
            // Không có LIMIT -> Gắn tự động vào cuối
            finalQuery = `${cleanQuery} LIMIT ${defaultLimit}`
            appliedLimit = defaultLimit
        }

        return {
            valid: true,
            sanitizedQuery: finalQuery,
            targetTables: extractedTables,
            appliedLimit
        }
    }

    /**
     * Trích xuất các tên CTE alias sau WITH (ví dụ: WITH cte_1 AS (...), cte_2 AS (...))
     */
    private extractCteAliases(query: string): string[] {
        const aliases: string[] = []
        const withMatch = query.match(/^WITH\s+([a-zA-Z0-9_,\s]+)\s+AS\s*\(/i)
        if (withMatch && withMatch[1]) {
            const parts = withMatch[1].split(',')
            for (const part of parts) {
                const name = part.trim()
                if (name && !aliases.includes(name)) {
                    aliases.push(name)
                }
            }
        }
        return aliases
    }

    /**
     * Trích xuất các tên bảng xuất hiện sau FROM hoặc JOIN.
     */
    private extractTables(query: string): string[] {
        const tables: string[] = []
        // Regex tìm các định dạng: FROM <table> hoặc JOIN <table>
        const regex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi
        let match: RegExpExecArray | null

        while ((match = regex.exec(query)) !== null) {
            const tableName = match[1]
            if (tableName && !['(', 'select', 'where', 'values'].includes(tableName.toLowerCase())) {
                if (!tables.includes(tableName)) {
                    tables.push(tableName)
                }
            }
        }

        return tables
    }

    /**
     * Thực thi câu lệnh SQL một cách an toàn trên bộ mock/sandbox data.
     */
    async executeQuery(
        workspaceId: string,
        databaseId: string,
        query: string
    ): Promise<SqlQueryResult> {
        const config = await this.getDatabase(databaseId, workspaceId)
        if (!config) {
            throw new AdapterError('DATABASE_NOT_FOUND', `Cấu hình cơ sở dữ liệu ${databaseId} không tồn tại`, StatusCodes.NOT_FOUND)
        }

        if (!config.enabled) {
            throw new AdapterError('DATABASE_DISABLED', `Cơ sở dữ liệu ${config.name} đang bị tạm dừng`, StatusCodes.BAD_REQUEST)
        }

        const validation = this.validateSqlQuery(query, config)
        if (!validation.valid || !validation.sanitizedQuery) {
            throw new AdapterError('SQL_SAFETY_VIOLATION', validation.error || 'Câu lệnh SQL không an toàn', StatusCodes.BAD_REQUEST)
        }

        const start = Date.now()

        // Mock Execution Engine với dữ liệu mẫu theo schema
        const mockRows: Record<string, unknown>[] = []
        const table = validation.targetTables[0] || 'records'
        const limit = validation.appliedLimit

        for (let i = 1; i <= Math.min(limit, 3); i++) {
            if (table === 'orders') {
                mockRows.push({
                    id: i,
                    customer_id: 100 + i,
                    total_amount: i * 250000,
                    status: i % 2 === 0 ? 'completed' : 'processing',
                    created_at: new Date(Date.now() - i * 86400000).toISOString()
                })
            } else if (table === 'customers') {
                mockRows.push({
                    id: 100 + i,
                    name: `Khách hàng ${i}`,
                    email: `customer${i}@example.vn`,
                    city: i === 1 ? 'Hanoi' : 'HCMC',
                    created_at: new Date(Date.now() - i * 186400000).toISOString()
                })
            } else {
                mockRows.push({
                    id: i,
                    title: `Bản ghi mẫu ${i}`,
                    created_at: new Date().toISOString()
                })
            }
        }

        const columns = mockRows.length > 0 ? Object.keys(mockRows[0]) : ['result']

        return {
            columns,
            rows: mockRows,
            rowCount: mockRows.length,
            executionTimeMs: Math.max(1, Date.now() - start),
            sanitizedQuery: validation.sanitizedQuery
        }
    }
}

export default new SqlExecutorService()
