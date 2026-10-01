import React, { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd, dateTime } from "../format"
import { Loading, ErrorState, EmptyState, Section, SimulatedTag } from "../ui"

interface MissedCall {
  id: string
  caller_name: string | null
  caller_phone: string
  called_at: string
  recovered: number
  lead_id: string | null
  estimated_value: number
  notes: string | null
}

export default function MissedCalls() {
  const [items, setItems] = useState<MissedCall[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<MissedCall[]>("/api/missed-calls")
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const recover = async (mc: MissedCall) => {
    setBusyId(mc.id)
    try {
      const res = await api.post<{ lead: { id: string; name: string } }>(`/api/missed-calls/${mc.id}/recover`)
      setFlash(`Recovery workflow started for ${res.lead.name} — owner call-back task created (demo action, nothing sent).`)
      setTimeout(() => setFlash(null), 5000)
      load()
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : "Recovery failed")
      setTimeout(() => setFlash(null), 5000)
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <ErrorState message={`Missed calls failed to load: ${error}`} />
  if (!items) return <Loading label="Loading missed calls" />

  const open = items.filter((m) => !m.recovered)
  const recovered = items.filter((m) => m.recovered)
  const atRisk = open.reduce((s, m) => s + m.estimated_value, 0)
  const recoveredValue = recovered.reduce((s, m) => s + m.estimated_value, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-mist-50 sm:text-2xl">Missed-Call Recovery</h1>
        <p className="mt-1 text-sm text-mist-400">
          Every missed call is a customer who may already be dialing a competitor.
        </p>
      </div>

      {flash ? (
        <div className="rounded-lg border border-brass-600/50 bg-brass-950/30 px-4 py-2.5 text-sm text-brass-200">{flash}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="label">Calls unrecovered</div>
          <div className="mt-1 metric-display text-3xl leading-none text-red-300" data-testid="missed-open">{open.length}</div>
        </div>
        <div className="card p-4">
          <div className="label">Revenue at risk</div>
          <div className="mt-1 metric-display text-3xl leading-none text-red-300">{usd(atRisk)}</div>
        </div>
        <div className="card p-4">
          <div className="label">Recovered</div>
          <div className="mt-1 metric-display text-3xl leading-none text-emerald-300">{recovered.length}</div>
        </div>
        <div className="card p-4">
          <div className="label">Revenue recovered</div>
          <div className="mt-1 metric-display text-3xl leading-none text-emerald-300">{usd(recoveredValue)}</div>
        </div>
      </div>

      <Section title="Recovery queue" subtitle="Unrecovered missed calls — start the recovery workflow">
        {open.length === 0 ? (
          <EmptyState icon="✓" title="Queue is clear" body="Every missed call has been recovered. This is the steady state VÉRIA creates." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {open.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-mist-50">{m.caller_name ?? "Unknown caller"}</div>
                  <div className="mt-0.5 text-xs text-mist-400">
                    {m.caller_phone} · called {dateTime(m.called_at)}
                  </div>
                  {m.notes ? <div className="mt-1 max-w-xl text-xs text-mist-400">{m.notes}</div> : null}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="metric-display text-base text-red-300">{usd(m.estimated_value)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-mist-400">at risk</div>
                  </div>
                  <button className="btn-primary px-3 py-1.5 text-xs" disabled={busyId === m.id} onClick={() => recover(m)}>
                    {busyId === m.id ? "Starting…" : "Start recovery"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Recovered"
        subtitle="Calls VÉRIA turned back into booked revenue"
        actions={<SimulatedTag>Demo data</SimulatedTag>}
      >
        {recovered.length === 0 ? (
          <EmptyState title="Nothing recovered yet" body="Start a recovery above — it will move here." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {recovered.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-mist-100">
                    {m.caller_name ?? m.caller_phone}
                    <span className="ml-2 text-xs font-normal text-emerald-300/90">✓ recovered</span>
                  </div>
                  <div className="mt-0.5 text-xs text-mist-400">{m.notes ?? dateTime(m.called_at)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="metric-display text-base text-emerald-300">{usd(m.estimated_value)}</span>
                  {m.lead_id ? (
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => nav(`/leads/${m.lead_id}`)}>
                      View lead
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
