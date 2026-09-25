-- 044_cskh_stats.sql — WP-K5: CSKH bot dashboard stats + KPI catalog entries

-- ═══════════════════════════════════════════════════════════════
-- 1. STATS RPC
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api_cskh_stats(p_from text DEFAULT NULL, p_to text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_from timestamptz;
  v_to   timestamptz;
  v_sessions_by_channel jsonb;
  v_sessions_by_day jsonb;
  v_resolution jsonb;
  v_handoff_reasons jsonb;
  v_response_time jsonb;
  v_csat jsonb;
  v_ticket_sla jsonb;
  v_cost jsonb;
  v_rails jsonb;
  v_totals jsonb;
BEGIN
  IF v_me IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id
      AND role_code IN ('CS_AGENT','CS_MANAGER','CEO','CFO','COO')) THEN
    RETURN fn_fail('FORBIDDEN','Không có quyền xem thống kê CSKH');
  END IF;

  v_from := COALESCE(p_from::date, (now() - interval '30 days'))::timestamptz;
  v_to   := COALESCE(p_to::date + 1, now());

  -- 1. Sessions by channel
  SELECT COALESCE(jsonb_agg(jsonb_build_object('channel', channel, 'count', cnt)), '[]'::jsonb)
  INTO v_sessions_by_channel
  FROM (
    SELECT channel, count(*) AS cnt
    FROM cskh_sessions
    WHERE tenant_id = v_me.tenant_id AND NOT is_test
      AND created_at >= v_from AND created_at < v_to
    GROUP BY channel
  ) q;

  -- 2. Sessions by day
  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'count', cnt) ORDER BY d), '[]'::jsonb)
  INTO v_sessions_by_day
  FROM (
    SELECT created_at::date AS d, count(*) AS cnt
    FROM cskh_sessions
    WHERE tenant_id = v_me.tenant_id AND NOT is_test
      AND created_at >= v_from AND created_at < v_to
    GROUP BY created_at::date
  ) q;

  -- 3. Resolution: bot self-resolved vs handoff
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND NOT is_test AND created_at >= v_from AND created_at < v_to),
    'closed', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND NOT is_test AND status = 'closed' AND created_at >= v_from AND created_at < v_to),
    'bot_resolved', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND NOT is_test AND status = 'closed' AND agent_user_id IS NULL AND created_at >= v_from AND created_at < v_to),
    'handed_off', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND NOT is_test AND (status IN ('awaiting_human','human_serving') OR (status = 'closed' AND agent_user_id IS NOT NULL)) AND created_at >= v_from AND created_at < v_to)
  ) INTO v_resolution;

  -- 4. Top handoff reasons
  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_handoff_reasons
  FROM (
    SELECT COALESCE(handoff_reason, 'không rõ') AS reason, count(*) AS cnt
    FROM cskh_sessions
    WHERE tenant_id = v_me.tenant_id AND NOT is_test
      AND handoff_reason IS NOT NULL
      AND created_at >= v_from AND created_at < v_to
    GROUP BY handoff_reason
    ORDER BY cnt DESC LIMIT 10
  ) q;

  -- 5. Staff first response time (avg minutes from handoff to first agent message)
  SELECT jsonb_build_object(
    'avg_minutes', COALESCE(round(avg(rt)::numeric, 1), 0),
    'median_minutes', COALESCE(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY rt)::numeric, 1), 0)
  ) INTO v_response_time
  FROM (
    SELECT EXTRACT(EPOCH FROM (
      (SELECT min(m.created_at) FROM cskh_messages m WHERE m.session_id = s.id AND m.role = 'agent')
      - s.updated_at
    )) / 60.0 AS rt
    FROM cskh_sessions s
    WHERE s.tenant_id = v_me.tenant_id AND NOT s.is_test
      AND s.agent_user_id IS NOT NULL
      AND s.created_at >= v_from AND s.created_at < v_to
      AND EXISTS (SELECT 1 FROM cskh_messages m WHERE m.session_id = s.id AND m.role = 'agent')
  ) q
  WHERE rt IS NOT NULL AND rt > 0;

  -- 6. CSAT
  SELECT jsonb_build_object(
    'avg', COALESCE(round(avg(csat)::numeric, 2), 0),
    'count', count(csat),
    'distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('score', score, 'count', cnt) ORDER BY score)
      FROM (
        SELECT csat AS score, count(*) AS cnt
        FROM cskh_sessions
        WHERE tenant_id = v_me.tenant_id AND NOT is_test AND csat IS NOT NULL
          AND created_at >= v_from AND created_at < v_to
        GROUP BY csat
      ) d
    ), '[]'::jsonb)
  ) INTO v_csat
  FROM cskh_sessions
  WHERE tenant_id = v_me.tenant_id AND NOT is_test AND csat IS NOT NULL
    AND created_at >= v_from AND created_at < v_to;

  -- 7. TICKET SLA from bot (tickets created by bot, closed within SLA)
  SELECT jsonb_build_object(
    'total_tickets', count(*),
    'closed_tickets', count(*) FILTER (WHERE d.status = 'CLOSED'),
    'avg_resolve_hours', COALESCE(round(avg(
      EXTRACT(EPOCH FROM (d.updated_at - d.created_at)) / 3600.0
    ) FILTER (WHERE d.status = 'CLOSED')::numeric, 1), 0)
  ) INTO v_ticket_sla
  FROM cskh_sessions s
  JOIN documents d ON d.id = s.ticket_id
  WHERE s.tenant_id = v_me.tenant_id AND NOT s.is_test
    AND s.created_at >= v_from AND s.created_at < v_to;

  -- 8. AI cost (by provider) — only CS_MANAGER/CEO/CFO can see
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id
      AND role_code IN ('CS_MANAGER','CEO','CFO','COO')) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'provider', provider, 'model', model,
      'tokens_in', tin, 'tokens_out', tout, 'cost', cost
    )), '[]'::jsonb) INTO v_cost
    FROM (
      SELECT u.provider, u.model,
             sum(u.tokens_in) AS tin, sum(u.tokens_out) AS tout,
             sum(u.estimated_cost) AS cost
      FROM cskh_usage u
      JOIN cskh_sessions s ON s.id = u.session_id
      WHERE u.tenant_id = v_me.tenant_id AND NOT s.is_test
        AND u.created_at >= v_from AND u.created_at < v_to
      GROUP BY u.provider, u.model
      ORDER BY cost DESC
    ) q;
  ELSE
    v_cost := NULL;
  END IF;

  -- 9. Rails violations blocked
  SELECT jsonb_build_object(
    'blocked', COALESCE((
      SELECT count(*)
      FROM cskh_messages m
      JOIN cskh_sessions s ON s.id = m.session_id
      WHERE m.tenant_id = v_me.tenant_id AND NOT s.is_test
        AND m.role = 'system' AND m.content LIKE '%[RAILS]%'
        AND m.created_at >= v_from AND m.created_at < v_to
    ), 0)
  ) INTO v_rails;

  -- 10. Totals
  SELECT jsonb_build_object(
    'total_sessions', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND NOT is_test AND created_at >= v_from AND created_at < v_to),
    'total_messages', (SELECT count(*) FROM cskh_messages m JOIN cskh_sessions s ON s.id = m.session_id WHERE m.tenant_id = v_me.tenant_id AND NOT s.is_test AND m.created_at >= v_from AND m.created_at < v_to),
    'active_sessions', (SELECT count(*) FROM cskh_sessions WHERE tenant_id = v_me.tenant_id AND NOT is_test AND status IN ('serving','awaiting_human','human_serving'))
  ) INTO v_totals;

  RETURN jsonb_build_object(
    'ok', true,
    'from', v_from, 'to', v_to,
    'totals', v_totals,
    'sessions_by_channel', v_sessions_by_channel,
    'sessions_by_day', v_sessions_by_day,
    'resolution', v_resolution,
    'handoff_reasons', v_handoff_reasons,
    'response_time', v_response_time,
    'csat', v_csat,
    'ticket_sla', v_ticket_sla,
    'cost', v_cost,
    'rails', v_rails
  );
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 2. KPI CATALOG ENTRIES FOR CSKH
-- ═══════════════════════════════════════════════════════════════

INSERT INTO kpi_catalog (code, name, category, formula, target_value, target_unit, direction, owner_department_code, flow_code)
VALUES
  ('CUS-003','Tỉ lệ bot tự giải quyết','CUSTOMER','Phiên đóng không chuyển người / Tổng phiên đóng',70,'%','HIGHER','CS','L9'),
  ('CUS-004','Chi phí AI trung bình/phiên','CUSTOMER','Tổng estimated_cost / Tổng phiên có usage',NULL,'VND','LOWER','CS','L9'),
  ('CUS-005','CSAT trung bình bot CSKH','CUSTOMER','avg(csat) phiên có đánh giá',4.0,'điểm','HIGHER','CS','L9')
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 3. GRANTS
-- ═══════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION api_cskh_stats(text, text) TO authenticated;
