-- ERP General — 012 Chart RPCs (WP-B1)
-- 4 aggregate read-only RPCs for dashboard widgets.
-- All SECURITY DEFINER, all respect fn_perm_scope / fn_doc_in_scope.
-- No new table grants — coverage via EXECUTE on api_* per 006_security.sql pattern.
--
-- RPCs:
--   api_chart_pipeline   — doc count by status (pipeline view, all or one doc_type)
--   api_chart_by_status  — single resource status / handoff SLA breakdown
--   api_chart_series     — time-series: cash_flow | sod_violations | exceptions
--   api_chart_by_owner   — top-N by partner/product/dept
--
-- NOTE: p_from / p_to use text (not date) so pg named-parameter notation resolves
-- correctly from JS clients. Values must be 'YYYY-MM-DD' or NULL.

-- Drop old date-typed overloads if they exist (from an earlier version of this file)
DROP FUNCTION IF EXISTS api_chart_pipeline(text, date, date);
DROP FUNCTION IF EXISTS api_chart_by_status(text, date, date);
DROP FUNCTION IF EXISTS api_chart_series(text, date, date, text);
DROP FUNCTION IF EXISTS api_chart_by_owner(text, date, date);

-- ============================================================
-- 1. api_chart_pipeline
-- ============================================================
-- Returns: { rows: [{ doc_type, status, count }] }
-- Widget: pipeline chứng từ theo trạng thái

CREATE OR REPLACE FUNCTION api_chart_pipeline(
  p_doc_type text DEFAULT NULL,
  p_from     text DEFAULT NULL,
  p_to       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    app_users := fn_current_user();
  v_types text[];
  v_from  date := CASE WHEN p_from IS NOT NULL THEN p_from::date ELSE NULL END;
  v_to    date := CASE WHEN p_to   IS NOT NULL THEN p_to::date   ELSE NULL END;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;

  IF p_doc_type IS NOT NULL THEN
    IF fn_perm_scope(v_me.id, p_doc_type, 'VIEW') = 0 THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem loại chứng từ này');
    END IF;
    v_types := ARRAY[p_doc_type];
  ELSE
    SELECT array_agg(DISTINCT pm.resource)
    INTO v_types
    FROM user_roles ur
    JOIN permission_matrix pm
      ON pm.role_code = ur.role_code AND pm.status = 'ACTIVE' AND pm.action = 'VIEW'
    WHERE ur.user_id = v_me.id;
  END IF;

  IF v_types IS NULL OR cardinality(v_types) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'rows', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('ok', true,
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('doc_type', doc_type, 'status', status, 'count', cnt)
        ORDER BY doc_type, status
      )
      FROM (
        SELECT d.doc_type, d.status, count(*) AS cnt
        FROM documents d
        WHERE d.doc_type = ANY(v_types)
          AND d.tenant_id = fn_current_tenant()
          AND (v_from IS NULL OR d.created_at >= v_from::timestamptz)
          AND (v_to   IS NULL OR d.created_at <  (v_to + interval '1 day')::timestamptz)
          AND fn_doc_in_scope(v_me.id, d, d.doc_type, 'VIEW')
        GROUP BY d.doc_type, d.status
      ) x
    ), '[]'::jsonb)
  );
END $$;

-- ============================================================
-- 2. api_chart_by_status
-- ============================================================
-- Returns: { resource, rows: [{ status, count }] }
-- p_resource: doc_type code OR 'HANDOFF' for handoff SLA breakdown
-- Widget: ngoại lệ EXC · bàn giao AT_RISK/BREACHED

CREATE OR REPLACE FUNCTION api_chart_by_status(
  p_resource text,
  p_from     text DEFAULT NULL,
  p_to       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    app_users := fn_current_user();
  v_scope int;
  v_from  date := CASE WHEN p_from IS NOT NULL THEN p_from::date ELSE NULL END;
  v_to    date := CASE WHEN p_to   IS NOT NULL THEN p_to::date   ELSE NULL END;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;

  -- Handoff SLA breakdown (special resource key)
  -- handoff_records has no sla_status column; compute from sla_due_at vs now()
  IF p_resource = 'HANDOFF' THEN
    v_scope := fn_perm_scope(v_me.id, 'CONTROLS', 'VIEW');
    IF v_scope = 0 THEN v_scope := 1; END IF; -- fallback: own handoffs always visible
    RETURN jsonb_build_object('ok', true, 'resource', p_resource,
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('status', sla_status, 'count', cnt)
          ORDER BY cnt DESC
        )
        FROM (
          SELECT
            CASE
              WHEN hr.sla_due_at IS NULL      THEN 'ON_TIME'
              WHEN now() > hr.sla_due_at       THEN 'BREACHED'
              WHEN now() > hr.sla_due_at - interval '2 hours' THEN 'AT_RISK'
              ELSE 'ON_TIME'
            END AS sla_status,
            count(*) AS cnt
          FROM handoff_records hr
          WHERE hr.tenant_id = fn_current_tenant()
            AND hr.status NOT IN ('COMPLETED','CANCELLED')
            AND (v_from IS NULL OR hr.initiated_at >= v_from::timestamptz)
            AND (v_to   IS NULL OR hr.initiated_at <  (v_to + interval '1 day')::timestamptz)
            AND (
              v_scope >= 4
              OR (v_scope >= 3 AND EXISTS (
                SELECT 1 FROM app_users u
                WHERE u.id = hr.from_user_id AND u.branch_id = v_me.branch_id
              ))
              OR (v_scope >= 2 AND EXISTS (
                SELECT 1 FROM app_users u
                WHERE u.id = hr.from_user_id AND u.department_id = v_me.department_id
              ))
              OR hr.from_user_id = v_me.id OR hr.to_user_id = v_me.id
            )
          GROUP BY 1
        ) x
      ), '[]'::jsonb)
    );
  END IF;

  -- General doc_type status breakdown
  v_scope := fn_perm_scope(v_me.id, p_resource, 'VIEW');
  IF v_scope = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem tài nguyên này');
  END IF;

  RETURN jsonb_build_object('ok', true, 'resource', p_resource,
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('status', status, 'count', cnt)
        ORDER BY cnt DESC
      )
      FROM (
        SELECT d.status, count(*) AS cnt
        FROM documents d
        WHERE d.doc_type = p_resource
          AND d.tenant_id = fn_current_tenant()
          AND (v_from IS NULL OR d.created_at >= v_from::timestamptz)
          AND (v_to   IS NULL OR d.created_at <  (v_to + interval '1 day')::timestamptz)
          AND fn_doc_in_scope(v_me.id, d, p_resource, 'VIEW')
        GROUP BY d.status
      ) x
    ), '[]'::jsonb)
  );
END $$;

-- ============================================================
-- 3. api_chart_series
-- ============================================================
-- p_metric: 'cash_flow' | 'sod_violations' | 'exceptions'
-- p_group_by: 'day' | 'week' | 'month'
-- Returns: { metric, rows: [{ period, ... }] }
-- Widget: dòng tiền vào/ra · vi phạm SoD theo tuần

CREATE OR REPLACE FUNCTION api_chart_series(
  p_metric   text,
  p_from     text DEFAULT NULL,
  p_to       text DEFAULT NULL,
  p_group_by text DEFAULT 'month'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    app_users := fn_current_user();
  v_scope int;
  v_trunc text;
  v_from  date := CASE WHEN p_from IS NOT NULL THEN p_from::date
                       ELSE (CURRENT_DATE - interval '3 months')::date END;
  v_to    date := CASE WHEN p_to IS NOT NULL THEN p_to::date ELSE CURRENT_DATE END;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;

  v_trunc := CASE WHEN p_group_by IN ('day','week','month') THEN p_group_by ELSE 'month' END;

  IF p_metric = 'cash_flow' THEN
    -- Permission: needs JV or BANKREC VIEW
    v_scope := fn_perm_scope(v_me.id, 'JV', 'VIEW');
    IF v_scope = 0 THEN v_scope := fn_perm_scope(v_me.id, 'BANKREC', 'VIEW'); END IF;
    IF v_scope = 0 THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem dữ liệu tài chính');
    END IF;
    -- Cash IN = debit on 111/112; Cash OUT = credit on 111/112
    RETURN jsonb_build_object('ok', true, 'metric', p_metric,
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('period', period, 'cash_in', cash_in, 'cash_out', cash_out)
          ORDER BY period
        )
        FROM (
          SELECT
            to_char(date_trunc(v_trunc, g.posting_date::timestamptz), 'YYYY-MM-DD') AS period,
            coalesce(sum(g.debit)  FILTER (WHERE g.account_code IN ('111','112')), 0) AS cash_in,
            coalesce(sum(g.credit) FILTER (WHERE g.account_code IN ('111','112')), 0) AS cash_out
          FROM gl_entries g
          WHERE g.tenant_id = fn_current_tenant()
            AND g.account_code IN ('111','112')
            AND g.posting_date >= v_from AND g.posting_date <= v_to
            AND (
              v_scope >= 4
              OR (v_scope >= 3 AND g.branch_id = v_me.branch_id)
              OR (v_scope >= 2 AND g.department_id = v_me.department_id)
              OR g.created_by = v_me.id
            )
          GROUP BY date_trunc(v_trunc, g.posting_date::timestamptz)
        ) x
      ), '[]'::jsonb)
    );

  ELSIF p_metric = 'sod_violations' THEN
    v_scope := fn_perm_scope(v_me.id, 'CONTROLS', 'VIEW');
    IF v_scope = 0 THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem dữ liệu kiểm soát');
    END IF;
    RETURN jsonb_build_object('ok', true, 'metric', p_metric,
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('period', period, 'value', violations)
          ORDER BY period
        )
        FROM (
          SELECT
            to_char(date_trunc(v_trunc, s.checked_at), 'YYYY-MM-DD') AS period,
            count(*) AS violations
          FROM sod_check_log s
          WHERE s.tenant_id = fn_current_tenant()
            AND s.result = 'BLOCKED'
            AND s.checked_at::date >= v_from AND s.checked_at::date <= v_to
            AND (
              v_scope >= 4
              OR (v_scope >= 3 AND EXISTS (
                SELECT 1 FROM app_users u
                WHERE u.id = s.user_id AND u.branch_id = v_me.branch_id
              ))
              OR s.user_id = v_me.id
            )
          GROUP BY date_trunc(v_trunc, s.checked_at)
        ) x
      ), '[]'::jsonb)
    );

  ELSIF p_metric = 'exceptions' THEN
    v_scope := fn_perm_scope(v_me.id, 'EXC', 'VIEW');
    IF v_scope = 0 THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem ngoại lệ');
    END IF;
    RETURN jsonb_build_object('ok', true, 'metric', p_metric,
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('period', period, 'value', cnt)
          ORDER BY period
        )
        FROM (
          SELECT
            to_char(date_trunc(v_trunc, d.created_at), 'YYYY-MM-DD') AS period,
            count(*) AS cnt
          FROM documents d
          WHERE d.doc_type = 'EXC'
            AND d.tenant_id = fn_current_tenant()
            AND d.created_at::date >= v_from AND d.created_at::date <= v_to
            AND fn_doc_in_scope(v_me.id, d, 'EXC', 'VIEW')
          GROUP BY date_trunc(v_trunc, d.created_at)
        ) x
      ), '[]'::jsonb)
    );

  ELSE
    RETURN fn_fail('INVALID_INPUT',
      'p_metric không hợp lệ. Dùng: cash_flow | sod_violations | exceptions');
  END IF;
END $$;

-- ============================================================
-- 4. api_chart_by_owner
-- ============================================================
-- p_metric: 'partner_revenue' | 'inventory_balance' | 'exceptions_by_dept'
-- Returns: { metric, rows: [{ label, value, value2? }] } — top 10
-- Widget: top khách theo lãi gộp · số dư kho theo mặt hàng

CREATE OR REPLACE FUNCTION api_chart_by_owner(
  p_metric text,
  p_from   text DEFAULT NULL,
  p_to     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    app_users := fn_current_user();
  v_scope int;
  v_from  date := CASE WHEN p_from IS NOT NULL THEN p_from::date ELSE NULL END;
  v_to    date := CASE WHEN p_to   IS NOT NULL THEN p_to::date   ELSE NULL END;
BEGIN
  IF v_me.id IS NULL THEN
    RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập');
  END IF;

  IF p_metric = 'partner_revenue' THEN
    v_scope := fn_perm_scope(v_me.id, 'INV', 'VIEW');
    IF v_scope = 0 THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem doanh thu đối tác');
    END IF;
    RETURN jsonb_build_object('ok', true, 'metric', p_metric,
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('label', partner_name, 'value', revenue)
          ORDER BY revenue DESC
        )
        FROM (
          SELECT
            coalesce(p.name, 'Không xác định') AS partner_name,
            sum(d.amount) AS revenue
          FROM documents d
          LEFT JOIN partners p ON p.id = d.partner_id
          WHERE d.doc_type = 'INV'
            AND d.status IN ('POSTED','PARTIALLY_PAID','PAID')
            AND d.tenant_id = fn_current_tenant()
            AND (v_from IS NULL OR d.created_at >= v_from::timestamptz)
            AND (v_to   IS NULL OR d.created_at <  (v_to + interval '1 day')::timestamptz)
            AND fn_doc_in_scope(v_me.id, d, 'INV', 'VIEW')
          GROUP BY d.partner_id, p.name
          ORDER BY revenue DESC
          LIMIT 10
        ) x
      ), '[]'::jsonb)
    );

  ELSIF p_metric = 'inventory_balance' THEN
    v_scope := fn_perm_scope(v_me.id, 'ST', 'VIEW');
    IF v_scope = 0 THEN v_scope := fn_perm_scope(v_me.id, 'GRN', 'VIEW'); END IF;
    IF v_scope = 0 THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem tồn kho');
    END IF;
    RETURN jsonb_build_object('ok', true, 'metric', p_metric,
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('label', product_name, 'value', balance_qty, 'value2', balance_value)
          ORDER BY balance_value DESC
        )
        FROM (
          SELECT
            pr.name AS product_name,
            sum(sm.qty) AS balance_qty,
            sum(sm.qty * sm.unit_cost) AS balance_value
          FROM stock_moves sm
          JOIN products pr ON pr.id = sm.product_id
          JOIN warehouses w ON w.id = sm.warehouse_id
          WHERE sm.tenant_id = fn_current_tenant()
            AND (v_from IS NULL OR sm.created_at >= v_from::timestamptz)
            AND (v_to   IS NULL OR sm.created_at <  (v_to + interval '1 day')::timestamptz)
            AND (
              v_scope >= 4
              OR (v_scope >= 3 AND w.branch_id = v_me.branch_id)
              OR sm.created_by = v_me.id
            )
          GROUP BY pr.id, pr.name
          HAVING sum(sm.qty) <> 0
          ORDER BY abs(sum(sm.qty * sm.unit_cost)) DESC
          LIMIT 10
        ) x
      ), '[]'::jsonb)
    );

  ELSIF p_metric = 'exceptions_by_dept' THEN
    v_scope := fn_perm_scope(v_me.id, 'EXC', 'VIEW');
    IF v_scope = 0 THEN
      RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem ngoại lệ');
    END IF;
    RETURN jsonb_build_object('ok', true, 'metric', p_metric,
      'rows', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('label', dept_name, 'value', cnt)
          ORDER BY cnt DESC
        )
        FROM (
          SELECT
            coalesce(dep.name, 'Không rõ') AS dept_name,
            count(*) AS cnt
          FROM documents d
          LEFT JOIN departments dep ON dep.id = d.department_id
          WHERE d.doc_type = 'EXC'
            AND d.tenant_id = fn_current_tenant()
            AND (v_from IS NULL OR d.created_at >= v_from::timestamptz)
            AND (v_to   IS NULL OR d.created_at <  (v_to + interval '1 day')::timestamptz)
            AND fn_doc_in_scope(v_me.id, d, 'EXC', 'VIEW')
          GROUP BY dep.id, dep.name
          ORDER BY cnt DESC
          LIMIT 10
        ) x
      ), '[]'::jsonb)
    );

  ELSE
    RETURN fn_fail('INVALID_INPUT',
      'p_metric không hợp lệ. Dùng: partner_revenue | inventory_balance | exceptions_by_dept');
  END IF;
END $$;

-- Grant EXECUTE to authenticated (pattern from 006_security.sql)
GRANT EXECUTE ON FUNCTION api_chart_pipeline(text, text, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION api_chart_by_status(text, text, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION api_chart_series(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION api_chart_by_owner(text, text, text)    TO authenticated;
