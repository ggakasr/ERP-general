# Hướng dẫn demo ERP General

Mật khẩu mọi tài khoản: `Demo@123` (đăng nhập bằng `tên` hoặc `tên@erp.demo`, hoặc bấm tài khoản ở trang đăng nhập).

**Chia sẻ link công khai (Vercel, v.v.)?** Trang đăng nhập hiện mật khẩu dùng chung và cho phép vào thẳng
mọi vai trò kể cả CEO/CFO — chỉ phù hợp khi biết rõ ai sẽ xem link. Nếu chia sẻ rộng rãi, đặt biến môi trường
`DEMO_GATE_CODE` (xem `.env.local.example`) để bật lớp hỏi mã truy cập trước khi thấy trang đăng nhập
(`src/app/gate`). Không đặt biến này thì hành vi giữ nguyên như hiện tại.

## "Việc của ai, tiếp theo là ai" — luôn hiển thị sẵn trên UI

Mọi trang chứng từ đều tự tính (từ `state_transitions` + `permission_matrix`, không hard-code) và hiển thị:
- Banner đầu trang: **"Đang chờ xử lý: <vai trò>"** hoặc **"Đã kết thúc luồng xử lý"**.
- Mỗi nút hành động: di chuột vào để thấy **"Sau khi xác nhận, việc chuyển cho: <vai trò>"**; hộp thoại xác nhận cũng nhắc lại.
- Tab **Máy trạng thái**: từng bước ghi rõ vai trò phụ trách.
- Đầu mỗi trang phân hệ (Bán hàng, Mua hàng, Kho, …): dòng **"Việc của ai, tiếp theo là ai"** tóm tắt cả luồng.

## Tài khoản & quyền

| Tài khoản | Vai trò | Phạm vi nổi bật |
|---|---|---|
| `ceo` | Tổng giám đốc | Xem toàn công ty, KPI, duyệt ngân sách |
| `cfo` | Giám đốc tài chính | Duyệt chi, lương, tài sản, ngoại lệ, dữ liệu chủ, ngân sách |
| `ketoantruong` | Kế toán trưởng | Ghi sổ hóa đơn/bút toán, duyệt kiểm kê, khóa sổ |
| `ketoan` / `ketoan.hcm` | Kế toán viên HN / HCM | Lập hóa đơn, phiếu chi/thu, JV — chỉ **chi nhánh** của mình |
| `thuquy` | Thủ quỹ | Thực hiện chi/thu tiền |
| `kiemtoan` | Kiểm toán nội bộ | Xem toàn bộ, hậu kiểm, audit trail, nhật ký SoD |
| `admin` | Quản trị hệ thống | Phân quyền, rà soát quyền — **không xem được chứng từ** |
| `muahang.tp` / `muahang` | TP / NV Mua hàng | Duyệt / lập PO |
| `kho.tp` / `kho` | Trưởng kho / Thủ kho | Nhập-xuất kho; thủ kho **không thấy giá** |
| `sanxuat.gd` / `sanxuat` / `qc` | GĐ SX / Kế hoạch SX / QC | Duyệt PR & lệnh SX / lập PR, WO / kiểm tra chất lượng |
| `kinhdoanh.tp` / `kinhdoanh` / `kinhdoanh2` | TP / NV Kinh doanh | NV chỉ thấy **chứng từ của mình** |
| `nhansu.tp` / `nhansu` | TP / Chuyên viên nhân sự | Duyệt tuyển dụng / tính lương |
| `cskh.tp` / `cskh` / `cskh2` | TP / NV CSKH | Phân công & đóng / xử lý ticket được giao |
| `gd.hcm`, `kinhdoanh.hcm`, `kho.hcm`, `ketoan.hcm` | Chi nhánh HCM | GĐ chi nhánh quyền rộng nhưng **vẫn bị SoD chặn** |

**Phạm vi chi nhánh HCM (thiết kế có chủ đích):** HCM chỉ có 4 phòng (Ban giám đốc, Kế toán, Kinh doanh, Kho vận) —
**không có Mua hàng / Sản xuất / QC**, nên không thể chạy trọn vẹn Kịch bản 1 (Procure-to-Pay) hay lệnh sản xuất
chỉ trong phạm vi HCM. HCM nhận hàng qua **chuyển kho nội bộ từ HN** (ST), không nhận thẳng từ NCC — vì vậy phiếu
nhập kho (GRN, cần QC kiểm tra) không phát sinh ở HCM. Các vai trò công ty (CEO, CFO, Kế toán trưởng, Thủ quỹ,
Kiểm toán, Quản trị hệ thống) có phạm vi COMPANY nên vẫn xử lý được chứng từ của HCM.

## Kịch bản 1 — Procure-to-Pay trọn vẹn (≈10 phút)

1. `sanxuat` → Mua hàng → **Tạo Đề nghị mua hàng** (ví dụ 50 lít sơn) → mở chứng từ → **Gửi duyệt**.
2. `sanxuat.gd` → Việc cần làm → **Phê duyệt**.
3. `muahang` → mở PR → **Lập đơn mua hàng** (chọn NCC, kho) → **Gửi duyệt**.
4. `muahang.tp` → **Phê duyệt** (hệ thống kiểm tra & cam kết ngân sách Sản xuất). `muahang` → **Gửi NCC** → **NCC xác nhận**.
5. `kho` → mở PO (không thấy giá) → **Lập phiếu nhập kho**. `qc` → **Kiểm tra chất lượng**. `kho.tp` → **Nhập kho** (sinh lô FIFO + bút toán Nợ 152/Có 3388).
6. `ketoan` → mở PO → **Nhập hóa đơn NCC** → **Đối chiếu 3 chiều**. Thử sửa đơn giá lệch >2% để thấy hóa đơn bị **tạm giữ** và **ngoại lệ tự tạo**.
7. `ketoantruong` → **Ghi sổ công nợ**. `ketoan` → **Đề nghị thanh toán** → gửi duyệt. `cfo` → **Phê duyệt chi**. `thuquy` → **Thực hiện chi tiền**. `kiemtoan` → **Hậu kiểm**.
8. Trên phiếu chi bấm **Truy vết tiền / hàng / trách nhiệm**.

## Kịch bản 2 — Thấy SoD hoạt động (T3.1–T3.4)

- `muahang.tp` → Việc cần làm → `PO-202609-00002` (chính mình lập) → **Phê duyệt**: hộp thoại cảnh báo trước, xác nhận thì bị chặn.
- `gd.hcm` → `PO-202609-00001` → **Phê duyệt**: giám đốc chi nhánh có quyền duyệt nhưng vẫn bị chặn vì là người lập.
- `kiemtoan` → Kiểm soát nội bộ → **Nhật ký SoD**: thấy từng lần thử, người, vai trò xung đột.

## Kịch bản 3 — Phạm vi dữ liệu & ẩn trường (T2.2–T2.5)

- `kinhdoanh` và `kinhdoanh2` chỉ thấy báo giá/đơn bán/hóa đơn của riêng mình.
- `ketoan.hcm` chỉ thấy chứng từ chi nhánh HCM; `ketoan` thấy Hà Nội.
- `kho` mở một PO: cột đơn giá/thành tiền hiển thị 🔒 — API không trả về các trường này.
- `admin` không mở được bất kỳ chứng từ nào (không có "god mode").

## Dữ liệu mẫu đáng chú ý

| Chứng từ | Điểm demo |
|---|---|
| `PAY-202607-00001` | Truy vết tiền đủ chuỗi PAY ← SI ← PO ← PR ← Ngân sách, đã hậu kiểm |
| `DN-202607-00001` | Truy vết hàng: giao 60 bộ K200 = 40 bộ tồn đầu kỳ + 20 bộ từ lệnh SX (vật tư FIFO) |
| `SI-202609-00001` / `EXC-202609-00001` | Lệch 3 chiều (giá +3,9%, SL sơn vượt nhận) → tạm giữ, CFO đang xem xét ngoại lệ |
| `SO-202608-00001` | Giao một phần, thu một phần; còn 40 tấm panel nhưng kho HN chỉ còn 20 |
| `AR-202609-00001` | Rà soát quyền đã thu hồi quyền SALES_STAFF tạm cấp cho TP CSKH |
| `BR-202609-00001` | Đối chiếu ngân hàng còn 1 dòng phí chưa khớp → kế toán trưởng quyết định |
| Kỳ 2026-07 / 2026-08 | Khóa cứng / khóa sơ bộ — thử ghi JV ngày 15/07 sẽ bị chặn |

## Thuế GTGT trên hóa đơn

Khi lập **Hóa đơn NCC (SINV)** hoặc **Hóa đơn bán hàng (INV)**, chọn thuế suất GTGT (0/5/8/10%, mặc định 10%).
Giá trị dòng vẫn là **giá chưa thuế** (dùng để đối chiếu 3 chiều và ghi doanh thu/giá vốn đúng bản chất).
Khi **ghi sổ công nợ** (post), hệ thống cộng thêm thuế: Nợ 131 / Có 3331 (đầu ra) cho hóa đơn bán; Nợ 1331 / Có 331
(đầu vào) cho hóa đơn mua — và tổng phải thu/phải trả (`amount`, dùng cho công nợ, tuổi nợ, đối soát thanh toán)
chuyển thành **giá trị đã gồm thuế** từ thời điểm đó. Hóa đơn tạo trước khi có tính năng này không bị ảnh hưởng
(thuế suất mặc định 0%).
