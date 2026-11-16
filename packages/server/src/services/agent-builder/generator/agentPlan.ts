import { computeReadiness } from '../readiness'
import { AgentSpec } from '../types'
import { ALLOWED_AGENTFLOW_NODES, isNodeAllowed } from './nodeRegistry'
import { ASSISTANT_TEMPLATE_ID, ASSISTANT_TEMPLATE_VERSION } from './templates/assistantTemplate.v1'
import { KNOWLEDGE_TEMPLATE_ID, KNOWLEDGE_TEMPLATE_VERSION } from './templates/knowledgeTemplate.v1'
import { API_TEMPLATE_ID, API_TEMPLATE_VERSION } from './templates/apiTemplate.v1'
import { createHash } from 'crypto'

export interface CapabilityBinding {
    capabilityId: string
    nodeName: string
    nodeVersion: number
    type: 'model' | 'tool' | 'datasource'
    config?: Record<string, unknown>
}

export interface AgentPlan {
    id: string
    specRevisionId: string
    templateId: string
    templateVersion: string
    runtimeSha?: string
    capabilityBindings: CapabilityBinding[]
    connectionRefs: Record<string, string>
    expectedChecks: string[]
    spec: AgentSpec
    createdAt: string
}

export interface AgentPlanValidationResult {
    valid: boolean
    planId: string
    errors: string[]
}

/**
 * Tạo định danh deterministic hash dựa trên nội dung Spec để đảm bảo tính ổn định (PH2-T03).
 */
export const calculatePlanHash = (spec: AgentSpec, specRevisionId: string): string => {
    const raw = JSON.stringify({
        schemaVersion: spec.schemaVersion,
        kind: spec.kind,
        name: spec.name,
        goal: spec.goal,
        modelProfileRef: spec.modelProfileRef,
        instructions: spec.instructions,
        tools: spec.tools,
        dataSources: spec.dataSources,
        specRevisionId
    })
    return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

/**
 * Sinh AgentPlan từ AgentSpec v1 theo cấu trúc template và registry (PH2-T03 / PH4-T03).
 * Chỉ ánh xạ capabilities từ allowlist, loại bỏ mọi trường injection tùy ý.
 */
export const createAgentPlan = (spec: AgentSpec, specRevisionId: string = 'rev_initial'): AgentPlan => {
    const planHash = calculatePlanHash(spec, specRevisionId)
    const capabilityBindings: CapabilityBinding[] = []
    const connectionRefs: Record<string, string> = {}
    const isApi = spec.kind === 'api-readonly' || (Array.isArray(spec.apiConnectors) && spec.apiConnectors.length > 0)
    const isKnowledge = !isApi && (spec.kind === 'knowledge' || (Array.isArray(spec.dataSources) && spec.dataSources.length > 0))

    const expectedChecks: string[] = ['specReady', 'buildReady', 'templateCompatible', 'capabilitiesAllowlisted']
    if (isKnowledge) {
        expectedChecks.push('knowledgeStoreReady', 'retrievalConfigured')
    }
    if (isApi) {
        expectedChecks.push('apiConnectorAllowlisted', 'readonlyPolicyEnforced')
    }

    // 1. Ánh xạ Model Capability
    const modelRef = spec.modelProfileRef || 'default-builder-model'
    const modelNodeName = modelRef === 'default-builder-model' ? 'chatOpenAI' : modelRef
    const modelMeta = ALLOWED_AGENTFLOW_NODES[modelNodeName] || ALLOWED_AGENTFLOW_NODES.chatOpenAI

    capabilityBindings.push({
        capabilityId: `cap_model_${modelNodeName}`,
        nodeName: modelMeta.name,
        nodeVersion: modelMeta.recommendedVersion,
        type: 'model',
        config: {
            modelName: 'gpt-4o',
            temperature: isKnowledge || isApi ? 0.2 : 0.7
        }
    })
    connectionRefs.model = modelNodeName

    // 2. Ánh xạ Data Source Capability (DocumentStoreTool) cho Knowledge Agent
    if (isKnowledge) {
        const store = spec.dataSources && spec.dataSources.length > 0 ? spec.dataSources[0] : undefined
        const storeId = store?.id || 'fixture-docstore-company-policy'
        const storeName = store?.name || 'Quy chế làm việc nội bộ'

        capabilityBindings.push({
            capabilityId: `cap_datasource_${storeId}`,
            nodeName: 'documentStoreTool',
            nodeVersion: 1.0,
            type: 'datasource',
            config: {
                selectedStore: storeId,
                storeName: storeName,
                topK: 4,
                returnSourceDocuments: true
            }
        })
        connectionRefs.datasource = 'documentStoreTool'
    }

    // 2b. Ánh xạ API Capability (RequestsGet) cho API Agent (PH6-T03)
    if (isApi) {
        const connector = spec.apiConnectors && spec.apiConnectors.length > 0 ? spec.apiConnectors[0] : undefined
        const connId = connector?.connectorId || 'conn-weather-v1'
        const connName = connector?.name || 'API Service'
        const baseUrl = connector?.baseUrl || 'https://api.openweathermap.org/data/2.5'

        capabilityBindings.push({
            capabilityId: `cap_api_${connId}`,
            nodeName: 'requestsGet',
            nodeVersion: 2.0,
            type: 'tool',
            config: {
                requestsGetUrl: baseUrl,
                requestsGetName: `api_${connId.replace(/[^a-zA-Z0-9_]/g, '_')}`,
                requestsGetDescription: `Truy vấn dữ liệu từ ${connName} (${baseUrl})`
            }
        })
        connectionRefs.api = 'requestsGet'
    }

    // 3. Ánh xạ Tools Capabilities (chỉ từ registry allowlist)
    if (spec.tools && spec.tools.length > 0) {
        spec.tools.forEach((tool, idx) => {
            const toolType = tool.type || 'calculator'
            const toolNodeName = toolType === 'webSearch' ? 'webSearch' : 'calculator'
            const toolMeta = ALLOWED_AGENTFLOW_NODES[toolNodeName]

            if (toolMeta) {
                capabilityBindings.push({
                    capabilityId: `cap_tool_${toolNodeName}_${idx}`,
                    nodeName: toolMeta.name,
                    nodeVersion: toolMeta.recommendedVersion,
                    type: 'tool',
                    config: tool.config || {}
                })
            }
        })
    }

    let templateId = ASSISTANT_TEMPLATE_ID
    let templateVersion = ASSISTANT_TEMPLATE_VERSION

    if (isApi) {
        templateId = API_TEMPLATE_ID
        templateVersion = API_TEMPLATE_VERSION
    } else if (isKnowledge) {
        templateId = KNOWLEDGE_TEMPLATE_ID
        templateVersion = KNOWLEDGE_TEMPLATE_VERSION
    }

    return {
        id: `plan_${planHash}`,
        specRevisionId,
        templateId,
        templateVersion,
        runtimeSha: 'flowise-v2-core-runtime',
        capabilityBindings,
        connectionRefs,
        expectedChecks,
        spec,
        createdAt: new Date().toISOString()
    }
}

/**
 * Thẩm định tính hợp lệ của AgentPlan trước khi đưa vào compiler (PH2-T03).
 */
export const validateAgentPlan = (plan: AgentPlan): AgentPlanValidationResult => {
    const errors: string[] = []
    const planId = plan?.id || 'unknown'

    if (!plan) {
        return { valid: false, planId, errors: ['AgentPlan không được để rỗng'] }
    }

    // 1. Kiểm tra Template compatibility (Hỗ trợ Assistant, Knowledge và API Templates)
    const isAssistant = plan.templateId === ASSISTANT_TEMPLATE_ID && plan.templateVersion === ASSISTANT_TEMPLATE_VERSION
    const isKnowledge = plan.templateId === KNOWLEDGE_TEMPLATE_ID && plan.templateVersion === KNOWLEDGE_TEMPLATE_VERSION
    const isApi = plan.templateId === API_TEMPLATE_ID && plan.templateVersion === API_TEMPLATE_VERSION

    if (!isAssistant && !isKnowledge && !isApi) {
        errors.push(
            `Template "${plan.templateId}" phiên bản "${plan.templateVersion}" không được hỗ trợ (yêu cầu: ${ASSISTANT_TEMPLATE_ID}, ${KNOWLEDGE_TEMPLATE_ID} hoặc ${API_TEMPLATE_ID})`
        )
    }

    // 2. Kiểm tra Spec Readiness
    if (!plan.spec) {
        errors.push('AgentPlan thiếu thông tin spec')
    } else {
        const readiness = computeReadiness(plan.spec)
        if (!readiness.buildReady) {
            errors.push(`Spec chưa đạt điều kiện buildReady: true (thiếu: ${readiness.missingFields.join(', ')})`)
        }
    }

    // 3. Kiểm tra Capability Bindings (ngăn chặn chèn node/capability ngoài allowlist)
    if (!plan.capabilityBindings || !Array.isArray(plan.capabilityBindings)) {
        errors.push('AgentPlan thiếu danh sách capabilityBindings')
    } else {
        let hasModel = false
        let hasDataSource = false

        for (const binding of plan.capabilityBindings) {
            if (!binding.nodeName || !isNodeAllowed(binding.nodeName, binding.nodeVersion)) {
                errors.push(
                    `Capability "${binding.capabilityId}" trỏ tới node "${binding.nodeName}" version ${binding.nodeVersion} không nằm trong whitelist`
                )
            }
            if (binding.type === 'model') {
                hasModel = true
            }
            if (binding.type === 'datasource') {
                hasDataSource = true
            }

            // Chống code injection trong config
            if (binding.config) {
                const configStr = JSON.stringify(binding.config)
                if (/<script|process\.env|require\(|eval\(/i.test(configStr)) {
                    errors.push(`Capability "${binding.capabilityId}" chứa tham số nguy hiểm trong config`)
                }
            }
        }

        if (!hasModel) {
            errors.push('AgentPlan bắt buộc phải chứa ít nhất 1 model capability binding')
        }

        if (isKnowledge && !hasDataSource) {
            errors.push('AgentPlan loại Knowledge bắt buộc phải chứa ít nhất 1 datasource capability binding')
        }
    }

    return {
        valid: errors.length === 0,
        planId,
        errors
    }
}
