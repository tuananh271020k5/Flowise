import { DataSource } from 'typeorm'
import { Variable } from '../../database/entities/Variable'
import { Credential } from '../../database/entities/Credential'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { AdapterError } from './errors/builderErrors'
import { requiresNoneReasoningForFunctionTools } from './agentBehaviorPolicy'

export interface BuilderModelProfile {
    nodeName: 'chatOpenAI'
    modelName: string
    credentialId?: string
    baseUrl?: string
    ready: boolean
    webSearchEnabled: boolean
}

const SETTING = '__agent_builder_model_profile'

export class ModelSettingsService {
    constructor(private dataSource?: DataSource) {}
    private get ds() {
        return this.dataSource || getRunningExpressApp().AppDataSource
    }

    async getProfile(workspaceId: string): Promise<BuilderModelProfile> {
        const saved = await this.ds.getRepository(Variable).findOneBy({ workspaceId, name: SETTING })
        const config = saved ? JSON.parse(saved.value) : {}
        const credentialId = config.credentialId || process.env.BUILDER_CREDENTIAL_ID
        const credential = credentialId ? await this.ds.getRepository(Credential).findOneBy({ id: credentialId, workspaceId }) : null
        return {
            nodeName: 'chatOpenAI',
            modelName: config.modelName || process.env.BUILDER_MODEL_NAME || 'gpt-4o-mini',
            baseUrl: config.baseUrl || process.env.BUILDER_MODEL_BASE_URL || undefined,
            credentialId: credential?.id,
            ready: Boolean(credential || process.env.OPENAI_API_KEY),
            webSearchEnabled: config.webSearchEnabled === true
        }
    }

    async saveProfile(
        workspaceId: string,
        input: { modelName?: string; baseUrl?: string; apiKey?: string; webSearchEnabled?: boolean }
    ): Promise<BuilderModelProfile> {
        const previous = await this.getProfile(workspaceId)
        if (input.webSearchEnabled !== undefined && typeof input.webSearchEnabled !== 'boolean')
            throw new Error('webSearchEnabled phải là boolean')
        const webSearchEnabled = input.webSearchEnabled ?? previous.webSearchEnabled
        const modelName = String(input.modelName || previous.modelName).trim()
        if (!modelName || modelName.length > 150) throw new Error('Tên model không hợp lệ')
        const baseUrl = input.baseUrl === undefined ? previous.baseUrl : input.baseUrl.trim() || undefined
        if (baseUrl) {
            const url = new URL(baseUrl)
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
                throw new Error('Base URL phải là HTTP(S), không chứa mật khẩu, query hoặc fragment')
            }
            // Local model gateways are allowed only when the server owner opts in.
            const host = url.hostname.toLowerCase()
            const local =
                host === 'localhost' || host === '[::1]' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
            if (local && process.env.BUILDER_ALLOW_LOCAL_MODEL !== 'true')
                throw new Error('Model local cần BUILDER_ALLOW_LOCAL_MODEL=true trên server')
        }
        let credentialId = previous.credentialId
        if (input.apiKey?.trim()) {
            if (input.apiKey.length > 4096) throw new Error('API key quá dài')
            const repo = this.ds.getRepository(Credential)
            const { encryptCredentialData } = await import('../../utils')
            const encryptedData = await encryptCredentialData({ openAIApiKey: input.apiKey.trim() })
            const old = credentialId ? await repo.findOneBy({ id: credentialId, workspaceId }) : null
            const credential = await repo.save(
                repo.create({ ...old, name: 'Agent Builder model', credentialName: 'openAIApi', encryptedData, workspaceId })
            )
            credentialId = credential.id
        }
        const repo = this.ds.getRepository(Variable)
        const old = await repo.findOneBy({ workspaceId, name: SETTING })
        await repo.save(
            repo.create({
                ...old,
                workspaceId,
                name: SETTING,
                type: 'static',
                value: JSON.stringify({ modelName, baseUrl, credentialId, webSearchEnabled })
            })
        )
        return this.getProfile(workspaceId)
    }

    async getModel(workspaceId: string) {
        const profile = await this.getProfile(workspaceId)
        if (!profile.ready) throw new Error('Chưa cấu hình model. Mở Cấu hình model trên trang Builder và nhập API key.')
        const app = getRunningExpressApp()
        const node = app.nodesPool.componentNodes.chatOpenAI
        if (!node?.filePath) throw new Error('Flowise chưa nạp node ChatOpenAI')
        const module = await import(node.filePath)
        const { databaseEntities } = await import('../../utils')
        const useLowCollectorReasoning = requiresNoneReasoningForFunctionTools(profile.modelName)
        return new module.nodeClass().init(
            {
                id: 'builder_collector',
                credential: profile.credentialId,
                inputs: {
                    modelName: profile.modelName,
                    temperature: 0,
                    streaming: false,
                    timeout: 120000,
                    ...(useLowCollectorReasoning ? { reasoningEffort: 'low' } : {}),
                    basepath: profile.baseUrl
                }
            },
            '',
            { appDataSource: this.ds, databaseEntities, workspaceId }
        )
    }

    async getEmbeddingModel(workspaceId: string, modelName: string) {
        const profile = await this.getProfile(workspaceId)
        if (!profile.ready) throw new AdapterError('MODEL_NOT_CONFIGURED', 'Lưu API key trước khi dùng embedding.', 400)
        if (!/^[\w./:-]{1,150}$/.test(modelName)) throw new AdapterError('INVALID_EMBEDDING_MODEL', 'Tên model embedding không hợp lệ', 400)
        const node = getRunningExpressApp().nodesPool.componentNodes.openAIEmbeddings
        if (!node?.filePath) throw new AdapterError('EMBEDDINGS_UNAVAILABLE', 'Runtime chưa nạp OpenAI Embeddings', 400)
        const module = await import(node.filePath)
        const { databaseEntities } = await import('../../utils')
        const config = {
            modelName,
            basepath: profile.baseUrl,
            credential: profile.credentialId,
            timeout: 30000,
            batchSize: 32,
            encodingFormat: 'float'
        }
        const instance = await new module.nodeClass().init({ credential: profile.credentialId, inputs: config }, '', {
            appDataSource: this.ds,
            databaseEntities,
            workspaceId
        })
        return { instance, config }
    }

    /** Discovery only: uses the saved workspace profile, never caller-supplied URLs/keys. */
    async listModels(workspaceId: string): Promise<{ models: string[] }> {
        const profile = await this.getProfile(workspaceId)
        if (!profile.ready) throw new AdapterError('MODEL_NOT_CONFIGURED', 'Lưu API key trước khi tải danh sách model.', 400)
        try {
            let apiKey = process.env.OPENAI_API_KEY
            if (profile.credentialId) {
                const credential = await this.ds.getRepository(Credential).findOneBy({ id: profile.credentialId, workspaceId })
                if (!credential) throw new Error('Missing credential')
                const { decryptCredentialData } = await import('../../utils')
                const data = await decryptCredentialData(credential.encryptedData)
                apiKey = typeof data.openAIApiKey === 'string' ? data.openAIApiKey : undefined
            }
            if (!apiKey) throw new Error('Missing API key')
            const { default: OpenAI } = await import('openai')
            const client = new OpenAI({ apiKey, baseURL: profile.baseUrl || undefined, timeout: 10000, maxRetries: 0 })
            const page = await client.models.list()
            if (!Array.isArray(page.data)) throw new Error('Unsupported model catalog')
            const models = [
                ...new Set(
                    page.data
                        .slice(0, 1000)
                        .map((item) => item?.id)
                        .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 150 && !/\s/.test(id))
                )
            ].sort()
            return { models }
        } catch (error: any) {
            const message = [401, 403].includes(error?.status)
                ? 'Provider từ chối tải danh sách model. Kiểm tra quyền của API key đã lưu.'
                : 'Không tải được danh sách model. Kiểm tra cấu hình đã lưu hoặc endpoint /models; bạn vẫn có thể chọn gợi ý hay nhập tên model.'
            throw new AdapterError('MODEL_CATALOG_UNAVAILABLE', message, 502)
        }
    }
}

export default new ModelSettingsService()
