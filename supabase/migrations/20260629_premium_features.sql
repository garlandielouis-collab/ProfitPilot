-- ============================================================================
-- Migration: Premium features — multi-stores, employees roles, deleted_at
-- ============================================================================

-- ── business_members: add deleted_at if missing ───────────────────────────────
ALTER TABLE business_members
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── business_members: RLS — employees can read their own membership ───────────
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bm_owner_full"    ON business_members;
DROP POLICY IF EXISTS "bm_member_read"   ON business_members;
DROP POLICY IF EXISTS "bm_member_select" ON business_members;

-- Owner of the business has full access
CREATE POLICY "bm_owner_full" ON business_members
FOR ALL
USING (
  business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  )
)
WITH CHECK (
  business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  )
);

-- Any active member can read the list
CREATE POLICY "bm_member_select" ON business_members
FOR SELECT
USING (
  business_id IN (
    SELECT business_id FROM business_members bm2
    WHERE bm2.user_id = auth.uid() AND bm2.is_active = true AND bm2.deleted_at IS NULL
  )
);

-- ── businesses: allow members to read their employer's business ───────────────
DROP POLICY IF EXISTS "businesses_member_read" ON businesses;

CREATE POLICY "businesses_member_read" ON businesses
FOR SELECT
USING (
  id IN (
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND is_active = true AND deleted_at IS NULL
  )
);

-- ── subscriptions: also check via user_id directly (not just business owner) ──
-- employees shouldn't trigger sub checks — no change needed

-- Done
