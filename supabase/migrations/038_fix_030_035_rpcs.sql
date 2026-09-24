-- ERP General — 038 Fix broken RPCs from 030–035 (never worked since they were added)
--
-- 1. api_log_einvoice / api_get_einvoice_logs (030), api_bankrec_import / api_bankrec_suggest (031):
--    passed the whole app_users record to fn_perm_scope(uuid, text, text)
--    → "function fn_perm_scope(record, text, unknown) does not exist" (T19.x, T20.x).
--    Also add SET search_path (SECURITY DEFINER functions must pin it).
-- 2. api_health_check (032): read the non-existent tables doc_type_config / audit_log / permissions and
--    supabase_migrations.schema_migrations; this project records migrations in public._migrations (T21.x).
-- 3. api_admin_change_plan (035) requires TENANT EDIT at COMPANY scope but no role had it → SYS_ADMIN (T24.4).
-- 4. fn_feature_enabled / fn_feature_limit: EXECUTE for authenticated (granted by 035, lost when
--    scripts/db.mjs `functions` revoked every non-api_* function) (T24.3).

-- ============================================================
-- 1. 030 / 031: fn_perm_scope(v_me.id, …)
-- ============================================================
CREATE OR REPLACE FUNCTION api_log_einvoice(
  p_document_id  uuid,
  p_provider     text,
  p_direction    text DEFAULT 'ISSUE',
  p_status       text DEFAULT 'PENDING',
  p_invoice_series text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_invoice_code   text DEFAULT NULL,
  p_lookup_code    text DEFAULT NULL,
  p_issued_date    date DEFAULT NULL,
  p_request        jsonb DEFAULT NULL,
  p_response       jsonb DEFAULT NULL,
  p_error          text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    record;
  v_doc   record;
  v_tid   uuid := fn_current_tenant();
  v_log   uuid;
BEGIN
  SELECT * INTO v_me FROM app_users WHERE id = auth.uid() AND tenant_id = v_tid;
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id AND tenant_id = v_tid;
  IF v_doc IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;

  -- only INV / SINV can have e-invoices
  IF v_doc.doc_type NOT IN ('INV','SINV') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID', 'message', 'Chỉ hoá đơn (INV/SINV) mới phát hành HĐĐT');
  END IF;

  -- check permission: EXECUTE on doc_type
  IF fn_perm_scope(v_me.id, v_doc.doc_type, 'EXECUTE') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  INSERT INTO einvoice_log (tenant_id, document_id, provider, direction, status,
    invoice_series, invoice_number, invoice_code, lookup_code, issued_date,
    request_payload, response_payload, error_message, created_by)
  VALUES (v_tid, p_document_id, p_provider, p_direction, p_status,
    p_invoice_series, p_invoice_number, p_invoice_code, p_lookup_code, p_issued_date,
    p_request, p_response, p_error, v_me.id)
  RETURNING id INTO v_log;

  RETURN jsonb_build_object('ok', true, 'id', v_log);
END;
$$;

CREATE OR REPLACE FUNCTION api_get_einvoice_logs(
  p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_me  record;
  v_doc record;
  v_tid uuid := fn_current_tenant();
BEGIN
  SELECT * INTO v_me FROM app_users WHERE id = auth.uid() AND tenant_id = v_tid;
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id AND tenant_id = v_tid;
  IF v_doc IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;

  IF fn_perm_scope(v_me.id, v_doc.doc_type, 'VIEW') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  RETURN jsonb_build_object('ok', true, 'logs', (
    SELECT coalesce(jsonb_agg(row_to_json(l)::jsonb ORDER BY l.created_at DESC), '[]'::jsonb)
    FROM einvoice_log l
    WHERE l.document_id = p_document_id AND l.tenant_id = v_tid
  ));
END;
$$;

CREATE OR REPLACE FUNCTION api_bankrec_import(
  p_document_id  uuid,
  p_lines        jsonb    -- array of {date, description, amount, reference?}
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     record;
  v_doc    record;
  v_tid    uuid := fn_current_tenant();
  v_line   jsonb;
  v_no     int;
  v_amt    numeric;
  v_total  numeric := 0;
  v_count  int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_max_no int;
BEGIN
  SELECT * INTO v_me FROM app_users WHERE id = auth.uid() AND tenant_id = v_tid;
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id AND tenant_id = v_tid;
  IF v_doc IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;

  IF v_doc.doc_type <> 'BANKREC' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID', 'message', 'Chỉ BANKREC mới import sao kê');
  END IF;
  IF v_doc.status <> 'DRAFT' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID', 'message', 'BANKREC phải ở DRAFT để import');
  END IF;

  IF fn_perm_scope(v_me.id, 'BANKREC', 'EDIT') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID', 'message', 'Danh sách dòng rỗng');
  END IF;

  -- Get current max line_no
  SELECT coalesce(max(line_no), 0) INTO v_max_no FROM document_lines WHERE document_id = p_document_id;

  v_no := v_max_no;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_no := v_no + 1;
    v_amt := coalesce(nullif(v_line->>'amount', '')::numeric, 0);

    IF v_amt = 0 THEN
      v_errors := v_errors || jsonb_build_object('line', v_no, 'error', 'Số tiền = 0');
      CONTINUE;
    END IF;

    INSERT INTO document_lines (document_id, line_no, description, amount, quantity, unit_price, data)
    VALUES (
      p_document_id,
      v_no,
      coalesce(v_line->>'description', ''),
      v_amt,
      1,
      v_amt,
      jsonb_build_object(
        'txn_date', coalesce(v_line->>'date', ''),
        'reference', coalesce(v_line->>'reference', '')
      )
    );
    v_total := v_total + v_amt;
    v_count := v_count + 1;
  END LOOP;

  -- Update document amount
  UPDATE documents SET amount = coalesce(amount, 0) + v_total WHERE id = p_document_id;

  RETURN jsonb_build_object(
    'ok', true,
    'imported', v_count,
    'total_amount', v_total,
    'errors', v_errors
  );
END;
$$;

CREATE OR REPLACE FUNCTION api_bankrec_suggest(
  p_document_id  uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_me     record;
  v_doc    record;
  v_tid    uuid := fn_current_tenant();
  v_line   record;
  v_match  record;
  v_suggestions jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_me FROM app_users WHERE id = auth.uid() AND tenant_id = v_tid;
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id AND tenant_id = v_tid;
  IF v_doc IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;

  IF v_doc.doc_type <> 'BANKREC' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID');
  END IF;

  IF fn_perm_scope(v_me.id, 'BANKREC', 'VIEW') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  FOR v_line IN
    SELECT * FROM document_lines
    WHERE document_id = p_document_id
      AND (data->>'matched_document_id') IS NULL
    ORDER BY line_no
  LOOP
    -- Find best matching PMT (negative=payment) or RCPT (positive=receipt)
    SELECT d.id AS doc_id, d.number AS doc_number, d.doc_type, d.amount AS doc_amount,
           d.title, d.partner_id,
           CASE
             WHEN v_line.description ILIKE '%' || d.number || '%' THEN 100
             WHEN d.title IS NOT NULL AND v_line.description ILIKE '%' || d.title || '%' THEN 50
             ELSE 0
           END AS desc_score,
           abs(extract(epoch FROM (
             coalesce(nullif(v_line.data->>'txn_date','')::date, current_date) - d.doc_date
           ))) / 86400.0 AS day_diff
    INTO v_match
    FROM documents d
    WHERE d.tenant_id = v_tid
      AND ((v_line.amount < 0 AND d.doc_type = 'PMT' AND d.status IN ('PAID','AUDITED') AND d.amount = -v_line.amount)
        OR (v_line.amount > 0 AND d.doc_type = 'RCPT' AND d.status IN ('RECEIVED','AUDITED') AND d.amount = v_line.amount))
      AND NOT EXISTS (
        SELECT 1 FROM document_lines x
        JOIN documents xd ON xd.id = x.document_id
        WHERE xd.doc_type = 'BANKREC'
          AND xd.tenant_id = v_tid
          AND x.id <> v_line.id
          AND x.data->>'matched_document_id' = d.id::text
      )
    ORDER BY
      CASE WHEN v_line.description ILIKE '%' || d.number || '%' THEN 0 ELSE 1 END,
      abs(extract(epoch FROM (coalesce(nullif(v_line.data->>'txn_date','')::date, current_date) - d.doc_date)))
    LIMIT 1;

    IF v_match.doc_id IS NOT NULL THEN
      v_suggestions := v_suggestions || jsonb_build_object(
        'line_id', v_line.id,
        'line_no', v_line.line_no,
        'line_amount', v_line.amount,
        'line_description', v_line.description,
        'match_document_id', v_match.doc_id,
        'match_number', v_match.doc_number,
        'match_type', v_match.doc_type,
        'match_amount', v_match.doc_amount,
        'match_title', v_match.title,
        'confidence', CASE
          WHEN v_match.desc_score >= 100 THEN 'HIGH'
          WHEN v_match.desc_score >= 50 OR v_match.day_diff < 3 THEN 'MEDIUM'
          ELSE 'LOW'
        END
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'suggestions', v_suggestions,
    'total_unmatched', (
      SELECT count(*) FROM document_lines
      WHERE document_id = p_document_id
        AND (data->>'matched_document_id') IS NULL
    ),
    'total_lines', (
      SELECT count(*) FROM document_lines WHERE document_id = p_document_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION api_log_einvoice(uuid, text, text, text, text, text, text, text, date, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION api_get_einvoice_logs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api_bankrec_import(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION api_bankrec_suggest(uuid) TO authenticated;

-- ============================================================
-- 2. api_health_check — real table names + public._migrations
-- ============================================================
CREATE OR REPLACE FUNCTION api_health_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_tables  jsonb := '{}'::jsonb;
  v_checks  jsonb;
  v_tbl     text;
  v_cnt     bigint;
  v_mig     text;
BEGIN
  -- 1. Core tables exist and have rows (-1 = missing)
  FOREACH v_tbl IN ARRAY ARRAY['tenants','app_users','documents','document_lines','gl_entries',
                                'audit_trail','state_transitions','sod_matrix','roles','permission_matrix']
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*)::bigint FROM public.%I', v_tbl) INTO v_cnt;
    EXCEPTION WHEN undefined_table THEN
      v_cnt := -1;
    END;
    v_tables := v_tables || jsonb_build_object(v_tbl, v_cnt);
  END LOOP;

  -- 2. Business configuration present
  v_checks := jsonb_build_object(
    'state_transitions', EXISTS (SELECT 1 FROM state_transitions),
    'sod_matrix',        EXISTS (SELECT 1 FROM sod_matrix),
    'doc_types',         EXISTS (SELECT 1 FROM doc_types),
    'roles',             EXISTS (SELECT 1 FROM roles),
    'permission_matrix', EXISTS (SELECT 1 FROM permission_matrix)
  );

  -- 3. Latest applied migration (scripts/db.mjs records them in public._migrations)
  IF to_regclass('public._migrations') IS NOT NULL THEN
    EXECUTE 'SELECT max(name) FROM public._migrations' INTO v_mig;
  END IF;

  RETURN jsonb_build_object(
    'ok',      true,
    'ts',      now(),
    'version', coalesce(v_mig, 'unknown'),
    'tables',  v_tables,
    'checks',  v_checks
  );
END $$;

GRANT EXECUTE ON FUNCTION api_health_check() TO authenticated, anon;

-- ============================================================
-- 3. TENANT EDIT (COMPANY) for SYS_ADMIN — required by api_admin_change_plan
-- ============================================================
INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions, status)
SELECT 'SYS_ADMIN', 'TENANT', a, 'COMPANY', '{}'::jsonb, 'ACTIVE'
FROM unnest(ARRAY['VIEW','EDIT']) a
WHERE NOT EXISTS (SELECT 1 FROM permission_matrix WHERE role_code = 'SYS_ADMIN' AND resource = 'TENANT' AND action = a);

-- ============================================================
-- 4. Feature-flag helpers callable by the web app
-- ============================================================
GRANT EXECUTE ON FUNCTION fn_feature_enabled(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_feature_limit(text) TO authenticated;
