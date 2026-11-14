jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { StatusCodes } from 'http-status-codes'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { EvaluationRunnerService } from './evaluationRunnerService'
import { EvaluationExample } from '../types'

function createMockRepository<T extends { id?: string }>() {
    const store = new Map<string, T>()
    let idCounter = 1

    return {
        create: jest.fn((dto: any) => ({
            id: `id-${idCounter++}`,
            createdDate: new Date(),
            updatedDate: new Date(),
            ...dto
        })),
        save: jest.fn(async (entity: any) => {
            if (!entity.id) {
                entity.id = `id-${idCounter++}`
            }
            store.set(entity.id, { ...entity })
            return { ...entity }
        }),
        findOneBy: jest.fn(async (query: any) => {
            for (const item of store.values()) {
                const match = Object.entries(query).every(([k, v]) => (item as any)[k] === v)
                if (match) return { ...item }
            }
            return null
        }),
        clear: () => store.clear()
    }
}

describe('EvaluationRunnerService (PH3-T03)', () => {
    let mockChatflowRepo: ReturnType<typeof createMockRepository<ChatFlow>>
    let mockDataSource: any
    let runner: EvaluationRunnerService

    beforeEach(() => {
        mockChatflowRepo = createMockRepository<ChatFlow>()
        mockDataSource = {
            getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === ChatFlow) return mockChatflowRepo
                throw new Error(`Unexpected entity ${entity?.name}`)
            })
        }
        runner = new EvaluationRunnerService(mockDataSource)
    })

    describe('checkAssertions', () => {
        it('trả về passed: true khi output chứa tất cả keywords', () => {
            const res = runner.checkAssertions('Chào bạn, giá sản phẩm là 500.000đ', ['Chào bạn', '500.000đ'])
            expect(res.passed).toBe(true)
            expect(res.matched).toHaveLength(2)
        })

        it('trả về passed: false khi output thiếu một keyword', () => {
            const res = runner.checkAssertions('Chào bạn, sản phẩm đang hết hàng', ['Chào bạn', '500.000đ'])
            expect(res.passed).toBe(false)
            expect(res.matched).toEqual(['Chào bạn'])
        })

        it('không phân biệt chữ hoa thường', () => {
            const res = runner.checkAssertions('CHÀO QUÝ KHÁCH', ['chào quý khách'])
            expect(res.passed).toBe(true)
        })

        it('xử lý an toàn khi output hoặc assertions rỗng', () => {
            expect(runner.checkAssertions('', ['a']).passed).toBe(false)
            expect(runner.checkAssertions('abc', []).passed).toBe(false)
        })
    })

    describe('runTestSuite & Controlled Budget', () => {
        const sampleExamples: EvaluationExample[] = [
            { input: 'Giá bao nhiêu?', assertions: ['giá'] },
            { input: 'Có bảo hành không?', assertions: ['bảo hành'] },
            { input: 'Giao hàng mất bao lâu?', assertions: ['giao hàng'] }
        ]

        it('chạy bộ kiểm thử thành công và trả về báo cáo kết quả chi tiết', async () => {
            const flow = await mockChatflowRepo.save({
                id: 'flow-test-1',
                name: 'Trợ lý Bán Hàng',
                workspaceId: 'ws-alpha',
                flowData: JSON.stringify({ nodes: [], edges: [] })
            })

            const mockPredict = jest.fn(async (input: string) => {
                if (input.includes('Giá')) return 'Giá của sản phẩm là 200k'
                if (input.includes('bảo hành')) return 'Sản phẩm được bảo hành 12 tháng'
                return 'Thời gian giao hàng là 2 ngày'
            })

            const report = await runner.runTestSuite({
                flowId: flow.id,
                workspaceId: 'ws-alpha',
                examples: sampleExamples,
                mockPredictFn: mockPredict
            })

            expect(report.flowId).toBe(flow.id)
            expect(report.totalCount).toBe(3)
            expect(report.passedCount).toBe(3)
            expect(report.failedCount).toBe(0)
            expect(report.allPassed).toBe(true)
            expect(report.results).toHaveLength(3)
            expect(report.results[0].passed).toBe(true)
            expect(mockPredict).toHaveBeenCalledTimes(3)
        })

        it('áp dụng maxExamples giới hạn số kịch bản chạy (Budget Protection)', async () => {
            const flow = await mockChatflowRepo.save({
                id: 'flow-test-budget',
                name: 'Trợ lý Giới Hạn',
                workspaceId: 'ws-alpha',
                flowData: '{}'
            })

            const mockPredict = jest.fn(async () => 'giá bảo hành giao hàng')

            const report = await runner.runTestSuite({
                flowId: flow.id,
                workspaceId: 'ws-alpha',
                examples: sampleExamples,
                maxExamples: 2, // Giới hạn chỉ chạy 2 ví dụ
                mockPredictFn: mockPredict
            })

            expect(report.totalCount).toBe(2)
            expect(mockPredict).toHaveBeenCalledTimes(2)
        })

        it('từ chối khi sai workspaceId (Negative Auth: 403 Forbidden)', async () => {
            const flow = await mockChatflowRepo.save({
                id: 'flow-test-auth',
                name: 'Trợ lý Auth',
                workspaceId: 'ws-owner',
                flowData: '{}'
            })

            await expect(
                runner.runTestSuite({
                    flowId: flow.id,
                    workspaceId: 'ws-intruder',
                    examples: sampleExamples
                })
            ).rejects.toMatchObject({
                statusCode: StatusCodes.FORBIDDEN
            })
        })

        it('từ chối khi không tìm thấy flow (404)', async () => {
            await expect(
                runner.runTestSuite({
                    flowId: 'non-existing-flow',
                    workspaceId: 'ws-alpha',
                    examples: sampleExamples
                })
            ).rejects.toMatchObject({
                statusCode: StatusCodes.NOT_FOUND
            })
        })
    })
})
