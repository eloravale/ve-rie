/**
 * VÉRIA intelligence layer — evidence, data quality, calibration, revenue watch.
 *
 * Principles:
 *  - Every recommendation carries EVIDENCE: the exact fields that produced it.
 *  - Confidence describes DATA completeness — never a claimed "accuracy rate".
 *  - Prediction performance is reported only when real outcome data exists;
 *    otherwise VÉRIA says "insufficient historical outcomes".
 *  - Money concepts stay distinct: recorded value ≠ opportunity value ≠
 *    estimated recoverable value ≠ actual recovered revenue.
 */

import { COMPANY_ID, type Database } from "./db"
import { isoDaysAgo, listOpportunities } from "./pipeline"
import { nowIso } from "./db"

// =====================================================================
// EVIDENCE — why did VÉRIA flag this?
// =====================================================================

export type Confidence = "high" | "medium" | "low"

export interface EvidenceField {
  field: string
  value: string
  present: boolean
}

export interface Evidence {
  opportunity_id: string
  customer: string
  opportunity_value: number
  /** Value-type label: what the number actually is (never "lost revenue"). */
  value_basis: string
  fields: EvidenceField[]
  confidence: Confidence
  confidence_reason: string
  conclusion: string
  /** Analytical estimate, NOT the recorded value — often "unavailable". */
  estimated_recoverable: number | null
  estimated_recoverable_note: string
  priority_reason: string
  source: { type: string; id: string | null; label: string }
  analysis_period: string
}

interface RawOpp {
  id: string
  source_type: string
  source_id: string | null
  customer_name: string
  estimated_value: number
  age_days: number
  stage: string
  priority: string
  why: string
  recommended_action: string
  last_event_at: string | null
}

const SOURCE_LABELS: Record<string, string> = {
  missed_call: "Call log (missed call record)",
  slow_response: "Enquiry log (first-response timestamp)",
  unworked_lead: "Lead record (CRM export)",
  quote: "Estimate record (CRM export)",
  dormant_customer: "Customer record (last-activity timestamp)",
  booking_failure: "Appointment request record",
  handoff: "Human handoff task record"
}

const VALUE_BASIS: Record<string, string> = {
  missed_call: "Opportunity value — estimated job value if this enquiry converts",
  slow_response: "Opportunity value — estimated job value from the enquiry",
  unworked_lead: "Opportunity value — recorded estimated job value",
  quote: "Recorded value — the quote amount on file (factual, not predicted)",
  dormant_customer: "Opportunity value — recorded estimated job value",
  booking_failure: "Opportunity value — recorded estimated job value",
  handoff: "Opportunity value — value attached to the owner task"
}

const PRIORITY_REASONS: Record<string, string> = {
  high: "High-value or time-sensitive — act this week.",
  medium: "Worth scheduling — significant value, not urgent.",
  low: "Batch when time allows — lower value or older signal."
}

function computeConfidence(fields: EvidenceField[]): { confidence: Confidence; reason: string } {
  const present = fields.filter((f) => f.present).length
  const ratio = fields.length ? present / fields.length : 0
  if (ratio >= 0.85) return { confidence: "high", reason: "All key fields available for this record." }
  if (ratio >= 0.6) return { confidence: "medium", reason: "Some fields are missing — classification is reasonable but not airtight." }
  return { confidence: "low", reason: "Insufficient data to confidently classify this opportunity." }
}

/** Deterministic evidence for one opportunity, assembled from its source record. */
export async function buildEvidence(db: Database, opportunityId: string): Promise<Evidence | null> {
  const opp = (await listOpportunities(db)).find((o) => o.id === opportunityId)
  if (!opp) return null

  const fields: EvidenceField[] = []
  const push = (field: string, value: unknown, present = true, fmt?: (v: unknown) => string) =>
    fields.push({ field, value: fmt ? fmt(value) : String(value ?? "—"), present: present && value !== null && value !== undefined && value !== "" })

  push("Customer", opp.customer_name)
  push("Opportunity value", opp.estimated_value, true, (v) => `$${Number(v).toLocaleString("en-US")}`)
  push("Opportunity age", opp.age_days, true, (v) => `${v} days`)
  push("Status", opp.stage)

  let sourceRow: Record<string, unknown> | null = null

  if (opp.source_type === "quote" && opp.source_id) {
    const row = await db
      .prepare(
        `SELECT e.amount, e.sent_at, e.quote_status, e.last_contact_at, l.name, l.phone, l.id AS lead_id
         FROM estimates e JOIN leads l ON l.id = e.lead_id WHERE e.id = ?1`
      )
      .bind(String(opp.source_id))
      .first<Record<string, unknown>>()
    sourceRow = row
    if (row) {
      push("Estimate amount", row.amount, row.amount != null, (v) => `$${Number(v).toLocaleString("en-US")}`)
      push("Estimate sent date", row.sent_at, !!row.sent_at, (v) => String(v).slice(0, 10))
      push("Estimate status", row.quote_status)
      push("Last recorded contact", row.last_contact_at ?? null, !!row.last_contact_at, (v) => String(v).slice(0, 10))
      push("Customer phone", row.phone ?? null, !!row.phone)
      push("Follow-up recorded", row.last_contact_at ? "Yes" : "No")
    }
  } else if (opp.source_type === "missed_call" && opp.source_id) {
    const row = await db
      .prepare(`SELECT caller_name, caller_phone, called_at, estimated_value, recovered FROM missed_calls WHERE id = ?1`)
      .bind(String(opp.source_id))
      .first<Record<string, unknown>>()
    sourceRow = row
    if (row) {
      push("Call received", row.called_at, !!row.called_at, (v) => String(v).slice(0, 10))
      push("Caller phone", row.caller_phone ?? null, !!row.caller_phone)
      push("Call recovered since flag", Number(row.recovered) === 1 ? "Yes" : "No")
      push("Estimated job value", row.estimated_value, row.estimated_value != null, (v) => `$${Number(v).toLocaleString("en-US")}`)
    }
  } else if (opp.source_type === "slow_response" && opp.source_id) {
    const row = await db
      .prepare(`SELECT contact_name, contact_phone, channel, received_at, first_response_at, response_minutes, urgency FROM enquiries WHERE id = ?1`)
      .bind(String(opp.source_id))
      .first<Record<string, unknown>>()
    sourceRow = row
    if (row) {
      push("Enquiry received", row.received_at, !!row.received_at, (v) => String(v).slice(0, 10))
      push("Channel", row.channel)
      push("First response", row.first_response_at, !!row.first_response_at, (v) => String(v).slice(0, 16))
      push("Response delay", row.response_minutes, row.response_minutes != null, (v) => `${v} minutes`)
      push("Urgency at intake", row.urgency)
    }
  } else if ((opp.source_type === "unworked_lead" || opp.source_type === "dormant_customer") && opp.source_id) {
    const row = await db
      .prepare(`SELECT name, phone, status, source, estimated_value, created_at, last_activity_at, next_action_at FROM leads WHERE id = ?1`)
      .bind(String(opp.source_id))
      .first<Record<string, unknown>>()
    sourceRow = row
    if (row) {
      push("Lead status", row.status)
      push("Customer phone", row.phone ?? null, !!row.phone)
      push("Lead source", row.source ?? null, !!row.source)
      push("Enquiry date", row.created_at, !!row.created_at, (v) => String(v).slice(0, 10))
      push("Last activity", row.last_activity_at, !!row.last_activity_at, (v) => String(v).slice(0, 10))
      push("Next action scheduled", row.next_action_at ? "Yes" : "No")
      push("Estimated job value", row.estimated_value, row.estimated_value != null, (v) => `$${Number(v).toLocaleString("en-US")}`)
    }
  } else if (opp.source_type === "handoff" && opp.source_id) {
    const row = await db
      .prepare(`SELECT title, estimated_value, created_at, due_at, priority FROM human_tasks WHERE id = ?1`)
      .bind(String(opp.source_id))
      .first<Record<string, unknown>>()
    sourceRow = row
    if (row) {
      push("Task created", row.created_at, !!row.created_at, (v) => String(v).slice(0, 10))
      push("Due date", row.due_at ?? null, !!row.due_at, (v) => String(v).slice(0, 10))
      push("Task priority", row.priority)
    }
  }
  // booking_failure shares the lead-record evidence path above via source_id lookup fallback:
  if (!sourceRow && opp.source_id && opp.source_type === "booking_failure") {
    const row = await db
      .prepare(`SELECT name, phone, status, estimated_value, last_activity_at FROM leads WHERE id = ?1`)
      .bind(String(opp.source_id))
      .first<Record<string, unknown>>()
    if (row) {
      push("Requested visit date", row.last_activity_at, !!row.last_activity_at, (v) => String(v).slice(0, 10))
      push("Lead status", row.status)
      push("Customer phone", row.phone ?? null, !!row.phone)
      push("Estimated job value", row.estimated_value, row.estimated_value != null, (v) => `$${Number(v).toLocaleString("en-US")}`)
    }
  }

  const { confidence, reason } = computeConfidence(fields)
  const priorityReason =
    PRIORITY_REASONS[opp.priority] ?? "Review and decide — VÉRIA lacks a rule basis for stronger language."

  const valueBasis = VALUE_BASIS[opp.source_type] ?? "Opportunity value — from the underlying record"

  // Estimated recoverable value: deliberately NOT invented. It is derived only
  // when this workspace has at least one historical recovery to ground a rate,
  // and even then it is labelled as analytical.
  let estimatedRecoverable: number | null = null
  let recoverableNote = "Recovery probability unavailable — insufficient historical outcomes in this workspace."
  const hist = await db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN stage = 'recovered' THEN 1 ELSE 0 END) AS rec
       FROM recovery_opportunities WHERE company_id = ?1 AND stage IN ('recovered','lost')`
    )
    .bind(COMPANY_ID)
    .first<{ total: number; rec: number | null }>()
  const totalClosed = Number(hist?.total ?? 0)
  const totalRecovered = Number(hist?.rec ?? 0)
  if (totalClosed >= 10) {
    const rate = totalRecovered / totalClosed
    estimatedRecoverable = Math.round(opp.estimated_value * rate)
    recoverableNote = `Analytical estimate: workspace recovery rate ${(rate * 100).toFixed(0)}% (${totalRecovered} of ${totalClosed} closed opportunities) applied to the opportunity value. Not a prediction of guaranteed revenue.`
  }

  const conclusion = `${opp.why} Suitable for human recovery outreach: ${opp.recommended_action}`

  return {
    opportunity_id: opp.id,
    customer: opp.customer_name,
    opportunity_value: opp.estimated_value,
    value_basis: valueBasis,
    fields,
    confidence,
    confidence_reason: reason,
    conclusion,
    estimated_recoverable: estimatedRecoverable,
    estimated_recoverable_note: recoverableNote,
    priority_reason: `${priorityReason} ${confidence === "low" ? "Classification confidence is low — human review recommended." : ""}`.trim(),
    source: {
      type: opp.source_type,
      id: opp.source_id,
      label: SOURCE_LABELS[opp.source_type] ?? "VÉRIA record"
    },
    analysis_period: "Last 90 days of recorded activity"
  }
}

// =====================================================================
// DATA QUALITY — inspect the data before drawing conclusions from it
// =====================================================================

export interface DataQualityIssue {
  kind: string
  label: string
  count: number
  severity: "high" | "medium" | "low"
  table: string
}

export interface DataQuality {
  score: number
  band: "high" | "acceptable" | "poor" | "insufficient"
  records_analyzed: number
  issues: DataQualityIssue[]
  completeness: { label: string; pct: number }[]
  summary: string
  analyzed_at: string
}

export async function buildDataQuality(db: Database): Promise<DataQuality> {
  const count = async (sql: string, ...binds: unknown[]): Promise<number> => {
    const r = await db.prepare(sql).bind(...binds).first<{ n: number }>()
    return Number(r?.n ?? 0)
  }

  const leadsTotal = await count(`SELECT COUNT(*) AS n FROM leads WHERE company_id = ?1`, COMPANY_ID)
  const estimatesTotal = await count(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1`, COMPANY_ID)
  const missedTotal = await count(`SELECT COUNT(*) AS n FROM missed_calls WHERE company_id = ?1`, COMPANY_ID)
  const enquiriesTotal = await count(`SELECT COUNT(*) AS n FROM enquiries WHERE company_id = ?1`, COMPANY_ID)
  const records = leadsTotal + estimatesTotal + missedTotal + enquiriesTotal

  const issues: DataQualityIssue[] = []
  const check = async (kind: string, label: string, table: string, severity: DataQualityIssue["severity"], sql: string) => {
    const n = await count(sql, COMPANY_ID)
    if (n > 0) issues.push({ kind, label, count: n, severity, table })
  }

  await check("missing_name", "Missing customer names", "leads", "high",
    `SELECT COUNT(*) AS n FROM leads WHERE company_id = ?1 AND (name IS NULL OR TRIM(name) = '')`)
  await check("missing_phone", "Missing phone numbers", "leads", "medium",
    `SELECT COUNT(*) AS n FROM leads WHERE company_id = ?1 AND (phone IS NULL OR TRIM(phone) = '')`)
  await check("missing_value", "Missing estimate amounts", "estimates", "high",
    `SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND (amount IS NULL OR amount <= 0)`)
  await check("missing_date", "Missing estimate dates", "estimates", "medium",
    `SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND sent_at IS NULL`)
  {
    const n = await count(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND sent_at > ?2`, COMPANY_ID, nowIso())
    if (n > 0) issues.push({ kind: "impossible_date", label: "Estimates dated in the future", count: n, severity: "high", table: "estimates" })
  }
  await check("missing_followup", "Open estimates with no follow-up history", "estimates", "low",
    `SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND quote_status IN ('sent','followup_due','no_response') AND last_contact_at IS NULL`)
  await check("missing_response", "Enquiries with no recorded response time", "enquiries", "medium",
    `SELECT COUNT(*) AS n FROM enquiries WHERE company_id = ?1 AND response_minutes IS NULL`)

  // Duplicate customers — same normalized name appearing more than once
  const dupRes = await db
    .prepare(
      `SELECT LOWER(TRIM(name)) AS nm, COUNT(*) AS c FROM leads WHERE company_id = ?1 AND name IS NOT NULL AND TRIM(name) != ''
       GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1`
    )
    .bind(COMPANY_ID)
    .all<{ nm: string; c: number }>()
  const dupRows = dupRes.results ?? []
  const dupCount = dupRows.reduce((s, r) => s + (Number(r.c) - 1), 0)
  if (dupCount > 0) {
    issues.push({ kind: "duplicate_customers", label: "Possible duplicate customers (same name)", count: dupCount, severity: "medium", table: "leads" })
  }

  const completeness = []
  const leadNameOk = leadsTotal ? await count(`SELECT COUNT(*) AS n FROM leads WHERE company_id = ?1 AND name IS NOT NULL AND TRIM(name) != ''`, COMPANY_ID) : 0
  const leadPhoneOk = leadsTotal ? await count(`SELECT COUNT(*) AS n FROM leads WHERE company_id = ?1 AND phone IS NOT NULL AND TRIM(phone) != ''`, COMPANY_ID) : 0
  const estAmountOk = estimatesTotal ? await count(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND amount IS NOT NULL AND amount > 0`, COMPANY_ID) : 0
  const followOk = estimatesTotal ? await count(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND last_contact_at IS NOT NULL`, COMPANY_ID) : 0
  completeness.push({ label: "Complete customer identity", pct: leadsTotal ? Math.round((leadNameOk / leadsTotal) * 100) : 100 })
  completeness.push({ label: "Contact information available", pct: leadsTotal ? Math.round((leadPhoneOk / leadsTotal) * 100) : 100 })
  completeness.push({ label: "Estimate values available", pct: estimatesTotal ? Math.round((estAmountOk / estimatesTotal) * 100) : 100 })
  completeness.push({ label: "Follow-up history available", pct: estimatesTotal ? Math.round((followOk / estimatesTotal) * 100) : 100 })

  // Deterministic score: start 100, subtract weighted issue density per record.
  const weight: Record<DataQualityIssue["severity"], number> = { high: 6, medium: 3, low: 1 }
  const penalty = issues.reduce((s, i) => s + weight[i.severity] * Math.min(3, i.count / Math.max(1, records) * 10), 0)
  const score = records === 0 ? 0 : Math.max(0, Math.min(100, Math.round(100 - penalty)))

  const band: DataQuality["band"] = records === 0 ? "insufficient" : score >= 85 ? "high" : score >= 60 ? "acceptable" : "poor"
  const importantMissing = issues.filter((i) => i.severity === "high").reduce((s, i) => s + i.count, 0)
  const summary =
    records === 0
      ? "No records to analyze yet."
      : `${importantMissing} important fields are missing across ${records} analyzed records${issues.length ? `; ${issues.length} issue type${issues.length === 1 ? "" : "s"} detected` : ""}.`

  return { score, band, records_analyzed: records, issues, completeness, summary, analyzed_at: nowIso() }
}

// =====================================================================
// CALIBRATION — measure predictions against outcomes, or say nothing
// =====================================================================

export interface Calibration {
  status: "insufficient_data" | "available"
  message: string
  closed_opportunities: number
  recovered_opportunities: number
  measured_recovery_rate: number | null
  precision_of_flags: number | null
  precision_note: string
  false_positive_review: string
  measured_recovered_revenue: number
}

export async function buildCalibration(db: Database): Promise<Calibration> {
  const opps = await listOpportunities(db)
  const closed = opps.filter((o) => o.stage === "recovered" || o.stage === "lost")
  const recovered = closed.filter((o) => o.stage === "recovered")
  const recoveredRevenue = recovered.reduce((s, o) => s + Number(o.recovered_value ?? 0), 0)

  // Precision of flags: of opportunities that reached a definitive outcome,
  // how many were genuinely actionable (recovered) vs qualified-out (lost)?
  // Meaningful only once enough outcomes exist.
  const MIN_OBSERVATIONS = 10
  if (closed.length < MIN_OBSERVATIONS) {
    return {
      status: "insufficient_data",
      message: `Accuracy measurement unavailable — insufficient historical outcomes (${closed.length} of ${MIN_OBSERVATIONS} needed). VÉRIA will report calibration once enough opportunities reach a recorded outcome.`,
      closed_opportunities: closed.length,
      recovered_opportunities: recovered.length,
      measured_recovery_rate: null,
      precision_of_flags: null,
      precision_note: "Not yet measurable — closed opportunities have not accumulated enough observations.",
      false_positive_review:
        "VÉRIA deliberately does not guess this number. Opportunities marked lost are reviewed as potential over-flags once volume allows.",
      measured_recovered_revenue: recoveredRevenue
    }
  }
  return {
    status: "available",
    message: `Measured across ${closed.length} opportunities that reached a definitive recorded outcome.`,
    closed_opportunities: closed.length,
    recovered_opportunities: recovered.length,
    measured_recovery_rate: recovered.length / closed.length,
    precision_of_flags: recovered.length / closed.length,
    precision_note: `Of ${closed.length} flagged opportunities that closed, ${recovered.length} converted to recorded recovery.`,
    false_positive_review:
      "Lost opportunities remain visible for review — VÉRIA treats them as potential false positives and keeps them auditable.",
    measured_recovered_revenue: recoveredRevenue
  }
}

// =====================================================================
// REVENUE WATCH — what changed since the comparable period
// =====================================================================

export interface WatchChange {
  key: string
  label: string
  current: number
  previous: number
  delta: number
  pct_change: number | null
  direction: "up" | "down" | "flat"
  good_direction: "up" | "down" | "none"
  note: string
}

export interface RevenueWatch {
  period_days: number
  current: { start: string; end: string }
  previous: { start: string; end: string }
  items: WatchChange[]
  new_opportunities: number
  recovered_this_period: { count: number; value: number }
  comparability_note: string
}

export async function buildRevenueWatch(db: Database, periodDays = 7): Promise<RevenueWatch> {
  const now = Date.now()
  const curStart = isoDaysAgo(periodDays)
  const prevStart = isoDaysAgo(periodDays * 2)

  const inWindow = (ts: string | null | undefined, start: string) => !!ts && ts >= start

  const enqCur = await db
    .prepare(`SELECT response_minutes FROM enquiries WHERE company_id = ?1 AND received_at >= ?2`)
    .bind(COMPANY_ID, curStart)
    .all<{ response_minutes: number | null }>()
  const enqPrev = await db
    .prepare(`SELECT response_minutes FROM enquiries WHERE company_id = ?1 AND received_at >= ?2 AND received_at < ?3`)
    .bind(COMPANY_ID, prevStart, curStart)
    .all<{ response_minutes: number | null }>()

  const missedCur = await db
    .prepare(`SELECT COUNT(*) AS n FROM missed_calls WHERE company_id = ?1 AND called_at >= ?2`)
    .bind(COMPANY_ID, curStart)
    .first<{ n: number }>()
  const missedPrev = await db
    .prepare(`SELECT COUNT(*) AS n FROM missed_calls WHERE company_id = ?1 AND called_at >= ?2 AND called_at < ?3`)
    .bind(COMPANY_ID, prevStart, curStart)
    .first<{ n: number }>()

  const quotesCur = await db
    .prepare(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND quote_status IN ('sent','followup_due','no_response') AND sent_at >= ?2`)
    .bind(COMPANY_ID, curStart)
    .first<{ n: number }>()
  const quotesPrev = await db
    .prepare(`SELECT COUNT(*) AS n FROM estimates WHERE company_id = ?1 AND quote_status IN ('sent','followup_due','no_response') AND sent_at >= ?2 AND sent_at < ?3`)
    .bind(COMPANY_ID, prevStart, curStart)
    .first<{ n: number }>()

  const mkItem = (key: string, label: string, current: number, previous: number, good: "up" | "down" | "none", note: string): WatchChange => {
    const delta = current - previous
    const pct = previous > 0 ? delta / previous : null
    return {
      key,
      label,
      current,
      previous,
      delta,
      pct_change: pct,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      good_direction: good,
      note
    }
  }

  const slow = (rows: { response_minutes: number | null }[]) => rows.filter((r) => r.response_minutes !== null && r.response_minutes >= 120).length
  const noResp = (rows: { response_minutes: number | null }[]) => rows.filter((r) => r.response_minutes === null).length

  const items: WatchChange[] = [
    mkItem("missed_enquiries", "Missed enquiries", Number(missedCur?.n ?? 0), Number(missedPrev?.n ?? 0), "down",
      "Calls with no recorded answer — every one is a high-intent customer."),
    mkItem("slow_responses", "Slow responses (2h+)", slow(enqCur.results ?? []), slow(enqPrev.results ?? []), "down",
      "Enquiries that waited two hours or more for a first response."),
    mkItem("no_response", "Enquiries never answered", noResp(enqCur.results ?? []), noResp(enqPrev.results ?? []), "down",
      "Received but never responded to."),
    mkItem("open_quotes", "New open quotes awaiting follow-up", Number(quotesCur?.n ?? 0), Number(quotesPrev?.n ?? 0), "none",
      "New quotes in the follow-up window — value depends on follow-through.")
  ]

  const oppsAll = await listOpportunities(db)
  const newOpps = oppsAll.filter((o) => o.created_at >= curStart).length
  const recoveredPeriod = oppsAll.filter((o) => o.stage === "recovered" && inWindow(o.updated_at, curStart))

  return {
    period_days: periodDays,
    current: { start: curStart.slice(0, 10), end: nowIso().slice(0, 10) },
    previous: { start: prevStart.slice(0, 10), end: curStart.slice(0, 10) },
    items,
    new_opportunities: newOpps,
    recovered_this_period: {
      count: recoveredPeriod.length,
      value: recoveredPeriod.reduce((s, o) => s + Number(o.recovered_value ?? 0), 0)
    },
    comparability_note:
      periodDays === 7
        ? "Compared with the immediately preceding 7-day window. Periods of unequal demand (holidays, seasonal spikes) can distort the comparison."
        : "Compared with the immediately preceding equal-length window."
  }
}
