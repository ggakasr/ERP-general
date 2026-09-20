---
covers: supabase/migrations/003_config.sql, supabase/migrations/004_engine.sql, src/app/(app)/customer-service/**
last_verified: 2026-09-20
ttl_days: 30
---

# 017 — Customer Service Flow (L9)

## Overview
Customer service module manages support tickets from creation through resolution, with SLA tracking, CSAT feedback, and escalation.

## Key Files
- `supabase/migrations/003_config.sql` — TICKET doc type, state transitions, handoff map (TICKET SLA)
- `supabase/migrations/004_engine.sql` — fn_apply_effects: TICKET ASSIGNED sets assigned_to; sla_status computed from handoff_map sla_hours
- `src/app/(app)/customer-service/page.tsx` — customer service module entry
- `src/lib/doc-config.ts` — UI config for TICKET

## Document Types & State Machines
- **TICKET** (Ticket CSKH): OPEN → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → RESOLVED → CLOSED; terminal: CLOSED
  - OPEN: created by customer, sales staff, or auto-created from SO
  - ASSIGNED: CS_MANAGER assigns to CS_AGENT
  - IN_PROGRESS: CS_AGENT starts working
  - WAITING_CUSTOMER: waiting for customer response
  - RESOLVED: CS_AGENT resolves — requires resolution_provided condition (resolution text in doc header)
  - RESOLVED → IN_PROGRESS (reopen): if resolution not accepted
  - RESOLVED → CLOSED: CS_MANAGER closes, records CSAT

## SLA Tracking
- SLA rules in handoff_map: sla_hours defines expected time for each transition
- SLA status: ON_TIME (within SLA), AT_RISK (>75% elapsed), BREACHED (overdue)
- api_handoffs() returns handoff records with sla_status computed in real-time
- api_kpis() includes first_response_time, resolution_time, sla_compliance_rate metrics

## Child Rules
- SO(CONFIRMED,PARTIALLY_SHIPPED,SHIPPED,INVOICED,CLOSED) → TICKET (sales-linked tickets)

## Business Rules
1. TICKET created automatically when linked SO reaches key statuses
2. Auto-assignment rule: CS_MANAGER configures assignment by ticket category
3. CSAT score recorded at CLOSED transition (1-5 rating stored in doc header data)
4. SLA breach triggers notification via email_outbox table
5. Escalation: breached tickets auto-escalate to CS_MANAGER via notification

## API Functions
- Write: `api_create_document('TICKET', ...)`, `api_transition(doc_id, action, ...)`
- Read: `api_list_documents(p_module='customer-service')`, `api_get_document(doc_id)`, `api_handoffs()`, `api_kpis()`

## Roles
- CS_AGENT: CREATE TICKET; execute IN_PROGRESS/WAITING_CUSTOMER/RESOLVED (OWN assigned)
- CS_MANAGER: ASSIGN/REASSIGN/CLOSE TICKET (BRANCH)
- SALES_STAFF: CREATE TICKET linked to SO (OWN)
- CEO/CFO: VIEW all tickets (COMPANY)
