import { Request, Response, NextFunction } from 'express'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import builderMcpService from './builderMcpService'
import rateLimiter from '../security/rateLimiter'

// Stateless transport: authentication/workspace are resolved afresh for every HTTP request.
export async function builderMcpTransport(req: Request, res: Response, next: NextFunction) {
    if (!req.user?.activeWorkspaceId) return res.status(401).json({ message: 'Unauthorized' })
    const workspaceId = req.user.activeWorkspaceId
    const server = new Server({ name: 'flowise-agent-builder', version: '1.0.0' }, { capabilities: { tools: {} } })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    try {
        rateLimiter.enforceLimit(workspaceId, 'message')
        server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: builderMcpService.listTools() }))
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const tool = builderMcpService.listTools().find((entry) => entry.name === request.params.name)
            if (!tool) throw new Error('Unknown tool')
            const args = request.params.arguments || {}
            for (const required of tool.inputSchema.required || []) if (args[required] === undefined) throw new Error(`Missing ${required}`)
            for (const [key, value] of Object.entries(args)) {
                const field = tool.inputSchema.properties[key]
                if (!field || typeof value !== field.type || (typeof value === 'string' && value.length > 16000))
                    throw new Error(`Invalid ${key}`)
            }
            return builderMcpService.callTool({ workspaceId, toolName: request.params.name, arguments: args }) as any
        })
        res.on('close', () => {
            void server.close()
        })
        await server.connect(transport)
        await transport.handleRequest(req, res, req.body)
    } catch (error) {
        await server.close()
        if (!res.headersSent) next(error)
    }
}
