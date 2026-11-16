/**
 * Token Usage & Cost Tracking Service (PH5-T05).
 * Thu thập và phân tích chi phí tiêu thụ token theo nhà cung cấp (OpenAI, Anthropic, Gemini, Groq, Ollama)
 * và phân loại theo mục đích sử dụng (conversation, compilation, evaluation, prediction).
 */

export type UsageSource = 'conversation' | 'compilation' | 'evaluation' | 'prediction'

export interface ModelPricing {
    promptPerMillion: number
    completionPerMillion: number
}

export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
    // OpenAI Models
    'gpt-4o': { promptPerMillion: 2.5, completionPerMillion: 10.0 },
    'gpt-4o-mini': { promptPerMillion: 0.15, completionPerMillion: 0.6 },
    'gpt-4-turbo': { promptPerMillion: 10.0, completionPerMillion: 30.0 },
    'gpt-3.5-turbo': { promptPerMillion: 0.5, completionPerMillion: 1.5 },

    // Anthropic Models
    'claude-3-5-sonnet-20241022': { promptPerMillion: 3.0, completionPerMillion: 15.0 },
    'claude-3-5-sonnet': { promptPerMillion: 3.0, completionPerMillion: 15.0 },
    'claude-3-haiku': { promptPerMillion: 0.25, completionPerMillion: 1.25 },
    'claude-3-opus': { promptPerMillion: 15.0, completionPerMillion: 75.0 },

    // Google Gemini Models
    'gemini-1.5-pro': { promptPerMillion: 1.25, completionPerMillion: 5.0 },
    'gemini-1.5-flash': { promptPerMillion: 0.075, completionPerMillion: 0.3 },
    'gemini-pro': { promptPerMillion: 0.5, completionPerMillion: 1.5 },

    // Local / Self-hosted / Free Providers
    'llama-3-8b': { promptPerMillion: 0, completionPerMillion: 0 },
    'llama-3-70b': { promptPerMillion: 0, completionPerMillion: 0 },
    ollama: { promptPerMillion: 0, completionPerMillion: 0 },
    groq: { promptPerMillion: 0, completionPerMillion: 0 }
}

export interface RecordUsageDTO {
    sessionId: string
    workspaceId: string
    source: UsageSource
    provider?: string
    model?: string
    promptTokens: number
    completionTokens: number
}

export interface TokenUsageRecord {
    id: string
    sessionId: string
    workspaceId: string
    source: UsageSource
    provider: string
    model: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostUsd: number
    timestamp: string
}

export interface UsageSummary {
    sessionId?: string
    workspaceId?: string
    totalPromptTokens: number
    totalCompletionTokens: number
    totalTokens: number
    totalCostUsd: number
    bySource: Record<UsageSource, { totalTokens: number; costUsd: number }>
    byProvider: Record<string, { totalTokens: number; costUsd: number }>
    recordsCount: number
}

export class TokenUsageService {
    private records: TokenUsageRecord[] = []
    private pricing: Record<string, ModelPricing>

    constructor(customPricing?: Record<string, ModelPricing>) {
        this.pricing = { ...DEFAULT_MODEL_PRICING, ...customPricing }
    }

    /**
     * Tính toán chi phí ước tính (USD) từ số lượng token và model.
     */
    calculateCost(_provider = 'unknown', model = 'unknown', promptTokens = 0, completionTokens = 0): number {
        const normalizedModel = (model || '').toLowerCase().trim()
        const pricing = this.pricing[normalizedModel] || { promptPerMillion: 0, completionPerMillion: 0 }

        const promptCost = (promptTokens / 1_000_000) * pricing.promptPerMillion
        const completionCost = (completionTokens / 1_000_000) * pricing.completionPerMillion

        return Math.round((promptCost + completionCost) * 1_000_000) / 1_000_000
    }

    /**
     * Ghi nhận một giao dịch sử dụng token.
     */
    recordUsage(params: RecordUsageDTO): TokenUsageRecord {
        const provider = params.provider || 'unknown'
        const model = params.model || 'unknown'
        const promptTokens = Math.max(0, params.promptTokens || 0)
        const completionTokens = Math.max(0, params.completionTokens || 0)
        const totalTokens = promptTokens + completionTokens

        const estimatedCostUsd = this.calculateCost(provider, model, promptTokens, completionTokens)

        const record: TokenUsageRecord = {
            id: `usage-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            sessionId: params.sessionId,
            workspaceId: params.workspaceId,
            source: params.source,
            provider,
            model,
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostUsd,
            timestamp: new Date().toISOString()
        }

        this.records.push(record)
        return record
    }

    /**
     * Lấy danh sách chi tiết các bản ghi usage theo session.
     */
    getSessionUsage(sessionId: string, workspaceId: string): TokenUsageRecord[] {
        return this.records.filter((r) => r.sessionId === sessionId && r.workspaceId === workspaceId)
    }

    /**
     * Tổng hợp số liệu sử dụng token và chi phí cho một session cụ thể.
     */
    getSessionSummary(sessionId: string, workspaceId: string): UsageSummary {
        const sessionRecords = this.getSessionUsage(sessionId, workspaceId)
        return this.aggregateRecords(sessionRecords, { sessionId, workspaceId })
    }

    /**
     * Tổng hợp số liệu sử dụng token và chi phí cho toàn bộ một workspace.
     */
    getWorkspaceSummary(workspaceId: string): UsageSummary {
        const workspaceRecords = this.records.filter((r) => r.workspaceId === workspaceId)
        return this.aggregateRecords(workspaceRecords, { workspaceId })
    }

    private aggregateRecords(records: TokenUsageRecord[], meta: { sessionId?: string; workspaceId?: string }): UsageSummary {
        let totalPromptTokens = 0
        let totalCompletionTokens = 0
        let totalCostUsd = 0

        const bySource: Record<UsageSource, { totalTokens: number; costUsd: number }> = {
            conversation: { totalTokens: 0, costUsd: 0 },
            compilation: { totalTokens: 0, costUsd: 0 },
            evaluation: { totalTokens: 0, costUsd: 0 },
            prediction: { totalTokens: 0, costUsd: 0 }
        }

        const byProvider: Record<string, { totalTokens: number; costUsd: number }> = {}

        for (const r of records) {
            totalPromptTokens += r.promptTokens
            totalCompletionTokens += r.completionTokens
            totalCostUsd += r.estimatedCostUsd

            // Phân nhóm theo source
            if (bySource[r.source]) {
                bySource[r.source].totalTokens += r.totalTokens
                bySource[r.source].costUsd += r.estimatedCostUsd
            }

            // Phân nhóm theo provider
            if (!byProvider[r.provider]) {
                byProvider[r.provider] = { totalTokens: 0, costUsd: 0 }
            }
            byProvider[r.provider].totalTokens += r.totalTokens
            byProvider[r.provider].costUsd += r.estimatedCostUsd
        }

        return {
            sessionId: meta.sessionId,
            workspaceId: meta.workspaceId,
            totalPromptTokens,
            totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
            totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
            bySource,
            byProvider,
            recordsCount: records.length
        }
    }

    /**
     * Xóa sạch dữ liệu cache lưu vết phục vụ reset/testing.
     */
    clear(): void {
        this.records = []
    }
}

export const tokenUsageService = new TokenUsageService()
export default tokenUsageService
