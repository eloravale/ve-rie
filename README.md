VÉRIA — Revenue Recovery for HVAC
=================================

VÉRIA helps HVAC companies recover revenue from qualified leads they are
currently losing.

Quick start (no Cloudflare account required)
--------------------------------------------

    npm install
    npm run dev

  -> App  http://localhost:5173
  -> API  http://127.0.0.1:8787  (proxied automatically)

The local API server (`server.mjs`) runs the exact same Worker code on Node's
built-in SQLite (`node:sqlite`) with the same migrations and parameterized
queries — identical behavior, zero secrets, zero cloud account. Requires
Node >= 22.5.

Single-server mode (one URL, phone-friendly)
--------------------------------------------

    npm run build
    npm start          # serves API + built app together on :8787

Commands
--------

    npm run dev          API + web dev server with hot reload
    npm run build        typecheck + worker bundle + web build
    npm test             vitest unit tests
    npm run typecheck    tsc --noEmit
    npm run lint         eslint

Cloudflare Workers deployment (production path)
-----------------------------------------------

The same code deploys to Cloudflare with D1:

    npx wrangler d1 create veria-db        # once; paste the id into wrangler.toml
    npx wrangler d1 migrations apply veria-db --remote
    npm run deploy                         # builds and deploys the Worker

`wrangler.toml` ships with a placeholder database_id and the real D1 binding
(`DB`) plus static assets (`ASSETS`, SPA fallback enabled).

Demo data
---------

The database seeds a fictional company — **Cedar Ridge Heating & Cooling**
(Tulsa, OK) — with realistic leads, missed calls, estimates, follow-ups,
reactivation opportunities, owner tasks, and audit events. All data is
simulated. Demo Mode (in-app) can reset the environment to pristine state at
any time via `POST /api/demo/reset`.

Recovered revenue is tracked in a **canonical revenue ledger** (`revenue_events`)
with an explicit value basis on every row — assumed demo history is labelled
assumed, owner-recorded outcomes are labelled recorded (see
[docs/ADR-001-canonical-revenue-ledger.md](docs/ADR-001-canonical-revenue-ledger.md)).
The seeded workspace is a **sync fixed point**: running opportunity sync on a
fresh reset creates exactly zero new opportunities.

Workspace safety & configuration
--------------------------------

- Each workspace records its kind (`demo` / `prospect` / `customer`, see
  `GET /api/workspace`). Demo reset is **refused with HTTP 409** on non-demo
  workspaces — customer data can never be wiped by a demo reset.
- `POST /api/demo/reset` and `POST /api/data/delete` require the admin token
  (header `x-admin-token`) whenever `VERIA_ADMIN_TOKEN` is configured, or when
  `VERIA_PROTECTED_MODE=1` (fail-closed).
- CORS is allowlist-based: localhost dev origins work out of the box; set
  `VERIA_ALLOWED_ORIGINS=https://app.yourdomain.com` in production.
- Secrets live in the environment (`VERIA_ADMIN_TOKEN`) — never in the repo.

Docs
----

- docs/SALES_DEMO.md — founder's demo script and objection handling
- docs/MVP_SCOPE.md — what VÉRIA does, simulates, and does not do yet
- docs/NEXT_PHASES.md — post-validation roadmap
- docs/ADR-001-canonical-revenue-ledger.md — why every recovered dollar has one ledger row and an explicit value basis
