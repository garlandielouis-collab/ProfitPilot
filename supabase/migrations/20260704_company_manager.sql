-- ══════════════════════════════════════════════════════════════════════════════
-- COMPANY MANAGER — ProfitPilot
-- Adds archived_at to businesses so archive ≠ delete.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_archived
  ON businesses(owner_id, archived_at)
  WHERE deleted_at IS NULL;
