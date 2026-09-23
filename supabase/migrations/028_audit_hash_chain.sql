-- WP-G2: Audit trail tamper-evident hash-chain
-- Mỗi bản ghi audit có prev_hash + row_hash tạo chuỗi SHA-256.
-- Admin DB sửa một bản ghi → api_audit_chain_verify() phát hiện.
-- Tương thích ngược: bản ghi cũ (row_hash IS NULL) được bỏ qua khi kiểm tra.

-- ── 1. Thêm cột ──────────────────────────────────────────────────────────────
ALTER TABLE audit_trail
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS row_hash  text;

-- Index để verify nhanh theo id (chỉ dòng đã có hash)
CREATE INDEX IF NOT EXISTS idx_audit_hash_chain ON audit_trail(id) WHERE row_hash IS NOT NULL;

-- ── 2. Cập nhật fn_audit_row() để tính hash-chain ─────────────────────────
-- Thay thế hàm gốc trong 004_engine.sql; giữ nguyên mọi logic nghiệp vụ,
-- chỉ bổ sung phần tính prev_hash / row_hash trước khi INSERT.
--
-- Canonical input = các trường nối bằng chr(31) (ASCII Unit Separator),
-- dùng extract(epoch...) cho timestamp để không phụ thuộc múi giờ session.
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_name    text;
  v_old     jsonb; v_new jsonb; v_rec jsonb;
  v_changed text[];
  v_id      text;
  v_ts      timestamptz;
  v_prev    text;
  v_hash    text;
BEGIN
  SELECT full_name INTO v_name FROM app_users WHERE id = v_user;
  IF TG_OP IN ('UPDATE','DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_new := to_jsonb(NEW); END IF;
  v_rec := coalesce(v_new, v_old);
  v_id := coalesce(v_rec->>'id', v_rec->>'code', v_rec->>'period', v_rec->>'test_code',
                   (v_rec->>'user_id') || ':' || (v_rec->>'role_code'));
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k) INTO v_changed
    FROM jsonb_object_keys(v_new) k
    WHERE v_new->k IS DISTINCT FROM v_old->k AND k NOT IN ('updated_at','version');
    IF v_changed IS NULL THEN RETURN NEW; END IF;
    SELECT jsonb_object_agg(k, v_old->k) INTO v_old FROM unnest(v_changed) k;
    SELECT jsonb_object_agg(k, v_new->k) INTO v_new FROM unnest(v_changed) k;
  END IF;

  -- Hash-chain: serialize một lần/transaction để không có nhánh song song
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain'));

  v_ts := clock_timestamp();

  -- Lấy row_hash của bản ghi cuối làm prev_hash; dùng chuỗi 64 số 0 nếu bảng rỗng
  SELECT coalesce(row_hash, repeat('0', 64))
  INTO   v_prev
  FROM   audit_trail ORDER BY id DESC LIMIT 1;
  IF v_prev IS NULL THEN v_prev := repeat('0', 64); END IF;

  -- row_hash = SHA-256 của chuỗi canonical (prev_hash || chr(31) || các trường)
  v_hash := encode(sha256((
    v_prev                                          || chr(31) ||
    TG_TABLE_NAME                                   || chr(31) ||
    v_id                                            || chr(31) ||
    TG_OP                                           || chr(31) ||
    coalesce(v_old::text, '')                       || chr(31) ||
    coalesce(v_new::text, '')                       || chr(31) ||
    coalesce(array_to_string(v_changed, ','), '')   || chr(31) ||
    coalesce(v_user::text, '')                      || chr(31) ||
    coalesce(v_name, 'SYSTEM')                      || chr(31) ||
    extract(epoch from v_ts)::text
  )::bytea), 'hex');

  INSERT INTO audit_trail (table_name, record_id, action, old_value, new_value, changed_fields,
                           user_id, user_name, created_at, prev_hash, row_hash)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_old, v_new, v_changed,
          v_user, coalesce(v_name, 'SYSTEM'), v_ts, v_prev, v_hash);

  RETURN coalesce(NEW, OLD);
END $$;

-- ── 3. Hàm kiểm tra tính toàn vẹn chuỗi hash ────────────────────────────────
-- Yêu cầu quyền AUDIT_TRAIL VIEW (INTERNAL_AUDITOR, CFO, CEO, SYS_ADMIN).
-- Trả về JSON: ok, total (số dòng có hash), valid, broken_at_id, reason.
CREATE OR REPLACE FUNCTION api_audit_chain_verify(
  p_from timestamptz DEFAULT '-infinity',
  p_to   timestamptz DEFAULT  'infinity'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me         app_users := fn_current_user();
  v_row        record;
  v_expected   text;
  v_prev_hash  text;
  v_prev_id    bigint;
  v_broken     bigint;
  v_reason     text;
  v_total      int := 0;
  v_valid      int := 0;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;
  IF fn_perm_scope(v_me.id, 'AUDIT_TRAIL', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Chỉ kiểm toán viên / quản trị được kiểm tra chuỗi hash');
  END IF;

  FOR v_row IN
    SELECT id, table_name, record_id, action,
           old_value, new_value, changed_fields,
           user_id, user_name, created_at,
           prev_hash, row_hash
    FROM   audit_trail
    WHERE  row_hash IS NOT NULL
      AND  created_at >= p_from
      AND  created_at <  p_to
    ORDER  BY id ASC
  LOOP
    v_total := v_total + 1;

    -- Tái tính row_hash từ dữ liệu đã lưu (cùng công thức với fn_audit_row)
    v_expected := encode(sha256((
      coalesce(v_row.prev_hash, repeat('0', 64))              || chr(31) ||
      v_row.table_name                                         || chr(31) ||
      v_row.record_id                                          || chr(31) ||
      v_row.action                                             || chr(31) ||
      coalesce(v_row.old_value::text, '')                      || chr(31) ||
      coalesce(v_row.new_value::text, '')                      || chr(31) ||
      coalesce(array_to_string(v_row.changed_fields, ','), '') || chr(31) ||
      coalesce(v_row.user_id::text, '')                        || chr(31) ||
      coalesce(v_row.user_name, 'SYSTEM')                      || chr(31) ||
      extract(epoch from v_row.created_at)::text
    )::bytea), 'hex');

    -- Kiểm tra 1: row_hash phải khớp với tính toán lại
    IF v_row.row_hash IS DISTINCT FROM v_expected THEN
      v_broken := v_row.id;
      v_reason := format('row_hash không khớp tại id=%s: expected %s, stored %s',
                         v_row.id, v_expected, v_row.row_hash);
      EXIT;
    END IF;

    -- Kiểm tra 2: prev_hash phải trỏ đúng vào row_hash của bản ghi trước
    IF v_prev_id IS NOT NULL AND v_row.prev_hash IS DISTINCT FROM v_prev_hash THEN
      v_broken := v_row.id;
      v_reason := format('chuỗi hash bị đứt tại id=%s: prev_hash=%s nhưng row_hash trước=%s',
                         v_row.id, v_row.prev_hash, v_prev_hash);
      EXIT;
    END IF;

    v_valid    := v_valid + 1;
    v_prev_id  := v_row.id;
    v_prev_hash := v_row.row_hash;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',          v_broken IS NULL,
    'total',       v_total,
    'valid',       v_valid,
    'broken_at_id', v_broken,
    'reason',      v_reason
  );
END $$;

-- Bảo mật: chỉ EXECUTE, không đọc bảng trực tiếp
REVOKE ALL ON FUNCTION api_audit_chain_verify(timestamptz, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api_audit_chain_verify(timestamptz, timestamptz) TO authenticated;

-- Acceptance criteria WP-G2 (T17.1–T17.3)
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker)
VALUES
  ('T17.1', 'N3_TRACEABILITY', 'api_audit_chain_verify: trả về ok=true trên dữ liệu bất biến sau khi ghi', 'L11', false),
  ('T17.2', 'N3_TRACEABILITY', 'api_audit_chain_verify: phát hiện bản ghi audit bị giả mạo (row_hash sai)', 'L11', false),
  ('T17.3', 'N3_TRACEABILITY', 'Mỗi bản ghi audit: prev_hash bằng row_hash của bản ghi liền trước', 'L11', false)
ON CONFLICT (test_code) DO NOTHING;
