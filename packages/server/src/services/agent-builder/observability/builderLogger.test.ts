import { builderLogger } from './builderLogger'
import { metricsService } from './metricsService'

describe('Structured Observability & Metrics (PH5-T04 & PH5-T05)', () => {
    beforeEach(() => {
        builderLogger.clearBuffer()
        metricsService.reset()
    })

    describe('BuilderLogger', () => {
        it('should log structured info entries with traceId', () => {
            const entry = builderLogger.info(
                'compilation',
                'COMPILER_START',
                { template: 'knowledge' },
                {
                    sessionId: 'sess-123',
                    workspaceId: 'ws-main',
                    durationMs: 45
                }
            )

            expect(entry.level).toBe('info')
            expect(entry.stage).toBe('compilation')
            expect(entry.action).toBe('COMPILER_START')
            expect(entry.sessionId).toBe('sess-123')
            expect(entry.workspaceId).toBe('ws-main')
            expect(entry.durationMs).toBe(45)
            expect(entry.traceId).toMatch(/^trace-/)
            expect(entry.timestamp).toBeDefined()
        })

        it('should automatically redact sensitive tokens in structured log details', () => {
            const entry = builderLogger.info('conversation', 'PROCESS_MESSAGE', {
                userPrompt: 'Đây là key của tôi sk-abcdef12345678901234567890 và mật khẩu 123456',
                apiKey: 'sk-ant-api03-abcdef1234567890abcdef12345'
            })

            expect(JSON.stringify(entry.details)).not.toContain('sk-abcdef12345678901234567890')
            expect(JSON.stringify(entry.details)).not.toContain('sk-ant-api03-abcdef1234567890abcdef12345')
            expect(entry.details?.apiKey).toBe('[REDACTED_CREDENTIAL]')
        })

        it('should record errors with redacted message and trace', () => {
            const entry = builderLogger.error('testing', 'TEST_RUN_FAIL', new Error('Failed to connect with sk-1234567890123456789012345'))
            expect(entry.level).toBe('error')
            expect(entry.stage).toBe('testing')
            expect(JSON.stringify(entry.error)).not.toContain('sk-1234567890123456789012345')
        })

        it('should filter recent logs by stage and sessionId', () => {
            builderLogger.info('conversation', 'MSG_1', undefined, { sessionId: 's1' })
            builderLogger.info('compilation', 'BUILD_1', undefined, { sessionId: 's1' })
            builderLogger.info('testing', 'TEST_1', undefined, { sessionId: 's2' })

            const filteredStage = builderLogger.getRecentLogs(10, { stage: 'compilation' })
            expect(filteredStage.length).toBe(1)
            expect(filteredStage[0].action).toBe('BUILD_1')

            const filteredSession = builderLogger.getRecentLogs(10, { sessionId: 's1' })
            expect(filteredSession.length).toBe(2)
        })
    })

    describe('MetricsService', () => {
        it('should record builds and calculate success rate', () => {
            metricsService.recordBuild(true, 100)
            metricsService.recordBuild(true, 200)
            metricsService.recordBuild(false, 300)

            const snapshot = metricsService.getMetricsSnapshot()
            expect(snapshot.builds.total).toBe(3)
            expect(snapshot.builds.success).toBe(2)
            expect(snapshot.builds.failed).toBe(1)
            expect(snapshot.builds.successRate).toBeCloseTo(66.7, 1)
            expect(snapshot.builds.avgDurationMs).toBe(200)
        })

        it('should record evaluations and calculate pass rate', () => {
            metricsService.recordEvaluation(8, 2) // 8 pass, 2 fail -> 80%

            const snapshot = metricsService.getMetricsSnapshot()
            expect(snapshot.evaluations.totalRuns).toBe(1)
            expect(snapshot.evaluations.casesPassed).toBe(8)
            expect(snapshot.evaluations.casesFailed).toBe(2)
            expect(snapshot.evaluations.passRate).toBe(80)
        })

        it('should track publish lifecycle and security events', () => {
            metricsService.recordSessionCreated()
            metricsService.recordPublish('publish')
            metricsService.recordPublish('unpublish')
            metricsService.recordRateLimitViolation('message')
            metricsService.recordRateLimitViolation('message')
            metricsService.recordRetentionPurge(5)

            const snapshot = metricsService.getMetricsSnapshot()
            expect(snapshot.sessionsCreated).toBe(1)
            expect(snapshot.lifecycle.published).toBe(1)
            expect(snapshot.lifecycle.unpublished).toBe(1)
            expect(snapshot.security.rateLimitViolationsTotal).toBe(2)
            expect(snapshot.security.rateLimitByCategory['message']).toBe(2)
            expect(snapshot.security.purgedSessionsTotal).toBe(5)
        })
    })
})
