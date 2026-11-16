import agentBuilderApi from './agentBuilder'
import client from './client'

jest.mock('./client', () => ({
    get: jest.fn(),
    post: jest.fn()
}))

describe('agentBuilder API client', () => {
    afterEach(() => {
        jest.clearAllMocks()
    })

    it('createSession gửi POST request tới /agent-builder/sessions', async () => {
        const payload = { initialGoal: 'Xây dựng trợ lý CSKH' }
        client.post.mockResolvedValueOnce({ data: { session: { id: 's1' } } })

        const res = await agentBuilderApi.createSession(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions', payload)
        expect(res.data.session.id).toBe('s1')
    })

    it('getSession gửi GET request tới /agent-builder/sessions/:id', async () => {
        client.get.mockResolvedValueOnce({ data: { session: { id: 's1' }, messages: [] } })

        const res = await agentBuilderApi.getSession('s1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sessions/s1')
        expect(res.data.session.id).toBe('s1')
    })

    it('sendMessage gửi POST request tới /agent-builder/sessions/:id/messages', async () => {
        const payload = { content: 'Xin chào', clientMessageId: 'msg-1' }
        client.post.mockResolvedValueOnce({ data: { assistantMessage: { content: 'Chào bạn!' } } })

        const res = await agentBuilderApi.sendMessage('s1', payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/messages', payload)
        expect(res.data.assistantMessage.content).toBe('Chào bạn!')
    })

    it('getRevisions gửi GET request tới /agent-builder/sessions/:id/revisions', async () => {
        client.get.mockResolvedValueOnce({ data: [{ revisionNumber: 1 }] })

        const res = await agentBuilderApi.getRevisions('s1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sessions/s1/revisions')
        expect(res.data).toHaveLength(1)
    })

    it('executeBuild gửi POST request tới /agent-builder/sessions/:id/builds', async () => {
        const payload = { specRevisionId: 'rev-1' }
        client.post.mockResolvedValueOnce({ data: { success: true, flowId: 'f1' } })

        const res = await agentBuilderApi.executeBuild('s1', payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/builds', payload)
        expect(res.data.flowId).toBe('f1')
    })

    it('getBuildJob gửi GET request tới /agent-builder/builds/:id', async () => {
        client.get.mockResolvedValueOnce({ data: { id: 'job-1', state: 'running' } })

        const res = await agentBuilderApi.getBuildJob('job-1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/builds/job-1')
        expect(res.data.state).toBe('running')
    })

    it('cancelBuild gửi POST request tới /agent-builder/builds/:id/cancel', async () => {
        const payload = { reason: 'User cancelled' }
        client.post.mockResolvedValueOnce({ data: { state: 'cancelled' } })

        const res = await agentBuilderApi.cancelBuild('job-1', payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/builds/job-1/cancel', payload)
        expect(res.data.state).toBe('cancelled')
    })

    it('getDraftHistory gửi GET request tới /agent-builder/sessions/:id/drafts', async () => {
        client.get.mockResolvedValueOnce({ data: [{ flowId: 'f1' }] })

        const res = await agentBuilderApi.getDraftHistory('s1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sessions/s1/drafts')
        expect(res.data).toHaveLength(1)
    })

    it('testPrediction gửi POST request tới /prediction/:id', async () => {
        const payload = { question: 'Xin chào' }
        client.post.mockResolvedValueOnce({ data: { text: 'Chào bạn!' } })

        const res = await agentBuilderApi.testPrediction('f1', payload)

        expect(client.post).toHaveBeenCalledWith('/prediction/f1', payload)
        expect(res.data.text).toBe('Chào bạn!')
    })

    it('runTestSuite gửi POST request tới /agent-builder/sessions/:id/test-suite', async () => {
        const payload = { maxExamples: 5 }
        client.post.mockResolvedValueOnce({ data: { totalCount: 3, passedCount: 3 } })

        const res = await agentBuilderApi.runTestSuite('s1', payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/test-suite', payload)
        expect(res.data.passedCount).toBe(3)
    })

    it('rollbackRevision gửi POST request tới /agent-builder/sessions/:id/rollback', async () => {
        const payload = { revisionId: 'rev-target' }
        client.post.mockResolvedValueOnce({ data: { session: { id: 's1' } } })

        const res = await agentBuilderApi.rollbackRevision('s1', payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/rollback', payload)
        expect(res.data.session.id).toBe('s1')
    })

    it('getDiff gửi GET request tới /agent-builder/sessions/:id/diff', async () => {
        const params = { rev1: 'rev-1', rev2: 'rev-2' }
        client.get.mockResolvedValueOnce({ data: { hasChanges: true, summary: [] } })

        const res = await agentBuilderApi.getDiff('s1', params)

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sessions/s1/diff', { params })
        expect(res.data.hasChanges).toBe(true)
    })

    it('getKnowledgeStores gửi GET request tới /agent-builder/knowledge/stores', async () => {
        client.get.mockResolvedValueOnce({ data: [{ id: 'ks-1', name: 'HR Policy' }] })

        const res = await agentBuilderApi.getKnowledgeStores()

        expect(client.get).toHaveBeenCalledWith('/agent-builder/knowledge/stores', { params: undefined })
        expect(res.data).toHaveLength(1)
    })

    it('getKnowledgeStore gửi GET request tới /agent-builder/knowledge/stores/:id', async () => {
        client.get.mockResolvedValueOnce({ data: { id: 'ks-1', name: 'HR Policy' } })

        const res = await agentBuilderApi.getKnowledgeStore('ks-1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/knowledge/stores/ks-1')
        expect(res.data.id).toBe('ks-1')
    })

    it('getKnowledgeStoreChunks gửi GET request tới /agent-builder/knowledge/stores/:id/chunks', async () => {
        const params = { limit: 10 }
        client.get.mockResolvedValueOnce({ data: [{ id: 'chunk-1' }] })

        const res = await agentBuilderApi.getKnowledgeStoreChunks('ks-1', params)

        expect(client.get).toHaveBeenCalledWith('/agent-builder/knowledge/stores/ks-1/chunks', { params })
        expect(res.data).toHaveLength(1)
    })

    it('seedKnowledgeStore gửi POST request tới /agent-builder/knowledge/seed', async () => {
        const payload = {}
        client.post.mockResolvedValueOnce({ data: { id: 'ks-seeded' } })

        const res = await agentBuilderApi.seedKnowledgeStore(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/knowledge/seed', payload)
        expect(res.data.id).toBe('ks-seeded')
    })

    it('publishAgent gửi POST request tới /agent-builder/sessions/:id/publish', async () => {
        const payload = { isPublic: true, minPassRate: 0.8 }
        client.post.mockResolvedValueOnce({ data: { success: true, deployed: true } })

        const res = await agentBuilderApi.publishAgent('s1', payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/publish', payload)
        expect(res.data.deployed).toBe(true)
    })

    it('unpublishAgent gửi POST request tới /agent-builder/sessions/:id/unpublish', async () => {
        client.post.mockResolvedValueOnce({ data: { success: true, deployed: false } })

        const res = await agentBuilderApi.unpublishAgent('s1')

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/unpublish', undefined)
        expect(res.data.deployed).toBe(false)
    })

    it('getAuditLogs gửi GET request tới /agent-builder/sessions/:id/audit-logs', async () => {
        const params = { limit: 20 }
        client.get.mockResolvedValueOnce({ data: [{ action: 'AGENT_PUBLISHED' }] })

        const res = await agentBuilderApi.getAuditLogs('s1', params)

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sessions/s1/audit-logs', { params })
        expect(res.data[0].action).toBe('AGENT_PUBLISHED')
    })

    it('getMetrics gửi GET request tới /agent-builder/metrics', async () => {
        client.get.mockResolvedValueOnce({ data: { sessionsCreated: 5 } })

        const res = await agentBuilderApi.getMetrics()

        expect(client.get).toHaveBeenCalledWith('/agent-builder/metrics')
        expect(res.data.sessionsCreated).toBe(5)
    })

    it('getRecentLogs gửi GET request tới /agent-builder/logs', async () => {
        const params = { limit: 10 }
        client.get.mockResolvedValueOnce({ data: [{ action: 'BUILD_SUCCESS' }] })

        const res = await agentBuilderApi.getRecentLogs(params)

        expect(client.get).toHaveBeenCalledWith('/agent-builder/logs', { params })
        expect(res.data[0].action).toBe('BUILD_SUCCESS')
    })

    it('triggerRetentionSweep gửi POST request tới /agent-builder/retention/sweep', async () => {
        const payload = { sessionDays: 30 }
        client.post.mockResolvedValueOnce({ data: { purgedSessionsCount: 2 } })

        const res = await agentBuilderApi.triggerRetentionSweep(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/retention/sweep', payload)
        expect(res.data.purgedSessionsCount).toBe(2)
    })

    it('getSessionUsage gửi GET request tới /agent-builder/sessions/:id/usage', async () => {
        client.get.mockResolvedValueOnce({ data: { totalTokens: 1200 } })

        const res = await agentBuilderApi.getSessionUsage('s1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sessions/s1/usage')
        expect(res.data.totalTokens).toBe(1200)
    })

    it('getWorkspaceUsage gửi GET request tới /agent-builder/usage', async () => {
        client.get.mockResolvedValueOnce({ data: { totalTokens: 5000 } })

        const res = await agentBuilderApi.getWorkspaceUsage()

        expect(client.get).toHaveBeenCalledWith('/agent-builder/usage')
        expect(res.data.totalTokens).toBe(5000)
    })

    it('reconcileStaleJobs gửi POST request tới /agent-builder/recovery/reconcile', async () => {
        const payload = { maxStaleMs: 30000 }
        client.post.mockResolvedValueOnce({ data: { reconciledJobsCount: 1 } })

        const res = await agentBuilderApi.reconcileStaleJobs(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/recovery/reconcile', payload)
        expect(res.data.reconciledJobsCount).toBe(1)
    })

    it('reconcileSession gửi POST request tới /agent-builder/sessions/:id/reconcile', async () => {
        client.post.mockResolvedValueOnce({ data: { success: true, sessionState: 'ready' } })

        const res = await agentBuilderApi.reconcileSession('s1')

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/reconcile')
        expect(res.data.sessionState).toBe('ready')
    })

    it('exportSessionBackup gửi GET request tới /agent-builder/sessions/:id/backup', async () => {
        client.get.mockResolvedValueOnce({ data: { sessionId: 's1', version: '1.0.0' } })

        const res = await agentBuilderApi.exportSessionBackup('s1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sessions/s1/backup')
        expect(res.data.sessionId).toBe('s1')
    })

    it('importSessionBackup gửi POST request tới /agent-builder/sessions/restore', async () => {
        const bundle = { sessionId: 's1', session: {} }
        const options = { overwrite: true }
        client.post.mockResolvedValueOnce({ data: { success: true, sessionId: 's1' } })

        const res = await agentBuilderApi.importSessionBackup(bundle, options)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/restore', { bundle, options })
        expect(res.data.success).toBe(true)
    })

    it('validateSchema gửi GET request tới /agent-builder/schema/validate', async () => {
        client.get.mockResolvedValueOnce({ data: { valid: true, totalOrphaned: 0 } })

        const res = await agentBuilderApi.validateSchema()

        expect(client.get).toHaveBeenCalledWith('/agent-builder/schema/validate')
        expect(res.data.valid).toBe(true)
    })

    it('switchDraftRevision gửi POST request tới /agent-builder/sessions/:id/switch-draft', async () => {
        client.post.mockResolvedValueOnce({ data: { success: true, flowId: 'f1' } })

        const res = await agentBuilderApi.switchDraftRevision('s1', 'd1')

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/switch-draft', { draftRevisionId: 'd1' })
        expect(res.data.success).toBe(true)
    })

    it('instantRollback gửi POST request tới /agent-builder/sessions/:id/instant-rollback', async () => {
        const payload = { toLastStable: true }
        client.post.mockResolvedValueOnce({ data: { success: true, revisionNo: 3 } })

        const res = await agentBuilderApi.instantRollback('s1', payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sessions/s1/instant-rollback', payload)
        expect(res.data.revisionNo).toBe(3)
    })

    it('listApiConnectors gửi GET request tới /agent-builder/api-connectors', async () => {
        client.get.mockResolvedValueOnce({ data: [{ id: 'conn-1', name: 'Weather API' }] })

        const res = await agentBuilderApi.listApiConnectors()

        expect(client.get).toHaveBeenCalledWith('/agent-builder/api-connectors')
        expect(res.data).toHaveLength(1)
    })

    it('registerApiConnector gửi POST request tới /agent-builder/api-connectors', async () => {
        const payload = { name: 'Weather API', baseUrl: 'https://api.weather.com' }
        client.post.mockResolvedValueOnce({ data: { id: 'conn-1', ...payload } })

        const res = await agentBuilderApi.registerApiConnector(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/api-connectors', payload)
        expect(res.data.id).toBe('conn-1')
    })

    it('getApiConnector gửi GET request tới /agent-builder/api-connectors/:id', async () => {
        client.get.mockResolvedValueOnce({ data: { id: 'conn-1', name: 'Weather API' } })

        const res = await agentBuilderApi.getApiConnector('conn-1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/api-connectors/conn-1')
        expect(res.data.name).toBe('Weather API')
    })

    it('validateApiCall gửi POST request tới /agent-builder/api-connectors/validate-call', async () => {
        const payload = { connectorId: 'conn-1', operationId: 'getWeather', url: 'https://api.weather.com/v1', method: 'GET' }
        client.post.mockResolvedValueOnce({ data: { allowed: true } })

        const res = await agentBuilderApi.validateApiCall(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/api-connectors/validate-call', payload)
        expect(res.data.allowed).toBe(true)
    })

    it('listSqlDatabases gửi GET request tới /agent-builder/sql/databases', async () => {
        client.get.mockResolvedValueOnce({ data: [{ id: 'db-1', name: 'Sales DB' }] })

        const res = await agentBuilderApi.listSqlDatabases()

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sql/databases')
        expect(res.data).toHaveLength(1)
    })

    it('registerSqlDatabase gửi POST request tới /agent-builder/sql/databases', async () => {
        const payload = { name: 'Sales DB', databaseType: 'sqlite', allowedTables: ['orders'] }
        client.post.mockResolvedValueOnce({ data: { id: 'db-1', ...payload } })

        const res = await agentBuilderApi.registerSqlDatabase(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sql/databases', payload)
        expect(res.data.id).toBe('db-1')
    })

    it('getSqlDatabase gửi GET request tới /agent-builder/sql/databases/:id', async () => {
        client.get.mockResolvedValueOnce({ data: { id: 'db-1', name: 'Sales DB' } })

        const res = await agentBuilderApi.getSqlDatabase('db-1')

        expect(client.get).toHaveBeenCalledWith('/agent-builder/sql/databases/db-1')
        expect(res.data.name).toBe('Sales DB')
    })

    it('validateSqlQuery gửi POST request tới /agent-builder/sql/validate-query', async () => {
        const payload = { databaseId: 'db-1', query: 'SELECT * FROM orders' }
        client.post.mockResolvedValueOnce({ data: { valid: true } })

        const res = await agentBuilderApi.validateSqlQuery(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sql/validate-query', payload)
        expect(res.data.valid).toBe(true)
    })

    it('executeSqlQuery gửi POST request tới /agent-builder/sql/execute-query', async () => {
        const payload = { databaseId: 'db-1', query: 'SELECT * FROM orders' }
        client.post.mockResolvedValueOnce({ data: { rowCount: 5, rows: [] } })

        const res = await agentBuilderApi.executeSqlQuery(payload)

        expect(client.post).toHaveBeenCalledWith('/agent-builder/sql/execute-query', payload)
        expect(res.data.rowCount).toBe(5)
    })
})
