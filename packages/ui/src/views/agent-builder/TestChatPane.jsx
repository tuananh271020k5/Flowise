import { useState, useRef, useEffect } from 'react'
import { MemoizedReactMarkdown } from '@/ui-component/markdown/MemoizedReactMarkdown'
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
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Card,
    CardContent,
    FormControlLabel,
    Checkbox
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
    IconSend,
    IconTrash,
    IconExternalLink,
    IconCheck,
    IconAlertCircle,
    IconPlayerStop,
    IconPlayerPlay,
    IconX,
    IconFileText,
    IconChevronDown,
    IconChevronUp,
    IconUpload,
    IconPaperclip,
    IconUser,
    IconCopy
} from '@tabler/icons-react'
import agentBuilderApi from '@/api/agentBuilder'
import chatflowsApi from '@/api/chatflows'
import { validateAssertions, formatTestMessage, extractPredictionText, extractSourceDocuments } from './testChatHelper'

const TestChatPane = ({
    sessionId,
    flowId,
    flowType = 'AGENTFLOW',
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
    const [isRunningSuite, setIsRunningSuite] = useState(false)
    const [suiteReport, setSuiteReport] = useState(null)
    const [isSuiteDialogOpen, setIsSuiteDialogOpen] = useState(false)
    const [expandedCitations, setExpandedCitations] = useState({})
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
    const [isPublishing, setIsPublishing] = useState(false)
    const [isPublished, setIsPublished] = useState(false)
    const [isPublicAgent, setIsPublicAgent] = useState(true)
    const [publishStatusMessage, setPublishStatusMessage] = useState(null)
    const [copiedPortalLink, setCopiedPortalLink] = useState(false)
    const [attachedFiles, setAttachedFiles] = useState([])
    const messagesEndRef = useRef(null)
    const fileInputRef = useRef(null)

    useEffect(() => {
        if (!flowId) {
            setIsPublished(false)
            return
        }
        let active = true
        chatflowsApi
            .getSpecificChatflow(flowId)
            .then((res) => {
                if (!active || !res?.data) return
                const deployed = Boolean(res.data.deployed)
                setIsPublished(deployed)
                if (deployed) setIsPublicAgent(Boolean(res.data.isPublic))
            })
            .catch(() => {})
        return () => {
            active = false
        }
    }, [flowId])

    const portalUrl = flowId ? `${window.location.origin}/support-portal/${flowId}` : ''
    const handleCopyPortalUrl = async () => {
        if (!portalUrl) return
        try {
            await navigator.clipboard.writeText(portalUrl)
            setCopiedPortalLink(true)
            setTimeout(() => setCopiedPortalLink(false), 2000)
        } catch {
            // Fallback ignore
        }
    }

    const chooseOfficeFiles = (picked) => {
        const list = Array.from(picked || [])
        if (!list.length) return
        const next = [...attachedFiles, ...list]
        if (next.length > 5 || next.some((file) => file.size > 10 * 1024 * 1024 || !/\.(xlsx|docx)$/i.test(file.name))) {
            setTestError('Chọn tối đa 5 tệp Excel (.xlsx) hoặc Word (.docx), mỗi tệp tối đa 10 MB.')
            return
        }
        setTestError(null)
        setAttachedFiles(next)
    }

    const handleOpenPublishDialog = () => {
        setIsPublishDialogOpen(true)
        setPublishStatusMessage(null)
    }

    const handleConfirmPublish = async () => {
        if (!sessionId) {
            setTestError('Thiếu sessionId để thực hiện xuất bản.')
            return
        }
        setIsPublishing(true)
        try {
            const res = await agentBuilderApi.publishAgent(sessionId, {
                isPublic: isPublicAgent,
                minPassRate: 0.8
            })
            setIsPublished(true)
            setIsPublishDialogOpen(false)
            setPublishStatusMessage(
                isPublicAgent && portalUrl
                    ? `Xuất bản thành công! Bấm nút "Cổng User" ở góc trên hoặc sao chép link (${portalUrl}) mở bằng cửa sổ Ẩn danh để đóng vai khách hàng cuối.`
                    : res.data?.message || 'Xuất bản thành công!'
            )
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi xuất bản:', err)
            setTestError(err?.response?.data?.message || err?.message || 'Xuất bản thất bại.')
        } finally {
            setIsPublishing(false)
        }
    }

    const handleUnpublish = async () => {
        if (!sessionId) return
        try {
            await agentBuilderApi.unpublishAgent(sessionId)
            setIsPublished(false)
            setPublishStatusMessage('Đã thu hồi xuất bản, trợ lý trở về trạng thái nháp.')
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi thu hồi xuất bản:', err)
            setTestError(err?.response?.data?.message || 'Thu hồi xuất bản thất bại.')
        }
    }

    const toggleCitation = (msgId) => {
        setExpandedCitations((prev) => ({
            ...prev,
            [msgId]: !prev[msgId]
        }))
    }

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [testMessages, isLoading])

    // Xóa hội thoại thử nghiệm (độc lập với hội thoại thiết kế)
    const handleClearChat = () => {
        setTestMessages([])
        setAttachedFiles([])
        setTestError(null)
    }

    // Chạy bộ kiểm thử tự động (PH3-T03: Controlled Test Runner)
    const handleRunTestSuite = async () => {
        if (!sessionId || isRunningSuite) return
        setIsRunningSuite(true)
        setTestError(null)

        try {
            const res = await agentBuilderApi.runTestSuite(sessionId, { maxExamples: 10 })
            setSuiteReport(res.data)
            setIsSuiteDialogOpen(true)
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi chạy bộ kiểm thử tự động:', err)
            setTestError(err?.response?.data?.message || err?.message || 'Không thể chạy bộ kiểm thử tự động.')
        } finally {
            setIsRunningSuite(false)
        }
    }

    // Gửi câu hỏi thử nghiệm tới Agentflow draft (hỗ trợ đính kèm trực tiếp file Excel .xlsx / Word .docx)
    const handleSendTest = async (questionText) => {
        const filesToUpload = questionText ? [] : attachedFiles
        const rawText = (questionText || input).trim()
        if ((!rawText && filesToUpload.length === 0) || isLoading || !flowId) return

        const displayText = rawText || 'Đọc và kiểm tra nội dung các tệp vừa tải lên.'
        setIsLoading(true)
        setTestError(null)

        try {
            let uploadedFiles = []
            if (filesToUpload.length > 0) {
                const uploadRes = await agentBuilderApi.uploadOfficeFiles(filesToUpload)
                uploadedFiles = Array.isArray(uploadRes.data?.files) ? uploadRes.data.files : []
            }

            let promptContent = displayText
            if (uploadedFiles.length > 0) {
                const fileContextLines = uploadedFiles.map((f) =>
                    f.ext === 'xlsx'
                        ? `- File Excel "${f.fileName}" | fileId: "${f.fileId}"${
                              Array.isArray(f.sheetNames) && f.sheetNames.length ? ` | sheets: ${f.sheetNames.join(', ')}` : ''
                          } (gọi excel_read_workbook hoặc excel_append_rows với đúng fileId này)`
                        : `- File Word "${f.fileName}" | fileId: "${f.fileId}" (gọi word_read_document hoặc word_append_section với đúng fileId này)`
                )
                promptContent =
                    `[Tệp văn phòng người dùng vừa tải lên kho Workspace — dùng đúng fileId bên dưới với công cụ Excel/Word:]\n` +
                    `${fileContextLines.join('\n')}\n\n` +
                    `Yêu cầu của người dùng:\n${displayText}`
            }

            const userMsg = formatTestMessage('user', displayText, {
                promptContent,
                attachedFiles: uploadedFiles.map((f) => ({
                    fileId: f.fileId,
                    fileName: f.fileName,
                    ext: f.ext,
                    downloadUrl: f.downloadUrl
                }))
            })
            const history = testMessages.map((m) => ({
                role: m.role === 'user' ? 'userMessage' : 'apiMessage',
                content: m.promptContent || m.content
            }))

            setTestMessages((prev) => [...prev, userMsg])
            if (!questionText) {
                setInput('')
                setAttachedFiles([])
            }

            const res = await agentBuilderApi.testPrediction(flowId, {
                question: promptContent,
                history
            })

            const replyContent = extractPredictionText(res.data)
            const sourceDocuments = extractSourceDocuments(res.data)

            // Kiểm tra các assertions từ evaluationExamples nếu câu hỏi này khớp
            const matchedExample = evaluationExamples.find((ex) => ex.input && ex.input.trim().toLowerCase() === displayText.toLowerCase())
            let assertionResult = null
            if (matchedExample?.assertions?.length) {
                assertionResult = validateAssertions(replyContent, matchedExample.assertions)
            }

            const botMsg = formatTestMessage('assistant', replyContent, { assertionResult, sourceDocuments })
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
                elevation={0}
                sx={{
                    p: 4,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    backgroundColor: 'transparent'
                }}
            >
                <Typography variant='h4' gutterBottom color='textSecondary'>
                    Chưa Có Bản Chạy Thử
                </Typography>
                <Typography variant='body2' color='textSecondary' sx={{ maxWidth: 360, mb: 2 }}>
                    Trao đổi yêu cầu ở khung chat bên trái rồi nhắn <strong>&quot;xong&quot;</strong> (hoặc bấm nút{' '}
                    <strong>Biên dịch &amp; Tạo Agent</strong> ở tab Cấu hình) để tạo và chạy thử trợ lý tại đây.
                </Typography>
            </Paper>
        )
    }

    // 4. Giao diện Chat Thử Nghiệm với Agent Draft
    return (
        <Box
            sx={{
                height: '100%',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
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
                    <Typography variant='subtitle1' fontWeight={600} noWrap sx={{ maxWidth: 180 }}>
                        {flowName || 'Agent Draft'}
                    </Typography>
                    <Chip label={`Rev #${revisionNo || 1}`} size='small' color='primary' variant='outlined' />
                    {isPublished ? (
                        <Chip
                            label='Đã triển khai'
                            size='small'
                            color='success'
                            sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }}
                        />
                    ) : (
                        <Chip label='Draft' size='small' color='secondary' sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                </Box>
                <Stack direction='row' spacing={1} alignItems='center'>
                    {sessionId && !isPublished && (
                        <Button
                            size='small'
                            variant='contained'
                            color='success'
                            startIcon={<IconUpload size={16} />}
                            onClick={handleOpenPublishDialog}
                            sx={{ fontSize: '0.75rem', textTransform: 'none', px: 1.5, py: 0.5 }}
                        >
                            Xuất Bản
                        </Button>
                    )}
                    {sessionId && isPublished && (
                        <>
                            {isPublicAgent && (
                                <Tooltip title='Mở giao diện Cổng Khách Hàng (có thể mở ở cửa sổ Ẩn danh để test vai trò User)'>
                                    <Button
                                        size='small'
                                        variant='contained'
                                        color='primary'
                                        startIcon={<IconUser size={15} />}
                                        onClick={() => window.open(`/support-portal/${flowId}`, '_blank', 'noopener,noreferrer')}
                                        sx={{ fontSize: '0.73rem', textTransform: 'none', px: 1.25, py: 0.5 }}
                                    >
                                        Cổng User
                                    </Button>
                                </Tooltip>
                            )}
                            {isPublicAgent && (
                                <Tooltip title={copiedPortalLink ? 'Đã sao chép đường dẫn!' : 'Sao chép link mở ở cửa sổ Ẩn danh'}>
                                    <IconButton size='small' color={copiedPortalLink ? 'success' : 'default'} onClick={handleCopyPortalUrl}>
                                        {copiedPortalLink ? <IconCheck size={17} /> : <IconCopy size={17} />}
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Button
                                size='small'
                                variant='outlined'
                                color='warning'
                                onClick={handleUnpublish}
                                sx={{ fontSize: '0.75rem', textTransform: 'none', px: 1.5, py: 0.5 }}
                            >
                                Thu hồi
                            </Button>
                        </>
                    )}
                    <Tooltip title='Xóa lịch sử chat thử'>
                        <IconButton size='small' onClick={handleClearChat} disabled={testMessages.length === 0}>
                            <IconTrash size={18} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={flowType === 'MULTIAGENT' ? 'Mở trên Flowise V1 Canvas (Đầy đủ Node)' : 'Mở trên Flowise V2 Canvas'}>
                        <IconButton
                            size='small'
                            color='primary'
                            onClick={() =>
                                window.open(
                                    flowType === 'MULTIAGENT' ? `/agentcanvas/${flowId}` : `/v2/agentcanvas/${flowId}`,
                                    '_blank',
                                    'noopener,noreferrer'
                                )
                            }
                        >
                            <IconExternalLink size={18} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {/* Thông báo xuất bản thành công nếu có */}
            {publishStatusMessage && (
                <Alert severity='success' onClose={() => setPublishStatusMessage(null)} sx={{ borderRadius: 0 }}>
                    {publishStatusMessage}
                </Alert>
            )}

            {/* Thông báo lỗi nếu có */}
            {testError && (
                <Alert severity='error' onClose={() => setTestError(null)} sx={{ borderRadius: 0 }}>
                    {testError}
                </Alert>
            )}

            {/* Danh sách tin nhắn test */}
            <Box
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault()
                    if (!isLoading && !isRunningSuite) chooseOfficeFiles(e.dataTransfer.files)
                }}
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
                        <Typography variant='caption'>
                            Gõ câu hỏi hoặc đính kèm tệp Excel (.xlsx) / Word (.docx) bên dưới để tương tác với Agent draft.
                        </Typography>
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
                            {msg.role === 'user' ? (
                                <Box>
                                    {Array.isArray(msg.attachedFiles) && msg.attachedFiles.length > 0 && (
                                        <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap sx={{ mb: 0.75 }}>
                                            {msg.attachedFiles.map((f) => (
                                                <Chip
                                                    key={f.fileId}
                                                    size='small'
                                                    icon={<IconFileText size={13} color='#fff' />}
                                                    label={f.fileName}
                                                    sx={{
                                                        height: 22,
                                                        fontSize: '0.7rem',
                                                        color: '#fff',
                                                        borderColor: 'rgba(255,255,255,0.55)',
                                                        backgroundColor: 'rgba(255,255,255,0.16)'
                                                    }}
                                                    variant='outlined'
                                                />
                                            ))}
                                        </Stack>
                                    )}
                                    <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {msg.content}
                                    </Typography>
                                </Box>
                            ) : (
                                <MemoizedReactMarkdown>{msg.content}</MemoizedReactMarkdown>
                            )}
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

                        {/* Nguồn trích dẫn (PH4-T06 RAG Citations) */}
                        {msg.sourceDocuments && msg.sourceDocuments.length > 0 && (
                            <Box sx={{ mt: 0.75, width: '100%', maxWidth: '85%' }}>
                                <Button
                                    size='small'
                                    variant='text'
                                    color='primary'
                                    onClick={() => toggleCitation(msg.id)}
                                    startIcon={<IconFileText size={14} />}
                                    endIcon={expandedCitations[msg.id] ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                                    sx={{ fontSize: '0.72rem', py: 0.25, px: 0.75, textTransform: 'none' }}
                                >
                                    Nguồn trích dẫn ({msg.sourceDocuments.length})
                                </Button>

                                {expandedCitations[msg.id] && (
                                    <Stack spacing={1} sx={{ mt: 0.5 }}>
                                        {msg.sourceDocuments.map((doc, docIdx) => (
                                            <Paper
                                                key={docIdx}
                                                variant='outlined'
                                                sx={{
                                                    p: 1.25,
                                                    borderRadius: 1.5,
                                                    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : '#f8fafc',
                                                    borderColor: theme.palette.mode === 'dark' ? theme.palette.grey[700] : '#e2e8f0'
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        mb: 0.5
                                                    }}
                                                >
                                                    <Typography
                                                        variant='caption'
                                                        sx={{ fontWeight: 600, color: theme.palette.primary.main }}
                                                    >
                                                        {doc.title || `Tài liệu nguồn #${docIdx + 1}`}
                                                    </Typography>
                                                    <Chip
                                                        label='Nguồn tham khảo'
                                                        size='small'
                                                        color='info'
                                                        variant='outlined'
                                                        sx={{ height: 18, fontSize: '0.62rem' }}
                                                    />
                                                </Box>
                                                {typeof doc.source === 'string' &&
                                                    (/^https?:\/\//i.test(doc.source) ||
                                                        /^\/api\/v1\/agent-builder\/documents\/[a-f\d-]+\/chunks\/[a-f\d-]+$/i.test(
                                                            doc.source
                                                        )) && (
                                                        <Typography
                                                            component='a'
                                                            href={doc.source}
                                                            target='_blank'
                                                            rel='noopener noreferrer'
                                                            variant='caption'
                                                        >
                                                            Mở nguồn tham khảo
                                                        </Typography>
                                                    )}
                                                <Typography
                                                    variant='caption'
                                                    sx={{
                                                        display: 'block',
                                                        color: theme.palette.text.secondary,
                                                        whiteSpace: 'pre-wrap',
                                                        lineHeight: 1.4
                                                    }}
                                                >
                                                    {doc.pageContent}
                                                </Typography>
                                            </Paper>
                                        ))}
                                    </Stack>
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

            {/* Gợi ý câu hỏi kiểm thử từ Evaluation Examples & Nút Chạy Test Suite */}
            {evaluationExamples.length > 0 && (
                <Box
                    sx={{
                        px: 2,
                        py: 1,
                        backgroundColor: theme.palette.background.default,
                        borderTop: `1px solid ${theme.palette.divider}`
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 500 }}>
                            Câu hỏi mẫu thử nghiệm:
                        </Typography>
                        <Button
                            size='small'
                            variant='text'
                            color='primary'
                            startIcon={isRunningSuite ? <CircularProgress size={12} /> : <IconPlayerPlay size={14} />}
                            disabled={isRunningSuite || isLoading}
                            onClick={handleRunTestSuite}
                            sx={{ fontSize: '0.7rem', py: 0 }}
                        >
                            Chạy toàn bộ bộ test ({evaluationExamples.length})
                        </Button>
                    </Box>
                    <Stack direction='row' spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
                        {evaluationExamples.map((ex, idx) => (
                            <Chip
                                key={idx}
                                label={ex.input}
                                size='small'
                                clickable
                                disabled={isLoading || isRunningSuite}
                                onClick={() => handleSendTest(ex.input)}
                                sx={{ fontSize: '0.75rem' }}
                            />
                        ))}
                    </Stack>
                </Box>
            )}

            <Divider />

            {/* Form gửi tin nhắn test (hỗ trợ đính kèm file Excel .xlsx / Word .docx) */}
            <Box
                component='form'
                onSubmit={(e) => {
                    e.preventDefault()
                    handleSendTest()
                }}
                sx={{
                    p: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    backgroundColor: theme.palette.background.paper
                }}
            >
                {attachedFiles.length > 0 && (
                    <Stack direction='row' spacing={0.75} flexWrap='wrap' useFlexGap>
                        {attachedFiles.map((file, idx) => (
                            <Chip
                                key={`${file.name}-${idx}`}
                                size='small'
                                variant='outlined'
                                color='primary'
                                icon={<IconFileText size={14} />}
                                label={`${file.name} · ${Math.max(1, Math.ceil(file.size / 1024))} KB`}
                                disabled={isLoading || isRunningSuite}
                                onDelete={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                            />
                        ))}
                    </Stack>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <input
                        ref={fileInputRef}
                        type='file'
                        hidden
                        multiple
                        accept='.xlsx,.docx'
                        aria-label='Đính kèm tệp Excel hoặc Word'
                        onChange={(e) => {
                            chooseOfficeFiles(e.target.files)
                            e.target.value = ''
                        }}
                    />
                    <Tooltip title='Đính kèm tệp Excel (.xlsx) hoặc Word (.docx) để Agent đọc và xử lý'>
                        <span>
                            <IconButton
                                size='small'
                                color={attachedFiles.length ? 'primary' : 'default'}
                                disabled={isLoading || isRunningSuite}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <IconPaperclip size={19} />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <TextField
                        fullWidth
                        size='small'
                        placeholder='Nhập câu hỏi hoặc đính kèm tệp .xlsx / .docx để thử nghiệm...'
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isLoading || isRunningSuite}
                        variant='outlined'
                    />
                    <IconButton
                        color='primary'
                        type='submit'
                        disabled={(!input.trim() && attachedFiles.length === 0) || isLoading || isRunningSuite}
                    >
                        <IconSend size={20} />
                    </IconButton>
                </Box>
            </Box>

            {/* Dialog Báo Cáo Kết Quả Kiểm Thử (PH3-T03) */}
            <Dialog open={isSuiteDialogOpen} onClose={() => setIsSuiteDialogOpen(false)} maxWidth='md' fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant='h4'>Báo Cáo Kiểm Thử Tự Động (Batch Test Report)</Typography>
                    <IconButton size='small' onClick={() => setIsSuiteDialogOpen(false)}>
                        <IconX size={18} />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {suiteReport && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {/* Summary banner */}
                            <Alert severity={suiteReport.allPassed ? 'success' : 'warning'}>
                                Kết quả:{' '}
                                <strong>
                                    {suiteReport.passedCount} / {suiteReport.totalCount} kịch bản Đạt tiêu chí
                                </strong>{' '}
                                (Thời gian thực thi: {suiteReport.executionTimeMs}ms)
                            </Alert>

                            {/* Danh sách từng kịch bản */}
                            <Stack spacing={1.5}>
                                {suiteReport.results?.map((res, i) => (
                                    <Card key={i} variant='outlined'>
                                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant='subtitle2' fontWeight={600}>
                                                    #{res.exampleIndex}. Câu hỏi: &quot;{res.input}&quot;
                                                </Typography>
                                                <Chip
                                                    label={res.passed ? 'ĐẠT' : 'CHƯA ĐẠT'}
                                                    color={res.passed ? 'success' : 'error'}
                                                    size='small'
                                                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
                                                />
                                            </Box>
                                            <Typography
                                                variant='body2'
                                                color='textSecondary'
                                                sx={{ mb: 1, backgroundColor: theme.palette.grey[50], p: 1, borderRadius: 1 }}
                                            >
                                                <strong>Phản hồi:</strong> {res.output || '(Không có phản hồi)'}
                                            </Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                                <Typography variant='caption' sx={{ fontWeight: 500 }}>
                                                    Tiêu chí mong đợi:
                                                </Typography>
                                                {res.assertions?.map((ast, aIdx) => {
                                                    const isMatched = res.matchedAssertions?.includes(ast)
                                                    return (
                                                        <Chip
                                                            key={aIdx}
                                                            label={ast}
                                                            size='small'
                                                            color={isMatched ? 'success' : 'default'}
                                                            variant={isMatched ? 'filled' : 'outlined'}
                                                            sx={{ height: 18, fontSize: '0.65rem' }}
                                                        />
                                                    )
                                                })}
                                            </Box>
                                        </CardContent>
                                    </Card>
                                ))}
                            </Stack>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsSuiteDialogOpen(false)}>Đóng</Button>
                    <Button variant='contained' color='primary' onClick={handleRunTestSuite} disabled={isRunningSuite}>
                        Chạy Lại Bộ Kiểm Thử
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Hộp thoại Phê Duyệt & Xuất Bản Trợ Lý (PH5-T01) */}
            <Dialog open={isPublishDialogOpen} onClose={() => !isPublishing && setIsPublishDialogOpen(false)} maxWidth='sm' fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconUpload size={22} color={theme.palette.success.main} />
                        <Typography variant='h4'>Phê Duyệt & Xuất Bản Trợ Lý</Typography>
                    </Box>
                    <IconButton size='small' onClick={() => setIsPublishDialogOpen(false)} disabled={isPublishing}>
                        <IconX size={18} />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant='body1' gutterBottom fontWeight={500}>
                        Bạn đang chuẩn bị xuất bản chính thức trợ lý <strong>{flowName}</strong> (Phiên bản #{revisionNo}).
                    </Typography>
                    <Alert severity='info' sx={{ my: 2 }}>
                        Cổng kiểm soát chất lượng (Quality Gate) sẽ tự động kiểm tra các kịch bản đánh giá để đảm bảo tỷ lệ vượt qua bài thử
                        nghiệm đạt tối thiểu <strong>80%</strong> trước khi kích hoạt trạng thái triển khai.
                    </Alert>
                    <FormControlLabel
                        control={<Checkbox checked={isPublicAgent} onChange={(e) => setIsPublicAgent(e.target.checked)} color='primary' />}
                        label='Mở Cổng Người Dùng Cuối công khai (/support-portal/:id) để khách hàng truy cập không cần tài khoản Admin'
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setIsPublishDialogOpen(false)} disabled={isPublishing} color='inherit'>
                        Hủy
                    </Button>
                    <Button
                        onClick={handleConfirmPublish}
                        disabled={isPublishing}
                        variant='contained'
                        color='success'
                        startIcon={isPublishing ? <CircularProgress size={16} color='inherit' /> : <IconCheck size={18} />}
                    >
                        {isPublishing ? 'Đang Kiểm Tra & Xuất Bản...' : 'Xác Nhận Xuất Bản'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

TestChatPane.propTypes = {
    sessionId: PropTypes.string,
    flowId: PropTypes.string,
    flowType: PropTypes.string,
    flowName: PropTypes.string,
    revisionNo: PropTypes.number,
    evaluationExamples: PropTypes.array,
    buildStatus: PropTypes.string,
    buildError: PropTypes.string,
    onCancelBuild: PropTypes.func,
    onRetryBuild: PropTypes.func
}

export default TestChatPane
