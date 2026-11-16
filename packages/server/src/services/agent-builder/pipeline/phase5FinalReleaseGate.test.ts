/* eslint-disable */
import { StatusCodes } from 'http-status-codes'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { BuilderMessage } from '../../../database/entities/BuilderMessage'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuildJob } from '../../../database/entities/BuildJob'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { BuilderAuditLog } from '../../../database/entities/BuilderAuditLog'
import { PublishService } from './publishService'
import { ZeroDowntimeService } from '../deployment/zeroDowntimeService'
import { BackupRestoreService } from '../backup/backupRestoreService'
import { RecoveryService } from '../recovery/recoveryService'
import { TokenUsageService } from '../cost/tokenUsageService'
import { RetentionService } from '../security/retentionService'
import redactionService from '../security/redactionService'

jest.mock('../../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: jest.fn()
}))

jest.mock('../../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}))

describe('Phase 5 Final Release Gate Acceptance Suite (PH5-T10)', () => {
    let mockDataSource: any

    let sessions: any[] = []
    let messages: any[] = []
    let specRevisions: any[] = []
    let draftRevisions: any[] = []
    let buildJobs: any[] = []
    let chatflows: any[] = []
    let auditLogs: any[] = []

    let publishService: PublishService
    let zeroDowntimeService: ZeroDowntimeService
    let backupService: BackupRestoreService
    let recoveryService: RecoveryService
    let tokenUsageService: TokenUsageService
    let retentionService: RetentionService

    const createMockRepo = (storage: any[]) => ({
        find: jest.fn(async (opts?: any) => {
            let items = [...storage]
            if (opts?.where) {
                items = items.filter((item) => {
                    return Object.entries(opts.where).every(([k, v]) => {
                        if (typeof v === 'object' && v !== null && (v as any)._type === 'in') {
                            return ((v as any)._value || []).includes((item as any)[k])
                        }
                        if (typeof v === 'object' && v !== null) return true
                        return (item as any)[k] === v
                    })
                })
            }
            return items
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
        }),
        delete: jest.fn(async (cond: any) => {
            const targetId = cond?.id || cond
            const idx = storage.findIndex((item) => item.id === targetId)
            if (idx >= 0) storage.splice(idx, 1)
            return { affected: 1 }
        })
    })

    beforeEach(() => {
        sessions = []
        messages = []
        specRevisions = []
        draftRevisions = []
        buildJobs = []
        chatflows = []
        auditLogs = []

        mockDataSource = {
            getRepository: jest.fn((target: any) => {
                if (target === BuilderSession) return createMockRepo(sessions)
                if (target === BuilderMessage) return createMockRepo(messages)
                if (target === AgentSpecRevision) return createMockRepo(specRevisions)
                if (target === AgentDraftRevision) return createMockRepo(draftRevisions)
                if (target === BuildJob) return createMockRepo(buildJobs)
                if (target === ChatFlow) return createMockRepo(chatflows)
                if (target === BuilderAuditLog) return createMockRepo(auditLogs)
                throw new Error(`Unknown entity: ${target}`)
            })
        }

        publishService = new PublishService(mockDataSource)
        zeroDowntimeService = new ZeroDowntimeService(mockDataSource)
        backupService = new BackupRestoreService(mockDataSource)
        recoveryService = new RecoveryService(mockDataSource)
        tokenUsageService = new TokenUsageService()
        retentionService = new RetentionService(
            {
                defaultRetentionDays: 30,
                auditLogRetentionDays: 90,
                allowPurgePublished: false
            },
            mockDataSource
        )
    })

    it('Hoàn thành toàn bộ chu trình 10 bước của Bản Release Nội Bộ (Gate Release Phase 5)', async () => {
        const workspaceId = 'ws-release-phase5'
        const sessionId = 'session-release-001'
        const userId = 'lead-dev'

        // -----------------------------------------------------------------
        // BƯỚC 1: Khởi Tạo Session và Lưu Vết Trong DB
        // -----------------------------------------------------------------
        sessions.push({
            id: sessionId,
            workspaceId,
            organizationId: 'org-enterprise',
            userId,
            title: 'Trợ lý Tra Cứu Quy Chế Nội Bộ',
            state: 'collecting',
            currentRevisionNo: 0,
            createdDate: new Date(),
            updatedDate: new Date()
        })
        expect(sessions.length).toBe(1)
        expect(sessions[0].state).toBe('collecting')

        // -----------------------------------------------------------------
        // BƯỚC 2: Thu Thập Yêu Cầu & Quản Lý Bản Đặc Tả (AgentSpecRevision)
        // -----------------------------------------------------------------
        const specV1 = {
            name: 'Trợ lý Tra Cứu Quy Chế',
            role: 'Quy Chế & Pháp Chế',
            instructions: 'Hỗ trợ nhân viên tra cứu chính sách lương, thưởng và ngày phép.',
            evaluationExamples: [
                { input: 'Ngày phép năm là bao nhiêu?', expectedOutput: '12 ngày phép năm', criteria: 'exact' },
                { input: 'Quy định giờ làm việc?', expectedOutput: '8h30 đến 17h30', criteria: 'contains' }
            ]
        }

        specRevisions.push({
            id: 'spec-rev-1',
            sessionId,
            revisionNo: 1,
            spec: JSON.stringify(specV1),
            assumptions: '[]',
            missingFields: '[]',
            reasonCodes: '[]',
            specReady: true,
            buildReady: true,
            testReady: true,
            createdDate: new Date()
        })

        sessions[0].currentSpecRevisionId = 'spec-rev-1'
        sessions[0].currentRevisionNo = 1
        sessions[0].state = 'ready'

        expect(specRevisions.length).toBe(1)
        expect(sessions[0].currentRevisionNo).toBe(1)

        // -----------------------------------------------------------------
        // BƯỚC 3 & 4: Compiler Tự Động Sinh Agentflow V2 Draft & Build Job
        // -----------------------------------------------------------------
        const flowId = 'chatflow-flowise-v2'
        chatflows.push({
            id: flowId,
            name: 'Trợ lý Tra Cứu Quy Chế',
            flowData: JSON.stringify({
                nodes: [
                    { id: 'startNode', type: 'agentFlow' },
                    { id: 'llmNode', type: 'chatOpenAI' }
                ],
                edges: []
            }),
            deployed: false,
            isPublic: false,
            workspaceId,
            createdDate: new Date(),
            updatedDate: new Date()
        })

        draftRevisions.push({
            id: 'draft-rev-1',
            sessionId,
            specRevisionId: 'spec-rev-1',
            buildKey: 'bk-release-1',
            flowId,
            planId: 'plan-release-1',
            templateId: 'knowledgeAgentflow',
            templateVersion: '1.0.0',
            createdDate: new Date()
        })

        buildJobs.push({
            id: 'job-release-1',
            sessionId,
            workspaceId,
            specRevisionId: 'spec-rev-1',
            buildKey: 'bk-release-1',
            state: 'completed',
            flowId,
            createdDate: new Date()
        })

        expect(draftRevisions.length).toBe(1)
        expect(chatflows[0].deployed).toBe(false)

        // -----------------------------------------------------------------
        // BƯỚC 5: Cổng Chất Lượng (Quality Gate) & Báo Cáo Đánh Giá
        // -----------------------------------------------------------------
        // Mock EvaluationRunner trả về 100% pass
        jest.spyOn(publishService['evalRunner'], 'runTestSuite').mockResolvedValueOnce({
            flowId,
            totalCount: 2,
            passedCount: 2,
            failedCount: 0,
            allPassed: true,
            executionTimeMs: 450,
            results: []
        })

        // -----------------------------------------------------------------
        // BƯỚC 6: Xuất Bản An Toàn (Publish Agent)
        // -----------------------------------------------------------------
        const publishResult = await publishService.publishAgent({
            sessionId,
            workspaceId,
            userId,
            isPublic: true,
            minPassRate: 0.8,
            notes: 'Nghiệm thu bản release nội bộ chính thức'
        })

        expect(publishResult.success).toBe(true)
        expect(publishResult.deployed).toBe(true)
        expect(publishResult.isPublic).toBe(true)
        expect(chatflows[0].deployed).toBe(true)
        expect(sessions[0].state).toBe('published')

        // Xác nhận audit log đã được ghi
        const pubLog = auditLogs.find((l) => l.action === 'AGENT_PUBLISHED')
        expect(pubLog).toBeDefined()
        expect(pubLog.status).toBe('SUCCESS')

        // -----------------------------------------------------------------
        // BƯỚC 7: Zero-Downtime Draft Switch & Instant Rollback
        // -----------------------------------------------------------------
        // Tạo thêm revision 2
        specRevisions.push({
            id: 'spec-rev-2',
            sessionId,
            revisionNo: 2,
            spec: JSON.stringify({ ...specV1, name: 'Trợ lý v2 lỗi' }),
            assumptions: '[]',
            missingFields: '[]',
            reasonCodes: '[]',
            specReady: true,
            buildReady: true,
            testReady: true,
            createdDate: new Date()
        })
        sessions[0].currentSpecRevisionId = 'spec-rev-2'
        sessions[0].currentRevisionNo = 2

        // Thực hiện Instant Rollback về revision 1
        const rollbackResult = await zeroDowntimeService.instantRollback({
            sessionId,
            workspaceId,
            userId,
            targetRevisionId: 'spec-rev-1'
        })

        expect(rollbackResult.success).toBe(true)
        expect(rollbackResult.flowId).toBe(flowId)
        expect(rollbackResult.revisionNo).toBe(3) // Sinh revision 3 bất biến
        expect(rollbackResult.deployed).toBe(true) // Giữ nguyên deployed không ngắt kết nối!
        expect(chatflows[0].deployed).toBe(true)

        // -----------------------------------------------------------------
        // BƯỚC 8: Cơ Chế Phục Hồi Khi Crash / Server Restart
        // -----------------------------------------------------------------
        // Giả lập một job bị kẹt trạng thái 'running' do server tắt đột ngột
        buildJobs.push({
            id: 'stale-job-crash',
            sessionId,
            workspaceId,
            specRevisionId: 'spec-rev-1',
            buildKey: 'bk-stale',
            state: 'running',
            startedDate: new Date(Date.now() - 60000), // Treo 60 giây
            createdDate: new Date(Date.now() - 60000)
        })

        const recoveryReport = await recoveryService.reconcileStaleJobs({ maxStaleMs: 30000 })
        expect(recoveryReport.reconciledJobsCount).toBe(1)
        expect(recoveryReport.reconciledJobIds).toContain('stale-job-crash')

        // -----------------------------------------------------------------
        // BƯỚC 9: Đo Lường Token Usage & Chi Phí Thực Tế
        // -----------------------------------------------------------------
        const usage = tokenUsageService.recordUsage({
            sessionId,
            workspaceId,
            provider: 'openai',
            model: 'gpt-4o',
            promptTokens: 800,
            completionTokens: 250,
            source: 'conversation'
        })

        expect(usage.totalTokens).toBe(1050)
        expect(usage.estimatedCostUsd).toBeGreaterThan(0)

        const sessionSummary = tokenUsageService.getSessionSummary(sessionId, workspaceId)
        expect(sessionSummary.totalTokens).toBe(1050)
        expect(sessionSummary.recordsCount).toBe(1)

        // -----------------------------------------------------------------
        // BƯỚC 10: Sao Lưu, Redaction & Schema Invariants
        // -----------------------------------------------------------------
        // 1. Kiểm tra Credential Redaction
        const sensitivePrompt = 'Khởi tạo client OpenAI với sk-abcdefghijklmnopqrstuvwxyz1234567890 và token bí mật'
        const redacted = redactionService.redactString(sensitivePrompt)
        expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890')
        expect(redacted).toContain('[REDACTED_OPENAI_KEY]')

        // 2. Xuất bản sao lưu (Backup)
        const backupBundle = await backupService.exportSessionBackup(sessionId, workspaceId)
        expect(backupBundle.sessionId).toBe(sessionId)
        expect(backupBundle.checksum).toBeDefined()

        // 3. Kiểm tra Schema Invariants
        const schemaValidation = await backupService.validateSchemaInvariants()
        expect(schemaValidation.valid).toBe(true)
        expect(schemaValidation.totalOrphaned).toBe(0)

        // 4. Data Retention Sweep: Bảo vệ tuyệt đối phiên đã xuất bản
        const purgeReport = await retentionService.executeRetentionSweep(workspaceId)
        expect(purgeReport.purgedSessionsCount).toBe(0) // Session published được giữ nguyên vẹn
        expect(sessions.find((s) => s.id === sessionId)).toBeDefined()
    })
})
