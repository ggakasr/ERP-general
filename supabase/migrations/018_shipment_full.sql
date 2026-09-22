-- ERP General — 018 Shipment Full (WP-C1)
-- Completes shipment entity: tenant isolation for WP-J4 tables, structured job code,
-- GL effects on SHIPMENT:close, and acceptance criteria T7.x.
-- All logic added via config / new migrations only — 004_engine.sql unchanged.

-- ============================================================
-- 1. ADD tenant_id TO WP-J4 TABLES (idempotent: only if column missing)
-- ============================================================
DO $$
DECLARE
  def_tid constant uuid := '00000000-0000-0000-0000-000000000001';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['containers','shipment_charges','tracking_events'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id') THEN
        EXECUTE format(
          'ALTER TABLE %I ADD COLUMN tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)',
          t, def_tid
        );
        -- Backfill from parent document
        EXECUTE format(
          'UPDATE %I c SET tenant_id = d.tenant_id FROM documents d WHERE d.id = c.shipment_id',
          t
        );
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id DROP DEFAULT', t);
        RAISE NOTICE 'Added tenant_id to %', t;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 2. RLS + REVOKE on WP-J4 tables
--    api_* SECURITY DEFINER functions are unaffected by REVOKE.
-- ============================================================
ALTER TABLE containers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.containers       FROM anon, authenticated;
REVOKE ALL ON public.shipment_charges FROM anon, authenticated;
REVOKE ALL ON public.tracking_events  FROM anon, authenticated;

DROP POLICY IF EXISTS read_tenant ON public.containers;
DROP POLICY IF EXISTS read_tenant ON public.shipment_charges;
DROP POLICY IF EXISTS read_tenant ON public.tracking_events;

CREATE POLICY read_tenant ON public.containers       FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());
CREATE POLICY read_tenant ON public.shipment_charges FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());
CREATE POLICY read_tenant ON public.tracking_events  FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());

-- ============================================================
-- 3. STRUCTURED JOB CODE — job_no_format column on doc_types
-- ============================================================
ALTER TABLE doc_types ADD COLUMN IF NOT EXISTS job_no_format text;

-- Format template for SHIPMENT:  F-{dir}-{mode}-FR-{branch}-{YYMM}-{seq:4}
-- Example output:                F-EX-FC-FR-SGN-2309-0023
UPDATE doc_types SET job_no_format = 'F-{dir}-{mode}-FR-{branch}-{YYMM}-{seq:4}'
WHERE code = 'SHIPMENT';

-- ============================================================
-- 4. fn_job_number — generate structured job code from shipment data
-- ============================================================
CREATE OR REPLACE FUNCTION fn_job_number(
  p_doc_type  text,
  p_data      jsonb,
  p_branch_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fmt    text;
  v_ym     text  := to_char(fn_now(), 'YYMM');        -- e.g. '2309'
  v_seq    int;
  v_tid    uuid  := coalesce(fn_current_tenant(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_dir    text;
  v_mode   text;
  v_branch text;
  v_seq_key text;
BEGIN
  SELECT job_no_format INTO v_fmt FROM doc_types WHERE code = p_doc_type;
  -- No format configured → fall back to standard sequence number
  IF v_fmt IS NULL THEN
    RETURN fn_next_number(p_doc_type);
  END IF;

  -- Direction token
  v_dir := CASE coalesce(upper(p_data->>'shipment_type'), '')
    WHEN 'EXPORT' THEN 'EX'
    WHEN 'IMPORT' THEN 'IM'
    ELSE 'XX'
  END;

  -- Mode token
  v_mode := CASE coalesce(upper(p_data->>'mode'), '')
    WHEN 'FCL'  THEN 'FC'
    WHEN 'LCL'  THEN 'LC'
    WHEN 'AIR'  THEN 'AF'
    WHEN 'RAIL' THEN 'RL'
    ELSE 'XX'
  END;

  -- Branch short code: first 3 chars of branch.code, uppercased
  SELECT coalesce(upper(left(code, 3)), 'HQ') INTO v_branch
  FROM branches WHERE id = p_branch_id;
  v_branch := coalesce(v_branch, 'HQ');

  -- Per-direction+mode sequence (separate counter from doc_sequences)
  v_seq_key := 'J-' || v_dir || '-' || v_mode;
  INSERT INTO doc_sequences (tenant_id, prefix, yyyymm, last_seq)
  VALUES (v_tid, v_seq_key, v_ym, 1)
  ON CONFLICT (tenant_id, prefix, yyyymm) DO UPDATE SET last_seq = doc_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'F-' || v_dir || '-' || v_mode || '-FR-' || v_branch || '-' || v_ym || '-' || lpad(v_seq::text, 4, '0');
END $$;

GRANT EXECUTE ON FUNCTION fn_job_number(text, jsonb, uuid) TO authenticated;

-- ============================================================
-- 5. fn_shipment_close_gl — GL helper called on SHIPMENT:close
--    AR: Dr 131 / Cr 511 (revenue)
--    AP: Dr 632 (logistics cost) / Cr 331 (payable to carrier)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_shipment_close_gl(p_doc documents, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date    := (fn_now())::date;
  v_ar    numeric;
  v_ap    numeric;
BEGIN
  SELECT coalesce(sum(amount_vnd), 0) INTO v_ar
  FROM shipment_charges WHERE shipment_id = p_doc.id AND charge_type = 'AR';

  SELECT coalesce(sum(amount_vnd), 0) INTO v_ap
  FROM shipment_charges WHERE shipment_id = p_doc.id AND charge_type = 'AP';

  IF v_ar > 0 THEN
    PERFORM fn_gl(p_doc, v_today, '131', v_ar, 0,    p_doc.partner_id,
                  'Phải thu cước dịch vụ '     || p_doc.number, p_user);
    PERFORM fn_gl(p_doc, v_today, '511', 0,    v_ar, p_doc.partner_id,
                  'Doanh thu dịch vụ logistics ' || p_doc.number, p_user);
  END IF;

  IF v_ap > 0 THEN
    PERFORM fn_gl(p_doc, v_today, '632', v_ap, 0,    p_doc.partner_id,
                  'Chi phí vận chuyển '         || p_doc.number, p_user);
    PERFORM fn_gl(p_doc, v_today, '331', 0,    v_ap, p_doc.partner_id,
                  'Phải trả hãng tàu '          || p_doc.number, p_user);
  END IF;

  -- Update doc amount = AR total for dashboard display
  UPDATE documents SET amount = v_ar WHERE id = p_doc.id;
END $$;

-- ============================================================
-- 6. Replace fn_after_effects — add SHIPMENT:close branch
--    Original branches (PMT/RCPT/DN/INV/SINV/GRN) are preserved verbatim.
-- ============================================================
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
  ELSIF d.doc_type = 'SHIPMENT' AND p_action = 'close' THEN
    PERFORM fn_shipment_close_gl(d, p_user);
  END IF;
END $$;

-- ============================================================
-- 7. ACCEPTANCE CRITERIA T7.x (WP-C1 Logistics)
-- ============================================================
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker) VALUES
  ('T7.1', 'N7_LOGISTICS', 'BLOCKER SoD: cùng user không vừa tạo vừa duyệt cùng SHIPMENT', 'L12', true),
  ('T7.2', 'N7_LOGISTICS', 'api_get_shipment trả về containers, charges, tracking, profit', 'L12', false),
  ('T7.3', 'N7_LOGISTICS', 'fn_job_number: mã job cấu trúc đúng định dạng F-{dir}-{mode}-FR-...', 'L12', false)
ON CONFLICT (test_code) DO NOTHING;
