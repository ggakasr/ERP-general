-- ERP General - Initial Database Schema
-- Run this in Supabase SQL editor when ready to connect

-- ============================================================
-- L1: FOUNDATION DATA
-- ============================================================

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  branch_id UUID REFERENCES branches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  department_id UUID REFERENCES departments(id),
  branch_id UUID REFERENCES branches(id),
  position VARCHAR(255),
  roles JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  auth_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE permission_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES roles(id),
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT')),
  data_scope VARCHAR(20) DEFAULT 'OWN' CHECK (data_scope IN ('OWN', 'DEPARTMENT', 'BRANCH', 'COMPANY')),
  field_restrictions JSONB,
  conditions JSONB,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  UNIQUE(role_id, resource, action)
);

-- ============================================================
-- L1: MASTER DATA
-- ============================================================

CREATE TABLE master_data_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  attributes JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, code)
);

CREATE TABLE data_dictionary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term VARCHAR(100) UNIQUE NOT NULL,
  definition TEXT NOT NULL,
  data_type VARCHAR(50),
  domain VARCHAR(50),
  used_in_tables JSONB,
  validation_rules JSONB,
  aliases JSONB,
  status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- ============================================================
-- L2: TRANSACTIONS - Procurement
-- ============================================================

CREATE TABLE purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  department_id UUID REFERENCES departments(id),
  status VARCHAR(30) DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  total_amount DECIMAL(18,2) DEFAULT 0,
  justification TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  pr_id UUID REFERENCES purchase_requisitions(id),
  supplier_id UUID,
  supplier_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  total_amount DECIMAL(18,2) DEFAULT 0,
  created_by UUID REFERENCES users(id) NOT NULL,
  approved_by UUID REFERENCES users(id),
  executed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goods_receipt_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  po_id UUID REFERENCES purchase_orders(id),
  po_number VARCHAR(30),
  supplier_id UUID,
  supplier_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  inspected_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- L2: TRANSACTIONS - Sales
-- ============================================================

CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  customer_id UUID,
  customer_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  total_amount DECIMAL(18,2) DEFAULT 0,
  valid_until DATE,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  quotation_id UUID REFERENCES quotations(id),
  customer_id UUID,
  customer_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  total_amount DECIMAL(18,2) DEFAULT 0,
  delivery_date DATE,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  so_id UUID REFERENCES sales_orders(id),
  customer_id UUID,
  customer_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  total_amount DECIMAL(18,2) DEFAULT 0,
  paid_amount DECIMAL(18,2) DEFAULT 0,
  due_date DATE,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- L2: TRANSACTIONS - Inventory, Production, Finance, HR, Assets
-- ============================================================

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(50) UNIQUE NOT NULL,
  warehouse_id UUID,
  warehouse_name VARCHAR(255),
  quantity DECIMAL(18,4) DEFAULT 0,
  reserved_qty DECIMAL(18,4) DEFAULT 0,
  unit VARCHAR(20),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  from_warehouse_id UUID,
  from_warehouse_name VARCHAR(255),
  to_warehouse_id UUID,
  to_warehouse_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  bom_id UUID,
  product_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'PLANNED',
  planned_qty INTEGER DEFAULT 0,
  completed_qty INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  period VARCHAR(10),
  description TEXT,
  status VARCHAR(30) DEFAULT 'DRAFT',
  lines JSONB NOT NULL DEFAULT '[]',
  total_debit DECIMAL(18,2) DEFAULT 0,
  total_credit DECIMAL(18,2) DEFAULT 0,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  payee_type VARCHAR(20),
  payee_id UUID,
  payee_name VARCHAR(255),
  amount DECIMAL(18,2) DEFAULT 0,
  method VARCHAR(20),
  reference_doc VARCHAR(30),
  status VARCHAR(30) DEFAULT 'DRAFT',
  created_by UUID REFERENCES users(id) NOT NULL,
  approved_by UUID REFERENCES users(id),
  executed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  status VARCHAR(30) DEFAULT 'DRAFT',
  acquisition_date DATE,
  acquisition_cost DECIMAL(18,2) DEFAULT 0,
  current_value DECIMAL(18,2) DEFAULT 0,
  depreciation_method VARCHAR(30) DEFAULT 'STRAIGHT_LINE',
  useful_life_months INTEGER,
  assigned_to UUID REFERENCES users(id),
  location VARCHAR(255),
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  customer_id UUID,
  customer_name VARCHAR(255),
  subject VARCHAR(500),
  description TEXT,
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  status VARCHAR(30) DEFAULT 'OPEN',
  assigned_to UUID REFERENCES users(id),
  sla_deadline TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  fiscal_year INTEGER NOT NULL,
  department_id UUID REFERENCES departments(id),
  department_name VARCHAR(255),
  status VARCHAR(30) DEFAULT 'DRAFT',
  total_planned DECIMAL(18,2) DEFAULT 0,
  total_actual DECIMAL(18,2) DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- L4: CONTROLS & COMPLIANCE
-- ============================================================

-- Audit Trail: INSERT ONLY - no UPDATE, no DELETE
CREATE TABLE audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(30) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  user_id UUID REFERENCES users(id) NOT NULL,
  user_name VARCHAR(255),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET
);

CREATE INDEX idx_audit_trail_entity ON audit_trail(entity_type, entity_id, timestamp);
CREATE INDEX idx_audit_trail_user ON audit_trail(user_id, timestamp);

-- SoD Matrix
CREATE TABLE sod_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_a VARCHAR(50) NOT NULL,
  role_b VARCHAR(50) NOT NULL,
  conflict_type VARCHAR(10) DEFAULT 'HARD' CHECK (conflict_type IN ('HARD', 'SOFT')),
  description TEXT,
  business_flows JSONB
);

-- SoD Check Log
CREATE TABLE sod_check_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  transaction_type VARCHAR(50),
  user_id UUID REFERENCES users(id),
  user_name VARCHAR(255),
  attempted_role VARCHAR(50),
  conflicting_role VARCHAR(50),
  result VARCHAR(20) CHECK (result IN ('PASSED', 'BLOCKED', 'OVERRIDE_APPROVED')),
  override_approved_by UUID REFERENCES users(id),
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exception Register
CREATE TABLE exception_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number VARCHAR(30) UNIQUE NOT NULL,
  exception_type VARCHAR(30),
  severity VARCHAR(20),
  description TEXT NOT NULL,
  affected_document_id UUID,
  affected_document_type VARCHAR(50),
  raised_by UUID REFERENCES users(id) NOT NULL,
  approved_by UUID REFERENCES users(id),
  resolution TEXT,
  root_cause TEXT,
  preventive_action TEXT,
  status VARCHAR(30) DEFAULT 'RAISED',
  raised_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  CONSTRAINT exc_sod CHECK (approved_by IS NULL OR approved_by != raised_by)
);

-- Document Chain
CREATE TABLE document_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_number VARCHAR(30) NOT NULL,
  parent_document_id UUID,
  parent_document_type VARCHAR(50),
  flow_code VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doc_chain_doc ON document_chain(document_type, document_id);
CREATE INDEX idx_doc_chain_parent ON document_chain(parent_document_type, parent_document_id);

-- ============================================================
-- SECURITY: Row Level Security (RLS)
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- Audit trail: everyone can read, only system can insert, nobody can update/delete
CREATE POLICY audit_trail_read ON audit_trail FOR SELECT USING (true);
CREATE POLICY audit_trail_insert ON audit_trail FOR INSERT WITH CHECK (true);
-- No UPDATE or DELETE policy = immutable

-- ============================================================
-- SEED DATA: SoD Matrix
-- ============================================================

INSERT INTO sod_matrix (role_a, role_b, conflict_type, description) VALUES
  ('REQUESTER', 'APPROVER', 'HARD', 'Nguoi de xuat khong duoc phe duyet'),
  ('APPROVER', 'EXECUTOR', 'HARD', 'Nguoi phe duyet khong duoc thuc hien'),
  ('EXECUTOR', 'AUDITOR', 'HARD', 'Nguoi thuc hien khong duoc kiem tra'),
  ('REQUESTER', 'EXECUTOR', 'HARD', 'Nguoi de xuat khong duoc thuc hien');
