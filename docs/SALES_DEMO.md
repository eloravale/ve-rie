# VÉRIA — Sales Demo Guide

Read this from your phone. Everything below works on the live demo — no preparation needed.

---

## 1. One-sentence pitch

> **VÉRIA shows HVAC companies the revenue they are losing right now — missed calls, unanswered leads, forgotten estimates, dormant customers — and walks them through recovering it.**

---

## 2. 30-second pitch

"Every HVAC company loses money in four predictable places: missed phone calls, web leads nobody called back, estimates that were never followed up, and past customers who went quiet. Most owners have no idea how much that adds up to. VÉRIA puts a dollar figure on it — and shows you exactly what to do about each one, today. In the demo you'll see a business that is currently letting **forty-plus thousand dollars** slip, and how much of it gets recovered with a few phone calls."

---

## 3. 2-minute demo script (phone-friendly)

1. **Open the live URL** (bookmark it on your phone home screen).
2. **Dashboard** — point at the two headline numbers:
   - *Revenue recovered: $22,400* ("this is money that came back — the ledger
     shows $16,000 we assumed from estimates and $6,400 recorded outcomes")
   - *Revenue at risk: $44,740* ("this is money walking out the door right now")
   - Say: "Everything on this screen comes from one question — what is this business losing, and why?"
3. **Owner Daily Brief** (same page) — "Every morning the owner gets five ranked actions with dollar values. This is the whole product in one card."
4. **Tap Lost-Revenue Radar** — scroll the list: missed calls, unanswered leads, idle estimates, dormant leads. "Each one has a value, an urgency, and the recommended action."
5. **Tap any lead** — show the Opportunity Score and its breakdown. "No black box — every point is explained."
6. **Back to Demo Mode** — run one guided step (e.g. recover a missed call) and point at the *Recovered today* number going up.

Close: "This is exactly what VÉRIA would watch for your company. Want me to run your numbers?"

---

## 4. 5-minute demo script

**Minute 1 — the pain.** On the dashboard: "The average HVAC company misses 10–15% of inbound calls, lets a third of web leads go cold, and follows up on estimates less than twice. Each one feels small. Together, for a company this size, it's **$44,740 sitting in this red number**."

**Minute 2 — the radar.** Open **Lost-Revenue Radar**. Walk 2–3 items top to bottom:
- "Irene Castillo called six days ago, nobody called back — **$4,800** probably already booked with a competitor."
- "James Whitfield has a $9,800 estimate that's nine days old. Most estimates close on follow-up two or three, not one."
- "Sarah Jenkins wanted a $9,200 boiler, went quiet 45 days ago. She's still in the market — she's just forgotten."

**Minute 3 — the workflow.** Open a radar item's lead. Show the workflow strip (New → Contacted → Qualified → Appointment → Estimate → Won), the Opportunity Score with its written reasoning, and the recommended next action.

**Minute 4 — recovery in action.** Go to **Missed-Call Recovery**. Tap **Start recovery** on the top call. Show what appears: a lead is created, an owner call-back task appears, the audit trail records it. "Notice — VÉRIA doesn't pretend to be autonomous. Anything personal goes to the owner as a task with a value and a priority. That's deliberate: homeowners want a human to call them back."

**Minute 5 — the money.** Open **Demo Mode** and run the guided steps, or just return to the dashboard. "Recovered $22,400, at-risk $44,740. In a real deployment, this dashboard watches your phone line, your web forms, and your estimate list 24/7. The average customer we model recovers $2–6k/month. What would that be worth at your volume?"

---

## 5. Revenue Recovery Audit (the offer to sell)

Frame the first engagement as a **Revenue Recovery Audit** — VÉRIA analyzes the prospect's own numbers and returns a report:

- calls missed last month (with estimated job value)
- web leads that never got a first response
- estimates older than 7 days with no recorded follow-up
- dormant past customers with open intent
- **a dollar range of recoverable revenue**

The demo environment IS the sample audit. The close: "Imagine this dashboard filled with your company's numbers. The audit takes two weeks and the findings are guaranteed or it's free."

---

## 6. Common objections

| Objection | What they're really saying |
|---|---|
| "I already have a CRM." | "My software stores leads. This tells me where money is leaking." |
| "My office girl answers the phones." | "She's busy. What happens at 4:52pm on a Friday?" |
| "AI is a gimmick." | "Where does it say 'AI' on this screen? These are your numbers and plain rules." |
| "Too busy to implement." | "There's nothing to implement. You make phone calls; VÉRIA tells you which one." |
| "My customers don't like robots." | "Correct — that's why every personal touch is a human task, not a bot." |
| "How much?" | (defer — see responses below) |

---

## 7. Responses to objections

- **CRM:** "Great — VÉRIA doesn't replace it, it watches it. CRMs store history; VÉRIA finds the money stuck inside. Look at this red number — your CRM can't show you that."
- **Office staff:** "This isn't about replacing anyone. Look at this missed call from Friday 4:52pm — that's a $4,800 job that probably called your competitor. VÉRIA catches what falls through when humans get busy."
- **AI gimmick:** "Open any lead — the score shows its math. Deal size, urgency, recency. No magic. The value is the discipline: nothing gets forgotten."
- **Too busy:** "Setup for the pilot is: you forward missed-call notifications and give read access to your leads. That's it. The demo you're holding took zero setup."
- **Robots:** "Exactly. That's why VÉRIA's design principle is 'human handoff.' The system never contacts a customer by itself in this phase — it tells you who to call and why."
- **Price:** "Before we talk price, let's agree on the number. If this red number is $44k at a company this size, what's yours? If I can recover even a quarter of it, what's that worth annually? Then price becomes simple math."

---

## 8. Exact demo flow (bookmark order)

1. Dashboard (headline metrics + Owner Daily Brief)
2. Radar (2–3 items)
3. One lead detail (score breakdown + workflow strip)
4. Missed Calls → Start recovery
5. Tasks (owner handoff completed)
6. Dashboard again (recovered number moved)
7. Demo Mode → Reset before the NEXT prospect (one tap — reset is refused on
   non-demo workspaces, so it can never touch a pilot customer's data)

---

## 9. What is REAL in this MVP

- Live web app + API, real database (Cloudflare D1 in production, equivalent local SQLite in dev)
- Full lead management: create, search, filter, edit, status changes, pagination, audit trail
- Deterministic opportunity scoring with explainable breakdowns
- Recovery workflow logic: missed-call intake → lead + owner task; follow-up completion → revenue counters; reactivation queue; human handoff tasks
- Dashboard, radar, and brief computed live from the data
- Demo Mode reset — wipes and re-seeds to a pristine state in one tap

## 10. What is SIMULATED

- The demo company, callers, and leads (Cedar Ridge Heating & Cooling is fictional)
- Missed-call capture (no phone line is connected; calls are seeded data)
- "Call placed", "estimate delivered", "outreach sent" actions — recorded as workflow state + audit events, **nothing is ever sent to a real person**
- The estimate document itself (amount + follow-up state only)

## 11. What requires FUTURE INTEGRATION

- Real telephony: forwarding/carrier integration to ingest actual missed calls
- Real SMS/email sending for follow-ups and reactivation outreach
- Two-way AI conversation handling (the long-term product vision)
- CRM/company software sync (ServiceTitan, Housecall Pro, Jobber)
- Auth with per-customer logins (current demo is a single shared demo environment)
- Automated production deployment (currently one manual command — see MVP_SCOPE.md)

---

*Tip: before each demo, open Demo Mode → Reset. Fresh numbers, full radar, clean story. The recovered headline comes from one canonical ledger — the same number on every screen, with recorded vs assumed money disclosed.*
