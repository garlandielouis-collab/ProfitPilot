-- Merge `clients` table into `customers` — single unified customer table
-- All CRM columns (owner_id, total_credit, name) are added to `customers`.

-- 1. Drop unique constraint that would conflict with nullable emails
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_business_id_email_key;

-- 2. Add CRM columns to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_credit numeric(20,4) NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS name text;

-- 3. Make columns nullable for CRM compatibility
ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN last_name DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN business_id DROP NOT NULL;

-- 4. Migrate data from clients → customers (skip IDs that already exist)
INSERT INTO customers (id, owner_id, business_id, name, phone, email, total_credit, created_at)
SELECT
  c.id,
  c.owner_id,
  c.business_id,
  c.name,
  c.phone,
  c.email,
  c.total_credit,
  c.created_at
FROM clients c
WHERE c.id NOT IN (SELECT id FROM customers);

-- 5. Update foreign keys that pointed to clients
-- sales.customer_id
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_customer_id_fkey;
ALTER TABLE sales ADD CONSTRAINT sales_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- client_credits.client_id
ALTER TABLE client_credits DROP CONSTRAINT IF EXISTS client_credits_client_id_fkey;
ALTER TABLE client_credits ADD CONSTRAINT client_credits_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE SET NULL;

-- customer_transactions.client_id
ALTER TABLE customer_transactions DROP CONSTRAINT IF EXISTS customer_transactions_client_id_fkey;
ALTER TABLE customer_transactions ADD CONSTRAINT customer_transactions_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE SET NULL;

-- 6. Create indexes for CRM queries
CREATE INDEX IF NOT EXISTS idx_customers_owner_id ON customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name) WHERE name IS NOT NULL;

-- 7. Update RLS policies — replace old ones with unified policy
DROP POLICY IF EXISTS "customers_owner_all" ON customers;
DROP POLICY IF EXISTS "customers_public_insert" ON customers;
DROP POLICY IF EXISTS "customers_access" ON customers;

CREATE POLICY "customers_owner_all" ON customers
  FOR ALL USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM businesses b WHERE b.id = customers.business_id AND b.owner_id = auth.uid()
    )
    OR (
      business_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.business_id = customers.business_id
          AND bm.user_id = auth.uid()
          AND bm.is_active = TRUE
          AND bm.deleted_at IS NULL
      )
    )
  );

-- Guest checkout: allow unauthenticated inserts
CREATE POLICY "customers_public_insert" ON customers
  FOR INSERT WITH CHECK (TRUE);

-- 8. Drop clients table
DROP TABLE IF EXISTS clients CASCADE;
