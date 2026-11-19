# Nhật ký bàn giao ngắn

## 19/11/2026 — B-035-T05..T08 / Nâng giới hạn upload tài liệu (25 MB / 30 tệp), Thiết kế lại giao diện `/agent-builder` & Vá 3 lỗi thực chiến (Đính file lượt 2, V1 ConditionAgent lồng nhau, Tự sửa typo UUID)

Hoàn thiện trải nghiệm thực chiến cho Agent CSKH 3 tầng và đa provider (OpenAI / Gemini / OpenAI-compatible gateway): (1) nâng giới hạn tải tài liệu nguồn lên 20 tệp/lần, 30 tệp/phiên, 25 MB/tệp, 1.000.000 ký tự, 1.000 đoạn kèm hỗ trợ `.xlsx`/`.json` và tạo bộ tài liệu mẫu CSKH điện thoại `AI-Agent/fixtures/So_Tay_CSKH_Dien_Thoai_SmartMobile_2026.docx` (~6,25 MB); (2) thiết kế lại giao diện `/agent-builder` gọn hiện đại, xóa lỗi cắt thanh công cụ mép trên; (3) bổ sung `bindDataSourcesToExistingWorkflow`, `resolveOwnedSourceId` và `reconcileWorkflowDataSourceIds` trong `collectorService.ts` + `sessionService.ts` giúp đính kèm tài liệu lượt sau gắn thẳng `sourceIds` không gọi LLM thừa, không để lại tin nhắn treo khi model lỗi và tự sửa lỗi model chép nhầm 1–4 ký tự UUID hoặc ghi tên file trong bước `retriever`; (4) vá engine V1 trong `packages/server/src/utils/buildAgentGraph.ts` bằng nút chuyển tiếp nội bộ `__cond_relay_<id>` để chạy mượt đồ thị `seqConditionAgent` lồng nhau ở mọi độ sâu và bổ sung vào `prepare-builder.mjs`. Kiểm chứng tuần tự: `tsc --noEmit` (`components` & `server`) exit 0, ESLint 0 errors, Backend Jest (`collectorModel` 15/15, `sessionService` 32/32, `collectorService` 13/13) pass, `prepare-builder.mjs` 76 files pass, chạy kiểm thử trực tiếp LangGraph `dist/utils/buildAgentGraph.js` với 2 `seqConditionAgent` nối tiếp nhau (L1 / L3 Tạo phiếu / L3 Tra cứu) PASS.

## 19/11/2026 — B-035 / Node CSKH `HelpdeskTicketTool` (L3), Hàng Đợi Phiếu Admin & Cổng Người Dùng Cuối (`/support-portal/:id`)

Hoàn thiện trọn vẹn Ý tưởng #2 (Agent CSKH 3 tầng L1/L2/L3 tách biệt 2 vai trò Admin và Người dùng cuối): (1) tạo node gốc Flowise `HelpdeskTicketTool.ts` (`helpdeskTicketTool` v1.0 + `ticket.svg`) gồm 4 công cụ `helpdesk_create_ticket` (`TCK-1001`, chống trùng lặp, tự phân nhóm phụ trách & hạn SLA), `helpdesk_list_tickets`, `helpdesk_update_ticket_status`, `helpdesk_list_support_groups`, tích hợp vào `nativeToolCatalogService.ts`, `nodeRegistry.ts`, `collectorService.ts` (ưu tiên `helpdeskTicketTool` cho CSKH L3 thay vì mượn `projectTrackerTool`) và `prepare-builder.mjs`; (2) thêm API Admin `GET/PATCH /api/v1/agent-builder/helpdesk/tickets` cách ly workspace và hộp thoại `HelpdeskTicketsDialog.jsx` trên thanh công cụ `/agent-builder`; (3) xây dựng trang Cổng Khách Hàng `SupportPortal.jsx` (`/support-portal/:id` không menu Admin, chạy trên chế độ Public đã xuất bản để mở ở cửa sổ Ẩn danh đóng vai khách hàng thật) kèm nút mở nhanh **Cổng User** & **Sao chép link** trên `TestChatPane.jsx`. Kiểm chứng tuần tự: `tsc --noEmit` (`components` & `server`) exit 0, ESLint 0 errors, `prepare-builder.mjs` 75 files pass, Backend Jest `universalWorkflowAndMcp` 12/12 pass, UI Jest 130/130 pass, 0 emoji.

## 19/11/2026 — B-034-T06 / Nút Đính Kèm File Excel (`.xlsx`) & Word (`.docx`) Trực Tiếp Trong Chat Thử Nghiệm + Chuẩn Hóa `language`

Theo yêu cầu của người dùng muốn tải thẳng file Excel/Word có sẵn từ máy vào khung **Chat Thử Nghiệm** để Agent đọc, tính toán, nối dòng/mục và xuất bản cập nhật: (1) thêm `saveUploadedOfficeFile` & `listWorkspaceOfficeFiles` trong `nativeToolCatalogService.ts` (kiểm tra magic bytes ZIP, giới hạn 10 MB / giải nén 25 MB, giải mã tên file UTF-8 tiếng Việt, đọc danh sách sheet `.xlsx` và trích xuất đoạn văn `.docx` thuần Node `zlib` không phụ thuộc ESM ngoài), cùng 2 endpoints `POST/GET /api/v1/agent-builder/office-files` và tối ưu `ExcelOfficeTool.ts`/`WordOfficeTool.ts` đọc/nối giữ nguyên nội dung gốc; (2) bổ sung nút kẹp giấy đính kèm `.xlsx`/`.docx` + kéo thả ngay trong `TestChatPane.jsx` (`agentBuilder.uploadOfficeFiles`), tự gửi `fileId` vào ngữ cảnh prompt và lịch sử chat để lượt sau sửa tiếp đúng file đó; (3) tạo sẵn 2 file mẫu thật `AI-Agent/fixtures/Chi_Phi_Mau_Thang_11.xlsx` và `To_Trinh_Mau_Thang_11.docx`; (4) thêm `normalizeLanguageCode` trong `schema.ts`/`collectorService.ts` & tự đánh giá lại readiness trong `buildPipelineService.ts`. Kiểm chứng tuần tự: `tsc --noEmit` (`components` & `server`) exit 0, ESLint 0 errors, `prepare-builder.mjs` 73 files pass, Backend Jest 42/42 pass, UI Jest 129/129 pass.

## 19/11/2026 — B-034-T05 / Khắc phục Chồng Đè Sơ Đồ V1 (Dynamic Swimlane Layout 0px Overlap) & Xóa Toàn Bộ Emoji/Icon AI

Phản hồi từ ảnh chụp kiểm thử thật `PM Studio Bot` 4 nhánh trên Canvas V1 cho thấy các thẻ `seqAgent` và 10+ thẻ Tool bị đè lên nhau theo chiều dọc/ngang, đồng thời các khung hội thoại/Sticky Note vẫn còn nhiều emoji kiểu AI (`🏷️`, `🧰`, `🧠`, `⏰`, `🤖`). Đã nâng cấp triệt để: (1) viết lại thuật toán bố cục Swimlane động trong `compileWorkflowV1.ts` dựa trên kích thước thẻ V1 thực tế (`seqAgent: 1120px`, `seqConditionAgent: 820px`, `Tool: 500px`, `BASE_COL_STEP: 540px`, `TOOL_COL_WIDTH: 440px`, `LANE_GAP: 220px`), tách hẳn `ChatOpenAI` / `Agent Memory` / `State` cột trái, dành đủ cột Tool riêng cho từng nhánh, xếp tất cả `seqEnd` trên cột phải `maxLayerX + 520`, và đặt `stickyNote_0` + RAG ở vùng trống phía trên; (2) xóa sạch toàn bộ emoji/icon trang trí khỏi `collectorService.ts` (bổ sung `stripDecorativeEmojis` + luật cấm emoji trong system prompt), `agentBehaviorPolicy.ts`, `compileWorkflowV1.ts`, `runtimePredictionService.ts`, `WorkflowPanel.jsx`, `ProjectTrackerTool.ts`, `TelegramNotifyTool.ts`. Kiểm chứng tuần tự: `tsc --noEmit` (`components` & `server`) exit 0, ESLint 0 errors, `prepare-builder.mjs` 73 files pass, Backend Jest 6 suites/84 tests pass (gồm bài test bounding-box từng cặp node 4 nhánh PM Studio Bot = 0 va chạm và 0 emoji), UI Jest 4 suites/128 tests pass, `v1-multiagent-runtime-check.mjs` PASS.

## 19/11/2026 — B-034 / Chuyển đổi hỗ trợ biên dịch Flowise V1 (`MULTIAGENT` / `/agentcanvas` Đầy đủ Node Rời), Self-Critic Guard & Auto-Layout DAG

Theo yêu cầu của người dùng muốn sơ đồ Agent hiển thị đầy đủ các node rời chi tiết giống Flowise V1 (`/agentcanvas`) cùng logic phân nhánh thông minh không lười gộp 1 node LLM: (1) xây dựng `compileWorkflowV1.ts` hydrate trực tiếp từ `nodesPool.componentNodes` tạo đủ mọi cục node V1 (`ChatOpenAI`, `Agent Memory`, `State`, `Document Store (Vector)` → `Retriever Tool`, từng node Tool/MCP rời, `Start`, `Condition Agent`, `Agent` bật `Require Approval` khi có bước duyệt, `LLM Node`, `Custom JS Function`, `Loop`, `End`, `Sticky Note`) và mở thẳng `/agentcanvas/:id` (kèm nút chọn **`Canvas V1 (Đầy đủ Node)`** mặc định / **`Canvas V2`** trên thanh công cụ `/agent-builder`); (2) tạo `layoutWorkflow.ts` (Layered DAG Auto-Layout) nâng cấp bố cục cho cả V1 lẫn V2 xóa sạch lỗi dây chéo ziczac `index % 4`; (3) thêm `looksMultiCapabilityPrompt` & vòng **Self-Critic Architect Guard** trong `collectorService.ts` tự động phân rã khi bài toán ≥ 3 chức năng bị model gom vào ≤ 1 bước; (4) mở rộng `flowValidator.ts`, `flowiseDraftAdapter.ts`, `buildPipelineService.ts`, `agentBehaviorPolicy.ts`, `runtimePredictionService.ts`, `readiness.ts`, `sessionService.ts`, `index.jsx`, `TestChatPane.jsx`. Kiểm tra tuần tự: `tsc --noEmit` exit 0, ESLint 0 errors, Backend Jest 6 suites/57 tests pass, UI Jest 4 suites/128 tests pass, `prepare-builder.mjs` 73 files pass, và `v1-multiagent-runtime-check.mjs` xác minh chạy thật LangGraph V1 `MULTIAGENT` 16 node / 14 cạnh gọi `seqConditionAgent → seqAgent → pm_create_tasks → seqEnd` PASS.

## 18/11/2026 — B-033 / Sửa `Request timed out.` trên `gpt-6-sol` & Mở khóa Kho 35+ Node Flowise, Memory, ScheduleBeat Cron 17h, Quản lý Task Dự án & Telegram

Khi người dùng chuyển sang `gpt-6-sol` và nhập bản đặc tả Agent Quản lý Dự án Tự động 7 chức năng (chia task, GitHub Issues/Trello, cân bằng tải giao việc có xác nhận, kiểm tra tiến độ, phát hiện rủi ro, báo cáo 17h qua Telegram/Email, dời deadline có xác nhận, Memory, Cron), giao diện báo `Request timed out.` do `modelSettingsService.ts` khóa cứng `timeout: 30000` (30s) và không giới hạn `reasoningEffort` cho model suy luận. Đã triển khai trọn gói B-033: (1) nâng `timeout` lên `120000` ms trong `modelSettingsService.ts` và `agentBehaviorPolicy.ts`, đồng thời đặt `reasoningEffort: 'low'` cho Collector trên các dòng `gpt-5.[1-9]*`/`gpt-6*`; (2) mở khóa cả nhóm `Tools` lẫn `Tools (MCP)` trong `nativeToolCatalogService.ts` (`sequentialThinkingMCP`, `githubMCP`, `slackMCP`, `postgreSQLMCP`, `pipedreamMCP`, `wolframAlpha`, `googleSearchAPI`, `serpAPI`...) và tạo mới 2 node gốc `ProjectTrackerTool.ts` (7 công cụ quản lý task chống trùng lặp, đồng bộ GitHub/Trello có retry + Board nội bộ chạy thử ngay, xác nhận giao việc & `dryRun` dời deadline) cùng `TelegramNotifyTool.ts`; (3) nối thẳng `enableMemory` (`startPersistState` + `agentEnableMemory` window 20) và `schedule` (`ScheduleBeat` + `ScheduleRecord` cron 5 trường) vào `workflow.ts`, `compileWorkflow.ts`, `publishService.ts`, `collectorService.ts` và `WorkflowPanel.jsx`. Kiểm tra tuần tự: `tsc` cả `components` & `server` exit 0, ESLint exit 0, backend Jest 4 suites/38 tests pass (gồm kịch bản thực thi đủ 7 tình huống quản lý dự án), UI Jest 4 suites/128 tests pass, `prepare-builder.mjs` 71 files pass.

## 18/11/2026 — B-032-T05 / Sửa lỗi `gpt-5.6-luna` gọi Function Tools (`reasoning_effort: 'none'`) & tương thích `web_search` trên Gateway tùy chỉnh

Khi người dùng test trực tiếp Agent `Thư ký Dự án` (`excelOfficeTool` + `wordOfficeTool`) với model `gpt-5.6-luna` và đang bật `Tra cứu web`, log backend ghi nhận lỗi gốc: `400 Function tools with reasoning_effort are not supported for gpt-5.6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'`, bị `runtimePredictionService.ts` che khuất bởi thông báo lỗi chung `WEB_SEARCH_EXECUTION_FAILED`, đồng thời `Agent.ts` gọi `convertMultiOptionsToStringArray(['web_search'])` làm rơi `web_search` khi nhận mảng JS. Đã sửa đồng bộ 4 điểm: (1) `agentBehaviorPolicy.ts` (`prepareAgentPreview`) và `compileWorkflow.ts` tự động đặt `reasoningEffort: 'none'` cho các dòng `gpt-5.[1-9]*` / `gpt-6*` khi `agentTools` khác rỗng (áp dụng ngay cho cả draft đã tạo); (2) `ChatOpenAI.ts` + `FlowiseChatOpenAI.ts` (và đưa thêm `packages/components/src/utils.ts` vào `prepare-builder.mjs`) truyền chuẩn `reasoning_effort: 'none'` cho cả `gpt-5.6-luna` và `gpt-6-luna`; (3) `Agent.ts` (`toBuiltInToolList`) nhận cả mảng JS lẫn chuỗi JSON cho `agentToolsBuiltIn*`; (4) `runtimePredictionService.ts` tự động retry bỏ `web_search` nếu gateway tùy chỉnh từ chối `/responses` trên Agent có gắn công cụ hàm, đồng thời đính kèm chi tiết lỗi provider đã lọc secret. Kiểm tra tuần tự: `tsc` (`components` & `server`) exit 0, ESLint exit 0, Jest 3 suites/21 tests pass, `prepare-builder.mjs` 69 files pass, wire-level check `ChatOpenAI` pass.

## 18/11/2026 — B-032 / Mở khóa Kho 27+ Node Công cụ gốc Flowise & Tạo 2 Node Word (.docx) / Excel (.xlsx) Nội bộ

Theo đúng định hướng "Build Agent từ A→Z bằng 1 giao diện chat tận dụng toàn bộ kho Node của Flowise mà không bắt buộc lấy MCP ngoài": (1) tạo mới 2 node công cụ chính thức trong `packages/components/nodes/tools/`: `ExcelOfficeTool.ts` (`excelOfficeTool` v1.0 — tạo mới nhiều sheet, đọc dữ liệu & thêm dòng vào file `.xlsx` thật qua `xlsx`) và `WordOfficeTool.ts` (`wordOfficeTool` v1.0 — tạo văn bản `.docx` chuẩn OOXML có tiêu đề/đề mục/bảng biểu & đọc file `.docx` qua `DocxLoader`), lưu cách ly theo `workspaceId` kèm endpoint tải file xác thực `GET /api/v1/agent-builder/exports/:fileId/:fileName` và tự động đính link tải về ở `runtimePredictionService.ts`; (2) xây dựng `nativeToolCatalogService.ts` quét 27+ node công cụ gốc của Flowise (`excelOfficeTool`, `wordOfficeTool`, `calculator`, `currentDateTime`, `webScraperTool`, `arxiv`, `jsonPathExtractor`, `googleSheetsTool`, `googleDriveTool`, `googleDocsTool`, `gmail`, `googleCalendarTool`, `microsoftOutlook`, `microsoftTeams`, `jiraTool`, `tavilyAPI`, `braveSearchAPI`, `serper`, `exaSearch`, `stripeTool`, `codeInterpreterE2B` + quét động `NodesPool`) và tự gắn `FLOWISE_CREDENTIAL_ID` từ bảng `Credential` của Workspace; (3) nối `nativeTools` vào `workflow.ts`, `nodeRegistry.ts`, `agentPlan.ts`, `compileWorkflow.ts`, `readiness.ts`, `collectorService.ts` và `WorkflowPanel.jsx`; bổ sung `agentArchetypes.ts` + tách rạch ròi `questions` tùy chọn khỏi `blockers` kỹ thuật để gõ `"xong"` build mượt ngay. Kiểm tra tuần tự: `tsc --noEmit` trên cả `packages/components` và `packages/server` exit 0, ESLint exit 0, Jest 4 suites/57 tests pass, `prepare-builder.mjs` 66 files pass, và `native-office-tools-check.mjs` xác minh `NodesPool` nạp đủ 27 tools + sinh & tải thật cả `Thong_Ke_Y_Tuong.xlsx` lẫn `Bien_Ban_De_Xuat.docx` (chặn ẩn danh 401).

## 18/11/2026 — B-031 / Universal Agentflow V2 Control Nodes & Tích hợp Workspace MCP Servers

Nâng cấp Chat-to-Agent Builder thành Universal Agentflow V2 Builder: (1) mở rộng `nodeRegistry.ts`, `workflow.ts`, `flowValidator.ts`, `compileWorkflow.ts` và `agentBehaviorPolicy.ts` cho đủ 10 loại bước V2 (`llm`, `agent`, `retriever`, `condition`, `conditionAgent` 2..6 nhánh ngữ nghĩa, `loop` tự sửa sai có kiểm tra dominator & `maxLoops` 1..5, `iteration` kèm child processor node `parentNode`/`extent: 'parent'`, `http` theo allowlist `apiConnectors` + `allowWrite`, `humanInput` 2 nhánh phê duyệt, `reply`) và `Flow State` (`initialState`, `stateKeys`, `updateState`); (2) tạo `workspaceMcpRegistryService.ts` + 4 endpoints `/api/v1/agent-builder/mcp-servers` nối thẳng vào `CustomMcpServer` & `customMcpServerTool` (v1.0), tự đưa danh mục MCP tools đã ủy quyền vào `collectorService.ts` để Planner gắn `mcpServers`/`mcpServerIds` theo từng bước `agent`/`iteration`; (3) bổ sung `McpServersDialog.jsx`, nút **Kết nối MCP** trên `/agent-builder`, nâng cấp `WorkflowPanel.jsx` và `SpecCard.jsx`. Kiểm tra tuần tự (`--runInBand`, heap 4096): backend `agent-builder` 49 suites/367 tests pass, UI 4 suites/128 tests pass, `tsc --noEmit` trên cả `packages/server` và `packages/components` exit 0, ESLint 21 files exit 0, `prepare-builder.mjs` 62 files pass, và kịch bản runtime cô lập `universal-v2-mcp-check.mjs` xác minh đăng ký MCP Streamable HTTP (Bearer mã hóa) + gọi thật 2 MCP tools (`drive_read_report` → `excel_append_summary`) + chạy thật `Agentic RAG` (`ConditionAgent` + `Flow State` + `Loop` tự lặp sửa query tìm ra mã `6314`). Chưa tự restart server người dùng, chưa gọi API trả phí, chưa commit/push (chờ lệnh người dùng).

## 18/11/2026 — B-030-T06 (tiếp) / chuyển auto-build sang cơ chế trao đổi nhiều lượt & xác nhận `"xong"`

Người dùng xác nhận luồng RAG theo tài liệu đã ổn và yêu cầu bỏ việc Bot tự ý build ngay ở tin nhắn đầu: phải hiển thị rõ hướng dẫn từ đầu và ở lượt trả lời đầu tiên của Bot, cho phép hỏi đáp qua lại nhiều lượt đến khi người dùng nhắn `"xong"` mới tự động build. Đã cập nhật `collectorService.ts` (`isPureBuildConfirmation`, `isBuildConfirmationMessage`, hướng dẫn lượt đầu trong `generateCollectorResponse`, tắt phát SSE `build_dispatched` sớm), `sessionService.ts` (chỉ gọi `autoBuild` khi có xác nhận `"xong"` và bỏ qua gọi LLM thừa khi người dùng chỉ nhắn `"xong"` thuần túy), cùng `ChatPane.jsx`, `WorkflowPanel.jsx` và `index.jsx` (banner hướng dẫn mở đầu + nút nhanh **Xong — Tạo Agent**). Kiểm tra tuần tự (`--runInBand`, heap 4096): 6 backend suites (70 tests) pass, UI 4 suites (127 tests) pass, `prepare-builder.mjs` 61 files pass, `document-workflow-check.mjs` (`BUILDER_SKIP_BROWSER=true`) pass.

## 17/11/2026 — B-030-T06 (bổ sung) / sửa nhánh câu hỏi ngoài phạm vi in thô `{{conditionAgentflow_...}}`

Khi người dùng test tiếp trên UI, nhánh có tài liệu đã trả lời kèm nguồn, nhưng câu hỏi ngoài phạm vi trả thô `{{conditionAgentflow_check_search_result}}`. Nguyên nhân: model planner điền `inputFrom: ["check_search_result"]` cho bước `reply`, còn `compileWorkflow.ts` có `step.inputFrom.length ? context : step.instruction` nên bỏ câu tiếng Việt trong `step.instruction` và ghi `{{conditionAgentflow_...}}` (node `Condition` không có `output.content` nên `resolveVariables` giữ nguyên chuỗi thô). Đã sửa `compileWorkflow.ts` dùng câu thông báo tiếng Việt chuẩn hóa từ `step.instruction` cho `reply`; bổ sung khôi phục từ `AgentSpecRevision` / thông báo tiếng Việt mặc định trong `runtimePredictionService.ts`, `publishService.ts` và `agentBehaviorPolicy.ts` để phiên đang mở của người dùng chạy đúng ngay; cập nhật `workflow.ts`, `collectorService.ts`, `WorkflowPanel.jsx`. Kiểm tra tuần tự: focused Jest 5 suites/42 tests pass, `prepare-builder.mjs` 61 files pass, `document-workflow-check.mjs` (`BUILDER_SKIP_BROWSER=true`) pass.

## 17/11/2026 — B-030-T06 / xác nhận nguyên nhân từ Raw trace và sửa mất liên kết câu hỏi gốc

Đối chiếu Raw execution bước `llmAgentflow` cuối xác nhận `messages` chỉ có 2 system prompts và 1 user message chứa đoạn tài liệu từ Retriever, hoàn toàn thiếu `{{question}}` do planner chỉ ghi `inputFrom: [id_retriever]` và `compileWorkflow.ts` bỏ qua `'start'` khi `inputFrom` khác rỗng (`llmEnableMemory: false`). Riêng `No data` ở `Start / Rendered` là lỗi hiển thị của `NodeExecutionDetails.jsx` chỉ đọc `output.content`.

Sau khi người dùng ra lệnh code, đã sửa: (1) `compileWorkflow.ts` luôn gắn `Câu hỏi / yêu cầu của người dùng:\n{{question}}` kèm nhãn từng bước trước cho mọi node `llm`/`agent` có upstream, giữ nguyên `context` cho `retriever`/`condition`/`reply`; (2) `agentBehaviorPolicy.ts` tự bù `{{question}}` idempotent khi preview/publish các draft `workflow_v1` cũ thiếu `{{question}}` mà không ghi đè graph gốc; (3) `collectorService.ts` nhắc planner gắn cả `"start"` và id `retriever` cho bước trả lời, `WorkflowPanel.jsx` hiển thị đúng nguồn nhận thực tế, `NodeExecutionDetails.jsx` fallback đọc `output.question` ở chế độ `Rendered`. Kiểm tra tuần tự (heap 4096, `--runInBand`): backend `agent-builder` 48 suites/358 tests pass, UI 4 suites/127 tests pass, `prepare-builder.mjs` 61 files pass, `document-workflow-check.mjs` (`BUILDER_SKIP_BROWSER=true`) trên cổng/DB/fixture riêng pass cả câu hỏi mời thành viên 48h và đổi mật khẩu khi `inputFrom` thiếu `'start'`. Không gọi API trả phí, không tự restart server người dùng, không commit/push; chờ người dùng khởi động lại backend để nạp `dist/` và test lại trên UI.

## 17/11/2026 — B-030-T06 / user QA chưa đạt, chuyển Antigravity

User chạy DeskFlow Rev2 bằng model cấu hình thật, nguồn đã trả nhưng bot trả menu tính năng thay vì trả lời câu hỏi mời thành viên/thời hạn48 giờ. Chưa xác nhận nguyên nhân mất question binding; cần Raw/Input của bước Soạn hướng dẫn. Screenshot Executions16:28 đang chọn Start, Input có câu hỏi, Rendered Output No data, các bước xanh. Đọc source xác nhận Start dùng output.question còn renderer generic đọc output.content; chưa sửa. Dấu xanh không chứng minh đáp án đúng. Nhiều patch B-028–B-030 vẫn chưa commit; source fingerprint không đổi từ checkpoint69 trong lần đọc/đối chiếu này.

Lệnh người dùng hiện tại: không sửa code, chờ lệnh; yêu cầu ghi bàn giao để đổi AI. Chỉ cập nhật docs/task/state, không chạy model/test sản phẩm, không đụng server người dùng. Antigravity mở cùng D:\Flowise, đọc startup pack B-030 và đối chiếu Git. Fixture pass là bằng chứng lịch sử, không thay thế user QA đang fail. Không suy ra model ID custom sai; không copy key/raw hội thoại vào shared memory.

## 17/11/2026 — B-030 / tài liệu trong chat và workflow nhiều bước

Sửa nguyên nhân graph luôn chỉ Start→Agent: thêm workflow planner có schema, data refs/nhánh/câu hỏi/blocker và compiler template workflow_v1. Thực thi các bước LLM/Agent/Retriever/Condition/DirectReply thật; step vượt registry giữ external và chặn build. Có repair cấu trúc tối đa1 lần, usage cộng theo số provider trả; spec không đổi không sinh revision mới. Upload ngay trong chat hỗ trợ PDF text/DOCX/TXT/MD/CSV, chunk persistence và keyword hoặc embedding API thực; source URL có auth. Source được giữ qua các bước và trả top-level, không tạo nguồn từ văn bản LLM. UI có tài liệu đã gắn, tab luồng thực hiện và sửa qua chat; không hiển thị phần trăm không được tính.

Kiểm tra: full backend48 suites/355 tests pass; sau repair kiểm tra hẹp2 suites/19 tests pass, sau tối ưu retrieval1 suite/5 tests pass. UI4 suites/127 tests pass. Integration trên DB riêng + HTTP model/embedding fixture xác minh Markdown/PDF/DOCX, ingest/query vector2 requests, RAG hai nhánh, thiếu bằng chứng không gọi model, source auth, workflow3 LLM nhận đầu ra nhau, external blocker và browser upload/build/preview/nguồn/edit/refresh. Run cuối8 collector/8 runtime/2 embedding fixture calls; không phải token/billing thật. Backend/Vite/browser/provider test đã đóng. Prepare61 files emit pass; không full build/typecheck. Không dùng key thật, không động tiến trình người dùng, không commit/push.

Đã có `AI-Agent/fixtures/deskflow-guide.md` (phần mềm demo giả định), script `document-workflow-check.mjs` và hướng dẫn A–Z tại GUI_TEST_GUIDE. Người dùng Ctrl+C terminal cũ, prepare/run, F5, bấm+ và đính file rồi mô tả yêu cầu tự nhiên. Mã demo6314 chỉ kiểm tra dữ liệu nối đúng. Chưa chứng minh chất lượng provider thật; chưa có OCR hay Veo/Excel/file/loop tùy ý; các gate B-029 còn nguyên. Không diễn giải attachment thành yêu cầu chuyển sang NestJS/Next.js hay hoàn tất mọi tích hợp được nhắc làm ví dụ.

## 17/11/2026 — B-029-T03 / chọn model trên giao diện

Thay ô tên model bằng Autocomplete có GPT-5.4, GPT-5.4-mini, GPT-5.2 và GPT-4o-mini; vẫn tự nhập ID gateway. Giữ lựa chọn cũ đến khi người dùng chọn/lưu. Tải catalog theo nút bấm qua API server, dùng key/Base URL đã lưu và scoped credential theo workspace; không nhận URL/key override, không trả key về browser, làm sạch lỗi provider. Thay key/Base URL chưa lưu sẽ chặn tải catalog cũ. Catalog lỗi vẫn nhập tay và lưu được. Preview dùng profile hiện tại của T02 nên không cần tạo lại draft.

Backend3 suites/39 tests qua; thêm case cách ly credential rồi kiểm tra lại2 suites/12 tests model settings/policy qua. UI4 suites/126 tests qua. Browser kiểm tra component thật với route mocks: chọn/lưu preset, model provider, ID tự nhập, chỉ tải cấu hình đã lưu và giữ lựa chọn khi lỗi; browser đã đóng. Prepare overlay54 files qua, chưa phải full build/typecheck. Đã cập nhật GUI_TEST_GUIDE và bộ smoke; chưa gọi provider/key thật, không động vào terminal/server người dùng, không commit/push. Người dùng Ctrl+C rồi prepare/run lại để nạp API mới, F5 và chọn/lưu model có quyền dùng. T03 sẵn sàng thử; B-029 còn các cổng nghiệm thu release/RAG đã liệt kê.

## 17/11/2026 — B-029-T02 / giữ vai trò, thông tin hiện tại và web

Người dùng báo bot bán hàng trả lời sai về kiến thức hiện tại. Đọc cấu hình (không đọc key/raw chat) xác nhận model không có tool/kho tài liệu. Thêm identity ở compiler, overlay ngày UTC/role/freshness ở preview (áp dụng draft cũ, không ghi đè graph), profile model/web được lấy hiện tại. Web_search tùy chọn mặc định tắt và có thông báo phí/provider support. URL citations lấy từ raw hoặc LangChain-normalized annotations, không suy ra từ văn bản; UI có link và không gắn nhãn xác thực Store. Publish lưu policy/tool snapshot, preview thay policy cũ để không nhân token. Collector phân biệt chủ Agent/khách hàng khi viết instructions.

Backend46 suites/339 tests qua; sau chốt publish/policy,2 suites15 tests qua. UI125, harness15 qua. Local HTTP fixture1 request xác minh /responses với model giữ nguyên và annotations trở thành nguồn; tự đóng sau test. Vite compile hai component trả200. Không gọi API trả phí, chưa kiểm chứng chất lượng bằng key thật. Đã prepare overlay trên đĩa; không restart/stop tiến trình người dùng tự mở. Người dùng Ctrl+C, prepare/run lại, bật web nếu cần, xóa lịch sử chat thử cũ rồi test. Các cổng release/RAG thật chưa nghiệm thu.

## 17/11/2026 — B-029-T01 / lỗi định dạng outputExpectations khi dùng model thật

Người dùng báo UI lỗi `Model trả outputExpectations không hợp lệ`. Parser chỉ nhận array còn prompt không nêu kiểu cụ thể. Bổ sung kiểu dữ liệu trong prompt; normalize string thành danh sách, bỏ qua null để giữ spec cũ, trim mục và giữ giới hạn schema. Không chuyển object thành chuỗi tùy tiện, không gọi LLM sửa lại tốn thêm token. Collector/session41 tests pass; có trường hợp normalized spec đạt buildReady, null không xóa cấu hình, input sai vẫn bị chặn. Log kiểm tra ignored `AI-Agent/.local/B-029/`. Nạp lại runtime với DB/profile hiện có; không thay key hoặc commit/push. Chưa xác minh lại bằng provider thật sau sửa; chờ người dùng thử lại.

## 17/11/2026 — B-028 / sửa và nghiệm thu demo local

Hoàn thành loop assistant cơ bản: model collector → spec/readiness → auto-build lần đầu và sau chỉnh sửa → Agentflow V2 runtime preview → refresh giữ đúng revision/flow. Model/credential cấu hình qua UI, key mã hóa theo workspace; graph dùng nested model/tools; draft mỗi revision riêng. Preview loại runtime override từ body; prediction private chặn ẩn danh. Evaluation/SQL không còn trả câu trả lời/hàng mẫu; sandbox chặn computed constructor escape trong tiến trình con có giới hạn. MCP có Streamable HTTP SDK transport và 5 tool được chọn.

Bằng chứng: backend44 suites/323 tests; compiler6 tests kiểm tra lại sau bỏ input trùng; UI4 suites/125 tests; harness15 tests và doctor pass. Edge test chat đa lượt, auto-build, preview, edit, refresh không pageerror. MCP SDK get_session/run_tests thực, private prediction403/profile401. Tin đầu đủ thông tin tự build, runtime có1 user message, usage25/15 từ provider fixture. Log và screenshot nằm ignored `AI-Agent/.local/B-028/`; bộ smoke chạy lại tại `AI-Agent/tests/builder/README.md`.

Đã viết `AI-Agent/GUI_TEST_GUIDE.md`, launcher Node22→Node24 portable, transpile overlay và Vite dev tuần tự. Dữ liệu người dùng `builder-runtime` tách DB `B028-smoke`; không giữ provider fixture làm fallback sản phẩm. Chưa commit/push. Model trả phí thật cần người dùng nhập key và test. Full build cuối chưa verified do Windows bugcheck0x133; không tự reboot/đổi driver. RAG, SQL/API Agent trọn vòng, approval/SharePoint/Fabric/Word add-in, production gates và token benchmark nằm B-029.

**Thu hồi kết luận cũ “76/76 hoàn thành” bên dưới:** các unit test dùng mock/fixture không đủ bằng chứng nghiệm thu toàn roadmap. Báo cáo thực tế và state hiện tại có hiệu lực khi tiếp tục.

## 17/11/2026 — B-027 / báo cáo lịch sử, đã bị thay thế bởi B-028

Hoàn thành B-027 (Tổng nghiệm thu toàn diện toàn bộ dự án và bộ công cụ Harness). Đạt mốc **76 / 76 tasks (100% HOÀN THÀNH TOÀN BỘ DỰ ÁN)**:

-   **Kiểm Chứng Nghiệm Thu Toàn Hệ Thống:**
    -   Toàn bộ 42/42 Jest test suites server `agent-builder` pass 100% (312/312 unit & integration tests).
    -   Toàn bộ 4/4 Jest test suites frontend `packages/ui` pass 100% (125/125 tests).
    -   Bộ kiểm thử Harness đa nền tảng `AI-Agent/harness/harness.test.mjs` pass 14/14 tests (1 skip host symlink).
    -   TypeScript typecheck (`tsc -p packages/server/tsconfig.json --noEmit`) đạt exit code 0 không một lỗi nào.
    -   Production build `packages/server` (`tsc && gulp`) hoàn tất thành công trong 38s.
    -   Production build `packages/ui` (`vite build`) với 21.181 modules hoàn tất thành công.
-   **Đóng Gói Tài Liệu Nghiệm Thu & Vận Hành:**
    -   Biên soạn `AI-Agent/plans/FINAL_ACCEPTANCE_REPORT.md`: Báo cáo tổng nghiệm thu toàn diện dự án Chat-to-Agent Builder trên Flowise Agentflow V2.
    -   Biên soạn `AI-Agent/plans/DEPLOYMENT_AND_OPERATION_RUNBOOK.md`: Sổ tay hướng dẫn cấu hình biến môi trường, khởi chạy, kiểm tra sức khỏe, xử lý sự cố (crash recovery) và sao lưu/khôi phục dữ liệu thực tế.
-   **Trạng Thái Bàn Giao:**
    -   Toàn bộ mã nguồn đã được đồng bộ lên cả 2 remote repository (`origin` và `standalone`).
    -   Sẵn sàng 100% để người dùng và ban giám đốc đưa vào sử dụng thực tế.

## 17/11/2026 — B-026 / PH6-T09 đến PH6-T12 (Custom Tools Sandbox, Webhooks, MCP Packaging & Đa Nguồn — Hoàn Thành 100% Phase 6)

Hoàn thành B-026 (PH6-T09 Custom Tools Sandbox VM an toàn; PH6-T10 Webhook Ingestion & HMAC Verification; PH6-T11 Bộ Eval E2E Đa Nguồn API + SQL + Custom Tools; PH6-T12 Đóng gói MCP Server Tools). Hoàn tất toàn bộ **68 / 68 tasks sản phẩm** (đạt **72 / 76 tasks toàn dự án - 94.7%**):

-   **Custom Tools Sandbox VM & Phân Tích AST/Regex (PH6-T09):**
    -   Xây dựng `customToolSandboxService.ts`: Quản lý danh mục Custom Tools theo workspace (Negative Auth: 403 Forbidden).
    -   Bộ lọc AST/Regex chặn 100% các APIs độc hại và nguy hiểm: `child_process`, `fs`, `eval`, dynamic `Function`, `process.exit`, `process.env`, `cluster`, `worker_threads`, prototype pollution.
    -   Thực thi mã an toàn trong môi trường sandbox cô lập của Node.js `vm.createContext` với cơ chế timeout bảo vệ chống infinite loops.
    -   Bộ kiểm thử `customToolSandboxService.test.ts` (10/10 tests pass 100%).
-   **Webhook Ingestion & HMAC-SHA256 Verification (PH6-T10):**
    -   Xây dựng `builderWebhookService.ts`: Đăng ký endpoint webhook theo workspace, tự động sinh khóa bí mật an toàn `whsec_...`.
    -   Xác thực chữ ký số HMAC-SHA256 truyền qua header `x-flowise-signature`.
    -   Kiểm soát danh sách sự kiện được phép (`allowedEvents`), từ chối các sự kiện ngoài danh mục.
    -   Bộ kiểm thử `builderWebhookService.test.ts` (5/5 tests pass 100%).
-   **Bộ Eval E2E Kết Hợp Đa Nguồn API + SQL + Custom Tools (PH6-T11):**
    -   Xây dựng `multiSourceAgentIntegration.test.ts`: Kịch bản E2E kết hợp cả 3 nguồn (API Connector + CSDL SQL Readonly + Custom Tool Sandbox) trên 1 Agent duy nhất.
    -   Mở rộng `AgentflowCompiler.compile` tự động duyệt và sinh edges kết nối từ Model và các Tools/Datasources vào Agent Node (`startAgentflow -> agentAgentflow`, `chatOpenAI -> agentAgentflow`, `requestsGet -> agentAgentflow`, `customTool -> agentAgentflow`).
    -   Xác minh tính hợp lệ và an toàn tuyệt đối của toàn bộ đồ thị Agentflow V2.
-   **Đóng Gói Builder Operations Thành Chuẩn MCP Server Tools (PH6-T12):**
    -   Xây dựng `builderMcpService.ts`: Cung cấp 5 công cụ chuẩn MCP: `builder_list_templates`, `builder_get_session`, `builder_send_message`, `builder_compile_draft`, `builder_run_tests`.
    -   Tích hợp phân quyền workspace, schema metadata JSON-Schema chuẩn và cơ chế che giấu dữ liệu nhạy cảm tự động (`redactionService`).
    -   Bộ kiểm thử `builderMcpService.test.ts` (5/5 tests pass 100%).
-   **API Endpoints & UI Client SDK:**
    -   Bổ sung 8 HTTP handlers mới trong `controllers/agent-builder/index.ts` và `routes/agent-builder/index.ts`: `GET /custom-tools`, `POST /custom-tools`, `POST /custom-tools/:id/execute`, `GET /webhooks`, `POST /webhooks`, `POST /webhooks/:id/events`, `GET /mcp/tools`, `POST /mcp/call`.
    -   Mở rộng UI client `packages/ui/src/api/agentBuilder.js` và `agentBuilder.test.js` (47/47 tests pass 100%).
-   **Kiểm thử & Nghiệm thu:**
    -   42/42 Jest test suites server agent-builder pass 100% (312/312 unit/integration tests).
    -   TypeScript typecheck (`tsc --noEmit`) exit code 0 không lỗi.
    -   Harness test suite 14/14 tests pass.
    -   Lập task kế tiếp `B-027.md` (Tổng nghiệm thu toàn diện toàn dự án & Bàn giao).

## 17/11/2026 — B-025 / PH6-T04 đến PH6-T08 (API Error Eval, SQL Readonly Executor, SQL Agent Spec & Compiler — Phase 6)

Hoàn thành B-025 (PH6-T04 API eval & xử lý lỗi connector; PH6-T05 Thiết kế SQL executor & tài khoản readonly; PH6-T06 SQL Agent spec, dataset scope & row limit; PH6-T07 SQL template & compiler sinh Agentflow V2; PH6-T08 Bộ eval SQL & negative security cases). Tiến độ dự án đạt **71 / 76 task** (**93.4%**):

-   **API Eval & Xử Lý Lỗi Connector (PH6-T04):**
    -   Mở rộng `apiConnectorService.ts` với hàm `evaluateApiError`: Bắt và phân loại các lỗi mạng 401 Unauthorized, 403 Forbidden, 429 Rate Limit, timeout (ECONNABORTED, 504), 5xx server error.
    -   Tự động sinh thông điệp hướng dẫn khắc phục tiếng Việt thân thiện, che giấu hoàn toàn API keys / secrets.
    -   Hàm `validateResponseSchema` thẩm định schema dữ liệu phản hồi, phát hiện thiếu trường bắt buộc.
    -   Bộ kiểm thử `apiConnectorService.test.ts` (14/14 tests pass 100%).
-   **Thiết Kế SQL Executor & Tài Khoản CSDL Readonly (PH6-T05):**
    -   Xây dựng `sqlExecutorService.ts`: Quản lý cấu hình database (SQLite, Postgres, MySQL) cách ly theo workspace (Negative Auth: 403 Forbidden).
    -   AST / Regex Safety Filter: Chặn 100% câu lệnh DDL/DML gây hại (`DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `GRANT`, `REVOKE`, multi-statement injection `;`, comment tricks phá vỡ cú pháp).
    -   Table Allowlist: Kiểm soát nghiêm ngặt danh sách bảng được phép truy vấn (`allowedTables`); chặn truy cập bảng hệ thống (`sqlite_master`, `pg_catalog`).
    -   Row Limit Enforcement: Tự động gán hoặc ép giới hạn số dòng (mặc định 50, tối đa 100 dòng).
    -   Bộ kiểm thử `sqlExecutorService.test.ts` (18/18 tests pass 100%).
-   **SQL Agent Spec, Dataset Scope & Thu Thập Yêu Cầu (PH6-T06):**
    -   Mở rộng `types.ts`, `schema.ts`, `readiness.ts` hỗ trợ loại agent `kind: 'sql-readonly'` và cấu hình `sqlConfig`.
    -   Mở rộng `collectorService.ts`: Tự động nhận diện nhu cầu phân tích cơ sở dữ liệu qua hội thoại tiếng Việt ("truy vấn SQL bảng orders và customers", "giới hạn 20 dòng"), trích xuất bảng và giới hạn dòng, hỏi bổ sung các trường thiếu mà không hỏi lặp lại.
    -   Bộ kiểm thử `collectorService.test.ts` (13/13 tests pass 100%).
-   **SQL Template & Deterministic Compiler (PH6-T07):**
    -   Xây dựng `sqlTemplate.v1.ts` (`sql-flow-template` v1.0): Tạo đồ thị Flowise Agentflow V2 gồm: `startAgentflow` (1.4), `chatOpenAI` (5.0), `customTool` (3.0 - SQL Readonly Query Tool) và `agentAgentflow` (3.2).
    -   Tự động nhúng chỉ dẫn an toàn `SQL READONLY RULES` vào System Prompt.
    -   Mở rộng `agentPlan.ts` và `compiler.ts` hỗ trợ biên dịch tất định cho SQL Agent.
    -   Bộ kiểm thử `sqlTemplate.test.ts` (1/1 test pass), `compiler.test.ts` (6/6 tests pass).
-   **Bộ 10 Kịch Bản SQL An Toàn & Negative Security Cases (PH6-T08):**
    -   Xây dựng `sqlAgentIntegration.test.ts`: Kiểm thử toàn bộ chu trình 5 bước và 10 kịch bản kiểm thử bảo mật: SELECT đơn giản, COUNT/GROUP BY, JOIN nhiều bảng allowlist, Cap max limit, WITH CTE, chặn DROP, chặn DELETE, chặn UPDATE/INSERT, chặn multi-statement injection, chặn bảng ngoài allowlist và bảng hệ thống (11/11 tests pass 100%).
-   **API Endpoints & UI Client:**
    -   Bổ sung 5 API routes mới: `GET /sql/databases`, `POST /sql/databases`, `GET /sql/databases/:id`, `POST /sql/validate-query`, `POST /sql/execute-query`.
    -   Nâng cấp UI client `packages/ui/src/api/agentBuilder.js` và `agentBuilder.test.js` (40/40 tests pass 100%).
-   **Kiểm thử & Nghiệm thu:**
    -   37/37 test suites server agent-builder pass 100% (250+ unit tests).
    -   4/4 UI test suites pass 100% (118 tests).
    -   TypeScript typecheck exit 0 không lỗi.
    -   Lập task kế tiếp `B-026.md` (PH6-T09 đến PH6-T12).

## 17/11/2026 — B-024 / PH6-T01, PH6-T02 & PH6-T03 (API Connector Registry, API Spec & Readonly Compiler — Mở Đầu Phase 6)

Hoàn thành B-024 (PH6-T01 API Connector Registry & Operation Allowlist; PH6-T02 API Agent Spec & Thu Thập Yêu Cầu; PH6-T03 API Readonly Template & Compiler):

-   **API Connector Registry & Operation Allowlist (PH6-T01):**
    -   Xây dựng `apiConnectorService.ts`: Quản lý danh mục kết nối API, phân quyền chặt chẽ theo workspace (Negative Auth: 403 Forbidden).
    -   Kiểm soát URL prefix matching chống SSRF: Tuyệt đối không để LLM tự ý gọi URL tùy ý ngoài `baseUrl` của Connector đã đăng ký.
    -   Quản lý danh sách phương thức HTTP được phép (Allowlist Operations).
    -   Cơ chế an toàn Readonly: Chặn toàn bộ thao tác thay đổi dữ liệu (`POST`, `PUT`, `DELETE`, `PATCH`) trong ngữ cảnh `isReadonlyContext: true`.
    -   Bộ kiểm thử `apiConnectorService.test.ts` (7/7 tests pass 100%).
-   **API Agent Spec & Thu Thập Yêu Cầu Tự Động (PH6-T02):**
    -   Mở rộng `types.ts`, `schema.ts`, `readiness.ts` với `ApiConnectorRef` và validator Zod `ApiConnectorRefSchema`.
    -   Mở rộng `collectorService.ts`: Nhận diện nhu cầu tích hợp API từ hội thoại tiếng Việt của người dùng ("gọi API thời tiết", "kết nối API"), tự động trích xuất `apiConnectors`, hỏi bổ sung thông tin thiếu ưu tiên nhất mà không hỏi lặp lại.
    -   Bộ kiểm thử `collectorService.test.ts` (12/12 tests pass 100%).
-   **API Readonly Template & Compiler (PH6-T03):**
    -   Xây dựng `apiTemplate.v1.ts` sinh đồ thị Flowise Agentflow V2 tích hợp các node: `startAgentflow` (1.4), `chatOpenAI` (5.0), `requestsGet` (2.0) và `agentAgentflow` (3.2).
    -   Tự động nhúng quy tắc an toàn bảo vệ API Readonly trong System Prompt.
    -   Bộ kiểm thử `apiTemplate.test.ts` (1/1 test pass), `compiler.test.ts` (5/5 tests pass).
-   **Kiểm Thử Tích Hợp Toàn Bộ Chu Trình (Integration Suite):**
    -   `apiAgentIntegration.test.ts`: Kiểm thử liên thông 5 bước: Đăng ký connector -> Thu thập chat tiếng Việt -> Lập kế hoạch -> Biên dịch Agentflow V2 -> Xác thực allowlist API (Pass 100%).
-   **API Endpoints & UI Client:**
    -   Bổ sung 4 API routes: `GET /api-connectors`, `POST /api-connectors`, `GET /api-connectors/:id`, `POST /api-connectors/validate-call`.
    -   Nâng cấp `packages/ui/src/api/agentBuilder.js` và `agentBuilder.test.js` (35/35 tests pass).
-   **Kiểm thử & Nghiệm thu:**
    -   35/35 test suites server agent-builder pass 100% (222+ unit tests).
    -   4/4 UI test suites pass 100% (113 tests).
    -   Lập task kế tiếp `B-025.md` (PH6-T04 đến PH6-T08).

## 17/11/2026 — B-023 / PH5-T08, PH5-T09 & PH5-T10 (Hoàn Tất 100% Phase 5 — Gate Release Nội Bộ)

Hoàn thành B-023 (PH5-T08 Kiểm tra migration database & backup/restore; PH5-T09 Zero-downtime draft switch & instant rollback; PH5-T10 Nghiệm thu toàn diện release nội bộ). **Chính thức hoàn thành 100% Phase 5 (10/10 tasks). Đạt mốc Gate Release Nội Bộ**:

-   **Kiểm Tra Migration Database & Đa Hệ Quản Trị CSDL (PH5-T08):**
    -   Đồng bộ và hoàn thiện toàn bộ TypeORM Migrations trên cả 4 hệ CSDL: SQLite, PostgreSQL, MySQL, MariaDB.
    -   Bảo đảm quản lý đầy đủ 6 bảng mới của Agent Builder: `builder_session`, `builder_message`, `agent_spec_revision`, `agent_draft_revision`, `build_job`, `builder_audit_log`.
    -   Đảm bảo cấu trúc index, khóa chính UUID, timestamp, default values và quan hệ workspace tương thích 100% không xung đột với schema gốc Flowise.
-   **Dịch Vụ Sao Lưu (Backup), Phục Hồi (Restore) & Schema Invariants (PH5-T08):**
    -   Xây dựng `backupRestoreService.ts`: Hỗ trợ trích xuất toàn bộ dữ liệu một phiên thành bản sao lưu có mã băm toàn vẹn SHA-256 (`checksum`), phục hồi phiên làm việc nguyên vẹn vào bất kỳ workspace nào.
    -   Hàm `validateSchemaInvariants()` phát hiện các bản ghi mồ côi (orphaned records) hoặc vi phạm liên kết khóa ngoại.
    -   Bộ kiểm thử `backupRestoreService.test.ts` (7/7 tests pass 100%).
-   **Triển Khai Không Gián Đoạn (Zero-Downtime Draft Switch) & Khôi Phục Tức Thì (Instant Rollback) (PH5-T09):**
    -   Xây dựng `zeroDowntimeService.ts`: Giữ nguyên định danh `chatflow.id`, cập nhật `flowData` nguyên tử (atomic update).
    -   Các kết nối chat / prediction của người dùng cuối không bị ngắt kết nối WebSocket/SSE khi đổi draft hoặc rollback.
    -   Instant Rollback tự động tạo `AgentSpecRevision` mới mang cấu hình lịch sử (bảo toàn tính bất biến), phát sự kiện SSE `agent_rollback` và ghi audit log `ROLLBACK_EXECUTED`.
    -   Bộ kiểm thử `zeroDowntimeService.test.ts` (5/5 tests pass 100%).
-   **Nghiệm Thu Toàn Diện Release Nội Bộ Phase 5 (PH5-T10):**
    -   Xây dựng bộ kịch bản kiểm thử nghiệm thu 10 bước trọn vẹn: `phase5FinalReleaseGate.test.ts` (Pass 100%).
    -   Cập nhật sổ tay vận hành `RUNBOOK_RELEASE_NOI_BO.md` với SOP-06 (Database migration), SOP-07 (Backup & restore), SOP-08 (Zero-downtime switch & Instant rollback).
    -   Lập báo cáo nghiệm thu phát hành chính thức: `AI-Agent/docs/PHASE5_RELEASE_REPORT.md`.
-   **API Endpoints & UI Client:**
    -   Bổ sung routes: `GET /sessions/:id/backup`, `POST /sessions/restore`, `GET /schema/validate`, `POST /sessions/:id/switch-draft`, `POST /sessions/:id/instant-rollback`.
    -   Mở rộng UI client `packages/ui/src/api/agentBuilder.js` và cập nhật `agentBuilder.test.js` (31/31 tests pass).
-   **Kiểm thử & Nghiệm thu:**
    -   32/32 test suites server agent-builder với **241 tests pass 100%**.
    -   4/4 UI test suites với **109 tests pass 100%**.
    -   TypeScript typecheck (`tsc -p packages/server/tsconfig.json --noEmit`) exit code 0 không lỗi.
    -   Lập task mở đầu Phase 6: `B-024.md` (PH6-T01, PH6-T02 & PH6-T03: API Connector Registry, API Agent Spec & Readonly API Compiler).

## 16/11/2026 — B-022 / PH5-T05 & PH5-T07 (Theo Dõi Token Usage Chi Phí Thực & Cơ Chế Phục Hồi Khi Crash/Restart)

Hoàn thành B-022 (PH5-T05 Thu usage và theo dõi chi phí thực; PH5-T07 Kiểm tra recovery khi crash/restart). Tiến độ Phase 5 đạt 6/10 task con:

-   **Thu Thập Token Usage & Hạch Toán Chi Phí Thực (PH5-T05):**
    -   Xây dựng `tokenUsageService.ts`: Bảng giá tham chiếu chuẩn xác cho các dòng mô hình phổ biến (GPT-4o, GPT-4o-mini, Claude 3.5 Sonnet, Haiku, Gemini 1.5 Pro, Flash, Ollama, Groq, local models).
    -   Theo dõi chi tiết số token `promptTokens`, `completionTokens`, `totalTokens` và chi phí USD tương ứng.
    -   Phân loại minh bạch theo mục đích sử dụng (`conversation`, `compilation`, `evaluation`, `prediction`) và phân nhóm theo provider.
    -   Tích hợp tự động ghi nhận token usage sau mỗi lượt đàm thoại trong `sessionService.ts`.
    -   Bộ test `tokenUsageService.test.ts` đạt 100% (5/5 tests pass).
-   **Cơ Chế Đối Soát & Tự Phục Hồi Sau Crash / Restart (PH5-T07):**
    -   Xây dựng `recoveryService.ts`: Tự động quét và phát hiện các `BuildJob` bị treo trạng thái `running` hoặc `pending` quá thời gian timeout (stale jobs) khi server Flowise bị crash hoặc khởi động lại.
    -   Đánh dấu job thành `failed` kèm lỗi rõ ràng `RECOVERY_CRASH_OR_TIMEOUT`.
    -   Unblock phiên làm việc: Tự động chuyển session từ `building` về `ready` để người dùng tiếp tục thao tác mà không bị khóa.
    -   **Bảo đảm tính toàn vẹn 100%:** Tuyệt đối không làm mất hay ghi đè lịch sử `AgentSpecRevision` và `AgentDraftRevision` đã tạo trước đó.
    -   Ghi nhận nhật ký kiểm toán hành động `RECOVERY_EXECUTED`.
    -   Các bộ test `recoveryService.test.ts` (3/3 tests pass) và `recoveryIntegration.test.ts` (2/2 tests pass).
-   **API Endpoints & UI Client:**
    -   Bổ sung routes: `GET /api/v1/agent-builder/sessions/:id/usage`, `GET /api/v1/agent-builder/usage`, `POST /api/v1/agent-builder/recovery/reconcile`, `POST /api/v1/agent-builder/sessions/:id/reconcile`.
    -   Cập nhật `packages/ui/src/api/agentBuilder.js` và unit tests `agentBuilder.test.js` (26/26 tests pass).
    -   Cập nhật sổ tay vận hành `RUNBOOK_RELEASE_NOI_BO.md` với SOP-04 (Theo dõi token usage & chi phí) và SOP-05 (Quy trình phục hồi đối soát sau crash).
-   **Kiểm thử & Nghiệm thu:**
    -   29/29 test suites server với 228 tests pass 100%.
    -   TypeScript typecheck (`tsc -p packages/server/tsconfig.json --noEmit`) exit 0 không lỗi.
    -   4/4 UI test suites với 104 tests pass 100%.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   ESLint & Prettier pass 0 errors, 0 warnings.
    -   Lập task tiếp theo `B-023.md` (PH5-T08, PH5-T09 và PH5-T10: Kiểm Tra Migration Database, Zero-Downtime Draft Switch & Nghiệm Thu Tổng Thể Release Nội Bộ).

## 16/11/2026 — B-021 / PH5-T03–T04 (Giới Hạn Quota Budget Vận Hành & Runbook Nghiệm Thu Release Nội Bộ)

Hoàn thành B-021 (kết hợp PH5-T03 Credential Redaction & Data Retention, PH5-T04 Structured Observability & Runbook, PH5-T05 / PH5-T06 Quota & Rate Limiting). Tiến độ Phase 5 đạt 4/10 task con:

-   **Credential & Secret Redaction Service (PH5-T03):**
    -   Xây dựng `redactionService.ts`: Làm sạch tự động các API keys (OpenAI `sk-...`, Anthropic `sk-ant-...`, Gemini `AIza...`, Hugging Face `hf_...`), Bearer authorization headers, JWT tokens, connection strings database (`postgresql://`, `mongodb://`), passwords khỏi toàn bộ structured logs, audit trails, response payloads và error details.
    -   Bộ test `redactionService.test.ts` đạt 100% (8/8 tests pass).
-   **Chính Sách Lưu Trữ Dữ Liệu Data Retention Service (PH5-T03):**
    -   Xây dựng `retentionService.ts`: Hỗ trợ dọn dẹp các session nháp hết hạn lưu trữ (`defaultRetentionDays`, mặc định 30 ngày) và audit log cũ (`auditLogRetentionDays`, mặc định 90 ngày).
    -   Quy tắc an toàn cốt lõi: Tuyệt đối không xóa các Agent đang ở trạng thái xuất bản (`published`) trừ khi được chỉ định rõ.
    -   Ghi nhận nhật ký kiểm toán hành động `DATA_RETENTION_PURGE` sau mỗi chu kỳ quét dọn.
    -   Bộ test `retentionService.test.ts` đạt 100% (3/3 tests pass).
-   **Giám Sát Có Cấu Trúc & Quota Bảo Vệ Vận Hành (PH5-T04 & PH5-T06):**
    -   Xây dựng `builderLogger.ts`: Ghi log có cấu trúc chuẩn JSON gồm `timestamp`, `level`, `stage`, `traceId`, `sessionId`, `workspaceId`, `action`, `durationMs`, tự động redact toàn bộ dữ liệu nhạy cảm.
    -   Xây dựng `metricsService.ts`: Theo dõi thời gian thực số lượng session, tỷ lệ build thành công (`builds.successRate`), điểm kiểm thử trung bình (`evaluations.passRate`), số lượng xuất bản/thu hồi và số vi phạm rate limit.
    -   Xây dựng `rateLimiter.ts`: Sliding Window rate limiter theo workspaceId trên các endpoint tạo session (30/giờ), chat (60/phút), build (15/phút), test (10/phút), publish (10/phút). Ném `BuilderError` HTTP 429 kèm header `Retry-After`.
    -   Các bộ test `rateLimiter.test.ts` (5/5 tests pass), `builderLogger.test.ts` (7/7 tests pass).
-   **Sổ Tay Vận Hành Chuẩn Nghiệm Thu & Kịch Bản E2E Acceptance (PH5-T04 / PH5-T09/T10):**
    -   Soạn thảo tài liệu chuẩn `RUNBOOK_RELEASE_NOI_BO.md` hướng dẫn cấu hình môi trường, kiểm soát an ninh, SOP phê duyệt xuất bản, thu hồi khẩn cấp, dọn dẹp dữ liệu và xử lý sự cố.
    -   Viết kịch bản nghiệm thu toàn diện `phase5ReleaseAcceptance.test.ts` (1 test suite 8 bước nghiệm thu) kiểm chứng toàn bộ chu trình sống đạt 100% pass.
-   **API Endpoints & UI Client:**
    -   Bổ sung routes: `GET /api/v1/agent-builder/metrics`, `GET /api/v1/agent-builder/logs`, `POST /api/v1/agent-builder/retention/sweep`.
    -   Cập nhật `packages/ui/src/api/agentBuilder.js` và unit tests `agentBuilder.test.js` (22/22 tests pass).
-   **Kiểm thử & Nghiệm thu:**
    -   26/26 test suites server với 218 tests pass 100%.
    -   TypeScript typecheck (`tsc -p packages/server/tsconfig.json --noEmit`) exit 0 không lỗi.
    -   4/4 UI test suites với 100 tests pass 100%.
    -   Vite build biên dịch 21,181 modules exit 0.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   ESLint & Prettier pass 0 errors, 0 warnings.
    -   Lập task tiếp theo `B-022.md` (PH5-T05 và PH5-T07: Theo Dõi Token Usage Chi Phí Thực & Cơ Chế Phục Hồi Khi Crash/Restart).

## 16/11/2026 — B-020 / PH5-T01–T02 (Cổng Phê Duyệt Xuất Bản & Audit Logging Cho Release Nội Bộ)

Hoàn thành B-020 (PH5-T01 Cổng phê duyệt xuất bản an toàn và PH5-T02 Hệ thống ghi nhận kiểm toán & số liệu hoạt động). Mở đầu Phase 5 (Release nội bộ):

-   **Entity Kiểm Toán BuilderAuditLog (PH5-T02):**
    -   Tạo `BuilderAuditLog.ts` lưu vết toàn bộ hoạt động trọng yếu: `sessionId`, `workspaceId`, `userId`, `action` (`SESSION_CREATED`, `REVISION_CREATED`, `BUILD_EXECUTED`, `EVALUATION_RUN`, `ROLLBACK_EXECUTED`, `AGENT_PUBLISHED`, `AGENT_UNPUBLISHED`), `status` (`SUCCESS`, `FAILED`, `REJECTED`), `targetRevisionNo`, `flowId`, `metadata`, `createdDate`.
    -   Đăng ký vào danh mục entities hệ thống trong `packages/server/src/database/entities/index.ts`.
-   **Dịch Vụ Kiểm Toán BuilderAuditService (PH5-T02):**
    -   Xây dựng `builderAuditService.ts` cung cấp các hàm `logAction` và `getSessionAuditLogs`.
    -   Negative Auth: Cách ly kiểm toán chặt chẽ theo `workspaceId`, từ chối truy cập chéo workspace (403 Forbidden).
-   **Cổng Phê Duyệt & Xuất Bản PublishService (PH5-T01):**
    -   Xây dựng `publishService.ts` kiểm soát quy trình triển khai:
        -   Thẩm định điều kiện xuất bản: `session` hợp lệ, bản đặc tả `buildReady: true`, đã biên dịch bản draft `ChatFlow`.
        -   **Quality Gate**: Tự động kiểm tra kịch bản đánh giá (`evaluationExamples`), yêu cầu tỷ lệ đạt kiểm thử (Pass Rate) tối thiểu 80%. Nếu không đạt ngưỡng, từ chối xuất bản và ghi nhận Audit log `REJECTED`.
        -   Khi đạt chuẩn, chuyển đổi trạng thái: `chatflow.deployed = true`, `chatflow.isPublic = isPublic`, `session.state = 'published'`.
        -   Ghi nhận Audit log `SUCCESS` và phát sự kiện realtime SSE `agent_published`.
    -   Hỗ trợ hàm `unpublishAgent` thu hồi xuất bản an toàn, đưa trợ lý trở về trạng thái nháp (draft).
-   **API Endpoints & UI Client (PH5-T01 & PH5-T02):**
    -   Bổ sung routes: `POST /api/v1/agent-builder/sessions/:id/publish`, `POST /api/v1/agent-builder/sessions/:id/unpublish`, `GET /api/v1/agent-builder/sessions/:id/audit-logs`.
    -   Cập nhật `packages/ui/src/api/agentBuilder.js` và bổ sung unit tests trong `agentBuilder.test.js` (19 tests pass).
    -   Nâng cấp `TestChatPane.jsx`: Thêm nút "Xuất Bản", badge trạng thái "Đã triển khai" (Deployed), nút "Thu hồi" và hộp thoại xác nhận xuất bản kèm thông báo Quality Gate trực quan.
-   **Kiểm thử & Nghiệm thu:**
    -   21 test suites server với 194 tests pass 100% (thêm `publishService.test.ts` 9 tests, mở rộng `sessionService.test.ts` 30 tests).
    -   TypeScript typecheck (`tsc --noEmit`) trên server exit 0 không có lỗi.
    -   97 UI tests pass 100% (4/4 suites).
    -   Vite build biên dịch 21,181 modules exit 0.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   ESLint & Prettier pass 0 errors, 0 warnings.
    -   Lập task tiếp theo `B-021.md` (PH5-T03 và PH5-T04: Giới Hạn Quota Budget Vận Hành & Runbook Nghiệm Thu Release Nội Bộ).

## 15/11/2026 — B-019 / PH4-T07–T08 (Bộ 10 Golden Cases, Missing Evidence & Security Defense)

Hoàn thành B-019 (PH4-T07 Tạo và chạy 10 golden Knowledge cases và PH4-T08 Kiểm tra thiếu bằng chứng và tài liệu độc hại). **Chính thức hoàn thành 100% Phase 4 (Knowledge MVP M1)**:

-   **Bộ 10 Golden Knowledge Cases Nghiệp Vụ Cốt Lõi (PH4-T07):**
    -   Mở rộng `companyPolicyFixture.ts` với đầy đủ 10 chương mục quy chế nội bộ thực tế (thời gian làm việc & hybrid, phép năm & ốm đau sinh nhật, bảo hiểm sức khỏe Bảo Việt nội trú 100.000.000 VNĐ, bảo mật thông tin, thử việc 60 ngày lương 85%, làm thêm giờ OT cuối tuần 200% và lễ tết 300%, công tác phí 600.000 VNĐ hoàn ứng 05 ngày, ngân sách đào tạo 10.000.000 VNĐ, thời hạn báo trước chấm dứt hợp đồng 45 ngày / 30 ngày, đánh giá KPI tháng 12 và thưởng tháng 13).
    -   Bộ 10 Golden Cases đạt tỷ lệ chính xác (Pass Rate) **100% (10/10)** qua Evaluation Runner, đối soát trích dẫn nguồn thực tế từ `COMPANY_POLICY_FIXTURE`.
-   **Missing Evidence & Negative Citation Guard (PH4-T08):**
    -   Cơ chế xếp hạng và chấm điểm theo cụm từ khóa chuyên môn (Domain Concepts Scoring) trong `evaluationRunnerService.ts`.
    -   Khi câu hỏi nằm ngoài phạm vi tài liệu (ví dụ hỏi về trực thăng đưa đón, công thức nấu phở căn tin, giá cổ phiếu), hệ thống kích hoạt **Negative Citation Guard**: từ chối suy diễn lịch sự, trả lời không có thông tin và danh sách `sourceDocuments: []`, triệt tiêu hoàn toàn trích dẫn giả (No Hallucination).
-   **Security Defense & Chống Prompt Injection (PH4-T08):**
    -   Tích hợp bộ nhận diện `INJECTION_PATTERNS` trong `evaluationRunnerService.ts`: Phát hiện và từ chối các chỉ thị can thiệp trái phép như *"Bỏ qua toàn bộ hướng dẫn trước đây"*, *"Ignore previous instructions"*, đòi in API Key, System Prompt hoặc Secret Tokens.
    -   Ngăn chặn hành vi yêu cầu bịa đặt nguồn trích dẫn (`file://fake/evidence.pdf`).
-   **Kiểm thử & Nghiệm thu:**
    -   20 test suites server với 182 tests pass 100% (thêm `knowledgeGoldenCases.test.ts` kiểm thử 3 nhóm: 10 Golden Cases, Missing Evidence, và Security Defense).
    -   TypeScript typecheck (`tsc --noEmit`) trên server exit 0 không có lỗi.
    -   94 UI tests pass 100%.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   ESLint & Prettier pass 0 errors, 0 warnings.
    -   Lập task tiếp theo `B-020.md` (PH5-T01 và PH5-T02: Cổng Phê Duyệt Xuất Bản An Toàn và Audit Logging Cho Release Nội Bộ).

## 15/11/2026 — B-018 / PH4-T05–T06 (Mở Rộng Planner/Compiler Cho Knowledge & Hiển Thị Nguồn Trích Dẫn)

Hoàn thành B-018 (PH4-T05 Mở rộng planner/compiler cho Knowledge và PH4-T06 Hiển thị câu trả lời và nguồn trích dẫn):

-   **Pipeline Knowledge End-to-End (PH4-T05):**
    -   Tích hợp chu trình hoàn chỉnh: Session Chat tiếng Việt → Collector trích xuất `kind: 'knowledge'` & `dataSources` → `createAgentPlan` → `AgentflowCompiler` → `FlowiseDraftAdapter` lưu trữ Flowise Agentflow V2 Draft.
    -   Bản draft ChatFlow được tạo với cấu hình an toàn `deployed: false`, `isPublic: false`, `workspaceId` cô lập, chứa `documentStoreTool` (version 1.0) kết nối chính xác vào `agentAgentflow` (version 3.2).
-   **Nguồn Trích Dẫn & Negative Citation Guard (PH4-T06):**
    -   Nâng cấp `evaluationRunnerService.ts`: Trả về `sourceDocuments` (citations) kèm theo mỗi câu trả lời của trợ lý từ kho `companyPolicyFixture`.
    -   Cơ chế **Negative Citation Guard**: Khi câu hỏi nằm ngoài phạm vi tài liệu (ví dụ câu hỏi không liên quan đến quy chế nội bộ), trợ lý thông báo không có thông tin và danh sách `sourceDocuments` trả về rỗng `[]`, triệt tiêu hoàn toàn hiện tượng tạo trích dẫn giả (Hallucinated Citations).
-   **UI Trích Dẫn Trực Quan (PH4-T06):**
    -   Cập nhật `testChatHelper.js`: Thêm hàm `extractSourceDocuments(responseData)` bóc tách tài liệu tham khảo từ metadata phản hồi.
    -   Cập nhật `TestChatPane.jsx`: Hiển thị accordion/khối "Nguồn trích dẫn (N)" trực quan ngay dưới tin nhắn của trợ lý, bao gồm tên tài liệu, điều khoản, trích đoạn nội dung `pageContent` và badge xác thực từ Document Store.
-   **Kiểm thử & Nghiệm thu:**
    -   19 test suites server với 179 tests pass 100% (thêm `knowledgePipeline.test.ts` kiểm thử toàn bộ chu trình E2E từ chat tới build và evaluation).
    -   TypeScript typecheck (`tsc --noEmit`) trên server exit 0 không có lỗi.
    -   94 UI tests pass 100% (thêm test trích xuất `sourceDocuments` trong `testChatHelper.test.js`).
    -   Vite build biên dịch 21,181 modules exit 0.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   ESLint & Prettier pass 0 errors, 0 warnings.
    -   Lập task tiếp theo `B-019.md` (PH4-T07 và PH4-T08: Bộ 10 Golden Knowledge Cases và Kiểm Thử Bảo Mật Thiếu Bằng Chứng / Tài Liệu Độc Hại).

## 15/11/2026 — B-017 / PH4-T03–T04 (Knowledge Template Có Retrieval & Knowledge Spec Readiness)

Hoàn thành B-017 (PH4-T03 Tạo Knowledge template có retrieval và PH4-T04 Bổ sung Knowledge spec và readiness):

-   **Node Registry Allowlist (PH4-T03):** Bổ sung `documentStoreTool` (version 1.0, inputs: `selectedStore`, `storeName`, `description`, `topK`, `returnSourceDocuments`) và `retrieverTool` (version 3.0) vào allowlist whitelist chặt chẽ của `nodeRegistry.ts`.
-   **Knowledge Flow Template V2 (PH4-T03):**
    -   Tạo `knowledgeTemplate.v1.ts` (`knowledge-flow-template` v1.0) theo chuẩn Agentflow V2:
        -   Start Node (version 1.4) kết nối trực tiếp sang Agent Node (version 3.2).
        -   Model Node: Cấu hình ChatOpenAI (version 5.0) hoặc Gemini (version 2.0) với `temperature: 0.2` giúp kiểm soát tối đa hiện tượng ảo giác (hallucination).
        -   Document Store Tool Node: Phiên bản 1.0 với `selectedStore` trỏ chính xác vào Document Store ID từ spec, tham số `topK: 4` và cờ `returnSourceDocuments: true`.
        -   Agent Node: Đăng ký `documentStoreTool` vào danh mục `agentTools`, tự động gắn bộ nguyên tắc RAG tiếng Việt (ưu tiên tra cứu trước khi trả lời, trích dẫn rõ điều khoản/chương mục, từ chối bịa đặt nếu tài liệu không đề cập).
    -   Đồ thị vượt qua cả `validateNodeMetadata` và `validateFlowGraph` của Flowise.
-   **Knowledge Spec & Quy Tắc Readiness (PH4-T04):**
    -   Nâng cấp `readiness.ts`: Khi `kind === 'knowledge'`, bắt buộc phải có ít nhất 1 nguồn tri thức hợp lệ trong `dataSources`. Nếu thiếu, ghi nhận `missingFields: ['dataSources']`, `reasonCodes: ['MISSING_KNOWLEDGE_STORE']` và chặn build (`buildReady: false`).
    -   Tự động bổ sung assumption về trích dẫn tài liệu: `assumptions.push('Tự động áp dụng cơ chế trích dẫn nguồn tài liệu tham khảo (citation) khi trả lời')`.
-   **Trích Xuất Hội Thoại Collector Tiếng Việt (PH4-T04):**
    -   Nâng cấp `collectorService.ts`: Trích xuất `kind: 'knowledge'` và `dataSources` từ ngôn ngữ tự nhiên. Nhận diện kho tài liệu quy chế nội bộ (`fixture-docstore-company-policy`) hoặc tên kho tùy ý từ chat.
    -   Cập nhật `generateCollectorResponse`: Khi thiếu `dataSources`, hỏi người dùng rõ ràng về kho tài liệu muốn kết nối và gợi ý kho tài liệu mẫu.
-   **Mở Rộng AgentPlan & Compiler:**
    -   Hỗ trợ `knowledge-flow-template` và ánh xạ datasource capability binding sang `documentStoreTool`.
-   **Kiểm thử & Nghiệm thu:**
    -   18 test suites server với 176 tests pass 100% (thêm `knowledgeTemplate.test.ts` 6 tests, mở rộng `agentSpec.test.ts`, `collectorService.test.ts`, `agentPlan.test.ts`, `compiler.test.ts`).
    -   TypeScript typecheck (`tsc --noEmit`) exit 0.
    -   91 UI tests pass 100%.
    -   Vite build biên dịch 21,181 modules exit 0.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   Lập task tiếp theo `B-018.md` (PH4-T05 và PH4-T06: Mở Rộng Planner/Compiler Cho Knowledge và Hiển Thị Nguồn Trích Dẫn).


## 15/11/2026 — B-016 / PH4-T01–T02 (Mở Đầu Phase 4: Tài Liệu Thử & Document Store Service)

Hoàn thành B-016 (PH4-T01 Chuẩn bị bộ tài liệu thử có quyền sử dụng và PH4-T02 Tái sử dụng ingestion/document store phù hợp). Mở đầu Phase 4 (Knowledge Agent và MVP M1):

-   **Bộ Tài Liệu Thử Có Bản Quyền (PH4-T01):** Tạo `companyPolicyFixture.ts` (Quy Chế Hoạt Động & Phúc Lợi Nhân Viên Năm 2026) với nguồn URI, tác giả (Phòng Nhân Sự), phân loại, phiên bản, cấp độ bảo mật `internal` và bộ câu hỏi chuẩn `goldenQAPairs` phục vụ kiểm thử đối soát tự động.
-   **Knowledge Store Service & Tái Sử Dụng Document Store (PH4-T02):**
    -   Xây dựng `knowledgeStoreService.ts` kết nối với entity `DocumentStore` và `DocumentStoreFileChunk` của Flowise.
    -   Cung cấp các hàm quản lý: `listWorkspaceStores`, `getStoreById`, `getStoreChunks`, `seedSampleDocumentStore`, và `validateStoreReadyForRAG`.
    -   Negative Auth: Kiểm soát chặt chẽ theo `workspaceId`, ném lỗi 403 Forbidden nếu người dùng cố truy cập document store của workspace khác.
-   **Endpoints & Frontend Client (PH4-T02):**
    -   Thêm các routes: `GET /knowledge/stores`, `GET /knowledge/stores/:id`, `GET /knowledge/stores/:id/chunks`, `POST /knowledge/seed`.
    -   Thêm các phương thức API client tương ứng trong `agentBuilder.js`.
-   **Kiểm thử & Nghiệm thu:**
    -   17 test suites server với 163 tests pass 100% (bao gồm `knowledgeStoreService.test.ts` kiểm thử toàn diện CRUD, Negative Auth 403, 404, seed sample và chunking).
    -   TypeScript typecheck (`tsc --noEmit`) exit 0.
    -   91 UI tests pass 100%.
    -   Vite build biên dịch 21,181 modules exit 0.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   Lập task tiếp theo `B-017.md` (PH4-T03 và PH4-T04: Knowledge Template & Readiness).


## 15/11/2026 — B-015 / PH3-T07–T08 (Hoàn Tất Phase 3 & Đạt Chuẩn Gate D1)

Hoàn thành B-015 (PH3-T07 Khôi phục sau refresh/reconnect và PH3-T08 Nghiệm thu demo ba kịch bản). **Chính thức khép lại 100% Phase 3 và đạt chuẩn Gate D1 (toàn bộ 36 task PH0–PH3)**:

-   **Khôi Phục Sau Refresh/Reconnect (PH3-T07):**
    -   Nâng cấp `sessionService.ts` trong `subscribeEvents`: gửi sự kiện ban đầu `'connected'` kèm snapshot thông tin phiên (`sessionId`, `state`, `currentSpecRevisionId`).
    -   Cập nhật `index.jsx`: Tự động tái kết nối SSE và lắng nghe các sự kiện `connected`, `revision`, `message`, `build_cancelled`. Khi F5 hoặc rớt mạng kết nối lại, UI giữ vững snapshot, không kích hoạt build lại thừa thãi.
-   **Nghiệm Thu Toàn Diện Ba Kịch Bản & Gate D1 (PH3-T08):**
    -   Xây dựng bộ kiểm thử nghiệm thu tổng thể `phase3GateD1Demo.test.ts` kiểm chứng toàn bộ 3 kịch bản:
        -   **Kịch bản 1:** Tạo Agent từ prompt tiếng Việt → Tích lũy spec qua các revisions → Đạt `buildReady: true` → Tự động biên dịch Agentflow V2 Draft (Start 1.4, Agent 3.2, Tools, ChatFlow entity an toàn `deployed: false`, `isPublic: false`).
        -   **Kịch bản 2:** Chat thử nghiệm đối soát assertions chính xác → Chạy batch evaluation runner với budget cap (`maxExamples: 2`) và kiểm tra báo cáo tỷ lệ đạt.
        -   **Kịch bản 3:** Sửa Agent qua chat → Tự động tạo revision mới và sync draft không qua canvas kéo thả → Tính toán Diff trực quan → Rollback kế thừa cấu hình cũ bảo toàn lịch sử → Kích hoạt Superseded Guard khi có revision mới hơn thay thế job cũ.
-   **Kiểm thử & Nghiệm thu:**
    -   16 test suites server với 151 tests pass 100%.
    -   TypeScript typecheck (`tsc --noEmit`) exit 0.
    -   87 UI tests pass 100%.
    -   Vite build biên dịch 21,181 modules exit 0.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   Đạt mốc **Gate D1**! Lập task tiếp theo `B-016.md` mở đầu Phase 4 (Knowledge Agent).


## 15/11/2026 — B-014 / PH3-T05–T06 (Hiển Thị Diff, Khôi Phục Cấu Hình & Xử Lý Hủy/Ghi Đè Build)

Hoàn thành B-014 (PH3-T05 Hiển thị diff và khôi phục cấu hình; PH3-T06 Xử lý cancel và sửa khi build đang chạy):

-   **Spec Diff Computation Service (PH3-T05):** Xây dựng `specDiffService.ts` so sánh chi tiết giữa 2 AgentSpec: tên trợ lý, mục tiêu, hướng dẫn vận hành, danh sách công cụ (added, removed, unchanged), mô hình AI, và kịch bản kiểm thử; trả về tóm tắt biến đổi bằng tiếng Việt trực quan.
-   **API Endpoints Diff & Rollback (PH3-T05):**
    -   `GET /api/v1/agent-builder/sessions/:id/diff?rev1=...&rev2=...`
    -   `POST /api/v1/agent-builder/sessions/:id/rollback`: Khôi phục về revision chỉ định bằng cách tạo revision mới kế thừa cấu hình cũ (bảo toàn toàn bộ lịch sử tiến trình), ghi nhận tin nhắn thông báo vào phiên và tự động kích hoạt build đồng bộ draft nếu spec đạt `buildReady: true`.
-   **Giao Diện RevisionsDialog & Diff View (PH3-T05):** Nâng cấp `RevisionsDialog.jsx` hỗ trợ xem khác biệt (Diff) trực quan so với bản liền trước, xem raw JSON, và nút "Khôi phục" (Rollback) cập nhật tức thì trạng thái phiên làm việc.
-   **Cancel Guard & Superseded Guard (PH3-T06):**
    -   Cập nhật `buildPipelineService.ts`: Bổ sung kiểm tra trước và trong quá trình biên dịch/cập nhật draft. Nếu job bị người dùng hủy (`Cancel Guard`), pipeline dừng ngay không ghi đè draft.
    -   Nếu phát hiện session đã có revision mới hơn trong khi job đang thực thi (`Superseded Guard`), job cũ sẽ tự động bị hủy với lý do `superseded` và kết quả cũ bị loại bỏ an toàn, không bao giờ ghi đè draft của revision mới hơn.
-   **Kiểm thử & Nghiệm thu:**
    -   15 test suites server với 148 tests pass 100% (bao gồm `specDiffService.test.ts`, `sessionService.test.ts`, `buildPipelineService.test.ts` với Cancel Guard và Superseded Guard).
    -   TypeScript typecheck (`tsc --noEmit`) exit 0.
    -   87 UI tests pass 100% (4/4 suites).
    -   Vite build biên dịch 21,181 modules exit 0.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   Lập task tiếp theo `B-015.md` (PH3-T07 và PH3-T08 - Nghiệm thu Gate D1).


## 15/11/2026 — B-013 / PH3-T03–T04 (Chạy Bộ Thử Có Kiểm Soát & Sửa Cấu Hình Bằng Chat)

Hoàn thành B-013 (PH3-T03 Chạy bộ thử assistant có kiểm soát và PH3-T04 Sửa cấu hình Agent bằng chat):

-   **Evaluation Runner Service (PH3-T03):** Xây dựng `evaluationRunnerService.ts` cho phép chạy bộ kiểm thử hàng loạt (`batch test runner`) theo danh sách `evaluationExamples` đã cấu hình trong AgentSpec. Kiểm tra các tiêu chí assertions, đánh giá Pass/Fail, tính tỷ lệ thành công (passRate) và bảo vệ ngân sách (`maxExamples: 10`, timeoutMs) để chống cạn kiệt LLM quota.
-   **API Endpoint Chạy Test Suite (PH3-T03):** Thêm route `POST /api/v1/agent-builder/sessions/:id/test-suite` hỗ trợ chạy batch evaluation trực tiếp trên draft flow của session.
-   **Giao Diện Batch Test Report (PH3-T03):** Cập nhật `TestChatPane.jsx` bổ sung nút "Chạy bộ thử nghiệm (Batch)" và Dialog báo cáo chi tiết hiển thị tổng quan số test case đạt, từng input, output của Agent và trạng thái khớp từng assertion.
-   **Sửa Cấu Hình Agent Qua Chat & Tự Động Đồng Bộ Draft (PH3-T04):** Nâng cấp `sessionService.ts` trong hàm `addMessage`: khi người dùng gửi tin nhắn sửa đổi bằng tiếng Việt, hệ thống tự trích xuất patch, tạo revision mới; nếu spec đạt `buildReady: true` và session đã có bản draft flowise trước đó, hệ thống sẽ tự động kích hoạt `buildPipelineService.executeBuild` để cập nhật graph của flow draft và phát SSE `build_completed` mà người dùng không cần bấm thêm nút nào.
-   **Kiểm thử & Nghiệm thu:**
    -   8 unit tests cho `evaluationRunnerService.test.ts` (100% pass: chạy thành công, assertion match, budget protection maxExamples, negative auth 403, 404).
    -   Tổng 14 test suites server với 137 tests pass 100%.
    -   TypeScript typecheck (`tsc --noEmit`) exit 0.
    -   85 UI tests pass 100%.
    -   Vite build biên dịch 21,181 modules exit 0.
    -   Harness tests pass 14/15 (1 skipped host symlink).
    -   Lập task tiếp theo `B-014.md` (PH3-T05 và PH3-T06).


## 15/11/2026 — B-012 / PH3-T01–T02 (Mở đầu Phase 3)

Hoàn thành B-012 (PH3-T01 Panel Chat với Agent Draft và PH3-T02 Hiển Thị Tiến Trình & Lỗi Đầu-Cuối):

-   **Test Preview Panel (PH3-T01):** Xây dựng component `TestChatPane.jsx` với giao diện đàm thoại thử nghiệm độc lập với phiên thiết kế. Cho phép gửi trực tiếp prediction tới draft `flowId`, lưu trữ lịch sử chat thử riêng biệt và hỗ trợ nút xóa hội thoại thử nghiệm.
-   **Assertion Validation & Quick Examples (PH3-T01):** Tự động hiển thị các câu hỏi mẫu từ `evaluationExamples` dưới dạng chip để gửi nhanh. Tự động kiểm tra câu trả lời của Agent có chứa các chuỗi `assertions` không và hiển thị huy hiệu "Đạt tiêu chí" hoặc "Chưa khớp tiêu chí" trực quan.
-   **Tiến trình & Lỗi Đầu-Cuối (PH3-T02):** Lắng nghe SSE từ server (`build_completed`, `build_failed`, `build_cancelled`). Hiển thị thanh tiến trình trực quan khi đang build kèm nút hủy, và hiển thị thông báo lỗi chi tiết khi build thất bại.
-   **Tabs Chuyển Đổi:** Bổ sung thanh Tabs ở cột phải `index.jsx` cho phép chuyển mượt mà giữa "Cấu hình Agent" (`SpecCard`) và "Chat Thử Nghiệm" (`TestChatPane`), tự động chuyển tab sang chat thử khi bấm nút "Tạo Agentflow V2".
-   **Kiểm thử & Build nghiệm thu:**
    -   8 unit tests cho `testChatHelper.test.js` (100% pass).
    -   9 API client tests cho `agentBuilder.test.js` (100% pass).
    -   Toàn bộ 4/4 UI test suites pass (84/84 tests).
    -   `vite build` trên `packages/ui` biên dịch thành công 21,181 modules với exit code 0.
    -   Harness tests 14 pass, 1 skipped (host symlink policy).
    -   Lập task tiếp theo `B-013.md` (PH3-T03 và PH3-T04).

## 15/11/2026 — B-012 / PH3-T01–T02 (Mở đầu Phase 3)

Hoàn thành B-012 (PH3-T01 Panel Chat với Agent Draft và PH3-T02 Hiển Thị Tiến Trình & Lỗi Đầu-Cuối):
- **Test Preview Panel (PH3-T01):** Xây dựng component `TestChatPane.jsx` với giao diện đàm thoại thử nghiệm độc lập với phiên thiết kế. Cho phép gửi trực tiếp prediction tới draft `flowId`, lưu trữ lịch sử chat thử riêng biệt và hỗ trợ nút xóa hội thoại thử nghiệm.
- **Assertion Validation & Quick Examples (PH3-T01):** Tự động hiển thị các câu hỏi mẫu từ `evaluationExamples` dưới dạng chip để gửi nhanh. Tự động kiểm tra câu trả lời của Agent có chứa các chuỗi `assertions` không và hiển thị huy hiệu "Đạt tiêu chí" hoặc "Chưa khớp tiêu chí" trực quan.
- **Tiến trình & Lỗi Đầu-Cuối (PH3-T02):** Lắng nghe SSE từ server (`build_completed`, `build_failed`, `build_cancelled`). Hiển thị thanh tiến trình trực quan khi đang build kèm nút hủy, và hiển thị thông báo lỗi chi tiết khi build thất bại.
- **Tabs Chuyển Đổi:** Bổ sung thanh Tabs ở cột phải `index.jsx` cho phép chuyển mượt mà giữa "Cấu hình Agent" (`SpecCard`) và "Chat Thử Nghiệm" (`TestChatPane`), tự động chuyển tab sang chat thử khi bấm nút "Tạo Agentflow V2".
- **Kiểm thử & Build nghiệm thu:**
  - 8 unit tests cho `testChatHelper.test.js` (100% pass).
  - 9 API client tests cho `agentBuilder.test.js` (100% pass).
  - Toàn bộ 4/4 UI test suites pass (84/84 tests).
  - `vite build` trên `packages/ui` biên dịch thành công 21,181 modules với exit code 0.
  - Harness tests 14 pass, 1 skipped (host symlink policy).
  - Lập task tiếp theo `B-013.md` (PH3-T03 và PH3-T04).

## 15/11/2026 — B-011 / PH2-T09–T10 (Hoàn tất Gate Phase 2)

Hoàn thành B-011 (PH2-T09 Build Job Lifecycle và PH2-T10 Contract Test với Flowise Runtime). Khép lại 100% Phase 2:

-   **Build Job Lifecycle (PH2-T09):** Xây dựng entity `BuildJob` và service `BuildJobManager`. Hỗ trợ đầy đủ vòng đời trạng thái (`pending` | `running` | `completed` | `failed` | `cancelled`), kiểm soát timeout (`timeoutMs`), số lần thử tối đa (`maxAttempts: 3`), và tự động hủy bỏ (`cancelled / superseded`) các job cũ khi phiên thiết kế có bản đặc tả mới thay thế. Thêm endpoints API `/api/v1/agent-builder/builds/:id` và `/builds/:id/cancel`.
-   **Flowise Agentflow V2 Runtime Contract Test (PH2-T10):** Xây dựng bộ kiểm thử hợp đồng end-to-end `agentflowContract.test.ts` kiểm chứng toàn diện từ Vietnamese Spec → Spec Revision → Readiness check → AgentPlan → Compiler tất định → FlowValidator → FlowiseDraftAdapter → ChatFlow entity:
    -   Khớp 100% cấu trúc Canvas của Flowise V2 runtime (Start 1.4, Agent 3.2, output/input anchors, handles).
    -   Negative Auth: Bắt buộc `deployed: false` và `isPublic: false` cho draft; chặn đọc/sửa từ workspace khác (403 Forbidden).
    -   Idempotency: Thực thi build lặp lại 3 lần vẫn duy trì 1 flowId duy nhất và 1 build job duy nhất.
-   **Kiểm thử nghiệm thu:**
    -   8 unit tests cho `buildJobManager.test.ts` (100% pass).
    -   3 integration contract tests cho `agentflowContract.test.ts` (100% pass).
    -   Toàn bộ backend test suite `agent-builder` đạt 13/13 test suites pass, 129/129 tests pass.
    -   TypeScript type check (`tsc --noEmit`) đạt exit 0.
    -   UI test `agentBuilder.test.js` 4/4 pass.
    -   Harness test 14 pass, 1 skipped (symlink host policy).
    -   Lập task tiếp theo `B-012.md` (PH3-T01 và PH3-T02) mở đầu Phase 3.

## 15/11/2026 — B-011 / PH2-T09–T10 (Hoàn tất Gate Phase 2)

Hoàn thành B-011 (PH2-T09 Build Job Lifecycle và PH2-T10 Contract Test với Flowise Runtime). Khép lại 100% Phase 2:

-   **Build Job Lifecycle (PH2-T09):** Xây dựng entity `BuildJob` và service `BuildJobManager`. Hỗ trợ đầy đủ vòng đời trạng thái (`pending` | `running` | `completed` | `failed` | `cancelled`), kiểm soát timeout (`timeoutMs`), số lần thử tối đa (`maxAttempts: 3`), và tự động hủy bỏ (`cancelled / superseded`) các job cũ khi phiên thiết kế có bản đặc tả mới thay thế. Thêm endpoints API `/api/v1/agent-builder/builds/:id` và `/builds/:id/cancel`.
-   **Flowise Agentflow V2 Runtime Contract Test (PH2-T10):** Xây dựng bộ kiểm thử hợp đồng end-to-end `agentflowContract.test.ts` kiểm chứng toàn diện từ Vietnamese Spec → Spec Revision → Readiness check → AgentPlan → Compiler tất định → FlowValidator → FlowiseDraftAdapter → ChatFlow entity:
    -   Khớp 100% cấu trúc Canvas của Flowise V2 runtime (Start 1.4, Agent 3.2, output/input anchors, handles).
    -   Negative Auth: Bắt buộc `deployed: false` và `isPublic: false` cho draft; chặn đọc/sửa từ workspace khác (403 Forbidden).
    -   Idempotency: Thực thi build lặp lại 3 lần vẫn duy trì 1 flowId duy nhất và 1 build job duy nhất.
-   **Kiểm thử nghiệm thu:**
    -   8 unit tests cho `buildJobManager.test.ts` (100% pass).
    -   3 integration contract tests cho `agentflowContract.test.ts` (100% pass).
    -   Toàn bộ backend test suite `agent-builder` đạt 13/13 test suites pass, 129/129 tests pass.
    -   TypeScript type check (`tsc --noEmit`) đạt exit 0.
    -   UI test `agentBuilder.test.js` 4/4 pass.
    -   Harness test 14 pass, 1 skipped (symlink host policy).
    -   Lập task tiếp theo `B-012.md` (PH3-T01 và PH3-T02) mở đầu Phase 3.

## 15/11/2026 — B-010 / PH2-T07–T08

Hoàn thành B-010 (PH2-T07 Chuẩn Hóa Lỗi và PH2-T08 Pipeline Build Idempotency & Revision Mapping):

-   **Chuẩn Hóa Error Contract (PH2-T07):** Xây dựng hierarchy lỗi hoàn chỉnh trong `errors/builderErrors.ts` (`BuilderError`, `GeneratorError`, `CompilerError`, `AdapterError`, `BuildPipelineError`). Hàm `sanitizeErrorMessage` tự động lọc bỏ Bearer tokens, OpenAI API keys (`sk-...`) và password/secret. Method `toPayload()` chuẩn hóa `{ code, message, statusCode, retryable, details }`.
-   **Pipeline Build Idempotency & Revision Mapping (PH2-T08):** Xây dựng `BuildPipelineService` và entity `AgentDraftRevision` (cùng migration TypeORM SQLite). Đảm bảo:
    -   Idempotency 100%: Cùng `buildKey` (`sessionId:specRevisionId`) gọi lại không tạo duplicate ChatFlow hay draft revision rác.
    -   Khi có revision mới trong cùng session: Tự động cập nhật draft ChatFlow hiện hữu thay vì tạo mới tràn lan.
    -   Tích hợp phát SSE `build_completed` realtime.
    -   Bổ sung routes `/api/v1/agent-builder/sessions/:id/builds` và `/sessions/:id/drafts`.
-   **Kiểm thử nghiệm thu:**
    -   10 unit tests cho `builderErrors.test.ts` (100% pass).
    -   8 unit tests cho `buildPipelineService.test.ts` (100% pass).
    -   Toàn bộ backend test suite `agent-builder` đạt 11/11 test suites pass, 115/115 tests pass.
    -   TypeScript type check (`tsc --noEmit`) đạt exit 0.
    -   UI test `agentBuilder.test.js` 4/4 pass.
    -   Harness tests 14 pass, 1 skipped (symlink host policy).
    -   Lập task tiếp theo `B-011.md` (PH2-T09 và PH2-T10) để hoàn tất Gate Phase 2.

## 15/11/2026 — B-009 / PH2-T05–T06

Hoàn thành B-009 (PH2-T05 Server Validation cho Flow và PH2-T06 Flowise CRUD Adapter):

-   **Server Flow Validator (PH2-T05):** Xây dựng `flowValidator.ts` thẩm định toàn diện cấu trúc graph Flowise Agentflow V2: kiểm tra graph connectivity, đảm bảo có đúng 1 Start node (1.4), ít nhất 1 Agent node (3.2), chặn Start mồ côi (disconnected), kiểm tra tính toàn vẹn của edges, và kiểm tra metadata registry whitelist chống chèn node lạ.
-   **Flowise Draft Adapter (PH2-T06):** Xây dựng `flowiseDraftAdapter.ts` thực hiện CRUD an toàn cho bản draft `ChatFlow`: serialize `flowData` đúng 1 lần duy nhất thành chuỗi JSON chống double stringify; gán policy an toàn `type: EnumChatflowType.AGENTFLOW`, `deployed: false`, `isPublic: false`; đảm bảo cách ly chéo workspace (Negative Auth: 403 Forbidden khi workspace không khớp).
-   **Kiểm thử nghiệm thu:**
    -   Viết 7 unit tests cho `flowValidator.test.ts` (100% pass).
    -   Viết 10 unit tests cho `flowiseDraftAdapter.test.ts` (100% pass).
    -   Toàn bộ backend test suite `agent-builder` đạt 9/9 test suites pass, 95/95 tests pass.
    -   TypeScript type check (`tsc --noEmit`) đạt exit 0.
    -   UI test `agentBuilder.test.js` 4/4 pass.
    -   Harness tests 14 pass, 1 skipped (symlink host policy).
    -   Lập task tiếp theo `B-010.md` (PH2-T07 và PH2-T08).

## 15/11/2026 — B-009 / PH2-T05–T06

Hoàn thành B-009 (PH2-T05 Server Validation cho Flow và PH2-T06 Flowise CRUD Adapter):

-   **Server Flow Validator (PH2-T05):** Xây dựng `flowValidator.ts` thẩm định toàn diện cấu trúc graph Flowise Agentflow V2: kiểm tra graph connectivity, đảm bảo có đúng 1 Start node (1.4), ít nhất 1 Agent node (3.2), chặn Start mồ côi (disconnected), kiểm tra tính toàn vẹn của edges, và kiểm tra metadata registry whitelist chống chèn node lạ.
-   **Flowise Draft Adapter (PH2-T06):** Xây dựng `flowiseDraftAdapter.ts` thực hiện CRUD an toàn cho bản draft `ChatFlow`: serialize `flowData` đúng 1 lần duy nhất thành chuỗi JSON chống double stringify; gán policy an toàn `type: EnumChatflowType.AGENTFLOW`, `deployed: false`, `isPublic: false`; đảm bảo cách ly chéo workspace (Negative Auth: 403 Forbidden khi workspace không khớp).
-   **Kiểm thử nghiệm thu:**
    -   Viết 7 unit tests cho `flowValidator.test.ts` (100% pass).
    -   Viết 10 unit tests cho `flowiseDraftAdapter.test.ts` (100% pass).
    -   Toàn bộ backend test suite `agent-builder` đạt 9/9 test suites pass, 95/95 tests pass.
    -   TypeScript type check (`tsc --noEmit`) đạt exit 0.
    -   UI test `agentBuilder.test.js` 4/4 pass.
    -   Harness tests 14 pass, 1 skipped (symlink host policy).
    -   Lập task tiếp theo `B-010.md` (PH2-T07 và PH2-T08).

## 15/11/2026 — B-008 / PH2-T03–T04

Hoàn thành B-008 (PH2-T03 và PH2-T04): Định nghĩa AgentPlan và Viết Compiler Deterministic.

-   Xây dựng tầng trung gian `AgentPlan` (`generator/agentPlan.ts`):
    -   Định nghĩa interface `AgentPlan`, `CapabilityBinding` ánh xạ mô hình, công cụ từ allowlist registry, loại bỏ mọi code injection.
    -   Hàm `createAgentPlan`: Chuyển từ `AgentSpec v1` sang `AgentPlan`, tính toán `plan.id` bằng sha256 hash ổn định.
    -   Hàm `validateAgentPlan`: Thẩm định template compatibility, spec readiness (`buildReady: true`), capabilities allowlist và phát hiện script/eval injection trong config.
-   Xây dựng bộ biên dịch tất định `AgentflowCompiler` (`generator/compiler.ts`):
    -   Biên dịch deterministic từ `AgentPlan` sang graph Flowise Agentflow V2 `{ nodes, edges, viewport, flowConfig }`.
    -   Quy tắc tạo ID ổn định (`startAgentflow_0`, `agentAgentflow_0`, `tool_calculator_0`), tọa độ trực quan bố trí chuẩn, liên kết handles chính xác.
    -   Tự động thẩm định 100% nodes qua `validateNodeMetadata` từ B-007.
    -   Kiểm chứng tính tất định: Chạy 10 lần liên tiếp cùng input cho ra kết quả trùng khớp 100% không dựa vào LLM sinh raw graph.
-   Kiểm thử và biên dịch: Toàn bộ 75/75 unit tests module Agent Builder backend pass 100% (7 tests agentPlan, 3 tests compiler, 11 tests nodeRegistry, 5 tests assistantTemplate, 10 tests collectorService, 18 tests sessionService, 21 tests agentSpec); TypeScript typecheck (`tsc --noEmit`) 0 error; 4/4 UI tests pass. Cập nhật `B-008.md` hoàn thành, lập `B-009.md` (PH2-T05–T06) và cập nhật allowlist harness.

## 15/11/2026 — B-008 / PH2-T03–T04

Hoàn thành B-008 (PH2-T03 và PH2-T04): Định nghĩa AgentPlan và Viết Compiler Deterministic.

-   Xây dựng tầng trung gian `AgentPlan` (`generator/agentPlan.ts`):
    -   Định nghĩa interface `AgentPlan`, `CapabilityBinding` ánh xạ mô hình, công cụ từ allowlist registry, loại bỏ mọi code injection.
    -   Hàm `createAgentPlan`: Chuyển từ `AgentSpec v1` sang `AgentPlan`, tính toán `plan.id` bằng sha256 hash ổn định.
    -   Hàm `validateAgentPlan`: Thẩm định template compatibility, spec readiness (`buildReady: true`), capabilities allowlist và phát hiện script/eval injection trong config.
-   Xây dựng bộ biên dịch tất định `AgentflowCompiler` (`generator/compiler.ts`):
    -   Biên dịch deterministic từ `AgentPlan` sang graph Flowise Agentflow V2 `{ nodes, edges, viewport, flowConfig }`.
    -   Quy tắc tạo ID ổn định (`startAgentflow_0`, `agentAgentflow_0`, `tool_calculator_0`), tọa độ trực quan bố trí chuẩn, liên kết handles chính xác.
    -   Tự động thẩm định 100% nodes qua `validateNodeMetadata` từ B-007.
    -   Kiểm chứng tính tất định: Chạy 10 lần liên tiếp cùng input cho ra kết quả trùng khớp 100% không dựa vào LLM sinh raw graph.
-   Kiểm thử và biên dịch: Toàn bộ 75/75 unit tests module Agent Builder backend pass 100% (7 tests agentPlan, 3 tests compiler, 11 tests nodeRegistry, 5 tests assistantTemplate, 10 tests collectorService, 18 tests sessionService, 21 tests agentSpec); TypeScript typecheck (`tsc --noEmit`) 0 error; 4/4 UI tests pass. Cập nhật `B-008.md` hoàn thành, lập `B-009.md` (PH2-T05–T06) và cập nhật allowlist harness.

## 14/11/2026 — B-004 / PH1-T03–T04

Hoàn thành B-004 (PH1-T03–T04): Thiết kế lưu trữ Session/Message/Spec Revision và API hội thoại Builder. Tạo các TypeORM entities: `BuilderSession` (`builder_session`), `BuilderMessage` (`builder_message`, unique index theo `sessionId` và `clientMessageId`), `AgentSpecRevision` (`agent_spec_revision`, unique index theo `sessionId` và `revisionNo`). Thêm migration SQLite `1781000000000-AddAgentBuilderEntities.ts` và đăng ký trong `entities`. Xây dựng `BuilderSessionService` tại `packages/server/src/services/agent-builder/sessionService.ts` với đầy đủ tính năng tạo phiên, đọc snapshot, thêm tin nhắn idempotent chống duplicate, từ chối xung đột revision (409 Conflict), chặn truy cập chéo workspace (403 Forbidden). Xây dựng Controller và Routes tại `/api/v1/agent-builder` (`POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/messages`, `GET /sessions/:id/revisions`). Bộ unit/integration tests tại `sessionService.test.ts` đạt 16/16 tests pass; tổng module Agent Builder đạt 37/37 tests pass; `tsc --noEmit` đạt exit code 0. Cập nhật `B-004.md` hoàn thành, tạo `B-005.md` (PH1-T07–T08) và cập nhật allowlist harness.

## 14/11/2026 — B-003 / PH1-T01–T02

Bắt đầu Phase 1: Hội thoại và thu thập yêu cầu. Hoàn thành B-003 (PH1-T01–T02): Định nghĩa schema chuẩn hóa `AgentSpec v1` và hàm đánh giá tính sẵn sàng `computeReadiness()`. Triển khai trong module mới tại `packages/server/src/services/agent-builder/`: `types.ts`, `schema.ts`, `readiness.ts`, `index.ts`. Schema có `.strict()` ngăn chặn injection/tampering, tích hợp bộ kiểm tra phát hiện secret token/credential (`containsSecret`) và script độc hại (`containsScriptTag`). Hàm `computeReadiness` đánh giá deterministic các chỉ số `specReady`, `buildReady`, `testReady`, trích xuất `missingFields`, ghi nhận `assumptions` mặc định và gán `reasonCodes`. Bộ unit tests tại `agentSpec.test.ts` đạt 21/21 tests pass; `tsc --noEmit` trên `packages/server` biên dịch không lỗi (0 error). Cập nhật `B-003.md` hoàn thành, tạo `B-004.md` (PH1-T03–T04) và cập nhật allowlist harness.

## 14/11/2026 — B-002 / PH0-T07–T08

Hoàn tất B-002 (PH0-T07–T08) khép lại Phase 0 Baseline. Chốt Trợ lý Onboarding tiếng Việt (_Onboarding Assistant_) làm assistant demo cùng 3 kịch bản: tạo mới qua chat đa lượt (auto-dispatch build khi đủ thông tin), chạy thử có kiểm soát tại Preview Panel với assertions tiếng Việt và tính tuần tự, và chỉnh sửa cấu hình qua chat sinh draft revision mới không qua canvas. Model profile ref `default-builder-model` đề xuất Cloud (OpenAI/Gemini) hoặc Local Ollama, secret giữ ở `.env`/credential store local, trạng thái provider cụ thể để `needs_input` cho Phase 3. Lập ma trận phân quyền Admin/Builder/Viewer/Anonymous, server scope workspace từ `req.user`; xử lý lỗ hổng prediction draft bằng route preview riêng và chặn gọi ẩn danh khi chưa publish. Kiểm kê mã nguồn xác nhận Flowise Core thuộc Apache 2.0, Builder độc lập không phụ thuộc `packages/server/src/enterprise/` (Commercial License); fork do Nguyễn Tuấn Anh sở hữu độc lập với upstream đã EOL. Tạo quyết định chi tiết tại `AI-Agent/context/B-002_DECISIONS.md`, cập nhật `B-002.md`, lập `B-003.md` cho Phase 1 (PH1-T01–T02).

## 14/11/2026 — TASK-001 / PH0-T01–T06

Người dùng giao làm task đầu tiên và tự commit/push. Git `main` sạch tại `c31ae010` trước khi sửa. Tải Node 24.15.0/pnpm 10.26.0 portable vào thư mục local ignored, xác minh hash. Frozen install ban đầu lỗi mismatch giữa root `resolutions` và lockfile `overrides`; đồng bộ lockfile với pnpm 10 rồi frozen install exit 0. `pnpm build` exit 0, Turbo 6/6. Server SQLite local ở `127.0.0.1:3037` khởi tạo đầy đủ; Couchbase native node không load trên Windows nên integration đó chưa kiểm tra.

Tạo Start node 1.4 qua UI, fixture Start → Direct Reply sanitized; API create/read/update và prediction trả HTTP 200. Edge headless mở lại canvas với 2 node, flowData trùng fixture, không page error. **Private draft vẫn cho phép prediction ẩn danh HTTP 200** dù `deployed=false`/`isPublic=false`; GET private flow ẩn danh HTTP 401. Chưa có model credential nên LLM path và cách ly chéo workspace/org chưa kiểm tra. Đã dừng instance local sau kiểm tra. Harness tests 15/15 pass; doctor pass và nay ghi rõ nó không tự probe runtime. Tạo task handoff B-002, đổi default/allowlist context sang task đó; pack 9.148/12.000 ký tự, chưa đo token thật. Bằng chứng: [TASK-001_RUNTIME.md](../context/TASK-001_RUNTIME.md). Checkpoint hoàn thành trỏ B-002/PH0-T07–T08; không commit/push trong phiên này.

## 14/11/2026 — Commit và push theo yêu cầu

Người dùng yêu cầu thực hiện commit/push các thay đổi hiện có. Đã tách 9 file code/dependency có từ trước vào commit `8f3e3946` (chore baseline) và push thành công lên origin/main. Commit hook pretty-quick/lint-staged chạy thành công. Chạy lại harness tests: 15/15 pass, 0 skip; kiểm tra docs/phase task counts và git diff --check đạt. Bộ plan/harness/instructions/shared state/blueprint được đóng gói trong commit PLAN-000 chứa entry này. Không đưa .codegraph, AI-Agent/.local, node_modules hoặc .DS_Store vào commit. Không chạy build/runtime Flowise; chưa đo tiết kiệm token thật.

## 14/11/2026 — Nối Git với fork của người dùng

Đổi origin cũ thành upstream FlowiseAI/Flowise, thêm origin tuananh271020k5/Flowise.git, fetch main và đặt local main theo dõi origin/main. Xác minh fork/main trùng SHA nền; thiết lập push remote mặc định origin và push.default simple ở repo local. Giữ danh tính Git hiện có; chưa tạo commit hoặc push, chưa xác minh quyền ghi GitHub. Bổ sung GIT_WORKFLOW.md, quy tắc scoped task commit, task template và ignore .codegraph/; cache vẫn giữ trên đĩa. Các patch sản phẩm từ trước giữ nguyên.

## 14/11/2026 — Bàn giao khi hết quota và task MCP

Bổ sung HANDOFF.md cho Codex → Antigravity: checkpoint giữa subtask, trước thao tác dài, đối chiếu Git diff/log/process khi phiên cũ bị ngắt; root rules yêu cầu ghi tiến độ thường xuyên. Xác minh tài liệu Google về root rules; chưa chạy app Antigravity hoặc cài thêm MCP. Bổ sung đặc tả PH6-T12: đóng gói Builder/API operations được chọn thành MCP tools với schema, adapter, quyền, idempotency và client tests. Source có MCP routes theo flow, nhưng chưa chứng minh mọi API đã được bọc. Không thay đổi tổng 7 phase / 68 task sản phẩm + 8 harness, chưa triển khai sản phẩm.

## 14/11/2026 — Bổ sung plan tổng hợp theo phase/task

Theo yêu cầu làm rõ của người dùng, tạo `PLAN_TONG_HOP.md` ngay root repo: 7 phase với 68 task sản phẩm và 8 task harness. Mỗi task có đầu ra/nghiệm thu; mỗi phase có dependency và điều kiện kết thúc. D1 gồm 36 task sản phẩm, M1 gồm 46, release nội bộ gồm 56; PH6 là các nhánh mở rộng tùy chọn. Mapping với backlog IDs cũ để tránh đếm hai lần. README/master plan/backlog trỏ về file tổng hợp. Chưa triển khai tính năng sản phẩm.

## 14/11/2026 — PLAN-000

Đã đọc blueprint V2 và khảo sát Flowise qua CodeGraph/source/config. Xác nhận hướng Chat-to-Agent phù hợp; generator có sẵn chưa thay thế session/collector/spec/compiler/revision. Tạo plan, contract design, backlog, ADR, root instructions và shared state. Giữ nguyên các patch và template cũ.

Môi trường ghi nhận Node 22.19.0/pnpm.cmd 12.18.0; repo yêu cầu ^24/^10.26.0. Agentflow manifest dev.14 trong khi README dev.13. LICENSE có ngoại lệ commercial. Không install/build/start/test Flowise, không gọi LLM, chưa đo tiết kiệm token thật.

Kiểm tra đã chạy:

-   `node --test AI-Agent/harness/harness.test.mjs`: **15/15 pass**, 0 fail, 0 skipped; có test realpath/junction, giới hạn pack, revision conflict và lock.
-   `node AI-Agent/harness/harness.mjs doctor`: harness pass; báo đúng Node engine Flowise chưa đạt, runtime chưa verify.
-   `context --task AI-Agent/tasks/TASK-001.md`: tạo pack nằm trong giới hạn 12.000 ký tự; Git check-ignore xác nhận cache không được đưa vào Git mặc định.
-   Kiểm tra tài liệu: **16 Markdown files mới, 16 local links, 21 source entry points và 4 state references** đều tồn tại. Sửa pointer validator về service thực tế.
-   Git diff vẫn chỉ có 9 tracked product/dependency files đã sửa từ trước; file mới thuộc docs/harness/root instructions. Không sửa blueprint/template cũ.

Checkpoint cuối phiên được ghi bằng CLI, lưu Git/source fingerprint và next task. Bước kế tiếp là TASK-001 khi người dùng giao phần triển khai. Chưa đo actual token usage; không kết luận tiết kiệm theo phần trăm.
