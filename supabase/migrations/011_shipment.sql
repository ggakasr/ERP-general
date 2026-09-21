-- ERP General — 011 Shipment: logistics entity SHIPMENT + BOOKING/HBL/DO/DNOTE/CNOTE
-- Thực thể mới hoàn toàn qua cấu hình (doc_types + state_transitions).
-- Không sửa 004_engine.sql. Bảng containers + shipment_charges cốt lõi tính lãi/lỗ theo lô.

-- ============================================================
-- ROLES cho Operations
-- ============================================================
INSERT INTO roles (code, name, description, sort) VALUES
  ('OPS_MANAGER',  'Trưởng phòng điều hành', 'Duyệt shipment, booking, vận đơn', 60),
  ('OPS_STAFF',    'Nhân viên điều hành',    'Lập và theo dõi shipment, cước phí', 61),
  ('CS_FREIGHT',   'Kinh doanh logistics',   'Báo giá, lập Debit Note/Credit Note', 62)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- PERMISSIONS
-- ============================================================
-- Re-create _perm locally (_perm was dropped at the end of 003_config.sql)
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
DECLARE
  ops_docs text := 'SHIPMENT,BOOKING,HBL,DO,DNOTE,CNOTE';
BEGIN
  PERFORM _perm('OPS_MANAGER', ops_docs, 'VIEW,CREATE,EDIT,APPROVE', 'BRANCH');
  PERFORM _perm('OPS_STAFF',   ops_docs, 'VIEW,CREATE,EDIT',         'BRANCH');
  PERFORM _perm('CS_FREIGHT',  ops_docs, 'VIEW,CREATE',              'BRANCH');
  -- DNOTE/CNOTE cũng cần ACCOUNTANT thấy
  PERFORM _perm('ACCOUNTANT',  'DNOTE,CNOTE', 'VIEW', 'BRANCH');
  PERFORM _perm('CHIEF_ACCOUNTANT', 'DNOTE,CNOTE', 'VIEW,APPROVE', 'COMPANY');
  PERFORM _perm('CFO',         ops_docs, 'VIEW', 'COMPANY');
  PERFORM _perm('CEO',         ops_docs, 'VIEW', 'COMPANY');
END $$;

-- ============================================================
-- DOC TYPES  (BM-05)
-- ============================================================
INSERT INTO doc_types (code, name, prefix, flow_code, module, initial_status, terminal_statuses, create_sod_role, sort) VALUES
  ('SHIPMENT', 'Lô hàng (Shipment)',        'SPT',  'L12', 'operations', 'DRAFT',      '{CLOSED,CANCELLED}',   'REQUESTER', 110),
  ('BOOKING',  'Booking',                   'BKG',  'L12', 'operations', 'DRAFT',      '{CONFIRMED,CANCELLED}','REQUESTER', 111),
  ('HBL',      'House Bill of Lading',      'HBL',  'L12', 'operations', 'DRAFT',      '{RELEASED,CANCELLED}', 'REQUESTER', 112),
  ('DO',       'Delivery Order',            'DO',   'L12', 'operations', 'DRAFT',      '{ISSUED,CANCELLED}',   'REQUESTER', 113),
  ('DNOTE',    'Debit Note',                'DN',   'L12', 'operations', 'DRAFT',      '{PAID,CANCELLED}',     'REQUESTER', 114),
  ('CNOTE',    'Credit Note',               'CN',   'L12', 'operations', 'DRAFT',      '{APPLIED,CANCELLED}',  'REQUESTER', 115)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- STATE TRANSITIONS — SHIPMENT
-- ============================================================
INSERT INTO state_transitions (doc_type, from_status, to_status, action, label, permission_action, permission_resource, sod_role, conditions, style, system_only, sort) VALUES
  ('SHIPMENT','DRAFT',       'BOOKED',      'book',        'Đặt chỗ',         'EDIT',    NULL,  NULL,        '{}', 'primary', false, 1),
  ('SHIPMENT','BOOKED',      'CONFIRMED',   'confirm',     'Xác nhận',        'APPROVE', NULL,  'APPROVER',  '{}', 'success', false, 2),
  ('SHIPMENT','CONFIRMED',   'IN_TRANSIT',  'depart',      'Cắt tàu / Lên đường', 'EDIT', NULL, NULL,        '{}', 'primary', false, 3),
  ('SHIPMENT','IN_TRANSIT',  'ARRIVED',     'arrive',      'Tàu đến',         'EDIT',    NULL,  NULL,        '{}', 'primary', false, 4),
  ('SHIPMENT','ARRIVED',     'CUSTOMS',     'customs',     'Làm thủ tục hải quan', 'EDIT', NULL, NULL,        '{}', 'default', false, 5),
  ('SHIPMENT','CUSTOMS',     'DELIVERED',   'deliver',     'Giao hàng',       'EXECUTE', NULL,  NULL,        '{}', 'success', false, 6),
  ('SHIPMENT','DELIVERED',   'CLOSED',      'close',       'Đóng lô',         'APPROVE', NULL,  'APPROVER',  '{}', 'default', false, 7),
  ('SHIPMENT','DRAFT',       'CANCELLED',   'cancel',      'Hủy',             'CREATE',  NULL,  NULL,        '{}', 'danger',  false, 9),
  ('SHIPMENT','BOOKED',      'CANCELLED',   'cancel',      'Hủy',             'APPROVE', NULL,  NULL,        '{}', 'danger',  false, 10),
  -- BOOKING
  ('BOOKING','DRAFT',        'SUBMITTED',   'submit',      'Gửi hãng tàu',    'CREATE',  NULL,  'REQUESTER', '{}', 'primary', false, 1),
  ('BOOKING','SUBMITTED',    'CONFIRMED',   'confirm',     'Hãng xác nhận',   'EDIT',    NULL,  NULL,        '{}', 'success', false, 2),
  ('BOOKING','SUBMITTED',    'REJECTED',    'reject',      'Hãng từ chối',    'EDIT',    NULL,  NULL,        '{}', 'danger',  false, 3),
  ('BOOKING','DRAFT',        'CANCELLED',   'cancel',      'Hủy',             'CREATE',  NULL,  NULL,        '{}', 'danger',  false, 9),
  -- HBL
  ('HBL','DRAFT',            'SUBMITTED',   'submit',      'Gửi duyệt',       'CREATE',  NULL,  'REQUESTER', '{}', 'primary', false, 1),
  ('HBL','SUBMITTED',        'APPROVED',    'approve',     'Phê duyệt',       'APPROVE', NULL,  'APPROVER',  '{}', 'success', false, 2),
  ('HBL','APPROVED',         'RELEASED',    'release',     'Phát hành',       'EXECUTE', NULL,  'EXECUTOR',  '{}', 'primary', false, 3),
  ('HBL','DRAFT',            'CANCELLED',   'cancel',      'Hủy',             'CREATE',  NULL,  NULL,        '{}', 'danger',  false, 9),
  -- DO
  ('DO','DRAFT',             'SUBMITTED',   'submit',      'Gửi duyệt',       'CREATE',  NULL,  'REQUESTER', '{}', 'primary', false, 1),
  ('DO','SUBMITTED',         'APPROVED',    'approve',     'Phê duyệt',       'APPROVE', NULL,  'APPROVER',  '{}', 'success', false, 2),
  ('DO','APPROVED',          'ISSUED',      'issue',       'Phát hành DO',    'EXECUTE', NULL,  'EXECUTOR',  '{}', 'primary', false, 3),
  ('DO','DRAFT',             'CANCELLED',   'cancel',      'Hủy',             'CREATE',  NULL,  NULL,        '{}', 'danger',  false, 9),
  -- DNOTE
  ('DNOTE','DRAFT',          'SUBMITTED',   'submit',      'Gửi duyệt',       'CREATE',  NULL,  'REQUESTER', '{has_lines}', 'primary', false, 1),
  ('DNOTE','SUBMITTED',      'APPROVED',    'approve',     'Phê duyệt',       'APPROVE', NULL,  'APPROVER',  '{}', 'success', false, 2),
  ('DNOTE','SUBMITTED',      'REJECTED',    'reject',      'Từ chối',         'APPROVE', NULL,  'APPROVER',  '{}', 'danger',  false, 3),
  ('DNOTE','APPROVED',       'SENT',        'send',        'Gửi khách',       'EDIT',    NULL,  NULL,        '{}', 'primary', false, 4),
  ('DNOTE','SENT',           'PARTIALLY_PAID','paid_partial','Thanh toán một phần','EXECUTE',NULL,NULL,       '{}', 'default', true,  5),
  ('DNOTE','SENT',           'PAID',        'paid',        'Đã thu đủ',       'EXECUTE', NULL,  'EXECUTOR',  '{}', 'success', false, 6),
  ('DNOTE','PARTIALLY_PAID', 'PAID',        'paid',        'Đã thu đủ',       'EXECUTE', NULL,  'EXECUTOR',  '{}', 'success', false, 7),
  ('DNOTE','DRAFT',          'CANCELLED',   'cancel',      'Hủy',             'CREATE',  NULL,  NULL,        '{}', 'danger',  false, 9),
  -- CNOTE
  ('CNOTE','DRAFT',          'SUBMITTED',   'submit',      'Gửi duyệt',       'CREATE',  NULL,  'REQUESTER', '{has_lines}', 'primary', false, 1),
  ('CNOTE','SUBMITTED',      'APPROVED',    'approve',     'Phê duyệt',       'APPROVE', NULL,  'APPROVER',  '{}', 'success', false, 2),
  ('CNOTE','APPROVED',       'APPLIED',     'apply',       'Áp dụng',         'EXECUTE', NULL,  NULL,        '{}', 'success', false, 3),
  ('CNOTE','DRAFT',          'CANCELLED',   'cancel',      'Hủy',             'CREATE',  NULL,  NULL,        '{}', 'danger',  false, 9);

-- ============================================================
-- DOC CHILD RULES: QUOT/SO → SHIPMENT → BOOKING/HBL/DO/DNOTE/CNOTE
-- ============================================================
INSERT INTO doc_child_rules (parent_type, child_type, label, parent_statuses)
  SELECT 'QUOT',    'SHIPMENT', 'Tạo Shipment',    '{DRAFT,SUBMITTED,SENT,ACCEPTED}' WHERE NOT EXISTS (SELECT 1 FROM doc_child_rules WHERE parent_type='QUOT' AND child_type='SHIPMENT');
INSERT INTO doc_child_rules (parent_type, child_type, label, parent_statuses)
  SELECT 'SHIPMENT','BOOKING',  'Tạo Booking',     '{DRAFT,BOOKED,CONFIRMED,IN_TRANSIT,ARRIVED,CUSTOMS}' WHERE NOT EXISTS (SELECT 1 FROM doc_child_rules WHERE parent_type='SHIPMENT' AND child_type='BOOKING');
INSERT INTO doc_child_rules (parent_type, child_type, label, parent_statuses)
  SELECT 'SHIPMENT','HBL',      'Tạo House B/L',   '{BOOKED,CONFIRMED,IN_TRANSIT,ARRIVED,CUSTOMS,DELIVERED}' WHERE NOT EXISTS (SELECT 1 FROM doc_child_rules WHERE parent_type='SHIPMENT' AND child_type='HBL');
INSERT INTO doc_child_rules (parent_type, child_type, label, parent_statuses)
  SELECT 'SHIPMENT','DO',       'Tạo D/O',         '{ARRIVED,CUSTOMS,DELIVERED}' WHERE NOT EXISTS (SELECT 1 FROM doc_child_rules WHERE parent_type='SHIPMENT' AND child_type='DO');
INSERT INTO doc_child_rules (parent_type, child_type, label, parent_statuses)
  SELECT 'SHIPMENT','DNOTE',    'Tạo Debit Note',  '{BOOKED,CONFIRMED,IN_TRANSIT,ARRIVED,CUSTOMS,DELIVERED,CLOSED}' WHERE NOT EXISTS (SELECT 1 FROM doc_child_rules WHERE parent_type='SHIPMENT' AND child_type='DNOTE');
INSERT INTO doc_child_rules (parent_type, child_type, label, parent_statuses)
  SELECT 'SHIPMENT','CNOTE',    'Tạo Credit Note', '{BOOKED,CONFIRMED,IN_TRANSIT,ARRIVED,CUSTOMS,DELIVERED,CLOSED}' WHERE NOT EXISTS (SELECT 1 FROM doc_child_rules WHERE parent_type='SHIPMENT' AND child_type='CNOTE');

-- ============================================================
-- CONTAINERS table  (nhiều container / lô hàng)
-- ============================================================
CREATE TABLE IF NOT EXISTS containers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id    uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  container_no   text,
  container_type text        NOT NULL DEFAULT '20DC'
                             CHECK (container_type IN ('20DC','20OT','20RF','40DC','40HC','40OT','40RF','45HC','LCL','BB')),
  seal_no        text,
  gross_weight   numeric(12,3),
  cbm            numeric(10,3),
  status         text        NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING','LOADED','DISCHARGED','RETURNED')),
  created_at     timestamptz DEFAULT fn_now()
);

CREATE INDEX IF NOT EXISTS idx_containers_shipment ON containers(shipment_id);

-- ============================================================
-- SHIPMENT CHARGES (cước phí — cốt lõi lãi/lỗ theo lô)
-- ============================================================
CREATE TABLE IF NOT EXISTS shipment_charges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id    uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  charge_code    text        NOT NULL,   -- e.g. 'OCEAN_FREIGHT','THC','DOC_FEE','INSURANCE'
  description    text,
  charge_type    text        NOT NULL CHECK (charge_type IN ('AR','AP')),
  qty            numeric(12,4) NOT NULL DEFAULT 1,
  rate           numeric(18,2) NOT NULL DEFAULT 0,
  currency       text        NOT NULL DEFAULT 'USD',
  exchange_rate  numeric(12,6) NOT NULL DEFAULT 1,
  amount_fc      numeric(18,2) GENERATED ALWAYS AS (qty * rate) STORED,
  amount_vnd     numeric(18,0) GENERATED ALWAYS AS (round(qty * rate * exchange_rate)) STORED,
  is_billable    boolean     NOT NULL DEFAULT true,
  rate_expires   date,                   -- Cảnh báo "Lãi hết hạn" khi rate_expires < now
  partner_id     uuid        REFERENCES partners(id),
  created_at     timestamptz DEFAULT fn_now()
);

CREATE INDEX IF NOT EXISTS idx_sc_shipment ON shipment_charges(shipment_id);

-- ============================================================
-- TRACKING EVENTS (stub — nhập tay giai đoạn đầu; WP-C3 sẽ mở rộng)
-- ============================================================
CREATE TABLE IF NOT EXISTS tracking_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id    uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  event_code     text        NOT NULL,   -- e.g. 'PICKUP','LOADED','DEPARTED','ARRIVED','CUSTOMS_CLEARED','DELIVERED'
  event_name     text        NOT NULL,
  location       text,
  event_time     timestamptz,
  actual         boolean     NOT NULL DEFAULT true,
  notes          text,
  created_by     uuid        REFERENCES app_users(id),
  created_at     timestamptz DEFAULT fn_now()
);

CREATE INDEX IF NOT EXISTS idx_te_shipment ON tracking_events(shipment_id);

-- ============================================================
-- RPC: api_list_shipments  (card view dành cho WP-J4)
-- ============================================================
CREATE OR REPLACE FUNCTION api_list_shipments(
  p_status  text    DEFAULT NULL,
  p_search  text    DEFAULT NULL,
  p_limit   int     DEFAULT 30,
  p_offset  int     DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_q   text      := nullif(trim(p_search), '');
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;

  RETURN (
    WITH vis AS (
      SELECT d
      FROM   documents d
      WHERE  d.doc_type = 'SHIPMENT'
        AND  fn_doc_in_scope(v_me.id, d, 'SHIPMENT', 'VIEW')
        AND  (v_q IS NULL
              OR d.number ILIKE '%'||v_q||'%'
              OR coalesce(d.data->>'job_no','') ILIKE '%'||v_q||'%'
              OR coalesce(d.data->>'pol','')    ILIKE '%'||v_q||'%'
              OR coalesce(d.data->>'pod','')    ILIKE '%'||v_q||'%'
              OR coalesce(d.title,'')           ILIKE '%'||v_q||'%'
              OR EXISTS (SELECT 1 FROM partners p WHERE p.id = d.partner_id AND p.name ILIKE '%'||v_q||'%'))
    ), filtered AS (
      SELECT d FROM vis WHERE p_status IS NULL OR (d).status = p_status
    ),
    cards AS (
      SELECT
        (d).id,
        (d).number,
        coalesce((d).data->>'job_no', (d).number)            AS job_no,
        (d).status,
        (d).title,
        (d).data->>'mode'            AS mode,
        (d).data->>'shipment_type'   AS shipment_type,
        (d).data->>'pol'             AS pol,
        (d).data->>'pod'             AS pod,
        (d).data->>'etd'             AS etd,
        (d).data->>'eta'             AS eta,
        (d).data->>'carrier'         AS carrier,
        (d).data->>'vessel'          AS vessel,
        (d).data->>'voyage'          AS voyage,
        (d).data->>'incoterm'        AS incoterm,
        -- partner
        (SELECT p.name FROM partners p WHERE p.id = (d).partner_id)  AS shipper,
        (SELECT p.name FROM partners p WHERE p.id = ((d).data->>'consignee_id')::uuid)  AS consignee,
        -- containers summary
        (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'type', c.container_type,
            'count', cnt
          ) ORDER BY c.container_type), '[]'::jsonb)
         FROM (SELECT container_type, count(*)::int AS cnt FROM containers WHERE shipment_id = (d).id GROUP BY container_type) c
        ) AS containers,
        -- cước phí tổng hợp
        (SELECT coalesce(sum(amount_vnd),0) FROM shipment_charges WHERE shipment_id=(d).id AND charge_type='AR') AS ar_total,
        (SELECT coalesce(sum(amount_vnd),0) FROM shipment_charges WHERE shipment_id=(d).id AND charge_type='AP') AS ap_total,
        -- cảnh báo hết hạn cước
        EXISTS(SELECT 1 FROM shipment_charges WHERE shipment_id=(d).id AND rate_expires IS NOT NULL AND rate_expires < current_date + 7) AS rate_expiring,
        -- người lập
        (SELECT u.full_name FROM app_users u WHERE u.id = (d).created_by) AS created_by_name,
        (d).created_at
      FROM filtered
    )
    SELECT jsonb_build_object(
      'ok', true,
      'total', (SELECT count(*) FROM filtered),
      'status_counts', coalesce((
        SELECT jsonb_object_agg(s, n)
        FROM (SELECT (d).status s, count(*)::int n FROM vis GROUP BY 1) x
      ), '{}'),
      'rows', coalesce((
        SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
        FROM (SELECT * FROM cards ORDER BY created_at DESC LIMIT greatest(p_limit,1) OFFSET greatest(p_offset,0)) c
      ), '[]')
    )
  );
END $$;

-- ============================================================
-- RPC: api_get_shipment  (detail — multi-tab data)
-- ============================================================
CREATE OR REPLACE FUNCTION api_get_shipment(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  app_users := fn_current_user();
  v_doc documents;
BEGIN
  IF v_me.id IS NULL THEN RETURN fn_fail('UNAUTHENTICATED','Chưa đăng nhập'); END IF;
  SELECT * INTO v_doc FROM documents WHERE id = p_id AND doc_type = 'SHIPMENT';
  IF v_doc.id IS NULL THEN RETURN fn_fail('NOT_FOUND','Không tìm thấy lô hàng'); END IF;
  IF NOT fn_doc_in_scope(v_me.id, v_doc, 'SHIPMENT', 'VIEW') THEN
    RETURN fn_fail('FORBIDDEN','Không có quyền xem lô hàng này');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    -- Overview
    'document', fn_doc_json(v_doc),
    'shipper',   (SELECT jsonb_build_object('id',p.id,'name',p.name,'code',p.code) FROM partners p WHERE p.id = v_doc.partner_id),
    'consignee', (SELECT jsonb_build_object('id',p.id,'name',p.name,'code',p.code) FROM partners p WHERE p.id = (v_doc.data->>'consignee_id')::uuid),
    -- Charges tab
    'charges', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',          sc.id,
        'charge_code', sc.charge_code,
        'description', sc.description,
        'charge_type', sc.charge_type,
        'qty',         sc.qty,
        'rate',        sc.rate,
        'currency',    sc.currency,
        'exchange_rate',sc.exchange_rate,
        'amount_fc',   sc.amount_fc,
        'amount_vnd',  sc.amount_vnd,
        'is_billable', sc.is_billable,
        'rate_expires',sc.rate_expires,
        'partner_name',(SELECT p.name FROM partners p WHERE p.id = sc.partner_id)
      ) ORDER BY sc.charge_type, sc.charge_code)
      FROM shipment_charges sc WHERE sc.shipment_id = p_id
    ), '[]'),
    -- Containers tab
    'containers', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.container_type, c.container_no)
      FROM containers c WHERE c.shipment_id = p_id
    ), '[]'),
    -- Tracking tab
    'tracking', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',           te.id,
        'event_code',   te.event_code,
        'event_name',   te.event_name,
        'location',     te.location,
        'event_time',   te.event_time,
        'actual',       te.actual,
        'notes',        te.notes,
        'created_by',  (SELECT u.full_name FROM app_users u WHERE u.id = te.created_by)
      ) ORDER BY te.event_time NULLS LAST)
      FROM tracking_events te WHERE te.shipment_id = p_id
    ), '[]'),
    -- Documents chain (child docs linked to this shipment)
    'child_docs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',       d.id,
        'number',   d.number,
        'doc_type', d.doc_type,
        'doc_type_name', (SELECT dt.name FROM doc_types dt WHERE dt.code = d.doc_type),
        'status',   d.status,
        'title',    d.title,
        'created_at', d.created_at
      ) ORDER BY d.created_at)
      FROM document_links dl
      JOIN documents d ON d.id = dl.child_id
      WHERE dl.parent_id = p_id
    ), '[]'),
    -- Profit summary
    'profit', (
      SELECT jsonb_build_object(
        'ar_total', coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd END), 0),
        'ap_total', coalesce(sum(CASE WHEN charge_type='AP' THEN amount_vnd END), 0),
        'margin',   coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd END), 0)
                  - coalesce(sum(CASE WHEN charge_type='AP' THEN amount_vnd END), 0),
        'margin_pct', CASE
          WHEN coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd END), 0) = 0 THEN 0
          ELSE round((coalesce(sum(CASE WHEN charge_type='AR' THEN amount_vnd END), 0)
                    - coalesce(sum(CASE WHEN charge_type='AP' THEN amount_vnd END), 0))
                   / sum(CASE WHEN charge_type='AR' THEN amount_vnd END) * 100, 1)
        END
      )
      FROM shipment_charges WHERE shipment_id = p_id
    ),
    -- Available actions (state machine)
    'actions', fn_available_actions(v_me.id, v_doc)
  );
END $$;

-- ============================================================
-- SEED: 5 shipment mẫu (chạy trong DO block để tránh lỗi nếu user chưa có)
-- ============================================================
DO $$
DECLARE
  v_user_id  uuid;
  v_branch   uuid;
  v_dept     uuid;
  v_cust1    uuid;
  v_cust2    uuid;
  v_sup1     uuid;
  v_doc_id   uuid;
  v_number   text;
  v_period   text := to_char(now(), 'YYYYMM');
BEGIN
  -- Lấy user/branch/dept đầu tiên
  SELECT id INTO v_user_id FROM app_users LIMIT 1;
  SELECT id INTO v_branch  FROM branches  LIMIT 1;
  SELECT id INTO v_dept    FROM departments WHERE branch_id = v_branch LIMIT 1;
  -- Tìm hoặc tạo partner mẫu
  SELECT id INTO v_cust1 FROM partners WHERE code = 'CUST-LOG-01';
  IF v_cust1 IS NULL THEN
    INSERT INTO partners (code, name, partner_type) VALUES ('CUST-LOG-01', 'Công ty Xuất Nhập Khẩu Thành Phát', 'CUSTOMER') RETURNING id INTO v_cust1;
  END IF;
  SELECT id INTO v_cust2 FROM partners WHERE code = 'CUST-LOG-02';
  IF v_cust2 IS NULL THEN
    INSERT INTO partners (code, name, partner_type) VALUES ('CUST-LOG-02', 'Tan Phat Import Export Co.', 'CUSTOMER') RETURNING id INTO v_cust2;
  END IF;
  SELECT id INTO v_sup1 FROM partners WHERE code = 'SUP-CARRIER-01';
  IF v_sup1 IS NULL THEN
    INSERT INTO partners (code, name, partner_type) VALUES ('SUP-CARRIER-01', 'Evergreen Marine Corporation', 'SUPPLIER') RETURNING id INTO v_sup1;
  END IF;

  IF v_user_id IS NULL OR v_branch IS NULL THEN
    RAISE NOTICE 'Seed skipped: no user/branch found';
    RETURN;
  END IF;

  -- Ensure fiscal period exists
  INSERT INTO fiscal_periods (period, start_date, end_date, status)
  VALUES (to_char(now(),'YYYY-MM'), date_trunc('month',now())::date, (date_trunc('month',now()) + interval '1 month - 1 day')::date, 'OPEN')
  ON CONFLICT (period) DO NOTHING;

  -- Seed 1: IN_TRANSIT — FCL export
  INSERT INTO doc_sequences (prefix, yyyymm, last_seq) VALUES ('SPT', v_period, 1)
  ON CONFLICT (prefix, yyyymm) DO UPDATE SET last_seq = doc_sequences.last_seq + 1
  RETURNING 'SPT-' || v_period || '-' || lpad(doc_sequences.last_seq::text,5,'0') INTO v_number;

  INSERT INTO documents (id, doc_type, number, title, status, branch_id, department_id,
    partner_id, created_by, doc_date, amount,
    data)
  VALUES (
    gen_random_uuid(),
    'SHIPMENT',
    v_number,
    'FCL Export HCMC → Houston',
    'IN_TRANSIT',
    v_branch, v_dept,
    v_cust1, v_user_id, current_date, 0,
    jsonb_build_object(
      'mode','FCL','shipment_type','EXPORT',
      'pol','VNSGN','pod','USHOU',
      'etd', to_char(current_date + 3,  'YYYY-MM-DD'),
      'eta', to_char(current_date + 33, 'YYYY-MM-DD'),
      'carrier','Evergreen','vessel','EVER LIVING','voyage','0137W',
      'incoterm','FOB',
      'consignee_id', v_cust2::text
    )
  ) RETURNING id INTO v_doc_id;

  INSERT INTO containers (shipment_id, container_no, container_type, seal_no, gross_weight, cbm, status) VALUES
    (v_doc_id, 'EISU1234567', '40HC', 'EVG111001', 18500, 65.2, 'LOADED'),
    (v_doc_id, 'EISU1234568', '40HC', 'EVG111002', 17800, 63.0, 'LOADED'),
    (v_doc_id, 'EISU1234569', '20DC', 'EVG111003',  9200, 28.5, 'LOADED');

  INSERT INTO shipment_charges (shipment_id, charge_code, description, charge_type, qty, rate, currency, exchange_rate, is_billable, rate_expires) VALUES
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước biển FCL 40HC', 'AR', 2, 1200, 'USD', 25400, true,  current_date + 15),
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước biển FCL 20DC', 'AR', 1,  650, 'USD', 25400, true,  current_date + 15),
    (v_doc_id, 'THC_ORIGIN',    'Phụ phí cảng HCMC',  'AR', 3,   85, 'USD', 25400, true,  NULL),
    (v_doc_id, 'DOC_FEE',       'Phí chứng từ',       'AR', 1,   50, 'USD', 25400, true,  NULL),
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước trả hãng 40HC', 'AP', 2,  980, 'USD', 25400, false, current_date + 15),
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước trả hãng 20DC', 'AP', 1,  530, 'USD', 25400, false, current_date + 15),
    (v_doc_id, 'THC_ORIGIN',    'THC trả cảng',       'AP', 3,   65, 'USD', 25400, false, NULL);

  INSERT INTO tracking_events (shipment_id, event_code, event_name, location, event_time, actual, created_by) VALUES
    (v_doc_id, 'PICKUP',    'Lấy container rỗng',     'Cảng Cát Lái', now() - interval '5 days', true, v_user_id),
    (v_doc_id, 'LOADED',    'Đóng hàng vào container','Kho nhà máy',  now() - interval '3 days', true, v_user_id),
    (v_doc_id, 'DEPARTED',  'Cắt tàu',                'Cảng HCMC',    now() - interval '1 day',  true, v_user_id),
    (v_doc_id, 'ARRIVED',   'Tàu đến cảng đích',      'Houston TX',   now() + interval '30 days',false, v_user_id),
    (v_doc_id, 'DELIVERED', 'Giao đến kho khách',     'Houston TX',   now() + interval '33 days',false, v_user_id);

  -- Seed 2: BOOKED — rate expiring soon (< 7 ngày)
  INSERT INTO doc_sequences (prefix, yyyymm, last_seq) VALUES ('SPT', v_period, 1)
  ON CONFLICT (prefix, yyyymm) DO UPDATE SET last_seq = doc_sequences.last_seq + 1
  RETURNING 'SPT-' || v_period || '-' || lpad(doc_sequences.last_seq::text,5,'0') INTO v_number;

  INSERT INTO documents (id, doc_type, number, title, status, branch_id, department_id,
    partner_id, created_by, doc_date, amount, data)
  VALUES (gen_random_uuid(), 'SHIPMENT', v_number, 'LCL Import Rotterdam', 'BOOKED',
    v_branch, v_dept, v_cust2, v_user_id, current_date, 0,
    jsonb_build_object(
      'mode','LCL','shipment_type','IMPORT',
      'pol','NLRTM','pod','VNSGN',
      'etd', to_char(current_date + 7,  'YYYY-MM-DD'),
      'eta', to_char(current_date + 35, 'YYYY-MM-DD'),
      'carrier','Hapag-Lloyd','vessel','BERLIN EXPRESS','voyage','043E',
      'incoterm','CIF'
    )
  ) RETURNING id INTO v_doc_id;

  INSERT INTO shipment_charges (shipment_id, charge_code, description, charge_type, qty, rate, currency, exchange_rate, is_billable, rate_expires) VALUES
    (v_doc_id, 'OCEAN_FREIGHT', 'Ocean freight LCL',  'AR', 12.5, 45,  'USD', 25400, true, current_date + 5),
    (v_doc_id, 'THC_DEST',      'THC đích HCMC',      'AR', 1,   120,  'USD', 25400, true, NULL),
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước trả hãng LCL',  'AP', 12.5, 36,  'USD', 25400, false, current_date + 5);

  -- Seed 3: DRAFT — mới tạo
  INSERT INTO doc_sequences (prefix, yyyymm, last_seq) VALUES ('SPT', v_period, 1)
  ON CONFLICT (prefix, yyyymm) DO UPDATE SET last_seq = doc_sequences.last_seq + 1
  RETURNING 'SPT-' || v_period || '-' || lpad(doc_sequences.last_seq::text,5,'0') INTO v_number;

  INSERT INTO documents (id, doc_type, number, title, status, branch_id, department_id,
    partner_id, created_by, doc_date, amount, data)
  VALUES (gen_random_uuid(), 'SHIPMENT', v_number, 'FCL Import Korea', 'DRAFT',
    v_branch, v_dept, v_cust1, v_user_id, current_date, 0,
    jsonb_build_object(
      'mode','FCL','shipment_type','IMPORT',
      'pol','KRPUS','pod','VNSGN',
      'etd', to_char(current_date + 14, 'YYYY-MM-DD'),
      'eta', to_char(current_date + 21, 'YYYY-MM-DD'),
      'carrier','HMM','vessel','HMM ALGECIRAS','voyage','0023N',
      'incoterm','EXW'
    )
  ) RETURNING id INTO v_doc_id;

  INSERT INTO containers (shipment_id, container_type) VALUES
    (v_doc_id, '40HC'),
    (v_doc_id, '40HC');

  -- Seed 4: DELIVERED
  INSERT INTO doc_sequences (prefix, yyyymm, last_seq) VALUES ('SPT', v_period, 1)
  ON CONFLICT (prefix, yyyymm) DO UPDATE SET last_seq = doc_sequences.last_seq + 1
  RETURNING 'SPT-' || v_period || '-' || lpad(doc_sequences.last_seq::text,5,'0') INTO v_number;

  INSERT INTO documents (id, doc_type, number, title, status, branch_id, department_id,
    partner_id, created_by, doc_date, amount, data)
  VALUES (gen_random_uuid(), 'SHIPMENT', v_number, 'Air Freight HAN-FRA', 'DELIVERED',
    v_branch, v_dept, v_cust2, v_user_id, current_date - 10, 0,
    jsonb_build_object(
      'mode','AIR','shipment_type','EXPORT',
      'pol','VVHAN','pod','DEFRA',
      'etd', to_char(current_date - 10, 'YYYY-MM-DD'),
      'eta', to_char(current_date - 9,  'YYYY-MM-DD'),
      'carrier','Vietnam Airlines','vessel','VN-A101','voyage','VN41',
      'incoterm','DAP'
    )
  ) RETURNING id INTO v_doc_id;

  INSERT INTO shipment_charges (shipment_id, charge_code, description, charge_type, qty, rate, currency, exchange_rate, is_billable) VALUES
    (v_doc_id, 'AIR_FREIGHT',  'Cước hàng không',    'AR', 250, 5.2, 'USD', 25400, true),
    (v_doc_id, 'FUEL_SURCHARGE','Phụ phí nhiên liệu', 'AR', 250, 0.8, 'USD', 25400, true),
    (v_doc_id, 'AIR_FREIGHT',  'Cước trả hãng bay',  'AP', 250, 4.1, 'USD', 25400, false);

  -- Seed 5: CONFIRMED
  INSERT INTO doc_sequences (prefix, yyyymm, last_seq) VALUES ('SPT', v_period, 1)
  ON CONFLICT (prefix, yyyymm) DO UPDATE SET last_seq = doc_sequences.last_seq + 1
  RETURNING 'SPT-' || v_period || '-' || lpad(doc_sequences.last_seq::text,5,'0') INTO v_number;

  INSERT INTO documents (id, doc_type, number, title, status, branch_id, department_id,
    partner_id, created_by, doc_date, amount, data)
  VALUES (gen_random_uuid(), 'SHIPMENT', v_number, 'FCL Export HCMC-LA', 'CONFIRMED',
    v_branch, v_dept, v_cust1, v_user_id, current_date + 5, 0,
    jsonb_build_object(
      'mode','FCL','shipment_type','EXPORT',
      'pol','VNSGN','pod','USLAX',
      'etd', to_char(current_date + 5,  'YYYY-MM-DD'),
      'eta', to_char(current_date + 28, 'YYYY-MM-DD'),
      'carrier','COSCO','vessel','COSCO SHIPPING STAR','voyage','198E',
      'incoterm','CFR'
    )
  ) RETURNING id INTO v_doc_id;

  INSERT INTO containers (shipment_id, container_type, status) VALUES
    (v_doc_id, '40HC', 'LOADED'),
    (v_doc_id, '40HC', 'LOADED'),
    (v_doc_id, '40HC', 'LOADED'),
    (v_doc_id, '20DC', 'LOADED');

  INSERT INTO shipment_charges (shipment_id, charge_code, description, charge_type, qty, rate, currency, exchange_rate, is_billable) VALUES
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước biển 40HC × 3', 'AR', 3, 1100, 'USD', 25400, true),
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước biển 20DC × 1', 'AR', 1,  600, 'USD', 25400, true),
    (v_doc_id, 'THC_ORIGIN',    'THC HCMC',            'AR', 4,   85, 'USD', 25400, true),
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước hãng 40HC × 3', 'AP', 3,  880, 'USD', 25400, false),
    (v_doc_id, 'OCEAN_FREIGHT', 'Cước hãng 20DC × 1', 'AP', 1,  480, 'USD', 25400, false),
    (v_doc_id, 'THC_ORIGIN',    'THC hãng',            'AP', 4,   65, 'USD', 25400, false);

  RAISE NOTICE 'Seed OK: 5 shipment mẫu đã tạo';
END $$;

-- Clean up local _perm helper (defined above for this migration only)
DROP FUNCTION IF EXISTS _perm(text, text, text, text, text[]);
