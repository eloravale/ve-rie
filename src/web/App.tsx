import React, { useEffect, useState } from "react"
import Dashboard from "./screens/Dashboard"
import Leads from "./screens/Leads"
import LeadDetail from "./screens/LeadDetail"
import RadarScreen from "./screens/Radar"
import MissedCalls from "./screens/MissedCalls"
import FollowupsScreen from "./screens/Followups"
import Reactivation from "./screens/Reactivation"
import TasksScreen from "./screens/Tasks"
import DemoMode from "./screens/DemoMode"
import Landing from "./screens/Landing"
import Opportunities from "./screens/Opportunities"
import WhatFound from "./screens/WhatFound"
import Audit from "./screens/Audit"
import Prospect from "./screens/Prospect"
import Impact from "./screens/Impact"
import Accuracy from "./screens/Accuracy"
import Settings from "./screens/Settings"
import { api } from "./api"
import { useSettings } from "./use-settings"
import { VeriaMark } from "./brand"

export interface Company {
  id: string
  name: string
  city: string
  state: string
  phone: string
  website: string
  avg_ticket: number
}

const NAV: { group?: string; path?: string; label?: string; icon?: string }[] = [
  { group: "Overview" },
  { path: "/", label: "Dashboard", icon: "◫" },
  { group: "Intelligence" },
  { path: "/found", label: "What We Found", icon: "◈" },
  { path: "/radar", label: "Revenue Radar", icon: "◎" },
  { path: "/opportunities", label: "Opportunities", icon: "↗" },
  { group: "Recovery" },
  { path: "/missed-calls", label: "Missed Calls", icon: "☏" },
  { path: "/followups", label: "Estimates", icon: "↻" },
  { path: "/reactivation", label: "Reactivation", icon: "⟳" },
  { group: "Data" },
  { path: "/leads", label: "Leads", icon: "☰" },
  { group: "Control" },
  { path: "/tasks", label: "Owner Tasks", icon: "✓" },
  { path: "/impact", label: "Impact", icon: "▲" },
  { path: "/accuracy", label: "Accuracy", icon: "◎" },
  { path: "/demo", label: "Demo Mode", icon: "▶" }
]

const MOBILE_NAV = ["/", "/found", "/opportunities", "/tasks", "/demo"]

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || "/")
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.slice(1) || "/")
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return hash
}

export function nav(path: string) {
  window.location.hash = path
  window.scrollTo(0, 0)
}

export default function App() {
  const route = useHashRoute()
  const [company, setCompany] = useState<Company | null>(null)

  // Load company settings once at startup — drives currency/date formatting app-wide.
  useSettings()

  useEffect(() => {
    api
      .get<{ company: Company }>("/api/dashboard")
      .then((d) => setCompany(d.company))
      .catch(() => setCompany(null))
  }, [])

  const leadMatch = route.match(/^\/leads\/([^/]+)$/)

  // Landing page renders standalone (public sales page).
  if (route === "/landing") {
    return <Landing />
  }

  let screen: React.ReactNode
  if (leadMatch) {
    screen = <LeadDetail id={leadMatch[1]} />
  } else if (route === "/" || route === "") {
    screen = <Dashboard />
  } else if (route.startsWith("/leads")) {
    screen = <Leads />
  } else if (route === "/radar") {
    screen = <RadarScreen />
  } else if (route === "/missed-calls") {
    screen = <MissedCalls />
  } else if (route === "/followups") {
    screen = <FollowupsScreen />
  } else if (route === "/reactivation") {
    screen = <Reactivation />
  } else if (route === "/tasks") {
    screen = <TasksScreen />
  } else if (route === "/demo") {
    screen = <DemoMode />
  } else if (route === "/opportunities") {
    screen = <Opportunities />
  } else if (route === "/found") {
    screen = <WhatFound />
  } else if (route === "/audit") {
    screen = <Audit />
  } else if (route === "/prospect") {
    screen = <Prospect />
  } else if (route === "/impact") {
    screen = <Impact />
  } else if (route === "/settings") {
    screen = <Settings />
  } else if (route === "/accuracy") {
    screen = <Accuracy />
  } else {
    screen = (
      <div className="card m-6 p-10 text-center">
        <div className="text-lg font-bold text-mist-100">Page not found</div>
        <p className="mt-2 text-sm text-mist-400">The page “{route}” doesn’t exist.</p>
        <button className="btn-primary mt-4" onClick={() => nav("/")}>
          Back to Dashboard
        </button>
      </div>
    )
  }

  const active = (p: string) => (p === "/" ? route === "/" || route === "" : route.startsWith(p) && !(p === "/leads" && leadMatch))

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/95 backdrop-blur no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="border border-ink-700 bg-ink-900 p-1">
            <VeriaMark className="h-6 w-6" />
          </span>
          <div className="leading-tight">
            <div className="flex items-baseline">
              <span className="font-display text-lg font-semibold tracking-[0.3em] text-mist-50">VÉRIA</span>
              <span className="ml-2 hidden text-[9px] font-bold uppercase tracking-[0.2em] text-brass-400 sm:inline">HVAC Revenue Recovery</span>
            </div>
            <div className="hidden text-[10px] uppercase tracking-[0.08em] text-mist-400 sm:block">
              {company ? `${company.name} — ${company.city}, ${company.state}` : "Loading company…"}
            </div>
          </div>
        </div>
          <div className="flex items-center gap-2">
            <span className="chip hidden border-ink-600 bg-ink-850 text-mist-400 md:inline-flex">Illustrative demo data</span>
            <button className="btn-ghost px-2 py-1.5 text-xs sm:px-3" onClick={() => nav("/settings")} title="Settings">
              ⚙<span className="hidden sm:inline">&nbsp;Settings</span>
            </button>
            <button className="btn-primary px-2 py-1.5 text-xs sm:px-3" onClick={() => nav("/demo")}>
              <span className="hidden sm:inline">Run Demo</span>
              <span className="sm:hidden">▶</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="no-print sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 flex-col border-r border-ink-800 px-3 py-4 md:flex">
          <nav className="flex flex-col gap-0.5 overflow-y-auto">
            {NAV.map((item, i) =>
              item.group ? (
                <div key={`g${i}`} className="label mt-3 px-3 pb-1 first:mt-0">
                  {item.group}
                </div>
              ) : (
                <a
                  key={item.path}
                  href={`#${item.path}`}
                  className={`relative flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-sm font-medium transition ${
                    active(item.path!)
                      ? "bg-ink-850 text-mist-50"
                      : "text-mist-300 hover:bg-ink-850/60 hover:text-mist-100"
                  }`}
                >
                  {active(item.path!) ? (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-brass-500" aria-hidden="true" />
                  ) : null}
                  <span className={`w-4 text-center text-sm ${active(item.path!) ? "text-brass-400" : "text-mist-400"}`}>{item.icon}</span>
                  {item.label}
                </a>
              )
            )}
          </nav>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-ink-800 pt-3">
            <a href="#/prospect" className="btn-primary px-3 py-2 text-center text-xs">
              Free Recovery Audit
            </a>
            <a href="#/audit" className="btn-secondary px-3 py-2 text-center text-xs">
              View audit
            </a>
            <a href="#/landing" className="text-center text-[11px] text-mist-500 underline-offset-2 hover:text-mist-300 hover:underline">
              Public landing page
            </a>
          </div>
          <div className="mt-auto border border-ink-800 bg-ink-900 p-3">
            <div className="label">Recovery principle</div>
            <p className="mt-1 font-display text-[12px] italic leading-relaxed text-mist-300">
              Speed and follow-up win HVAC jobs. VÉRIA shows exactly where revenue is slipping and what to do next — and only real
              outcomes count as recovered.
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10">{screen}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/97 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => n.path && MOBILE_NAV.includes(n.path)).map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold ${
                active(item.path!) ? "text-brass-400" : "text-mist-400"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}
