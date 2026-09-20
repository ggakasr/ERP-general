---
covers: docs/
last_verified: 2026-09-20
ttl_days: 90
status: ĐÃ CHỐT (2026-09-20) — nguồn: docs/phan-tich-canh-tranh-freightek.md §7
---

# Định vị chiến lược ERP-General

> **Tóm tắt một dòng**: ERP-General bán *lớp kiểm soát & bằng chứng*, không đua danh sách tính năng ngành.
> Mỗi quyết định xây/không xây đều phải trả lời: *"Điều này củng cố định vị kiểm soát hay chỉ đuổi theo Freightek?"*

---

## 1. Tổ hợp định vị đã chốt: A chính · B demo · C nền tảng

### Hướng A — Compliance Layer (định vị chính)

**Bán gì**: lớp kiểm soát & bằng chứng kiểm toán cho doanh nghiệp đã có ERP.

**Cho ai**: CFO, kế toán trưởng, kiểm toán nội bộ, doanh nghiệp FDI, đang chuẩn bị IPO/lên sàn, có đợt kiểm toán định kỳ.

**Câu bán hàng**:
> *"Bạn chứng minh được với kiểm toán viên rằng không ai vừa tạo vừa duyệt cùng một chứng từ không?"*
> ERP-General cho bạn câu trả lời có bằng chứng — log từng vi phạm, audit trail bất biến, gói Audit Pack có hash.

**Vì sao thắng trên trục này**: ERP-General có 11/11 hạng mục kiểm soát (SoD, audit trail, trace, handoff, exception…); đối thủ chỉ có ~1. Đây là khe hở cấu trúc — đối thủ không thể retrofit mà không viết lại toàn bộ.

**Điều không cần làm ở hướng A**: không cần thực thể Shipment, không cần lịch tàu, không cần app native — chỉ cần API sạch đủ để tích hợp với ERP sẵn có của khách.

**Rủi ro chính**: chu kỳ bán dài (cần thuyết phục cả IT lẫn tài chính). Cần ít nhất 1 case study có số liệu.

---

### Hướng B — ERP logistics có kiểm soát (demo & uy tín)

**Bán gì**: ERP logistics đầy đủ như Freightek **cộng** lớp kiểm soát mà họ không có.

**Cho ai**: doanh nghiệp logistics vừa và lớn, có kiểm toán định kỳ, nhiều chi nhánh, ít nhất một bộ phận tài chính độc lập.

**Câu bán hàng**:
> *"Freightek cho bạn chạy nhanh. Chúng tôi cho bạn chạy nhanh và chứng minh được."*

**Vai trò trong tổ hợp**: đây là **bản demo** — dùng để tạo ấn tượng trực quan và chứng minh kiến trúc data-driven thực sự hoạt động. Một bản demo logistics sống (có SHIPMENT thật, có chart thật, có trace thật) nói nhiều hơn bất kỳ slide nào.

**Điều kiện tối thiểu để demo được**: WP-C1 (SHIPMENT), WP-B1 (chart), WP-J1 (design system). Không cần làm tất cả tính năng Freightek.

**Điều không làm ở hướng B**: không đua số lượng tính năng; không cần 500+ hãng tàu; không cần app native trước khi có khách trả tiền.

---

### Hướng C — ERP ngang ngành có kiểm soát (nền tảng)

**Bán gì**: ERP phổ quát cho sản xuất/thương mại/dịch vụ, điểm khác biệt là kiểm soát nội bộ có thể chứng minh.

**Cho ai**: doanh nghiệp vừa và lớn ngoài ngành logistics (sản xuất, thương mại, dịch vụ chuyên nghiệp).

**Vai trò trong tổ hợp**: đây là **nền tảng kỹ thuật** — 23 doc_type, 11 luồng nghiệp vụ, kiến trúc data-driven tổng quát. Mọi tính năng xây cho hướng A và B đều là tập con của C. Giữ hướng C tránh bị khoá cứng vào logistics.

**Điều không làm ở hướng C**: không cần bộ tính năng ngành dọc riêng trừ khi có khách trả tiền từ ngành đó yêu cầu.

---

## 2. Khách mục tiêu ưu tiên

| Cấp độ | Đối tượng | Trigger mua | Cách tiếp cận |
|---|---|---|---|
| **Ưu tiên 1** | CFO / kế toán trưởng SME logistics | Sắp kiểm toán, lo vi phạm SoD | Demo Audit Pack — chạy thật, có hash |
| **Ưu tiên 2** | Giám đốc logistics muốn nâng cấp | Đang dùng Excel, cần số liệu thật | Demo SHIPMENT + chart + trace |
| **Sau khi có 2–3 khách** | Doanh nghiệp sản xuất/thương mại | Audit, IPO/lên sàn chuẩn bị | Positioning hướng C |

---

## 3. Những điều KHÔNG làm (để không tiêu tán nguồn lực)

1. **Không** đua danh sách tính năng ngành với Freightek. Mỗi tính năng thêm phải trả lời: *"Điều này củng cố định vị kiểm soát hay chỉ thu hẹp khoảng cách tính năng?"*
2. **Không** tuyên bố con số không chứng minh được. Mọi con số trong tài liệu/demo phải sinh từ dữ liệu thật.
3. **Không** viết lại sang NestJS/Prisma. Kiến trúc Postgres-centric là lợi thế — mọi quy tắc kiểm soát không thể bypass qua devtools.
4. **Không** bắt đầu nhóm P3 (billing, portal, landing page) trước khi có khách trả tiền hoặc hợp đồng thử nghiệm.
5. **Không** mở đường đọc bảng cho portal/tích hợp ngoài — mọi truy cập phải qua `api_*`.

---

## 4. Thông điệp lõi cho từng đối tượng

**Cho CFO/kế toán**:
> *"ERP-General là hệ thống duy nhất bạn có thể mở ra cho kiểm toán viên và nói: đây là log đầy đủ, không ai có thể sửa, hash kiểm chứng được."*

**Cho giám đốc vận hành logistics**:
> *"Bạn thấy Freightek. Chúng tôi có tất cả những gì họ có cho vận hành, cộng thêm lớp kiểm soát mà họ không bao giờ xây được."*

**Cho IT/CTO**:
> *"Logic kiểm soát nằm ở database, không ở frontend — không thể bypass bằng devtools hay API trực tiếp. 63 acceptance test chạy được trong transaction, không phải chỉ mô phỏng."*

---

## 5. Chỉ số thành công của định vị

- Câu hỏi demo đầu tiên từ khách là về kiểm soát/audit, không phải tính năng ngành → định vị đúng.
- Khách dùng Audit Pack trước khi dùng trang Operations → hướng A đang hoạt động.
- Mỗi tính năng mới thêm vào đều map được tới ít nhất 1 test trong acceptance suite → tránh scope creep.

---

*Nguồn: `docs/phan-tich-canh-tranh-freightek.md` §7. Cập nhật khi có khách đầu tiên hoặc quyết định thay đổi định vị.*
