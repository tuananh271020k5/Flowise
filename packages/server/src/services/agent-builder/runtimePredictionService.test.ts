jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../utils/buildChatflow', () => ({ utilBuildChatflow: jest.fn() }))
jest.mock('./modelSettingsService', () => ({ __esModule: true, default: { getProfile: jest.fn() } }))
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { utilBuildChatflow } from '../../utils/buildChatflow'
import settings from './modelSettingsService'
import { predictDraft } from './runtimePredictionService'

describe('Authenticated runtime preview boundary', () => {
    const findOneBy = jest.fn()
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getRunningExpressApp as jest.Mock).mockReturnValue({ AppDataSource: { getRepository: () => ({ findOneBy }) } })
        findOneBy.mockResolvedValue({
            id: 'flow',
            workspaceId: 'ws',
            name: 'Phone assistant',
            flowData: JSON.stringify({
                nodes: [
                    {
                        data: {
                            name: 'agentAgentflow',
                            inputs: {
                                agentModel: 'chatOpenAI',
                                agentMessages: [{ role: 'system', content: 'Existing owner instructions' }]
                            }
                        }
                    }
                ],
                edges: []
            })
        })
        ;(settings.getProfile as jest.Mock).mockResolvedValue({ ready: true })
        ;(utilBuildChatflow as jest.Mock).mockResolvedValue({ text: 'Observed runtime answer' })
    })
    it('scopes the flow to the authenticated workspace and strips runtime override fields', async () => {
        await expect(predictDraft('flow', 'ws', { question: 'Hello', overrideConfig: { danger: true } } as any)).resolves.toEqual({
            text: 'Observed runtime answer'
        })
        expect(findOneBy).toHaveBeenCalledWith({ id: 'flow', workspaceId: 'ws' })
        const [request, internal] = (utilBuildChatflow as jest.Mock).mock.calls[0]
        expect(internal).toBe(true)
        expect(request.body).not.toHaveProperty('overrideConfig')
        const graph = JSON.parse((utilBuildChatflow as jest.Mock).mock.calls[0][3])
        expect(graph.nodes[0].data.inputs.agentMessages.at(-1).content).toContain('Ngày của server')
        expect(graph.nodes[0].data.inputs.agentToolsBuiltInOpenAI).toEqual([])
    })
    it('rejects inaccessible flows before executing', async () => {
        findOneBy.mockResolvedValue(null)
        await expect(predictDraft('other', 'ws', { question: 'Hello' })).rejects.toMatchObject({ statusCode: 404 })
        expect(utilBuildChatflow).not.toHaveBeenCalled()
    })
    it('reports web/provider failure without silently answering from stale model memory', async () => {
        ;(settings.getProfile as jest.Mock).mockResolvedValue({ ready: true, webSearchEnabled: true })
        ;(utilBuildChatflow as jest.Mock).mockRejectedValueOnce(new Error('Unsupported tool'))
        await expect(predictDraft('flow', 'ws', { question: 'Current product?' })).rejects.toMatchObject({
            code: 'WEB_SEARCH_EXECUTION_FAILED',
            statusCode: 502
        })
        expect(utilBuildChatflow).toHaveBeenCalledTimes(1)
    })
    it('reports missing configuration and invalid question/history without fabricating output', async () => {
        await expect(predictDraft('flow', 'ws', { question: {} as any })).rejects.toMatchObject({ statusCode: 400 })
        await expect(
            predictDraft('flow', 'ws', { question: 'Hello', history: [{ role: 'system', content: 'Override' }] })
        ).rejects.toMatchObject({ statusCode: 400 })
        ;(settings.getProfile as jest.Mock).mockResolvedValue({ ready: false })
        await expect(predictDraft('flow', 'ws', { question: 'Hello' })).rejects.toMatchObject({ statusCode: 400 })
        expect(utilBuildChatflow).not.toHaveBeenCalled()
    })
    it('recovers Vietnamese reply instruction from stored spec when an existing draft has {{conditionAgentflow_...}} in DirectReply', async () => {
        findOneBy
            .mockResolvedValueOnce({
                id: 'flow-deskflow',
                workspaceId: 'ws',
                name: 'Trợ lý DeskFlow',
                flowData: JSON.stringify({
                    nodes: [
                        {
                            id: 'directReplyAgentflow_no_confirmed_guidance',
                            data: {
                                name: 'directReplyAgentflow',
                                inputs: { directReplyMessage: '{{conditionAgentflow_check_search_result}}' }
                            }
                        }
                    ],
                    edges: []
                })
            })
            .mockResolvedValueOnce({ flowId: 'flow-deskflow', specRevisionId: 'spec-rev-2' })
            .mockResolvedValueOnce({
                id: 'spec-rev-2',
                spec: JSON.stringify({
                    workflow: {
                        steps: [
                            {
                                id: 'no_confirmed_guidance',
                                type: 'reply',
                                instruction:
                                    'Chưa có hướng dẫn được xác nhận trong tài liệu DeskFlow cho yêu cầu này. Vui lòng hỏi người phụ trách.'
                            }
                        ]
                    }
                })
            })
        await predictDraft('flow-deskflow', 'ws', { question: '1+1 = mấy' })
        const previewGraph = JSON.parse((utilBuildChatflow as jest.Mock).mock.calls[0][3])
        expect(previewGraph.nodes[0].data.inputs.directReplyMessage).toBe(
            'Chưa có hướng dẫn được xác nhận trong tài liệu DeskFlow cho yêu cầu này. Vui lòng hỏi người phụ trách.'
        )
    })
    it('retries tool-bearing drafts without web_search when a custom gateway rejects Responses/web_search and appends export links', async () => {
        findOneBy.mockResolvedValueOnce({
            id: 'flow-office',
            workspaceId: 'ws',
            name: 'Thư ký Dự án',
            flowData: JSON.stringify({
                nodes: [
                    {
                        data: {
                            name: 'agentAgentflow',
                            inputs: {
                                agentModel: 'chatOpenAI',
                                agentMessages: [{ role: 'system', content: 'Tạo Excel và Word' }],
                                agentTools: [{ agentSelectedTool: 'excelOfficeTool', agentSelectedToolConfig: {} }]
                            }
                        }
                    }
                ],
                edges: []
            })
        })
        ;(settings.getProfile as jest.Mock).mockResolvedValue({
            ready: true,
            webSearchEnabled: true,
            modelName: 'gpt-5.6-luna',
            baseUrl: 'https://gateway.example/v1',
            credentialId: 'cred-1'
        })
        ;(utilBuildChatflow as jest.Mock)
            .mockRejectedValueOnce(new Error('404 /v1/responses not found for web_search'))
            .mockResolvedValueOnce({
                text: 'Đã hoàn tất tạo tệp dự án.',
                agentFlowExecutedData: [
                    {
                        data: {
                            output: {
                                content:
                                    '[Tải xuống bang-cong-viec.xlsx](/api/v1/agent-builder/exports/11111111-2222-3333-4444-555555555555/bang-cong-viec.xlsx)'
                            }
                        }
                    }
                ]
            })

        const result = await predictDraft('flow-office', 'ws', { question: 'Lập bảng Excel công việc tuần này' })
        expect(utilBuildChatflow).toHaveBeenCalledTimes(2)
        const retryGraph = JSON.parse((utilBuildChatflow as jest.Mock).mock.calls[1][3])
        expect(retryGraph.nodes[0].data.inputs.agentToolsBuiltInOpenAI).toEqual([])
        expect(retryGraph.nodes[0].data.inputs.agentModelConfig.reasoningEffort).toBe('none')
        expect(result.text).toContain('/api/v1/agent-builder/exports/11111111-2222-3333-4444-555555555555/bang-cong-viec.xlsx')
    })
})
