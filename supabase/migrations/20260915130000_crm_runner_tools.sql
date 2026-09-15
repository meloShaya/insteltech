CREATE TABLE public.crm_tool_calls (
  job_id uuid NOT NULL REFERENCES public.crm_jobs(id) ON DELETE CASCADE,
  call_id text NOT NULL CHECK(length(call_id) BETWEEN 1 AND 150),
  operation text NOT NULL,
  input jsonb NOT NULL,
  run_id uuid NOT NULL REFERENCES public.crm_automation_runs(id),
  PRIMARY KEY(job_id,call_id)
);
ALTER TABLE public.crm_tool_calls ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crm_tool_calls TO authenticated;
GRANT ALL ON public.crm_tool_calls TO service_role;
CREATE POLICY team_read ON public.crm_tool_calls FOR SELECT TO authenticated USING(public.is_active_mail_member());
CREATE FUNCTION public.crm_queue_tool(p_job uuid,p_worker uuid,p_call text,p_operation text,p_input jsonb,p_write boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job crm_jobs; existing crm_tool_calls; run uuid;
BEGIN
  SELECT * INTO job FROM crm_jobs WHERE id=p_job AND worker_id=p_worker AND status='running' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job is not assigned to this runner'; END IF;
  IF p_write AND NOT coalesce((job.input->'execution'->>'allow_provider_writes')::boolean,false) THEN RAISE EXCEPTION 'This job does not authorize provider changes'; END IF;
  SELECT * INTO existing FROM crm_tool_calls WHERE job_id=p_job AND call_id=p_call;
  IF FOUND THEN
    IF existing.operation<>p_operation OR existing.input<>p_input THEN RAISE EXCEPTION 'Tool call ID reused with different inputs'; END IF;
    RETURN existing.run_id;
  END IF;
  run := crm_queue_automation(left(job.title || ': ' || p_operation,200),job.created_by,jsonb_build_array(jsonb_build_object('operation',p_operation,'input',p_input,'is_write',p_write)));
  INSERT INTO crm_tool_calls VALUES(p_job,p_call,p_operation,p_input,run);
  RETURN run;
END $$;
REVOKE ALL ON FUNCTION public.crm_queue_tool(uuid,uuid,text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_queue_tool(uuid,uuid,text,text,jsonb,boolean) TO service_role;
