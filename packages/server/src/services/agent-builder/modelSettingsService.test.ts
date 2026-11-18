jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../utils', () => ({ decryptCredentialData: jest.fn(async () => ({ openAIApiKey: 'fixture-key-never-returned' })) }))
jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }))
import { ModelSettingsService } from './modelSettingsService'
import { Variable } from '../../database/entities/Variable'
import OpenAI from 'openai'
import { decryptCredentialData } from '../../utils'

describe('Workspace model settings and catalog', () => {
    let setting: any
    let service: ModelSettingsService
    const list = jest.fn()
    const findCredential = jest.fn()
    beforeEach(() => {
        jest.clearAllMocks()
        ;(OpenAI as unknown as jest.Mock).mockImplementation(() => ({ models: { list } }))
        findCredential.mockResolvedValue({ id: 'existing-credential', workspaceId: 'ws', encryptedData: 'encrypted-fixture' })
        setting = {
            id: 'setting',
            name: '__agent_builder_model_profile',
            workspaceId: 'ws',
            value: JSON.stringify({ modelName: 'gpt-4o-mini', credentialId: 'existing-credential' })
        }
        const variableRepo = {
            findOneBy: async () => setting,
            create: (value: any) => value,
            save: async (value: any) => (setting = value)
        }
        const ds = {
            getRepository: (entity: any) => (entity === Variable ? variableRepo : { findOneBy: findCredential })
        }
        service = new ModelSettingsService(ds as any)
    })
    it('leaves paid web search off for existing profiles', async () => {
        expect((await service.getProfile('ws')).webSearchEnabled).toBe(false)
    })
    it('persists opt-in and preserves the selected model and credential', async () => {
        const profile = await service.saveProfile('ws', { webSearchEnabled: true })
        expect(profile).toMatchObject({
            webSearchEnabled: true,
            modelName: 'gpt-4o-mini',
            credentialId: 'existing-credential',
            ready: true
        })
        expect(JSON.parse(setting.value).credentialId).toBe('existing-credential')
    })
    it('rejects coercible strings instead of enabling a paid feature accidentally', async () => {
        await expect(service.saveProfile('ws', { webSearchEnabled: 'true' } as any)).rejects.toThrow('boolean')
    })
    it('lists only model IDs through the saved provider without exposing or changing credentials', async () => {
        const previous = setting.value
        list.mockResolvedValue({
            data: [{ id: 'custom/chat-model', owned_by: 'org' }, { id: 'gpt-5.4' }, { id: 'gpt-5.4' }, { id: 'invalid\nname' }, { id: 42 }]
        })
        await expect(service.listModels('ws')).resolves.toEqual({ models: ['custom/chat-model', 'gpt-5.4'] })
        expect(decryptCredentialData).toHaveBeenCalledWith('encrypted-fixture')
        expect(findCredential).toHaveBeenCalledWith({ id: 'existing-credential', workspaceId: 'ws' })
        expect(OpenAI).toHaveBeenCalledWith(
            expect.objectContaining({ apiKey: 'fixture-key-never-returned', timeout: 10000, maxRetries: 0 })
        )
        expect(setting.value).toBe(previous)
        expect(list).toHaveBeenCalledTimes(1)
    })
    it('uses the saved gateway and sanitizes discovery errors containing secrets', async () => {
        setting.value = JSON.stringify({
            modelName: 'existing-model',
            baseUrl: 'https://gateway.example/v1',
            credentialId: 'existing-credential'
        })
        list.mockRejectedValue({ status: 401, message: 'raw secret fixture-key-never-returned' })
        await expect(service.listModels('ws')).rejects.toMatchObject({
            code: 'MODEL_CATALOG_UNAVAILABLE',
            message: expect.not.stringContaining('fixture-key-never-returned')
        })
        expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'https://gateway.example/v1' }))
    })
    it('does not contact the provider or decrypt a credential from another workspace', async () => {
        const previousEnvKey = process.env.OPENAI_API_KEY
        delete process.env.OPENAI_API_KEY
        try {
            findCredential.mockResolvedValue(null)
            await expect(service.listModels('another-workspace')).rejects.toMatchObject({ code: 'MODEL_NOT_CONFIGURED' })
            expect(findCredential).toHaveBeenCalledWith({ id: 'existing-credential', workspaceId: 'another-workspace' })
            expect(decryptCredentialData).not.toHaveBeenCalled()
            expect(list).not.toHaveBeenCalled()
        } finally {
            if (previousEnvKey === undefined) delete process.env.OPENAI_API_KEY
            else process.env.OPENAI_API_KEY = previousEnvKey
        }
    })
})
