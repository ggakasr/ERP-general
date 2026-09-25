# Hướng dẫn Bot CSKH — Demo & Đăng ký dùng thật

> **Phiên bản**: WP-K7 (2026-09-25)  
> **Đối tượng**: chủ dự án, quản trị viên, đội ngũ CSKH  
> **Yêu cầu hệ thống**: ERP General đã cài đặt (xem `docs/deployment.md`)

---

## Phần A — Demo (10 phút)

### A1. Chuẩn bị

Mật khẩu mọi tài khoản demo: `Demo@123`.

| Vai trò | Tài khoản | Mục đích |
|---|---|---|
| Khách hàng (ẩn danh) | (không cần đăng nhập) | Ô chat trên trang chủ `/` hoặc `/help`: tra đơn, xác thực, khiếu nại |
| NV CSKH | `cskh` | Nhận phiên chuyển người, trả lời, đóng phiên |
| TP CSKH | `cskh.tp` | Quản lý FAQ/tri thức, phân công, xem dashboard |
| Lãnh đạo | `ceo` | Xem dashboard hoạt động bot, chi phí AI |

> **Bắt buộc trước khi demo** (kể cả mock): đặt `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API →
> `service_role`) trong `.env.local` / Vercel Environment Variables, và đã đẩy migration 041–044.
> Hai biến `NEXT_PUBLIC_SUPABASE_*` là chưa đủ — route `/api/cskh/*` chạy phía server bằng service role.

Bot mặc định chạy chế độ **mock** (không cần API key, phản hồi xác định). Để dùng Claude thật:
đặt `CSKH_LLM_PROVIDER=claude` và `ANTHROPIC_API_KEY=sk-ant-xxx` trong `.env.local`, khởi động lại.

### A2. Kịch bản demo — Khách hỏi bot

1. Mở **trang chủ `/`** (hoặc `/help`) ở cửa sổ ẩn danh — không đăng nhập — bấm bong bóng chat góc phải dưới.
   (Portal khách hàng `/portal` cũng có bong bóng chat, nhưng dữ liệu mẫu chưa có tài khoản PORTAL_CUSTOMER.)
2. Bot hiển thị lời chào (cấu hình trong `/customer-service/bot` tab Cấu hình).
3. Gõ **"Tôi muốn tra đơn hàng SO-202608-00001"** → bot gọi tool `tra_cuu_don_hang`,
   trả về trạng thái + ngày giao (trường công khai). Thông tin nhạy cảm (SĐT, địa chỉ, giá trị)
   bị ẩn — chưa xác thực (R2).
4. Gõ **"SĐT của tôi là 024 3444 666"** (SĐT của Công ty CP Nội thất Hoàng Gia — chủ đơn SO-202608-00001) → bot gọi `xac_thuc_khach`, khớp → hiện thêm
   tên khách, SĐT, địa chỉ, giá trị đơn.
5. Gõ **"Tôi muốn khiếu nại hàng bị lỗi"** → bot gọi `de_xuat_handoff`, tạo TICKET
   tự động, chuyển phiên sang trạng thái **chờ nhân viên**.

### A3. Kịch bản demo — Nhân viên nhận phiên

6. **Chuyển sang `cskh`** → CSKH → Bot CSKH → tab **Phiên chờ**.
7. Bấm **Nhận phiên** → phiên chuyển sang trạng thái `human_serving`.
8. Đọc lịch sử hội thoại (kể cả phần bot đã trả lời).
9. Gõ phản hồi → khách thấy câu trả lời ngay trong bong bóng chat.
10. Bấm **Đóng phiên** → khách được hỏi CSAT (1–5 sao).

### A4. Kịch bản demo — TP CSKH quản lý tri thức

11. **Chuyển sang `cskh.tp`** → CSKH → Bot CSKH → tab **Tri thức**.
12. Bấm **Thêm bài viết** → nhập tiêu đề + nội dung FAQ → lưu (trạng thái DRAFT).
13. Vào chứng từ KB_ARTICLE vừa tạo → **Gửi duyệt** (DRAFT → SUBMITTED).
14. **Chuyển sang `cskh.tp`** (hoặc người duyệt khác) → **Đăng** (SUBMITTED → PUBLISHED).
    - Nếu cùng người soạn bấm Đăng → **SoD chặn** (người soạn ≠ người đăng).
15. Bot chỉ đọc bài viết PUBLISHED — thử hỏi bot nội dung vừa đăng.

### A5. Kịch bản demo — Lãnh đạo xem dashboard

16. **Chuyển sang `ceo`** → CSKH → Bot CSKH → tab **Tổng quan**.
17. Xem KPI: tổng phiên, tỉ lệ bot tự giải quyết, CSAT, thời gian phản hồi.
18. Biểu đồ: phiên theo kênh, CSAT, lý do chuyển người, phiên theo ngày.
19. Bảng chi phí AI (chỉ CS_MANAGER/CEO/CFO/COO mới thấy): nhà cung cấp, model, token, chi phí.

### A6. Gọi bằng giọng nói ngay trên web (miễn phí)

1. Mở trang chủ `/` bằng **Chrome hoặc Edge** (Edge có giọng Việt tự nhiên hơn) → bấm bong bóng chat → nút **📞 Gọi**.
2. Lần đầu trình duyệt hỏi quyền micro → **Cho phép**. Bot chào, thanh gọi hiện thời lượng + trạng thái (Đang nghe / Đang xử lý / Đang trả lời).
3. Nói tự nhiên, ví dụ "tra đơn SO hai không hai sáu không tám gạch không không không không một".
   Mẹo: đọc mã đơn dễ sai — có thể gõ mã vào ô chat trong lúc đang gọi, bot vẫn đọc câu trả lời.
4. Nói **"cho tôi gặp nhân viên"** / "nói chuyện với người thật" → chuyển ngay (quy tắc R5, không phụ thuộc AI), tạo TICKET.
5. Nhân viên (`cskh`) → Bot CSKH → Phiên chờ → **Nhận phiên** → khách nghe "Nhân viên đã tiếp nhận cuộc gọi".
   Nhân viên **gõ** trả lời → khách **nghe** câu đó đọc lên; khách nói → nhân viên thấy chữ trong lịch sử phiên (~5 giây).
6. Bấm **Kết thúc** bất cứ lúc nào; không giới hạn thời lượng. Đóng khung chat cũng kết thúc cuộc gọi.

Giới hạn: nhận giọng + đọc giọng dùng Web Speech API của trình duyệt (Chrome gửi âm thanh tới Google để nhận dạng).
Firefox không hỗ trợ. Nhân viên chưa nói bằng giọng thật (cần WebRTC) — đây là gọi AI trên web, **không thay tổng đài**.

### A7. Voice qua API / tổng đài (khung, chưa nối xong)

Khung voice hoạt động với mock adapter (không cần API key). Để test thật:
- STT: `DEEPGRAM_API_KEY` (Deepgram)
- TTS: `OPENAI_API_KEY` (OpenAI) hoặc `ELEVENLABS_API_KEY` (ElevenLabs)
- Tổng đài: Vapi webhook `/api/cskh/vapi` (cần `VAPI_SECRET`)

Demo mock: gọi `POST /api/cskh/voice/start` → nhận greeting audio (WAV im lặng 0.25s) + session_id.

---

## Phần B — Đăng ký dùng thật

### B1. Nhà cung cấp LLM

Bot hỗ trợ 3 adapter: **Claude** (mặc định), **OpenAI-compatible** (DeepSeek, Gemini, OpenAI), **Mock** (miễn phí, test).

| Nhà cung cấp | Đăng ký | Biến môi trường | Chi phí ước tính / 1.000 phiên |
|---|---|---|---|
| **Anthropic (Claude)** | [console.anthropic.com](https://console.anthropic.com) → API Keys | `CSKH_LLM_PROVIDER=claude`<br>`ANTHROPIC_API_KEY=sk-ant-xxx` | ~$2–5 (Haiku) / ~$8–15 (Sonnet) |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) → API Keys | `CSKH_LLM_PROVIDER=openai-compat`<br>`CSKH_OPENAI_API_KEY=sk-xxx`<br>`CSKH_OPENAI_BASE_URL=https://api.deepseek.com/v1`<br>`CSKH_LLM_MODEL=deepseek-chat` | ~$0.5–2 |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) → API Keys | `CSKH_LLM_PROVIDER=openai-compat`<br>`CSKH_OPENAI_API_KEY=xxx`<br>`CSKH_OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`<br>`CSKH_LLM_MODEL=gemini-2.0-flash` | ~$0.5–3 |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) → API Keys | `CSKH_LLM_PROVIDER=openai-compat`<br>`CSKH_OPENAI_API_KEY=sk-xxx`<br>`CSKH_OPENAI_BASE_URL=https://api.openai.com/v1`<br>`CSKH_LLM_MODEL=gpt-4o-mini` | ~$1–5 |
| **Mock** | (không cần) | `CSKH_LLM_PROVIDER=mock` | $0 |

> **Model**: ưu tiên ô *Model* ở tab Cấu hình (`/customer-service/bot`) → biến `CSKH_LLM_MODEL` → mặc định của adapter
> (`claude-sonnet-4-20250514` / `gpt-4o-mini`). Ô Model để `mock` nghĩa là "chưa đặt".
> Giá trị cũ `openai` vẫn được chấp nhận như bí danh của `openai-compat`.

> **Lưu ý**: API key chỉ đặt ở biến môi trường server (`.env.local` hoặc Vercel Environment Variables).
> Không lưu trong database, không trả về trình duyệt.

**Cách đặt trên Vercel**: Settings → Environment Variables → thêm từng biến cho Production/Preview.

### B2. Voice (STT / TTS / Tổng đài)

| Thành phần | Nhà cung cấp | Đăng ký | Biến môi trường | Ghi chú |
|---|---|---|---|---|
| **STT** (giọng → văn bản) | Deepgram | [deepgram.com](https://deepgram.com) → Console → API Keys | `CSKH_STT_PROVIDER=deepgram`<br>`DEEPGRAM_API_KEY=xxx` | Model `nova-3`, hỗ trợ tiếng Việt |
| **TTS** (văn bản → giọng) | OpenAI | [platform.openai.com](https://platform.openai.com) | `CSKH_TTS_PROVIDER=openai`<br>`OPENAI_API_KEY=xxx` | Model `gpt-4o-mini-tts`, voice `alloy` |
| **TTS** (alt) | ElevenLabs | [elevenlabs.io](https://elevenlabs.io) → Profile → API Key | `CSKH_TTS_PROVIDER=elevenlabs`<br>`ELEVENLABS_API_KEY=xxx` | Voice `Vy` (tiếng Việt), model `eleven_multilingual_v2` |
| **Tổng đài** | Vapi | [vapi.ai](https://vapi.ai) → Dashboard | `VAPI_SECRET=xxx` | Webhook: `https://your-domain/api/cskh/vapi` |
| **Tổng đài** (alt) | Twilio | [twilio.com](https://www.twilio.com) | (chưa cấu hình) | Adapter sẵn nhưng chưa nối — cần custom |

> **Số tổng đài Việt Nam**: Vapi hỗ trợ mua số +84 trực tiếp; Twilio cần đăng ký qua đại lý VN.
> Chi phí: ~$1–5/tháng/số + phí phút gọi.

### B3. Thông báo

| Kênh | Cấu hình | Biến môi trường |
|---|---|---|
| **Web Push** | Đã tích hợp sẵn (WP-B2) | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| **Email** | Resend (WP-H3) | `RESEND_API_KEY`, `RESEND_FROM` |
| **In-app** | Tự động qua `fn_notify` | (không cần thêm) |

### B4. Checklist go-live

- [ ] **LLM provider**: đặt `CSKH_LLM_PROVIDER` + API key → test bằng cách chat thử trên Portal
- [ ] **Giới hạn chi phí**: đặt spending limit trên dashboard nhà cung cấp LLM (Anthropic: Usage Limits; OpenAI: Billing → Limits)
- [ ] **Rate limit**: route `/api/cskh/chat` đã có giới hạn 10 request/phút/IP — điều chỉnh trong code nếu cần
- [ ] **Chính sách dữ liệu khách**: thông tin nhạy cảm (SĐT, địa chỉ, giá trị đơn) chỉ trả khi đã xác thực (R2) — kiểm bằng SQL, không chỉ prompt
- [ ] **Tri thức ban đầu**: soạn FAQ, quy trình xử lý phổ biến → tạo KB_ARTICLE, duyệt PUBLISHED
- [ ] **Đội ngũ CS**: tạo tài khoản CS_AGENT, CS_MANAGER → test nhận phiên, trả lời, đóng
- [ ] **Bot config**: vào `/customer-service/bot` → tab Cấu hình → điều chỉnh lời chào, system prompt, bật/tắt voice
- [ ] **Voice** (tùy chọn): đặt STT/TTS keys → test `/api/cskh/voice/start`
- [ ] **Tổng đài** (tùy chọn): đăng ký Vapi → đặt `VAPI_SECRET` → cấu hình webhook
- [ ] **Monitoring**: xem dashboard tổng quan (`ceo`/`cskh.tp`) → theo dõi tỉ lệ bot tự giải quyết, CSAT, chi phí

### B5. Kiến trúc tổng quan

```
Khách hàng                    Nhân viên CSKH
    │                              │
    ▼                              ▼
┌──────────┐              ┌───────────────┐
│ Bong bóng│              │ /customer-    │
│ chat     │              │ service/bot   │
│ (Portal/ │              │ (Inbox/KB/    │
│  landing)│              │  Config/Stats)│
└────┬─────┘              └──────┬────────┘
     │ POST /api/cskh/chat       │ api_cskh_staff_*
     ▼                           ▼
┌──────────────────────────────────────┐
│          Next.js API Routes          │
│  /api/cskh/{chat,poll,csat,voice/*}  │
│  (service_role → Supabase)           │
└────────────┬─────────────────────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
┌─────────┐   ┌────────────┐
│ LLM     │   │ PostgreSQL │
│ Adapter │   │ api_cskh_* │
│ (Claude/│   │ (session,  │
│  OpenAI/│   │  message,  │
│  Mock)  │   │  tool SQL) │
└─────────┘   └────────────┘
```

---

## Phần C — FAQ kỹ thuật

**Q: Bot có thể phê duyệt chứng từ không?**
A: Không. Bot là actor hệ thống (`system-cskh-bot@erp.local`) với vai trò CS_AGENT.
Chỉ được đọc trường công khai của đơn hàng và tạo TICKET khi chuyển người.
Không bao giờ gọi SUBMIT/APPROVE/POST hay transition tài chính nào. Test T25.7 kiểm tra điều này.

**Q: Dữ liệu nhạy cảm có an toàn không?**
A: Có — kiểm bằng code SQL (R2), không chỉ dựa prompt. Hàm `api_cskh_tra_don` chỉ trả SĐT/địa chỉ/giá trị
khi đơn nằm trong danh sách `verified_orders` của phiên (đã xác thực mã đơn + SĐT khớp). Test T25.4 kiểm tra.

**Q: Tri thức FAQ có cần duyệt không?**
A: Có — KB_ARTICLE đi qua state machine DRAFT → SUBMITTED → PUBLISHED. Người soạn ≠ người đăng (SoD).
Bot chỉ đọc bản PUBLISHED. Test T25.1 kiểm tra.

**Q: Khách tenant A có thấy đơn tenant B không?**
A: Không — mọi hàm `api_cskh_*` lọc theo `tenant_id`. Bảng CSKH có RLS. Test T25.2, T25.8 kiểm tra.

**Q: Tôi muốn đổi nhà cung cấp LLM?**
A: Đổi biến `CSKH_LLM_PROVIDER` + key tương ứng, khởi động lại. Không cần sửa code.
