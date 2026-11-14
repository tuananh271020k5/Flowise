/**
 * Bộ tài liệu thử nghiệm mẫu có bản quyền và nguồn gốc rõ ràng (PH4-T01).
 * Cung cấp tài liệu tri thức nội bộ về quy chế công ty để làm cơ sở tri thức cho Knowledge Agent.
 */

export interface KnowledgeDocumentFixture {
    id: string
    title: string
    category: string
    metadata: {
        sourceUri: string
        owner: string
        department: string
        effectiveDate: string
        version: string
        accessLevel: 'internal' | 'confidential' | 'public'
    }
    content: string
    chunks: string[]
    goldenQAPairs: Array<{
        question: string
        expectedAnswerKeywords: string[]
        expectedSourceDocId: string
    }>
}

export const COMPANY_POLICY_FIXTURE: KnowledgeDocumentFixture = {
    id: 'doc-company-policy-2026',
    title: 'Quy Chế Hoạt Động & Phúc Lợi Nhân Viên Năm 2026',
    category: 'Chính sách nhân sự',
    metadata: {
        sourceUri: 'file:///internal/hr/policy_2026.pdf',
        owner: 'Phòng Nhân Sự (HR Department)',
        department: 'Nhân sự & Vận hành',
        effectiveDate: '01/01/2026',
        version: '2.0',
        accessLevel: 'internal'
    },
    content: `
# QUY CHẾ HOẠT ĐỘNG & PHÚC LỢI NHÂN VIÊN 2026

## 1. Thời Gian Làm Việc & Làm Việc Từ Xa (Remote / Hybrid)
- Giờ làm việc tiêu chuẩn: Từ 08:30 đến 17:30, thứ Hai đến thứ Sáu (nghỉ trưa 12:00 - 13:00).
- Chế độ làm việc linh hoạt (Hybrid): Mỗi nhân viên chính thức được phép đăng ký làm việc từ xa tối đa 02 ngày/tuần sau khi thông báo và được quản lý trực tiếp phê duyệt trước ít nhất 24 giờ.
- Thiết bị làm việc: Công ty cấp máy tính xách tay và hỗ trợ phụ cấp internet 500.000 VNĐ/tháng cho nhân sự làm việc hybrid.

## 2. Chế Độ Nghỉ Phép & Nghỉ Lễ
- Phép năm: Nhân viên chính thức có 14 ngày phép năm có hưởng lương/năm. Cứ mỗi 03 năm làm việc liên tục được cộng thêm 01 ngày phép.
- Phép ốm đau: Nghỉ ốm có giấy xác nhận của cơ sở y tế được hưởng 75% lương theo quy định BHXH, và công ty hỗ trợ thêm 25% lương cơ bản tối đa 05 ngày/năm.
- Nghỉ sinh nhật: Nhân viên được nghỉ hưởng nguyên lương 01 ngày trong tháng sinh nhật của mình.

## 3. Bảo Hiểm Sức Khỏe & Chăm Sóc Y Tế
- Ngoài BHXH, BHYT bắt buộc, nhân viên chính thức được cấp gói Bảo hiểm sức khỏe tư nhân Bảo Việt Healthcare với hạn mức nội trú lên tới 100.000.000 VNĐ/năm và ngoại trú 15.000.000 VNĐ/năm.
- Khám sức khỏe định kỳ: Tổ chức vào Quý 3 hàng năm tại các bệnh viện quốc tế liên kết.

## 4. Bảo Mật Thông Tin & Dữ Liệu
- Tất cả dữ liệu khách hàng, mã nguồn phần mềm và tài liệu thiết kế đều thuộc quyền sở hữu độc quyền của công ty.
- Nghiêm cấm tải mã nguồn hoặc dữ liệu nhạy cảm lên các dịch vụ đám mây cá nhân chưa được IT phê duyệt.
- Vi phạm chính sách bảo mật thông tin có thể dẫn đến xử lý kỷ luật mức cao nhất là sa thải và truy cứu trách nhiệm dân sự.
`.trim(),
    chunks: [
        'Thời gian làm việc tiêu chuẩn: 08:30 đến 17:30 từ thứ Hai đến thứ Sáu. Chế độ Hybrid: làm việc từ xa tối đa 02 ngày/tuần, báo trước 24 giờ cho quản lý. Phụ cấp internet 500.000 VNĐ/tháng.',
        'Chế độ nghỉ phép: 14 ngày phép năm cho nhân viên chính thức. Cứ mỗi 3 năm làm việc được cộng thêm 1 ngày. Nghỉ ốm có hỗ trợ thêm của công ty tối đa 5 ngày/năm. Được nghỉ 1 ngày có lương trong tháng sinh nhật.',
        'Bảo hiểm sức khỏe: Bảo hiểm Bảo Việt Healthcare hạn mức nội trú 100 triệu VNĐ/năm, ngoại trú 15 triệu VNĐ/năm. Khám sức khỏe định kỳ Quý 3 hàng năm.',
        'Chính sách bảo mật: Toàn bộ mã nguồn và dữ liệu khách hàng thuộc quyền sở hữu của công ty. Cấm tải lên đám mây cá nhân. Vi phạm có thể bị sa thải.'
    ],
    goldenQAPairs: [
        {
            question: 'Một tuần tôi được làm việc từ xa (remote) mấy ngày?',
            expectedAnswerKeywords: ['tối đa 02 ngày', 'phê duyệt', '24 giờ'],
            expectedSourceDocId: 'doc-company-policy-2026'
        },
        {
            question: 'Nhân viên chính thức có bao nhiêu ngày phép năm?',
            expectedAnswerKeywords: ['14 ngày', 'phép năm'],
            expectedSourceDocId: 'doc-company-policy-2026'
        },
        {
            question: 'Hạn mức bảo hiểm sức khỏe nội trú là bao nhiêu?',
            expectedAnswerKeywords: ['100.000.000', 'Bảo Việt'],
            expectedSourceDocId: 'doc-company-policy-2026'
        }
    ]
}
