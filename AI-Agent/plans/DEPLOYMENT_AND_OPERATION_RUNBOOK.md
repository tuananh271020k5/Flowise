# SỔ TAY TRIỂN KHAI VÀ VẬN HÀNH (DEPLOYMENT & OPERATION RUNBOOK)
## HỆ THỐNG FLOWISE CHAT-TO-AGENT BUILDER

**Tài liệu dành cho:** DevOps, Quản trị hệ thống và Đội ngũ phát triển  
**Phiên bản:** 1.0.0 (Tương ứng hoàn thành 100% Phase 0 - Phase 6)  
**Ngày phát hành:** 17/11/2026

---

## 1. YÊU CẦU MÔI TRƯỜNG & HẠ TẦNG

- **Node.js:** Phiên bản `>= 24.15.0` (theo `.nvmrc` và cấu hình engines).
- **Package Manager:** `pnpm` phiên bản `>= 10.0.0`.
- **Cơ sở dữ liệu:** SQLite (mặc định cho môi trường dev/staging tại `packages/server/dist/database.sqlite`) hoặc PostgreSQL / MySQL cho môi trường production.
- **Hệ điều hành:** Linux (Ubuntu 22.04 LTS / 24.04 LTS) hoặc Windows Server / macOS.
- **Tài nguyên tối thiểu:** 2 vCPU, 4GB RAM (Khuyến nghị production: 4 vCPU, 8GB RAM).

---

## 2. BIẾN MÔI TRƯỜNG CẦN THIẾT (.env)

Tạo file `.env` tại thư mục gốc của repository hoặc `packages/server/.env`:

```bash
# Cấu hình Cổng và Máy chủ
PORT=3000
FLOWISE_USERNAME=admin
FLOWISE_PASSWORD=YourSecurePassword123!

# Cấu hình Database (nếu sử dụng Postgres)
# DATABASE_TYPE=postgres
# DATABASE_PORT=5432
# DATABASE_HOST=localhost
# DATABASE_NAME=flowise
# DATABASE_USER=flowise_user
# DATABASE_PASSWORD=YourDbPassword

# Khóa mã hóa bảo mật (Credential Encryption)
SECRETKEY=your-32-character-secret-key-here!!

# Cấu hình Khóa API Mặc định cho LLM (Tùy chọn)
OPENAI_API_KEY=sk-...

# Cấu hình Giới hạn Tải & Rate Limiting
BUILDER_MAX_SESSION_MESSAGES=100
BUILDER_EVAL_MAX_EXAMPLES=5
BUILDER_RATE_LIMIT_PER_MINUTE=60
```

---

## 3. CÁC BƯỚC CÀI ĐẶT VÀ KHỞI CHẠY (LOCAL / ON-PREMISE)

### Bước 1: Clone mã nguồn
```bash
git clone https://github.com/tuananh271020k5/Flowise.git
cd Flowise
git checkout main
```

### Bước 2: Cài đặt dependencies
```bash
pnpm install --frozen-lockfile
```

### Bước 3: Build toàn bộ dự án
```bash
pnpm build
```

### Bước 4: Khởi chạy dịch vụ
```bash
pnpm start
```
Hệ thống sẽ khởi động giao diện web tại `http://localhost:3000`. Người dùng có thể đăng nhập và truy cập trang **Agent Builder** qua menu bên trái hoặc đường dẫn `http://localhost:3000/agent-builder`.

---

## 4. QUY TRÌNH VẬN HÀNH & BẢO TRÌ

### 4.1. Giám Sát Sức Khỏe Hệ Thống (Health Checks)
- **API Kiểm tra sức khỏe:** `GET /api/v1/ping` -> Trả về `pong` (HTTP 200).
- **API Kiểm tra số liệu Builder Metrics:** `GET /api/v1/agent-builder/metrics` -> Trả về số lượng sessions, tổng builds thành công, số bài test đã chạy.

### 4.2. Quản Lý Nhật Ký (Audit Logs) & Dọn Dẹp Dữ Liệu
- Nhật ký thao tác của người dùng (`BUILD`, `TEST`, `PUBLISH`, `ROLLBACK`) được lưu trữ bảo mật và che giấu toàn bộ API keys.
- **Lệnh dọn dẹp phiên làm việc cũ:**
  Hệ thống hỗ trợ endpoint dọn dẹp các session không hoạt động quá 30 ngày:
  `POST /api/v1/agent-builder/retention/sweep` (Yêu cầu quyền Admin).

### 4.3. Xử Lý Khi Server Khởi Động Lại Đột Ngột (Crash Recovery)
- Khi server bị restart đột ngột trong khi đang thực hiện build hoặc chạy eval:
  `CrashRecoveryService` sẽ tự động đánh dấu các job bị treo sang trạng thái `FAILED` kèm lý do rõ ràng, ngăn ngừa tình trạng deadlock hoặc khóa phiên làm việc.
- Quản trị viên cũng có thể kích hoạt hòa giải thủ công:
  `POST /api/v1/agent-builder/recovery/reconcile`.

### 4.4. Quy Trình Sao Lưu Và Khôi Phục (Backup & Restore)
- **Sao lưu:**
  `GET /api/v1/agent-builder/sessions/:sessionId/backup` -> Xuất file JSON chứa toàn bộ lịch sử revision, đặc tả và kết quả kiểm thử.
- **Khôi phục:**
  `POST /api/v1/agent-builder/sessions/restore` kèm payload JSON đã sao lưu.

---

## 5. QUY TRÌNH ROLLBACK PHIÊN BẢN (KHI CẦN THIẾT)

Nếu phiên bản mới phát sinh lỗi nghiệp vụ:
1. **Rollback ở mức Agent:** Người dùng hoặc quản trị viên có thể bấm "Khôi phục phiên bản" (hoặc gọi `POST /api/v1/agent-builder/sessions/:sessionId/instant-rollback` kèm `targetRevisionNumber`) để đưa Agent về trạng thái hoạt động ổn định trước đó ngay lập tức.
2. **Rollback ở mức Ứng dụng (Deploy):**
   ```bash
   git checkout <commit-sha-ổn-định-trước-đó>
   pnpm install
   pnpm build
   pnpm start
   ```
