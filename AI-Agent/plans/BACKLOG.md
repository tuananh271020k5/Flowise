# Backlog triển khai — snapshot 14/11/2026

**Bản chia task con đầy đủ:** [PLAN_TONG_HOP.md](../../PLAN_TONG_HOP.md), gồm 7 phase / 68 task sản phẩm + 8 task harness. IDs trong bảng dưới là nhóm công việc; không cộng thêm chúng vào tổng task con. File tổng hợp có mapping từng phase về các IDs này.

Trạng thái hiện tại theo `../state/project.json`. Bảng này mô tả dependency/đầu ra; không dùng để tự suy ra tính năng đã xong. `PLAN-000` là việc đã hoàn tất trong phiên lập kế hoạch. Các task triển khai còn **chưa bắt đầu**.

| ID       | Ưu tiên | Công việc                                       | Phụ thuộc            | Nghiệm thu                                                               |
| -------- | ------- | ----------------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| PLAN-000 | P0      | Khảo sát, plan, memory, local harness           | Không                | File đủ; harness checks pass; product chưa thay đổi                      |
| TASK-001 | P0      | Baseline runtime/environment/fixture            | PLAN-000             | Node/pnpm đúng; build/start logs; 1 flow export và controlled prediction |
| B-002    | P0      | Chốt demo scope/provider/auth/license boundary  | TASK-001             | Profile model, quyền actor, phạm vi dùng source có owner xác nhận        |
| B-003    | P0      | AgentSpec assistant + readiness                 | B-002                | Valid/invalid/multi-turn examples; deterministic missing fields          |
| B-004    | P0      | Session/message persistence + API               | B-002                | Scoped auth; dedupe clientMessageId; refresh giữ state                   |
| B-005    | P0      | Chat UI + spec card + SSE mock                  | B-003,B-004          | Gửi/nhận, missing fields, reconnect và error states                      |
| B-006    | P0      | Collector structured patch + auto-build event   | B-003,B-004          | Không hỏi trùng; build đúng revision; không gọi khi chưa ready           |
| B-007    | P0      | Template assistant manifest + compiler          | TASK-001,B-003       | Golden fixture; deterministic output; node/handle validation             |
| B-008    | P0      | Flowise adapter + job idempotency               | B-007,B-004          | Draft thật + auth contract + retry không duplicate                       |
| B-009    | P0      | Controlled runtime chat/test panel              | B-008,B-005          | Draft trả lời được; lỗi credential và budget rõ                          |
| B-010    | P0      | Chat edit + revision/diff + cancel              | B-006,B-008          | Revision mới; edit-during-build/reconnect cases pass                     |
| G-D1     | Gate    | Demo hoàn chỉnh với sếp                         | B-009,B-010          | Ba kịch bản prompt/build/test/edit không thao tác canvas                 |
| B-011    | P1      | Knowledge source + retrieval template           | G-D1                 | Data fixture có quyền, citations và missing evidence                     |
| B-012    | P1      | Golden eval + bounded repair                    | B-011                | 10 Knowledge cases; policy/auth lỗi không retry nới quyền                |
| B-013    | P1      | Observability, usage, limits, recovery          | B-008                | Trace per revision/job, cost actual/null, timeout/cancel/reconcile       |
| B-014    | P1      | Release nội bộ: patch/auth/license/runbook      | B-012,B-013          | Scope review, rollback, owner vận hành; negative tests                   |
| B-015    | P2      | API readonly registered connector               | B-014                | Operation allowlist, errors/permissions/eval; không URL tự do            |
| B-016    | P2      | SQL readonly controlled executor                | B-014                | DB account readonly, scoped queries/limits/timeouts/eval                 |
| B-017    | P2      | Approval/publish lifecycle nếu cần              | B-014                | Authenticated decision, immutable tested revision, rollback              |
| B-018    | P3      | SharePoint/Fabric/Word/MCP Builder theo nhu cầu | M1 và quyền truy cập | Task riêng theo connector, không giả định có quyền sẵn                   |
| H-001    | P1      | Kiểm tra cold start cả 3 client                 | PLAN-000             | Mỗi client nêu đúng task/next action, không đọc lại toàn repo            |
| H-002    | P1      | Benchmark harness                               | H-001 + task thực tế | Ít nhất 5 matched tasks; usage thật/unknown; acceptance/rework           |

Chi tiết `PH6-T12` thuộc B-018: [đóng gói Builder/API thành MCP](../tasks/PH6-T12.md). H-001 bao gồm bài thử bàn giao Codex → Antigravity theo [HANDOFF](../harness/HANDOFF.md), cả trường hợp checkpoint chậm hơn code.

Không bắt buộc làm tất cả mở rộng để nghiệm thu D1/M1. Backlog có thể đổi khi sếp chốt deadline và nguồn dữ liệu thật.
