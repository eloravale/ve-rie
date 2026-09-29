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
import { api } from "./api"

export interface Company {
  id: string
  name: string
  city: string
  state: string
  phone: string
  website: string
  avg_ticket: number
}

const NAV = [
  { path: "/", label: "Dashboard", icon: "◫" },
  { path: "/leads", label: "Leads", icon: "☰" },
  { path: "/radar", label: "Radar", icon: "◎" },
  { path: "/missed-calls", label: "Missed Calls", icon: "☏" },
  { path: "/followups", label: "Follow-ups", icon: "↻" },
  { path: "/reactivation", label: "Reactivation", icon: "⟳" },
  { path: "/tasks", label: "Owner Tasks", icon: "✓" },
  { path: "/demo", label: "Demo Mode", icon: "▶" }
]

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
}

export default function App() {
  const route = useHashRoute()
  const [company, setCompany] = useState<Company | null>(null)

  useEffect(() => {
    api
      .get<{ company: Company }>("/api/dashboard")
      .then((d) => setCompany(d.company))
      .catch(() => setCompany(null))
  }, [])

  const leadMatch = route.match(/^\/leads\/([^/]+)$/)

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
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/veria.svg" alt="VÉRIA" className="h-8 w-8 rounded-lg border border-ink-700" />
            <div className="leading-tight">
              <div className="text-base font-black tracking-[0.22em] text-mist-50">
                VÉRIA<span className="ml-1 align-super text-[9px] font-bold tracking-normal text-brass-400">HVAC REVENUE RECOVERY</span>
              </div>
              <div className="hidden text-[11px] text-mist-400 sm:block">
                {company ? `${company.name} — ${company.city}, ${company.state}` : "Loading company…"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip hidden border-ink-600 bg-ink-850 text-mist-400 md:inline-flex">Demo data</span>
            <button className="btn-primary hidden px-3 py-1.5 text-xs sm:inline-flex" onClick={() => nav("/demo")}>
              Run Demo
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 flex-col border-r border-ink-800 px-3 py-4 md:flex">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <a
                key={item.path}
                href={`#${item.path}`}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active(item.path)
                    ? "bg-ink-800 text-mist-50 shadow-[inset_2px_0_0_0_#c9a35f]"
                    : "text-mist-400 hover:bg-ink-850 hover:text-mist-200"
                }`}
              >
                <span className={`text-base ${active(item.path) ? "text-brass-400" : "text-mist-400"}`}>{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-auto rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="label">Recovery principle</div>
            <p className="mt-1 text-[11px] leading-relaxed text-mist-400">
              Speed and follow-up win HVAC jobs. VÉRIA shows exactly where revenue is slipping and what to do next.
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10">{screen}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/97 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => ["/", "/leads", "/radar", "/followups", "/demo"].includes(n.path)).map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold ${
                active(item.path) ? "text-brass-400" : "text-mist-400"
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
