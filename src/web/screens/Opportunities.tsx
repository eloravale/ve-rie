import React, { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd } from "../format"
import { SectionIndex } from "../brand"
import { Loading, ErrorState, EmptyState, Section, Modal } from "../ui"

const STAGES = ["identified", "contacted", "responded", "qualified", "booked", "recovered"] as const
type Stage = (typeof STAGES)[number] | "lost"

interface Evidence {
  customer: string
  opportunity_value: number
  value_basis: string
  fields: { field: string; value: string; present: boolean }[]
  confidence: "high" | "medium" | "low"
  confidence_reason: string
  conclusion: string
  estimated_recoverable: number | null
  estimated_recoverable_note: string
  priority_reason: string
  source: { type: string; id: string | null; label: string }
  analysis_period: string
}

const CONFIDENCE_CHIP: Record<string, string> = {
  high: "border-emerald-800/50 bg-emerald-950/60 text-emerald-300",
  medium: "border-amber-800/50 bg-amber-950/60 text-amber-300",
  low: "border-red-900/50 bg-red-950/60 text-red-300"
}

interface Opportunity {
  id: string
  source_type: string
  lead_id: string | null
  customer_name: string
  job_type: string | null
  category: string
  title: string
  why: string
  recommended_action: string
  estimated_value: number
  stage: Stage
  priority: "low" | "medium" | "high"
  owner: string | null
  age_days: number
  outcome_type: string | null
  recovered_value: number | null
}

const SOURCE_ICON: Record<string, string> = {
  missed_call: "☏",
  slow_response: "◷",
  unworked_lead: "☰",
  quote: "◫",
  dormant_customer: "⟳",
  booking_failure: "▦",
  handoff: "✓"
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

const STAGE_STYLE: Record<string, string> = {
  identified: "border-sky-800/70 bg-sky-950/60 text-sky-300",
  contacted: "border-indigo-800/70 bg-indigo-950/60 text-indigo-300",
  responded: "border-teal-800/70 bg-teal-950/60 text-teal-300",
  qualified: "border-amber-800/70 bg-amber-950/60 text-amber-300",
  booked: "border-amber-700/70 bg-amber-900/50 text-amber-200",
  recovered: "border-emerald-800/70 bg-emerald-950/60 text-emerald-300",
  lost: "border-ink-600 bg-ink-800 text-mist-400"
}

const NEXT: Partial<Record<Stage, Stage>> = {
  identified: "contacted",
  contacted: "responded",
  responded: "qualified",
  qualified: "booked",
  booked: "recovered"
}

const OUTCOMES = ["appointment_booked", "quote_accepted", "customer_reactivated", "revenue_recorded"] as const

const PRIORITY_STYLE: Record<string, string> = {
  high: "border-red-900/70 bg-red-950/50 text-red-300",
  medium: "border-amber-800/70 bg-amber-950/60 text-amber-300",
  low: "border-ink-600 bg-ink-850 text-mist-400"
}

export default function Opportunities() {
  const [items, setItems] = useState<Opportunity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<string>("open")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [outcomeModal, setOutcomeModal] = useState<Opportunity | null>(null)
  const [evidenceFor, setEvidenceFor] = useState<Opportunity | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [evidenceBusy, setEvidenceBusy] = useState(false)

  const load = useCallback(() => {
    api
      .get<{ items: Opportunity[] }>("/api/opportunities")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash_ = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 5000)
  }

  const openEvidence = async (o: Opportunity) => {
    setEvidenceFor(o)
    setEvidence(null)
    setEvidenceBusy(true)
    try {
      setEvidence(await api.get<Evidence>(`/api/opportunities/${o.id}/evidence`))
    } catch {
      setEvidence(null)
    } finally {
      setEvidenceBusy(false)
    }
  }

  const advance = async (o: Opportunity, to: Stage, extra: Record<string, unknown> = {}) => {
    setBusyId(o.id)
    try {
      const res = await api.patch<{ opportunity: Opportunity; counted_as_recovered: boolean }>(
        `/api/opportunities/${o.id}`,
        { stage: to, ...extra }
      )
      flash_(
        res.counted_as_recovered
          ? `${res.opportunity.customer_name}: recorded as RECOVERED (${usd(res.opportunity.recovered_value ?? 0)}). This now counts in measured recovery.`
          : `${res.opportunity.customer_name}: ${STAGE_LABEL[res.opportunity.stage]} — next step: ${res.opportunity.recommended_action}`
      )
      load()
    } catch (e) {
      flash_(e instanceof ApiError ? e.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }

  const sync = async () => {
    setBusyId("sync")
    try {
      const r = await api.post<{ created: number }>("/api/opportunities/sync")
      flash_(r.created > 0 ? `Sync found ${r.created} new opportunit${r.created === 1 ? "y" : "ies"} in your data.` : "Sync complete — no new opportunities beyond what you already have.")
      load()
    } catch (e) {
      flash_(e instanceof ApiError ? e.message : "Sync failed")
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <ErrorState message={`Recovery pipeline failed to load: ${error}`} />
  if (!items) return <Loading label="Loading recovery pipeline" />

  const openCount = items.filter((o) => !["recovered", "lost"].includes(o.stage)).length
  const filtered = items
    .filter((o) => {
      if (stageFilter === "open") return !["recovered", "lost"].includes(o.stage)
      if (stageFilter === "all") return true
      return o.stage === stageFilter
    })
    .filter((o) => (sourceFilter === "all" ? true : o.source_type === sourceFilter))

  const openValue = items
    .filter((o) => !["recovered", "lost"].includes(o.stage))
    .reduce((s, o) => s + o.estimated_value, 0)
  const highCount = items.filter((o) => o.stage === "identified" && o.priority === "high").length

  const sources = Array.from(new Set(items.map((o) => o.source_type)))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionIndex index="—">Recovery operations</SectionIndex>
          <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">The pipeline.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
            Every leak becomes an opportunity with a stage, a value, a why, and a next action. Work it left to right —
            and recover honestly: revenue only counts when you record the outcome.
          </p>
        </div>
        <button className="btn-secondary px-3 py-2 text-xs" onClick={sync} disabled={busyId === "sync"}>
          {busyId === "sync" ? "Syncing…" : "↻ Sync from data"}
        </button>
      </div>

      {flash ? <div className="border-l-2 border-brass-500 bg-brass-950/40 px-4 py-2.5 text-sm text-brass-200">{flash}</div> : null}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-px overflow-hidden border border-ink-800 bg-ink-800">
        <div className="bg-ink-900 p-4">
          <div className="label">Open opportunities</div>
          <div className="metric-display mt-1.5 text-3xl leading-none text-mist-50">{openCount}</div>
        </div>
        <div className="bg-ink-900 p-4">
          <div className="label">Identified value</div>
          <div className="metric-display mt-1.5 text-3xl leading-none text-brass-300">{usd(openValue)}</div>
          <div className="mt-1 text-[10px] leading-snug text-mist-400">Identified recovery opportunity — not guaranteed revenue</div>
        </div>
        <div className="bg-ink-900 p-4">
          <div className="label">New high-priority</div>
          <div className="metric-display mt-1.5 text-3xl leading-none text-red-300">{highCount}</div>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="card px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["open", ...STAGES, "lost", "all"] as string[]).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`chip ${stageFilter === s ? "border-brass-500 bg-brass-500/15 text-brass-300" : "border-ink-600 bg-ink-850 text-mist-400 hover:text-mist-200"}`}
            >
              {s === "open" ? "Open queue" : STAGE_LABEL[s] ?? s}
              {s === "open" ? ` · ${openCount}` : ""}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="label">Source:</span>
          <button
            onClick={() => setSourceFilter("all")}
            className={`chip ${sourceFilter === "all" ? "border-brass-500 bg-brass-500/15 text-brass-300" : "border-ink-600 bg-ink-850 text-mist-400"}`}
          >
            All
          </button>
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`chip ${sourceFilter === s ? "border-brass-500 bg-brass-500/15 text-brass-300" : "border-ink-600 bg-ink-850 text-mist-400"}`}
            >
              {SOURCE_ICON[s]} {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <Section
        title={stageFilter === "open" ? "Open queue" : `${STAGE_LABEL[stageFilter] ?? stageFilter} stage`}
        subtitle={stageFilter === "open" ? "Ranked: high priority first, then value" : "Filtered view"}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="◎"
            title="Nothing here"
            body="Run a sync to materialize opportunities from missed calls, quotes, enquiries and dormant leads."
          />
        ) : (
          <ul className="divide-y divide-ink-800">
            {filtered
              .slice()
              .sort((a, b) => (a.priority === b.priority ? b.estimated_value - a.estimated_value : a.priority === "high" ? -1 : b.priority === "high" ? 1 : a.priority === "medium" ? -1 : 1))
              .map((o) => (
                <li key={o.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base text-brass-400">{SOURCE_ICON[o.source_type] ?? "◎"}</span>
                        <span className={`chip ${STAGE_STYLE[o.stage]}`}>{STAGE_LABEL[o.stage]}</span>
                        <span className={`chip ${PRIORITY_STYLE[o.priority]}`}>{o.priority} priority</span>
                        <span className="text-sm font-semibold text-mist-50">{o.title}</span>
                      </div>
                      <div className="mt-2 border-l-2 border-brass-500/60 bg-ink-850/50 px-3 py-2">
                        <div className="label">Why this matters</div>
                        <p className="mt-0.5 font-display text-[13px] italic leading-relaxed text-mist-200">{o.why}</p>
                      </div>
                      <div className="mt-1.5 text-xs">
                        <span className="text-mist-400">Recommended action: </span>
                        <span className="font-semibold text-brass-300">{o.recommended_action}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-mist-400">
                        <span>{o.age_days}d old</span>
                        <span>owner: {o.owner ?? "—"}</span>
                        {o.job_type ? <span>job: {o.job_type.replace(/_/g, " ")}</span> : null}
                        {o.outcome_type ? <span className="text-emerald-300/80">outcome: {o.outcome_type.replace(/_/g, " ")}</span> : null}
                        {o.lead_id ? (
                          <button className="underline-offset-2 hover:text-brass-300 hover:underline" onClick={() => nav(`/leads/${o.lead_id}`)}>
                            view lead →
                          </button>
                        ) : null}
                        <button
                          className="font-semibold underline-offset-2 hover:text-brass-300 hover:underline"
                          onClick={() => openEvidence(o)}
                        >
                          view evidence →
                        </button>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <div className="metric-display text-xl text-mist-50">{usd(o.estimated_value)}</div>
                        {o.stage === "recovered" && o.recovered_value ? (
                          <div className="text-[11px] font-semibold text-emerald-300">recovered {usd(o.recovered_value)}</div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {NEXT[o.stage] ? (
                          <button
                            className="btn-primary px-3 py-1.5 text-[11px]"
                            disabled={busyId === o.id}
                            onClick={() => (NEXT[o.stage] === "recovered" ? setOutcomeModal(o) : advance(o, NEXT[o.stage]!))}
                          >
                            {NEXT[o.stage] === "recovered" ? "Record recovery" : `→ ${STAGE_LABEL[NEXT[o.stage]!]}`}
                          </button>
                        ) : null}
                        {!["recovered", "lost"].includes(o.stage) && o.stage !== "identified" ? (
                          <button className="btn-ghost px-2 py-1.5 text-[11px]" disabled={busyId === o.id} onClick={() => advance(o, "lost")}>
                            Lost
                          </button>
                        ) : null}
                        {o.stage === "identified" ? (
                          <button className="btn-ghost px-2 py-1.5 text-[11px]" disabled={busyId === o.id} onClick={() => advance(o, "lost")}>
                            Not worth it
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* Recovery outcome modal */}
      <Modal open={outcomeModal !== null} onClose={() => setOutcomeModal(null)} title={`Record recovery — ${outcomeModal?.customer_name ?? ""}`}>
        {outcomeModal ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const outcome = String(fd.get("outcome") ?? "")
              const valueRaw = String(fd.get("value") ?? "").replace(/[$,£€\s]/g, "")
              const value = valueRaw ? Number(valueRaw) : undefined
              advance(outcomeModal, "recovered", { outcome, recovered_value: value })
              setOutcomeModal(null)
            }}
          >
            <p className="text-xs leading-relaxed text-mist-400">
              Recording recovery books <span className="font-semibold text-mist-100">{usd(outcomeModal.estimated_value)}</span> into
              measured recovered revenue. Only record this when the outcome actually happened — VÉRIA never counts a
              message sent or a task completed as revenue.
            </p>
            <div className="mt-4">
              <div className="label">What actually happened?</div>
              <select name="outcome" className="input mt-1" required defaultValue="appointment_booked">
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <div className="label">Recovered value</div>
              <input
                name="value"
                className="input mt-1"
                inputMode="decimal"
                placeholder={String(outcomeModal.estimated_value)}
                defaultValue={outcomeModal.estimated_value || undefined}
              />
              <div className="mt-1 text-[10px] text-mist-400">Leave the pre-filled value if the job closed at the quoted amount.</div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => setOutcomeModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary px-4 py-2 text-xs">
                Record recovery
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Evidence modal — WHY did VÉRIA flag this? */}
      <Modal open={!!evidenceFor} onClose={() => setEvidenceFor(null)} title={`Evidence — ${evidenceFor?.customer_name ?? ""}`} wide>
        {evidenceBusy || !evidence ? (
          <p className="py-6 text-center text-xs text-mist-400">Assembling evidence…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="metric-display text-2xl text-mist-50">{usd(evidence.opportunity_value)}</span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-mist-400">opportunity value</span>
              </div>
              <span className={`chip ${CONFIDENCE_CHIP[evidence.confidence]}`}>{evidence.confidence} evidence confidence</span>
            </div>
            <p className="text-[11px] leading-relaxed text-mist-400">{evidence.value_basis}</p>
            <div className="border-t border-ink-800 pt-3">
              <div className="label">Fields this classification used</div>
              <dl className="mt-2 divide-y divide-ink-800">
                {evidence.fields.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1.5">
                    <dt className={`text-xs ${f.present ? "text-mist-300" : "text-mist-500"}`}>{f.field}</dt>
                    <dd className={`metric-display text-sm ${f.present ? "text-mist-100" : "text-red-300"}`}>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="border-t border-ink-800 pt-3">
              <div className="label">VÉRIA conclusion</div>
              <p className="mt-1.5 font-display text-[13px] italic leading-relaxed text-mist-200">{evidence.conclusion}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-mist-400">{evidence.priority_reason}</p>
            </div>
            <div className="border-t border-ink-800 pt-3">
              <div className="label">Estimated recoverable value</div>
              {evidence.estimated_recoverable !== null ? (
                <p className="mt-1.5 text-xs text-mist-200">
                  <span className="metric-display text-lg text-mist-50">{usd(evidence.estimated_recoverable)}</span> — analytical
                  estimate only.
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-mist-400">{evidence.estimated_recoverable_note}</p>
              )}
            </div>
            <div className="border-t border-ink-800 pt-3 text-[10px] leading-relaxed text-mist-500">
              Source: {evidence.source.label} · Analysis period: {evidence.analysis_period} · {evidence.confidence_reason}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
