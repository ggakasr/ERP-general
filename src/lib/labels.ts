export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
  CLOSED: "Đã đóng",
  ACTIVE: "Đang hiệu lực",
  ORDERED: "Đã lập đơn",
  SENT: "Đã gửi",
  CONFIRMED: "Đã xác nhận",
  PARTIALLY_RECEIVED: "Nhận một phần",
  RECEIVED: "Đã nhận",
  INVOICED: "Đã xuất/khớp hóa đơn",
  PAID: "Đã thanh toán",
  PARTIALLY_PAID: "Thanh toán một phần",
  INSPECTED: "Đã kiểm tra QC",
  STORED: "Đã nhập kho",
  MATCHED: "Đã khớp",
  ON_HOLD: "Tạm giữ",
  POSTED: "Đã ghi sổ",
  AUDITED: "Đã hậu kiểm",
  ACCEPTED: "Khách chấp nhận",
  LOST: "Không thành công",
  PARTIALLY_SHIPPED: "Giao một phần",
  SHIPPED: "Đã giao",
  PICKED: "Đã soạn hàng",
  IN_TRANSIT: "Đang vận chuyển",
  PLANNED: "Kế hoạch",
  RELEASED: "Đã phát lệnh",
  MATERIAL_ISSUED: "Đã xuất vật tư",
  IN_PRODUCTION: "Đang sản xuất",
  QC: "Chờ QC",
  COMPLETED: "Hoàn thành",
  ONBOARDED: "Đã tiếp nhận",
  CALCULATED: "Đã tính",
  REVERSED: "Đã đảo",
  RECONCILED: "Đã đối chiếu",
  IN_USE: "Đang sử dụng",
  UNDER_MAINTENANCE: "Đang bảo trì",
  DISPOSED: "Đã thanh lý",
  OPEN: "Mới",
  ASSIGNED: "Đã phân công",
  IN_PROGRESS: "Đang xử lý",
  WAITING_CUSTOMER: "Chờ khách hàng",
  RESOLVED: "Đã giải quyết",
  RAISED: "Mới nêu",
  UNDER_REVIEW: "Đang xem xét",
  SOFT_CLOSE: "Khóa sơ bộ",
  HARD_CLOSE: "Khóa sổ",
}

type Tone = "gray" | "blue" | "amber" | "green" | "red" | "violet" | "teal"

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "gray", PLANNED: "gray", CALCULATED: "gray", OPEN: "blue",
  SUBMITTED: "amber", UNDER_REVIEW: "amber", RAISED: "amber", PICKED: "blue", SENT: "blue", QC: "amber",
  WAITING_CUSTOMER: "amber", ON_HOLD: "red", IN_TRANSIT: "blue", ASSIGNED: "blue", IN_PROGRESS: "blue",
  RELEASED: "blue", MATERIAL_ISSUED: "blue", IN_PRODUCTION: "blue", INSPECTED: "blue", MATCHED: "teal",
  APPROVED: "teal", CONFIRMED: "teal", ACCEPTED: "teal", ACTIVE: "teal", ORDERED: "teal", IN_USE: "teal",
  PARTIALLY_RECEIVED: "violet", PARTIALLY_SHIPPED: "violet", PARTIALLY_PAID: "violet", INVOICED: "violet",
  UNDER_MAINTENANCE: "amber",
  RECEIVED: "green", STORED: "green", POSTED: "green", PAID: "green", SHIPPED: "green", COMPLETED: "green",
  ONBOARDED: "green", RESOLVED: "green", RECONCILED: "green", AUDITED: "green",
  CLOSED: "gray", DISPOSED: "gray", REVERSED: "red", REJECTED: "red", CANCELLED: "red", LOST: "red",
}

const TONE_CLASS: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
}

export function statusLabel(status: string) {
  return STATUS_LABELS[status] || status
}

export function statusClass(status: string) {
  return TONE_CLASS[STATUS_TONE[status] || "gray"]
}

export const SOD_LABELS: Record<string, string> = {
  REQUESTER: "Người đề xuất",
  APPROVER: "Người phê duyệt",
  EXECUTOR: "Người thực hiện",
  AUDITOR: "Người kiểm tra",
}

export const SOD_CLASS: Record<string, string> = {
  REQUESTER: "bg-sky-50 text-sky-700 ring-sky-200",
  APPROVER: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  EXECUTOR: "bg-orange-50 text-orange-700 ring-orange-200",
  AUDITOR: "bg-purple-50 text-purple-700 ring-purple-200",
}

export const SCOPE_LABELS: Record<string, string> = {
  OWN: "Của tôi",
  DEPARTMENT: "Phòng ban",
  BRANCH: "Chi nhánh",
  COMPANY: "Toàn công ty",
}

export const ACTION_LABELS: Record<string, string> = {
  VIEW: "Xem",
  CREATE: "Tạo",
  EDIT: "Sửa/xử lý",
  APPROVE: "Duyệt",
  EXECUTE: "Thực hiện",
  AUDIT: "Hậu kiểm",
  EXPORT: "Xuất dữ liệu",
}

export const RESOURCE_LABELS: Record<string, string> = {
  BUDGET: "Ngân sách", PR: "Đề nghị mua hàng", PO: "Đơn mua hàng", GRN: "Phiếu nhập kho", SINV: "Hóa đơn NCC",
  PMT: "Phiếu chi", QUOT: "Báo giá", SO: "Đơn bán hàng", DN: "Phiếu xuất giao hàng", INV: "Hóa đơn bán hàng",
  RCPT: "Phiếu thu", ST: "Chuyển kho", ADJ: "Kiểm kê/điều chỉnh", WO: "Lệnh sản xuất", HIRE: "Tuyển dụng",
  PAYROLL: "Bảng lương", JV: "Bút toán", BANKREC: "Đối chiếu ngân hàng", ASSET: "Tài sản", TICKET: "Ticket CSKH",
  EXC: "Ngoại lệ", MDC: "Thay đổi dữ liệu chủ", ACCESS_REVIEW: "Rà soát quyền", QC: "Kiểm tra chất lượng",
  INVENTORY: "Tồn kho", EMPLOYEE: "Hồ sơ nhân sự", GL: "Sổ cái & BCTC", AUDIT_TRAIL: "Audit trail",
  SOD_LOG: "Nhật ký SoD", HANDOFF: "Sổ bàn giao", USER_ADMIN: "Quản trị người dùng", PERIOD: "Khóa sổ kỳ",
  DEPRECIATION: "Chạy khấu hao", KPI: "KPI", REPORT_OPS: "Báo cáo vận hành",
}

export const MOVE_LABELS: Record<string, string> = {
  GRN_IN: "Nhập mua", DN_OUT: "Xuất bán", ST_OUT: "Chuyển đi", ST_IN: "Chuyển đến", WO_ISSUE: "Xuất cho SX",
  WO_OUTPUT: "Nhập thành phẩm", ADJ_IN: "Điều chỉnh tăng", ADJ_OUT: "Điều chỉnh giảm",
}

export const SLA_LABELS: Record<string, { label: string; className: string }> = {
  ON_TIME: { label: "Đúng hạn", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  AT_RISK: { label: "Sắp trễ", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  BREACHED: { label: "Trễ SLA", className: "bg-red-50 text-red-700 ring-red-200" },
  CANCELLED: { label: "Hủy", className: "bg-slate-100 text-slate-600 ring-slate-200" },
}

export const FIELD_LABELS: Record<string, string> = {
  justification: "Lý do", valid_until: "Hiệu lực đến", delivery_date: "Ngày giao dự kiến", invoice_no: "Số hóa đơn NCC",
  method: "Hình thức", bank_account: "Tài khoản", reason: "Lý do", opening: "Số dư đầu kỳ", planned_qty: "SL kế hoạch",
  completed_qty: "SL hoàn thành", material_cost: "Chi phí NVL", unit_cost: "Giá thành đơn vị", bom_code: "Định mức",
  qc_fail_count: "Số lần QC không đạt", full_name: "Họ tên", position: "Vị trí", base_salary: "Lương cơ bản",
  allowance: "Phụ cấp", start_date: "Ngày bắt đầu", employee_code: "Mã nhân viên", period: "Kỳ",
  standard_days: "Ngày công chuẩn", employee_count: "Số nhân viên", total_gross: "Tổng thu nhập",
  total_insurance: "BHXH (10,5%)", total_pit: "Thuế TNCN", total_net: "Thực lĩnh", name: "Tên tài sản",
  category: "Nhóm tài sản", useful_life_months: "Thời gian khấu hao (tháng)", location: "Vị trí",
  opening_accumulated: "Hao mòn đầu kỳ", accumulated_depreciation: "Hao mòn lũy kế", capitalized_on: "Ngày ghi tăng",
  last_depreciation_period: "Kỳ khấu hao gần nhất", disposed_on: "Ngày thanh lý", subject: "Tiêu đề",
  description: "Mô tả", priority: "Mức ưu tiên", sla_due_at: "Hạn SLA", sla_hours: "SLA (giờ)", resolution: "Nội dung xử lý",
  resolved_at: "Thời điểm giải quyết", sla_met: "Đạt SLA", csat: "Điểm hài lòng", closed_at: "Thời điểm đóng",
  exception_type: "Loại ngoại lệ", severity: "Mức độ", affected_document_number: "Chứng từ bị ảnh hưởng",
  root_cause: "Nguyên nhân gốc", preventive_action: "Hành động phòng ngừa", entity: "Đối tượng", op: "Thao tác",
  fiscal_year: "Năm tài chính", paid_amount: "Đã thanh toán", outstanding: "Còn lại", cogs: "Giá vốn",
  shipped_at: "Thời điểm giao", paid_at: "Thời điểm chi", backorder: "Backorder", revoked_count: "Số quyền đã thu hồi",
  depreciation_period: "Kỳ khấu hao", reconciled_at: "Thời điểm đối chiếu", completed_at: "Thời điểm hoàn thành",
  employee_id: "Nhân viên", department_id: "Phòng ban", target_id: "Đối tượng", affected_document_id: "Chứng từ bị ảnh hưởng",
  vat_rate: "Thuế suất GTGT (%)", vat_amount: "Tiền thuế GTGT", subtotal: "Cộng tiền hàng (chưa thuế)",
}

export const PRIORITY_LABELS: Record<string, string> = { LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao", CRITICAL: "Khẩn cấp" }
export const EXC_TYPE_LABELS: Record<string, string> = {
  PROCESS_DEVIATION: "Sai lệch quy trình", DATA_MISMATCH: "Lệch dữ liệu", SLA_BREACH: "Vi phạm SLA",
  POLICY_OVERRIDE: "Ngoại lệ chính sách", SYSTEM_ERROR: "Lỗi hệ thống",
}
export const SEVERITY_LABELS: Record<string, string> = { LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao", CRITICAL: "Nghiêm trọng" }
