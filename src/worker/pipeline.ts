/**
 * Revenue Recovery engine — the honest core of VÉRIA.
 *
 * Principles baked into this module:
 *  - OPPORTUNITY ≠ REVENUE. Every surface labels identified value as
 *    "identified recovery opportunity", never as money lost or earned.
 *  - RECOVERED is only ever counted from an explicitly recorded outcome
 *    (appointment booked, quote accepted, customer reactivated). Sending a
 *    message or creating a task NEVER counts as recovery.
 *  - Everything is deterministic and explainable — no black boxes.
 */

import { COMPANY_ID, newId, nowIso, type Database } from "./db"
import { audit } from "./audit"
import { ValidationError } from "./validation"
import { money } from "./region"
import { classifyJobType } from "./jobTypes"

export const DAY = 86_400_000

export function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * DAY)
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace("T", " ").replace("Z", "")
}

export function tsToMs(ts: string | null | undefined): number {
  if (!ts) return 0
  const t = Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z")
  return Number.isNaN(t) ? 0 : t
}

export function daysBetween(fromTs: string | null | undefined, now: number): number {
  if (!fromTs) return 0
  return Math.max(0, Math.floor((now - tsToMs(fromTs)) / DAY))
}

// =====================================================================
// PIPELINE — stages + honest transitions
// =====================================================================

export const STAGE_ORDER = [
  "identified",
  "contacted",
  "responded",
  "qualified",
  "booked",
  "recovered",
  "lost"
] as const

export type Stage = (typeof STAGE_ORDER)[number]

/** Outcome types that genuinely count as recovered revenue. */
export const RECOVERY_OUTCOMES = ["appointment_booked", "quote_accepted", "customer_reactivated", "revenue_recorded"] as const

const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  identified: ["contacted", "lost"],
  contacted: ["responded", "lost"],
  responded: ["qualified", "lost"],
  qualified: ["booked", "lost"],
  booked: ["recovered", "lost"],
  recovered: [],
  lost: ["identified"]
}

export function canTransition(from: Stage, to: Stage): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}

function isRecoveryOutcome(outcome: string | null | undefined): boolean {
  return !!outcome && (RECOVERY_OUTCOMES as readonly string[]).includes(outcome)
}

// =====================================================================
// RESPONSE HEALTH — measured from the customer's actual enquiry data
// =====================================================================

export interface ResponseHealth {
  total: number
  responded: number
  no_response: number
  buckets: { key: "lt5" | "5to30" | "30to120" | "over120" | "none"; label: string; count: number }[]
  median_minutes: number | null
}

export function computeResponseHealth(
  enquiries: { response_minutes: number | null; first_response_at: string | null }[]
): ResponseHealth {
  const buckets = { lt5: 0, "5to30": 0, "30to120": 0, over120: 0, none: 0 }
  const times: number[] = []
  for (const e of enquiries) {
    if (e.response_minutes === null || e.response_minutes === undefined) {
      buckets.none++
      continue
    }
    const m = e.response_minutes
    times.push(m)
    if (m < 5) buckets.lt5++
    else if (m < 30) buckets["5to30"]++
    else if (m < 120) buckets["30to120"]++
    else buckets.over120++
  }
  times.sort((a, b) => a - b)
  const median = times.length
    ? times.length % 2 === 1
      ? times[(times.length - 1) / 2]
      : (times[times.length / 2 - 1] + times[times.length / 2]) / 2
    : null
  return {
    total: enquiries.length,
    responded: times.length,
    no_response: buckets.none,
    buckets: [
      { key: "lt5", label: "Under 5 min", count: buckets.lt5 },
      { key: "5to30", label: "5–30 min", count: buckets["5to30"] },
      { key: "30to120", label: "30–120 min", count: buckets["30to120"] },
      { key: "over120", label: "2+ hours", count: buckets.over120 },
      { key: "none", label: "No response", count: buckets.none }
    ],
    median_minutes: median
  }
}

// =====================================================================
// OPPORTUNITY SYNC — materialize the unified pipeline from live data
// =====================================================================

interface OpportunityRow {
  id: string
  source_type: string
  source_id: string | null
  lead_id: string | null
  customer_name: string
  job_type: string | null
  category: string
  title: string
  why: string
  recommended_action: string
  estimated_value: number
  stage: Stage
  priority: "low" | "medium" | "high"
  owner: string | null
  age_days: number
  last_event_at: string | null
  outcome_type?: string | null
  recovered_value?: number | null
  created_at: string
  updated_at: string
}

const SELECT_RO = `id, source_type, source_id, lead_id, customer_name, job_type, category, title, why,
  recommended_action, estimated_value, stage, priority, owner, age_days, last_event_at,
  outcome_type, recovered_value, created_at, updated_at`

async function listOpportunities(db: Database): Promise<OpportunityRow[]> {
  const res = await db
    .prepare(`SELECT ${SELECT_RO} FROM recovery_opportunities WHERE company_id = ?1`)
    .bind(COMPANY_ID)
    .all<OpportunityRow>()
  return (res.results ?? []) as OpportunityRow[]
}

const CATEGORY_BY_SOURCE: Record<string, string> = {
  missed_call: "Missed enquiries",
  slow_response: "Slow responses",
  unworked_lead: "Unworked leads",
  quote: "Unfollowed quotes",
  dormant_customer: "Dormant customers",
  booking_failure: "Booking failures",
  handoff: "Human handoffs waiting"
}

/**
 * Materialize today's leakage into recovery_opportunities.
 * Idempotent: skips source rows already represented by an OPEN opportunity.
 * Never touches manually advanced or closed opportunities.
 */
export async function syncOpportunities(db: Database): Promise<{ created: number }> {
  const now = Date.now()
  const nowStr = nowIso()
  const existing = await listOpportunities(db)
  const openBySource = new Map<string, OpportunityRow>()
  for (const o of existing) {
    if (o.stage !== "recovered" && o.stage !== "lost" && o.source_id) {
      openBySource.set(`${o.source_type}:${o.source_id}`, o)
    }
  }
  let created = 0

  // ---- double-count prevention (spec: opportunity identity) ----
  // A missed call that auto-created a lead must not surface twice (once as a
  // missed-call opportunity, once as an unworked-lead opportunity). Match by
  // normalized phone digits across open opportunities.
  const normalizePhone = (p: unknown): string => {
    const d = String(p ?? "").replace(/\D/g, "")
    return d.length >= 7 ? d.slice(-10) : ""
  }
  const openMissedCallIds = [...openBySource.keys()]
    .filter((k) => k.startsWith("missed_call:"))
    .map((k) => k.split(":")[1])
  const missedPhoneSet = new Set<string>()
  if (openMissedCallIds.length > 0) {
    const placeholders = openMissedCallIds.map((_, i) => `?${i + 2}`).join(",")
    const phRes = await db
      .prepare(`SELECT caller_phone FROM missed_calls WHERE company_id = ?1 AND id IN (${placeholders})`)
      .bind(COMPANY_ID, ...openMissedCallIds)
      .all<{ caller_phone: string | null }>()
    for (const r of phRes.results ?? []) {
      const p = normalizePhone(r.caller_phone)
      if (p) missedPhoneSet.add(p)
    }
  }

  const insert = async (o: Omit<OpportunityRow, "id" | "created_at" | "updated_at">): Promise<void> => {
    const id = newId("rop")
    await db
      .prepare(
        `INSERT INTO recovery_opportunities (id, company_id, source_type, source_id, lead_id, customer_name, job_type,
          category, title, why, recommended_action, estimated_value, stage, priority, owner, age_days, last_event_at,
          created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?18)`
      )
      .bind(
        id, COMPANY_ID, o.source_type, o.source_id, o.lead_id, o.customer_name, o.job_type, o.category, o.title,
        o.why, o.recommended_action, o.estimated_value, o.stage, o.priority, o.owner, o.age_days, o.last_event_at, nowStr
      )
      .run()
    created++
    await audit(db, {
      entityType: "recovery_opportunity",
      entityId: id,
      action: "opportunity_identified",
      detail: `${o.category}: ${o.title} — ${money(o.estimated_value)} identified recovery opportunity.`
    })
  }

  // 1) Missed enquiries — unrecovered missed calls
  const mcRes = await db
    .prepare(`SELECT id, caller_name, caller_phone, called_at, estimated_value, notes FROM missed_calls WHERE company_id = ?1 AND recovered = 0`)
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  for (const mc of mcRes.results ?? []) {
    const sid = `missed_call:${String(mc.id)}`
    if (openBySource.has(sid)) continue
    const age = daysBetween(String(mc.called_at), now)
    const name = String(mc.caller_name ?? mc.caller_phone ?? "Unknown caller")
    await insert({
      source_type: "missed_call",
      source_id: String(mc.id),
      lead_id: null,
      customer_name: name,
      job_type: classifyJobType(String(mc.notes ?? "")),
      category: CATEGORY_BY_SOURCE.missed_call,
      title: `Missed call — ${name}`,
      why: `Called ${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`} and nobody was able to answer. High-intent customers like this usually call the next company within hours.`,
      recommended_action: `Call ${name} back today and qualify the request.`,
      estimated_value: Number(mc.estimated_value ?? 0),
      stage: "identified",
      priority: age >= 2 ? "high" : "medium",
      owner: "owner",
      age_days: age,
      last_event_at: String(mc.called_at)
    })
  }

  // 2) Unfollowed quotes — open estimates with no recorded follow-up activity
  const estRes = await db
    .prepare(
      `SELECT e.id, e.amount, e.sent_at, e.quote_status, e.last_contact_at, l.id AS lead_id, l.name, l.service
       FROM estimates e JOIN leads l ON l.id = e.lead_id
       WHERE e.company_id = ?1 AND e.quote_status IN ('sent','followup_due','no_response')`
    )
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  for (const e of estRes.results ?? []) {
    const sid = `quote:${String(e.id)}`
    if (openBySource.has(sid)) continue
    const age = daysBetween(e.last_contact_at ? String(e.last_contact_at) : String(e.sent_at), now)
    const amount = Number(e.amount ?? 0)
    const name = String(e.name)
    const status = String(e.quote_status)
    const why =
      status === "no_response"
        ? `Quote sent, customer never replied, and no follow-up is recorded. The quote is worth ${money(amount)} and the customer has not been marked lost.`
        : `Quote sent ${age} day${age === 1 ? "" : "s"} ago. No recorded follow-up since. Quote value: ${money(amount)}. Customer has not been marked lost.`
    await insert({
      source_type: "quote",
      source_id: String(e.id),
      lead_id: e.lead_id ? String(e.lead_id) : null,
      customer_name: name,
      job_type: classifyJobType(String(e.service ?? "")),
      category: CATEGORY_BY_SOURCE.quote,
      title: `${money(amount)} quote — ${status === "no_response" ? "no response" : "follow-up due"}`,
      why,
      recommended_action: `Follow up with ${name} today — confirm receipt, answer questions, offer a specific next step.`,
      estimated_value: amount,
      stage: "identified",
      priority: age >= 7 ? "high" : "medium",
      owner: "office",
      age_days: age,
      last_event_at: e.last_contact_at ? String(e.last_contact_at) : String(e.sent_at)
    })
  }

  // 3) Slow responses — enquiries that waited too long for a first response
  const enqRes = await db
    .prepare(
      `SELECT id, lead_id, contact_name, contact_phone, channel, received_at, first_response_at, response_minutes, urgency, estimated_value
       FROM enquiries WHERE company_id = ?1 AND response_minutes IS NOT NULL AND response_minutes >= 120`
    )
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  for (const en of enqRes.results ?? []) {
    const sid = `slow_response:${String(en.id)}`
    if (openBySource.has(sid)) continue
    const minutes = Number(en.response_minutes ?? 0)
    const name = String(en.contact_name ?? en.contact_phone ?? "New enquiry")
    await insert({
      source_type: "slow_response",
      source_id: String(en.id),
      lead_id: en.lead_id ? String(en.lead_id) : null,
      customer_name: name,
      job_type: "other",
      category: CATEGORY_BY_SOURCE.slow_response,
      title: `${name} waited ${minutes >= 180 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`} for a first response`,
      why: `Enquiry received via ${String(en.channel)} and first response took ${minutes} minutes. The first company to respond usually wins the job.`,
      recommended_action: `Call ${name} now — acknowledge the delay and qualify while intent is still warm.`,
      estimated_value: Number(en.estimated_value ?? 0),
      stage: "identified",
      priority: String(en.urgency) === "urgent" ? "high" : "medium",
      owner: "office",
      age_days: daysBetween(String(en.received_at), now),
      last_event_at: String(en.received_at)
    })
  }

  // 4) Unworked leads — open leads idle with no next action scheduled
  const leadsRes = await db
    .prepare(
      `SELECT id, name, service, status, urgency, estimated_value, last_activity_at, next_action_at
       FROM leads WHERE company_id = ?1 AND status NOT IN ('won','lost','unqualified')`
    )
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  for (const l of leadsRes.results ?? []) {
    if (String(l.status) === "appointment_requested") continue // handled once, as a booking failure below (no double counting)
    if (missedPhoneSet.size > 0 && missedPhoneSet.has(normalizePhone(l.phone))) {
      continue // an open missed-call opportunity already covers this customer — never count twice
    }
    if (l.next_action_at && tsToMs(String(l.next_action_at)) > now) continue // already scheduled forward
    const idle = daysBetween(l.last_activity_at ? String(l.last_activity_at) : String(l.created_at), now)
    const isSlow = idle >= 2 && idle < 30
    const isDormant = idle >= 30
    if (!isSlow && !isDormant) continue
    const source: "unworked_lead" | "dormant_customer" = isDormant ? "dormant_customer" : "unworked_lead"
    const sid = `${source}:${String(l.id)}`
    if (openBySource.has(sid)) continue
    if (isDormant) {
      const reaRes = await db
        .prepare(`SELECT id FROM reactivations WHERE company_id = ?1 AND lead_id = ?2 AND status = 'identified'`)
        .bind(COMPANY_ID, String(l.id))
        .first<{ id: string }>()
      if (reaRes) continue // already managed on the Reactivation screen
    }
    const name = String(l.name)
    const value = Number(l.estimated_value ?? 0)
    await insert({
      source_type: source,
      source_id: String(l.id),
      lead_id: String(l.id),
      customer_name: name,
      job_type: classifyJobType(String(l.service ?? "")),
      category: CATEGORY_BY_SOURCE[source],
      title: isDormant
        ? `${name} — dormant ${idle} days`
        : `${name} — ${String(l.status).replace(/_/g, " ")} with no next step`,
      why: isDormant
        ? `Interested ${idle} days ago, then went quiet. Potential reactivation opportunity — old quotes and seasonal timing often reopen these.`
        : `Status "${String(l.status).replace(/_/g, " ")}" with no activity for ${idle} days and no next action scheduled. Unworked leads quietly become lost jobs.`,
      recommended_action: isDormant
        ? `Potential reactivation: reach out to ${name} with a fresh, specific next step.`
        : `Give ${name} a status update or schedule the next step today.`,
      estimated_value: value,
      stage: "identified",
      priority: isDormant ? "medium" : value >= 5000 ? "high" : "low",
      owner: "office",
      age_days: idle,
      last_event_at: l.last_activity_at ? String(l.last_activity_at) : String(l.created_at)
    })
  }

  // 5) Booking failures — appointment requested but never confirmed
  for (const l of leadsRes.results ?? []) {
    if (String(l.status) !== "appointment_requested") continue
    const sid = `booking_failure:${String(l.id)}`
    if (openBySource.has(sid)) continue
    const idle = daysBetween(l.last_activity_at ? String(l.last_activity_at) : String(l.created_at), now)
    if (idle < 1) continue
    const name = String(l.name)
    await insert({
      source_type: "booking_failure",
      source_id: String(l.id),
      lead_id: String(l.id),
      customer_name: name,
      job_type: classifyJobType(String(l.service ?? "")),
      category: CATEGORY_BY_SOURCE.booking_failure,
      title: `${name} requested a visit — still unconfirmed`,
      why: `Customer asked for an appointment ${idle} day${idle === 1 ? "" : "s"} ago and the slot was never confirmed. Unconfirmed requests routinely go to a competitor.`,
      recommended_action: `Confirm a concrete slot with ${name} today.`,
      estimated_value: Number(l.estimated_value ?? 0),
      stage: "identified",
      priority: "high",
      owner: "office",
      age_days: idle,
      last_event_at: l.last_activity_at ? String(l.last_activity_at) : String(l.created_at)
    })
  }

  // 6) Human handoffs — open high-value owner tasks idle beyond a day
  const taskRes = await db
    .prepare(
      `SELECT t.id, t.lead_id, t.title, t.estimated_value, t.created_at, t.priority, l.name AS lead_name
       FROM human_tasks t LEFT JOIN leads l ON l.id = t.lead_id
       WHERE t.company_id = ?1 AND t.status = 'open'`
    )
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  for (const t of taskRes.results ?? []) {
    const sid = `handoff:${String(t.id)}`
    if (openBySource.has(sid)) continue
    const waiting = daysBetween(t.created_at ? String(t.created_at) : null, now)
    if (waiting < 2) continue // fresh handoffs are fine
    const name = t.lead_name ? String(t.lead_name) : "Owner task"
    await insert({
      source_type: "handoff",
      source_id: String(t.id),
      lead_id: t.lead_id ? String(t.lead_id) : null,
      customer_name: name,
      job_type: "other",
      category: CATEGORY_BY_SOURCE.handoff,
      title: `Human handoff waiting ${waiting} days — ${String(t.title)}`,
      why: `An owner action has been open for ${waiting} days${Number(t.estimated_value) ? ` with ${money(Number(t.estimated_value))} attached` : ""}. Handoffs waiting too long are silent leakage.`,
      recommended_action: `Complete or explicitly snooze this owner action today.`,
      estimated_value: Number(t.estimated_value ?? 0),
      stage: "identified",
      priority: String(t.priority) === "high" ? "high" : "medium",
      owner: "owner",
      age_days: waiting,
      last_event_at: t.created_at ? String(t.created_at) : nowStr
    })
  }

  return { created }
}

// =====================================================================
// STAGE ADVANCEMENT — with REAL recovery accounting
// =====================================================================

export interface AdvanceResult {
  opportunity: OpportunityRow
  stage_before: Stage
  stage_after: Stage
  counted_as_recovered: boolean
}

export async function advanceOpportunity(
  db: Database,
  id: string,
  body: Record<string, unknown>
): Promise<AdvanceResult> {
  const row = await db
    .prepare(`SELECT ${SELECT_RO} FROM recovery_opportunities WHERE id = ?1 AND company_id = ?2`)
    .bind(id, COMPANY_ID)
    .first<OpportunityRow>()
  const opp = row as OpportunityRow | null
  if (!opp) throw new ValidationError("Recovery opportunity not found", { id: "not_found" })

  const toStage = String(body.stage ?? "")
  if (!(STAGE_ORDER as readonly string[]).includes(toStage)) {
    throw new ValidationError(`stage must be one of: ${STAGE_ORDER.join(", ")}`, { stage: "invalid" })
  }
  const from = opp.stage as Stage
  const to = toStage as Stage
  if (!canTransition(from, to)) {
    throw new ValidationError(`Invalid transition: ${from} → ${to}`, { stage: "invalid_transition" })
  }

  const outcome = typeof body.outcome === "string" && body.outcome ? body.outcome : null
  const nowStr = nowIso()

  // The ONLY way an opportunity becomes "recovered" with revenue attached:
  // an explicit recovery outcome is recorded alongside the stage change.
  let countedAsRecovered = false
  let recoveredValue: number | null = null
  if (to === "recovered") {
    if (!isRecoveryOutcome(outcome)) {
      throw new ValidationError(
        `Recording recovery requires an explicit outcome: ${RECOVERY_OUTCOMES.join(", ")}. Progressing work alone does not count as recovered revenue.`,
        { outcome: "required" }
      )
    }
    countedAsRecovered = true
    recoveredValue =
      typeof body.recovered_value === "number" && body.recovered_value > 0
        ? Math.round(body.recovered_value * 100) / 100
        : opp.estimated_value
  }

  const lastEvent =
    typeof body.note === "string" && body.note.trim()
      ? `${opp.last_event_at ? opp.last_event_at + " | " : ""}${new Date().toISOString().slice(0, 10)}: ${body.note.trim().slice(0, 300)}`
      : opp.last_event_at

  await db
    .prepare(
      `UPDATE recovery_opportunities SET stage = ?3, outcome_type = ?4, recovered_value = ?5, last_event_at = ?6, updated_at = ?7
       WHERE id = ?1 AND company_id = ?2`
    )
    .bind(id, COMPANY_ID, to, outcome, recoveredValue, lastEvent ?? nowStr, nowStr)
    .run()

  // Keep linked records coherent (demo-safe: no customer messages are ever sent).
  if (to === "booked" && opp.lead_id) {
    await db
      .prepare(`UPDATE leads SET status = 'appointment_booked', last_activity_at = ?3, updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
      .bind(opp.lead_id, COMPANY_ID, nowStr)
      .run()
  }
  if (to === "recovered" && opp.lead_id) {
    await db
      .prepare(`UPDATE leads SET status = 'won', recovered_via = ?3, last_activity_at = ?4, updated_at = ?4 WHERE id = ?1 AND company_id = ?2`)
      .bind(opp.lead_id, COMPANY_ID, outcome ?? "veria_recovery", nowStr)
      .run()
  }
  if (to === "lost" && opp.lead_id) {
    await db
      .prepare(`UPDATE leads SET status = 'lost', lost_reason = ?3, last_activity_at = ?4, updated_at = ?4 WHERE id = ?1 AND company_id = ?2`)
      .bind(opp.lead_id, COMPANY_ID, outcome ?? "Marked lost in recovery pipeline", nowStr)
      .run()
  }
  if (opp.source_type === "quote" && opp.source_id) {
    if (to === "booked") {
      await db.prepare(`UPDATE estimates SET quote_status = 'booked', updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
        .bind(opp.source_id, COMPANY_ID, nowStr).run()
    } else if (to === "recovered") {
      await db.prepare(`UPDATE estimates SET quote_status = 'booked', updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
        .bind(opp.source_id, COMPANY_ID, nowStr).run()
    } else if (to === "lost") {
      await db.prepare(`UPDATE estimates SET quote_status = 'lost', updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
        .bind(opp.source_id, COMPANY_ID, nowStr).run()
    } else if (to === "contacted") {
      await db.prepare(`UPDATE estimates SET quote_status = 'customer_replied', last_contact_at = ?3, updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
        .bind(opp.source_id, COMPANY_ID, nowStr).run()
    }
  }
  if (opp.source_type === "handoff" && opp.source_id && to === "recovered") {
    await db.prepare(`UPDATE human_tasks SET status = 'completed', updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
      .bind(opp.source_id, COMPANY_ID, nowStr).run()
  }

  await audit(db, {
    actor: "owner",
    entityType: "recovery_opportunity",
    entityId: id,
    action: to === "recovered" ? "revenue_recovered" : "opportunity_advanced",
    detail:
      to === "recovered"
        ? `${opp.title}: ${from} → recovered (${outcome}). ${money(recoveredValue ?? 0)} recorded as recovered revenue.`
        : `${opp.title}: ${from} → ${to}${outcome ? ` (${outcome})` : ""}.`
  })

  const updated = (await db
    .prepare(`SELECT ${SELECT_RO} FROM recovery_opportunities WHERE id = ?1`)
    .bind(id)
    .first<OpportunityRow>()) as OpportunityRow

  return { opportunity: updated, stage_before: from, stage_after: to, counted_as_recovered: countedAsRecovered }
}

// =====================================================================
// LEAKAGE + SCORE + IMPACT + AUDIT
// =====================================================================

export interface LeakageCategory {
  source_type: string
  label: string
  count: number
  value: number
  severity: "high" | "medium" | "low"
  oldest_days: number
  recommended_action: string
}

export interface ImpactMetrics {
  identified_value: number
  identified_count: number
  actioned_value: number
  actioned_count: number
  recovered_value: number
  recovered_count: number
  still_open_value: number
  still_open_count: number
  lost_value: number
  lost_count: number
  action_rate: number
  recovery_rate: number
  illustrative: boolean
}

export interface ScoreLine {
  label: string
  delta: number
  detail: string
}

export interface RecoveryScore {
  score: number
  band: "critical" | "leaking" | "acceptable" | "strong"
  cold_start: boolean
  lines: ScoreLine[]
  inputs: {
    enquiries_total: number
    responded_lt5: number
    no_response: number
    open_quotes: number
    quotes_overdue: number
    missed_open: number
    dormant: number
    stale_tasks: number
    pipeline_progress: number
    pipeline_recovered: number
  }
}

export interface AuditDoc {
  company: { name: string; city: string; state: string; region: string; currency: string }
  period_days: number
  generated_at: string
  data_basis: string
  enquiries: number
  missed_unanswered: number
  slow_responses: number
  response_health: ResponseHealth
  open_quotes: number
  open_quotes_value: number
  overdue_quotes: number
  dormant_customers: number
  opportunity: {
    missed_enquiries: number
    quote_followup: number
    dormant_customers: number
    slow_responses: number
    other: number
    total: number
  }
  top_actions: { rank: number; title: string; customer: string; value: number; why: string; recommended_action: string }[]
  score: RecoveryScore
  disclaimer: string
}

function band(score: number): RecoveryScore["band"] {
  if (score < 40) return "critical"
  if (score < 60) return "leaking"
  if (score < 80) return "acceptable"
  return "strong"
}

export async function computeRecoveryScore(db: Database, now: number = Date.now()): Promise<RecoveryScore> {
  const opps = await listOpportunities(db)
  const enqRes = await db
    .prepare(`SELECT response_minutes FROM enquiries WHERE company_id = ?1`)
    .bind(COMPANY_ID)
    .all<{ response_minutes: number | null }>()
  const enquiries = enqRes.results ?? []
  const lt5 = enquiries.filter((e) => e.response_minutes !== null && e.response_minutes < 5).length
  const noResp = enquiries.filter((e) => e.response_minutes === null || e.response_minutes === undefined).length

  const quotesRes = await db
    .prepare(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND quote_status IN ('sent','followup_due','no_response')`)
    .bind(COMPANY_ID)
    .first<{ n: number }>()
  const overdueRes = await db
    .prepare(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND quote_status IN ('followup_due','no_response')`)
    .bind(COMPANY_ID)
    .first<{ n: number }>()

  const missedRes = await db
    .prepare(`SELECT COUNT(*) AS n FROM missed_calls WHERE company_id = ?1 AND recovered = 0`)
    .bind(COMPANY_ID)
    .first<{ n: number }>()

  const leadsRes = await db
    .prepare(`SELECT last_activity_at, status FROM leads WHERE company_id = ?1`)
    .bind(COMPANY_ID)
    .all<{ last_activity_at: string | null; status: string }>()
  const dormant = (leadsRes.results ?? []).filter(
    (l) => !["won", "lost", "unqualified"].includes(l.status) && daysBetween(l.last_activity_at, now) >= 30
  ).length

  const staleTaskRes = await db
    .prepare(`SELECT COUNT(*) AS n FROM human_tasks WHERE company_id = ?1 AND status = 'open' AND created_at <= ?2`)
    .bind(COMPANY_ID, isoDaysAgo(3))
    .first<{ n: number }>()

  const actioned = opps.filter((o) => ["contacted", "responded", "qualified", "booked", "recovered"].includes(o.stage))
  const recovered = opps.filter((o) => o.stage === "recovered")
  const identifiedTotal = opps.length

  // Credit-score model: 50 = a functioning business with typical leakage.
  // Every line is a positive or negative delta so the owner can see exactly WHY the score moves.
  // Ranges: response −10..+25, quotes −10..+10, missed 0..−10, dormant 0..−6,
  // handoffs 0..−6, workflow completion 0..+15. Max 100, min clamps at 0.
  const lines: ScoreLine[] = []
  const coldStart = enquiries.length === 0 && opps.length === 0 && (quotesRes?.n ?? 0) === 0 && (missedRes?.n ?? 0) === 0
  let score = 50

  // Response coverage & speed — measured from the company's own enquiries (never benchmarks)
  if (enquiries.length === 0) {
    lines.push({ label: "Response coverage", delta: 0, detail: "No enquiry data yet — scored neutrally" })
  } else {
    const resp = enquiries.filter((e) => e.response_minutes !== null && e.response_minutes !== undefined)
    const fastShare = resp.length ? resp.filter((e) => (e.response_minutes ?? 0) < 30).length / resp.length : 0
    const noRespPenalty = Math.min(10, noResp * 2)
    const pts = Math.round(25 * fastShare) - noRespPenalty
    score += pts
    lines.push({
      label: "Response coverage",
      delta: pts,
      detail:
        noResp === 0
          ? `${lt5} of ${enquiries.length} enquiries answered in under 30 minutes; none ignored`
          : `${noResp} enquir${noResp === 1 ? "y" : "ies"} with no recorded response; ${Math.round(fastShare * 100)}% answered within 30 minutes`
    })
  }

  // Quote follow-up coverage — rewards quotes actively worked, penalises silence
  {
    const openQ = quotesRes?.n ?? 0
    const overdue = overdueRes?.n ?? 0
    if (openQ === 0) {
      lines.push({ label: "Quote follow-up coverage", delta: 0, detail: "No open quotes awaiting follow-up" })
    } else {
      const pts = Math.round(10 * ((openQ - overdue) / openQ)) - Math.min(10, overdue * 2)
      score += pts
      lines.push({
        label: "Quote follow-up coverage",
        delta: pts,
        detail: `${overdue} overdue of ${openQ} open quote${openQ === 1 ? "" : "s"}`
      })
    }
  }

  // Missed enquiries on record — high-intent customers who never got an answer
  {
    const missed = missedRes?.n ?? 0
    const pen = -Math.min(10, missed * 3)
    score += pen
    lines.push({ label: "Missed enquiries", delta: pen, detail: `${missed} unrecovered missed call${missed === 1 ? "" : "s"} on record` })
  }

  // Dormant customer volume — potential repeat business sitting untouched
  {
    const pen = -Math.min(6, Math.floor(dormant / 5))
    score += pen
    lines.push({ label: "Dormant customers", delta: pen, detail: `${dormant} potential reactivation opportunit${dormant === 1 ? "y" : "ies"}` })
  }

  // Stale human handoffs — owner actions left waiting
  {
    const stale = staleTaskRes?.n ?? 0
    const pen = -Math.min(6, stale * 2)
    score += pen
    lines.push({ label: "Human handoffs", delta: pen, detail: stale === 0 ? "No owner actions waiting" : `${stale} owner action${stale === 1 ? "" : "s"} open 3+ days` })
  }

  // Recovery workflow completion — credit for actually working the pipeline
  if (identifiedTotal === 0) {
    lines.push({ label: "Recovery workflow completion", delta: 0, detail: "No opportunities tracked yet" })
  } else {
    const progressShare = actioned.length / identifiedTotal
    const recoveredShare = recovered.length / identifiedTotal
    const pts = Math.round(10 * progressShare + 5 * Math.min(1, recoveredShare * 3))
    score += pts
    lines.push({
      label: "Recovery workflow completion",
      delta: pts,
      detail: `${actioned.length} of ${identifiedTotal} opportunities actioned, ${recovered.length} recovered`
    })
  }

  score = Math.max(0, Math.min(100, score))
  return {
    score,
    band: coldStart ? "acceptable" : band(score),
    cold_start: coldStart,
    lines,
    inputs: {
      enquiries_total: enquiries.length,
      responded_lt5: lt5,
      no_response: noResp,
      open_quotes: quotesRes?.n ?? 0,
      quotes_overdue: overdueRes?.n ?? 0,
      missed_open: missedRes?.n ?? 0,
      dormant,
      stale_tasks: staleTaskRes?.n ?? 0,
      pipeline_progress: identifiedTotal ? Math.round((actioned.length / identifiedTotal) * 100) : 0,
      pipeline_recovered: recovered.length
    }
  }
}

export async function buildImpact(db: Database): Promise<ImpactMetrics> {
  const opps = await listOpportunities(db)
  const identified = opps
  const actioned = opps.filter((o) => ["contacted", "responded", "qualified", "booked", "recovered"].includes(o.stage))
  const recovered = opps.filter((o) => o.stage === "recovered")
  const open = opps.filter((o) => !["recovered", "lost"].includes(o.stage))
  const lost = opps.filter((o) => o.stage === "lost")
  const sum = (rows: OpportunityRow[], key: "estimated_value" | "recovered_value" = "estimated_value") =>
    rows.reduce((s, r) => s + (key === "recovered_value" ? Number(r.recovered_value ?? 0) : Number(r.estimated_value ?? 0)), 0)

  return {
    identified_value: sum(identified),
    identified_count: identified.length,
    actioned_value: sum(actioned),
    actioned_count: actioned.length,
    recovered_value: sum(recovered, "recovered_value"),
    recovered_count: recovered.length,
    still_open_value: sum(open),
    still_open_count: open.length,
    lost_value: sum(lost),
    lost_count: lost.length,
    action_rate: identified.length ? actioned.length / identified.length : 0,
    recovery_rate: actioned.length ? recovered.length / actioned.length : 0,
    illustrative: true
  }
}

export async function buildLeakage(db: Database): Promise<{ categories: LeakageCategory[]; total: number; total_count: number }> {
  const opps = await listOpportunities(db)
  const open = opps.filter((o) => o.stage !== "recovered" && o.stage !== "lost")
  const bySource = new Map<string, OpportunityRow[]>()
  for (const o of open) {
    const arr = bySource.get(o.source_type) ?? []
    arr.push(o)
    bySource.set(o.source_type, arr)
  }
  const ACTION_BY_SOURCE: Record<string, string> = {
    missed_call: "Call every missed enquiry back same-day",
    slow_response: "Respond to new enquiries in minutes, not hours",
    unworked_lead: "Give every open lead a scheduled next step",
    quote: "Follow up every quote on a fixed cadence",
    dormant_customer: "Run seasonal reactivation outreach",
    booking_failure: "Confirm every requested appointment within 24h",
    handoff: "Clear owner handoffs daily"
  }
  const categories: LeakageCategory[] = []
  for (const [source, rows] of bySource) {
    const value = rows.reduce((s, r) => s + r.estimated_value, 0)
    const oldest = Math.max(...rows.map((r) => r.age_days))
    const highCount = rows.filter((r) => r.priority === "high").length
    categories.push({
      source_type: source,
      label: CATEGORY_BY_SOURCE[source] ?? source,
      count: rows.length,
      value,
      severity: oldest >= 14 || highCount >= 3 ? "high" : oldest >= 7 || highCount >= 1 ? "medium" : "low",
      oldest_days: oldest,
      recommended_action: ACTION_BY_SOURCE[source] ?? "Review and action these opportunities"
    })
  }
  categories.sort((a, b) => b.value - a.value)
  return {
    categories,
    total: categories.reduce((s, c) => s + c.value, 0),
    total_count: open.length
  }
}

export async function buildAudit(db: Database, periodDays = 90): Promise<AuditDoc> {
  const now = Date.now()
  const company = (await db
    .prepare(`SELECT c.name, c.city, c.state, s.region, s.currency FROM companies c LEFT JOIN company_settings s ON s.company_id = c.id WHERE c.id = ?1`)
    .bind(COMPANY_ID)
    .first<Record<string, unknown>>()) ?? {}

  const since = isoDaysAgo(periodDays)
  const enqRes = await db
    .prepare(`SELECT response_minutes, first_response_at, contact_name, estimated_value FROM enquiries WHERE company_id = ?1 AND received_at >= ?2`)
    .bind(COMPANY_ID, since)
    .all<Record<string, unknown>>()
  const enquiries = enqRes.results ?? []
  const health = computeResponseHealth(
    enquiries.map((e) => ({ response_minutes: e.response_minutes as number | null, first_response_at: e.first_response_at as string | null }))
  )

  const missedRes = await db
    .prepare(`SELECT COUNT(*) AS n FROM missed_calls WHERE company_id = ?1 AND recovered = 0`)
    .bind(COMPANY_ID)
    .first<{ n: number }>()
  const quotesRes = await db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS v FROM estimates WHERE company_id = ?1 AND quote_status IN ('sent','followup_due','no_response')`)
    .bind(COMPANY_ID)
    .first<{ n: number; v: number }>()
  const overdueRes = await db
    .prepare(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND quote_status IN ('followup_due','no_response')`)
    .bind(COMPANY_ID)
    .first<{ n: number }>()
  const dormantRes = await db
    .prepare(`SELECT COUNT(*) AS n FROM reactivations WHERE company_id = ?1 AND status = 'identified'`)
    .bind(COMPANY_ID)
    .first<{ n: number }>()

  const { categories } = await buildLeakage(db)
  const val = (source: string) => categories.find((c) => c.source_type === source)?.value ?? 0
  const known = new Set(["missed_call", "quote", "dormant_customer", "slow_response"])
  const other = categories.filter((c) => !known.has(c.source_type)).reduce((s, c) => s + c.value, 0)

  const opps = (await listOpportunities(db)).filter((o) => o.stage !== "recovered" && o.stage !== "lost")
  opps.sort((a, b) => b.estimated_value - a.estimated_value || a.age_days - b.age_days)
  const topActions = opps.slice(0, 5).map((o, i) => ({
    rank: i + 1,
    title: o.title,
    customer: o.customer_name,
    value: o.estimated_value,
    why: o.why,
    recommended_action: o.recommended_action
  }))

  const score = await computeRecoveryScore(db, now)

  const currency = String(company.currency ?? "USD") as "USD" | "GBP" | "EUR"

  return {
    company: {
      name: String(company.name ?? "Company"),
      city: String(company.city ?? ""),
      state: String(company.state ?? ""),
      region: String(company.region ?? "us"),
      currency
    },
    period_days: periodDays,
    generated_at: nowIso(),
    data_basis: `Analysis covers the last ${periodDays} days of enquiries, calls, quotes and customer records available in VÉRIA.`,
    enquiries: enquiries.length,
    missed_unanswered: missedRes?.n ?? 0,
    slow_responses: health.buckets.filter((b) => ["30to120", "over120"].includes(b.key)).reduce((s, b) => s + b.count, 0),
    response_health: health,
    open_quotes: quotesRes?.n ?? 0,
    open_quotes_value: Number(quotesRes?.v ?? 0),
    overdue_quotes: overdueRes?.n ?? 0,
    dormant_customers: dormantRes?.n ?? 0,
    opportunity: {
      missed_enquiries: val("missed_call"),
      quote_followup: val("quote"),
      dormant_customers: val("dormant_customer"),
      slow_responses: val("slow_response"),
      other,
      total: categories.reduce((s, c) => s + c.value, 0)
    },
    top_actions: topActions,
    score,
    disclaimer:
      "These are opportunities identified from the available data — NOT guaranteed revenue. Values are estimates based on recorded job values and typical recovery actions. Illustrative figures for demonstration data."
  }
}

export { listOpportunities }
