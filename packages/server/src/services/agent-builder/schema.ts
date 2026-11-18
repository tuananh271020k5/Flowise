import { z } from 'zod'
import { WorkflowSchema } from './workflow'
import { AgentSpec, AgentSpecValidationResult } from './types'

/**
 * Regex detection for common secret/credential patterns to prevent accidental leaks.
 */
const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9_-]{20,}/i, // OpenAI-style keys
    /Bearer\s+[a-zA-Z0-9_.-]{20,}/i, // Bearer tokens
    /ghp_[a-zA-Z0-9]{36}/i, // GitHub personal tokens
    /xox[baprs]-[a-zA-Z0-9-]+/i, // Slack tokens
    /AIza[0-9A-Za-z-_]{35}/i // Google API keys
]

/**
 * Helper to check if a string contains known credential/secret patterns.
 */
export const containsSecret = (text: string): boolean => {
    if (!text || typeof text !== 'string') return false
    return SECRET_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * Helper to detect suspicious HTML/script tags that could lead to XSS/injections.
 */
export const containsScriptTag = (text: string): boolean => {
    if (!text || typeof text !== 'string') return false
    return /<script[\s\S]*?>[\s\S]*?<\/script>/i.test(text) || /javascript:/i.test(text)
}

/**
 * Safe string validator with length constraints and safety checks.
 */
const safeString = (min: number, max: number, fieldName: string) =>
    z
        .string()
        .trim()
        .min(min, `${fieldName} phải có ít nhất ${min} ký tự`)
        .max(max, `${fieldName} không được vượt quá ${max} ký tự`)
        .refine((val) => !containsSecret(val), {
            message: `${fieldName} chứa token/khóa bí mật hoặc credential, không được phép đưa vào spec`
        })
        .refine((val) => !containsScriptTag(val), {
            message: `${fieldName} chứa mã script không an toàn`
        })

/**
 * Evaluation example schema for controlled testing.
 */
export const EvaluationExampleSchema = z
    .object({
        input: safeString(1, 1000, 'Đầu vào thử nghiệm (input)'),
        assertions: z
            .array(safeString(1, 500, 'Assertion'))
            .min(1, 'Mỗi câu hỏi thử nghiệm cần ít nhất 1 assertion kiểm chứng')
            .max(10, 'Tối đa 10 assertions cho mỗi câu hỏi thử nghiệm')
    })
    .strict()

/**
 * Data source reference schema.
 */
export const DataSourceRefSchema = z
    .object({
        id: safeString(1, 100, 'DataSource ID'),
        type: safeString(1, 100, 'DataSource Type'),
        name: safeString(1, 100, 'DataSource Name'),
        config: z.record(z.string(), z.unknown()).optional()
    })
    .strict()

/**
 * Tool reference schema.
 */
export const ToolRefSchema = z
    .object({
        id: safeString(1, 100, 'Tool ID'),
        name: safeString(1, 100, 'Tool Name'),
        type: safeString(1, 100, 'Tool Type'),
        config: z.record(z.string(), z.unknown()).optional()
    })
    .strict()

/**
 * API connector reference schema (PH6-T02).
 */
export const ApiConnectorRefSchema = z
    .object({
        connectorId: safeString(1, 100, 'Connector ID'),
        name: safeString(1, 100, 'Connector Name'),
        baseUrl: safeString(1, 500, 'Base URL'),
        allowedOperations: z.array(safeString(1, 100, 'Operation ID')).max(20).optional()
    })
    .strict()

/**
 * SQL agent configuration schema (PH6-T06).
 */
export const SqlAgentConfigSchema = z
    .object({
        databaseType: z.enum(['sqlite', 'postgres', 'mysql']).default('sqlite'),
        databaseName: safeString(1, 100, 'Database Name').optional(),
        credentialRef: safeString(1, 100, 'Credential Ref').optional(),
        allowedTables: z
            .array(safeString(1, 100, 'Tên bảng (Table)'))
            .min(1, 'Cần ít nhất 1 bảng được phép truy vấn trong allowedTables')
            .max(50, 'Tối đa 50 bảng'),
        rowLimit: z.number().int().min(1).max(100).default(50),
        schemaOverview: z.record(z.string(), z.array(z.string())).optional()
    })
    .strict()

/**
 * Execution and visibility policy schema.
 */
export const PolicySchema = z
    .object({
        visibility: z.enum(['private', 'public']).default('private'),
        executionMode: z.enum(['controlled-test', 'standard']).default('controlled-test'),
        allowWrite: z.boolean().default(false)
    })
    .strict()

/**
 * Complete AgentSpec v1 schema.
 * Rejects unknown fields via .strict() to prevent tenantId / credential bypass.
 */
export const AgentSpecSchema = z
    .object({
        schemaVersion: z.literal('1.0'),
        kind: z.enum(['assistant', 'knowledge', 'api-readonly', 'data-readonly', 'sql-readonly']).default('assistant'),
        name: safeString(1, 100, 'Tên trợ lý (name)'),
        goal: safeString(5, 1000, 'Mục tiêu trợ lý (goal)'),
        language: z.string().trim().min(2, 'Mã ngôn ngữ tối thiểu 2 ký tự').max(10, 'Mã ngôn ngữ tối đa 10 ký tự').default('vi'),
        instructions: safeString(5, 4000, 'Hướng dẫn chỉ dẫn (instructions)'),
        outputExpectations: z
            .array(safeString(1, 500, 'Kỳ vọng đầu ra (outputExpectation)'))
            .max(10, 'Tối đa 10 kỳ vọng đầu ra')
            .default([]),
        modelProfileRef: z
            .string()
            .trim()
            .min(1, 'modelProfileRef không được để trống')
            .max(100, 'modelProfileRef tối đa 100 ký tự')
            .refine((val) => !containsSecret(val), {
                message: 'modelProfileRef chỉ là tên định danh logic, không được chứa khóa API hoặc secret'
            })
            .default('default-builder-model'),
        dataSources: z.array(DataSourceRefSchema).max(10, 'Tối đa 10 data sources').default([]),
        tools: z.array(ToolRefSchema).max(20, 'Tối đa 20 tools').default([]),
        apiConnectors: z.array(ApiConnectorRefSchema).max(10, 'Tối đa 10 API connectors').optional(),
        sqlConfig: SqlAgentConfigSchema.optional(),
        workflow: WorkflowSchema.refine(
            (value) => !containsSecret(JSON.stringify(value)) && !containsScriptTag(JSON.stringify(value)),
            'Workflow không được chứa secret/script'
        ).optional(),
        policy: PolicySchema.default({
            visibility: 'private',
            executionMode: 'controlled-test',
            allowWrite: false
        }),
        evaluationExamples: z.array(EvaluationExampleSchema).max(10, 'Tối đa 10 evaluation examples').default([])
    })
    .strict()

/**
 * Validates raw data against AgentSpecSchema.
 */
export const validateAgentSpec = (data: unknown): AgentSpecValidationResult => {
    const result = AgentSpecSchema.safeParse(data)
    if (result.success) {
        return {
            success: true,
            data: result.data as AgentSpec
        }
    }
    const errors = result.error.issues.map((err) => `${err.path.join('.')}: ${err.message}`)
    return {
        success: false,
        errors
    }
}
