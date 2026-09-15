-- Installed from the owner's CRM settings button, after deployment.
-- Vault holds the scheduler credential; no credential is returned to the browser.
CREATE FUNCTION public.crm_configure_scheduler(p_url text, p_service_key text, p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing bigint; secret uuid; command text;
BEGIN
  IF p_url !~ '^https://[a-z0-9]+\.supabase\.co$' OR length(p_service_key)<30 THEN RAISE EXCEPTION 'Invalid scheduler configuration'; END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
  EXECUTE 'SELECT jobid FROM cron.job WHERE jobname=$1' INTO existing USING 'instel-crm-automations';
  IF existing IS NOT NULL THEN EXECUTE 'SELECT cron.unschedule($1)' USING existing; END IF;
  IF NOT p_enabled THEN RETURN false; END IF;
  EXECUTE 'SELECT id FROM vault.secrets WHERE name=$1' INTO secret USING 'instel_crm_scheduler_key';
  IF secret IS NULL THEN
    EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO secret USING p_service_key,'instel_crm_scheduler_key','Instel CRM scheduled execution';
  ELSE EXECUTE 'SELECT vault.update_secret($1,$2)' USING secret,p_service_key;
  END IF;
  command := format($cmd$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='instel_crm_scheduler_key')), body := '{"action":"tick"}'::jsonb, timeout_milliseconds := 55000);$cmd$,p_url || '/functions/v1/crm-automation');
  EXECUTE 'SELECT cron.schedule($1,$2,$3)' USING 'instel-crm-automations','* * * * *',command;
  RETURN true;
END $$;
CREATE FUNCTION public.crm_scheduler_status() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE enabled boolean;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname=$1 AND active)' INTO enabled USING 'instel-crm-automations';
  RETURN enabled;
END $$;
CREATE FUNCTION public.crm_retry_automation(p_run uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM crm_automation_runs WHERE id=p_run AND status='failed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only known failed runs can be retried; reconcile held writes first'; END IF;
  UPDATE crm_automation_steps SET status='queued',attempts=0,error=NULL,due_at=now(),finished_at=NULL WHERE run_id=p_run AND status='failed';
  UPDATE crm_automation_runs SET status='queued',finished_at=NULL WHERE id=p_run;
END $$;
REVOKE ALL ON FUNCTION public.crm_configure_scheduler(text,text,boolean), public.crm_scheduler_status(), public.crm_retry_automation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_configure_scheduler(text,text,boolean), public.crm_scheduler_status(), public.crm_retry_automation(uuid) TO service_role;
