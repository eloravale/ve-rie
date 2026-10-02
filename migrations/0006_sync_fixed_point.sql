-- Phase 0 (Foundation + Truth) — seed becomes a true SYNC FIXED POINT.
--
-- Spec §11: running sync on a freshly seeded workspace must create exactly
-- ZERO opportunities. Before this migration the seed was missing the rows a
-- first sync would derive from the underlying demo data (a freshly missed
-- call, five slow-response enquiries, one unconfirmed appointment request).
--
-- This migration is IDEMPOTENT — resetDemo replays it after re-seeding:
--   * DELETE removes the double-represented handoff row (spec §10): Ellen
--     Wiggins already has an open quote opportunity (rop_8015); the handoff
--     card counted the same job twice.
--   * INSERT OR IGNORE materializes exactly the opportunities sync derives
--     today, with deterministic ids. On a database where sync already ran,
--     the identity UNIQUE index makes these inserts no-ops.
--   * Values for last_event_at come from the SOURCE rows (subselects) so the
--     cards always point at the real underlying activity.
--
-- DROP/CREATE normalizes the identity index on databases that applied an
-- earlier 0005 revision with a non-partial unique index.

DELETE FROM recovery_opportunities WHERE id = 'rop_8014';

-- Safety backfill (0005 already does this; kept so 0006 stands alone).
UPDATE recovery_opportunities
SET identity_key = CASE
  WHEN source_id IS NOT NULL THEN source_type || ':' || source_id
  ELSE source_type || ':cust:' || LOWER(TRIM(customer_name))
END
WHERE identity_key IS NULL;

DROP INDEX IF EXISTS idx_ro_identity;
CREATE UNIQUE INDEX idx_ro_identity ON recovery_opportunities(identity_key)
  WHERE identity_key IS NOT NULL AND stage NOT IN ('recovered','lost');

-- ---------------------------------------------------------------------------
-- Materialized fixed point: exactly what syncOpportunities() derives from the
-- seeded demo data (nothing more — the other candidates are already covered
-- by an open opportunity for the same lead/customer and are never created).
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO recovery_opportunities
  (id, company_id, source_type, source_id, identity_key, lead_id, customer_name, job_type, category, title, why,
   recommended_action, estimated_value, stage, priority, owner, age_days, last_event_at, created_at, updated_at)
VALUES
('rop_8110','cmp_1000','missed_call','mcl_4007','missed_call:mcl_4007',NULL,'Irene Castillo','other','Missed enquiries',
 'Missed call — Irene Castillo',
 'Called 6 days ago and nobody was able to answer. High-intent customers like this usually call the next company within hours.',
 'Call Irene Castillo back today and qualify the request.',
 4800,'identified','high','owner',6,
 (SELECT called_at FROM missed_calls WHERE id = 'mcl_4007'),
 datetime('now','-6 days'), datetime('now','-6 days')),

('rop_8111','cmp_1000','slow_response','enq_7008','slow_response:enq_7008',NULL,'Marcus Webb','other','Slow responses',
 'Marcus Webb waited 5 hours for a first response',
 'Enquiry received via email and first response took 300 minutes. The first company to respond usually wins the job.',
 'Call Marcus Webb now — acknowledge the delay and qualify while intent is still warm.',
 2200,'identified','medium','office',7,
 (SELECT received_at FROM enquiries WHERE id = 'enq_7008'),
 datetime('now','-7 days'), datetime('now','-7 days')),

('rop_8112','cmp_1000','slow_response','enq_7014','slow_response:enq_7014',NULL,'Rosa Delacroix','other','Slow responses',
 'Rosa Delacroix waited 130 minutes for a first response',
 'Enquiry received via web_form and first response took 130 minutes. The first company to respond usually wins the job.',
 'Call Rosa Delacroix now — acknowledge the delay and qualify while intent is still warm.',
 3100,'identified','medium','office',26,
 (SELECT received_at FROM enquiries WHERE id = 'enq_7014'),
 datetime('now','-26 days'), datetime('now','-26 days')),

('rop_8113','cmp_1000','slow_response','enq_7015','slow_response:enq_7015',NULL,'Otis Granger','other','Slow responses',
 'Otis Granger waited 5 hours for a first response',
 'Enquiry received via email and first response took 290 minutes. The first company to respond usually wins the job.',
 'Call Otis Granger now — acknowledge the delay and qualify while intent is still warm.',
 890,'identified','medium','office',30,
 (SELECT received_at FROM enquiries WHERE id = 'enq_7015'),
 datetime('now','-30 days'), datetime('now','-30 days')),

('rop_8114','cmp_1000','slow_response','enq_7017','slow_response:enq_7017',NULL,'Clyde Barrow','other','Slow responses',
 'Clyde Barrow waited 140 minutes for a first response',
 'Enquiry received via phone and first response took 140 minutes. The first company to respond usually wins the job.',
 'Call Clyde Barrow now — acknowledge the delay and qualify while intent is still warm.',
 2600,'identified','medium','office',37,
 (SELECT received_at FROM enquiries WHERE id = 'enq_7017'),
 datetime('now','-37 days'), datetime('now','-37 days')),

('rop_8115','cmp_1000','slow_response','enq_7019','slow_response:enq_7019',NULL,'Hank Morrow','other','Slow responses',
 'Hank Morrow waited 120 minutes for a first response',
 'Enquiry received via google_ads and first response took 120 minutes. The first company to respond usually wins the job.',
 'Call Hank Morrow now — acknowledge the delay and qualify while intent is still warm.',
 6800,'identified','medium','office',45,
 (SELECT received_at FROM enquiries WHERE id = 'enq_7019'),
 datetime('now','-45 days'), datetime('now','-45 days')),

('rop_8116','cmp_1000','booking_failure','ldg_ar2','booking_failure:ldg_ar2','ldg_ar2','Karen Willis','heating_repair','Booking failures',
 'Karen Willis requested a visit — still unconfirmed',
 'Customer asked for an appointment 2 days ago and the slot was never confirmed. Unconfirmed requests routinely go to a competitor.',
 'Confirm a concrete slot with Karen Willis today.',
 940,'identified','high','office',2,
 (SELECT last_activity_at FROM leads WHERE id = 'ldg_ar2'),
 datetime('now','-2 days'), datetime('now','-2 days'));

-- ---------------------------------------------------------------------------
-- Historical canonical ledger events: one 'recovered' row per actually-
-- recovered historical opportunity (the three stage='recovered' rows in the
-- recovery seed). The seed data cannot prove these amounts were recorded cash
-- — they default from the opportunity's estimated value — so they carry
-- value_basis = 'assumed'. This is intentional honesty, not a cosmetic choice:
-- assumed money is labelled assumed everywhere it is displayed.
-- event_key is deterministic: one recovery event per opportunity, ever.
-- (Seeded here rather than in 0005 so resetDemo — which replays this file —
-- restores the identical ledger.)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO revenue_events (id, company_id, opportunity_id, kind, value, value_basis, outcome_type, actor, event_key, evidence_ref, created_at) VALUES
('rev_seed_8101', 'cmp_1000', 'rop_8101', 'recovered', 11200, 'assumed', 'appointment_booked', 'seed', 'rev_cmp_1000:rop_8101:recovered', 'seed:0006', datetime('now')),
('rev_seed_8102', 'cmp_1000', 'rop_8102', 'recovered', 4800,  'assumed', 'appointment_booked', 'seed', 'rev_cmp_1000:rop_8102:recovered', 'seed:0006', datetime('now')),
('rev_seed_8103', 'cmp_1000', 'rop_8103', 'recovered', 6400,  'assumed', 'quote_accepted',     'seed', 'rev_cmp_1000:rop_8103:recovered', 'seed:0006', datetime('now'));
