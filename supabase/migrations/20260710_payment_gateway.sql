-- ══════════════════════════════════════════════════════════════════════════════
-- Payment gateway credentials on store_settings + transaction tracking on orders
-- ══════════════════════════════════════════════════════════════════════════════

-- Merchant API credentials (stored server-side, never exposed to clients)
-- Format: { "moncash": { "client_id": "", "client_secret": "", "sandbox": false },
--           "natcash":  { "client_id": "", "client_secret": "", "sandbox": false } }
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS payment_credentials JSONB NOT NULL DEFAULT '{}';

-- Track the gateway transaction ID for verification / reconciliation
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_gateway        TEXT;

GRANT ALL ON store_settings TO authenticated, service_role;
GRANT ALL ON orders         TO authenticated, service_role;
