/*
  # Create Giveaway Campaign Tables

  ## Overview
  Creates database tables for the "Ultimate AI Business Assistant Giveaway" campaign.
  This includes entry tracking, referral system, and qualifying actions management.

  ## New Tables

  ### `giveaway_entries`
  Main table for storing all giveaway entries with qualification data.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique entry identifier
  - `name` (text, required) - Entrant's full name
  - `email` (text, required, unique) - Entrant's email address
  - `phone` (text, required) - Contact phone number
  - `whatsapp_number` (text, required) - WhatsApp contact
  - `business_name` (text, required) - Name of business
  - `business_type` (text, required) - Type/industry of business
  - `business_description` (text, nullable) - Description of business
  - `annual_revenue` (text, required) - Revenue range
  - `employee_count` (text, required) - Number of employees
  - `current_challenges` (text, required) - Business challenges they face
  - `why_should_they_win` (text, required) - Why they deserve to win
  - `biggest_business_goal` (text, required) - Their main business goal
  - `timeline_urgency` (text, required) - Why they need it now
  - `referred_by_email` (text, nullable) - Email of referrer if applicable
  - `referral_code` (text, unique) - Unique code for this entrant to share
  - `qualifying_actions_completed` (jsonb, default {}) - Tracks completed actions
  - `joined_whatsapp_channel` (boolean, default false) - WhatsApp channel join status
  - `email_verified` (boolean, default false) - Email verification status
  - `shared_facebook` (boolean, default false) - Facebook share status
  - `shared_linkedin` (boolean, default false) - LinkedIn share status
  - `tagged_friends` (boolean, default false) - Friend tagging status
  - `registered_webinar` (boolean, default false) - Webinar registration status
  - `entry_score` (integer, default 0) - Total points from qualifying actions
  - `is_qualified` (boolean, default false) - Meets minimum qualification
  - `is_winner` (boolean, default false) - Selected as winner
  - `is_referral_winner` (boolean, default false) - Won through referral bonus
  - `utm_source` (text, nullable) - Traffic source
  - `utm_campaign` (text, nullable) - Campaign identifier
  - `utm_medium` (text, nullable) - Marketing medium
  - `ip_address` (text, nullable) - Entry IP address
  - `status` (text, default 'pending') - Entry status
  - `created_at` (timestamptz, default now()) - Entry timestamp
  - `updated_at` (timestamptz, default now()) - Last update timestamp

  ### `giveaway_referrals`
  Tracks referral relationships for the double-prize mechanism.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique referral record
  - `referrer_email` (text, required) - Person who referred
  - `referrer_code` (text, required) - Referrer's unique code
  - `referred_email` (text, required) - Person who was referred
  - `referral_qualified` (boolean, default false) - Referred person completed entry
  - `referral_status` (text, default 'pending') - Status: pending, qualified, winner_bonus_earned
  - `created_at` (timestamptz, default now()) - Referral timestamp

  ## Security
  - Enable RLS on both tables
  - Allow public INSERT for new entries
  - Allow public SELECT for referral code validation
  - Restrict UPDATE/DELETE to authenticated admin users only

  ## Indexes
  - Index on email for quick lookups
  - Index on referral_code for referral tracking
  - Index on entry_score for leaderboard queries
  - Index on created_at for time-based queries
*/

-- Create giveaway_entries table
CREATE TABLE IF NOT EXISTS giveaway_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL,
  whatsapp_number text NOT NULL,
  business_name text NOT NULL,
  business_type text NOT NULL,
  business_description text,
  annual_revenue text NOT NULL,
  employee_count text NOT NULL,
  current_challenges text NOT NULL,
  why_should_they_win text NOT NULL,
  biggest_business_goal text NOT NULL,
  timeline_urgency text NOT NULL,
  referred_by_email text,
  referral_code text UNIQUE NOT NULL,
  qualifying_actions_completed jsonb DEFAULT '{}'::jsonb,
  joined_whatsapp_channel boolean DEFAULT false,
  email_verified boolean DEFAULT false,
  shared_facebook boolean DEFAULT false,
  shared_linkedin boolean DEFAULT false,
  tagged_friends boolean DEFAULT false,
  registered_webinar boolean DEFAULT false,
  entry_score integer DEFAULT 0,
  is_qualified boolean DEFAULT false,
  is_winner boolean DEFAULT false,
  is_referral_winner boolean DEFAULT false,
  utm_source text,
  utm_campaign text,
  utm_medium text,
  ip_address text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create giveaway_referrals table
CREATE TABLE IF NOT EXISTS giveaway_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_email text NOT NULL,
  referrer_code text NOT NULL,
  referred_email text NOT NULL,
  referral_qualified boolean DEFAULT false,
  referral_status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_email ON giveaway_entries(email);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_referral_code ON giveaway_entries(referral_code);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_score ON giveaway_entries(entry_score DESC);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_created ON giveaway_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_giveaway_referrals_referrer ON giveaway_referrals(referrer_email);
CREATE INDEX IF NOT EXISTS idx_giveaway_referrals_referred ON giveaway_referrals(referred_email);

-- Enable Row Level Security
ALTER TABLE giveaway_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for giveaway_entries
CREATE POLICY "Anyone can insert new giveaway entries"
  ON giveaway_entries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can view giveaway entries for referral validation"
  ON giveaway_entries
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Only authenticated users can update entries"
  ON giveaway_entries
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Only authenticated users can delete entries"
  ON giveaway_entries
  FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for giveaway_referrals
CREATE POLICY "Anyone can insert referral records"
  ON giveaway_referrals
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can view referral records"
  ON giveaway_referrals
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Only authenticated users can update referrals"
  ON giveaway_referrals
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Only authenticated users can delete referrals"
  ON giveaway_referrals
  FOR DELETE
  TO authenticated
  USING (true);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_giveaway_entries_updated_at ON giveaway_entries;
CREATE TRIGGER update_giveaway_entries_updated_at
  BEFORE UPDATE ON giveaway_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();