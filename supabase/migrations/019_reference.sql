-- ERP General — 019 Reference Data (WP-C3)
-- Danh mục tham chiếu ngành logistics: carriers, ports, vessels, vessel_schedules.
-- + api_add_tracking_event: nhập sự kiện tracking thủ công / từ adapter ngoài.
-- + api_import_reference: nhập hàng loạt qua CSV.
-- Nguyên tắc: KHÔNG gọi HTTP từ Postgres. Adapter HTTP đặt ở tầng Next.js (WP-C3 phase 2).

-- ============================================================
-- 1. CARRIERS (hãng tàu / hãng hàng không / đơn vị vận chuyển)
-- ============================================================
CREATE TABLE IF NOT EXISTS carriers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id),
  code        text        NOT NULL,                -- viết tắt nội bộ (e.g. 'EVER', 'COSCO')
  name        text        NOT NULL,
  scac        text,                                -- Standard Carrier Alpha Code (4 chars, biển)
  iata        text,                                -- IATA 2-char code (hàng không)
  country     text,
  mode        text        NOT NULL DEFAULT 'SEA'   -- SEA | AIR | RAIL | TRUCK
                          CHECK (mode IN ('SEA','AIR','RAIL','TRUCK','ALL')),
  status      text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at  timestamptz DEFAULT fn_now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_carriers_tenant ON carriers(tenant_id);

ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.carriers FROM anon, authenticated;
DROP POLICY IF EXISTS read_tenant ON public.carriers;
CREATE POLICY read_tenant ON public.carriers FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());

-- ============================================================
-- 2. PORTS (cảng — UN/LOCODE tiêu chuẩn)
-- ============================================================
CREATE TABLE IF NOT EXISTS ports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id),
  locode      text        NOT NULL,                -- UN/LOCODE 5 ký tự, e.g. 'VNSGN', 'USHOU'
  name        text        NOT NULL,
  country     text,
  timezone    text,                                -- e.g. 'Asia/Ho_Chi_Minh'
  mode        text        NOT NULL DEFAULT 'SEA'   -- SEA | AIR | RAIL | LAND
                          CHECK (mode IN ('SEA','AIR','RAIL','LAND','ALL')),
  status      text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at  timestamptz DEFAULT fn_now(),
  UNIQUE (tenant_id, locode)
);

CREATE INDEX IF NOT EXISTS idx_ports_tenant ON ports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ports_locode ON ports(tenant_id, locode text_pattern_ops);

ALTER TABLE ports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ports FROM anon, authenticated;
DROP POLICY IF EXISTS read_tenant ON public.ports;
CREATE POLICY read_tenant ON public.ports FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());

-- ============================================================
-- 3. VESSELS (tàu / máy bay)
-- ============================================================
CREATE TABLE IF NOT EXISTS vessels (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id),
  name        text        NOT NULL,
  imo_no      text,                                -- IMO number (7 digits)
  call_sign   text,
  carrier_id  uuid        REFERENCES carriers(id),
  flag        text,                                -- quốc gia đăng ký (2-char ISO)
  vessel_type text        NOT NULL DEFAULT 'CONTAINER'
                          CHECK (vessel_type IN ('CONTAINER','BULK','TANKER','RORO','AIRCRAFT','OTHER')),
  status      text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at  timestamptz DEFAULT fn_now()
);

CREATE INDEX IF NOT EXISTS idx_vessels_tenant   ON vessels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vessels_carrier  ON vessels(carrier_id);

ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vessels FROM anon, authenticated;
DROP POLICY IF EXISTS read_tenant ON public.vessels;
CREATE POLICY read_tenant ON public.vessels FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());

-- ============================================================
-- 4. VESSEL SCHEDULES (lịch tàu / chuyến bay)
-- ============================================================
CREATE TABLE IF NOT EXISTS vessel_schedules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id),
  vessel_id    uuid        REFERENCES vessels(id),
  carrier_id   uuid        REFERENCES carriers(id),
  pol_code     text        NOT NULL,               -- port of loading (UN/LOCODE)
  pod_code     text        NOT NULL,               -- port of discharge (UN/LOCODE)
  voyage_no    text,
  etd          date        NOT NULL,               -- estimated time of departure
  eta          date        NOT NULL,               -- estimated time of arrival
  cutoff_date  date,                               -- booking cutoff
  transit_days int         GENERATED ALWAYS AS (eta - etd) STORED,
  status       text        NOT NULL DEFAULT 'OPEN'
                           CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
  notes        text,
  created_at   timestamptz DEFAULT fn_now(),
  UNIQUE (tenant_id, carrier_id, voyage_no, pol_code, pod_code) NULLS NOT DISTINCT
);

CREATE INDEX IF NOT EXISTS idx_vs_tenant  ON vessel_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vs_route   ON vessel_schedules(tenant_id, pol_code, pod_code, etd);
CREATE INDEX IF NOT EXISTS idx_vs_carrier ON vessel_schedules(carrier_id, etd);

ALTER TABLE vessel_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vessel_schedules FROM anon, authenticated;
DROP POLICY IF EXISTS read_tenant ON public.vessel_schedules;
CREATE POLICY read_tenant ON public.vessel_schedules FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant());

-- ============================================================
-- 5. READ APIs
-- ============================================================

-- 5a. api_carriers
CREATE OR REPLACE FUNCTION api_carriers(
  p_search  text    DEFAULT NULL,
  p_mode    text    DEFAULT NULL,
  p_limit   int     DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_q text := nullif(trim(p_search),'');
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'name', c.name,
        'scac', c.scac, 'iata', c.iata, 'country', c.country,
        'mode', c.mode, 'status', c.status
      ) ORDER BY c.name), '[]')
    )
    FROM carriers c
    WHERE c.tenant_id = fn_current_tenant()
      AND c.status = 'ACTIVE'
      AND (p_mode IS NULL OR c.mode = p_mode OR c.mode = 'ALL')
      AND (v_q IS NULL OR c.name ILIKE '%'||v_q||'%' OR c.code ILIKE '%'||v_q||'%' OR c.scac ILIKE '%'||v_q||'%')
    LIMIT greatest(p_limit, 1)
  );
END $$;

-- 5b. api_ports
CREATE OR REPLACE FUNCTION api_ports(
  p_search  text    DEFAULT NULL,
  p_mode    text    DEFAULT NULL,
  p_limit   int     DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_q text := nullif(trim(p_search),'');
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'locode', p.locode, 'name', p.name,
        'country', p.country, 'timezone', p.timezone, 'mode', p.mode, 'status', p.status
      ) ORDER BY p.locode), '[]')
    )
    FROM ports p
    WHERE p.tenant_id = fn_current_tenant()
      AND p.status = 'ACTIVE'
      AND (p_mode IS NULL OR p.mode = p_mode OR p.mode = 'ALL')
      AND (v_q IS NULL OR p.name ILIKE '%'||v_q||'%' OR p.locode ILIKE '%'||v_q||'%' OR p.country ILIKE '%'||v_q||'%')
    LIMIT greatest(p_limit, 1)
  );
END $$;

-- 5c. api_vessels
CREATE OR REPLACE FUNCTION api_vessels(
  p_search      text    DEFAULT NULL,
  p_carrier_id  uuid    DEFAULT NULL,
  p_limit       int     DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user(); v_q text := nullif(trim(p_search),'');
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'imo_no', v.imo_no,
        'carrier_id', v.carrier_id,
        'carrier_name', (SELECT c.name FROM carriers c WHERE c.id = v.carrier_id),
        'flag', v.flag, 'vessel_type', v.vessel_type, 'status', v.status
      ) ORDER BY v.name), '[]')
    )
    FROM vessels v
    WHERE v.tenant_id = fn_current_tenant()
      AND v.status = 'ACTIVE'
      AND (p_carrier_id IS NULL OR v.carrier_id = p_carrier_id)
      AND (v_q IS NULL OR v.name ILIKE '%'||v_q||'%' OR v.imo_no ILIKE '%'||v_q||'%')
    LIMIT greatest(p_limit, 1)
  );
END $$;

-- 5d. api_vessel_schedules
CREATE OR REPLACE FUNCTION api_vessel_schedules(
  p_pol         text    DEFAULT NULL,
  p_pod         text    DEFAULT NULL,
  p_from_date   date    DEFAULT NULL,
  p_to_date     date    DEFAULT NULL,
  p_carrier_id  uuid    DEFAULT NULL,
  p_limit       int     DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me app_users := fn_current_user();
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'total', count(*),
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'id',           vs.id,
        'vessel_name',  (SELECT v.name FROM vessels v WHERE v.id = vs.vessel_id),
        'carrier_name', (SELECT c.name FROM carriers c WHERE c.id = vs.carrier_id),
        'carrier_code', (SELECT c.code FROM carriers c WHERE c.id = vs.carrier_id),
        'pol_code',     vs.pol_code,
        'pol_name',     (SELECT p.name FROM ports p WHERE p.tenant_id = fn_current_tenant() AND p.locode = vs.pol_code),
        'pod_code',     vs.pod_code,
        'pod_name',     (SELECT p.name FROM ports p WHERE p.tenant_id = fn_current_tenant() AND p.locode = vs.pod_code),
        'voyage_no',    vs.voyage_no,
        'etd',          vs.etd,
        'eta',          vs.eta,
        'transit_days', vs.transit_days,
        'cutoff_date',  vs.cutoff_date,
        'status',       vs.status,
        'notes',        vs.notes
      ) ORDER BY vs.etd, vs.pol_code), '[]')
    )
    FROM vessel_schedules vs
    WHERE vs.tenant_id = fn_current_tenant()
      AND vs.status = 'OPEN'
      AND (p_pol IS NULL OR upper(vs.pol_code) = upper(p_pol))
      AND (p_pod IS NULL OR upper(vs.pod_code) = upper(p_pod))
      AND (p_carrier_id IS NULL OR vs.carrier_id = p_carrier_id)
      AND (p_from_date IS NULL OR vs.etd >= p_from_date)
      AND (p_to_date   IS NULL OR vs.etd <= p_to_date)
    LIMIT greatest(p_limit, 1)
  );
END $$;

-- ============================================================
-- 6. WRITE API: api_add_tracking_event
--    Nhập sự kiện tracking thủ công hoặc từ adapter ngoài (Next.js tầng trên gọi).
--    Adapter HTTP thật (hãng tàu API) → adapter ở tầng Next.js, không gọi từ Postgres.
-- ============================================================
CREATE OR REPLACE FUNCTION api_add_tracking_event(
  p_shipment_id  uuid,
  p_event_code   text,
  p_event_name   text,
  p_location     text    DEFAULT NULL,
  p_event_time   timestamptz DEFAULT NULL,
  p_actual       boolean DEFAULT true,
  p_notes        text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_doc documents;
  v_id  uuid;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  SELECT * INTO v_doc FROM documents WHERE id = p_shipment_id AND doc_type = 'SHIPMENT';
  IF v_doc.id IS NULL THEN RETURN fn_fail('NOT_FOUND','Không tìm thấy lô hàng'); END IF;
  IF NOT fn_doc_in_scope(v_me.id, v_doc, 'SHIPMENT', 'EDIT') THEN
    RETURN fn_fail('FORBIDDEN','Không có quyền cập nhật lô hàng này');
  END IF;
  IF p_event_code IS NULL OR trim(p_event_code) = '' THEN
    RETURN fn_fail('VALIDATION','event_code không được trống');
  END IF;
  IF p_event_name IS NULL OR trim(p_event_name) = '' THEN
    RETURN fn_fail('VALIDATION','event_name không được trống');
  END IF;

  INSERT INTO tracking_events
    (shipment_id, event_code, event_name, location, event_time, actual, notes, created_by, tenant_id)
  VALUES
    (p_shipment_id, upper(trim(p_event_code)), trim(p_event_name),
     nullif(trim(p_location),''), p_event_time, p_actual, nullif(trim(p_notes),''),
     v_me.id, v_doc.tenant_id)
  RETURNING id INTO v_id;

  -- Ghi audit trail
  INSERT INTO audit_trail (table_name, record_id, action, new_value, user_id, tenant_id)
  VALUES ('tracking_events', v_id, 'INSERT',
          jsonb_build_object('shipment_id', p_shipment_id, 'event_code', p_event_code,
                             'event_name', p_event_name, 'actual', p_actual),
          v_me.id, v_doc.tenant_id);

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- ============================================================
-- 7. WRITE API: api_import_reference
--    Nhập hàng loạt carriers / ports / vessels từ CSV đã parse ở client.
--    p_type: 'carrier' | 'port' | 'vessel'
--    p_rows: [{code, name, ...}, ...]
--    Upsert theo (tenant_id, code/locode/name).
-- ============================================================
CREATE OR REPLACE FUNCTION api_import_reference(
  p_type  text,
  p_rows  jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me       app_users := fn_current_user();
  v_tid      uuid;
  v_row      jsonb;
  v_inserted int := 0;
  v_errors   jsonb := '[]';
  v_i        int  := 0;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;

  -- Chỉ admin / manager mới được import
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = v_me.id
      AND ur.role_code IN ('SYSTEM_ADMIN','OPS_MANAGER','CEO','COO')
  ) THEN
    RETURN fn_fail('FORBIDDEN','Chỉ SYSTEM_ADMIN / OPS_MANAGER mới được import danh mục');
  END IF;

  v_tid := fn_current_tenant();

  IF p_type NOT IN ('carrier','port','vessel','schedule') THEN
    RETURN fn_fail('VALIDATION', 'p_type phải là carrier | port | vessel | schedule');
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_i := v_i + 1;
    BEGIN
      IF p_type = 'carrier' THEN
        INSERT INTO carriers (tenant_id, code, name, scac, iata, country, mode)
        VALUES (
          v_tid,
          upper(trim(v_row->>'code')),
          trim(v_row->>'name'),
          nullif(trim(v_row->>'scac'),''),
          nullif(trim(v_row->>'iata'),''),
          nullif(trim(v_row->>'country'),''),
          coalesce(nullif(upper(trim(v_row->>'mode')),''), 'SEA')
        )
        ON CONFLICT (tenant_id, code) DO UPDATE SET
          name    = excluded.name,
          scac    = coalesce(excluded.scac, carriers.scac),
          iata    = coalesce(excluded.iata, carriers.iata),
          country = coalesce(excluded.country, carriers.country),
          mode    = excluded.mode,
          status  = 'ACTIVE';

      ELSIF p_type = 'port' THEN
        INSERT INTO ports (tenant_id, locode, name, country, timezone, mode)
        VALUES (
          v_tid,
          upper(trim(v_row->>'locode')),
          trim(v_row->>'name'),
          nullif(trim(v_row->>'country'),''),
          nullif(trim(v_row->>'timezone'),''),
          coalesce(nullif(upper(trim(v_row->>'mode')),''), 'SEA')
        )
        ON CONFLICT (tenant_id, locode) DO UPDATE SET
          name     = excluded.name,
          country  = coalesce(excluded.country, ports.country),
          timezone = coalesce(excluded.timezone, ports.timezone),
          mode     = excluded.mode,
          status   = 'ACTIVE';

      ELSIF p_type = 'vessel' THEN
        DECLARE v_carrier_id uuid;
        BEGIN
          IF v_row->>'carrier_code' IS NOT NULL THEN
            SELECT id INTO v_carrier_id FROM carriers
            WHERE tenant_id = v_tid AND code = upper(trim(v_row->>'carrier_code'));
          END IF;
          INSERT INTO vessels (tenant_id, name, imo_no, carrier_id, flag, vessel_type)
          VALUES (
            v_tid,
            trim(v_row->>'name'),
            nullif(trim(v_row->>'imo_no'),''),
            v_carrier_id,
            nullif(upper(trim(v_row->>'flag')),''),
            coalesce(nullif(upper(trim(v_row->>'vessel_type')),''), 'CONTAINER')
          )
          ON CONFLICT DO NOTHING;
        END;

      ELSIF p_type = 'schedule' THEN
        DECLARE v_carrier_id2 uuid; v_vessel_id uuid;
        BEGIN
          IF v_row->>'carrier_code' IS NOT NULL THEN
            SELECT id INTO v_carrier_id2 FROM carriers
            WHERE tenant_id = v_tid AND code = upper(trim(v_row->>'carrier_code'));
          END IF;
          IF v_row->>'vessel_name' IS NOT NULL THEN
            SELECT id INTO v_vessel_id FROM vessels
            WHERE tenant_id = v_tid AND name ILIKE trim(v_row->>'vessel_name') LIMIT 1;
          END IF;
          INSERT INTO vessel_schedules
            (tenant_id, vessel_id, carrier_id, pol_code, pod_code, voyage_no, etd, eta, cutoff_date, notes)
          VALUES (
            v_tid, v_vessel_id, v_carrier_id2,
            upper(trim(v_row->>'pol_code')),
            upper(trim(v_row->>'pod_code')),
            nullif(trim(v_row->>'voyage_no'),''),
            (v_row->>'etd')::date,
            (v_row->>'eta')::date,
            nullif(v_row->>'cutoff_date','')::date,
            nullif(trim(v_row->>'notes'),'')
          )
          ON CONFLICT (tenant_id, carrier_id, voyage_no, pol_code, pod_code) NULLS NOT DISTINCT
          DO UPDATE SET
            etd          = excluded.etd,
            eta          = excluded.eta,
            cutoff_date  = coalesce(excluded.cutoff_date, vessel_schedules.cutoff_date),
            status       = 'OPEN';
        END;
      END IF;

      v_inserted := v_inserted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('row', v_i, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'type', p_type,
    'inserted', v_inserted,
    'total', jsonb_array_length(p_rows),
    'errors', v_errors
  );
END $$;

-- ============================================================
-- 8. GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION api_carriers(text, text, int)            TO authenticated;
GRANT EXECUTE ON FUNCTION api_ports(text, text, int)               TO authenticated;
GRANT EXECUTE ON FUNCTION api_vessels(text, uuid, int)             TO authenticated;
GRANT EXECUTE ON FUNCTION api_vessel_schedules(text, text, date, date, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION api_add_tracking_event(uuid, text, text, text, timestamptz, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION api_import_reference(text, jsonb)        TO authenticated;

-- ============================================================
-- 9. SEED DATA (danh mục mẫu dùng cho demo)
-- ============================================================
DO $$
DECLARE def_tid constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN

-- Carriers
INSERT INTO carriers (tenant_id, code, name, scac, mode) VALUES
  (def_tid, 'EVER',   'Evergreen Marine Corporation',  'EGLV', 'SEA'),
  (def_tid, 'COSCO',  'COSCO Shipping Lines',          'COSU', 'SEA'),
  (def_tid, 'HLCU',   'Hapag-Lloyd',                   'HLCU', 'SEA'),
  (def_tid, 'HMM',    'HMM (Hyundai Merchant Marine)', 'HDMU', 'SEA'),
  (def_tid, 'MSC',    'Mediterranean Shipping Company','MSCU', 'SEA'),
  (def_tid, 'CMA',    'CMA CGM',                       'CMDU', 'SEA'),
  (def_tid, 'VNA',    'Vietnam Airlines Cargo',        'VN',   'AIR'),
  (def_tid, 'QR',     'Qatar Airways Cargo',           'QR',   'AIR')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Ports
INSERT INTO ports (tenant_id, locode, name, country, timezone, mode) VALUES
  (def_tid, 'VNSGN', 'Hồ Chí Minh (Tân Cảng)',   'VN', 'Asia/Ho_Chi_Minh',  'SEA'),
  (def_tid, 'VNHAN', 'Hà Nội (ICD Gia Lâm)',      'VN', 'Asia/Ho_Chi_Minh',  'ALL'),
  (def_tid, 'VVHAN', 'Hà Nội Nội Bài',            'VN', 'Asia/Ho_Chi_Minh',  'AIR'),
  (def_tid, 'USHOU', 'Houston',                   'US', 'America/Chicago',    'SEA'),
  (def_tid, 'USLAX', 'Los Angeles',               'US', 'America/Los_Angeles','SEA'),
  (def_tid, 'NLRTM', 'Rotterdam',                 'NL', 'Europe/Amsterdam',   'SEA'),
  (def_tid, 'KRPUS', 'Busan',                     'KR', 'Asia/Seoul',         'SEA'),
  (def_tid, 'DEHAM', 'Hamburg',                   'DE', 'Europe/Berlin',      'SEA'),
  (def_tid, 'DEFRA', 'Frankfurt',                 'DE', 'Europe/Berlin',      'AIR'),
  (def_tid, 'SGSIN', 'Singapore',                 'SG', 'Asia/Singapore',     'SEA'),
  (def_tid, 'CNSHA', 'Thượng Hải',               'CN', 'Asia/Shanghai',      'SEA'),
  (def_tid, 'JPNGO', 'Nagoya',                    'JP', 'Asia/Tokyo',         'SEA')
ON CONFLICT (tenant_id, locode) DO NOTHING;

-- Vessels
INSERT INTO vessels (tenant_id, name, imo_no, carrier_id, flag, vessel_type)
SELECT
  def_tid, v.name, v.imo_no,
  (SELECT id FROM carriers WHERE tenant_id = def_tid AND code = v.carr_code),
  v.flag, 'CONTAINER'
FROM (VALUES
  ('EVER LIVING',          '9604430', 'EVER', 'PA'),
  ('EVER GOLDEN',          '9833219', 'EVER', 'PA'),
  ('COSCO SHIPPING STAR',  '9741369', 'COSCO','CN'),
  ('BERLIN EXPRESS',       '9516462', 'HLCU', 'DE'),
  ('HMM ALGECIRAS',        '9863297', 'HMM',  'KR')
) v(name, imo_no, carr_code, flag)
ON CONFLICT DO NOTHING;

-- Vessel Schedules (lịch tàu mẫu — ETD tương đối so với ngày hiện tại)
INSERT INTO vessel_schedules (tenant_id, vessel_id, carrier_id, pol_code, pod_code, voyage_no, etd, eta, cutoff_date)
SELECT
  def_tid,
  (SELECT id FROM vessels WHERE tenant_id = def_tid AND name = vs.vname LIMIT 1),
  (SELECT id FROM carriers WHERE tenant_id = def_tid AND code = vs.ccode),
  vs.pol, vs.pod,
  vs.voy,
  (current_date + vs.d_etd)::date,
  (current_date + vs.d_eta)::date,
  (current_date + vs.d_etd - 3)::date
FROM (VALUES
  ('EVER LIVING',         'EVER',  'VNSGN', 'USHOU', '0138W', 5,  35),
  ('EVER LIVING',         'EVER',  'VNSGN', 'USLAX', '0139E', 7,  30),
  ('COSCO SHIPPING STAR', 'COSCO', 'VNSGN', 'NLRTM', '199W',  10, 32),
  ('BERLIN EXPRESS',      'HLCU',  'NLRTM', 'VNSGN', '044E',  14, 36),
  ('HMM ALGECIRAS',       'HMM',   'KRPUS', 'VNSGN', '0024N', 3,  10),
  ('EVER LIVING',         'EVER',  'VNSGN', 'USHOU', '0140W', 35, 65)
) vs(vname, ccode, pol, pod, voy, d_etd, d_eta)
ON CONFLICT (tenant_id, carrier_id, voyage_no, pol_code, pod_code) NULLS NOT DISTINCT DO NOTHING;

RAISE NOTICE 'Seed 019: carriers/ports/vessels/schedules OK';
END $$;

-- ============================================================
-- 10. ACCEPTANCE CRITERIA T10.x (WP-C3 Reference + Tracking)
-- ============================================================
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker) VALUES
  ('T10.1', 'N10_REFERENCE', 'api_carriers trả đúng tenant — tenant khác không thấy', 'L12', false),
  ('T10.2', 'N10_REFERENCE', 'api_vessel_schedules lọc theo POL+POD chính xác',       'L12', false),
  ('T10.3', 'N10_REFERENCE', 'api_add_tracking_event thêm sự kiện — unauthenticated bị từ chối', 'L12', false),
  ('T10.4', 'N10_REFERENCE', 'api_import_reference nhập hàng loạt carriers và ports',  'L12', false),
  ('T10.5', 'N10_REFERENCE', 'SELECT trực tiếp bảng carriers bị từ chối cho authenticated', 'L12', false)
ON CONFLICT (test_code) DO NOTHING;
