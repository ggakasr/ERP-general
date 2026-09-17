-- ERP General — Seed data
-- Every business document below is created through the public api_* functions while
-- impersonating the responsible user at a simulated time, so the seed doubles as an
-- end-to-end test: state machines, SoD, audit trail, handoffs, GL and FIFO stock all run for real.
-- Demo password for all accounts: Demo@123

BEGIN;

CREATE SCHEMA IF NOT EXISTS seed;

-- ------------------------------------------------------------------
-- helpers
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed.uid(p_email text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.app_users WHERE email = p_email || '@erp.demo'
$$;

CREATE OR REPLACE FUNCTION seed.as_user(p_email text, p_at text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v uuid := seed.uid(p_email);
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'seed user % not found', p_email; END IF;
  PERFORM set_config('request.jwt.claim.sub', v::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  PERFORM set_config('app.fake_now', p_at || ':00+07', true);
END $$;

CREATE OR REPLACE FUNCTION seed.ok(p jsonb, p_step text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce((p->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Seed step "%" failed: %', p_step, p;
  END IF;
  RETURN p;
END $$;

CREATE OR REPLACE FUNCTION seed.doc(p_email text, p_at text, p_type text, p_header jsonb, p_lines jsonb DEFAULT NULL, p_parent uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM seed.as_user(p_email, p_at);
  r := seed.ok(public.api_create_document(p_type, p_header, p_lines, p_parent, NULL), p_type || ' by ' || p_email);
  RETURN (r->>'id')::uuid;
END $$;

CREATE OR REPLACE FUNCTION seed.act(p_email text, p_at text, p_doc uuid, p_action text, p_comment text DEFAULT NULL, p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  PERFORM seed.as_user(p_email, p_at);
  RETURN seed.ok(public.api_transition(p_doc, p_action, p_comment, NULL, p_payload),
                 p_action || ' ' || (SELECT number FROM public.documents WHERE id = p_doc) || ' by ' || p_email);
END $$;

-- an attempt that is expected to be rejected (e.g. SoD demo)
CREATE OR REPLACE FUNCTION seed.try_act(p_email text, p_at text, p_doc uuid, p_action text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM seed.as_user(p_email, p_at);
  r := public.api_transition(p_doc, p_action, NULL, NULL, '{}');
  IF coalesce((r->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Seed expected "%" to be rejected but it succeeded', p_action;
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION seed.line(p_doc uuid, p_no int) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.document_lines WHERE document_id = p_doc AND line_no = p_no
$$;
CREATE OR REPLACE FUNCTION seed.prod(p_code text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM public.products WHERE code = p_code $$;
CREATE OR REPLACE FUNCTION seed.partner(p_code text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM public.partners WHERE code = p_code $$;
CREATE OR REPLACE FUNCTION seed.wh(p_code text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM public.warehouses WHERE code = p_code $$;
CREATE OR REPLACE FUNCTION seed.dept(p_code text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM public.departments WHERE code = p_code $$;
CREATE OR REPLACE FUNCTION seed.owner(p_doc uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT split_part(u.email, '@', 1) FROM public.documents d JOIN public.app_users u ON u.id = d.owner_id WHERE d.id = p_doc
$$;
CREATE OR REPLACE FUNCTION seed.amount(p_doc uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT amount FROM public.documents WHERE id = p_doc $$;

-- ------------------------------------------------------------------
-- ORGANISATION
-- ------------------------------------------------------------------
INSERT INTO branches (code, name, address) VALUES
  ('HN',  'Trụ sở chính Hà Nội',         'KCN Thăng Long, Đông Anh, Hà Nội'),
  ('HCM', 'Chi nhánh TP. Hồ Chí Minh',   'KCN Tân Bình, TP. Hồ Chí Minh');

INSERT INTO departments (code, name, branch_id)
SELECT d.code, d.name, b.id FROM (VALUES
  ('BOD',       'Ban Giám đốc',                 'HN'),
  ('FIN',       'Tài chính - Kế toán',          'HN'),
  ('IA',        'Kiểm toán nội bộ',             'HN'),
  ('PROC',      'Mua hàng',                     'HN'),
  ('WH',        'Kho vận',                      'HN'),
  ('PROD',      'Sản xuất',                     'HN'),
  ('QA',        'Quản lý chất lượng',           'HN'),
  ('SALES',     'Kinh doanh',                   'HN'),
  ('HR',        'Nhân sự',                      'HN'),
  ('CS',        'Chăm sóc khách hàng',          'HN'),
  ('IT',        'Công nghệ thông tin',          'HN'),
  ('BOD-HCM',   'Ban Giám đốc chi nhánh HCM',   'HCM'),
  ('SALES-HCM', 'Kinh doanh HCM',               'HCM'),
  ('WH-HCM',    'Kho vận HCM',                  'HCM'),
  ('FIN-HCM',   'Kế toán chi nhánh HCM',        'HCM')
) AS d(code, name, branch) JOIN branches b ON b.code = d.branch;

-- ------------------------------------------------------------------
-- USERS (auth + directory BM-01)
-- ------------------------------------------------------------------
CREATE TEMP TABLE seed_users (email text, full_name text, position text, dept text, roles text[], salary numeric) ON COMMIT DROP;
INSERT INTO seed_users VALUES
  ('ceo',             'Nguyễn Minh Quân',  'Tổng giám đốc',               'BOD',       '{CEO,EMPLOYEE}', 80000000),
  ('cfo',             'Phạm Thu Dung',     'Giám đốc tài chính',          'FIN',       '{CFO,DEPT_HEAD,EMPLOYEE}', 60000000),
  ('ketoantruong',    'Lê Hoàng Kế',       'Kế toán trưởng',              'FIN',       '{CHIEF_ACCOUNTANT,EMPLOYEE}', 40000000),
  ('ketoan',          'Ngô Thị Hà',        'Kế toán viên',                'FIN',       '{ACCOUNTANT,EMPLOYEE}', 18000000),
  ('thuquy',          'Đỗ Văn Tiền',       'Thủ quỹ',                     'FIN',       '{TREASURER,EMPLOYEE}', 15000000),
  ('kiemtoan',        'Trịnh Thanh Tâm',   'Kiểm toán viên nội bộ',       'IA',        '{INTERNAL_AUDITOR,EMPLOYEE}', 32000000),
  ('muahang.tp',      'Lê Văn Cường',      'Trưởng phòng Mua hàng',       'PROC',      '{PROC_MANAGER,DEPT_HEAD,EMPLOYEE}', 35000000),
  ('muahang',         'Bùi Thị Mai',       'Nhân viên Mua hàng',          'PROC',      '{BUYER,EMPLOYEE}', 16000000),
  ('kho.tp',          'Hoàng Văn Em',      'Trưởng kho',                  'WH',        '{WH_MANAGER,DEPT_HEAD,EMPLOYEE}', 25000000),
  ('kho',             'Phan Văn Kiên',     'Thủ kho',                     'WH',        '{WH_STAFF,EMPLOYEE}', 13000000),
  ('sanxuat.gd',      'Đặng Văn Giang',    'Giám đốc Sản xuất',           'PROD',      '{PROD_MANAGER,DEPT_HEAD,EMPLOYEE}', 45000000),
  ('sanxuat',         'Vũ Đức Thắng',      'Kỹ sư kế hoạch sản xuất',     'PROD',      '{PROD_STAFF,EMPLOYEE}', 20000000),
  ('qc',              'Lý Thị Quỳnh',      'Chuyên viên QC',              'QA',        '{QC_INSPECTOR,EMPLOYEE}', 17000000),
  ('kinhdoanh.tp',    'Trần Thị Bình',     'Trưởng phòng Kinh doanh',     'SALES',     '{SALES_MANAGER,DEPT_HEAD,EMPLOYEE}', 38000000),
  ('kinhdoanh',       'Nguyễn Văn Long',   'Nhân viên Kinh doanh',        'SALES',     '{SALES_STAFF,EMPLOYEE}', 15000000),
  ('kinhdoanh2',      'Phạm Minh Tú',      'Nhân viên Kinh doanh',        'SALES',     '{SALES_STAFF,EMPLOYEE}', 15000000),
  ('nhansu.tp',       'Vũ Thị Phương',     'Trưởng phòng Nhân sự',        'HR',        '{HR_MANAGER,DEPT_HEAD,EMPLOYEE}', 33000000),
  ('nhansu',          'Mai Văn Nhân',      'Chuyên viên C&B',             'HR',        '{HR_STAFF,EMPLOYEE}', 16000000),
  ('cskh.tp',         'Hồ Thị Thu',        'Trưởng phòng CSKH',           'CS',        '{CS_MANAGER,DEPT_HEAD,EMPLOYEE,SALES_STAFF}', 28000000),
  ('cskh',            'Đinh Văn Hỗ',       'Nhân viên CSKH',              'CS',        '{CS_AGENT,EMPLOYEE}', 12000000),
  ('cskh2',           'Lương Thị Lan',     'Nhân viên CSKH',              'CS',        '{CS_AGENT,EMPLOYEE}', 12000000),
  ('admin',           'Nguyễn Văn An',     'Quản trị hệ thống',           'IT',        '{SYS_ADMIN,EMPLOYEE}', 30000000),
  ('gd.hcm',          'Trương Quốc Bảo',   'Giám đốc Chi nhánh HCM',      'BOD-HCM',   '{BRANCH_DIRECTOR,DEPT_HEAD,EMPLOYEE}', 55000000),
  ('kinhdoanh.hcm',   'Lâm Thị Hương',     'Nhân viên Kinh doanh HCM',    'SALES-HCM', '{SALES_STAFF,EMPLOYEE}', 15000000),
  ('kho.hcm',         'Châu Văn Tài',      'Trưởng kho HCM',              'WH-HCM',    '{WH_MANAGER,EMPLOYEE}', 20000000),
  ('ketoan.hcm',      'Tạ Thị Nga',        'Kế toán chi nhánh HCM',       'FIN-HCM',   '{ACCOUNTANT,EMPLOYEE}', 17000000);

DELETE FROM auth.users WHERE email IN (SELECT email || '@erp.demo' FROM seed_users);

WITH ins AS (
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         su.email || '@erp.demo', extensions.crypt('Demo@123', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', su.full_name), now(), now(),
         '', '', '', '', '', '', '', ''
  FROM seed_users su
  RETURNING id, email
)
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), ins.id::text, ins.id, jsonb_build_object('sub', ins.id::text, 'email', ins.email, 'email_verified', true),
       'email', now(), now(), now()
FROM ins;

INSERT INTO app_users (id, employee_code, full_name, email, department_id, branch_id, position, created_at)
SELECT au.id, 'NV' || lpad(row_number() OVER ()::text, 3, '0'), su.full_name, au.email, d.id, d.branch_id, su.position, '2026-06-20'
FROM seed_users su JOIN auth.users au ON au.email = su.email || '@erp.demo' JOIN departments d ON d.code = su.dept;

INSERT INTO user_roles (user_id, role_code, granted_at)
SELECT u.id, r, '2026-06-20' FROM seed_users su JOIN app_users u ON u.email = su.email || '@erp.demo' CROSS JOIN unnest(su.roles) r;

INSERT INTO employees (code, user_id, full_name, department_id, branch_id, position, base_salary, allowance, dependents, bank_account, start_date)
SELECT u.employee_code, u.id, u.full_name, u.department_id, u.branch_id, u.position, su.salary, round(su.salary * 0.1, -5),
       (row_number() OVER ()) % 3, '0011' || lpad((row_number() OVER ())::text, 8, '0'), '2024-01-02'
FROM seed_users su JOIN app_users u ON u.email = su.email || '@erp.demo';

INSERT INTO employees (code, full_name, department_id, branch_id, position, base_salary, allowance, dependents, bank_account, start_date)
SELECT c, n, d.id, d.branch_id, p, s, 800000, dep, '00119' || lpad(row_number() OVER ()::text, 7, '0'), '2025-03-01'
FROM (VALUES
  ('NV101', 'Nguyễn Văn Hùng',  'Công nhân hàn',     'PROD', 11000000, 1),
  ('NV102', 'Lê Văn Tuấn',      'Công nhân cắt CNC', 'PROD', 11500000, 2),
  ('NV103', 'Trần Thị Mơ',      'Công nhân sơn',     'PROD', 10000000, 0),
  ('NV104', 'Hoàng Đức Thịnh',  'Lái xe nâng',       'WH',   10500000, 1)
) AS x(c, n, dept, p, s, dep) JOIN departments d ON d.code = x.dept;

-- ------------------------------------------------------------------
-- MASTER DATA (BM-08)
-- ------------------------------------------------------------------
INSERT INTO warehouses (code, name, branch_id)
SELECT w.code, w.name, b.id FROM (VALUES
  ('WH-HN-01',  'Kho nguyên liệu & thành phẩm Hà Nội', 'HN'),
  ('WH-HCM-01', 'Kho thương mại TP.HCM',               'HCM')
) AS w(code, name, branch) JOIN branches b ON b.code = w.branch;

INSERT INTO partners (code, name, partner_type, tax_code, address, phone, payment_terms_days, credit_limit) VALUES
  ('SUP-001', 'Công ty TNHH Thép Việt',                  'SUPPLIER', '0101234567', 'Hải Phòng',            '0225 3888 111', 30, 0),
  ('SUP-002', 'Công ty CP Sơn Công nghiệp Á Châu',       'SUPPLIER', '0102345678', 'Bắc Ninh',             '0222 3777 222', 15, 0),
  ('SUP-003', 'Công ty TNHH Văn phòng phẩm Hồng Hà',     'SUPPLIER', '0103456789', 'Hà Nội',               '024 3999 333',  7, 0),
  ('SUP-004', 'Công ty CP Thiết bị Công nghiệp Toàn Cầu','SUPPLIER', '0104567890', 'Bình Dương',           '0274 3666 444', 45, 0),
  ('CUS-001', 'Công ty TNHH Xây dựng Thành Đạt',         'CUSTOMER', '0105678901', 'Cầu Giấy, Hà Nội',     '024 3555 555', 45, 800000000),
  ('CUS-002', 'Công ty CP Nội thất Hoàng Gia',           'CUSTOMER', '0106789012', 'Long Biên, Hà Nội',    '024 3444 666', 30, 300000000),
  ('CUS-003', 'Công ty CP Kết cấu Thép Miền Nam',        'CUSTOMER', '0307890123', 'Thủ Đức, TP.HCM',      '028 3333 777', 30, 500000000),
  ('CUS-004', 'Tập đoàn Đầu tư Phú Mỹ',                  'CUSTOMER', '0308901234', 'Quận 7, TP.HCM',       '028 3222 888', 60, 2000000000);

INSERT INTO products (code, name, unit, product_type, inventory_account, standard_cost, sale_price) VALUES
  ('RM-STEEL', 'Thép tấm CB300',               'kg',   'RAW',      '152', 18000,   0),
  ('RM-BOLT',  'Bu lông M16 mạ kẽm',           'bộ',   'RAW',      '152', 4500,    0),
  ('RM-PAINT', 'Sơn chống gỉ epoxy',           'lít',  'RAW',      '152', 95000,   0),
  ('FG-K200',  'Khung thép chịu lực K200',     'bộ',   'FINISHED', '155', 1650000, 2600000),
  ('FG-K300',  'Khung thép chịu lực K300',     'bộ',   'FINISHED', '155', 2400000, 3800000),
  ('GD-PANEL', 'Tấm panel cách nhiệt EPS 50mm','tấm',  'GOODS',    '156', 320000,  480000),
  ('SP-A4',    'Giấy A4 Double A 80gsm',       'ram',  'SUPPLY',   '153', 75000,   0);

INSERT INTO boms (code, product_id, output_qty) SELECT 'BOM-K200', id, 1 FROM products WHERE code = 'FG-K200';
INSERT INTO boms (code, product_id, output_qty) SELECT 'BOM-K300', id, 1 FROM products WHERE code = 'FG-K300';
INSERT INTO bom_lines (bom_id, product_id, quantity)
SELECT b.id, p.id, x.q FROM (VALUES
  ('BOM-K200', 'RM-STEEL', 80), ('BOM-K200', 'RM-BOLT', 12), ('BOM-K200', 'RM-PAINT', 1.5),
  ('BOM-K300', 'RM-STEEL', 120), ('BOM-K300', 'RM-BOLT', 16), ('BOM-K300', 'RM-PAINT', 2)
) AS x(bom, prod, q) JOIN boms b ON b.code = x.bom JOIN products p ON p.code = x.prod;

INSERT INTO fiscal_periods (period, start_date, end_date, status)
SELECT to_char(m, 'YYYY-MM'), m::date, (m + interval '1 month - 1 day')::date,
       CASE WHEN m < '2026-07-01' THEN 'HARD_CLOSE' ELSE 'OPEN' END
FROM generate_series('2026-01-01'::timestamptz, '2027-12-01'::timestamptz, interval '1 month') m;

-- BM-02 ownership: exactly one owner per business process
INSERT INTO ownership_matrix (flow_code, business_process, doc_types, owner_user_id, deputy_user_id, department_id, effective_from)
SELECT x.flow, x.process, x.types, seed.uid(x.owner), seed.uid(x.deputy), seed.dept(x.dept), '2026-06-20'
FROM (VALUES
  ('L1',  'Lập kế hoạch & Ngân sách',  '{BUDGET}'::text[],             'cfo',          'ketoantruong', 'FIN'),
  ('L2',  'Bán hàng',                  '{QUOT,SO,INV}'::text[],        'kinhdoanh.tp', 'gd.hcm',       'SALES'),
  ('L3',  'Mua hàng',                  '{PR,PO,SINV}'::text[],         'muahang.tp',   NULL,           'PROC'),
  ('L4',  'Kho vận',                   '{GRN,DN,ST,ADJ}'::text[],      'kho.tp',       'kho.hcm',      'WH'),
  ('L5',  'Sản xuất',                  '{WO}'::text[],                 'sanxuat.gd',   NULL,           'PROD'),
  ('L6',  'Nhân sự & Tiền lương',      '{HIRE,PAYROLL}'::text[],       'nhansu.tp',    NULL,           'HR'),
  ('L7',  'Tài chính & Kế toán',       '{JV,PMT,RCPT,BANKREC}'::text[],'ketoantruong', 'cfo',          'FIN'),
  ('L8',  'Tài sản',                   '{ASSET}'::text[],              'cfo',          'ketoantruong', 'FIN'),
  ('L9',  'Dịch vụ khách hàng',        '{TICKET}'::text[],             'cskh.tp',      NULL,           'CS'),
  ('L10', 'Quản trị hệ thống',         '{MDC,ACCESS_REVIEW}'::text[],  'admin',        'kiemtoan',     'IT'),
  ('L11', 'Kiểm soát & Ngoại lệ',      '{EXC}'::text[],                'kiemtoan',     NULL,           'IA')
) AS x(flow, process, types, owner, deputy, dept);

INSERT INTO shadow_it_register (name, it_type, department_id, description, risk_level, migration_target_module, migration_status, target_date)
VALUES
  ('File Excel theo dõi công nợ khách hàng', 'SPREADSHEET', seed.dept('FIN'), 'Kế toán theo dõi công nợ và hạn thanh toán bằng Excel chia sẻ', 'HIGH', 'Báo cáo tuổi nợ (AR aging)', 'MIGRATED', '2026-07-15'),
  ('Nhóm Zalo duyệt đề nghị mua hàng',       'MANUAL_PROCESS', seed.dept('PROC'), 'Trưởng bộ phận duyệt PR qua tin nhắn, không lưu vết', 'HIGH', 'Đề nghị mua hàng (PR) + phê duyệt', 'MIGRATED', '2026-07-01'),
  ('Google Sheet chấm công xưởng',            'SPREADSHEET', seed.dept('PROD'), 'Tổ trưởng chấm công hằng ngày, gửi HR cuối tháng', 'MEDIUM', 'Bảng lương — ngày công', 'IN_PROGRESS', '2026-10-31');

INSERT INTO impact_matrix (change_type, description, affected_flows, severity, mitigation_plan, status) VALUES
  ('PROCESS', 'Chuyển phê duyệt PR từ Zalo sang ERP', '{L3}', 'MEDIUM', 'Đào tạo trưởng bộ phận, chạy song song 2 tuần', 'MITIGATED'),
  ('SYSTEM',  'Khóa sổ kỳ kế toán trên ERP thay vì thủ công', '{L7,L11}', 'HIGH', 'Checklist khóa sổ, bút toán điều chỉnh chỉ ở SOFT_CLOSE', 'ASSESSED');

-- ------------------------------------------------------------------
-- BUSINESS STORY  July → September 2026
-- ------------------------------------------------------------------
DO $$
DECLARE
  HN uuid := seed.wh('WH-HN-01'); HCM uuid := seed.wh('WH-HCM-01');
  v_jv uuid; v_adj uuid; v_ast1 uuid; v_ast2 uuid; v_bprod uuid; v_bsales uuid; v_bwh uuid;
  v_pr1 uuid; v_po1 uuid; v_po2 uuid; v_grn uuid; v_sinv uuid; v_pmt uuid;
  v_q1 uuid; v_so1 uuid; v_wo1 uuid; v_dn uuid; v_inv1 uuid; v_rc uuid;
  v_pay uuid; v_hire uuid; v_q2 uuid; v_so2 uuid; v_inv2 uuid;
  v_pr2 uuid; v_po3 uuid; v_sinv3 uuid; v_exc uuid;
  v_pr3 uuid; v_po4 uuid; v_st uuid; v_q3 uuid; v_so3 uuid; v_inv3 uuid; v_po5 uuid;
  v_tk uuid; v_mdc uuid; v_ast3 uuid; v_br uuid; v_ar uuid; v_x uuid; r jsonb;
BEGIN
  -- ===== 01/07: go-live — opening balances =====
  v_jv := seed.doc('ketoan', '2026-07-01 08:00', 'JV', jsonb_build_object('title', 'Số dư đầu kỳ — vốn chủ sở hữu', 'doc_date', '2026-07-01'),
    '[{"account_code":"112","debit":12000000000,"description":"Tiền gửi Vietcombank"},{"account_code":"411","credit":12000000000,"description":"Vốn góp chủ sở hữu"}]');
  PERFORM seed.act('ketoan', '2026-07-01 08:05', v_jv, 'submit');
  PERFORM seed.act('ketoantruong', '2026-07-01 09:00', v_jv, 'post', 'Đã đối chiếu sổ phụ ngân hàng');

  v_adj := seed.doc('kho', '2026-07-01 10:00', 'ADJ', jsonb_build_object('title', 'Tồn kho đầu kỳ khi go-live', 'warehouse_id', HN,
      'data', jsonb_build_object('reason', 'Nhập tồn đầu kỳ theo biên bản kiểm kê 30/06', 'opening', true)),
    jsonb_build_array(
      jsonb_build_object('product_id', seed.prod('RM-STEEL'), 'quantity', 6000, 'unit_price', 18000),
      jsonb_build_object('product_id', seed.prod('RM-BOLT'), 'quantity', 1500, 'unit_price', 4500),
      jsonb_build_object('product_id', seed.prod('RM-PAINT'), 'quantity', 200, 'unit_price', 95000),
      jsonb_build_object('product_id', seed.prod('FG-K200'), 'quantity', 40, 'unit_price', 1650000),
      jsonb_build_object('product_id', seed.prod('GD-PANEL'), 'quantity', 300, 'unit_price', 320000),
      jsonb_build_object('product_id', seed.prod('SP-A4'), 'quantity', 100, 'unit_price', 75000)));
  PERFORM seed.act('kho', '2026-07-01 10:10', v_adj, 'submit');
  PERFORM seed.act('ketoantruong', '2026-07-01 10:30', v_adj, 'approve', 'Khớp biên bản kiểm kê 30/06');
  PERFORM seed.act('kho.tp', '2026-07-01 11:00', v_adj, 'post');

  v_ast1 := seed.doc('ketoan', '2026-07-01 14:00', 'ASSET', jsonb_build_object('title', 'Máy cắt CNC Plasma Hypertherm', 'amount', 1200000000,
    'data', jsonb_build_object('name', 'Máy cắt CNC Plasma Hypertherm', 'category', 'Máy móc thiết bị', 'useful_life_months', 120,
      'location', 'Xưởng Hà Nội', 'opening', true, 'opening_accumulated', 240000000)));
  PERFORM seed.act('ketoan', '2026-07-01 14:05', v_ast1, 'submit');
  PERFORM seed.act('cfo', '2026-07-01 15:00', v_ast1, 'approve');
  PERFORM seed.act('ketoan', '2026-07-01 15:30', v_ast1, 'capitalize');
  v_ast2 := seed.doc('ketoan', '2026-07-01 14:10', 'ASSET', jsonb_build_object('title', 'Xe tải Hino 5 tấn', 'amount', 850000000,
    'data', jsonb_build_object('name', 'Xe tải Hino 5 tấn', 'category', 'Phương tiện vận tải', 'useful_life_months', 96,
      'location', 'Bãi xe Hà Nội', 'opening', true, 'opening_accumulated', 106250000)));
  PERFORM seed.act('ketoan', '2026-07-01 14:15', v_ast2, 'submit');
  PERFORM seed.act('cfo', '2026-07-01 15:05', v_ast2, 'approve');
  PERFORM seed.act('ketoan', '2026-07-01 15:35', v_ast2, 'capitalize');

  -- ===== Budgets (L1) =====
  v_bprod := seed.doc('sanxuat.gd', '2026-07-02 09:00', 'BUDGET', jsonb_build_object('title', 'Ngân sách Sản xuất 2026', 'data', jsonb_build_object('fiscal_year', 2026)),
    '[{"account_code":"152","description":"Nguyên vật liệu","amount":2500000000},{"account_code":"642","description":"Chi phí sản xuất chung","amount":300000000}]');
  PERFORM seed.act('sanxuat.gd', '2026-07-02 09:10', v_bprod, 'submit');
  PERFORM seed.act('cfo', '2026-07-03 10:00', v_bprod, 'approve');
  PERFORM seed.act('cfo', '2026-07-03 10:05', v_bprod, 'activate');
  v_bsales := seed.doc('kinhdoanh.tp', '2026-07-02 10:00', 'BUDGET', jsonb_build_object('title', 'Ngân sách Kinh doanh 2026', 'data', jsonb_build_object('fiscal_year', 2026)),
    '[{"account_code":"641","description":"Marketing & xúc tiến bán hàng","amount":400000000},{"account_code":"156","description":"Hàng hóa thương mại","amount":600000000}]');
  PERFORM seed.act('kinhdoanh.tp', '2026-07-02 10:10', v_bsales, 'submit');
  PERFORM seed.act('cfo', '2026-07-03 10:10', v_bsales, 'approve');
  PERFORM seed.act('cfo', '2026-07-03 10:15', v_bsales, 'activate');
  v_bwh := seed.doc('kho.tp', '2026-07-02 11:00', 'BUDGET', jsonb_build_object('title', 'Ngân sách Kho vận 2026', 'data', jsonb_build_object('fiscal_year', 2026)),
    '[{"account_code":"153","description":"Công cụ dụng cụ & vật tư kho","amount":150000000}]');
  PERFORM seed.act('kho.tp', '2026-07-02 11:10', v_bwh, 'submit');
  PERFORM seed.act('cfo', '2026-07-03 10:20', v_bwh, 'approve');
  PERFORM seed.act('cfo', '2026-07-03 10:25', v_bwh, 'activate');

  -- ===== Procure-to-Pay #1 (complete) =====
  v_pr1 := seed.doc('sanxuat', '2026-07-06 09:00', 'PR', jsonb_build_object('title', 'Nguyên liệu sản xuất khung K200 tháng 7',
      'data', jsonb_build_object('justification', 'Đơn hàng Thành Đạt 60 bộ K200 — tồn kho không đủ')),
    jsonb_build_array(
      jsonb_build_object('product_id', seed.prod('RM-STEEL'), 'quantity', 4000, 'unit_price', 18000),
      jsonb_build_object('product_id', seed.prod('RM-BOLT'), 'quantity', 600, 'unit_price', 4500),
      jsonb_build_object('product_id', seed.prod('RM-PAINT'), 'quantity', 80, 'unit_price', 95000)));
  PERFORM seed.act('sanxuat', '2026-07-06 09:05', v_pr1, 'submit');
  PERFORM seed.act('sanxuat.gd', '2026-07-06 14:00', v_pr1, 'approve', 'Đồng ý, ưu tiên thép');

  v_po1 := seed.doc('muahang', '2026-07-07 09:00', 'PO', jsonb_build_object('title', 'Thép tấm & bu lông lô tháng 7',
      'partner_id', seed.partner('SUP-001'), 'warehouse_id', HN),
    jsonb_build_array(
      jsonb_build_object('source_line_id', seed.line(v_pr1, 1), 'quantity', 4000, 'unit_price', 17800),
      jsonb_build_object('source_line_id', seed.line(v_pr1, 2), 'quantity', 600, 'unit_price', 4500)), v_pr1);
  PERFORM seed.act('muahang', '2026-07-07 09:10', v_po1, 'submit');
  PERFORM seed.act('muahang.tp', '2026-07-07 15:00', v_po1, 'approve', 'Giá tốt hơn dự toán 1,1%');
  PERFORM seed.act('muahang', '2026-07-08 08:30', v_po1, 'send');
  PERFORM seed.act('muahang', '2026-07-09 10:00', v_po1, 'confirm', 'NCC xác nhận giao 12/07');

  v_po2 := seed.doc('muahang', '2026-07-07 09:30', 'PO', jsonb_build_object('title', 'Sơn chống gỉ lô tháng 7',
      'partner_id', seed.partner('SUP-002'), 'warehouse_id', HN),
    jsonb_build_array(jsonb_build_object('source_line_id', seed.line(v_pr1, 3), 'quantity', 80)), v_pr1);
  PERFORM seed.act('muahang', '2026-07-07 09:40', v_po2, 'submit');
  PERFORM seed.act('muahang.tp', '2026-07-07 16:00', v_po2, 'approve');
  PERFORM seed.act('muahang', '2026-07-08 08:40', v_po2, 'send');
  PERFORM seed.act('muahang', '2026-07-10 09:00', v_po2, 'confirm');

  v_grn := seed.doc('kho', '2026-07-12 08:30', 'GRN', jsonb_build_object('title', 'Nhận thép & bu lông Thép Việt'), NULL, v_po1);
  PERFORM seed.act('qc', '2026-07-12 10:00', v_grn, 'inspect', 'Đạt — CO/CQ đầy đủ');
  PERFORM seed.act('kho.tp', '2026-07-12 11:00', v_grn, 'store');

  v_sinv := seed.doc('ketoan', '2026-07-14 09:00', 'SINV', jsonb_build_object('title', 'HĐ 0001245 Thép Việt', 'data', jsonb_build_object('invoice_no', '0001245')), NULL, v_po1);
  PERFORM seed.act('ketoan', '2026-07-14 09:10', v_sinv, 'match');
  PERFORM seed.act('ketoantruong', '2026-07-15 10:00', v_sinv, 'post');
  v_pmt := seed.doc('ketoan', '2026-07-20 09:00', 'PMT', jsonb_build_object('title', 'Thanh toán HĐ 0001245 Thép Việt', 'amount', seed.amount(v_sinv),
    'data', jsonb_build_object('method', 'BANK_TRANSFER', 'bank_account', 'VCB 0011000123456')), NULL, v_sinv);
  PERFORM seed.act('ketoan', '2026-07-20 09:05', v_pmt, 'submit');
  PERFORM seed.act('cfo', '2026-07-21 11:00', v_pmt, 'approve');
  PERFORM seed.act('thuquy', '2026-07-22 09:30', v_pmt, 'execute', 'UNC số 7788 Vietcombank');
  PERFORM seed.act('kiemtoan', '2026-07-28 15:00', v_pmt, 'audit', 'Đủ chứng từ PR-PO-GRN-HĐ, SoD đạt');

  v_grn := seed.doc('kho', '2026-07-15 08:30', 'GRN', jsonb_build_object('title', 'Nhận sơn đợt 1'),
    jsonb_build_array(jsonb_build_object('source_line_id', seed.line(v_po2, 1), 'quantity', 50)), v_po2);
  PERFORM seed.act('qc', '2026-07-15 09:30', v_grn, 'inspect');
  PERFORM seed.act('kho.tp', '2026-07-15 10:00', v_grn, 'store');
  v_grn := seed.doc('kho', '2026-07-20 08:30', 'GRN', jsonb_build_object('title', 'Nhận sơn đợt 2'), NULL, v_po2);
  PERFORM seed.act('qc', '2026-07-20 09:30', v_grn, 'inspect');
  PERFORM seed.act('kho.tp', '2026-07-20 10:00', v_grn, 'store');
  v_x := seed.doc('ketoan', '2026-07-22 09:00', 'SINV', jsonb_build_object('title', 'HĐ 0000871 Sơn Á Châu', 'data', jsonb_build_object('invoice_no', '0000871')), NULL, v_po2);
  PERFORM seed.act('ketoan', '2026-07-22 09:10', v_x, 'match');
  PERFORM seed.act('ketoantruong', '2026-07-23 10:00', v_x, 'post');
  v_pmt := seed.doc('ketoan', '2026-07-30 09:00', 'PMT', jsonb_build_object('title', 'Thanh toán HĐ 0000871 Sơn Á Châu', 'amount', seed.amount(v_x),
    'data', jsonb_build_object('method', 'BANK_TRANSFER')), NULL, v_x);
  PERFORM seed.act('ketoan', '2026-07-30 09:05', v_pmt, 'submit');
  PERFORM seed.act('cfo', '2026-07-31 10:00', v_pmt, 'approve');
  PERFORM seed.act('thuquy', '2026-08-01 09:00', v_pmt, 'execute');

  -- ===== Order-to-Cash #1 with make-to-order production (complete) =====
  v_q1 := seed.doc('kinhdoanh', '2026-07-08 10:00', 'QUOT', jsonb_build_object('title', 'Báo giá khung thép dự án Thành Đạt Tower',
      'partner_id', seed.partner('CUS-001'), 'warehouse_id', HN, 'data', jsonb_build_object('valid_until', '2026-08-08')),
    jsonb_build_array(
      jsonb_build_object('product_id', seed.prod('FG-K200'), 'quantity', 60, 'unit_price', 2600000),
      jsonb_build_object('product_id', seed.prod('GD-PANEL'), 'quantity', 200, 'unit_price', 480000)));
  PERFORM seed.act('kinhdoanh', '2026-07-08 10:10', v_q1, 'submit');
  PERFORM seed.act('kinhdoanh.tp', '2026-07-08 15:00', v_q1, 'approve');
  PERFORM seed.act('kinhdoanh', '2026-07-09 09:00', v_q1, 'send');
  PERFORM seed.act('kinhdoanh', '2026-07-11 10:00', v_q1, 'accept', 'KH ký xác nhận báo giá');
  v_so1 := seed.doc('kinhdoanh', '2026-07-11 11:00', 'SO', jsonb_build_object('title', 'Đơn hàng Thành Đạt Tower',
      'data', jsonb_build_object('delivery_date', '2026-07-25')), NULL, v_q1);
  PERFORM seed.act('kinhdoanh.tp', '2026-07-11 16:00', v_so1, 'confirm', 'Thiếu 20 bộ K200 — sản xuất bổ sung', '{"allow_backorder": true}');

  v_wo1 := seed.doc('sanxuat', '2026-07-13 08:00', 'WO', jsonb_build_object('title', 'Sản xuất 30 bộ K200 cho Thành Đạt',
      'product_id', seed.prod('FG-K200'), 'warehouse_id', HN, 'data', jsonb_build_object('planned_qty', 30)), NULL, v_so1);
  PERFORM seed.act('sanxuat.gd', '2026-07-13 09:00', v_wo1, 'release');
  PERFORM seed.act('kho.tp', '2026-07-14 08:00', v_wo1, 'issue_material');
  PERFORM seed.act('sanxuat', '2026-07-14 09:00', v_wo1, 'start');
  PERFORM seed.act('sanxuat', '2026-07-18 16:00', v_wo1, 'send_qc');
  PERFORM seed.act('qc', '2026-07-18 17:00', v_wo1, 'qc_fail', 'Mối hàn chưa đạt ở 4 bộ — hàn lại');
  PERFORM seed.act('sanxuat', '2026-07-19 11:00', v_wo1, 'send_qc');
  PERFORM seed.act('qc', '2026-07-19 14:00', v_wo1, 'qc_pass', 'Đạt 30/30', '{"completed_qty": 30}');
  PERFORM seed.act('sanxuat', '2026-07-20 08:00', v_wo1, 'close');

  v_dn := seed.doc('kho', '2026-07-21 08:00', 'DN', jsonb_build_object('title', 'Giao hàng Thành Đạt Tower'), NULL, v_so1);
  PERFORM seed.act('kho', '2026-07-21 10:00', v_dn, 'pick');
  PERFORM seed.act('kho.tp', '2026-07-22 07:30', v_dn, 'ship', 'Xe tải Hino 29C-123.45');
  v_inv1 := seed.doc('ketoan', '2026-07-23 09:00', 'INV', jsonb_build_object('title', 'Hóa đơn GTGT 0000312 Thành Đạt'), NULL, v_so1);
  PERFORM seed.act('ketoantruong', '2026-07-23 14:00', v_inv1, 'post');
  v_rc := seed.doc('ketoan', '2026-08-10 09:00', 'RCPT', jsonb_build_object('title', 'Thành Đạt thanh toán đợt 1', 'amount', 150000000), NULL, v_inv1);
  PERFORM seed.act('thuquy', '2026-08-10 10:00', v_rc, 'receive', 'Báo có VCB');
  PERFORM seed.act('kiemtoan', '2026-08-28 10:00', v_rc, 'audit');
  v_rc := seed.doc('ketoan', '2026-08-25 09:00', 'RCPT', jsonb_build_object('title', 'Thành Đạt thanh toán đợt 2', 'amount', seed.amount(v_inv1) - 150000000), NULL, v_inv1);
  PERFORM seed.act('thuquy', '2026-08-25 10:00', v_rc, 'receive');


  v_tk := seed.doc('kinhdoanh', '2026-08-01 08:30', 'TICKET', jsonb_build_object('partner_id', seed.partner('CUS-001'),
    'data', jsonb_build_object('subject', 'Khung K200 bị trầy sơn 3 bộ khi giao', 'priority', 'HIGH',
      'description', 'Khách phản ánh 3 bộ khung trầy lớp sơn khi bốc dỡ')), NULL, v_so1);
  PERFORM seed.act(seed.owner(v_tk), '2026-08-01 09:00', v_tk, 'start');
  PERFORM seed.act(seed.owner(v_tk), '2026-08-02 10:00', v_tk, 'resolve', NULL, '{"resolution": "Cử đội sơn dặm tại công trình, khách nghiệm thu"}');
  PERFORM seed.act('cskh.tp', '2026-08-03 09:00', v_tk, 'close', NULL, '{"csat": 4}');

  -- ===== July depreciation & payroll =====
  PERFORM seed.as_user('ketoan', '2026-07-31 16:00');
  r := seed.ok(public.api_run_depreciation('2026-07'), 'depreciation 2026-07');
  PERFORM seed.act('ketoantruong', '2026-07-31 17:00', (r->>'id')::uuid, 'post');

  PERFORM seed.as_user('nhansu', '2026-07-31 09:00');
  r := seed.ok(public.api_create_payroll('2026-07', '{"NV012": 21, "NV101": 20}'), 'payroll 2026-07');
  v_pay := (r->>'id')::uuid;
  PERFORM seed.act('nhansu', '2026-07-31 09:30', v_pay, 'submit');
  PERFORM seed.act('cfo', '2026-08-01 10:00', v_pay, 'approve');
  PERFORM seed.act('ketoan', '2026-08-02 09:00', v_pay, 'post');
  v_pmt := seed.doc('ketoan', '2026-08-02 10:00', 'PMT', jsonb_build_object('title', 'Chi lương tháng 07/2026', 'amount', seed.amount(v_pay),
    'data', jsonb_build_object('method', 'BANK_TRANSFER')), NULL, v_pay);
  PERFORM seed.act('ketoan', '2026-08-02 10:05', v_pmt, 'submit');
  PERFORM seed.act('cfo', '2026-08-03 09:00', v_pmt, 'approve');
  PERFORM seed.act('thuquy', '2026-08-04 09:00', v_pmt, 'execute', 'Chi lương qua VCB');

  -- ===== July period close (T4.11) =====
  PERFORM seed.as_user('ketoantruong', '2026-08-05 17:00');
  PERFORM seed.ok(public.api_set_period_status('2026-07', 'SOFT_CLOSE'), 'soft close 07');
  PERFORM seed.as_user('ketoantruong', '2026-08-06 17:00');
  PERFORM seed.ok(public.api_set_period_status('2026-07', 'HARD_CLOSE'), 'hard close 07');

  -- ===== Hire-to-Retire (T4.3) =====
  v_hire := seed.doc('sanxuat.gd', '2026-08-03 10:00', 'HIRE', jsonb_build_object('title', 'Tuyển thợ hàn bậc 4',
    'data', jsonb_build_object('full_name', 'Trần Văn Mạnh', 'position', 'Thợ hàn bậc 4', 'department_id', seed.dept('PROD'),
      'base_salary', 12000000, 'allowance', 1000000, 'start_date', '2026-08-15', 'reason', 'Bổ sung nhân lực cho đơn hàng K300')));
  PERFORM seed.act('sanxuat.gd', '2026-08-03 10:05', v_hire, 'submit');
  PERFORM seed.act('nhansu.tp', '2026-08-04 14:00', v_hire, 'approve');
  PERFORM seed.act('nhansu', '2026-08-14 09:00', v_hire, 'onboard', 'Đã ký HĐLĐ, cấp BHLĐ');

  -- ===== Order-to-Cash #2 (partial shipment, partial payment) =====
  v_q2 := seed.doc('kinhdoanh2', '2026-08-12 09:00', 'QUOT', jsonb_build_object('title', 'Báo giá khung & panel showroom Hoàng Gia',
      'partner_id', seed.partner('CUS-002'), 'warehouse_id', HN, 'data', jsonb_build_object('valid_until', '2026-09-12')),
    jsonb_build_array(
      jsonb_build_object('product_id', seed.prod('FG-K200'), 'quantity', 10, 'unit_price', 2650000),
      jsonb_build_object('product_id', seed.prod('GD-PANEL'), 'quantity', 80, 'unit_price', 480000)));
  PERFORM seed.act('kinhdoanh2', '2026-08-12 09:10', v_q2, 'submit');
  PERFORM seed.act('kinhdoanh.tp', '2026-08-12 11:00', v_q2, 'approve');
  PERFORM seed.act('kinhdoanh2', '2026-08-12 14:00', v_q2, 'send');
  PERFORM seed.act('kinhdoanh2', '2026-08-14 09:00', v_q2, 'accept');
  v_so2 := seed.doc('kinhdoanh2', '2026-08-14 10:00', 'SO', jsonb_build_object('title', 'Đơn hàng showroom Hoàng Gia'), NULL, v_q2);
  PERFORM seed.act('kinhdoanh.tp', '2026-08-14 14:00', v_so2, 'confirm');
  v_dn := seed.doc('kho', '2026-08-18 08:00', 'DN', jsonb_build_object('title', 'Giao đợt 1 Hoàng Gia'),
    jsonb_build_array(jsonb_build_object('source_line_id', seed.line(v_so2, 1), 'quantity', 10),
                      jsonb_build_object('source_line_id', seed.line(v_so2, 2), 'quantity', 40)), v_so2);
  PERFORM seed.act('kho', '2026-08-18 09:00', v_dn, 'pick');
  PERFORM seed.act('kho.tp', '2026-08-18 13:00', v_dn, 'ship');
  v_inv2 := seed.doc('ketoan', '2026-08-19 09:00', 'INV', jsonb_build_object('title', 'Hóa đơn 0000356 Hoàng Gia đợt 1'), NULL, v_so2);
  PERFORM seed.act('ketoantruong', '2026-08-19 15:00', v_inv2, 'post');

  -- ===== August payroll & depreciation =====
  PERFORM seed.as_user('ketoan', '2026-08-31 16:00');
  r := seed.ok(public.api_run_depreciation('2026-08'), 'depreciation 2026-08');
  PERFORM seed.act('ketoantruong', '2026-08-31 17:00', (r->>'id')::uuid, 'post');
  PERFORM seed.as_user('nhansu', '2026-08-31 09:00');
  r := seed.ok(public.api_create_payroll('2026-08', '{"NV101": 22, "NV103": 19}'), 'payroll 2026-08');
  v_pay := (r->>'id')::uuid;
  PERFORM seed.act('nhansu', '2026-08-31 09:30', v_pay, 'submit');
  PERFORM seed.act('cfo', '2026-09-01 10:00', v_pay, 'approve');
  PERFORM seed.act('ketoan', '2026-09-02 09:00', v_pay, 'post');
  v_pmt := seed.doc('ketoan', '2026-09-02 10:00', 'PMT', jsonb_build_object('title', 'Chi lương tháng 08/2026', 'amount', seed.amount(v_pay),
    'data', jsonb_build_object('method', 'BANK_TRANSFER')), NULL, v_pay);
  PERFORM seed.act('ketoan', '2026-09-02 10:05', v_pmt, 'submit');
  PERFORM seed.act('cfo', '2026-09-03 09:00', v_pmt, 'approve');
  PERFORM seed.act('thuquy', '2026-09-03 14:00', v_pmt, 'execute');

  -- ===== Procure-to-Pay #2: 3-way MISMATCH -> exception (T1.6) =====
  v_pr2 := seed.doc('sanxuat', '2026-08-20 09:00', 'PR', jsonb_build_object('title', 'Thép & sơn cho đơn K300 tháng 9',
      'data', jsonb_build_object('justification', 'Kế hoạch sản xuất K300 quý 3')),
    jsonb_build_array(
      jsonb_build_object('product_id', seed.prod('RM-STEEL'), 'quantity', 3000, 'unit_price', 18000),
      jsonb_build_object('product_id', seed.prod('RM-PAINT'), 'quantity', 100, 'unit_price', 95000)));
  PERFORM seed.act('sanxuat', '2026-08-20 09:05', v_pr2, 'submit');
  PERFORM seed.act('sanxuat.gd', '2026-08-20 11:00', v_pr2, 'approve');
  v_po3 := seed.doc('muahang', '2026-08-21 09:00', 'PO', jsonb_build_object('title', 'Thép & sơn K300 — Thép Việt',
      'partner_id', seed.partner('SUP-001'), 'warehouse_id', HN),
    jsonb_build_array(
      jsonb_build_object('source_line_id', seed.line(v_pr2, 1), 'quantity', 3000, 'unit_price', 17800),
      jsonb_build_object('source_line_id', seed.line(v_pr2, 2), 'quantity', 100, 'unit_price', 95000)), v_pr2);
  PERFORM seed.act('muahang', '2026-08-21 09:10', v_po3, 'submit');
  PERFORM seed.act('muahang.tp', '2026-08-21 14:00', v_po3, 'approve');
  PERFORM seed.act('muahang', '2026-08-22 08:30', v_po3, 'send');
  PERFORM seed.act('muahang', '2026-08-24 10:00', v_po3, 'confirm');
  v_grn := seed.doc('kho', '2026-08-28 08:00', 'GRN', jsonb_build_object('title', 'Nhận thép & sơn K300 (thiếu 10 lít sơn)'),
    jsonb_build_array(jsonb_build_object('source_line_id', seed.line(v_po3, 1), 'quantity', 3000),
                      jsonb_build_object('source_line_id', seed.line(v_po3, 2), 'quantity', 90)), v_po3);
  PERFORM seed.act('qc', '2026-08-28 09:30', v_grn, 'inspect');
  PERFORM seed.act('kho.tp', '2026-08-28 10:30', v_grn, 'store', 'NCC giao thiếu 10 lít sơn');
  v_sinv3 := seed.doc('ketoan', '2026-09-02 14:00', 'SINV', jsonb_build_object('title', 'HĐ 0001398 Thép Việt', 'data', jsonb_build_object('invoice_no', '0001398')),
    jsonb_build_array(jsonb_build_object('source_line_id', seed.line(v_po3, 1), 'quantity', 3000, 'unit_price', 18500),
                      jsonb_build_object('source_line_id', seed.line(v_po3, 2), 'quantity', 100, 'unit_price', 95000)), v_po3);
  r := seed.act('ketoan', '2026-09-02 14:10', v_sinv3, 'match');
  SELECT l.child_id INTO v_exc FROM document_links l WHERE l.parent_id = v_sinv3 AND l.link_type = 'EXCEPTION';
  PERFORM seed.act('cfo', '2026-09-03 11:00', v_exc, 'review', 'Yêu cầu mua hàng làm việc lại với NCC về đơn giá và số lượng sơn');

  -- ===== August soft close =====
  PERFORM seed.as_user('ketoantruong', '2026-09-03 17:00');
  PERFORM seed.ok(public.api_set_period_status('2026-08', 'SOFT_CLOSE'), 'soft close 08');

  -- ===== Stock transfer HN -> HCM (T1.11) =====
  v_st := seed.doc('kho', '2026-09-01 08:00', 'ST', jsonb_build_object('title', 'Điều chuyển hàng cho chi nhánh HCM',
      'warehouse_id', HN, 'to_warehouse_id', HCM),
    jsonb_build_array(jsonb_build_object('product_id', seed.prod('GD-PANEL'), 'quantity', 40),
                      jsonb_build_object('product_id', seed.prod('SP-A4'), 'quantity', 20)));
  PERFORM seed.act('kho', '2026-09-01 08:10', v_st, 'submit');
  PERFORM seed.act('kho.tp', '2026-09-01 10:00', v_st, 'approve');
  PERFORM seed.act('kho', '2026-09-02 07:00', v_st, 'dispatch', 'Xe Hino 29C-123.45');
  PERFORM seed.act('kho.hcm', '2026-09-04 15:00', v_st, 'receive', 'Nhận đủ, nguyên đai');

  -- ===== HCM Order-to-Cash =====
  v_q3 := seed.doc('kinhdoanh.hcm', '2026-09-07 09:00', 'QUOT', jsonb_build_object('title', 'Panel cho nhà xưởng Thủ Đức',
      'partner_id', seed.partner('CUS-003'), 'warehouse_id', HCM),
    jsonb_build_array(jsonb_build_object('product_id', seed.prod('GD-PANEL'), 'quantity', 30, 'unit_price', 500000)));
  PERFORM seed.act('kinhdoanh.hcm', '2026-09-07 09:10', v_q3, 'submit');
  PERFORM seed.act('gd.hcm', '2026-09-07 11:00', v_q3, 'approve');
  PERFORM seed.act('kinhdoanh.hcm', '2026-09-07 14:00', v_q3, 'send');
  PERFORM seed.act('kinhdoanh.hcm', '2026-09-09 09:00', v_q3, 'accept');
  v_so3 := seed.doc('kinhdoanh.hcm', '2026-09-09 10:00', 'SO', jsonb_build_object('title', 'Đơn panel Thủ Đức'), NULL, v_q3);
  PERFORM seed.act('gd.hcm', '2026-09-09 11:00', v_so3, 'confirm');
  v_dn := seed.doc('kho.hcm', '2026-09-10 08:00', 'DN', jsonb_build_object('title', 'Giao panel Thủ Đức'), NULL, v_so3);
  PERFORM seed.act('kho.hcm', '2026-09-10 09:00', v_dn, 'pick');
  PERFORM seed.act('kho.hcm', '2026-09-10 14:00', v_dn, 'ship');
  v_inv3 := seed.doc('ketoan.hcm', '2026-09-11 09:00', 'INV', jsonb_build_object('title', 'Hóa đơn 0000401 Kết cấu Thép Miền Nam'), NULL, v_so3);
  PERFORM seed.act('ketoantruong', '2026-09-11 14:00', v_inv3, 'post');
  PERFORM seed.doc('ketoan.hcm', '2026-09-16 09:00', 'RCPT', jsonb_build_object('title', 'Thu tiền panel Thủ Đức', 'amount', seed.amount(v_inv3)), NULL, v_inv3);

  -- O2C #2 partial collection
  v_rc := seed.doc('ketoan', '2026-09-05 09:00', 'RCPT', jsonb_build_object('title', 'Hoàng Gia tạm ứng', 'amount', 20000000), NULL, v_inv2);
  PERFORM seed.act('thuquy', '2026-09-05 10:00', v_rc, 'receive');

  -- ===== SoD violation attempts (T3.1, T3.4) =====
  v_po5 := seed.doc('gd.hcm', '2026-09-14 09:00', 'PO', jsonb_build_object('title', 'Văn phòng phẩm chi nhánh HCM',
      'partner_id', seed.partner('SUP-003'), 'warehouse_id', HCM),
    jsonb_build_array(jsonb_build_object('product_id', seed.prod('SP-A4'), 'quantity', 30, 'unit_price', 75000)));
  PERFORM seed.act('gd.hcm', '2026-09-14 09:05', v_po5, 'submit');
  PERFORM seed.try_act('gd.hcm', '2026-09-14 09:06', v_po5, 'approve');
  v_x := seed.doc('muahang.tp', '2026-09-15 08:00', 'PO', jsonb_build_object('title', 'Mua gấp bu lông dự phòng',
      'partner_id', seed.partner('SUP-001'), 'warehouse_id', HN),
    jsonb_build_array(jsonb_build_object('product_id', seed.prod('RM-BOLT'), 'quantity', 500, 'unit_price', 4400)));
  PERFORM seed.act('muahang.tp', '2026-09-15 08:05', v_x, 'submit');
  PERFORM seed.try_act('muahang.tp', '2026-09-15 08:06', v_x, 'approve');

  -- ===== Stock take (T4.9): 25 kg steel missing =====
  v_adj := seed.doc('kho', '2026-09-12 16:00', 'ADJ', jsonb_build_object('title', 'Kiểm kê định kỳ tháng 9 — kho Hà Nội', 'warehouse_id', HN,
      'data', jsonb_build_object('reason', 'Kiểm kê định kỳ')),
    jsonb_build_array(
      jsonb_build_object('product_id', seed.prod('RM-STEEL'), 'quantity', public.fn_on_hand(seed.prod('RM-STEEL'), HN) - 25),
      jsonb_build_object('product_id', seed.prod('RM-BOLT'), 'quantity', public.fn_on_hand(seed.prod('RM-BOLT'), HN))));
  PERFORM seed.act('kho', '2026-09-12 16:10', v_adj, 'submit');
  PERFORM seed.act('ketoantruong', '2026-09-13 09:00', v_adj, 'approve', 'Hao hụt cắt trong định mức 0,5%');
  PERFORM seed.act('kho.tp', '2026-09-13 10:00', v_adj, 'post');

  -- ===== Master data change (T1.15) =====
  v_mdc := seed.doc('muahang.tp', '2026-09-04 09:00', 'MDC', jsonb_build_object('title', 'Thêm NCC Thiết bị Điện Hải Phòng',
    'data', jsonb_build_object('entity', 'PARTNER', 'op', 'CREATE', 'payload', jsonb_build_object('code', 'SUP-005',
      'name', 'Công ty TNHH Thiết bị Điện Hải Phòng', 'partner_type', 'SUPPLIER', 'tax_code', '0201234999', 'payment_terms_days', 30))));
  PERFORM seed.act('muahang.tp', '2026-09-04 09:05', v_mdc, 'submit');
  PERFORM seed.act('cfo', '2026-09-05 10:00', v_mdc, 'approve', 'Đã kiểm tra MST và giấy phép');
  v_mdc := seed.doc('kinhdoanh.tp', '2026-09-15 10:00', 'MDC', jsonb_build_object('title', 'Nâng hạn mức tín dụng Hoàng Gia',
    'data', jsonb_build_object('entity', 'PARTNER', 'op', 'UPDATE', 'target_id', seed.partner('CUS-002'),
      'payload', jsonb_build_object('credit_limit', 500000000))));
  PERFORM seed.act('kinhdoanh.tp', '2026-09-15 10:05', v_mdc, 'submit');

  -- ===== Asset acquisition (T4.5) =====
  v_ast3 := seed.doc('kho.tp', '2026-09-03 09:00', 'ASSET', jsonb_build_object('title', 'Xe nâng điện Toyota 2.5T', 'amount', 450000000,
    'partner_id', seed.partner('SUP-004'),
    'data', jsonb_build_object('name', 'Xe nâng điện Toyota 2.5T', 'category', 'Thiết bị kho', 'useful_life_months', 60, 'location', 'Kho Hà Nội')));
  PERFORM seed.act('kho.tp', '2026-09-03 09:05', v_ast3, 'submit');
  PERFORM seed.act('cfo', '2026-09-04 11:00', v_ast3, 'approve');
  PERFORM seed.act('ketoan', '2026-09-10 10:00', v_ast3, 'capitalize');
  v_pmt := seed.doc('ketoan', '2026-09-11 09:00', 'PMT', jsonb_build_object('title', 'Thanh toán xe nâng Toyota', 'amount', 450000000,
    'data', jsonb_build_object('method', 'BANK_TRANSFER')), NULL, v_ast3);
  PERFORM seed.act('ketoan', '2026-09-11 09:05', v_pmt, 'submit');

  -- ===== Access review (T4.12): revoke temporary SALES_STAFF of CS manager =====
  PERFORM seed.as_user('admin', '2026-09-01 09:00');
  r := seed.ok(public.api_create_access_review(), 'access review');
  v_ar := (r->>'id')::uuid;
  SELECT l.id INTO v_x FROM document_lines l WHERE l.document_id = v_ar AND l.data->>'user_id' = seed.uid('cskh.tp')::text AND l.data->>'role_code' = 'SALES_STAFF';
  PERFORM seed.ok(public.api_access_review_decide(v_x, 'REVOKE'), 'decide');
  PERFORM seed.act('admin', '2026-09-01 09:30', v_ar, 'submit', 'Quyền SALES_STAFF cấp tạm cho CSKH đã hết hạn');
  PERFORM seed.act('kiemtoan', '2026-09-02 10:00', v_ar, 'approve');

  -- ===== Customer service tickets =====
  v_tk := seed.doc('cskh.tp', '2026-09-12 09:00', 'TICKET', jsonb_build_object('partner_id', seed.partner('CUS-004'),
    'data', jsonb_build_object('subject', 'Sự cố võng kết cấu tại công trình Phú Mỹ', 'priority', 'CRITICAL',
      'description', 'Khách báo võng dầm tầng 3, yêu cầu kỹ thuật kiểm tra gấp')));
  PERFORM seed.act(seed.owner(v_tk), '2026-09-12 09:30', v_tk, 'start');
  PERFORM seed.act(seed.owner(v_tk), '2026-09-12 18:00', v_tk, 'resolve', NULL, '{"resolution": "Kỹ thuật kiểm tra: do lắp sai vị trí gối đỡ, đã hướng dẫn nhà thầu khắc phục"}');
  PERFORM seed.act('cskh.tp', '2026-09-13 09:00', v_tk, 'close', 'Phản hồi chậm hơn SLA 4 giờ', '{"csat": 3}');
  v_tk := seed.doc('kinhdoanh2', '2026-09-10 10:00', 'TICKET', jsonb_build_object('partner_id', seed.partner('CUS-002'),
    'data', jsonb_build_object('subject', 'Yêu cầu lịch giao phần panel còn lại', 'priority', 'MEDIUM',
      'description', 'Khách cần 40 tấm panel còn lại trước 20/09')), NULL, v_so2);
  PERFORM seed.act(seed.owner(v_tk), '2026-09-10 11:00', v_tk, 'start');
  PERFORM seed.act(seed.owner(v_tk), '2026-09-11 09:00', v_tk, 'wait', 'Chờ khách xác nhận địa điểm giao');
  PERFORM seed.doc('kinhdoanh.hcm', '2026-09-15 14:00', 'TICKET', jsonb_build_object('partner_id', seed.partner('CUS-003'),
    'data', jsonb_build_object('subject', 'Xin chứng chỉ chất lượng tấm panel', 'priority', 'LOW', 'description', 'Cần CO/CQ cho hồ sơ nghiệm thu')));

  -- ===== Bank reconciliation (T4.10) =====
  v_br := seed.doc('ketoan', '2026-09-16 09:00', 'BANKREC', jsonb_build_object('title', 'Đối chiếu sao kê VCB 01/07–15/09',
      'data', jsonb_build_object('bank_account', 'VCB 0011000123456')),
    (SELECT jsonb_agg(s.x ORDER BY s.x->'data'->>'date') FROM (
       SELECT jsonb_build_object('amount', -d.amount, 'description', 'UNC ' || d.number, 'data', jsonb_build_object('date', d.updated_at::date)) AS x
       FROM documents d WHERE d.doc_type = 'PMT' AND d.status IN ('PAID','AUDITED')
       UNION ALL
       SELECT jsonb_build_object('amount', d.amount, 'description', 'Báo có ' || coalesce(d.title, d.number), 'data', jsonb_build_object('date', d.updated_at::date))
       FROM documents d WHERE d.doc_type = 'RCPT' AND d.status IN ('RECEIVED','AUDITED')
       UNION ALL
       SELECT jsonb_build_object('amount', -55000, 'description', 'Phí quản lý tài khoản tháng 8', 'data', jsonb_build_object('date', '2026-09-01'))
    ) s));
  PERFORM seed.act('ketoan', '2026-09-16 09:10', v_br, 'match');

  -- ===== Pending work for the inbox demo =====
  v_x := seed.doc('ketoan', '2026-09-10 15:00', 'JV', jsonb_build_object('title', 'Trích trước chi phí điện sản xuất tháng 9', 'doc_date', '2026-09-10'),
    '[{"account_code":"642","debit":18500000,"description":"Chi phí điện tháng 9 (tạm tính)"},{"account_code":"3388","credit":18500000,"description":"Phải trả EVN"}]');
  PERFORM seed.act('ketoan', '2026-09-10 15:05', v_x, 'submit');

  v_pr3 := seed.doc('kho', '2026-09-08 09:00', 'PR', jsonb_build_object('title', 'Giấy in cho kho vận',
      'data', jsonb_build_object('justification', 'In phiếu xuất nhập quý 4')),
    jsonb_build_array(jsonb_build_object('product_id', seed.prod('SP-A4'), 'quantity', 50, 'unit_price', 75000)));
  PERFORM seed.act('kho', '2026-09-08 09:05', v_pr3, 'submit');
  PERFORM seed.act('kho.tp', '2026-09-09 08:30', v_pr3, 'approve');
  v_po4 := seed.doc('muahang', '2026-09-10 09:00', 'PO', jsonb_build_object('title', 'Giấy in A4 — Hồng Hà',
      'partner_id', seed.partner('SUP-003'), 'warehouse_id', HN), NULL, v_pr3);
  PERFORM seed.act('muahang', '2026-09-10 09:05', v_po4, 'submit');

  v_x := seed.doc('sanxuat', '2026-09-15 08:30', 'PR', jsonb_build_object('title', 'Thép bổ sung cho lệnh K300',
      'data', jsonb_build_object('justification', 'Lệnh sản xuất 10 bộ K300')),
    jsonb_build_array(jsonb_build_object('product_id', seed.prod('RM-STEEL'), 'quantity', 2000, 'unit_price', 18000)));
  PERFORM seed.act('sanxuat', '2026-09-15 08:35', v_x, 'submit');
  PERFORM seed.doc('sanxuat', '2026-09-15 09:00', 'WO', jsonb_build_object('title', 'Sản xuất 10 bộ K300 tồn kho',
    'product_id', seed.prod('FG-K300'), 'warehouse_id', HN, 'data', jsonb_build_object('planned_qty', 10)));

  v_x := seed.doc('kinhdoanh', '2026-09-16 10:00', 'QUOT', jsonb_build_object('title', 'Báo giá khung K300 dự án Phú Mỹ',
      'partner_id', seed.partner('CUS-004'), 'warehouse_id', HN, 'data', jsonb_build_object('valid_until', '2026-10-16')),
    jsonb_build_array(jsonb_build_object('product_id', seed.prod('FG-K300'), 'quantity', 20, 'unit_price', 3800000)));
  PERFORM seed.act('kinhdoanh', '2026-09-16 10:10', v_x, 'submit');

  PERFORM seed.as_user('nhansu', '2026-09-16 16:00');
  PERFORM seed.ok(public.api_create_payroll('2026-09'), 'payroll 2026-09');

  -- old notifications are considered read
  UPDATE notifications SET is_read = true WHERE created_at < '2026-09-10';
END $$;

-- clear impersonation
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true), set_config('app.fake_now', '', true);

DROP SCHEMA seed CASCADE;

COMMIT;
