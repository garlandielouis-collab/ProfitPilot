-- 20260605_add_expense_exchange_rate.sql
-- Add exchange_rate column to expenses for USD→HTG conversion tracking

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;
