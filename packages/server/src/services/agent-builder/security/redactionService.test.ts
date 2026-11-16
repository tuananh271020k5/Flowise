import { redactionService } from './redactionService'

describe('RedactionService (PH5-T03)', () => {
    it('should redact OpenAI API keys', () => {
        const text = 'Sử dụng key sk-abcdef12345678901234567890 để gọi API'
        const redacted = redactionService.redactString(text)
        expect(redacted).not.toContain('sk-abcdef12345678901234567890')
        expect(redacted).toContain('[REDACTED_OPENAI_KEY]')
    })

    it('should redact Anthropic API keys', () => {
        const text = 'Claude key là sk-ant-api03-abcdef1234567890abcdef12345'
        const redacted = redactionService.redactString(text)
        expect(redacted).not.toContain('sk-ant-api03-abcdef1234567890abcdef12345')
        expect(redacted).toContain('[REDACTED_ANTHROPIC_KEY]')
    })

    it('should redact Google Gemini API keys', () => {
        const text = 'Gemini key: AIzaSyD9876543210abcdefghijklmnopqrs'
        const redacted = redactionService.redactString(text)
        expect(redacted).not.toContain('AIzaSyD9876543210abcdefghijklmnopqrs')
        expect(redacted).toContain('[REDACTED_GEMINI_KEY]')
    })

    it('should redact Database connection strings', () => {
        const text = 'Kết nối postgresql://user:pass123@localhost:5432/flowisedb'
        const redacted = redactionService.redactString(text)
        expect(redacted).not.toContain('pass123')
        expect(redacted).toContain('postgresql://[REDACTED_DB_URL]')
    })

    it('should redact Bearer authorization header tokens', () => {
        const text = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature'
        const redacted = redactionService.redactString(text)
        expect(redacted).not.toContain('doNotLeakThisSignature')
        expect(redacted).toContain('[REDACTED_BEARER_TOKEN]')
    })

    it('should correctly detect sensitive data with containsSensitiveData', () => {
        expect(redactionService.containsSensitiveData('Xin chào mọi người')).toBe(false)
        expect(redactionService.containsSensitiveData('Khóa sk-1234567890123456789012345')).toBe(true)
        expect(redactionService.containsSensitiveData('Mã AIzaSyD9876543210abcdefghijklmnopqrs')).toBe(true)
    })

    it('should recursively redact objects and sensitive key names', () => {
        const payload = {
            id: 'sess-001',
            apiKey: 'secret-key-123',
            password: 'my-super-secret-password',
            nested: {
                api_secret: 'hidden-secret',
                note: 'Gọi endpoint sk-1234567890123456789012345 của OpenAI',
                count: 42
            },
            tags: ['public', 'Bearer eyJhbGciOi...sample...token']
        }

        const cleaned = redactionService.redactObject(payload)

        expect(cleaned.apiKey).toBe('[REDACTED_CREDENTIAL]')
        expect(cleaned.password).toBe('[REDACTED_CREDENTIAL]')
        expect(cleaned.nested.api_secret).toBe('[REDACTED_CREDENTIAL]')
        expect(cleaned.nested.note).toContain('[REDACTED_OPENAI_KEY]')
        expect(cleaned.nested.count).toBe(42)
        expect(cleaned.id).toBe('sess-001')
    })

    it('should redact sensitive HTTP headers', () => {
        const headers = {
            'content-type': 'application/json',
            authorization: 'Bearer super-token-xyz',
            'x-api-key': 'secret-client-key',
            'user-agent': 'AgentBuilder/1.0'
        }

        const cleaned = redactionService.redactHeaders(headers)

        expect(cleaned.authorization).toBe('[REDACTED_HEADER]')
        expect(cleaned['x-api-key']).toBe('[REDACTED_HEADER]')
        expect(cleaned['content-type']).toBe('application/json')
        expect(cleaned['user-agent']).toBe('AgentBuilder/1.0')
    })
})
