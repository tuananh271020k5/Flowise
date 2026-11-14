import { useState } from 'react'
import PropTypes from 'prop-types'
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    List,
    ListItem,
    ListItemText,
    Typography,
    Box,
    Chip,
    Stack,
    Divider,
    Paper,
    CircularProgress,
    Alert,
    IconButton,
    Tooltip
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconHistory, IconGitCommit, IconRotateClockwise2, IconArrowsDiff, IconCheck, IconArrowLeft } from '@tabler/icons-react'
import moment from 'moment'
import agentBuilderApi from '../../api/agentBuilder'

const RevisionsDialog = ({ open, onClose, revisions = [], currentRevisionNumber = 1, sessionId, onRollback }) => {
    const theme = useTheme()
    const [diffViewRev, setDiffViewRev] = useState(null)
    const [diffResult, setDiffResult] = useState(null)
    const [isLoadingDiff, setIsLoadingDiff] = useState(false)
    const [isRollingBack, setIsRollingBack] = useState(false)
    const [error, setError] = useState(null)

    // Sắp xếp revisions từ mới nhất đến cũ nhất
    const sortedRevisions = [...revisions].sort((a, b) => (b.revisionNo || b.revisionNumber || 0) - (a.revisionNo || a.revisionNumber || 0))

    // Xử lý xem Diff của một revision so với revision liền trước nó
    const handleViewDiff = async (rev) => {
        if (!sessionId) return
        setDiffViewRev(rev)
        setIsLoadingDiff(true)
        setError(null)
        setDiffResult(null)

        try {
            const currentRevNo = rev.revisionNo || rev.revisionNumber
            // Tìm revision liền trước trong danh sách
            const prevRev = sortedRevisions.find((r) => (r.revisionNo || r.revisionNumber) < currentRevNo)
            const rev1Id = prevRev ? prevRev.id : null
            const rev2Id = rev.id

            const res = await agentBuilderApi.getDiff(sessionId, { rev1: rev1Id, rev2: rev2Id })
            setDiffResult(res.data)
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi tải dữ liệu so sánh diff:', err)
            setError(err?.response?.data?.message || 'Không thể tải so sánh phiên bản.')
        } finally {
            setIsLoadingDiff(false)
        }
    }

    const handleBackToList = () => {
        setDiffViewRev(null)
        setDiffResult(null)
        setError(null)
    }

    const handleExecuteRollback = async (rev) => {
        if (!onRollback || isRollingBack) return
        setIsRollingBack(true)
        setError(null)
        try {
            await onRollback(rev.id, rev.revisionNo || rev.revisionNumber)
            onClose()
        } catch (err) {
            setError(err?.response?.data?.message || 'Khôi phục phiên bản thất bại.')
        } finally {
            setIsRollingBack(false)
        }
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
            <DialogTitle>
                <Stack direction='row' alignItems='center' justifyContent='space-between'>
                    <Stack direction='row' alignItems='center' spacing={1}>
                        {diffViewRev ? (
                            <Tooltip title='Quay lại danh sách'>
                                <IconButton size='small' onClick={handleBackToList}>
                                    <IconArrowLeft size={20} />
                                </IconButton>
                            </Tooltip>
                        ) : (
                            <IconHistory size={22} color={theme.palette.primary.main} />
                        )}
                        <Typography variant='h4' sx={{ fontWeight: 600 }}>
                            {diffViewRev
                                ? `So sánh Revision v${diffViewRev.revisionNo || diffViewRev.revisionNumber}`
                                : `Lịch sử Phiên bản Spec (${revisions.length})`}
                        </Typography>
                    </Stack>
                    {diffViewRev && (
                        <Button
                            variant='outlined'
                            color='warning'
                            size='small'
                            startIcon={<IconRotateClockwise2 size={16} />}
                            disabled={isRollingBack}
                            onClick={() => handleExecuteRollback(diffViewRev)}
                        >
                            Khôi phục bản này
                        </Button>
                    )}
                </Stack>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 2, minHeight: 300 }}>
                {error && (
                    <Alert severity='error' sx={{ mb: 2 }} onClose={() => setError(null)}>
                        {error}
                    </Alert>
                )}

                {/* Chế độ xem Diff chi tiết */}
                {diffViewRev ? (
                    <Box>
                        {isLoadingDiff ? (
                            <Stack alignItems='center' justifyContent='center' sx={{ py: 6 }} spacing={1}>
                                <CircularProgress size={32} />
                                <Typography variant='body2' color='textSecondary'>
                                    Đang tính toán so sánh diff...
                                </Typography>
                            </Stack>
                        ) : diffResult ? (
                            <Stack spacing={2}>
                                <Paper variant='outlined' sx={{ p: 2, borderRadius: 2, bgcolor: theme.palette.background.default }}>
                                    <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1 }}>
                                        Tóm tắt các thay đổi ({diffResult.summary?.length || 0}):
                                    </Typography>
                                    <List dense disablePadding>
                                        {diffResult.summary?.map((sum, idx) => (
                                            <ListItem key={idx} disableGutters sx={{ py: 0.25 }}>
                                                <ListItemText
                                                    primary={`• ${sum}`}
                                                    primaryTypographyProps={{
                                                        variant: 'body2',
                                                        color: diffResult.hasChanges ? 'textPrimary' : 'textSecondary'
                                                    }}
                                                />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Paper>

                                {/* Chi tiết tên */}
                                {diffResult.name?.changed && (
                                    <Paper variant='outlined' sx={{ p: 1.5, borderRadius: 1.5 }}>
                                        <Typography variant='body2' sx={{ fontWeight: 600, mb: 0.5 }}>
                                            Tên trợ lý:
                                        </Typography>
                                        <Stack direction='row' spacing={1} alignItems='center'>
                                            <Typography
                                                variant='body2'
                                                sx={{ textDecoration: 'line-through', color: 'error.main', bgcolor: '#fee2e2', px: 0.8 }}
                                            >
                                                {diffResult.name.from || '(Trống)'}
                                            </Typography>
                                            <Typography variant='body2'>→</Typography>
                                            <Typography variant='body2' sx={{ color: 'success.main', bgcolor: '#dcfce7', px: 0.8 }}>
                                                {diffResult.name.to || '(Trống)'}
                                            </Typography>
                                        </Stack>
                                    </Paper>
                                )}

                                {/* Chi tiết Tools */}
                                {diffResult.tools?.changed && (
                                    <Paper variant='outlined' sx={{ p: 1.5, borderRadius: 1.5 }}>
                                        <Typography variant='body2' sx={{ fontWeight: 600, mb: 0.5 }}>
                                            Công cụ (Tools):
                                        </Typography>
                                        <Stack direction='row' spacing={1} flexWrap='wrap'>
                                            {diffResult.tools.added?.map((t) => (
                                                <Chip key={t} label={`+ ${t}`} color='success' size='small' sx={{ my: 0.5 }} />
                                            ))}
                                            {diffResult.tools.removed?.map((t) => (
                                                <Chip key={t} label={`- ${t}`} color='error' size='small' sx={{ my: 0.5 }} />
                                            ))}
                                            {diffResult.tools.unchanged?.map((t) => (
                                                <Chip key={t} label={t} variant='outlined' size='small' sx={{ my: 0.5 }} />
                                            ))}
                                        </Stack>
                                    </Paper>
                                )}

                                {/* Nội dung JSON raw của spec */}
                                <Box>
                                    <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600 }}>
                                        Đặc tả JSON nguyên bản của phiên bản này:
                                    </Typography>
                                    <Box
                                        sx={{
                                            mt: 0.5,
                                            p: 1.5,
                                            borderRadius: 1,
                                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#f8f9fa',
                                            fontFamily: 'monospace',
                                            fontSize: '0.75rem',
                                            overflowX: 'auto',
                                            maxHeight: 200
                                        }}
                                    >
                                        <pre style={{ margin: 0 }}>
                                            {typeof diffViewRev.spec === 'string'
                                                ? JSON.stringify(JSON.parse(diffViewRev.spec), null, 2)
                                                : JSON.stringify(diffViewRev.spec, null, 2)}
                                        </pre>
                                    </Box>
                                </Box>
                            </Stack>
                        ) : null}
                    </Box>
                ) : (
                    /* Danh sách tất cả các Revisions */
                    <List disablePadding>
                        {sortedRevisions.length === 0 ? (
                            <Typography variant='body2' color='textSecondary' align='center' sx={{ py: 4 }}>
                                Chưa có lịch sử phiên bản nào.
                            </Typography>
                        ) : (
                            sortedRevisions.map((rev) => {
                                const revNo = rev.revisionNo || rev.revisionNumber
                                const isCurrent = revNo === currentRevisionNumber

                                return (
                                    <Paper
                                        key={rev.id || revNo}
                                        variant='outlined'
                                        sx={{
                                            mb: 1.5,
                                            p: 2,
                                            borderRadius: 2,
                                            borderColor: isCurrent ? theme.palette.primary.main : theme.palette.divider,
                                            bgcolor: isCurrent
                                                ? theme.palette.mode === 'dark'
                                                    ? 'rgba(30, 58, 138, 0.15)'
                                                    : '#f0fdf4'
                                                : 'inherit'
                                        }}
                                    >
                                        <ListItem disableGutters disablePadding sx={{ alignItems: 'flex-start' }}>
                                            <ListItemText
                                                primary={
                                                    <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 1 }}>
                                                        <Stack direction='row' alignItems='center' spacing={1}>
                                                            <IconGitCommit
                                                                size={18}
                                                                color={isCurrent ? theme.palette.success.main : theme.palette.primary.main}
                                                            />
                                                            <Chip
                                                                label={`Revision v${revNo}`}
                                                                color={isCurrent ? 'success' : 'primary'}
                                                                size='small'
                                                                sx={{ fontWeight: 600 }}
                                                            />
                                                            {isCurrent && (
                                                                <Chip
                                                                    icon={<IconCheck size={14} />}
                                                                    label='Hiện tại'
                                                                    color='success'
                                                                    variant='outlined'
                                                                    size='small'
                                                                />
                                                            )}
                                                            <Typography variant='caption' color='textSecondary'>
                                                                {rev.createdAt
                                                                    ? moment(rev.createdAt).format('DD/MM/YYYY HH:mm:ss')
                                                                    : rev.createdDate
                                                                    ? moment(rev.createdDate).format('DD/MM/YYYY HH:mm:ss')
                                                                    : ''}
                                                            </Typography>
                                                        </Stack>
                                                        <Stack direction='row' spacing={1}>
                                                            <Button
                                                                size='small'
                                                                variant='text'
                                                                startIcon={<IconArrowsDiff size={16} />}
                                                                onClick={() => handleViewDiff(rev)}
                                                            >
                                                                So sánh (Diff)
                                                            </Button>
                                                            {!isCurrent && (
                                                                <Button
                                                                    size='small'
                                                                    variant='outlined'
                                                                    color='warning'
                                                                    disabled={isRollingBack}
                                                                    startIcon={<IconRotateClockwise2 size={16} />}
                                                                    onClick={() => handleExecuteRollback(rev)}
                                                                >
                                                                    Khôi phục
                                                                </Button>
                                                            )}
                                                        </Stack>
                                                    </Stack>
                                                }
                                                secondary={
                                                    <Box sx={{ mt: 0.5 }}>
                                                        <Typography variant='body2' color='textSecondary'>
                                                            {rev.patchReason || rev.changeSummary || 'Cập nhật cấu hình Agent Spec'}
                                                        </Typography>
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                    </Paper>
                                )
                            })
                        )}
                    </List>
                )}
            </DialogContent>
            <Divider />
            <DialogActions sx={{ px: 3, py: 1.5 }}>
                <Button onClick={onClose} color='inherit'>
                    Đóng
                </Button>
            </DialogActions>
        </Dialog>
    )
}

RevisionsDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    revisions: PropTypes.array,
    currentRevisionNumber: PropTypes.number,
    sessionId: PropTypes.string,
    onRollback: PropTypes.func
}

export default RevisionsDialog
