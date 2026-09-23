-- WP-G3: Duyệt đa cấp + SoD theo mức rủi ro + delegation
-- Bổ sung:
--   • approval_chains / approval_chain_steps / approval_chain_log — chuỗi duyệt đa bước
--   • delegations — uỷ quyền có hạn thời gian, chặn uỷ quyền cho người vi phạm SoD
--   • fn_doc_in_scope mở rộng — kiểm tra delegation khi scope=0 trên action APPROVE
--   • fn_check_condition mở rộng — thêm điều kiện 'chain_complete'
--   • api_approve_step, api_get_approval_status, api_create_delegation,
--     api_list_delegations, api_revoke_delegation
-- Không thay đổi T3.1–T3.4: SoD vẫn được enforce bởi fn_sod_enforce ở mọi transition.

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Cấu hình chuỗi duyệt: áp dụng cho doc_type khi amount nằm trong [min_amount, max_amount)
CREATE TABLE IF NOT EXISTS approval_chains (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  doc_type    text NOT NULL REFERENCES doc_types(code),
  min_amount  numeric NOT NULL DEFAULT 0,
  max_amount  numeric,            -- NULL = không có giới hạn trên
  label       text NOT NULL,
  status      text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at  timestamptz NOT NULL DEFAULT fn_now()
);

-- Các bước trong chuỗi duyệt (thứ tự tăng dần)
CREATE TABLE IF NOT EXISTS approval_chain_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  chain_id       uuid NOT NULL REFERENCES approval_chains(id),
  step_order     int  NOT NULL,
  required_role  text NOT NULL,   -- role_code trong roles phải có trong user_roles của người duyệt
  label          text NOT NULL,
  UNIQUE (chain_id, step_order)
);

-- Log duyệt từng bước — chỉ INSERT, không UPDATE/DELETE
CREATE TABLE IF NOT EXISTS approval_chain_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  chain_id    uuid NOT NULL REFERENCES approval_chains(id),
  step_id     uuid NOT NULL REFERENCES approval_chain_steps(id),
  step_order  int  NOT NULL,
  approved_by uuid NOT NULL REFERENCES app_users(id),
  approved_at timestamptz NOT NULL DEFAULT fn_now(),
  comment     text,
  UNIQUE (document_id, step_id)   -- mỗi bước chỉ được duyệt 1 lần
);

-- Uỷ quyền có hạn: delegator trao cho delegate quyền APPROVER trong khoảng thời gian
CREATE TABLE IF NOT EXISTS delegations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  delegator_id uuid NOT NULL REFERENCES app_users(id),
  delegate_id  uuid NOT NULL REFERENCES app_users(id),
  doc_types    text[] NOT NULL DEFAULT '{}',  -- rỗng = tất cả loại chứng từ
  sod_roles    text[] NOT NULL DEFAULT '{"APPROVER"}',
  valid_from   timestamptz NOT NULL DEFAULT fn_now(),
  valid_until  timestamptz NOT NULL,
  reason       text,
  status       text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  created_by   uuid NOT NULL REFERENCES app_users(id),
  created_at   timestamptz NOT NULL DEFAULT fn_now(),
  CONSTRAINT delegations_valid_period CHECK (valid_until > valid_from),
  CONSTRAINT delegations_no_self CHECK (delegator_id <> delegate_id)
);

-- ============================================================
-- 2. RLS + REVOKE (bảo mật đa tầng theo ĐK8)
-- ============================================================
ALTER TABLE approval_chains      ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_chain_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_chain_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegations          ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.approval_chains      FROM anon, authenticated;
REVOKE ALL ON public.approval_chain_steps FROM anon, authenticated;
REVOKE ALL ON public.approval_chain_log   FROM anon, authenticated;
REVOKE ALL ON public.delegations          FROM anon, authenticated;

DROP POLICY IF EXISTS read_tenant ON public.approval_chains;
DROP POLICY IF EXISTS read_tenant ON public.approval_chain_steps;
DROP POLICY IF EXISTS read_tenant ON public.approval_chain_log;
DROP POLICY IF EXISTS read_tenant ON public.delegations;

CREATE POLICY read_tenant ON public.approval_chains      FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());
CREATE POLICY read_tenant ON public.approval_chain_steps FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());
CREATE POLICY read_tenant ON public.approval_chain_log   FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());
CREATE POLICY read_tenant ON public.delegations          FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());

-- Ngăn xoá/sửa log duyệt (tính bất biến, tương tự audit_trail)
CREATE OR REPLACE FUNCTION fn_chain_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'approval_chain_log là bảng chỉ ghi — không được sửa hoặc xoá';
END $$;

DROP TRIGGER IF EXISTS trg_chain_log_immutable ON approval_chain_log;
CREATE TRIGGER trg_chain_log_immutable
  BEFORE UPDATE OR DELETE ON approval_chain_log
  FOR EACH ROW EXECUTE FUNCTION fn_chain_log_immutable();

-- ============================================================
-- 3. fn_doc_in_scope MỞ RỘNG — kiểm tra delegation khi scope = 0
-- ============================================================
CREATE OR REPLACE FUNCTION fn_doc_in_scope(
  p_user     uuid,
  p_doc      documents,
  p_resource text,
  p_action   text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s             int;
  u             app_users;
  v_delegator   uuid;
BEGIN
  s := fn_perm_scope(p_user, p_resource, p_action);

  IF s = 0 THEN
    -- Kiểm tra delegation khi không có permission trực tiếp (chỉ hỗ trợ action APPROVE)
    IF p_action = 'APPROVE' THEN
      SELECT d.delegator_id INTO v_delegator
      FROM delegations d
      WHERE d.tenant_id = fn_current_tenant()
        AND d.delegate_id = p_user
        AND d.status = 'ACTIVE'
        AND fn_now() BETWEEN d.valid_from AND d.valid_until
        AND ('APPROVER' = ANY(d.sod_roles))
        AND (d.doc_types = '{}' OR p_resource = ANY(d.doc_types))
      ORDER BY d.created_at DESC
      LIMIT 1;

      IF v_delegator IS NULL THEN RETURN false; END IF;

      -- Dùng scope và org-unit của delegator để kiểm tra phạm vi chứng từ
      s := fn_perm_scope(v_delegator, p_resource, p_action);
      IF s = 0 THEN RETURN false; END IF;
      SELECT * INTO u FROM app_users WHERE id = v_delegator;
      -- Tenant isolation
      IF u.tenant_id IS DISTINCT FROM p_doc.tenant_id THEN RETURN false; END IF;
      IF s >= 4 THEN RETURN true; END IF;
      IF s >= 3 AND (p_doc.branch_id = u.branch_id
          OR EXISTS (SELECT 1 FROM warehouses w
                     WHERE w.id = p_doc.to_warehouse_id AND w.branch_id = u.branch_id)) THEN
        RETURN true;
      END IF;
      IF s >= 2 AND (p_doc.department_id = u.department_id
          OR p_doc.cost_center_id = u.department_id) THEN
        RETURN true;
      END IF;
      IF p_doc.created_by = v_delegator OR p_doc.owner_id = v_delegator THEN RETURN true; END IF;
      RETURN false;
    END IF;
    RETURN false;
  END IF;

  -- Has direct permission (s > 0)
  SELECT * INTO u FROM app_users WHERE id = p_user;
  -- Tenant isolation: document must belong to the same tenant as the requesting user
  IF u.tenant_id IS DISTINCT FROM p_doc.tenant_id THEN RETURN false; END IF;
  IF s >= 4 THEN RETURN true; END IF;
  IF s >= 3 AND (p_doc.branch_id = u.branch_id
      OR EXISTS (SELECT 1 FROM warehouses w
                 WHERE w.id = p_doc.to_warehouse_id AND w.branch_id = u.branch_id)) THEN
    RETURN true;
  END IF;
  IF s >= 2 AND (p_doc.department_id = u.department_id
      OR p_doc.cost_center_id = u.department_id) THEN
    RETURN true;
  END IF;
  IF p_doc.created_by = p_user OR p_doc.owner_id = p_user THEN RETURN true; END IF;
  -- OWN: chứng từ con của chứng từ mình tạo
  RETURN EXISTS (
    WITH RECURSIVE anc(id, depth) AS (
      SELECT l.parent_id, 1 FROM document_links l
      WHERE l.child_id = p_doc.id AND l.link_type = 'SOURCE'
      UNION ALL
      SELECT l.parent_id, a.depth + 1 FROM document_links l
      JOIN anc a ON l.child_id = a.id
      WHERE a.depth < 4 AND l.link_type = 'SOURCE'
    )
    SELECT 1 FROM anc JOIN documents d ON d.id = anc.id WHERE d.created_by = p_user
  );
END $$;

-- ============================================================
-- 4. fn_check_condition MỞ RỘNG — thêm điều kiện 'chain_complete'
-- ============================================================
CREATE OR REPLACE FUNCTION fn_check_condition(
  p_doc     documents,
  p_cond    text,
  p_payload jsonb
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_d     numeric;
  v_c     numeric;
  v_b     documents;
  v_rem   numeric;
  v_err   text;
  v_chain approval_chains;
  v_steps approval_chain_steps[];
  v_step  approval_chain_steps;
  v_pending_labels text[];
BEGIN
  CASE p_cond
  WHEN 'has_lines' THEN
    IF NOT EXISTS (SELECT 1 FROM document_lines WHERE document_id = p_doc.id) THEN
      RETURN 'Chứng từ chưa có dòng chi tiết';
    END IF;
  WHEN 'amount_positive' THEN
    IF coalesce(p_doc.amount, 0) <= 0 THEN RETURN 'Số tiền phải lớn hơn 0'; END IF;
  WHEN 'balanced' THEN
    SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      INTO v_d, v_c FROM document_lines WHERE document_id = p_doc.id;
    IF v_d <> v_c OR v_d = 0 THEN
      RETURN format('Bút toán không cân: Tổng Nợ %s ≠ Tổng Có %s', fn_money(v_d), fn_money(v_c));
    END IF;
  WHEN 'budget_available' THEN
    IF p_doc.cost_center_id IS NOT NULL THEN
      v_b := fn_active_budget(p_doc.cost_center_id, extract(year FROM p_doc.doc_date)::int);
      IF v_b.id IS NOT NULL THEN
        v_rem := fn_budget_remaining(v_b.id);
        IF p_doc.amount > v_rem THEN
          RETURN format('Vượt ngân sách %s: còn lại %s, chứng từ cần %s',
                        v_b.number, fn_money(v_rem), fn_money(p_doc.amount));
        END IF;
      END IF;
    END IF;
  WHEN 'stock_available' THEN
    IF p_doc.doc_type = 'SO' AND coalesce((p_payload->>'allow_backorder')::boolean, false) THEN
      RETURN NULL;
    END IF;
    RETURN fn_check_stock(p_doc);
  WHEN 'period_open' THEN
    RETURN fn_period_error((fn_now())::date, false);
  WHEN 'period_open_jv' THEN
    RETURN fn_period_error(p_doc.doc_date, true);
  WHEN 'exception_approved' THEN
    IF NOT EXISTS (
      SELECT 1 FROM document_links l JOIN documents e ON e.id = l.child_id
      WHERE l.parent_id = p_doc.id AND l.link_type = 'EXCEPTION'
        AND e.status IN ('APPROVED','RESOLVED','CLOSED')
    ) THEN
      RETURN 'Cần ngoại lệ (EXC) được phê duyệt trước khi giải tỏa';
    END IF;
  WHEN 'resolution_provided' THEN
    IF coalesce(nullif(trim(p_payload->>'resolution'), ''),
                nullif(trim(p_doc.data->>'resolution'), '')) IS NULL THEN
      RETURN 'Cần nhập nội dung xử lý (resolution)';
    END IF;
  WHEN 'all_matched' THEN
    IF NOT coalesce((p_payload->>'accept_unmatched')::boolean, false) AND EXISTS (
      SELECT 1 FROM document_lines
      WHERE document_id = p_doc.id AND (data->>'matched_document_id') IS NULL
    ) THEN
      RETURN 'Còn giao dịch sao kê chưa khớp';
    END IF;
  WHEN 'chain_complete' THEN
    -- Tìm chain áp dụng cho doc_type + amount của chứng từ này
    SELECT * INTO v_chain
    FROM approval_chains
    WHERE tenant_id = fn_current_tenant()
      AND doc_type = p_doc.doc_type
      AND status = 'ACTIVE'
      AND min_amount <= coalesce(p_doc.amount, 0)
      AND (max_amount IS NULL OR coalesce(p_doc.amount, 0) < max_amount)
    ORDER BY min_amount DESC
    LIMIT 1;

    -- Không có chain → điều kiện luôn pass (chứng từ không yêu cầu duyệt đa bước)
    IF v_chain.id IS NULL THEN RETURN NULL; END IF;

    -- Kiểm tra từng bước của chain
    v_pending_labels := '{}';
    FOR v_step IN
      SELECT * FROM approval_chain_steps
      WHERE chain_id = v_chain.id
      ORDER BY step_order
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM approval_chain_log
        WHERE document_id = p_doc.id AND step_id = v_step.id
      ) THEN
        v_pending_labels := v_pending_labels || v_step.label;
      END IF;
    END LOOP;

    IF cardinality(v_pending_labels) > 0 THEN
      RETURN format('Chuỗi duyệt chưa hoàn tất — còn chờ: %s',
                    array_to_string(v_pending_labels, ', '));
    END IF;
  ELSE
    RETURN format('Điều kiện không xác định: %s', p_cond);
  END CASE;
  RETURN NULL;
END $$;

-- ============================================================
-- 5. API FUNCTIONS
-- ============================================================

-- 5a. api_approve_step — người dùng duyệt một bước trong chuỗi duyệt
CREATE OR REPLACE FUNCTION api_approve_step(
  p_doc_id  uuid,
  p_step_id uuid,
  p_comment text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    app_users;
  v_doc   documents;
  v_step  approval_chain_steps;
  v_chain approval_chains;
  v_tid   uuid;
BEGIN
  v_me := fn_current_user();
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHORIZED', 'Cần đăng nhập'); END IF;
  v_tid := fn_current_tenant();

  SELECT * INTO v_doc FROM documents WHERE id = p_doc_id AND tenant_id = v_tid;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ'); END IF;

  SELECT * INTO v_step FROM approval_chain_steps
  WHERE id = p_step_id AND tenant_id = v_tid;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy bước duyệt'); END IF;

  SELECT * INTO v_chain FROM approval_chains
  WHERE id = v_step.chain_id AND tenant_id = v_tid
    AND doc_type = v_doc.doc_type AND status = 'ACTIVE'
    AND min_amount <= coalesce(v_doc.amount, 0)
    AND (max_amount IS NULL OR coalesce(v_doc.amount, 0) < max_amount);
  IF NOT FOUND THEN
    RETURN fn_fail('INVALID', 'Bước duyệt này không áp dụng cho chứng từ hiện tại');
  END IF;

  -- Kiểm tra người dùng có vai trò yêu cầu không
  IF NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code = v_step.required_role
  ) THEN
    RETURN fn_fail('FORBIDDEN',
      format('Bước này yêu cầu vai trò %s — bạn không có vai trò này', v_step.required_role));
  END IF;

  -- ĐK3: người duyệt bước không được là người tạo/đề xuất chứng từ (SoD cơ bản)
  IF EXISTS (
    SELECT 1 FROM document_actions
    WHERE document_id = p_doc_id AND user_id = v_me.id AND sod_role = 'REQUESTER'
  ) THEN
    RETURN fn_fail('SOD_VIOLATION',
      'Vi phạm SoD: người đề xuất chứng từ không thể duyệt bước trong chuỗi duyệt');
  END IF;

  -- Ngăn duyệt bước đã duyệt rồi
  IF EXISTS (
    SELECT 1 FROM approval_chain_log WHERE document_id = p_doc_id AND step_id = p_step_id
  ) THEN
    RETURN fn_fail('ALREADY_DONE', format('Bước "%s" đã được duyệt', v_step.label));
  END IF;

  INSERT INTO approval_chain_log (tenant_id, document_id, chain_id, step_id, step_order,
                                   approved_by, comment)
  VALUES (v_tid, p_doc_id, v_chain.id, p_step_id, v_step.step_order, v_me.id, p_comment);

  RETURN jsonb_build_object('ok', true, 'step', v_step.label,
                             'step_order', v_step.step_order, 'approved_by', v_me.full_name);
END $$;

-- 5b. api_get_approval_status — trạng thái chuỗi duyệt của một chứng từ
CREATE OR REPLACE FUNCTION api_get_approval_status(p_doc_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    app_users;
  v_doc   documents;
  v_chain approval_chains;
  v_steps jsonb := '[]';
  v_step  record;
  v_tid   uuid;
BEGIN
  v_me := fn_current_user();
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHORIZED', 'Cần đăng nhập'); END IF;
  v_tid := fn_current_tenant();

  SELECT * INTO v_doc FROM documents WHERE id = p_doc_id AND tenant_id = v_tid;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ'); END IF;

  SELECT * INTO v_chain
  FROM approval_chains
  WHERE tenant_id = v_tid AND doc_type = v_doc.doc_type AND status = 'ACTIVE'
    AND min_amount <= coalesce(v_doc.amount, 0)
    AND (max_amount IS NULL OR coalesce(v_doc.amount, 0) < max_amount)
  ORDER BY min_amount DESC
  LIMIT 1;

  IF v_chain.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'chain_required', false,
                               'chain', null, 'steps', '[]'::jsonb);
  END IF;

  FOR v_step IN
    SELECT s.id, s.step_order, s.required_role, s.label,
           l.approved_by, l.approved_at,
           u.full_name AS approved_by_name
    FROM approval_chain_steps s
    LEFT JOIN approval_chain_log l ON l.step_id = s.id AND l.document_id = p_doc_id
    LEFT JOIN app_users u ON u.id = l.approved_by
    WHERE s.chain_id = v_chain.id
    ORDER BY s.step_order
  LOOP
    v_steps := v_steps || jsonb_build_object(
      'step_id', v_step.id,
      'step_order', v_step.step_order,
      'required_role', v_step.required_role,
      'label', v_step.label,
      'done', v_step.approved_by IS NOT NULL,
      'approved_by', v_step.approved_by_name,
      'approved_at', v_step.approved_at
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'chain_required', true,
    'chain', jsonb_build_object('id', v_chain.id, 'label', v_chain.label,
                                 'min_amount', v_chain.min_amount,
                                 'max_amount', v_chain.max_amount),
    'steps', v_steps
  );
END $$;

-- 5c. api_create_delegation — tạo uỷ quyền; chặn nếu vi phạm SoD
CREATE OR REPLACE FUNCTION api_create_delegation(
  p_delegate_id  uuid,
  p_doc_types    text[]   DEFAULT '{}',
  p_sod_roles    text[]   DEFAULT '{"APPROVER"}',
  p_valid_from   timestamptz DEFAULT NULL,
  p_valid_until  timestamptz DEFAULT NULL,
  p_reason       text     DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me          app_users;
  v_delegate    app_users;
  v_tid         uuid;
  v_dt          text;
  v_create_role text;
  v_del_id      uuid;
  v_from        timestamptz;
  v_until       timestamptz;
BEGIN
  v_me := fn_current_user();
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHORIZED', 'Cần đăng nhập'); END IF;
  v_tid := fn_current_tenant();

  SELECT * INTO v_delegate FROM app_users WHERE id = p_delegate_id AND tenant_id = v_tid;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy người nhận uỷ quyền'); END IF;

  IF v_me.id = p_delegate_id THEN
    RETURN fn_fail('INVALID', 'Không thể uỷ quyền cho chính mình');
  END IF;

  v_from  := coalesce(p_valid_from, fn_now());
  v_until := coalesce(p_valid_until, fn_now() + interval '7 days');

  IF v_until <= v_from THEN
    RETURN fn_fail('INVALID', 'Thời hạn uỷ quyền không hợp lệ (valid_until phải sau valid_from)');
  END IF;

  -- ĐK3: kiểm tra SoD tại thời điểm tạo uỷ quyền
  -- Nếu delegate có CREATE permission trên doc_type D (→ sẽ là REQUESTER),
  -- và uỷ quyền trao vai trò APPROVER → REQUESTER ↔ APPROVER = HARD conflict
  IF 'APPROVER' = ANY(p_sod_roles) THEN
    FOREACH v_dt IN ARRAY (
      CASE WHEN cardinality(p_doc_types) = 0 THEN
        ARRAY(SELECT code FROM doc_types)
      ELSE p_doc_types END
    ) LOOP
      SELECT create_sod_role INTO v_create_role FROM doc_types WHERE code = v_dt;
      IF v_create_role = 'REQUESTER' THEN
        -- Nếu delegate có CREATE trên v_dt → SoD violation
        IF fn_perm_scope(p_delegate_id, v_dt, 'CREATE') > 0 THEN
          RETURN fn_fail('SOD_VIOLATION',
            format('Vi phạm SoD: %s có quyền TẠO %s (vai trò REQUESTER) nên không thể nhận uỷ quyền APPROVER cho cùng loại chứng từ này.',
                   v_delegate.full_name, v_dt));
        END IF;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO delegations (tenant_id, delegator_id, delegate_id, doc_types, sod_roles,
                            valid_from, valid_until, reason, created_by)
  VALUES (v_tid, v_me.id, p_delegate_id, coalesce(p_doc_types, '{}'),
          coalesce(p_sod_roles, '{"APPROVER"}'), v_from, v_until, p_reason, v_me.id)
  RETURNING id INTO v_del_id;

  RETURN jsonb_build_object('ok', true, 'delegation_id', v_del_id,
                             'delegator', v_me.full_name, 'delegate', v_delegate.full_name,
                             'valid_from', v_from, 'valid_until', v_until);
END $$;

-- 5d. api_list_delegations — liệt kê uỷ quyền liên quan đến người dùng hiện tại
CREATE OR REPLACE FUNCTION api_list_delegations() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users;
  v_tid uuid;
  v_res jsonb := '[]';
  r     record;
BEGIN
  v_me := fn_current_user();
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHORIZED', 'Cần đăng nhập'); END IF;
  v_tid := fn_current_tenant();

  FOR r IN
    SELECT d.id, d.doc_types, d.sod_roles, d.valid_from, d.valid_until,
           d.reason, d.status,
           du.full_name AS delegator_name,
           de.full_name AS delegate_name,
           fn_now() BETWEEN d.valid_from AND d.valid_until AND d.status = 'ACTIVE' AS is_active_now
    FROM delegations d
    JOIN app_users du ON du.id = d.delegator_id
    JOIN app_users de ON de.id = d.delegate_id
    WHERE d.tenant_id = v_tid
      AND (d.delegator_id = v_me.id OR d.delegate_id = v_me.id)
    ORDER BY d.created_at DESC
  LOOP
    v_res := v_res || jsonb_build_object(
      'id', r.id, 'delegator', r.delegator_name, 'delegate', r.delegate_name,
      'doc_types', r.doc_types, 'sod_roles', r.sod_roles,
      'valid_from', r.valid_from, 'valid_until', r.valid_until,
      'reason', r.reason, 'status', r.status, 'is_active_now', r.is_active_now
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'delegations', v_res);
END $$;

-- 5e. api_revoke_delegation — thu hồi uỷ quyền (chỉ delegator hoặc SYS_ADMIN)
CREATE OR REPLACE FUNCTION api_revoke_delegation(p_delegation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users;
  v_del delegations;
  v_tid uuid;
BEGIN
  v_me := fn_current_user();
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHORIZED', 'Cần đăng nhập'); END IF;
  v_tid := fn_current_tenant();

  SELECT * INTO v_del FROM delegations WHERE id = p_delegation_id AND tenant_id = v_tid;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy uỷ quyền'); END IF;

  IF v_del.status = 'REVOKED' THEN
    RETURN fn_fail('ALREADY_DONE', 'Uỷ quyền đã được thu hồi trước đó');
  END IF;

  -- Chỉ delegator hoặc SYS_ADMIN mới được thu hồi
  IF v_del.delegator_id <> v_me.id AND NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code = 'SYS_ADMIN'
  ) THEN
    RETURN fn_fail('FORBIDDEN', 'Chỉ người uỷ quyền hoặc quản trị viên mới được thu hồi');
  END IF;

  UPDATE delegations SET status = 'REVOKED' WHERE id = p_delegation_id;

  RETURN jsonb_build_object('ok', true, 'delegation_id', p_delegation_id, 'status', 'REVOKED');
END $$;

-- ============================================================
-- 6. GRANTS
-- ============================================================
REVOKE ALL ON FUNCTION api_approve_step(uuid, uuid, text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION api_get_approval_status(uuid)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION api_create_delegation(uuid, text[], text[], timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_list_delegations()                         FROM PUBLIC;
REVOKE ALL ON FUNCTION api_revoke_delegation(uuid)                    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api_approve_step(uuid, uuid, text)            TO authenticated;
GRANT EXECUTE ON FUNCTION api_get_approval_status(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION api_create_delegation(uuid, text[], text[], timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION api_list_delegations()                         TO authenticated;
GRANT EXECUTE ON FUNCTION api_revoke_delegation(uuid)                    TO authenticated;

-- ============================================================
-- 7. DỮ LIỆU CẤU HÌNH
-- ============================================================
DO $$
DECLARE
  v_tid  constant uuid := '00000000-0000-0000-0000-000000000001';
  v_chain_id uuid;
  v_s1   uuid;
  v_s2   uuid;
BEGIN
  -- 7a. Chuỗi duyệt PO giá trị cao (≥ 50,000,000 VNĐ):
  --     Bước 1 — PROC_MANAGER phê duyệt trước
  --     Bước 2 — CFO xác nhận tài chính
  INSERT INTO approval_chains (id, tenant_id, doc_type, min_amount, max_amount, label)
  VALUES (gen_random_uuid(), v_tid, 'PO', 50000000, NULL, 'PO giá trị cao (≥ 50 triệu)')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_chain_id;

  IF v_chain_id IS NOT NULL THEN
    INSERT INTO approval_chain_steps (tenant_id, chain_id, step_order, required_role, label)
    VALUES
      (v_tid, v_chain_id, 1, 'PROC_MANAGER', 'Trưởng bộ phận mua hàng xác nhận'),
      (v_tid, v_chain_id, 2, 'CFO',          'Giám đốc tài chính phê duyệt');
  END IF;

  -- 7b. Thêm điều kiện chain_complete vào transition approve của PO
  --     (chỉ thêm một lần; idempotent)
  UPDATE state_transitions
  SET conditions = array_append(conditions, 'chain_complete')
  WHERE doc_type = 'PO'
    AND action = 'approve'
    AND NOT ('chain_complete' = ANY(conditions));

END $$;

-- ============================================================
-- 8. ACCEPTANCE CRITERIA WP-G3 (T18.1–T18.5)
-- ============================================================
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker)
VALUES
  ('T18.1', 'N2_CONTROLS',     'api_create_delegation: chặn uỷ quyền APPROVER cho người có CREATE trên cùng doc_type (SoD)', 'L3', false),
  ('T18.2', 'N2_CONTROLS',     'api_create_delegation: cho phép uỷ quyền hợp lệ (delegate không có CREATE trên doc_type)', 'L3', false),
  ('T18.3', 'N2_CONTROLS',     'Người nhận uỷ quyền (delegate) có thể phê duyệt chứng từ trong phạm vi delegator', 'L3', false),
  ('T18.4', 'N2_CONTROLS',     'PO ≥ 50 triệu: chain_complete chặn approve cho đến khi tất cả bước hoàn tất', 'L3', false),
  ('T18.5', 'N3_TRACEABILITY', 'Delegation không bypass SoD: người đề xuất PO không thể nhận uỷ quyền APPROVER', 'L3', false)
ON CONFLICT (test_code) DO NOTHING;
