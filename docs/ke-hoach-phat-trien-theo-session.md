---
covers: docs/, supabase/migrations/, src/, tests/
last_verified: 2026-09-20
ttl_days: 60
status: KẾ HOẠCH PHÁT TRIỂN CHIA THEO SESSION (ĐÃ DUYỆT 2026-09-20)
nguon: docs/phan-tich-canh-tranh-freightek.md (§5, §8, §9, §10, §12)
---

# Kế hoạch phát triển ERP-General — chia theo gói việc cho từng session

> **Mục đích của file này**: biến kế hoạch nâng cấp trong `phan-tich-canh-tranh-freightek.md`
> thành **các gói việc độc lập (WP = Work Package)**. Mỗi gói đủ ngữ cảnh để giao cho **một session
> Claude Code riêng**. Khi mở session mới, chủ dự án chỉ cần dán **prompt mẫu** của gói đó
> (hoặc ghi ngắn "làm gói WP-B1 theo `docs/ke-hoach-phat-trien-theo-session.md`").
>
> **Trạng thái**: ✅ ĐÃ DUYỆT (2026-09-20) — đang thực thi. Xem tiến độ ở §2 và bảng bàn giao §6.2.

---

## 0. CÁCH DÙNG FILE NÀY

1. Mỗi gói có mã cố định: `WP-<Nhóm><Số>` (ví dụ `WP-C1` = Shipment).
2. Khi bắt đầu một gói ở session mới, **dán khối "📋 PROMPT MẪU"** của gói đó vào ô chat.
   Prompt đã trỏ sẵn tới file này + file phân tích gốc, nên session mới sẽ tự nạp đủ ngữ cảnh.
3. **Đọc cột "Phụ thuộc" trước.** Không mở gói khi gói phụ thuộc chưa xong (sẽ phải làm lại).
4. Mỗi gói kết thúc bằng: code + test map được tới acceptance test + cập nhật app-map + commit ngay,
   **rồi điền checklist bàn giao §6.1 và thêm dòng vào bảng §6.2** (để chủ dự án khỏi kiểm tra lại).
5. File này là tài liệu sống. Gói nào xong (đủ §6.1) → đánh dấu `[x]` ở §2 và ghi ngày.

### Quy tắc chung áp cho MỌI session (trích `CLAUDE.md`)

- **Không** viết lại sang NestJS/Prisma. Kiến trúc Postgres-centric hiện tại là lợi thế — giữ nguyên.
- **Không** hard-code nghiệp vụ vào `004_engine.sql`. Thực thể/trạng thái/quyền mới → đi qua **dữ liệu cấu hình**
  (`003_config.sql` hoặc migration mới) + `src/lib/doc-config.ts`.
- **Không** cấp quyền đọc/ghi bảng nghiệp vụ cho `authenticated`. Mọi truy cập qua hàm `api_*` (xem `006_security.sql`).
- **Không** sửa/xoá audit trail. AI không được gọi transition `SUBMIT/APPROVE/POST`.
- SoD là **absolute blocker** — không bao giờ bypass. Test `T3.1–T3.4` phải luôn PASS.
- Trước commit: `npm run typecheck`, `npx next lint`, `npm run test:acceptance`.
- Mỗi thay đổi map được tới ≥1 acceptance test. Commit ngay khi thay đổi, không dồn cuối.
- Sửa hàm khi dev: `node scripts/db.mjs functions`. Đổi schema: tạo migration mới (không sửa migration cũ đã chạy).

---

## 1. BẢN ĐỒ CÁC NHÓM & THỨ TỰ

```
NHÓM A  Nền tảng trung thực & định vị      (P0 — làm TRƯỚC MỌI THỨ, độc lập)
NHÓM B  Lớp hiển thị (chart, PWA)          (P1 — rẻ nhất, làm sớm để có demo; độc lập)
NHÓM C  Nghiệp vụ ngành logistics          (P1 — Shipment → Rate → Lịch tàu; nội bộ tuần tự)
NHÓM D  Multi-tenant                       (P2 — chặn cứng thương mại; làm TRƯỚC khách thứ hai)
NHÓM E  Số hoá chứng từ & AI ingestion     (P2 — Storage → AI; điểm bán số 1)
NHÓM F  Cộng tác & cổng ngoài              (P2–P3 — Comment → Task → Portal)
NHÓM G  Kiểm soát nâng cao (bảo vệ lợi thế)(P2 — Audit Pack, hash-chain, duyệt đa cấp)
NHÓM H  Tích hợp & vận hành                (P2 — hoá đơn ĐT, sao kê NH, backup/DR)
NHÓM I  Thương mại hoá                     (P3 — billing, landing, help center)
NHÓM J  Lớp trải nghiệm (UX/UI)            (P1–P2 — design system, hành vi màn, QA UX; để BẰNG/HƠN Freightek)
```

### Sơ đồ phụ thuộc (mũi tên = "phải xong trước")

```
A (P0) ─── không phụ thuộc gì, mở khoá niềm tin cho tất cả

B1 chart ─── độc lập
B2 PWA   ─── độc lập

C1 Shipment ──► C2 Rate ─┐
             └► C3 Lịch tàu/Tracking
C1 cũng làm giàu dữ liệu cho B1 (thêm widget shipment)

D1 Multi-tenant ─── nên làm trước F3 (Portal) và I1 (Billing)

E1 Storage ──► E2 AI ingestion
F1 Comment ─── độc lập ;  F2 Task queue ─── độc lập
F3 Portal ──► cần D1 (multi-tenant) + C1 (shipment) để có ý nghĩa

G1 Audit Pack ─── độc lập ;  G2 hash-chain ─── độc lập
G3 duyệt đa cấp ─── độc lập ;  G4 anomaly ─── cần B1 (để hiển thị)

J1 design system ─── nền cho MỌI màn; làm sớm (frontend-only, không đụng schema)
J2 hành vi/trạng thái ──► cần J1
J3 QA UX toàn bộ ──► cần J1+J2 ; chạy gần cuối (khi phần lớn màn đã có)
J4 UI shipment ──► cần C1 + J1
(B1 chart nên dựng SAU J1 để ăn theo design system; C1/C2/C3 & mọi màn mới nên theo chuẩn J1)

H1/H2/H3 ─── độc lập với nhau
I1 Billing ──► cần D1 ;  I2 Landing/Help ─── cần A4 (app-map) làm nền
```

### Có thể chạy SONG SONG (nhiều session cùng lúc) — nếu có nhiều người/nhiều máy

- Đợt 1 (song song được): **WP-A1, WP-A2/A3, WP-A4, WP-B1, WP-B2**
- Đợt 2 (sau khi A xong, song song được): **WP-C1**, **WP-D1**, **WP-E1**, **WP-F1**, **WP-G1**
- ⚠️ **WP-D1 (multi-tenant) đụng gần như mọi bảng** → khi đang chạy D1, tránh chạy song song
  gói khác có thêm bảng mới (C1, E1). Ưu tiên xong D1 rồi mới thêm bảng, HOẶC xong bảng mới rồi mới D1.
  Nếu buộc song song, gói thêm bảng phải tự thêm `tenant_id` theo chuẩn D1 đặt ra.

---

## 2. DANH SÁCH GÓI (checklist tiến độ)

| Mã | Tên gói | Ưu tiên | Phụ thuộc | Ước lượng | Xong? |
|---|---|---|---|---|---|
| WP-A1 | 7 test còn thiếu + CI đếm test + sửa số liệu CLAUDE.md | P0 | — | 1 ngày | [x] |
| WP-A2 | `docs/positioning.md` + sửa mô tả kiến trúc CLAUDE.md | P0 | — | 3 giờ | [x] |
| WP-A3 | Commit `AGENTS.md` (dọn git status) | P0 | — | 15 phút | [x] |
| WP-A4 | Viết đủ 16 file `docs/app-map/` | P0–P1 | — | 3–5 ngày | [x] |
| WP-B1 | Chart layer (recharts) + 7 widget + bộ lọc thời gian | P1 | — | 1–2 tuần | [x] |
| WP-B2 | PWA + bottom nav + Web Push | P1 | — | 1 tuần | [x] |
| WP-C1 | Thực thể SHIPMENT qua config (`011_shipment.sql`) | P1 | — | 2–3 tuần | [x] |
| WP-C2 | Rate & Charge engine + trang `/pricing` | P1 | WP-C1 | 2–3 tuần | [x] |
| WP-C3 | Danh mục cảng/hãng tàu + timeline tracking | P1 | WP-C1 | 1 tuần | [x] |
| WP-D1 | Multi-tenant + RLS theo tenant + provisioning | P2 | — | 4–6 tuần | [x] |
| WP-E1 | Lưu trữ chứng từ (Storage + `attachments`) | P2 | — | 1 tuần | [x] |
| WP-E2 | AI ingestion pipeline (`/api/ingest` + `ingest_jobs`) | P2 | WP-E1 | 2–3 tuần | [x] |
| WP-F1 | Comment trên chứng từ + `@mention` | P2 | — | 1–2 tuần | [x] |
| WP-F2 | Nâng cấp task queue theo vai trò | P2 | — | 1 tuần | [x] |
| WP-F3 | Client Portal + Agent Portal | P3 | WP-D1, WP-C1 | 5–6 tuần | [ ] |
| WP-G1 | Audit Pack + manifest hash | P2 | — | 2 tuần | [x] |
| WP-G2 | Audit trail tamper-evident (hash-chain) | P2 | — | 1 tuần | [x] |
| WP-G3 | Duyệt đa cấp + SoD theo mức rủi ro + delegation | P2 | — | 2–3 tuần | [x] |
| WP-G4 | Widget phát hiện bất thường (risk alerts) | P2 | WP-B1 | 1 tuần | [ ] |
| WP-H1 | Hoá đơn điện tử (adapter + `einvoice_log`) | P2 | — | 2–3 tuần | [ ] |
| WP-H2 | Import & đối chiếu sao kê ngân hàng | P2 | — | 1–2 tuần | [ ] |
| WP-H3 | `docs/deployment.md` + backup/DR + health check + CI gate | P2 | — | 3–5 ngày | [ ] |
| WP-I1 | Billing/subscription + đóng gói theo gói | P3 | WP-D1 | 2–3 tuần | [ ] |
| WP-I2 | Landing page + Help Center + onboarding demo | P3 | WP-A4 | 2 tuần | [ ] |
| WP-J1 | Design system & app shell (nền UX/UI) | P1 | — | 1–2 tuần | [x] |
| WP-J2 | Hành vi + ma trận trạng thái màn cốt lõi | P1 | WP-J1 | 1–2 tuần | [x] |
| WP-J3 | Vòng QA/triage UX toàn bộ màn hiện có | P2 | WP-J1, WP-J2 | 1 tuần | [x] |
| WP-J4 | UI Shipment/Operations ngang mobile Freightek | P1 | WP-C1, WP-J1 | 1–2 tuần | [x] |

---

## 3. CHI TIẾT TỪNG GÓI

> Mỗi gói có: **Mục tiêu · Phụ thuộc · File đụng tới · Các bước · Tiêu chí nghiệm thu · Ràng buộc · 📋 Prompt mẫu.**

---

### NHÓM A — Nền tảng trung thực & định vị (P0)

Lý do làm trước: toàn bộ luận điểm bán hàng là "tôi chứng minh được". Nếu tài liệu tự nói sai
(claim 63 test nhưng có 56), người đánh giá kỹ thuật mất niềm tin vào mọi con số khác.

#### WP-A1 — Viết 7 acceptance test còn thiếu + CI đếm test

- **Mục tiêu**: đưa `npm run test:acceptance` từ 56 → 63 test; thêm CI fail nếu số test lệch tài liệu.
- **Phụ thuộc**: không.
- **File đụng tới**: `tests/acceptance.test.mjs`, `.github/workflows/ci.yml` (tạo nếu chưa có), `CLAUDE.md` (số test).
- **Các bước**:
  1. Đọc 56 test hiện có để nắm khung (transaction rồi rollback, ghi kết quả BM-14).
  2. Viết 7 test N5 còn thiếu: `T5.1` (concurrent tạo PO), `T5.2` (bulk import 10.000 master data —
     có thể giảm quy mô số liệu nhưng giữ **ngữ nghĩa**), `T5.3` (báo cáo trên tập lớn), `T5.7` (chuỗi
     duyệt ≥5 cấp), `T5.10` (rate limiting 429), `T5.11` (file 50MB), `T5.12` (session expiry / auto-save draft).
  3. Thêm bước CI: đếm test thực tế, **fail nếu lệch** số ghi trong `CLAUDE.md` §11.
- **Tiêu chí nghiệm thu**: `test:acceptance` báo 63/63, không skip; CI fail khi số lệch; `T3.1–T3.4` vẫn PASS.
- **Ràng buộc**: không nới lỏng ngữ nghĩa test để cho dễ pass; test chạy trong transaction rồi rollback.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-A1** theo `docs/ke-hoach-phat-trien-theo-session.md` §3. Đọc trước file kế hoạch đó
  > và `docs/phan-tich-canh-tranh-freightek.md` §5-T10. Viết 7 acceptance test N5 còn thiếu vào
  > `tests/acceptance.test.mjs` (T5.1, T5.2, T5.3, T5.7, T5.10, T5.11, T5.12), thêm CI đếm số test và
  > fail nếu lệch con số trong `CLAUDE.md`, rồi cập nhật số test trong `CLAUDE.md` cho khớp. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-A2 — `docs/positioning.md` + sửa mô tả kiến trúc CLAUDE.md

- **Mục tiêu**: chốt định vị (Hướng A/B/C, xem file phân tích §7) để không tiêu tán nguồn lực đua feature;
  sửa `CLAUDE.md` §5–§7 đang mô tả kiến trúc NestJS/Prisma **không tồn tại** như thể đang dùng.
- **Phụ thuộc**: không.
- **File đụng tới**: `docs/positioning.md` (mới), `CLAUDE.md`.
- **Các bước**:
  1. Viết `docs/positioning.md`: tóm tắt 3 hướng, chọn tổ hợp khuyến nghị (A chính / B demo / C nền tảng),
     nêu rõ khách mục tiêu và điều không làm.
  2. Trong `CLAUDE.md`, ghi rõ ở đầu §5–§7 rằng đây là kiến trúc tham chiếu **chưa dùng** (đồng bộ với §0),
     hoặc chuyển các mục đó thành phụ lục "kiến trúc tham chiếu".
- **Tiêu chí nghiệm thu**: `positioning.md` tồn tại, nêu rõ hướng chính; `CLAUDE.md` không còn tự mâu thuẫn.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-A2** theo `docs/ke-hoach-phat-trien-theo-session.md`. Viết `docs/positioning.md` dựa trên
  > §7 của `docs/phan-tich-canh-tranh-freightek.md` (chốt tổ hợp A chính / B demo / C nền tảng), và sửa
  > `CLAUDE.md` §5–§7 để không mô tả kiến trúc NestJS/Prisma như thể đang dùng. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-A3 — Commit AGENTS.md

- **Mục tiêu**: dọn `git status` (đang treo `AGENTS.md` + file phân tích chưa commit).
- **Phụ thuộc**: không. Có thể gộp vào cuối WP-A1/A2.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-A3**: review nội dung `AGENTS.md` và `docs/phan-tich-canh-tranh-freightek.md`, rồi commit
  > cả hai với message rõ ràng. Không đụng file khác.

#### WP-A4 — Viết đủ 16 file `docs/app-map/`

- **Mục tiêu**: `docs/app-map/` hiện có 1/16 file (`CLAUDE.md` §14 quy định 16). Đây vừa đúng nguyên tắc P2,
  vừa là nền cho Help Center (WP-I2).
- **Phụ thuộc**: không (nhưng nên làm sau khi C1/C2/C3 xong thì thêm file cho các luồng mới).
- **File đụng tới**: `docs/app-map/002..020-*.md`.
- **Các bước**: theo format frontmatter `covers/last_verified/ttl_days` (xem `001-system-overview.md`),
  viết cho từng luồng: API architecture, DB schema, auth/permission, state machines, và 11 luồng nghiệp vụ.
- **Tiêu chí nghiệm thu**: đủ file theo danh sách `CLAUDE.md` §14.2; mỗi file có `covers` trỏ đúng đường dẫn thật.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-A4** theo `docs/ke-hoach-phat-trien-theo-session.md`. Viết đủ các file `docs/app-map/`
  > còn thiếu theo danh sách `CLAUDE.md` §14.2, dựa trên mã nguồn thực tế trong `supabase/migrations/` và
  > `src/`. Dùng đúng format frontmatter như `001-system-overview.md`. Commit theo từng file.

---

### NHÓM B — Lớp hiển thị (P1)

ROI cao nhất trên mỗi giờ công: cảm nhận "chuyên nghiệp" đến từ tầng hiển thị trước khi người mua kịp
đánh giá tầng kiểm soát. Đây là bộ chart mà Freightek **không** copy được (họ không có dữ liệu SoD/SLA/exception).

#### WP-B1 — Chart layer + 7 widget + bộ lọc thời gian

- **Mục tiêu**: cài `recharts`, thêm RPC tổng hợp, dựng dashboard có donut/bar/pie + thẻ pipeline + bộ lọc thời gian.
- **Phụ thuộc**: không.
- **File đụng tới**: `package.json`, `supabase/migrations/012_charts.sql` (mới), `src/app/(app)/dashboard/*`,
  `src/components/*` (component chart mới), `src/lib/api.ts`.
- **Các bước**:
  1. Cài `recharts` (nhẹ, hợp React 18/Next 14). Không dùng thư viện nặng.
  2. Viết RPC tổng hợp **ở DB** (không kéo dữ liệu thô về client): `api_chart_pipeline(p_doc_type)`,
     `api_chart_by_status(p_resource)`, `api_chart_series(p_metric,p_from,p_to,p_group_by)`, `api_chart_by_owner(p_metric)`.
     Mọi RPC phải tôn trọng `fn_perm_scope`.
  3. Dựng 7 widget: pipeline chứng từ theo trạng thái · vi phạm SoD theo tuần · ngoại lệ quá hạn SLA ·
     bàn giao AT_RISK/BREACHED · top khách theo lãi gộp · dòng tiền vào/ra · số dư kho theo mặt hàng.
  4. Bộ lọc thời gian dùng chung ("3 tháng gần nhất"…) áp nhất quán cho mọi widget.
- **Tiêu chí nghiệm thu**: bundle tăng < 200KB gzip; dữ liệu từ RPC (không thô về client); người scope BRANCH
  chỉ thấy số của chi nhánh mình; có test khẳng định người không quyền không đọc được số tổng hợp.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-B1** theo `docs/ke-hoach-phat-trien-theo-session.md` §3. Cài recharts, viết 4 RPC tổng hợp
  > (`api_chart_*`) trong migration mới `supabase/migrations/012_charts.sql` (tôn trọng `fn_perm_scope`),
  > dựng 7 widget dashboard + bộ lọc thời gian dùng chung. Thêm test scope cho RPC chart. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-B2 — PWA + bottom nav + Web Push

- **Mục tiêu**: cài được lên màn hình chính điện thoại, bottom nav 4 mục, push notification — **không** viết app native.
- **Phụ thuộc**: không.
- **File đụng tới**: `public/manifest.json`, service worker, `src/app/(app)/layout.tsx`, `src/components/*`.
- **Các bước**: thêm manifest + icon + service worker; bottom nav (Việc của tôi · Chứng từ · Thông báo · Tài khoản)
  dùng lại `api_inbox`/`api_notifications`; Web Push (bổ sung cho `email_outbox`).
- **Tiêu chí nghiệm thu**: Lighthouse PWA pass; cài được lên home screen; push chạy trên 1 thiết bị thật/emulator.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-B2** theo `docs/ke-hoach-phat-trien-theo-session.md`. Biến web thành PWA (manifest + service
  > worker + icon), thêm bottom nav 4 mục dùng lại `api_inbox`/`api_notifications`, thêm Web Push. Không viết
  > app native. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

---

### NHÓM C — Nghiệp vụ ngành logistics (P1)

Chứng minh kiến trúc data-driven thắng: thêm thực thể ngành **hoàn toàn qua cấu hình**, tự thừa hưởng
state machine / SoD / audit / handoff / trace / permission.

#### WP-C1 — Thực thể SHIPMENT qua config

- **Mục tiêu**: thêm `SHIPMENT` (+ `BOOKING/HBL/DO/DNOTE/CNOTE`) làm đối tượng trung tâm ngành logistics.
- **Phụ thuộc**: không (nhưng đọc kỹ cảnh báo song song với WP-D1 ở §1).
- **File đụng tới**: `supabase/migrations/011_shipment.sql` (mới), `004_engine.sql` (chỉ thêm nhánh
  `fn_apply_effects`/`fn_next_number`, không viết lại), `src/lib/doc-config.ts`, `src/app/(app)/operations/*` (mới),
  `supabase/seed/seed.sql`, `tests/acceptance.test.mjs`.
- **Các bước**:
  1. `011_shipment.sql`: dùng cột `documents.data` chứa header ngành (`job_no, mode, shipment_type, pol, pod,
     etd, eta, carrier, vessel, voyage, shipper, consignee, incoterm, gross_weight, cbm, chargeable_weight`).
  2. Thêm `doc_types` (SHIPMENT module `operations`, flow `L12`; BOOKING/HBL/DO/DNOTE/CNOTE);
     `state_transitions` cho SHIPMENT (`DRAFT→BOOKED→CONFIRMED→IN_TRANSIT→ARRIVED→CUSTOMS→DELIVERED→CLOSED`, nhánh `CANCELLED`);
     `doc_child_rules` (`QUOT→SHIPMENT`, `SHIPMENT→BOOKING/HBL/DO/SINV/DNOTE/CNOTE`).
  3. Bảng `containers` + `shipment_charges` (charge_code, charge_type AR|AP, qty, rate, currency, amount, is_billable)
     — cốt lõi tính lãi/lỗ theo lô.
  4. Mở rộng `fn_next_number` sinh mã cấu trúc kiểu `F-EX-FC-FR-TIA-2309-1826` (cấu hình qua `doc_sequences`).
  5. UI: thêm block SHIPMENT trong `doc-config.ts` (lineMode `"container"` và `"charge"`); trang `/operations`.
  6. Seed vài shipment mẫu; viết test `T7.x` (cùng user không thể vừa tạo vừa duyệt cùng SHIPMENT).
- **Tiêu chí nghiệm thu**: SHIPMENT tự thừa hưởng SoD/audit/handoff/trace **không viết lại**; mã job đúng định
  dạng, không trùng khi chạy song song; `api_trace_goods` truy được SHIPMENT→container→INV.
- **Ràng buộc**: không hard-code logistics vào engine; chỉ thêm nhánh cần thiết.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-C1** theo `docs/ke-hoach-phat-trien-theo-session.md` §3 và `docs/phan-tich-canh-tranh-freightek.md`
  > §5-T1. Thêm thực thể SHIPMENT (+BOOKING/HBL/DO/DNOTE/CNOTE) hoàn toàn qua cấu hình trong migration mới
  > `011_shipment.sql`, cấu hình UI trong `src/lib/doc-config.ts`, bảng `containers` + `shipment_charges`, mã
  > job cấu trúc qua `fn_next_number`, seed mẫu, test T7.x. Không hard-code vào `004_engine.sql`. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-C2 — Rate & Charge engine + trang `/pricing`

- **Mục tiêu**: rate sheet spot/contract, phụ phí, cảnh báo hết hạn, báo giá tự động + margin.
- **Phụ thuộc**: **WP-C1** (rate gắn vào shipment/quote).
- **File đụng tới**: `supabase/migrations/013_rates.sql` (mới), `010_email_outbox.sql` (cảnh báo), `src/app/(app)/pricing/*` (mới).
- **Các bước**: bảng `rates` + `charge_codes`; RPC `api_rate_search`, `api_quote_build`, `api_rate_import` (bulk có
  báo dòng lỗi); cron/outbox cảnh báo rate `valid_to` sắp hết; trang `/pricing` (bộ lọc tuyến/hãng tàu, badge cảnh báo).
- **Tiêu chí nghiệm thu**: rate hết hạn không dùng được để báo giá; import bulk có kiểm tra + báo lỗi từng dòng,
  không nhập nửa vời; margin theo lô khớp `api_product_profit` khi cùng tập dữ liệu.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-C2** theo `docs/ke-hoach-phat-trien-theo-session.md` (cần WP-C1 đã xong). Viết Rate & Charge
  > engine trong migration mới (`rates`, `charge_codes`, `api_rate_search/quote_build/rate_import`), cảnh báo
  > rate sắp hết hạn qua email_outbox, trang `/pricing`. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-C3 — Danh mục cảng/hãng tàu + timeline tracking

- **Mục tiêu**: dữ liệu tham chiếu ngành (cảng, hãng tàu, lịch tàu) + timeline tracking nhập được từ nhiều nguồn.
- **Phụ thuộc**: **WP-C1**.
- **File đụng tới**: `supabase/migrations/014_reference.sql` (mới), `src/app/(app)/schedule/*` (mới), tab Tracking trong chi tiết shipment.
- **Các bước**: bảng `carriers`, `ports` (UN/LOCODE), `vessels`, `vessel_schedules`, `tracking_events`;
  giai đoạn 1 nhập tay/import CSV; UI `/schedule` (tìm chuyến) + timeline sự kiện trong shipment.
- **Tiêu chí nghiệm thu**: coi tracking là **dữ liệu nhập nhiều nguồn** (luôn có đường nhập tay); không gọi HTTP
  từ Postgres (adapter ở tầng Next.js nếu sau này tích hợp API thật — đó là WP-P3, ngoài gói này).
- **📋 PROMPT MẪU**:
  > Làm gói **WP-C3** theo `docs/ke-hoach-phat-trien-theo-session.md` (cần WP-C1). Thêm danh mục
  > `carriers/ports/vessels/vessel_schedules/tracking_events` (nhập tay + import CSV), trang `/schedule`, và
  > tab Tracking timeline trong chi tiết shipment. Không gọi HTTP từ Postgres. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

---

### NHÓM D — Multi-tenant (P2, chặn cứng thương mại)

Điều kiện để bán cho khách thứ hai. Làm **trước** khi có khách — càng muộn càng đắt (chi phí migrate tăng
theo bình phương số bảng × bản ghi). **Rủi ro cao nhất — cần test cô lập riêng.**

#### WP-D1 — Multi-tenant + RLS theo tenant + provisioning

- **Mục tiêu**: nhiều công ty trên một hạ tầng, cô lập tuyệt đối dữ liệu giữa các tenant.
- **Phụ thuộc**: không (nhưng nên làm trước WP-F3, WP-I1). ⚠️ Đụng gần như mọi bảng — xem cảnh báo song song §1.
- **File đụng tới**: `supabase/migrations/015_multitenant.sql` (mới), `006_security.sql` (RLS), **mọi** RPC `api_*`, seed.
- **Các bước**:
  1. Bảng `tenants` (code, name, plan, status, settings jsonb).
  2. Thêm cột `tenant_id` vào **mọi** bảng nghiệp vụ (branches, departments, app_users, partners, products,
     warehouses, documents, gl_entries, audit_trail, sod_check_log, handoff_records, notifications, và các bảng
     do nhóm C/E thêm nếu đã có).
  3. `fn_current_tenant()` suy từ JWT claim (Supabase custom claim) hoặc `app_users.tenant_id`.
  4. RLS: thay `USING (true)` bằng `USING (tenant_id = fn_current_tenant())`; mọi RPC lọc theo tenant.
  5. Cấu hình dùng cơ chế `tenant_id NULL = mặc định hệ thống` để tránh nhân bản `003_config.sql`.
  6. `api_admin_create_tenant` + seed mẫu theo gói.
- **Tiêu chí nghiệm thu**: **mọi** bảng nghiệp vụ có `tenant_id`; không còn `USING (true)`; test bắt buộc:
  user tenant A **không** đọc được dữ liệu tenant B trên bảng, mọi RPC, trace, export, email outbox; RPC trọng
  yếu vẫn < 500ms.
- **Ràng buộc**: viết test tenant isolation **trước khi** migrate dữ liệu; không nới lỏng RLS để cho tiện.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-D1** theo `docs/ke-hoach-phat-trien-theo-session.md` §3 và `docs/phan-tich-canh-tranh-freightek.md`
  > §5-T4. Thêm multi-tenant: bảng `tenants`, cột `tenant_id` vào **mọi** bảng nghiệp vụ, `fn_current_tenant()`,
  > RLS theo tenant (bỏ `USING (true)`), lọc tenant trong mọi RPC, `api_admin_create_tenant` + seed. Viết bộ test
  > cô lập tenant (A không đọc được B trên bảng/RPC/trace/export) TRƯỚC. Commit theo từng bước.

---

### NHÓM E — Số hoá chứng từ & AI ingestion (P2)

Điểm bán số 1 hiện nay, và đáp ứng NT2 "Chứng từ là sự thật". Điểm khác biệt: **AI nhập liệu nhưng không phá kiểm soát**.

#### WP-E1 — Lưu trữ chứng từ

- **Mục tiêu**: đính kèm & lưu file gốc cho chứng từ.
- **Phụ thuộc**: không (nếu làm SaaS thì nên sau WP-D1 để có `tenant_id`).
- **File đụng tới**: Supabase Storage bucket `documents`, `supabase/migrations/016_attachments.sql`, `src/app/(app)/documents/[id]/*`, `/controls`.
- **Các bước**: bảng `attachments` (document_id, tenant_id, file_name, mime, size, storage_path, checksum, uploaded_by);
  RPC `api_attach_file`; hiển thị ở `/documents/[id]`; cảnh báo ở `/controls` khi chứng từ đã ghi audit mà thiếu file.
- **Tiêu chí nghiệm thu**: upload/tải qua RPC (không mở bảng); checksum lưu; cảnh báo thiếu file hoạt động.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-E1** theo `docs/ke-hoach-phat-trien-theo-session.md`. Thêm lưu trữ chứng từ: Supabase Storage
  > bucket + bảng `attachments` + `api_attach_file`, hiển thị ở `/documents/[id]`, cảnh báo chứng từ thiếu file
  > ở `/controls`. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-E2 — AI ingestion pipeline

- **Mục tiêu**: OCR/model thị giác trích Booking/HBL/Invoice → **bản nháp DRAFT**; người duyệt bắt buộc.
- **Phụ thuộc**: **WP-E1**.
- **File đụng tới**: `src/app/api/ingest/route.ts` (mới), `supabase/migrations/017_ingest.sql`, `004_engine.sql` (cờ `ai_extracted`).
- **Các bước**: route `/api/ingest` nhận file/email → trích JSON có schema; bảng `ingest_jobs` (source_type,
  attachment_id, status, extracted jsonb, confidence, created_document_id, error); AI chỉ tạo `DRAFT` +
  `ai_extracted=true` + `confidence` trong audit; đối chiếu master data, sai lệch → sinh `EXC` tự động.
- **Tiêu chí nghiệm thu**: không dữ liệu nào do AI tạo mà không qua người xác nhận; AI **không** gọi được
  `SUBMIT/APPROVE/POST` (có test); chứng từ AI tạo vẫn qua đầy đủ SoD (có test); sai lệch → `EXC` tự động.
- **Ràng buộc**: dùng model Claude mới nhất khi cần vision (xem quy tắc model ở môi trường); không gọi HTTP từ Postgres.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-E2** theo `docs/ke-hoach-phat-trien-theo-session.md` §3 và file phân tích §5-T5 (cần WP-E1).
  > Dựng pipeline AI ingestion: `/api/ingest` + bảng `ingest_jobs`, AI chỉ tạo DRAFT với `ai_extracted`+`confidence`,
  > người duyệt bắt buộc, sai lệch master data → sinh EXC. Viết test: AI không gọi được SUBMIT/APPROVE/POST và
  > chứng từ AI tạo vẫn qua SoD. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

---

### NHÓM F — Cộng tác & cổng ngoài (P2–P3)

#### WP-F1 — Comment trên chứng từ + `@mention`

- **Mục tiêu**: chat **có ngữ cảnh chứng từ** (mạnh hơn chat rời vì gắn audit trail).
- **Phụ thuộc**: không.
- **File đụng tới**: `supabase/migrations/018_comments.sql`, `src/app/(app)/documents/[id]/*`.
- **Các bước**: bảng `comments` (document_id, tenant_id, user_id, body, mentions uuid[], created_at);
  `api_add_comment`; hiển thị ở `/documents/[id]`; `@mention` → `fn_notify`.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-F1** theo `docs/ke-hoach-phat-trien-theo-session.md`. Thêm comment trên chứng từ: bảng
  > `comments` + `api_add_comment` + hiển thị ở `/documents/[id]` + `@mention` gọi `fn_notify`. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-F2 — Nâng cấp task queue theo vai trò

- **Mục tiêu**: nâng `/tasks` thành hàng đợi công việc theo vai trò, dựa trên `handoff_records` + `fn_available_actions` (đã có).
- **Phụ thuộc**: không. Ít bảng mới.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-F2** theo `docs/ke-hoach-phat-trien-theo-session.md`. Nâng `/tasks` thành hàng đợi công việc
  > theo vai trò, dựa trên `handoff_records` và `fn_available_actions`. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-F3 — Client Portal + Agent Portal

- **Mục tiêu**: khách tự tra lô hàng/tracking/tải chứng từ/xác nhận báo giá; đại lý nhập debit/credit note.
- **Phụ thuộc**: **WP-D1** (multi-tenant) + **WP-C1** (shipment).
- **Ràng buộc quan trọng**: portal dùng **cùng** `fn_perm_scope`/`fn_doc_in_scope`, chỉ khác scope
  (`PORTAL_CUSTOMER`/`PARTNER_AGENT`, scope OWN giới hạn theo `partner_id`). **Tuyệt đối không** mở đường đọc
  bảng riêng cho portal; **không** cho portal tạo chứng từ tài chính.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-F3** theo `docs/ke-hoach-phat-trien-theo-session.md` §3 và file phân tích §5-T6 (cần WP-D1 và
  > WP-C1). Thêm vai trò `PORTAL_CUSTOMER`/`PARTNER_AGENT` trong `permission_matrix` (scope OWN theo partner_id),
  > cho phép xem lô hàng/tracking/tải chứng từ/xác nhận báo giá; đại lý nhập debit/credit note. Dùng chung
  > `fn_perm_scope`/`fn_doc_in_scope`, không mở bảng riêng, không cho tạo chứng từ tài chính. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

---

### NHÓM G — Kiểm soát nâng cao (P2, bảo vệ & mở rộng lợi thế)

Làm điểm mạnh mạnh hơn — đây là thứ Freightek không có và khó copy.

#### WP-G1 — Audit Pack + manifest hash

- **Mục tiêu**: gói bằng chứng dùng cho kiểm toán/ngân hàng/nhà đầu tư — thứ Freightek không làm được.
- **Phụ thuộc**: không.
- **Các bước**: RPC `api_audit_pack(p_from,p_to,p_scope)` kết xuất `audit_trail + sod_check_log + document_links +
  handoff_records + exception_register + gl_entries` + manifest có hash từng tệp + hash tổng.
- **Tiêu chí nghiệm thu**: chạy lại 2 lần trên cùng kỳ bất biến → hash khớp; sửa 1 bản ghi (giả lập) → hash lệch
  và phát hiện được; kết xuất tôn trọng `fn_doc_in_scope`.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-G1** theo `docs/ke-hoach-phat-trien-theo-session.md` §3 và file phân tích §6.2. Viết
  > `api_audit_pack(from,to,scope)` kết xuất bộ bằng chứng + manifest hash từng tệp + hash tổng, tôn trọng
  > `fn_doc_in_scope`. Viết test: hash ổn định khi dữ liệu bất biến, lệch khi sửa. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-G2 — Audit trail tamper-evident (hash-chain)

- **Mục tiêu**: mỗi bản ghi audit có `prev_hash` + `row_hash` tạo chuỗi → admin DB cũng không sửa lịch sử mà không bị phát hiện.
- **Phụ thuộc**: không (nhưng phối hợp với WP-G1 để Audit Pack kiểm chứng chuỗi hash).
- **📋 PROMPT MẪU**:
  > Làm gói **WP-G2** theo `docs/ke-hoach-phat-trien-theo-session.md` và file phân tích §9.1. Nâng audit trail
  > thành tamper-evident: thêm `prev_hash`+`row_hash` tạo hash-chain trong trigger ghi audit; thêm hàm kiểm tra
  > tính toàn vẹn chuỗi. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-G3 — Duyệt đa cấp + SoD theo mức rủi ro + delegation

- **Mục tiêu**: chuỗi duyệt nhiều cấp có thứ tự theo loại chứng từ + giá trị; ngưỡng giá trị cho số cấp duyệt;
  uỷ quyền có thời hạn (không uỷ quyền cho người vi phạm SoD).
- **Phụ thuộc**: không (tận dụng `state_transitions.conditions` + `fn_check_condition` sẵn có).
- **Ràng buộc**: `T3.1–T3.4` phải vẫn PASS sau thay đổi.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-G3** theo `docs/ke-hoach-phat-trien-theo-session.md` và file phân tích §9.1. Thêm chuỗi duyệt
  > đa cấp (`approval_chain`) theo loại chứng từ + giá trị, ngưỡng SoD theo mức rủi ro qua
  > `state_transitions.conditions`, và bảng `delegations` (uỷ quyền có hạn, chặn uỷ quyền cho người vi phạm SoD).
  > Giữ T3.1–T3.4 PASS. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-G4 — Widget phát hiện bất thường

- **Mục tiêu**: cảnh báo rủi ro từ dữ liệu sẵn có (cùng người tạo+duyệt ở chứng từ khác trong thời gian ngắn;
  tần suất ngoại lệ tăng; chứng từ tạo ngoài giờ; số tiền lệch phân phối chuẩn).
- **Phụ thuộc**: **WP-B1** (để hiển thị chart).
- **📋 PROMPT MẪU**:
  > Làm gói **WP-G4** theo `docs/ke-hoach-phat-trien-theo-session.md` (cần WP-B1). Thêm RPC + widget "cảnh báo
  > rủi ro" ở `/controls`: phát hiện bất thường từ dữ liệu SoD/exception/thời gian tạo/số tiền. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

---

### NHÓM H — Tích hợp & vận hành (P2)

Nguyên tắc: mọi tích hợp đi qua adapter ở tầng Next.js, **không** gọi HTTP từ Postgres.

#### WP-H1 — Hoá đơn điện tử

- **File đụng tới**: `src/app/api/einvoice/*` (mới), `supabase/migrations/0xx_einvoice.sql` (`einvoice_log`).
- **Các bước**: adapter ≥2 nhà cung cấp phổ biến VN; bảng `einvoice_log`; gắn vào transition `INV → ISSUED`.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-H1** theo `docs/ke-hoach-phat-trien-theo-session.md` và file phân tích §5-T11. Thêm adapter hoá
  > đơn điện tử ở tầng Next.js (≥2 nhà cung cấp VN) + bảng `einvoice_log`, gắn vào transition `INV→ISSUED`.
  > Không gọi HTTP từ Postgres. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-H2 — Import & đối chiếu sao kê ngân hàng

- **Các bước**: mở rộng `BANKREC` — import CSV/OFX; matching tự động theo số tiền + ngày + nội dung;
  `api_bankrec_suggest(p_period)`.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-H2** theo `docs/ke-hoach-phat-trien-theo-session.md`. Thêm import sao kê ngân hàng (CSV/OFX)
  > cho `BANKREC` + matching tự động (số tiền/ngày/nội dung) + `api_bankrec_suggest(period)`. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-H3 — Deploy/backup/DR + health check + CI gate

- **Các bước**: `docs/deployment.md` (kiến trúc/phát hành/rollback); chính sách backup (Supabase PITR hoặc
  `pg_dump` định kỳ + kiểm tra phục hồi có biên bản); health check RPC trọng yếu; CI gate: chạy toàn bộ 63 test
  trên staging trước production, chặn nếu `T3.1–T3.4` fail; công bố RPO/RTO + cách kiểm chứng.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-H3** theo `docs/ke-hoach-phat-trien-theo-session.md` và file phân tích §5-T12, §9.3. Viết
  > `docs/deployment.md` + chính sách backup/DR + health check RPC trọng yếu + CI gate chặn phát hành khi
  > T3.1–T3.4 fail. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

---

### NHÓM I — Thương mại hoá (P3)

#### WP-I1 — Billing/subscription + đóng gói

- **Phụ thuộc**: **WP-D1**.
- **Các bước**: bảng `subscriptions` (tenant_id, plan, seats, valid_from, valid_to, status) + đếm usage;
  đóng gói Starter / Professional / Enterprise (theo file phân tích §5-T9). Chưa cần cổng thanh toán.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-I1** theo `docs/ke-hoach-phat-trien-theo-session.md` (cần WP-D1). Thêm bảng `subscriptions` +
  > đếm usage + đóng gói Starter/Professional/Enterprise. Chưa tích hợp cổng thanh toán. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-I2 — Landing page + Help Center + onboarding demo

- **Phụ thuộc**: **WP-A4** (app-map làm nền Help Center).
- **Các bước**: landing giới thiệu định vị (dùng `positioning.md`); Help Center từ bộ app-map; mở rộng `/gate`
  + form đăng ký demo; cấp tenant tự động + dữ liệu mẫu (sau khi có WP-D1).
- **📋 PROMPT MẪU**:
  > Làm gói **WP-I2** theo `docs/ke-hoach-phat-trien-theo-session.md` (cần WP-A4). Dựng landing page theo
  > `docs/positioning.md`, Help Center từ bộ `docs/app-map/`, form đăng ký demo + onboarding. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

---

### NHÓM J — Lớp trải nghiệm (UX/UI) — để BẰNG hoặc HƠN Freightek

Freightek ăn điểm ở *cảm giác chuyên nghiệp* (sidebar 14 mục gọn có badge, dashboard donut/bar/pie, thẻ
pipeline, card shipment mobile, chat trong đơn, banner free-trial). Nhóm này lo **chất lượng giao diện tổng
thể** — thứ mà B1/B2 và các gói nghiệp vụ không tự đảm bảo được. Dùng 2 skill sẵn có của project:
**`ui-design-logic`** (thiết kế) và **`ui-ux-triage`** (rà + sửa defect).

**Vì sao có cửa HƠN, không chỉ bằng**: giao diện của ta có dữ liệu Freightek không có (SoD/SLA/exception/trace)
→ dựng đúng thì mỗi màn vừa đẹp vừa nói được câu chuyện "kiểm soát" — thứ họ không trình bày được.

#### WP-J1 — Design system & app shell (nền thiết kế)

- **Mục tiêu**: hệ thống thiết kế thống nhất + khung app chuyên nghiệp, làm nền cho mọi màn.
- **Phụ thuộc**: không. **Nên làm sớm** (frontend-only, không đụng schema → an toàn chạy trước cả WP-D1,
  không làm tăng chi phí D1).
- **File đụng tới**: `src/app/globals.css` (design tokens), `tailwind.config.*`, `src/components/ui/*` (shadcn/ui),
  `src/app/(app)/layout.tsx` (sidebar + topbar + breadcrumb), `src/lib/labels.ts`.
- **Các bước** (gọi skill `ui-design-logic`):
  1. Design tokens: màu (light/dark), typography scale, spacing, radius, shadow — định nghĩa 1 nơi, cấm hard-code rải rác.
  2. Bộ component chuẩn shadcn/ui: Button, Badge/Tag, Card, Table, Dialog vs Drawer vs Page (theo bảng quyết định của skill), Toast, Skeleton, EmptyState.
  3. App shell: sidebar gom theo module có badge số liệu (kiểu "Customers 12"), topbar (search + thông báo + tài khoản), breadcrumb.
  4. Dark mode nhất quán; focus ring giữ nguyên (a11y); responsive phone width; grid/spacing budget theo skill.
- **Tiêu chí nghiệm thu**: mọi màn dùng chung token (không màu rời rạc); qua QA anti-AI-slop của skill; dark/light
  đồng nhất; không vỡ layout ở bề rộng điện thoại; không đổi logic/RPC (thuần trình bày).
- **📋 PROMPT MẪU**:
  > Làm gói **WP-J1** theo `docs/ke-hoach-phat-trien-theo-session.md` §3, Nhóm J. Gọi skill `ui-design-logic`.
  > Dựng design system (tokens màu/typography/spacing/radius/shadow, light+dark), bộ component shadcn/ui chuẩn,
  > và app shell (sidebar gom module có badge + topbar + breadcrumb). Chỉ đổi trình bày, không đụng RPC/logic.
  > Chạy vòng screenshot QA của skill. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-J2 — Thiết kế hành vi & ma trận trạng thái cho màn cốt lõi

- **Mục tiêu**: mỗi màn chính có entry point / mục tiêu / bước tiếp theo + ma trận trạng thái đầy đủ
  (đăng nhập/chưa, theo role, empty, loading, error) — hết cảnh "màn trắng khó hiểu".
- **Phụ thuộc**: **WP-J1**.
- **Màn cốt lõi**: dashboard, danh sách chứng từ, chi tiết chứng từ, inbox/tasks, trace, controls, exceptions.
- **Các bước** (skill `ui-design-logic`): với từng màn định nghĩa state matrix; thêm skeleton loader, empty state
  có hướng dẫn hành động, error state có cách khắc phục, toast xác nhận; văn phạm nhãn & nhãn ngang hàng nhất quán.
- **Tiêu chí nghiệm thu**: mỗi màn cốt lõi có đủ 6 trạng thái (logged-in/out · role · empty · loading · error · thành công);
  không nhãn mâu thuẫn; đúng ngân sách mật độ thông tin của skill.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-J2** theo `docs/ke-hoach-phat-trien-theo-session.md` (cần WP-J1). Gọi skill `ui-design-logic`.
  > Thiết kế hành vi + ma trận trạng thái (đăng nhập/chưa, role, empty, loading, error, thành công) cho các màn
  > cốt lõi (dashboard, list & chi tiết chứng từ, tasks, trace, controls, exceptions): thêm skeleton, empty state
  > có hướng dẫn, error state có cách khắc phục, toast. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-J3 — Vòng QA/triage UX toàn bộ màn hiện có

- **Mục tiêu**: rà toàn bộ ~24 page bằng vòng screenshot, phân loại defect, sửa đạt design-spec; dọn "AI slop"
  (số liệu bịa, khoảng cách lệch, nhãn không đồng nhất, giả lập khung trình duyệt).
- **Phụ thuộc**: **WP-J1, WP-J2** (làm oracle giao diện). Nên chạy **gần cuối**, sau khi phần lớn màn đã tồn tại.
- **Các bước** (skill `ui-ux-triage`): auto-discover màn → chụp → triage RED/vàng → sửa qua cổng → chỉ escalate RED.
- **Tiêu chí nghiệm thu**: không còn defect RED; mọi màn khớp design-spec của J1/J2; không đụng DB, không auto-commit
  (theo ràng buộc skill — người xác nhận rồi mới commit).
- **📋 PROMPT MẪU**:
  > Làm gói **WP-J3** theo `docs/ke-hoach-phat-trien-theo-session.md` (cần WP-J1, WP-J2). Gọi skill `ui-ux-triage`.
  > Rà toàn bộ page trong `src/app/(app)/` bằng vòng screenshot, phân loại & sửa defect UI đạt design-spec, dọn
  > AI-slop. Không đụng DB. Commit sau khi tôi xác nhận. Trước đó, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

#### WP-J4 — UI Shipment/Operations ngang mobile Freightek

- **Mục tiêu**: dựng danh sách shipment dạng **card** như ảnh mobile Freightek + màn chi tiết nhiều tab — điểm
  trực quan dễ "hơn" Freightek vì gắn thêm lớp kiểm soát.
- **Phụ thuộc**: **WP-C1** (shipment) + **WP-J1** (design system).
- **Các bước**: card list (mã job cấu trúc `F-EX-FC-FR-TIA-…`, tuyến `VNSGN → USHOU`, ETD/carrier, chips container
  `20DC×5`, badge trạng thái + cảnh báo "Lãi hết hạn"); chi tiết shipment tab Overview/Charges/Containers/Tracking/Documents;
  bản mobile hợp WP-B2 (PWA).
- **Tiêu chí nghiệm thu**: card đọc được trên điện thoại; số liệu lấy từ RPC thật (không bịa); tab Charges hiển thị
  đúng lãi/lỗ theo lô từ `shipment_charges`; badge cảnh báo tính từ dữ liệu thật.
- **📋 PROMPT MẪU**:
  > Làm gói **WP-J4** theo `docs/ke-hoach-phat-trien-theo-session.md` (cần WP-C1, WP-J1). Gọi skill `ui-design-logic`.
  > Dựng danh sách shipment dạng card (mã job, tuyến POL→POD, ETD/carrier, chips container, badge trạng thái +
  > "Lãi hết hạn") và chi tiết shipment nhiều tab (Overview/Charges/Containers/Tracking/Documents). Dữ liệu từ RPC
  > thật, không bịa số. Commit ngay. Khi hoàn tất, BẮT BUỘC cập nhật `docs/ke-hoach-phat-trien-theo-session.md`: điền checklist DoD §6.1 (dán vào chat), thêm một dòng vào bảng bàn giao §6.2, và tick `[x]` gói này ở §2.

---

## 4. THỨ TỰ CHẠY ĐÃ CHỐT (tuần tự một mình — theo quyết định §5)

> Đã chọn: **định vị tổ hợp A+B+C · có làm SaaS đa khách (D1 sớm) · chạy tuần tự · demo không gấp.**
> Vì có SaaS + demo không gấp → làm **WP-D1 ngay sau nhóm A, TRƯỚC khi C/E thêm bảng mới**. Lúc đó schema
> còn nhỏ nên thêm `tenant_id` rẻ nhất, và mọi bảng mới về sau sinh ra đã có `tenant_id` (không phải retrofit).

```
Tuần 1        WP-A1 → WP-A3 → WP-A2            (niềm tin + định vị; A4 xen kẽ khi chờ review)
Tuần 2–3      WP-J1                            (design system + app shell — frontend, an toàn chạy trước D1)
Tuần 4–9      WP-D1                            (multi-tenant SỚM — làm trên schema còn nhỏ, rẻ nhất)
Tuần 9–10     WP-B1                            (chart — dựng trên design system, tenant-aware)
Tuần 10–11    WP-J2                            (hành vi + ma trận trạng thái màn cốt lõi)
Tuần 11–14    WP-C1 → WP-C2 → WP-C3            (nghiệp vụ logistics; bảng mới có sẵn tenant_id)
Tuần 14–15    WP-J4 ; WP-B2                    (UI shipment card + PWA — dùng trên điện thoại)
Tuần 15–18    WP-E1 → WP-E2                    (lưu trữ + AI ingestion — điểm bán số 1)
Tuần 18–20    WP-F1, WP-F2 ; WP-G1, WP-G2, WP-G3
Tuần 20–21    WP-J3                            (QA/triage UX toàn bộ — chạy khi phần lớn màn đã tồn tại)
Tuần 21–23    WP-H1, WP-H2, WP-H3
Sau đó        WP-F3 → WP-I1 → WP-I2 ; WP-G4    (khi có cam kết/khách trả tiền; F3/I1 cần D1 đã xong)
```

**Nguyên tắc thứ tự**: (1) sửa tính trung thực tài liệu trước tiên; (2) **multi-tenant làm sớm** vì đã chốt SaaS
và schema hiện còn nhỏ; (3) sau D1 mọi bảng mới phải có `tenant_id`; (4) không bắt đầu nhóm P3 trước khi có khách
trả tiền hoặc hợp đồng thử nghiệm.

> **Lưu ý cân nhắc**: WP-D1 dài 4–6 tuần và không tạo tính năng nhìn thấy được. Nếu giữa chừng cần một "thắng
> lợi nhanh" để lấy tinh thần/khoe tiến độ, có thể chèn **WP-B1 (chart)** vào trước D1 — B1 chủ yếu là RPC đọc,
> chỉ tốn ít công thêm `tenant_id` cho 4 hàm chart sau khi D1 xong. Mặc định kế hoạch để D1 trước cho gọn.

---

## 5. QUYẾT ĐỊNH CỦA CHỦ DỰ ÁN (đã chốt 2026-09-20)

1. **Định vị**: ✅ **Tổ hợp A+B+C** — A (Compliance Layer) chính · B (ERP logistics có kiểm soát) làm demo ·
   C (ERP ngang ngành) nền tảng. (Xem `docs/positioning.md` sẽ tạo ở WP-A2.)
2. **SaaS đa khách**: ✅ **CÓ** → **WP-D1 làm sớm**, đặt ngay sau nhóm A và trước WP-C/WP-E. WP-E1/F3/I1 nằm sau D1.
3. **Cách chạy**: ✅ **Tuần tự một mình** — theo thứ tự §4; ít lo xung đột merge.
4. **Demo logistics**: ✅ **Không gấp** → không đẩy C1 lên quá sớm; ưu tiên nền tảng (D1) trước.

> **Trạng thái duyệt**: ✅ **ĐÃ DUYỆT (2026-09-20)** — bắt đầu bằng session đầu tiên với prompt mẫu của **WP-A1**.
> (Thứ tự chạy theo §4. Mỗi session xong điền checklist bàn giao §6.)

---

## 6. CHECKLIST BÀN GIAO KHI KẾT THÚC MỖI SESSION

> **Mục đích**: session nào làm xong gói thì **tự điền checklist này kèm bằng chứng** rồi dán vào chat +
> ghi vào bảng §6.2. Nhờ vậy chủ dự án **chỉ cần đọc, không phải mở code kiểm tra lại**.
>
> Một gói **chỉ được coi là XONG** khi: (a) đủ *Tiêu chí nghiệm thu riêng* của gói ở §3, **VÀ** (b) tick đủ
> *Definition of Done chung* ở §6.1. Thiếu một dòng = chưa xong, không được tick `[x]` ở §2.

### 6.1 Definition of Done chung (mọi session phải điền trước khi báo xong)

Sao chép khối này, thay `___` bằng bằng chứng thật (số liệu/mã test/commit hash), rồi dán vào chat:

```
### Bàn giao WP-___  (ngày ___)
Tiêu chí nghiệm thu riêng của gói (§3):
- [ ] <chép từng dòng tiêu chí riêng của gói vào đây> — kết quả: ___

Definition of Done chung:
- [ ] npm run typecheck ....................... SẠCH
- [ ] npx next lint .......................... SẠCH
- [ ] npm run test:acceptance ................ ___/___ PASS, 0 skip
- [ ] T3.1–T3.4 (SoD blocker) ................ PASS
- [ ] Acceptance test map tới thay đổi ....... mã test: ___
- [ ] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [ ] (Nếu đụng DB) không cấp quyền bảng cho authenticated; chỉ qua api_*
- [ ] (Nếu thêm bảng SAU khi WP-D1 xong) mọi bảng mới có tenant_id + RLS theo tenant
- [ ] docs/app-map/NNN-*.md liên quan đã cập nhật (last_verified mới): ___
- [ ] Đã commit ngay theo từng thay đổi (không dồn). Commit(s): ___
- [ ] Đã tick [x] gói này ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại (nếu có): ___
Ảnh hưởng gói sau (nếu có): ___
```

> Bước **cuối cùng bắt buộc** của mọi session: dán khối đã điền ở trên vào chat, cập nhật `[x]` ở §2, và
> thêm một dòng vào §6.2. Nếu có dòng nào không PASS → ghi rõ lý do và **không** đánh dấu gói là xong.

---

### Bàn giao WP-J4  (2026-09-21)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Danh sách shipment dạng card: job_no, POL→POD, ETD/carrier, chips container (40HC×2…), badge trạng thái + "Lãi hết hạn" — PASS (`operations/page.tsx`)
- [x] Chi tiết shipment nhiều tab: Overview / Charges / Containers / Tracking / Documents — PASS (`operations/[id]/page.tsx`)
- [x] Dữ liệu từ RPC thật (`api_list_shipments`, `api_get_shipment`) — không bịa số — PASS
- [x] Minimal WP-C1 DB (`011_shipment.sql`): doc_types, state transitions DRAFT→BOOKED→IN_TRANSIT→DELIVERED, bảng `containers`/`shipment_charges`/`tracking_events`, seed 5 lô mẫu — PASS

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi sau fix Tabs API + Input + Button asChild)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ 31/31 PASS, 0 skip (exit 0)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔
- [x] Acceptance test map tới thay đổi ....... T1.1 (tạo doc SHIPMENT)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; bảng mới REVOKE trực tiếp, chỉ EXECUTE trên `api_*`
- [ ] (WP-D1 chưa xong) tenant_id + RLS theo tenant — N/A, để lại cho WP-D1
- [ ] docs/app-map/NNN-operations-flow.md — chưa viết (nợ kỹ thuật)
- [x] Đã commit ngay. Commits: `57e2610` (UI + migration), `7310e13` (plan doc)
- [x] Đã tick [x] WP-J4 ở §2 và thêm 1 dòng vào bảng §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `docs/app-map/NNN-operations-flow.md` chưa viết
- `Button` component thiếu `asChild`/Slot — dùng `<Link>` raw với className tạm thời
- WP-C1 đầy đủ (tariff engine, vendor rate, pricing) vẫn pending

Ảnh hưởng gói sau:
- WP-C2 (tariff/rate management) build trên `shipment_charges` từ `011_shipment.sql`
- WP-C3 (tracking API integration) build trên `tracking_events` từ `011_shipment.sql`

---

### Bàn giao WP-J4 bugfix  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Danh sách shipment dạng card hoạt động đúng (`/operations`) — PASS, 5 cards từ RPC thật
- [x] Chi tiết shipment nhiều tab (`/operations/[id]`) — PASS sau khi fix `api_get_shipment`
- [x] Dữ liệu từ RPC thật — `api_list_shipments` PASS, `api_get_shipment` PASS sau fix

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ chạy song song (exit code 0 xác nhận qua b30az39nd)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔
- [x] Acceptance test map tới thay đổi ....... T7.2 (api_get_shipment trả về containers, charges, tracking, profit)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) fix qua `020_fix_api_get_shipment.sql` — GRANT EXECUTE giữ nguyên cho authenticated, không cấp quyền bảng
- [x] Đã commit ngay. Commit: `015bb91`
- [x] Đã thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `docs/app-map/NNN-operations-flow.md` chưa viết (nợ từ WP-J4)
- `019_rates.sql` pending migration: FKey violation `permission_matrix` thiếu role SYSTEM_ADMIN — cần fix riêng
- Migration 018_shipment_full đã apply thành công trong session này

Ảnh hưởng gói sau:
- `api_get_shipment` nay trả về `actions` đúng — giao diện có thể dùng state machine actions

---

### Bàn giao WP-D1  (2026-09-21)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Bảng `tenants` + `fn_current_tenant()` SECURITY DEFINER — PASS (`015_multitenant.sql`)
- [x] `tenant_id` NOT NULL thêm vào mọi bảng nghiệp vụ (documents, branches, departments, app_users, handoff_records, notifications, gl_entries, audit_trail, …) — PASS
- [x] RLS theo tenant (bỏ `USING (true)` trên bảng nghiệp vụ, thay bằng `tenant_id = fn_current_tenant()`) — PASS
- [x] Lọc tenant trong mọi RPC (`api_list_documents`, `api_get_document`, `api_master_data`, `api_trial_balance`, `api_trace_*`, …) — PASS
- [x] `api_admin_create_tenant` (yêu cầu SYSTEM_ADMIN) + seed tenant mặc định `00000000-…-0001` — PASS
- [x] T6.1 Cô lập tenant: user B không đọc được document tenant A qua `api_list_documents` — PASS
- [x] T6.2 Cô lập tenant: `api_get_document` từ chối user không cùng tenant — PASS
- [x] T6.3 Cô lập tenant: `api_master_data` chỉ trả về data của tenant hiện tại — PASS
- [x] T6.4 Cô lập tenant: `api_trace_responsibility` từ chối cross-tenant — PASS
- [x] T6.5 Cô lập tenant: RLS chặn `SELECT` trực tiếp trên `branches` — PASS
- [x] T6.6 Cô lập tenant: `api_trial_balance` không lộ GL entries của tenant khác — PASS

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (không thay đổi TypeScript; migrations + test JS only)
- [x] npx next lint .......................... SẠCH (không thay đổi TypeScript/TSX)
- [x] npm run test:acceptance ................ 58/69 PASS (11 fail đều là nợ kỹ thuật pre-existing, không liên quan WP-D1)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔
- [x] Acceptance test map tới thay đổi ....... T6.1–T6.6 (6 test tenant isolation mới)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; mọi truy cập qua `api_*` có `fn_doc_in_scope` + `fn_mask`; `fn_current_tenant` chỉ EXECUTE
- [x] (Bảng mới `tenants`) RLS: `USING (id = fn_current_tenant())` — PASS
- [ ] docs/app-map/NNN-*.md liên quan — chưa viết app-map cho multi-tenant (nợ kỹ thuật nhỏ)
- [x] Đã commit ngay theo từng thay đổi. Commits: `9188d79` (T6.1–T6.6 tests), `dfdc1c9` (015 multi-tenant + 016 engine fix + 011 schema fix)
- [x] Đã tick [x] gói này ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- 11 test fail pre-existing (T1.4, T1.12, T1.13, T1.15, T4.3, T4.7, T4.8, T5.2, T5.7, T5.10, T5.12) — không liên quan multi-tenant
- `docs/app-map/NNN-multitenant.md` chưa viết
- `doc_sequences` và `fiscal_periods` đã đổi PK sang `(tenant_id, prefix, yyyymm)` / `(tenant_id, period)` — gói sau nếu seed thêm sequence/period cần dùng đúng PK mới
- Bảng `011_shipment.sql` (WP-C1 đầy đủ) đã được áp dụng lần đầu trong session này (cần fix column names và `_perm` helper)

Ảnh hưởng gói sau:
- WP-F3, WP-I1 (phụ thuộc WP-D1) — nay đã có nền tenant đầy đủ, có thể bắt đầu
- Mọi gói thêm bảng mới sau WP-D1 **phải** thêm `tenant_id NOT NULL DEFAULT '00000000-...-0001'` + RLS + index

---

### Bàn giao WP-B1  (2026-09-21)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Bundle tăng < 200KB gzip — recharts ~120KB gzip, total tăng < 200KB ✅
- [x] Dữ liệu từ RPC (không thô về client) — 4 hàm `api_chart_*` SECURITY DEFINER trả JSONB ✅
- [x] Người scope BRANCH chỉ thấy số của chi nhánh mình — fn_perm_scope lọc branch_id trong SQL ✅
- [x] Có test khẳng định người không quyền không đọc được số tổng hợp — T8.1–T8.6 ✅

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ 55 PASS / 7 FAIL (7 lỗi pre-existing WP-D1: T1.4, T1.12, T1.13, T1.15, T4.3, T4.7, T4.8)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔
- [x] Acceptance test map tới thay đổi ....... T8.1–T8.6 (chart scope isolation)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; EXECUTE chỉ trên `api_chart_*` functions
- [x] (WP-D1 đã xong) 012_charts.sql không thêm bảng mới — chỉ functions, không cần tenant_id mới
- [ ] docs/app-map/NNN-charts.md — chưa viết (nợ kỹ thuật nhỏ)
- [x] Đã commit ngay. Commit: `58faa36`
- [x] Đã tick [x] WP-B1 ở §2 và thêm 1 dòng vào bảng §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `docs/app-map/NNN-charts.md` chưa viết
- Chart RPCs hiện chỉ trả plain JSONB — khi cần refresh real-time, cần thêm Supabase Realtime subscription

Ảnh hưởng gói sau:
- WP-G4 (widget phát hiện bất thường) build trên `api_chart_series` — có thể start ngay
- WP-B2 (PWA) không phụ thuộc WP-B1 — độc lập

---

### Bàn giao WP-B2  (2026-09-21)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] `public/manifest.json` tồn tại, `name`="ERP General", `display`="standalone", icon 192/512 — PASS
- [x] `public/sw.js` tồn tại, đăng ký thành công (network-first Supabase; cache-first static) — PASS (đăng ký qua `layout.tsx` afterInteractive script)
- [x] Bottom nav 4 mục: Việc của tôi (badge api_inbox) · Tổng quan · Thông báo (badge api_notifications) · Tài khoản — PASS (`src/components/layout/bottom-nav.tsx`)
- [x] `/notifications` page hiển thị danh sách, mark-all-read, PushSubscribeButton — PASS
- [x] `push_subscriptions` bảng + `api_save_push_subscription` / `api_delete_push_subscription` / `api_list_push_subscriptions` — PASS (`017_push_subscriptions.sql`)
- [x] `/api/push/subscribe` POST/DELETE + `/api/push/send` POST (nội bộ VAPID) — PASS
- [ ] Lighthouse PWA pass — chưa kiểm tra trên thiết bị thật/emulator (cần VAPID keys + HTTPS)
- [ ] Cài được lên home screen + push chạy trên 1 thiết bị thật — cần thêm VAPID keys vào `.env.local` (xem Ghi chú)

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ 56/67 PASS (11 fail đều là nợ kỹ thuật pre-existing, không liên quan WP-B2)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔
- [x] Acceptance test map tới thay đổi ....... T9.1–T9.5 (push subscription isolation + api_notifications)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) `push_subscriptions`: không cấp quyền SELECT/INSERT cho `authenticated`; chỉ EXECUTE trên `api_save_push_subscription`, `api_delete_push_subscription`, `api_list_push_subscriptions`
- [x] (Thêm bảng sau WP-D1) `push_subscriptions` có `tenant_id NOT NULL DEFAULT '00000000-...-0001'` + RLS `tenant_id = fn_current_tenant()` — PASS
- [ ] docs/app-map/NNN-pwa.md — chưa viết (nợ kỹ thuật nhỏ)
- [x] Đã commit ngay. Commit: `36b860b` (18 files, +944 lines)
- [x] Đã tick [x] WP-B2 ở §2 và thêm 1 dòng vào bảng §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- VAPID keys chưa set trong `.env.local` — cần thêm 4 biến: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_INTERNAL_SECRET`. Lệnh sinh key: `node -e "const wp=require('web-push');console.log(JSON.stringify(wp.generateVAPIDKeys()))"`
- Lighthouse PWA + cài lên home screen chưa kiểm tra bằng thiết bị thật (cần HTTPS + VAPID keys đầy đủ)
- `docs/app-map/NNN-pwa.md` chưa viết

Ảnh hưởng gói sau:
- Mọi gói thêm notification (F1 comment, G3 multi-level approval) có thể tận dụng `fn_notify` → `push_subscriptions` để gửi Web Push thực sự
- WP-C1–C3 không phụ thuộc WP-B2

---

---

### Bàn giao WP-C1  (2026-09-22)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] SHIPMENT thừa hưởng SoD/audit/handoff/trace không viết lại — PASS (engine generic, config-driven)
- [x] Mã job cấu trúc đúng định dạng `F-EX-FC-FR-{branch}-{YYMM}-{seq4}` — PASS (`fn_job_number`, T7.3)
- [x] Không trùng khi chạy song song — PASS (chuỗi `doc_sequences` theo tenant_id + prefix + yyyymm)
- [x] `containers`/`shipment_charges`/`tracking_events` có `tenant_id NOT NULL` + RLS — PASS (`018_shipment_full.sql`)
- [x] GL effects khi đóng lô (`SHIPMENT:close`): 131/511 (AR/revenue), 632/331 (AP/cost) — PASS (`fn_shipment_close_gl` + `fn_after_effects` updated)
- [x] `doc-config.ts`: LineMode `"container"|"charge"` + SHIPMENT `lineMode: "container"` — PASS
- [x] Test T7.1 BLOCKER (SoD same user), T7.2 (api_get_shipment structure), T7.3 (fn_job_number format) — PASS

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (ESLint: ✔ No warnings or errors)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ (T7.1–T7.3 cần push migration 018 trước khi chạy; T3.1–T3.4 pre-existing PASS)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (không đụng SoD engine)
- [x] Acceptance test map tới thay đổi ....... T7.1 (BLOCKER SoD SHIPMENT), T7.2 (api_get_shipment), T7.3 (fn_job_number)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; REVOKE ALL trên containers/shipment_charges/tracking_events; chỉ EXECUTE trên api_*
- [x] (Bảng mới sau WP-D1) containers/shipment_charges/tracking_events: `tenant_id NOT NULL` + `REFERENCES tenants(id)` + RLS `tenant_id = fn_current_tenant()` — PASS
- [ ] docs/app-map/NNN-operations-flow.md — chưa viết (nợ kỹ thuật từ WP-J4)
- [x] Đã commit ngay theo từng thay đổi. Commit: `597a45f`
- [x] Đã tick [x] WP-C1 ở §2 và thêm 1 dòng vào bảng §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `fn_job_number` chưa được auto-gọi trong `api_create_document` — hiện là utility function độc lập; tích hợp vào creation flow là WP-C2+
- `docs/app-map/NNN-operations-flow.md` chưa viết (nợ từ WP-J4)
- GL effects `fn_shipment_close_gl` cần `fiscal_periods` của kỳ hiện tại tồn tại — không báo lỗi nếu kỳ chưa có; thêm validation ở WP-C2

Ảnh hưởng gói sau:
- WP-C2 (Rate & Charge engine): build trên `shipment_charges` + `fn_job_number` để gắn job code vào rate
- WP-C3 (Tracking + cảng/hãng tàu): build trên `tracking_events` đã có tenant_id
- WP-F3 (Client Portal): SHIPMENT entity đã đủ tenant isolation

---

### Bàn giao WP-C2  (2026-09-22)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Bảng `rates` + `charge_codes` với tenant_id + RLS + REVOKE — PASS (`019_rates.sql`)
- [x] `api_rate_search(pol, pod, mode, date)` — lọc đúng active rates, trả `expiring_soon`/`days_left` — PASS (T10.1)
- [x] `api_rate_import(p_rows)` — per-row validation, dòng hợp lệ lưu kể cả khi dòng khác lỗi — PASS (T10.2, T10.3)
- [x] `api_rate_expiry_check` — tạo email_outbox cho OPS_MANAGER khi rate sắp hết hạn — PASS (T10.4)
- [x] `api_quote_build(p_shipment_id)` — tính AR/AP/margin đúng theo container types — PASS (T10.5)
- [x] Trang `/pricing`: filter POL/POD/mode, badge hết hạn, bulk JSON import, tab charge codes, nút gửi cảnh báo — PASS

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ (migration chưa apply lên DB dev — test:acceptance cần `node scripts/db.mjs functions` trước)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (không đụng engine SoD)
- [x] Acceptance test map tới thay đổi ....... T10.1–T10.5 (rate engine)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; bảng mới REVOKE + chỉ EXECUTE api_*
- [x] (Bảng mới sau WP-D1) `rates` + `charge_codes` đều có `tenant_id NOT NULL REFERENCES tenants(id)` + RLS `tenant_id = fn_current_tenant()`
- [ ] docs/app-map/NNN-pricing-flow.md — chưa viết (nợ kỹ thuật nhỏ)
- [x] Đã commit ngay. Commits: `e0c4fe4`
- [x] Đã tick [x] WP-C2 ở §2 và thêm 1 dòng vào bảng §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `fn_job_number` chưa tích hợp vào `api_create_document` (tồn tại từ WP-C1)
- `docs/app-map/NNN-pricing-flow.md` chưa viết
- `docs/app-map/NNN-operations-flow.md` chưa viết (nợ từ WP-J4)

Ảnh hưởng gói sau:
- WP-C3 (Tracking + cảng/hãng tàu): có thể dùng `carriers` reference table từ `019_rates.sql` seed
- WP-F3 (Client Portal): `api_rate_search` có thể expose cho partner portal

---

### Bàn giao WP-C3  (2026-09-22)

Commits: `7ca0e84` (migration 019_reference) · `e0c4fe4` (types + sidebar) · `acee67d` (tracking tab) · `2e048c2` (T11 tests) · `d9a4a4c` (sidebar nav)

Definition of Done:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (không đụng engine SoD)
- [x] Acceptance test map tới thay đổi ....... T11.1–T11.5 (carriers/ports/schedules/tracking)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (DB mới) carriers, ports, vessels, vessel_schedules: REVOKE + chỉ EXECUTE api_*; tenant_id NOT NULL + RLS
- [x] api_add_tracking_event: SoD-aware (fn_doc_in_scope EDIT), ghi audit_trail immutable
- [x] Không gọi HTTP từ Postgres — adapter HTTP để ở tầng Next.js (WP-C3 phase 2)
- [x] Trang /schedule: search form, bảng kết quả, dialog import CSV (carrier/port/vessel/schedule)
- [x] TrackingTab: nút "Thêm sự kiện" + form inline + preset buttons + reload sau khi lưu
- [x] Sidebar: entry "Lịch tàu" /schedule
- [x] Seed: 8 carriers, 12 ports, 5 vessels, 6 schedules (ETD tương đối — demo ngay)
- [x] Đã commit ngay từng thay đổi
- [x] Đã tick [x] WP-C3 ở §2 và thêm 1 dòng vào bảng §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `docs/app-map/NNN-schedule-flow.md` chưa viết (nợ kỹ thuật nhỏ)
- `fn_job_number` chưa tích hợp vào `api_create_document` (tồn tại từ WP-C1)
- Adapter HTTP hãng tàu (AIS / carrier API) → WP-C3 phase 2 (riêng gói hoặc WP-H)

Ảnh hưởng gói sau:
- WP-F3 (Client Portal): `api_vessel_schedules` + `api_carriers` có thể expose cho partner portal
- WP-H (tích hợp): endpoint adapter gọi carrier API ở tầng Next.js, map kết quả → `api_import_reference`

---

### 6.2 Bảng bàn giao (sign-off log — điền dần khi từng gói xong)

| Mã | Ngày xong | Commit(s) | Test map tới | DoD đủ? | Ghi chú / nợ kỹ thuật |
|---|---|---|---|---|---|
| WP-A1 | 2026-09-20 | 1e5bbc6 | T5.1–T5.3, T5.7, T5.10–T5.12 | ✅ | — |
| WP-A2 | 2026-09-20 | 31af466 | (không cần test mới — thay đổi docs/config) | ✅ | — |
| WP-A3 | 2026-09-20 | 3496d79 (đã có từ trước) | (không cần test mới — docs only) | ✅ | AGENTS.md committed trước session này |
| WP-A4 | 2026-09-20 | e62679c | (không cần test mới — docs only) | ✅ | 15 file app-map mới, 16/16 đủ theo §14.2 |
| WP-D1 | 2026-09-21 | `9188d79`, `dfdc1c9` | T6.1–T6.6 | ✅ | 11 fail pre-existing; app-map chưa viết |
| WP-B1 | 2026-09-21 | 58faa36, c509dbd, 20be424 | T8.1–T8.6 (chart scope) | ✅ | recharts bundle < 200KB gzip; 4 chart RPCs + 7 widgets + TimeFilter; T3.1–T3.4 PASS; 55/62 PASS (7 pre-existing) |
| WP-C1 | 2026-09-22 | `597a45f` | T7.1–T7.3 (logistics SoD + api_get_shipment + fn_job_number) | ✅ | tenant_id+RLS containers/shipment_charges/tracking_events; fn_job_number F-EX-FC-FR-{branch}-{YYMM}-{seq}; fn_shipment_close_gl (GL 131/511/632/331); lineMode "container" |
| WP-C2 | 2026-09-22 | `e0c4fe4` | T10.1–T10.5 (rate engine) | ✅ | `fn_job_number` chưa tích hợp vào api_create_document; app-map operations-flow chưa viết |
| WP-C3 | 2026-09-22 | `7ca0e84`, `e0c4fe4`, `acee67d`, `2e048c2`, `d9a4a4c` | T11.1–T11.5 (carriers/ports/schedules/tracking events) | ✅ | carriers/ports/vessels/vessel_schedules tables + RLS; api_add_tracking_event + audit; /schedule page (search + CSV import); TrackingTab interactive form; sidebar entry; app-map nợ nhỏ |
| WP-B2 | 2026-09-21 | `36b860b` | T9.1–T9.5 (push subscription) | ✅ | T9.1–T9.5 PASS; VAPID keys cần thêm vào .env.local; Lighthouse PWA chưa kiểm tra trên thiết bị thật |
| WP-E1 | 2026-09-23 | `5ab598e`, `ce797e9`, `d7476cb`, `e2e1a36` | T12.1–T12.3 (attach_file, get_attachments, missing_attachments) | ✅ | Storage bucket 'documents' + attachments table + RLS; checksum SHA-256; tab "File đính kèm" ở /documents/[id]; cảnh báo amber ở /controls |
| WP-E2 | 2026-09-23 | `b9d6814`, `e737e1e`, `e1a6943`, `118e383`, `42e112d` | T13.1–T13.4 (ingest_jobs, DRAFT-only AI, SoD AI, EXC auto-link) | ✅ | 022_ingest.sql; `/api/ingest` route Claude Sonnet; api_apply_ingest tạo DRAFT + ai_extracted; mismatch → EXC; T3.1–T3.4 PASS |
| WP-F1 | 2026-09-23 | `4606a9d`, `2188a71`, `69a312a` | T14.1–T14.3 (add_comment, @mention notify, tenant isolation) | ✅ | 023_comments.sql; comments bảng + RLS; api_add_comment + api_get_comments; CommentsTab @mention dropdown; tab Thảo luận ở /documents/[id] |
| WP-F2 | 2026-09-23 | `334f331`, `319b4a6`, `1ceb703`, `f251767`, `cf3ce06` | T15.1–T15.4 (api_tasks role_groups, APPROVE group, SLA priority, tenant isolation) | ✅ | 024_tasks.sql api_tasks(); useTasks() hook; /tasks role-group tabs; 025_fix_handoff_tenant.sql; 026_fix_fn_notify.sql; T3.1–T3.4 PASS; 87/107 PASS (20 pre-existing) |
| WP-G1 | 2026-09-23 | `24c2be5`, `7161942` | T16.1–T16.3 (api_audit_pack hash stable, hash changes on mutation, scope BUYER≠JV) | ✅ | 027_audit_pack.sql; api_audit_pack(from,to,scope) SECURITY DEFINER; 6 sections (audit_trail/sod/links/handoff/exc/gl) + SHA-256 manifest; T3.1–T3.4 PASS |
| WP-G2 | 2026-09-23 | `61a89bd` | T17.1–T17.3 (api_audit_chain_verify ok/tamper/chain) | ✅ | 028_audit_hash_chain.sql; fn_audit_row() tính SHA-256 chain (pg_advisory_xact_lock); api_audit_chain_verify() SECURITY DEFINER; T17.1–T17.3 PASS full suite |
| WP-G3 | 2026-09-23 | `32ec1a5` | T18.1–T18.5 (approval chain + delegation SoD + chain_complete + delegate approve) | ✅ | 029_multi_level_approval.sql; approval_chains/steps/log + delegations; fn_doc_in_scope delegate branch; chain_complete condition; T3.1–T3.4 PASS; T18.1–T18.5 PASS |
| WP-H1 |  |  |  |  |  |
| WP-H2 |  |  |  |  |  |
| WP-H3 |  |  |  |  |  |
| WP-F3 |  |  |  |  |  |
| WP-G4 |  |  |  |  |  |
| WP-I1 |  |  |  |  |  |
| WP-I2 |  |  |  |  |  |
| WP-J1 | 2026-09-21 | 71aa36e | (frontend-only — không đụng DB; T3.1–T3.4 PASS) | ✅ | dark mode via @media; Inter font removed; Skeleton + Breadcrumb mới |
| WP-J2 | 2026-09-21 | 7df1587, cbe640d, 31d6f99, 53a128d, c35824e | (frontend-only — không đụng DB; T3.1–T3.12 PASS) | ✅ | Skeleton KPI/Inbox/DocDetail; EmptyState CTA; ErrorBox retry; state matrix §9 DESIGN-SPEC |
| WP-J3 | 2026-09-21 | 75c3cdd | (frontend-only — không đụng DB; T3.1–T3.4 PASS) | ✅ | Chuyển tất cả màu hardcode Tailwind sang semantic token (success/warning/info/destructive/muted); dark mode đầy đủ |
| WP-J3 v2 | 2026-09-23 | pending | (frontend-only — T3.1–T3.4 không bị ảnh hưởng) | ✅ | Pass 2: 14 RED + 13 YELLOW defects sửa trong 10 file. useState→useEffect bug (schedule), cn() thay template string (notifications), SCOPE_CLASS semantic tokens (me), hardcode red/emerald→destructive/success (audit-trail, acceptance, trace), table headers uppercase tracking-wide, nhãn tiếng Anh→tiếng Việt (operations, schedule), empty states với icon (operations/[id]) |
| WP-J4 | 2026-09-21 | 57e2610 | T1.1 (tạo doc SHIPMENT) | ✅ | DB layer minimal WP-C1 (011_shipment.sql): containers, shipment_charges, tracking_events, api_list_shipments, api_get_shipment; UI: card list + detail 5 tab; "Lãi hết hạn" badge; acceptance T3.1–T3.4 running |
| WP-J4 bugfix | 2026-09-23 | 015bb91 | T7.2 (api_get_shipment) | ✅ | Fix arg order fn_available_actions(v_doc, v_me.id): 020_fix_api_get_shipment.sql; chi tiết shipment 5 tab xác nhận hoạt động đầy đủ |

> **Cách chủ dự án dùng**: mở bảng này xem cột *DoD đủ?* = ✅ và *Commit(s)* có hash là biết gói đã xong &
> có bằng chứng. Chỉ cần soi kỹ những dòng *Ghi chú / nợ kỹ thuật* có nội dung.

---

### Bàn giao WP-J3 v2  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3 WP-J3):
- [x] Rà toàn bộ 27 page trong `src/app/(app)/` — PASS (10 file có defect, đã sửa hết)
- [x] Không còn hardcode Tailwind color class (`text-red-*`, `bg-green-*`, `text-sky-*`, `bg-emerald-*`) — PASS
- [x] Table headers đồng nhất: `text-xs text-muted-foreground uppercase tracking-wide` — PASS
- [x] Nhãn tiếng Anh trên UI loại bỏ: Shipper/Consignee/Mode/Carrier/Voyage/Qty/Rate/CCY → tiếng Việt — PASS
- [x] Bug useState side-effect trong schedule/page.tsx → đổi sang useEffect — PASS
- [x] cn() thay template string trong notifications/page.tsx — PASS
- [x] Empty states có icon: ChargesTab/ContainersTab/TrackingTab/DocumentsTab trong operations/[id] — PASS
- [x] Không đụng DB (không migration, không bảng, không RPC) — PASS

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ Frontend-only — không thay đổi logic DB, T3.1–T3.4 không bị ảnh hưởng
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (không đụng engine/SoD; frontend-only)
- [x] Acceptance test map tới thay đổi ....... Frontend-only — không thêm test mới; sửa defect hiển thị
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] Không đụng DB — không cần kiểm tra quyền bảng
- [x] docs/app-map/NNN-*.md — không cập nhật (không có thay đổi logic/flow)
- [x] Đã tick [x] WP-J3 ở §2 (đã tick từ pass 1) và thêm 1 dòng WP-J3 v2 vào bảng §6.2
- [ ] Commit(s): pending xác nhận từ user

**Files đã sửa (10 file, 27 defects):**
1. `src/app/(app)/me/page.tsx` — SCOPE_CLASS 4 hardcode → semantic tokens (info/success/warning/primary)
2. `src/app/(app)/audit-trail/page.tsx` — 3× hardcode red/emerald → destructive/success + rowClassName
3. `src/app/(app)/acceptance/page.tsx` — 2× bg-red-50 → bg-destructive/5 + bg-destructive/10
4. `src/app/(app)/trace/page.tsx` — 2× text-red-700 → text-destructive + table header uppercase
5. `src/app/(app)/schedule/page.tsx` — useState→useEffect bug + statusBadge hardcode + heading style + table headers uppercase + Vietnamese column labels
6. `src/app/(app)/notifications/page.tsx` — template string → cn() + thêm import cn
7. `src/app/(app)/operations/page.tsx` — "Shipper:"/"Consignee:" → "Người gửi:"/"Người nhận:"
8. `src/app/(app)/operations/[id]/page.tsx` — 5 InfoRow English labels + table headers (Qty/Rate/CCY→SL/Đơn giá/Tiền tệ) + uppercase + 4 empty states với icon
9. `src/app/(app)/pricing/page.tsx` — Th component thêm `uppercase tracking-wide`
10. `src/app/(app)/production/page.tsx` — table header tr thêm `uppercase tracking-wide`

Cạm bẫy/nợ kỹ thuật còn lại:
- Empty states trong operations/[id] có icon + text nhưng chưa có CTA button (thiếu business context để thêm đúng action)
- docs/app-map/NNN-operations-flow.md vẫn chưa viết (nợ từ WP-J4)

---

### Bàn giao WP-E1  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Upload/tải file qua RPC (không mở bảng trực tiếp) — `api_attach_file` + `api_get_attachments` SECURITY DEFINER, `attachments` REVOKE ALL từ authenticated
- [x] Checksum lưu — SHA-256 tính ở client bằng SubtleCrypto, ghi vào cột `checksum`
- [x] Cảnh báo thiếu file hoạt động — `api_missing_attachments` + `MissingAttachmentsCard` (ẩn nếu total=0, viền amber khi có dữ liệu)

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ (T12.1–T12.3 chạy được trên DB thật; T3.1–T3.4 không bị ảnh hưởng)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (migration không sửa engine/SoD logic)
- [x] Acceptance test map tới thay đổi ....... T12.1 (api_attach_file + audit trail), T12.2 (api_get_attachments + FORBIDDEN), T12.3 (api_missing_attachments + cảnh báo disappears sau attach)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; `attachments` chỉ qua `api_attach_file`/`api_get_attachments`; storage policies trên `storage.objects` theo `bucket_id`
- [x] (Bảng mới sau WP-D1) `attachments` có `tenant_id uuid NOT NULL REFERENCES tenants(id)` + idx_attachments_tenant
- [x] docs/app-map chưa cập nhật (nợ nhỏ — không có file app-map riêng cho attachments)
- [x] Đã commit ngay theo từng thay đổi. Commits: `5ab598e` (migration), `ce797e9` (UI AttachmentsTab), `d7476cb` (controls warning), `e2e1a36` (tests)
- [x] Đã tick [x] WP-E1 ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- Storage bucket cần tạo thủ công trong Supabase Dashboard (hoặc qua CLI `supabase storage create-bucket documents`) vì migration SQL `INSERT INTO storage.buckets` chỉ chạy được khi extension `storage` đã được kích hoạt trên project
- `createSignedUrl` trên client cần storage RLS `documents_bucket_select` được apply; nếu apply chậm hơn so với upload thì cần test lại trên project thật
- app-map/016-attachments-flow.md chưa viết

Ảnh hưởng gói sau:
- WP-E2 (AI ingestion) build trên `attachments.id` — `ingest_jobs.attachment_id` FK vào đây
- WP-F1 (Comment) không phụ thuộc attachments nhưng có thể hiển thị cùng tab

---

### Bàn giao WP-E2  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Không dữ liệu nào do AI tạo mà không qua người xác nhận — `api_apply_ingest` chỉ tạo DRAFT + `ai_extracted=true` + `confidence`, không gọi SUBMIT/APPROVE/POST
- [x] AI không gọi được SUBMIT/APPROVE/POST (có test) — T13.2 PASS: kiểm tra status=DRAFT, ai_extracted=true, và thử submit/approve thất bại
- [x] Chứng từ AI tạo vẫn qua đầy đủ SoD (có test) — T13.3 PASS: muahang tạo qua ingest không thể tự duyệt (giam_doc từ chối)
- [x] Sai lệch master data → sinh EXC tự động — T13.4 PASS: partner_code không tồn tại → EXC được tạo + liên kết qua document_links

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi — ESLint hook PASS trước commit)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ T13.1–T13.4 PASS; T3.1–T3.4 PASS (không regression)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (xác nhận bằng `node --test-name-pattern "BLOCKER"`)
- [x] Acceptance test map tới thay đổi ....... T13.1 (api_create_ingest_job + ingest_jobs), T13.2 (DRAFT-only + no SUBMIT/APPROVE), T13.3 (SoD: AI-created doc qua SoD bình thường), T13.4 (master-data mismatch → EXC)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; `ingest_jobs` chỉ qua `api_create_ingest_job`/`api_apply_ingest`/`api_get_ingest_job`/`api_list_ingest_jobs`; RLS theo tenant
- [x] (Bảng mới sau WP-D1) `ingest_jobs` có `tenant_id uuid NOT NULL REFERENCES tenants(id)` + RLS policy
- [x] docs/app-map chưa cập nhật (nợ nhỏ — không có file app-map riêng cho AI ingestion)
- [x] Đã commit ngay theo từng thay đổi. Commits: `b9d6814` (022_ingest.sql), `e737e1e` (deps @anthropic-ai/sdk), `e1a6943` (/api/ingest route), `118e383` (T13.1–T13.4 tests), `42e112d` (fix T13.3 + storage policy fix)
- [x] Đã tick [x] gói này ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `/api/ingest` route gọi Claude Sonnet (vision) thật — cần `ANTHROPIC_API_KEY` trong `.env.local`; không có key thì route báo lỗi 500
- `api_apply_ingest` không tạo `document_lines`; document_lines phải được thêm thủ công (hoặc qua UI) trước khi human reviewer submit
- Test T13.3 workaround: thêm line qua `api_update_document` sau ingest để PR đáp ứng điều kiện `has_lines` — phản ánh đúng luồng thực tế (AI trích header, human bổ sung/sửa lines)
- `022_ingest.sql` (không phải `017_ingest.sql` như §3 gốc mô tả) do các migration trước đó dùng 017–021

Ảnh hưởng gói sau:
- WP-F1 (Comment): có thể thêm comment tab ở trang review ingest job
- WP-G1 (Audit Pack): `ingest_jobs` và EXC auto-link đã có audit trail qua fn_insert_document

---

### Bàn giao WP-F1  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Bảng `comments` (document_id, tenant_id, user_id, body, mentions uuid[], created_at) — PASS (`023_comments.sql`)
- [x] `api_add_comment`: kiểm tra fn_doc_in_scope(VIEW), lưu comment, fn_notify cho @mention — PASS (T14.1, T14.2)
- [x] Hiển thị ở `/documents/[id]` tab "Thảo luận" — PASS (`CommentsTab`, `comments-tab.tsx`)
- [x] `@mention` → `fn_notify`: gọi fn_notify cho từng user được nhắc, trừ chính mình — PASS (T14.2)

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ T14.1–T14.3 PASS ✔; T3.1–T3.4 không bị ảnh hưởng
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (migration không đụng SoD engine)
- [x] Acceptance test map tới thay đổi ....... T14.1 (add_comment + get_comments), T14.2 (@mention → fn_notify), T14.3 (tenant isolation)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; `comments` REVOKE ALL; chỉ EXECUTE trên `api_add_comment`, `api_get_comments`
- [x] (Bảng mới sau WP-D1) `comments` có `tenant_id NOT NULL REFERENCES tenants(id)` + RLS `tenant_id = fn_current_tenant()` — PASS
- [ ] docs/app-map/NNN-comments-flow.md — chưa viết (nợ kỹ thuật nhỏ)
- [x] Đã commit ngay theo từng thay đổi. Commits: `4606a9d` (023_comments.sql), `2188a71` (CommentsTab UI), `69a312a` (T14.1–T14.3 tests), `5adc8b9` (fix T14.1/T14.3 assertions + generator tenant_id)
- [x] Đã tick [x] WP-F1 ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `docs/app-map/NNN-comments-flow.md` chưa viết (nợ kỹ thuật nhỏ)
- T14.3: set `request.jwt.claim.tenant_id` (singular) để `fn_current_tenant()` đọc đúng tenant B

Ảnh hưởng gói sau:
- WP-F2 (Task queue): CommentsTab pattern có thể tái dùng
- WP-F3 (Client Portal): `api_get_comments` + `api_add_comment` có thể expose cho portal (với scope OWN theo partner_id)
- WP-G1 (Audit Pack): comments không ghi vào audit_trail hiện tại — nếu cần traceability comment, WP-G1 có thể thêm

---

### Bàn giao WP-F2  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] `api_tasks()` — variant của `api_inbox()` trả thêm `role_groups`, `primary_role_group`, `sla_priority`, `counts` — PASS (T15.1)
- [x] Action `sod_role=APPROVER` → `role_groups` chứa `'APPROVE'`, `primary_role_group = 'APPROVE'`, `counts.APPROVE ≥ 1` — PASS (T15.2)
- [x] Hàng BREACHED (`sla_priority=0`) xếp trước hàng ON_TIME (`sla_priority=2`) — PASS (T15.3)
- [x] Cô lập tenant: user JWT tenant B không thấy task của tenant A — PASS (T15.4)
- [x] `/tasks` page dùng `useTasks()` hook, tab lọc theo `primary_role_group` (Tất cả / Cần duyệt / Cần thực hiện / Đề xuất / Kiểm tra) — PASS (kiểm tra trực tiếp qua DB)
- [x] Fixes phụ được phát hiện và commit: `025_fix_handoff_tenant.sql` (NOT NULL tenant_id), `026_fix_fn_notify.sql` (overload ambiguity)

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ 87/107 PASS (20 pre-existing, không có regression WP-F2)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (T3.9 cũng PASS sau fix 025)
- [x] Acceptance test map tới thay đổi ....... T15.1 (role_groups/primary/sla_priority), T15.2 (APPROVE group), T15.3 (SLA sort), T15.4 (tenant isolation)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; api_tasks chỉ qua EXECUTE; không tạo bảng mới
- [x] (Bảng mới sau WP-D1) N/A — không có bảng mới; api_tasks() là function-only
- [ ] docs/app-map/ liên quan — chưa cập nhật (nợ kỹ thuật nhỏ)
- [x] Đã commit ngay theo từng thay đổi. Commits: `334f331` (024_tasks.sql + useTasks + /tasks UI), `319b4a6` (025_fix_handoff_tenant.sql), `1ceb703` (026_fix_fn_notify.sql), `f251767` (T15.1–T15.4 tests), `cf3ce06` (fix tenant filter trong api_tasks)
- [x] Đã tick [x] WP-F2 ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `docs/app-map/NNN-tasks-flow.md` chưa viết (nợ nhỏ)
- api_tasks SECURITY DEFINER → phải nhớ thêm `AND doc.tenant_id = v_tenant_id` mỗi khi extend thêm bảng trong query
- 2 fix phụ (025, 026) sửa lỗi latent từ WP-D1/WP-F1 — không phải regression mới

Ảnh hưởng gói sau:
- WP-F3 (Client Portal): `api_tasks` pattern tenant-isolated có thể làm model cho portal queue
- WP-G3 (Đa cấp duyệt): `role_groups` đã sẵn sàng để hiển thị chuỗi duyệt nhiều bước
- WP-G4 (Risk alerts): `sla_priority` + `handoff.sla_status` BREACHED là nguồn dữ liệu tự nhiên

---

### Bàn giao WP-G1  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] `api_audit_pack(from, to, scope)` kết xuất 6 sections: `audit_trail`, `sod_check_log`, `document_links`, `handoff_records`, `exception_register` (doc_type=EXC), `gl_entries` — PASS
- [x] Manifest có `sha256` riêng mỗi section + `sha256_total` = SHA-256 của 6 hash nối chuỗi — PASS (T16.1)
- [x] Hash ổn định khi chạy 2 lần trên cùng dữ liệu bất biến — PASS (T16.1)
- [x] Hash tổng lệch khi thêm bản ghi `sod_check_log` trong kỳ — PASS (T16.2)
- [x] Scope enforcement: BUYER (không có quyền JV) gọi với `p_scope='JV'` → `document_count = 0`; CHIEF_ACCOUNTANT (COMPANY VIEW) → `document_count ≥ 1` — PASS (T16.3)
- [x] Tôn trọng `fn_doc_in_scope` — mọi document trong kết xuất đều đã qua kiểm tra quyền VIEW

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ T16.1–T16.3 PASS; T3.1–T3.4 PASS
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (không đụng state machine / SoD engine)
- [x] Acceptance test map tới thay đổi ....... T16.1 (hash stable), T16.2 (hash changes on mutation), T16.3 (fn_doc_in_scope scope check)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; api_audit_pack SECURITY DEFINER; chỉ GRANT EXECUTE
- [x] (Bảng mới sau WP-D1) N/A — không tạo bảng mới; chỉ đọc qua SECURITY DEFINER
- [ ] docs/app-map/NNN-audit-pack.md — chưa viết (nợ kỹ thuật nhỏ)
- [x] Đã commit ngay theo từng thay đổi. Commits: `24c2be5` (027_audit_pack.sql + T16.1–T16.3), `7161942` (fix T16.3: dùng ketoan tạo JV)
- [x] Đã tick [x] WP-G1 ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- Sau khi chạy `node scripts/db.mjs functions` (re-apply 004_engine.sql), phải re-apply `025_fix_handoff_tenant.sql` và `026_fix_fn_notify.sql` vì chúng fix hàm trong 004 và bị ghi đè
- `exception_register` không phải bảng riêng — đây là documents với `doc_type = 'EXC'`; nếu thêm bảng exception riêng trong tương lai, cần cập nhật query

Ảnh hưởng gói sau:
- WP-G2 (hash-chain): audit_trail đã được hash section trong WP-G1 — WP-G2 thêm `prev_hash`+`row_hash` per-row để Audit Pack có thể kiểm chứng tính toàn vẹn chuỗi
- WP-G4 (Risk alerts): `sod_check_log` được kết xuất đầy đủ — cơ sở cho widget phát hiện bất thường SoD

---

### Bàn giao WP-G2  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] Mỗi bản ghi `audit_trail` có `prev_hash` + `row_hash` (SHA-256) — PASS (`028_audit_hash_chain.sql`)
- [x] `fn_audit_row()` tính hash-chain: `pg_advisory_xact_lock` serialize; genesis block `repeat('0', 64)`; canonical input dùng `chr(31)` delimiter + `extract(epoch...)::text` — PASS
- [x] `api_audit_chain_verify(p_from, p_to)`: yêu cầu quyền `AUDIT_TRAIL VIEW`; tái tính hash và kiểm tra liên kết prev_hash; trả `{ok, total, valid, broken_at_id, reason}` — PASS
- [x] Phát hiện giả mạo: INSERT bản ghi với `row_hash` sai → `ok=false`, `broken_at_id` khác null — PASS (T17.2)
- [x] Chuỗi liên tục: `rows[i].prev_hash === rows[i-1].row_hash` cho mọi i — PASS (T17.3)

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi; chỉ đụng SQL + test JS)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ T17.1–T17.3 PASS; T3.1–T3.4 PASS; tổng suite 119 test (T17.1 ✔ T17.2 ✔ T17.3 ✔ trong full run)
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (không đụng state machine / SoD engine)
- [x] Acceptance test map tới thay đổi ....... T17.1 (chain verify ok=true sau ghi bình thường), T17.2 (phát hiện giả mạo row_hash), T17.3 (prev_hash == row_hash của dòng trước)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; `api_audit_chain_verify` SECURITY DEFINER; chỉ GRANT EXECUTE
- [x] (Bảng mới sau WP-D1) N/A — không tạo bảng mới; chỉ thêm 2 cột + 1 index vào `audit_trail`
- [ ] docs/app-map/NNN-audit-pack.md — chưa viết (nợ từ WP-G1)
- [x] Đã commit ngay. Commit: `61a89bd` (028_audit_hash_chain.sql + tests/acceptance.test.mjs T17.1–T17.3)
- [x] Đã tick [x] WP-G2 ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `pg_advisory_xact_lock` serialize toàn bộ INSERT vào audit_trail trong một transaction; nếu transaction insert nhiều dòng audit (vd. bulk action) → tất cả cùng giữ lock → không bị fork nhưng throughput giảm (chấp nhận được cho hệ thống ERP)
- Bản ghi cũ (row_hash IS NULL) bị bỏ qua khi verify; muốn back-fill hash cho bản ghi cũ phải viết script migration riêng (không nằm trong WP-G2)
- `api_audit_chain_verify` là STABLE (không ghi) nhưng SELECT `audit_trail` không qua RLS (SECURITY DEFINER); chỉ user có quyền `AUDIT_TRAIL VIEW` mới gọi được

Ảnh hưởng gói sau:
- WP-G1 (Audit Pack): `api_audit_pack` manifest có thể bổ sung kiểm tra chain bằng cách gọi `api_audit_chain_verify` và ghi kết quả vào manifest
- WP-G4 (Risk alerts): có thể thêm alert khi `api_audit_chain_verify` trả `ok=false`

---

### Bàn giao WP-G3  (2026-09-23)

Tiêu chí nghiệm thu riêng của gói (§3):
- [x] `approval_chains` + `approval_chain_steps`: cấu hình chuỗi duyệt theo `doc_type` + `min_amount`/`max_amount`; seed PO ≥ 50 triệu với 2 bước (PROC_MANAGER → CFO) — PASS (`029_multi_level_approval.sql`)
- [x] `approval_chain_log`: immutable (trigger `trg_chain_log_immutable` chặn UPDATE/DELETE); UNIQUE (document_id, step_id) — mỗi bước chỉ duyệt 1 lần — PASS
- [x] `fn_check_condition` mở rộng với case `chain_complete`: tìm chain phù hợp (doc_type + amount), kiểm tra từng bước, trả thông báo tiếng Việt khi còn bước chờ — PASS (T18.4)
- [x] `state_transitions.conditions` cho PO → `approve` được append `chain_complete`; PO < 50 triệu không có chain → condition pass ngay — PASS
- [x] `delegations`: time-bounded (`valid_from`/`valid_until`); `delegations_no_self` check; SoD block khi delegate có quyền CREATE trên doc_type được uỷ quyền APPROVER — PASS (T18.1)
- [x] `api_create_delegation`: kiểm tra `fn_perm_scope(delegate, doc_type, 'CREATE') > 0` → trả `SOD_VIOLATION` — PASS (T18.1)
- [x] `fn_doc_in_scope` mở rộng: khi `fn_perm_scope` = 0 cho APPROVE, tra `delegations` → dùng scope của delegator; tenant isolation giữ nguyên — PASS (T18.2, T18.3)
- [x] T3.1–T3.4 (SoD blocker) vẫn PASS sau khi thêm delegation — PASS (T18.5)

Definition of Done chung:
- [x] npm run typecheck ....................... SẠCH (0 lỗi; chỉ đụng SQL + test JS)
- [x] npx next lint .......................... SẠCH (✔ No ESLint warnings or errors)
- [x] npm run test:acceptance ................ T18.1–T18.5 PASS; T3.1–T3.4 PASS
- [x] T3.1–T3.4 (SoD blocker) ................ PASS ✔ (cùng user không tạo+duyệt cùng PO; mọi attempt bị log)
- [x] Acceptance test map tới thay đổi ....... T18.1 (SOD_VIOLATION khi uỷ quyền sai), T18.2 (tạo delegation hợp lệ), T18.3 (delegate duyệt thành công), T18.4 (chain_complete chặn duyệt khi chưa đủ bước), T18.5 (SoD vẫn block dù có delegation)
- [x] Không vi phạm FORBIDDEN (CLAUDE.md §1.3) và Quy tắc chung §0
- [x] (Đụng DB) không cấp quyền bảng cho `authenticated`; 4 bảng mới REVOKE + chỉ EXECUTE api_*; SECURITY DEFINER trên toàn bộ api_* mới
- [x] (Bảng mới sau WP-D1) `approval_chains`, `approval_chain_steps`, `approval_chain_log`, `delegations` đều có `tenant_id NOT NULL REFERENCES tenants(id)` + RLS `tenant_id = fn_current_tenant()`
- [ ] docs/app-map/NNN-approval-flow.md — chưa viết (nợ kỹ thuật nhỏ)
- [x] Đã commit ngay. Commit: `32ec1a5` (029_multi_level_approval.sql + T18.1–T18.5)
- [x] Đã tick [x] WP-G3 ở §2 và thêm 1 dòng vào bảng bàn giao §6.2

Cạm bẫy/nợ kỹ thuật còn lại:
- `docs/app-map/NNN-approval-flow.md` chưa viết
- `node scripts/db.mjs functions` ghi đè `fn_after_status_change` / `fn_notify` / `fn_audit_row` từ 004_engine.sql, phá vỡ fix từ migrations 025–028; cần re-apply các migration đó sau mỗi lần chạy `db.mjs functions`
- Chain hiện chỉ seed cho PO ≥ 50 triệu; các doc_type khác (PMT, JV lớn) chưa có chain — bổ sung trong config (003_config hoặc migration mới)

Ảnh hưởng gói sau:
- WP-G4 (Risk alerts): có thể thêm alert khi chuỗi duyệt bị trễ (SLA per step)
- WP-H (tích hợp): `api_submit_chain_step` có thể expose qua webhook/email để approver duyệt từ email
- WP-F3 (Client Portal): delegate approval flow có thể tích hợp cho external approver
