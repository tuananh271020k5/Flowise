import { computeSpecDiff } from './specDiffService'
import { AgentSpec } from './types'

describe('SpecDiffService (PH3-T05)', () => {
    it('nhận biết khi 2 spec hoàn toàn giống nhau', () => {
        const spec: Partial<AgentSpec> = {
            name: 'Trợ Lý A',
            goal: 'Hỗ trợ khách hàng',
            instructions: 'Luôn lịch sự',
            tools: [{ id: 'tool-1', name: 'calculator', type: 'calculator' }],
            evaluationExamples: [{ input: 'Xin chào', assertions: ['chào'] }]
        }

        const diff = computeSpecDiff(spec as AgentSpec, spec as AgentSpec)
        expect(diff.hasChanges).toBe(false)
        expect(diff.name.changed).toBe(false)
        expect(diff.summary).toContain('Không có thay đổi giữa hai phiên bản')
    })

    it('phát hiện thay đổi tên, goal và instructions', () => {
        const specA: Partial<AgentSpec> = {
            name: 'Trợ Lý Cũ',
            goal: 'Mục tiêu cũ',
            instructions: 'Hướng dẫn cũ'
        }
        const specB: Partial<AgentSpec> = {
            name: 'Trợ Lý Mới',
            goal: 'Mục tiêu mới',
            instructions: 'Hướng dẫn mới'
        }

        const diff = computeSpecDiff(specA as AgentSpec, specB as AgentSpec)
        expect(diff.hasChanges).toBe(true)
        expect(diff.name.changed).toBe(true)
        expect(diff.name.from).toBe('Trợ Lý Cũ')
        expect(diff.name.to).toBe('Trợ Lý Mới')
        expect(diff.goal.changed).toBe(true)
        expect(diff.instructions.changed).toBe(true)
        expect(diff.summary.some((s) => s.includes('Đổi tên trợ lý'))).toBe(true)
    })

    it('phát hiện thêm và xóa tools chính xác', () => {
        const specA: Partial<AgentSpec> = {
            name: 'Trợ Lý',
            tools: [
                { id: 'tool-1', name: 'calculator', type: 'calculator' },
                { id: 'tool-2', name: 'databaseQuery', type: 'database' }
            ]
        }
        const specB: Partial<AgentSpec> = {
            name: 'Trợ Lý',
            tools: [
                { id: 'tool-1', name: 'calculator', type: 'calculator' },
                { id: 'tool-3', name: 'webSearch', type: 'search' }
            ]
        }

        const diff = computeSpecDiff(specA as AgentSpec, specB as AgentSpec)
        expect(diff.tools.changed).toBe(true)
        expect(diff.tools.added).toEqual(['webSearch'])
        expect(diff.tools.removed).toEqual(['databaseQuery'])
        expect(diff.tools.unchanged).toEqual(['calculator'])
        expect(diff.summary.some((s) => s.includes('Thêm 1 công cụ'))).toBe(true)
        expect(diff.summary.some((s) => s.includes('Xóa 1 công cụ'))).toBe(true)
    })

    it('phát hiện thay đổi kịch bản kiểm thử (evaluationExamples)', () => {
        const specA: Partial<AgentSpec> = {
            evaluationExamples: [
                { input: 'Câu hỏi 1', assertions: ['trả lời 1'] },
                { input: 'Câu hỏi cũ', assertions: ['đáp án cũ'] }
            ]
        }
        const specB: Partial<AgentSpec> = {
            evaluationExamples: [
                { input: 'Câu hỏi 1', assertions: ['trả lời 1 đã sửa'] },
                { input: 'Câu hỏi mới', assertions: ['đáp án mới'] }
            ]
        }

        const diff = computeSpecDiff(specA as AgentSpec, specB as AgentSpec)
        expect(diff.evaluationExamples.changed).toBe(true)
        expect(diff.evaluationExamples.added.length).toBe(1)
        expect(diff.evaluationExamples.added[0].input).toBe('Câu hỏi mới')
        expect(diff.evaluationExamples.removed.length).toBe(1)
        expect(diff.evaluationExamples.removed[0].input).toBe('Câu hỏi cũ')
        expect(diff.evaluationExamples.modified.length).toBe(1)
        expect(diff.evaluationExamples.modified[0].input).toBe('Câu hỏi 1')
    })
})
