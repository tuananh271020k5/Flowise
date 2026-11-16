import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Grid, Alert, Snackbar, Typography, Box, Tabs, Tab } from '@mui/material'
import { IconSettings, IconMessageCode } from '@tabler/icons-react'
import MainCard from '@/ui-component/cards/MainCard'
import { BackdropLoader } from '@/ui-component/loading/BackdropLoader'
import agentBuilderApi from '@/api/agentBuilder'
import ChatPane from './ChatPane'
import SpecCard from './SpecCard'
import TestChatPane from './TestChatPane'
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

    // Phase 3 State: Quản lý Build & Chat Thử Nghiệm (PH3-T01, PH3-T02)
    const [activeTab, setActiveTab] = useState('spec') // 'spec' | 'test'
    const [currentFlowId, setCurrentFlowId] = useState(null)
    const [currentBuildJobId, setCurrentBuildJobId] = useState(null)
    const [buildStatus, setBuildStatus] = useState(null) // null | 'building' | 'failed' | 'completed' | 'cancelled'
    const [buildError, setBuildError] = useState(null)

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

            // Tải lịch sử draft nếu có
            try {
                const draftRes = await agentBuilderApi.getDraftHistory(sid)
                if (draftRes.data && draftRes.data.length > 0) {
                    const latestDraft = draftRes.data[draftRes.data.length - 1]
                    setCurrentFlowId(latestDraft.flowId)
                    setBuildStatus('completed')
                }
            } catch {
                // Không bắt buộc phải có draft
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
            setCurrentFlowId(null)
            setBuildStatus(null)
            setActiveTab('spec')
        }
    }, [paramSessionId, loadSession])

    // Lắng nghe sự kiện SSE realtime từ backend (PH3-T02)
    useEffect(() => {
        if (!sessionId) return

        let eventSource
        try {
            const baseURL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'
            eventSource = new EventSource(`${baseURL}/api/v1/agent-builder/sessions/${sessionId}/events`)

            eventSource.addEventListener('connected', () => {
                // Đã kết nối/tái kết nối SSE thành công (PH3-T07)
            })

            eventSource.addEventListener('revision', (e) => {
                try {
                    const payload = JSON.parse(e.data)
                    if (payload.spec) setSpec(payload.spec)
                    if (payload.revisionNumber) setRevisionNumber(payload.revisionNumber)
                    if (payload.readiness) setReadiness(payload.readiness)
                } catch {
                    // Ignore parse error
                }
            })

            eventSource.addEventListener('message', (e) => {
                try {
                    const payload = JSON.parse(e.data)
                    if (payload.eventType === 'build_cancelled') {
                        setBuildStatus('cancelled')
                        setSnackbarMessage('Tác vụ build đã bị hủy.')
                    } else if (payload.id && payload.content) {
                        setMessages((prev) => {
                            if (prev.some((m) => m.id === payload.id)) return prev
                            return [...prev, payload]
                        })
                    }
                } catch {
                    // Ignore parse error
                }
            })

            eventSource.addEventListener('build_cancelled', () => {
                setBuildStatus('cancelled')
                setSnackbarMessage('Tác vụ build đã bị hủy.')
            })

            eventSource.addEventListener('build_completed', (e) => {
                try {
                    const payload = JSON.parse(e.data)
                    if (payload.flowId) {
                        setCurrentFlowId(payload.flowId)
                    }
                    setBuildStatus('completed')
                    setSnackbarMessage('Biên dịch Agentflow V2 hoàn tất thành công!')
                } catch {
                    // Ignore parse error
                }
            })

            eventSource.addEventListener('build_failed', (e) => {
                try {
                    const payload = JSON.parse(e.data)
                    setBuildStatus('failed')
                    setBuildError(payload.error || 'Biên dịch thất bại')
                } catch {
                    // Ignore parse error
                }
            })
        } catch {
            // Ignore SSE connection error
        }

        return () => {
            if (eventSource) eventSource.close()
        }
    }, [sessionId])

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
        setCurrentFlowId(null)
        setBuildStatus(null)
        setActiveTab('spec')
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

    // Khôi phục về revision trước đó (PH3-T05)
    const handleRollback = async (revisionId, revNo) => {
        if (!sessionId || !revisionId) return
        try {
            setIsLoading(true)
            const res = await agentBuilderApi.rollbackRevision(sessionId, { revisionId })
            const data = res.data
            if (data.session) {
                setSessionId(data.session.id)
                setMessages(data.messages || [])
                if (data.currentSpecRevision) {
                    setSpec(data.currentSpecRevision.spec || null)
                    setRevisionNumber(data.currentSpecRevision.revisionNumber || data.currentSpecRevision.revisionNo || 1)
                }
                if (data.readiness) {
                    setReadiness(data.readiness)
                }
                setSnackbarMessage(`Đã khôi phục thành công về phiên bản #${revNo}!`)
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi khôi phục revision:', err)
            setError(err?.response?.data?.message || 'Khôi phục phiên bản thất bại.')
            throw err
        } finally {
            setIsLoading(false)
        }
    }

    // Xử lý khi nhấn nút "Tạo Agentflow V2" (PH3-T01, PH3-T02)
    const handleGenerateAgentflow = async () => {
        if (!sessionId) return
        setBuildStatus('building')
        setBuildError(null)
        setActiveTab('test') // Tự động chuyển qua tab chat thử nghiệm để người dùng thấy tiến trình

        try {
            const res = await agentBuilderApi.executeBuild(sessionId, {})
            const data = res.data

            if (data.flowId) {
                setCurrentFlowId(data.flowId)
            }
            if (data.jobId) {
                setCurrentBuildJobId(data.jobId)
            }
            setBuildStatus('completed')
            setSnackbarMessage(
                data.isExisting
                    ? 'Bản draft Agentflow đã tồn tại cho phiên bản này. Bạn có thể bắt đầu thử nghiệm!'
                    : 'Đã tạo bản draft Agentflow V2 thành công!'
            )
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi biên dịch Agentflow:', err)
            setBuildStatus('failed')
            setBuildError(err?.response?.data?.message || err?.message || 'Biên dịch Agentflow thất bại.')
        }
    }

    // Hủy bỏ tác vụ build đang chạy
    const handleCancelBuild = async () => {
        if (!currentBuildJobId) return
        try {
            await agentBuilderApi.cancelBuild(currentBuildJobId, { reason: 'User cancelled via UI' })
            setBuildStatus('cancelled')
            setSnackbarMessage('Đã gửi yêu cầu hủy tác vụ build.')
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi hủy build:', err)
        }
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
                {/* Cột trái: Khung Chat trò chuyện đàm thoại thiết kế (7/12 desktop) */}
                <Grid item xs={12} md={7} lg={7} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <ChatPane messages={messages} isSending={isSending} onSendMessage={handleSendMessage} onNewSession={handleNewSession} />
                </Grid>

                {/* Cột phải: Tabs chuyển đổi Cấu hình Spec / Chat Thử Nghiệm (5/12 desktop) */}
                <Grid item xs={12} md={5} lg={5} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1.5 }}>
                        <Tabs
                            value={activeTab}
                            onChange={(e, val) => setActiveTab(val)}
                            textColor='primary'
                            indicatorColor='primary'
                            variant='fullWidth'
                        >
                            <Tab icon={<IconSettings size={18} />} iconPosition='start' label='Cấu hình Agent' value='spec' />
                            <Tab icon={<IconMessageCode size={18} />} iconPosition='start' label='Chat Thử Nghiệm' value='test' />
                        </Tabs>
                    </Box>

                    {/* Nội dung Tab Cấu hình Spec */}
                    {activeTab === 'spec' && (
                        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            <SpecCard
                                spec={spec}
                                readiness={readiness}
                                revisionNumber={revisionNumber}
                                onOpenRevisions={handleOpenRevisions}
                                onGenerateAgentflow={handleGenerateAgentflow}
                            />
                        </Box>
                    )}

                    {/* Nội dung Tab Chat Thử Nghiệm (PH3-T01, PH3-T02) */}
                    {activeTab === 'test' && (
                        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            <TestChatPane
                                sessionId={sessionId}
                                flowId={currentFlowId}
                                flowName={spec?.name || 'Trợ lý Agentflow'}
                                revisionNo={revisionNumber}
                                evaluationExamples={spec?.evaluationExamples || []}
                                buildStatus={buildStatus}
                                buildError={buildError}
                                onCancelBuild={handleCancelBuild}
                                onRetryBuild={handleGenerateAgentflow}
                            />
                        </Box>
                    )}
                </Grid>
            </Grid>

            {/* Dialog xem lịch sử các revision */}
            <RevisionsDialog
                open={isRevisionsOpen}
                onClose={() => setIsRevisionsOpen(false)}
                revisions={revisions}
                currentRevisionNumber={revisionNumber}
                sessionId={sessionId}
                onRollback={handleRollback}
            />

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
