\set ON_ERROR_STOP on
-- Run only in a disposable PostgreSQL database. Minimal Supabase auth/mail fixture.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.mail_members(user_id uuid PRIMARY KEY, role text, active boolean);
CREATE TABLE public.mail_threads(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.mail_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),direction text,from_address text,text_body text,thread_id uuid);
CREATE FUNCTION public.is_active_mail_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM mail_members WHERE user_id=auth.uid() AND active) $$;
CREATE FUNCTION public.is_mail_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM mail_members WHERE user_id=auth.uid() AND active AND role='owner') $$;
\i /tmp/crm-migration.sql
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO mail_members VALUES ('11111111-1111-4111-8111-111111111111','owner',true);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO crm_contacts(id,email,first_name,consent,consent_note) VALUES ('33333333-3333-4333-8333-333333333333','test@example.com','Test',true,'Explicit opt-in');
INSERT INTO crm_campaigns(id,name,status) VALUES ('44444444-4444-4444-8444-444444444444','Test campaign','active');
INSERT INTO crm_jobs(id,workflow_id,title) VALUES ('55555555-5555-4555-8555-555555555555','campaign-strategy','Test strategy');
DO $$ BEGIN
  IF (SELECT count(*) FROM crm_contacts) <> 1 THEN RAISE EXCEPTION 'Member cannot read contacts'; END IF;
  BEGIN INSERT INTO crm_contacts(email,consent) VALUES ('bad@example.com',true); RAISE EXCEPTION 'Missing consent evidence accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO crm_contacts(email) VALUES ('TEST@example.com'); RAISE EXCEPTION 'Mixed case accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE crm_jobs SET status='completed'; RAISE EXCEPTION 'Member forged completed job'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM token_hash FROM crm_workers; RAISE EXCEPTION 'Worker hash leaked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM crm_claim_job(gen_random_uuid()); RAISE EXCEPTION 'Member claimed a worker job'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM crm_contacts) <> 0 THEN RAISE EXCEPTION 'Non-member read contacts'; END IF;
  BEGIN INSERT INTO crm_contacts(email) VALUES ('outsider@example.com'); RAISE EXCEPTION 'Non-member inserted contact'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO crm_recipients(id,campaign_id,contact_id) VALUES ('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333');
DO $$ DECLARE claimed int; BEGIN
  SELECT count(*) INTO claimed FROM crm_claim_recipient('44444444-4444-4444-8444-444444444444');
  IF claimed <> 1 THEN RAISE EXCEPTION 'Recipient not claimed'; END IF;
  SELECT count(*) INTO claimed FROM crm_claim_recipient('44444444-4444-4444-8444-444444444444');
  IF claimed <> 0 THEN RAISE EXCEPTION 'Recipient claimed twice'; END IF;
  SELECT count(*) INTO claimed FROM crm_claim_job('77777777-7777-4777-8777-777777777777');
  IF claimed <> 1 THEN RAISE EXCEPTION 'Job not claimed'; END IF;
  SELECT count(*) INTO claimed FROM crm_claim_job('88888888-8888-4888-8888-888888888888');
  IF claimed <> 0 THEN RAISE EXCEPTION 'Job claimed twice'; END IF;
END $$;
UPDATE crm_recipients SET status='pending';
UPDATE crm_campaigns SET status='paused';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM crm_claim_recipient('44444444-4444-4444-8444-444444444444')) THEN RAISE EXCEPTION 'Paused campaign claimed'; END IF; END $$;
INSERT INTO mail_messages(direction,from_address,text_body) VALUES ('inbound','Test Person <test@example.com>','Please unsubscribe me.');
DO $$ BEGIN
  IF NOT (SELECT suppressed FROM crm_contacts WHERE email='test@example.com') THEN RAISE EXCEPTION 'Opt-out did not suppress contact'; END IF;
  IF (SELECT status FROM crm_recipients LIMIT 1) <> 'suppressed' THEN RAISE EXCEPTION 'Opt-out did not stop pending send'; END IF;
END $$;
SELECT 'CRM database authorization, claims, consent, and suppression checks passed' AS result;
