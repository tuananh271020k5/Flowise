import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import {
    Alert,
    Autocomplete,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    FormControlLabel,
    Switch
} from '@mui/material'
import api from '@/api/agentBuilder'

// Optional suggestions, not a guarantee of account access. Users may enter any gateway model ID.
// GPT-6 IDs per https://developers.openai.com/api/docs/guides/latest-model; tool calling requires Responses.
const MODEL_SUGGESTIONS = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4o-mini']
const normalizedUrl = (url) => (url || '').trim().replace(/\/+$/, '')

export default function ModelSettingsDialog({ open, onClose, onSaved }) {
    const [modelName, setModelName] = useState('gpt-4o-mini')
    const [baseUrl, setBaseUrl] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [ready, setReady] = useState(false)
    const [webSearchEnabled, setWebSearchEnabled] = useState(false)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [savedModelName, setSavedModelName] = useState('')
    const [savedBaseUrl, setSavedBaseUrl] = useState('')
    const [providerModels, setProviderModels] = useState([])
    const [loadingModels, setLoadingModels] = useState(false)
    const [catalogError, setCatalogError] = useState('')
    const [catalogLoaded, setCatalogLoaded] = useState(false)
    const catalogRequest = useRef(0)
    const catalogConfigChanged = normalizedUrl(baseUrl) !== normalizedUrl(savedBaseUrl) || Boolean(apiKey.trim())
    const options = useMemo(
        () => [...new Set([...providerModels, ...MODEL_SUGGESTIONS, ...(savedModelName ? [savedModelName] : [])])],
        [providerModels, savedModelName]
    )
    useEffect(() => {
        if (!open) return
        setError('')
        setReady(false)
        setLoadingModels(false)
        catalogRequest.current++
        setCatalogError('')
        setProviderModels([])
        setCatalogLoaded(false)
        setApiKey('')
        let active = true
        api.getModelProfile()
            .then(({ data }) => {
                if (!active) return
                setModelName(data.modelName)
                setSavedModelName(data.modelName)
                setBaseUrl(data.baseUrl || '')
                setSavedBaseUrl(data.baseUrl || '')
                setReady(data.ready)
                setWebSearchEnabled(Boolean(data.webSearchEnabled))
            })
            .catch(() => {
                if (active) setError('Không đọc được cấu hình model. Kiểm tra đăng nhập.')
            })
        return () => {
            active = false
            catalogRequest.current++
        }
    }, [open])
    const close = () => {
        catalogRequest.current++
        setApiKey('')
        onClose()
    }
    const save = async () => {
        setSaving(true)
        setError('')
        try {
            const { data } = await api.saveModelProfile({ modelName, baseUrl, webSearchEnabled, ...(apiKey ? { apiKey } : {}) })
            setApiKey('')
            onSaved(data)
            onClose()
        } catch (e) {
            setError(e.response?.data?.message || 'Không lưu được cấu hình model')
        } finally {
            setSaving(false)
        }
    }
    const loadModels = async () => {
        const requestId = ++catalogRequest.current
        setLoadingModels(true)
        setCatalogError('')
        try {
            const { data } = await api.listModels()
            if (requestId !== catalogRequest.current) return
            setProviderModels(Array.isArray(data.models) ? data.models : [])
            setCatalogLoaded(true)
        } catch (e) {
            if (requestId === catalogRequest.current)
                setCatalogError(e.response?.data?.message || 'Không tải được danh sách. Bạn vẫn có thể chọn gợi ý hoặc nhập tên model.')
        } finally {
            if (requestId === catalogRequest.current) setLoadingModels(false)
        }
    }
    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth='sm'>
            <DialogTitle>Cấu hình model</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Alert severity={ready ? 'success' : 'info'}>
                        {ready
                            ? 'API key đã lưu trên server. Ô key hiển thị trống vì key không bao giờ được trả về trình duyệt — KHÔNG cần nhập lại. Chỉ nhập key mới khi muốn thay key cũ.'
                            : 'Nhập API key để bot hiểu yêu cầu và Agent trả lời thật. Key được lưu mã hóa trên server và không hiển thị lại sau khi lưu.'}
                    </Alert>
                    {error && <Alert severity='error'>{error}</Alert>}
                    <Autocomplete
                        freeSolo
                        options={options}
                        value={modelName}
                        inputValue={modelName}
                        onInputChange={(_, value) => setModelName(value)}
                        onChange={(_, value) => setModelName(value || '')}
                        groupBy={(id) =>
                            providerModels.includes(id)
                                ? 'Từ provider đã lưu'
                                : MODEL_SUGGESTIONS.includes(id)
                                ? 'Gợi ý OpenAI'
                                : 'Model đang lưu'
                        }
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label='Tên model'
                                helperText='Chọn trong danh sách hoặc tự nhập tên model. Model gợi ý cần được tài khoản/provider của bạn cho phép.'
                            />
                        )}
                    />
                    <Button variant='outlined' onClick={loadModels} disabled={loadingModels || !ready || catalogConfigChanged}>
                        {loadingModels ? 'Đang tải model…' : 'Tải model từ provider'}
                    </Button>
                    {catalogConfigChanged && (
                        <Alert severity='info'>
                            Danh sách provider dùng key và Base URL đã lưu. Lưu cấu hình rồi mở lại hộp thoại để tải theo provider mới.
                        </Alert>
                    )}
                    {catalogError && <Alert severity='warning'>{catalogError}</Alert>}
                    {catalogLoaded && !catalogConfigChanged && (
                        <Alert severity='info'>
                            Provider trả {providerModels.length} model. Danh sách có thể gồm cả model ảnh/âm thanh/embedding; hãy chọn model
                            chat. Quyền gọi và tra web được kiểm tra khi sử dụng.
                        </Alert>
                    )}
                    <TextField
                        label='Base URL (tùy chọn)'
                        placeholder='https://api.openai.com/v1'
                        value={baseUrl}
                        onChange={(e) => {
                            catalogRequest.current++
                            setLoadingModels(false)
                            setBaseUrl(e.target.value)
                            setProviderModels([])
                            setCatalogLoaded(false)
                        }}
                        helperText='Để trống để dùng OpenAI. Dịch vụ tương thích OpenAI: nhập URL kết thúc bằng /v1.'
                    />
                    <TextField
                        label='API key'
                        type='password'
                        autoComplete='new-password'
                        value={apiKey}
                        onChange={(e) => {
                            catalogRequest.current++
                            setLoadingModels(false)
                            setApiKey(e.target.value)
                            setProviderModels([])
                            setCatalogLoaded(false)
                        }}
                        helperText='Để trống để dùng key đã lưu. Chỉ nhập khi muốn thay key mới. Không dán API key vào hội thoại tạo Agent.'
                    />
                    <FormControlLabel
                        control={<Switch checked={webSearchEnabled} onChange={(e) => setWebSearchEnabled(e.target.checked)} />}
                        label='Cho phép Agent tra cứu web để cập nhật thông tin'
                    />
                    <Alert severity='info'>
                        Tra cứu web cần model và endpoint hỗ trợ OpenAI Responses với web_search, có thể phát sinh phí của provider. Áp dụng
                        ngay cho chat thử của các draft hiện có. Giá và tồn kho cửa hàng vẫn cần dữ liệu riêng.
                    </Alert>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={close}>Đóng</Button>
                <Button variant='contained' disabled={saving || !modelName.trim()} onClick={save}>
                    {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
ModelSettingsDialog.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired }
