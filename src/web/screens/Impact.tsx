import React, { useEffect, useState } from "react"
import { api } from "../api"
import { nav } from "../App"
import { usd } from "../format"
import { Loading, ErrorState, Section } from "../ui"
import { SectionIndex } from "../brand"

interface Impact {
  identified_value: number
  identified_count: number
  actioned_value: number
  actioned_count: number
  recovered_value: number
  recovered_count: number
  still_open_value: number
  still_open_count: number
  lost_value: number
  lost_count: number
  action_rate: number
  recovery_rate: number
  illustrative: boolean
}

export default function Impact() {
  const [data, setData] = useState<Impact | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Impact>("/api/impact")
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorState message={`Impact failed to load: ${error}`} />
  if (!data) return <Loading label="Measuring recovery" />

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionIndex index="—">The honest ledger</SectionIndex>
          <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">VÉRIA Impact.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
            Only real outcomes count here: appointments booked, quotes accepted, customers reactivated, revenue recorded.
            A message sent is not a recovery.
          </p>
        </div>
        {data.illustrative ? <span className="chip border-brass-600/50 bg-brass-950/70 text-brass-300">Illustrative results — demo data</span> : null}
      </div>

      {/* The funnel — hairline money hierarchy */}
      <div className="grid gap-px overflow-hidden border border-ink-800 bg-ink-800 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-ink-900 p-5 sm:p-6">
          <div className="label">Identified opportunity</div>
          <div className="metric-display mt-2 text-3xl leading-none text-mist-50 sm:text-4xl">{usd(data.identified_value)}</div>
          <div className="mt-2 text-[11px] leading-snug text-mist-400">{data.identified_count} opportunities surfaced from your data</div>
        </div>
        <div className="bg-ink-900 p-5 sm:p-6">
          <div className="label">Actioned</div>
          <div className="metric-display mt-2 text-3xl leading-none text-brass-300 sm:text-4xl">{usd(data.actioned_value)}</div>
          <div className="mt-2 text-[11px] leading-snug text-mist-400">
            {data.actioned_count} being worked · action rate {pct(data.action_rate)}
          </div>
        </div>
        <div className="bg-ink-900 p-5 sm:p-6">
          <div className="label">Recovered</div>
          <div className="metric-display mt-2 text-3xl leading-none text-emerald-300 sm:text-4xl">{usd(data.recovered_value)}</div>
          <div className="mt-2 text-[11px] leading-snug text-mist-400">
            {data.recovered_count} real outcomes · recovery rate {pct(data.recovery_rate)}
          </div>
        </div>
        <div className="bg-ink-900 p-5 sm:p-6">
          <div className="label">Still open</div>
          <div className="metric-display mt-2 text-3xl leading-none text-mist-100 sm:text-4xl">{usd(data.still_open_value)}</div>
          <div className="mt-2 text-[11px] leading-snug text-mist-400">{data.still_open_count} opportunities remain workable</div>
        </div>
      </div>

      {/* Honesty strip */}
      <Section title="How these numbers behave" subtitle="Designed so you can trust what you're reading">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
          {[
            ["Recovered requires an outcome", "An opportunity can only be marked recovered alongside a recorded outcome — booking, accepted quote, reactivation, or revenue you record. Pipeline progress alone never creates revenue."],
            ["Closed opportunities are visible", `${usd(data.lost_value)} across ${data.lost_count} opportunities was qualified out or lost. Keeping this visible keeps the recovered number honest.`],
            ["Demo data is labelled", "In this environment every figure is illustrative demo data. On your own imported data, the same math runs on records you uploaded."]
          ].map(([t, b]) => (
            <div key={t} className="corner-marks border border-ink-800 bg-ink-950/40 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brass-300">{t}</div>
              <p className="mt-1.5 font-display text-[13px] italic leading-relaxed text-mist-300">{b}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-ink-800 px-4 py-3 sm:px-5">
          <button className="btn-primary px-4 py-2 text-xs" onClick={() => nav("/opportunities")}>
            Work the pipeline →
          </button>
        </div>
      </Section>
    </div>
  )
}
