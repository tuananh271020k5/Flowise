import { StatusCodes } from 'http-status-codes'
import { CustomMcpServer } from '../../../database/entities/CustomMcpServer'
import { CustomMcpServerAuthType } from '../../../Interface'
import { InternalFlowiseError } from '../../../errors/internalFlowiseError'
import { getErrorMessage } from '../../../errors/utils'
import { containsScriptTag } from '../schema'
import { McpServerRef } from '../types'

const REDACTED_VALUE = '************'

export interface WorkspaceMcpAction {
    name: string
    description: string
}

export interface WorkspaceMcpServerSummary {
    id: string
    name: string
    serverUrl: string
    status: string
    toolCount: number
    actions: WorkspaceMcpAction[]
    hasCustomHeaders: boolean
    updatedDate?: string
}

export interface RegisterWorkspaceMcpServerInput {
    name?: string
    serverUrl?: string
    bearerToken?: string
    headers?: Record<string, string>
}

export function sanitizeMcpActionName(name: string): string {
    return name
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 128)
}

export function sanitizeMcpActionDescription(description: unknown): string {
    if (typeof description !== 'string') return ''
    return (
        description
            // eslint-disable-next-line no-control-regex
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/[\u200B-\u200D\u2028\u2029\u202A-\u202E\u2060\uFEFF]/gu, '')
            .trim()
            .slice(0, 240)
    )
}

function maskServerUrl(url: string): string {
    try {
        const parsed = new URL(url)
        if (parsed.pathname && parsed.pathname !== '/') {
            return `${parsed.origin}/${REDACTED_VALUE}`
        }
        return parsed.origin
    } catch {
        return REDACTED_VALUE
    }
}

export function parseDiscoveredMcpActions(toolsJson?: string | null): WorkspaceMcpAction[] {
    if (!toolsJson || typeof toolsJson !== 'string') return []
    try {
        const parsed = JSON.parse(toolsJson)
        const rawList: unknown[] = Array.isArray(parsed?.tools) ? parsed.tools : Array.isArray(parsed) ? parsed : []
        const seen = new Set<string>()
        const actions: WorkspaceMcpAction[] = []
        for (const item of rawList) {
            if (!item || typeof item !== 'object') continue
            const rawName = (item as { name?: unknown }).name
            if (typeof rawName !== 'string' || !rawName.trim()) continue
            const sanitizedName = sanitizeMcpActionName(rawName)
            if (!sanitizedName || seen.has(sanitizedName)) continue
            seen.add(sanitizedName)
            actions.push({
                name: sanitizedName,
                description: sanitizeMcpActionDescription((item as { description?: unknown }).description)
            })
        }
        return actions
    } catch {
        return []
    }
}

function mapRecordToSummary(record: CustomMcpServer): WorkspaceMcpServerSummary {
    const actions = parseDiscoveredMcpActions(record.tools)
    return {
        id: record.id,
        name: record.name,
        serverUrl: maskServerUrl(record.serverUrl),
        status: record.status || 'PENDING',
        toolCount: actions.length || record.toolCount || 0,
        actions,
        hasCustomHeaders: record.authType === CustomMcpServerAuthType.CUSTOM_HEADERS,
        updatedDate: record.updatedDate ? new Date(record.updatedDate).toISOString() : undefined
    }
}

export class WorkspaceMcpRegistryService {
    /**
     * Liệt kê toàn bộ MCP Server của Workspace (đã che URL path và không bao giờ trả authConfig).
     */
    async listWorkspaceMcpServers(workspaceId: string): Promise<WorkspaceMcpServerSummary[]> {
        if (!workspaceId) return []
        const { getRunningExpressApp } = await import('../../../utils/getRunningExpressApp')
        const appServer = getRunningExpressApp()
        const records = await appServer.AppDataSource.getRepository(CustomMcpServer)
            .createQueryBuilder('custom_mcp_server')
            .addSelect('custom_mcp_server.tools')
            .where('custom_mcp_server.workspaceId = :workspaceId', { workspaceId })
            .orderBy('custom_mcp_server.updatedDate', 'DESC')
            .getMany()

        return records.map(mapRecordToSummary)
    }

    /**
     * Dành cho Collector / Planner: trả danh sách MCP Server đã AUTHORIZED và có ít nhất 1 action.
     * Nếu môi trường unit test chưa khởi tạo Express/DataSource thì trả mảng rỗng an toàn.
     */
    async listAuthorizedMcpServersForPlanner(workspaceId: string): Promise<McpServerRef[]> {
        if (!workspaceId) return []
        try {
            const servers = await this.listWorkspaceMcpServers(workspaceId)
            return servers
                .filter((server) => server.status === 'AUTHORIZED' && server.actions.length > 0)
                .map((server) => ({
                    id: server.id,
                    name: server.name,
                    actions: server.actions.map((action) => action.name),
                    description: server.actions
                        .slice(0, 8)
                        .map((action) => (action.description ? `${action.name} (${action.description.slice(0, 80)})` : action.name))
                        .join('; ')
                        .slice(0, 500)
                }))
        } catch {
            return []
        }
    }

    /**
     * Đăng ký và xác thực (discover tools) ngay lập tức một MCP Server cho Workspace.
     * Nếu kết nối/handshake thất bại sẽ dọn bản ghi lỗi và trả thông báo tiếng Việt rõ ràng.
     */
    async registerWorkspaceMcpServer(
        workspaceId: string,
        orgId: string,
        input: RegisterWorkspaceMcpServerInput
    ): Promise<WorkspaceMcpServerSummary> {
        const name = typeof input?.name === 'string' ? input.name.trim() : ''
        const serverUrl = typeof input?.serverUrl === 'string' ? input.serverUrl.trim() : ''

        if (!name || name.length > 120 || containsScriptTag(name)) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Tên MCP Server không hợp lệ (tối đa 120 ký tự)')
        }
        if (!serverUrl || serverUrl.length > 2048 || containsScriptTag(serverUrl)) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'URL MCP Server không hợp lệ')
        }

        const mergedHeaders: Record<string, string> = {}
        if (input?.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)) {
            for (const [key, value] of Object.entries(input.headers)) {
                const cleanKey = key.trim()
                const cleanVal = typeof value === 'string' ? value.trim() : ''
                if (cleanKey && cleanVal) {
                    mergedHeaders[cleanKey] = cleanVal
                }
            }
        }
        if (typeof input?.bearerToken === 'string' && input.bearerToken.trim()) {
            const rawToken = input.bearerToken.trim()
            mergedHeaders.Authorization = /^Bearer\s+/i.test(rawToken) ? rawToken : `Bearer ${rawToken}`
        }

        const { default: customMcpServersService } = await import('../../custom-mcp-servers')
        const hasHeaders = Object.keys(mergedHeaders).length > 0
        const created = await customMcpServersService.createCustomMcpServer(
            {
                name,
                serverUrl,
                workspaceId,
                authType: hasHeaders ? CustomMcpServerAuthType.CUSTOM_HEADERS : CustomMcpServerAuthType.NONE,
                authConfig: hasHeaders ? { headers: mergedHeaders } : null
            },
            orgId
        )

        try {
            await customMcpServersService.authorizeCustomMcpServer(created.id, workspaceId)
        } catch (error) {
            try {
                await customMcpServersService.deleteCustomMcpServer(created.id, workspaceId)
            } catch {
                // ignore cleanup failure
            }
            throw new InternalFlowiseError(
                StatusCodes.BAD_REQUEST,
                `Không kết nối hoặc lấy được danh sách công cụ từ MCP Server "${name}": ${getErrorMessage(error)}`
            )
        }

        const servers = await this.listWorkspaceMcpServers(workspaceId)
        const found = servers.find((item) => item.id === created.id)
        if (!found) {
            throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, 'Không đọc lại được thông tin MCP Server vừa tạo')
        }
        if (found.actions.length === 0) {
            await customMcpServersService.deleteCustomMcpServer(created.id, workspaceId)
            throw new InternalFlowiseError(
                StatusCodes.BAD_REQUEST,
                `MCP Server "${name}" kết nối thành công nhưng không công bố công cụ (tool) nào để gắn vào Agent.`
            )
        }
        return found
    }

    /**
     * Làm mới (re-discover) danh sách công cụ từ MCP Server đã đăng ký trong Workspace.
     */
    async refreshWorkspaceMcpServer(id: string, workspaceId: string): Promise<WorkspaceMcpServerSummary> {
        if (!id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Thiếu ID MCP Server')
        }
        const { default: customMcpServersService } = await import('../../custom-mcp-servers')
        await customMcpServersService.authorizeCustomMcpServer(id, workspaceId)
        const servers = await this.listWorkspaceMcpServers(workspaceId)
        const found = servers.find((item) => item.id === id)
        if (!found) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Không tìm thấy MCP Server trong Workspace hiện tại')
        }
        return found
    }

    /**
     * Xóa MCP Server khỏi Workspace hiện tại.
     */
    async deleteWorkspaceMcpServer(id: string, workspaceId: string): Promise<{ deleted: boolean }> {
        if (!id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Thiếu ID MCP Server')
        }
        const { default: customMcpServersService } = await import('../../custom-mcp-servers')
        const result = await customMcpServersService.deleteCustomMcpServer(id, workspaceId)
        return { deleted: Boolean(result?.affected && result.affected > 0) }
    }
}

export default new WorkspaceMcpRegistryService()
