ALTER TABLE public.crm_campaigns
  ADD COLUMN provider text NOT NULL DEFAULT 'resend' CHECK(provider IN ('resend','smartlead','instantly')),
  ADD COLUMN provider_campaign_id text,
  ADD COLUMN sequence jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(sequence)='array' AND jsonb_array_length(sequence)<=19),
  ADD COLUMN sending_config jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN provider_run_id uuid REFERENCES public.crm_automation_runs(id);

CREATE FUNCTION public.crm_queue_campaign(p_campaign uuid, p_creator uuid, p_steps jsonb, p_due timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign crm_campaigns; run uuid;
BEGIN
  SELECT * INTO campaign FROM crm_campaigns WHERE id=p_campaign FOR UPDATE;
  IF NOT FOUND OR campaign.provider='resend' THEN RAISE EXCEPTION 'Outbound provider campaign required'; END IF;
  IF campaign.status='active' THEN RAISE EXCEPTION 'Pause this campaign before publishing changes'; END IF;
  IF EXISTS(SELECT 1 FROM crm_automation_runs WHERE id=campaign.provider_run_id AND status IN ('queued','running','held')) THEN RAISE EXCEPTION 'This campaign already has an unfinished provider run'; END IF;
  run := crm_queue_automation('Publish: ' || left(campaign.name,190),p_creator,p_steps,coalesce((campaign.sending_config->>'max_attempts')::integer,3),p_due);
  UPDATE crm_automation_runs SET campaign_id=p_campaign WHERE id=run;
  UPDATE crm_campaigns SET provider_run_id=run WHERE id=p_campaign;
  RETURN run;
END $$;
REVOKE ALL ON FUNCTION public.crm_queue_campaign(uuid,uuid,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_queue_campaign(uuid,uuid,jsonb,timestamptz) TO service_role;
