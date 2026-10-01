/**
 * CSV-first Prospect Mode: parse a small dialect of CSV (RFC-4180-ish:
 * quoted fields, escaped quotes, CRLF/LF, optional header) and map headers
 * to canonical fields. No third-party dependency — deterministic, testable.
 */

export interface CsvParseResult {
  headers: string[]
  rows: string[][]
  errors: string[]
}

/** Parse CSV text. Detects a header row by default. */
export function parseCsv(text: string, opts: { hasHeader?: boolean } = {}): CsvParseResult {
  const errors: string[] = []
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false
  let started = false

  const pushField = () => {
    row.push(field)
    field = ""
    started = false
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"' && field === "") {
      inQuotes = true
      started = true
      continue
    }
    if (c === ",") {
      pushField()
      continue
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      pushRow()
      continue
    }
    field += c
    started = true
  }
  // Final field/row (file not ending with newline); skip a wholly empty last row.
  if (started || field !== "" || row.length > 0) {
    pushRow()
  }
  // Drop fully-empty rows anywhere (blank lines, stray trailing newlines).
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].every((f) => f.trim() === "")) rows.splice(i, 1)
  }

  const hasHeader = opts.hasHeader ?? sniffHeader(rows)
  if (!rows.length) return { headers: [], rows: [], errors }

  if (hasHeader) {
    const headers = rows[0].map((h) => h.trim())
    return { headers, rows: rows.slice(1), errors }
  }
  const width = rows[0]?.length ?? 0
  return { headers: Array.from({ length: width }, (_, i) => `column_${i + 1}`), rows, errors }
}

/** Header row heuristic: mostly non-numeric, unique-ish, short labels. */
function sniffHeader(rows: string[][]): boolean {
  const first = rows[0]
  if (!first) return false
  const numericish = first.filter((f) => f.trim() !== "" && !Number.isNaN(Number(f))).length
  return numericish / Math.max(1, first.length) < 0.5
}

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

export type TargetField =
  | "name"
  | "customer_name"
  | "phone"
  | "email"
  | "service"
  | "job_type"
  | "source"
  | "status"
  | "urgency"
  | "value"
  | "quote_amount"
  | "quote_status"
  | "created_at"
  | "quote_date"
  | "last_contact"
  | "last_service"
  | "notes"
  | "ignore"

export interface ColumnMapping {
  [csvHeader: string]: TargetField
}

/**
 * Suggest a mapping for the given headers. Scores each header against known
 * synonyms; ambiguous/unknown headers map to "ignore" (user can fix in UI).
 */
export function suggestMapping(headers: string[]): ColumnMapping {
  const SYNONYMS: Record<Exclude<TargetField, "ignore">, string[]> = {
    name: ["name", "lead_name", "contact", "contact_name", "full_name", "customer", "first_last"],
    customer_name: ["customer_name", "customer", "account", "account_name"],
    phone: ["phone", "phone_number", "mobile", "cell", "tel", "telephone", "phone_1", "primary_phone"],
    email: ["email", "email_address", "e_mail", "mail"],
    service: ["service", "service_type", "request", "request_type", "description", "job", "work", "issue"],
    job_type: ["job_type", "type", "category", "work_type"],
    source: ["source", "lead_source", "channel", "origin", "campaign"],
    status: ["status", "lead_status", "stage", "pipeline_stage"],
    urgency: ["urgency", "priority", "heat", "emergency"],
    value: ["value", "estimated_value", "job_value", "opportunity_value", "amount", "deal_value", "ticket"],
    quote_amount: ["quote_amount", "quote_total", "estimate_amount", "estimate_total", "quoted", "quote_value"],
    quote_status: ["quote_status", "estimate_status", "quote_stage"],
    created_at: ["created_at", "created", "date_created", "received_at", "date_received", "enquiry_date", "lead_date", "date", "timestamp", "date_added"],
    quote_date: ["quote_date", "quote_sent", "sent_date", "estimate_date", "quoted_on"],
    last_contact: ["last_contact", "last_contacted", "last_activity", "last_touch", "last_contact_date", "last_outreach"],
    last_service: ["last_service", "last_service_date", "last_job", "previous_service", "last_visit"],
    notes: ["notes", "note", "comments", "memo", "details"]
  }

  const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "")
  const mapping: ColumnMapping = {}
  const used = new Set<TargetField>()

  // Pass 1: exact synonym hits (respecting declared order).
  for (const h of headers) {
    const n = norm(h)
    let best: TargetField | null = null
    for (const [target, syns] of Object.entries(SYNONYMS) as [Exclude<TargetField, "ignore">, string[]][]) {
      if (used.has(target)) continue
      if (syns.includes(n)) {
        best = target
        break
      }
    }
    if (best) {
      mapping[h] = best
      used.add(best)
    }
  }
  // Pass 2: substring fallbacks for the remainder.
  for (const h of headers) {
    if (mapping[h]) continue
    const n = norm(h)
    let best: TargetField | null = null
    let bestScore = 0
    for (const [target, syns] of Object.entries(SYNONYMS) as [Exclude<TargetField, "ignore">, string[]][]) {
      if (used.has(target)) continue
      for (const s of syns) {
        if (n === s) { best = target; bestScore = 100; break }
        if (n.includes(s) || s.includes(n)) {
          const score = Math.min(n.length, s.length)
          if (score > bestScore) { best = target; bestScore = score }
        }
      }
      if (bestScore === 100) break
    }
    mapping[h] = best ?? "ignore"
    if (best) used.add(best)
  }
  return mapping
}

// ---------------------------------------------------------------------------
// Row coercion
// ---------------------------------------------------------------------------

export interface ParsedRecord {
  values: Partial<Record<TargetField, string>>
  ignored: Record<string, string>
}

export function applyMapping(headers: string[], rows: string[][], mapping: ColumnMapping): ParsedRecord[] {
  const idx: [number, TargetField][] = []
  headers.forEach((h, i) => {
    const t = mapping[h]
    if (t && t !== "ignore") idx.push([i, t])
  })
  return rows.map((row) => {
    const values: Partial<Record<TargetField, string>> = {}
    const ignored: Record<string, string> = {}
    headers.forEach((h, i) => {
      const cell = (row[i] ?? "").trim()
      const t = mapping[h]
      if (t && t !== "ignore") values[t] = cell
      else if (cell) ignored[h] = cell
    })
    return { values, ignored }
  })
}

/** Parse a number from messy CSV cells ("$4,800", "£1,200.50", "", "N/A"). */
export function parseMoneyCell(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[$£€,\s]/g, "")
  if (cleaned === "" || /^nan$/i.test(cleaned) || /^-/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})([T ].*)?$/
const US_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(.*)?$/
const EU_RE = /^(\d{1,2})[.](\d{1,2})[.](\d{2,4})(.*)?$/

/** Normalize a date cell to the storage format (YYYY-MM-DD HH:MM:SS). Returns null if unparseable. */
export function parseDateCell(raw: string | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  let m = DATE_RE.exec(v)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")} 12:00:00`
  m = US_RE.exec(v)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    // Day-first input (15/03/26): first component over 12 must be the day.
    const [a, b] = Number(m[1]) > 12 ? [m[2], m[1]] : [m[1], m[2]]
    return `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")} 12:00:00`
  }
  m = EU_RE.exec(v)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")} 12:00:00`
  }
  const t = Date.parse(v)
  if (!Number.isNaN(t)) {
    const d = new Date(t)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} 12:00:00`
  }
  return null
}
