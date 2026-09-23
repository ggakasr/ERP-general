-- WP-G1: Audit Pack — kết xuất bộ bằng chứng kiểm toán + manifest hash
-- api_audit_pack(p_from, p_to, p_scope) tôn trọng fn_doc_in_scope + fn_current_tenant.
-- hash từng section = sha256(nội dung JSON canonical), hash tổng = sha256(chuỗi nối 6 hash con).

CREATE OR REPLACE FUNCTION api_audit_pack(
  p_from  timestamptz,
  p_to    timestamptz,
  p_scope text DEFAULT NULL   -- NULL = mọi doc_type; hoặc mã cụ thể 'PO','SHIPMENT'…
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     app_users := fn_current_user();
  v_tenant uuid      := fn_current_tenant();

  v_doc_ids  uuid[];   -- document IDs trong phạm vi user có thể VIEW

  -- Section data (JSON arrays — canonical, deterministic)
  v_audit   jsonb;
  v_sod     jsonb;
  v_links   jsonb;
  v_handoff jsonb;
  v_exc     jsonb;
  v_gl      jsonb;

  -- Per-section SHA-256 hashes (hex)
  v_h_audit   text;
  v_h_sod     text;
  v_h_links   text;
  v_h_handoff text;
  v_h_exc     text;
  v_h_gl      text;
  v_h_total   text;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;
  IF p_from IS NULL OR p_to IS NULL THEN
    RETURN fn_fail('BAD_INPUT', 'p_from và p_to không được NULL');
  END IF;
  IF p_from > p_to THEN
    RETURN fn_fail('BAD_INPUT', 'p_from phải ≤ p_to');
  END IF;

  -- ── Step 1: accessible document IDs ──────────────────────────────────────
  -- Lọc theo tenant + khoảng thời gian + doc_type (nếu có) + quyền VIEW.
  -- Dùng created_at của documents để xác định "chứng từ nào nằm trong kỳ".
  SELECT array_agg(d.id ORDER BY d.id)
  INTO   v_doc_ids
  FROM   documents d
  WHERE  d.tenant_id = v_tenant
    AND  d.created_at >= p_from
    AND  d.created_at <  p_to + interval '1 second'
    AND  (p_scope IS NULL OR d.doc_type = p_scope)
    AND  fn_doc_in_scope(v_me.id, d, d.doc_type, 'VIEW');

  v_doc_ids := coalesce(v_doc_ids, ARRAY[]::uuid[]);

  -- ── Section 1: audit_trail ────────────────────────────────────────────────
  -- Bao gồm mọi bản ghi audit trong khoảng thời gian liên quan đến docs có quyền,
  -- cộng thêm audit của document_lines thuộc các docs đó.
  SELECT coalesce(
    jsonb_agg(to_jsonb(a) ORDER BY a.created_at, a.id),
    '[]'::jsonb
  )
  INTO v_audit
  FROM audit_trail a
  WHERE a.tenant_id = v_tenant
    AND a.created_at >= p_from
    AND a.created_at <  p_to + interval '1 second'
    AND (
      -- bản ghi trực tiếp của document
      (a.table_name = 'documents' AND a.record_id = ANY(v_doc_ids::text[]))
      OR
      -- bản ghi của document_lines thuộc doc có quyền
      (a.table_name = 'document_lines' AND EXISTS (
        SELECT 1 FROM document_lines dl
        WHERE  dl.id::text = a.record_id
          AND  dl.document_id = ANY(v_doc_ids)
      ))
    );

  -- ── Section 2: sod_check_log ──────────────────────────────────────────────
  SELECT coalesce(
    jsonb_agg(to_jsonb(s) ORDER BY s.checked_at, s.id),
    '[]'::jsonb
  )
  INTO v_sod
  FROM sod_check_log s
  WHERE s.tenant_id = v_tenant
    AND s.checked_at >= p_from
    AND s.checked_at <  p_to + interval '1 second'
    AND s.document_id = ANY(v_doc_ids);

  -- ── Section 3: document_links ─────────────────────────────────────────────
  -- Không có tenant_id riêng; cô lập qua parent/child thuộc v_doc_ids.
  SELECT coalesce(
    jsonb_agg(to_jsonb(l) ORDER BY l.created_at, l.id),
    '[]'::jsonb
  )
  INTO v_links
  FROM document_links l
  WHERE (l.parent_id = ANY(v_doc_ids) OR l.child_id = ANY(v_doc_ids));

  -- ── Section 4: handoff_records ────────────────────────────────────────────
  SELECT coalesce(
    jsonb_agg(to_jsonb(h) ORDER BY h.initiated_at, h.id),
    '[]'::jsonb
  )
  INTO v_handoff
  FROM handoff_records h
  WHERE h.tenant_id = v_tenant
    AND h.initiated_at >= p_from
    AND h.initiated_at <  p_to + interval '1 second'
    AND h.document_id = ANY(v_doc_ids);

  -- ── Section 5: exception_register ────────────────────────────────────────
  -- Exceptions = documents có doc_type = 'EXC', liên kết đến docs có quyền
  -- HOẶC bản thân nằm trong v_doc_ids (khi user có quyền xem EXC trực tiếp).
  SELECT coalesce(
    jsonb_agg(to_jsonb(e) ORDER BY e.created_at, e.id),
    '[]'::jsonb
  )
  INTO v_exc
  FROM documents e
  WHERE e.tenant_id = v_tenant
    AND e.doc_type = 'EXC'
    AND e.created_at >= p_from
    AND e.created_at <  p_to + interval '1 second'
    AND (
      e.id = ANY(v_doc_ids)
      OR EXISTS (
        SELECT 1 FROM document_links l
        WHERE  (l.parent_id = e.id AND l.child_id = ANY(v_doc_ids))
            OR (l.child_id  = e.id AND l.parent_id = ANY(v_doc_ids))
      )
    );

  -- ── Section 6: gl_entries ─────────────────────────────────────────────────
  SELECT coalesce(
    jsonb_agg(to_jsonb(g) ORDER BY g.posting_date, g.id),
    '[]'::jsonb
  )
  INTO v_gl
  FROM gl_entries g
  WHERE g.tenant_id = v_tenant
    AND g.posting_date >= p_from::date
    AND g.posting_date <= p_to::date
    AND g.document_id = ANY(v_doc_ids);

  -- ── Hash computation ──────────────────────────────────────────────────────
  -- Dùng SHA-256 của chuỗi JSON (::text) — canonical vì JSONB sort keys alphabetically.
  v_h_audit   := encode(sha256(v_audit::text::bytea),   'hex');
  v_h_sod     := encode(sha256(v_sod::text::bytea),     'hex');
  v_h_links   := encode(sha256(v_links::text::bytea),   'hex');
  v_h_handoff := encode(sha256(v_handoff::text::bytea), 'hex');
  v_h_exc     := encode(sha256(v_exc::text::bytea),     'hex');
  v_h_gl      := encode(sha256(v_gl::text::bytea),      'hex');

  -- Hash tổng = sha256 của 6 hash nối chuỗi (từng hash cố định 64 ký tự hex)
  v_h_total := encode(
    sha256((v_h_audit || v_h_sod || v_h_links || v_h_handoff || v_h_exc || v_h_gl)::bytea),
    'hex'
  );

  -- ── Build result ──────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok', true,
    'manifest', jsonb_build_object(
      'generated_at',     fn_now(),
      'p_from',           p_from,
      'p_to',             p_to,
      'p_scope',          p_scope,
      'generated_by',     v_me.id,
      'tenant_id',        v_tenant,
      'document_count',   cardinality(v_doc_ids),
      'files', jsonb_build_object(
        'audit_trail',        jsonb_build_object('rows', jsonb_array_length(v_audit),   'sha256', v_h_audit),
        'sod_check_log',      jsonb_build_object('rows', jsonb_array_length(v_sod),     'sha256', v_h_sod),
        'document_links',     jsonb_build_object('rows', jsonb_array_length(v_links),   'sha256', v_h_links),
        'handoff_records',    jsonb_build_object('rows', jsonb_array_length(v_handoff), 'sha256', v_h_handoff),
        'exception_register', jsonb_build_object('rows', jsonb_array_length(v_exc),     'sha256', v_h_exc),
        'gl_entries',         jsonb_build_object('rows', jsonb_array_length(v_gl),      'sha256', v_h_gl)
      ),
      'sha256_total', v_h_total
    ),
    'data', jsonb_build_object(
      'audit_trail',        v_audit,
      'sod_check_log',      v_sod,
      'document_links',     v_links,
      'handoff_records',    v_handoff,
      'exception_register', v_exc,
      'gl_entries',         v_gl
    )
  );
END $$;

-- Security: chỉ EXECUTE, không đọc bảng trực tiếp
REVOKE ALL ON FUNCTION api_audit_pack(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api_audit_pack(timestamptz, timestamptz, text) TO authenticated;

-- Acceptance criteria cho WP-G1 (T16.1–T16.3)
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker)
VALUES
  ('T16.1', 'N3_TRACEABILITY', 'api_audit_pack: hash tổng ổn định khi chạy 2 lần trên cùng dữ liệu bất biến', 'L11', false),
  ('T16.2', 'N3_TRACEABILITY', 'api_audit_pack: hash tổng lệch khi có thêm 1 bản ghi trong kỳ', 'L11', false),
  ('T16.3', 'N2_CONTROLS',     'api_audit_pack: kết xuất tôn trọng fn_doc_in_scope (user OWN chỉ thấy docs của mình)', 'L11', false)
ON CONFLICT (test_code) DO NOTHING;
