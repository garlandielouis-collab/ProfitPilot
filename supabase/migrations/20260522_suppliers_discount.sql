-- Migration: Add discount_percent to suppliers
-- Date: 2026-05-22
-- Description: Adds an optional discount percentage field per supplier

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Comment for documentation
COMMENT ON COLUMN suppliers.discount_percent IS 'Default discount percentage applied on purchases from this supplier (0-100)';
