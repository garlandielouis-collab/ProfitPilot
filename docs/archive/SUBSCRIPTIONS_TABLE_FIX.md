# 🔧 Fix: subscriptions Table Missing business_id

## The Problem

```
Table subscriptions:
  ❌ Missing business_id column
  ❌ RLS policy checks non-existent user_id
  ❌ Result: All subscription queries blocked (403)
```

## The Solution

Add `business_id` column, migrate data, and create proper RLS policies.

---

## Step-by-Step Execution (15 minutes)

### STEP 1: Check Current State (2 minutes)

**In Supabase SQL Editor, run:**

```sql
-- Check subscriptions table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'subscriptions'
ORDER BY ordinal_position;
```

**Expected output:**
- Should show: `id`, `user_id` (?), `plan_id`, `status`, etc.
- **Missing:** `business_id` (this is the problem)

**Also check:**
```sql
-- See RLS policies on subscriptions
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'subscriptions';
```

---

### STEP 2: Add business_id Column (2 minutes)

**Run this SQL:**

```sql
-- Add the missing business_id column
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

-- Verify it was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'subscriptions' AND column_name = 'business_id';
-- Should show: business_id | uuid | YES (nullable for now)
```

---

### STEP 3: Migrate Existing Data (3 minutes)

**If you have existing subscriptions, link them to their business:**

```sql
-- Check if you have any subscriptions
SELECT COUNT(*) as subscription_count FROM subscriptions;

-- If count > 0, migrate them:
UPDATE subscriptions s
SET business_id = (
  SELECT b.id
  FROM businesses b
  WHERE b.owner_id = (
    SELECT owner_id FROM subscriptions s2
    WHERE s2.id = s.id
    LIMIT 1
  )
  LIMIT 1
)
WHERE business_id IS NULL;

-- Verify migration worked
SELECT COUNT(*) as null_count FROM subscriptions WHERE business_id IS NULL;
-- Should show 0 if all migrated successfully
```

**If migration shows error or high null_count:**

```sql
-- If you only have one business, use this simpler approach:
UPDATE subscriptions
SET business_id = (SELECT id FROM businesses LIMIT 1)
WHERE business_id IS NULL;

-- Verify again
SELECT COUNT(*) as null_count FROM subscriptions WHERE business_id IS NULL;
```

---

### STEP 4: Make business_id Required (1 minute)

**Run this SQL:**

```sql
-- Make the column NOT NULL (required)
ALTER TABLE subscriptions
ALTER COLUMN business_id SET NOT NULL;

-- Verify
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'subscriptions' AND column_name = 'business_id';
-- Should show: business_id | NO (not nullable)
```

---

### STEP 5: Drop Old RLS Policies (1 minute)

**Remove broken policies that check non-existent user_id:**

```sql
-- Drop old policies that don't work
DROP POLICY IF EXISTS "subscriptions: own" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_read" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_insert" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_user_access" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_access" ON subscriptions;

-- Verify they're gone
SELECT policyname FROM pg_policies WHERE tablename = 'subscriptions';
-- Should show empty result
```

---

### STEP 6: Create Correct RLS Policy (2 minutes)

**Now create the policy that will actually work:**

```sql
-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policy: User can access subscriptions of their businesses
CREATE POLICY "subscriptions_business_access" ON subscriptions
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

-- Verify the policy was created
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'subscriptions';
-- Should show: subscriptions_business_access | ALL (or similar)
```

---

### STEP 7: Verify Everything Works (2 minutes)

**Run these verification queries:**

```sql
-- 1. Check table structure is correct
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'subscriptions'
  AND column_name IN ('id', 'business_id')
ORDER BY ordinal_position;

-- Expected:
-- id | uuid | NO
-- business_id | uuid | NO

-- 2. Check RLS policy exists
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'subscriptions';

-- Expected:
-- subscriptions_business_access | ALL (or similar)

-- 3. Check data integrity
SELECT
  COUNT(*) as total_subscriptions,
  COUNT(business_id) as with_business_id,
  COUNT(*) - COUNT(business_id) as missing_business_id
FROM subscriptions;

-- Expected:
-- All same count (no NULL business_id)
```

---

## Testing the Fix

### Test 1: Query Subscriptions in Your App

```typescript
// In your TypeScript code:
const { data, error } = await supabase
  .from('subscriptions')
  .select('*')
  .eq('business_id', myBusinessId);

if (error) {
  console.error('Error:', error.message);
  // Should NOT see "permission denied"
}

console.log('Subscriptions:', data);
// Should return array of subscriptions (or empty array)
```

**Expected:**
- ✅ `data` contains subscriptions (or empty array)
- ❌ NO error about permission denied
- ❌ NO error about missing column

### Test 2: In Supabase SQL Editor

```sql
-- Simulate a query as the authenticated user
-- (This won't actually show you data since you're not authenticated,
--  but it shows the RLS is syntactically correct)

SELECT * FROM subscriptions;
-- Should not error about invalid columns or syntax
```

---

## If Something Goes Wrong

### Error: "column "business_id" does not exist"
**Solution:** You're in STEP 2 but didn't run it, or it failed silently.
```sql
-- Check if it really exists:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'subscriptions';

-- If not there, run STEP 2 again
```

### Error: "violates not-null constraint"
**Solution:** Some subscriptions don't have `business_id` yet.
```sql
-- Check which ones are missing:
SELECT id, business_id FROM subscriptions WHERE business_id IS NULL;

-- Update them manually:
UPDATE subscriptions
SET business_id = (SELECT id FROM businesses LIMIT 1)
WHERE business_id IS NULL;
```

### Error: "permission denied for table subscriptions"
**Solution:** RLS policy isn't created yet, or you're not logged in.
```sql
-- In Supabase SQL Editor (you're using the admin API key, so RLS doesn't apply)
-- This query should work even if RLS blocks regular users
SELECT COUNT(*) FROM subscriptions;

-- Make sure you ran STEP 6
SELECT policyname FROM pg_policies WHERE tablename = 'subscriptions';
```

### In your app, still getting 403 error:
**Solution:** RLS policy exists but your user doesn't own a business, or the business_id doesn't match.
```sql
-- Check: Does your user own a business?
SELECT id, owner_id FROM businesses WHERE owner_id = '[YOUR_USER_ID]';

-- Check: Do your subscriptions have the right business_id?
SELECT id, business_id FROM subscriptions;

-- The business_id in subscriptions should match the business you own
```

---

## Complete Execution Checklist

- [ ] STEP 1: Verified current state (business_id missing)
- [ ] STEP 2: Added business_id column
- [ ] STEP 3: Migrated data from owner_id to business_id
- [ ] STEP 4: Made business_id NOT NULL
- [ ] STEP 5: Dropped old broken RLS policies
- [ ] STEP 6: Created correct RLS policy
- [ ] STEP 7: Ran verification queries (all passed)
- [ ] TEST 1: Queried subscriptions in app (no 403 error)
- [ ] TEST 2: Ran SQL query in editor (no errors)

---

## Quick Reference: What Was Changed

| What | Before | After |
|------|--------|-------|
| business_id column | ❌ Missing | ✅ Added |
| business_id nullable | N/A | ❌ NOT NULL |
| RLS policy | ❌ Broken (checks user_id) | ✅ Works (checks business_id) |
| Data isolation | ❌ Broken | ✅ Per-business |
| Subscription queries | ❌ 403 error | ✅ Works |

---

## Summary

This fix makes the `subscriptions` table consistent with your multi-tenant model:
- ✅ Owns a business (via business_id)
- ✅ RLS checks are valid
- ✅ Queries will work
- ✅ Data is properly isolated

**Time to fix: ~15 minutes**  
**Impact: Subscriptions fully functional** 🎉

---

## Next Steps

1. **Execute STEPS 1-7** in Supabase SQL Editor
2. **Test in your app**
3. **If all passes:** Move to next critical issue
4. **If something fails:** Refer to "If Something Goes Wrong" section

Go! 🚀
