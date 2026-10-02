# VÉRIA — MVP Scope

Status: **SELLABLE DEMO MVP** — ready for customer demonstrations and a paid pilot/audit conversation. Not a production SaaS.

---

## What VÉRIA CAN DO NOW

### Lead management (complete, usable)
- Create, view, search, filter (status / source / urgency), sort, and paginate leads
- Lead detail with contact info, service, notes, value, and activity dates
- 9-status workflow: new → contacted → qualified → appointment_requested → appointment_booked → estimate_sent → won / lost / unqualified
- Estimated value, next action + due date on every lead
- Edit capability and status changes with reason capture (lost_reason, recovered_via)
- Every mutation writes an audit event (actor, action, detail, timestamp)

### Revenue recovery workflow (the core demo)
- Pipeline visualization on each lead (New → … → Won) with current stage
- **Revenue recovered** and **Revenue at risk** computed live from the data
- Follow-up system: schedule, complete, mark recovered (adds value to recovered revenue) or lost
- Missed-call recovery: unrecovered call → lead auto-created + owner call-back task → recovered counter
- Estimate tracking with auto-scheduled follow-ups when an estimate is recorded
- Dormant lead reactivation: scan (30+ days idle) → reactivation queue → outreach task
- **Owner Daily Brief**: today's ranked actions with dollar values
- **Lost-Revenue Radar**: missed calls, unanswered leads, idle estimates, dormant leads, appointment gaps, high-value stalls — each with value, urgency, and recommended action
- **Opportunity Score (0–100)**: deterministic, explainable rules (deal size, urgency, stage, recency, source) with the full breakdown shown on every lead

### Human handoff
- Owner task queue with priority, value, reason, recommended action
- Open / Complete / Dismiss lifecycle; tasks auto-created by recovery workflows

### Demo experience
- Realistic fictional HVAC company (Cedar Ridge Heating & Cooling, Tulsa OK): 26 leads, 6 customers, 7 missed calls, 4 estimates, 7 follow-ups, 4 reactivations, 4 owner tasks, audit history
- **Demo Mode**: guided 4-step sales walkthrough with live revenue-impact counters + one-tap reset to pristine data

### Platform
- TypeScript + React + Vite + Tailwind frontend; Cloudflare Worker + D1 backend
- Runs identically on Node (no cloud account) via the same Worker code on node:sqlite
- 102 passing tests (score engine, validation, full API workflow, Phase 0 truth/idempotency/guardrail suite)
- Mobile-responsive demo path (bottom nav, cards instead of tables, tappable targets)

### Phase 0 — Foundation & Truth (economic integrity layer)
- **Canonical revenue ledger** (`revenue_events`): one authoritative record of recovery
  events; every recovered-revenue figure in the product derives from it
  (see [ADR-001](ADR-001-canonical-revenue-ledger.md))
- **Value basis on every dollar**: `recorded` (owner/source-proven) vs `assumed`
  (defaulted from estimates) vs `opportunity`/`analytical` — disclosed on the dashboard;
  historical demo recoveries are honestly labelled `assumed`
- **Idempotent writes**: deterministic `event_key` per economic event — retries and
  double-submits can never create a second dollar
- **Deterministic opportunity identity** (`identity_key` + partial UNIQUE index): sync is
  idempotent at the database level; the seed is a sync fixed point (first sync creates 0)
- **Double-count elimination**: one open opportunity per underlying problem (handoff vs
  quote vs lead no longer counts the same job twice; ~$29k of phantom overlap removed)
- **Workspace separation**: `demo` / `prospect` / `customer` kinds; demo reset is
  refused with HTTP 409 on non-demo workspaces
- **Token-guarded destructive routes**: `POST /api/demo/reset` and `POST /api/data/delete`
  require `x-admin-token` when protected mode is on (`VERIA_ADMIN_TOKEN` or
  `VERIA_PROTECTED_MODE=1`, fail-closed)
- **CORS allowlist** via `VERIA_ALLOWED_ORIGINS` (localhost dev works by default)
- **Referential integrity**: `PRAGMA foreign_keys = ON` in the local server and all test harnesses
- **Atomic operations**: demo reset, CSV imports, and data deletion run in transactions —
  a failure rolls back cleanly, never half-writes
- **CSV import duplicate detection**: per-kind rules (name+phone, phone+date,
  customer+amount+date); duplicates are skipped and reported, never imported twice

---

## What VÉRIA SIMULATES (labeled in-product)

- The demo company and all names/numbers (clearly fictional, Tulsa 555 numbers)
- Missed-call capture — calls are seeded data, no phone line connected
- "Call placed", "estimate delivered", "outreach sent" — recorded as workflow state + audit events only; nothing is sent to anyone
- Estimates (amount + status only, no document generation)

## What VÉRIA DOES NOT YET DO

- Receive real phone calls or send real SMS/email
- Ingest leads from real websites, ad accounts, or CRM systems
- Two-way AI conversations with customers
- Multi-tenant accounts, user logins, or role permissions (single shared demo environment — treat all data as demo data)
- Billing/payments
- Production hardening: rate limiting, backups/DR, monitoring/alerting, PII policy
- Automated deployment pipeline (one manual command — below)

---

## Environment & deployment

- **Dev/demo anywhere (incl. Freebuff Cloud):** `npm install && npm run build && npm start` → serves API + app on one port (default 8787). No secrets, no Cloudflare account. `VERIA_RESET=1 npm start` for a fresh database.
- **Cloudflare production:** create D1 (`npx wrangler d1 create veria-db` → paste id into `wrangler.toml`), `npx wrangler d1 migrations apply veria-db --remote`, `npm run deploy`. This is the one documented manual step; it requires a one-time `wrangler login`.
- No secrets are hardcoded; no local-only dependencies exist. The demo database can always be recreated from migrations + seed.

## Known demo limitations (by design)

- Single company, single user, no auth — acceptable because every screen says "Demo data" and reset restores state
- Long-lived demo drift (statuses changed during demos) — solved by Demo Mode reset
- `wrangler.toml` database_id is a placeholder until the one-time Cloudflare setup is run
