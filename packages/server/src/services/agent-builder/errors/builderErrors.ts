import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../../errors/internalFlowiseError'

/**
 * Cấu trúc lỗi chuẩn hóa của hệ thống Builder (PH2-T07).
 * Không rò rỉ token, raw secret hay API credentials ra ngoài.
 */
export interface BuilderErrorPayload {
    code: string
    message: string
    statusCode: number
    retryable: boolean
    details?: unknown
}

const SENSITIVE_PATTERNS = [
    /bearer\s+[a-zA-Z0-9_.-]+/gi,
    /sk-[a-zA-Z0-9_-]{20,}/gi,
    /(?:key|token|secret|password|credential)\s*[:=]\s*['"]?[a-zA-Z0-9_.-]+['"]?/gi
]

/**
 * Loại bỏ credential / token bí mật khỏi error message và details.
 */
export function sanitizeErrorMessage(text: string): string {
    if (!text || typeof text !== 'string') return ''
    let cleaned = text
    for (const pattern of SENSITIVE_PATTERNS) {
        cleaned = cleaned.replace(pattern, '[REDACTED]')
    }
    return cleaned
}

/**
 * Base error class cho toàn bộ Agent Builder subsystem.
 */
export class BuilderError extends InternalFlowiseError {
    public readonly code: string
    public readonly retryable: boolean
    public readonly details?: unknown

    constructor(statusCode: number, code: string, userFacingMessage: string, details?: unknown, retryable = false) {
        const sanitizedMsg = sanitizeErrorMessage(userFacingMessage)
        super(statusCode, sanitizedMsg)
        this.name = this.constructor.name
        this.code = code
        this.retryable = retryable
        this.details = details ? JSON.parse(JSON.stringify(details)) : undefined
    }

    toPayload(): BuilderErrorPayload {
        return {
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            retryable: this.retryable,
            details: this.details
        }
    }
}

/**
 * Lỗi phát sinh trong tầng Template & Spec Generator.
 */
export class GeneratorError extends BuilderError {
    constructor(code: string, message: string, details?: unknown, statusCode = StatusCodes.BAD_REQUEST) {
        super(statusCode, code, message, details, false)
    }
}

/**
 * Lỗi phát sinh trong bộ biên dịch tất định Deterministic Compiler.
 */
export class CompilerError extends BuilderError {
    constructor(code: string, message: string, details?: unknown, statusCode = StatusCodes.BAD_REQUEST) {
        super(statusCode, code, message, details, false)
    }
}

/**
 * Lỗi phát sinh trong tầng Flowise CRUD Adapter & Graph Validation.
 */
export class AdapterError extends BuilderError {
    constructor(code: string, message: string, statusCode = StatusCodes.BAD_REQUEST, details?: unknown) {
        super(statusCode, code, message, details, false)
    }
}

/**
 * Lỗi điều phối trong quy trình Build Pipeline (PH2-T08).
 */
export class BuildPipelineError extends BuilderError {
    constructor(code: string, message: string, statusCode = StatusCodes.BAD_REQUEST, details?: unknown, retryable = false) {
        super(statusCode, code, message, details, retryable)
    }
}

/**
 * Kiểm tra đối tượng có phải là BuilderError hợp lệ không.
 */
export function isBuilderError(error: unknown): error is BuilderError {
    return error instanceof BuilderError
}
