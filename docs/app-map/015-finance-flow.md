---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, supabase/migrations/005_read_api.sql, supabase/migrations/007_flow_ownership.sql, supabase/migrations/009_vat.sql, src/app/(app)/finance/**
last_verified: 2026-09-20
ttl_days: 30
---

# 015 — Finance & Accounting Flow (L7)

## Overview
Finance module covers general ledger (JV), bank reconciliation (BANKREC), accounts receivable (INV/RCPT), accounts payable (SINV/PMT), VAT handling, period management, and financial reporting.

## Key Files
- `supabase/migrations/003_config.sql` — JV, BANKREC, RCPT, PMT doc types + state transitions
- `supabase/migrations/004_engine.sql` — fn_apply_effects: JV POSTED → gl_entries; api_set_period_status; PMT/RCPT posting
- `supabase/migrations/005_read_api.sql` — api_trial_balance, api_financial_statements, api_aging, api_budget_report
- `supabase/migrations/009_vat.sql` — VAT on INV (TK 3331) and SINV (TK 1331), adds to documents.amount on posting
- `src/app/(app)/finance/page.tsx` — finance module entry
- `src/app/(app)/reports/page.tsx` — financial statements and reports

## Document Types & State Machines
- **JV** (Bút toán): DRAFT → SUBMITTED → POSTED → AUDITED or REVERSED. Requires balanced (debit=credit) + period_open_jv. REVERSED: creates offsetting JV
- **BANKREC** (Đối chiếu ngân hàng): DRAFT → MATCHED → RECONCILED. Matching algorithm in 004_engine.sql. Requires all_matched condition to reconcile
- **RCPT** (Phiếu thu) — also in sales: EXECUTOR=TREASURER, AUDITOR=INTERNAL_AUDITOR. SoD enforced
- **PMT** (Phiếu chi) — also in procurement: REQUESTER≠APPROVER(CFO/PROC_MANAGER)≠EXECUTOR(TREASURER)≠AUDITOR(INTERNAL_AUDITOR)

## Period Management
- `api_set_period_status(p_period, p_status)` — transitions fiscal period: OPEN → SOFT_CLOSE → HARD_CLOSE
- SOFT_CLOSE: blocks new documents but allows adjusting JVs
- HARD_CLOSE: blocks all posting. Required before archiving
- period_open condition checked by DN ship, INV post, JV post, ADJ post, PMT/RCPT execute, PAYROLL post

## Financial Reporting (api_*)
- `api_trial_balance(p_from, p_to)` — debit/credit totals by account code
- `api_financial_statements(p_from, p_to)` — P&L and balance sheet from gl_entries + COA grouping
- `api_aging(p_type='AR'|'AP', p_as_of)` — accounts receivable/payable aging buckets
- `api_budget_report(p_fiscal_year?, p_cost_center_id?)` — budget vs actual by cost center

## Business Rules
1. JV balanced check: sum(debit lines) = sum(credit lines) — hard validation before SUBMITTED
2. SoD on PMT/RCPT: REQUESTER≠APPROVER≠EXECUTOR≠AUDITOR (T3.1–T3.4 absolute blockers)
3. GL entries append-only: no UPDATE/DELETE on gl_entries table
4. VAT: 009_vat.sql adds VAT amounts to INV (output VAT TK 3331) and SINV (input VAT TK 1331) on posting
5. BANKREC: auto-match by amount + date ± 1 day; unmatched items flagged for manual review

## API Functions
- Write: `api_create_document('JV'|'BANKREC'|'RCPT'|'PMT', ...)`, `api_transition(doc_id, action, ...)`, `api_run_depreciation(p_period)`, `api_set_period_status(p_period, p_status)`
- Read: `api_trial_balance`, `api_financial_statements`, `api_aging`, `api_budget_report`, `api_trace_money(doc_id)`

## Roles
- ACCOUNTANT: CREATE JV/BANKREC/RCPT/PMT (BRANCH); EXECUTE depreciation
- CHIEF_ACCOUNTANT: APPROVE JV/SINV/BANKREC; manage period
- CFO: APPROVE PMT/PAYROLL/BUDGET; EXECUTE period; full company view
- TREASURER: EXECUTE PMT/RCPT
- INTERNAL_AUDITOR: AUDIT PMT/RCPT/JV; view audit_trail + sod_log
