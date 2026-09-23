-- 022_ingest.sql — WP-E2: AI Ingestion Pipeline
-- Pipeline: ingest_jobs table + api_* functions
-- Security: AI chỉ tạo DRAFT với ai_extracted=true; người dùng phải review + duyệt thủ công
-- Sai lệch master data → sinh EXC tự động và liên kết với chứng từ DRAFT

-- ============================================================
-- 1. INGEST_JOBS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id),
  source_type          text        NOT NULL DEFAULT 'ATTACHMENT'
                                   CHECK (source_type IN ('ATTACHMENT','UPLOAD')),
  doc_type             text        NOT NULL REFERENCES doc_types(code),
  attachment_id        uuid        REFERENCES attachments(id),
  status               text        NOT NULL DEFAULT 'PENDING'
                                   CHECK (status IN ('PENDING','PROCESSING','DONE','DONE_WITH_EXCEPTIONS','ERROR')),
  extracted            jsonb,
  confidence           numeric     CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_document_id  uuid        REFERENCES documents(id),
  error_message        text,
  created_by           uuid        NOT NULL REFERENCES app_users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_tenant    ON ingest_jobs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_created_by ON ingest_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status    ON ingest_jobs(status) WHERE status IN ('PENDING','PROCESSING');

-- RLS: no direct table access for authenticated; all reads/writes via api_* functions
ALTER TABLE ingest_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingest_jobs FROM anon, authenticated;

-- ============================================================
-- 2. api_create_ingest_job — tạo job trước khi gửi file lên AI
-- ============================================================
CREATE OR REPLACE FUNCTION api_create_ingest_job(
  p_doc_type      text,
  p_source_type   text  DEFAULT 'ATTACHMENT',
  p_attachment_id uuid  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     app_users := fn_current_user();
  v_job_id uuid;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;

  IF NOT EXISTS (SELECT 1 FROM doc_types WHERE code = p_doc_type) THEN
    RETURN fn_fail('INVALID', 'Loại chứng từ không hợp lệ: ' || coalesce(p_doc_type, '(null)'));
  END IF;

  IF coalesce(p_source_type, 'ATTACHMENT') NOT IN ('ATTACHMENT','UPLOAD') THEN
    RETURN fn_fail('INVALID', 'source_type phải là ATTACHMENT hoặc UPLOAD');
  END IF;

  IF p_attachment_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM attachments WHERE id = p_attachment_id AND tenant_id = v_me.tenant_id) THEN
      RETURN fn_fail('NOT_FOUND', 'Không tìm thấy file đính kèm hoặc không thuộc tenant của bạn');
    END IF;
  END IF;

  INSERT INTO ingest_jobs (tenant_id, source_type, doc_type, attachment_id, created_by)
  VALUES (v_me.tenant_id, coalesce(p_source_type, 'ATTACHMENT'), p_doc_type, p_attachment_id, v_me.id)
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('ok', true, 'id', v_job_id);
END $$;

-- ============================================================
-- 3. api_apply_ingest — tạo DRAFT từ dữ liệu AI trích xuất
--    AI chỉ tạo DRAFT; không bao giờ SUBMIT / APPROVE / POST
--    Sai lệch master data → sinh EXC và liên kết EXCEPTION
-- ============================================================
CREATE OR REPLACE FUNCTION api_apply_ingest(
  p_job_id      uuid,
  p_extracted   jsonb,
  p_confidence  numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me        app_users := fn_current_user();
  v_job       ingest_jobs;
  v_doc       documents;
  v_exc       documents;
  v_partner   partners;
  v_product   products;
  v_line      jsonb;
  v_exc_count int     := 0;
  v_title     text;
  v_data      jsonb;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;

  SELECT * INTO v_job FROM ingest_jobs
  WHERE id = p_job_id AND tenant_id = v_me.tenant_id;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy ingest job'); END IF;
  IF v_job.status NOT IN ('PENDING','ERROR') THEN
    RETURN fn_fail('INVALID', 'Job đã được xử lý (status: ' || v_job.status || ')');
  END IF;

  -- Mark as processing first
  UPDATE ingest_jobs SET status = 'PROCESSING', updated_at = now() WHERE id = p_job_id;

  -- Build document data; stamp ai_extracted=true so human review is mandatory
  v_data := coalesce(p_extracted - 'lines' - 'partner_code', '{}') ||
    jsonb_build_object(
      'ai_extracted',  true,
      'confidence',    p_confidence,
      'ingest_job_id', p_job_id
    );

  v_title := coalesce(
    nullif(trim(coalesce(p_extracted->>'title', '')), ''),
    'AI Import — ' || v_job.doc_type || ' — ' || to_char(now(), 'DD/MM/YYYY')
  );

  -- Create DRAFT via internal helper (SECURITY DEFINER, bypasses permission check;
  -- records creating user as create_sod_role → SoD still enforced on subsequent transitions)
  v_doc := fn_insert_document(
    v_job.doc_type,
    v_me.id,
    v_title,
    v_data,
    NULL,                                                     -- no parent
    'SOURCE',
    coalesce((p_extracted->>'amount')::numeric, 0),
    NULL
  );

  -- Resolve partner_code → partner_id
  IF nullif(trim(coalesce(p_extracted->>'partner_code', '')), '') IS NOT NULL THEN
    SELECT * INTO v_partner
    FROM partners
    WHERE code = trim(p_extracted->>'partner_code')
      AND tenant_id = v_me.tenant_id
      AND status = 'ACTIVE';
    IF FOUND THEN
      UPDATE documents SET partner_id = v_partner.id WHERE id = v_doc.id;
    ELSE
      v_exc := fn_insert_document(
        'EXC', v_me.id,
        'AI Ingestion: đối tác không tìm thấy — ' || trim(p_extracted->>'partner_code'),
        jsonb_build_object(
          'exception_type', 'DATA_MISMATCH',
          'severity',       'HIGH',
          'description',    format(
            'AI trích xuất mã đối tác "%s" không tồn tại trong hệ thống. Chứng từ: %s.',
            trim(p_extracted->>'partner_code'), v_doc.number),
          'ingest_job_id',        p_job_id,
          'source_document_number', v_doc.number
        ),
        v_doc.id, 'EXCEPTION', 0, NULL
      );
      v_exc_count := v_exc_count + 1;
    END IF;
  END IF;

  -- Resolve product_code in each line
  IF jsonb_typeof(p_extracted->'lines') = 'array' THEN
    FOR v_line IN SELECT jsonb_array_elements(p_extracted->'lines') LOOP
      IF nullif(trim(coalesce(v_line->>'product_code', '')), '') IS NOT NULL THEN
        SELECT * INTO v_product
        FROM products
        WHERE code = trim(v_line->>'product_code')
          AND tenant_id = v_me.tenant_id
          AND status = 'ACTIVE';
        IF NOT FOUND THEN
          v_exc := fn_insert_document(
            'EXC', v_me.id,
            'AI Ingestion: sản phẩm không tìm thấy — ' || trim(v_line->>'product_code'),
            jsonb_build_object(
              'exception_type', 'DATA_MISMATCH',
              'severity',       'HIGH',
              'description',    format(
                'AI trích xuất mã sản phẩm "%s" không tồn tại trong hệ thống. Chứng từ: %s.',
                trim(v_line->>'product_code'), v_doc.number),
              'ingest_job_id',        p_job_id,
              'source_document_number', v_doc.number
            ),
            v_doc.id, 'EXCEPTION', 0, NULL
          );
          v_exc_count := v_exc_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Update job with final status and result
  UPDATE ingest_jobs
  SET status              = CASE WHEN v_exc_count > 0 THEN 'DONE_WITH_EXCEPTIONS' ELSE 'DONE' END,
      extracted           = p_extracted,
      confidence          = p_confidence,
      created_document_id = v_doc.id,
      updated_at          = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'id',          v_doc.id,
    'number',      v_doc.number,
    'status',      v_doc.status,
    'ai_extracted', true,
    'job_id',      p_job_id,
    'exceptions',  v_exc_count
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE ingest_jobs
  SET status = 'ERROR', error_message = SQLERRM, updated_at = now()
  WHERE id = p_job_id;
  RETURN fn_fail('ENGINE_ERROR', SQLERRM);
END $$;

-- ============================================================
-- 4. api_get_ingest_job — lấy thông tin 1 job
-- ============================================================
CREATE OR REPLACE FUNCTION api_get_ingest_job(p_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_job ingest_jobs;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;

  SELECT * INTO v_job
  FROM ingest_jobs WHERE id = p_job_id AND tenant_id = v_me.tenant_id;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy ingest job'); END IF;

  RETURN jsonb_build_object('ok', true,
    'job', jsonb_build_object(
      'id',                  v_job.id,
      'doc_type',            v_job.doc_type,
      'source_type',         v_job.source_type,
      'attachment_id',       v_job.attachment_id,
      'status',              v_job.status,
      'confidence',          v_job.confidence,
      'extracted',           v_job.extracted,
      'created_document_id', v_job.created_document_id,
      'error_message',       v_job.error_message,
      'created_at',          v_job.created_at,
      'updated_at',          v_job.updated_at
    )
  );
END $$;

-- ============================================================
-- 5. api_list_ingest_jobs — liệt kê job của tenant hiện tại
-- ============================================================
CREATE OR REPLACE FUNCTION api_list_ingest_jobs(
  p_limit  int DEFAULT 20,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;

  RETURN jsonb_build_object('ok', true,
    'total', (SELECT count(*) FROM ingest_jobs WHERE tenant_id = v_me.tenant_id),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',                  j.id,
          'doc_type',            j.doc_type,
          'status',              j.status,
          'confidence',          j.confidence,
          'created_document_id', j.created_document_id,
          'error_message',       j.error_message,
          'created_by',          u.full_name,
          'created_at',          j.created_at
        ) ORDER BY j.created_at DESC
      )
      FROM ingest_jobs j
      LEFT JOIN app_users u ON u.id = j.created_by
      WHERE j.tenant_id = v_me.tenant_id
      LIMIT greatest(coalesce(p_limit, 20), 1)
      OFFSET coalesce(p_offset, 0)
    ), '[]')
  );
END $$;

-- Grant EXECUTE (006_security.sql loop handles api_% on re-run; explicit grants for immediate effect)
GRANT EXECUTE ON FUNCTION api_create_ingest_job  TO authenticated;
GRANT EXECUTE ON FUNCTION api_apply_ingest        TO authenticated;
GRANT EXECUTE ON FUNCTION api_get_ingest_job      TO authenticated;
GRANT EXECUTE ON FUNCTION api_list_ingest_jobs    TO authenticated;

NOTIFY pgrst, 'reload schema';
