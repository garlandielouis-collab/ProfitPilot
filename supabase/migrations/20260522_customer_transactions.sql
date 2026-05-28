-- ── customer_transactions ──────────────────────────────────────────────────────
-- Enregistre chaque vant nan istwa kliyan an (tout tranzaksyon pa kliyan)

CREATE TABLE IF NOT EXISTS customer_transactions (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id      UUID          REFERENCES clients(id) ON DELETE SET NULL,
  client_name    TEXT          NOT NULL,
  sale_id        UUID          REFERENCES sales(id) ON DELETE SET NULL,
  invoice_number TEXT,
  type           TEXT          NOT NULL DEFAULT 'sale',  -- 'sale' | 'payment' | 'refund'
  amount         NUMERIC(12,2) NOT NULL,
  currency       TEXT          NOT NULL DEFAULT 'HTG',
  payment_method TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ct_owner" ON customer_transactions;
CREATE POLICY "ct_owner" ON customer_transactions
  FOR ALL USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_ct_client_id  ON customer_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_ct_invoice_no ON customer_transactions(invoice_number);
CREATE INDEX IF NOT EXISTS idx_ct_owner_date ON customer_transactions(owner_id, created_at DESC);
