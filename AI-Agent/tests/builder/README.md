# Smoke test B-028 có runtime thật

## B-030: upload tài liệu và workflow nhiều bước

Chạy sau `node AI-Agent/scripts/prepare-builder.mjs`, dùng dependencies đã có:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=4096'
node AI-Agent/tests/builder/document-workflow-check.mjs
```

Script tự mở backend, provider HTTP fixture, Vite với cache riêng và Edge headless trên các cổng tạm, rồi đóng chúng trong `finally`; không restart server của người dùng. DB mới có tên `AI-Agent/.local/B030-smoke-<timestamp>/`, không dùng tài khoản/key/dữ liệu thật. Browser đi qua Vite proxy thực để giữ nguyên multipart file bytes; không dùng route interception để giả upload. Có thể đặt `BUILDER_SKIP_BROWSER=true` để chỉ kiểm tra API/runtime. Log, trace, kết quả và ảnh dưới `AI-Agent/.local/B-030/`.

Kiểm tra thực thi native V2 cho tài liệu: Markdown/PDF/DOCX, lexical và vector ingest/query, nguồn có auth, nhánh thiếu bằng chứng không gọi LLM. Có thêm workflow3 LLM nối đầu ra, external blocker và browser chỉnh plan qua chat/refresh. HTTP fixture trả nội dung/vector xác định để kiểm tra kết nối; không chứng minh chất lượng model thật. Mã **6314** và DeskFlow là dữ liệu demo. Không có fixture làm fallback trong đường production.

## Bộ smoke B-028 cũ

Bổ sung B-029: `node AI-Agent/tests/builder/responses-protocol-check.mjs` dùng mock HTTP trên cổng tạm, đóng ngay sau test; không cần key thật. Kiểm chứng LangChain đang cài chọn Responses cho web_search và giữ URL annotations qua extractor. Chạy sau prepare-builder; không chứng minh khả năng model/tài khoản trả phí.

Kiểm tra bộ chọn model B-029-T03: khi Vite đang chạy ở `127.0.0.1:8080`, chạy `node AI-Agent/tests/builder/model-picker-browser-check.mjs`. Script mở Edge headless, nạp component dialog thật từ Vite nhưng chặn API bằng Playwright route mocks. Không đăng nhập, không đọc key thật, không ghi backend, không mở thêm server. Nó kiểm tra chọn/lưu model gợi ý, model provider, tự nhập ID, dùng cấu hình provider đã lưu và giữ lựa chọn khi catalog lỗi; ảnh/kết quả nằm trong `AI-Agent/.local/B-029/`. Browser đóng khi xong. Đây là kiểm tra UI, không chứng minh chất lượng hoặc quyền dùng model thật.

Bộ kiểm tra tạo tài khoản và profile model fixture trong DB riêng `B028-smoke`. Chỉ chạy ở instance kiểm tra này, vì API smoke ghi cấu hình provider của workspace. Không dùng API key thật. Tất cả dữ liệu, mật khẩu ngẫu nhiên và ảnh được lưu trong `AI-Agent/.local/B-028/`, đã ignore. Provider HTTP fixture chỉ kiểm tra giao thức, không chứng minh chất lượng LLM.

Dùng Node24 (trên máy này: `AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe`). Sau khi `prepare-builder.mjs`, chạy provider trong terminal thứ nhất:

```powershell
& AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe AI-Agent/tests/builder/provider-fixture.mjs
```

Terminal thứ hai chạy instance riêng:

```powershell
$env:BUILDER_RUNTIME_NAME='B028-smoke'
$env:BUILDER_ALLOW_LOCAL_MODEL='true'
$env:BUILDER_PORT='3037'
$env:BUILDER_UI_PORT='8080'
node AI-Agent/scripts/run-builder.mjs
```

Đợi backend3037 và Vite8080 sẵn sàng. Terminal thứ ba chạy từng test tuần tự:

```powershell
$env:BUILDER_SMOKE_TEST='true'
& AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe AI-Agent/tests/builder/api-check.mjs
& AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe AI-Agent/tests/builder/mcp-check.mjs
& AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe AI-Agent/tests/builder/first-message-check.mjs
& AI-Agent/.local/tools/node-v24.15.0-win-x64/node.exe AI-Agent/tests/builder/browser-check.mjs
```

Browser smoke dùng Playwright đã có trong dependencies local và Edge trên Windows. Cần có cả hai; không tự download/cài thêm. Nó test dialog không lộ key, chat đa lượt, auto-build, preview, sửa tạo flow mới và refresh. MCP smoke dùng SDK thật với phiên đăng nhập, chạy evaluation và kiểm tra prediction private403/profile401. Single-message smoke kiểm tra đủ thông tin ngay đầu và usage25/15 do fixture báo.

Dừng cả hai terminal phục vụ kiểm tra bằng Ctrl+C khi xong. Để dùng sản phẩm với key thật, mở terminal mới chạy launcher mặc định theo `AI-Agent/GUI_TEST_GUIDE.md`; dữ liệu mặc định ở `builder-runtime`, tách khỏi `B028-smoke`.
