import React, { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd, relTime, untilTime, dateTime, STATUS_LABELS, SOURCE_LABELS, URGENCY_LABELS } from "../format"
import { StatusChip, UrgencyChip, ScoreBadge, Loading, ErrorState, Modal, SimulatedTag } from "../ui"

interface ScoreLine {
  label: string
  points: number
  detail: string
}
interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  service: string | null
  status: string
  source: string
  urgency: string
  estimated_value: number
  notes: string | null
  next_action: string | null
  next_action_at: string | null
  last_activity_at: string | null
  recovered_via: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
  opportunity_score?: number
  score_lines?: ScoreLine[]
}
interface Followup {
  id: string
  kind: string
  status: string
  due_at: string | null
  recommended_action: string | null
  outcome: string | null
}

const WORKFLOW = ["new", "contacted", "qualified", "appointment_booked", "estimate_sent", "won"]
const WORKFLOW_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  appointment_booked: "Appointment",
  estimate_sent: "Estimate",
  won: "Won"
}

function stageIndex(status: string): number {
  if (status === "lost" || status === "unqualified") return -1
  if (status === "appointment_requested") return 2.5
  const i = WORKFLOW.indexOf(status)
  return i
}

export default function LeadDetail({ id }: { id: string }) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [followups, setFollowups] = useState<Followup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showFollowup, setShowFollowup] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([api.get<Lead>(`/api/leads/${id}`), api.get<{ items?: Followup[] }>(`/api/followups?status=all`)])
      .then(([l, f]) => {
        setLead(l)
        setFollowups((f.items ?? (f as any) ?? []).filter((x: any) => x.lead_id === id))
        setError(null)
      })
      .catch((e) => setError(e.message))
  }, [id])

  useEffect(load, [load])

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true)
    try {
      await fn()
      setFlash(message)
      setTimeout(() => setFlash(null), 3500)
      load()
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={`Lead failed to load: ${error}`} />
  if (!lead) return <Loading label="Loading lead" />

  const idx = stageIndex(lead.status)
  const closed = ["won", "lost", "unqualified"].includes(lead.status)

  return (
    <div className="space-y-4">
      <button className="btn-ghost -ml-2 px-2 py-1 text-xs" onClick={() => nav("/leads")}>
        ← All leads
      </button>

      {flash ? (
        <div className="rounded-lg border border-brass-600/50 bg-brass-950/30 px-4 py-2.5 text-sm text-brass-200">{flash}</div>
      ) : null}

      {/* Header */}
      <div className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-mist-50 sm:text-2xl">{lead.name}</h1>
              <StatusChip status={lead.status} />
              <UrgencyChip urgency={lead.urgency} />
            </div>
            <div className="mt-1.5 text-sm text-mist-300">
              {lead.service ?? "Service not specified"} · via {SOURCE_LABELS[lead.source] ?? lead.source}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist-400">
              {lead.phone ? <span>☏ {lead.phone}</span> : null}
              {lead.email ? <span>✉ {lead.email}</span> : null}
              <span>Created {relTime(lead.created_at)}</span>
              <span>Last activity {relTime(lead.last_activity_at)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums text-mist-50 sm:text-3xl">{usd(lead.estimated_value)}</div>
              <div className="text-[11px] uppercase tracking-wider text-mist-400">Estimated value</div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setShowEdit(true)}>Edit</button>
              <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setShowStatus(true)}>Status</button>
            </div>
          </div>
        </div>

        {/* Workflow stepper */}
        <div className="mt-5 overflow-x-auto pb-1">
          <ol className="flex min-w-[540px] items-center gap-1">
            {WORKFLOW.map((s, i) => {
              const done = idx >= 0 && i < idx
              const current = idx >= 0 && i === idx
              return (
                <li key={s} className="flex flex-1 items-center gap-1">
                  <div
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap ${
                      current
                        ? "bg-brass-500/15 text-brass-300 shadow-[inset_0_0_0_1px_rgba(201,163,95,0.4)]"
                        : done
                          ? "text-emerald-300/90"
                          : "text-mist-400"
                    }`}
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${current ? "bg-brass-400" : done ? "bg-emerald-400" : "bg-ink-500"}`} />
                    {WORKFLOW_LABELS[s]}
                  </div>
                  {i < WORKFLOW.length - 1 ? <div className={`h-px flex-1 ${done ? "bg-emerald-800" : "bg-ink-700"}`} /> : null}
                </li>
              )
            })}
            {closed && lead.status !== "won" ? (
              <li className="ml-2 rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1.5 text-[11px] font-semibold text-red-300">
                {STATUS_LABELS[lead.status]}{lead.lost_reason ? ` — ${lead.lost_reason}` : ""}
              </li>
            ) : null}
          </ol>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: value + score */}
        <div className="space-y-4 lg:col-span-2">
          {/* Opportunity score */}
          <div className="card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-mist-100">Opportunity Score</h2>
                <p className="mt-0.5 text-xs text-mist-400">
                  Transparent, rule-based estimate of how likely this lead turns into revenue if acted on soon.
                </p>
              </div>
              <ScoreBadge score={lead.opportunity_score ?? 0} size="lg" />
            </div>
            <div className="mt-4 space-y-1.5">
              {(lead.score_lines ?? []).map((line) => (
                <div key={line.label} className="flex items-center justify-between gap-3 rounded-lg bg-ink-850 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-mist-200">{line.label}</div>
                    <div className="truncate text-[11px] text-mist-400">{line.detail}</div>
                  </div>
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${line.points > 0 ? "text-brass-300" : "text-mist-400"}`}>
                    +{line.points}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Next action */}
          <div className="card p-4 sm:p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-mist-100">Next action</h2>
            {lead.next_action ? (
              <div className="mt-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-3">
                <div className="text-sm text-mist-100">{lead.next_action}</div>
                {lead.next_action_at ? (
                  <div className={`mt-1 text-xs ${new Date(lead.next_action_at.replace(" ", "T") + "Z").getTime() < Date.now() ? "font-semibold text-red-300" : "text-mist-400"}`}>
                    {untilTime(lead.next_action_at)} · {dateTime(lead.next_action_at)}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-mist-400">No next action scheduled. Pick one below — momentum is what converts.</p>
            )}
            {lead.notes ? (
              <div className="mt-3">
                <div className="label">Notes</div>
                <p className="mt-1 text-sm leading-relaxed text-mist-300">{lead.notes}</p>
              </div>
            ) : null}
          </div>

          {/* Follow-ups for this lead */}
          <div className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-ink-800 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-mist-100">Follow-ups</h2>
              <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setShowFollowup(true)}>+ Schedule</button>
            </header>
            {followups.length === 0 ? (
              <p className="px-4 py-5 text-sm text-mist-400 sm:px-5">No follow-ups yet. Estimates and scheduled actions appear here.</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {followups.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="chip border-ink-600 bg-ink-850 text-mist-300">{f.kind.replace(/_/g, " ")}</span>
                        {f.status === "pending" ? (
                          <span className={`text-xs ${f.due_at && new Date(f.due_at.replace(" ", "T") + "Z").getTime() < Date.now() ? "font-semibold text-red-300" : "text-mist-400"}`}>
                            {untilTime(f.due_at)}
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-300/80">completed{f.outcome ? ` — ${f.outcome}` : ""}</span>
                        )}
                      </div>
                      {f.recommended_action ? <div className="mt-1 text-xs text-mist-300">{f.recommended_action}</div> : null}
                    </div>
                    {f.status === "pending" ? (
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          className="btn-secondary px-2 py-1 text-[11px]"
                          disabled={busy}
                          onClick={() => act(() => api.post(`/api/followups/${f.id}/complete`, { outcome: "completed" }), "Follow-up marked complete.")}
                        >
                          Done
                        </button>
                        <button
                          className="btn-primary px-2 py-1 text-[11px]"
                          disabled={busy}
                          onClick={() => act(() => api.post(`/api/followups/${f.id}/complete`, { outcome: "recovered" }), `Marked recovered — ${usd(lead.estimated_value)} won.`)}
                        >
                          Recovered
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: demo-safe actions */}
        <div className="space-y-4">
          <div className="card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-mist-100">Recovery actions</h2>
              <SimulatedTag>Demo</SimulatedTag>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-mist-400">
              Demo mode: actions update the workflow and audit trail. Nothing is sent to real customers.
            </p>
            <div className="mt-3 space-y-2">
              <button
                className="btn-secondary w-full justify-start"
                disabled={busy}
                onClick={() => act(() => api.post(`/api/leads/${lead.id}/activity`, { action: "log_call" }), "Call logged (simulated) — lead activity updated.")}
              >
                ☏ Log call placed
              </button>
              <button
                className="btn-secondary w-full justify-start"
                disabled={busy}
                onClick={() => act(() => api.post(`/api/leads/${lead.id}/activity`, { action: "schedule_followup", days: 2 }), "Follow-up scheduled in 2 days.")}
              >
                ↻ Schedule follow-up (2 days)
              </button>
              <button
                className="btn-secondary w-full justify-start"
                disabled={busy || lead.status === "estimate_sent" || closed}
                onClick={() => act(() => api.post(`/api/leads/${lead.id}/activity`, { action: "send_estimate" }), `Estimate for ${usd(lead.estimated_value || 4800)} recorded; follow-up auto-scheduled.`)}
              >
                ◌ Record estimate sent
              </button>
            </div>
            <div className="mt-4 border-t border-ink-800 pt-3">
              <div className="label mb-2">Close out</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-primary text-xs"
                  disabled={busy || closed}
                  onClick={() => act(() => api.patch(`/api/leads/${lead.id}`, { status: "won" }), `${usd(lead.estimated_value)} marked won — recovery complete.`)}
                >
                  ✓ Mark won
                </button>
                <button
                  className="btn-danger text-xs"
                  disabled={busy || closed}
                  onClick={() => act(() => api.patch(`/api/leads/${lead.id}`, { status: "lost" }), "Lead marked lost.")}
                >
                  ✕ Mark lost
                </button>
              </div>
            </div>
          </div>

          {/* Value info */}
          <div className="card p-4 sm:p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-mist-100">Revenue context</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-mist-400">Estimated value</dt>
                <dd className="font-bold tabular-nums text-mist-50">{usd(lead.estimated_value)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mist-400">Status</dt>
                <dd><StatusChip status={lead.status} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mist-400">Recovered via</dt>
                <dd className="text-mist-200">{lead.recovered_via ? lead.recovered_via.replace(/_/g, " ") : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mist-400">Created</dt>
                <dd className="tabular-nums text-mist-200">{dateTime(lead.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mist-400">Updated</dt>
                <dd className="tabular-nums text-mist-200">{relTime(lead.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <EditLeadModal
        open={showEdit}
        lead={lead}
        onClose={() => setShowEdit(false)}
        onSaved={(msg) => {
          setShowEdit(false)
          setFlash(msg)
          setTimeout(() => setFlash(null), 3500)
          load()
        }}
      />

      {/* Status modal */}
      <StatusModal
        open={showStatus}
        lead={lead}
        onClose={() => setShowStatus(false)}
        onSaved={(msg) => {
          setShowStatus(false)
          setFlash(msg)
          setTimeout(() => setFlash(null), 3500)
          load()
        }}
      />

      {/* Schedule follow-up modal */}
      <ScheduleFollowupModal
        open={showFollowup}
        lead={lead}
        onClose={() => setShowFollowup(false)}
        onSaved={(msg) => {
          setShowFollowup(false)
          setFlash(msg)
          setTimeout(() => setFlash(null), 3500)
          load()
        }}
      />
    </div>
  )
}

function EditLeadModal({ open, lead, onClose, onSaved }: { open: boolean; lead: Lead; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ name: lead.name, phone: lead.phone ?? "", email: lead.email ?? "", service: lead.service ?? "", estimated_value: String(lead.estimated_value), urgency: lead.urgency, source: lead.source, notes: lead.notes ?? "", next_action: lead.next_action ?? "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm({ name: lead.name, phone: lead.phone ?? "", email: lead.email ?? "", service: lead.service ?? "", estimated_value: String(lead.estimated_value), urgency: lead.urgency, source: lead.source, notes: lead.notes ?? "", next_action: lead.next_action ?? "" })
  }, [lead, open])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/api/leads/${lead.id}`, {
        name: form.name,
        phone: form.phone,
        email: form.email,
        service: form.service,
        estimated_value: form.estimated_value === "" ? 0 : Number(form.estimated_value),
        urgency: form.urgency,
        source: form.source,
        notes: form.notes,
        next_action: form.next_action
      })
      onSaved("Lead updated.")
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Lead" wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block">Name</label>
            <input className="input" value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className="label mb-1 block">Phone</label>
            <input className="input" value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <label className="label mb-1 block">Email</label>
            <input className="input" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="label mb-1 block">Service</label>
            <input className="input" value={form.service} onChange={set("service")} />
          </div>
          <div>
            <label className="label mb-1 block">Estimated value ($)</label>
            <input className="input" inputMode="numeric" value={form.estimated_value} onChange={set("estimated_value")} />
          </div>
          <div>
            <label className="label mb-1 block">Next action</label>
            <input className="input" value={form.next_action} onChange={set("next_action")} />
          </div>
          <div>
            <label className="label mb-1 block">Urgency</label>
            <select className="input" value={form.urgency} onChange={set("urgency")}>
              {Object.keys(URGENCY_LABELS).map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Source</label>
            <select className="input" value={form.source} onChange={set("source")}>
              {Object.keys(SOURCE_LABELS).map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label mb-1 block">Notes</label>
          <textarea className="input min-h-[80px]" value={form.notes} onChange={set("notes")} />
        </div>
        {error ? <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </Modal>
  )
}

function StatusModal({ open, lead, onClose, onSaved }: { open: boolean; lead: Lead; onClose: () => void; onSaved: (msg: string) => void }) {
  const [status, setStatus] = useState(lead.status)
  const [lostReason, setLostReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStatus(lead.status)
    setLostReason("")
  }, [lead, open])

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/api/leads/${lead.id}`, { status, lost_reason: status === "lost" ? lostReason || undefined : undefined })
      onSaved(`Status updated to ${STATUS_LABELS[status] ?? status}.`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update status")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Status">
      <div className="space-y-3">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.keys(STATUS_LABELS).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {status === "lost" ? (
          <input className="input" placeholder="Reason (e.g. price, timing)" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
        ) : null}
        {error ? <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Update status"}</button>
        </div>
      </div>
    </Modal>
  )
}

function ScheduleFollowupModal({ open, lead, onClose, onSaved }: { open: boolean; lead: Lead; onClose: () => void; onSaved: (msg: string) => void }) {
  const [days, setDays] = useState("2")
  const [action, setAction] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.post(`/api/leads/${lead.id}/activity`, {
        action: "schedule_followup",
        days: Number(days) || 2,
        next_action: action || undefined
      })
      onSaved("Follow-up scheduled.")
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to schedule")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule Follow-up">
      <div className="space-y-3">
        <div>
          <label className="label mb-1 block">In how many days?</label>
          <input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div>
          <label className="label mb-1 block">What should happen</label>
          <input className="input" placeholder={`e.g. Call ${lead.name} about the estimate`} value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        {error ? <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? "Scheduling…" : "Schedule"}</button>
        </div>
      </div>
    </Modal>
  )
}
