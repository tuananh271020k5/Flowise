import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { randomUUID } from 'crypto'
import { tool, Tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'

const getStoragePath = (): string =>
    process.env.BLOB_STORAGE_PATH ? path.join(process.env.BLOB_STORAGE_PATH) : path.join(os.homedir(), '.flowise', 'storage')

function extractDocxParagraphsFromBuffer(buffer: Buffer): string[] {
    let xml: string | null = null
    for (let offset = 0; offset + 46 <= buffer.length; offset++) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) continue
        const method = buffer.readUInt16LE(offset + 10)
        const compressedSize = buffer.readUInt32LE(offset + 20)
        const uncompressedSize = buffer.readUInt32LE(offset + 24)
        const nameLen = buffer.readUInt16LE(offset + 28)
        const localOffset = buffer.readUInt32LE(offset + 42)
        if (offset + 46 + nameLen > buffer.length || uncompressedSize > 25 * 1024 * 1024) continue
        const entryName = buffer.toString('utf8', offset + 46, offset + 46 + nameLen)
        if (entryName !== 'word/document.xml') continue
        if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) continue
        const localNameLen = buffer.readUInt16LE(localOffset + 26)
        const localExtraLen = buffer.readUInt16LE(localOffset + 28)
        const dataStart = localOffset + 30 + localNameLen + localExtraLen
        const dataEnd = dataStart + compressedSize
        if (dataEnd > buffer.length) continue
        const slice = buffer.subarray(dataStart, dataEnd)
        if (method === 0) xml = slice.toString('utf8')
        else if (method === 8) xml = zlib.inflateRawSync(slice).toString('utf8')
        break
    }
    if (!xml) return []
    const decodeEntities = (s: string) =>
        s
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
    const lines: string[] = []
    for (const pXml of xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || []) {
        const line = Array.from(pXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g))
            .map((m) => decodeEntities(m[1]))
            .join('')
            .replace(/\s+/g, ' ')
            .trim()
        if (line) lines.push(line)
    }
    return lines
}

async function readDocxTextSafe(targetPath: string): Promise<string> {
    try {
        const paragraphs = extractDocxParagraphsFromBuffer(fs.readFileSync(targetPath))
        if (paragraphs.length > 0) return paragraphs.join('\n')
    } catch {
        // Fallback to DocxLoader below
    }
    const loader = new DocxLoader(targetPath)
    const docs = await loader.load()
    return docs.map((d) => d.pageContent).join('\n\n')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface DocxSectionSpec {
    heading?: string
    paragraphs?: string[]
    bullets?: string[]
    table?: {
        headers: string[]
        rows: string[][]
    }
}

function sanitizeWorkspaceSegment(workspaceId?: string): string {
    const cleaned = (workspaceId || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    return cleaned.slice(0, 80) || 'default'
}

function sanitizeWordFileName(rawName?: string): string {
    const base = (rawName || 'tai-lieu.docx')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\.+/g, '.')
        .slice(0, 120)
    const withoutExt = base.replace(/\.(docx|doc)$/i, '').trim() || 'tai-lieu'
    return `${withoutExt}.docx`
}

function escapeXml(text: string): string {
    return (
        String(text || '')
            // eslint-disable-next-line no-control-regex
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
    )
}

function buildZipStore(entries: Record<string, string>): Buffer {
    const localParts: Buffer[] = []
    const centralParts: Buffer[] = []
    let offset = 0

    for (const [filename, content] of Object.entries(entries)) {
        const nameBuf = Buffer.from(filename, 'utf8')
        const dataBuf = Buffer.from(content, 'utf8')
        let crc = -1
        for (const byte of dataBuf) {
            crc ^= byte
            for (let bit = 0; bit < 8; bit++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
            }
        }
        crc = (crc ^ -1) >>> 0

        const localHeader = Buffer.alloc(30)
        localHeader.writeUInt32LE(0x04034b50, 0)
        localHeader.writeUInt16LE(20, 4)
        localHeader.writeUInt16LE(0x0800, 6) // UTF-8 flag
        localHeader.writeUInt16LE(0, 8) // Store method
        localHeader.writeUInt32LE(crc, 14)
        localHeader.writeUInt32LE(dataBuf.length, 18)
        localHeader.writeUInt32LE(dataBuf.length, 22)
        localHeader.writeUInt16LE(nameBuf.length, 26)

        const centralHeader = Buffer.alloc(46)
        centralHeader.writeUInt32LE(0x02014b50, 0)
        centralHeader.writeUInt16LE(20, 4)
        centralHeader.writeUInt16LE(20, 6)
        centralHeader.writeUInt16LE(0x0800, 8)
        centralHeader.writeUInt16LE(0, 10)
        centralHeader.writeUInt32LE(crc, 16)
        centralHeader.writeUInt32LE(dataBuf.length, 20)
        centralHeader.writeUInt32LE(dataBuf.length, 24)
        centralHeader.writeUInt16LE(nameBuf.length, 28)
        centralHeader.writeUInt32LE(offset, 42)

        localParts.push(localHeader, nameBuf, dataBuf)
        centralParts.push(centralHeader, nameBuf)
        offset += localHeader.length + nameBuf.length + dataBuf.length
    }

    const centralDir = Buffer.concat(centralParts)
    const entryCount = Object.keys(entries).length
    const endOfCentral = Buffer.alloc(22)
    endOfCentral.writeUInt32LE(0x06054b50, 0)
    endOfCentral.writeUInt16LE(entryCount, 8)
    endOfCentral.writeUInt16LE(entryCount, 10)
    endOfCentral.writeUInt32LE(centralDir.length, 12)
    endOfCentral.writeUInt32LE(offset, 16)

    return Buffer.concat([...localParts, centralDir, endOfCentral])
}

function renderDocxBuffer(title: string, sections: DocxSectionSpec[]): Buffer {
    const bodyXml: string[] = []

    if (title && title.trim()) {
        bodyXml.push(
            `<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">${escapeXml(
                title.trim()
            )}</w:t></w:r></w:p>`
        )
    }

    for (const section of sections) {
        if (section.heading && section.heading.trim()) {
            bodyXml.push(
                `<w:p><w:pPr><w:spacing w:before="200" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2F5597"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${escapeXml(
                    section.heading.trim()
                )}</w:t></w:r></w:p>`
            )
        }
        for (const para of section.paragraphs || []) {
            bodyXml.push(
                `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(
                    para
                )}</w:t></w:r></w:p>`
            )
        }
        for (const bullet of section.bullets || []) {
            bodyXml.push(
                `<w:p><w:pPr><w:ind w:left="480"/><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">• ${escapeXml(
                    bullet
                )}</w:t></w:r></w:p>`
            )
        }
        if (section.table && section.table.headers.length > 0) {
            const headerCells = section.table.headers
                .map(
                    (h) =>
                        `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">${escapeXml(
                            h
                        )}</w:t></w:r></w:p></w:tc>`
                )
                .join('')
            const dataRows = (section.table.rows || [])
                .map((row) => {
                    const cells = section.table!.headers.map(
                        (_, idx) =>
                            `<w:tc><w:p><w:r><w:rPr><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">${escapeXml(
                                row[idx] ?? ''
                            )}</w:t></w:r></w:p></w:tc>`
                    )
                    return `<w:tr>${cells.join('')}</w:tr>`
                })
                .join('')
            bodyXml.push(
                `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/></w:tblBorders></w:tblPr><w:tr>${headerCells}</w:tr>${dataRows}</w:tbl>`
            )
        }
    }

    const entries: Record<string, string> = {
        '[Content_Types].xml':
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels':
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml.join(
            ''
        )}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
    }
    return buildZipStore(entries)
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

const SectionSchema = z.object({
    heading: z.string().optional().describe('Tiêu đề mục con'),
    paragraphs: z.array(z.string()).optional().describe('Các đoạn văn xuôi trong mục'),
    bullets: z.array(z.string()).optional().describe('Các ý gạch đầu dòng trong mục'),
    table: z
        .object({
            headers: z.array(z.string()).describe('Tiêu đề cột của bảng trong tài liệu Word'),
            rows: z.array(z.array(z.string())).describe('Các hàng dữ liệu trong bảng')
        })
        .optional()
        .describe('Bảng biểu tùy chọn chèn vào mục này')
})

const CreateWordSchema = z.object({
    fileName: z.string().describe('Tên file Word cần xuất (ví dụ: Bien_Ban_Hop.docx)'),
    title: z.string().describe('Tiêu đề chính của tài liệu Word'),
    sections: z.array(SectionSchema).min(1).max(25).describe('Danh sách các phần nội dung của tài liệu Word')
})

const ReadWordSchema = z.object({
    fileId: z.string().optional().describe('ID file Word trong workspace (bỏ trống để liệt kê danh sách các file Word đã tạo)')
})

const AppendWordSectionSchema = z.object({
    fileId: z.string().describe('ID của file Word đã tạo trước đó trong workspace'),
    section: SectionSchema.describe('Mục nội dung mới cần nối thêm vào cuối tài liệu Word')
})

class WordOffice_Tools implements INode {
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
        this.label = 'Word Document (.docx)'
        this.name = 'wordOfficeTool'
        this.version = 1.0
        this.type = 'WordOfficeTool'
        this.icon = 'word.svg'
        this.category = 'Tools'
        this.description =
            'Soạn thảo, đọc và bổ sung mục/bảng biểu trực tiếp vào file văn bản Word (.docx) nội bộ không cần đăng nhập ngoài'
        this.baseClasses = [this.type, 'Tool']
        this.inputs = []
    }

    async init(_nodeData: INodeData, _input: string, options: ICommonObject): Promise<Tool[]> {
        const { workspaceId, dir } = getWorkspaceExportDir(options)

        const createDocumentTool = tool(
            async (input): Promise<string> => {
                const fileName = sanitizeWordFileName(input.fileName)
                const fileId = randomUUID()
                const buffer = renderDocxBuffer(input.title, input.sections)
                fs.writeFileSync(path.join(dir, `${fileId}.docx`), buffer)
                const meta = {
                    fileId,
                    fileName,
                    ext: 'docx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    workspaceId,
                    title: input.title,
                    sections: input.sections,
                    createdAt: new Date().toISOString()
                }
                fs.writeFileSync(path.join(dir, `${fileId}.meta.json`), JSON.stringify(meta, null, 2))
                const downloadUrl = `/api/v1/agent-builder/exports/${fileId}/${encodeURIComponent(fileName)}`
                return JSON.stringify({
                    success: true,
                    fileId,
                    fileName,
                    sectionCount: input.sections.length,
                    downloadUrl,
                    markdownLink: `[Tải xuống ${fileName}](${downloadUrl})`,
                    note: 'Hãy đưa nguyên văn markdownLink vào câu trả lời để người dùng bấm tải file Word trực tiếp.'
                })
            },
            {
                name: 'word_create_document',
                description:
                    'Soạn thảo và tạo mới file tài liệu Microsoft Word (.docx) gồm tiêu đề, các đề mục, đoạn văn, gạch đầu dòng và bảng biểu; trả về link tải file trực tiếp.',
                schema: CreateWordSchema
            }
        )

        const readDocumentTool = tool(
            async (input): Promise<string> => {
                if (!input.fileId) {
                    const metas = fs
                        .readdirSync(dir)
                        .filter((f) => f.endsWith('.meta.json'))
                        .map((f) => {
                            try {
                                const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
                                return m?.ext === 'docx' ? { fileId: m.fileId, fileName: m.fileName, title: m.title } : null
                            } catch {
                                return null
                            }
                        })
                        .filter(Boolean)
                    return JSON.stringify({ availableDocuments: metas })
                }
                if (!UUID_RE.test(input.fileId)) {
                    return JSON.stringify({ error: 'fileId không hợp lệ' })
                }
                const targetPath = path.join(dir, `${input.fileId}.docx`)
                if (!fs.existsSync(targetPath)) {
                    return JSON.stringify({ error: `Không tìm thấy file Word với fileId="${input.fileId}"` })
                }
                const content = await readDocxTextSafe(targetPath)
                return JSON.stringify({
                    fileId: input.fileId,
                    content: content.slice(0, 16000)
                })
            },
            {
                name: 'word_read_document',
                description: 'Đọc nội dung văn bản từ một file Word (.docx) trong workspace hoặc liệt kê các file hiện có.',
                schema: ReadWordSchema
            }
        )

        const appendSectionTool = tool(
            async (input): Promise<string> => {
                if (!UUID_RE.test(input.fileId)) {
                    return JSON.stringify({ error: 'fileId không hợp lệ' })
                }
                const targetPath = path.join(dir, `${input.fileId}.docx`)
                const metaPath = path.join(dir, `${input.fileId}.meta.json`)
                if (!fs.existsSync(targetPath) || !fs.existsSync(metaPath)) {
                    return JSON.stringify({ error: `Không tìm thấy file Word với fileId="${input.fileId}"` })
                }
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
                let existingSections: DocxSectionSpec[] = Array.isArray(meta.sections) ? meta.sections : []
                if (existingSections.length === 0) {
                    try {
                        const rawText = await readDocxTextSafe(targetPath)
                        const lines = rawText
                            .split(/\r?\n/)
                            .map((l) => l.trim())
                            .filter(Boolean)
                        if (lines.length > 0) existingSections = [{ heading: 'Nội dung gốc', paragraphs: lines }]
                    } catch {
                        // Ignore fallback read errors
                    }
                }
                const updatedSections: DocxSectionSpec[] = [...existingSections, input.section]
                const updatedBuffer = renderDocxBuffer(meta.title || meta.fileName, updatedSections)
                fs.writeFileSync(targetPath, updatedBuffer)
                meta.sections = updatedSections
                meta.updatedAt = new Date().toISOString()
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
                const downloadUrl = `/api/v1/agent-builder/exports/${input.fileId}/${encodeURIComponent(meta.fileName)}`
                return JSON.stringify({
                    success: true,
                    fileId: input.fileId,
                    fileName: meta.fileName,
                    sectionCount: updatedSections.length,
                    downloadUrl,
                    markdownLink: `[Tải xuống ${meta.fileName}](${downloadUrl})`
                })
            },
            {
                name: 'word_append_section',
                description: 'Nối thêm một đề mục / bảng biểu mới vào cuối file Word (.docx) đã tạo trước đó.',
                schema: AppendWordSectionSchema
            }
        )

        return [createDocumentTool as unknown as Tool, readDocumentTool as unknown as Tool, appendSectionTool as unknown as Tool]
    }
}

module.exports = { nodeClass: WordOffice_Tools }
