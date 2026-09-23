-- 025_fix_handoff_tenant.sql  WP-F2: fix fn_after_status_change to include tenant_id
-- handoff_records.tenant_id was made NOT NULL by WP-D1 (015_multitenant.sql)
-- but fn_after_status_change INSERT did not include it → NOT NULL violation on submit.

CREATE OR REPLACE FUNCTION fn_after_status_change(p_doc documents, p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m handoff_map; v_dept uuid; v_type_name text; u record;
BEGIN
  SELECT department_id INTO v_dept FROM app_users WHERE id = p_actor;
  SELECT name INTO v_type_name FROM doc_types WHERE code = p_doc.doc_type;
  FOR m IN SELECT * FROM handoff_map WHERE doc_type = p_doc.doc_type AND trigger_status = p_doc.status AND status = 'ACTIVE' LOOP
    INSERT INTO handoff_records (handoff_map_id, document_id, from_user_id, from_department_id, to_role, sla_due_at, tenant_id)
    VALUES (m.id, p_doc.id, p_actor, v_dept, m.to_role, fn_now() + make_interval(hours => m.sla_hours), p_doc.tenant_id);
    FOR u IN
      SELECT DISTINCT au.id FROM app_users au JOIN user_roles ur ON ur.user_id = au.id AND ur.role_code = m.to_role
      WHERE au.status = 'ACTIVE' AND au.id <> p_actor
        AND (p_doc.doc_type <> 'TICKET' OR p_doc.owner_id IS NULL OR au.id = p_doc.owner_id)
        AND fn_doc_in_scope(au.id, p_doc, p_doc.doc_type, 'VIEW')
    LOOP
      PERFORM fn_notify(u.id, m.expected_action || ' — ' || p_doc.number,
                        v_type_name || coalesce(': ' || p_doc.title, ''), p_doc.id);
    END LOOP;
  END LOOP;
  IF p_doc.status IN ('APPROVED','REJECTED','POSTED','PAID','ON_HOLD','RECEIVED','CLOSED','ONBOARDED')
     AND p_doc.created_by <> p_actor THEN
    PERFORM fn_notify(p_doc.created_by, format('%s %s → %s', v_type_name, p_doc.number, p_doc.status),
                      coalesce(p_doc.title, ''), p_doc.id);
  END IF;
END $$;
