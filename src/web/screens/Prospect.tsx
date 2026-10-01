import React, { useRef, useState } from "react"
import { api, ApiError } from "../api"
import { nav } from "../App"
import { Section, SimulatedTag } from "../ui"
import { SectionIndex } from "../brand"

interface MappingPreview {
  kind: string
  filename: string
  headers: string[]
  row_count: number
  suggested_mapping: Record<string, string>
  sample: { values: Record<string, string>; ignored: Record<string, string> }[]
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
  const [done, setDone] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const analyze = async (rawCsv: string, fname: string, k: string) => {
    setBusy("preview")
    setError(null)
    setDone(null)
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
    setDone(null)
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
      const res = await api.post<{ imported: number; row_count: number; skipped: number; errors: string[] }>(
        "/api/imports/commit",
        {
          kind,
          filename: preview.filename,
          csv,
          mapping
        }
      )
      const skippedNote = res.skipped > 0 ? ` (${res.skipped} skipped)` : ""
      const errorLines = res.errors.length ? ` Skipped: ${res.errors.join(" · ")}` : ""
      setDone(
        `Imported ${res.imported} of ${res.row_count} rows${skippedNote}.${errorLines} Run a sync on the Recovery Pipeline to materialize opportunities from this data.`
      )
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
    setDone(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ""
  }

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
        <SimulatedTag>Imported data stays in this environment</SimulatedTag>
      </div>

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
          <button className="btn-primary px-5 py-2.5 text-sm" onClick={() => fileRef.current?.click()} disabled={busy === "preview"}>
            {busy === "preview" ? "Analyzing…" : "⬆ Upload CSV"}
          </button>
          {filename && !done ? <span className="ml-3 text-xs text-mist-400">{filename}</span> : null}
          <span className="ml-3 text-[11px] text-mist-500">Headers are auto-mapped; you can fix them next.</span>
        </div>
      </Section>

      {error ? <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div> : null}
      {done ? (
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {done}{" "}
          <button className="ml-2 font-semibold underline underline-offset-2" onClick={() => nav("/audit")}>
            View the audit →
          </button>{" "}
          <button className="ml-2 font-semibold underline underline-offset-2" onClick={() => nav("/opportunities")}>
            Open the pipeline →
          </button>
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
