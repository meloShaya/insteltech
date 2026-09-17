\set ON_ERROR_STOP on
\i /tmp/crm-migrations/20260915100000_crm_automations.sql
\i /tmp/crm-migrations/20260915110000_crm_scheduler.sql
\i /tmp/crm-migrations/20260915120000_crm_campaign_sequences.sql
\i /tmp/crm-migrations/20260915130000_crm_runner_tools.sql
\i /tmp/crm-migrations/20260915140000_crm_market_checkpoints.sql
\i /tmp/crm-migrations/20260915150000_crm_recurring_automations.sql
\i /tmp/crm-migrations/20260915160000_crm_resend_sequences.sql
\i /tmp/crm-migrations/20260915170000_crm_reconciliation.sql
\i /tmp/crm-migrations/20260915180000_crm_cancel_jobs.sql
\i /tmp/crm-migrations/20260915190000_crm_provider_metrics.sql
\i /tmp/crm-migrations/20260917100000_crm_contact_provenance.sql
DO $$ DECLARE saved jsonb;
BEGIN
  INSERT INTO crm_contacts(email,notes,raw_json)
    VALUES('provenance-test@example.com','Size unconfirmed','{"qualification":{"size":"unknown"},"source_url":"https://example.com"}')
    RETURNING raw_json INTO saved;
  IF saved->'qualification'->>'size' <> 'unknown' THEN RAISE EXCEPTION 'Contact provenance lost'; END IF;
END $$;
DO $$ DECLARE run uuid; again uuid; job uuid:='55555555-5555-4555-8555-555555555555'; worker uuid:='77777777-7777-4777-8777-777777777777';
BEGIN
  run:=crm_queue_tool(job,worker,'research-company','web.search','{"query":"fixture"}',false);
  again:=crm_queue_tool(job,worker,'research-company','web.search','{"query":"fixture"}',false);
  IF run<>again THEN RAISE EXCEPTION 'Tool polling created a duplicate run'; END IF;
  BEGIN PERFORM crm_queue_tool(job,worker,'research-company','web.search','{"query":"different"}',false); RAISE EXCEPTION 'Call ID accepted changed inputs'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Call ID accepted changed inputs' THEN RAISE; END IF; END;
  BEGIN PERFORM crm_queue_tool(job,worker,'write','smartlead.create','{"name":"fixture"}',true); RAISE EXCEPTION 'Read-only job allowed provider write'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Read-only job allowed provider write' THEN RAISE; END IF; END;
  BEGIN PERFORM crm_queue_tool(job,gen_random_uuid(),'other-worker','web.search','{}',false); RAISE EXCEPTION 'Unassigned runner invoked tool'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Unassigned runner invoked tool' THEN RAISE; END IF; END;
  PERFORM crm_cancel_job(job);
  IF (SELECT status FROM crm_automation_runs WHERE id=run)<>'cancelled' THEN RAISE EXCEPTION 'Cancelled job left a provider run live'; END IF;
  IF EXISTS(SELECT 1 FROM crm_automation_steps WHERE run_id=run AND status='queued') THEN RAISE EXCEPTION 'Cancelled job left queued provider steps'; END IF;
END $$;
DO $$ DECLARE schedule uuid; next timestamptz;
BEGIN
  next:=crm_next_schedule('2026-03-07 15:00:00+00','America/New_York','09:00',ARRAY[0,1,2,3,4,5,6]);
  IF next<>'2026-03-08 13:00:00+00'::timestamptz THEN RAISE EXCEPTION 'Recurring schedule failed daylight saving transition'; END IF;
  INSERT INTO crm_automation_schedules(title,steps,timezone,time_of_day,days,next_run_at,created_by) VALUES('Daily research','[{"operation":"web.search","input":{"query":"fixture"},"is_write":false}]','Africa/Harare','09:00',ARRAY[1,2,3,4,5],now()-interval '1 minute','11111111-1111-4111-8111-111111111111') RETURNING id INTO schedule;
  IF crm_enqueue_due_schedules()<>1 THEN RAISE EXCEPTION 'Due recurring run not queued'; END IF;
  IF crm_enqueue_due_schedules()<>0 THEN RAISE EXCEPTION 'Recurring run queued twice'; END IF;
  UPDATE crm_automation_schedules SET next_run_at=now()-interval '1 minute' WHERE id=schedule;
  IF crm_enqueue_due_schedules()<>0 THEN RAISE EXCEPTION 'Overlapping daily run accepted'; END IF;
END $$;
DO $$ DECLARE run uuid; step crm_automation_steps; second_step crm_automation_steps; accepted boolean;
BEGIN
  run := crm_queue_automation('Research fixture','11111111-1111-4111-8111-111111111111','[{"operation":"web.search","input":{"query":"example"},"is_write":false},{"operation":"smartlead.create","input":{"name":"fixture"},"is_write":true}]');
  SELECT * INTO step FROM crm_claim_automation(run);
  IF step.position<>0 OR step.attempts<>1 OR step.lease_id IS NULL THEN RAISE EXCEPTION 'Initial step claim invalid'; END IF;
  IF EXISTS(SELECT 1 FROM crm_claim_automation(run)) THEN RAISE EXCEPTION 'Concurrent claim duplicated or skipped dependency'; END IF;
  accepted := crm_finish_automation(step.id,gen_random_uuid(),'completed','{}');
  IF accepted THEN RAISE EXCEPTION 'Wrong lease completed step'; END IF;
  PERFORM crm_finish_automation(step.id,step.lease_id,'queued',NULL,'rate limited',120);
  IF EXISTS(SELECT 1 FROM crm_claim_automation(run)) THEN RAISE EXCEPTION 'Backoff was ignored'; END IF;
  UPDATE crm_automation_steps SET due_at=now()-interval '1 minute' WHERE id=step.id;
  SELECT * INTO step FROM crm_claim_automation(run);
  IF step.attempts<>2 THEN RAISE EXCEPTION 'Attempts not persisted'; END IF;
  PERFORM crm_finish_automation(step.id,step.lease_id,'completed','{"records":[{"url":"https://example.com"}]}');
  SELECT * INTO second_step FROM crm_claim_automation(run);
  IF second_step.position<>1 THEN RAISE EXCEPTION 'Next step was not unlocked'; END IF;
  UPDATE crm_automation_steps SET claimed_at=now()-interval '4 minutes' WHERE id=second_step.id;
  PERFORM crm_claim_automation(run);
  IF (SELECT status FROM crm_automation_runs WHERE id=run)<>'held' THEN RAISE EXCEPTION 'Expired write not held'; END IF;
  IF EXISTS(SELECT 1 FROM crm_claim_automation(run)) THEN RAISE EXCEPTION 'Unknown write replayed'; END IF;
  BEGIN PERFORM crm_retry_automation(run); RAISE EXCEPTION 'Held write accepted normal retry'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Held write accepted normal retry' THEN RAISE; END IF; END;
  PERFORM crm_reconcile_automation(second_step.id,true,'{"resource_id":"verified-provider-id","data":{"id":"verified-provider-id"}}','Checked provider record and confirmed its ID','11111111-1111-4111-8111-111111111111');
  IF (SELECT status FROM crm_automation_runs WHERE id=run)<>'completed' THEN RAISE EXCEPTION 'Verified provider outcome did not complete the run'; END IF;
  UPDATE crm_automation_runs SET status='cancelled' WHERE id=run;
  IF crm_finish_automation(second_step.id,second_step.lease_id,'completed','{}') THEN RAISE EXCEPTION 'Expired lease accepted completion'; END IF;
  IF (SELECT status FROM crm_automation_runs WHERE id=run)<>'cancelled' THEN RAISE EXCEPTION 'Cancelled run resurrected'; END IF;
END $$;
DO $$ DECLARE first_run uuid; second_run uuid; step crm_automation_steps;
BEGIN
  first_run:=crm_queue_automation('First provider action','11111111-1111-4111-8111-111111111111','[{"operation":"web.search","input":{},"is_write":false}]');
  second_run:=crm_queue_automation('Second provider action','11111111-1111-4111-8111-111111111111','[{"operation":"web.search","input":{},"is_write":false}]');
  UPDATE crm_automation_runs SET campaign_id='44444444-4444-4444-8444-444444444444' WHERE id IN(first_run,second_run);
  SELECT * INTO step FROM crm_claim_automation(first_run);
  IF EXISTS(SELECT 1 FROM crm_claim_automation(second_run)) THEN RAISE EXCEPTION 'Overlapping provider writes for the same campaign'; END IF;
  PERFORM crm_finish_automation(step.id,step.lease_id,'completed','{}');
  IF NOT EXISTS(SELECT 1 FROM crm_claim_automation(second_run)) THEN RAISE EXCEPTION 'Finished campaign action did not unlock the next run'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM crm_automation_runs)=0 THEN RAISE EXCEPTION 'Team cannot read history'; END IF;
  BEGIN UPDATE crm_automation_steps SET status='completed'; RAISE EXCEPTION 'Browser forged provider result'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM crm_claim_automation(); RAISE EXCEPTION 'Browser claimed scheduler step'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM crm_configure_scheduler('https://example.supabase.co','fake',true); RAISE EXCEPTION 'Browser installed scheduler'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM crm_automation_runs) THEN RAISE EXCEPTION 'Non-member read research results'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ DECLARE campaign uuid; contact uuid; recipient uuid; claim jsonb; followup uuid;
BEGIN
  INSERT INTO crm_contacts(email,first_name,consent,consent_note) VALUES('sequence@example.com','Alex',true,'Explicit fixture opt-in') RETURNING id INTO contact;
  INSERT INTO crm_campaigns(name,subject,body,status,sequence,sending_config) VALUES('Sequence fixture','Hello','Hi {{first_name}}','active','[{"subject":"Follow up","body":"Hello again","delay_days":3},{"subject":"Last note","body":"Thank you","delay_days":4}]','{"autonomous":true,"daily_limit":1}') RETURNING id INTO campaign;
  INSERT INTO crm_recipients(campaign_id,contact_id) VALUES(campaign,contact) RETURNING id INTO recipient;
  claim:=crm_claim_sequence(campaign,true);
  IF claim->>'table'<>'crm_recipients' OR claim->'delivery'->>'id'<>recipient::text THEN RAISE EXCEPTION 'Scheduled first message not claimed'; END IF;
  IF crm_claim_sequence(campaign,true) IS NOT NULL THEN RAISE EXCEPTION 'Initial sequence delivery claimed twice'; END IF;
  UPDATE crm_recipients SET status='sent',sent_at=now() WHERE id=recipient;
  IF (SELECT count(*) FROM crm_followups WHERE recipient_id=recipient)<>1 THEN RAISE EXCEPTION 'First follow-up not seeded'; END IF;
  IF crm_claim_sequence(campaign,true) IS NOT NULL THEN RAISE EXCEPTION 'Follow-up sent before its delay'; END IF;
  UPDATE crm_followups SET due_at=now()-interval '1 minute' WHERE recipient_id=recipient;
  claim:=crm_claim_sequence(campaign,true);
  IF claim->>'table'<>'crm_followups' THEN RAISE EXCEPTION 'Due follow-up not claimed'; END IF;
  followup:=(claim->'delivery'->>'id')::uuid;
  UPDATE crm_followups SET status='sent',sent_at=now() WHERE id=followup;
  IF (SELECT count(*) FROM crm_followups WHERE recipient_id=recipient)<>2 THEN RAISE EXCEPTION 'Second follow-up not seeded'; END IF;
  UPDATE crm_recipients SET reply_sentiment='neutral' WHERE id=recipient;
  IF EXISTS(SELECT 1 FROM crm_followups WHERE recipient_id=recipient AND status='pending') THEN RAISE EXCEPTION 'Reply did not stop the sequence'; END IF;
  UPDATE crm_campaigns SET sending_config=jsonb_build_object('autonomous',true,'daily_limit',30,'max_attempts',3,'interval_minutes',5,'timezone','Africa/Harare','days',jsonb_build_array((extract(dow FROM now() AT TIME ZONE 'Africa/Harare')::integer+1)%7),'start_hour','09:00','end_hour','17:00') WHERE id=campaign;
  IF crm_claim_sequence(campaign,true) IS NOT NULL THEN RAISE EXCEPTION 'Sending outside configured weekdays'; END IF;
  BEGIN UPDATE crm_campaigns SET sending_config='{"autonomous":"false"}' WHERE id=campaign; RAISE EXCEPTION 'String automatic flag was accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='String automatic flag was accepted' THEN RAISE; END IF; END;
END $$;
