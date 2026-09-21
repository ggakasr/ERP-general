-- WP-B2: Web Push subscription storage
-- push_subscriptions stores PushSubscription objects from browsers.
-- All access goes through api_save_push_subscription / api_delete_push_subscription.
-- The table is append-only per user+endpoint; duplicate endpoint upserts.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
               REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_subscriptions FROM authenticated, anon;

CREATE POLICY push_subscriptions_tenant ON push_subscriptions
  USING (tenant_id = fn_current_tenant());

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions(tenant_id);

-- ----------------------------------------------------------------
-- api_save_push_subscription
-- Upserts a Web Push subscription for the calling user.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION api_save_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF p_endpoint IS NULL OR p_p256dh IS NULL OR p_auth IS NULL
  THEN RETURN fn_fail('INVALID_INPUT', 'endpoint, p256dh, auth là bắt buộc'); END IF;

  INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_me.tenant_id, v_me.id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (user_id, endpoint) DO UPDATE
    SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ----------------------------------------------------------------
-- api_delete_push_subscription
-- Removes a specific push endpoint for the calling user.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION api_delete_push_subscription(p_endpoint text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  DELETE FROM push_subscriptions WHERE user_id = v_me.id AND endpoint = p_endpoint;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ----------------------------------------------------------------
-- api_list_push_subscriptions (SYSTEM_ADMIN only)
-- Used by the push sender to look up active endpoints for a user.
-- Returns only within the caller's tenant.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION api_list_push_subscriptions(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code = 'SYSTEM_ADMIN')
  THEN RETURN fn_fail('FORBIDDEN', 'Cần quyền SYSTEM_ADMIN'); END IF;

  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth, 'created_at', created_at
    )) FROM push_subscriptions
    WHERE user_id = p_user_id AND tenant_id = v_me.tenant_id
  ), '[]'));
END $$;

GRANT EXECUTE ON FUNCTION api_save_push_subscription(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION api_delete_push_subscription(text) TO authenticated;
GRANT EXECUTE ON FUNCTION api_list_push_subscriptions(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- BM-14: Acceptance criteria entries for WP-B2 tests
-- ----------------------------------------------------------------
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker)
VALUES
  ('T9.1', 'N9_PWA_PUSH', 'push_subscriptions table + api_save_push_subscription', 'L10', false),
  ('T9.2', 'N9_PWA_PUSH', 'api_save_push_subscription upsert — không tạo bản ghi trùng', 'L10', false),
  ('T9.3', 'N9_PWA_PUSH', 'push_subscriptions: cô lập user — api_list_push_subscriptions yêu cầu SYSTEM_ADMIN', 'L10', false),
  ('T9.4', 'N9_PWA_PUSH', 'api_notifications: cấu trúc ok + unread + rows', 'L10', false),
  ('T9.5', 'N9_PWA_PUSH', 'api_delete_push_subscription: xóa đúng endpoint', 'L10', false)
ON CONFLICT (test_code) DO NOTHING;
