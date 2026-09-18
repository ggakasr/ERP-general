// Shared demo-account directory — used by the login page (src/app/login) and the
// in-app "Chuyển tài khoản demo" quick switcher (src/components/layout/header.tsx),
// so testing a full cross-role flow doesn't require signing out between every step.
export const DEMO_PASSWORD = "Demo@123"

export interface DemoAccount { email: string; name: string; role: string; note: string }
export interface DemoGroup { title: string; accounts: DemoAccount[] }

export const DEMO_GROUPS: DemoGroup[] = [
  {
    title: "Ban điều hành & Kiểm soát",
    accounts: [
      { email: "ceo", name: "Nguyễn Minh Quân", role: "Tổng giám đốc", note: "Xem toàn công ty, KPI" },
      { email: "cfo", name: "Phạm Thu Dung", role: "Giám đốc tài chính", note: "Duyệt chi, lương, ngoại lệ" },
      { email: "kiemtoan", name: "Trịnh Thanh Tâm", role: "Kiểm toán nội bộ", note: "Hậu kiểm, audit, SoD log" },
      { email: "admin", name: "Nguyễn Văn An", role: "Quản trị hệ thống", note: "Phân quyền — không xem chứng từ" },
    ],
  },
  {
    title: "Tài chính - Kế toán",
    accounts: [
      { email: "ketoantruong", name: "Lê Hoàng Kế", role: "Kế toán trưởng", note: "Ghi sổ, khóa kỳ" },
      { email: "ketoan", name: "Ngô Thị Hà", role: "Kế toán viên (HN)", note: "Hóa đơn, phiếu chi/thu" },
      { email: "thuquy", name: "Đỗ Văn Tiền", role: "Thủ quỹ", note: "Thực hiện chi/thu" },
    ],
  },
  {
    title: "Mua hàng · Kho · Sản xuất",
    accounts: [
      { email: "muahang.tp", name: "Lê Văn Cường", role: "TP Mua hàng", note: "Duyệt PO" },
      { email: "muahang", name: "Bùi Thị Mai", role: "NV Mua hàng", note: "Lập PO" },
      { email: "kho.tp", name: "Hoàng Văn Em", role: "Trưởng kho", note: "Nhập/xuất kho" },
      { email: "kho", name: "Phan Văn Kiên", role: "Thủ kho", note: "Không xem giá" },
      { email: "sanxuat.gd", name: "Đặng Văn Giang", role: "GĐ Sản xuất", note: "Duyệt PR, lệnh SX" },
      { email: "sanxuat", name: "Vũ Đức Thắng", role: "Kế hoạch SX", note: "Lập PR, lệnh SX" },
      { email: "qc", name: "Lý Thị Quỳnh", role: "QC", note: "Kiểm tra chất lượng" },
    ],
  },
  {
    title: "Kinh doanh · Nhân sự · CSKH",
    accounts: [
      { email: "kinhdoanh.tp", name: "Trần Thị Bình", role: "TP Kinh doanh", note: "Duyệt báo giá/đơn bán" },
      { email: "kinhdoanh", name: "Nguyễn Văn Long", role: "NV Kinh doanh", note: "Chỉ thấy đơn của mình" },
      { email: "kinhdoanh2", name: "Phạm Minh Tú", role: "NV Kinh doanh", note: "Chỉ thấy đơn của mình" },
      { email: "nhansu.tp", name: "Vũ Thị Phương", role: "TP Nhân sự", note: "Duyệt tuyển dụng" },
      { email: "nhansu", name: "Mai Văn Nhân", role: "Chuyên viên C&B", note: "Tính lương" },
      { email: "cskh.tp", name: "Hồ Thị Thu", role: "TP CSKH", note: "Phân công, đóng ticket" },
      { email: "cskh", name: "Đinh Văn Hỗ", role: "NV CSKH", note: "Xử lý ticket được giao" },
      { email: "cskh2", name: "Lương Thị Lan", role: "NV CSKH", note: "Xử lý ticket được giao" },
    ],
  },
  {
    title: "Chi nhánh TP.HCM",
    accounts: [
      { email: "gd.hcm", name: "Trương Quốc Bảo", role: "GĐ Chi nhánh", note: "Quyền rộng — vẫn bị SoD chặn" },
      { email: "kinhdoanh.hcm", name: "Lâm Thị Hương", role: "NV Kinh doanh HCM", note: "Phạm vi của mình" },
      { email: "kho.hcm", name: "Châu Văn Tài", role: "Trưởng kho HCM", note: "Kho HCM" },
      { email: "ketoan.hcm", name: "Tạ Thị Nga", role: "Kế toán HCM", note: "Chỉ thấy chi nhánh HCM" },
    ],
  },
]
