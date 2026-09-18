---
covers: project root, src/**, supabase/**, scripts/**, tests/**
last_verified: 2026-09-18
ttl_days: 30
---

# 001 — Tổng quan hệ thống ERP General

## Kiến trúc (xem ADR-0001)

```
Next.js 14 (Vercel)  ──supabase.rpc()──►  PostgreSQL (Supabase)
  src/app/(app)/*       JWT người dùng       api_*  (SECURITY DEFINER, cấp cho role authenticated)
  src/middleware.ts                          fn_*   (nội bộ: quyền, SoD, sổ cái, kho, handoff)
                                             trigger audit / append-only
```

## Key files

| Mục đích | File |
|---|---|
| Schema hợp nhất (L1–L4, sổ cái, sổ kho) | `supabase/migrations/002_core_schema.sql` |
| Vai trò, ma trận quyền, SoD, state machine, handoff, COA, KPI, BM-14 | `supabase/migrations/003_config.sql` |
| Engine: tạo/chuyển trạng thái chứng từ, side effects, lương, khấu hao | `supabase/migrations/004_engine.sql` |
| API đọc: danh sách, chi tiết, inbox, 3 truy vết, báo cáo, kiểm soát | `supabase/migrations/005_read_api.sql` |
| Grants + RLS | `supabase/migrations/006_security.sql` |
| Nhãn "việc của ai / tiếp theo là ai" (`fn_role_names_for`, `fn_owner_label`) — tính từ `permission_matrix`, không hard-code | `supabase/migrations/007_flow_ownership.sql` |
| Báo cáo lãi gộp theo sản phẩm & khách hàng (`api_product_profit`) | `supabase/migrations/008_product_profit.sql` |
| Thuế GTGT trên hóa đơn bán ra/mua vào (TK 1331/3331), cộng vào `documents.amount` khi ghi sổ | `supabase/migrations/009_vat.sql` |
| Dữ liệu mẫu tháng 7–9/2026 (chạy qua API) | `supabase/seed/seed.sql` |
| Công cụ DB | `scripts/db.mjs` (`migrate`, `seed`, `reset`, `functions`, `sql`, `file`) |
| Acceptance tests (BM-14) | `tests/acceptance.test.mjs` |
| Cấu hình UI theo loại chứng từ | `src/lib/doc-config.ts` |
| Phiên đăng nhập + quyền phía UI | `src/lib/session.tsx` |
| Danh sách / chi tiết / tạo chứng từ | `src/components/docs/*`, `src/app/(app)/documents/*` |
| Truy vết 3 đường | `src/app/(app)/trace/page.tsx` |

## API chính

- Ghi: `api_create_document(p_doc_type, p_header, p_lines, p_parent_id, p_idempotency_key)`,
  `api_transition(p_doc_id, p_action, p_comment, p_expected_version, p_payload)`, `api_update_document`,
  `api_create_payroll`, `api_run_depreciation`, `api_create_access_review`, `api_access_review_decide`,
  `api_set_period_status`, `api_admin_set_role`, `api_admin_set_permission`, `api_admin_set_user_status`,
  `api_mark_notifications_read`, `api_update_acceptance`.
- Đọc: `api_me`, `api_master_data`, `api_list_documents`, `api_get_document`, `api_search`, `api_inbox`,
  `api_dashboard`, `api_notifications`, `api_trace_money`, `api_trace_goods`, `api_trace_responsibility`,
  `api_trial_balance`, `api_financial_statements`, `api_stock_on_hand`, `api_stock_ledger`,
  `api_budget_report`, `api_aging`, `api_kpis`, `api_audit_trail`, `api_sod_log`, `api_handoffs`,
  `api_control_summary`, `api_employees`.
- Mọi hàm trả `{ ok: true, ... }` hoặc `{ ok: false, code, error }` với `code` ∈ `UNAUTHENTICATED`,
  `FORBIDDEN`, `SOD_VIOLATION`, `INVALID_TRANSITION`, `CONDITION_FAILED`, `CONFLICT`, `VALIDATION`, `BUSINESS_RULE`.

## Luồng chứng từ (BM-09)

```
L1  BUDGET ─(tham chiếu khi duyệt PO)─┐
L3  PR → PO → GRN → SINV → PMT         │  3-way match: SL lệch 0, giá ±2% → lệch thì ON_HOLD + EXC
L2  QUOT → SO → DN → INV → RCPT        │  SO có thể sinh WO (make-to-order) và TICKET
L5  WO (vật tư theo BOM, FIFO) → thành phẩm
L4  ST (chuyển kho), ADJ (kiểm kê)
L6  HIRE → nhân viên; PAYROLL → PMT
L7  JV, BANKREC; khóa kỳ OPEN → SOFT_CLOSE → HARD_CLOSE
L8  ASSET → khấu hao (JV) → PMT / thanh lý
L9  TICKET (tự phân công, SLA, CSAT)
L10 MDC (thay đổi dữ liệu chủ), ACCESS_REVIEW
L11 báo cáo, KPI, 3 đường truy vết
```

## Vận hành

```bash
npm run db:migrate          # áp dụng migration mới
npm run db:reset            # xóa & tạo lại toàn bộ + seed (MẤT dữ liệu hiện có)
node scripts/db.mjs functions   # hot-patch hàm sau khi sửa 004/005
npm run test:acceptance     # 56 kiểm thử (BM-14), chạy trong transaction rồi rollback
npm run typecheck && npm run build
```

## Dependencies
- Supabase Auth (email/password) — tài khoản demo tạo bởi seed, mật khẩu `Demo@123`.
- Biến môi trường Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
