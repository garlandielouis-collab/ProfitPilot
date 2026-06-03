-- ============================================================
-- MINIMAL FIX: make business_id optional in ai_conversations
-- + correct RLS for ai_conversations and ai_messages
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1. Remove NOT NULL constraint on business_id
--    (conversations no longer require a business row)
ALTER TABLE ai_conversations
  ALTER COLUMN business_id DROP NOT NULL;

-- 2. ai_conversations: each user sees and manages their own conversations
DROP POLICY IF EXISTS "ai_conversations: user full"  ON ai_conversations;
DROP POLICY IF EXISTS "conversations: member access" ON ai_conversations;
DROP POLICY IF EXISTS "conversations: member write"  ON ai_conversations;

CREATE POLICY "ai_conversations: user full" ON ai_conversations
  FOR ALL
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- 3. ai_messages: user sees messages from their own conversations
DROP POLICY IF EXISTS "ai_messages: user full"      ON ai_messages;
DROP POLICY IF EXISTS "messages: conv member"       ON ai_messages;
DROP POLICY IF EXISTS "messages: conv member write" ON ai_messages;

CREATE POLICY "ai_messages: user full" ON ai_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE id = conversation_id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE id = conversation_id
        AND user_id = auth.uid()
    )
  );

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
