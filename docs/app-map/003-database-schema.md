---
covers: supabase/migrations/002_core_schema.sql, supabase/migrations/003_config.sql, supabase/migrations/007_flow_ownership.sql, supabase/migrations/008_product_profit.sql, supabase/migrations/009_vat.sql, supabase/migrations/010_email_outbox.sql
last_verified: 2026-09-20
ttl_days: 30
---

# 003 — Database Schema

## Overview

All business logic lives in PostgreSQL (Supabase). The schema is built by numbered migration
files in `supabase/migrations/`. Migrations run in order; never edit a deployed migration —
always create a new numbered file for schema changes.

---

## Migration Files

### 001_initial_schema.sql — Bootstrap
- Enables required PostgreSQL extensions: `uuid-ossp`, `pg_trgm`, `unaccent`
- Creates Supabase auth schema hooks
- Sets up `public` search path

### 002_core_schema.sql — Core Tables (38 tables)

**Identity & Organisation**

| Table | Purpose |
|---|---|
| `users` | ERP users extending `auth.users`; columns: id, employee_code, full_name, email, department_id, branch_id, position, status |
| `roles` | Role definitions (23 roles) |
| `user_roles` | Many-to-many: user ↔ role |
| `departments` | Organisational units |
| `branches` | Physical branches |
| `cost_centers` | Cost centre hierarchy |

**Document Engine**

| Table | Purpose |
|---|---|
| `doc_types` | Document type registry: code, name, prefix, allowed states, perm_resource, perm_action, sod_role config |
| `state_transitions` | Data-driven state machine: doc_type, from_status, action, to_status, perm_action, perm_resource, sod_role, conditions[] |
| `doc_child_rules` | Rules for auto-creating child documents on transition (e.g. PO APPROVED → auto-create GRN shell) |
| `documents` | Central document store: id, doc_type, doc_number, status, version, header JSONB, created_by, branch_id, department_id, parent_id |
| `document_lines` | Line items: doc_id, line_num, product_id, qty, unit_price, amount, metadata JSONB |

**Financial**

| Table | Purpose |
|---|---|
| `chart_of_accounts` | Account hierarchy: code, name, type (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE) |
| `gl_entries` | General ledger: doc_id, account_code, debit, credit, period, posted_at (INSERT only) |
| `fiscal_periods` | Period registry: period (YYYY-MM), status (OPEN/SOFT_CLOSE/HARD_CLOSE/ARCHIVED) |

**Inventory**

| Table | Purpose |
|---|---|
| `master_data` | Unified master: category (CUSTOMER/SUPPLIER/PRODUCT/WAREHOUSE/…), code, name, attributes JSONB |
| `stock_ledger` | FIFO inventory ledger: product_id, warehouse_id, doc_id, qty_in, qty_out, unit_cost, running_qty, running_value (INSERT only) |

**Controls & Compliance**

| Table | Purpose |
|---|---|
| `permission_matrix` | 3-tier permissions: role_id, resource, action, data_scope, field_restrictions JSONB |
| `sod_matrix` | SoD conflict pairs: role_a, role_b, conflict_type (HARD/SOFT), business_flows JSONB |
| `sod_log` | Append-only SoD check results: user_id, doc_id, attempted_role, conflicting_role, result (PASSED/BLOCKED/OVERRIDE_APPROVED) |
| `audit_trail` | Immutable change log: entity_type, entity_id, action, old_value JSONB, new_value JSONB, user_id, ip_address, timestamp (INSERT only, no UPDATE/DELETE) |
| `exception_register` | Exception workflow records (BM-11): type, severity, raised_by, approved_by (≠ raised_by), status |
| `handoff_map` | Static handoff definitions per flow: from_dept, to_dept, trigger_event, doc_type, sla_hours |
| `handoff_records` | Runtime handoff instances: handoff_map_id, doc_id, from_user, to_user, initiated_at, sla_status |

**Analytics**

| Table | Purpose |
|---|---|
| `kpi_catalog` | KPI definitions (BM-10): code, name, formula, thresholds (green/yellow/red), measurement_frequency |
| `kpi_measurements` | Computed KPI values: kpi_id, period_start, period_end, actual_value, target_value, status |
| `acceptance_criteria` | 63 acceptance tests (BM-14): test_code, group, title, status, evidence |

**Other**

| Table | Purpose |
|---|---|
| `data_dictionary` | Term definitions (BM-07): term, definition, data_type, domain, validation_rules |
| `email_outbox` | Outbound notification queue (see 010_email_outbox.sql) |

---

### 003_config.sql — Configuration Data

Inserts the initial configuration data that drives all business logic. Nothing in the engine
is hard-coded — the engine reads config from these tables at runtime.

- **Roles (23)**: CEO, CFO, CHIEF_ACCOUNTANT, ACCOUNTANT, TREASURER, INTERNAL_AUDITOR,
  PROC_MANAGER, BUYER, WH_MANAGER, WH_STAFF, PROD_MANAGER, PROD_STAFF, QC_INSPECTOR,
  SALES_MANAGER, SALES_STAFF, HR_MANAGER, HR_STAFF, CS_MANAGER, CS_AGENT, SYS_ADMIN,
  BRANCH_DIRECTOR, DEPT_HEAD, EMPLOYEE
- **Permission matrix (BM-12)**: role × resource × action × data_scope × field_restrictions
- **SoD matrix (BM-06)**: HARD conflicts — REQUESTER↔APPROVER, APPROVER↔EXECUTOR,
  EXECUTOR↔AUDITOR, REQUESTER↔EXECUTOR
- **Document types**: 23 doc type codes with prefix, state list, and permission mapping
- **State transitions (BM-05)**: all valid transitions for all 23 doc types
- **Child rules**: e.g. PO→GRN, SO→DN, WO→material issue
- **Handoff map (BM-04)**: cross-department handoff definitions for all 11 flows
- **Chart of accounts**: Vietnamese standard chart (TK 1xx–9xx)
- **KPI catalog (BM-10)**: financial, operational, and compliance KPIs
- **Data dictionary (BM-07)**: term definitions for all standard fields
- **Acceptance criteria (BM-14)**: 63 test stubs (T1.1–T5.12)

**Rule**: to add a new document type or state transition, insert rows into `doc_types` and
`state_transitions` in a new migration. Never edit `004_engine.sql` for new business types.

---

### 004_engine.sql — Write Engine

Contains all write `api_*` functions and internal `fn_*` helpers.
See `docs/app-map/002-api-architecture.md` for the full function list.

Key design points:
- Every write function opens a transaction, runs SoD + permission checks, writes the
  document, calls `fn_apply_effects`, then `fn_after_effects`.
- `documents.version` is incremented on every write; callers pass `p_expected_version` for
  optimistic locking (raises CONFLICT on mismatch — T5.4).
- Idempotency: `api_create_document` accepts `p_idempotency_key`; duplicate submissions
  return the original result without re-inserting (T5.6).

---

### 005_read_api.sql — Read-Only API

Contains all read `api_*` functions.
See `docs/app-map/002-api-architecture.md` for the full function list.

Every read function:
1. Calls `fn_perm_scope` to determine the caller's data scope.
2. Filters rows with `fn_doc_in_scope` — no row leaks across scope boundaries.
3. Calls `fn_mask` to strip hidden fields before returning.

---

### 006_security.sql — RLS & Grants

```sql
-- Revoke all direct table access from authenticated users
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Grant execute only on api_* functions (SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION api_create_document TO authenticated;
GRANT EXECUTE ON FUNCTION api_transition TO authenticated;
-- ... (all api_* functions)

-- anon role: only api_me and auth helpers
-- fn_* internal functions: no grant (called only within SECURITY DEFINER context)
```

Result: authenticated users can call `api_*` functions only. No direct SELECT/INSERT/UPDATE/
DELETE on business tables is possible from the client.

---

### 007_flow_ownership.sql — Flow Ownership Helpers

| Function | Purpose |
|---|---|
| `fn_role_names_for(p_doc_id, p_action)` | Returns the display names of roles permitted to take a given action on a document, for use in UI inbox labels |
| `fn_owner_label(p_doc_id)` | Returns a human-readable label for who currently owns the document (e.g. "Awaiting CFO approval") |

These functions avoid hard-coding role names in frontend code.

---

### 008_product_profit.sql — Product Profitability

Adds `api_product_profit(p_from, p_to, p_product_id, p_customer_id)`:
- Joins `document_lines` (sales invoices) with `stock_ledger` (FIFO cost) to compute
  gross profit per product and customer for the period.
- Returns: product_code, product_name, customer_name, revenue, cogs, gross_profit, margin_pct.

---

### 009_vat.sql — VAT Handling

Extends `fn_apply_effects` to handle Vietnamese VAT:

- **Sales invoices (INV)**: on POSTED transition, creates GL entries:
  - Debit TK 131 (receivable) for gross amount
  - Credit TK 511 (revenue) for net amount
  - Credit TK 3331 (VAT payable) for VAT amount
- **Purchase invoices (SINV)**: on POSTED transition:
  - Debit TK 331 (payable) for gross amount reversed
  - Debit TK 1331 (VAT input credit) for VAT amount
  - Credit TK appropriate expense/asset account for net amount
- VAT rate and deductibility stored in `document_lines.metadata` JSONB.

---

### 010_email_outbox.sql — Email Outbox

Creates `email_outbox` table and inserts rows from `fn_after_effects` when documents reach
states that require notification (e.g. SUBMITTED → notify approver inbox, APPROVED → notify
requester).

Schema: `id, to_email, subject, body_html, template, context_json, status (PENDING/SENT/FAILED), created_at, sent_at`.

A separate worker (edge function or cron) polls `email_outbox WHERE status = 'PENDING'` and
sends via the configured SMTP/Resend provider.

---

## Key Design Rules

1. **Append-only tables**: `audit_trail`, `sod_log`, `gl_entries`, `stock_ledger` have no
   UPDATE or DELETE grants. Data integrity depends on this — never add triggers that modify
   these tables.

2. **Optimistic locking**: `documents.version` is a monotonically increasing integer.
   All write functions accept `p_expected_version` and raise CONFLICT if stale.

3. **FIFO inventory**: `stock_ledger` records every in/out movement with unit cost.
   `api_stock_on_hand` computes running value by consuming earliest lots first.

4. **Schema changes**: always create a new migration (`011_*.sql`, `012_*.sql`, …).
   Never edit deployed migrations. Use `node scripts/db.mjs functions` only for hot-patching
   function bodies during development.

5. **Config changes**: new doc types, transitions, permissions, SoD rules, KPIs, and handoffs
   are data changes — insert into the config tables via a new migration. Do not touch the
   engine functions.
