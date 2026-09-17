-- Preserve imported research evidence alongside the human-readable notes.
ALTER TABLE public.crm_contacts
  ADD COLUMN raw_json jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(raw_json) IN ('object', 'array'));
