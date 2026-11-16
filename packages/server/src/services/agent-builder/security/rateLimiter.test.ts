import { RateLimiter } from './rateLimiter'
import { BuilderError } from '../errors/builderErrors'

describe('RateLimiter (PH5-T06)', () => {
    let limiter: RateLimiter

    beforeEach(() => {
        limiter = new RateLimiter({
            message: { windowMs: 1000, maxRequests: 3 }, // 3 requests / 1s cho test
            build: { windowMs: 1000, maxRequests: 2 }
        })
    })

    it('should allow requests within the limit', () => {
        const res1 = limiter.checkLimit('ws-1', 'message')
        expect(res1.allowed).toBe(true)
        expect(res1.remaining).toBe(2)

        const res2 = limiter.checkLimit('ws-1', 'message')
        expect(res2.allowed).toBe(true)
        expect(res2.remaining).toBe(1)

        const res3 = limiter.checkLimit('ws-1', 'message')
        expect(res3.allowed).toBe(true)
        expect(res3.remaining).toBe(0)
    })

    it('should reject requests exceeding the limit', () => {
        limiter.checkLimit('ws-1', 'message')
        limiter.checkLimit('ws-1', 'message')
        limiter.checkLimit('ws-1', 'message')

        const res4 = limiter.checkLimit('ws-1', 'message')
        expect(res4.allowed).toBe(false)
        expect(res4.remaining).toBe(0)
        expect(res4.resetAfterMs).toBeGreaterThan(0)
    })

    it('should throw BuilderError with HTTP 429 when enforceLimit fails', () => {
        limiter.enforceLimit('ws-1', 'build')
        limiter.enforceLimit('ws-1', 'build')

        expect(() => {
            limiter.enforceLimit('ws-1', 'build')
        }).toThrow(BuilderError)

        try {
            limiter.enforceLimit('ws-1', 'build')
        } catch (err: any) {
            expect(err.statusCode).toBe(429)
            expect(err.code).toBe('RATE_LIMIT_EXCEEDED')
            expect(err.details.category).toBe('build')
        }
    })

    it('should isolate limits by workspace key', () => {
        limiter.checkLimit('ws-A', 'message')
        limiter.checkLimit('ws-A', 'message')
        limiter.checkLimit('ws-A', 'message')

        // ws-A đã hết quota
        expect(limiter.checkLimit('ws-A', 'message').allowed).toBe(false)

        // ws-B vẫn còn nguyên quota
        const resB = limiter.checkLimit('ws-B', 'message')
        expect(resB.allowed).toBe(true)
        expect(resB.remaining).toBe(2)
    })

    it('should reset limits when reset() is called', () => {
        limiter.checkLimit('ws-A', 'message')
        limiter.checkLimit('ws-A', 'message')
        limiter.checkLimit('ws-A', 'message')
        expect(limiter.checkLimit('ws-A', 'message').allowed).toBe(false)

        limiter.reset('ws-A')
        expect(limiter.checkLimit('ws-A', 'message').allowed).toBe(true)
    })
})
