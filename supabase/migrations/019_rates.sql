-- ERP General — 019 Rate & Charge Engine (WP-C2)
-- Bảng rates + charge_codes, RPC api_rate_search / api_quote_build / api_rate_import,
-- cảnh báo rate sắp hết hạn qua email_outbox, acceptance tests T10.x.
-- Không sửa 004_engine.sql. Tuân thủ tenant_id + RLS (WP-D1 đã xong).

-- ============================================================
-- CHARGE CODES (reference table — freight surcharge types)
-- ============================================================
CREATE TABLE IF NOT EXISTS charge_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  code       text        NOT NULL,
  name       text        NOT NULL,
  category   text        NOT NULL DEFAULT 'OTHER'
               CHECK (category IN ('FREIGHT','LOCAL','DOCUMENTATION','SURCHARGE','OTHER')),
  charge_type text       NOT NULL DEFAULT 'AR'
               CHECK (charge_type IN ('AR','AP','BOTH')),
  currency   text        NOT NULL DEFAULT 'USD',
  is_mandatory boolean   NOT NULL DEFAULT false,
  sort       int         NOT NULL DEFAULT 0,
  status     text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT fn_now(),
  UNIQUE (tenant_id, code)
);

-- ============================================================
-- RATES (spot / contract rate sheets)
-- ============================================================
CREATE TABLE IF NOT EXISTS rates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  carrier_id   uuid        REFERENCES partners(id),  -- NULL = any carrier
  pol          text        NOT NULL,  -- port of loading  (LOCODE / free text)
  pod          text        NOT NULL,  -- port of discharge
  mode         text        NOT NULL DEFAULT 'FCL'
                 CHECK (mode IN ('FCL','LCL','AIR','RAIL','TRUCK')),
  rate_type    text        NOT NULL DEFAULT 'SPOT'
                 CHECK (rate_type IN ('SPOT','CONTRACT')),
  valid_from   date        NOT NULL,
  valid_to     date        NOT NULL,
  currency     text        NOT NULL DEFAULT 'USD',
  rate_20ft    numeric(18,2),
  rate_40ft    numeric(18,2),
  rate_40hc    numeric(18,2),
  rate_per_cbm numeric(18,4),
  rate_per_kg  numeric(18,6),
  surcharges   jsonb       NOT NULL DEFAULT '[]',
  notes        text,
  status       text        NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','EXPIRED','SUSPENDED')),
  created_by   uuid        REFERENCES app_users(id),
  created_at   timestamptz NOT NULL DEFAULT fn_now(),
  CONSTRAINT ck_valid_dates CHECK (valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_rates_route   ON rates(tenant_id, pol, pod, mode);
CREATE INDEX IF NOT EXISTS idx_rates_valid   ON rates(tenant_id, valid_to, status);
CREATE INDEX IF NOT EXISTS idx_rates_carrier ON rates(tenant_id, carrier_id);

-- ============================================================
-- RLS + REVOKE
-- ============================================================
ALTER TABLE charge_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.charge_codes FROM anon, authenticated;
REVOKE ALL ON public.rates         FROM anon, authenticated;

DROP POLICY IF EXISTS read_tenant ON public.charge_codes;
DROP POLICY IF EXISTS read_tenant ON public.rates;

CREATE POLICY read_tenant ON public.charge_codes FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());
CREATE POLICY read_tenant ON public.rates FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());

-- ============================================================
-- PERMISSIONS
-- ============================================================
CREATE OR REPLACE FUNCTION _perm(p_role text, p_resources text, p_actions text, p_scope text, p_hidden text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r text; a text;
BEGIN
  FOREACH r IN ARRAY string_to_array(replace(p_resources, ' ', ''), ',') LOOP
    FOREACH a IN ARRAY string_to_array(replace(p_actions, ' ', ''), ',') LOOP
      INSERT INTO permission_matrix (role_code, resource, action, data_scope, field_restrictions)
      VALUES (p_role, r, a, p_scope,
              CASE WHEN a = 'VIEW' AND cardinality(p_hidden) > 0 THEN jsonb_build_object('hidden', to_jsonb(p_hidden)) ELSE '{}'::jsonb END)
      ON CONFLICT (role_code, resource, action) DO UPDATE
        SET data_scope = excluded.data_scope, field_restrictions = excluded.field_restrictions;
    END LOOP;
  END LOOP;
END $$;

DO $$
BEGIN
  PERFORM _perm('OPS_MANAGER',  'RATE,CHARGE_CODE', 'VIEW,CREATE,EDIT', 'BRANCH');
  PERFORM _perm('OPS_STAFF',    'RATE,CHARGE_CODE', 'VIEW',             'BRANCH');
  PERFORM _perm('CS_FREIGHT',   'RATE,CHARGE_CODE', 'VIEW,CREATE',      'BRANCH');
  PERFORM _perm('CFO',          'RATE,CHARGE_CODE', 'VIEW',             'COMPANY');
  PERFORM _perm('SYS_ADMIN', 'RATE,CHARGE_CODE', 'VIEW,CREATE,EDIT,APPROVE', 'COMPANY');
END $$;

DROP FUNCTION IF EXISTS _perm(text, text, text, text, text[]);

-- ============================================================
-- SEED — default charge codes (per default tenant)
-- ============================================================
DO $$
DECLARE v_tid uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO charge_codes (tenant_id, code, name, category, charge_type, currency, is_mandatory, sort) VALUES
    (v_tid, 'OCEAN_FREIGHT', 'Ocean Freight',         'FREIGHT',       'AR',   'USD', true,  1),
    (v_tid, 'THC_ORIGIN',    'THC Origin',             'LOCAL',         'AP',   'USD', false, 2),
    (v_tid, 'THC_DEST',      'THC Destination',        'LOCAL',         'AR',   'USD', false, 3),
    (v_tid, 'BL_FEE',        'Bill of Lading Fee',     'DOCUMENTATION', 'AR',   'USD', false, 4),
    (v_tid, 'FUEL_SURCHARGE','Fuel Surcharge (BAF)',   'SURCHARGE',     'AR',   'USD', false, 5),
    (v_tid, 'WAR_RISK',      'War Risk Surcharge',     'SURCHARGE',     'AR',   'USD', false, 6),
    (v_tid, 'HANDLING',      'Handling Fee',           'LOCAL',         'BOTH', 'VND', false, 7),
    (v_tid, 'CUSTOMS',       'Customs Clearance',      'LOCAL',         'AR',   'VND', false, 8),
    (v_tid, 'TRUCKING',      'Trucking / Inland Haulage','LOCAL',       'AR',   'VND', false, 9),
    (v_tid, 'AIR_FREIGHT',   'Air Freight',            'FREIGHT',       'AR',   'USD', true,  10)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END $$;

-- ============================================================
-- SEED — sample rates (default tenant)
-- ============================================================
DO $$
DECLARE
  v_tid  uuid := '00000000-0000-0000-0000-000000000001';
  v_cid  uuid;
BEGIN
  SELECT id INTO v_cid FROM partners WHERE code = 'SUP-001' AND tenant_id = v_tid LIMIT 1;

  INSERT INTO rates (tenant_id, carrier_id, pol, pod, mode, rate_type, valid_from, valid_to,
                     currency, rate_20ft, rate_40ft, rate_40hc, notes, status)
  VALUES
    -- Active route SGN→SHA (expires 2027-03)
    (v_tid, v_cid, 'VNSGN', 'CNSHA', 'FCL', 'SPOT', '2026-09-01', '2027-03-31',
     'USD', 350, 600, 650, 'Cước biển SGN → Thượng Hải', 'ACTIVE'),
    -- Active route HAN→SHA
    (v_tid, v_cid, 'VNHAN', 'CNSHA', 'FCL', 'SPOT', '2026-09-01', '2027-03-31',
     'USD', 380, 650, 700, 'Cước biển HAN → Thượng Hải', 'ACTIVE'),
    -- Expiring soon route SGN→LAX (within 7 days of today)
    (v_tid, v_cid, 'VNSGN', 'USLAX', 'FCL', 'SPOT', '2026-06-01', current_date + 3,
     'USD', 1200, 2100, 2300, 'Route sắp hết hạn — test cảnh báo', 'ACTIVE'),
    -- LCL route SGN→SIN
    (v_tid, NULL,  'VNSGN', 'SGSIN', 'LCL', 'SPOT', '2026-09-01', '2027-06-30',
     'USD', NULL,  NULL,  NULL,   'LCL cước per CBM', 'ACTIVE'),
    -- Already expired route
    (v_tid, v_cid, 'VNSGN', 'JPTYO', 'FCL', 'SPOT', '2025-01-01', '2025-12-31',
     'USD', 500, 850, 900, 'Đã hết hạn — không dùng báo giá', 'EXPIRED')
  ON CONFLICT DO NOTHING;

  -- Update LCL rate to have per_cbm
  UPDATE rates SET rate_per_cbm = 45 WHERE pol='VNSGN' AND pod='SGSIN' AND tenant_id = v_tid;
END $$;

-- ============================================================
-- api_rate_search — tìm rate còn hiệu lực theo tuyến
-- ============================================================
CREATE OR REPLACE FUNCTION api_rate_search(
  p_pol    text    DEFAULT NULL,
  p_pod    text    DEFAULT NULL,
  p_mode   text    DEFAULT NULL,
  p_date   date    DEFAULT NULL,
  p_limit  int     DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_tid uuid;
  v_on  date := coalesce(p_date, (fn_now())::date);
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'RATE', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem bảng giá');
  END IF;
  v_tid := fn_current_tenant();

  RETURN jsonb_build_object('ok', true,
    'as_of', v_on,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',          r.id,
        'pol',         r.pol,
        'pod',         r.pod,
        'mode',        r.mode,
        'rate_type',   r.rate_type,
        'valid_from',  r.valid_from,
        'valid_to',    r.valid_to,
        'currency',    r.currency,
        'rate_20ft',   r.rate_20ft,
        'rate_40ft',   r.rate_40ft,
        'rate_40hc',   r.rate_40hc,
        'rate_per_cbm',r.rate_per_cbm,
        'rate_per_kg', r.rate_per_kg,
        'surcharges',  r.surcharges,
        'notes',       r.notes,
        'status',      r.status,
        'carrier_id',  r.carrier_id,
        'carrier_name',(SELECT name FROM partners WHERE id = r.carrier_id),
        'expiring_soon', (r.valid_to - v_on) <= 7,
        'days_left',   (r.valid_to - v_on)
      ) ORDER BY r.valid_to ASC, r.pol, r.pod)
      FROM rates r
      WHERE r.tenant_id = v_tid
        AND r.status = 'ACTIVE'
        AND r.valid_from <= v_on
        AND r.valid_to   >= v_on
        AND (p_pol  IS NULL OR upper(r.pol)  = upper(p_pol))
        AND (p_pod  IS NULL OR upper(r.pod)  = upper(p_pod))
        AND (p_mode IS NULL OR r.mode        = upper(p_mode))
      LIMIT p_limit
    ), '[]'),
    'total_active', (
      SELECT count(*) FROM rates
      WHERE tenant_id = v_tid AND status = 'ACTIVE'
        AND valid_from <= v_on AND valid_to >= v_on
    ),
    'expiring_soon_count', (
      SELECT count(*) FROM rates
      WHERE tenant_id = v_tid AND status = 'ACTIVE'
        AND valid_from <= v_on AND valid_to >= v_on
        AND (valid_to - v_on) <= 7
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION api_rate_search(text, text, text, date, int) TO authenticated;

-- ============================================================
-- api_quote_build — tự động xây báo giá từ shipment + rate sheet
-- ============================================================
CREATE OR REPLACE FUNCTION api_quote_build(
  p_shipment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      app_users := fn_current_user();
  v_doc     documents;
  v_tid     uuid;
  v_on      date := (fn_now())::date;
  v_pol     text;
  v_pod     text;
  v_mode    text;
  v_rate    rates%ROWTYPE;
  v_ar      numeric := 0;
  v_ap      numeric := 0;
  v_lines   jsonb := '[]';
  v_cnt_20  int := 0;
  v_cnt_40  int := 0;
  v_cnt_40h int := 0;
  v_cbm     numeric := 0;
  v_chg_amt numeric;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'RATE', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem bảng giá');
  END IF;

  SELECT * INTO v_doc FROM documents WHERE id = p_shipment_id;
  IF v_doc.id IS NULL THEN RETURN fn_fail('NOT_FOUND', 'Không tìm thấy lô hàng'); END IF;
  IF v_doc.doc_type <> 'SHIPMENT' THEN RETURN fn_fail('BAD_REQUEST', 'Chỉ áp dụng cho SHIPMENT'); END IF;

  v_tid  := v_doc.tenant_id;
  v_pol  := upper(coalesce(v_doc.data->>'pol', ''));
  v_pod  := upper(coalesce(v_doc.data->>'pod', ''));
  v_mode := upper(coalesce(v_doc.data->>'mode', 'FCL'));

  -- Container counts for FCL
  IF v_mode = 'FCL' THEN
    SELECT
      coalesce(sum(CASE WHEN container_type = '20DC' OR container_type = '20OT' THEN 1 ELSE 0 END), 0),
      coalesce(sum(CASE WHEN container_type = '40DC' OR container_type = '40OT' THEN 1 ELSE 0 END), 0),
      coalesce(sum(CASE WHEN container_type = '40HC' OR container_type = '40RF' THEN 1 ELSE 0 END), 0)
    INTO v_cnt_20, v_cnt_40, v_cnt_40h
    FROM containers WHERE shipment_id = p_shipment_id;
  END IF;

  -- CBM for LCL
  IF v_mode = 'LCL' THEN
    v_cbm := coalesce((v_doc.data->>'cbm')::numeric, 0);
  END IF;

  -- Find best matching rate
  SELECT * INTO v_rate
  FROM rates
  WHERE tenant_id = v_tid
    AND upper(pol) = v_pol AND upper(pod) = v_pod AND mode = v_mode
    AND status = 'ACTIVE'
    AND valid_from <= v_on AND valid_to >= v_on
  ORDER BY valid_to ASC  -- prefer soonest-expiring (spot), or add rate_type preference
  LIMIT 1;

  IF v_rate.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'shipment_id', p_shipment_id,
      'route', v_pol || ' → ' || v_pod,
      'mode', v_mode,
      'rate_found', false,
      'message', 'Không tìm thấy cước còn hiệu lực cho tuyến ' || v_pol || ' → ' || v_pod,
      'ar_total', 0,
      'ap_total', 0,
      'margin', 0,
      'lines', '[]'
    );
  END IF;

  -- Build quote lines for FCL
  IF v_mode = 'FCL' THEN
    IF v_cnt_20 > 0 AND v_rate.rate_20ft IS NOT NULL THEN
      v_chg_amt := v_cnt_20 * v_rate.rate_20ft;
      v_ar := v_ar + v_chg_amt;
      v_lines := v_lines || jsonb_build_object('charge_code','OCEAN_FREIGHT','description',
        'Ocean Freight 20DC × ' || v_cnt_20, 'qty', v_cnt_20, 'unit_price', v_rate.rate_20ft,
        'amount', v_chg_amt, 'currency', v_rate.currency, 'charge_type', 'AR');
    END IF;
    IF v_cnt_40 > 0 AND v_rate.rate_40ft IS NOT NULL THEN
      v_chg_amt := v_cnt_40 * v_rate.rate_40ft;
      v_ar := v_ar + v_chg_amt;
      v_lines := v_lines || jsonb_build_object('charge_code','OCEAN_FREIGHT','description',
        'Ocean Freight 40DC × ' || v_cnt_40, 'qty', v_cnt_40, 'unit_price', v_rate.rate_40ft,
        'amount', v_chg_amt, 'currency', v_rate.currency, 'charge_type', 'AR');
    END IF;
    IF v_cnt_40h > 0 AND v_rate.rate_40hc IS NOT NULL THEN
      v_chg_amt := v_cnt_40h * v_rate.rate_40hc;
      v_ar := v_ar + v_chg_amt;
      v_lines := v_lines || jsonb_build_object('charge_code','OCEAN_FREIGHT','description',
        'Ocean Freight 40HC × ' || v_cnt_40h, 'qty', v_cnt_40h, 'unit_price', v_rate.rate_40hc,
        'amount', v_chg_amt, 'currency', v_rate.currency, 'charge_type', 'AR');
    END IF;
  END IF;

  -- LCL: per CBM
  IF v_mode = 'LCL' AND v_rate.rate_per_cbm IS NOT NULL AND v_cbm > 0 THEN
    v_chg_amt := v_cbm * v_rate.rate_per_cbm;
    v_ar := v_ar + v_chg_amt;
    v_lines := v_lines || jsonb_build_object('charge_code','OCEAN_FREIGHT','description',
      'Ocean Freight LCL ' || v_cbm || ' CBM × ' || v_rate.rate_per_cbm,
      'qty', v_cbm, 'unit_price', v_rate.rate_per_cbm,
      'amount', v_chg_amt, 'currency', v_rate.currency, 'charge_type', 'AR');
  END IF;

  -- Add surcharges from rate
  DECLARE sur jsonb;
  BEGIN
    FOR sur IN SELECT * FROM jsonb_array_elements(v_rate.surcharges) LOOP
      v_chg_amt := coalesce((sur->>'amount')::numeric, 0);
      IF v_chg_amt > 0 THEN
        IF coalesce(sur->>'charge_type', 'AR') = 'AP' THEN
          v_ap := v_ap + v_chg_amt;
        ELSE
          v_ar := v_ar + v_chg_amt;
        END IF;
        v_lines := v_lines || jsonb_build_object(
          'charge_code', sur->>'code',
          'description', sur->>'name',
          'qty', 1, 'unit_price', v_chg_amt,
          'amount', v_chg_amt,
          'currency', coalesce(sur->>'currency', v_rate.currency),
          'charge_type', coalesce(sur->>'charge_type', 'AR')
        );
      END IF;
    END LOOP;
  END;

  -- Existing charges from shipment_charges
  SELECT
    coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd ELSE 0 END), 0),
    coalesce(sum(CASE WHEN charge_type='AP' THEN amount_vnd ELSE 0 END), 0)
  INTO v_ar, v_ap
  FROM shipment_charges WHERE shipment_id = p_shipment_id;
  -- Override with quote lines sum if no existing charges
  IF v_ar = 0 AND v_ap = 0 THEN
    SELECT
      coalesce(sum(CASE WHEN l->>'charge_type'='AR' THEN (l->>'amount')::numeric ELSE 0 END), 0),
      coalesce(sum(CASE WHEN l->>'charge_type'='AP' THEN (l->>'amount')::numeric ELSE 0 END), 0)
    INTO v_ar, v_ap
    FROM jsonb_array_elements(v_lines) l;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'shipment_id', p_shipment_id,
    'route', v_pol || ' → ' || v_pod,
    'mode', v_mode,
    'rate_found', true,
    'rate_id', v_rate.id,
    'rate_type', v_rate.rate_type,
    'valid_to', v_rate.valid_to,
    'expiring_soon', (v_rate.valid_to - v_on) <= 7,
    'currency', v_rate.currency,
    'ar_total', v_ar,
    'ap_total', v_ap,
    'margin', v_ar - v_ap,
    'margin_pct', CASE WHEN v_ar > 0 THEN round((v_ar - v_ap) / v_ar * 100, 2) ELSE 0 END,
    'lines', v_lines
  );
END $$;

GRANT EXECUTE ON FUNCTION api_quote_build(uuid) TO authenticated;

-- ============================================================
-- api_rate_import — bulk import rate sheet (per-row error report)
-- ============================================================
CREATE OR REPLACE FUNCTION api_rate_import(
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      app_users := fn_current_user();
  v_tid     uuid;
  v_row     jsonb;
  v_idx     int := 0;
  v_ok      int := 0;
  v_errors  jsonb := '[]';
  v_carrier uuid;
  v_err     text;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'RATE', 'CREATE') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền nhập bảng giá');
  END IF;
  v_tid := fn_current_tenant();

  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN fn_fail('BAD_REQUEST', 'Không có dòng dữ liệu nào');
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_idx  := v_idx + 1;
    v_err  := NULL;
    v_carrier := NULL;

    -- Validate required fields
    IF v_row->>'pol' IS NULL OR trim(v_row->>'pol') = '' THEN
      v_err := 'Thiếu POL (cảng xếp hàng)';
    ELSIF v_row->>'pod' IS NULL OR trim(v_row->>'pod') = '' THEN
      v_err := 'Thiếu POD (cảng dỡ hàng)';
    ELSIF v_row->>'valid_from' IS NULL THEN
      v_err := 'Thiếu valid_from (ngày hiệu lực)';
    ELSIF v_row->>'valid_to' IS NULL THEN
      v_err := 'Thiếu valid_to (ngày hết hạn)';
    ELSIF (v_row->>'valid_to')::date < (v_row->>'valid_from')::date THEN
      v_err := 'valid_to phải >= valid_from';
    ELSIF (v_row->>'valid_from')::date IS NULL THEN
      v_err := 'valid_from không hợp lệ (định dạng YYYY-MM-DD)';
    END IF;

    -- Validate mode
    IF v_err IS NULL AND NOT (coalesce(upper(v_row->>'mode'), 'FCL') IN ('FCL','LCL','AIR','RAIL','TRUCK')) THEN
      v_err := 'mode phải là FCL / LCL / AIR / RAIL / TRUCK';
    END IF;

    -- Resolve carrier
    IF v_err IS NULL AND v_row->>'carrier_code' IS NOT NULL THEN
      SELECT id INTO v_carrier FROM partners
      WHERE tenant_id = v_tid AND code = upper(trim(v_row->>'carrier_code')) LIMIT 1;
      IF v_carrier IS NULL THEN
        v_err := 'Không tìm thấy carrier: ' || (v_row->>'carrier_code');
      END IF;
    END IF;

    IF v_err IS NOT NULL THEN
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'error', v_err);
      CONTINUE;
    END IF;

    -- Insert (valid rows proceed individually — errors don't block others)
    BEGIN
      INSERT INTO rates (
        tenant_id, carrier_id, pol, pod, mode, rate_type,
        valid_from, valid_to, currency,
        rate_20ft, rate_40ft, rate_40hc, rate_per_cbm, rate_per_kg,
        surcharges, notes, status, created_by
      ) VALUES (
        v_tid,
        v_carrier,
        upper(trim(v_row->>'pol')),
        upper(trim(v_row->>'pod')),
        upper(coalesce(v_row->>'mode', 'FCL')),
        upper(coalesce(v_row->>'rate_type', 'SPOT')),
        (v_row->>'valid_from')::date,
        (v_row->>'valid_to')::date,
        upper(coalesce(v_row->>'currency', 'USD')),
        (v_row->>'rate_20ft')::numeric,
        (v_row->>'rate_40ft')::numeric,
        (v_row->>'rate_40hc')::numeric,
        (v_row->>'rate_per_cbm')::numeric,
        (v_row->>'rate_per_kg')::numeric,
        coalesce(v_row->'surcharges', '[]'),
        v_row->>'notes',
        'ACTIVE',
        v_me.id
      );
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', v_ok > 0 OR jsonb_array_length(v_errors) = 0,
    'imported', v_ok,
    'total',    v_idx,
    'error_count', jsonb_array_length(v_errors),
    'errors',   v_errors
  );
END $$;

GRANT EXECUTE ON FUNCTION api_rate_import(jsonb) TO authenticated;

-- ============================================================
-- api_rate_expiry_check — cảnh báo rate sắp hết hạn (≤7 ngày)
-- Ghi email_outbox cho OPS_MANAGER trong cùng tenant.
-- Gọi từ Next.js cron hoặc thủ công bởi SYS_ADMIN.
-- ============================================================
CREATE OR REPLACE FUNCTION api_rate_expiry_check(
  p_warn_days int DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      app_users := fn_current_user();
  v_tid     uuid;
  v_today   date := (fn_now())::date;
  v_rate    record;
  v_mgr     record;
  v_count   int := 0;
  v_subj    text;
  v_body    text;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  -- Allow OPS_MANAGER or SYS_ADMIN to run
  IF fn_perm_scope(v_me.id, 'RATE', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền kiểm tra cảnh báo cước');
  END IF;
  v_tid := fn_current_tenant();

  FOR v_rate IN
    SELECT r.id, r.pol, r.pod, r.mode, r.valid_to, r.currency,
           p.name AS carrier_name,
           (r.valid_to - v_today) AS days_left
    FROM rates r
    LEFT JOIN partners p ON p.id = r.carrier_id
    WHERE r.tenant_id = v_tid
      AND r.status = 'ACTIVE'
      AND r.valid_from <= v_today
      AND r.valid_to >= v_today
      AND (r.valid_to - v_today) <= p_warn_days
    ORDER BY r.valid_to ASC
  LOOP
    v_subj := format('[CẢNH BÁO] Cước %s→%s (%s) hết hạn sau %s ngày',
                     v_rate.pol, v_rate.pod, v_rate.mode, v_rate.days_left);
    v_body := format(
      'Bảng giá %s → %s (%s)%s sẽ hết hạn vào %s (còn %s ngày).' ||
      E'\n\nVui lòng gia hạn hoặc cập nhật bảng giá mới trong trang /pricing.',
      v_rate.pol, v_rate.pod, v_rate.mode,
      CASE WHEN v_rate.carrier_name IS NOT NULL THEN ' — ' || v_rate.carrier_name ELSE '' END,
      v_rate.valid_to,
      v_rate.days_left
    );

    -- Notify all OPS_MANAGER users in this tenant
    FOR v_mgr IN
      SELECT u.id, u.email
      FROM app_users u
      JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.tenant_id = v_tid
        AND u.status = 'ACTIVE'
        AND ur.role_code = 'OPS_MANAGER'
        AND u.email IS NOT NULL
    LOOP
      INSERT INTO email_outbox (user_id, to_email, subject, body, document_id, status)
      VALUES (v_mgr.id, v_mgr.email, v_subj, v_body, NULL, 'QUEUED');
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'alerts_sent', v_count,
    'checked_at', fn_now(),
    'warn_days', p_warn_days
  );
END $$;

GRANT EXECUTE ON FUNCTION api_rate_expiry_check(int) TO authenticated;

-- ============================================================
-- api_charge_codes — list charge codes for this tenant
-- ============================================================
CREATE OR REPLACE FUNCTION api_charge_codes() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED', 'Chưa đăng nhập'); END IF;
  IF fn_perm_scope(v_me.id, 'CHARGE_CODE', 'VIEW') = 0 THEN
    RETURN fn_fail('FORBIDDEN', 'Bạn không có quyền xem mã phụ phí');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort, c.code)
      FROM charge_codes c
      WHERE c.tenant_id = fn_current_tenant() AND c.status = 'ACTIVE'
    ), '[]')
  );
END $$;

GRANT EXECUTE ON FUNCTION api_charge_codes() TO authenticated;

-- ============================================================
-- ACCEPTANCE CRITERIA T10.x
-- ============================================================
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker) VALUES
  ('T10.1', 'N10_RATES', 'Rate hết hạn không trả kết quả qua api_rate_search',          'L12', false),
  ('T10.2', 'N10_RATES', 'api_rate_import bulk: import thành công các dòng hợp lệ',      'L12', false),
  ('T10.3', 'N10_RATES', 'api_rate_import: dòng lỗi bị báo cáo, không chặn dòng hợp lệ','L12', false),
  ('T10.4', 'N10_RATES', 'api_rate_expiry_check: tạo email_outbox cho rate sắp hết hạn', 'L12', false),
  ('T10.5', 'N10_RATES', 'api_quote_build: trả về margin đúng cho shipment có container', 'L12', false)
ON CONFLICT (test_code) DO NOTHING;
