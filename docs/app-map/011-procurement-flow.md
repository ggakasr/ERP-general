---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, src/app/(app)/procurement/**, src/app/(app)/documents/**
last_verified: 2026-09-20
ttl_days: 30
---

# 011 — Procurement Flow (L3)

## Overview
Procurement module handles the full procure-to-pay cycle: Purchase Requisition → Purchase Order → Goods Receipt → Supplier Invoice → Payment.

## Key Files
- `supabase/migrations/003_config.sql` — PR, PO, GRN, SINV, PMT doc types, state transitions, SoD matrix, handoff map
- `supabase/migrations/004_engine.sql` — fn_apply_effects (GRN increments stock FIFO, PMT posts to GL), 3-way matching logic, fn_sod_enforce
- `src/app/(app)/procurement/page.tsx` — procurement module entry
- `src/lib/doc-config.ts` — UI config for PR, PO, GRN, SINV, PMT

## Document Types & State Machines
- **PR** (Đề nghị mua hàng): DRAFT → SUBMITTED → APPROVED → ORDERED → CLOSED; terminal: CLOSED, CANCELLED. SoD: submit=REQUESTER, approve=APPROVER
- **PO** (Đơn mua hàng): DRAFT → SUBMITTED → APPROVED → SENT → CONFIRMED → PARTIALLY_RECEIVED → RECEIVED → INVOICED → PAID. Conditions: budget_available on submit+approve
- **GRN** (Phiếu nhập kho): DRAFT → INSPECTED → STORED (or REJECTED); terminal: STORED, REJECTED, CANCELLED. STORED increments stock_ledger FIFO
- **SINV** (Hóa đơn nhà cung cấp): DRAFT → MATCHED → POSTED → PARTIALLY_PAID → PAID; or DRAFT → ON_HOLD (3-way mismatch). ON_HOLD requires exception_approved before release
- **PMT** (Phiếu chi): DRAFT → SUBMITTED → APPROVED → PAID → AUDITED. EXECUTOR=TREASURER (≠APPROVER≠REQUESTER). SoD: REQUESTER≠APPROVER≠EXECUTOR≠AUDITOR

## Child Rules (Document Chain)
- PR(APPROVED,ORDERED) → PO
- PO(CONFIRMED,PARTIALLY_RECEIVED) → GRN
- PO(PARTIALLY_RECEIVED,RECEIVED) → SINV
- SINV(POSTED,PARTIALLY_PAID) → PMT
- PAYROLL(POSTED) → PMT (shared PMT type)

## Business Rules — 3-Way Matching (CRITICAL)
1. When SINV is created from PO+GRN: system checks PO.quantity ↔ GRN.received_quantity ↔ SINV.billed_quantity and PO.unit_price ↔ SINV.unit_price (±2% tolerance on amount, 0 tolerance on quantity)
2. Match OK → status MATCHED. Mismatch → ON_HOLD + auto-create EXC (exception)
3. ON_HOLD → MATCHED requires APPROVER and exception_approved condition
4. Budget check: PO submit/approve requires budget_available condition (checks BUDGET doc for cost center)

## SoD Rules (T3.1–T3.4 absolute blockers)
- REQUESTER (PR/PO creator) ≠ APPROVER (PO approver) ≠ EXECUTOR/TREASURER (PMT payer) ≠ AUDITOR (PMT auditor)
- fn_sod_enforce checks all roles on same doc_id chain

## API Functions
- Write: `api_create_document('PR'|'PO'|'GRN'|'SINV'|'PMT', ...)`, `api_transition(doc_id, action, ...)`
- Read: `api_list_documents(p_module='procurement')`, `api_get_document(doc_id)`, `api_trace_money(doc_id)`, `api_trace_goods(doc_id)`, `api_budget_report()`

## Roles
- EMPLOYEE: CREATE PR (OWN)
- DEPT_HEAD: APPROVE PR (DEPARTMENT)
- BUYER: CREATE PO; PROC_MANAGER: APPROVE PO
- WH_STAFF: CREATE GRN; WH_MANAGER: INSPECT GRN
- ACCOUNTANT: CREATE SINV, PMT; CHIEF_ACCOUNTANT: APPROVE SINV
- CFO: APPROVE PMT; TREASURER: EXECUTE PMT; INTERNAL_AUDITOR: AUDIT PMT
