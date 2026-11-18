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
    Tooltip,
    Button,
    Chip,
    Alert,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    TextField
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconSend, IconRobot, IconUser, IconPlus, IconBulb, IconMessages, IconPaperclip, IconCheck } from '@tabler/icons-react'
import { MemoizedReactMarkdown } from '@/ui-component/markdown/MemoizedReactMarkdown'
import moment from 'moment'

// 3 Kịch bản mẫu khởi đầu theo Task B-002
const STARTER_SCENARIOS = [
    {
        title: 'Hướng dẫn sử dụng phần mềm theo tài liệu',
        prompt: 'Tạo trợ lý hướng dẫn phần mềm theo tài liệu tôi đính kèm. Hiểu câu hỏi, tìm nội dung liên quan, kiểm tra có bằng chứng rồi hướng dẫn từng bước và dẫn nguồn; nếu thiếu thì hỏi rõ, không bịa chức năng.'
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

const ChatPane = ({ messages = [], documents = [], isSending = false, canConfirmBuild = false, onSendMessage, onNewSession }) => {
    const theme = useTheme()
    const [inputValue, setInputValue] = useState('')
    const messagesEndRef = useRef(null)
    const [files, setFiles] = useState([])
    const [fileError, setFileError] = useState('')
    const [retrievalMode, setRetrievalMode] = useState('lexical')
    const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small')
    const chooseFiles = (picked) => {
        const next = [...files, ...Array.from(picked || [])]
        if (next.length > 5 || next.some((file) => file.size > 5 * 1024 * 1024 || !/\.(pdf|docx|txt|md|csv)$/i.test(file.name))) {
            setFileError('Chọn tối đa 5 file PDF/DOCX/TXT/MD/CSV, mỗi file tối đa 5 MB.')
            return
        }
        setFileError('')
        setFiles(next)
    }

    const scrollToBottom = (behavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior })
    }

    useEffect(() => {
        scrollToBottom('smooth')
    }, [messages, isSending])

    const handleSend = async () => {
        const trimmed = inputValue.trim()
        if ((!trimmed && !files.length) || isSending) return
        const sent = await onSendMessage(trimmed, files, { retrievalMode, embeddingModel })
        if (sent !== false) {
            setInputValue('')
            setFiles([])
        }
    }

    const handleKeyDown = (e) => {
        if (e.nativeEvent?.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleSelectScenario = async (prompt) => {
        if (isSending) return
        if ((await onSendMessage(prompt, files, { retrievalMode, embeddingModel })) !== false) {
            setInputValue('')
            setFiles([])
        }
    }

    return (
        <Card
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault()
                if (!isSending) chooseFiles(event.dataTransfer.files)
            }}
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
                        <IconButton
                            disabled={isSending}
                            size='small'
                            color='primary'
                            onClick={() => {
                                setFiles([])
                                setInputValue('')
                                onNewSession()
                            }}
                        >
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
                        <Typography variant='body1' color='textSecondary' sx={{ maxWidth: 520, mx: 'auto', mb: 2 }}>
                            Hãy mô tả trợ lý bạn muốn xây dựng bằng tiếng Việt tự nhiên. Hệ thống sẽ cùng bạn trao đổi nhiều lượt để tổng
                            hợp mục tiêu, hướng dẫn và luồng xử lý.
                        </Typography>
                        <Alert severity='info' sx={{ maxWidth: 600, mx: 'auto', mb: 3, textAlign: 'left', borderRadius: 2 }}>
                            <strong>Cách chốt yêu cầu:</strong> Bạn và Bot cứ trả lời qua lại cho đến khi bạn đưa ra hết yêu cầu. Khi đã
                            xong, chỉ cần nhắn <strong>&quot;xong&quot;</strong> (hoặc bấm nút <strong>Xong — Tạo Agent</strong>), lúc đó hệ
                            thống mới tự động build Agent!
                        </Alert>

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
                                                    : theme.palette.text.primary
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
                                    {files.length
                                        ? 'Đang đọc tài liệu, chia đoạn và lập kế hoạch…'
                                        : 'Đang phân tích yêu cầu và thiết kế luồng…'}
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
                {!!documents.length && (
                    <Stack spacing={0.5} sx={{ mb: 1 }}>
                        <Typography variant='caption'>Tài liệu đã gắn với Agent</Typography>
                        {documents.map((doc) => (
                            <Chip
                                key={doc.id}
                                size='small'
                                variant='outlined'
                                label={`${doc.name} · ${doc.config?.chunkCount || '?'} đoạn · ${
                                    doc.config?.retrievalMode === 'vector'
                                        ? 'embedding'
                                        : doc.config?.uploaded
                                        ? 'từ khóa'
                                        : 'Document Store'
                                }`}
                            />
                        ))}
                    </Stack>
                )}
                <Button size='small' component='label' startIcon={<IconPaperclip size={18} />} disabled={isSending} sx={{ mb: 1 }}>
                    Đính kèm tài liệu
                    <input
                        disabled={isSending}
                        name='documents'
                        aria-label='Đính kèm tài liệu'
                        type='file'
                        hidden
                        multiple
                        accept='.pdf,.docx,.txt,.md,.csv'
                        onChange={(event) => {
                            chooseFiles(event.target.files)
                            event.target.value = ''
                        }}
                    />
                </Button>
                {fileError && (
                    <Alert severity='error' sx={{ mb: 1 }}>
                        {fileError}
                    </Alert>
                )}
                {!!files.length && (
                    <Stack spacing={1} sx={{ mb: 1 }}>
                        {files.map((file, index) => (
                            <Chip
                                key={`${file.name}-${index}`}
                                label={`${file.name} · ${Math.ceil(file.size / 1024)} KB`}
                                disabled={isSending}
                                onDelete={() => setFiles(files.filter((_, i) => i !== index))}
                            />
                        ))}
                        <FormControl size='small'>
                            <InputLabel id='retrieval-mode-label'>Cách tìm trong tài liệu</InputLabel>
                            <Select
                                labelId='retrieval-mode-label'
                                label='Cách tìm trong tài liệu'
                                value={retrievalMode}
                                disabled={isSending}
                                onChange={(event) => setRetrievalMode(event.target.value)}
                            >
                                <MenuItem value='lexical'>Theo từ khóa — không gọi embedding</MenuItem>
                                <MenuItem value='vector'>Theo ngữ nghĩa — embedding của provider</MenuItem>
                            </Select>
                        </FormControl>
                        {retrievalMode === 'vector' && (
                            <>
                                <TextField
                                    size='small'
                                    label='Model embedding'
                                    value={embeddingModel}
                                    disabled={isSending}
                                    onChange={(event) => setEmbeddingModel(event.target.value)}
                                />
                                <Alert severity='info'>
                                    Dùng key/Base URL đã lưu để tạo và truy vấn embedding. Provider phải hỗ trợ model này và có thể tính
                                    phí.
                                </Alert>
                            </>
                        )}
                    </Stack>
                )}
                {canConfirmBuild && !isSending && (
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        alignItems={{ xs: 'stretch', sm: 'center' }}
                        justifyContent='space-between'
                        spacing={1}
                        sx={{
                            mb: 1.25,
                            px: 1.5,
                            py: 1,
                            borderRadius: 1.5,
                            border: `1px solid ${theme.palette.success.main}`,
                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(76,175,80,0.12)' : 'rgba(76,175,80,0.08)'
                        }}
                    >
                        <Typography variant='body2'>Đã đủ thông tin thiết kế. Bạn có thể nhắn thêm yêu cầu hoặc chốt tạo Agent:</Typography>
                        <Button
                            size='small'
                            variant='contained'
                            color='success'
                            startIcon={<IconCheck size={16} />}
                            onClick={() => onSendMessage('xong', [], { retrievalMode, embeddingModel })}
                            sx={{ fontWeight: 600, flexShrink: 0 }}
                        >
                            Xong — Tạo Agent
                        </Button>
                    </Stack>
                )}
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
                                    <IconButton
                                        aria-label='Gửi yêu cầu'
                                        color='primary'
                                        onClick={handleSend}
                                        disabled={(!inputValue.trim() && !files.length) || isSending}
                                        edge='end'
                                    >
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
    documents: PropTypes.array,
    isSending: PropTypes.bool,
    canConfirmBuild: PropTypes.bool,
    onSendMessage: PropTypes.func.isRequired,
    onNewSession: PropTypes.func.isRequired
}

export default ChatPane
