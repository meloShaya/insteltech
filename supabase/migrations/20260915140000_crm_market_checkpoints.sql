ALTER TABLE public.crm_automation_steps ADD COLUMN checkpoint jsonb;
CREATE FUNCTION public.crm_checkpoint_automation(p_step uuid,p_lease uuid,p_checkpoint jsonb,p_output jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE run uuid;
BEGIN
  UPDATE crm_automation_steps SET checkpoint=p_checkpoint,output=p_output,status='queued',attempts=0,lease_id=NULL,due_at=now(),error=NULL
    WHERE id=p_step AND lease_id=p_lease AND status='running' RETURNING run_id INTO run;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE crm_automation_runs SET status='queued' WHERE id=run AND status<>'cancelled';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.crm_checkpoint_automation(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_checkpoint_automation(uuid,uuid,jsonb,jsonb) TO service_role;
