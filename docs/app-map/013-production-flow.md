---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, src/app/(app)/production/**
last_verified: 2026-09-20
ttl_days: 30
---

# 013 — Production Flow (L5)

## Overview
Production module manages make-to-order and planned production: Work Order with BOM-based material issue (FIFO from stock) and finished goods receipt.

## Key Files
- `supabase/migrations/003_config.sql` — WO doc type, state transitions, handoff map, BOM data in master_data
- `supabase/migrations/004_engine.sql` — fn_apply_effects: MATERIAL_ISSUED decrements raw materials FIFO; COMPLETED increments finished goods stock + posts GL
- `src/app/(app)/production/page.tsx` — production module entry
- `src/lib/doc-config.ts` — UI config for WO

## Document Types & State Machines
- **WO** (Lệnh sản xuất): PLANNED → RELEASED → MATERIAL_ISSUED → IN_PRODUCTION → QC → COMPLETED → CLOSED; terminal: CLOSED, CANCELLED
  - PLANNED → RELEASED: APPROVER (PROD_MANAGER), requires has_lines (BOM lines)
  - RELEASED → MATERIAL_ISSUED: EXECUTOR (PROD_STAFF), requires stock_available + period_open
  - IN_PRODUCTION → QC: PROD_STAFF
  - QC → COMPLETED: QC_INSPECTOR, requires period_open → increments finished goods stock + GL entries
  - QC → IN_PRODUCTION (qc_fail): QC_INSPECTOR → send back to production

## Child Rules
- SO(CONFIRMED) → WO (make-to-order: SO can spawn WO)
- WO material lines reference BOM (product master data with type=RAW/SUPPLY)

## Business Rules
1. BOM lines defined in WO document_lines (product_id, qty, unit_cost from latest stock batch)
2. FIFO material consumption: fn_apply_effects on MATERIAL_ISSUED issues raw materials from oldest batch
3. QC fail path: WO → IN_PRODUCTION again (rework) before second QC pass
4. COMPLETED: finished goods added to stock_ledger at calculated cost (raw materials + labor from WO)
5. Negative stock prevention applies to raw material issue

## API Functions
- Write: `api_create_document('WO', ...)`, `api_transition(doc_id, action, ...)`
- Read: `api_list_documents(p_module='production')`, `api_get_document(doc_id)`, `api_stock_on_hand()`

## Roles
- PROD_STAFF: CREATE WO, execute MATERIAL_ISSUED/IN_PRODUCTION
- PROD_MANAGER: APPROVE (RELEASE) WO
- QC_INSPECTOR: EXECUTE QC transitions (COMPLETED or back to IN_PRODUCTION)
- ACCOUNTANT: view production costs and GL postings
