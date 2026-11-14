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
    seedKnowledgeStore
}
