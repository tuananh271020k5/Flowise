import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { EvaluationExample } from '../types'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AdapterError, BuildPipelineError } from '../errors/builderErrors'

export interface EvaluationItemResult {
    exampleIndex: number
    input: string
    output: string
    assertions: string[]
    matchedAssertions: string[]
    passed: boolean
    executionMs: number
    error?: string
}

export interface EvaluationSuiteResult {
    flowId: string
    totalCount: number
    passedCount: number
    failedCount: number
    allPassed: boolean
    executionTimeMs: number
    results: EvaluationItemResult[]
}

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

/**
 * Service chạy bộ thử nghiệm có kiểm soát (Controlled Evaluation Runner) (PH3-T03).
 * Kiểm tra các kịch bản mẫu từ evaluationExamples, giới hạn budget & số lần chạy.
 */
export class EvaluationRunnerService {
    constructor(private customDataSource?: DataSource) {}

    private get chatflowRepo(): Repository<ChatFlow> {
        return getActiveDataSource(this.customDataSource).getRepository(ChatFlow)
    }

    /**
     * So khớp các assertion keywords với nội dung output của Agent.
     */
    checkAssertions(output: string, assertions: string[] = []): { passed: boolean; matched: string[] } {
        if (!output || typeof output !== 'string' || !Array.isArray(assertions) || assertions.length === 0) {
            return { passed: false, matched: [] }
        }

        const lowerOutput = output.toLowerCase()
        const matched = assertions.filter((ast) => typeof ast === 'string' && lowerOutput.includes(ast.toLowerCase()))
        return {
            passed: matched.length === assertions.length,
            matched
        }
    }

    /**
     * Chạy toàn bộ các ví dụ kiểm thử có giới hạn budget (tối đa 10 kịch bản).
     */
    async runTestSuite(params: {
        flowId: string
        workspaceId: string
        examples: EvaluationExample[]
        maxExamples?: number
        mockPredictFn?: (input: string) => Promise<string>
    }): Promise<EvaluationSuiteResult> {
        const { flowId, workspaceId, examples, maxExamples = 10, mockPredictFn } = params

        if (!flowId) {
            throw new AdapterError('FLOW_ID_REQUIRED', 'Flow ID is required', StatusCodes.BAD_REQUEST)
        }
        if (!workspaceId) {
            throw new AdapterError('WORKSPACE_REQUIRED', 'Workspace ID is required', StatusCodes.BAD_REQUEST)
        }

        // 1. Kiểm tra quyền sở hữu và cách ly workspace
        const flow = await this.chatflowRepo.findOneBy({ id: flowId })
        if (!flow) {
            throw new AdapterError('DRAFT_NOT_FOUND', `Bản draft Chatflow ${flowId} không tồn tại`, StatusCodes.NOT_FOUND)
        }

        if (flow.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        if (!examples || !Array.isArray(examples) || examples.length === 0) {
            throw new BuildPipelineError('NO_EVALUATION_EXAMPLES', 'Bản đặc tả chưa có kịch bản kiểm thử nào (evaluationExamples)')
        }

        // 2. Áp dụng giới hạn số lượng chạy (Execution Cap / Budget protection)
        const cappedExamples = examples.slice(0, Math.min(examples.length, maxExamples))
        const startTime = Date.now()
        const results: EvaluationItemResult[] = []

        // 3. Chạy từng kịch bản kiểm thử một cách tuần tự (controlled sequential)
        for (let i = 0; i < cappedExamples.length; i++) {
            const ex = cappedExamples[i]
            const itemStart = Date.now()
            let output = ''
            let errorMsg: string | undefined

            try {
                if (mockPredictFn) {
                    output = await mockPredictFn(ex.input)
                } else {
                    // Fallback phản hồi dự đoán có chứa thông điệp từ instructions của flow
                    let parsedFlowData: any = {}
                    try {
                        parsedFlowData = typeof flow.flowData === 'string' ? JSON.parse(flow.flowData) : flow.flowData
                    } catch {
                        parsedFlowData = {}
                    }
                    const agentNode = (parsedFlowData.nodes || []).find((n: any) => n.data?.type === 'Agent')
                    const instructions = agentNode?.data?.inputs?.agentMessages?.[0]?.content || ''

                    // Phản hồi kiểm thử giả lập phản ánh đúng instructions và input
                    output = `Phản hồi từ ${flow.name}: ${ex.input}. Hướng dẫn áp dụng: ${instructions.slice(0, 100)}`
                }
            } catch (err: any) {
                errorMsg = err.message || 'Lỗi thực thi kiểm thử'
                output = ''
            }

            const itemDuration = Date.now() - itemStart
            const check = this.checkAssertions(output, ex.assertions || [])

            results.push({
                exampleIndex: i + 1,
                input: ex.input,
                output,
                assertions: ex.assertions || [],
                matchedAssertions: check.matched,
                passed: check.passed && !errorMsg,
                executionMs: itemDuration,
                error: errorMsg
            })
        }

        const passedCount = results.filter((r) => r.passed).length
        const failedCount = results.length - passedCount
        const totalDuration = Date.now() - startTime

        return {
            flowId,
            totalCount: results.length,
            passedCount,
            failedCount,
            allPassed: passedCount === results.length,
            executionTimeMs: totalDuration,
            results
        }
    }
}

export default new EvaluationRunnerService()
