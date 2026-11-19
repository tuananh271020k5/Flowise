import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import {
    Alert,
    Box,
    Button,
    Card,
    Chip,
    CircularProgress,
    Collapse,
    Container,
    Divider,
    IconButton,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconChevronDown, IconChevronUp, IconFileText, IconRefresh, IconSend, IconUser } from '@tabler/icons-react'
import { baseURL } from '@/store/constant'
import { MemoizedReactMarkdown } from '@/ui-component/markdown/MemoizedReactMarkdown'
import { extractPredictionText, extractSourceDocuments, formatTestMessage } from '@/views/agent-builder/testChatHelper'

const createChatId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `portal_${crypto.randomUUID()}`
    return `portal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const QUICK_STARTERS = [
    'Hướng dẫn tôi cách sử dụng dịch vụ và các quy định cơ bản (L1)',
    'Tôi cần truy cập đúng ứng dụng / trang chức năng để thao tác (L2)',
    'Tôi gặp sự cố cần tạo phiếu yêu cầu hỗ trợ gửi bộ phận xử lý (L3)'
]

const SupportPortal = () => {
    const { id: flowId } = useParams()
    const theme = useTheme()
    const [chatflow, setChatflow] = useState(null)
    const [loadingFlow, setLoadingFlow] = useState(true)
    const [accessError, setAccessError] = useState('')

    const [chatId, setChatId] = useState(() => {
        try {
            const existing = sessionStorage.getItem(`support_portal_chat_${flowId}`)
            if (existing) return existing
            const next = createChatId()
            sessionStorage.setItem(`support_portal_chat_${flowId}`, next)
            return next
        } catch {
            return createChatId()
        }
    })

    const [customerName, setCustomerName] = useState('')
    const [customerContact, setCustomerContact] = useState('')
    const [showCustomerForm, setShowCustomerForm] = useState(false)
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [sendError, setSendError] = useState('')
    const [expandedCitations, setExpandedCitations] = useState({})
    const messagesEndRef = useRef(null)

    useEffect(() => {
        let active = true
        const loadPublicFlow = async () => {
            if (!flowId) {
                setAccessError('Thiếu mã trợ lý trong đường dẫn.')
                setLoadingFlow(false)
                return
            }
            setLoadingFlow(true)
            setAccessError('')
            try {
                const res = await axios.get(`${baseURL}/api/v1/public-chatflows/${flowId}`)
                if (!active) return
                if (!res.data || !res.data.isPublic) {
                    setAccessError(
                        'Trợ lý này chưa được Quản trị viên xuất bản ở chế độ Công khai (Public). Vui lòng mở trang Admin -> Xuất Bản và bật tùy chọn Cổng Người Dùng Cuối.'
                    )
                    setChatflow(null)
                } else {
                    setChatflow(res.data)
                }
            } catch (err) {
                if (!active) return
                const status = err?.response?.status
                if (status === 401 || status === 403) {
                    setAccessError(
                        'Trợ lý này đang ở chế độ riêng tư (chưa mở Cổng Người Dùng Cuối). Quản trị viên cần vào /agent-builder -> bấm Xuất Bản -> bật chế độ Công khai.'
                    )
                } else {
                    setAccessError('Không tìm thấy trợ lý hỗ trợ theo đường dẫn này.')
                }
                setChatflow(null)
            } finally {
                if (active) setLoadingFlow(false)
            }
        }
        loadPublicFlow()
        return () => {
            active = false
        }
    }, [flowId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isSending])

    const handleNewConversation = () => {
        const nextId = createChatId()
        setChatId(nextId)
        try {
            sessionStorage.setItem(`support_portal_chat_${flowId}`, nextId)
        } catch {
            // Ignore storage errors
        }
        setMessages([])
        setSendError('')
        setInput('')
    }

    const handleSend = async (overrideText) => {
        const cleanText = (overrideText ?? input).trim()
        if (!cleanText || isSending || !flowId) return

        const userMsg = formatTestMessage('user', cleanText)
        setMessages((prev) => [...prev, userMsg])
        if (!overrideText) setInput('')
        setIsSending(true)
        setSendError('')

        let questionPayload = cleanText
        const hasCustomerInfo = customerName.trim() || customerContact.trim()
        if (hasCustomerInfo && messages.length === 0) {
            const parts = []
            if (customerName.trim()) parts.push(`Tên khách hàng: ${customerName.trim()}`)
            if (customerContact.trim()) parts.push(`Liên hệ/Tài khoản: ${customerContact.trim()}`)
            questionPayload = `[Thông tin khách hàng cung cấp: ${parts.join(' | ')}]\n${cleanText}`
        }

        try {
            const res = await axios.post(`${baseURL}/api/v1/prediction/${flowId}`, {
                question: questionPayload,
                chatId
            })
            const replyText = extractPredictionText(res.data)
            const sourceDocuments = extractSourceDocuments(res.data)
            const botMsg = formatTestMessage('assistant', replyText, { sourceDocuments })
            setMessages((prev) => [...prev, botMsg])
        } catch (err) {
            const status = err?.response?.status
            if (status === 403 || status === 401) {
                setSendError('Trợ lý chưa được xuất bản công khai. Hãy yêu cầu Quản trị viên bật chế độ Công khai khi Xuất Bản.')
            } else {
                setSendError(err?.response?.data?.message || err?.message || 'Không thể kết nối tới trợ lý hỗ trợ.')
            }
        } finally {
            setIsSending(false)
        }
    }

    if (loadingFlow) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc' }}>
                <Stack spacing={2} alignItems='center'>
                    <CircularProgress size={34} />
                    <Typography variant='body2' color='textSecondary'>
                        Đang kết nối tới cổng hỗ trợ khách hàng...
                    </Typography>
                </Stack>
            </Box>
        )
    }

    if (accessError || !chatflow) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc', p: 2 }}>
                <Card variant='outlined' sx={{ maxWidth: 540, width: '100%', p: 3, borderRadius: 2.5 }}>
                    <Stack spacing={2}>
                        <Typography variant='h3' sx={{ fontWeight: 700 }}>
                            Cổng Hỗ Trợ Khách Hàng Chưa Khả Dụng
                        </Typography>
                        <Alert severity='warning'>{accessError}</Alert>
                        <Typography variant='body2' color='textSecondary'>
                            Gợi ý kiểm thử 2 vai trò: Mở tài khoản Admin ở một cửa sổ trình duyệt để tải tài liệu, xuất bản công khai và
                            theo dõi Phiếu CSKH; sau đó mở đường dẫn này ở cửa sổ Ẩn danh (Ctrl + Shift + N) để đóng vai khách hàng cuối.
                        </Typography>
                    </Stack>
                </Card>
            </Box>
        )
    }

    return (
        <Box
            sx={{
                minHeight: '100vh',
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.default : '#f4f6f9'
            }}
        >
            {/* Header tối giản dành riêng cho Khách hàng cuối */}
            <Paper
                elevation={0}
                square
                sx={{
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    px: { xs: 2, md: 3 },
                    py: 1.5,
                    bgcolor: theme.palette.background.paper
                }}
            >
                <Container maxWidth='md' disableGutters>
                    <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={1.5} flexWrap='wrap' useFlexGap>
                        <Box>
                            <Stack direction='row' alignItems='center' spacing={1}>
                                <Typography variant='h4' sx={{ fontWeight: 700 }}>
                                    {chatflow.name}
                                </Typography>
                                <Chip size='small' color='success' variant='outlined' label='Trực tuyến' sx={{ height: 22 }} />
                                <Chip size='small' variant='outlined' label='Cổng Khách Hàng' sx={{ height: 22 }} />
                            </Stack>
                            <Typography variant='caption' color='textSecondary'>
                                Hỗ trợ tra cứu nghiệp vụ, điều hướng ứng dụng và tiếp nhận yêu cầu hỗ trợ tự động
                            </Typography>
                        </Box>

                        <Stack direction='row' spacing={1} alignItems='center'>
                            <Button
                                size='small'
                                variant={showCustomerForm || customerName || customerContact ? 'contained' : 'outlined'}
                                startIcon={<IconUser size={16} />}
                                onClick={() => setShowCustomerForm((prev) => !prev)}
                                sx={{ textTransform: 'none' }}
                            >
                                {customerName ? customerName : 'Thông tin khách hàng'}
                            </Button>
                            <Tooltip title='Bắt đầu cuộc hội thoại mới'>
                                <Button
                                    size='small'
                                    variant='outlined'
                                    startIcon={<IconRefresh size={16} />}
                                    onClick={handleNewConversation}
                                    disabled={isSending}
                                    sx={{ textTransform: 'none' }}
                                >
                                    Hội thoại mới
                                </Button>
                            </Tooltip>
                        </Stack>
                    </Stack>

                    <Collapse in={showCustomerForm}>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={1.5}
                            sx={{ mt: 1.5, pt: 1.5, borderTop: `1px dashed ${theme.palette.divider}` }}
                        >
                            <TextField
                                size='small'
                                fullWidth
                                label='Họ tên khách hàng (tùy chọn)'
                                placeholder='Ví dụ: Nguyễn Văn An'
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                            />
                            <TextField
                                size='small'
                                fullWidth
                                label='Email / SĐT / Mã tài khoản (tùy chọn)'
                                placeholder='Ví dụ: an.nguyen@congty.vn'
                                value={customerContact}
                                onChange={(e) => setCustomerContact(e.target.value)}
                            />
                        </Stack>
                    </Collapse>
                </Container>
            </Paper>

            {/* Khu vực hội thoại chính */}
            <Container
                maxWidth='md'
                sx={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    py: 2,
                    px: { xs: 1.5, md: 2 }
                }}
            >
                <Card
                    variant='outlined'
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 2.5,
                        overflow: 'hidden',
                        bgcolor: theme.palette.background.paper
                    }}
                >
                    {sendError && (
                        <Alert severity='error' onClose={() => setSendError('')} sx={{ borderRadius: 0 }}>
                            {sendError}
                        </Alert>
                    )}

                    <Box
                        sx={{
                            flex: 1,
                            overflowY: 'auto',
                            p: { xs: 2, md: 3 },
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2
                        }}
                    >
                        {messages.length === 0 && (
                            <Box sx={{ my: 'auto', textAlign: 'center', maxWidth: 560, mx: 'auto' }}>
                                <Typography variant='h3' sx={{ fontWeight: 700, mb: 1 }}>
                                    Xin chào, tôi có thể hỗ trợ gì cho bạn?
                                </Typography>
                                <Typography variant='body2' color='textSecondary' sx={{ mb: 2.5 }}>
                                    Bạn có thể đặt câu hỏi hướng dẫn sử dụng dịch vụ, tìm đúng đường dẫn chức năng hoặc gửi yêu cầu hỗ trợ
                                    kỹ thuật.
                                </Typography>
                                <Stack spacing={1}>
                                    {QUICK_STARTERS.map((text, idx) => (
                                        <Button
                                            key={idx}
                                            variant='outlined'
                                            color='inherit'
                                            onClick={() => handleSend(text)}
                                            disabled={isSending}
                                            sx={{
                                                justifyContent: 'flex-start',
                                                textAlign: 'left',
                                                textTransform: 'none',
                                                borderColor: theme.palette.divider,
                                                py: 1,
                                                px: 1.75
                                            }}
                                        >
                                            {text}
                                        </Button>
                                    ))}
                                </Stack>
                            </Box>
                        )}

                        {messages.map((msg) => {
                            const isUser = msg.role === 'user'
                            return (
                                <Box
                                    key={msg.id}
                                    sx={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: isUser ? 'flex-end' : 'flex-start'
                                    }}
                                >
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            p: 1.75,
                                            maxWidth: '88%',
                                            borderRadius: 2,
                                            bgcolor: isUser
                                                ? theme.palette.primary.main
                                                : theme.palette.mode === 'dark'
                                                ? 'rgba(255,255,255,0.05)'
                                                : '#f5f7fa',
                                            color: isUser ? '#ffffff' : theme.palette.text.primary
                                        }}
                                    >
                                        {isUser ? (
                                            <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                {msg.content}
                                            </Typography>
                                        ) : (
                                            <MemoizedReactMarkdown>{msg.content}</MemoizedReactMarkdown>
                                        )}
                                    </Paper>

                                    {!isUser && Array.isArray(msg.sourceDocuments) && msg.sourceDocuments.length > 0 && (
                                        <Box sx={{ mt: 0.75, maxWidth: '88%', width: '100%' }}>
                                            <Button
                                                size='small'
                                                variant='text'
                                                startIcon={<IconFileText size={14} />}
                                                endIcon={
                                                    expandedCitations[msg.id] ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
                                                }
                                                onClick={() => setExpandedCitations((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                                sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
                                            >
                                                Nguồn tài liệu tham khảo ({msg.sourceDocuments.length})
                                            </Button>
                                            {expandedCitations[msg.id] && (
                                                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                                                    {msg.sourceDocuments.map((doc, dIdx) => (
                                                        <Paper key={dIdx} variant='outlined' sx={{ p: 1.25, borderRadius: 1.5 }}>
                                                            <Typography
                                                                variant='caption'
                                                                sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}
                                                            >
                                                                {doc.title}
                                                            </Typography>
                                                            <Typography
                                                                variant='caption'
                                                                color='textSecondary'
                                                                sx={{ display: 'block', whiteSpace: 'pre-wrap' }}
                                                            >
                                                                {doc.pageContent}
                                                            </Typography>
                                                        </Paper>
                                                    ))}
                                                </Stack>
                                            )}
                                        </Box>
                                    )}

                                    <Typography variant='caption' color='textSecondary' sx={{ mt: 0.25, px: 0.5, fontSize: '0.7rem' }}>
                                        {msg.timestamp}
                                    </Typography>
                                </Box>
                            )
                        })}

                        {isSending && (
                            <Stack direction='row' spacing={1.25} alignItems='center'>
                                <CircularProgress size={16} />
                                <Typography variant='body2' color='textSecondary'>
                                    Đang tra cứu và phản hồi...
                                </Typography>
                            </Stack>
                        )}
                        <div ref={messagesEndRef} />
                    </Box>

                    <Divider />

                    <Box
                        component='form'
                        onSubmit={(e) => {
                            e.preventDefault()
                            handleSend()
                        }}
                        sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, bgcolor: theme.palette.background.paper }}
                    >
                        <TextField
                            fullWidth
                            size='small'
                            multiline
                            maxRows={4}
                            placeholder='Nhập câu hỏi hoặc vấn đề cần hỗ trợ... (Enter để gửi, Shift+Enter xuống dòng)'
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.nativeEvent?.isComposing) return
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            disabled={isSending}
                        />
                        <IconButton color='primary' type='submit' disabled={!input.trim() || isSending}>
                            <IconSend size={20} />
                        </IconButton>
                    </Box>
                </Card>
            </Container>
        </Box>
    )
}

export default SupportPortal
