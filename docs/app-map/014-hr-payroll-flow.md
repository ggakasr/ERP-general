---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, src/app/(app)/hr/**
last_verified: 2026-09-20
ttl_days: 30
---

# 014 — HR & Payroll Flow (L6)

## Overview
HR module covers recruitment (HIRE) and payroll processing (PAYROLL → PMT). Employee master data managed via master_data table and dedicated employees view via api_employees.

## Key Files
- `supabase/migrations/003_config.sql` — HIRE, PAYROLL doc types, state transitions
- `supabase/migrations/004_engine.sql` — api_create_payroll (batch payroll calculation), fn_apply_effects: PAYROLL POSTED → GL salary entries
- `src/app/(app)/hr/page.tsx` — HR module entry
- `src/lib/doc-config.ts` — UI config for HIRE, PAYROLL

## Document Types & State Machines
- **HIRE** (Đề nghị tuyển dụng): DRAFT → SUBMITTED → APPROVED → ONBOARDED; terminal: ONBOARDED, CANCELLED. On ONBOARDED: creates employee record in master_data(category=EMPLOYEE)
- **PAYROLL** (Bảng lương): CALCULATED → SUBMITTED → APPROVED → POSTED → PAID; terminal: PAID, CANCELLED. Created via api_create_payroll (not api_create_document). On POSTED: generates GL salary/deduction entries. Child: PAYROLL(POSTED) → PMT

## Special API
- `api_create_payroll(p_period_start, p_period_end, p_cost_center_id?)` — calculates payroll for all active employees in period; creates PAYROLL document with lines
- `api_employees` — read employee list with salary info (BRANCH/COMPANY scope, hides bank_account for non-CFO)

## Business Rules
1. Payroll calculated once per period per department (idempotency key prevents duplicate)
2. SoD: HR_STAFF calculates (REQUESTER) ≠ HR_MANAGER approves ≠ TREASURER executes PMT ≠ INTERNAL_AUDITOR audits
3. Employee salary/bank_account fields hidden from DEPT_HEAD and below (field-level restriction)
4. On ONBOARDED: employee appears in api_employees; their department assignment drives payroll calculation
5. Period must be OPEN for PAYROLL POSTED

## API Functions
- Write: `api_create_payroll(p_period_start, p_period_end, p_cost_center_id?)`, `api_transition(doc_id, action, ...)`
- Read: `api_employees`, `api_list_documents(p_module='hr')`, `api_get_document(doc_id)`

## Roles
- HR_STAFF: CREATE HIRE; run api_create_payroll (REQUESTER)
- HR_MANAGER: APPROVE HIRE; APPROVE PAYROLL
- TREASURER: EXECUTE PMT for salary
- INTERNAL_AUDITOR: AUDIT salary PMT
- CFO: APPROVE PMT large amounts; full employee salary view
