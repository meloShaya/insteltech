-- Private mailbox data for the mobile InstelTech mail portal.

CREATE TABLE IF NOT EXISTS public.mail_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mail_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL DEFAULT '(no subject)',
  normalized_subject text NOT NULL DEFAULT '',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mail_threads
  ADD COLUMN IF NOT EXISTS normalized_subject text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.mail_threads (id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  provider_id text UNIQUE,
  client_send_id text UNIQUE,
  internet_message_id text,
  in_reply_to text,
  references_header text,
  from_address text NOT NULL,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '(no subject)',
  text_body text NOT NULL DEFAULT '',
  html_body text,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'sending', 'sent', 'failed', 'unknown')),
  error_message text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  backup_forward_status text NOT NULL DEFAULT 'pending'
    CHECK (backup_forward_status IN ('pending', 'sent', 'failed', 'not_configured')),
  backup_forwarded_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mail_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.mail_messages (id) ON DELETE CASCADE,
  provider_attachment_id text,
  storage_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  byte_size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.mail_threads, public.mail_messages, public.mail_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_members TO authenticated;

CREATE INDEX IF NOT EXISTS mail_threads_last_message_idx
  ON public.mail_threads (last_message_at DESC);

CREATE INDEX IF NOT EXISTS mail_threads_normalized_subject_idx
  ON public.mail_threads (normalized_subject);

CREATE INDEX IF NOT EXISTS mail_messages_thread_created_idx
  ON public.mail_messages (thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS mail_messages_internet_message_idx
  ON public.mail_messages (internet_message_id);

CREATE INDEX IF NOT EXISTS mail_messages_subject_idx
  ON public.mail_messages (subject);

CREATE OR REPLACE FUNCTION public.is_active_mail_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mail_members
    WHERE user_id = auth.uid()
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mail_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mail_members
    WHERE user_id = auth.uid()
      AND active = true
      AND role = 'owner'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_mail_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mail_owner() TO authenticated;

ALTER TABLE public.mail_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_members_select ON public.mail_members;
CREATE POLICY mail_members_select
  ON public.mail_members
  FOR SELECT
  TO authenticated
  USING (public.is_active_mail_member());

DROP POLICY IF EXISTS mail_members_owner_manage ON public.mail_members;
CREATE POLICY mail_members_owner_manage
  ON public.mail_members
  FOR ALL
  TO authenticated
  USING (public.is_mail_owner())
  WITH CHECK (public.is_mail_owner());

DROP POLICY IF EXISTS mail_threads_member_read ON public.mail_threads;
CREATE POLICY mail_threads_member_read
  ON public.mail_threads
  FOR SELECT
  TO authenticated
  USING (public.is_active_mail_member());

DROP POLICY IF EXISTS mail_messages_member_read ON public.mail_messages;
CREATE POLICY mail_messages_member_read
  ON public.mail_messages
  FOR SELECT
  TO authenticated
  USING (public.is_active_mail_member());

DROP POLICY IF EXISTS mail_attachments_member_read ON public.mail_attachments;
CREATE POLICY mail_attachments_member_read
  ON public.mail_attachments
  FOR SELECT
  TO authenticated
  USING (public.is_active_mail_member());

INSERT INTO storage.buckets (id, name, public)
VALUES ('mail-attachments', 'mail-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS mail_attachment_upload ON storage.objects;
CREATE POLICY mail_attachment_upload
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'mail-attachments'
    AND public.is_active_mail_member()
    AND (storage.foldername(name))[1] = 'outgoing'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS mail_attachment_read ON storage.objects;
CREATE POLICY mail_attachment_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'mail-attachments'
    AND public.is_active_mail_member()
  );

DROP POLICY IF EXISTS mail_attachment_delete ON storage.objects;
CREATE POLICY mail_attachment_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'mail-attachments'
    AND public.is_active_mail_member()
    AND (storage.foldername(name))[1] = 'outgoing'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
