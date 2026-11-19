import { z } from 'zod'
export const WORKFLOW_TEMPLATE_ID = 'workflow_v1'
export const WORKFLOW_TEMPLATE_VERSION = '1.0.0'

const stepId = z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,39}$/)
    .refine((value) => value !== 'start')
const stateKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, 'Tên biến trạng thái chỉ gồm chữ cái, số và dấu gạch dưới')
const text = z.string().trim().min(1).max(2000)

export const StateUpdateSchema = z
    .object({
        key: stateKey,
        valueFrom: z.enum(['output', 'start']).default('output'),
        literalValue: z.string().max(500).optional()
    })
    .strict()

export const HttpStepConfigSchema = z
    .object({
        connectorId: z.string().max(100).optional(),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
        path: z.string().max(300).optional(),
        bodyTemplate: z.string().max(2000).optional()
    })
    .strict()

export const BRANCH_VALUES = ['true', 'false', '0', '1', '2', '3', '4', '5'] as const
export type WorkflowBranch = (typeof BRANCH_VALUES)[number]

export function normalizeBranchIndex(branch?: string): string | undefined {
    if (!branch) return undefined
    if (branch === 'true') return '0'
    if (branch === 'false') return '1'
    return branch
}

const InitialStatePreprocess = z.preprocess(
    (val) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            return Object.entries(val as Record<string, unknown>).map(([key, value]) => ({
                key,
                value: typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
            }))
        }
        return val
    },
    z
        .array(z.object({ key: stateKey, value: z.string().max(500).default('') }).strict())
        .max(16)
        .optional()
)

const UpdateStatePreprocess = z.preprocess((val) => {
    if (typeof val === 'string' && val.trim()) {
        return [{ key: val.trim(), valueFrom: 'output' }]
    }
    if (Array.isArray(val)) {
        return val.map((entry) => (typeof entry === 'string' && entry.trim() ? { key: entry.trim(), valueFrom: 'output' } : entry))
    }
    return val
}, z.array(StateUpdateSchema).max(8).optional())

export const WorkflowScheduleSchema = z
    .object({
        cronExpression: z
            .string()
            .trim()
            .regex(
                /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/L?W#]+)\s+(\*|[0-9,\-*/A-Za-z]+)\s+(\*|[0-9,\-*/A-Za-z#L?]+)$/,
                'Biểu thức cron 5 trường không hợp lệ (ví dụ: 0 17 * * *)'
            ),
        timezone: z.string().trim().min(1).max(64).default('Asia/Ho_Chi_Minh'),
        defaultInput: z.string().trim().min(1).max(1000),
        description: z.string().trim().max(300).optional()
    })
    .strict()

export const WorkflowSchema = z
    .object({
        summary: z.string().trim().min(1).max(1000),
        archetype: z.string().trim().max(60).optional(),
        canvasVersion: z.enum(['v1', 'v2']).optional(),
        suggestions: z.array(z.string().trim().min(1).max(220)).max(4).optional(),
        enableMemory: z.boolean().optional(),
        schedule: WorkflowScheduleSchema.optional(),
        initialState: InitialStatePreprocess,
        steps: z
            .array(
                z
                    .object({
                        id: stepId,
                        type: z.enum([
                            'llm',
                            'agent',
                            'retriever',
                            'condition',
                            'conditionAgent',
                            'loop',
                            'iteration',
                            'http',
                            'humanInput',
                            'reply',
                            'external'
                        ]),
                        label: z.string().trim().min(1).max(100),
                        instruction: text,
                        inputFrom: z.array(z.string().max(40)).max(12).default([]),
                        stateKeys: z.array(stateKey).max(8).optional(),
                        updateState: UpdateStatePreprocess,
                        sourceIds: z.array(z.string().max(150)).max(10).optional(),
                        mcpServerIds: z.array(z.string().max(150)).max(10).optional(),
                        nativeTools: z
                            .array(
                                z
                                    .string()
                                    .trim()
                                    .regex(/^[a-zA-Z0-9_]{1,80}$/, 'Tên node công cụ không hợp lệ')
                            )
                            .max(12)
                            .optional(),
                        condition: z
                            .object({
                                operation: z.enum(['contains', 'equal', 'notEmpty', 'isEmpty']),
                                value: z.string().max(200).optional()
                            })
                            .strict()
                            .optional(),
                        scenarios: z.array(z.string().trim().min(1).max(300)).min(2).max(6).optional(),
                        loopBackTo: stepId.optional(),
                        maxLoops: z.number().int().min(1).max(5).optional(),
                        fallbackMessage: z.string().trim().min(1).max(500).optional(),
                        http: HttpStepConfigSchema.optional(),
                        enableFeedback: z.boolean().optional(),
                        capability: z.string().max(100).optional()
                    })
                    .strict()
            )
            .max(16),
        edges: z.array(z.object({ source: z.string().max(40), target: stepId, branch: z.enum(BRANCH_VALUES).optional() }).strict()).max(32),
        questions: z.array(z.string().trim().min(1).max(400)).max(6).default([]),
        blockers: z.array(z.string().trim().min(1).max(400)).max(6).default([])
    })
    .strict()
export type WorkflowSpec = z.infer<typeof WorkflowSchema>

const BRANCHING_STEP_TYPES = new Set(['condition', 'conditionAgent', 'humanInput'])
const TERMINAL_CAPABLE_TYPES = new Set(['llm', 'agent', 'reply', 'loop', 'iteration', 'http', 'external'])

/** Validate control AND data flow. This is a typed plan, not executable model-generated code. */
export function workflowProblems(value: unknown, includeRequirements = true): string[] {
    const parsed = WorkflowSchema.safeParse(value)
    if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    const workflow = parsed.data
    const steps = new Map(workflow.steps.map((step) => [step.id, step]))
    // Optional clarifying questions only block build if there are literally 0 steps planned yet;
    // once a valid step graph exists, only explicit technical blockers prevent "xong" from building.
    const problems = includeRequirements ? [...workflow.blockers, ...(!steps.size ? workflow.questions : [])] : []
    if (steps.size !== workflow.steps.length) problems.push('Mã bước bị trùng.')
    if (!steps.size) problems.push('Cần xác định các bước xử lý trước khi build.')

    const initialState = workflow.initialState || []
    const stateNames = new Set(initialState.map((item) => item.key))
    if (stateNames.size !== initialState.length) problems.push('Tên biến trạng thái trong initialState bị trùng.')

    for (const step of workflow.steps) {
        if (includeRequirements && step.type === 'external')
            problems.push(
                `Bước ${step.label} cần tích hợp ${step.capability || 'dịch vụ bên ngoài'}; chưa có node/kết nối thực thi được cấp.`
            )
        if (step.type === 'condition' && !step.condition) problems.push(`Thiếu phép so sánh cho ${step.label}.`)
        if (step.type === 'conditionAgent') {
            if (!step.scenarios || step.scenarios.length < 2)
                problems.push(`Bước AI phân nhánh ${step.label} cần ít nhất 2 kịch bản (scenarios).`)
            else if (new Set(step.scenarios.map((s) => s.toLowerCase())).size !== step.scenarios.length)
                problems.push(`Các kịch bản (scenarios) trong bước ${step.label} không được trùng nhau.`)
        }
        if (step.type === 'loop') {
            if (!step.loopBackTo || !steps.has(step.loopBackTo))
                problems.push(`Bước vòng lặp ${step.label} phải chỉ định loopBackTo trỏ tới một bước hợp lệ trước đó.`)
            else if (step.loopBackTo === step.id) problems.push(`Bước vòng lặp ${step.label} không được quay lại chính nó.`)
        }
        if (step.type === 'http') {
            if (!step.http) problems.push(`Bước HTTP ${step.label} thiếu cấu hình http.`)
            if (step.http?.path?.includes('{{') || step.http?.bodyTemplate?.includes('{{'))
                problems.push(`Bước HTTP ${step.label} không được chèn biểu thức {{...}} trực tiếp vào path/bodyTemplate.`)
        }
        if (step.instruction.includes('{{') || step.fallbackMessage?.includes('{{'))
            problems.push(`Bước ${step.label} phải dùng inputFrom/stateKeys thay cho biểu thức biến trong instruction.`)
        for (const update of step.updateState || []) {
            if (update.literalValue?.includes('{{'))
                problems.push(`Bước ${step.label} không được chèn biểu thức {{...}} vào literalValue của updateState.`)
        }
    }

    const outgoing = (id: string) => workflow.edges.filter((edge) => edge.source === id)
    if (outgoing('start').length !== 1) problems.push('Start phải có đúng một kết nối ra.')
    const edgeKeys = new Set<string>()
    for (const edge of workflow.edges) {
        const normalizedBranch = normalizeBranchIndex(edge.branch) || ''
        const key = `${edge.source}:${edge.target}:${normalizedBranch}`
        if (edgeKeys.has(key)) problems.push('Kết nối bị trùng.')
        edgeKeys.add(key)
        if ((edge.source !== 'start' && !steps.has(edge.source)) || !steps.has(edge.target))
            problems.push('Kết nối trỏ tới bước không tồn tại.')
        if (edge.source === edge.target) problems.push('Không cho phép bước tự nối vào chính nó.')
        const sourceType = steps.get(edge.source)?.type
        if (edge.branch && (!sourceType || !BRANCHING_STEP_TYPES.has(sourceType)))
            problems.push('Chỉ bước điều kiện (condition, conditionAgent) hoặc duyệt thủ công (humanInput) được có nhánh rẽ.')
    }

    for (const step of workflow.steps) {
        const edges = outgoing(step.id)
        const ports = new Set(edges.map((edge) => normalizeBranchIndex(edge.branch)))
        if (step.type === 'condition') {
            if (edges.length !== 2 || !ports.has('0') || !ports.has('1'))
                problems.push(`Điều kiện ${step.label} phải nối đủ hai nhánh true/false.`)
        } else if (step.type === 'humanInput') {
            if (edges.length !== 2 || !ports.has('0') || !ports.has('1'))
                problems.push(`Bước chờ người duyệt ${step.label} phải nối đủ hai nhánh đồng ý (true/0) và từ chối (false/1).`)
        } else if (step.type === 'conditionAgent') {
            const expectedCount = step.scenarios?.length || 2
            const expectedPorts = Array.from({ length: expectedCount }, (_, idx) => String(idx))
            if (edges.length !== expectedCount || expectedPorts.some((port) => !ports.has(port)))
                problems.push(`Bước AI phân nhánh ${step.label} phải nối đủ ${expectedCount} nhánh từ 0 đến ${expectedCount - 1}.`)
        } else if (step.type === 'loop') {
            if (edges.length > 0)
                problems.push(`Bước vòng lặp ${step.label} dùng loopBackTo để quay lại bước trước, không được nối thêm cạnh ra.`)
        } else if (edges.length > 1) {
            problems.push(`Bước ${step.label} có nhiều nhánh ra nhưng chưa có điều kiện.`)
        }
        if (!edges.length && !TERMINAL_CAPABLE_TYPES.has(step.type)) problems.push(`Bước ${step.label} chưa nối tới đầu ra.`)
    }

    const visited = new Set<string>()
    const active = new Set<string>()
    const order: string[] = []
    const visit = (id: string) => {
        if (active.has(id)) {
            problems.push(
                'Workflow có vòng lặp cạnh trực tiếp không hợp lệ; để quay lại bước trước hãy dùng bước type="loop" với loopBackTo.'
            )
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

    // A data source (and any loopBackTo target) must be executed on every path reaching its consumer (dominance).
    const dominators = new Map<string, Set<string>>([['start', new Set(['start'])]])
    for (const id of order.filter((id) => id !== 'start')) {
        const predecessors = workflow.edges
            .filter((edge) => edge.target === id)
            .map((edge) => dominators.get(edge.source) || new Set<string>())
        const shared = new Set(predecessors[0] || [])
        for (const set of predecessors.slice(1)) for (const key of shared) if (!set.has(key)) shared.delete(key)
        const currentStep = steps.get(id)
        for (const source of currentStep?.inputFrom || [])
            if (!shared.has(source)) problems.push(`Bước ${id} tham chiếu dữ liệu ${source} chưa chắc đã được thực thi.`)
        if (currentStep?.type === 'loop' && currentStep.loopBackTo && !shared.has(currentStep.loopBackTo))
            problems.push(
                `Bước vòng lặp ${id} chỉ được phép loopBackTo về bước tổ tiên chắc chắn đã chạy trên nhánh đó (${currentStep.loopBackTo}).`
            )
        shared.add(id)
        dominators.set(id, shared)
    }
    return [...new Set(problems)]
}

export const WORKFLOW_CAPABILITIES = [
    'llm: một bước xử lý văn bản, tóm tắt, phân tích, tạo truy vấn/kịch bản/báo cáo; có thể cập nhật Flow State qua updateState',
    'agent: trợ lý tự chọn và gọi các node công cụ gốc của Flowise trong nativeTools (projectTrackerTool cho GitHub Issues/Trello/Board dự án, telegramNotifyTool cho Telegram, excelOfficeTool, wordOfficeTool, gmail, jiraTool, slackMCP, githubMCP, sequentialThinkingMCP, calculator, currentDateTime, webScraperTool...) hoặc MCP ngoài trong mcpServerIds; có thể bật enableMemory:true ở cấp workflow để nhớ lịch sử dự án & xác nhận 2 lượt (đề xuất trước -> người dùng nhắn đồng ý -> mới ghi dữ liệu thật)',
    'schedule (cấp workflow): chạy tác vụ định kỳ độc lập với phiên chat qua Flowise ScheduleBeat (ví dụ cronExpression:"0 17 * * *", timezone:"Asia/Ho_Chi_Minh", defaultInput:"Tổng hợp báo cáo tiến độ dự án hằng ngày lúc 17h và gửi qua Telegram/Email")',
    'retriever: tìm đoạn tài liệu đã đính kèm hoặc Document Store (đọc truy vấn từ inputFrom hoặc biến Flow State qua stateKeys); phải có nguồn',
    'condition: so sánh chuỗi contains/equal/notEmpty/isEmpty với đầu ra bước trước; đúng hai nhánh true/false',
    'conditionAgent: dùng AI phân loại ngữ cảnh động thành 2..6 kịch bản (scenarios); nối cạnh ra với branch "0", "1", ... tương ứng từng kịch bản',
    'loop: vòng lặp tự sửa sai (như Agentic RAG), quay lại bước tổ tiên qua loopBackTo với maxLoops (1..5) và fallbackMessage tiếng Việt; không có cạnh ra',
    'iteration: lặp qua từng phần tử của mảng JSON đầu vào (tự tạo khối Iteration kèm bước xử lý từng phần tử)',
    'http: gọi REST API (GET/POST/...) tới kết nối API đã đăng ký trong apiConnectors của Workspace',
    'humanInput: tạm dừng luồng để xin người dùng phê duyệt (nhánh "true"/"0") hoặc từ chối (nhánh "false"/"1")',
    'reply: gửi nguyên văn câu thông báo tiếng Việt cố định trong instruction trực tiếp cho người dùng (không gọi LLM; để inputFrom: [])',
    'external: khả năng chưa kết nối/cấu hình trong Workspace (ví dụ Veo/video hoặc dịch vụ ngoài chưa gắn MCP/API); ghi capability và blocker cụ thể, KHÔNG giả vờ đã thực thi'
].join('\n')
