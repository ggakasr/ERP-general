---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql
last_verified: 2026-09-20
ttl_days: 30
---

# 005 — State Machines (BM-05)

## Overview

State machines are **data-driven**: transition rules live in the `doc_types` and
`state_transitions` tables (seeded by `003_config.sql`), not in engine code. The engine
(`004_engine.sql`) reads from these tables at runtime. Adding a new document type or
transition requires only new rows in the config tables — no engine changes needed.

---

## How api_transition Works

`api_transition(p_doc_id, p_action, p_comment, p_expected_version, p_payload)` runs these
checks in order before changing state:

1. **From-status match**: looks up `state_transitions` where `doc_type = documents.doc_type`,
   `from_status = documents.status`, `action = p_action`. Raises `INVALID_TRANSITION` if
   no row found.
2. **Optimistic lock**: compares `p_expected_version` with `documents.version`. Raises
   `CONFLICT` if stale.
3. **Permission check**: calls `fn_perm_scope(user_id, perm_resource, perm_action)` from
   the matched transition row. Raises `FORBIDDEN` if the user lacks the required action.
4. **SoD check**: if the transition row has `sod_role` set, calls
   `fn_sod_enforce(user_id, doc_id, sod_role)`. Raises `SOD_VIOLATION` on conflict.
5. **Condition guards**: evaluates each entry in `state_transitions.conditions[]`. Each
   condition is a named check function (e.g. `budget_available`, `grn_qty_valid`,
   `debit_equals_credit`). Raises `CONDITION_FAILED` if any check returns false.
6. **State update**: sets `documents.status = to_status`, increments `documents.version`,
   writes to `audit_trail`.
7. **Effects**: calls `fn_apply_effects(doc_id, action)` for GL entries, stock movements,
   email_outbox inserts.
8. **After-effects**: calls `fn_after_effects(doc_id)` for parent status roll-ups and
   child document creation.

---

## Document State Definitions

Terminal states are marked with ✓. From any non-terminal state, CANCEL is available
(subject to APPROVER permission + cancellation_reason condition).

---

### BUDGET — Planning & Budget (L1)
```
DRAFT → SUBMITTED → APPROVED → ACTIVE → CLOSED ✓
                ↘ CANCELLED ✓
```
| From | Action | To | SoD Role |
|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER |
| SUBMITTED | APPROVE | APPROVED | APPROVER |
| SUBMITTED | REJECT | DRAFT | APPROVER |
| APPROVED | ACTIVATE | ACTIVE | EXECUTOR |
| ACTIVE | CLOSE | CLOSED | APPROVER |
| ANY | CANCEL | CANCELLED | APPROVER |

---

### QUOT — Quotation (L2 Sales)
```
DRAFT → SUBMITTED → APPROVED → SENT → ACCEPTED → ORDERED ✓
                                    ↘ LOST ✓
               ↘ CANCELLED ✓
```
| From | Action | To | SoD Role |
|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER |
| SUBMITTED | APPROVE | APPROVED | APPROVER |
| APPROVED | SEND | SENT | EXECUTOR |
| SENT | ACCEPT | ACCEPTED | — |
| SENT | LOSE | LOST | — |
| ACCEPTED | ORDER | ORDERED | EXECUTOR |
| ANY | CANCEL | CANCELLED | APPROVER |

---

### SO — Sales Order (L2 Sales)
```
DRAFT → CONFIRMED → PARTIALLY_SHIPPED → SHIPPED → INVOICED → CLOSED ✓
      ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | CONFIRM | CONFIRMED | APPROVER | inventory_available |
| CONFIRMED | SHIP_PARTIAL | PARTIALLY_SHIPPED | EXECUTOR | dn_created |
| PARTIALLY_SHIPPED | SHIP_PARTIAL | PARTIALLY_SHIPPED | EXECUTOR | — |
| PARTIALLY_SHIPPED | SHIP_COMPLETE | SHIPPED | EXECUTOR | all_lines_shipped |
| CONFIRMED | SHIP_COMPLETE | SHIPPED | EXECUTOR | all_lines_shipped |
| SHIPPED | INVOICE | INVOICED | EXECUTOR | inv_created |
| INVOICED | CLOSE | CLOSED | APPROVER | inv_paid |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### DN — Delivery Note (L2 Sales)
```
DRAFT → PICKED → SHIPPED ✓
      ↘ CANCELLED ✓
```
| From | Action | To | SoD Role |
|---|---|---|---|
| DRAFT | PICK | PICKED | EXECUTOR |
| PICKED | SHIP | SHIPPED | EXECUTOR |
| ANY | CANCEL | CANCELLED | APPROVER |

---

### INV — Sales Invoice (L2 Sales)
```
DRAFT → POSTED → PARTIALLY_PAID → PAID ✓
      ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | POST | POSTED | EXECUTOR | debit_equals_credit, period_open |
| POSTED | RECEIVE_PARTIAL | PARTIALLY_PAID | EXECUTOR | — |
| PARTIALLY_PAID | RECEIVE_PARTIAL | PARTIALLY_PAID | EXECUTOR | — |
| PARTIALLY_PAID | RECEIVE_FULL | PAID | EXECUTOR | — |
| POSTED | RECEIVE_FULL | PAID | EXECUTOR | — |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### RCPT — Payment Receipt (L2 Sales)
```
DRAFT → RECEIVED → AUDITED ✓
      ↘ CANCELLED ✓
```
| From | Action | To | SoD Role |
|---|---|---|---|
| DRAFT | RECEIVE | RECEIVED | EXECUTOR |
| RECEIVED | AUDIT | AUDITED | AUDITOR |
| ANY | CANCEL | CANCELLED | APPROVER |

---

### PR — Purchase Requisition (L3 Procurement)
```
DRAFT → SUBMITTED → APPROVED → ORDERED → CLOSED ✓
               ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER | budget_available |
| SUBMITTED | APPROVE | APPROVED | APPROVER | — |
| SUBMITTED | REJECT | DRAFT | APPROVER | — |
| APPROVED | ORDER | ORDERED | EXECUTOR | po_created |
| ORDERED | CLOSE | CLOSED | APPROVER | po_received |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### PO — Purchase Order (L3 Procurement)
```
DRAFT → SUBMITTED → APPROVED → SENT → CONFIRMED → PARTIALLY_RECEIVED → RECEIVED → INVOICED → PAID ✓
                ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER | supplier_valid, budget_available |
| SUBMITTED | APPROVE | APPROVED | APPROVER | approver_not_requester |
| SUBMITTED | REJECT | DRAFT | APPROVER | — |
| APPROVED | SEND | SENT | EXECUTOR | — |
| SENT | CONFIRM | CONFIRMED | EXECUTOR | supplier_confirmed |
| CONFIRMED | RECEIVE_PARTIAL | PARTIALLY_RECEIVED | EXECUTOR | grn_created |
| PARTIALLY_RECEIVED | RECEIVE_PARTIAL | PARTIALLY_RECEIVED | EXECUTOR | — |
| PARTIALLY_RECEIVED | RECEIVE_COMPLETE | RECEIVED | EXECUTOR | all_lines_received |
| CONFIRMED | RECEIVE_COMPLETE | RECEIVED | EXECUTOR | all_lines_received |
| RECEIVED | INVOICE | INVOICED | EXECUTOR | sinv_matched |
| INVOICED | PAY | PAID | EXECUTOR | payment_approved, sod_check_passed |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### GRN — Goods Receipt Note (L3 Procurement / L4 Warehouse)
```
DRAFT → INSPECTED → STORED ✓
                 ↘ REJECTED ✓
      ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | INSPECT | INSPECTED | EXECUTOR | qty_within_po_tolerance |
| INSPECTED | ACCEPT | STORED | EXECUTOR | — |
| INSPECTED | REJECT | REJECTED | APPROVER | rejection_reason |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### SINV — Supplier Invoice (L3 Procurement)
```
DRAFT → MATCHED (or ON_HOLD) → POSTED → PARTIALLY_PAID → PAID ✓
      ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | MATCH | MATCHED | EXECUTOR | three_way_match_pass |
| DRAFT | HOLD | ON_HOLD | EXECUTOR | three_way_match_fail |
| ON_HOLD | MATCH | MATCHED | APPROVER | exception_approved |
| MATCHED | POST | POSTED | EXECUTOR | period_open |
| POSTED | PAY_PARTIAL | PARTIALLY_PAID | EXECUTOR | — |
| PARTIALLY_PAID | PAY_PARTIAL | PARTIALLY_PAID | EXECUTOR | — |
| PARTIALLY_PAID | PAY_FULL | PAID | EXECUTOR | — |
| POSTED | PAY_FULL | PAID | EXECUTOR | — |
| ANY | CANCEL | CANCELLED | APPROVER | — |

Note: `three_way_match_pass` checks PO ↔ GRN ↔ SINV quantities (±0 tolerance) and amounts
(±2%). Mismatch → ON_HOLD + auto-create EXC exception record.

---

### PMT — Payment Voucher (L7 Finance)
```
DRAFT → SUBMITTED → APPROVED → PAID → AUDITED ✓
                ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER | — |
| SUBMITTED | APPROVE | APPROVED | APPROVER | approver_not_requester |
| APPROVED | PAY | PAID | EXECUTOR | approver_not_executor |
| PAID | AUDIT | AUDITED | AUDITOR | auditor_not_executor |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### ST — Stock Transfer (L4 Warehouse)
```
DRAFT → SUBMITTED → APPROVED → IN_TRANSIT → RECEIVED ✓
                ↘ CANCELLED ✓
```
| From | Action | To | SoD Role |
|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER |
| SUBMITTED | APPROVE | APPROVED | APPROVER |
| APPROVED | DISPATCH | IN_TRANSIT | EXECUTOR |
| IN_TRANSIT | RECEIVE | RECEIVED | EXECUTOR |
| ANY | CANCEL | CANCELLED | APPROVER |

---

### ADJ — Stock Adjustment (L4 Warehouse)
```
DRAFT → SUBMITTED → APPROVED → POSTED ✓
                ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER | — |
| SUBMITTED | APPROVE | APPROVED | APPROVER | approver_not_requester |
| APPROVED | POST | POSTED | EXECUTOR | period_open |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### WO — Work Order (L5 Production)
```
PLANNED → RELEASED → MATERIAL_ISSUED → IN_PRODUCTION → QC → COMPLETED → CLOSED ✓
        ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| PLANNED | RELEASE | RELEASED | APPROVER | materials_available |
| RELEASED | ISSUE_MATERIAL | MATERIAL_ISSUED | EXECUTOR | — |
| MATERIAL_ISSUED | START | IN_PRODUCTION | EXECUTOR | — |
| IN_PRODUCTION | QC | QC | EXECUTOR | — |
| QC | COMPLETE | COMPLETED | EXECUTOR | qc_passed |
| QC | FAIL | IN_PRODUCTION | APPROVER | — |
| COMPLETED | CLOSE | CLOSED | APPROVER | fg_received |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### HIRE — Hire / Onboarding (L6 HR)
```
DRAFT → SUBMITTED → APPROVED → ONBOARDED ✓
                ↘ CANCELLED ✓
```

---

### PAYROLL — Payroll Run (L6 HR)
```
CALCULATED → SUBMITTED → APPROVED → POSTED → PAID ✓
                      ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| CALCULATED | SUBMIT | SUBMITTED | REQUESTER | — |
| SUBMITTED | APPROVE | APPROVED | APPROVER | approver_not_requester |
| APPROVED | POST | POSTED | EXECUTOR | period_open, debit_equals_credit |
| POSTED | PAY | PAID | EXECUTOR | approver_not_executor |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### JV — Journal Voucher (L7 Finance)
```
DRAFT → SUBMITTED → POSTED → AUDITED ✓
                 ↘ REVERSED ✓
      ↘ CANCELLED ✓
```
| From | Action | To | SoD Role | Conditions |
|---|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER | debit_equals_credit |
| SUBMITTED | POST | POSTED | EXECUTOR | period_open, approver_not_requester |
| POSTED | REVERSE | REVERSED | APPROVER | — |
| POSTED | AUDIT | AUDITED | AUDITOR | auditor_not_poster |
| ANY | CANCEL | CANCELLED | APPROVER | — |

---

### BANKREC — Bank Reconciliation (L7 Finance)
```
DRAFT → MATCHED → RECONCILED ✓
```
| From | Action | To |
|---|---|---|
| DRAFT | MATCH | MATCHED |
| MATCHED | RECONCILE | RECONCILED |

---

### ASSET — Fixed Asset (L8 Assets)
```
DRAFT → SUBMITTED → APPROVED → IN_USE → UNDER_MAINTENANCE → IN_USE (loop) or DISPOSED ✓
                ↘ CANCELLED ✓
```
| From | Action | To | SoD Role |
|---|---|---|---|
| DRAFT | SUBMIT | SUBMITTED | REQUESTER |
| SUBMITTED | APPROVE | APPROVED | APPROVER |
| APPROVED | ACTIVATE | IN_USE | EXECUTOR |
| IN_USE | MAINTAIN | UNDER_MAINTENANCE | EXECUTOR |
| UNDER_MAINTENANCE | RETURN | IN_USE | EXECUTOR |
| IN_USE | DISPOSE | DISPOSED | APPROVER |
| ANY | CANCEL | CANCELLED | APPROVER |

---

### TICKET — Customer Service Ticket (L9 CS)
```
OPEN → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → RESOLVED → CLOSED ✓
```
| From | Action | To |
|---|---|---|
| OPEN | ASSIGN | ASSIGNED |
| ASSIGNED | START | IN_PROGRESS |
| IN_PROGRESS | WAIT | WAITING_CUSTOMER |
| WAITING_CUSTOMER | RESUME | IN_PROGRESS |
| IN_PROGRESS | RESOLVE | RESOLVED |
| RESOLVED | CLOSE | CLOSED |

---

### EXC — Exception (ĐK5)
```
RAISED → UNDER_REVIEW → APPROVED → RESOLVED → CLOSED ✓
                     ↘ REJECTED ✓
```
Constraint: `approved_by ≠ raised_by` (SoD applies to exceptions — T2.8).

---

### MDC — Master Data Change (ĐK6)
```
DRAFT → SUBMITTED → APPROVED ✓
                ↘ REJECTED ✓
              ↘ CANCELLED ✓
```

---

### ACCESS_REVIEW — Access Review (ĐK8 / T4.12)
```
DRAFT → SUBMITTED → APPROVED ✓
```

---

## Adding a New Document Type

1. Insert a row into `doc_types` with the new code, prefix, state list, and permission mapping.
2. Insert rows into `state_transitions` for each valid transition.
3. If child documents are auto-created on transition, insert into `doc_child_rules`.
4. If UI entry form is needed, add a config block to `src/lib/doc-config.ts`.
5. Create a new migration file (`supabase/migrations/0NN_new_type.sql`).

**Never edit `004_engine.sql` to hard-code a new document type.** The engine is type-agnostic.

## Adding a New Transition

Insert one row into `state_transitions` (in a new migration). Specify:
- `doc_type`, `from_status`, `action`, `to_status`
- `perm_resource`, `perm_action` (permission required)
- `sod_role` (null if no SoD check needed)
- `conditions` (array of named condition function identifiers)

New condition guards require a corresponding PL/pgSQL function in `004_engine.sql`; this is
the only case where engine code changes are needed for a new transition.
