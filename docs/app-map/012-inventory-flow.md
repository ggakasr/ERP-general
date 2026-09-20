---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, supabase/migrations/002_core_schema.sql, src/app/(app)/inventory/**
last_verified: 2026-09-20
ttl_days: 30
---

# 012 — Inventory Flow (L4)

## Overview
Inventory module manages all stock movements: Goods Receipt (shared with procurement), Delivery Note (shared with sales), Stock Transfer, and Inventory Adjustment.

## Key Files
- `supabase/migrations/002_core_schema.sql` — stock_ledger table (FIFO valuation), warehouse master data
- `supabase/migrations/003_config.sql` — DN, GRN, ST, ADJ doc types, state transitions, handoff map
- `supabase/migrations/004_engine.sql` — fn_apply_effects: stock increment (GRN STORED), decrement (DN SHIPPED), transfer (ST RECEIVED), adjustment (ADJ POSTED); FIFO cost calculation
- `src/app/(app)/inventory/page.tsx` — inventory module entry
- `src/lib/doc-config.ts` — UI config for ST, ADJ

## Document Types & State Machines
- **GRN** (Phiếu nhập kho) — also in procurement: DRAFT → INSPECTED → STORED/REJECTED. On STORED: increments stock_ledger with FIFO cost from PO unit_price
- **DN** (Phiếu xuất kho) — also in sales: DRAFT → PICKED → SHIPPED. On SHIPPED: decrements stock_ledger FIFO (oldest batch first), requires stock_available + period_open
- **ST** (Phiếu chuyển kho): DRAFT → SUBMITTED → APPROVED → IN_TRANSIT → RECEIVED; terminal: RECEIVED, CANCELLED. REQUESTER≠APPROVER. On IN_TRANSIT: decrement source warehouse. On RECEIVED: increment destination warehouse
- **ADJ** (Kiểm kê / điều chỉnh): DRAFT → SUBMITTED → APPROVED → POSTED; terminal: POSTED, CANCELLED. On POSTED: adjusts stock_ledger and posts GL entry (variance account). Requires period_open

## Business Rules
1. FIFO valuation: stock_ledger stores batches by receipt date + cost; issues consume oldest batches first
2. stock_available condition: system checks current stock_on_hand before allowing DN ship, ST dispatch, WO material issue
3. ADJ requires approval (APPROVER ≠ REQUESTER) before posting to prevent unauthorized stock manipulation
4. All stock movements are append-only in stock_ledger (no UPDATE/DELETE)
5. Negative stock is prevented by the stock_available condition guard

## API Functions
- Read: `api_stock_on_hand(p_warehouse_id?, p_product_id?)` — current inventory by location, `api_stock_ledger(p_product_id, p_from, p_to)` — movement history, `api_trace_goods(p_doc_id)` — full goods chain
- Write: `api_create_document('ST'|'ADJ', ...)`, `api_transition(doc_id, action, ...)`

## Roles
- WH_STAFF: CREATE ST (BRANCH, hidden: unit_price/amount); CREATE GRN
- WH_MANAGER: APPROVE ST/ADJ; INSPECT GRN
- ACCOUNTANT: CREATE ADJ; post ADJ GL entries
- CHIEF_ACCOUNTANT: APPROVE ADJ
