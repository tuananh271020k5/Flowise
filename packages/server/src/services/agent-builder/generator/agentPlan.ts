import { computeReadiness } from '../readiness'
import { AgentSpec } from '../types'
import { ALLOWED_AGENTFLOW_NODES, isNodeAllowed } from './nodeRegistry'
import { ASSISTANT_TEMPLATE_ID, ASSISTANT_TEMPLATE_VERSION } from './templates/assistantTemplate.v1'
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
        name: spec.name,
        goal: spec.goal,
        modelProfileRef: spec.modelProfileRef,
        instructions: spec.instructions,
        tools: spec.tools,
        specRevisionId
    })
    return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

/**
 * Sinh AgentPlan từ AgentSpec v1 theo cấu trúc template và registry (PH2-T03).
 * Chỉ ánh xạ capabilities từ allowlist, loại bỏ mọi trường injection tùy ý.
 */
export const createAgentPlan = (spec: AgentSpec, specRevisionId: string = 'rev_initial'): AgentPlan => {
    const planHash = calculatePlanHash(spec, specRevisionId)
    const capabilityBindings: CapabilityBinding[] = []
    const connectionRefs: Record<string, string> = {}
    const expectedChecks: string[] = ['specReady', 'buildReady', 'templateCompatible', 'capabilitiesAllowlisted']

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
            temperature: 0.7
        }
    })
    connectionRefs.model = modelNodeName

    // 2. Ánh xạ Tools Capabilities (chỉ từ registry allowlist)
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

    return {
        id: `plan_${planHash}`,
        specRevisionId,
        templateId: ASSISTANT_TEMPLATE_ID,
        templateVersion: ASSISTANT_TEMPLATE_VERSION,
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

    // 1. Kiểm tra Template compatibility
    if (plan.templateId !== ASSISTANT_TEMPLATE_ID) {
        errors.push(`Template "${plan.templateId}" không được hỗ trợ (yêu cầu: ${ASSISTANT_TEMPLATE_ID})`)
    }
    if (plan.templateVersion !== ASSISTANT_TEMPLATE_VERSION) {
        errors.push(`Template version "${plan.templateVersion}" không tương thích (yêu cầu: ${ASSISTANT_TEMPLATE_VERSION})`)
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
        for (const binding of plan.capabilityBindings) {
            if (!binding.nodeName || !isNodeAllowed(binding.nodeName, binding.nodeVersion)) {
                errors.push(
                    `Capability "${binding.capabilityId}" trỏ tới node "${binding.nodeName}" version ${binding.nodeVersion} không nằm trong whitelist`
                )
            }
            if (binding.type === 'model') {
                hasModel = true
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
    }

    return {
        valid: errors.length === 0,
        planId,
        errors
    }
}
