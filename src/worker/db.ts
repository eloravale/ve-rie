/**
 * VÉRIA data layer.
 *
 * The Worker is written against the Cloudflare D1 API (prepare/bind/first/all/run)
 * plus `exec` for running migration SQL. Two runtimes provide this interface:
 *
 *  - Cloudflare Workers: env.DB is the real D1 binding.
 *  - Node (server.mjs / tests / CI): a node:sqlite-backed adapter with the same
 *    surface, so the exact same queries run locally without a Cloudflare account.
 */

export interface D1Result<T = Record<string, unknown>> {
  results?: T[]
  success: boolean
  meta?: Record<string, unknown>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

export interface Database {
  prepare(sql: string): D1PreparedStatement
  exec(sql: string): Promise<void>
}

/** The demo company every row is scoped to. */
export const COMPANY_ID = "cmp_1000"

/**
 * Deterministic id generator: readable prefixes + time/random suffix.
 * Works identically in Workers and Node (no crypto.getRandomValues dependency).
 */
export function newId(prefix: string): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${t}${r}`
}

/** ISO timestamp now (UTC, second precision — matches SQLite datetime('now')). */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace("T", " ").replace("Z", "")
}
