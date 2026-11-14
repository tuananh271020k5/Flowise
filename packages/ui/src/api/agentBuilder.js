import client from './client'

const createSession = (body) => client.post('/agent-builder/sessions', body)

const getSession = (id) => client.get(`/agent-builder/sessions/${id}`)

const sendMessage = (id, body) => client.post(`/agent-builder/sessions/${id}/messages`, body)

const getRevisions = (id) => client.get(`/agent-builder/sessions/${id}/revisions`)

export default {
    createSession,
    getSession,
    sendMessage,
    getRevisions
}
