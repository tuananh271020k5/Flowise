# PLAN-000 — Khảo sát và chuẩn bị kế hoạch

**Status:** completed. **Scope:** docs + local harness, không thay đổi sản phẩm.

## Yêu cầu

Đọc blueprint và Flowise để đánh giá hướng Chat-to-Agent; tạo kế hoạch triển khai và bộ nhớ chung cho Codex/Claude/Gemini; chuẩn bị harness hạn chế đọc thừa và đo token.

## Kết quả nghiệm thu

-   [x] Có baseline SHA, map generator/CRUD/runtime/canvas và các phần chưa xác minh.
-   [x] Có master plan, contract design, backlog, ADR và bản đối chiếu blueprint.
-   [x] Có root instructions + adapters + canonical state + task kế tiếp.
-   [x] Có local harness không dependency/API/model calls và kiểm tra hành vi có giới hạn context/path/state.
-   [x] Giữ nguyên các patch, config template và blueprint đã có.
-   [x] Phân biệt rõ chưa build/start/test sản phẩm và chưa đo tiết kiệm token thật.

Lệnh/kết quả kiểm tra cụ thể được ghi trong `../state/project.json` và worklog sau khi thực thi.
