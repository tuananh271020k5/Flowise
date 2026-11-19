import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Grid,
    Alert,
    Button,
    Snackbar,
    Typography,
    Box,
    Tabs,
    Tab,
    Chip,
    ToggleButton,
    ToggleButtonGroup,
    Paper,
    Stack
} from '@mui/material'
import { IconSettings, IconMessageCode, IconPlugConnected, IconTicket, IconGitBranch, IconCpu } from '@tabler/icons-react'
import { BackdropLoader } from '@/ui-component/loading/BackdropLoader'
import agentBuilderApi from '@/api/agentBuilder'
import ChatPane from './ChatPane'
import SpecCard from './SpecCard'
import TestChatPane from './TestChatPane'
import RevisionsDialog from './RevisionsDialog'
import ModelSettingsDialog from './ModelSettingsDialog'
import McpServersDialog from './McpServersDialog'
import HelpdeskTicketsDialog from './HelpdeskTicketsDialog'
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
    const [mcpOpen, setMcpOpen] = useState(false)
    const [ticketsOpen, setTicketsOpen] = useState(false)
    const [workspaceMcpServers, setWorkspaceMcpServers] = useState([])
    const [canvasVersion, setCanvasVersion] = useState(() => {
        try {
            return localStorage.getItem('agentBuilderCanvasVersion') || 'v1'
        } catch {
            return 'v1'
        }
    })
    const [currentFlowType, setCurrentFlowType] = useState(null)
    useEffect(() => {
        agentBuilderApi
            .getModelProfile()
            .then(({ data }) => setModelProfile(data))
            .catch(() => {})
        agentBuilderApi
            .listMcpServers()
            .then(({ data }) => setWorkspaceMcpServers(Array.isArray(data) ? data : []))
            .catch(() => {})
    }, [])
    const handleCanvasVersionChange = (_event, nextVal) => {
        if (!nextVal) return
        setCanvasVersion(nextVal)
        try {
            localStorage.setItem('agentBuilderCanvasVersion', nextVal)
        } catch {
            // Ignore storage errors
        }
    }
    const applyBuildResult = (data) => {
        if (data?.success && data.flowId) {
            setCurrentFlowId(data.flowId)
            setCurrentFlowType(data.flowType || (canvasVersion === 'v1' ? 'MULTIAGENT' : 'AGENTFLOW'))
            setBuildStatus('completed')
            setBuildError(null)
            setActiveTab('test')
        } else if (data?.success === false) {
            setCurrentFlowId(null)
            setCurrentFlowType(null)
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
            const resolvedSid = data.session?.id || sid
            setSessionId(resolvedSid)
            try {
                localStorage.setItem('agentBuilderLastSessionId', resolvedSid)
            } catch {
                // Ignore storage errors
            }
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
                    setCurrentFlowType(latestDraft?.flowType || null)
                    setBuildStatus(latestDraft ? 'completed' : null)
                }
            } catch {
                // Không bắt buộc phải có draft
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi tải phiên Agent Builder:', err)
            if (err?.response?.status === 404 || err?.response?.status === 403) {
                try {
                    localStorage.removeItem('agentBuilderLastSessionId')
                } catch {
                    // Ignore storage errors
                }
            }
            setError(err?.response?.data?.message || 'Không thể tải phiên làm việc. Vui lòng thử lại.')
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Đồng bộ session khi URL param thay đổi (tự mở lại phiên gần nhất khi quay lại /agent-builder)
    useEffect(() => {
        if (paramSessionId) {
            setSessionId(paramSessionId)
            loadSession(paramSessionId)
        } else {
            let lastSessionId = null
            try {
                lastSessionId = localStorage.getItem('agentBuilderLastSessionId')
            } catch {
                lastSessionId = null
            }
            if (lastSessionId) {
                navigate(`/agent-builder/${lastSessionId}`, { replace: true })
                return
            }
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
    }, [paramSessionId, loadSession, navigate])

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
                    const created = await agentBuilderApi.createSession({ canvasVersion })
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
                    initialPrompt: content,
                    canvasVersion
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
                    expectedRevision: revisionNumber,
                    canvasVersion
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
        try {
            localStorage.removeItem('agentBuilderLastSessionId')
        } catch {
            // Ignore storage errors
        }
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
            const res = await agentBuilderApi.executeBuild(sessionId, { canvasVersion })
            const data = res.data

            if (data.flowId) {
                setCurrentFlowId(data.flowId)
                setCurrentFlowType(data.flowType || (canvasVersion === 'v1' ? 'MULTIAGENT' : 'AGENTFLOW'))
            }
            if (data.jobId) {
                setCurrentBuildJobId(data.jobId)
            }
            setBuildStatus('completed')
            setSnackbarMessage(
                data.isExisting
                    ? 'Bản draft Agentflow đã tồn tại cho phiên bản này. Bạn có thể bắt đầu thử nghiệm!'
                    : `Đã tạo bản draft Agentflow ${canvasVersion.toUpperCase()} thành công!`
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

    const authorizedMcpCount = workspaceMcpServers.filter((srv) => srv.status === 'AUTHORIZED').length

    return (
        <Box
            sx={{
                pt: 1.5,
                pb: 1,
                px: { xs: 0.5, md: 1 },
                height: 'calc(100vh - 138px)',
                minHeight: 560,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5
            }}
        >
            <BackdropLoader open={isLoading} />

            {/* Thanh công cụ Workspace gọn gàng, không bao giờ bị che cắt phía trên */}
            <Paper
                variant='outlined'
                sx={{
                    px: 2,
                    py: 1,
                    borderRadius: 2.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                    flexWrap: 'wrap',
                    flexShrink: 0,
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff')
                }}
            >
                <Stack direction='row' alignItems='center' spacing={1.5} flexWrap='wrap' useFlexGap>
                    <Typography variant='h4' sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
                        Agent Builder
                    </Typography>
                    <Button
                        size='small'
                        variant='outlined'
                        color={modelProfile?.ready ? 'inherit' : 'warning'}
                        startIcon={<IconCpu size={16} />}
                        onClick={() => setModelOpen(true)}
                        sx={{
                            textTransform: 'none',
                            borderRadius: 2,
                            px: 1.25,
                            py: 0.4,
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            borderColor: 'divider'
                        }}
                    >
                        <Box
                            component='span'
                            sx={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                bgcolor: modelProfile?.ready ? 'success.main' : 'warning.main',
                                mr: 0.85,
                                display: 'inline-block'
                            }}
                        />
                        {modelProfile?.ready ? modelProfile.modelName : 'Cấu hình Model API'}
                    </Button>
                </Stack>

                <Stack direction='row' alignItems='center' spacing={1} flexWrap='wrap' useFlexGap>
                    <Button
                        variant='outlined'
                        size='small'
                        color='inherit'
                        startIcon={<IconPlugConnected size={16} />}
                        onClick={() => setMcpOpen(true)}
                        sx={{ textTransform: 'none', borderRadius: 2, borderColor: 'divider', fontSize: '0.8rem' }}
                    >
                        Kết nối MCP
                        {authorizedMcpCount > 0 && (
                            <Chip
                                size='small'
                                color='success'
                                label={authorizedMcpCount}
                                sx={{ ml: 0.75, height: 18, fontSize: '0.68rem', fontWeight: 700 }}
                            />
                        )}
                    </Button>
                    <Button
                        variant='outlined'
                        size='small'
                        color='inherit'
                        startIcon={<IconTicket size={16} />}
                        onClick={() => setTicketsOpen(true)}
                        sx={{ textTransform: 'none', borderRadius: 2, borderColor: 'divider', fontSize: '0.8rem' }}
                    >
                        Phiếu CSKH
                    </Button>
                    <ToggleButtonGroup
                        size='small'
                        exclusive
                        value={canvasVersion}
                        onChange={handleCanvasVersionChange}
                        aria-label='Chọn phiên bản Flowise Canvas'
                        sx={{
                            bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f1f5f9'),
                            p: 0.25,
                            borderRadius: 2,
                            '& .MuiToggleButton-root': {
                                border: 'none',
                                borderRadius: '6px !important',
                                textTransform: 'none',
                                py: 0.35,
                                px: 1.25,
                                fontSize: '0.76rem',
                                fontWeight: 500,
                                '&.Mui-selected': {
                                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'primary.dark' : '#ffffff'),
                                    boxShadow: '0 1px 2px rgba(15,23,42,0.1)',
                                    fontWeight: 600
                                }
                            }
                        }}
                    >
                        <ToggleButton value='v1'>Canvas V1 (Đầy đủ Node)</ToggleButton>
                        <ToggleButton value='v2'>Canvas V2</ToggleButton>
                    </ToggleButtonGroup>
                </Stack>
            </Paper>

            <ModelSettingsDialog
                open={modelOpen}
                onClose={() => setModelOpen(false)}
                onSaved={(data) => {
                    setModelProfile(data)
                }}
            />
            <McpServersDialog open={mcpOpen} onClose={() => setMcpOpen(false)} onChanged={setWorkspaceMcpServers} />
            <HelpdeskTicketsDialog open={ticketsOpen} onClose={() => setTicketsOpen(false)} />

            {error && (
                <Alert severity='error' sx={{ borderRadius: 2, flexShrink: 0 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
                {/* Cột trái: Khung Chat trò chuyện đàm thoại thiết kế (7/12 desktop) */}
                <Grid item xs={12} md={7} lg={7} sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <ChatPane
                        messages={messages}
                        documents={spec?.dataSources || []}
                        suggestions={buildStatus === 'completed' ? [] : spec?.workflow?.suggestions || []}
                        isSending={isSending}
                        canConfirmBuild={Boolean(readiness?.buildReady && buildStatus !== 'completed' && messages.length > 0)}
                        onSendMessage={handleSendMessage}
                        onNewSession={handleNewSession}
                    />
                </Grid>

                {/* Cột phải: Khung hợp nhất Cấu hình / Luồng xử lý / Chạy thử (5/12 desktop) */}
                <Grid item xs={12} md={5} lg={5} sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <Paper
                        variant='outlined'
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            borderRadius: 2.5,
                            overflow: 'hidden',
                            bgcolor: (theme) => (theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff')
                        }}
                    >
                        <Box
                            sx={{
                                borderBottom: 1,
                                borderColor: 'divider',
                                px: 1,
                                bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc')
                            }}
                        >
                            <Tabs
                                value={activeTab}
                                onChange={(e, val) => setActiveTab(val)}
                                textColor='primary'
                                indicatorColor='primary'
                                variant='fullWidth'
                                sx={{
                                    minHeight: 46,
                                    '& .MuiTab-root': {
                                        minHeight: 46,
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.82rem',
                                        whiteSpace: 'nowrap',
                                        px: 1
                                    }
                                }}
                            >
                                <Tab icon={<IconSettings size={16} />} iconPosition='start' label='Cấu hình' value='spec' />
                                <Tab icon={<IconGitBranch size={16} />} iconPosition='start' label='Luồng xử lý' value='workflow' />
                                <Tab icon={<IconMessageCode size={16} />} iconPosition='start' label='Chạy thử' value='test' />
                            </Tabs>
                        </Box>

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

                        {activeTab === 'workflow' && (
                            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1.5 }}>
                                <WorkflowPanel
                                    workflow={spec?.workflow}
                                    readiness={readiness}
                                    buildStatus={buildStatus}
                                    mcpServers={spec?.mcpServers?.length ? spec.mcpServers : workspaceMcpServers}
                                />
                            </Box>
                        )}

                        {activeTab === 'test' && (
                            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                <TestChatPane
                                    key={currentFlowId || 'pending'}
                                    sessionId={sessionId}
                                    flowId={currentFlowId}
                                    flowType={currentFlowType || (canvasVersion === 'v1' ? 'MULTIAGENT' : 'AGENTFLOW')}
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
                    </Paper>
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
        </Box>
    )
}

export default AgentBuilderView
