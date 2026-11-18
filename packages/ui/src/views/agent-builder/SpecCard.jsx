import PropTypes from 'prop-types'
import {
    Box,
    Card,
    CardContent,
    CardHeader,
    Chip,
    Divider,
    Stack,
    Typography,
    Alert,
    AlertTitle,
    IconButton,
    Tooltip,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Button
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
    IconCheck,
    IconClock,
    IconAlertCircle,
    IconHistory,
    IconRobot,
    IconTarget,
    IconLanguage,
    IconCpu,
    IconListDetails,
    IconSparkles,
    IconTool
} from '@tabler/icons-react'

// Bản đồ dịch tên trường thiếu sang tiếng Việt thân thiện
const FIELD_LABELS = {
    workflow: 'Kế hoạch các bước, nguồn dữ liệu và kết nối',
    dataSources: 'Tài liệu làm nguồn cho Agent',
    name: 'Tên Trợ lý (cần định danh rõ ràng)',
    goal: 'Mục tiêu chính (mô tả mục đích hoạt động)',
    instructions: 'Hướng dẫn vận hành chi tiết (system prompt)',
    model: 'Mô hình AI (provider và tên model)',
    outputExpectations: 'Kỳ vọng kết quả đầu ra',
    evaluationExamples: 'Kịch bản mẫu để kiểm thử đánh giá'
}

const SpecCard = ({ spec, readiness, revisionNumber, onOpenRevisions, onGenerateAgentflow }) => {
    const theme = useTheme()

    const isReady = readiness?.buildReady || readiness?.status === 'ready'
    const status = readiness?.status || 'collecting'
    const missingFields = readiness?.missingFields || []

    const getStatusChip = () => {
        if (isReady) {
            return <Chip icon={<IconCheck size={16} />} label='Sẵn sàng tạo Agent' color='success' size='small' sx={{ fontWeight: 600 }} />
        }
        if (status === 'error') {
            return <Chip icon={<IconAlertCircle size={16} />} label='Thiếu thông tin' color='error' size='small' sx={{ fontWeight: 600 }} />
        }
        return <Chip icon={<IconClock size={16} />} label='Đang thu thập' color='warning' size='small' sx={{ fontWeight: 600 }} />
    }

    return (
        <Card
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.palette.mode === 'dark' ? '0 2px 14px 0 rgba(0,0,0,0.4)' : '0 2px 14px 0 rgba(32,40,45,0.08)',
                background: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff'
            }}
        >
            <CardHeader
                title={
                    <Stack direction='row' alignItems='center' spacing={1}>
                        <IconRobot size={22} color={theme.palette.primary.main} />
                        <Typography variant='h4' sx={{ fontWeight: 600 }}>
                            Cấu hình Agent (Spec)
                        </Typography>
                    </Stack>
                }
                action={
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <Chip label={`v${revisionNumber || 1}`} variant='outlined' size='small' sx={{ fontWeight: 600 }} />
                        {onOpenRevisions && (
                            <Tooltip title='Xem lịch sử phiên bản'>
                                <IconButton size='small' onClick={onOpenRevisions}>
                                    <IconHistory size={18} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                }
                sx={{ pb: 1 }}
            />
            <Divider />

            <CardContent sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                {/* Trạng thái sẵn sàng và thanh tiến trình */}
                <Box sx={{ mb: 2.5 }}>
                    <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mb: 1 }}>
                        <Typography variant='subtitle2' color='textSecondary'>
                            Trạng thái yêu cầu:
                        </Typography>
                        <Stack direction='row' spacing={1} alignItems='center'>
                            {getStatusChip()}
                        </Stack>
                    </Stack>
                </Box>

                {/* Cảnh báo các trường còn thiếu (Missing Fields) */}
                {missingFields.length > 0 && (
                    <Alert severity='warning' sx={{ mb: 2.5, borderRadius: 1.5 }}>
                        <AlertTitle sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            Thông tin cần bổ sung ({missingFields.length})
                        </AlertTitle>
                        <List dense disablePadding>
                            {missingFields.map((field) => (
                                <ListItem key={field} disableGutters sx={{ py: 0.25 }}>
                                    <ListItemIcon sx={{ minWidth: 20 }}>
                                        <IconAlertCircle size={14} color={theme.palette.warning.dark} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={FIELD_LABELS[field] || field}
                                        primaryTypographyProps={{ variant: 'body2', fontSize: '0.8125rem' }}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Alert>
                )}

                {/* Chi tiết Spec tóm tắt */}
                <Stack spacing={2}>
                    {/* Tên Agent */}
                    <Box>
                        <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                            <IconRobot size={16} color={theme.palette.text.secondary} />
                            <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                Tên Trợ lý
                            </Typography>
                        </Stack>
                        <Typography variant='body1' sx={{ fontWeight: 600, color: spec?.name ? 'textPrimary' : 'text.disabled' }}>
                            {spec?.name || 'Chưa đặt tên'}
                        </Typography>
                    </Box>

                    {/* Mục tiêu */}
                    <Box>
                        <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                            <IconTarget size={16} color={theme.palette.text.secondary} />
                            <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                Mục tiêu hoạt động
                            </Typography>
                        </Stack>
                        <Typography variant='body2' sx={{ color: spec?.goal ? 'textPrimary' : 'text.disabled' }}>
                            {spec?.goal || 'Đang trao đổi để xác định mục tiêu...'}
                        </Typography>
                    </Box>

                    {/* Ngôn ngữ & Model */}
                    <Stack direction='row' spacing={2}>
                        <Box sx={{ flex: 1 }}>
                            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                                <IconLanguage size={16} color={theme.palette.text.secondary} />
                                <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                    Ngôn ngữ
                                </Typography>
                            </Stack>
                            <Typography variant='body2'>{spec?.language === 'vi' ? 'Tiếng Việt (vi)' : spec?.language || 'vi'}</Typography>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                                <IconCpu size={16} color={theme.palette.text.secondary} />
                                <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                    Mô hình
                                </Typography>
                            </Stack>
                            <Typography variant='body2'>
                                {spec?.model?.name
                                    ? `${spec.model.provider || 'OpenAI'} / ${spec.model.name}`
                                    : 'Theo Cấu hình model của workspace'}
                            </Typography>
                        </Box>
                    </Stack>

                    {/* Kết quả kỳ vọng */}
                    {spec?.outputExpectations && spec.outputExpectations.length > 0 && (
                        <Box>
                            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                                <IconListDetails size={16} color={theme.palette.text.secondary} />
                                <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                    Kết quả kỳ vọng ({spec.outputExpectations.length})
                                </Typography>
                            </Stack>
                            <List dense disablePadding sx={{ pl: 1 }}>
                                {spec.outputExpectations.map((exp, idx) => (
                                    <ListItem key={idx} disableGutters sx={{ py: 0.2 }}>
                                        <ListItemText
                                            primary={`• ${exp}`}
                                            primaryTypographyProps={{ variant: 'body2', fontSize: '0.8125rem' }}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}

                    {/* Công cụ đã chọn */}
                    {spec?.tools && spec.tools.length > 0 && (
                        <Box>
                            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                                <IconTool size={16} color={theme.palette.text.secondary} />
                                <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                    Công cụ ({spec.tools.length})
                                </Typography>
                            </Stack>
                            <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap>
                                {spec.tools.map((tool, idx) => (
                                    <Chip
                                        key={idx}
                                        label={typeof tool === 'string' ? tool : tool.name}
                                        size='small'
                                        variant='outlined'
                                        sx={{ my: 0.25 }}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    )}

                    {/* Kịch bản mẫu kiểm thử */}
                    {spec?.evaluationExamples && spec.evaluationExamples.length > 0 && (
                        <Box>
                            <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                Kịch bản kiểm thử: {spec.evaluationExamples.length} ví dụ
                            </Typography>
                        </Box>
                    )}
                </Stack>
            </CardContent>

            {/* Nút Tạo Agentflow khi cấu hình đã sẵn sàng */}
            {isReady && onGenerateAgentflow && (
                <>
                    <Divider />
                    <Box sx={{ p: 2 }}>
                        <Button
                            variant='contained'
                            color='success'
                            fullWidth
                            startIcon={<IconSparkles size={18} />}
                            onClick={onGenerateAgentflow}
                            sx={{ fontWeight: 600, py: 1 }}
                        >
                            Tạo Agentflow V2 Ngay
                        </Button>
                    </Box>
                </>
            )}
        </Card>
    )
}

SpecCard.propTypes = {
    spec: PropTypes.object,
    readiness: PropTypes.object,
    revisionNumber: PropTypes.number,
    onOpenRevisions: PropTypes.func,
    onGenerateAgentflow: PropTypes.func
}

export default SpecCard
