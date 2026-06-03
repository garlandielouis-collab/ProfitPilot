-- Migration: Fix AI Module RLS Policies
-- Date: 2025-05-30
-- Purpose: Add missing RLS policies for ai_conversations and ai_messages tables

-- ============================================================================
-- 1. Fix ai_conversations RLS (ensure policies exist for user isolation)
-- ============================================================================

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe cleanup)
DROP POLICY IF EXISTS "ai_conversations_select_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_insert_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_update_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_delete_own" ON ai_conversations;

-- Recreate policies with correct logic
CREATE POLICY "ai_conversations_select_own"
ON ai_conversations
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "ai_conversations_insert_own"
ON ai_conversations
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_conversations_update_own"
ON ai_conversations
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_conversations_delete_own"
ON ai_conversations
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- 2. Fix ai_messages RLS (add missing policies)
-- ============================================================================

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "ai_messages_select_own" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_insert_own" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_update_own" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_delete_own" ON ai_messages;

-- Users can see messages from their own conversations
CREATE POLICY "ai_messages_select_own"
ON ai_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
    AND ai_conversations.user_id = auth.uid()
  )
);

-- Users can insert messages to their conversations
CREATE POLICY "ai_messages_insert_own"
ON ai_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
    AND ai_conversations.user_id = auth.uid()
  )
);

-- Users can update messages in their conversations
CREATE POLICY "ai_messages_update_own"
ON ai_messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
    AND ai_conversations.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
    AND ai_conversations.user_id = auth.uid()
  )
);

-- Users can delete messages in their conversations
CREATE POLICY "ai_messages_delete_own"
ON ai_messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
    AND ai_conversations.user_id = auth.uid()
  )
);

-- ============================================================================
-- 3. Fix businesses RLS (ensure correct owner_id policy)
-- ============================================================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "businesses_select_own" ON businesses;
DROP POLICY IF EXISTS "businesses_insert_own" ON businesses;
DROP POLICY IF EXISTS "businesses_update_own" ON businesses;
DROP POLICY IF EXISTS "businesses_delete_own" ON businesses;

-- Users can see businesses they own
CREATE POLICY "businesses_select_own"
ON businesses
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

-- Users can create businesses
CREATE POLICY "businesses_insert_own"
ON businesses
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

-- Users can update their own businesses
CREATE POLICY "businesses_update_own"
ON businesses
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Users can delete their own businesses
CREATE POLICY "businesses_delete_own"
ON businesses
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- ============================================================================
-- 4. Create user_preferences table if missing
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'light',
  language TEXT DEFAULT 'fr',
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "user_preferences_self_select" ON user_preferences;
DROP POLICY IF EXISTS "user_preferences_self_insert" ON user_preferences;
DROP POLICY IF EXISTS "user_preferences_self_update" ON user_preferences;
DROP POLICY IF EXISTS "user_preferences_self_delete" ON user_preferences;

-- Users can only access their own preferences
CREATE POLICY "user_preferences_self_select"
ON user_preferences
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "user_preferences_self_insert"
ON user_preferences
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_preferences_self_update"
ON user_preferences
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_preferences_self_delete"
ON user_preferences
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- 5. Verify grants to authenticated role
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON businesses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_preferences TO authenticated;
