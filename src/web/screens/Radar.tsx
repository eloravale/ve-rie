import React, { useEffect, useState } from "react"
import { api } from "../api"
import { nav } from "../App"
import { usd } from "../format"

// Financial note: each row is a DISTINCT opportunity from the unified pipeline —
// the same customer problem never appears in two categories, so the total is a
// true sum, not a double count.
import { UrgencyChip, Loading, ErrorState, EmptyState } from "../ui"

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

const KIND_META: Record<string, { icon: string; label: string; className: string }> = {
  missed_call: { icon: "☏", label: "Missed call", className: "border-red-900/60 bg-red-950/30 text-red-300" },
  unanswered_lead: { icon: "✉", label: "Unanswered lead", className: "border-amber-900/60 bg-amber-950/30 text-amber-300" },
  estimate_idle: { icon: "◌", label: "Estimate idle", className: "border-violet-900/60 bg-violet-950/30 text-violet-300" },
  dormant_lead: { icon: "⟳", label: "Dormant lead", className: "border-sky-900/60 bg-sky-950/30 text-sky-300" },
  appointment_gap: { icon: "▦", label: "Appointment gap", className: "border-teal-900/60 bg-teal-950/30 text-teal-300" },
  high_value_action: { icon: "▲", label: "High value", className: "border-brass-600/50 bg-brass-950/30 text-brass-300" }
}

export default function RadarScreen() {
  const [items, setItems] = useState<RadarItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ items: RadarItem[] }>("/api/radar")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorState message={`Radar failed to load: ${error}`} />
  if (!items) return <Loading label="Scanning for lost revenue" />

  const total = items.reduce((s, i) => s + i.estimated_value, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-mist-50 sm:text-2xl">Lost-Revenue Radar</h1>
        <p className="mt-1 text-sm text-mist-400">
          Every signal a leaking business sends — ranked by value and urgency.
        </p>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <div className="label">Total identified opportunity</div>
          <div className="mt-1 metric-serif text-4xl leading-none text-brass-400" data-testid="radar-total">{usd(total)}</div>
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-mist-500">
            Each row is a distinct opportunity — no category double counts a customer
          </div>
        </div>
        <div className="text-right text-xs text-mist-400">
          <div className="font-semibold text-mist-200">{items.length} opportunities</div>
          <div className="mt-0.5">Identified, not guaranteed revenue</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon="◎" title="Radar is clear" body="No leaks detected. Check back after new calls and leads come in." />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((r) => {
            const meta = KIND_META[r.kind] ?? KIND_META.high_value_action
            return (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`chip mt-0.5 ${meta.className}`}>
                      {meta.icon} {meta.label}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-mist-50">
                        {r.issue} — {r.lead_name}
                      </div>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-mist-400">{r.detail}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-mist-400">Action:</span>
                        <span className="font-medium text-brass-300">{r.recommended_action}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="metric-display text-lg text-red-300">{usd(r.estimated_value)}</span>
                    <div className="flex items-center gap-1.5">
                      <UrgencyChip urgency={r.urgency} />
                    </div>
                    {r.lead_id ? (
                      <button className="btn-secondary px-2.5 py-1 text-[11px]" onClick={() => nav(`/leads/${r.lead_id}`)}>
                        Open lead →
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
