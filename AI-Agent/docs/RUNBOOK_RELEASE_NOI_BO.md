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

---

## 6. SOP-06: Database Migration Đa Hệ Quản Trị (PH5-T08)

Hệ thống Agent Builder đã chuẩn bị đầy đủ bộ TypeORM Migrations đồng bộ trên cả 4 hệ quản trị cơ sở dữ liệu:
- **SQLite**: `packages/server/src/database/migrations/sqlite/` (1781000000000 -> 1784000000000).
- **PostgreSQL**: `packages/server/src/database/migrations/postgres/1781000000000-AddAgentBuilderEntities.ts`.
- **MySQL**: `packages/server/src/database/migrations/mysql/1781000000000-AddAgentBuilderEntities.ts`.
- **MariaDB**: `packages/server/src/database/migrations/mariadb/1781000000000-AddAgentBuilderEntities.ts`.

### Các Bảng Mới Được Quản Lý:
1. `builder_session`: Lưu trữ thông tin phiên làm việc, phân quyền workspace và trạng thái hiện tại.
2. `builder_message`: Lịch sử trao đổi giữa người dùng và Agent Builder (hỗ trợ clientMessageId idempotent).
3. `agent_spec_revision`: Quản lý đặc tả JSON bất biến qua từng lượt hiệu chỉnh.
4. `agent_draft_revision`: Lưu vết các bản biên dịch Agentflow V2 được sinh ra.
5. `build_job`: Quản lý vòng đời tiến trình build tự động, có timeout và theo dõi lỗi.
6. `builder_audit_log`: Truy vết kiểm toán toàn bộ hoạt động trọng yếu có phân quyền workspace.

---

## 7. SOP-07: Sao Lưu (Backup), Phục Hồi (Restore) & Kiểm Tra Toàn Vẹn Schema (PH5-T08)

### 7.1. Xuất Bản Sao Lưu Phiên Làm Việc
- **Mục đích:** Lưu trữ dự phòng toàn bộ phiên làm việc của người dùng bao gồm lịch sử tin nhắn, bản đặc tả và các bản draft flow.
- **Thao tác API:**
  ```http
  GET /api/v1/agent-builder/sessions/:id/backup
  ```
- **Dữ liệu trả về:** JSON bundle có mã băm SHA-256 (`checksum`) đảm bảo tính toàn vẹn khi lưu trữ và truyền tải.

### 7.2. Phục Hồi Phiên Làm Việc Từ Bản Sao Lưu
- **Thao tác API:**
  ```http
  POST /api/v1/agent-builder/sessions/restore
  Content-Type: application/json

  {
    "bundle": { ... },
    "options": { "overwrite": true }
  }
  ```
- Hệ thống tự động xác thực mã kiểm tra `checksum` trước khi phục hồi, bảo toàn các ID thực thể và ghi nhận nhật ký `SESSION_CREATED`.

### 7.3. Kiểm Tra Toàn Vẹn Schema Invariants
- **Mục đích:** Phát hiện các bản ghi mồ côi (orphaned records) hoặc vi phạm liên kết khóa ngoại.
- **Thao tác API:**
  ```http
  GET /api/v1/agent-builder/schema/validate
  ```

---

## 8. SOP-08: Zero-Downtime Draft Switch & Instant Rollback (PH5-T09)

### 8.1. Nguyên Lý Chuyển Đổi Không Gián Đoạn (Zero-Downtime)
- Khi chuyển đổi bản draft (`switchDraftRevision`) hoặc hoàn tác khẩn cấp (`instantRollback`), hệ thống **giữ nguyên định danh `chatflow.id`** của Agentflow đang phục vụ.
- Đồ thị thực thi (`flowData`) được cập nhật nguyên tử (atomic update). Các kết nối dự đoán của người dùng cuối `/api/v1/prediction/:flowId` đang chạy không bị ngắt kết nối (zero socket/SSE drops), và các request kế tiếp lập tức áp dụng đồ thị mới.

### 8.2. Chuyển Đổi Bản Draft Tức Thì (Draft Switch)
- **Thao tác API:**
  ```http
  POST /api/v1/agent-builder/sessions/:id/switch-draft
  Content-Type: application/json

  {
    "draftRevisionId": "draft-xxx"
  }
  ```

### 8.3. Khôi Phục Tức Thì Khẩn Cấp (Instant Rollback)
- **Thao tác API:**
  ```http
  POST /api/v1/agent-builder/sessions/:id/instant-rollback
  Content-Type: application/json

  {
    "toLastStable": true
  }
  ```
  Hoặc chỉ định cụ thể:
  ```json
  {
    "revisionId": "spec-rev-xxx"
  }
  ```
- **Cơ chế an toàn:** Tự động sinh `AgentSpecRevision` số hiệu mới kế thừa cấu hình ổn định, không ghi đè bất kỳ bản ghi cũ nào, và ghi nhận audit log `ROLLBACK_EXECUTED`.
