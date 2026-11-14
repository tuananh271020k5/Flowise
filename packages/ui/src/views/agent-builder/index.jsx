import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Grid, Alert, Snackbar, Typography } from '@mui/material'
import MainCard from '@/ui-component/cards/MainCard'
import { BackdropLoader } from '@/ui-component/loading/BackdropLoader'
import agentBuilderApi from '@/api/agentBuilder'
import ChatPane from './ChatPane'
import SpecCard from './SpecCard'
import RevisionsDialog from './RevisionsDialog'

const AgentBuilderView = () => {
    const { id: paramSessionId } = useParams()
    const navigate = useNavigate()

    // State
    const [sessionId, setSessionId] = useState(paramSessionId || null)
    const [messages, setMessages] = useState([])
    const [spec, setSpec] = useState(null)
    const [revisionNumber, setRevisionNumber] = useState(1)
    const [readiness, setReadiness] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [error, setError] = useState(null)
    const [snackbarMessage, setSnackbarMessage] = useState('')
    const [revisions, setRevisions] = useState([])
    const [isRevisionsOpen, setIsRevisionsOpen] = useState(false)

    // Tạo Client Message ID chống gửi lặp
    const generateClientMessageId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID()
        }
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
    }

    // Tải dữ liệu phiên làm việc từ backend
    const loadSession = useCallback(async (sid) => {
        if (!sid) return
        setIsLoading(true)
        setError(null)
        try {
            const res = await agentBuilderApi.getSession(sid)
            const data = res.data
            setSessionId(data.session?.id || sid)
            setMessages(data.messages || [])
            if (data.currentSpecRevision) {
                setSpec(data.currentSpecRevision.spec || null)
                setRevisionNumber(data.currentSpecRevision.revisionNumber || 1)
            }
            if (data.readiness) {
                setReadiness(data.readiness)
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi tải phiên Agent Builder:', err)
            setError(err?.response?.data?.message || 'Không thể tải phiên làm việc. Vui lòng thử lại.')
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Đồng bộ session khi URL param thay đổi
    useEffect(() => {
        if (paramSessionId) {
            setSessionId(paramSessionId)
            loadSession(paramSessionId)
        } else {
            // Reset khi ở trang mới không có ID
            setSessionId(null)
            setMessages([])
            setSpec(null)
            setRevisionNumber(1)
            setReadiness(null)
        }
    }, [paramSessionId, loadSession])

    // Xử lý gửi tin nhắn đàm thoại
    const handleSendMessage = async (content) => {
        if (!content || isSending) return
        const clientMessageId = generateClientMessageId()

        // Optimistic UI: thêm tin nhắn của user ngay lập tức
        const optimisticMessage = {
            id: clientMessageId,
            role: 'user',
            content,
            createdAt: new Date().toISOString()
        }
        setMessages((prev) => [...prev, optimisticMessage])
        setIsSending(true)
        setError(null)

        try {
            if (!sessionId) {
                // Khởi tạo phiên mới với tin nhắn ban đầu
                const res = await agentBuilderApi.createSession({
                    initialGoal: content,
                    initialPrompt: content
                })
                const data = res.data
                const newSid = data.session?.id

                if (newSid) {
                    setSessionId(newSid)
                    setMessages(data.messages || [optimisticMessage])
                    if (data.currentSpecRevision) {
                        setSpec(data.currentSpecRevision.spec || null)
                        setRevisionNumber(data.currentSpecRevision.revisionNumber || 1)
                    }
                    if (data.readiness) {
                        setReadiness(data.readiness)
                    }
                    // Đồng bộ URL mà không tải lại trang
                    navigate(`/agent-builder/${newSid}`, { replace: true })
                }
            } else {
                // Gửi tin nhắn vào phiên hiện tại
                const res = await agentBuilderApi.sendMessage(sessionId, {
                    content,
                    clientMessageId,
                    expectedRevision: revisionNumber
                })
                const data = res.data

                // Cập nhật danh sách tin nhắn với tin nhắn phản hồi của assistant
                if (data.assistantMessage) {
                    setMessages((prev) => {
                        // Tránh thêm trùng lặp
                        const filtered = prev.filter((m) => m.id !== clientMessageId && m.id !== data.userMessage?.id)
                        return [...filtered, data.userMessage || optimisticMessage, data.assistantMessage]
                    })
                }

                if (data.currentSpecRevision) {
                    setSpec(data.currentSpecRevision.spec || null)
                    setRevisionNumber(data.currentSpecRevision.revisionNumber || revisionNumber)
                }

                if (data.readiness) {
                    setReadiness(data.readiness)
                }
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi gửi tin nhắn:', err)
            if (err?.response?.status === 409) {
                setSnackbarMessage('Phiên bản Spec đã được cập nhật ở nơi khác. Đang tải lại dữ liệu mới nhất...')
                if (sessionId) loadSession(sessionId)
            } else {
                setError(err?.response?.data?.message || 'Có lỗi xảy ra khi gửi tin nhắn. Vui lòng thử lại.')
            }
        } finally {
            setIsSending(false)
        }
    }

    // Xử lý tạo phiên mới
    const handleNewSession = () => {
        setSessionId(null)
        setMessages([])
        setSpec(null)
        setRevisionNumber(1)
        setReadiness(null)
        navigate('/agent-builder')
    }

    // Mở hộp thoại xem lịch sử Revision
    const handleOpenRevisions = async () => {
        if (!sessionId) return
        try {
            const res = await agentBuilderApi.getRevisions(sessionId)
            setRevisions(res.data || [])
            setIsRevisionsOpen(true)
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi tải danh sách revisions:', err)
            setSnackbarMessage('Không thể tải lịch sử phiên bản.')
        }
    }

    // Xử lý khi nhấn nút "Tạo Agentflow V2"
    const handleGenerateAgentflow = () => {
        setSnackbarMessage('Cấu hình đã sẵn sàng! Chuyển tiếp tới bước sinh Agentflow V2...')
        // Placeholder cho bước tích hợp Task B-006 (Agentflow Generator)
    }

    return (
        <MainCard
            maxWidth='full'
            sx={{
                p: 0,
                m: 0,
                height: 'calc(100vh - 120px)',
                display: 'flex',
                flexDirection: 'column'
            }}
            contentSX={{
                p: 2,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
            }}
        >
            <BackdropLoader open={isLoading} />

            {error && (
                <Alert severity='error' sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={2} sx={{ flex: 1, height: '100%', minHeight: 0 }}>
                {/* Cột trái: Khung Chat trò chuyện (7/12 desktop) */}
                <Grid item xs={12} md={7} lg={7.5} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <ChatPane messages={messages} isSending={isSending} onSendMessage={handleSendMessage} onNewSession={handleNewSession} />
                </Grid>

                {/* Cột phải: Thẻ tóm tắt Spec và Missing Fields (5/12 desktop) */}
                <Grid item xs={12} md={5} lg={4.5} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <SpecCard
                        spec={spec}
                        readiness={readiness}
                        revisionNumber={revisionNumber}
                        onOpenRevisions={handleOpenRevisions}
                        onGenerateAgentflow={handleGenerateAgentflow}
                    />
                </Grid>
            </Grid>

            {/* Dialog xem lịch sử các revision */}
            <RevisionsDialog open={isRevisionsOpen} onClose={() => setIsRevisionsOpen(false)} revisions={revisions} />

            {/* Thông báo Snackbar */}
            <Snackbar
                open={Boolean(snackbarMessage)}
                autoHideDuration={4000}
                onClose={() => setSnackbarMessage('')}
                message={<Typography variant='body2'>{snackbarMessage}</Typography>}
            />
        </MainCard>
    )
}

export default AgentBuilderView
