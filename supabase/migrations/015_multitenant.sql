-- ERP General — 015 Multi-tenant isolation (WP-D1)
-- Single-database multi-tenancy: tenants table + tenant_id on every business table.
-- fn_current_tenant() reads from app_users.tenant_id (fallback: JWT claim 'tenant_id').
-- RLS: SELECT-accessible tables filtered to tenant_id = fn_current_tenant().
-- api_* SECURITY DEFINER functions filter explicitly via fn_doc_in_scope + per-query WHERE.
-- Strategy: ADD COLUMN ... NOT NULL DEFAULT (const) avoids table rewrite and trigger fires.
--           Drop DEFAULT after migration so new INSERTs must be explicit.

-- ============================================================
-- 0. fn_current_tenant() — must be defined BEFORE policies that reference it.
--    app_users.tenant_id does not exist yet; the body is not validated at creation time.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_current_tenant() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tid uuid;
BEGIN
  BEGIN
    v_tid := nullif(current_setting('request.jwt.claim.tenant_id', true), '')::uuid;
  EXCEPTION WHEN others THEN NULL;
  END;
  IF v_tid IS NOT NULL THEN RETURN v_tid; END IF;
  SELECT tenant_id INTO v_tid FROM app_users WHERE id = auth.uid() AND status = 'ACTIVE';
  RETURN v_tid;
END $$;

GRANT EXECUTE ON FUNCTION fn_current_tenant() TO authenticated;

-- ============================================================
-- 1. TENANTS TABLE
-- ============================================================
CREATE TABLE tenants (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        UNIQUE NOT NULL,
  name       text        NOT NULL,
  plan       text        NOT NULL DEFAULT 'STARTER'
                         CHECK (plan IN ('STARTER','PROFESSIONAL','ENTERPRISE')),
  status     text        NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE','SUSPENDED','CANCELLED')),
  settings   jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tenants IS 'SaaS tenant registry — WP-D1';

-- Enable RLS + revoke (consistent with 006_security.sql pattern)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenants FROM anon, authenticated;
GRANT SELECT ON public.tenants TO authenticated;
CREATE POLICY read_own_tenant ON public.tenants FOR SELECT TO authenticated
  USING (id = fn_current_tenant());

-- ============================================================
-- 2. DEFAULT TENANT (all pre-existing data migrated here)
-- ============================================================
INSERT INTO tenants (id, code, name, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'DEFAULT', 'Default Tenant', 'PROFESSIONAL', 'ACTIVE');

-- ============================================================
-- 3. ADD tenant_id TO BUSINESS TABLES
-- Using NOT NULL DEFAULT constant avoids table rewrite and does NOT fire row triggers.
-- ============================================================
DO $$
DECLARE
  def_tid constant uuid := '00000000-0000-0000-0000-000000000001';
  stmt text;
BEGIN
  -- Business master data
  FOREACH stmt IN ARRAY ARRAY[
    'branches','departments','app_users','partners','products',
    'warehouses','boms','employees','handoff_records','notifications',
    'budget_usage','ownership_matrix','shadow_it_register','email_outbox'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)',
      stmt, def_tid
    );
  END LOOP;

  -- Ledgers/audit — nullable to avoid breaking system operations without auth context
  FOREACH stmt IN ARRAY ARRAY['gl_entries','stock_moves','audit_trail','sod_check_log'] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid DEFAULT %L',
      stmt, def_tid
    );
  END LOOP;

  -- Documents (the core entity)
  EXECUTE format(
    'ALTER TABLE documents ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)',
    def_tid
  );

  -- Sequences: need tenant isolation for unique number per tenant
  EXECUTE format(
    'ALTER TABLE doc_sequences ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L',
    def_tid
  );

  -- fiscal_periods: needs tenant_id before PK can change
  EXECUTE format(
    'ALTER TABLE fiscal_periods ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L',
    def_tid
  );

  -- WP-J4 shipment tables (IF EXISTS — created by 011_shipment.sql)
  FOREACH stmt IN ARRAY ARRAY['containers','shipment_charges','tracking_events'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = stmt) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)',
        stmt, def_tid
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 4. FIX doc_sequences PRIMARY KEY (prefix, yyyymm) → (tenant_id, prefix, yyyymm)
-- ============================================================
ALTER TABLE doc_sequences DROP CONSTRAINT IF EXISTS doc_sequences_pkey;
ALTER TABLE doc_sequences ADD PRIMARY KEY (tenant_id, prefix, yyyymm);

-- ============================================================
-- 5. FIX fiscal_periods PRIMARY KEY: (period) → (tenant_id, period)
-- Drop the FK from gl_entries.period first (period is no longer unique alone).
-- ============================================================
ALTER TABLE gl_entries DROP CONSTRAINT IF EXISTS gl_entries_period_fkey;
ALTER TABLE fiscal_periods DROP CONSTRAINT IF EXISTS fiscal_periods_pkey;
ALTER TABLE fiscal_periods ADD PRIMARY KEY (tenant_id, period);

-- ============================================================
-- 6. DROP DEFAULT on columns where INSERT must be explicit
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','departments','app_users','partners','products','warehouses',
    'boms','employees','handoff_records','notifications','budget_usage',
    'ownership_matrix','shadow_it_register','email_outbox',
    'documents','fiscal_periods'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id DROP DEFAULT', t);
  END LOOP;
  -- doc_sequences: also no default (fn_next_number sets it from fn_current_tenant)
  ALTER TABLE doc_sequences ALTER COLUMN tenant_id DROP DEFAULT;
  -- stock_moves: set by fn_stock_in / fn_stock_out via document context; no auto-default
  ALTER TABLE stock_moves ALTER COLUMN tenant_id DROP DEFAULT;
  -- WP-J4 tables
  FOREACH t IN ARRAY ARRAY['containers','shipment_charges','tracking_events'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id DROP DEFAULT', t);
    END IF;
  END LOOP;
  -- audit_trail + sod_check_log + gl_entries: KEEP default as safety net for system ops
END $$;

-- ============================================================
-- 7. INDEXES on tenant_id for query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_branches_tid          ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tid        ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_tid          ON app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_partners_tid           ON partners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tid           ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_tid         ON warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tid          ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gl_entries_tid         ON gl_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_tid        ON stock_moves(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_tid        ON audit_trail(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sod_check_log_tid      ON sod_check_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tid      ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_handoff_records_tid    ON handoff_records(tenant_id);

-- ============================================================
-- 8. fn_current_tenant() — derive tenant from app_users or JWT claim
-- ============================================================
CREATE OR REPLACE FUNCTION fn_current_tenant() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tid uuid;
BEGIN
  -- Optional JWT custom claim 'tenant_id' for future auth-level multi-tenancy
  BEGIN
    v_tid := nullif(current_setting('request.jwt.claim.tenant_id', true), '')::uuid;
  EXCEPTION WHEN others THEN NULL;
  END;
  IF v_tid IS NOT NULL THEN RETURN v_tid; END IF;
  -- Primary path: read from app_users
  SELECT tenant_id INTO v_tid FROM app_users WHERE id = auth.uid() AND status = 'ACTIVE';
  RETURN v_tid;
END $$;

GRANT EXECUTE ON FUNCTION fn_current_tenant() TO authenticated;

-- ============================================================
-- 9. UPDATE fn_doc_in_scope — reject documents from other tenants
-- ============================================================
CREATE OR REPLACE FUNCTION fn_doc_in_scope(p_user uuid, p_doc documents, p_resource text, p_action text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s int; u app_users;
BEGIN
  s := fn_perm_scope(p_user, p_resource, p_action);
  IF s = 0 THEN RETURN false; END IF;
  SELECT * INTO u FROM app_users WHERE id = p_user;
  -- Tenant isolation: document must belong to the same tenant as the requesting user
  IF u.tenant_id IS DISTINCT FROM p_doc.tenant_id THEN RETURN false; END IF;
  IF s >= 4 THEN RETURN true; END IF;
  IF s >= 3 AND (p_doc.branch_id = u.branch_id
      OR EXISTS (SELECT 1 FROM warehouses w WHERE w.id = p_doc.to_warehouse_id AND w.branch_id = u.branch_id)) THEN
    RETURN true;
  END IF;
  IF s >= 2 AND (p_doc.department_id = u.department_id OR p_doc.cost_center_id = u.department_id) THEN
    RETURN true;
  END IF;
  IF p_doc.created_by = p_user OR p_doc.owner_id = p_user THEN RETURN true; END IF;
  RETURN EXISTS (
    WITH RECURSIVE anc(id, depth) AS (
      SELECT l.parent_id, 1 FROM document_links l WHERE l.child_id = p_doc.id AND l.link_type = 'SOURCE'
      UNION ALL
      SELECT l.parent_id, a.depth + 1 FROM document_links l JOIN anc a ON l.child_id = a.id
      WHERE a.depth < 4 AND l.link_type = 'SOURCE'
    )
    SELECT 1 FROM anc JOIN documents d ON d.id = anc.id WHERE d.created_by = p_user
  );
END $$;

-- ============================================================
-- 10. UPDATE fn_next_number — per-tenant document sequences
-- ============================================================
CREATE OR REPLACE FUNCTION fn_next_number(p_doc_type text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text;
  v_ym     text := to_char(fn_now(), 'YYYYMM');
  v_seq    int;
  v_tid    uuid := coalesce(fn_current_tenant(), '00000000-0000-0000-0000-000000000001'::uuid);
BEGIN
  SELECT prefix INTO v_prefix FROM doc_types WHERE code = p_doc_type;
  INSERT INTO doc_sequences (tenant_id, prefix, yyyymm, last_seq)
    VALUES (v_tid, v_prefix, v_ym, 1)
    ON CONFLICT (tenant_id, prefix, yyyymm) DO UPDATE SET last_seq = doc_sequences.last_seq + 1
    RETURNING last_seq INTO v_seq;
  RETURN v_prefix || '-' || v_ym || '-' || lpad(v_seq::text, 5, '0');
END $$;

-- ============================================================
-- 11. UPDATE fn_audit_row — stamp tenant_id on every audit entry
-- ============================================================
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text;
  v_old jsonb; v_new jsonb; v_rec jsonb;
  v_changed text[];
  v_id text;
  v_tid uuid;
BEGIN
  SELECT full_name, tenant_id INTO v_name, v_tid FROM app_users WHERE id = v_user;
  IF TG_OP IN ('UPDATE','DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_new := to_jsonb(NEW); END IF;
  v_rec := coalesce(v_new, v_old);
  v_id := coalesce(v_rec->>'id', v_rec->>'code', v_rec->>'period', v_rec->>'test_code',
                   (v_rec->>'user_id') || ':' || (v_rec->>'role_code'));
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k) INTO v_changed
    FROM jsonb_object_keys(v_new) k
    WHERE v_new->k IS DISTINCT FROM v_old->k AND k NOT IN ('updated_at','version');
    IF v_changed IS NULL THEN RETURN NEW; END IF;
    SELECT jsonb_object_agg(k, v_old->k) INTO v_old FROM unnest(v_changed) k;
    SELECT jsonb_object_agg(k, v_new->k) INTO v_new FROM unnest(v_changed) k;
  END IF;
  INSERT INTO audit_trail (table_name, record_id, action, old_value, new_value, changed_fields, user_id, user_name, tenant_id)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_old, v_new, v_changed, v_user, coalesce(v_name, 'SYSTEM'), v_tid);
  RETURN coalesce(NEW, OLD);
END $$;

-- ============================================================
-- 12. UPDATE fn_insert_document — internal doc creation includes tenant_id
-- ============================================================
CREATE OR REPLACE FUNCTION fn_insert_document(p_type text, p_user uuid, p_title text, p_data jsonb,
                                              p_parent uuid, p_link_type text, p_amount numeric DEFAULT 0,
                                              p_cost_center uuid DEFAULT NULL) RETURNS documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u app_users; dt doc_types; d documents;
BEGIN
  SELECT * INTO u FROM app_users WHERE id = p_user;
  SELECT * INTO dt FROM doc_types WHERE code = p_type;
  INSERT INTO documents (doc_type, number, status, title, branch_id, department_id, cost_center_id,
                         amount, data, created_by, tenant_id)
  VALUES (p_type, fn_next_number(p_type), dt.initial_status, p_title, u.branch_id, u.department_id,
          coalesce(p_cost_center, u.department_id), coalesce(p_amount, 0), coalesce(p_data, '{}'),
          p_user, u.tenant_id)
  RETURNING * INTO d;
  IF p_parent IS NOT NULL THEN
    INSERT INTO document_links (parent_id, child_id, link_type) VALUES (p_parent, d.id, p_link_type);
  END IF;
  PERFORM fn_record_action(d.id, 'create', NULL, d.status, p_user, dt.create_sod_role, 'Tạo tự động bởi hệ thống');
  PERFORM fn_after_status_change(d, p_user);
  RETURN d;
END $$;

-- ============================================================
-- 13. UPDATE fn_gl — stamp tenant_id on every GL entry
-- ============================================================
CREATE OR REPLACE FUNCTION fn_gl(p_doc documents, p_date date, p_account text, p_debit numeric, p_credit numeric,
                                 p_partner uuid, p_desc text, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_err text;
BEGIN
  IF round(coalesce(p_debit, 0), 2) = 0 AND round(coalesce(p_credit, 0), 2) = 0 THEN RETURN; END IF;
  v_err := fn_period_error(p_date, true);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err; END IF;
  INSERT INTO gl_entries (document_id, posting_date, period, account_code, debit, credit, partner_id,
                          branch_id, department_id, description, created_by, tenant_id)
  VALUES (p_doc.id, p_date, to_char(p_date, 'YYYY-MM'), p_account, round(coalesce(p_debit, 0), 2),
          round(coalesce(p_credit, 0), 2), p_partner, p_doc.branch_id,
          coalesce(p_doc.cost_center_id, p_doc.department_id), coalesce(p_desc, p_doc.number),
          p_user, p_doc.tenant_id);
END $$;

-- ============================================================
-- 14. UPDATE fn_period_error — tenant-aware fiscal period check
-- ============================================================
CREATE OR REPLACE FUNCTION fn_period_error(p_date date, p_allow_soft boolean) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_period text := to_char(p_date, 'YYYY-MM');
  v_tid    uuid := coalesce(fn_current_tenant(), '00000000-0000-0000-0000-000000000001'::uuid);
BEGIN
  SELECT status INTO v_status FROM fiscal_periods WHERE tenant_id = v_tid AND period = v_period;
  IF NOT FOUND THEN RETURN format('Kỳ kế toán %s chưa được khai báo', v_period); END IF;
  IF v_status = 'HARD_CLOSE' THEN
    RETURN format('Kỳ %s đã khóa sổ (HARD_CLOSE) — không thể ghi sổ', v_period);
  END IF;
  IF v_status = 'SOFT_CLOSE' AND NOT p_allow_soft THEN
    RETURN format('Kỳ %s đang khóa sơ bộ (SOFT_CLOSE) — chỉ cho phép bút toán điều chỉnh (JV)', v_period);
  END IF;
  RETURN NULL;
END $$;

-- ============================================================
-- 15. UPDATE fn_stock_in / fn_stock_out — stamp tenant_id on stock moves
-- ============================================================
CREATE OR REPLACE FUNCTION fn_stock_in(p_doc uuid, p_line uuid, p_product uuid, p_wh uuid, p_qty numeric,
                                       p_cost numeric, p_type text, p_source uuid, p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_tid uuid;
BEGIN
  IF p_qty <= 0 THEN RAISE EXCEPTION 'Số lượng nhập kho phải > 0'; END IF;
  SELECT tenant_id INTO v_tid FROM documents WHERE id = p_doc;
  INSERT INTO stock_moves (document_id, line_id, product_id, warehouse_id, move_type, qty, unit_cost,
                           remaining_qty, source_move_id, created_by, tenant_id)
  VALUES (p_doc, p_line, p_product, p_wh, p_type, p_qty, round(coalesce(p_cost, 0), 2), p_qty, p_source,
          p_user, v_tid)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION fn_stock_out(p_doc uuid, p_line uuid, p_product uuid, p_wh uuid, p_qty numeric,
                                        p_type text, p_user uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_need numeric := p_qty; v_take numeric; v_cost numeric := 0; lot record; v_name text; v_tid uuid;
BEGIN
  IF p_qty <= 0 THEN RETURN 0; END IF;
  SELECT tenant_id INTO v_tid FROM documents WHERE id = p_doc;
  FOR lot IN
    SELECT id, remaining_qty, unit_cost FROM stock_moves
    WHERE product_id = p_product AND warehouse_id = p_wh AND remaining_qty > 0
      AND coalesce(tenant_id, v_tid) = v_tid
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := least(v_need, lot.remaining_qty);
    UPDATE stock_moves SET remaining_qty = remaining_qty - v_take WHERE id = lot.id;
    INSERT INTO stock_moves (document_id, line_id, product_id, warehouse_id, move_type, qty, unit_cost,
                             remaining_qty, source_move_id, created_by, tenant_id)
    VALUES (p_doc, p_line, p_product, p_wh, p_type, -v_take, lot.unit_cost, 0, lot.id, p_user, v_tid);
    v_cost := v_cost + v_take * lot.unit_cost;
    v_need := v_need - v_take;
  END LOOP;
  IF v_need > 0 THEN
    SELECT name INTO v_name FROM products WHERE id = p_product;
    RAISE EXCEPTION 'Không đủ tồn kho "%": thiếu %', v_name, v_need;
  END IF;
  RETURN round(v_cost, 2);
END $$;

-- ============================================================
-- 16. UPDATE api_create_document — stamp tenant_id on new documents
-- ============================================================
CREATE OR REPLACE FUNCTION api_create_document(p_doc_type text, p_header jsonb DEFAULT '{}'::jsonb,
                                               p_lines jsonb DEFAULT NULL,
                                               p_parent_id uuid DEFAULT NULL,
                                               p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_dt doc_types; v_parent documents; v_rule doc_child_rules; v_doc documents; v_err text;
  v_total numeric; v_agent uuid; v_hours int; v_affected documents; h jsonb;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập hoặc tài khoản bị khóa'); END IF;
  h := coalesce(p_header, '{}'::jsonb);
  SELECT * INTO v_dt FROM doc_types WHERE code = p_doc_type;
  IF NOT FOUND THEN RETURN fn_fail('INVALID', 'Loại chứng từ không hợp lệ'); END IF;

  -- T5.6 idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_doc FROM documents WHERE idempotency_key = p_idempotency_key AND tenant_id = v_me.tenant_id;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status, 'duplicate', true);
    END IF;
  END IF;

  IF fn_perm_scope(v_me.id, p_doc_type, 'CREATE') = 0 THEN
    RETURN fn_fail('FORBIDDEN', format('Bạn không có quyền tạo %s', v_dt.name));
  END IF;
  IF p_doc_type IN ('PAYROLL','ACCESS_REVIEW') THEN
    RETURN fn_fail('INVALID', 'Chứng từ này được tạo bằng chức năng riêng');
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM documents WHERE id = p_parent_id AND tenant_id = v_me.tenant_id;
    IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ gốc'); END IF;
    SELECT * INTO v_rule FROM doc_child_rules WHERE parent_type = v_parent.doc_type AND child_type = p_doc_type;
    IF NOT FOUND THEN
      RETURN fn_fail('INVALID', format('Không thể lập %s từ %s', p_doc_type, v_parent.doc_type));
    END IF;
    IF NOT v_parent.status = ANY(v_rule.parent_statuses) THEN
      RETURN fn_fail('INVALID_TRANSITION', format('%s đang ở trạng thái %s — chưa thể lập %s', v_parent.number, v_parent.status, v_dt.name));
    END IF;
    IF NOT fn_doc_in_scope(v_me.id, v_parent, v_parent.doc_type, 'VIEW') THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền truy cập chứng từ gốc');
    END IF;
    IF v_dt.create_sod_role IS NOT NULL THEN
      v_err := fn_sod_enforce(v_parent.id, v_me.id, v_dt.create_sod_role, 'create_' || lower(p_doc_type));
      IF v_err IS NOT NULL THEN RETURN fn_fail('SOD_VIOLATION', v_err); END IF;
    END IF;
  ELSIF p_doc_type IN ('GRN','SINV','PMT','DN','INV','RCPT') THEN
    RETURN fn_fail('INVALID', format('%s phải được lập từ chứng từ gốc', v_dt.name));
  END IF;

  BEGIN
    INSERT INTO documents (doc_type, number, status, title, branch_id, department_id, cost_center_id,
                           partner_id, warehouse_id, to_warehouse_id, product_id, employee_id,
                           doc_date, due_date, amount, data, created_by, idempotency_key, tenant_id)
    VALUES (p_doc_type, fn_next_number(p_doc_type), v_dt.initial_status,
            coalesce(nullif(h->>'title', ''), v_parent.title),
            v_me.branch_id, v_me.department_id,
            coalesce(nullif(h->>'cost_center_id', '')::uuid, v_parent.cost_center_id, v_me.department_id),
            coalesce(nullif(h->>'partner_id', '')::uuid, v_parent.partner_id),
            coalesce(nullif(h->>'warehouse_id', '')::uuid, v_parent.warehouse_id),
            nullif(h->>'to_warehouse_id', '')::uuid,
            nullif(h->>'product_id', '')::uuid,
            nullif(h->>'employee_id', '')::uuid,
            coalesce(nullif(h->>'doc_date', '')::date, (fn_now())::date),
            nullif(h->>'due_date', '')::date,
            coalesce(nullif(h->>'amount', '')::numeric, 0),
            coalesce(h->'data', '{}'::jsonb),
            v_me.id, p_idempotency_key, v_me.tenant_id)
    RETURNING * INTO v_doc;

    IF v_parent.id IS NOT NULL THEN
      INSERT INTO document_links (parent_id, child_id, link_type) VALUES (v_parent.id, v_doc.id, 'SOURCE');
    END IF;

    PERFORM fn_validate_header(v_doc, v_parent);
    v_total := fn_build_lines(v_doc, v_parent, p_lines);
    IF p_doc_type NOT IN ('PMT','RCPT','ASSET','HIRE','TICKET','EXC','MDC') THEN
      UPDATE documents SET amount = v_total WHERE id = v_doc.id RETURNING * INTO v_doc;
    END IF;

    PERFORM fn_record_action(v_doc.id, 'create', NULL, v_doc.status, v_me.id, v_dt.create_sod_role, NULL);
    PERFORM fn_after_status_change(v_doc, v_me.id);

    RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status);
  EXCEPTION WHEN others THEN
    RETURN fn_fail('ERROR', SQLERRM);
  END;
END $$;

-- ============================================================
-- 17. UPDATE api_master_data — filter every entity by tenant_id
-- ============================================================
CREATE OR REPLACE FUNCTION api_master_data() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_hidden text[]; v_tid uuid;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  v_tid := v_me.tenant_id;
  v_hidden := fn_hidden_fields(v_me.id, 'INVENTORY');
  RETURN jsonb_build_object('ok', true,
    'branches',    (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.code) FROM branches b WHERE b.tenant_id = v_tid),
    'departments', (SELECT jsonb_agg(to_jsonb(d) || jsonb_build_object('branch_code', b.code) ORDER BY b.code, d.code)
                    FROM departments d JOIN branches b ON b.id = d.branch_id WHERE d.tenant_id = v_tid),
    'warehouses',  (SELECT jsonb_agg(to_jsonb(w) || jsonb_build_object('branch_code', b.code) ORDER BY w.code)
                    FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.tenant_id = v_tid),
    'partners',    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.code) FROM partners p WHERE p.tenant_id = v_tid),
    'products',    (SELECT jsonb_agg(CASE WHEN 'unit_cost' = ANY(v_hidden) THEN to_jsonb(p) - 'standard_cost' ELSE to_jsonb(p) END ORDER BY p.code)
                    FROM products p WHERE p.tenant_id = v_tid),
    'accounts',    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.code) FROM accounts a),  -- shared across tenants
    'boms',        (SELECT jsonb_agg(to_jsonb(bo) || jsonb_build_object('product_name', p.name, 'lines',
                      (SELECT jsonb_agg(jsonb_build_object('product_id', bl.product_id, 'product_name', lp.name, 'unit', lp.unit, 'quantity', bl.quantity))
                       FROM bom_lines bl JOIN products lp ON lp.id = bl.product_id WHERE bl.bom_id = bo.id)))
                    FROM boms bo JOIN products p ON p.id = bo.product_id WHERE bo.tenant_id = v_tid),
    'roles',       (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort) FROM roles r),     -- shared
    'users',       (SELECT jsonb_agg(jsonb_build_object('id', u.id, 'full_name', u.full_name, 'employee_code', u.employee_code,
                      'position', u.position, 'department_id', u.department_id, 'branch_id', u.branch_id, 'status', u.status,
                      'roles', fn_user_role_codes(u.id)) ORDER BY u.employee_code)
                    FROM app_users u WHERE u.tenant_id = v_tid),
    'doc_types',   (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort) FROM doc_types t), -- shared config
    'periods',     (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.period) FROM fiscal_periods f WHERE f.tenant_id = v_tid));
END $$;

-- ============================================================
-- 18. UPDATE GL / financial reports — filter gl_entries by tenant
-- ============================================================
CREATE OR REPLACE FUNCTION api_trial_balance(p_from text, p_to text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'GL', 'VIEW') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem sổ cái'); END IF;
  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to,
    'scope', (SELECT (ARRAY['OWN','DEPARTMENT','BRANCH','COMPANY'])[fn_perm_scope(v_me.id, 'GL', 'VIEW')]),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('account_code', code, 'account_name', name, 'account_type', account_type,
          'opening', opening, 'debit', pd, 'credit', pc, 'closing', opening + pd - pc) ORDER BY code)
      FROM (
        SELECT a.code, a.name, a.account_type,
          coalesce(sum(g.debit - g.credit) FILTER (WHERE g.period < p_from), 0) AS opening,
          coalesce(sum(g.debit) FILTER (WHERE g.period >= p_from), 0) AS pd,
          coalesce(sum(g.credit) FILTER (WHERE g.period >= p_from), 0) AS pc
        FROM accounts a
        LEFT JOIN gl_entries g ON g.account_code = a.code AND g.period <= p_to
          AND coalesce(g.tenant_id, v_me.tenant_id) = v_me.tenant_id
          AND fn_gl_filter(v_me.id, g.branch_id, g.department_id)
        GROUP BY a.code, a.name, a.account_type) t
      WHERE opening <> 0 OR pd <> 0 OR pc <> 0), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_financial_statements(p_from text, p_to text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_income jsonb; v_bs jsonb; v_rev numeric; v_exp numeric; v_profit_all numeric;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'GL', 'VIEW') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem báo cáo tài chính'); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('account_code', code, 'account_name', name, 'account_type', account_type, 'amount', amt) ORDER BY code), '[]'),
         coalesce(sum(amt) FILTER (WHERE account_type = 'REVENUE'), 0), coalesce(sum(amt) FILTER (WHERE account_type = 'EXPENSE'), 0)
  INTO v_income, v_rev, v_exp
  FROM (SELECT a.code, a.name, a.account_type,
          CASE WHEN a.account_type = 'REVENUE' THEN sum(g.credit - g.debit) ELSE sum(g.debit - g.credit) END AS amt
        FROM accounts a JOIN gl_entries g ON g.account_code = a.code
        WHERE a.account_type IN ('REVENUE','EXPENSE') AND g.period BETWEEN p_from AND p_to
          AND coalesce(g.tenant_id, v_me.tenant_id) = v_me.tenant_id
          AND fn_gl_filter(v_me.id, g.branch_id, g.department_id)
        GROUP BY a.code, a.name, a.account_type) x;

  SELECT coalesce(sum(CASE WHEN a.account_type = 'REVENUE' THEN g.credit - g.debit ELSE g.debit - g.credit END *
                      CASE WHEN a.account_type = 'EXPENSE' THEN -1 ELSE 1 END), 0)
  INTO v_profit_all
  FROM gl_entries g JOIN accounts a ON a.code = g.account_code
  WHERE a.account_type IN ('REVENUE','EXPENSE') AND g.period <= p_to
    AND coalesce(g.tenant_id, v_me.tenant_id) = v_me.tenant_id
    AND fn_gl_filter(v_me.id, g.branch_id, g.department_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('account_code', code, 'account_name', name, 'account_type', account_type, 'amount', amt) ORDER BY code), '[]')
  INTO v_bs
  FROM (SELECT a.code, a.name, a.account_type,
          CASE WHEN a.account_type = 'ASSET' THEN sum(g.debit - g.credit) ELSE sum(g.credit - g.debit) END AS amt
        FROM accounts a JOIN gl_entries g ON g.account_code = a.code
        WHERE a.account_type IN ('ASSET','LIABILITY','EQUITY') AND g.period <= p_to
          AND coalesce(g.tenant_id, v_me.tenant_id) = v_me.tenant_id
          AND fn_gl_filter(v_me.id, g.branch_id, g.department_id)
        GROUP BY a.code, a.name, a.account_type HAVING sum(g.debit - g.credit) <> 0) x;

  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to,
    'income_statement', jsonb_build_object('rows', v_income, 'revenue', v_rev, 'expense', v_exp, 'net_profit', v_rev - v_exp),
    'balance_sheet', jsonb_build_object('rows', v_bs,
      'total_assets', (SELECT coalesce(sum((r->>'amount')::numeric), 0) FROM jsonb_array_elements(v_bs) r WHERE r->>'account_type' = 'ASSET'),
      'total_liabilities', (SELECT coalesce(sum((r->>'amount')::numeric), 0) FROM jsonb_array_elements(v_bs) r WHERE r->>'account_type' = 'LIABILITY'),
      'total_equity', (SELECT coalesce(sum((r->>'amount')::numeric), 0) FROM jsonb_array_elements(v_bs) r WHERE r->>'account_type' = 'EQUITY'),
      'retained_profit', v_profit_all));
END $$;

-- ============================================================
-- 19. UPDATE inventory reports — filter stock_moves by tenant
-- ============================================================
CREATE OR REPLACE FUNCTION api_stock_on_hand(p_warehouse uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); s int; v_hidden text[];
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  s := fn_perm_scope(v_me.id, 'INVENTORY', 'VIEW');
  IF s = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem tồn kho'); END IF;
  v_hidden := fn_hidden_fields(v_me.id, 'INVENTORY');
  RETURN jsonb_build_object('ok', true, 'masked', to_jsonb(v_hidden), 'rows', coalesce((
    SELECT jsonb_agg(fn_mask(jsonb_build_object('product_id', p.id, 'product_code', p.code, 'product_name', p.name,
        'product_type', p.product_type, 'unit', p.unit, 'warehouse_id', w.id, 'warehouse_name', w.name, 'branch_code', b.code,
        'qty', q.qty, 'value', q.value, 'unit_cost', CASE WHEN q.qty > 0 THEN round(q.value / q.qty, 2) END,
        'reserved', fn_reserved(p.id, w.id, NULL), 'available', q.qty - fn_reserved(p.id, w.id, NULL),
        'lots', q.lots), v_hidden) ORDER BY w.code, p.code)
    FROM (SELECT product_id, warehouse_id, sum(qty) qty, sum(remaining_qty * unit_cost) value,
                 count(*) FILTER (WHERE remaining_qty > 0) lots
          FROM stock_moves
          WHERE coalesce(tenant_id, v_me.tenant_id) = v_me.tenant_id
          GROUP BY product_id, warehouse_id) q
    JOIN products p ON p.id = q.product_id AND p.tenant_id = v_me.tenant_id
    JOIN warehouses w ON w.id = q.warehouse_id AND w.tenant_id = v_me.tenant_id
    JOIN branches b ON b.id = w.branch_id
    WHERE (p_warehouse IS NULL OR w.id = p_warehouse) AND (s >= 4 OR w.branch_id = v_me.branch_id)), '[]'));
END $$;

CREATE OR REPLACE FUNCTION api_stock_ledger(p_product uuid, p_warehouse uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); s int; v_hidden text[];
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  s := fn_perm_scope(v_me.id, 'INVENTORY', 'VIEW');
  IF s = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem thẻ kho'); END IF;
  v_hidden := fn_hidden_fields(v_me.id, 'INVENTORY');
  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(fn_mask(jsonb_build_object('id', m.id, 'created_at', m.created_at, 'move_type', m.move_type,
        'document_id', d.id, 'document_number', d.number, 'doc_type', d.doc_type, 'warehouse_name', w.name,
        'qty', m.qty, 'unit_cost', m.unit_cost, 'value', round(m.qty * m.unit_cost, 2), 'balance', m.balance,
        'remaining_qty', m.remaining_qty, 'source_document_number', sd.number), v_hidden) ORDER BY m.created_at, m.id)
    FROM (SELECT sm.*, sum(sm.qty) OVER (PARTITION BY sm.warehouse_id ORDER BY sm.created_at, sm.id) balance
          FROM stock_moves sm
          WHERE sm.product_id = p_product AND (p_warehouse IS NULL OR sm.warehouse_id = p_warehouse)
            AND coalesce(sm.tenant_id, v_me.tenant_id) = v_me.tenant_id) m
    JOIN documents d ON d.id = m.document_id JOIN warehouses w ON w.id = m.warehouse_id
    LEFT JOIN stock_moves s2 ON s2.id = m.source_move_id LEFT JOIN documents sd ON sd.id = s2.document_id
    WHERE s >= 4 OR w.branch_id = v_me.branch_id), '[]'));
END $$;

-- ============================================================
-- 20. UPDATE api_budget_report — filter documents by tenant
-- ============================================================
CREATE OR REPLACE FUNCTION api_budget_report(p_year int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  RETURN jsonb_build_object('ok', true, 'rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', b.id, 'number', b.number, 'status', b.status,
        'department_name', dp.name, 'planned', pl.planned, 'committed', us.committed, 'actual', us.actual,
        'remaining', pl.planned - us.committed - us.actual,
        'utilization_pct', CASE WHEN pl.planned > 0 THEN round((us.committed + us.actual) / pl.planned * 100, 1) END,
        'lines', (SELECT jsonb_agg(jsonb_build_object('account_code', l.account_code, 'account_name', a.name,
                    'description', l.description, 'planned', l.amount) ORDER BY l.line_no)
                  FROM document_lines l LEFT JOIN accounts a ON a.code = l.account_code WHERE l.document_id = b.id))
      ORDER BY dp.name)
    FROM documents b
    JOIN departments dp ON dp.id = b.cost_center_id
    CROSS JOIN LATERAL (SELECT coalesce(sum(amount), 0) planned FROM document_lines WHERE document_id = b.id) pl
    CROSS JOIN LATERAL (
      SELECT coalesce(sum(amount) FILTER (WHERE usage_type = 'COMMITTED'), 0) committed,
             coalesce(sum(amount) FILTER (WHERE usage_type IN ('ACTUAL','ACCRUAL')), 0) actual
      FROM budget_usage WHERE budget_id = b.id) us
    WHERE b.doc_type = 'BUDGET' AND (data->>'fiscal_year')::int = p_year
      AND b.tenant_id = v_me.tenant_id
      AND fn_doc_in_scope(v_me.id, b, 'BUDGET', 'VIEW')), '[]'));
END $$;

-- ============================================================
-- 21. UPDATE RLS — replace USING (true) with tenant filter for business tables
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','departments','app_users','partners','products','warehouses',
    'boms','employees','fiscal_periods','ownership_matrix','shadow_it_register'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS read_authenticated ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY read_tenant ON public.%I FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant())',
      t
    );
  END LOOP;

  -- user_roles has no tenant_id column — filter via parent app_users
  DROP POLICY IF EXISTS read_authenticated ON public.user_roles;
  CREATE POLICY read_tenant ON public.user_roles FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM app_users u WHERE u.id = user_id AND u.tenant_id = fn_current_tenant()));

  -- Shared config tables: keep USING (true) — no per-tenant data
  -- roles, accounts, doc_types, state_transitions, doc_child_rules,
  -- handoff_map, sod_matrix, data_dictionary, kpi_catalog,
  -- impact_matrix, acceptance_criteria, permission_matrix  (no change)
END $$;

-- ============================================================
-- 22. api_admin_create_tenant — provision a new tenant with seed data
-- ============================================================
CREATE OR REPLACE FUNCTION api_admin_create_tenant(
  p_code text,
  p_name text,
  p_plan text DEFAULT 'STARTER',
  p_settings jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    app_users := fn_current_user();
  v_tid   uuid;
  v_bid   uuid;   -- default branch
  v_did   uuid;   -- default department
  v_uid   uuid;   -- admin user
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  -- Only SYSTEM_ADMIN role can provision tenants
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_me.id AND role_code = 'SYSTEM_ADMIN') THEN
    RETURN fn_fail('FORBIDDEN', 'Chỉ SYSTEM_ADMIN mới được tạo tenant');
  END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE code = upper(p_code)) THEN
    RETURN fn_fail('DUPLICATE', format('Tenant code %s đã tồn tại', p_code));
  END IF;

  INSERT INTO tenants (code, name, plan, settings)
  VALUES (upper(p_code), p_name, coalesce(p_plan, 'STARTER'), coalesce(p_settings, '{}'))
  RETURNING id INTO v_tid;

  -- Seed a default branch + department for the new tenant
  INSERT INTO branches (code, name, tenant_id)
  VALUES (upper(p_code) || '-HQ', p_name || ' HQ', v_tid)
  RETURNING id INTO v_bid;

  INSERT INTO departments (code, name, branch_id, tenant_id)
  VALUES (upper(p_code) || '-GEN', 'General', v_bid, v_tid)
  RETURNING id INTO v_did;

  -- Seed fiscal periods for current year (same as default tenant)
  INSERT INTO fiscal_periods (tenant_id, period, status)
  SELECT v_tid, period, status FROM fiscal_periods WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true,
    'tenant_id',    v_tid,
    'tenant_code',  upper(p_code),
    'branch_id',    v_bid,
    'department_id', v_did);
END $$;

-- ============================================================
-- 23. Grant fn_current_tenant to authenticated (needed for RLS policies)
-- ============================================================
GRANT EXECUTE ON FUNCTION fn_current_tenant() TO authenticated;

-- Re-grant all api_* including the new one
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'api\_%'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

-- ============================================================
-- 24. Acceptance criteria seed for T6.x tests
-- ============================================================
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker)
VALUES
  ('T6.1', 'N6_TENANT', 'Cô lập tenant: api_list_documents không lộ document qua tenant', 'L10', true),
  ('T6.2', 'N6_TENANT', 'Cô lập tenant: api_get_document trả về FORBIDDEN/NOT_FOUND',      'L10', true),
  ('T6.3', 'N6_TENANT', 'Cô lập tenant: api_master_data chỉ trả về data của tenant',        'L10', true),
  ('T6.4', 'N6_TENANT', 'Cô lập tenant: api_trace_responsibility từ chối cross-tenant',     'L11', true),
  ('T6.5', 'N6_TENANT', 'Cô lập tenant: RLS chặn direct SELECT branches',                   'L10', true),
  ('T6.6', 'N6_TENANT', 'Cô lập tenant: api_trial_balance không lộ GL entries',             'L7',  true)
ON CONFLICT (test_code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
