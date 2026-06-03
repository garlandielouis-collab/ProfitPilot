-- ================================================================
-- CORRECT RLS — Multi-tenant schema avec business_id
-- RÈGLE ABSOLUE:
--   • businesses     → owner_id = auth.uid()
--   • tables enfants → is_business_owner(business_id)
--
-- Supprimer TOUTES les politiques incorrectes (owner_id sur enfants)
-- et les remplacer par les correctes.
-- Run: Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- ── 1. Créer la fonction is_business_owner si elle n'existe pas ───
CREATE OR REPLACE FUNCTION is_business_owner(bid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = bid
      AND owner_id = auth.uid()
  );
$$;

-- ── 2. businesses (SEULE table avec owner_id) ─────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'businesses' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON businesses', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "businesses_owner" ON businesses
  FOR ALL
  USING     (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- ── 3. Macro : drop toutes les policies d'une table enfant ────────
-- (évite l'erreur owner_id does not exist sur tables enfants)

-- products
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='products'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON products', r.policyname); END LOOP; END $$;
CREATE POLICY "products_access" ON products
  FOR ALL USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- sales
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='sales'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON sales', r.policyname); END LOOP; END $$;
CREATE POLICY "sales_access" ON sales
  FOR ALL USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- expenses
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='expenses'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON expenses', r.policyname); END LOOP; END $$;
CREATE POLICY "expenses_access" ON expenses
  FOR ALL USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- customers (table clients est nommée customers)
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='customers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON customers', r.policyname); END LOOP; END $$;
CREATE POLICY "customers_access" ON customers
  FOR ALL USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- purchases
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='purchases'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON purchases', r.policyname); END LOOP; END $$;
CREATE POLICY "purchases_access" ON purchases
  FOR ALL USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- suppliers
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='suppliers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON suppliers', r.policyname); END LOOP; END $$;
CREATE POLICY "suppliers_access" ON suppliers
  FOR ALL USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- customer_credits (remplace client_credits)
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='customer_credits'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON customer_credits', r.policyname); END LOOP; END $$;
CREATE POLICY "customer_credits_access" ON customer_credits
  FOR ALL USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;

-- ai_conversations
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='ai_conversations'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON ai_conversations', r.policyname); END LOOP; END $$;
CREATE POLICY "ai_conversations_access" ON ai_conversations
  FOR ALL USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- ai_messages (pas de business_id direct — via conversation)
DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE tablename='ai_messages'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON ai_messages', r.policyname); END LOOP; END $$;
CREATE POLICY "ai_messages_access" ON ai_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id
        AND is_business_owner(c.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id
        AND is_business_owner(c.business_id)
    )
  );
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

-- ── 4. Vérification finale ────────────────────────────────────────
SELECT tablename, policyname, qual
FROM pg_policies
WHERE tablename IN (
  'businesses','products','sales','expenses',
  'customers','purchases','suppliers','customer_credits',
  'ai_conversations','ai_messages'
)
ORDER BY tablename, policyname;
