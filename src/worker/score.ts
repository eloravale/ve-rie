/**
 * Opportunity Score — a transparent, deterministic 0–100 estimate of how likely
 * a lead is to turn into recoverable revenue if someone acts soon.
 *
 * No machine learning. Every point is explainable to an HVAC business owner:
 * bigger jobs, urgent customers, newer leads, and estimates sitting idle are
 * where money is won or lost first.
 */

import type { Lead } from "./types"

export interface ScoreLine {
  label: string
  points: number
  detail: string
}

export interface ScoreResult {
  score: number
  lines: ScoreLine[]
}

const DAYS = 86_400_000

function daysSince(iso: string | null, now: number): number {
  if (!iso) return 0
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z")
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now - t) / DAYS))
}

/**
 * Score a lead. Pure function of the lead's fields + current time, so the
 * founder can always answer "why is this lead scored 74?" with specifics.
 */
export function opportunityScore(lead: Lead, now: number = Date.now()): ScoreResult {
  const lines: ScoreLine[] = []
  let score = 0

  // 1) Deal size — bigger jobs deserve faster attention (0–30)
  const v = lead.estimated_value
  if (v >= 9000) {
    score += 30
    lines.push({ label: "Deal size", points: 30, detail: `$${Math.round(v).toLocaleString()} job — top priority size` })
  } else if (v >= 5000) {
    score += 24
    lines.push({ label: "Deal size", points: 24, detail: `$${Math.round(v).toLocaleString()} job — strong ticket` })
  } else if (v >= 2000) {
    score += 16
    lines.push({ label: "Deal size", points: 16, detail: `$${Math.round(v).toLocaleString()} job — solid ticket` })
  } else if (v > 0) {
    score += 8
    lines.push({ label: "Deal size", points: 8, detail: `$${Math.round(v).toLocaleString()} job — smaller ticket` })
  } else {
    lines.push({ label: "Deal size", points: 0, detail: "No estimated value yet" })
  }

  // 2) Urgency — how badly the customer needs help (0–20)
  const urgencyPoints: Record<string, number> = { urgent: 20, high: 14, normal: 8, low: 3 }
  const up = urgencyPoints[lead.urgency] ?? 8
  score += up
  lines.push({
    label: "Urgency",
    points: up,
    detail: `${lead.urgency} urgency — ${lead.urgency === "urgent" ? "customer actively suffering" : `typical for ${lead.urgency} requests`}`
  })

  // 3) Stage — how close this lead already is to money (0–25)
  const stagePoints: Record<string, number> = {
    estimate_sent: 25,
    appointment_booked: 22,
    qualified: 18,
    appointment_requested: 15,
    contacted: 10,
    new: 5,
    lost: 0,
    unqualified: 0
  }
  const sp = stagePoints[lead.status] ?? 5
  score += sp
  const stageDetail: Record<string, string> = {
    estimate_sent: "Estimate is out — one follow-up can close it",
    appointment_booked: "Visit is booked — prepare the estimate",
    qualified: "Qualified — worth pursuing this week",
    appointment_requested: "Waiting on a confirmed visit",
    contacted: "Contact made — keep momentum",
    new: "Fresh lead — respond fast",
    won: "Won — revenue in the bank"
  }
  lines.push({
    label: "Stage",
    points: sp,
    detail: stageDetail[lead.status] ?? `${lead.status.replace(/_/g, " ")}`
  })

  // 4) Responsiveness — speed still wins in HVAC (0–15)
  const ageDays = daysSince(lead.last_activity_at, now)
  let rp = 0
  if (ageDays <= 1) rp = 15
  else if (lead.status === "estimate_sent" ? ageDays <= 7 : ageDays <= 3) rp = 10
  else if (lead.status === "estimate_sent" ? ageDays <= 14 : ageDays <= 10) rp = 5
  else if (ageDays <= 45) rp = 2
  else rp = 0
  score += rp
  lines.push({
    label: "Recency",
    points: rp,
    detail: ageDays === 0 ? "Activity today" : `${ageDays} day${ageDays === 1 ? "" : "s"} since last activity`
  })

  // 5) Source quality — referral & search intent convert best (0–10)
  const sourcePoints: Record<string, number> = { referral: 10, google: 8, phone: 7, website: 6, manual: 5, facebook: 4, instagram: 3, other: 3 }
  const sop = sourcePoints[lead.source] ?? 3
  score += sop
  lines.push({ label: "Source", points: sop, detail: `${lead.source} — ${lead.source === "referral" ? "referred leads close at the highest rate" : "known conversion channel"}` })

  // Won/lost/unqualified cap the score — no action left to take
  if (lead.status === "won") {
    return { score: Math.min(100, score), lines }
  }
  if (lead.status === "lost" || lead.status === "unqualified") {
    return { score: 0, lines: [{ label: "Closed", points: 0, detail: `Lead is ${lead.status} — no active opportunity` }] }
  }

  return { score: Math.min(100, Math.round(score)), lines }
}
