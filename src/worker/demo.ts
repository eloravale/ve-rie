import seedSql from "../../migrations/0002_seed.sql"
import recoverySeedSql from "../../migrations/0004_seed_recovery.sql"
import type { Database } from "./db"
import { audit } from "./audit"

const TABLES = [
  "audit_events",
  "human_tasks",
  "satisfaction_events",
  "referrals",
  "missed_calls",
  "reactivations",
  "import_batches",
  "recovery_opportunities",
  "enquiries",
  "company_settings",
  "estimates",
  "appointments",
  "followups",
  "messages",
  "conversations",
  "customers",
  "leads",
  "companies"
]

/**
 * Reset the demo environment to pristine seeded state.
 * Demo-safe: only touches the demo company's data in the single-company demo DB.
 */
export async function resetDemo(db: Database): Promise<{ ok: true }> {
  for (const table of TABLES) {
    await db.prepare(`DELETE FROM ${table}`).run()
  }
  await db.exec(seedSql)
  await db.exec(recoverySeedSql)
  await audit(db, {
    actor: "owner",
    entityType: "system",
    action: "demo_reset",
    detail: "Demo data reset to the seeded Cedar Ridge Heating & Cooling environment."
  })
  return { ok: true }
}
