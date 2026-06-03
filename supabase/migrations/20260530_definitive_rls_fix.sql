-- ================================================================
-- DEFINITIVE RLS FIX — ProfitPilot
-- Drops every conflicting v2-schema policy and replaces with
-- simple owner_id / user_id = auth.uid() policies.
--
-- Run once in: Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- ── products ─────────────────────────────────────────────────────
-- Add missing columns first
ALTER TABLE products ADD COLUMN IF NOT EXISTS owner_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point  INTEGER NOT NULL DEFAULT 0;

-- Drop ALL existing product policies (v2 schema + previous attempts)
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'products' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON products', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "products: own" ON products
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ── sales ─────────────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'sales' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON sales', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "sales: own" ON sales
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- ── expenses ─────────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'expenses' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON expenses', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "expenses: own" ON expenses
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- ── clients ───────────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'clients' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON clients', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "clients: own" ON clients
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ── ai_conversations ──────────────────────────────────────────────
-- Make business_id nullable (remove NOT NULL constraint)
ALTER TABLE ai_conversations ALTER COLUMN business_id DROP NOT NULL;

DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'ai_conversations' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ai_conversations', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "ai_conversations: own" ON ai_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- ── ai_messages ───────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'ai_messages' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ai_messages', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "ai_messages: own" ON ai_messages
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid()
  ));
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

-- ── purchases ────────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'purchases' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON purchases', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "purchases: own" ON purchases
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- ── suppliers ────────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'suppliers' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON suppliers', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "suppliers: own" ON suppliers
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- ── client_credits ────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'client_credits' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON client_credits', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "client_credits: own" ON client_credits
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE client_credits ENABLE ROW LEVEL SECURITY;

-- ── businesses ───────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'businesses' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON businesses', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "businesses: own" ON businesses
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- ── business_members ─────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'business_members' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON business_members', r.policyname);
  END LOOP;
END $$;

-- Bootstrap: owner can insert themselves, then manage all
CREATE POLICY "business_members: owner bootstrap" ON business_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND owner_id = auth.uid())
  );
CREATE POLICY "business_members: owner manage" ON business_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND owner_id = auth.uid())
  );
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

-- ── Verify (optional — shows remaining policies) ──────────────────
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('products','sales','expenses','clients',
                    'ai_conversations','ai_messages','purchases',
                    'suppliers','client_credits','businesses','business_members')
ORDER BY tablename, policyname;
