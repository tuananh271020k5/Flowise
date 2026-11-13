# Hợp đồng thiết kế Builder — chưa triển khai

API/type dưới đây là đề xuất cần review ở task triển khai. Không tạo schema production bằng cách copy ví dụ nguyên trạng.

## 1. AgentSpec v1 dự kiến

```json
{
    "schemaVersion": "1.0",
    "kind": "assistant",
    "name": "Onboarding Assistant",
    "goal": "Hướng dẫn nhân viên mới theo nội dung đã cung cấp",
    "language": "vi",
    "instructions": "Giải thích ngắn gọn, hỏi khi thiếu thông tin",
    "outputExpectations": ["Câu trả lời theo từng bước"],
    "modelProfileRef": "default-builder-model",
    "dataSources": [],
    "tools": [],
    "policy": { "visibility": "private", "executionMode": "controlled-test", "allowWrite": false },
    "evaluationExamples": [{ "input": "Tôi bắt đầu từ đâu?", "assertions": ["Trả lời bằng tiếng Việt"] }]
}
```

Các kind mở rộng: knowledge, api-readonly, data-readonly. Dùng discriminated schema cho từng kind, length/size limits, reject unknown tool refs. Spec không chứa tenantId để quyết định quyền, URL tùy ý, API key, raw credential hoặc model provider key.

Readiness trả object deterministic: `specReady`, `buildReady`, `testReady`, `missingFields[]`, `assumptions[]`, `reasonCodes[]`. “Có đủ thông tin nghiệp vụ” khác “đã liên kết connector được phép”. Giá trị missing không bị model tự biến thành known bằng suy đoán. Collector chỉ đề xuất patch; server validate rồi tạo revision.

## 2. Plan và compiler

AgentPlan chứa `specRevisionId`, `templateId`, `templateVersion`, `runtimeSha`, `capabilityBindings`, `connectionRefs`, `expectedChecks`. Capabilities chỉ từ registry; không có field JavaScript tùy ý.

Template manifest lưu allowed node names/version, metadata hash, required inputs, input/output handles và golden flow fixture. Compiler tạo IDs/edges/config theo quy tắc ổn định; resolve credential theo actor ở server. Hash logical plan/config không chứa raw secret; nếu connection config thay đổi phải invalidated test status.

Output compiler là `{nodes, edges, viewport}` đúng fork. Adapter serialize **một lần** thành `flowData` string; `type: AGENTFLOW`. Không nhầm MULTIAGENT legacy với Agentflow V2. Validation UI không thay server validation.

## 3. API đề xuất

Mount theo convention thực tại `/api/v1/agent-builder`. Tất cả cần auth và scope; route dưới đây chưa tồn tại.

| Method/path tương đối         | Nhiệm vụ                     | Invariant                                                            |
| ----------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| POST `/sessions`              | Tạo session                  | Actor/workspace lấy từ auth                                          |
| GET `/sessions/:id`           | Khôi phục snapshot           | Không đọc session ngoài quyền                                        |
| POST `/sessions/:id/messages` | Thêm message + collector     | `clientMessageId` unique trong session, `expectedRevision`           |
| GET `/sessions/:id/events`    | SSE tiến độ                  | `Last-Event-ID`; reconnect không trigger build                       |
| POST `/sessions/:id/builds`   | Retry/build explicit khi cần | Key theo spec/compiler/template version; auto-build gọi cùng service |
| POST `/builds/:id/cancel`     | Hủy job                      | Không báo đã hủy khi runtime vẫn tiếp tục                            |
| GET `/drafts/:id`             | Draft và trạng thái kiểm tra | Snapshot immutable                                                   |
| POST `/drafts/:id/tests`      | Chạy thử theo budget         | TestReady + policy + connection rights                               |
| GET `/sessions/:id/revisions` | Lịch sử/diff                 | Revision scoped theo session                                         |
| POST `/sessions/:id/restore`  | Khôi phục cấu hình cũ        | Tạo revision mới, không xóa lịch sử                                  |

Approval/publish endpoints thiết kế sau demo. Phần tử chat chứa câu “publish” chỉ tạo intent/request, không phải authenticated approval record.

Message response có thể `202` kèm jobId/revision; full progress theo SSE. Mọi error thống nhất `{code, message, retryable, requestId, detailsRef?}`. Không trả stack/raw model response/credential cho user. `409` cho revision conflict; auth denied phân biệt với validation error; retry chỉ khi có điều kiện phục hồi.

Event envelope: `{eventId, eventType, sessionId, specRevisionId, buildId?, stage, timestamp, payload}`. Event của revision cũ được hiển thị lịch sử, không đổi trạng thái revision mới. UI không hiển thị chain-of-thought; chỉ trạng thái công việc và lý do ngắn phù hợp người dùng.

## 4. Persistence và tính nhất quán

| Entity dự kiến     | Trường/constraint chính                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| BuilderSession     | actor/workspace, currentSpecRevision, state, timestamps                          |
| BuilderMessage     | session, role, clientMessageId, sanitized body, unique(session, clientMessageId) |
| AgentSpecRevision  | session, revisionNo, validated spec, assumptions, schemaVersion, immutable       |
| AgentDraftRevision | specRevision, compiler/template/runtime versions, flowId, hashes, immutable      |
| BuildJob           | buildKey unique, revision, state, attempt, cancellation, errorCode               |
| BuilderEvent       | session, eventId, job/revision, sanitized payload, retention                     |

Transaction ghi message/revision/job hoặc outbox để tránh có revision nhưng mất build dispatch. Không giữ transaction DB trong lúc gọi LLM/runtime. Nếu flow đã lưu nhưng job chưa finalize vì crash, reconcile bằng buildKey/mapping đã lưu thay vì tạo flow mới.

## 5. Các contract tests bắt buộc trước dùng draft thật

-   Flow đúng type, JSON string, node metadata/handles hợp lệ; mở lại canvas không lỗi.
-   Create/update/read/prediction dùng auth/workspace đúng; sai user/workspace bị từ chối.
-   `deployed=false` và `isPublic=false` được kiểm tra hành vi thật; không suy ra là cấm execute.
-   Generator trả error object dù HTTP thành công vẫn bị adapter đánh lỗi.
-   Hai build cùng key, SSE reconnect, retry sau timeout không tạo draft trùng.
-   Chat edit trong build không cho kết quả cũ ghi đè; cancellation phản ánh đúng trạng thái runtime.
-   Secret/connection raw values không vào spec/plan/events/context packs.

Trước khi có test/integration fixture thật, contract này mang trạng thái planned.
