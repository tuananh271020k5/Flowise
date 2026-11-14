/**
 * Node Metadata Registry cho Flowise Agentflow V2.
 * Định nghĩa whitelist các node được phép, pinned version theo runtime thực tế,
 * ngăn chặn chèn các node ngoài allowlist hoặc node lỗi thời/không an toàn (PH2-T02).
 */

export interface NodeParamMeta {
    name: string
    type: string
    required?: boolean
    default?: unknown
}

export interface NodeMetadata {
    name: string
    label: string
    type: string
    category: string
    supportedVersions: number[]
    recommendedVersion: number
    color: string
    baseClasses: string[]
    allowedInputs: string[]
    requiredInputs?: string[]
    description: string
}

export interface NodeValidationResult {
    valid: boolean
    nodeName: string
    errors: string[]
}

/**
 * Whitelist các node được phép dùng trong Agentflow V2 runtime.
 * Pinned chặt chẽ theo Flowise Core Apache 2.0 runtime.
 */
export const ALLOWED_AGENTFLOW_NODES: Record<string, NodeMetadata> = {
    startAgentflow: {
        name: 'startAgentflow',
        label: 'Start',
        type: 'Start',
        category: 'Agent Flows',
        supportedVersions: [1.4],
        recommendedVersion: 1.4,
        color: '#7EE787',
        baseClasses: ['Start'],
        allowedInputs: [
            'startInputType',
            'formTitle',
            'formDescription',
            'formInputTypes',
            'startEphemeralMemory',
            'startState',
            'startPersistState'
        ],
        requiredInputs: ['startInputType'],
        description: 'Starting point of the agentflow'
    },
    agentAgentflow: {
        name: 'agentAgentflow',
        label: 'Agent',
        type: 'Agent',
        category: 'Agent Flows',
        supportedVersions: [3.0, 3.1, 3.2],
        recommendedVersion: 3.2,
        color: '#4DD0E1',
        baseClasses: ['Agent'],
        allowedInputs: [
            'agentModel',
            'agentMessages',
            'agentTools',
            'agentToolsBuiltInOpenAI',
            'agentToolsBuiltInGemini',
            'agentToolsBuiltInAnthropic',
            'agentMemory',
            'agentMaxIterations',
            'agentSystemMessage'
        ],
        requiredInputs: ['agentModel'],
        description: 'Dynamically choose and utilize tools during runtime'
    },
    directReplyAgentflow: {
        name: 'directReplyAgentflow',
        label: 'Direct Reply',
        type: 'DirectReply',
        category: 'Agent Flows',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#4DDBBB',
        baseClasses: ['DirectReply'],
        allowedInputs: ['directReplyMessage'],
        requiredInputs: ['directReplyMessage'],
        description: 'Directly reply to the user with a message'
    },
    chatOpenAI: {
        name: 'chatOpenAI',
        label: 'ChatOpenAI',
        type: 'ChatOpenAI',
        category: 'Chat Models',
        supportedVersions: [5.0, 6.0],
        recommendedVersion: 5.0,
        color: '#10A37F',
        baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
        allowedInputs: [
            'modelName',
            'temperature',
            'maxTokens',
            'topP',
            'frequencyPenalty',
            'presencePenalty',
            'timeout',
            'basePath',
            'credential'
        ],
        requiredInputs: ['modelName'],
        description: 'Wrapper around OpenAI large language models'
    },
    chatGoogleGenerativeAI: {
        name: 'chatGoogleGenerativeAI',
        label: 'ChatGoogleGenerativeAI',
        type: 'ChatGoogleGenerativeAI',
        category: 'Chat Models',
        supportedVersions: [2.0, 3.0],
        recommendedVersion: 2.0,
        color: '#4285F4',
        baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
        allowedInputs: ['modelName', 'temperature', 'maxOutputTokens', 'topP', 'topK', 'credential'],
        requiredInputs: ['modelName'],
        description: 'Wrapper around Google Gemini language models'
    },
    chatAnthropic: {
        name: 'chatAnthropic',
        label: 'ChatAnthropic',
        type: 'ChatAnthropic',
        category: 'Chat Models',
        supportedVersions: [4.0, 5.0],
        recommendedVersion: 4.0,
        color: '#D97706',
        baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
        allowedInputs: ['modelName', 'temperature', 'maxTokens', 'credential'],
        requiredInputs: ['modelName'],
        description: 'Wrapper around Anthropic Claude language models'
    },
    chatOllama: {
        name: 'chatOllama',
        label: 'ChatOllama',
        type: 'ChatOllama',
        category: 'Chat Models',
        supportedVersions: [3.0, 4.0],
        recommendedVersion: 3.0,
        color: '#111827',
        baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
        allowedInputs: ['baseUrl', 'modelName', 'temperature'],
        requiredInputs: ['modelName'],
        description: 'Local Ollama chat model without cloud credentials'
    },
    calculator: {
        name: 'calculator',
        label: 'Calculator',
        type: 'Calculator',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#6366F1',
        baseClasses: ['Tool'],
        allowedInputs: [],
        description: 'Perform arithmetic calculations'
    },
    webSearch: {
        name: 'webSearch',
        label: 'Web Search',
        type: 'WebSearch',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#EC4899',
        baseClasses: ['Tool'],
        allowedInputs: ['apiKey', 'maxResults'],
        description: 'Search the web for up-to-date information'
    }
}

/**
 * Kiểm tra xem một node có nằm trong danh mục whitelist được phép hay không.
 */
export const isNodeAllowed = (nodeName: string, version?: number): boolean => {
    const meta = ALLOWED_AGENTFLOW_NODES[nodeName]
    if (!meta) return false
    if (typeof version === 'number') {
        return meta.supportedVersions.includes(version)
    }
    return true
}

/**
 * Lấy metadata chuẩn hóa của một node được phép.
 */
export const getNodeMetadata = (nodeName: string): NodeMetadata | undefined => {
    return ALLOWED_AGENTFLOW_NODES[nodeName]
}

/**
 * Thẩm định toàn diện một node data trước khi đưa vào Agentflow graph (PH2-T02).
 * Ngăn chặn tuyệt đối việc chèn node lạ hoặc version lỗi thời.
 */
export const validateNodeMetadata = (node: {
    name?: string
    version?: number
    type?: string
    inputs?: Record<string, unknown>
}): NodeValidationResult => {
    const errors: string[] = []
    const nodeName = node.name || 'unknown'

    if (!node.name) {
        errors.push('Node thiếu trường "name" định danh')
        return { valid: false, nodeName, errors }
    }

    const meta = ALLOWED_AGENTFLOW_NODES[node.name]
    if (!meta) {
        errors.push(`Node "${node.name}" không nằm trong danh mục whitelist được phép sử dụng`)
        return { valid: false, nodeName, errors }
    }

    // Kiểm tra version
    if (typeof node.version !== 'number') {
        errors.push(`Node "${node.name}" thiếu trường "version" số`)
    } else if (!meta.supportedVersions.includes(node.version)) {
        errors.push(
            `Node "${node.name}" sử dụng version ${node.version} không được hỗ trợ (chỉ chấp nhận: ${meta.supportedVersions.join(
                ', '
            )}). Cảnh báo: tránh dùng version lỗi thời!`
        )
    }

    // Kiểm tra type
    if (node.type && node.type !== meta.type) {
        errors.push(`Node "${node.name}" có type "${node.type}" không khớp với định nghĩa "${meta.type}"`)
    }

    // Kiểm tra inputs
    if (node.inputs && typeof node.inputs === 'object') {
        const inputKeys = Object.keys(node.inputs)

        // Kiểm tra required inputs
        if (meta.requiredInputs) {
            for (const reqInput of meta.requiredInputs) {
                if (!(reqInput in node.inputs) || node.inputs[reqInput] === undefined || node.inputs[reqInput] === '') {
                    errors.push(`Node "${node.name}" thiếu input bắt buộc: "${reqInput}"`)
                }
            }
        }

        // Kiểm tra trường lạ không được phép
        for (const key of inputKeys) {
            if (!meta.allowedInputs.includes(key)) {
                errors.push(`Node "${node.name}" chứa input không nằm trong allowlist: "${key}"`)
            }
        }
    }

    return {
        valid: errors.length === 0,
        nodeName,
        errors
    }
}
