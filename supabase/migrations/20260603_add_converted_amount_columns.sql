-- 20260603_add_converted_amount_columns.sql
-- Add fields to store converted amounts and currency for reporting

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS converted_amount numeric,
  ADD COLUMN IF NOT EXISTS converted_currency text;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS converted_amount numeric,
  ADD COLUMN IF NOT EXISTS converted_currency text;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS converted_amount numeric,
  ADD COLUMN IF NOT EXISTS converted_currency text;

ALTER TABLE customer_transactions
  ADD COLUMN IF NOT EXISTS converted_amount numeric,
  ADD COLUMN IF NOT EXISTS converted_currency text;
