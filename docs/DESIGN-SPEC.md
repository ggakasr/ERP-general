---
covers: src/app/globals.css, src/components/layout/*, src/components/ui/*, src/app/(app)/layout.tsx
last_verified: 2026-09-21
ttl_days: 180
scope: WP-J1 design system & app shell
---

# DESIGN-SPEC — ERP General

## 1. Thang người dùng

| Loại | Muốn thấy gì | Hệ thống truyền tải gì | Thúc đẩy action tiếp |
|---|---|---|---|
| **Staff** (nhân viên nghiệp vụ) | Việc cần làm của tôi hôm nay | Inbox ưu tiên + trạng thái chứng từ của mình | Tạo chứng từ / xử lý inbox |
| **Manager** (trưởng bộ phận) | Số liệu bộ phận + việc chờ duyệt | KPI bộ phận + danh sách chờ duyệt | Phê duyệt / từ chối |
| **Finance / Controller** | Sổ cái, SoD, exception, trace | Audit trail đầy đủ + báo cáo tài chính | Chạy báo cáo / duyệt bút toán |
| **Admin** | User, quyền, cấu hình hệ thống | Danh sách user + permission matrix | Phân quyền / lock kỳ kế toán |

**Bất biến hành vi**: Core action (tạo chứng từ, phê duyệt) ≤ 3 click từ màn chính.

## 2. Platform

- Desktop browser: chính (≥ 1280px)
- Responsive: phone 375px — không vỡ layout, sidebar collapse thành drawer
- Dark mode: hỗ trợ đầy đủ, không để sau

## 3. Tokens

### Màu

| Token | Light | Dark | Ghi chú |
|---|---|---|---|
| Background | slate-50 (≈ `0 0% 100%`) | slate-950 | Nền toàn trang |
| Card | white | slate-900 | Card nổi lên |
| Border | slate-200 | slate-800 | Đường phân tách |
| Muted text | slate-500 | slate-400 | Label phụ, placeholder |
| Accent (primary) | blue-600 `221° 83% 53%` | blue-500 `217° 91% 65%` | Button, link, focus ring |
| Destructive | red-500 | red-600 | Xoá, cảnh báo nguy hiểm |
| Success | emerald-600 | emerald-500 | Trạng thái tích cực |
| Warning | amber-600 | amber-500 | Cảnh báo |
| Info | blue-500 | blue-400 | Thông tin trung lập |
| Sidebar bg | slate-50 | slate-950 | Dùng nền muted nhẹ |

Neutral ramp: **slate** (accent blue lạnh → slate phù hợp hơn zinc/stone).

### Typography

Font duy nhất: **system font stack** (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`). Cấm Be Vietnam Pro / Plus Jakarta Sans / Fraunces.

Scale:
- `text-xs` (12px) — caption, badge
- `text-sm` (14px) — body UI, label, table row
- `text-base` (16px) — không dùng thường xuyên
- `text-lg` (18px) — section title
- `text-xl` (20px) — page title
- `text-2xl` (24px) — metric lớn (KPI)
- `text-3xl+` — reserved for landing

Weight: 400 và 500/600. Không dùng 700 trong UI nội bộ.

### Hình khối

- `--radius: 0.5rem` (8px) → shadcn dùng `lg = 8px`, `md = 6px`, `sm = 4px` — button/input 6px, card 8px, modal 12–16px (dùng `rounded-xl`).
- Border: mức 0 = nền; mức 1 = `border + shadow-sm`; mức 2 = `shadow-lg` (overlay).
- Không shadow màu, không glow.

### Spacing

Thang 4/8/12/16/24/32/48/64px (Tailwind `p-1` đến `p-16`). Cấm arbitrary `p-[13px]`.

## 4. App shell — screen map

| Màn hình | Vào từ | Mục tiêu | Step tiếp theo | Primary action |
|---|---|---|---|---|
| Dashboard `/dashboard` | Login / mọi nơi | Tổng quan + inbox | Xử lý item inbox | Tạo chứng từ nhanh |
| Danh sách chứng từ `/:module` | Sidebar | Tìm + lọc chứng từ | Mở chi tiết / tạo mới | Tạo chứng từ |
| Chi tiết `/documents/[id]` | List / search | Xem + thực hiện hành động | Chuyển trạng thái | Nút hành động (duyệt/từ chối/xử lý) |
| Inbox `/tasks` | Dashboard / notif | Xử lý việc chờ | Mở chứng từ cần xử lý | Xem chứng từ |
| Báo cáo `/reports` | Sidebar | Xem số liệu tổng hợp | Export / drill-down | Xem KPI |
| Trace `/trace` | Sidebar / link | Truy vết theo tiền/hàng/trách nhiệm | Mở chứng từ gốc | Chạy trace |
| Controls `/controls` | Sidebar | Xem SoD log / handoff | Xuất báo cáo | Export |

## 5. Sidebar

- 3 nhóm: **Làm việc** (3 item) · **Nghiệp vụ** (9 item) · **Kiểm soát & Báo cáo** (6 item)
- Badge số liệu chỉ xuất hiện khi count > 0; hiển thị max 99+
- Active state: `bg-primary/10 text-primary font-medium`
- Mobile: drawer slide từ trái, overlay backdrop

## 6. Topbar

- Search: tìm chứng từ theo số/diễn giải (debounce 250ms)
- Bell: dropdown thông báo unread (count badge ẩn khi = 0)
- User: avatar + tên + position; dropdown có đổi tài khoản demo / đăng xuất
- Breadcrumb: dòng riêng dưới topbar, 1–2 cấp, clickable

## 7. Components chuẩn (từ skill 03)

| Loại nội dung | Component | Ghi chú |
|---|---|---|
| Tập dữ liệu nhiều cột | Table | shadcn Table |
| Trạng thái hệ thống | Badge (semantic color) | ≤ 2 từ, màu cố định/trạng thái |
| Phân loại gắn nhiều | Tag (neutral) | ≤ 3, còn lại +N |
| Số việc chờ | Count badge trên icon | Ẩn khi = 0 |
| Form dữ liệu | Drawer (Sheet) | Modal chỉ cho confirm/delete |
| Confirm xoá/cancel | Modal/Dialog | ≤ 2 nút, nút huỷ bên trái |
| Kết quả tác vụ | Toast (auto-tắt 4s) | Không confirm |
| Trạng thái loading | Skeleton | Giữ nguyên vị trí content |
| Trạng thái rỗng | EmptyState (1 cụm + 1 CTA) | Không văn thuyết minh |

## 8. QA checklist (từ skill 06)

- [ ] Layout không vỡ ở 375px
- [ ] Dark mode: tất cả text ≥ 4.5:1 contrast
- [ ] Không màu hard-code rải rác (`#...` hoặc `rgb(...)` trong JSX)
- [ ] Badge hiện đúng semantic color theo trạng thái
- [ ] Sidebar active item rõ ràng
- [ ] Focus ring nhìn thấy được (a11y)
- [ ] Breadcrumb hiển thị đúng theo path
- [ ] Module count badge ẩn khi = 0
