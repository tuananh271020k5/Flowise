# Project map — Chat-to-Agent

- Mục tiêu: chat tiếng Việt thu thập → tự build Agentflow V2 → chat thử → sửa qua chat, trên cùng trang.
- Hiện trạng18/11/2026: B-030-T06 đã sửa lỗi mất `{{question}}` sau Retriever, sửa `DirectReply` nhánh ngoài phạm vi, sửa `Start/Rendered`, và đổi cơ chế auto-build sang trao đổi nhiều lượt → hướng dẫn ngay lượt đầu → chỉ tự động build khi người dùng nhắn `"xong"` (hoặc bấm nút **Xong — Tạo Agent**); Jest backend/UI, `prepare-builder` 61 files và runtime check cô lập đều pass. Không dùng kết luận cũ “76/76 hoàn thành”.
- Baseline Flowise3.1.4; HEAD/fingerprint trong state phải đối chiếu Git diff. Các sửa B-028–B-030 chưa commit/push trong phiên này.
- Node hệ thống22, runtime24 portable. Chạy `node AI-Agent/scripts/prepare-builder.mjs` rồi `node AI-Agent/scripts/run-builder.mjs`; UI `127.0.0.1:8080/agent-builder`, API3037. Guide: `AI-Agent/GUI_TEST_GUIDE.md`.

| Phần | Entry point |
| --- | --- |
| Trang Builder / SSE / revisions | `packages/ui/src/views/agent-builder/index.jsx` |
| Chat thiết kế / chat thử / cấu hình model | `ChatPane.jsx`, `TestChatPane.jsx`, `ModelSettingsDialog.jsx` trong cùng thư mục |
| Kế hoạch bước và kết nối trên UI | `packages/ui/src/views/agent-builder/WorkflowPanel.jsx` |
| REST client | `packages/ui/src/api/agentBuilder.js` |
| Auth + routes | `packages/server/src/routes/agent-builder/index.ts`, controller tương ứng |
| Session/spec/readiness | `packages/server/src/services/agent-builder/sessionService.ts`, `collectorService.ts`, `readiness.ts`, `schema.ts` |
| Model / credential | `modelSettingsService.ts`; Variable lưu profile và credential ID; key mã hóa trong Credential của workspace |
| Build / graph | `pipeline/buildPipelineService.ts`, `generator/compiler.ts`, `generator/agentPlan.ts` |
| Workflow planner / schema / compiler | `workflow.ts`, `collectorService.ts`, `generator/compileWorkflow.ts`; template `workflow_v1`, tối đa12 bước, DAG + data binding |
| Upload / truy xuất tài liệu | `knowledge/documentUploadService.ts`; `packages/components/nodes/vectorstores/DocumentStoreVS/builderKnowledge.ts`, `packages/components/nodes/agentflow/Retriever/Retriever.ts`; keyword hoặc vector API thật, nguồn có auth |
| Preview / evaluation | `runtimePredictionService.ts` → `utils/buildChatflow.ts` → runtime V2; `pipeline/evaluationRunnerService.ts` |
| Vai trò / thông tin hiện tại / web | `agentBehaviorPolicy.ts` tạo overlay mỗi preview, ngày UTC, web mặc định tắt; `components/nodes/agentflow/webCitations.ts` giữ URL annotations |
| MCP | `mcp/httpTransport.ts` (Streamable HTTP), `mcp/builderMcpService.ts` (5 tools) |
| SQL / sandbox | `sql/readonlyDriver.ts`, `custom-tools/isolatedExecutor.ts` |
| Persistence | `database/entities/BuilderSession.ts`, `AgentSpecRevision.ts`, `AgentDraftRevision.ts`, `BuildJob.ts`, `ChatFlow.ts` |

Path ngắn tương đối với `packages/server/src/services/agent-builder/`, trừ UI/runtime/database. Graph B-030 theo workflow: Start → LLM/Agent/Retriever/Condition/DirectReply và nhánh đã kiểm tra. Model/tools lồng trong node V2. Legacy spec không workflow dùng compiler cũ; phiên mới cần kế hoạch trước build. Mỗi revision có flow riêng; spec không đổi không tạo revision. API spec là JSON string, revision là `revisionNo`.

Preview dùng route có đăng nhập `/api/v1/agent-builder/drafts/:id/preview`. Endpoint prediction công khai chặn builder draft/private khi không có workspace phù hợp. Không coi `deployed=false` của Flowise gốc là đủ để cách ly. Canvas V2: `/v2/agentcanvas/:id`.

Kết quả đo và bằng chứng: `AI-Agent/plans/FINAL_ACCEPTANCE_REPORT.md`; log/DB/screenshots bỏ Git dưới `AI-Agent/.local/B-028/` và `B-030/`. B-030 kiểm tra upload/chunk/retrieval/graph execution thật bằng dữ liệu thử và HTTP model/embedding fixture; không thay nghiệm thu chất lượng với tài liệu khách hàng/provider thật. API/SQL Agent tích hợp trọn vòng, approval/SharePoint/Fabric/Word add-in và production gates còn cần nghiệm thu riêng. Token savings chưa đo; usage chỉ ghi số provider trả về, gồm lần repair nếu có đủ metadata.

Windows đã bugcheck0x133 khi build nặng. Chạy mọi build/test tuần tự, heap4096, Turbo concurrency1, Jest runInBand. Không tự reboot hay sửa driver. CodeGraph có index; nếu tool báo auto-sync disabled thì đọc source hiện tại trực tiếp. Harness không sửa quota hay điều khiển nguồn máy.
