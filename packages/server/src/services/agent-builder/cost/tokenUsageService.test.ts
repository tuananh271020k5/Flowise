import { TokenUsageService } from './tokenUsageService'

describe('TokenUsageService (PH5-T05)', () => {
    let usageService: TokenUsageService

    beforeEach(() => {
        usageService = new TokenUsageService()
    })

    it('should calculate estimated cost correctly for OpenAI models', () => {
        // GPT-4o: prompt $2.5 / 1M, completion $10 / 1M
        // 1,000 prompt tokens = $0.0025, 500 completion tokens = $0.005 -> tổng $0.0075
        const cost = usageService.calculateCost('openai', 'gpt-4o', 1000, 500)
        expect(cost).toBeCloseTo(0.0075, 5)
    })

    it('should calculate estimated cost correctly for Anthropic Claude models', () => {
        // Claude 3.5 Sonnet: prompt $3.0 / 1M, completion $15.0 / 1M
        // 10,000 prompt tokens = $0.03, 2,000 completion = $0.03 -> tổng $0.06
        const cost = usageService.calculateCost('anthropic', 'claude-3-5-sonnet', 10000, 2000)
        expect(cost).toBeCloseTo(0.06, 5)
    })

    it('should return 0 cost for free/local models or unknown', () => {
        const costOllama = usageService.calculateCost('ollama', 'llama-3-8b', 5000, 1000)
        expect(costOllama).toBe(0)

        const costUnknown = usageService.calculateCost('custom', 'my-custom-model', 5000, 1000)
        expect(costUnknown).toBe(0)
    })

    it('should record usage transaction and aggregate by session', () => {
        usageService.recordUsage({
            sessionId: 'sess-1',
            workspaceId: 'ws-1',
            source: 'conversation',
            provider: 'openai',
            model: 'gpt-4o-mini',
            promptTokens: 1000,
            completionTokens: 200
        })

        usageService.recordUsage({
            sessionId: 'sess-1',
            workspaceId: 'ws-1',
            source: 'evaluation',
            provider: 'openai',
            model: 'gpt-4o-mini',
            promptTokens: 2000,
            completionTokens: 500
        })

        const summary = usageService.getSessionSummary('sess-1', 'ws-1')
        expect(summary.totalPromptTokens).toBe(3000)
        expect(summary.totalCompletionTokens).toBe(700)
        expect(summary.totalTokens).toBe(3700)
        expect(summary.recordsCount).toBe(2)
        expect(summary.bySource.conversation.totalTokens).toBe(1200)
        expect(summary.bySource.evaluation.totalTokens).toBe(2500)
        expect(summary.totalCostUsd).toBeGreaterThan(0)
    })

    it('should isolate usage summaries by workspace', () => {
        usageService.recordUsage({
            sessionId: 'sess-A',
            workspaceId: 'ws-A',
            source: 'conversation',
            promptTokens: 500,
            completionTokens: 100
        })

        usageService.recordUsage({
            sessionId: 'sess-B',
            workspaceId: 'ws-B',
            source: 'conversation',
            promptTokens: 800,
            completionTokens: 200
        })

        const summaryA = usageService.getWorkspaceSummary('ws-A')
        expect(summaryA.totalTokens).toBe(600)
        expect(summaryA.recordsCount).toBe(1)

        const summaryB = usageService.getWorkspaceSummary('ws-B')
        expect(summaryB.totalTokens).toBe(1000)
        expect(summaryB.recordsCount).toBe(1)
    })
})
