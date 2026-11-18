import { SqlDatabaseConfig, SqlQueryResult } from './sqlExecutorService'

interface ServerConnection {
    workspaceId: string
    type: string
    path?: string
    url?: string
}

export async function queryReadonly(config: SqlDatabaseConfig, query: string, limit: number): Promise<SqlQueryResult> {
    const connections: Record<string, ServerConnection> = JSON.parse(process.env.BUILDER_SQL_CONNECTIONS || '{}')
    const connection = connections[config.credentialRef || '']
    if (!connection || connection.workspaceId !== config.workspaceId || connection.type !== config.databaseType) {
        throw new Error('SQL chưa có kết nối readonly được server cấp cho workspace này. Cấu hình BUILDER_SQL_CONNECTIONS.')
    }
    const boundedQuery = `SELECT * FROM (${query.replace(/;\s*$/, '')}) AS builder_rows LIMIT ${Math.min(limit, 100)}`
    const start = Date.now()
    let rows: Record<string, unknown>[] = []
    if (connection.type === 'sqlite') {
        if (!connection.path) throw new Error('SQLite path is required')
        const sqlite = await import('sqlite3')
        const db = await new Promise<import('sqlite3').Database>((resolve, reject) => {
            const instance = new sqlite.Database(connection.path!, sqlite.OPEN_READONLY, (error) =>
                error ? reject(error) : resolve(instance)
            )
        })
        try {
            await new Promise<void>((resolve, reject) => db.run('PRAGMA query_only=ON', (error) => (error ? reject(error) : resolve())))
            rows = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    db.interrupt()
                    reject(new Error('SQL timeout'))
                }, 5000)
                db.all(boundedQuery, (error: Error | null, data: Record<string, unknown>[]) => {
                    clearTimeout(timer)
                    error ? reject(error) : resolve(data)
                })
            })
        } finally {
            await new Promise<void>((resolve) => db.close(() => resolve()))
        }
    } else if (connection.type === 'postgres') {
        const { Client } = await import('pg')
        const client = new Client({ connectionString: connection.url, connectionTimeoutMillis: 5000, statement_timeout: 5000 })
        await client.connect()
        try {
            await client.query('BEGIN READ ONLY')
            rows = (await client.query(boundedQuery)).rows
        } finally {
            await client.query('ROLLBACK').catch(() => {})
            await client.end()
        }
    } else if (connection.type === 'mysql') {
        const mysql = await import('mysql2/promise')
        const client = await mysql.createConnection(connection.url || '')
        try {
            await client.query('START TRANSACTION READ ONLY')
            const [data] = await client.query({ sql: boundedQuery, timeout: 5000 })
            rows = data as Record<string, unknown>[]
        } finally {
            await client.rollback().catch(() => {})
            await client.end()
        }
    } else throw new Error('Unsupported database type')
    return {
        columns: Object.keys(rows[0] || {}),
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - start,
        sanitizedQuery: boundedQuery
    }
}
