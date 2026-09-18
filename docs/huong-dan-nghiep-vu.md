# Hướng dẫn nghiệp vụ & quy tắc hệ thống

> Tài liệu này gom lại phần giải thích quy tắc, công thức và tham chiếu tiêu chí nghiệm thu mà trước đây
> hiển thị dưới dạng chữ nhỏ / hộp ghi chú trên giao diện. Giao diện giờ chỉ hiển thị dữ liệu và thao tác;
> muốn hiểu **vì sao** hệ thống xử lý như vậy thì đọc file này. Xem thêm `docs/demo-guide.md` (kịch bản demo,
> tài khoản) và `docs/app-map/001-system-overview.md` (kiến trúc).

## 1. Luồng nghiệp vụ & bàn giao (11 luồng)

| Luồng | Phân hệ | Các bước | Bàn giao (ai làm gì, tiếp theo là ai) |
|---|---|---|---|
| L1 | Kế hoạch & Ngân sách | Lập ngân sách → Phê duyệt → Kích hoạt → Theo dõi cam kết/thực chi → Phân tích chênh lệch | Trưởng bộ phận lập → CFO/CEO phê duyệt → hệ thống tự kích hoạt & cộng dồn cam kết/thực chi theo từng PO, JV → CFO đóng kỳ ngân sách. |
| L2 | Bán hàng | Báo giá → Đơn bán → Giao hàng → Hóa đơn → Thu tiền | NV Kinh doanh lập báo giá → TP Kinh doanh (hoặc GĐ chi nhánh) duyệt & xác nhận đơn → Thủ kho soạn hàng & giao → Kế toán trưởng phát hành hóa đơn → Thủ quỹ thu tiền → Kiểm toán nội bộ hậu kiểm phiếu thu. |
| L3 | Mua hàng | Đề nghị mua → Đơn mua → Nhập kho → Đối chiếu 3 chiều → Thanh toán | Nhân viên đề nghị mua → Trưởng bộ phận duyệt đề nghị → NV Mua hàng lập đơn → TP Mua hàng (hoặc GĐ chi nhánh) duyệt đơn → Thủ kho nhận hàng & QC kiểm tra → Kế toán đối chiếu 3 chiều → Kế toán trưởng/CFO duyệt ghi sổ & chi tiền → Thủ quỹ chi tiền → Kiểm toán nội bộ hậu kiểm. |
| L4 | Kho vận | Nhập kho → Lưu kho (FIFO theo lô) → Xuất giao hàng → Chuyển kho → Kiểm kê | Thủ kho lập phiếu nhập/xuất/chuyển/kiểm kê → QC kiểm tra hàng nhập → Trưởng kho (hoặc GĐ chi nhánh) duyệt chuyển kho & xuất giao hàng → Kế toán trưởng duyệt chênh lệch kiểm kê → Trưởng kho ghi nhận điều chỉnh. |
| L5 | Sản xuất | Lệnh sản xuất → Xuất vật tư theo BOM → Sản xuất → QC → Nhập thành phẩm | NV Kế hoạch SX lập lệnh → GĐ Sản xuất duyệt lệnh → Trưởng kho xuất vật tư theo BOM → NV Kế hoạch SX vận hành sản xuất → QC kiểm tra chất lượng → NV Kế hoạch SX đóng lệnh. |
| L6 | Nhân sự & Tiền lương | Tuyển dụng → Tiếp nhận → Tính lương → Duyệt → Hạch toán → Chi lương | Trưởng bộ phận đề nghị tuyển dụng → TP Nhân sự duyệt → Chuyên viên nhân sự tiếp nhận nhân viên & tính lương → CFO duyệt chi lương → Thủ quỹ chi lương. |
| L7 | Tài chính & Kế toán | Bút toán → Sổ cái → Công nợ → Thu/chi → Đối chiếu ngân hàng → Khóa sổ | Kế toán viên lập hóa đơn/bút toán/phiếu thu-chi → Kế toán trưởng duyệt ghi sổ & đối chiếu ngân hàng → CFO duyệt các khoản chi → Thủ quỹ thực hiện thu/chi → Kiểm toán nội bộ hậu kiểm → Kế toán trưởng khóa sổ kỳ. |
| L8 | Tài sản | Đề nghị mua sắm → Phê duyệt → Ghi tăng → Khấu hao → Thanh lý | Nhân viên/bộ phận đề nghị mua sắm → CFO phê duyệt → Kế toán ghi tăng tài sản & tính khấu hao hàng kỳ → CFO phê duyệt khi thanh lý. |
| L9 | Dịch vụ khách hàng | Ticket → Tự động phân công → Xử lý → Giải quyết → Đóng & CSAT | NV Kinh doanh/CSKH tạo ticket → hệ thống tự phân công cho NV CSKH đang ít việc nhất → NV CSKH xử lý & đề xuất giải quyết → TP CSKH đóng ticket & ghi nhận điểm hài lòng khách hàng. |
| L4 | Ngoại lệ | Nêu ngoại lệ → Xem xét → Phê duyệt (khác người nêu) → Xử lý → Đóng | Người phát hiện sai lệch (thường là Kế toán khi đối chiếu 3 chiều) nêu ngoại lệ → CFO xem xét & phê duyệt — bắt buộc khác người nêu → CFO ghi nhận nguyên nhân & hành động phòng ngừa để đóng. |
| L10 | Quản trị hệ thống | Người dùng & vai trò, phân quyền 3 tầng, rà soát quyền, dữ liệu chủ, kỳ kế toán, từ điển dữ liệu | Mọi thay đổi đều được ghi audit trail. |
| L11 | Báo cáo & KPI | Số liệu tính trực tiếp từ sổ cái, chứng từ, sổ kho | Luôn theo phạm vi dữ liệu và trường được phép của người xem. |

## 2. Quy tắc theo từng loại chứng từ

- **Ngân sách (BUDGET)**: ngân sách ở trạng thái Đang hoạt động (ACTIVE) dùng để kiểm soát PO — PO vượt ngân sách còn lại sẽ bị chặn khi gửi duyệt.
- **Đơn mua hàng (PO)**: người lập PO không được duyệt hay thanh toán cho chính PO đó (tách biệt nhiệm vụ).
- **Phiếu nhập kho (GRN)**: số lượng nhận không được vượt số lượng còn lại của PO.
- **Hóa đơn NCC (SINV)**: đối chiếu 3 chiều — số lượng hóa đơn ≤ số lượng đã nhập kho, đơn giá lệch PO ≤ 2%; lệch thì tạm giữ và tự tạo ngoại lệ. Đối chiếu dùng đơn giá chưa thuế; thuế GTGT (TK 1331 — thuế đầu vào được khấu trừ) cộng thêm khi ghi sổ công nợ.
- **Hóa đơn bán hàng (INV)**: chỉ xuất hóa đơn cho số lượng đã giao. Giá trị dòng chưa gồm thuế; thuế GTGT (TK 3331 — thuế đầu ra phải nộp) cộng thêm khi phát hành, tổng phải thu = tiền hàng + thuế.
- **Phiếu chi (PMT)**: 4 vai trò tách biệt — Kế toán lập → CFO duyệt → Thủ quỹ chi → Kiểm toán hậu kiểm.
- **Đơn bán hàng (SO)**: xác nhận đơn sẽ kiểm tra tồn kho khả dụng.
- **Phiếu kiểm kê (ADJ)**: nhập số lượng thực đếm; hệ thống tự tính chênh lệch so với sổ kho khi ghi nhận.
- **Lệnh sản xuất (WO)**: vật tư được tính tự động từ định mức (BOM).
- **Bút toán (JV)**: tổng Nợ phải bằng tổng Có; kỳ đã khóa sẽ chặn ghi sổ.
- **Ticket CSKH (TICKET)**: được tự động phân công cho nhân viên CSKH đang ít việc nhất.
- **Ngoại lệ (EXC)**: người phê duyệt ngoại lệ phải khác người nêu.
- **Thay đổi dữ liệu chủ (MDC)**: mọi thay đổi khách hàng/NCC/sản phẩm phải được một người khác phê duyệt trước khi áp dụng — dữ liệu chủ không được sửa trực tiếp.

## 3. Nguyên tắc kiểm soát nội bộ

- **Tách biệt nhiệm vụ (SoD)**: trên cùng một chứng từ (và chuỗi chứng từ liên quan), một người không được giữ hai vai trò xung đột trong nhóm Người đề xuất (REQUESTER) ≠ Người phê duyệt (APPROVER) ≠ Người thực hiện (EXECUTOR) ≠ Người kiểm tra (AUDITOR). Xung đột loại HARD bị chặn tuyệt đối, không có ngoại lệ. Cặp Người phê duyệt – Người kiểm tra không xung đột: người duyệt vẫn có thể hậu kiểm chứng từ khác, nhưng người thực hiện thì không. "Quyền chồng lấn" (cùng người có nhiều quyền Tạo/Duyệt/Thực hiện trên một loại chứng từ) không phải vi phạm — SoD được kiểm soát ở mức từng giao dịch cụ thể, không phải theo vai trò được cấp.
- **Một nghiệp vụ — một chủ sở hữu**: mỗi quy trình có đúng một chủ sở hữu, chịu trách nhiệm cuối cùng trong truy vết trách nhiệm (có thể có người thay thế).
- **Quyền = Hành động × Phạm vi dữ liệu × Trường**: Hành động là được làm gì (xem, tạo, sửa, duyệt, thực hiện, hậu kiểm, xuất dữ liệu); Phạm vi dữ liệu là thấy bản ghi nào (của tôi / phòng ban / chi nhánh / toàn công ty — nhiều vai trò thì lấy phạm vi rộng nhất); Trường là trường nào bị ẩn theo vai trò dù xem được chứng từ (ví dụ đơn giá, lương). Ma trận chỉ xem trên giao diện — sửa quyền thực hiện ở phân hệ Quản trị hệ thống và được ghi audit trail.
- **Trạng thái là hợp đồng**: mọi chuyển trạng thái chứng từ đều được kiểm tra bởi engine (quyền, điều kiện, SoD); chuyển trạng thái không có trong bảng cấu hình sẽ bị từ chối.
- **Không Shadow-IT**: mọi dữ liệu nghiệp vụ phải đi qua ERP, không dùng bảng tính/ứng dụng ngoài cho quy trình nghiệp vụ chính thức.
- **Audit trail bất biến**: bảng audit_trail chỉ cho phép INSERT — trigger chặn mọi UPDATE/DELETE. Mọi lượt vi phạm SoD bị chặn cũng được ghi vào đây (hành động `SOD_VIOLATION`).
- **Bàn giao (handoff)**: mỗi lần chứng từ chuyển sang trạng thái cần bộ phận khác xử lý, hệ thống tự tạo bản ghi bàn giao kèm hạn SLA.

## 4. Vận hành

- **Kỳ kế toán** có 3 trạng thái: *Đang mở* (mọi chứng từ được ghi sổ vào kỳ), *Khóa sơ bộ* (chỉ cho phép bút toán điều chỉnh — JV — để rà soát cuối kỳ), *Khóa sổ* (chặn mọi ghi sổ, không thể mở lại). Quy trình đóng kỳ: Khóa sơ bộ → Rà soát & điều chỉnh → Khóa sổ → Lập báo cáo.
- **Khấu hao TSCĐ**: phương pháp đường thẳng — khấu hao tháng = nguyên giá / số tháng khấu hao (làm tròn đến đồng), không vượt quá giá trị còn lại. Mỗi tài sản chỉ được khấu hao một lần mỗi kỳ; kỳ đã khóa sổ sẽ bị từ chối. Tạo bút toán (JV) Nợ 642 / Có 214 cho mọi tài sản đang sử dụng, rồi gửi duyệt theo quy trình bút toán thông thường.
- **Tính lương**: Thu nhập = Lương CB × (ngày công / 22) + phụ cấp. BHXH người lao động = 10,5% lương CB. Thuế TNCN tính lũy tiến sau giảm trừ bản thân 11 triệu và 4,4 triệu/người phụ thuộc. Thực lĩnh = Thu nhập − BHXH − Thuế. Nhập ngày công khác chuẩn theo định dạng mỗi dòng `mã NV: số ngày` (ví dụ `NV101: 20`).
- **Rà soát quyền định kỳ**: hệ thống chụp danh sách toàn bộ vai trò đang cấp → người lập đánh dấu Giữ/Thu hồi từng dòng → gửi duyệt → khi được duyệt, các quyền bị đánh dấu thu hồi sẽ được gỡ tự động và lưu vết đầy đủ.
- **Báo cáo lãi gộp**: doanh thu tính theo hóa đơn bán hàng đã phát hành (TK 511); giá vốn tính theo lô FIFO đã xuất giao (TK 632) trong cùng kỳ — khớp với báo cáo tài chính.
- **Hàng đợi email**: mọi thông báo trong ứng dụng cũng được đưa vào hàng đợi email. Nếu đã cấu hình nhà cung cấp (biến môi trường `RESEND_API_KEY`) thư sẽ được gửi thật; nếu chưa, thư được đánh dấu "Mô phỏng" để vẫn xem được nội dung sẽ gửi. Hàng đợi được xử lý tự động 1 lần/ngày lúc 3h sáng (giới hạn của gói Vercel Cron miễn phí), hoặc bấm "Gửi ngay" / mở chuông thông báo để xử lý ngay.

## 5. Ba đường truy vết

- **Theo dòng tiền**: Phiếu chi → Hóa đơn NCC → Đơn mua hàng → Đề nghị mua → Ngân sách, kèm bút toán sổ cái và kiểm tra số tiền khớp ở mỗi cấp.
- **Theo dòng hàng**: Phiếu xuất giao → Lô tồn kho (FIFO) → Phiếu nhập kho → Đơn mua hàng → Đề nghị mua, và chiều ngược lại (hàng nhập đi đâu). Đảm bảo không có hàng "ảo".
- **Theo trách nhiệm**: Hành động → Người dùng → Vai trò → Phòng ban → Chủ sở hữu quy trình; phát hiện xung đột SoD.

## 6. Nghiệm thu (test acceptance)

Kế hoạch nghiệm thu gồm 63 bài kiểm thử chia 5 nhóm: Chức năng (15), Kiểm soát (12), Truy vết (12), Luồng đầu-cuối (12), Tải & trường hợp biên (12). Mỗi bài gắn với một luồng nghiệp vụ (L1–L11).

4 bài kiểm tra tách biệt nhiệm vụ (T3.1–T3.4) là **điều kiện chặn tuyệt đối** để go-live — phải đạt 100%, không có ngoại lệ:
cùng một người không thể vừa tạo vừa duyệt, vừa duyệt vừa thanh toán, hay vừa tạo vừa thanh toán trên cùng một PO; và mọi lượt thử vi phạm đều được ghi log.

Chạy bộ kiểm thử tự động bằng `npm run test:acceptance` (chạy trong transaction rồi rollback, không đổi dữ liệu thật); kết quả và bằng chứng cập nhật thủ công trong trang Nghiệm thu (dành cho kiểm toán nội bộ / người có phạm vi toàn công ty).

## 7. Vai trò và mã module (tham chiếu nội bộ)

Các mã như `L1`–`L11` (luồng), `BM-01`…`BM-14` (biểu mẫu) và `T1.1`…`T5.12` (mã bài kiểm thử) là mã tham chiếu nội bộ dùng trong tài liệu kế hoạch dự án (`CLAUDE.md`), không hiển thị trên giao diện người dùng nữa. Cần tra cứu chi tiết thì xem `CLAUDE.md` ở gốc dự án.
