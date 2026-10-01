import React, { useCallback, useEffect, useState } from "react"
import { api } from "../api"
import { nav } from "../App"
import { usd, usdCompact } from "../format"
import { Loading, ErrorState, EmptyState, Section } from "../ui"
import { SectionIndex } from "../brand"

interface DataQualitySummary {
  score: number
  band: "high" | "acceptable" | "poor" | "insufficient"
  records_analyzed: number
  summary: string
}

interface Opportunity {
  id: string
  source_type: string
  lead_id: string | null
  customer_name: string
  title: string
  why: string
  recommended_action: string
  estimated_value: number
  stage: string
  priority: "low" | "medium" | "high"
  age_days: number
}

interface Leakage {
  categories: { source_type: string; label: string; count: number; value: number; severity: string; oldest_days: number; recommended_action: string }[]
  total: number
  total_count: number
}

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-red-900/70 bg-red-950/50 text-red-300",
  medium: "border-amber-800/70 bg-amber-950/60 text-amber-300",
  low: "border-ink-600 bg-ink-850 text-mist-400"
}


export default function WhatFound() {
  const [items, setItems] = useState<Opportunity[] | null>(null)
  const [leak, setLeak] = useState<Leakage | null>(null)
  const [dq, setDq] = useState<DataQualitySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([api.get<{ items: Opportunity[] }>("/api/opportunities"), api.get<Leakage>("/api/leakage"), api.get<DataQualitySummary>("/api/data-quality")])
      .then(([o, l, d]) => {
        setItems(o.items)
        setLeak(l)
        setDq(d)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  if (error) return <ErrorState message={`Failed to load findings: ${error}`} />
  if (!items || !leak) return <Loading label="Analyzing your data" />

  const open = items.filter((o) => !["recovered", "lost"].includes(o.stage))
  const high = open.filter((o) => o.priority === "high").length
  const medium = open.filter((o) => o.priority === "medium").length
  const low = open.filter((o) => o.priority === "low").length
  const openValue = open.reduce((s, o) => s + o.estimated_value, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionIndex index="—">Private revenue audit</SectionIndex>
          <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">What VÉRIA found.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
            We found <span className="font-bold text-brass-300">{open.length} open recovery opportunit{open.length === 1 ? "y" : "ies"}</span> in your
            data — each one a job that could still be won.
          </p>
        </div>
        <button className="btn-primary px-4 py-2 text-xs" onClick={() => nav("/opportunities")}>
          Work the pipeline →
        </button>
      </div>

      {/* Priority summary — editorial numbers, hairline grid */}
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-ink-800 bg-ink-800 lg:grid-cols-4">
        <div className="bg-ink-900 p-4 sm:p-5">
          <div className="label">Total identified opportunity</div>
          <div className="metric-display mt-2 text-3xl leading-none text-brass-300 sm:text-4xl">{usd(openValue)}</div>
          <div className="mt-1.5 text-[10px] leading-snug text-mist-400">Identified from your data — not guaranteed revenue</div>
        </div>
        <div className="bg-ink-900 p-4 sm:p-5">
          <div className="label">High priority</div>
          <div className="metric-display mt-2 text-3xl leading-none text-red-300 sm:text-4xl">{high}</div>
          <div className="mt-1.5 text-[11px] text-mist-400">act this week</div>
        </div>
        <div className="bg-ink-900 p-4 sm:p-5">
          <div className="label">Medium</div>
          <div className="metric-display mt-2 text-3xl leading-none text-amber-300 sm:text-4xl">{medium}</div>
          <div className="mt-1.5 text-[11px] text-mist-400">work into the schedule</div>
        </div>
        <div className="bg-ink-900 p-4 sm:p-5">
          <div className="label">Low</div>
          <div className="metric-display mt-2 text-3xl leading-none text-mist-100 sm:text-4xl">{low}</div>
          <div className="mt-1.5 text-[11px] text-mist-400">batch when time allows</div>
        </div>
      </div>

      {/* Analysis quality — how much should the owner trust these findings? */}
      {dq ? (
        <div className="flex flex-wrap items-center gap-3 border border-ink-800 bg-ink-900 px-4 py-3">
          <span className="label">Analysis quality</span>
          <span className="metric-display text-lg text-mist-50">{dq.score}/100</span>
          <span
            className={`chip ${
              dq.band === "high"
                ? "border-emerald-800/50 bg-emerald-950/60 text-emerald-300"
                : dq.band === "acceptable"
                  ? "border-brass-600/50 bg-brass-950/70 text-brass-300"
                  : "border-red-900/50 bg-red-950/60 text-red-300"
            }`}
          >
            {dq.band} confidence
          </span>
          <span className="text-[11px] text-mist-400">{dq.summary}</span>
          <button className="ml-auto text-[11px] uppercase tracking-[0.12em] text-mist-400 hover:text-brass-300" onClick={() => nav("/accuracy")}>
            Full analysis →
          </button>
        </div>
      ) : null}

      {/* Categories with drill-down */}
      <Section
        title="Where it's leaking"
        subtitle="Click a category to inspect the individual opportunities"
        actions={<span className="chip border-ink-600 bg-ink-850 text-mist-400">{leak.total_count} open · {usdCompact(leak.total)} identified</span>}
      >
        {leak.categories.length === 0 ? (
          <EmptyState icon="◎" title="No open leakage detected" body="Run a sync from the Recovery Pipeline to re-scan your data." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {leak.categories.map((c, idx) => {
              const catOpps = open.filter((o) => o.source_type === c.source_type)
              const isOpen = expanded === c.source_type
              return (
                <li key={c.source_type}>
                  <button
                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-ink-850/60 sm:px-5"
                    onClick={() => setExpanded(isOpen ? null : c.source_type)}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span className="font-display w-8 shrink-0 text-2xl italic leading-none text-brass-400/90">{String(idx + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-mist-100">{c.label}</span>
                          <span className={`chip ${SEVERITY_STYLE[c.severity]}`}>{c.severity}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-mist-400">
                          {c.count} opportunit{c.count === 1 ? "y" : "ies"} · oldest {c.oldest_days}d · {c.recommended_action}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="metric-display text-xl text-mist-50">{usd(c.value)}</span>
                      <span className={`text-mist-400 transition ${isOpen ? "rotate-180" : ""}`}>▾</span>
                    </div>
                  </button>
                  {isOpen ? (
                    <ul className="border-t border-ink-800 bg-ink-900/60">
                      {catOpps.map((o) => (
                        <li key={o.id} className="flex items-start justify-between gap-3 px-5 py-2.5 pl-10 sm:px-7 sm:pl-12">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-mist-100">{o.customer_name} — {o.title}</div>
                            <div className="mt-0.5 line-clamp-2 text-[11px] text-mist-400">{o.why}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="metric-display text-base text-brass-300">{usd(o.estimated_value)}</span>
                            {o.lead_id ? (
                              <button className="btn-ghost px-1.5 py-0.5 text-[10px]" onClick={() => nav(`/leads/${o.lead_id}`)}>
                                view
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <p className="border-l border-ink-700 pl-4 font-display text-[13px] italic leading-relaxed text-mist-400">
        These are opportunities identified from your recorded data. They are not guarantees — VÉRIA only counts revenue
        as recovered when a real outcome (booked job, accepted quote, reactivated customer) is recorded.
      </p>
    </div>
  )
}
