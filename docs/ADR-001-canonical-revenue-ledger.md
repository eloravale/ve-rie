# ADR-001: Canonical Revenue Ledger

- **Status:** Accepted
- **Date:** 2026-10-02
- **Phase:** Phase 0 — Foundation + Truth
- **Deciders:** VÉRIA engineering (Phase 0)

## Context

Before Phase 0, "recovered revenue" was computed independently in three places
with three overlapping-but-different definitions:

| Surface | Rule | Figure on the demo seed |
|---|---|---|
| Dashboard | sum of `estimated_value` where `leads.status = 'won'` | **$22,800** |
| Recovery pipeline impact | sum of `recovery_opportunities.recovered_value` where `stage = 'recovered'` | **$22,400** |
| Missed-call counters | sum of `estimated_value` where `missed_calls.recovered = 1` | **$20,800** |

The three numbers disagreed because they were answers to three different
questions: the dashboard counted **routine wins** (Steve Duffy's $5,200 service
agreement was never a recovery) and missed one recovery that had no won lead
(Carl Jensen's $4,800 missed-call recovery); the pipeline counted only
opportunity-stage recoveries; the missed-call counter measured a narrower source
class. Every number was defensible alone — and mutually inconsistent in the
same room. For a product whose core promise is *economic truth about recovery*,
that is a defect, not a nuance.

Additionally, opportunity sync was only app-level idempotent: a retried sync
could create duplicate opportunities; double representation existed inside the
seed itself (Ellen Wiggins appeared as both a handoff opportunity, rop_8014, and
a quote opportunity, rop_8015 for the same job); and nothing distinguished
*proven money* from *money we assumed from an estimate*.

## Decision

1. **One ledger.** `revenue_events` is the single authoritative record of
   economic recovery events. Recovered revenue is *defined* as
   `SUM(value) WHERE kind = 'recovered'`. No other module may compute a
   recovered headline from leads or missed_calls. Dashboard and pipeline impact
   both derive from `ledgerRecoveredSummary()`.

2. **One economic event = one row, forever.** Every recovery write carries a
   deterministic `event_key` (default `rev_<companyId>:<opportunityId>:recovered`)
   under a UNIQUE constraint. Retried or raced writes are idempotent no-ops —
   the second write can never create a second dollar.

3. **Every number carries its epistemic basis** (`value_basis`):
   - `opportunity` — potential value, not money
   - `recorded` — value recorded by the owner or source data (proven)
   - `assumed` — defaulted from an estimated value (NOT proven money)
   - `analytical` — model/rate-derived estimate

   Historical seed recoveries cannot prove cash changed hands, so they are
   seeded `assumed`. The dashboard discloses the split
   ("$X recorded · $Y assumed") instead of claiming "recorded outcomes only".

4. **Honest write rules.** `advanceOpportunity(..., stage: 'recovered')` writes
   the ledger with basis `recorded` when the owner supplies the actual amount,
   `assumed` when the value defaults from the estimate. Completing a follow-up
   with `outcome: 'recovered'` records basis `recorded` (explicitly recorded
   outcome). Sending messages or progressing stages never writes money.

5. **Deterministic opportunity identity.** `identity_key` =
   `source_type:source_id`, falling back to `source_type:cust:<lower(trim(name))>`
   for owner-created rows. A partial UNIQUE index over *open* stages makes sync
   idempotent at the database level while still allowing a lost/recovered
   problem to be legitimately re-identified later.

6. **The seed is a sync fixed point.** Migration 0006 materializes exactly the
   opportunities sync would derive (verified empirically: first sync creates 0),
   deletes the double-represented handoff row (rop_8014), and seeds the three
   assumed historical ledger events. `resetDemo` replays 0006, so a reset
   workspace is byte-equivalent to a freshly-migrated one.

## Consequences

**Positive**
- One number, one definition, everywhere — the sales conversation can no longer
  be undermined by "your other screen said $22,800".
- Auditability: every recovered dollar has provenance (actor, outcome, evidence,
  basis, timestamp).
- Retries, double-clicks, and races cannot corrupt the money.
- Assumed history is honestly labelled, which is the product's own sales pitch
  applied to itself.

**Negative / accepted costs**
- The dashboard headline changed from $22,800 → $22,400 (the routine win Steve
  Duffy is no longer counted as recovery; Carl Jensen's recovery is now counted
  — net −$400). Existing material referencing the old figure was updated.
- Historical demo recoveries are basis `assumed` until a real recording flow
  asserts otherwise; the headline is therefore labelled, not certified.
- One more table, one more migration, and a rule that new money surfaces must
  go through the ledger (enforced by convention and review; see
  "enforcement" below).

## Enforcement

- `tests/phase0.test.ts` asserts dashboard and impact equal
  `ledgerRecoveredSummary` and that retried writes do not duplicate rows.
- `LedgerIntegrityError` (HTTP 409) surfaces integrity faults instead of
  swallowing them; `recordLedgerEvent()` rejects `kind: 'recovered'` so
  recoveries cannot bypass `recordRecovered()`.
- Future code review rule: any new "recovered" figure must derive from
  `ledgerRecoveredSummary()` or cite this ADR with a reason.
