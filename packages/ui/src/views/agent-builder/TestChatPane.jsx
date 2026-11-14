import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    Typography,
    TextField,
    IconButton,
    Paper,
    CircularProgress,
    Button,
    Chip,
    Stack,
    Alert,
    LinearProgress,
    Divider,
    Tooltip
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconSend, IconTrash, IconExternalLink, IconCheck, IconAlertCircle, IconPlayerStop } from '@tabler/icons-react'
import agentBuilderApi from '@/api/agentBuilder'
import { validateAssertions, formatTestMessage, extractPredictionText } from './testChatHelper'

const TestChatPane = ({
    flowId,
    flowName,
    revisionNo,
    evaluationExamples = [],
    buildStatus = null, // null | 'building' | 'failed' | 'cancelled'
    buildError = null,
    onCancelBuild,
    onRetryBuild
}) => {
    const theme = useTheme()
    const [testMessages, setTestMessages] = useState([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [testError, setTestError] = useState(null)
    const messagesEndRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [testMessages, isLoading])

    // Xóa hội thoại thử nghiệm (độc lập với hội thoại thiết kế)
    const handleClearChat = () => {
        setTestMessages([])
        setTestError(null)
    }

    // Gửi câu hỏi thử nghiệm tới Agentflow draft
    const handleSendTest = async (questionText) => {
        const text = questionText || input
        if (!text.trim() || isLoading || !flowId) return

        const userMsg = formatTestMessage('user', text)
        setTestMessages((prev) => [...prev, userMsg])
        if (!questionText) setInput('')
        setIsLoading(true)
        setTestError(null)

        try {
            // Chuẩn bị chat history đơn giản
            const history = testMessages.map((m) => ({
                role: m.role === 'user' ? 'userMessage' : 'apiMessage',
                content: m.content
            }))

            const res = await agentBuilderApi.testPrediction(flowId, {
                question: text,
                history
            })

            const replyContent = extractPredictionText(res.data)

            // Kiểm tra các assertions từ evaluationExamples nếu câu hỏi này khớp
            const matchedExample = evaluationExamples.find((ex) => ex.input && ex.input.trim().toLowerCase() === text.trim().toLowerCase())
            let assertionResult = null
            if (matchedExample?.assertions?.length) {
                assertionResult = validateAssertions(replyContent, matchedExample.assertions)
            }

            const botMsg = formatTestMessage('assistant', replyContent, { assertionResult })
            setTestMessages((prev) => [...prev, botMsg])
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi gửi prediction thử nghiệm:', err)
            const errMsg = err?.response?.data?.message || err?.message || 'Không thể kết nối tới Agent draft.'
            setTestError(errMsg)
        } finally {
            setIsLoading(false)
        }
    }

    // 1. Trạng thái Đang Build
    if (buildStatus === 'building') {
        return (
            <Paper
                variant='outlined'
                sx={{
                    p: 4,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    borderRadius: 2
                }}
            >
                <CircularProgress size={54} thickness={4} sx={{ mb: 3, color: theme.palette.primary.main }} />
                <Typography variant='h4' gutterBottom>
                    Đang Biên Dịch Agentflow V2...
                </Typography>
                <Typography variant='body2' color='textSecondary' sx={{ maxWidth: 400, mb: 3 }}>
                    Hệ thống đang lập AgentPlan tất định, thẩm định cấu trúc đồ thị và đăng ký bản draft trên Flowise runtime.
                </Typography>
                <Box sx={{ width: '80%', maxWidth: 350, mb: 3 }}>
                    <LinearProgress color='primary' sx={{ height: 6, borderRadius: 3 }} />
                </Box>
                {onCancelBuild && (
                    <Button variant='outlined' color='error' size='small' startIcon={<IconPlayerStop size={16} />} onClick={onCancelBuild}>
                        Hủy tác vụ build
                    </Button>
                )}
            </Paper>
        )
    }

    // 2. Trạng thái Build Thất Bại
    if (buildStatus === 'failed') {
        return (
            <Paper
                variant='outlined'
                sx={{
                    p: 4,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    borderRadius: 2
                }}
            >
                <IconAlertCircle size={54} color={theme.palette.error.main} style={{ marginBottom: 16 }} />
                <Typography variant='h4' color='error' gutterBottom>
                    Biên Dịch Agentflow Thất Bại
                </Typography>
                <Alert severity='error' sx={{ mb: 3, maxWidth: 450, textAlign: 'left' }}>
                    {buildError || 'Không thể biên dịch cấu hình thành đồ thị Flowise. Vui lòng kiểm tra lại thông số.'}
                </Alert>
                {onRetryBuild && (
                    <Button variant='contained' color='primary' onClick={onRetryBuild}>
                        Thử Lại Biên Dịch
                    </Button>
                )}
            </Paper>
        )
    }

    // 3. Trạng thái Chưa Có Bản Draft
    if (!flowId) {
        return (
            <Paper
                variant='outlined'
                sx={{
                    p: 4,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    borderRadius: 2,
                    backgroundColor: theme.palette.grey[50]
                }}
            >
                <Typography variant='h4' gutterBottom color='textSecondary'>
                    Chưa Có Bản Draft Chạy Thử
                </Typography>
                <Typography variant='body2' color='textSecondary' sx={{ maxWidth: 380, mb: 3 }}>
                    Vui lòng hoàn thiện cấu hình ở tab <strong>Cấu hình Agent</strong> và nhấn nút{' '}
                    <strong>&quot;Tạo Agentflow V2&quot;</strong> để biên dịch đồ thị và bắt đầu chat thử nghiệm.
                </Typography>
            </Paper>
        )
    }

    // 4. Giao diện Chat Thử Nghiệm với Agent Draft
    return (
        <Paper
            variant='outlined'
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2,
                overflow: 'hidden'
            }}
        >
            {/* Header thông tin bản draft */}
            <Box
                sx={{
                    p: 1.5,
                    px: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant='subtitle1' fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
                        {flowName || 'Agent Draft'}
                    </Typography>
                    <Chip label={`Rev #${revisionNo || 1}`} size='small' color='primary' variant='outlined' />
                    <Chip label='Draft' size='small' color='secondary' sx={{ height: 20, fontSize: '0.7rem' }} />
                </Box>
                <Stack direction='row' spacing={0.5}>
                    <Tooltip title='Xóa lịch sử chat thử'>
                        <IconButton size='small' onClick={handleClearChat} disabled={testMessages.length === 0}>
                            <IconTrash size={18} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title='Mở trên Flowise Canvas'>
                        <IconButton
                            size='small'
                            color='primary'
                            onClick={() => window.open(`/canvas/${flowId}`, '_blank', 'noopener,noreferrer')}
                        >
                            <IconExternalLink size={18} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {/* Thông báo lỗi nếu có */}
            {testError && (
                <Alert severity='error' onClose={() => setTestError(null)} sx={{ borderRadius: 0 }}>
                    {testError}
                </Alert>
            )}

            {/* Danh sách tin nhắn test */}
            <Box
                sx={{
                    flex: 1,
                    overflowY: 'auto',
                    p: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5
                }}
            >
                {testMessages.length === 0 && (
                    <Box sx={{ my: 'auto', textAlign: 'center', color: theme.palette.text.secondary }}>
                        <Typography variant='body2' gutterBottom>
                            Đây là môi trường chạy thử nghiệm độc lập với trợ lý thật.
                        </Typography>
                        <Typography variant='caption'>Gõ câu hỏi bên dưới để bắt đầu tương tác với Agent draft.</Typography>
                    </Box>
                )}

                {testMessages.map((msg) => (
                    <Box
                        key={msg.id}
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
                        }}
                    >
                        <Paper
                            elevation={0}
                            sx={{
                                p: 1.5,
                                maxWidth: '85%',
                                borderRadius: 2,
                                backgroundColor: msg.role === 'user' ? theme.palette.primary.main : theme.palette.grey[100],
                                color: msg.role === 'user' ? '#fff' : theme.palette.text.primary
                            }}
                        >
                            <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {msg.content}
                            </Typography>
                        </Paper>

                        {/* Huy hiệu Assertion nếu có */}
                        {msg.assertionResult && (
                            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {msg.assertionResult.passed ? (
                                    <Chip
                                        icon={<IconCheck size={14} color='green' />}
                                        label={`Đạt tiêu chí (${msg.assertionResult.passedCount}/${msg.assertionResult.total})`}
                                        size='small'
                                        color='success'
                                        variant='outlined'
                                        sx={{ height: 20, fontSize: '0.65rem' }}
                                    />
                                ) : (
                                    <Chip
                                        icon={<IconAlertCircle size={14} color='orange' />}
                                        label={`Chưa khớp tiêu chí (${msg.assertionResult.passedCount}/${msg.assertionResult.total})`}
                                        size='small'
                                        color='warning'
                                        variant='outlined'
                                        sx={{ height: 20, fontSize: '0.65rem' }}
                                    />
                                )}
                            </Box>
                        )}

                        <Typography variant='caption' sx={{ fontSize: '0.65rem', color: theme.palette.text.secondary, mt: 0.25 }}>
                            {msg.timestamp}
                        </Typography>
                    </Box>
                ))}

                {isLoading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} />
                        <Typography variant='caption' color='textSecondary'>
                            Agent đang xử lý câu trả lời...
                        </Typography>
                    </Box>
                )}

                <div ref={messagesEndRef} />
            </Box>

            {/* Gợi ý câu hỏi kiểm thử từ Evaluation Examples */}
            {evaluationExamples.length > 0 && (
                <Box
                    sx={{
                        px: 2,
                        py: 1,
                        backgroundColor: theme.palette.background.default,
                        borderTop: `1px solid ${theme.palette.divider}`
                    }}
                >
                    <Typography variant='caption' color='textSecondary' display='block' sx={{ mb: 0.5, fontWeight: 500 }}>
                        Câu hỏi mẫu thử nghiệm:
                    </Typography>
                    <Stack direction='row' spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
                        {evaluationExamples.map((ex, idx) => (
                            <Chip
                                key={idx}
                                label={ex.input}
                                size='small'
                                clickable
                                disabled={isLoading}
                                onClick={() => handleSendTest(ex.input)}
                                sx={{ fontSize: '0.75rem' }}
                            />
                        ))}
                    </Stack>
                </Box>
            )}

            <Divider />

            {/* Form gửi tin nhắn test */}
            <Box
                component='form'
                onSubmit={(e) => {
                    e.preventDefault()
                    handleSendTest()
                }}
                sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    backgroundColor: theme.palette.background.paper
                }}
            >
                <TextField
                    fullWidth
                    size='small'
                    placeholder='Nhập câu hỏi để thử nghiệm với Agent...'
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isLoading}
                    variant='outlined'
                />
                <IconButton color='primary' type='submit' disabled={!input.trim() || isLoading}>
                    <IconSend size={20} />
                </IconButton>
            </Box>
        </Paper>
    )
}

TestChatPane.propTypes = {
    flowId: PropTypes.string,
    flowName: PropTypes.string,
    revisionNo: PropTypes.number,
    evaluationExamples: PropTypes.array,
    buildStatus: PropTypes.string,
    buildError: PropTypes.string,
    onCancelBuild: PropTypes.func,
    onRetryBuild: PropTypes.func
}

export default TestChatPane
