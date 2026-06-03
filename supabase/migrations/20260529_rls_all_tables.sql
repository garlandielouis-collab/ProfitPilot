-- ============================================================
-- ProfitPilot — RLS policies for ALL owner_id-based tables
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── Helper: enable RLS on all tables ─────────────────────────
ALTER TABLE IF EXISTS clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchases            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_credits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS businesses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_preferences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions        ENABLE ROW LEVEL SECURITY;

-- ── clients ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients: own"    ON clients;
CREATE POLICY "clients: own" ON clients
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── products ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "products: own"   ON products;
CREATE POLICY "products: own" ON products
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── sales ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sales: own"      ON sales;
CREATE POLICY "sales: own" ON sales
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── expenses ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "expenses: own"   ON expenses;
CREATE POLICY "expenses: own" ON expenses
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── purchases ────────────────────────────────────────────────
DROP POLICY IF EXISTS "purchases: own"  ON purchases;
CREATE POLICY "purchases: own" ON purchases
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── suppliers ────────────────────────────────────────────────
DROP POLICY IF EXISTS "suppliers: own"  ON suppliers;
CREATE POLICY "suppliers: own" ON suppliers
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── client_credits ───────────────────────────────────────────
DROP POLICY IF EXISTS "client_credits: own" ON client_credits;
CREATE POLICY "client_credits: own" ON client_credits
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── businesses ───────────────────────────────────────────────
DROP POLICY IF EXISTS "businesses: own" ON businesses;
DROP POLICY IF EXISTS "businesses: owner full access" ON businesses;
DROP POLICY IF EXISTS "businesses: owner manages" ON businesses;
DROP POLICY IF EXISTS "businesses: member access" ON businesses;
CREATE POLICY "businesses: own" ON businesses
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── user_preferences ─────────────────────────────────────────
DROP POLICY IF EXISTS "user_preferences: own" ON user_preferences;
CREATE POLICY "user_preferences: own" ON user_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── customer_transactions ────────────────────────────────────
DROP POLICY IF EXISTS "customer_transactions: own" ON customer_transactions;
CREATE POLICY "customer_transactions: own" ON customer_transactions
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── payments (SaaS billing) ──────────────────────────────────
DROP POLICY IF EXISTS "payments_own_read"   ON payments;
DROP POLICY IF EXISTS "payments_own_insert" ON payments;
DROP POLICY IF EXISTS "payments: own"       ON payments;
CREATE POLICY "payments: own" ON payments
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── subscriptions ────────────────────────────────────────────
DROP POLICY IF EXISTS "subscriptions_own_read" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions: own"     ON subscriptions;
CREATE POLICY "subscriptions: own" ON subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
