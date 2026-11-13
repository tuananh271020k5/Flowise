# Project map — chỉ dẫn truy xuất ngắn

-   Mục tiêu: Chat → yêu cầu có cấu trúc → Agentflow V2 draft → test → chỉnh bằng chat.
-   Nền đã khảo sát: Flowise 3.1.4, HEAD `9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb`; working tree có thay đổi sẵn. Builder chưa được triển khai.
-   React UI: `packages/ui`; Express/API + TypeORM + runtime: `packages/server`; node/tool/model: `packages/components`.
-   `packages/agentflow` là editor/generator client, manifest `0.0.0-dev.14`; không phải execution engine độc lập.
-   `packages/observe` tồn tại; ngoài đường găng MVP. CodeGraph `.codegraph/` và MCP đã dùng được trong phiên khảo sát.

| Task                      | Entry point để hỏi CodeGraph                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Thêm trang chat           | `packages/ui/src/routes/MainRoutes.jsx`, `packages/ui/src/routes/RequireAuth`                                         |
| Mở canvas V2 hiện có      | `packages/ui/src/routes/CanvasRoutes.jsx`, `packages/ui/src/views/agentflowsv2/Canvas`                                |
| Gọi API theo session      | `packages/ui/src/api/client.js`, `packages/ui/src/api/chatflows.js`                                                   |
| Sinh flow sẵn có          | `packages/server/src/routes/agentflowv2-generator/index.ts`, controller/service cùng tên                              |
| Tạo/cập nhật flow         | `packages/server/src/routes/chatflows/index.ts`, `saveChatflow`, `updateChatflow`                                     |
| Persistence flow          | `packages/server/src/database/entities/ChatFlow.ts`, `packages/server/src/services/chatflows`                         |
| Chạy Agentflow V2         | `packages/server/src/utils/buildChatflow.ts`, `executeAgentFlow` trong `buildAgentflow.ts`                            |
| Validation                | `validateFlowData` trong `packages/server/src/services/validation/index.ts`, `packages/agentflow/src/core/validation` |
| Node metadata             | `packages/components/nodes/agentflow`, `packages/components/src/Interface.ts`                                         |
| Shape flow/client adapter | `packages/agentflow/src/core/types/flow.ts`, `bindChatflowsApi`                                                       |

Đã xác minh từ source: API prefix `/api/v1`; tạo/sửa qua `/chatflows`; generator `/agentflowv2-generator/generate` nhận `question` + `selectedChatModel`; `flowData` lưu dạng JSON string; Agentflow V2 dùng type `AGENTFLOW`. Canvas `/v2/agentcanvas/:id`.

Controller tạo flow lấy organization/workspace từ `req.user`; không được thay bằng trường do LLM/user body tự gửi. Không coi cờ `deployed=false` hay `isPublic=false` là sandbox hoặc lớp chặn prediction đã được chứng minh.

Chưa xác minh bằng runtime: build/start Flowise, auth end-to-end, export fixtures, tạo/chạy draft, policy cách ly, tiết kiệm token thật. Xem `BASELINE.md` khi task đụng những phần này.
