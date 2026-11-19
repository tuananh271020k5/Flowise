import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { tool, Tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { read, utils, write } from 'xlsx'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'

const getStoragePath = (): string =>
    process.env.BLOB_STORAGE_PATH ? path.join(process.env.BLOB_STORAGE_PATH) : path.join(os.homedir(), '.flowise', 'storage')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizeWorkspaceSegment(workspaceId?: string): string {
    const cleaned = (workspaceId || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    return cleaned.slice(0, 80) || 'default'
}

function sanitizeExcelFileName(rawName?: string): string {
    const base = (rawName || 'bang-tinh.xlsx')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\.+/g, '.')
        .slice(0, 120)
    const withoutExt = base.replace(/\.(xlsx|xls|csv)$/i, '').trim() || 'bang-tinh'
    return `${withoutExt}.xlsx`
}

function getWorkspaceExportDir(options: ICommonObject): { workspaceId: string; dir: string } {
    const rawWorkspaceId =
        (options?.workspaceId as string | undefined) ??
        ((options?.searchOptions as ICommonObject | undefined)?.workspaceId as string | undefined) ??
        'default'
    const workspaceId = sanitizeWorkspaceSegment(rawWorkspaceId)
    const dir = path.join(getStoragePath(), 'agent-builder-exports', workspaceId)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return { workspaceId, dir }
}

function buildSheetWithWidths(columns: string[], rows: Array<Array<string | number | boolean | null>>) {
    const data: Array<Array<string | number | boolean | null>> = columns.length > 0 ? [columns, ...rows] : rows
    const ws = utils.aoa_to_sheet(data)
    const colCount = Math.max(columns.length, ...rows.map((r) => r.length), 1)
    ws['!cols'] = Array.from({ length: colCount }, (_, colIdx) => {
        let maxLen = String(columns[colIdx] || '').length
        for (const row of rows.slice(0, 100)) {
            const cellLen = String(row[colIdx] ?? '').length
            if (cellLen > maxLen) maxLen = cellLen
        }
        return { wch: Math.min(Math.max(maxLen + 4, 12), 48) }
    })
    return ws
}

const CreateWorkbookSchema = z.object({
    fileName: z.string().describe('Tên file Excel cần tạo (ví dụ: Bao_Cao_Doanh_Thu.xlsx)'),
    sheets: z
        .array(
            z.object({
                sheetName: z.string().describe('Tên trang tính (tối đa 31 ký tự, ví dụ: TongHop)'),
                columns: z.array(z.string()).describe('Danh sách tiêu đề các cột ở dòng đầu tiên'),
                rows: z
                    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
                    .describe('Mảng các dòng dữ liệu tương ứng với thứ tự cột')
            })
        )
        .min(1)
        .max(10)
        .describe('Danh sách các sheet cần tạo trong file Excel')
})

const ReadWorkbookSchema = z.object({
    fileId: z.string().optional().describe('ID file Excel trong workspace (bỏ trống nếu muốn liệt kê danh sách các file Excel hiện có)'),
    sheetName: z.string().optional().describe('Tên sheet muốn đọc (bỏ trống để đọc sheet đầu tiên)'),
    maxRows: z.number().int().min(1).max(200).optional().default(50).describe('Số dòng tối đa cần đọc')
})

const AppendRowsSchema = z.object({
    fileId: z.string().describe('ID của file Excel đã tạo trước đó trong workspace'),
    sheetName: z.string().optional().describe('Tên sheet cần thêm dòng (mặc định là sheet đầu tiên)'),
    rows: z
        .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
        .min(1)
        .max(500)
        .describe('Các dòng dữ liệu mới cần nối thêm vào cuối bảng tính')
})

class ExcelOffice_Tools implements INode {
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
        this.label = 'Excel Spreadsheet (.xlsx)'
        this.name = 'excelOfficeTool'
        this.version = 1.0
        this.type = 'ExcelOfficeTool'
        this.icon = 'excel.svg'
        this.category = 'Tools'
        this.description = 'Tạo mới, đọc dữ liệu và thêm dòng trực tiếp vào file bảng tính Excel (.xlsx) nội bộ không cần đăng nhập ngoài'
        this.baseClasses = [this.type, 'Tool']
        this.inputs = []
    }

    async init(_nodeData: INodeData, _input: string, options: ICommonObject): Promise<Tool[]> {
        const { workspaceId, dir } = getWorkspaceExportDir(options)

        const createWorkbookTool = tool(
            async (input): Promise<string> => {
                const fileName = sanitizeExcelFileName(input.fileName)
                const wb = utils.book_new()
                let totalRows = 0
                const usedNames = new Set<string>()
                for (let i = 0; i < input.sheets.length; i++) {
                    const sheetSpec = input.sheets[i]
                    let safeSheetName =
                        (sheetSpec.sheetName || `Sheet${i + 1}`)
                            .replace(/[:\\/?*[\]]/g, '_')
                            .trim()
                            .slice(0, 31) || `Sheet${i + 1}`
                    if (usedNames.has(safeSheetName)) {
                        safeSheetName = `${safeSheetName.slice(0, 27)}_${i + 1}`
                    }
                    usedNames.add(safeSheetName)
                    const ws = buildSheetWithWidths(sheetSpec.columns || [], sheetSpec.rows || [])
                    utils.book_append_sheet(wb, ws, safeSheetName)
                    totalRows += (sheetSpec.rows || []).length
                }

                const fileId = randomUUID()
                const buffer = write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
                fs.writeFileSync(path.join(dir, `${fileId}.xlsx`), buffer)
                const meta = {
                    fileId,
                    fileName,
                    ext: 'xlsx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    workspaceId,
                    sheetNames: wb.SheetNames,
                    totalRows,
                    createdAt: new Date().toISOString()
                }
                fs.writeFileSync(path.join(dir, `${fileId}.meta.json`), JSON.stringify(meta, null, 2))
                const downloadUrl = `/api/v1/agent-builder/exports/${fileId}/${encodeURIComponent(fileName)}`
                return JSON.stringify({
                    success: true,
                    fileId,
                    fileName,
                    sheetNames: wb.SheetNames,
                    totalRows,
                    downloadUrl,
                    markdownLink: `[Tải xuống ${fileName}](${downloadUrl})`,
                    note: 'Hãy đưa nguyên văn markdownLink vào câu trả lời để người dùng bấm tải file Excel trực tiếp.'
                })
            },
            {
                name: 'excel_create_workbook',
                description:
                    'Tạo mới một file bảng tính Excel (.xlsx) có tiêu đề cột và các dòng dữ liệu, trả về đường dẫn tải file trực tiếp cho người dùng.',
                schema: CreateWorkbookSchema
            }
        )

        const readWorkbookTool = tool(
            async (input): Promise<string> => {
                if (!input.fileId) {
                    const metas = fs
                        .readdirSync(dir)
                        .filter((f) => f.endsWith('.meta.json'))
                        .map((f) => {
                            try {
                                return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
                            } catch {
                                return null
                            }
                        })
                        .filter((m) => m && m.ext === 'xlsx')
                    return JSON.stringify({ availableWorkbooks: metas })
                }
                if (!UUID_RE.test(input.fileId)) {
                    return JSON.stringify({ error: 'fileId không hợp lệ' })
                }
                const targetPath = path.join(dir, `${input.fileId}.xlsx`)
                if (!fs.existsSync(targetPath)) {
                    return JSON.stringify({ error: `Không tìm thấy file Excel với fileId="${input.fileId}" trong workspace` })
                }
                const wb = read(fs.readFileSync(targetPath), { type: 'buffer' })
                const chosenSheet = input.sheetName && wb.SheetNames.includes(input.sheetName) ? input.sheetName : wb.SheetNames[0]
                const rows = utils.sheet_to_json(wb.Sheets[chosenSheet], { defval: '' }).slice(0, input.maxRows || 50)
                return JSON.stringify({
                    fileId: input.fileId,
                    sheetNames: wb.SheetNames,
                    selectedSheet: chosenSheet,
                    rowCountReturned: rows.length,
                    rows
                })
            },
            {
                name: 'excel_read_workbook',
                description: 'Đọc dữ liệu các dòng hoặc liệt kê các file Excel (.xlsx) hiện có trong workspace.',
                schema: ReadWorkbookSchema
            }
        )

        const appendRowsTool = tool(
            async (input): Promise<string> => {
                if (!UUID_RE.test(input.fileId)) {
                    return JSON.stringify({ error: 'fileId không hợp lệ' })
                }
                const targetPath = path.join(dir, `${input.fileId}.xlsx`)
                const metaPath = path.join(dir, `${input.fileId}.meta.json`)
                if (!fs.existsSync(targetPath) || !fs.existsSync(metaPath)) {
                    return JSON.stringify({ error: `Không tìm thấy file Excel với fileId="${input.fileId}"` })
                }
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
                const wb = read(fs.readFileSync(targetPath), { type: 'buffer' })
                const chosenSheet = input.sheetName && wb.SheetNames.includes(input.sheetName) ? input.sheetName : wb.SheetNames[0]
                utils.sheet_add_aoa(wb.Sheets[chosenSheet], input.rows, { origin: -1 })
                const updatedBuffer = write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
                fs.writeFileSync(targetPath, updatedBuffer)
                meta.totalRows = (meta.totalRows || 0) + input.rows.length
                meta.updatedAt = new Date().toISOString()
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
                const downloadUrl = `/api/v1/agent-builder/exports/${input.fileId}/${encodeURIComponent(meta.fileName)}`
                return JSON.stringify({
                    success: true,
                    fileId: input.fileId,
                    fileName: meta.fileName,
                    selectedSheet: chosenSheet,
                    appendedRowCount: input.rows.length,
                    downloadUrl,
                    markdownLink: `[Tải xuống ${meta.fileName}](${downloadUrl})`
                })
            },
            {
                name: 'excel_append_rows',
                description: 'Thêm các dòng mới vào cuối một sheet trong file Excel (.xlsx) đã có.',
                schema: AppendRowsSchema
            }
        )

        return [createWorkbookTool as unknown as Tool, readWorkbookTool as unknown as Tool, appendRowsTool as unknown as Tool]
    }
}

module.exports = { nodeClass: ExcelOffice_Tools }
