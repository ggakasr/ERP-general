import type { DocumentRow } from "@/lib/types"

export type FieldType =
  | "text" | "textarea" | "number" | "money" | "date"
  | "supplier" | "customer" | "warehouse" | "product" | "department" | "select" | "document"

export interface HeaderField {
  key: string
  label: string
  type: FieldType
  /** stored under documents.data instead of a column */
  data?: boolean
  required?: boolean
  options?: { value: string; label: string }[]
  placeholder?: string
  /** only when creating without a parent document */
  noParentOnly?: boolean
  productFilter?: string[]
}

export type LineMode = "product" | "journal" | "budget" | "bankrec" | "none"

export interface ListColumn {
  key: string
  label: string
  kind?: "money" | "date" | "number" | "status" | "text"
  align?: "right"
}

export interface DocTypeConfig {
  code: string
  label: string
  plural: string
  module: string
  flow: string
  lineMode: LineMode
  header: HeaderField[]
  columns: ListColumn[]
  requiresParent?: boolean
  /** product filter for free product lines */
  productTypes?: string[]
  /** price field on product lines */
  priceLabel?: string
  /** quantity label (ADJ = counted qty) */
  qtyLabel?: string
  createVia?: "payroll" | "access_review"
}

const BASE_COLS: ListColumn[] = [
  { key: "number", label: "Số chứng từ" },
  { key: "title", label: "Diễn giải" },
]
const STATUS_COL: ListColumn = { key: "status", label: "Trạng thái", kind: "status" }
const AMOUNT_COL: ListColumn = { key: "amount", label: "Giá trị", kind: "money", align: "right" }
const DATE_COL: ListColumn = { key: "doc_date", label: "Ngày", kind: "date" }
const BY_COL: ListColumn = { key: "created_by_name", label: "Người lập" }

export const DOC_TYPES: Record<string, DocTypeConfig> = {
  BUDGET: {
    code: "BUDGET", label: "Ngân sách", plural: "Ngân sách bộ phận", module: "planning", flow: "L1", lineMode: "budget",
    header: [
      { key: "title", label: "Tên ngân sách", type: "text", required: true },
      { key: "fiscal_year", label: "Năm tài chính", type: "number", data: true, required: true },
    ],
    columns: [...BASE_COLS, { key: "cost_center_name", label: "Bộ phận" }, { key: "data.fiscal_year", label: "Năm" }, AMOUNT_COL, STATUS_COL],
  },
  PR: {
    code: "PR", label: "Đề nghị mua hàng", plural: "Đề nghị mua hàng (PR)", module: "procurement", flow: "L3", lineMode: "product",
    header: [
      { key: "title", label: "Nội dung đề nghị", type: "text", required: true },
      { key: "justification", label: "Lý do / mục đích", type: "textarea", data: true },
      { key: "needed_by", label: "Cần trước ngày", type: "date", data: true },
    ],
    productTypes: ["RAW", "GOODS", "SUPPLY", "FINISHED"], priceLabel: "Đơn giá dự toán",
    columns: [...BASE_COLS, { key: "department_name", label: "Bộ phận" }, AMOUNT_COL, BY_COL, DATE_COL, STATUS_COL],
  },
  PO: {
    code: "PO", label: "Đơn mua hàng", plural: "Đơn mua hàng (PO)", module: "procurement", flow: "L3", lineMode: "product",
    header: [
      { key: "title", label: "Diễn giải", type: "text", required: true },
      { key: "partner_id", label: "Nhà cung cấp", type: "supplier", required: true },
      { key: "warehouse_id", label: "Kho nhận hàng", type: "warehouse", required: true },
      { key: "delivery_date", label: "Ngày giao dự kiến", type: "date", data: true },
    ],
    productTypes: ["RAW", "GOODS", "SUPPLY", "FINISHED"], priceLabel: "Đơn giá mua",
    columns: [...BASE_COLS, { key: "partner_name", label: "Nhà cung cấp" }, AMOUNT_COL, BY_COL, DATE_COL, STATUS_COL],
  },
  GRN: {
    code: "GRN", label: "Phiếu nhập kho", plural: "Phiếu nhập kho (GRN)", module: "inventory", flow: "L4", lineMode: "product",
    requiresParent: true,
    header: [{ key: "title", label: "Diễn giải", type: "text" }, { key: "delivery_note_no", label: "Số phiếu giao của NCC", type: "text", data: true }],
    columns: [...BASE_COLS, { key: "partner_name", label: "Nhà cung cấp" }, { key: "warehouse_name", label: "Kho" }, BY_COL, DATE_COL, STATUS_COL],
  },
  SINV: {
    code: "SINV", label: "Hóa đơn NCC", plural: "Hóa đơn nhà cung cấp", module: "finance", flow: "L3", lineMode: "product",
    requiresParent: true, priceLabel: "Đơn giá trên hóa đơn",
    header: [
      { key: "title", label: "Diễn giải", type: "text" },
      { key: "invoice_no", label: "Số hóa đơn NCC", type: "text", data: true, required: true },
      { key: "vat_rate", label: "Thuế suất GTGT", type: "select", data: true, options: [
        { value: "0", label: "0%" }, { value: "5", label: "5%" }, { value: "8", label: "8%" }, { value: "10", label: "10%" } ] },
    ],
    columns: [...BASE_COLS, { key: "partner_name", label: "Nhà cung cấp" }, AMOUNT_COL, { key: "due_date", label: "Hạn trả", kind: "date" }, STATUS_COL],
  },
  PMT: {
    code: "PMT", label: "Phiếu chi", plural: "Phiếu chi / Ủy nhiệm chi", module: "finance", flow: "L7", lineMode: "none",
    requiresParent: true,
    header: [
      { key: "title", label: "Nội dung chi", type: "text", required: true },
      { key: "amount", label: "Số tiền", type: "money", required: true },
      { key: "method", label: "Hình thức", type: "select", data: true, options: [
        { value: "BANK_TRANSFER", label: "Chuyển khoản" }, { value: "CASH", label: "Tiền mặt" } ] },
      { key: "bank_account", label: "Tài khoản chi", type: "text", data: true },
    ],
    columns: [...BASE_COLS, { key: "partner_name", label: "Người nhận" }, AMOUNT_COL, BY_COL, DATE_COL, STATUS_COL],
  },
  QUOT: {
    code: "QUOT", label: "Báo giá", plural: "Báo giá", module: "sales", flow: "L2", lineMode: "product",
    header: [
      { key: "title", label: "Diễn giải", type: "text", required: true },
      { key: "partner_id", label: "Khách hàng", type: "customer", required: true },
      { key: "warehouse_id", label: "Kho xuất", type: "warehouse", required: true },
      { key: "valid_until", label: "Hiệu lực đến", type: "date", data: true },
    ],
    productTypes: ["FINISHED", "GOODS"], priceLabel: "Đơn giá bán",
    columns: [...BASE_COLS, { key: "partner_name", label: "Khách hàng" }, AMOUNT_COL, BY_COL, DATE_COL, STATUS_COL],
  },
  SO: {
    code: "SO", label: "Đơn bán hàng", plural: "Đơn bán hàng (SO)", module: "sales", flow: "L2", lineMode: "product",
    header: [
      { key: "title", label: "Diễn giải", type: "text", required: true },
      { key: "partner_id", label: "Khách hàng", type: "customer", required: true, noParentOnly: true },
      { key: "warehouse_id", label: "Kho xuất", type: "warehouse", required: true, noParentOnly: true },
      { key: "delivery_date", label: "Ngày giao dự kiến", type: "date", data: true },
    ],
    productTypes: ["FINISHED", "GOODS"], priceLabel: "Đơn giá bán",
    columns: [...BASE_COLS, { key: "partner_name", label: "Khách hàng" }, AMOUNT_COL, BY_COL, DATE_COL, STATUS_COL],
  },
  DN: {
    code: "DN", label: "Phiếu xuất giao hàng", plural: "Phiếu xuất giao hàng", module: "inventory", flow: "L4", lineMode: "product",
    requiresParent: true,
    header: [{ key: "title", label: "Diễn giải", type: "text" }, { key: "vehicle", label: "Phương tiện", type: "text", data: true }],
    columns: [...BASE_COLS, { key: "partner_name", label: "Khách hàng" }, { key: "warehouse_name", label: "Kho" }, BY_COL, DATE_COL, STATUS_COL],
  },
  INV: {
    code: "INV", label: "Hóa đơn bán hàng", plural: "Hóa đơn bán hàng", module: "sales", flow: "L2", lineMode: "product",
    requiresParent: true,
    header: [
      { key: "title", label: "Diễn giải", type: "text" },
      { key: "vat_rate", label: "Thuế suất GTGT", type: "select", data: true, options: [
        { value: "0", label: "0%" }, { value: "5", label: "5%" }, { value: "8", label: "8%" }, { value: "10", label: "10%" } ] },
    ],
    columns: [...BASE_COLS, { key: "partner_name", label: "Khách hàng" }, AMOUNT_COL, { key: "due_date", label: "Hạn thu", kind: "date" }, STATUS_COL],
  },
  RCPT: {
    code: "RCPT", label: "Phiếu thu", plural: "Phiếu thu", module: "finance", flow: "L7", lineMode: "none",
    requiresParent: true,
    header: [
      { key: "title", label: "Nội dung thu", type: "text", required: true },
      { key: "amount", label: "Số tiền", type: "money", required: true },
      { key: "method", label: "Hình thức", type: "select", data: true, options: [
        { value: "BANK_TRANSFER", label: "Chuyển khoản" }, { value: "CASH", label: "Tiền mặt" } ] },
    ],
    columns: [...BASE_COLS, { key: "partner_name", label: "Khách hàng" }, AMOUNT_COL, BY_COL, DATE_COL, STATUS_COL],
  },
  ST: {
    code: "ST", label: "Phiếu chuyển kho", plural: "Chuyển kho", module: "inventory", flow: "L4", lineMode: "product",
    header: [
      { key: "title", label: "Diễn giải", type: "text", required: true },
      { key: "warehouse_id", label: "Kho nguồn", type: "warehouse", required: true },
      { key: "to_warehouse_id", label: "Kho đích", type: "warehouse", required: true },
    ],
    productTypes: ["RAW", "GOODS", "SUPPLY", "FINISHED"],
    columns: [...BASE_COLS, { key: "warehouse_name", label: "Từ kho" }, { key: "to_warehouse_name", label: "Đến kho" }, BY_COL, DATE_COL, STATUS_COL],
  },
  ADJ: {
    code: "ADJ", label: "Phiếu kiểm kê", plural: "Kiểm kê / điều chỉnh kho", module: "inventory", flow: "L4", lineMode: "product",
    header: [
      { key: "title", label: "Diễn giải", type: "text", required: true },
      { key: "warehouse_id", label: "Kho kiểm kê", type: "warehouse", required: true },
      { key: "reason", label: "Lý do", type: "textarea", data: true },
    ],
    productTypes: ["RAW", "GOODS", "SUPPLY", "FINISHED"], qtyLabel: "SL thực đếm",
    columns: [...BASE_COLS, { key: "warehouse_name", label: "Kho" }, { key: "amount", label: "Chênh lệch giá trị", kind: "money", align: "right" }, BY_COL, STATUS_COL],
  },
  WO: {
    code: "WO", label: "Lệnh sản xuất", plural: "Lệnh sản xuất", module: "production", flow: "L5", lineMode: "none",
    header: [
      { key: "title", label: "Diễn giải", type: "text", required: true },
      { key: "product_id", label: "Thành phẩm", type: "product", required: true, productFilter: ["FINISHED"] },
      { key: "warehouse_id", label: "Kho sản xuất", type: "warehouse", required: true },
      { key: "planned_qty", label: "Số lượng kế hoạch", type: "number", data: true, required: true },
    ],
    columns: [...BASE_COLS, { key: "product_name", label: "Thành phẩm" }, { key: "data.planned_qty", label: "SL KH", kind: "number", align: "right" }, { key: "data.completed_qty", label: "SL HT", kind: "number", align: "right" }, BY_COL, STATUS_COL],
  },
  HIRE: {
    code: "HIRE", label: "Đề nghị tuyển dụng", plural: "Tuyển dụng & tiếp nhận", module: "hr", flow: "L6", lineMode: "none",
    header: [
      { key: "title", label: "Vị trí tuyển", type: "text", required: true },
      { key: "full_name", label: "Họ tên ứng viên", type: "text", data: true, required: true },
      { key: "position", label: "Chức danh", type: "text", data: true, required: true },
      { key: "department_id", label: "Phòng ban", type: "department", data: true, required: true },
      { key: "base_salary", label: "Lương cơ bản", type: "money", data: true, required: true },
      { key: "allowance", label: "Phụ cấp", type: "money", data: true },
      { key: "start_date", label: "Ngày bắt đầu", type: "date", data: true },
    ],
    columns: [...BASE_COLS, { key: "data.full_name", label: "Ứng viên" }, { key: "data.employee_code", label: "Mã NV" }, BY_COL, STATUS_COL],
  },
  PAYROLL: {
    code: "PAYROLL", label: "Bảng lương", plural: "Bảng lương", module: "hr", flow: "L6", lineMode: "none", createVia: "payroll",
    header: [],
    columns: [...BASE_COLS, { key: "data.employee_count", label: "Số NV", kind: "number", align: "right" }, { key: "data.total_gross", label: "Tổng thu nhập", kind: "money", align: "right" }, AMOUNT_COL, STATUS_COL],
  },
  JV: {
    code: "JV", label: "Bút toán", plural: "Bút toán tổng hợp (JV)", module: "finance", flow: "L7", lineMode: "journal",
    header: [
      { key: "title", label: "Diễn giải", type: "text", required: true },
      { key: "doc_date", label: "Ngày hạch toán", type: "date", required: true },
    ],
    columns: [...BASE_COLS, AMOUNT_COL, BY_COL, DATE_COL, STATUS_COL],
  },
  BANKREC: {
    code: "BANKREC", label: "Đối chiếu ngân hàng", plural: "Đối chiếu ngân hàng", module: "finance", flow: "L7", lineMode: "bankrec",
    header: [
      { key: "title", label: "Diễn giải", type: "text", required: true },
      { key: "bank_account", label: "Tài khoản ngân hàng", type: "text", data: true },
    ],
    columns: [...BASE_COLS, AMOUNT_COL, BY_COL, DATE_COL, STATUS_COL],
  },
  ASSET: {
    code: "ASSET", label: "Tài sản cố định", plural: "Tài sản cố định", module: "assets", flow: "L8", lineMode: "none",
    header: [
      { key: "title", label: "Tên tài sản", type: "text", required: true },
      { key: "name", label: "Tên trên thẻ tài sản", type: "text", data: true, required: true },
      { key: "category", label: "Nhóm tài sản", type: "text", data: true },
      { key: "amount", label: "Nguyên giá", type: "money", required: true },
      { key: "useful_life_months", label: "Thời gian khấu hao (tháng)", type: "number", data: true, required: true },
      { key: "partner_id", label: "Nhà cung cấp", type: "supplier" },
      { key: "location", label: "Vị trí sử dụng", type: "text", data: true },
    ],
    columns: [...BASE_COLS, { key: "data.category", label: "Nhóm" }, AMOUNT_COL, { key: "data.accumulated_depreciation", label: "Hao mòn LK", kind: "money", align: "right" }, STATUS_COL],
  },
  TICKET: {
    code: "TICKET", label: "Ticket CSKH", plural: "Ticket chăm sóc khách hàng", module: "customer-service", flow: "L9", lineMode: "none",
    header: [
      { key: "subject", label: "Tiêu đề", type: "text", data: true, required: true },
      { key: "partner_id", label: "Khách hàng", type: "customer", required: true, noParentOnly: true },
      { key: "priority", label: "Mức ưu tiên", type: "select", data: true, options: [
        { value: "LOW", label: "Thấp (72h)" }, { value: "MEDIUM", label: "Trung bình (48h)" },
        { value: "HIGH", label: "Cao (24h)" }, { value: "CRITICAL", label: "Khẩn cấp (4h)" } ] },
      { key: "description", label: "Mô tả", type: "textarea", data: true },
    ],
    columns: [...BASE_COLS, { key: "partner_name", label: "Khách hàng" }, { key: "data.priority", label: "Ưu tiên" }, { key: "owner_name", label: "Người xử lý" }, { key: "data.sla_due_at", label: "Hạn SLA", kind: "date" }, STATUS_COL],
  },
  EXC: {
    code: "EXC", label: "Ngoại lệ", plural: "Sổ ngoại lệ", module: "exceptions", flow: "L4", lineMode: "none",
    header: [
      { key: "title", label: "Tiêu đề", type: "text", required: true },
      { key: "exception_type", label: "Loại ngoại lệ", type: "select", data: true, required: true, options: [
        { value: "PROCESS_DEVIATION", label: "Sai lệch quy trình" }, { value: "DATA_MISMATCH", label: "Lệch dữ liệu" },
        { value: "SLA_BREACH", label: "Vi phạm SLA" }, { value: "POLICY_OVERRIDE", label: "Ngoại lệ chính sách" },
        { value: "SYSTEM_ERROR", label: "Lỗi hệ thống" } ] },
      { key: "severity", label: "Mức độ", type: "select", data: true, options: [
        { value: "LOW", label: "Thấp" }, { value: "MEDIUM", label: "Trung bình" }, { value: "HIGH", label: "Cao" }, { value: "CRITICAL", label: "Nghiêm trọng" } ] },
      { key: "affected_document_id", label: "Chứng từ bị ảnh hưởng", type: "document", data: true },
      { key: "description", label: "Mô tả", type: "textarea", data: true, required: true },
    ],
    columns: [...BASE_COLS, { key: "data.exception_type", label: "Loại" }, { key: "data.severity", label: "Mức độ" }, { key: "data.affected_document_number", label: "Chứng từ gốc" }, BY_COL, STATUS_COL],
  },
  MDC: {
    code: "MDC", label: "Yêu cầu thay đổi dữ liệu chủ", plural: "Thay đổi dữ liệu chủ", module: "admin", flow: "L10", lineMode: "none",
    header: [],
    columns: [...BASE_COLS, { key: "data.entity", label: "Đối tượng" }, { key: "data.op", label: "Thao tác" }, BY_COL, STATUS_COL],
  },
  ACCESS_REVIEW: {
    code: "ACCESS_REVIEW", label: "Rà soát quyền truy cập", plural: "Rà soát quyền", module: "admin", flow: "L10", lineMode: "none",
    createVia: "access_review", header: [],
    columns: [...BASE_COLS, BY_COL, DATE_COL, STATUS_COL],
  },
}

export interface ModuleConfig {
  key: string
  href: string
  title: string
  docTypes: string[]
}

export const MODULES: ModuleConfig[] = [
  { key: "planning", href: "/planning", title: "Kế hoạch & Ngân sách", docTypes: ["BUDGET"] },
  { key: "sales", href: "/sales", title: "Bán hàng", docTypes: ["QUOT", "SO", "INV"] },
  { key: "procurement", href: "/procurement", title: "Mua hàng", docTypes: ["PR", "PO", "SINV"] },
  { key: "inventory", href: "/inventory", title: "Kho vận", docTypes: ["GRN", "DN", "ST", "ADJ"] },
  { key: "production", href: "/production", title: "Sản xuất", docTypes: ["WO"] },
  { key: "hr", href: "/hr", title: "Nhân sự & Tiền lương", docTypes: ["HIRE", "PAYROLL"] },
  { key: "finance", href: "/finance", title: "Tài chính & Kế toán", docTypes: ["JV", "SINV", "PMT", "RCPT", "BANKREC"] },
  { key: "assets", href: "/assets", title: "Tài sản", docTypes: ["ASSET"] },
  { key: "customer-service", href: "/customer-service", title: "Dịch vụ khách hàng", docTypes: ["TICKET"] },
  { key: "exceptions", href: "/exceptions", title: "Ngoại lệ", docTypes: ["EXC"] },
]

export function docTypeLabel(code: string) {
  return DOC_TYPES[code]?.label || code
}

export function docHref(doc: Pick<DocumentRow, "id"> | { id: string }) {
  return `/documents/${doc.id}`
}
