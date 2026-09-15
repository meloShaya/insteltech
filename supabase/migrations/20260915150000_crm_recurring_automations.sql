CREATE TABLE public.crm_automation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  steps jsonb NOT NULL CHECK(jsonb_typeof(steps)='array' AND jsonb_array_length(steps) BETWEEN 1 AND 100),
  timezone text NOT NULL,
  time_of_day time NOT NULL,
  days integer[] NOT NULL CHECK(cardinality(days) BETWEEN 1 AND 7 AND days <@ ARRAY[0,1,2,3,4,5,6]),
  max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 6),
  next_run_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_automation_schedules ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crm_automation_schedules TO authenticated;
GRANT ALL ON public.crm_automation_schedules TO service_role;
CREATE POLICY team_read ON public.crm_automation_schedules FOR SELECT TO authenticated USING(public.is_active_mail_member());
ALTER TABLE public.crm_automation_runs ADD COLUMN schedule_id uuid REFERENCES public.crm_automation_schedules(id), ADD COLUMN scheduled_for timestamptz;
CREATE UNIQUE INDEX crm_schedule_once ON public.crm_automation_runs(schedule_id,scheduled_for) WHERE schedule_id IS NOT NULL;

CREATE FUNCTION public.crm_next_schedule(p_after timestamptz,p_zone text,p_time time,p_days integer[])
RETURNS timestamptz LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT min(candidate) FROM (
    SELECT (((p_after AT TIME ZONE p_zone)::date + i) + p_time) AT TIME ZONE p_zone AS candidate
    FROM generate_series(0,8) AS i
    WHERE extract(dow FROM (p_after AT TIME ZONE p_zone)::date+i)::integer=ANY(p_days)
  ) occurrences WHERE candidate>p_after;
$$;
CREATE FUNCTION public.crm_enqueue_due_schedules() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE schedule crm_automation_schedules; run uuid; count integer:=0;
BEGIN
  FOR schedule IN SELECT * FROM crm_automation_schedules WHERE active AND next_run_at<=now() ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 10 LOOP
    IF NOT EXISTS(SELECT 1 FROM mail_members WHERE user_id=schedule.created_by AND active) THEN
      UPDATE crm_automation_schedules SET active=false WHERE id=schedule.id;
      CONTINUE;
    END IF;
    -- Do not stack a fresh paid run behind an unfinished run from the same schedule.
    IF NOT EXISTS(SELECT 1 FROM crm_automation_runs WHERE schedule_id=schedule.id AND status IN ('queued','running','held')) THEN
      run:=crm_queue_automation(schedule.title,schedule.created_by,schedule.steps,schedule.max_attempts);
      UPDATE crm_automation_runs SET schedule_id=schedule.id,scheduled_for=schedule.next_run_at WHERE id=run;
      count:=count+1;
    END IF;
    UPDATE crm_automation_schedules SET next_run_at=crm_next_schedule(now(),schedule.timezone,schedule.time_of_day,schedule.days) WHERE id=schedule.id;
  END LOOP;
  RETURN count;
END $$;
REVOKE ALL ON FUNCTION public.crm_next_schedule(timestamptz,text,time,integer[]), public.crm_enqueue_due_schedules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_next_schedule(timestamptz,text,time,integer[]), public.crm_enqueue_due_schedules() TO service_role;
