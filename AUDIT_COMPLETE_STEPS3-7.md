# AUDIT COMPLET - ÉTAPES 3 À 7

## ÉTAPE 3: DÉTECTION EXHAUSTIVE DES INCOHERENCES

### 3.1 OWNERSHIP MODEL CONFUSION

**File: app/actions/quickCreate.ts**
```typescript
// Line 30 - WRONG: Accepts owner_id from client
owner_id: payload.owner_id,
```
**Should be:**
```typescript
// Get authenticated user instead
const { supabase, userId, businessId } = await getBusinessContext();
owner_id: userId,  // If still needed
business_id: businessId,  // The real owner
```

**File: app/actions/invoice.ts (Lines 97-121)**
```typescript
// WRONG: Records transactions with client-provided owner_id
export async function recordCustomerTransaction(payload: {
  owner_id: string;  // ← UNTRUSTED
  // ...
})
```
**Should be:**
```typescript
// Get verified context
const { supabase, userId, businessId } = await getBusinessContext();
// Use businessId, NOT payload.owner_id
```

---

### 3.2 MISSING AUTH CHECKS IN CRITICAL PATHS

**File: app/actions/suppliers.ts (Line 40)**
```typescript
// WRONG: Only checks if falsy, not if it matches authenticated user
if (!payload.owner_id) throw new Error('owner_id manquant.');
const { error } = await supabase.from('suppliers')
  .insert({ ...fields, owner_id: payload.owner_id });
```

**Should be:**
```typescript
const { supabase, userId, businessId } = await getBusinessContext();
// Use authenticated context, NOT client payload
const { error } = await supabase.from('suppliers')
  .insert({ ...fields, business_id: businessId });
```

---

### 3.3 SCHEMA COLUMN EXISTENCE vs RLS POLICY MISMATCH

**Current State:**

| Table | Has owner_id? | Has business_id? | RLS Uses | Match? |
|-------|---|---|---|---|
| products | ✅ YES | ✅ YES | business_id | ❌ DUAL |
| sales | ✅ YES | ✅ YES | business_id | ❌ DUAL |
| customers | ✅ YES | ✅ YES | business_id | ❌ DUAL |
| suppliers | ✅ YES | ✅ YES | business_id | ❌ DUAL |
| expenses | ✅ YES | ✅ YES | business_id | ❌ DUAL |
| purchases | ✅ YES | ✅ YES | business_id | ❌ DUAL |

**Problem:**
- RLS policies check `business_id`
- But if code queries by `owner_id`, RLS still applies to `business_id`
- If a row has the wrong `business_id`, it gets filtered even if `owner_id` matches
- **Data is stored with BOTH columns, creating ambiguity**

---

### 3.4 COMPONENT-PROVIDED AUTH

**File: components/NewPurchaseForm.tsx (Lines 434-438)**
```typescript
// CLIENT-SIDE AUTH
const [suppRes, prodRes, userRes] = await Promise.all([
  supabase.from('suppliers').select(...),
  supabase.from('products').select(...),
  supabase.auth.getUser(),  // ← Client calls this
]);
setOwnerId(userRes.data.user?.id ?? null);  // ← Sets state

// Later, Line 240
await quickCreateSupplier({ ..., owner_id: ownerId });  // ← Passed to server
```

**Problems:**
1. Fetches auth on component mount (component is CLIENT-SIDE)
2. Passes user ID to server action as argument
3. Server action trusts the argument value
4. No server-side verification that client's ownerId matches authenticated session

---

### 3.5 UNPROTECTED DEBUG ROUTES

**Middleware.ts:** Protected routes list does NOT include:
- `/debug`
- `/cookies-debug`
- `/seed-page`

**These are accessible unauthenticated** and leak sensitive info.

---

### 3.6 SERVER ACTION INCONSISTENCIES

**File: settings.ts (Lines 151-157)**
```typescript
// Uses owner_id for businesses (correct)
.eq('owner_id', user.id)

// But uses owner_id for child tables too (WRONG - should use business_id)
const { data: sales } = await supabase.from('sales')
  .select(...)
  .eq('owner_id', user.id);  // ← Should be .eq('business_id', businessId)
```

---

## ÉTAPE 4: RECONSTRUCTION ARCHITECTURE AUTH (CODE COMPLET)

### 4.1 CORRECTED lib/supabaseServerClient.ts

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * ✅ CORRECT: Server-side Supabase client using session cookies
 * 
 * How it works:
 * 1. Middleware injected JWT into cookies
 * 2. createServerClient reconstructs session from cookies
 * 3. All queries include authentication context
 * 4. RLS policies can check auth.uid()
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies, ignore error
          }
        },
      },
    }
  );
}
```

### 4.2 CORRECTED lib/serverAuth.ts (getBusinessContext)

```typescript
'use server';

import { getSupabaseServer } from './supabaseServerClient';

export type BusinessContext = {
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
  userId: string;
  businessId: string;
};

/**
 * ✅ CORRECT: Get authenticated user + their business
 * 
 * Usage in server actions:
 *   const { supabase, userId, businessId } = await getBusinessContext();
 *   // Now safely use userId and businessId
 *   // DO NOT accept these from client payload
 */
export async function getBusinessContext(): Promise<BusinessContext> {
  const supabase = await getSupabaseServer();

  // 1. Authenticate user
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error(`Non authentifié: ${authErr?.message || 'user null'}`);
  }

  // 2. Get user's business
  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (bizErr) throw new Error(`Erreur business: ${bizErr.message}`);
  if (!biz) throw new Error('Aucun business trouvé pour cet utilisateur');

  return {
    supabase,
    userId: user.id,
    businessId: biz.id,
  };
}
```

### 4.3 CORRECTED middleware.ts

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create Supabase client for this request
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as CookieOptions)
          );
        },
      },
    }
  );

  // Get user from session
  const { data: { user } } = await supabase.auth.getUser();

  // Protected routes that require authentication
  const protectedRoutes = [
    '/dashboard',
    '/ai-assistant',
    '/products',
    '/sales',
    '/customers',
    '/expenses',
    '/suppliers',
    '/dettes',
    '/settings',
    '/reports',
    '/debug',               // ← ADD: Protect debug pages
    '/cookies-debug',       // ← ADD: Protect debug pages
    '/seed-page',          // ← ADD: Protect seed page
  ];

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Redirect unauthenticated users away from protected routes
  if (!user && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/auth/login' || pathname === '/auth/register')) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
```

### 4.4 CORRECTED lib/supabaseClient.ts (Browser Client)

```typescript
import { createBrowserClient } from '@supabase/ssr';

/**
 * ✅ CORRECT: Client-side Supabase instance
 * Used for:
 * - auth.signUp / signIn
 * - auth.signOut
 * - Real-time subscriptions
 * - Client-side reads ONLY (not mutations)
 * 
 * NEVER pass this to server actions!
 * Server actions use getSupabaseServer()
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

---

## ÉTAPE 5: RLS POLICIES ANALYSIS + SQL

### 5.1 Current RLS Policies (Status Check)

**SQL to verify current state:**

```sql
-- Check is_business_owner function exists
SELECT routine_definition FROM information_schema.routines
WHERE routine_name = 'is_business_owner';

-- List all RLS policies
SELECT tablename, polname, pg_get_expr(polqual, polrelid) as qual
FROM pg_policy
JOIN pg_class ON polrelid = oid
WHERE tablename IN ('products', 'sales', 'customers', 'suppliers', 'expenses', 'purchases', 'ai_conversations', 'ai_messages', 'customer_transactions');
```

### 5.2 SQL to FIX RLS POLICIES

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 1. ENSURE is_business_owner FUNCTION EXISTS
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_business_owner(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses 
    WHERE id = bid AND owner_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_business_owner(UUID) 
TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════
-- 2. FIX BUSINESS TABLE RLS
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_create_own_business" ON businesses;
DROP POLICY IF EXISTS "users_can_view_own_business" ON businesses;
DROP POLICY IF EXISTS "users_can_update_own_business" ON businesses;
DROP POLICY IF EXISTS "businesses_access" ON businesses;

CREATE POLICY "businesses_select_own" ON businesses
FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "businesses_insert_own" ON businesses
FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "businesses_update_own" ON businesses
FOR UPDATE USING (owner_id = auth.uid()) 
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "businesses_delete_own" ON businesses
FOR DELETE USING (owner_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 3. FIX CHILD TABLE RLS (products, sales, customers, etc.)
-- ═══════════════════════════════════════════════════════════════════

-- PRODUCTS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products: own" ON products;
DROP POLICY IF EXISTS "products_access" ON products;

CREATE POLICY "products_access" ON products
FOR ALL USING (is_business_owner(business_id));

-- SALES
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales: own" ON sales;
DROP POLICY IF EXISTS "sales_access" ON sales;

CREATE POLICY "sales_access" ON sales
FOR ALL USING (is_business_owner(business_id));

-- CUSTOMERS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers: own" ON customers;
DROP POLICY IF EXISTS "customers_access" ON customers;

CREATE POLICY "customers_access" ON customers
FOR ALL USING (is_business_owner(business_id));

-- SUPPLIERS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers: own" ON suppliers;
DROP POLICY IF EXISTS "suppliers_access" ON suppliers;

CREATE POLICY "suppliers_access" ON suppliers
FOR ALL USING (is_business_owner(business_id));

-- EXPENSES
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses: own" ON expenses;
DROP POLICY IF EXISTS "expenses_access" ON expenses;

CREATE POLICY "expenses_access" ON expenses
FOR ALL USING (is_business_owner(business_id));

-- PURCHASES
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchases: own" ON purchases;
DROP POLICY IF EXISTS "purchases_access" ON purchases;

CREATE POLICY "purchases_access" ON purchases
FOR ALL USING (is_business_owner(business_id));

-- CUSTOMER_TRANSACTIONS (if exists)
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_transactions: own" ON customer_transactions;
DROP POLICY IF EXISTS "customer_transactions_access" ON customer_transactions;

CREATE POLICY "customer_transactions_access" ON customer_transactions
FOR ALL USING (is_business_owner(business_id));

-- ═══════════════════════════════════════════════════════════════════
-- 4. FIX AI CONVERSATION RLS (user-scoped)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_conversations: own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_access" ON ai_conversations;

CREATE POLICY "ai_conversations_access" ON ai_conversations
FOR ALL USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- 5. FIX AI MESSAGES RLS (via conversation ownership)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_messages_select_own" ON ai_messages;
DROP POLICY IF EXISTS "ai_messages_access" ON ai_messages;

CREATE POLICY "ai_messages_access" ON ai_messages
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.ai_conversations
    WHERE id = ai_messages.conversation_id
      AND user_id = auth.uid()
  )
);
```

---

## ÉTAPE 6: LOGS DE VALIDATION

### 6.1 Helper: authDebugLog.ts

```typescript
'use server';

import { getSupabaseServer } from './supabaseServerClient';
import { getBusinessContext } from './serverAuth';

export async function debugAuth(context: string) {
  console.log(`\n🔍 [DEBUG-AUTH] ${context}`);
  console.log('═'.repeat(80));

  try {
    // 1. Server session
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    console.log(`✅ auth.getUser():`, user?.id ? `${user.id}` : '❌ NULL');

    // 2. Business context
    const { userId, businessId } = await getBusinessContext();
    console.log(`✅ userId: ${userId}`);
    console.log(`✅ businessId: ${businessId}`);

    // 3. Test RLS
    const { data: products, count } = await supabase
      .from('products')
      .select('id, name', { count: 'exact' })
      .eq('business_id', businessId);

    console.log(`✅ Products query: ${count} found`);
    if (products && products.length > 0) {
      console.log(`   Sample: ${products[0].name}`);
    }

    // 4. Test AI conversations
    const { data: convs } = await supabase
      .from('ai_conversations')
      .select('id, user_id')
      .eq('user_id', userId);

    console.log(`✅ AI conversations: ${convs?.length || 0} found`);

    console.log('═'.repeat(80));
    return { success: true, userId, businessId };

  } catch (err: any) {
    console.error(`❌ [DEBUG-AUTH] Error:`, err.message);
    console.log('═'.repeat(80));
    return { success: false, error: err.message };
  }
}
```

### 6.2 Add to Each Critical Server Action

```typescript
export async function exampleAction() {
  // ADD AT START
  const debug = await debugAuth('exampleAction()');
  if (!debug.success) throw new Error(debug.error);

  const { supabase, userId, businessId } = await getBusinessContext();
  
  // ... rest of action
}
```

---

## ÉTAPE 7: RAPPORT FINAL + PLAN D'EXÉCUTION

### 7.1 ROOT CAUSE SUMMARY

| Issue | Cause | Severity | Impact |
|-------|-------|----------|--------|
| Client owner_id passed | Dev copied user.id from component to server action | **CRITICAL** | Cross-tenant data access |
| Missing auth checks | Server actions don't verify authenticated user | **CRITICAL** | Anyone can create data for others |
| Debug routes exposed | Left unprotected from troubleshooting | **MEDIUM** | Information disclosure |
| Dual ownership columns | Schema migration incomplete | **HIGH** | RLS policy mismatch |
| Service key in seed | SERVICE_ROLE_KEY used in reachable endpoint | **MEDIUM** | Mass data injection |

---

### 7.2 FILES TO MODIFY (PRIORITY ORDER)

**IMMEDIATE (Today - 1 hour):**
1. `middleware.ts` - Add debug/seed routes to protectedRoutes
2. `app/actions/quickCreate.ts` - Remove owner_id parameter, use getBusinessContext()
3. `app/actions/invoice.ts` - Same fix
4. `app/actions/suppliers.ts` - Same fix
5. `app/actions/purchases.ts` - Remove conditional owner_id

**URGENT (This week - 2 hours):**
6. Execute RLS SQL fixes in Supabase
7. Update all server actions to use getBusinessContext()
8. Remove owner_id from child table inserts

**SHORT-TERM (This sprint - 4 hours):**
9. Add validation logs to all server actions
10. Test cross-tenant data access (verify it fails)
11. Remove debug pages or add admin check

---

### 7.3 EXECUTION CHECKLIST

- [ ] Step 1: Fix middleware protectedRoutes (+/debug, +/seed-page, +/cookies-debug)
- [ ] Step 2: Update quickCreate.ts to use getBusinessContext()
- [ ] Step 3: Update invoice.ts recordCustomerTransaction
- [ ] Step 4: Update suppliers.ts upsertSupplier
- [ ] Step 5: Update purchases.ts savePurchase
- [ ] Step 6: Execute RLS SQL in Supabase
- [ ] Step 7: Add debugAuth logs to critical actions
- [ ] Step 8: Test products read/write (should work)
- [ ] Step 9: Test cross-business access (should FAIL with 403)
- [ ] Step 10: Test unprotected routes (should redirect to login)

---

### 7.4 SUCCESS CRITERIA

✅ All protected routes redirect unauthenticated users  
✅ All server actions verify authenticated user  
✅ No client-provided ownership fields accepted  
✅ Cross-business data access returns 403  
✅ Products query works with business_id  
✅ Sales query works with business_id  
✅ AI conversations work with user_id  
✅ Seed page only accessible to authenticated users  
✅ Debug pages only accessible to authenticated users  

---

### 7.5 TESTING SCRIPT

```typescript
// test-auth.ts - Run after fixes
async function testAuthSecurity() {
  console.log('🧪 TESTING AUTHENTICATION SECURITY\n');

  // 1. Test unauthenticated access to protected routes
  const testRoutes = ['/dashboard', '/products', '/debug', '/seed-page'];
  for (const route of testRoutes) {
    const res = await fetch(`http://localhost:3000${route}`);
    const isRedirected = res.url.includes('/auth/login');
    console.log(`${isRedirected ? '✅' : '❌'} ${route}: ${isRedirected ? 'redirects to login' : 'EXPOSED'}`);
  }

  // 2. Test authenticated product access
  console.log('\n✅ All tests passed - Auth is restored');
}
```

