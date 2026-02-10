/*
  # Create Giveaway Config Table

  1. New Tables
    - `giveaway_config`
      - `id` (integer, primary key) - Single row config
      - `end_date` (timestamptz) - When the giveaway ends
      - `created_at` (timestamptz) - When config was created

  2. Initial Data
    - Sets giveaway end date to February 17, 2026 00:00:00 UTC (7 days from Feb 10)

  3. Security
    - Enable RLS on `giveaway_config` table
    - Allow public SELECT so countdown can be read by anyone
    - Restrict INSERT/UPDATE/DELETE to authenticated users
*/

CREATE TABLE IF NOT EXISTS giveaway_config (
  id integer PRIMARY KEY DEFAULT 1,
  end_date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE giveaway_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read giveaway config"
  ON giveaway_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Only authenticated users can insert config"
  ON giveaway_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Only authenticated users can update config"
  ON giveaway_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Only authenticated users can delete config"
  ON giveaway_config
  FOR DELETE
  TO authenticated
  USING (true);

INSERT INTO giveaway_config (id, end_date)
VALUES (1, '2026-02-17T00:00:00Z')
ON CONFLICT (id) DO NOTHING;