-- VÉRIA Revenue Recovery infrastructure (additive — nothing existing is dropped).
-- 1) Region/currency settings per company (US / UK / EU).
-- 2) Enquiries log: powers Response Health + slow-response leakage.
-- 3) Recovery opportunities: unified LEAK → IDENTIFY → PRIORITIZE → RECOVER pipeline.
-- 4) Import batches: CSV-first prospect onboarding provenance.
-- 5) Light columns on existing tables (job_type, assigned_to, quote last-contact).

ALTER TABLE leads ADD COLUMN job_type TEXT;
ALTER TABLE human_tasks ADD COLUMN assigned_to TEXT;

ALTER TABLE estimates ADD COLUMN last_contact_at TEXT;
ALTER TABLE estimates ADD COLUMN quote_status TEXT NOT NULL DEFAULT 'sent'
  CHECK (quote_status IN ('new','sent','followup_due','customer_replied','negotiation','booked','lost','no_response','expired'));
ALTER TABLE estimates ADD COLUMN recovery_priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (recovery_priority IN ('low','medium','high'));

CREATE TABLE company_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies(id),
  region TEXT NOT NULL DEFAULT 'us' CHECK (region IN ('us','uk','eu')),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','GBP','EUR')),
  date_format TEXT NOT NULL DEFAULT 'MDY' CHECK (date_format IN ('MDY','DMY')),
  retention_days INTEGER NOT NULL DEFAULT 365,
  data_source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE enquiries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  lead_id TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  channel TEXT NOT NULL DEFAULT 'phone',
  received_at TEXT NOT NULL,
  first_response_at TEXT,
  response_minutes INTEGER,
  urgency TEXT NOT NULL DEFAULT 'normal',
  job_type TEXT,
  estimated_value REAL NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_enquiries_company_time ON enquiries(company_id, received_at);

CREATE TABLE recovery_opportunities (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('missed_call','slow_response','unworked_lead','quote','dormant_customer','booking_failure','handoff')),
  source_id TEXT,
  lead_id TEXT,
  customer_name TEXT NOT NULL,
  job_type TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  why TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  estimated_value REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  stage TEXT NOT NULL DEFAULT 'identified'
    CHECK (stage IN ('identified','contacted','responded','qualified','booked','recovered','lost')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  owner TEXT,
  age_days INTEGER NOT NULL DEFAULT 0,
  last_event_at TEXT,
  import_batch_id TEXT,
  outcome_type TEXT,
  recovered_value REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_ro_company_stage ON recovery_opportunities(company_id, stage);
CREATE INDEX idx_ro_company_source ON recovery_opportunities(company_id, source_type);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL CHECK (kind IN ('leads','calls','quotes','customers')),
  filename TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  mapping TEXT,
  created_at TEXT NOT NULL
);
