---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, supabase/migrations/005_read_api.sql, src/app/(app)/planning/**
last_verified: 2026-09-20
ttl_days: 30
---

# 018 — Planning & Budget Flow (L1)

## Overview
Planning module manages annual budgets by department/cost center. Budget is the financial baseline checked when creating POs (budget_available condition).

## Key Files
- `supabase/migrations/003_config.sql` — BUDGET doc type, state transitions, KPI catalog (BM-10), COA with budget accounts
- `supabase/migrations/004_engine.sql` — fn_apply_effects: BUDGET ACTIVE → marks budget available for cost center; budget_available condition check compares PO amount vs BUDGET remaining
- `supabase/migrations/005_read_api.sql` — api_budget_report (budget vs actual by cost center), api_kpis (budget-related KPIs)
- `src/app/(app)/planning/page.tsx` — planning module entry
- `src/lib/doc-config.ts` — UI config for BUDGET (lineMode: "budget")

## Document Types & State Machines
- **BUDGET** (Ngân sách bộ phận): DRAFT → SUBMITTED → APPROVED → ACTIVE → CLOSED; terminal: CLOSED, CANCELLED
  - DRAFT→SUBMITTED: REQUESTER (DEPT_HEAD), requires has_lines
  - SUBMITTED→APPROVED: APPROVER (CFO/CEO)
  - SUBMITTED→REJECTED: APPROVER → back to DRAFT for revision
  - APPROVED→ACTIVE: EXECUTE (CFO), activates budget for cost center
  - ACTIVE→CLOSED: EXECUTE (CFO), closes budget period

## Budget Line Structure
- Each BUDGET has lines: budget account code, amount, period (monthly/quarterly/annual)
- budget_available condition: sums ACTIVE BUDGET lines for cost_center → checks remaining (budget - committed POs - paid POs) ≥ PO amount

## KPI Catalog (from 003_config.sql)
Key budget/planning KPIs computed by api_kpis():
- budget_utilization_rate: actual spend / approved budget (%)
- budget_variance: approved - actual (amount)
- po_cycle_time: average days from PR to PO approval
- approval_cycle_time: average days for document approval

## API Functions
- Write: `api_create_document('BUDGET', ...)`, `api_transition(doc_id, action, ...)`
- Read: `api_list_documents(p_module='planning')`, `api_budget_report(p_fiscal_year?, p_cost_center_id?)`, `api_kpis(p_from, p_to)`

## Business Rules
1. One active BUDGET per cost_center per fiscal_year (enforced by unique constraint)
2. Budget must be ACTIVE before POs from that department can be submitted
3. Budget consumption: approved POs committed, paid PMTs actual. Over-budget → PO blocked (budget_available fails)
4. Budget revision: ACTIVE budget can be revised via new BUDGET doc in same period (replaces old)
5. Variance analysis: api_budget_report shows budget, committed, actual, remaining by line item

## Roles
- DEPT_HEAD: CREATE BUDGET (DEPARTMENT); VIEW budget report (COMPANY)
- CFO: APPROVE BUDGET; ACTIVATE BUDGET (COMPANY scope)
- CEO: APPROVE annual BUDGET (COMPANY)
- ACCOUNTANT: VIEW budget report (BRANCH)
