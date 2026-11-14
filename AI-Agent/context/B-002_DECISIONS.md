# B-002 — Quyết định phạm vi Demo, Provider, Phân quyền và Ranh giới License

**Ngày hoàn tất:** 14/11/2026
**Phạm vi:** PH0-T07–T08 (hoàn thành Phase 0 Baseline).
**Phụ thuộc:** [TASK-001](../tasks/TASK-001.md) và bằng chứng [TASK-001_RUNTIME.md](TASK-001_RUNTIME.md).

---

## 1. Trợ lý Demo và Ba kịch bản Hội thoại / Kiểm tra (PH0-T07)

### 1.1. Lựa chọn Assistant Demo

-   **Tên trợ lý:** Trợ lý Onboarding tiếng Việt (_Onboarding Assistant_).
-   **Mục tiêu:** Hướng dẫn nhân viên mới tiếp cận quy trình tiếp nhận, văn hóa công ty, nội quy hành chính, nhận bàn giao thiết bị công nghệ và các kênh liên lạc nội bộ một cách tuần tự, rõ ràng và thân thiện.
-   **Lý do lựa chọn:**
    -   Quy trình onboarding có cấu trúc rõ ràng, logic từng bước, dễ xác định tính đúng/sai (deterministic assertions).
    -   Không đòi hỏi kết nối dữ liệu bảo mật cao cấp (SQL, SharePoint, ERP) ngay ở giai đoạn D1.
    -   Phù hợp nhất để chứng minh trọn vẹn luồng giá trị cho sếp: **Hội thoại thu thập yêu cầu → Tự động sinh draft Flowise → Chạy thử có kiểm soát → Chỉnh sửa cấu hình qua chat**.

### 1.2. Ba Kịch bản Chi tiết

#### Kịch bản 1: Tạo mới Assistant qua Chat Hội thoại (Create via Conversational Builder)

-   **Mục đích:** Chứng minh khả năng thu thập yêu cầu đa lượt, tự nhận diện thiếu sót dữ kiện và tự động build flow khi đạt trạng thái `buildReady`.
-   **Hội thoại khởi tạo:**
    -   _User:_ "Tôi muốn tạo một trợ lý hướng dẫn nhân viên mới về văn hóa và nội quy công ty bằng tiếng Việt."
    -   _Builder Collector:_ Nhận diện thiếu thông tin cốt lõi (giọng điệu, đối tượng trọng tâm, phạm vi hướng dẫn).
    -   _Builder phản hồi:_ "Chào bạn! Mình có thể giúp bạn tạo trợ lý Onboarding. Để trợ lý hoạt động tốt nhất, bạn muốn: (1) Giọng điệu thân thiện hay trang trọng chuyên nghiệp? (2) Cần tập trung vào quy trình ngày đầu tiên hay toàn bộ tuần đầu tiên?"
-   **Hội thoại bổ sung:**
    -   _User:_ "Giọng điệu thân thiện, nhiệt tình. Tập trung vào quy trình ngày đầu tiên: điểm danh check-in, nhận máy tính làm việc và các kênh liên lạc nội bộ."
-   **Hành vi hệ thống:**
    -   Collector sinh `AgentSpec` hợp lệ (`schemaVersion: "1.0"`, `kind: "assistant"`, `name: "Trợ lý Onboarding"`, `specReady: true`, `buildReady: true`).
    -   Kích hoạt build pipeline, tự động biên dịch `AgentPlan` thành JSON draft Agentflow V2 (`Start node v1.4` + node model/reply).
    -   Trả về mã định danh `flowId` và `draftRevision: 1`, thông báo hoàn thành trên UI Chat.

#### Kịch bản 2: Chạy thử có kiểm soát (Controlled Test / Preview Panel)

-   **Mục đích:** Kiểm tra khả năng phản hồi thực tế của draft vừa tạo trong môi trường sandbox được bảo vệ, có assertion đánh giá kết quả tự động.
-   **Hành vi thực hiện:**
    -   Người dùng chuyển sang tab "Chat thử nghiệm với Draft" (gọi qua endpoint preview nội bộ có xác thực).
    -   _Prompt thử nghiệm:_ "Chào bạn, hôm nay là ngày đầu tiên tôi đi làm tại công ty. Tôi cần chuẩn bị những gì và gặp ai?"
-   **Tiêu chí đánh giá (Assertions):**
    -   Trả lời 100% bằng tiếng Việt chuẩn mực.
    -   Giọng văn chào đón, ấm áp, đúng định hướng "thân thiện, nhiệt tình".
    -   Liệt kê đầy đủ 3 bước chính: (1) Check-in lễ tân/HR, (2) Nhận máy tính bàn giao từ bộ phận IT, (3) Tham gia nhóm chat nội bộ.
    -   Không xuất hiện hallucination về link bên ngoài hoặc thông tin nhạy cảm chưa được định nghĩa.
-   **Kết quả:** Hiển thị nhãn `Test Passed` trên UI cùng thời gian thực thi và chi tiết phản hồi.

#### Kịch bản 3: Chỉnh sửa Cấu hình qua Chat và Quản lý Revision (Chat Edit & Revisioning)

-   **Mục đích:** Chứng minh tính năng sửa đổi Agent hoàn toàn bằng ngôn ngữ tự nhiên không cần kéo thả node, duy trì tính bất biến của revision.
-   **Hội thoại chỉnh sửa:**
    -   _User (tại tab Builder):_ "Hãy đổi giọng văn sang chuyên nghiệp, trang trọng hơn và thêm lưu ý nghiêm ngặt về việc bảo mật thông tin nội bộ, tuyệt đối không gửi tài liệu dự án ra ngoài."
-   **Hành vi hệ thống:**
    -   Collector phân tích diff yêu cầu, áp dụng bản vá (`spec patch`):
        -   `instructions`: Cập nhật phong cách "chuyên nghiệp, trang trọng" + bổ sung quy tắc "bảo mật thông tin nội bộ".
        -   Tăng `specRevision` lên `2`.
    -   Compiler biên dịch lại và tạo `draftRevision: 2` (không ghi đè draft cũ, giữ lịch sử snapshot).
    -   UI hiển thị bản tóm tắt diff cấu hình (Side-by-side diff hoặc tóm lược thay đổi).
    -   Chat thử lại tại Preview Panel với cùng câu hỏi ở Kịch bản 2 để xác minh giọng văn đã đổi sang phong cách chuyên nghiệp và có điều khoản bảo mật.
    -   Hỗ trợ nút `Khôi phục Revision 1` nếu người dùng muốn hoàn tác.

---

## 2. Model và Provider Profile Môi trường Thử Nghiệm

### 2.1. Cấu hình Profile

-   **Logical Profile Reference:** `default-builder-model`.
-   **Lựa chọn Provider:**
    1. _Chế độ Cloud chính thức (Khuyến nghị cho Demo):_ OpenAI (`gpt-4o` hoặc `gpt-4o-mini`) hoặc Google Gemini (`gemini-1.5-flash` / `gemini-2.0-flash`) thông qua ChatModel node chuẩn của Flowise.
    2. _Chế độ Offline / Local (Zero Cost, No Network):_ Ollama với model `llama3.1:8b` hoặc `qwen2.5:7b` chạy cục bộ trên máy host.
    3. _Chế độ Deterministic Mock / Direct Reply (Harness & CI):_ Direct Reply runner (như đã chứng minh trong TASK-001) phục vụ smoke test và kiểm tra tích hợp kiến trúc không phụ thuộc mạng.

### 2.2. Quản lý Credential & Bí mật

-   **Nguyên tắc an toàn:** Tuyệt đối KHÔNG lưu API key, token hoặc secret vào git repository, shared state JSON, hay tài liệu giao tiếp AI.
-   **Lưu trữ:**
    -   Môi trường dev/test cục bộ: Sử dụng biến môi trường trong file `.env` (được đưa vào `.gitignore`) hoặc Flowise Credential Manager (được mã hóa với khóa riêng tại `SECRETKEY_PATH`).
    -   Phân quyền nắm giữ: Chủ sở hữu môi trường kiểm thử (DevOps / Người chạy máy local) nắm giữ key; AI chỉ tham chiếu đến Credential ID hoặc env variable name.
-   **Trạng thái:** `needs_input` về provider cloud cụ thể và API key khi bước vào Phase 3 (Demo). Ở Phase 1 và Phase 2, compiler và harness sử dụng mock/fixture để xác minh contract.

---

## 3. Ma trận Phân quyền Actor, Workspace và Bảo mật Draft (PH0-T08)

### 3.1. Ma trận Phân quyền (RBAC Matrix)

| Quyền hạn / Thao tác                             |    Admin     |    Builder (Creator)     | Viewer / Consumer |    Anonymous    |
| :----------------------------------------------- | :----------: | :----------------------: | :---------------: | :-------------: |
| Tạo Session Chat Builder (`POST /sessions`)      | **Cho phép** |       **Cho phép**       |   Từ chối (403)   |  Từ chối (401)  |
| Gửi tin nhắn & Thu thập Spec (`POST /messages`)  | **Cho phép** | **Cho phép** (chính chủ) |   Từ chối (403)   |  Từ chối (401)  |
| Kích hoạt Tự động Build Draft (`POST /builds`)   | **Cho phép** | **Cho phép** (chính chủ) |   Từ chối (403)   |  Từ chối (401)  |
| Chạy thử có kiểm soát (`POST /drafts/:id/tests`) | **Cho phép** |  **Cho phép** (cùng WS)  |   Từ chối (403)   |  Từ chối (401)  |
| Xem trực tiếp Canvas V2 (`/v2/agentcanvas/:id`)  | **Cho phép** |  **Cho phép** (cùng WS)  |   Từ chối (403)   |  Từ chối (401)  |
| Chỉnh sửa / Khôi phục Revision                   | **Cho phép** | **Cho phép** (chính chủ) |   Từ chối (403)   |  Từ chối (401)  |
| Phát hành Agent vào Production (Publish Gate)    | **Cho phép** |  Tùy chính sách tổ chức  |   Từ chối (403)   |  Từ chối (401)  |
| Chat với Agent Production (End-User Chat)        | **Cho phép** |       **Cho phép**       |   **Cho phép**    | Tùy flow public |

### 3.2. Ràng buộc Phạm vi Workspace & Tổ chức (Server-Side Enforcement)

-   Mọi dữ liệu về Builder (Session, Message, SpecRevision, DraftFlow) bắt buộc phải gắn với `organizationId` và `workspaceId` trích xuất từ phiên đăng nhập (`req.user`) của server Flowise.
-   Server-side validation cấm nhận hoặc ghi đè `workspaceId` từ body của request client.
-   Truy vấn chéo workspace phải bị chặn với mã lỗi HTTP 403 Forbidden.

### 3.3. Hướng Xử lý Lỗ hổng Prediction Công khai của Draft

-   **Vấn đề thực tế (Phát hiện từ TASK-001):**
    -   Endpoint `/api/v1/prediction/:id` thuộc `WHITELIST_URLS` trong server Flowise gốc (`packages/server/src/utils/constants.ts`).
    -   Do đó, bất kỳ ai biết `id` của draft flow đều có thể gửi query và nhận prediction ẩn danh (HTTP 200), ngay cả khi `deployed=false` và `isPublic=false`. Cờ `deployed` chỉ có tác dụng ẩn khỏi danh sách UI công khai, không chặn gọi runtime!
-   **Giải pháp bảo vệ áp dụng cho Builder:**
    1. **Tách riêng Endpoint Preview đã Xác thực:**
        - Tạo endpoint chuyên biệt: `POST /api/v1/agent-builder/drafts/:id/tests` hoặc `.../preview`. Endpoint này nằm ngoài `WHITELIST_URLS`, bắt buộc kiểm tra session JWT và quyền truy cập workspace tương ứng.
    2. **Chặn Gọi Ẩn danh vào Draft tại Prediction Middleware:**
        - Tại bộ điều khiển `/api/v1/prediction/:id`: Kiểm tra trạng thái của chatflow. Nếu flow là draft (`isDraft === true` hoặc chưa có bản ghi publish hợp lệ), chặn ngay các request ẩn danh không có internal session hoặc API key hợp lệ với mã lỗi HTTP 401/403.
    3. **Giới hạn Ngân sách Chạy thử:**
        - Thiết lập giới hạn execution budget (tối đa 30 giây timeout, chặn các vòng lặp vô hạn và kiểm soát số token) cho mọi lượt chạy thử nghiệm của draft.

---

## 4. Kiểm kê Mã nguồn, Tài sản, Giấy phép (License) và Rủi ro Advisory (PH0-T08)

### 4.1. Kiểm kê Thành phần Dùng lại & Phạm vi Giấy phép

| Thành phần               | Thư mục mã nguồn                                                  |       Giấy phép        | Điều kiện và Giới hạn Áp dụng                                                                                                                                                                                                                                                                                                          |
| :----------------------- | :---------------------------------------------------------------- | :--------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flowise Core Server**  | `packages/server/src` (ngoài thư mục enterprise)                  |     **Apache 2.0**     | Tự do sử dụng, chỉnh sửa, đóng gói nội bộ. Giữ nguyên copyright notice của FlowiseAI, Inc.                                                                                                                                                                                                                                             |
| **Agentflow V2 Runtime** | `packages/server/src/utils/buildAgentflow.ts`, `buildChatflow.ts` |     **Apache 2.0**     | Tái sử dụng trọn vẹn engine chạy đồ thị V2 mà không cần viết lại runtime mới.                                                                                                                                                                                                                                                          |
| **Flowise UI & Canvas**  | `packages/ui/src`                                                 |     **Apache 2.0**     | Tái sử dụng layout, components, API client hiện có; tích hợp trang Chat Builder mới vào routes.                                                                                                                                                                                                                                        |
| **Components & Nodes**   | `packages/components`                                             |     **Apache 2.0**     | Tái sử dụng node metadata, Start node v1.4, Agent node, ChatModels. Tránh các node có native dependency lỗi trên Windows (như Couchbase).                                                                                                                                                                                              |
| **Agentflow Core Types** | `packages/agentflow`                                              |     **Apache 2.0**     | Tái sử dụng type definitions và serialization logic cho flow graph.                                                                                                                                                                                                                                                                    |
| **Enterprise Modules**   | `packages/server/src/enterprise/`, `IdentityManager.ts`           | **Commercial License** | **Ranh giới:** Thư mục này chỉ áp dụng cho thử nghiệm cục bộ (development & testing); cấm khai thác thương mại production nếu không có subscription FlowiseAI. **Builder quyết định không phụ thuộc vào các tính năng riêng của Enterprise** (như Stripe, Cloud SSO enterprise) để đảm bảo tính độc lập và sạch giấy phép cho tổ chức. |

### 4.2. Quản lý Fork, EOL và Trách nhiệm Bảo mật (Advisory)

-   **Tình trạng Upstream:** Kho lưu trữ gốc `FlowiseAI/Flowise` đã chính thức lưu trữ (archived) và kết thúc vòng đời (EOL) vào tháng 08/2026. Sẽ không có bản cập nhật hay bản vá bảo mật nào từ upstream.
-   **Quyền Sở hữu Fork:** Fork tại `origin: https://github.com/tuananh271020k5/Flowise.git` do **Nguyễn Tuấn Anh** (`baoawm2@gmail.com`) làm chủ sở hữu và chịu trách nhiệm kỹ thuật.
-   **Chính sách Bản vá Bảo mật (Advisories):**
    -   Giữ nguyên `pnpm-lock.yaml` cố định (`--frozen-lockfile`) để tránh rủi ro vỡ dependency ngầm.
    -   Khi phát hiện CVE mức độ High/Critical trên các package trọng yếu (Express, TypeORM, Axios, JWT), chủ sở hữu fork sẽ thực hiện backport bản vá hoặc override phiên bản độc lập theo quy trình `GIT_WORKFLOW.md`.
    -   Môi trường build và chạy thử nghiệm được cô lập trong mạng nội bộ, hạn chế mở cổng trực tiếp ra Internet.

---

## 5. Cập nhật Kế hoạch Kiểm thử và Tiêu chí Gate D1

### 5.1. Định nghĩa Gate D1 (Mốc Nghiệm thu Demo Sếp)

-   **Mục tiêu:** 36 task thuộc Phase 0 đến Phase 3 (PH0–PH3) hoàn thành nghiệm thu.
-   **Tiêu chí biểu diễn:** Người dùng và sếp có thể trực tiếp:
    1. Mở trang Chat Builder tiếng Việt.
    2. Gõ yêu cầu tạo Trợ lý Onboarding.
    3. Trả lời câu hỏi làm rõ của hệ thống.
    4. Hệ thống tự động biên dịch và tạo Draft Agentflow V2 trên Flowise.
    5. Chuyển sang khung chat thử và kiểm tra phản hồi đạt chuẩn.
    6. Yêu cầu sửa đổi phong cách/nội dung qua chat và nhận draft revision mới mà không chạm vào canvas.
-   **Không nằm trong Gate D1:** Chưa cần tích hợp SharePoint, SQL DB thật, Word generation hay các công cụ phức tạp ngoài luồng assistant cơ bản.

### 5.2. Kế hoạch Xử lý các Hạng mục Chưa kiểm chứng từ TASK-001

1. **Kiểm tra LLM Provider Thật:** Sẽ thực hiện trong Phase 3 ngay khi người dùng cấp cấu hình API key hoặc kết nối Ollama local.
2. **Kiểm tra Cách ly Chéo Workspace:** Viết unit & integration tests trong Phase 1 (PH1-T05) để chứng minh request với token workspace A không thể truy cập draft thuộc workspace B.
3. **Couchbase Native Node:** Giữ nguyên trạng thái ghi nhận lỗi native build trên Windows; node này không nằm trong danh mục allowlist của Builder nên không ảnh hưởng đến luồng Onboarding Assistant.
