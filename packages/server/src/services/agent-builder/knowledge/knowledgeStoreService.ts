import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { DocumentStore } from '../../../database/entities/DocumentStore'
import { DocumentStoreFileChunk } from '../../../database/entities/DocumentStoreFileChunk'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AdapterError } from '../errors/builderErrors'
import { COMPANY_POLICY_FIXTURE } from './fixtures/companyPolicyFixture'

export interface DocumentStoreSummary {
    id: string
    name: string
    description: string
    status: string
    workspaceId: string
    chunkCount: number
    createdDate: Date
    updatedDate: Date
}

export interface StoreChunkItem {
    id: string
    docId: string
    storeId: string
    chunkNo: number
    pageContent: string
    metadata?: Record<string, any>
}

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

/**
 * Service quản lý và tích hợp nguồn tri thức từ Flowise Document Store (PH4-T02).
 * Đảm bảo phân quyền truy cập và cách ly dữ liệu chặt chẽ theo từng Workspace.
 */
export class KnowledgeStoreService {
    constructor(private customDataSource?: DataSource) {}

    private get ds(): DataSource {
        return getActiveDataSource(this.customDataSource)
    }

    private get storeRepo(): Repository<DocumentStore> {
        return this.ds.getRepository(DocumentStore)
    }

    private get chunkRepo(): Repository<DocumentStoreFileChunk> {
        return this.ds.getRepository(DocumentStoreFileChunk)
    }

    /**
     * Liệt kê các Document Stores thuộc về một workspace.
     */
    async listWorkspaceStores(workspaceId: string): Promise<DocumentStoreSummary[]> {
        if (!workspaceId) {
            throw new AdapterError('WORKSPACE_ID_REQUIRED', 'Workspace ID is required', StatusCodes.BAD_REQUEST)
        }

        const stores = await this.storeRepo.find({
            where: { workspaceId },
            order: { updatedDate: 'DESC' }
        })

        const summaries: DocumentStoreSummary[] = []
        for (const store of stores) {
            const chunks = await this.chunkRepo.find({ where: { storeId: store.id } })
            summaries.push({
                id: store.id,
                name: store.name,
                description: store.description || '',
                status: store.status,
                workspaceId: store.workspaceId,
                chunkCount: chunks.length,
                createdDate: store.createdDate,
                updatedDate: store.updatedDate
            })
        }

        return summaries
    }

    /**
     * Đọc thông tin chi tiết một Document Store và kiểm tra quyền cách ly Workspace (PH4-T01).
     */
    async getStoreById(storeId: string, workspaceId: string): Promise<DocumentStore> {
        if (!storeId) {
            throw new AdapterError('STORE_ID_REQUIRED', 'Store ID is required', StatusCodes.BAD_REQUEST)
        }
        if (!workspaceId) {
            throw new AdapterError('WORKSPACE_ID_REQUIRED', 'Workspace ID is required', StatusCodes.BAD_REQUEST)
        }

        const store = await this.storeRepo.findOneBy({ id: storeId })
        if (!store) {
            throw new AdapterError('DOCUMENT_STORE_NOT_FOUND', `Document Store ${storeId} không tồn tại`, StatusCodes.NOT_FOUND)
        }

        // Negative Auth: Chặn truy cập chéo workspace
        if (store.workspaceId !== workspaceId) {
            throw new AdapterError(
                'WORKSPACE_MISMATCH',
                `Từ chối quyền truy cập: Bạn không có quyền truy cập Document Store của workspace khác`,
                StatusCodes.FORBIDDEN
            )
        }

        return store
    }

    /**
     * Đọc danh sách chunks nội dung của Document Store để preview và đối soát (PH4-T02).
     */
    async getStoreChunks(
        storeId: string,
        workspaceId: string,
        options: { limit?: number; offset?: number } = {}
    ): Promise<StoreChunkItem[]> {
        // Đảm bảo quyền truy cập workspace hợp lệ trước khi lấy chunk
        await this.getStoreById(storeId, workspaceId)

        const limit = options.limit || 50
        const offset = options.offset || 0

        const chunks = await this.chunkRepo.find({
            where: { storeId },
            order: { chunkNo: 'ASC' },
            take: limit,
            skip: offset
        })

        return chunks.map((chunk) => {
            let parsedMeta = {}
            if (chunk.metadata) {
                try {
                    parsedMeta = typeof chunk.metadata === 'string' ? JSON.parse(chunk.metadata) : chunk.metadata
                } catch {
                    parsedMeta = { raw: chunk.metadata }
                }
            }

            return {
                id: chunk.id,
                docId: chunk.docId,
                storeId: chunk.storeId,
                chunkNo: chunk.chunkNo,
                pageContent: chunk.pageContent,
                metadata: parsedMeta
            }
        })
    }

    /**
     * Khởi tạo nhanh một Document Store mẫu từ fixture có bản quyền cho workspace (PH4-T01 / PH4-T02).
     */
    async seedSampleDocumentStore(workspaceId: string): Promise<DocumentStore> {
        if (!workspaceId) {
            throw new AdapterError('WORKSPACE_ID_REQUIRED', 'Workspace ID is required', StatusCodes.BAD_REQUEST)
        }

        const fixture = COMPANY_POLICY_FIXTURE

        // Kiểm tra xem store đã tồn tại trong workspace chưa
        const existingStore = await this.storeRepo.findOneBy({
            name: fixture.title,
            workspaceId
        })
        if (existingStore) {
            return existingStore
        }

        // Tạo DocumentStore mới
        const store = this.storeRepo.create({
            name: fixture.title,
            description: `Tài liệu tri thức mẫu: ${fixture.category} (${fixture.metadata.department})`,
            status: 'UPSERTED' as any,
            workspaceId,
            loaders: JSON.stringify([
                {
                    loaderId: fixture.id,
                    sourceUri: fixture.metadata.sourceUri,
                    totalChunks: fixture.chunks.length
                }
            ]),
            vectorStoreConfig: JSON.stringify({ type: 'inMemoryVectorStore' }),
            embeddingConfig: JSON.stringify({ provider: 'openai', model: 'text-embedding-3-small' })
        })
        const savedStore = await this.storeRepo.save(store)

        // Tạo các chunks tương ứng từ fixture
        let chunkIndex = 0
        for (const chunkText of fixture.chunks) {
            const chunkEntity = this.chunkRepo.create({
                docId: fixture.id,
                storeId: savedStore.id,
                chunkNo: chunkIndex++,
                pageContent: chunkText,
                metadata: JSON.stringify({
                    source: fixture.metadata.sourceUri,
                    title: fixture.title,
                    owner: fixture.metadata.owner,
                    accessLevel: fixture.metadata.accessLevel
                })
            })
            await this.chunkRepo.save(chunkEntity)
        }

        return savedStore
    }

    /**
     * Kiểm tra tính sẵn sàng để tích hợp vào Knowledge Agent (RAG Readiness Check).
     */
    async validateStoreReadyForRAG(
        storeId: string,
        workspaceId: string
    ): Promise<{ ready: boolean; reason?: string; chunkCount: number }> {
        try {
            const store = await this.getStoreById(storeId, workspaceId)
            const chunks = await this.chunkRepo.find({ where: { storeId: store.id } })

            if (chunks.length === 0) {
                return { ready: false, reason: 'Document Store chưa có dữ liệu đoạn văn bản (0 chunks)', chunkCount: 0 }
            }

            if (store.status !== ('UPSERTED' as any) && store.status !== ('READY' as any) && store.status !== ('STALE' as any)) {
                return {
                    ready: false,
                    reason: `Trạng thái Document Store chưa sẵn sàng (hiện tại: ${store.status})`,
                    chunkCount: chunks.length
                }
            }

            return { ready: true, chunkCount: chunks.length }
        } catch (error: any) {
            return { ready: false, reason: error.message || 'Lỗi kiểm tra tính khả dụng', chunkCount: 0 }
        }
    }
}

export default new KnowledgeStoreService()
