-- 024_tasks.sql  WP-F2: role-grouped task queue
-- Adds api_tasks() — variant of api_inbox() that groups work by role
-- (APPROVE / EXECUTE / REQUEST / AUDIT) with SLA priority for sorting.

CREATE OR REPLACE FUNCTION api_tasks() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me             app_users := fn_current_user();
  d                documents;
  v_acts           jsonb;
  v_rows           jsonb := '[]'::jsonb;
  v_handoff        jsonb;
  v_role_groups    text[];
  v_primary_group  text;
  v_sla_priority   int;
  v_sla_stat       text;
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

    IF jsonb_array_length(v_acts) = 0 THEN CONTINUE; END IF;

    -- role_groups: distinct role groups derived from action sod_role
    SELECT array_agg(DISTINCT grp) INTO v_role_groups
    FROM (
      SELECT CASE a->>'sod_role'
        WHEN 'APPROVER'  THEN 'APPROVE'
        WHEN 'EXECUTOR'  THEN 'EXECUTE'
        WHEN 'AUDITOR'   THEN 'AUDIT'
        WHEN 'REQUESTER' THEN 'REQUEST'
        ELSE 'OTHER'
      END AS grp
      FROM jsonb_array_elements(v_acts) a
    ) sub;

    -- primary_role_group: APPROVE > EXECUTE > AUDIT > REQUEST > OTHER
    v_primary_group := CASE
      WHEN 'APPROVE' = ANY(v_role_groups) THEN 'APPROVE'
      WHEN 'EXECUTE' = ANY(v_role_groups) THEN 'EXECUTE'
      WHEN 'AUDIT'   = ANY(v_role_groups) THEN 'AUDIT'
      WHEN 'REQUEST' = ANY(v_role_groups) THEN 'REQUEST'
      ELSE 'OTHER'
    END;

    -- Most-recent INITIATED handoff for this document
    SELECT jsonb_build_object(
      'expected_action', m.expected_action,
      'sla_due_at',      h.sla_due_at,
      'sla_status',      fn_sla_status(h.status, h.sla_due_at, h.initiated_at, h.completed_at),
      'to_role',         h.to_role
    ) INTO v_handoff
    FROM handoff_records h JOIN handoff_map m ON m.id = h.handoff_map_id
    WHERE h.document_id = d.id AND h.status = 'INITIATED'
    ORDER BY h.initiated_at DESC LIMIT 1;

    v_sla_stat := v_handoff->>'sla_status';
    v_sla_priority := CASE
      WHEN v_sla_stat = 'BREACHED' THEN 0
      WHEN v_sla_stat = 'AT_RISK'  THEN 1
      WHEN v_sla_stat = 'ON_TIME'  THEN 2
      ELSE 3
    END;

    v_rows := v_rows || jsonb_build_object(
      'document',           fn_mask(fn_doc_json(d), fn_hidden_fields(v_me.id, d.doc_type)),
      'actions',            v_acts,
      'blocked_by_sod',     NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_acts) a WHERE a->'sod_conflict' = 'null'::jsonb),
      'handoff',            v_handoff,
      'role_groups',        to_jsonb(v_role_groups),
      'primary_role_group', v_primary_group,
      'sla_priority',       v_sla_priority
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok',     true,
    'rows',   v_rows,
    'count',  jsonb_array_length(v_rows),
    'counts', (
      SELECT coalesce(jsonb_object_agg(grp, cnt), '{}')
      FROM (
        SELECT r->>'primary_role_group' AS grp, count(*) AS cnt
        FROM jsonb_array_elements(v_rows) r
        GROUP BY r->>'primary_role_group'
      ) sub
    )
  );
END $$;

REVOKE ALL ON FUNCTION api_tasks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_tasks() TO authenticated;
