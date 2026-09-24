---
covers: src/app/api/ingest/**, supabase/migrations/022_ingest.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 025 — AI Nhận dạng chứng từ (AI Ingestion)

## Tổng quan

Pipeline nhận dạng chứng từ tự động (WP-E2) dùng AI (Claude Sonnet vision) để trích xuất
thông tin từ ảnh/PDF. Kết quả tạo chứng từ DRAFT với flag `ai_extracted=true`, bắt buộc
người dùng review thủ công trước khi submit. Nếu mã đối tác hoặc sản phẩm không khớp
master data, hệ thống tự sinh Exception (EXC) liên kết với DRAFT.

## Key Files

| Mục đích | File |
|---|---|
| Bảng ingest_jobs + RPCs | `supabase/migrations/022_ingest.sql` |
| API route gọi Claude vision | `src/app/api/ingest/**` |

## Bảng dữ liệu

- `ingest_jobs` — job nhận dạng (tenant_id, source_type ATTACHMENT/UPLOAD, doc_type, attachment_id, status, extracted JSONB, confidence, created_document_id, error_message)
- Status flow: PENDING → PROCESSING → DONE / DONE_WITH_EXCEPTIONS / ERROR
- RLS: REVOKE ALL, mọi truy cập qua api_*

## API / RPC

- `api_create_ingest_job(p_doc_type, p_source_type, p_attachment_id)` — tạo job trước khi gọi AI
- `api_apply_ingest(p_job_id, p_extracted, p_confidence)` — tạo DRAFT từ dữ liệu AI trích xuất:
  - Gắn `ai_extracted=true`, `confidence`, `ingest_job_id` vào document.data
  - Resolve `partner_code` → partner_id; nếu không tìm thấy → tạo EXC DATA_MISMATCH
  - Resolve `product_code` trong mỗi line; nếu không tìm thấy → tạo EXC DATA_MISMATCH
  - Lỗi exception: DONE_WITH_EXCEPTIONS; không có lỗi: DONE
- `api_get_ingest_job(p_job_id)` — chi tiết 1 job (status, extracted, confidence, error)
- `api_list_ingest_jobs(p_limit, p_offset)` — danh sách jobs của tenant, sắp xếp theo ngày tạo

## Quy tắc nghiệp vụ

1. AI chỉ tạo DRAFT, KHÔNG BAO GIỜ submit/approve/post (an toàn SoD)
2. Chứng từ DRAFT có `ai_extracted=true` phải được human review trước khi chuyển trạng thái
3. Master data mismatch → tự động sinh EXC (exception) liên kết document
4. Job chỉ xử lý được khi status = PENDING hoặc ERROR (retry)
5. Exception khi AI xử lý lỗi: job status = ERROR + error_message

## Dependencies

- `021_attachments.sql` — bảng attachments (nguồn file cho ingest)
- `004_engine.sql` — fn_insert_document (tạo DRAFT nội bộ)
- `002_core_schema.sql` — partners, products (master data lookup)
