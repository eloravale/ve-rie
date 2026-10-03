import React, { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd } from "../format"
import { Loading, ErrorState, Section, SimulatedTag } from "../ui"
import { SectionIndex } from "../brand"

interface DashboardData {
  revenue_recovered: number
  revenue_at_risk: number
  leads_needing_action: number
  missed_calls_open: number
  estimates_awaiting_followup: number
  dormant_opportunities: number
  brief: { headline: string }
}

interface StepState {
  id: string
  chapter: string
  title: string
  why: string
  action: string
  run: () => Promise<string>
  goTo?: string
  status?: "pending" | "done"
  result?: string
  busy?: boolean
}

export default function DemoMode() {
  const [before, setBefore] = useState<DashboardData | null>(null)
  const [after, setAfter] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [steps, setSteps] = useState<StepState[]>([])
  const [impact, setImpact] = useState<{ recovered_value: number; identified_value: number } | null>(null)

  const loadDash = useCallback(async (): Promise<DashboardData> => {
    const d = await api.get<DashboardData>("/api/dashboard")
    setAfter(d)
    return d
  }, [])

  const loadImpact = useCallback(async () => {
    try {
      setImpact(await api.get<{ recovered_value: number; identified_value: number }>("/api/impact"))
    } catch {
      setImpact(null)
    }
  }, [])

  const buildSteps = useCallback((): StepState[] => {
    return [
      {
        id: "audit",
        chapter: "1 · LEAK",
        title: "Revenue Recovery Audit — the whole leak in one document",
        why: "The audit answers one question first: where might this company be leaving recoverable opportunities unworked? Data sources, leakage by category, the top five actions — with identified opportunity and recorded recovered revenue kept clearly separate.",
        action: "Compile the audit",
        goTo: "/audit",
        run: async () => {
          const a = await api.get<{
            company: { name: string }
            opportunity: { total: number }
            recovered: { value: number; events: number }
            top_actions: { rank: number; title: string }[]
            missed_unanswered: number
            overdue_quotes: number
          }>("/api/audit?days=90")
          const top = a.top_actions[0]
          return `Audit for ${a.company.name}: ${usd(a.opportunity.total)} identified opportunity across missed calls, stale quotes and dormant customers; ${usd(a.recovered.value)} recovered recorded in the ledger (${a.recovered.events} events). ${
            top ? `Priority #1: ${top.title}.` : ""
          }`
        }
      },
      {
        id: "leak",
        chapter: "1 · LEAK",
        title: "See where revenue is leaking",
        why: "Start on the Leakage Radar: missed enquiries, unfollowed quotes, dormant customers — each with value attached. This is the money already inside your records, quietly going cold.",
        action: "Scan for leaks",
        goTo: "/found",
        run: async () => {
          await api.post("/api/opportunities/sync")
          const leak = await api.get<{ total: number; total_count: number; categories: { label: string; count: number; value: number }[] }>("/api/leakage")
          const top = leak.categories.slice(0, 2).map((c) => `${c.label} (${c.count} · ${usd(c.value)})`).join(", ")
          return `Scan complete: ${leak.total_count} open opportunities worth ${usd(leak.total)} identified. Biggest leaks: ${top}.`
        }
      },
      {
        id: "identify",
        chapter: "2 · IDENTIFY & PRIORITIZE",
        title: "Every leak becomes a prioritized opportunity",
        why: "Each opportunity carries its value, age, WHY it matters, and a recommended next action — ranked so the team works the money first.",
        action: "Show the pipeline",
        goTo: "/opportunities",
        run: async () => {
          const d = await api.get<{ items: Array<{ estimated_value: number; priority: string; stage: string }> }>("/api/opportunities")
          const open = (d.items ?? []).filter((o) => !["recovered", "lost"].includes(o.stage))
          const high = open.filter((o) => o.priority === "high")
          return `${open.length} open opportunities, ${high.length} high-priority. Top of the queue: ${usd(Math.max(0, ...open.map((o) => o.estimated_value)))}.`
        }
      },
      {
        id: "quote",
        chapter: "3 · RECOVER",
        title: "Quote recovery — follow the money",
        why: "The most valuable leak in HVAC: a quote you paid to produce, going silent. Watch a follow-up move it through the pipeline.",
        action: "Advance the top quote opportunity",
        goTo: "/opportunities",
        run: async () => {
          const d = await api.get<{ items: Array<{ id: string; source_type: string; stage: string; customer_name: string; estimated_value: number; recommended_action: string }> }>("/api/opportunities")
          const open = (d.items ?? []).filter((o) => !["recovered", "lost"].includes(o.stage))
          const use = open.find((o) => o.source_type === "quote") ?? open[0]
          if (!use) return "No open opportunities — reset the demo to replay this step."
          const res = await api.patch<{ opportunity: { customer_name: string; stage: string }; counted_as_recovered: boolean }>(
            `/api/opportunities/${use.id}`,
            { stage: nextStage(use.stage) }
          )
          return `${res.opportunity.customer_name} moved to ${res.opportunity.stage.replace(/_/g, " ")} — ${usd(use.estimated_value)} still in play. Next: ${use.recommended_action}`
        }
      },
      {
        id: "missed",
        chapter: "3 · RECOVER",
        title: "Missed enquiry recovery — call the job back",
        why: "The phone rang during another job. Recovering a missed call creates the lead, the owner callback task and an audit trail — the fastest money in HVAC.",
        action: "Recover a missed call",
        goTo: "/missed-calls",
        run: async () => {
          const list = await api.get<
            Array<{ id: string; caller_name: string | null; caller_phone: string; estimated_value: number; recovered: number }>
          >("/api/missed-calls")
          const target = (list ?? []).find((m) => !m.recovered)
          if (!target) return "No open missed calls — reset the demo to replay this step."
          await api.post(`/api/missed-calls/${target.id}/recover`)
          return `${target.caller_name ?? target.caller_phone}: callback task created for ${usd(target.estimated_value)} of potential work — nothing sent automatically.`
        }
      },
      {
        id: "dormant",
        chapter: "3 · RECOVER",
        title: "Dormant customer reactivation — the base you already paid for",
        why: "Past customers idle 30+ days become a prioritized reactivation with a value and an owner task. The owner decides who gets the call.",
        action: "Queue a reactivation",
        goTo: "/reactivation",
        run: async () => {
          const list = await api.get<Array<{ id: string; lead_name: string; status: string; estimated_value: number }>>("/api/reactivations")
          const target = (list ?? []).find((r) => r.status === "identified")
          if (!target) return "No identified reactivations — reset the demo to replay this step."
          await api.post(`/api/reactivations/${target.id}/run`)
          return `Reactivation queued for ${target.lead_name} (${usd(target.estimated_value)} estimated value) — owner outreach task created, nothing sent automatically.`
        }
      },
      {
        id: "handoff",
        chapter: "4 · RECOVER",
        title: "Human handoff — the owner stays in control",
        why: "Sensitive, high-value moments become an owner task with value, priority and a recommended action. VÉRIA never sends customer communication autonomously.",
        action: "Complete an owner handoff",
        goTo: "/tasks",
        run: async () => {
          const tasks = await api.get<Array<{ id: string; status: string; title: string; priority: string; estimated_value: number }>>("/api/tasks?status=all")
          const open = (Array.isArray(tasks) ? tasks : []).filter((t) => t.status === "open")
          if (open.length === 0) return "No open owner tasks — reset the demo to replay this step."
          const target = open.find((t) => t.priority === "high") ?? open[0]
          await api.patch(`/api/tasks/${target.id}`, { status: "completed" })
          return `Handoff completed: "${target.title}" (${usd(target.estimated_value)} handled personally by the owner).`
        }
      },
      {
        id: "measure",
        chapter: "5 · MEASURE",
        title: "Only real outcomes count as recovered",
        why: "In the live product, recovered revenue is recorded only when a real outcome happens — appointment booked, quote accepted, customer reactivated. Here, see the honest ledger the pilot reports against.",
        action: "Open the measured results",
        goTo: "/impact",
        run: async () => {
          const imp = await api.get<{ recovered_value: number; identified_value: number; recovery_rate: number }>("/api/impact")
          void imp
          return "Opening VÉRIA Impact — identified vs actioned vs recovered, measured only from recorded outcomes."
        }
      }
    ]
  }, [])

  useEffect(() => {
    api
      .get<DashboardData>("/api/dashboard")
      .then((d) => {
        setBefore(d)
        setAfter(d)
      })
      .catch((e) => setError(e.message))
    setSteps(buildSteps())
    loadImpact()
  }, [buildSteps, loadImpact])

  const runStep = async (id: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, busy: true } : s)))
    const step = steps.find((s) => s.id === id)
    try {
      const result = await step!.run()
      await loadDash()
      await loadImpact()
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, busy: false, status: "done", result } : s)))
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Step failed"
      await loadDash()
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, busy: false, status: "done", result: `⚠ ${msg}` } : s)))
    }
  }

  const resetDemo = async () => {
    setResetting(true)
    try {
      await api.post("/api/demo/reset")
      const d = await api.get<DashboardData>("/api/dashboard")
      setBefore(d)
      setAfter(d)
      setSteps(buildSteps())
      loadImpact()
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Reset failed")
    } finally {
      setResetting(false)
    }
  }

  if (error && !before) return <ErrorState message={error} />
  if (!before || !after) return <Loading label="Preparing demo environment" />

  const recoveredDelta = after.revenue_recovered - before.revenue_recovered

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionIndex index="—">The recovery story</SectionIndex>
          <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">Demo Mode.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
            LEAK → IDENTIFY → PRIORITIZE → RECOVER → MEASURE. Run the eight steps in order for the 5–10 minute walkthrough:
            audit, leakage, priorities, quote recovery, missed enquiry, reactivation, handoff, measured impact.
            Reset any time for a fresh demo. <span className="font-semibold text-brass-300">Illustrative demo data.</span>
          </p>
        </div>
        <button className="btn-secondary" onClick={resetDemo} disabled={resetting}>
          {resetting ? "Resetting…" : "↺ Reset demo data"}
        </button>
      </div>

      {/* Live impact strip */}
      <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
        <div>
          <div className="label">Before · Recovered (recorded outcomes)</div>
          <div className="metric-display mt-1 text-2xl leading-none text-emerald-300" data-testid="demo-recovered">
            {usd(impact?.recovered_value ?? after.revenue_recovered)}
          </div>
          {recoveredDelta > 0 ? (
            <div className="text-[11px] font-semibold text-emerald-300" data-testid="demo-change">
              After: {usd((impact?.recovered_value ?? after.revenue_recovered))} · Change: +{usd(recoveredDelta)} — illustrative demo outcome
            </div>
          ) : (
            <div className="text-[11px] text-mist-400">Baseline — run the steps to see the change</div>
          )}
        </div>
        <div>
          <div className="label">Identified opportunity</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-brass-300">{usd(impact?.identified_value ?? 0)}</div>
          <div className="text-[10px] text-mist-400">not guaranteed revenue</div>
        </div>
        <div>
          <div className="label">At risk</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-red-300">{usd(after.revenue_at_risk)}</div>
        </div>
        <div>
          <div className="label">Open missed calls</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-mist-50">{after.missed_calls_open}</div>
        </div>
      </div>

      <Section title="Guided walkthrough" subtitle="Each step demonstrates one chapter of the recovery story">
        <ol className="divide-y divide-ink-800">
          {steps.map((s, i) => (
            <li key={s.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`font-display mt-0.5 w-8 shrink-0 text-2xl italic leading-none ${
                      s.status === "done" ? "text-emerald-300" : "text-brass-400"
                    }`}
                  >
                    {s.status === "done" ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black tracking-widest text-brass-400">{s.chapter}</span>
                      <span className="text-sm font-semibold text-mist-50">{s.title}</span>
                    </div>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-mist-400">{s.why}</p>
                    {s.result ? (
                      <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${s.result.startsWith("⚠") ? "border-red-900/60 bg-red-950/30 text-red-300" : "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"}`}>
                        {s.result}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.status !== "done" ? (
                    <button className="btn-primary px-3 py-1.5 text-xs" disabled={s.busy} onClick={() => runStep(s.id)}>
                      {s.busy ? "Running…" : s.action}
                    </button>
                  ) : s.goTo ? (
                    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => nav(s.goTo!)}>
                      See it →
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-mist-100">What this demo shows</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-mist-400">
              The places HVAC revenue leaks — missed enquiries, slow responses, idle quotes, dormant customers, stalled handoffs —
              and the workflow that recovers each one, with the owner always in control and only real outcomes counted as revenue.
            </p>
          </div>
          <SimulatedTag>Illustrative demo data</SimulatedTag>
        </div>
      </div>
    </div>
  )
}

function nextStage(stage: string): string {
  const order = ["identified", "contacted", "responded", "qualified", "booked"]
  const idx = order.indexOf(stage)
  return idx === -1 || idx === order.length - 1 ? stage : order[idx + 1]
}
