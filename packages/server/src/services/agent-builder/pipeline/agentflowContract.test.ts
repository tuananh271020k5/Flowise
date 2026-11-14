jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { StatusCodes } from 'http-status-codes'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { AgentSpecRevision } from '../../../database/entities/AgentSpecRevision'
import { AgentDraftRevision } from '../../../database/entities/AgentDraftRevision'
import { BuildJob } from '../../../database/entities/BuildJob'
import { ChatFlow, EnumChatflowType } from '../../../database/entities/ChatFlow'
import { AgentSpec } from '../types'
import { computeReadiness } from '../readiness'
import { createAgentPlan, validateAgentPlan } from '../generator/agentPlan'
import compiler from '../generator/compiler'
import { validateFlowGraph } from '../generator/flowValidator'
import { FlowiseDraftAdapter } from '../adapter/flowiseDraftAdapter'
import { BuildPipelineService } from './buildPipelineService'
import { ALLOWED_AGENTFLOW_NODES } from '../generator/nodeRegistry'

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
            if (opts?.order) {
                const [orderKey, orderDir] = Object.entries(opts.order)[0] as [string, string]
                items.sort((a, b) => {
                    const valA = (a as any)[orderKey]
                    const valB = (b as any)[orderKey]
                    return orderDir === 'ASC' ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1
                })
            }
            if (opts?.take) {
                items = items.slice(0, opts.take)
            }
            return items.map((i) => ({ ...i }))
        }),
        clear: () => store.clear()
    }
}

describe('Flowise Agentflow V2 Runtime Contract Test (PH2-T10 / Gate Phase 2)', () => {
    let mockSessionRepo: ReturnType<typeof createMockRepository<BuilderSession>>
    let mockRevisionRepo: ReturnType<typeof createMockRepository<AgentSpecRevision>>
    let mockDraftRevisionRepo: ReturnType<typeof createMockRepository<AgentDraftRevision>>
    let mockJobRepo: ReturnType<typeof createMockRepository<BuildJob>>
    let mockChatflowRepo: ReturnType<typeof createMockRepository<ChatFlow>>
    let mockDataSource: any
    let pipelineService: BuildPipelineService
    let draftAdapter: FlowiseDraftAdapter

    const onboardingSpec: AgentSpec = {
        schemaVersion: '1.0',
        kind: 'assistant',
        name: 'Trợ Lý Hướng Dẫn Nhân Viên Mới',
        goal: 'Hỗ trợ giải đáp quy trình hội nhập cho nhân sự mới',
        language: 'vi',
        instructions: 'Chào đón niềm nở, giải thích các bước theo thứ tự, luôn kiên nhẫn.',
        outputExpectations: ['Gạch đầu dòng rõ ràng, súc tích'],
        modelProfileRef: 'chatOpenAI',
        dataSources: [],
        tools: [{ id: 'calc_tool', name: 'Calculator', type: 'calculator' }],
        policy: { visibility: 'private', executionMode: 'controlled-test', allowWrite: false },
        evaluationExamples: [{ input: 'Tôi bắt đầu nhận việc từ đâu?', assertions: ['Chào bạn', 'bước'] }]
    }

    beforeEach(() => {
        mockSessionRepo = createMockRepository<BuilderSession>()
        mockRevisionRepo = createMockRepository<AgentSpecRevision>()
        mockDraftRevisionRepo = createMockRepository<AgentDraftRevision>()
        mockJobRepo = createMockRepository<BuildJob>()
        mockChatflowRepo = createMockRepository<ChatFlow>()

        mockDataSource = {
            getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === BuilderSession) return mockSessionRepo
                if (entity === AgentSpecRevision) return mockRevisionRepo
                if (entity === AgentDraftRevision) return mockDraftRevisionRepo
                if (entity === BuildJob) return mockJobRepo
                if (entity === ChatFlow) return mockChatflowRepo
                throw new Error(`Unexpected entity ${entity?.name}`)
            })
        }

        pipelineService = new BuildPipelineService(mockDataSource)
        draftAdapter = new FlowiseDraftAdapter(mockDataSource)
    })

    describe('Toàn bộ Chu trình Biên dịch & Runtime Canvas Compatibility', () => {
        it('biến đổi từ Vietnamese Spec sang Flowise Agentflow V2 đạt 100% tiêu chí runtime', async () => {
            // 1. Kiểm tra tính sẵn sàng (Readiness)
            const readiness = computeReadiness(onboardingSpec)
            expect(readiness.specReady).toBe(true)
            expect(readiness.buildReady).toBe(true)
            expect(readiness.missingFields).toHaveLength(0)

            // 2. Lập AgentPlan
            const plan = createAgentPlan(onboardingSpec, 'contract-rev-1')
            const planVal = validateAgentPlan(plan)
            expect(planVal.valid).toBe(true)
            expect(plan.capabilityBindings.filter((c) => c.type === 'tool')).toHaveLength(1)

            // 3. Biên dịch tất định sang Graph
            const compiledGraph = compiler.compile(plan)
            expect(compiledGraph.nodes.length).toBeGreaterThanOrEqual(3) // Start + Agent + Tool (+ Model node)
            expect(compiledGraph.edges.length).toBeGreaterThanOrEqual(1)

            // 4. Server Flow Validation
            const flowVal = validateFlowGraph(compiledGraph)
            expect(flowVal.valid).toBe(true)

            // 5. Thẩm định cấu trúc Canvas của Flowise V2:
            // a) Start Node
            const startNode = compiledGraph.nodes.find((n) => n.data.name === 'startAgentflow')
            expect(startNode).toBeDefined()
            expect(startNode!.data.version).toBe(ALLOWED_AGENTFLOW_NODES['startAgentflow'].recommendedVersion)
            expect(startNode!.data.type).toBe('Start')
            expect(startNode!.data.outputAnchors).toBeDefined()

            // b) Agent Node
            const agentNode = compiledGraph.nodes.find((n) => n.data.name === 'agentAgentflow')
            expect(agentNode).toBeDefined()
            expect(agentNode!.data.version).toBe(ALLOWED_AGENTFLOW_NODES['agentAgentflow'].recommendedVersion)
            expect(agentNode!.data.type).toBe('Agent')
            const messages = agentNode!.data.inputs.agentMessages as Array<{ role: string; content: string }>
            expect(messages).toBeDefined()
            expect(messages[0].content).toContain('Chào đón niềm nở')

            // c) Cạnh nối Start -> Agent
            const startToAgentEdge = compiledGraph.edges.find((e) => e.source === startNode!.id && e.target === agentNode!.id)
            expect(startToAgentEdge).toBeDefined()
            expect(startToAgentEdge!.sourceHandle).toBeDefined()
            expect(startToAgentEdge!.targetHandle).toBeDefined()

            // 6. Lưu trữ qua CRUD Adapter
            const chatflow = await draftAdapter.createDraft('ws-contract', compiledGraph)
            expect(chatflow.id).toBeDefined()
            expect(chatflow.type).toBe(EnumChatflowType.AGENTFLOW)

            // Thẩm định JSON parse một lần duy nhất
            const snapshot = await draftAdapter.getDraftById(chatflow.id, 'ws-contract')
            expect(snapshot.parsedFlowData.nodes).toHaveLength(compiledGraph.nodes.length)
            expect(snapshot.parsedFlowData.edges).toHaveLength(compiledGraph.edges.length)
        })
    })

    describe('Negative Auth & Security Invariants', () => {
        it('bảo đảm an toàn cho bản draft: deployed=false, isPublic=false, chặn gọi chéo workspace', async () => {
            const plan = createAgentPlan(onboardingSpec, 'contract-rev-sec')
            const compiled = compiler.compile(plan)
            const draft = await draftAdapter.createDraft('ws-secure-alpha', compiled)

            // Policy an toàn cho draft
            expect(draft.deployed).toBe(false)
            expect(draft.isPublic).toBe(false)
            expect(draft.workspaceId).toBe('ws-secure-alpha')

            // Chặn đọc từ workspace khác (Negative Auth)
            await expect(draftAdapter.getDraftById(draft.id, 'ws-secure-beta')).rejects.toMatchObject({
                statusCode: StatusCodes.FORBIDDEN
            })

            // Chặn cập nhật từ workspace khác
            await expect(draftAdapter.updateDraft(draft.id, 'ws-secure-beta', compiled)).rejects.toMatchObject({
                statusCode: StatusCodes.FORBIDDEN
            })
        })
    })

    describe('End-to-End Build Pipeline Idempotency & Lifecycle Contract', () => {
        it('chạy pipeline hoàn chỉnh 3 lần giữ nguyên 1 flowId duy nhất, quản lý đúng job lifecycle', async () => {
            const session = await mockSessionRepo.save({
                id: 'sess-contract-e2e',
                workspaceId: 'ws-e2e',
                organizationId: 'org-e2e',
                userId: 'user-e2e',
                title: 'Phiên E2E',
                state: 'collecting',
                currentRevisionNo: 1
            })

            const revision = await mockRevisionRepo.save({
                id: 'rev-e2e-1',
                sessionId: session.id,
                revisionNo: 1,
                spec: JSON.stringify(onboardingSpec),
                assumptions: '[]',
                missingFields: '[]',
                reasonCodes: '[]',
                specReady: true,
                buildReady: true,
                testReady: true
            })

            // Lần chạy 1
            const res1 = await pipelineService.executeBuild({
                sessionId: session.id,
                workspaceId: 'ws-e2e',
                specRevisionId: revision.id
            })
            expect(res1.isExisting).toBe(false)
            expect(res1.flowId).toBeDefined()

            // Lần chạy 2 (cùng key)
            const res2 = await pipelineService.executeBuild({
                sessionId: session.id,
                workspaceId: 'ws-e2e',
                specRevisionId: revision.id
            })
            expect(res2.isExisting).toBe(true)
            expect(res2.flowId).toBe(res1.flowId)

            // Lần chạy 3 (cùng key)
            const res3 = await pipelineService.executeBuild({
                sessionId: session.id,
                workspaceId: 'ws-e2e',
                specRevisionId: revision.id
            })
            expect(res3.isExisting).toBe(true)
            expect(res3.flowId).toBe(res1.flowId)

            // Kiểm tra số lượng ChatFlow trong database là đúng 1 record
            const totalFlows = await mockChatflowRepo.find()
            expect(totalFlows).toHaveLength(1)

            // Kiểm tra build job đã hoàn thành
            const jobs = await mockJobRepo.find({ where: { sessionId: session.id } })
            expect(jobs).toHaveLength(1)
            expect(jobs[0].state).toBe('completed')
            expect(jobs[0].flowId).toBe(res1.flowId)
        })
    })
})
