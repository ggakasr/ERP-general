-- ERP General — 005 Read APIs: scoped + field-masked reads, inbox, 3 trace paths,
-- financial / inventory / budget reports, KPIs, controls.

-- ============================================================
-- CONTEXT
-- ============================================================
CREATE OR REPLACE FUNCTION api_me() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Tài khoản chưa được cấp hoặc đã bị khóa'); END IF;
  RETURN jsonb_build_object('ok', true,
    'user', to_jsonb(v_me) || jsonb_build_object(
      'department_name', (SELECT name FROM departments WHERE id = v_me.department_id),
      'department_code', (SELECT code FROM departments WHERE id = v_me.department_id),
      'branch_name', (SELECT name FROM branches WHERE id = v_me.branch_id),
      'branch_code', (SELECT code FROM branches WHERE id = v_me.branch_id)),
    'roles', coalesce((SELECT jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name) ORDER BY r.sort)
                       FROM user_roles ur JOIN roles r ON r.code = ur.role_code WHERE ur.user_id = v_me.id), '[]'),
    'permissions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('resource', resource, 'action', action, 'scope', scope))
      FROM (SELECT pm.resource, pm.action,
                   (ARRAY['OWN','DEPARTMENT','BRANCH','COMPANY'])[max(CASE pm.data_scope WHEN 'OWN' THEN 1 WHEN 'DEPARTMENT' THEN 2 WHEN 'BRANCH' THEN 3 ELSE 4 END)] AS scope
            FROM user_roles ur JOIN permission_matrix pm ON pm.role_code = ur.role_code AND pm.status = 'ACTIVE'
            WHERE ur.user_id = v_me.id GROUP BY pm.resource, pm.action) x), '[]'),
    'unread_notifications', (SELECT count(*) FROM notifications WHERE user_id = v_me.id AND NOT is_read));
END $$;

CREATE OR REPLACE FUNCTION api_master_data() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_hidden text[];
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  v_hidden := fn_hidden_fields(v_me.id, 'INVENTORY');
  RETURN jsonb_build_object('ok', true,
    'branches', (SELECT jsonb_agg(to_jsonb(b) ORDER BY code) FROM branches b),
    'departments', (SELECT jsonb_agg(to_jsonb(d) || jsonb_build_object('branch_code', b.code) ORDER BY b.code, d.code)
                    FROM departments d JOIN branches b ON b.id = d.branch_id),
    'warehouses', (SELECT jsonb_agg(to_jsonb(w) || jsonb_build_object('branch_code', b.code) ORDER BY w.code)
                   FROM warehouses w JOIN branches b ON b.id = w.branch_id),
    'partners', (SELECT jsonb_agg(to_jsonb(p) ORDER BY code) FROM partners p),
    'products', (SELECT jsonb_agg(CASE WHEN 'unit_cost' = ANY(v_hidden) THEN to_jsonb(p) - 'standard_cost' ELSE to_jsonb(p) END ORDER BY code) FROM products p),
    'accounts', (SELECT jsonb_agg(to_jsonb(a) ORDER BY code) FROM accounts a),
    'boms', (SELECT jsonb_agg(to_jsonb(bo) || jsonb_build_object('product_name', p.name, 'lines',
               (SELECT jsonb_agg(jsonb_build_object('product_id', bl.product_id, 'product_name', lp.name, 'unit', lp.unit, 'quantity', bl.quantity))
                FROM bom_lines bl JOIN products lp ON lp.id = bl.product_id WHERE bl.bom_id = bo.id)))
             FROM boms bo JOIN products p ON p.id = bo.product_id),
    'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY sort) FROM roles r),
    'users', (SELECT jsonb_agg(jsonb_build_object('id', u.id, 'full_name', u.full_name, 'employee_code', u.employee_code,
                'position', u.position, 'department_id', u.department_id, 'branch_id', u.branch_id, 'status', u.status,
                'roles', fn_user_role_codes(u.id)) ORDER BY u.employee_code) FROM app_users u),
    'doc_types', (SELECT jsonb_agg(to_jsonb(t) ORDER BY sort) FROM doc_types t),
    'periods', (SELECT jsonb_agg(to_jsonb(f) ORDER BY period) FROM fiscal_periods f));
END $$;

-- ============================================================
-- DOCUMENT LISTS / DETAIL
-- ============================================================
CREATE OR REPLACE FUNCTION api_list_documents(p_doc_types text[], p_status text DEFAULT NULL, p_search text DEFAULT NULL,
                                              p_limit int DEFAULT 50, p_offset int DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_hidden jsonb; v_res jsonb; v_q text := nullif(trim(p_search), '');
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  SELECT coalesce(jsonb_object_agg(t, to_jsonb(fn_hidden_fields(v_me.id, t))), '{}') INTO v_hidden FROM unnest(p_doc_types) t;
  WITH vis AS (
    SELECT d AS doc FROM documents d
    WHERE d.doc_type = ANY(p_doc_types)
      AND (v_q IS NULL OR d.number ILIKE '%' || v_q || '%' OR coalesce(d.title, '') ILIKE '%' || v_q || '%'
           OR EXISTS (SELECT 1 FROM partners p WHERE p.id = d.partner_id AND p.name ILIKE '%' || v_q || '%'))
      AND fn_doc_in_scope(v_me.id, d, d.doc_type, 'VIEW')
  ), filtered AS (
    SELECT doc FROM vis WHERE p_status IS NULL OR (doc).status = p_status
  )
  SELECT jsonb_build_object('ok', true,
    'total', (SELECT count(*) FROM filtered),
    'status_counts', coalesce((SELECT jsonb_object_agg(s, n) FROM (SELECT (doc).status s, count(*) n FROM vis GROUP BY 1) x), '{}'),
    'rows', coalesce((
      SELECT jsonb_agg(fn_mask(fn_doc_json(p.doc), ARRAY(SELECT jsonb_array_elements_text(v_hidden->(p.doc).doc_type))) ORDER BY (p.doc).created_at DESC)
      FROM (SELECT doc FROM filtered ORDER BY (doc).created_at DESC LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)) p), '[]'))
  INTO v_res;
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION fn_line_progress(p_doc_type text, p_line uuid, p_qty numeric) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_doc_type
    WHEN 'PR' THEN jsonb_build_object('ordered', fn_consumed(p_line, 'PO'))
    WHEN 'PO' THEN jsonb_build_object('received', fn_consumed(p_line, 'GRN', ARRAY['STORED']),
                                      'invoiced', fn_consumed(p_line, 'SINV', ARRAY['POSTED','PARTIALLY_PAID','PAID']))
    WHEN 'QUOT' THEN jsonb_build_object('ordered', fn_consumed(p_line, 'SO'))
    WHEN 'SO' THEN jsonb_build_object('shipped', fn_consumed(p_line, 'DN', ARRAY['SHIPPED']),
                                      'invoiced', fn_consumed(p_line, 'INV', ARRAY['POSTED','PARTIALLY_PAID','PAID']))
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION fn_doc_ref(d documents, p_user uuid, p_link_type text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', d.id, 'number', d.number, 'doc_type', d.doc_type,
    'doc_type_name', (SELECT name FROM doc_types WHERE code = d.doc_type), 'status', d.status,
    'title', d.title, 'link_type', p_link_type, 'created_at', d.created_at,
    'can_view', fn_doc_in_scope(p_user, d, d.doc_type, 'VIEW'))
$$;

CREATE OR REPLACE FUNCTION fn_sla_status(p_status text, p_due timestamptz, p_initiated timestamptz, p_completed timestamptz) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_status = 'COMPLETED' THEN CASE WHEN p_completed <= p_due THEN 'ON_TIME' ELSE 'BREACHED' END
    WHEN p_status = 'CANCELLED' THEN 'CANCELLED'
    WHEN fn_now() > p_due THEN 'BREACHED'
    WHEN fn_now() > p_initiated + (p_due - p_initiated) * 0.75 THEN 'AT_RISK'
    ELSE 'ON_TIME' END
$$;

CREATE OR REPLACE FUNCTION api_get_document(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_doc documents; v_hidden text[]; v_inv_hidden text[];
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  SELECT * INTO v_doc FROM documents WHERE id = p_id;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ'); END IF;
  IF NOT fn_doc_in_scope(v_me.id, v_doc, v_doc.doc_type, 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN', format('Bạn không có quyền xem %s (ngoài phạm vi dữ liệu)', v_doc.number));
  END IF;
  v_hidden := fn_hidden_fields(v_me.id, v_doc.doc_type);
  v_inv_hidden := fn_hidden_fields(v_me.id, 'INVENTORY');

  RETURN jsonb_build_object('ok', true,
    'document', fn_mask(fn_doc_json(v_doc), v_hidden),
    'lines', coalesce((
      SELECT jsonb_agg(fn_mask(to_jsonb(l) || jsonb_build_object(
          'product_code', p.code, 'product_name', p.name, 'unit', p.unit, 'account_name', a.name,
          'source_document_id', sd.id, 'source_document_number', sd.number,
          'progress', fn_line_progress(v_doc.doc_type, l.id, l.quantity)), v_hidden) ORDER BY l.line_no)
      FROM document_lines l
      LEFT JOIN products p ON p.id = l.product_id
      LEFT JOIN accounts a ON a.code = l.account_code
      LEFT JOIN document_lines sl ON sl.id = l.source_line_id
      LEFT JOIN documents sd ON sd.id = sl.document_id
      WHERE l.document_id = v_doc.id), '[]'),
    'parents', coalesce((SELECT jsonb_agg(fn_doc_ref(d, v_me.id, l.link_type) ORDER BY d.created_at)
      FROM document_links l JOIN documents d ON d.id = l.parent_id WHERE l.child_id = v_doc.id), '[]'),
    'children', coalesce((SELECT jsonb_agg(fn_doc_ref(d, v_me.id, l.link_type) ORDER BY d.created_at)
      FROM document_links l JOIN documents d ON d.id = l.child_id WHERE l.parent_id = v_doc.id), '[]'),
    'actions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action,
          'label', coalesce(t.label, CASE a.action WHEN 'create' THEN 'Tạo chứng từ' WHEN 'edit' THEN 'Chỉnh sửa' ELSE a.action END),
          'from_status', a.from_status, 'to_status', a.to_status, 'user_id', a.user_id, 'user_name', u.full_name,
          'position', u.position, 'user_roles', a.user_roles, 'department_name', dp.name, 'sod_role', a.sod_role,
          'comment', a.comment, 'created_at', a.created_at) ORDER BY a.created_at, a.id)
      FROM document_actions a
      JOIN app_users u ON u.id = a.user_id
      LEFT JOIN departments dp ON dp.id = a.department_id
      LEFT JOIN LATERAL (SELECT st.label FROM state_transitions st WHERE st.doc_type = v_doc.doc_type AND st.action = a.action LIMIT 1) t ON true
      WHERE a.document_id = v_doc.id), '[]'),
    'available_actions', fn_available_actions(v_doc, v_me.id),
    'handoffs', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'to_role', h.to_role, 'to_role_name', r.name,
          'expected_action', m.expected_action, 'from_user_name', fu.full_name, 'from_department', fd.name,
          'to_user_name', tu.full_name, 'to_department', td.name, 'status', h.status,
          'initiated_at', h.initiated_at, 'completed_at', h.completed_at, 'sla_due_at', h.sla_due_at,
          'sla_status', fn_sla_status(h.status, h.sla_due_at, h.initiated_at, h.completed_at),
          'cross_department', h.to_department_id IS NOT NULL AND h.to_department_id <> h.from_department_id)
        ORDER BY h.initiated_at)
      FROM handoff_records h JOIN handoff_map m ON m.id = h.handoff_map_id JOIN roles r ON r.code = h.to_role
      LEFT JOIN app_users fu ON fu.id = h.from_user_id LEFT JOIN departments fd ON fd.id = h.from_department_id
      LEFT JOIN app_users tu ON tu.id = h.to_user_id LEFT JOIN departments td ON td.id = h.to_department_id
      WHERE h.document_id = v_doc.id), '[]'),
    'gl_entries', CASE WHEN fn_perm_scope(v_me.id, 'GL', 'VIEW') > 0 AND NOT ('amount' = ANY(v_hidden)) THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('account_code', g.account_code, 'account_name', a.name, 'debit', g.debit,
          'credit', g.credit, 'posting_date', g.posting_date, 'period', g.period, 'description', g.description,
          'partner_name', p.name) ORDER BY g.created_at, g.debit DESC)
      FROM gl_entries g JOIN accounts a ON a.code = g.account_code LEFT JOIN partners p ON p.id = g.partner_id
      WHERE g.document_id = v_doc.id), '[]') END,
    'stock_moves', CASE WHEN fn_perm_scope(v_me.id, 'INVENTORY', 'VIEW') > 0 THEN coalesce((
      SELECT jsonb_agg(fn_mask(jsonb_build_object('id', m.id, 'move_type', m.move_type, 'qty', m.qty, 'unit_cost', m.unit_cost,
          'value', round(m.qty * m.unit_cost, 2), 'remaining_qty', m.remaining_qty, 'product_code', p.code,
          'product_name', p.name, 'unit', p.unit, 'warehouse_name', w.name, 'source_move_id', m.source_move_id,
          'source_document_number', sd.number, 'created_at', m.created_at), v_inv_hidden) ORDER BY m.created_at, m.id)
      FROM stock_moves m JOIN products p ON p.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id
      LEFT JOIN stock_moves sm ON sm.id = m.source_move_id LEFT JOIN documents sd ON sd.id = sm.document_id
      WHERE m.document_id = v_doc.id), '[]') END,
    'audit', CASE WHEN fn_perm_scope(v_me.id, 'AUDIT_TRAIL', 'VIEW') > 0 THEN coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'id')::bigint DESC) FROM (
        SELECT jsonb_build_object('id', t.id, 'table_name', t.table_name, 'action', t.action, 'old_value', t.old_value,
          'new_value', t.new_value, 'changed_fields', t.changed_fields, 'user_name', t.user_name, 'created_at', t.created_at) x
        FROM audit_trail t
        WHERE (t.table_name = 'documents' AND t.record_id = v_doc.id::text)
           OR (t.table_name = 'document_lines' AND t.record_id IN (SELECT id::text FROM document_lines WHERE document_id = v_doc.id))
        ORDER BY t.id DESC LIMIT 150) s), '[]') END,
    'sod_checks', CASE WHEN fn_perm_scope(v_me.id, 'SOD_LOG', 'VIEW') > 0 OR v_doc.created_by = v_me.id THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('action', s.action, 'user_name', u.full_name, 'attempted_role', s.attempted_role,
          'conflicting_role', s.conflicting_role, 'result', s.result, 'detail', s.detail, 'checked_at', s.checked_at) ORDER BY s.checked_at DESC)
      FROM sod_check_log s LEFT JOIN app_users u ON u.id = s.user_id WHERE s.document_id = v_doc.id), '[]') END,
    'transitions', (SELECT jsonb_agg(jsonb_build_object('from', from_status, 'to', to_status, 'label', label,
          'sod_role', sod_role, 'system_only', system_only, 'permission', permission_action) ORDER BY sort)
      FROM state_transitions WHERE doc_type = v_doc.doc_type),
    'budget', CASE WHEN v_doc.doc_type = 'BUDGET' THEN jsonb_build_object(
      'planned', (SELECT coalesce(sum(amount), 0) FROM document_lines WHERE document_id = v_doc.id),
      'committed', (SELECT coalesce(sum(amount), 0) FROM budget_usage WHERE budget_id = v_doc.id AND usage_type = 'COMMITTED'),
      'actual', (SELECT coalesce(sum(amount), 0) FROM budget_usage WHERE budget_id = v_doc.id AND usage_type = 'ACTUAL'),
      'usage', coalesce((SELECT jsonb_agg(jsonb_build_object('document_id', d.id, 'number', d.number, 'doc_type', d.doc_type,
          'usage_type', bu.usage_type, 'amount', bu.amount, 'created_at', bu.created_at) ORDER BY bu.created_at)
        FROM budget_usage bu JOIN documents d ON d.id = bu.document_id WHERE bu.budget_id = v_doc.id), '[]')) END);
END $$;

CREATE OR REPLACE FUNCTION api_search(p_q text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF length(trim(coalesce(p_q, ''))) < 2 THEN RETURN jsonb_build_object('ok', true, 'rows', '[]'::jsonb); END IF;
  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(fn_doc_ref(d, v_me.id, NULL)) FROM (
      SELECT d FROM documents d
      WHERE (d.number ILIKE '%' || trim(p_q) || '%' OR coalesce(d.title, '') ILIKE '%' || trim(p_q) || '%')
        AND fn_doc_in_scope(v_me.id, d, d.doc_type, 'VIEW')
      ORDER BY d.created_at DESC LIMIT 15) x(d)), '[]'));
END $$;

-- ============================================================
-- INBOX & DASHBOARD & NOTIFICATIONS
-- ============================================================
CREATE OR REPLACE FUNCTION api_inbox() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); d documents; v_acts jsonb; v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  FOR d IN
    SELECT doc.* FROM documents doc JOIN doc_types dt ON dt.code = doc.doc_type
    WHERE NOT (doc.status = ANY(dt.terminal_statuses))
    ORDER BY doc.updated_at DESC LIMIT 600
  LOOP
    CONTINUE WHEN NOT fn_doc_in_scope(v_me.id, d, d.doc_type, 'VIEW');
    SELECT coalesce(jsonb_agg(a), '[]'::jsonb) INTO v_acts
    FROM jsonb_array_elements(fn_available_actions(d, v_me.id)) a
    WHERE (a->>'kind' = 'transition' AND a->>'style' IN ('primary','success'))
       OR (a->>'kind' = 'create' AND a->>'child_type' NOT IN ('TICKET','WO'));
    IF jsonb_array_length(v_acts) > 0 THEN
      v_rows := v_rows || jsonb_build_object(
        'document', fn_mask(fn_doc_json(d), fn_hidden_fields(v_me.id, d.doc_type)),
        'actions', v_acts,
        'blocked_by_sod', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_acts) a WHERE a->'sod_conflict' = 'null'::jsonb),
        'handoff', (SELECT jsonb_build_object('expected_action', m.expected_action, 'sla_due_at', h.sla_due_at,
                      'sla_status', fn_sla_status(h.status, h.sla_due_at, h.initiated_at, h.completed_at))
                    FROM handoff_records h JOIN handoff_map m ON m.id = h.handoff_map_id
                    WHERE h.document_id = d.id AND h.status = 'INITIATED' ORDER BY h.initiated_at DESC LIMIT 1));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'count', jsonb_array_length(v_rows));
END $$;

CREATE OR REPLACE FUNCTION api_notifications(p_limit int DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  RETURN jsonb_build_object('ok', true,
    'unread', (SELECT count(*) FROM notifications WHERE user_id = v_me.id AND NOT is_read),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM (
      SELECT * FROM notifications WHERE user_id = v_me.id ORDER BY created_at DESC LIMIT p_limit) n), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_dashboard() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_activity jsonb := '[]'::jsonb; a record; v_doc documents; v_n int := 0;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  FOR a IN
    SELECT da.*, u.full_name, dp.name AS dept FROM document_actions da
    JOIN app_users u ON u.id = da.user_id LEFT JOIN departments dp ON dp.id = da.department_id
    ORDER BY da.created_at DESC LIMIT 150
  LOOP
    EXIT WHEN v_n >= 15;
    SELECT * INTO v_doc FROM documents WHERE id = a.document_id;
    CONTINUE WHEN NOT fn_doc_in_scope(v_me.id, v_doc, v_doc.doc_type, 'VIEW');
    v_n := v_n + 1;
    v_activity := v_activity || jsonb_build_object('document_id', v_doc.id, 'number', v_doc.number, 'doc_type', v_doc.doc_type,
      'action', a.action, 'label', coalesce((SELECT label FROM state_transitions st WHERE st.doc_type = v_doc.doc_type AND st.action = a.action LIMIT 1),
                                          CASE a.action WHEN 'create' THEN 'Tạo chứng từ' ELSE a.action END),
      'to_status', a.to_status, 'user_name', a.full_name, 'department_name', a.dept, 'sod_role', a.sod_role, 'created_at', a.created_at);
  END LOOP;
  RETURN jsonb_build_object('ok', true,
    'activity', v_activity,
    'my_documents', coalesce((SELECT jsonb_agg(fn_doc_ref(x.d, v_me.id, NULL)) FROM (
        SELECT d FROM documents d JOIN doc_types dt ON dt.code = d.doc_type
        WHERE d.created_by = v_me.id AND NOT (d.status = ANY(dt.terminal_statuses))
        ORDER BY d.updated_at DESC LIMIT 8) x), '[]'),
    'module_counts', coalesce((SELECT jsonb_object_agg(module, n) FROM (
        SELECT dt.module, count(*) n FROM documents d JOIN doc_types dt ON dt.code = d.doc_type
        WHERE fn_doc_in_scope(v_me.id, d, d.doc_type, 'VIEW') GROUP BY dt.module) m), '{}'),
    'sod_blocked_today', (SELECT count(*) FROM sod_check_log WHERE result = 'BLOCKED' AND user_id = v_me.id
                          AND checked_at > fn_now() - interval '30 days'));
END $$;

-- ============================================================
-- TRACE PATHS (ĐK4) — money, goods, responsibility
-- ============================================================
CREATE OR REPLACE FUNCTION fn_chain_ids(p_id uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE up(id, depth) AS (
    SELECT p_id, 0
    UNION
    SELECT l.parent_id, u.depth + 1 FROM document_links l JOIN up u ON l.child_id = u.id WHERE u.depth < 12
  ), down(id, depth) AS (
    SELECT u.id, 0 FROM up u JOIN documents d ON d.id = u.id WHERE d.doc_type <> 'BUDGET'
    UNION
    SELECT l.child_id, dn.depth + 1 FROM document_links l JOIN down dn ON l.parent_id = dn.id
    JOIN documents c ON c.id = l.child_id
    WHERE dn.depth < 12 AND c.doc_type <> 'BUDGET' AND l.link_type <> 'DEPRECIATION'
  )
  SELECT id FROM up UNION SELECT id FROM down
$$;

CREATE OR REPLACE FUNCTION fn_trace_nodes(p_id uuid, p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('id', d.id, 'number', d.number, 'doc_type', d.doc_type, 'doc_type_name', dt.name,
      'flow_code', dt.flow_code, 'status', d.status, 'title', d.title, 'doc_date', d.doc_date, 'created_at', d.created_at,
      'partner_name', p.name, 'created_by_name', u.full_name, 'is_start', d.id = p_id, 'can_view', v.can_view,
      'amount', CASE WHEN v.can_view AND NOT ('amount' = ANY(fn_hidden_fields(p_user, d.doc_type))) THEN d.amount END,
      'paid_amount', CASE WHEN v.can_view THEN (d.data->>'paid_amount')::numeric END,
      'depth_parents', (SELECT jsonb_agg(l.parent_id) FROM document_links l WHERE l.child_id = d.id AND l.parent_id IN (SELECT fn_chain_ids(p_id))))
    ORDER BY d.created_at), '[]')
  FROM fn_chain_ids(p_id) c(id)
  JOIN documents d ON d.id = c.id
  JOIN doc_types dt ON dt.code = d.doc_type
  LEFT JOIN partners p ON p.id = d.partner_id
  LEFT JOIN app_users u ON u.id = d.created_by
  CROSS JOIN LATERAL (SELECT fn_doc_in_scope(p_user, d, d.doc_type, 'VIEW') AS can_view) v
$$;

CREATE OR REPLACE FUNCTION fn_trace_edges(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('parent_id', l.parent_id, 'child_id', l.child_id, 'link_type', l.link_type)), '[]')
  FROM document_links l
  WHERE l.parent_id IN (SELECT fn_chain_ids(p_id)) AND l.child_id IN (SELECT fn_chain_ids(p_id))
$$;

CREATE OR REPLACE FUNCTION fn_trace_start(p_id uuid, p_user uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d documents;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_id;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ'); END IF;
  IF NOT fn_doc_in_scope(p_user, d, d.doc_type, 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền truy vết chứng từ này');
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION api_trace_money(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user(); v_err jsonb; d documents; v_checks jsonb := '[]'::jsonb;
  v_gl_scope int; v_sum numeric; v_d numeric; v_c numeric; v_gl jsonb := '[]'::jsonb; v_path jsonb;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  v_err := fn_trace_start(p_id, v_me.id);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  v_gl_scope := fn_perm_scope(v_me.id, 'GL', 'VIEW');

  -- upward money path from the start document (Payment → Invoice → PO → PR → Budget)
  WITH RECURSIVE up(id, depth) AS (
    SELECT p_id, 0
    UNION
    SELECT l.parent_id, u.depth + 1 FROM document_links l JOIN up u ON l.child_id = u.id
    WHERE u.depth < 12 AND l.link_type IN ('SOURCE','REFERENCE','EXCEPTION')
  )
  SELECT jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'doc_type', x.doc_type, 'depth', x.depth) ORDER BY x.depth, x.doc_type = 'BUDGET')
  INTO v_path FROM (SELECT DISTINCT ON (dd.id) dd.id, dd.number, dd.doc_type, u.depth FROM up u JOIN documents dd ON dd.id = u.id ORDER BY dd.id, u.depth) x;

  FOR d IN SELECT doc.* FROM documents doc WHERE doc.id IN (SELECT fn_chain_ids(p_id)) ORDER BY doc.created_at LOOP
    CONTINUE WHEN NOT fn_doc_in_scope(v_me.id, d, d.doc_type, 'VIEW') OR 'amount' = ANY(fn_hidden_fields(v_me.id, d.doc_type));
    IF v_gl_scope > 0 THEN
      SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0) INTO v_d, v_c FROM gl_entries WHERE document_id = d.id;
      IF v_d > 0 OR v_c > 0 THEN
        v_gl := v_gl || jsonb_build_object('document_id', d.id, 'number', d.number, 'doc_type', d.doc_type, 'entries', (
          SELECT jsonb_agg(jsonb_build_object('account_code', g.account_code, 'account_name', a.name, 'debit', g.debit,
                   'credit', g.credit, 'posting_date', g.posting_date, 'description', g.description) ORDER BY g.created_at, g.debit DESC)
          FROM gl_entries g JOIN accounts a ON a.code = g.account_code WHERE g.document_id = d.id));
        v_checks := v_checks || jsonb_build_object('label', 'Bút toán cân Nợ = Có', 'document_number', d.number,
          'expected', v_d, 'actual', v_c, 'ok', v_d = v_c);
      END IF;
    END IF;
    IF d.doc_type = 'PO' THEN
      v_sum := fn_children_amount(d.id, 'SINV', ARRAY['POSTED','PARTIALLY_PAID','PAID']);
      v_checks := v_checks || jsonb_build_object('label', 'Hóa đơn NCC đã ghi sổ ≤ giá trị PO (+2%)', 'document_number', d.number,
        'expected', d.amount, 'actual', v_sum, 'ok', v_sum <= d.amount * 1.02);
      SELECT coalesce(sum(g.amount), 0) INTO v_sum FROM document_links l JOIN documents g ON g.id = l.child_id
      WHERE l.parent_id = d.id AND g.doc_type = 'GRN' AND g.status = 'STORED';
      v_checks := v_checks || jsonb_build_object('label', 'Giá trị nhập kho (GRN) ≤ giá trị PO', 'document_number', d.number,
        'expected', d.amount, 'actual', v_sum, 'ok', v_sum <= d.amount);
    ELSIF d.doc_type = 'PR' THEN
      v_sum := fn_children_amount(d.id, 'PO');
      v_checks := v_checks || jsonb_build_object('label', 'Giá trị PO so với dự toán PR (thông tin)', 'document_number', d.number,
        'expected', d.amount, 'actual', v_sum, 'ok', true);
    ELSIF d.doc_type IN ('SINV','PAYROLL','ASSET') AND d.status NOT IN ('DRAFT','CALCULATED','CANCELLED') THEN
      v_sum := fn_children_amount(d.id, 'PMT', ARRAY['PAID','AUDITED']);
      v_checks := v_checks || jsonb_build_object('label', 'Đã thanh toán ≤ số phải trả', 'document_number', d.number,
        'expected', d.amount, 'actual', v_sum, 'ok', v_sum <= d.amount);
    ELSIF d.doc_type = 'SO' THEN
      v_sum := fn_children_amount(d.id, 'INV', ARRAY['POSTED','PARTIALLY_PAID','PAID']);
      v_checks := v_checks || jsonb_build_object('label', 'Doanh thu đã xuất hóa đơn ≤ giá trị SO', 'document_number', d.number,
        'expected', d.amount, 'actual', v_sum, 'ok', v_sum <= d.amount);
    ELSIF d.doc_type = 'INV' AND d.status <> 'DRAFT' THEN
      v_sum := fn_children_amount(d.id, 'RCPT', ARRAY['RECEIVED','AUDITED']);
      v_checks := v_checks || jsonb_build_object('label', 'Đã thu ≤ giá trị hóa đơn', 'document_number', d.number,
        'expected', d.amount, 'actual', v_sum, 'ok', v_sum <= d.amount);
    ELSIF d.doc_type = 'BUDGET' THEN
      SELECT coalesce(sum(amount), 0) INTO v_sum FROM budget_usage WHERE budget_id = d.id;
      v_checks := v_checks || jsonb_build_object('label', 'Cam kết + thực chi ≤ ngân sách', 'document_number', d.number,
        'expected', d.amount, 'actual', v_sum, 'ok', v_sum <= d.amount);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'start_id', p_id, 'path', v_path,
    'nodes', fn_trace_nodes(p_id, v_me.id), 'edges', fn_trace_edges(p_id),
    'gl', CASE WHEN v_gl_scope > 0 THEN v_gl END, 'checks', v_checks);
END $$;

CREATE OR REPLACE FUNCTION fn_doc_lineage(p_doc_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE up(id, depth) AS (
    SELECT l.parent_id, 1 FROM document_links l WHERE l.child_id = p_doc_id AND l.link_type = 'SOURCE'
    UNION
    SELECT l.parent_id, u.depth + 1 FROM document_links l JOIN up u ON l.child_id = u.id WHERE u.depth < 6 AND l.link_type = 'SOURCE'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'doc_type', d.doc_type) ORDER BY u.depth), '[]')
  FROM up u JOIN documents d ON d.id = u.id
$$;

CREATE OR REPLACE FUNCTION fn_move_node(p_move uuid, p_hidden text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT fn_mask(jsonb_build_object('id', m.id, 'move_type', m.move_type, 'qty', m.qty, 'unit_cost', m.unit_cost,
    'value', round(abs(m.qty) * m.unit_cost, 2), 'remaining_qty', m.remaining_qty,
    'product_code', p.code, 'product_name', p.name, 'unit', p.unit, 'warehouse_name', w.name,
    'document_id', d.id, 'document_number', d.number, 'doc_type', d.doc_type, 'partner_name', pa.name,
    'created_at', m.created_at, 'lineage', fn_doc_lineage(d.id)), p_hidden)
  FROM stock_moves m JOIN products p ON p.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id
  JOIN documents d ON d.id = m.document_id LEFT JOIN partners pa ON pa.id = d.partner_id
  WHERE m.id = p_move
$$;

-- provenance: where did these goods come from?
CREATE OR REPLACE FUNCTION fn_move_upstream(p_move uuid, p_hidden text[], p_depth int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m stock_moves; v_src jsonb := '[]'::jsonb; x record;
BEGIN
  SELECT * INTO m FROM stock_moves WHERE id = p_move;
  IF p_depth < 8 THEN
    IF m.source_move_id IS NOT NULL THEN
      v_src := v_src || fn_move_upstream(m.source_move_id, p_hidden, p_depth + 1);
    END IF;
    IF m.move_type = 'WO_OUTPUT' THEN
      FOR x IN SELECT id FROM stock_moves WHERE document_id = m.document_id AND move_type = 'WO_ISSUE' ORDER BY created_at, id LOOP
        v_src := v_src || fn_move_upstream(x.id, p_hidden, p_depth + 1);
      END LOOP;
    END IF;
  END IF;
  RETURN fn_move_node(p_move, p_hidden) || jsonb_build_object('sources', v_src);
END $$;

-- where-used: where did these goods go?
CREATE OR REPLACE FUNCTION fn_move_downstream(p_move uuid, p_hidden text[], p_depth int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m stock_moves; v_dst jsonb := '[]'::jsonb; x record;
BEGIN
  SELECT * INTO m FROM stock_moves WHERE id = p_move;
  IF p_depth < 8 THEN
    FOR x IN SELECT id FROM stock_moves WHERE source_move_id = p_move ORDER BY created_at, id LOOP
      v_dst := v_dst || fn_move_downstream(x.id, p_hidden, p_depth + 1);
    END LOOP;
    IF m.move_type = 'WO_ISSUE' THEN
      FOR x IN SELECT DISTINCT id FROM stock_moves WHERE document_id = m.document_id AND move_type = 'WO_OUTPUT' LOOP
        v_dst := v_dst || fn_move_downstream(x.id, p_hidden, p_depth + 1);
      END LOOP;
    END IF;
  END IF;
  RETURN fn_move_node(p_move, p_hidden) || jsonb_build_object('consumers', v_dst);
END $$;

CREATE OR REPLACE FUNCTION api_trace_goods(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user(); v_err jsonb; v_hidden text[]; v_up jsonb := '[]'::jsonb; v_down jsonb := '[]'::jsonb;
  v_checks jsonb := '[]'::jsonb; m record; l record; v_d documents; v_n int := 0;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  v_err := fn_trace_start(p_id, v_me.id);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  IF fn_perm_scope(v_me.id, 'INVENTORY', 'VIEW') = 0 THEN
    RETURN jsonb_build_object('ok', true, 'start_id', p_id, 'nodes', fn_trace_nodes(p_id, v_me.id), 'edges', fn_trace_edges(p_id),
      'restricted', true, 'upstream', '[]'::jsonb, 'downstream', '[]'::jsonb, 'checks', '[]'::jsonb);
  END IF;
  v_hidden := fn_hidden_fields(v_me.id, 'INVENTORY');

  FOR m IN
    SELECT sm.id, sm.qty, sm.move_type FROM stock_moves sm
    WHERE sm.document_id IN (SELECT fn_chain_ids(p_id))
    ORDER BY (sm.document_id = p_id) DESC, sm.created_at, sm.id
  LOOP
    EXIT WHEN v_n >= 40;
    v_n := v_n + 1;
    IF m.qty < 0 AND m.move_type <> 'ST_OUT' THEN
      v_up := v_up || fn_move_upstream(m.id, v_hidden, 0);
    ELSIF m.qty > 0 THEN
      v_down := v_down || fn_move_downstream(m.id, v_hidden, 0);
    END IF;
  END LOOP;

  -- consistency: no phantom stock (lot qty − consumed = remaining)
  FOR m IN
    SELECT sm.id, sm.qty, sm.remaining_qty, d.number, p.name,
           coalesce((SELECT -sum(c.qty) FROM stock_moves c WHERE c.source_move_id = sm.id AND c.qty < 0), 0) AS consumed
    FROM stock_moves sm JOIN documents d ON d.id = sm.document_id JOIN products p ON p.id = sm.product_id
    WHERE sm.qty > 0 AND sm.document_id IN (SELECT fn_chain_ids(p_id))
  LOOP
    v_checks := v_checks || jsonb_build_object('label', 'Lô ' || m.name || ': nhập − đã xuất = còn lại', 'document_number', m.number,
      'expected', m.qty - m.consumed, 'actual', m.remaining_qty, 'ok', m.qty - m.consumed = m.remaining_qty);
  END LOOP;
  FOR v_d IN SELECT doc.* FROM documents doc WHERE doc.id IN (SELECT fn_chain_ids(p_id)) AND doc.doc_type IN ('PO','SO') LOOP
    FOR l IN SELECT dl.*, p.name FROM document_lines dl JOIN products p ON p.id = dl.product_id WHERE dl.document_id = v_d.id LOOP
      IF v_d.doc_type = 'PO' THEN
        v_checks := v_checks || jsonb_build_object('label', l.name || ': nhận ≤ đặt', 'document_number', v_d.number,
          'expected', l.quantity, 'actual', fn_consumed(l.id, 'GRN', ARRAY['STORED']),
          'ok', fn_consumed(l.id, 'GRN', ARRAY['STORED']) <= l.quantity);
        v_checks := v_checks || jsonb_build_object('label', l.name || ': hóa đơn ≤ nhận', 'document_number', v_d.number,
          'expected', fn_consumed(l.id, 'GRN', ARRAY['STORED']), 'actual', fn_consumed(l.id, 'SINV', ARRAY['POSTED','PARTIALLY_PAID','PAID']),
          'ok', fn_consumed(l.id, 'SINV', ARRAY['POSTED','PARTIALLY_PAID','PAID']) <= fn_consumed(l.id, 'GRN', ARRAY['STORED']));
      ELSE
        v_checks := v_checks || jsonb_build_object('label', l.name || ': giao ≤ đặt', 'document_number', v_d.number,
          'expected', l.quantity, 'actual', fn_consumed(l.id, 'DN', ARRAY['SHIPPED']),
          'ok', fn_consumed(l.id, 'DN', ARRAY['SHIPPED']) <= l.quantity);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'start_id', p_id, 'nodes', fn_trace_nodes(p_id, v_me.id), 'edges', fn_trace_edges(p_id),
    'upstream', v_up, 'downstream', v_down, 'checks', v_checks);
END $$;

CREATE OR REPLACE FUNCTION api_trace_responsibility(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user(); v_err jsonb; v_doc_id uuid := p_id; v_action_id uuid; d documents;
  v_docs jsonb := '[]'::jsonb; v_checks jsonb := '[]'::jsonb; v_owner jsonb; v_people jsonb;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  -- accept either a document id or an action id
  IF NOT EXISTS (SELECT 1 FROM documents WHERE id = p_id) THEN
    SELECT document_id, id INTO v_doc_id, v_action_id FROM document_actions WHERE id = p_id;
  END IF;
  v_err := fn_trace_start(v_doc_id, v_me.id);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;

  FOR d IN SELECT doc.* FROM documents doc WHERE doc.id IN (SELECT fn_chain_ids(v_doc_id)) ORDER BY doc.created_at LOOP
    CONTINUE WHEN NOT fn_doc_in_scope(v_me.id, d, d.doc_type, 'VIEW');
    SELECT jsonb_build_object('process', o.business_process, 'flow_code', o.flow_code, 'owner_name', ou.full_name,
             'owner_position', ou.position, 'deputy_name', du.full_name, 'department_name', od.name)
    INTO v_owner
    FROM ownership_matrix o JOIN app_users ou ON ou.id = o.owner_user_id
    LEFT JOIN app_users du ON du.id = o.deputy_user_id LEFT JOIN departments od ON od.id = o.department_id
    WHERE d.doc_type = ANY(o.doc_types) AND o.effective_from <= (fn_now())::date
      AND (o.effective_to IS NULL OR o.effective_to >= (fn_now())::date)
    ORDER BY o.effective_from DESC LIMIT 1;

    v_docs := v_docs || jsonb_build_object(
      'document', fn_doc_ref(d, v_me.id, NULL) || jsonb_build_object('is_start', d.id = v_doc_id),
      'owner', v_owner,
      'actions', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action,
            'label', coalesce((SELECT label FROM state_transitions st WHERE st.doc_type = d.doc_type AND st.action = a.action LIMIT 1),
                              CASE a.action WHEN 'create' THEN 'Tạo chứng từ' WHEN 'edit' THEN 'Chỉnh sửa' ELSE a.action END),
            'to_status', a.to_status, 'user_id', u.id, 'user_name', u.full_name, 'employee_code', u.employee_code,
            'position', u.position, 'department_name', dp.name, 'branch_code', b.code, 'sod_role', a.sod_role,
            'roles', (SELECT jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name) ORDER BY r.sort) FROM roles r WHERE r.code = ANY(a.user_roles)),
            'comment', a.comment, 'created_at', a.created_at, 'highlight', a.id = v_action_id) ORDER BY a.created_at, a.id)
        FROM document_actions a JOIN app_users u ON u.id = a.user_id
        LEFT JOIN departments dp ON dp.id = a.department_id LEFT JOIN branches b ON b.id = u.branch_id
        WHERE a.document_id = d.id), '[]'),
      'handoffs', coalesce((
        SELECT jsonb_agg(jsonb_build_object('expected_action', m.expected_action, 'to_role', h.to_role,
            'from_department', fd.name, 'to_department', td.name, 'to_user_name', tu.full_name, 'status', h.status,
            'sla_status', fn_sla_status(h.status, h.sla_due_at, h.initiated_at, h.completed_at)) ORDER BY h.initiated_at)
        FROM handoff_records h JOIN handoff_map m ON m.id = h.handoff_map_id
        LEFT JOIN departments fd ON fd.id = h.from_department_id LEFT JOIN departments td ON td.id = h.to_department_id
        LEFT JOIN app_users tu ON tu.id = h.to_user_id
        WHERE h.document_id = d.id), '[]'));
    v_checks := v_checks || jsonb_build_object('label', 'Có chủ sở hữu quy trình (BM-02)', 'document_number', d.number,
      'ok', v_owner IS NOT NULL, 'actual', v_owner->>'owner_name');
  END LOOP;

  -- people involved and the SoD roles they held across the chain
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'user_name'), '[]') INTO v_people FROM (
    SELECT jsonb_build_object('user_id', u.id, 'user_name', u.full_name, 'position', u.position, 'department_name', dp.name,
      'sod_roles', to_jsonb(array_remove(array_agg(DISTINCT a.sod_role), NULL)),
      'action_count', count(*),
      'conflict', EXISTS (SELECT 1 FROM sod_matrix sm WHERE sm.conflict_type = 'HARD'
                          AND sm.role_a = ANY(array_agg(a.sod_role)) AND sm.role_b = ANY(array_agg(a.sod_role)))) x
    FROM document_actions a JOIN app_users u ON u.id = a.user_id LEFT JOIN departments dp ON dp.id = u.department_id
    JOIN documents cd ON cd.id = a.document_id
    -- budgets and exceptions are outside the SoD transaction context
    WHERE a.document_id IN (SELECT fn_chain_ids(v_doc_id)) AND cd.doc_type NOT IN ('BUDGET','EXC')
    GROUP BY u.id, u.full_name, u.position, dp.name) s;

  v_checks := v_checks || jsonb_build_object('label', 'Mọi phê duyệt có người duyệt + thời điểm', 'ok', NOT EXISTS (
    SELECT 1 FROM document_actions WHERE document_id IN (SELECT fn_chain_ids(v_doc_id)) AND sod_role = 'APPROVER'
      AND (user_id IS NULL OR created_at IS NULL)));

  RETURN jsonb_build_object('ok', true, 'start_id', v_doc_id, 'action_id', v_action_id,
    'documents', v_docs, 'people', v_people, 'edges', fn_trace_edges(v_doc_id), 'checks', v_checks);
END $$;

-- ============================================================
-- REPORTS
-- ============================================================
CREATE OR REPLACE FUNCTION fn_gl_filter(p_user uuid, p_branch uuid, p_dept uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s int := fn_perm_scope(p_user, 'GL', 'VIEW'); u app_users;
BEGIN
  IF s >= 4 THEN RETURN true; END IF;
  SELECT * INTO u FROM app_users WHERE id = p_user;
  IF s = 3 THEN RETURN p_branch = u.branch_id; END IF;
  IF s >= 1 THEN RETURN p_dept = u.department_id; END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION api_trial_balance(p_from text, p_to text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'GL', 'VIEW') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem sổ cái'); END IF;
  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to,
    'scope', (SELECT (ARRAY['OWN','DEPARTMENT','BRANCH','COMPANY'])[fn_perm_scope(v_me.id, 'GL', 'VIEW')]),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('account_code', code, 'account_name', name, 'account_type', account_type,
          'opening', opening, 'debit', pd, 'credit', pc, 'closing', opening + pd - pc) ORDER BY code)
      FROM (
        SELECT a.code, a.name, a.account_type,
          coalesce(sum(g.debit - g.credit) FILTER (WHERE g.period < p_from), 0) AS opening,
          coalesce(sum(g.debit) FILTER (WHERE g.period >= p_from), 0) AS pd,
          coalesce(sum(g.credit) FILTER (WHERE g.period >= p_from), 0) AS pc
        FROM accounts a
        LEFT JOIN gl_entries g ON g.account_code = a.code AND g.period <= p_to AND fn_gl_filter(v_me.id, g.branch_id, g.department_id)
        GROUP BY a.code, a.name, a.account_type) t
      WHERE opening <> 0 OR pd <> 0 OR pc <> 0), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_financial_statements(p_from text, p_to text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_income jsonb; v_bs jsonb; v_rev numeric; v_exp numeric; v_profit_all numeric;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'GL', 'VIEW') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem báo cáo tài chính'); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('account_code', code, 'account_name', name, 'account_type', account_type, 'amount', amt) ORDER BY code), '[]'),
         coalesce(sum(amt) FILTER (WHERE account_type = 'REVENUE'), 0), coalesce(sum(amt) FILTER (WHERE account_type = 'EXPENSE'), 0)
  INTO v_income, v_rev, v_exp
  FROM (SELECT a.code, a.name, a.account_type,
          CASE WHEN a.account_type = 'REVENUE' THEN sum(g.credit - g.debit) ELSE sum(g.debit - g.credit) END AS amt
        FROM accounts a JOIN gl_entries g ON g.account_code = a.code
        WHERE a.account_type IN ('REVENUE','EXPENSE') AND g.period BETWEEN p_from AND p_to
          AND fn_gl_filter(v_me.id, g.branch_id, g.department_id)
        GROUP BY a.code, a.name, a.account_type) x;

  SELECT coalesce(sum(CASE WHEN a.account_type = 'REVENUE' THEN g.credit - g.debit ELSE g.debit - g.credit END *
                      CASE WHEN a.account_type = 'EXPENSE' THEN -1 ELSE 1 END), 0)
  INTO v_profit_all
  FROM gl_entries g JOIN accounts a ON a.code = g.account_code
  WHERE a.account_type IN ('REVENUE','EXPENSE') AND g.period <= p_to AND fn_gl_filter(v_me.id, g.branch_id, g.department_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('account_code', code, 'account_name', name, 'account_type', account_type, 'amount', amt) ORDER BY code), '[]')
  INTO v_bs
  FROM (SELECT a.code, a.name, a.account_type,
          CASE WHEN a.account_type = 'ASSET' THEN sum(g.debit - g.credit) ELSE sum(g.credit - g.debit) END AS amt
        FROM accounts a JOIN gl_entries g ON g.account_code = a.code
        WHERE a.account_type IN ('ASSET','LIABILITY','EQUITY') AND g.period <= p_to
          AND fn_gl_filter(v_me.id, g.branch_id, g.department_id)
        GROUP BY a.code, a.name, a.account_type HAVING sum(g.debit - g.credit) <> 0) x;

  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to,
    'income_statement', jsonb_build_object('rows', v_income, 'revenue', v_rev, 'expense', v_exp, 'net_profit', v_rev - v_exp),
    'balance_sheet', jsonb_build_object('rows', v_bs,
      'total_assets', (SELECT coalesce(sum((r->>'amount')::numeric), 0) FROM jsonb_array_elements(v_bs) r WHERE r->>'account_type' = 'ASSET'),
      'total_liabilities', (SELECT coalesce(sum((r->>'amount')::numeric), 0) FROM jsonb_array_elements(v_bs) r WHERE r->>'account_type' = 'LIABILITY'),
      'total_equity', (SELECT coalesce(sum((r->>'amount')::numeric), 0) FROM jsonb_array_elements(v_bs) r WHERE r->>'account_type' = 'EQUITY'),
      'retained_profit', v_profit_all));
END $$;

CREATE OR REPLACE FUNCTION api_stock_on_hand(p_warehouse uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); s int; v_hidden text[];
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  s := fn_perm_scope(v_me.id, 'INVENTORY', 'VIEW');
  IF s = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem tồn kho'); END IF;
  v_hidden := fn_hidden_fields(v_me.id, 'INVENTORY');
  RETURN jsonb_build_object('ok', true, 'masked', to_jsonb(v_hidden), 'rows', coalesce((
    SELECT jsonb_agg(fn_mask(jsonb_build_object('product_id', p.id, 'product_code', p.code, 'product_name', p.name,
        'product_type', p.product_type, 'unit', p.unit, 'warehouse_id', w.id, 'warehouse_name', w.name, 'branch_code', b.code,
        'qty', q.qty, 'value', q.value, 'unit_cost', CASE WHEN q.qty > 0 THEN round(q.value / q.qty, 2) END,
        'reserved', fn_reserved(p.id, w.id, NULL), 'available', q.qty - fn_reserved(p.id, w.id, NULL),
        'lots', q.lots), v_hidden) ORDER BY w.code, p.code)
    FROM (SELECT product_id, warehouse_id, sum(qty) qty, sum(remaining_qty * unit_cost) value,
                 count(*) FILTER (WHERE remaining_qty > 0) lots
          FROM stock_moves GROUP BY product_id, warehouse_id) q
    JOIN products p ON p.id = q.product_id JOIN warehouses w ON w.id = q.warehouse_id JOIN branches b ON b.id = w.branch_id
    WHERE (p_warehouse IS NULL OR w.id = p_warehouse) AND (s >= 4 OR w.branch_id = v_me.branch_id)), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_stock_ledger(p_product uuid, p_warehouse uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); s int; v_hidden text[];
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  s := fn_perm_scope(v_me.id, 'INVENTORY', 'VIEW');
  IF s = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem thẻ kho'); END IF;
  v_hidden := fn_hidden_fields(v_me.id, 'INVENTORY');
  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(fn_mask(jsonb_build_object('id', m.id, 'created_at', m.created_at, 'move_type', m.move_type,
        'document_id', d.id, 'document_number', d.number, 'doc_type', d.doc_type, 'warehouse_name', w.name,
        'qty', m.qty, 'unit_cost', m.unit_cost, 'value', round(m.qty * m.unit_cost, 2), 'balance', m.balance,
        'remaining_qty', m.remaining_qty, 'source_document_number', sd.number), v_hidden) ORDER BY m.created_at, m.id)
    FROM (SELECT sm.*, sum(sm.qty) OVER (PARTITION BY sm.warehouse_id ORDER BY sm.created_at, sm.id) balance
          FROM stock_moves sm WHERE sm.product_id = p_product AND (p_warehouse IS NULL OR sm.warehouse_id = p_warehouse)) m
    JOIN documents d ON d.id = m.document_id JOIN warehouses w ON w.id = m.warehouse_id
    LEFT JOIN stock_moves s2 ON s2.id = m.source_move_id LEFT JOIN documents sd ON sd.id = s2.document_id
    WHERE s >= 4 OR w.branch_id = v_me.branch_id), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_budget_report(p_year int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', b.id, 'number', b.number, 'status', b.status,
        'department_name', dp.name, 'planned', pl.planned, 'committed', us.committed, 'actual', us.actual,
        'remaining', pl.planned - us.committed - us.actual,
        'utilization_pct', CASE WHEN pl.planned > 0 THEN round((us.committed + us.actual) / pl.planned * 100, 1) END,
        'lines', (SELECT jsonb_agg(jsonb_build_object('account_code', l.account_code, 'account_name', a.name,
                    'description', l.description, 'planned', l.amount) ORDER BY l.line_no)
                  FROM document_lines l LEFT JOIN accounts a ON a.code = l.account_code WHERE l.document_id = b.id))
      ORDER BY dp.name)
    FROM documents b
    JOIN departments dp ON dp.id = b.cost_center_id
    CROSS JOIN LATERAL (SELECT coalesce(sum(amount), 0) planned FROM document_lines WHERE document_id = b.id) pl
    CROSS JOIN LATERAL (SELECT coalesce(sum(amount) FILTER (WHERE usage_type = 'COMMITTED'), 0) committed,
                               coalesce(sum(amount) FILTER (WHERE usage_type = 'ACTUAL'), 0) actual
                        FROM budget_usage WHERE budget_id = b.id) us
    WHERE b.doc_type = 'BUDGET' AND (b.data->>'fiscal_year')::int = p_year AND b.status NOT IN ('CANCELLED')
      AND fn_doc_in_scope(v_me.id, b, 'BUDGET', 'VIEW')), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_aging(p_kind text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_type text := CASE WHEN p_kind = 'AP' THEN 'SINV' ELSE 'INV' END;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  RETURN jsonb_build_object('ok', true, 'kind', p_kind, 'rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'status', d.status, 'partner_name', p.name,
        'amount', d.amount, 'paid', paid, 'outstanding', d.amount - paid, 'due_date', d.due_date,
        'days_overdue', greatest((fn_now())::date - d.due_date, 0),
        'bucket', CASE WHEN d.due_date >= (fn_now())::date THEN 'CURRENT'
                       WHEN (fn_now())::date - d.due_date <= 30 THEN '1-30'
                       WHEN (fn_now())::date - d.due_date <= 60 THEN '31-60' ELSE '>60' END) ORDER BY d.due_date)
    FROM documents d JOIN partners p ON p.id = d.partner_id
    CROSS JOIN LATERAL (SELECT fn_children_amount(d.id, CASE WHEN v_type = 'INV' THEN 'RCPT' ELSE 'PMT' END,
                               CASE WHEN v_type = 'INV' THEN ARRAY['RECEIVED','AUDITED'] ELSE ARRAY['PAID','AUDITED'] END) AS paid) x
    WHERE d.doc_type = v_type AND d.status IN ('POSTED','PARTIALLY_PAID')
      AND fn_doc_in_scope(v_me.id, d, v_type, 'VIEW') AND NOT ('amount' = ANY(fn_hidden_fields(v_me.id, v_type)))), '[]'));
END $$;

-- ============================================================
-- KPI (BM-10)
-- ============================================================
CREATE OR REPLACE FUNCTION api_kpis() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_vals jsonb; v_year text := to_char(fn_now(), 'YYYY');
  v_rev numeric; v_cogs numeric; v_planned numeric; v_used numeric; v_x numeric; v_y numeric;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'KPI', 'VIEW') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem KPI'); END IF;

  SELECT coalesce(sum(credit - debit) FILTER (WHERE account_code = '511'), 0), coalesce(sum(debit - credit) FILTER (WHERE account_code = '632'), 0)
  INTO v_rev, v_cogs FROM gl_entries WHERE period LIKE v_year || '-%';
  SELECT coalesce(sum(l.amount), 0) INTO v_planned FROM documents b JOIN document_lines l ON l.document_id = b.id
  WHERE b.doc_type = 'BUDGET' AND b.status = 'ACTIVE' AND b.data->>'fiscal_year' = v_year;
  SELECT coalesce(sum(u.amount), 0) INTO v_used FROM budget_usage u JOIN documents b ON b.id = u.budget_id
  WHERE b.status = 'ACTIVE' AND b.data->>'fiscal_year' = v_year;

  v_vals := jsonb_build_object(
    'FIN-001', v_rev,
    'FIN-002', CASE WHEN v_rev > 0 THEN round((v_rev - v_cogs) / v_rev * 100, 1) END,
    'FIN-003', (SELECT coalesce(sum(debit - credit), 0) FROM gl_entries WHERE account_code = '112'),
    'FIN-004', CASE WHEN v_planned > 0 THEN round(v_used / v_planned * 100, 1) END,
    'FIN-005', (SELECT coalesce(sum(debit - credit), 0) FROM gl_entries WHERE account_code = '131'),
    'OPS-001', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE NOT EXISTS (
                   SELECT 1 FROM document_actions a WHERE a.document_id = d.id AND a.to_status = 'ON_HOLD')) * 100.0 / count(*), 1) END
                FROM documents d WHERE d.doc_type = 'SINV' AND d.status NOT IN ('DRAFT','CANCELLED')),
    'OPS-002', (SELECT round(avg(extract(epoch FROM (ap.created_at - d.created_at)) / 3600)::numeric, 1)
                FROM documents d JOIN document_actions ap ON ap.document_id = d.id AND ap.action = 'approve'
                WHERE d.doc_type = 'PO'),
    'OPS-003', (SELECT CASE WHEN sum(l.quantity) > 0 THEN round(sum(fn_consumed(l.id, 'DN', ARRAY['SHIPPED'])) / sum(l.quantity) * 100, 1) END
                FROM documents d JOIN document_lines l ON l.document_id = d.id
                WHERE d.doc_type = 'SO' AND d.status IN ('SHIPPED','INVOICED','CLOSED','PARTIALLY_SHIPPED')),
    'OPS-004', (SELECT CASE WHEN sum((data->>'planned_qty')::numeric) > 0 THEN
                   round(sum((data->>'completed_qty')::numeric) / sum((data->>'planned_qty')::numeric) * 100, 1) END
                FROM documents WHERE doc_type = 'WO' AND status IN ('COMPLETED','CLOSED')),
    'CMP-001', (SELECT count(*) FROM sod_check_log WHERE result = 'BLOCKED'),
    'CMP-002', (SELECT count(*) FROM documents WHERE doc_type = 'EXC' AND status NOT IN ('CLOSED','REJECTED')),
    'CMP-003', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE completed_at <= sla_due_at) * 100.0 / count(*), 1) END
                FROM handoff_records WHERE status = 'COMPLETED'),
    'CUS-001', (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE (data->>'sla_met')::boolean) * 100.0 / count(*), 1) END
                FROM documents WHERE doc_type = 'TICKET' AND data ? 'sla_met'),
    'CUS-002', (SELECT round(avg((data->>'csat')::numeric), 2) FROM documents WHERE doc_type = 'TICKET' AND data ? 'csat' AND data->>'csat' IS NOT NULL));

  RETURN jsonb_build_object('ok', true, 'rows', (
    SELECT jsonb_agg(jsonb_build_object('code', k.code, 'name', k.name, 'category', k.category, 'formula', k.formula,
        'value', v_vals->k.code, 'target', k.target_value, 'unit', k.target_unit, 'direction', k.direction, 'flow_code', k.flow_code,
        'status', CASE
          WHEN k.target_value IS NULL OR jsonb_typeof(v_vals->k.code) = 'null' THEN 'NEUTRAL'
          WHEN k.direction = 'HIGHER' AND (v_vals->>k.code)::numeric >= k.target_value THEN 'GREEN'
          WHEN k.direction = 'HIGHER' AND (v_vals->>k.code)::numeric >= k.target_value * 0.9 THEN 'YELLOW'
          WHEN k.direction = 'HIGHER' THEN 'RED'
          WHEN (v_vals->>k.code)::numeric <= k.target_value THEN 'GREEN'
          WHEN (v_vals->>k.code)::numeric <= greatest(k.target_value * 1.1, k.target_value + 2) THEN 'YELLOW'
          ELSE 'RED' END) ORDER BY k.code)
    FROM kpi_catalog k));
END $$;

-- ============================================================
-- CONTROLS (L4)
-- ============================================================
CREATE OR REPLACE FUNCTION api_audit_trail(p_table text DEFAULT NULL, p_action text DEFAULT NULL, p_search text DEFAULT NULL,
                                           p_limit int DEFAULT 100, p_offset int DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_q text := nullif(trim(p_search), '');
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'AUDIT_TRAIL', 'VIEW') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem audit trail'); END IF;
  RETURN jsonb_build_object('ok', true,
    'total', (SELECT count(*) FROM audit_trail t WHERE (p_table IS NULL OR t.table_name = p_table) AND (p_action IS NULL OR t.action = p_action)
              AND (v_q IS NULL OR t.user_name ILIKE '%' || v_q || '%' OR t.record_id ILIKE '%' || v_q || '%' OR t.new_value::text ILIKE '%' || v_q || '%')),
    'action_counts', (SELECT jsonb_object_agg(action, n) FROM (SELECT action, count(*) n FROM audit_trail GROUP BY action) x),
    'table_counts', (SELECT jsonb_object_agg(table_name, n) FROM (SELECT table_name, count(*) n FROM audit_trail GROUP BY table_name) x),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(t) || jsonb_build_object('document_number',
                  CASE WHEN t.table_name = 'documents' THEN (SELECT number FROM documents WHERE id::text = t.record_id)
                       WHEN t.table_name = 'document_lines' THEN (SELECT d.number FROM document_lines l JOIN documents d ON d.id = l.document_id WHERE l.id::text = t.record_id) END,
                  'document_id', CASE WHEN t.table_name = 'documents' THEN t.record_id
                       WHEN t.table_name = 'document_lines' THEN (SELECT l.document_id::text FROM document_lines l WHERE l.id::text = t.record_id) END)
                ORDER BY t.id DESC)
      FROM (SELECT * FROM audit_trail t WHERE (p_table IS NULL OR t.table_name = p_table) AND (p_action IS NULL OR t.action = p_action)
              AND (v_q IS NULL OR t.user_name ILIKE '%' || v_q || '%' OR t.record_id ILIKE '%' || v_q || '%' OR t.new_value::text ILIKE '%' || v_q || '%')
            ORDER BY t.id DESC LIMIT p_limit OFFSET p_offset) t), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_sod_log(p_result text DEFAULT NULL, p_limit int DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_all boolean;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  v_all := fn_perm_scope(v_me.id, 'SOD_LOG', 'VIEW') > 0;
  RETURN jsonb_build_object('ok', true, 'scope', CASE WHEN v_all THEN 'ALL' ELSE 'MINE' END,
    'summary', (SELECT jsonb_object_agg(result, n) FROM (SELECT result, count(*) n FROM sod_check_log
                WHERE v_all OR user_id = v_me.id GROUP BY result) x),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(s) || jsonb_build_object('user_name', u.full_name, 'position', u.position,
                 'conflicting_document_number', cd.number) ORDER BY s.checked_at DESC)
      FROM (SELECT * FROM sod_check_log WHERE (v_all OR user_id = v_me.id) AND (p_result IS NULL OR result = p_result)
            ORDER BY checked_at DESC LIMIT p_limit) s
      LEFT JOIN app_users u ON u.id = s.user_id LEFT JOIN documents cd ON cd.id = s.conflicting_document_id), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_handoffs(p_status text DEFAULT NULL, p_limit int DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'HANDOFF', 'VIEW') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem sổ bàn giao'); END IF;
  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', h.id, 'flow_code', m.flow_code, 'document_id', d.id, 'number', d.number,
        'doc_type', d.doc_type, 'trigger_status', m.trigger_status, 'expected_action', m.expected_action,
        'to_role', h.to_role, 'to_role_name', r.name, 'from_user_name', fu.full_name, 'from_department', fd.name,
        'to_user_name', tu.full_name, 'to_department', td.name, 'status', h.status, 'initiated_at', h.initiated_at,
        'completed_at', h.completed_at, 'sla_due_at', h.sla_due_at,
        'sla_status', fn_sla_status(h.status, h.sla_due_at, h.initiated_at, h.completed_at),
        'cross_department', h.to_department_id IS NOT NULL AND h.to_department_id <> h.from_department_id) ORDER BY h.initiated_at DESC)
    FROM (SELECT * FROM handoff_records WHERE p_status IS NULL OR status = p_status ORDER BY initiated_at DESC LIMIT p_limit) h
    JOIN handoff_map m ON m.id = h.handoff_map_id JOIN documents d ON d.id = h.document_id JOIN roles r ON r.code = h.to_role
    LEFT JOIN app_users fu ON fu.id = h.from_user_id LEFT JOIN departments fd ON fd.id = h.from_department_id
    LEFT JOIN app_users tu ON tu.id = h.to_user_id LEFT JOIN departments td ON td.id = h.to_department_id
    WHERE fn_doc_in_scope(v_me.id, d, 'HANDOFF', 'VIEW')), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_control_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'SOD_LOG', 'VIEW') = 0 AND fn_perm_scope(v_me.id, 'AUDIT_TRAIL', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem báo cáo kiểm soát');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'sod', jsonb_build_object(
      'passed', (SELECT count(*) FROM sod_check_log WHERE result = 'PASSED'),
      'blocked', (SELECT count(*) FROM sod_check_log WHERE result = 'BLOCKED')),
    'exceptions', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM (SELECT status, count(*) n FROM documents WHERE doc_type = 'EXC' GROUP BY status) x),
    'handoffs', jsonb_build_object(
      'total', (SELECT count(*) FROM handoff_records),
      'open', (SELECT count(*) FROM handoff_records WHERE status = 'INITIATED'),
      'breached', (SELECT count(*) FROM handoff_records WHERE fn_sla_status(status, sla_due_at, initiated_at, completed_at) = 'BREACHED'),
      'cross_department', (SELECT count(*) FROM handoff_records WHERE to_department_id IS NOT NULL AND to_department_id <> from_department_id)),
    'orphans', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'doc_type', d.doc_type))
      FROM documents d WHERE d.doc_type IN ('GRN','SINV','PMT','DN','INV','RCPT')
        AND NOT EXISTS (SELECT 1 FROM document_links l WHERE l.child_id = d.id AND l.link_type = 'SOURCE')), '[]'),
    'documents_total', (SELECT count(*) FROM documents),
    'actions_total', (SELECT count(*) FROM document_actions),
    'audit_total', (SELECT count(*) FROM audit_trail),
    'audit_24h', (SELECT count(*) FROM audit_trail WHERE created_at > fn_now() - interval '24 hours'),
    'gl_balanced', (SELECT coalesce(sum(debit), 0) = coalesce(sum(credit), 0) FROM gl_entries),
    'overlapping_permissions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('user_name', u.full_name, 'resource', x.resource, 'actions', x.actions))
      FROM (SELECT ur.user_id, pm.resource, array_agg(DISTINCT pm.action ORDER BY pm.action) actions
            FROM user_roles ur JOIN permission_matrix pm ON pm.role_code = ur.role_code AND pm.status = 'ACTIVE'
            WHERE pm.action IN ('CREATE','APPROVE','EXECUTE')
            GROUP BY ur.user_id, pm.resource HAVING count(DISTINCT pm.action) >= 2) x
      JOIN app_users u ON u.id = x.user_id), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_employees() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); s int; v_hidden text[];
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  s := fn_perm_scope(v_me.id, 'EMPLOYEE', 'VIEW');
  IF s = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem hồ sơ nhân sự'); END IF;
  v_hidden := fn_hidden_fields(v_me.id, 'EMPLOYEE');
  RETURN jsonb_build_object('ok', true, 'masked', to_jsonb(v_hidden), 'rows', coalesce((
    SELECT jsonb_agg(fn_mask(to_jsonb(e) || jsonb_build_object('department_name', d.name, 'branch_code', b.code,
        'source_document_number', sd.number), v_hidden) ORDER BY e.code)
    FROM employees e JOIN departments d ON d.id = e.department_id JOIN branches b ON b.id = e.branch_id
    LEFT JOIN documents sd ON sd.id = e.source_document_id
    WHERE s >= 4 OR (s = 3 AND e.branch_id = v_me.branch_id) OR (s <= 2 AND e.department_id = v_me.department_id)), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_update_acceptance(p_code text, p_status text, p_evidence text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'AUDIT_TRAIL', 'VIEW') < 4 THEN RETURN fn_fail('FORBIDDEN', 'Chỉ kiểm toán/quản trị được cập nhật nghiệm thu'); END IF;
  UPDATE acceptance_criteria SET status = p_status, evidence = p_evidence, tested_at = fn_now() WHERE test_code = p_code;
  RETURN jsonb_build_object('ok', true);
END $$;
