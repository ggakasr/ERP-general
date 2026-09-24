---
covers: src/app/(app)/schedule/**, supabase/migrations/019_reference.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 023 — Lịch tàu & Tracking (Schedule & Tracking)

## Tổng quan

Module danh mục tham chiếu logistics (WP-C3): hãng tàu (carriers), cảng (ports), tàu (vessels),
lịch tàu (vessel_schedules). Hỗ trợ nhập sự kiện tracking thủ công và import danh mục hàng loạt
qua CSV. Adapter HTTP (API hãng tàu) chạy ở tầng Next.js, không gọi HTTP từ Postgres.

## Key Files

| Mục đích | File |
|---|---|
| Bảng + RPCs + seed data | `supabase/migrations/019_reference.sql` |
| Trang schedule | `src/app/(app)/schedule/**` |

## Bảng dữ liệu

- `carriers` — hãng vận chuyển (code, name, scac, iata, country, mode SEA/AIR/RAIL/TRUCK/ALL)
- `ports` — cảng theo UN/LOCODE (locode 5 ký tự, name, country, timezone, mode)
- `vessels` — tàu/máy bay (name, imo_no, call_sign, carrier_id, flag, vessel_type)
- `vessel_schedules` — lịch tàu (vessel_id, carrier_id, pol_code, pod_code, voyage_no, etd, eta, cutoff_date, transit_days generated)
- `tracking_events` — (bảng đã tạo ở 011) sự kiện tracking trên shipment
- Tất cả bảng có `tenant_id` + RLS + REVOKE ALL.

## API / RPC

- `api_carriers(p_search, p_mode, p_limit)` — danh sách hãng tàu active, lọc theo mode/search
- `api_ports(p_search, p_mode, p_limit)` — danh sách cảng, tìm theo locode/name/country
- `api_vessels(p_search, p_carrier_id, p_limit)` — danh sách tàu, lọc theo carrier
- `api_vessel_schedules(p_pol, p_pod, p_from_date, p_to_date, p_carrier_id, p_limit)` — lịch tàu mở (status OPEN)
- `api_add_tracking_event(p_shipment_id, p_event_code, p_event_name, ...)` — nhập sự kiện tracking, ghi audit trail
- `api_import_reference(p_type, p_rows)` — import hàng loạt carrier/port/vessel/schedule (upsert)

## Quy tắc nghiệp vụ

1. `vessel_schedules.transit_days` = GENERATED ALWAYS AS (eta - etd)
2. `api_import_reference` chỉ cho SYSTEM_ADMIN, OPS_MANAGER, CEO, COO
3. Tracking event ghi audit trail (INSERT vào audit_trail) khi tạo
4. UNIQUE constraints: carriers(tenant_id, code), ports(tenant_id, locode), vessel_schedules(tenant_id, carrier_id, voyage_no, pol_code, pod_code)

## Seed Data

- 8 carriers (Evergreen, COSCO, Hapag-Lloyd, HMM, MSC, CMA CGM, Vietnam Airlines, Qatar Airways)
- 12 ports (VNSGN, VNHAN, USHOU, USLAX, NLRTM, KRPUS, DEHAM, DEFRA, SGSIN, CNSHA, JPNGO, VVHAN)
- 5 vessels, 6 vessel schedules (ETD tương đối so với current_date)

## Dependencies

- `011_shipment.sql` — bảng tracking_events, documents
- `015_multitenant.sql` — tenant isolation
