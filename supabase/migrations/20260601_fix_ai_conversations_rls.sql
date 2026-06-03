-- Fix AI Conversations RLS: replace is_business_owner policies with user_id = auth.uid()

-- 1. Ensure business_id is nullable
ALTER TABLE ai_conversations ALTER COLUMN business_id DROP NOT NULL;

-- 2. Drop ALL existing policies on ai_conversations
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'ai_conversations' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ai_conversations', r.policyname);
  END LOOP;
END $$;

-- 3. Simple user_id = auth.uid() policy
CREATE POLICY "ai_conversations: own" ON ai_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- 4. Drop ALL existing policies on ai_messages
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'ai_messages' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ai_messages', r.policyname);
  END LOOP;
END $$;

-- 5. ai_messages scoped through conversation ownership
CREATE POLICY "ai_messages: own" ON ai_messages
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid()
  ));
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
