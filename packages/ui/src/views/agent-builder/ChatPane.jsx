import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    Card,
    CardContent,
    CardHeader,
    Divider,
    IconButton,
    InputAdornment,
    OutlinedInput,
    Stack,
    Typography,
    Avatar,
    ButtonBase,
    CircularProgress,
    Tooltip
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconSend, IconRobot, IconUser, IconPlus, IconBulb, IconMessages } from '@tabler/icons-react'
import { MemoizedReactMarkdown } from '@/ui-component/markdown/MemoizedReactMarkdown'
import moment from 'moment'

// 3 Kịch bản mẫu khởi đầu theo Task B-002
const STARTER_SCENARIOS = [
    {
        title: 'Trợ lý CSKH & FAQ Bán hàng',
        prompt: 'Tôi muốn tạo một trợ lý trả lời thắc mắc sản phẩm, tư vấn chính sách bảo hành và đổi trả cho cửa hàng phụ kiện điện thoại.'
    },
    {
        title: 'Phân loại Vé Hỗ trợ Kỹ thuật',
        prompt: 'Tạo agent tự động đọc nội dung ticket khách hàng, phân loại thành 3 mức độ (Khẩn cấp, Trung bình, Thấp) và hướng dẫn bước xử lý sơ bộ.'
    },
    {
        title: 'Tóm tắt Báo cáo & Trích xuất Dữ liệu',
        prompt: 'Tạo agent đọc báo cáo định kỳ dạng văn bản tiếng Việt, trích xuất các chỉ số doanh thu, chi phí và tóm tắt theo gạch đầu dòng ngắn gọn.'
    }
]

const ChatPane = ({ messages = [], isSending = false, onSendMessage, onNewSession }) => {
    const theme = useTheme()
    const [inputValue, setInputValue] = useState('')
    const messagesEndRef = useRef(null)

    const scrollToBottom = (behavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior })
    }

    useEffect(() => {
        scrollToBottom('smooth')
    }, [messages, isSending])

    const handleSend = () => {
        const trimmed = inputValue.trim()
        if (!trimmed || isSending) return
        onSendMessage(trimmed)
        setInputValue('')
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleSelectScenario = (prompt) => {
        if (isSending) return
        onSendMessage(prompt)
    }

    return (
        <Card
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.palette.mode === 'dark' ? '0 2px 14px 0 rgba(0,0,0,0.4)' : '0 2px 14px 0 rgba(32,40,45,0.08)',
                background: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff'
            }}
        >
            {/* Header */}
            <CardHeader
                title={
                    <Stack direction='row' alignItems='center' spacing={1}>
                        <IconMessages size={22} color={theme.palette.primary.main} />
                        <Typography variant='h4' sx={{ fontWeight: 600 }}>
                            Hội thoại Thiết kế Trợ lý
                        </Typography>
                    </Stack>
                }
                action={
                    <Tooltip title='Tạo phiên làm việc mới'>
                        <IconButton size='small' color='primary' onClick={onNewSession}>
                            <IconPlus size={20} />
                        </IconButton>
                    </Tooltip>
                }
                sx={{ pb: 1 }}
            />
            <Divider />

            {/* Nội dung tin nhắn (Scrollable) */}
            <CardContent
                sx={{
                    flex: 1,
                    overflowY: 'auto',
                    p: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2
                }}
            >
                {/* Khi chưa có tin nhắn nào: Banner Onboarding và Kịch bản mẫu */}
                {messages.length === 0 && (
                    <Box sx={{ my: 'auto', textAlign: 'center', px: 2 }}>
                        <Avatar
                            sx={{
                                width: 56,
                                height: 56,
                                mx: 'auto',
                                mb: 2,
                                bgcolor: theme.palette.primary.light,
                                color: theme.palette.primary.main
                            }}
                        >
                            <IconRobot size={32} />
                        </Avatar>
                        <Typography variant='h3' sx={{ fontWeight: 700, mb: 1 }}>
                            Chào mừng đến với Chat-to-Agent Builder
                        </Typography>
                        <Typography variant='body1' color='textSecondary' sx={{ maxWidth: 520, mx: 'auto', mb: 3 }}>
                            Hãy mô tả trợ lý bạn muốn xây dựng bằng tiếng Việt tự nhiên. Hệ thống sẽ tự động tổng hợp mục tiêu, hướng dẫn và
                            cấu hình cho Agentflow V2.
                        </Typography>

                        {/* Gợi ý kịch bản mẫu */}
                        <Typography
                            variant='caption'
                            color='textSecondary'
                            sx={{ textTransform: 'uppercase', fontWeight: 600, display: 'block', mb: 1.5 }}
                        >
                            Hoặc chọn một kịch bản mẫu để bắt đầu ngay:
                        </Typography>
                        <Stack spacing={1.5} sx={{ maxWidth: 600, mx: 'auto' }}>
                            {STARTER_SCENARIOS.map((item, idx) => (
                                <ButtonBase
                                    key={idx}
                                    onClick={() => handleSelectScenario(item.prompt)}
                                    disabled={isSending}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 2,
                                        border: `1px solid ${theme.palette.divider}`,
                                        textAlign: 'left',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 1.5,
                                        transition: 'all 0.2s',
                                        background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                        '&:hover': {
                                            borderColor: theme.palette.primary.main,
                                            background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
                                        }
                                    }}
                                >
                                    <IconBulb size={20} color={theme.palette.warning.main} style={{ marginTop: 2, flexShrink: 0 }} />
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant='subtitle2' sx={{ fontWeight: 600, color: 'textPrimary' }}>
                                            {item.title}
                                        </Typography>
                                        <Typography variant='body2' color='textSecondary'>
                                            {item.prompt}
                                        </Typography>
                                    </Box>
                                </ButtonBase>
                            ))}
                        </Stack>
                    </Box>
                )}

                {/* Danh sách tin nhắn */}
                {messages.map((msg, index) => {
                    const isUser = msg.role === 'user'
                    const dateFormatted = msg.createdAt ? moment(msg.createdAt).format('HH:mm') : ''

                    return (
                        <Box
                            key={msg.id || index}
                            sx={{
                                display: 'flex',
                                justifyContent: isUser ? 'flex-end' : 'flex-start',
                                mb: 1
                            }}
                        >
                            <Stack
                                direction='row'
                                spacing={1.5}
                                alignItems='flex-start'
                                sx={{
                                    maxWidth: '85%',
                                    flexDirection: isUser ? 'row-reverse' : 'row'
                                }}
                            >
                                <Avatar
                                    sx={{
                                        width: 34,
                                        height: 34,
                                        bgcolor: isUser ? theme.palette.primary.main : theme.palette.secondary.main,
                                        color: '#ffffff',
                                        mt: 0.5
                                    }}
                                >
                                    {isUser ? <IconUser size={18} /> : <IconRobot size={18} />}
                                </Avatar>

                                <Box>
                                    <Box
                                        sx={{
                                            p: 1.75,
                                            borderRadius: 2,
                                            bgcolor: isUser
                                                ? theme.palette.mode === 'dark'
                                                    ? theme.palette.primary.dark
                                                    : theme.palette.primary.light
                                                : theme.palette.mode === 'dark'
                                                ? 'rgba(255,255,255,0.06)'
                                                : '#f5f7fa',
                                            color: isUser
                                                ? theme.palette.mode === 'dark'
                                                    ? '#ffffff'
                                                    : theme.palette.primary.contrastText || '#000000'
                                                : 'text.primary',
                                            borderTopRightRadius: isUser ? 4 : 16,
                                            borderTopLeftRadius: !isUser ? 4 : 16,
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                        }}
                                    >
                                        {isUser ? (
                                            <Typography variant='body1' sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                {msg.content}
                                            </Typography>
                                        ) : (
                                            <MemoizedReactMarkdown>{msg.content}</MemoizedReactMarkdown>
                                        )}
                                    </Box>
                                    {dateFormatted && (
                                        <Typography
                                            variant='caption'
                                            color='textSecondary'
                                            sx={{
                                                display: 'block',
                                                mt: 0.25,
                                                textAlign: isUser ? 'right' : 'left',
                                                px: 0.5
                                            }}
                                        >
                                            {dateFormatted}
                                        </Typography>
                                    )}
                                </Box>
                            </Stack>
                        </Box>
                    )
                })}

                {/* Trạng thái đang suy nghĩ / phân tích */}
                {isSending && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1 }}>
                        <Stack direction='row' spacing={1.5} alignItems='center'>
                            <Avatar
                                sx={{
                                    width: 34,
                                    height: 34,
                                    bgcolor: theme.palette.secondary.main,
                                    color: '#ffffff'
                                }}
                            >
                                <IconRobot size={18} />
                            </Avatar>
                            <Box
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f5f7fa',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5
                                }}
                            >
                                <CircularProgress size={16} color='inherit' />
                                <Typography variant='body2' color='textSecondary' sx={{ fontStyle: 'italic' }}>
                                    Trợ lý đang phân tích yêu cầu và cập nhật Spec...
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>
                )}

                <div ref={messagesEndRef} />
            </CardContent>

            <Divider />

            {/* Ô nhập tin nhắn */}
            <Box sx={{ p: 2, background: theme.palette.mode === 'dark' ? theme.palette.background.default : '#fafafa' }}>
                <OutlinedInput
                    fullWidth
                    multiline
                    minRows={1}
                    maxRows={4}
                    placeholder='Mô tả trợ lý bạn muốn xây dựng... (Nhấn Enter để gửi, Shift+Enter xuống dòng)'
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                    endAdornment={
                        <InputAdornment position='end'>
                            <Tooltip title='Gửi tin nhắn (Enter)'>
                                <span>
                                    <IconButton color='primary' onClick={handleSend} disabled={!inputValue.trim() || isSending} edge='end'>
                                        <IconSend size={20} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </InputAdornment>
                    }
                    sx={{
                        borderRadius: 2,
                        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff'
                    }}
                />
            </Box>
        </Card>
    )
}

ChatPane.propTypes = {
    messages: PropTypes.array,
    isSending: PropTypes.bool,
    onSendMessage: PropTypes.func.isRequired,
    onNewSession: PropTypes.func.isRequired
}

export default ChatPane
