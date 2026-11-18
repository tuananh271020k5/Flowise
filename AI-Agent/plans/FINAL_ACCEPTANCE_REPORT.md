# Nghiệm thu thực tế Chat-to-Agent — 17/11/2026

Báo cáo này thay thế kết luận cũ “100%, 76/76 tasks”. Kết luận cũ dựa nhiều vào mock/fixture, không chứng minh luồng chạy sản phẩm. Phạm vi đạt hiện tại là demo Chat-to-Agent local với provider tương thích OpenAI được kiểm tra bằng HTTP fixture. Chưa nghiệm thu toàn bộ roadmap hoặc production.

**User QA sau B-030: chưa đạt.** Lượt DeskFlow Rev2 có nguồn chứa quy trình mời thành viên/thời hạn48 giờ nhưng bot trả menu tính năng, không trả lời yêu cầu. Executions xanh chỉ xác nhận bước chạy xong. Start/Rendered No data có chênh lệch trường question/content trong source; Raw của lượt chạy và Input bước soạn chưa được đối chiếu. Chưa xác nhận nguyên nhân và chưa sửa code theo lệnh người dùng; tiếp B-030-T06. Các kết quả fixture dưới đây không phủ nhận lỗi thực tế này.

**Cập nhật B-030 — tài liệu và workflow nhiều bước:** đã có upload trong chat, chunk persistence, keyword/vector retrieval và workflow_v1 planner/compiler. Native V2 chạy Retriever/Condition/LLM/Agent/DirectReply theo graph; giữ nguồn qua các bước. Browser/HTTP trên DB riêng xác minh Markdown/PDF/DOCX, tạo/query vector thật qua HTTP fixture, nhánh không có nguồn không gọi LLM, source auth, workflow3 LLM nối đầu ra, external blocker, sửa qua chat tạo draft khác và refresh giữ plan. Full backend48 suites/355 tests pass; sau repair cấu trúc,2 suites/19 tests pass, sau tối ưu ranking1 suite/5 tests pass; UI4 suites/127 tests pass. Prepare61 files emit, chưa phải full build/typecheck. Bằng chứng ignored `AI-Agent/.local/B-030/integration-result.json`, screenshot và logs; script chạy lại `AI-Agent/tests/builder/document-workflow-check.mjs`. Tất cả test services/browser đã đóng, không restart instance của người dùng và không gọi key thật.

LLM và embedding trong kiểm tra là HTTP fixture trả nội dung/vector xác định; điều này xác minh ingestion, data binding, nhánh, nguồn và native execution, không đo chất lượng model thật hoặc chứng minh triển khai mọi khả năng. Giới hạn hiện tại:12 bước,5 MB/file,5 file/lần,10 nguồn/phiên, không OCR; Veo/Excel/file/loop/API tùy ý còn cần tích hợp. Dữ liệu DeskFlow và mã6314 là giả định cho demo. Xem [hướng dẫn test phần mềm A–Z](../GUI_TEST_GUIDE.md).

**Cập nhật B-029-T01:** người dùng test provider thật gặp lỗi định dạng outputExpectations. Đã bổ sung type contract trong prompt và normalize string/null; collector/session41 tests pass. Chưa có lần chạy lại provider thật sau sửa. Các số kiểm tra B-028 dưới đây là mốc trước bản sửa nhỏ này, không phải nghiệm thu toàn bộ model thật.

**Cập nhật B-029-T02:** người dùng test thấy bot phủ nhận vai trò và khẳng định sản phẩm chưa ra mắt từ kiến thức cũ. Cấu hình quan sát có model, chưa có tool/kho tài liệu. Đã thêm role/freshness policy cho preview draft hiện có; web_search tùy chọn (mặc định tắt), lưu snapshot khi publish, và trích URL annotations thành nguồn clickable. Backend46 suites/339 tests qua; sau chốt publish/policy,2 suites/15 tests qua. UI125/harness15 qua. HTTP protocol fixture1 request kiểm chứng SDK tự dùng Responses và giữ nguồn; không gọi provider trả phí. Chưa nghiệm thu chất lượng câu trả lời với key thật. Người dùng tự restart terminal để nạp mã mới.

Web implementation theo [OpenAI Docs](https://developers.openai.com/api/docs/guides/tools-web-search). Dùng model/endpoint đã chọn; khả năng truy cập thực tế phải xác minh trên tài khoản người dùng. RAG với dữ liệu cửa hàng vẫn là phạm vi chưa nghiệm thu.

## Hành vi đã xác minh

| Hành vi | Bằng chứng |
| --- | --- |
| Chat mô tả, hỏi phần còn thiếu | API + browser: revision1/2 chưa build; tên, mục tiêu và hướng dẫn được giữ |
| Đủ dữ kiện thì tự tạo Agent | Revision3 có buildResult thành công mà không bấm nút build; graph Start → Agent, model nằm trong input Agent |
| Chat với Agent qua runtime | Preview trả executionId; Start/Agent FINISHED; fixture provider nhận request từ Flowise runtime |
| Nhập đủ ngay tin đầu | Auto-build thành công ở revision1; runtime chỉ có một user message hiện tại, không thêm bản sao input; usage25/15 lấy từ provider fixture |
| Sửa qua chat | Revision4 tạo flowId khác; hướng dẫn mới phản ánh trong câu trả lời runtime |
| Refresh giữ phiên/draft | Edge reload, spec và preview vẫn theo revision4; không chọn draft khác revision |
| Cấu hình OpenAI/tương thích | Dialog tên model/Base URL/API key; key mã hóa trong workspace Credential, không trả key đã lưu về UI |
| Draft riêng tư | Prediction ẩn danh trả403; model-profile ẩn danh/spoof workspace trả401 |
| Evaluation | Gọi prediction thật; lỗi provider thành test thất bại; không lấy nội dung fixture/citation làm câu trả lời thay thế |
| MCP | SDK client Streamable HTTP initialize → tools/list → get_session → run_tests; có 5 tool được chọn, thiếu clientMessageId bị từ chối |
| SQL adapter | Test SQLite thật đọc đúng bản ghi; WHERE1=0 trả0 dòng; thiếu kết nối của workspace thì lỗi, không trả hàng mẫu |
| Sandbox | Computed constructor escape bị chặn; tính toán đúng; vòng lặp timeout trong tiến trình con có giới hạn |

Provider fixture là HTTP server chỉ trong bộ kiểm tra, trả dữ liệu xác định để chứng minh kết nối. Nó không được gọi ngầm hoặc trả kết quả thay thế khi production thiếu key. Chưa dùng API key trả phí nên chưa đánh giá chất lượng thu thập tiếng Việt hoặc câu trả lời của model thật.

## Kiểm tra đã chạy

- Backend cuối: Node24, Jest `--runInBand --testPathPattern=services/agent-builder`: **44 suites, 323 tests pass**. Có test preview loại overrideConfig và giới hạn input/history. Các unit/component tests có mock được ghi rõ; không suy ra RAG/SQL/API Agent trọn vòng từ chúng.
- Sau sửa bỏ input trùng: compiler6 tests pass; single-message runtime smoke pass và kiểm tra chỉ có một user message. Không chạy lại full suite chỉ vì thay một trường đã có kiểm tra hẹp.
- UI: Jest `--runInBand`: **4 suites, 125 tests pass**.
- Harness: `node --test AI-Agent/harness/harness.test.mjs`: **15 tests pass**; doctor pass. Node mặc định22 chưa đáp ứng Flowise; launcher runtime chọn Node24 portable.
- Edge headless: cấu hình model không lộ key, chat đa lượt, auto-build, preview, sửa, refresh: pass; không pageerror.
- MCP SDK client: 5 tools, evaluation1/1 qua runtime, private prediction403, anonymous profile401: pass.
- Server typecheck từng exit0 ở giữa phiên sửa. Bản cuối được transpile và chạy runtime; full build mới bị Windows crash nên **không có kết quả full build cuối đã xác minh**. Không chạy lặp job nặng để ép lấy kết quả.

Log và dữ liệu local được Git ignore: `AI-Agent/.local/B-028/regression-final.json`, `ui-tests.json`, `harness-tests.log`, `browser-result.json`, `browser-final.log`, `browser-initial.png`, `mcp-result.json`, `first-message-result.json`, `api-check.log`, `runtime-final.log`. Bộ smoke có thể chạy lại tại `AI-Agent/tests/builder/README.md`. Không đưa DB/key vào Git.

## Phần chưa được nghiệm thu

- PH4: ingest/retrieval với DocumentStore thật và dữ liệu của người dùng; golden cases chạy model thật, citation đúng nguồn và repair.
- PH5: full build/release trên máy ổn định; tenant/RBAC review đầy đủ; load, backup/restore và observability production. Chi phí bảng giá có sẵn chỉ là ước tính; usage hiện là bộ nhớ tiến trình, không phải billing bền vững.
- PH6: SQL/API/custom tool kết nối trọn vòng vào Agent với quyền thực tế. Registry connector/SQL/custom tool hiện còn có dữ liệu trong RAM; SQL server connection adapter không đồng nghĩa đã có SQL tool hoàn chỉnh trong Agent.
- PH6-T09–T11 trong plan gốc là approval, SharePoint/Fabric và Word add-in. Các task cũ đổi nhãn sang sandbox/webhook/multisource không thay thế nghiệm thu những mục này.
- MCP hiện bọc 5 operation được chọn với phiên đăng nhập Flowise; chưa bọc toàn bộ REST API hoặc cung cấp OAuth/client credential workflow cho client ngoài.
- H: chưa có benchmark token thật trước/sau. Context cap12000 là ký tự UTF-16, không phải quota token. Giới hạn token và rate limit không thực hiện OS reboot.
- Windows ghi bugcheck0x133. Chưa phân tích được minidump/driver; không kết luận đã sửa ổn định máy. Native Couchbase tùy chọn không nạp được trên môi trường này; ChatOpenAI chạy được.

Các phần trên được bàn giao riêng trong [B-029](../tasks/B-029.md). Chạy và test giao diện theo [hướng dẫn tiếng Việt](../GUI_TEST_GUIDE.md). B-028 chưa được commit/push tự động.
