jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { DocumentStore } from '../../../database/entities/DocumentStore'
import { DocumentStoreFileChunk } from '../../../database/entities/DocumentStoreFileChunk'
import { KnowledgeStoreService } from './knowledgeStoreService'
import { COMPANY_POLICY_FIXTURE } from './fixtures/companyPolicyFixture'

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
            if (opts?.skip) {
                items = items.slice(opts.skip)
            }
            if (opts?.take) {
                items = items.slice(0, opts.take)
            }
            return items.map((i) => ({ ...i }))
        }),
        clear: () => store.clear()
    }
}

describe('KnowledgeStoreService (PH4-T01 & PH4-T02)', () => {
    let storeRepo: ReturnType<typeof createMockRepository<DocumentStore>>
    let chunkRepo: ReturnType<typeof createMockRepository<DocumentStoreFileChunk>>
    let mockDataSource: any
    let service: KnowledgeStoreService

    const wsAlpha = 'ws-alpha-workspace'
    const wsBeta = 'ws-beta-workspace'

    beforeEach(() => {
        storeRepo = createMockRepository<DocumentStore>()
        chunkRepo = createMockRepository<DocumentStoreFileChunk>()

        mockDataSource = {
            getRepository: jest.fn((entity: any) => {
                if (entity === DocumentStore) return storeRepo
                if (entity === DocumentStoreFileChunk) return chunkRepo
                throw new Error(`Unknown entity in test: ${entity}`)
            })
        }

        service = new KnowledgeStoreService(mockDataSource)
    })

    describe('PH4-T01: Bộ tài liệu thử và Phân quyền Workspace', () => {
        it('bộ tài liệu mẫu có đầy đủ metadata và golden QA pairs', () => {
            expect(COMPANY_POLICY_FIXTURE.id).toBeDefined()
            expect(COMPANY_POLICY_FIXTURE.title).toContain('Quy Chế Hoạt Động')
            expect(COMPANY_POLICY_FIXTURE.metadata.accessLevel).toBe('internal')
            expect(COMPANY_POLICY_FIXTURE.chunks.length).toBeGreaterThan(0)
            expect(COMPANY_POLICY_FIXTURE.goldenQAPairs.length).toBeGreaterThan(0)
        })

        it('chặn truy cập Document Store từ workspace khác (Negative Auth: 403 Forbidden)', async () => {
            const store = await storeRepo.save({
                id: 'store-alpha-1',
                name: 'Tài liệu mật Alpha',
                workspaceId: wsAlpha,
                status: 'UPSERTED' as any
            })

            // User từ wsBeta cố gắng truy cập store của wsAlpha
            await expect(service.getStoreById(store.id, wsBeta)).rejects.toThrow(
                'Từ chối quyền truy cập: Bạn không có quyền truy cập Document Store của workspace khác'
            )
        })

        it('từ chối khi Document Store không tồn tại (404)', async () => {
            await expect(service.getStoreById('non-existent-store', wsAlpha)).rejects.toThrow('không tồn tại')
        })
    })

    describe('PH4-T02: Ingestion & Document Store Integration', () => {
        it('seedSampleDocumentStore nạp tài liệu mẫu thành công với đầy đủ chunks', async () => {
            const seededStore = await service.seedSampleDocumentStore(wsAlpha)
            expect(seededStore).toBeDefined()
            expect(seededStore.workspaceId).toBe(wsAlpha)
            expect(seededStore.name).toBe(COMPANY_POLICY_FIXTURE.title)

            // Kiểm tra các chunks được sinh ra trong DB
            const chunks = await chunkRepo.find({ where: { storeId: seededStore.id } })
            expect(chunks.length).toBe(COMPANY_POLICY_FIXTURE.chunks.length)
            expect(chunks[0].pageContent).toContain('Thời gian làm việc tiêu chuẩn')
        })

        it('không tạo trùng lặp nếu đã seed store cùng tên trong workspace', async () => {
            const first = await service.seedSampleDocumentStore(wsAlpha)
            const second = await service.seedSampleDocumentStore(wsAlpha)
            expect(first.id).toBe(second.id)
        })

        it('listWorkspaceStores chỉ trả về stores thuộc workspace chỉ định', async () => {
            await storeRepo.save({ id: 's1', name: 'Store 1', workspaceId: wsAlpha, status: 'UPSERTED' as any })
            await storeRepo.save({ id: 's2', name: 'Store 2', workspaceId: wsAlpha, status: 'READY' as any })
            await storeRepo.save({ id: 's3', name: 'Store 3', workspaceId: wsBeta, status: 'UPSERTED' as any })

            const alphaStores = await service.listWorkspaceStores(wsAlpha)
            expect(alphaStores).toHaveLength(2)
            expect(alphaStores.every((s) => s.workspaceId === wsAlpha)).toBe(true)

            const betaStores = await service.listWorkspaceStores(wsBeta)
            expect(betaStores).toHaveLength(1)
            expect(betaStores[0].id).toBe('s3')
        })

        it('getStoreChunks lấy danh sách đoạn văn bản và metadata an toàn', async () => {
            const store = await service.seedSampleDocumentStore(wsAlpha)
            const chunks = await service.getStoreChunks(store.id, wsAlpha, { limit: 2 })

            expect(chunks).toHaveLength(2)
            expect(chunks[0].chunkNo).toBe(0)
            expect(chunks[0].metadata?.title).toBe(COMPANY_POLICY_FIXTURE.title)
        })

        it('validateStoreReadyForRAG đánh giá chính xác tính sẵn sàng của store', async () => {
            // Store chưa seed (0 chunks)
            const emptyStore = await storeRepo.save({
                id: 'empty-store',
                name: 'Store Rỗng',
                workspaceId: wsAlpha,
                status: 'UPSERTED' as any
            })
            const emptyCheck = await service.validateStoreReadyForRAG(emptyStore.id, wsAlpha)
            expect(emptyCheck.ready).toBe(false)
            expect(emptyCheck.reason).toContain('0 chunks')

            // Store đã seed có chunks
            const readyStore = await service.seedSampleDocumentStore(wsAlpha)
            const readyCheck = await service.validateStoreReadyForRAG(readyStore.id, wsAlpha)
            expect(readyCheck.ready).toBe(true)
            expect(readyCheck.chunkCount).toBe(COMPANY_POLICY_FIXTURE.chunks.length)
        })
    })
})
