# Nhật ký bàn giao ngắn

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
