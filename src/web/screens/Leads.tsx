import React, { useCallback, useEffect, useMemo, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { usd, relTime, STATUS_LABELS, SOURCE_LABELS, URGENCY_LABELS } from "../format"
import { StatusChip, UrgencyChip, Loading, ErrorState, EmptyState, Modal, SimulatedTag } from "../ui"

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
  next_action: string | null
  next_action_at: string | null
  last_activity_at: string | null
  created_at: string
}

const STATUSES = Object.keys(STATUS_LABELS)
const SOURCES = Object.keys(SOURCE_LABELS)
const URGENCIES = Object.keys(URGENCY_LABELS)

export default function Leads() {
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("")
  const [source, setSource] = useState("")
  const [urgency, setUrgency] = useState("")
  const [sort, setSort] = useState("created_at")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ leads: Lead[]; total: number; pageCount: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (status) p.set("status", status)
    if (source) p.set("source", source)
    if (urgency) p.set("urgency", urgency)
    p.set("sort", sort)
    p.set("order", order)
    p.set("page", String(page))
    p.set("pageSize", "25")
    return p.toString()
  }, [q, status, source, urgency, sort, order, page])

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ leads: Lead[]; total: number; pageCount: number }>(`/api/leads?${params}`)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [params])

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  useEffect(() => setPage(1), [q, status, source, urgency])

  const setSortKey = (key: string) => {
    if (sort === key) setOrder(order === "asc" ? "desc" : "asc")
    else {
      setSort(key)
      setOrder(key === "name" ? "asc" : "desc")
    }
  }

  const hasFilters = !!(q || status || source || urgency)
  const total = data?.total ?? 0
  const pageCount = data?.pageCount ?? 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-mist-50 sm:text-2xl">Leads</h1>
          <p className="mt-1 text-sm text-mist-400">
            {total} lead{total === 1 ? "" : "s"} · every one is recoverable revenue until it’s closed
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + New Lead
        </button>
      </div>

      {/* Filters */}
      <div className="card space-y-3 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="input lg:col-span-2"
            placeholder="Search name, phone, service, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search leads"
          />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select className="input" value={urgency} onChange={(e) => setUrgency(e.target.value)} aria-label="Filter by urgency">
            <option value="">All urgency</option>
            {URGENCIES.map((u) => (
              <option key={u} value={u}>{URGENCY_LABELS[u]}</option>
            ))}
          </select>
          <select className="input sm:col-span-2 lg:col-span-2" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
            ))}
          </select>
          {hasFilters ? (
            <button
              className="btn-ghost sm:col-span-2 lg:col-span-2"
              onClick={() => {
                setQ(""); setStatus(""); setSource(""); setUrgency("")
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {error ? <ErrorState message={`Leads failed to load: ${error}`} /> : null}

      {/* Desktop table */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-mist-400">
              {[
                ["name", "Lead"],
                ["status", "Status"],
                ["urgency", "Urgency"],
                ["estimated_value", "Value"],
                ["next_action_at", "Next action"],
                ["last_activity_at", "Last activity"]
              ].map(([key, label]) => (
                <th key={key} className="px-4 py-3 font-semibold">
                  <button className="inline-flex items-center gap-1 hover:text-mist-200" onClick={() => setSortKey(key)}>
                    {label}
                    {sort === key ? <span className="text-brass-400">{order === "asc" ? "↑" : "↓"}</span> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr><td colSpan={6}><Loading /></td></tr>
            ) : data && data.leads.length === 0 ? (
              <tr><td colSpan={6}><EmptyState title="No leads match" body="Try clearing filters or searching a different term." /></td></tr>
            ) : (
              data?.leads.map((l) => (
                <tr key={l.id} className="table-row cursor-pointer" onClick={() => nav(`/leads/${l.id}`)}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-mist-50">{l.name}</div>
                    <div className="mt-0.5 text-xs text-mist-400">{l.service ?? "—"} · {SOURCE_LABELS[l.source] ?? l.source}</div>
                  </td>
                  <td className="px-4 py-3"><StatusChip status={l.status} /></td>
                  <td className="px-4 py-3"><UrgencyChip urgency={l.urgency} /></td>
                  <td className="px-4 py-3 font-bold tabular-nums text-mist-100">{usd(l.estimated_value)}</td>
                  <td className="px-4 py-3 text-xs text-mist-300">
                    {l.next_action ? <div className="max-w-[220px] truncate">{l.next_action}</div> : "—"}
                    {l.next_action_at ? <div className="mt-0.5 text-[11px] text-mist-400">{relTime(l.next_action_at)}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-mist-400">{relTime(l.last_activity_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {loading && !data ? (
          <div className="card"><Loading /></div>
        ) : data && data.leads.length === 0 ? (
          <div className="card"><EmptyState title="No leads match" body="Try clearing filters or searching a different term." /></div>
        ) : (
          data?.leads.map((l) => (
            <button key={l.id} className="card block w-full p-4 text-left active:bg-ink-850" onClick={() => nav(`/leads/${l.id}`)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-mist-50">{l.name}</div>
                  <div className="mt-0.5 truncate text-xs text-mist-400">{l.service ?? "—"}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold tabular-nums text-mist-100">{usd(l.estimated_value)}</div>
                  <div className="mt-0.5 text-[10px] text-mist-400">{relTime(l.last_activity_at)}</div>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <StatusChip status={l.status} />
                <UrgencyChip urgency={l.urgency} />
                <span className="chip border-ink-700 bg-ink-850 text-mist-400">{SOURCE_LABELS[l.source] ?? l.source}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > 25 ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-mist-400">
            Page {page} of {pageCount} · {total} leads
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Prev
            </button>
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
              Next →
            </button>
          </div>
        </div>
      ) : null}

      <NewLeadModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />
    </div>
  )
}

function NewLeadModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", service: "", estimated_value: "", urgency: "normal", source: "manual", notes: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.post("/api/leads", {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        service: form.service || undefined,
        estimated_value: form.estimated_value || 0,
        urgency: form.urgency,
        source: form.source,
        notes: form.notes || undefined
      })
      setForm({ name: "", phone: "", email: "", service: "", estimated_value: "", urgency: "normal", source: "manual", notes: "" })
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create lead")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Lead">
      <div className="space-y-3">
        <div>
          <label className="label mb-1 block">Name *</label>
          <input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Dana Whitmore" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1 block">Phone</label>
            <input className="input" value={form.phone} onChange={set("phone")} placeholder="(918) 555-0100" />
          </div>
          <div>
            <label className="label mb-1 block">Email</label>
            <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="optional" />
          </div>
        </div>
        <div>
          <label className="label mb-1 block">Service requested</label>
          <input className="input" value={form.service} onChange={set("service")} placeholder="e.g. Furnace replacement" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label mb-1 block">Est. value ($)</label>
            <input className="input" inputMode="numeric" value={form.estimated_value} onChange={set("estimated_value")} placeholder="4800" />
          </div>
          <div>
            <label className="label mb-1 block">Urgency</label>
            <select className="input" value={form.urgency} onChange={set("urgency")}>
              {URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Source</label>
            <select className="input" value={form.source} onChange={set("source")}>
              {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label mb-1 block">Notes</label>
          <textarea className="input min-h-[70px]" value={form.notes} onChange={set("notes")} placeholder="Context, access notes, prior history…" />
        </div>
        {error ? <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div> : null}
        <div className="flex items-center justify-between pt-1">
          <SimulatedTag>Demo environment</SimulatedTag>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : "Create Lead"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
