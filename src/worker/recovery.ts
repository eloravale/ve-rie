import { COMPANY_ID, newId, nowIso, type Database } from "./db"
import { audit } from "./audit"
import { ledgerRecoveredSummary, recordRecovered } from "./ledger"
import { opportunityScore } from "./score"
import { ValidationError, idOrNull, nonNegativeNumber, optionalString } from "./validation"
import type { Followup, Lead } from "./types"
import { getLead, updateLead } from "./leads"

/** Money formatting for human-readable audit/action text. */
export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`
}

const DAY = 86_400_000
function sqlNow(): number {
  return Date.now()
}
function isoDaysAgo(days: number): string {
  const d = new Date(sqlNow() - days * DAY)
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace("T", " ").replace("Z", "")
}
function tsToMs(ts: string | null | undefined): number {
  if (!ts) return 0
  const t = Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z")
  return Number.isNaN(t) ? 0 : t
}

async function allLeads(db: Database): Promise<Lead[]> {
  const res = await db
    .prepare(
      `SELECT id, company_id, name, email, phone, service, status, source, urgency,
        estimated_value, notes, next_action, next_action_at, last_activity_at, recovered_via, lost_reason,
        created_at, updated_at
       FROM leads WHERE company_id = ?1`
    )
    .bind(COMPANY_ID)
    .all<Lead>()
  return (res.results ?? []) as Lead[]
}

// =====================================================================
// DASHBOARD
// =====================================================================

export interface DashboardMetrics {
  company: { id: string; name: string; city: string; state: string; phone: string; website: string; avg_ticket: number }
  revenue_recovered: number
  revenue_recovered_count: number
  /** Epistemic breakdown of revenue_recovered — assumed money is never presented as recorded money. */
  revenue_recovered_basis: { opportunity: number; recorded: number; assumed: number; analytical: number }
  revenue_at_risk: number
  revenue_at_risk_count: number
  qualified_leads: number
  leads_needing_action: number
  missed_calls_open: number
  missed_calls_recovered_value: number
  estimates_awaiting_followup: number
  estimates_awaiting_value: number
  dormant_opportunities: number
  dormant_value: number
  appointments_upcoming: number
  pipeline_value: number
  brief: Brief
  radar: RadarItem[]
  recent_activity: ActivityItem[]
}

function isAtRisk(l: Lead, now: number): boolean {
  if (["won", "lost", "unqualified"].includes(l.status)) return false
  const idle = (now - tsToMs(l.last_activity_at)) / DAY
  // 30+ days of silence is counted separately as a dormant reactivation opportunity.
  if (idle >= 30) return false
  if (l.status === "estimate_sent") return idle >= 2
  if (["new", "contacted"].includes(l.status)) return idle >= 2
  if (l.status === "qualified") return idle >= 5
  if (["appointment_requested", "appointment_booked"].includes(l.status)) return idle >= 3
  return false
}

/** Overdue or due-now follow-ups and stale new leads — what needs action today. */
function needingAction(leads: Lead[], followups: Record<string, unknown>[], now: number): number {
  const nowIsoStr = new Date(now).toISOString().slice(0, 19).replace("T", " ")
  let n = 0
  const flagged = new Set<string>()
  for (const f of followups) {
    const status = String(f.status)
    const due = String(f.due_at ?? "")
    if (status === "pending" && due && due <= nowIsoStr) {
      n++
      flagged.add(String(f.lead_id))
    }
  }
  for (const l of leads) {
    if (flagged.has(l.id)) continue
    if (l.status === "new" && (now - tsToMs(l.created_at)) / DAY >= 2) n++
    else if (l.next_action_at && tsToMs(l.next_action_at) <= now && !["won", "lost", "unqualified"].includes(l.status)) n++
  }
  return n
}

export interface Brief {
  date: string
  company_name: string
  headline: string
  items: { label: string; value: string }[]
  at_risk_total: number
  actions: { rank: number; title: string; lead_id: string | null; value: number; why: string }[]
}

export async function buildBrief(db: Database): Promise<Brief> {
  const leads = await allLeads(db)
  const fuRes = await db
    .prepare(`SELECT id, lead_id, status, due_at, recommended_action FROM followups WHERE company_id = ?1 AND status = 'pending'`)
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  const followups = fuRes.results ?? []
  const now = sqlNow()

  const atRiskLeads = leads.filter((l) => isAtRisk(l, now))
  const atRiskTotal = atRiskLeads.reduce((s, l) => s + l.estimated_value, 0)

  const fuRes2 = await db
    .prepare(`SELECT id, lead_id, status, due_at, recommended_action FROM followups WHERE company_id = ?1 AND status = 'pending' AND due_at <= ?2`)
    .bind(COMPANY_ID, new Date(now).toISOString().slice(0, 19).replace("T", " "))
    .all<Record<string, unknown>>()
  const overdue = fuRes2.results ?? []

  const staleNew = leads
    .filter((l) => l.status === "new" && (now - tsToMs(l.created_at)) / DAY >= 2)
    .sort((a, b) => b.estimated_value - a.estimated_value)

  const mcRes = await db
    .prepare(`SELECT id, caller_name, caller_phone, estimated_value FROM missed_calls WHERE company_id = ?1 AND recovered = 0 ORDER BY called_at ASC LIMIT 1`)
    .bind(COMPANY_ID)
    .first<Record<string, unknown>>()
  const missedCaller = mcRes ?? null

  type Action = { rank: number; title: string; lead_id: string | null; value: number; why: string }
  const actions: Action[] = []
  for (const f of overdue.slice(0, 4)) {
    const lead = leads.find((l) => l.id === String(f.lead_id))
    if (!lead) continue
    actions.push({
      rank: actions.length + 1,
      title: String(f.recommended_action || `Follow up with ${lead.name}`),
      lead_id: lead.id,
      value: lead.estimated_value,
      why: `Follow-up ${tsToMs(String(f.due_at)) < now ? "overdue" : "due"} — ${lead.status.replace(/_/g, " ")}`
    })
  }
  for (const l of staleNew.slice(0, 3)) {
    if (actions.some((a) => a.lead_id === l.id)) continue
    actions.push({
      rank: actions.length + 1,
      title: `Call ${l.name} — ${l.service ?? "new request"}`,
      lead_id: l.id,
      value: l.estimated_value,
      why: `New lead idle ${Math.floor((now - tsToMs(l.created_at)) / DAY)} days — first response wins these`
    })
  }
  if (missedCaller) {
    actions.push({
      rank: actions.length + 1,
      title: `Recover missed call — ${String(missedCaller.caller_name ?? missedCaller.caller_phone)}`,
      lead_id: missedCaller.lead_id ? String(missedCaller.lead_id) : null,
      value: Number(missedCaller.estimated_value ?? 0),
      why: `Missed ${Math.floor((now - tsToMs(String(missedCaller.called_at))) / DAY)} day(s) ago — still unrecovered`
    })
  }
  const dormant = await db
    .prepare(
      `SELECT r.id, r.lead_id, r.estimated_value, l.name, l.service FROM reactivations r JOIN leads l ON l.id = r.lead_id
       WHERE r.company_id = ?1 AND r.status = 'identified' ORDER BY r.estimated_value DESC LIMIT 1`
    )
    .bind(COMPANY_ID)
    .first<Record<string, unknown>>()
  if (dormant) {
    actions.push({
      rank: actions.length + 1,
      title: `Reactivate ${String(dormant.name)} — ${String(dormant.service ?? "dormant job")}`,
      lead_id: String(dormant.lead_id),
      value: Number(dormant.estimated_value ?? 0),
      why: `Dormant ${Math.floor((now - tsToMs(leads.find((l) => l.id === String(dormant.lead_id))?.last_activity_at ?? null)) / DAY)} days — worth a call`
    })
  }

  return {
    date: new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    company_name: "Cedar Ridge Heating & Cooling",
    headline:
      atRiskLeads.length > 0
        ? `${atRiskLeads.length} opportunities worth ${usd(atRiskTotal)} need attention today`
        : "No revenue at risk right now — clean board",
    items: [
      { label: "Leads needing immediate attention", value: String(needingAction(leads, followups, now)) },
      { label: "Estimates awaiting follow-up", value: String(leads.filter((l) => l.status === "estimate_sent").length) },
      { label: "Missed calls still unrecovered", value: String(missedCaller ? "1+" : "0") },
      { label: "Dormant opportunities", value: String(leads.filter((l) => (now - tsToMs(l.last_activity_at)) / DAY >= 30 && !["won", "lost", "unqualified"].includes(l.status)).length) },
      { label: "Estimated revenue at risk", value: usd(atRiskTotal) }
    ],
    at_risk_total: atRiskTotal,
    actions: actions.slice(0, 5)
  }
}

// =====================================================================
// LOST-REVENUE RADAR
// =====================================================================

export interface RadarItem {
  id: string
  kind: "missed_call" | "unanswered_lead" | "estimate_idle" | "dormant_lead" | "appointment_gap" | "high_value_action"
  issue: string
  lead_id: string | null
  lead_name: string
  detail: string
  estimated_value: number
  urgency: "low" | "normal" | "high" | "urgent"
  recommended_action: string
  score: number
}

const RADAR_URGENCY_RANK: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 }

export async function buildRadar(db: Database): Promise<RadarItem[]> {
  const leads = await allLeads(db)
  const now = sqlNow()
  const items: RadarItem[] = []

  // 1) Missed calls not yet recovered
  const mcRes = await db
    .prepare(`SELECT id, caller_name, caller_phone, called_at, estimated_value, lead_id FROM missed_calls WHERE company_id = ?1 AND recovered = 0`)
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  for (const mc of mcRes.results ?? []) {
    const days = Math.max(0, Math.floor((now - tsToMs(String(mc.called_at))) / DAY))
    items.push({
      id: `radar_${String(mc.id)}`,
      kind: "missed_call",
      issue: "Missed call — not recovered",
      lead_id: mc.lead_id ? String(mc.lead_id) : null,
      lead_name: String(mc.caller_name ?? mc.caller_phone ?? "Unknown caller"),
      detail: `Called ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}. Every unrecovered missed call is a job a competitor may get.`,
      estimated_value: Number(mc.estimated_value ?? 0),
      urgency: days >= 4 ? "high" : days >= 2 ? "normal" : "high",
      recommended_action: `Call ${String(mc.caller_name ?? mc.caller_phone ?? "the caller")} back today`,
      score: 90 + Math.min(9, days)
    })
  }

  // 2) New leads with no contact
  for (const l of leads) {
    if (l.status !== "new") continue
    const idle = Math.floor((now - tsToMs(l.last_activity_at)) / DAY)
    if (idle >= 2) {
      items.push({
        id: `radar_${l.id}_unanswered`,
        kind: "unanswered_lead",
        issue: "New lead — no contact",
        lead_id: l.id,
        lead_name: l.name,
        detail: `Requested ${l.service ?? "service"} ${idle} days ago and nobody has called. First responder usually wins the job.`,
        estimated_value: l.estimated_value,
        urgency: l.urgency === "urgent" ? "urgent" : idle >= 4 ? "high" : "normal",
        recommended_action: `Call ${l.name} to qualify`,
        score: 70 + Math.min(20, idle * 4)
      })
    }
  }

  // 3) Estimates sitting idle
  for (const l of leads) {
    if (l.status !== "estimate_sent") continue
    const idle = Math.floor((now - tsToMs(l.last_activity_at)) / DAY)
    if (idle >= 3) {
      items.push({
        id: `radar_${l.id}_estimate`,
        kind: "estimate_idle",
        issue: "Estimate sent — no response",
        lead_id: l.id,
        lead_name: l.name,
        detail: `$${Math.round(l.estimated_value).toLocaleString()} estimate delivered ${idle} days ago. Most estimates close on follow-up #2 or #3, not #1.`,
        estimated_value: l.estimated_value,
        urgency: idle >= 7 ? "high" : "normal",
        recommended_action: `Follow up with ${l.name} on the ${usd(l.estimated_value)} estimate`,
        score: 75 + Math.min(15, idle)
      })
    }
  }

  // 4) Dormant leads
  for (const l of leads) {
    if (["won", "lost", "unqualified"].includes(l.status)) continue
    const idle = Math.floor((now - tsToMs(l.last_activity_at)) / DAY)
    if (idle >= 30) {
      items.push({
        id: `radar_${l.id}_dormant`,
        kind: "dormant_lead",
        issue: "Dormant lead — reactivation chance",
        lead_id: l.id,
        lead_name: l.name,
        detail: `Interested ${idle} days ago, then went quiet. Season changes and budgets reset — worth one outreach.`,
        estimated_value: l.estimated_value,
        urgency: "normal",
        recommended_action: `Reactivate ${l.name} with a fresh offer`,
        score: 55 + Math.min(15, Math.floor(l.estimated_value / 1000))
      })
    }
  }

  // 5) Appointment gaps — requested but never booked
  for (const l of leads) {
    if (l.status !== "appointment_requested") continue
    const idle = Math.floor((now - tsToMs(l.last_activity_at)) / DAY)
    if (idle >= 2) {
      items.push({
        id: `radar_${l.id}_appt`,
        kind: "appointment_gap",
        issue: "Appointment requested — not confirmed",
        lead_id: l.id,
        lead_name: l.name,
        detail: `Asked for a visit ${idle} days ago. Unconfirmed requests quietly become lost jobs.`,
        estimated_value: l.estimated_value,
        urgency: "high",
        recommended_action: `Confirm a slot with ${l.name}`,
        score: 72
      })
    }
  }

  // 6) High-value leads requiring action
  for (const l of leads) {
    if (["won", "lost", "unqualified"].includes(l.status)) continue
    if (l.estimated_value >= 6000 && (now - tsToMs(l.last_activity_at)) / DAY >= 3) {
      if (items.some((i) => i.lead_id === l.id)) continue
      items.push({
        id: `radar_${l.id}_highvalue`,
        kind: "high_value_action",
        issue: "High-value lead — needs action",
        lead_id: l.id,
        lead_name: l.name,
        detail: `$${Math.round(l.estimated_value).toLocaleString()} opportunity waiting on the next step. Big jobs are won by whoever moves first.`,
        estimated_value: l.estimated_value,
        urgency: "high",
        recommended_action: l.next_action ?? `Move ${l.name} to the next stage`,
        score: 80 + Math.min(12, Math.floor(l.estimated_value / 1000))
      })
    }
  }

  items.sort((a, b) => b.score - a.score || RADAR_URGENCY_RANK[b.urgency] - RADAR_URGENCY_RANK[a.urgency])
  return items
}

// =====================================================================
// DASHBOARD ASSEMBLY
// =====================================================================

export interface ActivityItem {
  id: string
  actor: string
  action: string
  entity_type: string
  entity_id: string | null
  detail: string | null
  created_at: string
}

export async function buildDashboard(db: Database): Promise<DashboardMetrics> {
  const now = sqlNow()
  const leads = await allLeads(db)

  const fuRes = await db
    .prepare(`SELECT id, lead_id, status, due_at FROM followups WHERE company_id = ?1 AND status = 'pending'`)
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  const pendingFollowups = fuRes.results ?? []

  const companyRow = await db
    .prepare(`SELECT id, name, city, state, phone, website, avg_ticket FROM companies WHERE id = ?1`)
    .bind(COMPANY_ID)
    .first<Record<string, unknown>>()

  // Recovered revenue comes ONLY from the canonical ledger (kind='recovered').
  // Before Phase 0 this summed status='won' leads — a different, overlapping
  // definition (routine wins included, some recoveries missing) that produced
  // a different headline than the recovery pipeline. One ledger, one truth.
  const ledger = await ledgerRecoveredSummary(db)

  const atRiskLeads = leads.filter((l) => isAtRisk(l, now))
  const revenueAtRisk = atRiskLeads.reduce((s, l) => s + l.estimated_value, 0)

  const dormantLeads = leads.filter(
    (l) => (now - tsToMs(l.last_activity_at)) / DAY >= 30 && !["won", "lost", "unqualified"].includes(l.status)
  )

  const mcOpen = await db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(estimated_value), 0) AS v FROM missed_calls WHERE company_id = ?1 AND recovered = 0`)
    .bind(COMPANY_ID)
    .first<{ n: number; v: number }>()
  const mcRecovered = await db
    .prepare(`SELECT COALESCE(SUM(estimated_value), 0) AS v FROM missed_calls WHERE company_id = ?1 AND recovered = 1`)
    .bind(COMPANY_ID)
    .first<{ v: number }>()

  const apptUpcoming = await db
    .prepare(`SELECT COUNT(*) AS n FROM appointments WHERE company_id = ?1 AND status = 'scheduled' AND scheduled_for >= ?2`)
    .bind(COMPANY_ID, isoDaysAgo(0))
    .first<{ n: number }>()

  const estimateLeads = leads.filter((l) => l.status === "estimate_sent")

  const audRes = await db
    .prepare(`SELECT id, actor, action, entity_type, entity_id, detail, created_at FROM audit_events WHERE company_id = ?1 ORDER BY created_at DESC LIMIT 8`)
    .bind(COMPANY_ID)
    .all<ActivityItem>()

  const [brief, radar] = await Promise.all([buildBrief(db), buildRadar(db)])

  return {
    company: {
      id: String(companyRow?.id ?? COMPANY_ID),
      name: String(companyRow?.name ?? "Cedar Ridge Heating & Cooling"),
      city: String(companyRow?.city ?? "Tulsa"),
      state: String(companyRow?.state ?? "OK"),
      phone: String(companyRow?.phone ?? ""),
      website: String(companyRow?.website ?? ""),
      avg_ticket: Number(companyRow?.avg_ticket ?? 4800)
    },
    revenue_recovered: ledger.recovered_revenue,
    revenue_recovered_count: ledger.recovered_events,
    revenue_recovered_basis: ledger.by_basis,
    revenue_at_risk: revenueAtRisk,
    revenue_at_risk_count: atRiskLeads.length,
    qualified_leads: leads.filter((l) => l.status === "qualified").length,
    leads_needing_action: needingAction(leads, pendingFollowups, now),
    missed_calls_open: mcOpen?.n ?? 0,
    missed_calls_recovered_value: mcRecovered?.v ?? 0,
    estimates_awaiting_followup: estimateLeads.length,
    estimates_awaiting_value: estimateLeads.reduce((s, l) => s + l.estimated_value, 0),
    dormant_opportunities: dormantLeads.length,
    dormant_value: dormantLeads.reduce((s, l) => s + l.estimated_value, 0),
    appointments_upcoming: apptUpcoming?.n ?? 0,
    pipeline_value: leads.filter((l) => !["won", "lost", "unqualified"].includes(l.status)).reduce((s, l) => s + l.estimated_value, 0),
    brief,
    radar: radar.slice(0, 8),
    recent_activity: (audRes.results ?? []) as ActivityItem[]
  }
}

// =====================================================================
// MISSED CALLS
// =====================================================================

export interface MissedCall {
  id: string
  company_id: string
  caller_name: string | null
  caller_phone: string
  called_at: string
  recovered: number
  lead_id: string | null
  estimated_value: number
  notes: string | null
  created_at: string
  updated_at: string
}

export async function listMissedCalls(db: Database): Promise<MissedCall[]> {
  const res = await db
    .prepare(
      `SELECT id, company_id, caller_name, caller_phone, called_at, recovered, lead_id, estimated_value, notes, created_at, updated_at
       FROM missed_calls WHERE company_id = ?1 ORDER BY recovered ASC, called_at DESC`
    )
    .bind(COMPANY_ID)
    .all<MissedCall>()
  return (res.results ?? []) as MissedCall[]
}

/**
 * Demo-safe recovery of a missed call: creates a lead (if none), records the
 * recovery, and queues an owner call-back task. No SMS/voice is sent.
 */
export async function recoverMissedCall(db: Database, id: string): Promise<{ missed_call: MissedCall; lead: Lead; task_id: string }> {
  const mcRow = await db
    .prepare(`SELECT * FROM missed_calls WHERE id = ?1 AND company_id = ?2`)
    .bind(id, COMPANY_ID)
    .first<MissedCall>()
  const mc = mcRow as MissedCall | null
  if (!mc) throw new ValidationError("Missed call not found", { id: "not_found" })
  if (mc.recovered) throw new ValidationError("Missed call already recovered", { id: "already_recovered" })

  let lead: Lead | null = mc.lead_id ? await getLead(db, mc.lead_id) : null
  const now = nowIso()
  if (!lead) {
    const name = mc.caller_name ?? `Missed caller ${mc.caller_phone}`
    const lid = newId("ldg")
    await db
      .prepare(
        `INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency,
          estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at)
         VALUES (?1,?2,?3,NULL,?4,'Phone service request (missed call)','new','phone','high',?5,?6,?7,?8,?9,?10,?11)`
      )
      .bind(
        lid, COMPANY_ID, name, mc.caller_phone, mc.estimated_value,
        `Auto-created from missed call ${mc.id}. ${mc.notes ?? ""}`.trim(),
        "Call back — recover the missed call.",
        isoDaysAgo(-0.166), now, now, now
      )
      .run()
    lead = (await getLead(db, lid)) as Lead
    await audit(db, { entityType: "lead", entityId: lid, action: "lead_created", detail: `Lead auto-created from missed call ${mc.id}.` })
  }

  await db
    .prepare(`UPDATE missed_calls SET recovered = 1, lead_id = ?3, updated_at = ?4 WHERE id = ?1 AND company_id = ?2`)
    .bind(id, COMPANY_ID, lead.id, now)
    .run()

  const taskId = newId("htk")
  await db
    .prepare(
      `INSERT INTO human_tasks (id, company_id, lead_id, title, reason, estimated_value, priority, recommended_action, status, due_at, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,'high',?7,'open',?8,?9,?10)`
    )
    .bind(
      taskId, COMPANY_ID, lead.id,
      `Call back ${lead.name}`,
      "Missed-call recovery — personal call-back required (demo action; no SMS sent).",
      mc.estimated_value,
      "Call within 4 business hours. Offer same-week diagnostic.",
      isoDaysAgo(-0.166), now, now
    )
    .run()

  await audit(db, { entityType: "missed_call", entityId: id, action: "recovery_action_generated", detail: `Recovery workflow generated for ${lead.name} (${usd(mc.estimated_value)} at risk).` })

  const mcUpdated = (await db.prepare(`SELECT * FROM missed_calls WHERE id = ?1 AND company_id = ?2`).bind(id, COMPANY_ID).first<MissedCall>()) as MissedCall
  return { missed_call: mcUpdated, lead, task_id: taskId }
}

// =====================================================================
// FOLLOW-UPS
// =====================================================================

export async function listFollowups(db: Database, status?: string): Promise<(Followup & { lead_name: string | null; lead_status: string | null; estimated_value: number | null })[]> {
  let sql = `SELECT f.*, l.name AS lead_name, l.status AS lead_status, l.estimated_value
    FROM followups f JOIN leads l ON l.id = f.lead_id
    WHERE f.company_id = ?1`
  const params: unknown[] = [COMPANY_ID]
  if (status && status !== "all") {
    sql += ` AND f.status = ?2`
    params.push(status)
  }
  sql += ` ORDER BY CASE f.status WHEN 'pending' THEN 0 ELSE 1 END ASC, f.due_at ASC`
  const res = await db.prepare(sql).bind(...params).all<Record<string, unknown>>()
  return (res.results ?? []) as unknown as (Followup & { lead_name: string | null; lead_status: string | null; estimated_value: number | null })[]
}

const FOLLOWUP_KINDS = ["general", "new_lead", "estimate", "reactivation"]

export async function createFollowup(db: Database, body: Record<string, unknown>): Promise<Followup> {
  const leadId = idOrNull(body.lead_id, "lead_id")
  if (!leadId) throw new ValidationError("lead_id is required", { lead_id: "required" })
  const lead = await getLead(db, leadId)
  if (!lead) throw new ValidationError("Lead not found", { lead_id: "not_found" })
  const kind = typeof body.kind === "string" && FOLLOWUP_KINDS.includes(body.kind) ? body.kind : "general"
  const due = optionalString(body.due_at, "due_at", 40)
  const action = optionalString(body.recommended_action, "recommended_action", 500)

  const id = newId("flw")
  const now = nowIso()
  await db
    .prepare(
      `INSERT INTO followups (id, company_id, lead_id, estimate_id, kind, status, due_at, recommended_action, notes, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,'pending',?6,?7,?8,?9,?10)`
    )
    .bind(id, COMPANY_ID, leadId, idOrNull(body.estimate_id, "estimate_id"), kind, due, action, optionalString(body.notes, "notes"), now, now)
    .run()

  await audit(db, { entityType: "followup", entityId: id, action: "followup_scheduled", detail: `Follow-up scheduled for ${lead.name}${due ? ` — due ${due}` : ""}.` })

  const row = await db.prepare(`SELECT * FROM followups WHERE id = ?1`).bind(id).first<Followup>()
  return row as Followup
}

/** Complete a follow-up; outcome "recovered" marks the lead won at its value. */
export async function completeFollowup(db: Database, id: string, body: Record<string, unknown>): Promise<Followup> {
  const row = await db.prepare(`SELECT * FROM followups WHERE id = ?1 AND company_id = ?2`).bind(id, COMPANY_ID).first<Followup>()
  const fu = row as Followup | null
  if (!fu) throw new ValidationError("Follow-up not found", { id: "not_found" })
  if (fu.status !== "pending") throw new ValidationError("Follow-up is not pending", { id: "invalid_state" })

  const outcome = optionalString(body.outcome, "outcome", 40) ?? "completed"
  const now = nowIso()
  await db
    .prepare(`UPDATE followups SET status = 'completed', outcome = ?3, completed_at = ?4, updated_at = ?5 WHERE id = ?1 AND company_id = ?2`)
    .bind(id, COMPANY_ID, outcome, now, now)
    .run()

  const lead = await getLead(db, fu.lead_id)
  if (lead) {
    if (outcome === "recovered") {
      const wonValue = lead.estimated_value || 4800
      await updateLead(db, lead.id, { status: "won", estimated_value: wonValue })
      // Canonical ledger: an explicitly recovered follow-up is recorded money
      // (owner recorded the outcome). Deterministic per follow-up id — a
      // retried completion can never write a second recovery event.
      await recordRecovered(db, {
        opportunityId: null,
        value: wonValue,
        valueBasis: "recorded",
        outcomeType: outcome,
        actor: "owner",
        evidenceRef: `followup:${id}`,
        eventKey: `rev_${COMPANY_ID}:fu_${id}:recovered`
      })
    } else if (outcome === "lost") {
      await updateLead(db, lead.id, { status: "lost" })
    } else if (lead.status === "new") {
      await updateLead(db, lead.id, { status: "contacted" })
    }
  }

  await audit(db, {
    entityType: "followup",
    entityId: id,
    action: "followup_completed",
    detail:
      outcome === "recovered"
        ? `Follow-up complete — ${usd(lead?.estimated_value ?? 0)} recovered.`
        : outcome === "lost"
          ? "Follow-up complete — opportunity marked lost."
          : "Follow-up completed."
  })

  const updated = await db.prepare(`SELECT * FROM followups WHERE id = ?1`).bind(id).first<Followup>()
  return updated as Followup
}

// =====================================================================
// ESTIMATES
// =====================================================================

export interface EstimateWithLead extends Record<string, unknown> {
  id: string
  lead_id: string
  amount: number
  status: string
  sent_at: string | null
  expires_at: string | null
  notes: string | null
  lead_name: string
  lead_status: string
  service: string | null
}

export async function listEstimates(db: Database, status?: string): Promise<EstimateWithLead[]> {
  let sql = `SELECT e.id, e.lead_id, e.amount, e.status, e.sent_at, e.expires_at, e.notes,
    l.name AS lead_name, l.status AS lead_status, l.service
    FROM estimates e JOIN leads l ON l.id = e.lead_id WHERE e.company_id = ?1`
  const params: unknown[] = [COMPANY_ID]
  if (status && status !== "all") {
    sql += ` AND e.status = ?2`
    params.push(status)
  }
  sql += ` ORDER BY e.sent_at DESC`
  const res = await db.prepare(sql).bind(...params).all<Record<string, unknown>>()
  return (res.results ?? []) as EstimateWithLead[]
}

export async function createEstimate(db: Database, body: Record<string, unknown>): Promise<EstimateWithLead> {
  const leadId = idOrNull(body.lead_id, "lead_id")
  if (!leadId) throw new ValidationError("lead_id is required", { lead_id: "required" })
  const lead = await getLead(db, leadId)
  if (!lead) throw new ValidationError("Lead not found", { lead_id: "not_found" })
  const amount = nonNegativeNumber(body.amount, "amount", 0)
  if (amount <= 0) throw new ValidationError("amount must be greater than 0", { amount: "invalid" })

  const id = newId("est")
  const now = nowIso()
  await db
    .prepare(
      `INSERT INTO estimates (id, company_id, lead_id, amount, status, sent_at, expires_at, notes, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
    )
    .bind(id, COMPANY_ID, leadId, amount, "sent", now, isoDaysAgo(-14), optionalString(body.notes, "notes"), now, now)
    .run()

  await db
    .prepare(`UPDATE leads SET status = 'estimate_sent', last_activity_at = ?3, updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
    .bind(leadId, COMPANY_ID, now)
    .run()

  await db
    .prepare(
      `INSERT INTO followups (id, company_id, lead_id, estimate_id, kind, status, due_at, recommended_action, created_at, updated_at)
       VALUES (?1,?2,?3,?4,'estimate','pending',?5,?6,?7,?7)`
    )
    .bind(newId("flw"), COMPANY_ID, leadId, id, isoDaysAgo(-3), `Follow up on the ${usd(amount)} estimate with ${lead.name}.`, now)
    .run()

  await audit(db, { entityType: "estimate", entityId: id, action: "estimate_sent", detail: `Simulated estimate (${usd(amount)}) recorded for ${lead.name}; follow-up auto-scheduled.` })

  const row = await db
    .prepare(
      `SELECT e.id, e.lead_id, e.amount, e.status, e.sent_at, e.expires_at, e.notes, l.name AS lead_name, l.status AS lead_status, l.service
       FROM estimates e JOIN leads l ON l.id = e.lead_id WHERE e.id = ?1`
    )
    .bind(id)
    .first<EstimateWithLead>()
  return row as EstimateWithLead
}

// =====================================================================
// REACTIVATIONS
// =====================================================================

export async function listReactivations(db: Database): Promise<(Record<string, unknown> & { lead_name: string; lead_status: string; service: string | null; last_activity_at: string | null })[]> {
  const res = await db
    .prepare(
      `SELECT r.*, l.name AS lead_name, l.status AS lead_status, l.service, l.last_activity_at, l.phone
       FROM reactivations r JOIN leads l ON l.id = r.lead_id
       WHERE r.company_id = ?1 ORDER BY r.estimated_value DESC`
    )
    .bind(COMPANY_ID)
    .all<Record<string, unknown>>()
  return (res.results ?? []) as (Record<string, unknown> & { lead_name: string; lead_status: string; service: string | null; last_activity_at: string | null })[]
}

/** Identify dormant leads (no activity ≥ 30 days) and create reactivation records. */
export async function identifyReactivations(db: Database): Promise<{ created: number; reactivations: unknown[] }> {
  const now = sqlNow()
  const leads = await allLeads(db)
  const dormant = leads.filter(
    (l) => !["won", "lost", "unqualified"].includes(l.status) && (now - tsToMs(l.last_activity_at)) / DAY >= 30
  )
  const existing = await db.prepare(`SELECT lead_id FROM reactivations WHERE company_id = ?1 AND status = 'identified'`).bind(COMPANY_ID).all<{ lead_id: string }>()
  const have = new Set((existing.results ?? []).map((r) => r.lead_id))

  const createdRows: unknown[] = []
  for (const l of dormant) {
    if (have.has(l.id)) continue
    const id = newId("rea")
    const nowStr = nowIso()
    const idleDays = Math.floor((now - tsToMs(l.last_activity_at)) / DAY)
    await db
      .prepare(
        `INSERT INTO reactivations (id, company_id, lead_id, status, reason, estimated_value, recommended_action, identified_at, created_at, updated_at)
         VALUES (?1,?2,?3,'identified','dormant',?4,?5,?6,?7,?8)`
      )
      .bind(
        id, COMPANY_ID, l.id, l.estimated_value || 4800,
        `Reactivate ${l.name} — interested ${idleDays} days ago. Offer a fresh, specific next step.`,
        nowStr, nowStr, nowStr
      )
      .run()
    createdRows.push({ id, lead_id: l.id })
    await audit(db, { entityType: "reactivation", entityId: id, action: "reactivation_identified", detail: `${l.name} flagged dormant (${idleDays} days) — ${usd(l.estimated_value || 4800)} opportunity.` })
  }
  return { created: createdRows.length, reactivations: await listReactivations(db) }
}

/** Demo-safe reactivation: marks it contacted, queues an owner-approved task. */
export async function runReactivation(db: Database, id: string): Promise<{ reactivation: Record<string, unknown>; task_id: string }> {
  const row = await db.prepare(`SELECT * FROM reactivations WHERE id = ?1 AND company_id = ?2`).bind(id, COMPANY_ID).first<Record<string, unknown>>()
  const rea = row as Record<string, unknown> | null
  if (!rea) throw new ValidationError("Reactivation not found", { id: "not_found" })
  const lead = await getLead(db, String(rea.lead_id))
  if (!lead) throw new ValidationError("Lead not found", { lead_id: "not_found" })

  const now = nowIso()
  await db.prepare(`UPDATE reactivations SET status = 'outreach_queued', updated_at = ?3 WHERE id = ?1 AND company_id = ?2`).bind(id, COMPANY_ID, now).run()
  await db.prepare(`UPDATE leads SET last_activity_at = ?3, updated_at = ?3 WHERE id = ?1 AND company_id = ?2`).bind(lead.id, COMPANY_ID, now).run()

  const taskId = newId("htk")
  await db
    .prepare(
      `INSERT INTO human_tasks (id, company_id, lead_id, title, reason, estimated_value, priority, recommended_action, status, due_at, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,'medium',?7,'open',?8,?9,?10)`
    )
    .bind(
      taskId, COMPANY_ID, lead.id,
      `Reactivation call — ${lead.name}`,
      "Dormant lead reactivation — owner makes the personal call (demo action; no SMS sent).",
      Number(rea.estimated_value ?? 0),
      String(rea.recommended_action ?? "Call with a fresh, specific offer."),
      isoDaysAgo(-2), now, now
    )
    .run()

  await audit(db, { entityType: "reactivation", entityId: id, action: "reactivation_queued", detail: `Reactivation queued for ${lead.name} (${usd(Number(rea.estimated_value ?? 0))}) — owner call task created.` })

  const updated = await db.prepare(`SELECT * FROM reactivations WHERE id = ?1`).bind(id).first<Record<string, unknown>>()
  return { reactivation: updated as Record<string, unknown>, task_id: taskId }
}

// =====================================================================
// HUMAN TASKS (OWNER HANDOFF)
// =====================================================================

export async function listHumanTasks(db: Database, status?: string): Promise<(Record<string, unknown> & { lead_name: string | null })[]> {
  let sql = `SELECT t.*, l.name AS lead_name, l.phone AS lead_phone FROM human_tasks t LEFT JOIN leads l ON l.id = t.lead_id WHERE t.company_id = ?1`
  const params: unknown[] = [COMPANY_ID]
  if (status && status !== "all") {
    sql += ` AND t.status = ?2`
    params.push(status)
  }
  sql += ` ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC, CASE t.status WHEN 'open' THEN 0 ELSE 1 END ASC, t.due_at ASC`
  const res = await db.prepare(sql).bind(...params).all<Record<string, unknown>>()
  return (res.results ?? []) as (Record<string, unknown> & { lead_name: string | null })[]
}

export async function updateHumanTask(db: Database, id: string, body: Record<string, unknown>): Promise<Record<string, unknown> & { lead_name: string | null }> {
  const row = await db.prepare(`SELECT * FROM human_tasks WHERE id = ?1 AND company_id = ?2`).bind(id, COMPANY_ID).first<Record<string, unknown>>()
  const task = row as Record<string, unknown> | null
  if (!task) throw new ValidationError("Task not found", { id: "not_found" })

  const status = body.status
  if (typeof status !== "string" || !["open", "completed", "dismissed"].includes(status)) {
    throw new ValidationError("status must be open, completed, or dismissed", { status: "invalid" })
  }
  const now = nowIso()

  // Optional handoff enrichments: assign to a person, snooze with a concrete return date.
  const assignedTo = typeof body.assigned_to === "string" && body.assigned_to.trim() ? body.assigned_to.trim().slice(0, 60) : null
  const snoozeDays = typeof body.snooze_days === "number" && body.snooze_days > 0 ? Math.min(30, Math.round(body.snooze_days)) : 0

  await db
    .prepare(
      `UPDATE human_tasks SET status = ?3, assigned_to = COALESCE(?4, assigned_to),
         due_at = CASE WHEN ?5 > 0 THEN ?6 ELSE due_at END, updated_at = ?7
       WHERE id = ?1 AND company_id = ?2`
    )
    .bind(id, COMPANY_ID, status, assignedTo, snoozeDays, snoozeDays ? isoDaysAgo(-snoozeDays) : null, now)
    .run()

  await audit(db, {
    actor: "owner",
    entityType: "human_task",
    entityId: id,
    action: snoozeDays > 0 ? "task_snoozed" : status === "completed" ? "task_completed" : status === "dismissed" ? "task_dismissed" : "task_reopened",
    detail: snoozeDays > 0
      ? `Task "${String(task.title)}" snoozed ${snoozeDays} day${snoozeDays === 1 ? "" : "s"}.`
      : `Task "${String(task.title)}" ${status}${assignedTo ? ` — assigned to ${assignedTo}` : ""}.`
  })

  const updated = await db.prepare(`SELECT t.*, l.name AS lead_name FROM human_tasks t LEFT JOIN leads l ON l.id = t.lead_id WHERE t.id = ?1`).bind(id).first<Record<string, unknown>>()
  return updated as Record<string, unknown> & { lead_name: string | null }
}

// =====================================================================
// LEAD ACTIVITY (demo-safe actions)
// =====================================================================

export async function leadActivity(db: Database, leadId: string, body: Record<string, unknown>): Promise<{ lead: Lead; simulated: true }> {
  const lead = await getLead(db, leadId)
  if (!lead) throw new ValidationError("Lead not found", { lead_id: "not_found" })
  const action = typeof body.action === "string" ? body.action : ""
  const now = nowIso()

  if (action === "log_call") {
    await audit(db, { actor: "owner", entityType: "lead", entityId: leadId, action: "call_logged_simulated", detail: `Simulated call logged with ${lead.name} (demo mode — no real call placed).` })
    await db.prepare(`UPDATE leads SET status = ?4, last_activity_at = ?3, updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
      .bind(leadId, COMPANY_ID, now, lead.status === "new" ? "contacted" : lead.status)
      .run()
  } else if (action === "schedule_followup") {
    const days = typeof body.days === "number" && body.days > 0 ? Math.min(Math.round(body.days), 30) : 2
    const when = new Date(sqlNow() + days * DAY).toISOString().slice(0, 19).replace("T", " ")
    await db.prepare(`UPDATE leads SET next_action = ?4, next_action_at = ?5, updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
      .bind(leadId, COMPANY_ID, now, optionalString(body.next_action, "next_action", 300) ?? `Follow up with ${lead.name}`, when)
      .run()
    await createFollowup(db, { lead_id: leadId, kind: "general", due_at: when, recommended_action: optionalString(body.next_action, "next_action", 300) ?? `Follow up with ${lead.name}` })
    await audit(db, { entityType: "lead", entityId: leadId, action: "followup_scheduled", detail: `Follow-up scheduled for ${lead.name} on ${when}.` })
  } else if (action === "send_estimate") {
    await createEstimate(db, { lead_id: leadId, amount: lead.estimated_value || 4800, notes: "Recorded from lead detail (simulated delivery)." })
  } else if (action === "add_note") {
    const note = optionalString(body.note, "note", 1000)
    if (!note) throw new ValidationError("note is required", { note: "required" })
    await db.prepare(`UPDATE leads SET notes = ?4, last_activity_at = ?3, updated_at = ?3 WHERE id = ?1 AND company_id = ?2`)
      .bind(leadId, COMPANY_ID, now, `${lead.notes ? lead.notes + " | " : ""}${note}`)
      .run()
    await audit(db, { actor: "owner", entityType: "lead", entityId: leadId, action: "note_added", detail: note })
  } else {
    throw new ValidationError("Unknown action. Use log_call, schedule_followup, send_estimate, or add_note.", { action: "invalid" })
  }

  const updated = (await getLead(db, leadId)) as Lead
  return { lead: updated, simulated: true }
}

export { opportunityScore }
