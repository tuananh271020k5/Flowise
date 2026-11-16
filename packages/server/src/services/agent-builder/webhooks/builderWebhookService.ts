import { StatusCodes } from 'http-status-codes'
import { AdapterError } from '../errors/builderErrors'
import { createHmac, randomBytes } from 'crypto'

export interface WebhookEndpoint {
    id: string
    workspaceId: string
    name: string
    description?: string
    targetAgentId: string
    secretKey: string
    allowedEvents: string[]
    enabled: boolean
    createdDate: Date
    updatedDate: Date
}

export interface WebhookEventRecord {
    id: string
    endpointId: string
    workspaceId: string
    eventName: string
    payload: Record<string, unknown>
    verified: boolean
    receivedAt: Date
}

export interface ProcessWebhookResult {
    success: boolean
    message: string
    eventRecord?: WebhookEventRecord
    statusCode: number
}

/**
 * Service Quản Lý Webhook Ingestion & Event Listener (PH6-T10).
 * Cho phép các hệ thống bên ngoài gửi dữ liệu/sự kiện vào Flowise Agent Builder.
 */
export class BuilderWebhookService {
    private endpoints: Map<string, WebhookEndpoint> = new Map()
    private eventLogs: WebhookEventRecord[] = []

    constructor() {
        this.seedDefaultEndpoints('default')
    }

    private seedDefaultEndpoints(workspaceId: string): void {
        const defaultEndpoint: WebhookEndpoint = {
            id: 'wh-order-events',
            workspaceId,
            name: 'Webhook Sự Kiện Đơn Hàng (CRM Orders)',
            description: 'Nhận sự kiện đơn hàng mới từ hệ thống ERP/CRM để phân tích',
            targetAgentId: 'agent-sales-v1',
            secretKey: 'whsec_sample_secret_key_crm_2026',
            allowedEvents: ['order.created', 'order.paid', 'order.cancelled'],
            enabled: true,
            createdDate: new Date(),
            updatedDate: new Date()
        }
        this.endpoints.set(defaultEndpoint.id, defaultEndpoint)
    }

    async registerEndpoint(
        params: Omit<WebhookEndpoint, 'id' | 'secretKey' | 'createdDate' | 'updatedDate' | 'enabled' | 'allowedEvents'> & {
            enabled?: boolean
            allowedEvents?: string[]
        }
    ): Promise<WebhookEndpoint> {
        if (!params.name || !params.workspaceId || !params.targetAgentId) {
            throw new AdapterError('REQUIRED_FIELDS_MISSING', 'Name, workspaceId và targetAgentId là bắt buộc', StatusCodes.BAD_REQUEST)
        }

        const id = `wh-${Date.now()}-${randomBytes(4).toString('hex')}`
        const secretKey = `whsec_${randomBytes(24).toString('hex')}`

        const endpoint: WebhookEndpoint = {
            ...params,
            id,
            secretKey,
            allowedEvents: params.allowedEvents || ['*'],
            enabled: params.enabled ?? true,
            createdDate: new Date(),
            updatedDate: new Date()
        }

        this.endpoints.set(id, endpoint)
        return endpoint
    }

    async getEndpoint(id: string, workspaceId: string): Promise<WebhookEndpoint | null> {
        const ep = this.endpoints.get(id)
        if (!ep) return null
        if (ep.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }
        return ep
    }

    async listEndpoints(workspaceId: string): Promise<WebhookEndpoint[]> {
        return Array.from(this.endpoints.values()).filter((e) => e.workspaceId === workspaceId)
    }

    /**
     * Xác thực chữ ký HMAC-SHA256 của Webhook payload (HMAC Signature Verification).
     */
    verifySignature(rawPayload: string | Record<string, unknown>, signature: string, secretKey: string): boolean {
        if (!signature || !secretKey) return false

        const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload)
        const expectedSignature = createHmac('sha256', secretKey).update(payloadStr).digest('hex')

        // Chống timing attack: so sánh độ dài và giá trị
        if (signature.length !== expectedSignature.length) return false
        let mismatch = 0
        for (let i = 0; i < signature.length; i++) {
            mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
        }
        return mismatch === 0
    }

    /**
     * Xử lý và thẩm định sự kiện Webhook gửi đến.
     */
    async processWebhookEvent(
        endpointId: string,
        signature: string,
        eventName: string,
        rawPayload: string | Record<string, unknown>
    ): Promise<ProcessWebhookResult> {
        const endpoint = this.endpoints.get(endpointId)
        if (!endpoint) {
            return {
                success: false,
                message: `Webhook endpoint ${endpointId} không tồn tại`,
                statusCode: StatusCodes.NOT_FOUND
            }
        }

        if (!endpoint.enabled) {
            return {
                success: false,
                message: `Webhook endpoint ${endpoint.name} đang bị vô hiệu hóa`,
                statusCode: StatusCodes.FORBIDDEN
            }
        }

        // 1. Kiểm tra sự kiện có nằm trong allowedEvents không
        if (!endpoint.allowedEvents.includes('*') && !endpoint.allowedEvents.includes(eventName)) {
            return {
                success: false,
                message: `Sự kiện "${eventName}" không nằm trong danh mục được phép tiếp nhận của webhook này`,
                statusCode: StatusCodes.BAD_REQUEST
            }
        }

        // 2. Xác thực chữ ký HMAC
        const isValidSignature = this.verifySignature(rawPayload, signature, endpoint.secretKey)
        if (!isValidSignature) {
            return {
                success: false,
                message: 'Chữ ký webhook (HMAC signature) không hợp lệ',
                statusCode: StatusCodes.UNAUTHORIZED
            }
        }

        // 3. Phân tích payload
        let parsedPayload: Record<string, unknown> = {}
        try {
            parsedPayload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload
        } catch {
            return {
                success: false,
                message: 'Payload của webhook không phải JSON hợp lệ',
                statusCode: StatusCodes.BAD_REQUEST
            }
        }

        // 4. Ghi nhận nhật ký sự kiện
        const eventRecord: WebhookEventRecord = {
            id: `whevt-${Date.now()}-${randomBytes(4).toString('hex')}`,
            endpointId,
            workspaceId: endpoint.workspaceId,
            eventName,
            payload: parsedPayload,
            verified: true,
            receivedAt: new Date()
        }

        this.eventLogs.unshift(eventRecord)
        if (this.eventLogs.length > 500) {
            this.eventLogs = this.eventLogs.slice(0, 500)
        }

        return {
            success: true,
            message: `Tiếp nhận sự kiện "${eventName}" thành công cho agent ${endpoint.targetAgentId}`,
            eventRecord,
            statusCode: StatusCodes.OK
        }
    }

    async getRecentEvents(workspaceId: string, limit: number = 20): Promise<WebhookEventRecord[]> {
        return this.eventLogs.filter((evt) => evt.workspaceId === workspaceId).slice(0, limit)
    }
}

export default new BuilderWebhookService()
