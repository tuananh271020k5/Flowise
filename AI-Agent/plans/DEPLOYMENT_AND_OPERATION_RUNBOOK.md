# Vận hành và cổng phát hành

Cập nhật 17/11/2026. Chưa nghiệm thu production; tài liệu cũ gắn nhãn hoàn thành PH0–PH6 đã được thay thế.

## Chạy local

Dùng [hướng dẫn UI](../GUI_TEST_GUIDE.md). Hai lệnh từ root trên máy đã có dependencies/baseline:

```powershell
node AI-Agent/scripts/prepare-builder.mjs
node AI-Agent/scripts/run-builder.mjs
```

Launcher dùng Node24, backend3037 và UI8080 trên localhost. SQLite, encryption key, log/storage đặt dưới `AI-Agent/.local/builder-runtime`. Sao lưu DB cùng key; không đưa file chứa credential vào Git. Dừng terminal bằng Ctrl+C. Không chạy package `npx flowise` khác để nghiệm thu source này.

## Cấu hình thực sự được đọc

- `AI-Agent/.local/builder.env`: dotenv local tùy chọn của launcher; đã được ignore.
- `BUILDER_PORT`, `BUILDER_UI_PORT`, `BUILDER_RUNTIME_NAME`: cổng và tên thư mục dữ liệu riêng.
- `BUILDER_MODEL_NAME`, `BUILDER_MODEL_BASE_URL`, `BUILDER_CREDENTIAL_ID`: profile mặc định server; UI profile trong Variable của workspace được ưu tiên. Credential ID phải thuộc workspace.
- `BUILDER_ALLOW_LOCAL_MODEL=true`: cho phép URL model local do quản trị viên cấu hình. OpenAI thường không cần bật.
- `OPENAI_API_KEY`: fallback môi trường của server nếu không dùng credential workspace; ưu tiên cấu hình key qua UI cho demo.
- `BUILDER_SQL_CONNECTIONS`: JSON do quản trị viên cấp ánh xạ credentialRef → workspaceId/type/path hoặc url. Không nhận URL database/mật khẩu từ LLM hoặc body truy vấn. SQLite mở readonly; PG/MySQL dùng transaction readonly. Chưa kiểm chứng PG/MySQL thật.

Không dùng các tên biến rate/budget được suy diễn từ tài liệu cũ; xem source trước khi thay cấu hình. Giới hạn evaluation hiện được validate1–10; bảng rate limit trong `security/rateLimiter.ts`.

## Xác minh và phát hành

Kết quả hiện tại đọc tại [báo cáo nghiệm thu](FINAL_ACCEPTANCE_REPORT.md). B-028 có unit/component tests và browser/runtime với provider fixture; cần người dùng chạy lại với key/model thật. Không suy ra chất lượng model hoặc khả năng phát hành từ số test pass.

Trước release cần full build/typecheck cuối trên máy ổn định; kiểm tra RBAC từng thao tác, tenant isolation, load, backup/restore, migration và observability bền vững. API/SQL Agent, RAG, approval, SharePoint/Fabric, Word add-in và client MCP ngoài có backlog B-029. Public publishing cần nghiệm thu riêng trước khi chia sẻ ra ngoài.

Máy hiện tại từng bugcheck0x133 khi build nặng. Chạy job tuần tự, heap4096MB, Turbo concurrency1, Jest runInBand; không tự reboot hay đổi driver. Kết quả của job bị crash là chưa xác minh.
