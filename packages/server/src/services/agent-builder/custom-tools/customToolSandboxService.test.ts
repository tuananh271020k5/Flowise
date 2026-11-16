/* eslint-disable */
import { CustomToolSandboxService } from './customToolSandboxService'

describe('CustomToolSandboxService (PH6-T09)', () => {
    let service: CustomToolSandboxService

    beforeEach(() => {
        service = new CustomToolSandboxService()
    })

    describe('registerCustomTool & listCustomTools', () => {
        it('should register a valid custom tool and list by workspace', async () => {
            const tool = await service.registerCustomTool({
                workspaceId: 'ws-tool-1',
                name: 'Chuyển Đổi Tiền Tệ',
                description: 'Quy đổi USD sang VND',
                inputSchema: {
                    usd: { type: 'number', required: true }
                },
                code: 'return { vnd: usd * 25400 };',
                enabled: true
            })

            expect(tool.id).toBeDefined()
            expect(tool.name).toBe('Chuyển Đổi Tiền Tệ')

            const list = await service.listCustomTools('ws-tool-1')
            expect(list.length).toBe(1)
            expect(list[0].id).toBe(tool.id)
        })

        it('should reject access across workspaces (Negative Auth)', async () => {
            const tool = await service.registerCustomTool({
                workspaceId: 'ws-owner',
                name: 'Private Tool',
                description: 'Private',
                inputSchema: {},
                code: 'return 42;',
                enabled: true
            })

            await expect(service.getCustomTool(tool.id, 'ws-intruder')).rejects.toThrow('Khác workspace')
        })
    })

    describe('validateToolCode - Security Analysis (AST/Regex Guard)', () => {
        it('should allow safe mathematical and transformation code', () => {
            const code = 'const result = Math.sqrt(x) + 10; return { result };'
            const check = service.validateToolCode(code)
            expect(check.valid).toBe(true)
            expect(check.errors.length).toBe(0)
        })

        it('should block process.exit attack', () => {
            const code = 'process.exit(1);'
            const check = service.validateToolCode(code)
            expect(check.valid).toBe(false)
            expect(check.detectedForbiddenAPIs).toContain('process.exit')
        })

        it('should block child_process execution attack', () => {
            const code = 'const cp = require("child_process"); cp.execSync("rm -rf /");'
            const check = service.validateToolCode(code)
            expect(check.valid).toBe(false)
            expect(check.detectedForbiddenAPIs).toContain('child_process')
        })

        it('should block fs file system access', () => {
            const code = 'const fs = require("fs"); fs.readFileSync("/etc/passwd");'
            const check = service.validateToolCode(code)
            expect(check.valid).toBe(false)
            expect(check.detectedForbiddenAPIs).toContain('fs (filesystem)')
        })

        it('should block eval and dynamic Function constructor', () => {
            const code = 'eval("maliciousCode()");'
            const check = service.validateToolCode(code)
            expect(check.valid).toBe(false)
            expect(check.detectedForbiddenAPIs).toContain('eval()')
        })
    })

    describe('executeTool & executeRawCode - Sandbox Execution', () => {
        it('should execute valid safe code within sandbox successfully', async () => {
            const code = 'return { sum: a + b, product: a * b };'
            const result = await service.executeRawCode(code, { a: 10, b: 5 })

            expect(result.success).toBe(true)
            expect(result.output).toEqual({ sum: 15, product: 50 })
            expect(result.executionTimeMs).toBeGreaterThan(0)
        })

        it('should handle infinite loops via sandbox timeout enforcement', async () => {
            const infiniteLoopCode = 'while(true) {}'
            // Chạy với timeout ngắn 100ms
            const result = await service.executeRawCode(infiniteLoopCode, {}, 100)

            expect(result.success).toBe(false)
            expect(result.error).toContain('timed out')
        })

        it('should execute registered custom tool successfully', async () => {
            const tool = await service.registerCustomTool({
                workspaceId: 'ws-exec',
                name: 'Thuế VAT',
                description: 'Tính thuế VAT 10%',
                inputSchema: { amount: { type: 'number' } },
                code: 'return { vat: amount * 0.1, total: amount * 1.1 };',
                enabled: true
            })

            const res = await service.executeTool('ws-exec', tool.id, { amount: 1000000 })
            expect(res.success).toBe(true)
            expect(res.output).toEqual({ vat: 100000, total: 1100000 })
        })
    })
})
