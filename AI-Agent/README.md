# Trung tâm bàn giao dự án Flowise Chat-to-Agent

**Ngày khảo sát: 14/11/2026. Trạng thái: đã lập kế hoạch; chưa triển khai Builder.**

**Xem trước: [PLAN_TONG_HOP.md ở root repo](../PLAN_TONG_HOP.md) — 7 phase, 68 task sản phẩm + 8 task harness; có danh sách task con và tiêu chí từng phase trong cùng một file.**

Yêu cầu của sếp: thay thao tác kéo thả đối với người dùng nghiệp vụ bằng hội thoại; khi đủ thông tin, hệ thống tự build Agent. Hướng phát triển trên Flowise là phù hợp. Canvas vẫn hữu ích cho developer kiểm tra kết quả.

## Bắt đầu một phiên với Codex, Claude hoặc Gemini

1. Mở workspace tại **root Flowise**, không mở riêng `AI-Agent`.
2. Đọc root `AGENTS.md`, [trạng thái chung](state/project.json), [bản đồ dự án](context/PROJECT_MAP.md) và task được giao.
3. Dùng CodeGraph để lấy đúng source cần thiết. Không đọc lại toàn repo.
4. Kết thúc phiên: ghi kết quả kiểm tra và bước tiếp theo vào trạng thái chung. AI tiếp theo kiểm tra Git hiện tại rồi làm tiếp.

Có thể thay bước đọc state/map/task bằng một pack có giới hạn:

```powershell
node AI-Agent/harness/harness.mjs context --task AI-Agent/tasks/TASK-001.md
```

Pack được ghi ở `AI-Agent/.local/context-pack.md`; chỉ gửi pack **hoặc** các tài liệu tương ứng, tránh gửi cả hai.

## Đọc theo nhu cầu

| Cần biết                                                | File                                                 |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Tổng cộng bao nhiêu phase, mỗi phase bao nhiêu task con | [PLAN_TONG_HOP.md](../PLAN_TONG_HOP.md)              |
| Làm tới đâu, ai tiếp tục việc gì                        | [state/project.json](state/project.json)             |
| Phương án hệ thống, phạm vi, mốc nghiệm thu             | [plans/MASTER_PLAN.md](plans/MASTER_PLAN.md)         |
| Tài liệu gốc đúng/chưa đúng điểm nào                    | [plans/DOCUMENT_REVIEW.md](plans/DOCUMENT_REVIEW.md) |
| Source đã khảo sát, môi trường, thay đổi có sẵn         | [context/BASELINE.md](context/BASELINE.md)           |
| Entry point cần mở cho từng loại task                   | [context/PROJECT_MAP.md](context/PROJECT_MAP.md)     |
| Hợp đồng dữ liệu, API, trạng thái dự kiến               | [plans/CONTRACTS.md](plans/CONTRACTS.md)             |
| Danh sách công việc và phụ thuộc                        | [plans/BACKLOG.md](plans/BACKLOG.md)                 |
| Quyết định kiến trúc và lý do                           | [decisions/ADR-001.md](decisions/ADR-001.md)         |
| Việc kế tiếp, chưa được triển khai trong phiên lập plan | [tasks/TASK-001.md](tasks/TASK-001.md)               |
| Harness, đo token, bàn giao giữa các AI                 | [harness/README.md](harness/README.md)               |
| Codex hết quota: chuyển Antigravity làm tiếp            | [harness/HANDOFF.md](harness/HANDOFF.md)             |
| Đóng gói Builder/API thành MCP tools                    | [tasks/PH6-T12.md](tasks/PH6-T12.md)                 |
| Fork GitHub và commit theo từng task/phase              | [harness/GIT_WORKFLOW.md](harness/GIT_WORKFLOW.md)   |
| Lịch sử ngắn đã làm                                     | [state/WORKLOG.md](state/WORKLOG.md)                 |

## Cấu trúc và nguồn sự thật

```text
AGENTS.md / CLAUDE.md / GEMINI.md    Điểm vào ở root repo
AI-Agent/
  context/                          Kiến thức đã đối chiếu source
  plans/                            Thiết kế và backlog, chưa phải tính năng có sẵn
  decisions/                        Quyết định có lý do và giới hạn
  state/project.json                Tiến độ + checkpoint chung duy nhất
  state/WORKLOG.md                   Lịch sử ngắn; không tự động nạp vào prompt
  tasks/                            Task có tiêu chí nghiệm thu
  templates/                        Mẫu giao việc và bàn giao
  harness/                          CLI cục bộ, không dependency, không gọi LLM
  .local/                           Cache/log/usage cục bộ, Git ignore
  .claude/ .codex/ .agents/ scripts/  Mẫu cũ được giữ nguyên
```

Không tạo thêm `CURRENT.md`, `TODO.md`, `memory.md` chứa cùng tiến độ ở nhiều chỗ. `project.json` giữ trạng thái mới nhất; backlog giữ phụ thuộc/mốc, task giữ acceptance. Khi một task hoàn thành, cập nhật các mục liên quan cùng phiên.

## Lưu ý về bộ mẫu đã có

Các thư mục `.claude`, `.codex`, `.agents` hiện nằm **bên trong** `AI-Agent`. Chúng chưa được chứng minh là cấu hình tự động được nạp khi mở root Flowise. `.codex/config.toml` còn nhắc dự án Trello khác; `.claude/README.md` trỏ đến tài liệu không tồn tại. Các thư mục rules/skills phần lớn chỉ có `.DS_Store`.

`scripts/sync-ai-config.py` đồng bộ template, không lưu tiến độ; hàm reset của nó xóa cây thư mục đầu ra trước khi sinh lại. Không chạy script này để kích hoạt harness mới. Phiên này giữ nguyên toàn bộ mẫu cũ.

Các file mới chưa tự đồng bộ sang máy khác: cần đưa chúng vào Git/PR theo quy trình của nhóm. Không có dịch vụ nền theo dõi hoặc tự chuyển giao giữa ba AI.
