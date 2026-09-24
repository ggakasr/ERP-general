-- ERP General — 037 Fix regressions introduced by 015_multitenant / 028_audit_hash_chain
--
-- 1. tenant_id DEFAULT: 015 dropped the constant default on business tables, so every older
--    code path that INSERTs without tenant_id (MDC effects → partners/products, HIRE → employees,
--    budget_usage, …) failed with a NOT NULL violation (T1.15, T4.3, T4.8, …).
--    New default = fn_current_tenant(): the caller's own tenant, never a hard-coded constant.
--    Without an auth context it is NULL → NOT NULL still forces system/seed code to be explicit.
--
-- 2. api_create_document: 015 re-declared it for tenant isolation but dropped the 004 logic
--    (handoff completion on parent chain, create comment, PR/QUOT → ORDERED, TICKET SLA +
--    auto-assign T1.13, EXC → affected-document link T1.6/T3.10, auto-title) and changed the
--    error code VALIDATION → ERROR (T1.4). Restored 004 body + 015 tenant filters.
--
-- 3. Audit hash-chain (ĐK4, T17.x):
--    a) text::bytea parses backslashes as escapes → any audited JSON containing '\' (e.g. "\n")
--       aborted the business transaction ("invalid input syntax for type bytea"). Use convert_to().
--       Historical rows contain no backslash, so their hashes are unchanged.
--    b) Hashing lived inside fn_audit_row(), so (i) direct INSERTs into audit_trail (034/035) were
--       written unhashed and (ii) re-applying 004's fn_audit_row (scripts/db.mjs functions) silently
--       turned hashing off. Hashing now happens in a BEFORE INSERT trigger on audit_trail itself;
--       the id is (re)drawn after the chain lock so chain order == id order under concurrency.
--    c) api_audit_chain_verify: a hashed row that follows legacy unhashed rows is a new chain segment
--       (prev_hash = 64 zeros) — this is exactly what 028's fn_audit_row wrote; accept it instead of
--       reporting a break. Existing audit rows are NOT modified (audit trail is immutable).

-- ============================================================
-- 1. tenant_id defaults
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','departments','app_users','partners','products','warehouses',
    'boms','employees','handoff_records','notifications','budget_usage',
    'ownership_matrix','shadow_it_register','email_outbox',
    'documents','fiscal_periods','doc_sequences','stock_moves',
    'containers','shipment_charges','tracking_events'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id') THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT fn_current_tenant()', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 2. api_create_document — 004 behaviour + 015 tenant isolation
-- ============================================================
CREATE OR REPLACE FUNCTION api_create_document(p_doc_type text, p_header jsonb DEFAULT '{}'::jsonb,
                                               p_lines jsonb DEFAULT NULL,
                                               p_parent_id uuid DEFAULT NULL,
                                               p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_dt doc_types; v_parent documents; v_rule doc_child_rules; v_doc documents; v_err text;
  v_total numeric; v_agent uuid; v_hours int; v_affected documents; h jsonb;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập hoặc tài khoản bị khóa'); END IF;
  h := coalesce(p_header, '{}'::jsonb);
  SELECT * INTO v_dt FROM doc_types WHERE code = p_doc_type;
  IF NOT FOUND THEN RETURN fn_fail('INVALID', 'Loại chứng từ không hợp lệ'); END IF;

  -- T5.6 idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_doc FROM documents WHERE idempotency_key = p_idempotency_key AND tenant_id = v_me.tenant_id;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status, 'duplicate', true);
    END IF;
  END IF;

  IF fn_perm_scope(v_me.id, p_doc_type, 'CREATE') = 0 THEN
    RETURN fn_fail('FORBIDDEN', format('Bạn không có quyền tạo %s', v_dt.name));
  END IF;
  IF p_doc_type IN ('PAYROLL','ACCESS_REVIEW') THEN
    RETURN fn_fail('INVALID', 'Chứng từ này được tạo bằng chức năng riêng');
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM documents WHERE id = p_parent_id AND tenant_id = v_me.tenant_id;
    IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ gốc'); END IF;
    SELECT * INTO v_rule FROM doc_child_rules WHERE parent_type = v_parent.doc_type AND child_type = p_doc_type;
    IF NOT FOUND THEN
      RETURN fn_fail('INVALID', format('Không thể lập %s từ %s', p_doc_type, v_parent.doc_type));
    END IF;
    IF NOT v_parent.status = ANY(v_rule.parent_statuses) THEN
      RETURN fn_fail('INVALID_TRANSITION', format('%s đang ở trạng thái %s — chưa thể lập %s', v_parent.number, v_parent.status, v_dt.name));
    END IF;
    IF NOT fn_doc_in_scope(v_me.id, v_parent, v_parent.doc_type, 'VIEW') THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền truy cập chứng từ gốc');
    END IF;
    IF v_dt.create_sod_role IS NOT NULL THEN
      v_err := fn_sod_enforce(v_parent.id, v_me.id, v_dt.create_sod_role, 'create_' || lower(p_doc_type));
      IF v_err IS NOT NULL THEN RETURN fn_fail('SOD_VIOLATION', v_err); END IF;
    END IF;
  ELSIF p_doc_type IN ('GRN','SINV','PMT','DN','INV','RCPT') THEN
    RETURN fn_fail('INVALID', format('%s phải được lập từ chứng từ gốc', v_dt.name));
  END IF;

  BEGIN
    INSERT INTO documents (doc_type, number, status, title, branch_id, department_id, cost_center_id,
                           partner_id, warehouse_id, to_warehouse_id, product_id, employee_id,
                           doc_date, due_date, amount, data, created_by, idempotency_key, tenant_id)
    VALUES (p_doc_type, fn_next_number(p_doc_type), v_dt.initial_status,
            coalesce(nullif(h->>'title', ''), v_parent.title),
            v_me.branch_id, v_me.department_id,
            coalesce(nullif(h->>'cost_center_id', '')::uuid, v_parent.cost_center_id, v_me.department_id),
            coalesce(nullif(h->>'partner_id', '')::uuid, v_parent.partner_id),
            coalesce(nullif(h->>'warehouse_id', '')::uuid, v_parent.warehouse_id),
            nullif(h->>'to_warehouse_id', '')::uuid,
            nullif(h->>'product_id', '')::uuid,
            nullif(h->>'employee_id', '')::uuid,
            coalesce(nullif(h->>'doc_date', '')::date, (fn_now())::date),
            nullif(h->>'due_date', '')::date,
            coalesce(nullif(h->>'amount', '')::numeric, 0),
            coalesce(h->'data', '{}'::jsonb),
            v_me.id, p_idempotency_key, v_me.tenant_id)
    RETURNING * INTO v_doc;

    IF v_parent.id IS NOT NULL THEN
      INSERT INTO document_links (parent_id, child_id, link_type) VALUES (v_parent.id, v_doc.id, 'SOURCE');
    END IF;

    PERFORM fn_validate_header(v_doc, v_parent);
    v_total := fn_build_lines(v_doc, v_parent, p_lines);
    IF p_doc_type NOT IN ('PMT','RCPT','ASSET','HIRE','TICKET','EXC','MDC') THEN
      UPDATE documents SET amount = v_total WHERE id = v_doc.id RETURNING * INTO v_doc;
    END IF;

    -- completion of pending handoffs on the parent chain (e.g. PR APPROVED → BUYER)
    IF v_parent.id IS NOT NULL THEN
      UPDATE handoff_records hr SET status = 'COMPLETED', to_user_id = v_me.id, to_department_id = v_me.department_id, completed_at = fn_now()
      WHERE hr.status = 'INITIATED' AND hr.tenant_id = v_me.tenant_id AND (
        hr.document_id = v_parent.id
        OR (hr.to_role = ANY(fn_user_role_codes(v_me.id)) AND hr.document_id IN (
              SELECT child_id FROM document_links WHERE parent_id = v_parent.id AND child_id <> v_doc.id)));
    END IF;

    PERFORM fn_record_action(v_doc.id, 'create', NULL, v_doc.status, v_me.id, v_dt.create_sod_role, nullif(h->>'comment', ''));
    PERFORM fn_after_status_change(v_doc, v_me.id);

    -- type-specific hooks
    IF p_doc_type = 'PO' AND v_parent.doc_type = 'PR' AND v_parent.status = 'APPROVED' THEN
      PERFORM fn_system_set_status(v_parent.id, 'ORDERED', v_me.id, 'Đã lập ' || v_doc.number);
    ELSIF p_doc_type = 'SO' AND v_parent.doc_type = 'QUOT' THEN
      PERFORM fn_system_set_status(v_parent.id, 'ORDERED', v_me.id, 'Đã lập ' || v_doc.number);
    ELSIF p_doc_type = 'TICKET' THEN
      v_hours := CASE coalesce(v_doc.data->>'priority', 'MEDIUM') WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 24 WHEN 'LOW' THEN 72 ELSE 48 END;
      UPDATE documents SET title = coalesce(title, data->>'subject'),
        due_date = (fn_now() + make_interval(hours => v_hours))::date,
        data = data || jsonb_build_object('priority', coalesce(data->>'priority', 'MEDIUM'), 'sla_hours', v_hours,
                                          'sla_due_at', fn_now() + make_interval(hours => v_hours))
      WHERE id = v_doc.id;
      -- T1.13 auto-assign: CS agent of the same tenant, same branch first, fewest open tickets
      SELECT u.id INTO v_agent
      FROM app_users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'CS_AGENT'
      WHERE u.status = 'ACTIVE' AND u.tenant_id = v_me.tenant_id
      ORDER BY (u.branch_id = v_doc.branch_id) DESC,
               (SELECT count(*) FROM documents t WHERE t.doc_type = 'TICKET' AND t.owner_id = u.id AND t.status NOT IN ('RESOLVED','CLOSED')),
               u.employee_code
      LIMIT 1;
      IF v_agent IS NOT NULL THEN
        UPDATE documents SET owner_id = v_agent WHERE id = v_doc.id;
        PERFORM fn_system_set_status(v_doc.id, 'ASSIGNED', v_me.id,
          'Tự động phân công cho ' || (SELECT full_name FROM app_users WHERE id = v_agent) || ' (ít ticket mở nhất)');
      END IF;
    ELSIF p_doc_type = 'EXC' AND nullif(v_doc.data->>'affected_document_id', '') IS NOT NULL THEN
      SELECT * INTO v_affected FROM documents
      WHERE id = (v_doc.data->>'affected_document_id')::uuid AND tenant_id = v_me.tenant_id;
      IF v_affected.id IS NULL THEN RAISE EXCEPTION 'Chứng từ bị ảnh hưởng không tồn tại'; END IF;
      INSERT INTO document_links (parent_id, child_id, link_type) VALUES (v_affected.id, v_doc.id, 'EXCEPTION');
      UPDATE documents SET data = data || jsonb_build_object('affected_document_number', v_affected.number) WHERE id = v_doc.id;
    ELSIF p_doc_type IN ('ASSET','HIRE','MDC','EXC') AND v_doc.title IS NULL THEN
      UPDATE documents SET title = coalesce(data->>'name', data->>'full_name', data->>'description', data->>'subject') WHERE id = v_doc.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN fn_fail('VALIDATION', SQLERRM);
  END;

  SELECT * INTO v_doc FROM documents WHERE id = v_doc.id;
  RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status);
END $$;

-- ============================================================
-- 3. Audit hash-chain
-- ============================================================
-- Canonical hash input — single definition shared by the trigger and the verifier.
CREATE OR REPLACE FUNCTION fn_audit_hash(p_prev text, p_table text, p_record text, p_action text,
                                         p_old jsonb, p_new jsonb, p_changed text[], p_user uuid,
                                         p_user_name text, p_ts timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(
    coalesce(p_prev, repeat('0', 64))                 || chr(31) ||
    coalesce(p_table, '')                             || chr(31) ||
    coalesce(p_record, '')                            || chr(31) ||
    coalesce(p_action, '')                            || chr(31) ||
    coalesce(p_old::text, '')                         || chr(31) ||
    coalesce(p_new::text, '')                         || chr(31) ||
    coalesce(array_to_string(p_changed, ','), '')     || chr(31) ||
    coalesce(p_user::text, '')                        || chr(31) ||
    coalesce(p_user_name, 'SYSTEM')                   || chr(31) ||
    extract(epoch from p_ts)::text, 'UTF8')), 'hex')
$$;

-- Every row written to audit_trail gets chained, whoever inserts it.
-- A row that arrives with row_hash already set is stored as-is (api_audit_chain_verify checks it).
CREATE OR REPLACE FUNCTION fn_audit_chain_hash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.row_hash IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain'));
  -- draw the id after taking the lock so that chain order == id order
  NEW.id := nextval(pg_get_serial_sequence('public.audit_trail', 'id'));
  NEW.created_at := coalesce(NEW.created_at, clock_timestamp());
  NEW.user_name := coalesce(NEW.user_name, 'SYSTEM');
  SELECT row_hash INTO NEW.prev_hash FROM audit_trail WHERE row_hash IS NOT NULL ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := coalesce(NEW.prev_hash, repeat('0', 64));
  NEW.row_hash := fn_audit_hash(NEW.prev_hash, NEW.table_name, NEW.record_id, NEW.action, NEW.old_value,
                                NEW.new_value, NEW.changed_fields, NEW.user_id, NEW.user_name, NEW.created_at);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_chain_hash ON audit_trail;
CREATE TRIGGER trg_audit_chain_hash BEFORE INSERT ON audit_trail
  FOR EACH ROW EXECUTE FUNCTION fn_audit_chain_hash();

-- fn_audit_row: back to the plain 004 row capture; hashing is done by trg_audit_chain_hash.
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text;
  v_old jsonb; v_new jsonb; v_rec jsonb;
  v_changed text[];
  v_id text;
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
  INSERT INTO audit_trail (table_name, record_id, action, old_value, new_value, changed_fields, user_id, user_name, created_at)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_old, v_new, v_changed, v_user, coalesce(v_name, 'SYSTEM'), clock_timestamp());
  RETURN coalesce(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION api_audit_chain_verify(
  p_from timestamptz DEFAULT '-infinity',
  p_to   timestamptz DEFAULT  'infinity'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me        app_users := fn_current_user();
  v_row       record;
  v_expected  text;
  v_link      text;
  v_prev_hash text;
  v_prev_id   bigint;
  v_broken    bigint;
  v_reason    text;
  v_total     int := 0;
  v_valid     int := 0;
  v_segments  int := 0;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;
  IF fn_perm_scope(v_me.id, 'AUDIT_TRAIL', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Chỉ kiểm toán viên / quản trị được kiểm tra chuỗi hash');
  END IF;

  FOR v_row IN
    SELECT id, table_name, record_id, action, old_value, new_value, changed_fields,
           user_id, user_name, created_at, prev_hash, row_hash
    FROM   audit_trail
    WHERE  row_hash IS NOT NULL AND created_at >= p_from AND created_at < p_to
    ORDER  BY id ASC
  LOOP
    v_total := v_total + 1;

    -- 1: row_hash must match the recomputed hash of the stored fields
    v_expected := fn_audit_hash(v_row.prev_hash, v_row.table_name, v_row.record_id, v_row.action,
                                v_row.old_value, v_row.new_value, v_row.changed_fields,
                                v_row.user_id, v_row.user_name, v_row.created_at);
    IF v_row.row_hash IS DISTINCT FROM v_expected THEN
      v_broken := v_row.id;
      v_reason := format('row_hash không khớp tại id=%s: expected %s, stored %s', v_row.id, v_expected, v_row.row_hash);
      EXIT;
    END IF;

    -- 2: prev_hash must point to the previous hashed row; after legacy (unhashed) rows a new
    --    segment starts from 64 zeros
    IF v_prev_id IS NOT NULL THEN
      v_link := CASE WHEN EXISTS (SELECT 1 FROM audit_trail a
                                  WHERE a.id > v_prev_id AND a.id < v_row.id AND a.row_hash IS NULL)
                     THEN repeat('0', 64) ELSE v_prev_hash END;
      IF v_row.prev_hash IS DISTINCT FROM v_link THEN
        v_broken := v_row.id;
        v_reason := format('chuỗi hash bị đứt tại id=%s: prev_hash=%s nhưng mong đợi %s',
                           v_row.id, v_row.prev_hash, v_link);
        EXIT;
      END IF;
      IF v_link <> v_prev_hash THEN v_segments := v_segments + 1; END IF;
    END IF;

    v_valid     := v_valid + 1;
    v_prev_id   := v_row.id;
    v_prev_hash := v_row.row_hash;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',           v_broken IS NULL,
    'total',        v_total,
    'valid',        v_valid,
    'legacy_gaps',  v_segments,
    'broken_at_id', v_broken,
    'reason',       v_reason
  );
END $$;

REVOKE ALL ON FUNCTION fn_audit_hash(text, text, text, text, jsonb, jsonb, text[], uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_audit_chain_hash() FROM PUBLIC;
REVOKE ALL ON FUNCTION api_audit_chain_verify(timestamptz, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api_audit_chain_verify(timestamptz, timestamptz) TO authenticated;

-- ============================================================
-- 4. RLS policies (read_tenant, …) call fn_current_tenant() as `authenticated`.
--    scripts/db.mjs `functions` revokes EXECUTE on every non-api_* function, which made every
--    direct SELECT under RLS fail with "permission denied for function fn_current_tenant" (T6.5).
-- ============================================================
GRANT EXECUTE ON FUNCTION fn_current_tenant() TO authenticated;
