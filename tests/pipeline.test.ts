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

beforeAll(async () => {
  tmpDb = path.join(os.tmpdir(), `veria-pipeline-test-${Date.now()}.db`)
  db = new DatabaseSync(tmpDb)
  db.exec("PRAGMA journal_mode = MEMORY;")
  // Phase 0: referential integrity enforced in test harnesses too.
  db.exec("PRAGMA foreign_keys = ON;")
  const migrationsDir = path.join(ROOT, "migrations")
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"))
  }
  worker = await import(pathToFileURL(path.join(ROOT, "dist-worker", "index.js")).href)
  const pipeline = worker
  void pipeline
})

afterAll(() => {
  try {
    fs.rmSync(tmpDb, { force: true })
  } catch {
    /* Windows EPERM on locked tmp file — cosmetic */
  }
})

const A = () => adapter(db)

describe("recovery score — credit-score model", () => {
  it("scores the seeded (leaky) demo company mid-range, never 0, with explainable lines", async () => {
    const score = await worker.computeRecoveryScore(A())
    expect(score.score).toBeGreaterThan(0)
    expect(score.score).toBeLessThanOrEqual(100)
    expect(score.cold_start).toBe(false)
    expect(["critical", "leaking", "acceptable", "strong"]).toContain(score.band)
    // Explainability: lines carry both credits and penalties on genuinely mixed data.
    expect(score.lines.some((l: { delta: number }) => l.delta > 0)).toBe(true)
    expect(score.lines.some((l: { delta: number }) => l.delta < 0)).toBe(true)
    for (const l of score.lines) {
      expect(typeof l.label).toBe("string")
      expect(l.detail.length).toBeGreaterThan(0)
    }
  })

})

describe("response health (pure computation)", () => {
  it("buckets enquiries and computes the median", () => {
    const health = worker.computeResponseHealth([
      { response_minutes: 4, first_response_at: "x" },
      { response_minutes: 7, first_response_at: "x" },
      { response_minutes: 60, first_response_at: "x" },
      { response_minutes: 200, first_response_at: "x" },
      { response_minutes: null, first_response_at: null },
      { response_minutes: null, first_response_at: null }
    ])
    expect(health.total).toBe(6)
    expect(health.responded).toBe(4)
    expect(health.no_response).toBe(2)
    const byKey = Object.fromEntries(health.buckets.map((b) => [b.key, b.count]))
    expect(byKey).toEqual({ lt5: 1, "5to30": 1, "30to120": 1, over120: 1, none: 2 })
    expect(health.median_minutes).toBe(33.5)
  })
})

describe("opportunity sync — classification & idempotency", () => {
  it("seeded workspace is a sync fixed point; repeat syncs are idempotent", async () => {
    // Phase 0 §11: the seed already materializes everything sync would derive
    // (migration 0006) — a first sync on a pristine workspace creates ZERO.
    const first = await worker.syncOpportunities(A())
    expect(first.created).toBe(0)
    const second = await worker.syncOpportunities(A())
    expect(second.created).toBe(0)
  })
  it("classifies missed enquiries, slow responses, quotes and dormant customers", async () => {
    const res = await A()
      .prepare(`SELECT source_type, COUNT(*) AS n FROM recovery_opportunities WHERE company_id = 'cmp_1000' GROUP BY source_type`)
      .all<{ source_type: string; n: number }>()
    const counts = Object.fromEntries((res.results ?? []).map((r) => [r.source_type, r.n]))
    expect(counts["quote"]).toBeGreaterThanOrEqual(3)
    expect(counts["missed_call"]).toBeGreaterThanOrEqual(3)
    expect(counts["slow_response"]).toBeGreaterThanOrEqual(3)
    expect(counts["dormant_customer"]).toBeGreaterThanOrEqual(1)
    const rows = await A()
      .prepare(`SELECT title, why, recommended_action, priority, stage FROM recovery_opportunities WHERE company_id = 'cmp_1000'`)
      .all<{ title: string; why: string; recommended_action: string; priority: string; stage: string }>()
    for (const r of rows.results ?? []) {
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.why.length).toBeGreaterThan(0)
      expect(r.recommended_action.length).toBeGreaterThan(0)
      expect(["low", "medium", "high"]).toContain(r.priority)
      expect(["identified", "contacted", "responded", "qualified", "booked", "recovered", "lost"]).toContain(r.stage)
    }
  })
})

describe("leakage radar", () => {
  it("aggregates open opportunities into categories with severity", async () => {
    const leak = await worker.buildLeakage(A())
    expect(leak.categories.length).toBeGreaterThan(0)
    expect(leak.total).toBeGreaterThan(0)
    expect(leak.total_count).toBeGreaterThan(0)
    for (const c of leak.categories) {
      expect(c.count).toBeGreaterThan(0)
      expect(["high", "medium", "low"]).toContain(c.severity)
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.recommended_action.length).toBeGreaterThan(0)
    }
    expect(leak.total).toBeCloseTo(leak.categories.reduce((s, c) => s + c.value, 0), 2)
  })
})

describe("impact — honest recovery accounting", () => {
  it("separates identified, actioned, recovered and open value", async () => {
    const impact = await worker.buildImpact(A())
    expect(impact.identified_value).toBeGreaterThan(impact.recovered_value)
    expect(impact.recovered_value).toBeGreaterThan(0)
    expect(impact.still_open_value).toBeGreaterThan(0)
    expect(impact.action_rate).toBeGreaterThanOrEqual(0)
    expect(impact.action_rate).toBeLessThanOrEqual(1)
    expect(impact.recovery_rate).toBeGreaterThanOrEqual(0)
    expect(impact.recovery_rate).toBeLessThanOrEqual(1)
    expect(impact.illustrative).toBe(true)
    // Seed history: rop_8101 ($11,200) + rop_8102 ($4,800) + rop_8103 ($6,400).
    expect(impact.recovered_value).toBeCloseTo(22400, 2)
  })
})

describe("recovery audit", () => {
  it("builds a sales-ready document with disclaimer and top actions", async () => {
    const doc = await worker.buildAudit(A(), 90)
    expect(doc.company.name.length).toBeGreaterThan(0)
    expect(doc.period_days).toBe(90)
    expect(doc.enquiries).toBe(25)
    expect(doc.open_quotes).toBe(3)
    expect(doc.overdue_quotes).toBe(2)
    expect(doc.opportunity.total).toBeGreaterThan(0)
    expect(doc.top_actions.length).toBeGreaterThan(0)
    expect(doc.top_actions.length).toBeLessThanOrEqual(5)
    expect(doc.disclaimer).toContain("NOT guaranteed revenue")
    expect(doc.score.score).toBeGreaterThan(0)
  })
})

describe("stage transitions & recovered-revenue rules", () => {
  it("rejects skipping stages", async () => {
    await expect(worker.advanceOpportunity(A(), "rop_8001", { stage: "booked" })).rejects.toThrow(/Invalid transition/)
  })
  it("refuses to count recovery without an explicit outcome", async () => {
    await worker.advanceOpportunity(A(), "rop_8001", { stage: "contacted" })
    await expect(worker.advanceOpportunity(A(), "rop_8001", { stage: "responded" })).resolves.toBeTruthy()
    await expect(worker.advanceOpportunity(A(), "rop_8001", { stage: "qualified" })).resolves.toBeTruthy()
    await expect(worker.advanceOpportunity(A(), "rop_8001", { stage: "booked" })).resolves.toBeTruthy()
    await expect(worker.advanceOpportunity(A(), "rop_8001", { stage: "recovered" })).rejects.toThrow(/explicit outcome/)
    const impactBefore = await worker.buildImpact(A())
    // Now with an explicit outcome it counts as real recovered revenue.
    const res = await worker.advanceOpportunity(A(), "rop_8001", { stage: "recovered", outcome: "quote_accepted" })
    expect(res.counted_as_recovered).toBe(true)
    expect(res.opportunity.recovered_value).toBeCloseTo(7200, 2)
    const impactAfter = await worker.buildImpact(A())
    expect(impactAfter.recovered_value).toBeCloseTo(impactBefore.recovered_value + 7200, 2)
    // Linked estimate moved to booked.
    const est = await A().prepare(`SELECT quote_status FROM estimates WHERE id = 'est_1002'`).first<{ quote_status: string }>()
    expect(est?.quote_status).toBe("booked")
  })
  it("propagates booked/recovered to linked lead records", async () => {
    const res = await worker.advanceOpportunity(A(), "rop_8005", { stage: "contacted" })
    expect(res.stage_after).toBe("contacted")
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "responded" })
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "qualified" })
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "booked" })
    const lead = await A().prepare(`SELECT status FROM leads WHERE id = 'ldg_e1'`).first<{ status: string }>()
    expect(lead?.status).toBe("appointment_booked")
    await worker.advanceOpportunity(A(), "rop_8005", { stage: "recovered", outcome: "appointment_booked" })
    const leadWon = await A().prepare(`SELECT status, recovered_via FROM leads WHERE id = 'ldg_e1'`).first<{ status: string; recovered_via: string | null }>()
    expect(leadWon?.status).toBe("won")
    expect(leadWon?.recovered_via).toBe("appointment_booked")
  })
})

describe("demo reset — full reversibility", () => {
  it("restores pristine seeded state after pipeline mutations", async () => {
    await worker.resetDemo(A())
    const rows = await A()
      .prepare(`SELECT COUNT(*) AS n FROM recovery_opportunities WHERE company_id = 'cmp_1000'`)
      .first<{ n: number }>()
    expect(rows?.n).toBe(25) // 21 open + 3 historical recovered + 1 lost (0006 fixed point, rop_8014 deduped)
    const impact = await worker.buildImpact(A())
    expect(impact.recovered_value).toBeCloseTo(22400, 2)
    // Cold start check on a wiped DB: after reset the score is back to seeded leaky levels, not 0.
    const score = await worker.computeRecoveryScore(A())
    expect(score.score).toBeGreaterThan(0)
    expect(score.score).toBeLessThanOrEqual(100)
  })
})
