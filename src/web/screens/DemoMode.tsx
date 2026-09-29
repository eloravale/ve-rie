import React, { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd } from "../format"
import { Loading, ErrorState, Section, SimulatedTag } from "../ui"

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
  title: string
  why: string
  action: string
  run: () => Promise<string>
  goTo?: string
  status: "pending" | "done" | "skipped"
  result?: string
  busy?: boolean
}

export default function DemoMode() {
  const [before, setBefore] = useState<DashboardData | null>(null)
  const [after, setAfter] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [steps, setSteps] = useState<StepState[]>([])

  const loadDash = useCallback(async (): Promise<DashboardData> => {
    const d = await api.get<DashboardData>("/api/dashboard")
    setAfter(d)
    return d
  }, [])

  // Build steps fresh each time (they read live data when run)
  const buildSteps = useCallback((): StepState[] => {
    return [
      {
        id: "missed_call",
        title: "Recover a missed call",
        why: "The #1 leak in HVAC: a homeowner calls a competitor because nobody called back. VÉRIA turns the missed call into a tracked lead with an owner call-back task.",
        action: "Start recovery on the oldest unrecovered missed call",
        goTo: "/missed-calls",
        status: "pending",
        run: async () => {
          const calls = await api.get<Array<{ id: string; caller_name: string | null; recovered: number; estimated_value: number }>>("/api/missed-calls")
          const target = (Array.isArray(calls) ? calls : []).find((m) => !m.recovered)
          if (!target) return "No unrecovered missed calls — reset the demo to replay this step."
          const res = await api.post<{ lead: { name: string }; task_id: string }>(`/api/missed-calls/${target.id}/recover`)
          return `Lead + owner call-back task created for ${res.lead.name} — ${usd(target.estimated_value)} back in play.`
        }
      },
      {
        id: "estimate_followup",
        title: "Follow up an idle estimate",
        why: "Most estimates close on follow-up #2 or #3 — but without a system they simply expire. One click shows the follow-up becoming recovered revenue.",
        action: "Complete the oldest estimate follow-up as recovered",
        goTo: "/followups",
        status: "pending",
        run: async () => {
          const fus = await api.get<Array<{ id: string; kind: string; status: string; estimated_value: number | null; lead_name: string | null }>>("/api/followups?status=all")
          const target = (Array.isArray(fus) ? fus : []).find((f) => f.status === "pending" && f.kind === "estimate")
          if (!target) return "No pending estimate follow-ups — reset the demo to replay this step."
          await api.post(`/api/followups/${target.id}/complete`, { outcome: "recovered" })
          return `${target.lead_name}'s ${usd(target.estimated_value ?? 0)} estimate marked recovered — revenue counter updated.`
        }
      },
      {
        id: "reactivation",
        title: "Reactivate a dormant lead",
        why: "Leads that went quiet 30+ days ago are invisible in a paper workflow. VÉRIA surfaces them with a recommended re-entry offer.",
        action: "Queue outreach for the highest-value dormant lead",
        goTo: "/reactivation",
        status: "pending",
        run: async () => {
          const reas = await api.get<Array<{ id: string; status: string; lead_name: string; estimated_value: number }>>("/api/reactivations")
          const target = (Array.isArray(reas) ? reas : []).find((r) => r.status === "identified")
          if (!target) return "No dormant leads in the queue — reset the demo to replay this step."
          await api.post(`/api/reactivations/${target.id}/run`)
          return `Outreach queued for ${target.lead_name} — ${usd(target.estimated_value)} dormant opportunity back in motion.`
        }
      },
      {
        id: "owner_task",
        title: "Complete an owner handoff",
        why: "VÉRIA never pretends to be autonomous: high-stakes moments become owner tasks with value, priority, and a recommended action.",
        action: "Complete the highest-priority owner task",
        goTo: "/tasks",
        status: "pending",
        run: async () => {
          const tasks = await api.get<Array<{ id: string; status: string; title: string; priority: string; estimated_value: number }>>("/api/tasks?status=all")
          const open = (Array.isArray(tasks) ? tasks : []).filter((t) => t.status === "open")
          if (open.length === 0) return "No open owner tasks — reset the demo to replay this step."
          const target = open.find((t) => t.priority === "high") ?? open[0]
          await api.patch(`/api/tasks/${target.id}`, { status: "completed" })
          return `Task completed: "${target.title}" (${usd(target.estimated_value)} handled by the owner).`
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
  }, [buildSteps])

  const runStep = async (id: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, busy: true } : s)))
    const step = steps.find((s) => s.id === id)
    try {
      const result = await step!.run()
      await loadDash()
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
          <h1 className="text-xl font-bold text-mist-50 sm:text-2xl">Demo Mode</h1>
          <p className="mt-1 max-w-2xl text-sm text-mist-400">
            A guided, five-minute sales walkthrough. Run each step and watch the revenue numbers move. Reset any time for a fresh demo.
          </p>
        </div>
        <button className="btn-secondary" onClick={resetDemo} disabled={resetting}>
          {resetting ? "Resetting…" : "↺ Reset demo data"}
        </button>
      </div>

      {/* Live impact strip */}
      <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
        <div>
          <div className="label">Recovered today</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-300" data-testid="demo-recovered">{usd(after.revenue_recovered)}</div>
          {recoveredDelta > 0 ? <div className="text-[11px] font-semibold text-emerald-300">+{usd(recoveredDelta)} during demo</div> : <div className="text-[11px] text-mist-400">baseline</div>}
        </div>
        <div>
          <div className="label">At risk</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-red-300">{usd(after.revenue_at_risk)}</div>
        </div>
        <div>
          <div className="label">Open missed calls</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-mist-50">{after.missed_calls_open}</div>
        </div>
        <div>
          <div className="label">Estimates awaiting follow-up</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-mist-50">{after.estimates_awaiting_followup}</div>
        </div>
      </div>

      <Section title="Guided walkthrough" subtitle="Run the steps in order — each one demonstrates a recovery concept">
        <ol className="divide-y divide-ink-800">
          {steps.map((s, i) => (
            <li key={s.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      s.status === "done" ? "bg-emerald-950/60 text-emerald-300" : "bg-brass-500/15 text-brass-300"
                    }`}
                  >
                    {s.status === "done" ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-mist-50">{s.title}</div>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-mist-400">{s.why}</p>
                    {s.result ? (
                      <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${s.result.startsWith("⚠") ? "border-red-900/60 bg-red-950/30 text-red-300" : "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"}`}>
                        {s.result}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.status === "pending" ? (
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
              The four places HVAC revenue leaks — missed calls, unanswered leads, idle estimates, dormant relationships —
              and the workflow that recovers each one, with the owner always in control of personal outreach.
            </p>
          </div>
          <SimulatedTag>Simulated data</SimulatedTag>
        </div>
      </div>
    </div>
  )
}
