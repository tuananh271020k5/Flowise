import { prepareAgentPreview } from './agentBehaviorPolicy'
const { extractWebCitations } = require('../../../../components/nodes/agentflow/webCitations')

describe('Agent role, freshness and source policy', () => {
    const original = JSON.stringify({
        nodes: [
            {
                data: {
                    name: 'agentAgentflow',
                    inputs: {
                        agentModel: 'chatOpenAI',
                        agentMessages: [{ role: 'system', content: 'Owner instructions' }],
                        agentToolsBuiltInOpenAI: ['code_interpreter', 'web_search_preview']
                    }
                }
            }
        ],
        edges: []
    })
    it('applies current safeguards to an old draft without mutating its stored graph or adding duplicate user input', () => {
        const result = JSON.parse(prepareAgentPreview(original, 'Phone shop bot', false, new Date('2026-11-17T00:00:00Z')))
        const inputs = result.nodes[0].data.inputs
        expect(inputs.agentMessages[0].content).toBe('Owner instructions')
        const policy = inputs.agentMessages.at(-1).content
        expect(policy).toContain('Phone shop bot')
        expect(policy).toContain('2026-11-17')
        expect(policy).toContain('Không suy ra sản phẩm chưa ra mắt')
        expect(policy).toContain('Không bắt khách hàng cung cấp giá bán')
        expect(inputs.agentToolsBuiltInOpenAI).toEqual(['code_interpreter'])
        expect(JSON.parse(original).nodes[0].data.inputs.agentMessages).toHaveLength(1)
        expect(inputs.agentUserMessage).toBeUndefined()
    })
    it('exposes the actual Responses web_search tool only after opt-in', () => {
        const graph = JSON.parse(prepareAgentPreview(original, 'Bot', true))
        expect(graph.nodes[0].data.inputs.agentToolsBuiltInOpenAI).toEqual(['code_interpreter', 'web_search'])
    })
    it('replaces a published policy snapshot on the next preview instead of stacking extra prompts', () => {
        const published = prepareAgentPreview(original, 'Bot', true, new Date('2026-11-17T00:00:00Z'))
        const next = JSON.parse(prepareAgentPreview(published, 'Bot', false, new Date('2026-11-18T00:00:00Z')))
        expect(next.nodes[0].data.inputs.agentMessages).toHaveLength(2)
        expect(next.nodes[0].data.inputs.agentMessages[1].content).toContain('2026-11-18')
        expect(next.nodes[0].data.inputs.agentMessages[1].content).not.toContain('2026-11-17')
        expect(next.nodes[0].data.inputs.agentToolsBuiltInOpenAI).toEqual(['code_interpreter'])
    })
    it('rejects a web configuration for a different model adapter', () => {
        const graph = JSON.parse(original)
        graph.nodes[0].data.inputs.agentModel = 'chatAnthropic'
        expect(() => prepareAgentPreview(JSON.stringify(graph), 'Bot', true)).toThrow('Responses')
    })
    it('applies the workspace model profile to preview immediately without persisting credentials into a new graph', () => {
        const graph = JSON.parse(
            prepareAgentPreview(original, 'Bot', false, new Date(), {
                modelName: 'selected-model',
                baseUrl: 'https://provider.example/v1',
                credentialId: 'credential-ref'
            })
        )
        expect(graph.nodes[0].data.inputs.agentModelConfig).toMatchObject({
            modelName: 'selected-model',
            basepath: 'https://provider.example/v1',
            FLOWISE_CREDENTIAL_ID: 'credential-ref'
        })
        expect(JSON.parse(original).nodes[0].data.inputs.agentModelConfig).toBeUndefined()
    })
    it('preserves only valid, unique provider citations', () => {
        const annotation = { type: 'url_citation', url: 'https://example.org/source', title: 'Source' }
        const result = extractWebCitations({
            output: [
                {
                    type: 'message',
                    content: [
                        {
                            annotations: [
                                annotation,
                                annotation,
                                { type: 'url_citation', url: 'javascript:alert(1)' },
                                { type: 'url_citation', url: 'https://user:secret@example.org/' }
                            ]
                        }
                    ]
                }
            ]
        })
        expect(result).toHaveLength(1)
        expect(result[0].metadata.source).toBe('https://example.org/source')
        expect(extractWebCitations({ output: [] })).toEqual([])
    })
    it('restores missing {{question}} binding on previously compiled workflow LLM nodes idempotently (B-030-T06)', () => {
        const legacyWorkflowDraft = JSON.stringify({
            nodes: [
                {
                    data: {
                        name: 'llmAgentflow',
                        inputs: {
                            llmModel: 'chatOpenAI',
                            llmEnableMemory: false,
                            llmMessages: [
                                { role: 'system', content: 'NHIỆM VỤ BƯỚC Soạn hướng dẫn' },
                                { role: 'user', content: '{{retrieverAgentflow_retrieve_deskflow_guidance}}' }
                            ]
                        }
                    }
                }
            ],
            edges: []
        })
        const firstPass = prepareAgentPreview(legacyWorkflowDraft, 'Trợ lý DeskFlow', false, new Date('2026-11-17T00:00:00Z'))
        const secondPass = JSON.parse(prepareAgentPreview(firstPass, 'Trợ lý DeskFlow', false, new Date('2026-11-18T00:00:00Z')))
        const userMsg = secondPass.nodes[0].data.inputs.llmMessages.find((msg: any) => msg.role === 'user')
        expect(userMsg.content).toContain('{{question}}')
        expect(userMsg.content).toContain('{{retrieverAgentflow_retrieve_deskflow_guidance}}')
        expect(userMsg.content.match(/\{\{question\}\}/g)).toHaveLength(1)
        expect(JSON.parse(legacyWorkflowDraft).nodes[0].data.inputs.llmMessages[1].content).toBe(
            '{{retrieverAgentflow_retrieve_deskflow_guidance}}'
        )
    })
    it('replaces broken {{conditionAgentflow_...}} placeholders in directReplyAgentflow with Vietnamese message from spec or fallback', () => {
        const brokenReplyDraft = JSON.stringify({
            nodes: [
                {
                    id: 'directReplyAgentflow_no_confirmed_guidance',
                    data: {
                        name: 'directReplyAgentflow',
                        inputs: {
                            directReplyMessage: '{{conditionAgentflow_check_search_result}}'
                        }
                    }
                }
            ],
            edges: []
        })
        const withSpec = JSON.parse(
            prepareAgentPreview(brokenReplyDraft, 'Trợ lý DeskFlow', false, new Date(), undefined, [
                {
                    id: 'no_confirmed_guidance',
                    type: 'reply',
                    instruction: 'Thông báo ngắn gọn bằng tiếng Việt rằng câu hỏi này nằm ngoài phạm vi tài liệu DeskFlow.'
                }
            ])
        )
        expect(withSpec.nodes[0].data.inputs.directReplyMessage).toBe('Câu hỏi này nằm ngoài phạm vi tài liệu DeskFlow.')
        const withoutSpec = JSON.parse(prepareAgentPreview(brokenReplyDraft, 'Trợ lý DeskFlow', false, new Date()))
        expect(withoutSpec.nodes[0].data.inputs.directReplyMessage).toContain('nằm ngoài phạm vi')
        expect(withoutSpec.nodes[0].data.inputs.directReplyMessage).not.toContain('{{conditionAgentflow_')
    })
    it('sets reasoningEffort="none" on gpt-5.1+/gpt-6 models when function tools are bound so /v1/chat/completions succeeds', () => {
        const officeDraft = JSON.stringify({
            nodes: [
                {
                    data: {
                        name: 'agentAgentflow',
                        inputs: {
                            agentModel: 'chatOpenAI',
                            agentMessages: [{ role: 'system', content: 'Thư ký Dự án' }],
                            agentTools: [
                                { agentSelectedTool: 'excelOfficeTool', agentSelectedToolConfig: {} },
                                { agentSelectedTool: 'wordOfficeTool', agentSelectedToolConfig: {} }
                            ]
                        }
                    }
                }
            ],
            edges: []
        })
        const gpt56 = JSON.parse(
            prepareAgentPreview(officeDraft, 'Thư ký Dự án', false, new Date(), {
                modelName: 'gpt-5.6-luna',
                baseUrl: 'https://gateway.example/v1',
                credentialId: 'cred-1'
            })
        )
        expect(gpt56.nodes[0].data.inputs.agentModelConfig.reasoningEffort).toBe('none')

        const gpt6 = JSON.parse(
            prepareAgentPreview(officeDraft, 'Thư ký Dự án', false, new Date(), {
                modelName: 'gpt-6-luna',
                baseUrl: 'https://gateway.example/v1',
                credentialId: 'cred-1'
            })
        )
        expect(gpt6.nodes[0].data.inputs.agentModelConfig.reasoningEffort).toBe('none')

        const gpt4o = JSON.parse(
            prepareAgentPreview(officeDraft, 'Thư ký Dự án', false, new Date(), {
                modelName: 'gpt-4o-mini',
                baseUrl: 'https://gateway.example/v1',
                credentialId: 'cred-1'
            })
        )
        expect(gpt4o.nodes[0].data.inputs.agentModelConfig.reasoningEffort).toBeUndefined()
    })
})
