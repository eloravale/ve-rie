import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createRequire } from "node:module"

// Vite's resolver does not know the node:sqlite builtin yet — load it via require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite")

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

let db: DatabaseSync
let worker: { fetch: (req: Request, env: unknown) => Promise<Response> }
let tmpDb: string

interface D1Result<T> {
  results?: T[]
  success: boolean
}

function adapter(database: DatabaseSync) {
  const run = (sql: string, params: unknown[]) => {
    const stmt = database.prepare(sql)
    return params && params.length ? stmt.all(...(params as never[])) : stmt.all()
  }
  return {
    prepare(sql: string) {
      let bound: unknown[] = []
      return {
        bind(...values: unknown[]) {
          bound = values.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v))
          return this
        },
        async first<T>(): Promise<T | null> {
          const rows = run(sql, bound)
          return (rows[0] as T) ?? null
        },
        async all<T>(): Promise<D1Result<T>> {
          const results = run(sql, bound)
          return { results: results as T[], success: true, meta: {} }
        },
        async run(): Promise<D1Result> {
          const results = run(sql, bound)
          return { results: results as unknown[], success: true, meta: {} }
        }
      }
    },
    async exec(sql: string) {
      database.exec(sql)
    }
  }
}

async function req(method: string, p: string, body?: unknown): Promise<{ status: number; data: any }> {
  const request = new Request(`https://veria.test${p}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" }
  })
  const res = await worker.fetch(request, { DB: adapter(db), ASSETS: { fetch: async () => new Response("nf", { status: 404 }) } })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* ignore */
  }
  return { status: res.status, data }
}

beforeAll(async () => {
  tmpDb = path.join(os.tmpdir(), `veria-test-${Date.now()}.db`)
  db = new DatabaseSync(tmpDb)
  db.exec("PRAGMA journal_mode = MEMORY;")
  const migrationsDir = path.join(ROOT, "migrations")
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"))
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, datetime('now'))").run(f)
  }
  const mod = await import(pathToFileURL(path.join(ROOT, "dist-worker", "index.js")).href)
  worker = mod.default
}, 30000)

afterAll(() => {
  try {
    db.close()
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(tmpDb + suffix, { force: true })
  } catch {
    /* ignore */
  }
})

describe("API smoke", () => {
  it("health responds", async () => {
    const { status, data } = await req("GET", "/api/health")
    expect(status).toBe(200)
    expect(data.ok).toBe(true)
  })

  it("meta lists enums", async () => {
    const { data } = await req("GET", "/api/meta")
    expect(data.statuses).toContain("estimate_sent")
    expect(data.sources).toContain("referral")
    expect(data.urgencies).toContain("urgent")
  })
})

describe("leads", () => {
  it("lists seeded leads with pagination metadata", async () => {
    const { status, data } = await req("GET", "/api/leads?pageSize=5")
    expect(status).toBe(200)
    expect(data.leads.length).toBeGreaterThan(0)
    expect(data.leads.length).toBeLessThanOrEqual(5)
    expect(data.total).toBeGreaterThanOrEqual(data.leads.length)
    expect(data.pageCount).toBeGreaterThanOrEqual(1)
  })

  it("searches by name", async () => {
    const { data } = await req("GET", "/api/leads?q=Mike")
    expect(data.total).toBeGreaterThanOrEqual(1)
    expect(data.leads.some((l: any) => l.name.includes("Mike"))).toBe(true)
  })

  it("filters by status, source, and urgency", async () => {
    const est = await req("GET", "/api/leads?status=estimate_sent")
    expect(est.data.leads.length).toBe(3)
    expect(est.data.leads.every((l: any) => l.status === "estimate_sent")).toBe(true)

    const ref = await req("GET", "/api/leads?source=referral")
    expect(ref.data.leads.every((l: any) => l.source === "referral")).toBe(true)

    const urg = await req("GET", "/api/leads?urgency=urgent")
    expect(urg.data.leads.every((l: any) => l.urgency === "urgent")).toBe(true)
  })

  it("sorts by estimated_value desc", async () => {
    const { data } = await req("GET", "/api/leads?sort=estimated_value&order=desc&pageSize=50")
    const vals = data.leads.map((l: any) => l.estimated_value)
    const sorted = [...vals].sort((a, b) => b - a)
    expect(vals).toEqual(sorted)
  })

  it("rejects invalid filters and payloads", async () => {
    const badFilter = await req("GET", "/api/leads?status=nope")
    expect(badFilter.status).toBe(400)

    const badBody = await req("POST", "/api/leads", { name: "" })
    expect(badBody.status).toBe(400)
    expect(badBody.data.fields.name).toBe("required")
  })

  it("creates, reads, and updates a lead end-to-end", async () => {
    const created = await req("POST", "/api/leads", {
      name: "Test Homeowner",
      estimated_value: 3600,
      urgency: "high",
      source: "referral",
      service: "Heat pump tune-up"
    })
    expect(created.status).toBe(201)
    const id = created.data.id

    const got = await req("GET", `/api/leads/${id}`)
    expect(got.status).toBe(200)
    expect(got.data.opportunity_score).toBeGreaterThan(0)
    expect(got.data.score_lines.length).toBeGreaterThanOrEqual(5)

    const patched = await req("PATCH", `/api/leads/${id}`, { status: "qualified", estimated_value: 4100 })
    expect(patched.status).toBe(200)
    expect(patched.data.status).toBe("qualified")
    expect(patched.data.estimated_value).toBe(4100)

    const missing = await req("GET", "/api/leads/ldg_missing")
    expect(missing.status).toBe(404)
  })

  it("records audit events for mutations", async () => {
    const before = await req("GET", "/api/leads?q=Test Homeowner")
    const leadId = before.data.leads[0].id
    await req("PATCH", `/api/leads/${leadId}`, { status: "won" })
    const dash = await req("GET", "/api/dashboard")
    const events = dash.data.recent_activity
    expect(events.some((e: any) => e.action === "status_changed")).toBe(true)
  })
})

describe("recovery workflows", () => {
  it("dashboard metrics are internally consistent", async () => {
    const { status, data } = await req("GET", "/api/dashboard")
    expect(status).toBe(200)
    expect(data.revenue_recovered).toBeGreaterThan(0)
    expect(data.revenue_at_risk).toBeGreaterThan(0)
    expect(data.brief.actions.length).toBeGreaterThan(0)
    expect(data.radar.length).toBeGreaterThan(0)
    expect(data.recent_activity.length).toBeGreaterThan(0)
    // At-risk should not double-count dormant leads (idle >= 30d are dormant-only)
    const allLeads = await req("GET", "/api/leads?pageSize=100")
    const dormant = allLeads.data.leads.filter((l: any) => {
      const idle = (Date.now() - new Date(l.last_activity_at.replace(" ", "T") + "Z").getTime()) / 86400000
      return idle >= 30 && !["won", "lost", "unqualified"].includes(l.status)
    })
    expect(data.dormant_opportunities).toBe(dormant.length)
  })

  it("radar ranks opportunities with actions", async () => {
    const { data } = await req("GET", "/api/radar")
    expect(data.items.length).toBeGreaterThan(0)
    for (const item of data.items) {
      expect(item.issue.length).toBeGreaterThan(0)
      expect(item.recommended_action.length).toBeGreaterThan(0)
      expect(item.estimated_value).toBeGreaterThanOrEqual(0)
    }
  })

  it("missed-call recovery creates lead, task, and audit trail", async () => {
    const list = await req("GET", "/api/missed-calls")
    const open = list.data.find((m: any) => !m.recovered)
    expect(open).toBeTruthy()

    const res = await req("POST", `/api/missed-calls/${open.id}/recover`)
    expect(res.status).toBe(200)
    expect(res.data.lead.id).toBeTruthy()
    expect(res.data.task_id).toBeTruthy()
    expect(res.data.missed_call.recovered).toBe(1)

    // double recovery is rejected
    const again = await req("POST", `/api/missed-calls/${open.id}/recover`)
    expect(again.status).toBe(400)
  })

  it("estimate follow-up completes and marks revenue recovered", async () => {
    const fus = await req("GET", "/api/followups?status=pending")
    const est = fus.data.find((f: any) => f.kind === "estimate")
    expect(est).toBeTruthy()

    const dashBefore = await req("GET", "/api/dashboard")
    const res = await req("POST", `/api/followups/${est.id}/complete`, { outcome: "recovered" })
    expect(res.status).toBe(200)
    expect(res.data.status).toBe("completed")
    expect(res.data.outcome).toBe("recovered")

    const dashAfter = await req("GET", "/api/dashboard")
    expect(dashAfter.data.revenue_recovered).toBeGreaterThan(dashBefore.data.revenue_recovered)
  })

  it("reactivation identify + run queues owner outreach", async () => {
    const before = await req("GET", "/api/reactivations")
    const target = before.data.find((r: any) => r.status === "identified")
    expect(target).toBeTruthy()

    const run = await req("POST", `/api/reactivations/${target.id}/run`)
    expect(run.status).toBe(200)
    expect(run.data.reactivation.status).toBe("outreach_queued")
    expect(run.data.task_id).toBeTruthy()
  })

  it("human task lifecycle works", async () => {
    const list = await req("GET", "/api/tasks?status=open")
    const open = list.data[0]
    expect(open).toBeTruthy()

    const done = await req("PATCH", `/api/tasks/${open.id}`, { status: "completed" })
    expect(done.status).toBe(200)
    expect(done.data.status).toBe("completed")

    const bad = await req("PATCH", `/api/tasks/${open.id}`, { status: "bogus" })
    expect(bad.status).toBe(400)
  })

  it("lead activity actions work and are flagged simulated", async () => {
    const created = await req("POST", "/api/leads", { name: "Activity Test", estimated_value: 2200 })
    const id = created.data.id
    const res = await req("POST", `/api/leads/${id}/activity`, { action: "schedule_followup", days: 3 })
    expect(res.status).toBe(200)
    expect(res.data.simulated).toBe(true)
    expect(res.data.lead.next_action_at).toBeTruthy()

    const call = await req("POST", `/api/leads/${id}/activity`, { action: "log_call" })
    expect(call.status).toBe(200)
    expect(call.data.lead.status).toBe("contacted")
  })

  it("demo reset restores pristine seeded state", async () => {
    await req("POST", "/api/demo/reset")
    const dash = await req("GET", "/api/dashboard")
    expect(dash.data.missed_calls_open).toBe(4)
    expect(dash.data.estimates_awaiting_followup).toBe(3)
    expect(dash.data.dormant_opportunities).toBe(4)
  })
})
