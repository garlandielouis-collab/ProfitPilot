-- ─── CRM: Table clients ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  phone        TEXT,
  email        TEXT,
  total_credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_owner" ON clients;
CREATE POLICY "clients_owner" ON clients FOR ALL USING (owner_id = auth.uid());

-- ─── Extend sales table ───────────────────────────────────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_name      TEXT,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status   TEXT NOT NULL DEFAULT 'Payé',
  ADD COLUMN IF NOT EXISTS invoice_number   TEXT;

-- ─── Créances clients (credit sales owed by clients) ──────────────────────
CREATE TABLE IF NOT EXISTS client_credits (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id        UUID        REFERENCES sales(id) ON DELETE SET NULL,
  client_id      UUID        REFERENCES clients(id) ON DELETE SET NULL,
  client_name    TEXT        NOT NULL,
  invoice_number TEXT,
  amount         NUMERIC(12,2) NOT NULL,
  currency       TEXT        NOT NULL DEFAULT 'HTG',
  payment_status TEXT        NOT NULL DEFAULT 'À Crédit',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE client_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_credits_owner" ON client_credits;
CREATE POLICY "client_credits_owner" ON client_credits FOR ALL USING (owner_id = auth.uid());
