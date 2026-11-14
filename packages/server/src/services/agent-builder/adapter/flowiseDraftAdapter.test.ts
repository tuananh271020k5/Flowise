jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { StatusCodes } from 'http-status-codes'
import { ChatFlow, EnumChatflowType } from '../../../database/entities/ChatFlow'
import { FlowiseDraftAdapter } from './flowiseDraftAdapter'
import compiler, { CompiledFlowGraph } from '../generator/compiler'
import { createAgentPlan } from '../generator/agentPlan'
import { AgentSpec } from '../types'

function createMockRepository<T extends { id?: string }>() {
    const store = new Map<string, T>()
    let idCounter = 1

    return {
        create: jest.fn((dto: any) => ({
            id: `flow-${idCounter++}`,
            createdDate: new Date(),
            updatedDate: new Date(),
            ...dto
        })),
        save: jest.fn(async (entity: any) => {
            if (!entity.id) {
                entity.id = `flow-${idCounter++}`
            }
            if (!entity.createdDate) {
                entity.createdDate = new Date()
            }
            entity.updatedDate = new Date()
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
        find: jest.fn(async (opts?: any) => {
            let items = Array.from(store.values())
            if (opts?.where) {
                items = items.filter((item) => Object.entries(opts.where).every(([k, v]) => (item as any)[k] === v))
            }
            return items.map((i) => ({ ...i }))
        }),
        clear: () => store.clear()
    }
}

describe('FlowiseDraftAdapter (PH2-T06)', () => {
    let mockChatflowRepo: ReturnType<typeof createMockRepository<ChatFlow>>
    let mockDataSource: any
    let adapter: FlowiseDraftAdapter
    let validGraph: CompiledFlowGraph

    const sampleSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ lý bán hàng mẫu',
        goal: 'Hỗ trợ tư vấn đơn hàng phụ kiện',
        language: 'vi',
        instructions: 'Chào khách niềm nở, giải đáp thắc mắc.',
        outputExpectations: ['Ngắn gọn, thân thiện'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [],
        tools: [{ id: 't1', name: 'Calculator', type: 'calculator' }],
        policy: { visibility: 'private', executionMode: 'controlled-test', allowWrite: false },
        evaluationExamples: [{ input: 'Giá bao nhiêu?', assertions: ['Giá là'] }]
    }

    beforeEach(() => {
        mockChatflowRepo = createMockRepository<ChatFlow>()
        mockDataSource = {
            getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === ChatFlow) return mockChatflowRepo
                throw new Error(`Unexpected entity ${entity?.name}`)
            })
        }
        adapter = new FlowiseDraftAdapter(mockDataSource)

        const plan = createAgentPlan(sampleSpec, 'rev-sample-1')
        validGraph = compiler.compile(plan)
    })

    describe('serializeFlowData', () => {
        it('serialize graph đúng 1 lần thành JSON string parse được', () => {
            const serialized = adapter.serializeFlowData(validGraph)
            expect(typeof serialized).toBe('string')
            const parsed = JSON.parse(serialized)
            expect(parsed.nodes.length).toBeGreaterThanOrEqual(3)
            expect(parsed.edges.length).toBeGreaterThanOrEqual(1)
            expect(parsed.viewport).toBeDefined()
        })

        it('cung cấp viewport mặc định nếu không truyền', () => {
            const graphWithoutViewport = {
                ...validGraph,
                viewport: undefined as any
            }
            const serialized = adapter.serializeFlowData(graphWithoutViewport)
            const parsed = JSON.parse(serialized)
            expect(parsed.viewport).toEqual({ x: 0, y: 0, zoom: 0.85 })
        })
    })

    describe('createDraft', () => {
        it('tạo draft thành công với policy an toàn deployed=false, isPublic=false, type=AGENTFLOW', async () => {
            const flow = await adapter.createDraft('ws-alpha', validGraph)

            expect(flow).toBeDefined()
            expect(flow.id).toBeDefined()
            expect(flow.type).toBe(EnumChatflowType.AGENTFLOW)
            expect(flow.deployed).toBe(false)
            expect(flow.isPublic).toBe(false)
            expect(flow.workspaceId).toBe('ws-alpha')
            expect(flow.name).toBe('Trợ lý bán hàng mẫu')
            expect(flow.category).toBe('Agent Flows')

            // Verify flowData là valid json
            const parsed = JSON.parse(flow.flowData)
            expect(parsed.nodes.length).toBeGreaterThanOrEqual(3)
            expect(parsed.edges.length).toBeGreaterThanOrEqual(1)
        })

        it('từ chối khi thiếu workspaceId', async () => {
            await expect(adapter.createDraft('', validGraph)).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST,
                message: 'Workspace ID is required'
            })
        })

        it('từ chối khi graph validation không đạt (thiếu start node)', async () => {
            const invalidGraph: CompiledFlowGraph = {
                ...validGraph,
                nodes: validGraph.nodes.filter((n) => n.data.type !== 'Start'),
                edges: []
            }

            await expect(adapter.createDraft('ws-alpha', invalidGraph)).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST
            })
        })
    })

    describe('updateDraft', () => {
        it('cập nhật draft thành công khi khớp workspaceId', async () => {
            const created = await adapter.createDraft('ws-alpha', validGraph)

            const updatedGraph: CompiledFlowGraph = {
                ...validGraph,
                flowConfig: {
                    ...validGraph.flowConfig,
                    name: 'Trợ lý đã đổi tên',
                    category: 'Support'
                }
            }

            const updated = await adapter.updateDraft(created.id, 'ws-alpha', updatedGraph)
            expect(updated.id).toBe(created.id)
            expect(updated.name).toBe('Trợ lý đã đổi tên')

            const reloaded = await adapter.getDraftById(created.id, 'ws-alpha')
            expect(reloaded.chatflow.name).toBe('Trợ lý đã đổi tên')
        })

        it('từ chối khi không tìm thấy draft (404)', async () => {
            await expect(adapter.updateDraft('non-existent', 'ws-alpha', validGraph)).rejects.toMatchObject({
                statusCode: StatusCodes.NOT_FOUND
            })
        })

        it('từ chối khi sai workspaceId (403 Forbidden)', async () => {
            const created = await adapter.createDraft('ws-alpha', validGraph)

            await expect(adapter.updateDraft(created.id, 'ws-beta', validGraph)).rejects.toMatchObject({
                statusCode: StatusCodes.FORBIDDEN,
                message: expect.stringContaining('Workspace mismatch')
            })
        })

        it('từ chối khi graph cập nhật không hợp lệ', async () => {
            const created = await adapter.createDraft('ws-alpha', validGraph)

            const badGraph: CompiledFlowGraph = {
                ...validGraph,
                nodes: [],
                edges: []
            }
            await expect(adapter.updateDraft(created.id, 'ws-alpha', badGraph)).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST
            })
        })
    })

    describe('getDraftById', () => {
        it('đọc draft thành công và parse flowData', async () => {
            const created = await adapter.createDraft('ws-alpha', validGraph)

            const snapshot = await adapter.getDraftById(created.id, 'ws-alpha')
            expect(snapshot.chatflow.id).toBe(created.id)
            expect(snapshot.parsedFlowData.nodes.length).toBeGreaterThanOrEqual(3)
            expect(snapshot.parsedFlowData.edges.length).toBeGreaterThanOrEqual(1)
        })

        it('từ chối khi sai workspaceId (403 Forbidden)', async () => {
            const created = await adapter.createDraft('ws-alpha', validGraph)

            await expect(adapter.getDraftById(created.id, 'ws-other')).rejects.toMatchObject({
                statusCode: StatusCodes.FORBIDDEN
            })
        })

        it('từ chối khi không tìm thấy draft (404)', async () => {
            await expect(adapter.getDraftById('unknown-id', 'ws-alpha')).rejects.toMatchObject({
                statusCode: StatusCodes.NOT_FOUND
            })
        })

        it('fallback an toàn khi flowData bị hỏng json', async () => {
            const created = await adapter.createDraft('ws-alpha', validGraph)
            // Cố tình ghi chuỗi hỏng vào store
            created.flowData = 'invalid-json{'
            await mockChatflowRepo.save(created)

            const snapshot = await adapter.getDraftById(created.id, 'ws-alpha')
            expect(snapshot.parsedFlowData).toEqual({
                nodes: [],
                edges: [],
                viewport: { x: 0, y: 0, zoom: 1 }
            })
        })
    })
})
