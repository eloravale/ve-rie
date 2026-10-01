import React, { useEffect, useState } from "react"
import { api, ApiError } from "../api"
import { invalidateSettings, useSettings } from "../use-settings"
import { REGION_LABELS, formatDate, setActiveSettings, type Settings } from "../recovery-format"
import { ErrorState, Section } from "../ui"
import { SectionIndex } from "../brand"

const REGIONS = [
  { key: "us", label: "United States", preset: "USD · MM/DD/YYYY" },
  { key: "uk", label: "United Kingdom", preset: "GBP · DD/MM/YYYY" },
  { key: "eu", label: "Europe", preset: "EUR · DD/MM/YYYY" }
]

export default function Settings() {
  const current = useSettings()
  const [region, setRegion] = useState(current.region)
  const [currency, setCurrency] = useState(current.currency)
  const [dateFormat, setDateFormat] = useState(current.date_format)
  const [retention, setRetention] = useState(current.retention_days)
  const [dataSource, setDataSource] = useState(current.data_source ?? "")
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync local state once the cached settings resolve.
  useEffect(() => {
    setRegion(current.region)
    setCurrency(current.currency)
    setDateFormat(current.date_format)
    setRetention(current.retention_days)
    setDataSource(current.data_source ?? "")
  }, [current])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const saved = await api.patch<Settings>("/api/settings", {
        region,
        currency,
        date_format: dateFormat,
        retention_days: Number(retention) || 365,
        data_source: dataSource || null
      })
      invalidateSettings()
      setActiveSettings(saved)
      setFlash("Settings saved.")
      setTimeout(() => setFlash(null), 4000)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  const exportData = async () => {
    setBusy(true)
    try {
      const res = await api.get<{ exported_at: string; data: unknown }>("/api/export")
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `veria-data-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed")
    } finally {
      setBusy(false)
    }
  }

  const deleteAll = async () => {
    setBusy(true)
    try {
      await api.post("/api/data/delete")
      invalidateSettings()
      setFlash("All data deleted. Re-import or reset the demo to continue.")
      setConfirmDelete(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  if (error && !flash) return <ErrorState message={error} />

  const sampleTs = "2026-03-05 13:45:00"

  return (
    <div className="space-y-4">
      <div>
        <SectionIndex index="—">Configuration</SectionIndex>
        <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-mist-50 sm:text-4xl">Settings.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
          Region, currency and data controls. VÉRIA works for US, UK and EU businesses — no US-only assumptions.
        </p>
      </div>

      {flash ? <div className="rounded-lg border border-brass-600/50 bg-brass-950/30 px-4 py-2.5 text-sm text-brass-200">{flash}</div> : null}

      <Section title="Region & formatting" subtitle="Drives every money and date display in the product">
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div>
            <div className="label">Region</div>
            <div className="mt-2 grid gap-1.5">
              {REGIONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setRegion(r.key as typeof region)
                    setCurrency(r.key === "us" ? "USD" : r.key === "uk" ? "GBP" : "EUR")
                    setDateFormat(r.key === "us" ? "MDY" : "DMY")
                  }}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                    region === r.key ? "border-brass-500 bg-brass-500/10" : "border-ink-700 bg-ink-850 hover:border-ink-500"
                  }`}
                >
                  <span className={`text-sm font-semibold ${region === r.key ? "text-brass-300" : "text-mist-100"}`}>{r.label}</span>
                  <span className="text-[10px] text-mist-400">{r.preset}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="label">Currency</div>
              <select className="input mt-1" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>
                <option value="USD">USD — $</option>
                <option value="GBP">GBP — £</option>
                <option value="EUR">EUR — €</option>
              </select>
            </div>
            <div>
              <div className="label">Date format</div>
              <select className="input mt-1" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}>
                <option value="MDY">MM/DD/YYYY (US)</option>
                <option value="DMY">DD/MM/YYYY (UK/EU)</option>
              </select>
            </div>
            <div className="rounded-lg border border-ink-800 bg-ink-850 px-3 py-2 text-[11px] text-mist-400">
              Preview: <span className="font-semibold text-mist-100">{formatDate(sampleTs, dateFormat)}</span> · £/$/€ follow the currency setting
            </div>
          </div>
        </div>
        <div className="border-t border-ink-800 px-4 py-3 sm:px-5">
          <button className="btn-primary px-4 py-2 text-xs" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </Section>

      <Section title="Data & privacy" subtitle="Privacy controls designed for responsible customer-data handling">
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div>
            <div className="label">Data source label</div>
            <input className="input mt-1" value={dataSource} onChange={(e) => setDataSource(e.target.value)} placeholder="e.g. Imported from ServiceTitan export, Oct 2026" />
            <div className="mt-1 text-[10px] text-mist-400">Recorded with every import batch so numbers stay traceable to their origin.</div>
          </div>
          <div>
            <div className="label">Retention period (days)</div>
            <input
              className="input mt-1"
              type="number"
              min={30}
              max={3650}
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            />
            <div className="mt-1 text-[10px] text-mist-400">How long enquiry and customer data is kept before cleanup.</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 px-4 py-3 sm:px-5">
          <button className="btn-secondary px-3 py-2 text-xs" onClick={exportData} disabled={busy}>
            ⬇ Export all data (JSON)
          </button>
          {!confirmDelete ? (
            <button className="btn-danger px-3 py-2 text-xs" onClick={() => setConfirmDelete(true)}>
              Delete all data
            </button>
          ) : (
            <>
              <span className="text-xs font-semibold text-red-300">This permanently deletes all leads, quotes, enquiries and opportunities. Sure?</span>
              <button className="btn-danger px-3 py-2 text-xs" onClick={deleteAll} disabled={busy}>
                Yes, delete everything
              </button>
              <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          )}
          <span className="ml-auto text-[10px] text-mist-500">Region: {REGION_LABELS[region] ?? region}</span>
        </div>
      </Section>
    </div>
  )
}
