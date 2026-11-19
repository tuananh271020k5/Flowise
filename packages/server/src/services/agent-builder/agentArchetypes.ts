import type { AgentSpec } from './types'

export type AgentArchetypeId =
    | 'conversational_cskh'
    | 'knowledge_rag'
    | 'agentic_rag'
    | 'router_triage'
    | 'sequential_pipeline'
    | 'batch_iteration'
    | 'mcp_api_automation'
    | 'sql_human_governance'

export interface AgentArchetypeDefinition {
    id: AgentArchetypeId
    titleVi: string
    patternHint: string
    keyAttributesVi: string[]
    keywords: RegExp
}

/**
 * Danh mục 8 khuôn mẫu (Archetypes) bao phủ toàn bộ các dòng Agent thực tế & Marketplace Agentflow V2.
 * Phục vụ định tuyến 0-token ở phía server: chỉ bơm đúng 1-2 blueprint sát ngữ cảnh nhất vào prompt
 * để tiết kiệm tối đa token mà vẫn giúp các model gọn nhẹ (như dòng mini / luna) lập luồng chuẩn xác.
 */
export const AGENT_ARCHETYPES: ReadonlyArray<AgentArchetypeDefinition> = [
    {
        id: 'agentic_rag',
        titleVi: 'Trợ lý Tài liệu Tự kiểm chứng (Agentic RAG)',
        patternHint:
            'initialState:{query:""}; Start -> conditionAgent(kiểm tra câu hỏi hợp lệ) -> llm(tạo query, updateState:"query") -> retriever(stateKeys:["query"]) -> conditionAgent(tài liệu liên quan?): nhánh "0" llm trả lời(inputFrom:["start",retriever]), nhánh "1" llm viết lại query(updateState:"query") -> loop(loopBackTo:retriever, maxLoops:3).',
        keyAttributesVi: [
            'Tài liệu nguồn (dataSources)',
            'Biến trạng thái query & vòng lặp tự sửa truy vấn (maxLoops)',
            'Quy tắc dẫn nguồn & phản hồi ngoài phạm vi'
        ],
        keywords: /agentic\s*rag|tự\s*(?:sửa|viết\s*lại)\s*(?:câu\s*hỏi|truy\s*vấn|query)|lặp\s*(?:lại\s*)?tìm|self[- ]?correct/i
    },
    {
        id: 'knowledge_rag',
        titleVi: 'Trợ lý Hỏi đáp Tài liệu / Quy chế (RAG)',
        patternHint:
            'Start -> retriever(inputFrom:["start"]) -> condition(notEmpty): nhánh "true" llm/agent(inputFrom:["start",retriever]) trả lời chi tiết kèm [nguồn], nhánh "false" reply(inputFrom:[]) từ chối lịch sự ngoài phạm vi.',
        keyAttributesVi: [
            'Tài liệu đính kèm PDF/DOCX/MD/CSV',
            'Cách tìm từ khóa hoặc vector embedding',
            'Trích dẫn nguồn & chống bịa ngoài tài liệu'
        ],
        keywords: /tài\s*liệu|quy\s*chế|sổ\s*tay|hướng\s*dẫn\s*sử\s*dụng|chính\s*sách\s*nội\s*bộ|pdf|docx|rag|trích\s*dẫn/i
    },
    {
        id: 'mcp_api_automation',
        titleVi: 'Trợ lý Tự động hóa Công cụ Ngoài / Văn phòng (MCP & API)',
        patternHint:
            'Gắn mcpServerIds (Drive/Excel/Sheets/Word/Slack...) vào bước agent hoặc dùng bước http với apiConnectors; nếu có thao tác ghi/xóa quan trọng nên chèn humanInput duyệt trước.',
        keyAttributesVi: [
            'Kết nối MCP Server / API Connector trong Workspace',
            'Phân tách bước đọc dữ liệu và bước ghi/cập nhật',
            'Cổng người duyệt (HumanInput) nếu thao tác nhạy cảm'
        ],
        keywords:
            /google\s*drive|drive|excel|google\s*sheets|sheets|word|onedrive|slack|gmail|github|notion|jira|mcp|webhook|rest\s*api|đồng\s*bộ/i
    },
    {
        id: 'router_triage',
        titleVi: 'Trợ lý Phân loại & Điều phối Đa nhánh (Router / Triage)',
        patternHint:
            'Start -> conditionAgent với scenarios:[2..6 nhóm rõ ràng, không chồng chéo] -> nối branch "0","1",... sang từng bước llm/agent/reply chuyên trách.',
        keyAttributesVi: [
            'Danh sách 2..6 nhóm phân loại (scenarios)',
            'Tiêu chí phân biệt từng nhóm (khẩn cấp, phòng ban, ý định)',
            'Quy trình xử lý riêng cho mỗi nhánh'
        ],
        keywords: /phân\s*loại|định\s*tuyến|rẽ\s*nhánh|chia\s*nhóm|ticket|khiếu\s*nại|khẩn\s*cấp|chuyển\s*bộ\s*phận|handoff|triage/i
    },
    {
        id: 'batch_iteration',
        titleVi: 'Trợ lý Xử lý Hàng loạt theo Danh sách (Iteration)',
        patternHint:
            'Start -> llm(tách danh sách mảng JSON từ đầu vào) -> iteration(xử lý từng mục) -> llm(tổng hợp bảng/báo cáo cuối cùng).',
        keyAttributesVi: [
            'Định dạng danh sách đầu vào (nhiều mục/dòng/hồ sơ)',
            'Quy tắc chấm/chuẩn hóa cho từng phần tử',
            'Định dạng bảng tổng hợp đầu ra'
        ],
        keywords: /hàng\s*loạt|danh\s*sách|từng\s*(?:dòng|mục|ứng\s*viên|cv|sản\s*phẩm|đơn)|duyệt\s*qua\s*mảng|iteration/i
    },
    {
        id: 'sequential_pipeline',
        titleVi: 'Chuỗi Biên tập & Nghiên cứu Đa bước (Sequential Pipeline)',
        patternHint:
            'Start -> llm/agent Bước 1 (nghiên cứu/dàn ý) -> llm Bước 2 (triển khai chi tiết) -> llm Bước 3 (biên tập/định dạng đầu ra).',
        keyAttributesVi: [
            'Thứ tự các công đoạn xử lý nối tiếp',
            'Đầu vào - đầu ra bàn giao giữa từng bước',
            'Quy chuẩn định dạng bản cuối (Markdown, bảng, JSON)'
        ],
        keywords:
            /kịch\s*bản|chia\s*cảnh|bài\s*viết|nghiên\s*cứu\s*sâu|deep\s*research|dàn\s*ý|biên\s*tập|quy\s*trình\s*\d+\s*bước|tóm\s*tắt\s*rồi/i
    },
    {
        id: 'sql_human_governance',
        titleVi: 'Trợ lý Truy vấn SQL & Phê duyệt Con người (Governance)',
        patternHint:
            'Truy vấn SQL chỉ đọc trên allowedTables có rowLimit, hoặc đặt humanInput (branch "0" duyệt / "1" từ chối) trước bước thực thi quan trọng.',
        keyAttributesVi: [
            'Danh mục bảng SQL được phép đọc & giới hạn dòng',
            'Điều kiện cần con người bấm Đồng ý / Từ chối (HumanInput)',
            'Thông báo khi thao tác bị từ chối'
        ],
        keywords:
            /sql|database|cơ\s*sở\s*dữ\s*liệu|bảng\s*dữ\s*liệu|phê\s*duyệt|chờ\s*(?:người|sếp|quản\s*lý)\s*duyệt|human\s*in\s*the\s*loop/i
    },
    {
        id: 'conversational_cskh',
        titleVi: 'Trợ lý Tư vấn / CSKH / Chuyên viên Ảo',
        patternHint:
            'Với tư vấn đơn giản dùng Start -> llm/agent gọn nhẹ; giữ chặt vai trò cửa hàng/tổ chức, không bịa giá/tồn kho chưa cấp.',
        keyAttributesVi: [
            'Tên gọi & vai trò đại diện cụ thể',
            'Thông tin nghiệp vụ gốc (giờ làm việc, chính sách, bảng giá)',
            'Giọng văn, độ dài câu trả lời & cách xử lý câu hỏi chưa rõ'
        ],
        keywords: /tư\s*vấn|cskh|chăm\s*sóc\s*khách\s*hàng|bán\s*hàng|shop|cửa\s*hàng|lễ\s*tân|dịch\s*thuật|trợ\s*lý/i
    }
]

export function getArchetypeById(id?: string): AgentArchetypeDefinition | undefined {
    return AGENT_ARCHETYPES.find((item) => item.id === id)
}

/**
 * Phân loại nhanh 0-token dựa trên tin nhắn người dùng và trạng thái Spec hiện tại.
 * Trả về tối đa 2 khuôn mẫu sát nhất để bơm vào ngữ cảnh Planner mà không làm phình prompt.
 */
export function detectAgentArchetypes(message: string, spec?: Partial<AgentSpec>): AgentArchetypeDefinition[] {
    const combined = `${message || ''} ${spec?.goal || ''} ${spec?.instructions || ''} ${spec?.workflow?.summary || ''}`
    const matched: AgentArchetypeDefinition[] = []

    const steps = spec?.workflow?.steps || []
    if (steps.some((s) => s.type === 'loop') && steps.some((s) => s.type === 'retriever')) {
        matched.push(getArchetypeById('agentic_rag')!)
    } else if ((spec?.dataSources && spec.dataSources.length > 0) || steps.some((s) => s.type === 'retriever')) {
        matched.push(getArchetypeById('knowledge_rag')!)
    }
    if ((spec?.mcpServers && spec.mcpServers.length > 0) || steps.some((s) => s.mcpServerIds?.length || s.type === 'http')) {
        matched.push(getArchetypeById('mcp_api_automation')!)
    }

    for (const arch of AGENT_ARCHETYPES) {
        if (matched.length >= 2) break
        if (!matched.some((m) => m.id === arch.id) && arch.keywords.test(combined)) {
            matched.push(arch)
        }
    }

    if (matched.length === 0) {
        matched.push(getArchetypeById('conversational_cskh')!)
    }

    return matched.slice(0, 2)
}

/**
 * Bộ phân tích khoảng trống 0-token (Zero-Token Gap Analyzer):
 * Đối chiếu Spec hiện tại với khuôn mẫu Agent để tự động sinh tối đa 3 gợi ý tiếp theo
 * giống phong cách tư vấn của ChatGPT / Gemini (ưu tiên gợi ý của LLM nếu có, bù thêm nếu thiếu).
 */
export function buildContextualSuggestions(spec: Partial<AgentSpec>, latestText = '', availableMcpCount = 0): string[] {
    const workflow = spec.workflow
    const llmSuggestions = (workflow?.suggestions || []).map((s) => s.trim()).filter(Boolean)
    const archetypes = workflow?.archetype
        ? [getArchetypeById(workflow.archetype), ...detectAgentArchetypes(latestText, spec)].filter((x): x is AgentArchetypeDefinition =>
              Boolean(x)
          )
        : detectAgentArchetypes(latestText, spec)
    const primary = archetypes[0] || getArchetypeById('conversational_cskh')!
    const steps = workflow?.steps || []

    const fallbackPool: string[] = []

    if (primary.id === 'knowledge_rag') {
        if (!spec.dataSources?.length) {
            fallbackPool.push('Tôi sẽ đính kèm file tài liệu PDF/DOCX/MD ngay bên dưới để làm nguồn tri thức.')
        } else {
            if (!steps.some((s) => s.type === 'loop')) {
                fallbackPool.push(
                    'Nâng cấp lên Agentic RAG: nếu tìm tài liệu lần đầu chưa khớp thì tự viết lại câu truy vấn và tìm lại tối đa 3 vòng.'
                )
            }
            if (!spec.outputExpectations?.length) {
                fallbackPool.push(
                    'Trả lời ngắn gọn theo từng bước đánh số, luôn trích dẫn mục tài liệu và từ chối lịch sự câu hỏi ngoài phạm vi.'
                )
            }
        }
    } else if (primary.id === 'agentic_rag') {
        if (!spec.outputExpectations?.length) {
            fallbackPool.push('Quy định câu trả lời nêu rõ từng bước thao tác, đính kèm trích dẫn [nguồn] ở cuối câu.')
        }
        if (!steps.some((s) => s.type === 'humanInput')) {
            fallbackPool.push('Nếu sau 3 vòng tìm kiếm vẫn không có tài liệu thì hướng dẫn người dùng liên hệ bộ phận phụ trách.')
        }
    } else if (primary.id === 'mcp_api_automation') {
        if (!spec.mcpServers?.length && availableMcpCount === 0) {
            fallbackPool.push('Hướng dẫn các bước chuẩn hóa dữ liệu trước, tôi sẽ bấm nút Kết nối MCP để gắn công cụ sau.')
        }
        if (!steps.some((s) => s.type === 'humanInput')) {
            fallbackPool.push('Thêm bước chờ người dùng bấm duyệt (HumanInput) trước khi ghi hoặc cập nhật dữ liệu ra bên ngoài.')
        }
        if (!spec.outputExpectations?.length) {
            fallbackPool.push('Sau khi thực thi công cụ xong, tóm tắt rõ trạng thái thành công/thất bại và các mục đã cập nhật.')
        }
    } else if (primary.id === 'router_triage') {
        fallbackPool.push(
            'Quy định lỗi 500/502, mất kết nối, không đăng nhập được hoặc ảnh hưởng diện rộng là Khẩn cấp (P1), ưu tiên trấn an khách ngay.'
        )
        if (!spec.outputExpectations?.length) {
            fallbackPool.push(
                'Đầu ra mỗi nhánh gồm: [Nhãn phân loại], [Mức độ ưu tiên], [Tóm tắt 1 dòng] và [Câu phản hồi lịch sự gửi khách hàng].'
            )
        }
        fallbackPool.push(
            'Nếu nội dung khách gửi quá ngắn chưa đủ kết luận nhóm nào thì hỏi lại lịch sự 1-2 chi tiết thay vì phân loại bừa.'
        )
    } else if (primary.id === 'batch_iteration') {
        fallbackPool.push('Thêm bước cuối tổng hợp toàn bộ kết quả sau vòng lặp thành bảng Markdown ngắn gọn.')
        if (!spec.outputExpectations?.length) {
            fallbackPool.push('Nếu có mục dữ liệu bị thiếu thông tin thì đánh dấu "Cần kiểm tra lại" thay vì bỏ sót.')
        }
    } else if (primary.id === 'sequential_pipeline') {
        if (!spec.outputExpectations?.length) {
            fallbackPool.push('Định dạng kết quả đầu ra cuối cùng rõ ràng theo từng phần có tiêu đề và gạch đầu dòng.')
        }
        fallbackPool.push('Thêm bước rà soát chất lượng cuối cùng để kiểm tra tính nhất quán trước khi trả kết quả.')
    } else if (primary.id === 'conversational_cskh') {
        if (!spec.instructions || spec.instructions.length < 80) {
            fallbackPool.push('Bổ sung quy tắc: trả lời lịch sự tối đa 3-4 câu, không tự bịa giá bán/tồn kho khi chưa có dữ liệu xác nhận.')
        }
        if (!steps.some((s) => s.type === 'conditionAgent')) {
            fallbackPool.push(
                'Thêm bước AI tự phân loại nhu cầu khách hàng (hỏi sản phẩm, bảo hành/đổi trả, hay khiếu nại) để trả lời sát hơn.'
            )
        }
        if (!spec.dataSources?.length) {
            fallbackPool.push('Tôi muốn đính kèm thêm tài liệu bảng giá / chính sách câu hỏi thường gặp (FAQ) cho cửa hàng.')
        }
    }

    if (!spec.evaluationExamples || spec.evaluationExamples.length === 0) {
        fallbackPool.push('Thêm 2 câu hỏi tình huống mẫu để kiểm thử chất lượng Agent sau khi tạo.')
    }

    const combined: string[] = []
    const seen = new Set<string>()
    for (const item of [...llmSuggestions, ...fallbackPool]) {
        const key = item.toLowerCase()
        if (!seen.has(key) && item.length <= 220) {
            seen.add(key)
            combined.push(item)
        }
        if (combined.length >= 3) break
    }
    return combined
}
