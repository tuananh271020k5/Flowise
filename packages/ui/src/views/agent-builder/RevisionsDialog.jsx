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
    Paper
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconHistory, IconGitCommit } from '@tabler/icons-react'
import moment from 'moment'

const RevisionsDialog = ({ open, onClose, revisions = [] }) => {
    const theme = useTheme()

    return (
        <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
            <DialogTitle>
                <Stack direction='row' alignItems='center' spacing={1}>
                    <IconHistory size={22} color={theme.palette.primary.main} />
                    <Typography variant='h4' sx={{ fontWeight: 600 }}>
                        Lịch sử Phiên bản Spec ({revisions.length})
                    </Typography>
                </Stack>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 2 }}>
                {revisions.length === 0 ? (
                    <Typography variant='body2' color='textSecondary' align='center' sx={{ py: 4 }}>
                        Chưa có lịch sử phiên bản nào.
                    </Typography>
                ) : (
                    <List disablePadding>
                        {revisions.map((rev) => (
                            <Paper
                                key={rev.id || rev.revisionNumber}
                                variant='outlined'
                                sx={{
                                    mb: 2,
                                    p: 2,
                                    borderRadius: 2,
                                    borderColor: theme.palette.divider
                                }}
                            >
                                <ListItem disableGutters disablePadding sx={{ alignItems: 'flex-start' }}>
                                    <ListItemText
                                        primary={
                                            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                                                <IconGitCommit size={18} color={theme.palette.primary.main} />
                                                <Chip
                                                    label={`Revision v${rev.revisionNumber}`}
                                                    color='primary'
                                                    size='small'
                                                    sx={{ fontWeight: 600 }}
                                                />
                                                <Typography variant='caption' color='textSecondary'>
                                                    {rev.createdAt ? moment(rev.createdAt).format('DD/MM/YYYY HH:mm:ss') : ''}
                                                </Typography>
                                                {rev.author && (
                                                    <Typography variant='caption' color='textSecondary'>
                                                        • Tác giả: {rev.author}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        }
                                        secondary={
                                            <Box sx={{ mt: 1 }}>
                                                <Typography variant='body2' sx={{ fontWeight: 600, mb: 0.5 }}>
                                                    Tóm tắt thay đổi:
                                                </Typography>
                                                <Typography variant='body2' color='textSecondary' sx={{ mb: 1.5 }}>
                                                    {rev.changeSummary || 'Cập nhật cấu hình Agent Spec'}
                                                </Typography>
                                                <Box
                                                    sx={{
                                                        p: 1.5,
                                                        borderRadius: 1,
                                                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#f8f9fa',
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.75rem',
                                                        overflowX: 'auto',
                                                        maxHeight: 180
                                                    }}
                                                >
                                                    <pre style={{ margin: 0 }}>{JSON.stringify(rev.spec, null, 2)}</pre>
                                                </Box>
                                            </Box>
                                        }
                                    />
                                </ListItem>
                            </Paper>
                        ))}
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
    revisions: PropTypes.array
}

export default RevisionsDialog
