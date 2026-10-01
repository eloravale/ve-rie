import React from "react"

/**
 * VÉRIA brand graphic language.
 * Lines, nodes, grids, geometry, numbers — an intelligence-instrument system,
 * not standard SaaS illustration. All graphics are inline SVG/CSS, no stock art.
 */

// ---------- Editorial metadata ----------

/** Numbered section label, e.g. "01 · THE PROBLEM". */
export function SectionIndex({
  index,
  children,
  className = ""
}: {
  index: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-baseline gap-2.5 ${className}`}>
      <span className="font-display text-[13px] italic text-brass-400">{index}</span>
      <span className="h-px w-6 bg-brass-500/70" />
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-mist-400">{children}</span>
    </div>
  )
}

/** Full-width editorial divider with centered brass diamond. */
export function DiamondRule({ className = "" }: { className?: string }) {
  return <div className={`rule rule-diamond ${className}`} />
}

/** Hairline divider with a left brass tick — used inside dense lists. */
export function TickRule({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-px w-full bg-ink-800 ${className}`}>
      <span className="absolute left-0 top-0 h-px w-8 bg-brass-500/80" />
    </div>
  )
}

/** Small inline status signal: dot + optional text. */
export function Signal({
  tone,
  children
}: {
  tone: "active" | "risk" | "good" | "idle"
  children?: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-400">
      <span
        className={`signal-dot ${tone === "active" ? "animate-diamond" : ""}`}
        style={tone === "active" ? { borderRadius: 1, transform: "rotate(45deg)" } : undefined}
      />
      {children}
    </span>
  )
}

// ---------- The Recovery Score instrument ----------
//
// Large serif numeral + segmented architectural indicator. Each segment is a
// scoring signal; lit segments carry brass, the frame is hairline. The breakdown
// row lists the components with their deltas, like a legend on an instrument.

export function ScoreInstrument({
  score,
  max = 100,
  size = "md",
  breakdown,
  caption
}: {
  score: number
  max?: number
  size?: "md" | "lg"
  breakdown?: { label: string; delta: number }[]
  caption?: string
}) {
  const pct = Math.max(0, Math.min(1, score / max))
  const segments = 10
  const lit = Math.round(pct * segments)
  const num = size === "lg" ? "text-6xl sm:text-7xl" : "text-5xl"
  return (
    <div>
      <div className="flex items-end gap-4">
        <span className={`metric-display leading-none text-mist-50 ${num}`} data-testid="score-value">
          {score}
        </span>
        <div className="pb-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-mist-400">Revenue Recovery</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-mist-400">Score</div>
          <div className="mt-1 text-[10px] tabular-nums text-mist-500">{score}/{max}</div>
        </div>
      </div>
      <div className="mt-4 flex gap-1" role="img" aria-label={`Score ${score} of ${max}`}>
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 ${i < lit ? "bg-brass-500" : "bg-ink-750"}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] tabular-nums text-mist-500">
        <span>0</span>
        <span>{max}</span>
      </div>
      {caption ? <div className="mt-2 text-[11px] leading-relaxed text-mist-400">{caption}</div> : null}
      {breakdown && breakdown.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-ink-800 pt-3">
          {breakdown.map((b, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[11px] text-mist-300">{b.label}</span>
              <span
                className={`shrink-0 font-display text-[13px] italic tabular-nums ${
                  b.delta > 0 ? "text-emerald-300" : b.delta < 0 ? "text-red-300" : "text-mist-400"
                }`}
              >
                {b.delta > 0 ? `+${b.delta}` : b.delta}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ---------- The Recovery Network (hero signature graphic) ----------
//
// An intelligence map of a service business: enquiry signals flow from the left,
// some fall dim into the grid (leaked revenue), one path is highlighted —
// a quote recovered through the follow-up sequence.

export function RecoveryNetwork({ className = "" }: { className?: string }) {
  // deterministic layout: x by column, y hand-tuned
  const node = (x: number, y: number, r: number) => ({ x, y, r })
  const nodes = {
    a: node(30, 40, 4), // enquiry — call
    b: node(30, 130, 4), // enquiry — web
    c: node(30, 220, 4), // enquiry — repeat
    d: node(150, 85, 3.5), // captured
    e: node(150, 175, 3.5), // missed (dim)
    f: node(270, 130, 3.5), // qualified
    g: node(390, 85, 3.5), // quote sent
    h: node(390, 175, 3.5), // quote silent (dim)
    i: node(510, 130, 4.5), // recovered
    j: node(510, 40, 3), // dormant reactivation (dim)
    k: node(510, 220, 3) // lost (dim)
  }
  const line = (p1: { x: number; y: number }, p2: { x: number; y: number }) => `M${p1.x} ${p1.y} L${p2.x} ${p2.y}`
  return (
    <svg
      viewBox="0 0 560 260"
      className={className}
      role="img"
      aria-label="Abstract recovery network: enquiry signals resolving into one highlighted recovery path"
    >
      {/* fine blueprint grid */}
      <g stroke="#D8CBB7" strokeWidth="0.5" opacity="0.55">
        {Array.from({ length: 15 }, (_, i) => (
          <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={260} />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 40} x2={560} y2={i * 40} />
        ))}
      </g>
      {/* leaked paths — dim */}
      <g stroke="#BBA98D" strokeWidth="1" fill="none" opacity="0.8">
        <path d={line(nodes.b, nodes.e)} />
        <path d={line(nodes.e, nodes.h)} />
        <path d={line(nodes.h, nodes.k)} />
        <path d={line(nodes.a, nodes.d)} strokeDasharray="3 4" />
        <path d={line(nodes.c, nodes.j)} strokeDasharray="3 4" />
      </g>
      {/* the recovery path — brass */}
      <path
        d={line(nodes.a, nodes.d) + " " + line(nodes.d, nodes.f) + " " + line(nodes.f, nodes.g) + " " + line(nodes.g, nodes.i)}
        stroke="#A9824A"
        strokeWidth="1.6"
        fill="none"
      />
      {/* nodes */}
      {Object.entries(nodes).map(([key, n]) => {
        const highlight = key === "i"
        const brass = ["a", "d", "f", "g", "i"].includes(key)
        const ink = highlight ? "#A9824A" : brass ? "#856528" : "#A29074"
        return (
          <g key={key}>
            <circle cx={n.x} cy={n.y} r={n.r + (highlight ? 4 : 2.5)} fill="none" stroke={ink} strokeOpacity={highlight ? 0.8 : 0.35} strokeWidth="1" />
            <circle cx={n.x} cy={n.y} r={n.r * (highlight ? 1.15 : 0.8)} fill={highlight ? "#A9824A" : brass ? "#856528" : "#A29074"} />
            {highlight ? (
              <>
                <circle cx={n.x} cy={n.y} r={n.r + 9} fill="none" stroke="#A9824A" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="2 3" />
                <text x={n.x} y={n.y - 16} textAnchor="middle" fontSize="9" letterSpacing="2" fill="#856528" fontFamily="Inter, sans-serif">
                  RECOVERED
                </text>
              </>
            ) : null}
          </g>
        )
      })}
      {/* stage captions along the bottom rail */}
      <g fontSize="8.5" letterSpacing="1.8" fill="#786c55" fontFamily="Inter, sans-serif">
        <text x={30} y={248} textAnchor="middle">ENQUIRY</text>
        <text x={150} y={248} textAnchor="middle">CAPTURE</text>
        <text x={270} y={248} textAnchor="middle">QUALIFY</text>
        <text x={390} y={248} textAnchor="middle">FOLLOW UP</text>
        <text x={510} y={248} textAnchor="middle">RECOVER</text>
      </g>
    </svg>
  )
}

// ---------- Recovery stage rail (pipeline / workflows) ----------

export function StageRail({ stages, activeIndex }: { stages: string[]; activeIndex: number }) {
  return (
    <div className="flex items-center">
      {stages.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 ? <span className={`h-px w-6 sm:w-8 ${i <= activeIndex ? "bg-brass-500/70" : "bg-ink-700"}`} /> : null}
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rotate-45 ${i < activeIndex ? "bg-brass-500" : i === activeIndex ? "bg-brass-500 ring-2 ring-brass-500/25" : "bg-ink-600"}`}
            />
            <span className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${i <= activeIndex ? "text-mist-200" : "text-mist-400"}`}>
              {s}
            </span>
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

// ---------- Loading / empty marks ----------

export function VeriaMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect x="7.5" y="7.5" width="13" height="13" fill="none" stroke="#A9824A" strokeWidth="1.1" />
      <rect x="7.5" y="7.5" width="13" height="13" fill="none" stroke="#856528" strokeWidth="1.1" transform="rotate(45 14 14)" />
      <circle cx="14" cy="14" r="2.4" fill="#A9824A" />
    </svg>
  )
}

export function LoadingMark({ label = "Analyzing" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
      <div className="relative h-9 w-9">
        <VeriaMark className="absolute inset-0 h-9 w-9 opacity-90" />
        <span className="animate-diamond absolute inset-0 m-auto block h-1.5 w-1.5 bg-brass-500" />
      </div>
      <span className="text-[11px] uppercase tracking-[0.2em] text-mist-400">{label}…</span>
    </div>
  )
}
