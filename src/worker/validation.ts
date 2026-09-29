/** Small validation helpers. All input from the API boundary passes through these. */

export class ValidationError extends Error {
  status = 400
  fields: Record<string, string>
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = "ValidationError"
    this.fields = fields
  }
}

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "appointment_requested",
  "appointment_booked",
  "estimate_sent",
  "won",
  "lost",
  "unqualified"
] as const

export const LEAD_SOURCES = [
  "website",
  "phone",
  "google",
  "referral",
  "facebook",
  "instagram",
  "manual",
  "other"
] as const

export const LEAD_URGENCIES = ["low", "normal", "high", "urgent"] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]
export type LeadSource = (typeof LEAD_SOURCES)[number]
export type LeadUrgency = (typeof LEAD_URGENCIES)[number]

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

export function optionalString(v: unknown, field: string, maxLen = 2000): string | null {
  if (v === undefined || v === null || v === "") return null
  if (typeof v !== "string") throw new ValidationError(`${field} must be a string`, { [field]: "string" })
  const s = v.trim()
  if (s.length > maxLen) throw new ValidationError(`${field} is too long (max ${maxLen})`, { [field]: "max_length" })
  return s
}

export function requiredString(v: unknown, field: string, maxLen = 200): string {
  if (!isNonEmptyString(v)) throw new ValidationError(`${field} is required`, { [field]: "required" })
  const s = v.trim()
  if (s.length > maxLen) throw new ValidationError(`${field} is too long (max ${maxLen})`, { [field]: "max_length" })
  return s
}

export function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  field: string,
  fallback?: T
): T {
  if ((v === undefined || v === null || v === "") && fallback !== undefined) return fallback
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T
  throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`, { [field]: "invalid" })
}

export function nonNegativeNumber(v: unknown, field: string, fallback = 0): number {
  if (v === undefined || v === null || v === "") return fallback
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${field} must be a number >= 0`, { [field]: "invalid_number" })
  }
  return Math.round(n * 100) / 100
}

export function isoDateOrNull(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null
  if (typeof v !== "string") throw new ValidationError(`${field} must be an ISO date string`, { [field]: "invalid_date" })
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T") + "Z")
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid date`, { [field]: "invalid_date" })
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace("T", " ").replace("Z", "")
}

export function idOrNull(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null
  if (typeof v !== "string" || v.length > 64) throw new ValidationError(`${field} is invalid`, { [field]: "invalid" })
  return v
}
