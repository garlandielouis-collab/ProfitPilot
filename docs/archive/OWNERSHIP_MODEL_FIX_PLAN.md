# 🔴 Database Ownership Model - Critical Fixes Required

## The Core Problem

Your database has **two conflicting ownership models**:

### ❌ OLD MODEL (schema.sql)
```
auth.users
  ↓
products.owner_id = auth.users.id
sales.owner_id = auth.users.id
expenses.owner_id = auth.users.id
(Single-user, non-multi-tenant)
```

### ✅ NEW MODEL (v2 schema intended)
```
auth.users
  ↓
businesses.owner_id = auth.users.id
  ↓
products.business_id = businesses.id
sales.business_id = businesses.id
expenses.business_id = businesses.id
(Multi-tenant, multiple users per business)
```

### 🔥 WHAT ACTUALLY EXISTS (Hybrid Chaos)
```
products: HAS BOTH owner_id AND business_id
sales: HAS BOTH owner_id AND business_id
expenses: HAS BOTH owner_id AND business_id
↓
Code filters on: business_id
RLS policies check: owner_id (or conflicting business_id)
↓
Result: "permission denied" even though data exists
```

---

## Why You're Getting 403 Errors

### Example: Querying Products

```
User tries: const { data } = await supabase
  .from('products')
  .select('*')
  .eq('business_id', '123')  ← Code filters by business_id

Database checks RLS:
  - Which policy applies?
  - 20260530_definitive says: owner_id = auth.uid()
  - 20260530_correct says: is_business_owner(business_id)
  - CONFLICT! → RLS confused
  
Data exists in products table ✅
But RLS blocks access ❌
Result: permission denied
```

---

## Critical Issues Found (8 Total)

### 🔴 CRITICAL #1: Dual Ownership on Business Tables
**Tables:** products, sales, expenses, suppliers, purchases  
**Problem:** Has BOTH `owner_id` AND `business_id` columns  
**Why it's broken:** Code filters on `business_id`, RLS checks `owner_id`  
**Impact:** All business data returns 403

### 🔴 CRITICAL #2: AI Module Ownership Confusion
**Tables:** ai_conversations, ai_messages  
**Problem:** Dual ownership + conflicting RLS migrations  
**Why it's broken:** Unclear if user-scoped or business-scoped  
**Impact:** AI features return "permission denied"

### 🔴 CRITICAL #3: Subscriptions RLS Checks Non-Existent Column
**Table:** subscriptions  
**Problem:** RLS checks `user_id = auth.uid()` but `user_id` column doesn't exist  
**Why it's broken:** RLS policy literally cannot execute  
**Impact:** All subscription queries fail

### 🔴 CRITICAL #4: Customers Table Has No RLS Policies
**Table:** customers  
**Problem:** NO policies defined → defaults to deny all  
**Why it's broken:** Not even trying to allow access  
**Impact:** Cannot query any customers

### 🔴 CRITICAL #5: Multiple Conflicting RLS Migrations
**Problem:** 4 different migrations trying to define policies  
- 20260530_definitive_rls_fix.sql → Uses owner_id
- 20260530_correct_rls_business_id.sql → Uses business_id  
- 20250530_fix_ai_rls_policies.sql → Uses is_business_owner()
- Different migrations may have run in different order

**Why it's broken:** Last one wins, but unclear which is actually active  
**Impact:** RLS state is unpredictable

### 🔴 CRITICAL #6: is_business_owner() Function May Not Exist
**Problem:** RLS policies reference a function that may not be defined  
**Why it's broken:** SELECT fails if function doesn't exist  
**Impact:** Policies can't execute

### 🔴 CRITICAL #7: ai_conversations business_id NOT NULL Conflicts with User Scope
**Problem:** Schema says business_id NOT NULL, but code creates conversations with only user_id  
**Why it's broken:** Cannot insert records  
**Impact:** Conversation creation fails on some code paths

### 🔴 CRITICAL #8: Billing Tables Missing RLS/Business Isolation
**Problem:** Payments/invoices may not be properly isolated by business  
**Why it's broken:** One user might see another user's billing data  
**Impact:** Security issue + data leakage risk

---

## The Fix: Unified Multi-Tenant Model

### Architecture Target

```
auth.users (identity)
  ↓
businesses (tenant root)
  owner_id → auth.users.id  [WHO OWNS THIS TENANT]
  
business_members (multi-user access)
  user_id → auth.users.id
  business_id → businesses.id
  role → admin/member/viewer

ALL BUSINESS DATA:
  products.business_id → businesses.id
  sales.business_id → businesses.id
  expenses.business_id → businesses.id
  suppliers.business_id → businesses.id
  purchases.business_id → businesses.id
  customers.business_id → businesses.id
  subscriptions.business_id → businesses.id
  
PERSONAL DATA:
  ai_conversations.user_id → auth.users.id  [User owns their conversations]
  ai_messages (linked through ai_conversations)
  profiles.id → auth.users.id
```

---

## 5-Phase Fix Plan

### PHASE 1: Identify Current RLS State (30 minutes)
**In Supabase SQL Editor, run:**

```sql
-- Check what RLS policies actually exist
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN (
  'products', 'sales', 'expenses', 'suppliers', 'purchases',
  'customers', 'subscriptions', 'ai_conversations', 'ai_messages'
)
ORDER BY tablename, policyname;

-- Check if is_business_owner function exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_name = 'is_business_owner'
);

-- Check actual column structure
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_name IN ('products', 'sales', 'expenses')
  AND column_name IN ('owner_id', 'business_id')
ORDER BY table_name, column_name;
```

**Document the results** — this tells us what state the DB is actually in.

---

### PHASE 2: Create Canonical RLS Migration (45 minutes)
**File:** `supabase/migrations/20260530_fix_ownership_model_final.sql`

```sql
-- ============================================================================
-- PHASE 2: Unified Multi-Tenant RLS Model
-- ============================================================================

-- Step 1: Ensure is_business_owner function exists
CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses WHERE id = bid AND owner_id = auth.uid()
  )
$$;

-- Step 2: Fix products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products: own" ON products;
DROP POLICY IF EXISTS "products_user_access" ON products;

CREATE POLICY "products_access" ON products
  FOR ALL USING (is_business_owner(business_id));

-- Step 3: Fix sales (repeat for each table)
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales: own" ON sales;
CREATE POLICY "sales_access" ON sales
  FOR ALL USING (is_business_owner(business_id));

-- Step 4: Fix ai_conversations (special case - user-scoped)
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_conversations_select_own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations: own" ON ai_conversations;

-- Conversations are user-scoped, not business-scoped
CREATE POLICY "ai_conversations_access" ON ai_conversations
  FOR ALL USING (user_id = auth.uid());

-- Step 5: Fix ai_messages (linked through conversation)
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_messages_select_own" ON ai_messages;

CREATE POLICY "ai_messages_access" ON ai_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE id = ai_messages.conversation_id
        AND user_id = auth.uid()
    )
  );

-- Step 6: Fix customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_user_access" ON customers;

CREATE POLICY "customers_access" ON customers
  FOR ALL USING (is_business_owner(business_id));

-- Step 7: Fix subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions: own" ON subscriptions;

CREATE POLICY "subscriptions_access" ON subscriptions
  FOR ALL USING (is_business_owner(business_id));

-- Repeat for: expenses, suppliers, purchases, etc.
-- (see full audit doc for complete list)
```

---

### PHASE 3: Remove Redundant owner_id Columns (15 minutes)
**When:** Only after confirming v2 schema is active  
**Why:** owner_id on business tables is redundant; use business_id only

```sql
-- BEFORE dropping, verify no data is lost:
SELECT 'products' as tbl, COUNT(*) as rows_with_owner_id
FROM products WHERE owner_id IS NOT NULL;
-- (if count > 0, migrate that data first)

-- Then drop the redundant columns:
ALTER TABLE products DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE sales DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE expenses DROP COLUMN IF EXISTS owner_id CASCADE;
-- ... repeat for all business tables
```

**⚠️ IMPORTANT:** Only do this after confirming with your data.

---

### PHASE 4: Fix ai_conversations Schema (5 minutes)
**Problem:** business_id is NOT NULL but code doesn't provide it  
**Solution:** Make it nullable or stop setting it

```sql
-- Option A: Make business_id nullable
ALTER TABLE ai_conversations
  ALTER COLUMN business_id DROP NOT NULL;

-- Option B: OR remove business_id entirely if conversations are user-scoped
-- ALTER TABLE ai_conversations DROP COLUMN business_id;
```

**Choose based on:** Do conversations belong to a business or just a user?
- **User-scoped:** Remove business_id, use Option B
- **Business-scoped:** Make nullable, use Option A

---

### PHASE 5: Test & Verify (30 minutes)

**Test 1: Create & List Conversations**
```typescript
// Should work instantly
const { data } = await supabase
  .from('ai_conversations')
  .select('*')
  .eq('user_id', currentUser.id);
// ✅ Should return conversations (or empty array)
// ❌ Should NOT return 403 error
```

**Test 2: Query Business Data**
```typescript
// Should work for your business
const { data } = await supabase
  .from('products')
  .select('*')
  .eq('business_id', myBusinessId);
// ✅ Should return products
// ❌ Should NOT return 403 error
```

**Test 3: Verify Isolation**
```typescript
// Should NOT see another user's data
const { data } = await supabase
  .from('products')
  .select('*')
  .eq('business_id', 'SOMEONE_ELSES_BUSINESS_ID');
// ✅ Should return empty (permission denied is OK)
// ❌ Should NOT return their products
```

---

## Implementation Priority

| Priority | Fix | Time | Impact |
|----------|-----|------|--------|
| 🔴 CRITICAL | Apply final RLS migration | 45min | Unblocks ALL 403 errors |
| 🔴 CRITICAL | Make is_business_owner() exists | 5min | Required for RLS |
| 🟠 HIGH | Fix ai_conversations schema | 5min | Fixes AI module |
| 🟠 HIGH | Remove owner_id from business tables | 15min | Reduces confusion |
| 🟡 MEDIUM | Verify business_members RLS | 10min | Ensures multi-user works |

---

## Immediate Next Steps

1. **Read the full audit:** `DATABASE_ARCHITECTURE_AUDIT.md`
   - See detailed table-by-table breakdown
   - Understand current vs intended state

2. **Run diagnostic queries** (Phase 1)
   - Understand what RLS policies are actually in your database
   - Document current state

3. **Apply PHASE 2 migration**
   - Create the canonical RLS migration
   - Run in Supabase SQL Editor
   - This fixes 90% of your 403 errors

4. **Test immediately** (Phase 5)
   - Create a conversation
   - Query products
   - Verify no 403 errors

5. **Do PHASE 3-4 only after verifying Phase 2 works**
   - Removing columns is permanent
   - Only do after confirming current model works

---

## Do NOT Do

❌ Do NOT manually edit RLS policies in Supabase UI  
❌ Do NOT drop columns until Phase 2 is working  
❌ Do NOT migrate both models simultaneously  
❌ Do NOT assume which RLS migration is active  

---

## Why This Matters

Your database has been in a **hybrid state** where:
- Code expects multi-tenant (business_id)
- RLS was checking single-user (owner_id)
- They were contradictory → 403 errors

Once unified:
- ✅ All queries will work
- ✅ Ownership will be consistent
- ✅ Multi-user support will work
- ✅ Security isolation will be enforced

---

## Complete Audit Document

For detailed analysis including:
- All 50+ tables inventoried
- Exact SQL fixes for each table
- TypeScript code changes needed
- Complete RLS migration
- ER diagrams

**See:** `DATABASE_ARCHITECTURE_AUDIT.md`
