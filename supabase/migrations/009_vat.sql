-- ERP General — 009 Thuế GTGT (VAT) trên hóa đơn bán ra (INV) và hóa đơn mua vào (SINV)
--
-- Thiết kế: giá trị dòng chứng từ (document_lines.amount) và document.amount TRƯỚC KHI ghi sổ
-- luôn là giá trị CHƯA THUẾ — dùng để đối chiếu 3 chiều với PO (T1.5/T1.6), ghi nhận doanh thu (511)
-- và giá vốn (632) đúng bản chất, và cam kết/thực chi ngân sách (Budget vs Actual) không lẫn thuế
-- (thuế GTGT là khoản được khấu trừ/phải nộp, không phải chi phí thực của doanh nghiệp).
-- Thuế chỉ CỘNG THÊM tại đúng thời điểm ghi sổ (INV:post / SINV:post):
--   - INV:post — Nợ 131 (phải thu) = tiền hàng + thuế; Có 511 = tiền hàng; Có 3331 = thuế GTGT đầu ra.
--   - SINV:post — Có 331 (phải trả) = tiền hàng + thuế; Nợ 1331 = thuế GTGT đầu vào được khấu trừ.
-- Sau khi ghi sổ, documents.amount được CẬP NHẬT thành tổng có thuế — vì từ lúc này amount chính là
-- số tiền phải thu/phải trả thực tế, dùng cho công nợ, tuổi nợ (aging) và đối soát thanh toán
-- (fn_rollup_settlement so sánh trực tiếp với d.amount). vat_rate mặc định 0 nếu không truyền —
-- không đổi hành vi của mọi hóa đơn cũ / kịch bản kiểm thử hiện có.

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
  v_vat numeric;
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
    -- 3-way match: PO ↔ GRN ↔ Invoice (qty tolerance 0, price tolerance ±2%) — luôn so sánh đơn giá CHƯA THUẾ
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
    v_vat := round(p_doc.amount * coalesce(nullif(p_doc.data->>'vat_rate', '')::numeric, 0) / 100, 2);
    PERFORM fn_gl(p_doc, v_today, '331', 0, p_doc.amount + v_vat, p_doc.partner_id, 'Công nợ NCC ' || p_doc.number, p_user);
    IF v_vat <> 0 THEN
      PERFORM fn_gl(p_doc, v_today, '1331', v_vat, 0, p_doc.partner_id, 'Thuế GTGT đầu vào ' || p_doc.number, p_user);
    END IF;
    PERFORM fn_gl_assert_balanced(p_doc.id);
    FOR r IN SELECT DISTINCT budget_id FROM budget_usage WHERE document_id = v_parent.id AND usage_type = 'COMMITTED' LOOP
      INSERT INTO budget_usage (budget_id, document_id, usage_type, amount) VALUES (r.budget_id, p_doc.id, 'COMMITTED', -v_acc);
      INSERT INTO budget_usage (budget_id, document_id, usage_type, amount) VALUES (r.budget_id, p_doc.id, 'ACTUAL', p_doc.amount);
    END LOOP;
    UPDATE documents SET due_date = v_today + coalesce((SELECT payment_terms_days FROM partners WHERE id = p_doc.partner_id), 30),
                         amount = p_doc.amount + v_vat,
                         data = data || jsonb_build_object('subtotal', p_doc.amount, 'vat_amount', v_vat,
                                                            'paid_amount', 0, 'outstanding', p_doc.amount + v_vat)
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
    v_vat := round(p_doc.amount * coalesce(nullif(p_doc.data->>'vat_rate', '')::numeric, 0) / 100, 2);
    PERFORM fn_gl(p_doc, v_today, '131', p_doc.amount + v_vat, 0, p_doc.partner_id, 'Phải thu ' || p_doc.number, p_user);
    PERFORM fn_gl(p_doc, v_today, '511', 0, p_doc.amount, p_doc.partner_id, 'Doanh thu ' || p_doc.number, p_user);
    IF v_vat <> 0 THEN
      PERFORM fn_gl(p_doc, v_today, '3331', 0, v_vat, p_doc.partner_id, 'Thuế GTGT đầu ra ' || p_doc.number, p_user);
    END IF;
    UPDATE documents SET due_date = v_today + coalesce((SELECT payment_terms_days FROM partners WHERE id = p_doc.partner_id), 30),
                         amount = p_doc.amount + v_vat,
                         data = data || jsonb_build_object('subtotal', p_doc.amount, 'vat_amount', v_vat,
                                                            'paid_amount', 0, 'outstanding', p_doc.amount + v_vat)
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

-- Tài khoản thuế mới dùng trong báo cáo tài chính / bảng cân đối số phát sinh (nếu chưa có).
INSERT INTO accounts (code, name, account_type, normal_balance) VALUES
  ('1331', 'Thuế GTGT được khấu trừ', 'ASSET', 'D'),
  ('3331', 'Thuế GTGT phải nộp', 'LIABILITY', 'C')
ON CONFLICT (code) DO NOTHING;
