-- ERP General — 023 Comment trên chứng từ (WP-F1)
-- Bảng comments + api_add_comment + api_get_comments + @mention → fn_notify

-- ============================================================
-- Table: comments
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid        NOT NULL REFERENCES documents(id),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  user_id     uuid        NOT NULL REFERENCES app_users(id),
  body        text        NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 4000),
  mentions    uuid[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT fn_now()
);

CREATE INDEX IF NOT EXISTS idx_comments_document  ON comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_tenant    ON comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comments_created   ON comments(document_id, created_at);

-- REVOKE direct access: mọi truy cập qua api_*
REVOKE ALL ON comments FROM authenticated;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
-- RLS ngăn đọc bảng trực tiếp; SECURITY DEFINER functions bypass RLS
CREATE POLICY comments_tenant_isolation ON comments
  USING (tenant_id = fn_current_tenant());

-- ============================================================
-- api_add_comment — thêm bình luận, gọi fn_notify cho @mention
-- ============================================================
CREATE OR REPLACE FUNCTION api_add_comment(
  p_document_id uuid,
  p_body        text,
  p_mentions    uuid[] DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me         app_users := fn_current_user();
  v_doc        documents;
  v_comment_id uuid;
  v_uid        uuid;
  v_user_name  text := '';
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;

  -- kiểm tra chứng từ tồn tại và user có quyền VIEW
  SELECT * INTO v_doc FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ');
  END IF;
  IF NOT fn_doc_in_scope(v_me.id, v_doc, v_doc.doc_type, 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền bình luận trên chứng từ này');
  END IF;

  IF trim(p_body) = '' THEN
    RETURN fn_fail('INVALID', 'Nội dung bình luận không được trống');
  END IF;

  -- lưu comment
  INSERT INTO comments(document_id, tenant_id, user_id, body, mentions)
  VALUES (p_document_id, v_doc.tenant_id, v_me.id, p_body, coalesce(p_mentions, '{}'))
  RETURNING id INTO v_comment_id;

  -- gửi thông báo cho từng người được @mention (trừ chính mình)
  FOREACH v_uid IN ARRAY coalesce(p_mentions, ARRAY[]::uuid[]) LOOP
    CONTINUE WHEN v_uid = v_me.id;
    PERFORM fn_notify(
      v_uid,
      format('Bạn được nhắc đến trong %s', v_doc.number),
      substring(p_body FROM 1 FOR 200),
      p_document_id,
      v_doc.tenant_id
    );
  END LOOP;

  v_user_name := v_me.full_name;

  RETURN jsonb_build_object(
    'ok',         true,
    'id',         v_comment_id,
    'user_id',    v_me.id,
    'user_name',  v_user_name,
    'body',       p_body,
    'mentions',   coalesce(p_mentions, '{}'),
    'created_at', fn_now()
  );
END $$;

-- ============================================================
-- api_get_comments — lấy danh sách bình luận của một chứng từ
-- ============================================================
CREATE OR REPLACE FUNCTION api_get_comments(p_document_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_doc documents;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ');
  END IF;
  IF NOT fn_doc_in_scope(v_me.id, v_doc, v_doc.doc_type, 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem bình luận của chứng từ này');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'comments', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',         c.id,
          'user_id',    c.user_id,
          'user_name',  u.full_name,
          'body',       c.body,
          'mentions',   c.mentions,
          'created_at', c.created_at
        )
        ORDER BY c.created_at
      )
      FROM comments c
      JOIN app_users u ON u.id = c.user_id
      WHERE c.document_id = p_document_id
        AND c.tenant_id   = fn_current_tenant()
    ), '[]'::jsonb)
  );
END $$;

-- GRANT EXECUTE cho authenticated role
GRANT EXECUTE ON FUNCTION api_add_comment(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION api_get_comments(uuid)              TO authenticated;

-- ============================================================
-- Acceptance criteria cho WP-F1 (T14.1–T14.3)
-- ============================================================
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker)
VALUES
  ('T14.1', 'N1_FUNCTIONAL', 'api_add_comment tạo comment gắn vào chứng từ, audit trail ghi nhận', 'L11', false),
  ('T14.2', 'N1_FUNCTIONAL', '@mention trong comment → fn_notify gửi thông báo cho người được nhắc', 'L11', false),
  ('T14.3', 'N2_CONTROLS',   'api_get_comments từ chối user tenant khác (cô lập tenant)', 'L11', false)
ON CONFLICT (test_code) DO NOTHING;
