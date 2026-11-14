import { containsScriptTag, containsSecret, validateAgentSpec } from './schema'
import { AgentSpec, ReadinessResult } from './types'

/**
 * Required fields for an assistant to be buildReady.
 */
const REQUIRED_ASSISTANT_FIELDS = [
    { field: 'name', minLength: 1, label: 'Tên trợ lý (name)' },
    { field: 'goal', minLength: 5, label: 'Mục tiêu (goal)' },
    { field: 'instructions', minLength: 5, label: 'Hướng dẫn chỉ dẫn (instructions)' }
]

/**
 * Evaluates readiness of an AgentSpec or progressive partial spec.
 * Returns deterministic readiness status, missing fields, assumptions and reason codes.
 */
export function computeReadiness(spec: unknown): ReadinessResult {
    const missingFields: string[] = []
    const assumptions: string[] = []
    const reasonCodes: string[] = []
    const errors: string[] = []

    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        return {
            specReady: false,
            buildReady: false,
            testReady: false,
            missingFields: ['name', 'goal', 'instructions'],
            assumptions: [],
            reasonCodes: ['EMPTY_SPEC'],
            errors: ['Dữ liệu spec không hợp lệ hoặc rỗng']
        }
    }

    const raw = spec as Record<string, unknown>

    // 1. Check for forbidden injections or raw secrets across all top-level string values
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
            if (containsSecret(value)) {
                errors.push(`Trường ${key} chứa secret hoặc API key, không được phép đưa vào spec`)
                reasonCodes.push('SECRET_DETECTED')
            }
            if (containsScriptTag(value)) {
                errors.push(`Trường ${key} chứa thẻ script không an toàn`)
                reasonCodes.push('SCRIPT_INJECTION_DETECTED')
            }
        }
    }

    // 2. Check for unknown fields (preventing tenantId/auth tampering)
    const allowedKeys = new Set([
        'schemaVersion',
        'kind',
        'name',
        'goal',
        'language',
        'instructions',
        'outputExpectations',
        'modelProfileRef',
        'dataSources',
        'tools',
        'policy',
        'evaluationExamples'
    ])

    const unknownKeys = Object.keys(raw).filter((k) => !allowedKeys.has(k))
    if (unknownKeys.length > 0) {
        errors.push(`Phát hiện các trường không được phép trong spec: ${unknownKeys.join(', ')}`)
        reasonCodes.push('UNKNOWN_FIELDS')
    }

    // 3. Check required business fields for Assistant
    for (const { field, minLength } of REQUIRED_ASSISTANT_FIELDS) {
        const val = raw[field]
        if (typeof val !== 'string' || val.trim().length < minLength) {
            missingFields.push(field)
        }
    }

    // 4. Record default assumptions if fields are not explicitly set
    if (!raw.language) {
        assumptions.push('Mặc định ngôn ngữ phản hồi là tiếng Việt (vi)')
    }
    if (!raw.modelProfileRef) {
        assumptions.push('Sử dụng model profile logic mặc định: default-builder-model')
    }
    if (!raw.policy) {
        assumptions.push('Áp dụng chính sách bảo vệ mặc định: private, controlled-test')
    }
    if (!raw.schemaVersion) {
        assumptions.push('Gán schemaVersion mặc định là "1.0"')
    }
    if (!raw.kind) {
        assumptions.push('Gán loại agent mặc định là "assistant"')
    }

    // 5. Evaluate specReady
    // If there are structural/injection errors, specReady is false
    let specReady = errors.length === 0

    // If all required fields are present and no errors so far, run full schema validation
    if (missingFields.length === 0 && specReady) {
        const normalizedSpec: Partial<AgentSpec> = {
            schemaVersion: '1.0',
            kind: 'assistant',
            language: 'vi',
            modelProfileRef: 'default-builder-model',
            outputExpectations: [],
            dataSources: [],
            tools: [],
            policy: {
                visibility: 'private',
                executionMode: 'controlled-test',
                allowWrite: false
            },
            evaluationExamples: [],
            ...raw
        }

        const validation = validateAgentSpec(normalizedSpec)
        if (!validation.success) {
            specReady = false
            errors.push(...(validation.errors ?? []))
            reasonCodes.push('SCHEMA_VALIDATION_FAILED')
        }
    }

    // 6. Evaluate buildReady
    const buildReady = specReady && missingFields.length === 0
    if (missingFields.length > 0) {
        reasonCodes.push('MISSING_REQUIRED_FIELDS')
    }

    // 7. Evaluate testReady
    let testReady = false
    const examples = raw.evaluationExamples
    if (Array.isArray(examples) && examples.length > 0) {
        const allExamplesValid = examples.every(
            (ex) =>
                ex &&
                typeof ex === 'object' &&
                typeof ex.input === 'string' &&
                ex.input.trim().length > 0 &&
                Array.isArray(ex.assertions) &&
                ex.assertions.length > 0 &&
                ex.assertions.every((a: unknown) => typeof a === 'string' && a.trim().length > 0)
        )
        if (allExamplesValid) {
            if (buildReady) {
                testReady = true
                reasonCodes.push('READY_FOR_TEST')
            }
        } else {
            reasonCodes.push('INVALID_EVALUATION_EXAMPLES')
        }
    } else if (buildReady) {
        reasonCodes.push('NO_EVALUATION_EXAMPLES')
    }

    if (buildReady) {
        reasonCodes.push('READY_FOR_BUILD')
    }

    // Deduplicate reason codes
    const uniqueReasonCodes = Array.from(new Set(reasonCodes))

    return {
        specReady,
        buildReady,
        testReady,
        missingFields,
        assumptions,
        reasonCodes: uniqueReasonCodes,
        ...(errors.length > 0 ? { errors } : {})
    }
}
