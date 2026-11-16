import client from './client'

const createSession = (body) => client.post('/agent-builder/sessions', body)

const getSession = (id) => client.get(`/agent-builder/sessions/${id}`)

const sendMessage = (id, body) => client.post(`/agent-builder/sessions/${id}/messages`, body)

const getRevisions = (id) => client.get(`/agent-builder/sessions/${id}/revisions`)

const executeBuild = (id, body) => client.post(`/agent-builder/sessions/${id}/builds`, body)

const getBuildJob = (jobId) => client.get(`/agent-builder/builds/${jobId}`)

const cancelBuild = (jobId, body) => client.post(`/agent-builder/builds/${jobId}/cancel`, body)

const getDraftHistory = (id) => client.get(`/agent-builder/sessions/${id}/drafts`)

const testPrediction = (flowId, body) => client.post(`/prediction/${flowId}`, body)

const runTestSuite = (sessionId, body) => client.post(`/agent-builder/sessions/${sessionId}/test-suite`, body)

const rollbackRevision = (sessionId, body) => client.post(`/agent-builder/sessions/${sessionId}/rollback`, body)

const getDiff = (sessionId, params) => client.get(`/agent-builder/sessions/${sessionId}/diff`, { params })

const getKnowledgeStores = (params) => client.get('/agent-builder/knowledge/stores', { params })

const getKnowledgeStore = (id) => client.get(`/agent-builder/knowledge/stores/${id}`)

const getKnowledgeStoreChunks = (id, params) => client.get(`/agent-builder/knowledge/stores/${id}/chunks`, { params })

const seedKnowledgeStore = (body) => client.post('/agent-builder/knowledge/seed', body)

const publishAgent = (sessionId, body) => client.post(`/agent-builder/sessions/${sessionId}/publish`, body)

const unpublishAgent = (sessionId, body) => client.post(`/agent-builder/sessions/${sessionId}/unpublish`, body)

const getAuditLogs = (sessionId, params) => client.get(`/agent-builder/sessions/${sessionId}/audit-logs`, { params })

const getMetrics = () => client.get('/agent-builder/metrics')

const getRecentLogs = (params) => client.get('/agent-builder/logs', { params })

const triggerRetentionSweep = (body) => client.post('/agent-builder/retention/sweep', body)

const getSessionUsage = (sessionId) => client.get(`/agent-builder/sessions/${sessionId}/usage`)

const getWorkspaceUsage = () => client.get('/agent-builder/usage')

const reconcileStaleJobs = (body) => client.post('/agent-builder/recovery/reconcile', body)

const reconcileSession = (sessionId) => client.post(`/agent-builder/sessions/${sessionId}/reconcile`)

const exportSessionBackup = (sessionId) => client.get(`/agent-builder/sessions/${sessionId}/backup`)

const importSessionBackup = (bundle, options) => client.post('/agent-builder/sessions/restore', { bundle, options })

const validateSchema = () => client.get('/agent-builder/schema/validate')

const switchDraftRevision = (sessionId, draftRevisionId) =>
    client.post(`/agent-builder/sessions/${sessionId}/switch-draft`, { draftRevisionId })

const instantRollback = (sessionId, params) => client.post(`/agent-builder/sessions/${sessionId}/instant-rollback`, params)

const listApiConnectors = () => client.get('/agent-builder/api-connectors')

const registerApiConnector = (data) => client.post('/agent-builder/api-connectors', data)

const getApiConnector = (id) => client.get(`/agent-builder/api-connectors/${id}`)

const validateApiCall = (params) => client.post('/agent-builder/api-connectors/validate-call', params)

const listSqlDatabases = () => client.get('/agent-builder/sql/databases')

const registerSqlDatabase = (data) => client.post('/agent-builder/sql/databases', data)

const getSqlDatabase = (id) => client.get(`/agent-builder/sql/databases/${id}`)

const validateSqlQuery = (params) => client.post('/agent-builder/sql/validate-query', params)

const executeSqlQuery = (params) => client.post('/agent-builder/sql/execute-query', params)

export default {
    createSession,
    getSession,
    sendMessage,
    getRevisions,
    executeBuild,
    getBuildJob,
    cancelBuild,
    getDraftHistory,
    testPrediction,
    runTestSuite,
    rollbackRevision,
    getDiff,
    getKnowledgeStores,
    getKnowledgeStore,
    getKnowledgeStoreChunks,
    seedKnowledgeStore,
    publishAgent,
    unpublishAgent,
    getAuditLogs,
    getMetrics,
    getRecentLogs,
    triggerRetentionSweep,
    getSessionUsage,
    getWorkspaceUsage,
    reconcileStaleJobs,
    reconcileSession,
    exportSessionBackup,
    importSessionBackup,
    validateSchema,
    switchDraftRevision,
    instantRollback,
    listApiConnectors,
    registerApiConnector,
    getApiConnector,
    validateApiCall,
    listSqlDatabases,
    registerSqlDatabase,
    getSqlDatabase,
    validateSqlQuery,
    executeSqlQuery
}
