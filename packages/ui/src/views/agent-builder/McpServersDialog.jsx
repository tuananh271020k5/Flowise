import { useCallback, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography
} from '@mui/material'
import { IconPlugConnected, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react'
import api from '@/api/agentBuilder'

export default function McpServersDialog({ open, onClose, onChanged }) {
    const [servers, setServers] = useState([])
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [busyId, setBusyId] = useState(null)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const [name, setName] = useState('')
    const [serverUrl, setServerUrl] = useState('')
    const [bearerToken, setBearerToken] = useState('')
    const [customHeadersText, setCustomHeadersText] = useState('')

    const loadServers = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const { data } = await api.listMcpServers()
            const list = Array.isArray(data) ? data : []
            setServers(list)
            if (onChanged) onChanged(list)
        } catch (e) {
            setError(e.response?.data?.message || 'Không tải được danh sách MCP Server của Workspace.')
        } finally {
            setLoading(false)
        }
    }, [onChanged])

    useEffect(() => {
        if (!open) return
        setError('')
        setSuccess('')
        setBearerToken('')
        setCustomHeadersText('')
        loadServers()
    }, [open, loadServers])

    const handleClose = () => {
        setBearerToken('')
        setCustomHeadersText('')
        setError('')
        setSuccess('')
        onClose()
    }

    const handleCreate = async () => {
        setError('')
        setSuccess('')
        let parsedHeaders
        if (customHeadersText.trim()) {
            try {
                const candidate = JSON.parse(customHeadersText.trim())
                if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
                    setError('Custom Headers phải là JSON object dạng {"Header-Name": "giá trị"}.')
                    return
                }
                parsedHeaders = candidate
            } catch {
                setError('Custom Headers không đúng định dạng JSON.')
                return
            }
        }

        setSubmitting(true)
        try {
            const { data } = await api.createMcpServer({
                name: name.trim(),
                serverUrl: serverUrl.trim(),
                ...(bearerToken.trim() ? { bearerToken: bearerToken.trim() } : {}),
                ...(parsedHeaders ? { headers: parsedHeaders } : {})
            })
            setName('')
            setServerUrl('')
            setBearerToken('')
            setCustomHeadersText('')
            setSuccess(`Đã kết nối "${data.name}" và nhận diện ${data.toolCount || data.actions?.length || 0} công cụ MCP!`)
            await loadServers()
        } catch (e) {
            setError(e.response?.data?.message || 'Không kết nối được tới MCP Server. Vui lòng kiểm tra lại URL và thông tin xác thực.')
        } finally {
            setSubmitting(false)
        }
    }

    const handleRefresh = async (id) => {
        setBusyId(id)
        setError('')
        setSuccess('')
        try {
            const { data } = await api.refreshMcpServer(id)
            setSuccess(`Đã làm mới "${data.name}" (${data.toolCount || data.actions?.length || 0} công cụ).`)
            await loadServers()
        } catch (e) {
            setError(e.response?.data?.message || 'Làm mới công cụ MCP thất bại.')
        } finally {
            setBusyId(null)
        }
    }

    const handleDelete = async (id, serverName) => {
        setBusyId(id)
        setError('')
        setSuccess('')
        try {
            await api.deleteMcpServer(id)
            setSuccess(`Đã gỡ kết nối MCP Server "${serverName}".`)
            await loadServers()
        } catch (e) {
            setError(e.response?.data?.message || 'Không xóa được MCP Server.')
        } finally {
            setBusyId(null)
        }
    }

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth='md'>
            <DialogTitle>
                <Stack direction='row' spacing={1} alignItems='center'>
                    <IconPlugConnected size={22} />
                    <Typography variant='h4'>Kết nối MCP Server (Workspace Tools)</Typography>
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5}>
                    <Alert severity='info'>
                        Đăng ký các MCP Server (Google Drive, Google Sheets/Excel, Word/OneDrive qua Pipedream/Composio, Slack, GitHub hoặc
                        API nội bộ) một lần tại đây. Bot thiết kế sẽ tự động nhìn thấy danh sách công cụ MCP đang hoạt động và tự gắn vào
                        bước Agent khi bạn mô tả yêu cầu bằng tiếng Việt. Token xác thực được mã hóa trên server và không bao giờ gửi ngược
                        về trình duyệt.
                    </Alert>

                    {error && <Alert severity='error'>{error}</Alert>}
                    {success && <Alert severity='success'>{success}</Alert>}

                    <Box>
                        <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1 }}>
                            MCP Server đã kết nối ({servers.length})
                        </Typography>
                        {loading ? (
                            <Typography variant='body2' color='textSecondary'>
                                Đang tải danh sách MCP Server…
                            </Typography>
                        ) : servers.length === 0 ? (
                            <Paper variant='outlined' sx={{ p: 2, bgcolor: 'background.default' }}>
                                <Typography variant='body2' color='textSecondary'>
                                    Chưa có MCP Server nào trong Workspace này. Thêm mới ở bên dưới để mở rộng khả năng thao tác file/ứng
                                    dụng ngoài cho Agent.
                                </Typography>
                            </Paper>
                        ) : (
                            <Stack spacing={1.25}>
                                {servers.map((srv) => (
                                    <Paper key={srv.id} variant='outlined' sx={{ p: 1.5 }}>
                                        <Stack direction='row' justifyContent='space-between' alignItems='flex-start' spacing={1}>
                                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                                <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                                                    <Typography fontWeight={600}>{srv.name}</Typography>
                                                    <Chip
                                                        size='small'
                                                        color={srv.status === 'AUTHORIZED' ? 'success' : 'error'}
                                                        label={
                                                            srv.status === 'AUTHORIZED'
                                                                ? `Sẵn sàng · ${srv.toolCount || srv.actions?.length || 0} tool`
                                                                : srv.status
                                                        }
                                                    />
                                                    {srv.hasCustomHeaders && (
                                                        <Chip size='small' variant='outlined' label='Đã mã hóa Auth Header' />
                                                    )}
                                                </Stack>
                                                <Typography variant='caption' color='textSecondary' sx={{ display: 'block', mt: 0.5 }}>
                                                    Endpoint: {srv.serverUrl}
                                                </Typography>
                                                {Array.isArray(srv.actions) && srv.actions.length > 0 && (
                                                    <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap sx={{ mt: 1 }}>
                                                        {srv.actions.slice(0, 12).map((act) => (
                                                            <Tooltip key={act.name} title={act.description || act.name}>
                                                                <Chip size='small' variant='outlined' label={act.name} />
                                                            </Tooltip>
                                                        ))}
                                                        {srv.actions.length > 12 && (
                                                            <Chip
                                                                size='small'
                                                                variant='outlined'
                                                                label={`+${srv.actions.length - 12} tool khác`}
                                                            />
                                                        )}
                                                    </Stack>
                                                )}
                                            </Box>
                                            <Stack direction='row' spacing={0.5}>
                                                <Tooltip title='Làm mới danh sách công cụ'>
                                                    <span>
                                                        <IconButton
                                                            size='small'
                                                            disabled={busyId === srv.id}
                                                            onClick={() => handleRefresh(srv.id)}
                                                        >
                                                            <IconRefresh size={18} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title='Gỡ kết nối MCP Server'>
                                                    <span>
                                                        <IconButton
                                                            size='small'
                                                            color='error'
                                                            disabled={busyId === srv.id}
                                                            onClick={() => handleDelete(srv.id, srv.name)}
                                                        >
                                                            <IconTrash size={18} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        </Stack>
                                    </Paper>
                                ))}
                            </Stack>
                        )}
                    </Box>

                    <Divider />

                    <Box>
                        <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1.5 }}>
                            Thêm kết nối MCP Server mới
                        </Typography>
                        <Stack spacing={1.5}>
                            <TextField
                                label='Tên gợi nhớ'
                                placeholder='Ví dụ: Google Drive & Sheets, Word/OneDrive, Slack nội bộ...'
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                size='small'
                                fullWidth
                            />
                            <TextField
                                label='URL MCP Server (Streamable HTTP hoặc SSE)'
                                placeholder='https://mcp.pipedream.net/... hoặc https://mcp.company.vn/mcp'
                                value={serverUrl}
                                onChange={(e) => setServerUrl(e.target.value)}
                                size='small'
                                fullWidth
                            />
                            <TextField
                                label='Bearer Token / API Key (tùy chọn)'
                                type='password'
                                autoComplete='new-password'
                                value={bearerToken}
                                onChange={(e) => setBearerToken(e.target.value)}
                                helperText='Chỉ ghi một chiều lên server và lưu mã hóa. Để trống nếu URL đã kèm xác thực hoặc không yêu cầu token.'
                                size='small'
                                fullWidth
                            />
                            <TextField
                                label='Custom Headers JSON nâng cao (tùy chọn)'
                                placeholder='{"X-Api-Key": "..."}'
                                value={customHeadersText}
                                onChange={(e) => setCustomHeadersText(e.target.value)}
                                size='small'
                                fullWidth
                            />
                            <Box>
                                <Button
                                    variant='contained'
                                    startIcon={<IconPlus size={18} />}
                                    disabled={submitting || !name.trim() || !serverUrl.trim()}
                                    onClick={handleCreate}
                                >
                                    {submitting ? 'Đang kết nối & quét công cụ…' : 'Kết nối & Quét công cụ MCP'}
                                </Button>
                            </Box>
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Đóng</Button>
            </DialogActions>
        </Dialog>
    )
}

McpServersDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onChanged: PropTypes.func
}
