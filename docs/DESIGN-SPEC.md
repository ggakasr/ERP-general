---
covers: src/app/globals.css, src/components/layout/*, src/components/ui/*, src/components/shared/bits.tsx, src/app/(app)/**
last_verified: 2026-09-21
ttl_days: 180
scope: WP-J1 design system & app shell; WP-J2 state matrix & behaviour
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

---

## 9. State matrix — màn cốt lõi (WP-J2)

Mỗi màn phải xử lý đủ 6 trạng thái: **loading · empty · error · role-gated · data · partial-data**.

| Màn | Loading | Empty | Error | Role-gated | Data |
|---|---|---|---|---|---|
| Dashboard `/dashboard` | `SkeletonKpiGrid` (KPI) + skeleton rows (activity/my-docs) | "Chưa có hoạt động." — không CTA vì là tổng quan | Không hiển thị riêng; từng card ẩn nếu API lỗi | KPI grid chỉ hiện khi `can("KPI","VIEW")` | KPI grid + activity + inbox preview |
| Danh sách chứng từ `/:module` | `SkeletonTable` khi `loading && rows.length === 0` | Link "Tạo X đầu tiên" nếu `canCreate`, "Không có chứng từ…" nếu không | `ErrorBox` + nút Thử lại (`onRetry={load}`) | `EmptyState` "Bạn không có quyền xem" | Table + pagination + filter chips |
| Chi tiết `/documents/[id]` | `SkeletonDocDetail` giữ đúng layout header + tabs | — (luôn có doc hoặc hiện error) | `ErrorBox` + nút Thử lại + nút Quay lại | ActionBar ẩn action không có quyền; trường bị mask bằng `<Masked />` | Header + ActionBar + tabs nội dung |
| Inbox `/tasks` | `SkeletonInbox` (4 rows giữ layout) | "Không có việc nào đang chờ bạn." — không CTA | `ErrorBox` + `onRetry={reload}` | — (tất cả việc đã qua filter phân quyền ở DB) | Danh sách việc với filter theo loại |
| Trace `/trace` | `SkeletonTable` trong từng subtab (Money/Goods/Responsibility) | 3 card hướng trace + hướng dẫn tìm kiếm | `ErrorBox` + `onRetry` trong mỗi subtab | GL/kho ẩn nếu không có quyền (hiển thị ghi chú) | Cây chứng từ + bảng GL/kho + check |
| Controls `/controls` | Ẩn/hiện theo quyền khi mount | "Không có dữ liệu trong phạm vi." per tab | — (dữ liệu tĩnh, ít lỗi API) | Tabs SoD Log/Handoff ẩn khi không có quyền; ghi chú hiển thị | Tabs với bảng ma trận + log + số liệu |
| Exceptions `/exceptions` | `SkeletonTable` (qua DocTable) | Link tạo EXC đầu tiên nếu canCreate | `ErrorBox` + Thử lại (qua DocTable) | — | Table ngoại lệ |

### Quy tắc chung (enforce bởi code — không phải convention)

- `loading` → **Skeleton** giữ nguyên shape layout (không nhảy content khi data về)
- `empty` → **1 câu ngắn + 1 CTA** (nếu user có thể tự giải quyết); cấm văn thuyết minh
- `error` → **`ErrorBox`** hiện message + nút "Thử lại" (`onRetry`) — không ép reload trang
- `role-gated` → Ẩn action/trường, **không ẩn màn hình** (user vẫn thấy cấu trúc)
- `partial-data` → Hiện đủ shape; trường ẩn dùng `<Masked />` với tooltip giải thích
- **Toast** (`useToast()`) → chỉ dùng cho mutation (success/error); không toast cho read-only loads

### Component map

| Trạng thái | Component | File |
|---|---|---|
| Loading — table | `SkeletonTable` | `components/ui/skeleton.tsx` |
| Loading — KPI grid | `SkeletonKpiGrid` | `components/ui/skeleton.tsx` |
| Loading — inbox list | `SkeletonInbox` | `components/ui/skeleton.tsx` |
| Loading — doc detail | `SkeletonDocDetail` | `components/ui/skeleton.tsx` |
| Empty — có CTA | `EmptyState` với prop `cta` | `components/shared/bits.tsx` |
| Error — có retry | `ErrorBox` với prop `onRetry` | `components/shared/bits.tsx` |
| Toast mutation | `useToast()` | `components/ui/toast.tsx` |
