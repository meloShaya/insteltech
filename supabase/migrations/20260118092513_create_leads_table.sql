/*
  # Create Leads Table for Lead Generation

  1. New Tables
    - `leads`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `email` (text, required)
      - `phone` (text, optional)
      - `business_name` (text, optional)
      - `business_type` (text, optional)
      - `interest` (text) - what service they're interested in
      - `source` (text) - where the lead came from
      - `lead_magnet` (text) - which lead magnet they opted into
      - `created_at` (timestamptz)
      - `status` (text) - new, contacted, qualified, converted

  2. Security
    - Enable RLS on `leads` table
    - Allow anonymous inserts for lead capture forms
    - Restrict select/update/delete to authenticated service role only
*/

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text DEFAULT '',
  business_name text DEFAULT '',
  business_type text DEFAULT '',
  interest text DEFAULT '',
  source text DEFAULT 'website',
  lead_magnet text DEFAULT '',
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous lead submission"
  ON leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role can read leads"
  ON leads
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can update leads"
  ON leads
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete leads"
  ON leads
  FOR DELETE
  TO service_role
  USING (true);