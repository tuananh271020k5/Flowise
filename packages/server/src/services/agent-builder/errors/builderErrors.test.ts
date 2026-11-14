import { StatusCodes } from 'http-status-codes'
import {
    sanitizeErrorMessage,
    BuilderError,
    GeneratorError,
    CompilerError,
    AdapterError,
    BuildPipelineError,
    isBuilderError
} from './builderErrors'

describe('Builder Error Contracts (PH2-T07)', () => {
    describe('sanitizeErrorMessage', () => {
        it('loại bỏ Bearer tokens', () => {
            const raw = 'Lỗi kết nối tới Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz'
            const sanitized = sanitizeErrorMessage(raw)
            expect(sanitized).not.toContain('eyJhbGciOi')
            expect(sanitized).toContain('[REDACTED]')
        })

        it('loại bỏ OpenAI api key sk-...', () => {
            const raw = 'Khởi tạo model thất bại với key sk-1234567890abcdef1234567890abcdef'
            const sanitized = sanitizeErrorMessage(raw)
            expect(sanitized).not.toContain('sk-1234567890abcdef')
            expect(sanitized).toContain('[REDACTED]')
        })

        it('loại bỏ password hoặc secret key trong thông báo', () => {
            const raw = 'Kết nối database thất bại với password: "secret_db_pass_123"'
            const sanitized = sanitizeErrorMessage(raw)
            expect(sanitized).not.toContain('secret_db_pass_123')
            expect(sanitized).toContain('[REDACTED]')
        })

        it('giữ nguyên chuỗi an toàn không chứa secret', () => {
            const safe = 'Đồ thị Agentflow thiếu Start node hợp lệ'
            expect(sanitizeErrorMessage(safe)).toBe(safe)
        })
    })

    describe('BuilderError & toPayload', () => {
        it('tạo BuilderError với đầy đủ code, message, statusCode và toPayload', () => {
            const err = new BuilderError(StatusCodes.BAD_REQUEST, 'TEST_ERROR', 'Thông báo lỗi người dùng', { field: 'goal' }, false)

            expect(err.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(err.code).toBe('TEST_ERROR')
            expect(err.message).toBe('Thông báo lỗi người dùng')
            expect(err.retryable).toBe(false)
            expect(err.details).toEqual({ field: 'goal' })

            const payload = err.toPayload()
            expect(payload).toEqual({
                code: 'TEST_ERROR',
                message: 'Thông báo lỗi người dùng',
                statusCode: StatusCodes.BAD_REQUEST,
                retryable: false,
                details: { field: 'goal' }
            })
        })

        it('tự động sanitize thông điệp khi khởi tạo BuilderError', () => {
            const err = new BuilderError(StatusCodes.UNAUTHORIZED, 'AUTH_FAIL', 'Token sk-abcdef1234567890abcdef123456 bị từ chối')
            expect(err.message).not.toContain('sk-abcdef1234567890abcdef123456')
            expect(err.message).toContain('[REDACTED]')
        })
    })

    describe('Subclass Errors', () => {
        it('GeneratorError gán statusCode mặc định 400', () => {
            const err = new GeneratorError('TEMPLATE_NOT_FOUND', 'Template không tồn tại')
            expect(err.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(err.code).toBe('TEMPLATE_NOT_FOUND')
            expect(isBuilderError(err)).toBe(true)
        })

        it('CompilerError phản ánh lỗi biên dịch tất định', () => {
            const err = new CompilerError('COMPILER_INVALID_PLAN', 'Plan thiếu capabilities')
            expect(err.code).toBe('COMPILER_INVALID_PLAN')
            expect(isBuilderError(err)).toBe(true)
        })

        it('AdapterError phản ánh lỗi lưu trữ và phân quyền workspace', () => {
            const err = new AdapterError('ADAPTER_WORKSPACE_MISMATCH', 'Từ chối truy cập workspace', StatusCodes.FORBIDDEN)
            expect(err.statusCode).toBe(StatusCodes.FORBIDDEN)
            expect(err.code).toBe('ADAPTER_WORKSPACE_MISMATCH')
            expect(isBuilderError(err)).toBe(true)
        })

        it('BuildPipelineError hỗ trợ cờ retryable', () => {
            const err = new BuildPipelineError('BUILD_TIMEOUT', 'Pipeline quá thời gian xử lý', StatusCodes.GATEWAY_TIMEOUT, null, true)
            expect(err.retryable).toBe(true)
            expect(err.statusCode).toBe(StatusCodes.GATEWAY_TIMEOUT)
            expect(isBuilderError(err)).toBe(true)
        })

        it('isBuilderError phân biệt chính xác với Error tiêu chuẩn', () => {
            expect(isBuilderError(new Error('Normal error'))).toBe(false)
            expect(isBuilderError(null)).toBe(false)
            expect(isBuilderError(undefined)).toBe(false)
            expect(isBuilderError({ code: 'TEST' })).toBe(false)
        })
    })
})
