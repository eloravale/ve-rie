-- Phase 0 (Foundation + Truth) — canonical revenue ledger + deterministic identity.
-- ADDITIVE ONLY: no existing table is dropped or rewritten; no existing column is removed.
-- Compatible with SQLite (node:sqlite) and Cloudflare D1.

-- ---------------------------------------------------------------------------
-- 1) CANONICAL REVENUE LEDGER
-- Append-only economic event log. "Recovered revenue" is defined EXCLUSIVELY
-- as the sum of revenue_events rows with kind = 'recovered'.
-- value_basis makes the epistemic state of every number explicit:
--   opportunity — potential value, not money
--   recorded    — value recorded by the owner/source data
--   assumed     — defaulted from an estimated value (NOT proven money)
--   analytical  — model/rate-derived estimate
-- ---------------------------------------------------------------------------

CREATE TABLE revenue_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  opportunity_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('identified','actioned','booked','recovered','recorded','verified','adjusted')),
  value REAL NOT NULL DEFAULT 0,
  value_basis TEXT NOT NULL CHECK (value_basis IN ('opportunity','recorded','assumed','analytical')),
  outcome_type TEXT,
  actor TEXT NOT NULL DEFAULT 'veria',
  event_key TEXT NOT NULL UNIQUE,
  evidence_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_revenue_events_company_opportunity ON revenue_events(company_id, opportunity_id);
CREATE INDEX idx_revenue_events_company_kind ON revenue_events(company_id, kind, created_at);

-- ---------------------------------------------------------------------------
-- 2) DETERMINISTIC OPPORTUNITY IDENTITY
-- identity_key = "<source_type>:<source_id>" when the opportunity points at a
-- concrete source row, otherwise "<source_type>:cust:<normalized customer name>".
-- The unique index makes opportunity sync idempotent at the DATABASE level:
-- a retried sync can never create a second opportunity for the same identity.
-- ---------------------------------------------------------------------------

ALTER TABLE recovery_opportunities ADD COLUMN identity_key TEXT;

-- Backfill existing rows with exactly the same deterministic rule the sync
-- uses (src/worker/pipeline.ts identityKeyFor). Seeded rows all carry a
-- source_id except rop_8014 (handoff), which falls back to customer identity.
UPDATE recovery_opportunities
SET identity_key = CASE
  WHEN source_id IS NOT NULL THEN source_type || ':' || source_id
  ELSE source_type || ':cust:' || LOWER(TRIM(customer_name))
END
WHERE identity_key IS NULL;

-- Unique among OPEN opportunities only. Sync skips source rows already
-- represented by an open opportunity, but a closed (lost/recovered) problem
-- may legitimately be re-identified later under the same identity.
CREATE UNIQUE INDEX idx_ro_identity ON recovery_opportunities(identity_key)
  WHERE identity_key IS NOT NULL AND stage NOT IN ('recovered','lost');

-- ---------------------------------------------------------------------------
-- 3) WORKSPACE SEPARATION
-- One workspace per database in Phase 0. kind records what the data IS so
-- destructive demo operations can refuse to touch non-demo data.
-- ---------------------------------------------------------------------------

ALTER TABLE company_settings ADD COLUMN workspace_kind TEXT NOT NULL DEFAULT 'demo'
  CHECK (workspace_kind IN ('demo','prospect','customer'));

-- ---------------------------------------------------------------------------
-- 4) HISTORICAL CANONICAL LEDGER EVENTS
-- Seeded in migration 0006 (which resetDemo also replays), so that a demo
-- reset restores the same ledger as a fresh migration run: three 'recovered'
-- rows with value_basis='assumed' (see 0006 for the rationale).
