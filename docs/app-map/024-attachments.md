---
covers: supabase/migrations/021_attachments.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 024 — Lưu trữ chứng từ (Attachments)

## Tổng quan

Module đính kèm file (WP-E1) cho phép gắn tài liệu vào bất kỳ chứng từ nào trong hệ thống.
File được upload lên Supabase Storage bucket `documents` (private, max 50MB), metadata ghi
vào bảng `attachments`. API kiểm tra quyền VIEW trên chứng từ trước khi cho phép đính kèm/xem.

## Key Files

| Mục đích | File |
|---|---|
| Storage bucket + attachments table + RPCs | `supabase/migrations/021_attachments.sql` |

## Bảng dữ liệu

- `attachments` — metadata file đính kèm (document_id, tenant_id, file_name, mime, size_bytes, storage_path, checksum, uploaded_by)
- Supabase Storage bucket `documents` — private, file_size_limit 52428800 (50MB)
- RLS: REVOKE ALL cho authenticated, mọi truy cập qua api_* (SECURITY DEFINER)

## API / RPC

- `api_attach_file(p_document_id, p_file_name, p_mime, p_size_bytes, p_storage_path, p_checksum)` — ghi metadata sau khi upload file lên Storage
- `api_get_attachments(p_document_id)` — danh sách file đính kèm của chứng từ (tên, mime, size, người upload, ngày)
- `api_missing_attachments(p_limit)` — danh sách chứng từ có audit trail nhưng chưa có file đính kèm (yêu cầu quyền AUDIT_TRAIL VIEW)

## Quy tắc nghiệp vụ

1. Kiểm tra `fn_doc_in_scope(VIEW)` trước khi cho phép attach hoặc xem attachment
2. Ghi audit trail (INSERT) khi upload file (action = UPLOAD)
3. Storage RLS policies: authenticated users upload/read bucket `documents`, xóa chỉ file do mình upload (owner = auth.uid())
4. `api_missing_attachments` phục vụ kiểm toán: phát hiện chứng từ thiếu bằng chứng đính kèm

## Dependencies

- `002_core_schema.sql` — bảng documents, app_users, audit_trail
- `015_multitenant.sql` — tenant isolation
