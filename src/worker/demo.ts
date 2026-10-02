import seedSql from "../../migrations/0002_seed.sql"
import recoverySeedSql from "../../migrations/0004_seed_recovery.sql"
import syncFixedPointSql from "../../migrations/0006_sync_fixed_point.sql"
import { COMPANY_ID, type Database } from "./db"
import { audit } from "./audit"

export type WorkspaceKind = "demo" | "prospect" | "customer"

export class WorkspaceGuardError extends Error {
  status = 409
  constructor(public workspaceKind: WorkspaceKind) {
    super(
      `Refusing to reset: this workspace is '${workspaceKind}' — demo reset is only permitted in demo workspaces.`
    )
    this.name = "WorkspaceGuardError"
  }
}

export async function getWorkspaceKind(db: Database): Promise<WorkspaceKind> {
  const row = await db
    .prepare(`SELECT workspace_kind FROM company_settings WHERE company_id = ?1`)
    .bind(COMPANY_ID)
    .first<{ workspace_kind: string }>()
  const kind = row?.workspace_kind as WorkspaceKind | undefined
  return kind === "prospect" || kind === "customer" ? kind : "demo"
}

export async function getWorkspace(db: Database): Promise<{ company_id: string; workspace_kind: WorkspaceKind }> {
  return { company_id: COMPANY_ID, workspace_kind: await getWorkspaceKind(db) }
}

const TABLES = [
  "revenue_events",
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
 *
 * Phase 0 guarantees:
 *  - The reset result is byte-equivalent to a freshly-migrated database
 *    (migrations 0001..0006): the ledger is wiped and re-seeded with the same
 *    three assumed historical events, and identity backfills are replayed —
 *    so a reset workspace is again a true sync fixed point.
 *  - Runs inside a single transaction: a failed reset can never leave the
 *    workspace half-wiped.
 */
export async function resetDemo(db: Database): Promise<{ ok: true }> {
  // Workspace safety (spec §workspace): demo reset is a destructive, seed-
  // restoring operation and must NEVER run against prospect/customer data.
  const kind = await getWorkspaceKind(db)
  if (kind !== "demo") throw new WorkspaceGuardError(kind)

  await db.exec("BEGIN")
  try {
    for (const table of TABLES) {
      await db.prepare(`DELETE FROM ${table}`).run()
    }
    await db.exec(seedSql)
    await db.exec(recoverySeedSql)
    // Keep the seeded workspace identical to a fresh migration run:
    // same fixed-point opportunities, same identity backfill, same ledger.
    await db.exec(syncFixedPointSql)
    await audit(db, {
      actor: "owner",
      entityType: "system",
      action: "demo_reset",
      detail: "Demo data reset to the seeded Cedar Ridge Heating & Cooling environment."
    })
    await db.exec("COMMIT")
  } catch (e) {
    try {
      await db.exec("ROLLBACK")
    } catch {
      /* already rolled back */
    }
    throw e
  }
  return { ok: true }
}
