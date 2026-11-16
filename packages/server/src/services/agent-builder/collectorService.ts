import { AgentSpec, BuildDispatcher, BuildIntent, SpecPatchResult, ToolRef, SSEPayload } from './types'
import { Response } from 'express'

/**
 * Service trích xuất dữ kiện có cấu trúc (Structured Spec Patch) từ ngôn ngữ tự nhiên tiếng Việt
 * và sinh phản hồi gợi ý không hỏi lặp lại các thông tin đã có.
 */
export class CollectorService {
    private buildDispatcher: BuildDispatcher
    private sseClients: Map<string, Set<Response>> = new Map()

    constructor(customDispatcher?: BuildDispatcher) {
        this.buildDispatcher = customDispatcher || new MockBuildDispatcher()
    }

    /**
     * Thiết lập build dispatcher tùy chỉnh (hữu ích cho testing hoặc mở rộng Phase 2).
     */
    setBuildDispatcher(dispatcher: BuildDispatcher) {
        this.buildDispatcher = dispatcher
    }

    /**
     * Trích xuất structured spec patch từ nội dung người dùng nhập.
     */
    extractPatch(userInput: string, existingSpec?: Partial<AgentSpec>): SpecPatchResult {
        const text = userInput.trim()
        const patch: Partial<AgentSpec> = {}
        const extractedFields: string[] = []

        // 1. Trích xuất tên trợ lý (name)
        const namePatterns = [
            /(?:đặt\s+)?tên\s+(?:trợ\s+lý\s+là|bot\s+là|agent\s+là|là)\s*[:=]?\s*["'“]?([^.,;\n"”]{2,60})/i,
            /(?:gọi\s+là|tên\s+gọi\s*[:=]?)\s*["'“]?([^.,;\n"”]{2,60})/i,
            /tên\s*[:=]\s*["'“]?([^.,;\n"”]{2,60})/i
        ]

        for (const pattern of namePatterns) {
            const match = text.match(pattern)
            if (match && match[1]) {
                const rawName = match[1].trim()
                const extractedName = rawName.split(/\s+(?:và|với)\s+|[,.;\n]/)[0].trim()
                if (extractedName.length >= 2 && !extractedName.toLowerCase().startsWith('gì')) {
                    patch.name = extractedName
                    extractedFields.push('name')
                    break
                }
            }
        }

        // 2. Trích xuất mục tiêu (goal)
        const goalPatterns = [
            /(?:mục\s+tiêu|mục\s+đích|nhiệm\s+vụ)(?:\s+(?:chính|hoạt\s+động|của\s+(?:bot|agent|trợ\s+lý)))?\s*(?:là|:|=)?\s*["'“]?([^.,;\n"”]{5,300})/i,
            /(?:dùng\s+để|chuyên\s+dùng\s+để|có\s+tác\s+dụng)\s+([^.,;\n"”]{5,300})/i,
            /(?:giúp\s+(?:tôi|khách\s+hàng|người\s+dùng)|hỗ\s+trợ)\s+([^.,;\n"”]{5,300})/i
        ]

        for (const pattern of goalPatterns) {
            const match = text.match(pattern)
            if (match && match[1]) {
                const extractedGoal = match[1].trim()
                if (extractedGoal.length >= 5) {
                    patch.goal = extractedGoal
                    extractedFields.push('goal')
                    break
                }
            }
        }

        // Nếu chưa có goal nào trong existingSpec và tin nhắn đầu tiên có độ dài hợp lý
        if (!existingSpec?.goal && !patch.goal && text.length >= 10 && !extractedFields.includes('name')) {
            patch.goal = text.slice(0, 300)
            extractedFields.push('goal')
        }

        // 3. Trích xuất hướng dẫn (instructions / system prompt)
        const instructionPatterns = [
            /(?:hướng\s+dẫn|chỉ\s+dẫn|phong\s+cách|nguyên\s+tắc|quy\s+tắc|lưu\s+ý|system\s+prompt)(?:\s+(?:là|như\s+sau|gồm))?\s*[:=]?\s*(.+)/is,
            /(?:chỉ\s+trả\s+lời|luôn\s+trả\s+lời|trả\s+lời\s+bằng|phong\s+cách\s+giao\s+tiếp)\s*(.+)/is
        ]

        for (const pattern of instructionPatterns) {
            const match = text.match(pattern)
            if (match && match[1]) {
                const instr = match[1].trim()
                if (instr.length >= 10) {
                    patch.instructions = instr
                    extractedFields.push('instructions')
                    break
                }
            }
        }

        // 4. Trích xuất công cụ (tools)
        const detectedTools: ToolRef[] = []
        const lowerText = text.toLowerCase()

        if (lowerText.includes('tìm kiếm web') || lowerText.includes('web search') || lowerText.includes('tra cứu google')) {
            detectedTools.push({ id: 'tool_web_search', name: 'Web Search', type: 'webSearch' })
        }
        if (lowerText.includes('máy tính') || lowerText.includes('tính toán') || lowerText.includes('calculator')) {
            detectedTools.push({ id: 'tool_calc', name: 'Calculator', type: 'calculator' })
        }
        if (lowerText.includes('thời tiết') || lowerText.includes('weather')) {
            detectedTools.push({ id: 'tool_weather', name: 'Weather Tool', type: 'weather' })
        }
        if (lowerText.includes('gửi email') || lowerText.includes('send email')) {
            detectedTools.push({ id: 'tool_email', name: 'Email Sender', type: 'email' })
        }

        if (detectedTools.length > 0) {
            const existingTools = existingSpec?.tools || []
            const existingNames = new Set(existingTools.map((t) => t.name))
            const newTools = detectedTools.filter((t) => !existingNames.has(t.name))

            if (newTools.length > 0) {
                patch.tools = [...existingTools, ...newTools]
                extractedFields.push('tools')
            }
        }

        // 5. Trích xuất ví dụ kiểm thử (evaluationExamples)
        const examplePatterns = [
            /(?:ví\s+dụ(?:\s+câu\s+hỏi)?|câu\s+hỏi\s+mẫu|tình\s+huống\s+mẫu|test\s+case)\s*[:=]?\s*["'“]?([^"”\n]{5,200})["'”]?/i
        ]

        for (const pattern of examplePatterns) {
            const match = text.match(pattern)
            if (match && match[1]) {
                const sampleInput = match[1].trim()
                const newExample = {
                    input: sampleInput,
                    assertions: ['Phản hồi đúng trọng tâm câu hỏi và giữ phong cách tiếng Việt chuẩn mực']
                }
                const existingExamples = existingSpec?.evaluationExamples || []
                patch.evaluationExamples = [...existingExamples, newExample]
                extractedFields.push('evaluationExamples')
                break
            }
        }

        // 6. Trích xuất ngôn ngữ (language)
        if (lowerText.includes('tiếng anh') || lowerText.includes('english')) {
            patch.language = 'en'
            extractedFields.push('language')
        }

        // 7. Trích xuất loại Agent (kind: 'knowledge') (PH4-T04 / B-017)
        const isKnowledgeIntent =
            /(?:hỏi\s+đáp\s+tài\s+liệu|tra\s+cứu\s+(?:tài\s+liệu|quy\s+chế|chính\s+sách|văn\s+bản)|dựa\s+trên\s+tài\s+liệu|knowledge\s+agent|hệ\s+tri\s+thức|rag|kho\s+tài\s+liệu)/i.test(
                lowerText
            )
        if (isKnowledgeIntent && existingSpec?.kind !== 'knowledge') {
            patch.kind = 'knowledge'
            extractedFields.push('kind')
        }

        // 8. Trích xuất nguồn tài liệu (dataSources) (PH4-T04 / B-017)
        if (
            lowerText.includes('quy chế nội bộ') ||
            lowerText.includes('chính sách công ty') ||
            lowerText.includes('company policy') ||
            lowerText.includes('tài liệu nội bộ')
        ) {
            patch.dataSources = [
                {
                    id: 'fixture-docstore-company-policy',
                    name: 'Quy chế làm việc nội bộ',
                    type: 'documentStore'
                }
            ]
            if (patch.kind !== 'knowledge' && existingSpec?.kind !== 'knowledge') {
                patch.kind = 'knowledge'
                extractedFields.push('kind')
            }
            extractedFields.push('dataSources')
        } else {
            const docStorePattern =
                /(?:kho\s+tài\s+liệu|dùng\s+tài\s+liệu|sử\s+dụng\s+tài\s+liệu|nguồn\s+tài\s+liệu|tài\s+liệu)\s*[:=]?\s*["'“]?([^.,;\n"”]{3,80})/i
            const docMatch = text.match(docStorePattern)
            if (docMatch && docMatch[1]) {
                const storeName = docMatch[1].trim()
                const storeId = `store_${storeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
                patch.dataSources = [
                    {
                        id: storeId,
                        name: storeName,
                        type: 'documentStore'
                    }
                ]
                if (patch.kind !== 'knowledge' && existingSpec?.kind !== 'knowledge') {
                    patch.kind = 'knowledge'
                    extractedFields.push('kind')
                }
                extractedFields.push('dataSources')
            }
        }

        // 9. Trích xuất kết nối API (apiConnectors) (PH6-T02)
        const isApiIntent =
            /(?:gọi\s+api|kết\s+nối\s+api|truy\s+vấn\s+api|api\s+connector|tích\s+hợp\s+api|api\s+thời\s+tiết|api\s+tỷ\s+giá|api\s+đơn\s+hàng)/i.test(
                lowerText
            )
        if (isApiIntent && existingSpec?.kind !== 'api-readonly') {
            patch.kind = 'api-readonly'
            extractedFields.push('kind')
        }

        if (lowerText.includes('thời tiết') && (lowerText.includes('api') || lowerText.includes('nhiệt độ'))) {
            patch.apiConnectors = [
                {
                    connectorId: 'conn-weather-v1',
                    name: 'Dịch vụ Thời tiết Mẫu (OpenWeather)',
                    baseUrl: 'https://api.openweathermap.org/data/2.5',
                    allowedOperations: ['getWeatherByCity']
                }
            ]
            if (patch.kind !== 'api-readonly') {
                patch.kind = 'api-readonly'
                extractedFields.push('kind')
            }
            extractedFields.push('apiConnectors')
        } else {
            const apiPattern = /(?:kết\s+nối\s+api|dùng\s+api|gọi\s+api)\s*[:=]?\s*["'“]?([^.,;\n"”]{3,80})/i
            const apiMatch = text.match(apiPattern)
            if (apiMatch && apiMatch[1]) {
                const apiName = apiMatch[1].trim()
                const connId = `conn_${apiName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
                patch.apiConnectors = [
                    {
                        connectorId: connId,
                        name: apiName,
                        baseUrl: `https://api.${connId}.internal`
                    }
                ]
                if (patch.kind !== 'api-readonly') {
                    patch.kind = 'api-readonly'
                    extractedFields.push('kind')
                }
                extractedFields.push('apiConnectors')
            }
        }

        // 10. Trích xuất SQL Agent & Cấu hình CSDL (sqlConfig) (PH6-T06)
        const isSqlIntent =
            /(?:truy\s+vấn\s+sql|phân\s+tích\s+(?:cơ\s+sở\s+dữ\s+liệu|csdl|database)|sql\s+agent|tra\s+cứu\s+bảng|database\s+readonly|kết\s+nối\s+database|thực\s+thi\s+sql)/i.test(
                lowerText
            )
        if (isSqlIntent && existingSpec?.kind !== 'sql-readonly') {
            patch.kind = 'sql-readonly'
            extractedFields.push('kind')
        }

        if (isSqlIntent || lowerText.includes('bảng orders') || lowerText.includes('bảng customers') || lowerText.includes('bảng hóa đơn')) {
            const detectedTables: string[] = []
            if (lowerText.includes('orders') || lowerText.includes('hóa đơn') || lowerText.includes('đơn hàng')) {
                detectedTables.push('orders')
            }
            if (lowerText.includes('customers') || lowerText.includes('khách hàng')) {
                detectedTables.push('customers')
            }
            if (lowerText.includes('products') || lowerText.includes('sản phẩm')) {
                detectedTables.push('products')
            }

            // Tìm pattern bảng cụ thể nếu chưa phát hiện bảng nào
            if (detectedTables.length === 0) {
                const tablePattern = /(?:bảng|table)\s*[:=]?\s*([a-zA-Z0-9_]+)/i
                const match = text.match(tablePattern)
                if (match && match[1]) {
                    detectedTables.push(match[1].toLowerCase())
                } else {
                    // Mặc định cho phép orders và customers
                    detectedTables.push('orders', 'customers')
                }
            }

            // Trích xuất rowLimit nếu người dùng chỉ định
            let detectedLimit = 50
            const limitMatch = text.match(/(?:giới\s+hạn|tối\s+đa|limit)\s*[:=]?\s*(\d+)\s*(?:dòng|bản\s+ghi|records)?/i)
            if (limitMatch && limitMatch[1]) {
                const parsed = parseInt(limitMatch[1], 10)
                if (parsed > 0 && parsed <= 100) {
                    detectedLimit = parsed
                }
            }

            patch.sqlConfig = {
                databaseType: 'sqlite',
                databaseName: 'sales_mart',
                allowedTables: detectedTables,
                rowLimit: detectedLimit
            }
            if (patch.kind !== 'sql-readonly') {
                patch.kind = 'sql-readonly'
                extractedFields.push('kind')
            }
            extractedFields.push('sqlConfig')
        }

        // Tạo summary thay đổi
        let changeSummary = 'Cập nhật cấu hình Agent Spec'
        if (extractedFields.length > 0) {
            const labels: Record<string, string> = {
                name: 'tên trợ lý',
                goal: 'mục tiêu hoạt động',
                instructions: 'hướng dẫn phong cách',
                tools: 'công cụ',
                evaluationExamples: 'ví dụ kiểm thử',
                language: 'ngôn ngữ',
                kind: 'loại trợ lý',
                dataSources: 'kho tài liệu tri thức',
                apiConnectors: 'kết nối API',
                sqlConfig: 'cấu hình cơ sở dữ liệu SQL'
            }
            const updatedNames = extractedFields.map((f) => labels[f] || f).join(', ')
            changeSummary = `Bổ sung: ${updatedNames}`
        }

        return {
            patch,
            extractedFields,
            changeSummary
        }
    }

    /**
     * Sinh câu trả lời đàm thoại tiếng Việt thông minh, tập trung hỏi vào các trường còn thiếu
     * và tuyệt đối không hỏi lặp lại các trường người dùng đã cung cấp.
     */
    generateCollectorResponse(missingFields: string[], currentSpec: Partial<AgentSpec>, newlyExtracted: string[]): string {
        // Nếu đã đủ toàn bộ thông tin bắt buộc để build
        if (missingFields.length === 0) {
            const dataSourcesText =
                currentSpec.dataSources && currentSpec.dataSources.length > 0
                    ? `- **Kho tài liệu tri thức:** ${currentSpec.dataSources.map((d) => d.name || d.id).join(', ')}\n`
                    : ''
            const apiConnectorsText =
                currentSpec.apiConnectors && currentSpec.apiConnectors.length > 0
                    ? `- **Kết nối API:** ${currentSpec.apiConnectors.map((c) => c.name || c.connectorId).join(', ')}\n`
                    : ''
            const sqlConfigText =
                currentSpec.sqlConfig && currentSpec.sqlConfig.allowedTables && currentSpec.sqlConfig.allowedTables.length > 0
                    ? `- **Truy vấn SQL Readonly:** Bảng [${currentSpec.sqlConfig.allowedTables.join(', ')}], giới hạn ${currentSpec.sqlConfig.rowLimit || 50} dòng/truy vấn\n`
                    : ''
            return (
                `Tuyệt vời! Tôi đã tổng hợp đầy đủ thông tin cho trợ lý **${currentSpec.name || 'mới'}**:\n\n` +
                `- **Mục tiêu:** ${currentSpec.goal}\n` +
                `- **Phong cách/Chỉ dẫn:** ${currentSpec.instructions ? currentSpec.instructions.slice(0, 120) + '...' : 'Đầy đủ'}\n` +
                `- **Mô hình:** ${currentSpec.modelProfileRef || 'default-builder-model'}\n` +
                dataSourcesText +
                apiConnectorsText +
                sqlConfigText +
                (currentSpec.tools && currentSpec.tools.length > 0
                    ? `- **Công cụ:** ${currentSpec.tools.map((t) => t.name).join(', ')}\n`
                    : '') +
                `\nCấu hình đã đạt chuẩn sẵn sàng (buildReady). Hệ thống đã tự động kích hoạt lệnh phát sinh Agentflow V2!`
            )
        }

        // Lời cảm ơn / ghi nhận các trường vừa trích xuất được
        let ackText = ''
        if (newlyExtracted.length > 0) {
            const labels: Record<string, string> = {
                name: `tên trợ lý là **"${currentSpec.name}"**`,
                goal: `mục tiêu hoạt động`,
                instructions: `hướng dẫn vận hành chi tiết`,
                tools: `công cụ hỗ trợ`,
                evaluationExamples: `kịch bản câu hỏi kiểm thử`,
                language: `ngôn ngữ`,
                kind: `loại trợ lý SQL (SQL Readonly Agent)`,
                dataSources: `kho tài liệu tham chiếu`,
                apiConnectors: `kết nối API`,
                sqlConfig: `cấu hình bảng CSDL truy vấn`
            }
            const ackList = newlyExtracted.map((f) => labels[f] || f).join(', ')
            ackText = `Tôi đã ghi nhận ${ackList}. `
        }

        // Hỏi trường còn thiếu ưu tiên nhất (Anti-reask)
        const primaryMissing = missingFields[0]
        let question = ''

        switch (primaryMissing) {
            case 'name':
                question = 'Bạn hãy đặt Tên trợ lý này là gì? (Ví dụ: *Trợ lý CSKH Phụ Kiện*, *Bot Hỗ Trợ Kỹ Thuật*...)'
                break
            case 'goal':
                question = 'Mục tiêu chính mà bạn muốn trợ lý này giải quyết là gì?'
                break
            case 'instructions':
                question = `Bạn hãy cung cấp hướng dẫn hoặc phong cách trả lời cho **${
                    currentSpec.name || 'trợ lý'
                }** (ví dụ: luôn xưng hô lịch sự, trả lời ngắn gọn theo bullet, không tư vấn ngoài phạm vi sản phẩm...).`
                break
            case 'dataSources':
                question =
                    'Bạn muốn kết nối Agent này với kho tài liệu nào? (Ví dụ: Bạn có thể chọn kho tài liệu mẫu *"Quy chế làm việc nội bộ công ty"* hoặc cung cấp tên/mã kho tài liệu của bạn).'
                break
            case 'apiConnectors':
                question =
                    'Bạn muốn trợ lý kết nối với API nào? (Ví dụ: Bạn có thể chọn dịch vụ thời tiết OpenWeather hoặc cung cấp tên/đường dẫn API bạn muốn tích hợp).'
                break
            case 'sqlConfig.allowedTables':
                question =
                    'Bạn muốn trợ lý SQL được phép truy vấn những bảng dữ liệu nào? (Ví dụ: bảng orders, customers, products...).'
                break
            case 'evaluationExamples':
                question = 'Để đảm bảo chất lượng, bạn có thể cho tôi một câu hỏi mẫu hoặc tình huống thực tế để kiểm thử trợ lý không?'
                break
            case 'outputExpectations':
                question =
                    'Bạn có kỳ vọng cụ thể nào về định dạng kết quả trả về không (ví dụ: gạch đầu dòng, định dạng JSON, ngắn gọn...)?'
                break
            default:
                question = `Vui lòng cung cấp thêm thông tin về: ${primaryMissing}.`
        }

        return `${ackText}Để hoàn thiện cấu hình, ${question}`
    }

    /**
     * Tự động dispatch Build Intent khi Spec đạt buildReady.
     */
    async dispatchBuildIntent(sessionId: string, revisionNo: number, spec: AgentSpec): Promise<BuildIntent> {
        const intent: BuildIntent = {
            id: `build-${sessionId}-rev${revisionNo}-${Date.now()}`,
            sessionId,
            revisionNo,
            spec,
            status: 'dispatched',
            dispatchedAt: new Date().toISOString(),
            metadata: {
                source: 'chat-collector',
                generatorVersion: '2.0'
            }
        }

        await this.buildDispatcher.dispatch(intent)

        // Broadcast sự kiện SSE tới các client đang lắng nghe
        this.broadcastSSE(sessionId, {
            type: 'build_dispatched',
            data: intent,
            timestamp: intent.dispatchedAt
        })

        return intent
    }

    // ==============================|| SERVER-SENT EVENTS (SSE) ||============================== //

    /**
     * Đăng ký kết nối SSE cho một phiên làm việc.
     */
    addSSEClient(sessionId: string, res: Response) {
        if (!this.sseClients.has(sessionId)) {
            this.sseClients.set(sessionId, new Set())
        }
        this.sseClients.get(sessionId)!.add(res)

        // Gửi sự kiện kết nối ban đầu
        res.write(`event: connected\ndata: ${JSON.stringify({ sessionId, timestamp: new Date().toISOString() })}\n\n`)

        // Xóa client khi ngắt kết nối
        res.on('close', () => {
            this.removeSSEClient(sessionId, res)
        })
    }

    /**
     * Xóa kết nối client SSE.
     */
    removeSSEClient(sessionId: string, res: Response) {
        const clients = this.sseClients.get(sessionId)
        if (clients) {
            clients.delete(res)
            if (clients.size === 0) {
                this.sseClients.delete(sessionId)
            }
        }
    }

    /**
     * Phát sự kiện SSE tới tất cả clients của một phiên.
     */
    broadcastSSE(sessionId: string, payload: SSEPayload) {
        const clients = this.sseClients.get(sessionId)
        if (!clients || clients.size === 0) return

        const message = `event: ${payload.type}\ndata: ${JSON.stringify(payload.data)}\n\n`
        for (const client of clients) {
            try {
                client.write(message)
            } catch {
                // Client connection dropped
            }
        }
    }
}

/**
 * Mock Build Dispatcher phục vụ Phase 1 (đúng theo tiêu chí PH1-T10 trong PLAN_TONG_HOP.md).
 */
export class MockBuildDispatcher implements BuildDispatcher {
    public dispatchedIntents: BuildIntent[] = []

    async dispatch(intent: BuildIntent): Promise<{ success: boolean; intentId: string; status: string }> {
        this.dispatchedIntents.push(intent)
        return {
            success: true,
            intentId: intent.id,
            status: 'dispatched'
        }
    }
}

export default new CollectorService()
