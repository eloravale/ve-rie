import { COMPANY_ID, newId, nowIso, type Database } from "./db"

/** Record an audit event. Never throws — auditing must not break requests. */
export async function audit(
  db: Database,
  opts: {
    actor?: string
    entityType: string
    entityId?: string
    action: string
    detail?: string
  }
): Promise<void> {
  try {
    const id = newId("aud")
    await db
      .prepare(
        `INSERT INTO audit_events (id, company_id, actor, entity_type, entity_id, action, detail, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(
        id,
        COMPANY_ID,
        opts.actor ?? "veria",
        opts.entityType,
        opts.entityId ?? null,
        opts.action,
        opts.detail ?? null,
        nowIso()
      )
      .run()
  } catch {
    // Auditing is best-effort; never fail a request because of it.
  }
}
