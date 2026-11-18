// Regression for the former synthetic golden-case shortcut. These unit tests verify
// the runtime boundary and failure handling, not real-model/RAG answer quality.
jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../runtimePredictionService', () => ({ predictDraft: jest.fn() }))
import { DataSource } from 'typeorm'
import { EvaluationRunnerService } from '../pipeline/evaluationRunnerService'
import { predictDraft } from '../runtimePredictionService'

describe('Knowledge evaluation uses runtime results without fabricated evidence', () => {
    const predict = predictDraft as jest.Mock
    let runner: EvaluationRunnerService
    beforeEach(() => {
        predict.mockReset()
        runner = new EvaluationRunnerService({
            getRepository: () => ({ findOneBy: async () => ({ id: 'flow', workspaceId: 'ws' }) })
        } as unknown as DataSource)
    })
    it('forwards each question to the actual prediction boundary', async () => {
        predict.mockResolvedValue({
            text: 'Observed answer 02 days',
            sourceDocuments: [{ pageContent: 'Observed passage', source: 'fixture://policy' }]
        })
        const result = await runner.runTestSuite({
            flowId: 'flow',
            workspaceId: 'ws',
            examples: [{ input: 'Remote days?', assertions: ['02 days'] }]
        })
        expect(predict).toHaveBeenCalledWith('flow', 'ws', { question: 'Remote days?' })
        expect(result.allPassed).toBe(true)
        expect(result.results[0].sourceDocuments?.[0].source).toBe('fixture://policy')
    })
    it('does not turn provider failure into a canned answer or citation', async () => {
        predict.mockRejectedValue(new Error('Provider unavailable'))
        const result = await runner.runTestSuite({
            flowId: 'flow',
            workspaceId: 'ws',
            examples: [{ input: 'Remote days?', assertions: ['02 days'] }]
        })
        expect(result.allPassed).toBe(false)
        expect(result.results[0]).toMatchObject({ output: '', sourceDocuments: [], passed: false, error: 'Provider unavailable' })
    })
    it('does not pass an incorrect answer just because a retrieved passage contains the keyword', async () => {
        predict.mockResolvedValue({ text: 'I do not know', sourceDocuments: [{ pageContent: '02 days' }] })
        const result = await runner.runTestSuite({
            flowId: 'flow',
            workspaceId: 'ws',
            examples: [{ input: 'Remote?', assertions: ['02 days'] }]
        })
        expect(result.allPassed).toBe(false)
    })
    it('preserves empty evidence instead of attaching the company-policy fixture', async () => {
        predict.mockResolvedValue({ text: 'No evidence' })
        const result = await runner.runTestSuite({
            flowId: 'flow',
            workspaceId: 'ws',
            examples: [{ input: 'Unknown topic', assertions: ['No evidence'] }]
        })
        expect(result.results[0].sourceDocuments).toEqual([])
    })
    it('caps prediction calls and rejects invalid budgets', async () => {
        predict.mockResolvedValue({ text: 'OK' })
        const examples = Array.from({ length: 15 }, (_, i) => ({ input: `Question ${i}`, assertions: ['OK'] }))
        const result = await runner.runTestSuite({ flowId: 'flow', workspaceId: 'ws', examples, maxExamples: 2 })
        expect(result.totalCount).toBe(2)
        expect(predict).toHaveBeenCalledTimes(2)
        await expect(runner.runTestSuite({ flowId: 'flow', workspaceId: 'ws', examples, maxExamples: 0 })).rejects.toThrow('maxExamples')
    })
})
