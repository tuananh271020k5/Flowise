jest.mock('../modelSettingsService', () => ({ __esModule: true, default: { getEmbeddingModel: jest.fn() } }))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
import { DocumentUploadService, splitDocument } from './documentUploadService'
import { BuilderSession } from '../../../database/entities/BuilderSession'
import { DocumentStore } from '../../../database/entities/DocumentStore'
import { DocumentStoreFileChunk } from '../../../database/entities/DocumentStoreFileChunk'
import modelSettingsService from '../modelSettingsService'
const { retrieveBuilderDocuments } = require('../../../../../components/nodes/vectorstores/DocumentStoreVS/builderKnowledge')

describe('Chat document ingestion and retrieval boundary', () => {
    let records: Map<any, any[]>, ds: any, service: DocumentUploadService
    const file = (name = 'guide.md', value = 'Đặt lại mật khẩu: Mở Hồ sơ, chọn Bảo mật, nhấn Đổi mật khẩu. Nhập mã xác nhận 6314.') =>
        ({ originalname: name, buffer: Buffer.from(value, 'utf8') } as Express.Multer.File)
    beforeEach(() => {
        jest.clearAllMocks()
        records = new Map<any, any[]>([
            [BuilderSession, [{ id: 'session', workspaceId: 'ws' }]],
            [DocumentStore, []],
            [DocumentStoreFileChunk, []]
        ])
        ds = {
            getRepository: (entity: any) => ({
                create: (value: any) => value,
                find: async ({ where = {} } = {}) =>
                    records.get(entity)!.filter((value) => Object.entries(where).every(([key, match]) => value[key] === match)),
                findOneBy: async (where: any) =>
                    records.get(entity)!.find((value) => Object.entries(where).every(([key, match]) => value[key] === match)),
                save: async (value: any) => {
                    records.get(entity)!.push(...(Array.isArray(value) ? value : [value]))
                    return value
                }
            }),
            transaction: async (run: any) => run(ds)
        }
        service = new DocumentUploadService(ds)
    })
    it('stores real UTF-8 chunks once, retrieves a matching source and returns no evidence for an unrelated query', async () => {
        const refs = await service.ingest('session', 'ws', [file('..\\..\\guide.md')], 'lexical', '')
        expect(refs[0]).toMatchObject({ name: 'guide.md', config: { retrievalMode: 'lexical', chunkCount: 1, uploaded: true } })
        const options = { appDataSource: ds, databaseEntities: { DocumentStore, DocumentStoreFileChunk }, workspaceId: 'ws' }
        const docs = await retrieveBuilderDocuments(refs[0].id, 'Làm sao đặt lại mật khẩu?', options)
        expect(docs[0].pageContent).toContain('6314')
        expect(docs[0].metadata).toMatchObject({
            filename: 'guide.md',
            retrievalMode: 'lexical',
            source: expect.stringContaining('/chunks/')
        })
        expect(await retrieveBuilderDocuments(refs[0].id, 'thiên văn sao hỏa', options)).toEqual([])
        expect(await service.ingest('session', 'ws', [file('..\\..\\guide.md')], 'lexical', '')).toEqual(refs)
        expect(records.get(DocumentStore)).toHaveLength(1)
        expect(modelSettingsService.getEmbeddingModel).not.toHaveBeenCalled()
    })
    it('rejects foreign sessions and foreign stores before reading or calling an embedding provider', async () => {
        await expect(service.ingest('session', 'foreign', [file()], 'vector', 'embedding-model')).rejects.toMatchObject({
            code: 'SESSION_NOT_FOUND'
        })
        const refs = await service.ingest('session', 'ws', [file()], 'lexical', '')
        await expect(
            retrieveBuilderDocuments(refs[0].id, 'mật khẩu', {
                appDataSource: ds,
                databaseEntities: { DocumentStore, DocumentStoreFileChunk },
                workspaceId: 'foreign'
            })
        ).rejects.toThrow('quyền')
        expect(modelSettingsService.getEmbeddingModel).not.toHaveBeenCalled()
    })
    it('preserves Vietnamese multipart filenames and ignores one coincidental syllable in a long query', async () => {
        const filename = Buffer.from('hướng-dẫn.md', 'utf8').toString('latin1')
        const refs = await service.ingest('session', 'ws', [file(filename, 'Tài liệu phần mềm có hướng dẫn hóa đơn.')], 'lexical', '')
        expect(refs[0].name).toBe('hướng-dẫn.md')
        expect(
            await retrieveBuilderDocuments(refs[0].id, 'thiên văn sao hỏa', {
                appDataSource: ds,
                databaseEntities: { DocumentStore, DocumentStoreFileChunk },
                workspaceId: 'ws'
            })
        ).toEqual([])
    })
    it('stores real provider vectors only after validation and does not silently fall back when embeddings fail', async () => {
        const embedDocuments = jest.fn(async () => [[1, 0, 0]])
        ;(modelSettingsService.getEmbeddingModel as jest.Mock).mockResolvedValue({
            instance: { embedDocuments },
            config: { modelName: 'fixture-embedding', credential: 'credential-ref' }
        })
        const refs = await service.ingest('session', 'ws', [file()], 'vector', 'fixture-embedding')
        expect(embedDocuments).toHaveBeenCalledWith([expect.stringContaining('6314')])
        expect(refs[0].config?.retrievalMode).toBe('vector')
        expect(JSON.parse(records.get(DocumentStoreFileChunk)![0].metadata).vector).toEqual([1, 0, 0])
        embedDocuments.mockRejectedValueOnce(new Error('provider secret omitted') as never)
        await expect(
            service.ingest('session', 'ws', [file('new.md', 'Nội dung khác để test lỗi embedding.')], 'vector', 'fixture-embedding')
        ).rejects.toMatchObject({ code: 'EMBEDDING_FAILED', message: expect.not.stringContaining('secret') })
        expect(records.get(DocumentStore)).toHaveLength(1)
    })
    it('bounds file type, size, encoding and chunks before persisting', async () => {
        await expect(service.ingest('session', 'ws', [file('file.exe')], 'lexical', '')).rejects.toMatchObject({ code: 'INVALID_FILE' })
        await expect(service.ingest('session', 'ws', [file('huge.md', 'x'.repeat(200001))], 'lexical', '')).rejects.toMatchObject({
            code: 'DOCUMENT_TOO_LARGE'
        })
        await expect(
            service.ingest('session', 'ws', [{ ...file(), buffer: Buffer.from([0xff, 0xff]) }], 'lexical', '')
        ).rejects.toMatchObject({ code: 'INVALID_TEXT_ENCODING' })
        expect(records.get(DocumentStore)).toEqual([])
        const chunks = splitDocument('a'.repeat(3500))
        expect(chunks.length).toBeGreaterThan(1)
        expect(chunks.every((chunk) => chunk.length <= 1200)).toBe(true)
    })
})
