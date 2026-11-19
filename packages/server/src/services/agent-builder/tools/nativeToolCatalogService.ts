import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { randomUUID } from 'crypto'
import { read as readXlsx, utils as xlsxUtils } from 'xlsx'
import { StatusCodes } from 'http-status-codes'
import { Credential } from '../../../database/entities/Credential'
import { InternalFlowiseError } from '../../../errors/internalFlowiseError'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_OFFICE_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_ZIP_EXPANDED_BYTES = 25 * 1024 * 1024

export interface UploadedOfficeFileSummary {
    fileId: string
    fileName: string
    ext: 'xlsx' | 'docx'
    sizeBytes: number
    downloadUrl: string
    sheetNames?: string[]
    totalRows?: number
    paragraphCount?: number
    uploadedAt: string
}

export interface NativeToolDefinition {
    nodeName: string
    labelVi: string
    descriptionVi: string
    requiresCredential: boolean
    credentialNames?: string[]
    defaultConfig?: Record<string, unknown>
    keywords: RegExp
}

export interface WorkspaceNativeToolSummary {
    nodeName: string
    label: string
    description: string
    requiresCredential: boolean
    credentialNames: string[]
    ready: boolean
    credentialId?: string
    defaultConfig: Record<string, unknown>
}

export const CURATED_NATIVE_FLOWISE_TOOLS: ReadonlyArray<NativeToolDefinition> = [
    {
        nodeName: 'helpdeskTicketTool',
        labelVi: 'Quản lý Ticket CSKH / Helpdesk (L3)',
        descriptionVi:
            'Tạo phiếu yêu cầu hỗ trợ CSKH (TCK-...) kèm ngữ cảnh hội thoại, chống trùng lặp, tự phân nhóm phụ trách theo danh mục, tính hạn SLA và tra cứu/cập nhật trạng thái phiếu',
        requiresCredential: false,
        defaultConfig: {},
        keywords:
            /ticket|phiếu\s*hỗ\s*trợ|yêu\s*cầu\s*hỗ\s*trợ|helpdesk|cskh|chăm\s*sóc\s*khách\s*hàng|khiếu\s*nại|báo\s*lỗi|chuyển\s*người\s*xử\s*lý|\bl3\b/i
    },
    {
        nodeName: 'projectTrackerTool',
        labelVi: 'Quản lý Task Dự án (GitHub Issues / Trello / Board nội bộ)',
        descriptionVi:
            'Tạo & chia nhỏ task (chống trùng lặp, tự đồng bộ GitHub Issues/Trello có retry), cân bằng khối lượng thành viên, giao việc sau xác nhận, kiểm tra task quá hạn/bị chặn, phát hiện rủi ro trễ deadline và dời deadline có xác nhận',
        requiresCredential: false,
        credentialNames: ['githubApi'],
        defaultConfig: {},
        keywords: /dự\s*án|task|công\s*việc|giao\s*việc|tiến\s*độ|deadline|quá\s*hạn|rủi\s*ro|trello|github\s*issues?|sprint|kanban/i
    },
    {
        nodeName: 'telegramNotifyTool',
        labelVi: 'Telegram Bot (Gửi Báo cáo & Cảnh báo)',
        descriptionVi: 'Gửi báo cáo tiến độ hằng ngày, cảnh báo rủi ro và thông báo tự động qua Telegram Bot API (kèm retry & Outbox)',
        requiresCredential: false,
        defaultConfig: {},
        keywords: /telegram|gửi\s*báo\s*cáo|thông\s*báo\s*tự\s*động|cảnh\s*báo/i
    },
    {
        nodeName: 'excelOfficeTool',
        labelVi: 'Excel Bảng tính Nội bộ (.xlsx)',
        descriptionVi: 'Tạo mới nhiều sheet, đọc dữ liệu và thêm dòng trực tiếp vào file Excel (.xlsx), trả link tải về ngay trong chat',
        requiresCredential: false,
        defaultConfig: {},
        keywords: /excel|xlsx|bảng\s*tính|trang\s*tính|sheet|cột|dòng|thống\s*kê|báo\s*cáo\s*số\s*liệu|csv/i
    },
    {
        nodeName: 'wordOfficeTool',
        labelVi: 'Word Văn bản Nội bộ (.docx)',
        descriptionVi:
            'Soạn thảo, đọc và nối thêm đề mục/bảng biểu trực tiếp vào file Microsoft Word (.docx), trả link tải về ngay trong chat',
        requiresCredential: false,
        defaultConfig: {},
        keywords: /word|docx|văn\s*bản|hợp\s*đồng|biên\s*bản|công\s*văn|đơn\s*từ|soạn\s*file|xuất\s*file/i
    },
    {
        nodeName: 'calculator',
        labelVi: 'Máy tính Toán học (Calculator)',
        descriptionVi: 'Tính toán chính xác các phép tính số học, tỷ lệ phần trăm, chiết khấu, thuế và công thức',
        requiresCredential: false,
        defaultConfig: {},
        keywords: /tính\s*toán|máy\s*tính|calculator|công\s*thức|lãi\s*suất|thuế|chiết\s*khấu|tổng\s*tiền/i
    },
    {
        nodeName: 'currentDateTime',
        labelVi: 'Ngày giờ Hệ thống (CurrentDateTime)',
        descriptionVi: 'Lấy ngày giờ, thứ trong tuần và múi giờ thực tế hiện tại',
        requiresCredential: false,
        defaultConfig: {},
        keywords: /ngày\s*giờ|hôm\s*nay|thời\s*gian\s*hiện\s*tại|múi\s*giờ|deadline|hạn\s*chót/i
    },
    {
        nodeName: 'webScraperTool',
        labelVi: 'Thu thập Trang Web (Web Scraper)',
        descriptionVi: 'Đọc và bóc tách nội dung bài viết từ URL website được cung cấp',
        requiresCredential: false,
        defaultConfig: { maxDepth: 1, maxPages: 5 },
        keywords: /scrape|cào\s*web|đọc\s*(?:trang\s*)?web|đọc\s*link|đọc\s*url|trích\s*xuất\s*website/i
    },
    {
        nodeName: 'arxiv',
        labelVi: 'Tra cứu Học thuật Arxiv',
        descriptionVi: 'Tìm kiếm bài báo nghiên cứu khoa học trên kho Arxiv',
        requiresCredential: false,
        defaultConfig: {},
        keywords: /arxiv|bài\s*báo\s*khoa\s*học|nghiên\s*cứu\s*học\s*thuật|paper/i
    },
    {
        nodeName: 'jsonPathExtractor',
        labelVi: 'Trích xuất JSONPath',
        descriptionVi: 'Trích xuất chính xác trường dữ liệu từ cấu trúc JSON lớn',
        requiresCredential: false,
        defaultConfig: {},
        keywords: /jsonpath|bóc\s*tách\s*json/i
    },
    {
        nodeName: 'googleSheetsTool',
        labelVi: 'Google Sheets (Đám mây)',
        descriptionVi: 'Đọc, cập nhật và thêm dòng trực tiếp trên bảng tính Google Sheets online (cần Credential googleSheetsOAuth2)',
        requiresCredential: true,
        credentialNames: ['googleSheetsOAuth2'],
        defaultConfig: {
            sheetsType: 'values',
            valuesActions: '["getValues","updateValues","appendValues"]'
        },
        keywords: /google\s*sheets?|gg\s*sheets?|trang\s*tính\s*google/i
    },
    {
        nodeName: 'googleDriveTool',
        labelVi: 'Google Drive (Đám mây)',
        descriptionVi: 'Tìm kiếm, liệt kê, tải và tạo tệp trên Google Drive (cần Credential googleDriveOAuth2)',
        requiresCredential: true,
        credentialNames: ['googleDriveOAuth2'],
        defaultConfig: {
            driveType: 'file',
            fileActions: '["listFiles","getFile","createFile","downloadFile"]'
        },
        keywords: /google\s*drive|gg\s*drive|kho\s*drive|thư\s*mục\s*drive/i
    },
    {
        nodeName: 'googleDocsTool',
        labelVi: 'Google Docs (Đám mây)',
        descriptionVi: 'Tạo, đọc và cập nhật tài liệu Google Docs online (cần Credential googleDocsOAuth2)',
        requiresCredential: true,
        credentialNames: ['googleDocsOAuth2'],
        defaultConfig: {
            actions: '["createDocument","getDocument","insertText","appendText"]'
        },
        keywords: /google\s*docs?|gg\s*docs?/i
    },
    {
        nodeName: 'gmail',
        labelVi: 'Gmail',
        descriptionVi: 'Đọc thư đến, tìm kiếm và gửi email qua tài khoản Gmail (cần Credential gmailOAuth2)',
        requiresCredential: true,
        credentialNames: ['gmailOAuth2'],
        defaultConfig: {
            gmailType: 'messages',
            messageActions: '["listMessages","getMessage","sendMessage"]'
        },
        keywords: /gmail|gửi\s*mail|gửi\s*email|hộp\s*thư/i
    },
    {
        nodeName: 'googleCalendarTool',
        labelVi: 'Google Calendar',
        descriptionVi: 'Kiểm tra lịch trống và đặt lịch họp trên Google Calendar (cần Credential googleCalendarOAuth2)',
        requiresCredential: true,
        credentialNames: ['googleCalendarOAuth2'],
        defaultConfig: {
            calendarType: 'event',
            eventActions: '["listEvents","createEvent","quickAddEvent"]'
        },
        keywords: /google\s*calendar|lịch\s*họp|đặt\s*lịch|sự\s*kiện\s*lịch/i
    },
    {
        nodeName: 'microsoftOutlook',
        labelVi: 'Microsoft Outlook',
        descriptionVi: 'Đọc/gửi email và quản lý lịch Microsoft Outlook (cần Credential microsoftOutlookOAuth2)',
        requiresCredential: true,
        credentialNames: ['microsoftOutlookOAuth2'],
        defaultConfig: {
            outlookType: 'message',
            messageActions: '["listMessages","getMessage","sendMail"]'
        },
        keywords: /outlook|microsoft\s*mail/i
    },
    {
        nodeName: 'microsoftTeams',
        labelVi: 'Microsoft Teams',
        descriptionVi: 'Gửi và đọc tin nhắn trên kênh/nhóm Microsoft Teams (cần Credential microsoftTeamsOAuth2)',
        requiresCredential: true,
        credentialNames: ['microsoftTeamsOAuth2'],
        defaultConfig: {
            teamsType: 'chatMessage',
            chatMessageActions: '["sendChatMessage","listChatMessages"]'
        },
        keywords: /microsoft\s*teams|\bteams\b/i
    },
    {
        nodeName: 'jiraTool',
        labelVi: 'Atlassian Jira',
        descriptionVi: 'Tra cứu, tạo mới và cập nhật issue trên Jira (cần Credential jiraApi)',
        requiresCredential: true,
        credentialNames: ['jiraApi', 'jiraApiBearerToken'],
        defaultConfig: {
            jiraType: 'issues',
            issueActions: '["listIssues","getIssue","createIssue","updateIssue"]'
        },
        keywords: /\bjira\b|atlassian/i
    },
    {
        nodeName: 'tavilyAPI',
        labelVi: 'Tavily AI Search',
        descriptionVi: 'Tìm kiếm thông tin thời gian thực trên Internet qua Tavily (cần Credential tavilyApi)',
        requiresCredential: true,
        credentialNames: ['tavilyApi'],
        defaultConfig: {},
        keywords: /tavily|tìm\s*kiếm\s*internet/i
    },
    {
        nodeName: 'braveSearchAPI',
        labelVi: 'Brave Web Search',
        descriptionVi: 'Tìm kiếm web qua Brave Search API (cần Credential braveSearchApi)',
        requiresCredential: true,
        credentialNames: ['braveSearchApi'],
        defaultConfig: {},
        keywords: /brave\s*search/i
    },
    {
        nodeName: 'serper',
        labelVi: 'Google Serper Search',
        descriptionVi: 'Tìm kiếm kết quả Google qua Serper API (cần Credential serperApi)',
        requiresCredential: true,
        credentialNames: ['serperApi'],
        defaultConfig: {},
        keywords: /serper/i
    },
    {
        nodeName: 'exaSearch',
        labelVi: 'Exa Neural Search',
        descriptionVi: 'Tìm kiếm ngữ nghĩa chuyên sâu trên web qua Exa (cần Credential exaSearchApi)',
        requiresCredential: true,
        credentialNames: ['exaSearchApi'],
        defaultConfig: {},
        keywords: /\bexa\b/i
    },
    {
        nodeName: 'stripeTool',
        labelVi: 'Stripe Payments',
        descriptionVi: 'Tra cứu khách hàng, đơn thanh toán và hóa đơn trên Stripe (cần Credential stripeApi)',
        requiresCredential: true,
        credentialNames: ['stripeApi'],
        defaultConfig: {},
        keywords: /\bstripe\b|thanh\s*toán\s*stripe/i
    },
    {
        nodeName: 'codeInterpreterE2B',
        labelVi: 'E2B Python Code Interpreter',
        descriptionVi: 'Thực thi mã Python phân tích dữ liệu trong môi trường cô lập E2B (cần Credential E2BApi)',
        requiresCredential: true,
        credentialNames: ['E2BApi'],
        defaultConfig: {},
        keywords: /python|code\s*interpreter|e2b/i
    },
    {
        nodeName: 'sequentialThinkingMCP',
        labelVi: 'Sequential Thinking (Tư duy Phân rã Từng bước)',
        descriptionVi: 'Node MCP nội bộ giúp Agent lập luận, phân rã bài toán phức tạp và kiểm tra logic nhiều bước',
        requiresCredential: false,
        defaultConfig: { mcpActions: '["sequentialthinking"]' },
        keywords: /phân\s*tích|chia\s*nhỏ|lập\s*kế\s*hoạch|suy\s*luận|sequential/i
    },
    {
        nodeName: 'githubMCP',
        labelVi: 'GitHub MCP (Issues / PR / Repo)',
        descriptionVi: 'Tương tác trực tiếp GitHub Issues, Pull Requests và Repository qua GitHub MCP (cần Credential githubApi)',
        requiresCredential: true,
        credentialNames: ['githubApi'],
        defaultConfig: {
            mcpActions: '["create_issue","list_issues","get_issue","update_issue","add_issue_comment","search_issues"]'
        },
        keywords: /\bgithub\b|pull\s*request|\bpr\b|repo/i
    },
    {
        nodeName: 'slackMCP',
        labelVi: 'Slack MCP',
        descriptionVi: 'Đọc kênh và gửi tin nhắn/báo cáo qua Slack (cần Credential slackOAuth2 hoặc slackApi)',
        requiresCredential: true,
        credentialNames: ['slackOAuth2', 'slackApi'],
        defaultConfig: {
            mcpActions: '["slack_list_channels","slack_post_message","slack_reply_to_thread","slack_get_channel_history"]'
        },
        keywords: /\bslack\b/i
    },
    {
        nodeName: 'postgreSQLMCP',
        labelVi: 'PostgreSQL MCP',
        descriptionVi: 'Truy vấn cơ sở dữ liệu PostgreSQL trực tiếp qua MCP (cần Credential PostgresUrl)',
        requiresCredential: true,
        credentialNames: ['PostgresUrl'],
        defaultConfig: { mcpActions: '["query"]' },
        keywords: /postgres|postgresql|cơ\s*sở\s*dữ\s*liệu|sql/i
    },
    {
        nodeName: 'pipedreamMCP',
        labelVi: 'Pipedream MCP (2500+ ứng dụng: Trello, Telegram, Notion, Linear...)',
        descriptionVi: 'Cổng kết nối hơn 2500 ứng dụng SaaS qua Pipedream MCP (cần Credential pipedreamOAuthApi)',
        requiresCredential: true,
        credentialNames: ['pipedreamOAuthApi'],
        defaultConfig: {},
        keywords: /pipedream|notion|linear|asana|hubspot/i
    },
    {
        nodeName: 'wolframAlpha',
        labelVi: 'WolframAlpha',
        descriptionVi: 'Tính toán khoa học, toán học và dữ liệu tri thức WolframAlpha (cần Credential wolframAlphaAppId)',
        requiresCredential: true,
        credentialNames: ['wolframAlphaAppId'],
        defaultConfig: {},
        keywords: /wolfram/i
    },
    {
        nodeName: 'googleSearchAPI',
        labelVi: 'Google Custom Search',
        descriptionVi: 'Tìm kiếm web qua Google Custom Search API (cần Credential googleCustomSearchApi)',
        requiresCredential: true,
        credentialNames: ['googleCustomSearchApi'],
        defaultConfig: {},
        keywords: /google\s*search/i
    },
    {
        nodeName: 'serpAPI',
        labelVi: 'SerpAPI Search',
        descriptionVi: 'Tra cứu kết quả tìm kiếm trực tuyến qua SerpAPI (cần Credential serpApi)',
        requiresCredential: true,
        credentialNames: ['serpApi'],
        defaultConfig: {},
        keywords: /serpapi/i
    }
]

const SKIP_DYNAMIC_NODES = new Set([
    'customTool',
    'chainTool',
    'chatflowTool',
    'agentAsTool',
    'retrieverTool',
    'documentStoreTool',
    'customMcpServerTool',
    'webBrowser',
    'openAPIToolkit',
    'composio',
    'queryEngineTool',
    'requestsGet',
    'requestsPost',
    'requestsPut',
    'requestsDelete'
])

function sanitizeWorkspaceSegment(workspaceId?: string): string {
    const cleaned = (workspaceId || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    return cleaned.slice(0, 80) || 'default'
}

function decodeUploadedFilename(rawName?: string): string {
    const trimmed = String(rawName || '').trim()
    if (!trimmed) return ''
    try {
        // Multer parses HTTP multipart filenames as latin1; recover UTF-8 Vietnamese filenames safely.
        const decoded = Buffer.from(trimmed, 'latin1').toString('utf8')
        if (decoded && !decoded.includes('\uFFFD') && decoded !== trimmed) {
            return decoded
        }
    } catch {
        // Keep original
    }
    return trimmed
}

function sanitizeOfficeFileName(rawName: string, ext: 'xlsx' | 'docx'): string {
    const base = path
        .basename(decodeUploadedFilename(rawName))
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\.+/g, '.')
        .slice(0, 120)
    const stripped = base.replace(/\.(xlsx|xls|docx|doc)$/i, '').trim() || (ext === 'xlsx' ? 'bang-tinh' : 'tai-lieu')
    return `${stripped}.${ext}`
}

function validateZipArchiveBounds(buffer: Buffer): void {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
        throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Tệp không đúng định dạng Office (.xlsx / .docx) hợp lệ')
    }
    let expanded = 0
    for (let offset = 0; offset + 46 <= buffer.length; offset++) {
        if (buffer.readUInt32LE(offset) === 0x02014b50) {
            expanded += buffer.readUInt32LE(offset + 24)
            if (expanded > MAX_ZIP_EXPANDED_BYTES) {
                throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Dung lượng giải nén tệp Office vượt giới hạn an toàn (25 MB)')
            }
        }
    }
}

function extractZipEntryText(buffer: Buffer, targetEntryName: string): string | null {
    for (let offset = 0; offset + 46 <= buffer.length; offset++) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) continue
        const method = buffer.readUInt16LE(offset + 10)
        const compressedSize = buffer.readUInt32LE(offset + 20)
        const uncompressedSize = buffer.readUInt32LE(offset + 24)
        const nameLen = buffer.readUInt16LE(offset + 28)
        const localOffset = buffer.readUInt32LE(offset + 42)
        if (offset + 46 + nameLen > buffer.length) continue
        const entryName = buffer.toString('utf8', offset + 46, offset + 46 + nameLen)
        if (entryName !== targetEntryName) continue
        if (uncompressedSize > MAX_ZIP_EXPANDED_BYTES) return null
        if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) return null
        const localNameLen = buffer.readUInt16LE(localOffset + 26)
        const localExtraLen = buffer.readUInt16LE(localOffset + 28)
        const dataStart = localOffset + 30 + localNameLen + localExtraLen
        const dataEnd = dataStart + compressedSize
        if (dataEnd > buffer.length) return null
        const slice = buffer.subarray(dataStart, dataEnd)
        if (method === 0) return slice.toString('utf8')
        if (method === 8) return zlib.inflateRawSync(slice).toString('utf8')
        return null
    }
    return null
}

function decodeXmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
}

function extractDocxParagraphs(buffer: Buffer): string[] {
    const xml = extractZipEntryText(buffer, 'word/document.xml')
    if (!xml) return []
    const paragraphs: string[] = []
    const pMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || []
    for (const pXml of pMatches) {
        const texts = Array.from(pXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map((m) => decodeXmlEntities(m[1]))
        const line = texts.join('').replace(/\s+/g, ' ').trim()
        if (line) paragraphs.push(line)
    }
    return paragraphs.slice(0, 500)
}

export function getExportStorageBaseDir(): string {
    return process.env.BLOB_STORAGE_PATH ? path.join(process.env.BLOB_STORAGE_PATH) : path.join(os.homedir(), '.flowise', 'storage')
}

export class NativeToolCatalogService {
    /**
     * Liệt kê danh mục đầy đủ các Node công cụ gốc của Flowise kèm trạng thái kết nối Credential theo Workspace.
     * Trong môi trường unit test độc lập không có Express/DataSource, trả về bản offline an toàn (sẵn sàng mọi tool nội bộ không cần key).
     */
    async listWorkspaceNativeTools(workspaceId: string): Promise<WorkspaceNativeToolSummary[]> {
        const credentialByName = new Map<string, string>()
        let dynamicNodes: Record<string, any> = {}

        if (workspaceId) {
            try {
                const { getRunningExpressApp } = await import('../../../utils/getRunningExpressApp')
                const appServer = getRunningExpressApp()
                dynamicNodes = appServer.nodesPool?.componentNodes || {}
                const creds = await appServer.AppDataSource.getRepository(Credential).find({
                    where: { workspaceId },
                    order: { updatedDate: 'DESC' }
                })
                for (const cred of creds) {
                    if (cred.credentialName && !credentialByName.has(cred.credentialName)) {
                        credentialByName.set(cred.credentialName, cred.id)
                    }
                }
            } catch {
                // Offline / unit test fallback: no DB credentials loaded
            }
        }

        const results: WorkspaceNativeToolSummary[] = []
        const seen = new Set<string>()

        for (const def of CURATED_NATIVE_FLOWISE_TOOLS) {
            seen.add(def.nodeName)
            const matchedCredId = (def.credentialNames || []).map((cName) => credentialByName.get(cName)).find(Boolean)
            const ready = !def.requiresCredential || Boolean(matchedCredId)
            results.push({
                nodeName: def.nodeName,
                label: def.labelVi,
                description: def.descriptionVi,
                requiresCredential: def.requiresCredential,
                credentialNames: def.credentialNames || [],
                ready,
                ...(matchedCredId ? { credentialId: matchedCredId } : {}),
                defaultConfig: {
                    ...(def.defaultConfig || {}),
                    ...(matchedCredId ? { FLOWISE_CREDENTIAL_ID: matchedCredId } : {})
                }
            })
        }

        // Quét động thêm các node công cụ khác trong NodesPool của Flowise
        for (const [nodeName, nodeInstance] of Object.entries(dynamicNodes)) {
            if (seen.has(nodeName) || SKIP_DYNAMIC_NODES.has(nodeName)) continue
            if (!['Tools', 'Tools (MCP)'].includes(nodeInstance?.category)) continue
            if (Array.isArray(nodeInstance?.tags) && nodeInstance.tags.includes('LlamaIndex')) continue

            const credNames: string[] = Array.isArray(nodeInstance?.credential?.credentialNames)
                ? nodeInstance.credential.credentialNames
                : []
            const requiresCredential = credNames.length > 0 && !nodeInstance?.credential?.optional
            const matchedCredId = credNames.map((cName) => credentialByName.get(cName)).find(Boolean)
            // Kiểm tra không có tham số bắt buộc phức tạp chưa điền
            const hasRequiredUnsetInputs = Array.isArray(nodeInstance?.inputs)
                ? nodeInstance.inputs.some((inp: any) => !inp.optional && inp.default === undefined)
                : false
            if (hasRequiredUnsetInputs) continue

            results.push({
                nodeName,
                label: String(nodeInstance.label || nodeName),
                description: String(nodeInstance.description || nodeName).slice(0, 200),
                requiresCredential,
                credentialNames: credNames,
                ready: !requiresCredential || Boolean(matchedCredId),
                ...(matchedCredId ? { credentialId: matchedCredId } : {}),
                defaultConfig: matchedCredId ? { FLOWISE_CREDENTIAL_ID: matchedCredId } : {}
            })
        }

        return results
    }

    /**
     * Lọc gọn danh sách Node công cụ cho Planner (tiết kiệm token):
     * Luôn đưa toàn bộ tool đã sẵn sàng (ready=true, bao gồm Excel/Word nội bộ, Calculator, DateTime, WebScraper + các tool Google/MS đã có Credential),
     * cộng thêm các tool chưa gắn Credential nhưng khớp từ khóa yêu cầu của người dùng để Planner hướng dẫn chính xác.
     */
    async selectRelevantToolsForPlanner(
        workspaceId: string,
        message: string,
        existingNativeTools: string[] = []
    ): Promise<Array<{ nodeName: string; label: string; description: string; ready: boolean; missingCredential?: string }>> {
        const all = await this.listWorkspaceNativeTools(workspaceId)
        const existingSet = new Set(existingNativeTools)
        const curatedMap = new Map(CURATED_NATIVE_FLOWISE_TOOLS.map((d) => [d.nodeName, d]))

        return all
            .filter((item) => {
                if (item.ready || existingSet.has(item.nodeName)) return true
                const curated = curatedMap.get(item.nodeName)
                return curated ? curated.keywords.test(message) : false
            })
            .map((item) => ({
                nodeName: item.nodeName,
                label: item.label,
                description: item.description,
                ready: item.ready,
                ...(!item.ready && item.credentialNames.length ? { missingCredential: item.credentialNames[0] } : {})
            }))
    }

    /**
     * Lưu file Excel (.xlsx) hoặc Word (.docx) người dùng tải lên từ Chat Thử Nghiệm vào kho Workspace
     * để ExcelOfficeTool & WordOfficeTool đọc, tính toán, nối dòng/mục và xuất lại trực tiếp.
     */
    saveUploadedOfficeFile(
        workspaceId: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): UploadedOfficeFileSummary {
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Thiếu thông tin Workspace để tải tệp')
        }
        if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Tệp tải lên rỗng hoặc không hợp lệ')
        }
        if (file.buffer.length > MAX_OFFICE_UPLOAD_BYTES) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Mỗi tệp Excel/Word tải lên tối đa 10 MB')
        }

        const decodedName = decodeUploadedFilename(file.originalname)
        const rawExt = path.extname(decodedName).toLowerCase()
        if (rawExt !== '.xlsx' && rawExt !== '.docx') {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Chỉ hỗ trợ tải lên tệp Excel (.xlsx) và Word (.docx)')
        }
        const ext: 'xlsx' | 'docx' = rawExt === '.docx' ? 'docx' : 'xlsx'
        validateZipArchiveBounds(file.buffer)

        const safeWs = sanitizeWorkspaceSegment(workspaceId)
        const dir = path.join(getExportStorageBaseDir(), 'agent-builder-exports', safeWs)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        const fileId = randomUUID()
        const fileName = sanitizeOfficeFileName(decodedName, ext)
        const uploadedAt = new Date().toISOString()
        const targetPath = path.join(dir, `${fileId}.${ext}`)
        const metaPath = path.join(dir, `${fileId}.meta.json`)

        if (ext === 'xlsx') {
            let sheetNames: string[] = []
            let totalRows = 0
            try {
                const wb = readXlsx(file.buffer, { type: 'buffer' })
                sheetNames = wb.SheetNames || []
                for (const name of sheetNames) {
                    const rows = xlsxUtils.sheet_to_json(wb.Sheets[name], { header: 1 })
                    totalRows += rows.length
                }
            } catch {
                throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Không thể đọc cấu trúc bảng tính Excel (.xlsx) vừa tải lên')
            }
            if (sheetNames.length === 0) {
                throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Tệp Excel (.xlsx) không có sheet dữ liệu nào')
            }
            fs.writeFileSync(targetPath, file.buffer)
            const meta = {
                fileId,
                fileName,
                ext: 'xlsx',
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                workspaceId: safeWs,
                sheetNames,
                totalRows,
                uploaded: true,
                createdAt: uploadedAt
            }
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
            return {
                fileId,
                fileName,
                ext: 'xlsx',
                sizeBytes: file.buffer.length,
                downloadUrl: `/api/v1/agent-builder/exports/${fileId}/${encodeURIComponent(fileName)}`,
                sheetNames,
                totalRows,
                uploadedAt
            }
        }

        const paragraphs = extractDocxParagraphs(file.buffer)
        if (!extractZipEntryText(file.buffer, 'word/document.xml')) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Không thể đọc cấu trúc tài liệu Word (.docx) vừa tải lên')
        }
        fs.writeFileSync(targetPath, file.buffer)
        const title = fileName.replace(/\.docx$/i, '')
        const meta = {
            fileId,
            fileName,
            ext: 'docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            workspaceId: safeWs,
            title,
            sections: paragraphs.length > 0 ? [{ heading: 'Nội dung gốc', paragraphs }] : [],
            uploaded: true,
            createdAt: uploadedAt
        }
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
        return {
            fileId,
            fileName,
            ext: 'docx',
            sizeBytes: file.buffer.length,
            downloadUrl: `/api/v1/agent-builder/exports/${fileId}/${encodeURIComponent(fileName)}`,
            paragraphCount: paragraphs.length,
            uploadedAt
        }
    }

    /**
     * Liệt kê danh sách tệp Excel (.xlsx) và Word (.docx) đang có trong kho Workspace hiện tại.
     */
    listWorkspaceOfficeFiles(workspaceId: string): UploadedOfficeFileSummary[] {
        const safeWs = sanitizeWorkspaceSegment(workspaceId)
        const dir = path.join(getExportStorageBaseDir(), 'agent-builder-exports', safeWs)
        if (!fs.existsSync(dir)) return []
        const entries: UploadedOfficeFileSummary[] = []
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.meta.json')) continue
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
                if (meta?.workspaceId !== safeWs || (meta.ext !== 'xlsx' && meta.ext !== 'docx')) continue
                const binPath = path.join(dir, `${meta.fileId}.${meta.ext}`)
                if (!fs.existsSync(binPath)) continue
                entries.push({
                    fileId: meta.fileId,
                    fileName: meta.fileName,
                    ext: meta.ext,
                    sizeBytes: fs.statSync(binPath).size,
                    downloadUrl: `/api/v1/agent-builder/exports/${meta.fileId}/${encodeURIComponent(meta.fileName)}`,
                    ...(Array.isArray(meta.sheetNames) ? { sheetNames: meta.sheetNames } : {}),
                    ...(typeof meta.totalRows === 'number' ? { totalRows: meta.totalRows } : {}),
                    uploadedAt: meta.updatedAt || meta.createdAt || new Date().toISOString()
                })
            } catch {
                // Skip malformed metadata
            }
        }
        return entries.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    }

    /**
     * Phục vụ tải file xuất bản (.xlsx / .docx) an toàn, cách ly chặt theo workspaceId.
     */
    resolveExportedFileForDownload(workspaceId: string, fileId: string): { filePath: string; fileName: string; mimeType: string } {
        if (!UUID_RE.test(fileId)) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Mã file tải xuống không hợp lệ')
        }
        const safeWs = sanitizeWorkspaceSegment(workspaceId)
        const dir = path.join(getExportStorageBaseDir(), 'agent-builder-exports', safeWs)
        const metaPath = path.join(dir, `${fileId}.meta.json`)
        if (!fs.existsSync(metaPath)) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Không tìm thấy file xuất bản trong Workspace hiện tại')
        }
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        if (meta.workspaceId !== safeWs) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, 'Không có quyền truy cập file của Workspace khác')
        }
        const ext = meta.ext === 'docx' ? 'docx' : 'xlsx'
        const filePath = path.join(dir, `${fileId}.${ext}`)
        if (!fs.existsSync(filePath)) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Dữ liệu file xuất bản không còn tồn tại trên đĩa')
        }
        return {
            filePath,
            fileName: String(meta.fileName || `export.${ext}`),
            mimeType:
                meta.mimeType ||
                (ext === 'docx'
                    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        }
    }

    /**
     * Liệt kê toàn bộ phiếu hỗ trợ CSKH (Helpdesk Ticket L3) trong Workspace hiện tại cho Admin theo dõi.
     */
    listWorkspaceHelpdeskTickets(workspaceId: string): Array<Record<string, unknown>> {
        const safeWs = sanitizeWorkspaceSegment(workspaceId)
        const storePath = path.join(getExportStorageBaseDir(), 'agent-builder-helpdesk', safeWs, 'tickets.json')
        if (!fs.existsSync(storePath)) return []
        try {
            const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'))
            return Array.isArray(parsed?.tickets) ? parsed.tickets : []
        } catch {
            return []
        }
    }

    /**
     * Admin cập nhật trạng thái, nhóm phụ trách hoặc ghi chú phản hồi cho phiếu hỗ trợ CSKH trong Workspace.
     */
    updateWorkspaceHelpdeskTicket(
        workspaceId: string,
        ticketId: string,
        patch: { status?: string; assignedGroup?: string; note?: string; author?: string }
    ): Record<string, unknown> {
        const allowedStatuses = new Set(['Mới tiếp nhận', 'Đang xử lý', 'Chờ khách phản hồi', 'Đã giải quyết', 'Đã đóng'])
        if (patch.status && !allowedStatuses.has(patch.status)) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Trạng thái phiếu hỗ trợ không hợp lệ')
        }
        const safeWs = sanitizeWorkspaceSegment(workspaceId)
        const storePath = path.join(getExportStorageBaseDir(), 'agent-builder-helpdesk', safeWs, 'tickets.json')
        if (!fs.existsSync(storePath)) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Không tìm thấy phiếu hỗ trợ "${ticketId}"`)
        }
        const store = JSON.parse(fs.readFileSync(storePath, 'utf8'))
        const tickets: Array<Record<string, any>> = Array.isArray(store?.tickets) ? store.tickets : []
        const target = tickets.find(
            (t) =>
                String(t.ticketId || '').toUpperCase() ===
                String(ticketId || '')
                    .trim()
                    .toUpperCase()
        )
        if (!target) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Không tìm thấy phiếu hỗ trợ "${ticketId}" trong Workspace hiện tại`)
        }
        const now = new Date().toISOString()
        if (patch.status) target.status = patch.status
        if (typeof patch.assignedGroup === 'string' && patch.assignedGroup.trim()) {
            target.assignedGroup = patch.assignedGroup.trim().slice(0, 120)
        }
        if (typeof patch.note === 'string' && patch.note.trim()) {
            if (!Array.isArray(target.notes)) target.notes = []
            target.notes.push({
                at: now,
                author: (patch.author || 'Quản trị viên CSKH').slice(0, 80),
                content: patch.note.trim().slice(0, 2000)
            })
        }
        target.updatedAt = now
        fs.writeFileSync(storePath, JSON.stringify({ seq: store.seq || 1000, tickets }, null, 2), 'utf8')
        return target
    }
}

export default new NativeToolCatalogService()
