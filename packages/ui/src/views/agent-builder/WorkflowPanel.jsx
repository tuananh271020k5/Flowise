import PropTypes from 'prop-types'
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material'

const TYPES = {
    llm: 'LLM',
    agent: 'Agent + Tools',
    retriever: 'Tìm tài liệu',
    condition: 'Điều kiện',
    conditionAgent: 'AI Phân nhánh',
    loop: 'Vòng lặp tự sửa',
    iteration: 'Lặp danh sách',
    http: 'Gọi HTTP API',
    humanInput: 'Chờ người duyệt',
    reply: 'Trả lời trực tiếp',
    external: 'Cần tích hợp'
}

export default function WorkflowPanel({ workflow, readiness, buildStatus, mcpServers }) {
    if (!workflow)
        return (
            <Alert severity='info'>
                Mô tả mục tiêu, đầu vào và kết quả bạn cần; có thể đính kèm tài liệu hoặc kết nối MCP Server ngay trên thanh công cụ. Kế
                hoạch các bước và kết nối sẽ xuất hiện ở đây.
            </Alert>
        )
    const names = Object.fromEntries([['start', 'Bắt đầu'], ...workflow.steps.map((step) => [step.id, step.label])])
    const stepById = Object.fromEntries(workflow.steps.map((step) => [step.id, step]))
    const mcpById = Object.fromEntries((mcpServers || []).map((srv) => [srv.id, srv.name]))
    const issues = [
        ...new Set([
            ...(workflow.blockers || []),
            ...(!workflow.steps?.length ? workflow.questions || [] : []),
            ...(readiness?.errors || [])
        ])
    ]
    const stateEntries = Array.isArray(workflow.initialState) ? workflow.initialState : []

    const formatBranch = (sourceId, branch) => {
        if (!branch) return ''
        const sourceStep = stepById[sourceId]
        if (sourceStep?.type === 'conditionAgent') {
            const idx = Number(branch)
            const scenario = Number.isInteger(idx) ? sourceStep.scenarios?.[idx] : undefined
            return scenario ? ` (nhánh ${idx + 1}: ${scenario})` : ` (nhánh ${branch})`
        }
        if (sourceStep?.type === 'humanInput') {
            return branch === '0' || branch === 'true' ? ' (duyệt)' : ' (từ chối)'
        }
        return branch === 'true' || branch === '0' ? ' (đúng)' : ' (sai)'
    }

    return (
        <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0, p: 1 }}>
            <Stack spacing={1.5}>
                <Typography variant='h4'>Luồng thực hiện</Typography>
                <Typography>{workflow.summary}</Typography>
                <Typography variant='caption'>
                    Kế hoạch: {workflow.steps.length} bước xử lý · {workflow.edges.length} kết nối
                </Typography>
                {(workflow.enableMemory || workflow.schedule?.cronExpression) && (
                    <Stack direction='row' spacing={0.75} alignItems='center' flexWrap='wrap' useFlexGap>
                        {workflow.enableMemory && (
                            <Chip size='small' color='success' variant='outlined' label='Memory & Lưu trạng thái đa lượt' />
                        )}
                        {workflow.schedule?.cronExpression && (
                            <Chip
                                size='small'
                                color='secondary'
                                variant='outlined'
                                label={`Lịch Cron: ${workflow.schedule.cronExpression} (${
                                    workflow.schedule.timezone || 'Asia/Ho_Chi_Minh'
                                })`}
                            />
                        )}
                    </Stack>
                )}
                {stateEntries.length > 0 && (
                    <Stack direction='row' spacing={0.5} alignItems='center' flexWrap='wrap' useFlexGap>
                        <Typography variant='caption' sx={{ fontWeight: 600 }}>
                            Flow State:
                        </Typography>
                        {stateEntries.map((entry) => (
                            <Chip
                                key={entry.key}
                                size='small'
                                variant='outlined'
                                label={entry.value ? `${entry.key} = "${entry.value}"` : entry.key}
                            />
                        ))}
                    </Stack>
                )}
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
                    const updatedStateKeys = Array.isArray(step.updateState)
                        ? step.updateState.map((u) => (typeof u === 'string' ? u : u.key)).filter(Boolean)
                        : []
                    return (
                        <Paper key={step.id} variant='outlined' sx={{ p: 1.5 }}>
                            <Stack direction='row' alignItems='center' spacing={1} flexWrap='wrap' useFlexGap>
                                <Typography fontWeight={600}>
                                    {index + 1}. {step.label}
                                </Typography>
                                <Chip
                                    size='small'
                                    color={
                                        step.type === 'external'
                                            ? 'warning'
                                            : ['conditionAgent', 'loop', 'iteration', 'humanInput'].includes(step.type)
                                            ? 'primary'
                                            : 'default'
                                    }
                                    label={TYPES[step.type] || step.type}
                                />
                            </Stack>
                            <Typography variant='body2' sx={{ mt: 1 }}>
                                {step.instruction}
                            </Typography>
                            {step.type === 'conditionAgent' && Array.isArray(step.scenarios) && step.scenarios.length > 0 && (
                                <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                                    {step.scenarios.map((scenario, idx) => (
                                        <Typography key={idx} variant='caption' color='textSecondary'>
                                            • Nhánh {idx + 1}: {scenario}
                                        </Typography>
                                    ))}
                                </Stack>
                            )}
                            {step.type === 'loop' && step.loopBackTo && (
                                <Typography variant='caption' color='primary' sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}>
                                    ↺ Quay lại bước: {names[step.loopBackTo] || step.loopBackTo} (tối đa {step.maxLoops || 3} vòng)
                                </Typography>
                            )}
                            {step.type === 'http' && step.http && (
                                <Typography variant='caption' sx={{ display: 'block', mt: 0.5 }}>
                                    HTTP: {step.http.method || 'GET'} {step.http.path || '/'}
                                </Typography>
                            )}
                            {Array.isArray(step.nativeTools) && step.nativeTools.length > 0 && (
                                <Typography variant='caption' sx={{ display: 'block', mt: 0.5 }}>
                                    Node công cụ Flowise: {step.nativeTools.join(', ')}
                                </Typography>
                            )}
                            {Array.isArray(step.mcpServerIds) && step.mcpServerIds.length > 0 && (
                                <Typography variant='caption' sx={{ display: 'block', mt: 0.5 }}>
                                    MCP Tools: {step.mcpServerIds.map((id) => mcpById[id] || id).join(', ')}
                                </Typography>
                            )}
                            {(Array.isArray(step.stateKeys) && step.stateKeys.length > 0) || updatedStateKeys.length > 0 ? (
                                <Typography variant='caption' color='textSecondary' sx={{ display: 'block', mt: 0.5 }}>
                                    {step.stateKeys?.length ? `Đọc State: ${step.stateKeys.join(', ')}` : ''}
                                    {step.stateKeys?.length && updatedStateKeys.length ? ' · ' : ''}
                                    {updatedStateKeys.length ? `Ghi State: ${updatedStateKeys.join(', ')}` : ''}
                                </Typography>
                            ) : null}
                            {!!effectiveInputs.length && (
                                <Typography variant='caption' sx={{ display: 'block', mt: 0.25 }}>
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
                        {formatBranch(edge.source, edge.branch)}
                    </Typography>
                ))}
                {workflow.steps
                    .filter((step) => step.type === 'loop' && step.loopBackTo)
                    .map((step) => (
                        <Typography variant='body2' key={`loop-${step.id}`} color='primary'>
                            {step.label} ↺ {names[step.loopBackTo] || step.loopBackTo} (tối đa {step.maxLoops || 3} vòng)
                        </Typography>
                    ))}
            </Stack>
        </Box>
    )
}
WorkflowPanel.propTypes = {
    workflow: PropTypes.object,
    readiness: PropTypes.object,
    buildStatus: PropTypes.string,
    mcpServers: PropTypes.array
}
