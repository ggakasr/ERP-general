---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, src/app/(app)/assets/**
last_verified: 2026-09-20
ttl_days: 30
---

# 016 — Fixed Assets Flow (L8)

## Overview
Assets module tracks fixed asset lifecycle: request → approval → capitalization → depreciation → disposal. Integrates with GL for depreciation entries.

## Key Files
- `supabase/migrations/003_config.sql` — ASSET doc type, state transitions
- `supabase/migrations/004_engine.sql` — api_run_depreciation (monthly), fn_apply_effects: ASSET IN_USE → capitalization GL entry; DISPOSED → disposal GL entry
- `src/app/(app)/assets/page.tsx` — assets module entry
- `src/lib/doc-config.ts` — UI config for ASSET

## Document Types & State Machines
- **ASSET** (Tài sản cố định): DRAFT → SUBMITTED → APPROVED → IN_USE → [UNDER_MAINTENANCE ↔ IN_USE] → DISPOSED; terminal: DISPOSED, CANCELLED
  - DRAFT→SUBMITTED: REQUESTER, requires amount_positive
  - SUBMITTED→APPROVED: APPROVER (CFO)
  - APPROVED→IN_USE (capitalize): EXECUTOR, requires period_open → posts capitalization GL entry
  - IN_USE→UNDER_MAINTENANCE: EXECUTOR (maintenance start)
  - UNDER_MAINTENANCE→IN_USE: EXECUTOR (maintenance end)
  - IN_USE→DISPOSED (dispose): APPROVER, requires period_open → posts disposal GL entry

## Depreciation
- `api_run_depreciation(p_period)` — calculates straight-line depreciation for all IN_USE assets; creates JV for each asset (debit: depreciation expense account, credit: accumulated depreciation account)
- Depreciation data stored in ASSET document header: useful_life_months, residual_value, depreciation_account
- Must be run monthly before period close

## Child Rules
- ASSET(IN_USE) → PMT (payment for asset purchase, if not already paid via PO)

## Business Rules
1. Asset ID auto-generated with prefix AST-YYYY-NNNNN
2. Useful life and residual value set at capitalization (IN_USE), cannot change afterward
3. Depreciation: (cost - residual_value) / useful_life_months per month, posted as JV
4. Disposal: posts net book value (cost - accumulated depreciation) to gain/loss account
5. SoD: REQUESTER (employee) ≠ APPROVER (CFO) ≠ EXECUTOR (accountant) for capitalization

## API Functions
- Write: `api_create_document('ASSET', ...)`, `api_transition(doc_id, action, ...)`, `api_run_depreciation(p_period)`
- Read: `api_list_documents(p_module='assets')`, `api_get_document(doc_id)`

## Roles
- EMPLOYEE: CREATE ASSET request (OWN)
- DEPT_HEAD: VIEW assets (DEPARTMENT)
- ACCOUNTANT: EXECUTE depreciation; VIEW all assets (BRANCH)
- CFO: APPROVE ASSET acquisition and disposal (COMPANY)
