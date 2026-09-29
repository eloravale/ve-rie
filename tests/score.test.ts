import { describe, it, expect } from "vitest"
import { opportunityScore } from "../src/worker/score"
import type { Lead } from "../src/worker/types"

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "ldg_test",
    company_id: "cmp_1000",
    name: "Test Lead",
    email: null,
    phone: null,
    service: "Furnace repair",
    status: "contacted",
    source: "referral",
    urgency: "normal",
    estimated_value: 5000,
    notes: null,
    next_action: null,
    next_action_at: null,
    last_activity_at: new Date().toISOString(),
    recovered_via: null,
    lost_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }
}

describe("opportunityScore", () => {
  const now = Date.now()

  it("returns 0 for lost/unqualified leads", () => {
    expect(opportunityScore(makeLead({ status: "lost" }), now).score).toBe(0)
    expect(opportunityScore(makeLead({ status: "unqualified" }), now).score).toBe(0)
  })

  it("rewards bigger deals, urgency, and later stages", () => {
    const small = opportunityScore(makeLead({ estimated_value: 800 }), now).score
    const big = opportunityScore(makeLead({ estimated_value: 12000 }), now).score
    expect(big).toBeGreaterThan(small)

    const fresh = opportunityScore(makeLead({ status: "new" }), now).score
    const estimateOut = opportunityScore(makeLead({ status: "estimate_sent" }), now).score
    expect(estimateOut).toBeGreaterThan(fresh)
  })

  it("rewards recency and referrals", () => {
    const stale = opportunityScore(makeLead({ last_activity_at: new Date(now - 40 * 86400000).toISOString() }), now).score
    const recent = opportunityScore(makeLead({ last_activity_at: new Date(now - 86400000).toISOString() }), now).score
    expect(recent).toBeGreaterThan(stale)

    const referred = opportunityScore(makeLead({ source: "referral" }), now).score
    const instagram = opportunityScore(makeLead({ source: "instagram" }), now).score
    expect(referred).toBeGreaterThan(instagram)
  })

  it("is deterministic for identical inputs", () => {
    const a = opportunityScore(makeLead(), now)
    const b = opportunityScore(makeLead(), now)
    expect(a.score).toBe(b.score)
    expect(a.lines.map((l) => l.points)).toEqual(b.lines.map((l) => l.points))
  })

  it("always produces explainable breakdown lines", () => {
    const result = opportunityScore(makeLead({ status: "estimate_sent", urgency: "urgent" }), now)
    expect(result.score).toBeGreaterThan(70)
    expect(result.lines.length).toBeGreaterThanOrEqual(5)
    for (const line of result.lines) {
      expect(line.label.length).toBeGreaterThan(0)
      expect(line.detail.length).toBeGreaterThan(0)
    }
  })

  it("caps score at 100", () => {
    const best = opportunityScore(
      makeLead({ status: "estimate_sent", urgency: "urgent", estimated_value: 15000, source: "referral" }),
      now
    )
    expect(best.score).toBeLessThanOrEqual(100)
  })
})
