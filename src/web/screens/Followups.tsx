import React, { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd, untilTime, relTime } from "../format"
import { Loading, ErrorState, EmptyState, Section, SimulatedTag, StatusChip } from "../ui"

interface Followup {
  id: string
  lead_id: string
  lead_name: string | null
  lead_status: string | null
  estimated_value: number | null
  kind: string
  status: string
  due_at: string | null
  recommended_action: string | null
  completed_at: string | null
  outcome: string | null
}

export default function FollowupsScreen() {
  const [items, setItems] = useState<Followup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(() => {
    api
      .get<Followup[]>("/api/followups?status=all")
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const complete = async (f: Followup, outcome: string) => {
    setBusyId(f.id)
    try {
      await api.post(`/api/followups/${f.id}/complete`, { outcome })
      setFlash(
        outcome === "recovered"
          ? `${usd(f.estimated_value ?? 0)} recovered from ${f.lead_name} — marked won.`
          : outcome === "lost"
            ? `${f.lead_name} marked lost.`
            : "Follow-up completed."
      )
      setTimeout(() => setFlash(null), 5000)
      load()
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : "Action failed")
      setTimeout(() => setFlash(null), 5000)
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <ErrorState message={`Follow-ups failed to load: ${error}`} />
  if (!items) return <Loading label="Loading follow-ups" />

  const pending = items.filter((f) => f.status === "pending")
  const done = items.filter((f) => f.status !== "pending")
  const overdueValue = pending
    .filter((f) => f.due_at && new Date(f.due_at.replace(" ", "T") + "Z").getTime() < Date.now())
    .reduce((s, f) => s + (f.estimated_value ?? 0), 0)
  const pendingValue = pending.reduce((s, f) => s + (f.estimated_value ?? 0), 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-mist-50 sm:text-2xl">Follow-ups & Estimate Recovery</h1>
        <p className="mt-1 text-sm text-mist-400">
          Estimates rarely close on the first touch. Follow-up is where the money is.
        </p>
      </div>

      {flash ? (
        <div className="rounded-lg border border-brass-600/50 bg-brass-950/30 px-4 py-2.5 text-sm text-brass-200">{flash}</div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="label">Pending</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-mist-50">{pending.length}</div>
          <div className="mt-0.5 text-xs text-mist-400">{usd(pendingValue)} in play</div>
        </div>
        <div className="card p-4">
          <div className="label">Overdue value</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-red-300">{usd(overdueValue)}</div>
          <div className="mt-0.5 text-xs text-mist-400">Past due date</div>
        </div>
        <div className="card p-4">
          <div className="label">Completed</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-300">{done.length}</div>
          <div className="mt-0.5 text-xs text-mist-400">This quarter</div>
        </div>
      </div>

      <Section title="Pending follow-ups" subtitle="Sorted by due date — overdue first">
        {pending.length === 0 ? (
          <EmptyState icon="✓" title="All caught up" body="No pending follow-ups. Schedule one from any lead." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {pending.map((f) => {
              const overdue = f.due_at && new Date(f.due_at.replace(" ", "T") + "Z").getTime() < Date.now()
              return (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="text-sm font-semibold text-mist-50 underline-offset-2 hover:text-brass-300 hover:underline" onClick={() => nav(`/leads/${f.lead_id}`)}>
                        {f.lead_name}
                      </button>
                      <span className="chip border-ink-600 bg-ink-850 text-mist-300">{f.kind.replace(/_/g, " ")}</span>
                      {f.lead_status ? <StatusChip status={f.lead_status} /> : null}
                    </div>
                    {f.recommended_action ? <div className="mt-1 max-w-2xl text-xs text-mist-300">{f.recommended_action}</div> : null}
                    <div className={`mt-1 text-xs ${overdue ? "font-semibold text-red-300" : "text-mist-400"}`}>
                      {overdue ? "⚠ Overdue" : "Due"} {untilTime(f.due_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mr-1 text-sm font-bold tabular-nums text-mist-100">{usd(f.estimated_value ?? 0)}</span>
                    <button className="btn-secondary px-2.5 py-1.5 text-[11px]" disabled={busyId === f.id} onClick={() => complete(f, "completed")}>
                      Done
                    </button>
                    <button className="btn-secondary px-2.5 py-1.5 text-[11px]" disabled={busyId === f.id} onClick={() => complete(f, "lost")}>
                      Lost
                    </button>
                    <button className="btn-primary px-2.5 py-1.5 text-[11px]" disabled={busyId === f.id} onClick={() => complete(f, "recovered")}>
                      ✓ Recovered
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Completed"
        subtitle="Recently closed follow-ups"
        actions={
          <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Hide" : "Show"}
          </button>
        }
      >
        {!showDone ? (
          <p className="px-4 py-4 text-xs text-mist-400 sm:px-5">{done.length} completed — click Show to review.</p>
        ) : done.length === 0 ? (
          <EmptyState title="None yet" body="Completed follow-ups appear here." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {done.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-mist-100">{f.lead_name}</span>
                  <span className={`ml-2 text-xs ${f.outcome === "recovered" ? "text-emerald-300" : f.outcome === "lost" ? "text-red-300" : "text-mist-400"}`}>
                    {f.outcome ?? "completed"}
                  </span>
                  {f.recommended_action ? <div className="truncate text-xs text-mist-400">{f.recommended_action}</div> : null}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-mist-400">{relTime(f.completed_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="px-1 text-[11px] text-mist-400">
        <SimulatedTag /> Demo actions update workflow state only — VÉRIA does not send SMS, email, or place calls yet.
      </p>
    </div>
  )
}
