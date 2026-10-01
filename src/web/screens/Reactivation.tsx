import React, { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd, relTime } from "../format"
import { Loading, ErrorState, EmptyState, Section, SimulatedTag } from "../ui"

interface Reactivation {
  id: string
  lead_id: string
  lead_name: string
  lead_status: string
  service: string | null
  last_activity_at: string | null
  phone: string | null
  status: string
  estimated_value: number
  recommended_action: string | null
}

export default function Reactivation() {
  const [items, setItems] = useState<Reactivation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<Reactivation[]>("/api/reactivations")
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const run = async (r: Reactivation) => {
    setBusyId(r.id)
    try {
      await api.post(`/api/reactivations/${r.id}/run`)
      setFlash(`Reactivation queued for ${r.lead_name} — owner call task created (demo action, nothing sent).`)
      setTimeout(() => setFlash(null), 5000)
      load()
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : "Reactivation failed")
      setTimeout(() => setFlash(null), 5000)
    } finally {
      setBusyId(null)
    }
  }

  const identify = async () => {
    try {
      const res = await api.post<{ created: number }>("/api/reactivations/identify")
      setFlash(res.created > 0 ? `${res.created} dormant opportunit${res.created === 1 ? "y" : "ies"} identified.` : "No new dormant leads found.")
      setTimeout(() => setFlash(null), 5000)
      load()
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : "Scan failed")
      setTimeout(() => setFlash(null), 5000)
    }
  }

  if (error) return <ErrorState message={`Reactivation failed to load: ${error}`} />
  if (!items) return <Loading label="Loading reactivation opportunities" />

  const queued = items.filter((r) => r.status !== "identified")
  const totalValue = items.reduce((s, r) => s + r.estimated_value, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-mist-50 sm:text-2xl">Dormant Lead Reactivation</h1>
          <p className="mt-1 text-sm text-mist-400">
            Leads that went quiet are often one good call from closing. VÉRIA keeps them from being forgotten.
          </p>
        </div>
        <button className="btn-secondary" onClick={identify}>Scan for dormant leads</button>
      </div>

      {flash ? (
        <div className="rounded-lg border border-brass-600/50 bg-brass-950/30 px-4 py-2.5 text-sm text-brass-200">{flash}</div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="label">Opportunities</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-mist-50">{items.length}</div>
        </div>
        <div className="card p-4">
          <div className="label">Reactivation value</div>
          <div className="mt-1 metric-display text-3xl leading-none text-brass-300">{usd(totalValue)}</div>
        </div>
        <div className="card p-4">
          <div className="label">Outreach queued</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-300">{queued.length}</div>
        </div>
      </div>

      <Section title="Reactivation queue" subtitle="Identified dormant opportunities, highest value first">
        {items.length === 0 ? (
          <EmptyState icon="⟳" title="No dormant leads" body="Run a scan — VÉRIA flags leads with no activity in 30+ days." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="text-sm font-semibold text-mist-50 underline-offset-2 hover:text-brass-300 hover:underline" onClick={() => nav(`/leads/${r.lead_id}`)}>
                      {r.lead_name}
                    </button>
                    <span className={`chip ${r.status === "identified" ? "border-amber-800/70 bg-amber-950/50 text-amber-300" : "border-emerald-800/70 bg-emerald-950/50 text-emerald-300"}`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-mist-400">
                    {r.service ?? "Service unknown"} · quiet {relTime(r.last_activity_at)}
                  </div>
                  {r.recommended_action ? <div className="mt-1 max-w-xl text-xs text-mist-300">{r.recommended_action}</div> : null}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums text-brass-300">{usd(r.estimated_value)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-mist-400">opportunity</div>
                  </div>
                  {r.status === "identified" ? (
                    <button className="btn-primary px-3 py-1.5 text-xs" disabled={busyId === r.id} onClick={() => run(r)}>
                      {busyId === r.id ? "Queuing…" : "Queue outreach"}
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-300/80">✓ queued</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="px-1 text-[11px] text-mist-400">
        <SimulatedTag /> Reactivation creates owner call tasks — it does not send messages in demo mode.
      </p>
    </div>
  )
}
