/**
 * Observability Metrics Service (PH5-T04 & PH5-T05).
 * Thu thập và tổng hợp số liệu vận hành phục vụ giám sát, cảnh báo và đo lường chi phí/tài nguyên.
 */

export interface ObservabilityMetricsSnapshot {
    sessionsCreated: number
    builds: {
        total: number
        success: number
        failed: number
        successRate: number
        avgDurationMs: number
    }
    evaluations: {
        totalRuns: number
        casesPassed: number
        casesFailed: number
        passRate: number
    }
    lifecycle: {
        published: number
        unpublished: number
    }
    security: {
        rateLimitViolationsTotal: number
        rateLimitByCategory: Record<string, number>
        purgedSessionsTotal: number
    }
    collectedAt: string
}

export class MetricsService {
    private sessionsCreated = 0
    private buildsTotal = 0
    private buildsSuccess = 0
    private buildsFailed = 0
    private totalBuildDurationMs = 0

    private evalRunsTotal = 0
    private evalPassedCases = 0
    private evalFailedCases = 0

    private publishedCount = 0
    private unpublishedCount = 0

    private rateLimitByCategory: Record<string, number> = {}
    private purgedSessionsCount = 0

    recordSessionCreated(): void {
        this.sessionsCreated += 1
    }

    recordBuild(success: boolean, durationMs = 0): void {
        this.buildsTotal += 1
        if (success) {
            this.buildsSuccess += 1
        } else {
            this.buildsFailed += 1
        }
        if (durationMs > 0) {
            this.totalBuildDurationMs += durationMs
        }
    }

    recordEvaluation(passed: number, failed: number): void {
        this.evalRunsTotal += 1
        this.evalPassedCases += passed
        this.evalFailedCases += failed
    }

    recordPublish(action: 'publish' | 'unpublish'): void {
        if (action === 'publish') {
            this.publishedCount += 1
        } else {
            this.unpublishedCount += 1
        }
    }

    recordRateLimitViolation(category: string): void {
        this.rateLimitByCategory[category] = (this.rateLimitByCategory[category] || 0) + 1
    }

    recordRetentionPurge(sessionsCount: number): void {
        this.purgedSessionsCount += sessionsCount
    }

    getMetricsSnapshot(): ObservabilityMetricsSnapshot {
        const buildSuccessRate = this.buildsTotal > 0 ? (this.buildsSuccess / this.buildsTotal) * 100 : 100
        const avgBuildDuration = this.buildsTotal > 0 ? this.totalBuildDurationMs / this.buildsTotal : 0

        const totalCases = this.evalPassedCases + this.evalFailedCases
        const evalPassRate = totalCases > 0 ? (this.evalPassedCases / totalCases) * 100 : 100

        const rateLimitViolationsTotal = Object.values(this.rateLimitByCategory).reduce((sum, v) => sum + v, 0)

        return {
            sessionsCreated: this.sessionsCreated,
            builds: {
                total: this.buildsTotal,
                success: this.buildsSuccess,
                failed: this.buildsFailed,
                successRate: Math.round(buildSuccessRate * 10) / 10,
                avgDurationMs: Math.round(avgBuildDuration)
            },
            evaluations: {
                totalRuns: this.evalRunsTotal,
                casesPassed: this.evalPassedCases,
                casesFailed: this.evalFailedCases,
                passRate: Math.round(evalPassRate * 10) / 10
            },
            lifecycle: {
                published: this.publishedCount,
                unpublished: this.unpublishedCount
            },
            security: {
                rateLimitViolationsTotal,
                rateLimitByCategory: { ...this.rateLimitByCategory },
                purgedSessionsTotal: this.purgedSessionsCount
            },
            collectedAt: new Date().toISOString()
        }
    }

    reset(): void {
        this.sessionsCreated = 0
        this.buildsTotal = 0
        this.buildsSuccess = 0
        this.buildsFailed = 0
        this.totalBuildDurationMs = 0
        this.evalRunsTotal = 0
        this.evalPassedCases = 0
        this.evalFailedCases = 0
        this.publishedCount = 0
        this.unpublishedCount = 0
        this.rateLimitByCategory = {}
        this.purgedSessionsCount = 0
    }
}

export const metricsService = new MetricsService()
export default metricsService
