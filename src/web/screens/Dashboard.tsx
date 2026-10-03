import React, { useEffect, useState } from "react"
import { api } from "../api"
import { nav } from "../App"
import { usd, usdCompact, relTime } from "../format"
import { Section, Loading, ErrorState, EmptyState } from "../ui"
import { ScoreInstrument } from "../brand"
import { useSettings } from "../use-settings"

interface BriefAction {
  rank: number
  title: string
  lead_id: string | null
  value: number
  why: string
}
interface Brief {
  date: string
  company_name: string
  headline: string
  items: { label: string; value: string }[]
  at_risk_total: number
  actions: BriefAction[]
}
interface RadarItem {
  id: string
  kind: string
  issue: string
  lead_id: string | null
  lead_name: string
  detail: string
  estimated_value: number
  urgency: string
  recommended_action: string
  score: number
}
interface ActivityItem {
  id: string
  actor: string
  action: string
  detail: string | null
  created_at: string
}
interface ScoreLine {
  label: string
  delta: number
  detail: string
}
interface RecoveryScoreData {
  score: number
  band: string
  lines: ScoreLine[]
}
interface ResponseHealthData {
  total: number
  responded: number
  no_response: number
  median_minutes: number | null
  buckets: { key: string; label: string; count: number }[]
}
interface WatchItem {
  key: string
  label: string
  current: number
  previous: number
  delta: number
  pct_change: number | null
  direction: "up" | "down" | "flat"
  good_direction: "up" | "down" | "none"
  note: string
}
interface RevenueWatchData {
  period_days: number
  items: WatchItem[]
  new_opportunities: number
  recovered_this_period: { count: number; value: number }
  comparability_note: string
}
interface DashboardData {
  company: { name: string; city: string; state: string }
  revenue_recovered: number
  revenue_recovered_count: number
  revenue_recovered_basis?: { opportunity: number; recorded: number; assumed: number; analytical: number }
  revenue_at_risk: number
  revenue_at_risk_count: number
  qualified_leads: number
  leads_needing_action: number
  missed_calls_open: number
  missed_calls_recovered_value: number
  estimates_awaiting_followup: number
  estimates_awaiting_value: number
  dormant_opportunities: number
  dormant_value: number
  appointments_upcoming: number
  pipeline_value: number
  brief: Brief
  radar: RadarItem[]
  recent_activity: ActivityItem[]
}

const KIND_ICON: Record<string, string> = {
  missed_call: "☏",
  unanswered_lead: "✉",
  estimate_idle: "◌",
  dormant_lead: "⟳",
  appointment_gap: "▦",
  high_value_action: "▲"
}

export default function Dashboard() {
  const { workspace_kind: workspaceKind } = useSettings()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<RecoveryScoreData | null>(null)
  const [health, setHealth] = useState<ResponseHealthData | null>(null)
  const [watch, setWatch] = useState<RevenueWatchData | null>(null)

  useEffect(() => {
    api
      .get<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message))
    api
      .get<RecoveryScoreData>("/api/recovery-score")
      .then(setScore)
      .catch(() => setScore(null))
    api
      .get<ResponseHealthData>("/api/response-health?days=90")
      .then(setHealth)
      .catch(() => setHealth(null))
    api
      .get<RevenueWatchData>("/api/revenue-watch?days=7")
      .then(setWatch)
      .catch(() => setWatch(null))
  }, [])

  if (error) return <ErrorState message={`Dashboard failed to load: ${error}`} />
  if (!data) return <Loading label="Preparing your recovery board" />

  const { brief } = data

  const secondary = [
    { label: "Missed calls open", value: String(data.missed_calls_open), sub: `${usdCompact(data.missed_calls_recovered_value)} recovered this quarter`, testId: "metric-missed-calls" },
    { label: "Estimates awaiting follow-up", value: String(data.estimates_awaiting_followup), sub: `${usd(data.estimates_awaiting_value)} sitting idle` },
    { label: "Dormant opportunities", value: String(data.dormant_opportunities), sub: `${usd(data.dormant_value)} reactivation value` },
    { label: "Qualified leads", value: String(data.qualified_leads), sub: `${data.appointments_upcoming} appointments scheduled` }
  ]

  return (
    <div className="space-y-5">
      {/* Masthead — brand, workspace, unmistakable demo labeling */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl font-semibold tracking-[0.28em] text-mist-50">VÉRIA</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-brass-400">Revenue Intelligence</span>
          </div>
          <h1 className="font-display mt-3 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">
            {data.company.name}
          </h1>
          <p className="mt-1 text-sm text-mist-400">
            {data.company.city}, {data.company.state} · {brief.date}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span
            className={`chip ${
              workspaceKind === "prospect"
                ? "border-brass-600/50 bg-brass-950/70 text-brass-300"
                : "border-plum-300/40 bg-plum-950/60 text-plum-300"
            }`}
          >
            {workspaceKind === "prospect" ? "Imported prospect data" : "Demo environment — all values illustrative"}
          </span>
          <button className="btn-primary px-4 py-2 text-xs" onClick={() => nav("/audit")}>
            ▶ Run Revenue Recovery Audit
          </button>
          <span className="text-[10px] uppercase tracking-[0.14em] text-mist-500">Figures update from your records</span>
        </div>
      </div>

      {/* Financial statement — the two numbers that matter most */}
      <div className="card grid grid-cols-1 gap-px overflow-hidden bg-ink-800 sm:grid-cols-2">
        <div className="relative bg-ink-900 p-6 sm:p-8">
          <div className="label">Actual recovered revenue</div>
          <div className="metric-serif mt-3 text-4xl leading-none text-emerald-300 sm:text-5xl" data-testid="metric-recovered">
            {usd(data.revenue_recovered)}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-mist-400">
            <span>{data.revenue_recovered_count} jobs</span>
            <span className="chip border-ink-700 bg-ink-850 text-mist-400">
              ledger · {usd(data.revenue_recovered_basis?.recorded ?? 0)} recorded · {usd(data.revenue_recovered_basis?.assumed ?? 0)} assumed
            </span>
          </div>
          <span className="absolute left-0 top-0 h-8 w-0.5 bg-emerald-300/70" aria-hidden="true" />
        </div>
        <div className="relative bg-ink-900 p-6 sm:p-8">
          <div className="label">Open recovery opportunity</div>
          <div className="metric-serif mt-3 text-4xl leading-none text-red-300 sm:text-5xl" data-testid="metric-at-risk">
            {usd(data.revenue_at_risk)}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-mist-400">
            <span>{data.revenue_at_risk_count} opportunities requiring attention</span>
            <span className="chip border-ink-700 bg-ink-850 text-mist-400">opportunity value — not lost revenue</span>
          </div>
          <span className="absolute left-0 top-0 h-8 w-0.5 bg-red-300/70" aria-hidden="true" />
        </div>
      </div>

      {/* Methodology disclosure for the two headline numbers */}
      <details className="group border border-ink-800 bg-ink-900 px-4 py-2.5 text-[11px] text-mist-400">
        <summary className="cursor-pointer list-none font-semibold uppercase tracking-[0.14em] text-mist-400 transition hover:text-mist-200">
          How VÉRIA calculates this
        </summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-mist-200">Actual recovered revenue</strong> counts only recorded business outcomes — a booked job,
            accepted quote, reactivated customer, or revenue you record. Messages sent, tasks created, and pipeline progress never
            count as recovery.
          </p>
          <p>
            <strong className="text-mist-200">Open recovery opportunity</strong> sums the recorded value of opportunities still open in the
            pipeline. It is an identified opportunity from your records — not lost revenue, and not a forecast of what will be
            recovered.
          </p>
        </div>
      </details>

      {/* Secondary instruments — quiet hairline grid */}
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-ink-800 bg-ink-800 lg:grid-cols-4">
        {secondary.map((s) => (
          <div key={s.label} className="bg-ink-900 p-4 sm:p-5">
            <div className="label">{s.label}</div>
            <div className="metric-display mt-2 text-2xl leading-none text-mist-50" data-testid={s.testId}>
              {s.value}
            </div>
            <div className="mt-1.5 text-[11px] leading-snug text-mist-400">{s.sub}</div>
          </div>
        ))}
        <div className="hidden bg-ink-900 p-4 sm:p-5 lg:block">
          <div className="label">Leads needing action</div>
          <div className="metric-display mt-2 text-2xl leading-none text-brass-400" data-testid="metric-needing-action">
            {data.leads_needing_action}
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-mist-400">Overdue follow-ups & stale leads</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-ink-800 bg-ink-800 lg:hidden">
        <div className="bg-ink-900 p-4">
          <div className="label">Leads needing action</div>
          <div className="metric-display mt-2 text-2xl leading-none text-brass-400" data-testid="metric-needing-action">
            {data.leads_needing_action}
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-mist-400">Overdue follow-ups & stale leads</div>
        </div>
        <div className="bg-ink-900 p-4">
          <div className="label">Pipeline value</div>
          <div className="metric-display mt-2 text-2xl leading-none text-mist-50">{usd(data.pipeline_value)}</div>
          <div className="mt-1.5 text-[11px] leading-snug text-mist-400">Active opportunities</div>
        </div>
      </div>

      {/* Revenue Watch — this week vs last week */}
      {watch ? (
        <Section
          title="Revenue Watch"
          subtitle={`Last ${watch.period_days} days vs the preceding ${watch.period_days} days`}
          actions={<span className="chip border-ink-700 bg-ink-850 text-mist-400">{watch.new_opportunities} new opportunities surfaced</span>}
        >
          <div className="grid grid-cols-2 gap-px bg-ink-800 lg:grid-cols-4">
            {watch.items.map((it) => {
              const good = it.direction === "flat" || it.good_direction === "none" || it.direction === it.good_direction
              return (
                <div key={it.key} className="bg-ink-900 px-4 py-3.5" title={it.note}>
                  <div className="label">{it.label}</div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="metric-display text-xl leading-none text-mist-50">{it.current}</span>
                    <span className="text-[10px] tabular-nums text-mist-500">vs {it.previous}</span>
                  </div>
                  <div
                    className={`mt-1 text-[10px] font-semibold tabular-nums ${
                      it.direction === "flat" ? "text-mist-400" : good ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {it.direction === "up" ? "↑" : it.direction === "down" ? "↓" : "→"}
                    {it.direction !== "flat" && it.pct_change !== null ? ` ${Math.abs(Math.round(it.pct_change * 100))}%` : ""}
                    {it.direction !== "flat" ? ` ${good ? "improved" : "worsened"}` : " unchanged"}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="border-t border-ink-800 px-4 py-2.5 text-[10px] leading-relaxed text-mist-500">{watch.comparability_note}</p>
        </Section>
      ) : null}

      {/* Score instrument + response leakage */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="card p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-2">
            <div className="label">Revenue Recovery Score</div>
            <button className="text-[11px] uppercase tracking-[0.14em] text-mist-400 hover:text-brass-300" onClick={() => nav("/audit")}>
              Full audit →
            </button>
          </div>
          {score ? (
            <div className="mt-4">
              <ScoreInstrument
                score={score.score}
                caption={`Band: ${score.band} — deterministic, explainable, from your own data.`}
                breakdown={score.lines.map((l) => ({ label: l.label, delta: l.delta }))}
              />
              <ul className="mt-3 space-y-1 border-t border-ink-800 pt-3 text-[11px] leading-relaxed text-mist-400">
                {score.lines.slice(0, 3).map((l, i) => (
                  <li key={i}>
                    <span className="text-mist-300">{l.label}:</span> {l.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="py-6 text-xs text-mist-400">Score unavailable.</div>
          )}
        </div>

        <div className="card p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-2">
            <div className="label">Lead response leakage</div>
            <button className="text-[11px] uppercase tracking-[0.14em] text-mist-400 hover:text-brass-300" onClick={() => nav("/found")}>
              What VÉRIA found →
            </button>
          </div>
          {health && health.total > 0 ? (
            <div className="mt-4">
              <div className="grid grid-cols-5">
                {health.buckets.map((b, i) => (
                  <div key={b.key} className={`px-1 pb-3 text-center ${i > 0 ? "border-l border-ink-800" : ""}`}>
                    <div className="metric-display text-2xl leading-none text-mist-50 sm:text-3xl">{b.count}</div>
                    <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-mist-400">{b.label}</div>
                  </div>
                ))}
              </div>
              <div className="flex h-1 w-full">
                {health.buckets.map((b) => (
                  <div
                    key={b.key}
                    className={b.key === "no_response" ? "bg-red-300" : b.key === "over120" ? "bg-brass-500/70" : "bg-ink-600"}
                    style={{ width: `${(b.count / health.total) * 100}%` }}
                    title={`${b.label}: ${b.count}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-mist-400">
                {health.total} enquiries in the last 90 days · median first response{" "}
                <span className="font-semibold text-mist-100">{health.median_minutes !== null ? `${Math.round(health.median_minutes)} min` : "—"}</span>
                {health.no_response > 0 ? ` · ${health.no_response} never received a first response` : " · none ignored"}
              </p>
            </div>
          ) : (
            <div className="py-6 text-xs text-mist-400">No enquiry data recorded yet.</div>
          )}
        </div>
      </div>

      {/* Owner Daily Brief */}
      <Section
        title="Owner Daily Brief"
        subtitle="What deserves attention today — ranked by revenue at stake"
        actions={<span className="chip border-brass-600/50 bg-brass-950/70 text-brass-300">Today · {brief.date.split(",")[0]}</span>}
      >
        <div className="px-4 py-4 sm:px-5">
          <p className="font-display text-lg italic text-mist-100">{brief.headline}</p>
          <div className="mt-4 grid gap-px overflow-hidden border border-ink-800 bg-ink-800 sm:grid-cols-2">
            {brief.items.map((it) => (
              <div key={it.label} className="flex items-center justify-between bg-ink-900 px-3 py-2.5">
                <span className="text-xs text-mist-300">{it.label}</span>
                <span className="metric-display text-lg text-mist-50">{it.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <div className="label">Recommended actions</div>
            <ol className="mt-2 divide-y divide-ink-800 border-t border-ink-800">
              {brief.actions.map((a) => (
                <li key={a.rank} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="font-display mt-0.5 shrink-0 text-lg italic leading-none text-brass-400">{a.rank}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-mist-100">{a.title}</div>
                      <div className="mt-0.5 text-[11px] text-mist-400">{a.why}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="metric-display text-lg text-brass-300">{usd(a.value)}</span>
                    {a.lead_id ? (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => nav(`/leads/${a.lead_id}`)}>
                        Open
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* Radar preview */}
      <Section
        title="Lost-Revenue Radar"
        subtitle="Money currently slipping out of the business"
        actions={
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => nav("/radar")}>
            View all
          </button>
        }
      >
        {data.radar.length === 0 ? (
          <EmptyState icon="◎" title="Radar is clear" body="No leaks detected right now. This is what a healthy board looks like." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {data.radar.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 text-base text-brass-400">{KIND_ICON[r.kind] ?? "◎"}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-mist-100">{r.issue}</span>
                      <span className="text-xs text-mist-400">— {r.lead_name}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-mist-400">{r.recommended_action}</div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="metric-display text-lg text-red-300">{usd(r.estimated_value)}</span>
                  {r.lead_id ? (
                    <button className="text-[11px] text-mist-400 underline-offset-2 hover:text-brass-300 hover:underline" onClick={() => nav(`/leads/${r.lead_id}`)}>
                      View lead
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Recent activity */}
      <Section title="Recent activity" subtitle="Audit trail of every change">
        {data.recent_activity.length === 0 ? (
          <EmptyState title="No activity yet" body="Actions you take in VÉRIA appear here." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {data.recent_activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brass-400/80">{a.actor}</span>
                  <span className="ml-2 text-xs text-mist-300">{a.detail ?? a.action}</span>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-mist-400">{relTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
