# Baseline khảo sát — 14/11/2026

Đây là kết quả đọc source/config, không phải chứng nhận ứng dụng đã chạy.

## Repo và môi trường

| Mục                               | Kết quả thực tế                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Repo root                         | `D:\Flowise`                                                                         |
| HEAD                              | `9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb`                                           |
| Ngày commit HEAD                  | 2026-08-13                                                                           |
| Root version                      | 3.1.4                                                                                |
| `.nvmrc`                          | v24.15.0                                                                             |
| Root engines                      | Node `^24`, pnpm `^10.26.0`                                                          |
| Node đang chạy lúc khảo sát       | v22.19.0 — chưa đúng engine Flowise                                                  |
| pnpm `.cmd` đang chạy             | 12.18.0 — chưa đúng engine `^10.26.0`                                                |
| `pnpm --version` trong PowerShell | `.ps1` bị execution policy chặn; dùng `pnpm.cmd`                                     |
| Workspaces                        | server, ui, components, agentflow, api-documentation, observe                        |
| Agentflow manifest / README       | dev.14 / dev.13 — README chậm hơn manifest                                           |
| CodeGraph                         | `.codegraph/` có SQLite index; MCP `codegraph_explore` trả current source thành công |

Không thay Node, pnpm, execution policy hoặc cài package trong phiên này. Có `node_modules` không chứng minh dependencies tương thích.

## Dấu vết source đã xác minh

Các line là mốc tại lúc khảo sát; truy xuất lại theo symbol nếu file thay đổi.

| Bằng chứng                                                | Vị trí                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Prefix mount `/api/v1`                                    | `packages/server/src/index.ts:328`                                                              |
| UI API prefix `/api/v1`, refresh theo session             | `packages/ui/src/api/client.js:6`                                                               |
| Route create/update có permission middleware              | `packages/server/src/routes/chatflows/index.ts:7`, `:27`                                        |
| Tạo flow lấy org/workspace từ `req.user`                  | `packages/server/src/controllers/chatflows/index.ts:146`                                        |
| Flowise entity lưu `flowData: string`, workspace bắt buộc | `packages/server/src/database/entities/ChatFlow.ts:20`, `:73`                                   |
| Generator route/controller                                | `packages/server/src/routes/agentflowv2-generator/index.ts:5`; controller `:4`                  |
| Generator nhận question + model, gọi service              | `packages/server/src/controllers/agentflowv2-generator/index.ts:6`                              |
| Generator load catalog/templates, có queue mode           | `packages/server/src/services/agentflowv2-generator/index.ts:184`                               |
| Generator validate format có thể trả object error         | service trên `:238`; không coi HTTP 200 tự nó là build thành công                               |
| Client stringify flow, type mặc định AGENTFLOW            | `packages/agentflow/src/infrastructure/api/chatflows.ts:29`                                     |
| Branch Agentflow V2                                       | `packages/server/src/utils/buildChatflow.ts:481`                                                |
| Runner V2 parse graph, tìm start node                     | `packages/server/src/utils/buildAgentflow.ts:1541`, `:1591`                                     |
| Prediction route                                          | `packages/server/src/routes/predictions/index.ts:10`                                            |
| Canvas V2 có RequireAuth                                  | `packages/ui/src/routes/CanvasRoutes.jsx:61`                                                    |
| Validator hiện có                                         | `packages/server/src/services/validation/index.ts:21`; `packages/agentflow/src/core/validation` |
| Flow/node/edge shapes                                     | `packages/agentflow/src/core/types/flow.ts:13`                                                  |

Luồng chính đã map: UI API client → `/api/v1/chatflows` → permission middleware → controller `saveChatflow` → service → entity. Prediction → buildChatflow → type AGENTFLOW → executeAgentFlow. Generator hiện có là đường sinh flow; chưa thấy bằng chứng nó cung cấp đầy đủ conversation/session/spec/revision workflow như sản phẩm đề xuất.

Chưa audit toàn bộ auth chain, quyền generator, prediction/public endpoints, license của từng dependency hay mức ảnh hưởng của advisory. Những phần này là task riêng.

## Thay đổi có sẵn trước phiên — giữ nguyên

```text
M packages/components/nodes/memory/AgentMemory/MySQLAgentMemory/mysqlSaver.ts
M packages/components/nodes/memory/AgentMemory/PostgresAgentMemory/pgSaver.ts
M packages/components/nodes/memory/AgentMemory/SQLiteAgentMemory/sqliteSaver.ts
M packages/components/nodes/sequentialagents/Agent/Agent.ts
M packages/components/package.json
M packages/components/src/storage/AzureBlobStorageProvider.ts
M packages/ui/package.json
M pnpm-lock.yaml
M pnpm-workspace.yaml
?? .codegraph/
?? AI-Agent/
?? FLOWISE_AGENT_BUILDER_HARNESS_V2.md
```

Không gán tác giả hoặc mục đích cho các patch trên. Không reset/stash/format toàn repo. Đặc biệt không tự tái sinh lockfile trong phiên lập plan.

## Kiểm tra thực sự đã chạy

-   `git status --short`, `git rev-parse HEAD`, `git log -1 --format=%cs`, `git diff --stat`.
-   `node --version`: v22.19.0. `pnpm.cmd --version`: 12.18.0.
-   Đọc toàn bộ blueprint theo phần; đọc manifest/config/license và template AI-Agent.
-   Truy xuất CodeGraph cho generator, CRUD, runner, canvas, validation và flow types; tìm bổ sung chi tiết chưa được trả về.
-   Kết quả kiểm tra harness mới được ghi riêng trong `state/project.json` và `state/WORKLOG.md` sau khi chạy.
-   **Chưa chạy** install/build/start/test sản phẩm Flowise; chưa gọi model hoặc endpoint có tính phí.

## Nguồn bên ngoài đã mở ngày 14/11/2026

-   [Repo Flowise](https://github.com/FlowiseAI/Flowise) hiển thị archived 13/08/2026.
-   [Thông báo sunset](https://flowiseai.com/sunset): lịch archive dự kiến 10/08/2026, EOL 31/08/2026. Phân biệt ngày dự kiến với trạng thái GitHub thực tế.
-   [Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md): discovery theo root/cwd; vì vậy tạo entry point ở root.
-   [Claude project memory](https://code.claude.com/docs/en/memory): dùng import `@AGENTS.md` cho adapter Windows.
-   [Gemini CLI context](https://geminicli.com/docs/cli/gemini-md/): root `GEMINI.md`; kiểm tra nạp file bằng `/memory show`.

Về giấy phép: `LICENSE.md` local ghi ngoại lệ commercial cho enterprise directory và file có notice riêng như IdentityManager. Ghi nhận phạm vi này trong kế hoạch; việc xác định quyền sử dụng cụ thể cần người phụ trách kiểm tra, chưa được kết luận ở đây.

## Cập nhật sau TASK-001 — 14/11/2026

Phần trên là snapshot khảo sát ban đầu. Sau khi người dùng giao TASK-001, Node 24.15.0/pnpm 10.26.0 portable, frozen install, build 6/6, server SQLite local, CRUD flow, canvas V2 và Direct Reply prediction đều đã được chạy thật. Lockfile phải đồng bộ vì root `resolutions` được pnpm gộp vào `overrides`; diff lớn cần review trước commit. [Bằng chứng, lệnh, kết quả và giới hạn](TASK-001_RUNTIME.md).

Phát hiện quan trọng: flow `deployed=false`/`isPublic=false` vẫn trả lời prediction ẩn danh. Đây là hành vi hiện tại cần xử lý trước khi Builder tạo draft chứa dữ liệu nhạy cảm. Chưa thử LLM provider, cross-workspace và tích hợp Couchbase native trên Windows. B-002/PH0-T07–T08 cần chốt demo/model profile, owner fork, license/advisory và hướng bảo vệ preview.
