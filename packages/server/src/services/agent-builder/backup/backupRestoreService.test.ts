/* eslint-disable */
import { BackupRestoreService, SessionBackupBundle } from './backupRestoreService'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { BuilderMessage } from '../../../database/entities/BuilderMessage'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuildJob } from '../../../database/entities/BuildJob'
import { BuilderAuditLog } from '../../../database/entities/BuilderAuditLog'

jest.mock('../../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: jest.fn()
}))

jest.mock('../../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}))

describe('BackupRestoreService (PH5-T08)', () => {
    let mockDataSource: any
    let backupService: BackupRestoreService

    let sessions: any[] = []
    let messages: any[] = []
    let specRevisions: any[] = []
    let draftRevisions: any[] = []
    let buildJobs: any[] = []
    let auditLogs: any[] = []

    const createMockRepo = (storage: any[]) => ({
        find: jest.fn(async (opts?: any) => {
            if (opts?.where?.sessionId) {
                return storage.filter((item) => item.sessionId === opts.where.sessionId)
            }
            return [...storage]
        }),
        findOneBy: jest.fn(async (cond: any) => {
            return storage.find((item) => Object.entries(cond).every(([k, v]) => item[k] === v)) || null
        }),
        create: jest.fn((entity: any) => ({ ...entity })),
        save: jest.fn(async (entity: any) => {
            const idx = storage.findIndex((item) => item.id === entity.id)
            if (idx >= 0) {
                storage[idx] = { ...storage[idx], ...entity }
                return storage[idx]
            }
            const saved = { id: entity.id || `id-${Date.now()}-${Math.random()}`, ...entity }
            storage.push(saved)
            return saved
        })
    })

    beforeEach(() => {
        sessions = [
            {
                id: 'sess-backup-1',
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý CSKH',
                state: 'ready',
                currentSpecRevisionId: 'spec-1',
                currentRevisionNo: 1,
                createdDate: new Date(),
                updatedDate: new Date()
            }
        ]

        messages = [
            {
                id: 'msg-1',
                sessionId: 'sess-backup-1',
                role: 'user',
                clientMessageId: 'cli-1',
                content: 'Tôi muốn làm bot hỗ trợ khách hàng',
                createdDate: new Date()
            }
        ]

        specRevisions = [
            {
                id: 'spec-1',
                sessionId: 'sess-backup-1',
                revisionNo: 1,
                spec: JSON.stringify({ name: 'Trợ lý CSKH', role: 'Support' }),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true,
                createdDate: new Date()
            }
        ]

        draftRevisions = [
            {
                id: 'draft-1',
                sessionId: 'sess-backup-1',
                specRevisionId: 'spec-1',
                buildKey: 'bk-1',
                flowId: 'flow-1',
                planId: 'plan-1',
                templateId: 'tmpl-1',
                templateVersion: '1.0.0',
                createdDate: new Date()
            }
        ]

        buildJobs = [
            {
                id: 'job-1',
                sessionId: 'sess-backup-1',
                workspaceId: 'ws-1',
                specRevisionId: 'spec-1',
                buildKey: 'bk-1',
                state: 'completed',
                createdDate: new Date()
            }
        ]

        auditLogs = []

        mockDataSource = {
            getRepository: jest.fn((target: any) => {
                if (target === BuilderSession) return createMockRepo(sessions)
                if (target === BuilderMessage) return createMockRepo(messages)
                if (target === AgentSpecRevision) return createMockRepo(specRevisions)
                if (target === AgentDraftRevision) return createMockRepo(draftRevisions)
                if (target === BuildJob) return createMockRepo(buildJobs)
                if (target === BuilderAuditLog) return createMockRepo(auditLogs)
                throw new Error(`Unknown entity: ${target}`)
            })
        }

        backupService = new BackupRestoreService(mockDataSource)
    })

    describe('exportSessionBackup', () => {
        it('should export all session entities into a validated backup bundle', async () => {
            const bundle = await backupService.exportSessionBackup('sess-backup-1', 'ws-1')

            expect(bundle).toBeDefined()
            expect(bundle.version).toBe('1.0.0')
            expect(bundle.sessionId).toBe('sess-backup-1')
            expect(bundle.workspaceId).toBe('ws-1')
            expect(bundle.title).toBe('Trợ lý CSKH')
            expect(bundle.messages.length).toBe(1)
            expect(bundle.specRevisions.length).toBe(1)
            expect(bundle.draftRevisions.length).toBe(1)
            expect(bundle.buildJobs.length).toBe(1)
            expect(bundle.checksum).toBeDefined()
            expect(typeof bundle.checksum).toBe('string')
        })

        it('should reject export if workspaceId does not match', async () => {
            await expect(backupService.exportSessionBackup('sess-backup-1', 'ws-intruder')).rejects.toThrow(
                'Từ chối quyền truy cập: Khác workspace'
            )
        })

        it('should reject export for non-existent session', async () => {
            await expect(backupService.exportSessionBackup('non-existent', 'ws-1')).rejects.toThrow(
                'Phiên non-existent không tồn tại'
            )
        })
    })

    describe('importSessionBackup', () => {
        it('should import bundle and restore entities cleanly into target workspace', async () => {
            const bundle = await backupService.exportSessionBackup('sess-backup-1', 'ws-1')

            // Reset storage to simulate restoring to another workspace/database
            sessions = []
            messages = []
            specRevisions = []
            draftRevisions = []
            buildJobs = []

            const result = await backupService.importSessionBackup(bundle, 'ws-target', 'user-admin')

            expect(result.success).toBe(true)
            expect(result.sessionId).toBe('sess-backup-1')
            expect(result.restoredEntities.messages).toBe(1)
            expect(result.restoredEntities.specRevisions).toBe(1)
            expect(result.restoredEntities.draftRevisions).toBe(1)
            expect(result.restoredEntities.buildJobs).toBe(1)

            // Verify restored session has targetWorkspaceId
            const restoredSession = sessions.find((s) => s.id === 'sess-backup-1')
            expect(restoredSession).toBeDefined()
            expect(restoredSession.workspaceId).toBe('ws-target')
        })

        it('should reject import if checksum is tampered', async () => {
            const bundle = await backupService.exportSessionBackup('sess-backup-1', 'ws-1')
            const tamperedBundle: SessionBackupBundle = {
                ...bundle,
                checksum: 'fake-corrupted-checksum'
            }

            await expect(backupService.importSessionBackup(tamperedBundle, 'ws-1')).rejects.toThrow(
                'Toàn vẹn dữ liệu backup bị vi phạm'
            )
        })
    })

    describe('validateSchemaInvariants', () => {
        it('should report valid when there are no orphaned records', async () => {
            const validation = await backupService.validateSchemaInvariants()

            expect(validation.valid).toBe(true)
            expect(validation.totalOrphaned).toBe(0)
            expect(validation.tablesChecked.length).toBe(6)
            expect(validation.errors.length).toBe(0)
        })

        it('should detect orphaned records if session was deleted without cascading', async () => {
            // Add orphaned message with invalid sessionId
            messages.push({
                id: 'orphan-msg',
                sessionId: 'non-existent-session',
                role: 'user',
                content: 'Hello'
            })

            const validation = await backupService.validateSchemaInvariants()

            expect(validation.valid).toBe(false)
            expect(validation.totalOrphaned).toBe(1)
            expect(validation.orphanedRecords.messages).toBe(1)
            expect(validation.errors[0]).toContain('Phát hiện 1 bản ghi mồ côi')
        })
    })
})
