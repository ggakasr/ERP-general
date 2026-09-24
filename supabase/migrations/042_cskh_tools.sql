-- 042_cskh_tools.sql — WP-K2: Bot tool SQL functions + bot system user
-- Tools: tra_cuu_don_hang, xac_thuc_khach, tra_cuu_faq, de_xuat_handoff
-- Session management: start_session, add_message, update_session, record_usage

-- ═══════════════════════════════════════════════════════════════
-- 0. BOT SYSTEM USER (one per tenant, used as actor for TICKET creation)
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tenant uuid;
  v_bot_id uuid;
  v_dept uuid;
  v_branch uuid;
BEGIN
  FOR v_tenant IN SELECT id FROM tenants LOOP
    SELECT id INTO v_branch FROM branches WHERE tenant_id = v_tenant LIMIT 1;
    SELECT id INTO v_dept FROM departments WHERE tenant_id = v_tenant AND code = 'CS'  LIMIT 1;
    IF v_dept IS NULL THEN
      SELECT id INTO v_dept FROM departments WHERE tenant_id = v_tenant LIMIT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app_users WHERE tenant_id = v_tenant AND email = 'system-cskh-bot@erp.local') THEN
      v_bot_id := gen_random_uuid();
      INSERT INTO app_users (id, tenant_id, email, full_name, employee_code, branch_id, department_id, status)
      VALUES (v_bot_id, v_tenant, 'system-cskh-bot@erp.local', 'Bot CSKH', 'SYS-BOT-CSKH', v_branch, v_dept, 'ACTIVE');
      INSERT INTO user_roles (user_id, role_code)
      VALUES (v_bot_id, 'CS_AGENT');
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 1. TOOL FUNCTIONS (called by agent.ts via service_role)
-- ═══════════════════════════════════════════════════════════════

-- 1a. Lookup order by number — public fields only; sensitive gated by verified list (R2)
CREATE OR REPLACE FUNCTION api_cskh_tra_don(
  p_tenant_id uuid, p_ma_don text, p_verified_orders uuid[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc  documents;
  v_partner partners;
  v_result jsonb;
BEGIN
  SELECT * INTO v_doc FROM documents
  WHERE tenant_id = p_tenant_id AND number = upper(trim(p_ma_don))
    AND doc_type IN ('SO','SHIPMENT','DN','INV')
  LIMIT 1;

  IF v_doc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'order_id', v_doc.id,
    'number', v_doc.number,
    'doc_type', v_doc.doc_type,
    'status', v_doc.status,
    'title', v_doc.title,
    'created_at', v_doc.created_at
  );

  IF v_doc.data ? 'delivery_date' THEN
    v_result := v_result || jsonb_build_object('delivery_date', v_doc.data->>'delivery_date');
  END IF;

  -- Sensitive fields only when order is verified (R2 enforcement)
  IF v_doc.id = ANY(p_verified_orders) THEN
    SELECT * INTO v_partner FROM partners WHERE id = v_doc.partner_id;
    IF v_partner IS NOT NULL THEN
      v_result := v_result || jsonb_build_object(
        'customer_name', v_partner.name,
        'phone', v_partner.phone,
        'address', v_partner.address
      );
    END IF;
    v_result := v_result || jsonb_build_object('amount', v_doc.amount);
  END IF;

  RETURN v_result;
END $$;

-- 1b. Verify customer identity: order number + phone must match partner record
CREATE OR REPLACE FUNCTION api_cskh_xac_thuc(
  p_tenant_id uuid, p_ma_don text, p_sdt text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc documents;
  v_partner partners;
  v_phone text;
BEGIN
  SELECT * INTO v_doc FROM documents
  WHERE tenant_id = p_tenant_id AND number = upper(trim(p_ma_don))
    AND doc_type IN ('SO','SHIPMENT','DN','INV')
  LIMIT 1;

  IF v_doc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_doc.partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_customer');
  END IF;

  SELECT * INTO v_partner FROM partners WHERE id = v_doc.partner_id;
  v_phone := regexp_replace(coalesce(v_partner.phone, ''), '[^0-9]', '', 'g');
  IF v_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_phone_on_file');
  END IF;

  IF v_phone = regexp_replace(trim(p_sdt), '[^0-9]', '', 'g') THEN
    RETURN jsonb_build_object('ok', true, 'order_id', v_doc.id, 'customer_name', v_partner.name);
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'phone_mismatch');
  END IF;
END $$;

-- 1c. FAQ / knowledge base keyword search (PUBLISHED articles only)
CREATE OR REPLACE FUNCTION api_cskh_tra_faq(p_tenant_id uuid, p_query text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows jsonb;
  v_q text := lower(trim(p_query));
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'title', d.title,
    'kind', d.data->>'kind',
    'body', d.data->>'body'
  ) ORDER BY d.title)
  INTO v_rows
  FROM documents d
  WHERE d.tenant_id = p_tenant_id
    AND d.doc_type = 'KB_ARTICLE'
    AND d.status = 'PUBLISHED'
    AND (lower(d.title) LIKE '%' || v_q || '%'
         OR lower(d.data->>'body') LIKE '%' || v_q || '%'
         OR lower(d.data->>'topic') LIKE '%' || v_q || '%');

  RETURN jsonb_build_object('ok', true, 'articles', COALESCE(v_rows, '[]'::jsonb));
END $$;

-- 1d. Handoff: set session awaiting_human + create TICKET as bot actor
CREATE OR REPLACE FUNCTION api_cskh_handoff(
  p_tenant_id uuid,
  p_session_id uuid,
  p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sess  cskh_sessions;
  v_bot   app_users;
  v_seq   int;
  v_num   text;
  v_ticket_id uuid;
  v_ym    text := to_char(now(), 'YYYYMM');
BEGIN
  SELECT * INTO v_sess FROM cskh_sessions WHERE id = p_session_id AND tenant_id = p_tenant_id;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;
  IF v_sess.status IN ('awaiting_human','human_serving','closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_handed_off');
  END IF;

  -- Bot system user for this tenant
  SELECT * INTO v_bot FROM app_users
  WHERE tenant_id = p_tenant_id AND email = 'system-cskh-bot@erp.local';
  IF v_bot IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bot_user_missing');
  END IF;

  -- Generate TICKET number
  INSERT INTO doc_sequences (tenant_id, prefix, yyyymm, last_seq)
  VALUES (p_tenant_id, 'TICKET', v_ym, 1)
  ON CONFLICT (tenant_id, prefix, yyyymm) DO UPDATE SET last_seq = doc_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;
  v_num := 'TICKET-' || v_ym || '-' || lpad(v_seq::text, 5, '0');

  v_ticket_id := gen_random_uuid();
  INSERT INTO documents (id, tenant_id, doc_type, number, title, status, created_by, branch_id, department_id, data)
  VALUES (
    v_ticket_id, p_tenant_id, 'TICKET', v_num,
    'Chuyển người: ' || left(coalesce(p_reason, 'Khách yêu cầu'), 80),
    'OPEN', v_bot.id, v_bot.branch_id, v_bot.department_id,
    jsonb_build_object(
      'source', 'cskh_bot',
      'session_id', p_session_id,
      'reason', p_reason,
      'channel', v_sess.channel
    )
  );

  -- Audit trail for ticket creation
  INSERT INTO audit_trail (table_name, record_id, action, new_value, user_id, user_name)
  VALUES ('documents', v_ticket_id::text, 'CREATE',
    jsonb_build_object('doc_type', 'TICKET', 'number', v_num, 'source', 'cskh_bot'),
    v_bot.id, v_bot.full_name);

  -- Update session
  UPDATE cskh_sessions SET
    status = 'awaiting_human',
    handoff_reason = p_reason,
    ticket_id = v_ticket_id,
    updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket_id, 'ticket_number', v_num);
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 2. SESSION & MESSAGE MANAGEMENT (called by chat route)
-- ═══════════════════════════════════════════════════════════════

-- 2a. Create new session
CREATE OR REPLACE FUNCTION api_cskh_start_session(
  p_tenant_id uuid,
  p_channel text DEFAULT 'chat',
  p_source text DEFAULT 'public',
  p_customer_id uuid DEFAULT NULL,
  p_widget_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sess_id uuid;
  v_cfg record;
BEGIN
  SELECT * INTO v_cfg FROM cskh_bot_config WHERE tenant_id = p_tenant_id;
  IF v_cfg IS NULL OR NOT v_cfg.bot_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bot_disabled');
  END IF;

  INSERT INTO cskh_sessions (tenant_id, channel, source, customer_id, widget_key)
  VALUES (p_tenant_id, p_channel, p_source, p_customer_id, p_widget_key)
  RETURNING id INTO v_sess_id;

  INSERT INTO cskh_messages (tenant_id, session_id, role, content)
  VALUES (p_tenant_id, v_sess_id, 'assistant', v_cfg.greeting);

  RETURN jsonb_build_object('ok', true, 'session_id', v_sess_id, 'greeting', v_cfg.greeting);
END $$;

-- 2b. Add a message
CREATE OR REPLACE FUNCTION api_cskh_add_message(
  p_tenant_id uuid,
  p_session_id uuid,
  p_role text,
  p_content text DEFAULT NULL,
  p_tool_calls jsonb DEFAULT NULL,
  p_tokens_in int DEFAULT 0,
  p_tokens_out int DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_msg_id uuid;
BEGIN
  INSERT INTO cskh_messages (tenant_id, session_id, role, content, tool_calls, tokens_in, tokens_out)
  VALUES (p_tenant_id, p_session_id, p_role, p_content, p_tool_calls, p_tokens_in, p_tokens_out)
  RETURNING id INTO v_msg_id;

  UPDATE cskh_sessions SET updated_at = now() WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true, 'id', v_msg_id);
END $$;

-- 2c. Update session fields
CREATE OR REPLACE FUNCTION api_cskh_update_session(
  p_tenant_id uuid,
  p_session_id uuid,
  p_status text DEFAULT NULL,
  p_handoff_reason text DEFAULT NULL,
  p_ticket_id uuid DEFAULT NULL,
  p_verified_order uuid DEFAULT NULL,
  p_csat smallint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE cskh_sessions SET
    status = COALESCE(p_status, status),
    handoff_reason = COALESCE(p_handoff_reason, handoff_reason),
    ticket_id = COALESCE(p_ticket_id, ticket_id),
    verified_orders = CASE WHEN p_verified_order IS NOT NULL
      THEN array_append(verified_orders, p_verified_order) ELSE verified_orders END,
    csat = COALESCE(p_csat, csat),
    updated_at = now()
  WHERE id = p_session_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true);
END $$;

-- 2d. Record LLM usage
CREATE OR REPLACE FUNCTION api_cskh_record_usage(
  p_tenant_id uuid,
  p_session_id uuid,
  p_provider text,
  p_model text,
  p_tokens_in int,
  p_tokens_out int,
  p_cost numeric DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO cskh_usage (tenant_id, session_id, provider, model, tokens_in, tokens_out, estimated_cost)
  VALUES (p_tenant_id, p_session_id, p_provider, p_model, p_tokens_in, p_tokens_out, p_cost);

  RETURN jsonb_build_object('ok', true);
END $$;

-- 2e. Get session with messages (for chat route — load history)
CREATE OR REPLACE FUNCTION api_cskh_session_load(p_tenant_id uuid, p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sess cskh_sessions;
  v_msgs jsonb;
BEGIN
  SELECT * INTO v_sess FROM cskh_sessions WHERE id = p_session_id AND tenant_id = p_tenant_id;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'role', m.role, 'content', m.content, 'tool_calls', m.tool_calls, 'created_at', m.created_at
  ) ORDER BY m.created_at)
  INTO v_msgs
  FROM cskh_messages m WHERE m.session_id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', v_sess.id,
      'status', v_sess.status,
      'channel', v_sess.channel,
      'verified_orders', v_sess.verified_orders,
      'customer_id', v_sess.customer_id
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
