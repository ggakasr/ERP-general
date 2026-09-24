-- 036_tech_debt_fixes.sql — resolve remaining technical debt items
-- 1. Integrate fn_job_number into api_create_document for doc_types with job_no_format
-- 2. Make anomaly detection thresholds configurable via tenant settings
-- 3. Rate-limit table for demo-signup

-- ============================================================
-- 1. Hook fn_job_number into document creation
--    After INSERT, if doc_type has job_no_format, set data->>'job_no'
-- ============================================================

CREATE OR REPLACE FUNCTION fn_apply_job_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fmt  text;
  v_code text;
BEGIN
  SELECT job_no_format INTO v_fmt FROM doc_types WHERE code = NEW.doc_type;
  IF v_fmt IS NULL THEN RETURN NEW; END IF;

  v_code := fn_job_number(NEW.doc_type, coalesce(NEW.data, '{}'::jsonb), NEW.branch_id);

  NEW.data := coalesce(NEW.data, '{}'::jsonb) || jsonb_build_object('job_no', v_code);
  NEW.title := coalesce(nullif(NEW.title, ''), v_code);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_job_number ON documents;
CREATE TRIGGER trg_job_number
  BEFORE INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION fn_apply_job_number();

-- ============================================================
-- 2. Configurable anomaly thresholds via tenant settings
--    Default thresholds used when tenant.settings lacks the key
-- ============================================================

CREATE OR REPLACE FUNCTION api_risk_alerts(
  p_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me       app_users := fn_current_user();
  v_tenant   uuid      := fn_current_tenant();
  v_scope    int;
  v_from     timestamptz;
  v_alerts   jsonb := '[]'::jsonb;
  v_row      record;
  v_mean     numeric;
  v_stddev   numeric;
  v_prev_exc int;
  v_curr_exc int;
  v_cfg      jsonb;
  v_z_threshold   numeric;
  v_exc_spike     numeric;
  v_work_start    int;
  v_work_end      int;
  v_nearmi_hours  int;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;

  v_scope := fn_perm_scope(v_me.id, 'CONTROLS', 'VIEW');
  IF v_scope = 0 THEN
    v_scope := fn_perm_scope(v_me.id, 'AUDIT_TRAIL', 'VIEW');
  END IF;
  IF v_scope = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn cần quyền xem Kiểm soát hoặc Audit trail');
  END IF;

  -- Load configurable thresholds from tenant settings (fallback to defaults)
  SELECT coalesce(t.settings->'risk_alerts', '{}'::jsonb) INTO v_cfg
  FROM tenants t WHERE t.id = v_tenant;
  v_cfg := coalesce(v_cfg, '{}'::jsonb);

  v_z_threshold  := coalesce((v_cfg->>'z_score_threshold')::numeric, 3);
  v_exc_spike    := coalesce((v_cfg->>'exception_spike_ratio')::numeric, 1.5);
  v_work_start   := coalesce((v_cfg->>'work_start_hour')::int, 7);
  v_work_end     := coalesce((v_cfg->>'work_end_hour')::int, 19);
  v_nearmi_hours := coalesce((v_cfg->>'nearmiss_window_hours')::int, 24);

  v_from := now() - (p_days || ' days')::interval;

  -- ── Alert 1: SoD near-miss ──────────────────────────────────────────────
  FOR v_row IN
    SELECT
      cr.user_id,
      u.full_name,
      cr.doc_type,
      cr.created_doc_id,
      cr.created_doc_number,
      ap.approved_doc_id,
      ap.approved_doc_number,
      cr.created_at   AS create_time,
      ap.approved_at  AS approve_time
    FROM (
      SELECT at2.user_id, d.doc_type, d.id AS created_doc_id, d.number AS created_doc_number, at2.created_at
      FROM audit_trail at2
      JOIN documents d ON d.id::text = at2.record_id AND d.tenant_id = v_tenant
      WHERE at2.tenant_id = v_tenant
        AND at2.action = 'INSERT'
        AND at2.table_name = 'documents'
        AND at2.created_at >= v_from
    ) cr
    JOIN (
      SELECT at3.user_id, d2.id AS approved_doc_id, d2.number AS approved_doc_number, at3.created_at AS approved_at
      FROM audit_trail at3
      JOIN documents d2 ON d2.id::text = at3.record_id AND d2.tenant_id = v_tenant
      WHERE at3.tenant_id = v_tenant
        AND at3.new_value->>'status' IN ('APPROVED','POSTED')
        AND at3.table_name = 'documents'
        AND at3.created_at >= v_from
    ) ap ON cr.user_id = ap.user_id
        AND cr.created_doc_id <> ap.approved_doc_id
        AND abs(extract(epoch FROM ap.approved_at - cr.created_at)) < v_nearmi_hours * 3600
    JOIN app_users u ON u.id = cr.user_id
    LIMIT 10
  LOOP
    v_alerts := v_alerts || jsonb_build_object(
      'type', 'SOD_NEAR_MISS',
      'severity', 'HIGH',
      'user_id', v_row.user_id,
      'user_name', v_row.full_name,
      'detail', format('Tạo %s và duyệt %s trong %sh', v_row.created_doc_number, v_row.approved_doc_number, v_nearmi_hours),
      'created_doc', v_row.created_doc_number,
      'approved_doc', v_row.approved_doc_number,
      'create_time', v_row.create_time,
      'approve_time', v_row.approve_time
    );
  END LOOP;

  -- ── Alert 2: Exception spike ────────────────────────────────────────────
  SELECT count(*) INTO v_curr_exc
  FROM documents d
  WHERE d.tenant_id = v_tenant AND d.doc_type = 'EXC' AND d.created_at >= v_from;

  SELECT count(*) INTO v_prev_exc
  FROM documents d
  WHERE d.tenant_id = v_tenant AND d.doc_type = 'EXC'
    AND d.created_at >= v_from - (p_days || ' days')::interval
    AND d.created_at <  v_from;

  IF v_curr_exc > 0 AND (v_prev_exc = 0 OR v_curr_exc::numeric / greatest(v_prev_exc, 1) > v_exc_spike) THEN
    v_alerts := v_alerts || jsonb_build_object(
      'type', 'EXCEPTION_SPIKE',
      'severity', CASE WHEN v_curr_exc::numeric / greatest(v_prev_exc, 1) > v_exc_spike * 2 THEN 'HIGH' ELSE 'MEDIUM' END,
      'detail', format('Ngoại lệ tăng từ %s → %s (%.0f%%)', v_prev_exc, v_curr_exc,
        (v_curr_exc::numeric / greatest(v_prev_exc, 1) - 1) * 100),
      'current_count', v_curr_exc,
      'previous_count', v_prev_exc,
      'period_days', p_days
    );
  END IF;

  -- ── Alert 3: Off-hours activity ─────────────────────────────────────────
  FOR v_row IN
    SELECT
      d.number, d.doc_type, d.created_at,
      extract(hour FROM d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS local_hour,
      u.full_name
    FROM documents d
    JOIN app_users u ON u.id = d.created_by
    WHERE d.tenant_id = v_tenant
      AND d.created_at >= v_from
      AND (
        extract(hour FROM d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') < v_work_start
        OR extract(hour FROM d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= v_work_end
      )
    ORDER BY d.created_at DESC
    LIMIT 10
  LOOP
    v_alerts := v_alerts || jsonb_build_object(
      'type', 'OFF_HOURS',
      'severity', 'LOW',
      'user_name', v_row.full_name,
      'document', v_row.number,
      'doc_type', v_row.doc_type,
      'detail', format('%s tạo %s lúc %sh', v_row.full_name, v_row.number,
        lpad(v_row.local_hour::int::text, 2, '0')),
      'created_at', v_row.created_at
    );
  END LOOP;

  -- ── Alert 4: Amount outlier ─────────────────────────────────────────────
  FOR v_row IN
    WITH stats AS (
      SELECT
        d.doc_type,
        avg((d.data->>'total_amount')::numeric) AS mean_amt,
        stddev_pop((d.data->>'total_amount')::numeric) AS std_amt,
        count(*) AS sample_size
      FROM documents d
      WHERE d.tenant_id = v_tenant
        AND d.data->>'total_amount' IS NOT NULL
        AND (d.data->>'total_amount')::numeric > 0
        AND d.created_at >= now() - interval '90 days'
      GROUP BY d.doc_type
      HAVING count(*) >= 5 AND stddev_pop((d.data->>'total_amount')::numeric) > 0
    )
    SELECT
      d.number, d.doc_type,
      (d.data->>'total_amount')::numeric AS amount,
      s.mean_amt, s.std_amt,
      u.full_name, d.created_at,
      ((d.data->>'total_amount')::numeric - s.mean_amt) / s.std_amt AS z_score
    FROM documents d
    JOIN stats s ON s.doc_type = d.doc_type
    JOIN app_users u ON u.id = d.created_by
    WHERE d.tenant_id = v_tenant
      AND d.created_at >= v_from
      AND d.data->>'total_amount' IS NOT NULL
      AND ((d.data->>'total_amount')::numeric - s.mean_amt) / s.std_amt > v_z_threshold
    ORDER BY ((d.data->>'total_amount')::numeric - s.mean_amt) / s.std_amt DESC
    LIMIT 10
  LOOP
    v_alerts := v_alerts || jsonb_build_object(
      'type', 'AMOUNT_OUTLIER',
      'severity', CASE WHEN v_row.z_score > v_z_threshold + 2 THEN 'HIGH' ELSE 'MEDIUM' END,
      'document', v_row.number,
      'doc_type', v_row.doc_type,
      'amount', v_row.amount,
      'mean', round(v_row.mean_amt, 2),
      'std', round(v_row.std_amt, 2),
      'z_score', round(v_row.z_score, 2),
      'user_name', v_row.full_name,
      'detail', format('%s: %s = %s (trung bình %s, z=%.1f)', v_row.doc_type, v_row.number,
        to_char(v_row.amount, 'FM999,999,999,999'), to_char(v_row.mean_amt, 'FM999,999,999,999'), v_row.z_score),
      'created_at', v_row.created_at
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'alerts', v_alerts,
    'total', jsonb_array_length(v_alerts),
    'period_days', p_days,
    'thresholds', jsonb_build_object(
      'z_score', v_z_threshold,
      'exception_spike_ratio', v_exc_spike,
      'work_hours', format('%s–%s', v_work_start, v_work_end),
      'nearmiss_window_hours', v_nearmi_hours
    ),
    'generated_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION api_risk_alerts(int) TO authenticated;

-- ============================================================
-- 3. Rate-limit table for demo-signup
-- ============================================================

CREATE TABLE IF NOT EXISTS demo_signups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_signups_ip ON demo_signups (ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_demo_signups_email ON demo_signups (email, created_at);

NOTIFY pgrst, 'reload schema';
