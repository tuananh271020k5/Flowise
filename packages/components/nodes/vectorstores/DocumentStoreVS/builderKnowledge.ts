import { BaseRetriever } from '@langchain/core/retrievers'
import { Document } from '@langchain/core/documents'
import { ICommonObject } from '../../../src/Interface'

export const BUILDER_STORE = 'builderLocalDocumentsV1'
const normalize = (text: string) =>
    text
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/đ/g, 'd')
const ignored = new Set(
    'va la cua cac nhung toi ban cho mot co khong thi o duoc voi the nao lam de can trong khi ve gi a an the is to of in how what'.split(
        ' '
    )
)
const terms = (text: string) =>
    normalize(text)
        .match(/[\p{L}\p{N}]{2,}/gu)
        ?.filter((word) => !ignored.has(word)) || []

export function splitBuilderText(text: string, size = 1200, overlap = 180): string[] {
    if (overlap < 0 || overlap >= size) throw new Error('Invalid chunk overlap')
    const clean = text
        .replace(/\u0000/g, '')
        .replace(/\r\n/g, '\n')
        .trim()
    const chunks: string[] = []
    for (let start = 0; start < clean.length; start += size - overlap) {
        const value = clean.slice(start, start + size).trim()
        if (value) chunks.push(value)
        if (start + size >= clean.length) break
    }
    return chunks
}

export function cosine(left: number[], right: number[]): number {
    if (!left.length || left.length !== right.length || [...left, ...right].some((value) => !Number.isFinite(value))) return 0
    let dot = 0,
        a = 0,
        b = 0
    for (let i = 0; i < left.length; i++) {
        dot += left[i] * right[i]
        a += left[i] ** 2
        b += right[i] ** 2
    }
    return a && b ? dot / Math.sqrt(a * b) : 0
}

/** Local chunk storage; lexical ranking or actual provider embeddings. No fabricated vectors. */
export async function retrieveBuilderDocuments(storeId: string, query: string, options: ICommonObject, topK = 4): Promise<Document[]> {
    const ds = options.appDataSource
    const entities = options.databaseEntities
    if (!options.workspaceId) throw new Error('Workspace is required for document retrieval')
    const store = await ds.getRepository(entities.DocumentStore).findOneBy({ id: storeId, workspaceId: options.workspaceId })
    if (!store || store.status !== 'UPSERTED') throw new Error('Không có quyền truy cập tài liệu hoặc tài liệu chưa sẵn sàng')
    const config = JSON.parse(store.vectorStoreConfig || '{}')
    if (config.name !== BUILDER_STORE) throw new Error('Kho tài liệu không đúng định dạng Builder')
    const chunks = await ds
        .getRepository(entities.DocumentStoreFileChunk)
        .find({ where: { storeId }, order: { chunkNo: 'ASC' }, take: 201 })
    if (chunks.length > 200) throw new Error('Tài liệu vượt giới hạn truy xuất cục bộ')
    const documents = chunks.map((chunk: any) => {
        const words = terms(chunk.pageContent)
        const counts = new Map<string, number>()
        for (const word of words) counts.set(word, (counts.get(word) || 0) + 1)
        return { chunk, meta: JSON.parse(chunk.metadata || '{}'), words, counts }
    })
    let queryVector: number[] | undefined
    if (config.config?.mode === 'vector') {
        const embedding = JSON.parse(store.embeddingConfig || '{}')
        const credential = embedding.config?.credential
        if (credential && !(await ds.getRepository(entities.Credential).findOneBy({ id: credential, workspaceId: options.workspaceId })))
            throw new Error('Embedding credential không thuộc workspace')
        const component = options.componentNodes?.openAIEmbeddings
        if (!component?.filePath) throw new Error('Runtime chưa nạp OpenAI Embeddings')
        const module = await import(component.filePath)
        const instance = await new module.nodeClass().init({ credential, inputs: embedding.config }, '', options)
        try {
            queryVector = await instance.embedQuery(query)
        } catch {
            throw new Error('Không gọi được embedding để truy xuất. Kiểm tra key/model/endpoint đã dùng khi tải tài liệu.')
        }
        if (!Array.isArray(queryVector) || !queryVector.length || queryVector.some((value) => !Number.isFinite(value)))
            throw new Error('Provider trả embedding truy vấn không hợp lệ')
    }
    const queryTerms = [...new Set(terms(query))].slice(0, 32)
    const frequencies = new Map(queryTerms.map((term) => [term, documents.filter((doc: any) => doc.counts.has(term)).length]))
    const averageLength = documents.reduce((total: number, doc: any) => total + doc.words.length, 0) / (documents.length || 1)
    const ranked = documents
        .map(({ chunk, meta, words, counts }: any) => {
            let lexical = 0
            for (const term of queryTerms) {
                const count = counts.get(term) || 0
                const frequency = frequencies.get(term) || 0
                const idf = Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5))
                lexical += (idf * count * 2.2) / (count + 1.2 * (0.25 + (0.75 * words.length) / (averageLength || 1)))
            }
            const semantic = queryVector && Array.isArray(meta.vector) ? cosine(queryVector, meta.vector) : 0
            const score = queryVector ? semantic + Math.min(lexical, 2) * 0.04 : lexical
            const matchedTerms = queryTerms.filter((term) => counts.has(term)).length
            // A single coincidental Vietnamese syllable is not enough evidence for a long query.
            const relevant = queryVector ? semantic >= 0.3 : lexical > 0 && (queryTerms.length < 3 || matchedTerms >= 2)
            return { chunk, meta, score, relevant }
        })
        .filter((item: any) => item.relevant)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, Math.min(6, Math.max(1, topK)))
    return ranked.map(
        ({ chunk, meta, score }: any) =>
            new Document({
                pageContent: chunk.pageContent,
                metadata: {
                    source: `/api/v1/agent-builder/documents/${storeId}/chunks/${chunk.id}`,
                    filename: meta.filename || store.name,
                    page: meta.page,
                    chunk: chunk.chunkNo,
                    storeId,
                    score,
                    retrievalMode: queryVector ? 'vector' : 'lexical'
                }
            })
    )
}

export class BuilderDocumentRetriever extends BaseRetriever {
    lc_namespace = ['flowise', 'builder', 'documents']
    constructor(private storeId: string, private options: ICommonObject) {
        super()
    }
    async _getRelevantDocuments(query: string): Promise<Document[]> {
        return retrieveBuilderDocuments(this.storeId, query, this.options)
    }
}
