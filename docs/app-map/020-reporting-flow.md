---
covers: supabase/migrations/005_read_api.sql, supabase/migrations/007_flow_ownership.sql, supabase/migrations/008_product_profit.sql, src/app/(app)/reports/**, src/app/(app)/trace/**, src/app/(app)/controls/**
last_verified: 2026-09-20
ttl_days: 30
---

# 020 — Reporting & Analytics Flow (L11)

## Overview
Reporting module provides financial statements, operational KPIs, 3 trace paths (money/goods/responsibility), control dashboard, audit trail access, and data export.

## Key Files
- `supabase/migrations/005_read_api.sql` — all api_* read functions: trial_balance, financial_statements, aging, kpis, trace_money, trace_goods, trace_responsibility, audit_trail, sod_log, handoffs, control_summary, dashboard, stock_ledger, stock_on_hand, budget_report, search, inbox, notifications
- `supabase/migrations/007_flow_ownership.sql` — fn_role_names_for, fn_owner_label: compute "who acts next" from permission_matrix (no hard-coding)
- `supabase/migrations/008_product_profit.sql` — api_product_profit: gross margin by product and customer
- `src/app/(app)/reports/page.tsx` — financial reports, KPI dashboard
- `src/app/(app)/trace/page.tsx` — 3 trace paths UI
- `src/app/(app)/controls/page.tsx` — control dashboard (SoD, exceptions, handoffs)
- `src/app/(app)/audit-trail/page.tsx` — audit trail viewer

## 3 Trace Paths (T3.5–T3.7)

### Trace by Money (T3.5)
`api_trace_money(p_doc_id)` — traverses document chain from any financial doc:
`PMT → SINV → PO → PR → BUDGET` or `RCPT → INV → SO → QUOT`
Returns ordered array with amounts, dates, users, GL entries at each step.

### Trace by Goods (T3.6)
`api_trace_goods(p_doc_id)` — stock movement chain:
`DN → stock_ledger entries → GRN → PO` or `WO → material issues → finished goods`
Returns quantities, warehouse locations, timestamps, batch costs.

### Trace by Responsibility (T3.7)
`api_trace_responsibility(p_doc_id)` — full accountability chain:
`Any action → user → roles held → department → process owner`
Returns every state change with who did it, what SoD role, when.

## Financial Reports
- `api_trial_balance(p_from, p_to)` — debit/credit by account, net balance
- `api_financial_statements(p_from, p_to)` — P&L (revenue, COGS, gross profit, expenses, net) and Balance Sheet (assets, liabilities, equity) from gl_entries grouped by COA categories
- `api_aging(p_type='AR'|'AP', p_as_of)` — AR/AP aging: current, 1-30d, 31-60d, 61-90d, 90d+ buckets
- `api_budget_report(p_fiscal_year?, p_cost_center_id?)` — budget vs committed vs actual, remaining
- `api_product_profit(p_from, p_to)` — gross profit per product and per customer (from 008_product_profit.sql)

## Operational KPIs (api_kpis)
Key metrics from 003_config.sql KPI catalog:
- Procurement: po_cycle_time, supplier_on_time_delivery, three_way_match_rate
- Sales: order_fulfillment_rate, dso (days sales outstanding), invoice_collection_rate
- Inventory: inventory_turnover, fill_rate, stock_accuracy
- Finance: close_cycle_time, budget_utilization, exception_rate
- Compliance: sod_violation_rate, handoff_breach_rate, audit_score

## Control Dashboard (api_control_summary)
Returns BM-12 summary: open SoD violations, pending exceptions (EXC), handoffs AT_RISK/BREACHED, overdue access reviews, and period status.

## Business Rules
1. All read APIs respect fn_perm_scope: BRANCH scope users see only branch data in reports
2. api_search(p_query) — full-text search across documents (title, number, counterparty) respecting scope
3. api_inbox() — documents pending action by current user's roles (inbox/task queue)
4. api_dashboard() — summary counts: pending approvals, overdue handoffs, SoD breaches, open exceptions
5. Data export: reports return structured JSON; frontend renders or downloads as CSV

## Roles
- ACCOUNTANT: VIEW financial statements (BRANCH); EXPORT GL (BRANCH)
- CFO/CEO: VIEW all reports (COMPANY); EXPORT GL (COMPANY)
- INTERNAL_AUDITOR: VIEW audit_trail, sod_log, control_summary (COMPANY, read-only)
- DEPT_HEAD: VIEW KPIs, budget_report (COMPANY for KPIs)
- Any role: api_inbox (own pending items), api_dashboard (scoped summary)
