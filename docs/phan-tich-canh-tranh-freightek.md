---
covers: docs/, supabase/migrations/, src/
last_verified: 2025-09-19
ttl_days: 60
status: PHÂN TÍCH CẠNH TRANH + KẾ HOẠCH NÂNG CẤP
doi_thu_tham_chieu: Freightek (freightekvietnam.com) — Smart ERP cho Logistics/Freight Forwarder
---

# Phân tích cạnh tranh Freightek & Kế hoạch nâng cấp ERP-General

> **Mục đích**: Ghi rõ ERP-General đang thua Freightek ở những phần nào, đề xuất phương án nâng cấp
> cho **tất cả** các phần đó, và bổ sung những phần nên làm mà chưa được nêu.
> **Nguồn đối chiếu**: website Freightek (Digital FMS, trang "Tổ chức doanh nghiệp logistics chuyên nghiệp",
> bài Facebook), ảnh chụp UI desktop + mobile app do chủ dự án cung cấp, và toàn bộ codebase ERP-General
> (10 migration, 72 file `src/`, 56 acceptance test) tại thời điểm `4262d59`.
> **Ngôn ngữ**: tài liệu tiếng Việt, code/định danh tiếng Anh — theo `CLAUDE.md` §1.2.

---

## MỤC LỤC

1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Hồ sơ đối thủ Freightek](#2-hồ-sơ-đối-thủ-freightek)
3. [Hồ sơ ERP-General](#3-hồ-sơ-erp-general)
4. [Bảng đối chiếu năng lực](#4-bảng-đối-chiếu-năng-lực)
5. [Phần đang thua — phân tích chi tiết](#5-phần-đang-thua--phân-tích-chi-tiết)
6. [Phần đang hơn — tài sản phải bảo vệ](#6-phần-đang-hơn--tài-sản-phải-bảo-vệ)
7. [Định vị chiến lược: 3 hướng](#7-định-vị-chiến-lược-3-hướng)
8. [Kế hoạch nâng cấp chi tiết](#8-kế-hoạch-nâng-cấp-chi-tiết)
9. [Những phần nên làm thêm](#9-những-phần-nên-làm-thêm)
10. [Lộ trình & thứ tự thực thi](#10-lộ-trình--thứ-tự-thực-thi)
11. [Rủi ro & cạm bẫy](#11-rủi-ro--cạm-bẫy)
12. [Tiêu chí nghiệm thu cho từng hạng mục](#12-tiêu-chí-nghiệm-thu-cho-từng-hạng-mục)

---

## 1. TÓM TẮT ĐIỀU HÀNH

**Kết luận ngắn**: ERP-General và Freightek **không cạnh tranh trên cùng một trục**. Freightek bán
*hiệu suất vận hành ngành logistics*; ERP-General đang xây *nền tảng kiểm soát nội bộ*. Nếu đối đầu
trực diện theo danh sách tính năng, ERP-General thua toàn diện và **không nên làm vậy**. Nếu bán đúng
định vị kiểm soát, ERP-General có thứ Freightek **vĩnh viễn không có** và rất khó copy.

**Ba con số quyết định**:

| | ERP-General | Freightek |
|---|---|---|
| Năng lực kiểm soát (SoD, audit, trace, handoff) | 9/9 hạng mục | ~1/9 (chỉ có phân quyền cơ bản) |
| Năng lực nghiệp vụ ngành logistics | ~1/10 hạng mục | 10/10 |
| Năng lực sản phẩm thương mại (multi-tenant, portal, mobile, AI) | ~1/10 hạng mục | 9/10 |

**Việc phải làm ngay** (chi tiết ở §8, §10):

1. **P0 — 1 ngày**: viết nốt 7 acceptance test còn thiếu (`T5.1, T5.2, T5.3, T5.7, T5.10, T5.11, T5.12`);
   commit `AGENTS.md`. Hiện `CLAUDE.md` claim 63 test nhưng chỉ có 56 → tài liệu đang tự nói sai.
2. **P0 — 1 ngày**: dựng `docs/positioning.md` chốt định vị, để không tiêu tán nguồn lực đua feature.
3. **P1 — 1–2 tuần**: chart layer + dashboard theo mode/lane/sales — gap **rẻ nhất** so với Freightek.
4. **P1 — 2–3 tuần**: thực thể `SHIPMENT` qua `003_config.sql` — chứng minh kiến trúc data-driven thắng.
5. **P2 — 3–4 tuần**: AI ingestion nối vào `api_create_document` — điểm bán số 1 hiện nay.
6. **P2 — 4–6 tuần**: multi-tenant workspace — điều kiện để bán cho khách thứ hai.

---

## 2. HỒ SƠ ĐỐI THỦ FREIGHTEK

### 2.1 Định vị

**Freightek — Digital FMS**: ERP **dọc (vertical)** cho doanh nghiệp **logistics / freight forwarder**
Việt Nam. Cloud (SaaS), đa tenant. Tự nhận +300 doanh nghiệp tin dùng, có mặt trên VTV3, khách tham chiếu
công khai: LACCO, Seahorse Shipping, LogAsia SCM, Vinafoods/VTP, OceanBridge, Goodwills, Headway, Seatrans,
MSC/logistics H-A và ~30 logo khác.

Kênh bán: phễu demo → tư vấn gọi điện báo giá → ký hợp đồng → đội triển khai tại công ty hoặc online
(Zoom/Google Meet) → chạy chính thức → đo lường. Hỗ trợ qua Zalo/điện thoại/email, có Help Center
(Freshdesk) và khoá học "Freight Funnels".

### 2.2 Khung bán hàng (từ trang "Tổ chức doanh nghiệp logistics chuyên nghiệp")

- **Nỗi đau được định lượng**: 65% doanh nghiệp logistics VN làm việc không có quy trình; 80% quyết định
  sai do thiếu dữ liệu/báo cáo không đồng nhất; 90% còn dùng Zalo, Gmail, Excel.
- **Hệ quả bán**: đối với doanh nghiệp (phát triển chậm, lãng phí nguồn lực, văn hoá trì trệ); đối với
  CEO/quản lý (tốn công sức, khó nắm tình hình, cạn kiệt tài nguyên); đối với nhân viên (quá tải, mất
  động lực, thủ công nhiều rủi ro).
- **Lời hứa**: tăng hiệu suất 30%, doanh thu X2, "Cam kết ROI X2".
- **Bốn trụ giá trị**: Vận hành hiệu quả (chuẩn hoá 6 bộ phận: **Pricing, Bán hàng, Vận hành, Kế toán,
  BGĐ, Khách hàng**) · Theo dõi real-time · Số hoá dữ liệu · Phát triển vượt bậc.
- **Định vị thay thế**: "Thay thế mọi ứng dụng khác chỉ với 1 nền tảng" — thay CargoWise/Logi-sys (FMS),
  Zalo/Telegram/WhatsApp/Gmail (giao tiếp), Drive/OneDrive (lưu trữ), Salesforce/Zoho/Odoo (CRM),
  MISA/Fast/QuickBooks (kế toán), Asana/Trello/Monday (quản lý công việc). Có bảng so sánh trực quan.

### 2.3 Danh mục chức năng (từ menu + trang giải pháp)

| Nhóm | Chức năng |
|---|---|
| Pricing | Spot Rate & Contract Rate, Local Charges, Services, Custom Charges, upload hàng chục nghìn giá, cảnh báo giá sắp hết hạn |
| Báo giá | Automated Quotes — tạo báo giá hoàn chỉnh trong ~30s, cộng lợi nhuận, tính giá bán & margin tự động, theo dõi tiến độ báo giá |
| Vận hành | Shipments đa loại hình (**FCL, LCL, AIR, FTL**; export, import, nội địa; freehand, dominated), quy trình **booking → bill → customs → trucking → debit/credit → invoice → kế toán**, quản lý rủi ro & deadline |
| Truckload | Xe container FCL, xe tải FTL, hàng lẻ LTL, kiểm soát thời gian giao/nhận |
| Lịch tàu | Smart Schedule / Vessel Schedule — **500+ hãng tàu, 1000+ cảng**, real-time |
| Tracking | Real-time Cargo Tracking — vị trí & tình trạng container |
| Nhà cung cấp | Provider management: hãng tàu, hãng bay, nhà xe, đại lý; theo dõi hiệu suất theo dữ liệu real-time |
| CRM | Thông tin khách hàng toàn diện, theo dõi mọi liên hệ/tương tác, nhắc lịch, thanh trạng thái Lead → Win Client |
| Kế toán | Bán hàng/mua hàng, thu/chi, lợi nhuận, công nợ, báo cáo kế toán; dòng tiền, KQKD, cân đối kế toán; **hệ thống hai sổ: sổ quản trị + sổ tài chính**; quản lý thuế |
| Báo cáo | Báo cáo tài chính (P&L từng đợt giao dịch), báo cáo bán hàng (theo phòng & theo nhân viên), báo cáo vận hành (năng suất & chất lượng) |
| Phân tích | Business Analytics: dữ liệu lớn về tài chính, hiệu suất bán hàng, khối lượng hàng hoá, lô hàng, khách hàng; trực quan hoá biểu đồ |
| Cộng tác | Mutual Workspace & Tasks, chat real-time trong đơn hàng với đội ngũ **và khách hàng** |
| Cổng ngoài | **Client Portal** (khách tự tra cứu giá, book đơn online), **Agent Collaboration** (đại lý/đối tác nước ngoài), mời khách hàng tiềm năng hàng loạt vào hệ thống |
| AI | **AI nhập liệu Booking, HBL, Invoice** — giảm nhập tay thủ công |
| Nền tảng | Multi workspace (nhiều công ty/chi nhánh/văn phòng), Automation Setting, Help Center, mobile app iOS/Android |

### 2.4 Đọc ảnh chụp UI (bằng chứng cụ thể)

Ảnh gồm 3 khung: desktop sidebar + dashboard (trái), trang Sales/Quotes (giữa), mobile app (phải).

**Desktop — sidebar 14 mục + Automation Setting + Help Center**:
`Dashboard · Tasks · Schedule · Pricing▾ · Sales▾ · Operations▾ · Agent Sharing▾ · Tracking · Customers (badge 12)
· Agents · Partners · Accounting▾ · Reports · Business Analytics · Automation Setting · Help Center`.
Có banner "You are on the free Professional Plan trial" → **có free trial self-serve**, không chỉ demo-led.

**Desktop — widget phân tích thật**:
- Donut "User by Status": Pending / Active / Disable.
- Thẻ số liệu Quotes: **Draft 250 · Sent 350 · Booked 10x · Rejected** — pipeline báo giá theo trạng thái.
- Bar chart **"Quotes by Transport Type"** tách chuỗi **Export / Import** theo tháng.
- Pie chart **"Quotes by Creators"** — xếp hạng theo từng nhân viên sales (thấy nhãn "Christian Nguyen").
- Bộ lọc thời gian "Last 3 months".

**Mobile — danh sách shipment (đây là phần đáng chú ý nhất)**:
- Mã job có cấu trúc: `F-EX-FC-FR-TIA-2309-1826` — encode sẵn **Export + FCL + Freight + tuyến TIA**,
  kèm dòng "Sea FCL" và trạng thái `Active / Confirmed` (một card `Cancelled` + nhãn đỏ **"Lãi hết hạn"**).
- Tuyến: `VNSGN → USHOU` (cảng đi HCM → cảng đến Houston), cột giữa `CY - CY` với ETD `Maersk Carrier 30 Oct 2023`.
- Hàng hoá + container: `Coffee, Rice, Rice…` với `20DC×5`, `20DC×5`, `+3`.
- Thanh điều hướng dưới: **Shipment · Message · Notification · Account** → có **chat trong app**.

**Suy luận kiến trúc từ ảnh**: đối tượng trung tâm của Freightek là **shipment/lô hàng theo tuyến và
phương thức vận tải**, không phải chứng từ kế toán. Mã job, cảng, hãng tàu, ETD/ETA, container là
**dữ liệu hạng nhất**. Chứng từ (debit/credit note, invoice) chỉ là hệ quả sinh ra từ shipment.

### 2.5 Điểm yếu của Freightek (đối thủ có lỗ hổng rõ ràng)

Từ toàn bộ nội dung công khai của họ, **không có bất kỳ đề cập nào** tới:

- Tách biệt nhiệm vụ (separation of duties) — 4 vai trò người đề xuất / phê duyệt / thực hiện / kiểm tra.
- Audit trail bất biến, truy vết ai đã sửa gì, giá trị trước/sau.
- Chuỗi chứng từ (document chain) và 3 đường truy vết (tiền / hàng / trách nhiệm).
- Bàn giao liên phòng ban có SLA và bằng chứng.
- Sổ ngoại lệ (exception register) với quy trình phê duyệt ngoại lệ.
- Từ điển dữ liệu thống nhất, ma trận tác động, sổ Shadow-IT.
- Kiểm thử nghiệm thu có thể chứng minh (acceptance test công khai).

Tuyên bố "an toàn dữ liệu 100%" và "bảo mật cao cấp" của họ là **câu chữ marketing**, không kèm cơ chế
kiểm chứng được. Đây chính là khe hở để ERP-General tấn công.

---

## 3. HỒ SƠ ERP-GENERAL

### 3.1 Thực trạng đã kiểm chứng trong repo

| Hạng mục | Bằng chứng |
|---|---|
| Stack | Next.js 14 App Router + Supabase (Postgres + Auth) + Vercel (`docs/adr/0001`) |
| Schema | `002_core_schema.sql` — **38 bảng** |
| Cấu hình nghiệp vụ | `003_config.sql` (563 dòng) — doc_types, state_transitions, doc_child_rules, permission_matrix, sod_matrix, handoff_map, kpi_catalog, data_dictionary, acceptance_criteria |
| Engine | `004_engine.sql` (**1674 dòng**) — state machine, SoD, audit trigger, GL, kho, budget, roll-up, `fn_apply_effects` |
| Read API | `005_read_api.sql` (901 dòng) — ~35 hàm `api_*` |
| Bảo mật | `006_security.sql` — revoke toàn bộ bảng khỏi `anon`/`authenticated`, chỉ cấp EXECUTE cho `api_*` |
| Mở rộng | `007_flow_ownership`, `008_product_profit`, `009_vat`, `010_email_outbox` |
| Loại chứng từ | **23**: BUDGET, QUOT, SO, DN, INV, RCPT, PR, PO, GRN, SINV, PMT, ST, ADJ, WO, HIRE, PAYROLL, JV, BANKREC, ASSET, TICKET, EXC, MDC, ACCESS_REVIEW |
| UI | 24 page: dashboard, sales, procurement, inventory, production, hr, finance, assets, planning, customer-service, admin, controls, exceptions, audit-trail, trace, reports, acceptance, documents, tasks, me |
| Kiểm thử | `tests/acceptance.test.mjs` — **56/63 test**, chạy trong transaction rồi rollback |
| Tài liệu | `CLAUDE.md`, `AGENTS.md`, `docs/app-map/001`, `docs/demo-guide.md`, `docs/huong-dan-nghiep-vu.md`, ADR-0001 |

### 3.2 Điểm mạnh cấu trúc

1. **Logic nằm ở database, không ở frontend.** Frontend chỉ gọi RPC `api_*`; không truy cập bảng nghiệp vụ.
   Nghĩa là mọi quy tắc kiểm soát **không thể bị bypass** qua devtools hay API trực tiếp.
2. **State machine là dữ liệu, không phải code.** Thêm loại chứng từ / chuyển trạng thái / quyền / bàn giao
   = sửa dữ liệu cấu hình trong `003_config.sql` + thêm cấu hình UI trong `src/lib/doc-config.ts` (297 dòng).
   Đây là lợi thế kiến trúc lớn nhất và là con đường nhanh nhất để mở rộng sang ngành dọc.
3. **SoD enforce ở tầng DB** với `fn_sod_find_conflict` / `fn_sod_enforce` / `sod_check_log` — ghi log
   *mọi* lần vi phạm, kể cả lần bị chặn.
4. **Audit trail bất biến** — trigger `fn_audit_row` ghi mọi thay đổi, `fn_block_mutation` chặn UPDATE/DELETE.
5. **Phân quyền 3 tầng** — action × data_scope (OWN/DEPARTMENT/BRANCH/COMPANY) × field (`fn_hidden_fields`, `fn_mask`).
6. **3 đường truy vết có thật**: `api_trace_money`, `api_trace_goods`, `api_trace_responsibility`,
   dựng trên `fn_chain_ids` / `fn_trace_nodes` / `fn_trace_edges` / `fn_lineage`.
7. **Tự chứng minh được** — 56 test acceptance + `api_update_acceptance` + trang `/acceptance`.

---

## 4. BẢNG ĐỐI CHIẾU NĂNG LỰC

Chú thích: ✅ có và enforce thật · 🟡 có một phần / hình thức · ❌ không có · ❓ không rõ từ thông tin công khai.

### 4.1 Lớp kiểm soát (ERP-General thắng)

| # | Năng lực | ERP-General | Freightek |
|---|---|---|---|
| C1 | SoD 4 vai trò enforce ở DB | ✅ `fn_sod_enforce` | ❌ |
| C2 | Log mọi vi phạm SoD (kể cả bị chặn) | ✅ `sod_check_log` | ❌ |
| C3 | Audit trail bất biến (append-only) | ✅ `fn_block_mutation` | ❌ |
| C4 | Phân quyền 3 tầng action × scope × field | ✅ `fn_mask` | 🟡 phân quyền cơ bản |
| C5 | Chuỗi chứng từ liên kết cha–con | ✅ `document_links` | 🟡 trong từng shipment |
| C6 | 3 đường truy vết tiền/hàng/trách nhiệm | ✅ `api_trace_*` | ❌ |
| C7 | Bàn giao liên phòng ban + SLA | ✅ `handoff_records` | ❌ chỉ có Tasks |
| C8 | Sổ ngoại lệ + workflow phê duyệt | ✅ `EXC` + BM-11 | ❌ |
| C9 | State machine cấu hình bằng dữ liệu | ✅ `state_transitions` | ❓ |
| C10 | Chặn ở tầng bảng, chỉ mở RPC | ✅ `006_security.sql` | ❓ |
| C11 | Acceptance test công khai | ✅ 56 test | ❌ |

**Tổng lớp kiểm soát: ERP-General 11 — Freightek ~1.**

### 4.2 Lớp nghiệp vụ ngành logistics (Freightek thắng)

| # | Năng lực | ERP-General | Freightek |
|---|---|---|---|
| D1 | Thực thể **shipment/lô hàng** theo tuyến & phương thức | ❌ | ✅ trung tâm hệ thống |
| D2 | Mã job có cấu trúc (`F-EX-FC-FR-TIA-…`) | ❌ | ✅ |
| D3 | Rate sheet (spot/contract, local charges, phụ phí) + cảnh báo hết hạn | ❌ | ✅ |
| D4 | Báo giá tự động 30s + tính margin | 🟡 `QUOT` generic | ✅ |
| D5 | Lịch tàu (500+ hãng tàu, 1000+ cảng) | ❌ | ✅ |
| D6 | Tracking container real-time | ❌ | ✅ |
| D7 | Quản lý nhà cung cấp theo loại (hãng tàu/bay/nhà xe/đại lý) + hiệu suất | 🟡 `partners` generic | ✅ |
| D8 | Debit note / Credit note với đại lý nước ngoài | ❌ | ✅ |
| D9 | Truckload FCL/FTL/LTL | ❌ | ✅ |
| D10 | Hai sổ kế toán (quản trị + tài chính) | ❌ | ✅ |
| D11 | CRM theo Lead → Win Client, nhắc tương tác | 🟡 `TICKET` | ✅ |
| D12 | ETD/ETA, cảng đi/đến, số container, loại container | ❌ | ✅ |

**Tổng lớp nghiệp vụ ngành: Freightek ~12 — ERP-General ~1.5.**

### 4.3 Lớp sản phẩm thương mại (Freightek thắng)

| # | Năng lực | ERP-General | Freightek |
|---|---|---|---|
| P1 | Multi-tenant (nhiều công ty trên 1 hệ thống) | ❌ một tenant | ✅ 300+ khách |
| P2 | Multi workspace/chi nhánh/văn phòng | 🟡 `branches` trong 1 tenant | ✅ |
| P3 | Client Portal (khách tự tra giá, book đơn) | ❌ | ✅ |
| P4 | Agent/đại lý collaboration | ❌ | ✅ |
| P5 | Chat real-time trong đơn hàng | ❌ | ✅ |
| P6 | Task/workspace quản lý công việc | 🟡 `/tasks` sơ khai | ✅ |
| P7 | Mobile app iOS/Android | ❌ | ✅ |
| P8 | AI nhập liệu Booking/HBL/Invoice | ❌ | ✅ |
| P9 | Trực quan hoá: donut/bar/pie, xếp hạng sales | ❌ không có thư viện chart | ✅ |
| P10 | Free trial self-serve | 🟡 có `/gate` access-code | ✅ Professional Plan trial |
| P11 | Help Center / knowledge base | ❌ | ✅ Freshdesk |
| P12 | Đội triển khai & training | ❌ | ✅ |
| P13 | Khách tham chiếu & thương hiệu | ❌ | ✅ 300+, VTV3 |
| P14 | Tích hợp hệ thống ngoài | 🟡 Resend email | ✅ "tích hợp mượt mà" |
| P15 | Sao lưu / DR / uptime SLA | ❓ | ❓ |

**Tổng lớp thương mại: Freightek ~14 — ERP-General ~1.5.**

### 4.4 Kết luận đối chiếu

```
Kiểm soát:   ERP-General 11  ──────────────  Freightek  1
Ngành dọc:   ERP-General  1.5 ──────────────  Freightek 12
Thương mại:  ERP-General  1.5 ──────────────  Freightek 14
```

ERP-General chỉ có cửa thắng nếu **đổi trục so sánh** và **vá đủ lớp thương mại tối thiểu** để có thể
được bán. Không thể thắng bằng cách đua danh sách tính năng ngành.

---

## 5. PHẦN ĐANG THUA — PHÂN TÍCH CHI TIẾT

Mỗi mục: **hiện trạng → hệ quả → phương án nâng cấp**.

### T1. Không có thực thể Shipment — gap chí mạng nhất

**Hiện trạng**: 23 doc_type đều là chứng từ ERP generic (QUOT, SO, DN, INV, PR, PO, JV…). Không có bảng
hay doc_type nào biểu diễn *lô hàng* với tuyến, phương thức, hãng tàu, container.

**Hệ quả**: trong ngành logistics, **shipment là trung tâm** — mọi thứ khác là hệ quả. Không có nó thì:
- Không thể hiển thị danh sách lô hàng như ảnh mobile của Freightek.
- Không thể tính lãi/lỗ theo lô, theo tuyến, theo hãng tàu — chỉ tính được theo sản phẩm/khách hàng.
- Không thể gắn chứng từ (invoice, debit note) vào một lô cụ thể.
- Toàn bộ tầng kiểm soát mạnh của bạn **không có đối tượng ngành để áp lên**.

**Phương án**: thêm thực thể `SHIPMENT` **hoàn toàn qua cấu hình**, không phá kiến trúc:

- **Migration `011_shipment.sql`**:
  - `ALTER TABLE documents` thêm cột `data` đã có sẵn → chứa header ngành: `job_no, mode, shipment_type,
    pol, pod, etd, eta, carrier, vessel, voyage, shipper, consignee, incoterm, gross_weight, cbm, chargeable_weight`.
  - Thêm `doc_types` mới: `SHIPMENT` (module `operations`, flow `L12`), `BOOKING`, `HBL`, `DO`, `DNOTE`, `CNOTE`.
  - Thêm `state_transitions` cho SHIPMENT:
    `DRAFT → BOOKED → CONFIRMED → IN_TRANSIT → ARRIVED → CUSTOMS → DELIVERED → CLOSED`, nhánh `CANCELLED`.
  - Thêm `doc_child_rules`: `SHIPMENT → BOOKING/HBL/DO/SINV/DNOTE/CNOTE`, `QUOT → SHIPMENT`.
  - Bảng `containers` (id, shipment_id, cntr_no, cntr_type, seal_no, gross_weight, cbm, package_count) —
    hoặc dùng `document_lines` với `line_type='CONTAINER'` nếu muốn giữ nguyên một bảng.
  - Bảng `shipment_charges` (charge_code, charge_type `AR|AP`, description, qty, unit, rate,
    currency, exchange_rate, amount, is_billable) — đây là **cốt lõi tính lãi lỗ theo lô**.
- **Sinh mã job**: mở rộng `fn_next_number` để dựng mã cấu trúc kiểu `F-EX-FC-FR-TIA-2309-1826`
  (mode + loại + tuyến + yy mm + seq), cấu hình qua bảng `doc_sequences`.
- **UI**: cấu hình `src/lib/doc-config.ts` thêm block SHIPMENT (header + lineMode mới `"container"` và `"charge"`).
- **Tận dụng**: `fn_apply_effects` chỉ cần thêm nhánh cho SHIPMENT (đẩy chi phí vào GL, khoá lô khi CLOSED).

**Vì sao nhanh**: toàn bộ state machine, SoD, audit, handoff, trace, permission **đã generic** — thực thể
mới tự động được thừa hưởng. Đây là lợi thế lớn nhất của kiến trúc hiện tại.

**Ước lượng**: 2–3 tuần (1 tuần migration + engine, 1 tuần UI, 2–3 ngày test + seed).

---

### T2. Không có Rate & Quotation Engine theo ngành

**Hiện trạng**: `QUOT` generic với dòng sản phẩm. `api_product_profit` tính lãi gộp theo sản phẩm/khách hàng.

**Hệ quả**: không thể làm điều Freightek quảng cáo — "báo giá hoàn chỉnh trong 30s", upload hàng chục
nghìn giá, cảnh báo giá sắp hết hạn, tính margin tự động theo tuyến/container.

**Phương án**:

- Bảng `rates`: `carrier_id, lane_pol, lane_pod, mode, equipment_type, charge_code, rate_type
  (SPOT|CONTRACT), currency, amount, valid_from, valid_to, min_qty, surcharges jsonb, source_file, uploaded_by`.
- Bảng `charge_codes`: danh mục phí chuẩn (Ocean Freight, THC, BAF, EBS, CIC, Doc Fee, Customs, Trucking…)
  với `charge_type AR|AP`, `is_local`, `is_optional`.
- RPC `api_rate_search(p_pol, p_pod, p_mode, p_equipment, p_date)` — trả về danh sách rate khả dụng + cờ
  `expiring_soon` (còn ≤ 7 ngày) và `expired`.
- RPC `api_quote_build(p_shipment_draft)` — ghép rate AR + rate AP + phụ phí → đề xuất giá bán và margin.
- RPC `api_rate_import(p_rows jsonb)` — nhập hàng loạt từ CSV/Excel (đây cũng là nền cho AI ingestion).
- Job cảnh báo: mở rộng `email_outbox` — cron quét rate `valid_to` sắp hết, `fn_notify` tới bộ phận Pricing.
- UI: trang `/pricing` với bảng rate, bộ lọc tuyến/hãng tàu, trạng thái hiệu lực, badge cảnh báo.

**Ước lượng**: 2–3 tuần.

---

### T3. Không có dữ liệu tham chiếu ngành (lịch tàu, cảng, hãng tàu, tracking)

**Hiện trạng**: không có gì. `partners` generic không phân biệt hãng tàu / hãng bay / nhà xe / đại lý.

**Hệ quả**: thiếu hẳn nhóm tính năng "Smart Schedule" (500+ hãng tàu, 1000+ cảng) và "Real-time Cargo
Tracking" — hai tính năng được quảng cáo nổi bật nhất.

**Phương án**:

- Danh mục nội bộ trước, tích hợp sau:
  - `carriers` (code SCAC, name, mode, website, tracking_url_template).
  - `ports` (code UN/LOCODE, name, country, type SEA|AIR|ICD).
  - `vessels` + `vessel_schedules` (carrier, vessel, voyage, pol, pod, etd, eta, transit_days, cutoff_dates).
- Bảng `tracking_events` (shipment_id, container_id, event_code, event_name, location, occurred_at, source,
  raw jsonb) — dùng chung cho cả nhập tay, import file và API.
- Nạp lịch tàu: giai đoạn 1 nhập tay/import CSV; giai đoạn 2 tích hợp API hãng tàu hoặc nhà cung cấp
  dữ liệu (ví dụ dịch vụ schedule/tracking thương mại) **qua một adapter service** ở tầng Next.js, không
  gọi HTTP từ Postgres (giữ nguyên nguyên tắc đã ghi trong `010_email_outbox.sql`).
- UI: `/schedule` (tìm chuyến), và tab "Tracking" trong chi tiết shipment hiển thị timeline sự kiện.
- **Nguyên tắc quan trọng**: coi tracking là **dữ liệu nhập được từ nhiều nguồn**, không phải tính năng
  phụ thuộc API bên thứ ba — vì API hãng tàu dễ đứt và tốn phí.

**Ước lượng**: 1 tuần (danh mục + timeline thủ công), +2 tuần nếu tích hợp API thật.

---

### T4. Không có multi-tenant

**Hiện trạng**: một tenant. `branches`/`departments` chỉ chia trong nội bộ một công ty.

**Hệ quả**: **không thể bán cho khách hàng thứ hai**. Đây là chặn cứng về mặt thương mại — Freightek phục
vụ 300+ công ty trên cùng hạ tầng; bạn phải deploy riêng từng khách, chi phí vận hành và bảo trì nổ theo
số khách, không có lợi thế quy mô.

**Phương án** (làm **trước** khi có khách thứ hai, vì càng muộn càng đắt):

- Thêm bảng `tenants` (id, code, name, plan, status, created_at, settings jsonb).
- Thêm cột `tenant_id` vào **mọi bảng nghiệp vụ** (branches, departments, app_users, partners, products,
  warehouses, documents, gl_entries, audit_trail, sod_check_log, handoff_records, notifications…).
- **RLS theo tenant**: thay `USING (true)` trong `006_security.sql` bằng `USING (tenant_id = fn_current_tenant())`.
- Thêm `fn_current_tenant()` suy ra từ JWT claim (Supabase Auth custom claim) hoặc từ `app_users.tenant_id`.
- **Mọi RPC `api_*`** phải lọc `tenant_id` — đây là hạng mục rủi ro cao nhất, cần test riêng:
  `T6.x: user tenant A không đọc được bất kỳ dữ liệu nào của tenant B` (thử trên cả bảng lẫn RPC).
- Provisioning: RPC `api_admin_create_tenant` + seed mẫu (master data, accounts, doc_types theo gói).
- Cấu hình theo tenant: `doc_types`/`state_transitions`/`permission_matrix`/`sod_matrix` cần thêm `tenant_id`
  hoặc cơ chế `tenant_id NULL = mặc định hệ thống` để tránh nhân bản dữ liệu cấu hình.

**Ước lượng**: 4–6 tuần (bao gồm test tenant isolation). **Không nên trì hoãn.**

---

### T5. Không có AI ingestion

**Hiện trạng**: `grep` toàn bộ `src/` không có `ocr|openai|anthropic|upload|storage|attach`. Chỉ có
`downloadCsv` và `window.print()`. Không có upload file, không có lưu trữ tài liệu.

**Hệ quả**: mất tính năng bán chạy nhất hiện nay ("AI nhập liệu Booking, HBL, Invoice — giảm nhập liệu
thủ công"), và mất luôn khả năng lưu trữ chứng từ gốc — thứ mà chính `CLAUDE.md` NT2 ("Chứng từ là sự thật")
yêu cầu.

**Phương án** (đây là chỗ **API sạch của bạn là lợi thế**: AI chỉ cần gọi `api_create_document`):

- **Bước 1 — Lưu trữ chứng từ (1 tuần)**: Supabase Storage bucket `documents`, bảng `attachments`
  (id, document_id, tenant_id, file_name, mime, size, storage_path, checksum, uploaded_by, uploaded_at).
  RPC `api_attach_file`, hiển thị trong `/documents/[id]`. Bổ sung ĐK: chứng từ đã ghi audit mà không có
  file đính kèm → cảnh báo trong `/controls`.
- **Bước 2 — Ingestion pipeline (2–3 tuần)**:
  - Route `/api/ingest` (Next.js): nhận file/email → OCR hoặc gọi model thị giác → trả JSON có schema.
  - Bảng `ingest_jobs` (id, source_type PDF|EMAIL|IMAGE, attachment_id, status, extracted jsonb,
    confidence numeric, created_document_id, error, created_by, created_at).
  - **Người duyệt luôn là bắt buộc**: AI chỉ tạo bản nháp `DRAFT`; con người xác nhận rồi mới `SUBMIT`.
    Ghi rõ trong audit trail trường `ai_extracted=true` + `confidence`.
  - Đây là điểm khác biệt so với Freightek: **AI nhập liệu nhưng không phá vỡ kiểm soát** — AI không được
    phê duyệt, không được ghi sổ. Rất hợp để bán cho khối tài chính/kiểm toán.
- **Bước 3 — Trích xuất có kiểm chứng (1 tuần)**: đối chiếu dữ liệu AI trích với master data; sai lệch →
  tạo `EXC` (exception) tự động thay vì im lặng nhập sai.

**Ước lượng**: 4–6 tuần cho cả 3 bước.

---

### T6. Không có tầng cộng tác & cổng giao tiếp ra ngoài

**Hiện trạng**: `notifications` + `email_outbox` (Resend) **một chiều**. `/tasks` sơ khai. Không chat,
không portal.

**Hệ quả**: hệ thống là **công cụ nội bộ**. Freightek bán được cho khách của khách (Client Portal cho phép
khách tự tra giá và book đơn) — đó là tính năng **tạo doanh thu cho người mua**, nên rất dễ bán.

**Phương án**:

- **Comment trên chứng từ (1–2 tuần)**: bảng `comments` (document_id, tenant_id, user_id, body, mentions
  uuid[], created_at). RPC `api_add_comment`. Hiển thị ở `/documents/[id]`. Kèm `@mention` → `fn_notify`.
  Đây là bản chat **có ngữ cảnh chứng từ** — mạnh hơn chat rời vì mọi trao đổi gắn với audit trail.
- **Task/workflow queue (1 tuần)**: nâng `/tasks` thành hàng đợi công việc theo vai trò, dựa trên
  `handoff_records` + `available_actions` (đã có `fn_available_actions`). Không cần bảng mới nhiều.
- **Client Portal (3–4 tuần)**: vai trò `PORTAL_CUSTOMER` + `PARTNER_AGENT` trong `permission_matrix`,
  scope `OWN` giới hạn theo `partner_id`. Chức năng: xem lô hàng của mình, tải chứng từ, xem tracking,
  xác nhận báo giá. **Không** cho tạo chứng từ tài chính.
- **Agent Portal (2 tuần)**: tương tự cho đại lý nước ngoài — nhập debit/credit note, xem lô được giao.
- **Nguyên tắc bảo mật**: portal dùng **cùng một** `fn_perm_scope`/`fn_doc_in_scope`, chỉ khác scope.
  Tuyệt đối không mở đường đọc bảng riêng cho portal — sẽ phá vỡ `006_security.sql`.

**Ước lượng**: 6–8 tuần cho toàn bộ.

---

### T7. UX thua xa — gap rẻ nhất để vá

**Hiện trạng**: `package.json` **không có thư viện chart nào** (không recharts/chart.js/echarts/nivo).
Dashboard chỉ có số liệu và bảng; CSV export + `window.print()`.

**Hệ quả**: trong ảnh, Freightek gây ấn tượng ngay bằng donut/bar/pie và thẻ pipeline (Draft 250 / Sent 350
/ Booked / Rejected). Bạn có **dữ liệu tốt hơn** nhưng không trình bày được. Với người mua, cảm nhận
"chuyên nghiệp" đến từ tầng hiển thị trước khi họ kịp đánh giá tầng kiểm soát.

**Phương án** (làm ngay, ROI cao nhất trên mỗi giờ công):

- Cài `recharts` (nhẹ, hợp React 18 + Next 14). **Không** dùng thư viện nặng.
- Bổ sung RPC tổng hợp (đã có `api_dashboard`, `api_kpis` — chỉ cần mở rộng):
  - `api_chart_pipeline(p_doc_type)` → đếm theo trạng thái (thẻ số kiểu Draft/Sent/Booked/Rejected).
  - `api_chart_by_status(p_resource)` → donut (kiểu "User by Status").
  - `api_chart_series(p_metric, p_from, p_to, p_group_by)` → chuỗi thời gian (kiểu "Quotes by Transport Type").
  - `api_chart_by_owner(p_metric)` → xếp hạng theo nhân viên (kiểu "Quotes by Creators").
- Widget bắt buộc cho dashboard: pipeline chứng từ theo trạng thái · vi phạm SoD theo tuần (badge đỏ) ·
  ngoại lệ quá hạn SLA · bàn giao AT_RISK/BREACHED · top khách hàng theo lãi gộp · dòng tiền vào/ra ·
  số dư kho theo mặt hàng. **Đây là bộ chart mà Freightek không thể copy** vì họ không có dữ liệu SoD/SLA/exception.
- Thêm bộ lọc thời gian dùng chung ("3 tháng gần nhất"…) — hiện chưa có.
- Giữ CSV export + bổ sung export Excel/PDF (thư viện ở tầng client, không cần server).

**Ước lượng**: 1–2 tuần. **Nên làm trước cả shipment.**

---

### T8. Không có mobile

**Hiện trạng**: web responsive (có mobile nav) nhưng không có app.

**Hệ quả**: Freightek có app iOS/Android với bottom nav Shipment/Message/Notification/Account. Nhân viên
vận hành logistics làm việc ngoài hiện trường — đây là điểm chạm thực tế.

**Phương án**: **không viết app native**. Dùng PWA:
- Thêm `manifest.json` + service worker → cài được lên màn hình chính, có icon, chạy toàn màn hình.
- Bottom nav 4 mục (Việc của tôi · Chứng từ · Thông báo · Tài khoản) — dùng lại `api_inbox`/`api_notifications`.
- Push notification qua Web Push (thay/bổ sung email outbox).
- Chỉ khi có khách trả tiền yêu cầu rõ mới cân nhắc React Native.

**Ước lượng**: 1 tuần cho PWA. Đây là "80% giá trị với 10% chi phí".

---

### T9. Không có tầng vận hành thương mại

**Hiện trạng**: không có Help Center, không có tài liệu hướng dẫn người dùng cuối đầy đủ, không có SaaS
billing/subscription, không có trang marketing, không có khách tham chiếu.

**Hệ quả**: kể cả khi sản phẩm tốt, không có đường bán.

**Phương án**:
- **Tài liệu người dùng**: `docs/app-map/` hiện chỉ có 1 file (`001-system-overview`); `CLAUDE.md` §14 quy
  định cần 16 file. Viết đủ bộ app-map (mỗi luồng 1 file) — vừa đúng nguyên tắc P2, vừa thành Help Center.
- **Onboarding**: mở rộng `/gate` + landing page giới thiệu + form đăng ký demo; cấp tenant tự động
  (sau khi có T4) + dữ liệu mẫu.
- **Billing**: bảng `subscriptions` (tenant_id, plan, seats, valid_from, valid_to, status) + đếm usage.
  Không cần tích hợp cổng thanh toán ngay.
- **Đóng gói theo gói**: Starter (kiểm soát cơ bản) / Professional (+ trace, handoff, exception) /
  Enterprise (+ SoD nâng cao, audit pack, SLA).

**Ước lượng**: 3–4 tuần (chủ yếu là viết tài liệu và landing page).

---

### T10. Tài liệu và kiểm thử chưa khớp cam kết — lỗi tự thân

**Hiện trạng** (đã kiểm chứng):
- `CLAUDE.md` tuyên bố **63 acceptance test**, thực tế có **56**. Thiếu `T5.1, T5.2, T5.3, T5.7, T5.10,
  T5.11, T5.12` — đúng nhóm N5 load/edge.
- `CLAUDE.md` §7 mô tả monorepo NestJS + Prisma + `packages/api|web|shared` **không tồn tại trong thực tế**
  (§0 đã ghi rõ là "chưa được dùng" nhưng §5–§7 vẫn mô tả như kiến trúc thật → dễ gây hiểu nhầm).
- `docs/app-map/` có 1/16 file theo quy định.
- `git status` đang có `AGENTS.md` chưa commit.

**Hệ quả**: đây là **lỗi nghiêm trọng về mặt định vị**, vì toàn bộ luận điểm bán hàng của bạn là
"tôi chứng minh được". Nếu tài liệu tự nói sai về số test, người đánh giá kỹ thuật sẽ mất niềm tin vào
**mọi** con số khác. Freightek chỉ cần nói "họ claim 63 test, thực có 56" là đủ làm loãng điểm mạnh của bạn.

**Phương án** (làm ngay, trước mọi thứ khác):
- Viết 7 test còn thiếu (`T5.x`): concurrent tạo PO, bulk import 10.000 master data, báo cáo trên 1M giao
  dịch, chuỗi phê duyệt 5 cấp, timezone/UTC, Unicode, rate limiting 429, file 50MB, session expiry.
  (Có thể giảm quy mô số liệu cho phù hợp môi trường test nhưng phải giữ **ngữ nghĩa** kiểm thử.)
- Sửa `CLAUDE.md` cho khớp thực tế, hoặc ghi rõ "N5: 7/12 test — đang triển khai" kèm ngày.
- Viết đủ 16 file `docs/app-map/`.
- Thêm bước CI: đếm số test thực tế và **fail nếu lệch** với số trong `CLAUDE.md`.

**Ước lượng**: 1 ngày cho test + sửa tài liệu; 3–5 ngày cho app-map đầy đủ.

---

### T11. Không có tích hợp hệ thống ngoài

**Hiện trạng**: chỉ Resend (email). Không có ngân hàng, hoá đơn điện tử, chữ ký số, kế toán ngoài.

**Hệ quả**: Freightek quảng cáo "tích hợp mượt mà, liên kết mọi ứng dụng". Với doanh nghiệp Việt Nam,
**hoá đơn điện tử** và **sao kê ngân hàng** là hai tích hợp gần như bắt buộc.

**Phương án**:
- **Hoá đơn điện tử**: adapter ở tầng Next.js (`src/app/api/einvoice/`), bảng `einvoice_log`
  (document_id, provider, invoice_no, tax_authority_code, status, raw jsonb, issued_at). Hỗ trợ tối thiểu
  2 nhà cung cấp phổ biến. Gắn vào transition `INV → ISSUED`.
- **Sao kê ngân hàng**: đã có `BANKREC` — bổ sung import CSV/OFX sao kê (nhiều ngân hàng VN xuất được),
  matching tự động theo số tiền + ngày + nội dung. RPC `api_bankrec_suggest(p_period)`.
- **Chữ ký số** cho Audit Pack (xem §6.2).
- Nguyên tắc: mọi tích hợp đi qua adapter ở tầng ứng dụng, **không** gọi HTTP từ Postgres.

**Ước lượng**: 2–3 tuần cho hoá đơn điện tử; 1–2 tuần cho sao kê ngân hàng.

---

### T12. Không có sao lưu / DR / uptime được công bố

**Hiện trạng**: không có tài liệu về backup, khôi phục thảm hoạ, RPO/RTO, giám sát.

**Hệ quả**: với hệ thống tài chính, đây là câu hỏi **đầu tiên** khối IT/CFO hỏi. Freightek tuyên bố
"bảo mật 100%" (dù chỉ là marketing, nhưng họ **có câu trả lời**).

**Phương án**:
- Ghi `docs/deployment.md`: kiến trúc, môi trường, quy trình phát hành, rollback.
- Chính sách backup: Supabase PITR nếu có, hoặc `pg_dump` định kỳ + kiểm tra phục hồi **định kỳ có ghi biên bản**.
- Giám sát: health check cho các RPC trọng yếu (`api_dashboard`, `api_control_summary`), cảnh báo khi lỗi
  hoặc chậm; log có cấu trúc ở tầng Next.js.
- Công bố RPO/RTO mục tiêu và **cách kiểm chứng**.

**Ước lượng**: 3–5 ngày.

---

## 6. PHẦN ĐANG HƠN — TÀI SẢN PHẢI BẢO VỆ

Không được đánh đổi những thứ này để đua feature với Freightek.

### 6.1 Bảng tài sản

| Tài sản | Vì sao Freightek không copy được nhanh |
|---|---|
| SoD enforce ở DB + log vi phạm | Cần thiết kế lại tầng dữ liệu và toàn bộ luồng nghiệp vụ, không phải thêm tính năng |
| Audit trail bất biến | Phải sửa mọi đường ghi dữ liệu; hệ thống 300 khách đang chạy thì gần như không thể retrofit |
| Phân quyền 3 tầng (action × scope × field) | Ảnh hưởng mọi API; retrofit phá vỡ tương thích |
| 3 đường truy vết | Cần chuỗi chứng từ cha–con đầy đủ từ đầu; dữ liệu cũ của họ không có |
| Handoff liên phòng + SLA | Cần mô hình tổ chức và vai trò chuẩn hoá |
| State machine là dữ liệu | Là quyết định kiến trúc, không phải tính năng |
| 56 acceptance test | Văn hoá kỹ thuật, không mua được |
| Tính ngang ngành (23 doc_type cho sản xuất/thương mại/dịch vụ) | Họ bị khoá cứng vào logistics |

### 6.2 Sản phẩm hoá tài sản: "Audit Pack" và "Kiểm soát như một dịch vụ"

Hai hướng khai thác trực tiếp lợi thế:

**Audit Pack** — gói bằng chứng dùng cho kiểm toán nội bộ, kiểm toán độc lập, ngân hàng, nhà đầu tư:
- Kết xuất theo kỳ: `audit_trail` + `sod_check_log` + `document_links` (chuỗi chứng từ) +
  `handoff_records` + `exception_register` + `gl_entries`.
- Kèm manifest có **hash/checksum** để chứng minh tính toàn vẹn, và (tuỳ chọn) chữ ký số.
- RPC `api_audit_pack(p_from, p_to, p_scope)` trả về một file nén có cấu trúc + manifest.
- **Đây là thứ Freightek không thể làm**, vì họ không có dữ liệu để kết xuất.

**Kiểm soát như một dịch vụ (Compliance Layer)** — bán lớp kiểm soát cắm vào ERP sẵn có:
- Đóng gói SoD + audit + trace + handoff + exception thành một dịch vụ độc lập, có API nhận sự kiện từ
  hệ thống khác (Freightek, MISA, Odoo, CargoWise) qua webhook, rồi áp ma trận kiểm soát lên đó.
- Bán cho **CFO / kế toán trưởng / kiểm toán nội bộ**, không bán cho trưởng phòng vận hành.
- Không cần domain knowledge logistics sâu; không đối đầu trực diện; thị trường lớn hơn nhiều.

---

## 7. ĐỊNH VỊ CHIẾN LƯỢC: 3 HƯỚNG

### Hướng A — Compliance Layer (khuyến nghị làm định vị chính)

**Bán gì**: lớp kiểm soát & bằng chứng cho doanh nghiệp đã có ERP.
**Cho ai**: CFO, kế toán trưởng, kiểm toán nội bộ, doanh nghiệp FDI, chuẩn bị IPO/lên sàn, có kiểm toán định kỳ.
**Vì sao thắng**: đây là chỗ ERP-General hơn 11–1; không cần đua 10 năm domain; thị trường ngang ngành.
**Rủi ro**: chu kỳ bán dài (phải thuyết phục cả IT và tài chính); cần chứng minh tích hợp được.

### Hướng B — ERP ngành logistics có kiểm soát (đối đầu trực diện)

**Bán gì**: ERP logistics đầy đủ như Freightek **+ lớp kiểm soát mà họ không có**.
**Cho ai**: doanh nghiệp logistics vừa và lớn, có kiểm toán, nhiều chi nhánh.
**Vì sao có thể thắng**: "Freightek cho bạn chạy nhanh; chúng tôi cho bạn chạy nhanh **và chứng minh được**".
**Điều kiện bắt buộc**: phải làm T1 (shipment), T2 (rate), T3 (lịch tàu/tracking), T4 (multi-tenant).
**Rủi ro cao nhất**: đây là cuộc đua trực diện với đối thủ có 300 khách, 10 năm domain và đội triển khai.

### Hướng C — ERP ngang ngành có kiểm soát (giữ nguyên định vị `CLAUDE.md`)

**Bán gì**: ERP phổ quát cho sản xuất/thương mại/dịch vụ, điểm mạnh là kiểm soát.
**Cho ai**: doanh nghiệp vừa và lớn ngoài logistics.
**Vì sao hợp lý**: đúng với những gì đã xây; 23 doc_type đã phủ 11 luồng; không bị khoá thị trường.
**Rủi ro**: thị trường ERP ngang ngành cạnh tranh với Odoo/ERPNext/MISA — cần định vị rất sắc vào kiểm soát.

### Khuyến nghị tổ hợp

**Định vị chính = A. Demo/uy tín = B (làm vừa đủ T1+T7 để có bản demo ngành). Nền tảng = C.**

Lý do: A cho lợi thế rõ ràng và không phải đua domain; B cho một câu chuyện demo cụ thể, dễ hiểu, và
chứng minh kiến trúc data-driven hoạt động thật; C giữ được tính phổ quát đã cam kết trong `CLAUDE.md`.

---

## 8. KẾ HOẠCH NÂNG CẤP CHI TIẾT

### 8.1 Ưu tiên P0 — làm ngay trong tuần này

| # | Việc | File/hạng mục | Ước lượng | Lý do |
|---|---|---|---|---|
| P0-1 | Viết 7 acceptance test còn thiếu | `tests/acceptance.test.mjs` | 0.5–1 ngày | Tài liệu đang tự nói sai; phá vỡ luận điểm "chứng minh được" |
| P0-2 | Sửa `CLAUDE.md` khớp thực tế + ghi rõ trạng thái N5 | `CLAUDE.md` | 1 giờ | Cùng lý do trên |
| P0-3 | Commit `AGENTS.md` | git | 5 phút | Đang treo ở `git status` |
| P0-4 | Viết `docs/positioning.md` chốt định vị | docs | 2 giờ | Tránh tiêu tán nguồn lực đua feature |
| P0-5 | CI kiểm tra số test khớp tài liệu | `.github/workflows/ci.yml` | 2 giờ | Chống tái phát |

### 8.2 Ưu tiên P1 — 4–6 tuần tới

| # | Việc | Phụ thuộc | Ước lượng |
|---|---|---|---|
| P1-1 | Chart layer (recharts) + 7 widget dashboard + bộ lọc thời gian | — | 1–2 tuần |
| P1-2 | Thực thể SHIPMENT qua config (T1) | — | 2–3 tuần |
| P1-3 | Rate & Charge engine + trang `/pricing` (T2) | P1-2 | 2–3 tuần |
| P1-4 | Danh mục cảng/hãng tàu + timeline tracking (T3 giai đoạn 1) | P1-2 | 1 tuần |
| P1-5 | Viết đủ 16 file `docs/app-map/` | — | 3–5 ngày |
| P1-6 | PWA + bottom nav + Web Push (T8) | — | 1 tuần |

### 8.3 Ưu tiên P2 — 2–4 tháng tới

| # | Việc | Phụ thuộc | Ước lượng |
|---|---|---|---|
| P2-1 | Multi-tenant + RLS theo tenant + provisioning (T4) | — | 4–6 tuần |
| P2-2 | Lưu trữ chứng từ + AI ingestion (T5) | P2-1 nếu SaaS | 4–6 tuần |
| P2-3 | Comment trên chứng từ + task queue (T6 phần 1) | — | 2–3 tuần |
| P2-4 | Audit Pack + manifest hash (6.2) | — | 2 tuần |
| P2-5 | Sao kê ngân hàng + hoá đơn điện tử (T11) | — | 3–4 tuần |
| P2-6 | Tài liệu deploy/backup/DR + giám sát (T12) | — | 3–5 ngày |

### 8.4 Ưu tiên P3 — sau khi có khách trả tiền đầu tiên

| # | Việc | Ước lượng |
|---|---|---|
| P3-1 | Client Portal + Agent Portal (T6 phần 2) | 5–6 tuần |
| P3-2 | Tích hợp API lịch tàu/tracking thật (T3 giai đoạn 2) | 2–3 tuần |
| P3-3 | Billing/subscription + gói dịch vụ (T9) | 2–3 tuần |
| P3-4 | Landing page + Help Center công khai (T9) | 2 tuần |
| P3-5 | Compliance Layer API cho ERP bên ngoài (6.2) | 6–8 tuần |
| P3-6 | Push notification + mobile app native (nếu khách yêu cầu) | 4–6 tuần |

---

## 9. NHỮNG PHẦN NÊN LÀM THÊM

Những việc dưới đây không nằm trong danh sách "đang thua Freightek" nhưng nên làm vì chúng củng cố
chính định vị kiểm soát — tức là làm điểm mạnh mạnh hơn, chứ không phải chạy theo đối thủ.

### 9.1 Kiểm soát nâng cao (mở rộng chính lợi thế)

- **Ma trận SoD theo mức rủi ro**: hiện `sod_matrix` có `HARD`/`SOFT`. Bổ sung ngưỡng giá trị:
  giao dịch dưới X triệu chỉ cần 1 cấp duyệt, trên Y triệu cần 2 cấp, trên Z cần HĐQT.
  Cấu hình trong `state_transitions.conditions` (đã có cơ chế `fn_check_condition`).
- **Phê duyệt đa cấp thật** (`approval_chain`): hiện tại mỗi transition có một `sod_role`. Cần chuỗi
  nhiều cấp có thứ tự, có thể cấu hình theo loại chứng từ + giá trị. Đây là yêu cầu gần như bắt buộc
  với doanh nghiệp lớn.
- **Phát hiện bất thường**: dùng dữ liệu sẵn có để cảnh báo — cùng một người vừa tạo vừa duyệt trong
  khoảng thời gian ngắn ở chứng từ khác; tần suất ngoại lệ tăng bất thường; chứng từ tạo ngoài giờ;
  số tiền lệch khỏi phân phối chuẩn. Đưa vào `/controls` dưới dạng "cảnh báo rủi ro".
- **Uỷ quyền có thời hạn (delegation)**: khi người duyệt vắng, cần uỷ quyền có ghi nhận, có hạn, và
  **không được uỷ quyền cho người vi phạm SoD**. Bảng `delegations` + kiểm tra trong `fn_sod_enforce`.
- **Bất biến có bằng chứng (tamper-evident)**: hiện `fn_block_mutation` chặn UPDATE/DELETE. Nâng lên
  mức mật mã: mỗi bản ghi audit có `prev_hash` + `row_hash` tạo chuỗi hash. Như vậy ngay cả quản trị
  viên database cũng không thể sửa lịch sử mà không bị phát hiện. **Đây là điểm bán rất mạnh cho kiểm toán.**
- **Phân tách nhiệm vụ ở tầng quản trị**: hiện `api_admin_set_role`/`api_admin_set_permission` cho phép
  quản trị viên thay đổi quyền. Cần: mọi thay đổi quyền phải qua quy trình phê duyệt 2 người, và có
  hiệu lực từ thời điểm X (không áp dụng tức thì để tránh lạm dụng).

### 9.2 Kiểm soát dữ liệu

- **Từ điển dữ liệu có cưỡng chế CI**: `data_dictionary` đã có; cần script kiểm tra mọi cột mới phải có
  entry tương ứng, fail CI nếu thiếu (đúng tinh thần P4 Doc-Test Sync trong `CLAUDE.md`).
- **Chất lượng master data**: quy tắc trùng lặp, định dạng mã số thuế, kiểm tra ngân hàng, phát hiện
  nhà cung cấp trùng. Sinh `EXC` tự động khi master data mới vi phạm.
- **Chính sách lưu trữ**: thời hạn lưu chứng từ theo luật kế toán Việt Nam; quy trình lưu trữ lạnh
  (archive) nhưng **không xoá** audit trail.
- **Che dữ liệu cá nhân (PII)**: `fn_mask` đã có; bổ sung quy tắc che cho lương, số tài khoản, CCCD,
  và ghi log mỗi lần **xem** dữ liệu nhạy cảm (không chỉ mỗi lần sửa) — yêu cầu ngày càng phổ biến
  trong kiểm toán.

### 9.3 Vận hành & độ tin cậy

- **Cổng chất lượng trước phát hành**: hiện có `.husky` + `scripts/pre-commit.sh` + CI. Bổ sung: chạy
  toàn bộ 63 test acceptance trên staging trước khi phát hành production; chặn phát hành nếu
  `T3.1–T3.4` không PASS (đúng quy định `CLAUDE.md` §10 P6).
- **Môi trường staging riêng** tách khỏi production, có dữ liệu mẫu.
- **Health check & cảnh báo**: endpoint kiểm tra các RPC trọng yếu; cảnh báo khi lỗi/chậm.
- **Sổ sự cố (incident log)**: mỗi sự cố production ghi lại nguyên nhân gốc + hành động phòng ngừa
  (đúng P7 "Memory as Feedback" trong `CLAUDE.md`).

### 9.4 Tính phổ quát (lợi thế chiến lược dài hạn)

- **Bộ template theo ngành**: đóng gói `doc_types` + `state_transitions` + `permission_matrix` +
  `sod_matrix` + `kpi_catalog` thành template cài được (`industry_templates`): logistics, sản xuất,
  thương mại, dịch vụ, xây dựng. Cài tenant mới = chọn template → seed tự động.
  **Đây là con đường biến kiến trúc data-driven thành lợi thế thương mại thật.**
- **Công cụ thiết kế quy trình cho người dùng**: giao diện quản trị để khách tự thêm loại chứng từ,
  trạng thái, quyền — không cần lập trình. Freightek không làm được vì kiến trúc của họ không data-driven.
- **API mở + webhook**: cho phép hệ thống ngoài đẩy sự kiện vào và nhận thông báo — nền tảng cho
  Hướng A (Compliance Layer).

---

## 10. LỘ TRÌNH & THỨ TỰ THỰC THI

```
TUẦN 1        P0: 7 test thiếu · sửa CLAUDE.md · commit AGENTS.md · positioning.md · CI đếm test
              └─ Kết quả: tài liệu khớp thực tế, luận điểm "chứng minh được" đứng vững

TUẦN 2–3      P1-1 Chart layer + dashboard widget
              └─ Kết quả: demo trông chuyên nghiệp, vá gap rẻ nhất so với Freightek

TUẦN 3–6      P1-2 SHIPMENT qua config        ─┐
TUẦN 5–8      P1-3 Rate & Charge engine        ├─ Bản demo ngành logistics hoàn chỉnh
TUẦN 7–8      P1-4 Cảng/hãng tàu + tracking   ─┘

TUẦN 6–8      P1-5 16 file app-map · P1-6 PWA
              └─ Kết quả: tài liệu đầy đủ + dùng được trên điện thoại

TUẦN 9–14     P2-1 Multi-tenant + RLS + provisioning     ← chặn cứng về thương mại
TUẦN 12–17    P2-2 Lưu trữ chứng từ + AI ingestion
TUẦN 15–17    P2-3 Comment + task queue
TUẦN 16–18    P2-4 Audit Pack + hash · P2-5 hoá đơn điện tử + sao kê · P2-6 deploy/backup/DR

SAU ĐÓ       P3: Client/Agent Portal · API lịch tàu thật · Billing · Landing/Help Center
              · Compliance Layer API · Mobile native
```

**Nguyên tắc thứ tự**:
1. Sửa tính trung thực của tài liệu **trước tiên** — đó là tài sản bán hàng.
2. Việc rẻ và nhìn thấy được (chart, PWA) làm sớm để có demo.
3. Multi-tenant làm **trước** khi có khách thứ hai — càng muộn càng đắt.
4. Không bắt đầu P3 trước khi có khách trả tiền hoặc hợp đồng thử nghiệm có cam kết.

---

## 11. RỦI RO & CẠM BẪY

| # | Rủi ro | Mức | Cách phòng |
|---|---|---|---|
| R1 | Đua danh sách tính năng ngành với Freightek | **Cao** | Bám định vị kiểm soát; chỉ làm T1–T3 ở mức đủ demo |
| R2 | Thêm cột `tenant_id` muộn, khi đã có dữ liệu khách | **Cao** | Làm P2-1 trước khách thứ hai; viết test tenant isolation trước khi migrate |
| R3 | Mở đường đọc bảng cho portal, phá vỡ `006_security.sql` | **Cao** | Portal dùng chung `fn_perm_scope`/`fn_doc_in_scope`; review bắt buộc mọi thay đổi grant |
| R4 | AI nhập liệu ghi thẳng vào chứng từ đã duyệt | **Cao** | AI chỉ tạo `DRAFT`; đánh dấu `ai_extracted` + `confidence` trong audit; người duyệt bắt buộc |
| R5 | Tài liệu/marketing nói quá khả năng (như hiện tại) | **Trung bình–Cao** | CI đếm test; mọi con số trong tài liệu phải sinh được từ dữ liệu |
| R6 | Phụ thuộc API bên thứ ba (hãng tàu, tracking) | Trung bình | Coi tracking là dữ liệu nhập được nhiều nguồn; adapter tách rời; luôn có đường nhập tay |
| R7 | Multi-tenant làm phình `003_config.sql`, khó bảo trì | Trung bình | Dùng `tenant_id NULL = mặc định hệ thống`; tách template theo ngành (§9.4) |
| R8 | Chart layer làm chậm dashboard khi dữ liệu lớn | Trung bình | RPC tổng hợp ở DB (không kéo dữ liệu thô về client); có index; test T5.3 |
| R9 | Bỏ dở giữa đường vì quá nhiều hạng mục | **Cao** | Chỉ cam kết P0+P1 trong quý này; mỗi hạng mục phải map tới 1 test theo `CLAUDE.md` §1.2 |
| R10 | Mất lợi thế vì để lộ toàn bộ thiết kế kiểm soát | Thấp | Cân nhắc: chính việc công khai được cơ chế là điểm bán (khác Freightek chỉ nói suông) |

---

## 12. TIÊU CHÍ NGHIỆM THU CHO TỪNG HẠNG MỤC

Mỗi hạng mục chỉ được coi là xong khi thoả **toàn bộ** điều kiện dưới đây, theo tinh thần `CLAUDE.md` §3
(ĐK1–ĐK8) và §13 (enforcement).

### P0

- [ ] `npm run test:acceptance` báo **63/63**, không có test nào bị skip.
- [ ] CI fail nếu số test thực tế lệch số ghi trong `CLAUDE.md`.
- [ ] `CLAUDE.md` không còn mô tả kiến trúc không tồn tại (NestJS/Prisma/packages) như thể đang dùng.
- [ ] `git status` sạch.
- [ ] `docs/positioning.md` tồn tại, nêu rõ hướng A/B/C và chọn hướng chính.

### P1-1 Chart layer

- [ ] Không thêm thư viện nặng; bundle tăng < 200 KB gzip.
- [ ] Mọi dữ liệu chart lấy từ RPC tổng hợp mới, **không** kéo dữ liệu thô về client.
- [ ] RPC tổng hợp tôn trọng `fn_perm_scope` — người dùng scope BRANCH chỉ thấy số liệu chi nhánh mình.
- [ ] Bộ lọc thời gian áp dụng nhất quán cho mọi widget.
- [ ] Có test khẳng định người dùng không có quyền không đọc được số liệu tổng hợp.

### P1-2 SHIPMENT

- [ ] Thêm **hoàn toàn qua cấu hình** (`003_config.sql` hoặc migration `011`), không sửa `004`/`005` ngoài
      việc bổ sung nhánh xử lý cần thiết cho loại chứng từ mới.
- [ ] SHIPMENT tự động thừa hưởng: state machine, SoD, audit trail, handoff, permission, trace —
      **không viết lại** các cơ chế này.
- [ ] Mã job sinh đúng định dạng cấu hình, không trùng khi chạy song song.
- [ ] `T7.x` mới: cùng user không thể vừa tạo vừa duyệt cùng một SHIPMENT.
- [ ] `api_trace_goods` truy vết được từ SHIPMENT xuống container và lên INV.

### P1-3 Rate engine

- [ ] Rate có hiệu lực theo thời gian; rate hết hạn **không** dùng được để báo giá.
- [ ] Có cảnh báo rate sắp hết hạn qua `email_outbox`.
- [ ] Import hàng loạt có kiểm tra hợp lệ và báo cáo dòng lỗi, không nhập nửa vời.
- [ ] Margin tính theo lô khớp với `api_product_profit` khi cùng tập dữ liệu (kiểm chứng chéo).

### P2-1 Multi-tenant

- [ ] **Mọi** bảng nghiệp vụ có `tenant_id`, không có ngoại lệ.
- [ ] RLS dùng `fn_current_tenant()`, không còn `USING (true)`.
- [ ] Test bắt buộc: user tenant A **không** đọc được bất kỳ dữ liệu nào của tenant B — thử trên bảng,
      trên mọi RPC `api_*`, trên trace, trên export, trên email outbox.
- [ ] Provisioning tenant mới sinh đủ master data, tài khoản, cấu hình theo gói.
- [ ] Không làm giảm tốc độ: RPC trọng yếu vẫn < 500ms trên dữ liệu kiểm thử.

### P2-2 AI ingestion

- [ ] Không có dữ liệu nào do AI tạo mà **không** qua xác nhận của con người.
- [ ] `audit_trail` ghi rõ `ai_extracted=true` và `confidence`.
- [ ] AI không thể gọi được các transition `SUBMIT`/`APPROVE`/`POST` — kiểm tra bằng test.
- [ ] Trích xuất sai lệch master data → sinh `EXC` tự động, không nhập im lặng.
- [ ] Có test khẳng định chứng từ AI tạo vẫn phải qua đầy đủ SoD.

### P2-4 Audit Pack

- [ ] Manifest có hash từng tệp + hash tổng.
- [ ] Chạy lại hai lần trên cùng kỳ dữ liệu bất biến → hash khớp.
- [ ] Sửa một bản ghi (giả lập) → hash lệch và phát hiện được.
- [ ] Kết xuất tôn trọng `fn_doc_in_scope` — người không có quyền không kết xuất được dữ liệu ngoài phạm vi.

### Chung cho mọi hạng mục

- [ ] `npm run typecheck` và `npx next lint` sạch.
- [ ] Mỗi thay đổi map được tới **ít nhất 1 acceptance test** (quy định `CLAUDE.md` §1.2).
- [ ] Cập nhật `docs/app-map/NNN-*.md` tương ứng với `last_verified` mới.
- [ ] Commit ngay khi thay đổi, không dồn (quy định `CLAUDE.md` §1.2).
- [ ] Không vi phạm danh sách FORBIDDEN trong `CLAUDE.md` §1.3.

---

## PHỤ LỤC A — BẢNG TRA NHANH: THUA GÌ, LÀM GÌ

| Thua ở | Mức độ | Phương án | Ưu tiên | Ước lượng |
|---|---|---|---|---|
| Không có thực thể Shipment | Chí mạng | `011_shipment.sql` + config + UI | P1 | 2–3 tuần |
| Không có Rate engine | Cao | `rates` + `charge_codes` + `/pricing` | P1 | 2–3 tuần |
| Không có lịch tàu / tracking | Cao | `carriers`/`ports`/`vessel_schedules`/`tracking_events` | P1 | 1 tuần (+2 nếu API thật) |
| Không multi-tenant | Chí mạng (thương mại) | `tenants` + `tenant_id` mọi bảng + RLS | P2 | 4–6 tuần |
| Không có AI ingestion | Cao | Storage + `/api/ingest` + `ingest_jobs` | P2 | 4–6 tuần |
| Không có portal / chat | Cao | `comments` + Client/Agent Portal | P2–P3 | 6–8 tuần |
| UX không có chart | Trung bình–Cao | recharts + 7 widget + bộ lọc | P1 | 1–2 tuần |
| Không có mobile | Trung bình | PWA + bottom nav + Web Push | P1 | 1 tuần |
| Không có tầng thương mại | Cao | app-map đầy đủ + landing + billing | P2–P3 | 3–4 tuần |
| Test/tài liệu không khớp | Trung bình (uy tín) | 7 test + sửa CLAUDE.md + CI đếm | **P0** | 1 ngày |
| Không tích hợp ngoài | Trung bình | Hoá đơn điện tử + sao kê ngân hàng | P2 | 3–4 tuần |
| Không có backup/DR công bố | Trung bình | `docs/deployment.md` + chính sách + giám sát | P2 | 3–5 ngày |

## PHỤ LỤC B — NHỮNG THỨ KHÔNG NÊN LÀM

1. **Không** viết lại kiến trúc sang NestJS/Prisma như §7 của `CLAUDE.md` mô tả. Kiến trúc
   Postgres-centric hiện tại **mạnh hơn** cho bài toán kiểm soát, và là lợi thế cạnh tranh. Hãy sửa
   tài liệu, đừng sửa hệ thống.
2. **Không** hard-code nghiệp vụ logistics vào `004_engine.sql`. Mọi thứ phải đi qua dữ liệu cấu hình —
   đó chính là điểm khác biệt với Freightek.
3. **Không** mở quyền đọc bảng cho portal, mobile hay tích hợp ngoài. Mọi truy cập đi qua `api_*`.
4. **Không** cho AI ghi thẳng vào chứng từ đã duyệt hoặc gọi transition.
5. **Không** đua số lượng tính năng với Freightek. Mỗi tính năng thêm vào phải củng cố định vị kiểm soát,
   hoặc phục vụ trực tiếp một khách hàng đang trả tiền.
6. **Không** tuyên bố con số trong tài liệu/marketing mà không sinh được từ dữ liệu kiểm chứng được.
7. **Không** trì hoãn multi-tenant tới khi đã có nhiều khách — chi phí migrate tăng theo bình phương
   số bảng và số bản ghi.

---

*Tài liệu này là tài liệu sống. Cập nhật `last_verified` mỗi lần thay đổi đáng kể.*
