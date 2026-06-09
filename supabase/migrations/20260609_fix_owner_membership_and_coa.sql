-- ============================================================================
-- FIX: Add business owners to business_members + seed chart of accounts
-- ============================================================================
-- Root cause: getBusinessContext created businesses but never added the owner
-- to business_members. All accounting tables (expenses, journal_entries,
-- chart_of_accounts, etc.) are gated behind is_business_member() RLS policy,
-- so owners could not read/write any accounting data.
-- ============================================================================

-- 1. Add every business owner to business_members as 'owner' if not already there
INSERT INTO public.business_members (business_id, user_id, role, is_active, joined_at)
SELECT
  b.id          AS business_id,
  b.owner_id    AS user_id,
  'owner'       AS role,
  true          AS is_active,
  b.created_at  AS joined_at
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_members bm
  WHERE bm.business_id = b.id
    AND bm.user_id     = b.owner_id
    AND bm.deleted_at  IS NULL
)
ON CONFLICT (business_id, user_id) DO UPDATE
  SET role      = 'owner',
      is_active = true,
      deleted_at = NULL;

-- 2. Seed chart of accounts for every business that has none yet
DO $$
DECLARE
  biz_id UUID;
BEGIN
  FOR biz_id IN
    SELECT b.id
    FROM public.businesses b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts coa
      WHERE coa.business_id = b.id
    )
  LOOP
    PERFORM fn_seed_chart_of_accounts(biz_id);
  END LOOP;
END $$;
