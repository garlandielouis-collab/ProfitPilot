-- Migration: Enhance expenses table for full cash-outflow tracking
-- Date: 2026-05-22

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS currency        VARCHAR(3)   NOT NULL DEFAULT 'HTG',
  ADD COLUMN IF NOT EXISTS payment_status  VARCHAR(20)  NOT NULL DEFAULT 'Payé',
  ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS supplier_id     UUID         REFERENCES suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN expenses.currency        IS 'HTG or USD';
COMMENT ON COLUMN expenses.payment_status  IS 'Payé | En attente | Dette';
COMMENT ON COLUMN expenses.payment_method  IS 'Espèces | Carte | Mobile';
COMMENT ON COLUMN expenses.supplier_id     IS 'FK → suppliers for debt-payment expenses';
