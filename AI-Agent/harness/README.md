# Harness local cho Codex, Claude Code và Gemini CLI

Đây là lớp hỗ trợ quy trình coding, hoạt động bằng Node built-ins; không cài package, không gọi LLM/MCP, không đọc billing, không chỉnh runtime Flowise. Nó giúp lựa chọn context và lưu bàn giao; chưa có benchmark chứng minh tiết kiệm token.

**Chuyển Codex → Antigravity khi hết quota:** xem [HANDOFF.md](HANDOFF.md), gồm checkpoint giữa task, prompt tiếp nhận và khôi phục khi phiên cũ bị ngắt trước khi ghi state. Chưa có auto-save hook sau mọi thao tác.

## Những phần đang hoạt động

| Lệnh/cơ chế                | Tác dụng thực tế                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Root rules + thin adapters | Hướng dẫn dùng cùng state/task, tránh ba bản rules dài                                   |
| `doctor`                   | Kiểm tra file/config/budget/ignore, Git drift; báo riêng Node engine/runtime chưa verify |
| `context`                  | Ghép state + map + task và tối đa một extra từ allowlist; giới hạn 12.000 ký tự mặc định |
| `checkpoint`               | Ghi handoff vào state chung, revision check và exclusive lock chống ghi đè               |
| `log-slice`                | Lọc lỗi và lân cận từ log local; tối đa 80 dòng mặc định                                 |
| `usage`                    | Ghi số thực người dùng lấy từ client; thiếu thì null; lưu cả task thất bại               |
| CodeGraph workflow         | AI gọi tool đang kết nối; harness không giả lập MCP                                      |

## Dùng hằng ngày

Chạy từ root repo:

```powershell
node AI-Agent/harness/harness.mjs doctor
node AI-Agent/harness/harness.mjs context --task AI-Agent/tasks/B-028.md
node --test AI-Agent/harness/harness.test.mjs
```

Context ghi vào `AI-Agent/.local/context-pack.md`. Pack có source hash, Git HEAD/branch, cảnh báo drift, đánh dấu phần bị cắt. Đây là giới hạn **UTF-16 code units của JavaScript**, thường gọi ngắn là ký tự; không phải giới hạn token hay byte. Không dùng chars/4 như billing usage.

Nếu task thực sự cần contract:

```powershell
node AI-Agent/harness/harness.mjs context --task AI-Agent/tasks/B-028.md --extra AI-Agent/plans/CONTRACTS.md
```

Nếu pack đã bị cắt, mở đúng section còn thiếu; không coi nội dung cuối pack chắc chắn đã được nạp. State/map/task được ưu tiên trước extra. Không thêm toàn blueprint vào allowlist chỉ để tiện.

Root rules đã được client nạp thì không gửi lại chúng cùng pack. Khi pack đã có state/map/task, không đính kèm nguyên ba file một lần nữa. Dùng file hash để phát hiện thay đổi khi so sánh pack; script không tự cache kết luận semantic từ source.

## Checkpoint khi bàn giao

1. Đọc `AI-Agent/state/project.json` để biết revision hiện tại.
2. Tạo `AI-Agent/.local/checkpoint-input.json` dựa trên `AI-Agent/templates/checkpoint.example.json`; thay bằng kết quả thật.
3. Chạy với revision đã đọc, ví dụ revision 1:

```powershell
node AI-Agent/harness/harness.mjs checkpoint --file AI-Agent/.local/checkpoint-input.json --expect-revision 1
```

Nếu revision đổi, đọc lại state và merge bằng chứng mới; không tăng số revision theo phỏng đoán. Lock tồn tại báo có writer hoặc phiên bị ngắt; xác minh writer đã dừng trước khi xóa lock local. Không có tùy chọn force ghi đè.

Checkpoint giữ nguyên authorization, measurement và baseline; chỉ nhận các trường handoff có giới hạn. Nó chụp HEAD/branch và fingerprint những file sản phẩm/dependency đang thay đổi: packages, root manifest/lock/workspace, .nvmrc, turbo.json. Fingerprint bao gồm staged/unstaged và untracked files trong scope này; file lớn trên 10MB chỉ dùng metadata. Nó không thay Git diff, không phát hiện mọi thay đổi config ngoài scope hoặc external service.

Một AI ghi state tại một thời điểm. Lock bảo vệ **lệnh checkpoint**, không khóa code editor hay mọi thao tác sửa tay. `project.json` là memory được review, không phải bằng chứng test tự sinh. Không tự gọi checkpoint để báo hoàn thành khi acceptance chưa đạt.

## Lọc log

Lưu log gốc ở `AI-Agent/.local/` bằng lệnh test thực tế, rồi:

```powershell
node AI-Agent/harness/harness.mjs log-slice --file AI-Agent/.local/test-output.txt --lines 80
```

Chỉ nhận file ở local directory, tối đa 2MiB mặc định; chặn realpath vượt boundary. Giữ log gốc. Nếu nguyên nhân không có trong slice, mở đoạn cụ thể hoặc thu log hẹp hơn. Không giả định mỗi warning là lỗi gốc.

Redaction che một số mẫu Bearer/key/password/URL credentials, **best effort**, không phải secret scanner hoàn chỉnh. Không đưa secrets vào shared docs ngay từ đầu; review file pack/log trước khi chia sẻ.

## Đo token và chi phí

Chưa có token thực thì ghi unknown, không tự sinh số:

```powershell
node AI-Agent/harness/harness.mjs usage --agent codex --task TASK-001 --variant harness --accepted no
```

Khi có usage UI/log đáng tin, bổ sung `--input`, `--output`, `--cached`, `--tools`, `--files`, `--seconds` với số đã quan sát. `cached` là thành phần input được provider báo, không mặc định cộng thêm vào input. Script không tự tính USD, không áp bảng giá model và không kết luận tỷ lệ tiết kiệm.

`usage.jsonl` nằm local, không chia sẻ/commit mặc định. Khi benchmark: dùng ít nhất 5 cặp task cùng snapshot/model/acceptance; ghi mọi attempt gồm failure, retry và thời gian sửa. Với nhóm cùng độ khó, báo tổng token thực cùng số task được chấp nhận và success rate; không chỉ chọn task đã pass. Task có input/output null không đưa vào tổng so sánh token như số 0.

Có thể đặt mục tiêu giảm 20–30% sau baseline như giả thuyết thử nghiệm, nhưng chỉ công bố khi dữ liệu đủ và chất lượng không giảm. Chưa có dữ liệu trong phiên này.

## Xác minh mỗi client một lần

| Công cụ     | Điểm vào ở repo root                               | Cách kiểm tra                                                                                 |
| ----------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Codex       | `AGENTS.md`                                        | Phiên mới tại root: yêu cầu nêu currentTask/nextTask từ state; xác nhận instructions đang nạp |
| Claude Code | `CLAUDE.md` import `@AGENTS.md`                    | `/memory` hoặc context inspection theo phiên bản client; không import thêm plan lớn           |
| Gemini CLI  | `GEMINI.md` import `@AGENTS.md`                    | `/memory show`, `/memory reload`; xác nhận nội dung và đường dẫn                              |
| Antigravity | Root `AGENTS.md`/`GEMINI.md` theo client discovery | Mở cùng repo, dùng prompt trong HANDOFF và xác nhận currentTask/subtask/nextAction            |

Các client phải trả lời đúng trạng thái mới nhất theo `state/project.json`; mô tả baseline cũ không đại diện tiến độ B-028. `doctor` chỉ báo trạng thái được ghi và không tự kiểm tra lại runtime. Checklist cần kiểm tra trên từng app; chưa chứng minh Claude/Gemini/Antigravity đã nạp file tại máy này. Antigravity có discovery root rules theo [tài liệu Google](https://antigravity.google/docs/rules/); `@filename` là reference, không mặc định inline giống Gemini CLI.

Tài liệu chính thức: [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude memory/imports](https://code.claude.com/docs/en/memory), [Gemini CLI GEMINI.md](https://geminicli.com/docs/cli/gemini-md/).

## CodeGraph và budget truy xuất

MCP đang dùng có `codegraph_explore`: hỏi một flow/symbol cụ thể, giới hạn 2–4 files ban đầu; source current trả về đã được đọc. Nếu query rộng trả nhiều output, thu hẹp thay vì lặp lại toàn bộ. Stale/uncovered files mới cần đọc trực tiếp. Không thay MCP bằng config trong blueprint vì chỉ trùng tên CodeGraph.

Fallback shell Windows khi MCP không có và index hiện diện: `codegraph.cmd explore "saveChatflow executeAgentFlow"`. Nếu index không tồn tại, dùng tìm kiếm có giới hạn; không tự index. Với bug phức tạp phải mở đủ source/tests/trace, không cố tối ưu token đến mức đoán.

## Phần chưa tự động hóa

Chưa có lifecycle hook bắt buộc giữa mọi IDE, auto-run tests, auto-summary, auto-billing import, shared cloud memory hay service điều phối ba AI. Quy tắc giảm đọc thừa là hướng dẫn; hard cap chỉ áp dụng output của CLI. Không sao chép nested template vào root, không chạy script sync cũ và không cài thêm MCP trong phiên này.
