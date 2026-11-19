import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { tool, Tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'

function resolveBaseStoragePath(): string {
    return process.env.BLOB_STORAGE_PATH ? path.join(process.env.BLOB_STORAGE_PATH) : path.join(os.homedir(), '.flowise', 'storage')
}

export interface ProjectTaskItem {
    id: string
    code: string
    title: string
    description: string
    priority: 'P0' | 'P1' | 'P2' | 'P3'
    status: 'todo' | 'in_progress' | 'blocked' | 'done'
    progressPercent: number
    deadline: string
    assignee?: string
    acceptanceCriteria: string[]
    dependencies: string[]
    blockedReason?: string
    externalProvider?: 'github' | 'trello'
    externalId?: string
    externalUrl?: string
    createdAt: string
    updatedAt: string
}

export interface ProjectMemberItem {
    name: string
    role: string
    skills: string[]
    maxCapacity: number
}

export interface ProjectAuditEntry {
    id: string
    timestamp: string
    action: string
    detail: string
}

export interface ProjectBoardState {
    projectKey: string
    updatedAt: string
    members: ProjectMemberItem[]
    tasks: ProjectTaskItem[]
    logs: ProjectAuditEntry[]
}

const DEFAULT_TEAM_MEMBERS: ProjectMemberItem[] = [
    { name: 'Minh Anh', role: 'Frontend Developer', skills: ['React', 'UI/UX', 'HTML/CSS', 'OAuth Popup'], maxCapacity: 3 },
    { name: 'Hoàng Nam', role: 'Backend Developer', skills: ['Node.js', 'API', 'OAuth2', 'JWT', 'Database', 'Security'], maxCapacity: 3 },
    { name: 'Thu Hà', role: 'QA Automation Engineer', skills: ['Testing', 'E2E', 'Jest', 'Playwright', 'Nghiệm thu'], maxCapacity: 3 },
    { name: 'Đức Thịnh', role: 'DevOps / Tech Lead', skills: ['CI/CD', 'Docker', 'Cloud', 'Architecture', 'Deployment'], maxCapacity: 2 }
]

function sanitizeSegment(raw?: string, fallback = 'default'): string {
    const cleaned = (raw || fallback)
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 80)
    return cleaned || fallback
}

function normalizeTitleKey(title: string): string {
    return title
        .toLowerCase()
        .normalize('NFC')
        .replace(/[\s\-_.,:;!?()[\]{}'"]+/g, ' ')
        .trim()
}

function addDaysIso(isoDate: string, days: number): string {
    const parsed = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) {
        const fallback = new Date()
        fallback.setUTCDate(fallback.getUTCDate() + days)
        return fallback.toISOString().slice(0, 10)
    }
    parsed.setUTCDate(parsed.getUTCDate() + days)
    return parsed.toISOString().slice(0, 10)
}

function daysBetweenUtc(fromIso: string, toIso: string): number {
    const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime()
    const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime()
    if (Number.isNaN(a) || Number.isNaN(b)) return 999
    return Math.round((b - a) / 86_400_000)
}

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url, init)
            if (response.status === 429 || response.status >= 500) {
                lastError = new Error(`HTTP ${response.status}`)
                if (attempt < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, 300 * attempt))
                    continue
                }
            }
            return response
        } catch (err) {
            lastError = err
            if (attempt < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 300 * attempt))
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Lỗi kết nối API sau nhiều lần thử lại')
}

function loadBoardState(boardFilePath: string, projectKey: string): ProjectBoardState {
    if (fs.existsSync(boardFilePath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(boardFilePath, 'utf8'))
            if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.members)) {
                return {
                    projectKey: parsed.projectKey || projectKey,
                    updatedAt: parsed.updatedAt || new Date().toISOString(),
                    members: parsed.members,
                    tasks: parsed.tasks,
                    logs: Array.isArray(parsed.logs) ? parsed.logs : []
                }
            }
        } catch {
            // Recreate clean board if corrupted
        }
    }
    return {
        projectKey,
        updatedAt: new Date().toISOString(),
        members: [...DEFAULT_TEAM_MEMBERS],
        tasks: [],
        logs: []
    }
}

function saveBoardState(boardFilePath: string, state: ProjectBoardState, action: string, detail: string) {
    state.updatedAt = new Date().toISOString()
    state.logs.push({
        id: randomUUID(),
        timestamp: state.updatedAt,
        action,
        detail: detail.slice(0, 500)
    })
    if (state.logs.length > 200) state.logs = state.logs.slice(-200)
    fs.mkdirSync(path.dirname(boardFilePath), { recursive: true })
    fs.writeFileSync(boardFilePath, JSON.stringify(state, null, 2), 'utf8')
}

const CreateTasksSchema = z.object({
    projectKey: z.string().optional().default('default').describe('Mã dự án (mặc định: default)'),
    tasks: z
        .array(
            z.object({
                title: z.string().describe('Tiêu đề công việc ngắn gọn, rõ ràng'),
                description: z.string().describe('Mô tả chi tiết phạm vi kỹ thuật cần thực hiện'),
                priority: z
                    .enum(['P0', 'P1', 'P2', 'P3'])
                    .default('P1')
                    .describe('Độ ưu tiên: P0 (Khẩn cấp), P1 (Cao), P2 (Trung bình), P3 (Thấp)'),
                deadline: z.string().describe('Hạn hoàn thành định dạng YYYY-MM-DD'),
                acceptanceCriteria: z.array(z.string()).min(1).describe('Danh sách tiêu chí nghiệm thu cụ thể'),
                dependencies: z
                    .array(z.string())
                    .optional()
                    .default([])
                    .describe('Danh sách mã task (VD: TASK-1) hoặc tiêu đề task phải xong trước task này')
            })
        )
        .min(1)
        .max(20)
        .describe('Danh sách các task nhỏ đã phân rã (chưa gán người phụ trách nếu chưa được người dùng xác nhận)')
})

const ListMembersSchema = z.object({
    projectKey: z.string().optional().default('default').describe('Mã dự án'),
    candidateTaskIds: z
        .array(z.string())
        .optional()
        .describe('Danh sách mã task (VD: ["TASK-1","TASK-2"]) cần hệ thống gợi ý người phụ trách tối ưu theo vai trò & tải công việc')
})

const UpsertMembersSchema = z.object({
    projectKey: z.string().optional().default('default'),
    members: z
        .array(
            z.object({
                name: z.string(),
                role: z.string(),
                skills: z.array(z.string()).default([]),
                maxCapacity: z.number().int().min(1).max(20).default(3)
            })
        )
        .min(1)
})

const AssignTasksSchema = z.object({
    projectKey: z.string().optional().default('default'),
    confirmedByUser: z.boolean().describe('BẮT BUỘC là true chỉ khi người dùng đã nhắn tin đồng ý/xác nhận phương án giao việc'),
    assignments: z
        .array(
            z.object({
                taskCodeOrId: z.string().describe('Mã task (VD: TASK-1) hoặc ID task'),
                assignee: z.string().describe('Tên thành viên nhận việc')
            })
        )
        .min(1)
})

const UpdateTaskStatusSchema = z.object({
    projectKey: z.string().optional().default('default'),
    updates: z
        .array(
            z.object({
                taskCodeOrId: z.string().describe('Mã task (VD: TASK-1)'),
                status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
                progressPercent: z.number().int().min(0).max(100).optional(),
                blockedReason: z.string().optional().describe('Lý do bị chặn nếu status="blocked"')
            })
        )
        .min(1)
})

const CheckProgressSchema = z.object({
    projectKey: z.string().optional().default('default'),
    referenceDate: z.string().optional().describe('Ngày đối chiếu YYYY-MM-DD (bỏ trống để lấy ngày hiện tại của hệ thống)')
})

const ShiftDeadlinesSchema = z.object({
    projectKey: z.string().optional().default('default'),
    shiftDays: z.number().int().min(-90).max(90).describe('Số ngày cần dời (ví dụ: 3 để lùi thêm 3 ngày, -2 để đẩy sớm 2 ngày)'),
    taskCodesOrIds: z
        .array(z.string())
        .optional()
        .describe('Danh sách mã task cụ thể cần dời (bỏ trống nếu dời toàn bộ các task chưa hoàn thành của dự án)'),
    dryRun: z
        .boolean()
        .default(true)
        .describe(
            'Đặt true để chỉ phân tích tác động & trình phương án chờ người dùng xác nhận; chỉ đặt false SAU KHI người dùng đã xác nhận đồng ý thay đổi dữ liệu thật!'
        )
})

class ProjectTracker_Tools implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    credential: INodeParams
    inputs: INodeParams[]

    constructor() {
        this.label = 'Project Tracker (GitHub Issues / Trello / Board)'
        this.name = 'projectTrackerTool'
        this.version = 1.0
        this.type = 'ProjectTrackerTool'
        this.icon = 'project.svg'
        this.category = 'Tools'
        this.description =
            'Quản lý công việc dự án tự động: chia nhỏ & tạo task (chống trùng lặp, đồng bộ GitHub Issues / Trello), cân bằng khối lượng giao việc, kiểm tra tiến độ, phát hiện rủi ro trễ hạn và dời deadline có xác nhận'
        this.baseClasses = [this.type, 'Tool']
        this.credential = {
            label: 'Connect GitHub Credential (Optional)',
            name: 'credential',
            type: 'credential',
            credentialNames: ['githubApi'],
            optional: true
        }
        this.inputs = [
            {
                label: 'GitHub Repository (owner/repo)',
                name: 'githubRepo',
                type: 'string',
                placeholder: 'org/project-repo',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Trello API Key',
                name: 'trelloApiKey',
                type: 'password',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Trello Token',
                name: 'trelloToken',
                type: 'password',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Trello List ID',
                name: 'trelloListId',
                type: 'string',
                optional: true,
                additionalParams: true
            }
        ]
    }

    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<Tool[]> {
        const rawWorkspaceId =
            (options?.workspaceId as string | undefined) ??
            ((options?.searchOptions as ICommonObject | undefined)?.workspaceId as string | undefined) ??
            'default'
        const workspaceSegment = sanitizeSegment(rawWorkspaceId, 'default')
        const baseDir = path.join(resolveBaseStoragePath(), 'agent-builder-projects', workspaceSegment)

        if (nodeData.inputs?.credentialId && !nodeData.credential) {
            nodeData.credential = nodeData.inputs.credentialId as string
        }
        let githubToken = process.env.GITHUB_TOKEN || ''
        if (nodeData.credential) {
            try {
                const { getCredentialData, getCredentialParam } = await import('../../../src/utils')
                const credData = await getCredentialData(nodeData.credential, options)
                githubToken = getCredentialParam('accessToken', credData, nodeData) || githubToken
            } catch {
                // Fallback to local workspace board when credential cannot be decrypted in test
            }
        }
        const githubRepo = ((nodeData.inputs?.githubRepo as string) || process.env.GITHUB_REPO || '').trim()
        const trelloApiKey = ((nodeData.inputs?.trelloApiKey as string) || process.env.TRELLO_API_KEY || '').trim()
        const trelloToken = ((nodeData.inputs?.trelloToken as string) || process.env.TRELLO_TOKEN || '').trim()
        const trelloListId = ((nodeData.inputs?.trelloListId as string) || process.env.TRELLO_LIST_ID || '').trim()

        const getBoardPath = (projectKey?: string) => path.join(baseDir, `${sanitizeSegment(projectKey, 'default')}.board.json`)

        const findTask = (board: ProjectBoardState, codeOrId: string): ProjectTaskItem | undefined => {
            const needle = codeOrId.trim().toLowerCase()
            return board.tasks.find(
                (t) =>
                    t.code.toLowerCase() === needle ||
                    t.id.toLowerCase() === needle ||
                    normalizeTitleKey(t.title) === normalizeTitleKey(codeOrId)
            )
        }

        const createTasksTool = tool(
            async (input): Promise<string> => {
                const boardPath = getBoardPath(input.projectKey)
                const board = loadBoardState(boardPath, input.projectKey || 'default')
                const existingTitleKeys = new Set(board.tasks.map((t) => normalizeTitleKey(t.title)))

                const created: ProjectTaskItem[] = []
                const skippedDuplicates: Array<{ title: string; existingCode: string }> = []
                const syncWarnings: string[] = []

                for (const item of input.tasks) {
                    const normKey = normalizeTitleKey(item.title)
                    if (existingTitleKeys.has(normKey)) {
                        const existing = board.tasks.find((t) => normalizeTitleKey(t.title) === normKey)!
                        skippedDuplicates.push({ title: item.title, existingCode: existing.code })
                        continue
                    }
                    existingTitleKeys.add(normKey)
                    const nextIndex = board.tasks.length + 1
                    const code = `TASK-${nextIndex}`
                    const now = new Date().toISOString()
                    const newTask: ProjectTaskItem = {
                        id: randomUUID(),
                        code,
                        title: item.title.trim(),
                        description: item.description.trim(),
                        priority: item.priority,
                        status: 'todo',
                        progressPercent: 0,
                        deadline: item.deadline.slice(0, 10),
                        acceptanceCriteria: item.acceptanceCriteria,
                        dependencies: item.dependencies || [],
                        createdAt: now,
                        updatedAt: now
                    }

                    if (githubToken && /^[^/\s]+\/[^/\s]+$/.test(githubRepo)) {
                        try {
                            const bodyMd = [
                                item.description,
                                '',
                                `- **Priority:** ${item.priority}`,
                                `- **Deadline:** ${newTask.deadline}`,
                                ...(newTask.dependencies.length ? [`- **Dependencies:** ${newTask.dependencies.join(', ')}`] : []),
                                '',
                                '### Acceptance Criteria',
                                ...item.acceptanceCriteria.map((ac) => `- [ ] ${ac}`)
                            ].join('\n')
                            const ghRes = await fetchWithRetry(`https://api.github.com/repos/${githubRepo}/issues`, {
                                method: 'POST',
                                headers: {
                                    Authorization: `Bearer ${githubToken}`,
                                    Accept: 'application/vnd.github+json',
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    title: `[${code}] [${item.priority}] ${newTask.title}`,
                                    body: bodyMd
                                })
                            })
                            if (ghRes.ok) {
                                const ghJson: any = await ghRes.json()
                                newTask.externalProvider = 'github'
                                newTask.externalId = String(ghJson.number)
                                newTask.externalUrl = ghJson.html_url
                            } else {
                                syncWarnings.push(
                                    `GitHub Issues trả HTTP ${ghRes.status} cho ${code}; đã lưu an toàn vào Board dự án nội bộ.`
                                )
                            }
                        } catch (err: any) {
                            syncWarnings.push(
                                `Lỗi kết nối GitHub Issues cho ${code} (${err?.message || 'network'}); đã lưu vào Board nội bộ.`
                            )
                        }
                    } else if (trelloApiKey && trelloToken && trelloListId) {
                        try {
                            const params = new URLSearchParams({
                                idList: trelloListId,
                                key: trelloApiKey,
                                token: trelloToken,
                                name: `[${code}] [${item.priority}] ${newTask.title}`,
                                desc: `${item.description}\n\nTiêu chí nghiệm thu:\n- ${item.acceptanceCriteria.join('\n- ')}`,
                                due: `${newTask.deadline}T17:00:00.000Z`
                            })
                            const trRes = await fetchWithRetry(`https://api.trello.com/1/cards?${params.toString()}`, { method: 'POST' })
                            if (trRes.ok) {
                                const trJson: any = await trRes.json()
                                newTask.externalProvider = 'trello'
                                newTask.externalId = trJson.id
                                newTask.externalUrl = trJson.shortUrl || trJson.url
                            } else {
                                syncWarnings.push(`Trello API trả HTTP ${trRes.status} cho ${code}; đã lưu vào Board nội bộ.`)
                            }
                        } catch (err: any) {
                            syncWarnings.push(`Lỗi kết nối Trello cho ${code} (${err?.message || 'network'}); đã lưu vào Board nội bộ.`)
                        }
                    }

                    board.tasks.push(newTask)
                    created.push(newTask)
                }

                saveBoardState(
                    boardPath,
                    board,
                    'CREATE_TASKS',
                    `Tạo mới ${created.length} task (${created.map((t) => t.code).join(', ')}), bỏ qua ${
                        skippedDuplicates.length
                    } task trùng`
                )

                return JSON.stringify({
                    success: true,
                    syncMode:
                        githubToken && githubRepo
                            ? `GitHub Issues (${githubRepo})`
                            : trelloApiKey && trelloToken && trelloListId
                            ? 'Trello Board'
                            : 'Flowise Workspace Project Board (chưa cấu hình GitHub/Trello token ngoài)',
                    createdCount: created.length,
                    createdTasks: created,
                    skippedDuplicates,
                    syncWarnings
                })
            },
            {
                name: 'pm_create_tasks',
                description:
                    'Tạo các task công việc mới kèm mô tả, độ ưu tiên (P0-P3), deadline, tiêu chí nghiệm thu và phụ thuộc. Tự động chống tạo task trùng lặp và đồng bộ GitHub Issues / Trello nếu đã cấu hình.',
                schema: CreateTasksSchema
            }
        )

        const listMembersTool = tool(
            async (input): Promise<string> => {
                const boardPath = getBoardPath(input.projectKey)
                const board = loadBoardState(boardPath, input.projectKey || 'default')

                const memberWorkload = board.members.map((member) => {
                    const activeTasks = board.tasks.filter(
                        (t) => t.status !== 'done' && t.assignee?.toLowerCase() === member.name.toLowerCase()
                    )
                    return {
                        ...member,
                        activeTaskCount: activeTasks.length,
                        availableSlots: Math.max(0, member.maxCapacity - activeTasks.length),
                        activeTaskCodes: activeTasks.map((t) => t.code)
                    }
                })

                const targetTasks = input.candidateTaskIds?.length
                    ? input.candidateTaskIds.map((id) => findTask(board, id)).filter((t): t is ProjectTaskItem => Boolean(t))
                    : board.tasks.filter((t) => !t.assignee && t.status !== 'done')

                const simulatedLoad = new Map(memberWorkload.map((m) => [m.name, m.activeTaskCount]))
                const proposals = targetTasks.map((task) => {
                    const text = `${task.title} ${task.description}`.toLowerCase()
                    const ranked = [...memberWorkload].sort((a, b) => {
                        const scoreSkill = (m: typeof a) => {
                            const hay = `${m.role} ${m.skills.join(' ')}`.toLowerCase()
                            let s = 0
                            if (/giao diện|ui|ux|frontend|react|nút|màn hình/.test(text) && /frontend|ui/.test(hay)) s += 5
                            if (/oauth|backend|api|token|database|xử lý|server|bảo mật/.test(text) && /backend|security/.test(hay)) s += 5
                            if (/kiểm thử|test|qa|nghiệm thu|lỗi|bug/.test(text) && /qa|test/.test(hay)) s += 5
                            if (/deploy|ci\/cd|docker|hạ tầng|server/.test(text) && /devops|lead/.test(hay)) s += 5
                            return s
                        }
                        const diff = scoreSkill(b) - scoreSkill(a)
                        if (diff !== 0) return diff
                        return (simulatedLoad.get(a.name) || 0) - (simulatedLoad.get(b.name) || 0)
                    })
                    const chosen = ranked[0]
                    if (chosen) simulatedLoad.set(chosen.name, (simulatedLoad.get(chosen.name) || 0) + 1)
                    return {
                        taskCode: task.code,
                        title: task.title,
                        priority: task.priority,
                        recommendedAssignee: chosen?.name || 'Chưa có thành viên',
                        role: chosen?.role || '',
                        currentActiveTasksBeforeAssign: chosen?.activeTaskCount ?? 0
                    }
                })

                return JSON.stringify({
                    members: memberWorkload,
                    proposedAssignments: proposals,
                    confirmationRequiredNote:
                        'CHƯA GÁN DỮ LIỆU THẬT. Hãy trình bày đề xuất người phụ trách này và hỏi người dùng xác nhận trước khi gọi pm_assign_tasks.'
                })
            },
            {
                name: 'pm_list_members_and_propose',
                description:
                    'Lấy danh sách thành viên, vai trò, kỹ năng, khối lượng công việc hiện tại và đề xuất người phù hợp cho từng task (chưa ghi dữ liệu thật để chờ người dùng xác nhận).',
                schema: ListMembersSchema
            }
        )

        const upsertMembersTool = tool(
            async (input): Promise<string> => {
                const boardPath = getBoardPath(input.projectKey)
                const board = loadBoardState(boardPath, input.projectKey || 'default')
                for (const m of input.members) {
                    const idx = board.members.findIndex((existing) => existing.name.toLowerCase() === m.name.toLowerCase())
                    if (idx >= 0) board.members[idx] = m
                    else board.members.push(m)
                }
                saveBoardState(boardPath, board, 'UPSERT_MEMBERS', `Cập nhật ${input.members.length} thành viên dự án`)
                return JSON.stringify({ success: true, totalMembers: board.members.length, members: board.members })
            },
            {
                name: 'pm_upsert_members',
                description: 'Thêm hoặc cập nhật danh sách thành viên, vai trò và sức chứa công việc tối đa của dự án.',
                schema: UpsertMembersSchema
            }
        )

        const assignTasksTool = tool(
            async (input): Promise<string> => {
                if (!input.confirmedByUser) {
                    return JSON.stringify({
                        success: false,
                        error: 'Bị chặn theo chính sách an toàn: chỉ được gọi pm_assign_tasks với confirmedByUser=true sau khi người dùng đã xác nhận đồng ý giao việc!'
                    })
                }
                const boardPath = getBoardPath(input.projectKey)
                const board = loadBoardState(boardPath, input.projectKey || 'default')
                const assigned: Array<{ code: string; title: string; assignee: string }> = []
                const notFound: string[] = []

                for (const item of input.assignments) {
                    const task = findTask(board, item.taskCodeOrId)
                    if (!task) {
                        notFound.push(item.taskCodeOrId)
                        continue
                    }
                    task.assignee = item.assignee.trim()
                    if (task.status === 'todo') task.status = 'in_progress'
                    task.updatedAt = new Date().toISOString()
                    assigned.push({ code: task.code, title: task.title, assignee: task.assignee })
                }

                saveBoardState(
                    boardPath,
                    board,
                    'ASSIGN_TASKS',
                    `Đã giao ${assigned.length} task sau xác nhận: ${assigned.map((a) => `${a.code}->${a.assignee}`).join(', ')}`
                )

                return JSON.stringify({
                    success: true,
                    assignedCount: assigned.length,
                    assigned,
                    notFound
                })
            },
            {
                name: 'pm_assign_tasks',
                description: 'Thực hiện giao task chính thức cho thành viên SAU KHI người dùng đã xác nhận đồng ý.',
                schema: AssignTasksSchema
            }
        )

        const updateTaskStatusTool = tool(
            async (input): Promise<string> => {
                const boardPath = getBoardPath(input.projectKey)
                const board = loadBoardState(boardPath, input.projectKey || 'default')
                const updated: ProjectTaskItem[] = []
                for (const item of input.updates) {
                    const task = findTask(board, item.taskCodeOrId)
                    if (!task) continue
                    if (item.status) {
                        task.status = item.status
                        if (item.status === 'done') task.progressPercent = 100
                    }
                    if (typeof item.progressPercent === 'number') task.progressPercent = item.progressPercent
                    if (item.blockedReason !== undefined) task.blockedReason = item.blockedReason
                    task.updatedAt = new Date().toISOString()
                    updated.push(task)
                }
                saveBoardState(boardPath, board, 'UPDATE_STATUS', `Cập nhật tiến độ ${updated.length} task`)
                return JSON.stringify({ success: true, updatedCount: updated.length, updatedTasks: updated })
            },
            {
                name: 'pm_update_task_status',
                description: 'Cập nhật trạng thái (todo/in_progress/blocked/done), phần trăm tiến độ hoặc lý do bị chặn của các task.',
                schema: UpdateTaskStatusSchema
            }
        )

        const checkProgressAndRisksTool = tool(
            async (input): Promise<string> => {
                const boardPath = getBoardPath(input.projectKey)
                const board = loadBoardState(boardPath, input.projectKey || 'default')
                const today = (input.referenceDate || new Date().toISOString().slice(0, 10)).slice(0, 10)

                const activeByMember = new Map<string, number>()
                for (const t of board.tasks) {
                    if (t.status !== 'done' && t.assignee) {
                        activeByMember.set(t.assignee, (activeByMember.get(t.assignee) || 0) + 1)
                    }
                }

                const completedTasks = board.tasks.filter((t) => t.status === 'done')
                const incompleteTasks = board.tasks.filter((t) => t.status !== 'done')
                const overdueTasks = incompleteTasks
                    .filter((t) => daysBetweenUtc(today, t.deadline) < 0)
                    .map((t) => ({
                        code: t.code,
                        title: t.title,
                        deadline: t.deadline,
                        daysOverdue: Math.abs(daysBetweenUtc(today, t.deadline)),
                        assignee: t.assignee || 'Chưa phân công',
                        status: t.status,
                        progressPercent: t.progressPercent
                    }))

                const blockedTasks = incompleteTasks
                    .filter((t) => {
                        if (t.status === 'blocked') return true
                        return t.dependencies.some((dep) => {
                            const depTask = findTask(board, dep)
                            return depTask && depTask.status !== 'done'
                        })
                    })
                    .map((t) => {
                        const unmetDeps = t.dependencies
                            .map((dep) => findTask(board, dep))
                            .filter((depTask): depTask is ProjectTaskItem => Boolean(depTask && depTask.status !== 'done'))
                            .map((depTask) => `${depTask.code} (${depTask.status})`)
                        return {
                            code: t.code,
                            title: t.title,
                            assignee: t.assignee || 'Chưa phân công',
                            blockedReason:
                                t.blockedReason ||
                                (unmetDeps.length ? `Đang chờ task phụ thuộc hoàn thành: ${unmetDeps.join(', ')}` : 'Bị chặn'),
                            unmetDependencies: unmetDeps
                        }
                    })

                const risks = incompleteTasks
                    .map((t) => {
                        const daysLeft = daysBetweenUtc(today, t.deadline)
                        const reasons: string[] = []
                        let severity: 'HIGH' | 'MEDIUM' | null = null

                        if (daysLeft < 0) {
                            severity = 'HIGH'
                            reasons.push(`Đã quá hạn ${Math.abs(daysLeft)} ngày`)
                        } else if (daysLeft <= 2 && t.progressPercent < 70) {
                            severity = 'HIGH'
                            reasons.push(`Chỉ còn ${daysLeft} ngày đến hạn nhưng tiến độ mới đạt ${t.progressPercent}%`)
                        } else if (daysLeft <= 5 && t.progressPercent < 30) {
                            severity = 'MEDIUM'
                            reasons.push(`Còn ${daysLeft} ngày nhưng tiến độ thấp (${t.progressPercent}%)`)
                        }

                        const unmetDeps = t.dependencies
                            .map((dep) => findTask(board, dep))
                            .filter((depTask): depTask is ProjectTaskItem => Boolean(depTask && depTask.status !== 'done'))
                        if (unmetDeps.length > 0 && daysLeft <= 4) {
                            severity = severity || 'HIGH'
                            reasons.push(`Phụ thuộc chưa xong: ${unmetDeps.map((d) => d.code).join(', ')}`)
                        }

                        if (!t.assignee) {
                            severity = severity || 'MEDIUM'
                            reasons.push('Chưa có người phụ trách')
                        } else if ((activeByMember.get(t.assignee) || 0) > 3) {
                            severity = severity || 'MEDIUM'
                            reasons.push(`${t.assignee} đang quá tải (${activeByMember.get(t.assignee)} task mở cùng lúc)`)
                        }

                        return severity
                            ? {
                                  code: t.code,
                                  title: t.title,
                                  priority: t.priority,
                                  deadline: t.deadline,
                                  daysRemaining: daysLeft,
                                  assignee: t.assignee || 'Chưa phân công',
                                  severity,
                                  reasons
                              }
                            : null
                    })
                    .filter((item): item is NonNullable<typeof item> => Boolean(item))

                const dailyDigest = [
                    `BÁO CÁO TIẾN ĐỘ DỰ ÁN (${today})`,
                    `- Tổng số task: ${board.tasks.length} | Hoàn thành: ${completedTasks.length} | Chưa xong: ${incompleteTasks.length}`,
                    `- Quá hạn: ${overdueTasks.length} | Bị chặn: ${blockedTasks.length} | Nguy cơ trễ hạn: ${risks.length}`,
                    ...(completedTasks.length
                        ? [`- Đã hoàn thành: ${completedTasks.map((t) => `${t.code} (${t.title})`).join('; ')}`]
                        : []),
                    ...(incompleteTasks.length
                        ? [
                              `- Chưa hoàn thành: ${incompleteTasks
                                  .map((t) => `${t.code} [${t.assignee || 'Chưa giao'} - hạn ${t.deadline} - ${t.progressPercent}%]`)
                                  .join('; ')}`
                          ]
                        : []),
                    ...(risks.length
                        ? [`- Rủi ro: ${risks.map((r) => `${r.code} (${r.severity}: ${r.reasons.join(', ')})`).join(' | ')}`]
                        : ['- Không phát hiện rủi ro trễ deadline nghiêm trọng.'])
                ].join('\n')

                return JSON.stringify({
                    referenceDate: today,
                    summary: {
                        totalTasks: board.tasks.length,
                        completedCount: completedTasks.length,
                        incompleteCount: incompleteTasks.length,
                        overdueCount: overdueTasks.length,
                        blockedCount: blockedTasks.length,
                        atRiskCount: risks.length
                    },
                    overdueTasks,
                    blockedTasks,
                    atRiskTasks: risks,
                    allTasks: board.tasks,
                    dailyReportText: dailyDigest,
                    recentAuditLogs: board.logs.slice(-10)
                })
            },
            {
                name: 'pm_check_progress_and_risks',
                description:
                    'Truy vấn tiến độ dự án thực tế: liệt kê task hoàn thành, chưa hoàn thành, task quá hạn, task bị chặn, người phụ trách, tự động phát hiện rủi ro trễ deadline và tạo nội dung báo cáo tổng hợp.',
                schema: CheckProgressSchema
            }
        )

        const shiftDeadlinesTool = tool(
            async (input): Promise<string> => {
                const boardPath = getBoardPath(input.projectKey)
                const board = loadBoardState(boardPath, input.projectKey || 'default')

                const directMatches = input.taskCodesOrIds?.length
                    ? board.tasks.filter((t) => t.status !== 'done' && input.taskCodesOrIds!.some((id) => findTask(board, id)?.id === t.id))
                    : board.tasks.filter((t) => t.status !== 'done')

                const affectedSet = new Set(directMatches.map((t) => t.id))
                let changed = true
                while (changed) {
                    changed = false
                    for (const t of board.tasks) {
                        if (t.status === 'done' || affectedSet.has(t.id)) continue
                        const dependsOnAffected = t.dependencies.some((dep) => {
                            const depTask = findTask(board, dep)
                            return depTask && affectedSet.has(depTask.id)
                        })
                        if (dependsOnAffected) {
                            affectedSet.add(t.id)
                            changed = true
                        }
                    }
                }

                const impactedPlan = board.tasks
                    .filter((t) => affectedSet.has(t.id))
                    .map((t) => ({
                        code: t.code,
                        title: t.title,
                        assignee: t.assignee || 'Chưa phân công',
                        oldDeadline: t.deadline,
                        newDeadline: addDaysIso(t.deadline, input.shiftDays),
                        reason: directMatches.some((d) => d.id === t.id)
                            ? 'Thuộc phạm vi yêu cầu dời lịch'
                            : 'Bị kéo theo do phụ thuộc công việc'
                    }))

                if (input.dryRun) {
                    return JSON.stringify({
                        applied: false,
                        dryRun: true,
                        shiftDays: input.shiftDays,
                        affectedTaskCount: impactedPlan.length,
                        impactedPlan,
                        confirmationRequiredNote:
                            'ĐÂY LÀ BẢN PHÂN TÍCH TÁC ĐỘNG (dryRun=true, chưa ghi đè dữ liệu thật). Hãy trình bày bảng tác động này và yêu cầu người dùng xác nhận trước khi gọi lại pm_shift_deadlines với dryRun=false!'
                    })
                }

                for (const item of impactedPlan) {
                    const task = board.tasks.find((t) => t.code === item.code)
                    if (task) {
                        task.deadline = item.newDeadline
                        task.updatedAt = new Date().toISOString()
                    }
                }
                saveBoardState(
                    boardPath,
                    board,
                    'SHIFT_DEADLINES',
                    `Đã dời deadline ${input.shiftDays > 0 ? `+${input.shiftDays}` : input.shiftDays} ngày cho ${
                        impactedPlan.length
                    } task sau xác nhận`
                )

                return JSON.stringify({
                    applied: true,
                    dryRun: false,
                    shiftDays: input.shiftDays,
                    updatedTaskCount: impactedPlan.length,
                    updatedTasks: impactedPlan
                })
            },
            {
                name: 'pm_shift_deadlines',
                description:
                    'Phân tích các task bị ảnh hưởng khi thay đổi/dời deadline (mặc định dryRun=true để trình phương án xin xác nhận) hoặc thực thi cập nhật deadline thật (dryRun=false sau khi người dùng xác nhận).',
                schema: ShiftDeadlinesSchema
            }
        )

        return [
            createTasksTool as unknown as Tool,
            listMembersTool as unknown as Tool,
            upsertMembersTool as unknown as Tool,
            assignTasksTool as unknown as Tool,
            updateTaskStatusTool as unknown as Tool,
            checkProgressAndRisksTool as unknown as Tool,
            shiftDeadlinesTool as unknown as Tool
        ]
    }
}

module.exports = { nodeClass: ProjectTracker_Tools }
