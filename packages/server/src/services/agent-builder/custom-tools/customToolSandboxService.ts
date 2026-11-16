import { StatusCodes } from 'http-status-codes'
import { AdapterError } from '../errors/builderErrors'
import vm from 'vm'

export interface CustomToolDefinition {
    id: string
    workspaceId: string
    name: string
    description: string
    inputSchema: Record<string, { type: 'string' | 'number' | 'boolean' | 'object'; description?: string; required?: boolean }>
    code: string
    enabled: boolean
    createdDate: Date
    updatedDate: Date
}

export interface ToolCodeValidationResult {
    valid: boolean
    errors: string[]
    detectedForbiddenAPIs?: string[]
}

export interface ToolExecutionResult {
    success: boolean
    output?: unknown
    error?: string
    executionTimeMs: number
}

/**
 * Danh sách các từ khóa, modules hoặc global APIs nguy hiểm bị cấm tuyệt đối trong Custom Tool code.
 */
const FORBIDDEN_CODE_PATTERNS = [
    { pattern: /\bchild_process\b/i, name: 'child_process' },
    { pattern: /\bfs\b/i, name: 'fs (filesystem)' },
    { pattern: /\bprocess\.exit\b/i, name: 'process.exit' },
    { pattern: /\bprocess\.kill\b/i, name: 'process.kill' },
    { pattern: /\bprocess\.env\b/i, name: 'process.env' },
    { pattern: /\bcluster\b/i, name: 'cluster' },
    { pattern: /\bworker_threads\b/i, name: 'worker_threads' },
    { pattern: /\bvm\b/i, name: 'vm module' },
    { pattern: /\beval\s*\(/i, name: 'eval()' },
    { pattern: /\bFunction\s*\(/i, name: 'Function() constructor' },
    { pattern: /\b__proto__\b/i, name: '__proto__ (prototype pollution)' },
    { pattern: /\bconstructor\s*\.\s*constructor\b/i, name: 'constructor sandbox escape' }
]

export const DEFAULT_SANDBOX_TIMEOUT_MS = 3000

/**
 * Service Quản Lý Và Thực Thi Custom Tools Trong Sandbox An Toàn (PH6-T09).
 */
export class CustomToolSandboxService {
    private tools: Map<string, CustomToolDefinition> = new Map()

    constructor() {
        this.seedDefaultTools('default')
    }

    private seedDefaultTools(workspaceId: string): void {
        const discountCalcTool: CustomToolDefinition = {
            id: 'tool-discount-calc',
            workspaceId,
            name: 'Tính Chiết Khấu Đơn Hàng',
            description: 'Tính toán số tiền được giảm giá và tổng tiền thanh toán sau chiết khấu',
            inputSchema: {
                totalAmount: { type: 'number', description: 'Tổng tiền gốc', required: true },
                discountPercentage: { type: 'number', description: 'Tỷ lệ giảm giá (%)', required: true }
            },
            code: `
                const discount = (totalAmount * discountPercentage) / 100;
                const finalAmount = totalAmount - discount;
                return {
                    original: totalAmount,
                    discountAmount: discount,
                    finalAmount: finalAmount,
                    currency: 'VND'
                };
            `,
            enabled: true,
            createdDate: new Date(),
            updatedDate: new Date()
        }
        this.tools.set(discountCalcTool.id, discountCalcTool)
    }

    /**
     * Thẩm định mã nguồn của Custom Tool (Static Code Analysis Guard).
     */
    validateToolCode(code: string): ToolCodeValidationResult {
        const errors: string[] = []
        const detected: string[] = []

        if (!code || typeof code !== 'string' || code.trim().length === 0) {
            return {
                valid: false,
                errors: ['Mã nguồn code của Custom Tool không được để trống']
            }
        }

        // Quét các từ khóa cấm
        for (const item of FORBIDDEN_CODE_PATTERNS) {
            if (item.pattern.test(code)) {
                errors.push(`Mã nguồn chứa API bị nghiêm cấm vì lý do bảo mật: ${item.name}`)
                detected.push(item.name)
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            detectedForbiddenAPIs: detected
        }
    }

    async registerCustomTool(
        params: Omit<CustomToolDefinition, 'id' | 'createdDate' | 'updatedDate'>
    ): Promise<CustomToolDefinition> {
        if (!params.name || !params.workspaceId || !params.code) {
            throw new AdapterError('REQUIRED_FIELDS_MISSING', 'Name, workspaceId và code là bắt buộc', StatusCodes.BAD_REQUEST)
        }

        const validation = this.validateToolCode(params.code)
        if (!validation.valid) {
            throw new AdapterError('UNSAFE_TOOL_CODE', `Mã nguồn không an toàn: ${validation.errors.join('; ')}`, StatusCodes.BAD_REQUEST)
        }

        const id = `tool-custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
        const newTool: CustomToolDefinition = {
            ...params,
            id,
            enabled: params.enabled ?? true,
            createdDate: new Date(),
            updatedDate: new Date()
        }

        this.tools.set(id, newTool)
        return newTool
    }

    async getCustomTool(id: string, workspaceId: string): Promise<CustomToolDefinition | null> {
        const tool = this.tools.get(id)
        if (!tool) return null
        if (tool.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }
        return tool
    }

    async listCustomTools(workspaceId: string): Promise<CustomToolDefinition[]> {
        return Array.from(this.tools.values()).filter((t) => t.workspaceId === workspaceId)
    }

    /**
     * Thực thi mã nguồn Custom Tool trong môi trường Node.js VM Sandbox an toàn với Timeout.
     */
    async executeTool(
        workspaceId: string,
        toolId: string,
        params: Record<string, unknown>,
        timeoutMs: number = DEFAULT_SANDBOX_TIMEOUT_MS
    ): Promise<ToolExecutionResult> {
        const tool = await this.getCustomTool(toolId, workspaceId)
        if (!tool) {
            throw new AdapterError('TOOL_NOT_FOUND', `Custom Tool ${toolId} không tồn tại`, StatusCodes.NOT_FOUND)
        }

        if (!tool.enabled) {
            throw new AdapterError('TOOL_DISABLED', `Custom Tool ${tool.name} đang bị tạm ngưng`, StatusCodes.BAD_REQUEST)
        }

        return this.executeRawCode(tool.code, params, timeoutMs)
    }

    /**
     * Thực thi trực tiếp chuỗi code trong sandbox có kiểm soát.
     */
    async executeRawCode(
        code: string,
        params: Record<string, unknown>,
        timeoutMs: number = DEFAULT_SANDBOX_TIMEOUT_MS
    ): Promise<ToolExecutionResult> {
        const validation = this.validateToolCode(code)
        if (!validation.valid) {
            return {
                success: false,
                error: `Mã nguồn bị từ chối: ${validation.errors.join('; ')}`,
                executionTimeMs: 0
            }
        }

        const start = Date.now()

        // Chuẩn bị sandbox context độc lập, đóng băng các API nguy hiểm
        const sandbox: Record<string, unknown> = {
            ...params,
            console: {
                log: () => {},
                warn: () => {},
                error: () => {}
            },
            Math,
            Date,
            JSON,
            parseInt,
            parseFloat,
            String,
            Number,
            Boolean,
            Array,
            Object: {
                keys: Object.keys,
                values: Object.values,
                entries: Object.entries,
                assign: Object.assign
            }
        }

        try {
            const context = vm.createContext(sandbox)
            // Bọc code trong một IIFE để nhận return
            const wrappedScript = `
                (function() {
                    ${code}
                })()
            `
            const script = new vm.Script(wrappedScript)
            const result = script.runInContext(context, {
                timeout: timeoutMs,
                displayErrors: true
            })

            return {
                success: true,
                output: result,
                executionTimeMs: Math.max(1, Date.now() - start)
            }
        } catch (err: any) {
            return {
                success: false,
                error: err?.message || 'Lỗi thực thi trong sandbox',
                executionTimeMs: Math.max(1, Date.now() - start)
            }
        }
    }
}

export default new CustomToolSandboxService()
