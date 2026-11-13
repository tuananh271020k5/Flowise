# CONVERSATIONAL AGENT BUILDER — FLOWISE FORK

## Technical Blueprint v2.0 • Token-Efficient Coding Harness + CodeGraph + Chat-to-Agent Product

**Ngày cập nhật:** 14/11/2026  
**Quyết định:** Phương án A — Fork Flowise, giữ Agentflow runtime, phát triển Chat-to-Agent Builder.  
**Trọng tâm sửa đổi v2:** Harness giúp **Codex, Antigravity, Claude Code** tránh đọc thừa mã nguồn và mang lại ngữ cảnh ngắn, chính xác giữa các phiên.  
**Trạng thái:** Tài liệu thiết kế + bộ tiện ích Harness chạy cục bộ; **chưa tích hợp vào fork Flowise thực tế**, chưa có đo lường tiết kiệm token trên tài khoản của bạn.

> **Phạm vi xác minh:** Các đặc điểm repo, CodeGraph và cơ chế cấu hình client được đối chiếu từ tài liệu công khai đến thời điểm soạn. `codegraph-ai/CodeGraph` được chọn làm phương án mặc định vì có nhiều dự án khác cùng tên CodeGraph. Đường dẫn file, API runtime và biến môi trường chính xác phải kiểm tra tại commit bạn fork. Các mã nguồn mới dưới đây là **đề xuất thiết kế**, không phải tính năng hiện hữu của upstream.

---

# 0. BẢN SỬA QUAN TRỌNG: HARNESS BẠN THỰC SỰ CẦN

## 0.1 Vấn đề đang giải quyết

Bạn dùng các AI coding assistant trên VS Code (Codex, Antigravity, và có thể Claude Code) để phát triển một codebase Flowise khá lớn. Nếu Agent phải đọc lại mã nguồn từ đầu, nhập quá nhiều output của tools, mở lại hàng chục file và lặp lại cùng một phân tích qua nhiều phiên, tổng token tiêu thụ sẽ tăng đáng kể. **Token-Efficient Coding Harness** được thiết kế để đưa _đúng phần ngữ cảnh, đúng thời điểm, đúng độ chi tiết_ đến Agent và lưu lại tiến độ một cách ngắn gọn.

**Mục tiêu có thể kiểm chứng:** giảm số token đầu vào và tổng token trên mỗi task được nghiệm thu, trong khi không giảm tỷ lệ task thành công, không làm mất test và không tăng lỗi hồi quy. Đây là tối ưu hiệu suất, không phải lời hứa chắc chắn giảm 50–90%.

## 0.2 Phân biệt ba lớp không được trộn lẫn

| Lớp                                  | Người dùng                        | Vai trò                                                                     | Có phải trọng tâm giảm token khi coding? |
| ------------------------------------ | --------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| **Coding Harness (chúng ta xây)**    | Developer với Codex / Antigravity | Chọn context, memory, tool routing, checkpoints, logs, đo usage, test gates | **Có**                                   |
| **CodeGraph MCP (cài từ OSS)**       | Coding Agent                      | Tra cứu symbol, dependency, callers/callees, impact; cấp snippets hẹp       | **Có, khi sử dụng đúng**                 |
| **Chat-to-Agent Builder (sản phẩm)** | Người dùng cuối                   | Chat → AgentSpec → compile → tạo và kiểm thử Agent trên Flowise             | **Không phải công cụ Coding Harness**    |

Một MCP Server **không tự nó là Harness**; `AGENTS.md` cũng không tự nó là Harness. Công dụng xuất hiện khi các quy tắc ngắn, retrieval có kiểm soát, bộ nhớ checkpoint, đo đạc và feedback loop cùng hoạt động trong quy trình coding.

## 0.3 Hai sơ đồ độc lập

**Hướng phát triển phần mềm bằng Coding Agent:**

```text
User task → Codex / Antigravity → short AGENTS.md + current task
                                ↓
                     CodeGraph MCP (core)
                                ↓
                    Selected symbols/snippets
                                ↓
                        Edit actual source
                                ↓
                 Targeted tests + log filtering
                                ↓
                 Short checkpoint + usage metrics
                                ↓
                       Next clean session
```

**Sản phẩm người dùng cuối (được coding agent xây dựng):**

```text
Business user chat → Requirement Collector → validated AgentSpec
                   → Planner → AgentPlan → Flow Compiler Adapter
                   → Flowise draft → validation → sandbox test
                   → human approval → controlled publish
```

## 0.4 Cách đọc tài liệu

-   **Ưu tiên ngay:** chương 0, 13, 14, 22–26 và bộ ZIP Harness. Đây là phần mới nhất và liên quan trực tiếp đến token.
-   **Thiết kế sản phẩm:** chương 1–12 và 15–21. Những phần này mô tả Flowise, API, dữ liệu, kiểm thử, bảo mật và roadmap.
-   **Không đưa toàn bộ tài liệu vào `AGENTS.md`.** Rules luôn-on ngắn; chỉ mở đúng chương khi task cần. Việc nạp toàn bộ tài liệu 1 lần vào mọi prompt sẽ phản tác dụng.

# 1. TÓM TẮT ĐIỀU HÀNH

## 1.1 Sản phẩm chúng ta đang xây

Flowise hiện thiên về tương tác với canvas: tạo node, cấu hình node, nối edges, chỉnh parameters và chạy workflow. Dự án mới phát triển một trải nghiệm **Chat-to-Agent**: mô tả nhu cầu bằng tiếng Việt; AI hỏi tiếp những dữ kiện thiết yếu; tự chọn kiểu Agent và dữ liệu/công cụ cần thiết; sinh AgentSpec, AgentPlan; chuyển thành Flowise Agentflow V2; chạy validation/test; cho người dùng xem kết quả và tiếp tục điều chỉnh bằng chat.

Không phải xây một chatbot RAG đơn thuần. Đây là **Meta-Agent / Builder Control Plane** chuyên tạo ra các Agent khác. Bộ phận này có quyền tạo bản nháp nhưng **không** có quyền tự ý triển khai production hoặc thực hiện hành động thay đổi dữ liệu thật.

## 1.2 Quyết định kiến trúc cơ bản

-   **Fork Flowise** làm nền runtime; pin commit rõ ràng, không phụ thuộc các bản cập nhật từ upstream đã đóng.
-   **Giữ Flowise Runtime** trong `packages/server` và hệ node của `packages/components`; không viết mới execution engine ở MVP.
-   **Tận dụng `packages/agentflow`** ở mức có thể, vì package đã có chức năng sinh flow từ ngôn ngữ tự nhiên và flow validation. Đây là API đang ở trạng thái dev; bắt buộc kiểm chứng trên commit cố định và không đặt nó làm phụ thuộc duy nhất.
-   **Chat UI** nằm trong hệ UI React; cân nhắc `assistant-ui` nếu tăng tốc trải nghiệm chat. Không ép thêm một framework frontend thứ hai ngay giai đoạn 1.
-   **Builder Orchestrator** độc lập với engine; trao đổi bằng `AgentSpec` và `AgentPlan` được kiểm tra schema.
-   **Compiler Adapter** duy nhất chịu trách nhiệm chuyển plan thành `flowData` đúng định dạng bản fork đang chạy. Có contract tests.
-   **CodeGraph MCP** giúp Coding Harness tìm ngữ cảnh tối thiểu; không phải MCP cho Agent sản phẩm. Cần đo chi phí/hiệu quả thực tế.
-   **Harness** là hệ thống rules + ngữ cảnh + quy trình + test + security gates, không phải một mô hình AI khác.

## 1.3 Kết quả bàn giao trong gói lần này

1. Bản thiết kế Word/Markdown cập nhật v2: phần kiến trúc sản phẩm và **Coding Harness giảm token** được tách rõ.
2. Bộ **Harness overlay v2** có thể chép có kiểm soát vào fork Flowise: rules nhỏ, CodeGraph configs ví dụ, context pack, checkpoint, log filtering, usage tracking, tests.
3. Task 001: lập baseline tại pinned SHA trước khi sửa runtime, sau đó triển khai theo từng vertical slice.

**Không bao gồm** bản fork Flowise, API keys, dịch vụ LLM, database production, server MCP production hoặc một ứng dụng Builder đã triển khai.

# 2. HIỆN TRẠNG BASE FLOWISE & CÁC RÀNG BUỘC THỰC TẾ

## 2.1 Repo nguồn

Repo: `https://github.com/FlowiseAI/Flowise` – monorepo TypeScript/React/Node.js dùng pnpm + Turbo. Theo repo kiểm tra ngày 14/11/2026, các phần đáng chú ý là:

| Thành phần                                           | Vai trò gốc                                  | Định hướng dùng trong dự án                      |
| ---------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `packages/server`                                    | Backend/API, entities, runner Agentflow      | Giữ runtime, thêm Builder APIs và adapters       |
| `packages/ui`                                        | React UI/canvas                              | Tạo trang Chat Builder; giữ canvas Developer     |
| `packages/components`                                | Node definitions, tools, models, credentials | Catalog node allowlist, schema parameters        |
| `packages/agentflow`                                 | Embeddable editor, generator, validator      | Tái sử dụng logic/giao diện debug có thể phù hợp |
| `packages/api-documentation` (nếu có trong SHA fork) | API docs                                     | Cập nhật tài liệu Builder APIs                   |
| `docker`, `.github`, `pnpm-workspace.yaml`           | Build/deploy/CI                              | Giữ nền, bổ sung cấu hình an toàn                |

**Quan trọng:** `packages/agentflow` theo README ở trạng thái `0.0.0-dev.13`, có AI Flow Generator, validator graph, component API và các tính năng chưa ổn định. Không được xem nó là SDK runtime độc lập đã sẵn sàng production.

## 2.2 Build tool phiên bản thực tế

File `.nvmrc` gốc đang ghi `v24.15.0`; `package.json` gốc khai báo engine `node: ^24` và `pnpm: ^10.26.0`. Do đó trong fork hiện tại phải ưu tiên **Node 24 + pnpm 10** (không dùng hướng dẫn Node 20 cũ nếu lệch package.json). Pin lại theo SHA bạn fork, tránh giả định mọi tag Flowise giống nhau.

PowerShell khởi tạo tham khảo:

```powershell
# 1) Fork trên GitHub, sau đó thay YOUR_ACCOUNT
 git clone https://github.com/YOUR_ACCOUNT/Flowise.git
 cd Flowise
 git remote add upstream https://github.com/FlowiseAI/Flowise.git
 git rev-parse HEAD   # lưu SHA vào docs/BASELINE.md

# 2) Kiểm tra environment từ commit đang dùng
 Get-Content .nvmrc
 node -v
 corepack --version
 corepack enable
 corepack prepare pnpm@10.26.0 --activate
 pnpm -v

# 3) Cài và chạy tại địa phương
 pnpm install --frozen-lockfile
 pnpm build
 pnpm dev
```

Nếu có lỗi npm/node-gyp native modules trên Windows, ghi log và xử lý theo dependency thực tế; không tắt security policies để “cài cho bằng được”. Có thể dùng WSL2/Docker làm đường dự phòng. Sau cài, xác nhận URL và auth từ log runtime thay vì đoán port.

## 2.3 Rủi ro pháp lý và vòng đời

Flowise được cấp phép Apache-2.0 nhưng repo đã được archive ngày **13/08/2026**, EOL **31/08/2026**. Có các GitHub Security Advisories ảnh hưởng nhiều chức năng. **Kết luận:** fork là hợp lý để làm MVP/PoC; không mở instance ra Internet hoặc dùng với dữ liệu nhạy cảm trước khi audit, patch, pentest và có owner bảo trì bản fork. Giữ giấy phép NOTICE/LICENSE đúng quy định và rà giấy phép các dependency.

## 2.4 Các điểm phải reverse-engineer trong Task 001

-   Endpoint tạo/cập nhật flow thực sự tại fork: API docs có `POST /chatflows`, `PUT /chatflows/{id}`, trường `flowData` dạng **string JSON**; phần base path `/api/v1` và yêu cầu auth cần xác minh trong code/runtime.
-   `packages/agentflow/src/infrastructure/api/chatflows.ts` có lời gọi `POST /agentflowv2-generator/generate`; đọc route/controller/schema thật để biết khả năng tái sử dụng.
-   Định dạng node `FlowData`, các trường `data.inputs`, `outputAnchors`, `id`, edge handle/condition: phải được lấy từ fixture hoặc flow xuất ra từ chính fork.
-   Cơ chế version/credentials/tenant hiện có: không tự viết lại hoặc bỏ qua middleware.
-   Runner của Agentflow V2 nằm ở server; cần map cả luồng validate → save → execute → logs.

# 3. TẦM NHÌN SẢN PHẨM VÀ ĐỐI TƯỢNG NGƯỜI DÙNG

## 3.1 North Star

**“Từ một đoạn hội thoại sang một Agent kiểm thử được, có thể giải thích, sửa, triển khai có kiểm soát.”** Người dùng nghiệp vụ không cần hiểu DAG hay cấu trúc node, nhưng developer phải xem được flow diff, logs và lỗi.

## 3.2 Personas

| Persona        | Nhu cầu                                 | Quyền                             |
| -------------- | --------------------------------------- | --------------------------------- |
| Business user  | Mô tả Agent, bổ sung yêu cầu, chat thử  | Tạo draft, chạy sandbox an toàn   |
| Builder owner  | Chỉnh cấu hình Agent, chọn tool/data    | Review draft, yêu cầu publish     |
| Developer      | Xem và sửa canvas, troubleshoot         | Debug, audit, quản lý adapter     |
| Admin/Security | Quản lý identity, connector, chính sách | Approve connectors/publish, audit |

## 3.3 Tình huống tham chiếu

**A. Document/Knowledge Agent:** “Tạo một Agent trả lời câu hỏi về quy trình từ tài liệu PDF và SharePoint, trích nguồn, tiếng Việt.” Builder hỏi về nơi lưu, quyền đọc, cập nhật dữ liệu, mẫu câu hỏi và yêu cầu citation.

**B. API Agent chỉ đọc:** “Tạo Agent tra cứu trạng thái đơn hàng qua REST API nội bộ.” Builder yêu cầu API schema hoặc OpenAPI, ví dụ request/response, credentialRef và quyền truy cập; không bật POST/PUT/PATCH/DELETE trong MVP.

**C. Data Analyst Agent chỉ đọc:** “Tạo Agent phân tích doanh thu từ SQL/Microsoft Fabric và trả bảng/biểu đồ.” Builder yêu cầu dataset/endpoint cụ thể, tenant, row-level policy và chỉ cho phép truy vấn readonly/allowlist; không tự sinh quyền truy cập mới.

**D. Tích hợp Word Add-in ở phiên bản sau:** Word gửi yêu cầu vào Builder/Agent Runtime qua API; backend xác minh identity, xử lý tài liệu, trả kết quả; quyền sửa văn bản do người dùng approve trong Word. Không biến Word Add-in thành phần cứng phụ thuộc ở MVP.

## 3.4 Không làm trong MVP

-   Không tự sinh code Python/JavaScript và chạy tùy ý.
-   Không tự tạo SaaS connector bằng cách hỏi API key trực tiếp trong chat.
-   Không tự triển khai Agent lên Internet/public hoặc cấp quyền multi-tenant.
-   Không bảo đảm Agent đúng 100%, “tự sửa vô hạn” hoặc truy cập mọi dịch vụ.
-   Không hỗ trợ tất cả node Flowise ngay ngày đầu; dùng allowlist template đã qua test.

# 4. TRẢI NGHIỆM CHAT-TO-AGENT

## 4.1 Happy path

1. Người dùng chọn “Tạo Agent mới” và mô tả mục tiêu bằng tiếng Việt.
2. AI phân loại thành `knowledge`, `api-readonly`, `data-readonly`; hỏi tối đa những thông tin blocking (nguồn dữ liệu, output mong muốn, policy, quyền/công cụ).
3. Builder hiển thị “Bản mô tả Agent” dạng tóm tắt: mục đích, inputs, outputs, model (logical ref), tools, dữ liệu, tiêu chí đánh giá, ràng buộc an toàn.
4. Người dùng có thể sửa bằng chat; Builder đánh dấu thiếu thông tin và không lặp lại câu hỏi đã có câu trả lời.
5. Khi `specReady = true`, hệ thống tự sinh **draft** trong Flowise (không tự publish), chạy validation và smoke test sandbox.
6. Trả kết quả trong chat: trạng thái, bản flow tóm tắt, test cases pass/fail, lỗi/giới hạn, nút “Chạy thử”, “Xem canvas”, “Chỉnh bằng chat”.
7. Người dùng nhắn: “Thêm trích dẫn nguồn và chỉ trả lời khi có bằng chứng.” Builder tạo **revision mới** từ AgentSpec/plan, so sánh diff, test lại.
8. Khi đạt tiêu chí, owner có thể yêu cầu publish; server kiểm tra policy và approval, sau đó mới triển khai.

## 4.2 Conversation UI phải có

-   Thread với streaming tokens, trạng thái tool/build/test có thể quan sát.
-   Thẻ “Thiếu thông tin”: hỏi đúng thông tin blocking, cho phép trả lời bằng chat, không ép form lớn.
-   Bảng tóm tắt AgentSpec (mục tiêu, nguồn dữ liệu, tools, quyền, chi phí dự kiến).
-   Timeline tiến độ: Discovery → Design → Generate → Validate → Test → Ready.
-   Diff version (đã thêm/bớt node hoặc đổi config), “Revert draft”.
-   Sandbox chat panel có logs và test history.
-   Cảnh báo secrets/access denied; không yêu cầu paste secret vào chat.
-   Developer view: mở canvas readonly/edit có quyền, inspect node/edge và raw logs.

## 4.3 Conversation State Machine (đề xuất)

```text
NEW
 └── DISCOVERING ──(missing blocking fields)──> ASKING_QUESTION
           ^                                      │
           └────────────(user reply)─────────────┘
           │
           └── SPEC_READY ──> PLANNING ──> COMPILING ──> VALIDATING
                                                         │
                           FAILED <──[invalid]──────────┤
                             │                           └── SANDBOX_TESTING
                             └── REPAIRING (max 2-3) ────────────┤
                                                                  ├── DRAFT_READY
                                                                  └── HUMAN_REVIEW
 DRAFT_READY ──(edit chat)──> SPEC_REVISION ──> PLANNING ...
 DRAFT_READY ──(publish request + approval)──> PUBLISHED
```

Mọi transition có event/audit record. Có CANCELLED, TIMEOUT, PERMISSION_DENIED và FAILED terminal paths. `SPEC_READY` không đồng nghĩa có credential hợp lệ; build có thể tạo placeholder và yêu cầu user liên kết connector trong UI bảo mật.

## 4.4 Logic “đủ thông tin”

Chọn `blockingFields` dựa vào `kind`: goal, output expectations, data source specification, authorized connection reference, side effect policy, language, sample success cases. Một số trường có thể dùng default an toàn (private/draft/readonly) mà không hỏi. Trước khi tạo bản nháp, Builder phải tóm tắt các giả định và ghi lại trường “unknown”.

# 5. KIẾN TRÚC LOGICAL – CONTROL PLANE VS RUNTIME

```text
           [Web Chat / Word Add-in ở giai đoạn sau]
                         |
                   [BFF / Auth]
                         |
      +------------------v----------------------+
      |     BUILDER CONTROL PLANE (mới)         |
      | Chat Session / Requirement Collector    |
      | AgentSpec Validator / Policy Engine     |
      | Planner / Template Selector             |
      | Flow Compiler Adapter                   |
      | Draft Version / Approval / Audit        |
      | Test Orchestrator / Cost & Retry Budget |
      +----------+-------------------+----------+
                 |                   |
          [LLM provider]        [Flowise API]
                                     |
      +------------------------------v----------+
      |     FLOWISE EXECUTION PLANE (fork)      |
      | packages/server + components            |
      | Agentflow V2 runtime / credentials       |
      | execution / logs / API                   |
      +----------------------+------------------+
                             |
                    [Approved tools/data]
                             |
        [SharePoint] [SQL] [Vector DB] [REST APIs]

Developer tools (ngoài runtime): VS Code + CodeGraph MCP + Harness + GitHub CI
```

## 5.1 Các boundary

-   **Browser ↔ Builder API:** user session/auth/csrf/rate limits, không để LLM provider key ở browser.
-   **Builder ↔ Flowise:** service-to-service auth, scoped credentials và tenant; chỉ route admin nội bộ.
-   **Flowise ↔ data tools:** credentialRef + allowlist/egress; policy của nguồn dữ liệu còn hiệu lực.
-   **LLM ↔ untrusted docs:** chống prompt injection, hạn chế tool quyền cao, không copy toàn bộ document nhạy cảm vào prompt không cần thiết.

## 5.2 Tại sao tách compiler?

Mô hình có thể tạo AgentPlan gần đúng nhưng `flowData` là định dạng nội bộ riêng, có thể đổi khi nâng cấp. Compiler dựa trên **template có fixture/metadata có thực**, deterministic mapping và type-check, giúp giảm lỗi “AI bịa node”. Adapter có thể được thay thế nếu về sau chuyển runtime khác.

# 6. CẤU TRÚC CODEBASE ĐỀ XUẤT

## 6.1 Chiến lược sửa ít nhất

Không dựng monorepo mới song song. Chỉ thêm feature modules vào codebase Flowise và chọn đường dẫn theo conventions đã xác minh từ repo thực. Sơ đồ **đề xuất** dưới đây không khẳng định các thư mục `builder` đã tồn tại ở upstream:

```text
Flowise-fork/
├─ packages/
│  ├─ server/                     # upstream, giữ runner/API
│  │  └─ src/
│  │     └─ [builder-module]/     # MỚI: routes/services/DTO/repository
│  ├─ ui/                         # upstream React
│  │  └─ src/
│  │     └─ [builder-pages]/      # MỚI: Chat, Draft, Test, Diff
│  ├─ components/                 # upstream node catalogue
│  └─ agentflow/                  # upstream generator/editor/validator dev
├─ docs/
│  ├─ architecture/
│  ├─ adr/
│  └─ harness/                   # MỚI: nguồn rules + playbooks
├─ schemas/                       # MỚI: AgentSpec v1, plan/events later
├─ fixtures/                      # MỚI: sample spec, flow, golden cases
├─ scripts/harness/               # MỚI: sync, preflight, validators
├─ tests/harness/                 # MỚI: self-tests
├─ AGENTS.md                      # Generated – Codex
├─ CLAUDE.md                      # Generated – Claude Code
├─ GEMINI.md                      # Generated – Antigravity
└─ .github/copilot-instructions.md # Generated – Copilot
```

Tương lai có thể tách `packages/builder-core`, `packages/builder-ui` khi logic ổn định và cần tái sử dụng. Nhưng thêm workspace package sớm tạo gánh nặng import/tsconfig/build. Quyết định đó cần ADR.

## 6.2 Các lớp backend đề xuất

| Module                 | Interface/nhiệm vụ                        | Không được làm                       |
| ---------------------- | ----------------------------------------- | ------------------------------------ |
| `ConversationService`  | Lưu messages/state, SSE events            | Không tin user-provided tenantId     |
| `RequirementCollector` | Chuyển lịch sử thành AgentSpec patch      | Không đọc credentials raw            |
| `SpecValidator`        | Schema/policy + missing blocking fields   | Không sửa ngầm yêu cầu quan trọng    |
| `Planner`              | Chọn template, sinh AgentPlan             | Không chọn node chưa nằm allowlist   |
| `FlowCompiler`         | AgentPlan → Flowise flowData              | Không exec raw JS/LLM output         |
| `FlowiseAdapter`       | CRUD draft, run tests, logs, capabilities | Không expose bearer token ra UI      |
| `TestRunner`           | Fixtures, sandbox executions, score       | Không gọi tools thật trong unit test |
| `ApprovalService`      | Human approval/revocation                 | Không auto-approve                   |
| `VersionStore`         | Snapshot/revision/diff/rollback           | Không overwrite deployed revision    |
| `AuditLogger`          | actor, decision, timestamps, results      | Không log secret/prompt nhạy cảm     |

# 7. DATA CONTRACT: AgentSpec → AgentPlan → flowData

## 7.1 AgentSpec: hợp đồng nghiệp vụ

Không để LLM trả về JSON Flowise trực tiếp. Nó xuất AgentSpec kiểu dữ liệu độc lập runtime. Bản đầu trong Harness có `schemas/agent-spec.schema.json` và `fixtures/agent-spec.sample.json`.

```json
{
    "schemaVersion": "1.0.0",
    "name": "Word Policy Assistant",
    "slug": "word-policy-assistant",
    "kind": "knowledge",
    "goal": "Trả lời câu hỏi về quy định nội bộ kèm trích dẫn.",
    "language": "vi",
    "inputs": ["user_message"],
    "outputs": ["answer", "citations"],
    "model": { "provider": "openai", "name": "configured-model-ref" },
    "dataSources": [{ "id": "policies", "type": "sharepoint", "credentialRef": "cred_sharepoint_draft", "mode": "read" }],
    "tools": [],
    "policy": { "approvalForPublish": true, "allowExternalHttp": false, "allowCodeExecution": false, "maxRepairAttempts": 2 },
    "deployment": { "visibility": "private", "status": "draft" }
}
```

Lưu ý: JSON trên mang tính đề xuất, schema MVP không lưu endpoint/token bí mật. `configured-model-ref` và `credentialRef` chỉ là tham chiếu phải được resolved ở server. Validator script trong Harness chỉ là **check cơ bản**, chưa thay thế JSON Schema full validator production.

## 7.2 AgentPlan: hợp đồng kỹ thuật (đề xuất)

```typescript
type AgentKind = 'knowledge' | 'api-readonly' | 'data-readonly'
interface AgentPlan {
    planVersion: '1.0.0'
    specRevisionId: string
    kind: AgentKind
    templateId: string // allowlisted, pinned version
    steps: Array<{
        id: string
        capability: 'start' | 'retrieve' | 'llm' | 'readonlyTool' | 'reply'
        configRef?: string // safe reference, never secret
        next?: string[]
    }>
    expectedChecks: string[]
    policyRef: string
}
```

Parser/schema phải bảo đảm tham chiếu id tồn tại, tool names thuộc allowlist, không cycle trái policy, không dùng loại `customFunction` trong MVP. `expectedChecks` là input cho test generation, không được để LLM tự chấm mọi test của nó mà không có golden assertions.

## 7.3 FlowData: hợp đồng nội bộ runtime

Từ AgentPlan, compiler tạo object có `nodes[]`, `edges[]`, `viewport`; khi gọi API Chatflows, giá trị `flowData` thường là `JSON.stringify(flow)` theo contract đã kiểm chứng. `id/name`, `outputAnchors`, input schema và handles phải lấy từ node catalog thực hoặc export fixture của pinned Flowise; không hardcode đoán từ readme.

**Adapter pseudocode (định hướng, chưa chạy):**

```typescript
async function createDraft(spec: AgentSpec, actor: Actor) {
    authorize(actor, 'builder:draft:create')
    const safeSpec = validateSpec(spec)
    const plan = await planner.plan(safeSpec)
    validatePlan(plan, templateRegistry, actor.policy)
    const flowData = compiler.compile(plan, runtimeCapabilities)
    validateGraph(flowData)
    await flowiseAdapter.validateNodeInputs(flowData)
    const revision = await versionStore.snapshotDraft(safeSpec, plan, flowData)
    return flowiseAdapter.createUndeployedDraft({
        name: safeSpec.name,
        flowData,
        revisionId: revision.id
    })
}
```

## 7.4 Versioning bất biến

-   `BuildSession` 1→N `AgentSpecRevision`; mỗi revision giữ schemaVersion, user edits, generated assumptions, status.
-   `FlowDraftRevision` chứa `planHash`, `flowHash`, pinned Flowise SHA, compilerVersion, templateVersion và `createdBy`.
-   Khi edit qua chat: tách “spec patch” với “runtime patch”, ghi diff trước khi apply; optimistic locking tránh ghi đè revision mới nhất.
-   `PublishedVersion` luôn trỏ về revision immutable, có approval record.

# 8. API BACKEND (ĐỀ XUẤT – CHƯA CÓ TRONG FLOWISE)

Tất cả endpoint `/api/builder/...` bên dưới là **API mới** cần implement, không phải endpoint đã được xác nhận có sẵn trong Flowise. Nếu repo có middleware route prefix, hãy tuân theo naming convention thực tế.

| Method | Endpoint đề xuất                           | Chức năng/ghi chú                    |
| ------ | ------------------------------------------ | ------------------------------------ |
| POST   | `/api/builder/sessions`                    | Tạo session, authenticated user      |
| POST   | `/api/builder/sessions/{id}/messages`      | Chat message, streaming events       |
| GET    | `/api/builder/sessions/{id}`               | State + messages + spec summary      |
| POST   | `/api/builder/sessions/{id}/compile`       | Compile specReady → draft idempotent |
| POST   | `/api/builder/drafts/{id}/validate`        | Schema/graph/node validator          |
| POST   | `/api/builder/drafts/{id}/test`            | Sandbox test with budget             |
| GET    | `/api/builder/drafts/{id}/revisions`       | History/diff/rollback candidates     |
| POST   | `/api/builder/drafts/{id}/publish-request` | Request human approval               |
| POST   | `/api/builder/approvals/{id}/decision`     | Approve/reject by authorized actor   |
| POST   | `/api/builder/drafts/{id}/publish`         | Authorized publish after approval    |

### Request examples

```json
POST /api/builder/sessions
{"intent":"create-agent","locale":"vi","channel":"web"}
```

```json
POST /api/builder/sessions/s_123/messages
{"clientMessageId":"msg_abc","text":"Tạo Agent đọc quy định SharePoint"}
```

### Response / event envelope

```json
{
    "eventType": "build.progress",
    "sessionId": "s_123",
    "draftId": "d_456",
    "stage": "validating",
    "percent": 70,
    "requestId": "req_789",
    "timestamp": "2026-11-14T00:00:00Z"
}
```

Event types đề xuất: `chat.delta`, `requirements.missing`, `spec.updated`, `plan.created`, `build.started`, `build.progress`, `validation.failed`, `test.completed`, `draft.ready`, `approval.required`, `publish.completed`, `build.failed`. `percent` có thể là bước ước lượng, không được giả là thời lượng chính xác.

### Giao diện Flowise bên dưới

-   `POST /chatflows` và `PUT /chatflows/{id}` trong docs Flowise có trường `flowData` kiểu `string`; auth Bearer. Kiểm tra URL/base path, tenant/workspace và response trên fork.
-   Generator call `POST /agentflowv2-generator/generate` xuất hiện trong mã nguồn Agentflow package; đây là endpoint nội bộ cần kiểm chứng và có thể thay bằng compiler riêng nếu thiếu độ ổn định/kiểm soát.
-   Endpoint Prediction cho runtime phải được xác minh trước khi dùng làm E2E; không sao chép ví dụ từ Internet và giả định luôn đúng.

# 9. DATABASE & LIFECYCLE

## 9.1 Dữ liệu bổ sung (đề xuất)

| Bảng/collection           | Thuộc tính chính                           | Retention/ràng buộc       |
| ------------------------- | ------------------------------------------ | ------------------------- |
| `builder_sessions`        | id, actor_id, tenant_id, state, timestamps | TTL/policy, authorization |
| `builder_messages`        | id, session_id, role, redacted_body        | Không lưu raw secret      |
| `agent_spec_revisions`    | id, session_id, spec_json, revision_no     | Immutable                 |
| `agent_draft_revisions`   | id, spec_rev_id, flow_ref, hashes          | Immutable + runtime SHA   |
| `builder_evaluation_runs` | id, draft_rev_id, metrics, status          | Golden/policy checks      |
| `builder_approvals`       | id, requested_by, decision_by, status      | Strong auth/audit         |
| `builder_audit_events`    | id, actor, action, trace_id, redacted_diff | Append only               |

## 9.2 Thiết kế storage an toàn

Có thể bắt đầu bằng database backend đang dùng trong Flowise cho local PoC, nhưng không đưa bất kỳ migration nào vào repo khi chưa đọc TypeORM conventions và khả năng upgrade. Thêm foreign keys tenant/workspace phù hợp. Tách `builder_messages` khỏi `chatflows` để tránh dẫm lịch sử runtime chat. Cơ chế backup và restore phải thử trước deployment.

## 9.3 Quản lý trạng thái

State transition nên transactional và idempotent. `clientMessageId` giúp retry không tạo duplicate message. `compileRequestId` ngăn nhiều flow draft khi người dùng click liên tiếp. Dùng optimistic `revisionNo` hoặc `etag` để chống sửa đồng thời. Khi lỗi runtime, không xóa draft ngay: giữ redacted diagnostics và trạng thái FAILED để người dùng sửa tiếp.

# 10. BUILDER ENGINE: GIẢI THUẬT & LLM STRATEGY

## 10.1 Thành phần và trách nhiệm

**Requirement Collector** nhận hội thoại, phân loại Agent kind, điền fields, phân biệt `known`, `assumed`, `missing`, không hỏi trùng. Chỉ dùng structured output AgentSpec patch.  
**Planner** chọn template có phiên bản và giải thích logic ngắn gọn.  
**Compiler** ánh xạ capability sang node metadata hợp lệ; không nhận cấu hình node nguy hiểm.  
**Test Orchestrator** chạy static check, dry run với data stub, kiểm tra golden cases và giới hạn chi phí.  
**Repair Loop** chỉ sửa draft dựa trên lỗi cụ thể, không lặp vô hạn, không tự đổi policy/read-only thành write.

## 10.2 Prompt / tool boundaries

-   **System policy**: bất biến có tính ưu tiên cao (approval, no secrets, readonly).
-   **Builder developer prompt**: định dạng structured outputs và quy tắc hỏi thiếu thông tin.
-   **User utterances**: yêu cầu nghiệp vụ có thể xung đột policy, phải được kiểm tra.
-   **Retrieved documents**: dữ liệu không đáng tin và không được làm lệnh điều khiển Builder.
-   **Tool definitions**: allowlist backend, server-side auth; reject arguments không thuộc schema.

## 10.3 Model strategy – tránh phụ thuộc 1 provider

Tạo interface `LLMProvider` có `generateStructured`, `streamAnswer`, `estimateCost` và `requestId`, model configured qua secret manager. Cho MVP ưu tiên một provider để dễ đo chất lượng; chuẩn bị adapter phụ từ sau. Phiên bản của model/temperature/tool definitions phải được ghi vào test run để tái hiện lỗi.

## 10.4 Token/cost budget

-   Context retrieval ngắn: lấy tối đa vài symbol/code snippets đúng phạm vi bằng CodeGraph (với **developer task**, không phải chat của end-user).
-   Runtime Builder: tóm tắt messages cũ khi dài, chỉ tải AgentSpec hiện hành và 2–3 turn gần nhất; không đẩy toàn bộ source code cho LLM.
-   Limit ví dụ MVP: tối đa 2 lần repair tự động, giới hạn runtime per build, cost ceiling cấu hình theo tenant; số tiền/timeout do người vận hành quyết định sau benchmark thực tế.
-   Không khẳng định Harness/CodeGraph luôn giảm token; cần so sánh số tokens, số tool calls, thời gian và lỗi giữa 2 nhóm có/không có Harness.

# 11. VALIDATION, TESTING, SELF-REPAIR

## 11.1 Bốn tầng kiểm thử Agent được tạo

| Tầng                  | Nội dung                                            | Ví dụ thất bại              |
| --------------------- | --------------------------------------------------- | --------------------------- |
| AgentSpec schema      | Required/type, credential references, policy        | Bị yêu cầu publish public   |
| Graph static          | Start node, edge references, connectivity, cycles   | Node mất kết nối            |
| Node/runtime contract | Node param, credentialRef, model/tool compatibility | llmModel chưa được cấu hình |
| Functional eval       | Golden input/output, citations, read-only, privacy  | Câu trả lời bịa trích dẫn   |

Script Harness hiện có kiểm tra tầng 1 và một phần tầng 2. **Chưa** kiểm tra schemas cụ thể node Flowise, network sandbox, prompt injection và tenant isolation; những phần này phải implement và test trên repo đã fork.

## 11.2 Bộ golden eval khuyến nghị

-   10 case Knowledge: trích đúng nguồn, thiếu tài liệu thì trả lời không đủ căn cứ, không truyền dữ liệu ra Internet.
-   10 case API read-only: đúng param, lỗi 401/403/429, tool không tự chuyển sang POST/DELETE.
-   10 case SQL readonly: nhận diện scope đúng, không thực thi UPDATE/DELETE, giới hạn kết quả.
-   5 case conversational edit: thêm tool, đổi model, thay instruction, revert, conflict revision.
-   5 case adversarial: prompt injection trong file, secret exfiltration, tenant spoofing, tool-injection, oversized input.

Bộ 40 case là mục tiêu đề xuất. Chất lượng tạo draft nên đo `valid_graph_rate`, `first_test_pass_rate`, `time_to_draft`, `human_correction_count`, `total_cost_per_draft`, `policy_violation_count`; chưa áp chỉ tiêu cứng đến khi có baseline.

## 11.3 Repair policy

```text
failed validation/test
→ classify error (schema/graph/param/auth/tool/quality)
→ if auth/credential/security: stop + human action
→ if deterministic graph/param error: compiler correction
→ if generation quality error: LLM repair using ONLY redacted diagnostics
→ maxRepairAttempts reached: stop, explain error, preserve draft
```

Không retry lỗi 401 bằng cách dùng credential khác, không tự nới quyền, không chạy test có side effects trên nguồn production.

# 12. MCP: ĐIỂM NÀO CẦN & KHÔNG CẦN

## 12.1 MCP của CodeGraph

MCP CodeGraph cho **AI coding**: đọc semantic symbols, callers, dependencies, impact. CodeGraph tuyên bố hỗ trợ 38 ngôn ngữ và nhiều tools; có profiles `core` (8 tools) và `graph` (17). Với task thông thường dùng profile core để giảm tool surface/context; graph khi refactor. Cài extension/MCP vào VS Code/Claude/agent client theo docs, profile/bin path phải kiểm tra trên máy.

## 12.2 MCP cho Agents được tạo

Ví dụ Agent cần đọc SharePoint hoặc SQL qua MCP server: đây là runtime integration **khác** CodeGraph. MVP có thể dùng API/tool tích hợp sẵn của Flowise thay vì phải tự triển khai MCP Server. Chỉ nên viết MCP wrapper nếu nhiều Agent dùng chung tool interface, cần discover tools động hoặc tích hợp dịch vụ chưa có connector.

## 12.3 MCP cho chính Builder

Builder có actions `listTemplate`, `validateAgentSpec`, `compileDraft`, `runTest`, `requestApproval`, `publish`. Triển khai thành service methods/API nội bộ trước; khi nhiều AI client khác nhau cần gọi cùng builder, mới xuất bản MCP Server riêng, với auth, audit, idempotency, authorization và approval. Không nhầm tool protocol với khả năng tự thiết kế.

# 13. CODEGRAPH: RETRIEVAL LAYER CHO CODING AGENT

## 13.1 Chọn một repo CodeGraph cụ thể, tránh nhầm tên

Đối với tài liệu này dùng [codegraph-ai/CodeGraph](https://github.com/codegraph-ai/CodeGraph) làm mặc định: engine mã nguồn mở, IDE extension và MCP tools để truy vấn semantic graph của codebase. Tên "CodeGraph" cũng được nhiều dự án khác dùng; vì bạn chưa cung cấp link CodeGraph đang sử dụng, cấu hình dưới đây là **giả định có nêu rõ**, không được tự nhận là đã kết nối với bản trên máy bạn.

Theo README công khai, CodeGraph có profile `core` (8 MCP tools), `graph` (17) và `memory` (14), ngoài `all`. Profile ít tool hơn giúp giảm overhead của tool definitions trên một số client. Trước khi dùng thật, xác nhận CLI `codegraph-server --mcp --profile=core` trên binary đã cài; đừng dùng `--profile all` mặc định cho tác vụ đọc code thông thường.

## 13.2 Chuỗi retrieval tối thiểu

| Giai đoạn    | Hành động                                                                   | Context được chuyển cho model                 |
| ------------ | --------------------------------------------------------------------------- | --------------------------------------------- |
| Discovery    | Symbol search cho 1 trách nhiệm, ví dụ create chatflow                      | Tên symbols + đường dẫn, không phải toàn file |
| Relationship | Tìm 1–2 lớp caller/callee hoặc dependencies                                 | Danh sách top-N quan trọng                    |
| Context      | `codegraph_get_ai_context` tại `uri + line` cụ thể, intent `modify` khi sửa | Snippet + nơi phụ thuộc quan trọng            |
| Verify       | Đọc source thật tại target file / phiên bản Git                             | Chỉ phần cần sửa và test liên quan            |
| Impact       | Đổi sang `graph` khi thay interface giữa modules                            | Call graph/impact bounded                     |
| Memory       | Checkpoint ngắn + pointer vào symbol/ADR                                    | Không paste full chat history                 |

**Quy tắc quan trọng:** CodeGraph dùng để định vị và lập bản đồ; lúc **sửa code** vẫn cần đọc bản source hiện tại, kiểm tra diff và chạy test. Index có thể cũ; output có thể thiếu config, decorator hoặc đường đi runtime khó phân tích tĩnh.

## 13.3 Cấu hình CodeGraph cho Windows, Codex và Antigravity

1. Cài CodeGraph từ đúng nguồn và xác nhận binary `codegraph-server.exe`. README upstream nói extension có thể cài engine trong `%USERPROFILE%\.codegraph\bin` sau khi người dùng chấp nhận download. Không đoán path khi chưa xem máy.
2. Đảm bảo file `.env`, key, tài liệu mật, dữ liệu công ty không bị index. Với Flowise monorepo, bỏ qua `node_modules`, build outputs, `.git`, data artifacts.
3. **Codex:** đăng ký bằng lệnh `codex mcp add codegraph -- "C:\ABSOLUTE\PATH\codegraph-server.exe" --mcp --profile=core`, rồi chạy `codex mcp list`. Cấu hình TOML mẫu nằm ở `harness-overlay/config/codex-mcp.toml.example`.
4. **Antigravity:** mở MCP Servers → Manage MCP Servers → View raw config; file workspace theo docs nằm ở `.agents/mcp_config.json`. Chép nội dung template `config/antigravity-mcp.json.example` sau khi đổi path. Khởi động lại tool để kiểm tra kết nối.
5. Dùng câu hỏi kiểm thử: “Tìm code path từ endpoint tạo flow tới persistence; trả 5 symbols quan trọng, file:line, test tương ứng, không đọc toàn repo”. So sánh với source thật.

Các file `*.example` trong ZIP **không tự đăng ký MCP**. Khác client có thể dùng đường dẫn config và schema khác nhau; phải thao tác trên ứng dụng thực tế.

## 13.4 Ba chế độ CodeGraph để tránh phí token

**Explore (mặc định):** MCP `core`, một truy vấn xác định symbol và 1 truy vấn AI context. Không gọi nhiều tool khi câu trả lời đã đủ.  
**Impact (khi thay interface):** profile `graph` để tìm caller/callee, dependency, blast radius; ưu tiên số node/edges có giới hạn.  
**Deep-dive (khi lỗi phức tạp):** đọc nguồn nguyên file, tests và trace liên quan; lý do tăng context phải ghi trong task note. Không giả vờ mọi bài toán đều có thể giải chỉ bằng snippets.

## 13.5 Ví dụ cụ thể trên Flowise

**Yêu cầu:** “Cho phép AI tạo draft Agentflow từ hội thoại”.

-   Bước 1: tìm trong CodeGraph những route/controller tương ứng tạo/cập nhật flow và xử lý generation; yêu cầu danh sách symbol <= 10.
-   Bước 2: xem `uri:line` của 2–3 symbol liên quan; trả một đoạn context ngắn cho mỗi symbol.
-   Bước 3: chỉ đọc source của endpoints cần chạm và DTO/tests; kiểm tra bản fork SHA.
-   Bước 4: ghi `docs/architecture/UPSTREAM_BASELINE.md` theo file+line và source thật; không dùng giả định API từ blog.
-   Bước 5: thiết kế `BuilderAdapter` dùng các endpoint/DTO xác nhận, không sửa runner cho tới khi có test bảo vệ.

**Kết quả mong muốn:** Coding Agent không phải đọc lại toàn bộ `packages/server` và `packages/ui` mỗi phiên. Đo được số files đọc, tool calls và token thực tế nếu client có cung cấp.

## 13.6 Rủi ro & phương án dự phòng

-   CodeGraph index stale → refresh/reindex; kiểm tra Git diff và file timestamp; fallback `rg`/`git grep`.
-   Tool definitions nhiều → `core` profile; chỉ bật `graph` khi cần.
-   Embedding/index tốn RAM/CPU hoặc lộ thông tin → bật local mode theo docs, xác minh cơ chế lưu, loại trừ dữ liệu nhạy cảm.
-   MCP không khả dụng trong một client → không ngừng task; dùng file search có giới hạn và ghi rõ giới hạn phân tích.
-   Tool calls nhiều hơn đọc một file ngắn → dừng retrieval và đọc trực tiếp; không tối ưu máy móc.

# 14. TOKEN-EFFICIENT CODING HARNESS: THIẾT KẾ VẬN HÀNH

## 14.1 Định nghĩa vận hành và ranh giới

Harness **không phải chỉ là rules**, cũng không phải “một AI trung gian” bắt buộc. Với mục tiêu của bạn, nó là tập cơ chế để Codex/Antigravity **nhận đủ context nhưng không nhận thừa**: policy ngắn luôn-on, CodeGraph MCP routing, task memory, context pack, log filtering, quality gates, và phép đo token/success. Một vài cơ chế được triển khai bằng script cục bộ; phần dùng tool/điều phối do coding assistant thực hiện theo hướng dẫn. Không tuyên bố có một bộ điều khiển bên ngoài can thiệp trực tiếp vào token quota của client.

## 14.2 Sơ đồ thành phần và data flow

```text
                           Developer
                               │
                      TASK-001 acceptance
                               │
                    ┌──────────▼──────────┐
                    │  Codex/Antigravity  │
                    │  short AGENTS.md    │
                    └──────────┬──────────┘
                               │
               ┌───────────────┼─────────────────┐
               ▼               ▼                 ▼
          PROJECT_MAP      CodeGraph MCP      CHECKPOINT
          (cold start)       profile=core      (last state)
               │               │                 │
               └───────────────┼─────────────────┘
                               ▼
                  Selected task-specific context
                               │
                       Edit exact source
                               │
                  Targeted test + log-slice
                               │
                    Review diff + security
                               │
                Checkpoint + usage.jsonl metrics
```

Không dùng root `AGENTS.md` để chép 50 trang PRD. Không nạp lại toàn lịch sử chat mỗi khi đổi từ Codex sang Antigravity. Bản checkpoint phải đủ để một agent khác làm tiếp nhưng không phải một bản transcript.

## 14.3 Cấu trúc Harness overlay v2

```text
Flowise/                     <- mã nguồn fork, do bạn clone
  AGENTS.md                  <- shared short instructions (Codex và Antigravity)
  CLAUDE.md                  <- adapter mỏng cho Claude Code, không chép rules dài
  docs/
    architecture/PRODUCT_ARCH.md
    harness/
      CODEGRAPH_SETUP.md     <- cài/index/profiles/MCP
      WORKFLOW.md            <- discover/plan/edit/test/review/handoff
      TOKEN_BUDGET.md        <- budget và bất lợi của context quá dài
      BENCHMARK.md           <- A/B measurement plan
      SECURITY.md            <- release/auth/index secrecy gates
      tasks/TASK-001.md      <- task khởi động có acceptance
      state/PROJECT_MAP.md   <- kiến trúc rút gọn để cold start
      state/SESSION_TEMPLATE.md
  config/
    harness.json             <- cap ký tự / allowlist file ngữ cảnh
    codex-mcp.toml.example
    antigravity-mcp.json.example
  scripts/harness/
    doctor.mjs               <- sanity checks
    context-pack.mjs         <- bounded + best-effort redacted prompt packet
    checkpoint.mjs           <- state qua session
    log-slice.mjs            <- chỉ đưa dòng lỗi liên quan
    usage.mjs                <- ghi usage số thật nhập thủ công
    lib.mjs                  <- helpers
  tests/harness/harness.test.mjs
  .gitignore.harness.example
  .harness/                   <- cache/state/metrics local, KHÔNG commit
```

**Đặc điểm cố ý:** chỉ có **một file hướng dẫn chính `AGENTS.md` ngắn**. Theo tài liệu chính thức, Codex đọc `AGENTS.md` theo đường dẫn workspace; Antigravity hiện cũng có hỗ trợ `AGENTS.md`/`GEMINI.md`. Nếu lưu đồng thời các bản rules dài ở cả ba file, client có thể nạp trùng và tốn token. Vì vậy `CLAUDE.md` chỉ là pointer ngắn và không tạo `GEMINI.md` dài.

## 14.4 Cold-start và memory xuyên phiên

Trong phiên mới, Agent chỉ cần: (1) `AGENTS.md`, (2) `PROJECT_MAP.md`, (3) task hiện tại, (4) checkpoint mới nhất **nếu có**. Khi đã hiểu entrypoint, mới gọi CodeGraph theo truy vấn cụ thể. Checkpoint ghi: task/status, quyết định, files touched, tests, blocker, next action và đường dẫn tham khảo; tránh paste code lớn, token, tài liệu nguyên văn.

**State strategy:** `.harness/state/current.json` là trạng thái **cục bộ chưa version control**. Nếu muốn bàn giao trên nhiều máy, tạo bản handoff **đã biên tập, không có secrets** trong PR hoặc công cụ quản lý task. Đừng commit tự động mọi bản state; log chat/secret có nguy cơ đi theo.

## 14.5 Context pack: mã nguồn càng nhiều càng phải chọn lọc

`context-pack.mjs` tạo file `.harness/cache/context-pack.md` từ danh sách tài liệu **được phép**. Mặc định cắt 10.000 ký tự toàn pack và 4.500 ký tự/nguồn; đây là hard cap về ký tự trong script, không phải hard cap token của model. Dùng `--graph` để thêm bản tóm tắt CodeGraph đã tự xem xét và lưu ở `docs/harness/state/codegraph-results.md`; script **không tự gọi MCP**. Chặn traversal ra ngoài repo, áp dụng allowlist path và redaction theo mẫu đơn giản, nhưng không thay thế DLP/secret scanner.

Ví dụ:

```powershell
node scripts/harness/context-pack.mjs --task docs/harness/tasks/TASK-001.md
# Tùy chọn, nếu đã xuất tóm tắt CodeGraph không có secrets:
node scripts/harness/context-pack.mjs --task docs/harness/tasks/TASK-001.md --graph docs/harness/state/codegraph-results.md
```

**Đưa pack vào chat một cách có chủ ý**, không mặc định auto-attach ở tất cả sessions. Nếu prompt hiện đã đủ context, không cần đưa thêm pack.

## 14.6 Targeted tests + log slicing

Khi test thất bại, giữ log đầy đủ trên đĩa nhưng chỉ chuyển lỗi liên quan về Agent. Một file log dài hàng nghìn dòng không phải context tốt. Dùng:

```powershell
# Ví dụ sau khi chạy test và lưu output tại local (lệnh test tùy package)
node scripts/harness/log-slice.mjs --file logs/test-output.txt --lines 80
```

Script chọn dòng có `error/fail/exception/fatal/assert/warn` và vài dòng lân cận, kiểm tra kích thước file, lọc chuỗi giống secret ở mức best-effort. Nếu lỗi không nằm trong log, đọc thêm file/stack có chủ đích; không suy đoán toàn hệ thống chỉ từ 80 dòng.

## 14.7 Vòng lặp sửa lỗi có ngân sách

Với một lỗi thông thường: thực hiện tối đa 2–3 lần sửa có lập luận (con số là chính sách đề xuất, không phải tính năng cưỡng chế của tool); mỗi lần phải có giả thuyết, thay đổi rõ, targeted test, và so sánh kết quả. Khi 2 lần không tiến triển, dừng, viết checkpoint `blocked` và yêu cầu phân tích nguyên nhân thay vì đốt token retry. Không gọi agent con cho task tầm thường. Khi một task chạm nhiều package và test integration, cho phép mode `deep` có giải thích.

## 14.8 Budget context theo ba chế độ

| Mode   | Khi dùng                                       | Quy tắc                                       | Cách kiểm soát                                      |
| ------ | ---------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Fast   | Sửa một hàm/test hoặc tìm vị trí code          | CodeGraph `core`, 1–2 symbols, tests gần nhất | Pack mặc định 10k chars, tối đa 80 dòng lỗi         |
| Normal | Một tính năng nhỏ cross-file                   | `core`, impact khi cần, 2–5 files             | Plan ngắn, đọc đúng test/contract                   |
| Deep   | Refactor cross-package, bug phức tạp, security | `graph` + source/test/log sâu                 | Ghi lý do tăng context và chi phí, review bởi người |

Bảng này là **quy ước vận hành**, không phải config có thể bắt Codex/Antigravity tự giới hạn token API. Giới hạn byte/char có thật nằm trong script context pack; ngưỡng ước tính token không chính xác tuyệt đối vì tokenizer khác nhau.

## 14.9 Đo hiệu quả: không đánh tráo ước tính thành token thực

`usage.mjs` chỉ ghi các số **do bạn nhập** từ UI/usage log của client nếu có. Nó không truy cập billing của Codex/Antigravity. Không có token thật thì `input_tokens=null`, `output_tokens=null`. `approxTokens=ceil(chars/4)` chỉ giúp phát hiện pack quá dài, không phải số billable tokens. Chỉ gọi một Harness là tiết kiệm token sau khi A/B trên một số task đại diện, cùng model, cùng revision và cùng chuẩn nghiệm thu.

```powershell
node scripts/harness/usage.mjs --agent codex --task TASK-001 --variant harness --input 18000 --output 2200 --tools 12 --files 5 --pass yes
```

Các giá trị trong ví dụ là **giả lập**, không phải kết quả của dự án. Chỉ số chính: `total_tokens / accepted_task`, kết hợp thời gian xử lý, tỷ lệ test pass, số lỗi hồi quy. Nếu Harness giảm token nhưng làm tỷ lệ hoàn thành rớt mạnh, đó không phải cải tiến.

## 14.10 Bản kiểm thử đã thực hiện & giới hạn

Bộ tiện ích v2 có bài test về allowlist đường dẫn, traversal, redaction đơn giản, cắt context, checkpoint. Việc chạy test trên **harness-overlay độc lập** chỉ chứng minh scripts hoạt động trong môi trường hiện tại. Chưa có kiểm thử trên fork Flowise thật; chưa kiểm chứng MCP CodeGraph đang cài trên máy bạn; chưa có kiểm thử giảm token trên Codex và Antigravity; không có auto-orchestrator cưỡng chế hành vi của các client.

## 14.11 Quy trình một task tiêu chuẩn

1. Task được ghi theo acceptance criteria và allowed scope. `git status --short` để bảo vệ thay đổi đang có.
2. Đọc 2 file ngắn (`AGENTS.md`, `PROJECT_MAP.md`), task và checkpoint nếu cần.
3. CodeGraph `core` trả symbol+context có giới hạn; xác nhận source thật.
4. Agent lên kế hoạch 3–7 bước, yêu cầu human approval nếu thay auth/deps/migration/prod.
5. Implement nhỏ, targeted test, lọc log; sửa theo tối đa vòng lặp đã định.
6. Review diff + security và test; viết checkpoint, ghi usage (nếu có).
7. Bắt đầu session mới từ checkpoint thay vì copy nguyên chat cũ.

# 15. AUTHORIZATION, SECURITY & OPERATIONS

## 15.1 Mặc định an toàn

-   Agent mới = `draft`, `private`, `undeployed`, tools chỉ đọc.
-   Không dùng raw secret trong AgentSpec, plan, API logs hoặc client; dùng `credentialRef`.
-   User identity/tenant scope phải lấy từ verified server auth; không nhận tenantId “do LLM quyết định”.
-   Với HTTP tools, cấm unrestricted URL, localhost/private IP/metadata endpoints khi chưa chính sách phù hợp (SSRF), enforce egress.
-   Cấm arbitrary code node trong MVP, sandbox chưa đánh giá = disabled.
-   File/PDF từ người dùng là untrusted; instruction trong tài liệu không được nâng thành quyền hệ thống.
-   Rate-limit, max input size, max tool calls, timeout, cancellation, budget per tenant.
-   Approval tách khỏi chat text: chỉ qua action đã xác thực của người có quyền, audit đầy đủ.

## 15.2 Ma trận quyền tối thiểu (đề xuất)

| Action                        | User            | Owner           | Developer       | Admin               |
| ----------------------------- | --------------- | --------------- | --------------- | ------------------- |
| Create private draft          | Có              | Có              | Có              | Có                  |
| Edit own draft                | Có              | Có              | Theo phân quyền | Có                  |
| Run sandbox readonly          | Có hạn mức      | Có              | Có              | Có                  |
| View raw logs/flow            | Giới hạn        | Giới hạn        | Có              | Có                  |
| Configure credential          | Không           | Với quyền riêng | Không mặc định  | Có                  |
| Publish                       | Không trực tiếp | Request         | Không mặc định  | Approve theo policy |
| Modify production tool policy | Không           | Không           | Không           | Có                  |

## 15.3 Rủi ro EOL cụ thể

Repo Flowise có công bố các advisory về broken access control, NodeVM sandbox escape, remote code execution và tenant authorization. Trước khi triển khai rộng: lập danh sách GHSA, kiểm tra upstream code tại pinned SHA, cập nhật packages và patch theo tác động thật. Không giả định deploy sau reverse proxy là đủ an toàn.

## 15.4 Observability

Structured tracing cho `sessionId`, `requestId`, `specRevision`, `compilerVersion`, `flowId`, `evalRunId`, `runtimeSha`, `user/tenant from auth`. Metrics gồm build_success_rate, first_test_pass, validator_failure_by_code, latency per stage, token cost, repair_count, approval_wait, auth_denied. Logs mặc định redacted. Có dashboard alerts cho lỗi tăng, chi phí bất thường và tool policy violation.

# 16. GIAI ĐOẠN XÂY DỰNG – BACKLOG CỤ THỂ

## Phase 0 – Baseline, audit, CodeGraph (đi trước mọi code feature)

**Đầu ra:** fork pin SHA, chạy local, bản đồ route/generator/runtime, thư mục Harness, security backlog.  
**Tasks:** B0.1 Fork/clone/pin; B0.2 kiểm tra Node/pnpm; B0.3 import Harness; B0.4 CodeGraph index/impact map; B0.5 audit GHSA; B0.6 export 3 flow fixtures từ UI.  
**DoD:** app chạy local; fast Harness pass; có `BASELINE.md`; không public Internet; test builder chưa yêu cầu.

## Phase 1 – Chat & Requirement Collector

**Đầu ra:** user chat, session persisted, hỏi thiếu fields, AgentSpec v1 hợp lệ; chưa tạo Flowise flow.  
**Tasks:** B1.1 Chat page; B1.2 server session/message routes; B1.3 state machine; B1.4 structured LLM output; B1.5 SpecValidator; B1.6 golden tests cho 3 kind; B1.7 SSE progress.  
**DoD:** 3 kịch bản có thể đi từ initial prompt đến `SPEC_READY`, không paste secret, sessions tách người dùng.

## Phase 2 – Chat → Draft Flowise

**Đầu ra:** chọn template, sinh flow, static + runtime validation, tạo draft; Developer xem được canvas.  
**Tasks:** B2.1 registry + manifest node metadata; B2.2 AgentPlan schema; B2.3 compiler adapters cho 3 template; B2.4 Flowise CRUD adapter; B2.5 contract tests pinned SHA; B2.6 draft persistence/idempotency; B2.7 basic error UI.  
**DoD:** tạo được 1 flow mỗi kind trên disposable instance; chưa tự publish; flow passes 3 validation layers; có audit logs.

## Phase 3 – Sandbox Test & Chat Edit

**Đầu ra:** chạy test cases, mô tả pass/fail, sửa bằng chat, diff/versions/rollback.  
**Tasks:** B3.1 dry-run runner; B3.2 fixtures/mock tools; B3.3 evaluation scoring; B3.4 bounded repair; B3.5 revision diff; B3.6 reversible change; B3.7 UI test panel.  
**DoD:** 3 edit cases tạo version mới, rollback được, budget/cancellation hoạt động, lỗi credential dừng để yêu cầu người dùng.

## Phase 4 – Approval / Publish / Integrations

**Đầu ra:** approval role-based, publish an toàn, runtime monitoring, bước đầu tích hợp Word/SharePoint/Microsoft Fabric khi được cấp quyền.  
**Tasks:** B4.1 approval API + audit; B4.2 publish workflow; B4.3 role/tenant isolation tests; B4.4 secure credentials; B4.5 deploy/rollback; B4.6 Word Add-in consumer API; B4.7 SLO dashboard.  
**DoD:** không thể publish khi chưa có approved decision; revocation/rollback; security gate đạt và đã giải quyết upstream EOL risks trong scope triển khai.

## Phase 5 – Hardening / Enterprise

Đa tenant, cost accounting, policy-as-code, advanced MCP registry, multi-agent templates, performance/load tests, backup/DR và documentation vận hành. Chỉ đi tiếp khi Phase 4 đủ ổn định và có dữ liệu benchmark.

# 17. KẾ HOẠCH TRIỂN KHAI 10 SPRINT MẪU

| Sprint | Chủ đề                                 | Deliverable                         |
| ------ | -------------------------------------- | ----------------------------------- |
| 1      | Setup + CodeGraph + security inventory | BASELINE, module map, harness green |
| 2      | Chat UI + session API                  | Chat và persistence                 |
| 3      | Requirement Collector + Spec           | Multi-turn → AgentSpec              |
| 4      | Template registry + AgentPlan          | 3 plans allowlisted                 |
| 5      | Compiler + validation                  | 3 valid flow fixtures               |
| 6      | Flowise adapter + create draft         | Draft thật trên local               |
| 7      | Sandbox tests + eval                   | Results/logs/cost limits            |
| 8      | Chat edits + version diff              | Revision & rollback                 |
| 9      | Authorization + approval               | Publish approval gate               |
| 10     | Hardening + demo                       | Release candidate nội bộ            |

Sprint là đơn vị công việc, **không phải cam kết thời lượng**; có thể chia lại theo số người và mức độ patch security của fork.

# 18. ACCEPTANCE CRITERIA CỦA MVP

-   User mới không cần đụng canvas vẫn tạo được Agent draft thuộc 3 kiểu hỗ trợ.
-   Builder không bỏ qua các trường blocking và không hỏi lại thông tin đã được cung cấp đúng.
-   Mọi output AgentSpec được parse/schema validate; không cho credential raw.
-   AgentPlan/flowData dùng node allowlist, không custom code, không external write.
-   `flowData` tạo ra load được trên phiên bản fork pinned; validation passes trên disposable runtime.
-   Agent có thể dry-run trong sandbox/mocks; logs hiển thị pass/fail, runtime/cost.
-   Chat edit tạo revision mới, diff rõ, rollback không xóa version đã publish.
-   Cấu hình mặc định draft/private/undeployed; không publish chỉ nhờ câu “cứ triển khai”.
-   API có auth/tenant checks; không thể truy cập session/flow cross tenant.
-   CI basic chạy; có security review, GHSA inventory trước khi mở mạng.
-   Có tài liệu runbook cho setup và QA, owner có thể bàn giao việc cho AI coding qua task templates.

# 19. GIAO VIỆC CHO CODEX / CLAUDE / ANTIGRAVITY

## 19.1 Prompt để bắt đầu Task 001

```text
Hãy đọc AGENTS.md, docs/harness/FIRST_TASK.md, docs/harness/WORKFLOW.md và docs/harness/SECURITY_GATES.md.
Task hiện tại chỉ là baseline discovery, KHÔNG viết tính năng Builder.
Dùng CodeGraph (nếu có) xác định đường đi của:
- packages/agentflow AI Flow Generator,
- route POST /agentflowv2-generator/generate,
- Chatflows create/update và field flowData,
- runner Agentflow V2 và các test liên quan.
Đọc code để xác minh, không tự đoán API, không sửa auth và không cài dependency mới.
Xuất docs/BASELINE.md gồm pinned commit, Node/pnpm, bản đồ symbol/path, 3 exported flow fixtures cần tạo, GHSA/security backlog và phần chưa xác minh.
Chạy harness fast checks và báo cáo các lệnh thực sự đã chạy.
```

## 19.2 Prompt triển khai vertical slice đầu tiên (sau Task 001)

```text
Tạo feature 'Chat session + Requirement Collector for Knowledge Agent' theo blueprint.
Chỉ implement server-side session/message state + AgentSpec schema + unit tests; chưa ghi bất kỳ flowData nào vào Flowise.
Dùng CodeGraph map các Express routes/auth conventions và entity patterns.
Bảo đảm session user/tenant lấy từ auth context, không nhận trong body.
Hãy chia PR nhỏ, lập plan, test, báo cáo diff và các rủi ro. Không deploy.
```

## 19.3 Kỷ luật multi-model

Một file `AGENTS.md` ngắn được dùng chung cho Codex/Antigravity; `CLAUDE.md` chỉ là adapter mỏng, playbook được mở theo nhu cầu. Không sao chép rules dài vào mọi client. Khi đổi AI assistant, không copy toàn bộ lịch sử chat; chỉ cung cấp task hiện tại, acceptance criteria, relevant files/revision và kết quả tests. Có thể thay người viết/kiểm tra code giữa các model nhưng mọi kết luận phải dựa trên source và test, không dựa trên “AI trước nói đã chạy”.

# 20. CÂU HỎI MỞ & NHỮNG QUYẾT ĐỊNH CẦN KIỂM THỬ

1. Fork pin SHA nào? `main` đã archive nhưng vẫn cần commit cụ thể trong `BASELINE.md` để tránh drift.
2. Generator hiện có sinh được loại Agentflow V2 nào đúng trong môi trường của bạn, và có cần API riêng để orchestration multi-turn?
3. Tận dụng UI sẵn có hay đưa `assistant-ui` vào một route mới? Benchmark bundle size và design integration.
4. Storage Builder sẽ dùng cùng database hay schema/service riêng? Cần review multi-tenancy và migration.
5. Authorization của Flowise Open Source trong fork có đầy đủ nhu cầu user/org/tenant hay cần BFF?
6. Tool policy cho SharePoint/Fabric/SQL sẽ được enforce tại API gateway, connector, query layer nào?
7. Trước khi dùng production: ai chịu trách nhiệm patch EOL advisories, penetration tests và releases?
8. Có nhu cầu cho Claude/Codex gọi Builder thông qua MCP? Nếu có, thiết kế ở Phase 5, không blocker MVP.

# 21. HƯỚNG DẪN THỰC HIỆN TRÊN MÁY WINDOWS

## 21.1 Fork/clone trước, không đè code upstream

```powershell
git clone https://github.com/<YOUR_GITHUB_USERNAME>/Flowise.git
cd Flowise
code .
git rev-parse HEAD
Get-Content .nvmrc
Get-Content package.json
```

Thay placeholder tài khoản GitHub, ghi SHA vào baseline. Đọc `engines` và `packageManager` tại commit đang dùng; tránh cố định Node/pnpm theo bài hướng dẫn cũ. Chạy `pnpm install --frozen-lockfile`, `pnpm build` và scripts phù hợp _sau khi đã kiểm tra môi trường_.

## 21.2 Chép Harness v2 một cách an toàn

1. Giải nén ZIP bộ starter v2 ở nơi riêng. So sánh diff trước khi chép; backup `AGENTS.md`, `CLAUDE.md` nếu fork đã có file.
2. Chép **nội dung** `harness-overlay/` vào root fork, không chép cả folder lồng vào.
3. Merge các dòng `.gitignore.harness.example` vào `.gitignore` hiện có. Không để `.harness/metrics`, checkpoint cá nhân, context pack thành git commit.
4. Chạy `node scripts/harness/doctor.mjs` và `node --test tests/harness/*.test.mjs`. Test này chỉ chứng minh harness scripts, không thay thế build/test Flowise.
5. Cài CodeGraph cho từng client theo `docs/harness/CODEGRAPH_SETUP.md`, xác nhận connection bằng câu hỏi symbol; đừng cho rằng `.example` tự hoạt động.
6. Mở `docs/harness/tasks/TASK-001.md`; giao cho Codex hoặc Antigravity thực hiện baseline, không nhảy ngay vào code Builder trước khi hiểu upstream.

## 21.3 Hướng dẫn phiên coding đầu tiên (copy/paste)

> “Bạn đang làm TASK-001 trên bản fork Flowise. Đọc `AGENTS.md`, `docs/harness/state/PROJECT_MAP.md`, `docs/harness/tasks/TASK-001.md`. Trước khi đọc hàng loạt files, dùng CodeGraph core để tìm đúng create/update flow và generator; xác minh file+line trên source thật. Chỉ đọc phần tối thiểu, không chỉnh code chức năng trước khi lập baseline. Cuối phiên ghi trạng thái và bước tiếp theo bằng checkpoint, báo cáo test thực sự đã chạy.”

## 21.4 Hướng dẫn phiên coding thứ hai

Sau khi TASK-001 xong, chỉ mở task mới + `current.json` và baseline. Không copy toàn bộ 50 trang tài liệu này vào prompt. Agent cần một chương kiến trúc nào thì mới đọc chương đó.

---

# 22. MA TRẬN CÔNG VIỆC CODING HARNESS vs BUILDER PRODUCT

| Work item                              | Hệ thống              | Scope thay đổi               | Test / minh chứng                     |
| -------------------------------------- | --------------------- | ---------------------------- | ------------------------------------- |
| TASK-001 pin SHA, source map           | Coding Harness        | docs/architecture, CodeGraph | file:line, baseline command status    |
| TASK-002 root rules + context pack     | Coding Harness        | AGENTS.md, script            | allowlist, bounded output             |
| TASK-003 CodeGraph MCP profiles        | Coding Harness        | client config riêng          | client tool list, symbol lookup       |
| TASK-004 checkpoint + log slice        | Coding Harness        | scripts, tests               | state, errors, redaction negative     |
| TASK-005 token benchmark               | Coding Harness        | usage metrics                | A/B accepted tasks, no invented token |
| TASK-006 Builder chat shell            | Chat-to-Agent product | packages/ui route            | UI test, streaming mocks              |
| TASK-007 AgentSpec schema + collector  | Chat-to-Agent product | new backend modules          | schema/negative tests                 |
| TASK-008 compiler adapter draft        | Chat-to-Agent product | server services/adapter      | contract tests with fixtures          |
| TASK-009 sandbox test + revisions      | Chat-to-Agent product | test runner, persistence     | valid/invalid flow eval               |
| TASK-010 approval + controlled publish | Chat-to-Agent product | auth/RBAC/gateway            | tenant/auth/rollback tests            |

**Không tạo MCP Server mới cho Builder ở TASK-001…005.** MCP CodeGraph là dependency development-time. Khi Builder cần được gọi từ nhiều clients, có thể bọc API của Builder thành MCP sau khi endpoint và authorization đã ổn định.

# 23. TIÊU CHÍ NGHIỆM THU CHO “HARNES GIẢM TOKEN”

-   **H-01:** Codex nhận đúng `AGENTS.md`; Antigravity nhận đúng root rules sau restart, không nhập trùng một bản rules dài ở nhiều vị trí. Phải xác minh trong từng client.
-   **H-02:** CodeGraph MCP `core` hiển thị các tools cần thiết và trả symbol liên quan ở repo fork; verify `file:line` trên source thật.
-   **H-03:** Với 5 tác vụ đại diện, có bảng A/B ghi rõ token thật (nếu client hỗ trợ), file reads, tool calls, acceptance và thời gian; không bỏ qua task thất bại.
-   **H-04:** Context pack bị giới hạn kích thước và không cho đường dẫn vượt ra ngoài dự án hoặc file không trong allowlist. Redaction có kiểm thử, nhưng không được quảng bá như secret scanner hoàn chỉnh.
-   **H-05:** Session 2 có thể tiếp tục từ checkpoint <=250 từ mà không cần paste toàn bộ chat hoặc đọc lại cả repo.
-   **H-06:** Log failure dài được lọc thành đoạn lỗi liên quan và vẫn giữ output gốc cục bộ.
-   **H-07:** Không làm giảm acceptance rate / tăng lỗi hồi quy trong thử nghiệm; khi không có đủ dữ liệu, trạng thái là “chưa xác minh tiết kiệm token”.

# 24. RỦI RO KHI TỐI ƯU TOKEN QUÁ MỨC

| Rủi ro                   | Dấu hiệu                                    | Cách xử lý                                           |
| ------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| Context quá hẹp          | Agent đoán API hoặc sửa nhầm callsite       | Mở đúng source/DTO/tests; chuyển mode normal/deep    |
| Memory stale             | Session mới làm theo quyết định đã thay đổi | checkpoint ghi SHA/branch, refresh sau diff          |
| CodeGraph outdated       | Symbol/line không còn đúng                  | Reindex và confirm source thật                       |
| Rules trùng              | Input token tăng ngay khi không làm gì      | bỏ file cấu hình duplicate, giữ root rules ngắn      |
| MCP gọi nhiều            | Tool call dồn dập nhưng không tiến triển    | giới hạn 1–2 retrieval vòng đầu, fallback trực tiếp  |
| Lọc log mất nguyên nhân  | Chỉ thấy assertion, không thấy stack        | mở thêm 20–50 dòng cụ thể, không dump toàn log       |
| Dùng model nhỏ vô tội vạ | Rework nhiều hơn số token tiết kiệm         | chọn model theo độ khó, đánh giá token/accepted task |

# 25. RACI, CÁCH QUẢN LÝ MỘT BẢN FORK EOL

-   **Owner (bạn):** chọn scope, chấp nhận rủi ro, kiểm duyệt dependency/auth/production, duyệt release.
-   **Coding Agent:** khám phá code, viết patch/test, tự báo cáo những gì đã chạy; không tự cấp đặc quyền.
-   **Harness/scripts:** giới hạn một phần dữ liệu trong local context pack, checkpoint, log slice, usage record; không thay thế code review/secret scanning.
-   **CodeGraph:** trả thông tin cấu trúc repo cho coding agents; không có quyền quyết định production releases.
-   **Security reviewer hoặc owner được chỉ định:** rà vulnerability và tenant isolation trước khi public-facing.

Quyết định fork EOL có nghĩa đội dự án phải theo dõi GitHub advisories, patch phiên bản dependency và rà cả execution engine (code nodes, HTTP nodes, uploads, multi-tenant) trước khi dùng dữ liệu thật. Không mở API quản trị của Flowise public trong MVP.

# 26. NGUỒN THAM KHẢO CHÍNH (ĐỐI CHIẾU 14/11/2026)

-   Flowise repository & monorepo: https://github.com/FlowiseAI/Flowise
-   Flowise sunset & EOL: https://flowiseai.com/sunset
-   Security advisories: https://github.com/FlowiseAI/Flowise/security
-   Agentflow package development status: https://github.com/FlowiseAI/Flowise/tree/main/packages/agentflow
-   Flowise API references: https://docs.flowiseai.com/api-reference/chatflows
-   CodeGraph assumed implementation & profiles: https://github.com/codegraph-ai/CodeGraph
-   CodeGraph coding rules reference: https://github.com/codegraph-ai/codegraph-rules-for-agents
-   Codex project instructions `AGENTS.md`: https://learn.chatgpt.com/docs/agent-configuration/agents-md
-   Codex MCP configuration: https://learn.chatgpt.com/docs/extend/mcp
-   Google Antigravity rules: https://antigravity.google/docs/rules/
-   Google Antigravity MCP: https://antigravity.google/docs/ide/mcp

**Kết luận:** Harness v2 là **lớp tối ưu cách Codex/Antigravity làm việc với codebase**; Chat-to-Agent là **sản phẩm được xây bằng các coding agents đó**. Hai thứ phối hợp nhưng không cùng chức năng. Không có lý do để tạo một “AI Harness tự động” nặng nề chỉ để giảm token; làm từ retrieval tốt, rules ngắn, checkpoint ngắn, log filtering, và đo thật trước.
