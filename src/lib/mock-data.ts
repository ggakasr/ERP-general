import type {
  Branch, Department, User, PurchaseRequisition, PurchaseOrder,
  GoodsReceiptNote, Quotation, SalesOrder, SalesInvoice,
  InventoryItem, StockTransfer, WorkOrder, BillOfMaterials,
  Employee, PayrollRun, JournalEntry, Payment, Asset,
  ServiceTicket, Budget, ExceptionRecord, AuditTrailEntry,
} from "./types"

export const BRANCHES: Branch[] = [
  { id: "br-1", name: "Trụ sở chính Hà Nội", code: "HN" },
  { id: "br-2", name: "Chi nhánh TP.HCM", code: "HCM" },
  { id: "br-3", name: "Chi nhánh Đà Nẵng", code: "DN" },
]

export const DEPARTMENTS: Department[] = [
  { id: "dept-1", name: "Quản trị hệ thống", code: "ADMIN", branchId: "br-1" },
  { id: "dept-2", name: "Kinh doanh", code: "SALES", branchId: "br-1" },
  { id: "dept-3", name: "Mua hàng", code: "PROC", branchId: "br-1" },
  { id: "dept-4", name: "Tài chính - Kế toán", code: "FIN", branchId: "br-1" },
  { id: "dept-5", name: "Kho vận", code: "WH", branchId: "br-1" },
  { id: "dept-6", name: "Nhân sự", code: "HR", branchId: "br-1" },
  { id: "dept-7", name: "Sản xuất", code: "PROD", branchId: "br-1" },
  { id: "dept-8", name: "Dịch vụ khách hàng", code: "CS", branchId: "br-1" },
]

export const USERS: User[] = [
  {
    id: "user-1", employeeCode: "NV001", fullName: "Nguyễn Văn An",
    email: "an.nguyen@erp.vn", departmentId: "dept-1", branchId: "br-1",
    position: "System Admin", roles: ["ADMIN", "AUDITOR"], status: "ACTIVE",
  },
  {
    id: "user-2", employeeCode: "NV002", fullName: "Trần Thị Bình",
    email: "binh.tran@erp.vn", departmentId: "dept-2", branchId: "br-1",
    position: "Sales Manager", roles: ["SALES_MANAGER", "REQUESTER", "APPROVER"], status: "ACTIVE",
  },
  {
    id: "user-3", employeeCode: "NV003", fullName: "Lê Văn Cường",
    email: "cuong.le@erp.vn", departmentId: "dept-3", branchId: "br-1",
    position: "Procurement Officer", roles: ["PROCUREMENT", "REQUESTER", "EXECUTOR"], status: "ACTIVE",
  },
  {
    id: "user-4", employeeCode: "NV004", fullName: "Phạm Thị Dung",
    email: "dung.pham@erp.vn", departmentId: "dept-4", branchId: "br-1",
    position: "Finance Manager", roles: ["FINANCE_MANAGER", "APPROVER"], status: "ACTIVE",
  },
  {
    id: "user-5", employeeCode: "NV005", fullName: "Hoàng Văn Em",
    email: "em.hoang@erp.vn", departmentId: "dept-5", branchId: "br-1",
    position: "Warehouse Manager", roles: ["WAREHOUSE", "EXECUTOR"], status: "ACTIVE",
  },
  {
    id: "user-6", employeeCode: "NV006", fullName: "Vũ Thị Phương",
    email: "phuong.vu@erp.vn", departmentId: "dept-6", branchId: "br-1",
    position: "HR Manager", roles: ["HR_MANAGER", "APPROVER"], status: "ACTIVE",
  },
  {
    id: "user-7", employeeCode: "NV007", fullName: "Đặng Văn Giang",
    email: "giang.dang@erp.vn", departmentId: "dept-7", branchId: "br-1",
    position: "Production Manager", roles: ["PRODUCTION", "REQUESTER"], status: "ACTIVE",
  },
  {
    id: "user-8", employeeCode: "NV008", fullName: "Ngô Thị Hà",
    email: "ha.ngo@erp.vn", departmentId: "dept-4", branchId: "br-1",
    position: "Accountant", roles: ["ACCOUNTANT", "EXECUTOR"], status: "ACTIVE",
  },
]

const now = new Date().toISOString()
const yesterday = new Date(Date.now() - 86400000).toISOString()
const lastWeek = new Date(Date.now() - 604800000).toISOString()

export const PURCHASE_REQUISITIONS: PurchaseRequisition[] = [
  {
    id: "pr-1", number: "PR-202609-00001", type: "PR", status: "APPROVED",
    departmentId: "dept-7", createdBy: "user-7", createdAt: lastWeek, updatedAt: yesterday,
    totalAmount: 50000000,
    items: [
      { id: "pri-1", productName: "Thép cuộn CB300", quantity: 100, unitPrice: 300000, amount: 30000000, unit: "kg" },
      { id: "pri-2", productName: "Bu lông M10", quantity: 500, unitPrice: 40000, amount: 20000000, unit: "cái" },
    ],
    justification: "Nguyên vật liệu cho đơn hàng sản xuất WO-001",
  },
  {
    id: "pr-2", number: "PR-202609-00002", type: "PR", status: "SUBMITTED",
    departmentId: "dept-2", createdBy: "user-2", createdAt: yesterday, updatedAt: yesterday,
    totalAmount: 15000000,
    items: [
      { id: "pri-3", productName: "Giấy A4 Double A", quantity: 50, unitPrice: 100000, amount: 5000000, unit: "ram" },
      { id: "pri-4", productName: "Mực in HP 26A", quantity: 10, unitPrice: 1000000, amount: 10000000, unit: "hộp" },
    ],
    justification: "Văn phòng phẩm quý 3",
  },
  {
    id: "pr-3", number: "PR-202609-00003", type: "PR", status: "DRAFT",
    departmentId: "dept-5", createdBy: "user-5", createdAt: now, updatedAt: now,
    totalAmount: 80000000,
    items: [
      { id: "pri-5", productName: "Xe nâng tay 2.5T", quantity: 1, unitPrice: 80000000, amount: 80000000, unit: "chiếc" },
    ],
    justification: "Thay thế xe nâng cũ đã hết hạn sử dụng",
  },
]

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: "po-1", number: "PO-202609-00001", type: "PO", status: "CONFIRMED",
    prId: "pr-1", supplierId: "sup-1", supplierName: "Công ty TNHH Thép Việt",
    createdBy: "user-3", approvedBy: "user-4", createdAt: lastWeek, updatedAt: yesterday,
    totalAmount: 50000000,
    items: [
      { id: "poi-1", productName: "Thép cuộn CB300", quantity: 100, unitPrice: 300000, amount: 30000000, unit: "kg" },
      { id: "poi-2", productName: "Bu lông M10", quantity: 500, unitPrice: 40000, amount: 20000000, unit: "cái" },
    ],
  },
  {
    id: "po-2", number: "PO-202609-00002", type: "PO", status: "DRAFT",
    supplierId: "sup-2", supplierName: "Công ty CP Văn phòng phẩm Hòa Phát",
    createdBy: "user-3", createdAt: now, updatedAt: now,
    totalAmount: 15000000,
    items: [
      { id: "poi-3", productName: "Giấy A4 Double A", quantity: 50, unitPrice: 100000, amount: 5000000, unit: "ram" },
      { id: "poi-4", productName: "Mực in HP 26A", quantity: 10, unitPrice: 1000000, amount: 10000000, unit: "hộp" },
    ],
  },
]

export const GOODS_RECEIPTS: GoodsReceiptNote[] = [
  {
    id: "grn-1", number: "GRN-202609-00001", type: "GRN", status: "STORED",
    poId: "po-1", poNumber: "PO-202609-00001",
    supplierId: "sup-1", supplierName: "Công ty TNHH Thép Việt",
    createdBy: "user-5", inspectedBy: "user-5",
    createdAt: yesterday, updatedAt: yesterday,
    items: [
      { id: "grni-1", productName: "Thép cuộn CB300", quantity: 100, unitPrice: 300000, amount: 30000000, unit: "kg", receivedQty: 100, acceptedQty: 98 },
      { id: "grni-2", productName: "Bu lông M10", quantity: 500, unitPrice: 40000, amount: 20000000, unit: "cái", receivedQty: 500, acceptedQty: 500 },
    ],
  },
]

export const QUOTATIONS: Quotation[] = [
  {
    id: "quot-1", number: "QT-202609-00001", type: "QUOT", status: "APPROVED",
    customerId: "cust-1", customerName: "Công ty TNHH Xây dựng Thành Đạt",
    createdBy: "user-2", createdAt: lastWeek, updatedAt: yesterday,
    totalAmount: 250000000, validUntil: "2026-10-15",
    items: [
      { id: "qi-1", productName: "Khung thép chịu lực K200", quantity: 50, unitPrice: 3000000, amount: 150000000, unit: "bộ" },
      { id: "qi-2", productName: "Tấm panel cách nhiệt", quantity: 200, unitPrice: 500000, amount: 100000000, unit: "tấm" },
    ],
  },
  {
    id: "quot-2", number: "QT-202609-00002", type: "QUOT", status: "SENT",
    customerId: "cust-2", customerName: "Công ty CP Nội thất Hoàng Gia",
    createdBy: "user-2", createdAt: yesterday, updatedAt: yesterday,
    totalAmount: 75000000, validUntil: "2026-10-01",
    items: [
      { id: "qi-3", productName: "Bàn làm việc gỗ MDF", quantity: 30, unitPrice: 2500000, amount: 75000000, unit: "cái" },
    ],
  },
]

export const SALES_ORDERS: SalesOrder[] = [
  {
    id: "so-1", number: "SO-202609-00001", type: "SO", status: "CONFIRMED",
    quotationId: "quot-1", customerId: "cust-1", customerName: "Công ty TNHH Xây dựng Thành Đạt",
    createdBy: "user-2", createdAt: lastWeek, updatedAt: yesterday,
    totalAmount: 250000000, deliveryDate: "2026-09-30",
    items: [
      { id: "soi-1", productName: "Khung thép chịu lực K200", quantity: 50, unitPrice: 3000000, amount: 150000000, unit: "bộ" },
      { id: "soi-2", productName: "Tấm panel cách nhiệt", quantity: 200, unitPrice: 500000, amount: 100000000, unit: "tấm" },
    ],
  },
]

export const SALES_INVOICES: SalesInvoice[] = [
  {
    id: "inv-1", number: "INV-202609-00001", type: "INV", status: "SENT",
    soId: "so-1", customerId: "cust-1", customerName: "Công ty TNHH Xây dựng Thành Đạt",
    createdBy: "user-8", createdAt: yesterday, updatedAt: yesterday,
    totalAmount: 250000000, paidAmount: 0, dueDate: "2026-10-17",
    items: [
      { id: "invi-1", productName: "Khung thép chịu lực K200", quantity: 50, unitPrice: 3000000, amount: 150000000, unit: "bộ" },
      { id: "invi-2", productName: "Tấm panel cách nhiệt", quantity: 200, unitPrice: 500000, amount: 100000000, unit: "tấm" },
    ],
  },
]

export const INVENTORY_ITEMS: InventoryItem[] = [
  { id: "inv-item-1", productName: "Thép cuộn CB300", sku: "STEEL-CB300", warehouseId: "wh-1", warehouseName: "Kho chính HN", quantity: 500, reservedQty: 100, unit: "kg", lastUpdated: now },
  { id: "inv-item-2", productName: "Bu lông M10", sku: "BOLT-M10", warehouseId: "wh-1", warehouseName: "Kho chính HN", quantity: 2000, reservedQty: 500, unit: "cái", lastUpdated: now },
  { id: "inv-item-3", productName: "Khung thép K200", sku: "FRAME-K200", warehouseId: "wh-1", warehouseName: "Kho chính HN", quantity: 80, reservedQty: 50, unit: "bộ", lastUpdated: now },
  { id: "inv-item-4", productName: "Tấm panel cách nhiệt", sku: "PANEL-INS", warehouseId: "wh-1", warehouseName: "Kho chính HN", quantity: 350, reservedQty: 200, unit: "tấm", lastUpdated: now },
  { id: "inv-item-5", productName: "Giấy A4 Double A", sku: "PAPER-A4", warehouseId: "wh-2", warehouseName: "Kho VP HCM", quantity: 100, reservedQty: 0, unit: "ram", lastUpdated: now },
  { id: "inv-item-6", productName: "Sơn công nghiệp xanh", sku: "PAINT-BL", warehouseId: "wh-1", warehouseName: "Kho chính HN", quantity: 50, reservedQty: 10, unit: "thùng", lastUpdated: now },
]

export const STOCK_TRANSFERS: StockTransfer[] = [
  {
    id: "st-1", number: "ST-202609-00001", type: "ST", status: "COMPLETED",
    fromWarehouseId: "wh-1", fromWarehouseName: "Kho chính HN",
    toWarehouseId: "wh-2", toWarehouseName: "Kho VP HCM",
    createdBy: "user-5", createdAt: lastWeek, updatedAt: yesterday,
    items: [
      { id: "sti-1", productName: "Giấy A4 Double A", quantity: 100, unitPrice: 100000, amount: 10000000, unit: "ram", transferQty: 50 },
    ],
  },
]

export const BOMS: BillOfMaterials[] = [
  {
    id: "bom-1", productName: "Khung thép chịu lực K200", productCode: "FRAME-K200", status: "ACTIVE",
    components: [
      { materialName: "Thép cuộn CB300", quantity: 5, unit: "kg" },
      { materialName: "Bu lông M10", quantity: 12, unit: "cái" },
      { materialName: "Sơn công nghiệp xanh", quantity: 0.5, unit: "thùng" },
    ],
  },
]

export const WORK_ORDERS: WorkOrder[] = [
  {
    id: "wo-1", number: "WO-202609-00001", type: "WO", status: "IN_PRODUCTION",
    bomId: "bom-1", productName: "Khung thép chịu lực K200",
    createdBy: "user-7", createdAt: lastWeek, updatedAt: now,
    plannedQty: 50, completedQty: 30, startDate: lastWeek,
  },
  {
    id: "wo-2", number: "WO-202609-00002", type: "WO", status: "PLANNED",
    bomId: "bom-1", productName: "Khung thép chịu lực K200",
    createdBy: "user-7", createdAt: now, updatedAt: now,
    plannedQty: 20, completedQty: 0, startDate: "2026-09-25",
  },
]

export const EMPLOYEES: Employee[] = [
  { id: "emp-1", userId: "user-1", fullName: "Nguyễn Văn An", position: "System Admin", departmentId: "dept-1", departmentName: "Quản trị hệ thống", baseSalary: 25000000, startDate: "2023-01-15", status: "ACTIVE" },
  { id: "emp-2", userId: "user-2", fullName: "Trần Thị Bình", position: "Sales Manager", departmentId: "dept-2", departmentName: "Kinh doanh", baseSalary: 30000000, startDate: "2022-06-01", status: "ACTIVE" },
  { id: "emp-3", userId: "user-3", fullName: "Lê Văn Cường", position: "Procurement Officer", departmentId: "dept-3", departmentName: "Mua hàng", baseSalary: 18000000, startDate: "2023-03-10", status: "ACTIVE" },
  { id: "emp-4", userId: "user-4", fullName: "Phạm Thị Dung", position: "Finance Manager", departmentId: "dept-4", departmentName: "Tài chính - Kế toán", baseSalary: 35000000, startDate: "2021-08-15", status: "ACTIVE" },
  { id: "emp-5", userId: "user-5", fullName: "Hoàng Văn Em", position: "Warehouse Manager", departmentId: "dept-5", departmentName: "Kho vận", baseSalary: 20000000, startDate: "2022-11-01", status: "ACTIVE" },
  { id: "emp-6", userId: "user-6", fullName: "Vũ Thị Phương", position: "HR Manager", departmentId: "dept-6", departmentName: "Nhân sự", baseSalary: 28000000, startDate: "2022-02-14", status: "ACTIVE" },
  { id: "emp-7", userId: "user-7", fullName: "Đặng Văn Giang", position: "Production Manager", departmentId: "dept-7", departmentName: "Sản xuất", baseSalary: 26000000, startDate: "2023-05-20", status: "ACTIVE" },
  { id: "emp-8", userId: "user-8", fullName: "Ngô Thị Hà", position: "Accountant", departmentId: "dept-4", departmentName: "Tài chính - Kế toán", baseSalary: 16000000, startDate: "2024-01-02", status: "ACTIVE" },
]

export const PAYROLL_RUNS: PayrollRun[] = [
  {
    id: "pay-1", number: "PAY-202608-00001", type: "PAY", status: "POSTED",
    createdBy: "user-6", createdAt: lastWeek, updatedAt: lastWeek,
    period: "2026-08", employeeCount: 8, totalGross: 218000000, totalDeductions: 43600000, totalNet: 174400000,
    entries: EMPLOYEES.map((e) => ({
      employeeId: e.id, employeeName: e.fullName, baseSalary: e.baseSalary,
      allowances: Math.round(e.baseSalary * 0.1),
      deductions: Math.round(e.baseSalary * 0.2),
      netSalary: Math.round(e.baseSalary * 0.9),
    })),
  },
  {
    id: "pay-2", number: "PAY-202609-00001", type: "PAY", status: "CALCULATED",
    createdBy: "user-6", createdAt: now, updatedAt: now,
    period: "2026-09", employeeCount: 8, totalGross: 218000000, totalDeductions: 43600000, totalNet: 174400000,
    entries: EMPLOYEES.map((e) => ({
      employeeId: e.id, employeeName: e.fullName, baseSalary: e.baseSalary,
      allowances: Math.round(e.baseSalary * 0.1),
      deductions: Math.round(e.baseSalary * 0.2),
      netSalary: Math.round(e.baseSalary * 0.9),
    })),
  },
]

export const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: "jv-1", number: "JV-202609-00001", type: "JV", status: "POSTED",
    createdBy: "user-8", createdAt: lastWeek, updatedAt: lastWeek,
    period: "2026-09", description: "Ghi nhận chi phí mua thép cuộn",
    totalDebit: 50000000, totalCredit: 50000000,
    lines: [
      { accountCode: "152", accountName: "Nguyên vật liệu", debit: 50000000, credit: 0 },
      { accountCode: "331", accountName: "Phải trả người bán", debit: 0, credit: 50000000 },
    ],
  },
  {
    id: "jv-2", number: "JV-202609-00002", type: "JV", status: "DRAFT",
    createdBy: "user-8", createdAt: now, updatedAt: now,
    period: "2026-09", description: "Chi phí tiền lương tháng 9",
    totalDebit: 218000000, totalCredit: 218000000,
    lines: [
      { accountCode: "622", accountName: "Chi phí nhân công", debit: 218000000, credit: 0 },
      { accountCode: "334", accountName: "Phải trả người lao động", debit: 0, credit: 174400000 },
      { accountCode: "338", accountName: "Các khoản trích theo lương", debit: 0, credit: 43600000 },
    ],
  },
]

export const PAYMENTS: Payment[] = [
  {
    id: "pmt-1", number: "PMT-202609-00001", type: "PMT", status: "COMPLETED",
    createdBy: "user-8", approvedBy: "user-4", executedBy: "user-8",
    createdAt: lastWeek, updatedAt: lastWeek,
    payeeType: "SUPPLIER", payeeId: "sup-1", payeeName: "Công ty TNHH Thép Việt",
    amount: 50000000, method: "BANK_TRANSFER", referenceDoc: "PO-202609-00001",
  },
  {
    id: "pmt-2", number: "PMT-202609-00002", type: "PMT", status: "SUBMITTED",
    createdBy: "user-8", createdAt: now, updatedAt: now,
    payeeType: "EMPLOYEE", payeeId: "emp-all", payeeName: "Lương tháng 09/2026",
    amount: 174400000, method: "BANK_TRANSFER", referenceDoc: "PAY-202609-00001",
  },
]

export const ASSETS: Asset[] = [
  {
    id: "asset-1", number: "AST-202301-00001", type: "ASSET", status: "ACTIVE",
    name: "Máy CNC Haas VF-2", category: "Máy móc sản xuất",
    createdBy: "user-4", createdAt: "2023-01-15", updatedAt: now,
    acquisitionDate: "2023-01-15", acquisitionCost: 1200000000, currentValue: 900000000,
    depreciationMethod: "STRAIGHT_LINE", usefulLifeMonths: 120,
    assignedTo: "user-7", location: "Xưởng sản xuất - HN",
  },
  {
    id: "asset-2", number: "AST-202206-00001", type: "ASSET", status: "ACTIVE",
    name: "Xe tải Hyundai HD120", category: "Phương tiện vận tải",
    createdBy: "user-4", createdAt: "2022-06-20", updatedAt: now,
    acquisitionDate: "2022-06-20", acquisitionCost: 800000000, currentValue: 520000000,
    depreciationMethod: "STRAIGHT_LINE", usefulLifeMonths: 96,
    assignedTo: "user-5", location: "Bãi xe - HN",
  },
  {
    id: "asset-3", number: "AST-202609-00001", type: "ASSET", status: "DRAFT",
    name: "Xe nâng tay 2.5T", category: "Thiết bị kho",
    createdBy: "user-5", createdAt: now, updatedAt: now,
    acquisitionDate: "2026-09-17", acquisitionCost: 80000000, currentValue: 80000000,
    depreciationMethod: "STRAIGHT_LINE", usefulLifeMonths: 60,
    location: "Kho chính - HN",
  },
]

export const SERVICE_TICKETS: ServiceTicket[] = [
  {
    id: "ticket-1", number: "TK-202609-00001", type: "TICKET", status: "IN_PROGRESS",
    customerId: "cust-1", customerName: "Công ty TNHH Xây dựng Thành Đạt",
    createdBy: "user-2", createdAt: yesterday, updatedAt: now,
    subject: "Khung thép K200 bị cong nhẹ",
    description: "Khách hàng phản ánh 2 bộ khung thép K200 trong lô hàng giao ngày 15/09 bị cong nhẹ, yêu cầu đổi hàng.",
    priority: "HIGH", assignedTo: "user-5", slaDeadline: "2026-09-19T17:00:00Z",
  },
  {
    id: "ticket-2", number: "TK-202609-00002", type: "TICKET", status: "OPEN",
    customerId: "cust-2", customerName: "Công ty CP Nội thất Hoàng Gia",
    createdBy: "user-2", createdAt: now, updatedAt: now,
    subject: "Yêu cầu báo giá lại số lượng lớn",
    description: "KH muốn tăng số lượng bàn từ 30 lên 100 cái, yêu cầu báo giá chiết khấu.",
    priority: "MEDIUM", slaDeadline: "2026-09-20T17:00:00Z",
  },
]

export const BUDGETS: Budget[] = [
  {
    id: "budget-1", number: "BDG-2026-00001", type: "BUDGET", status: "ACTIVE",
    createdBy: "user-4", createdAt: "2025-12-15", updatedAt: now,
    fiscalYear: 2026, departmentId: "dept-7", departmentName: "Sản xuất",
    totalPlanned: 2000000000, totalActual: 1250000000,
    lines: [
      { id: "bl-1", category: "Nguyên vật liệu", planned: 1200000000, actual: 800000000, variance: -400000000 },
      { id: "bl-2", category: "Nhân công", planned: 500000000, actual: 350000000, variance: -150000000 },
      { id: "bl-3", category: "Chi phí sản xuất chung", planned: 300000000, actual: 100000000, variance: -200000000 },
    ],
  },
  {
    id: "budget-2", number: "BDG-2026-00002", type: "BUDGET", status: "ACTIVE",
    createdBy: "user-4", createdAt: "2025-12-15", updatedAt: now,
    fiscalYear: 2026, departmentId: "dept-2", departmentName: "Kinh doanh",
    totalPlanned: 500000000, totalActual: 320000000,
    lines: [
      { id: "bl-4", category: "Marketing", planned: 200000000, actual: 150000000, variance: -50000000 },
      { id: "bl-5", category: "Hoa hồng bán hàng", planned: 200000000, actual: 120000000, variance: -80000000 },
      { id: "bl-6", category: "Chi phí đi lại", planned: 100000000, actual: 50000000, variance: -50000000 },
    ],
  },
]

export const EXCEPTIONS: ExceptionRecord[] = [
  {
    id: "exc-1", number: "EXC-202609-00001", type: "EXC", status: "RESOLVED",
    createdBy: "user-5", createdAt: yesterday, updatedAt: now,
    exceptionType: "DATA_MISMATCH", severity: "MEDIUM",
    description: "GRN-001: Số lượng thép nhận được 98kg thay vì 100kg theo PO. Chênh lệch 2%.",
    affectedDocumentId: "grn-1", affectedDocumentType: "GRN",
    raisedBy: "user-5", approvedBy: "user-4",
    resolution: "Chấp nhận hao hụt 2% trong giới hạn tolerance. Đã liên hệ NCC bổ sung.",
    rootCause: "Hao hụt vận chuyển",
  },
]

export const AUDIT_TRAIL: AuditTrailEntry[] = [
  { id: "aud-1", entityType: "PO", entityId: "po-1", action: "CREATE", newValue: "DRAFT", userId: "user-3", userName: "Lê Văn Cường", timestamp: lastWeek },
  { id: "aud-2", entityType: "PO", entityId: "po-1", action: "STATUS_CHANGE", oldValue: "DRAFT", newValue: "SUBMITTED", userId: "user-3", userName: "Lê Văn Cường", timestamp: lastWeek },
  { id: "aud-3", entityType: "PO", entityId: "po-1", action: "APPROVE", oldValue: "SUBMITTED", newValue: "APPROVED", userId: "user-4", userName: "Phạm Thị Dung", timestamp: lastWeek },
  { id: "aud-4", entityType: "PO", entityId: "po-1", action: "STATUS_CHANGE", oldValue: "APPROVED", newValue: "SENT", userId: "user-3", userName: "Lê Văn Cường", timestamp: lastWeek },
  { id: "aud-5", entityType: "PO", entityId: "po-1", action: "STATUS_CHANGE", oldValue: "SENT", newValue: "CONFIRMED", userId: "user-3", userName: "Lê Văn Cường", timestamp: yesterday },
  { id: "aud-6", entityType: "GRN", entityId: "grn-1", action: "CREATE", newValue: "DRAFT", userId: "user-5", userName: "Hoàng Văn Em", timestamp: yesterday },
  { id: "aud-7", entityType: "GRN", entityId: "grn-1", action: "STATUS_CHANGE", oldValue: "DRAFT", newValue: "STORED", userId: "user-5", userName: "Hoàng Văn Em", timestamp: yesterday },
  { id: "aud-8", entityType: "SO", entityId: "so-1", action: "CREATE", newValue: "DRAFT", userId: "user-2", userName: "Trần Thị Bình", timestamp: lastWeek },
  { id: "aud-9", entityType: "SO", entityId: "so-1", action: "STATUS_CHANGE", oldValue: "DRAFT", newValue: "CONFIRMED", userId: "user-2", userName: "Trần Thị Bình", timestamp: lastWeek },
  { id: "aud-10", entityType: "PMT", entityId: "pmt-1", action: "CREATE", newValue: "DRAFT", userId: "user-8", userName: "Ngô Thị Hà", timestamp: lastWeek },
  { id: "aud-11", entityType: "PMT", entityId: "pmt-1", action: "APPROVE", oldValue: "SUBMITTED", newValue: "APPROVED", userId: "user-4", userName: "Phạm Thị Dung", timestamp: lastWeek },
  { id: "aud-12", entityType: "PMT", entityId: "pmt-1", action: "STATUS_CHANGE", oldValue: "APPROVED", newValue: "COMPLETED", userId: "user-8", userName: "Ngô Thị Hà", timestamp: lastWeek },
]
