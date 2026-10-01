import React from "react"
import { getActiveSettings, type CurrencyCode } from "./recovery-format"
import { LoadingMark } from "./brand"

// ---------- Status / urgency / source chips ----------
// Hues resolve through the muted editorial palette in tailwind.config.js.

const STATUS_STYLES: Record<string, string> = {
  new: "border-sky-800/50 bg-sky-950/60 text-sky-300",
  contacted: "border-indigo-800/50 bg-indigo-950/60 text-indigo-300",
  qualified: "border-teal-800/50 bg-teal-950/60 text-teal-300",
  appointment_requested: "border-amber-800/50 bg-amber-950/60 text-amber-300",
  appointment_booked: "border-amber-700/50 bg-amber-950/80 text-amber-200",
  estimate_sent: "border-violet-800/50 bg-violet-950/60 text-violet-300",
  won: "border-emerald-800/50 bg-emerald-950/60 text-emerald-300",
  lost: "border-red-900/50 bg-red-950/60 text-red-300",
  unqualified: "border-ink-700 bg-ink-850 text-mist-400"
}

const URGENCY_STYLES: Record<string, string> = {
  urgent: "border-red-900/50 bg-red-950/70 text-red-300",
  high: "border-amber-800/50 bg-amber-950/60 text-amber-300",
  normal: "border-ink-700 bg-ink-850 text-mist-300",
  low: "border-ink-700 bg-ink-850 text-mist-400"
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${STATUS_STYLES[status] ?? "border-ink-700 bg-ink-850 text-mist-300"}`}>
      {status.replace(/_/g, " ")}
    </span>
  )
}

export function UrgencyChip({ urgency }: { urgency: string }) {
  return <span className={`chip ${URGENCY_STYLES[urgency] ?? URGENCY_STYLES.normal}`}>{urgency}</span>
}

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const color =
    score >= 75 ? "text-emerald-300 border-emerald-800/50 bg-emerald-950/60"
    : score >= 50 ? "text-brass-300 border-brass-600/50 bg-brass-950/70"
    : score > 0 ? "text-mist-200 border-ink-700 bg-ink-850"
    : "text-mist-400 border-ink-700 bg-ink-850"
  const pad = size === "lg" ? "px-3 py-1.5 text-base" : size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-sm border font-bold tabular-nums ${color} ${pad}`}>
      <span data-testid="opp-score">{score}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wider opacity-60">score</span>
    </span>
  )
}

// ---------- Money stat ----------

export function Money({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  const v = Number(value ?? 0)
  const symbol = ({ USD: "$", GBP: "£", EUR: "€" } as Record<CurrencyCode, string>)[getActiveSettings().currency] ?? "$"
  return (
    <span className={`tabular-nums ${className}`}>
      {symbol}
      {v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
    </span>
  )
}

// ---------- Stat card ----------

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  testId
}: {
  label: string
  value: string
  sub?: string
  tone?: "default" | "brass" | "risk" | "good"
  testId?: string
}) {
  const tones: Record<string, string> = {
    default: "text-mist-50",
    brass: "text-brass-300",
    risk: "text-red-300",
    good: "text-emerald-300"
  }
  return (
    <div className="card relative p-4 sm:p-5">
      <div className="label">{label}</div>
      <div
        data-testid={testId}
        className={`metric-display mt-2 text-3xl leading-none sm:text-4xl ${tones[tone]}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[11px] text-mist-400">{sub}</div> : null}
      <span className="absolute left-0 top-0 h-6 w-px bg-brass-500/60" aria-hidden="true" />
    </div>
  )
}

// ---------- Section ----------

export function Section({
  title,
  actions,
  children,
  subtitle
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-4 py-3.5 sm:px-5">
        <div className="flex items-baseline gap-3">
          <span className="h-3 w-px bg-brass-500/70" aria-hidden="true" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-mist-200">{title}</h2>
          {subtitle ? <p className="text-[11px] text-mist-400">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  )
}

// ---------- Empty / loading / error ----------

export function EmptyState({ icon, title, body }: { icon?: string; title: string; body?: string }) {
  return (
    <div className="motif-field flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      {icon ? <div className="font-display text-2xl italic text-mist-400">{icon}</div> : null}
      <div className="text-sm font-semibold text-mist-100">{title}</div>
      {body ? <div className="max-w-sm text-xs leading-relaxed text-mist-400">{body}</div> : null}
    </div>
  )
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <LoadingMark label={label} />
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="m-4 rounded-sm border-l-2 border-red-300 bg-red-950/70 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  )
}

export function SimulatedTag({ children = "Simulated" }: { children?: React.ReactNode }) {
  return (
    <span className="chip border-ink-700 bg-ink-850 text-mist-400" title="Demo action — nothing is sent to a real customer">
      {children}
    </span>
  )
}

// ---------- Modal ----------

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`reveal max-h-[92vh] w-full overflow-y-auto rounded-t-md border border-ink-800 bg-ink-900 shadow-pop sm:rounded-md ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-ink-800 bg-ink-900 px-5 py-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-mist-100">{title}</h3>
          <button onClick={onClose} className="btn-ghost -mr-2 px-3 py-1.5 text-lg leading-none" aria-label="Close">
            ×
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ---------- Progress bar for pipeline ----------

export function ProgressBar({ segments }: { segments: { label: string; value: number; className: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-none bg-ink-850">
      {segments.map((s) => (
        <div
          key={s.label}
          className={s.className}
          style={{ width: `${(s.value / total) * 100}%` }}
          title={`${s.label}: ${s.value}`}
        />
      ))}
    </div>
  )
}
