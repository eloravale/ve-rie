/** Display formatting shared across screens. */

export function usd(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return "$" + Math.round(v).toLocaleString("en-US")
}

export function usdCompact(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0))
  if (v >= 1000) return "$" + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k"
  return "$" + v.toLocaleString("en-US")
}

function parseTs(ts: string | null | undefined): number {
  if (!ts) return NaN
  return Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z")
}

export function relTime(ts: string | null | undefined): string {
  const t = parseTs(ts)
  if (Number.isNaN(t)) return "—"
  const diff = Date.now() - t
  const days = Math.floor(diff / 86_400_000)
  if (days >= 60) return `${Math.floor(days / 30)} mo ago`
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(diff / 3_600_000)
  if (hours >= 1) return `${hours}h ago`
  const mins = Math.max(1, Math.floor(diff / 60_000))
  return `${mins}m ago`
}

export function untilTime(ts: string | null | undefined): string {
  const t = parseTs(ts)
  if (Number.isNaN(t)) return "—"
  const diff = t - Date.now()
  const days = Math.floor(diff / 86_400_000)
  if (days >= 1) return `in ${days}d`
  const hours = Math.floor(diff / 3_600_000)
  if (hours >= 1) return `in ${hours}h`
  if (diff > 0) return `in ${Math.max(1, Math.floor(diff / 60_000))}m`
  const odays = Math.floor(-diff / 86_400_000)
  if (odays >= 1) return `${odays}d overdue`
  const ohours = Math.floor(-diff / 3_600_000)
  if (ohours >= 1) return `${ohours}h overdue`
  return "due now"
}

export function dateOnly(ts: string | null | undefined): string {
  const t = parseTs(ts)
  if (Number.isNaN(t)) return "—"
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function dateTime(ts: string | null | undefined): string {
  const t = parseTs(ts)
  if (Number.isNaN(t)) return "—"
  return new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  appointment_requested: "Appointment Requested",
  appointment_booked: "Appointment Booked",
  estimate_sent: "Estimate Sent",
  won: "Won",
  lost: "Lost",
  unqualified: "Unqualified"
}

export const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  phone: "Phone",
  google: "Google",
  referral: "Referral",
  facebook: "Facebook",
  instagram: "Instagram",
  manual: "Manual",
  other: "Other"
}

export const URGENCY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent"
}
