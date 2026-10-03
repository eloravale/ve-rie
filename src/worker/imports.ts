/**
 * Prospect Mode — CSV-first onboarding. Import a prospect's exported data
 * (leads / calls / quotes / customers) and VÉRIA runs its recovery analysis
 * on THEIR data. No third-party integrations required.
 */

import { COMPANY_ID, newId, nowIso, type Database } from "./db"
import { audit } from "./audit"
import { getWorkspaceKind, type WorkspaceKind } from "./demo"

/**
 * Phase 0 transaction helper: run a unit of work atomically.
 * On any error the transaction is rolled back and re-thrown — a failed import
 * or reset can never leave half-written state. Nesting is deliberately not
 * supported: callers must be leaf operations (importCsv, resetDemo, …).
 */
export async function withTransaction(db: Database, fn: () => Promise<void>): Promise<void> {
  await db.exec("BEGIN")
  try {
    await fn()
    await db.exec("COMMIT")
  } catch (e) {
    try {
      await db.exec("ROLLBACK")
    } catch {
      /* transaction already rolled back — nothing to do */
    }
    throw e
  }
}
import { classifyJobType } from "./jobTypes"
import {
  parseCsv,
  suggestMapping,
  applyMapping,
  parseMoneyCell,
  parseDateCell,
  type ColumnMapping
} from "./csv"
import type { Lead } from "./types"

export type ImportKind = "leads" | "calls" | "quotes" | "customers"

const LEAD_SOURCES = new Set(["website", "phone", "google", "referral", "facebook", "instagram", "manual", "other"])
const LEAD_STATUSES = new Set([
  "new", "contacted", "qualified", "appointment_requested", "appointment_booked", "estimate_sent", "won", "lost", "unqualified"
])
const URGENCIES = new Set(["low", "normal", "high", "urgent"])
const QUOTE_STATUSES = new Set([
  "new", "sent", "followup_due", "customer_replied", "negotiation", "booked", "lost", "no_response", "expired"
])

function normSource(raw: string | undefined): string {
  const v = (raw ?? "").trim().toLowerCase()
  if (!v) return "other"
  if (v.includes("refer")) return "referral"
  if (v.includes("google") || v.includes("search")) return "google"
  if (v.includes("phone") || v.includes("call")) return "phone"
  if (v.includes("web") || v.includes("form")) return "website"
  if (v.includes("facebook") || v.includes("fb")) return "facebook"
  if (v.includes("instagram") || v.includes("ig")) return "instagram"
  return "other"
}

function normStatus(raw: string | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (!v) return null
  if (LEAD_STATUSES.has(v)) return v
  if (["open", "active"].includes(v)) return "new"
  if (["contacted", "spoken", "called"].includes(v)) return "contacted"
  if (["quote", "quoted", "estimate", "estimate_sent", "proposal"].includes(v)) return "estimate_sent"
  if (["booked", "appointment", "scheduled"].includes(v)) return "appointment_booked"
  if (["won", "closed_won", "sold", "completed", "done"].includes(v)) return "won"
  if (["lost", "closed_lost", "dead"].includes(v)) return "lost"
  if (["unqualified", "not_a_fit", "spam"].includes(v)) return "unqualified"
  return null
}

function normUrgency(raw: string | undefined): string {
  const v = (raw ?? "").trim().toLowerCase()
  if (["urgent", "emergency", "high", "asap"].includes(v)) return "urgent"
  if (["high", "soon"].includes(v)) return "high"
  if (["low", "whenever"].includes(v)) return "low"
  return "normal"
}

function normQuoteStatus(raw: string | undefined): string {
  const v = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (QUOTE_STATUSES.has(v)) return v
  if (["quoted", "out", "delivered"].includes(v)) return "sent"
  if (["chase", "chasing", "due", "overdue", "follow_up_due"].includes(v)) return "followup_due"
  if (["answered", "replied", "responded"].includes(v)) return "customer_replied"
  if (["won", "accepted", "signed", "approved"].includes(v)) return "booked"
  if (["lost", "rejected", "declined"].includes(v)) return "lost"
  if (["expired", "lapsed"].includes(v)) return "expired"
  return "sent"
}

export interface MappingPreview {
  kind: ImportKind
  filename: string
  headers: string[]
  row_count: number
  suggested_mapping: ColumnMapping
  sample: { values: Record<string, string>; ignored: Record<string, string> }[]
}

/** Parse + suggest mapping without importing (feeds the mapping UI). */
export function previewCsv(kind: ImportKind, filename: string, text: string): MappingPreview {
  const parsed = parseCsv(text)
  if (!parsed.headers.length) throw new RangeError("No data found in CSV")
  const mapping = suggestMapping(parsed.headers)
  const records = applyMapping(parsed.headers, parsed.rows, mapping)
  return {
    kind,
    filename,
    headers: parsed.headers,
    row_count: parsed.rows.length,
    suggested_mapping: mapping,
    sample: records.slice(0, 3).map((r) => ({ values: r.values, ignored: r.ignored }))
  }
}

export interface ImportResult {
  batch_id: string
  kind: ImportKind
  row_count: number
  imported: number
  skipped: number
  /** Rows skipped as duplicates of existing data (Phase 0 §CSV integrity). */
  duplicates: number
  /** What a duplicate means for this kind: which field combination matched. */
  duplicate_rule: string
  errors: string[]
}

/** Normalized digits of a phone-ish string (last 10 digits, min 7). */
function normalizePhone(value: string | undefined | null): string {
  const d = String(value ?? "").replace(/\D/g, "")
  return d.length >= 7 ? d.slice(-10) : ""
}

function normalizeName(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Duplicate detection per import kind (Phase 0):
 *   leads     — normalized name + phone
 *   calls     — normalized phone + call date
 *   quotes    — linked lead + amount + quote date
 *   customers — normalized name + phone
 * Duplicates are SKIPPED and reported, never silently imported twice.
 */
class DuplicateTracker {
  private leads = new Set<string>()
  private calls = new Set<string>()
  private quotes = new Set<string>()
  private customers = new Set<string>()

  static readonly RULES: Record<ImportKind, string> = {
    leads: "normalized name + phone",
    calls: "normalized phone + call date",
    quotes: "customer + amount + quote date",
    customers: "normalized name + phone"
  }

  async load(db: Database): Promise<void> {
    const leads = await db
      .prepare(`SELECT name, phone FROM leads WHERE company_id = ?1`)
      .bind(COMPANY_ID)
      .all<{ name: string; phone: string | null }>()
    for (const l of leads.results ?? []) {
      const p = normalizePhone(l.phone)
      if (normalizeName(l.name) && p) this.leads.add(`${normalizeName(l.name)}|${p}`)
    }
    const calls = await db
      .prepare(`SELECT caller_phone, called_at FROM missed_calls WHERE company_id = ?1`)
      .bind(COMPANY_ID)
      .all<{ caller_phone: string | null; called_at: string | null }>()
    for (const c of calls.results ?? []) {
      const p = normalizePhone(c.caller_phone)
      if (p) this.calls.add(`${p}|${String(c.called_at ?? "").slice(0, 10)}`)
    }
    const quotes = await db
      .prepare(`SELECT e.amount, e.sent_at, l.name FROM estimates e JOIN leads l ON l.id = e.lead_id WHERE e.company_id = ?1`)
      .bind(COMPANY_ID)
      .all<{ amount: number; sent_at: string | null; name: string }>()
    for (const q of quotes.results ?? []) {
      this.quotes.add(`${normalizeName(q.name)}|${Number(q.amount ?? 0)}|${String(q.sent_at ?? "").slice(0, 10)}`)
    }
    const customers = await db
      .prepare(`SELECT name, phone FROM customers WHERE company_id = ?1`)
      .bind(COMPANY_ID)
      .all<{ name: string; phone: string | null }>()
    for (const c of customers.results ?? []) {
      const p = normalizePhone(c.phone)
      if (normalizeName(c.name) && p) this.customers.add(`${normalizeName(c.name)}|${p}`)
    }
  }

  isDuplicate(kind: ImportKind, key: { name?: string; phone?: string; amount?: number; date?: string }): boolean {
    const name = normalizeName(key.name)
    const phone = normalizePhone(key.phone)
    const date = String(key.date ?? "").slice(0, 10)
    switch (kind) {
      case "leads":
        return name !== "" && phone !== "" && this.leads.has(`${name}|${phone}`)
      case "calls":
        return phone !== "" && this.calls.has(`${phone}|${date}`)
      case "quotes":
        return this.quotes.has(`${name}|${Number(key.amount ?? 0)}|${date}`)
      case "customers":
        return name !== "" && phone !== "" && this.customers.has(`${name}|${phone}`)
    }
  }

  add(kind: ImportKind, key: { name?: string; phone?: string; amount?: number; date?: string }): void {
    const name = normalizeName(key.name)
    const phone = normalizePhone(key.phone)
    const date = String(key.date ?? "").slice(0, 10)
    if (kind === "leads" && name && phone) this.leads.add(`${name}|${phone}`)
    if (kind === "calls" && phone) this.calls.add(`${phone}|${date}`)
    if (kind === "quotes") this.quotes.add(`${name}|${Number(key.amount ?? 0)}|${date}`)
    if (kind === "customers" && name && phone) this.customers.add(`${name}|${phone}`)
  }
}

interface Ctx {
  batchId: string
  errors: string[]
}

function requireName(values: Record<string, string>, i: number, _ctx: Ctx): string | null {
  const name = (values.name ?? values.customer_name ?? "").trim()
  if (!name) {
    _ctx.errors.push(`Row ${i + 2}: missing name — skipped`)
    return null
  }
  // A name this long means the CSV columns are shifted/mangled — abort the
  // whole import rather than corrupt the dataset (transaction rolls back).
  if (name.length > 120) {
    throw new RangeError(`Row ${i + 2}: name exceeds 120 characters — import aborted`)
  }
  return name
}

function dateOrNow(values: Record<string, string>): string {
  return parseDateCell(values.created_at) ?? nowIso()
}

function lastActivity(values: Record<string, string>, fallback: string): string {
  return parseDateCell(values.last_contact) ?? parseDateCell(values.created_at) ?? fallback
}

export async function importCsv(
  db: Database,
  kind: ImportKind,
  filename: string,
  text: string,
  mappingOverride?: ColumnMapping
): Promise<ImportResult> {
  const parsed = parseCsv(text)
  if (!parsed.headers.length) throw new RangeError("No data found in CSV")
  const mapping: ColumnMapping = mappingOverride ?? suggestMapping(parsed.headers)
  const records = applyMapping(parsed.headers, parsed.rows, mapping)

  const batchId = newId("imp")
  const ctx: Ctx = { batchId, errors: [] }
  let imported = 0
  let duplicates = 0
  const dup = new DuplicateTracker()
  await dup.load(db)

  await withTransaction(db, async () => {

  if (kind === "leads") {
    for (let i = 0; i < records.length; i++) {
      const { values } = records[i]
      const name = requireName(values, i, ctx)
      if (!name) continue
      const now = nowIso()
      const created = dateOrNow(values)
      const status = normStatus(values.status) ?? "new"
      if (dup.isDuplicate("leads", { name, phone: values.phone })) {
        duplicates++
        ctx.errors.push(`Row ${i + 2}: duplicate lead (${name}) — skipped`)
        continue
      }
      await db
        .prepare(
          `INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, job_type,
            estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`
        )
        .bind(
          newId("ldg"), COMPANY_ID, name,
          values.email || null,
          values.phone || null,
          values.service || null,
          status,
          normSource(values.source),
          normUrgency(values.urgency),
          classifyJobType(values.service ?? values.job_type ?? ""),
          parseMoneyCell(values.value) ?? 0,
          values.notes ? `Imported from ${filename}. ${values.notes}`.slice(0, 2000) : `Imported from ${filename}.`,
          null, null,
          lastActivity(values, created), created, now
        )
        .run()
      dup.add("leads", { name, phone: values.phone })
      imported++
    }
  } else if (kind === "calls") {
    for (let i = 0; i < records.length; i++) {
      const { values } = records[i]
      const name = requireName(values, i, ctx)
      const phone = (values.phone ?? "").trim()
      if (!phone) {
        ctx.errors.push(`Row ${i + 2}: missing phone — skipped`)
        continue
      }
      const when = parseDateCell(values.created_at) ?? nowIso()
      if (dup.isDuplicate("calls", { phone, date: when })) {
        duplicates++
        ctx.errors.push(`Row ${i + 2}: duplicate call (${phone}) — skipped`)
        continue
      }
      await db
        .prepare(
          `INSERT INTO missed_calls (id, company_id, caller_name, caller_phone, called_at, recovered, lead_id, estimated_value, notes, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,0,NULL,?6,?7,?8,?8)`
        )
        .bind(
          newId("mcl"), COMPANY_ID,
          name ?? phone,
          phone.slice(0, 40),
          when,
          parseMoneyCell(values.value) ?? 4800,
          `Imported from ${filename}.`,
          nowIso()
        )
        .run()
      dup.add("calls", { phone, date: when })
      imported++
    }
  } else if (kind === "quotes") {
    for (let i = 0; i < records.length; i++) {
      const { values } = records[i]
      const name = requireName(values, i, ctx)
      if (!name) continue
      const amount = parseMoneyCell(values.quote_amount ?? values.value)
      if (amount === null || amount <= 0) {
        ctx.errors.push(`Row ${i + 2}: missing/invalid quote_amount — skipped`)
        continue
      }
      const sentAt = parseDateCell(values.quote_date) ?? parseDateCell(values.created_at) ?? nowIso()
      if (dup.isDuplicate("quotes", { name, amount, date: sentAt })) {
        duplicates++
        ctx.errors.push(`Row ${i + 2}: duplicate quote (${name}, ${amount}) — skipped`)
        continue
      }
      // Find or create the linked lead by name+phone.
      let leadId: string | null = null
      const existing = await db
        .prepare(`SELECT id FROM leads WHERE company_id = ?1 AND name = ?2 COLLATE NOCASE LIMIT 1`)
        .bind(COMPANY_ID, name)
        .first<{ id: string }>()
      if (existing) leadId = existing.id
      if (!leadId) {
        const lid = newId("ldg")
        await db
          .prepare(
            `INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, job_type,
              estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,'estimate_sent','other','normal',?7,?8,?9,NULL,NULL,?10,?11,?12)`
          )
          .bind(
            lid, COMPANY_ID, name, values.email || null, values.phone || null,
            values.service || null,
            classifyJobType(values.service ?? values.job_type ?? ""),
            amount,
            `Imported from ${filename}.`,
            sentAt, sentAt, nowIso()
          )
          .run()
        leadId = lid
      }
      const status = normQuoteStatus(values.quote_status)
      await db
        .prepare(
          `INSERT INTO estimates (id, company_id, lead_id, amount, status, sent_at, expires_at, notes, last_contact_at, quote_status, recovery_priority, created_at, updated_at)
           VALUES (?1,?2,?3,?4,'sent',?5,?6,?7,?5,?8,?9,?10,?10)`
        )
        .bind(
          newId("est"), COMPANY_ID, leadId, amount, sentAt,
          parseDateCell(values.last_contact) ?? sentAt,
          `Imported from ${filename}.`,
          status,
          status === "followup_due" || status === "no_response" ? "high" : "medium",
          nowIso()
        )
        .run()
      dup.add("quotes", { name, amount, date: sentAt })
      imported++
    }
  } else {
    // customers
    for (let i = 0; i < records.length; i++) {
      const { values } = records[i]
      const name = requireName(values, i, ctx)
      if (!name) continue
      if (dup.isDuplicate("customers", { name, phone: values.phone })) {
        duplicates++
        ctx.errors.push(`Row ${i + 2}: duplicate customer (${name}) — skipped`)
        continue
      }
      await db
        .prepare(
          `INSERT INTO customers (id, company_id, name, email, phone, address, lifetime_value, notes, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,NULL,?6,?7,?8,?8)`
        )
        .bind(
          newId("cus"), COMPANY_ID, name, values.email || null, values.phone || null,
          parseMoneyCell(values.value) ?? 0,
          `Imported from ${filename}.`,
          nowIso()
        )
        .run()
      dup.add("customers", { name, phone: values.phone })
      imported++
    }
  }

  }) // end withTransaction — the import is atomic: all rows or none

  await db
    .prepare(
      `INSERT INTO import_batches (id, company_id, kind, filename, row_count, imported_count, mapping, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
    )
    .bind(batchId, COMPANY_ID, kind, filename.slice(0, 200), records.length, imported, JSON.stringify(mapping), nowIso())
    .run()

  await audit(db, {
    actor: "owner",
    entityType: "import_batch",
    entityId: batchId,
    action: "csv_imported",
    detail: `${kind} import from ${filename}: ${imported} of ${records.length} rows imported${duplicates ? `, ${duplicates} duplicates skipped` : ""}${ctx.errors.length ? `, ${ctx.errors.length} invalid` : ""}.`
  })

  return {
    batch_id: batchId,
    kind,
    row_count: records.length,
    imported,
    skipped: records.length - imported,
    duplicates,
    duplicate_rule: DuplicateTracker.RULES[kind],
    errors: ctx.errors.slice(0, 20)
  }
}

/** Export all company data as JSON (privacy: data portability). */
export async function exportAllData(db: Database): Promise<Record<string, unknown[]>> {
  const tables = ["companies", "company_settings", "leads", "customers", "enquiries", "estimates", "missed_calls", "followups", "reactivations", "recovery_opportunities", "human_tasks", "appointments", "audit_events", "import_batches"]
  const out: Record<string, unknown[]> = {}
  for (const t of tables) {
    const res = await db.prepare(`SELECT * FROM ${t}`).all<Record<string, unknown>>()
    out[t] = res.results ?? []
  }
  return out
}

/** Delete all company data (privacy: right to deletion). Audit record first, then wipe — atomically. */
export async function deleteAllData(db: Database): Promise<{ ok: true; deleted: boolean }> {
  await withTransaction(db, async () => {
    await audit(db, {
      actor: "owner",
      entityType: "system",
      action: "data_deletion_requested",
      detail: "All company data deleted at owner request. Audit event recorded before wipe."
    })
    const tables = ["revenue_events", "audit_events", "human_tasks", "satisfaction_events", "referrals", "import_batches", "recovery_opportunities", "enquiries", "company_settings", "missed_calls", "reactivations", "estimates", "appointments", "followups", "messages", "conversations", "customers", "leads", "companies"]
    for (const t of tables) {
      await db.prepare(`DELETE FROM ${t}`).run()
    }
  })
  return { ok: true, deleted: true }
}

export async function getSettings(db: Database): Promise<{ region: string; currency: string; date_format: string; retention_days: number; data_source: string | null; workspace_kind: WorkspaceKind; company: Record<string, unknown> | null }> {
  const s = (await db
    .prepare(`SELECT region, currency, date_format, retention_days, data_source, workspace_kind FROM company_settings WHERE company_id = ?1`)
    .bind(COMPANY_ID)
    .first<Record<string, unknown>>()) ?? {}
  const workspaceKind = await getWorkspaceKind(db)
  const c = (await db
    .prepare(`SELECT id, name, city, state, phone, website, avg_ticket FROM companies WHERE id = ?1`)
    .bind(COMPANY_ID)
    .first<Record<string, unknown>>()) ?? null
  return {
    region: String(s.region ?? "us"),
    currency: String(s.currency ?? "USD"),
    date_format: String(s.date_format ?? "MDY"),
    retention_days: Number(s.retention_days ?? 365),
    data_source: s.data_source ? String(s.data_source) : null,
    workspace_kind: workspaceKind,
    company: c
  }
}

export async function updateSettings(db: Database, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const current = await getSettings(db)
  const region = typeof body.region === "string" && ["us", "uk", "eu"].includes(body.region) ? body.region : current.region
  const currency = typeof body.currency === "string" && ["USD", "GBP", "EUR"].includes(body.currency) ? body.currency : current.currency
  const dateFormat = typeof body.date_format === "string" && ["MDY", "DMY"].includes(body.date_format) ? body.date_format : current.date_format
  const retention = typeof body.retention_days === "number" && body.retention_days >= 30 && body.retention_days <= 3650 ? Math.round(body.retention_days) : current.retention_days
  const dataSource = typeof body.data_source === "string" ? body.data_source.slice(0, 500) : current.data_source
  const companyName = typeof body.company_name === "string" ? body.company_name.trim().slice(0, 120) : null

  const existing = await db.prepare(`SELECT company_id FROM company_settings WHERE company_id = ?1`).bind(COMPANY_ID).first()
  const now = nowIso()
  if (existing) {
    await db
      .prepare(`UPDATE company_settings SET region = ?2, currency = ?3, date_format = ?4, retention_days = ?5, data_source = ?6, updated_at = ?7 WHERE company_id = ?1`)
      .bind(COMPANY_ID, region, currency, dateFormat, retention, dataSource, now)
      .run()
  } else {
    await db
      .prepare(`INSERT INTO company_settings (company_id, region, currency, date_format, retention_days, data_source, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)`)
      .bind(COMPANY_ID, region, currency, dateFormat, retention, dataSource, now)
      .run()
  }
  if (companyName) {
    await db.prepare(`UPDATE companies SET name = ?2, updated_at = ?3 WHERE id = ?1`).bind(COMPANY_ID, companyName, now).run()
  }
  await audit(db, { actor: "owner", entityType: "system", action: "settings_updated", detail: `Region ${region}, currency ${currency}, date format ${dateFormat}.` })
  return getSettings(db)
}
