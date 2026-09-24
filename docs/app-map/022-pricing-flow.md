---
covers: src/app/(app)/pricing/**, supabase/migrations/019_rates.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 022 — Bảng giá & Cước phí (Pricing / Rate Engine)

## Tổng quan

Module bảng giá (WP-C2) quản lý rate sheet (cước vận chuyển theo tuyến) và charge codes
(mã phụ phí). Hỗ trợ tìm cước, xây báo giá tự động từ shipment, import bulk, và cảnh báo
rate sắp hết hạn qua email_outbox.

## Key Files

| Mục đích | File |
|---|---|
| Bảng rates + charge_codes + RPCs | `supabase/migrations/019_rates.sql` |
| Trang pricing | `src/app/(app)/pricing/**` |

## Bảng dữ liệu

- `rates` — bảng giá theo tuyến (pol, pod, mode, rate_type SPOT/CONTRACT, valid_from/to, rate_20ft/40ft/40hc/per_cbm/per_kg, surcharges JSONB)
- `charge_codes` — danh mục mã phụ phí (code, name, category FREIGHT/LOCAL/DOCUMENTATION/SURCHARGE/OTHER, charge_type AR/AP/BOTH)
- Cả hai bảng có `tenant_id` + RLS + REVOKE ALL.

## API / RPC

- `api_rate_search(p_pol, p_pod, p_mode, p_date, p_limit)` — tìm rate còn hiệu lực, trả `expiring_soon` flag + `days_left`
- `api_quote_build(p_shipment_id)` — xây báo giá tự động: đếm containers → tra rate → tính AR lines + surcharges + margin
- `api_rate_import(p_rows)` — import bulk rate sheet, validate từng dòng, báo lỗi per-row
- `api_rate_expiry_check(p_warn_days)` — cảnh báo rate hết hạn trong N ngày, ghi email_outbox cho OPS_MANAGER
- `api_charge_codes()` — danh sách charge codes active của tenant

## Quy tắc nghiệp vụ

1. Rate hết hạn (valid_to < today) tự động có status = EXPIRED, không xuất hiện trong search
2. `expiring_soon` = true khi `valid_to - today <= 7`
3. Rate import: dòng lỗi bị báo cáo nhưng không chặn dòng hợp lệ (partial success)
4. Quote build ưu tiên rate có `valid_to` sớm nhất (soonest-expiring first)
5. Constraint: `valid_to >= valid_from`

## Vai trò & Quyền

- `OPS_MANAGER` — VIEW, CREATE, EDIT trên RATE, CHARGE_CODE (scope BRANCH)
- `CS_FREIGHT` — VIEW, CREATE (scope BRANCH)
- `SYSTEM_ADMIN` — VIEW, CREATE, EDIT, APPROVE (scope COMPANY)

## Dependencies

- `011_shipment.sql` — bảng shipment_charges, containers
- `010_email_outbox.sql` — ghi email_outbox cho cảnh báo
- `015_multitenant.sql` — tenant isolation
