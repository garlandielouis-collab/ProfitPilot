-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Insert missing owner rows into business_members.
--
-- Root cause: business_members had no GRANT when stores were created, so the
-- owner INSERT in stores.ts silently failed (no error check). fn_is_member()
-- only queries business_members, so owners without a row there are blocked
-- by every RLS policy that uses fn_is_member().
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO business_members (business_id, user_id, role, is_active, created_at)
SELECT
  b.id          AS business_id,
  b.owner_id    AS user_id,
  'owner'       AS role,
  true          AS is_active,
  b.created_at  AS created_at
FROM businesses b
WHERE b.owner_id IS NOT NULL
  AND b.deleted_at  IS NULL
  AND b.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM business_members bm
    WHERE bm.business_id = b.id
      AND bm.user_id     = b.owner_id
  );
