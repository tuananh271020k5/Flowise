import { validateAssertions, formatTestMessage, extractPredictionText, extractSourceDocuments } from './testChatHelper'

describe('testChatHelper (PH3-T01 & PH3-T02)', () => {
    describe('validateAssertions', () => {
        it('trả về passed: true khi câu trả lời chứa đầy đủ các assertion keywords', () => {
            const reply = 'Chào bạn! Để hoàn tất quy trình hội nhập, bước 1 là nộp hồ sơ, bước 2 là nhận thẻ nhân viên.'
            const assertions = ['Chào bạn', 'bước 1', 'thẻ nhân viên']

            const result = validateAssertions(reply, assertions)

            expect(result.total).toBe(3)
            expect(result.passedCount).toBe(3)
            expect(result.passed).toBe(true)
            expect(result.matchedAssertions).toEqual(assertions)
        })

        it('trả về passed: false khi câu trả lời thiếu một trong các assertion keywords', () => {
            const reply = 'Chào bạn! Hãy liên hệ phòng nhân sự nhé.'
            const assertions = ['Chào bạn', 'thẻ nhân viên']

            const result = validateAssertions(reply, assertions)

            expect(result.total).toBe(2)
            expect(result.passedCount).toBe(1)
            expect(result.passed).toBe(false)
            expect(result.matchedAssertions).toEqual(['Chào bạn'])
        })

        it('không phân biệt chữ hoa, chữ thường khi so khớp assertion', () => {
            const reply = 'HỆ THỐNG ĐÃ KÍCH HOẠT THÀNH CÔNG'
            const assertions = ['hệ thống', 'kích hoạt']

            const result = validateAssertions(reply, assertions)
            expect(result.passed).toBe(true)
        })

        it('xử lý an toàn khi đầu vào rỗng hoặc không đúng định dạng', () => {
            expect(validateAssertions('', ['abc'])).toEqual({
                total: 0,
                passedCount: 0,
                passed: false,
                matchedAssertions: []
            })
            expect(validateAssertions('Reply text', [])).toEqual({
                total: 0,
                passedCount: 0,
                passed: false,
                matchedAssertions: []
            })
            expect(validateAssertions(null, null)).toEqual({
                total: 0,
                passedCount: 0,
                passed: false,
                matchedAssertions: []
            })
        })
    })

    describe('formatTestMessage', () => {
        it('chuẩn hóa tin nhắn test với đầy đủ id, role, content và timestamp', () => {
            const msg = formatTestMessage('user', 'Tôi muốn hỏi chính sách lương thưởng')

            expect(msg.role).toBe('user')
            expect(msg.content).toBe('Tôi muốn hỏi chính sách lương thưởng')
            expect(msg.id).toMatch(/^test_u_/)
            expect(msg.timestamp).toBeDefined()
        })

        it('cho phép đính kèm trường bổ sung như assertionResult', () => {
            const msg = formatTestMessage('assistant', 'Câu trả lời mẫu', {
                assertionResult: { passed: true }
            })

            expect(msg.role).toBe('assistant')
            expect(msg.assertionResult).toEqual({ passed: true })
        })
    })

    describe('extractPredictionText', () => {
        it('trích xuất chuỗi thô khi responseData là string', () => {
            expect(extractPredictionText('Xin chào')).toBe('Xin chào')
        })

        it('trích xuất từ thuộc tính text của object', () => {
            expect(extractPredictionText({ text: 'Nội dung phản hồi' })).toBe('Nội dung phản hồi')
        })

        it('trích xuất từ thuộc tính response hoặc message nếu không có text', () => {
            expect(extractPredictionText({ response: 'Phản hồi từ model' })).toBe('Phản hồi từ model')
            expect(extractPredictionText({ message: 'Thông báo lỗi' })).toBe('Thông báo lỗi')
        })

        it('xử lý an toàn khi responseData rỗng hoặc null', () => {
            expect(extractPredictionText(null)).toBe('')
            expect(extractPredictionText(undefined)).toBe('')
        })
    })

    describe('extractSourceDocuments (PH4-T06)', () => {
        it('trích xuất đúng danh sách sourceDocuments từ response object Flowise RAG', () => {
            const mockResponse = {
                text: 'Theo quy chế làm việc, nhân viên có 14 ngày phép năm.',
                sourceDocuments: [
                    {
                        pageContent: 'Chế độ nghỉ phép: 14 ngày phép năm cho nhân viên chính thức.',
                        metadata: {
                            title: 'Quy Chế Hoạt Động 2026',
                            source: 'file:///internal/hr/policy_2026.pdf',
                            chunkId: 'chunk_1'
                        }
                    }
                ]
            }

            const docs = extractSourceDocuments(mockResponse)
            expect(docs).toHaveLength(1)
            expect(docs[0].pageContent).toContain('14 ngày phép năm')
            expect(docs[0].title).toBe('Quy Chế Hoạt Động 2026')
            expect(docs[0].source).toBe('file:///internal/hr/policy_2026.pdf')
            expect(docs[0].chunkId).toBe('chunk_1')
        })

        it('trích xuất an toàn từ mảng string đơn giản', () => {
            const mockResponse = {
                text: 'Câu trả lời',
                sourceDocuments: ['Đoạn văn trích dẫn 1', 'Đoạn văn trích dẫn 2']
            }

            const docs = extractSourceDocuments(mockResponse)
            expect(docs).toHaveLength(2)
            expect(docs[0].pageContent).toBe('Đoạn văn trích dẫn 1')
            expect(docs[0].title).toBe('Nguồn #1')
        })

        it('trả về mảng rỗng khi không có sourceDocuments hoặc responseData rỗng', () => {
            expect(extractSourceDocuments(null)).toEqual([])
            expect(extractSourceDocuments({})).toEqual([])
            expect(extractSourceDocuments({ text: 'Chỉ có text' })).toEqual([])
            expect(extractSourceDocuments({ text: 'Có mảng rỗng', sourceDocuments: [] })).toEqual([])
        })
    })
})
