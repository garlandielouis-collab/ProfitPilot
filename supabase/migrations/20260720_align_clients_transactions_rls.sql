-- Migration: Align CRM / AR / AP schema and make transaction tables RLS-safe
-- Date: 2026-07-20

-- Clients table (CRM) ------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  total_credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_clients_business_id ON clients(business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON clients(owner_id);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_owner_or_member" ON clients;
CREATE POLICY "clients_owner_or_member" ON clients
  FOR ALL
  USING (
    owner_id = auth.uid()
    OR (
      business_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.business_id = clients.business_id
          AND bm.user_id = auth.uid()
          AND bm.is_active = TRUE
          AND bm.deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (
      business_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.business_id = clients.business_id
          AND bm.user_id = auth.uid()
          AND bm.is_active = TRUE
          AND bm.deleted_at IS NULL
      )
    )
  );

-- Customer transactions table (client AR ledger) --------------------------
CREATE TABLE IF NOT EXISTS customer_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  invoice_number TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL DEFAULT 'sale',
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HTG',
  payment_method TEXT,
  notes TEXT,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_transactions
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'HTG',
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id UUID,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ct_business_id ON customer_transactions(business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ct_client_id ON customer_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_ct_sale_id ON customer_transactions(sale_id);
CREATE INDEX IF NOT EXISTS idx_ct_owner_date ON customer_transactions(owner_id, created_at DESC);

ALTER TABLE customer_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_transactions_business_member" ON customer_transactions;
CREATE POLICY "customer_transactions_business_member" ON customer_transactions
  FOR ALL
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = customer_transactions.business_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.deleted_at IS NULL
    )
  )
  WITH CHECK (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = customer_transactions.business_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.deleted_at IS NULL
    )
  );

-- Supplier transactions table (AP ledger) -----------------------------------
CREATE TABLE IF NOT EXISTS supplier_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL DEFAULT 'purchase',
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HTG',
  description TEXT,
  payment_method TEXT,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE supplier_transactions
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'HTG',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id UUID,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_st_business_id ON supplier_transactions(business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_st_supplier_id ON supplier_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_st_owner_date ON supplier_transactions(owner_id, created_at DESC);

ALTER TABLE supplier_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_transactions_business_member" ON supplier_transactions;
CREATE POLICY "supplier_transactions_business_member" ON supplier_transactions
  FOR ALL
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = supplier_transactions.business_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.deleted_at IS NULL
    )
  )
  WITH CHECK (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = supplier_transactions.business_id
        AND bm.user_id = auth.uid()
        AND bm.is_active = TRUE
        AND bm.deleted_at IS NULL
    )
  );
