# TASK-001 — bằng chứng runtime baseline (14/11/2026)

**Phạm vi:** PH0-T01–T06 trên fork `main` tại `c31ae010ad0da23b823abbc31c16a9e732025dad`. Đây là kiểm tra local, chưa triển khai Chat-to-Agent Builder. Người dùng tự commit/push.

## Môi trường và build

| Kiểm tra               | Kết quả                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node/pnpm theo repo    | Node `24.15.0` (`.nvmrc`) và pnpm `10.26.0` (engines), dùng bản portable trong `AI-Agent/.local/tools/`; không đổi Node/pnpm toàn máy hoặc PowerShell execution policy.                                                                                    |
| Nguồn và integrity     | Node zip từ `https://nodejs.org/dist/v24.15.0/node-v24.15.0-win-x64.zip`, SHA256 `cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62` khớp `SHASUMS256.txt`. pnpm tarball từ npm registry bản `10.26.0`, SHA512 integrity khớp metadata npm. |
| Frozen install lần đầu | Lỗi `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. `package.json` có 8 `resolutions` được pnpm gộp vào `overrides` nhưng header lockfile cũ chưa phản ánh đủ.                                                                                                        |
| Sửa lockfile           | `pnpm install --lockfile-only --no-frozen-lockfile --ignore-scripts` exit 0; sau đó `pnpm install --frozen-lockfile` exit 0, 4.130 package, 3 phút 17 giây. Diff lockfile lớn do giải lại peer/resolution; cần review trong commit TASK-001.               |
| Build                  | `pnpm build` exit 0: Turbo 6/6 task, 1 cache hit, 1 phút 49 giây.                                                                                                                                                                                          |

pnpm bỏ qua build scripts của một số dependency theo cấu hình. Khi khởi động, node Couchbase báo thiếu native build trên Windows/Node 24; nodes pool và toàn bộ bước khởi tạo server vẫn hoàn thành, và flow mẫu chạy được. **Couchbase integration chưa được xác minh**. Log đầy đủ chỉ ở `AI-Agent/.local/TASK001-install.log`, `TASK001-build.log`, `TASK001-server.log` (Git ignore).

## Instance và fixture

-   Server `http://127.0.0.1:3037`, SQLite tại `AI-Agent/.local/TASK001-runtime/db`; encryption/auth secrets, log và storage cũng đặt trong `AI-Agent/.local/TASK001-runtime/`. `/api/v1/ping` và trang gốc trả HTTP 200. Tài khoản thử và DB chỉ là dữ liệu local, không đưa vào Git.
-   Instance được dừng sau khi kiểm tra xong; port 3037 không còn listener. Để chạy lại trên máy này, dùng Node portable hoặc Node 24 tương đương và đặt `DATABASE_TYPE=sqlite`, `DATABASE_PATH`, `SECRETKEY_PATH`, `LOG_PATH`, `BLOB_STORAGE_PATH` lần lượt tới các thư mục local trên, `HOST=127.0.0.1`, `PORT=3037`, rồi chạy `node packages/server/bin/run start` từ repo root. Không dùng DB mặc định trong profile cá nhân cho smoke test.
-   Tạo Start node phiên bản 1.4 qua UI Flowise hiện tại; giữ các input của chế độ chat để fixture gọn, ghép Direct Reply từ metadata fork thành [fixture sanitized](../fixtures/TASK-001-direct-reply.agentflow.json). Fixture có 2 node/1 edge, không có credential hoặc giá trị password/file/folder. Bản marketplace cũ có Start 1.1 và hiển thị cảnh báo outdated; fixture đã chuyển sang metadata 1.4.
-   Qua API có session hợp lệ, POST/GET/PUT `/api/v1/chatflows` đều HTTP 200. Flow lưu `type=AGENTFLOW`, `deployed=false`, `isPublic=false`; GET trả `flowData` giống fixture. Edge headless đăng nhập thật qua form, mở `/v2/agentcanvas/:id` HTTP 200, thấy Start và Phản hồi mẫu, không có page error hoặc cảnh báo outdated. Ảnh local: `AI-Agent/.local/TASK001-canvas.png`.
-   POST `/api/v1/prediction/:id` với input kiểm soát trả HTTP 200 và text `Xin chào! Đây là phản hồi thử nghiệm Agentflow V2.`. Đây là luồng **Direct Reply không dùng model**, nên mới chứng minh runner V2, chưa chứng minh provider LLM/credential hoặc chất lượng assistant AI.

## Hành vi quyền cần giữ khi xây Builder

| Thao tác                                                                                     | Kết quả runtime            | Giải thích source                                                                                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/v1/chatflows` hoặc `/:id` ẩn danh                                                  | HTTP 401                   | CRUD yêu cầu session với `x-request-from: internal` và JWT, hoặc API key hợp lệ; route còn có permission check.                       |
| GET `/api/v1/public-chatflows/:id` với private flow ẩn danh                                  | HTTP 401                   | `isPublic=false` được kiểm tra ở public read.                                                                                         |
| POST `/api/v1/prediction/:id` với private draft (`deployed=false`, `isPublic=false`) ẩn danh | **HTTP 200, trả lời được** | `/prediction/` nằm trong `WHITELIST_URLS` (`packages/server/src/utils/constants.ts:12`); controller prediction không chặn hai cờ này. |

Vì vậy `deployed`/`isPublic` **không phải** biên an toàn cho draft hoặc preview. Builder phải có đường preview được xác thực và tách khỏi endpoint prediction công khai, hoặc chặn prediction công khai theo trạng thái/ACL trước khi cho người dùng tạo draft nhạy cảm. Kiểm tra trên một workspace Open Source; cách ly chéo workspace/org và API key scope chưa được kiểm chứng end-to-end. Phần này cần test riêng trước demo nhiều người dùng.

## Giới hạn và việc kế tiếp

-   Chưa có provider profile/credential được cấp nên chưa gọi LLM thật. PH0-T07/B-002 phải chọn model profile và ba kịch bản demo; không lưu credential vào shared memory.
-   PH0-T08/B-002 phải xác nhận owner fork, phạm vi giấy phép từ `LICENSE.md`, advisory và cách xử lý endpoint prediction công khai. `BASELINE.md` đã ghi ngoại lệ commercial cho enterprise files; chưa có kết luận quyền sử dụng cụ thể.
-   Các câu lệnh UI/API smoke và ảnh/log gốc nằm dưới `AI-Agent/.local/`; AI nhận bàn giao đọc kết quả ở file này và state, chỉ mở log khi cần kiểm tra lại.
