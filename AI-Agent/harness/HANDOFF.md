# Bàn giao Codex → Antigravity / Claude / Gemini

**Mục tiêu:** đổi AI khi hết quota hoặc giữa công việc, tiếp tục đúng task/subtask mà không đọc lại toàn dự án.

Các AI dựa vào **file chung trên đĩa và trạng thái code**, không tự chia sẻ lịch sử hội thoại hoặc suy nghĩ. `state/project.json` là checkpoint mới nhất được ghi; nó không biết những thao tác diễn ra sau lần ghi đó.

Kết thúc task và bàn giao bằng commit theo [GIT_WORKFLOW.md](GIT_WORKFLOW.md). `origin` đã nối fork của người dùng; commit local và push GitHub là hai thao tác riêng.

## 1. Nguồn thông tin cần khi tiếp nhận

| Nguồn                             | Cho biết                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `AI-Agent/state/project.json`     | Task, summary/subtask, checks, blockers, nextActions và revision đã bàn giao         |
| Task đang được giao               | Mục tiêu và acceptance; việc nào được phép làm                                       |
| `git status` + diff của đúng file | Code thực sự đã lưu, gồm cả phần chưa commit sau checkpoint                          |
| Log/job/process liên quan nếu có  | Lệnh đã chạy tới đâu, còn chạy hay đã kết thúc; kết quả chưa được checkpoint         |
| CodeGraph                         | Source/call paths cần hiểu cho bước đang làm, không dùng làm tiến độ thay checkpoint |

Kết luận “xong” cần acceptance và evidence. File tồn tại hoặc có diff không chứng minh tính năng đã chạy đúng.

## 2. Chuẩn bị trong lúc Codex đang làm

Không chờ gần hết quota mới ghi bàn giao. Quy ước cho mọi AI trong root instructions:

1. Khi bắt đầu task, ghi `in_progress`, mã task con trong summary, phạm vi file và bước kế tiếp.
2. Sau mỗi task con hoàn thành hoặc kết quả kiểm tra có ý nghĩa, cập nhật checkpoint.
3. Trước install/build/test hoặc tác vụ dài, ghi thao tác dự định và nơi lưu log nếu dùng. Có kết quả rồi mới ghi pass/fail thật.
4. Khi chuyển AI, cập nhật checkpoint lần nữa; giữ summary ngắn và next action cụ thể.

Ví dụ cho một task đang bao phủ nhiều task con:

```json
{
    "currentTask": "TASK-001",
    "status": "in_progress",
    "productStage": "baseline_in_progress",
    "summary": "VÍ DỤ: PH0-T01/T02 đã xác minh; PH0-T03 đang xử lý install. Không phải tiến độ hiện tại.",
    "decisions": [],
    "changedFiles": [],
    "checks": ["Ghi command, exit code và kết quả thực ở đây"],
    "blockers": [],
    "nextActions": ["Kiểm tra log install và trạng thái process; chưa chạy build nếu install chưa thành công"],
    "nextTask": "TASK-001"
}
```

Đây là ví dụ định dạng, không được dùng như bằng chứng Node/install đã xong. Harness hiện dùng `currentTask` cấp nhóm; mã nhỏ như `PH0-T03` ghi trong `summary`/`nextActions`, không thêm field tùy ý ngoài schema checkpoint.

Lưu payload thật tại `AI-Agent/.local/checkpoint-input.json`, đọc revision hiện tại rồi chạy:

```powershell
node AI-Agent/harness/harness.mjs checkpoint --file AI-Agent/.local/checkpoint-input.json --expect-revision N
```

Thay `N` bằng revision vừa đọc, không copy số của phiên cũ. CLI ghi state chung và Git/source fingerprint. File input là local; `state/project.json` mới là kết quả bàn giao cần giữ.

## 3. Khi chuyển sang Antigravity trên cùng máy

1. Dừng phiên Codex đang ghi file; kiểm tra các lệnh dài còn chạy. Không để hai AI cùng sửa cùng working tree.
2. Mở **cùng `D:\Flowise`** trong Antigravity, không mở riêng thư mục `AI-Agent` hoặc một clone khác.
3. Gửi prompt tiếp nhận bên dưới. AI đọc state/task, kiểm tra Git và chỉ mở phần source cần tiếp tục.
4. Nếu CodeGraph MCP chưa kết nối trong Antigravity, không mặc định cấu hình Codex đã được chuyển sang. Có thể dùng CLI đã cài khi khả dụng; index không có thì không tự index.
5. Sau khi đối chiếu, AI ghi checkpoint mới với current revision rồi làm bước tiếp theo trong scope được giao.

Theo [Google Antigravity rules](https://antigravity.google/docs/rules/), root `AGENTS.md`/`GEMINI.md` là các vị trí discovery được hỗ trợ. Tuy nhiên `@filename` của Antigravity là file reference, khác import inline của Gemini CLI. Vì vậy phải xác nhận client thực sự thấy root rules và state; không coi adapter là bằng chứng đã nạp thành công trên máy này.

**Prompt copy/paste khi đã được giao triển khai task:**

```text
Tiếp nhận công việc Codex đang làm trong D:\Flowise.
Đọc AGENTS.md và AI-Agent/state/project.json, rồi task đang được giao.
Trước khi sửa, kiểm tra Git status/diff của các file liên quan và log/process còn chạy.
Nêu ngắn gọn: task/subtask hiện tại, phần đã được kiểm chứng, phần dở dang và bước tiếp theo.
Nếu checkpoint cũ hơn code trên đĩa, khôi phục tiến độ từ diff/log; không reset hoặc làm lại phần đã xong.
Chỉ tiếp tục phạm vi đã được giao. Dùng CodeGraph cho đúng source cần thiết, không quét lại toàn repo.
Ghi checkpoint sau mỗi subtask/kết quả kiểm tra quan trọng, trước thao tác dài và khi bàn giao.
```

Nếu chỉ muốn kiểm tra việc nạp ngữ cảnh, thêm: **“Chỉ báo trạng thái, chưa sửa code hoặc chạy task triển khai.”** Hiện project vẫn `planning_only`/Builder chưa bắt đầu; một lần mở Antigravity không tự cho phép triển khai sản phẩm.

## 4. Nếu Codex đã hết quota đột ngột

-   Antigravity vẫn đọc được checkpoint và code đã lưu trên cùng ổ đĩa. Không cần Codex hoạt động để chạy harness.
-   So fingerprint/HEAD với Git hiện tại; xem diff ở file liên quan. Đánh dấu phần sau checkpoint là **chưa được xác minh**, rồi kiểm tra hẹp để xác định trạng thái.
-   Log có kết quả thực thì dùng; không có thì chạy lại check phù hợp. Lệnh còn chạy thì kiểm tra trạng thái trước khi khởi chạy trùng.
-   Ghi lại checkpoint đã khôi phục, chỉ rõ suy luận nào từ diff và kiểm tra nào thực sự đã chạy.

Giới hạn: nội dung chưa được lưu ra file, chưa ghi log/checkpoint và chưa commit không thể tự khôi phục từ suy nghĩ của AI trước. Chưa có hook nền bắt mọi tool call hay dự báo thời điểm hết quota. Checkpoint thường xuyên giảm phạm vi phải khôi phục, không bảo đảm mất ngữ cảnh bằng 0.

## 5. Nếu đổi máy hoặc clone

Cần chuyển cùng code revision, task docs, root rules và shared state. Những thay đổi chưa commit cũng phải được chuyển có kiểm soát; chỉ pull branch chưa chắc có phần Codex đang làm. `.local/` mặc định bị Git ignore, nên log/usage không tự đi theo; chỉ chia sẻ phần cần thiết đã review.

Không tự commit/push/đưa raw logs lên dịch vụ khác chỉ để bàn giao. Cấu hình MCP và secrets của từng app/máy cần thiết lập riêng.

## 6. Điều kiện nghiệm thu H-T05–H-T07

-   Một client làm dở task thử rồi checkpoint; client khác nêu đúng task/subtask và next action.
-   Tiếp nhận được khi có edit sau checkpoint; không báo phần đó đã test khi chưa có bằng chứng.
-   Không đọc lại toàn bộ repo/blueprint; không reset patch cũ hoặc chạy trùng job còn sống.
-   Antigravity và các client thực tế đều xác nhận root rules; kiểm tra riêng MCP nếu task cần.

Các bước này là quy trình/checklist đã bổ sung; phiên hiện tại chưa chạy ứng dụng Antigravity để chứng nhận nghiệm thu.
