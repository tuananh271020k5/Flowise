import { validateNodeMetadata } from './nodeRegistry'

export interface FlowValidationResult {
    valid: boolean
    errors: string[]
    warnings: string[]
    nodeCount: number
    edgeCount: number
}

/**
 * Thẩm định đồ thị Agentflow V2 ở phía Server trước khi lưu vào Database (PH2-T05).
 * Kiểm tra tính liên thông, kiểm tra từng node theo allowlist registry, ngăn chặn node mồ côi hoặc đồ thị hỏng.
 */
export const validateFlowGraph = (graph: {
    nodes?: Array<{
        id: string
        type?: string
        data?: {
            name?: string
            version?: number
            type?: string
            inputs?: Record<string, unknown>
        }
    }>
    edges?: Array<{
        id?: string
        source: string
        target: string
        sourceHandle?: string
        targetHandle?: string
    }>
}): FlowValidationResult => {
    const errors: string[] = []
    const warnings: string[] = []

    const nodes = graph?.nodes || []
    const edges = graph?.edges || []

    const nodeCount = nodes.length
    const edgeCount = edges.length

    // 1. Kiểm tra đồ thị rỗng
    if (nodeCount === 0) {
        errors.push('Đồ thị Agentflow không được để rỗng (không có node nào)')
        return { valid: false, errors, warnings, nodeCount, edgeCount }
    }

    // 1.5. Chế độ thẩm định Flowise V1 Sequential Agents (MULTIAGENT — /agentcanvas)
    const isV1SequentialGraph = nodes.some((n) => n.data?.name === 'seqStart')
    if (isV1SequentialGraph) {
        const v1NodeIds = new Set<string>()
        let seqStartCount = 0
        let seqWorkCount = 0
        let seqEndCount = 0
        let hasChatModel = false

        for (const node of nodes) {
            if (!node.id) {
                errors.push('Phát hiện node V1 không có ID')
                continue
            }
            if (v1NodeIds.has(node.id)) {
                errors.push(`Phát hiện trùng lặp Node ID: "${node.id}"`)
            }
            v1NodeIds.add(node.id)
            const name = node.data?.name || ''
            if (name === 'seqStart') seqStartCount++
            if (name === 'seqEnd') seqEndCount++
            if (['seqAgent', 'seqLLMNode', 'seqConditionAgent', 'seqCustomFunction', 'seqToolNode'].includes(name)) seqWorkCount++
            if (['chatOpenAI', 'chatAnthropic', 'chatGoogleGenerativeAI', 'chatOllama'].includes(name)) hasChatModel = true
        }

        if (seqStartCount !== 1) errors.push(`Đồ thị V1 phải có đúng 1 node seqStart (hiện có: ${seqStartCount})`)
        if (!hasChatModel) errors.push('Đồ thị V1 phải có node Chat Model kết nối vào Start')
        if (seqWorkCount === 0) errors.push('Đồ thị V1 phải có ít nhất 1 node xử lý (Agent / LLMNode / ConditionAgent / CustomFunction)')
        if (seqEndCount === 0) errors.push('Đồ thị V1 phải có ít nhất 1 node End (seqEnd)')

        for (const edge of edges) {
            if (!edge.source || !edge.target) {
                errors.push(`Cạnh "${edge.id || 'unknown'}" thiếu source hoặc target`)
                continue
            }
            if (!v1NodeIds.has(edge.source)) errors.push(`Cạnh trỏ tới source không tồn tại: "${edge.source}"`)
            if (!v1NodeIds.has(edge.target)) errors.push(`Cạnh trỏ tới target không tồn tại: "${edge.target}"`)
        }

        const seqStartNode = nodes.find((n) => n.data?.name === 'seqStart')
        if (seqStartNode && !edges.some((e) => e.source === seqStartNode.id)) {
            errors.push(`Start node "${seqStartNode.id}" chưa được nối sang bước xử lý tiếp theo`)
        }

        return { valid: errors.length === 0, errors, warnings, nodeCount, edgeCount }
    }

    // 2. Thu thập và kiểm tra trùng lặp Node IDs
    const nodeIds = new Set<string>()
    let startNodeCount = 0
    let agentNodeCount = 0
    let directReplyCount = 0

    for (const node of nodes) {
        if (!node.id) {
            errors.push('Phát hiện node không có ID')
            continue
        }
        if (nodeIds.has(node.id)) {
            errors.push(`Phát hiện trùng lặp Node ID: "${node.id}"`)
        }
        nodeIds.add(node.id)

        const nodeName = node.data?.name

        // Đếm các loại node quan trọng
        if (nodeName === 'startAgentflow') {
            startNodeCount++
        } else if (
            nodeName === 'agentAgentflow' ||
            nodeName === 'llmAgentflow' ||
            nodeName === 'conditionAgentAgentflow' ||
            nodeName === 'httpAgentflow' ||
            nodeName === 'humanInputAgentflow' ||
            nodeName === 'iterationAgentflow'
        ) {
            agentNodeCount++
        } else if (nodeName === 'directReplyAgentflow') {
            directReplyCount++
        }

        // Thẩm định từng node qua Node Registry allowlist
        if (node.data) {
            const nodeValidation = validateNodeMetadata({
                name: node.data.name,
                version: node.data.version,
                type: node.data.type,
                inputs: node.data.inputs
            })
            if (!nodeValidation.valid) {
                errors.push(`Node "${node.id}" không hợp lệ: ${nodeValidation.errors.join('; ')}`)
            }
        } else {
            errors.push(`Node "${node.id}" thiếu trường data`)
        }
    }

    // 3. Kiểm tra các node bắt buộc
    if (startNodeCount === 0) {
        errors.push('Đồ thị Agentflow bắt buộc phải có 1 Start node (startAgentflow)')
    } else if (startNodeCount > 1) {
        errors.push(`Đồ thị Agentflow chỉ được phép có đúng 1 Start node (hiện có: ${startNodeCount})`)
    }

    if (agentNodeCount === 0 && directReplyCount === 0) {
        errors.push('Đồ thị Agentflow phải chứa ít nhất 1 Agent node hoặc DirectReply node để xử lý hội thoại')
    }

    // 4. Kiểm tra tính toàn vẹn của các cạnh (Edges)
    const connectedTargets = new Set<string>()
    const connectedSources = new Set<string>()

    for (const edge of edges) {
        if (!edge.source || !edge.target) {
            errors.push(`Cạnh "${edge.id || 'unknown'}" thiếu source hoặc target`)
            continue
        }

        if (!nodeIds.has(edge.source)) {
            errors.push(`Cạnh "${edge.id || 'unknown'}" trỏ tới source không tồn tại: "${edge.source}"`)
        }
        if (!nodeIds.has(edge.target)) {
            errors.push(`Cạnh "${edge.id || 'unknown'}" trỏ tới target không tồn tại: "${edge.target}"`)
        }

        connectedSources.add(edge.source)
        connectedTargets.add(edge.target)
    }

    // 5. Kiểm tra tính liên thông từ Start Node (Connectivity)
    const startNodes = nodes.filter((n) => n.data?.name === 'startAgentflow')
    if (startNodes.length === 1) {
        const startId = startNodes[0].id
        const isStartConnected = edges.some((e) => e.source === startId)
        if (!isStartConnected) {
            errors.push(`Start node "${startId}" chưa được kết nối tới bất kỳ node nào trong luồng`)
        }

        // Kiểm tra xem Start có nối tới bước xử lý hợp lệ trong allowlist không
        const connectedFromStart = edges.filter((e) => e.source === startId).map((e) => e.target)
        const hasValidStartTarget = connectedFromStart.some((targetId) => {
            const targetNode = nodes.find((n) => n.id === targetId)
            return [
                'agentAgentflow',
                'directReplyAgentflow',
                'llmAgentflow',
                'retrieverAgentflow',
                'conditionAgentflow',
                'conditionAgentAgentflow',
                'iterationAgentflow',
                'httpAgentflow',
                'humanInputAgentflow'
            ].includes(targetNode?.data?.name || '')
        })

        if (!hasValidStartTarget && edges.length > 0) {
            errors.push('Start node phải được kết nối tới một bước xử lý được hỗ trợ')
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        nodeCount,
        edgeCount
    }
}
