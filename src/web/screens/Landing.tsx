import React from "react"
import { nav } from "../App"
import { SectionIndex, DiamondRule, RecoveryNetwork, ScoreInstrument, StageRail } from "../brand"

const PRIMARY_CTA = "GET YOUR FREE REVENUE RECOVERY AUDIT"

function LandingNav() {
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  const item = "text-[11px] font-semibold uppercase tracking-[0.18em] text-mist-300 transition hover:text-mist-50"
  return (
    <header className="no-print sticky top-0 z-40 border-b border-ink-800 bg-ink-950/92 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <span className="font-display text-xl font-semibold tracking-[0.32em] text-mist-50">VÉRIA</span>
        <nav className="hidden items-center gap-7 md:flex">
          <button className={item} onClick={() => go("problem")}>Product</button>
          <button className={item} onClick={() => go("system")}>How it works</button>
          <button className={item} onClick={() => go("audit")}>Audit</button>
          <button className={item} onClick={() => go("impact")}>Impact</button>
        </nav>
        <button className="btn-primary px-4 py-2 text-[11px]" onClick={() => nav("/prospect")}>
          Get your free audit
        </button>
      </div>
    </header>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink-950 text-mist-100">
      <LandingNav />

      {/* ================= HERO — editorial composition ================= */}
      <section className="blueprint-grid relative overflow-hidden">
        <div
          className="motif-field pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] opacity-[0.16]"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pt-20">
          <div className="eyebrow">Revenue Recovery Infrastructure</div>
          <h1 className="text-balance mt-5 max-w-4xl font-display text-5xl font-medium leading-[1.04] tracking-tight text-mist-50 sm:text-6xl lg:text-7xl">
            Recover the HVAC jobs
            <br />
            <span className="italic text-brass-400">you're already losing.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-mist-300 sm:text-lg">
            VÉRIA analyzes your existing business data to identify revenue leakage, prioritize recovery opportunities, help your
            team act, and measure what actually comes back.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button className="btn-primary px-6 py-3" onClick={() => nav("/prospect")}>
              {PRIMARY_CTA}
            </button>
            <button className="btn-secondary px-6 py-3" onClick={() => document.getElementById("system")?.scrollIntoView({ behavior: "smooth" })}>
              See how it works
            </button>
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.16em] text-mist-500">
            No new leads to buy. No CRM to replace. Your data, analyzed.
          </div>

          {/* The system graphic — intelligence map, not a screenshot */}
          <div className="reveal mt-14 border border-ink-800 bg-ink-900/80 p-5 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="label">The Revenue Recovery System</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-mist-500">Fig. 01</div>
            </div>
            <RecoveryNetwork className="mt-4 w-full" />
          </div>
        </div>
      </section>

      <DiamondRule className="mx-auto max-w-6xl" />

      {/* ================= 01 THE PROBLEM ================= */}
      <section id="problem" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <SectionIndex index="01">The problem</SectionIndex>
        <h2 className="text-balance mt-5 max-w-3xl font-display text-3xl font-medium leading-snug text-mist-50 sm:text-4xl">
          Your next job may already be in your database.
        </h2>
        <div className="mt-8 grid gap-10 md:grid-cols-[1.1fr_1fr]">
          <p className="text-base leading-relaxed text-mist-300">
            Every week, HVAC businesses pay to generate demand — then lose parts of it in the gaps between the phone ringing, the
            estimate going out, and the follow-up that never quite happens. Nobody decides to lose these jobs. There was just no
            system watching.
          </p>
          <blockquote className="border-l-2 border-brass-500 pl-5">
            <p className="font-display text-xl italic leading-relaxed text-mist-100">
              "The work was already sold. Someone just needed to call back."
            </p>
            <footer className="mt-2 text-[10px] uppercase tracking-[0.18em] text-mist-500">— Every HVAC owner, eventually</footer>
          </blockquote>
        </div>
      </section>

      {/* ================= 02 THE SIGNAL ================= */}
      <section id="signal" className="border-y border-ink-800 bg-ink-900/50">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <SectionIndex index="02">The signal</SectionIndex>
          <h2 className="text-balance mt-5 max-w-3xl font-display text-3xl font-medium leading-snug text-mist-50 sm:text-4xl">
            Four places revenue goes quiet.
          </h2>
          <div className="mt-10 divide-y divide-ink-800 border-t border-ink-800">
            {[
              { n: "A", t: "Missed enquiries", d: "The phone rings during a job. By the time anyone listens to the voicemail, the homeowner has already called the next company on the list." },
              { n: "B", t: "Stale estimates", d: "You visited. You diagnosed. You quoted. Then the quote sat in a sent folder while the customer quietly waited for a follow-up that never came." },
              { n: "C", t: "Dormant customers", d: "Furnaces age, seasons change, maintenance lapses — and past customers who would buy again hear nothing until a competitor's postcard arrives first." },
              { n: "D", t: "Follow-up gaps", d: "Slow first responses, unconfirmed appointments, handoffs that wait for the owner. Each gap is small. Together they are a payroll." }
            ].map((s) => (
              <div key={s.n} className="grid grid-cols-[3rem_1fr] gap-4 py-6 sm:grid-cols-[5rem_14rem_1fr] sm:gap-8">
                <span className="font-display text-3xl italic text-brass-400/90">{s.n}</span>
                <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-mist-100">{s.t}</span>
                <p className="col-span-2 mt-1 text-sm leading-relaxed text-mist-300 sm:col-span-1 sm:mt-0">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= 03 THE SYSTEM ================= */}
      <section id="system" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <SectionIndex index="03">The system</SectionIndex>
        <h2 className="text-balance mt-5 max-w-3xl font-display text-3xl font-medium leading-snug text-mist-50 sm:text-4xl">
          Capture → Qualify → Follow up → Recover → Reactivate.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-mist-300">
          VÉRIA sits on top of the workflow you already have. It watches the journeys between enquiry and booking, surfaces what
          stalled, prioritizes it, and turns recovery into a daily queue — while keeping a person in charge of every customer
          conversation.
        </p>
        <div className="mt-10 border border-ink-800 bg-ink-900/70 p-6 sm:p-8">
          <StageRail stages={["Capture", "Qualify", "Follow up", "Recover", "Reactivate"]} activeIndex={3} />
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {[
              { t: "Identify", d: "Deterministic rules scan calls, enquiries, estimates and customer records for revenue that stalled — no black boxes." },
              { t: "Prioritize", d: "Every opportunity carries a value, an age, and a reason. The queue is ranked so the morning starts with the work that pays." },
              { t: "Recover honestly", d: "Progress is tracked stage by stage. Revenue counts as recovered only when a real outcome is recorded. A sent message never counts." }
            ].map((c) => (
              <div key={c.t} className="corner-marks border border-ink-800 bg-ink-950/40 p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brass-300">{c.t}</div>
                <p className="mt-2 text-sm leading-relaxed text-mist-300">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= 04 THE AUDIT ================= */}
      <section id="audit" className="border-y border-ink-800 bg-ink-900/50">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <SectionIndex index="04">The audit</SectionIndex>
          <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <h2 className="text-balance font-display text-3xl font-medium leading-snug text-mist-50 sm:text-4xl">
                What the Revenue Recovery Audit shows.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-mist-300">
                Start with your real numbers — imports or a demo dataset — and VÉRIA produces a document you can hold: enquiry
                response times, silent quotes, dormant customers, and a ranked list of the five actions worth taking first.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "Response health from your recorded enquiries — no invented benchmarks",
                  "Every open estimate with age, value and recommended next step",
                  "Identified opportunity, clearly labelled — never presented as guaranteed revenue",
                  "A methodology section explaining exactly how each number was derived"
                ].map((li) => (
                  <li key={li} className="flex gap-3 text-sm leading-relaxed text-mist-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-brass-500" />
                    {li}
                  </li>
                ))}
              </ul>
              <button className="btn-primary mt-8 px-5 py-2.5" onClick={() => nav("/audit")}>
                View a sample audit →
              </button>
            </div>
            <div className="border border-ink-800 bg-ink-950/40 p-6 sm:p-8">
              <ScoreInstrument
                score={43}
                size="lg"
                caption="Cedar Ridge Heating & Cooling — illustrative demo dataset. A leaking score means recoverable work is going cold."
                breakdown={[
                  { label: "Response coverage", delta: 0 },
                  { label: "Quote follow-up coverage", delta: -1 },
                  { label: "Missed enquiries", delta: -10 },
                  { label: "Dormant customers", delta: 0 },
                  { label: "Recovery workflow completion", delta: 4 }
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ================= 05 THE IMPACT ================= */}
      <section id="impact" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <SectionIndex index="05">The impact</SectionIndex>
        <h2 className="text-balance mt-5 max-w-3xl font-display text-3xl font-medium leading-snug text-mist-50 sm:text-4xl">
          Measured outcomes, not marketing numbers.
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-px border border-ink-800 bg-ink-800 sm:grid-cols-3">
          {[
            { v: "$22,400", l: "Recovered revenue", d: "recorded outcomes only — booked jobs, accepted quotes, reactivated customers" },
            { v: "$119,650", l: "Identified opportunity", d: "labelled as opportunity, never as guaranteed revenue" },
            { v: "75%", l: "Recovery rate on actioned work", d: "from the illustrative demo dataset" }
          ].map((s) => (
            <div key={s.l} className="bg-ink-950 p-6 sm:p-8">
              <div className="metric-display text-4xl text-mist-50 sm:text-5xl">{s.v}</div>
              <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-brass-300">{s.l}</div>
              <p className="mt-2 text-xs leading-relaxed text-mist-400">{s.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-mist-500">Illustrative demo data — not a customer result.</p>
      </section>

      {/* ================= 06 THE PRODUCT ================= */}
      <section id="product" className="border-y border-ink-800 bg-ink-900/50">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <SectionIndex index="06">The product</SectionIndex>
          <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-balance font-display text-3xl font-medium leading-snug text-mist-50 sm:text-4xl">
                An intelligence terminal for recovery — not another dashboard.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-mist-300">
                Large numbers, thin rules, ranked queues. Every screen answers one question: what should we do next, and what is it
                worth? Open the live environment and work a real recovery from leak to recorded outcome.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button className="btn-primary px-5 py-2.5" onClick={() => nav("/")}>Open the live environment →</button>
                <button className="btn-secondary px-5 py-2.5" onClick={() => nav("/demo")}>Run the guided demo</button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { t: "What VÉRIA found", d: "Findings ranked by value with recommended actions" },
                { t: "Recovery pipeline", d: "Every opportunity, staged and explained" },
                { t: "Owner tasks", d: "Human handoffs with call, assign, snooze" },
                { t: "VÉRIA Impact", d: "The honest ledger of what actually recovered" }
              ].map((x) => (
                <div key={x.t} className="border border-ink-800 bg-ink-950/40 p-4">
                  <div className="h-px w-8 bg-brass-500/80" />
                  <div className="mt-3 text-sm font-semibold text-mist-100">{x.t}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-mist-400">{x.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= 07 THE DIFFERENCE ================= */}
      <section id="difference" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <SectionIndex index="07">The difference</SectionIndex>
        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <h2 className="text-balance font-display text-3xl font-medium leading-snug text-mist-50 sm:text-4xl">
            VÉRIA works above the systems you already use.
          </h2>
          <div className="space-y-5">
            {[
              { t: "ServiceTitan and Jobber run the business", d: "VÉRIA is not a replacement. It reads the exports and records those systems already produce, then finds the revenue stalling between them." },
              { t: "Humans handle customers", d: "VÉRIA never messages a customer on its own. Sensitive, high-value and unusual situations escalate to a person." },
              { t: "Explainable by design", d: "Scores, priorities and every dollar are traceable to rules you can read — with evidence attached to every flag. Nothing to take on faith." }
            ].map((x) => (
              <div key={x.t} className="grid grid-cols-[auto_1fr] gap-4 border-t border-ink-800 pt-4">
                <span className="mt-1 h-1.5 w-1.5 rotate-45 bg-brass-500" />
                <div>
                  <div className="text-sm font-bold text-mist-100">{x.t}</div>
                  <p className="mt-1 text-sm leading-relaxed text-mist-300">{x.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= 08 CTA ================= */}
      <section className="blueprint-grid relative overflow-hidden border-t border-ink-800">
        <div className="motif-field pointer-events-none absolute -left-20 bottom-0 h-72 w-72 opacity-[0.14]" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center sm:px-8">
          <div className="eyebrow justify-center">Founding HVAC Revenue Recovery Pilot</div>
          <h2 className="text-balance mt-5 font-display text-4xl font-medium leading-tight text-mist-50 sm:text-5xl">
            Get your free revenue recovery audit.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-mist-300">
            Send the exports you already have. We'll show you where revenue is leaking — before you spend a cent on the product.
          </p>
          <div className="mt-8 flex justify-center">
            <button className="btn-primary px-8 py-3.5" onClick={() => nav("/prospect")}>
              {PRIMARY_CTA}
            </button>
          </div>
          <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-mist-500">90-day pilot · CSV-first onboarding · Your data stays yours</div>
        </div>
      </section>

      <footer className="border-t border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <span className="font-display text-sm font-semibold tracking-[0.3em] text-mist-200">VÉRIA</span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-mist-500">Revenue Recovery Infrastructure for HVAC & Heating</span>
          <div className="flex gap-5">
            <button className="text-[11px] uppercase tracking-[0.14em] text-mist-400 hover:text-mist-100" onClick={() => nav("/")}>App</button>
            <button className="text-[11px] uppercase tracking-[0.14em] text-mist-400 hover:text-mist-100" onClick={() => nav("/demo")}>Demo</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
