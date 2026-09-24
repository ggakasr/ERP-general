-- ERP General — 040 api_bankrec_suggest: date arithmetic
--
-- date - date is an integer (days) in Postgres; the 031/038 body wrapped it in
-- extract(epoch FROM …) → "function pg_catalog.extract(unknown, integer) does not exist"
-- as soon as a BANKREC line had a candidate PMT/RCPT (T20.3). Use the day difference directly.

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
           abs(coalesce(nullif(v_line.data->>'txn_date','')::date, current_date) - d.doc_date) AS day_diff
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
      abs(coalesce(nullif(v_line.data->>'txn_date','')::date, current_date) - d.doc_date)
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

GRANT EXECUTE ON FUNCTION api_bankrec_suggest(uuid) TO authenticated;
