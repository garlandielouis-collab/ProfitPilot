# Database Schema & RLS Diagnostic Report

## Status

✅ **Authentication/Cookies**: FIXED
- `auth.getUser()` works
- `getSupabaseServer()` properly async
- Session cookies injected correctly

❌ **Database RLS & Schema**: BROKEN
- Multiple tables missing RLS policies
- Permission denied errors
- `user_preferences` table missing
- Performance issue: 106+ seconds in createConversation()

---

## Problem 1: `createConversation()` Takes 106+ Seconds

**Root Cause**: 
`getAuthContext()` → `getBusinessContext()` tries to query `businesses` table but fails with permission denied, causing timeout/retry.

**The Problem**:
```typescript
// conversations.ts
export async function createConversation(title = 'Nouvelle analyse'): Promise<Conversation> {
  const { user, supabase } = await getAuthContext();  // ← CALLS getBusinessContext()
  // ...
}
```

**Why it's slow**:
1. getAuthContext() = getBusinessContext()
2. Tries to read `businesses` table
3. RLS policy blocks it (or is missing)
4. Supabase times out after 100+ seconds
5. Request fails

**Solution**: 
- createConversation() does NOT need businessId
- Should call lightweight getSupabaseServer() + auth check only
- Don't auto-create business in conversation flow

---

## Problem 2: `ai_messages` RLS Missing

**Error**: `permission denied for table ai_messages`

**Current State**:
- Table exists but RLS policies are missing or incorrect
- Users can't read their own messages

**Required Policies**:
```sql
-- Policy 1: Users can select messages from their conversations
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

-- Policy 2: Users can insert messages to their conversations
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

-- Policy 3: Users can update messages in their conversations
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
);

-- Policy 4: Users can delete messages in their conversations
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
```

---

## Problem 3: `businesses` RLS Incorrect

**Error**: `permission denied for table businesses`

**Issue**: 
- `getBusinessContext()` queries with `eq('owner_id', user.id)`
- But RLS policy may not exist or is checking wrong condition

**Required Policy**:
```sql
-- Ensure RLS is enabled
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Users can see businesses they own
CREATE POLICY "businesses_select_own"
ON businesses
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

-- Users can insert businesses (initial creation)
CREATE POLICY "businesses_insert_own"
ON businesses
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

-- Users can update their businesses
CREATE POLICY "businesses_update_own"
ON businesses
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Users can delete their businesses
CREATE POLICY "businesses_delete_own"
ON businesses
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());
```

---

## Problem 4: `user_preferences` Table Missing

**Error**: `Could not find table public.user_preferences in schema cache`

**Diagnosis**: 
- Table does not exist
- Code tries to query non-existent table
- OR wrong table name in schema

**Solution - Option A (Create Table)**:
```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'light',
  language TEXT DEFAULT 'fr',
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policy
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences_self"
ON user_preferences
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

**Solution - Option B (Remove Reference)**:
If user_preferences is not needed:
- Search codebase for `user_preferences` references
- Remove/comment out those queries

---

## Problem 5: `ai_conversations` RLS May Be Incomplete

**Likely Issue**: 
RLS exists but may not cover all operations or may be too restrictive

**Recommended Policies**:
```sql
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

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
```

---

## Immediate Action Plan

### Step 1: Inspect Current Schema
Run in Supabase SQL Editor:
```sql
-- Check existing policies
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('ai_messages', 'ai_conversations', 'businesses', 'user_preferences')
ORDER BY tablename, policyname;

-- Check grants
SELECT grantee, privilege_type, table_name
FROM information_schema.role_table_grants
WHERE table_name IN ('ai_messages', 'businesses', 'ai_conversations')
ORDER BY table_name;

-- List all tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
ORDER BY table_name;
```

### Step 2: Create Migration
File: `supabase/migrations/20260530_fix_ai_rls_policies.sql`

### Step 3: Fix createConversation()
Remove dependency on getBusinessContext():

```typescript
export async function createConversation(title = 'Nouvelle analyse'): Promise<Conversation> {
  const supabase = await getSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Non authentifié.');

  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: user.id, title })
    .select('id, title, created_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/ai-assistant');
  return data as Conversation;
}
```

---

## Expected Results After Fixes

- ✅ createConversation() completes in <1 second (not 106s)
- ✅ listMessages() returns messages without "permission denied"
- ✅ getBusinessContext() completes quickly
- ✅ No "Could not find table" errors
- ✅ All RLS policies working correctly
