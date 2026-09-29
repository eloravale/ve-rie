import { COMPANY_ID, newId, nowIso, type Database } from "./db"
import { audit } from "./audit"
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_URGENCIES,
  ValidationError,
  isoDateOrNull,
  nonNegativeNumber,
  oneOf,
  optionalString,
  requiredString
} from "./validation"
import type { Lead } from "./types"

export interface LeadQuery {
  q?: string
  status?: string
  source?: string
  urgency?: string
  sort?: string
  order?: string
  page?: number
  pageSize?: number
}

export interface LeadPage {
  leads: Lead[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const SORTABLE: Record<string, string> = {
  created_at: "created_at",
  updated_at: "updated_at",
  estimated_value: "estimated_value",
  name: "name COLLATE NOCASE",
  status: "status",
  urgency: "urgency",
  last_activity_at: "last_activity_at"
}

const SELECT_COLS = `id, company_id, name, email, phone, service, status, source, urgency,
  estimated_value, notes, next_action, next_action_at, last_activity_at, recovered_via, lost_reason,
  created_at, updated_at`

/** List leads with search, filters, sorting, and pagination. Parameterized SQL only. */
export async function listLeads(db: Database, query: LeadQuery): Promise<LeadPage> {
  const where: string[] = ["company_id = ?1"]
  const params: unknown[] = [COMPANY_ID]

  if (query.q) {
    where.push(
      `(name LIKE ?${params.length + 1} OR email LIKE ?${params.length + 1} OR phone LIKE ?${params.length + 1} OR service LIKE ?${params.length + 1} OR notes LIKE ?${params.length + 1})`
    )
    params.push(`%${query.q}%`)
  }
  if (query.status) {
    if (!(LEAD_STATUSES as readonly string[]).includes(query.status)) {
      throw new ValidationError(`Invalid status filter: ${query.status}`, { status: "invalid_filter" })
    }
    where.push(`status = ?${params.length + 1}`)
    params.push(query.status)
  }
  if (query.source) {
    if (!(LEAD_SOURCES as readonly string[]).includes(query.source)) {
      throw new ValidationError(`Invalid source filter: ${query.source}`, { source: "invalid_filter" })
    }
    where.push(`source = ?${params.length + 1}`)
    params.push(query.source)
  }
  if (query.urgency) {
    if (!(LEAD_URGENCIES as readonly string[]).includes(query.urgency) && query.urgency !== "all") {
      throw new ValidationError(`Invalid urgency filter: ${query.urgency}`, { urgency: "invalid_filter" })
    }
    if (query.urgency !== "all") {
      where.push(`urgency = ?${params.length + 1}`)
      params.push(query.urgency)
    }
  }

  const sortKey = query.sort && SORTABLE[query.sort] ? query.sort : "created_at"
  const dir = query.order === "asc" ? "ASC" : "DESC"
  const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100)
  const page = Math.max(query.page ?? 1, 1)
  const offset = (page - 1) * pageSize

  const whereSql = where.join(" AND ")
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM leads WHERE ${whereSql}`)
    .bind(...params)
    .first<{ n: number }>()
  const total = countRow?.n ?? 0

  const res = await db
    .prepare(
      `SELECT ${SELECT_COLS} FROM leads WHERE ${whereSql} ORDER BY ${SORTABLE[sortKey]} ${dir} LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`
    )
    .bind(...params, pageSize, offset)
    .all<Lead>()
  const leads = (res.results ?? []) as Lead[]

  return { leads, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function getLead(db: Database, id: string): Promise<Lead | null> {
  const row = await db
    .prepare(`SELECT ${SELECT_COLS} FROM leads WHERE id = ?1 AND company_id = ?2`)
    .bind(id, COMPANY_ID)
    .first<Lead>()
  return (row as Lead) ?? null
}

/** Validate + build the INSERT payload for a new lead. */
export async function createLead(db: Database, body: Record<string, unknown>): Promise<Lead> {
  const name = requiredString(body.name, "name", 120)
  const status = oneOf(body.status, LEAD_STATUSES, "status", "new")
  const source = oneOf(body.source, LEAD_SOURCES, "source", "website")
  const urgency = oneOf(body.urgency, LEAD_URGENCIES, "urgency", "normal")
  const estimated_value = nonNegativeNumber(body.estimated_value, "estimated_value", 0)
  const email = optionalString(body.email, "email", 200)
  const phone = optionalString(body.phone, "phone", 40)
  const service = optionalString(body.service, "service", 200)
  const notes = optionalString(body.notes, "notes")
  const next_action = optionalString(body.next_action, "next_action", 300)
  const next_action_at = isoDateOrNull(body.next_action_at, "next_action_at")

  const now = nowIso()
  const id = newId("ldg")
  await db
    .prepare(
      `INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency,
        estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`
    )
    .bind(
      id, COMPANY_ID, name, email, phone, service, status, source, urgency,
      estimated_value, notes, next_action, next_action_at, now, now, now
    )
    .run()

  await audit(db, {
    actor: "owner",
    entityType: "lead",
    entityId: id,
    action: "lead_created",
    detail: `Lead created: ${name}${service ? ` — ${service}` : ""}${estimated_value ? ` ($${estimated_value.toLocaleString()})` : ""}`
  })

  const lead = await getLead(db, id)
  if (!lead) throw new Error("Lead creation failed")
  return lead
}

/** Validate + apply a partial update. Status transitions are audited. */
export async function updateLead(db: Database, id: string, body: Record<string, unknown>): Promise<Lead> {
  const existing = await getLead(db, id)
  if (!existing) throw new ValidationError("Lead not found", { id: "not_found" })

  const sets: string[] = []
  const params: unknown[] = []
  const changes: string[] = []
  const push = (col: string, value: unknown, label: string) => {
    sets.push(`${col} = ?${params.length + 1}`)
    params.push(value)
    changes.push(label)
  }

  if (body.name !== undefined) push("name", requiredString(body.name, "name", 120), "name")
  if (body.email !== undefined) push("email", optionalString(body.email, "email", 200), "email")
  if (body.phone !== undefined) push("phone", optionalString(body.phone, "phone", 40), "phone")
  if (body.service !== undefined) push("service", optionalString(body.service, "service", 200), "service")
  if (body.notes !== undefined) push("notes", optionalString(body.notes, "notes"), "notes")
  if (body.next_action !== undefined) push("next_action", optionalString(body.next_action, "next_action", 300), "next_action")
  if (body.next_action_at !== undefined) push("next_action_at", isoDateOrNull(body.next_action_at, "next_action_at"), "next_action_at")
  if (body.estimated_value !== undefined) push("estimated_value", nonNegativeNumber(body.estimated_value, "estimated_value", 0), "estimated_value")
  if (body.source !== undefined) push("source", oneOf(body.source, LEAD_SOURCES, "source"), "source")
  if (body.urgency !== undefined) push("urgency", oneOf(body.urgency, LEAD_URGENCIES, "urgency"), "urgency")

  let statusDetail: string | null = null
  if (body.status !== undefined && body.status !== existing.status) {
    const status = oneOf(body.status, LEAD_STATUSES, "status")
    push("status", status, "status")
    statusDetail = `${existing.status} → ${status}`
    if (status === "won" || status === "lost") {
      push("recovered_via", status === "won" ? "manual" : null, "recovered_via")
      push("lost_reason", status === "lost" ? optionalString(body.lost_reason, "lost_reason", 200) ?? "Not specified" : null, "lost_reason")
    }
  } else if (body.lost_reason !== undefined) {
    push("lost_reason", optionalString(body.lost_reason, "lost_reason", 200), "lost_reason")
  }

  if (sets.length === 0) {
    throw new ValidationError("No editable fields provided", { body: "empty_update" })
  }

  push("last_activity_at", nowIso(), "last_activity_at")
  push("updated_at", nowIso(), "updated_at")
  params.push(id, COMPANY_ID)

  await db
    .prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?${params.length - 1} AND company_id = ?${params.length}`)
    .bind(...params)
    .run()

  await audit(db, {
    actor: "owner",
    entityType: "lead",
    entityId: id,
    action: statusDetail ? "status_changed" : "lead_updated",
    detail: statusDetail
      ? `${statusDetail}${body.estimated_value !== undefined && statusDetail ? ` — value $${Number(body.estimated_value).toLocaleString()}` : ""}`
      : `Updated ${changes.filter((c) => c !== "last_activity_at" && c !== "updated_at").join(", ")}`
  })

  const lead = await getLead(db, id)
  if (!lead) throw new Error("Lead update failed")
  return lead
}
