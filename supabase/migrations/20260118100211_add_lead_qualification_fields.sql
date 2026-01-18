/*
  # Add Lead Qualification Fields

  1. Changes
    - Add `employee_count` column for number of full time employees
    - Add `annual_revenue` column for business annual revenue
    - Add `ownership_type` column for ownership structure

  2. Notes
    - All new fields are optional to maintain backwards compatibility
    - These fields help qualify leads for sales conversations
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'employee_count'
  ) THEN
    ALTER TABLE leads ADD COLUMN employee_count text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'annual_revenue'
  ) THEN
    ALTER TABLE leads ADD COLUMN annual_revenue text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'ownership_type'
  ) THEN
    ALTER TABLE leads ADD COLUMN ownership_type text DEFAULT '';
  END IF;
END $$;