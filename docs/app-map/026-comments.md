---
covers: supabase/migrations/023_comments.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 026 — Bình luận trên chứng từ (Comments)

## Tổng quan

Module bình luận (WP-F1) cho phép người dùng trao đổi trực tiếp trên chứng từ.
Hỗ trợ @mention (tag người dùng) → tự động gửi thông báo qua `fn_notify`.
Body tối đa 4000 ký tự.

## Key Files

| Mục đích | File |
|---|---|
| Bảng comments + RPCs | `supabase/migrations/023_comments.sql` |

## Bảng dữ liệu

- `comments` — (document_id, tenant_id, user_id, body, mentions uuid[], created_at)
- CHECK: body phải > 0 ký tự và <= 4000 ký tự
- RLS: tenant isolation policy `comments_tenant_isolation`, REVOKE ALL cho authenticated

## API / RPC

- `api_add_comment(p_document_id, p_body, p_mentions)` — thêm bình luận, kiểm tra quyền VIEW trên chứng từ
  - Với mỗi UUID trong `p_mentions` (trừ chính mình) → gọi `fn_notify` gửi thông báo
- `api_get_comments(p_document_id)` — danh sách bình luận kèm tên người viết, sắp xếp theo created_at

## Quy tắc nghiệp vụ

1. Cần quyền VIEW trên chứng từ để bình luận hoặc xem bình luận
2. @mention → fn_notify gửi thông báo in-app cho người được nhắc (trừ chính người viết)
3. Tenant isolation qua RLS + fn_current_tenant trong api_*

## Dependencies

- `002_core_schema.sql` — documents, app_users
- `026_fix_fn_notify.sql` — fn_notify (gửi thông báo)
