-- ERP General — 004 Engine
-- Core business logic enforced in the database (LOGIC per AI Simple P5):
-- permissions (3-tier), SoD, state machine, audit trail, handoffs,
-- stock ledger (FIFO lots), general ledger, budget control, 3-way matching.
-- Public entry points are api_* functions (SECURITY DEFINER); fn_* are internal.

-- ============================================================
-- UTILITIES
-- ============================================================
CREATE OR REPLACE FUNCTION fn_fail(p_code text, p_msg text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('ok', false, 'code', p_code, 'error', p_msg) || p_extra
$$;

CREATE OR REPLACE FUNCTION fn_money(p numeric) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(to_char(round(coalesce(p, 0)), 'FM999G999G999G999G990'), ',', '.') || ' ₫'
$$;

CREATE OR REPLACE FUNCTION fn_current_user() RETURNS app_users
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v app_users;
BEGIN
  SELECT * INTO v FROM app_users WHERE id = auth.uid() AND status = 'ACTIVE';
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION fn_user_role_codes(p_user uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(role_code ORDER BY role_code), '{}') FROM user_roles WHERE user_id = p_user
$$;

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
-- AUDIT TRAIL (ĐK4) — generic row trigger + immutability guards
-- ============================================================
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text;
  v_old jsonb; v_new jsonb; v_rec jsonb;
  v_changed text[];
  v_id text;
BEGIN
  SELECT full_name INTO v_name FROM app_users WHERE id = v_user;
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
  INSERT INTO audit_trail (table_name, record_id, action, old_value, new_value, changed_fields, user_id, user_name)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_old, v_new, v_changed, v_user, coalesce(v_name, 'SYSTEM'));
  RETURN coalesce(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION fn_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bảng % là bất biến (append-only): không cho phép %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE OR REPLACE FUNCTION fn_stock_move_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock_moves là sổ kho bất biến: không cho phép DELETE';
  END IF;
  IF (to_jsonb(NEW) - 'remaining_qty') IS DISTINCT FROM (to_jsonb(OLD) - 'remaining_qty') THEN
    RAISE EXCEPTION 'stock_moves là sổ kho bất biến: chỉ được cập nhật remaining_qty';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents','document_lines','document_links','app_users','user_roles',
    'permission_matrix','sod_matrix','partners','products','warehouses','employees','fiscal_periods',
    'ownership_matrix','handoff_map','state_transitions','doc_types','accounts','boms','bom_lines',
    'data_dictionary','kpi_catalog','shadow_it_register','acceptance_criteria','departments','branches','roles']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION fn_audit_row()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['audit_trail','gl_entries','document_actions','sod_check_log']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_immutable_%1$s BEFORE UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION fn_block_mutation()', t);
  END LOOP;
END $$;

CREATE TRIGGER trg_guard_stock_moves BEFORE UPDATE OR DELETE ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION fn_stock_move_guard();

-- ============================================================
-- PERMISSIONS (ĐK8 / NT5): Role × Data scope × Field
-- ============================================================
CREATE OR REPLACE FUNCTION fn_perm_scope(p_user uuid, p_resource text, p_action text) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(max(CASE pm.data_scope WHEN 'OWN' THEN 1 WHEN 'DEPARTMENT' THEN 2
                                          WHEN 'BRANCH' THEN 3 WHEN 'COMPANY' THEN 4 END), 0)
  FROM user_roles ur
  JOIN app_users u ON u.id = ur.user_id AND u.status = 'ACTIVE'
  JOIN permission_matrix pm ON pm.role_code = ur.role_code AND pm.status = 'ACTIVE'
  WHERE ur.user_id = p_user AND pm.resource = p_resource AND pm.action = p_action
$$;

CREATE OR REPLACE FUNCTION fn_doc_in_scope(p_user uuid, p_doc documents, p_resource text, p_action text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s int; u app_users;
BEGIN
  s := fn_perm_scope(p_user, p_resource, p_action);
  IF s = 0 THEN RETURN false; END IF;
  IF s >= 4 THEN RETURN true; END IF;
  SELECT * INTO u FROM app_users WHERE id = p_user;
  IF s >= 3 AND (p_doc.branch_id = u.branch_id
      OR EXISTS (SELECT 1 FROM warehouses w WHERE w.id = p_doc.to_warehouse_id AND w.branch_id = u.branch_id)) THEN
    RETURN true;
  END IF;
  IF s >= 2 AND (p_doc.department_id = u.department_id OR p_doc.cost_center_id = u.department_id) THEN
    RETURN true;
  END IF;
  IF p_doc.created_by = p_user OR p_doc.owner_id = p_user THEN RETURN true; END IF;
  -- OWN also covers documents derived from my own documents (e.g. DN/INV of my SO)
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

-- fields hidden by ALL of the user's VIEW grants on a resource
CREATE OR REPLACE FUNCTION fn_hidden_fields(p_user uuid, p_resource text) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_res text[];
BEGIN
  SELECT count(*) INTO v_total
  FROM user_roles ur JOIN permission_matrix pm
    ON pm.role_code = ur.role_code AND pm.resource = p_resource AND pm.action = 'VIEW' AND pm.status = 'ACTIVE'
  WHERE ur.user_id = p_user;
  IF v_total = 0 THEN RETURN '{}'; END IF;
  SELECT coalesce(array_agg(f), '{}') INTO v_res FROM (
    SELECT f
    FROM user_roles ur
    JOIN permission_matrix pm ON pm.role_code = ur.role_code AND pm.resource = p_resource AND pm.action = 'VIEW' AND pm.status = 'ACTIVE'
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(pm.field_restrictions->'hidden', '[]'::jsonb)) f
    WHERE ur.user_id = p_user
    GROUP BY f HAVING count(*) = v_total
  ) x;
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION fn_mask(p_json jsonb, p_hidden text[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; j jsonb := p_json;
BEGIN
  IF p_hidden IS NULL OR cardinality(p_hidden) = 0 OR j IS NULL THEN RETURN j; END IF;
  FOREACH k IN ARRAY p_hidden LOOP
    j := j - k;
    IF jsonb_typeof(j->'data') = 'object' THEN j := jsonb_set(j, '{data}', (j->'data') - k); END IF;
  END LOOP;
  RETURN j || jsonb_build_object('_masked', to_jsonb(p_hidden));
END $$;

-- ============================================================
-- DOCUMENT HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION fn_doc_json(d documents) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(d) || jsonb_build_object(
    'doc_type_name', dt.name, 'flow_code', dt.flow_code, 'module', dt.module,
    'is_terminal', d.status = ANY(dt.terminal_statuses),
    'partner_name', p.name, 'partner_code', p.code,
    'branch_code', b.code, 'branch_name', b.name,
    'department_name', dep.name, 'cost_center_name', cc.name,
    'warehouse_name', w.name, 'to_warehouse_name', tw.name,
    'product_name', pr.name, 'product_code', pr.code, 'product_unit', pr.unit,
    'employee_name', e.full_name,
    'created_by_name', cu.full_name, 'owner_name', ou.full_name)
  FROM doc_types dt
  LEFT JOIN partners p ON p.id = d.partner_id
  LEFT JOIN branches b ON b.id = d.branch_id
  LEFT JOIN departments dep ON dep.id = d.department_id
  LEFT JOIN departments cc ON cc.id = d.cost_center_id
  LEFT JOIN warehouses w ON w.id = d.warehouse_id
  LEFT JOIN warehouses tw ON tw.id = d.to_warehouse_id
  LEFT JOIN products pr ON pr.id = d.product_id
  LEFT JOIN employees e ON e.id = d.employee_id
  LEFT JOIN app_users cu ON cu.id = d.created_by
  LEFT JOIN app_users ou ON ou.id = d.owner_id
  WHERE dt.code = d.doc_type
$$;

CREATE OR REPLACE FUNCTION fn_parent(p_doc_id uuid, p_type text) RETURNS documents
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v documents;
BEGIN
  SELECT d.* INTO v FROM document_links l JOIN documents d ON d.id = l.parent_id
  WHERE l.child_id = p_doc_id AND l.link_type = 'SOURCE' AND (p_type IS NULL OR d.doc_type = p_type)
  ORDER BY l.created_at LIMIT 1;
  RETURN v;
END $$;

-- quantity of child lines referencing a source line
CREATE OR REPLACE FUNCTION fn_consumed(p_source_line uuid, p_child_type text, p_statuses text[] DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(l.quantity), 0)
  FROM document_lines l JOIN documents d ON d.id = l.document_id
  WHERE l.source_line_id = p_source_line AND d.doc_type = p_child_type
    AND ((p_statuses IS NULL AND d.status NOT IN ('CANCELLED','REJECTED')) OR d.status = ANY(p_statuses))
$$;

CREATE OR REPLACE FUNCTION fn_children_amount(p_doc_id uuid, p_child_type text, p_statuses text[] DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(d.amount), 0)
  FROM document_links l JOIN documents d ON d.id = l.child_id
  WHERE l.parent_id = p_doc_id AND l.link_type = 'SOURCE' AND d.doc_type = p_child_type
    AND ((p_statuses IS NULL AND d.status NOT IN ('CANCELLED','REJECTED')) OR d.status = ANY(p_statuses))
$$;

-- ============================================================
-- SEPARATION OF DUTIES (ĐK3) — context = document + SOURCE ancestors
-- ============================================================
CREATE OR REPLACE FUNCTION fn_sod_find_conflict(p_doc_id uuid, p_user uuid, p_role text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE ctx(id, depth) AS (
    SELECT p_doc_id, 0
    UNION
    SELECT l.parent_id, c.depth + 1 FROM document_links l JOIN ctx c ON l.child_id = c.id
    WHERE l.link_type = 'SOURCE' AND c.depth < 10
  )
  SELECT jsonb_build_object(
    'existing_role', a.sod_role, 'attempted_role', p_role,
    'document_id', d.id, 'document_number', d.number, 'doc_type', d.doc_type,
    'action', a.action, 'acted_at', a.created_at, 'rule', m.description)
  FROM document_actions a
  JOIN documents d ON d.id = a.document_id
  JOIN sod_matrix m ON m.conflict_type = 'HARD'
    AND ((m.role_a = a.sod_role AND m.role_b = p_role) OR (m.role_b = a.sod_role AND m.role_a = p_role))
  WHERE p_role IS NOT NULL AND a.user_id = p_user AND a.sod_role IS NOT NULL
    AND a.document_id IN (SELECT id FROM ctx)
  ORDER BY a.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION fn_sod_label(p_role text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role WHEN 'REQUESTER' THEN 'Người đề xuất' WHEN 'APPROVER' THEN 'Người phê duyệt'
                     WHEN 'EXECUTOR' THEN 'Người thực hiện' WHEN 'AUDITOR' THEN 'Người kiểm tra' ELSE p_role END
$$;

-- Checks and LOGS (T3.4) every SoD evaluation. Returns error text when blocked.
CREATE OR REPLACE FUNCTION fn_sod_enforce(p_doc_id uuid, p_user uuid, p_role text, p_action text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conflict jsonb; v_doc documents; v_name text; v_msg text;
BEGIN
  IF p_role IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_doc FROM documents WHERE id = p_doc_id;
  v_conflict := fn_sod_find_conflict(p_doc_id, p_user, p_role);
  IF v_conflict IS NULL THEN
    INSERT INTO sod_check_log (document_id, doc_type, document_number, action, user_id, attempted_role, result, detail)
    VALUES (p_doc_id, v_doc.doc_type, v_doc.number, p_action, p_user, p_role, 'PASSED', NULL);
    RETURN NULL;
  END IF;
  SELECT full_name INTO v_name FROM app_users WHERE id = p_user;
  v_msg := format('Vi phạm SoD (%s): %s đã là %s trên %s nên không thể làm %s cho %s.',
    v_conflict->>'rule', v_name, fn_sod_label(v_conflict->>'existing_role'), v_conflict->>'document_number',
    fn_sod_label(p_role), v_doc.number);
  INSERT INTO sod_check_log (document_id, doc_type, document_number, action, user_id, attempted_role,
                             conflicting_role, conflicting_document_id, result, detail)
  VALUES (p_doc_id, v_doc.doc_type, v_doc.number, p_action, p_user, p_role,
          v_conflict->>'existing_role', (v_conflict->>'document_id')::uuid, 'BLOCKED', v_msg);
  INSERT INTO audit_trail (table_name, record_id, action, old_value, new_value, user_id, user_name)
  VALUES ('documents', p_doc_id::text, 'SOD_VIOLATION', v_conflict, jsonb_build_object('attempted_role', p_role, 'action', p_action), p_user, v_name);
  RETURN v_msg;
END $$;

-- ============================================================
-- PERIODS, GL, BUDGET, STOCK
-- ============================================================
CREATE OR REPLACE FUNCTION fn_period_error(p_date date, p_allow_soft boolean) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_period text := to_char(p_date, 'YYYY-MM');
BEGIN
  SELECT status INTO v_status FROM fiscal_periods WHERE period = v_period;
  IF NOT FOUND THEN RETURN format('Kỳ kế toán %s chưa được khai báo', v_period); END IF;
  IF v_status = 'HARD_CLOSE' THEN
    RETURN format('Kỳ %s đã khóa sổ (HARD_CLOSE) — không thể ghi sổ', v_period);
  END IF;
  IF v_status = 'SOFT_CLOSE' AND NOT p_allow_soft THEN
    RETURN format('Kỳ %s đang khóa sơ bộ (SOFT_CLOSE) — chỉ cho phép bút toán điều chỉnh (JV)', v_period);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION fn_gl(p_doc documents, p_date date, p_account text, p_debit numeric, p_credit numeric,
                                 p_partner uuid, p_desc text, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_err text;
BEGIN
  IF round(coalesce(p_debit, 0), 2) = 0 AND round(coalesce(p_credit, 0), 2) = 0 THEN RETURN; END IF;
  v_err := fn_period_error(p_date, true);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err; END IF;
  INSERT INTO gl_entries (document_id, posting_date, period, account_code, debit, credit, partner_id,
                          branch_id, department_id, description, created_by)
  VALUES (p_doc.id, p_date, to_char(p_date, 'YYYY-MM'), p_account, round(coalesce(p_debit, 0), 2),
          round(coalesce(p_credit, 0), 2), p_partner, p_doc.branch_id,
          coalesce(p_doc.cost_center_id, p_doc.department_id), coalesce(p_desc, p_doc.number), p_user);
END $$;

CREATE OR REPLACE FUNCTION fn_gl_assert_balanced(p_doc_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d numeric; v_c numeric;
BEGIN
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0) INTO v_d, v_c FROM gl_entries WHERE document_id = p_doc_id;
  IF v_d <> v_c THEN
    RAISE EXCEPTION 'Bút toán không cân: Nợ % ≠ Có %', v_d, v_c;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_active_budget(p_cost_center uuid, p_year int) RETURNS documents
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v documents;
BEGIN
  SELECT * INTO v FROM documents
  WHERE doc_type = 'BUDGET' AND status = 'ACTIVE' AND cost_center_id = p_cost_center
    AND (data->>'fiscal_year')::int = p_year
  ORDER BY created_at DESC LIMIT 1;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION fn_budget_remaining(p_budget_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT coalesce(sum(amount), 0) FROM document_lines WHERE document_id = p_budget_id)
       - (SELECT coalesce(sum(amount), 0) FROM budget_usage WHERE budget_id = p_budget_id)
$$;

CREATE OR REPLACE FUNCTION fn_on_hand(p_product uuid, p_wh uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(qty), 0) FROM stock_moves WHERE product_id = p_product AND warehouse_id = p_wh
$$;

-- quantity reserved by confirmed-but-unshipped sales orders
CREATE OR REPLACE FUNCTION fn_reserved(p_product uuid, p_wh uuid, p_exclude uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(greatest(l.quantity - fn_consumed(l.id, 'DN', ARRAY['SHIPPED']), 0)), 0)
  FROM documents d JOIN document_lines l ON l.document_id = d.id
  WHERE d.doc_type = 'SO' AND d.status IN ('CONFIRMED','PARTIALLY_SHIPPED')
    AND d.warehouse_id = p_wh AND l.product_id = p_product AND d.id <> coalesce(p_exclude, '00000000-0000-0000-0000-000000000000')
$$;

CREATE OR REPLACE FUNCTION fn_stock_in(p_doc uuid, p_line uuid, p_product uuid, p_wh uuid, p_qty numeric,
                                       p_cost numeric, p_type text, p_source uuid, p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_qty <= 0 THEN RAISE EXCEPTION 'Số lượng nhập kho phải > 0'; END IF;
  INSERT INTO stock_moves (document_id, line_id, product_id, warehouse_id, move_type, qty, unit_cost,
                           remaining_qty, source_move_id, created_by)
  VALUES (p_doc, p_line, p_product, p_wh, p_type, p_qty, round(coalesce(p_cost, 0), 2), p_qty, p_source, p_user)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- FIFO issue: consumes oldest lots, one out-move per lot consumed (lot genealogy)
CREATE OR REPLACE FUNCTION fn_stock_out(p_doc uuid, p_line uuid, p_product uuid, p_wh uuid, p_qty numeric,
                                        p_type text, p_user uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_need numeric := p_qty; v_take numeric; v_cost numeric := 0; lot record; v_name text;
BEGIN
  IF p_qty <= 0 THEN RETURN 0; END IF;
  FOR lot IN
    SELECT id, remaining_qty, unit_cost FROM stock_moves
    WHERE product_id = p_product AND warehouse_id = p_wh AND remaining_qty > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := least(v_need, lot.remaining_qty);
    UPDATE stock_moves SET remaining_qty = remaining_qty - v_take WHERE id = lot.id;
    INSERT INTO stock_moves (document_id, line_id, product_id, warehouse_id, move_type, qty, unit_cost,
                             remaining_qty, source_move_id, created_by)
    VALUES (p_doc, p_line, p_product, p_wh, p_type, -v_take, lot.unit_cost, 0, lot.id, p_user);
    v_cost := v_cost + v_take * lot.unit_cost;
    v_need := v_need - v_take;
  END LOOP;
  IF v_need > 0 THEN
    SELECT name INTO v_name FROM products WHERE id = p_product;
    RAISE EXCEPTION 'Không đủ tồn kho "%": thiếu %', v_name, v_need;
  END IF;
  RETURN round(v_cost, 2);
END $$;

CREATE OR REPLACE FUNCTION fn_check_stock(p_doc documents) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_msgs text[] := '{}'; v_avail numeric;
BEGIN
  FOR r IN
    SELECT l.product_id, p.name, sum(l.quantity) qty
    FROM document_lines l JOIN products p ON p.id = l.product_id
    WHERE l.document_id = p_doc.id AND p.product_type <> 'SERVICE'
    GROUP BY l.product_id, p.name
  LOOP
    v_avail := fn_on_hand(r.product_id, p_doc.warehouse_id);
    IF p_doc.doc_type = 'SO' THEN
      v_avail := v_avail - fn_reserved(r.product_id, p_doc.warehouse_id, p_doc.id);
    END IF;
    IF r.qty > v_avail THEN
      v_msgs := v_msgs || format('%s: cần %s, khả dụng %s', r.name, r.qty::float8, greatest(v_avail, 0)::float8);
    END IF;
  END LOOP;
  IF cardinality(v_msgs) > 0 THEN
    RETURN 'Không đủ tồn kho — ' || array_to_string(v_msgs, '; ');
  END IF;
  RETURN NULL;
END $$;

-- ============================================================
-- STATE MACHINE CONDITIONS
-- ============================================================
CREATE OR REPLACE FUNCTION fn_check_condition(p_doc documents, p_cond text, p_payload jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d numeric; v_c numeric; v_b documents; v_rem numeric; v_err text;
BEGIN
  CASE p_cond
  WHEN 'has_lines' THEN
    IF NOT EXISTS (SELECT 1 FROM document_lines WHERE document_id = p_doc.id) THEN
      RETURN 'Chứng từ chưa có dòng chi tiết';
    END IF;
  WHEN 'amount_positive' THEN
    IF coalesce(p_doc.amount, 0) <= 0 THEN RETURN 'Số tiền phải lớn hơn 0'; END IF;
  WHEN 'balanced' THEN
    SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0) INTO v_d, v_c FROM document_lines WHERE document_id = p_doc.id;
    IF v_d <> v_c OR v_d = 0 THEN
      RETURN format('Bút toán không cân: Tổng Nợ %s ≠ Tổng Có %s', fn_money(v_d), fn_money(v_c));
    END IF;
  WHEN 'budget_available' THEN
    IF p_doc.cost_center_id IS NOT NULL THEN
      v_b := fn_active_budget(p_doc.cost_center_id, extract(year FROM p_doc.doc_date)::int);
      IF v_b.id IS NOT NULL THEN
        v_rem := fn_budget_remaining(v_b.id);
        IF p_doc.amount > v_rem THEN
          RETURN format('Vượt ngân sách %s: còn lại %s, chứng từ cần %s', v_b.number, fn_money(v_rem), fn_money(p_doc.amount));
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
      WHERE l.parent_id = p_doc.id AND l.link_type = 'EXCEPTION' AND e.status IN ('APPROVED','RESOLVED','CLOSED')
    ) THEN
      RETURN 'Cần ngoại lệ (EXC) được phê duyệt trước khi giải tỏa';
    END IF;
  WHEN 'resolution_provided' THEN
    IF coalesce(nullif(trim(p_payload->>'resolution'), ''), nullif(trim(p_doc.data->>'resolution'), '')) IS NULL THEN
      RETURN 'Cần nhập nội dung xử lý (resolution)';
    END IF;
  WHEN 'all_matched' THEN
    IF NOT coalesce((p_payload->>'accept_unmatched')::boolean, false) AND EXISTS (
      SELECT 1 FROM document_lines WHERE document_id = p_doc.id AND (data->>'matched_document_id') IS NULL
    ) THEN
      RETURN 'Còn giao dịch sao kê chưa khớp';
    END IF;
  ELSE
    RETURN format('Điều kiện không xác định: %s', p_cond);
  END CASE;
  RETURN NULL;
END $$;

-- ============================================================
-- ACTIONS, HANDOFFS, NOTIFICATIONS
-- ============================================================
CREATE OR REPLACE FUNCTION fn_record_action(p_doc_id uuid, p_action text, p_from text, p_to text,
                                            p_user uuid, p_sod_role text, p_comment text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_dept uuid;
BEGIN
  SELECT department_id INTO v_dept FROM app_users WHERE id = p_user;
  INSERT INTO document_actions (document_id, action, from_status, to_status, user_id, sod_role, user_roles, department_id, comment)
  VALUES (p_doc_id, p_action, p_from, p_to, p_user, p_sod_role, fn_user_role_codes(p_user), v_dept, p_comment)
  RETURNING id INTO v_id;
  -- whoever acts on the document receives its pending handoffs
  UPDATE handoff_records SET status = 'COMPLETED', to_user_id = p_user, to_department_id = v_dept, completed_at = fn_now()
  WHERE document_id = p_doc_id AND status = 'INITIATED';
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION fn_notify(p_user uuid, p_title text, p_body text, p_doc uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notifications (user_id, title, body, document_id) VALUES (p_user, p_title, p_body, p_doc)
$$;

CREATE OR REPLACE FUNCTION fn_after_status_change(p_doc documents, p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m handoff_map; v_dept uuid; v_type_name text; u record;
BEGIN
  SELECT department_id INTO v_dept FROM app_users WHERE id = p_actor;
  SELECT name INTO v_type_name FROM doc_types WHERE code = p_doc.doc_type;
  FOR m IN SELECT * FROM handoff_map WHERE doc_type = p_doc.doc_type AND trigger_status = p_doc.status AND status = 'ACTIVE' LOOP
    INSERT INTO handoff_records (handoff_map_id, document_id, from_user_id, from_department_id, to_role, sla_due_at)
    VALUES (m.id, p_doc.id, p_actor, v_dept, m.to_role, fn_now() + make_interval(hours => m.sla_hours));
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

-- status changes driven by the system (roll-ups), still validated against BM-05
CREATE OR REPLACE FUNCTION fn_system_set_status(p_doc_id uuid, p_status text, p_user uuid, p_comment text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d documents; t state_transitions;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_doc_id FOR UPDATE;
  IF d.status = p_status THEN RETURN; END IF;
  SELECT * INTO t FROM state_transitions
  WHERE doc_type = d.doc_type AND from_status = d.status AND to_status = p_status
  ORDER BY system_only DESC, sort LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'State machine %: không có chuyển trạng thái % → %', d.doc_type, d.status, p_status;
  END IF;
  UPDATE documents SET status = p_status, version = version + 1, updated_at = fn_now() WHERE id = p_doc_id
  RETURNING * INTO d;
  PERFORM fn_record_action(p_doc_id, t.action, t.from_status, p_status, p_user, NULL,
                           coalesce(p_comment, 'Tự động cập nhật theo chứng từ liên quan'));
  PERFORM fn_after_status_change(d, p_user);
END $$;

-- ============================================================
-- ROLL-UPS along the document chain
-- ============================================================
CREATE OR REPLACE FUNCTION fn_rollup_po(p_po uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d documents; v_all_recv boolean; v_any_recv boolean; v_all_inv boolean;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_po;
  IF d.id IS NULL THEN RETURN; END IF;
  SELECT bool_and(fn_consumed(l.id, 'GRN', ARRAY['STORED']) >= l.quantity),
         bool_or(fn_consumed(l.id, 'GRN', ARRAY['STORED']) > 0),
         bool_and(fn_consumed(l.id, 'SINV', ARRAY['POSTED','PARTIALLY_PAID','PAID']) >= l.quantity)
  INTO v_all_recv, v_any_recv, v_all_inv
  FROM document_lines l WHERE l.document_id = p_po;
  IF d.status IN ('CONFIRMED','PARTIALLY_RECEIVED') THEN
    IF v_all_recv THEN PERFORM fn_system_set_status(p_po, 'RECEIVED', p_user);
    ELSIF v_any_recv AND d.status = 'CONFIRMED' THEN PERFORM fn_system_set_status(p_po, 'PARTIALLY_RECEIVED', p_user);
    END IF;
  END IF;
  SELECT * INTO d FROM documents WHERE id = p_po;
  IF d.status = 'RECEIVED' AND v_all_inv THEN
    PERFORM fn_system_set_status(p_po, 'INVOICED', p_user);
  END IF;
  SELECT * INTO d FROM documents WHERE id = p_po;
  IF d.status = 'INVOICED' AND NOT EXISTS (
    SELECT 1 FROM document_links l JOIN documents s ON s.id = l.child_id
    WHERE l.parent_id = p_po AND l.link_type = 'SOURCE' AND s.doc_type = 'SINV' AND s.status NOT IN ('PAID','CANCELLED')
  ) THEN
    PERFORM fn_system_set_status(p_po, 'PAID', p_user);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_rollup_so(p_so uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d documents; v_all_ship boolean; v_any_ship boolean; v_all_inv boolean;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_so;
  IF d.id IS NULL THEN RETURN; END IF;
  SELECT bool_and(fn_consumed(l.id, 'DN', ARRAY['SHIPPED']) >= l.quantity),
         bool_or(fn_consumed(l.id, 'DN', ARRAY['SHIPPED']) > 0),
         bool_and(fn_consumed(l.id, 'INV', ARRAY['POSTED','PARTIALLY_PAID','PAID']) >= l.quantity)
  INTO v_all_ship, v_any_ship, v_all_inv
  FROM document_lines l WHERE l.document_id = p_so;
  IF d.status IN ('CONFIRMED','PARTIALLY_SHIPPED') THEN
    IF v_all_ship THEN PERFORM fn_system_set_status(p_so, 'SHIPPED', p_user);
    ELSIF v_any_ship AND d.status = 'CONFIRMED' THEN PERFORM fn_system_set_status(p_so, 'PARTIALLY_SHIPPED', p_user);
    END IF;
  END IF;
  SELECT * INTO d FROM documents WHERE id = p_so;
  IF d.status = 'SHIPPED' AND v_all_inv THEN
    PERFORM fn_system_set_status(p_so, 'INVOICED', p_user);
  END IF;
  SELECT * INTO d FROM documents WHERE id = p_so;
  IF d.status = 'INVOICED' AND NOT EXISTS (
    SELECT 1 FROM document_links l JOIN documents s ON s.id = l.child_id
    WHERE l.parent_id = p_so AND l.link_type = 'SOURCE' AND s.doc_type = 'INV' AND s.status NOT IN ('PAID','CANCELLED')
  ) THEN
    PERFORM fn_system_set_status(p_so, 'CLOSED', p_user);
  END IF;
END $$;

-- payable/receivable documents (SINV, INV, PAYROLL, ASSET) after a payment/receipt
CREATE OR REPLACE FUNCTION fn_rollup_settlement(p_doc_id uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d documents; v_paid numeric; v_parent documents;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_doc_id;
  IF d.doc_type = 'INV' THEN
    v_paid := fn_children_amount(d.id, 'RCPT', ARRAY['RECEIVED','AUDITED']);
  ELSE
    v_paid := fn_children_amount(d.id, 'PMT', ARRAY['PAID','AUDITED']);
  END IF;
  UPDATE documents SET data = data || jsonb_build_object('paid_amount', v_paid, 'outstanding', greatest(d.amount - v_paid, 0))
  WHERE id = d.id;
  IF d.doc_type IN ('SINV','INV') THEN
    IF v_paid >= d.amount THEN PERFORM fn_system_set_status(d.id, 'PAID', p_user);
    ELSIF v_paid > 0 AND d.status = 'POSTED' THEN PERFORM fn_system_set_status(d.id, 'PARTIALLY_PAID', p_user);
    END IF;
    v_parent := fn_parent(d.id, CASE d.doc_type WHEN 'SINV' THEN 'PO' ELSE 'SO' END);
    IF v_parent.id IS NOT NULL THEN
      IF d.doc_type = 'SINV' THEN PERFORM fn_rollup_po(v_parent.id, p_user);
      ELSE PERFORM fn_rollup_so(v_parent.id, p_user);
      END IF;
    END IF;
  ELSIF d.doc_type = 'PAYROLL' AND v_paid >= d.amount THEN
    PERFORM fn_system_set_status(d.id, 'PAID', p_user);
  END IF;
END $$;

-- internal document creation used by the engine itself (exceptions, depreciation)
CREATE OR REPLACE FUNCTION fn_insert_document(p_type text, p_user uuid, p_title text, p_data jsonb,
                                              p_parent uuid, p_link_type text, p_amount numeric DEFAULT 0,
                                              p_cost_center uuid DEFAULT NULL) RETURNS documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u app_users; dt doc_types; d documents;
BEGIN
  SELECT * INTO u FROM app_users WHERE id = p_user;
  SELECT * INTO dt FROM doc_types WHERE code = p_type;
  INSERT INTO documents (doc_type, number, status, title, branch_id, department_id, cost_center_id, amount, data, created_by, tenant_id)
  VALUES (p_type, fn_next_number(p_type), dt.initial_status, p_title, u.branch_id, u.department_id,
          coalesce(p_cost_center, u.department_id), coalesce(p_amount, 0), coalesce(p_data, '{}'), p_user, u.tenant_id)
  RETURNING * INTO d;
  IF p_parent IS NOT NULL THEN
    INSERT INTO document_links (parent_id, child_id, link_type) VALUES (p_parent, d.id, p_link_type);
  END IF;
  PERFORM fn_record_action(d.id, 'create', NULL, d.status, p_user, dt.create_sod_role, 'Tạo tự động bởi hệ thống');
  PERFORM fn_after_status_change(d, p_user);
  RETURN d;
END $$;

-- ============================================================
-- SIDE EFFECTS of transitions  → returns {"status": override?, "message": text}
-- ============================================================
CREATE OR REPLACE FUNCTION fn_apply_effects(p_doc documents, p_t state_transitions, p_payload jsonb, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text := p_doc.doc_type || ':' || p_t.action;
  v_today date := (fn_now())::date;
  v_parent documents; v_b documents;
  l record; r record; m record;
  v_total numeric := 0; v_cost numeric; v_qty numeric; v_amt numeric; v_diff numeric; v_sys numeric;
  v_ok boolean := true; v_details jsonb := '[]'::jsonb; v_line jsonb;
  v_exc documents; v_msg text; v_acc numeric; v_agent uuid; v_n int := 0;
  v_accounts jsonb := '{}'::jsonb; v_k text; v_emp_code text; v_dept departments;
BEGIN
  -- ---------------- PROCUREMENT ----------------
  IF v_key = 'PO:approve' THEN
    v_b := fn_active_budget(p_doc.cost_center_id, extract(year FROM p_doc.doc_date)::int);
    IF v_b.id IS NOT NULL THEN
      INSERT INTO budget_usage (budget_id, document_id, usage_type, amount) VALUES (v_b.id, p_doc.id, 'COMMITTED', p_doc.amount);
      INSERT INTO document_links (parent_id, child_id, link_type) VALUES (v_b.id, p_doc.id, 'REFERENCE') ON CONFLICT DO NOTHING;
      v_msg := format('Đã cam kết %s vào ngân sách %s', fn_money(p_doc.amount), v_b.number);
    END IF;

  ELSIF v_key = 'GRN:store' THEN
    v_parent := fn_parent(p_doc.id, 'PO');
    FOR l IN
      SELECT dl.*, p.inventory_account, p.product_type FROM document_lines dl JOIN products p ON p.id = dl.product_id
      WHERE dl.document_id = p_doc.id ORDER BY dl.line_no
    LOOP
      v_amt := round(l.quantity * l.unit_price, 2);
      IF l.product_type = 'SERVICE' OR l.inventory_account IS NULL THEN
        v_k := '642';
      ELSE
        PERFORM fn_stock_in(p_doc.id, l.id, l.product_id, p_doc.warehouse_id, l.quantity, l.unit_price, 'GRN_IN', NULL, p_user);
        v_k := l.inventory_account;
      END IF;
      v_accounts := jsonb_set(v_accounts, ARRAY[v_k], to_jsonb(coalesce((v_accounts->>v_k)::numeric, 0) + v_amt));
      v_total := v_total + v_amt;
    END LOOP;
    FOR v_k IN SELECT jsonb_object_keys(v_accounts) LOOP
      PERFORM fn_gl(p_doc, v_today, v_k, (v_accounts->>v_k)::numeric, 0, p_doc.partner_id, 'Nhập kho ' || p_doc.number, p_user);
    END LOOP;
    PERFORM fn_gl(p_doc, v_today, '3388', 0, v_total, p_doc.partner_id, 'Hàng về chưa có hóa đơn ' || p_doc.number, p_user);
    UPDATE documents SET amount = v_total WHERE id = p_doc.id;

  ELSIF v_key = 'SINV:match' THEN
    -- 3-way match: PO ↔ GRN ↔ Invoice (qty tolerance 0, price tolerance ±2%)
    FOR l IN
      SELECT il.id, il.line_no, il.quantity, il.unit_price, pl.id AS po_line, pl.quantity AS po_qty,
             pl.unit_price AS po_price, p.name AS product_name
      FROM document_lines il
      JOIN document_lines pl ON pl.id = il.source_line_id
      JOIN products p ON p.id = il.product_id
      WHERE il.document_id = p_doc.id ORDER BY il.line_no
    LOOP
      v_qty := fn_consumed(l.po_line, 'GRN', ARRAY['STORED']);
      SELECT coalesce(sum(x.quantity), 0) INTO v_sys
      FROM document_lines x JOIN documents xd ON xd.id = x.document_id
      WHERE x.source_line_id = l.po_line AND xd.doc_type = 'SINV' AND xd.id <> p_doc.id
        AND xd.status IN ('MATCHED','ON_HOLD','POSTED','PARTIALLY_PAID','PAID');
      v_diff := CASE WHEN l.po_price = 0 THEN 0 ELSE round(abs(l.unit_price - l.po_price) / l.po_price * 100, 2) END;
      v_line := jsonb_build_object('line_no', l.line_no, 'product', l.product_name,
        'po_qty', l.po_qty, 'received_qty', v_qty, 'previously_invoiced', v_sys, 'invoiced_qty', l.quantity,
        'po_price', l.po_price, 'invoice_price', l.unit_price, 'price_diff_pct', v_diff,
        'qty_ok', l.quantity + v_sys <= v_qty, 'price_ok', v_diff <= 2);
      IF NOT (l.quantity + v_sys <= v_qty AND v_diff <= 2) THEN v_ok := false; END IF;
      v_details := v_details || v_line;
    END LOOP;
    UPDATE documents SET data = data || jsonb_build_object('match_result',
      jsonb_build_object('ok', v_ok, 'checked_at', fn_now(), 'lines', v_details, 'first_pass', coalesce(p_doc.data->'match_result', 'null') = 'null'))
    WHERE id = p_doc.id;
    IF NOT v_ok THEN
      v_exc := fn_insert_document('EXC', p_user, 'Lệch đối chiếu 3 chiều ' || p_doc.number,
        jsonb_build_object('exception_type', 'DATA_MISMATCH', 'severity', 'HIGH',
          'description', format('Hóa đơn %s không khớp PO/GRN (SL lệch 0, giá lệch ≤ 2%%). Chi tiết: %s', p_doc.number, v_details::text),
          'affected_document_id', p_doc.id, 'affected_document_number', p_doc.number),
        p_doc.id, 'EXCEPTION', 0, p_doc.cost_center_id);
      RETURN jsonb_build_object('status', 'ON_HOLD',
        'message', format('Lệch 3 chiều — hóa đơn bị tạm giữ, đã tạo ngoại lệ %s', v_exc.number));
    END IF;
    v_msg := 'Khớp 3 chiều PO ↔ GRN ↔ Hóa đơn';

  ELSIF v_key = 'SINV:post' THEN
    v_parent := fn_parent(p_doc.id, 'PO');
    SELECT coalesce(sum(il.quantity * pl.unit_price), 0) INTO v_acc
    FROM document_lines il JOIN document_lines pl ON pl.id = il.source_line_id WHERE il.document_id = p_doc.id;
    v_acc := round(v_acc, 2);
    PERFORM fn_gl(p_doc, v_today, '3388', v_acc, 0, p_doc.partner_id, 'Đối trừ hàng về chưa có hóa đơn', p_user);
    v_diff := p_doc.amount - v_acc;
    IF v_diff > 0 THEN PERFORM fn_gl(p_doc, v_today, '632', v_diff, 0, p_doc.partner_id, 'Chênh lệch giá hóa đơn', p_user);
    ELSIF v_diff < 0 THEN PERFORM fn_gl(p_doc, v_today, '632', 0, -v_diff, p_doc.partner_id, 'Chênh lệch giá hóa đơn', p_user);
    END IF;
    PERFORM fn_gl(p_doc, v_today, '331', 0, p_doc.amount, p_doc.partner_id, 'Công nợ NCC ' || p_doc.number, p_user);
    PERFORM fn_gl_assert_balanced(p_doc.id);
    FOR r IN SELECT DISTINCT budget_id FROM budget_usage WHERE document_id = v_parent.id AND usage_type = 'COMMITTED' LOOP
      INSERT INTO budget_usage (budget_id, document_id, usage_type, amount) VALUES (r.budget_id, p_doc.id, 'COMMITTED', -v_acc);
      INSERT INTO budget_usage (budget_id, document_id, usage_type, amount) VALUES (r.budget_id, p_doc.id, 'ACTUAL', p_doc.amount);
    END LOOP;
    UPDATE documents SET due_date = v_today + coalesce((SELECT payment_terms_days FROM partners WHERE id = p_doc.partner_id), 30),
                         data = data || jsonb_build_object('paid_amount', 0, 'outstanding', p_doc.amount)
    WHERE id = p_doc.id;

  -- ---------------- PAYMENTS / RECEIPTS ----------------
  ELSIF v_key = 'PMT:execute' THEN
    v_parent := fn_parent(p_doc.id, NULL);
    v_k := CASE v_parent.doc_type WHEN 'PAYROLL' THEN '334' ELSE '331' END;
    PERFORM fn_gl(p_doc, v_today, v_k, p_doc.amount, 0, p_doc.partner_id, 'Chi trả ' || v_parent.number, p_user);
    PERFORM fn_gl(p_doc, v_today, '112', 0, p_doc.amount, p_doc.partner_id, 'Chi tiền ' || p_doc.number, p_user);
    UPDATE documents SET data = data || jsonb_build_object('paid_at', fn_now()) WHERE id = p_doc.id;
    -- settlement roll-up runs in fn_after_effects once this payment is PAID
    v_msg := 'Đã chi ' || fn_money(p_doc.amount);

  ELSIF v_key = 'RCPT:receive' THEN
    v_parent := fn_parent(p_doc.id, 'INV');
    PERFORM fn_gl(p_doc, v_today, '112', p_doc.amount, 0, p_doc.partner_id, 'Thu tiền ' || p_doc.number, p_user);
    PERFORM fn_gl(p_doc, v_today, '131', 0, p_doc.amount, p_doc.partner_id, 'Thu nợ ' || v_parent.number, p_user);
    v_msg := 'Đã thu ' || fn_money(p_doc.amount);

  -- ---------------- SALES ----------------
  ELSIF v_key = 'SO:confirm' THEN
    IF fn_check_stock(p_doc) IS NOT NULL THEN
      UPDATE documents SET data = data || jsonb_build_object('backorder', true) WHERE id = p_doc.id;
      v_msg := 'Đơn được xác nhận dạng backorder (chờ sản xuất/nhập hàng)';
    END IF;

  ELSIF v_key = 'DN:ship' THEN
    v_parent := fn_parent(p_doc.id, 'SO');
    FOR l IN
      SELECT dl.*, p.inventory_account, p.product_type FROM document_lines dl JOIN products p ON p.id = dl.product_id
      WHERE dl.document_id = p_doc.id ORDER BY dl.line_no
    LOOP
      IF l.product_type <> 'SERVICE' THEN
        v_cost := fn_stock_out(p_doc.id, l.id, l.product_id, p_doc.warehouse_id, l.quantity, 'DN_OUT', p_user);
        v_accounts := jsonb_set(v_accounts, ARRAY[l.inventory_account], to_jsonb(coalesce((v_accounts->>l.inventory_account)::numeric, 0) + v_cost));
        v_total := v_total + v_cost;
      END IF;
    END LOOP;
    PERFORM fn_gl(p_doc, v_today, '632', v_total, 0, p_doc.partner_id, 'Giá vốn ' || p_doc.number, p_user);
    FOR v_k IN SELECT jsonb_object_keys(v_accounts) LOOP
      PERFORM fn_gl(p_doc, v_today, v_k, 0, (v_accounts->>v_k)::numeric, p_doc.partner_id, 'Xuất kho ' || p_doc.number, p_user);
    END LOOP;
    UPDATE documents SET data = data || jsonb_build_object('cogs', v_total, 'shipped_at', fn_now()) WHERE id = p_doc.id;

  ELSIF v_key = 'INV:post' THEN
    PERFORM fn_gl(p_doc, v_today, '131', p_doc.amount, 0, p_doc.partner_id, 'Phải thu ' || p_doc.number, p_user);
    PERFORM fn_gl(p_doc, v_today, '511', 0, p_doc.amount, p_doc.partner_id, 'Doanh thu ' || p_doc.number, p_user);
    UPDATE documents SET due_date = v_today + coalesce((SELECT payment_terms_days FROM partners WHERE id = p_doc.partner_id), 30),
                         data = data || jsonb_build_object('paid_amount', 0, 'outstanding', p_doc.amount)
    WHERE id = p_doc.id;

  -- ---------------- INVENTORY ----------------
  ELSIF v_key = 'ST:dispatch' THEN
    FOR l IN SELECT * FROM document_lines WHERE document_id = p_doc.id ORDER BY line_no LOOP
      PERFORM fn_stock_out(p_doc.id, l.id, l.product_id, p_doc.warehouse_id, l.quantity, 'ST_OUT', p_user);
    END LOOP;

  ELSIF v_key = 'ST:receive' THEN
    FOR m IN SELECT * FROM stock_moves WHERE document_id = p_doc.id AND move_type = 'ST_OUT' ORDER BY created_at, id LOOP
      PERFORM fn_stock_in(p_doc.id, m.line_id, m.product_id, p_doc.to_warehouse_id, -m.qty, m.unit_cost, 'ST_IN', m.id, p_user);
    END LOOP;

  ELSIF v_key = 'ADJ:post' THEN
    FOR l IN
      SELECT dl.*, p.inventory_account, p.standard_cost, p.name FROM document_lines dl JOIN products p ON p.id = dl.product_id
      WHERE dl.document_id = p_doc.id ORDER BY dl.line_no
    LOOP
      v_sys := fn_on_hand(l.product_id, p_doc.warehouse_id);
      v_diff := l.quantity - v_sys;
      IF v_diff > 0 THEN
        v_cost := coalesce(nullif(l.unit_price, 0),
          (SELECT unit_cost FROM stock_moves WHERE product_id = l.product_id AND qty > 0 ORDER BY created_at DESC LIMIT 1),
          l.standard_cost, 0);
        PERFORM fn_stock_in(p_doc.id, l.id, l.product_id, p_doc.warehouse_id, v_diff, v_cost, 'ADJ_IN', NULL, p_user);
        v_amt := round(v_diff * v_cost, 2);
        PERFORM fn_gl(p_doc, v_today, l.inventory_account, v_amt, 0, NULL, 'Thừa kiểm kê ' || l.name, p_user);
        PERFORM fn_gl(p_doc, v_today, CASE WHEN coalesce((p_doc.data->>'opening')::boolean, false) THEN '411' ELSE '711' END,
                      0, v_amt, NULL, 'Thừa kiểm kê ' || l.name, p_user);
        v_total := v_total + v_amt;
      ELSIF v_diff < 0 THEN
        v_cost := fn_stock_out(p_doc.id, l.id, l.product_id, p_doc.warehouse_id, -v_diff, 'ADJ_OUT', p_user);
        PERFORM fn_gl(p_doc, v_today, '811', v_cost, 0, NULL, 'Thiếu kiểm kê ' || l.name, p_user);
        PERFORM fn_gl(p_doc, v_today, l.inventory_account, 0, v_cost, NULL, 'Thiếu kiểm kê ' || l.name, p_user);
        v_total := v_total - v_cost;
      END IF;
      UPDATE document_lines SET data = data || jsonb_build_object('system_qty_at_post', v_sys, 'diff', v_diff) WHERE id = l.id;
    END LOOP;
    UPDATE documents SET amount = v_total WHERE id = p_doc.id;

  -- ---------------- PRODUCTION ----------------
  ELSIF v_key = 'WO:issue_material' THEN
    FOR l IN
      SELECT dl.*, p.inventory_account FROM document_lines dl JOIN products p ON p.id = dl.product_id
      WHERE dl.document_id = p_doc.id ORDER BY dl.line_no
    LOOP
      v_cost := fn_stock_out(p_doc.id, l.id, l.product_id, p_doc.warehouse_id, l.quantity, 'WO_ISSUE', p_user);
      PERFORM fn_gl(p_doc, v_today, l.inventory_account, 0, v_cost, NULL, 'Xuất vật tư ' || p_doc.number, p_user);
      v_total := v_total + v_cost;
    END LOOP;
    PERFORM fn_gl(p_doc, v_today, '154', v_total, 0, NULL, 'Chi phí NVL ' || p_doc.number, p_user);
    UPDATE documents SET data = data || jsonb_build_object('material_cost', v_total) WHERE id = p_doc.id;

  ELSIF v_key = 'WO:qc_pass' THEN
    v_qty := coalesce(nullif(p_payload->>'completed_qty', '')::numeric, (p_doc.data->>'planned_qty')::numeric);
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Số lượng hoàn thành phải > 0'; END IF;
    v_total := coalesce((p_doc.data->>'material_cost')::numeric, 0);
    PERFORM fn_stock_in(p_doc.id, NULL, p_doc.product_id, p_doc.warehouse_id, v_qty, round(v_total / v_qty, 2), 'WO_OUTPUT', NULL, p_user);
    PERFORM fn_gl(p_doc, v_today, '155', v_total, 0, NULL, 'Nhập kho thành phẩm ' || p_doc.number, p_user);
    PERFORM fn_gl(p_doc, v_today, '154', 0, v_total, NULL, 'Kết chuyển giá thành ' || p_doc.number, p_user);
    UPDATE documents SET amount = v_total,
      data = data || jsonb_build_object('completed_qty', v_qty, 'unit_cost', round(v_total / v_qty, 2), 'completed_at', fn_now())
    WHERE id = p_doc.id;

  ELSIF v_key = 'WO:qc_fail' THEN
    UPDATE documents SET data = data || jsonb_build_object('qc_fail_count', coalesce((data->>'qc_fail_count')::int, 0) + 1)
    WHERE id = p_doc.id;

  -- ---------------- HR ----------------
  ELSIF v_key = 'HIRE:onboard' THEN
    SELECT * INTO v_dept FROM departments WHERE id = coalesce((p_doc.data->>'department_id')::uuid, p_doc.department_id);
    SELECT 'NV' || lpad((count(*) + 1)::text, 3, '0') INTO v_emp_code FROM employees;
    INSERT INTO employees (code, full_name, department_id, branch_id, position, base_salary, allowance, start_date, source_document_id)
    VALUES (v_emp_code, p_doc.data->>'full_name', v_dept.id, v_dept.branch_id, p_doc.data->>'position',
            coalesce((p_doc.data->>'base_salary')::numeric, 0), coalesce((p_doc.data->>'allowance')::numeric, 0),
            coalesce((p_doc.data->>'start_date')::date, v_today), p_doc.id)
    RETURNING id INTO v_agent;
    UPDATE documents SET employee_id = v_agent, data = data || jsonb_build_object('employee_code', v_emp_code) WHERE id = p_doc.id;
    v_msg := format('Đã tạo hồ sơ nhân viên %s', v_emp_code);

  ELSIF v_key = 'PAYROLL:post' THEN
    PERFORM fn_gl(p_doc, v_today, '642', (p_doc.data->>'total_gross')::numeric, 0, NULL, 'Chi phí lương ' || (p_doc.data->>'period'), p_user);
    PERFORM fn_gl(p_doc, v_today, '3383', 0, (p_doc.data->>'total_insurance')::numeric, NULL, 'BHXH người lao động', p_user);
    PERFORM fn_gl(p_doc, v_today, '3335', 0, (p_doc.data->>'total_pit')::numeric, NULL, 'Thuế TNCN', p_user);
    PERFORM fn_gl(p_doc, v_today, '334', 0, p_doc.amount, NULL, 'Lương phải trả ' || (p_doc.data->>'period'), p_user);
    PERFORM fn_gl_assert_balanced(p_doc.id);

  -- ---------------- FINANCE ----------------
  ELSIF v_key = 'JV:post' THEN
    FOR l IN SELECT * FROM document_lines WHERE document_id = p_doc.id ORDER BY line_no LOOP
      PERFORM fn_gl(p_doc, p_doc.doc_date, l.account_code, l.debit, l.credit,
                    coalesce(nullif(l.data->>'partner_id', '')::uuid, p_doc.partner_id), coalesce(l.description, p_doc.title), p_user);
    END LOOP;
    PERFORM fn_gl_assert_balanced(p_doc.id);
    IF p_doc.data ? 'depreciation_period' THEN
      FOR r IN SELECT (x->>'asset_id')::uuid AS asset_id, (x->>'amount')::numeric AS amount
               FROM jsonb_array_elements(p_doc.data->'assets') x LOOP
        UPDATE documents SET data = data || jsonb_build_object(
          'accumulated_depreciation', coalesce((data->>'accumulated_depreciation')::numeric, 0) + r.amount,
          'last_depreciation_period', p_doc.data->>'depreciation_period')
        WHERE id = r.asset_id;
      END LOOP;
    END IF;

  ELSIF v_key = 'JV:reverse' THEN
    FOR r IN SELECT * FROM gl_entries WHERE document_id = p_doc.id ORDER BY created_at LOOP
      PERFORM fn_gl(p_doc, v_today, r.account_code, r.credit, r.debit, r.partner_id, 'Đảo: ' || r.description, p_user);
    END LOOP;

  ELSIF v_key = 'BANKREC:match' THEN
    FOR l IN SELECT * FROM document_lines WHERE document_id = p_doc.id ORDER BY line_no LOOP
      SELECT d.id, d.number INTO r FROM documents d
      WHERE ((l.amount < 0 AND d.doc_type = 'PMT' AND d.status IN ('PAID','AUDITED') AND d.amount = -l.amount)
          OR (l.amount > 0 AND d.doc_type = 'RCPT' AND d.status IN ('RECEIVED','AUDITED') AND d.amount = l.amount))
        AND NOT EXISTS (SELECT 1 FROM document_lines x JOIN documents xd ON xd.id = x.document_id
                        WHERE xd.doc_type = 'BANKREC' AND x.id <> l.id AND x.data->>'matched_document_id' = d.id::text)
      ORDER BY d.updated_at LIMIT 1;
      IF r.id IS NOT NULL THEN
        UPDATE document_lines SET data = data || jsonb_build_object('matched_document_id', r.id, 'matched_number', r.number) WHERE id = l.id;
        v_n := v_n + 1;
      END IF;
    END LOOP;
    v_msg := format('Khớp %s giao dịch', v_n);

  ELSIF v_key = 'BANKREC:unmatch' THEN
    UPDATE document_lines SET data = data - 'matched_document_id' - 'matched_number' WHERE document_id = p_doc.id;

  -- ---------------- ASSETS ----------------
  ELSIF v_key = 'ASSET:capitalize' THEN
    v_acc := coalesce((p_doc.data->>'opening_accumulated')::numeric, 0);
    PERFORM fn_gl(p_doc, v_today, '211', p_doc.amount, 0, p_doc.partner_id, 'Ghi tăng TSCĐ ' || coalesce(p_doc.title, ''), p_user);
    IF coalesce((p_doc.data->>'opening')::boolean, false) THEN
      PERFORM fn_gl(p_doc, v_today, '214', 0, v_acc, NULL, 'Hao mòn lũy kế đầu kỳ', p_user);
      PERFORM fn_gl(p_doc, v_today, '411', 0, p_doc.amount - v_acc, NULL, 'Vốn góp bằng tài sản', p_user);
    ELSE
      PERFORM fn_gl(p_doc, v_today, '331', 0, p_doc.amount, p_doc.partner_id, 'Phải trả mua TSCĐ', p_user);
    END IF;
    UPDATE documents SET data = data || jsonb_build_object('capitalized_on', v_today, 'accumulated_depreciation', v_acc,
      'paid_amount', CASE WHEN coalesce((p_doc.data->>'opening')::boolean, false) THEN p_doc.amount ELSE 0 END)
    WHERE id = p_doc.id;

  ELSIF v_key = 'ASSET:dispose' THEN
    v_acc := coalesce((p_doc.data->>'accumulated_depreciation')::numeric, 0);
    PERFORM fn_gl(p_doc, v_today, '214', v_acc, 0, NULL, 'Xóa hao mòn khi thanh lý', p_user);
    PERFORM fn_gl(p_doc, v_today, '811', p_doc.amount - v_acc, 0, NULL, 'Giá trị còn lại khi thanh lý', p_user);
    PERFORM fn_gl(p_doc, v_today, '211', 0, p_doc.amount, NULL, 'Ghi giảm TSCĐ', p_user);
    UPDATE documents SET data = data || jsonb_build_object('disposed_on', v_today) WHERE id = p_doc.id;

  -- ---------------- CUSTOMER SERVICE ----------------
  ELSIF v_key IN ('TICKET:assign','TICKET:reassign') THEN
    v_agent := nullif(p_payload->>'owner_id', '')::uuid;
    IF v_agent IS NULL OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_agent AND role_code = 'CS_AGENT') THEN
      RAISE EXCEPTION 'Cần chọn nhân viên CSKH (CS_AGENT) để phân công';
    END IF;
    UPDATE documents SET owner_id = v_agent WHERE id = p_doc.id;

  ELSIF v_key = 'TICKET:resolve' THEN
    UPDATE documents SET data = data || jsonb_build_object(
      'resolution', coalesce(p_payload->>'resolution', data->>'resolution'),
      'resolved_at', fn_now(), 'sla_met', fn_now() <= (data->>'sla_due_at')::timestamptz)
    WHERE id = p_doc.id;

  ELSIF v_key = 'TICKET:close' THEN
    UPDATE documents SET data = data || jsonb_build_object('csat', nullif(p_payload->>'csat', '')::int, 'closed_at', fn_now())
    WHERE id = p_doc.id;

  -- ---------------- CONTROLS / ADMIN ----------------
  ELSIF v_key = 'EXC:resolve' THEN
    UPDATE documents SET data = data || jsonb_strip_nulls(jsonb_build_object(
      'resolution', p_payload->>'resolution', 'root_cause', p_payload->>'root_cause',
      'preventive_action', p_payload->>'preventive_action', 'resolved_at', fn_now()))
    WHERE id = p_doc.id;

  ELSIF v_key = 'MDC:approve' THEN
    IF p_doc.data->>'entity' = 'PARTNER' THEN
      IF p_doc.data->>'op' = 'CREATE' THEN
        INSERT INTO partners (code, name, partner_type, tax_code, address, phone, payment_terms_days, credit_limit)
        SELECT x->>'code', x->>'name', coalesce(x->>'partner_type', 'SUPPLIER'), x->>'tax_code', x->>'address', x->>'phone',
               coalesce((x->>'payment_terms_days')::int, 30), coalesce((x->>'credit_limit')::numeric, 0)
        FROM (SELECT p_doc.data->'payload' AS x) s;
      ELSE
        UPDATE partners SET
          name = coalesce(p_doc.data->'payload'->>'name', name),
          address = coalesce(p_doc.data->'payload'->>'address', address),
          phone = coalesce(p_doc.data->'payload'->>'phone', phone),
          payment_terms_days = coalesce((p_doc.data->'payload'->>'payment_terms_days')::int, payment_terms_days),
          credit_limit = coalesce((p_doc.data->'payload'->>'credit_limit')::numeric, credit_limit),
          status = coalesce(p_doc.data->'payload'->>'status', status)
        WHERE id = (p_doc.data->>'target_id')::uuid;
      END IF;
    ELSIF p_doc.data->>'entity' = 'PRODUCT' THEN
      IF p_doc.data->>'op' = 'CREATE' THEN
        INSERT INTO products (code, name, unit, product_type, inventory_account, standard_cost, sale_price)
        SELECT x->>'code', x->>'name', coalesce(x->>'unit', 'cái'), coalesce(x->>'product_type', 'GOODS'),
               coalesce(x->>'inventory_account', '156'), coalesce((x->>'standard_cost')::numeric, 0), coalesce((x->>'sale_price')::numeric, 0)
        FROM (SELECT p_doc.data->'payload' AS x) s;
      ELSE
        UPDATE products SET
          name = coalesce(p_doc.data->'payload'->>'name', name),
          standard_cost = coalesce((p_doc.data->'payload'->>'standard_cost')::numeric, standard_cost),
          sale_price = coalesce((p_doc.data->'payload'->>'sale_price')::numeric, sale_price),
          status = coalesce(p_doc.data->'payload'->>'status', status)
        WHERE id = (p_doc.data->>'target_id')::uuid;
      END IF;
    END IF;
    v_msg := 'Đã áp dụng thay đổi dữ liệu chủ';

  ELSIF v_key = 'ACCESS_REVIEW:approve' THEN
    FOR l IN SELECT * FROM document_lines WHERE document_id = p_doc.id AND data->>'decision' = 'REVOKE' LOOP
      DELETE FROM user_roles WHERE user_id = (l.data->>'user_id')::uuid AND role_code = l.data->>'role_code';
      v_n := v_n + 1;
    END LOOP;
    UPDATE documents SET data = data || jsonb_build_object('revoked_count', v_n) WHERE id = p_doc.id;
    v_msg := format('Đã thu hồi %s quyền', v_n);
  END IF;

  RETURN jsonb_build_object('status', NULL, 'message', v_msg);
END $$;

-- post-transition roll-ups that need the new status already stored
CREATE OR REPLACE FUNCTION fn_after_effects(p_doc_id uuid, p_action text, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d documents; v_parent documents;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_doc_id;
  IF d.doc_type = 'PMT' AND p_action = 'execute' THEN
    v_parent := fn_parent(d.id, NULL);
    PERFORM fn_rollup_settlement(v_parent.id, p_user);
  ELSIF d.doc_type = 'RCPT' AND p_action = 'receive' THEN
    v_parent := fn_parent(d.id, 'INV');
    PERFORM fn_rollup_settlement(v_parent.id, p_user);
  ELSIF d.doc_type = 'DN' AND p_action = 'ship' THEN
    v_parent := fn_parent(d.id, 'SO');
    PERFORM fn_rollup_so(v_parent.id, p_user);
  ELSIF d.doc_type = 'INV' AND p_action = 'post' THEN
    v_parent := fn_parent(d.id, 'SO');
    PERFORM fn_rollup_so(v_parent.id, p_user);
  ELSIF d.doc_type = 'SINV' AND p_action = 'post' THEN
    v_parent := fn_parent(d.id, 'PO');
    PERFORM fn_rollup_po(v_parent.id, p_user);
  ELSIF d.doc_type = 'GRN' AND p_action = 'store' THEN
    v_parent := fn_parent(d.id, 'PO');
    PERFORM fn_rollup_po(v_parent.id, p_user);
  END IF;
END $$;

-- is there anything left to derive from the parent? (quantities / open amount)
CREATE OR REPLACE FUNCTION fn_child_remaining(p_doc documents, p_child text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_doc.doc_type || '>' || p_child
    WHEN 'PR>PO'   THEN EXISTS (SELECT 1 FROM document_lines l WHERE l.document_id = p_doc.id AND l.quantity > fn_consumed(l.id, 'PO'))
    WHEN 'PO>GRN'  THEN EXISTS (SELECT 1 FROM document_lines l WHERE l.document_id = p_doc.id AND l.quantity > fn_consumed(l.id, 'GRN'))
    WHEN 'PO>SINV' THEN EXISTS (SELECT 1 FROM document_lines l WHERE l.document_id = p_doc.id AND fn_consumed(l.id, 'GRN', ARRAY['STORED']) > fn_consumed(l.id, 'SINV'))
    WHEN 'QUOT>SO' THEN EXISTS (SELECT 1 FROM document_lines l WHERE l.document_id = p_doc.id AND l.quantity > fn_consumed(l.id, 'SO'))
    WHEN 'SO>DN'   THEN EXISTS (SELECT 1 FROM document_lines l WHERE l.document_id = p_doc.id AND l.quantity > fn_consumed(l.id, 'DN'))
    WHEN 'SO>INV'  THEN EXISTS (SELECT 1 FROM document_lines l WHERE l.document_id = p_doc.id AND fn_consumed(l.id, 'DN', ARRAY['SHIPPED']) > fn_consumed(l.id, 'INV'))
    WHEN 'SINV>PMT' THEN p_doc.amount > fn_children_amount(p_doc.id, 'PMT')
    WHEN 'PAYROLL>PMT' THEN p_doc.amount > fn_children_amount(p_doc.id, 'PMT')
    WHEN 'ASSET>PMT' THEN NOT coalesce((p_doc.data->>'opening')::boolean, false) AND p_doc.amount > fn_children_amount(p_doc.id, 'PMT')
    WHEN 'INV>RCPT' THEN p_doc.amount > fn_children_amount(p_doc.id, 'RCPT')
    ELSE true END
$$;

-- ============================================================
-- AVAILABLE ACTIONS for a user on a document
-- ============================================================
CREATE OR REPLACE FUNCTION fn_available_actions(p_doc documents, p_user uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t state_transitions; r doc_child_rules; v_res jsonb := '[]'::jsonb; v_conflict jsonb;
BEGIN
  FOR t IN SELECT * FROM state_transitions WHERE doc_type = p_doc.doc_type AND from_status = p_doc.status
           AND NOT system_only ORDER BY sort LOOP
    IF fn_doc_in_scope(p_user, p_doc, coalesce(t.permission_resource, p_doc.doc_type), t.permission_action) THEN
      v_conflict := fn_sod_find_conflict(p_doc.id, p_user, t.sod_role);
      v_res := v_res || jsonb_build_object('kind', 'transition', 'action', t.action, 'label', t.label,
        'to_status', t.to_status, 'style', t.style, 'sod_role', t.sod_role, 'conditions', to_jsonb(t.conditions),
        'sod_conflict', v_conflict);
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM doc_child_rules WHERE parent_type = p_doc.doc_type AND p_doc.status = ANY(parent_statuses) LOOP
    IF fn_perm_scope(p_user, r.child_type, 'CREATE') > 0 AND fn_child_remaining(p_doc, r.child_type) THEN
      v_res := v_res || jsonb_build_object('kind', 'create', 'child_type', r.child_type, 'label', r.label, 'style', 'primary',
        'sod_conflict', fn_sod_find_conflict(p_doc.id, p_user, (SELECT create_sod_role FROM doc_types WHERE code = r.child_type)));
    END IF;
  END LOOP;
  RETURN v_res;
END $$;

-- ============================================================
-- API: TRANSITION (NT3: state is a contract)
-- ============================================================
CREATE OR REPLACE FUNCTION api_transition(p_doc_id uuid, p_action text, p_comment text DEFAULT NULL,
                                          p_expected_version int DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user();
  v_doc documents; v_t state_transitions; v_err text; v_res jsonb; v_to text; c text;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập hoặc tài khoản bị khóa'); END IF;
  p_payload := coalesce(p_payload, '{}'::jsonb);

  SELECT * INTO v_doc FROM documents WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ'); END IF;

  IF NOT fn_doc_in_scope(v_me.id, v_doc, v_doc.doc_type, 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền truy cập chứng từ này');
  END IF;

  -- T2.12 / T5.4 optimistic locking
  IF p_expected_version IS NOT NULL AND v_doc.version <> p_expected_version THEN
    RETURN fn_fail('CONFLICT', format('Chứng từ %s đã được người khác cập nhật (phiên bản %s ≠ %s). Vui lòng tải lại.',
                   v_doc.number, v_doc.version, p_expected_version));
  END IF;

  SELECT * INTO v_t FROM state_transitions
  WHERE doc_type = v_doc.doc_type AND from_status = v_doc.status AND action = p_action AND NOT system_only;
  IF NOT FOUND THEN
    RETURN fn_fail('INVALID_TRANSITION', format('Không thể thực hiện "%s" khi %s đang ở trạng thái %s',
                   p_action, v_doc.number, v_doc.status));
  END IF;

  IF NOT fn_doc_in_scope(v_me.id, v_doc, coalesce(v_t.permission_resource, v_doc.doc_type), v_t.permission_action) THEN
    RETURN fn_fail('FORBIDDEN', format('Bạn không có quyền %s trên %s (phạm vi dữ liệu)', v_t.permission_action,
                   coalesce(v_t.permission_resource, v_doc.doc_type)));
  END IF;

  -- ĐK3: SoD — logged whether passed or blocked
  v_err := fn_sod_enforce(v_doc.id, v_me.id, v_t.sod_role, p_action);
  IF v_err IS NOT NULL THEN RETURN fn_fail('SOD_VIOLATION', v_err); END IF;

  FOREACH c IN ARRAY v_t.conditions LOOP
    v_err := fn_check_condition(v_doc, c, p_payload);
    IF v_err IS NOT NULL THEN RETURN fn_fail('CONDITION_FAILED', v_err, jsonb_build_object('condition', c)); END IF;
  END LOOP;

  BEGIN
    v_res := fn_apply_effects(v_doc, v_t, p_payload, v_me.id);
    v_to := coalesce(v_res->>'status', v_t.to_status);
    UPDATE documents SET status = v_to, version = version + 1, updated_at = fn_now()
    WHERE id = v_doc.id RETURNING * INTO v_doc;
    PERFORM fn_record_action(v_doc.id, p_action, v_t.from_status, v_to, v_me.id, v_t.sod_role, nullif(trim(p_comment), ''));
    PERFORM fn_after_status_change(v_doc, v_me.id);
    PERFORM fn_after_effects(v_doc.id, p_action, v_me.id);
  EXCEPTION WHEN OTHERS THEN
    -- T5.5: everything inside this block is rolled back
    RETURN fn_fail('BUSINESS_RULE', SQLERRM);
  END;

  SELECT * INTO v_doc FROM documents WHERE id = p_doc_id;
  RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status,
                            'version', v_doc.version, 'message', v_res->>'message');
END $$;

-- ============================================================
-- API: CREATE / UPDATE DOCUMENTS
-- ============================================================
CREATE OR REPLACE FUNCTION fn_build_lines(p_doc documents, p_parent documents, p_lines jsonb) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line jsonb; v_src document_lines; v_prod products; v_bom boms; bl record;
  v_no int := 0; v_qty numeric; v_price numeric; v_rem numeric; v_amt numeric; v_total numeric := 0;
  v_debit numeric; v_credit numeric; v_data jsonb; v_planned numeric; v_pair text;
BEGIN
  -- WO: materials are derived from the BOM
  IF p_doc.doc_type = 'WO' THEN
    SELECT * INTO v_bom FROM boms WHERE product_id = p_doc.product_id AND status = 'ACTIVE' LIMIT 1;
    IF v_bom.id IS NULL THEN RAISE EXCEPTION 'Sản phẩm chưa có định mức (BOM) hiệu lực'; END IF;
    v_planned := (p_doc.data->>'planned_qty')::numeric;
    IF v_planned IS NULL OR v_planned <= 0 THEN RAISE EXCEPTION 'Số lượng kế hoạch phải > 0'; END IF;
    FOR bl IN SELECT b.*, p.standard_cost, p.name FROM bom_lines b JOIN products p ON p.id = b.product_id WHERE b.bom_id = v_bom.id LOOP
      v_no := v_no + 1;
      v_qty := round(bl.quantity * v_planned / v_bom.output_qty, 4);
      INSERT INTO document_lines (document_id, line_no, product_id, description, quantity, unit_price, amount, data)
      VALUES (p_doc.id, v_no, bl.product_id, bl.name, v_qty, bl.standard_cost, round(v_qty * bl.standard_cost, 2),
              jsonb_build_object('bom_id', v_bom.id, 'per_unit', bl.quantity / v_bom.output_qty));
    END LOOP;
    UPDATE documents SET data = data || jsonb_build_object('bom_code', v_bom.code) WHERE id = p_doc.id;
    RETURN 0;
  END IF;

  -- default: copy remaining lines from the parent document
  IF (p_lines IS NULL OR jsonb_array_length(p_lines) = 0) AND p_parent.id IS NOT NULL
     AND p_doc.doc_type IN ('PO','GRN','SINV','SO','DN','INV') THEN
    SELECT jsonb_agg(jsonb_build_object('source_line_id', pl.id, 'quantity',
      CASE p_parent.doc_type || '>' || p_doc.doc_type
        WHEN 'PR>PO'    THEN pl.quantity - fn_consumed(pl.id, 'PO')
        WHEN 'PO>GRN'   THEN pl.quantity - fn_consumed(pl.id, 'GRN')
        WHEN 'PO>SINV'  THEN fn_consumed(pl.id, 'GRN', ARRAY['STORED']) - fn_consumed(pl.id, 'SINV')
        WHEN 'QUOT>SO'  THEN pl.quantity - fn_consumed(pl.id, 'SO')
        WHEN 'SO>DN'    THEN pl.quantity - fn_consumed(pl.id, 'DN')
        WHEN 'SO>INV'   THEN fn_consumed(pl.id, 'DN', ARRAY['SHIPPED']) - fn_consumed(pl.id, 'INV')
      END) ORDER BY pl.line_no)
    INTO p_lines FROM document_lines pl WHERE pl.document_id = p_parent.id;
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO p_lines FROM jsonb_array_elements(p_lines) x WHERE (x->>'quantity')::numeric > 0;
    IF jsonb_array_length(p_lines) = 0 THEN
      RAISE EXCEPTION 'Chứng từ gốc %: không còn số lượng để lập %', p_parent.number, p_doc.doc_type;
    END IF;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) LOOP
    v_no := v_no + 1;
    v_data := coalesce(v_line->'data', '{}'::jsonb);
    v_qty := coalesce(nullif(v_line->>'quantity', '')::numeric, 0);
    v_price := nullif(v_line->>'unit_price', '')::numeric;
    v_debit := coalesce(nullif(v_line->>'debit', '')::numeric, 0);
    v_credit := coalesce(nullif(v_line->>'credit', '')::numeric, 0);

    IF p_doc.doc_type = 'JV' THEN
      IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = v_line->>'account_code') THEN
        RAISE EXCEPTION 'Dòng %: tài khoản "%" không tồn tại', v_no, v_line->>'account_code';
      END IF;
      IF (v_debit > 0 AND v_credit > 0) OR (v_debit <= 0 AND v_credit <= 0) THEN
        RAISE EXCEPTION 'Dòng %: phải nhập đúng một trong Nợ hoặc Có (> 0)', v_no;
      END IF;
      INSERT INTO document_lines (document_id, line_no, account_code, description, debit, credit, amount, data)
      VALUES (p_doc.id, v_no, v_line->>'account_code', v_line->>'description', v_debit, v_credit, v_debit + v_credit, v_data);
      v_total := v_total + v_debit;
      CONTINUE;
    END IF;

    IF p_doc.doc_type IN ('BUDGET','BANKREC','PAYROLL') THEN
      v_amt := coalesce(nullif(v_line->>'amount', '')::numeric, 0);
      IF p_doc.doc_type = 'BUDGET' AND (v_amt <= 0 OR NOT EXISTS (SELECT 1 FROM accounts WHERE code = v_line->>'account_code')) THEN
        RAISE EXCEPTION 'Dòng %: ngân sách cần tài khoản chi phí hợp lệ và số tiền > 0', v_no;
      END IF;
      IF p_doc.doc_type = 'BANKREC' AND v_amt = 0 THEN
        RAISE EXCEPTION 'Dòng %: số tiền sao kê phải khác 0', v_no;
      END IF;
      INSERT INTO document_lines (document_id, line_no, account_code, description, quantity, unit_price, amount, data)
      VALUES (p_doc.id, v_no, nullif(v_line->>'account_code', ''), v_line->>'description', 1, v_amt, v_amt, v_data);
      v_total := v_total + v_amt;
      CONTINUE;
    END IF;

    -- product lines
    IF nullif(v_line->>'source_line_id', '') IS NOT NULL THEN
      SELECT * INTO v_src FROM document_lines WHERE id = (v_line->>'source_line_id')::uuid;
      IF v_src.id IS NULL OR v_src.document_id <> p_parent.id THEN
        RAISE EXCEPTION 'Dòng %: không thuộc chứng từ gốc %', v_no, p_parent.number;
      END IF;
      v_pair := p_parent.doc_type || '>' || p_doc.doc_type;
      v_rem := CASE v_pair
        WHEN 'PR>PO'   THEN v_src.quantity - fn_consumed(v_src.id, 'PO')
        WHEN 'PO>GRN'  THEN v_src.quantity - fn_consumed(v_src.id, 'GRN')
        WHEN 'PO>SINV' THEN v_src.quantity - fn_consumed(v_src.id, 'SINV')
        WHEN 'QUOT>SO' THEN v_src.quantity - fn_consumed(v_src.id, 'SO')
        WHEN 'SO>DN'   THEN v_src.quantity - fn_consumed(v_src.id, 'DN')
        WHEN 'SO>INV'  THEN fn_consumed(v_src.id, 'DN', ARRAY['SHIPPED']) - fn_consumed(v_src.id, 'INV')
        ELSE v_src.quantity END;
      IF v_qty <= 0 THEN RAISE EXCEPTION 'Dòng %: số lượng phải > 0', v_no; END IF;
      IF v_qty > v_rem THEN
        RAISE EXCEPTION 'Dòng %: số lượng % vượt quá số lượng còn lại % của %', v_no, v_qty::float8, v_rem::float8, p_parent.number;
      END IF;
      SELECT * INTO v_prod FROM products WHERE id = v_src.product_id;
      -- only supplier invoices / PO from PR may carry a different price
      IF p_doc.doc_type IN ('SINV','PO','SO') AND v_price IS NOT NULL THEN
        NULL;
      ELSE
        v_price := v_src.unit_price;
      END IF;
    ELSE
      IF p_doc.doc_type IN ('GRN','SINV','DN','INV') THEN
        RAISE EXCEPTION 'Dòng %: phải tham chiếu dòng của chứng từ gốc', v_no;
      END IF;
      SELECT * INTO v_prod FROM products WHERE id = nullif(v_line->>'product_id', '')::uuid AND status = 'ACTIVE';
      IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Dòng %: sản phẩm không hợp lệ', v_no; END IF;
      IF p_doc.doc_type = 'ADJ' THEN
        IF v_qty < 0 THEN RAISE EXCEPTION 'Dòng %: số lượng kiểm đếm không được âm', v_no; END IF;
        v_data := v_data || jsonb_build_object('system_qty', fn_on_hand(v_prod.id, p_doc.warehouse_id),
                                               'diff', v_qty - fn_on_hand(v_prod.id, p_doc.warehouse_id));
      ELSIF v_qty <= 0 THEN
        RAISE EXCEPTION 'Dòng %: số lượng phải > 0', v_no;
      END IF;
      v_price := coalesce(v_price, CASE WHEN p_doc.doc_type IN ('QUOT','SO') THEN v_prod.sale_price ELSE v_prod.standard_cost END);
    END IF;
    IF v_price < 0 THEN RAISE EXCEPTION 'Dòng %: đơn giá không được âm', v_no; END IF;
    v_amt := round(v_qty * coalesce(v_price, 0), 2);
    INSERT INTO document_lines (document_id, line_no, product_id, description, quantity, unit_price, amount, source_line_id, data)
    VALUES (p_doc.id, v_no, v_prod.id, coalesce(v_line->>'description', v_prod.name), v_qty, coalesce(v_price, 0), v_amt, v_src.id, v_data);
    v_total := v_total + v_amt;
    v_src := NULL;
  END LOOP;

  IF v_no = 0 AND p_doc.doc_type NOT IN ('PMT','RCPT','ASSET','HIRE','TICKET','EXC','MDC') THEN
    RAISE EXCEPTION 'Chứng từ cần ít nhất một dòng chi tiết';
  END IF;
  RETURN CASE WHEN p_doc.doc_type IN ('ST','ADJ') THEN 0 ELSE v_total END;
END $$;

CREATE OR REPLACE FUNCTION fn_validate_header(p_doc documents, p_parent documents) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ptype text; v_out numeric;
BEGIN
  SELECT partner_type INTO v_ptype FROM partners WHERE id = p_doc.partner_id;
  CASE p_doc.doc_type
  WHEN 'PO' THEN
    IF v_ptype IS NULL OR v_ptype NOT IN ('SUPPLIER','BOTH') THEN RAISE EXCEPTION 'Cần chọn nhà cung cấp'; END IF;
    IF p_doc.warehouse_id IS NULL THEN RAISE EXCEPTION 'Cần chọn kho nhận hàng'; END IF;
  WHEN 'QUOT', 'SO' THEN
    IF v_ptype IS NULL OR v_ptype NOT IN ('CUSTOMER','BOTH') THEN RAISE EXCEPTION 'Cần chọn khách hàng'; END IF;
    IF p_doc.warehouse_id IS NULL THEN RAISE EXCEPTION 'Cần chọn kho xuất hàng'; END IF;
  WHEN 'ST' THEN
    IF p_doc.warehouse_id IS NULL OR p_doc.to_warehouse_id IS NULL OR p_doc.warehouse_id = p_doc.to_warehouse_id THEN
      RAISE EXCEPTION 'Cần chọn kho nguồn và kho đích khác nhau';
    END IF;
  WHEN 'ADJ' THEN
    IF p_doc.warehouse_id IS NULL THEN RAISE EXCEPTION 'Cần chọn kho kiểm kê'; END IF;
  WHEN 'WO' THEN
    IF p_doc.product_id IS NULL OR p_doc.warehouse_id IS NULL THEN RAISE EXCEPTION 'Cần chọn thành phẩm và kho sản xuất'; END IF;
  WHEN 'BUDGET' THEN
    IF (p_doc.data->>'fiscal_year') IS NULL THEN RAISE EXCEPTION 'Cần nhập năm tài chính'; END IF;
    IF EXISTS (SELECT 1 FROM documents WHERE doc_type = 'BUDGET' AND id <> p_doc.id AND cost_center_id = p_doc.cost_center_id
               AND data->>'fiscal_year' = p_doc.data->>'fiscal_year' AND status NOT IN ('CANCELLED','REJECTED','CLOSED')) THEN
      RAISE EXCEPTION 'Bộ phận đã có ngân sách năm %', p_doc.data->>'fiscal_year';
    END IF;
  WHEN 'PMT', 'RCPT' THEN
    IF p_doc.amount <= 0 THEN RAISE EXCEPTION 'Số tiền phải > 0'; END IF;
    v_out := p_parent.amount - fn_children_amount(p_parent.id, p_doc.doc_type) + CASE WHEN EXISTS (
      SELECT 1 FROM document_links WHERE parent_id = p_parent.id AND child_id = p_doc.id) THEN p_doc.amount ELSE 0 END;
    IF p_doc.amount > v_out THEN
      RAISE EXCEPTION 'Số tiền % vượt số còn phải %: %', fn_money(p_doc.amount),
        CASE p_doc.doc_type WHEN 'PMT' THEN 'trả' ELSE 'thu' END, fn_money(v_out);
    END IF;
  WHEN 'ASSET' THEN
    IF coalesce(p_doc.data->>'name', p_doc.title) IS NULL OR p_doc.amount <= 0
       OR coalesce((p_doc.data->>'useful_life_months')::int, 0) <= 0 THEN
      RAISE EXCEPTION 'Tài sản cần tên, nguyên giá > 0 và thời gian khấu hao (tháng) > 0';
    END IF;
  WHEN 'HIRE' THEN
    IF nullif(p_doc.data->>'full_name', '') IS NULL OR (p_doc.data->>'department_id') IS NULL
       OR coalesce((p_doc.data->>'base_salary')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Đề nghị tuyển dụng cần họ tên, phòng ban và lương cơ bản';
    END IF;
  WHEN 'TICKET' THEN
    IF nullif(p_doc.data->>'subject', '') IS NULL THEN RAISE EXCEPTION 'Ticket cần tiêu đề'; END IF;
  WHEN 'EXC' THEN
    IF nullif(p_doc.data->>'description', '') IS NULL OR (p_doc.data->>'exception_type') IS NULL THEN
      RAISE EXCEPTION 'Ngoại lệ cần loại và mô tả';
    END IF;
  WHEN 'MDC' THEN
    IF p_doc.data->>'entity' NOT IN ('PARTNER','PRODUCT') OR p_doc.data->>'op' NOT IN ('CREATE','UPDATE') THEN
      RAISE EXCEPTION 'Yêu cầu thay đổi dữ liệu chủ không hợp lệ';
    END IF;
  ELSE NULL;
  END CASE;
END $$;

CREATE OR REPLACE FUNCTION api_create_document(p_doc_type text, p_header jsonb DEFAULT '{}'::jsonb, p_lines jsonb DEFAULT NULL,
                                               p_parent_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
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
    SELECT * INTO v_doc FROM documents WHERE idempotency_key = p_idempotency_key;
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
    SELECT * INTO v_parent FROM documents WHERE id = p_parent_id;
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
    INSERT INTO documents (doc_type, number, status, title, branch_id, department_id, cost_center_id, partner_id,
                           warehouse_id, to_warehouse_id, product_id, employee_id, doc_date, due_date, amount, data,
                           created_by, idempotency_key, tenant_id)
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

    -- completion of pending handoffs on the parent chain (e.g. PR APPROVED → BUYER)
    IF v_parent.id IS NOT NULL THEN
      UPDATE handoff_records hr SET status = 'COMPLETED', to_user_id = v_me.id, to_department_id = v_me.department_id, completed_at = fn_now()
      WHERE hr.status = 'INITIATED' AND (
        hr.document_id = v_parent.id
        OR (hr.to_role = ANY(fn_user_role_codes(v_me.id)) AND hr.document_id IN (
              SELECT child_id FROM document_links WHERE parent_id = v_parent.id AND child_id <> v_doc.id)));
    END IF;

    PERFORM fn_record_action(v_doc.id, 'create', NULL, v_doc.status, v_me.id, v_dt.create_sod_role, nullif(h->>'comment', ''));
    PERFORM fn_after_status_change(v_doc, v_me.id);

    -- type-specific hooks
    IF p_doc_type = 'PO' AND v_parent.doc_type = 'PR' AND v_parent.status = 'APPROVED' THEN
      PERFORM fn_system_set_status(v_parent.id, 'ORDERED', v_me.id, 'Đã lập ' || v_doc.number);
    ELSIF p_doc_type = 'SO' AND v_parent.doc_type = 'QUOT' THEN
      PERFORM fn_system_set_status(v_parent.id, 'ORDERED', v_me.id, 'Đã lập ' || v_doc.number);
    ELSIF p_doc_type = 'TICKET' THEN
      v_hours := CASE coalesce(v_doc.data->>'priority', 'MEDIUM') WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 24 WHEN 'LOW' THEN 72 ELSE 48 END;
      UPDATE documents SET title = coalesce(title, data->>'subject'),
        due_date = (fn_now() + make_interval(hours => v_hours))::date,
        data = data || jsonb_build_object('priority', coalesce(data->>'priority', 'MEDIUM'), 'sla_hours', v_hours,
                                          'sla_due_at', fn_now() + make_interval(hours => v_hours))
      WHERE id = v_doc.id;
      -- T1.13 auto-assign: CS agent in the same branch with the fewest open tickets
      SELECT u.id INTO v_agent
      FROM app_users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'CS_AGENT'
      WHERE u.status = 'ACTIVE'
      ORDER BY (u.branch_id = v_doc.branch_id) DESC,
               (SELECT count(*) FROM documents t WHERE t.doc_type = 'TICKET' AND t.owner_id = u.id AND t.status NOT IN ('RESOLVED','CLOSED')),
               u.employee_code
      LIMIT 1;
      IF v_agent IS NOT NULL THEN
        UPDATE documents SET owner_id = v_agent WHERE id = v_doc.id;
        PERFORM fn_system_set_status(v_doc.id, 'ASSIGNED', v_me.id,
          'Tự động phân công cho ' || (SELECT full_name FROM app_users WHERE id = v_agent) || ' (ít ticket mở nhất)');
      END IF;
    ELSIF p_doc_type = 'EXC' AND nullif(v_doc.data->>'affected_document_id', '') IS NOT NULL THEN
      SELECT * INTO v_affected FROM documents WHERE id = (v_doc.data->>'affected_document_id')::uuid;
      IF v_affected.id IS NULL THEN RAISE EXCEPTION 'Chứng từ bị ảnh hưởng không tồn tại'; END IF;
      INSERT INTO document_links (parent_id, child_id, link_type) VALUES (v_affected.id, v_doc.id, 'EXCEPTION');
      UPDATE documents SET data = data || jsonb_build_object('affected_document_number', v_affected.number) WHERE id = v_doc.id;
    ELSIF p_doc_type IN ('ASSET','HIRE','MDC','EXC') AND v_doc.title IS NULL THEN
      UPDATE documents SET title = coalesce(data->>'name', data->>'full_name', data->>'description', data->>'subject') WHERE id = v_doc.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN fn_fail('VALIDATION', SQLERRM);
  END;

  SELECT * INTO v_doc FROM documents WHERE id = v_doc.id;
  RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status);
END $$;

-- edit a draft (header + lines); SoD/permissions still apply
CREATE OR REPLACE FUNCTION api_update_document(p_doc_id uuid, p_header jsonb, p_lines jsonb DEFAULT NULL, p_expected_version int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_doc documents; v_dt doc_types; v_parent documents; v_total numeric; h jsonb;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  h := coalesce(p_header, '{}'::jsonb);
  SELECT * INTO v_doc FROM documents WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy chứng từ'); END IF;
  SELECT * INTO v_dt FROM doc_types WHERE code = v_doc.doc_type;
  IF v_doc.status <> v_dt.initial_status THEN
    RETURN fn_fail('INVALID_TRANSITION', format('Chỉ sửa được chứng từ ở trạng thái %s', v_dt.initial_status));
  END IF;
  IF NOT (v_doc.created_by = v_me.id OR fn_doc_in_scope(v_me.id, v_doc, v_doc.doc_type, 'EDIT')) THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền sửa chứng từ này');
  END IF;
  IF p_expected_version IS NOT NULL AND v_doc.version <> p_expected_version THEN
    RETURN fn_fail('CONFLICT', 'Chứng từ đã được cập nhật bởi người khác. Vui lòng tải lại.');
  END IF;
  v_parent := fn_parent(v_doc.id, NULL);
  BEGIN
    UPDATE documents SET
      title = coalesce(nullif(h->>'title', ''), title),
      partner_id = coalesce(nullif(h->>'partner_id', '')::uuid, partner_id),
      warehouse_id = coalesce(nullif(h->>'warehouse_id', '')::uuid, warehouse_id),
      to_warehouse_id = coalesce(nullif(h->>'to_warehouse_id', '')::uuid, to_warehouse_id),
      doc_date = coalesce(nullif(h->>'doc_date', '')::date, doc_date),
      due_date = coalesce(nullif(h->>'due_date', '')::date, due_date),
      amount = coalesce(nullif(h->>'amount', '')::numeric, amount),
      data = data || coalesce(h->'data', '{}'::jsonb),
      version = version + 1, updated_at = fn_now()
    WHERE id = v_doc.id RETURNING * INTO v_doc;
    PERFORM fn_validate_header(v_doc, v_parent);
    IF p_lines IS NOT NULL AND v_doc.doc_type <> 'ACCESS_REVIEW' THEN
      DELETE FROM document_lines WHERE document_id = v_doc.id;
      v_total := fn_build_lines(v_doc, v_parent, p_lines);
      IF v_doc.doc_type NOT IN ('PMT','RCPT','ASSET','HIRE','TICKET','EXC','MDC') THEN
        UPDATE documents SET amount = v_total WHERE id = v_doc.id;
      END IF;
    END IF;
    PERFORM fn_record_action(v_doc.id, 'edit', v_doc.status, v_doc.status, v_me.id, NULL, nullif(h->>'comment', ''));
  EXCEPTION WHEN OTHERS THEN
    RETURN fn_fail('VALIDATION', SQLERRM);
  END;
  SELECT * INTO v_doc FROM documents WHERE id = p_doc_id;
  RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'version', v_doc.version);
END $$;

-- ============================================================
-- API: GENERATORS (payroll, depreciation, access review)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_pit(p_taxable numeric) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  -- Vietnamese progressive monthly PIT brackets
  SELECT round(CASE
    WHEN p_taxable <= 0 THEN 0
    WHEN p_taxable <= 5000000 THEN p_taxable * 0.05
    WHEN p_taxable <= 10000000 THEN p_taxable * 0.10 - 250000
    WHEN p_taxable <= 18000000 THEN p_taxable * 0.15 - 750000
    WHEN p_taxable <= 32000000 THEN p_taxable * 0.20 - 1650000
    WHEN p_taxable <= 52000000 THEN p_taxable * 0.25 - 3250000
    WHEN p_taxable <= 80000000 THEN p_taxable * 0.30 - 5850000
    ELSE p_taxable * 0.35 - 9850000 END, 0)
$$;

CREATE OR REPLACE FUNCTION api_create_payroll(p_period text, p_work_days jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user(); v_doc documents; e record; v_no int := 0;
  v_days numeric; v_std numeric := 22; v_gross numeric; v_ins numeric; v_taxable numeric; v_pit numeric; v_net numeric;
  t_gross numeric := 0; t_ins numeric := 0; t_pit numeric := 0; t_net numeric := 0; v_end date;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'PAYROLL', 'CREATE') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền lập bảng lương'); END IF;
  IF p_period !~ '^\d{4}-\d{2}$' THEN RETURN fn_fail('VALIDATION', 'Kỳ lương dạng YYYY-MM'); END IF;
  IF EXISTS (SELECT 1 FROM documents WHERE doc_type = 'PAYROLL' AND data->>'period' = p_period AND status NOT IN ('CANCELLED','REJECTED')) THEN
    RETURN fn_fail('VALIDATION', format('Đã có bảng lương kỳ %s', p_period));
  END IF;
  v_end := (to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  BEGIN
    INSERT INTO documents (doc_type, number, status, title, branch_id, department_id, cost_center_id, data, created_by, doc_date, tenant_id)
    VALUES ('PAYROLL', fn_next_number('PAYROLL'), 'CALCULATED', 'Bảng lương tháng ' || p_period,
            v_me.branch_id, v_me.department_id, v_me.department_id,
            jsonb_build_object('period', p_period, 'standard_days', v_std), v_me.id, (fn_now())::date, v_me.tenant_id)
    RETURNING * INTO v_doc;
    FOR e IN SELECT * FROM employees WHERE status = 'ACTIVE' AND coalesce(start_date, '2000-01-01') <= v_end ORDER BY code LOOP
      v_no := v_no + 1;
      v_days := least(coalesce((p_work_days->>e.id::text)::numeric, (p_work_days->>e.code)::numeric, v_std), v_std);
      v_gross := round(e.base_salary * v_days / v_std + e.allowance, 0);
      v_ins := round(e.base_salary * 0.105, 0);
      v_taxable := v_gross - v_ins - 11000000 - 4400000 * e.dependents;
      v_pit := fn_pit(v_taxable);
      v_net := v_gross - v_ins - v_pit;
      INSERT INTO document_lines (document_id, line_no, description, quantity, unit_price, amount, data)
      VALUES (v_doc.id, v_no, e.full_name, 1, v_net, v_net, jsonb_build_object(
        'employee_id', e.id, 'employee_code', e.code, 'department_id', e.department_id,
        'base_salary', e.base_salary, 'allowance', e.allowance, 'work_days', v_days, 'standard_days', v_std,
        'gross', v_gross, 'insurance', v_ins, 'dependents', e.dependents, 'taxable_income', greatest(v_taxable, 0),
        'pit', v_pit, 'net', v_net));
      t_gross := t_gross + v_gross; t_ins := t_ins + v_ins; t_pit := t_pit + v_pit; t_net := t_net + v_net;
    END LOOP;
    UPDATE documents SET amount = t_net, data = data || jsonb_build_object(
      'employee_count', v_no, 'total_gross', t_gross, 'total_insurance', t_ins, 'total_pit', t_pit, 'total_net', t_net)
    WHERE id = v_doc.id RETURNING * INTO v_doc;
    PERFORM fn_record_action(v_doc.id, 'create', NULL, v_doc.status, v_me.id, 'REQUESTER', 'Tính lương tự động');
    PERFORM fn_after_status_change(v_doc, v_me.id);
  EXCEPTION WHEN OTHERS THEN
    RETURN fn_fail('VALIDATION', SQLERRM);
  END;
  RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status);
END $$;

CREATE OR REPLACE FUNCTION api_run_depreciation(p_period text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me app_users := fn_current_user(); v_doc documents; a record; v_no int := 0; v_amt numeric; v_total numeric := 0;
  v_end date; v_assets jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'DEPRECIATION', 'EXECUTE') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền chạy khấu hao'); END IF;
  IF p_period !~ '^\d{4}-\d{2}$' THEN RETURN fn_fail('VALIDATION', 'Kỳ dạng YYYY-MM'); END IF;
  v_end := (to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  BEGIN
    INSERT INTO documents (doc_type, number, status, title, branch_id, department_id, cost_center_id, doc_date, data, created_by, tenant_id)
    VALUES ('JV', fn_next_number('JV'), 'DRAFT', 'Khấu hao TSCĐ tháng ' || p_period, v_me.branch_id, v_me.department_id,
            v_me.department_id, v_end, jsonb_build_object('depreciation_period', p_period), v_me.id, v_me.tenant_id)
    RETURNING * INTO v_doc;
    FOR a IN
      SELECT d.* FROM documents d
      WHERE d.doc_type = 'ASSET' AND d.status IN ('IN_USE','UNDER_MAINTENANCE')
        AND (d.data->>'capitalized_on')::date <= v_end
        AND coalesce(d.data->>'last_depreciation_period', '') < p_period
        AND coalesce((d.data->>'accumulated_depreciation')::numeric, 0) < d.amount
        AND NOT EXISTS (SELECT 1 FROM documents j WHERE j.doc_type = 'JV' AND j.id <> v_doc.id
                        AND j.data->>'depreciation_period' = p_period AND j.status NOT IN ('CANCELLED','REJECTED','REVERSED')
                        AND j.data->'assets' @> jsonb_build_array(jsonb_build_object('asset_id', d.id)))
      ORDER BY d.number
    LOOP
      v_amt := least(round(a.amount / (a.data->>'useful_life_months')::numeric, 0),
                     a.amount - coalesce((a.data->>'accumulated_depreciation')::numeric, 0));
      v_no := v_no + 1;
      INSERT INTO document_lines (document_id, line_no, account_code, description, debit, credit, amount, data)
      VALUES (v_doc.id, v_no, '642', 'Khấu hao ' || a.number || ' ' || coalesce(a.title, ''), v_amt, 0, v_amt, jsonb_build_object('asset_id', a.id));
      v_no := v_no + 1;
      INSERT INTO document_lines (document_id, line_no, account_code, description, debit, credit, amount, data)
      VALUES (v_doc.id, v_no, '214', 'Hao mòn ' || a.number, 0, v_amt, v_amt, jsonb_build_object('asset_id', a.id));
      INSERT INTO document_links (parent_id, child_id, link_type) VALUES (a.id, v_doc.id, 'DEPRECIATION');
      v_assets := v_assets || jsonb_build_object('asset_id', a.id, 'asset_number', a.number, 'amount', v_amt,
                                                 'monthly', round(a.amount / (a.data->>'useful_life_months')::numeric, 0));
      v_total := v_total + v_amt;
    END LOOP;
    IF v_no = 0 THEN RAISE EXCEPTION 'Không có tài sản cần khấu hao cho kỳ %', p_period; END IF;
    UPDATE documents SET amount = v_total, data = data || jsonb_build_object('assets', v_assets) WHERE id = v_doc.id RETURNING * INTO v_doc;
    PERFORM fn_record_action(v_doc.id, 'create', NULL, 'DRAFT', v_me.id, 'REQUESTER', 'Tính khấu hao tự động');
    PERFORM fn_after_status_change(v_doc, v_me.id);
  EXCEPTION WHEN OTHERS THEN
    RETURN fn_fail('VALIDATION', SQLERRM);
  END;
  v_res := api_transition(v_doc.id, 'submit', 'Gửi duyệt bút toán khấu hao');
  RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'amount', v_total, 'submit', v_res);
END $$;

CREATE OR REPLACE FUNCTION api_create_access_review() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_doc documents; r record; v_no int := 0;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'ACCESS_REVIEW', 'CREATE') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền tạo rà soát quyền'); END IF;
  INSERT INTO documents (doc_type, number, status, title, branch_id, department_id, cost_center_id, data, created_by, tenant_id)
  VALUES ('ACCESS_REVIEW', fn_next_number('ACCESS_REVIEW'), 'DRAFT', 'Rà soát quyền truy cập ' || to_char(fn_now(), 'MM/YYYY'),
          v_me.branch_id, v_me.department_id, v_me.department_id, '{}', v_me.id, v_me.tenant_id)
  RETURNING * INTO v_doc;
  FOR r IN
    SELECT u.id, u.full_name, u.employee_code, ur.role_code, ro.name AS role_name, d.name AS dept
    FROM user_roles ur JOIN app_users u ON u.id = ur.user_id JOIN roles ro ON ro.code = ur.role_code
    JOIN departments d ON d.id = u.department_id
    ORDER BY u.employee_code, ro.sort
  LOOP
    v_no := v_no + 1;
    INSERT INTO document_lines (document_id, line_no, description, quantity, data)
    VALUES (v_doc.id, v_no, r.full_name || ' — ' || r.role_name, 1, jsonb_build_object(
      'user_id', r.id, 'user_name', r.full_name, 'employee_code', r.employee_code, 'department', r.dept,
      'role_code', r.role_code, 'role_name', r.role_name, 'decision', 'KEEP'));
  END LOOP;
  PERFORM fn_record_action(v_doc.id, 'create', NULL, 'DRAFT', v_me.id, 'REQUESTER', 'Chụp danh sách quyền hiện tại');
  PERFORM fn_after_status_change(v_doc, v_me.id);
  RETURN jsonb_build_object('ok', true, 'id', v_doc.id, 'number', v_doc.number, 'status', v_doc.status);
END $$;

CREATE OR REPLACE FUNCTION api_access_review_decide(p_line_id uuid, p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_doc documents;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  SELECT d.* INTO v_doc FROM documents d JOIN document_lines l ON l.document_id = d.id WHERE l.id = p_line_id;
  IF v_doc.id IS NULL OR v_doc.doc_type <> 'ACCESS_REVIEW' THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy dòng rà soát'); END IF;
  IF v_doc.status <> 'DRAFT' OR v_doc.created_by <> v_me.id THEN RETURN fn_fail('FORBIDDEN', 'Chỉ người lập được sửa bản nháp'); END IF;
  IF p_decision NOT IN ('KEEP','REVOKE') THEN RETURN fn_fail('VALIDATION', 'Quyết định KEEP/REVOKE'); END IF;
  UPDATE document_lines SET data = data || jsonb_build_object('decision', p_decision) WHERE id = p_line_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================
-- API: ADMINISTRATION (all changes audited via triggers)
-- ============================================================
CREATE OR REPLACE FUNCTION api_admin_set_role(p_user uuid, p_role text, p_grant boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'USER_ADMIN', 'EDIT') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Chỉ quản trị hệ thống được phân quyền'); END IF;
  IF p_user = v_me.id THEN RETURN fn_fail('SOD_VIOLATION', 'Không được tự cấp/thu hồi quyền của chính mình'); END IF;
  IF p_grant THEN
    INSERT INTO user_roles (user_id, role_code, granted_by) VALUES (p_user, p_role, v_me.id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM user_roles WHERE user_id = p_user AND role_code = p_role;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION api_admin_set_user_status(p_user uuid, p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'USER_ADMIN', 'EDIT') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Chỉ quản trị hệ thống được thay đổi trạng thái'); END IF;
  IF p_user = v_me.id THEN RETURN fn_fail('VALIDATION', 'Không được tự khóa tài khoản của mình'); END IF;
  UPDATE app_users SET status = p_status, updated_at = fn_now() WHERE id = p_user;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION api_admin_set_permission(p_role text, p_resource text, p_action text, p_scope text,
                                                    p_hidden text[] DEFAULT '{}', p_active boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'USER_ADMIN', 'EDIT') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Chỉ quản trị hệ thống được sửa ma trận quyền'); END IF;
  IF p_role = ANY(fn_user_role_codes(v_me.id)) THEN
    RETURN fn_fail('SOD_VIOLATION', 'Không được sửa quyền của vai trò mà chính mình đang giữ');
  END IF;
  INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions, status)
  VALUES (p_role, p_resource, p_action, p_scope,
          CASE WHEN cardinality(coalesce(p_hidden, '{}')) > 0 THEN jsonb_build_object('hidden', to_jsonb(p_hidden)) ELSE '{}'::jsonb END,
          CASE WHEN p_active THEN 'ACTIVE' ELSE 'INACTIVE' END)
  ON CONFLICT (role_code, resource, action) DO UPDATE
    SET data_scope = excluded.data_scope, field_restrictions = excluded.field_restrictions, status = excluded.status;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION api_set_period_status(p_period text, p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_cur text;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'PERIOD', 'EXECUTE') = 0 THEN RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền khóa sổ'); END IF;
  SELECT status INTO v_cur FROM fiscal_periods WHERE period = p_period FOR UPDATE;
  IF NOT FOUND THEN RETURN fn_fail('NOT_FOUND', 'Kỳ không tồn tại'); END IF;
  IF v_cur = 'HARD_CLOSE' THEN RETURN fn_fail('INVALID_TRANSITION', 'Kỳ đã khóa cứng — không thể mở lại'); END IF;
  IF p_status NOT IN ('OPEN','SOFT_CLOSE','HARD_CLOSE') THEN RETURN fn_fail('VALIDATION', 'Trạng thái kỳ không hợp lệ'); END IF;
  IF p_status = 'HARD_CLOSE' AND v_cur <> 'SOFT_CLOSE' THEN
    RETURN fn_fail('INVALID_TRANSITION', 'Phải khóa sơ bộ (SOFT_CLOSE) và rà soát trước khi khóa cứng');
  END IF;
  IF p_status = 'HARD_CLOSE' AND EXISTS (
    SELECT 1 FROM documents WHERE doc_type = 'JV' AND status = 'SUBMITTED' AND to_char(doc_date, 'YYYY-MM') = p_period) THEN
    RETURN fn_fail('CONDITION_FAILED', 'Còn bút toán chờ ghi sổ trong kỳ');
  END IF;
  UPDATE fiscal_periods SET status = p_status, changed_by = v_me.id, changed_at = fn_now() WHERE period = p_period;
  RETURN jsonb_build_object('ok', true, 'period', p_period, 'status', p_status);
END $$;

CREATE OR REPLACE FUNCTION api_mark_notifications_read(p_ids uuid[] DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  UPDATE notifications SET is_read = true WHERE user_id = v_me.id AND (p_ids IS NULL OR id = ANY(p_ids));
  RETURN jsonb_build_object('ok', true);
END $$;
