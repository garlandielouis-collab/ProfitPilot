-- Migration: Add payment_method, discount, and metadata to purchases & sales
-- Date: 2026-05-22

-- purchases ───────────────────────────────────────────────────────────────────
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata        JSONB;

COMMENT ON COLUMN purchases.payment_method  IS 'Moncash | Natcash | Carte Visa | Espèces';
COMMENT ON COLUMN purchases.discount_percent IS 'Rabais appliqué (0-100%)';
COMMENT ON COLUMN purchases.metadata        IS 'e.g. {"payment_phone":"50937304541","payment_network":"Moncash"}';

-- sales ───────────────────────────────────────────────────────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN sales.metadata IS 'e.g. {"payment_phone":"50937304541","payment_network":"Moncash"}';
