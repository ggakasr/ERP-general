---
covers: supabase/migrations/004_engine.sql, supabase/migrations/005_read_api.sql, src/app/api/**, src/lib/api.ts
last_verified: 2026-09-20
ttl_days: 30
---

# 002 — API Architecture

## Overview

The ERP system exposes all business operations through PostgreSQL functions prefixed `api_*`.
The frontend (Next.js 14 App Router) calls these exclusively via `supabase.rpc()` — it never
reads or writes business tables directly. All functions run as `SECURITY DEFINER`, so they
execute with elevated privileges while the authenticated role retains no direct table access.

---

## Write API Functions (004_engine.sql)

| Function | Purpose |
|---|---|
| `api_create_document(p_doc_type, p_header, p_lines, p_parent_id, p_idempotency_key)` | Create any document type; validates doc_type config, checks budget, runs SoD; returns `{ ok, doc_id, doc_number }` |
| `api_transition(p_doc_id, p_action, p_comment, p_expected_version, p_payload)` | Advance document through its state machine; runs SoD check, condition guards, then calls `fn_apply_effects` + `fn_after_effects` |
| `api_update_document(p_doc_id, p_header, p_lines, p_expected_version)` | Update draft document header/lines; blocked on non-DRAFT states |
| `api_create_payroll(p_period_start, p_period_end, p_department_id)` | Calculate payroll for a pay period; creates PAYROLL document with lines per employee |
| `api_run_depreciation(p_period)` | Post monthly depreciation entries for all active fixed assets |
| `api_create_access_review(p_scope)` | Start an access review cycle (ĐK8 / T4.12); creates ACCESS_REVIEW document |
| `api_access_review_decide(p_review_id, p_user_id, p_decision, p_comment)` | Record keep/revoke decision for one user in an access review |
| `api_set_period_status(p_period, p_status)` | Open or close a fiscal period; blocks postings to closed periods (T1.9) |
| `api_admin_set_role(p_target_user_id, p_role, p_action)` | Grant or revoke a role; SYS_ADMIN only |
| `api_admin_set_permission(p_role, p_resource, p_action, p_data_scope, p_field_restrictions)` | Modify 3-tier permission matrix (BM-12); SYS_ADMIN only |
| `api_admin_set_user_status(p_target_user_id, p_status)` | Activate, suspend, or deactivate a user account |
| `api_mark_notifications_read(p_notification_ids)` | Mark inbox notifications as read for the calling user |
| `api_update_acceptance(p_test_code, p_status, p_evidence, p_notes)` | Update acceptance test result in BM-14 table |

---

## Read API Functions (005_read_api.sql)

| Function | Purpose |
|---|---|
| `api_me()` | Return current user profile: id, name, email, roles, effective permissions, branch, department |
| `api_master_data(p_category, p_search, p_limit, p_offset)` | Paginated master data lookup (customers, suppliers, products, warehouses, accounts…) |
| `api_list_documents(p_doc_type, p_status, p_from, p_to, p_search, p_limit, p_offset)` | List documents scoped by user's data scope (OWN/DEPARTMENT/BRANCH/COMPANY) |
| `api_get_document(p_doc_id)` | Full document detail with lines, audit trail, document chain, current handoff status |
| `api_search(p_query, p_types, p_limit)` | Full-text search across documents, master data, and users |
| `api_inbox(p_limit, p_offset)` | Documents awaiting the calling user's action (approval queue, handoffs) |
| `api_dashboard()` | KPI tiles, pending actions count, overdue items, recent activity for the calling user's role |
| `api_notifications(p_unread_only, p_limit, p_offset)` | In-app notification inbox |
| `api_trace_money(p_payment_id)` | Trace by money: Payment → Invoice → PO → PR → Budget (complete chain, T3.5) |
| `api_trace_goods(p_delivery_id)` | Trace by goods: Delivery → Stock Movement → GRN → PO (complete chain, T3.6) |
| `api_trace_responsibility(p_doc_id)` | Trace by responsibility: every action → user → role → department (T3.7) |
| `api_trial_balance(p_period_start, p_period_end)` | Trial balance by account for the period |
| `api_financial_statements(p_period)` | P&L, Balance Sheet, Cash Flow for the period |
| `api_stock_on_hand(p_warehouse_id, p_product_id)` | Current stock quantities and FIFO value by location |
| `api_stock_ledger(p_product_id, p_warehouse_id, p_from, p_to)` | Chronological stock movements with running balance |
| `api_budget_report(p_budget_id, p_period)` | Budget vs actual variance report |
| `api_aging(p_type, p_as_of_date)` | AR or AP aging analysis (30/60/90/90+ days) |
| `api_kpis(p_category, p_period)` | KPI actual vs target values from kpi_catalog + kpi_measurements |
| `api_audit_trail(p_entity_type, p_entity_id, p_limit)` | Immutable audit trail for any entity (T2.9, T2.10) |
| `api_sod_log(p_from, p_to, p_result)` | SoD check log: passed, blocked, or override-approved (T3.4) |
| `api_handoffs(p_status, p_from, p_to)` | Handoff records across departments with SLA status |
| `api_control_summary()` | Compliance dashboard: SoD violations, exception rate, audit score, open exceptions |
| `api_employees(p_department_id, p_status)` | Employee list for HR module, scoped by data scope |
| `api_product_profit(p_from, p_to, p_product_id, p_customer_id)` | Gross profit by product and customer (008_product_profit.sql) |

---

## Response Envelope

Every `api_*` function returns a consistent JSON envelope:

```json
{ "ok": true, ... }          // success — additional fields depend on function
{ "ok": false, "code": "...", "error": "human-readable message" }
```

Error codes (`code` field):

| Code | Meaning |
|---|---|
| `UNAUTHENTICATED` | No valid session |
| `FORBIDDEN` | Permission check failed (fn_perm_scope) |
| `SOD_VIOLATION` | Separation of Duties conflict (fn_sod_enforce) |
| `INVALID_TRANSITION` | State transition not allowed for current state + action |
| `CONDITION_FAILED` | Business rule condition not satisfied (e.g. budget_available) |
| `CONFLICT` | Optimistic locking conflict (expected_version mismatch) |
| `VALIDATION` | Input validation error (missing required field, type mismatch) |
| `BUSINESS_RULE` | Domain rule violation (e.g. GRN qty > PO qty) |

---

## Internal Engine Functions (004_engine.sql)

These are NOT callable from the frontend — they are called only by other `api_*` functions.

| Function | Purpose |
|---|---|
| `fn_perm_scope(p_user_id, p_resource, p_action)` | Returns the data scope filter for the user on a given resource+action; raises FORBIDDEN if no permission |
| `fn_sod_enforce(p_user_id, p_doc_id, p_sod_role)` | Checks SoD matrix; raises SOD_VIOLATION and writes to sod_log if the user already holds a conflicting role on the document |
| `fn_apply_effects(p_doc_id, p_action)` | Side effects of a transition: GL entries, stock movements, email_outbox inserts, KPI triggers |
| `fn_after_effects(p_doc_id)` | Post-transition roll-ups: update parent doc status, trigger child handoffs, recompute running totals |
| `fn_mask(p_row, p_user_id, p_resource)` | Strip fields the user's permission_matrix marks hidden before returning to caller |
| `fn_doc_in_scope(p_doc_id, p_user_id, p_resource)` | Returns TRUE if the document falls within the user's data scope; used by all list/get functions |

---

## Frontend Access Pattern

```typescript
// src/lib/api.ts — all calls follow this pattern
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const supabase = createClientComponentClient()

// Write
const { data, error } = await supabase.rpc('api_transition', {
  p_doc_id: docId,
  p_action: 'SUBMIT',
  p_comment: 'Submitted for approval',
  p_expected_version: currentVersion,
  p_payload: null,
})

// Read
const { data, error } = await supabase.rpc('api_list_documents', {
  p_doc_type: 'PO',
  p_status: 'SUBMITTED',
  p_limit: 20,
  p_offset: 0,
})
```

Gateway: `src/app/api/gate/` contains server-side Next.js route handlers for cases that need
server-side Supabase clients (e.g. service-role calls for admin operations, file uploads).
Regular CRUD goes through client-side `supabase.rpc()`.

---

## Hot-Patching Functions (Development)

To reload PL/pgSQL functions without a full migration (development only):

```bash
node scripts/db.mjs functions
```

This re-executes the `CREATE OR REPLACE FUNCTION` blocks from `004_engine.sql` and
`005_read_api.sql` against the current database. Schema changes (new tables, columns,
constraints) always require a new numbered migration file (`007_*.sql`, `011_*.sql`, …).
