# Deployment, Backup & Disaster Recovery

> Tài liệu vận hành hệ thống ERP-General.
> Stack: Next.js 14 (Vercel) + Supabase (Postgres 16 + Auth) + GitHub Actions CI.

---

## 1. Kiến trúc triển khai

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│   Browser     │────▶│   Vercel      │────▶│   Supabase           │
│   (User)      │     │   Next.js 14  │     │   Postgres 16 + Auth │
└──────────────┘     │   App Router  │     │   + RLS + api_* RPC  │
                     └──────────────┘     └──────────────────────┘
```

- **Frontend + API routes**: Vercel (auto-deploy từ `master`).
- **Database + Auth**: Supabase project (managed Postgres 16, Row-Level Security).
- **Logic nghiệp vụ**: 100% trong PostgreSQL — state machine, SoD, GL, kho, audit.
- **CI**: GitHub Actions — typecheck, lint, acceptance tests (63 tests, gồm SoD blocker T3.1–T3.4).

### Environments

| Env | Vercel | Supabase | Mục đích |
|-----|--------|----------|----------|
| `development` | `vercel dev` local | Local hoặc Supabase dev project | Dev/debug |
| `staging` | Preview deployment (PR) | Staging Supabase project | QA, acceptance test |
| `production` | Production deployment | Production Supabase project | Live |

---

## 2. Quy trình phát hành (Release)

### 2.1 Release flow

```
feature branch → PR → CI (typecheck + lint + acceptance tests)
                        │
                  T3.1–T3.4 PASS? ──NO──▶ ❌ Block merge
                        │ YES
                  merge to master → Vercel auto-deploy production
```

### 2.2 Checklist trước khi merge

- [ ] `npm run typecheck` — không lỗi
- [ ] `npx next lint` — không warning/error
- [ ] `npm run test:acceptance` — 63 tests PASS (đặc biệt T3.1–T3.4)
- [ ] Migration mới (nếu có) đã test trên staging
- [ ] PR description map tới acceptance test (T*.*)

### 2.3 Database migration

```bash
# Push migration mới lên Supabase
node scripts/db.mjs push

# Chỉ reload functions (không thay đổi schema)
node scripts/db.mjs functions

# Kiểm tra migration status
node scripts/db.mjs status
```

**Quy tắc migration**:
- File migration đánh số tuần tự: `NNN_feature.sql` (hiện tại: 002–031).
- Migration chỉ thêm, không sửa/xóa migration cũ.
- Thay đổi function: dùng `CREATE OR REPLACE` → `node scripts/db.mjs functions`.
- Thay đổi schema (bảng, index, constraint): tạo migration mới.

---

## 3. Rollback

### 3.1 Rollback Vercel (frontend)

```bash
# Revert về deployment trước
vercel rollback          # interactive — chọn deployment
vercel rollback <url>    # rollback cụ thể
```

Hoặc: Vercel Dashboard → Deployments → chọn deployment cũ → Promote to Production.

### 3.2 Rollback database

**Cách 1: Revert migration** (ưu tiên)
- Viết migration mới `NNN_rollback_*.sql` để undo thay đổi.
- `node scripts/db.mjs push` để apply.

**Cách 2: Point-in-time Recovery** (khi cần khôi phục data)
- Supabase Pro: PITR khôi phục đến bất kỳ thời điểm nào trong 7 ngày.
- Supabase Dashboard → Settings → Database → Point in Time Recovery.
- **Lưu ý**: PITR khôi phục toàn bộ database, không chọn bảng.

**Cách 3: Restore từ backup** (xem §4)

---

## 4. Backup & Disaster Recovery

### 4.1 Chính sách backup

| Phương pháp | Tần suất | Lưu trữ | Mục đích |
|-------------|----------|---------|----------|
| Supabase auto backup | Hàng ngày (Pro) | 7 ngày | Khôi phục nhanh |
| Supabase PITR | Liên tục (Pro) | 7 ngày | Khôi phục chính xác thời điểm |
| `pg_dump` thủ công | Trước mỗi migration lớn | ≥30 ngày | Archive, compliance |
| `pg_dump` cron | Hàng ngày 02:00 UTC | 30 ngày rolling | Backup bổ sung |

### 4.2 pg_dump thủ công

```bash
# Backup toàn bộ (schema + data)
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --file="backup_$(date +%Y%m%d_%H%M%S).dump" \
  --verbose

# Backup chỉ schema
pg_dump "$SUPABASE_DB_URL" --schema-only --file="schema_$(date +%Y%m%d).sql"

# Restore
pg_restore --dbname="$TARGET_DB_URL" --clean --if-exists backup_20260923.dump
```

### 4.3 Kiểm tra phục hồi (DR drill)

**Tần suất**: Hàng quý (mỗi 3 tháng).

**Quy trình**:
1. Tạo Supabase project mới (hoặc dùng staging).
2. Restore backup mới nhất: `pg_restore --dbname="$STAGING_DB_URL" latest.dump`.
3. Chạy `npm run test:acceptance` trên staging — tất cả 63 tests phải PASS.
4. Kiểm tra thủ công: đăng nhập, tạo PO, kiểm tra SoD.
5. Ghi biên bản DR drill:
   - Ngày thực hiện
   - Backup file sử dụng (tên, kích thước, ngày tạo)
   - Thời gian restore (phút)
   - Kết quả acceptance tests
   - Ghi chú / sự cố

**Template biên bản**:
```
DR Drill — [YYYY-MM-DD]
Backup: backup_YYYYMMDD_HHMMSS.dump (XX MB)
Restore target: staging project [ID]
Restore time: XX phút
Acceptance tests: XX/63 PASSED
T3.1–T3.4: PASS / FAIL
Ghi chú: ...
Người thực hiện: ...
```

### 4.4 RPO / RTO

| Chỉ số | Mục tiêu | Cách đạt |
|--------|----------|----------|
| **RPO** (Recovery Point Objective) | ≤ 1 giờ | Supabase PITR (liên tục) + pg_dump hàng ngày |
| **RTO** (Recovery Time Objective) | ≤ 4 giờ | Restore PITR < 30 phút; deploy Vercel < 5 phút; acceptance test < 15 phút |

**Cách kiểm chứng RPO/RTO**:
- **RPO**: kiểm tra timestamp backup/PITR gần nhất — phải ≤ 1 giờ trước hiện tại.
- **RTO**: đo thời gian từ lúc bắt đầu restore đến lúc acceptance tests PASS trên staging — phải ≤ 4 giờ.
- Ghi vào biên bản DR drill mỗi quý.

---

## 5. Health Check

### 5.1 RPC `api_health_check()`

Health check trọng yếu — kiểm tra:
- Database connectivity
- Bảng core tồn tại (tenants, app_users, documents, document_lines, gl_entries)
- State machine config có dữ liệu
- SoD matrix có dữ liệu
- Migration version hiện tại

Gọi qua Supabase RPC:
```javascript
const { data } = await supabase.rpc('api_health_check')
// { ok: true, version: '031', tables: {...}, checks: {...} }
```

### 5.2 Vercel health

Vercel tự cung cấp health check cho deployment. Ngoài ra:
- `/api/gate` — endpoint hiện có, kiểm tra Supabase connection.

### 5.3 Monitoring

- **Vercel**: Analytics + Functions logs (tự động).
- **Supabase**: Dashboard → Logs (Postgres, Auth, API).
- **Uptime**: Thiết lập uptime monitor (e.g. UptimeRobot, Better Stack) ping `/api/gate` mỗi 5 phút.

---

## 6. CI Gate — SoD Blocker

GitHub Actions CI tự động chặn merge khi **T3.1–T3.4 fail**.

Quy trình:
1. CI chạy toàn bộ acceptance tests.
2. Parse kết quả: nếu bất kỳ T3.1, T3.2, T3.3, T3.4 FAIL → CI exit 1.
3. GitHub branch protection rule trên `master` require CI pass → PR không merge được.

Xem `.github/workflows/ci.yml` cho chi tiết implementation.

---

## 7. Danh sách liên hệ & Escalation

| Vai trò | Trách nhiệm | Thời gian phản hồi |
|---------|-------------|-------------------|
| Dev on-call | Xử lý incident P1/P2 | < 30 phút |
| DBA | Database issues, restore | < 1 giờ |
| Vercel admin | Deployment issues, rollback | < 15 phút |
| Supabase admin | Auth, RLS, infrastructure | < 1 giờ |

**Escalation path**: Dev on-call → Tech Lead → CTO.
