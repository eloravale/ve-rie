import React, { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd, untilTime } from "../format"
import { Loading, ErrorState, EmptyState, Section } from "../ui"
import { SectionIndex } from "../brand"

interface Task {
  id: string
  lead_id: string | null
  lead_name: string | null
  lead_phone?: string | null
  assigned_to?: string | null
  title: string
  reason: string
  estimated_value: number
  priority: string
  recommended_action: string | null
  status: string
  due_at: string | null
}

export default function TasksScreen() {
  const [items, setItems] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<Task[]>("/api/tasks?status=all")
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const setTaskStatus = async (t: Task, status: string, extra: Record<string, unknown> = {}) => {
    setBusyId(t.id)
    try {
      await api.patch(`/api/tasks/${t.id}`, { status, ...extra })
      setFlash(
        status === "completed"
          ? `Task completed: ${t.title}`
          : status === "dismissed"
            ? `Task dismissed: ${t.title}`
            : "Task reopened."
      )
      setTimeout(() => setFlash(null), 4000)
      load()
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : "Action failed")
      setTimeout(() => setFlash(null), 4000)
    } finally {
      setBusyId(null)
    }
  }

  const snooze = async (t: Task, days: number) => {
    setBusyId(t.id)
    try {
      await api.patch(`/api/tasks/${t.id}`, { status: "open", snooze_days: days })
      setFlash(`Snoozed ${days} day${days === 1 ? "" : "s"} — this task returns to the top of the queue then.`)
      setTimeout(() => setFlash(null), 4000)
      load()
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : "Action failed")
      setTimeout(() => setFlash(null), 4000)
    } finally {
      setBusyId(null)
    }
  }

  const assign = async (t: Task) => {
    const name = window.prompt("Assign this handoff to (name or role):", t.assigned_to ?? "office manager")
    if (!name) return
    setBusyId(t.id)
    try {
      await api.patch(`/api/tasks/${t.id}`, { status: "open", assigned_to: name })
      setFlash(`Assigned to ${name}.`)
      setTimeout(() => setFlash(null), 4000)
      load()
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : "Action failed")
      setTimeout(() => setFlash(null), 4000)
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <ErrorState message={`Tasks failed to load: ${error}`} />
  if (!items) return <Loading label="Loading owner tasks" />

  const open = items.filter((t) => t.status === "open")
  const closed = items.filter((t) => t.status !== "open")
  const openValue = open.reduce((s, t) => s + t.estimated_value, 0)

  return (
    <div className="space-y-5">
      <div>
        <SectionIndex index="—">Human handoff</SectionIndex>
        <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">Owner tasks.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
          VÉRIA never acts on its own judgment alone: anything personal, sensitive, or high-stakes is handed to the owner.
        </p>
      </div>

      {flash ? (
        <div className="border-l-2 border-brass-500 bg-brass-950/40 px-4 py-2.5 text-sm text-brass-200">{flash}</div>
      ) : null}

      <div className="grid grid-cols-3 gap-px overflow-hidden border border-ink-800 bg-ink-800">
        <div className="bg-ink-900 p-4">
          <div className="label">Open tasks</div>
          <div className="metric-display mt-1.5 text-3xl leading-none text-mist-50">{open.length}</div>
        </div>
        <div className="bg-ink-900 p-4">
          <div className="label">Value in your hands</div>
          <div className="metric-display mt-1.5 text-3xl leading-none text-brass-300">{usd(openValue)}</div>
        </div>
        <div className="bg-ink-900 p-4">
          <div className="label">High priority</div>
          <div className="metric-display mt-1.5 text-3xl leading-none text-red-300">{open.filter((t) => t.priority === "high").length}</div>
        </div>
      </div>

      <Section title="Open" subtitle="Owner action required — ranked by priority, then due date">
        {open.length === 0 ? (
          <EmptyState icon="✓" title="No open tasks" body="Nothing needs the owner right now. New handoffs appear here." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {open.map((t) => {
              const overdue = t.due_at && new Date(t.due_at.replace(" ", "T") + "Z").getTime() < Date.now()
              return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`chip ${t.priority === "high" ? "border-red-900/50 bg-red-950/60 text-red-300" : "border-ink-700 bg-ink-850 text-mist-300"}`}>
                        {t.priority}
                      </span>
                      <span className="text-sm font-semibold text-mist-50">{t.title}</span>
                    </div>
                    <div className="mt-1 max-w-2xl text-xs leading-relaxed text-mist-400">{t.reason}</div>
                    {t.recommended_action ? (
                      <div className="mt-1.5 border-l border-brass-500/60 pl-2.5 text-xs">
                        <span className="text-mist-400">Recommended: </span>
                        <span className="font-semibold text-brass-300">{t.recommended_action}</span>
                      </div>
                    ) : null}
                    {t.assigned_to ? <div className="mt-0.5 text-[11px] text-mist-400">Assigned to: <span className="text-mist-200">{t.assigned_to}</span></div> : null}
                    {t.lead_id ? (
                      <button className="mt-1 text-xs text-mist-400 underline-offset-2 hover:text-brass-300 hover:underline" onClick={() => nav(`/leads/${t.lead_id}`)}>
                        View customer →
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="metric-display text-lg text-mist-50">{usd(t.estimated_value)}</div>
                      <div className={`text-[10px] ${overdue ? "font-semibold text-red-300" : "text-mist-400"}`}>
                        {t.due_at ? untilTime(t.due_at) : "no deadline"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {t.lead_phone ? (
                        <a className="btn-primary px-2.5 py-1.5 text-[11px]" href={`tel:${t.lead_phone.replace(/[^+\d]/g, "")}`}>
                          ☏ CALL
                        </a>
                      ) : (
                        <button className="btn-primary px-2.5 py-1.5 text-[11px]" disabled={busyId === t.id} onClick={() => setTaskStatus(t, "completed")}>
                          ✓ Complete
                        </button>
                      )}
                      <button className="btn-secondary px-2.5 py-1.5 text-[11px]" disabled={busyId === t.id} onClick={() => setTaskStatus(t, "completed")}>
                        ✓ Mark complete
                      </button>
                      <button
                        className="btn-ghost px-2 py-1.5 text-[11px]"
                        disabled={busyId === t.id}
                        onClick={() => snooze(t, Number(window.prompt("Snooze for how many days?", "2") ?? 0) || 0)}
                      >
                        ⏾ Snooze
                      </button>
                      <button className="btn-ghost px-2 py-1.5 text-[11px]" disabled={busyId === t.id} onClick={() => assign(t)}>
                        → Assign
                      </button>
                    </div>
                    <button className="btn-ghost px-2 py-1.5 text-[10px] text-mist-500" disabled={busyId === t.id} onClick={() => setTaskStatus(t, "dismissed")}>
                      Dismiss
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="Completed / dismissed" subtitle="Handoff history">
        {closed.length === 0 ? (
          <EmptyState title="No history yet" body="Completed and dismissed tasks appear here." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {closed.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-mist-100">{t.title}</span>
                  <span className={`ml-2 text-xs ${t.status === "completed" ? "text-emerald-300/80" : "text-mist-400"}`}>{t.status}</span>
                </div>
                <button className="btn-ghost shrink-0 px-2 py-1 text-xs" disabled={busyId === t.id} onClick={() => setTaskStatus(t, "open")}>
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
