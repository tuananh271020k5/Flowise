/* eslint-disable */
import { ApiConnectorService } from './apiConnectorService'

describe('ApiConnectorService (PH6-T01)', () => {
    let service: ApiConnectorService

    beforeEach(() => {
        service = new ApiConnectorService()
    })

    describe('registerConnector & listConnectors', () => {
        it('should register a new valid connector and list by workspace', async () => {
            const connector = await service.registerConnector({
                workspaceId: 'ws-api-1',
                name: 'Tỷ giá Ngân hàng',
                description: 'Tra cứu tỷ giá ngoại tệ VND/USD',
                baseUrl: 'https://api.exchangerate.host',
                enabled: true,
                operations: [
                    {
                        id: 'getRates',
                        name: 'Lấy tỷ giá',
                        method: 'GET',
                        path: '/latest',
                        description: 'Lấy tỷ giá hiện tại',
                        isReadonly: true
                    }
                ]
            })

            expect(connector.id).toBeDefined()
            expect(connector.name).toBe('Tỷ giá Ngân hàng')

            const list = await service.listConnectors('ws-api-1')
            expect(list.length).toBe(1)
            expect(list[0].id).toBe(connector.id)
        })

        it('should reject invalid baseUrl protocol', async () => {
            await expect(
                service.registerConnector({
                    workspaceId: 'ws-1',
                    name: 'Invalid',
                    description: 'Invalid',
                    baseUrl: 'ftp://ftp.example.com',
                    enabled: true,
                    operations: []
                })
            ).rejects.toThrow('không hợp lệ')
        })
    })

    describe('validateApiCall & Operation Allowlist', () => {
        let connectorId: string

        beforeEach(async () => {
            const registered = await service.registerConnector({
                workspaceId: 'ws-secure',
                name: 'CRM Orders API',
                description: 'API quản lý đơn hàng',
                baseUrl: 'https://crm.company.com/api/v1',
                enabled: true,
                operations: [
                    {
                        id: 'listOrders',
                        name: 'Danh sách đơn hàng',
                        method: 'GET',
                        path: '/orders',
                        description: 'Xem danh sách',
                        isReadonly: true
                    },
                    {
                        id: 'cancelOrder',
                        name: 'Hủy đơn hàng',
                        method: 'POST',
                        path: '/orders/cancel',
                        description: 'Hủy đơn',
                        isReadonly: false
                    }
                ]
            })
            connectorId = registered.id
        })

        it('should allow valid GET call matching allowlisted operation', () => {
            const check = service.validateApiCall({
                workspaceId: 'ws-secure',
                connectorId,
                operationId: 'listOrders',
                url: 'https://crm.company.com/api/v1/orders?limit=10',
                method: 'GET',
                isReadonlyContext: true
            })

            expect(check.allowed).toBe(true)
            expect(check.operation?.id).toBe('listOrders')
        })

        it('should block arbitrary URL not matching baseUrl prefix (SSRF Defense)', () => {
            const check = service.validateApiCall({
                workspaceId: 'ws-secure',
                connectorId,
                operationId: 'listOrders',
                url: 'https://malicious-attacker.com/steal-data',
                method: 'GET'
            })

            expect(check.allowed).toBe(false)
            expect(check.reason).toContain('không thuộc phạm vi Base URL được phép')
        })

        it('should block mutating POST operation when in readonly context', () => {
            const check = service.validateApiCall({
                workspaceId: 'ws-secure',
                connectorId,
                operationId: 'cancelOrder',
                url: 'https://crm.company.com/api/v1/orders/cancel',
                method: 'POST',
                isReadonlyContext: true
            })

            expect(check.allowed).toBe(false)
            expect(check.reason).toContain('Agent đang ở chế độ Readonly')
        })

        it('should block when operationId is not in allowlist', () => {
            const check = service.validateApiCall({
                workspaceId: 'ws-secure',
                connectorId,
                operationId: 'deleteEntireDatabase',
                url: 'https://crm.company.com/api/v1/delete',
                method: 'DELETE'
            })

            expect(check.allowed).toBe(false)
            expect(check.reason).toContain('không nằm trong danh mục cho phép')
        })

        it('should reject access across workspaces (Negative Auth)', () => {
            const check = service.validateApiCall({
                workspaceId: 'ws-intruder',
                connectorId,
                operationId: 'listOrders',
                url: 'https://crm.company.com/api/v1/orders',
                method: 'GET'
            })

            expect(check.allowed).toBe(false)
            expect(check.reason).toContain('Khác workspace')
        })
    })

    describe('PH6-T04: evaluateApiError & Schema Validation', () => {
        it('should classify 401 Unauthorized correctly with friendly Vietnamese message', () => {
            const result = service.evaluateApiError({ status: 401, message: 'Invalid token' })
            expect(result.errorCode).toBe('API_UNAUTHORIZED')
            expect(result.isRecoverable).toBe(false)
            expect(result.userMessageVi).toContain('Khóa API (API Key) hoặc Token xác thực không hợp lệ')
            expect(result.suggestedActionVi).toContain('Credential')
        })

        it('should classify 403 Forbidden correctly', () => {
            const result = service.evaluateApiError({ status: 403, message: 'Forbidden access' })
            expect(result.errorCode).toBe('API_FORBIDDEN')
            expect(result.isRecoverable).toBe(false)
            expect(result.userMessageVi).toContain('không có quyền truy cập')
        })

        it('should classify 429 Rate Limit as recoverable', () => {
            const result = service.evaluateApiError({ status: 429, message: 'Too many requests' })
            expect(result.errorCode).toBe('API_RATE_LIMIT_EXCEEDED')
            expect(result.isRecoverable).toBe(true)
            expect(result.userMessageVi).toContain('giới hạn tần suất gọi')
        })

        it('should classify timeout and ECONNABORTED as recoverable', () => {
            const result = service.evaluateApiError(new Error('Connection timeout of 5000ms exceeded'))
            expect(result.errorCode).toBe('API_TIMEOUT')
            expect(result.isRecoverable).toBe(true)
            expect(result.userMessageVi).toContain('vượt quá thời gian chờ')
        })

        it('should classify 500 server errors as recoverable', () => {
            const result = service.evaluateApiError({ status: 502, message: 'Bad Gateway' })
            expect(result.errorCode).toBe('API_SERVER_ERROR')
            expect(result.isRecoverable).toBe(true)
            expect(result.userMessageVi).toContain('Máy chủ API đích đang gặp sự cố nội bộ')
        })

        it('should validate response schema and detect missing required fields', () => {
            const validData = { id: 123, status: 'delivered', amount: 500 }
            const validCheck = service.validateResponseSchema(validData, ['id', 'status'])
            expect(validCheck.valid).toBe(true)
            expect(validCheck.missingFields.length).toBe(0)

            const invalidData = { id: 123 }
            const invalidCheck = service.validateResponseSchema(invalidData, ['id', 'status', 'amount'])
            expect(invalidCheck.valid).toBe(false)
            expect(invalidCheck.missingFields).toEqual(['status', 'amount'])
            expect(invalidCheck.extraDetails).toContain('Thiếu các trường bắt buộc')
        })

        it('should reject non-object responses during schema validation', () => {
            const check = service.validateResponseSchema('not-a-json', ['id'])
            expect(check.valid).toBe(false)
            expect(check.extraDetails).toContain('không phải là một đối tượng JSON hợp lệ')
        })
    })
})
