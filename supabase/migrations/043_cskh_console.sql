-- 043_cskh_console.sql — WP-K4: Staff console SQL functions
-- Claim session, reply, return to bot, close, list sessions for staff

-- ═══════════════════════════════════════════════════════════════
-- 1. STAFF SESSION MANAGEMENT
-- ═══════════════════════════════════════════════════════════════

-- 1a. List sessions for staff (filtered by status, with badge counts)
CREATE OR REPLACE FUNCTION api_cskh_staff_sessions(
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_rows jsonb;
  v_counts jsonb;
BEGIN
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code IN ('CS_AGENT','CS_MANAGER')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT jsonb_agg(to_jsonb(q))
  INTO v_rows
  FROM (
    SELECT s.id, s.status, s.channel, s.source, s.handoff_reason,
           s.agent_user_id, s.created_at, s.updated_at,
           (SELECT full_name FROM app_users WHERE id = s.agent_user_id) AS assigned_name,
           (SELECT count(*) FROM cskh_messages WHERE session_id = s.id) AS msg_count,
           s.ticket_id,
           (SELECT number FROM documents WHERE id = s.ticket_id) AS ticket_number,
           s.csat
    FROM cskh_sessions s
    WHERE s.tenant_id = v_me.tenant_id
      AND (p_status IS NULL OR s.status = p_status)
    ORDER BY s.updated_at DESC
    LIMIT p_limit OFFSET p_offset
  ) q;

  SELECT jsonb_build_object(
    'awaiting_human', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND status = 'awaiting_human'),
    'human_serving', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND status = 'human_serving'),
    'serving', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND status = 'serving'),
    'closed', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND status = 'closed')
  ) INTO v_counts;

  RETURN jsonb_build_object('ok', true, 'sessions', COALESCE(v_rows, '[]'::jsonb), 'counts', v_counts);
END $$;

-- 1b. Claim a session (assign to current agent)
CREATE OR REPLACE FUNCTION api_cskh_claim_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_sess cskh_sessions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code IN ('CS_AGENT','CS_MANAGER')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_sess FROM cskh_sessions WHERE id = p_session_id AND tenant_id = v_me.tenant_id;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  IF v_sess.agent_user_id IS NOT NULL AND v_sess.agent_user_id != v_me.id THEN
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code = 'CS_MANAGER') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_assigned');
    END IF;
  END IF;

  UPDATE cskh_sessions SET
    status = 'human_serving',
    agent_user_id = v_me.id,
    updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO audit_trail (table_name, record_id, action, new_value, user_id, user_name)
  VALUES ('cskh_sessions', p_session_id::text, 'CLAIM',
    jsonb_build_object('agent_user_id', v_me.id, 'agent_name', v_me.full_name),
    v_me.id, v_me.full_name);

  RETURN jsonb_build_object('ok', true);
END $$;

-- 1c. Staff reply (adds agent message to session)
CREATE OR REPLACE FUNCTION api_cskh_staff_reply(p_session_id uuid, p_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_sess cskh_sessions;
  v_msg_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code IN ('CS_AGENT','CS_MANAGER')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_sess FROM cskh_sessions WHERE id = p_session_id AND tenant_id = v_me.tenant_id;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  IF v_sess.agent_user_id IS NOT NULL AND v_sess.agent_user_id != v_me.id THEN
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code = 'CS_MANAGER') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_your_session');
    END IF;
  END IF;

  INSERT INTO cskh_messages (tenant_id, session_id, role, content, agent_user_id)
  VALUES (v_me.tenant_id, p_session_id, 'agent', p_content, v_me.id)
  RETURNING id INTO v_msg_id;

  UPDATE cskh_sessions SET status = 'human_serving', updated_at = now() WHERE id = p_session_id;

  INSERT INTO audit_trail (table_name, record_id, action, new_value, user_id, user_name)
  VALUES ('cskh_messages', v_msg_id::text, 'STAFF_REPLY',
    jsonb_build_object('session_id', p_session_id, 'content_length', length(p_content)),
    v_me.id, v_me.full_name);

  RETURN jsonb_build_object('ok', true, 'id', v_msg_id);
END $$;

-- 1d. Return session to bot
CREATE OR REPLACE FUNCTION api_cskh_return_to_bot(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_sess cskh_sessions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code IN ('CS_AGENT','CS_MANAGER')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_sess FROM cskh_sessions WHERE id = p_session_id AND tenant_id = v_me.tenant_id;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  UPDATE cskh_sessions SET
    status = 'serving',
    agent_user_id = NULL,
    updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO audit_trail (table_name, record_id, action, new_value, user_id, user_name)
  VALUES ('cskh_sessions', p_session_id::text, 'RETURN_TO_BOT',
    jsonb_build_object('previous_agent', v_me.full_name),
    v_me.id, v_me.full_name);

  RETURN jsonb_build_object('ok', true);
END $$;

-- 1e. Close session (update TICKET status too)
CREATE OR REPLACE FUNCTION api_cskh_close_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_sess cskh_sessions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code IN ('CS_AGENT','CS_MANAGER')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_sess FROM cskh_sessions WHERE id = p_session_id AND tenant_id = v_me.tenant_id;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  UPDATE cskh_sessions SET status = 'closed', updated_at = now() WHERE id = p_session_id;

  IF v_sess.ticket_id IS NOT NULL THEN
    UPDATE documents SET status = 'CLOSED', updated_at = now() WHERE id = v_sess.ticket_id AND status != 'CLOSED';
    INSERT INTO audit_trail (table_name, record_id, action, new_value, user_id, user_name)
    VALUES ('documents', v_sess.ticket_id::text, 'CLOSE_FROM_CSKH',
      jsonb_build_object('session_id', p_session_id),
      v_me.id, v_me.full_name);
  END IF;

  INSERT INTO audit_trail (table_name, record_id, action, new_value, user_id, user_name)
  VALUES ('cskh_sessions', p_session_id::text, 'CLOSE',
    jsonb_build_object('closed_by', v_me.full_name),
    v_me.id, v_me.full_name);

  RETURN jsonb_build_object('ok', true);
END $$;

-- 1f. Load session transcript for staff (includes tool calls and agent info)
CREATE OR REPLACE FUNCTION api_cskh_staff_transcript(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_sess cskh_sessions;
  v_msgs jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code IN ('CS_AGENT','CS_MANAGER')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_sess FROM cskh_sessions WHERE id = p_session_id AND tenant_id = v_me.tenant_id;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', m.id, 'role', m.role, 'content', m.content, 'tool_calls', m.tool_calls,
    'agent_user_id', m.agent_user_id,
    'agent_name', (SELECT full_name FROM app_users WHERE id = m.agent_user_id),
    'created_at', m.created_at
  ) ORDER BY m.created_at)
  INTO v_msgs
  FROM cskh_messages m WHERE m.session_id = p_session_id AND m.tenant_id = v_me.tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', v_sess.id, 'status', v_sess.status, 'channel', v_sess.channel,
      'source', v_sess.source, 'agent_user_id', v_sess.agent_user_id,
      'assigned_name', (SELECT full_name FROM app_users WHERE id = v_sess.agent_user_id),
      'handoff_reason', v_sess.handoff_reason, 'ticket_id', v_sess.ticket_id,
      'ticket_number', (SELECT number FROM documents WHERE id = v_sess.ticket_id),
      'created_at', v_sess.created_at, 'csat', v_sess.csat
    ),
    'messages', COALESCE(v_msgs, '[]'::jsonb)
  );
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 3. GRANTS
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'api\_cskh\_%'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;
