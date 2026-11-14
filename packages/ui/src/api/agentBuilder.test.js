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
})
