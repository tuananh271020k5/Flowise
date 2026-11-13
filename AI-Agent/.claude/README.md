# Thư mục `.claude` là gì?

Đây là **"sổ tay hướng dẫn" cho AI (Claude)**. Bạn không cần mở hay sửa các file trong này để dùng dự án.
Claude tự đọc chúng để biết phải làm việc thế nào.

Hình dung như một nhân viên mới vào công ty:

| Thư mục       | Giống như                                                  | Claude dùng khi nào                 |
| ------------- | ---------------------------------------------------------- | ----------------------------------- |
| `rules/`      | **Nội quy công ty** - luôn phải tuân theo                  | Luôn luôn, tự đọc mỗi lần mở        |
| `commands/`   | **Nút bấm làm việc có sẵn** - gõ `/tên` để chạy            | Khi bạn gõ lệnh, ví dụ `/build`     |
| `skills/`     | **Kỹ năng chuyên môn** - Claude tự lấy ra khi cần          | Khi việc bạn nhờ đúng chuyên môn đó |
| `plans/`      | **Bản kế hoạch dự án**                                     | Khi cần xem kế hoạch                |
| `references/` | **Tài liệu tra cứu** (API, phân quyền, thiết kế giao diện) | Khi cần tra                         |
| `policies/`   | **Nội quy dự phòng**, đang tắt                             | Không dùng                          |
| `hooks/`      | **Chuông nhắc tự động**, chưa lắp                          | Không dùng                          |

## Nội quy đang áp dụng (`rules/`)

| Nhóm     | Nội quy            | Nói dễ hiểu                                                                                                 |
| -------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `agent/` | token              | Trả lời ngắn gọn, đỡ tốn tiền                                                                               |
| `agent/` | multi-agent        | Việc lớn thì chia cho nhiều "trợ lý" làm cùng lúc                                                           |
| `code/`  | folder-structure   | Đặt file code đúng chỗ                                                                                      |
| `code/`  | naming-conventions | Đặt tên thống nhất                                                                                          |
| `docs/`  | docs-placement     | Tài liệu mới phải để trong `docs/`                                                                          |
| `docs/`  | asset-placement    | File không phải `.md` (html, json, ảnh, script...) để đúng thư mục, gốc dự án luôn sạch                     |
| `docs/`  | roadmap-sync       | Làm xong tính năng hoặc bạn xin tính năng mới, Claude tự cập nhật [roadmap](../docs/03-san-pham/roadmap.md) |

## Codex và Antigravity dùng chung thư mục này thế nào?

`.claude/` là **bản gốc duy nhất**. Script `scripts/sync-ai-config.py` sinh ra bản cho công cụ khác:

| Bản gốc                 | Sinh ra                                       | Công cụ đọc                            |
| ----------------------- | --------------------------------------------- | -------------------------------------- |
| `skills/` + `commands/` | `.agents/skills/` (lệnh được đổi thành skill) | Codex, Antigravity                     |
| `rules/`                | `.agents/rules/` (thêm `trigger:` bắt buộc)   | Antigravity; Codex đọc qua `AGENTS.md` |
| `agents/`               | `.codex/agents/*.toml`                        | Codex                                  |

Sửa trong `.claude/` rồi chạy `python3 -I scripts/sync-ai-config.py`. Không sửa tay `.agents/`.

## Bạn cần làm gì?

-   **Dùng hằng ngày:** không cần làm gì. Cứ nhờ Claude như bình thường.
-   **Muốn thêm nội quy mới:** nói với Claude "thêm quy tắc: ..." - Claude sẽ tạo file trong `rules/`.
-   **Muốn xem tiến độ dự án:** mở [docs/03-san-pham/roadmap.md](../docs/03-san-pham/roadmap.md), không phải thư mục này.
