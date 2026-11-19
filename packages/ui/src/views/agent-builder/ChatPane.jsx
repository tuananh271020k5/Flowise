import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    Card,
    CardContent,
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

const ChatPane = ({
    messages = [],
    documents = [],
    suggestions = [],
    isSending = false,
    canConfirmBuild = false,
    onSendMessage,
    onNewSession
}) => {
    const theme = useTheme()
    const [inputValue, setInputValue] = useState('')
    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const [files, setFiles] = useState([])
    const [fileError, setFileError] = useState('')
    const [retrievalMode, setRetrievalMode] = useState('lexical')
    const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small')
    const [showSuggestions, setShowSuggestions] = useState(false)
    const chooseFiles = (picked) => {
        const incoming = Array.from(picked || [])
        if (!incoming.length) return
        const next = [...files, ...incoming]
        if (next.length > 20) {
            setFileError(`Bạn vừa chọn ${next.length} tệp — mỗi lần tải tối đa 20 tệp (mỗi phiên hỗ trợ đến 30 tệp).`)
            return
        }
        const unsupported = next.find((file) => !/\.(pdf|docx|xlsx|txt|md|csv|json)$/i.test(file.name))
        if (unsupported) {
            setFileError(`Tệp "${unsupported.name}" chưa được hỗ trợ (hỗ trợ PDF, DOCX, XLSX, TXT, MD, CSV, JSON).`)
            return
        }
        const oversized = next.find((file) => file.size > 25 * 1024 * 1024)
        if (oversized) {
            setFileError(`Tệp "${oversized.name}" (${(oversized.size / (1024 * 1024)).toFixed(1)} MB) vượt giới hạn 25 MB mỗi tệp.`)
            return
        }
        const emptyFile = next.find((file) => file.size === 0)
        if (emptyFile) {
            setFileError(`Tệp "${emptyFile.name}" đang trống (0 byte).`)
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
            variant='outlined'
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault()
                if (!isSending) chooseFiles(event.dataTransfer.files)
            }}
            sx={{
                height: '100%',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2.5,
                overflow: 'hidden',
                borderColor: theme.palette.divider,
                background: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff'
            }}
        >
            {/* Header gọn, cùng chiều cao 46px khớp thẳng hàng với Tabs cột phải */}
            <Box
                sx={{
                    minHeight: 46,
                    px: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc'
                }}
            >
                <Stack direction='row' alignItems='center' spacing={1}>
                    <IconMessages size={18} color={theme.palette.primary.main} />
                    <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
                        Hội thoại Thiết kế Trợ lý
                    </Typography>
                </Stack>
                <Tooltip title='Tạo phiên làm việc mới'>
                    <Button
                        disabled={isSending}
                        size='small'
                        variant='text'
                        color='primary'
                        startIcon={<IconPlus size={16} />}
                        onClick={() => {
                            setFiles([])
                            setInputValue('')
                            setFileError('')
                            onNewSession()
                        }}
                        sx={{ textTransform: 'none', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                        Phiên mới
                    </Button>
                </Tooltip>
            </Box>

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

            {/* Khu vực nhập liệu hiện đại, tối ưu chiều cao cho khung hội thoại */}
            <Box
                sx={{
                    px: 2,
                    py: 1.5,
                    borderTop: `1px solid ${theme.palette.divider}`,
                    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc'
                }}
            >
                {!!documents.length && (
                    <Stack direction='row' spacing={0.5} alignItems='center' flexWrap='wrap' useFlexGap sx={{ mb: 1 }}>
                        <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, mr: 0.5 }}>
                            Nguồn đã nạp ({documents.length}):
                        </Typography>
                        {documents.map((doc) => (
                            <Chip
                                key={doc.id}
                                size='small'
                                variant='outlined'
                                label={`${doc.name} · ${doc.config?.chunkCount || '?'} đoạn`}
                                sx={{ height: 22, fontSize: '0.72rem' }}
                            />
                        ))}
                    </Stack>
                )}

                {fileError && (
                    <Alert severity='error' onClose={() => setFileError('')} sx={{ mb: 1, py: 0.25, borderRadius: 1.5 }}>
                        {fileError}
                    </Alert>
                )}

                {!!files.length && (
                    <Stack spacing={1} sx={{ mb: 1.25 }}>
                        <Stack direction='row' spacing={0.75} flexWrap='wrap' useFlexGap>
                            {files.map((file, index) => (
                                <Chip
                                    key={`${file.name}-${index}`}
                                    size='small'
                                    color='primary'
                                    variant='outlined'
                                    label={`${file.name} · ${
                                        file.size >= 1024 * 1024
                                            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                                            : `${Math.max(1, Math.ceil(file.size / 1024))} KB`
                                    }`}
                                    disabled={isSending}
                                    onDelete={() => setFiles(files.filter((_, i) => i !== index))}
                                />
                            ))}
                        </Stack>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <FormControl size='small' sx={{ minWidth: 230 }}>
                                <InputLabel id='retrieval-mode-label'>Cách tìm trong tài liệu</InputLabel>
                                <Select
                                    labelId='retrieval-mode-label'
                                    label='Cách tìm trong tài liệu'
                                    value={retrievalMode}
                                    disabled={isSending}
                                    onChange={(event) => setRetrievalMode(event.target.value)}
                                >
                                    <MenuItem value='lexical'>Theo từ khóa (nhanh, không tốn phí embedding)</MenuItem>
                                    <MenuItem value='vector'>Theo ngữ nghĩa (dùng model embedding)</MenuItem>
                                </Select>
                            </FormControl>
                            {retrievalMode === 'vector' && (
                                <TextField
                                    size='small'
                                    fullWidth
                                    label='Model embedding'
                                    value={embeddingModel}
                                    disabled={isSending}
                                    onChange={(event) => setEmbeddingModel(event.target.value)}
                                />
                            )}
                        </Stack>
                    </Stack>
                )}

                {Array.isArray(suggestions) && suggestions.length > 0 && !isSending && (
                    <Box sx={{ mb: 1 }}>
                        <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: showSuggestions ? 0.75 : 0 }}>
                            <Button
                                size='small'
                                variant='text'
                                color='inherit'
                                startIcon={<IconBulb size={14} color={theme.palette.warning.main} />}
                                onClick={() => setShowSuggestions((prev) => !prev)}
                                sx={{
                                    textTransform: 'none',
                                    fontSize: '0.75rem',
                                    color: 'text.secondary',
                                    px: 0.5,
                                    py: 0.2,
                                    minWidth: 0
                                }}
                            >
                                {showSuggestions
                                    ? 'Thu gọn gợi ý tinh chỉnh'
                                    : `Xem ${Math.min(3, suggestions.length)} gợi ý tinh chỉnh nhanh`}
                            </Button>
                            {!showSuggestions && (
                                <Stack direction='row' spacing={0.5} sx={{ overflow: 'hidden', maxWidth: '62%' }}>
                                    {suggestions.slice(0, 2).map((item, idx) => (
                                        <Tooltip key={idx} title={item}>
                                            <Chip
                                                size='small'
                                                variant='outlined'
                                                clickable
                                                label={item}
                                                onClick={() => {
                                                    setInputValue(item)
                                                    setTimeout(() => inputRef.current?.focus(), 0)
                                                }}
                                                sx={{
                                                    height: 24,
                                                    maxWidth: 190,
                                                    fontSize: '0.72rem',
                                                    borderColor: 'divider',
                                                    bgcolor: theme.palette.background.paper
                                                }}
                                            />
                                        </Tooltip>
                                    ))}
                                </Stack>
                            )}
                        </Stack>
                        {showSuggestions && (
                            <Stack spacing={0.5}>
                                {suggestions.slice(0, 3).map((item, idx) => (
                                    <ButtonBase
                                        key={idx}
                                        onClick={() => {
                                            setInputValue(item)
                                            setTimeout(() => inputRef.current?.focus(), 0)
                                        }}
                                        sx={{
                                            px: 1.25,
                                            py: 0.65,
                                            borderRadius: 1.5,
                                            border: `1px solid ${theme.palette.divider}`,
                                            bgcolor: theme.palette.background.paper,
                                            textAlign: 'left',
                                            justifyContent: 'flex-start',
                                            fontSize: '0.78rem',
                                            color: 'text.primary',
                                            '&:hover': { borderColor: theme.palette.primary.main }
                                        }}
                                    >
                                        {item}
                                    </ButtonBase>
                                ))}
                            </Stack>
                        )}
                    </Box>
                )}

                {canConfirmBuild && !isSending && (
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        alignItems={{ xs: 'stretch', sm: 'center' }}
                        justifyContent='space-between'
                        spacing={1}
                        sx={{
                            mb: 1,
                            px: 1.5,
                            py: 0.75,
                            borderRadius: 1.5,
                            border: `1px solid ${theme.palette.success.main}`,
                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(76,175,80,0.12)' : 'rgba(76,175,80,0.08)'
                        }}
                    >
                        <Typography variant='caption' sx={{ fontWeight: 500 }}>
                            Đã đủ thông tin thiết kế. Tiếp tục bổ sung hoặc chốt tạo Agent ngay:
                        </Typography>
                        <Button
                            size='small'
                            variant='contained'
                            color='success'
                            startIcon={<IconCheck size={15} />}
                            onClick={() => onSendMessage('xong', [], { retrievalMode, embeddingModel })}
                            sx={{ fontWeight: 600, flexShrink: 0, textTransform: 'none', py: 0.35 }}
                        >
                            Xong — Tạo Agent
                        </Button>
                    </Stack>
                )}

                <OutlinedInput
                    inputRef={inputRef}
                    fullWidth
                    multiline
                    minRows={1}
                    maxRows={4}
                    placeholder='Mô tả trợ lý hoặc thả tệp tài liệu vào đây... (Enter để gửi, Shift+Enter xuống dòng)'
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                    startAdornment={
                        <InputAdornment position='start'>
                            <Tooltip title='Đính kèm tài liệu nguồn (PDF, DOCX, XLSX, TXT, MD, CSV, JSON — tối đa 20 tệp, 25 MB/tệp)'>
                                <span>
                                    <IconButton
                                        component='label'
                                        size='small'
                                        color={files.length ? 'primary' : 'default'}
                                        disabled={isSending}
                                    >
                                        <IconPaperclip size={19} />
                                        <input
                                            disabled={isSending}
                                            name='documents'
                                            aria-label='Đính kèm tài liệu'
                                            type='file'
                                            hidden
                                            multiple
                                            accept='.pdf,.docx,.xlsx,.txt,.md,.csv,.json'
                                            onChange={(event) => {
                                                chooseFiles(event.target.files)
                                                event.target.value = ''
                                            }}
                                        />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </InputAdornment>
                    }
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
    suggestions: PropTypes.array,
    isSending: PropTypes.bool,
    canConfirmBuild: PropTypes.bool,
    onSendMessage: PropTypes.func.isRequired,
    onNewSession: PropTypes.func.isRequired
}

export default ChatPane
