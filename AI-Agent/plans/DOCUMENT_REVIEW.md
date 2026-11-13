# Đối chiếu blueprint V2 với yêu cầu và repo

**Kết luận:** đúng hướng kiến trúc cho yêu cầu trong ảnh. Chưa phải đặc tả đã triển khai và chưa thể coi mọi ví dụ/config trong tài liệu là đúng trên máy hiện tại.

| Nội dung tài liệu                                              | Đánh giá sau khảo sát                                          | Điều chỉnh                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fork Flowise, giữ runtime, thêm Chat-to-Agent                  | Phù hợp                                                        | Tiếp tục theo hướng này; canvas cho developer                                                               |
| Tách coding harness và Builder product                         | Đúng                                                           | Hai backlog và bộ tiêu chí riêng                                                                            |
| AgentSpec → plan → compiler → flowData                         | Hợp lý                                                         | Compiler/template deterministic cho đường chạy chính                                                        |
| API generator tồn tại                                          | Đã xác nhận source                                             | Nhận `question` và `selectedChatModel`; không đồng nghĩa có multi-turn Builder                              |
| `flowData` là string JSON                                      | Đã xác nhận entity/client                                      | Viết contract test trên fork khi triển khai                                                                 |
| Agentflow package dev.13                                       | README đúng là dev.13                                          | `package.json` thực tế dev.14; ưu tiên manifest                                                             |
| Repo Node 24, pnpm 10                                          | Đúng engines                                                   | Máy hiện Node 22, pnpm.cmd 12.18.0; P0 chưa đạt                                                             |
| Toàn bộ Flowise Apache-2.0                                     | Thiếu ngoại lệ                                                 | `LICENSE.md` nêu phần commercial và notice riêng; chưa kết luận quyền sử dụng                               |
| Archive 13/08, EOL 31/08/2026                                  | Có nguồn chính thức hỗ trợ                                     | Sunset ghi lịch archive dự kiến 10/08; GitHub ghi thực tế 13/08                                             |
| CodeGraph mặc định codegraph-ai/CodeGraph, profiles core/graph | Tài liệu tự ghi đây là giả định                                | Session này có MCP `codegraph_explore` và SQLite index; không áp CLI/profile/config của implementation khác |
| CodeGraph để tìm rồi đọc lại source                            | Có thể gây đọc trùng                                           | Tool hiện tại đã trả current source; chỉ đọc lại phần thiếu/stale                                           |
| `GEMINI.md` nghĩa là Antigravity                               | Không đủ chính xác cho yêu cầu hiện tại                        | Adapter mới nhắm Gemini CLI; host khác kiểm tra riêng                                                       |
| ZIP overlay/harness đã có test                                 | Không có ZIP/source overlay tương ứng trong file được cung cấp | Không kế thừa kết quả test đó; bộ local mới được kiểm tra riêng                                             |
| AI-Agent giúp tự biết tiến độ                                  | Chưa đạt trước phiên                                           | Bộ cũ chủ yếu template; bổ sung state/task/map/root entry point                                             |
| Làm 3 loại agent ngay MVP                                      | Quá rộng cho demo đầu                                          | Một assistant end-to-end trước, rồi Knowledge, API, SQL                                                     |
| Draft/private/undeployed                                       | Mặc định tốt                                                   | Không đủ chứng minh cách ly execution; cần kiểm tra prediction authorization                                |
| Hạn 2–3 lần sửa rồi blocked                                    | Quy ước tham khảo                                              | Ghi chẩn đoán và đổi hướng; không tự buộc task vào trạng thái blocked theo con số máy móc                   |
| Phải xin phép mỗi thay auth/deps/migration                     | Hướng dẫn nằm trong tài liệu tham khảo                         | Quyền làm việc do yêu cầu hiện tại và quy định phiên quyết định; lần này không sửa các phần đó              |

## Điều giữ lại

Chat-first UX, readiness có schema, versioning, idempotency, test/eval, credential references, bounded repair, compiler boundary, task memory và đo token thật đều nên giữ. Không viết MCP Builder ngay đầu; API/service ổn định trước.

## Phần chưa được chứng minh

Chưa có build/start Flowise tại môi trường hiện tại; chưa có exported flow fixtures đã chạy; chưa kiểm chứng auth end-to-end hoặc sandbox isolation; chưa có A/B token usage. Không thể gọi một bản thiết kế là tính năng hoàn tất.

Các thông tin CodeGraph ngoài tên tool/index hoạt động ở phiên này chưa được audit về implementation/version/cơ chế bảo mật. Không đổi MCP đang chạy hoặc tự reindex vì tài liệu có hướng dẫn mẫu.

Nguồn đã mở: [GitHub Flowise](https://github.com/FlowiseAI/Flowise), [Flowise sunset](https://flowiseai.com/sunset), cùng source/config/license tại HEAD ghi trong [BASELINE](../context/BASELINE.md). Tài liệu gốc giữ nguyên để truy nguyên; bản kế hoạch mới ghi các điều chỉnh ở đây.
