-- 020_fix_api_get_shipment.sql
-- Fix: api_get_shipment (011_shipment.sql line 354) called fn_available_actions with wrong arg order.
-- Signature: fn_available_actions(p_doc documents, p_user uuid)
-- Bug was:   fn_available_actions(v_me.id, v_doc)   ← uuid first, documents second
-- Fix:       fn_available_actions(v_doc, v_me.id)   ← documents first, uuid second

CREATE OR REPLACE FUNCTION api_get_shipment(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_doc documents;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  SELECT * INTO v_doc FROM documents WHERE id = p_id AND doc_type = 'SHIPMENT';
  IF v_doc.id IS NULL THEN RETURN fn_fail('NOT_FOUND','Không tìm thấy lô hàng'); END IF;
  IF NOT fn_doc_in_scope(v_me.id, v_doc, 'SHIPMENT', 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN','Không có quyền xem lô hàng này');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    -- Overview
    'document', fn_doc_json(v_doc),
    'shipper',   (SELECT jsonb_build_object('id',p.id,'name',p.name,'code',p.code) FROM partners p WHERE p.id = v_doc.partner_id),
    'consignee', (SELECT jsonb_build_object('id',p.id,'name',p.name,'code',p.code) FROM partners p WHERE p.id = (v_doc.data->>'consignee_id')::uuid),
    -- Charges tab
    'charges', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',          sc.id,
        'charge_code', sc.charge_code,
        'description', sc.description,
        'charge_type', sc.charge_type,
        'qty',         sc.qty,
        'rate',        sc.rate,
        'currency',    sc.currency,
        'exchange_rate',sc.exchange_rate,
        'amount_fc',   sc.amount_fc,
        'amount_vnd',  sc.amount_vnd,
        'is_billable', sc.is_billable,
        'rate_expires',sc.rate_expires,
        'partner_name',(SELECT p.name FROM partners p WHERE p.id = sc.partner_id)
      ) ORDER BY sc.charge_type, sc.charge_code)
      FROM shipment_charges sc WHERE sc.shipment_id = p_id
    ), '[]'),
    -- Containers tab
    'containers', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.container_type, c.container_no)
      FROM containers c WHERE c.shipment_id = p_id
    ), '[]'),
    -- Tracking tab
    'tracking', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',           te.id,
        'event_code',   te.event_code,
        'event_name',   te.event_name,
        'location',     te.location,
        'event_time',   te.event_time,
        'actual',       te.actual,
        'notes',        te.notes,
        'created_by',  (SELECT u.full_name FROM app_users u WHERE u.id = te.created_by)
      ) ORDER BY te.event_time NULLS LAST)
      FROM tracking_events te WHERE te.shipment_id = p_id
    ), '[]'),
    -- Documents chain (child docs linked to this shipment)
    'child_docs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',       d.id,
        'number',   d.number,
        'doc_type', d.doc_type,
        'doc_type_name', (SELECT dt.name FROM doc_types dt WHERE dt.code = d.doc_type),
        'status',   d.status,
        'title',    d.title,
        'created_at', d.created_at
      ) ORDER BY d.created_at)
      FROM document_links dl
      JOIN documents d ON d.id = dl.child_id
      WHERE dl.parent_id = p_id
    ), '[]'),
    -- Profit summary
    'profit', (
      SELECT jsonb_build_object(
        'ar_total', coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd END), 0),
        'ap_total', coalesce(sum(CASE WHEN charge_type='AP' THEN amount_vnd END), 0),
        'margin',   coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd END), 0)
                  - coalesce(sum(CASE WHEN charge_type='AP' THEN amount_vnd END), 0),
        'margin_pct', CASE
          WHEN coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd END), 0) = 0 THEN 0
          ELSE round((coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd END), 0)
                    - coalesce(sum(CASE WHEN charge_type='AP' THEN amount_vnd END), 0))
                   / sum(CASE WHEN charge_type='AR' THEN amount_vnd END) * 100, 1)
        END
      )
      FROM shipment_charges WHERE shipment_id = p_id
    ),
    -- Available actions (state machine) — fixed arg order: (doc, user)
    'actions', fn_available_actions(v_doc, v_me.id)
  );
END $$;

GRANT EXECUTE ON FUNCTION api_get_shipment(uuid) TO authenticated;
