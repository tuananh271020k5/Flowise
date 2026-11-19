import fs from 'fs'
import os from 'os'
import path from 'path'
import { tool, Tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'

export interface HelpdeskTicketNote {
    at: string
    author: string
    content: string
}

export interface HelpdeskTicketRecord {
    ticketId: string
    idempotencyKey?: string
    title: string
    category: 'Kỹ thuật' | 'Thanh toán & Hóa đơn' | 'Tài khoản & Bảo mật' | 'Khiếu nại dịch vụ' | 'Khác'
    priority: 'P0' | 'P1' | 'P2' | 'P3'
    status: 'Mới tiếp nhận' | 'Đang xử lý' | 'Chờ khách phản hồi' | 'Đã giải quyết' | 'Đã đóng'
    customerName: string
    customerContact: string
    contextSummary: string
    expectedResult?: string
    actualResult?: string
    stepsTried?: string[]
    assignedGroup: string
    slaHours: number
    slaDeadline: string
    notes: HelpdeskTicketNote[]
    createdAt: string
    updatedAt: string
}

interface HelpdeskStoreData {
    seq: number
    tickets: HelpdeskTicketRecord[]
}

const DEFAULT_SUPPORT_GROUPS = [
    {
        name: 'Đội Kỹ thuật L2/L3',
        categories: ['Kỹ thuật'],
        description: 'Xử lý lỗi phần mềm, gián đoạn dịch vụ, lỗi API/tích hợp và sự cố hệ thống.'
    },
    {
        name: 'Phòng Kế toán & Thanh toán',
        categories: ['Thanh toán & Hóa đơn'],
        description: 'Xử lý đối soát thanh toán, hoàn tiền, xuất/điều chỉnh hóa đơn VAT và gia hạn gói.'
    },
    {
        name: 'Đội Bảo mật & Tài khoản',
        categories: ['Tài khoản & Bảo mật'],
        description: 'Hỗ trợ mở khóa tài khoản, phân quyền truy cập, 2FA/SSO và sự cố bảo mật.'
    },
    {
        name: 'Tổ Chăm sóc Khách hàng Cao cấp',
        categories: ['Khiếu nại dịch vụ', 'Khác'],
        description: 'Tiếp nhận khiếu nại dịch vụ, yêu cầu ngoại lệ chính sách và điều phối liên phòng ban.'
    }
]

const SLA_HOURS_BY_PRIORITY: Record<'P0' | 'P1' | 'P2' | 'P3', number> = {
    P0: 1,
    P1: 4,
    P2: 12,
    P3: 24
}

const getStoragePath = (): string =>
    process.env.BLOB_STORAGE_PATH ? path.join(process.env.BLOB_STORAGE_PATH) : path.join(os.homedir(), '.flowise', 'storage')

function sanitizeWorkspaceSegment(workspaceId?: string): string {
    const cleaned = (workspaceId || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    return cleaned.slice(0, 80) || 'default'
}

function getStorePath(options: ICommonObject): string {
    const rawWorkspaceId =
        (options?.workspaceId as string | undefined) ??
        ((options?.searchOptions as ICommonObject | undefined)?.workspaceId as string | undefined) ??
        'default'
    const dir = path.join(getStoragePath(), 'agent-builder-helpdesk', sanitizeWorkspaceSegment(rawWorkspaceId))
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return path.join(dir, 'tickets.json')
}

function readStore(storePath: string): HelpdeskStoreData {
    if (!fs.existsSync(storePath)) {
        return { seq: 1000, tickets: [] }
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'))
        return {
            seq: typeof parsed?.seq === 'number' ? parsed.seq : 1000,
            tickets: Array.isArray(parsed?.tickets) ? parsed.tickets : []
        }
    } catch {
        return { seq: 1000, tickets: [] }
    }
}

function writeStore(storePath: string, data: HelpdeskStoreData): void {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8')
}

function defaultGroupForCategory(category: HelpdeskTicketRecord['category']): string {
    const matched = DEFAULT_SUPPORT_GROUPS.find((g) => g.categories.includes(category))
    return matched ? matched.name : 'Tổ Chăm sóc Khách hàng Cao cấp'
}

function normalizeTitleKey(title: string): string {
    return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

const CreateTicketSchema = z.object({
    title: z.string().min(3).max(200).describe('Tiêu đề ngắn gọn mô tả sự cố hoặc yêu cầu hỗ trợ'),
    category: z
        .enum(['Kỹ thuật', 'Thanh toán & Hóa đơn', 'Tài khoản & Bảo mật', 'Khiếu nại dịch vụ', 'Khác'])
        .optional()
        .default('Khác')
        .describe('Phân loại nghiệp vụ của phiếu hỗ trợ'),
    priority: z
        .enum(['P0', 'P1', 'P2', 'P3'])
        .optional()
        .default('P2')
        .describe('Mức độ ưu tiên (P0 khẩn cấp, P1 cao, P2 trung bình, P3 thấp)'),
    customerName: z.string().optional().default('Khách hàng').describe('Họ tên khách hàng (nếu đã cung cấp)'),
    customerContact: z.string().optional().default('Chưa cung cấp').describe('Email, số điện thoại hoặc mã tài khoản của khách hàng'),
    contextSummary: z
        .string()
        .min(5)
        .max(3000)
        .describe('Tóm tắt đầy đủ ngữ cảnh cuộc hội thoại, vấn đề khách gặp phải và lý do chuyển L3'),
    expectedResult: z.string().optional().describe('Kết quả khách hàng mong đợi'),
    actualResult: z.string().optional().describe('Kết quả hoặc lỗi thực tế đang xảy ra'),
    stepsTried: z.array(z.string()).optional().describe('Các bước hướng dẫn L1 khách đã thử nhưng chưa khắc phục được'),
    assignedGroup: z.string().optional().describe('Nhóm xử lý tiếp nhận (bỏ trống để tự định tuyến theo danh mục)'),
    idempotencyKey: z.string().optional().describe('Khóa chống trùng lặp phiếu hỗ trợ (tùy chọn)')
})

const ListTicketsSchema = z.object({
    ticketId: z.string().optional().describe('Mã phiếu cụ thể cần tra cứu (ví dụ: TCK-1001)'),
    status: z
        .enum(['Mới tiếp nhận', 'Đang xử lý', 'Chờ khách phản hồi', 'Đã giải quyết', 'Đã đóng'])
        .optional()
        .describe('Lọc theo trạng thái xử lý'),
    assignedGroup: z.string().optional().describe('Lọc theo nhóm phụ trách'),
    customerContact: z.string().optional().describe('Lọc theo email/SĐT/tài khoản khách hàng'),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional().describe('Lọc theo mức độ ưu tiên')
})

const UpdateTicketSchema = z.object({
    ticketId: z.string().describe('Mã phiếu hỗ trợ cần cập nhật (ví dụ: TCK-1001)'),
    status: z
        .enum(['Mới tiếp nhận', 'Đang xử lý', 'Chờ khách phản hồi', 'Đã giải quyết', 'Đã đóng'])
        .optional()
        .describe('Trạng thái mới của phiếu'),
    assignedGroup: z.string().optional().describe('Chuyển sang nhóm xử lý mới (nếu cần)'),
    note: z.string().optional().describe('Ghi chú bổ sung thông tin hoặc phản hồi xử lý'),
    author: z.string().optional().default('Trợ lý CSKH').describe('Người cập nhật ghi chú')
})

class HelpdeskTicket_Tools implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    inputs: INodeParams[]

    constructor() {
        this.label = 'Support Ticket / Helpdesk (L3)'
        this.name = 'helpdeskTicketTool'
        this.version = 1.0
        this.type = 'HelpdeskTicketTool'
        this.icon = 'ticket.svg'
        this.category = 'Tools'
        this.description =
            'Tiếp nhận, chống trùng lặp, phân nhóm xử lý theo SLA và theo dõi trạng thái phiếu hỗ trợ CSKH (TCK-...) kèm ngữ cảnh hội thoại'
        this.baseClasses = [this.type, 'Tool']
        this.inputs = []
    }

    async init(_nodeData: INodeData, _input: string, options: ICommonObject): Promise<Tool[]> {
        const storePath = getStorePath(options)

        const createTicketTool = tool(
            async (input): Promise<string> => {
                const store = readStore(storePath)
                const normalizedTitle = normalizeTitleKey(input.title)
                const duplicate = store.tickets.find(
                    (t) =>
                        t.status !== 'Đã đóng' &&
                        ((input.idempotencyKey && t.idempotencyKey === input.idempotencyKey) ||
                            (normalizeTitleKey(t.title) === normalizedTitle &&
                                t.customerContact.toLowerCase() === (input.customerContact || 'Chưa cung cấp').toLowerCase()))
                )
                if (duplicate) {
                    return JSON.stringify({
                        success: true,
                        duplicatePrevented: true,
                        message: `Phiếu hỗ trợ tương tự đã tồn tại (${duplicate.ticketId}), không tạo trùng lặp.`,
                        ticket: duplicate
                    })
                }

                const now = new Date()
                const priority = input.priority || 'P2'
                const slaHours = SLA_HOURS_BY_PRIORITY[priority]
                const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000).toISOString()
                const category = input.category || 'Khác'
                const assignedGroup = input.assignedGroup?.trim() || defaultGroupForCategory(category)

                store.seq += 1
                const ticket: HelpdeskTicketRecord = {
                    ticketId: `TCK-${store.seq}`,
                    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
                    title: input.title.trim(),
                    category,
                    priority,
                    status: 'Mới tiếp nhận',
                    customerName: (input.customerName || 'Khách hàng').trim(),
                    customerContact: (input.customerContact || 'Chưa cung cấp').trim(),
                    contextSummary: input.contextSummary.trim(),
                    ...(input.expectedResult ? { expectedResult: input.expectedResult.trim() } : {}),
                    ...(input.actualResult ? { actualResult: input.actualResult.trim() } : {}),
                    ...(Array.isArray(input.stepsTried) && input.stepsTried.length ? { stepsTried: input.stepsTried } : {}),
                    assignedGroup,
                    slaHours,
                    slaDeadline,
                    notes: [
                        {
                            at: now.toISOString(),
                            author: 'Hệ thống CSKH',
                            content: `Tiếp nhận phiếu từ kênh chat và định tuyến tới ${assignedGroup} (SLA ${slaHours} giờ).`
                        }
                    ],
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString()
                }
                store.tickets.unshift(ticket)
                writeStore(storePath, store)

                return JSON.stringify({
                    success: true,
                    duplicatePrevented: false,
                    ticketId: ticket.ticketId,
                    status: ticket.status,
                    priority: ticket.priority,
                    category: ticket.category,
                    assignedGroup: ticket.assignedGroup,
                    slaHours: ticket.slaHours,
                    slaDeadline: ticket.slaDeadline,
                    ticket
                })
            },
            {
                name: 'helpdesk_create_ticket',
                description:
                    'Tạo phiếu yêu cầu hỗ trợ CSKH (L3) kèm đầy đủ ngữ cảnh hội thoại, chống trùng lặp, tự phân nhóm phụ trách và tính hạn SLA; trả về mã phiếu TCK-....',
                schema: CreateTicketSchema
            }
        )

        const listTicketsTool = tool(
            async (input): Promise<string> => {
                const store = readStore(storePath)
                let items = store.tickets
                if (input.ticketId) {
                    const needle = input.ticketId.trim().toUpperCase()
                    items = items.filter((t) => t.ticketId.toUpperCase() === needle)
                }
                if (input.status) {
                    items = items.filter((t) => t.status === input.status)
                }
                if (input.assignedGroup) {
                    const grp = input.assignedGroup.trim().toLowerCase()
                    items = items.filter((t) => t.assignedGroup.toLowerCase().includes(grp))
                }
                if (input.customerContact) {
                    const c = input.customerContact.trim().toLowerCase()
                    items = items.filter((t) => t.customerContact.toLowerCase().includes(c))
                }
                if (input.priority) {
                    items = items.filter((t) => t.priority === input.priority)
                }
                return JSON.stringify({
                    total: items.length,
                    tickets: items.slice(0, 30)
                })
            },
            {
                name: 'helpdesk_list_tickets',
                description:
                    'Tra cứu trạng thái một mã phiếu hỗ trợ cụ thể (ví dụ TCK-1001) hoặc liệt kê các phiếu hỗ trợ trong hệ thống CSKH.',
                schema: ListTicketsSchema
            }
        )

        const updateTicketTool = tool(
            async (input): Promise<string> => {
                const store = readStore(storePath)
                const target = store.tickets.find((t) => t.ticketId.toUpperCase() === input.ticketId.trim().toUpperCase())
                if (!target) {
                    return JSON.stringify({ success: false, error: `Không tìm thấy phiếu hỗ trợ mã "${input.ticketId}"` })
                }
                const now = new Date().toISOString()
                if (input.status) target.status = input.status
                if (input.assignedGroup) target.assignedGroup = input.assignedGroup.trim()
                if (input.note && input.note.trim()) {
                    target.notes.push({
                        at: now,
                        author: input.author || 'Trợ lý CSKH',
                        content: input.note.trim()
                    })
                }
                target.updatedAt = now
                writeStore(storePath, store)
                return JSON.stringify({
                    success: true,
                    ticket: target
                })
            },
            {
                name: 'helpdesk_update_ticket_status',
                description: 'Cập nhật trạng thái, nhóm phụ trách hoặc bổ sung ghi chú ngữ cảnh mới vào phiếu hỗ trợ đã tạo.',
                schema: UpdateTicketSchema
            }
        )

        const listGroupsTool = tool(
            async (): Promise<string> => {
                const store = readStore(storePath)
                const groups = DEFAULT_SUPPORT_GROUPS.map((g) => ({
                    ...g,
                    openTicketCount: store.tickets.filter(
                        (t) => t.assignedGroup === g.name && t.status !== 'Đã giải quyết' && t.status !== 'Đã đóng'
                    ).length
                }))
                return JSON.stringify({
                    groups,
                    slaHoursByPriority: SLA_HOURS_BY_PRIORITY
                })
            },
            {
                name: 'helpdesk_list_support_groups',
                description: 'Xem danh sách các nhóm xử lý hỗ trợ CSKH, phạm vi phụ trách, số phiếu đang mở và cam kết SLA.',
                schema: z.object({})
            }
        )

        return [
            createTicketTool as unknown as Tool,
            listTicketsTool as unknown as Tool,
            updateTicketTool as unknown as Tool,
            listGroupsTool as unknown as Tool
        ]
    }
}

module.exports = { nodeClass: HelpdeskTicket_Tools }
