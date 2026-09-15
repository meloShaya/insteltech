CREATE TABLE public.crm_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','held','cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  campaign_id uuid REFERENCES public.crm_campaigns(id) ON DELETE SET NULL,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE public.crm_automation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.crm_automation_runs(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 99),
  operation text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}',
  is_write boolean NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','held','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  claimed_at timestamptz,
  output jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(run_id, position)
);
CREATE INDEX crm_automation_due ON public.crm_automation_steps(due_at) WHERE status = 'queued';
ALTER TABLE public.crm_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_automation_steps ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crm_automation_runs, public.crm_automation_steps TO authenticated;
GRANT ALL ON public.crm_automation_runs, public.crm_automation_steps TO service_role;
CREATE POLICY team_read ON public.crm_automation_runs FOR SELECT TO authenticated USING (public.is_active_mail_member());
CREATE POLICY team_read ON public.crm_automation_steps FOR SELECT TO authenticated USING (public.is_active_mail_member());

CREATE FUNCTION public.crm_queue_automation(p_title text, p_creator uuid, p_steps jsonb, p_attempts integer DEFAULT 3, p_due timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE run uuid; step jsonb; pos integer := 0;
BEGIN
  IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Supply 1 to 100 steps'; END IF;
  INSERT INTO crm_automation_runs(title,created_by,max_attempts) VALUES(p_title,p_creator,p_attempts) RETURNING id INTO run;
  FOR step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    INSERT INTO crm_automation_steps(run_id,position,operation,input,is_write,due_at)
      VALUES(run,pos,step->>'operation',step->'input',(step->>'is_write')::boolean,p_due);
    pos := pos + 1;
  END LOOP;
  RETURN run;
END $$;

CREATE FUNCTION public.crm_claim_automation(p_run uuid DEFAULT NULL)
RETURNS SETOF public.crm_automation_steps LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE step crm_automation_steps; stale crm_automation_steps; campaign uuid;
BEGIN
  -- A crashed process cannot replay an external write whose outcome is unknown.
  FOR stale IN SELECT s.* FROM crm_automation_steps s WHERE s.status='running' AND s.claimed_at < now()-interval '3 minutes' FOR UPDATE SKIP LOCKED LOOP
    UPDATE crm_automation_steps SET status=CASE WHEN stale.is_write THEN 'held' WHEN stale.attempts < (SELECT max_attempts FROM crm_automation_runs WHERE id=stale.run_id) THEN 'queued' ELSE 'failed' END,
      error='Worker lease expired', lease_id=NULL, due_at=now() WHERE id=stale.id;
    UPDATE crm_automation_runs SET status=CASE WHEN stale.is_write THEN 'held' WHEN stale.attempts < max_attempts THEN 'queued' ELSE 'failed' END WHERE id=stale.run_id AND status IN ('queued','running');
  END LOOP;
  SELECT s.* INTO step FROM crm_automation_steps s JOIN crm_automation_runs r ON r.id=s.run_id
    WHERE s.status='queued' AND s.due_at <= now() AND r.status IN ('queued','running') AND (p_run IS NULL OR r.id=p_run)
    AND NOT EXISTS (SELECT 1 FROM crm_automation_steps earlier WHERE earlier.run_id=s.run_id AND earlier.position<s.position AND earlier.status<>'completed')
    ORDER BY s.due_at,s.created_at,s.position FOR UPDATE OF s SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT campaign_id INTO campaign FROM crm_automation_runs WHERE id=step.run_id;
  IF campaign IS NOT NULL THEN
    PERFORM 1 FROM crm_campaigns WHERE id=campaign FOR UPDATE;
    IF EXISTS(SELECT 1 FROM crm_automation_steps busy JOIN crm_automation_runs owner ON owner.id=busy.run_id WHERE owner.campaign_id=campaign AND busy.status='running' AND busy.id<>step.id) THEN RETURN; END IF;
  END IF;
  UPDATE crm_automation_runs SET status='running' WHERE id=step.run_id;
  RETURN QUERY UPDATE crm_automation_steps SET status='running',attempts=attempts+1,lease_id=gen_random_uuid(),claimed_at=now(),error=NULL WHERE id=step.id RETURNING *;
END $$;

CREATE FUNCTION public.crm_finish_automation(p_step uuid, p_lease uuid, p_status text, p_output jsonb DEFAULT NULL, p_error text DEFAULT NULL, p_delay integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE step crm_automation_steps; next_status text;
BEGIN
  IF p_status NOT IN ('completed','queued','held','failed') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  SELECT * INTO step FROM crm_automation_steps WHERE id=p_step AND status='running' AND lease_id=p_lease FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE crm_automation_steps SET status=p_status,output=p_output,error=left(p_error,2000),lease_id=NULL,
    due_at=now()+make_interval(secs=>greatest(0,least(86400,p_delay))),finished_at=CASE WHEN p_status IN ('completed','failed') THEN now() ELSE NULL END WHERE id=p_step;
  next_status := CASE WHEN p_status='completed' THEN CASE WHEN EXISTS(SELECT 1 FROM crm_automation_steps WHERE run_id=step.run_id AND status<>'completed') THEN 'queued' ELSE 'completed' END ELSE p_status END;
  UPDATE crm_automation_runs SET status=next_status,finished_at=CASE WHEN next_status IN ('completed','failed') THEN now() ELSE NULL END WHERE id=step.run_id AND status<>'cancelled';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.crm_queue_automation(text,uuid,jsonb,integer,timestamptz), public.crm_claim_automation(uuid), public.crm_finish_automation(uuid,uuid,text,jsonb,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_queue_automation(text,uuid,jsonb,integer,timestamptz), public.crm_claim_automation(uuid), public.crm_finish_automation(uuid,uuid,text,jsonb,text,integer) TO service_role;

ALTER TABLE public.crm_settings ADD COLUMN codex_config jsonb NOT NULL DEFAULT '{"web_search":true,"subagents":false,"model":"","reasoning_effort":"high","agent_model":"","agent_reasoning_effort":"high","max_agents":3}';
