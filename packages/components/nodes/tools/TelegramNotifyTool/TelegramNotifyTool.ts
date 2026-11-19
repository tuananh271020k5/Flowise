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

const SendTelegramSchema = z.object({
    title: z.string().describe('Tiêu đề báo cáo / thông báo (ví dụ: Báo cáo tiến độ dự án 17h00)'),
    message: z.string().min(1).max(4000).describe('Nội dung chi tiết báo cáo cần gửi qua Telegram'),
    chatIdOverride: z.string().optional().describe('Chat ID nhận tin nhắn (bỏ trống để dùng Chat ID mặc định đã cấu hình)')
})

class TelegramNotify_Tools implements INode {
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
        this.label = 'Telegram Bot Notification'
        this.name = 'telegramNotifyTool'
        this.version = 1.0
        this.type = 'TelegramNotifyTool'
        this.icon = 'telegram.svg'
        this.category = 'Tools'
        this.description =
            'Gửi báo cáo tiến độ, cảnh báo rủi ro và thông báo tự động qua Telegram Bot API (có tự động retry & lưu lịch sử gửi)'
        this.baseClasses = [this.type, 'Tool']
        this.inputs = [
            {
                label: 'Telegram Bot Token',
                name: 'botToken',
                type: 'password',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Default Chat ID',
                name: 'chatId',
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
        const workspaceSegment =
            rawWorkspaceId
                .trim()
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .slice(0, 80) || 'default'
        const outboxPath = path.join(resolveBaseStoragePath(), 'agent-builder-projects', workspaceSegment, 'telegram-outbox.json')

        const botToken = ((nodeData.inputs?.botToken as string) || process.env.TELEGRAM_BOT_TOKEN || '').trim()
        const defaultChatId = ((nodeData.inputs?.chatId as string) || process.env.TELEGRAM_CHAT_ID || '').trim()

        const sendReportTool = tool(
            async (input): Promise<string> => {
                const targetChatId = (input.chatIdOverride || defaultChatId).trim()
                const formattedText = `[${input.title.trim()}]\n\n${input.message.trim()}`
                const dispatchId = randomUUID()
                const timestamp = new Date().toISOString()

                let deliveredViaApi = false
                let telegramMessageId: number | undefined
                let apiNote = ''

                if (botToken && targetChatId) {
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    chat_id: targetChatId,
                                    text: formattedText.slice(0, 4090)
                                })
                            })
                            if (res.ok) {
                                const data: any = await res.json()
                                deliveredViaApi = true
                                telegramMessageId = data?.result?.message_id
                                break
                            }
                            apiNote = `Telegram API trả HTTP ${res.status}`
                            if (res.status !== 429 && res.status < 500) break
                        } catch (err: any) {
                            apiNote = err?.message || 'Lỗi mạng khi gọi Telegram API'
                        }
                        if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt))
                    }
                } else {
                    apiNote =
                        'Chưa điền TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID; bản tin báo cáo đã được lưu vào hộp thư gửi đi (Outbox) của Workspace để kiểm thử trọn luồng.'
                }

                let history: any[] = []
                if (fs.existsSync(outboxPath)) {
                    try {
                        history = JSON.parse(fs.readFileSync(outboxPath, 'utf8'))
                        if (!Array.isArray(history)) history = []
                    } catch {
                        history = []
                    }
                }
                history.push({
                    id: dispatchId,
                    timestamp,
                    chatId: targetChatId || '(outbox-preview)',
                    title: input.title,
                    message: input.message,
                    deliveredViaApi,
                    telegramMessageId,
                    note: apiNote || undefined
                })
                if (history.length > 100) history = history.slice(-100)
                fs.mkdirSync(path.dirname(outboxPath), { recursive: true })
                fs.writeFileSync(outboxPath, JSON.stringify(history, null, 2), 'utf8')

                return JSON.stringify({
                    success: true,
                    dispatchId,
                    timestamp,
                    deliveredViaTelegramApi: deliveredViaApi,
                    telegramMessageId,
                    recordedInWorkspaceOutbox: true,
                    note: apiNote || 'Đã gửi thành công tới Telegram!'
                })
            },
            {
                name: 'telegram_send_report',
                description:
                    'Gửi báo cáo tổng hợp tiến độ, rủi ro hoặc thông báo qua Telegram (tự động retry khi lỗi mạng và ghi log Outbox kiểm thử).',
                schema: SendTelegramSchema
            }
        )

        return [sendReportTool as unknown as Tool]
    }
}

module.exports = { nodeClass: TelegramNotify_Tools }
