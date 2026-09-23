-- ============================================================
-- 031_bankrec_import.sql — Import & đối chiếu sao kê ngân hàng (WP-H2)
-- Bulk import lines + auto-matching suggestions
-- ============================================================

-- api_bankrec_import: nhập hàng loạt dòng sao kê vào BANKREC
-- Mỗi dòng: { date, description, amount, reference? }
-- amount > 0 = tiền vào (thu), amount < 0 = tiền ra (chi)
CREATE OR REPLACE FUNCTION api_bankrec_import(
  p_document_id  uuid,
  p_lines        jsonb    -- array of {date, description, amount, reference?}
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  IF fn_perm_scope(v_me, 'BANKREC', 'EDIT') = 0 THEN
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

-- api_bankrec_suggest: gợi ý khớp giao dịch cho BANKREC
-- Tìm PMT/RCPT khớp (amount, date gần, nội dung tương tự) cho từng dòng chưa khớp
CREATE OR REPLACE FUNCTION api_bankrec_suggest(
  p_document_id  uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
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

  IF fn_perm_scope(v_me, 'BANKREC', 'VIEW') = 0 THEN
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

-- GRANT EXECUTE
GRANT EXECUTE ON FUNCTION api_bankrec_import(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION api_bankrec_suggest(uuid) TO authenticated;
