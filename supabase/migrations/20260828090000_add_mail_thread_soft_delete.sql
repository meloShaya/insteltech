ALTER TABLE public.mail_threads
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mail_threads_active_last_message_idx
ON public.mail_threads (last_message_at DESC)
WHERE deleted_at IS NULL;

GRANT UPDATE (deleted_at) ON TABLE public.mail_threads TO authenticated;

DROP POLICY IF EXISTS mail_threads_member_update ON public.mail_threads;
CREATE POLICY mail_threads_member_update
ON public.mail_threads
FOR UPDATE
TO authenticated
USING (public.is_active_mail_member())
WITH CHECK (public.is_active_mail_member());
