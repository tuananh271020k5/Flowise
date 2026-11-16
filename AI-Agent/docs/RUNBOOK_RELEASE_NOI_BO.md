# Sổ Tay Vận Hành & Hướng Dẫn Nghiệm Thu Release Nội Bộ (Operational Runbook)

Tài liệu hướng dẫn vận hành chuẩn (SOP) dành cho Đội ngũ Quản trị Hệ thống và Vận hành (SRE/DevOps/Admin) đối với phân hệ **Flowise Chat-to-Agent Builder** (Mốc Release Nội Bộ - Phase 5).

---

## 1. Tổng Quan Hệ Thống

Phân hệ Agent Builder cho phép người dùng đàm thoại bằng tiếng Việt tự nhiên để thu thập yêu cầu, tự động biên dịch sang đồ hình **Flowise Agentflow V2 Draft**, chạy kiểm thử đánh giá độc lập (10 Golden Cases) và xuất bản an toàn qua Cổng Kiểm Định Chất Lượng (**Quality Gate**).

### Các Thành Phần Trọng Yếu:
- **Tầng Hội thoại & Compiler:** `sessionService.ts`, `compiler.ts`, `flowValidator.ts`.
- **Tầng Tri thức & RAG:** `knowledgeStoreService.ts`, `knowledgePipeline.test.ts`.
- **Cổng Phê Duyệt Xuất Bản:** `publishService.ts` (Quality Gate kiểm tra Pass Rate >= 80%).
- **Kiểm Toán & Lưu Vết:** `builderAuditService.ts`, bảng `BuilderAuditLog` cách ly tuyệt đối theo `workspaceId`.
- **Bảo Vệ Tài Nguyên & Tần Suất:** `rateLimiter.ts` trượt theo thời gian (Sliding Window).
- **Làm Sạch Dữ Liệu Nhạy Cảm:** `redactionService.ts` che giấu API keys, secrets, tokens tự động.
- **Lưu Trữ & Dọn Dẹp Dữ Liệu:** `retentionService.ts` quét và dọn dẹp các session không hoạt động.
- **Giám Sát Có Cấu Trúc:** `builderLogger.ts` (chuẩn JSON có `traceId`) và `metricsService.ts`.

---

## 2. Cấu Hình Môi Trường Vận Hành (Environment Variables)

| Tên Biến | Mặc Định | Ý Nghĩa Vận Hành |
|---|---|---|
| `PORT` | `3000` | Cổng HTTP của Flowise backend server. |
| `FLOWISE_SECRETKEY` | *(Bắt buộc)* | Khóa đối xứng mã hóa thông tin xác thực (credentials). |
| `BUILDER_DATA_RETENTION_DAYS` | `30` | Thời gian lưu giữ các phiên làm việc (session nháp) không hoạt động trước khi xóa định kỳ. |
| `BUILDER_AUDIT_RETENTION_DAYS` | `90` | Thời gian lưu giữ nhật ký kiểm toán (Audit Logs) phục vụ tuân thủ trước khi lưu trữ/dọn dẹp. |
| `LOG_LEVEL` | `info` | Mức log hệ thống (`info`, `warn`, `error`, `debug`). |

---

## 3. Chính Sách Bảo Mật & Bảo Vệ Vận Hành (Security & Rate Limits)

### 3.1. Hạn Mức Tần Suất (Rate Limiting Quotas)
Nhằm ngăn chặn hành vi spam hoặc loop vô hạn tiêu hao tài nguyên AI:
- **Tạo phiên mới (`POST /api/v1/agent-builder/sessions`):** Tối đa 30 requests / giờ / workspace.
- **Gửi tin nhắn (`POST /api/v1/agent-builder/sessions/:id/messages`):** Tối đa 60 requests / phút / workspace.
- **Biên dịch đồ hình (`POST /api/v1/agent-builder/sessions/:id/builds`):** Tối đa 15 requests / phút / workspace.
- **Chạy bộ kiểm thử (`POST /api/v1/agent-builder/sessions/:id/test-suite`):** Tối đa 10 runs / phút / workspace.
- **Xuất bản / Thu hồi (`POST /api/v1/agent-builder/sessions/:id/publish`):** Tối đa 10 requests / phút / workspace.

> Khi vượt hạn mức, hệ thống trả về mã lỗi HTTP `429 Too Many Requests` kèm mã `RATE_LIMIT_EXCEEDED` và header `Retry-After`.

### 3.2. Làm Sạch Bí Mật Tự Động (Credential Redaction)
Toàn bộ API key (OpenAI `sk-...`, Anthropic `sk-ant-...`, Gemini `AIza...`, Hugging Face `hf_...`), Authorization headers và mật khẩu database được tự động che giấu bằng `[REDACTED_...]` trước khi ghi vào log hoặc lưu trong database.

---

## 4. Quy Trình Vận Hành Chuẩn (Standard Operating Procedures)

### SOP-01: Quy Trình Phê Duyệt Xuất Bản Agent (Publishing Quality Gate)
1. **Điều kiện tiên quyết:**
   - Phiên làm việc đã biên dịch thành công ít nhất một bản nháp Flowise Agentflow (`draftRevisions > 0`).
   - Đã thực thi bộ kiểm thử đánh giá (`runTestSuite`).
   - Tỷ lệ đạt kiểm thử (`passRate`) phải **>= 80%** (ngưỡng Quality Gate).
2. **Thao tác:**
   - Gọi API: `POST /api/v1/agent-builder/sessions/:id/publish`
   - Payload:
     ```json
     {
       "isPublic": true,
       "minPassRate": 80,
       "notes": "Phê duyệt xuất bản phiên bản sản phẩm v1"
     }
     ```
3. **Kết quả kỳ vọng:**
   - Trạng thái `ChatFlow.deployed` chuyển thành `true`.
   - Phiên làm việc chuyển sang trạng thái `published`.
   - Nhật ký kiểm toán ghi nhận bản ghi `AGENT_PUBLISHED` với status `SUCCESS`.

### SOP-02: Quy Trình Thu Hồi Xuất Bản Khẩn Cấp (Emergency Unpublish)
1. **Tình huống áp dụng:**
   - Phát hiện Agent có câu trả lời bất thường hoặc tài liệu tri thức cần cập nhật khẩn.
2. **Thao tác:**
   - Gọi API: `POST /api/v1/agent-builder/sessions/:id/unpublish`
3. **Kết quả kỳ vọng:**
   - `ChatFlow.deployed` lập tức chuyển về `false`.
   - Phiên làm việc quay trở lại trạng thái `draft`.
   - Sự kiện SSE `agent_unpublished` phát đến toàn bộ client đang kết nối.
   - Ghi nhận `AGENT_UNPUBLISHED` vào Audit Trail.

### SOP-03: Quy Trình Dọn Dẹp Dữ Liệu Lưu Trữ (Data Retention Sweep)
1. **Lịch thực thi:**
   - Định kỳ hàng tuần hoặc hàng tháng qua cron job hoặc lệnh của quản trị viên.
2. **Thao tác:**
   - Gọi API: `POST /api/v1/agent-builder/retention/sweep`
   - Payload tùy chọn:
     ```json
     {
       "sessionDays": 30,
       "auditDays": 90
     }
     ```
3. **Nguyên tắc an toàn:**
   - **Tuyệt đối KHÔNG xóa các Agent đang ở trạng thái xuất bản (`published`)**.
   - Ghi nhận bản ghi `DATA_RETENTION_PURGE` vào bảng kiểm toán.

### SOP-04: Giám Sát Token Usage & Hạch Toán Chi Phí Thực (PH5-T05)
1. **Kiểm tra theo phiên cụ thể:**
   - Gọi API: `GET /api/v1/agent-builder/sessions/:id/usage`
   - Phân tích chi tiết token và chi phí USD theo từng nguồn (`conversation`, `compilation`, `evaluation`, `prediction`) và theo nhà cung cấp (`openai`, `anthropic`, `google`, `ollama`).
2. **Kiểm tra theo Workspace:**
   - Gọi API: `GET /api/v1/agent-builder/usage`
   - Dùng để theo dõi ngân sách tài nguyên và cảnh báo vượt hạn mức tiêu thụ token.

### SOP-05: Khôi Phục & Đối Soát Sau Khi Server Restart / Crash (PH5-T07)
1. **Tình huống áp dụng:**
   - Server Flowise bị khởi động lại đột ngột, container bị kill, hoặc tiến trình build bị mất kết nối khiến session bị kẹt ở trạng thái `building`.
2. **Thao tác:**
   - Gọi API: `POST /api/v1/agent-builder/recovery/reconcile`
   - Payload:
     ```json
     {
       "maxStaleMs": 30000
     }
     ```
3. **Kết quả kỳ vọng:**
   - Các job treo được tự động đánh dấu `failed` kèm lỗi rõ ràng.
   - Session được unblock chuyển từ `building` về `ready`.
   - **Toàn bộ lịch sử Revision và Draft Revision được giữ nguyên vẹn 100% (không duplicate hay mất mát).**
   - Ghi nhận nhật ký `RECOVERY_EXECUTED`.

---

## 5. Giám Sát & Xử Lý Sự Cố (Observability & Troubleshooting)

### 5.1. Giám Sát Metrics Thời Gian Thực
- Gọi endpoint: `GET /api/v1/agent-builder/metrics`
- Dữ liệu trả về bao gồm:
  - Tổng số phiên làm việc, tổng số lượt build, tỷ lệ build thành công (`builds.successRate`).
  - Điểm kiểm thử trung bình (`evaluations.passRate`).
  - Số lượng Agent đã xuất bản / đã thu hồi.
  - Số vi phạm rate limit (`security.rateLimitViolationsTotal`).

### 5.2. Kiểm Tra Nhật Ký Có Cấu Trúc (Structured Logs)
- Gọi endpoint: `GET /api/v1/agent-builder/logs?limit=50&stage=publishing`
- Mỗi log entry chứa: `timestamp`, `level`, `stage`, `traceId`, `sessionId`, `workspaceId`, `action`, `durationMs`.

### 5.3. Xử Lý Các Sự Cố Thường Gặp
1. **Lỗi HTTP 429 (RATE_LIMIT_EXCEEDED):**
   - *Nguyên nhân:* Người dùng gửi quá nhiều request trong thời gian ngắn.
   - *Khắc phục:* Kiểm tra header `Retry-After` và đợi hết thời gian cửa sổ trượt.
2. **Lỗi HTTP 400 (QUALITY_GATE_REJECTED):**
   - *Nguyên nhân:* Tỷ lệ pass của bộ kiểm thử dưới 80%.
   - *Khắc phục:* Yêu cầu người dùng chỉnh sửa hướng dẫn system prompt hoặc bổ sung tài liệu tri thức, sau đó chạy lại test suite trước khi xuất bản lại.
3. **Không tìm thấy bản ghi Audit Log:**
   - *Nguyên nhân:* `workspaceId` của người gọi không khớp với `workspaceId` của phiên làm việc.
   - *Khắc phục:* Kiểm tra quyền workspace của user trên Flowise header/token.
