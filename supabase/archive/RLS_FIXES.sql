-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS POLICY FIXES FOR PROFITPILOT
-- Copy and execute ALL of this SQL in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ENSURE is_business_owner FUNCTION EXISTS
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. FIX BUSINESS TABLE RLS
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. FIX CHILD TABLE RLS (products, sales, customers, etc.)
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. FIX AI CONVERSATION RLS (user-scoped)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_conversations: own" ON ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_access" ON ai_conversations;

CREATE POLICY "ai_conversations_access" ON ai_conversations
FOR ALL USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. FIX AI MESSAGES RLS (via conversation ownership)
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! All RLS policies have been updated.
-- ═══════════════════════════════════════════════════════════════════════════════
