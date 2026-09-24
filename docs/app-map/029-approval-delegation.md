---
covers: supabase/migrations/029_multi_level_approval.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 029 — Duyệt đa cấp & Ủy quyền (Multi-level Approval & Delegation)

## Tổng quan

Module duyệt đa cấp (WP-G3) bổ sung chuỗi phê duyệt theo mức rủi ro (amount-based)
và cơ chế ủy quyền có thời hạn. Ví dụ: PO >= 50 triệu VND yêu cầu PROC_MANAGER duyệt
trước, sau đó CFO xác nhận. SoD vẫn được enforce ở mọi bước.

## Key Files

| Mục đích | File |
|---|---|
| Tables + RPCs + config | `supabase/migrations/029_multi_level_approval.sql` |

## Bảng dữ liệu

- `approval_chains` — cấu hình chuỗi duyệt (tenant_id, doc_type, min_amount, max_amount, label, status)
- `approval_chain_steps` — bước trong chuỗi (chain_id, step_order, required_role, label). UNIQUE(chain_id, step_order)
- `approval_chain_log` — log duyệt từng bước (document_id, chain_id, step_id, approved_by). CHỈ INSERT, trigger chặn UPDATE/DELETE
- `delegations` — ủy quyền (delegator_id, delegate_id, doc_types[], sod_roles[], valid_from, valid_until, reason, status)
  - CONSTRAINT: delegator_id != delegate_id, valid_until > valid_from
- Tất cả bảng có tenant_id + RLS + REVOKE ALL.

## API / RPC

- `api_approve_step(p_doc_id, p_step_id, p_comment)` — duyệt 1 bước trong chuỗi; kiểm tra role + SoD (người duyệt != người tạo)
- `api_get_approval_status(p_doc_id)` — trạng thái chuỗi duyệt: chain_required, steps (done/pending), approved_by
- `api_create_delegation(p_delegate_id, p_doc_types, p_sod_roles, p_valid_from, p_valid_until, p_reason)` — tạo ủy quyền; chặn nếu SoD violation (delegate có CREATE → không được nhận APPROVER)
- `api_list_delegations()` — danh sách ủy quyền liên quan đến user hiện tại (cả delegator và delegate)
- `api_revoke_delegation(p_delegation_id)` — thu hồi ủy quyền (chỉ delegator hoặc SYS_ADMIN)

## Hàm mở rộng

- `fn_doc_in_scope` — mở rộng: khi user không có permission trực tiếp cho APPROVE, kiểm tra delegation active → dùng scope của delegator
- `fn_check_condition('chain_complete')` — điều kiện mới: tìm chain áp dụng (doc_type + amount), kiểm tra tất cả steps đã được duyệt

## Quy tắc nghiệp vụ

1. SoD không bao giờ bị bypass: người REQUESTER không thể duyệt bước nào trong chuỗi
2. Delegation không bypass SoD: delegate có CREATE → không thể nhận ủy quyền APPROVER cho cùng doc_type
3. `approval_chain_log` bất biến (trigger `fn_chain_log_immutable` chặn UPDATE/DELETE)
4. Chuỗi duyệt match theo amount: min_amount <= doc.amount < max_amount (NULL = không giới hạn trên)
5. Cấu hình mặc định: PO >= 50 triệu → 2 bước (PROC_MANAGER → CFO)

## Dependencies

- `004_engine.sql` — fn_check_condition, fn_sod_enforce
- `003_config.sql` — state_transitions (thêm condition 'chain_complete' vào PO approve)
- `002_core_schema.sql` — documents, document_actions, user_roles
