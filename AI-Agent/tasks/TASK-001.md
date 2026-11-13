# TASK-001 — Chuẩn hóa môi trường và xác minh runtime baseline

**Status:** not_started. **Loại:** task triển khai tương lai; chưa được thực hiện trong phiên lập plan.
**Phụ thuộc:** PLAN-000. **Ước lượng:** 2–4 ngày tập trung, điều chỉnh theo lỗi môi trường.

## Mục tiêu

Chứng minh Flowise tại fork này build/start được và một Agentflow V2 fixture chạy đúng. Tái sử dụng source map đã có; không khảo sát lại toàn repo hoặc viết Builder ngay.

## Đọc tối thiểu

Root `AGENTS.md`, `AI-Agent/state/project.json`, `AI-Agent/context/PROJECT_MAP.md`, phần environment + unknown trong `AI-Agent/context/BASELINE.md`. Chỉ mở master plan mục có liên quan.

## Hiện trạng cần nhớ

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

-   [ ] Node/pnpm phù hợp engine; install/build thực sự thành công hoặc lỗi đã được xác định, không báo pass giả.
-   [ ] Instance local start thành công; auth/DB/config không lộ secrets.
-   [ ] Có một fixture flow V2 sanitized từ fork thật, mở lại canvas được.
-   [ ] Controlled prediction trả lời được, hoặc trạng thái ghi rõ blocked dependency/credential và chưa đạt DoD toàn phần.
-   [ ] Contract behavior draft/private/auth được ghi với bằng chứng; không gọi cờ deployed là sandbox.
-   [ ] Baseline cập nhật và phạm vi demo D1/B-002 sẵn để bắt đầu.

## Prompt bàn giao ngắn

“Đọc AGENTS.md và state chung; thực hiện TASK-001 theo baseline đã khảo sát. Dùng CodeGraph đúng phạm vi, giữ các patch sẵn có. Chưa triển khai Builder. Báo lệnh thực sự đã chạy, fixture/runtime đã chứng minh, phần còn thiếu và checkpoint cho AI tiếp theo.”
