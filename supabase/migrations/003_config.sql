-- ERP General — 003 Configuration: roles, permissions (BM-12), SoD (BM-06),
-- doc types + state machines (BM-05), child rules, handoff map (BM-04),
-- chart of accounts, KPI catalog (BM-10), data dictionary (BM-07), acceptance criteria (BM-14)

-- ============================================================
-- ROLES
-- ============================================================
INSERT INTO roles (code, name, description, sort) VALUES
  ('CEO',              'Tổng giám đốc',            'Xem toàn công ty, duyệt ngân sách và rà soát quyền', 1),
  ('CFO',              'Giám đốc tài chính',       'Duyệt thanh toán, lương, tài sản, ngoại lệ, dữ liệu chủ', 2),
  ('CHIEF_ACCOUNTANT', 'Kế toán trưởng',           'Ghi sổ hóa đơn, bút toán, kiểm kê, khóa sổ', 3),
  ('ACCOUNTANT',       'Kế toán viên',             'Lập hóa đơn, phiếu chi/thu, bút toán, khấu hao', 4),
  ('TREASURER',        'Thủ quỹ',                  'Thực hiện chi/thu tiền', 5),
  ('INTERNAL_AUDITOR', 'Kiểm toán nội bộ',         'Hậu kiểm, xem audit trail và nhật ký SoD', 6),
  ('PROC_MANAGER',     'Trưởng phòng mua hàng',    'Duyệt đơn mua hàng', 7),
  ('BUYER',            'Nhân viên mua hàng',       'Lập và theo dõi đơn mua hàng', 8),
  ('WH_MANAGER',       'Trưởng kho',               'Nhập/xuất kho, duyệt chuyển kho', 9),
  ('WH_STAFF',         'Nhân viên kho',            'Lập phiếu kho — không xem giá', 10),
  ('PROD_MANAGER',     'Giám đốc sản xuất',        'Duyệt lệnh sản xuất', 11),
  ('PROD_STAFF',       'Nhân viên kế hoạch SX',    'Lập và vận hành lệnh sản xuất', 12),
  ('QC_INSPECTOR',     'Kiểm soát chất lượng',     'Kiểm tra hàng nhập và thành phẩm', 13),
  ('SALES_MANAGER',    'Trưởng phòng kinh doanh',  'Duyệt báo giá, xác nhận đơn bán', 14),
  ('SALES_STAFF',      'Nhân viên kinh doanh',     'Lập báo giá, đơn bán — chỉ thấy của mình', 15),
  ('HR_MANAGER',       'Trưởng phòng nhân sự',     'Duyệt tuyển dụng', 16),
  ('HR_STAFF',         'Chuyên viên nhân sự',      'Tính lương, tiếp nhận nhân sự', 17),
  ('CS_MANAGER',       'Trưởng CSKH',              'Phân công và đóng ticket', 18),
  ('CS_AGENT',         'Nhân viên CSKH',           'Xử lý ticket được giao', 19),
  ('SYS_ADMIN',        'Quản trị hệ thống',        'Quản lý người dùng/quyền — không có quyền nghiệp vụ', 20),
  ('BRANCH_DIRECTOR',  'Giám đốc chi nhánh',       'Quyền rộng trong chi nhánh — vẫn bị SoD chặn', 21),
  ('DEPT_HEAD',        'Trưởng bộ phận',           'Duyệt đề nghị mua hàng, lập ngân sách bộ phận', 22),
  ('EMPLOYEE',         'Nhân viên (cơ bản)',       'Đề nghị mua hàng, ticket, báo ngoại lệ của mình', 23);

-- ============================================================
-- PERMISSIONS (BM-12): helper to insert role × resources × actions
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
DECLARE
  all_docs text := 'BUDGET,PR,PO,GRN,SINV,PMT,QUOT,SO,DN,INV,RCPT,ST,ADJ,WO,HIRE,PAYROLL,JV,ASSET,TICKET,EXC,MDC,ACCESS_REVIEW,BANKREC';
  price text[] := ARRAY['unit_price','amount','unit_cost','value','debit','credit'];
BEGIN
  -- EMPLOYEE (everyone)
  PERFORM _perm('EMPLOYEE', 'PR,EXC', 'VIEW,CREATE,EDIT', 'OWN');
  PERFORM _perm('EMPLOYEE', 'TICKET,ASSET', 'VIEW,CREATE', 'OWN');

  -- DEPT_HEAD
  PERFORM _perm('DEPT_HEAD', 'PR', 'VIEW,APPROVE', 'DEPARTMENT');
  PERFORM _perm('DEPT_HEAD', 'BUDGET,HIRE', 'VIEW,CREATE', 'DEPARTMENT');
  PERFORM _perm('DEPT_HEAD', 'PO,GRN,SINV,PMT,ASSET', 'VIEW', 'DEPARTMENT');
  PERFORM _perm('DEPT_HEAD', 'EMPLOYEE', 'VIEW', 'DEPARTMENT', ARRAY['base_salary','allowance','bank_account']);
  PERFORM _perm('DEPT_HEAD', 'KPI,REPORT_OPS', 'VIEW', 'COMPANY');

  -- CEO
  PERFORM _perm('CEO', all_docs, 'VIEW', 'COMPANY');
  PERFORM _perm('CEO', 'BUDGET,ACCESS_REVIEW', 'APPROVE', 'COMPANY');
  PERFORM _perm('CEO', 'GL,INVENTORY,EMPLOYEE,KPI,REPORT_OPS,AUDIT_TRAIL,SOD_LOG,HANDOFF', 'VIEW', 'COMPANY');
  PERFORM _perm('CEO', 'GL,REPORT_OPS', 'EXPORT', 'COMPANY');

  -- CFO
  PERFORM _perm('CFO', all_docs, 'VIEW', 'COMPANY');
  PERFORM _perm('CFO', 'BUDGET,PMT,PAYROLL,ASSET,EXC,MDC,SINV', 'APPROVE', 'COMPANY');
  PERFORM _perm('CFO', 'BUDGET,PERIOD', 'EXECUTE', 'COMPANY');
  PERFORM _perm('CFO', 'EXC', 'EDIT', 'COMPANY');
  PERFORM _perm('CFO', 'GL,INVENTORY,EMPLOYEE,KPI,REPORT_OPS,HANDOFF,SOD_LOG,AUDIT_TRAIL', 'VIEW', 'COMPANY');
  PERFORM _perm('CFO', 'GL,REPORT_OPS', 'EXPORT', 'COMPANY');

  -- CHIEF_ACCOUNTANT
  PERFORM _perm('CHIEF_ACCOUNTANT', 'BUDGET,PR,PO,GRN,SINV,PMT,SO,DN,INV,RCPT,ST,ADJ,WO,PAYROLL,JV,ASSET,EXC,BANKREC', 'VIEW', 'COMPANY');
  PERFORM _perm('CHIEF_ACCOUNTANT', 'SINV,INV,JV,ADJ,BANKREC', 'APPROVE', 'COMPANY');
  PERFORM _perm('CHIEF_ACCOUNTANT', 'PERIOD', 'EXECUTE', 'COMPANY');
  PERFORM _perm('CHIEF_ACCOUNTANT', 'GL,INVENTORY,EMPLOYEE,KPI,REPORT_OPS,HANDOFF', 'VIEW', 'COMPANY');
  PERFORM _perm('CHIEF_ACCOUNTANT', 'GL', 'EXPORT', 'COMPANY');

  -- ACCOUNTANT (branch scoped)
  PERFORM _perm('ACCOUNTANT', 'BUDGET,PO,GRN,SINV,PMT,SO,DN,INV,RCPT,ADJ,PAYROLL,JV,ASSET,BANKREC', 'VIEW', 'BRANCH');
  PERFORM _perm('ACCOUNTANT', 'SINV,PMT,INV,RCPT,JV,BANKREC', 'CREATE', 'BRANCH');
  PERFORM _perm('ACCOUNTANT', 'BANKREC', 'EDIT', 'BRANCH');
  PERFORM _perm('ACCOUNTANT', 'PAYROLL,ASSET,DEPRECIATION', 'EXECUTE', 'BRANCH');
  PERFORM _perm('ACCOUNTANT', 'GL,INVENTORY,KPI', 'VIEW', 'BRANCH');
  PERFORM _perm('ACCOUNTANT', 'EMPLOYEE', 'VIEW', 'BRANCH', ARRAY['bank_account']);
  PERFORM _perm('ACCOUNTANT', 'GL', 'EXPORT', 'BRANCH');

  -- TREASURER
  PERFORM _perm('TREASURER', 'PMT,RCPT,SINV,INV,PAYROLL,ASSET', 'VIEW', 'COMPANY');
  PERFORM _perm('TREASURER', 'PMT,RCPT', 'EXECUTE', 'COMPANY');
  PERFORM _perm('TREASURER', 'GL', 'VIEW', 'COMPANY');

  -- INTERNAL_AUDITOR
  PERFORM _perm('INTERNAL_AUDITOR', all_docs, 'VIEW', 'COMPANY');
  PERFORM _perm('INTERNAL_AUDITOR', 'PMT,RCPT,JV', 'AUDIT', 'COMPANY');
  PERFORM _perm('INTERNAL_AUDITOR', 'ACCESS_REVIEW', 'APPROVE', 'COMPANY');
  PERFORM _perm('INTERNAL_AUDITOR', 'AUDIT_TRAIL,SOD_LOG,HANDOFF,GL,INVENTORY,KPI,REPORT_OPS', 'VIEW', 'COMPANY');
  PERFORM _perm('INTERNAL_AUDITOR', 'EMPLOYEE', 'VIEW', 'COMPANY', ARRAY['bank_account']);
  PERFORM _perm('INTERNAL_AUDITOR', 'AUDIT_TRAIL,GL,REPORT_OPS', 'EXPORT', 'COMPANY');

  -- PROCUREMENT
  PERFORM _perm('PROC_MANAGER', 'PR,PO,GRN,SINV', 'VIEW', 'BRANCH');
  PERFORM _perm('PROC_MANAGER', 'PO', 'CREATE,EDIT,APPROVE', 'BRANCH');
  PERFORM _perm('PROC_MANAGER', 'MDC', 'VIEW,CREATE', 'OWN');
  PERFORM _perm('PROC_MANAGER', 'INVENTORY,KPI,REPORT_OPS,HANDOFF', 'VIEW', 'BRANCH');
  PERFORM _perm('BUYER', 'PR,GRN', 'VIEW', 'BRANCH');
  PERFORM _perm('BUYER', 'PO', 'VIEW,CREATE,EDIT', 'DEPARTMENT');
  PERFORM _perm('BUYER', 'INVENTORY', 'VIEW', 'BRANCH');

  -- WAREHOUSE
  PERFORM _perm('WH_MANAGER', 'PO,GRN,SO,DN,ST,ADJ,WO', 'VIEW', 'BRANCH');
  PERFORM _perm('WH_MANAGER', 'GRN,DN,ST,ADJ', 'CREATE', 'BRANCH');
  PERFORM _perm('WH_MANAGER', 'DN,ST', 'EDIT', 'BRANCH');
  PERFORM _perm('WH_MANAGER', 'GRN,DN,ST,ADJ,WO', 'EXECUTE', 'BRANCH');
  PERFORM _perm('WH_MANAGER', 'ST', 'APPROVE', 'BRANCH');
  PERFORM _perm('WH_MANAGER', 'INVENTORY,KPI,REPORT_OPS', 'VIEW', 'BRANCH');
  PERFORM _perm('WH_STAFF', 'PO,SO,GRN,DN,ADJ', 'VIEW', 'BRANCH', price);
  PERFORM _perm('WH_STAFF', 'ST,WO', 'VIEW', 'BRANCH');
  PERFORM _perm('WH_STAFF', 'GRN,DN,ST,ADJ', 'CREATE', 'BRANCH');
  PERFORM _perm('WH_STAFF', 'DN,ST', 'EDIT', 'BRANCH');
  PERFORM _perm('WH_STAFF', 'ST', 'EXECUTE', 'BRANCH');
  PERFORM _perm('WH_STAFF', 'INVENTORY', 'VIEW', 'BRANCH', price);

  -- PRODUCTION
  PERFORM _perm('PROD_MANAGER', 'WO', 'VIEW,CREATE,EDIT,APPROVE', 'BRANCH');
  PERFORM _perm('PROD_MANAGER', 'SO', 'VIEW', 'BRANCH');
  PERFORM _perm('PROD_MANAGER', 'INVENTORY,KPI,REPORT_OPS', 'VIEW', 'BRANCH');
  PERFORM _perm('PROD_STAFF', 'WO', 'VIEW,CREATE,EDIT', 'DEPARTMENT');
  PERFORM _perm('PROD_STAFF', 'SO', 'VIEW', 'BRANCH', price);
  PERFORM _perm('PROD_STAFF', 'INVENTORY', 'VIEW', 'BRANCH', price);
  PERFORM _perm('QC_INSPECTOR', 'QC', 'EXECUTE', 'BRANCH');
  PERFORM _perm('QC_INSPECTOR', 'GRN', 'VIEW', 'BRANCH', price);
  PERFORM _perm('QC_INSPECTOR', 'WO', 'VIEW', 'BRANCH');

  -- SALES
  PERFORM _perm('SALES_MANAGER', 'QUOT,SO', 'VIEW,CREATE,EDIT,APPROVE', 'DEPARTMENT');
  PERFORM _perm('SALES_MANAGER', 'DN,INV,RCPT,WO,TICKET', 'VIEW', 'DEPARTMENT');
  PERFORM _perm('SALES_MANAGER', 'TICKET', 'CREATE', 'DEPARTMENT');
  PERFORM _perm('SALES_MANAGER', 'MDC', 'VIEW,CREATE', 'OWN');
  PERFORM _perm('SALES_MANAGER', 'INVENTORY', 'VIEW', 'BRANCH', ARRAY['unit_cost','value']);
  PERFORM _perm('SALES_MANAGER', 'KPI,REPORT_OPS', 'VIEW', 'DEPARTMENT');
  PERFORM _perm('SALES_STAFF', 'QUOT,SO', 'VIEW,CREATE,EDIT', 'OWN');
  PERFORM _perm('SALES_STAFF', 'DN,INV,RCPT', 'VIEW', 'OWN');
  PERFORM _perm('SALES_STAFF', 'TICKET', 'VIEW,CREATE', 'OWN');
  PERFORM _perm('SALES_STAFF', 'INVENTORY', 'VIEW', 'BRANCH', ARRAY['unit_cost','value']);

  -- HR
  PERFORM _perm('HR_MANAGER', 'HIRE', 'VIEW,APPROVE', 'COMPANY');
  PERFORM _perm('HR_MANAGER', 'PAYROLL,EMPLOYEE,KPI', 'VIEW', 'COMPANY');
  PERFORM _perm('HR_STAFF', 'HIRE', 'VIEW,EXECUTE', 'COMPANY');
  PERFORM _perm('HR_STAFF', 'PAYROLL', 'VIEW,CREATE', 'COMPANY');
  PERFORM _perm('HR_STAFF', 'EMPLOYEE', 'VIEW', 'COMPANY');

  -- CUSTOMER SERVICE
  PERFORM _perm('CS_MANAGER', 'TICKET', 'VIEW,CREATE,EDIT,APPROVE', 'COMPANY');
  PERFORM _perm('CS_MANAGER', 'SO,DN', 'VIEW', 'COMPANY', price);
  PERFORM _perm('CS_MANAGER', 'KPI,REPORT_OPS', 'VIEW', 'COMPANY');
  PERFORM _perm('CS_AGENT', 'TICKET', 'VIEW,CREATE,EDIT', 'OWN');
  PERFORM _perm('CS_AGENT', 'SO,DN', 'VIEW', 'BRANCH', price);

  -- SYSTEM ADMIN (no business permissions — no god mode)
  PERFORM _perm('SYS_ADMIN', 'USER_ADMIN', 'VIEW,EDIT', 'COMPANY');
  PERFORM _perm('SYS_ADMIN', 'ACCESS_REVIEW', 'VIEW,CREATE', 'COMPANY');
  PERFORM _perm('SYS_ADMIN', 'AUDIT_TRAIL', 'VIEW', 'COMPANY');

  -- BRANCH DIRECTOR (broad, branch scoped; SoD still applies)
  PERFORM _perm('BRANCH_DIRECTOR', all_docs, 'VIEW', 'BRANCH');
  PERFORM _perm('BRANCH_DIRECTOR', 'PR,PO,QUOT,SO,TICKET', 'CREATE', 'BRANCH');
  PERFORM _perm('BRANCH_DIRECTOR', 'PO,QUOT,SO', 'EDIT', 'BRANCH');
  PERFORM _perm('BRANCH_DIRECTOR', 'PR,PO,QUOT,SO,PMT,ST,ADJ,WO', 'APPROVE', 'BRANCH');
  PERFORM _perm('BRANCH_DIRECTOR', 'PMT,DN', 'EXECUTE', 'BRANCH');
  PERFORM _perm('BRANCH_DIRECTOR', 'GL,INVENTORY,EMPLOYEE,KPI,REPORT_OPS,HANDOFF', 'VIEW', 'BRANCH');
END $$;

DROP FUNCTION _perm(text, text, text, text, text[]);

-- ============================================================
-- SoD MATRIX (BM-06)
-- ============================================================
INSERT INTO sod_matrix (role_a, role_b, conflict_type, description) VALUES
  ('REQUESTER', 'APPROVER', 'HARD', 'Người đề xuất ≠ Người phê duyệt'),
  ('APPROVER',  'EXECUTOR', 'HARD', 'Người phê duyệt ≠ Người thực hiện'),
  ('EXECUTOR',  'AUDITOR',  'HARD', 'Người thực hiện ≠ Người kiểm tra'),
  ('REQUESTER', 'EXECUTOR', 'HARD', 'Người đề xuất ≠ Người thực hiện');

-- ============================================================
-- DOC TYPES
-- ============================================================
INSERT INTO doc_types (code, name, prefix, flow_code, module, initial_status, terminal_statuses, financial, create_sod_role, sort) VALUES
  ('BUDGET',  'Ngân sách bộ phận',        'BDG',  'L1',  'planning',         'DRAFT',      '{CLOSED,CANCELLED}', true,  'REQUESTER', 1),
  ('QUOT',    'Báo giá',                  'QT',   'L2',  'sales',            'DRAFT',      '{ORDERED,LOST,CANCELLED}', false, 'REQUESTER', 10),
  ('SO',      'Đơn bán hàng',             'SO',   'L2',  'sales',            'DRAFT',      '{CLOSED,CANCELLED}', true,  'REQUESTER', 11),
  ('DN',      'Phiếu xuất kho giao hàng', 'DN',   'L4',  'inventory',        'DRAFT',      '{SHIPPED,CANCELLED}', false, NULL, 12),
  ('INV',     'Hóa đơn bán hàng',         'INV',  'L2',  'sales',            'DRAFT',      '{PAID,CANCELLED}', true,  'REQUESTER', 13),
  ('RCPT',    'Phiếu thu',                'RC',   'L7',  'finance',          'DRAFT',      '{AUDITED,CANCELLED}', true,  'REQUESTER', 14),
  ('PR',      'Đề nghị mua hàng',         'PR',   'L3',  'procurement',      'DRAFT',      '{CLOSED,CANCELLED}', true,  'REQUESTER', 20),
  ('PO',      'Đơn mua hàng',             'PO',   'L3',  'procurement',      'DRAFT',      '{PAID,CANCELLED}', true,  'REQUESTER', 21),
  ('GRN',     'Phiếu nhập kho',           'GRN',  'L4',  'inventory',        'DRAFT',      '{STORED,REJECTED,CANCELLED}', false, NULL, 22),
  ('SINV',    'Hóa đơn nhà cung cấp',     'SI',   'L3',  'finance',          'DRAFT',      '{PAID,CANCELLED}', true,  'REQUESTER', 23),
  ('PMT',     'Phiếu chi / UNC',          'PAY',  'L7',  'finance',          'DRAFT',      '{AUDITED,CANCELLED}', true,  'REQUESTER', 24),
  ('ST',      'Phiếu chuyển kho',         'ST',   'L4',  'inventory',        'DRAFT',      '{RECEIVED,CANCELLED}', false, 'REQUESTER', 30),
  ('ADJ',     'Kiểm kê / điều chỉnh kho', 'ADJ',  'L4',  'inventory',        'DRAFT',      '{POSTED,CANCELLED}', true,  'REQUESTER', 31),
  ('WO',      'Lệnh sản xuất',            'WO',   'L5',  'production',       'PLANNED',    '{CLOSED,CANCELLED}', false, 'REQUESTER', 40),
  ('HIRE',    'Đề nghị tuyển dụng',       'HR',   'L6',  'hr',               'DRAFT',      '{ONBOARDED,CANCELLED}', false, 'REQUESTER', 50),
  ('PAYROLL', 'Bảng lương',               'PRL',  'L6',  'hr',               'CALCULATED', '{PAID,CANCELLED}', true,  'REQUESTER', 51),
  ('JV',      'Bút toán tổng hợp',        'JV',   'L7',  'finance',          'DRAFT',      '{REVERSED,AUDITED,CANCELLED}', true, 'REQUESTER', 60),
  ('BANKREC', 'Đối chiếu ngân hàng',      'BR',   'L7',  'finance',          'DRAFT',      '{RECONCILED}', true, 'REQUESTER', 61),
  ('ASSET',   'Tài sản cố định',          'AST',  'L8',  'assets',           'DRAFT',      '{DISPOSED,CANCELLED}', true, 'REQUESTER', 70),
  ('TICKET',  'Ticket CSKH',              'TK',   'L9',  'customer-service', 'OPEN',       '{CLOSED}', false, NULL, 80),
  ('EXC',     'Ngoại lệ',                 'EXC',  'L4',  'exceptions',       'RAISED',     '{CLOSED,REJECTED}', false, 'REQUESTER', 90),
  ('MDC',     'Yêu cầu thay đổi dữ liệu chủ', 'MDC', 'L10', 'admin',           'DRAFT',      '{APPROVED,REJECTED,CANCELLED}', false, 'REQUESTER', 91),
  ('ACCESS_REVIEW', 'Rà soát quyền truy cập', 'AR', 'L10', 'admin',            'DRAFT',      '{APPROVED}', false, 'REQUESTER', 92);

-- ============================================================
-- STATE MACHINES (BM-05)
-- columns: doc_type, from, to, action, label, perm_action, perm_resource, sod_role, conditions, style, system_only, sort
-- ============================================================
INSERT INTO state_transitions (doc_type, from_status, to_status, action, label, permission_action, permission_resource, sod_role, conditions, style, system_only, sort) VALUES
  -- BUDGET
  ('BUDGET','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{has_lines}','primary',false,1),
  ('BUDGET','SUBMITTED','APPROVED','approve','Phê duyệt','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('BUDGET','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('BUDGET','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('BUDGET','APPROVED','ACTIVE','activate','Kích hoạt','EXECUTE',NULL,NULL,'{}','primary',false,5),
  ('BUDGET','ACTIVE','CLOSED','close','Đóng kỳ ngân sách','EXECUTE',NULL,NULL,'{}','default',false,6),
  ('BUDGET','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- PR
  ('PR','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{has_lines}','primary',false,1),
  ('PR','SUBMITTED','APPROVED','approve','Phê duyệt','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('PR','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('PR','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('PR','APPROVED','ORDERED','po_created','Đã lập PO','CREATE',NULL,NULL,'{}','default',true,5),
  ('PR','ORDERED','CLOSED','close','Đóng đề nghị','EDIT',NULL,NULL,'{}','default',false,6),
  ('PR','APPROVED','CLOSED','close','Đóng đề nghị','EDIT',NULL,NULL,'{}','default',false,7),
  ('PR','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- PO
  ('PO','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{has_lines,budget_available}','primary',false,1),
  ('PO','SUBMITTED','APPROVED','approve','Phê duyệt','APPROVE',NULL,'APPROVER','{budget_available}','success',false,2),
  ('PO','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('PO','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('PO','APPROVED','SENT','send','Gửi nhà cung cấp','EDIT',NULL,NULL,'{}','primary',false,5),
  ('PO','SENT','CONFIRMED','confirm','NCC xác nhận','EDIT',NULL,NULL,'{}','primary',false,6),
  ('PO','CONFIRMED','PARTIALLY_RECEIVED','receive_partial','Nhận một phần','EXECUTE','GRN',NULL,'{}','default',true,7),
  ('PO','CONFIRMED','RECEIVED','receive_full','Nhận đủ hàng','EXECUTE','GRN',NULL,'{}','default',true,8),
  ('PO','PARTIALLY_RECEIVED','RECEIVED','receive_full','Nhận đủ hàng','EXECUTE','GRN',NULL,'{}','default',true,9),
  ('PO','RECEIVED','INVOICED','invoiced','Đã khớp hóa đơn','APPROVE','SINV',NULL,'{}','default',true,10),
  ('PO','INVOICED','PAID','paid','Đã thanh toán','EXECUTE','PMT',NULL,'{}','default',true,11),
  ('PO','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,19),
  -- GRN
  ('GRN','DRAFT','INSPECTED','inspect','Kiểm tra chất lượng (QC)','EXECUTE','QC',NULL,'{has_lines}','primary',false,1),
  ('GRN','INSPECTED','STORED','store','Nhập kho','EXECUTE',NULL,NULL,'{}','success',false,2),
  ('GRN','INSPECTED','REJECTED','reject','QC không đạt — trả hàng','EXECUTE','QC',NULL,'{}','danger',false,3),
  ('GRN','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- SINV
  ('SINV','DRAFT','MATCHED','match','Đối chiếu 3 chiều','CREATE',NULL,'REQUESTER','{has_lines}','primary',false,1),
  ('SINV','DRAFT','ON_HOLD','match_failed','Lệch 3 chiều — tạm giữ','CREATE',NULL,'REQUESTER','{}','danger',true,2),
  ('SINV','ON_HOLD','MATCHED','release','Giải tỏa (ngoại lệ đã duyệt)','APPROVE',NULL,'APPROVER','{exception_approved}','success',false,3),
  ('SINV','MATCHED','POSTED','post','Ghi sổ công nợ','APPROVE',NULL,'APPROVER','{period_open}','success',false,4),
  ('SINV','POSTED','PARTIALLY_PAID','paid_partial','Thanh toán một phần','EXECUTE','PMT',NULL,'{}','default',true,5),
  ('SINV','POSTED','PAID','paid','Đã thanh toán','EXECUTE','PMT',NULL,'{}','default',true,6),
  ('SINV','PARTIALLY_PAID','PAID','paid','Đã thanh toán','EXECUTE','PMT',NULL,'{}','default',true,7),
  ('SINV','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  ('SINV','ON_HOLD','CANCELLED','cancel','Hủy hóa đơn','APPROVE',NULL,NULL,'{}','danger',false,10),
  -- PMT
  ('PMT','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{amount_positive}','primary',false,1),
  ('PMT','SUBMITTED','APPROVED','approve','Phê duyệt chi','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('PMT','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('PMT','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('PMT','APPROVED','PAID','execute','Thực hiện chi tiền','EXECUTE',NULL,'EXECUTOR','{period_open}','success',false,5),
  ('PMT','PAID','AUDITED','audit','Hậu kiểm','AUDIT',NULL,'AUDITOR','{}','primary',false,6),
  ('PMT','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- QUOT
  ('QUOT','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{has_lines}','primary',false,1),
  ('QUOT','SUBMITTED','APPROVED','approve','Phê duyệt','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('QUOT','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('QUOT','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('QUOT','APPROVED','SENT','send','Gửi khách hàng','EDIT',NULL,NULL,'{}','primary',false,5),
  ('QUOT','SENT','ACCEPTED','accept','Khách chấp nhận','EDIT',NULL,NULL,'{}','success',false,6),
  ('QUOT','SENT','LOST','lose','Khách từ chối','EDIT',NULL,NULL,'{}','danger',false,7),
  ('QUOT','ACCEPTED','ORDERED','so_created','Đã tạo đơn bán','CREATE','SO',NULL,'{}','default',true,8),
  ('QUOT','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- SO
  ('SO','DRAFT','CONFIRMED','confirm','Xác nhận đơn (kiểm tra tồn kho)','APPROVE',NULL,'APPROVER','{has_lines,stock_available}','success',false,1),
  ('SO','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,2),
  ('SO','CONFIRMED','PARTIALLY_SHIPPED','ship_partial','Giao một phần','EXECUTE','DN',NULL,'{}','default',true,3),
  ('SO','CONFIRMED','SHIPPED','ship_full','Đã giao đủ','EXECUTE','DN',NULL,'{}','default',true,4),
  ('SO','PARTIALLY_SHIPPED','SHIPPED','ship_full','Đã giao đủ','EXECUTE','DN',NULL,'{}','default',true,5),
  ('SO','SHIPPED','INVOICED','invoiced','Đã xuất hóa đơn đủ','APPROVE','INV',NULL,'{}','default',true,6),
  ('SO','INVOICED','CLOSED','closed','Đã thu đủ — đóng đơn','EXECUTE','RCPT',NULL,'{}','default',true,7),
  -- DN
  ('DN','DRAFT','PICKED','pick','Soạn hàng','EDIT',NULL,NULL,'{has_lines}','primary',false,1),
  ('DN','PICKED','SHIPPED','ship','Xuất kho & giao hàng','EXECUTE',NULL,'EXECUTOR','{stock_available,period_open}','success',false,2),
  ('DN','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,8),
  ('DN','PICKED','CANCELLED','cancel','Hủy','EDIT',NULL,NULL,'{}','danger',false,9),
  -- INV
  ('INV','DRAFT','POSTED','post','Phát hành & ghi sổ','APPROVE',NULL,'APPROVER','{has_lines,period_open}','success',false,1),
  ('INV','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,2),
  ('INV','POSTED','PARTIALLY_PAID','paid_partial','Thu một phần','EXECUTE','RCPT',NULL,'{}','default',true,3),
  ('INV','POSTED','PAID','paid','Đã thu đủ','EXECUTE','RCPT',NULL,'{}','default',true,4),
  ('INV','PARTIALLY_PAID','PAID','paid','Đã thu đủ','EXECUTE','RCPT',NULL,'{}','default',true,5),
  -- RCPT
  ('RCPT','DRAFT','RECEIVED','receive','Xác nhận thu tiền','EXECUTE',NULL,'EXECUTOR','{amount_positive,period_open}','success',false,1),
  ('RCPT','RECEIVED','AUDITED','audit','Hậu kiểm','AUDIT',NULL,'AUDITOR','{}','primary',false,2),
  ('RCPT','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- ST
  ('ST','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{has_lines,stock_available}','primary',false,1),
  ('ST','SUBMITTED','APPROVED','approve','Phê duyệt','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('ST','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('ST','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('ST','APPROVED','IN_TRANSIT','dispatch','Xuất kho đi','EXECUTE',NULL,NULL,'{stock_available}','primary',false,5),
  ('ST','IN_TRANSIT','RECEIVED','receive','Nhận tại kho đích','EDIT',NULL,NULL,'{}','success',false,6),
  ('ST','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- ADJ
  ('ADJ','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{has_lines}','primary',false,1),
  ('ADJ','SUBMITTED','APPROVED','approve','Phê duyệt chênh lệch','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('ADJ','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('ADJ','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('ADJ','APPROVED','POSTED','post','Ghi nhận điều chỉnh','EXECUTE',NULL,'EXECUTOR','{period_open}','success',false,5),
  ('ADJ','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- WO
  ('WO','PLANNED','RELEASED','release','Phê duyệt lệnh','APPROVE',NULL,'APPROVER','{has_lines}','success',false,1),
  ('WO','PLANNED','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,2),
  ('WO','RELEASED','MATERIAL_ISSUED','issue_material','Xuất vật tư sản xuất','EXECUTE',NULL,'EXECUTOR','{stock_available,period_open}','primary',false,3),
  ('WO','MATERIAL_ISSUED','IN_PRODUCTION','start','Bắt đầu sản xuất','EDIT',NULL,NULL,'{}','primary',false,4),
  ('WO','IN_PRODUCTION','QC','send_qc','Chuyển QC','EDIT',NULL,NULL,'{}','primary',false,5),
  ('WO','QC','COMPLETED','qc_pass','QC đạt — nhập thành phẩm','EXECUTE','QC',NULL,'{period_open}','success',false,6),
  ('WO','QC','IN_PRODUCTION','qc_fail','QC không đạt — làm lại','EXECUTE','QC',NULL,'{}','danger',false,7),
  ('WO','COMPLETED','CLOSED','close','Đóng lệnh','EDIT',NULL,NULL,'{}','default',false,8),
  -- HIRE
  ('HIRE','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{}','primary',false,1),
  ('HIRE','SUBMITTED','APPROVED','approve','Phê duyệt tuyển dụng','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('HIRE','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('HIRE','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('HIRE','APPROVED','ONBOARDED','onboard','Tiếp nhận nhân sự','EXECUTE',NULL,'EXECUTOR','{}','success',false,5),
  ('HIRE','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- PAYROLL
  ('PAYROLL','CALCULATED','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{has_lines}','primary',false,1),
  ('PAYROLL','SUBMITTED','APPROVED','approve','Phê duyệt bảng lương','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('PAYROLL','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('PAYROLL','REJECTED','CALCULATED','revise','Tính lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('PAYROLL','APPROVED','POSTED','post','Hạch toán lương','EXECUTE',NULL,NULL,'{period_open}','success',false,5),
  ('PAYROLL','POSTED','PAID','paid','Đã chi lương','EXECUTE','PMT',NULL,'{}','default',true,6),
  ('PAYROLL','CALCULATED','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- JV
  ('JV','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{has_lines,balanced}','primary',false,1),
  ('JV','SUBMITTED','POSTED','post','Ghi sổ cái','APPROVE',NULL,'APPROVER','{balanced,period_open_jv}','success',false,2),
  ('JV','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('JV','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('JV','POSTED','REVERSED','reverse','Đảo bút toán','APPROVE',NULL,'APPROVER','{period_open}','danger',false,5),
  ('JV','POSTED','AUDITED','audit','Hậu kiểm','AUDIT',NULL,'AUDITOR','{}','primary',false,6),
  ('JV','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- BANKREC
  ('BANKREC','DRAFT','MATCHED','match','Tự động khớp giao dịch','EDIT',NULL,NULL,'{has_lines}','primary',false,1),
  ('BANKREC','MATCHED','DRAFT','unmatch','Bỏ khớp','EDIT',NULL,NULL,'{}','default',false,2),
  ('BANKREC','MATCHED','RECONCILED','reconcile','Xác nhận đối chiếu','APPROVE',NULL,'APPROVER','{all_matched}','success',false,3),
  -- ASSET
  ('ASSET','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{amount_positive}','primary',false,1),
  ('ASSET','SUBMITTED','APPROVED','approve','Phê duyệt mua sắm','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('ASSET','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('ASSET','REJECTED','DRAFT','revise','Sửa lại','CREATE',NULL,'REQUESTER','{}','default',false,4),
  ('ASSET','APPROVED','IN_USE','capitalize','Ghi tăng tài sản','EXECUTE',NULL,NULL,'{period_open}','success',false,5),
  ('ASSET','IN_USE','UNDER_MAINTENANCE','maintain','Đưa đi bảo trì','EXECUTE',NULL,NULL,'{}','default',false,6),
  ('ASSET','UNDER_MAINTENANCE','IN_USE','restore','Đưa vào sử dụng lại','EXECUTE',NULL,NULL,'{}','primary',false,7),
  ('ASSET','IN_USE','DISPOSED','dispose','Thanh lý','APPROVE',NULL,'APPROVER','{period_open}','danger',false,8),
  ('ASSET','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- TICKET
  ('TICKET','OPEN','ASSIGNED','assign','Phân công','APPROVE',NULL,NULL,'{}','primary',false,1),
  ('TICKET','ASSIGNED','ASSIGNED','reassign','Chuyển người xử lý','APPROVE',NULL,NULL,'{}','default',false,2),
  ('TICKET','ASSIGNED','IN_PROGRESS','start','Bắt đầu xử lý','EDIT',NULL,NULL,'{}','primary',false,3),
  ('TICKET','IN_PROGRESS','WAITING_CUSTOMER','wait','Chờ khách hàng','EDIT',NULL,NULL,'{}','default',false,4),
  ('TICKET','WAITING_CUSTOMER','IN_PROGRESS','resume','Khách đã phản hồi','EDIT',NULL,NULL,'{}','primary',false,5),
  ('TICKET','IN_PROGRESS','RESOLVED','resolve','Đã giải quyết','EDIT',NULL,NULL,'{resolution_provided}','success',false,6),
  ('TICKET','RESOLVED','IN_PROGRESS','reopen','Mở lại','EDIT',NULL,NULL,'{}','danger',false,7),
  ('TICKET','RESOLVED','CLOSED','close','Đóng ticket (ghi nhận CSAT)','APPROVE',NULL,NULL,'{}','success',false,8),
  -- EXC
  ('EXC','RAISED','UNDER_REVIEW','review','Tiếp nhận xem xét','APPROVE',NULL,NULL,'{}','primary',false,1),
  ('EXC','UNDER_REVIEW','APPROVED','approve','Chấp thuận ngoại lệ','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('EXC','UNDER_REVIEW','REJECTED','reject','Bác bỏ','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('EXC','APPROVED','RESOLVED','resolve','Ghi nhận xử lý','EDIT',NULL,NULL,'{resolution_provided}','success',false,4),
  ('EXC','RESOLVED','CLOSED','close','Đóng ngoại lệ','APPROVE',NULL,NULL,'{}','default',false,5),
  -- MDC
  ('MDC','DRAFT','SUBMITTED','submit','Gửi duyệt','CREATE',NULL,'REQUESTER','{}','primary',false,1),
  ('MDC','SUBMITTED','APPROVED','approve','Phê duyệt & áp dụng','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('MDC','SUBMITTED','REJECTED','reject','Từ chối','APPROVE',NULL,'APPROVER','{}','danger',false,3),
  ('MDC','DRAFT','CANCELLED','cancel','Hủy','CREATE',NULL,NULL,'{}','danger',false,9),
  -- ACCESS_REVIEW
  ('ACCESS_REVIEW','DRAFT','SUBMITTED','submit','Gửi phê duyệt','CREATE',NULL,'REQUESTER','{has_lines}','primary',false,1),
  ('ACCESS_REVIEW','SUBMITTED','APPROVED','approve','Phê duyệt & thu hồi quyền','APPROVE',NULL,'APPROVER','{}','success',false,2),
  ('ACCESS_REVIEW','SUBMITTED','DRAFT','return','Trả lại','APPROVE',NULL,NULL,'{}','danger',false,3);

-- ============================================================
-- CHILD DOCUMENT RULES (document chain BM-09)
-- ============================================================
INSERT INTO doc_child_rules (parent_type, child_type, parent_statuses, label) VALUES
  ('PR','PO','{APPROVED,ORDERED}','Lập đơn mua hàng'),
  ('PO','GRN','{CONFIRMED,PARTIALLY_RECEIVED}','Lập phiếu nhập kho'),
  ('PO','SINV','{PARTIALLY_RECEIVED,RECEIVED}','Nhập hóa đơn NCC'),
  ('SINV','PMT','{POSTED,PARTIALLY_PAID}','Đề nghị thanh toán'),
  ('QUOT','SO','{ACCEPTED}','Tạo đơn bán hàng'),
  ('SO','DN','{CONFIRMED,PARTIALLY_SHIPPED}','Lập phiếu xuất giao hàng'),
  ('SO','INV','{PARTIALLY_SHIPPED,SHIPPED}','Xuất hóa đơn'),
  ('SO','WO','{CONFIRMED}','Lập lệnh sản xuất'),
  ('SO','TICKET','{CONFIRMED,PARTIALLY_SHIPPED,SHIPPED,INVOICED,CLOSED}','Tạo ticket CSKH'),
  ('INV','RCPT','{POSTED,PARTIALLY_PAID}','Lập phiếu thu'),
  ('PAYROLL','PMT','{POSTED}','Đề nghị chi lương'),
  ('ASSET','PMT','{IN_USE}','Thanh toán tài sản');

-- ============================================================
-- HANDOFF MAP (BM-04)
-- ============================================================
INSERT INTO handoff_map (flow_code, doc_type, trigger_status, to_role, expected_action, sla_hours) VALUES
  ('L1','BUDGET','SUBMITTED','CFO','Phê duyệt ngân sách',72),
  ('L3','PR','SUBMITTED','DEPT_HEAD','Phê duyệt đề nghị mua',24),
  ('L3','PR','APPROVED','BUYER','Lập đơn mua hàng',48),
  ('L3','PO','SUBMITTED','PROC_MANAGER','Phê duyệt PO',24),
  ('L3','PO','CONFIRMED','WH_STAFF','Nhận hàng & lập GRN',72),
  ('L4','GRN','DRAFT','QC_INSPECTOR','Kiểm tra chất lượng hàng nhập',8),
  ('L4','GRN','INSPECTED','WH_MANAGER','Nhập kho',8),
  ('L3','GRN','STORED','ACCOUNTANT','Nhập hóa đơn NCC & đối chiếu 3 chiều',48),
  ('L7','SINV','MATCHED','CHIEF_ACCOUNTANT','Ghi sổ công nợ phải trả',24),
  ('L7','SINV','ON_HOLD','CFO','Xử lý ngoại lệ lệch 3 chiều',24),
  ('L7','SINV','POSTED','ACCOUNTANT','Lập đề nghị thanh toán',72),
  ('L7','PMT','SUBMITTED','CFO','Phê duyệt chi',24),
  ('L7','PMT','APPROVED','TREASURER','Thực hiện chi tiền',8),
  ('L7','PMT','PAID','INTERNAL_AUDITOR','Hậu kiểm chứng từ chi',168),
  ('L2','QUOT','SUBMITTED','SALES_MANAGER','Phê duyệt báo giá',8),
  ('L2','SO','DRAFT','SALES_MANAGER','Xác nhận đơn bán',8),
  ('L2','SO','CONFIRMED','WH_STAFF','Soạn và giao hàng',48),
  ('L4','DN','PICKED','WH_MANAGER','Xuất kho giao hàng',8),
  ('L2','DN','SHIPPED','ACCOUNTANT','Xuất hóa đơn bán hàng',24),
  ('L7','INV','DRAFT','CHIEF_ACCOUNTANT','Phát hành hóa đơn',24),
  ('L7','INV','POSTED','ACCOUNTANT','Theo dõi thu tiền',720),
  ('L7','RCPT','DRAFT','TREASURER','Xác nhận thu tiền',8),
  ('L7','RCPT','RECEIVED','INTERNAL_AUDITOR','Hậu kiểm phiếu thu',168),
  ('L4','ST','SUBMITTED','WH_MANAGER','Phê duyệt chuyển kho',24),
  ('L4','ST','IN_TRANSIT','WH_STAFF','Nhận hàng tại kho đích',72),
  ('L4','ADJ','SUBMITTED','CHIEF_ACCOUNTANT','Phê duyệt chênh lệch kiểm kê',48),
  ('L4','ADJ','APPROVED','WH_MANAGER','Ghi nhận điều chỉnh kho',24),
  ('L5','WO','PLANNED','PROD_MANAGER','Phê duyệt lệnh sản xuất',24),
  ('L5','WO','RELEASED','WH_MANAGER','Xuất vật tư cho sản xuất',24),
  ('L5','WO','QC','QC_INSPECTOR','Kiểm tra thành phẩm',8),
  ('L6','HIRE','SUBMITTED','HR_MANAGER','Phê duyệt tuyển dụng',72),
  ('L6','HIRE','APPROVED','HR_STAFF','Tiếp nhận nhân sự mới',168),
  ('L6','PAYROLL','SUBMITTED','CFO','Phê duyệt bảng lương',48),
  ('L6','PAYROLL','APPROVED','ACCOUNTANT','Hạch toán lương',24),
  ('L6','PAYROLL','POSTED','ACCOUNTANT','Đề nghị chi lương',24),
  ('L7','JV','SUBMITTED','CHIEF_ACCOUNTANT','Ghi sổ bút toán',24),
  ('L7','BANKREC','MATCHED','CHIEF_ACCOUNTANT','Xác nhận đối chiếu ngân hàng',48),
  ('L8','ASSET','SUBMITTED','CFO','Phê duyệt mua sắm tài sản',72),
  ('L8','ASSET','APPROVED','ACCOUNTANT','Ghi tăng tài sản',72),
  ('L9','TICKET','ASSIGNED','CS_AGENT','Xử lý ticket',24),
  ('L9','TICKET','RESOLVED','CS_MANAGER','Xác nhận đóng ticket',24),
  ('L4','EXC','RAISED','CFO','Xem xét ngoại lệ',24),
  ('L10','MDC','SUBMITTED','CFO','Phê duyệt thay đổi dữ liệu chủ',48),
  ('L10','ACCESS_REVIEW','SUBMITTED','INTERNAL_AUDITOR','Phê duyệt rà soát quyền',72);

-- ============================================================
-- CHART OF ACCOUNTS (TT200 simplified)
-- ============================================================
INSERT INTO accounts (code, name, account_type, normal_balance) VALUES
  ('111','Tiền mặt','ASSET','D'),
  ('112','Tiền gửi ngân hàng','ASSET','D'),
  ('131','Phải thu khách hàng','ASSET','D'),
  ('152','Nguyên liệu, vật liệu','ASSET','D'),
  ('153','Công cụ, dụng cụ','ASSET','D'),
  ('154','Chi phí SXKD dở dang','ASSET','D'),
  ('155','Thành phẩm','ASSET','D'),
  ('156','Hàng hóa','ASSET','D'),
  ('211','Tài sản cố định hữu hình','ASSET','D'),
  ('214','Hao mòn tài sản cố định','ASSET','C'),
  ('331','Phải trả người bán','LIABILITY','C'),
  ('3335','Thuế thu nhập cá nhân','LIABILITY','C'),
  ('334','Phải trả người lao động','LIABILITY','C'),
  ('3383','Bảo hiểm xã hội','LIABILITY','C'),
  ('3388','Phải trả khác (hàng về chưa có hóa đơn)','LIABILITY','C'),
  ('411','Vốn đầu tư của chủ sở hữu','EQUITY','C'),
  ('421','Lợi nhuận sau thuế chưa phân phối','EQUITY','C'),
  ('511','Doanh thu bán hàng','REVENUE','C'),
  ('711','Thu nhập khác','REVENUE','C'),
  ('632','Giá vốn hàng bán','EXPENSE','D'),
  ('641','Chi phí bán hàng','EXPENSE','D'),
  ('642','Chi phí quản lý doanh nghiệp','EXPENSE','D'),
  ('811','Chi phí khác','EXPENSE','D');

-- ============================================================
-- KPI CATALOG (BM-10)
-- ============================================================
INSERT INTO kpi_catalog (code, name, category, formula, target_value, target_unit, direction, owner_department_code, flow_code) VALUES
  ('FIN-001','Doanh thu lũy kế','FINANCIAL','Σ Có TK 511',NULL,'VND','HIGHER','FIN','L7'),
  ('FIN-002','Biên lợi nhuận gộp','FINANCIAL','(511 − 632) / 511',25,'%','HIGHER','FIN','L7'),
  ('FIN-003','Số dư tiền gửi ngân hàng','FINANCIAL','Dư Nợ TK 112',NULL,'VND','HIGHER','FIN','L7'),
  ('FIN-004','Tỷ lệ sử dụng ngân sách','FINANCIAL','(Cam kết + Thực chi) / Kế hoạch',90,'%','LOWER','FIN','L1'),
  ('FIN-005','Công nợ phải thu','FINANCIAL','Dư Nợ TK 131',NULL,'VND','LOWER','FIN','L2'),
  ('OPS-001','Tỷ lệ khớp 3 chiều lần đầu','OPERATIONAL','Hóa đơn NCC khớp ngay / Tổng hóa đơn đối chiếu',95,'%','HIGHER','PROC','L3'),
  ('OPS-002','Thời gian duyệt PO trung bình','OPERATIONAL','avg(thời điểm duyệt − thời điểm tạo)',24,'giờ','LOWER','PROC','L3'),
  ('OPS-003','Tỷ lệ giao hàng đủ (Fill rate)','OPERATIONAL','SL đã giao / SL đặt của SO đã xác nhận',98,'%','HIGHER','WH','L4'),
  ('OPS-004','Tỷ lệ thành phẩm đạt (Yield)','OPERATIONAL','SL hoàn thành / SL kế hoạch',97,'%','HIGHER','PROD','L5'),
  ('CMP-001','Số lần vi phạm SoD bị chặn','COMPLIANCE','count(sod_check_log BLOCKED)',0,'lần','LOWER','IA','L4'),
  ('CMP-002','Ngoại lệ đang mở','COMPLIANCE','count(EXC chưa đóng)',0,'hồ sơ','LOWER','FIN','L4'),
  ('CMP-003','Bàn giao đúng SLA','COMPLIANCE','Bàn giao hoàn thành trước hạn / Tổng bàn giao hoàn thành',90,'%','HIGHER','IA','L4'),
  ('CUS-001','Ticket đúng SLA','CUSTOMER','Ticket giải quyết trước hạn / Tổng ticket đã giải quyết',95,'%','HIGHER','CS','L9'),
  ('CUS-002','CSAT trung bình','CUSTOMER','avg(điểm hài lòng 1–5)',4.5,'điểm','HIGHER','CS','L9');

-- ============================================================
-- DATA DICTIONARY (BM-07)
-- ============================================================
INSERT INTO data_dictionary (term, definition, data_type, domain, used_in) VALUES
  ('number','Số chứng từ, sinh tự động theo mẫu {PREFIX}-{YYYYMM}-{SEQ:5}','text','COMMON','{documents}'),
  ('status','Trạng thái chứng từ, chỉ thay đổi qua state machine (BM-05)','text','COMMON','{documents}'),
  ('quantity','Số lượng theo đơn vị tính của sản phẩm','numeric(18,4)','COMMON','{document_lines,stock_moves}'),
  ('unit_price','Đơn giá chưa thuế (VND)','numeric(18,2)','COMMON','{document_lines}'),
  ('amount','Thành tiền = quantity × unit_price, hoặc số tiền chứng từ','numeric(18,2)','COMMON','{documents,document_lines}'),
  ('cost_center_id','Bộ phận chịu chi phí / sở hữu ngân sách của chuỗi chứng từ','uuid','FINANCE','{documents}'),
  ('source_line_id','Dòng chứng từ gốc mà dòng này kế thừa (PO line → GRN line…)','uuid','COMMON','{document_lines}'),
  ('remaining_qty','Số lượng còn lại của lô nhập (FIFO)','numeric(18,4)','INVENTORY','{stock_moves}'),
  ('unit_cost','Giá vốn đơn vị của lô hàng','numeric(18,2)','INVENTORY','{stock_moves}'),
  ('sod_role','Vai trò SoD của hành động: REQUESTER/APPROVER/EXECUTOR/AUDITOR','text','CONTROLS','{document_actions,state_transitions}'),
  ('data_scope','Phạm vi dữ liệu: OWN < DEPARTMENT < BRANCH < COMPANY','text','CONTROLS','{permission_matrix}'),
  ('period','Kỳ kế toán YYYY-MM; trạng thái OPEN/SOFT_CLOSE/HARD_CLOSE','text','FINANCE','{fiscal_periods,gl_entries}'),
  ('three_way_match','Đối chiếu PO ↔ GRN ↔ Hóa đơn: SL lệch 0, đơn giá lệch ≤ 2%','rule','PROCUREMENT','{documents}'),
  ('sla_due_at','Hạn hoàn thành bàn giao/ticket theo SLA','timestamptz','PROCESS','{handoff_records,documents}');

-- ============================================================
-- ACCEPTANCE CRITERIA (BM-14)
-- ============================================================
INSERT INTO acceptance_criteria (test_code, test_group, title, related_flow, is_blocker) VALUES
  ('T1.1','N1_FUNCTIONAL','Tạo PO đầy đủ → DRAFT','L3',false),
  ('T1.2','N1_FUNCTIONAL','Submit PO → SUBMITTED, thông báo người duyệt','L3',false),
  ('T1.3','N1_FUNCTIONAL','Approve PO → APPROVED','L3',false),
  ('T1.4','N1_FUNCTIONAL','GRN từ PO, SL nhận ≤ SL đặt','L3',false),
  ('T1.5','N1_FUNCTIONAL','3-way match khớp','L3',false),
  ('T1.6','N1_FUNCTIONAL','3-way mismatch → tự tạo ngoại lệ','L3',false),
  ('T1.7','N1_FUNCTIONAL','SO kiểm tra tồn kho','L2',false),
  ('T1.8','N1_FUNCTIONAL','JV Nợ = Có, cập nhật sổ cái','L7',false),
  ('T1.9','N1_FUNCTIONAL','Khóa kỳ → chặn ghi sổ','L7',false),
  ('T1.10','N1_FUNCTIONAL','Tính lương gross/khấu trừ/net','L6',false),
  ('T1.11','N1_FUNCTIONAL','Chuyển kho: nguồn giảm, đích tăng','L4',false),
  ('T1.12','N1_FUNCTIONAL','Khấu hao tháng đúng','L8',false),
  ('T1.13','N1_FUNCTIONAL','Ticket tự phân công','L9',false),
  ('T1.14','N1_FUNCTIONAL','PO vượt ngân sách bị chặn','L1',false),
  ('T1.15','N1_FUNCTIONAL','Thay đổi dữ liệu chủ cần duyệt','L10',false),
  ('T2.1','N2_CONTROLS','Không có quyền → từ chối','L10',false),
  ('T2.2','N2_CONTROLS','Scope OWN chỉ thấy của mình','L10',false),
  ('T2.3','N2_CONTROLS','Scope DEPARTMENT','L10',false),
  ('T2.4','N2_CONTROLS','Scope BRANCH','L10',false),
  ('T2.5','N2_CONTROLS','Ẩn trường theo quyền','L10',false),
  ('T2.6','N2_CONTROLS','SoD khi duyệt','L4',false),
  ('T2.7','N2_CONTROLS','SoD khi thanh toán','L4',false),
  ('T2.8','N2_CONTROLS','Ngoại lệ cần người duyệt khác người nêu','L4',false),
  ('T2.9','N2_CONTROLS','Audit trail ghi before/after','L4',false),
  ('T2.10','N2_CONTROLS','Audit trail bất biến','L4',false),
  ('T2.11','N2_CONTROLS','Chuyển trạng thái sai bị từ chối','L3',false),
  ('T2.12','N2_CONTROLS','Optimistic locking','L3',false),
  ('T3.1','N3_TRACEABILITY','BLOCKER — không vừa tạo vừa duyệt cùng PO','L3',true),
  ('T3.2','N3_TRACEABILITY','BLOCKER — không vừa duyệt vừa thanh toán cùng PO','L3',true),
  ('T3.3','N3_TRACEABILITY','BLOCKER — không vừa tạo vừa thanh toán cùng PO','L3',true),
  ('T3.4','N3_TRACEABILITY','BLOCKER — log mọi attempt vi phạm SoD','L4',true),
  ('T3.5','N3_TRACEABILITY','Truy vết theo tiền','L11',false),
  ('T3.6','N3_TRACEABILITY','Truy vết theo hàng','L11',false),
  ('T3.7','N3_TRACEABILITY','Truy vết theo trách nhiệm','L11',false),
  ('T3.8','N3_TRACEABILITY','Không có chứng từ mồ côi','L11',false),
  ('T3.9','N3_TRACEABILITY','Mọi bàn giao liên phòng có bản ghi','L11',false),
  ('T3.10','N3_TRACEABILITY','Ngoại lệ liên kết chứng từ gốc','L4',false),
  ('T3.11','N3_TRACEABILITY','Mọi phê duyệt có thời điểm + người duyệt','L4',false),
  ('T3.12','N3_TRACEABILITY','Thay đổi từ điển dữ liệu được ghi vết','L10',false),
  ('T4.1','N4_END_TO_END','Procure-to-Pay','L3',false),
  ('T4.2','N4_END_TO_END','Order-to-Cash','L2',false),
  ('T4.3','N4_END_TO_END','Hire-to-Retire','L6',false),
  ('T4.4','N4_END_TO_END','Plan-to-Produce','L5',false),
  ('T4.5','N4_END_TO_END','Acquire-to-Dispose','L8',false),
  ('T4.6','N4_END_TO_END','Record-to-Report','L7',false),
  ('T4.7','N4_END_TO_END','Ticket-to-Resolution','L9',false),
  ('T4.8','N4_END_TO_END','Budget-to-Variance','L1',false),
  ('T4.9','N4_END_TO_END','Stock-Take','L4',false),
  ('T4.10','N4_END_TO_END','Bank-Reconciliation','L7',false),
  ('T4.11','N4_END_TO_END','Period-Close','L7',false),
  ('T4.12','N4_END_TO_END','Access-Review','L10',false),
  ('T5.4','N5_LOAD_EDGE','Duyệt đồng thời — chỉ một thành công','L3',false),
  ('T5.5','N5_LOAD_EDGE','Lỗi giữa giao dịch → rollback toàn bộ','L7',false),
  ('T5.6','N5_LOAD_EDGE','Chống gửi trùng (idempotency key)','L3',false),
  ('T5.8','N5_LOAD_EDGE','Timestamp lưu UTC','L11',false),
  ('T5.9','N5_LOAD_EDGE','Unicode tiếng Việt','L11',false);
