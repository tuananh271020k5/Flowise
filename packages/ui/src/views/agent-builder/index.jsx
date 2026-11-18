import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Grid, Alert, Button, Snackbar, Typography, Box, Tabs, Tab } from '@mui/material'
import { IconSettings, IconMessageCode } from '@tabler/icons-react'
import MainCard from '@/ui-component/cards/MainCard'
import { BackdropLoader } from '@/ui-component/loading/BackdropLoader'
import agentBuilderApi from '@/api/agentBuilder'
import ChatPane from './ChatPane'
import SpecCard from './SpecCard'
import TestChatPane from './TestChatPane'
import RevisionsDialog from './RevisionsDialog'
import ModelSettingsDialog from './ModelSettingsDialog'
import WorkflowPanel from './WorkflowPanel'
import client from '@/api/client'
import { fetchEventSource } from '@microsoft/fetch-event-source'
const parseSpec = (value) => {
    try {
        return typeof value === 'string' ? JSON.parse(value) : value
    } catch {
        return null
    }
}

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
    const [modelOpen, setModelOpen] = useState(false)
    const [modelProfile, setModelProfile] = useState(null)
    useEffect(() => {
        agentBuilderApi
            .getModelProfile()
            .then(({ data }) => setModelProfile(data))
            .catch(() => {})
    }, [])
    const applyBuildResult = (data) => {
        if (data?.success && data.flowId) {
            setCurrentFlowId(data.flowId)
            setBuildStatus('completed')
            setBuildError(null)
            setActiveTab('test')
        } else if (data?.success === false) {
            setCurrentFlowId(null)
            setBuildStatus('failed')
            setBuildError(data.error || data.message)
        }
    }
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
            setRevisionNumber(data.session?.currentRevisionNo || 0)
            if (data.currentSpecRevision) {
                setSpec(parseSpec(data.currentSpecRevision.spec) || null)
                setRevisionNumber(data.currentSpecRevision.revisionNo || data.currentSpecRevision.revisionNumber || 1)
            }
            if (data.readiness) {
                setReadiness(data.readiness)
            }

            // Tải lịch sử draft nếu có
            try {
                const draftRes = await agentBuilderApi.getDraftHistory(sid)
                if (draftRes.data && draftRes.data.length > 0) {
                    const latestDraft = draftRes.data.filter((draft) => draft.specRevisionId === data.currentSpecRevision?.id).at(-1)
                    setCurrentFlowId(latestDraft?.flowId || null)
                    setBuildStatus(latestDraft ? 'completed' : null)
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

        const controller = new AbortController()
        fetchEventSource((client.defaults.baseURL || '/api/v1') + '/agent-builder/sessions/' + sessionId + '/events', {
            signal: controller.signal,
            credentials: 'include',
            headers: { 'x-request-from': 'internal' },
            openWhenHidden: true,
            async onopen(response) {
                if (response.status === 401 || response.status === 403) controller.abort()
                if (!response.ok) throw new Error('SSE HTTP ' + response.status)
            },
            onmessage(event) {
                let data
                try {
                    data = JSON.parse(event.data)
                } catch {
                    return
                }
                if (event.event === 'revision') {
                    setSpec(parseSpec(data.spec))
                    setRevisionNumber(data.revisionNo || 1)
                }
                if (event.event === 'readiness') setReadiness(data)
                if (event.event === 'message' && data.id)
                    setMessages((items) => (items.some((m) => m.id === data.id) ? items : [...items, data]))
                if (event.event === 'build_dispatched') {
                    setCurrentFlowId(null)
                    setBuildStatus('building')
                    setBuildError(null)
                }
                if (event.event === 'build_completed') applyBuildResult({ success: true, ...data })
                if (event.event === 'build_failed') {
                    setBuildStatus('failed')
                    setBuildError(data.error)
                }
                if (event.event === 'build_cancelled' || data.eventType === 'build_cancelled') setBuildStatus('cancelled')
            },
            onerror(error) {
                if (controller.signal.aborted) throw error
                return 2000
            }
        }).catch(() => {})
        return () => controller.abort()
    }, [sessionId])

    // Xử lý gửi tin nhắn đàm thoại
    const handleSendMessage = async (content, files = [], documentOptions = {}) => {
        if ((!content && !files.length) || isSending) return false
        const clientMessageId = generateClientMessageId()

        // Optimistic UI: thêm tin nhắn của user ngay lập tức
        const optimisticMessage = {
            id: clientMessageId,
            role: 'user',
            content: content || `Đính kèm: ${files.map((file) => file.name).join(', ')}`,
            createdAt: new Date().toISOString()
        }
        setMessages((prev) => [...prev, optimisticMessage])
        setIsSending(true)
        setError(null)

        try {
            if (files.length) {
                let sid = sessionId
                let expectedRevision = revisionNumber
                if (!sid) {
                    const created = await agentBuilderApi.createSession({})
                    sid = created.data.session.id
                    expectedRevision = created.data.session.currentRevisionNo || 0
                    setSessionId(sid)
                    setRevisionNumber(expectedRevision)
                }
                const { data } = await agentBuilderApi.uploadDocuments(sid, {
                    files,
                    content,
                    clientMessageId,
                    expectedRevision,
                    ...documentOptions
                })
                setMessages((prev) => [
                    ...prev.filter(
                        (message) =>
                            message.id !== clientMessageId &&
                            message.id !== data.userMessage?.id &&
                            message.id !== data.assistantMessage?.id
                    ),
                    data.userMessage,
                    ...(data.assistantMessage ? [data.assistantMessage] : [])
                ])
                setSpec(parseSpec(data.currentSpecRevision?.spec))
                setRevisionNumber(data.currentSpecRevision?.revisionNo || expectedRevision)
                setReadiness(data.readiness)
                if (data.currentSpecRevision?.revisionNo !== revisionNumber) {
                    setCurrentFlowId(null)
                    setBuildStatus(null)
                }
                setActiveTab('workflow')
                applyBuildResult(data.buildResult)
                if (!sessionId) navigate(`/agent-builder/${sid}`, { replace: true })
            } else if (!sessionId) {
                // Khởi tạo phiên mới với tin nhắn ban đầu
                const res = await agentBuilderApi.createSession({
                    initialGoal: content,
                    initialPrompt: content
                })
                const data = res.data
                if (data.currentSpecRevision?.revisionNo !== revisionNumber && !data.buildResult?.success) {
                    setCurrentFlowId(null)
                    setBuildStatus(null)
                    if (parseSpec(data.currentSpecRevision?.spec)?.workflow) setActiveTab('workflow')
                }
                applyBuildResult(data.buildResult)
                const newSid = data.session?.id

                if (newSid) {
                    setSessionId(newSid)
                    setMessages(data.messages || [optimisticMessage])
                    if (data.currentSpecRevision) {
                        setSpec(parseSpec(data.currentSpecRevision.spec) || null)
                        setRevisionNumber(data.currentSpecRevision.revisionNo || data.currentSpecRevision.revisionNumber || 1)
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
                if (data.currentSpecRevision?.revisionNo !== revisionNumber && !data.buildResult?.success) {
                    setCurrentFlowId(null)
                    setBuildStatus(null)
                    if (parseSpec(data.currentSpecRevision?.spec)?.workflow) setActiveTab('workflow')
                }
                applyBuildResult(data.buildResult)

                // Cập nhật danh sách tin nhắn với tin nhắn phản hồi của assistant
                if (data.assistantMessage) {
                    setMessages((prev) => {
                        // Tránh thêm trùng lặp
                        const filtered = prev.filter((m) => m.id !== clientMessageId && m.id !== data.userMessage?.id)
                        return [...filtered, data.userMessage || optimisticMessage, data.assistantMessage]
                    })
                }

                if (data.currentSpecRevision) {
                    setSpec(parseSpec(data.currentSpecRevision.spec) || null)
                    setRevisionNumber(data.currentSpecRevision.revisionNo || data.currentSpecRevision.revisionNumber || revisionNumber)
                }

                if (data.readiness) {
                    setReadiness(data.readiness)
                }
            }
            return true
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi gửi tin nhắn:', err)
            if (err?.response?.status === 409) {
                setSnackbarMessage('Phiên bản Spec đã được cập nhật ở nơi khác. Đang tải lại dữ liệu mới nhất...')
                if (sessionId) loadSession(sessionId)
            } else {
                setError(err?.response?.data?.message || 'Có lỗi xảy ra khi gửi tin nhắn. Vui lòng thử lại.')
            }
            setMessages((items) => items.filter((message) => message.id !== clientMessageId))
            return false
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
                    setSpec(parseSpec(data.currentSpecRevision.spec) || null)
                    setRevisionNumber(data.currentSpecRevision.revisionNo || data.currentSpecRevision.revisionNumber || 1)
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
            <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button onClick={() => setModelOpen(true)}>Cấu hình model</Button>
                <Typography variant='body2'>{modelProfile?.ready ? modelProfile.modelName : 'Chưa cấu hình API key'}</Typography>
            </Box>
            <ModelSettingsDialog
                open={modelOpen}
                onClose={() => setModelOpen(false)}
                onSaved={(data) => {
                    setModelProfile(data)
                }}
            />

            {error && (
                <Alert severity='error' sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={2} sx={{ flex: 1, height: '100%', minHeight: 0 }}>
                {/* Cột trái: Khung Chat trò chuyện đàm thoại thiết kế (7/12 desktop) */}
                <Grid item xs={12} md={7} lg={7} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <ChatPane
                        messages={messages}
                        documents={spec?.dataSources || []}
                        isSending={isSending}
                        canConfirmBuild={Boolean(readiness?.buildReady && buildStatus !== 'completed' && messages.length > 0)}
                        onSendMessage={handleSendMessage}
                        onNewSession={handleNewSession}
                    />
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
                            <Tab label='Luồng thực hiện' value='workflow' />
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
                    {activeTab === 'workflow' && (
                        <WorkflowPanel workflow={spec?.workflow} readiness={readiness} buildStatus={buildStatus} />
                    )}
                    {activeTab === 'test' && (
                        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            <TestChatPane
                                key={currentFlowId || 'pending'}
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
