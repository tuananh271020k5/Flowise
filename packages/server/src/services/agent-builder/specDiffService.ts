import { AgentSpec } from './types'

export interface SpecDiffField<T> {
    from?: T
    to?: T
    changed: boolean
}

export interface SpecDiffResult {
    hasChanges: boolean
    name: SpecDiffField<string>
    goal: SpecDiffField<string>
    instructions: SpecDiffField<string>
    tools: {
        added: string[]
        removed: string[]
        unchanged: string[]
        changed: boolean
    }
    model: {
        from?: string
        to?: string
        changed: boolean
    }
    evaluationExamples: {
        added: Array<{ input: string; assertions: string[] }>
        removed: Array<{ input: string; assertions: string[] }>
        modified: Array<{ input: string; oldAssertions: string[]; newAssertions: string[] }>
        changed: boolean
    }
    summary: string[]
}

/**
 * Tính toán sự khác biệt có cấu trúc giữa 2 AgentSpec (PH3-T05).
 */
export function computeSpecDiff(fromSpec: AgentSpec | null | undefined, toSpec: AgentSpec | null | undefined): SpecDiffResult {
    const from = fromSpec || ({} as Partial<AgentSpec>)
    const to = toSpec || ({} as Partial<AgentSpec>)

    const summary: string[] = []

    // 1. So sánh tên trợ lý
    const nameChanged = (from.name || '') !== (to.name || '')
    if (nameChanged) {
        if (!from.name && to.name) {
            summary.push(`Đặt tên trợ lý: "${to.name}"`)
        } else if (from.name && !to.name) {
            summary.push(`Xóa tên trợ lý (cũ: "${from.name}")`)
        } else {
            summary.push(`Đổi tên trợ lý: "${from.name}" → "${to.name}"`)
        }
    }

    // 2. So sánh mục tiêu
    const goalChanged = (from.goal || '') !== (to.goal || '')
    if (goalChanged) {
        summary.push(`Cập nhật mục tiêu hoạt động của trợ lý`)
    }

    // 3. So sánh hướng dẫn vận hành
    const instructionsChanged = (from.instructions || '') !== (to.instructions || '')
    if (instructionsChanged) {
        summary.push(`Cập nhật hướng dẫn vận hành (system prompt)`)
    }

    // 4. So sánh danh sách công cụ (tools)
    const getToolName = (t: any): string => (typeof t === 'string' ? t : t?.name || t?.id || '')
    const fromTools = Array.isArray(from.tools) ? from.tools.map(getToolName).filter(Boolean) : []
    const toTools = Array.isArray(to.tools) ? to.tools.map(getToolName).filter(Boolean) : []

    const addedTools = toTools.filter((t) => !fromTools.includes(t))
    const removedTools = fromTools.filter((t) => !toTools.includes(t))
    const unchangedTools = toTools.filter((t) => fromTools.includes(t))
    const toolsChanged = addedTools.length > 0 || removedTools.length > 0

    if (addedTools.length > 0) {
        summary.push(`Thêm ${addedTools.length} công cụ: ${addedTools.join(', ')}`)
    }
    if (removedTools.length > 0) {
        summary.push(`Xóa ${removedTools.length} công cụ: ${removedTools.join(', ')}`)
    }

    // 5. So sánh cấu hình Model / Profile
    const fromModelRef = from.modelProfileRef || (from as any).model?.name || ''
    const toModelRef = to.modelProfileRef || (to as any).model?.name || ''
    const modelChanged = fromModelRef !== toModelRef
    if (modelChanged) {
        summary.push(`Đổi mô hình AI: ${fromModelRef || 'mặc định'} → ${toModelRef || 'mặc định'}`)
    }

    // 6. So sánh kịch bản kiểm thử (evaluationExamples)
    const fromExamples = Array.isArray(from.evaluationExamples) ? from.evaluationExamples : []
    const toExamples = Array.isArray(to.evaluationExamples) ? to.evaluationExamples : []

    const fromMap = new Map(fromExamples.map((ex) => [ex.input, ex]))
    const toMap = new Map(toExamples.map((ex) => [ex.input, ex]))

    const addedExamples: Array<{ input: string; assertions: string[] }> = []
    const removedExamples: Array<{ input: string; assertions: string[] }> = []
    const modifiedExamples: Array<{ input: string; oldAssertions: string[]; newAssertions: string[] }> = []

    for (const [input, ex] of toMap.entries()) {
        if (!fromMap.has(input)) {
            addedExamples.push({ input, assertions: ex.assertions || [] })
        } else {
            const oldEx = fromMap.get(input)!
            const oldAssertions = (oldEx.assertions || []).slice().sort().join(';')
            const newAssertions = (ex.assertions || []).slice().sort().join(';')
            if (oldAssertions !== newAssertions) {
                modifiedExamples.push({
                    input,
                    oldAssertions: oldEx.assertions || [],
                    newAssertions: ex.assertions || []
                })
            }
        }
    }

    for (const [input, ex] of fromMap.entries()) {
        if (!toMap.has(input)) {
            removedExamples.push({ input, assertions: ex.assertions || [] })
        }
    }

    const examplesChanged = addedExamples.length > 0 || removedExamples.length > 0 || modifiedExamples.length > 0
    if (addedExamples.length > 0) {
        summary.push(`Thêm ${addedExamples.length} kịch bản kiểm thử mới`)
    }
    if (removedExamples.length > 0) {
        summary.push(`Xóa ${removedExamples.length} kịch bản kiểm thử`)
    }
    if (modifiedExamples.length > 0) {
        summary.push(`Sửa ${modifiedExamples.length} kịch bản kiểm thử`)
    }

    const hasChanges = nameChanged || goalChanged || instructionsChanged || toolsChanged || modelChanged || examplesChanged

    if (!hasChanges) {
        summary.push('Không có thay đổi giữa hai phiên bản')
    }

    return {
        hasChanges,
        name: { from: from.name, to: to.name, changed: nameChanged },
        goal: { from: from.goal, to: to.goal, changed: goalChanged },
        instructions: { from: from.instructions, to: to.instructions, changed: instructionsChanged },
        tools: {
            added: addedTools,
            removed: removedTools,
            unchanged: unchangedTools,
            changed: toolsChanged
        },
        model: {
            from: fromModelRef,
            to: toModelRef,
            changed: modelChanged
        },
        evaluationExamples: {
            added: addedExamples,
            removed: removedExamples,
            modified: modifiedExamples,
            changed: examplesChanged
        },
        summary
    }
}
