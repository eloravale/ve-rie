import React, { useEffect, useState } from "react"
import { api } from "../api"
import { usd } from "../format"
import { Loading, ErrorState, Section } from "../ui"
import { SectionIndex } from "../brand"

interface DataQuality {
  score: number
  band: "high" | "acceptable" | "poor" | "insufficient"
  records_analyzed: number
  issues: { kind: string; label: string; count: number; severity: string; table: string }[]
  completeness: { label: string; pct: number }[]
  summary: string
  analyzed_at: string
}

interface Calibration {
  status: "insufficient_data" | "available"
  message: string
  closed_opportunities: number
  recovered_opportunities: number
  measured_recovery_rate: number | null
  precision_of_flags: number | null
  precision_note: string
  false_positive_review: string
  measured_recovered_revenue: number
}

export default function Accuracy() {
  const [dq, setDq] = useState<DataQuality | null>(null)
  const [cal, setCal] = useState<Calibration | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.get<DataQuality>("/api/data-quality"), api.get<Calibration>("/api/calibration")])
      .then(([d, c]) => {
        setDq(d)
        setCal(c)
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorState message={`Accuracy center failed to load: ${error}`} />
  if (!dq || !cal) return <Loading label="Auditing data quality" />

  const bandChip =
    dq.band === "high"
      ? "border-emerald-800/50 bg-emerald-950/60 text-emerald-300"
      : dq.band === "acceptable"
        ? "border-brass-600/50 bg-brass-950/70 text-brass-300"
        : dq.band === "poor"
          ? "border-red-900/50 bg-red-950/60 text-red-300"
          : "border-ink-700 bg-ink-850 text-mist-400"

  return (
    <div className="space-y-5">
      <div>
        <SectionIndex index="—">VÉRIA accuracy</SectionIndex>
        <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">Trust, measured.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
          VÉRIA never displays an invented accuracy percentage. This screen shows what can honestly be measured today — data
          quality now, and classification performance once enough recorded outcomes exist.
        </p>
      </div>

      {/* 01 Data quality */}
      <Section title="01 · Data quality" subtitle={`How complete is the input? Analyzed ${new Date(dq.analyzed_at.replace(" ", "T") + "Z").toLocaleDateString()}`}>
        <div className="grid gap-px bg-ink-800 sm:grid-cols-[auto_1fr]">
          <div className="bg-ink-900 p-5 sm:p-6">
            <div className="flex items-baseline gap-2">
              <span className="metric-serif text-5xl leading-none text-mist-50">{dq.score}</span>
              <span className="text-sm text-mist-400">/100</span>
            </div>
            <span className={`chip mt-3 ${bandChip}`}>{dq.band} confidence</span>
            <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-mist-400">{dq.summary}</p>
            <p className="mt-1 text-[10px] tabular-nums text-mist-500">{dq.records_analyzed} records analyzed</p>
          </div>
          <div className="bg-ink-900 p-5 sm:p-6">
            <div className="label">Field completeness</div>
            <div className="mt-3 space-y-2.5">
              {dq.completeness.map((c) => (
                <div key={c.label}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-mist-300">{c.label}</span>
                    <span className="metric-display text-sm text-mist-100">{c.pct}%</span>
                  </div>
                  <div className="mt-1 h-1 w-full bg-ink-850">
                    <div className={`h-1 ${c.pct >= 90 ? "bg-emerald-300" : c.pct >= 70 ? "bg-brass-500" : "bg-red-300"}`} style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {dq.issues.length > 0 ? (
              <div className="mt-4 border-t border-ink-800 pt-3">
                <div className="label">Issues detected</div>
                <ul className="mt-2 divide-y divide-ink-800">
                  {dq.issues.map((i) => (
                    <li key={i.kind} className="flex items-center justify-between py-1.5 text-[11px]">
                      <span className="text-mist-300">{i.label}</span>
                      <span className={`metric-display text-sm ${i.severity === "high" ? "text-red-300" : i.severity === "medium" ? "text-amber-300" : "text-mist-400"}`}>
                        {i.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 border-t border-ink-800 pt-3 text-[11px] text-emerald-300">No data-quality issues detected.</p>
            )}
          </div>
        </div>
      </Section>

      {/* 02 Classification performance */}
      <Section title="02 · Classification performance" subtitle="How often are flagged opportunities later confirmed?">
        {cal.status === "insufficient_data" ? (
          <div className="corner-marks bg-ink-950/40 p-6">
            <div className="metric-serif text-2xl italic text-mist-100">Measurement unavailable.</div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-mist-400">{cal.message}</p>
            <p className="mt-3 border-l-2 border-brass-500/60 pl-3 font-display text-[13px] italic leading-relaxed text-mist-300">
              This restraint is deliberate: claiming a performance number before the data supports it would be dishonest. The
              measurement activates automatically once {10 - cal.closed_opportunities > 0 ? 10 - cal.closed_opportunities : 0} more
              opportunit{10 - cal.closed_opportunities === 1 ? "y reaches" : "ies reach"} a recorded outcome.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-ink-800 lg:grid-cols-4">
            {[
              { l: "Measured recovery rate", v: cal.measured_recovery_rate !== null ? `${Math.round(cal.measured_recovery_rate * 100)}%` : "—" },
              { l: "Closed opportunities", v: String(cal.closed_opportunities) },
              { l: "Recovered", v: String(cal.recovered_opportunities) },
              { l: "Measured recovered revenue", v: usd(cal.measured_recovered_revenue) }
            ].map((x) => (
              <div key={x.l} className="bg-ink-900 p-4">
                <div className="label">{x.l}</div>
                <div className="metric-display mt-2 text-2xl leading-none text-mist-50">{x.v}</div>
              </div>
            ))}
          </div>
        )}
        <p className="border-t border-ink-800 px-4 py-2.5 text-[10px] leading-relaxed text-mist-500">{cal.false_positive_review}</p>
      </Section>

      {/* 03 What this screen is not */}
      <div className="border-l-2 border-brass-500/60 bg-ink-900 px-4 py-3">
        <div className="label">Why no accuracy percentage?</div>
        <p className="mt-1 font-display text-[13px] italic leading-relaxed text-mist-300">
          A precision claim like "97.3% accurate" requires labeled historical outcomes and a validated methodology. VÉRIA shows
          measured numbers only — the moment enough outcomes accumulate, calibration appears here with every figure traceable to
          recorded opportunities.
        </p>
      </div>
    </div>
  )
}
