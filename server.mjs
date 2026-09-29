/**
 * Minimal local API server that reproduces the Cloudflare Worker's routing and
 * D1 data layer on top of Node's built-in SQLite (node:sqlite, Node >= 22).
 *
 * Purpose: let VÉRIA run — identically — in CI, Freebuff Cloud, and any machine
 * WITHOUT a Cloudflare account or any secrets. The Worker code is unchanged;
 * only the execution environment differs.
 *
 * Usage:
 *   node server.mjs            # serve API on :8787 (also serves dist/web if built)
 *   VERIA_RESET=1 node server.mjs   # wipe the local demo database and reseed
 *   PORT=9000 node server.mjs
 */

import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname)
const DB_FILE = process.env.VERIA_DB || path.join(ROOT, ".veria-local.db")
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 8787
const HOST = process.env.HOST || "0.0.0.0"

if (process.env.VERIA_RESET === "1" || process.argv.includes("--reset")) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(DB_FILE + suffix, { force: true })
    } catch {
      // best effort — the file may not exist yet
    }
  }
  console.log("[veria] local demo database reset requested")
}

const db = new DatabaseSync(DB_FILE)
db.exec("PRAGMA journal_mode = WAL;")

// ---------- migrations + seed ----------
const MIGRATIONS_DIR = path.join(ROOT, "migrations")
const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()

db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
const applied = new Set(db.prepare("SELECT name FROM _migrations").all().map((r) => r.name))

for (const file of migrationFiles) {
  if (applied.has(file)) continue
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
  db.exec("BEGIN")
  try {
    db.exec(sql)
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, datetime('now'))").run(file)
    db.exec("COMMIT")
    console.log(`[veria] applied migration ${file}`)
  } catch (e) {
    db.exec("ROLLBACK")
    console.error(`[veria] migration ${file} failed:`, e.message)
    process.exit(1)
  }
}

// ---------- D1-compatible adapter ----------
function adapter(database) {
  const run = (sql, params) => {
    const stmt = database.prepare(sql)
    return params && params.length ? stmt.all(...params) : stmt.all()
  }
  return {
    prepare(sql) {
      let bound = []
      return {
        bind(...values) {
          bound = values.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v))
          return this
        },
        async first() {
          const rows = run(sql, bound)
          return rows[0] ?? null
        },
        async all() {
          const results = run(sql, bound)
          return { results, success: true, meta: { changes: results.length } }
        },
        async run() {
          const results = run(sql, bound)
          return { results, success: true, meta: { changes: results.length } }
        }
      }
    },
    async exec(sql) {
      database.exec(sql)
    }
  }
}

// ---------- worker under node ----------
const workerModule = await import(pathToFileURL(path.join(ROOT, "dist-worker", "index.js")).href)
const worker = workerModule.default

const WEB_DIR = path.join(ROOT, "dist", "web")
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2"
}

function serveStatic(pathname, res) {
  const webIndex = path.join(WEB_DIR, "index.html")
  if (!fs.existsSync(webIndex)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(
      "<!doctype html><html><body style=\"font-family:system-ui;background:#0b0c0f;color:#c6cbd5;padding:48px\">" +
      "<h1 style=\"color:#c9a35f\">VÉRIA API is running</h1>" +
      "<p>The API is live on this port. For the full app UI run <code>npm run dev</code> and open port 5173, or build the web app (<code>npm run build</code>) and restart this server.</p>" +
      "<p>Try <a style=\"color:#c9a35f\" href=\"/api/dashboard\">/api/dashboard</a></p>" +
      "</body></html>"
    )
    return
  }
  let rel = pathname === "/" ? "/index.html" : pathname
  let file = path.join(WEB_DIR, path.normalize(rel).replace(/^([.][.][/\\])+/, ""))
  if (!file.startsWith(WEB_DIR)) file = webIndex
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = webIndex // SPA fallback
  }
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  try {
    if (url.pathname.startsWith("/api/")) {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const body = Buffer.concat(chunks)
      const init = {
        method: req.method,
        headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) || body.length === 0 ? undefined : body
      }
      const request = new Request(url.toString(), init)
      const env = { DB: adapter(db), ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }
      const response = await worker.fetch(request, env)
      const buf = Buffer.from(await response.arrayBuffer())
      const headers = {}
      response.headers.forEach((v, k) => (headers[k] = v))
      res.writeHead(response.status, headers)
      res.end(buf)
      return
    }
    serveStatic(url.pathname, res)
  } catch (e) {
    console.error("[veria] request error:", e)
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: e.message }))
  }
})

server.listen(PORT, HOST, () => {
  const actual = server.address()?.port ?? PORT
  console.log(`[veria] API + app ready on http://localhost:${actual}  (local SQLite: ${DB_FILE})`)
})
