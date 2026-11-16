import { StatusCodes } from 'http-status-codes'
import { BuilderError } from '../errors/builderErrors'

export type RateLimitCategory = 'session_create' | 'message' | 'build' | 'test_suite' | 'publish'

export interface RateLimitRule {
    windowMs: number
    maxRequests: number
}

export interface RateLimitResult {
    allowed: boolean
    remaining: number
    resetAfterMs: number
    totalLimit: number
}

export const DEFAULT_RATE_LIMITS: Record<RateLimitCategory, RateLimitRule> = {
    session_create: { windowMs: 60 * 60 * 1000, maxRequests: 30 }, // 30 sessions / 1 giờ
    message: { windowMs: 60 * 1000, maxRequests: 60 }, // 60 messages / 1 phút
    build: { windowMs: 60 * 1000, maxRequests: 15 }, // 15 builds / 1 phút
    test_suite: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 test runs / 1 phút
    publish: { windowMs: 60 * 1000, maxRequests: 10 } // 10 publishes / 1 phút
}

interface WindowRecord {
    timestamps: number[]
}

export class RateLimiter {
    private store: Map<string, WindowRecord> = new Map()
    private rules: Record<RateLimitCategory, RateLimitRule>

    constructor(customRules?: Partial<Record<RateLimitCategory, RateLimitRule>>) {
        this.rules = { ...DEFAULT_RATE_LIMITS, ...customRules }
    }

    /**
     * Kiểm tra trạng thái giới hạn tần suất theo key và category.
     */
    checkLimit(key: string, category: RateLimitCategory): RateLimitResult {
        const rule = this.rules[category] || { windowMs: 60 * 1000, maxRequests: 60 }
        const now = Date.now()
        const storeKey = `${key}:${category}`

        let record = this.store.get(storeKey)
        if (!record) {
            record = { timestamps: [] }
            this.store.set(storeKey, record)
        }

        // Lọc bỏ các timestamp cũ hơn cửa sổ trượt (sliding window)
        const windowStart = now - rule.windowMs
        record.timestamps = record.timestamps.filter((ts) => ts > windowStart)

        const currentCount = record.timestamps.length
        if (currentCount >= rule.maxRequests) {
            const earliestTimestamp = record.timestamps[0] || now
            const resetAfterMs = Math.max(0, earliestTimestamp + rule.windowMs - now)
            return {
                allowed: false,
                remaining: 0,
                resetAfterMs,
                totalLimit: rule.maxRequests
            }
        }

        // Ghi nhận request mới
        record.timestamps.push(now)
        return {
            allowed: true,
            remaining: rule.maxRequests - record.timestamps.length,
            resetAfterMs: rule.windowMs,
            totalLimit: rule.maxRequests
        }
    }

    /**
     * Kiểm tra và cưỡng chế (enforce). Ném ngoại lệ BuilderError HTTP 429 nếu vượt ngưỡng.
     */
    enforceLimit(key: string, category: RateLimitCategory): RateLimitResult {
        const result = this.checkLimit(key, category)
        if (!result.allowed) {
            const retryAfterSec = Math.ceil(result.resetAfterMs / 1000)
            throw new BuilderError(
                StatusCodes.TOO_MANY_REQUESTS,
                'RATE_LIMIT_EXCEEDED',
                `Đã vượt quá giới hạn tần suất cho thao tác ${category}. Vui lòng thử lại sau ${retryAfterSec} giây.`,
                {
                    category,
                    retryAfterSeconds: retryAfterSec,
                    totalLimit: result.totalLimit
                }
            )
        }
        return result
    }

    /**
     * Xóa sạch dữ liệu cache lưu vết phục vụ reset hoặc test.
     */
    reset(key?: string): void {
        if (key) {
            for (const storeKey of this.store.keys()) {
                if (storeKey.startsWith(`${key}:`)) {
                    this.store.delete(storeKey)
                }
            }
        } else {
            this.store.clear()
        }
    }
}

export const rateLimiter = new RateLimiter()
export default rateLimiter
