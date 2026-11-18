import { z } from 'zod'
export const WORKFLOW_TEMPLATE_ID = 'workflow_v1'
export const WORKFLOW_TEMPLATE_VERSION = '1.0.0'

const stepId = z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,39}$/)
    .refine((value) => value !== 'start')
const text = z.string().trim().min(1).max(2000)
export const WorkflowSchema = z
    .object({
        summary: z.string().trim().min(1).max(1000),
        steps: z
            .array(
                z
                    .object({
                        id: stepId,
                        type: z.enum(['llm', 'agent', 'retriever', 'condition', 'reply', 'external']),
                        label: z.string().trim().min(1).max(100),
                        instruction: text,
                        inputFrom: z.array(z.string().max(40)).max(12).default([]),
                        sourceIds: z.array(z.string().max(150)).max(10).optional(),
                        condition: z
                            .object({
                                operation: z.enum(['contains', 'equal', 'notEmpty', 'isEmpty']),
                                value: z.string().max(200).optional()
                            })
                            .strict()
                            .optional(),
                        capability: z.string().max(100).optional()
                    })
                    .strict()
            )
            .max(12),
        edges: z
            .array(z.object({ source: z.string().max(40), target: stepId, branch: z.enum(['true', 'false']).optional() }).strict())
            .max(24),
        questions: z.array(z.string().trim().min(1).max(400)).max(6).default([]),
        blockers: z.array(z.string().trim().min(1).max(400)).max(6).default([])
    })
    .strict()
export type WorkflowSpec = z.infer<typeof WorkflowSchema>

/** Validate control AND data flow. This is a typed plan, not executable model-generated code. */
export function workflowProblems(value: unknown, includeRequirements = true): string[] {
    const parsed = WorkflowSchema.safeParse(value)
    if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    const workflow = parsed.data
    const problems = includeRequirements ? [...workflow.questions, ...workflow.blockers] : []
    const steps = new Map(workflow.steps.map((step) => [step.id, step]))
    if (steps.size !== workflow.steps.length) problems.push('Mã bước bị trùng.')
    if (!steps.size) problems.push('Cần xác định các bước xử lý trước khi build.')
    for (const step of workflow.steps) {
        if (includeRequirements && step.type === 'external')
            problems.push(
                `Bước ${step.label} cần tích hợp ${step.capability || 'dịch vụ bên ngoài'}; chưa có node/kết nối thực thi được cấp.`
            )
        if (step.type === 'condition' && !step.condition) problems.push(`Thiếu phép so sánh cho ${step.label}.`)
        if (step.instruction.includes('{{'))
            problems.push(`Bước ${step.label} phải dùng inputFrom thay cho biểu thức biến trong instruction.`)
    }
    const outgoing = (id: string) => workflow.edges.filter((edge) => edge.source === id)
    if (outgoing('start').length !== 1) problems.push('Start phải có đúng một kết nối ra.')
    const edgeKeys = new Set<string>()
    for (const edge of workflow.edges) {
        const key = `${edge.source}:${edge.target}:${edge.branch || ''}`
        if (edgeKeys.has(key)) problems.push('Kết nối bị trùng.')
        edgeKeys.add(key)
        if ((edge.source !== 'start' && !steps.has(edge.source)) || !steps.has(edge.target))
            problems.push('Kết nối trỏ tới bước không tồn tại.')
        if (edge.source === edge.target) problems.push('Không cho phép bước tự nối vào chính nó.')
        if (edge.branch && steps.get(edge.source)?.type !== 'condition') problems.push('Chỉ bước điều kiện được có cổng true/false.')
    }
    for (const step of workflow.steps) {
        const edges = outgoing(step.id)
        if (step.type === 'condition') {
            if (edges.length !== 2 || !edges.some((edge) => edge.branch === 'true') || !edges.some((edge) => edge.branch === 'false'))
                problems.push(`Điều kiện ${step.label} phải nối đủ hai nhánh true/false.`)
        } else if (edges.length > 1) problems.push(`Bước ${step.label} có nhiều nhánh ra nhưng chưa có điều kiện.`)
        if (!edges.length && !['llm', 'agent', 'reply', 'external'].includes(step.type))
            problems.push(`Bước ${step.label} chưa nối tới đầu ra.`)
    }
    const visited = new Set<string>()
    const active = new Set<string>()
    const order: string[] = []
    const visit = (id: string) => {
        if (active.has(id)) {
            problems.push('Workflow có vòng lặp chưa được hỗ trợ.')
            return
        }
        if (visited.has(id)) return
        visited.add(id)
        active.add(id)
        for (const edge of outgoing(id)) visit(edge.target)
        active.delete(id)
        order.unshift(id)
    }
    visit('start')
    if (workflow.steps.some((step) => !visited.has(step.id))) problems.push('Có bước không nối từ Start.')
    // A data source must be executed on every path reaching its consumer (dominance).
    const dominators = new Map<string, Set<string>>([['start', new Set(['start'])]])
    for (const id of order.filter((id) => id !== 'start')) {
        const predecessors = workflow.edges
            .filter((edge) => edge.target === id)
            .map((edge) => dominators.get(edge.source) || new Set<string>())
        const shared = new Set(predecessors[0] || [])
        for (const set of predecessors.slice(1)) for (const key of shared) if (!set.has(key)) shared.delete(key)
        for (const source of steps.get(id)?.inputFrom || [])
            if (!shared.has(source)) problems.push(`Bước ${id} tham chiếu dữ liệu ${source} chưa chắc đã được thực thi.`)
        shared.add(id)
        dominators.set(id, shared)
    }
    return [...new Set(problems)]
}

export const WORKFLOW_CAPABILITIES = [
    'llm: một bước xử lý văn bản, tóm tắt, phân tích, tạo kịch bản/prompt; dùng model workspace',
    'agent: trợ lý dùng các tool thực sự đã cấp, trả lời cuối; web chỉ khi workspace bật',
    'retriever: tìm đoạn tài liệu đã đính kèm hoặc DocumentStore; phải có nguồn',
    'condition: so sánh contains/equal/notEmpty/isEmpty với đầu ra bước trước; đúng hai nhánh true/false',
    'reply: gửi nguyên văn câu thông báo tiếng Việt cố định trong instruction trực tiếp cho người dùng (không gọi LLM; viết đúng câu trả lời lịch sự cho người dùng, để inputFrom: [])',
    'external: khả năng chưa được tích hợp như Veo/video, xuất Excel/file, SQL/API/MCP tùy ý, vòng lặp; ghi capability và blocker cụ thể, KHÔNG đổi thành bước llm để giả vờ làm xong'
].join('\n')
