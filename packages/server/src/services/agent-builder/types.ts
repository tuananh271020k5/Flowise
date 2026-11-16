/**
 * Types and interfaces for AgentSpec v1 and Readiness rules.
 * Aligns with CONTRACTS.md and B-002/B-003/B-006 specifications.
 */

export type AgentSpecKind = 'assistant' | 'knowledge' | 'api-readonly' | 'data-readonly'

export type VisibilityPolicy = 'private' | 'public'
export type ExecutionModePolicy = 'controlled-test' | 'standard'

export interface AgentPolicy {
    visibility: VisibilityPolicy
    executionMode: ExecutionModePolicy
    allowWrite: boolean
}

export interface EvaluationExample {
    input: string
    assertions: string[]
}

export interface DataSourceRef {
    id: string
    type: string
    name: string
    config?: Record<string, unknown>
}

export interface ToolRef {
    id: string
    name: string
    type: string
    config?: Record<string, unknown>
}

export interface AgentSpec {
    schemaVersion: '1.0'
    kind: AgentSpecKind
    name: string
    goal: string
    language: string
    instructions: string
    outputExpectations: string[]
    modelProfileRef: string
    dataSources: DataSourceRef[]
    tools: ToolRef[]
    policy: AgentPolicy
    evaluationExamples: EvaluationExample[]
}

export type PartialAgentSpec = Partial<Omit<AgentSpec, 'policy' | 'evaluationExamples' | 'dataSources' | 'tools'>> & {
    policy?: Partial<AgentPolicy>
    evaluationExamples?: EvaluationExample[]
    dataSources?: DataSourceRef[]
    tools?: ToolRef[]
    schemaVersion?: string
    kind?: string
}

export interface ReadinessResult {
    specReady: boolean
    buildReady: boolean
    testReady: boolean
    missingFields: string[]
    assumptions: string[]
    reasonCodes: string[]
    errors?: string[]
}

export interface AgentSpecValidationResult {
    success: boolean
    data?: AgentSpec
    errors?: string[]
}

export interface BuildIntent {
    id: string
    sessionId: string
    revisionNo: number
    spec: AgentSpec
    status: 'pending' | 'dispatched' | 'completed' | 'failed'
    dispatchedAt: string
    metadata?: Record<string, unknown>
}

export interface BuildDispatcher {
    dispatch(intent: BuildIntent): Promise<{ success: boolean; intentId: string; status: string }>
}

export interface SpecPatchResult {
    patch: Partial<AgentSpec>
    extractedFields: string[]
    changeSummary: string
}

export type SSEEventType =
    | 'connected'
    | 'message'
    | 'revision'
    | 'readiness'
    | 'build_dispatched'
    | 'build_completed'
    | 'build_failed'
    | 'agent_published'
    | 'agent_unpublished'
    | 'draft_switched'
    | 'agent_rollback'
    | 'error'

export interface SSEPayload {
    type: SSEEventType
    data: unknown
    timestamp: string
}
