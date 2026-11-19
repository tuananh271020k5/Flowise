import PropTypes from 'prop-types'
import {
    Box,
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

const ARCHETYPE_LABELS = {
    conversational_cskh: 'Trợ lý Tư vấn / CSKH',
    knowledge_rag: 'Hỏi đáp Tài liệu (RAG)',
    agentic_rag: 'Tài liệu Tự kiểm chứng (Agentic RAG)',
    router_triage: 'Phân loại & Điều phối Đa nhánh',
    sequential_pipeline: 'Chuỗi Xử lý Đa bước',
    batch_iteration: 'Xử lý Hàng loạt Danh sách',
    mcp_api_automation: 'Tự động hóa MCP / API Ngoài',
    sql_human_governance: 'Truy vấn SQL & Phê duyệt Con người'
}

// Bản đồ dịch tên trường thiếu sang tiếng Việt thân thiện
const FIELD_LABELS = {
    workflow: 'Kế hoạch các bước, nguồn dữ liệu và kết nối',
    dataSources: 'Tài liệu làm nguồn cho Agent',
    mcpServers: 'Kết nối MCP Server được cấp quyền trong Workspace',
    apiConnectors: 'Kết nối API Connector trong Workspace',
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
        <Box
            sx={{
                height: '100%',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'transparent'
            }}
        >
            <Box
                sx={{
                    px: 2,
                    py: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${theme.palette.divider}`
                }}
            >
                <Stack direction='row' alignItems='center' spacing={1}>
                    {getStatusChip()}
                    <Chip label={`v${revisionNumber || 1}`} variant='outlined' size='small' sx={{ height: 22, fontWeight: 600 }} />
                </Stack>
                {onOpenRevisions && (
                    <Tooltip title='Xem lịch sử phiên bản'>
                        <IconButton size='small' onClick={onOpenRevisions}>
                            <IconHistory size={18} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
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
                    {spec?.workflow?.archetype && ARCHETYPE_LABELS[spec.workflow.archetype] && (
                        <Box>
                            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                                <IconSparkles size={16} color={theme.palette.primary.main} />
                                <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                    Dòng Agent đã nhận diện
                                </Typography>
                            </Stack>
                            <Chip
                                size='small'
                                color='primary'
                                variant='outlined'
                                label={ARCHETYPE_LABELS[spec.workflow.archetype]}
                                sx={{ fontWeight: 600 }}
                            />
                        </Box>
                    )}

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

                    {/* Kết nối MCP Server đã gắn */}
                    {spec?.mcpServers && spec.mcpServers.length > 0 && (
                        <Box>
                            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                                <IconTool size={16} color={theme.palette.text.secondary} />
                                <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                                    MCP Tools ({spec.mcpServers.length})
                                </Typography>
                            </Stack>
                            <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap>
                                {spec.mcpServers.map((mcp, idx) => (
                                    <Chip
                                        key={mcp.id || idx}
                                        label={`${mcp.name} (${Array.isArray(mcp.actions) ? mcp.actions.length : 0} tool)`}
                                        size='small'
                                        color='primary'
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
            </Box>

            {/* Nút Tạo Agent khi cấu hình đã sẵn sàng */}
            {isReady && onGenerateAgentflow && (
                <>
                    <Divider />
                    <Box sx={{ p: 1.5 }}>
                        <Button
                            variant='contained'
                            color='success'
                            fullWidth
                            startIcon={<IconSparkles size={18} />}
                            onClick={onGenerateAgentflow}
                            sx={{ fontWeight: 600, py: 0.9, textTransform: 'none', borderRadius: 2 }}
                        >
                            Biên dịch & Tạo Agent Ngay
                        </Button>
                    </Box>
                </>
            )}
        </Box>
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
