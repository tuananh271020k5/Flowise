import { ChatOpenAI as LangchainChatOpenAI, ChatOpenAIFields } from '@langchain/openai'
import { IMultiModalOption, IVisionChatModal } from '../../../src'
import { isReasoningModelOpenAI } from '../../../src/utils'

export class ChatOpenAI extends LangchainChatOpenAI implements IVisionChatModal {
    configuredModel: string
    configuredMaxToken?: number
    multiModalOption: IMultiModalOption
    builtInTools: Record<string, any>[] = []
    id: string

    constructor(id: string, fields?: ChatOpenAIFields) {
        super(fields)
        this.id = id
        this.configuredModel = fields?.modelName ?? ''
        this.configuredMaxToken = fields?.maxTokens
        if (isReasoningModelOpenAI(this.configuredModel)) {
            for (const subModel of [(this as any).completions, (this as any).responses]) {
                if (subModel && typeof subModel._getReasoningParams === 'function') {
                    subModel._getReasoningParams = function (options?: Record<string, any>) {
                        let reasoning: Record<string, any> | undefined
                        if (this.reasoning !== undefined) reasoning = { ...reasoning, ...this.reasoning }
                        if (options?.reasoning !== undefined) reasoning = { ...reasoning, ...options.reasoning }
                        if (options?.reasoningEffort !== undefined && reasoning?.effort === undefined) {
                            reasoning = { ...reasoning, effort: options.reasoningEffort }
                        }
                        return reasoning
                    }
                }
            }
        }
    }

    setMultiModalOption(multiModalOption: IMultiModalOption): void {
        this.multiModalOption = multiModalOption
    }

    addBuiltInTools(builtInTool: Record<string, any>): void {
        this.builtInTools.push(builtInTool)
    }
}
