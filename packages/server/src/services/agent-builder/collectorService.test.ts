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

        it('trích xuất loại Agent knowledge và kho tài liệu dataSources từ tiếng Việt (PH4-T04 / B-017)', () => {
            const text1 = 'Tạo bot tra cứu quy chế nội bộ công ty để giải đáp cho nhân viên'
            const res1 = collector.extractPatch(text1)

            expect(res1.patch.kind).toBe('knowledge')
            expect(res1.patch.dataSources).toBeDefined()
            expect(res1.patch.dataSources?.[0].id).toBe('fixture-docstore-company-policy')
            expect(res1.patch.dataSources?.[0].name).toContain('Quy chế làm việc nội bộ')
            expect(res1.extractedFields).toContain('dataSources')
            expect(res1.extractedFields).toContain('kind')

            const text2 = 'Kho tài liệu: Sổ tay nhân viên năm 2026'
            const res2 = collector.extractPatch(text2)
            expect(res2.patch.dataSources?.[0].name).toBe('Sổ tay nhân viên năm 2026')
            expect(res2.patch.kind).toBe('knowledge')
        })

        it('trích xuất loại Agent api-readonly và apiConnectors từ tiếng Việt (PH6-T02)', () => {
            const text = 'Tôi muốn làm bot gọi API thời tiết để xem nhiệt độ Hà Nội'
            const res = collector.extractPatch(text)

            expect(res.patch.kind).toBe('api-readonly')
            expect(res.patch.apiConnectors).toBeDefined()
            expect(res.patch.apiConnectors?.[0].connectorId).toBe('conn-weather-v1')
            expect(res.extractedFields).toContain('apiConnectors')
            expect(res.extractedFields).toContain('kind')
        })

        it('trích xuất loại Agent sql-readonly và sqlConfig từ tiếng Việt (PH6-T06)', () => {
            const text = 'Tôi cần một trợ lý truy vấn SQL phân tích dữ liệu bảng orders và bảng customers giới hạn 25 dòng'
            const res = collector.extractPatch(text)

            expect(res.patch.kind).toBe('sql-readonly')
            expect(res.patch.sqlConfig).toBeDefined()
            expect(res.patch.sqlConfig?.allowedTables).toContain('orders')
            expect(res.patch.sqlConfig?.allowedTables).toContain('customers')
            expect(res.patch.sqlConfig?.rowLimit).toBe(25)
            expect(res.extractedFields).toContain('sqlConfig')
            expect(res.extractedFields).toContain('kind')
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

            // Khi thiếu dataSources cho Knowledge Agent
            const responseNoDoc = collector.generateCollectorResponse(
                ['dataSources'],
                { kind: 'knowledge', name: 'Bot Quy Chế', goal: 'Tra cứu quy chế' },
                ['kind']
            )
            expect(responseNoDoc).toContain('kho tài liệu')
            expect(responseNoDoc).toContain('Quy chế làm việc nội bộ')
        })

        it('thông báo sẵn sàng (buildReady) và nhắc người dùng nhắn "xong" để kích hoạt build', () => {
            const fullSpec: Partial<AgentSpec> = {
                name: 'Bot Tư Vấn',
                goal: 'Tư vấn dịch vụ',
                instructions: 'Lịch sự, ngắn gọn'
            }

            const waitingResponse = collector.generateCollectorResponse([], fullSpec, ['instructions'])
            expect(waitingResponse).toContain('buildReady')
            expect(waitingResponse).toContain('"xong"')

            const builtResponse = collector.generateCollectorResponse([], fullSpec, [], { success: true })
            expect(builtResponse).toContain('Đã nhận xác nhận **"xong"** và tạo thành công Agentflow V2')
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

    describe('Explicit "xong" build confirmation detection', () => {
        const { isPureBuildConfirmation, isBuildConfirmationMessage } = require('./collectorService')

        it('nhận diện chính xác các câu xác nhận "xong" thuần túy và câu chốt cuối dòng', () => {
            expect(isPureBuildConfirmation('xong')).toBe(true)
            expect(isPureBuildConfirmation('Xong!')).toBe(true)
            expect(isPureBuildConfirmation('ok xong rồi')).toBe(true)
            expect(isPureBuildConfirmation('hết yêu cầu rồi')).toBe(true)
            expect(isPureBuildConfirmation('tạo agent đi')).toBe(true)
            expect(isBuildConfirmationMessage('Đặt tên là Trợ lý DeskFlow, trả lời ngắn gọn. Xong')).toBe(true)
        })

        it('không nhận nhầm câu mô tả nghiệp vụ bình thường có chữ "xong" ở giữa câu', () => {
            expect(isPureBuildConfirmation('Tạo trợ lý hướng dẫn nhân viên khi làm xong thủ tục')).toBe(false)
            expect(isBuildConfirmationMessage('Tạo trợ lý hướng dẫn nhân viên khi làm xong thủ tục')).toBe(false)
            expect(isBuildConfirmationMessage('Tôi cần thêm quy tắc trả lời lịch sự bằng tiếng Việt')).toBe(false)
        })
    })
})
