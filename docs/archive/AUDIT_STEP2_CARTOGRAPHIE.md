# ÉTAPE 2: CARTOGRAPHIE COMPLÈTE SCHEMA + OWNERSHIP

## ARCHITECTURE IDEALE (Multi-Tenant Propre)

```
┌─────────────────────────────┐
│ auth.users (Supabase Auth)  │
│ id (UUID)                   │
│ email                       │
│ created_at                  │
└────────────┬────────────────┘
             │ auth.uid()
             │ (JWT context)
             ▼
┌─────────────────────────────┐
│ public.businesses           │
│ id (PK)                     │
│ owner_id (FK → auth.users)  │◄─── Tenant Root
│ name                        │
│ created_at                  │
└────────────┬────────────────┘
             │ business_id (FK)
             │ (RLS policy checks: is_business_owner(business_id))
             ▼
┌─────────────────────────────────────────────────────────┐
│ BUSINESS TABLES                                         │
│ (ALL must have: business_id FK, NO owner_id)           │
├─────────────────────────────────────────────────────────┤
│ products      │ id (PK), business_id (FK), ...          │
│ sales         │ id (PK), business_id (FK), ...          │
│ customers     │ id (PK), business_id (FK), ...          │
│ expenses      │ id (PK), business_id (FK), ...          │
│ suppliers     │ id (PK), business_id (FK), ...          │
│ purchases     │ id (PK), business_id (FK), ...          │
│ ai_messages   │ id (PK), conversation_id (FK), ...      │
└─────────────────────────────────────────────────────────┘
                          │
                          │ conversation_id (FK)
                          ▼
                   ┌──────────────────────┐
                   │ ai_conversations     │
                   │ id (PK)              │
                   │ user_id (FK → auth)  │◄─── User-Scoped
                   │ business_id (FK) OK  │     (can be NULL)
                   └──────────────────────┘
```

---

## TABLEAU: OWNERSHIP CORRECT PAR TABLE

| Table | PK | FK to users | owner_id | business_id | RLS Policy | Notes |
|-------|----|----|----|----|-----------|-------|
| **businesses** | id | owner_id ✅ | ✅ MUST HAVE | ❌ NO | `owner_id = auth.uid()` | Tenant root |
| **products** | id | ❌ NO | ❌ REMOVE | ✅ MUST HAVE | `is_business_owner(business_id)` | Child of business |
| **sales** | id | ❌ NO | ❌ REMOVE | ✅ MUST HAVE | `is_business_owner(business_id)` | Child of business |
| **customers** | id | ❌ NO | ❌ REMOVE | ✅ MUST HAVE | `is_business_owner(business_id)` | Child of business |
| **expenses** | id | ❌ NO | ❌ REMOVE | ✅ MUST HAVE | `is_business_owner(business_id)` | Child of business |
| **suppliers** | id | ❌ NO | ❌ REMOVE | ✅ MUST HAVE | `is_business_owner(business_id)` | Child of business |
| **purchases** | id | ❌ NO | ❌ REMOVE | ✅ MUST HAVE | `is_business_owner(business_id)` | Child of business |
| **ai_conversations** | id | user_id ✅ | ❌ NO | ✅ CAN HAVE | `user_id = auth.uid()` | User-scoped |
| **ai_messages** | id | via conversation_id | ❌ NO | ❌ NO | `EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid())` | Via conversation |
| **customer_transactions** | id | ❌ NO | ❌ REMOVE | ✅ MUST HAVE | `is_business_owner(business_id)` | Child of business |

---

## INCOHERENCES DETECTEES

### ❌ INCORRECTIONS TROUVEES

1. **products.owner_id EXISTS** (should be removed)
   - Should only have: business_id
   - Impact: RLS policies check business_id, but table has owner_id → mismatch

2. **sales.owner_id EXISTS** (should be removed)
   - RLS checks business_id, but table has owner_id

3. **customers.owner_id EXISTS** (should be removed)
   - RLS checks business_id, but table has owner_id

4. **suppliers.owner_id EXISTS** (should be removed)
   - RLS checks business_id, but table has owner_id

5. **purchases.owner_id SOMETIMES SET** (should never be set)
   - Code conditionally includes it (purchases.ts:52)
   - Creates unpredictable schema

6. **expenses.owner_id EXISTS** (should be removed)
   - RLS checks business_id, but table has owner_id

7. **customer_transactions.owner_id EXISTS** (should be removed)
   - Schema inconsistency

---

## OWNERSHIP MODEL FLOW

### ✅ CORRECT PATTERN (What should happen)

```typescript
// 1. Authenticated User Makes Request
const { data: { user } } = await supabase.auth.getUser();
// user.id = e6e500fe-fb0a-4654-8e8a-30895760c902

// 2. Server Retrieves Their Business
const { data: business } = await supabase
  .from('businesses')
  .select('id')
  .eq('owner_id', user.id)
  .single();
// business.id = d07c88a8-9bad-452d-b5d5-6bf06fb58fa4

// 3. Server Uses Business ID for Child Tables
const { data: products } = await supabase
  .from('products')
  .select('*')
  .eq('business_id', business.id);  // ← Only use business_id, NOT user.id
```

### ❌ WRONG PATTERN (What's happening now)

```typescript
// WRONG: Client provides owner_id
const { data: products } = await supabase
  .from('products')
  .select('*')
  .eq('owner_id', clientProvidedOwnerId);  // ← DANGER: trusting client

// WRONG: Server uses owner_id instead of business_id
const { data: sales } = await supabase
  .from('sales')
  .select('*')
  .eq('owner_id', user.id);  // ← Should be business_id, not user.id
```

---

## CRITICAL SCHEMA DECISIONS

### Decision 1: Remove owner_id from Child Tables
**Status:** ❌ NOT DONE YET
**Tables Affected:** products, sales, customers, suppliers, purchases, expenses, customer_transactions
**Rationale:** Multi-tenant architecture requires single ownership model (business_id), not dual (owner_id + business_id)

### Decision 2: Use is_business_owner(business_id) Function
**Status:** ✅ FUNCTION EXISTS
**Location:** PostgreSQL public.is_business_owner(uuid)
**Rationale:** Centralizes ownership check logic, prevents RLS bypass

### Decision 3: Standardize on business_id for All Child Tables
**Status:** ⚠️ PARTIALLY DONE
**Issue:** Some code still uses owner_id
**Solution:** Replace ALL owner_id references in child tables with business_id

---

## VALIDATION CHECKLIST

- [ ] businesses table has owner_id ✅ CORRECT
- [ ] ALL child tables use ONLY business_id (not owner_id)
- [ ] RLS policies all use is_business_owner(business_id)
- [ ] No server action accepts owner_id from client payload
- [ ] All server actions use getBusinessContext() for ownership
- [ ] ai_conversations.user_id correctly set to auth.uid()
- [ ] ai_messages check ownership via conversation

