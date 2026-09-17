# ADR-0001 — Next.js + Supabase, nghiệp vụ enforce trong PostgreSQL

- **Trạng thái**: Đã chấp nhận (2026-09-17)
- **Liên quan**: CLAUDE.md §2 (P5, P8, P14, P15), §3 (ĐK3, ĐK4, ĐK8), §6

## Bối cảnh

CLAUDE.md mô tả kiến trúc tham chiếu NestJS + Prisma + Next.js monorepo. Dự án thực tế đã chọn
Next.js 14 + Supabase + Vercel để có bản demo chạy được sớm. Bản demo đầu dùng Zustand + dữ liệu mock,
không có đăng nhập thật, SoD/audit chỉ chạy trong trình duyệt và mất khi tải lại trang.

Yêu cầu tiếp theo: một luồng nghiệp vụ liền mạch từ đầu đến cuối, truy vết được theo 3 cách, nhiều
tài khoản với vai trò / phạm vi dữ liệu / trường hiển thị khác nhau, và các kiểm soát không thể bị
bỏ qua từ phía client.

## Quyết định

1. **Không có backend server riêng.** Toàn bộ logic nghiệp vụ (LOGIC theo P5) nằm trong PostgreSQL
   dưới dạng hàm `api_*` (`SECURITY DEFINER`). Frontend chỉ gọi `supabase.rpc()` bằng anon key +
   JWT của người dùng — không cần service role key trên Vercel.
2. **Mô hình chứng từ hợp nhất** (`documents`, `document_lines`, `document_links`, `document_actions`)
   thay cho bảng riêng theo từng loại. State machine (BM-05), quy tắc tạo chứng từ con (BM-09) và
   bàn giao (BM-04) là **dữ liệu cấu hình** trong `003_config.sql`, không hard-code trong UI.
3. **Kiểm soát enforce tại DB**:
   - Phân quyền 3 tầng (ĐK8): `permission_matrix` (vai trò × tài nguyên × hành động × phạm vi × trường ẩn),
     kiểm tra bởi `fn_doc_in_scope` và `fn_hidden_fields`/`fn_mask` trong mọi API đọc.
   - SoD (ĐK3): `fn_sod_enforce` xét vai trò SoD của người dùng trên chứng từ và toàn bộ chứng từ nguồn
     (PO → PR…). Mọi lần kiểm tra được ghi `sod_check_log`; lần bị chặn ghi thêm `audit_trail` (T3.4).
   - Audit (ĐK4): trigger `fn_audit_row` trên mọi bảng nghiệp vụ; `audit_trail`, `gl_entries`,
     `document_actions`, `sod_check_log` là append-only (trigger chặn UPDATE/DELETE).
   - Client không có quyền SELECT/INSERT/UPDATE trên bảng nghiệp vụ; chỉ đọc bảng danh mục (RLS).
4. **Sổ cái và sổ kho là nguồn sự thật cho truy vết**: bút toán sinh tự động khi chuyển trạng thái;
   kho theo lô FIFO (`stock_moves.source_move_id`) cho phép truy nguồn gốc hàng tới tận phiếu nhập/PO/PR.
5. **Seed chạy qua chính các API** với thời gian giả lập (`app.fake_now`), nên dữ liệu mẫu luôn nhất quán
   và seed đóng vai trò kiểm thử end-to-end.

## Hệ quả

- (+) Không thể bỏ qua SoD/quyền bằng cách gọi API trực tiếp; mọi client (web, script) chịu cùng luật.
- (+) Một lần gọi RPC ≈ 120 ms (chủ yếu độ trễ mạng); không cần hạ tầng backend.
- (−) Logic nằm trong PL/pgSQL: cần kỷ luật migration và bộ acceptance test (`npm run test:acceptance`).
- (−) Khác kiến trúc tham chiếu NestJS trong CLAUDE.md; các mục Guard/Interceptor ở §15 được hiện thực
  tương đương bằng hàm `fn_*` và trigger.
