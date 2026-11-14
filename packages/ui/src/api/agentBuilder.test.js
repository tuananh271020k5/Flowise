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
})
