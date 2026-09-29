# VÉRIA — Next Phases (Post-Validation)

This list is intentionally NOT built yet. The sellable MVP (see MVP_SCOPE.md) is complete.
Each phase starts only after real customer conversations validate demand.

Sprint classification used:
**A = required for sellable MVP (built) · B = nice to have · C = future**

---

## Phase 1 — First real customers (paid pilots)

**Trigger:** 2–3 prospects agree to a paid Revenue Recovery Audit.

- **B** Simple per-company provisioning (one D1 namespace per customer, seeded from their audit data)
- **B** Basic auth (single shared owner login per company — email code, not full identity)
- **B** Real lead intake: webhook endpoint for website forms (Typeform, WPForms, GoHighLevel)
- **B** CSV import of the prospect's real leads for the audit report
- **C** Read-only ServiceTitan / Housecall Pro / Jobber sync

## Phase 2 — Real missed-call capture

**Trigger:** pilot customers forward call notifications.

- **A (then)** Twilio number per customer with voicemail/missed-call webhook → existing missed_calls pipeline (schema already supports it)
- **B** Email-to-lead ingestion (carrier missed-call emails parsed into the same pipeline)
- **C** Full carrier/SIP integration

## Phase 3 — Supervised outbound

**Trigger:** customers ask VÉRIA to send follow-ups.

- **A (then)** Real SMS sending for owner-approved follow-ups (provider interface already mockable)
- **B** Approved email templates + sending
- **B** Conversation transcript UI (conversations/messages schema exists)
- **C** Two-way AI SMS agent with human handoff thresholds (tuned per owner)

## Phase 4 — Trust & production hardening

- **A (then)** Multi-tenant data isolation review, per-company API keys
- **B** Rate limiting, structured logging, uptime alerting
- **B** Backups/DR for D1, PII retention policy
- **C** SOC2-adjacent security review, enterprise SSO

## Phase 5 — Revenue expansion

- **B** Referral tracking + satisfaction events (schema exists, UI deferred)
- **B** Estimate document generation
- **B** Technician/appointment scheduling depth
- **C** Billing (Stripe), marketplace, custom model training, multi-location rollups

---

## Deliberately deferred from the MVP sprint (classification record)

| Item | Class | Reason |
|---|---|---|
| Real SMS/voice/telephony | C→A in Phase 2 | Paid infra; not needed to sell the outcome |
| Twilio integration | C→A in Phase 2 | Same |
| Paid AI APIs | C | Rules-based score demos the value with zero cost |
| CRM integrations | C→B in Phase 1 | Sync depth not needed for audit-led sales |
| Stripe/billing | C | No revenue until pilots close |
| Enterprise SSO / advanced auth | C | Single-user demo environment suffices |
| Multi-tenant architecture | C→A in Phase 4 | One demo tenant today |
| Mobile native app | C | Responsive web covers the phone workflow |
| Technician dispatch / invoicing / payments | C | Adjacent verticals, not the wedge |
| Autonomous multi-agent orchestration | C | Human-handoff model is the selling point |
| Large analytics/BI | C | One dashboard sells the story |

**Rule of thumb going forward:** build only what a signed pilot requires; everything else waits for validation.
