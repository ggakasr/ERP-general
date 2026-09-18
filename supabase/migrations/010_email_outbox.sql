-- ERP General — 010 Email outbox
--
-- Mọi thông báo trong ứng dụng (fn_notify) giờ cũng sinh một bản ghi trong email_outbox.
-- Việc GỬI THẬT nằm ở tầng Next.js (src/app/api/notifications/flush), nơi có thể gọi ra
-- nhà cung cấp email (Resend) bằng RESEND_API_KEY — Postgres không tự gọi HTTP ra ngoài.
-- Không cấu hình RESEND_API_KEY thì outbox vẫn ghi nhận đầy đủ, chỉ đánh dấu SIMULATED
-- (mô phỏng: xem được nội dung sẽ gửi, nhưng chưa có nhà cung cấp email thật).

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  document_id uuid REFERENCES documents(id),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','SIMULATED','FAILED')),
  provider_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT fn_now(),
  sent_at timestamptz
);
CREATE INDEX idx_email_outbox_status ON email_outbox(status, created_at);
ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_outbox FROM anon, authenticated;

CREATE OR REPLACE FUNCTION fn_notify(p_user uuid, p_title text, p_body text, p_doc uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_number text;
BEGIN
  INSERT INTO notifications (user_id, title, body, document_id) VALUES (p_user, p_title, p_body, p_doc);
  SELECT email INTO v_email FROM app_users WHERE id = p_user AND status = 'ACTIVE';
  IF v_email IS NOT NULL THEN
    IF p_doc IS NOT NULL THEN SELECT number INTO v_number FROM documents WHERE id = p_doc; END IF;
    INSERT INTO email_outbox (user_id, to_email, subject, body, document_id)
    VALUES (p_user, v_email, p_title,
      coalesce(p_body, '') || CASE WHEN v_number IS NOT NULL THEN format(E'\n\nChứng từ: %s', v_number) ELSE '' END,
      p_doc);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION api_email_outbox(p_status text DEFAULT NULL, p_limit int DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'USER_ADMIN', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem hộp thư email hệ thống');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'to_email', e.to_email, 'subject', e.subject, 'body', e.body,
          'status', e.status, 'error', e.error, 'document_id', e.document_id, 'document_number', d.number,
          'created_at', e.created_at, 'sent_at', e.sent_at) ORDER BY e.created_at DESC)
      FROM email_outbox e LEFT JOIN documents d ON d.id = e.document_id
      WHERE p_status IS NULL OR e.status = p_status
      LIMIT p_limit), '[]'),
    'summary', coalesce((SELECT jsonb_object_agg(s.status, s.cnt) FROM (
      SELECT status, count(*) cnt FROM email_outbox GROUP BY status) s), '{}'::jsonb));
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'api_email_outbox'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
