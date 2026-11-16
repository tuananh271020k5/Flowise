/* eslint-disable */
import { ZeroDowntimeService } from './zeroDowntimeService'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuilderMessage } from '../../../database/entities/BuilderMessage'
import { ChatFlow } from '../../../database/entities/ChatFlow'
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

describe('ZeroDowntimeService (PH5-T09)', () => {
    let mockDataSource: any
    let zeroDowntimeService: ZeroDowntimeService

    let sessions: any[] = []
    let specRevisions: any[] = []
    let draftRevisions: any[] = []
    let messages: any[] = []
    let chatflows: any[] = []
    let auditLogs: any[] = []

    const createMockRepo = (storage: any[]) => ({
        find: jest.fn(async (opts?: any) => {
            if (opts?.where?.sessionId) {
                return storage.filter((item) => item.sessionId === opts.where.sessionId)
            }
            return [...storage]
        }),
        findOne: jest.fn(async (opts?: any) => {
            if (opts?.where) {
                return storage.find((item) => Object.entries(opts.where).every(([k, v]) => item[k] === v)) || null
            }
            return storage[0] || null
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
                id: 'sess-zd-1',
                workspaceId: 'ws-1',
                organizationId: 'org-1',
                userId: 'user-1',
                title: 'Trợ lý tuyển dụng',
                state: 'published',
                currentSpecRevisionId: 'spec-rev-2',
                currentRevisionNo: 2,
                createdDate: new Date(),
                updatedDate: new Date()
            }
        ]

        specRevisions = [
            {
                id: 'spec-rev-1',
                sessionId: 'sess-zd-1',
                revisionNo: 1,
                spec: JSON.stringify({ name: 'Trợ lý v1', instructions: 'V1 instructions' }),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true,
                createdDate: new Date(Date.now() - 20000)
            },
            {
                id: 'spec-rev-2',
                sessionId: 'sess-zd-1',
                revisionNo: 2,
                spec: JSON.stringify({ name: 'Trợ lý v2', instructions: 'V2 with bug' }),
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
                id: 'draft-rev-1',
                sessionId: 'sess-zd-1',
                specRevisionId: 'spec-rev-1',
                buildKey: 'bk-1',
                flowId: 'flow-main-1',
                planId: 'plan-1',
                templateId: 'tmpl-1',
                templateVersion: '1.0.0',
                createdDate: new Date(Date.now() - 20000)
            },
            {
                id: 'draft-rev-2',
                sessionId: 'sess-zd-1',
                specRevisionId: 'spec-rev-2',
                buildKey: 'bk-2',
                flowId: 'flow-main-1',
                planId: 'plan-2',
                templateId: 'tmpl-1',
                templateVersion: '1.0.0',
                createdDate: new Date()
            }
        ]

        chatflows = [
            {
                id: 'flow-main-1',
                name: 'Trợ lý tuyển dụng',
                flowData: JSON.stringify({ nodes: [], edges: [] }),
                deployed: true,
                isPublic: true,
                workspaceId: 'ws-1',
                createdDate: new Date(),
                updatedDate: new Date()
            }
        ]

        messages = []
        auditLogs = []

        mockDataSource = {
            getRepository: jest.fn((target: any) => {
                if (target === BuilderSession) return createMockRepo(sessions)
                if (target === AgentSpecRevision) return createMockRepo(specRevisions)
                if (target === AgentDraftRevision) return createMockRepo(draftRevisions)
                if (target === BuilderMessage) return createMockRepo(messages)
                if (target === ChatFlow) return createMockRepo(chatflows)
                if (target === BuilderAuditLog) return createMockRepo(auditLogs)
                throw new Error(`Unknown entity: ${target}`)
            })
        }

        zeroDowntimeService = new ZeroDowntimeService(mockDataSource)
    })

    describe('switchDraftRevision', () => {
        it('should switch draft safely without downtime and update session pointer', async () => {
            const result = await zeroDowntimeService.switchDraftRevision({
                sessionId: 'sess-zd-1',
                workspaceId: 'ws-1',
                userId: 'user-admin',
                targetDraftRevisionId: 'draft-rev-1'
            })

            expect(result.success).toBe(true)
            expect(result.sessionId).toBe('sess-zd-1')
            expect(result.flowId).toBe('flow-main-1')
            expect(result.revisionNo).toBe(1)
            expect(result.deployed).toBe(true)

            // Check session updated
            const session = sessions.find((s) => s.id === 'sess-zd-1')
            expect(session.currentSpecRevisionId).toBe('spec-rev-1')
            expect(session.currentRevisionNo).toBe(1)

            // Check audit log
            const log = auditLogs.find((a) => a.action === 'ROLLBACK_EXECUTED')
            expect(log).toBeDefined()
            expect(log.status).toBe('SUCCESS')
        })

        it('should reject draft switch across workspaces', async () => {
            await expect(
                zeroDowntimeService.switchDraftRevision({
                    sessionId: 'sess-zd-1',
                    workspaceId: 'ws-attacker',
                    targetDraftRevisionId: 'draft-rev-1'
                })
            ).rejects.toThrow('Từ chối quyền truy cập: Khác workspace')
        })
    })

    describe('instantRollback', () => {
        it('should perform instant rollback to previous spec revision without changing flowId', async () => {
            const result = await zeroDowntimeService.instantRollback({
                sessionId: 'sess-zd-1',
                workspaceId: 'ws-1',
                userId: 'user-admin',
                targetRevisionId: 'spec-rev-1'
            })

            expect(result.success).toBe(true)
            expect(result.flowId).toBe('flow-main-1')
            expect(result.revisionNo).toBe(3) // Next revision number
            expect(result.rolledBackToRevisionId).toBe('spec-rev-1')
            expect(result.deployed).toBe(true) // Flow remains deployed!

            // Check that a new immutable revision was created
            const newRevision = specRevisions.find((r) => r.revisionNo === 3)
            expect(newRevision).toBeDefined()
            const specData = JSON.parse(newRevision.spec)
            expect(specData.name).toBe('Trợ lý v1')

            // Check system message generated
            expect(messages.length).toBe(1)
            expect(messages[0].content).toContain('Đã thực hiện Instant Rollback thành công')
        })

        it('should support rollback to last stable published draft', async () => {
            const result = await zeroDowntimeService.instantRollback({
                sessionId: 'sess-zd-1',
                workspaceId: 'ws-1',
                toLastStablePublished: true
            })

            expect(result.success).toBe(true)
            expect(result.flowId).toBe('flow-main-1')
            expect(result.deployed).toBe(true)
        })

        it('should reject rollback if no target is specified', async () => {
            await expect(
                zeroDowntimeService.instantRollback({
                    sessionId: 'sess-zd-1',
                    workspaceId: 'ws-1'
                })
            ).rejects.toThrow('Cần cung cấp targetRevisionId, targetDraftRevisionId hoặc toLastStablePublished: true')
        })
    })
})
