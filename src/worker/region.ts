/**
 * Region-aware formatting: currency + dates for US / UK / EU businesses.
 * Pure string building — deterministic, no Intl in the Worker runtime,
 * every symbol/format explicit so output is testable.
 */

export type RegionCode = "us" | "uk" | "eu"
export type CurrencyCode = "USD" | "GBP" | "EUR"
export type DateFormatCode = "MDY" | "DMY"

export interface RegionConfig {
  currency: CurrencyCode
  dateFormat: DateFormatCode
}

export const REGION_PRESETS: Record<RegionCode, RegionConfig> = {
  us: { currency: "USD", dateFormat: "MDY" },
  uk: { currency: "GBP", dateFormat: "DMY" },
  eu: { currency: "EUR", dateFormat: "DMY" }
}

const SYMBOLS: Record<CurrencyCode, string> = { USD: "$", GBP: "£", EUR: "€" }

function group(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** Format an amount in the given currency. Deterministic across runtimes. */
export function money(n: number | null | undefined, currency: CurrencyCode = "USD"): string {
  const v = Math.round(Number(n ?? 0))
  return `${SYMBOLS[currency] ?? "$"}${group(v)}`
}

/** Compact money for tight UI spots. */
export function moneyCompact(n: number | null | undefined, currency: CurrencyCode = "USD"): string {
  const v = Math.round(Number(n ?? 0))
  const sym = SYMBOLS[currency] ?? "$"
  if (v >= 1000) return sym + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k"
  return sym + group(v)
}

/** Format an ISO-ish timestamp (space or T separated) per region date style. */
export function formatDate(ts: string | null | undefined, format: DateFormatCode = "MDY"): string {
  if (!ts) return "—"
  const t = Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z")
  if (Number.isNaN(t)) return "—"
  const d = new Date(t)
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const yyyy = d.getUTCFullYear()
  return format === "DMY" ? `${dd}/${mm}/${yyyy}` : `${mm}/${dd}/${yyyy}`
}

export function formatDateTime(ts: string | null | undefined, format: DateFormatCode = "MDY"): string {
  if (!ts) return "—"
  const t = Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z")
  if (Number.isNaN(t)) return "—"
  const d = new Date(t)
  const hh = d.getUTCHours()
  const h12 = ((hh + 11) % 12) + 1
  const min = String(d.getUTCMinutes()).padStart(2, "0")
  const ampm = hh < 12 ? "AM" : "PM"
  return `${formatDate(ts, format)} ${h12}:${min} ${ampm}`
}

/** Response-time bucket key. Returns null for "never responded". */
export function responseBucket(
  minutes: number | null | undefined
): "lt5" | "5to30" | "30to120" | "over120" | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return null
  if (minutes < 5) return "lt5"
  if (minutes < 30) return "5to30"
  if (minutes < 120) return "30to120"
  return "over120"
}
