-- ============================================================================
-- Fix: infinite recursion in RLS policies for businesses / business_members
-- Root cause: businesses policy → queries business_members → business_members
--             policy subquery → queries business_members again → infinite loop
-- ============================================================================

-- ── 1. Fix business_members SELECT policy ────────────────────────────────────
-- OLD (broken): subquery to same table → recursive RLS evaluation
-- NEW: direct column check only — no subquery, no recursion

DROP POLICY IF EXISTS "bm_member_select" ON business_members;

CREATE POLICY "bm_member_select" ON business_members
FOR SELECT
USING (user_id = auth.uid());

-- ── 2. Fix businesses SELECT policy for members ───────────────────────────────
-- The EXISTS subquery into business_members is now safe because
-- business_members RLS is just "user_id = auth.uid()" — no further recursion

DROP POLICY IF EXISTS "businesses_member_read" ON businesses;

CREATE POLICY "businesses_member_read" ON businesses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM business_members bm
    WHERE bm.business_id = businesses.id
      AND bm.user_id    = auth.uid()
      AND bm.is_active  = true
      AND bm.deleted_at IS NULL
  )
);

-- ── Verify no recursion ──────────────────────────────────────────────────────
-- Run manually to confirm:
-- SELECT id, name FROM businesses LIMIT 5;
-- SELECT id, role FROM business_members WHERE user_id = auth.uid() LIMIT 5;
