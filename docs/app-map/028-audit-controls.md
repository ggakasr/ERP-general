---
covers: supabase/migrations/027_audit_pack.sql, supabase/migrations/028_audit_hash_chain.sql, supabase/migrations/033_risk_alerts.sql, supabase/migrations/037_fix_tenant_regressions.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 028 — Kiểm toán & Kiểm soát nâng cao (Audit Controls)

## Tổng quan

Ba module kiểm toán nâng cao: Audit Pack (WP-G1) kết xuất bộ bằng chứng theo kỳ, Hash-chain
(WP-G2) phát hiện giả mạo audit trail, và Risk Alerts (WP-G4) phát hiện bất thường tự động.

## Key Files

| Mục đích | File |
|---|---|
| Audit Pack — kết xuất + manifest hash | `supabase/migrations/027_audit_pack.sql` |
| Hash-chain trên audit_trail | `supabase/migrations/028_audit_hash_chain.sql` |
| Risk alerts — 4 loại bất thường | `supabase/migrations/033_risk_alerts.sql` |

## API / RPC

### Audit Pack (WP-G1)
- `api_audit_pack(p_from, p_to, p_scope)` — kết xuất 6 sections:
  - audit_trail, sod_check_log, document_links, handoff_records, exception_register, gl_entries
  - Mỗi section có SHA-256 hash; hash tổng = sha256(6 hash nối chuỗi)
  - Tôn trọng fn_doc_in_scope (user chỉ thấy docs có quyền VIEW)

### Hash-chain (WP-G2)
- `trg_audit_chain_hash` (BEFORE INSERT trên audit_trail, hàm `fn_audit_chain_hash()`, từ 037) — băm MỌI bản ghi,
  kể cả INSERT trực tiếp (034/035) và kể cả khi `fn_audit_row()` bị nạp lại bản 004:
  - `prev_hash` = row_hash của bản ghi có hash gần nhất (hoặc 64x'0' nếu chưa có)
  - `row_hash` = `fn_audit_hash(...)` = SHA-256(convert_to(prev_hash + table + record_id + action + old/new + changed + user + timestamp, 'UTF8'))
  - `pg_advisory_xact_lock` + cấp lại `id` sau khi giữ khóa → thứ tự chuỗi = thứ tự id khi chạy song song
  - Bản ghi đã có row_hash khi INSERT được giữ nguyên (verify sẽ kiểm tra)
- `fn_audit_row()` — trigger trên bảng nghiệp vụ, chỉ ghi dòng audit (không tự băm nữa)
- `api_audit_chain_verify(p_from, p_to)` — kiểm tra tính toàn vẹn:
  - Tái tính row_hash, so sánh với giá trị lưu
  - Kiểm tra prev_hash trỏ đúng row_hash bản ghi có hash trước đó
  - Sau khoảng bản ghi cũ chưa băm (row_hash NULL), đoạn chuỗi mới bắt đầu từ 64x'0' — hợp lệ, đếm vào `legacy_gaps`
  - Trả về: ok, total, valid, legacy_gaps, broken_at_id, reason

### Risk Alerts (WP-G4)
- `api_risk_alerts(p_days)` — phát hiện 4 loại bất thường:
  1. SOD_NEAR_MISS — cùng user tạo+duyệt chứng từ KHÁC nhau trong 24h
  2. EXCEPTION_SPIKE — tần suất EXC tăng > 150% so với kỳ trước
  3. OFF_HOURS — chứng từ tạo ngoài 7h-19h (Asia/Ho_Chi_Minh)
  4. AMOUNT_OUTLIER — số tiền > mean + 3 sigma

## Quy tắc nghiệp vụ

1. Audit Pack: hash ổn định khi dữ liệu không đổi (deterministic JSONB sort)
2. Hash-chain: bản ghi cũ (row_hash IS NULL) được bỏ qua khi verify (tương thích ngược); không sửa bản ghi audit cũ để "nối lại" chuỗi.
   028 dùng `text::bytea` (lỗi khi JSON chứa dấu `\`) — 037 đổi sang `convert_to`; hash cũ không đổi vì không bản ghi nào chứa `\`
3. Risk alerts: yêu cầu quyền CONTROLS VIEW hoặc AUDIT_TRAIL VIEW
4. Không thêm bảng mới — risk alerts chỉ đọc bảng sẵn có

## Cột bổ sung trên audit_trail

- `prev_hash text` — hash của bản ghi liền trước
- `row_hash text` — hash SHA-256 của bản ghi hiện tại

## Dependencies

- `002_core_schema.sql` — audit_trail, documents, gl_entries, sod_check_log
- `004_engine.sql` — fn_doc_in_scope, fn_perm_scope
- `003_config.sql` — document_links, handoff_records
