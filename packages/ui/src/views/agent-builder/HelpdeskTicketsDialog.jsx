import { useEffect, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material'
import { IconRefresh, IconX } from '@tabler/icons-react'
import agentBuilderApi from '@/api/agentBuilder'

const STATUS_OPTIONS = ['Mới tiếp nhận', 'Đang xử lý', 'Chờ khách phản hồi', 'Đã giải quyết', 'Đã đóng']

const GROUP_OPTIONS = ['Đội Kỹ thuật L2/L3', 'Phòng Kế toán & Thanh toán', 'Đội Bảo mật & Tài khoản', 'Tổ Chăm sóc Khách hàng Cao cấp']

const priorityColor = (priority) => {
    if (priority === 'P0') return 'error'
    if (priority === 'P1') return 'warning'
    if (priority === 'P2') return 'info'
    return 'default'
}

const statusColor = (status) => {
    if (status === 'Đã giải quyết' || status === 'Đã đóng') return 'success'
    if (status === 'Đang xử lý') return 'primary'
    if (status === 'Chờ khách phản hồi') return 'warning'
    return 'default'
}

const formatIso = (iso) => {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
    } catch {
        return iso
    }
}

const HelpdeskTicketsDialog = ({ open, onClose }) => {
    const [tickets, setTickets] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [draftEdits, setDraftEdits] = useState({})
    const [savingId, setSavingId] = useState('')

    const fetchTickets = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const res = await agentBuilderApi.listHelpdeskTickets()
            const items = Array.isArray(res.data?.tickets) ? res.data.tickets : []
            setTickets(items)
            setDraftEdits((prev) => {
                const next = { ...prev }
                for (const t of items) {
                    if (!next[t.ticketId]) {
                        next[t.ticketId] = { status: t.status, assignedGroup: t.assignedGroup, note: '' }
                    }
                }
                return next
            })
        } catch (err) {
            setError(err?.response?.data?.message || 'Không thể tải danh sách phiếu hỗ trợ CSKH.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (open) fetchTickets()
    }, [open, fetchTickets])

    const handleSaveTicket = async (ticketId) => {
        const edit = draftEdits[ticketId]
        if (!edit) return
        setSavingId(ticketId)
        setError('')
        try {
            const res = await agentBuilderApi.updateHelpdeskTicket(ticketId, {
                status: edit.status,
                assignedGroup: edit.assignedGroup,
                note: edit.note
            })
            const updated = res.data?.ticket
            if (updated) {
                setTickets((prev) => prev.map((t) => (t.ticketId === ticketId ? updated : t)))
                setDraftEdits((prev) => ({
                    ...prev,
                    [ticketId]: { status: updated.status, assignedGroup: updated.assignedGroup, note: '' }
                }))
            }
        } catch (err) {
            setError(err?.response?.data?.message || `Không thể cập nhật phiếu ${ticketId}.`)
        } finally {
            setSavingId('')
        }
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant='h4' sx={{ fontWeight: 700 }}>
                        Hàng Đợi Phiếu Hỗ Trợ CSKH (Admin L3)
                    </Typography>
                    <Typography variant='caption' color='textSecondary'>
                        Theo dõi phiếu Ticket khách hàng gửi từ Cổng User, cập nhật trạng thái và ghi chú phản hồi theo thời gian thực
                    </Typography>
                </Box>
                <Stack direction='row' spacing={1} alignItems='center'>
                    <Button size='small' variant='outlined' startIcon={<IconRefresh size={16} />} onClick={fetchTickets} disabled={loading}>
                        Làm mới
                    </Button>
                    <IconButton size='small' onClick={onClose}>
                        <IconX size={18} />
                    </IconButton>
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                {error && (
                    <Alert severity='error' sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}
                {loading && tickets.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                        <CircularProgress size={28} />
                    </Box>
                ) : tickets.length === 0 ? (
                    <Alert severity='info'>
                        Chưa có phiếu hỗ trợ CSKH nào trong Workspace này. Khi khách hàng báo lỗi ở tầng L3 trên Cổng User (hoặc Chat Thử
                        Nghiệm), phiếu TCK-... sẽ xuất hiện ngay tại đây.
                    </Alert>
                ) : (
                    <Stack spacing={2}>
                        {tickets.map((t) => {
                            const edit = draftEdits[t.ticketId] || { status: t.status, assignedGroup: t.assignedGroup, note: '' }
                            return (
                                <Paper key={t.ticketId} variant='outlined' sx={{ p: 2, borderRadius: 2 }}>
                                    <Stack
                                        direction='row'
                                        justifyContent='space-between'
                                        alignItems='flex-start'
                                        spacing={1}
                                        flexWrap='wrap'
                                        useFlexGap
                                    >
                                        <Box>
                                            <Stack
                                                direction='row'
                                                spacing={0.75}
                                                alignItems='center'
                                                flexWrap='wrap'
                                                useFlexGap
                                                sx={{ mb: 0.5 }}
                                            >
                                                <Chip label={t.ticketId} size='small' color='primary' sx={{ fontWeight: 700 }} />
                                                <Chip
                                                    label={t.priority}
                                                    size='small'
                                                    color={priorityColor(t.priority)}
                                                    variant='outlined'
                                                />
                                                <Chip label={t.category} size='small' variant='outlined' />
                                                <Chip label={t.status} size='small' color={statusColor(t.status)} />
                                            </Stack>
                                            <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
                                                {t.title}
                                            </Typography>
                                        </Box>
                                        <Typography variant='caption' color='textSecondary'>
                                            Tạo lúc: {formatIso(t.createdAt)} · Hạn SLA ({t.slaHours}h): {formatIso(t.slaDeadline)}
                                        </Typography>
                                    </Stack>

                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
                                        <Typography variant='caption' color='textSecondary'>
                                            <strong>Khách hàng:</strong> {t.customerName} ({t.customerContact})
                                        </Typography>
                                        <Typography variant='caption' color='textSecondary'>
                                            <strong>Nhóm tiếp nhận:</strong> {t.assignedGroup}
                                        </Typography>
                                    </Stack>

                                    <Box sx={{ mt: 1.25, p: 1.25, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                                        <Typography variant='caption' sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
                                            Ngữ cảnh hội thoại khách hàng:
                                        </Typography>
                                        <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>
                                            {t.contextSummary}
                                        </Typography>
                                        {(t.expectedResult || t.actualResult) && (
                                            <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                                                {t.expectedResult && (
                                                    <Typography variant='caption'>
                                                        <strong>Mong đợi:</strong> {t.expectedResult}
                                                    </Typography>
                                                )}
                                                {t.actualResult && (
                                                    <Typography variant='caption'>
                                                        <strong>Thực tế:</strong> {t.actualResult}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        )}
                                    </Box>

                                    {Array.isArray(t.notes) && t.notes.length > 0 && (
                                        <Box sx={{ mt: 1.25 }}>
                                            <Typography variant='caption' sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                                                Lịch sử cập nhật ({t.notes.length}):
                                            </Typography>
                                            <Stack spacing={0.5}>
                                                {t.notes.map((n, idx) => (
                                                    <Typography key={idx} variant='caption' color='textSecondary'>
                                                        • [{formatIso(n.at)}] <strong>{n.author}:</strong> {n.content}
                                                    </Typography>
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    <Divider sx={{ my: 1.5 }} />

                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }}>
                                        <FormControl size='small' sx={{ minWidth: 170 }}>
                                            <InputLabel>Trạng thái</InputLabel>
                                            <Select
                                                label='Trạng thái'
                                                value={edit.status}
                                                onChange={(e) =>
                                                    setDraftEdits((prev) => ({
                                                        ...prev,
                                                        [t.ticketId]: { ...edit, status: e.target.value }
                                                    }))
                                                }
                                            >
                                                {STATUS_OPTIONS.map((opt) => (
                                                    <MenuItem key={opt} value={opt}>
                                                        {opt}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <FormControl size='small' sx={{ minWidth: 210 }}>
                                            <InputLabel>Nhóm xử lý</InputLabel>
                                            <Select
                                                label='Nhóm xử lý'
                                                value={GROUP_OPTIONS.includes(edit.assignedGroup) ? edit.assignedGroup : GROUP_OPTIONS[3]}
                                                onChange={(e) =>
                                                    setDraftEdits((prev) => ({
                                                        ...prev,
                                                        [t.ticketId]: { ...edit, assignedGroup: e.target.value }
                                                    }))
                                                }
                                            >
                                                {GROUP_OPTIONS.map((grp) => (
                                                    <MenuItem key={grp} value={grp}>
                                                        {grp}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <TextField
                                            size='small'
                                            fullWidth
                                            label='Ghi chú phản hồi cho khách / nội bộ'
                                            placeholder='Ví dụ: Đã kiểm tra tài khoản và khôi phục quyền truy cập...'
                                            value={edit.note}
                                            onChange={(e) =>
                                                setDraftEdits((prev) => ({
                                                    ...prev,
                                                    [t.ticketId]: { ...edit, note: e.target.value }
                                                }))
                                            }
                                        />
                                        <Button
                                            size='small'
                                            variant='contained'
                                            disabled={savingId === t.ticketId}
                                            onClick={() => handleSaveTicket(t.ticketId)}
                                            sx={{ whiteSpace: 'nowrap', px: 2 }}
                                        >
                                            {savingId === t.ticketId ? 'Đang lưu...' : 'Cập nhật'}
                                        </Button>
                                    </Stack>
                                </Paper>
                            )
                        })}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Đóng</Button>
            </DialogActions>
        </Dialog>
    )
}

HelpdeskTicketsDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
}

export default HelpdeskTicketsDialog
