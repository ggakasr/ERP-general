export type DocumentStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "SENT"
  | "CONFIRMED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "INVOICED"
  | "PAID"
  | "OVERDUE"
  | "PARTIALLY_PAID"
  | "PARTIALLY_SHIPPED"
  | "SHIPPED"
  | "INSPECTED"
  | "ACCEPTED"
  | "STORED"
  | "MATERIAL_READY"
  | "IN_PRODUCTION"
  | "QC"
  | "CALCULATED"
  | "REVIEWED"
  | "POSTED"
  | "REVERSED"
  | "OPEN"
  | "ASSIGNED"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "ACTIVE"
  | "UNDER_MAINTENANCE"
  | "DISPOSED"
  | "SOFT_CLOSE"
  | "HARD_CLOSE"
  | "ARCHIVED"
  | "PLANNED"
  | "RAISED"
  | "UNDER_REVIEW"

export type SodRole = "REQUESTER" | "APPROVER" | "EXECUTOR" | "AUDITOR"
export type DataScope = "OWN" | "DEPARTMENT" | "BRANCH" | "COMPANY"
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED"

export interface Branch {
  id: string
  name: string
  code: string
}

export interface Department {
  id: string
  name: string
  code: string
  branchId: string
}

export interface Role {
  id: string
  name: string
  code: string
  permissions: Permission[]
}

export interface Permission {
  resource: string
  action: string[]
  dataScope: DataScope
}

export interface User {
  id: string
  employeeCode: string
  fullName: string
  email: string
  departmentId: string
  branchId: string
  position: string
  roles: string[]
  status: UserStatus
  avatar?: string
}

export interface BaseDocument {
  id: string
  number: string
  status: DocumentStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  notes?: string
}

export interface LineItem {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  amount: number
  unit?: string
}

export interface PurchaseRequisition extends BaseDocument {
  type: "PR"
  departmentId: string
  items: LineItem[]
  totalAmount: number
  justification?: string
}

export interface PurchaseOrder extends BaseDocument {
  type: "PO"
  prId?: string
  supplierId: string
  supplierName: string
  items: LineItem[]
  totalAmount: number
  approvedBy?: string
  executedBy?: string
}

export interface GoodsReceiptNote extends BaseDocument {
  type: "GRN"
  poId: string
  poNumber: string
  supplierId: string
  supplierName: string
  items: (LineItem & { receivedQty: number; acceptedQty: number })[]
  inspectedBy?: string
}

export interface Quotation extends BaseDocument {
  type: "QUOT"
  customerId: string
  customerName: string
  items: LineItem[]
  totalAmount: number
  validUntil: string
}

export interface SalesOrder extends BaseDocument {
  type: "SO"
  quotationId?: string
  customerId: string
  customerName: string
  items: LineItem[]
  totalAmount: number
  deliveryDate?: string
}

export interface SalesInvoice extends BaseDocument {
  type: "INV"
  soId?: string
  customerId: string
  customerName: string
  items: LineItem[]
  totalAmount: number
  paidAmount: number
  dueDate: string
}

export interface InventoryItem {
  id: string
  productName: string
  sku: string
  warehouseId: string
  warehouseName: string
  quantity: number
  reservedQty: number
  unit: string
  lastUpdated: string
}

export interface StockTransfer extends BaseDocument {
  type: "ST"
  fromWarehouseId: string
  fromWarehouseName: string
  toWarehouseId: string
  toWarehouseName: string
  items: (LineItem & { transferQty: number })[]
}

export interface BillOfMaterials {
  id: string
  productName: string
  productCode: string
  components: { materialName: string; quantity: number; unit: string }[]
  status: "ACTIVE" | "DRAFT" | "DEPRECATED"
}

export interface WorkOrder extends BaseDocument {
  type: "WO"
  bomId: string
  productName: string
  plannedQty: number
  completedQty: number
  startDate: string
  endDate?: string
}

export interface Employee {
  id: string
  userId: string
  fullName: string
  position: string
  departmentId: string
  departmentName: string
  baseSalary: number
  startDate: string
  status: "ACTIVE" | "ON_LEAVE" | "TERMINATED"
}

export interface PayrollRun extends BaseDocument {
  type: "PAY"
  period: string
  employeeCount: number
  totalGross: number
  totalDeductions: number
  totalNet: number
  entries: PayrollEntry[]
}

export interface PayrollEntry {
  employeeId: string
  employeeName: string
  baseSalary: number
  allowances: number
  deductions: number
  netSalary: number
}

export interface JournalEntry extends BaseDocument {
  type: "JV"
  period: string
  description: string
  lines: JournalLine[]
  totalDebit: number
  totalCredit: number
}

export interface JournalLine {
  accountCode: string
  accountName: string
  debit: number
  credit: number
  description?: string
}

export interface Payment extends BaseDocument {
  type: "PMT"
  payeeType: "SUPPLIER" | "EMPLOYEE" | "OTHER"
  payeeId: string
  payeeName: string
  amount: number
  method: "BANK_TRANSFER" | "CASH" | "CHECK"
  referenceDoc?: string
  approvedBy?: string
  executedBy?: string
}

export interface Asset extends BaseDocument {
  type: "ASSET"
  name: string
  category: string
  acquisitionDate: string
  acquisitionCost: number
  currentValue: number
  depreciationMethod: "STRAIGHT_LINE" | "DECLINING_BALANCE"
  usefulLifeMonths: number
  assignedTo?: string
  location?: string
}

export interface ServiceTicket extends BaseDocument {
  type: "TICKET"
  customerId: string
  customerName: string
  subject: string
  description: string
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  assignedTo?: string
  resolvedAt?: string
  slaDeadline: string
}

export interface Budget extends BaseDocument {
  type: "BUDGET"
  fiscalYear: number
  departmentId: string
  departmentName: string
  totalPlanned: number
  totalActual: number
  lines: BudgetLine[]
}

export interface BudgetLine {
  id: string
  category: string
  planned: number
  actual: number
  variance: number
}

export interface AuditTrailEntry {
  id: string
  entityType: string
  entityId: string
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | "APPROVE" | "REJECT" | "SOD_VIOLATION"
  oldValue?: string
  newValue?: string
  userId: string
  userName: string
  timestamp: string
  ipAddress?: string
}

export interface SodCheckLog {
  id: string
  transactionId: string
  transactionType: string
  userId: string
  userName: string
  attemptedRole: SodRole
  conflictingRole: SodRole
  result: "PASSED" | "BLOCKED"
  checkedAt: string
}

export interface ExceptionRecord extends BaseDocument {
  type: "EXC"
  exceptionType: "PROCESS_DEVIATION" | "DATA_MISMATCH" | "SLA_BREACH" | "POLICY_OVERRIDE" | "SYSTEM_ERROR"
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  description: string
  affectedDocumentId?: string
  affectedDocumentType?: string
  raisedBy: string
  approvedBy?: string
  resolution?: string
  rootCause?: string
}

export type AnyDocument =
  | PurchaseRequisition
  | PurchaseOrder
  | GoodsReceiptNote
  | Quotation
  | SalesOrder
  | SalesInvoice
  | StockTransfer
  | WorkOrder
  | PayrollRun
  | JournalEntry
  | Payment
  | Asset
  | ServiceTicket
  | Budget
  | ExceptionRecord
