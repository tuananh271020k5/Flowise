# PLAN TỔNG HỢP — HỆ THỐNG CHAT TẠO AGENT TRÊN FLOWISE

**Cập nhật: 14/11/2026. Đây là file đầu tiên cần mở để xem toàn bộ lộ trình.**

**Tổng cộng: 7 phase sản phẩm, 68 task con; thêm 8 task harness hỗ trợ lập trình. Tổng phạm vi kế hoạch: 76 task con.**

Đã hoàn thành việc khảo sát/lập kế hoạch `PLAN-000` và triển khai local harness ở phiên trước. **68 task sản phẩm chưa được nghiệm thu hoàn thành**; một phần khảo sát PH0 đã có bằng chứng để dùng lại. File này tổ chức phạm vi công việc; tiến độ bàn giao mới nhất vẫn nằm tại [state chung](AI-Agent/state/project.json).

## 1. Bảng tổng hợp phase và số task

| Phase   | Nội dung                                      | Task con | Kết quả kết thúc phase                                           | Bắt buộc đến mốc nào?               |
| ------- | --------------------------------------------- | -------: | ---------------------------------------------------------------- | ----------------------------------- |
| **PH0** | Nền tảng, môi trường, xác minh Flowise        |    **8** | Flowise chạy local; có flow mẫu thật và baseline rõ              | Demo đầu tiên                       |
| **PH1** | Chat Builder, lưu hội thoại, thu thập yêu cầu |   **10** | Chat đa lượt ra AgentSpec; đủ dữ kiện thì phát lệnh build        | Demo đầu tiên                       |
| **PH2** | Compiler và tự tạo Agentflow draft            |   **10** | Spec → plan → flow hợp lệ → draft thật trong Flowise             | Demo đầu tiên                       |
| **PH3** | Chat thử Agent, chỉnh sửa và demo hoàn chỉnh  |    **8** | Tạo → thử → sửa Agent qua chat, không thao tác kéo thả           | **Demo D1**                         |
| **PH4** | Knowledge Agent, nguồn dữ liệu và đánh giá    |   **10** | Agent trả lời có nguồn; test và repair có giới hạn               | **Knowledge MVP M1**                |
| **PH5** | Hoàn thiện để phát hành nội bộ                |   **10** | Quyền, độ ổn định, chi phí, rollback và vận hành được kiểm chứng | **Release nội bộ**                  |
| **PH6** | API, SQL, approval và tích hợp mở rộng        |   **12** | Mở rộng theo nhu cầu và quyền truy cập thực tế                   | Tùy chọn sau MVP                    |
|         | **Tổng sản phẩm**                             |   **68** |                                                                  |                                     |
| **H**   | Harness dùng chung cho Codex/Claude/Gemini    |    **8** | Context ngắn, bàn giao được, đo token có bằng chứng              | Thực hiện cùng quá trình phát triển |
|         | **Tổng toàn bộ**                              |   **76** | Không tính `PLAN-000` là task triển khai sản phẩm                |                                     |

**Các mốc cần nhớ:**

-   **Demo với sếp:** hoàn thành PH0–PH3 = **36 task sản phẩm**.
-   **Knowledge MVP:** thêm PH4 = **46 task sản phẩm** tính lũy kế.
-   **Release nội bộ:** thêm PH5 = **56 task sản phẩm** tính lũy kế.
-   **Toàn bộ phần mở rộng dự kiến:** thêm PH6 = **68 task sản phẩm**.
-   **Harness:** 8 task riêng; không bắt chờ benchmark tiết kiệm token mới được làm demo.

Một task con là một đầu ra có thể giao và nghiệm thu; không mặc định là một ngày, một PR hoặc một file. PH6 có nhiều nhánh tùy chọn, không bắt làm hết để nghiệm thu MVP.

## 2. Bài toán và kiến trúc đã chọn

Yêu cầu của sếp: người dùng mô tả Agent qua chat, bot hỏi thông tin còn thiếu, khi đủ dữ kiện thì tự build. Người dùng có thể chat thử và sửa Agent ngay trong giao diện đó.

```text
Chat thu thập nhu cầu
  → AgentSpec đã kiểm tra + xác định đủ thông tin
  → Chọn template / tạo AgentPlan
  → Compiler tạo flowData đúng bản Flowise đang dùng
  → Validate và lưu draft
  → Chạy thử có kiểm soát
  → Chỉnh sửa bằng chat / tạo revision mới
  → Phát hành theo quyền và quy trình, khi đến giai đoạn đó
```

Giữ `packages/server`, `packages/components` và Agentflow V2 runtime; thêm module Builder vào server và trang chat trong `packages/ui`. Canvas V2 tiếp tục dùng cho developer. Không viết execution engine hoặc frontend framework thứ hai trong MVP.

Hai loại chat tách rõ trên UI: **chat để xây Agent** và **chat với Agent đã tạo**. LLM đề xuất spec/plan có cấu trúc; compiler và backend quyết định graph hợp lệ, quyền, readiness và transition.

## 3. PH0 — Nền tảng và baseline: 8 task

**Đầu vào:** repo hiện tại và kết quả khảo sát đã có. **Không khảo sát lại từ đầu.**

| Mã      | Task con                                    | Đầu ra / tiêu chí nghiệm thu                                                      |
| ------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| PH0-T01 | Chốt Git baseline và kiểm kê patch đang có  | SHA/branch và owner các patch rõ; giữ nguyên thay đổi chưa liên quan              |
| PH0-T02 | Chuẩn hóa Node theo repo                    | Môi trường Node 24 phù hợp `.nvmrc`/engines hoạt động                             |
| PH0-T03 | Chuẩn hóa pnpm và dependencies              | pnpm 10 phù hợp engines; install frozen lockfile có kết quả thật                  |
| PH0-T04 | Build/start Flowise local                   | Có log build/start, URL/auth/DB thực tế; không lộ secret                          |
| PH0-T05 | Xác minh đường chạy và quyền runtime        | Đối chiếu create/update/prediction với source map; ghi hành vi draft/private thật |
| PH0-T06 | Xuất và chạy một Agentflow V2 mẫu           | Fixture sanitized mở lại canvas được; controlled prediction có kết quả            |
| PH0-T07 | Chốt phạm vi demo và model profile          | Một assistant mẫu, provider profile và ba kịch bản demo được xác định             |
| PH0-T08 | Ghi phạm vi license, advisory và owner fork | Inventory phần dùng lại/rủi ro áp dụng; có người chịu trách nhiệm xử lý           |

**Qua phase khi:** baseline runtime được chứng minh, fixture thật sẵn để bảo vệ compiler/adapter. Thiếu credential thì ghi phần execution chưa đạt, không báo toàn phase hoàn thành.

**Liên hệ backlog cũ:** `TASK-001` bao phủ PH0-T01–T06; `B-002` bao phủ PH0-T07–T08. Thông tin Node/pnpm và source đã khảo sát nằm trong [BASELINE](AI-Agent/context/BASELINE.md).

## 4. PH1 — Hội thoại và thu thập yêu cầu: 10 task

**Phụ thuộc:** PH0 xác định phạm vi và auth/model profile; có thể thiết kế schema từ baseline đã biết.

| Mã      | Task con                                      | Đầu ra / tiêu chí nghiệm thu                                                |
| ------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| PH1-T01 | Định nghĩa AgentSpec cho assistant cơ bản     | Schema có version, giới hạn dữ liệu, logical model/connection refs          |
| PH1-T02 | Viết readiness rules                          | Phân biệt specReady/buildReady/testReady và liệt kê trường còn thiếu        |
| PH1-T03 | Thiết kế lưu session/message/spec revision    | Entity/migration theo conventions DB thực tế; revision không bị ghi đè      |
| PH1-T04 | Tạo API session và message                    | Tạo, đọc, tiếp tục hội thoại qua auth hiện có                               |
| PH1-T05 | Ràng buộc actor/workspace cho dữ liệu Builder | Query được scope server-side; truy cập chéo người/workspace bị từ chối      |
| PH1-T06 | Chống gửi trùng và xung đột revision          | clientMessageId idempotent; revision conflict có phản hồi rõ                |
| PH1-T07 | Tạo trang Chat Builder                        | UI gửi/nhận, loading, lỗi và trạng thái khôi phục hội thoại                 |
| PH1-T08 | Hiển thị spec summary và câu hỏi còn thiếu    | Người dùng nhìn được Agent đang thiết kế; không cần biết node               |
| PH1-T09 | Collector tạo structured spec patch           | Cập nhật đúng dữ kiện, không hỏi trùng; validate trước lưu revision         |
| PH1-T10 | Nối SSE và tự dispatch build khi ready        | Đủ thông tin tự tạo một build intent đúng revision; test đầu tiên dùng mock |

**Qua phase khi:** một hội thoại đa lượt đi đến spec hợp lệ, refresh không mất tiến độ, dữ kiện đủ tự phát lệnh build. Build mock ở phase này chưa được gọi là Agent thật đã tạo.

**Liên hệ backlog cũ:** `B-003`, `B-004`, `B-005`, `B-006`.

## 5. PH2 — Từ spec đến Flowise draft thật: 10 task

**Phụ thuộc:** PH1 có spec/readiness và PH0 có fixture/runtime.

| Mã      | Task con                                      | Đầu ra / tiêu chí nghiệm thu                                                          |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| PH2-T01 | Tạo template assistant có version             | Một template tối thiểu từ flow mẫu đã chạy, không đoán cấu trúc                       |
| PH2-T02 | Lập registry node metadata được phép          | Node/version/input/handle pinned theo runtime; không chọn node ngoài allowlist        |
| PH2-T03 | Định nghĩa AgentPlan và validation            | Plan trỏ đúng spec/template; capabilities và references hợp lệ                        |
| PH2-T04 | Viết compiler deterministic                   | Plan → nodes/edges/config ổn định; không cần LLM sinh raw graph                       |
| PH2-T05 | Nối server validation cho flow                | Kiểm tra graph, node params và policy trước khi lưu                                   |
| PH2-T06 | Viết Flowise CRUD adapter                     | Serialize flowData một lần; type AGENTFLOW; tạo/đọc/cập nhật draft đúng scope         |
| PH2-T07 | Chuẩn hóa lỗi generator/compiler/adapter      | Error object không bị coi là success; diagnostics phù hợp và không lộ raw secret      |
| PH2-T08 | Bảo đảm build idempotency và mapping revision | Cùng build key không tạo flow trùng; lưu flowId/draftRevision/job liên quan           |
| PH2-T09 | Thực hiện build job lifecycle                 | Có trạng thái, timeout, giới hạn attempt và tín hiệu hủy                              |
| PH2-T10 | Contract test với Flowise disposable          | Draft mở được canvas; controlled execution đúng; negative auth và retry được kiểm tra |

**Qua phase khi:** spec tạo được draft **thật**, mở lại và chạy thử được trên runtime đã xác minh. Không chỉ dừng ở JSON hợp lệ hoặc mock pass.

**Liên hệ backlog cũ:** `B-007`, `B-008`; lỗi, budget và contract checks được tách thành task con rõ hơn.

## 6. PH3 — Chat thử, sửa Agent và demo D1: 8 task

**Phụ thuộc:** PH1 + PH2.

| Mã      | Task con                                | Đầu ra / tiêu chí nghiệm thu                                                    |
| ------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| PH3-T01 | Tạo panel chat với Agent draft          | Runtime conversation tách riêng builder conversation và giữ đúng draft revision |
| PH3-T02 | Hiển thị tiến trình và lỗi đầu-cuối     | UI phản ánh build/validate/test thực tế; lỗi credential không báo thành công    |
| PH3-T03 | Chạy bộ thử assistant có kiểm soát      | Kết quả input/output/assertion và thất bại được hiển thị, có giới hạn chạy      |
| PH3-T04 | Cho phép sửa cấu hình Agent bằng chat   | Lời sửa chuyển thành spec patch, sinh spec/draft revision mới                   |
| PH3-T05 | Hiển thị diff và khôi phục cấu hình     | Biết đã đổi gì; restore tạo revision mới, giữ lịch sử                           |
| PH3-T06 | Xử lý cancel và sửa khi build đang chạy | Job cũ bị hủy/superseded; kết quả cũ không ghi đè revision mới                  |
| PH3-T07 | Khôi phục sau refresh/reconnect         | SSE reconnect không build lại; session/job mới nhất hiển thị đúng               |
| PH3-T08 | Nghiệm thu demo với ba kịch bản         | Tạo → tự build → chat thử → sửa Agent qua chat, không kéo thả                   |

**Gate D1:** 36 task PH0–PH3 hoàn thành nghiệm thu. Đây là mốc chứng minh trực tiếp yêu cầu của sếp; chưa yêu cầu SharePoint/SQL/Word.

**Liên hệ backlog cũ:** `B-009`, `B-010`, gate `G-D1`.

## 7. PH4 — Knowledge Agent và MVP M1: 10 task

**Phụ thuộc:** D1 đã hoạt động.

| Mã      | Task con                                      | Đầu ra / tiêu chí nghiệm thu                                                |
| ------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| PH4-T01 | Chuẩn bị bộ tài liệu thử có quyền sử dụng     | Nguồn, nội dung, owner và phạm vi truy cập rõ                               |
| PH4-T02 | Tái sử dụng ingestion/document store phù hợp  | Nạp và truy xuất dữ liệu thử qua cơ chế đã kiểm tra                         |
| PH4-T03 | Tạo Knowledge template có retrieval           | Template có metadata/fixture/version và đường retrieve thực tế              |
| PH4-T04 | Bổ sung Knowledge spec và readiness           | Thiếu source/connection/citation expectations được hỏi đúng                 |
| PH4-T05 | Mở rộng planner/compiler cho Knowledge        | Spec → retrieval flow đúng node/connection refs                             |
| PH4-T06 | Hiển thị câu trả lời và nguồn trích dẫn       | Citation liên hệ được với nguồn có quyền; không tạo nguồn giả               |
| PH4-T07 | Tạo và chạy 10 golden Knowledge cases         | Có assertions về câu trả lời/nguồn và báo toàn bộ pass/fail                 |
| PH4-T08 | Kiểm tra thiếu bằng chứng và tài liệu độc hại | Agent từ chối suy diễn khi thiếu căn cứ; nội dung tài liệu không đổi policy |
| PH4-T09 | Thực hiện repair có phân loại và giới hạn     | Auth/policy lỗi thì dừng; lỗi phù hợp được sửa tối đa budget đã cấu hình    |
| PH4-T10 | Nghiệm thu Knowledge MVP                      | User tạo, thử, sửa Knowledge Agent qua chat và đạt bộ tiêu chí đã chốt      |

**Gate M1:** 46 task PH0–PH4 hoàn thành nghiệm thu. Đây là MVP có kiến thức từ tài liệu, không chỉ assistant instruction đơn giản.

**Liên hệ backlog cũ:** `B-011`, `B-012`.

## 8. PH5 — Phát hành nội bộ và vận hành: 10 task

**Phụ thuộc:** M1. Các phần quyền/limits cơ bản phải làm từ đầu; phase này hoàn thiện và xác minh cho phạm vi release.

| Mã      | Task con                                      | Đầu ra / tiêu chí nghiệm thu                                                          |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| PH5-T01 | Kiểm tra quyền toàn luồng Builder/runtime     | Session/draft/prediction đúng actor/workspace; draft access không dựa riêng vào cờ UI |
| PH5-T02 | Xử lý advisory áp dụng cho phạm vi triển khai | Inventory, patch/mitigation và test liên quan được review                             |
| PH5-T03 | Hoàn thiện credential, redaction và retention | Secret không xuất ra browser/spec/log; dữ liệu lưu có chính sách xóa rõ               |
| PH5-T04 | Thêm structured observability                 | Trace session/revision/build/flow và lỗi theo stage; không log dữ liệu nhạy cảm       |
| PH5-T05 | Thu usage và theo dõi chi phí thực            | Usage theo provider/request nếu có; thiếu thì unknown; phân biệt retry/test/build     |
| PH5-T06 | Enforce giới hạn sử dụng                      | Rate/input size/tool calls/token/time limits; timeout/cancel có hiệu lực              |
| PH5-T07 | Kiểm tra recovery khi crash/restart           | Reconcile job/flow đã tạo, không duplicate hoặc mất revision                          |
| PH5-T08 | Kiểm tra migration và backup/restore          | DB trong scope nâng cấp/khôi phục có bằng chứng thực thi                              |
| PH5-T09 | Chuẩn bị release/rollback/runbook             | Config, feature flag, cách rollback, xử lý lỗi và owner vận hành rõ                   |
| PH5-T10 | Review và nghiệm thu release nội bộ           | Quyền dùng source/license, auth/security trong scope, vận hành được owner xác nhận    |

**Gate release:** 56 task PH0–PH5 hoàn thành theo phạm vi được chọn. Không tự coi việc app chạy local là đủ điều kiện deploy.

**Liên hệ backlog cũ:** `B-013`, `B-014`.

## 9. PH6 — Mở rộng theo nhu cầu: 12 task

**Phụ thuộc:** baseline M1/release phù hợp với môi trường tích hợp. Chỉ làm nhánh được yêu cầu; mỗi connector thật có thể cần tách thêm task sau spike.

| Mã      | Task con                                                          | Đầu ra / tiêu chí nghiệm thu                                                                                    |
| ------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| PH6-T01 | API connector registry và operation allowlist                     | Backend quản lý endpoint/operation được phép; không nhận URL tùy ý từ LLM                                       |
| PH6-T02 | API Agent spec và collection                                      | Thu đúng schema/connection/input/output, quyền lấy từ server                                                    |
| PH6-T03 | API readonly template/compiler                                    | Flow chỉ gọi operation đã review là phù hợp readonly                                                            |
| PH6-T04 | API eval và lỗi connector                                         | Kiểm tra params, 401/403/429, timeout, authorization và policy                                                  |
| PH6-T05 | Thiết kế SQL executor và DB account readonly                      | Quyền DB thực và query gateway kiểm soát hành vi                                                                |
| PH6-T06 | SQL Agent spec, dataset scope và limits                           | Xác định schema/dataset/quyền/row limit trước khi chạy                                                          |
| PH6-T07 | SQL template/compiler và query execution                          | Query được kiểm soát/parameterized phù hợp; không chỉ tin regex                                                 |
| PH6-T08 | SQL eval và negative cases                                        | Read đúng scope, giới hạn thời gian/kết quả, chặn write và truy cập ngoài quyền                                 |
| PH6-T09 | Approval/publish lifecycle                                        | Decision có xác thực; publish đúng tested immutable revision; có rollback                                       |
| PH6-T10 | Spike một connector SharePoint hoặc Fabric                        | Contract/quyền/dữ liệu thử có thật; quyết định triển khai và chia task tiếp                                     |
| PH6-T11 | Spike Word Add-in consumer                                        | Chốt luồng auth/API/UI và prototype theo yêu cầu riêng                                                          |
| PH6-T12 | [Đóng gói Builder/API thành MCP tools](AI-Agent/tasks/PH6-T12.md) | Tool catalog/schema, adapter, quyền, idempotency, client integration tests; đặc tả riêng đã có, chưa triển khai |

**Kết thúc nhánh khi:** connector/use case tương ứng đạt contract/eval/quyền. PH6-T10–T11 là spike có giới hạn, không được tính là đã hoàn thiện toàn bộ integration.

**Liên hệ backlog cũ:** `B-015`, `B-016`, `B-017`, `B-018`.

## 10. Nhánh H — Harness giảm đọc thừa: 8 task

Nhánh này phục vụ **AI lập trình**, độc lập với runtime Agent người dùng tạo. Trạng thái dưới đây là snapshot sau phiên lập plan, không phải tỷ lệ tiết kiệm token.

| Mã    | Task con                                     | Trạng thái / nghiệm thu                                                                                               |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| H-T01 | Root instructions, adapters và memory chung  | **Đã tạo** AGENTS/CLAUDE/GEMINI + state/map/task; cần client checks bên dưới                                          |
| H-T02 | Context pack có allowlist và giới hạn        | **Đã tạo, đã test local**; cap 12.000 ký tự, chặn traversal/realpath vượt phạm vi                                     |
| H-T03 | Checkpoint có revision và lock               | **Đã tạo, đã test local**; có [quy trình bàn giao khi hết quota](AI-Agent/harness/HANDOFF.md); chưa có auto-save hook |
| H-T04 | Log slice và usage record                    | **Đã tạo, đã test local**; redaction một số mẫu, usage thiếu là null                                                  |
| H-T05 | Kiểm tra Codex cold start                    | **Chưa thực hiện phiên kiểm chứng riêng**; xác nhận root rules/currentTask/nextTask đúng                              |
| H-T06 | Kiểm tra Claude cold start                   | **Chưa thực hiện**; xác nhận import và tiếp tục đúng task                                                             |
| H-T07 | Kiểm tra Antigravity / Gemini CLI cold start | **Chưa thực hiện**; ưu tiên thử Codex → Antigravity, đối chiếu state + diff/log và tiếp tục đúng subtask              |
| H-T08 | Benchmark token trước/sau                    | **Chưa thực hiện**; ít nhất 5 matched tasks, actual usage/unknown, tính cả failure/rework                             |

**Đã triển khai local: 4/8 task harness. Chưa công bố tiết kiệm token theo phần trăm.** Bộ tiện ích đã qua 15/15 tests ở phiên trước; chưa kiểm chứng ba client tự động nạp file trong phiên mới.

**Liên hệ backlog cũ:** công việc local thuộc `PLAN-000`; `H-001` bao phủ H-T05–T07; `H-002` là H-T08.

## 11. Thứ tự, phụ thuộc và thời gian tham khảo

```text
PH0 → PH1 → PH2 → PH3 → DEMO D1 → PH4 → MVP M1 → PH5 → RELEASE NỘI BỘ
                                                        ↓
                                              PH6 theo nhánh cần thiết
H: dùng cùng toàn bộ quá trình; client check và benchmark khi có task phù hợp
```

| Phase |              Khoảng ngày tập trung tham khảo |
| ----- | -------------------------------------------: |
| PH0   |                                          2–4 |
| PH1   |                                          3–5 |
| PH2   |                                          4–6 |
| PH3   |                                          2–4 |
| PH4   |                                          5–8 |
| PH5   |                                         4–8+ |
| PH6   | Ước lượng riêng sau khi chọn nhánh/connector |

Với một developer chính, D1 khoảng **11–19 ngày tập trung** theo giả định hiện tại; không phải deadline cam kết. Credential, sửa lỗi baseline, license/security scope và thay đổi yêu cầu có thể tăng thời gian. Số task được chia để nghiệm thu, không dùng phép nhân “mỗi task = một ngày”.

## 12. Cách dùng file này để giao việc cho AI

1. Chọn phase/task con trong file này; đọc task chi tiết hiện có nếu được liên kết.
2. AI đọc root rules + state chung + phần liên quan; dùng CodeGraph đúng phạm vi.
3. Khi bắt đầu một nhóm công việc, mới tạo task file chi tiết với allowed scope, acceptance, source và test command. **Không cần tạo sẵn 76 task files rỗng.**
4. Nghiệm thu dựa trên source/test/runtime thật, rồi cập nhật checkpoint và worklog. Không đánh dấu cả phase xong vì một task con đã làm.
5. Khi đổi Codex/Claude/Gemini, bàn giao task + checkpoint + Git hiện tại; không gửi lại toàn transcript.

Git đã kết nối fork `tuananh271020k5/Flowise`: xem [GIT_WORKFLOW.md](AI-Agent/harness/GIT_WORKFLOW.md). Mỗi task con hoàn thành nên có commit riêng mang mã task, kèm code/test/state phù hợp; chỉ stage đúng phạm vi. Branch phase và push thực hiện theo công việc được giao, không tự gom patch cũ.

Với Antigravity hoặc khi Codex hết quota đột ngột, dùng [quy trình HANDOFF](AI-Agent/harness/HANDOFF.md). Ghi checkpoint sau mỗi subtask/kết quả kiểm tra quan trọng và trước thao tác dài; nếu code mới hơn checkpoint phải khôi phục tiến độ từ diff/log. Không chờ cuối phiên mới ghi.

**Tiến độ 14/11/2026:** [TASK-001](AI-Agent/tasks/TASK-001.md) / PH0-T01–T06 đã có baseline runtime; xem [bằng chứng](AI-Agent/context/TASK-001_RUNTIME.md). Chưa triển khai Builder. Nhóm kế tiếp [B-002](AI-Agent/tasks/B-002.md) / PH0-T07–T08 cần chốt model profile, demo, license và cách xử lý prediction công khai của draft.

## 13. Tài liệu chi tiết khi cần

-   [Kiến trúc, hành vi, rủi ro và tiêu chí hệ thống](AI-Agent/plans/MASTER_PLAN.md).
-   [Thiết kế schema/API/storage và invariants](AI-Agent/plans/CONTRACTS.md).
-   [Backlog IDs cũ và dependency](AI-Agent/plans/BACKLOG.md).
-   [Kết quả khảo sát repo/môi trường](AI-Agent/context/BASELINE.md).
-   [Đối chiếu blueprint V2](AI-Agent/plans/DOCUMENT_REVIEW.md).
-   [Hướng dẫn dùng harness](AI-Agent/harness/README.md).

File tổng hợp này là nguồn chính cho **cách chia phase/task và số lượng**. Master plan giữ giải thích kiến trúc; backlog giữ IDs cấp nhóm. Không cộng các IDs trong backlog lần nữa vào 76 task con ở đây vì chúng là các mức phân rã của cùng công việc.
