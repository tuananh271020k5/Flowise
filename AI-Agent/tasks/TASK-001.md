# TASK-001 — Chuẩn hóa môi trường và xác minh runtime baseline

**Status:** completed ngày 14/11/2026 cho baseline deterministic V2. **Bằng chứng:** [TASK-001_RUNTIME.md](../context/TASK-001_RUNTIME.md).
**Phụ thuộc:** PLAN-000. **Ước lượng:** 2–4 ngày tập trung, điều chỉnh theo lỗi môi trường.

## Mục tiêu

Chứng minh Flowise tại fork này build/start được và một Agentflow V2 fixture chạy đúng. Tái sử dụng source map đã có; không khảo sát lại toàn repo hoặc viết Builder ngay.

## Đọc tối thiểu

Root `AGENTS.md`, `AI-Agent/state/project.json`, `AI-Agent/context/PROJECT_MAP.md`, phần environment + unknown trong `AI-Agent/context/BASELINE.md`. Chỉ mở master plan mục có liên quan.

## Snapshot trước khi thực hiện (lịch sử)

-   Pinned HEAD `9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb`; có 9 tracked files đã sửa từ trước.
-   Local Node 22.19.0/pnpm.cmd 12.18.0 lệch engines ^24/^10.26.0.
-   Không đổi execution policy; dùng `.cmd`. Không reset patch hoặc tái sinh lockfile tùy tiện.
-   CodeGraph đã truy xuất được trong phiên trước; xác minh kết nối hiện tại bằng truy vấn cụ thể khi cần.

## Bước thực hiện khi được giao task

1. Kiểm tra Git hiện tại so với snapshot; xác định các patch chưa commit có ảnh hưởng install/runtime.
2. Dùng môi trường Node 24 và pnpm 10 phù hợp repo qua phương thức sẵn có/được cho phép. Ghi chính xác phiên bản, không hardcode engine từ blog.
3. Install frozen lockfile và build theo script repo, giữ full log local. Nếu lockfile mismatch, chẩn đoán và ghi quyết định trước khi thay đổi dependency.
4. Start một instance local/disposable, ghi URL/auth/DB thực tế từ config/log; không đọc/đưa secrets vào docs.
5. Qua UI tạo/export một flow assistant tối thiểu từ metadata thật; controlled prediction dùng provider profile đã cấu hình. Nếu chưa có credential, ghi rõ runtime execution chưa thể xác minh.
6. Kiểm tra create/update/read và prediction behavior của draft/private, org/workspace auth; không suy đoán deployment flags.
7. Ghi fixture sanitized + runtime evidence, source entry points cần bổ sung và security/license inventory trong scope kế tiếp.
8. Cập nhật state/checkpoint + worklog với commands/test outcomes và next task.

## Allowed scope

Baseline docs/fixtures/logs local; environment project-local; kiểm tra hẹp cần cho baseline. Chưa thêm UI/API Builder, auth bypass, connector mới hoặc production deploy. Nếu cần sửa lỗi baseline, lập patch có nguyên nhân và test tương ứng trong phạm vi người dùng giao; không gộp thay đổi không liên quan.

## Definition of done

-   [x] Node/pnpm phù hợp engine; frozen install và build thực sự thành công.
-   [x] Instance local start thành công; auth/DB/config không lộ secrets.
-   [x] Có một fixture flow V2 sanitized từ fork thật, mở lại canvas được.
-   [x] Controlled prediction Direct Reply trả lời được; LLM provider chưa được cấp credential nên đường model chưa xác minh.
-   [x] Contract behavior draft/private/auth được ghi với bằng chứng; cờ deployed không chặn prediction ẩn danh.
-   [x] Baseline cập nhật và phạm vi demo D1/B-002 sẵn để chốt ở task tiếp theo.

## Kết quả và giới hạn

Node 24.15.0/pnpm 10.26.0 portable, frozen install, build 6/6 và server SQLite local đều đạt. Fixture Start → Direct Reply mở lại qua UI và prediction trả lời. `deployed=false`/`isPublic=false` vẫn cho phép prediction ẩn danh: xem [runtime evidence](../context/TASK-001_RUNTIME.md) trước khi thiết kế draft/preview. Chưa thử LLM provider hoặc cách ly chéo workspace/org; PH0-T07–T08 (B-002) phải chốt model profile, demo, license và owner xử lý rủi ro. Người dùng tự commit/push thay đổi của task này.

## Prompt bàn giao ngắn

“Đọc AGENTS.md và state chung; thực hiện TASK-001 theo baseline đã khảo sát. Dùng CodeGraph đúng phạm vi, giữ các patch sẵn có. Chưa triển khai Builder. Báo lệnh thực sự đã chạy, fixture/runtime đã chứng minh, phần còn thiếu và checkpoint cho AI tiếp theo.”
