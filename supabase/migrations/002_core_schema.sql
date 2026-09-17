-- ERP General — 002 Core schema (unified document engine)
-- Replaces the per-type tables from 001 (they were empty) with a unified model:
--   L1 foundation/master data, L2 documents + lines + links, L3 state machine/handoff,
--   L4 SoD / audit / exceptions, ledgers for money (gl_entries) and goods (stock_moves).

-- ------------------------------------------------------------
-- Drop legacy 001 tables
-- ------------------------------------------------------------
DROP TABLE IF EXISTS
  document_chain, exception_register, sod_check_log, sod_matrix, audit_trail,
  budgets, service_tickets, assets, payments, journal_entries, work_orders,
  stock_transfers, inventory_items, sales_invoices, sales_orders, quotations,
  goods_receipt_notes, purchase_orders, purchase_requisitions, data_dictionary,
  master_data_catalog, permission_matrix, roles, users, departments, branches
CASCADE;

CREATE OR REPLACE FUNCTION fn_now() RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.fake_now', true), '')::timestamptz, now())
$$;

-- ============================================================
-- L1: ORGANISATION & SECURITY
-- ============================================================
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  address text,
  created_at timestamptz DEFAULT fn_now()
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id),
  created_at timestamptz DEFAULT fn_now()
);

-- BM-01 User directory. id = auth.users.id
CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  employee_code text UNIQUE NOT NULL,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  department_id uuid NOT NULL REFERENCES departments(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  position text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  created_at timestamptz DEFAULT fn_now(),
  updated_at timestamptz DEFAULT fn_now()
);

CREATE TABLE roles (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  sort int DEFAULT 0
);

CREATE TABLE user_roles (
  user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  role_code text REFERENCES roles(code),
  granted_by uuid REFERENCES app_users(id),
  granted_at timestamptz DEFAULT fn_now(),
  PRIMARY KEY (user_id, role_code)
);

-- BM-12 3-tier permission matrix: action × data scope × field restrictions
CREATE TABLE permission_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code text NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  resource text NOT NULL,
  action text NOT NULL CHECK (action IN ('VIEW','CREATE','EDIT','APPROVE','EXECUTE','AUDIT','EXPORT')),
  data_scope text NOT NULL DEFAULT 'OWN' CHECK (data_scope IN ('OWN','DEPARTMENT','BRANCH','COMPANY')),
  field_restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"hidden": ["unit_price","amount"]}
  status text NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (role_code, resource, action)
);

-- BM-06 SoD matrix
CREATE TABLE sod_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_a text NOT NULL,
  role_b text NOT NULL,
  conflict_type text NOT NULL DEFAULT 'HARD' CHECK (conflict_type IN ('HARD','SOFT')),
  description text,
  UNIQUE (role_a, role_b)
);

-- ============================================================
-- L1: MASTER DATA (BM-08)
-- ============================================================
CREATE TABLE accounts (
  code text PRIMARY KEY,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('D','C'))
);

CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  partner_type text NOT NULL CHECK (partner_type IN ('CUSTOMER','SUPPLIER','BOTH')),
  tax_code text,
  address text,
  phone text,
  payment_terms_days int DEFAULT 30,
  credit_limit numeric(18,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz DEFAULT fn_now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  unit text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('RAW','FINISHED','GOODS','SUPPLY','SERVICE')),
  inventory_account text REFERENCES accounts(code),
  standard_cost numeric(18,2) DEFAULT 0,
  sale_price numeric(18,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz DEFAULT fn_now()
);

CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id)
);

CREATE TABLE boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  output_qty numeric(18,4) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id uuid NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(18,4) NOT NULL
);

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  user_id uuid REFERENCES app_users(id),
  full_name text NOT NULL,
  department_id uuid NOT NULL REFERENCES departments(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  position text,
  base_salary numeric(18,2) NOT NULL DEFAULT 0,
  allowance numeric(18,2) NOT NULL DEFAULT 0,
  dependents int NOT NULL DEFAULT 0,
  bank_account text,
  start_date date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_LEAVE','TERMINATED')),
  source_document_id uuid,
  created_at timestamptz DEFAULT fn_now()
);

CREATE TABLE fiscal_periods (
  period text PRIMARY KEY,                 -- YYYY-MM
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SOFT_CLOSE','HARD_CLOSE')),
  changed_by uuid REFERENCES app_users(id),
  changed_at timestamptz
);

-- ============================================================
-- L2/L3: DOCUMENT ENGINE
-- ============================================================
CREATE TABLE doc_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  prefix text NOT NULL,
  flow_code text NOT NULL,          -- L1..L11
  module text NOT NULL,
  initial_status text NOT NULL,
  terminal_statuses text[] NOT NULL DEFAULT '{}',
  financial boolean NOT NULL DEFAULT false,
  create_sod_role text,             -- SoD role taken by the creator (usually REQUESTER)
  sort int DEFAULT 0
);

-- BM-05 state machine definitions
CREATE TABLE state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL REFERENCES doc_types(code),
  from_status text NOT NULL,
  to_status text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  permission_action text NOT NULL,          -- VIEW/CREATE/EDIT/APPROVE/EXECUTE/AUDIT
  permission_resource text,                 -- defaults to doc_type
  sod_role text CHECK (sod_role IN ('REQUESTER','APPROVER','EXECUTOR','AUDITOR')),
  conditions text[] NOT NULL DEFAULT '{}',
  style text DEFAULT 'default',
  system_only boolean NOT NULL DEFAULT false,
  sort int DEFAULT 0,
  UNIQUE (doc_type, from_status, action)
);

-- which child documents can be created from a parent in a given status
CREATE TABLE doc_child_rules (
  parent_type text REFERENCES doc_types(code),
  child_type text REFERENCES doc_types(code),
  parent_statuses text[] NOT NULL,
  label text NOT NULL,
  PRIMARY KEY (parent_type, child_type)
);

CREATE TABLE doc_sequences (
  prefix text,
  yyyymm text,
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, yyyymm)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL REFERENCES doc_types(code),
  number text UNIQUE NOT NULL,
  status text NOT NULL,
  title text,
  branch_id uuid NOT NULL REFERENCES branches(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  cost_center_id uuid REFERENCES departments(id),    -- budget owner department
  partner_id uuid REFERENCES partners(id),
  warehouse_id uuid REFERENCES warehouses(id),
  to_warehouse_id uuid REFERENCES warehouses(id),
  product_id uuid REFERENCES products(id),
  employee_id uuid REFERENCES employees(id),
  doc_date date NOT NULL DEFAULT (fn_now())::date,
  due_date date,
  period text,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES app_users(id),
  owner_id uuid REFERENCES app_users(id),            -- assignee (tickets) / responsible
  version int NOT NULL DEFAULT 1,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT fn_now(),
  updated_at timestamptz NOT NULL DEFAULT fn_now()
);
CREATE INDEX idx_documents_type_status ON documents(doc_type, status);
CREATE INDEX idx_documents_branch ON documents(branch_id);
CREATE INDEX idx_documents_dept ON documents(department_id);
CREATE INDEX idx_documents_created_by ON documents(created_by);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

CREATE TABLE document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  product_id uuid REFERENCES products(id),
  description text,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  account_code text REFERENCES accounts(code),
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  source_line_id uuid REFERENCES document_lines(id),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_lines_doc ON document_lines(document_id);
CREATE INDEX idx_lines_source ON document_lines(source_line_id);

-- BM-09 document chain
CREATE TABLE document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES documents(id),
  child_id uuid NOT NULL REFERENCES documents(id),
  link_type text NOT NULL DEFAULT 'SOURCE' CHECK (link_type IN ('SOURCE','EXCEPTION','DEPRECIATION','REFERENCE')),
  created_at timestamptz DEFAULT fn_now(),
  UNIQUE (parent_id, child_id)
);
CREATE INDEX idx_links_child ON document_links(child_id);

-- Responsibility ledger: every business action (who, which role, which dept)
CREATE TABLE document_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id),
  action text NOT NULL,
  from_status text,
  to_status text,
  user_id uuid NOT NULL REFERENCES app_users(id),
  sod_role text,
  user_roles text[] NOT NULL DEFAULT '{}',
  department_id uuid REFERENCES departments(id),
  comment text,
  created_at timestamptz NOT NULL DEFAULT fn_now()
);
CREATE INDEX idx_actions_doc ON document_actions(document_id, created_at);
CREATE INDEX idx_actions_user ON document_actions(user_id, created_at);

-- BM-02 ownership matrix
CREATE TABLE ownership_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_code text NOT NULL,
  business_process text NOT NULL,
  doc_types text[] NOT NULL DEFAULT '{}',
  owner_user_id uuid NOT NULL REFERENCES app_users(id),
  deputy_user_id uuid REFERENCES app_users(id),
  department_id uuid REFERENCES departments(id),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  CHECK (deputy_user_id IS NULL OR deputy_user_id <> owner_user_id)
);

-- BM-04 handoff map + runtime records
CREATE TABLE handoff_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_code text NOT NULL,
  doc_type text NOT NULL REFERENCES doc_types(code),
  trigger_status text NOT NULL,
  to_role text NOT NULL REFERENCES roles(code),
  expected_action text NOT NULL,
  sla_hours int NOT NULL DEFAULT 24,
  status text NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (doc_type, trigger_status, to_role)
);

CREATE TABLE handoff_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_map_id uuid NOT NULL REFERENCES handoff_map(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  from_user_id uuid REFERENCES app_users(id),
  from_department_id uuid REFERENCES departments(id),
  to_role text NOT NULL,
  to_user_id uuid REFERENCES app_users(id),
  to_department_id uuid REFERENCES departments(id),
  status text NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED','COMPLETED','CANCELLED')),
  initiated_at timestamptz NOT NULL DEFAULT fn_now(),
  sla_due_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX idx_handoff_doc ON handoff_records(document_id);
CREATE INDEX idx_handoff_open ON handoff_records(status, to_role);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  title text NOT NULL,
  body text,
  document_id uuid REFERENCES documents(id),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT fn_now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- LEDGERS: goods (FIFO lots) and money (general ledger)
-- ============================================================
CREATE TABLE stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id),
  line_id uuid REFERENCES document_lines(id),
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  move_type text NOT NULL,
  qty numeric(18,4) NOT NULL,                  -- + in / - out
  unit_cost numeric(18,2) NOT NULL DEFAULT 0,
  remaining_qty numeric(18,4) NOT NULL DEFAULT 0, -- inbound lots only
  source_move_id uuid REFERENCES stock_moves(id), -- out: lot consumed; transfer-in: origin out move
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT fn_now()
);
CREATE INDEX idx_moves_product_wh ON stock_moves(product_id, warehouse_id, created_at);
CREATE INDEX idx_moves_doc ON stock_moves(document_id);
CREATE INDEX idx_moves_source ON stock_moves(source_move_id);

CREATE TABLE gl_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id),
  posting_date date NOT NULL,
  period text NOT NULL REFERENCES fiscal_periods(period),
  account_code text NOT NULL REFERENCES accounts(code),
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  partner_id uuid REFERENCES partners(id),
  branch_id uuid REFERENCES branches(id),
  department_id uuid REFERENCES departments(id),
  description text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT fn_now()
);
CREATE INDEX idx_gl_period_account ON gl_entries(period, account_code);
CREATE INDEX idx_gl_doc ON gl_entries(document_id);

-- Budget consumption (commitment at PO approval, actual at invoice/expense posting)
CREATE TABLE budget_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES documents(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  usage_type text NOT NULL CHECK (usage_type IN ('COMMITTED','ACTUAL')),
  account_code text,
  amount numeric(18,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT fn_now()
);
CREATE INDEX idx_budget_usage ON budget_usage(budget_id);

-- ============================================================
-- L4: CONTROLS
-- ============================================================
-- Audit trail: append-only (enforced by trigger + grants)
CREATE TABLE audit_trail (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  changed_fields text[],
  user_id uuid,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT fn_now()
);
CREATE INDEX idx_audit_record ON audit_trail(table_name, record_id, created_at);
CREATE INDEX idx_audit_user ON audit_trail(user_id, created_at);
CREATE INDEX idx_audit_created ON audit_trail(created_at DESC);

CREATE TABLE sod_check_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  doc_type text,
  document_number text,
  action text,
  user_id uuid REFERENCES app_users(id),
  attempted_role text,
  conflicting_role text,
  conflicting_document_id uuid,
  result text NOT NULL CHECK (result IN ('PASSED','BLOCKED','OVERRIDE_APPROVED')),
  detail text,
  checked_at timestamptz NOT NULL DEFAULT fn_now()
);
CREATE INDEX idx_sod_log ON sod_check_log(result, checked_at DESC);

-- ============================================================
-- GOVERNANCE CATALOGS (BM-03, BM-07, BM-10, BM-13, BM-14)
-- ============================================================
CREATE TABLE data_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text UNIQUE NOT NULL,
  definition text NOT NULL,
  data_type text,
  domain text,
  used_in text[],
  status text DEFAULT 'ACTIVE'
);

CREATE TABLE kpi_catalog (
  code text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('FINANCIAL','OPERATIONAL','COMPLIANCE','CUSTOMER')),
  formula text NOT NULL,
  target_value numeric,
  target_unit text,
  direction text NOT NULL DEFAULT 'HIGHER' CHECK (direction IN ('HIGHER','LOWER')),
  owner_department_code text,
  flow_code text
);

CREATE TABLE shadow_it_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  it_type text NOT NULL CHECK (it_type IN ('SPREADSHEET','EXTERNAL_APP','MANUAL_PROCESS','EMAIL_BASED')),
  department_id uuid REFERENCES departments(id),
  description text,
  risk_level text CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  migration_target_module text,
  migration_status text NOT NULL DEFAULT 'IDENTIFIED'
    CHECK (migration_status IN ('IDENTIFIED','PLANNED','IN_PROGRESS','MIGRATED','DECOMMISSIONED')),
  target_date date
);

CREATE TABLE impact_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_type text NOT NULL CHECK (change_type IN ('PROCESS','DATA','SYSTEM','ORGANIZATION')),
  description text NOT NULL,
  affected_flows text[],
  severity text CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  mitigation_plan text,
  status text NOT NULL DEFAULT 'IDENTIFIED'
);

CREATE TABLE acceptance_criteria (
  test_code text PRIMARY KEY,
  test_group text NOT NULL,
  title text NOT NULL,
  related_flow text,
  is_blocker boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'NOT_TESTED' CHECK (status IN ('NOT_TESTED','PASSED','FAILED','BLOCKED')),
  evidence text,
  tested_at timestamptz
);
