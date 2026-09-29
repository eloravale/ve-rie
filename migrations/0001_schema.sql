-- VÉRIA schema (Cloudflare D1 / SQLite)
-- Companies are single-company demo scoped; all rows carry company_id.

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  city TEXT,
  state TEXT,
  phone TEXT,
  website TEXT,
  avg_ticket REAL NOT NULL DEFAULT 4800,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  service TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'website',
  urgency TEXT NOT NULL DEFAULT 'normal',
  estimated_value REAL NOT NULL DEFAULT 0,
  notes TEXT,
  next_action TEXT,
  next_action_at TEXT,
  last_activity_at TEXT,
  recovered_via TEXT,
  lost_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_leads_company_status ON leads(company_id, status);
CREATE INDEX idx_leads_company_created ON leads(company_id, created_at);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  lifetime_value REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  lead_id TEXT,
  channel TEXT NOT NULL DEFAULT 'sms',
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  simulated INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,
  body TEXT NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE followups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  lead_id TEXT NOT NULL REFERENCES leads(id),
  estimate_id TEXT,
  kind TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TEXT,
  recommended_action TEXT,
  notes TEXT,
  completed_at TEXT,
  outcome TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_followups_company_status ON followups(company_id, status);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  lead_id TEXT NOT NULL REFERENCES leads(id),
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  technician TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE estimates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  lead_id TEXT NOT NULL REFERENCES leads(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TEXT,
  expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_estimates_company_status ON estimates(company_id, status);

CREATE TABLE reactivations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  lead_id TEXT NOT NULL REFERENCES leads(id),
  status TEXT NOT NULL DEFAULT 'identified',
  reason TEXT NOT NULL DEFAULT 'dormant',
  estimated_value REAL NOT NULL DEFAULT 0,
  recommended_action TEXT,
  identified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE missed_calls (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  caller_name TEXT,
  caller_phone TEXT NOT NULL,
  called_at TEXT NOT NULL,
  recovered INTEGER NOT NULL DEFAULT 0,
  lead_id TEXT,
  estimated_value REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_missed_calls_company_recovered ON missed_calls(company_id, recovered);

CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT,
  referred_name TEXT,
  referred_phone TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  estimated_value REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE satisfaction_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT,
  lead_id TEXT,
  score INTEGER,
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE human_tasks (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  lead_id TEXT,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  estimated_value REAL NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor TEXT NOT NULL DEFAULT 'veria',
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_company_created ON audit_events(company_id, created_at);
