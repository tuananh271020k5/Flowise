# Nhật ký bàn giao ngắn

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
