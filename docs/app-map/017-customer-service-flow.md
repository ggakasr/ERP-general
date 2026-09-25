---
covers: supabase/migrations/003_config.sql, supabase/migrations/041_cskh_bot.sql, supabase/migrations/042_cskh_tools.sql, supabase/migrations/043_cskh_console.sql, supabase/migrations/044_cskh_stats.sql, src/app/(app)/customer-service/**, src/lib/cskh/**, src/app/api/cskh/**
last_verified: 2026-09-25
ttl_days: 30
---

# 017 — Customer Service Flow (L9) + AI CSKH Bot (Nhóm K)

## Overview

Customer service module has two layers:
1. **Ticket management** — TICKET doc type with state machine, SLA, CSAT (original L9)
2. **AI CSKH bot** — integrated chat/voice bot for customers (WP-K1..K7, replacing old FastAPI app)

## Ticket Management (L9)

### Document Types & State Machines
- **TICKET**: OPEN → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → RESOLVED → CLOSED
- OPEN: created by customer, sales staff, bot (handoff), or auto from SO
- RESOLVED requires `resolution_provided` condition
- RESOLVED → IN_PROGRESS: reopen if not accepted
- RESOLVED → CLOSED: CS_MANAGER closes, records CSAT

### SLA Tracking
- Rules in `handoff_map`: `sla_hours` per transition
- SLA status: ON_TIME / AT_RISK (>75%) / BREACHED
- `api_handoffs()` returns real-time SLA status
- Breach triggers notification via `fn_notify` → `email_outbox`

### Child Rules
- SO(CONFIRMED,PARTIALLY_SHIPPED,SHIPPED,INVOICED,CLOSED) → TICKET

## AI CSKH Bot (Nhóm K)

### Architecture
```
Khách (Portal/landing) ──► /api/cskh/chat ──► agent.ts ──► LLM adapter ──► Claude/OpenAI/Mock
                                    │
                                    ▼
                            PostgreSQL api_cskh_*
                            (session, message, tool functions)
```

### Key Constraints
- Bot serves **customers only** (Portal + public pages). Not an internal assistant.
- Bot actor: `system-cskh-bot@erp.local` (CS_AGENT role per tenant)
- Bot can: read public order fields, create TICKET on handoff
- Bot **cannot**: call SUBMIT/APPROVE/POST or any financial transition
- Sensitive data (phone, address, amount) only returned when verified (R2)
- Knowledge base (KB_ARTICLE) requires SoD: author ≠ publisher
- All tables have `tenant_id` + RLS

### Database (migrations)
- `041_cskh_bot.sql` — 4 tables: `cskh_bot_config`, `cskh_sessions`, `cskh_messages`, `cskh_usage`; KB_ARTICLE doc type; 5 `api_cskh_*` functions (config_get, config_set, list_kb, bot_config, seed)
- `042_cskh_tools.sql` — bot system user; 9 tool/session functions (tra_don, xac_thuc, tra_faq, handoff, start_session, add_message, update_session, record_usage, session_load)
- `043_cskh_console.sql` — 6 staff console functions (staff_sessions, staff_claim, staff_reply, return_to_bot, staff_close, staff_transcript)
- `044_cskh_stats.sql` — dashboard stats RPC `api_cskh_stats(from, to)` + 3 KPI entries (CUS-003..005)

### Source Files

**Backend (Next.js API routes)**:
- `src/app/api/cskh/chat/route.ts` — main chat endpoint (widget_key → tenant lookup, rate limit 10/min)
- `src/app/api/cskh/poll/route.ts` — long-poll for staff replies
- `src/app/api/cskh/csat/route.ts` — CSAT rating submission
- `src/app/api/cskh/widget-key/route.ts` — get widget key (authenticated)
- `src/app/api/cskh/widget-key-public/route.ts` — resolve widget key to tenant
- `src/app/api/cskh/voice/start/route.ts` — start voice session
- `src/app/api/cskh/voice/turn/route.ts` — voice turn (STT → agent → TTS)
- `src/app/api/cskh/voice/end/route.ts` — close voice session
- `src/app/api/cskh/vapi/route.ts` — Vapi webhook (x-vapi-secret check)

**Agent & LLM**:
- `src/lib/cskh/agent.ts` — 3-round tool-use loop, system prompt with rails
- `src/lib/cskh/tools.ts` — 4 tools: tra_cuu_don_hang, xac_thuc_khach, tra_cuu_faq, de_xuat_handoff
- `src/lib/cskh/rails.ts` — SafetyRails R1-R4 (scope, no-fabricate, sensitive gate, no financial)
- `src/lib/cskh/types.ts` — shared types
- `src/lib/cskh/llm/index.ts` — factory `createLLM(provider, env)`
- `src/lib/cskh/llm/claude.ts` — Anthropic adapter
- `src/lib/cskh/llm/openai-compat.ts` — OpenAI-compatible adapter (DeepSeek, Gemini, OpenAI)
- `src/lib/cskh/llm/mock.ts` — deterministic mock (keyword-based responses)

**Voice**:
- `src/lib/cskh/voice/stt.ts` — STT interface + MockSTT + DeepgramSTT
- `src/lib/cskh/voice/tts.ts` — TTS interface + MockTTS + OpenAITTS + ElevenLabsTTS
- `src/lib/cskh/voice/telephony.ts` — Telephony interface + MockTelephony + VapiTelephony

**Frontend**:
- `src/components/cskh/chat-bubble.tsx` — customer-facing chat bubble (Portal/landing)
- `src/components/cskh/public-chat.tsx` — wrapper for server pages
- `src/app/(app)/customer-service/bot/page.tsx` — staff console (Inbox/KB/Config/Overview tabs)

### API Functions (PostgreSQL)
| Function | Purpose | Access |
|---|---|---|
| `api_cskh_start_session` | Create new chat/voice session | service_role (via API route) |
| `api_cskh_add_message` | Store message | service_role |
| `api_cskh_update_session` | Update status/verified_orders/csat | service_role |
| `api_cskh_record_usage` | Record LLM token usage + cost | service_role |
| `api_cskh_session_load` | Load session with message history | service_role |
| `api_cskh_tra_don` | Lookup order (R2: sensitive gated) | service_role |
| `api_cskh_xac_thuc` | Verify customer (order + phone match) | service_role |
| `api_cskh_tra_faq` | Search published KB articles | service_role |
| `api_cskh_handoff` | Create TICKET, set awaiting_human | service_role |
| `api_cskh_staff_sessions` | List sessions for CS staff | authenticated (CS_AGENT/CS_MANAGER) |
| `api_cskh_staff_claim` | Claim/assign session | authenticated (CS_AGENT/CS_MANAGER) |
| `api_cskh_staff_reply` | Send staff reply + audit trail | authenticated (CS_AGENT/CS_MANAGER) |
| `api_cskh_return_to_bot` | Return session to bot | authenticated (CS_AGENT/CS_MANAGER) |
| `api_cskh_staff_close` | Close session | authenticated (CS_AGENT/CS_MANAGER) |
| `api_cskh_staff_transcript` | Full transcript for session | authenticated (CS_AGENT/CS_MANAGER) |
| `api_cskh_stats` | Dashboard stats (10 metrics) | authenticated (CS_AGENT/CS_MANAGER/CEO/CFO/COO) |
| `api_cskh_config_get` | Get bot config | authenticated (CS_MANAGER) |
| `api_cskh_config_set` | Update bot config | authenticated (CS_MANAGER) |

### Roles
- **CS_AGENT**: handle sessions, reply, create TICKET via bot; see stats (no cost)
- **CS_MANAGER**: all CS_AGENT + manage KB, config, see cost stats, assign/reassign sessions
- **CEO/CFO/COO**: view stats including cost
- **PORTAL_CUSTOMER**: use chat bubble, rate CSAT

### Tests (T25.x)
- T25.1: KB_ARTICLE SoD (author ≠ publisher)
- T25.2: tenant isolation (session, messages, config)
- T25.3: config audit trail
- T25.4: R2 sensitive data gating (verified vs unverified)
- T25.5: not_found returns error, no fabrication
- T25.6: handoff creates TICKET
- T25.7: bot cannot call APPROVE
- T25.8: portal customer scope (B cannot see A's orders)
- T25.9: CS_AGENT claim scope
- T25.10: staff reply + audit trail
- T25.11: config restricted to CS_MANAGER
- T25.12: dashboard stats accuracy + cost visibility
- T25.13: voice session transcript
- T25.14: voice_enabled config flag toggle

### Dependencies
- L1: master-data (partners for order lookup)
- L4: controls (SoD for KB_ARTICLE, audit trail)
- WP-D1: multi-tenant (tenant_id on all CSKH tables)
- WP-F3: portal (chat bubble on portal pages)

### Documentation
- `docs/cskh-bot-huong-dan.md` — demo guide (Part A) + production setup (Part B)
- `docs/demo-guide.md` — references CSKH bot demo scenario
