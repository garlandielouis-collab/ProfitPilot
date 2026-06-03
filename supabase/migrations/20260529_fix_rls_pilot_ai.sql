-- ============================================================
-- FIX: RLS policies for businesses, business_members,
--       ai_conversations, ai_messages
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. businesses ─────────────────────────────────────────────
-- Drop old policies that may be blocking INSERT for new users
DROP POLICY IF EXISTS "businesses: owner manages"      ON businesses;
DROP POLICY IF EXISTS "businesses: member access"      ON businesses;
DROP POLICY IF EXISTS "businesses: owner full access"  ON businesses;

-- Owner can do everything on their own business
CREATE POLICY "businesses: owner full access" ON businesses
  FOR ALL
  USING     (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── 2. business_members ───────────────────────────────────────
-- Drop old policies
DROP POLICY IF EXISTS "members: admin manages"      ON business_members;
DROP POLICY IF EXISTS "members: see team"           ON business_members;
DROP POLICY IF EXISTS "members: owner bootstrap"    ON business_members;
DROP POLICY IF EXISTS "members: owner manage"       ON business_members;
DROP POLICY IF EXISTS "members: member read"        ON business_members;

-- A user can INSERT themselves as owner when they own the business
CREATE POLICY "business_members: owner bootstrap" ON business_members
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM businesses WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Members can see their own memberships
CREATE POLICY "business_members: member read" ON business_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND owner_id = auth.uid())
  );

-- Owner can manage all members
CREATE POLICY "business_members: owner manage" ON business_members
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND owner_id = auth.uid())
  );

-- ── 3. ai_conversations ───────────────────────────────────────
DROP POLICY IF EXISTS "ai_conversations: user full"        ON ai_conversations;
DROP POLICY IF EXISTS "conversations: member access"       ON ai_conversations;
DROP POLICY IF EXISTS "conversations: member write"        ON ai_conversations;

CREATE POLICY "ai_conversations: user full" ON ai_conversations
  FOR ALL
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 4. ai_messages ────────────────────────────────────────────
DROP POLICY IF EXISTS "ai_messages: user full"      ON ai_messages;
DROP POLICY IF EXISTS "messages: conv member"       ON ai_messages;
DROP POLICY IF EXISTS "messages: conv member write" ON ai_messages;

CREATE POLICY "ai_messages: user full" ON ai_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

-- ── 5. Make sure RLS is enabled on all 4 tables ───────────────
ALTER TABLE businesses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages       ENABLE ROW LEVEL SECURITY;
