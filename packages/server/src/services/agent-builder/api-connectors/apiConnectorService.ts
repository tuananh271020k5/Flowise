import { StatusCodes } from 'http-status-codes'
import { AdapterError } from '../errors/builderErrors'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface ApiConnectorParam {
    name: string
    type: 'string' | 'number' | 'boolean'
    in: 'query' | 'header' | 'path' | 'body'
    required?: boolean
    description?: string
}

export interface ApiOperation {
    id: string
    name: string
    method: HttpMethod
    path: string
    description: string
    parameters?: ApiConnectorParam[]
    isReadonly: boolean
    timeoutMs?: number
}

export interface ApiConnector {
    id: string
    workspaceId: string
    name: string
    description: string
    baseUrl: string
    credentialId?: string
    headers?: Record<string, string>
    operations: ApiOperation[]
    enabled: boolean
    createdDate: Date
    updatedDate: Date
}

export interface ValidateCallParams {
    workspaceId: string
    connectorId: string
    operationId: string
    url: string
    method: HttpMethod
    isReadonlyContext?: boolean
}

export interface ValidateCallResult {
    allowed: boolean
    reason?: string
    connector?: ApiConnector
    operation?: ApiOperation
}

export interface ApiErrorEvalResult {
    status?: number
    errorCode: string
    isRecoverable: boolean
    userMessageVi: string
    suggestedActionVi: string
}

export interface ApiResponseSchemaValidationResult {
    valid: boolean
    missingFields: string[]
    extraDetails?: string
}

/**
 * Service Quản Lý API Connector Registry & Enforce Allowlist (PH6-T01).
 * Quản lý các endpoint API được phép, ngăn chặn LLM tự ý gọi URL ngoài danh mục cho phép.
 */
export class ApiConnectorService {
    private connectors: Map<string, ApiConnector> = new Map()

    constructor() {
        this.seedDefaultConnectors('default')
    }

    private seedDefaultConnectors(workspaceId: string): void {
        const sampleConnector: ApiConnector = {
            id: 'conn-weather-v1',
            workspaceId,
            name: 'Dịch vụ Thời tiết Mẫu (OpenWeather)',
            description: 'Tra cứu thông tin nhiệt độ và dự báo thời tiết theo tỉnh thành',
            baseUrl: 'https://api.openweathermap.org/data/2.5',
            enabled: true,
            operations: [
                {
                    id: 'getWeatherByCity',
                    name: 'Lấy thời tiết theo thành phố',
                    method: 'GET',
                    path: '/weather',
                    description: 'Tra cứu nhiệt độ, độ ẩm hiện tại',
                    isReadonly: true,
                    parameters: [
                        { name: 'q', type: 'string', in: 'query', required: true, description: 'Tên thành phố (Hanoi, Danang, HCMC)' },
                        { name: 'units', type: 'string', in: 'query', description: 'metric hoặc imperial' }
                    ]
                }
            ],
            createdDate: new Date(),
            updatedDate: new Date()
        }
        this.connectors.set(sampleConnector.id, sampleConnector)
    }

    async registerConnector(
        params: Omit<ApiConnector, 'id' | 'createdDate' | 'updatedDate'>
    ): Promise<ApiConnector> {
        if (!params.name || !params.baseUrl || !params.workspaceId) {
            throw new AdapterError('REQUIRED_FIELDS_MISSING', 'Name, baseUrl và workspaceId là bắt buộc', StatusCodes.BAD_REQUEST)
        }

        // Validate URL format
        try {
            const parsed = new URL(params.baseUrl)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error('Chỉ hỗ trợ giao thức http hoặc https')
            }
        } catch {
            throw new AdapterError('INVALID_BASE_URL', `Base URL ${params.baseUrl} không hợp lệ`, StatusCodes.BAD_REQUEST)
        }

        const id = `conn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
        const newConnector: ApiConnector = {
            ...params,
            id,
            enabled: params.enabled ?? true,
            operations: params.operations || [],
            createdDate: new Date(),
            updatedDate: new Date()
        }

        this.connectors.set(id, newConnector)
        return newConnector
    }

    async getConnector(id: string, workspaceId: string): Promise<ApiConnector | null> {
        const connector = this.connectors.get(id)
        if (!connector) return null
        if (connector.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }
        return connector
    }

    async listConnectors(workspaceId: string): Promise<ApiConnector[]> {
        return Array.from(this.connectors.values()).filter((c) => c.workspaceId === workspaceId)
    }

    async updateConnector(
        id: string,
        workspaceId: string,
        patch: Partial<Omit<ApiConnector, 'id' | 'workspaceId' | 'createdDate'>>
    ): Promise<ApiConnector> {
        const connector = await this.getConnector(id, workspaceId)
        if (!connector) {
            throw new AdapterError('CONNECTOR_NOT_FOUND', `Connector ${id} không tồn tại`, StatusCodes.NOT_FOUND)
        }

        const updated: ApiConnector = {
            ...connector,
            ...patch,
            updatedDate: new Date()
        }

        this.connectors.set(id, updated)
        return updated
    }

    async deleteConnector(id: string, workspaceId: string): Promise<boolean> {
        const connector = await this.getConnector(id, workspaceId)
        if (!connector) return false
        return this.connectors.delete(id)
    }

    /**
     * Thẩm tra tính hợp lệ của cuộc gọi API dựa trên Allowlist (PH6-T01).
     * Ngăn chặn SSRF, kiểm tra URL prefix, HTTP method và quy tắc Readonly.
     */
    validateApiCall(params: ValidateCallParams): ValidateCallResult {
        const { workspaceId, connectorId, operationId, url, method, isReadonlyContext } = params

        const connector = this.connectors.get(connectorId)
        if (!connector) {
            return { allowed: false, reason: `Connector ${connectorId} không tồn tại` }
        }

        if (connector.workspaceId !== workspaceId) {
            return { allowed: false, reason: 'Từ chối truy cập: Khác workspace' }
        }

        if (!connector.enabled) {
            return { allowed: false, reason: `Connector ${connector.name} đang bị vô hiệu hóa` }
        }

        // Tìm operation tương ứng
        const operation = connector.operations.find((op) => op.id === operationId)
        if (!operation) {
            return { allowed: false, reason: `Operation ${operationId} không nằm trong danh mục cho phép của ${connector.name}` }
        }

        // Kiểm tra HTTP Method khớp
        if (operation.method.toUpperCase() !== method.toUpperCase()) {
            return {
                allowed: false,
                reason: `Phương thức ${method} không khớp với định nghĩa của operation ${operationId} (${operation.method})`
            }
        }

        // Kiểm tra quy tắc Readonly Safety: Chặn các thao tác ghi dữ liệu nếu ở ngữ cảnh readonly
        if (isReadonlyContext && !operation.isReadonly) {
            return {
                allowed: false,
                reason: `Thao tác ${operationId} (${method}) thay đổi dữ liệu bị chặn vì Agent đang ở chế độ Readonly`
            }
        }

        // Kiểm tra URL bắt buộc phải bắt đầu bằng connector.baseUrl (Chống SSRF / Arbitrary URL)
        if (!url.startsWith(connector.baseUrl)) {
            return {
                allowed: false,
                reason: `Đường dẫn gọi ${url} không thuộc phạm vi Base URL được phép (${connector.baseUrl})`
            }
        }

        return {
            allowed: true,
            connector,
            operation
        }
    }

    /**
     * PH6-T04: Đánh giá và xử lý lỗi kết nối API Connector (API Eval).
     * Phân loại lỗi mạng, timeout, 401, 403, 429, 500 và trả về thông điệp tiếng Việt thân thiện, không lộ secrets.
     */
    evaluateApiError(error: any): ApiErrorEvalResult {
        const status = error?.status || error?.response?.status || error?.statusCode
        const message = String(error?.message || error || '').toLowerCase()

        // Kiểm tra timeout / connection drop
        if (message.includes('timeout') || message.includes('econnaborted') || status === 504 || status === 408) {
            return {
                status: status || 504,
                errorCode: 'API_TIMEOUT',
                isRecoverable: true,
                userMessageVi: 'Yêu cầu kết nối đến API vượt quá thời gian chờ (Timeout). Vui lòng thử lại.',
                suggestedActionVi: 'Tăng timeout hoặc kiểm tra lại kết nối mạng của hệ thống API đích.'
            }
        }

        // 401 Unauthorized
        if (status === 401 || message.includes('unauthorized')) {
            return {
                status: 401,
                errorCode: 'API_UNAUTHORIZED',
                isRecoverable: false,
                userMessageVi: 'Khóa API (API Key) hoặc Token xác thực không hợp lệ hoặc đã hết hạn.',
                suggestedActionVi: 'Vui lòng kiểm tra lại Credential đã cấu hình cho API Connector.'
            }
        }

        // 403 Forbidden
        if (status === 403 || message.includes('forbidden')) {
            return {
                status: 403,
                errorCode: 'API_FORBIDDEN',
                isRecoverable: false,
                userMessageVi: 'Tài khoản kết nối không có quyền truy cập tài nguyên hoặc thực thi thao tác này.',
                suggestedActionVi: 'Kiểm tra phân quyền tài khoản (scopes/permissions) trên hệ thống bên ngoài.'
            }
        }

        // 429 Too Many Requests
        if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
            return {
                status: 429,
                errorCode: 'API_RATE_LIMIT_EXCEEDED',
                isRecoverable: true,
                userMessageVi: 'Hệ thống API đích đang bị giới hạn tần suất gọi (Rate Limit).',
                suggestedActionVi: 'Vui lòng giảm tần suất gọi hoặc chờ ít phút trước khi thử lại.'
            }
        }

        // 404 Not Found
        if (status === 404) {
            return {
                status: 404,
                errorCode: 'API_ENDPOINT_NOT_FOUND',
                isRecoverable: false,
                userMessageVi: 'Đường dẫn endpoint hoặc tài nguyên yêu cầu không tồn tại trên máy chủ API.',
                suggestedActionVi: 'Kiểm tra lại đường dẫn path hoặc tham số id truyền vào.'
            }
        }

        // 500, 502, 503 Server Error
        if (status >= 500 && status < 600) {
            return {
                status,
                errorCode: 'API_SERVER_ERROR',
                isRecoverable: true,
                userMessageVi: 'Máy chủ API đích đang gặp sự cố nội bộ (Lỗi 5xx).',
                suggestedActionVi: 'Chờ máy chủ phía đối tác khắc phục hoặc kiểm tra trạng thái dịch vụ (Service Health).'
            }
        }

        // Mặc định: Lỗi chung
        return {
            status: status || 500,
            errorCode: 'API_UNKNOWN_ERROR',
            isRecoverable: false,
            userMessageVi: 'Gặp lỗi không xác định khi giao tiếp với API bên ngoài.',
            suggestedActionVi: 'Kiểm tra log chi tiết hoặc liên hệ quản trị viên hệ thống API.'
        }
    }

    /**
     * PH6-T04: Thẩm định cấu trúc dữ liệu phản hồi so với schema mong đợi (Schema Mismatch Guard).
     */
    validateResponseSchema(data: any, expectedFields?: string[]): ApiResponseSchemaValidationResult {
        if (!data || typeof data !== 'object') {
            return {
                valid: false,
                missingFields: expectedFields || [],
                extraDetails: 'Dữ liệu phản hồi không phải là một đối tượng JSON hợp lệ'
            }
        }

        if (!expectedFields || expectedFields.length === 0) {
            return { valid: true, missingFields: [] }
        }

        const missing = expectedFields.filter((field) => !(field in data))
        return {
            valid: missing.length === 0,
            missingFields: missing,
            extraDetails: missing.length > 0 ? `Thiếu các trường bắt buộc: ${missing.join(', ')}` : undefined
        }
    }
}

export default new ApiConnectorService()
