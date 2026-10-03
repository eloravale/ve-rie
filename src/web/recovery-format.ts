/**
 * Region-aware display formatting for the web app.
 * Mirrors src/worker/region.ts but client-side, driven by /api/settings.
 */

export type CurrencyCode = "USD" | "GBP" | "EUR"
export type DateFormatCode = "MDY" | "DMY"

export interface Settings {
  company_id: string
  region: "us" | "uk" | "eu"
  currency: CurrencyCode
  date_format: DateFormatCode
  retention_days: number
  data_source: string | null
  /** What the data in this workspace IS — drives demo vs prospect labelling. */
  workspace_kind?: "demo" | "prospect" | "customer"
}

export const DEFAULT_SETTINGS: Settings = {
  company_id: "cmp_1000",
  region: "us",
  currency: "USD",
  date_format: "MDY",
  retention_days: 365,
  data_source: null
}

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = { USD: "$", GBP: "£", EUR: "€" }
export const REGION_LABELS: Record<string, string> = { us: "United States", uk: "United Kingdom", eu: "Europe" }

// Module-level active settings. Kept in sync by useSettings()/Settings save so
// shared formatters (format.ts) render every screen in the company's currency.
let activeSettings: Settings = DEFAULT_SETTINGS

export function getActiveSettings(): Settings {
  return activeSettings
}

export function setActiveSettings(s: Settings): void {
  activeSettings = s
}

/** Format money in the active currency. Safe against null/undefined. */
export function money(n: number | null | undefined, currency: CurrencyCode = "USD"): string {
  const v = Math.round(Number(n ?? 0))
  return `${CURRENCY_SYMBOLS[currency] ?? "$"}${v.toLocaleString("en-US")}`
}

/** Compact money for dense UI spots. */
export function moneyCompact(n: number | null | undefined, currency: CurrencyCode = "USD"): string {
  const v = Math.round(Number(n ?? 0))
  const sym = CURRENCY_SYMBOLS[currency] ?? "$"
  if (v >= 1000) return sym + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k"
  return sym + v.toLocaleString("en-US")
}

function parseTs(ts: string | null | undefined): number {
  if (!ts) return NaN
  return Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z")
}

/** ISO-ish timestamp → regional date (MM/DD/YYYY or DD/MM/YYYY). */
export function formatDate(ts: string | null | undefined, format: DateFormatCode = "MDY"): string {
  const t = parseTs(ts)
  if (Number.isNaN(t)) return "—"
  const d = new Date(t)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return format === "DMY" ? `${dd}/${mm}/${yyyy}` : `${mm}/${dd}/${yyyy}`
}

export function formatDateTime(ts: string | null | undefined, format: DateFormatCode = "MDY"): string {
  const t = parseTs(ts)
  if (Number.isNaN(t)) return "—"
  const d = new Date(t)
  const h = d.getHours()
  const h12 = ((h + 11) % 12) + 1
  const min = String(d.getMinutes()).padStart(2, "0")
  const ampm = h < 12 ? "AM" : "PM"
  return `${formatDate(ts, format)} ${h12}:${min} ${ampm}`
}
