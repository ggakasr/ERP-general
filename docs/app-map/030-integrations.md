---
covers: src/app/api/einvoice/**, src/app/api/bankrec/**, supabase/migrations/030_einvoice.sql, supabase/migrations/031_bankrec_import.sql, supabase/migrations/032_health_check.sql, supabase/migrations/038_fix_030_035_rpcs.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 030 — Tích hợp: Hóa đơn điện tử, Đối chiếu ngân hàng, Health Check

## Tổng quan

Ba module tích hợp ngoài: (1) WP-H1 hóa đơn điện tử (e-invoice) ghi log kết quả
phát hành HĐĐT qua nhà cung cấp VNPT/Viettel, (2) WP-H2 import sao kê ngân hàng
và gợi ý khớp tự động cho BANKREC, (3) WP-H3 health check kiểm tra connectivity
và cấu hình hệ thống.

## Key Files

| Mục đích | File |
|---|---|
| E-invoice log + INV ISSUED state | `supabase/migrations/030_einvoice.sql` |
| Bank reconciliation import + suggest | `supabase/migrations/031_bankrec_import.sql` |
| Health check RPC | `supabase/migrations/032_health_check.sql` |
| E-invoice adapter (Next.js) | `src/app/api/einvoice/**` |
| Bank rec adapter (Next.js) | `src/app/api/bankrec/**` |

## Bảng dữ liệu

- `einvoice_log` — log phát hành HĐĐT (document_id, provider, direction ISSUE/RECEIVE/CANCEL/ADJUST, status PENDING/ISSUED/ERROR/CANCELLED, invoice_series/number/code, lookup_code, request/response_payload)
- RLS: tenant isolation, REVOKE ALL cho authenticated

## API / RPC

### E-invoice (WP-H1)
- `api_log_einvoice(p_document_id, p_provider, p_direction, p_status, ...)` — ghi log kết quả gọi nhà cung cấp HĐĐT (chỉ INV/SINV)
- `api_get_einvoice_logs(p_document_id)` — danh sách log HĐĐT cho 1 chứng từ
- `api_einvoice_providers()` — danh sách nhà cung cấp HĐĐT (VNPT, Viettel) + sandbox URL
- State mới trên INV: POSTED → ISSUED (phát hành HĐĐT), ISSUED → PAID/PARTIALLY_PAID/CANCELLED

### Bank Reconciliation (WP-H2)
- `api_bankrec_import(p_document_id, p_lines)` — import bulk dòng sao kê vào BANKREC (DRAFT only)
  - Mỗi dòng: `{date, description, amount, reference}`; amount > 0 = thu, < 0 = chi
- `api_bankrec_suggest(p_document_id)` — gợi ý khớp giao dịch cho dòng chưa matched:
  - Tìm PMT (amount khớp, negative) hoặc RCPT (amount khớp, positive)
  - Confidence: HIGH (số chứng từ xuất hiện trong description), MEDIUM (title match / date < 3 ngày), LOW

### Health Check (WP-H3)
- `api_health_check()` — kiểm tra hệ thống (cho cả anon + authenticated):
  - Bảng core tồn tại + row count (-1 = thiếu bảng): tenants, app_users, documents, document_lines, gl_entries, audit_trail, state_transitions, sod_matrix, roles, permission_matrix
  - Config checks: state_transitions, sod_matrix, doc_types, roles, permission_matrix
  - Migration version = migration mới nhất trong `public._migrations` (ghi bởi `node scripts/db.mjs migrate`)
  - 038: sửa bảng không tồn tại của bản 032; api_log_einvoice / api_bankrec_* sửa lỗi gọi `fn_perm_scope(record, …)`

## Quy tắc nghiệp vụ

1. E-invoice chỉ áp dụng cho INV/SINV; kiểm tra EXECUTE permission trên doc_type
2. Bank rec import chỉ khi BANKREC ở DRAFT; kiểm tra EDIT permission
3. Suggest matching: không match dòng đã matched bởi BANKREC khác
4. Health check public (anon + authenticated) — không tiết lộ dữ liệu nghiệp vụ

## Dependencies

- `002_core_schema.sql` — documents, document_lines, gl_entries
- `003_config.sql` — state_transitions (thêm ISSUED cho INV)
- `015_multitenant.sql` — tenant isolation
