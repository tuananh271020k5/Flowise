import { WorkflowSpec } from '../workflow'

export interface LayoutOptions {
    startX?: number
    centerY?: number
    colGap?: number
    rowGap?: number
}

export interface NodeCoordinates {
    x: number
    y: number
    depth: number
    row: number
}

/**
 * Thuật toán xếp bố cục đồ thị phân tầng (Layered DAG Auto-Layout) cho cả Flowise V1 & V2.
 * Thay thế công thức lưới index % 4 (gây cắt chéo dây ziczac):
 * - Luồng chính chảy mượt từ trái sang phải theo chiều sâu topo (depth).
 * - Các nhánh rẽ từ Condition / ConditionAgent / HumanInput tỏa đều theo trục dọc quanh node cha.
 */
export function computeWorkflowLayout(
    workflow: Pick<WorkflowSpec, 'steps' | 'edges'>,
    options: LayoutOptions = {}
): Map<string, NodeCoordinates> {
    const startX = options.startX ?? 80
    const centerY = options.centerY ?? 220
    const colGap = options.colGap ?? 380
    const rowGap = options.rowGap ?? 210

    const stepIds = new Set(workflow.steps.map((s) => s.id))
    const outgoing = new Map<string, Array<{ target: string; branch?: string }>>()
    const incoming = new Map<string, string[]>()

    const addEdge = (src: string, dst: string, branch?: string) => {
        if (!outgoing.has(src)) outgoing.set(src, [])
        outgoing.get(src)!.push({ target: dst, branch })
        if (!incoming.has(dst)) incoming.set(dst, [])
        incoming.get(dst)!.push(src)
    }

    for (const edge of workflow.edges) {
        if ((edge.source === 'start' || stepIds.has(edge.source)) && stepIds.has(edge.target)) {
            addEdge(edge.source, edge.target, edge.branch)
        }
    }

    // 1. Tính chiều sâu dài nhất (longest-path depth) từ 'start' (bỏ qua cạnh ngược nếu có)
    const depth = new Map<string, number>([['start', 0]])
    const queue: string[] = ['start']
    let guard = 0
    while (queue.length > 0 && guard < 1000) {
        guard++
        const current = queue.shift()!
        const curDepth = depth.get(current) ?? 0
        for (const edge of outgoing.get(current) || []) {
            const nextDepth = curDepth + 1
            if ((depth.get(edge.target) ?? -1) < nextDepth && nextDepth <= workflow.steps.length + 1) {
                depth.set(edge.target, nextDepth)
                queue.push(edge.target)
            }
        }
    }

    // Bảo vệ các node mồ côi nếu có
    for (const step of workflow.steps) {
        if (!depth.has(step.id)) depth.set(step.id, 1)
    }

    // 2. Tính trọng số thứ tự dọc (barycenter) theo thứ tự nhánh của node cha để hạn chế cắt dây
    const branchRank = new Map<string, number>([['start', 0]])
    const maxDepth = Math.max(0, ...depth.values())
    const byLayer = new Map<number, string[]>()
    for (let d = 0; d <= maxDepth; d++) byLayer.set(d, [])
    byLayer.get(0)!.push('start')
    for (const step of workflow.steps) {
        byLayer.get(depth.get(step.id) ?? 1)!.push(step.id)
    }

    for (let d = 0; d <= maxDepth; d++) {
        const layerNodes = byLayer.get(d)!
        if (d > 0) {
            layerNodes.sort((a, b) => {
                const rankA = branchRank.get(a) ?? 0
                const rankB = branchRank.get(b) ?? 0
                if (rankA !== rankB) return rankA - rankB
                return a.localeCompare(b)
            })
        }

        const count = layerNodes.length
        layerNodes.forEach((nodeId, idx) => {
            const centeredRow = idx - (count - 1) / 2
            const children = outgoing.get(nodeId) || []
            children.forEach((edge, childIdx) => {
                const childOffset = children.length > 1 ? (childIdx - (children.length - 1) / 2) * 1.15 : 0
                const proposed = centeredRow * 10 + childOffset
                if (!branchRank.has(edge.target)) {
                    branchRank.set(edge.target, proposed)
                } else {
                    branchRank.set(edge.target, (branchRank.get(edge.target)! + proposed) / 2)
                }
            })
        })
    }

    // 3. Quy đổi sang tọa độ (x, y) đều đẹp
    const coords = new Map<string, NodeCoordinates>()
    for (let d = 0; d <= maxDepth; d++) {
        const layerNodes = byLayer.get(d)!
        const count = layerNodes.length
        layerNodes.forEach((nodeId, idx) => {
            const row = idx - (count - 1) / 2
            coords.set(nodeId, {
                x: Math.round(startX + d * colGap),
                y: Math.round(centerY + row * rowGap),
                depth: d,
                row
            })
        })
    }

    return coords
}
