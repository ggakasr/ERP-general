-- ERP General — 007 Flow ownership labels
-- Mục đích: mọi màn hình chứng từ trả lời được 2 câu hỏi — "việc này đang chờ ai xử lý?"
-- và "làm xong bước này thì chuyển cho ai?" — tính trực tiếp từ state_transitions + permission_matrix
-- (không hard-code vai trò ở tầng UI, đúng NT5 / ĐK8).

-- Vai trò (tên tiếng Việt) đang nắm permission_action trên một resource, dùng permission_matrix làm nguồn duy nhất.
CREATE OR REPLACE FUNCTION fn_role_names_for(p_resource text, p_action text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(string_agg(DISTINCT r.name, ', ' ORDER BY r.name), '')
  FROM permission_matrix pm JOIN roles r ON r.code = pm.role_code
  WHERE pm.resource = p_resource AND pm.action = p_action AND pm.status = 'ACTIVE' AND pm.role_code <> 'SYS_ADMIN';
$$;

-- Ai là người phụ trách khi một chứng từ (doc_type) đang ở một trạng thái cho trước.
-- Gộp mọi chuyển trạng thái đi ra từ trạng thái đó — kể cả transition system_only (vd PO chờ GRN xử lý)
-- vì đó vẫn là "ai đó phải làm gì" để hồ sơ đi tiếp, chỉ là thao tác nằm trên chứng từ con.
-- Gộp ở mức TỪNG VAI TRÒ (không phải mức chuỗi nhãn đã ghép sẵn) để không lặp tên khi hai hành động
-- khác nhau (vd "đóng" và "tạo PO") cùng thuộc về một phần vai trò chung.
CREATE OR REPLACE FUNCTION fn_owner_label(p_doc_type text, p_status text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(string_agg(DISTINCT r.name, ', ' ORDER BY r.name), '')
  FROM state_transitions t
  JOIN permission_matrix pm ON pm.resource = coalesce(t.permission_resource, p_doc_type)
    AND pm.action = t.permission_action AND pm.status = 'ACTIVE' AND pm.role_code <> 'SYS_ADMIN'
  JOIN roles r ON r.code = pm.role_code
  WHERE t.doc_type = p_doc_type AND t.from_status = p_status;
$$;

-- fn_available_actions: thêm next_owner_label — sau khi bấm hành động này, việc chuyển cho vai trò nào.
CREATE OR REPLACE FUNCTION fn_available_actions(p_doc documents, p_user uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t state_transitions; r doc_child_rules; v_res jsonb := '[]'::jsonb; v_conflict jsonb; v_child_status text;
BEGIN
  FOR t IN SELECT * FROM state_transitions WHERE doc_type = p_doc.doc_type AND from_status = p_doc.status
           AND NOT system_only ORDER BY sort LOOP
    IF fn_doc_in_scope(p_user, p_doc, coalesce(t.permission_resource, p_doc.doc_type), t.permission_action) THEN
      v_conflict := fn_sod_find_conflict(p_doc.id, p_user, t.sod_role);
      v_res := v_res || jsonb_build_object('kind', 'transition', 'action', t.action, 'label', t.label,
        'to_status', t.to_status, 'style', t.style, 'sod_role', t.sod_role, 'conditions', to_jsonb(t.conditions),
        'sod_conflict', v_conflict, 'next_owner_label', fn_owner_label(p_doc.doc_type, t.to_status));
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM doc_child_rules WHERE parent_type = p_doc.doc_type AND p_doc.status = ANY(parent_statuses) LOOP
    IF fn_perm_scope(p_user, r.child_type, 'CREATE') > 0 AND fn_child_remaining(p_doc, r.child_type) THEN
      SELECT initial_status INTO v_child_status FROM doc_types WHERE code = r.child_type;
      v_res := v_res || jsonb_build_object('kind', 'create', 'child_type', r.child_type, 'label', r.label, 'style', 'primary',
        'sod_conflict', fn_sod_find_conflict(p_doc.id, p_user, (SELECT create_sod_role FROM doc_types WHERE code = r.child_type)),
        'next_owner_label', fn_owner_label(r.child_type, v_child_status));
    END IF;
  END LOOP;
  RETURN v_res;
END $$;

-- api_get_document: thêm current_owner_label (ai đang giữ "bóng") + actor_label trên từng bước của máy trạng thái.
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
    'current_owner_label', fn_owner_label(v_doc.doc_type, v_doc.status),
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
          'sod_role', sod_role, 'system_only', system_only, 'permission', permission_action,
          'actor_label', fn_role_names_for(coalesce(permission_resource, v_doc.doc_type), permission_action)) ORDER BY sort)
      FROM state_transitions WHERE doc_type = v_doc.doc_type),
    'budget', CASE WHEN v_doc.doc_type = 'BUDGET' THEN jsonb_build_object(
      'planned', (SELECT coalesce(sum(amount), 0) FROM document_lines WHERE document_id = v_doc.id),
      'committed', (SELECT coalesce(sum(amount), 0) FROM budget_usage WHERE budget_id = v_doc.id AND usage_type = 'COMMITTED'),
      'actual', (SELECT coalesce(sum(amount), 0) FROM budget_usage WHERE budget_id = v_doc.id AND usage_type = 'ACTUAL'),
      'usage', coalesce((SELECT jsonb_agg(jsonb_build_object('document_id', d.id, 'number', d.number, 'doc_type', d.doc_type,
          'usage_type', bu.usage_type, 'amount', bu.amount, 'created_at', bu.created_at) ORDER BY bu.created_at)
        FROM budget_usage bu JOIN documents d ON d.id = bu.document_id WHERE bu.budget_id = v_doc.id), '[]')) END);
END $$;
