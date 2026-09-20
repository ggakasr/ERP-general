---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, src/app/(app)/sales/**, src/app/(app)/documents/**
last_verified: 2026-09-20
ttl_days: 30
---

# 010 — Sales Flow (L2)

## Overview
Sales module covers the full order-to-cash cycle: Quotation → Sales Order → Delivery Note → Invoice → Receipt.

## Key Files
- `supabase/migrations/003_config.sql` — QUOT, SO, DN, INV, RCPT doc types, state transitions, handoff map
- `supabase/migrations/004_engine.sql` — fn_apply_effects (RCPT posts to GL, DN decrements stock), fn_after_effects
- `src/app/(app)/sales/page.tsx` — sales module entry point
- `src/app/(app)/documents/page.tsx` — document list (filtered by module=sales)
- `src/app/(app)/documents/[id]/page.tsx` — document detail/actions
- `src/lib/doc-config.ts` — UI config for QUOT, SO, DN, INV, RCPT

## Document Types & State Machines
- **QUOT** (Báo giá): DRAFT → SUBMITTED → APPROVED → SENT → ACCEPTED → ORDERED; terminal: ORDERED, LOST, CANCELLED. SoD: submit=REQUESTER, approve=APPROVER
- **SO** (Đơn bán hàng): DRAFT → CONFIRMED → PARTIALLY_SHIPPED → SHIPPED → INVOICED → CLOSED; terminal: CLOSED, CANCELLED. Requires stock_available to confirm
- **DN** (Phiếu xuất kho): DRAFT → PICKED → SHIPPED; terminal: SHIPPED, CANCELLED. EXECUTOR role, decrements stock_ledger FIFO on SHIPPED
- **INV** (Hóa đơn bán hàng): DRAFT → POSTED → PARTIALLY_PAID → PAID; terminal: PAID, CANCELLED. Posts to GL on POSTED. VAT handled by 009_vat.sql
- **RCPT** (Phiếu thu): DRAFT → RECEIVED → AUDITED; terminal: AUDITED, CANCELLED. EXECUTOR=TREASURER, AUDITOR=INTERNAL_AUDITOR

## Child Rules (Document Chain)
- QUOT(ACCEPTED) → SO
- SO(CONFIRMED,PARTIALLY_SHIPPED) → DN
- SO(PARTIALLY_SHIPPED,SHIPPED) → INV
- SO(CONFIRMED+) → TICKET (customer service)
- INV(POSTED,PARTIALLY_PAID) → RCPT

## Business Rules
1. SO requires stock_available check on CONFIRMED
2. 3-way check: SO ↔ DN ↔ INV (quantities must match)
3. SoD: INV creator ≠ RCPT executor (TREASURER) ≠ AUDITOR (INTERNAL_AUDITOR)
4. Audit trail: every state change logged to audit_trail (append-only)
5. Period must be OPEN for DN ship, INV post, RCPT receive

## API Functions
- Write: `api_create_document('QUOT'|'SO'|'DN'|'INV'|'RCPT', ...)`, `api_transition(doc_id, action, ...)`
- Read: `api_list_documents(p_module='sales')`, `api_get_document(p_doc_id)`, `api_trace_money(p_doc_id)`, `api_aging(p_type='AR')`

## Roles
- SALES_STAFF: CREATE QUOT/SO (OWN scope)
- SALES_MANAGER: APPROVE QUOT/SO (BRANCH scope)
- ACCOUNTANT: CREATE INV/RCPT; post INV
- TREASURER: EXECUTE RCPT (pay)
- INTERNAL_AUDITOR: AUDIT RCPT/INV

## Dependencies
- L1: master_data (customers, products, warehouses)
- L4: stock_ledger (inventory decrement on DN ship)
- L7: gl_entries (INV and RCPT post to GL)
