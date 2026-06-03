# 🚨 IMMEDIATE ACTIONS - Today's Fixes

## The Situation

Your database has **conflicting ownership models** causing 403 errors on:
- ❌ products (permission denied)
- ❌ ai_messages (permission denied)  
- ❌ businesses (permission denied)
- ❌ customers (no RLS policies at all)

**Root cause:** RLS policies check `owner_id` while code uses `business_id`

**Fix:** Apply a unified RLS migration that uses `business_id` for all business tables and `user_id` for user-scoped tables.

---

## TODAY'S TODO (90 minutes)

### ✅ STEP 1: Diagnose Current State (10 minutes)

**Open Supabase SQL Editor** and run these queries:

```sql
-- Query 1: What RLS policies exist?
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('products', 'sales', 'expenses', 'ai_conversations', 'ai_messages')
ORDER BY tablename, policyname;

-- Query 2: Does is_business_owner function exist?
SELECT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_name = 'is_business_owner'
);

-- Query 3: What columns does products actually have?
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products'
ORDER BY ordinal_position;
```

**Document the output** - screenshot it or copy-paste into a notepad.

**Key things to confirm:**
- [ ] is_business_owner function exists (1 or 0?)
- [ ] products has business_id column (yes/no)
- [ ] products has owner_id column (yes/no)
- [ ] Current policies use owner_id or business_id?

---

### ✅ STEP 2: Apply RLS Migration (20 minutes)

**Copy this entire SQL** into Supabase SQL Editor and run it:

```sql
-- ============================================================================
-- UNIFIED MULTI-TENANT RLS POLICIES
-- ============================================================================

-- PREREQUISITE: Ensure is_business_owner function exists
CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses WHERE id = bid AND owner_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION is_business_owner(UUID) TO authenticated, anon;

-- ============================================================================
-- BUSINESS DATA TABLES (use business_id for RLS)
-- ============================================================================

-- PRODUCTS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products: own" ON products;
DROP POLICY IF EXISTS "products_user_access" ON products;
CREATE POLICY "products_access" ON products
  FOR ALL USING (is_business_owner(business_id));

-- SALES
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales: own" ON sales;
CREATE POLICY "sales_access" ON sales
  FOR ALL USING (is_business_owner(business_id));

-- EXPENSES
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses: own" ON expenses;
CREATE POLICY "expenses_access" ON expenses
  FOR ALL USING (is_business_owner(business_id));

-- SUPPLIERS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers: own" ON suppliers;
CREATE POLICY "suppliers_access" ON suppliers
  FOR ALL USING (is_business_owner(business_id));

-- PURCHASES
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchases: own" ON purchases;
CREATE POLICY "purchases_access" ON purchases
  FOR ALL USING (is_business_owner(business_id));

-- CUSTOMERS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_user_access" ON customers;
CREATE POLICY "customers_access" ON customers
  FOR ALL USING (is_business_owner(business_id));

-- SUBSCRIPTIONS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions: own" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_read" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_insert" ON subscriptions;
CREATE POLICY "subscriptions_access" ON subscriptions
  FOR ALL USING (is_business_owner(business_id));

-- ============================================================================
-- USER-SCOPED TABLES (use user_id for RLS)
-- ============================================================================

-- AI CONVERSATIONS (user-scoped, not business-scoped)
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_conversations_select_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_insert_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_update_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_delete_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations: own" ON ai_conversations;
CREATE POLICY "ai_conversations_access" ON ai_conversations
  FOR ALL USING (user_id = auth.uid());

-- AI MESSAGES (linked through conversation)
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_messages_select_own" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_insert_own" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_update_own" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_delete_own" ON ai_messages;
CREATE POLICY "ai_messages_access" ON ai_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE ai_conversations.id = ai_messages.conversation_id
        AND ai_conversations.user_id = auth.uid()
    )
  );

-- ============================================================================
-- VERIFY: Check all policies are in place
-- ============================================================================
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN (
  'products', 'sales', 'expenses', 'suppliers', 'purchases',
  'customers', 'subscriptions', 'ai_conversations', 'ai_messages'
)
ORDER BY tablename, policyname;
```

**After running:**
- [ ] No errors in the SQL output
- [ ] Final SELECT shows policies for all tables
- [ ] At least 1 policy per table

---

### ✅ STEP 3: Fix ai_conversations Schema (5 minutes)

**The problem:** Schema says `business_id NOT NULL` but conversations are user-scoped.

**Run this SQL:**

```sql
-- Make business_id nullable since conversations are per-user, not per-business
ALTER TABLE ai_conversations ALTER COLUMN business_id DROP NOT NULL;

-- Verify the change
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'ai_conversations'
  AND column_name = 'business_id';
-- Should show: is_nullable = YES
```

---

### ✅ STEP 4: Test Immediately (15 minutes)

**Open your app and test:**

**Test A: Create a conversation**
```
1. Login
2. Go to /ai-assistant
3. Click "New Conversation"
4. Wait < 2 seconds
5. Should appear in list

⏱️ Expected time: < 1 second
✅ Success: Conversation created
❌ Failure: "permission denied" error
```

**Test B: List products** 
```
If you have a /products page:
1. Login
2. Go to /products
3. Should see products immediately

✅ Success: See products with prices, descriptions
❌ Failure: Empty list or 403 error
```

**Test C: View messages in conversation**
```
1. At /ai-assistant
2. Click on a conversation
3. Should see previous messages

✅ Success: Messages appear
❌ Failure: "permission denied" error
```

**Test D: Check DevTools**
```
1. F12 → Network tab
2. Create conversation or view products
3. Look for requests with `403` status

✅ Success: No 403 errors
❌ Failure: See 403 status codes
```

---

## If Tests PASS ✅

Congratulations! The RLS is now unified.

**Next steps** (can do later):
1. Remove redundant `owner_id` columns from business tables
2. Update documentation
3. Clean up old migrations

---

## If Tests FAIL ❌

**Most likely issues:**

### Issue 1: Still getting "permission denied" 
```
→ RLS policies didn't apply correctly
→ Check: Did the SQL run without errors?
→ Run the verification SELECT again - see policies exist?
→ If not: Run the SQL migration again
```

### Issue 2: "Could not find column business_id"
```
→ is_business_owner() function doesn't exist
→ Check: Does query 2 from STEP 1 show 1 or 0?
→ If 0: Run just the CREATE FUNCTION part:
```

```sql
CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses WHERE id = bid AND owner_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION is_business_owner(UUID) TO authenticated, anon;
```

### Issue 3: Conversations still returning 403
```
→ ai_conversations schema still has NOT NULL business_id
→ Check: Did you run ALTER TABLE in STEP 3?
→ If still failing: Verify ai_conversations actually has business_id column
```

---

## Timeline

| Step | Task | Time | Cumulative |
|------|------|------|-----------|
| 1 | Diagnose state | 10 min | 10 min |
| 2 | Apply RLS migration | 20 min | 30 min |
| 3 | Fix ai_conversations schema | 5 min | 35 min |
| 4 | Test & verify | 15 min | 50 min |
| **TOTAL** | **All fixes** | **~50 minutes** | **50 min** |

---

## Success Criteria

After STEP 2-3:

- [ ] Can login
- [ ] Can create conversation in <2 seconds
- [ ] Can view conversation messages
- [ ] No "permission denied" errors anywhere
- [ ] Dashboard loads normally
- [ ] Products visible (if exists)
- [ ] No 403 errors in Network tab

**When all boxes are checked → You're done! 🎉**

---

## Important Notes

⚠️ **You must restart the app after Supabase migrations**
- The app may need to refresh connections to see new policies
- Close the browser tab and re-open if needed

⚠️ **Do the steps in order**
- Don't skip STEP 1 (know your current state)
- STEP 2 must complete before STEP 4 (no testing until RLS is fixed)

⚠️ **Screenshots help**
- If something fails, screenshot the SQL output and error message
- It will help diagnose what happened

---

## Still Stuck?

If tests fail and you can't figure it out:

1. Share the output from STEP 1 queries
2. Share any error messages from STEP 2
3. Share what the tests show (does it hang? 403? empty results?)

Then I can debug the specific issue in your database.

---

## GO! 🚀

Start with STEP 1 - run those diagnostic queries first and tell me what you see!
