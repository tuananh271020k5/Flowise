jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { RetentionService } from './retentionService'
import sessionService from '../sessionService'
import builderAuditService from '../audit/builderAuditService'

jest.mock('../sessionService')
jest.mock('../audit/builderAuditService')

describe('RetentionService (PH5-T03)', () => {
    let retention: RetentionService

    beforeEach(() => {
        jest.clearAllMocks()
        retention = new RetentionService({
            defaultRetentionDays: 30,
            auditLogRetentionDays: 90,
            allowPurgePublished: false
        })
    })

    it('should purge sessions older than retention days but spare published ones', async () => {
        const now = Date.now()
        const dayMs = 24 * 60 * 60 * 1000

        const mockSessions = [
            {
                id: 'sess-recent',
                workspaceId: 'ws-1',
                state: 'collecting',
                updatedDate: new Date(now - 5 * dayMs) // 5 days old -> keep
            },
            {
                id: 'sess-old',
                workspaceId: 'ws-1',
                state: 'collecting',
                updatedDate: new Date(now - 45 * dayMs) // 45 days old -> purge
            },
            {
                id: 'sess-published-old',
                workspaceId: 'ws-1',
                state: 'published',
                updatedDate: new Date(now - 60 * dayMs) // 60 days old but published -> KEEP!
            }
        ]

        ;(sessionService.listSessions as jest.Mock).mockResolvedValue(mockSessions)
        ;(sessionService.deleteSession as jest.Mock).mockResolvedValue(true)

        const result = await retention.purgeExpiredSessions('ws-1', 30)

        expect(result.count).toBe(1)
        expect(result.sessionIds).toEqual(['sess-old'])
        expect(sessionService.deleteSession).toHaveBeenCalledWith('sess-old', 'ws-1')
        expect(sessionService.deleteSession).not.toHaveBeenCalledWith('sess-published-old', 'ws-1')
    })

    it('should allow purging published sessions when explicitly configured', async () => {
        const retentionAggressive = new RetentionService({
            defaultRetentionDays: 30,
            allowPurgePublished: true
        })

        const now = Date.now()
        const dayMs = 24 * 60 * 60 * 1000

        const mockSessions = [
            {
                id: 'sess-published-old',
                workspaceId: 'ws-1',
                state: 'published',
                updatedDate: new Date(now - 60 * dayMs)
            }
        ]

        ;(sessionService.listSessions as jest.Mock).mockResolvedValue(mockSessions)
        ;(sessionService.deleteSession as jest.Mock).mockResolvedValue(true)

        const result = await retentionAggressive.purgeExpiredSessions('ws-1', 30)

        expect(result.count).toBe(1)
        expect(result.sessionIds).toContain('sess-published-old')
    })

    it('should execute retention sweep and write audit log if items purged', async () => {
        const now = Date.now()
        const dayMs = 24 * 60 * 60 * 1000

        ;(sessionService.listSessions as jest.Mock).mockResolvedValue([
            {
                id: 'sess-old-2',
                workspaceId: 'ws-main',
                state: 'collecting',
                updatedDate: new Date(now - 50 * dayMs)
            }
        ])
        ;(sessionService.deleteSession as jest.Mock).mockResolvedValue(true)
        ;(builderAuditService.logAction as jest.Mock).mockResolvedValue({ id: 'audit-001' })

        const sweepResult = await retention.executeRetentionSweep('ws-main', { sessionDays: 30 })

        expect(sweepResult.workspaceId).toBe('ws-main')
        expect(sweepResult.purgedSessionsCount).toBe(1)
        expect(builderAuditService.logAction).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'DATA_RETENTION_PURGE',
                workspaceId: 'ws-main'
            })
        )
    })
})
