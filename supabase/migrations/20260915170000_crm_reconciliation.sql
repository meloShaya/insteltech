ALTER TABLE public.crm_automation_steps ADD COLUMN reconciliation jsonb;
CREATE FUNCTION public.crm_reconcile_automation(p_step uuid,p_executed boolean,p_output jsonb,p_note text,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE step crm_automation_steps; next_status text; campaign uuid;
BEGIN
  IF length(trim(p_note))<20 THEN RAISE EXCEPTION 'Record how the provider outcome was verified'; END IF;
  SELECT * INTO step FROM crm_automation_steps WHERE id=p_step AND status='held' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only held steps require reconciliation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM crm_automation_runs WHERE id=step.run_id AND status='held') THEN RAISE EXCEPTION 'Run is no longer awaiting reconciliation'; END IF;
  SELECT campaign_id INTO campaign FROM crm_automation_runs WHERE id=step.run_id;
  IF p_executed AND campaign IS NOT NULL THEN
    IF step.operation LIKE '%.create' AND p_output->>'resource_id' IS NOT NULL THEN UPDATE crm_campaigns SET provider_campaign_id=p_output->>'resource_id' WHERE id=campaign; END IF;
    IF step.operation LIKE '%.status' THEN UPDATE crm_campaigns SET status=CASE WHEN step.input->>'status' IN ('START','activate') THEN 'active' ELSE 'paused' END WHERE id=campaign; END IF;
  END IF;
  UPDATE crm_automation_steps SET status=CASE WHEN p_executed THEN 'completed' ELSE 'queued' END,
    output=CASE WHEN p_executed THEN p_output ELSE NULL END,attempts=0,error=NULL,due_at=now(),finished_at=CASE WHEN p_executed THEN now() ELSE NULL END,
    reconciliation=jsonb_build_object('executed',p_executed,'note',left(p_note,2000),'actor',p_actor,'at',now()) WHERE id=p_step;
  next_status:=CASE WHEN EXISTS(SELECT 1 FROM crm_automation_steps WHERE run_id=step.run_id AND status<>'completed') THEN 'queued' ELSE 'completed' END;
  UPDATE crm_automation_runs SET status=next_status,finished_at=CASE WHEN next_status='completed' THEN now() ELSE NULL END WHERE id=step.run_id;
END $$;
REVOKE ALL ON FUNCTION public.crm_reconcile_automation(uuid,boolean,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_reconcile_automation(uuid,boolean,jsonb,text,uuid) TO service_role;
