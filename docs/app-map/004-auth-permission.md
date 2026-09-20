---
covers: supabase/migrations/006_security.sql, supabase/migrations/003_config.sql, src/lib/session.tsx, src/middleware.ts, src/app/login/**
last_verified: 2026-09-20
ttl_days: 30
---

# 004 — Auth & Permission Model

## Overview

Authentication is handled by Supabase Auth (email/password). Authorization is enforced at the
database layer via `SECURITY DEFINER` functions — the frontend has no direct table access.
The permission model is 3-tier: Action × Data Scope × Field restrictions.

---

## Authentication Flow

```
Browser → /login (src/app/login/page.tsx)
  → supabase.auth.signInWithPassword()
  → Supabase Auth returns JWT session
  → src/lib/session.tsx: getUser() + api_me() RPC
  → Session enriched with roles, permissions, branch, department
  → Stored in React context; available via useSession() hook
```

**Session enrichment** (`api_me()` returns):
```json
{
  "id": "uuid",
  "full_name": "Nguyễn Văn A",
  "email": "a@company.vn",
  "employee_code": "EMP-001",
  "department": { "id": "...", "name": "Kế toán" },
  "branch": { "id": "...", "name": "HCM" },
  "roles": ["ACCOUNTANT", "INTERNAL_AUDITOR"],
  "permissions": [
    { "resource": "journal_entry", "action": "VIEW", "data_scope": "BRANCH" },
    { "resource": "journal_entry", "action": "CREATE", "data_scope": "BRANCH" }
  ]
}
```

---

## Route Guard (src/middleware.ts)

All routes under `/(app)` are protected. The middleware runs on every request:

1. Reads the Supabase session cookie.
2. If no valid session → redirect to `/login`.
3. If session exists → pass through; the page component calls `api_*` which enforces
   per-resource permissions server-side.

The middleware does NOT enforce fine-grained permissions — that is the database's job.
Middleware only prevents unauthenticated access.

---

## Permission Model — 3 Tiers

### Tier 1: Action

What the user is allowed to DO on a resource.

| Action | Meaning |
|---|---|
| `VIEW` | Read records |
| `CREATE` | Create new records |
| `EDIT` | Modify existing records |
| `APPROVE` | Approve transitions requiring the APPROVER SoD role |
| `EXECUTE` | Execute transitions requiring the EXECUTOR SoD role (e.g. make payment) |
| `AUDIT` | Access audit trail, sod_log, control reports |
| `EXPORT` | Export data to CSV/PDF |

### Tier 2: Data Scope

Which records the user can see or act on.

| Scope | Meaning |
|---|---|
| `OWN` | Only records created by the calling user |
| `DEPARTMENT` | Records belonging to the user's department |
| `BRANCH` | Records belonging to the user's branch |
| `COMPANY` | All records company-wide |

`fn_perm_scope(p_user_id, p_resource, p_action)` resolves the effective scope and returns
a filter predicate. If the user has no permission entry for the resource+action combination,
the function raises `FORBIDDEN` immediately.

### Tier 3: Field Restrictions

Which fields are visible or editable for the role. Stored as JSONB in `permission_matrix`:

```json
{
  "hidden": ["cost_price", "margin_pct"],
  "read_only": ["supplier_code", "doc_number"]
}
```

`fn_mask(p_row, p_user_id, p_resource)` removes hidden fields and marks read-only fields
before the row is returned to the caller. The frontend never receives data the user is not
permitted to see.

---

## Key Internal Functions

### fn_perm_scope
```sql
fn_perm_scope(p_user_id UUID, p_resource TEXT, p_action TEXT)
  RETURNS TEXT  -- 'OWN' | 'DEPARTMENT' | 'BRANCH' | 'COMPANY'
```
- Looks up `permission_matrix` for the user's roles.
- Returns the broadest scope among all matching rows (COMPANY > BRANCH > DEPARTMENT > OWN).
- Raises exception with code `FORBIDDEN` if no matching permission found.

### fn_doc_in_scope
```sql
fn_doc_in_scope(p_doc_id UUID, p_user_id UUID, p_resource TEXT)
  RETURNS BOOLEAN
```
- Returns TRUE if the document falls within the user's resolved data scope.
- Used by `api_list_documents`, `api_get_document`, and all read functions to filter rows.

### fn_mask
```sql
fn_mask(p_row JSONB, p_user_id UUID, p_resource TEXT)
  RETURNS JSONB
```
- Removes keys listed in `field_restrictions.hidden` for the user's role.
- Applied to every row before it leaves the database.

---

## SoD Enforcement

### fn_sod_enforce
```sql
fn_sod_enforce(p_user_id UUID, p_doc_id UUID, p_sod_role TEXT)
  RETURNS VOID  -- raises exception on violation
```

Sequence:
1. Look up all roles the calling user has already played on this document from `sod_log`.
2. Look up conflicts for `p_sod_role` in `sod_matrix`.
3. If any prior role of the user conflicts with `p_sod_role` (HARD conflict) → raise
   `SOD_VIOLATION`, insert BLOCKED record into `sod_log`.
4. If no conflict → insert PASSED record into `sod_log` and return.

Every `api_transition` call that has a `sod_role` configured in `state_transitions` calls
`fn_sod_enforce` before applying the transition.

### SoD Roles

| SoD Role | When assigned |
|---|---|
| `REQUESTER` | User who creates or submits a document |
| `APPROVER` | User who approves (transitions to APPROVED) |
| `EXECUTOR` | User who executes the financial action (PAID, POSTED) |
| `AUDITOR` | User who audits or closes (AUDITED, CLOSED) |

**HARD conflicts (absolute blocks — no exceptions):**
- REQUESTER ↔ APPROVER (T3.1)
- APPROVER ↔ EXECUTOR (T3.2)
- REQUESTER ↔ EXECUTOR (T3.3)
- EXECUTOR ↔ AUDITOR

T3.4: every check — pass or block — is logged to `sod_log` with timestamp, doc_id, and
the roles involved. This table is append-only.

---

## Roles (23 total)

Configured in `003_config.sql`. Each role maps to a set of permission_matrix entries.

| Domain | Roles |
|---|---|
| Executive | CEO, CFO, BRANCH_DIRECTOR, DEPT_HEAD |
| Finance | CHIEF_ACCOUNTANT, ACCOUNTANT, TREASURER, INTERNAL_AUDITOR |
| Procurement | PROC_MANAGER, BUYER |
| Warehouse | WH_MANAGER, WH_STAFF |
| Production | PROD_MANAGER, PROD_STAFF, QC_INSPECTOR |
| Sales | SALES_MANAGER, SALES_STAFF |
| HR | HR_MANAGER, HR_STAFF |
| Customer Service | CS_MANAGER, CS_AGENT |
| IT | SYS_ADMIN |
| General | EMPLOYEE |

A user can hold multiple roles. The effective permission is the union of all role permissions,
with the broadest data scope winning.

---

## Security Rules (006_security.sql)

```sql
-- No direct table access for any authenticated user
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;

-- Only api_* functions are callable (all SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION api_create_document(...) TO authenticated;
GRANT EXECUTE ON FUNCTION api_transition(...) TO authenticated;
-- ... (all api_* functions listed individually)

-- fn_* internal functions: no grant (private to SECURITY DEFINER context)

-- RLS: disabled on all tables (access control enforced inside SECURITY DEFINER functions)
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
-- ... (same for all tables)
```

Rationale: RLS policies run with the calling role's privileges, which can cause confusion
with complex multi-table joins. All access control is instead centralised in the
`SECURITY DEFINER` functions where the full permission model can be applied consistently.

---

## Demo Accounts

All demo accounts use password `Demo@123`. Accounts are seeded in `003_config.sql`.

| Role | Email |
|---|---|
| SYS_ADMIN | admin@demo.vn |
| CFO | cfo@demo.vn |
| CHIEF_ACCOUNTANT | chief_accountant@demo.vn |
| PROC_MANAGER | proc_manager@demo.vn |
| WH_MANAGER | wh_manager@demo.vn |
| SALES_MANAGER | sales_manager@demo.vn |
| INTERNAL_AUDITOR | auditor@demo.vn |

See `docs/demo-guide.md` for full demo script and scenario walk-throughs.
