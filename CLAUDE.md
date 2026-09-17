# CLAUDE.md — ERP-General Universal ERP Project

> **Mục đích**: File hướng dẫn toàn diện để Claude Code đọc, hiểu và thực thi xây dựng hệ thống ERP phổ quát.
> **Phương pháp luận**: AI Simple Framework for Coding (6 layers, 15 principles)
> **Kế hoạch kinh doanh**: Kế hoạch ERP 8 điều kiện, 5 tầng, 7 giai đoạn, 11 luồng, 14 biểu mẫu, 63 test
> **Kỹ năng bổ trợ**: AutoSkills.sh (NestJS, Prisma, Vitest, Playwright, Better Auth, v.v.)

---

## MỤC LỤC

1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Kiến trúc AI Simple Framework](#2-kiến-trúc-ai-simple-framework)
3. [8 Điều kiện nghiệm thu (ĐK1–ĐK8)](#3-8-điều-kiện-nghiệm-thu)
4. [5 Nguyên tắc nền tảng](#4-5-nguyên-tắc-nền-tảng)
5. [Kiến trúc 5 tầng (L1–L5)](#5-kiến-trúc-5-tầng)
6. [Tech Stack & AutoSkills](#6-tech-stack--autoskills)
7. [Cấu trúc thư mục dự án](#7-cấu-trúc-thư-mục-dự-án)
8. [11 Luồng nghiệp vụ](#8-11-luồng-nghiệp-vụ)
9. [14 Biểu mẫu (BM-01 → BM-14)](#9-14-biểu-mẫu)
10. [Lộ trình 7 giai đoạn](#10-lộ-trình-7-giai-đoạn)
11. [63 Acceptance Tests](#11-63-acceptance-tests)
12. [3 Trace Paths](#12-3-trace-paths)
13. [Pre-commit Hooks & Enforcement](#13-pre-commit-hooks--enforcement)
14. [App-Map Pattern](#14-app-map-pattern)
15. [Security & Permission Model](#15-security--permission-model)
16. [Checklist tổng hợp cho Claude Code](#16-checklist-tổng-hợp)

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1 Mô tả
ERP-General là hệ thống ERP phổ quát cho mục đích giáo dục, có thể kiểm tra toàn bộ luồng hoạt động của một doanh nghiệp bất kỳ. Hệ thống bao phủ 11 luồng nghiệp vụ từ lập kế hoạch/ngân sách đến báo cáo phân tích.

### 1.2 Quy tắc làm việc
- **Mỗi thay đổi file → commit ngay lập tức** — không để bước commit riêng ở cuối
- **Risk tier**: HIGH (hệ thống tài chính, phân quyền, kiểm soát nội bộ)
- **Ngôn ngữ code**: English | **Ngôn ngữ tài liệu**: Vietnamese
- **Mỗi PR**: phải map được tới ít nhất 1 acceptance test (T1.x–T5.x)

### 1.3 Forbidden Patterns
```
FORBIDDEN:
- Bypass separation of duties (ĐK3)
- Hard-code role/permission — phải dùng RBAC engine
- Skip state machine validation trên document transitions
- Xóa hoặc sửa audit trail đã ghi
- Shadow-IT: dùng Excel/Google Sheet thay module ERP (ĐK7)
- Commit code không có test cho critical path
- Deploy không qua acceptance test T3.1–T3.4 (absolute blocker)
```

---

## 2. KIẾN TRÚC AI SIMPLE FRAMEWORK

### 2.1 Sáu tầng (Six Layers)

| Layer | Tên | Mục đích | Áp dụng ERP |
|-------|-----|----------|-------------|
| L1 | **Core** | Foundation — CLAUDE.md, app-map, routing | File này + docs/app-map/ |
| L2 | **Scale** | Enforcement — pre-commit, CI gates | Hooks chặn code thiếu test/doc |
| L3 | **Ops** | Operations — monitoring, health checks | ERP audit trail, system monitoring |
| L4 | **Optimization** | Learning — memory as feedback | Pattern learning từ exception register |
| L5 | **Collaboration** | Multi-agent — parallel sessions | Parallel dev cho 11 business flows |
| L6 | **Security** | Security gate — secret scanning | Permission model, data access control |

### 2.2 Mười lăm nguyên tắc (15 Principles)

#### P1: Hierarchical Context (Ngữ cảnh phân cấp)
```
CLAUDE.md (root)
├── packages/api/CLAUDE.md        → Backend context
├── packages/web/CLAUDE.md        → Frontend context  
├── packages/shared/CLAUDE.md     → Shared types/utils
└── docs/CLAUDE.md                → Documentation context
```
- Mỗi package/module có CLAUDE.md riêng kế thừa từ root
- Claude Code đọc từ root → deep vào module đang làm việc

#### P2: App-Map Pattern
- Mỗi module/feature có file mô tả trong `docs/app-map/`
- Format: `NNN-module-name.md` (đánh số thứ tự)
- Headers bắt buộc: `covers`, `last_verified`, `ttl_days`
- Chi tiết xem [Mục 14](#14-app-map-pattern)

#### P3: Context Routing
```yaml
routing_rules:
  - pattern: "packages/api/**"
    context: ["packages/api/CLAUDE.md", "docs/app-map/001-api-overview.md"]
  - pattern: "packages/web/**"
    context: ["packages/web/CLAUDE.md", "docs/app-map/002-web-overview.md"]
  - pattern: "**/*.test.*"
    context: ["docs/testing-strategy.md"]
  - pattern: "**/migrations/**"
    context: ["docs/app-map/003-database-schema.md"]
```

#### P4: Doc-Test Sync
- Mỗi thay đổi API → cập nhật doc tương ứng
- Test phải reference doc section nó verify
- CI check: doc coverage ≥ 80%

#### P5: LOGIC vs REQUEST
```
LOGIC (code tự quyết):
- Schema validation
- State machine transitions
- Audit trail generation
- Permission checking

REQUEST (cần user/admin confirm):
- Override separation of duties
- Exception approval
- Master data changes
- Go-live decisions
```

#### P6: Pre-flight Checklist
Trước mỗi commit, kiểm tra:
- [ ] Code có test không?
- [ ] Doc đã cập nhật chưa?
- [ ] State machine transition hợp lệ?
- [ ] Separation of duties không bị vi phạm?
- [ ] Audit trail được ghi?
- [ ] Permission model đúng?

#### P7: Memory as Feedback
- Mỗi exception/bug → ghi vào exception register (BM-11)
- Pattern lặp lại → tạo rule mới trong validation
- Lessons learned → cập nhật CLAUDE.md

#### P8: Automated Enforcement
- Pre-commit hooks chặn violations
- CI pipeline check toàn bộ 63 acceptance tests
- Automated audit trail verification

#### P9: Generated vs Authored Docs
```
GENERATED (tự động):
- API docs từ code (OpenAPI/Swagger)
- Database schema docs từ migrations
- Test coverage reports
- Audit trail reports

AUTHORED (viết tay):
- Business flow descriptions
- Architecture decisions (ADR)
- User guides
- This CLAUDE.md
```

#### P10: Cross-repo Contracts
- Shared types giữa API và Web qua `packages/shared`
- Contract testing giữa services
- API versioning strategy

#### P11: Ops Layer
- Health check endpoints cho mỗi service
- Structured logging (JSON format)
- Metrics collection (response time, error rate)
- Alert rules cho critical business flows

#### P12: Self-Optimization
- Performance benchmarks cho mỗi luồng nghiệp vụ
- Query optimization tracking
- Bundle size monitoring (frontend)

#### P13: Parallel Sessions
- 11 luồng nghiệp vụ có thể dev song song
- Shared foundation (L1) phải hoàn thành trước
- Interface contracts định nghĩa trước khi parallel

#### P14: Security Gate
- Secret scanning trong pre-commit
- Dependency vulnerability check
- SQL injection prevention (Prisma parameterized queries)
- XSS prevention (React auto-escaping + DOMPurify)

#### P15: CLAUDE.md as Single Source of Truth
- Mọi quyết định kiến trúc ghi trong CLAUDE.md hoặc ADR
- Conflict resolution: CLAUDE.md wins over comments in code

---

## 3. 8 ĐIỀU KIỆN NGHIỆM THU (ĐK1–ĐK8)

Mỗi module/feature PHẢI đáp ứng tất cả 8 điều kiện trước khi merge.

### ĐK1: Quyền sở hữu (Ownership)
```
Kiểm tra:
- Mỗi nghiệp vụ có đúng 1 owner trong BM-02
- Không có nghiệp vụ nào thiếu owner
- Owner có quyền phê duyệt thay đổi trên module mình

Implementation:
- Table: business_process_owners (process_id, owner_user_id, effective_from, effective_to)
- API: GET /api/ownership/matrix → trả về BM-02
- Validation: mỗi transaction phải có process owner khác null
```

### ĐK2: Bàn giao (Handoff)
```
Kiểm tra:
- Mỗi chuyển giao giữa 2 bộ phận có bản ghi rõ ràng
- Handoff map (BM-04) đầy đủ cho tất cả 11 luồng
- Timestamp + người bàn giao + người nhận

Implementation:
- Table: handoff_records (id, from_dept, to_dept, from_user, to_user, document_id, timestamp, status)
- State: INITIATED → ACKNOWLEDGED → COMPLETED
- Trigger: auto-create handoff record khi document chuyển trạng thái cross-department
```

### ĐK3: Tách biệt nhiệm vụ (Separation of Duties) ⚠️ CRITICAL
```
Kiểm tra:
- 4 vai trò tài chính KHÔNG được trùng: Người đề xuất ≠ Người phê duyệt ≠ Người thực hiện ≠ Người kiểm tra
- Ma trận SoD (BM-06) enforce ở mức database
- Violation = ABSOLUTE BLOCKER cho go-live

Implementation:
- Table: sod_matrix (role_pair, conflict_type, severity)
- Middleware: checkSeparationOfDuties(userId, action, documentId)
- 4 roles: REQUESTER, APPROVER, EXECUTOR, AUDITOR
- Rule: same user CANNOT hold >1 role on same transaction
- Test T3.1–T3.4: PHẢI PASS 100%, không có exception
```

### ĐK4: Truy vết (Traceability)
```
Kiểm tra:
- Mỗi thay đổi có audit trail
- 3 trace paths: theo tiền, theo hàng, theo trách nhiệm
- Không có "lỗ hổng" trong chuỗi chứng từ

Implementation:
- Table: audit_trail (id, entity_type, entity_id, action, old_value, new_value, user_id, timestamp, ip_address)
- Immutable: INSERT only, no UPDATE/DELETE
- Index: entity_type + entity_id + timestamp
- API: GET /api/trace/{type}/{id} → full history
```

### ĐK5: Xử lý ngoại lệ (Exception Handling)
```
Kiểm tra:
- Mọi ngoại lệ có quy trình xử lý
- Exception register (BM-11) ghi nhận đầy đủ
- Ngoại lệ KHÔNG bypass được SoD

Implementation:
- Table: exceptions (id, type, description, raised_by, approved_by, resolution, status, created_at)
- Workflow: RAISED → REVIEWED → APPROVED/REJECTED → RESOLVED
- Constraint: approved_by ≠ raised_by (SoD applies to exceptions too)
```

### ĐK6: Định nghĩa thống nhất (Unified Definitions)
```
Kiểm tra:
- Data dictionary (BM-07) cover 100% fields
- Không có 2 module dùng khác nghĩa cho cùng 1 term
- Master data catalog (BM-08) đầy đủ

Implementation:
- File: docs/data-dictionary.yaml (single source of truth)
- Codegen: generate TypeScript types từ data dictionary
- Validation: CI check — mọi DB column phải có entry trong dictionary
```

### ĐK7: Không Shadow-IT
```
Kiểm tra:
- Shadow-IT register (BM-13) = empty hoặc có kế hoạch migrate
- Không dùng Excel/Google Sheet cho business process
- Mọi data flow đi qua ERP

Implementation:
- Checklist trong CI: scan for external data sources
- API integration layer cho legacy systems
- Migration path cho mỗi shadow-IT item
```

### ĐK8: Phân quyền theo vai trò và phạm vi dữ liệu
```
Kiểm tra:
- Permission = Role × Data Scope × Field Level
- 3-tier permission matrix (BM-12) enforce đầy đủ
- Không có user nào có quyền "god mode"

Implementation:
- Table: permissions (role_id, resource, action, data_scope, field_restrictions)
- data_scope: OWN | DEPARTMENT | BRANCH | COMPANY
- field_restrictions: JSON array of visible/editable fields
- Middleware: enforcePermission(user, resource, action, dataScope)
```

---

## 4. 5 NGUYÊN TẮC NỀN TẢNG

### NT1: Một nghiệp vụ — Một chủ sở hữu
- Mỗi business process có exactly 1 owner
- Owner chịu trách nhiệm end-to-end
- Ownership matrix (BM-02) là tài liệu sống

### NT2: Chứng từ là sự thật (Documents as Truth)
- Mọi giao dịch phải có chứng từ gốc
- Document chain (BM-09): PO → GRN → Invoice → Payment
- Không có giao dịch "miệng" — must be recorded

### NT3: Trạng thái là hợp đồng (State as Contract)
- State machine cho mỗi document type
- Transition rules enforce bởi code, không phải convention
- Invalid transition = hard error, không phải warning

### NT4: Ngoại lệ là nhánh quy trình (Exceptions as Process Branches)
- Exception ≠ bypass
- Mỗi exception type có workflow riêng
- Tất cả exceptions vẫn tuân thủ SoD

### NT5: Quyền = Vai trò × Phạm vi dữ liệu × Trường
```typescript
type Permission = {
  role: Role;              // WHO can do
  dataScope: DataScope;    // WHICH records
  fieldAccess: FieldAccess; // WHICH fields
  action: Action;          // WHAT action
};

// Example:
// Kế toán chi nhánh HCM có thể XEM tất cả invoices của chi nhánh HCM
// nhưng chỉ EDIT invoices mình tạo
{
  role: "ACCOUNTANT",
  dataScope: { type: "BRANCH", value: "HCM" },
  fieldAccess: { view: ["*"], edit: ["amount", "description", "attachments"] },
  action: ["VIEW", "EDIT_OWN"]
}
```

---

## 5. KIẾN TRÚC 5 TẦNG (L1–L5)

```
L5: Analytics & Reporting     ← KPI, dashboards, trace paths
L4: Controls & Compliance     ← SoD, audit trail, exception handling  
L3: Process & Workflow        ← State machines, handoff, approval flows
L2: Transactions              ← Business documents, CRUD operations
L1: Foundation Data           ← Master data, org structure, permissions
```

### Quy tắc phụ thuộc (STRICT):
- Tầng trên chỉ gọi tầng dưới, KHÔNG BAO GIỜ ngược lại
- L1 phải hoàn thành trước khi bắt đầu L2
- L4 (Controls) phải được tích hợp vào MỌI tầng L2-L3

### L1: Foundation Data
```
Modules:
├── org-structure/        → Cơ cấu tổ chức, phòng ban, chi nhánh
├── master-data/          → Khách hàng, nhà cung cấp, sản phẩm, kho
├── user-management/      → Users, roles, permissions (BM-01, BM-12)
├── data-dictionary/      → Unified definitions (BM-07, BM-08)
└── system-config/        → Parameters, sequences, fiscal calendar

Database tables:
- organizations, departments, branches
- users, roles, permissions, user_roles
- customers, suppliers, products, warehouses
- data_dictionary_entries, master_data_catalog
- system_parameters, fiscal_periods
```

### L2: Transactions
```
Modules:
├── sales/                → Quotation → SO → Delivery → Invoice
├── procurement/          → PR → PO → GRN → Invoice → Payment
├── inventory/            → Receipt, Issue, Transfer, Adjustment
├── production/           → BOM → Work Order → Production → QC
├── hr-payroll/           → Attendance → Payroll → Payment
├── finance/              → JV, AR, AP, GL, Bank Reconciliation
└── assets/               → Acquisition → Depreciation → Disposal

Key patterns:
- 3-way matching (Procurement): PO ↔ GRN ↔ Invoice
- Document chain: mỗi document link tới source document
- Auto-numbering: {PREFIX}-{YYYY}{MM}-{SEQ:5}
```

### L3: Process & Workflow
```
Modules:
├── state-machine/        → Document state transitions (BM-05)
├── approval-flow/        → Multi-level approval engine
├── handoff/              → Cross-department handoff tracking (BM-04)
├── notification/         → Email, in-app notifications
└── escalation/           → Auto-escalate overdue items

State Machine template:
  DRAFT → SUBMITTED → APPROVED → IN_PROGRESS → COMPLETED → CLOSED
  Any state → CANCELLED (with reason + approval)
  REJECTED can → DRAFT (revision)
```

### L4: Controls & Compliance
```
Modules:
├── separation-of-duties/ → SoD matrix enforcement (BM-06)
├── audit-trail/          → Immutable change log (ĐK4)
├── exception-handler/    → Exception workflow (BM-11)
├── document-chain/       → Traceability verification (BM-09)
└── compliance-check/     → Pre-transaction validation

Critical rules:
- SoD check runs BEFORE every financial transaction
- Audit trail writes are IMMUTABLE (append-only table, no triggers to modify)
- Exception approval requires different person than raiser
```

### L5: Analytics & Reporting
```
Modules:
├── kpi-engine/           → KPI catalog computation (BM-10)
├── dashboards/           → Real-time business dashboards
├── trace-paths/          → 3 trace paths: money, goods, responsibility
├── reports/              → Standard reports per business flow
└── data-export/          → CSV, Excel, PDF export

KPI categories:
- Financial: Revenue, Cost, Margin, Cash Flow
- Operational: Lead Time, Fill Rate, Inventory Turnover
- Compliance: SoD Violations, Exception Rate, Audit Score
```

---

## 6. TECH STACK & AUTOSKILLS

### 6.1 Stack chính

| Layer | Technology | AutoSkill | Lý do |
|-------|-----------|-----------|-------|
| **Runtime** | Node.js 20+ | — | LTS, ecosystem |
| **Backend Framework** | NestJS | `nestjs` | Modular, DI, guards, interceptors → phù hợp enterprise |
| **ORM** | Prisma | `prisma` | Type-safe, migrations, audit hooks |
| **Database** | PostgreSQL 16 | `neon-postgres` hoặc self-hosted | ACID, JSON, full-text search |
| **Frontend** | Next.js 14+ (App Router) | `nextjs` | SSR, RSC, API routes |
| **UI Components** | shadcn/ui + Tailwind | `tailwindcss` | Customizable, accessible |
| **Auth** | Better Auth | `better-auth` | Organization, 2FA, RBAC built-in |
| **Unit Test** | Vitest | `vitest` | Fast, ESM native, compatible Jest API |
| **E2E Test** | Playwright | `playwright` | Cross-browser, reliable selectors |
| **API Docs** | Swagger/OpenAPI | — | NestJS integration |
| **Deployment** | Docker + Vercel/Railway | `vercel`, `docker` | Containerized, scalable |
| **CI/CD** | GitHub Actions | — | Pre-commit hooks + CI pipeline |
| **Background Jobs** | BullMQ (Redis) | — | Queue cho async operations |

### 6.2 AutoSkills áp dụng

```yaml
# Database & ORM
- prisma:           Schema design, migrations, seeding, audit middleware
- neon-postgres:    Serverless PostgreSQL (dev/staging), hoặc self-hosted cho production

# Backend
- nestjs:           Module structure, guards (SoD), interceptors (audit), pipes (validation)

# Frontend  
- nextjs:           App router, server actions, middleware (auth)
- tailwindcss:      Utility-first styling
- react-hook-form:  Form management cho 14 biểu mẫu

# Auth & Security
- better-auth:      Authentication, organization management, 2FA, RBAC
                     → organization plugin cho multi-branch
                     → twoFactor plugin cho financial operations

# Testing
- vitest:           Unit tests cho business logic, SoD checks, state machines
- playwright:       E2E tests cho 63 acceptance tests
                     → test traces cho debugging
                     → visual comparison cho reports

# Deployment
- vercel:           Frontend deployment
- docker:           Backend containerization

# Supplementary
- zod:              Runtime validation schemas (shared between FE/BE)
- typescript:       Strict mode, shared types
```

### 6.3 Cài đặt cơ bản
```bash
# Khởi tạo monorepo
npx create-turbo@latest erp-general
cd erp-general

# Backend (NestJS)
cd packages
nest new api --strict --skip-git
cd api && npm install prisma @prisma/client
npx prisma init

# Frontend (Next.js)  
cd ../
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir

# Shared types
mkdir shared && cd shared && npm init -y
# Add typescript, zod

# Auth
npm install better-auth  # in api package

# Testing
npm install -D vitest @vitest/coverage-v8  # in each package
npm install -D @playwright/test            # in root for E2E

# AI Simple Framework
npx ai-simple init
```

---

## 7. CẤU TRÚC THƯ MỤC DỰ ÁN

```
ERP-general/
├── CLAUDE.md                          ← FILE NÀY (root context)
├── .claude/
│   └── settings.json                  ← Claude Code settings
├── docs/
│   ├── app-map/                       ← App-Map Pattern (P2)
│   │   ├── 001-system-overview.md
│   │   ├── 002-api-architecture.md
│   │   ├── 003-database-schema.md
│   │   ├── 004-auth-permission.md
│   │   ├── 005-state-machines.md
│   │   ├── 010-sales-flow.md
│   │   ├── 011-procurement-flow.md
│   │   ├── 012-inventory-flow.md
│   │   ├── 013-production-flow.md
│   │   ├── 014-hr-payroll-flow.md
│   │   ├── 015-finance-flow.md
│   │   ├── 016-assets-flow.md
│   │   ├── 017-customer-service-flow.md
│   │   ├── 018-planning-budget-flow.md
│   │   ├── 019-system-admin-flow.md
│   │   └── 020-reporting-flow.md
│   ├── adr/                           ← Architecture Decision Records
│   ├── data-dictionary.yaml           ← Unified definitions (BM-07)
│   ├── testing-strategy.md
│   └── deployment.md
├── packages/
│   ├── api/                           ← NestJS Backend
│   │   ├── CLAUDE.md                  ← Backend context
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── foundation/        ← L1: org, user, master-data
│   │   │   │   ├── transactions/      ← L2: sales, procurement, etc.
│   │   │   │   ├── workflow/          ← L3: state-machine, approval
│   │   │   │   ├── controls/         ← L4: sod, audit, exception
│   │   │   │   └── analytics/        ← L5: kpi, reports, traces
│   │   │   ├── common/
│   │   │   │   ├── guards/            ← Auth, SoD, Permission guards
│   │   │   │   ├── interceptors/      ← Audit trail interceptor
│   │   │   │   ├── pipes/             ← Validation pipes
│   │   │   │   └── filters/           ← Exception filters
│   │   │   └── config/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── test/
│   ├── web/                           ← Next.js Frontend
│   │   ├── CLAUDE.md                  ← Frontend context
│   │   ├── src/
│   │   │   ├── app/                   ← App Router pages
│   │   │   ├── components/
│   │   │   │   ├── forms/             ← 14 biểu mẫu components
│   │   │   │   ├── layout/
│   │   │   │   └── shared/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   └── test/
│   └── shared/                        ← Shared types & utils
│       ├── CLAUDE.md
│       ├── src/
│       │   ├── types/                 ← Shared TypeScript types
│       │   ├── constants/             ← Business constants
│       │   ├── validators/            ← Zod schemas
│       │   └── state-machines/        ← State machine definitions
│       └── package.json
├── e2e/                               ← Playwright E2E tests
│   ├── tests/
│   │   ├── functional/                ← N1: 15 functional tests
│   │   ├── controls/                  ← N2: 12 control tests
│   │   ├── traceability/              ← N3: 12 traceability tests
│   │   ├── end-to-end/                ← N4: 12 end-to-end tests
│   │   └── load-edge/                 ← N5: 12 load/edge tests
│   └── playwright.config.ts
├── scripts/
│   ├── pre-commit.sh                  ← Pre-commit hook
│   ├── seed-data.ts
│   └── generate-docs.ts
├── .husky/
│   └── pre-commit                     ← Husky hook → scripts/pre-commit.sh
├── turbo.json
├── package.json
└── docker-compose.yml
```

---

## 8. 11 LUỒNG NGHIỆP VỤ

### L1: Lập kế hoạch & Ngân sách (Planning & Budget)
```
Flow: Annual Plan → Budget Allocation → Budget Approval → Monitoring → Variance Analysis
State: DRAFT → SUBMITTED → APPROVED → ACTIVE → CLOSED
Owner: CFO / Finance Director
Documents: Budget Request, Budget Plan, Variance Report
KPIs: Budget Accuracy (±5%), Approval Cycle Time (<5 days)
Handoff: Finance → All Departments (budget distribution)
```

### L2: Bán hàng (Sales)
```
Flow: Lead → Quotation → Sales Order → Delivery → Invoice → Collection
State Machine:
  Quotation: DRAFT → SENT → ACCEPTED/REJECTED → EXPIRED
  Sales Order: DRAFT → CONFIRMED → PARTIALLY_SHIPPED → SHIPPED → INVOICED → CLOSED
  Invoice: DRAFT → SENT → PARTIALLY_PAID → PAID → OVERDUE
Owner: Sales Director
Documents: Quotation, SO, Delivery Note, Invoice, Receipt
KPIs: Conversion Rate, Average Order Value, DSO (Days Sales Outstanding)
Handoff: Sales → Warehouse (delivery), Sales → Finance (invoicing)
3-way check: SO ↔ Delivery Note ↔ Invoice
```

### L3: Mua hàng (Procurement)
```
Flow: Purchase Requisition → RFQ → Purchase Order → Goods Receipt → Invoice Matching → Payment
State Machine:
  PR: DRAFT → SUBMITTED → APPROVED → ORDERED → CLOSED
  PO: DRAFT → SENT → CONFIRMED → PARTIALLY_RECEIVED → RECEIVED → INVOICED → PAID
  GRN: DRAFT → INSPECTED → ACCEPTED/REJECTED → STORED
Owner: Procurement Director
Documents: PR, RFQ, PO, GRN, Supplier Invoice, Payment Voucher
KPIs: PO Cycle Time, Supplier On-Time Delivery, 3-Way Match Rate
Handoff: Requester → Procurement (PR), Procurement → Warehouse (GRN), Procurement → Finance (payment)

⚠️ 3-Way Matching (CRITICAL):
  PO.quantity ↔ GRN.received_quantity ↔ Invoice.billed_quantity
  PO.unit_price ↔ Invoice.unit_price
  Tolerance: ±2% on amount, ±0 on quantity
  Mismatch → Exception workflow (BM-11)
```

### L4: Kho (Warehouse/Inventory)
```
Flow: Goods Receipt → Put Away → Storage → Pick → Pack → Ship
Sub-flows:
  - Stock Transfer: Source WH → Transit → Destination WH
  - Stock Adjustment: Count → Variance → Approval → Adjust
  - Stock Take: Schedule → Count → Reconcile → Approve
State Machine:
  Transfer: REQUESTED → APPROVED → PICKED → IN_TRANSIT → RECEIVED → STORED
Owner: Warehouse Manager
Documents: GRN, Stock Transfer, Adjustment Voucher, Delivery Note
KPIs: Inventory Accuracy (>98%), Fill Rate, Turnover Ratio
Handoff: Procurement → Warehouse (receipt), Warehouse → Sales (delivery)
```

### L5: Sản xuất (Production)
```
Flow: Production Plan → BOM → Work Order → Material Issue → Production → QC → Finished Goods
State Machine:
  Work Order: PLANNED → MATERIAL_READY → IN_PRODUCTION → QC → COMPLETED → CLOSED
Owner: Production Director
Documents: BOM, Work Order, Material Issue, QC Report, Production Report
KPIs: OEE, Yield Rate, Scrap Rate, Production Lead Time
Handoff: Planning → Production (WO), Warehouse → Production (materials), Production → Warehouse (FG)
```

### L6: Nhân sự & Tiền lương (HR & Payroll)
```
Flow: Recruitment → Onboarding → Attendance → Leave → Payroll → Payment
Sub-flows:
  - Performance: Goal Setting → Review → Appraisal
  - Training: Need Analysis → Plan → Execution → Evaluation
State Machine:
  Payroll: CALCULATED → REVIEWED → APPROVED → PAID → POSTED
Owner: HR Director
Documents: Employment Contract, Timesheet, Payslip, Tax Declaration
KPIs: Turnover Rate, Absenteeism, Training Hours, Payroll Accuracy
Handoff: HR → Finance (payroll posting), HR → IT (account provisioning)
```

### L7: Tài chính & Kế toán (Finance & Accounting)
```
Flow: Journal Entry → GL Posting → Period Close → Financial Statements
Sub-flows:
  - AR: Invoice → Collection → Reconciliation
  - AP: Bill → Payment → Reconciliation
  - Bank: Statement Import → Matching → Reconciliation
  - Tax: Calculation → Declaration → Payment
State Machine:
  Period: OPEN → SOFT_CLOSE → HARD_CLOSE → ARCHIVED
  Journal: DRAFT → POSTED → REVERSED
Owner: CFO / Chief Accountant
Documents: Journal Voucher, Bank Statement, Tax Return, Financial Statements
KPIs: Close Cycle Time, Reconciliation Rate, Tax Compliance Rate
Handoff: All Departments → Finance (transaction posting)

⚠️ Separation of Duties (4 roles MUST be different people):
  1. REQUESTER: tạo phiếu đề nghị
  2. APPROVER: phê duyệt
  3. EXECUTOR: thực hiện thanh toán
  4. AUDITOR: kiểm tra sau
```

### L8: Tài sản (Assets)
```
Flow: Request → Approval → Acquisition → Registration → Depreciation → Disposal
State Machine:
  Asset: REQUESTED → APPROVED → ACQUIRED → IN_USE → UNDER_MAINTENANCE → DISPOSED
Owner: Finance / Asset Manager
Documents: Asset Request, PO, Asset Card, Depreciation Schedule, Disposal Report
KPIs: Asset Utilization, Maintenance Cost Ratio, Depreciation Accuracy
Handoff: Requester → Procurement (acquisition), Finance → Department (assignment)
```

### L9: Dịch vụ khách hàng (Customer Service)
```
Flow: Ticket → Classification → Assignment → Resolution → Feedback
State Machine:
  Ticket: OPEN → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → RESOLVED → CLOSED
  SLA: ON_TIME → AT_RISK → BREACHED
Owner: Customer Service Director
Documents: Ticket, SLA Report, Customer Feedback
KPIs: First Response Time, Resolution Time, CSAT, SLA Compliance
Handoff: Customer → CS (ticket), CS → Technical (escalation), CS → Sales (upsell)
```

### L10: Quản trị hệ thống (System Admin)
```
Flow: User Management → Role Assignment → Permission Config → Monitoring → Backup
Sub-flows:
  - Access Review: Schedule → Review → Approve/Revoke → Document
  - Change Management: Request → Impact Analysis → Approval → Implementation → Verification
Owner: IT Director / System Admin
Documents: User Directory (BM-01), Permission Matrix (BM-12), Change Log
KPIs: System Uptime (>99.5%), Security Incident Rate, Backup Success Rate
```

### L11: Báo cáo & Phân tích (Reporting & Analytics)
```
Flow: Data Collection → Aggregation → Analysis → Report Generation → Distribution
Report types:
  - Operational: Daily/Weekly per department
  - Management: Monthly summary, KPI dashboard
  - Compliance: Audit trail, SoD report, Exception report
  - Financial: P&L, Balance Sheet, Cash Flow
  - Custom: Ad-hoc queries, data export
Owner: Each department (operational), Finance (financial), IT (system)
KPIs: Report Accuracy, Timeliness, Data Freshness
3 Trace Paths implemented here:
  - Trace by Money: Payment → Invoice → PO → PR → Budget
  - Trace by Goods: Delivery → Stock → GRN → PO → PR
  - Trace by Responsibility: Action → User → Role → Department → Owner
```

---

## 9. 14 BIỂU MẪU (BM-01 → BM-14)

### Thứ tự triển khai (STRICT):
```
Phase 1: BM-01 → BM-02           (Foundation: users + ownership)
Phase 2: BM-07, BM-08            (Definitions: data dictionary + master data)
Phase 3: BM-04, BM-05            (Process: handoff map + state machines)
Phase 4: BM-06, BM-11, BM-12     (Controls: SoD + exceptions + permissions)
Phase 5: BM-09, BM-10            (Traceability: document chain + KPIs)
Phase 6: BM-13                   (Cleanup: shadow-IT register)
Phase 7: BM-03, BM-14            (Validation: impact matrix + acceptance criteria)
```

### BM-01: Danh bạ người dùng (User Directory)
```yaml
table: users
fields:
  - id: UUID PK
  - employee_code: VARCHAR UNIQUE NOT NULL
  - full_name: VARCHAR NOT NULL
  - email: VARCHAR UNIQUE NOT NULL
  - department_id: FK → departments
  - branch_id: FK → branches
  - position: VARCHAR
  - roles: JSONB  # array of role codes
  - status: ENUM(ACTIVE, INACTIVE, SUSPENDED)
  - created_at, updated_at: TIMESTAMP
api:
  - GET /api/users (list, filter by department/branch/status)
  - GET /api/users/:id
  - POST /api/users (admin only)
  - PATCH /api/users/:id (admin only)
ui:
  - DataTable with search, filter, pagination
  - Form: create/edit user with role assignment
  - Bulk import from CSV
```

### BM-02: Ma trận sở hữu (Ownership Matrix)
```yaml
table: ownership_matrix
fields:
  - id: UUID PK
  - business_process: VARCHAR NOT NULL  # e.g., "SALES", "PROCUREMENT"
  - sub_process: VARCHAR               # e.g., "QUOTATION", "PO_CREATION"
  - owner_user_id: FK → users NOT NULL
  - deputy_user_id: FK → users         # backup owner
  - department_id: FK → departments
  - effective_from: DATE NOT NULL
  - effective_to: DATE                  # null = current
  - notes: TEXT
constraint:
  - UNIQUE(business_process, sub_process, effective_from)
  - owner_user_id ≠ deputy_user_id
api:
  - GET /api/ownership-matrix
  - PUT /api/ownership-matrix/:id (admin only)
```

### BM-03: Ma trận tác động (Impact Matrix)
```yaml
table: impact_matrix
fields:
  - id: UUID PK
  - change_type: ENUM(PROCESS, DATA, SYSTEM, ORGANIZATION)
  - description: TEXT NOT NULL
  - affected_departments: JSONB  # array of dept IDs
  - affected_flows: JSONB        # array of flow codes (L1–L11)
  - severity: ENUM(LOW, MEDIUM, HIGH, CRITICAL)
  - mitigation_plan: TEXT
  - status: ENUM(IDENTIFIED, ASSESSED, MITIGATED, ACCEPTED)
  - assessed_by: FK → users
  - assessed_at: TIMESTAMP
```

### BM-04: Bản đồ bàn giao (Handoff Map)
```yaml
table: handoff_map
fields:
  - id: UUID PK
  - flow_code: VARCHAR NOT NULL           # L1–L11
  - from_department_id: FK → departments
  - to_department_id: FK → departments
  - trigger_event: VARCHAR NOT NULL       # what causes the handoff
  - document_type: VARCHAR NOT NULL       # which document is handed off
  - expected_sla_hours: INT
  - required_fields: JSONB               # fields that must be filled
  - validation_rules: JSONB              # business rules to check
  - status: ENUM(ACTIVE, DEPRECATED)
runtime_table: handoff_records
fields:
  - id: UUID PK
  - handoff_map_id: FK → handoff_map
  - document_id: UUID NOT NULL            # the actual document being handed off
  - document_type: VARCHAR
  - from_user_id: FK → users
  - to_user_id: FK → users
  - initiated_at: TIMESTAMP
  - acknowledged_at: TIMESTAMP
  - completed_at: TIMESTAMP
  - status: ENUM(INITIATED, ACKNOWLEDGED, COMPLETED, REJECTED, ESCALATED)
  - sla_status: ENUM(ON_TIME, AT_RISK, BREACHED)
  - notes: TEXT
```

### BM-05: Máy trạng thái (State Machine Definitions)
```yaml
table: state_machine_definitions
fields:
  - id: UUID PK
  - document_type: VARCHAR UNIQUE NOT NULL  # e.g., "PURCHASE_ORDER"
  - states: JSONB                            # array of state names
  - transitions: JSONB                       # array of {from, to, conditions, required_role}
  - initial_state: VARCHAR NOT NULL
  - terminal_states: JSONB                   # array of final states

# Example transitions for PO:
transitions:
  - { from: "DRAFT", to: "SUBMITTED", required_role: "REQUESTER", conditions: ["all_lines_valid", "budget_available"] }
  - { from: "SUBMITTED", to: "APPROVED", required_role: "APPROVER", conditions: ["approver_not_requester"] }
  - { from: "APPROVED", to: "SENT", required_role: "PROCUREMENT", conditions: ["supplier_valid"] }
  - { from: "SENT", to: "CONFIRMED", required_role: "PROCUREMENT", conditions: ["supplier_confirmed"] }
  - { from: "CONFIRMED", to: "PARTIALLY_RECEIVED", required_role: "WAREHOUSE", conditions: ["grn_created"] }
  - { from: "PARTIALLY_RECEIVED", to: "RECEIVED", required_role: "WAREHOUSE", conditions: ["all_lines_received"] }
  - { from: "RECEIVED", to: "INVOICED", required_role: "FINANCE", conditions: ["invoice_matched"] }
  - { from: "INVOICED", to: "PAID", required_role: "FINANCE", conditions: ["payment_approved", "sod_check_passed"] }
  - { from: "ANY", to: "CANCELLED", required_role: "APPROVER", conditions: ["cancellation_reason_provided"] }
```

### BM-06: Ma trận tách biệt nhiệm vụ (SoD Matrix)
```yaml
table: sod_matrix
fields:
  - id: UUID PK
  - role_a: VARCHAR NOT NULL
  - role_b: VARCHAR NOT NULL
  - conflict_type: ENUM(HARD, SOFT)  # HARD = absolute block, SOFT = warning + approval
  - description: TEXT
  - business_flows: JSONB            # which flows this applies to

# Core SoD conflicts (HARD — no exceptions):
conflicts:
  - { role_a: "REQUESTER", role_b: "APPROVER", type: "HARD", desc: "Người đề xuất ≠ Người phê duyệt" }
  - { role_a: "APPROVER", role_b: "EXECUTOR", type: "HARD", desc: "Người phê duyệt ≠ Người thực hiện" }
  - { role_a: "EXECUTOR", role_b: "AUDITOR", type: "HARD", desc: "Người thực hiện ≠ Người kiểm tra" }
  - { role_a: "REQUESTER", role_b: "EXECUTOR", type: "HARD", desc: "Người đề xuất ≠ Người thực hiện" }

runtime_table: sod_check_log
fields:
  - id: UUID PK
  - transaction_id: UUID NOT NULL
  - transaction_type: VARCHAR
  - user_id: FK → users
  - attempted_role: VARCHAR
  - conflicting_role: VARCHAR
  - result: ENUM(PASSED, BLOCKED, OVERRIDE_APPROVED)
  - override_approved_by: FK → users  # null unless OVERRIDE_APPROVED
  - checked_at: TIMESTAMP
```

### BM-07: Từ điển dữ liệu (Data Dictionary)
```yaml
# File: docs/data-dictionary.yaml (source of truth)
# Also stored in DB for runtime reference

table: data_dictionary
fields:
  - id: UUID PK
  - term: VARCHAR UNIQUE NOT NULL        # e.g., "unit_price"
  - definition: TEXT NOT NULL             # business definition
  - data_type: VARCHAR                   # e.g., "DECIMAL(18,4)"
  - domain: VARCHAR                      # e.g., "PROCUREMENT", "FINANCE"
  - used_in_tables: JSONB                # which DB tables use this
  - validation_rules: JSONB              # min, max, format, etc.
  - aliases: JSONB                       # other names used historically
  - example_values: JSONB
  - status: ENUM(ACTIVE, DEPRECATED)
```

### BM-08: Danh mục dữ liệu chủ (Master Data Catalog)
```yaml
table: master_data_catalog
fields:
  - id: UUID PK
  - category: ENUM(CUSTOMER, SUPPLIER, PRODUCT, WAREHOUSE, ACCOUNT, COST_CENTER, ...)
  - code: VARCHAR NOT NULL
  - name: VARCHAR NOT NULL
  - attributes: JSONB                    # category-specific fields
  - status: ENUM(ACTIVE, INACTIVE)
  - created_by: FK → users
  - approved_by: FK → users              # master data changes need approval
  - created_at, updated_at: TIMESTAMP

# Governance: master data changes require approval workflow
# Change tracking via audit_trail table
```

### BM-09: Chuỗi chứng từ (Document Chain)
```yaml
table: document_chain
fields:
  - id: UUID PK
  - document_id: UUID NOT NULL
  - document_type: VARCHAR NOT NULL
  - document_number: VARCHAR NOT NULL
  - parent_document_id: UUID             # FK → self (source document)
  - parent_document_type: VARCHAR
  - child_documents: JSONB               # denormalized for quick lookup
  - flow_code: VARCHAR                   # L1–L11
  - created_at: TIMESTAMP

# Example chain: PR-2024-00001 → PO-2024-00042 → GRN-2024-00105 → INV-2024-00203 → PAY-2024-00089
# Query: given any document, trace full chain up and down
api:
  - GET /api/document-chain/:documentId → full chain tree
  - GET /api/document-chain/trace/:type/:id → trace by money/goods/responsibility
```

### BM-10: Danh mục KPI (KPI Catalog)
```yaml
table: kpi_catalog
fields:
  - id: UUID PK
  - code: VARCHAR UNIQUE NOT NULL        # e.g., "FIN-001"
  - name: VARCHAR NOT NULL
  - description: TEXT
  - category: ENUM(FINANCIAL, OPERATIONAL, COMPLIANCE, CUSTOMER)
  - formula: TEXT NOT NULL               # calculation formula
  - data_source: JSONB                   # which tables/views to query
  - target_value: DECIMAL
  - target_unit: VARCHAR                 # %, days, ratio, currency
  - measurement_frequency: ENUM(DAILY, WEEKLY, MONTHLY, QUARTERLY)
  - owner_department: FK → departments
  - threshold_green: DECIMAL             # good
  - threshold_yellow: DECIMAL            # warning
  - threshold_red: DECIMAL               # critical
  - status: ENUM(ACTIVE, DRAFT, DEPRECATED)

table: kpi_measurements
fields:
  - id: UUID PK
  - kpi_id: FK → kpi_catalog
  - period_start: DATE
  - period_end: DATE
  - actual_value: DECIMAL
  - target_value: DECIMAL
  - variance: DECIMAL
  - status: ENUM(GREEN, YELLOW, RED)
  - calculated_at: TIMESTAMP
  - data_snapshot: JSONB                 # raw data used for calculation
```

### BM-11: Sổ ngoại lệ (Exception Register)
```yaml
table: exception_register
fields:
  - id: UUID PK
  - exception_code: VARCHAR UNIQUE NOT NULL  # auto-generated: EXC-YYYY-NNNNN
  - type: ENUM(PROCESS_DEVIATION, DATA_MISMATCH, SLA_BREACH, POLICY_OVERRIDE, SYSTEM_ERROR)
  - severity: ENUM(LOW, MEDIUM, HIGH, CRITICAL)
  - description: TEXT NOT NULL
  - affected_document_id: UUID
  - affected_document_type: VARCHAR
  - affected_flow: VARCHAR               # L1–L11
  - raised_by: FK → users NOT NULL
  - assigned_to: FK → users
  - approved_by: FK → users              # MUST ≠ raised_by (SoD)
  - resolution: TEXT
  - root_cause: TEXT
  - preventive_action: TEXT
  - status: ENUM(RAISED, UNDER_REVIEW, APPROVED, REJECTED, RESOLVED, CLOSED)
  - raised_at: TIMESTAMP
  - resolved_at: TIMESTAMP
  - closed_at: TIMESTAMP

constraint:
  - approved_by ≠ raised_by
  - resolution required before status = RESOLVED
```

### BM-12: Ma trận phân quyền 3 tầng (3-Tier Permission Matrix)
```yaml
table: permission_matrix
fields:
  - id: UUID PK
  - role_id: FK → roles
  - resource: VARCHAR NOT NULL           # e.g., "purchase_order", "journal_entry"
  - action: ENUM(VIEW, CREATE, EDIT, DELETE, APPROVE, EXPORT)
  - data_scope: ENUM(OWN, DEPARTMENT, BRANCH, COMPANY)
  - field_restrictions: JSONB            # { "visible": [...], "editable": [...], "hidden": [...] }
  - conditions: JSONB                    # additional business rules
  - status: ENUM(ACTIVE, INACTIVE)

# 3 tiers:
# Tier 1 — Action: what can user DO (CRUD + approve + export)
# Tier 2 — Data Scope: which RECORDS can user see/act on
# Tier 3 — Field: which FIELDS are visible/editable

# Example: Branch Accountant
permissions:
  - { role: "BRANCH_ACCOUNTANT", resource: "journal_entry", action: "VIEW", data_scope: "BRANCH", fields: { visible: ["*"] } }
  - { role: "BRANCH_ACCOUNTANT", resource: "journal_entry", action: "CREATE", data_scope: "BRANCH", fields: { editable: ["amount", "account", "description"] } }
  - { role: "BRANCH_ACCOUNTANT", resource: "journal_entry", action: "APPROVE", data_scope: "OWN", fields: null }  # cannot approve own entries
```

### BM-13: Sổ Shadow-IT
```yaml
table: shadow_it_register
fields:
  - id: UUID PK
  - name: VARCHAR NOT NULL               # e.g., "Sales tracking spreadsheet"
  - type: ENUM(SPREADSHEET, EXTERNAL_APP, MANUAL_PROCESS, EMAIL_BASED)
  - department_id: FK → departments
  - owner_user_id: FK → users
  - description: TEXT
  - data_types_handled: JSONB            # what business data it processes
  - risk_level: ENUM(LOW, MEDIUM, HIGH)
  - migration_plan: TEXT
  - migration_target_module: VARCHAR     # which ERP module replaces it
  - migration_status: ENUM(IDENTIFIED, PLANNED, IN_PROGRESS, MIGRATED, DECOMMISSIONED)
  - target_date: DATE
  - notes: TEXT
```

### BM-14: Tiêu chí nghiệm thu (Acceptance Criteria)
```yaml
table: acceptance_criteria
fields:
  - id: UUID PK
  - test_code: VARCHAR UNIQUE NOT NULL   # T1.1, T2.3, etc.
  - group: ENUM(N1_FUNCTIONAL, N2_CONTROLS, N3_TRACEABILITY, N4_END_TO_END, N5_LOAD_EDGE)
  - title: VARCHAR NOT NULL
  - description: TEXT
  - preconditions: TEXT
  - test_steps: JSONB                    # array of steps
  - expected_result: TEXT
  - priority: ENUM(MUST, SHOULD, COULD)  # MoSCoW
  - related_dk: JSONB                    # which ĐK this tests [ĐK1..ĐK8]
  - related_flow: VARCHAR                # L1–L11
  - is_blocker: BOOLEAN DEFAULT false    # true = must pass for go-live
  - status: ENUM(NOT_TESTED, PASSED, FAILED, BLOCKED)
  - tested_by: FK → users
  - tested_at: TIMESTAMP
  - evidence: TEXT                       # screenshots, logs, etc.
  - notes: TEXT
```

---

## 10. LỘ TRÌNH 7 GIAI ĐOẠN

### P0: Kickoff (2 tuần)
```
Mục tiêu: Thiết lập project, team, và conventions
Deliverables:
  □ CLAUDE.md (file này) — project context
  □ Monorepo setup (Turborepo + NestJS + Next.js + Prisma)
  □ CI/CD pipeline (GitHub Actions)
  □ Pre-commit hooks (AI Simple Framework)
  □ docs/app-map/ skeleton
  □ Development environment (Docker Compose)
  □ Initial Prisma schema (foundation tables)
  
Acceptance: 
  - `npm run dev` works for both API and Web
  - Pre-commit hooks block undocumented changes
  - All team members can clone and run locally
```

### P1: Khảo sát (3–4 tuần)
```
Mục tiêu: Thu thập yêu cầu, map nghiệp vụ hiện tại
Deliverables:
  □ BM-01: User Directory (populated)
  □ BM-02: Ownership Matrix (populated)
  □ BM-07: Data Dictionary v1
  □ BM-08: Master Data Catalog v1
  □ BM-13: Shadow-IT Register
  □ Current-state process maps cho 11 luồng
  □ Gap analysis document

Acceptance:
  - 100% business processes have an owner
  - Data dictionary covers ≥80% of terms
  - All shadow-IT items identified
```

### P2: Thiết kế (5–7 tuần)
```
Mục tiêu: Thiết kế chi tiết hệ thống
Deliverables:
  □ BM-04: Handoff Map (all 11 flows)
  □ BM-05: State Machine definitions (all document types)
  □ BM-06: SoD Matrix
  □ BM-09: Document Chain design
  □ BM-10: KPI Catalog
  □ BM-11: Exception Register template
  □ BM-12: 3-Tier Permission Matrix
  □ Database schema design (complete Prisma schema)
  □ API design (OpenAPI spec)
  □ UI wireframes / mockups
  □ docs/app-map/ completed for all modules

Acceptance:
  - State machines cover all document types
  - SoD matrix validated by business
  - Permission matrix reviewed by security
  - Database schema passes review
```

### P3: Lựa chọn giải pháp (3–4 tuần)
```
Mục tiêu: Finalize tech stack, prove feasibility
Deliverables:
  □ Tech stack decision (ADR documented)
  □ POC: Auth + RBAC with Better Auth
  □ POC: State machine engine
  □ POC: Audit trail interceptor
  □ POC: SoD enforcement middleware
  □ POC: 3-way matching engine
  □ Performance baseline tests

Acceptance:
  - POCs demonstrate all critical patterns
  - Performance meets requirements (response <500ms for CRUD)
  - Security review passed
```

### P4: Cấu hình & Phát triển (8–14 tuần)
```
Mục tiêu: Build the system
Sprint plan (2-week sprints):

Sprint 1-2: L1 Foundation
  □ Organization structure module
  □ User management + auth (Better Auth)
  □ Role & permission engine (BM-12)
  □ Master data management
  □ Data dictionary enforcement
  
Sprint 3-4: L2 Core Transactions
  □ Sales module (Quotation → SO → Invoice)
  □ Procurement module (PR → PO → GRN)
  □ 3-way matching engine
  □ Document numbering service

Sprint 5-6: L2 Extended + L3
  □ Inventory module
  □ Finance module (JV, GL, AR, AP)
  □ State machine engine
  □ Approval workflow engine
  □ Handoff tracking

Sprint 7-8: L4 Controls + Remaining L2
  □ SoD enforcement (guards/middleware)
  □ Audit trail interceptor
  □ Exception handling module
  □ HR & Payroll module
  □ Asset management module
  □ Production module (if scope includes)

Sprint 9-10: L5 Analytics + Integration
  □ KPI computation engine
  □ Dashboard (real-time)
  □ Reporting engine
  □ 3 Trace Paths implementation
  □ Customer service module

Sprint 11-12 (buffer): Polish + Edge Cases
  □ System admin module
  □ Data import/export
  □ Email notifications
  □ Performance optimization
  □ Bug fixes from testing

Acceptance per sprint:
  - All unit tests pass (Vitest)
  - API tests pass (NestJS testing)
  - No SoD violations in new code
  - Audit trail covers all mutations
  - Code review approved
```

### P5: Nghiệm thu (3–4 tuần)
```
Mục tiêu: Run all 63 acceptance tests
Test groups (parallel execution):
  □ N1: 15 Functional tests
  □ N2: 12 Control tests  
  □ N3: 12 Traceability tests
  □ N4: 12 End-to-end tests
  □ N5: 12 Load/edge tests

⚠️ ABSOLUTE BLOCKERS (must pass, no exceptions):
  - T3.1: Cùng user không thể vừa tạo vừa duyệt cùng PO
  - T3.2: Cùng user không thể vừa duyệt vừa thanh toán cùng PO
  - T3.3: Cùng user không thể vừa tạo vừa thanh toán cùng PO
  - T3.4: Hệ thống log mọi attempt vi phạm SoD

Acceptance:
  - 100% MUST tests passed
  - ≥90% SHOULD tests passed
  - All blockers resolved
  - BM-14 fully populated with evidence
```

### P6: Go-live (1–2 tuần)
```
Mục tiêu: Deploy to production
Checklist:
  □ All P5 acceptance tests passed
  □ Data migration completed and verified
  □ User training completed
  □ Rollback plan documented and tested
  □ Monitoring dashboards live
  □ Support team briefed
  □ Communication sent to all users

Go-live criteria:
  - T3.1–T3.4 PASSED (absolute requirement)
  - No CRITICAL bugs open
  - Performance benchmarks met
  - Security audit passed
```

### P7: Hypercare (8+ tuần)
```
Mục tiêu: Stabilize production, handle issues
Activities:
  □ Week 1-2: Daily monitoring, immediate bug fixes
  □ Week 3-4: Weekly reviews, optimization
  □ Week 5-8: Bi-weekly reviews, knowledge transfer
  □ Ongoing: Exception register review, process improvement

Post go-live audit schedule:
  - Week 4: First audit (focus: data integrity, SoD compliance)
  - Week 8: Second audit (focus: process adherence, KPI tracking)
  - Week 12: Third audit (focus: user adoption, shadow-IT check)
  - Quarterly: Ongoing compliance audits
```

---

## 11. 63 ACCEPTANCE TESTS

### N1: Functional Tests (15 tests) — Kiểm tra chức năng
```
T1.1:  Tạo PO với đầy đủ thông tin → PO lưu thành công, trạng thái DRAFT
T1.2:  Submit PO → trạng thái chuyển SUBMITTED, notification gửi approver
T1.3:  Approve PO → trạng thái APPROVED, PO ready to send
T1.4:  Tạo GRN từ PO → auto-link PO, số lượng nhận ≤ số lượng đặt
T1.5:  3-way matching: PO ↔ GRN ↔ Invoice → match thành công khi khớp
T1.6:  3-way matching: mismatch → tạo exception tự động
T1.7:  Tạo Sales Order → link quotation, check inventory availability
T1.8:  Tạo Journal Entry → debit = credit, GL updated
T1.9:  Period close → block posting to closed period
T1.10: Employee payroll calculation → gross, deductions, net correct
T1.11: Stock transfer between warehouses → source decreased, dest increased
T1.12: Asset depreciation calculation → monthly amount correct
T1.13: Customer ticket creation → auto-assign based on rules
T1.14: Budget check on PO → block if over budget
T1.15: Master data change → approval workflow triggered
```

### N2: Control Tests (12 tests) — Kiểm tra kiểm soát
```
T2.1:  User without permission → denied access (403)
T2.2:  User with OWN scope → see only own records
T2.3:  User with DEPARTMENT scope → see department records only
T2.4:  User with BRANCH scope → see branch records only
T2.5:  Field-level restriction → hidden fields not in API response
T2.6:  SoD check on approval → block if same user
T2.7:  SoD check on payment → block if same as approver
T2.8:  Exception requires different approver than raiser
T2.9:  Audit trail records ALL changes with before/after values
T2.10: Audit trail is immutable (cannot UPDATE or DELETE)
T2.11: State transition validation → invalid transition rejected
T2.12: Concurrent state change → optimistic locking prevents conflict
```

### N3: Traceability Tests (12 tests) — Kiểm tra truy vết
```
T3.1:  ⚠️ BLOCKER — Cùng user không thể vừa tạo vừa duyệt cùng PO
T3.2:  ⚠️ BLOCKER — Cùng user không thể vừa duyệt vừa thanh toán cùng PO
T3.3:  ⚠️ BLOCKER — Cùng user không thể vừa tạo vừa thanh toán cùng PO
T3.4:  ⚠️ BLOCKER — Hệ thống log mọi attempt vi phạm SoD
T3.5:  Trace by money: Payment → Invoice → PO → PR → Budget (complete chain)
T3.6:  Trace by goods: Delivery → Stock Movement → GRN → PO (complete chain)
T3.7:  Trace by responsibility: every action → user → role → department
T3.8:  Document chain: no orphan documents (every doc links to parent)
T3.9:  Handoff tracking: every cross-dept transfer has record
T3.10: Exception trace: every exception linked to source document
T3.11: Approval trace: every approval has timestamp + approver + reason
T3.12: Change history: data dictionary term changes tracked
```

### N4: End-to-End Tests (12 tests) — Kiểm tra luồng
```
T4.1:  Procure-to-Pay: PR → PO → GRN → Invoice Match → Payment → GL
T4.2:  Order-to-Cash: Quotation → SO → Delivery → Invoice → Collection → GL
T4.3:  Hire-to-Retire: Recruit → Onboard → Attend → Payroll → Payment → GL
T4.4:  Plan-to-Produce: Plan → BOM → WO → Material Issue → Production → FG Receipt
T4.5:  Acquire-to-Dispose: Request → PO → Register → Depreciate → Dispose
T4.6:  Record-to-Report: JV → GL → Trial Balance → Financial Statements
T4.7:  Ticket-to-Resolution: Create → Assign → Resolve → Feedback → Close
T4.8:  Budget-to-Variance: Budget → Spending → Monitor → Variance Report
T4.9:  Stock-Take: Schedule → Count → Variance → Adjustment → GL
T4.10: Bank-Reconciliation: Statement → Match → Reconcile → GL
T4.11: Period-Close: Soft Close → Review → Adjustments → Hard Close → Reports
T4.12: Access-Review: Schedule → Review All Users → Revoke/Approve → Document
```

### N5: Load & Edge Case Tests (12 tests) — Kiểm tra tải & biên
```
T5.1:  100 concurrent users creating POs → no data corruption
T5.2:  Bulk import 10,000 master data records → completes <5 min
T5.3:  Report generation with 1M+ transactions → completes <30 sec
T5.4:  Concurrent approval of same document → only one succeeds (optimistic lock)
T5.5:  Network timeout during payment → transaction rolled back, no partial state
T5.6:  Duplicate submission prevention → idempotency key works
T5.7:  Maximum approval chain (5+ levels) → completes correctly
T5.8:  Cross-timezone operations → timestamps consistent (UTC storage)
T5.9:  Unicode in all text fields → stores and displays correctly
T5.10: API rate limiting → returns 429, no server crash
T5.11: Large file attachment (50MB) → uploads successfully
T5.12: Session expiry during form fill → draft auto-saved, no data loss
```

---

## 12. 3 TRACE PATHS

### 12.1 Trace by Money (Theo dòng tiền)
```
Payment Voucher
  └→ Supplier Invoice
       └→ Purchase Order
            └→ Purchase Requisition
                 └→ Budget Line Item
                      └→ Annual Budget
                           └→ Budget Plan

Query: GET /api/trace/money/:paymentId
Response: ordered array of documents with amounts, dates, users
Validation: sum at each level must be consistent (within tolerance)
```

### 12.2 Trace by Goods (Theo dòng hàng)
```
Delivery Note (to customer)
  └→ Pick List
       └→ Stock Location
            └→ Goods Receipt Note
                 └→ Purchase Order
                      └→ Purchase Requisition

Query: GET /api/trace/goods/:deliveryId
Response: ordered array with quantities, locations, timestamps
Validation: quantity chain must be consistent (no phantom stock)
```

### 12.3 Trace by Responsibility (Theo trách nhiệm)
```
Any Action (create, approve, modify, delete)
  └→ User (who did it)
       └→ Role (what authority)
            └→ Department (organizational context)
                 └→ Process Owner (ultimate responsibility)

Query: GET /api/trace/responsibility/:actionId
Response: full chain from action to owner
Validation: every action has a complete responsibility chain
```

---

## 13. PRE-COMMIT HOOKS & ENFORCEMENT

### 13.1 Husky + lint-staged Setup
```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"
npx lint-staged
sh scripts/pre-commit.sh
```

### 13.2 Pre-commit Script (scripts/pre-commit.sh)
```bash
#!/bin/bash
set -e

echo "🔍 Running ERP pre-commit checks..."

# 1. Check: mọi file thay đổi có test không?
CHANGED_SRC=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '\.spec\.')
for file in $CHANGED_SRC; do
  TEST_FILE=$(echo "$file" | sed 's/\.\(ts\|tsx\)$/.test.\1/')
  if [ ! -f "$TEST_FILE" ]; then
    echo "❌ Missing test for: $file"
    echo "   Expected: $TEST_FILE"
    exit 1
  fi
done

# 2. Check: doc đã cập nhật?
CHANGED_MODULES=$(git diff --cached --name-only | grep 'packages/' | cut -d'/' -f2 | sort -u)
for module in $CHANGED_MODULES; do
  APP_MAP="docs/app-map/*-${module}*.md"
  if ! git diff --cached --name-only | grep -q "docs/app-map/"; then
    echo "⚠️  Warning: Module '$module' changed but no app-map doc updated"
  fi
done

# 3. Check: no secrets
if git diff --cached | grep -iE '(password|secret|api_key|token)\s*[:=]' | grep -v '\.test\.' | grep -v '\.example'; then
  echo "❌ Potential secret detected in staged files"
  exit 1
fi

# 4. Check: SoD-related code has tests
SOD_FILES=$(git diff --cached --name-only | grep -i 'sod\|separation.*dut')
if [ -n "$SOD_FILES" ]; then
  for file in $SOD_FILES; do
    if ! git diff --cached --name-only | grep -q "$(basename "$file" .ts).test.ts"; then
      echo "❌ SoD-related file changed without test update: $file"
      exit 1
    fi
  done
fi

# 5. Check: audit trail code is not modified (except additions)
if git diff --cached -- '**/audit*' | grep '^-' | grep -v '^---' | grep -v 'import'; then
  echo "❌ Audit trail code should only have additions, not deletions"
  exit 1
fi

echo "✅ All pre-commit checks passed"
```

### 13.3 CI Pipeline Checks
```yaml
# .github/workflows/ci.yml
name: ERP CI Pipeline
on: [push, pull_request]

jobs:
  lint-and-type:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "❌ Coverage $COVERAGE% below 80% threshold"
            exit 1
          fi

  e2e-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: erp_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npx playwright test
      
  sod-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify SoD enforcement
        run: |
          # Check that all financial endpoints have SoD guard
          grep -rn "@UseSodGuard" packages/api/src/modules/transactions/ || {
            echo "❌ Financial endpoints missing SoD guard"
            exit 1
          }
      - name: Check audit interceptor coverage
        run: |
          grep -rn "@UseAuditInterceptor" packages/api/src/modules/ | wc -l
```

---

## 14. APP-MAP PATTERN

### 14.1 Format
Mỗi file trong `docs/app-map/` phải có format:

```markdown
---
covers: packages/api/src/modules/transactions/procurement/**
last_verified: 2024-01-15
ttl_days: 30
---

# 011 — Procurement Flow

## Overview
Procurement module handles the complete procure-to-pay cycle.

## Key Files
- `packages/api/src/modules/transactions/procurement/procurement.module.ts`
- `packages/api/src/modules/transactions/procurement/purchase-order/po.service.ts`
- `packages/api/src/modules/transactions/procurement/grn/grn.service.ts`

## State Machines
- PO: DRAFT → SUBMITTED → APPROVED → SENT → CONFIRMED → RECEIVED → INVOICED → PAID
- GRN: DRAFT → INSPECTED → ACCEPTED → STORED

## Business Rules
1. PO requires budget check before submission
2. 3-way matching: PO ↔ GRN ↔ Invoice (tolerance: ±2% amount, ±0 quantity)
3. SoD: requester ≠ approver ≠ payer
4. GRN quantity ≤ PO quantity

## API Endpoints
- POST /api/purchase-orders
- PATCH /api/purchase-orders/:id/submit
- PATCH /api/purchase-orders/:id/approve
- POST /api/grn
- POST /api/invoice-matching/:poId

## Dependencies
- L1: master-data (suppliers, products)
- L4: controls (sod-guard, audit-interceptor)
```

### 14.2 Danh sách App-Map Files
```
docs/app-map/
├── 001-system-overview.md         covers: project root
├── 002-api-architecture.md        covers: packages/api/src/**
├── 003-database-schema.md         covers: packages/api/prisma/**
├── 004-auth-permission.md         covers: packages/api/src/modules/foundation/auth/**
├── 005-state-machines.md          covers: packages/shared/src/state-machines/**
├── 010-sales-flow.md              covers: packages/api/src/modules/transactions/sales/**
├── 011-procurement-flow.md        covers: packages/api/src/modules/transactions/procurement/**
├── 012-inventory-flow.md          covers: packages/api/src/modules/transactions/inventory/**
├── 013-production-flow.md         covers: packages/api/src/modules/transactions/production/**
├── 014-hr-payroll-flow.md         covers: packages/api/src/modules/transactions/hr-payroll/**
├── 015-finance-flow.md            covers: packages/api/src/modules/transactions/finance/**
├── 016-assets-flow.md             covers: packages/api/src/modules/transactions/assets/**
├── 017-customer-service-flow.md   covers: packages/api/src/modules/transactions/customer-service/**
├── 018-planning-budget-flow.md    covers: packages/api/src/modules/transactions/planning/**
├── 019-system-admin-flow.md       covers: packages/api/src/modules/foundation/admin/**
└── 020-reporting-flow.md          covers: packages/api/src/modules/analytics/**
```

---

## 15. SECURITY & PERMISSION MODEL

### 15.1 Authentication (Better Auth)
```typescript
// packages/api/src/config/auth.config.ts
import { betterAuth } from "better-auth";
import { organization, twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
  database: prisma,
  plugins: [
    organization({
      // Multi-branch support
      roles: ["admin", "manager", "user", "auditor"],
    }),
    twoFactor({
      // Required for financial operations
      issuer: "ERP-General",
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 8, // 8 hours
    updateAge: 60 * 15,      // refresh every 15 min
  },
});
```

### 15.2 Authorization Middleware (NestJS Guard)
```typescript
// packages/api/src/common/guards/permission.guard.ts
@Injectable()
export class PermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.get<RequiredPermission>(
      'permission', context.getHandler()
    );
    const user = context.switchToHttp().getRequest().user;
    
    // Check 3-tier permission:
    // 1. Action: can user perform this action?
    // 2. Data Scope: can user access this record?
    // 3. Field: filter response fields based on permission
    
    return this.permissionService.check(user, requiredPermission);
  }
}
```

### 15.3 SoD Guard
```typescript
// packages/api/src/common/guards/sod.guard.ts
@Injectable()
export class SodGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const sodRule = this.reflector.get<SodRule>('sod', context.getHandler());
    const user = context.switchToHttp().getRequest().user;
    const documentId = context.switchToHttp().getRequest().params.id;
    
    // Get all users who have acted on this document
    const documentHistory = await this.auditService.getDocumentActors(documentId);
    
    // Check if current user + action would violate SoD
    const violation = this.sodService.checkViolation(
      user.id, sodRule.role, documentHistory
    );
    
    if (violation) {
      // Log the attempt (T3.4)
      await this.sodService.logViolationAttempt(user.id, documentId, sodRule, violation);
      throw new ForbiddenException(`SoD violation: ${violation.description}`);
    }
    
    return true;
  }
}
```

### 15.4 Audit Trail Interceptor
```typescript
// packages/api/src/common/interceptors/audit.interceptor.ts
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const before = /* snapshot current state */;
    
    return next.handle().pipe(
      tap(async (response) => {
        await this.auditService.log({
          entityType: request.route.path,
          entityId: request.params.id || response?.id,
          action: request.method,
          oldValue: before,
          newValue: response,
          userId: request.user.id,
          timestamp: new Date(),
          ipAddress: request.ip,
        });
      }),
    );
  }
}

// Audit trail table: INSERT ONLY — no UPDATE, no DELETE triggers
// Prisma middleware enforces immutability
```

---

## 16. CHECKLIST TỔNG HỢP CHO CLAUDE CODE

### Khi bắt đầu một feature mới:
```
□ 1. Đọc CLAUDE.md (file này) + app-map doc liên quan
□ 2. Xác định feature thuộc tầng nào (L1–L5)
□ 3. Kiểm tra dependencies: tầng dưới đã hoàn thành?
□ 4. Xác định acceptance tests liên quan (T1.x–T5.x)
□ 5. Tạo/update app-map doc cho module
```

### Khi viết code:
```
□ 1. Tạo file trong đúng thư mục theo cấu trúc (Mục 7)
□ 2. Implement business logic theo state machine (BM-05)
□ 3. Thêm PermissionGuard cho mọi endpoint
□ 4. Thêm SodGuard cho mọi financial endpoint
□ 5. Thêm AuditInterceptor cho mọi mutation endpoint
□ 6. Validate input với Zod schema (shared package)
□ 7. Handle exceptions theo BM-11 workflow
□ 8. Viết unit test (Vitest) cho business logic
□ 9. Viết E2E test (Playwright) map tới acceptance test
□ 10. Cập nhật data dictionary nếu thêm field mới (BM-07)
```

### Khi commit:
```
□ 1. Pre-commit hooks pass (all 5 checks)
□ 2. Unit tests pass
□ 3. No SoD violations trong code mới
□ 4. Audit trail covers mọi mutations
□ 5. App-map doc updated
□ 6. Commit message references ticket/test (e.g., "feat(procurement): implement 3-way matching [T1.5]")
```

### Khi review PR:
```
□ 1. Code tuân thủ 8 điều kiện (ĐK1–ĐK8)?
□ 2. State machine transitions hợp lệ?
□ 3. SoD enforced cho financial operations?
□ 4. Audit trail captures all changes?
□ 5. Permission model correct (3-tier)?
□ 6. Tests cover happy path + edge cases?
□ 7. No forbidden patterns (Mục 1.3)?
□ 8. Doc updated?
```

### Trước khi go-live:
```
□ 1. Tất cả 63 tests trong BM-14 PASSED
□ 2. T3.1–T3.4 (SoD) = 100% PASSED (absolute blocker)
□ 3. Coverage ≥ 80%
□ 4. Performance benchmarks met
□ 5. Security audit passed
□ 6. Shadow-IT register = empty hoặc migrated
□ 7. Data migration verified
□ 8. Rollback plan tested
□ 9. User training completed
□ 10. Monitoring dashboards live
```

---

## PHỤ LỤC A: Mapping AutoSkills → ERP Modules

| ERP Module | AutoSkills Required | Priority |
|-----------|-------------------|----------|
| Foundation (L1) | `nestjs`, `prisma`, `better-auth`, `typescript` | P0 |
| Sales (L2) | `nestjs`, `prisma`, `zod`, `react-hook-form` | P1 |
| Procurement (L2) | `nestjs`, `prisma`, `zod` | P1 |
| Inventory (L2) | `nestjs`, `prisma` | P1 |
| Finance (L2) | `nestjs`, `prisma`, `zod` | P1 |
| HR & Payroll (L2) | `nestjs`, `prisma` | P2 |
| Production (L2) | `nestjs`, `prisma` | P2 |
| Assets (L2) | `nestjs`, `prisma` | P2 |
| Workflow (L3) | `nestjs`, state machine lib | P1 |
| Controls (L4) | `nestjs` guards/interceptors, `vitest` | P0 |
| Analytics (L5) | `nextjs`, charting lib, `prisma` | P3 |
| E2E Tests | `playwright` | All phases |
| Unit Tests | `vitest` | All phases |
| Deployment | `docker`, `vercel` | P0 |

## PHỤ LỤC B: Quick Reference — State Codes

```
Document States (common):
  D = DRAFT
  S = SUBMITTED  
  A = APPROVED
  R = REJECTED
  P = IN_PROGRESS / PROCESSING
  C = COMPLETED / CLOSED
  X = CANCELLED

SoD Roles:
  REQ = REQUESTER (người đề xuất)
  APR = APPROVER (người phê duyệt)
  EXE = EXECUTOR (người thực hiện)
  AUD = AUDITOR (người kiểm tra)

Permission Scopes:
  O = OWN (chỉ record của mình)
  D = DEPARTMENT (cùng phòng ban)
  B = BRANCH (cùng chi nhánh)
  C = COMPANY (toàn công ty)
```

## PHỤ LỤC C: Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/erp_general"

# Auth (Better Auth)
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:3001"

# App
API_PORT=3001
WEB_PORT=3000
NODE_ENV=development

# Redis (BullMQ)
REDIS_URL="redis://localhost:6379"

# File Storage
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=52428800  # 50MB

# Monitoring
LOG_LEVEL=info
ENABLE_AUDIT_TRAIL=true
```

---

> **Claude Code**: Khi đọc file này, hãy tuân thủ mọi quy tắc, pattern, và checklist ở trên.
> Mỗi feature phải map được tới ít nhất 1 acceptance test.
> Mỗi commit phải qua pre-commit hooks.
> SoD là absolute blocker — không bao giờ bypass.
