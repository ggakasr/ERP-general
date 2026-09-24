---
covers: src/app/(portal)/**, src/app/(app)/billing/**, supabase/migrations/034_portal.sql, supabase/migrations/035_billing.sql
last_verified: 2026-09-24
ttl_days: 30
---

# 031 — Portal & Billing (Client/Agent Portal + Subscription)

## Tổng quan

Hai module: (1) WP-F3 Client Portal + Agent Portal cho phép khách hàng và đại lý
truy cập hệ thống qua giao diện riêng, chỉ thấy lô hàng/chứng từ liên quan đến mình;
(2) WP-I1 Billing/Subscription quản lý gói dịch vụ SaaS (STARTER/PROFESSIONAL/ENTERPRISE)
với feature gate theo plan.

## Key Files

| Mục đích | File |
|---|---|
| Portal roles + RPCs + fn_doc_in_scope mở rộng | `supabase/migrations/034_portal.sql` |
| Subscription + plan features + feature gates | `supabase/migrations/035_billing.sql` |
| Trang portal | `src/app/(portal)/**` |
| Trang billing | `src/app/(app)/billing/**` |

## Bảng dữ liệu

### Portal
- `app_users` mở rộng: thêm cột `partner_id` (FK → partners) và `user_type` (INTERNAL / PORTAL_CUSTOMER / PARTNER_AGENT)
- Roles mới: `PORTAL_CUSTOMER`, `PARTNER_AGENT`

### Billing
- `subscriptions` — (tenant_id, plan, seats, valid_from, valid_to, status ACTIVE/TRIAL/EXPIRED/CANCELLED, trial_ends)
- `plan_features` — ma trận tính năng theo plan (plan, feature, limit_value, enabled). GRANT SELECT cho authenticated.

## API / RPC

### Portal (WP-F3)
- `api_portal_shipments(p_status, p_limit)` — lô hàng visible cho portal user (partner_id match), ẩn internal_notes/cost_price/margin
- `api_portal_tracking(p_shipment_id)` — tracking events cho lô hàng (partner_id check)
- `api_portal_documents(p_shipment_id, p_limit)` — chứng từ + attachments cho partner (INV/SINV/QUOT/HBL/DO/DNOTE/CNOTE)
- `api_portal_confirm_quote(p_quote_id, p_action)` — khách hàng ACCEPT/REJECT báo giá (QUOT status SUBMITTED/SENT)

### Billing (WP-I1)
- `api_subscription_info()` — thông tin subscription + usage (active_users, doc_types_used, documents_total) + features matrix
- `api_admin_change_plan(p_tenant_id, p_new_plan)` — upgrade/downgrade plan (yêu cầu TENANT EDIT scope COMPANY)
- `fn_feature_enabled(p_feature)` — boolean check: feature X có được bật cho tenant hiện tại không
- `fn_feature_limit(p_feature)` — giới hạn số lượng (VD: MAX_USERS = 5 cho STARTER)

## fn_doc_in_scope mở rộng

Portal users (partner_id IS NOT NULL): OWN scope = chỉ thấy chứng từ có `documents.partner_id = app_users.partner_id`.
Internal users không bị ảnh hưởng.

## Quyền Portal

| Role | Resources | Actions | Scope |
|---|---|---|---|
| PORTAL_CUSTOMER | SHIPMENT, QUOT, BOOKING, HBL, DO, INV, SINV | VIEW | OWN (partner) |
| PORTAL_CUSTOMER | QUOT | EDIT | OWN (confirm quote) |
| PARTNER_AGENT | + DNOTE, CNOTE | VIEW | OWN (partner) |
| PARTNER_AGENT | DNOTE, CNOTE | CREATE, EDIT | OWN |

Hidden fields cho portal: cost_price, margin, internal_notes.

## Feature Matrix

| Feature | STARTER | PROFESSIONAL | ENTERPRISE |
|---|---|---|---|
| MAX_USERS | 5 | 20 | unlimited |
| MAX_DOC_TYPES | 5 | unlimited | unlimited |
| AUDIT_PACK | no | yes | yes |
| SLA_TRACKING | no | yes | yes |
| PORTAL | no | yes | yes |
| RISK_ALERTS | no | yes | yes |
| DELEGATION | no | yes | yes |
| CUSTOM_BRANDING | no | no | yes |

## Dependencies

- `029_multi_level_approval.sql` — fn_doc_in_scope (base version mở rộng thêm portal logic)
- `021_attachments.sql` — attachments (cho portal documents download)
- `015_multitenant.sql` — tenants.plan, fn_current_tenant
