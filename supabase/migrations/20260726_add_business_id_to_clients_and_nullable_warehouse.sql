-- Migration: add business_id to clients if missing and make inventory_movements.warehouse_id nullable fallback
BEGIN;

-- 1) Ensure clients.business_id column exists (UUID referencing businesses)
ALTER TABLE IF EXISTS clients
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE SET NULL;

-- 2) Add index to speed queries
CREATE INDEX IF NOT EXISTS idx_clients_business_id ON clients(business_id) WHERE business_id IS NOT NULL;

-- 3) Make inventory_movements.warehouse_id nullable (if it was NOT NULL)
ALTER TABLE IF EXISTS inventory_movements
  ALTER COLUMN warehouse_id DROP NOT NULL;

COMMIT;

-- NOTE: After running this migration, please run "supabase functions reload-schema" or refresh Supabase schema cache.
