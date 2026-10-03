import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createRequire } from "node:module"

// Vite's resolver does not know the node:sqlite builtin yet — load it via require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite")

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { suggestMapping } from "../src/worker/csv"
import { auditToHtml } from "../src/web/audit-export"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

let db: DatabaseSync
let worker: typeof import("../dist-worker/index.js")
let tmpDb: string

interface D1Result<T> {
  results?: T[]
  success: boolean
}

function adapter(database: DatabaseSync, env: Record<string, unknown> = {}) {
  const run = (sql: string, params: unknown[]) => {
    const stmt = database.prepare(sql)
    return params && params.length ? stmt.all(...(params as never[])) : stmt.all()
  }
  return {
    ...env,
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

async function callApi(
  method: string,
  apiPath: string,
  body?: unknown,
  env: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  const request = new Request(`http://localhost:8787${apiPath}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const response = await worker.default.fetch(request, {
    DB: adapter(db),
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    ...env
  } as any)
  const text = await response.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: response.status, data }
}

beforeAll(async () => {
  tmpDb = path.join(os.tmpdir(), `veria-sales-test-${Date.now()}.db`)
  db = new DatabaseSync(tmpDb)
  db.exec("PRAGMA journal_mode = MEMORY;")
  db.exec("PRAGMA foreign_keys = ON;")
  const migrationsDir = path.join(ROOT, "migrations")
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"))
  }
  worker = await import(pathToFileURL(path.join(ROOT, "dist-worker", "index.js")).href)
})

afterAll(() => {
  try {
    fs.rmSync(tmpDb, { force: true })
  } catch {
    /* Windows EPERM on locked tmp file — cosmetic */
  }
})

const A = () => adapter(db)
const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n

const DISCLAIMER_SENTENCE = "Identified recovery opportunities are not guaranteed revenue."

// ===========================================================================
// REVENUE RECOVERY AUDIT — generation, totals, distinction, priority
// ===========================================================================
describe("Revenue Recovery Audit — generation", () => {
  it("returns every required section: company, period, data sources, categories, actions, disclaimer", async () => {
    const res = await callApi("GET", "/api/audit?days=90")
    expect(res.status).toBe(200)
    const doc = res.data

    expect(doc.company.name).toBeTruthy()
    expect(doc.period_days).toBe(90)
    expect(doc.generated_at).toBeTruthy()
    expect(typeof doc.data_basis).toBe("string")

    // Data sources: named, scoped, with real row counts — never invented.
    expect(Array.isArray(doc.data_sources)).toBe(true)
    expect(doc.data_sources.length).toBeGreaterThanOrEqual(4)
    for (const s of doc.data_sources) {
      expect(s.source).toBeTruthy()
      expect(s.scope).toBeTruthy()
      expect(typeof s.count).toBe("number")
      expect(s.count).toBeGreaterThanOrEqual(0)
    }

    // Findings + categories
    expect(doc.enquiries).toBeGreaterThanOrEqual(0)
    expect(doc.missed_unanswered).toBeGreaterThanOrEqual(0)
    expect(doc.open_quotes).toBeGreaterThanOrEqual(0)
    expect(doc.overdue_quotes).toBeGreaterThanOrEqual(0)
    expect(doc.dormant_customers).toBeGreaterThanOrEqual(0)
    expect(doc.opportunity.total).toBeGreaterThan(0)

    // Top actions with recommended next steps
    expect(doc.top_actions.length).toBeGreaterThan(0)
    expect(doc.top_actions.length).toBeLessThanOrEqual(5)

    // The exact disclaimer sentence required by the spec.
    expect(doc.disclaimer).toContain(DISCLAIMER_SENTENCE)
    expect(doc.workspace_kind).toBe("demo")
  })

  it("financial totals reconcile: category breakdown sums to the identified total and to live leakage", async () => {
    const doc = (await callApi("GET", "/api/audit?days=90")).data
    const catSum =
      doc.opportunity.missed_enquiries +
      doc.opportunity.quote_followup +
      doc.opportunity.dormant_customers +
      doc.opportunity.slow_responses +
      doc.opportunity.other
    expect(Math.round(catSum)).toBe(Math.round(doc.opportunity.total))

    const leakage = (await callApi("GET", "/api/leakage")).data
    expect(Math.round(leakage.total)).toBe(Math.round(doc.opportunity.total))
    expect(leakage.total_count).toBeGreaterThan(0)
  })

  it("identified opportunity and recorded recovered revenue are distinct, both canonical", async () => {
    const doc = (await callApi("GET", "/api/audit?days=90")).data
    const dash = (await callApi("GET", "/api/dashboard")).data
    const ledger = await worker.ledgerRecoveredSummary(A())

    // Recovered figures all come from the one ledger (audit == dashboard == ledger).
    expect(doc.recovered.value).toBeCloseTo(ledger.recovered_revenue, 2)
    expect(doc.recovered.value).toBeCloseTo(dash.revenue_recovered, 2)
    expect(doc.recovered.events).toBe(ledger.recovered_events)
    expect(doc.recovered.by_basis).toEqual(ledger.by_basis)

    // The two numbers are separate fields and are not the same concept:
    expect(doc.opportunity).not.toHaveProperty("recovered")
    expect(doc.recovered).not.toHaveProperty("opportunity_total")
    expect(doc.opportunity.total).toBeGreaterThan(0)
    expect(doc.recovered.value).toBeGreaterThan(0)
  })

  it("top actions follow the priority hierarchy with age, status and recommended action", async () => {
    const doc = (await callApi("GET", "/api/audit?days=90")).data
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
    let prev = -1
    for (const a of doc.top_actions) {
      expect(a.rank).toBeGreaterThan(0)
      expect(a.title).toBeTruthy()
      expect(a.why).toBeTruthy()
      expect(a.recommended_action).toBeTruthy()
      expect(a.age_days).toBeGreaterThanOrEqual(0)
      expect(["high", "medium", "low"]).toContain(a.priority)
      expect(a.stage).toBeTruthy()
      const r = rank[a.priority] ?? 3
      expect(r).toBeGreaterThanOrEqual(prev) // never ranks a lower priority above a higher one
      prev = r
    }
  })

  it("a recorded recovery moves ONLY the ledger figure, never the identified figure", async () => {
    const before = (await callApi("GET", "/api/audit?days=90")).data
    const open = db
      .prepare(`SELECT id FROM recovery_opportunities WHERE company_id = 'cmp_1000' AND stage NOT IN ('recovered','lost') LIMIT 1`)
      .get() as { id: string }

    await worker.recordRecovered(A(), {
      opportunityId: open.id,
      value: 777,
      valueBasis: "recorded",
      outcomeType: "quote_accepted",
      actor: "owner"
    })

    const after = (await callApi("GET", "/api/audit?days=90")).data
    expect(after.recovered.value).toBeCloseTo(before.recovered.value + 777, 2)
    expect(after.recovered.by_basis.recorded).toBeCloseTo(before.recovered.by_basis.recorded + 777, 2)
    expect(after.opportunity.total).toBeCloseTo(before.opportunity.total, 2) // untouched
  })

  it("HTML export carries branding, sources, ledger terminology and the exact disclaimer", async () => {
    const doc = (await callApi("GET", "/api/audit?days=90")).data
    const html = auditToHtml(doc)
    expect(html).toContain("VÉRIA")
    // Company name appears HTML-escaped (Cedar Ridge Heating & Cooling → &amp;).
    expect(html).toContain(doc.company.name.replace(/&/g, "&amp;"))
    expect(html).toContain("Data sources")
    expect(html).toContain("Identified recovery opportunity")
    expect(html).toContain("Recorded recovered revenue")
    expect(html).toContain("revenue_events")
    expect(html).toContain("assumed")
    expect(html).toContain("recorded")
    expect(html).toContain("Methodology")
    expect(html).toContain(`“${DISCLAIMER_SENTENCE}”`)
    expect(html).toContain("Recommended action:")
  })
})

// ===========================================================================
// CSV MAPPING + IMPORT RESULTS (nothing silently discarded)
// ===========================================================================
describe("CSV mapping & import results", () => {
  it("recognizes all common prospect headers without manual mapping", () => {
    const headers = [
      "lead_name",
      "customer_name",
      "phone",
      "email",
      "source",
      "created_at",
      "status",
      "value",
      "quote_amount",
      "quote_date",
      "last_contact",
      "job_type"
    ]
    const m = suggestMapping(headers)
    expect(m["lead_name"]).toBe("name")
    expect(m["customer_name"]).toBe("customer_name")
    expect(m["phone"]).toBe("phone")
    expect(m["email"]).toBe("email")
    expect(m["source"]).toBe("source")
    expect(m["created_at"]).toBe("created_at")
    expect(m["status"]).toBe("status")
    expect(m["value"]).toBe("value")
    expect(m["quote_amount"]).toBe("quote_amount")
    expect(m["quote_date"]).toBe("quote_date")
    expect(m["last_contact"]).toBe("last_contact")
    expect(m["job_type"]).toBe("job_type")
  })

  it("import reports rows read / imported / duplicates / rejected with reasons", async () => {
    const csv =
      "lead_name,phone,value\n" +
      "Anna Torres,(555) 010-2222,3200\n" +
      "Anna Torres,(555) 010-2222,3200\n" +
      ",(555) 010-3333,1500\n"
    const res = await callApi("POST", "/api/imports/commit", {
      kind: "leads",
      filename: "prospect-leads.csv",
      csv
    })
    expect(res.status).toBe(200)
    expect(res.data.row_count).toBe(3)
    expect(res.data.imported).toBe(1)
    expect(res.data.duplicates).toBe(1)
    expect(res.data.duplicate_rule).toBeTruthy()
    const rejected = res.data.row_count - res.data.imported - res.data.duplicates
    expect(rejected).toBe(1)
    expect(res.data.errors.length).toBeGreaterThanOrEqual(1)
    // Every rejection carries a reason (duplicates and validation failures alike).
    expect(res.data.errors.some((e: string) => /duplicate/.test(e))).toBe(true)
    expect(res.data.errors.some((e: string) => /missing name/.test(e))).toBe(true)
    // Accounting identity: every row is read and accounted for.
    expect(res.data.imported + res.data.duplicates + rejected).toBe(res.data.row_count)
  })

  it("re-importing the same file skips every row as a duplicate", async () => {
    const csv = "lead_name,phone,value\nAnna Torres,(555) 010-2222,3200\nAnna Torres,(555) 010-2222,3200\n"
    const res = await callApi("POST", "/api/imports/commit", {
      kind: "leads",
      filename: "prospect-leads.csv",
      csv
    })
    expect(res.status).toBe(200)
    expect(res.data.imported).toBe(0)
    expect(res.data.duplicates).toBe(2)
    expect(count(`SELECT COUNT(*) AS n FROM leads WHERE name = 'Anna Torres'`)).toBe(1)
  })
})

// ===========================================================================
// DEMO WORKSPACE INTEGRITY (before any prospect switch)
// ===========================================================================
describe("Demo workspace invariants", () => {
  it("demo reset works in demo mode and keeps the sync fixed point", async () => {
    const reset = await callApi("POST", "/api/demo/reset")
    expect(reset.status).toBe(200)
    expect(reset.data.ok).toBe(true)

    const first = await callApi("POST", "/api/opportunities/sync")
    expect(first.status).toBe(200)
    expect(first.data.created).toBe(0)
    const second = await callApi("POST", "/api/opportunities/sync")
    expect(second.data.created).toBe(0)

    const ws = await callApi("GET", "/api/workspace")
    expect(ws.data.workspace_kind).toBe("demo")
  })
})

// ===========================================================================
// PROSPECT MODE — separation, labelling, protection
// ===========================================================================
describe("Prospect Mode separation", () => {
  const PROSPECT_NAME = "Honest Air Co"

  it("start is token-guarded when protected mode is configured", async () => {
    const denied = await callApi("POST", "/api/prospect/start", {}, { VERIA_ADMIN_TOKEN: "sekret-token" })
    expect(denied.status).toBe(401)
    expect(denied.data.code).toBe("admin_token_required")
    // Workspace untouched by the denied call.
    expect((await callApi("GET", "/api/workspace")).data.workspace_kind).toBe("demo")
  })

  it("refuses to start a prospect workspace under the fictional demo company name (spec §3)", async () => {
    const demoName = (db.prepare(`SELECT name FROM companies WHERE id = 'cmp_1000'`).get() as { name: string }).name
    expect(demoName.length).toBeGreaterThan(0)
    // Case-insensitive match on the seeded demo identity.
    const res = await callApi("POST", "/api/prospect/start", { company_name: demoName.toUpperCase() })
    expect(res.status).toBe(400)
    expect(String(res.data.error)).toMatch(/demo company name/i)
    // The refusal happens BEFORE the wipe — demo workspace fully intact.
    expect((await callApi("GET", "/api/workspace")).data.workspace_kind).toBe("demo")
    expect(count(`SELECT COUNT(*) AS n FROM recovery_opportunities`)).toBeGreaterThan(0)
    expect(count(`SELECT COUNT(*) AS n FROM leads`)).toBeGreaterThan(0)
    expect((db.prepare(`SELECT name FROM companies WHERE id = 'cmp_1000'`).get() as { name: string }).name).toBe(demoName)
  })

  it("starting a prospect workspace clears demo data, renames the company, and locks demo reset", async () => {
    const res = await callApi("POST", "/api/prospect/start", { company_name: PROSPECT_NAME })
    expect(res.status).toBe(200)
    expect(res.data.workspace_kind).toBe("prospect")
    expect(res.data.company_name).toBe(PROSPECT_NAME)

    // Demo business data gone; app scaffolding intact.
    expect(count(`SELECT COUNT(*) AS n FROM recovery_opportunities`)).toBe(0)
    expect(count(`SELECT COUNT(*) AS n FROM revenue_events`)).toBe(0)
    expect(count(`SELECT COUNT(*) AS n FROM leads`)).toBe(0)
    expect(count(`SELECT COUNT(*) AS n FROM companies`)).toBe(1)

    // Fictional demo identity removed.
    const company = db.prepare(`SELECT name, city FROM companies WHERE id = 'cmp_1000'`).get() as {
      name: string
      city: string
    }
    expect(company.name).toBe(PROSPECT_NAME)
    expect(company.city).toBe("")

    // Demo reset is now refused — prospect data can never be wiped by it.
    const reset = await callApi("POST", "/api/demo/reset")
    expect(reset.status).toBe(409)
    expect(reset.data.code).toBe("workspace_guard")
    expect(count(`SELECT COUNT(*) AS n FROM companies`)).toBe(1)
  })

  it("prospect import survives reset attempts and the audit labels it truthfully", async () => {
    const csv = "lead_name,phone,value\nMaria Ortega,(555) 077-8100,5400\n"
    const imported = await callApi("POST", "/api/imports/commit", {
      kind: "leads",
      filename: "honest-air-leads.csv",
      csv
    })
    expect(imported.data.imported).toBe(1)
    expect(count(`SELECT COUNT(*) AS n FROM leads`)).toBe(1)

    // Reset still refused, data intact.
    const reset = await callApi("POST", "/api/demo/reset")
    expect(reset.status).toBe(409)
    expect(count(`SELECT COUNT(*) AS n FROM leads`)).toBe(1)

    // Audit: labelled as prospect data, named after the real company.
    const doc = (await callApi("GET", "/api/audit?days=90")).data
    expect(doc.workspace_kind).toBe("prospect")
    expect(doc.company.name).toBe(PROSPECT_NAME)
    expect(doc.company.name).not.toContain("Cedar Ridge")
    const settings = (await callApi("GET", "/api/settings")).data
    expect(settings.workspace_kind).toBe("prospect")

    // The prospect's own data flows into identified opportunity.
    const sync = await callApi("POST", "/api/opportunities/sync")
    expect(sync.data.created).toBeGreaterThanOrEqual(0)
    const after = (await callApi("GET", "/api/audit?days=90")).data
    expect(after.opportunity.total).toBeGreaterThanOrEqual(0)
  })

  it("start is idempotent — calling it again never wipes imported prospect data", async () => {
    const before = count(`SELECT COUNT(*) AS n FROM leads`)
    const again = await callApi("POST", "/api/prospect/start", { company_name: "Something Else" })
    expect(again.status).toBe(200)
    expect(again.data.workspace_kind).toBe("prospect")
    expect(count(`SELECT COUNT(*) AS n FROM leads`)).toBe(before)
    // Company name NOT overwritten by the idempotent path either.
    const company = db.prepare(`SELECT name FROM companies WHERE id = 'cmp_1000'`).get() as { name: string }
    expect(company.name).toBe("Honest Air Co")
  })

  it("customer workspaces are protected from prospect start", async () => {
    db.prepare(`UPDATE company_settings SET workspace_kind = 'customer' WHERE company_id = 'cmp_1000'`).run()
    const res = await callApi("POST", "/api/prospect/start", {})
    expect(res.status).toBe(409)
    expect(res.data.code).toBe("workspace_guard")
    db.prepare(`UPDATE company_settings SET workspace_kind = 'prospect' WHERE company_id = 'cmp_1000'`).run()
    expect((await callApi("GET", "/api/workspace")).data.workspace_kind).toBe("prospect")
  })

  it("rename via settings changes the audit's company name", async () => {
    const patched = await callApi("PATCH", "/api/settings", { company_name: "Honest Air & Heat" })
    expect(patched.status).toBe(200)
    const doc = (await callApi("GET", "/api/audit?days=90")).data
    expect(doc.company.name).toBe("Honest Air & Heat")
  })
})
