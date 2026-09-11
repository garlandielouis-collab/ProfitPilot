# 🗺️ COMPLETE DATABASE FIX ROADMAP

## The Full Problem

Your database has **conflicting ownership models** causing 403 errors across multiple tables. This roadmap shows the **correct order** to fix everything.

---

## Architecture Target

```
auth.users (identity)
  ↓
businesses.owner_id (tenant root)
  ↓
All business data uses business_id
All user data uses user_id
```

---

## Issues & Fixes (in priority order)

### 🔴 CRITICAL FIX #1: Add is_business_owner Function

**Issue:** RLS policies reference a function that may not exist.

**File:** None (inline SQL in Supabase)

**Time:** 2 minutes

**Execute:**
```sql
CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses WHERE id = bid AND owner_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION is_business_owner(UUID) TO authenticated, anon;
```

**Verify:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_name = 'is_business_owner'
);
-- Should show: TRUE
```

---

### 🔴 CRITICAL FIX #2: Fix subscriptions Table

**Issue:** Missing `business_id` column, RLS checks non-existent `user_id`.

**File:** `SUBSCRIPTIONS_TABLE_FIX.md` (full guide)

**Time:** 15 minutes

**Execute the migration:**
```sql
-- See SUBSCRIPTIONS_TABLE_FIX.md for detailed steps
```

**What it does:**
- Adds missing `business_id` column
- Migrates data from `owner_id` to `business_id`
- Creates correct RLS policy
- Makes `business_id` NOT NULL

**Verify:** All subscriptions queries work

---

### 🔴 CRITICAL FIX #3: Fix Business Tables RLS Policies

**Issue:** RLS policies check wrong columns or don't exist.

**Files:** 
- `IMMEDIATE_ACTIONS.md` (STEP 2)
- `DATABASE_ARCHITECTURE_AUDIT.md` (detailed SQL)

**Time:** 20 minutes

**Tables affected:**
- products
- sales
- expenses
- suppliers
- purchases
- customers
- ai_conversations
- ai_messages

**Execute:**
```sql
-- See IMMEDIATE_ACTIONS.md STEP 2 for complete SQL
```

**What it does:**
- Drops conflicting RLS policies
- Creates unified policies using `is_business_owner(business_id)`
- Fixes ai_conversations to use `user_id` only (user-scoped)
- Fixes ai_messages to check via ai_conversations ownership

**Verify:**
- Products queries work
- Sales queries work
- Conversations create successfully
- Messages accessible without 403

---

### 🟠 HIGH FIX #4: Fix ai_conversations Schema

**Issue:** `business_id` is NOT NULL but code doesn't provide it.

**File:** `IMMEDIATE_ACTIONS.md` (STEP 3)

**Time:** 5 minutes

**Execute:**
```sql
-- Make business_id nullable (conversations are user-scoped)
ALTER TABLE ai_conversations 
ALTER COLUMN business_id DROP NOT NULL;

-- Verify
SELECT is_nullable
FROM information_schema.columns
WHERE table_name = 'ai_conversations' 
  AND column_name = 'business_id';
-- Should show: YES
```

**What it does:**
- Allows conversations to be created with just `user_id`
- Fixes insert failures when creating conversations

**Verify:** Can create conversations without providing business_id

---

### 🟠 HIGH FIX #5: Remove Redundant owner_id Columns

**Issue:** Business tables have both `owner_id` and `business_id` (dual ownership).

**File:** `OWNERSHIP_MODEL_FIX_PLAN.md` (PHASE 3)

**Time:** 15 minutes

**⚠️ WARNING:** Do this AFTER verifying FIXES #1-4 work!

**Tables to clean:**
- products
- sales
- expenses
- suppliers
- purchases

**Execute:**
```sql
-- First, verify no data is lost
SELECT COUNT(*) FROM products WHERE owner_id IS NOT NULL AND business_id IS NULL;
-- Should show: 0

-- Then drop the redundant column
ALTER TABLE products DROP COLUMN IF EXISTS owner_id CASCADE;
-- Repeat for: sales, expenses, suppliers, purchases
```

**What it does:**
- Removes confusion of dual ownership
- Simplifies schema
- Forces all code through `business_id` path

**Verify:** Business data queries still work (same as before)

---

## Execution Timeline

```
┌──────────────────────────────────────────────────────┐
│ PHASE 1: PREPARE (5 min)                             │
│ - Diagnose current RLS state                         │
│ - Run verification queries                           │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│ PHASE 2: CRITICAL FIXES (42 min)                     │
│ - FIX #1: Add is_business_owner() (2 min)            │
│ - FIX #2: Fix subscriptions table (15 min)           │
│ - FIX #3: Fix RLS policies for all tables (20 min)   │
│ - FIX #4: Fix ai_conversations schema (5 min)        │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│ PHASE 3: TEST & VERIFY (15 min)                      │
│ - Create conversation                                │
│ - Query products                                     │
│ - List messages                                      │
│ - Verify all 403 errors gone                         │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│ PHASE 4: CLEANUP (optional, 15 min)                  │
│ - FIX #5: Remove owner_id columns                    │
│ - Update documentation                               │
│ - Archive old migrations                              │
└──────────────────────────────────────────────────────┘

TOTAL: ~77 minutes for complete fix
       ~57 minutes for core fixes (phases 1-3)
```

---

## Before & After

### BEFORE (Broken)
```
Code:        uses business_id
RLS:         checks owner_id
Subscriptions: missing business_id
AI module:   confused about ownership
Result:      403 errors everywhere
```

### AFTER (Fixed)
```
Code:        uses business_id
RLS:         checks is_business_owner(business_id)
Subscriptions: has business_id, RLS works
AI module:   clear user_id ownership
Result:      ✅ All queries work
```

---

## Which Document to Read

| Situation | Document | Time |
|-----------|----------|------|
| Want quick checklist | `IMMEDIATE_ACTIONS.md` | 5 min |
| Need detailed steps for subscriptions | `SUBSCRIPTIONS_TABLE_FIX.md` | 15 min |
| Need the RLS migration SQL | See STEP 2 in IMMEDIATE_ACTIONS.md | - |
| Want full architectural analysis | `DATABASE_ARCHITECTURE_AUDIT.md` | 20 min |
| Want the complete plan | `OWNERSHIP_MODEL_FIX_PLAN.md` | 10 min |
| Want this roadmap | This file | 5 min |

---

## Success Criteria

After completing PHASE 2 & 3, you should have:

- [ ] No "permission denied" errors
- [ ] Subscriptions queries work
- [ ] Can create conversations (<1 second)
- [ ] Can list messages without 403
- [ ] Products/sales/expenses queries work
- [ ] Dashboard loads normally
- [ ] No 403 errors in network tab

---

## Critical SQL Snippets (Copy-Paste Ready)

### Create is_business_owner Function
```sql
CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses WHERE id = bid AND owner_id = auth.uid()
  )
$$;
GRANT EXECUTE ON FUNCTION is_business_owner(UUID) TO authenticated, anon;
```

### Fix subscriptions RLS
```sql
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions: own" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_read" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_insert" ON subscriptions;

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
```

### Fix Business Tables (products example)
```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products: own" ON products;
CREATE POLICY "products_access" ON products
  FOR ALL USING (is_business_owner(business_id));
```

### Fix AI Tables
```sql
-- ai_conversations (user-scoped)
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_conversations: own" ON ai_conversations;
CREATE POLICY "ai_conversations_access" ON ai_conversations
  FOR ALL USING (user_id = auth.uid());

-- ai_messages (linked through conversation)
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
```

---

## Getting Started

1. **Read**: This roadmap (you're reading it!)
2. **Execute**: Phases 1-3 using `IMMEDIATE_ACTIONS.md`
3. **Verify**: All tests in `IMMEDIATE_ACTIONS.md` STEP 4
4. **Optional**: Phase 4 (cleanup) after core fixes verified

**Estimated total time: 1 hour** ⏱️

---

## Key Insight

Your database isn't broken — it's **inconsistent**. These fixes align everything to a single, coherent ownership model:

1. Users own businesses
2. Businesses own business data (products, sales, expenses, etc.)
3. Users own personal data (conversations, messages)
4. RLS enforces these relationships

Once aligned, everything works! 🚀
