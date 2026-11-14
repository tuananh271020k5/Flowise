import { CollectorService, MockBuildDispatcher } from './collectorService'
import { AgentSpec } from './types'
import { Response } from 'express'

describe('CollectorService (PH1-T09 & PH1-T10 / B-006)', () => {
    let collector: CollectorService
    let mockDispatcher: MockBuildDispatcher

    beforeEach(() => {
        mockDispatcher = new MockBuildDispatcher()
        collector = new CollectorService(mockDispatcher)
    })

    describe('Structured Spec Patch Extraction (PH1-T09)', () => {
        it('trích xuất tên trợ lý tiếng Việt từ các mẫu câu đàm thoại', () => {
            const inputs = ['Tôi muốn đặt tên là Trợ Lý CSKH', 'Tên trợ lý là Bot Hỗ Trợ 24/7.', 'Tên: AI Chuyên Viên Tư Vấn']

            const res1 = collector.extractPatch(inputs[0])
            expect(res1.patch.name).toBe('Trợ Lý CSKH')
            expect(res1.extractedFields).toContain('name')

            const res2 = collector.extractPatch(inputs[1])
            expect(res2.patch.name).toBe('Bot Hỗ Trợ 24/7')

            const res3 = collector.extractPatch(inputs[2])
            expect(res3.patch.name).toBe('AI Chuyên Viên Tư Vấn')
        })

        it('trích xuất mục tiêu hoạt động (goal)', () => {
            const text = 'Mục tiêu chính là hỗ trợ khách hàng giải đáp thắc mắc về sản phẩm và chính sách bảo hành'
            const res = collector.extractPatch(text)

            expect(res.patch.goal).toContain('hỗ trợ khách hàng giải đáp thắc mắc')
            expect(res.extractedFields).toContain('goal')
        })

        it('trích xuất hướng dẫn vận hành / system prompt (instructions)', () => {
            const text = 'Hướng dẫn: Luôn trả lời bằng tiếng Việt lịch sự, ngắn gọn và có gạch đầu dòng rõ ràng.'
            const res = collector.extractPatch(text)

            expect(res.patch.instructions).toContain('Luôn trả lời bằng tiếng Việt lịch sự')
            expect(res.extractedFields).toContain('instructions')
        })

        it('trích xuất công cụ từ nội dung yêu cầu (tools)', () => {
            const text = 'Trợ lý cần có công cụ tìm kiếm web và máy tính để tính hóa đơn cho khách'
            const res = collector.extractPatch(text)

            expect(res.patch.tools).toBeDefined()
            expect(res.patch.tools?.map((t) => t.type)).toContain('webSearch')
            expect(res.patch.tools?.map((t) => t.type)).toContain('calculator')
            expect(res.extractedFields).toContain('tools')
        })

        it('trích xuất kịch bản câu hỏi kiểm thử (evaluationExamples)', () => {
            const text = 'Ví dụ câu hỏi: Cho tôi biết giá của ốp lưng iPhone 15 Pro Max là bao nhiêu?'
            const res = collector.extractPatch(text)

            expect(res.patch.evaluationExamples).toBeDefined()
            expect(res.patch.evaluationExamples?.[0].input).toContain('ốp lưng iPhone 15 Pro Max')
            expect(res.extractedFields).toContain('evaluationExamples')
        })

        it('không ghi đè dữ liệu đã có nếu người dùng không cập nhật trường đó', () => {
            const existingSpec: Partial<AgentSpec> = {
                name: 'Bot Bán Hàng',
                goal: 'Tư vấn sản phẩm'
            }

            // Người dùng chỉ bổ sung hướng dẫn
            const text = 'Hướng dẫn: Không được cam kết giảm giá vượt quá 10%'
            const res = collector.extractPatch(text, existingSpec)

            expect(res.patch.name).toBeUndefined()
            expect(res.patch.goal).toBeUndefined()
            expect(res.patch.instructions).toContain('Không được cam kết giảm giá')
        })
    })

    describe('Anti-reask & Guided Collector Response (PH1-T09)', () => {
        it('hỏi thông tin còn thiếu ưu tiên nhất và không hỏi lại thông tin đã có', () => {
            // Khi chưa có tên
            const responseNoName = collector.generateCollectorResponse(['name', 'instructions'], { goal: 'Hỗ trợ kỹ thuật' }, ['goal'])
            expect(responseNoName).toContain('Tên trợ lý')

            // Khi đã có tên, hỏi tiếp sang instructions
            const responseWithName = collector.generateCollectorResponse(
                ['instructions'],
                { name: 'Bot Kỹ Thuật', goal: 'Hỗ trợ kỹ thuật' },
                ['name']
            )
            expect(responseWithName).toContain('hướng dẫn hoặc phong cách trả lời')
            expect(responseWithName).not.toContain('Bạn muốn đặt tên cho Trợ lý')
        })

        it('thông báo sẵn sàng và kích hoạt build khi không còn trường thiếu (buildReady)', () => {
            const fullSpec: Partial<AgentSpec> = {
                name: 'Bot Tư Vấn',
                goal: 'Tư vấn dịch vụ',
                instructions: 'Lịch sự, ngắn gọn'
            }

            const response = collector.generateCollectorResponse([], fullSpec, ['instructions'])
            expect(response).toContain('buildReady')
            expect(response).toContain('tự động kích hoạt lệnh phát sinh Agentflow V2')
        })
    })

    describe('Auto-dispatch Build Intent & Mock Dispatcher (PH1-T10)', () => {
        it('tạo và dispatch buildIntent thành công khi spec đạt buildReady', async () => {
            const sampleSpec: AgentSpec = {
                schemaVersion: '1.0',
                kind: 'assistant',
                name: 'Bot CSKH Chuyên Nghiệp',
                goal: 'Chăm sóc khách hàng tự động',
                language: 'vi',
                instructions: 'Chào khách lịch sự, giải quyết thắc mắc theo tài liệu',
                outputExpectations: ['Ngắn gọn', 'Lịch sự'],
                modelProfileRef: 'default-builder-model',
                dataSources: [],
                tools: [{ id: 't1', name: 'Web Search', type: 'webSearch' }],
                policy: { visibility: 'private', executionMode: 'controlled-test', allowWrite: false },
                evaluationExamples: [{ input: 'Giá sản phẩm là bao nhiêu?', assertions: ['Trả lời chính xác'] }]
            }

            const intent = await collector.dispatchBuildIntent('sess-100', 3, sampleSpec)

            expect(intent).toBeDefined()
            expect(intent.sessionId).toBe('sess-100')
            expect(intent.revisionNo).toBe(3)
            expect(intent.status).toBe('dispatched')
            expect(intent.spec.name).toBe('Bot CSKH Chuyên Nghiệp')

            // Kiểm tra mock dispatcher đã nhận intent
            expect(mockDispatcher.dispatchedIntents).toHaveLength(1)
            expect(mockDispatcher.dispatchedIntents[0].id).toBe(intent.id)
        })
    })

    describe('Server-Sent Events (SSE) (PH1-T10)', () => {
        it('quản lý client SSE kết nối, nhận tin nhắn và ngắt kết nối an toàn', () => {
            const mockRes = {
                write: jest.fn(),
                on: jest.fn()
            } as unknown as Response

            collector.addSSEClient('sess-sse', mockRes)
            expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('event: connected'))

            // Broadcast sự kiện
            collector.broadcastSSE('sess-sse', {
                type: 'revision',
                data: { revisionNo: 2 },
                timestamp: new Date().toISOString()
            })

            expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('event: revision'))
            expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"revisionNo":2'))

            // Hủy kết nối
            collector.removeSSEClient('sess-sse', mockRes)

            // Broadcast sau khi hủy không gửi tiếp cho client đó
            jest.clearAllMocks()
            collector.broadcastSSE('sess-sse', {
                type: 'message',
                data: { content: 'test' },
                timestamp: new Date().toISOString()
            })
            expect(mockRes.write).not.toHaveBeenCalled()
        })
    })
})
