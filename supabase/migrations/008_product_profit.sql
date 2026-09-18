-- ERP General — 008 Báo cáo lãi gộp theo sản phẩm & theo khách hàng
-- Doanh thu: document_lines của INV có bút toán 511 (Doanh thu) trong kỳ.
-- Giá vốn: stock_moves move_type='DN_OUT' của DN có bút toán 632 (Giá vốn hàng bán) trong kỳ.
-- gl_entries.period là nguồn sự thật duy nhất cho "thuộc kỳ nào" (khớp báo cáo tài chính hiện có),
-- chỉ tra thêm document_lines/stock_moves để có độ chi tiết theo sản phẩm/khách hàng mà GL không giữ.

CREATE OR REPLACE FUNCTION api_product_profit(p_from text, p_to text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'GL', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem báo cáo lãi gộp theo sản phẩm/khách hàng');
  END IF;

  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to,
    'by_product', coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'qty', x.qty, 'revenue', x.revenue,
          'cogs', x.cogs, 'gross_margin', x.revenue - x.cogs,
          'margin_pct', CASE WHEN x.revenue <> 0 THEN round((x.revenue - x.cogs) / x.revenue * 100, 1) ELSE NULL END)
        ORDER BY (x.revenue - x.cogs) DESC)
      FROM (
        SELECT p.id, p.code, p.name,
          coalesce((SELECT sum(dl.quantity) FROM document_lines dl
              JOIN documents d ON d.id = dl.document_id AND d.doc_type = 'INV'
              JOIN gl_entries g ON g.document_id = d.id AND g.account_code = '511'
              WHERE dl.product_id = p.id AND g.period BETWEEN p_from AND p_to
                AND fn_gl_filter(v_me.id, d.branch_id, d.department_id)), 0) AS qty,
          coalesce((SELECT sum(dl.amount) FROM document_lines dl
              JOIN documents d ON d.id = dl.document_id AND d.doc_type = 'INV'
              JOIN gl_entries g ON g.document_id = d.id AND g.account_code = '511'
              WHERE dl.product_id = p.id AND g.period BETWEEN p_from AND p_to
                AND fn_gl_filter(v_me.id, d.branch_id, d.department_id)), 0) AS revenue,
          coalesce((SELECT sum(-sm.qty * sm.unit_cost) FROM stock_moves sm
              JOIN documents d ON d.id = sm.document_id AND d.doc_type = 'DN'
              JOIN gl_entries g ON g.document_id = d.id AND g.account_code = '632'
              WHERE sm.product_id = p.id AND sm.move_type = 'DN_OUT' AND g.period BETWEEN p_from AND p_to
                AND fn_gl_filter(v_me.id, d.branch_id, d.department_id)), 0) AS cogs
        FROM products p WHERE p.product_type IN ('FINISHED', 'GOODS')
      ) x WHERE x.revenue <> 0 OR x.cogs <> 0
    ), '[]'),
    'by_customer', coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'revenue', x.revenue,
          'cogs', x.cogs, 'gross_margin', x.revenue - x.cogs,
          'margin_pct', CASE WHEN x.revenue <> 0 THEN round((x.revenue - x.cogs) / x.revenue * 100, 1) ELSE NULL END)
        ORDER BY (x.revenue - x.cogs) DESC)
      FROM (
        SELECT pt.id, pt.code, pt.name,
          coalesce((SELECT sum(dl.amount) FROM document_lines dl
              JOIN documents d ON d.id = dl.document_id AND d.doc_type = 'INV'
              JOIN gl_entries g ON g.document_id = d.id AND g.account_code = '511'
              WHERE d.partner_id = pt.id AND g.period BETWEEN p_from AND p_to
                AND fn_gl_filter(v_me.id, d.branch_id, d.department_id)), 0) AS revenue,
          coalesce((SELECT sum(-sm.qty * sm.unit_cost) FROM stock_moves sm
              JOIN documents d ON d.id = sm.document_id AND d.doc_type = 'DN'
              JOIN gl_entries g ON g.document_id = d.id AND g.account_code = '632'
              WHERE d.partner_id = pt.id AND sm.move_type = 'DN_OUT' AND g.period BETWEEN p_from AND p_to
                AND fn_gl_filter(v_me.id, d.branch_id, d.department_id)), 0) AS cogs
        FROM partners pt WHERE pt.partner_type IN ('CUSTOMER', 'BOTH')
      ) x WHERE x.revenue <> 0 OR x.cogs <> 0
    ), '[]'));
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'api_product_profit'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
