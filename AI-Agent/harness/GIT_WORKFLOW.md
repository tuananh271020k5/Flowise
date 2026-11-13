# Git workflow — commit theo task trong từng phase

**Thiết lập đã thực hiện ngày 14/11/2026 tại `D:\Flowise`.** Repo local đã có Git và lịch sử Flowise; không cần `git init` hoặc clone đè lên thư mục hiện tại.

## 1. Repository đã kết nối

| Mục                           | Giá trị                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `origin` fetch/push           | `https://github.com/tuananh271020k5/Flowise.git` — fork của người dùng |
| `upstream`                    | `https://github.com/FlowiseAI/Flowise` — nguồn Flowise gốc             |
| Local branch hiện tại         | `main`, theo dõi `origin/main`                                         |
| Push remote mặc định của repo | `origin`                                                               |
| `push.default` của repo       | `simple`                                                               |
| HEAD nền lúc kết nối          | `9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb`                             |

Đã xác minh fork có `main` cùng SHA nền, fetch thành công và đặt tracking. Git đã có danh tính author từ cấu hình hiện tại; không thay tên/email hoặc credential. Sau khi người dùng yêu cầu commit/push, commit baseline `8f3e3946` đã được push thành công lên origin/main, xác minh kết nối ghi GitHub.

## 2. Quy ước phase → task → commit

-   **Một phase:** có thể dùng một branch, ví dụ `phase/ph0-baseline`.
-   **Một task con hoàn thành:** một commit có scope rõ và mã task, ví dụ PH0-T02.
-   Commit bao gồm code/test cần thiết và task/state docs tương ứng; không gom nhiều task không liên quan.
-   Khi phase đạt gate, review rồi merge vào `main` theo quy trình nhóm. Nếu muốn giữ lịch sử từng task trên main, tránh squash cả phase thành một commit.
-   Với task lớn cần nhiều commit, mỗi commit vẫn mô tả một thay đổi nhất quán; task chỉ hoàn thành khi acceptance đạt.

Tên commit đề xuất:

```text
docs(PLAN-000): add project plan and coding harness
chore(PH0-T02): align Node runtime with repository engines
feat(PH1-T07): add chat builder page
fix(PH2-T08): prevent duplicate drafts on build retry
test(PH4-T07): add knowledge agent evaluation cases
```

Tên trên là ví dụ; chưa chứng minh các task sản phẩm đó đã được làm.

## 3. Trước khi bắt đầu phase/task

```powershell
git status --short
git branch -vv
git remote -v
```

Hiện có các patch product/dependency từ trước khi lập plan. Không reset/stash/commit tất cả chỉ để làm sạch working tree. Xác định phạm vi của task mới và ghi nhận patch có sẵn.

Khi thực sự bắt đầu phase, có thể tạo branch:

```powershell
git switch -c phase/ph0-baseline
```

Lệnh trên chưa được chạy trong phiên chỉ kết nối Git. Trước `pull`/merge/switch branch khác, kiểm tra working tree để tránh xung đột với phần đang làm.

## 4. Kết thúc một task con

1. Chạy kiểm tra phù hợp, ghi command và kết quả thật.
2. Cập nhật task, checkpoint và worklog: việc hoàn tất, phần còn thiếu, next action.
3. Review diff; chọn đúng file/hunk thuộc task. Nếu file có sửa đổi cũ không liên quan, không stage nguyên file theo thói quen.
4. Stage có chủ đích, xem staged diff, rồi commit khi người dùng giao thực hiện commit.
5. Xác nhận commit SHA, file còn dở và trạng thái push; báo lại cho người dùng.

Ví dụ commit tài liệu với các file cụ thể đang tồn tại:

```powershell
git add -- PLAN_TONG_HOP.md AGENTS.md CLAUDE.md GEMINI.md
git diff --cached --stat
git diff --cached
git commit -m "docs(PLAN-000): document project plan and shared instructions"
```

Ví dụ chỉ stage bốn file đó, **không phải toàn bộ docs/harness của PLAN-000**. Khi đóng gói task đầy đủ phải thêm đúng các tài liệu/script/test liên quan sau khi review. Không dùng `git add .`, `git add -A` hoặc `git commit -am` để vô tình gom các patch từ trước.

Nếu task chưa đạt acceptance, giữ `in_progress` và checkpoint phần dở. Chỉ tạo commit WIP khi được yêu cầu; commit WIP không làm task thành completed.

## 5. Commit và push là hai việc riêng

`git commit` lưu lịch sử trên máy; `git push` đưa commit lên fork GitHub. Kết nối remote không tự tải các file đang sửa lên GitHub.

Khi được yêu cầu push branch phase lần đầu:

```powershell
git push -u origin phase/ph0-baseline
```

Các lần sau trên branch đã tracking có thể dùng `git push`. Main hiện theo dõi `origin/main`; không push lên `upstream`, không force-push hoặc sửa lại lịch sử đã chia sẻ nếu chưa có yêu cầu rõ.

Nếu GitHub cần xác thực, dùng credential manager/GitHub login theo môi trường máy; không đưa token vào remote URL, tài liệu, chat hoặc commit. Việc fetch public thành công không chứng minh push đã được cấp quyền.

## 6. Bàn giao sau commit

AI tiếp theo dùng task/checkpoint cùng `git log -5 --oneline`, `git status --short` và diff liên quan. Cần biết task đã commit nhưng chưa push hay đã có trên origin.

Checkpoint chụp Git HEAD tại thời điểm ghi, thường **trước commit** chứa checkpoint. Sau commit, doctor có thể cảnh báo HEAD/fingerprint đổi; đối chiếu `git show` với task và parent commit để xác nhận thay đổi, không lập tức kết luận memory sai.

Không cố nhét SHA của chính commit chứa `project.json` vào file đó trong cùng commit: SHA chỉ tồn tại sau khi commit được tạo. Dùng Git history để lấy SHA thực; checkpoint tiếp theo có thể tham chiếu commit trước.

Quy trình khi Codex hết quota vẫn theo [HANDOFF.md](HANDOFF.md). Trên cùng máy, code chưa commit vẫn còn trên đĩa; đổi máy thì phải chuyển cả code và state phù hợp, không chỉ đọc branch cũ từ GitHub.

## 7. Những gì phải giữ ngoài Git

-   `.codegraph/`: SQLite index, daemon state, cache cục bộ; ignore không xóa hoặc tắt CodeGraph.
-   `AI-Agent/.local/`: context packs, log gốc, usage, lock và checkpoint input cục bộ.
-   Credentials và dữ liệu riêng theo `.gitignore` hiện có.

Root instructions, plan, task, sanitized shared state và harness source/test nên đi cùng commit task phù hợp để AI trên máy khác tiếp tục được.

## 8. Trạng thái sau yêu cầu commit/push

Người dùng đã yêu cầu commit và push toàn bộ phần công việc hiện có. Các patch code/dependency được tách thành commit baseline `8f3e3946` và đã push thành công. Bộ plan, harness, instructions, shared state và blueprint được đóng gói riêng trong commit PLAN-000 chứa tài liệu này; xem Git history để lấy SHA của nó. Commit hooks được chạy theo cấu hình repo, không tắt kiểm tra.

Việc lưu/push các patch baseline không đồng nghĩa Flowise build/runtime đã được xác minh; môi trường và kiểm thử sản phẩm vẫn thuộc TASK-001. Các cache/log local tiếp tục bị ignore.
