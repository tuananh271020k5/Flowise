/**
 * Credential & Secret Redaction Service (PH5-T03).
 * Đảm bảo bí mật, tokens, API keys và mật khẩu không bao giờ rò rỉ ra
 * browser, log files, audit trail hoặc response payload.
 */

export const SENSITIVE_KEY_NAMES = new Set([
    'apikey',
    'api_key',
    'apisecret',
    'api_secret',
    'secret',
    'password',
    'passphrase',
    'token',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'privatekey',
    'private_key',
    'credential',
    'credentials',
    'authorization'
])

export interface SensitivePattern {
    name: string
    getRegex: () => RegExp
    replacement: string
}

export const SENSITIVE_PATTERNS: SensitivePattern[] = [
    // Anthropic API Keys (đặt trước OpenAI vì cùng bắt đầu bằng sk-)
    {
        name: 'anthropic',
        getRegex: () => /sk-ant-[a-zA-Z0-9_-]{20,}/gi,
        replacement: '[REDACTED_ANTHROPIC_KEY]'
    },
    // OpenAI API Keys
    {
        name: 'openai',
        getRegex: () => /sk-[a-zA-Z0-9_-]{20,}/gi,
        replacement: '[REDACTED_OPENAI_KEY]'
    },
    // Google Gemini API Keys (AIza + 30 đến 40 ký tự)
    {
        name: 'gemini',
        getRegex: () => /AIza[0-9A-Za-z_-]{30,40}/g,
        replacement: '[REDACTED_GEMINI_KEY]'
    },
    // HuggingFace Tokens
    {
        name: 'huggingface',
        getRegex: () => /hf_[a-zA-Z0-9]{34}/gi,
        replacement: '[REDACTED_HF_TOKEN]'
    },
    // Bearer Authorization Header (đặt trước JWT)
    {
        name: 'bearer',
        getRegex: () => /Bearer\s+[a-zA-Z0-9_.+=/-]+/gi,
        replacement: 'Bearer [REDACTED_BEARER_TOKEN]'
    },
    // JWT Tokens
    {
        name: 'jwt',
        getRegex: () => /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/gi,
        replacement: '[REDACTED_JWT]'
    },
    // Database Connection Strings
    {
        name: 'database',
        getRegex: () => /(mongodb|postgres|postgresql|mysql|redis):\/\/[^\s'"]+/gi,
        replacement: '$1://[REDACTED_DB_URL]'
    }
]

export class RedactionService {
    /**
     * Làm sạch chuỗi văn bản khỏi toàn bộ credential và secret nhạy cảm.
     */
    redactString(text: string): string {
        if (!text || typeof text !== 'string') return text

        let result = text
        for (const pattern of SENSITIVE_PATTERNS) {
            result = result.replace(pattern.getRegex(), pattern.replacement)
        }
        return result
    }

    /**
     * Kiểm tra nhanh xem chuỗi văn bản có chứa secret hoặc API key không.
     */
    containsSensitiveData(text: string): boolean {
        if (!text || typeof text !== 'string') return false

        for (const pattern of SENSITIVE_PATTERNS) {
            const regex = pattern.getRegex()
            if (regex.test(text)) {
                return true
            }
        }
        return false
    }

    /**
     * Làm sạch đệ quy toàn bộ Object/Array/Primitive.
     * Che giấu các trường có tên nhạy cảm và quét nội dung text bên trong.
     */
    redactObject<T>(data: T): T {
        if (data === null || data === undefined) {
            return data
        }

        if (typeof data === 'string') {
            return this.redactString(data) as unknown as T
        }

        if (typeof data !== 'object') {
            return data
        }

        if (Array.isArray(data)) {
            return data.map((item) => this.redactObject(item)) as unknown as T
        }

        const cleaned: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            const normalizedKey = key.toLowerCase().replace(/[-_]/g, '')
            if (SENSITIVE_KEY_NAMES.has(normalizedKey)) {
                cleaned[key] = '[REDACTED_CREDENTIAL]'
            } else if (typeof value === 'string') {
                cleaned[key] = this.redactString(value)
            } else if (typeof value === 'object' && value !== null) {
                cleaned[key] = this.redactObject(value)
            } else {
                cleaned[key] = value
            }
        }

        return cleaned as T
    }

    /**
     * Làm sạch các header HTTP nhạy cảm trước khi log hoặc phản hồi.
     */
    redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
        if (!headers || typeof headers !== 'object') return headers

        const cleaned: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(headers)) {
            const lowerKey = key.toLowerCase()
            if (lowerKey === 'authorization' || lowerKey === 'x-api-key' || lowerKey === 'cookie') {
                cleaned[key] = '[REDACTED_HEADER]'
            } else {
                cleaned[key] = typeof value === 'string' ? this.redactString(value) : value
            }
        }
        return cleaned
    }
}

export const redactionService = new RedactionService()
export default redactionService
