/// <reference types="@cloudflare/workers-types" />
import type { Database } from "./db"
import { ValidationError, LEAD_SOURCES, LEAD_STATUSES, LEAD_URGENCIES } from "./validation"
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
import { resetDemo } from "./demo"

export interface Env {
  DB: Database
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS }
  })
}

function errorResponse(e: unknown): Response {
  if (e instanceof ValidationError) {
    return json({ error: e.message, fields: e.fields }, e.status)
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

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS })

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
      if (method === "POST" && path === "/api/demo/reset") {
        return json(await resetDemo(db))
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
          urgencies: LEAD_URGENCIES
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
