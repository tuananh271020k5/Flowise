import redactionService from '../security/redactionService'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export type PipelineStage = 'conversation' | 'compilation' | 'testing' | 'publishing' | 'security' | 'retention'

export interface StructuredLogEntry {
    timestamp: string
    level: LogLevel
    stage: PipelineStage
    traceId: string
    sessionId?: string
    workspaceId?: string
    action: string
    durationMs?: number
    details?: Record<string, unknown>
    error?: unknown
}

export class BuilderLogger {
    private buffer: StructuredLogEntry[] = []
    private maxBufferSize = 200

    /**
     * Tạo một trace ID ngẫu nhiên nếu không được truyền vào.
     */
    generateTraceId(): string {
        return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    }

    /**
     * Ghi log có cấu trúc chuẩn JSON, tự động redact mọi credential/secret.
     */
    log(entry: Omit<StructuredLogEntry, 'timestamp'>): StructuredLogEntry {
        const fullEntry: StructuredLogEntry = {
            timestamp: new Date().toISOString(),
            level: entry.level,
            stage: entry.stage,
            traceId: entry.traceId || this.generateTraceId(),
            sessionId: entry.sessionId,
            workspaceId: entry.workspaceId,
            action: entry.action,
            durationMs: entry.durationMs,
            details: entry.details ? redactionService.redactObject(entry.details) : undefined,
            error: entry.error
                ? typeof entry.error === 'string'
                    ? redactionService.redactString(entry.error)
                    : redactionService.redactObject(entry.error)
                : undefined
        }

        // Lưu vào bộ đệm gần nhất
        this.buffer.unshift(fullEntry)
        if (this.buffer.length > this.maxBufferSize) {
            this.buffer.pop()
        }

        return fullEntry
    }

    info(
        stage: PipelineStage,
        action: string,
        details?: Record<string, unknown>,
        meta?: { traceId?: string; sessionId?: string; workspaceId?: string; durationMs?: number }
    ): StructuredLogEntry {
        return this.log({
            level: 'info',
            stage,
            action,
            details,
            traceId: meta?.traceId || this.generateTraceId(),
            sessionId: meta?.sessionId,
            workspaceId: meta?.workspaceId,
            durationMs: meta?.durationMs
        })
    }

    warn(
        stage: PipelineStage,
        action: string,
        details?: Record<string, unknown>,
        meta?: { traceId?: string; sessionId?: string; workspaceId?: string }
    ): StructuredLogEntry {
        return this.log({
            level: 'warn',
            stage,
            action,
            details,
            traceId: meta?.traceId || this.generateTraceId(),
            sessionId: meta?.sessionId,
            workspaceId: meta?.workspaceId
        })
    }

    error(
        stage: PipelineStage,
        action: string,
        error: unknown,
        meta?: { traceId?: string; sessionId?: string; workspaceId?: string; details?: Record<string, unknown> }
    ): StructuredLogEntry {
        return this.log({
            level: 'error',
            stage,
            action,
            error,
            details: meta?.details,
            traceId: meta?.traceId || this.generateTraceId(),
            sessionId: meta?.sessionId,
            workspaceId: meta?.workspaceId
        })
    }

    getRecentLogs(limit = 50, filter?: { stage?: PipelineStage; sessionId?: string; workspaceId?: string }): StructuredLogEntry[] {
        let logs = [...this.buffer]
        if (filter?.stage) {
            logs = logs.filter((l) => l.stage === filter.stage)
        }
        if (filter?.sessionId) {
            logs = logs.filter((l) => l.sessionId === filter.sessionId)
        }
        if (filter?.workspaceId) {
            logs = logs.filter((l) => l.workspaceId === filter.workspaceId)
        }
        return logs.slice(0, limit)
    }

    clearBuffer(): void {
        this.buffer = []
    }
}

export const builderLogger = new BuilderLogger()
export default builderLogger
