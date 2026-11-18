/**
 * Types and interfaces for AgentSpec v1 and Readiness rules.
 * Aligns with CONTRACTS.md and B-002/B-003/B-006 specifications.
 */

export type AgentSpecKind = 'assistant' | 'knowledge' | 'api-readonly' | 'data-readonly' | 'sql-readonly'

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

export interface ApiConnectorRef {
    connectorId: string
    name: string
    baseUrl: string
    allowedOperations?: string[]
}

export interface SqlAgentConfig {
    databaseType: 'sqlite' | 'postgres' | 'mysql'
    databaseName?: string
    credentialRef?: string
    allowedTables: string[]
    rowLimit?: number
    schemaOverview?: Record<string, string[]>
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
    apiConnectors?: ApiConnectorRef[]
    sqlConfig?: SqlAgentConfig
    policy: AgentPolicy
    evaluationExamples: EvaluationExample[]
    workflow?: import('./workflow').WorkflowSpec
}

export type PartialAgentSpec = Partial<Omit<AgentSpec, 'policy' | 'evaluationExamples' | 'dataSources' | 'tools' | 'sqlConfig'>> & {
    policy?: Partial<AgentPolicy>
    evaluationExamples?: EvaluationExample[]
    dataSources?: DataSourceRef[]
    tools?: ToolRef[]
    apiConnectors?: ApiConnectorRef[]
    sqlConfig?: Partial<SqlAgentConfig>
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
    usage?: { provider: string; model: string; promptTokens: number; completionTokens: number }
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
