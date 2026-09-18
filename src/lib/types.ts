export type Scope = "OWN" | "DEPARTMENT" | "BRANCH" | "COMPANY"
export type SodRole = "REQUESTER" | "APPROVER" | "EXECUTOR" | "AUDITOR"

export interface AppUser {
  id: string
  employee_code: string
  full_name: string
  email: string
  position: string
  department_id: string
  branch_id: string
  department_name: string
  department_code: string
  branch_name: string
  branch_code: string
  status: string
}

export interface Permission {
  resource: string
  action: string
  scope: Scope
}

export interface MeResponse {
  ok: boolean
  user: AppUser
  roles: { code: string; name: string }[]
  permissions: Permission[]
  unread_notifications: number
}

export interface Branch { id: string; code: string; name: string }
export interface Department { id: string; code: string; name: string; branch_id: string; branch_code: string }
export interface Warehouse { id: string; code: string; name: string; branch_id: string; branch_code: string }
export interface Partner {
  id: string; code: string; name: string; partner_type: "CUSTOMER" | "SUPPLIER" | "BOTH"
  tax_code?: string; address?: string; phone?: string; payment_terms_days: number; credit_limit: number; status: string
}
export interface Product {
  id: string; code: string; name: string; unit: string; product_type: string
  inventory_account: string; standard_cost?: number; sale_price: number; status: string
}
export interface Account { code: string; name: string; account_type: string; normal_balance: string }
export interface Bom { id: string; code: string; product_id: string; product_name: string; output_qty: number; lines: { product_id: string; product_name: string; unit: string; quantity: number }[] }
export interface Role { code: string; name: string; description: string; sort: number }
export interface DirectoryUser {
  id: string; full_name: string; employee_code: string; position: string
  department_id: string; branch_id: string; status: string; roles: string[]
}
export interface DocTypeRow { code: string; name: string; prefix: string; flow_code: string; module: string; initial_status: string; terminal_statuses: string[] }
export interface Period { period: string; start_date: string; end_date: string; status: "OPEN" | "SOFT_CLOSE" | "HARD_CLOSE" }

export interface MasterData {
  branches: Branch[]
  departments: Department[]
  warehouses: Warehouse[]
  partners: Partner[]
  products: Product[]
  accounts: Account[]
  boms: Bom[]
  roles: Role[]
  users: DirectoryUser[]
  doc_types: DocTypeRow[]
  periods: Period[]
}

export interface DocumentRow {
  id: string
  doc_type: string
  doc_type_name: string
  number: string
  status: string
  title: string | null
  branch_id: string
  branch_code: string
  department_id: string
  department_name: string
  cost_center_id: string | null
  cost_center_name: string | null
  partner_id: string | null
  partner_name: string | null
  partner_code: string | null
  warehouse_id: string | null
  warehouse_name: string | null
  to_warehouse_id: string | null
  to_warehouse_name: string | null
  product_id: string | null
  product_name: string | null
  product_code: string | null
  product_unit: string | null
  employee_name: string | null
  doc_date: string
  due_date: string | null
  amount?: number
  data: Record<string, any>
  created_by: string
  created_by_name: string
  owner_id: string | null
  owner_name: string | null
  version: number
  created_at: string
  updated_at: string
  is_terminal: boolean
  flow_code: string
  module: string
  _masked?: string[]
}

export interface DocLine {
  id: string
  line_no: number
  product_id: string | null
  product_code: string | null
  product_name: string | null
  unit: string | null
  description: string | null
  quantity: number
  unit_price?: number
  amount?: number
  account_code: string | null
  account_name: string | null
  debit?: number
  credit?: number
  source_line_id: string | null
  source_document_id: string | null
  source_document_number: string | null
  data: Record<string, any>
  progress: Record<string, number> | null
  _masked?: string[]
}

export interface DocRef {
  id: string
  number: string
  doc_type: string
  doc_type_name: string
  status: string
  title: string | null
  link_type: string | null
  created_at: string
  can_view: boolean
}

export interface SodConflict {
  existing_role: SodRole
  attempted_role: SodRole
  document_id: string
  document_number: string
  doc_type: string
  action: string
  rule: string
}

export interface AvailableAction {
  kind: "transition" | "create"
  action?: string
  child_type?: string
  label: string
  to_status?: string
  style: "primary" | "success" | "danger" | "default"
  sod_role?: SodRole | null
  conditions?: string[]
  sod_conflict: SodConflict | null
  /** vai trò sẽ phụ trách sau khi hành động này hoàn tất — "làm xong thì việc của ai?" */
  next_owner_label?: string | null
}

export interface ActionRecord {
  id: string
  action: string
  label: string
  from_status: string | null
  to_status: string | null
  user_id: string
  user_name: string
  position: string
  user_roles: string[]
  department_name: string
  sod_role: SodRole | null
  comment: string | null
  created_at: string
}

export interface HandoffRecord {
  id: string
  to_role: string
  to_role_name: string
  expected_action: string
  from_user_name: string | null
  from_department: string | null
  to_user_name: string | null
  to_department: string | null
  status: string
  initiated_at: string
  completed_at: string | null
  sla_due_at: string
  sla_status: "ON_TIME" | "AT_RISK" | "BREACHED" | "CANCELLED"
  cross_department: boolean
}

export interface DocumentDetail {
  ok: boolean
  document: DocumentRow
  lines: DocLine[]
  parents: DocRef[]
  children: DocRef[]
  actions: ActionRecord[]
  available_actions: AvailableAction[]
  handoffs: HandoffRecord[]
  gl_entries: { account_code: string; account_name: string; debit: number; credit: number; posting_date: string; period: string; description: string; partner_name: string | null }[] | null
  stock_moves: { id: string; move_type: string; qty: number; unit_cost?: number; value?: number; remaining_qty: number; product_code: string; product_name: string; unit: string; warehouse_name: string; source_document_number: string | null; created_at: string }[] | null
  audit: { id: number; table_name: string; action: string; old_value: any; new_value: any; changed_fields: string[] | null; user_name: string; created_at: string }[] | null
  sod_checks: { action: string; user_name: string; attempted_role: string; conflicting_role: string | null; result: string; detail: string | null; checked_at: string }[] | null
  transitions: { from: string; to: string; label: string; sod_role: string | null; system_only: boolean; permission: string; actor_label: string | null }[]
  budget: { planned: number; committed: number; actual: number; usage: { document_id: string; number: string; doc_type: string; usage_type: string; amount: number; created_at: string }[] } | null
  /** vai trò đang "giữ bóng" ở trạng thái hiện tại; null nếu chứng từ đã kết thúc (terminal) */
  current_owner_label: string | null
}
