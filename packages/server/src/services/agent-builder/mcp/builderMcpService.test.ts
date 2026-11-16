/* eslint-disable */
jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import builderMcpService from './builderMcpService'
import sessionService from '../sessionService'
import buildPipelineService from '../pipeline/buildPipelineService'
import evaluationRunnerService from '../pipeline/evaluationRunnerService'

jest.mock('../sessionService')
jest.mock('../pipeline/buildPipelineService')
jest.mock('../pipeline/evaluationRunnerService')

describe('BuilderMcpService (PH6-T12)', () => {
    const workspaceId = 'ws-mcp-test'

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('listTools returns valid list of MCP tools with schemas', () => {
        const tools = builderMcpService.listTools()
        expect(tools.length).toBe(5)
        const toolNames = tools.map((t) => t.name)
        expect(toolNames).toContain('builder_list_templates')
        expect(toolNames).toContain('builder_get_session')
        expect(toolNames).toContain('builder_send_message')
        expect(toolNames).toContain('builder_compile_draft')
        expect(toolNames).toContain('builder_run_tests')
    })

    it('callTool builder_list_templates returns all supported templates', async () => {
        const result = await builderMcpService.callTool({
            workspaceId,
            toolName: 'builder_list_templates'
        })

        expect(result.isError).toBeUndefined()
        expect(result.content[0].text).toContain('assistant-flow-template')
        expect(result.content[0].text).toContain('knowledge-flow-template')
        expect(result.content[0].text).toContain('api-flow-template')
        expect(result.content[0].text).toContain('sql-flow-template')
    })

    it('callTool builder_send_message forwards message to sessionService', async () => {
        ;(sessionService.addMessage as jest.Mock).mockResolvedValueOnce({
            message: { id: 'm1', content: 'Tôi muốn làm bot' },
            collectorResponse: 'Chào bạn'
        })

        const result = await builderMcpService.callTool({
            workspaceId,
            toolName: 'builder_send_message',
            arguments: {
                sessionId: 'sess-1',
                content: 'Tôi muốn làm bot CSKH'
            }
        })

        expect(result.isError).toBeUndefined()
        expect(sessionService.addMessage).toHaveBeenCalledWith('sess-1', workspaceId, expect.objectContaining({
            content: 'Tôi muốn làm bot CSKH'
        }))
        expect(result.content[0].text).toContain('Chào bạn')
    })

    it('callTool builder_compile_draft calls buildPipelineService', async () => {
        ;(buildPipelineService.executeBuild as jest.Mock).mockResolvedValueOnce({
            flowId: 'flow-123',
            revisionNo: 1
        })

        const result = await builderMcpService.callTool({
            workspaceId,
            toolName: 'builder_compile_draft',
            arguments: { sessionId: 'sess-1' }
        })

        expect(result.isError).toBeUndefined()
        expect(buildPipelineService.executeBuild).toHaveBeenCalledWith({ sessionId: 'sess-1', workspaceId })
        expect(result.content[0].text).toContain('flow-123')
    })

    it('returns error when tool does not exist', async () => {
        const result = await builderMcpService.callTool({
            workspaceId,
            toolName: 'non_existent_tool'
        })

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('không được hỗ trợ')
    })
})
