-- ERP General — 039 Documents that may be created without document_lines
--
-- SHIPMENT / BOOKING / HBL / DO keep their detail in containers / shipment_charges; the UI
-- (src/lib/doc-config.ts lineMode "container" / "none") sends p_lines = NULL for them.
-- fn_build_lines (004) still demanded at least one line, so these documents could not be
-- created at all ("Chứng từ cần ít nhất một dòng chi tiết") — T7.1, T10.5, T11.4.
-- BANKREC: 031 api_bankrec_import fills the statement lines of a DRAFT BANKREC, so it must be
-- possible to create one empty first (T20.x).
-- Only change vs 004: these five types join the "no lines required" list.

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

  -- logistics documents keep their detail in containers / shipment_charges; BANKREC lines come from api_bankrec_import
  IF v_no = 0 AND p_doc.doc_type NOT IN ('PMT','RCPT','ASSET','HIRE','TICKET','EXC','MDC',
                                         'SHIPMENT','BOOKING','HBL','DO','BANKREC') THEN
    RAISE EXCEPTION 'Chứng từ cần ít nhất một dòng chi tiết';
  END IF;
  RETURN CASE WHEN p_doc.doc_type IN ('ST','ADJ') THEN 0 ELSE v_total END;
END $$;

