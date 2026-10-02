/// <reference types="@cloudflare/workers-types" />
import type { Database } from "./db"
import { ValidationError, LEAD_SOURCES, LEAD_STATUSES, LEAD_URGENCIES } from "./validation"
import { isoDaysAgo } from "./pipeline"
import { JOB_TYPES } from "./jobTypes"
import { buildEvidence, buildDataQuality, buildCalibration, buildRevenueWatch } from "./intel"
import {
  createLead,
  getLead,
  listLeads,
  updateLead
} from "./leads"
import {
  buildBrief,
  buildDashboard,
  buildRadar,
  completeFollowup,
  createEstimate,
  createFollowup,
  identifyReactivations,
  leadActivity,
  listEstimates,
  listFollowups,
  listHumanTasks,
  listMissedCalls,
  listReactivations,
  opportunityScore,
  recoverMissedCall,
  runReactivation,
  updateHumanTask
} from "./recovery"
import { resetDemo, getWorkspace, WorkspaceGuardError } from "./demo"
import { recordRecovered, ledgerRecoveredSummary, recordLedgerEvent, recoveryEventKey, LedgerIntegrityError, LEDGER_KINDS, LEDGER_VALUE_BASES } from "./ledger"
import {
  syncOpportunities,
  advanceOpportunity,
  buildLeakage,
  buildImpact,
  buildAudit,
  computeRecoveryScore,
  computeResponseHealth,
  STAGE_ORDER,
  RECOVERY_OUTCOMES,
  listOpportunities
} from "./pipeline"
import {
  previewCsv,
  importCsv,
  exportAllData,
  deleteAllData,
  getSettings,
  updateSettings,
  type ImportKind
} from "./imports"
import type { ColumnMapping } from "./csv"

// Re-exported for tests and tooling (single-bundle build emits one file).
export {
  computeRecoveryScore,
  computeResponseHealth,
  buildLeakage,
  buildImpact,
  buildAudit,
  syncOpportunities,
  advanceOpportunity,
  STAGE_ORDER,
  RECOVERY_OUTCOMES
} from "./pipeline"
export { buildEvidence, buildDataQuality, buildCalibration, buildRevenueWatch } from "./intel"
export { resetDemo, getWorkspace, WorkspaceGuardError } from "./demo"
// Intentional single-bundle export surface for tests and tooling.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export { recordRecovered, ledgerRecoveredSummary, recordLedgerEvent, recoveryEventKey, LEDGER_KINDS, LEDGER_VALUE_BASES } from "./ledger"
export { identityKeyFor } from "./pipeline"

export interface Env {
  DB: Database
  ASSETS: { fetch(request: Request): Promise<Response> }
  /** When set (and protected mode is not disabled), destructive routes require `x-admin-token`. */
  VERIA_ADMIN_TOKEN?: string
  /** "1" forces protected mode even without a token (fail-closed); "0" disables it for local dev. */
  VERIA_PROTECTED_MODE?: string
  /** Comma-separated CORS allowlist. Empty/unset allows localhost dev origins only. */
  VERIA_ALLOWED_ORIGINS?: string
}

// ---------------------------------------------------------------------------
// CORS — configurable allowlist (spec §security). Default keeps local dev
// working (localhost/127.0.0.1 on any port); production sets
// VERIA_ALLOWED_ORIGINS to the exact origins that may call the API.
// ---------------------------------------------------------------------------
const DEFAULT_ALLOWED_ORIGIN_SUFFIXES = ["localhost", "127.0.0.1", "[::1]"]
const DEV_PORTS = new Set(["5173", "4173", "8787", "3000"])

type CorsEnv = { VERIA_ALLOWED_ORIGINS?: string }

function allowedOrigins(env: CorsEnv): string[] {
  return (env.VERIA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function originAllowed(origin: string, env: CorsEnv): boolean {
  if (allowedOrigins(env).includes(origin)) return true
  try {
    const u = new URL(origin)
    const isLocalDev =
      DEFAULT_ALLOWED_ORIGIN_SUFFIXES.includes(u.hostname) &&
      (DEV_PORTS.has(u.port) || u.port === "")
    return isLocalDev
  } catch {
    return false
  }
}

class Cors {
  constructor(private origin: string | null, private env: CorsEnv = {}) {}

  headers(): Record<string, string> {
    const base: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
      Vary: "Origin"
    }
    if (this.origin && originAllowed(this.origin, this.env)) {
      base["Access-Control-Allow-Origin"] = this.origin
    }
    return base
  }
}

// Single-request execution context: Workers isolate per request and the local
// Node server handles requests sequentially, so carrying the request's CORS
// context here is safe in both runtimes.
let CORS_CURRENT: Cors = new Cors(null, {})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_CURRENT.headers() }
  })
}

/**
 * Destructive-route guard (spec §security): POST /api/demo/reset and
 * POST /api/data/delete require the admin token whenever protected mode is on.
 * Protected mode is ON when a token is configured (unless VERIA_PROTECTED_MODE=0)
 * or when VERIA_PROTECTED_MODE=1 (fail-closed, even without a token configured).
 * Tokens are compared with a length-independent equality check; they are never
 * logged or echoed.
 */
function requireAdmin(request: Request, env: Env): Response | null {
  const token = env.VERIA_ADMIN_TOKEN ?? ""
  const protectedMode = env.VERIA_PROTECTED_MODE === "1" || (token.length > 0 && env.VERIA_PROTECTED_MODE !== "0")
  if (!protectedMode) return null
  const supplied = request.headers.get("x-admin-token") ?? ""
  if (token.length > 0 && supplied.length === token.length && supplied === token) return null
  return json(
    {
      error:
        "Admin token required for this operation. Configure VERIA_ADMIN_TOKEN and send it as the `x-admin-token` header.",
      code: "admin_token_required"
    },
    401
  )
}

function errorResponse(e: unknown): Response {
  if (e instanceof ValidationError) {
    return json({ error: e.message, fields: e.fields }, e.status)
  }
  if (e instanceof WorkspaceGuardError) {
    return json({ error: e.message, workspace_kind: e.workspaceKind, code: "workspace_guard" }, e.status)
  }
  if (e instanceof LedgerIntegrityError) {
    return json({ error: e.message, code: "ledger_integrity" }, e.status)
  }
  const message = e instanceof Error ? e.message : "Internal error"
  console.error("[veria] unhandled error:", message)
  return json({ error: message }, 500)
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    CORS_CURRENT = new Cors(request.headers.get("Origin"), env)
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_CURRENT.headers() })

    if (!path.startsWith("/api/")) {
      // Static assets (Cloudflare Workers assets binding).
      try {
        return await env.ASSETS.fetch(request)
      } catch {
        return new Response("Not found", { status: 404 })
      }
    }

    try {
      const db = env.DB

      // ---------- demo mode ----------
      // Destructive routes are token-guarded whenever protected mode is on.
      if (method === "POST" && path === "/api/demo/reset") {
        const denied = requireAdmin(request, env)
        if (denied) return denied
        return json(await resetDemo(db))
      }

      // ---------- workspace ----------
      if (method === "GET" && path === "/api/workspace") {
        return json(await getWorkspace(db))
      }

      // ---------- meta ----------
      if (method === "GET" && path === "/api/health") {
        return json({ ok: true, service: "veria", time: new Date().toISOString() })
      }

      if (method === "GET" && path === "/api/company") {
        const row = await db.prepare(`SELECT id, name, city, state, phone, website, avg_ticket FROM companies WHERE id = ?1`).bind("cmp_1000").first()
        return json(row ?? {})
      }

      if (method === "GET" && path === "/api/meta") {
        return json({
          company_id: "cmp_1000",
          statuses: LEAD_STATUSES,
          sources: LEAD_SOURCES,
          urgencies: LEAD_URGENCIES,
          job_types: JOB_TYPES,
          stages: STAGE_ORDER,
          recovery_outcomes: RECOVERY_OUTCOMES
        })
      }

      // ---------- leads ----------
      if (method === "GET" && path === "/api/leads") {
        const qp = url.searchParams
        const result = await listLeads(db, {
          q: qp.get("q") ?? undefined,
          status: qp.get("status") ?? undefined,
          source: qp.get("source") ?? undefined,
          urgency: qp.get("urgency") ?? undefined,
          sort: qp.get("sort") ?? undefined,
          order: qp.get("order") ?? undefined,
          page: Number(qp.get("page") ?? 1) || 1,
          pageSize: Number(qp.get("pageSize") ?? 25) || 25
        })
        return json(result)
      }

      if (method === "POST" && path === "/api/leads") {
        const lead = await createLead(db, await readBody(request))
        return json(lead, 201)
      }

      let m = path.match(/^\/api\/leads\/([^/]+)$/)
      if (m) {
        const id = decodeURIComponent(m[1])
        if (method === "GET") {
          const lead = await getLead(db, id)
          if (!lead) return json({ error: "Lead not found" }, 404)
          const score = opportunityScore(lead)
          return json({ ...lead, opportunity_score: score.score, score_lines: score.lines })
        }
        if (method === "PATCH") {
          return json(await updateLead(db, id, await readBody(request)))
        }
      }

      m = path.match(/^\/api\/leads\/([^/]+)\/score$/)
      if (m && method === "GET") {
        const lead = await getLead(db, decodeURIComponent(m[1]))
        if (!lead) return json({ error: "Lead not found" }, 404)
        return json(opportunityScore(lead))
      }

      m = path.match(/^\/api\/leads\/([^/]+)\/activity$/)
      if (m && method === "POST") {
        return json(await leadActivity(db, decodeURIComponent(m[1]), await readBody(request)))
      }

      // ---------- recovery pipeline (Revenue Recovery infrastructure) ----------
      if (method === "POST" && path === "/api/opportunities/sync") {
        return json(await syncOpportunities(db))
      }

      if (method === "GET" && path === "/api/opportunities") {
        const qp = url.searchParams
        const items = await listOpportunities(db)
        const stage = qp.get("stage")
        const source = qp.get("source")
        const filtered = items
          .filter((o) => (stage && stage !== "all" ? o.stage === stage : true))
          .filter((o) => (source && source !== "all" ? o.source_type === source : true))
        return json({ items: filtered })
      }

      m = path.match(/^\/api\/opportunities\/([^/]+)$/)
      if (m && method === "PATCH") {
        return json(await advanceOpportunity(db, decodeURIComponent(m[1]), await readBody(request)))
      }

      if (method === "GET" && path === "/api/leakage") {
        return json(await buildLeakage(db))
      }

      if (method === "GET" && path === "/api/recovery-score") {
        return json(await computeRecoveryScore(db))
      }

      if (method === "GET" && path === "/api/response-health") {
        const since = url.searchParams.get("days") ? isoDaysAgo(Number(url.searchParams.get("days")) || 90) : null
        const res = since
          ? await db.prepare(`SELECT response_minutes, first_response_at FROM enquiries WHERE company_id = ?1 AND received_at >= ?2`).bind("cmp_1000", since).all()
          : await db.prepare(`SELECT response_minutes, first_response_at FROM enquiries WHERE company_id = ?1`).bind("cmp_1000").all()
        return json(computeResponseHealth(res.results as { response_minutes: number | null; first_response_at: string | null }[]))
      }

      if (method === "GET" && path === "/api/audit") {
        return json(await buildAudit(db, Number(url.searchParams.get("days")) || 90))
      }

      if (method === "GET" && path === "/api/impact") {
        return json(await buildImpact(db))
      }

      // ---------- intelligence: evidence / data quality / calibration / watch ----------
      m = path.match(/^\/api\/opportunities\/([^/]+)\/evidence$/)
      if (m && method === "GET") {
        const ev = await buildEvidence(db, decodeURIComponent(m[1]))
        if (!ev) return json({ error: "Recovery opportunity not found" }, 404)
        return json(ev)
      }

      if (method === "GET" && path === "/api/data-quality") {
        return json(await buildDataQuality(db))
      }

      if (method === "GET" && path === "/api/calibration") {
        return json(await buildCalibration(db))
      }

      if (method === "GET" && path === "/api/revenue-watch") {
        return json(await buildRevenueWatch(db, Number(url.searchParams.get("days")) || 7))
      }

      // ---------- prospect mode: CSV import ----------
      if (method === "POST" && path === "/api/imports/preview") {
        const body = await readBody(request)
        return json(
          previewCsv(
            String(body.kind ?? "leads") as ImportKind,
            String(body.filename ?? "upload.csv"),
            String(body.csv ?? "")
          )
 )
      }

      if (method === "POST" && path === "/api/imports/commit") {
        const body = await readBody(request)
        return json(
          await importCsv(
            db,
            String(body.kind ?? "leads") as ImportKind,
            String(body.filename ?? "upload.csv"),
            String(body.csv ?? ""),
            body.mapping && typeof body.mapping === "object" ? (body.mapping as unknown as ColumnMapping) : undefined
          )
        )
      }

      if (method === "GET" && path === "/api/settings") {
        return json(await getSettings(db))
      }

      if (method === "PATCH" && path === "/api/settings") {
        return json(await updateSettings(db, await readBody(request)))
      }

      if (method === "GET" && path === "/api/export") {
        return json({ exported_at: new Date().toISOString(), data: await exportAllData(db) })
      }

      if (method === "POST" && path === "/api/data/delete") {
        const denied = requireAdmin(request, env)
        if (denied) return denied
        return json(await deleteAllData(db))
      }

      // ---------- dashboard / radar / brief ----------
      if (method === "GET" && path === "/api/dashboard") return json(await buildDashboard(db))
      if (method === "GET" && path === "/api/radar") return json({ items: await buildRadar(db) })
      if (method === "GET" && path === "/api/brief") return json(await buildBrief(db))

      // ---------- missed calls ----------
      if (method === "GET" && path === "/api/missed-calls") {
        return json(await listMissedCalls(db))
      }

      m = path.match(/^\/api\/missed-calls\/([^/]+)\/recover$/)
      if (m && method === "POST") {
        return json(await recoverMissedCall(db, decodeURIComponent(m[1])))
      }

      // ---------- follow-ups ----------
      if (method === "GET" && path === "/api/followups") {
        return json(await listFollowups(db, url.searchParams.get("status") ?? undefined))
      }

      if (method === "POST" && path === "/api/followups") {
        return json(await createFollowup(db, await readBody(request)), 201)
      }

      m = path.match(/^\/api\/followups\/([^/]+)\/complete$/)
      if (m && method === "POST") {
        return json(await completeFollowup(db, decodeURIComponent(m[1]), await readBody(request)))
      }

      // ---------- estimates ----------
      if (method === "GET" && path === "/api/estimates") {
        return json(await listEstimates(db, url.searchParams.get("status") ?? undefined))
      }

      if (method === "POST" && path === "/api/estimates") {
        return json(await createEstimate(db, await readBody(request)), 201)
      }

      // ---------- reactivations ----------
      if (method === "GET" && path === "/api/reactivations") {
        return json(await listReactivations(db))
      }

      if (method === "POST" && path === "/api/reactivations/identify") {
        return json(await identifyReactivations(db))
      }

      m = path.match(/^\/api\/reactivations\/([^/]+)\/run$/)
      if (m && method === "POST") {
        return json(await runReactivation(db, decodeURIComponent(m[1])))
      }

      // ---------- human tasks ----------
      if (method === "GET" && path === "/api/tasks") {
        return json(await listHumanTasks(db, url.searchParams.get("status") ?? undefined))
      }

      m = path.match(/^\/api\/tasks\/([^/]+)$/)
      if (m && method === "PATCH") {
        return json(await updateHumanTask(db, decodeURIComponent(m[1]), await readBody(request)))
      }

      return json({ error: `No route for ${method} ${path}` }, 404)
    } catch (e) {
      return errorResponse(e)
    }
  }
}
