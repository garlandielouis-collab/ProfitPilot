-- Create clients table for CRM (sales clients / credit tracking)
CREATE TABLE IF NOT EXISTS clients (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  phone        TEXT,
  email        TEXT,
  total_credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients(owner_id);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_owner_all" ON clients
  FOR ALL USING (auth.uid() = owner_id);

GRANT ALL ON clients TO authenticated, service_role;
