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
})
