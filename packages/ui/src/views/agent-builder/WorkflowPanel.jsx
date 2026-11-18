import PropTypes from 'prop-types'
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material'

const TYPES = { llm: 'LLM', agent: 'Agent', retriever: 'Tìm tài liệu', condition: 'Điều kiện', reply: 'Trả lời', external: 'Cần tích hợp' }
export default function WorkflowPanel({ workflow, readiness, buildStatus }) {
    if (!workflow)
        return (
            <Alert severity='info'>
                Mô tả mục tiêu, đầu vào và kết quả bạn cần; có thể đính kèm tài liệu ngay trong khung chat. Kế hoạch các bước và kết nối sẽ
                xuất hiện ở đây.
            </Alert>
        )
    const names = Object.fromEntries([['start', 'Bắt đầu'], ...workflow.steps.map((step) => [step.id, step.label])])
    const issues = [...new Set([...(workflow.questions || []), ...(workflow.blockers || []), ...(readiness?.errors || [])])]
    return (
        <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0, p: 1 }}>
            <Stack spacing={1.5}>
                <Typography variant='h4'>Luồng thực hiện</Typography>
                <Typography>{workflow.summary}</Typography>
                <Typography variant='caption'>
                    Kế hoạch: {workflow.steps.length} bước xử lý · {workflow.edges.length} kết nối
                </Typography>
                <Alert severity={buildStatus === 'completed' ? 'success' : issues.length ? 'warning' : 'info'}>
                    {buildStatus === 'completed'
                        ? 'Đã tạo graph. Chạy thử để kiểm tra kết quả thực tế.'
                        : issues.length
                        ? 'Còn thông tin hoặc kết nối cần bổ sung trước khi build.'
                        : 'Kế hoạch đã hợp lệ. Bạn có thể tiếp tục trao đổi thêm yêu cầu, hoặc nhắn "xong" để bắt đầu build Agent.'}
                </Alert>
                {issues.map((issue) => (
                    <Alert key={issue} severity='warning'>
                        {issue}
                    </Alert>
                ))}
                {workflow.steps.map((step, index) => {
                    const effectiveInputs = ['llm', 'agent'].includes(step.type)
                        ? [...new Set(['start', ...(step.inputFrom || [])])]
                        : step.type === 'reply'
                        ? []
                        : step.inputFrom || []
                    return (
                        <Paper key={step.id} variant='outlined' sx={{ p: 1.5 }}>
                            <Stack direction='row' alignItems='center' spacing={1}>
                                <Typography fontWeight={600}>
                                    {index + 1}. {step.label}
                                </Typography>
                                <Chip
                                    size='small'
                                    color={step.type === 'external' ? 'warning' : 'default'}
                                    label={TYPES[step.type] || step.type}
                                />
                            </Stack>
                            <Typography variant='body2' sx={{ mt: 1 }}>
                                {step.instruction}
                            </Typography>
                            {!!effectiveInputs.length && (
                                <Typography variant='caption'>
                                    Nhận dữ liệu từ: {effectiveInputs.map((id) => names[id] || id).join(', ')}
                                </Typography>
                            )}
                        </Paper>
                    )
                })}
                <Typography variant='h5'>Các kết nối</Typography>
                {workflow.edges.map((edge, index) => (
                    <Typography variant='body2' key={index}>
                        {names[edge.source] || edge.source} → {names[edge.target] || edge.target}
                        {edge.branch ? ` (${edge.branch === 'true' ? 'đúng' : 'sai'})` : ''}
                    </Typography>
                ))}
            </Stack>
        </Box>
    )
}
WorkflowPanel.propTypes = { workflow: PropTypes.object, readiness: PropTypes.object, buildStatus: PropTypes.string }
