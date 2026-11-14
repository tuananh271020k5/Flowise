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

export default {
    createSession,
    getSession,
    sendMessage,
    getRevisions,
    executeBuild,
    getBuildJob,
    cancelBuild,
    getDraftHistory,
    testPrediction
}
