# Project map — chỉ dẫn truy xuất ngắn

-   Mục tiêu: Chat → yêu cầu có cấu trúc → Agentflow V2 draft → test → chỉnh bằng chat.
-   Nền đã khảo sát: Flowise 3.1.4; TASK-001 chạy trên `main` tại `c31ae010ad0da23b823abbc31c16a9e732025dad`. Builder chưa được triển khai.
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

Controller tạo flow lấy organization/workspace từ `req.user`; không được thay bằng trường do LLM/user body tự gửi. Runtime TASK-001 chứng minh `deployed=false` và `isPublic=false` **vẫn cho phép prediction ẩn danh**; xem [bằng chứng](TASK-001_RUNTIME.md) trước khi thiết kế draft/preview.

Đã xác minh build/start, auth local, CRUD flow, canvas V2 và Direct Reply prediction. Chưa xác minh provider LLM, cách ly chéo workspace/org hoặc tiết kiệm token thật. Xem [TASK-001_RUNTIME.md](TASK-001_RUNTIME.md); bước kế tiếp [B-002](../tasks/B-002.md)/PH0-T07–T08.
