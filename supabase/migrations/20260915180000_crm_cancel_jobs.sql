CREATE FUNCTION public.crm_cancel_job(p_job uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE crm_jobs SET status='cancelled',finished_at=now() WHERE id=p_job AND status IN ('queued','running');
  UPDATE crm_automation_steps SET status='cancelled' WHERE run_id IN(SELECT run_id FROM crm_tool_calls WHERE job_id=p_job) AND status='queued';
  UPDATE crm_automation_runs SET status='cancelled',finished_at=now() WHERE id IN(SELECT run_id FROM crm_tool_calls WHERE job_id=p_job) AND status IN ('queued','running','held');
END $$;
REVOKE ALL ON FUNCTION public.crm_cancel_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_cancel_job(uuid) TO service_role;
