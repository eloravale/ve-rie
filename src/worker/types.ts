import type { LeadStatus, LeadSource, LeadUrgency } from "./validation"

export interface Lead {
  id: string
  company_id: string
  name: string
  email: string | null
  phone: string | null
  service: string | null
  status: LeadStatus
  source: LeadSource
  urgency: LeadUrgency
  estimated_value: number
  notes: string | null
  next_action: string | null
  next_action_at: string | null
  last_activity_at: string | null
  recovered_via: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
}

export interface Followup {
  id: string
  company_id: string
  lead_id: string
  estimate_id: string | null
  kind: string
  status: string
  due_at: string | null
  recommended_action: string | null
  notes: string | null
  completed_at: string | null
  outcome: string | "recovered" | "lost"
  created_at: string
  updated_at: string
}

export interface Estimate {
  id: string
  company_id: string
  lead_id: string
  amount: number
  status: string
  sent_at: string | null
  expires_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
