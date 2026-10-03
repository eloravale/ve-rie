import React, { useEffect, useState } from "react"
import { api } from "../api"
import { nav } from "../App"
import { usd } from "../format"
import { useSettings } from "../use-settings"
import { formatDate } from "../recovery-format"
import { Loading, ErrorState } from "../ui"
import { ScoreInstrument, VeriaMark } from "../brand"
import { auditToHtml, type AuditExportDoc } from "../audit-export"

interface Bucket {
  key: string
  label: string
  count: number
}

type AuditDoc = AuditExportDoc & {
  response_health: { total: number; responded: number; no_response: number; buckets: Bucket[]; median_minutes: number | null }
  score: { score: number; band: string; lines: { label: string; delta: number; detail: string }[] }
}

const WORKSPACE_CHIP: Record<AuditExportDoc["workspace_kind"], { label: string; cls: string }> = {
  demo: { label: "Illustrative demo data", cls: "border-ink-700 bg-ink-850 text-mist-400" },
  prospect: { label: "Imported prospect data", cls: "border-brass-600/50 bg-brass-950/70 text-brass-300" },
  customer: { label: "Customer data", cls: "border-emerald-900/50 bg-emerald-950/40 text-emerald-200" }
}

const STAGE_LABEL: Record<string, string> = {
  identified: "Identified",
  contacted: "Contacted",
  responded: "Responded",
  qualified: "Qualified",
  booked: "Booked",
  recovered: "Recovered",
  lost: "Lost"
}

export default function Audit() {
  const [doc, setDoc] = useState<AuditDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const settings = useSettings()

  useEffect(() => {
    api
      .get<AuditDoc>("/api/audit?days=90")
      .then(setDoc)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorState message={`Audit failed to load: ${error}`} />
  if (!doc) return <Loading label="Compiling your audit" />

  const m = (n: number) => usd(n)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `veria-recovery-audit-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportHtml = () => {
    const blob = new Blob([auditToHtml(doc)], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `veria-revenue-recovery-audit-${doc.company.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date()
      .toISOString()
      .slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const findings: [string, string][] = [
    ["Enquiries", String(doc.enquiries)],
    ["Missed / unanswered", String(doc.missed_unanswered)],
    ["Slow responses", String(doc.slow_responses)],
    ["Open quotes", String(doc.open_quotes)],
    ["Overdue quotes", String(doc.overdue_quotes)],
    ["Dormant customers", String(doc.dormant_customers)]
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar (hidden on print) */}
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => nav("/prospect")}>
          ← Prospect mode
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${WORKSPACE_CHIP[doc.workspace_kind].cls}`}>{WORKSPACE_CHIP[doc.workspace_kind].label}</span>
          <button className="btn-secondary px-3 py-2 text-xs" onClick={() => window.print()}>
            Print / Save PDF
          </button>
          <button className="btn-primary px-3 py-2 text-xs" onClick={exportHtml}>
            ⬇ Download audit
          </button>
          <button className="btn-secondary px-3 py-2 text-xs" onClick={exportJson}>
            Export JSON
          </button>
        </div>
      </div>

      {/* ================= The document ================= */}
      <article className="card corner-marks mx-auto max-w-3xl p-6 sm:p-10">
        {/* Document masthead */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-700 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <VeriaMark className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-brass-400">Revenue Recovery Audit</span>
            </div>
            <h1 className="font-display mt-3 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">{doc.company.name}</h1>
            <div className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-mist-400">
              {doc.company.city}, {doc.company.state} · {doc.company.region.toUpperCase()} · {doc.company.currency}
            </div>
          </div>
          <div className="text-right text-[11px] uppercase tracking-[0.1em] text-mist-400">
            <div className="text-mist-500">Ref. VRA-{doc.generated_at.slice(0, 10).replace(/-/g, "")}</div>
            <div className="mt-1">Period: last {doc.period_days} days</div>
            <div>Issued: {formatDate(doc.generated_at, settings.date_format)}</div>
          </div>
        </header>

        {/* 01 Findings */}
        <section className="mt-7">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[13px] italic text-brass-400">01</span>
            <span className="h-px w-6 bg-brass-500/70" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-mist-400">Findings</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-px border border-ink-800 bg-ink-800 sm:grid-cols-3">
            {findings.map(([k, v]) => (
              <div key={k} className="bg-ink-900 px-3.5 py-3">
                <div className="label">{k}</div>
                <div className="metric-display mt-1.5 text-2xl leading-none text-mist-50">{v}</div>
              </div>
            ))}
          </div>
          {/* Data sources actually read for this audit */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mist-400">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-mist-500">Data sources:</span>
            {doc.data_sources.map((s) => (
              <span key={s.source}>
                {s.source} <span className="text-mist-500">({s.scope})</span> — {s.count} row{s.count === 1 ? "" : "s"}
              </span>
            ))}
          </div>
        </section>

        {/* 02 Response health */}
        {doc.response_health.total > 0 ? (
          <section className="mt-8">
            <div className="flex items-baseline gap-2.5">
              <span className="font-display text-[13px] italic text-brass-400">02</span>
              <span className="h-px w-6 bg-brass-500/70" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-mist-400">Lead response leakage</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-px border border-ink-800 bg-ink-800 sm:grid-cols-5">
              {doc.response_health.buckets.map((b) => (
                <div key={b.key} className="bg-ink-900 px-3 py-2.5 text-center">
                  <div className="metric-display text-xl leading-none text-mist-50">{b.count}</div>
                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-mist-400">{b.label}</div>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-mist-400">
              Based only on your recorded enquiries — no industry benchmarks.{" "}
              {doc.response_health.no_response > 0
                ? `${doc.response_health.no_response} enquiries never received a first response.`
                : "Every enquiry received a first response."}
            </p>
          </section>
        ) : null}

        {/* 03 Opportunity */}
        <section className="mt-8">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[13px] italic text-brass-400">03</span>
            <span className="h-px w-6 bg-brass-500/70" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-mist-400">Identified recovery opportunity</span>
            <span className="chip ml-auto border-brass-600/50 bg-brass-950/70 text-brass-300">not guaranteed revenue</span>
          </div>
          <div className="corner-marks mt-4 border border-brass-600/40 bg-brass-950/30 p-5 sm:p-6">
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {[
                ["Missed enquiries", doc.opportunity.missed_enquiries],
                ["Quote follow-up", doc.opportunity.quote_followup],
                ["Dormant customers", doc.opportunity.dormant_customers],
                ["Slow responses", doc.opportunity.slow_responses]
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-baseline justify-between border-b border-ink-800 pb-1.5">
                  <span className="text-sm text-mist-300">{k}</span>
                  <span className="metric-display text-lg text-mist-50">{m(v as number)}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-baseline justify-between border-t border-brass-600/40 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brass-300">Total opportunity</span>
              <span className="metric-display text-4xl text-brass-300 sm:text-5xl">{m(doc.opportunity.total)}</span>
            </div>
          </div>
        </section>

        {/* 04 Recorded recovered revenue — canonical ledger, distinct from identified */}
        <section className="mt-8">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[13px] italic text-brass-400">04</span>
            <span className="h-px w-6 bg-brass-500/70" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-mist-400">Recorded recovered revenue</span>
            <span className="chip ml-auto border-emerald-900/50 bg-emerald-950/40 text-emerald-200">canonical ledger</span>
          </div>
          <div className="corner-marks mt-4 border border-emerald-900/40 bg-emerald-950/20 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="metric-display text-4xl text-emerald-300 sm:text-5xl">{m(doc.recovered.value)}</span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-mist-400">
                {doc.recovered.events} recorded event{doc.recovered.events === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {([
                ["Recorded (real outcomes)", doc.recovered.by_basis.recorded],
                ["Assumed (historical, labelled)", doc.recovered.by_basis.assumed],
                ["Analytical (model-derived)", doc.recovered.by_basis.analytical],
                ["Opportunity basis", doc.recovered.by_basis.opportunity]
              ] as [string, number][]).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-ink-800 pb-1.5">
                  <span className="text-sm text-mist-300">{k}</span>
                  <span className="metric-display text-base text-mist-50">{m(v)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-mist-400">
              Source: the canonical <code className="text-mist-300">revenue_events</code> ledger — the single source of recovered-revenue
              truth. This is a different number from identified recovery opportunity above, and the two are never added together.
            </p>
          </div>
        </section>

        {/* 05 Actions */}
        <section className="mt-8">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[13px] italic text-brass-400">05</span>
            <span className="h-px w-6 bg-brass-500/70" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-mist-400">Top five recovery actions</span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-mist-500">ranked by priority, then value</span>
          </div>
          <ol className="mt-4 divide-y divide-ink-800 border-t border-ink-800">
            {doc.top_actions.map((a) => (
              <li key={a.rank} className="flex items-start justify-between gap-4 py-3.5">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="font-display w-8 shrink-0 text-2xl italic leading-none text-brass-400/90">{String(a.rank).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-mist-100">{a.title}</span>
                      <span
                        className={`chip ${
                          a.priority === "high"
                            ? "border-red-900/60 bg-red-950/40 text-red-300"
                            : a.priority === "medium"
                              ? "border-brass-600/50 bg-brass-950/60 text-brass-300"
                              : "border-ink-700 bg-ink-850 text-mist-400"
                        }`}
                      >
                        {a.priority} priority
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-mist-500">
                      {a.age_days}d old · {STAGE_LABEL[a.stage] ?? a.stage}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-mist-400">{a.why}</div>
                    <div className="mt-1 text-[11px] font-semibold text-brass-300">→ {a.recommended_action}</div>
                  </div>
                </div>
                <span className="metric-display shrink-0 text-lg text-mist-50">{m(a.value)}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* 06 Score */}
        <section className="mt-8">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[13px] italic text-brass-400">06</span>
            <span className="h-px w-6 bg-brass-500/70" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-mist-400">Revenue Recovery Score</span>
            <span className="chip ml-auto border-ink-700 bg-ink-850 text-mist-300">{doc.score.band}</span>
          </div>
          <div className="mt-4 max-w-md">
            <ScoreInstrument
              score={doc.score.score}
              size="lg"
              breakdown={doc.score.lines.map((l) => ({ label: l.label, delta: l.delta }))}
            />
            <ul className="mt-3 space-y-1 border-t border-ink-800 pt-3 text-[11px] leading-relaxed text-mist-400">
              {doc.score.lines.map((l, i) => (
                <li key={i}>
                  <span className="text-mist-300">{l.label}:</span> {l.detail}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 07 Method */}
        <section className="mt-8 border-t border-ink-700 pt-5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[13px] italic text-brass-400">07</span>
            <span className="h-px w-6 bg-brass-500/70" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-mist-400">Methodology</span>
          </div>
          <div className="mt-3 text-[11px] leading-relaxed text-mist-400">
            <p>{doc.data_basis}</p>
            <p className="mt-2">
              Opportunities are identified by deterministic rules: calls with no recorded call-back, enquiries with no or slow first
              response, quotes with no recorded follow-up, leads with no next step, customers idle 30+ days, unconfirmed appointment
              requests, and owner handoffs open 2+ days. Response health uses only your recorded enquiries — no industry benchmarks.
            </p>
            <p className="mt-2 font-display text-[13px] italic text-mist-300">{doc.disclaimer}</p>
          </div>
        </section>
      </article>

      {/* Post-document CTA */}
      <div className="no-print card corner-marks mx-auto max-w-3xl p-6 text-center">
        <h2 className="font-display text-xl font-medium text-mist-50">See how VÉRIA can recover these opportunities</h2>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-mist-400">
          Work the pipeline, advance opportunities with real outcomes, and measure what actually gets recovered.
        </p>
        <button className="btn-primary mt-4 px-6 py-2.5 text-sm" onClick={() => nav("/opportunities")}>
          Open the recovery pipeline →
        </button>
      </div>
    </div>
  )
}
