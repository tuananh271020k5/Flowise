/* eslint-disable */
import { BuilderWebhookService } from './builderWebhookService'
import { createHmac } from 'crypto'

describe('BuilderWebhookService (PH6-T10)', () => {
    let service: BuilderWebhookService

    beforeEach(() => {
        service = new BuilderWebhookService()
    })

    describe('registerEndpoint & listEndpoints', () => {
        it('should register a valid webhook endpoint and generate secret key', async () => {
            const ep = await service.registerEndpoint({
                workspaceId: 'ws-wh-1',
                name: 'Shopify New Orders',
                targetAgentId: 'agent-order-notifier',
                allowedEvents: ['order.created']
            })

            expect(ep.id).toBeDefined()
            expect(ep.secretKey).toBeDefined()
            expect(ep.secretKey.startsWith('whsec_')).toBe(true)

            const list = await service.listEndpoints('ws-wh-1')
            expect(list.length).toBe(1)
            expect(list[0].id).toBe(ep.id)
        })

        it('should reject access across workspaces (Negative Auth)', async () => {
            const ep = await service.registerEndpoint({
                workspaceId: 'ws-owner',
                name: 'Private Webhook',
                targetAgentId: 'agent-1'
            })

            await expect(service.getEndpoint(ep.id, 'ws-intruder')).rejects.toThrow('Khác workspace')
        })
    })

    describe('verifySignature & processWebhookEvent', () => {
        let epId: string
        let secret: string

        beforeEach(async () => {
            const ep = await service.registerEndpoint({
                workspaceId: 'ws-events',
                name: 'Stripe Payment Ingestion',
                targetAgentId: 'agent-finance',
                allowedEvents: ['payment.succeeded']
            })
            epId = ep.id
            secret = ep.secretKey
        })

        it('should accept webhook event with valid HMAC-SHA256 signature', async () => {
            const payload = { transactionId: 'tx_123', amount: 500000, currency: 'VND' }
            const payloadStr = JSON.stringify(payload)
            const validSignature = createHmac('sha256', secret).update(payloadStr).digest('hex')

            const result = await service.processWebhookEvent(epId, validSignature, 'payment.succeeded', payloadStr)

            expect(result.success).toBe(true)
            expect(result.statusCode).toBe(200)
            expect(result.eventRecord?.verified).toBe(true)
            expect(result.eventRecord?.payload).toEqual(payload)
        })

        it('should reject webhook event with invalid signature', async () => {
            const payload = { transactionId: 'tx_123' }
            const fakeSignature = 'bad_forged_signature_0000000000000000000000000000000000000000000000000000000000000000'

            const result = await service.processWebhookEvent(epId, fakeSignature, 'payment.succeeded', JSON.stringify(payload))

            expect(result.success).toBe(false)
            expect(result.statusCode).toBe(401)
            expect(result.message).toContain('không hợp lệ')
        })

        it('should reject disallowed event name', async () => {
            const payload = { test: true }
            const payloadStr = JSON.stringify(payload)
            const validSignature = createHmac('sha256', secret).update(payloadStr).digest('hex')

            const result = await service.processWebhookEvent(epId, validSignature, 'unauthorized.event.type', payloadStr)

            expect(result.success).toBe(false)
            expect(result.statusCode).toBe(400)
            expect(result.message).toContain('không nằm trong danh mục')
        })
    })
})
