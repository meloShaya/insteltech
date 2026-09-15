-- The CRM shares the existing private mail team, not public landing-page leads.
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND length(email) < 320 AND email ~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$'),
  first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '', website text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'Manual',
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','qualified','contacted','meeting','proposal','won','lost')),
  value numeric(14,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  consent boolean NOT NULL DEFAULT false, consent_note text NOT NULL DEFAULT '',
  suppressed boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '', next_action_at date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT consent OR length(trim(consent_note)) > 0)
);
CREATE TABLE public.crm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  subject text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '',
  audience_stage text NOT NULL DEFAULT 'qualified',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.crm_campaigns ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','unknown','suppressed')),
  reply_sentiment text NOT NULL DEFAULT 'none' CHECK (reply_sentiment IN ('none','positive','neutral','negative','unsubscribe')),
  message_id uuid REFERENCES public.mail_messages ON DELETE SET NULL,
  error text, sent_at timestamptz, claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
CREATE TABLE public.crm_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id text NOT NULL,
  title text NOT NULL, input jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  output text NOT NULL DEFAULT '', error text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users,
  worker_id uuid, claimed_at timestamptz, finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES public.crm_contacts ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 10000),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  due_at date NOT NULL DEFAULT current_date, completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  hypothesis text NOT NULL, variable text NOT NULL,
  campaign_a uuid REFERENCES public.crm_campaigns ON DELETE SET NULL,
  campaign_b uuid REFERENCES public.crm_campaigns ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (campaign_a IS NULL OR campaign_b IS NULL OR campaign_a <> campaign_b)
);
CREATE TABLE public.crm_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), company_name text NOT NULL DEFAULT 'Instel Technologies',
  website text NOT NULL DEFAULT 'https://insteltech.co.zw',
  offer text NOT NULL DEFAULT '', audience text NOT NULL DEFAULT '',
  physical_address text NOT NULL DEFAULT '', unsubscribe_email text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.crm_settings(id) VALUES (true);
CREATE TABLE public.crm_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'Codex runner',
  token_hash text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz, created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_contacts_stage_idx ON public.crm_contacts(stage);
CREATE INDEX crm_jobs_queue_idx ON public.crm_jobs(status, created_at);
CREATE INDEX crm_recipients_campaign_idx ON public.crm_recipients(campaign_id, status);
CREATE INDEX crm_notes_contact_idx ON public.crm_notes(contact_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_contacts','crm_campaigns','crm_notes','crm_tasks','crm_experiments','crm_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY team_access ON public.%I FOR ALL TO authenticated USING (public.is_active_mail_member()) WITH CHECK (public.is_active_mail_member())', t);
  END LOOP;
END $$;
ALTER TABLE public.crm_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.crm_jobs TO authenticated;
CREATE POLICY team_read ON public.crm_jobs FOR SELECT TO authenticated USING (public.is_active_mail_member());
CREATE POLICY team_queue ON public.crm_jobs FOR INSERT TO authenticated WITH CHECK (
  public.is_active_mail_member() AND created_by = auth.uid() AND status = 'queued'
  AND output = '' AND error IS NULL AND worker_id IS NULL AND claimed_at IS NULL AND finished_at IS NULL
);
ALTER TABLE public.crm_recipients ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crm_recipients TO authenticated;
CREATE POLICY team_read ON public.crm_recipients FOR SELECT TO authenticated USING (public.is_active_mail_member());
ALTER TABLE public.crm_workers ENABLE ROW LEVEL SECURITY;
-- Hashes are never returned to browser clients.
GRANT SELECT(id, name, active, last_seen_at, created_at) ON public.crm_workers TO authenticated;
CREATE POLICY team_read ON public.crm_workers FOR SELECT TO authenticated USING (public.is_active_mail_member());
GRANT ALL ON public.crm_contacts, public.crm_campaigns, public.crm_recipients, public.crm_jobs,
  public.crm_notes, public.crm_tasks, public.crm_experiments, public.crm_settings, public.crm_workers TO service_role;

CREATE FUNCTION public.crm_claim_job(p_worker uuid) RETURNS SETOF public.crm_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Interrupted jobs are failed rather than automatically repeated.
  UPDATE crm_jobs SET status = 'failed', error = 'Runner stopped responding. Review and queue a new job.', finished_at = now()
    WHERE status = 'running' AND claimed_at < now() - interval '35 minutes';
  RETURN QUERY UPDATE crm_jobs SET status = 'running', worker_id = p_worker, claimed_at = now()
    WHERE id = (SELECT id FROM crm_jobs WHERE status = 'queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.crm_claim_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_claim_job(uuid) TO service_role;

CREATE FUNCTION public.crm_claim_recipient(p_campaign uuid) RETURNS SETOF public.crm_recipients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_campaigns WHERE id = p_campaign AND status = 'active') THEN RETURN; END IF;
  RETURN QUERY UPDATE crm_recipients SET status = 'sending', claimed_at = now()
    WHERE id = (SELECT id FROM crm_recipients WHERE campaign_id = p_campaign AND status = 'pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.crm_claim_recipient(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_claim_recipient(uuid) TO service_role;

CREATE FUNCTION public.crm_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER crm_contacts_updated BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_campaigns_updated BEFORE UPDATE ON public.crm_campaigns FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_settings_updated BEFORE UPDATE ON public.crm_settings FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- A received opt-out stops pending sends across every campaign. Staff can also suppress manually.
CREATE FUNCTION public.crm_link_reply() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE address text; contact uuid; opting_out boolean;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  address := lower(trim(coalesce(substring(NEW.from_address from '<([^>]+)>'), NEW.from_address)));
  SELECT id INTO contact FROM crm_contacts WHERE email = address;
  IF contact IS NULL THEN RETURN NEW; END IF;
  opting_out := NEW.text_body ~* '(^|[[:space:]])(unsubscribe|remove me|stop emailing|do not contact)([[:space:].,!]|$)';
  UPDATE crm_recipients r SET reply_sentiment = CASE WHEN opting_out THEN 'unsubscribe' ELSE 'neutral' END
    WHERE r.contact_id = contact AND r.status = 'sent' AND r.reply_sentiment = 'none'
    AND EXISTS (SELECT 1 FROM mail_messages m WHERE m.id = r.message_id AND m.thread_id = NEW.thread_id);
  IF opting_out THEN
    UPDATE crm_contacts SET suppressed = true WHERE id = contact;
    UPDATE crm_recipients SET status = 'suppressed' WHERE contact_id = contact AND status = 'pending';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_mail_reply AFTER INSERT ON public.mail_messages FOR EACH ROW EXECUTE FUNCTION public.crm_link_reply();
