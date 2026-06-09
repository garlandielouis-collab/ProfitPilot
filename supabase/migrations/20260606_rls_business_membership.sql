-- ============================================================================
-- PROFITPILOT — RLS POLICIES V3 (business_membership-based)
-- ============================================================================
-- Principe : l'accès aux données est contrôlé par l'appartenance à une
-- entreprise via la table `business_members`, et non plus seulement par
-- `owner_id`.  Cela permet le multi-utilisateur (propriétaire + employés).
--
-- Catégories de tables :
--   1. User-level   → auth.uid() (profiles, user_preferences, payments, invoices)
--   2. Global ref.  → lecture seule pour tout auth (permissions, plans, pricing_plans)
--   3. Businesses   → owner_id OU membre
--   4. business_members → auto-inscription + gestion par les membres
--   5. Direct biz   → is_business_member(business_id)  (~55 tables)
--   6. Child tables → via parent (customer_addresses, supplier_contacts, etc.)
--   7. Mixed accès  → user_id OU business_id (ai_conversations, notifications, products)
--
-- Exécuter dans Supabase Dashboard → SQL Editor
-- ============================================================================

-- ============================================================================
-- 0. INDEXES DE PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_business_members_active_lookup
  ON public.business_members(user_id, business_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_business_members_biz_active
  ON public.business_members(business_id, user_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- Index pour les child tables (joins d'accès)
CREATE INDEX IF NOT EXISTS idx_customers_business_id
  ON public.customers(id, business_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_business_id
  ON public.suppliers(id, business_id);

CREATE INDEX IF NOT EXISTS idx_sale_returns_business_id
  ON public.sale_returns(id, business_id);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_business_id
  ON public.purchase_returns(id, business_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_business_id
  ON public.ai_conversations(id, business_id);

CREATE INDEX IF NOT EXISTS idx_custom_roles_business_id
  ON public.custom_roles(id, business_id);

-- ============================================================================
-- 1. FONCTION HELPER (SECURITY DEFINER pour contourner RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members
    WHERE business_id = p_business_id
      AND user_id = auth.uid()
      AND is_active = true
      AND deleted_at IS NULL
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated, anon;

-- ============================================================================
-- 2. NETTOYAGE : supprimer TOUTES les politiques existantes
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      rec.policyname, rec.schemaname, rec.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- 3. ACTIVATION RLS SUR TOUTES LES TABLES
-- ============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'profiles','businesses','business_members','invitations','onboarding_states',
      'permissions','custom_roles','custom_role_permissions','member_permission_overrides',
      'customers','customer_addresses','customer_notes',
      'suppliers','supplier_contacts',
      'units_of_measure','product_categories','warehouses',
      'product_variants','warehouse_stock','inventory_movements','stock_adjustments','low_stock_alerts',
      'sales','sale_items','sale_payments','sale_returns','sale_return_items',
      'purchases','purchase_items','purchase_payments','purchase_returns','purchase_return_items',
      'expense_categories','expenses','recurring_expenses',
      'fiscal_years','accounting_periods','chart_of_accounts',
      'journal_entries','journal_entry_lines','account_period_balances',
      'bank_accounts','bank_transactions','cash_registers','cash_movements',
      'money_transfers','bank_reconciliations',
      'financial_reports','report_snapshots',
      'ai_conversations','ai_messages','ai_insights','ai_recommendations',
      'notifications','notification_preferences',
      'plans','business_subscriptions','billing_invoices','billing_payments',
      'uploads','employees','employee_payroll',
      'customer_transactions','supplier_transactions','ai_financial_analysis',
      'documents',
      'balance_sheet_snapshots','income_statement_snapshots',
      'cashflow_snapshots','equity_statement_snapshots',
      'pricing_plans','payments','subscriptions','invoices','user_preferences','products'
    ])
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- ============================================================================
-- 4. POLITIQUES PAR CATÉGORIE
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.1  USER-LEVEL TABLES  (auth.uid())
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE USING (id = auth.uid());

-- user_preferences
CREATE POLICY "user_preferences_select_own" ON public.user_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_preferences_insert_own" ON public.user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_preferences_update_own" ON public.user_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_preferences_delete_own" ON public.user_preferences
  FOR DELETE USING (user_id = auth.uid());

-- payments (billing)
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "payments_insert_own" ON public.payments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "payments_update_own" ON public.payments
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- invoices (billing)
CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "invoices_insert_own" ON public.invoices
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.2  GLOBAL REFERENCE TABLES  (lecture seule pour tous les auth)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "permissions_select_all" ON public.permissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "plans_select_all" ON public.plans
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "pricing_plans_select_all" ON public.pricing_plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.3  BUSINESSES  (owner_id OU membre)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "businesses_select" ON public.businesses
  FOR SELECT USING (
    owner_id = auth.uid() OR is_business_member(id)
  );

CREATE POLICY "businesses_insert" ON public.businesses
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "businesses_update" ON public.businesses
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "businesses_delete" ON public.businesses
  FOR DELETE USING (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.4  BUSINESS_MEMBERS  (bootstrap + gestion)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "business_members_select" ON public.business_members
  FOR SELECT USING (is_business_member(business_id));

CREATE POLICY "business_members_insert" ON public.business_members
  FOR INSERT WITH CHECK (
    -- Membre existant invite un nouveau membre, OU utilisateur s'ajoute lui-même
    is_business_member(business_id) OR user_id = auth.uid()
  );

CREATE POLICY "business_members_update" ON public.business_members
  FOR UPDATE USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

CREATE POLICY "business_members_delete" ON public.business_members
  FOR DELETE USING (is_business_member(business_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.5  DIRECT business_id TABLES
-- ─────────────────────────────────────────────────────────────────────────────
-- Principe : toute opération (SELECT, INSERT, UPDATE, DELETE) nécessite
-- que l'utilisateur soit un membre actif de l'entreprise.
-- ─────────────────────────────────────────────────────────────────────────────

-- invitations
CREATE POLICY "invitations_access" ON public.invitations
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- onboarding_states
CREATE POLICY "onboarding_states_access" ON public.onboarding_states
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- custom_roles
CREATE POLICY "custom_roles_access" ON public.custom_roles
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- customers
CREATE POLICY "customers_access" ON public.customers
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- customer_notes
CREATE POLICY "customer_notes_access" ON public.customer_notes
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- suppliers
CREATE POLICY "suppliers_access" ON public.suppliers
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- units_of_measure
CREATE POLICY "units_of_measure_access" ON public.units_of_measure
  FOR ALL USING (business_id IS NULL OR is_business_member(business_id))
  WITH CHECK (business_id IS NULL OR is_business_member(business_id));

-- product_categories
CREATE POLICY "product_categories_access" ON public.product_categories
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- warehouses
CREATE POLICY "warehouses_access" ON public.warehouses
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- product_variants
CREATE POLICY "product_variants_access" ON public.product_variants
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- warehouse_stock
CREATE POLICY "warehouse_stock_access" ON public.warehouse_stock
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- inventory_movements
CREATE POLICY "inventory_movements_access" ON public.inventory_movements
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- stock_adjustments
CREATE POLICY "stock_adjustments_access" ON public.stock_adjustments
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- low_stock_alerts
CREATE POLICY "low_stock_alerts_access" ON public.low_stock_alerts
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- sales
CREATE POLICY "sales_access" ON public.sales
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- sale_items
CREATE POLICY "sale_items_access" ON public.sale_items
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- sale_payments
CREATE POLICY "sale_payments_access" ON public.sale_payments
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- sale_returns
CREATE POLICY "sale_returns_access" ON public.sale_returns
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- purchases
CREATE POLICY "purchases_access" ON public.purchases
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- purchase_items
CREATE POLICY "purchase_items_access" ON public.purchase_items
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- purchase_payments
CREATE POLICY "purchase_payments_access" ON public.purchase_payments
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- purchase_returns
CREATE POLICY "purchase_returns_access" ON public.purchase_returns
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- expense_categories
CREATE POLICY "expense_categories_access" ON public.expense_categories
  FOR ALL USING (business_id IS NULL OR is_business_member(business_id))
  WITH CHECK (business_id IS NULL OR is_business_member(business_id));

-- expenses
CREATE POLICY "expenses_access" ON public.expenses
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- recurring_expenses
CREATE POLICY "recurring_expenses_access" ON public.recurring_expenses
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- fiscal_years
CREATE POLICY "fiscal_years_access" ON public.fiscal_years
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- accounting_periods
CREATE POLICY "accounting_periods_access" ON public.accounting_periods
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- chart_of_accounts
CREATE POLICY "chart_of_accounts_access" ON public.chart_of_accounts
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- journal_entries
CREATE POLICY "journal_entries_access" ON public.journal_entries
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- journal_entry_lines
CREATE POLICY "journal_entry_lines_access" ON public.journal_entry_lines
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- account_period_balances
CREATE POLICY "account_period_balances_access" ON public.account_period_balances
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- bank_accounts
CREATE POLICY "bank_accounts_access" ON public.bank_accounts
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- bank_transactions
CREATE POLICY "bank_transactions_access" ON public.bank_transactions
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- cash_registers
CREATE POLICY "cash_registers_access" ON public.cash_registers
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- cash_movements
CREATE POLICY "cash_movements_access" ON public.cash_movements
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- money_transfers
CREATE POLICY "money_transfers_access" ON public.money_transfers
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- bank_reconciliations
CREATE POLICY "bank_reconciliations_access" ON public.bank_reconciliations
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- financial_reports
CREATE POLICY "financial_reports_access" ON public.financial_reports
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- report_snapshots
CREATE POLICY "report_snapshots_access" ON public.report_snapshots
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- ai_insights
CREATE POLICY "ai_insights_access" ON public.ai_insights
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- ai_recommendations
CREATE POLICY "ai_recommendations_access" ON public.ai_recommendations
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- notification_preferences
CREATE POLICY "notification_preferences_access" ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- business_subscriptions
CREATE POLICY "business_subscriptions_access" ON public.business_subscriptions
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- billing_invoices
CREATE POLICY "billing_invoices_access" ON public.billing_invoices
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- billing_payments
CREATE POLICY "billing_payments_access" ON public.billing_payments
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- uploads
CREATE POLICY "uploads_access" ON public.uploads
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- employees
CREATE POLICY "employees_access" ON public.employees
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- employee_payroll
CREATE POLICY "employee_payroll_access" ON public.employee_payroll
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- customer_transactions
CREATE POLICY "customer_transactions_access" ON public.customer_transactions
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- supplier_transactions
CREATE POLICY "supplier_transactions_access" ON public.supplier_transactions
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- ai_financial_analysis
CREATE POLICY "ai_financial_analysis_access" ON public.ai_financial_analysis
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- documents
CREATE POLICY "documents_access" ON public.documents
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- balance_sheet_snapshots
CREATE POLICY "balance_sheet_snapshots_access" ON public.balance_sheet_snapshots
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- income_statement_snapshots
CREATE POLICY "income_statement_snapshots_access" ON public.income_statement_snapshots
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- cashflow_snapshots
CREATE POLICY "cashflow_snapshots_access" ON public.cashflow_snapshots
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- equity_statement_snapshots
CREATE POLICY "equity_statement_snapshots_access" ON public.equity_statement_snapshots
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- subscriptions (SaaS billing — a business_id + user_id)
CREATE POLICY "subscriptions_access" ON public.subscriptions
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.6  CHILD TABLES  (pas de business_id direct → via parent)
-- ─────────────────────────────────────────────────────────────────────────────

-- customer_addresses → customers(id) → business_id
CREATE POLICY "customer_addresses_access" ON public.customer_addresses
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_id AND is_business_member(c.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_id AND is_business_member(c.business_id)
  ));

-- supplier_contacts → suppliers(id) → business_id
CREATE POLICY "supplier_contacts_access" ON public.supplier_contacts
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_id AND is_business_member(s.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_id AND is_business_member(s.business_id)
  ));

-- sale_return_items → sale_returns(id) → business_id
CREATE POLICY "sale_return_items_access" ON public.sale_return_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sale_returns sr
    WHERE sr.id = return_id AND is_business_member(sr.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sale_returns sr
    WHERE sr.id = return_id AND is_business_member(sr.business_id)
  ));

-- purchase_return_items → purchase_returns(id) → business_id
CREATE POLICY "purchase_return_items_access" ON public.purchase_return_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.purchase_returns pr
    WHERE pr.id = return_id AND is_business_member(pr.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_returns pr
    WHERE pr.id = return_id AND is_business_member(pr.business_id)
  ));

-- custom_role_permissions → custom_roles(id) → business_id
CREATE POLICY "custom_role_permissions_access" ON public.custom_role_permissions
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.custom_roles cr
    WHERE cr.id = role_id AND is_business_member(cr.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.custom_roles cr
    WHERE cr.id = role_id AND is_business_member(cr.business_id)
  ));

-- member_permission_overrides → business_members(id) → business_id
CREATE POLICY "member_permission_overrides_access" ON public.member_permission_overrides
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.id = member_id AND is_business_member(bm.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.id = member_id AND is_business_member(bm.business_id)
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.7  MIXED-ACCESS TABLES  (user_id OU business_id)
-- ─────────────────────────────────────────────────────────────────────────────

-- ai_conversations : conversations personnelles (user_id) ou liées à une
-- entreprise (business_id, nullable)
CREATE POLICY "ai_conversations_access" ON public.ai_conversations
  FOR ALL
  USING (
    user_id = auth.uid()
    OR (business_id IS NOT NULL AND is_business_member(business_id))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (business_id IS NOT NULL AND is_business_member(business_id))
  );

-- ai_messages → ai_conversations
CREATE POLICY "ai_messages_access" ON public.ai_messages
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.ai_conversations ac
    WHERE ac.id = conversation_id
      AND (
        ac.user_id = auth.uid()
        OR (ac.business_id IS NOT NULL AND is_business_member(ac.business_id))
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_conversations ac
    WHERE ac.id = conversation_id
      AND (
        ac.user_id = auth.uid()
        OR (ac.business_id IS NOT NULL AND is_business_member(ac.business_id))
      )
  ));

-- notifications : notification personnelle (user_id) ou d'entreprise
-- (user_id IS NULL → notification globale à l'entreprise)
CREATE POLICY "notifications_access" ON public.notifications
  FOR ALL
  USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND is_business_member(business_id))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (user_id IS NULL AND is_business_member(business_id))
  );

-- products : legacy — accessible par user_id (propriétaire) ou business_id
CREATE POLICY "products_access" ON public.products
  FOR ALL
  USING (
    user_id = auth.uid()
    OR (business_id IS NOT NULL AND is_business_member(business_id))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (business_id IS NOT NULL AND is_business_member(business_id))
  );

-- ============================================================================
-- 5. VERIFICATION
-- ============================================================================

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
