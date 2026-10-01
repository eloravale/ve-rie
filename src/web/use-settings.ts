import { useEffect, useState } from "react"
import { api } from "./api"
import { DEFAULT_SETTINGS, setActiveSettings, type Settings } from "./recovery-format"

let cache: Promise<Settings> | null = null

function fetchSettings(): Promise<Settings> {
  if (!cache) {
    cache = api
      .get<Settings>("/api/settings")
      .then((s) => {
        setActiveSettings(s)
        return s
      })
      .catch(() => DEFAULT_SETTINGS)
  }
  return cache
}

/** Company settings (region/currency/date format), fetched once and shared. */
export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    let alive = true
    fetchSettings().then((s) => {
      if (alive) setSettings(s)
    })
    return () => {
      alive = false
    }
  }, [])
  return settings
}

/** Invalidate the cached settings (call after PATCH /api/settings). */
export function invalidateSettings(): void {
  cache = null
}
