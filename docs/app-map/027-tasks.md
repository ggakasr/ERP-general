---
covers: src/app/(app)/tasks/**, supabase/migrations/024_tasks.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 027 — Hàng chờ công việc (Task Queue)

## Tổng quan

Module task queue (WP-F2) nhóm các chứng từ cần xử lý theo vai trò SoD
(APPROVE / EXECUTE / REQUEST / AUDIT) với ưu tiên SLA. Là phiên bản nâng cao
của `api_inbox`, phân loại công việc để người dùng biết mình cần làm gì.

## Key Files

| Mục đích | File |
|---|---|
| RPC api_tasks | `supabase/migrations/024_tasks.sql` |
| Trang tasks | `src/app/(app)/tasks/**` |

## API / RPC

- `api_tasks()` — trả danh sách chứng từ chưa terminal mà user có thể thao tác:
  - `document` — chứng từ (đã mask theo field_restrictions)
  - `actions` — hành động khả dụng (chỉ transition primary/success + create children)
  - `role_groups` — nhóm vai trò: APPROVE, EXECUTE, AUDIT, REQUEST, OTHER
  - `primary_role_group` — nhóm chính (ưu tiên: APPROVE > EXECUTE > AUDIT > REQUEST > OTHER)
  - `handoff` — handoff record gần nhất (SLA status, expected_action, to_role)
  - `sla_priority` — 0 (BREACHED) → 1 (AT_RISK) → 2 (ON_TIME) → 3 (không có SLA)
  - `counts` — tổng hợp số lượng theo primary_role_group

## Quy tắc nghiệp vụ

1. Chỉ hiển thị chứng từ chưa ở trạng thái terminal (`NOT status = ANY(terminal_statuses)`)
2. Chỉ hiển thị hành động kiểu transition (primary/success) hoặc tạo child (trừ TICKET/WO)
3. Kiểm tra `fn_doc_in_scope(VIEW)` trước khi hiển thị
4. SLA priority từ `handoff_records` + `fn_sla_status`: BREACHED ưu tiên cao nhất
5. `blocked_by_sod` = true khi tất cả action đều có sod_conflict
6. Giới hạn 600 chứng từ gần nhất (ORDER BY updated_at DESC)

## Dependencies

- `004_engine.sql` — fn_available_actions, fn_doc_json, fn_mask, fn_hidden_fields
- `007_flow_ownership.sql` — fn_sla_status
- `003_config.sql` — doc_types, state_transitions, handoff_map
