import React, { useEffect, useRef, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { Section } from "../ui"
import { SectionIndex } from "../brand"
import { invalidateSettings } from "../use-settings"

interface MappingPreview {
  kind: string
  filename: string
  headers: string[]
  row_count: number
  suggested_mapping: Record<string, string>
  sample: { values: Record<string, string>; ignored: Record<string, string> }[]
}

interface CommitResult {
  row_count: number
  imported: number
  skipped: number
  duplicates: number
  duplicate_rule: string
  errors: string[]
}

const WORKSPACE_LABEL: Record<string, string> = {
  demo: "Illustrative demo data",
  prospect: "Imported prospect data",
  customer: "Customer data"
}

const KINDS: { key: string; label: string; hint: string }[] = [
  { key: "leads", label: "Leads", hint: "Name, phone, service, status, value" },
  { key: "calls", label: "Calls", hint: "Caller name/number, date, handled flag" },
  { key: "quotes", label: "Quotes / estimates", hint: "Customer, amount, quote date, status" },
  { key: "customers", label: "Customers", hint: "Name, contact, last service, lifetime value" }
]

const FIELD_LABELS: Record<string, string> = {
  ignore: "— ignore —",
  name: "Name",
  customer_name: "Customer name",
  phone: "Phone",
  email: "Email",
  service: "Service / request",
  job_type: "Job type",
  source: "Source",
  status: "Status",
  urgency: "Urgency",
  value: "Job value",
  quote_amount: "Quote amount",
  quote_status: "Quote status",
  created_at: "Enquiry date",
  quote_date: "Quote date",
  last_contact: "Last contact",
  last_service: "Last service",
  notes: "Notes"
}

const FIELD_ORDER = Object.keys(FIELD_LABELS)

export default function Prospect() {
  const [kind, setKind] = useState("leads")
  const [csv, setCsv] = useState<string | null>(null)
  const [filename, setFilename] = useState("")
  const [preview, setPreview] = useState<MappingPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [startNote, setStartNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Workspace state drives step 0: demo workspaces must be switched to a clean
  // prospect workspace before importing (keeps demo and prospect data separate).
  useEffect(() => {
    api
      .get<{ workspace_kind: string }>("/api/workspace")
      .then((w) => setWorkspace(w.workspace_kind))
      .catch(() => setWorkspace("demo"))
    api
      .get<{ workspace_kind?: string; company: { name: string } | null }>("/api/settings")
      .then((s) => {
        // Step 0's input must start BLANK in a demo workspace: a prospect
        // workspace can never inherit the fictional demo company name (spec §3).
        if (s.workspace_kind && s.workspace_kind !== "demo") setCompanyName(s.company?.name ?? "")
      })
      .catch(() => undefined)
  }, [])

  const startProspect = async () => {
    setBusy("start")
    setError(null)
    setStartNote(null)
    try {
      const res = await api.post<{ workspace_kind: string; company_name: string }>("/api/prospect/start", {
        company_name: companyName || undefined
      })
      setWorkspace(res.workspace_kind)
      setCompanyName(res.company_name)
      invalidateSettings()
      setStartNote(
        `Prospect workspace ready for “${res.company_name}”. The synthetic demo data has been cleared and demo reset is now locked for this workspace, so imported prospect data cannot be wiped.`
      )
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the prospect workspace")
    } finally {
      setBusy(null)
    }
  }

  const renameCompany = async (name: string) => {
    setCompanyName(name)
    try {
      await api.patch("/api/settings", { company_name: name })
      invalidateSettings()
    } catch {
      /* rename is applied on next successful save */
    }
  }

  const analyze = async (rawCsv: string, fname: string, k: string) => {
    setBusy("preview")
    setError(null)
    setResult(null)
    try {
      const res = await api.post<MappingPreview>("/api/imports/preview", { kind: k, filename: fname, csv: rawCsv })
      setPreview(res)
      setMapping(res.suggested_mapping)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not read that CSV")
      setPreview(null)
    } finally {
      setBusy(null)
    }
  }

  const onFile = (f: File | null) => {
    if (!f) return
    setFilename(f.name)
    setPreview(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? "")
      setCsv(text)
      analyze(text, f.name, kind)
    }
    reader.readAsText(f)
  }

  const commit = async () => {
    if (!csv || !preview) return
    setBusy("commit")
    setError(null)
    try {
      const res = await api.post<CommitResult>("/api/imports/commit", {
        kind,
        filename: preview.filename,
        csv,
        mapping
      })
      // No row is ever silently discarded: read / imported / duplicates /
      // rejected-with-reasons are all reported.
      setResult(res)
      setPreview(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import failed")
    } finally {
      setBusy(null)
    }
  }

  const resetAll = () => {
    setCsv(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const rejected = result ? Math.max(0, result.row_count - result.imported - result.duplicates) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionIndex index="—">Prospect mode</SectionIndex>
          <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">Your free revenue recovery audit.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
            Upload the exports you already have — a leads list, call log, quotes, customers. VÉRIA maps the columns,
            analyzes the data and shows where revenue is leaking. CSV first; no integrations needed.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <span
            className={`chip ${
              workspace === "prospect"
                ? "border-brass-600/50 bg-brass-950/70 text-brass-300"
                : "border-ink-700 bg-ink-850 text-mist-400"
            }`}
          >
            {WORKSPACE_LABEL[workspace ?? "demo"]}
          </span>
          <span className="text-[11px] text-mist-500">Imported data stays in this environment</span>
        </div>
      </div>

      {/* Step 0: enter a clean prospect workspace (demo and prospect stay separate) */}
      {workspace === "demo" ? (
        <Section
          title="0 · Start a prospect workspace"
          subtitle="Demo and prospect data stay in separate modes — start a clean workspace for this company's real data"
        >
          <div className="space-y-3 px-4 py-4 sm:px-5">
            <p className="max-w-2xl text-xs leading-relaxed text-mist-400">
              This environment currently holds the <strong className="text-mist-200">synthetic demo dataset</strong>. Starting a prospect
              workspace clears that demo data (it can be restored with a demo reset later, from a demo workspace), removes the fictional
              demo company identity, and locks demo reset — so imported prospect data can never be wiped by a demo reset.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="label">Prospect company name (shown on the audit)</span>
                <input
                  className="input mt-1.5 w-72 px-3 py-2 text-sm"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Reliable Air & Heat"
                  maxLength={120}
                />
              </label>
              <button className="btn-primary px-4 py-2 text-sm" onClick={startProspect} disabled={busy === "start"}>
                {busy === "start" ? "Starting…" : "Start prospect workspace →"}
              </button>
            </div>
          </div>
        </Section>
      ) : null}

      {startNote ? (
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{startNote}</div>
      ) : null}

      {workspace === "prospect" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2.5 text-xs text-mist-300">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brass-400">Audit company</span>
          <input
            className="input w-64 px-2 py-1 text-xs"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onBlur={() => companyName.trim() && renameCompany(companyName)}
            maxLength={120}
          />
          <span className="text-mist-500">— appears on the Revenue Recovery Audit document.</span>
        </div>
      ) : null}

      {/* Step 1: what are we importing */}
      <Section title="1 · What are you importing?" subtitle="Pick the kind of data, then upload a CSV export">
        <div className="grid gap-2 px-4 py-4 sm:grid-cols-4 sm:px-5">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => {
                setKind(k.key)
                resetAll()
              }}
              className={`rounded-lg border px-3 py-3 text-left transition ${
                kind === k.key ? "border-brass-500 bg-brass-500/10" : "border-ink-700 bg-ink-850 hover:border-ink-500"
              }`}
            >
              <div className={`text-sm font-bold ${kind === k.key ? "text-brass-300" : "text-mist-100"}`}>{k.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-mist-400">{k.hint}</div>
            </button>
          ))}
        </div>
        <div className="border-t border-ink-800 px-4 py-4 sm:px-5">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <button
            className="btn-primary px-5 py-2.5 text-sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy === "preview" || workspace === "demo"}
          >
            {busy === "preview" ? "Analyzing…" : "⬆ Upload CSV"}
          </button>
          {filename && !result ? <span className="ml-3 text-xs text-mist-400">{filename}</span> : null}
          <span className="ml-3 text-[11px] text-mist-500">
            {workspace === "demo"
              ? "Start the prospect workspace (step 0) first — demo and prospect data stay separate."
              : "Headers are auto-mapped; you can fix them next."}
          </span>
        </div>
      </Section>

      {error ? <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div> : null}
      {result ? (
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3.5 text-sm text-emerald-200">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
            <span>
              <strong className="metric-display text-base text-emerald-100">{result.row_count}</strong> rows read
            </span>
            <span>
              <strong className="metric-display text-base text-emerald-100">{result.imported}</strong> imported
            </span>
            <span>
              <strong className="metric-display text-base text-emerald-100">{result.duplicates}</strong> duplicates skipped{" "}
              <span className="text-[11px] text-emerald-400/80">(rule: {result.duplicate_rule})</span>
            </span>
            <span>
              <strong className="metric-display text-base text-emerald-100">{rejected}</strong> rejected
            </span>
          </div>
          {result.errors.length > 0 ? (
            <ul className="mt-2 space-y-0.5 border-t border-emerald-900/40 pt-2 text-[11px] text-emerald-300/90">
              {result.errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 text-[11px] text-emerald-400/90">
            No row was silently discarded. Run a sync on the Recovery Pipeline to materialize opportunities from this data.{" "}
            <button className="font-semibold underline underline-offset-2" onClick={() => nav("/audit")}>
              View the audit →
            </button>{" "}
            <button className="font-semibold underline underline-offset-2" onClick={() => nav("/opportunities")}>
              Open the pipeline →
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 2: mapping */}
      {preview ? (
        <Section
          title="2 · Map the columns"
          subtitle={`${preview.row_count} data rows detected. Suggested mapping below — adjust any column.`}
          actions={
            <div className="flex gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={resetAll}>
                Start over
              </button>
              <button className="btn-primary px-4 py-1.5 text-xs" onClick={commit} disabled={busy === "commit"}>
                {busy === "commit" ? "Importing…" : "Import & analyze →"}
              </button>
            </div>
          }
        >
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
            {preview.headers.map((h) => (
              <div key={h} className="rounded-lg border border-ink-800 bg-ink-850 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-mist-100">{h}</span>
                  <select
                    className="input w-40 px-2 py-1 text-[11px]"
                    value={mapping[h] ?? "ignore"}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [h]: e.target.value }))}
                  >
                    {FIELD_ORDER.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-1.5 truncate text-[11px] text-mist-400">
                  {preview.sample[0]?.values[preview.suggested_mapping[h] ?? ""] ?? preview.sample[0]?.ignored[h] ?? "—"}
                </div>
              </div>
            ))}
          </div>
          {preview.sample.length > 0 ? (
            <div className="border-t border-ink-800 px-4 py-3 sm:px-5">
              <div className="label">Row preview</div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <tbody>
                    {preview.sample.slice(0, 3).map((s, i) => (
                      <tr key={i}>
                        {preview.headers.map((h) => {
                          const target = mapping[h] ?? "ignore"
                          return (
                            <td key={h} className={`max-w-[160px] truncate border-t border-ink-800 px-2 py-1.5 ${target === "ignore" ? "text-mist-500" : "text-mist-200"}`}>
                              {s.values[target] ?? s.ignored[h] ?? "—"}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* What happens next */}
      <Section title="What happens after import">
        <ol className="grid gap-px overflow-hidden bg-ink-800 px-0 text-sm text-mist-300 sm:grid-cols-4">
          {[
            "VÉRIA classifies every row: missed enquiries, slow responses, unworked leads, unfollowed quotes, dormant customers.",
            "The Revenue Recovery Audit regenerates from your imported data.",
            "Recovery opportunities appear in a prioritized pipeline with a recommended action each.",
            "You decide what's worth recovering — and only real outcomes count as recovered revenue."
          ].map((t, i) => (
            <li key={i} className="bg-ink-900 px-4 py-4">
              <span className="font-display text-2xl italic text-brass-400">0{i + 1}</span>
              <p className="mt-1.5 text-xs leading-relaxed">{t}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
