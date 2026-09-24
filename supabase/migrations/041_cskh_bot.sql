-- 041_cskh_bot.sql  —  WP-K1: Nền dữ liệu bot CSKH
-- Tables: cskh_sessions, cskh_messages, cskh_usage, cskh_bot_config
-- Doc type: KB_ARTICLE (DRAFT → SUBMITTED → PUBLISHED → ARCHIVED, SoD)
-- Permissions: CS_AGENT, CS_MANAGER, CEO, CFO
-- API functions: api_cskh_config_get/set, api_cskh_sessions, api_cskh_session_get, api_cskh_kb_published

-- ═══════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════════════════════════

-- Bot configuration per tenant
CREATE TABLE IF NOT EXISTS cskh_bot_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  provider    text NOT NULL DEFAULT 'mock',          -- mock | claude | openai-compat
  model       text NOT NULL DEFAULT 'mock',
  persona     text NOT NULL DEFAULT 'Trợ lý CSKH',
  greeting    text NOT NULL DEFAULT 'Xin chào! Em là trợ lý CSKH, em có thể giúp gì cho anh/chị ạ?',
  handoff_confidence numeric(3,2) NOT NULL DEFAULT 0.60,
  forbidden_promises text[] NOT NULL DEFAULT '{bồi thường,hoàn tiền 100%,miễn phí toàn bộ,cam kết,đảm bảo}'::text[],
  sensitive_fields   text[] NOT NULL DEFAULT '{phone,address,amount,total}'::text[],
  voice_enabled boolean NOT NULL DEFAULT false,
  bot_enabled   boolean NOT NULL DEFAULT true,
  widget_key    text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- Chat/voice sessions
CREATE TABLE IF NOT EXISTS cskh_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  channel        text NOT NULL DEFAULT 'chat' CHECK (channel IN ('chat','voice')),
  source         text NOT NULL DEFAULT 'public' CHECK (source IN ('portal','public','phone')),
  customer_id    uuid REFERENCES partners(id),          -- nullable for anonymous
  status         text NOT NULL DEFAULT 'serving'
                   CHECK (status IN ('serving','awaiting_human','human_serving','closed')),
  handoff_reason text,
  ticket_id      uuid REFERENCES documents(id),         -- linked TICKET when handoff
  verified_orders uuid[] DEFAULT '{}',                   -- order IDs verified via xac_thuc_khach
  csat           smallint CHECK (csat IS NULL OR (csat >= 1 AND csat <= 5)),
  agent_user_id  uuid REFERENCES app_users(id),          -- human agent who took over
  is_test        boolean NOT NULL DEFAULT false,
  widget_key     text,                                    -- which widget_key started this
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Messages in a session
CREATE TABLE IF NOT EXISTS cskh_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  session_id     uuid NOT NULL REFERENCES cskh_sessions(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('user','assistant','agent','tool','system')),
  content        text,
  tool_calls     jsonb,                                   -- [{name, args, result}]
  agent_user_id  uuid REFERENCES app_users(id),           -- set when role='agent'
  tokens_in      int DEFAULT 0,
  tokens_out     int DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- LLM usage tracking
CREATE TABLE IF NOT EXISTS cskh_usage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  session_id     uuid NOT NULL REFERENCES cskh_sessions(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  model          text NOT NULL,
  tokens_in      int NOT NULL DEFAULT 0,
  tokens_out     int NOT NULL DEFAULT 0,
  estimated_cost numeric(10,6) DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cskh_sessions_tenant ON cskh_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cskh_sessions_status ON cskh_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cskh_messages_session ON cskh_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_cskh_usage_session ON cskh_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_cskh_usage_tenant ON cskh_usage(tenant_id, created_at);

-- ═══════════════════════════════════════════════════════════════
-- 2. RLS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE cskh_bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cskh_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cskh_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cskh_usage      ENABLE ROW LEVEL SECURITY;

CREATE POLICY cskh_bot_config_tenant ON cskh_bot_config USING (tenant_id = fn_current_tenant());
CREATE POLICY cskh_sessions_tenant   ON cskh_sessions   USING (tenant_id = fn_current_tenant());
CREATE POLICY cskh_messages_tenant   ON cskh_messages   USING (tenant_id = fn_current_tenant());
CREATE POLICY cskh_usage_tenant      ON cskh_usage      USING (tenant_id = fn_current_tenant());

REVOKE ALL ON cskh_bot_config FROM anon, authenticated;
REVOKE ALL ON cskh_sessions   FROM anon, authenticated;
REVOKE ALL ON cskh_messages   FROM anon, authenticated;
REVOKE ALL ON cskh_usage      FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. DOC TYPE: KB_ARTICLE via config
-- ═══════════════════════════════════════════════════════════════

INSERT INTO doc_types (code, name, prefix, flow_code, module, initial_status, terminal_statuses, financial, create_sod_role, sort) VALUES
  ('KB_ARTICLE', 'Bài tri thức CSKH', 'KB', 'L9', 'customer-service', 'DRAFT', '{ARCHIVED}', false, 'REQUESTER', 85)
ON CONFLICT (code) DO UPDATE SET name = excluded.name, prefix = excluded.prefix, module = excluded.module;

-- State transitions: DRAFT → SUBMITTED → PUBLISHED → ARCHIVED
-- SoD: creator ≠ publisher (REQUESTER on create, APPROVER on publish)
INSERT INTO state_transitions (doc_type, from_status, to_status, action, label, permission_action, permission_resource, sod_role, conditions, style, system_only, sort) VALUES
  ('KB_ARTICLE', 'DRAFT',     'SUBMITTED', 'submit',  'Gửi duyệt',   'CREATE',  NULL, NULL,       '{}',  'primary', false, 1),
  ('KB_ARTICLE', 'SUBMITTED', 'PUBLISHED', 'publish', 'Đăng',         'APPROVE', NULL, 'APPROVER', '{}',  'success', false, 2),
  ('KB_ARTICLE', 'SUBMITTED', 'DRAFT',     'reject',  'Trả về nháp',  'APPROVE', NULL, NULL,       '{}',  'danger',  false, 3),
  ('KB_ARTICLE', 'PUBLISHED', 'ARCHIVED',  'archive', 'Lưu trữ',      'APPROVE', NULL, NULL,       '{}',  'default', false, 4),
  ('KB_ARTICLE', 'ARCHIVED',  'DRAFT',     'reopen',  'Mở lại nháp',  'APPROVE', NULL, NULL,       '{}',  'default', false, 5)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. PERMISSIONS (CS_AGENT, CS_MANAGER, CEO, CFO)
-- ═══════════════════════════════════════════════════════════════

-- Helper (same pattern as 003_config.sql)
CREATE OR REPLACE FUNCTION _k1_perm(
  p_role text, p_resources text, p_actions text, p_scope text, p_hidden text[] DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  res text; act text;
BEGIN
  FOREACH res IN ARRAY string_to_array(p_resources, ',') LOOP
    FOREACH act IN ARRAY string_to_array(p_actions, ',') LOOP
      INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions)
      VALUES (trim(res), trim(res), trim(act), p_scope, to_jsonb(p_hidden))
      ON CONFLICT (role_code, resource, action) DO UPDATE
        SET data_scope = excluded.data_scope, field_restrictions = excluded.field_restrictions;
      -- Actually role_code should be the ROLE, not the resource. Fix:
    END LOOP;
  END LOOP;
END $$;

-- Drop and redo properly
DROP FUNCTION _k1_perm;

-- Direct inserts for clarity
DO $$
DECLARE
  v_role text; v_res text; v_act text;
BEGIN
  -- CS_AGENT: VIEW/REPLY sessions (OWN), CREATE/EDIT KB_ARTICLE (OWN), VIEW TICKET (OWN)
  FOREACH v_act IN ARRAY ARRAY['VIEW','CREATE','EDIT'] LOOP
    INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions)
    VALUES ('CS_AGENT', 'KB_ARTICLE', v_act, 'OWN', '{}'::jsonb)
    ON CONFLICT (role_code, resource, action) DO UPDATE
      SET data_scope = excluded.data_scope;
  END LOOP;

  -- CS_MANAGER: all KB_ARTICLE actions including APPROVE (COMPANY scope)
  FOREACH v_act IN ARRAY ARRAY['VIEW','CREATE','EDIT','APPROVE'] LOOP
    INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions)
    VALUES ('CS_MANAGER', 'KB_ARTICLE', v_act, 'COMPANY', '{}'::jsonb)
    ON CONFLICT (role_code, resource, action) DO UPDATE
      SET data_scope = excluded.data_scope;
  END LOOP;

  -- CS_MANAGER: VIEW/EDIT on CSKH_CONFIG (virtual resource for config)
  FOREACH v_act IN ARRAY ARRAY['VIEW','EDIT'] LOOP
    INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions)
    VALUES ('CS_MANAGER', 'CSKH_CONFIG', v_act, 'COMPANY', '{}'::jsonb)
    ON CONFLICT (role_code, resource, action) DO UPDATE
      SET data_scope = excluded.data_scope;
  END LOOP;

  -- CEO/CFO: VIEW CSKH stats (COMPANY) — re-use existing CEO/CFO roles
  FOREACH v_role IN ARRAY ARRAY['CEO','CFO'] LOOP
    INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions)
    VALUES (v_role, 'KB_ARTICLE', 'VIEW', 'COMPANY', '{}'::jsonb)
    ON CONFLICT (role_code, resource, action) DO UPDATE
      SET data_scope = excluded.data_scope;
    INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions)
    VALUES (v_role, 'CSKH_CONFIG', 'VIEW', 'COMPANY', '{}'::jsonb)
    ON CONFLICT (role_code, resource, action) DO UPDATE
      SET data_scope = excluded.data_scope;
  END LOOP;
END $$;

-- Also ensure CS_AGENT and CS_MANAGER can VIEW TICKET (from 003_config)
INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions)
VALUES
  ('CS_AGENT',   'TICKET', 'VIEW',   'OWN',     '{}'::jsonb),
  ('CS_AGENT',   'TICKET', 'CREATE', 'OWN',     '{}'::jsonb),
  ('CS_AGENT',   'TICKET', 'EDIT',   'OWN',     '{}'::jsonb),
  ('CS_MANAGER', 'TICKET', 'VIEW',   'COMPANY', '{}'::jsonb),
  ('CS_MANAGER', 'TICKET', 'CREATE', 'COMPANY', '{}'::jsonb),
  ('CS_MANAGER', 'TICKET', 'EDIT',   'COMPANY', '{}'::jsonb),
  ('CS_MANAGER', 'TICKET', 'APPROVE','COMPANY', '{}'::jsonb)
ON CONFLICT (role_code, resource, action) DO UPDATE
  SET data_scope = excluded.data_scope;

-- ═══════════════════════════════════════════════════════════════
-- 5. SEED: Default bot config for default tenant
-- ═══════════════════════════════════════════════════════════════

INSERT INTO cskh_bot_config (tenant_id)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (tenant_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 6. SEED: Knowledge articles as KB_ARTICLE documents
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_branch uuid;
  v_dept   uuid;
  v_user   uuid;
  v_mgr    uuid;
  v_doc_id uuid;
  v_now    timestamptz := now();
BEGIN
  -- Get default branch/dept/user for seeding
  SELECT id INTO v_branch FROM branches WHERE tenant_id = v_tenant LIMIT 1;
  SELECT id INTO v_dept FROM departments WHERE tenant_id = v_tenant LIMIT 1;
  -- Use a user with CS or admin role as creator
  SELECT id INTO v_user FROM app_users WHERE tenant_id = v_tenant AND email = 'admin@erp.demo' LIMIT 1;
  -- Use a different user as publisher (SoD: creator ≠ publisher)
  SELECT id INTO v_mgr FROM app_users WHERE tenant_id = v_tenant AND email = 'ceo@erp.demo' LIMIT 1;

  IF v_user IS NULL OR v_mgr IS NULL OR v_branch IS NULL THEN
    RAISE NOTICE 'Skipping KB seed: missing seed users/branch';
    RETURN;
  END IF;

  -- KB-1: FAQ Đổi trả
  INSERT INTO documents (id, tenant_id, doc_type, title, number, status, branch_id, department_id, created_by, data)
  VALUES (
    gen_random_uuid(), v_tenant, 'KB_ARTICLE', 'FAQ — Chính sách đổi trả',
    'KB-' || to_char(v_now, 'YYYYMM') || '-00001', 'PUBLISHED', v_branch, v_dept, v_user,
    jsonb_build_object(
      'kind', 'faq', 'topic', 'doi-tra', 'version', '1.2',
      'body', E'## Chính sách đổi trả\n- Hàng mua tại cửa hàng được đổi trả trong vòng **30 ngày** kể từ ngày nhận hàng.\n- Điều kiện: sản phẩm còn nguyên tem mác, chưa qua sử dụng, đầy đủ hóa đơn.\n- Sản phẩm lỗi do nhà sản xuất: hoàn 100% giá trị hoặc đổi mới miễn phí vận chuyển.\n\n## Đổi trả bao lâu\n- Thời gian xử lý: 3–5 ngày làm việc sau khi cửa hàng nhận lại hàng.\n- Hoàn tiền: 3–7 ngày làm việc tùy phương thức (chuyển khoản nhanh hơn).\n\n## Phí vận chuyển đổi trả\n- Miễn phí nếu sản phẩm lỗi; khách trả phí ship nếu đổi do đổi ý (30.000đ/chiều).\n\n## Hàng giao lâu\n- Đơn nội thành HCM/HN: 1–2 ngày. Tỉnh khác: 3–5 ngày. Kiểm tra bằng mã vận đơn tại mục tra cứu đơn hàng.'
    )
  ) RETURNING id INTO v_doc_id;
  -- Record SoD: creator = REQUESTER
  INSERT INTO sod_check_log (tenant_id, document_id, doc_type, user_id, attempted_role, result)
  VALUES (v_tenant, v_doc_id, 'KB_ARTICLE', v_user, 'REQUESTER', 'PASSED');

  -- KB-2: FAQ Giao hàng
  INSERT INTO documents (id, tenant_id, doc_type, title, number, status, branch_id, department_id, created_by, data)
  VALUES (
    gen_random_uuid(), v_tenant, 'KB_ARTICLE', 'FAQ — Giao hàng & vận chuyển',
    'KB-' || to_char(v_now, 'YYYYMM') || '-00002', 'PUBLISHED', v_branch, v_dept, v_user,
    jsonb_build_object(
      'kind', 'faq', 'topic', 'giao-hang', 'version', '1.0',
      'body', E'## Phí giao hàng\n- Nội thành: miễn phí cho đơn từ 300.000đ; dưới mức đó 20.000đ.\n- Tỉnh/thành khác: 30.000đ, freeship cho đơn từ 500.000đ.\n\n## Theo dõi đơn hàng\n- Khách dùng mã đơn DHxxxxxx trong mục "Tra cứu đơn hàng"; hoặc nhắn mã đơn để em tra giúp.\n\n## Sản phẩm giao bị hỏng\n- Vui lòng ghi lại video/ảnh khi mở hàng và liên hệ trong 48h để được đổi mới miễn phí (chuyển nhân viên xử lý).'
    )
  );

  -- KB-3: Kịch bản chat
  INSERT INTO documents (id, tenant_id, doc_type, title, number, status, branch_id, department_id, created_by, data)
  VALUES (
    gen_random_uuid(), v_tenant, 'KB_ARTICLE', 'Kịch bản hội thoại — Chat',
    'KB-' || to_char(v_now, 'YYYYMM') || '-00003', 'PUBLISHED', v_branch, v_dept, v_user,
    jsonb_build_object(
      'kind', 'script_chat', 'topic', 'kich-ban-chat', 'version', '1.2',
      'body', E'## Mở đầu\n- Khi khách nhắn tin đầu tiên: chào thân thiện, xưng "em", liệt kê 2–3 việc em giúp được.\n- Giọng điệu: tự nhiên, không máy móc; dùng từ đời thường ("ạ", "nhé"), tránh câu dài > 2 dòng.\n\n## Tra cứu đơn hàng\n1. Hỏi xin mã đơn (định dạng DH + số).\n2. Gọi tool tra_cuu_don_hang.\n3. Có kết quả → trả lời trạng thái + mốc thời gian.\n4. Không có → R1: "chưa tìm thấy mã này, để em kiểm tra lại" + mời kiểm tra lại mã / gặp người.\n5. Khách hỏi địa chỉ/SĐT/giá → yêu cầu xác thực xac_thuc_khach trước (R2).\n\n## Đổi trả\n- Hỏi lý do + trạng thái đơn → trả lời theo FAQ chính sách.\n- Đơn đã giao >= 30 ngày → nói rõ ngoài hạn, đề xuất hướng khác.\n- Khách khó chịu/bồi thường → R3: chuyển người, không tự hứa.\n\n## Khiếu nại / muốn gặp người\n- Dùng de_xuat_handoff kèm lý do cụ thể.\n- Trấn an: "em đã ghi nhận, nhân viên sẽ tiếp nhận ngay".\n- KHÔNG bao giờ tranh cãi với khách; luôn giữ lịch sự.\n\n## Kết thúc\n- Xác nhận đã giải quyết xong việc chính + mời hỏi thêm.\n- Chào tạm biệt ấm áp, kèm nụ cười (emoji nhẹ).'
    )
  );

  -- KB-4: Kịch bản gọi điện
  INSERT INTO documents (id, tenant_id, doc_type, title, number, status, branch_id, department_id, created_by, data)
  VALUES (
    gen_random_uuid(), v_tenant, 'KB_ARTICLE', 'Kịch bản hội thoại — Gọi điện',
    'KB-' || to_char(v_now, 'YYYYMM') || '-00004', 'PUBLISHED', v_branch, v_dept, v_user,
    jsonb_build_object(
      'kind', 'script_call', 'topic', 'kich-ban-call', 'version', '1.0',
      'body', E'## Mở đầu cuộc gọi\n- "Dạ, em xin nghe ạ! Em là trợ lý chăm sóc khách hàng. Anh/chị gọi để em hỗ trợ gì ạ?"\n- Không tự giới thiệu dài — khách gọi thường cần nhanh.\n\n## Duy trì turn\n- Sau mỗi câu trả lời: hỏi 1 câu ngắn ("Anh/chị còn cần em hỗ trợ gì thêm ạ?").\n- Người nói chậm/ngập ngừng → chủ động gợi ý.\n\n## Tra đơn qua điện thoại\n1. Xin mã đơn bằng giọng nói (STT lấy mã).\n2. Tool tra_cuu_don_hang → trả lời ngắn gọn.\n3. Cần dữ liệu nhạy cảm → xác thực bằng SĐT (R2) trước.\n\n## Khiếu nại/bồi thường qua điện thoại\n- Nhận diện từ khóa → R3: chuyển người ngay, không hứa.\n- "Dạ trường hợp này em xin phép chuyển máy cho nhân viên ạ."\n\n## Kết thúc cuộc gọi\n- Chốt việc chính + "Cảm ơn anh/chị đã gọi. Chúc anh/chị sức khỏe ạ!" → kết thúc.'
    )
  );

  -- KB-5: Kịch bản handoff
  INSERT INTO documents (id, tenant_id, doc_type, title, number, status, branch_id, department_id, created_by, data)
  VALUES (
    gen_random_uuid(), v_tenant, 'KB_ARTICLE', 'Kịch bản — Chuyển người (Handoff)',
    'KB-' || to_char(v_now, 'YYYYMM') || '-00005', 'PUBLISHED', v_branch, v_dept, v_user,
    jsonb_build_object(
      'kind', 'script_handoff', 'topic', 'handoff', 'version', '1.0',
      'body', E'## Bước thực hiện\n1. Gọi tool de_xuat_handoff với lý do cụ thể (khách yêu cầu / khiếu nại bồi thường / AI không trả được).\n2. Session chuyển serving → awaiting_human; kèm transcript đầy đủ (R4).\n3. Thông báo khách lịch sự, không nói "bot", nói "em chuyển cho nhân viên".\n4. Nhân viên nhận: xem transcript + dữ liệu đã tra → tiếp tục.\n\n## Nguyên tắc\n- KHÔNG hứa hẹn thời gian xử lý cụ thể nếu chưa biết.\n- KHÔNG để khách chờ > 5 phút không người nhận → hẹn gọi lại + ghi ticket.\n- Mọi handoff đều ghi lý do vào log (audit).'
    )
  );

  -- Advance the doc_sequences counter so fn_next_number won't collide with seeded KB numbers
  INSERT INTO doc_sequences (tenant_id, prefix, yyyymm, last_seq)
  VALUES (v_tenant, 'KB', to_char(v_now, 'YYYYMM'), 5)
  ON CONFLICT (tenant_id, prefix, yyyymm) DO UPDATE SET last_seq = GREATEST(doc_sequences.last_seq, 5);

END $$;

-- ═══════════════════════════════════════════════════════════════
-- 7. API FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- 7.1 Get bot config for current tenant
CREATE OR REPLACE FUNCTION api_cskh_config_get()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := fn_current_tenant();
  v_me     app_users;
  v_cfg    record;
BEGIN
  v_me := fn_current_user();
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'AUTH'); END IF;

  -- Check permission: CSKH_CONFIG VIEW
  IF fn_perm_scope(v_me.id, 'CSKH_CONFIG', 'VIEW') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_cfg FROM cskh_bot_config WHERE tenant_id = v_tenant;
  IF v_cfg IS NULL THEN
    -- Auto-create default config
    INSERT INTO cskh_bot_config (tenant_id) VALUES (v_tenant) RETURNING * INTO v_cfg;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'config', jsonb_build_object(
      'id', v_cfg.id,
      'provider', v_cfg.provider,
      'model', v_cfg.model,
      'persona', v_cfg.persona,
      'greeting', v_cfg.greeting,
      'handoff_confidence', v_cfg.handoff_confidence,
      'forbidden_promises', v_cfg.forbidden_promises,
      'sensitive_fields', v_cfg.sensitive_fields,
      'voice_enabled', v_cfg.voice_enabled,
      'bot_enabled', v_cfg.bot_enabled,
      'widget_key', v_cfg.widget_key
    )
  );
END $$;

-- 7.2 Update bot config
CREATE OR REPLACE FUNCTION api_cskh_config_set(p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := fn_current_tenant();
  v_me     app_users;
  v_cfg    record;
  v_old    jsonb;
BEGIN
  v_me := fn_current_user();
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'AUTH'); END IF;

  IF fn_perm_scope(v_me.id, 'CSKH_CONFIG', 'EDIT') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_cfg FROM cskh_bot_config WHERE tenant_id = v_tenant;
  IF v_cfg IS NULL THEN
    INSERT INTO cskh_bot_config (tenant_id) VALUES (v_tenant) RETURNING * INTO v_cfg;
  END IF;

  -- Snapshot old values for audit
  v_old := jsonb_build_object(
    'provider', v_cfg.provider, 'model', v_cfg.model, 'persona', v_cfg.persona,
    'greeting', v_cfg.greeting, 'voice_enabled', v_cfg.voice_enabled,
    'bot_enabled', v_cfg.bot_enabled
  );

  UPDATE cskh_bot_config SET
    provider   = COALESCE(p_changes->>'provider', provider),
    model      = COALESCE(p_changes->>'model', model),
    persona    = COALESCE(p_changes->>'persona', persona),
    greeting   = COALESCE(p_changes->>'greeting', greeting),
    handoff_confidence = COALESCE((p_changes->>'handoff_confidence')::numeric, handoff_confidence),
    voice_enabled = COALESCE((p_changes->>'voice_enabled')::boolean, voice_enabled),
    bot_enabled   = COALESCE((p_changes->>'bot_enabled')::boolean, bot_enabled),
    updated_at = now()
  WHERE tenant_id = v_tenant;

  -- Audit trail
  INSERT INTO audit_trail (tenant_id, table_name, record_id, action, old_value, new_value, user_id, user_name)
  VALUES (v_tenant, 'CSKH_CONFIG', v_cfg.id::text, 'UPDATE', v_old, p_changes, v_me.id, v_me.full_name);

  RETURN jsonb_build_object('ok', true);
END $$;

-- 7.3 List CSKH sessions (for staff console)
CREATE OR REPLACE FUNCTION api_cskh_sessions(
  p_status text DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := fn_current_tenant();
  v_me     app_users;
  v_scope  int;
  v_rows   jsonb;
  v_total  int;
BEGIN
  v_me := fn_current_user();
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'AUTH'); END IF;

  -- Check TICKET VIEW permission (sessions relate to TICKET)
  v_scope := fn_perm_scope(v_me.id, 'TICKET', 'VIEW');
  IF v_scope = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT count(*) INTO v_total
  FROM cskh_sessions s
  WHERE s.tenant_id = v_tenant
    AND (p_status IS NULL OR s.status = p_status)
    AND (p_channel IS NULL OR s.channel = p_channel)
    AND s.is_test = false
    AND (v_scope >= 4  -- COMPANY
         OR (v_scope >= 2 AND s.agent_user_id = v_me.id));  -- OWN: only sessions assigned to me

  SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.updated_at DESC)
  INTO v_rows
  FROM (
    SELECT s.id, s.channel, s.source, s.status, s.handoff_reason,
           s.csat, s.is_test, s.created_at, s.updated_at,
           p.name AS customer_name,
           ag.full_name AS agent_name,
           s.ticket_id,
           (SELECT d.number FROM documents d WHERE d.id = s.ticket_id) AS ticket_number
    FROM cskh_sessions s
    LEFT JOIN partners p ON p.id = s.customer_id
    LEFT JOIN app_users ag ON ag.id = s.agent_user_id
    WHERE s.tenant_id = v_tenant
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_channel IS NULL OR s.channel = p_channel)
      AND s.is_test = false
      AND (v_scope >= 4
           OR (v_scope >= 2 AND s.agent_user_id = v_me.id))
    ORDER BY s.updated_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('ok', true, 'sessions', COALESCE(v_rows, '[]'::jsonb), 'total', v_total);
END $$;

-- 7.4 Get single session with messages
CREATE OR REPLACE FUNCTION api_cskh_session_get(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := fn_current_tenant();
  v_me     app_users;
  v_scope  int;
  v_sess   record;
  v_msgs   jsonb;
BEGIN
  v_me := fn_current_user();
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'AUTH'); END IF;

  v_scope := fn_perm_scope(v_me.id, 'TICKET', 'VIEW');
  IF v_scope = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_sess FROM cskh_sessions WHERE id = p_session_id AND tenant_id = v_tenant;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  -- Scope check: OWN = only if assigned to me
  IF v_scope < 4 AND v_sess.agent_user_id IS DISTINCT FROM v_me.id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', m.id, 'role', m.role, 'content', m.content,
    'tool_calls', m.tool_calls,
    'agent_name', ag.full_name,
    'created_at', m.created_at
  ) ORDER BY m.created_at)
  INTO v_msgs
  FROM cskh_messages m
  LEFT JOIN app_users ag ON ag.id = m.agent_user_id
  WHERE m.session_id = p_session_id AND m.tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', v_sess.id, 'channel', v_sess.channel, 'source', v_sess.source,
      'status', v_sess.status, 'handoff_reason', v_sess.handoff_reason,
      'csat', v_sess.csat, 'is_test', v_sess.is_test,
      'ticket_id', v_sess.ticket_id, 'agent_user_id', v_sess.agent_user_id,
      'created_at', v_sess.created_at, 'updated_at', v_sess.updated_at
    ),
    'messages', COALESCE(v_msgs, '[]'::jsonb)
  );
END $$;

-- 7.5 Get published KB articles for bot (no auth needed — called by server)
CREATE OR REPLACE FUNCTION api_cskh_kb_published(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'id', d.id, 'title', d.title,
    'kind', d.data->>'kind', 'topic', d.data->>'topic',
    'body', d.data->>'body', 'version', d.data->>'version'
  ) ORDER BY d.data->>'topic', d.title)
  INTO v_rows
  FROM documents d
  WHERE d.tenant_id = p_tenant_id
    AND d.doc_type = 'KB_ARTICLE'
    AND d.status = 'PUBLISHED';

  RETURN jsonb_build_object('ok', true, 'articles', COALESCE(v_rows, '[]'::jsonb));
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 8. GRANT EXECUTE (same pattern as 006_security.sql)
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

-- ═══════════════════════════════════════════════════════════════
-- 9. SEED CS_AGENT and CS_MANAGER users for testing
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_branch uuid;
  v_dept   uuid;
  v_agent  uuid;
  v_mgr    uuid;
BEGIN
  SELECT id INTO v_branch FROM branches WHERE tenant_id = v_tenant LIMIT 1;
  SELECT id INTO v_dept FROM departments WHERE tenant_id = v_tenant LIMIT 1;

  -- CS Agent user
  v_agent := gen_random_uuid();
  INSERT INTO app_users (id, tenant_id, email, full_name, employee_code, branch_id, department_id)
  VALUES (v_agent, v_tenant, 'cs_agent@erp.demo', 'Nhân viên CSKH', 'CS-AGENT-01', v_branch, v_dept)
  ON CONFLICT (email) DO UPDATE SET full_name = excluded.full_name RETURNING id INTO v_agent;

  INSERT INTO user_roles (user_id, role_code) VALUES (v_agent, 'CS_AGENT')
  ON CONFLICT DO NOTHING;

  -- CS Manager user
  v_mgr := gen_random_uuid();
  INSERT INTO app_users (id, tenant_id, email, full_name, employee_code, branch_id, department_id)
  VALUES (v_mgr, v_tenant, 'cs_manager@erp.demo', 'Trưởng phòng CSKH', 'CS-MGR-01', v_branch, v_dept)
  ON CONFLICT (email) DO UPDATE SET full_name = excluded.full_name RETURNING id INTO v_mgr;

  INSERT INTO user_roles (user_id, role_code) VALUES (v_mgr, 'CS_MANAGER')
  ON CONFLICT DO NOTHING;
END $$;
