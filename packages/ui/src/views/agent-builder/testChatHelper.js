/**
 * Helper xử lý logic cho Panel Chat Thử Nghiệm (PH3-T01 & PH3-T02).
 */

/**
 * Kiểm tra các assertions kiểm thử từ evaluationExamples đối với câu trả lời của Agent.
 */
export function validateAssertions(replyContent, assertions = []) {
    if (!replyContent || typeof replyContent !== 'string' || !Array.isArray(assertions) || assertions.length === 0) {
        return {
            total: 0,
            passedCount: 0,
            passed: false,
            matchedAssertions: []
        }
    }

    const replyLower = replyContent.toLowerCase()
    const matched = assertions.filter((ast) => typeof ast === 'string' && replyLower.includes(ast.toLowerCase()))

    return {
        total: assertions.length,
        passedCount: matched.length,
        passed: matched.length === assertions.length,
        matchedAssertions: matched
    }
}

/**
 * Chuẩn hóa tin nhắn trong hội thoại chat thử nghiệm.
 */
export function formatTestMessage(role, content, extra = {}) {
    return {
        id: `test_${role[0]}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        role,
        content: typeof content === 'string' ? content : JSON.stringify(content),
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        ...extra
    }
}

/**
 * Trích xuất nội dung văn bản phản hồi từ API prediction Flowise.
 */
export function extractPredictionText(responseData) {
    if (!responseData) return ''
    if (typeof responseData === 'string') return responseData
    if (typeof responseData === 'object') {
        return responseData.text || responseData.response || responseData.message || JSON.stringify(responseData)
    }
    return String(responseData)
}
