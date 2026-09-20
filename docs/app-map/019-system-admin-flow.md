---
covers: supabase/migrations/003_config.sql, supabase/migrations/006_security.sql, src/app/(app)/admin/**, src/app/api/gate/**
last_verified: 2026-09-20
ttl_days: 30
---

# 019 — System Admin Flow (L10)

## Overview
System admin module manages users, roles, permissions, master data changes, and access reviews. SYS_ADMIN has no business operation permissions — only user/permission management.

## Key Files
- `supabase/migrations/003_config.sql` — MDC, ACCESS_REVIEW doc types, state transitions; permission_matrix data
- `supabase/migrations/006_security.sql` — GRANT/REVOKE rules; security definer functions
- `src/app/(app)/admin/page.tsx` — admin module entry (users, roles, permissions)
- `src/app/api/gate/route.ts` — server-side Supabase client for admin operations

## Document Types & State Machines
- **MDC** (Yêu cầu thay đổi dữ liệu chủ): DRAFT → SUBMITTED → APPROVED/REJECTED; terminal: APPROVED, REJECTED, CANCELLED
  - All master data changes (products, customers, suppliers, COA) go through MDC workflow
  - APPROVED: fn_apply_effects applies the change to master_data table
  - Prevents unauthorized master data modification

- **ACCESS_REVIEW** (Rà soát quyền): DRAFT → SUBMITTED → APPROVED; terminal: APPROVED
  - Created via api_create_access_review(p_period) — auto-generates lines for all active users
  - Each line: user_id, current roles, reviewer decision (KEEP/REVOKE)
  - On APPROVED: api_access_review_decide applies REVOKE decisions → removes roles from users
  - Quarterly review recommended (tied to ĐK1 ownership verification)

## Admin API Functions
- `api_admin_set_role(p_user_id, p_role_code, p_action='grant'|'revoke')` — grant or revoke role; requires SYS_ADMIN
- `api_admin_set_permission(p_role_code, p_resource, p_action, p_scope, p_hidden)` — update permission matrix
- `api_admin_set_user_status(p_user_id, p_status='ACTIVE'|'SUSPENDED'|'INACTIVE')` — user lifecycle
- `api_create_access_review(p_period)` — creates ACCESS_REVIEW document with all user lines
- `api_access_review_decide(p_doc_id, p_decisions[])` — apply reviewer decisions
- `api_master_data(p_category, p_status?)` — read master data catalog

## Business Rules
1. SYS_ADMIN cannot VIEW or act on business documents (PR, PO, INV, etc.) — pure admin only
2. Permission changes via api_admin_set_permission only (no direct table access)
3. Role grant/revoke logged to audit_trail
4. SoD: SYS_ADMIN cannot also be APPROVER for financial documents (checked by SoD matrix)
5. ACCESS_REVIEW creator ≠ reviewer/approver (SoD applies)
6. MDC: submitter ≠ approver — prevents unauthorized master data changes

## Monitoring & Controls
- `api_sod_log(p_from?, p_to?)` — all SoD violation attempts (blocked or override)
- `api_audit_trail(p_entity_type?, p_entity_id?)` — immutable change log
- `api_control_summary()` — BM-12 control dashboard: SoD violations, exceptions, handoff breaches, access review status

## Roles
- SYS_ADMIN: CREATE/REVOKE user roles + permissions; MANAGE user status; VIEW audit_trail + sod_log
- CEO/CFO: APPROVE ACCESS_REVIEW; VIEW control_summary
- INTERNAL_AUDITOR: VIEW audit_trail, sod_log, control_summary (read-only)
- DEPT_HEAD: CREATE MDC (DEPARTMENT); cannot approve own MDC
