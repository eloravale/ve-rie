import React, { useEffect, useState } from "react"
import { api } from "../api"
import { nav } from "../App"
import { usd, usdCompact, relTime } from "../format"
import { Section, StatCard, Loading, ErrorState, EmptyState } from "../ui"

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
interface DashboardData {
  company: { name: string; city: string; state: string }
  revenue_recovered: number
  revenue_recovered_count: number
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
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorState message={`Dashboard failed to load: ${error}`} />
  if (!data) return <Loading label="Loading recovery dashboard" />

  const { brief } = data

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-mist-50 sm:text-2xl">Revenue Recovery Dashboard</h1>
          <p className="mt-1 text-sm text-mist-400">
            {data.company.name} · {data.company.city}, {data.company.state} · Demo environment
          </p>
        </div>
        <div className="text-xs text-mist-400">{brief.date}</div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Revenue recovered"
          value={usd(data.revenue_recovered)}
          sub={`${data.revenue_recovered_count} jobs won`}
          tone="good"
          testId="metric-recovered"
        />
        <StatCard
          label="Revenue at risk"
          value={usd(data.revenue_at_risk)}
          sub={`${data.revenue_at_risk_count} opportunities cooling off`}
          tone="risk"
          testId="metric-at-risk"
        />
        <StatCard
          label="Leads needing action"
          value={String(data.leads_needing_action)}
          sub="Overdue follow-ups & stale leads"
          tone="brass"
          testId="metric-needing-action"
        />
        <StatCard
          label="Pipeline value"
          value={usd(data.pipeline_value)}
          sub="Active opportunities"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Missed calls open"
          value={String(data.missed_calls_open)}
          sub={`${usdCompact(data.missed_calls_recovered_value)} already recovered this quarter`}
          testId="metric-missed-calls"
        />
        <StatCard
          label="Estimates awaiting follow-up"
          value={String(data.estimates_awaiting_followup)}
          sub={`${usd(data.estimates_awaiting_value)} sitting idle`}
        />
        <StatCard
          label="Dormant opportunities"
          value={String(data.dormant_opportunities)}
          sub={`${usd(data.dormant_value)} reactivation value`}
        />
        <StatCard
          label="Qualified leads"
          value={String(data.qualified_leads)}
          sub={`${data.appointments_upcoming} appointments scheduled`}
        />
      </div>

      {/* Owner Daily Brief */}
      <Section
        title="Owner Daily Brief"
        subtitle="What deserves attention today — ranked by revenue at stake"
        actions={<span className="chip border-brass-600/50 bg-brass-950/30 text-brass-300">Today · {brief.date.split(",")[0]}</span>}
      >
        <div className="px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-mist-100">
            <span className="text-brass-400">▸</span> {brief.headline}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {brief.items.map((it) => (
              <div key={it.label} className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-850 px-3 py-2.5">
                <span className="text-xs text-mist-300">{it.label}</span>
                <span className="text-sm font-bold tabular-nums text-mist-50">{it.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="label">Recommended actions</div>
            <ol className="mt-2 space-y-2">
              {brief.actions.map((a) => (
                <li key={a.rank} className="flex items-start justify-between gap-3 rounded-lg border border-ink-800 bg-ink-850/60 px-3 py-2.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brass-500/15 text-xs font-bold text-brass-300">
                      {a.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-mist-100">{a.title}</div>
                      <div className="mt-0.5 text-[11px] text-mist-400">{a.why}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-brass-300">{usd(a.value)}</span>
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
                  <span className="text-sm font-bold tabular-nums text-red-300">{usd(r.estimated_value)}</span>
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
                  <span className="text-xs font-semibold uppercase tracking-wide text-brass-400/80">{a.actor}</span>
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
