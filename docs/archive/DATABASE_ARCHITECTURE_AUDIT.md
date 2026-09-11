# ProfitPilot Database Architecture Audit

**Date:** 2026-05-30  
**Scope:** Complete schema analysis, ownership model inconsistencies, RLS policies  
**Status:** CRITICAL ISSUES IDENTIFIED

---

## Executive Summary

ProfitPilot has a **fragmented ownership model** with significant inconsistencies between:
1. **Old schema** (`schema.sql`) - uses `owner_id` on individual tables (single-user model)
2. **New schema** (`20260526_complete_schema_v2.sql`) - uses `business_id` (multi-tenant model)
3. **Recent migrations** - conflicting attempts to fix RLS policies

This has resulted in:
- **Duplicate ownership columns** on some tables (both `owner_id` AND `business_id`)
- **Contradictory RLS policies** (policies based on `owner_id` for `business_id` tables)
- **Database permission errors** (403/permission denied when querying certain tables)
- **AI module broken** (ai_conversations and ai_messages have wrong ownership checks)

---

## SECTION 1: TABLE INVENTORY

### auth.users (Source of Truth)
| Property | Value |
|----------|-------|
| **Purpose** | Supabase authentication users |
| **Primary Key** | `id` (UUID) |
| **Ownership** | N/A (source of truth) |
| **Foreign Keys** | None (referenced by all user-owned entities) |
| **Issues** | None |

---

### profiles
| Property | Value |
|----------|-------|
| **Schema** | New v2 schema |
| **Primary Key** | `id` (UUID, references auth.users) |
| **Ownership Columns** | None (IS the user record) |
| **Foreign Keys** | `id → auth.users(id)` |
| **Key Fields** | `full_name`, `avatar_url`, `phone`, `language`, `timezone`, `onboarded`, `metadata`, `created_at`, `updated_at` |
| **RLS Policy** | ❌ **MISSING/NOT DEFINED** in v2 schema |
| **Issues** | <ul><li>No RLS policies defined in new schema</li><li>Profile creation done via trigger on auth.users</li></ul> |

---

### businesses (TENANT ROOT)
| Property | Value |
|----------|-------|
| **Schema** | Both old and new |
| **Primary Key** | `id` (UUID) |
| **Ownership Columns** | `owner_id` (UUID, NOT NULL) → auth.users |
| **Foreign Keys** | `owner_id → auth.users(id) ON DELETE RESTRICT` |
| **Key Fields** | `name`, `sector`, `location`, `default_currency`, `exchange_rate`, `created_at`, `updated_at` |
| **RLS Policy** | ✅ **CORRECT**: `businesses: own` — `owner_id = auth.uid()` |
| **Child Tables** | All business operations (sales, products, expenses, etc.) |
| **Issues** | ✅ None — this is the correct model |

---

### business_members
| Property | Value |
|----------|-------|
| **Schema** | New v2 only |
| **Primary Key** | `id` (UUID) |
| **Ownership Columns** | `business_id` (NOT NULL), `user_id` (NOT NULL) |
| **Foreign Keys** | `business_id → businesses`, `user_id → auth.users` |
| **Key Fields** | `role` (member_role_type), `is_active`, `joined_at`, `created_at`, `updated_at`, `deleted_at` |
| **RLS Policy** | ✅ **COMPLEX BUT CORRECT**: Owner bootstrap + manage pattern |
| **Issues** | ✅ None — properly gates on business ownership |

---

### ai_conversations (CRITICAL ISSUE #1)
| Property | Value |
|----------|-------|
| **Schema** | New v2 + conflicting migrations |
| **Primary Key** | `id` (UUID) |
| **Ownership Columns** | **BOTH**: `business_id` (initially NOT NULL, made nullable in migration) + `user_id` (NOT NULL) |
| **Foreign Keys** | `business_id → businesses(id) ON DELETE CASCADE` (nullable after 20260529 migration), `user_id → auth.users(id) ON DELETE CASCADE` |
| **Key Fields** | `title`, `context` (JSONB), `is_active`, `created_at`, `updated_at`, `deleted_at` |
| **RLS Policies** | ❌ **CONFLICTING**: <ul><li>20260530_definitive: `user_id = auth.uid()` ✅</li><li>20260529_fix_rls_pilot_ai.sql tried: `business_id` filter ❌</li><li>20260530_correct_rls_business_id.sql tried: `is_business_owner(business_id)` ❌</li></ul> |
| **Issues** | <ul><li>**Dual ownership**: has BOTH user_id and business_id — confusion about intent</li><li>**business_id made nullable** — suggests conversations don't belong to a business</li><li>**RLS unstable** — multiple migrations attempting different policies</li><li>**Code expects user_id** — but migrations tried to filter on business_id</li><li>**Permission denied errors** — from conflicting policies</li></ul> |

---

### ai_messages (CRITICAL ISSUE #2)
| Property | Value |
|----------|-------|
| **Schema** | New v2 + conflicting migrations |
| **Primary Key** | `id` (UUID) |
| **Ownership Columns** | None directly; **relies on ai_conversations** via `conversation_id` |
| **Foreign Keys** | `conversation_id → ai_conversations(id) ON DELETE CASCADE` |
| **Key Fields** | `role` (text: 'user', 'assistant', 'system'), `content`, `tokens_used`, `model`, `metadata`, `created_at` |
| **RLS Policies** | ❌ **BROKEN**: <ul><li>20260530_definitive: checks `ai_conversations.user_id = auth.uid()` ✅</li><li>20260530_correct: checks `is_business_owner(conversation.business_id)` ❌ (conflicts with user_id model)</li></ul> |
| **Issues** | <ul><li>**Cannot determine access** — is it user-specific OR business-specific?</li><li>**Policy logic broken** — uses EXISTS subquery on conflicting ownership model</li><li>**Returns 403 errors** — when RLS policies don't match code expectations</li></ul> |

---

### products
| Property | Value |
|----------|-------|
| **Schema** | Both old and new |
| **Columns in schema.sql** | `owner_id` (NOT NULL) |
| **Columns in v2 schema** | `business_id` (NOT NULL), NO `owner_id` |
| **Migration actions** | 20260530_definitive adds `owner_id` to v2 schema ⚠️ |
| **Primary Key** | `id` (UUID) |
| **Foreign Keys** | Old: `owner_id → auth.users(id)` + `business_id → businesses(id)` (SET NULL); New: only `business_id` |
| **Key Fields** | `name`, `category_id`, `sku`, `barcode`, `purchase_price`, `sale_price`, `currency`, `tax_rate`, `stock_quantity`, `image_url`, `is_active`, `created_at`, `updated_at`, `deleted_at` |
| **RLS Policy** | ❌ **MIXED**: <ul><li>schema.sql: `owner_id = auth.uid()` ✅</li><li>v2 schema: `business_id` based (none initially) ❌</li><li>20260530_definitive: `owner_id = auth.uid()` (reverts to old model) ❌</li><li>20260530_correct: `is_business_owner(business_id)` ✅</li></ul> |
| **Issues** | <ul><li>**DUAL OWNERSHIP**: has/can have BOTH columns</li><li>**Nullable business_id in old**: breaks business isolation</li><li>**Conflicting migrations**: last migration wins, but may not match code</li><li>**Code expects business_id** — but latest definitive migration adds owner_id filter</li></ul> |

---

### sales
| Property | Value |
|----------|-------|
| **Schema** | Both old and new |
| **Columns in schema.sql** | `owner_id` (NOT NULL) |
| **Columns in v2 schema** | `business_id` (NOT NULL), NO `owner_id` |
| **Primary Key** | `id` (UUID) |
| **Foreign Keys** | Old: `owner_id → auth.users` + `business_id → businesses` (SET NULL); New: only `business_id` |
| **Key Fields** | `warehouse_id`, `customer_id`, `invoice_number`, `sale_date`, `status` (document_status enum), `currency`, `subtotal`, `discount`, `tax`, `total`, `paid`, `balance_due`, `payment_method`, `payment_status`, `notes` |
| **RLS Policy** | ❌ **MIXED** — same conflict as products |
| **Issues** | <ul><li>**Same dual-ownership problem** as products</li><li>**Belongs to business** not individual user</li><li>**Code filters on business_id** — expects business isolation</li></ul> |

---

### expenses
| Property | Value |
|----------|-------|
| **Schema** | Both old and new |
| **Columns in schema.sql** | `owner_id` (NOT NULL) |
| **Columns in v2 schema** | `business_id` (NOT NULL), NO `owner_id` |
| **Primary Key** | `id` (UUID) |
| **Foreign Keys** | Old: `owner_id → auth.users` + `business_id → businesses` (SET NULL); New: only `business_id` |
| **Key Fields** | `category_id`, `supplier_id`, `expense_number`, `expense_date`, `description`, `amount`, `currency`, `payment_method`, `payment_status`, `is_recurring`, `receipt_url`, `notes`, `created_at`, `updated_at` |
| **RLS Policy** | ❌ **MIXED** — same as products and sales |
| **Issues** | <ul><li>**Same dual-ownership problem**</li><li>**Business isolation required**</li></ul> |

---

### customers
| Property | Value |
|----------|-------|
| **Schema** | New v2 only |
| **Primary Key** | `id` (UUID) |
| **Ownership Columns** | `business_id` (NOT NULL) |
| **Foreign Keys** | `business_id → businesses(id) ON DELETE CASCADE`, `created_by → auth.users(id)` |
| **Key Fields** | `name`, `phone`, `email`, `whatsapp`, `instagram_handle`, `address`, `city`, `credit_limit`, `outstanding_balance`, `total_purchases`, `notes`, `tags`, `is_active`, `metadata`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **RLS Policy** | ❌ **NO POLICY DEFINED** in v2 schema |
| **Issues** | <ul><li>No RLS policies in new schema</li><li>Relies on `is_business_owner(business_id)` function but it's never created in old schema</li></ul> |

---

### suppliers
| Property | Value |
|----------|-------|
| **Schema** | Both old and new |
| **Columns in schema.sql** | `owner_id` (NOT NULL) |
| **Columns in v2 schema** | `business_id` (NOT NULL), NO `owner_id` |
| **Primary Key** | `id` (UUID) |
| **Ownership Columns** | Dual (old) / `business_id` only (new) |
| **Foreign Keys** | Same pattern as products/sales/expenses |
| **RLS Policy** | ❌ **MIXED** — same conflicts |
| **Issues** | <ul><li>**Same dual-ownership problem**</li></ul> |

---

### purchases
| Property | Value |
|----------|-------|
| **Schema** | Both old and new |
| **Columns in schema.sql** | `owner_id` (NOT NULL) |
| **Columns in v2 schema** | `business_id` (NOT NULL), NO `owner_id` |
| **Primary Key** | `id` (UUID) |
| **Foreign Keys** | Same pattern as other business-owned tables |
| **RLS Policy** | ❌ **MIXED** — same conflicts |
| **Issues** | <ul><li>**Same dual-ownership problem**</li></ul> |

---

### subscriptions
| Property | Value |
|----------|-------|
| **Schema** | Both old and new |
| **Columns in schema.sql** | `business_id` (NOT NULL) |
| **Columns in v2 schema** | `business_id` (NOT NULL), `plan_id` (NOT NULL) |
| **Primary Key** | `id` (UUID) |
| **Foreign Keys** | `business_id → businesses(id) ON DELETE CASCADE`, `plan_id → plans(id)` |
| **RLS Policy** | ❌ **OLD SCHEMA USES**: `user_id = auth.uid()` ❌ (WRONG COLUMN) |
| **Issues** | <ul><li>Old schema RLS tries to check `user_id` but column doesn't exist!</li><li>Should use `is_business_owner(business_id)` or equivalent</li></ul> |

---

## SECTION 2: OWNERSHIP MODEL ANALYSIS

### Current State (Fragmented)

```
╔═════════════════════════════════════════════════════════════════════════╗
║  SCHEMA.SQL (Old — single-user, pre-multi-tenant)                       ║
╠═════════════════════════════════════════════════════════════════════════╣
║  auth.users (source of truth)                                            ║
║      ↓                                                                    ║
║  profiles (user profile, no owner_id — IS the user)                     ║
║      ↓                                                                    ║
║  businesses (owner_id → auth.users)                                     ║
║      ├─ products (DUAL: owner_id + business_id nullable) ❌             ║
║      ├─ sales (DUAL: owner_id + business_id nullable) ❌                ║
║      ├─ expenses (DUAL: owner_id + business_id nullable) ❌             ║
║      ├─ suppliers (DUAL: owner_id + business_id nullable) ❌            ║
║      ├─ purchases (DUAL: owner_id + business_id nullable) ❌            ║
║      ├─ subscriptions (business_id only) ✅                             ║
║      └─ employees (obsolete, replaced by business_members)             ║
║                                                                           ║
║  ❌ RLS: All check owner_id = auth.uid() (single-user focus)            ║
╚═════════════════════════════════════════════════════════════════════════╝

╔═════════════════════════════════════════════════════════════════════════╗
║  20260526_COMPLETE_SCHEMA_V2.SQL (New — multi-tenant)                   ║
╠═════════════════════════════════════════════════════════════════════════╣
║  auth.users (source of truth)                                            ║
║      ↓                                                                    ║
║  profiles (no owner_id — IS the user) ✅                                ║
║      ↓                                                                    ║
║  businesses (owner_id → auth.users) ✅                                  ║
║      ├─ business_members (user → role mapping) ✅                       ║
║      ├─ products (business_id ONLY) ✅                                  ║
║      ├─ sales (business_id ONLY) ✅                                     ║
║      ├─ expenses (business_id ONLY) ✅                                  ║
║      ├─ suppliers (business_id ONLY) ✅                                 ║
║      ├─ purchases (business_id ONLY) ✅                                 ║
║      ├─ customers (business_id ONLY) ✅                                 ║
║      ├─ ai_conversations (DUAL: business_id + user_id) ⚠️              ║
║      │   └─ ai_messages (conversation_id → parent) ⚠️                   ║
║      ├─ sales_items, sales_payments, sale_returns (cascade) ✅         ║
║      ├─ purchase_items, purchase_payments, purchase_returns (cascade) ✅║
║      ├─ journal_entries, journal_entry_lines (accounting) ✅            ║
║      ├─ bank_accounts, bank_transactions (cashflow) ✅                  ║
║      └─ [... and 30+ other normalized tables ...]                       ║
║                                                                           ║
║  ✅ RLS INTENDED: All check business ownership via is_business_owner() ║
║  ❌ RLS ACTUAL: Conflicts between migrations                            ║
╚═════════════════════════════════════════════════════════════════════════╝
```

### Root Cause Analysis

| Table | Problem | Why | Impact |
|-------|---------|-----|--------|
| products, sales, expenses, suppliers, purchases | **Dual ownership columns** | Migration 20260530_definitive added `owner_id` to v2 schema to "fix" RLS, but new code expects `business_id` | Code filters on `business_id` but RLS checks `owner_id` — permission denied |
| ai_conversations | **Dual ownership (user_id + business_id)** | Schema.sql doesn't exist for ai tables, v2 created with both, migrations keep changing which to use | Conversations created with `user_id` but RLS may check `business_id` |
| ai_messages | **Access logic broken** | Depends on ai_conversations ownership but that's inconsistent | Cannot determine who can read/write messages |
| subscriptions (old schema) | **RLS checks non-existent column** | RLS policy checks `user_id = auth.uid()` but `user_id` column doesn't exist on subscriptions table | Query returns 403 even for valid business owners |
| customers | **No RLS defined** | New v2 schema defines table but schema.sql doesn't define any RLS policies | Defaults to DENY ALL (no policies = no access) |

---

## SECTION 3: RLS POLICY AUDIT

### Policies in schema.sql (OLD MODEL)

```sql
-- Pattern: ALL tables check owner_id = auth.uid()
-- This assumes SINGLE USER owns products, sales, etc.

CREATE POLICY "products: own" ON products
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "sales: own" ON sales
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "expenses: own" ON expenses
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "suppliers: own" ON suppliers
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "purchases: own" ON purchases
  FOR ALL USING (owner_id = auth.uid());

-- WRONG: subscriptions check user_id (column doesn't exist!)
CREATE POLICY "subscriptions: own" ON subscriptions
  FOR ALL USING (user_id = auth.uid());  -- ❌ subscriptions.user_id doesn't exist
```

### Policies in 20260526_complete_schema_v2.sql (NEW SCHEMA)

**PROBLEM:** v2 schema does NOT define RLS policies in the migration itself. It relies on schema.sql or subsequent migrations.

### Policies in 20260530_definitive_rls_fix.sql (ATTEMPT #1)

```sql
-- Drops all policies and replaces with simple owner_id checks
-- This REVERTS from multi-tenant (business_id) back to single-user (owner_id)

CREATE POLICY "products: own" ON products
  FOR ALL USING (owner_id = auth.uid());  -- ❌ Conflict with v2 schema (no owner_id)

CREATE POLICY "ai_conversations: own" ON ai_conversations
  FOR ALL USING (user_id = auth.uid());  -- ✅ Correct for user conversations

CREATE POLICY "ai_messages: own" ON ai_messages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid()
  ));  -- ✅ Correct access pattern
```

**Result:** This migration "fixes" products/sales/expenses to check owner_id, but conflicts with code that uses business_id.

### Policies in 20260530_correct_rls_business_id.sql (ATTEMPT #2)

```sql
-- Creates is_business_owner() function and rewrites all policies to use it
-- This REVERTS from previous migration back to multi-tenant model

CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM businesses WHERE id = bid AND owner_id = auth.uid());
$$;

CREATE POLICY "products_access" ON products
  FOR ALL USING (is_business_owner(business_id));  -- ✅ Correct multi-tenant

CREATE POLICY "ai_conversations_access" ON ai_conversations
  FOR ALL USING (is_business_owner(business_id));  -- ❌ Overrides user_id logic
```

**Result:** This migration tries to make ai_conversations work like products, but conversations should be user-specific, not business-scoped.

### Policies in 20250530_fix_ai_rls_policies.sql and 20260529_fix_ai_conversations_simple.sql

Both attempt to fix ai_conversations by checking user_id, but they're named differently and order matters.

---

## SECTION 4: CRITICAL INCONSISTENCIES (Top 10)

### CRITICAL #1: AI Conversations Ownership Model Undefined
**Severity:** CRITICAL 🔴  
**Affected Tables:** `ai_conversations`, `ai_messages`  
**Problem:**
- Schema defines both `business_id` (NOT NULL in v2) and `user_id` (NOT NULL)
- Migrations made `business_id` nullable, suggesting it's optional
- Code creates conversations with `user_id` only (app/actions/ai.ts)
- RLS migrations conflict: one checks `user_id`, another checks `business_id`
- Result: **403 permission denied** when querying ai_messages

**Expected Behavior:**
- Conversations belong to **individual users**, not businesses
- Each user can have multiple conversations per business (or none)
- `business_id` should be nullable or removed entirely

**SQL Fix:**
```sql
-- Option A: Remove business_id (user-scoped conversations)
ALTER TABLE ai_conversations DROP COLUMN business_id;

-- Option B: Keep business_id but make it truly optional
ALTER TABLE ai_conversations ALTER COLUMN business_id DROP NOT NULL;
ALTER TABLE ai_conversations ADD CONSTRAINT chk_ai_conv_has_context
  CHECK (business_id IS NOT NULL OR context IS NOT NULL);
```

**RLS Fix:**
```sql
DROP POLICY IF EXISTS "ai_conversations_access" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations: user full" ON ai_conversations;
DROP POLICY IF EXISTS "conversations: member access" ON ai_conversations;

-- Single clear policy: user owns their conversations
CREATE POLICY "ai_conversations_user_owned" ON ai_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Messages follow conversation ownership
DROP POLICY IF EXISTS "ai_messages: own" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_access" ON ai_messages;

CREATE POLICY "ai_messages_user_access" ON ai_messages
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ));
```

---

### CRITICAL #2: Products/Sales/Expenses Have Dual Ownership
**Severity:** CRITICAL 🔴  
**Affected Tables:** `products`, `sales`, `expenses`, `suppliers`, `purchases`  
**Problem:**
- schema.sql defines: `owner_id` (NOT NULL) + `business_id` (nullable)
- v2 schema defines: `business_id` (NOT NULL) only
- 20260530_definitive migration ADDS `owner_id` back to v2 schema
- Code filters on `business_id` (correct for multi-tenant)
- RLS checks `owner_id` (old single-user model)
- Result: **Records exist but permission denied** because RLS doesn't match code

**Expected Behavior:**
- All business data belongs to **business, not individual user**
- Multiple users can own/manage a business (via business_members)
- `owner_id` column should **NOT exist** on these tables
- Only `business_id` should determine access (via business_members role)

**SQL Fix:**
```sql
-- Step 1: Verify no data is lost (should be none if v2 is in use)
SELECT COUNT(*) FROM products WHERE owner_id IS NOT NULL AND business_id IS NULL;
SELECT COUNT(*) FROM sales WHERE owner_id IS NOT NULL AND business_id IS NULL;
-- If any rows exist, migrate them: UPDATE products SET business_id = ... WHERE owner_id IS NOT NULL;

-- Step 2: Remove owner_id columns (they're redundant)
ALTER TABLE products DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE sales DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE expenses DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE suppliers DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE purchases DROP COLUMN IF EXISTS owner_id CASCADE;

-- Step 3: Add NOT NULL constraints if they're nullable
ALTER TABLE products ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE sales ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE purchases ALTER COLUMN business_id SET NOT NULL;
```

**RLS Fix:**
```sql
-- For products, sales, expenses, suppliers, purchases
-- Replace all owner_id checks with business_id checks

CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = bid AND owner_id = auth.uid()
  );
$$;

-- Then for each table:
DROP POLICY IF EXISTS "products: own" ON products;
CREATE POLICY "products_user_access" ON products
  FOR ALL USING (is_business_owner(business_id));

-- Repeat for sales, expenses, suppliers, purchases
```

---

### CRITICAL #3: subscriptions Table RLS Checks Non-Existent Column
**Severity:** CRITICAL 🔴  
**Affected Table:** `subscriptions`  
**Problem:**
- schema.sql defines subscriptions with `business_id` (NOT NULL) only
- RLS policy checks `user_id = auth.uid()` ← **Column doesn't exist!**
- Result: RLS check fails because Postgres can't find the column

**Expected Behavior:**
- subscriptions belongs to a **business**
- RLS should check business ownership

**SQL Fix:**
```sql
-- subscriptions already has business_id, so just fix the RLS policy
DROP POLICY IF EXISTS "subscriptions: own" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_read" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_own_insert" ON subscriptions;

CREATE POLICY "subscriptions_access" ON subscriptions
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );
```

---

### CRITICAL #4: No RLS Policies Defined for Customers Table
**Severity:** CRITICAL 🔴  
**Affected Table:** `customers`  
**Problem:**
- v2 schema defines customers with `business_id` (NOT NULL)
- No RLS policies are defined in any migration
- Result: **Default deny — no customer records are accessible** (403 error)

**SQL Fix:**
```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_user_access" ON customers
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );
```

---

### CRITICAL #5: Multiple Migrations Trying to Rewrite the Same Policies
**Severity:** HIGH 🟠  
**Affected:** All tables  
**Problem:**
- 20260530_definitive_rls_fix.sql runs, defines policies based on owner_id
- 20260530_correct_rls_business_id.sql runs, drops all policies and redefines them based on business_id
- Later migrations may run 20250530_fix_ai_rls_policies.sql
- Last migration wins, but unclear which is active in current database
- Different environments may have different policy sets

**SQL Fix:**
```sql
-- Create a canonical, immutable RLS migration that:
-- 1. Drops ALL existing policies on ALL affected tables
-- 2. Creates SINGLE set of policies based on multi-tenant model
-- 3. Uses is_business_owner() function exclusively
-- 4. Never modifies RLS again unless schema changes

-- See SECTION 5 for complete fix
```

---

### CRITICAL #6: is_business_owner() Function May Not Exist
**Severity:** HIGH 🟠  
**Affected:** All business data tables relying on this function  
**Problem:**
- v2 schema does NOT create is_business_owner() function
- Only 20260530_correct_rls_business_id.sql creates it
- If that migration was rolled back or never run, function doesn't exist
- RLS policies referencing it will fail

**SQL Fix:**
```sql
-- Ensure function exists
CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses WHERE id = bid AND owner_id = auth.uid()
  );
$$;

-- Ensure it has the right permissions
GRANT EXECUTE ON FUNCTION is_business_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_business_owner(UUID) TO anon;
```

---

### CRITICAL #7: ai_conversations NOT NULL business_id Constraint Conflicts with User-Scoped Model
**Severity:** HIGH 🟠  
**Affected Table:** `ai_conversations`  
**Problem:**
- Schema defines `business_id` as NOT NULL
- Code creates conversations with only `user_id` (no business_id)
- Result: **Cannot insert** — violation of NOT NULL constraint

**SQL Fix:**
```sql
-- Make business_id nullable (conversations are user-scoped, not business-scoped)
ALTER TABLE ai_conversations ALTER COLUMN business_id DROP NOT NULL;
```

---

### CRITICAL #8: Payments and Billing Tables Missing Business Isolation
**Severity:** HIGH 🟠  
**Affected Tables:** `payments` (if exists), `billing_invoices`, `billing_payments`  
**Problem:**
- These are business-level data but may not have proper RLS
- Or they filter on `user_id` instead of `business_id`

**SQL Fix:**
```sql
-- Ensure these tables have business_id and proper RLS
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;

-- Define policies based on business ownership
CREATE POLICY "billing_invoices_access" ON billing_invoices
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "billing_payments_access" ON billing_payments
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );
```

---

### CRITICAL #9: cascade DELETE on products Breaks Referential Integrity
**Severity:** MEDIUM 🟡  
**Affected:** `products` ← referenced by sales_items, purchase_items, inventory_movements  
**Problem:**
- If business_id changes or is deleted, all child records cascade delete
- Lost data trail for historical sales/purchases

**SQL Fix:**
```sql
-- Already correct in v2 schema: ON DELETE CASCADE is acceptable for business deletion
-- But ensure warehouse_stock does NOT cascade
-- Ensure historical movements are preserved (reference_id pattern)

-- Verify foreign keys:
-- products ← sale_items: ON DELETE RESTRICT (good, prevents orphaning)
-- products ← purchase_items: ON DELETE RESTRICT (good)
-- products ← inventory_movements: ON DELETE RESTRICT (good)
```

---

### CRITICAL #10: Missing Foreign Key Constraints
**Severity:** MEDIUM 🟡  
**Affected:** Several tables may be missing business_id foreign keys  
**Problem:**
- Orphaned records (business_id points to deleted business)
- Data integrity violations

**SQL Fix:**
```sql
-- For all business data tables, verify FK exists:
-- All should have: business_id → businesses(id) ON DELETE CASCADE

-- Verify and add if missing:
ALTER TABLE products ADD CONSTRAINT fk_products_business
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
```

---

## SECTION 5: RECOMMENDED ARCHITECTURE

### Desired State: Pure Multi-Tenant Model

```
auth.users (source of truth)
  ↓
  profiles (user profile — no owner_id)
  
  businesses (owner_id → auth.users)  ← ROOT TENANT
    ├─ business_members (user → role mapping per business)
    │
    ├─ ai_conversations (user_id only, nullable business_id for context)
    │  └─ ai_messages (conversation_id reference)
    │
    └─ [ALL BUSINESS DATA — NOTHING ELSE]:
      ├─ products (business_id only)
      ├─ sales (business_id only)
      │  ├─ sale_items
      │  ├─ sale_payments
      │  └─ sale_returns
      ├─ purchases (business_id only)
      │  ├─ purchase_items
      │  ├─ purchase_payments
      │  └─ purchase_returns
      ├─ expenses (business_id only)
      ├─ suppliers (business_id only)
      ├─ customers (business_id only)
      ├─ warehouses (business_id only)
      ├─ inventory_movements (business_id only)
      ├─ chart_of_accounts (business_id only)
      ├─ journal_entries (business_id only)
      ├─ bank_accounts (business_id only)
      ├─ cash_registers (business_id only)
      └─ [30+ other business data tables]

RLS POLICY PATTERN:
  For tables owned by user directly (profiles):
    user_id = auth.uid()

  For tables owned by business:
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
    OR
    business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())

  For tables accessed via conversation (messages, insights):
    conversation_id points to user's conversation
```

### Migration Path (Canonical Fix)

**Migration:** `20260531_definitive_multitenant_fix.sql`

This migration:
1. Creates `is_business_owner()` and `is_business_member()` functions
2. Removes all conflicting owner_id columns from business data tables
3. Drops ALL existing policies and rewrites them consistently
4. Fixes ai_conversations ownership model
5. Enables RLS on all tables
6. Verifies no data is lost

---

## SECTION 6: FIXES REQUIRED

### FIX #1: Create Canonical RLS Policy Migration

**File:** `supabase/migrations/20260531_definitive_multitenant_fix.sql`

```sql
-- ══════════════════════════════════════════════════════════════════════════════
-- DEFINITIVE MULTI-TENANT RLS FIX
-- Replaces all previous RLS policy attempts with single consistent model
-- Date: 2026-05-31
-- ══════════════════════════════════════════════════════════════════════════════

-- ── PART 1: Helper Functions ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses WHERE id = bid AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_business_member(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = bid
      AND user_id = auth.uid()
      AND is_active = true
      AND deleted_at IS NULL
  );
$$;

-- ── PART 2: Drop ALL Conflicting Policies ─────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'products','sales','expenses','suppliers','purchases','customers',
      'ai_conversations','ai_messages','business_members','businesses',
      'subscriptions','profiles'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s" ON %I CASCADE', 
      (SELECT string_agg(policyname, '","')
       FROM pg_policies WHERE tablename = r.tablename), r.tablename);
  END LOOP;
END $$;

-- ── PART 3: Enable RLS on All Tables ──────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
-- ... repeat for all other business tables ...

-- ── PART 4: Define Consistent Policies ────────────────────────────────────────

-- Profiles: Users see only their own profile
CREATE POLICY "profiles_user_owned" ON profiles
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Businesses: Owner can see/manage
CREATE POLICY "businesses_user_owned" ON businesses
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Business Members: Owner can manage, member can see self
CREATE POLICY "business_members_owner_manage" ON business_members
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "business_members_user_see_self" ON business_members
  FOR SELECT USING (user_id = auth.uid());

-- Products: Access via business ownership or business membership
CREATE POLICY "products_access" ON products
  FOR ALL USING (
    is_business_owner(business_id) OR is_business_member(business_id)
  )
  WITH CHECK (
    is_business_owner(business_id)  -- Only owner can modify
  );

-- [Repeat pattern for sales, expenses, suppliers, purchases, customers, ...]

-- AI Conversations: User-owned (not business-scoped)
CREATE POLICY "ai_conversations_user_owned" ON ai_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- AI Messages: Access via conversation ownership
CREATE POLICY "ai_messages_via_conversation" ON ai_messages
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ));

-- ── PART 5: Remove Conflicting Columns ────────────────────────────────────────
-- Only if NOT already done

ALTER TABLE products DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE sales DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE expenses DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE suppliers DROP COLUMN IF EXISTS owner_id CASCADE;
ALTER TABLE purchases DROP COLUMN IF EXISTS owner_id CASCADE;

-- Make ai_conversations.business_id nullable
ALTER TABLE ai_conversations ALTER COLUMN business_id DROP NOT NULL;

-- ── PART 6: Verification ─────────────────────────────────────────────────────
-- Show active policies
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### FIX #2: Update Code to Use Correct Ownership Model

**Files to Update:**
- `app/actions/*.ts` — ensure all queries filter on `business_id`, not `owner_id`
- `lib/serverAuth.ts` — ensure `getBusinessContext()` returns correct business_id
- All queries using `.eq('owner_id', ...)` should become `.eq('business_id', ...)`

**Example:**
```typescript
// BEFORE (wrong):
supabase
  .from('products')
  .select('*')
  .eq('owner_id', userId);  // ❌ Won't work — owner_id doesn't exist on products

// AFTER (correct):
supabase
  .from('products')
  .select('*')
  .eq('business_id', businessId);  // ✅ Correct — will be filtered by RLS too
```

### FIX #3: Document AI Conversation Ownership

**Decision:** Conversations are **user-scoped**, not business-scoped.

This means:
- Each user can have independent conversations (not shared with team)
- `business_id` is optional and used only for business context injection
- `user_id` determines access

**Code should:**
```typescript
// Create conversation (user-specific)
const { data } = await supabase
  .from('ai_conversations')
  .insert({
    user_id: userId,  // Always the current user
    business_id: businessId,  // Optional: for context
    title: 'Product Pricing Analysis',
    context: { /* business data */ }
  });

// Query conversations (user-specific)
const { data: conversations } = await supabase
  .from('ai_conversations')
  .select('*')
  .eq('user_id', userId);  // Always filter by user, not business
```

---

## SECTION 7: IMPLEMENTATION CHECKLIST

- [ ] **Phase 1: Deploy Canonical Migration**
  - [ ] Create `20260531_definitive_multitenant_fix.sql`
  - [ ] Test in staging environment
  - [ ] Deploy to production
  - [ ] Verify no 403 errors on product/sales/expense queries

- [ ] **Phase 2: Remove Conflicting Migrations**
  - [ ] Identify which of these are active:
    - [ ] 20260530_definitive_rls_fix.sql
    - [ ] 20260530_correct_rls_business_id.sql
    - [ ] 20250530_fix_ai_rls_policies.sql
    - [ ] 20260529_fix_ai_conversations_simple.sql
  - [ ] Decide: keep only the last applied, or rewrite the canonical one to supersede all
  - [ ] Document which policies are "source of truth"

- [ ] **Phase 3: Update TypeScript Code**
  - [ ] Grep for `.eq('owner_id',` and replace with `.eq('business_id',`
  - [ ] Grep for `owner_id` in all action files
  - [ ] Update tests to use business_id filtering
  - [ ] Run integration tests against staging

- [ ] **Phase 4: Verify Data Integrity**
  - [ ] Check for orphaned records (owner_id set but business_id null)
  - [ ] Check for duplicate ownership (both owner_id and business_id present)
  - [ ] Audit ai_conversations to ensure user_id is always set

- [ ] **Phase 5: Deploy and Monitor**
  - [ ] Deploy code changes
  - [ ] Monitor error logs for 403 permission denied errors
  - [ ] Test all pages that query products, sales, expenses, customers
  - [ ] Test AI conversation creation and messaging

---

## SECTION 8: QUICK REFERENCE — WHAT OWNS WHAT

| Entity | Owner | RLS Check | Issues |
|--------|-------|-----------|--------|
| auth.users | Source of truth | N/A | ✅ None |
| profiles | User (id = auth.users.id) | `id = auth.uid()` | ❌ No RLS policies |
| businesses | User (owner_id) | `owner_id = auth.uid()` | ✅ Correct |
| business_members | Business + User | `business_id owner OR user_id = auth.uid()` | ✅ Correct |
| products | Business (business_id) | `is_business_owner(business_id)` | ❌ Has conflicting owner_id column |
| sales | Business (business_id) | `is_business_owner(business_id)` | ❌ Has conflicting owner_id column |
| expenses | Business (business_id) | `is_business_owner(business_id)` | ❌ Has conflicting owner_id column |
| suppliers | Business (business_id) | `is_business_owner(business_id)` | ❌ Has conflicting owner_id column |
| purchases | Business (business_id) | `is_business_owner(business_id)` | ❌ Has conflicting owner_id column |
| customers | Business (business_id) | `is_business_owner(business_id)` | ❌ No RLS policies defined |
| subscriptions | Business (business_id) | ❌ Tries to check non-existent user_id | ❌ CRITICAL: wrong column |
| ai_conversations | User (user_id) | `user_id = auth.uid()` | ⚠️ Has conflicting business_id (NOT NULL) |
| ai_messages | User (via conversation) | `conversation.user_id = auth.uid()` | ❌ RLS checks wrong ownership |

---

## CONCLUSION

ProfitPilot's database has evolved from a single-user application (`schema.sql`) to a multi-tenant SaaS platform (`v2 schema`), but the migration was incomplete:

1. **Old schema still exists** with single-user assumptions
2. **New schema correctly defines multi-tenant structure** but wasn't fully deployed
3. **Migrations conflict** — multiple attempts to fix RLS resulted in contradictory policies
4. **Code and schema misaligned** — app expects business_id but RLS checks owner_id

**The fix:** Deploy a canonical, immutable RLS migration that:
- Uses `business_id` as the primary ownership column
- Removes conflicting `owner_id` columns
- Defines consistent policies using helper functions
- Documents ownership model clearly

**Impact of not fixing:**
- 403 permission denied errors when querying products, sales, expenses
- Unable to create or access AI conversations/messages
- Customers table inaccessible
- Multi-user business access broken (business_members not respected)
- Future features (team collaboration, roles) cannot work

**Estimated effort:** 2-4 hours (migration + testing + deployment)

---

**Generated:** 2026-05-30  
**Audit Type:** Database Architecture  
**Status:** ACTIONABLE — Ready for implementation
