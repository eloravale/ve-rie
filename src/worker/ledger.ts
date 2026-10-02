/**
 * VÉRIA canonical revenue ledger — Phase 0 (Foundation + Truth).
 *
 * The ledger is the ONE authoritative record of economic recovery events.
 * "Recovered revenue" is defined exclusively as the sum of revenue_events
 * rows with kind = 'recovered'. No other module may compute a recovered
 * headline from leads or missed_calls.
 *
 * Principles:
 *  - ONE economic recovery event = ONE ledger row, forever (event_key UNIQUE).
 *  - Every number carries its epistemic basis (value_basis): opportunity /
 *    recorded / assumed / analytical. Assumed money is never presented as
 *    recorded money.
 *  - Writes are idempotent via deterministic event_key + INSERT OR IGNORE.
 *  - Integrity failures are surfaced, never silently swallowed.
 */

import { COMPANY_ID, newId, nowIso, type Database } from "./db"

export const LEDGER_KINDS = ["identified", "actioned", "booked", "recovered", "recorded", "verified", "adjusted"] as const
export type LedgerKind = (typeof LEDGER_KINDS)[number]

export const LEDGER_VALUE_BASES = ["opportunity", "recorded", "assumed", "analytical"] as const
export type LedgerValueBasis = (typeof LEDGER_VALUE_BASES)[number]

/** Deterministic per-opportunity recovery-event key: a retried write can never double-write. */
export function recoveryEventKey(companyId: string, opportunityId: string): string {
  return `rev_${companyId}:${opportunityId}:recovered`
}

export class LedgerIntegrityError extends Error {
  status = 409
  constructor(message: string) {
    super(message)
    this.name = "LedgerIntegrityError"
  }
}

/** Count recovered ledger rows for one opportunity (integrity check before writing). */
async function countRecoveredForOpportunity(db: Database, opportunityId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM revenue_events WHERE company_id = ?1 AND opportunity_id = ?2 AND kind = 'recovered'`)
    .bind(COMPANY_ID, opportunityId)
    .first<{ n: number }>()
  return Number(row?.n ?? 0)
}

export interface RecordRecoveredInput {
  /** Opportunity this recovery belongs to. Recoveries without one (e.g. a
   *  completed follow-up) pass null and MUST supply an explicit eventKey. */
  opportunityId: string | null
  value: number
  valueBasis: LedgerValueBasis
  outcomeType: string
  actor?: string
  evidenceRef?: string | null
  /** Deterministic key override for opportunity-less recoveries.
   *  Defaults to recoveryEventKey(companyId, opportunityId). */
  eventKey?: string
}

export interface RecordRecoveredResult {
  created: boolean
  eventId: string | null
  basis: LedgerValueBasis
  value: number
}

/**
 * Record THE recovered-revenue event for an opportunity.
 * Idempotent: a retried call (same opportunity, kind=recovered) returns
 * created:false and never writes a second row — enforced by both an explicit
 * pre-check and the DB-level UNIQUE(event_key).
 */
export async function recordRecovered(
  db: Database,
  input: RecordRecoveredInput
): Promise<RecordRecoveredResult> {
  if (!Number.isFinite(input.value) || input.value < 0) {
    throw new LedgerIntegrityError(`Recovered value must be a non-negative finite number, got ${input.value}`)
  }
  if (!(LEDGER_VALUE_BASES as readonly string[]).includes(input.valueBasis)) {
    throw new LedgerIntegrityError(`Invalid value_basis: ${input.valueBasis}`)
  }

  const eventKey = input.eventKey ?? recoveryEventKey(COMPANY_ID, input.opportunityId ?? "unknown")

  // Pre-check only applies to opportunity-linked recoveries; opportunity-less
  // recoveries (explicit eventKey) rely on the UNIQUE(event_key) catch below.
  const existingCount = input.opportunityId ? await countRecoveredForOpportunity(db, input.opportunityId) : 0
  if (existingCount > 0) {
    const row = await db
      .prepare(
        `SELECT id, value, value_basis FROM revenue_events
         WHERE company_id = ?1 AND opportunity_id = ?2 AND kind = 'recovered'
         ORDER BY created_at ASC LIMIT 1`
      )
      .bind(COMPANY_ID, input.opportunityId)
      .first<{ id: string; value: number; value_basis: string }>()
    return {
      created: false,
      eventId: row?.id ?? null,
      basis: (row?.value_basis as LedgerValueBasis) ?? input.valueBasis,
      value: Number(row?.value ?? input.value)
    }
  }

  const id = newId("rev")
  try {
    await db
      .prepare(
        `INSERT INTO revenue_events (id, company_id, opportunity_id, kind, value, value_basis, outcome_type, actor, event_key, evidence_ref, created_at)
         VALUES (?1, ?2, ?3, 'recovered', ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      )
      .bind(
        id,
        COMPANY_ID,
        input.opportunityId,
        input.value,
        input.valueBasis,
        input.outcomeType,
        input.actor ?? "veria",
        eventKey,
        input.evidenceRef ?? null,
        nowIso()
      )
      .run()
  } catch (e) {
    // UNIQUE(event_key) violation = concurrent/retried write for the same
    // economic event. That is a benign idempotent no-op, not an error —
    // unless the pre-existing row is not a recovered event (integrity fault).
    const message = e instanceof Error ? e.message : String(e)
    if (/UNIQUE/i.test(message)) {
      const row = await db
        .prepare(`SELECT id, kind, value, value_basis FROM revenue_events WHERE event_key = ?1`)
        .bind(eventKey)
        .first<{ id: string; kind: string; value: number; value_basis: string }>()
      if (row && row.kind === "recovered") {
        return { created: false, eventId: row.id, basis: row.value_basis as LedgerValueBasis, value: Number(row.value) }
      }
      throw new LedgerIntegrityError(`Ledger integrity fault: event_key ${eventKey} exists with kind '${row?.kind ?? "unknown"}'`)
    }
    throw e
  }

  return { created: true, eventId: id, basis: input.valueBasis, value: input.value }
}

export interface LedgerRecoveredSummary {
  recovered_revenue: number
  recovered_events: number
  by_basis: { opportunity: number; recorded: number; assumed: number; analytical: number }
  /** Sum of rows whose basis is recorded — proven money only. */
  recorded_only: number
}

/**
 * THE canonical recovered-revenue figure. Every surface that claims to show
 * "actual recovered revenue" must derive from this function.
 */
export async function ledgerRecoveredSummary(db: Database): Promise<LedgerRecoveredSummary> {
  const res = await db
    .prepare(`SELECT value, value_basis FROM revenue_events WHERE company_id = ?1 AND kind = 'recovered'`)
    .bind(COMPANY_ID)
    .all<{ value: number; value_basis: string }>()
  const rows = res.results ?? []
  const byBasis = { opportunity: 0, recorded: 0, assumed: 0, analytical: 0 }
  let total = 0
  let recordedOnly = 0
  for (const r of rows) {
    const v = Number(r.value ?? 0)
    total += v
    if (r.value_basis in byBasis) byBasis[r.value_basis as keyof typeof byBasis] += v
    if (r.value_basis === "recorded" || r.value_basis === "verified") recordedOnly += v
  }
  return {
    recovered_revenue: Math.round(total * 100) / 100,
    recovered_events: rows.length,
    by_basis: byBasis,
    recorded_only: Math.round(recordedOnly * 100) / 100
  }
}

/**
 * Canonical ledger event for generic kinds (identified/actioned/booked/…).
 * kind 'recovered' must go through recordRecovered — enforced here.
 */
export async function recordLedgerEvent(
  db: Database,
  input: {
    kind: Exclude<LedgerKind, "recovered">
    opportunityId?: string | null
    value?: number
    valueBasis?: LedgerValueBasis
    outcomeType?: string | null
    actor?: string
    eventKey?: string
    evidenceRef?: string | null
  }
): Promise<{ created: boolean; eventId: string }> {
  if ((input.kind as LedgerKind) === "recovered") {
    throw new LedgerIntegrityError("kind 'recovered' must be written through recordRecovered()")
  }
  const id = newId("rev")
  const eventKey = input.eventKey ?? `rev_${COMPANY_ID}:${input.opportunityId ?? "system"}:${input.kind}:${id}`
  await db
    .prepare(
      `INSERT INTO revenue_events (id, company_id, opportunity_id, kind, value, value_basis, outcome_type, actor, event_key, evidence_ref, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    )
    .bind(
      id,
      COMPANY_ID,
      input.opportunityId ?? null,
      input.kind,
      input.value ?? 0,
      input.valueBasis ?? "opportunity",
      input.outcomeType ?? null,
      input.actor ?? "veria",
      eventKey,
      input.evidenceRef ?? null,
      nowIso()
    )
    .run()
  return { created: true, eventId: id }
}
