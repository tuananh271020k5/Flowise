import { createHash, randomUUID } from 'crypto'
import path from 'path'
import { DataSource } from 'typeorm'
import { DocumentStore } from '../../../database/entities/DocumentStore'
import { DocumentStoreFileChunk } from '../../../database/entities/DocumentStoreFileChunk'
import { DocumentStoreStatus } from '../../../Interface'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import modelSettingsService from '../modelSettingsService'
import { AdapterError } from '../errors/builderErrors'
import { DataSourceRef } from '../types'
import { BuilderSession } from '../../../database/entities/BuilderSession'

export const BUILDER_DOCUMENT_STORE = 'builderLocalDocumentsV1'
export const DOCUMENT_LIMITS = { fileBytes: 5 * 1024 * 1024, files: 5, characters: 200000, chunks: 200 }
export const SUPPORTED_DOCUMENTS = ['.txt', '.md', '.csv', '.pdf', '.docx']

export function splitDocument(text: string): string[] {
    const value = text
        .replace(/\r\n/g, '\n')
        .replace(/\u0000/g, '')
        .trim()
    const chunks: string[] = []
    for (let offset = 0; offset < value.length; offset += 1020) {
        const chunk = value.slice(offset, offset + 1200).trim()
        if (chunk) chunks.push(chunk)
        if (offset + 1200 >= value.length) break
    }
    return chunks
}

export class DocumentUploadService {
    constructor(private dataSource?: DataSource) {}
    private get ds() {
        return this.dataSource || getRunningExpressApp().AppDataSource
    }

    async ingest(
        sessionId: string,
        workspaceId: string,
        files: Express.Multer.File[],
        mode: string,
        embeddingModel: string
    ): Promise<DataSourceRef[]> {
        if (!workspaceId || !(await this.ds.getRepository(BuilderSession).findOneBy({ id: sessionId, workspaceId })))
            throw new AdapterError('SESSION_NOT_FOUND', 'Không có quyền tải tài liệu vào phiên này.', 404)
        if (!['lexical', 'vector'].includes(mode))
            throw new AdapterError('INVALID_RETRIEVAL_MODE', 'Chọn tìm theo từ khóa hoặc embedding.', 400)
        if (!files?.length || files.length > DOCUMENT_LIMITS.files)
            throw new AdapterError('INVALID_FILES', 'Chọn từ 1 đến 5 tài liệu.', 400)
        const existing = await this.ds.getRepository(DocumentStore).find({ where: { workspaceId } })
        const embedding = mode === 'vector' ? await modelSettingsService.getEmbeddingModel(workspaceId, embeddingModel) : undefined
        const pending: { store: DocumentStore; chunks: DocumentStoreFileChunk[] }[] = []
        const refs: DataSourceRef[] = []
        for (const file of files) {
            let originalname = file.originalname || 'document'
            // Multipart filenames are commonly decoded as Latin-1 by the parser.
            try {
                if (/^[\u0000-\u00ff]*$/.test(originalname))
                    originalname = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(originalname, 'latin1'))
            } catch {
                /* Already Unicode. */
            }
            const filename = path.win32
                .basename(path.posix.basename(originalname))
                .replace(/[\u0000-\u001f]/g, '')
                .slice(0, 180)
            const extension = path.extname(filename).toLowerCase()
            if (!SUPPORTED_DOCUMENTS.includes(extension) || !file.buffer?.length || file.buffer.length > DOCUMENT_LIMITS.fileBytes)
                throw new AdapterError('INVALID_FILE', 'Hỗ trợ TXT, MD, CSV, PDF, DOCX; mỗi file tối đa 5 MB và không rỗng.', 400)
            const hash = createHash('sha256')
                .update(file.buffer)
                .update(`${mode}:${embedding ? JSON.stringify(embedding.config) : ''}`)
                .digest('hex')
            const prior = [...existing, ...pending.map((item) => item.store)].find((store) => {
                try {
                    const config = JSON.parse(store.vectorStoreConfig || '{}')
                    return config.name === BUILDER_DOCUMENT_STORE && config.config?.sessionId === sessionId && config.config?.hash === hash
                } catch {
                    return false
                }
            })
            if (prior) {
                if (!refs.some((ref) => ref.id === prior.id)) refs.push(this.toRef(prior))
                continue
            }
            const inSession = existing.filter((store) => {
                try {
                    return JSON.parse(store.vectorStoreConfig || '{}').config?.sessionId === sessionId
                } catch {
                    return false
                }
            }).length
            if (inSession + pending.length >= 10)
                throw new AdapterError('DOCUMENT_LIMIT', 'Mỗi phiên tối đa 10 tài liệu. Hãy tạo phiên mới cho bộ tài liệu khác.', 400)
            const pages = await this.readPages(file, extension)
            if (pages.reduce((total, page) => total + page.text.length, 0) > DOCUMENT_LIMITS.characters)
                throw new AdapterError('DOCUMENT_TOO_LARGE', 'Nội dung một tài liệu tối đa 200.000 ký tự. Hãy tách tài liệu nhỏ hơn.', 400)
            const chunks = pages.flatMap((page) => splitDocument(page.text).map((text) => ({ text, page: page.page })))
            if (!chunks.length)
                throw new AdapterError('EMPTY_DOCUMENT', 'Không đọc được văn bản trong tài liệu. PDF ảnh quét cần OCR trước khi tải.', 400)
            if (chunks.length > DOCUMENT_LIMITS.chunks) throw new AdapterError('TOO_MANY_CHUNKS', 'Tài liệu vượt giới hạn 200 đoạn.', 400)
            let embeddingConfig: string | null = null
            let vectors: number[][] | undefined
            if (mode === 'vector') {
                try {
                    vectors = await embedding!.instance.embedDocuments(chunks.map((chunk) => chunk.text))
                } catch {
                    throw new AdapterError(
                        'EMBEDDING_FAILED',
                        'Không tạo được embedding. Kiểm tra model embedding và key/Base URL trong Cấu hình model; hoặc chọn tìm theo từ khóa.',
                        502
                    )
                }
                const dimensions = vectors?.[0]?.length
                if (
                    !dimensions ||
                    dimensions > 8192 ||
                    vectors?.length !== chunks.length ||
                    vectors.some((vector) => vector.length !== dimensions || vector.some((value) => !Number.isFinite(value)))
                )
                    throw new AdapterError('INVALID_EMBEDDINGS', 'Provider trả embedding không hợp lệ.', 502)
                embeddingConfig = JSON.stringify({ name: 'openAIEmbeddings', config: embedding!.config })
            }
            const id = randomUUID()
            const docId = randomUUID()
            const store = this.ds.getRepository(DocumentStore).create({
                id,
                workspaceId,
                name: filename,
                description: `Tài liệu đính kèm trong Agent Builder (${mode === 'vector' ? 'embedding' : 'từ khóa'})`,
                status: DocumentStoreStatus.UPSERTED,
                loaders: '[]',
                whereUsed: '[]',
                embeddingConfig,
                vectorStoreConfig: JSON.stringify({
                    name: BUILDER_DOCUMENT_STORE,
                    config: {
                        mode,
                        sessionId,
                        hash,
                        filename,
                        bytes: file.buffer.length,
                        chunkCount: chunks.length,
                        preview: chunks[0].text.slice(0, 600)
                    }
                })
            })
            pending.push({
                store,
                chunks: chunks.map((chunk, index) =>
                    this.ds.getRepository(DocumentStoreFileChunk).create({
                        id: randomUUID(),
                        docId,
                        storeId: id,
                        chunkNo: index + 1,
                        pageContent: chunk.text,
                        metadata: JSON.stringify({ filename, page: chunk.page, ...(vectors ? { vector: vectors[index] } : {}) })
                    })
                )
            })
            refs.push(this.toRef(store))
        }
        await this.ds.transaction(async (manager) => {
            for (const item of pending) {
                await manager.getRepository(DocumentStore).save(item.store)
                await manager.getRepository(DocumentStoreFileChunk).save(item.chunks)
            }
        })
        return refs
    }

    private toRef(store: DocumentStore): DataSourceRef {
        const config = JSON.parse(store.vectorStoreConfig || '{}').config || {}
        return {
            id: store.id,
            type: 'documentStore',
            name: store.name,
            config: { retrievalMode: config.mode, chunkCount: config.chunkCount, uploaded: true, preview: config.preview || '' }
        }
    }

    private async readPages(file: Express.Multer.File, extension: string): Promise<{ text: string; page?: number }[]> {
        if (['.txt', '.md', '.csv'].includes(extension)) {
            try {
                const text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer)
                if (text.includes('\u0000')) throw new Error('Binary data')
                return [{ text }]
            } catch {
                throw new AdapterError('INVALID_TEXT_ENCODING', 'Tài liệu TXT/MD/CSV phải là văn bản UTF-8.', 400)
            }
        }
        if (extension === '.docx') {
            // Bound decompressed DOCX entries before invoking the loader.
            let expanded = 0
            for (let offset = 0; offset + 46 < file.buffer.length; offset++)
                if (file.buffer.readUInt32LE(offset) === 0x02014b50) {
                    expanded += file.buffer.readUInt32LE(offset + 24)
                    if (expanded > 20 * 1024 * 1024)
                        throw new AdapterError('DOCUMENT_TOO_LARGE', 'DOCX vượt giới hạn nội dung giải nén 20 MB.', 400)
                }
        }
        const name = extension === '.pdf' ? 'pdfFile' : 'docxFile'
        const component = getRunningExpressApp().nodesPool.componentNodes[name]
        if (!component?.filePath) throw new AdapterError('DOCUMENT_LOADER_UNAVAILABLE', `Runtime chưa nạp bộ đọc ${extension}.`, 400)
        try {
            const module = await import(component.filePath)
            const docs = await new module.nodeClass().init(
                {
                    inputs: {
                        [name]: `data:application/octet-stream;base64,${file.buffer.toString('base64')},filename=document${extension}`,
                        usage: 'perPage',
                        legacyBuild: false
                    },
                    outputs: { output: 'document' }
                },
                '',
                {}
            )
            return docs.map((doc: any, index: number) => ({
                text: String(doc.pageContent || ''),
                page: doc.metadata?.loc?.pageNumber || index + 1
            }))
        } catch {
            throw new AdapterError(
                'DOCUMENT_READ_FAILED',
                `Không đọc được ${extension}. Kiểm tra định dạng, mật khẩu hoặc chuyển sang TXT UTF-8.`,
                400
            )
        }
    }
}
export default new DocumentUploadService()
