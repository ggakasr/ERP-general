-- ============================================================
-- 030_einvoice.sql — Hoá đơn điện tử (WP-H1)
-- E-invoice log + INV ISSUED state + adapter RPCs
-- ============================================================

-- 1. einvoice_log table -------------------------------------------
CREATE TABLE einvoice_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  document_id   uuid NOT NULL REFERENCES documents(id),
  provider      text NOT NULL,          -- 'VNPT','VIETTEL','BKAV','MISA','FPT'
  direction     text NOT NULL DEFAULT 'ISSUE' CHECK (direction IN ('ISSUE','RECEIVE','CANCEL','ADJUST')),
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ISSUED','ERROR','CANCELLED')),
  invoice_series text,                  -- ký hiệu hoá đơn  (e.g. '1C24TAA')
  invoice_number text,                  -- số hoá đơn        (e.g. '00000123')
  invoice_code   text,                  -- mã CQT / mã hoá đơn điện tử
  lookup_code    text,                  -- mã tra cứu
  issued_date    date,
  request_payload  jsonb,
  response_payload jsonb,
  error_message  text,
  created_by    uuid REFERENCES app_users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_einvoice_log_doc ON einvoice_log(document_id);
CREATE INDEX idx_einvoice_log_tenant ON einvoice_log(tenant_id);

ALTER TABLE einvoice_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY einvoice_log_tenant ON einvoice_log
  FOR ALL USING (tenant_id = fn_current_tenant());

REVOKE ALL ON einvoice_log FROM authenticated;

-- 2. Add ISSUED state to INV transitions --------------------------
-- INV: POSTED → ISSUED (phát hành HĐĐT)
INSERT INTO state_transitions
  (doc_type, from_state, to_state, action, label, sod_role, creates_child, create_sod_role, conditions, variant, auto_transition, sort_order)
VALUES
  ('INV','POSTED','ISSUED','issue','Phát hành HĐĐT','EXECUTE',NULL,NULL,'{}','success',false,2);

-- ISSUED → payment (mirror existing POSTED → payment transitions)
INSERT INTO state_transitions
  (doc_type, from_state, to_state, action, label, sod_role, creates_child, create_sod_role, conditions, variant, auto_transition, sort_order)
VALUES
  ('INV','ISSUED','PARTIALLY_PAID','paid_partial','Thu một phần','EXECUTE','RCPT',NULL,'{}','default',true,6),
  ('INV','ISSUED','PAID','paid','Đã thu đủ','EXECUTE','RCPT',NULL,'{}','default',true,7),
  ('INV','ISSUED','CANCELLED','cancel_einvoice','Hủy HĐĐT','APPROVE',NULL,'APPROVER','{}','danger',false,8);

-- Add handoff SLA for ISSUED state
INSERT INTO handoff_sla (flow_code, doc_type, trigger_status, responsible_role, description, sla_hours)
VALUES ('L7','INV','ISSUED','ACCOUNTANT','Theo dõi thu tiền sau phát hành HĐĐT',720)
ON CONFLICT DO NOTHING;

-- 3. RPCs ---------------------------------------------------------

-- api_log_einvoice: ghi log kết quả gọi nhà cung cấp HĐĐT
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
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  IF fn_perm_scope(v_me, v_doc.doc_type, 'EXECUTE') = 0 THEN
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

-- api_get_einvoice_logs: danh sách log HĐĐT cho 1 chứng từ
CREATE OR REPLACE FUNCTION api_get_einvoice_logs(
  p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_me  record;
  v_doc record;
  v_tid uuid := fn_current_tenant();
BEGIN
  SELECT * INTO v_me FROM app_users WHERE id = auth.uid() AND tenant_id = v_tid;
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_document_id AND tenant_id = v_tid;
  IF v_doc IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;

  IF fn_perm_scope(v_me, v_doc.doc_type, 'VIEW') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  RETURN jsonb_build_object('ok', true, 'logs', (
    SELECT coalesce(jsonb_agg(row_to_json(l)::jsonb ORDER BY l.created_at DESC), '[]'::jsonb)
    FROM einvoice_log l
    WHERE l.document_id = p_document_id AND l.tenant_id = v_tid
  ));
END;
$$;

-- api_einvoice_providers: danh sách nhà cung cấp HĐĐT đã cấu hình
CREATE OR REPLACE FUNCTION api_einvoice_providers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN jsonb_build_object('ok', true, 'providers', jsonb_build_array(
    jsonb_build_object('code', 'VNPT',    'name', 'VNPT Invoice',      'sandbox_url', 'https://demoinvoice.vnpt.vn'),
    jsonb_build_object('code', 'VIETTEL', 'name', 'Viettel S-Invoice', 'sandbox_url', 'https://demo-sinvoice.viettel.vn')
  ));
END;
$$;

-- 4. GRANT EXECUTE ------------------------------------------------
GRANT EXECUTE ON FUNCTION api_log_einvoice(uuid,text,text,text,text,text,text,text,date,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION api_get_einvoice_logs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api_einvoice_providers() TO authenticated;
