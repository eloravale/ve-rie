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
  tmpDb = path.join(os.tmpdir(), `veria-phase0-test-${Date.now()}.db`)
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

// ===========================================================================
// CANONICAL LEDGER
// ===========================================================================
describe("Phase 0 — canonical revenue ledger", () => {
  it("seeds exactly three assumed historical recovery events worth $22,400", async () => {
    const s = await worker.ledgerRecoveredSummary(A())
    expect(s.recovered_events).toBe(3)
    expect(s.recovered_revenue).toBeCloseTo(22400, 2)
    expect(s.by_basis.assumed).toBeCloseTo(22400, 2)
    expect(s.by_basis.recorded).toBe(0)
    expect(s.recorded_only).toBe(0)
  })

  it("recordRecovered is idempotent — a retried write never doubles the money", async () => {
    const first = await worker.recordRecovered(A(), {
      opportunityId: "rop_8002",
      value: 1234.56,
      valueBasis: "recorded",
      outcomeType: "appointment_booked",
      actor: "owner"
    })
    expect(first.created).toBe(true)

    const retry = await worker.recordRecovered(A(), {
      opportunityId: "rop_8002",
      value: 9999,
      valueBasis: "assumed",
      outcomeType: "appointment_booked",
      actor: "owner"
    })
    expect(retry.created).toBe(false)
    expect(retry.value).toBeCloseTo(1234.56, 2) // original row preserved

    const s = await worker.ledgerRecoveredSummary(A())
    expect(s.recovered_events).toBe(4)
    expect(s.by_basis.recorded).toBeCloseTo(1234.56, 2)
  })

  it("rejects invalid recovered values and invalid bases", async () => {
    await expect(
      worker.recordRecovered(A(), { opportunityId: "rop_8003", value: -5, valueBasis: "recorded", outcomeType: "x" })
    ).rejects.toThrow(/non-negative finite/)
    await expect(
      worker.recordRecovered(A(), { opportunityId: "rop_8003", value: 100, valueBasis: "proven_cash" as any, outcomeType: "x" })
    ).rejects.toThrow(/Invalid value_basis/)
  })

  it("advanceOpportunity with an owner-supplied value records basis='recorded'; defaulted value records 'assumed'", async () => {
    // rop_8005 has estimated_value 9800; owner supplies the actual recorded amount.
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "contacted" })
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "responded" })
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "qualified" })
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "booked" })
    const res = await worker.advanceOpportunity(A(), "rop_8005", {
      stage: "recovered",
      outcome: "quote_accepted",
      recovered_value: 9500
    })
    expect(res.counted_as_recovered).toBe(true)

    const row = await db
      .prepare(`SELECT value, value_basis FROM revenue_events WHERE event_key = 'rev_cmp_1000:rop_8005:recovered'`)
      .get() as any
    expect(Number(row.value)).toBeCloseTo(9500, 2)
    expect(row.value_basis).toBe("recorded")

    // rop_8006: recovery without a supplied value defaults from the estimate → assumed.
    await worker.advanceOpportunity(A(), "rop_8006", { stage: "contacted" })
    await worker.advanceOpportunity(A(), "rop_8006", { stage: "responded" })
    await worker.advanceOpportunity(A(), "rop_8006", { stage: "qualified" })
    await worker.advanceOpportunity(A(), "rop_8006", { stage: "booked" })
    await worker.advanceOpportunity(A(), "rop_8006", { stage: "recovered", outcome: "appointment_booked" })
    const assumedRow = await db
      .prepare(`SELECT value, value_basis FROM revenue_events WHERE event_key = 'rev_cmp_1000:rop_8006:recovered'`)
      .get() as any
    expect(Number(assumedRow.value)).toBeCloseTo(3400, 2)
    expect(assumedRow.value_basis).toBe("assumed")

    // Retrying the same advance does NOT write a second ledger event.
    const summary = await worker.ledgerRecoveredSummary(A())
    const before = summary.recovered_events
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "recovered", outcome: "quote_accepted" }).catch(() => {})
    const after = await worker.ledgerRecoveredSummary(A())
    expect(after.recovered_events).toBe(before)
  })

  it("dashboard and impact both derive recovered revenue from the ledger — one figure, full basis disclosure", async () => {
    const dash = await callApi("GET", "/api/dashboard")
    const impact = await callApi("GET", "/api/impact")
    const ledger = await worker.ledgerRecoveredSummary(A())
    expect(dash.data.revenue_recovered).toBeCloseTo(ledger.recovered_revenue, 2)
    expect(impact.data.recovered_value).toBeCloseTo(ledger.recovered_revenue, 2)
    expect(dash.data.revenue_recovered_basis).toEqual(ledger.by_basis)
    // Historical seed + rop_8002 (1234.56 recorded) + rop_8005 (9500 recorded) + rop_8006 (3400 assumed)
    expect(ledger.recovered_events).toBe(6)
    expect(ledger.by_basis.recorded).toBeCloseTo(1234.56 + 9500, 2)
    expect(ledger.by_basis.assumed).toBeCloseTo(22400 + 3400, 2)
  })

  it("completing a follow-up with outcome=recovered writes ONE recorded ledger event", async () => {
    const before = await worker.ledgerRecoveredSummary(A())
    const fus = await db.prepare(`SELECT id FROM followups WHERE status='pending' LIMIT 1`).all() as any
    const fuId = fus[0].id
    const leadRow = await db
      .prepare(`SELECT l.estimated_value FROM followups f JOIN leads l ON l.id = f.lead_id WHERE f.id = ?1`)
      .get(fuId) as any
    const wonValue = Number(leadRow?.estimated_value ?? 0) || 4800
    await callApi("POST", `/api/followups/${fuId}/complete`, { outcome: "recovered" })
    const after = await worker.ledgerRecoveredSummary(A())
    expect(after.recovered_events).toBe(before.recovered_events + 1)
    expect(after.recovered_revenue).toBeCloseTo(before.recovered_revenue + wonValue, 2)
    // Idempotent at the ledger: no path can double-complete anyway, but the key is deterministic.
    const row = await db.prepare(`SELECT value, value_basis, outcome_type FROM revenue_events WHERE event_key LIKE 'rev_cmp_1000:fu_%:recovered'`).all() as any
    expect(row.length).toBe(1)
    expect(row[0].value_basis).toBe("recorded")
  })
})

// ===========================================================================
// OPPORTUNITY IDENTITY + SYNC IDEMPOTENCY
// ===========================================================================
describe("Phase 0 — deterministic identity & sync idempotency", () => {
  it("identityKeyFor is deterministic: source pair, else normalized customer", () => {
    expect(worker.identityKeyFor("quote", "est_1002", "x")).toBe("quote:est_1002")
    // Rule matches the SQL backfill in 0005/0006: LOWER(TRIM(name)).
    expect(worker.identityKeyFor("handoff", null, "  Ellen  WIGGINS ")).toBe("handoff:cust:ellen  wiggins")
    expect(worker.identityKeyFor("handoff", undefined, "Ellen Wiggins")).toBe("handoff:cust:ellen wiggins")
  })

  it("a pristine seeded workspace is a sync FIXED POINT (seed → sync = 0)", async () => {
    await worker.resetDemo(A())
    const first = await worker.syncOpportunities(A())
    expect(first.created).toBe(0)
    const second = await worker.syncOpportunities(A())
    expect(second.created).toBe(0)
  })

  it("closing an opportunity allows re-identification of the same underlying problem", async () => {
    // rop_8004 (missed_call:mcl_4006) is open; mark it lost, then sync again.
    await worker.advanceOpportunity(A(), "rop_8004", { stage: "lost", outcome: "no_answer" })
    const res = await worker.syncOpportunities(A())
    expect(res.created).toBe(1)
    const rows = await db
      .prepare(`SELECT id FROM recovery_opportunities WHERE identity_key = 'missed_call:mcl_4006' AND stage = 'identified'`)
      .all() as any
    expect(rows.length).toBe(1)
    await worker.resetDemo(A())
  })

  it("double-representation guard: the seed contains exactly one Ellen Wiggins opportunity", async () => {
    const rows = await db
      .prepare(`SELECT id FROM recovery_opportunities WHERE LOWER(TRIM(customer_name)) = 'ellen wiggins'`)
      .all() as any
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe("rop_8015") // the quote — the handoff duplicate (rop_8014) is gone
  })

  it("every opportunity carries a non-null identity_key after seed or sync", async () => {
    const rows = await db
      .prepare(`SELECT COUNT(*) AS n FROM recovery_opportunities WHERE identity_key IS NULL`)
      .get() as any
    expect(Number(rows.n)).toBe(0)
  })
})

// ===========================================================================
// WORKSPACE SEPARATION
// ===========================================================================
describe("Phase 0 — workspace separation", () => {
  it("GET /api/workspace reports the seeded demo workspace", async () => {
    const res = await callApi("GET", "/api/workspace")
    expect(res.status).toBe(200)
    expect(res.data.company_id).toBe("cmp_1000")
    expect(res.data.workspace_kind).toBe("demo")
  })

  it("reset is refused with 409 on a prospect workspace and nothing is destroyed", async () => {
    await db.prepare(`UPDATE company_settings SET workspace_kind = 'prospect' WHERE company_id = 'cmp_1000'`).run()
    // Make a mutation that a reset would wipe:
    await worker.advanceOpportunity(A(), "rop_8001", { stage: "contacted" })
    const res = await callApi("POST", "/api/demo/reset")
    expect(res.status).toBe(409)
    expect(res.data.code).toBe("workspace_guard")
    // The mutation survived — the reset did NOT run.
    const stage = await db.prepare(`SELECT stage FROM recovery_opportunities WHERE id = 'rop_8001'`).get() as any
    expect(stage.stage).toBe("contacted")
    await db.prepare(`UPDATE company_settings SET workspace_kind = 'demo' WHERE company_id = 'cmp_1000'`).run()
    await worker.resetDemo(A())
  })

  it("customer workspaces are equally protected; settings expose workspace_kind", async () => {
    await db.prepare(`UPDATE company_settings SET workspace_kind = 'customer' WHERE company_id = 'cmp_1000'`).run()
    const res = await callApi("POST", "/api/demo/reset")
    expect(res.status).toBe(409)
    const settings = await callApi("GET", "/api/settings")
    expect(settings.data.workspace_kind).toBe("customer")
    await db.prepare(`UPDATE company_settings SET workspace_kind = 'demo' WHERE company_id = 'cmp_1000'`).run()
  })
})

// ===========================================================================
// GUARDRAILS — admin token on destructive routes + CORS
// ===========================================================================
describe("Phase 0 — destructive-route guardrails", () => {
  it("reset without a token is 401 when VERIA_ADMIN_TOKEN is configured", async () => {
    const env = { VERIA_ADMIN_TOKEN: "s3cret-token-value" }
    const res = await callApi("POST", "/api/demo/reset", undefined, env)
    expect(res.status).toBe(401)
    expect(res.data.code).toBe("admin_token_required")
  })

  it("reset with the CORRECT token succeeds; delete route is guarded the same way", async () => {
    const env = { VERIA_ADMIN_TOKEN: "s3cret-token-value" }
    const wrong = await callApi("POST", "/api/demo/reset", undefined, env, { "x-admin-token": "wrong" })
    expect(wrong.status).toBe(401)
    const right = await callApi("POST", "/api/demo/reset", undefined, env, { "x-admin-token": "s3cret-token-value" })
    expect(right.status).toBe(200)
    const del = await callApi("POST", "/api/data/delete", undefined, env)
    expect(del.status).toBe(401)
    const delOk = await callApi("POST", "/api/data/delete", undefined, env, { "x-admin-token": "s3cret-token-value" })
    expect(delOk.status).toBe(200)
    await worker.resetDemo(A())
  })

  it("VERIA_PROTECTED_MODE=1 is fail-closed even without a token configured", async () => {
    const res = await callApi("POST", "/api/demo/reset", undefined, { VERIA_PROTECTED_MODE: "1" })
    expect(res.status).toBe(401)
  })

  it("local dev stays open when no token is configured", async () => {
    const res = await callApi("POST", "/api/demo/reset", undefined, {})
    expect(res.status).toBe(200)
  })

  it("CORS: localhost dev origins allowed; unknown origins get no ACAO header", async () => {
    const env = { VERIA_ALLOWED_ORIGINS: "https://app.veria.example" }
    const request = new Request("http://localhost:8787/api/health", { headers: { Origin: "https://app.veria.example" } })
    const resp = await worker.default.fetch(request, { DB: A(), ASSETS: { fetch: async () => new Response("") }, ...env } as any)
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("https://app.veria.example")

    const evil = new Request("http://localhost:8787/api/health", { headers: { Origin: "https://evil.example" } })
    const resp2 = await worker.default.fetch(evil, { DB: A(), ASSETS: { fetch: async () => new Response("") }, ...env } as any)
    expect(resp2.headers.get("Access-Control-Allow-Origin")).toBeNull()

    const dev = new Request("http://localhost:8787/api/health", { headers: { Origin: "http://localhost:5173" } })
    const resp3 = await worker.default.fetch(dev, { DB: A(), ASSETS: { fetch: async () => new Response("") } } as any)
    expect(resp3.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173")
  })
})

// ===========================================================================
// CSV IMPORT INTEGRITY
// ===========================================================================
describe("Phase 0 — CSV import duplicates & atomicity", () => {
  it("duplicate rows (name+phone) are skipped and REPORTED, not imported twice", async () => {
    await worker.resetDemo(A())
    const csv = [
      "name,phone,service,status,value",
      "Zack Testman,(918) 555-7777,Furnace repair,new,3000",
      "ZACK TESTMAN,(918) 555-7777,Furnace repair,new,3000",
      "  zack   testman ,(918) 555-7777,Furnace repair,new,3000"
    ].join("\n")
    const first = await callApi("POST", "/api/imports/commit", { kind: "leads", filename: "t.csv", csv })
    expect(first.status).toBe(200)
    expect(first.data.imported).toBe(1)
    expect(first.data.duplicates).toBe(2)
    expect(first.data.duplicate_rule).toContain("name + phone")
    expect(first.data.imported + first.data.skipped).toBe(first.data.row_count)
    expect(first.data.duplicates).toBe(first.data.skipped) // the only skips here are duplicates

    // A second identical file imports ZERO new rows — all duplicates now.
    const second = await callApi("POST", "/api/imports/commit", { kind: "leads", filename: "t2.csv", csv })
    expect(second.data.imported).toBe(0)
    expect(second.data.duplicates).toBe(3)
  })

  it("duplicate calls and quotes are detected per their own rules", async () => {
    const callCsv = ["caller_name,caller_phone,created_at,value", "Pat Doe,(918) 555-8888,2026-09-01,4800", "Pat Doe,(918) 555-8888,2026-09-01,4800"].join("\n")
    const calls = await callApi("POST", "/api/imports/commit", { kind: "calls", filename: "c.csv", csv: callCsv })
    expect(calls.data.imported).toBe(1)
    expect(calls.data.duplicates).toBe(1)
    expect(calls.data.duplicate_rule).toContain("phone")

    const quoteCsv = ["name,phone,quote_amount,quote_date", "Quinn Fox,(918) 555-9999,5500,2026-09-02", "Quinn Fox,(918) 555-9999,5500,2026-09-02"].join("\n")
    const quotes = await callApi("POST", "/api/imports/commit", { kind: "quotes", filename: "q.csv", csv: quoteCsv })
    expect(quotes.data.imported).toBe(1)
    expect(quotes.data.duplicates).toBe(1)
  })

  it("an import that fails mid-way leaves NO partial rows (transaction rollback)", async () => {
    const before = await db.prepare(`SELECT COUNT(*) AS n FROM leads`).get() as any
    const nBefore = Number(before.n)
    // Row 2 is valid; row 3 has a name that is too long → validation error mid-import.
    const csv = ["name,phone,value", "Good Row One,(918) 555-1010,1000", "x".repeat(500) + ",(918) 555-1011,2000"].join("\n")
    const res = await callApi("POST", "/api/imports/commit", { kind: "leads", filename: "boom.csv", csv })
    expect(res.status).toBe(500)
    const after = await db.prepare(`SELECT COUNT(*) AS n FROM leads`).get() as any
    expect(Number(after.n)).toBe(nBefore) // the valid row was NOT kept — all or nothing
  })
})

// ===========================================================================
// MIGRATION & LEDGER INTEGRITY
// ===========================================================================
describe("Phase 0 — migration & ledger integrity", () => {
  it("migration 0006 is idempotent — re-running it on the seeded DB changes nothing", async () => {
    const beforeOpps = await db.prepare(`SELECT COUNT(*) AS n FROM recovery_opportunities`).get() as any
    const beforeLedger = await db.prepare(`SELECT COUNT(*) AS n FROM revenue_events`).get() as any
    // 0006 is the replayable migration (resetDemo runs it after re-seeding).
    // 0005 intentionally is not re-runnable (CREATE TABLE without IF NOT EXISTS).
    db.exec(fs.readFileSync(path.join(ROOT, "migrations", "0006_sync_fixed_point.sql"), "utf8"))
    const afterOpps = await db.prepare(`SELECT COUNT(*) AS n FROM recovery_opportunities`).get() as any
    const afterLedger = await db.prepare(`SELECT COUNT(*) AS n FROM revenue_events`).get() as any
    expect(Number(afterOpps.n)).toBe(Number(beforeOpps.n))
    expect(Number(afterLedger.n)).toBe(Number(beforeLedger.n))
  })

  it("resetDemo restores the identical ledger (events, amounts, bases)", async () => {
    await worker.resetDemo(A())
    const s = await worker.ledgerRecoveredSummary(A())
    expect(s.recovered_events).toBe(3)
    expect(s.recovered_revenue).toBeCloseTo(22400, 2)
    expect(s.by_basis.assumed).toBeCloseTo(22400, 2)
  })

  it("foreign key enforcement is active: a ledger row for a missing company is rejected", async () => {
    let threw: unknown = null
    try {
      db.exec(`INSERT INTO revenue_events (id, company_id, opportunity_id, kind, value, value_basis, outcome_type, actor, event_key, created_at)
               VALUES ('rev_bad', 'cmp_missing', NULL, 'recovered', 100, 'recorded', 'x', 'test', 'rev_bad_key', datetime('now'))`)
    } catch (e) {
      threw = e
    }
    expect(threw).toBeTruthy()
    expect(String(threw)).toContain("FOREIGN KEY")
  })

  it("demo reset inside a customer workspace inside the API returns 409 and leaves the ledger intact", async () => {
    const env = { VERIA_ADMIN_TOKEN: "t0ken" }
    await db.prepare(`UPDATE company_settings SET workspace_kind = 'customer' WHERE company_id = 'cmp_1000'`).run()
    const ledgerBefore = await worker.ledgerRecoveredSummary(A())
    const res = await callApi("POST", "/api/demo/reset", undefined, env, { "x-admin-token": "t0ken" })
    expect(res.status).toBe(409)
    const ledgerAfter = await worker.ledgerRecoveredSummary(A())
    expect(ledgerAfter.recovered_revenue).toBeCloseTo(ledgerBefore.recovered_revenue, 2)
    await db.prepare(`UPDATE company_settings SET workspace_kind = 'demo' WHERE company_id = 'cmp_1000'`).run()
  })
})

// ===========================================================================
// E2E — CSV → sync → advance → ledger → dashboard
// ===========================================================================
describe("Phase 0 — E2E recovery flow", () => {
  it("imported data flows through sync into opportunities, and owner recovery lands in the ledger", async () => {
    await worker.resetDemo(A())
    // 1) CSV import: two slow-looking enquiries… import as leads
    const csv = ["name,phone,service,status,value,created_at", "Nora Apex,(918) 555-4321,AC replacement,new,7500,2026-09-20"].join("\n")
    const imp = await callApi("POST", "/api/imports/commit", { kind: "leads", filename: "e2e.csv", csv })
    expect(imp.status).toBe(200)
    expect(imp.data.imported).toBe(1)

    // 2) Sync materializes the imported lead as an unworked opportunity (9+ days idle)
    const sync = await callApi("POST", "/api/opportunities/sync")
    expect(sync.status).toBe(200)
    expect(sync.data.created).toBeGreaterThanOrEqual(1)
    const list = await callApi("GET", "/api/opportunities?source=unworked_lead")
    const nora = list.data.items.find((o: any) => o.customer_name === "Nora Apex")
    expect(nora).toBeTruthy()

    // 3) Advance Nora through the honest path to recovered with a recorded value
    for (const stage of ["contacted", "responded", "qualified", "booked"]) {
      await callApi("PATCH", `/api/opportunities/${nora.id}`, { stage })
    }
    const rec = await callApi("PATCH", `/api/opportunities/${nora.id}`, {
      stage: "recovered",
      outcome: "quote_accepted",
      recovered_value: 7100
    })
    expect(rec.status).toBe(200)
    expect(rec.data.counted_as_recovered).toBe(true)

    // 4) The ledger is the single source of the dashboard headline
    const ledger = await worker.ledgerRecoveredSummary(A())
    expect(ledger.by_basis.recorded).toBeCloseTo(7100, 2)
    const dash = await callApi("GET", "/api/dashboard")
    expect(dash.data.revenue_recovered).toBeCloseTo(ledger.recovered_revenue, 2)
    expect(dash.data.revenue_recovered_basis.recorded).toBeCloseTo(7100, 2)

    // 5) Truth labels: identified value is opportunity value, never revenue
    const impact = await callApi("GET", "/api/impact")
    expect(impact.data.identified_value).toBeGreaterThan(impact.data.recovered_value)
    expect(impact.data.illustrative).toBe(true)

    // 6) Reset restores the pristine fixed point — sync creates zero again
    await worker.resetDemo(A())
    const sync2 = await callApi("POST", "/api/opportunities/sync")
    expect(sync2.data.created).toBe(0)
  })
})
