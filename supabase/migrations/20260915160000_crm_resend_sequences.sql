ALTER TABLE public.crm_campaigns ADD COLUMN automation_owner uuid REFERENCES auth.users(id);
ALTER TABLE public.crm_recipients ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN delivery_key uuid;
CREATE TABLE public.crm_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.crm_recipients(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 18),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','unknown','suppressed')),
  due_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  delivery_key uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.mail_messages(id),
  claimed_at timestamptz, sent_at timestamptz, error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipient_id,step_index)
);
ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crm_followups TO authenticated;
GRANT ALL ON public.crm_followups TO service_role;
CREATE POLICY team_read ON public.crm_followups FOR SELECT TO authenticated USING(public.is_active_mail_member());
CREATE INDEX crm_followups_due ON public.crm_followups(due_at) WHERE status='pending';

CREATE FUNCTION public.crm_validate_sending_config() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE zone text; step jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.automation_owner:=auth.uid(); END IF;
  IF jsonb_typeof(NEW.sending_config)<>'object' THEN RAISE EXCEPTION 'Sending configuration must be an object'; END IF;
  IF NEW.sending_config ? 'autonomous' AND jsonb_typeof(NEW.sending_config->'autonomous')<>'boolean' THEN RAISE EXCEPTION 'Automatic sending must be true or false'; END IF;
  IF NEW.sending_config ? 'stop_on_reply' AND jsonb_typeof(NEW.sending_config->'stop_on_reply')<>'boolean' THEN RAISE EXCEPTION 'Reply stopping must be true or false'; END IF;
  zone:=coalesce(NEW.sending_config->>'timezone','Africa/Harare');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'Invalid sending time zone'; END IF;
  IF NEW.sending_config ? 'daily_limit' AND (NEW.sending_config->>'daily_limit')::integer NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Daily limit must be 1 to 1000'; END IF;
  IF NEW.sending_config ? 'max_attempts' AND (NEW.sending_config->>'max_attempts')::integer NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'Attempts must be 1 to 6'; END IF;
  IF NEW.sending_config ? 'interval_minutes' AND (NEW.sending_config->>'interval_minutes')::integer NOT BETWEEN 1 AND 1440 THEN RAISE EXCEPTION 'Send interval must be 1 to 1440 minutes'; END IF;
  IF NEW.sending_config ? 'days' THEN
    IF jsonb_typeof(NEW.sending_config->'days')<>'array' OR jsonb_array_length(NEW.sending_config->'days') NOT BETWEEN 1 AND 7 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.sending_config->'days') d WHERE d::integer NOT BETWEEN 0 AND 6) THEN RAISE EXCEPTION 'Choose valid sending weekdays'; END IF;
    IF (NEW.sending_config->>'start_hour')::time >= (NEW.sending_config->>'end_hour')::time OR NEW.sending_config->>'start_hour' IS NULL OR NEW.sending_config->>'end_hour' IS NULL THEN RAISE EXCEPTION 'Invalid sending window'; END IF;
  END IF;
  FOR step IN SELECT * FROM jsonb_array_elements(NEW.sequence) LOOP
    IF length(coalesce(step->>'subject','')) NOT BETWEEN 1 AND 200 OR length(coalesce(step->>'body','')) NOT BETWEEN 1 AND 50000 OR (step->>'delay_days')::integer NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Invalid sequence step'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_validate_sending BEFORE INSERT OR UPDATE ON public.crm_campaigns FOR EACH ROW EXECUTE FUNCTION public.crm_validate_sending_config();

CREATE FUNCTION public.crm_seed_followup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign crm_campaigns; next_step integer; recipient uuid;
BEGIN
  SELECT * INTO campaign FROM crm_campaigns WHERE id=NEW.campaign_id;
  IF campaign.provider<>'resend' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='crm_recipients' THEN
    recipient:=NEW.id; next_step:=0;
    IF NEW.reply_sentiment<>'none' AND coalesce((campaign.sending_config->>'stop_on_reply')::boolean,true) THEN
      UPDATE crm_followups SET status='suppressed',error='Stopped after reply' WHERE recipient_id=NEW.id AND status='pending';
      RETURN NEW;
    END IF;
  ELSE recipient:=NEW.recipient_id; next_step:=NEW.step_index+1;
  END IF;
  IF NEW.status='sent' AND OLD.status<>'sent' AND jsonb_array_length(campaign.sequence)>next_step THEN
    INSERT INTO crm_followups(recipient_id,campaign_id,contact_id,step_index,due_at)
      VALUES(recipient,NEW.campaign_id,NEW.contact_id,next_step,coalesce(NEW.sent_at,now())+make_interval(days=>(campaign.sequence->next_step->>'delay_days')::integer)) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_seed_first_followup AFTER UPDATE ON public.crm_recipients FOR EACH ROW EXECUTE FUNCTION public.crm_seed_followup();
CREATE TRIGGER crm_seed_next_followup AFTER UPDATE ON public.crm_followups FOR EACH ROW EXECUTE FUNCTION public.crm_seed_followup();

CREATE FUNCTION public.crm_claim_sequence(p_campaign uuid,p_scheduled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign crm_campaigns; local_now timestamp; zone text; initial crm_recipients; followup crm_followups; last_claim timestamptz; daily integer;
BEGIN
  SELECT * INTO campaign FROM crm_campaigns WHERE id=p_campaign FOR UPDATE;
  IF NOT FOUND OR campaign.status<>'active' OR campaign.provider<>'resend' THEN RETURN NULL; END IF;
  IF p_scheduled AND (NOT coalesce((campaign.sending_config->>'autonomous')::boolean,false) OR campaign.automation_owner IS NULL) THEN RETURN NULL; END IF;
  IF p_scheduled AND NOT EXISTS(SELECT 1 FROM mail_members WHERE user_id=campaign.automation_owner AND active) THEN RETURN NULL; END IF;
  IF campaign.sending_config->>'launch_at' IS NOT NULL AND campaign.sending_config->>'launch_at'<>'' AND (campaign.sending_config->>'launch_at')::timestamptz>now() THEN RETURN NULL; END IF;
  zone:=coalesce(campaign.sending_config->>'timezone','Africa/Harare'); local_now:=now() AT TIME ZONE zone;
  IF campaign.sending_config ? 'days' THEN
    IF NOT (campaign.sending_config->'days') @> to_jsonb(extract(dow FROM local_now)::integer) OR local_now::time<(campaign.sending_config->>'start_hour')::time OR local_now::time>=(campaign.sending_config->>'end_hour')::time THEN RETURN NULL; END IF;
  END IF;
  SELECT max(claimed_at) INTO last_claim FROM (SELECT claimed_at FROM crm_recipients WHERE campaign_id=p_campaign UNION ALL SELECT claimed_at FROM crm_followups WHERE campaign_id=p_campaign) claims;
  IF last_claim+make_interval(mins=>coalesce((campaign.sending_config->>'interval_minutes')::integer,0))>now() THEN RETURN NULL; END IF;
  -- Expired deliveries are unknown, not replayable. Reconcile them against mail_messages.
  UPDATE crm_recipients SET status='unknown',error='Delivery lease expired; reconcile mailbox' WHERE campaign_id=p_campaign AND status='sending' AND claimed_at<now()-interval '3 minutes';
  UPDATE crm_followups SET status='unknown',error='Delivery lease expired; reconcile mailbox' WHERE campaign_id=p_campaign AND status='sending' AND claimed_at<now()-interval '3 minutes';
  UPDATE crm_followups f SET status='suppressed',error='Contact suppressed or replied' FROM crm_contacts c,crm_recipients r
    WHERE f.contact_id=c.id AND f.recipient_id=r.id AND f.campaign_id=p_campaign AND f.status='pending'
    AND (c.suppressed OR NOT c.consent OR (r.reply_sentiment<>'none' AND coalesce((campaign.sending_config->>'stop_on_reply')::boolean,true)));
  SELECT * INTO followup FROM crm_followups WHERE campaign_id=p_campaign AND status='pending' AND due_at<=now() ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF FOUND THEN
    UPDATE crm_followups SET status='sending',attempts=attempts+1,claimed_at=now() WHERE id=followup.id RETURNING * INTO followup;
    RETURN jsonb_build_object('table','crm_followups','delivery',to_jsonb(followup),'copy',campaign.sequence->followup.step_index);
  END IF;
  SELECT count(*) INTO daily FROM crm_recipients WHERE campaign_id=p_campaign AND ((sent_at AT TIME ZONE zone)::date=local_now::date OR (status IN ('sending','unknown') AND (claimed_at AT TIME ZONE zone)::date=local_now::date));
  IF daily>=coalesce((campaign.sending_config->>'daily_limit')::integer,1000) THEN RETURN NULL; END IF;
  SELECT * INTO initial FROM crm_recipients WHERE campaign_id=p_campaign AND status='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE crm_recipients SET status='sending',attempts=attempts+1,claimed_at=now() WHERE id=initial.id RETURNING * INTO initial;
  RETURN jsonb_build_object('table','crm_recipients','delivery',to_jsonb(initial),'copy',jsonb_build_object('subject',campaign.subject,'body',campaign.body));
END $$;
REVOKE ALL ON FUNCTION public.crm_claim_sequence(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_claim_sequence(uuid,boolean) TO service_role;
