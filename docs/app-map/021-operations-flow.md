---
covers: src/app/(app)/operations/**, supabase/migrations/011_shipment.sql, supabase/migrations/018_shipment_full.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 021 — Luồng Vận hành Logistics (Operations / Shipment)

## Tổng quan

Module vận hành logistics (WP-C1 / WP-J4) quản lý lô hàng (Shipment) và các chứng từ phụ trợ:
Booking, House B/L, Delivery Order, Debit Note, Credit Note. Mỗi Shipment có containers,
cước phí (AR/AP), sự kiện tracking, và tính lãi/lỗ theo lô. Khi close, GL ghi nhận doanh thu
(Dr 131 / Cr 511) và chi phí (Dr 632 / Cr 331).

## Key Files

| Mục đích | File |
|---|---|
| Bảng + doc_types + state_transitions + seed | `supabase/migrations/011_shipment.sql` |
| Tenant isolation + structured job code + GL close | `supabase/migrations/018_shipment_full.sql` |
| UI cấu hình doc_type | `src/lib/doc-config.ts` (SHIPMENT, BOOKING, HBL, DO, DNOTE, CNOTE) |
| Trang operations | `src/app/(app)/operations/**` |

## Bảng dữ liệu

- `containers` — container thuộc shipment (container_no, container_type, seal_no, gross_weight, cbm, status)
- `shipment_charges` — cước phí AR/AP (charge_code, qty, rate, currency, exchange_rate, amount_fc/amount_vnd generated)
- `tracking_events` — sự kiện vận chuyển (event_code, event_name, location, event_time, actual)
- Tất cả 3 bảng có `tenant_id` + RLS (`read_tenant` policy), REVOKE ALL cho authenticated.

## API / RPC

- `api_list_shipments(p_status, p_search, p_limit, p_offset)` — danh sách card view, tổng hợp AR/AP/containers
- `api_get_shipment(p_id)` — chi tiết multi-tab: overview, charges, containers, tracking, child_docs, profit
- `fn_job_number(p_doc_type, p_data, p_branch_id)` — mã job cấu trúc: `F-{dir}-{mode}-FR-{branch}-{YYMM}-{seq:4}`
- `fn_shipment_close_gl(p_doc, p_user)` — ghi sổ cái khi SHIPMENT close

## State Machine

```
SHIPMENT: DRAFT → BOOKED → CONFIRMED → IN_TRANSIT → ARRIVED → CUSTOMS → DELIVERED → CLOSED
          DRAFT/BOOKED → CANCELLED
BOOKING:  DRAFT → SUBMITTED → CONFIRMED / REJECTED / CANCELLED
HBL:      DRAFT → SUBMITTED → APPROVED → RELEASED / CANCELLED
DO:       DRAFT → SUBMITTED → APPROVED → ISSUED / CANCELLED
DNOTE:    DRAFT → SUBMITTED → APPROVED → SENT → PARTIALLY_PAID → PAID / CANCELLED
CNOTE:    DRAFT → SUBMITTED → APPROVED → APPLIED / CANCELLED
```

## Quy tắc nghiệp vụ

1. SoD enforce: REQUESTER (tạo) != APPROVER (duyệt) trên SHIPMENT/HBL/DO/DNOTE/CNOTE
2. Container type enum: 20DC, 20OT, 20RF, 40DC, 40HC, 40OT, 40RF, 45HC, LCL, BB
3. `amount_fc` / `amount_vnd` trên shipment_charges là GENERATED ALWAYS AS (qty * rate * exchange_rate)
4. `rate_expiring` flag: cảnh báo khi `rate_expires < current_date + 7`
5. Doc chain: QUOT → SHIPMENT → BOOKING/HBL/DO/DNOTE/CNOTE

## Vai trò & Quyền

- `OPS_MANAGER` — VIEW, CREATE, EDIT, APPROVE (scope BRANCH)
- `OPS_STAFF` — VIEW, CREATE, EDIT (scope BRANCH)
- `CS_FREIGHT` — VIEW, CREATE (scope BRANCH)
- `ACCOUNTANT` / `CHIEF_ACCOUNTANT` — VIEW DNOTE/CNOTE

## Dependencies

- `002_core_schema.sql` — bảng documents, partners, doc_sequences
- `004_engine.sql` — fn_available_actions, fn_apply_effects, fn_after_effects
- `015_multitenant.sql` — tenants, fn_current_tenant
