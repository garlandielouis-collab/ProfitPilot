-- ══════════════════════════════════════════════════════════════════════════════
-- MULTI-TENANT V2 — ProfitPilot
-- Adds subscription_plan cache to businesses.
-- All other needed columns (logo_url, country, timezone, email, phone,
-- address, tax_id) already exist in the complete_schema_v2 migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- Cached subscription plan on the business (updated via webhook / trigger)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT NULL;

-- Index for fast lookup by owner
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_business_members_user ON business_members(user_id) WHERE deleted_at IS NULL AND is_active = true;

-- ── Drop conflicting policies that caused RLS recursion ─────────────────────
-- These were added by migration 20260629_premium_features.sql and create
-- a cross-table loop: businesses → business_members → businesses.
DROP POLICY IF EXISTS "bm_owner_full"          ON business_members;
DROP POLICY IF EXISTS "bm_member_select"       ON business_members;
DROP POLICY IF EXISTS "businesses_member_read" ON businesses;

-- ── Ensure correct SECURITY DEFINER helpers exist ───────────────────────────
-- (These are idempotent — safe to re-run)
CREATE OR REPLACE FUNCTION fn_is_member(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND is_active   = true
      AND deleted_at  IS NULL
  );
END;
$$;

-- ── RLS: businesses ──────────────────────────────────────────────────────────
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "businesses_owner_all"   ON businesses;
DROP POLICY IF EXISTS "businesses_member_view" ON businesses;

CREATE POLICY "businesses_owner_all" ON businesses
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "businesses_member_view" ON businesses
  FOR SELECT USING (fn_is_member(id));

-- ── RLS: business_members ────────────────────────────────────────────────────
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bm_owner_manage" ON business_members;
DROP POLICY IF EXISTS "bm_self_view"    ON business_members;

CREATE POLICY "bm_owner_manage" ON business_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_members.business_id
        AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "bm_self_view" ON business_members
  FOR SELECT USING (user_id = auth.uid());
