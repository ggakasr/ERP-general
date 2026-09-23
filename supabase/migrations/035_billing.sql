-- WP-I1: Billing/subscription + packaging
-- Adds: subscriptions table, usage counting, plan feature gates, admin RPCs.
-- Plan tiers: STARTER / PROFESSIONAL / ENTERPRISE (already in tenants.plan CHECK)
--
-- Feature matrix:
--   STARTER:       5 users, 3 doc types, no audit pack, no SLA tracking
--   PROFESSIONAL:  20 users, all doc types, audit pack, handoff SLA
--   ENTERPRISE:    unlimited users, all features + SoD advanced + custom branding

-- ============================================================
-- 1. Subscriptions table
-- ============================================================
CREATE TABLE subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  plan         text        NOT NULL CHECK (plan IN ('STARTER','PROFESSIONAL','ENTERPRISE')),
  seats        int         NOT NULL DEFAULT 5,
  valid_from   date        NOT NULL DEFAULT current_date,
  valid_to     date,
  status       text        NOT NULL DEFAULT 'ACTIVE'
                           CHECK (status IN ('ACTIVE','TRIAL','EXPIRED','CANCELLED')),
  trial_ends   date,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_sub_active ON subscriptions (tenant_id) WHERE status IN ('ACTIVE','TRIAL');
CREATE INDEX idx_sub_tenant ON subscriptions (tenant_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON subscriptions FROM anon, authenticated;
CREATE POLICY sub_own_tenant ON subscriptions FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());

COMMENT ON TABLE subscriptions IS 'SaaS subscription per tenant — WP-I1';

-- ============================================================
-- 2. Plan feature limits (config table, not per-tenant)
-- ============================================================
CREATE TABLE plan_features (
  plan         text        NOT NULL CHECK (plan IN ('STARTER','PROFESSIONAL','ENTERPRISE')),
  feature      text        NOT NULL,
  limit_value  int,
  enabled      boolean     NOT NULL DEFAULT true,
  PRIMARY KEY (plan, feature)
);

REVOKE ALL ON plan_features FROM anon, authenticated;
GRANT SELECT ON plan_features TO authenticated;
ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_plan_features ON plan_features FOR SELECT TO authenticated USING (true);

INSERT INTO plan_features (plan, feature, limit_value, enabled) VALUES
  -- STARTER
  ('STARTER', 'MAX_USERS',        5,    true),
  ('STARTER', 'MAX_DOC_TYPES',    5,    true),
  ('STARTER', 'AUDIT_PACK',       NULL, false),
  ('STARTER', 'SLA_TRACKING',     NULL, false),
  ('STARTER', 'PORTAL',           NULL, false),
  ('STARTER', 'CUSTOM_BRANDING',  NULL, false),
  ('STARTER', 'RISK_ALERTS',      NULL, false),
  ('STARTER', 'DELEGATION',       NULL, false),
  -- PROFESSIONAL
  ('PROFESSIONAL', 'MAX_USERS',        20,   true),
  ('PROFESSIONAL', 'MAX_DOC_TYPES',    NULL, true),
  ('PROFESSIONAL', 'AUDIT_PACK',       NULL, true),
  ('PROFESSIONAL', 'SLA_TRACKING',     NULL, true),
  ('PROFESSIONAL', 'PORTAL',           NULL, true),
  ('PROFESSIONAL', 'CUSTOM_BRANDING',  NULL, false),
  ('PROFESSIONAL', 'RISK_ALERTS',      NULL, true),
  ('PROFESSIONAL', 'DELEGATION',       NULL, true),
  -- ENTERPRISE
  ('ENTERPRISE', 'MAX_USERS',        NULL, true),
  ('ENTERPRISE', 'MAX_DOC_TYPES',    NULL, true),
  ('ENTERPRISE', 'AUDIT_PACK',       NULL, true),
  ('ENTERPRISE', 'SLA_TRACKING',     NULL, true),
  ('ENTERPRISE', 'PORTAL',           NULL, true),
  ('ENTERPRISE', 'CUSTOM_BRANDING',  NULL, true),
  ('ENTERPRISE', 'RISK_ALERTS',      NULL, true),
  ('ENTERPRISE', 'DELEGATION',       NULL, true);

-- ============================================================
-- 3. Usage counting view
-- ============================================================
CREATE OR REPLACE FUNCTION api_subscription_info() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      app_users := fn_current_user();
  v_tenant  uuid      := fn_current_tenant();
  v_sub     subscriptions;
  v_users   int;
  v_docs    int;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;

  SELECT * INTO v_sub FROM subscriptions
  WHERE tenant_id = v_tenant AND status IN ('ACTIVE','TRIAL')
  ORDER BY created_at DESC LIMIT 1;

  SELECT count(*) INTO v_users FROM app_users WHERE tenant_id = v_tenant AND status = 'ACTIVE';
  SELECT count(DISTINCT doc_type) INTO v_docs FROM documents WHERE tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'ok', true,
    'subscription', CASE WHEN v_sub.id IS NOT NULL THEN jsonb_build_object(
      'id', v_sub.id,
      'plan', v_sub.plan,
      'seats', v_sub.seats,
      'status', v_sub.status,
      'valid_from', v_sub.valid_from,
      'valid_to', v_sub.valid_to,
      'trial_ends', v_sub.trial_ends
    ) ELSE null END,
    'plan', coalesce(v_sub.plan, (SELECT plan FROM tenants WHERE id = v_tenant)),
    'usage', jsonb_build_object(
      'active_users', v_users,
      'doc_types_used', v_docs,
      'documents_total', (SELECT count(*) FROM documents WHERE tenant_id = v_tenant)
    ),
    'features', coalesce((
      SELECT jsonb_object_agg(pf.feature, jsonb_build_object(
        'enabled', pf.enabled,
        'limit', pf.limit_value
      ))
      FROM plan_features pf
      WHERE pf.plan = coalesce(v_sub.plan, (SELECT plan FROM tenants WHERE id = v_tenant))
    ), '{}'::jsonb)
  );
END $$;

-- ============================================================
-- 4. Feature gate check function
-- ============================================================
CREATE OR REPLACE FUNCTION fn_feature_enabled(p_feature text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT pf.enabled FROM plan_features pf
     WHERE pf.plan = (SELECT t.plan FROM tenants t WHERE t.id = fn_current_tenant())
       AND pf.feature = p_feature),
    false
  );
$$;

CREATE OR REPLACE FUNCTION fn_feature_limit(p_feature text) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pf.limit_value FROM plan_features pf
  WHERE pf.plan = (SELECT t.plan FROM tenants t WHERE t.id = fn_current_tenant())
    AND pf.feature = p_feature;
$$;

-- ============================================================
-- 5. Seed default subscription for existing tenant
-- ============================================================
INSERT INTO subscriptions (tenant_id, plan, seats, valid_from, status)
SELECT id, plan, 20, '2026-01-01', 'ACTIVE'
FROM tenants
WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = tenants.id);

-- ============================================================
-- 6. Admin: upgrade/downgrade plan
-- ============================================================
CREATE OR REPLACE FUNCTION api_admin_change_plan(
  p_tenant_id uuid,
  p_new_plan  text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_old text;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'TENANT', 'EDIT') < 4 THEN
    RETURN fn_fail('FORBIDDEN','Chỉ quản trị viên hệ thống');
  END IF;
  IF p_new_plan NOT IN ('STARTER','PROFESSIONAL','ENTERPRISE') THEN
    RETURN fn_fail('BAD_INPUT','Gói không hợp lệ');
  END IF;

  SELECT plan INTO v_old FROM tenants WHERE id = p_tenant_id;
  IF v_old IS NULL THEN RETURN fn_fail('NOT_FOUND','Tenant không tồn tại'); END IF;

  UPDATE tenants SET plan = p_new_plan WHERE id = p_tenant_id;

  UPDATE subscriptions SET
    plan = p_new_plan,
    seats = CASE p_new_plan WHEN 'STARTER' THEN 5 WHEN 'PROFESSIONAL' THEN 20 ELSE 9999 END,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND status IN ('ACTIVE','TRIAL');

  INSERT INTO audit_trail (tenant_id, table_name, record_id, action, old_vals, new_vals, user_id)
  VALUES (fn_current_tenant(), 'tenants', p_tenant_id::text, 'PLAN_CHANGE',
    jsonb_build_object('plan', v_old),
    jsonb_build_object('plan', p_new_plan),
    v_me.id);

  RETURN jsonb_build_object('ok', true, 'old_plan', v_old, 'new_plan', p_new_plan);
END $$;

-- ============================================================
-- 7. Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION api_subscription_info() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_feature_enabled(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_feature_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION api_admin_change_plan(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
