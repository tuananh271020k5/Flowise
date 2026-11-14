import { getNodeMetadata, isNodeAllowed, validateNodeMetadata } from './nodeRegistry'

describe('Node Metadata Registry (PH2-T02 / B-007)', () => {
    describe('isNodeAllowed & getNodeMetadata', () => {
        it('cho phép Start node phiên bản 1.4 chuẩn theo runtime TASK-001', () => {
            expect(isNodeAllowed('startAgentflow', 1.4)).toBe(true)
            const meta = getNodeMetadata('startAgentflow')
            expect(meta).toBeDefined()
            expect(meta?.recommendedVersion).toBe(1.4)
            expect(meta?.type).toBe('Start')
        })

        it('từ chối Start node phiên bản 1.1 cũ lỗi thời', () => {
            expect(isNodeAllowed('startAgentflow', 1.1)).toBe(false)
        })

        it('cho phép Agent node phiên bản 3.2', () => {
            expect(isNodeAllowed('agentAgentflow', 3.2)).toBe(true)
        })

        it('cho phép các Model nodes và Tool nodes chuẩn', () => {
            expect(isNodeAllowed('chatOpenAI', 5.0)).toBe(true)
            expect(isNodeAllowed('chatGoogleGenerativeAI', 2.0)).toBe(true)
            expect(isNodeAllowed('calculator', 1.0)).toBe(true)
            expect(isNodeAllowed('webSearch', 1.0)).toBe(true)
        })

        it('từ chối node không nằm trong allowlist (chống chèn mã độc/node lạ)', () => {
            expect(isNodeAllowed('customBashRunner')).toBe(false)
            expect(isNodeAllowed('maliciousNodeRunner')).toBe(false)
            expect(isNodeAllowed('unknownCodeExecutor')).toBe(false)
        })
    })

    describe('validateNodeMetadata', () => {
        it('chấp nhận Start node hợp lệ với đầy đủ inputParams và version 1.4', () => {
            const validStartNode = {
                name: 'startAgentflow',
                version: 1.4,
                type: 'Start',
                inputs: {
                    startInputType: 'chatInput',
                    startPersistState: true
                }
            }

            const result = validateNodeMetadata(validStartNode)
            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
        })

        it('từ chối node thiếu trường name', () => {
            const result = validateNodeMetadata({ version: 1.4 } as any)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('thiếu trường "name"')
        })

        it('từ chối node không thuộc allowlist', () => {
            const result = validateNodeMetadata({
                name: 'unsafePythonExecutor',
                version: 1.0
            })
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('không nằm trong danh mục whitelist')
        })

        it('từ chối node có version không tương thích', () => {
            const result = validateNodeMetadata({
                name: 'startAgentflow',
                version: 1.1,
                type: 'Start'
            })
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('không được hỗ trợ')
        })

        it('từ chối node thiếu required input (ví dụ startAgentflow thiếu startInputType)', () => {
            const result = validateNodeMetadata({
                name: 'startAgentflow',
                version: 1.4,
                type: 'Start',
                inputs: {}
            })
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('thiếu input bắt buộc: "startInputType"')
        })

        it('từ chối node chứa input params lạ không được phép', () => {
            const result = validateNodeMetadata({
                name: 'startAgentflow',
                version: 1.4,
                type: 'Start',
                inputs: {
                    startInputType: 'chatInput',
                    injectedDangerousParam: 'DROP TABLE'
                }
            })
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('chứa input không nằm trong allowlist')
        })
    })
})
