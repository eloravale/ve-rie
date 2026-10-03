/**
 * Revenue Recovery Audit — professional HTML export.
 *
 * Generates a self-contained, VÉRIA-branded document from the same AuditDoc
 * the screen renders (no extra dependencies, no second source of numbers).
 * Includes: branding, company, period, data sources, identified opportunity
 * with category breakdown, top opportunities with recommended actions, the
 * canonical-ledger recovered section (assumed/analytical vs recorded), a
 * methodology note, and the required disclaimer.
 */

export interface AuditExportDoc {
  company: { name: string; city: string; state: string; region: string; currency: string }
  workspace_kind: "demo" | "prospect" | "customer"
  period_days: number
  generated_at: string
  data_basis: string
  data_sources: { source: string; scope: string; count: number }[]
  enquiries: number
  missed_unanswered: number
  slow_responses: number
  open_quotes: number
  open_quotes_value: number
  overdue_quotes: number
  dormant_customers: number
  opportunity: {
    missed_enquiries: number
    quote_followup: number
    dormant_customers: number
    slow_responses: number
    other: number
    total: number
  }
  top_actions: {
    rank: number
    title: string
    customer: string
    value: number
    why: string
    recommended_action: string
    age_days: number
    priority: string
    stage: string
  }[]
  recovered: {
    value: number
    events: number
    by_basis: { opportunity: number; recorded: number; assumed: number; analytical: number }
  }
  disclaimer: string
}

const WORKSPACE_LABEL: Record<AuditExportDoc["workspace_kind"], string> = {
  demo: "Illustrative demo data",
  prospect: "Imported prospect data",
  customer: "Customer data"
}

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const STAGE_LABEL: Record<string, string> = {
  identified: "Identified",
  contacted: "Contacted",
  responded: "Responded",
  qualified: "Qualified",
  booked: "Booked",
  recovered: "Recovered",
  lost: "Lost"
}

export function auditToHtml(doc: AuditExportDoc): string {
  const fmtDate = doc.generated_at.slice(0, 10)
  const rows = (pairs: [string, string | number][]) =>
    pairs
      .map(
        ([k, v]) =>
          `<tr><td class="k">${esc(k)}</td><td class="v">${typeof v === "number" ? esc(v) : esc(v)}</td></tr>`
      )
      .join("")

  const topActions = doc.top_actions
    .map(
      (a) => `
      <li class="action">
        <div class="action-head">
          <span class="rank">${String(a.rank).padStart(2, "0")}</span>
          <span class="action-title">${esc(a.title)}</span>
          <span class="action-value">${usd(a.value)}</span>
        </div>
        <div class="action-meta">${esc(a.customer)} · priority ${esc(a.priority)} · ${a.age_days}d old · status ${esc(
        STAGE_LABEL[a.stage] ?? a.stage
      )}</div>
        <div class="action-why">${esc(a.why)}</div>
        <div class="action-next">Recommended action: ${esc(a.recommended_action)}</div>
      </li>`
    )
    .join("")

  const basis = doc.recovered.by_basis
  const basisRows: [string, string][] = [
    ["Recorded (real outcomes recorded)", usd(basis.recorded)],
    ["Assumed (historical seed, labelled)", usd(basis.assumed)],
    ["Analytical (model-derived, labelled)", usd(basis.analytical)],
    ["Opportunity basis", usd(basis.opportunity)]
  ]

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VÉRIA Revenue Recovery Audit — ${esc(doc.company.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f6f1e7; color: #26232a;
    font-family: Georgia, "Times New Roman", serif; line-height: 1.55; }
  .sheet { max-width: 820px; margin: 0 auto; padding: 48px 44px; }
  .brand { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 2px solid #26232a; padding-bottom: 14px; }
  .brand .mark { font-size: 26px; letter-spacing: 0.34em; font-weight: 700; }
  .brand .tag { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #8a6d2f; }
  h1 { font-size: 34px; margin: 26px 0 4px; font-weight: 600; }
  .sub { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6570; }
  .chip { display: inline-block; margin-top: 12px; padding: 3px 10px; border: 1px solid #8a6d2f;
    color: #8a6d2f; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; }
  h2 { font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase; color: #6b6570;
    margin: 38px 0 10px; border-top: 1px solid #cfc6b4; padding-top: 16px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 7px 4px; border-bottom: 1px solid #ddd4c2; }
  td.k { color: #4b4650; } td.v { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .total td { border-top: 2px solid #26232a; border-bottom: none; font-size: 20px; padding-top: 12px; }
  .total .v { color: #8a6d2f; font-size: 26px; }
  .ledger { border: 1px solid #cfc6b4; background: #fbf8f1; padding: 16px 18px; }
  .ledger .headline { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .note { font-size: 12px; color: #6b6570; }
  ol.actions { list-style: none; padding: 0; margin: 0; }
  .action { border-bottom: 1px solid #ddd4c2; padding: 12px 0; }
  .action-head { display: flex; gap: 12px; align-items: baseline; }
  .rank { font-style: italic; color: #8a6d2f; font-size: 18px; }
  .action-title { font-weight: 700; flex: 1; }
  .action-value { font-variant-numeric: tabular-nums; font-weight: 700; }
  .action-meta { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6570; margin: 3px 0 0 34px; }
  .action-why { font-size: 13px; margin: 4px 0 0 34px; color: #4b4650; }
  .action-next { font-size: 13px; font-weight: 700; margin: 4px 0 0 34px; color: #26232a; }
  .method { font-size: 13px; color: #4b4650; }
  .disclaimer { margin-top: 14px; padding: 14px 16px; border: 2px solid #26232a;
    font-style: italic; font-size: 14px; }
  footer { margin-top: 34px; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
    color: #6b6570; display: flex; justify-content: space-between; border-top: 1px solid #cfc6b4; padding-top: 12px; }
  @media print { body { background: #fff; } .sheet { padding: 0; } }
</style>
</head>
<body>
<div class="sheet">
  <div class="brand">
    <span class="mark">VÉRIA</span>
    <span class="tag">Revenue Recovery Audit</span>
  </div>

  <h1>${esc(doc.company.name)}</h1>
  <div class="sub">${esc(doc.company.city)}${doc.company.city && doc.company.state ? ", " : ""}${esc(
    doc.company.state
  )} · analysis period: last ${doc.period_days} days · issued ${esc(fmtDate)}</div>
  <span class="chip">${esc(WORKSPACE_LABEL[doc.workspace_kind])}</span>

  <h2>Data sources</h2>
  <table>${rows(doc.data_sources.map((d) => [`${d.source} — ${d.scope}`, d.count]))}</table>

  <h2>Findings</h2>
  <table>
    ${rows([
      ["Enquiries analysed", doc.enquiries],
      ["Missed / unanswered enquiries", doc.missed_unanswered],
      ["Slow responses (30m+)", doc.slow_responses],
      ["Open quotes / estimates", doc.open_quotes],
      ["Open quote value", usd(doc.open_quotes_value)],
      ["Overdue quote follow-ups", doc.overdue_quotes],
      ["Dormant customers", doc.dormant_customers]
    ])}
  </table>

  <h2>Identified recovery opportunity <span class="note">— not guaranteed revenue</span></h2>
  <table>
    ${rows([
      ["Missed enquiries", usd(doc.opportunity.missed_enquiries)],
      ["Quote follow-up", usd(doc.opportunity.quote_followup)],
      ["Dormant customers", usd(doc.opportunity.dormant_customers)],
      ["Slow responses", usd(doc.opportunity.slow_responses)],
      ["Other categories", usd(doc.opportunity.other)]
    ])}
    <tr class="total"><td class="k"><strong>Total identified opportunity</strong></td><td class="v">${usd(
      doc.opportunity.total
    )}</td></tr>
  </table>

  <h2>Recorded recovered revenue <span class="note">— canonical ledger (revenue_events)</span></h2>
  <div class="ledger">
    <div class="headline">${usd(doc.recovered.value)}</div>
    <div class="note">across ${doc.recovered.events} recorded event${doc.recovered.events === 1 ? "" : "s"} · value basis breakdown:</div>
    <table>${rows(basisRows)}</table>
    <div class="note">Identified opportunity (above) and recovered revenue (here) are different numbers and are never added together.</div>
  </div>

  <h2>Top recovery opportunities &amp; recommended actions</h2>
  <ol class="actions">${topActions || '<li class="note">No open opportunities in this period.</li>'}</ol>

  <h2>Methodology</h2>
  <div class="method">
    <p>${esc(doc.data_basis)}</p>
    <p>Opportunities are identified by deterministic, readable rules (no black box): calls with no recorded
    callback, enquiries with no or slow first response, quotes with no recorded follow-up, leads with no next
    step, customers idle 30+ days, unconfirmed appointment requests, and owner handoffs open 2+ days. Response
    health uses only the enquiries recorded in this workspace — no industry benchmarks. Recovered revenue is
    reported only from the canonical revenue_events ledger, with each entry's value basis labelled
    (recorded / assumed / analytical / opportunity).</p>
  </div>

  <div class="disclaimer">“Identified recovery opportunities are not guaranteed revenue.”</div>

  <footer>
    <span>VÉRIA — Revenue Recovery Infrastructure</span>
    <span>${esc(WORKSPACE_LABEL[doc.workspace_kind])} · ${esc(fmtDate)}</span>
  </footer>
</div>
</body>
</html>`
}
