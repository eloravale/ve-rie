-- VÉRIA demo seed — fictional HVAC company
-- Cedar Ridge Heating & Cooling (Tulsa, OK). All data is simulated.
-- Dates are relative to seed time so the demo always feels current.

INSERT INTO companies (id, name, slug, city, state, phone, website, avg_ticket, created_at, updated_at) VALUES
('cmp_1000', 'Cedar Ridge Heating & Cooling', 'cedar-ridge', 'Tulsa', 'OK', '(918) 555-0142', 'cedarridgehvac.com', 4800,
 datetime('now', '-120 days'), datetime('now', '-1 day'));

-- ============ LEADS ============
-- New (4) — two stale/unanswered (recovery radar flags these)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at) VALUES
('ldg_n1','cmp_1000','Angela Brooks','angela.brooks@example.com','(918) 555-0137','Duct sealing & attic insulation','new','website','normal',3400,'Submitted form twice — no one has called her back yet.','Call to qualify — lead is 5 days old with no contact.', datetime('now','-2 days'), datetime('now','-5 days'), datetime('now','-5 days'), datetime('now','-5 days')),
('ldg_n2','cmp_1000','Tom Garrison','tgarrison@example.com','(918) 555-0189','AC not cooling — upstairs zone','new','google','urgent',8900,'Search ad. Second complaint this week about upstairs zone.','Call immediately — urgent request, 3 days old.', datetime('now','-1 day'), datetime('now','-3 days'), datetime('now','-3 days'), datetime('now','-3 days')),
('ldg_n3','cmp_1000','Lisa Nguyen','lisa.nguyen@example.com','(918) 555-0126','Smart thermostat installation','new','facebook','normal',1150,'Asked about Nest install for two-story home.','Qualify and quote.', datetime('now','+1 day'), datetime('now','-2 days'), datetime('now','-2 days'), datetime('now','-2 days')),
('ldg_n4','cmp_1000','Harold Kim',NULL,'(918) 555-0163','Furnace ignition repair','new','phone','high',4800,'Auto-created from missed call (mcl_4004). Caller reached voicemail at 4:52pm.','Call back — missed caller, still uncontacted.', datetime('now','+4 hours'), datetime('now','-1 day'), datetime('now','-1 day'), datetime('now','-1 day'));

-- Contacted (3)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at) VALUES
('ldg_c1','cmp_1000','Derek Sanders','dsanders@example.com','(918) 555-0111','Refrigerant leak repair','contacted','referral','normal',2450,'Referred by Robert Hayes. Spoke once — needs follow-up.','Call to schedule diagnostic.', datetime('now','+2 days'), datetime('now','-4 days'), datetime('now','-6 days'), datetime('now','-4 days')),
('ldg_c2','cmp_1000','Susan Delgado',NULL,'(918) 555-0174','Seasonal maintenance — 2 systems','contacted','instagram','low',890,'Saw Instagram promo. Waited until fall to book.','Send maintenance pricing text.', datetime('now','+3 days'), datetime('now','-6 days'), datetime('now','-8 days'), datetime('now','-6 days')),
('ldg_c3','cmp_1000','Frank Moretti','fmoretti@example.com','(918) 555-0148','Air handler replacement','contacted','website','high',6100,'Voicemail left 2 days ago, no response yet.','Second call attempt — high value.', datetime('now','+1 day'), datetime('now','-2 days'), datetime('now','-3 days'), datetime('now','-2 days'));

-- Qualified (3)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at) VALUES
('ldg_q1','cmp_1000','Patricia Coleman','pcoleman@example.com','(918) 555-0192','Zoning system install','qualified','google','normal',3250,'Qualified by phone. Wants quote in writing.','Prepare quote and schedule site visit.', datetime('now','+2 days'), datetime('now','-1 day'), datetime('now','-5 days'), datetime('now','-1 day')),
('ldg_q2','cmp_1000','Victor Ramos','vramos@example.com','(918) 555-0159','Heat pump replacement — 3-ton','qualified','referral','urgent',12400,'Qualified. Existing system is 19 years old. Budget confirmed.','Book load calculation visit.', datetime('now','+1 day'), datetime('now','-2 days'), datetime('now','-4 days'), datetime('now','-2 days')),
('ldg_q3','cmp_1000','Diane Foster','dfoster@example.com','(918) 555-0135','Ductless mini-split — garage ADU','qualified','website','normal',1890,'Qualified. Garage conversion, one 12k BTU head.','Quote one-head mini-split.', datetime('now','+3 days'), datetime('now','-4 days'), datetime('now','-7 days'), datetime('now','-4 days'));

-- Appointment requested (2)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at) VALUES
('ldg_ar1','cmp_1000','Greg Palmer','gpalmer@example.com','(918) 555-0102','Furnace replacement quote','appointment_requested','google','high',4850,'Requested Saturday appointment. Coordinator must confirm.','Confirm Saturday slot with owner approval.', datetime('now','+1 day'), datetime('now','-1 day'), datetime('now','-3 days'), datetime('now','-1 day')),
('ldg_ar2','cmp_1000','Karen Willis',NULL,'(918) 555-0180','Smart thermostat + zoning consult','appointment_requested','phone','normal',940,'Called in, wants evening consult.','Offer Thursday 5:30pm slot.', datetime('now','+2 days'), datetime('now','-2 days'), datetime('now','-4 days'), datetime('now','-2 days'));

-- Appointment booked (2)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at) VALUES
('ldg_ab1','cmp_1000','Bill Andrews','bandrews@example.com','(918) 555-0128','Gas furnace replacement','appointment_booked','website','high',7200,'Booked. 80k BTU, 22-year-old unit.','Prep estimate for site visit.', datetime('now','+1 day'), datetime('now','-1 day'), datetime('now','-4 days'), datetime('now','-1 day')),
('ldg_ab2','cmp_1000','Rachel Stein','rstein@example.com','(918) 555-0117','Attic insulation + duct sealing','appointment_booked','referral','normal',2150,'Booked via referral from Patricia Coleman.','Confirmation text before visit.', datetime('now','+2 days'), datetime('now','-2 days'), datetime('now','-5 days'), datetime('now','-2 days'));

-- Estimate sent (3 awaiting follow-up)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at) VALUES
('ldg_e1','cmp_1000','James Whitfield','jwhitfield@example.com','(918) 555-0171','Whole-home ductless — 4 heads','estimate_sent','website','normal',9800,'Estimate delivered 9 days ago. No response since.','Follow up on estimate — call, then email recap.', datetime('now','-1 day'), datetime('now','-9 days'), datetime('now','-12 days'), datetime('now','-9 days')),
('ldg_e2','cmp_1000','Mike Thompson','mthompson@example.com','(918) 555-0109','Furnace replacement — 80k BTU','estimate_sent','google','high',7200,'Estimate sent 7 days ago. Opened email twice, never replied.','Call Mike — confirm receipt, answer questions.', datetime('now','-2 days'), datetime('now','-7 days'), datetime('now','-11 days'), datetime('now','-7 days')),
('ldg_e3','cmp_1000','Ellen Wiggins','ewiggins@example.com','(918) 555-0166','Duct repair + heat pump tune-up','estimate_sent','referral','normal',4850,'Estimate sent 5 days ago. Said she was waiting on tax refund.','Schedule follow-up for this week.', datetime('now','+1 day'), datetime('now','-5 days'), datetime('now','-9 days'), datetime('now','-5 days'));

-- Won (3)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, recovered_via, last_activity_at, created_at, updated_at) VALUES
('ldg_w1','cmp_1000','Monica Reyes','mreyes@example.com','(918) 555-0153','Ductless mini-split install','won','google','normal',6400,'Accepted estimate. Install scheduled. Referral candidate.',NULL, datetime('now','-1 day'), datetime('now','-14 days'), datetime('now','-1 day')),
('ldg_w2','cmp_1000','Robert Hayes','rhayes@example.com','(918) 555-0121','Furnace + AC system replacement','won','phone','high',11200,'Missed call recovered by call-back. Full system replacement.', 'missed_call', datetime('now','-6 days'), datetime('now','-16 days'), datetime('now','-6 days')),
('ldg_w3','cmp_1000','Steve Duffy','sduffy@example.com','(918) 555-0143','Commercial RTU service agreement','won','manual','normal',5200,'Quarterly RTU service agreement for laundromat.',NULL, datetime('now','-12 days'), datetime('now','-20 days'), datetime('now','-12 days'));

-- Lost (2)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, lost_reason, last_activity_at, created_at, updated_at) VALUES
('ldg_l1','cmp_1000','Charles Weaver','cweaver@example.com','(918) 555-0195','AC replacement','lost','website','normal',3900,'Went with a competitor on price. Past customer — preserve relationship.','Price — chose competitor', datetime('now','-8 days'), datetime('now','-18 days'), datetime('now','-8 days')),
('ldg_l2','cmp_1000','Amanda Cole',NULL,'(918) 555-0139','Window AC question','lost','facebook','low',640,'Not a fit — renter, needed appliance advice.','Out of scope', datetime('now','-3 days'), datetime('now','-4 days'), datetime('now','-3 days'));

-- Unqualified (1)
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, last_activity_at, created_at, updated_at) VALUES
('ldg_u1','cmp_1000','Tyrone Banks',NULL,'(918) 555-0157','Free HVAC for YouTube feature','unqualified','instagram','low',0,'Not a service request. Polite no.', datetime('now','-4 days'), datetime('now','-5 days'), datetime('now','-4 days'));

-- Dormant reactivation candidates (4) — no activity in 38–60 days
INSERT INTO leads (id, company_id, name, email, phone, service, status, source, urgency, estimated_value, notes, next_action, next_action_at, last_activity_at, created_at, updated_at) VALUES
('ldg_d1','cmp_1000','Sarah Jenkins','sjenkins@example.com','(918) 555-0114','Boiler replacement','contacted','referral','normal',9200,'Was ready to buy, then went quiet 45 days ago. High value.','Reactivation call — offer fall priority slot.', datetime('now','+2 days'), datetime('now','-45 days'), datetime('now','-70 days'), datetime('now','-45 days')),
('ldg_d2','cmp_1000','Omar Haddad','ohaddad@example.com','(918) 555-0186','Ductless for sunroom','qualified','google','normal',6800,'Qualified in July, postponed to fall. Now is the time.','Reactivation outreach — season changed.', datetime('now','+3 days'), datetime('now','-38 days'), datetime('now','-58 days'), datetime('now','-38 days')),
('ldg_d3','cmp_1000','Grace Liu','gliu@example.com','(918) 555-0123','Furnace replacement (deferred)','contacted','website','normal',5400,'Deferred for budget reasons in August.','Check in — offer financing info.', datetime('now','+4 days'), datetime('now','-52 days'), datetime('now','-75 days'), datetime('now','-52 days')),
('ldg_d4','cmp_1000','Nathan Price',NULL,'(918) 555-0178','Heat pump conversion','qualified','phone','normal',7600,'Wanted utility-rebate info before deciding.','Send rebate update + reactivation call.', datetime('now','+5 days'), datetime('now','-60 days'), datetime('now','-90 days'), datetime('now','-60 days'));

-- ============ CUSTOMERS ============
INSERT INTO customers (id, company_id, name, email, phone, address, lifetime_value, notes, created_at, updated_at) VALUES
('cus_2001','cmp_1000','Robert Hayes','rhayes@example.com','(918) 555-0121','2214 E 46th St, Tulsa, OK',28400,'Repeat customer since 2021. Referred 2 leads.', datetime('now','-900 days'), datetime('now','-6 days')),
('cus_2002','cmp_1000','Monica Reyes','mreyes@example.com','(918) 555-0153','7715 S Louisville Ave, Tulsa, OK',6400,'New customer. Referral candidate.', datetime('now','-1 day'), datetime('now','-1 day')),
('cus_2003','cmp_1000','Steve Duffy','sduffy@example.com','(918) 555-0143','4102 S Mingo Rd, Tulsa, OK',13600,'Commercial. Quarterly service agreement.', datetime('now','-600 days'), datetime('now','-12 days')),
('cus_2004','cmp_1000','Charles Weaver','cweaver@example.com','(918) 555-0195','930 E 21st St, Tulsa, OK',15400,'Long-time customer. Lost recent job to competitor — win back next season.', datetime('now','-1400 days'), datetime('now','-8 days')),
('cus_2005','cmp_1000','Janet Okafor','jokafor@example.com','(918) 555-0161','1120 N Quincy Ave, Tulsa, OK',1890,'Maintenance plan member.', datetime('now','-300 days'), datetime('now','-9 days')),
('cus_2006','cmp_1000','Denise Fowler',NULL,'(918) 555-0197','502 S Garnett Rd, Tulsa, OK',4800,'Recovered missed call in August.', datetime('now','-40 days'), datetime('now','-11 days'));

-- ============ MISSED CALLS (7: 3 recovered, 4 open) ============
INSERT INTO missed_calls (id, company_id, caller_name, caller_phone, called_at, recovered, lead_id, estimated_value, notes, created_at, updated_at) VALUES
('mcl_4001','cmp_1000','Robert Hayes','(918) 555-0121', datetime('now','-16 days'), 1, 'ldg_w2', 11200, 'Recovered — called back same evening. Became $11,200 system replacement.', datetime('now','-16 days'), datetime('now','-6 days')),
('mcl_4002','cmp_1000','Denise Fowler','(918) 555-0197', datetime('now','-40 days'), 1, NULL, 4800, 'Recovered — booked diagnostic, converted.', datetime('now','-40 days'), datetime('now','-38 days')),
('mcl_4003','cmp_1000','Carl Jensen','(918) 555-0182', datetime('now','-8 days'), 1, NULL, 4800, 'Recovered — maintenance plan signup.', datetime('now','-8 days'), datetime('now','-7 days')),
('mcl_4004','cmp_1000','Harold Kim','(918) 555-0163', datetime('now','-1 day'), 0, 'ldg_n4', 4800, '4:52pm Friday. Lead auto-created. Owner call-back required.', datetime('now','-1 day'), datetime('now','-1 day')),
('mcl_4005','cmp_1000','Pamela Rhodes','(918) 555-0106', datetime('now','-2 days'), 0, NULL, 4800, 'No voicemail. No lead created yet — call back today.', datetime('now','-2 days'), datetime('now','-2 days')),
('mcl_4006','cmp_1000','Walt Jennings','(918) 555-0131', datetime('now','-4 days'), 0, NULL, 4800, 'Called twice. Unrecovered — likely called a competitor.', datetime('now','-4 days'), datetime('now','-4 days')),
('mcl_4007','cmp_1000','Irene Castillo','(918) 555-0151', datetime('now','-6 days'), 0, NULL, 4800, 'After-hours call. Unrecovered.', datetime('now','-6 days'), datetime('now','-6 days'));

-- ============ ESTIMATES ============
INSERT INTO estimates (id, company_id, lead_id, amount, status, sent_at, expires_at, notes, created_at, updated_at) VALUES
('est_1001','cmp_1000','ldg_e1', 9800, 'sent', datetime('now','-9 days'), datetime('now','+5 days'), '4-head ductless, incl. electrical.', datetime('now','-10 days'), datetime('now','-9 days')),
('est_1002','cmp_1000','ldg_e2', 7200, 'sent', datetime('now','-7 days'), datetime('now','+7 days'), '80k BTU 96% furnace, permit included.', datetime('now','-8 days'), datetime('now','-7 days')),
('est_1003','cmp_1000','ldg_e3', 4850, 'sent', datetime('now','-5 days'), datetime('now','+9 days'), 'Duct repair + tune-up bundle.', datetime('now','-6 days'), datetime('now','-5 days')),
('est_1004','cmp_1000','ldg_w1', 6400, 'accepted', datetime('now','-4 days'), datetime('now','+10 days'), 'Accepted — deposit paid.', datetime('now','-5 days'), datetime('now','-1 day'));

-- ============ APPOINTMENTS ============
INSERT INTO appointments (id, company_id, lead_id, scheduled_for, status, technician, notes, created_at, updated_at) VALUES
('apt_6001','cmp_1000','ldg_ab1', datetime('now','+1 day','+9 hours'), 'scheduled', 'D. Alvarez', 'Furnace replacement site visit.', datetime('now','-2 days'), datetime('now','-2 days')),
('apt_6002','cmp_1000','ldg_ab2', datetime('now','+3 days','+13 hours'), 'scheduled', 'M. Ortiz', 'Attic insulation + duct sealing.', datetime('now','-3 days'), datetime('now','-3 days')),
('apt_6003','cmp_1000','ldg_w1', datetime('now','-2 days','+10 hours'), 'completed', 'D. Alvarez', 'Mini-split install — complete.', datetime('now','-6 days'), datetime('now','-2 days'));

-- ============ FOLLOW-UPS ============
INSERT INTO followups (id, company_id, lead_id, estimate_id, kind, status, due_at, recommended_action, notes, created_at, updated_at) VALUES
('flw_2001','cmp_1000','ldg_e2','est_1002','estimate','pending', datetime('now','-2 days'), 'Call Mike Thompson — confirm receipt of $7,200 furnace estimate, answer questions.', 'Overdue. Opened email twice, never replied.', datetime('now','-7 days'), datetime('now','-7 days')),
('flw_2002','cmp_1000','ldg_e1','est_1001','estimate','pending', datetime('now','-1 day'), 'Call James Whitfield about $9,800 ductless estimate; offer seasonal slot.', '9 days silent.', datetime('now','-9 days'), datetime('now','-9 days')),
('flw_2003','cmp_1000','ldg_e3','est_1003','estimate','pending', datetime('now','+1 day'), 'Call Ellen Wiggins — tax refund arrived; offer to schedule install.', NULL, datetime('now','-5 days'), datetime('now','-5 days')),
('flw_2004','cmp_1000','ldg_n1',NULL,'new_lead','pending', datetime('now','-2 days'), 'Call Angela Brooks — 5-day-old web lead, no contact yet.', 'Overdue. She submitted the form twice.', datetime('now','-5 days'), datetime('now','-5 days')),
('flw_2005','cmp_1000','ldg_q1',NULL,'new_lead','pending', datetime('now','+2 days'), 'Text Patricia Coleman the zoning quote and site-visit options.', NULL, datetime('now','-1 day'), datetime('now','-1 day')),
('flw_2006','cmp_1000','ldg_d1',NULL,'reactivation','pending', datetime('now','+2 days'), 'Reactivation call — Sarah Jenkins, $9,200 boiler, offer fall priority slot.', 'Owner approval captured for outreach.', datetime('now','-1 day'), datetime('now','-1 day')),
('flw_2007','cmp_1000','ldg_w2',NULL,'general','completed', datetime('now','-7 days'), 'Schedule install week for Robert Hayes.', 'Completed — install booked.', datetime('now','-8 days'), datetime('now','-6 days'));

-- ============ REACTIVATIONS ============
INSERT INTO reactivations (id, company_id, lead_id, status, reason, estimated_value, recommended_action, identified_at, created_at, updated_at) VALUES
('rea_3001','cmp_1000','ldg_d1','identified','dormant', 9200, 'Call with fall priority slot + financing options.', datetime('now','-1 day'), datetime('now','-1 day'), datetime('now','-1 day')),
('rea_3002','cmp_1000','ldg_d2','identified','dormant', 6800, 'Season-check call — sunroom ductless, ready for fall install.', datetime('now','-1 day'), datetime('now','-1 day'), datetime('now','-1 day')),
('rea_3003','cmp_1000','ldg_d3','identified','dormant', 5400, 'Check-in call; lead with financing.', datetime('now','-1 day'), datetime('now','-1 day'), datetime('now','-1 day')),
('rea_3004','cmp_1000','ldg_d4','identified','dormant', 7600, 'Send utility rebate update, then call.', datetime('now','-1 day'), datetime('now','-1 day'), datetime('now','-1 day'));

-- ============ HUMAN TASKS ============
INSERT INTO human_tasks (id, company_id, lead_id, title, reason, estimated_value, priority, recommended_action, status, due_at, created_at, updated_at) VALUES
('htk_5001','cmp_1000','ldg_n4','Call back missed caller Harold Kim','Missed call not yet recovered — lead auto-created, still uncontacted.', 4800, 'high', 'Call within 4 business hours. Offer same-week diagnostic.', 'open', datetime('now','+4 hours'), datetime('now','-1 day'), datetime('now','-1 day')),
('htk_5002','cmp_1000','ldg_e2','Confirm receipt of $7,200 estimate with Mike Thompson','Estimate sent 7 days ago — no response. Personal follow-up converts best.', 7200, 'high', 'Call, confirm receipt, answer questions, offer to walk through line items.', 'open', datetime('now','+1 day'), datetime('now','-2 days'), datetime('now','-2 days')),
('htk_5003','cmp_1000','ldg_d1','Approve reactivation outreach for Sarah Jenkins','Dormant 45 days — $9,200 boiler job. Outreach message needs owner approval.', 9200, 'normal', 'Approve the reactivation call script, then mark task complete.', 'open', datetime('now','+2 days'), datetime('now','-1 day'), datetime('now','-1 day')),
('htk_5004','cmp_1000','ldg_w2','Call back missed caller Robert Hayes','Missed call recovery — personal call-back required.', 11200, 'high', 'Call back same evening.', 'completed', datetime('now','-16 days'), datetime('now','-16 days'), datetime('now','-16 days'));

-- ============ AUDIT EVENTS ============
INSERT INTO audit_events (id, company_id, actor, entity_type, entity_id, action, detail, created_at) VALUES
('aud_9001','cmp_1000','veria','lead','ldg_n4','lead_created','Lead auto-created from missed call mcl_4004.', datetime('now','-1 day')),
('aud_9002','cmp_1000','owner','lead','ldg_w2','status_changed','new → won. Missed-call recovery converted at $11,200.', datetime('now','-6 days')),
('aud_9003','cmp_1000','veria','estimate','est_1002','estimate_sent','Furnace estimate sent to Mike Thompson.', datetime('now','-7 days')),
('aud_9004','cmp_1000','veria','reactivation','rea_3001','reactivation_identified','Sarah Jenkins flagged dormant — $9,200 opportunity.', datetime('now','-1 day')),
('aud_9005','cmp_1000','veria','human_task','htk_5001','task_created','Owner call-back required for missed caller Harold Kim.', datetime('now','-1 day')),
('aud_9006','cmp_1000','owner','lead','ldg_w1','status_changed','estimate_sent → won at $6,400.', datetime('now','-1 day'));
