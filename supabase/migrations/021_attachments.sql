-- 021_attachments.sql — WP-E1: Lưu trữ chứng từ (Storage bucket + attachments table + api_*)

-- ============================================================
-- 1. STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload, read, and delete own uploads
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documents_bucket_insert') THEN
    EXECUTE 'CREATE POLICY documents_bucket_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''documents'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documents_bucket_select') THEN
    EXECUTE 'CREATE POLICY documents_bucket_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''documents'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documents_bucket_delete') THEN
    EXECUTE 'CREATE POLICY documents_bucket_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''documents'' AND owner = auth.uid()::text)';
  END IF;
END $$;

-- ============================================================
-- 2. ATTACHMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  file_name    text        NOT NULL,
  mime         text        NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   bigint      NOT NULL DEFAULT 0,
  storage_path text        NOT NULL,
  checksum     text,
  uploaded_by  uuid        NOT NULL REFERENCES app_users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_document ON attachments(document_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tenant   ON attachments(tenant_id);

-- RLS: no direct access for authenticated; all reads/writes via api_* functions
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON attachments FROM anon, authenticated;

-- ============================================================
-- 3. api_attach_file — record metadata after file upload to Storage
-- ============================================================
CREATE OR REPLACE FUNCTION api_attach_file(
  p_document_id  uuid,
  p_file_name    text,
  p_mime         text,
  p_size_bytes   bigint,
  p_storage_path text,
  p_checksum     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     app_users := fn_current_user();
  v_doc    documents;
  v_att_id uuid;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ'); END IF;

  IF NOT fn_doc_in_scope(v_me.id, v_doc, v_doc.doc_type, 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN', 'Không có quyền đính kèm vào chứng từ này');
  END IF;

  IF trim(coalesce(p_file_name, '')) = '' THEN
    RETURN fn_fail('INVALID', 'Tên file không được rỗng');
  END IF;
  IF trim(coalesce(p_storage_path, '')) = '' THEN
    RETURN fn_fail('INVALID', 'Đường dẫn storage không được rỗng');
  END IF;

  INSERT INTO attachments (document_id, tenant_id, file_name, mime, size_bytes, storage_path, checksum, uploaded_by)
  VALUES (
    p_document_id,
    v_me.tenant_id,
    trim(p_file_name),
    coalesce(nullif(trim(p_mime), ''), 'application/octet-stream'),
    coalesce(p_size_bytes, 0),
    trim(p_storage_path),
    nullif(trim(coalesce(p_checksum, '')), ''),
    v_me.id
  )
  RETURNING id INTO v_att_id;

  -- Audit trail (immutable — append only)
  INSERT INTO audit_trail (table_name, record_id, action, new_value, user_id, user_name)
  VALUES (
    'attachments',
    v_att_id::text,
    'UPLOAD',
    jsonb_build_object(
      'file_name', p_file_name,
      'mime', p_mime,
      'size_bytes', p_size_bytes,
      'document_id', p_document_id
    ),
    v_me.id,
    v_me.full_name
  );

  RETURN jsonb_build_object('ok', true, 'id', v_att_id);
END $$;

-- ============================================================
-- 4. api_get_attachments — list files attached to a document
-- ============================================================
CREATE OR REPLACE FUNCTION api_get_attachments(p_document_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_doc documents;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ'); END IF;

  IF NOT fn_doc_in_scope(v_me.id, v_doc, v_doc.doc_type, 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN', 'Không có quyền xem chứng từ này');
  END IF;

  RETURN jsonb_build_object('ok', true,
    'attachments', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',           a.id,
          'file_name',    a.file_name,
          'mime',         a.mime,
          'size_bytes',   a.size_bytes,
          'storage_path', a.storage_path,
          'checksum',     a.checksum,
          'uploaded_by',  u.full_name,
          'created_at',   a.created_at
        ) ORDER BY a.created_at DESC
      )
      FROM attachments a
      LEFT JOIN app_users u ON u.id = a.uploaded_by
      WHERE a.document_id = p_document_id
    ), '[]')
  );
END $$;

-- ============================================================
-- 5. api_missing_attachments — documents with audit trail but no attached file
-- ============================================================
CREATE OR REPLACE FUNCTION api_missing_attachments(p_limit int DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;

  -- Require AUDIT_TRAIL VIEW or SOD_LOG VIEW permission
  IF NOT (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN permission_matrix pm ON pm.role_code = ur.role_code
      WHERE ur.user_id = v_me.id
        AND pm.resource = 'AUDIT_TRAIL' AND pm.action = 'VIEW' AND pm.status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN permission_matrix pm ON pm.role_code = ur.role_code
      WHERE ur.user_id = v_me.id
        AND pm.resource = 'SOD_LOG' AND pm.action = 'VIEW' AND pm.status = 'ACTIVE'
    )
  ) THEN
    RETURN fn_fail('FORBIDDEN', 'Cần quyền xem Audit trail hoặc Nhật ký SoD');
  END IF;

  RETURN jsonb_build_object('ok', true,
    'total', (
      SELECT count(*)
      FROM documents d
      WHERE EXISTS (
        SELECT 1 FROM audit_trail at2
        WHERE at2.table_name = 'documents' AND at2.record_id = d.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM attachments a WHERE a.document_id = d.id
      )
      AND d.tenant_id = v_me.tenant_id
    ),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',            d.id,
          'number',        d.number,
          'doc_type',      d.doc_type,
          'doc_type_name', dt.name,
          'status',        d.status,
          'created_at',    d.created_at
        ) ORDER BY d.created_at DESC
      )
      FROM documents d
      JOIN doc_types dt ON dt.code = d.doc_type
      WHERE EXISTS (
        SELECT 1 FROM audit_trail at2
        WHERE at2.table_name = 'documents' AND at2.record_id = d.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM attachments a WHERE a.document_id = d.id
      )
      AND d.tenant_id = v_me.tenant_id
      LIMIT greatest(p_limit, 1)
    ), '[]')
  );
END $$;

-- Grant EXECUTE explicitly (006_security.sql loop handles api_% automatically on re-run)
GRANT EXECUTE ON FUNCTION api_attach_file    TO authenticated;
GRANT EXECUTE ON FUNCTION api_get_attachments TO authenticated;
GRANT EXECUTE ON FUNCTION api_missing_attachments TO authenticated;

NOTIFY pgrst, 'reload schema';
