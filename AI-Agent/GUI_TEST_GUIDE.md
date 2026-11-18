# Chạy và test Chat-to-Agent trên giao diện

Cập nhật 17/11/2026, B-030. Chat thu thập yêu cầu và tài liệu → lập kế hoạch các bước → biên dịch node/kết nối Agentflow V2 → chat thử có nguồn → sửa qua chat → giữ phiên sau refresh. Không cần mở Document Stores để nhập tài liệu.

## Chạy trên máy hiện tại

Mở PowerShell tại `D:\Flowise`, chạy từng dòng:

```powershell
cd D:\Flowise
node AI-Agent/scripts/prepare-builder.mjs
node AI-Agent/scripts/run-builder.mjs
```

Giữ terminal đang chạy. Mở **http://127.0.0.1:8080/agent-builder**. Backend ở `127.0.0.1:3037`; UI Vite proxy API vào backend này. Đợi dòng server listening và Vite ready. Lần đầu chọn tạo tài khoản quản trị của Flowise; lần sau đăng nhập tài khoản đã tạo.

Máy này đã có dependencies và baseline `dist`. `prepare-builder` chỉ transpile phần Builder và backend đã sửa trên baseline đó; đây không phải full build hay full typecheck. Script vẫn chuẩn bị Builder sau khi commit, kể cả Git sạch. `run-builder` dùng Node 24; nếu lệnh `node` đang là Node 22, nó tự tìm bản Node 24 portable đã có trong `AI-Agent/.local/tools/`. Không đổi Node toàn hệ thống. Log launcher được lưu trong `AI-Agent/.local/builder-runtime/launcher.log`.

Đừng chạy `npx flowise start` để kiểm tra bản sửa: lệnh đó có thể chạy package khác với source của fork này. Sau khi sửa backend, dừng instance bằng **Ctrl+C**, chạy lại hai lệnh trên. UI tự reload khi sửa source.

## Cấu hình OpenAI hoặc dịch vụ tương thích

1. Nhấn **Cấu hình model** trên trang Agent Builder.
2. Mở danh sách **Tên model**, chọn `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.2` hoặc `gpt-4o-mini`; cũng có thể tự nhập tên model của provider. Các tên gợi ý đối chiếu từ [OpenAI Models](https://developers.openai.com/api/docs/models); tài khoản/provider phải cho phép dùng model đã chọn.
3. Dùng OpenAI: để trống Base URL. Dùng provider tương thích: nhập URL API của provider, thường kết thúc bằng `/v1`, và đúng tên model của họ.
4. Nhập API key rồi **Lưu cấu hình**. Key được mã hóa vào Credential của workspace; mở lại dialog không trả key cũ về trình duyệt. Không gửi key trong hội thoại.

“Đã có API key” chỉ xác nhận cấu hình đã lưu; quyền truy cập model, số dư và khả năng tương thích được kiểm tra khi gọi provider thật. Khi provider lỗi, giao diện hiện lỗi để sửa cấu hình. Không có câu trả lời mẫu thay cho model.

Để xem model của chính provider, bấm **Tải model từ provider** sau khi lưu key và Base URL. Danh sách chỉ được tải khi bấm nút, dùng cấu hình đã lưu trên server; API key không trả về trình duyệt. Nếu vừa thay key/Base URL, lưu rồi mở lại hộp thoại trước khi tải. Provider có thể không hỗ trợ `/models`; khi đó vẫn chọn gợi ý hoặc nhập tên thủ công. Catalog có thể gồm cả model ảnh/âm thanh/embedding, nên cần chọn model chat. Tải được ID chưa chứng minh model có quyền chat hoặc tra web.

Đổi model và bấm **Lưu cấu hình** sẽ áp dụng cho hội thoại thiết kế tiếp theo và câu hỏi chat thử tiếp theo, kể cả draft hiện có. Để trống ô key nếu giữ key cũ; không cần tạo lại Agent. Câu trả lời cũ trong lịch sử không tự thay đổi. Kiểm tra nhanh: chọn một model khác mà tài khoản có quyền dùng → lưu → mở lại cấu hình, xác nhận tên vẫn đúng → hỏi câu mới ở Chat Thử Nghiệm.

Muốn hỏi thông tin hiện tại như mẫu điện thoại mới, bật **Cho phép Agent tra cứu web để cập nhật thông tin**, rồi lưu. Cần endpoint/model hỗ trợ **OpenAI Responses + web_search**; dịch vụ có thể tính phí tra cứu riêng. Ứng dụng giữ nguyên model bạn chọn, không tự đổi model. Chưa bật web và chưa cấp tài liệu thì Agent phải nói chưa có dữ liệu xác nhận, không khẳng định ngày ra mắt/giá/tồn kho từ trí nhớ. Web về hãng không chứng minh tồn kho hoặc giá riêng của cửa hàng. Cấu hình model/web mới áp dụng ngay cho chat thử của draft hiện có sau khi backend đã nạp bản sửa B-029-T02.

Sau cập nhật mã, nhấn Ctrl+C ở terminal của bạn, chạy lại prepare-builder và run-builder. Nếu đang có câu trả lời sai trong lịch sử chat thử, dùng nút thùng rác **Xóa lịch sử chat thử** rồi hỏi lại. Không cần tạo lại Agent. Với web, mở **Nguồn trích dẫn → Mở nguồn tham khảo** để kiểm tra URL. Nếu provider/model không hỗ trợ Responses/web_search, ứng dụng báo lỗi, không tự trả lời bằng kiến thức cũ.

## Test A–Z: trợ lý hướng dẫn phần mềm, có tài liệu

1. Nếu terminal đang chạy bản cũ, nhấn **Ctrl+C**, chạy lại `prepare-builder.mjs` rồi `run-builder.mjs` như phần đầu, sau đó F5. Trong Cấu hình model, giữ key hiện tại và chọn model mà provider cho phép. Khi muốn chỉ kiểm tra tài liệu, tắt tra web để dễ đối chiếu nguồn.
2. Bấm **+** tạo phiên mới. Bấm **Đính kèm tài liệu** hoặc kéo file vào khung chat bên trái. Có sẵn file thử [deskflow-guide.md](fixtures/deskflow-guide.md) trong `D:\Flowise\AI-Agent\fixtures\`. Đây là tài liệu phần mềm giả định **DeskFlow Demo 1.0**, không phải thông tin về một sản phẩm thật. Có thể thay bằng tài liệu phần mềm của bạn.
3. Giữ chế độ **Theo từ khóa — không gọi embedding** để thử ngay. Muốn tìm theo ngữ nghĩa, chọn embedding và nhập đúng tên model embedding của provider; dùng key/Base URL đã lưu, có thể phát sinh phí khi tải file và mỗi lần truy xuất. Không dùng tên model chat trong ô embedding.
4. Nhập tự nhiên rồi bấm gửi, ví dụ:

   ```text
   Tôi muốn tạo trợ lý hướng dẫn DeskFlow cho nhân viên mới, tên là Trợ lý DeskFlow. Dùng tài liệu đính kèm để hiểu câu hỏi và hướng dẫn từng bước bằng tiếng Việt. Phải kiểm tra có bằng chứng, dẫn nguồn; nếu tài liệu không có thì hỏi rõ hoặc nói chưa có hướng dẫn, không bịa chức năng.
   ```

   Bot tự lập kế hoạch; nếu thiếu thông tin nghiệp vụ thì trả lời bình thường để bổ sung, không cần nhập JSON hoặc tên node. File được đọc, chia đoạn và gắn bằng ID thật của workspace. Nhãn tài liệu dưới ô chat cho biết số đoạn và cách truy xuất. Lỗi đọc file/embedding hiện rõ; có thể giữ file và gửi lại sau khi sửa cấu hình.
5. Mở tab **Luồng thực hiện**. Với yêu cầu này, kế hoạch cần có truy xuất tài liệu, kiểm tra bằng chứng và nhánh trả lời/hỏi thêm. Tên/số bước có thể khác theo yêu cầu; không ép một số lượng node cố định. Khi đủ yêu cầu, graph được tạo tự động. Nút mở canvas ở Chat Thử Nghiệm cho phép developer kiểm tra graph thực tế.
6. Trong **Chat Thử Nghiệm**, hỏi lần lượt:

   ```text
   Tôi là Owner, muốn mời đồng đội vào DeskFlow. Phải làm ở đâu và lời mời có hiệu lực bao lâu?
   ```

   Kết quả phải dựa vào Cài đặt → Thành viên → Mời thành viên, nêu thời hạn 48 giờ theo tài liệu. Mở **Nguồn trích dẫn → Mở nguồn tham khảo** để đọc đúng đoạn đã dùng; nguồn yêu cầu đăng nhập.

   ```text
   Mã xác nhận đổi mật khẩu trong bản demo là gì?
   ```

   Tài liệu thử có mã **6314**; đây chỉ là dữ liệu giả định cho bài kiểm tra.

   ```text
   Hướng dẫn tính quỹ đạo neutrino liên thiên hà.
   ```

   Agent phải nói không tìm thấy hướng dẫn phù hợp hoặc ngoài phạm vi; không sáng tác câu trả lời chuyên môn từ tài liệu phần mềm.
7. Quay lại khung thiết kế và gửi:

   ```text
   Thêm một bước chuẩn hóa câu hỏi trước khi tìm tài liệu, giữ nguyên nguồn và các nhánh kiểm tra bằng chứng.
   ```

   Kiểm tra kế hoạch có bước mới và kết nối tương ứng, revision tăng và draft mới được tạo. Chat thử lại, rồi **F5**: tài liệu, kế hoạch và draft hiện tại vẫn phải đúng.

Giới hạn hiện tại: PDF có văn bản, DOCX, TXT/MD/CSV UTF-8; tối đa 5 MB/file, 5 file/lần, 10 nguồn/phiên và 200.000 ký tự/file. PDF ảnh quét cần OCR trước; không có OCR tự động. Kế hoạch hỗ trợ tối đa 12 bước xử lý bằng LLM, Agent, Retriever, Condition và Direct Reply. Các bước xuất Excel/file, Veo/video, vòng lặp hoặc kết nối ngoài chưa tích hợp phải xuất hiện là **còn thiếu tích hợp**, chặn build; không được nói đã tạo video/file khi chưa thực hiện. Tài liệu đính kèm là dữ liệu tham khảo, không phải lệnh quản trị hệ thống.

## Kịch bản demo cơ bản cũ

Kịch bản dưới đây chỉ kiểm tra chỉnh hướng dẫn, không nghiệm thu RAG hoặc workflow nhiều bước; dùng bài DeskFlow phía trên để thử tính năng mới.

Gửi lần lượt trong khung **Hội thoại Thiết kế Trợ lý**, chờ bot phản hồi sau mỗi tin:

```text
Tôi cần một trợ lý chăm sóc khách hàng cho cửa hàng phụ kiện điện thoại.
```

Bot hỏi tên và hướng dẫn còn thiếu. Tiếp tục:

```text
Đặt tên là Trợ lý cửa hàng An Tâm.
```

```text
Hướng dẫn: Trả lời bằng tiếng Việt, lịch sự và ngắn gọn. Cửa hàng mở cửa 8h–21h hằng ngày. Cho đổi sản phẩm lỗi trong 7 ngày khi còn hóa đơn. Nếu chưa có thông tin thì hỏi lại, không bịa chính sách.
```

Khi đủ tên, mục tiêu và hướng dẫn, hệ thống **tự tạo draft** và mở tab **Chat Thử Nghiệm**. Không cần bấm nút tạo Agentflow hay kéo thả node. Nếu cung cấp đủ thông tin ngay tin đầu, hệ thống cũng tự build.

Trong khung chat thử bên phải, hỏi:

```text
Cửa hàng mở cửa lúc nào? Tôi mua hàng lỗi 3 ngày trước thì đổi được không?
```

Quay lại khung thiết kế bên trái, gửi:

```text
Sửa hướng dẫn: Cửa hàng mở cửa 9h–22h hằng ngày; vẫn đổi hàng lỗi trong 7 ngày nếu còn hóa đơn. Giữ cách trả lời lịch sự, tối đa 3 câu.
```

Revision tăng và draft mới được tạo tự động. Hỏi lại giờ mở cửa ở khung chat thử: phải theo thông tin mới. Nhấn **F5**, mở tab Chat Thử Nghiệm và hỏi lại: phiên, tên, hướng dẫn và draft hiện tại vẫn đúng. Lưu URL có ID phiên để mở lại sau. Nút **+** tạo một phiên khác.

Khung trái thiết kế Agent; khung phải sử dụng Agent đã tạo. Cả hai nằm trên cùng trang. Canvas chỉ là công cụ xem graph cho developer.

## Khi gặp lỗi

- `Cổng 3037 đang bận` hoặc `8080 already in use`: dừng terminal cũ bằng Ctrl+C. Nếu muốn dùng cổng khác, đặt biến rồi chạy lại:

  ```powershell
  $env:BUILDER_PORT='3040'
  $env:BUILDER_UI_PORT='8081'
  node AI-Agent/scripts/run-builder.mjs
  ```

- Provider trả 401/403/404: kiểm tra key, tên model và Base URL. Provider ngoài cần hỗ trợ Chat Completions; các Agent sử dụng tool còn cần tool calling.
- Đổi model sau khi đã build: chat thử dùng profile hiện tại từ B-029-T02; graph đã lưu không bị ghi đè khi preview. Publish lưu snapshot cấu hình được dùng lúc phát hành.
- Gateway model chạy local: người quản trị đặt `BUILDER_ALLOW_LOCAL_MODEL=true` trước khi start. Không cần bật khi dùng OpenAI thông thường.
- Dữ liệu local nằm dưới `AI-Agent/.local/builder-runtime/` (DB, key mã hóa, log, storage); giữ cả DB và thư mục keys khi sao lưu. Các file này được Git ignore.
- Log báo thiếu native Couchbase có thể xuất hiện khi nạp node tùy chọn trên máy này; luồng ChatOpenAI đã được kiểm tra chạy được. Couchbase chưa được kiểm thử.

Máy từng có Windows bugcheck `0x133` khi build nặng. Quy trình trên chạy backend đã chuẩn bị và UI dev, không chạy full build. Chưa xác định được driver gây crash; không coi thay đổi script là đã sửa lỗi Windows.

## Trên checkout mới chưa có baseline

Cần Node 24, pnpm theo `packageManager`/engines và dependencies của monorepo. Chỉ trên môi trường đủ ổn định, chuẩn bị baseline bằng install frozen lockfile và build tuần tự, heap 4096 MB, Turbo concurrency 1. Máy hiện tại đã có baseline nên không cần làm lại bước nặng này để test UI.

## Phạm vi đã kiểm chứng

Browser Edge đã kiểm tra thu thập đa lượt, auto-build, runtime preview, sửa instructions và refresh bằng provider HTTP fixture cục bộ. Fixture chỉ phục vụ kiểm tra giao thức; không được đưa vào đường trả lời production. Chất lượng tiếng Việt với API key thật cần chạy kịch bản trên bằng tài khoản của bạn.

MCP có endpoint Streamable HTTP `POST /api/v1/agent-builder/mcp`, dùng phiên đăng nhập Flowise có quyền workspace, với 5 tool được chọn. Đây chưa phải toàn bộ REST API hay một dịch vụ OAuth cho client công khai. Xem [báo cáo nghiệm thu](plans/FINAL_ACCEPTANCE_REPORT.md) để biết các nhánh mở rộng chưa đạt nghiệm thu production.
