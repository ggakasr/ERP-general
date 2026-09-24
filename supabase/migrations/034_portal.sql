-- WP-F3: Client Portal + Agent Portal
-- Adds portal user support: PORTAL_CUSTOMER and PARTNER_AGENT roles,
-- partner_id linkage on app_users, permission entries, and scope
-- enforcement via fn_doc_in_scope extension.
--
-- Portal users see documents where documents.partner_id = their app_users.partner_id.
-- They CANNOT create financial documents (JV, PMT, RCPT, BANKREC).
-- Agent can create DNOTE/CNOTE (debit/credit note).

-- ============================================================
-- 1. Extend app_users with partner_id + user_type
-- ============================================================
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'INTERNAL'
  CHECK (user_type IN ('INTERNAL','PORTAL_CUSTOMER','PARTNER_AGENT'));

CREATE INDEX IF NOT EXISTS idx_app_users_partner ON app_users(partner_id) WHERE partner_id IS NOT NULL;

-- ============================================================
-- 2. Portal roles
-- ============================================================
INSERT INTO roles (code, name, description) VALUES
  ('PORTAL_CUSTOMER', 'Khách hàng (Portal)', 'Khách hàng tra cứu lô hàng, tải chứng từ, xác nhận báo giá'),
  ('PARTNER_AGENT',   'Đại lý (Portal)',      'Đại lý nhập debit/credit note, xem lô hàng liên quan')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 3. Permission matrix entries for portal roles
-- ============================================================
INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions, status)
SELECT r.code, dt.code, act.a, 'OWN',
  CASE WHEN act.a = 'VIEW' THEN '{"hidden":["cost_price","margin","internal_notes"]}'::jsonb
       ELSE '{}'::jsonb END,
  'ACTIVE'
FROM (VALUES ('PORTAL_CUSTOMER')) r(code)
CROSS JOIN (VALUES ('SHIPMENT'),('QUOT'),('BOOKING'),('HBL'),('DO'),('INV'),('SINV')) dt(code)
CROSS JOIN (VALUES ('VIEW')) act(a)
ON CONFLICT (role_code, resource, action) DO NOTHING;

INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions, status)
VALUES ('PORTAL_CUSTOMER', 'QUOT', 'EDIT', 'OWN', '{}'::jsonb, 'ACTIVE')
ON CONFLICT (role_code, resource, action) DO NOTHING;

INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions, status)
SELECT r.code, dt.code, act.a, 'OWN',
  CASE WHEN act.a = 'VIEW' THEN '{"hidden":["internal_notes"]}'::jsonb
       ELSE '{}'::jsonb END,
  'ACTIVE'
FROM (VALUES ('PARTNER_AGENT')) r(code)
CROSS JOIN (VALUES ('SHIPMENT'),('QUOT'),('BOOKING'),('HBL'),('DO'),('INV'),('SINV'),('DNOTE'),('CNOTE')) dt(code)
CROSS JOIN (VALUES ('VIEW')) act(a)
ON CONFLICT (role_code, resource, action) DO NOTHING;

INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions, status)
SELECT 'PARTNER_AGENT', dt.code, act.a, 'OWN', '{}'::jsonb, 'ACTIVE'
FROM (VALUES ('DNOTE'),('CNOTE')) dt(code)
CROSS JOIN (VALUES ('CREATE'),('EDIT')) act(a)
ON CONFLICT (role_code, resource, action) DO NOTHING;

-- ============================================================
-- 4. Extend fn_doc_in_scope for partner-based OWN scope
-- ============================================================
-- Based on 029_multi_level_approval version; adds portal partner_id check.
CREATE OR REPLACE FUNCTION fn_doc_in_scope(
  p_user     uuid,
  p_doc      documents,
  p_resource text,
  p_action   text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s             int;
  u             app_users;
  v_delegator   uuid;
BEGIN
  s := fn_perm_scope(p_user, p_resource, p_action);

  IF s = 0 THEN
    IF p_action = 'APPROVE' THEN
      SELECT d.delegator_id INTO v_delegator
      FROM delegations d
      WHERE d.tenant_id = fn_current_tenant()
        AND d.delegate_id = p_user
        AND d.status = 'ACTIVE'
        AND fn_now() BETWEEN d.valid_from AND d.valid_until
        AND ('APPROVER' = ANY(d.sod_roles))
        AND (d.doc_types = '{}' OR p_resource = ANY(d.doc_types))
      ORDER BY d.created_at DESC
      LIMIT 1;

      IF v_delegator IS NULL THEN RETURN false; END IF;

      s := fn_perm_scope(v_delegator, p_resource, p_action);
      IF s = 0 THEN RETURN false; END IF;
      SELECT * INTO u FROM app_users WHERE id = v_delegator;
      IF u.tenant_id IS DISTINCT FROM p_doc.tenant_id THEN RETURN false; END IF;
      IF s >= 4 THEN RETURN true; END IF;
      IF s >= 3 AND (p_doc.branch_id = u.branch_id
          OR EXISTS (SELECT 1 FROM warehouses w
                     WHERE w.id = p_doc.to_warehouse_id AND w.branch_id = u.branch_id)) THEN
        RETURN true;
      END IF;
      IF s >= 2 AND (p_doc.department_id = u.department_id
          OR p_doc.cost_center_id = u.department_id) THEN
        RETURN true;
      END IF;
      IF p_doc.created_by = v_delegator OR p_doc.owner_id = v_delegator THEN RETURN true; END IF;
      RETURN false;
    END IF;
    RETURN false;
  END IF;

  SELECT * INTO u FROM app_users WHERE id = p_user;
  IF u.tenant_id IS DISTINCT FROM p_doc.tenant_id THEN RETURN false; END IF;

  -- Portal users: OWN scope means partner_id match only
  IF u.partner_id IS NOT NULL THEN
    RETURN (p_doc.partner_id IS NOT NULL AND p_doc.partner_id = u.partner_id);
  END IF;

  IF s >= 4 THEN RETURN true; END IF;
  IF s >= 3 AND (p_doc.branch_id = u.branch_id
      OR EXISTS (SELECT 1 FROM warehouses w
                 WHERE w.id = p_doc.to_warehouse_id AND w.branch_id = u.branch_id)) THEN
    RETURN true;
  END IF;
  IF s >= 2 AND (p_doc.department_id = u.department_id
      OR p_doc.cost_center_id = u.department_id) THEN
    RETURN true;
  END IF;
  IF p_doc.created_by = p_user OR p_doc.owner_id = p_user THEN RETURN true; END IF;
  RETURN EXISTS (
    WITH RECURSIVE anc(id, depth) AS (
      SELECT l.parent_id, 1 FROM document_links l
      WHERE l.child_id = p_doc.id AND l.link_type = 'SOURCE'
      UNION ALL
      SELECT l.parent_id, a.depth + 1 FROM document_links l
      JOIN anc a ON l.child_id = a.id
      WHERE a.depth < 4 AND l.link_type = 'SOURCE'
    )
    SELECT 1 FROM anc JOIN documents d ON d.id = anc.id WHERE d.created_by = p_user
  );
END $$;

-- ============================================================
-- 5. Portal-specific RPCs
-- ============================================================

-- api_portal_shipments: list shipments visible to portal user
CREATE OR REPLACE FUNCTION api_portal_shipments(
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     app_users := fn_current_user();
  v_tenant uuid      := fn_current_tenant();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  IF v_me.partner_id IS NULL THEN RETURN fn_fail('FORBIDDEN','Chỉ dành cho người dùng portal'); END IF;

  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id,
      'number', d.number,
      'doc_type', d.doc_type,
      'status', d.status,
      'partner_name', p.name,
      'data', d.data - 'internal_notes' - 'cost_price' - 'margin',
      'created_at', d.created_at,
      'updated_at', d.updated_at
    ) ORDER BY d.created_at DESC)
    FROM documents d
    JOIN partners p ON p.id = d.partner_id
    WHERE d.tenant_id = v_tenant
      AND d.doc_type IN ('SHIPMENT','BOOKING','HBL','DO')
      AND d.partner_id = v_me.partner_id
      AND (p_status IS NULL OR d.status = p_status)
    LIMIT p_limit
  ), '[]'::jsonb));
END $$;

-- api_portal_tracking: tracking events for a shipment
CREATE OR REPLACE FUNCTION api_portal_tracking(
  p_shipment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     app_users := fn_current_user();
  v_tenant uuid      := fn_current_tenant();
  v_doc    documents;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  IF v_me.partner_id IS NULL THEN RETURN fn_fail('FORBIDDEN','Chỉ dành cho người dùng portal'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_shipment_id AND tenant_id = v_tenant;
  IF v_doc.id IS NULL THEN RETURN fn_fail('NOT_FOUND','Lô hàng không tồn tại'); END IF;
  IF v_doc.partner_id IS NULL OR v_doc.partner_id <> v_me.partner_id THEN
    RETURN fn_fail('FORBIDDEN','Không có quyền xem lô hàng này');
  END IF;

  RETURN jsonb_build_object('ok', true, 'shipment', jsonb_build_object(
    'id', v_doc.id,
    'number', v_doc.number,
    'status', v_doc.status,
    'data', v_doc.data - 'internal_notes' - 'cost_price' - 'margin'
  ), 'events', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', te.id,
      'event_code', te.event_code,
      'event_name', te.event_name,
      'event_time', te.event_time,
      'location', te.location,
      'notes', te.notes
    ) ORDER BY te.event_time DESC)
    FROM tracking_events te
    WHERE te.shipment_id = p_shipment_id
  ), '[]'::jsonb));
END $$;

-- api_portal_documents: downloadable documents for portal user
CREATE OR REPLACE FUNCTION api_portal_documents(
  p_shipment_id uuid DEFAULT NULL,
  p_limit       int  DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     app_users := fn_current_user();
  v_tenant uuid      := fn_current_tenant();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  IF v_me.partner_id IS NULL THEN RETURN fn_fail('FORBIDDEN','Chỉ dành cho người dùng portal'); END IF;

  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id,
      'number', d.number,
      'doc_type', d.doc_type,
      'status', d.status,
      'data', d.data - 'internal_notes' - 'cost_price' - 'margin',
      'created_at', d.created_at,
      'attachments', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'file_name', a.file_name, 'mime', a.mime, 'size_bytes', a.size_bytes
        ))
        FROM attachments a WHERE a.document_id = d.id AND a.tenant_id = v_tenant
      ), '[]'::jsonb)
    ) ORDER BY d.created_at DESC)
    FROM documents d
    WHERE d.tenant_id = v_tenant
      AND d.partner_id = v_me.partner_id
      AND d.doc_type IN ('INV','SINV','QUOT','HBL','DO','DNOTE','CNOTE')
      AND (p_shipment_id IS NULL OR d.id = p_shipment_id
           OR EXISTS (SELECT 1 FROM document_links dl WHERE dl.parent_id = p_shipment_id AND dl.child_id = d.id))
    LIMIT p_limit
  ), '[]'::jsonb));
END $$;

-- api_portal_confirm_quote: portal customer accepts/rejects a quotation
CREATE OR REPLACE FUNCTION api_portal_confirm_quote(
  p_quote_id uuid,
  p_action   text  -- 'ACCEPT' or 'REJECT'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     app_users := fn_current_user();
  v_tenant uuid      := fn_current_tenant();
  v_doc    documents;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  IF v_me.partner_id IS NULL THEN RETURN fn_fail('FORBIDDEN','Chỉ dành cho người dùng portal'); END IF;
  IF p_action NOT IN ('ACCEPT','REJECT') THEN RETURN fn_fail('BAD_INPUT','Hành động phải là ACCEPT hoặc REJECT'); END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_quote_id AND tenant_id = v_tenant AND doc_type = 'QUOT';
  IF v_doc.id IS NULL THEN RETURN fn_fail('NOT_FOUND','Báo giá không tồn tại'); END IF;
  IF v_doc.partner_id IS NULL OR v_doc.partner_id <> v_me.partner_id THEN
    RETURN fn_fail('FORBIDDEN','Không có quyền xác nhận báo giá này');
  END IF;
  IF v_doc.status NOT IN ('SUBMITTED','SENT') THEN
    RETURN fn_fail('INVALID_STATE','Báo giá phải ở trạng thái Đã gửi để xác nhận');
  END IF;

  UPDATE documents SET
    status = CASE WHEN p_action = 'ACCEPT' THEN 'ACCEPTED' ELSE 'REJECTED' END,
    data = data || jsonb_build_object('portal_confirmed_by', v_me.full_name, 'portal_confirmed_at', now()::text),
    updated_at = fn_now()
  WHERE id = p_quote_id;

  INSERT INTO audit_trail (tenant_id, table_name, record_id, action, new_value, user_id)
  VALUES (v_tenant, 'documents', p_quote_id::text, 'PORTAL_CONFIRM',
    jsonb_build_object('action', p_action, 'by', v_me.full_name), v_me.id);

  RETURN jsonb_build_object('ok', true, 'new_status', CASE WHEN p_action = 'ACCEPT' THEN 'ACCEPTED' ELSE 'REJECTED' END);
END $$;

-- ============================================================
-- 6. Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION api_portal_shipments(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION api_portal_tracking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api_portal_documents(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION api_portal_confirm_quote(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
