-- ============================================================
-- ProfitPilot — Fix ALL table permissions + RLS policies
-- Colle ce script dans Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 1. Helper function: is_business_owner ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_business_owner(bid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = bid AND owner_id = auth.uid()
  );
$$;

-- ── 2. GRANT permissions on ALL tables ───────────────────────────────────────
-- Tables with business_id
GRANT ALL ON TABLE public.ai_financial_analysis       TO authenticated, service_role;
GRANT ALL ON TABLE public.cash_movements              TO authenticated, service_role;
GRANT ALL ON TABLE public.billing_invoices            TO authenticated, service_role;
GRANT ALL ON TABLE public.fiscal_years                TO authenticated, service_role;
GRANT ALL ON TABLE public.bank_reconciliations        TO authenticated, service_role;
GRANT ALL ON TABLE public.sale_returns                TO authenticated, service_role;
GRANT ALL ON TABLE public.purchase_payments           TO authenticated, service_role;
GRANT ALL ON TABLE public.sale_payments               TO authenticated, service_role;
GRANT ALL ON TABLE public.supplier_transactions       TO authenticated, service_role;
GRANT ALL ON TABLE public.purchase_returns            TO authenticated, service_role;
GRANT ALL ON TABLE public.low_stock_alerts            TO authenticated, service_role;
GRANT ALL ON TABLE public.accounting_periods          TO authenticated, service_role;
GRANT ALL ON TABLE public.custom_roles                TO authenticated, service_role;
GRANT ALL ON TABLE public.equity_statement_snapshots  TO authenticated, service_role;
GRANT ALL ON TABLE public.warehouse_stock             TO authenticated, service_role;
GRANT ALL ON TABLE public.ai_insights                 TO authenticated, service_role;
GRANT ALL ON TABLE public.report_snapshots            TO authenticated, service_role;
GRANT ALL ON TABLE public.customers                   TO authenticated, service_role;
GRANT ALL ON TABLE public.expense_categories          TO authenticated, service_role;
GRANT ALL ON TABLE public.financial_reports           TO authenticated, service_role;
GRANT ALL ON TABLE public.business_subscriptions      TO authenticated, service_role;
GRANT ALL ON TABLE public.customer_transactions       TO authenticated, service_role;
GRANT ALL ON TABLE public.income_statement_snapshots  TO authenticated, service_role;
GRANT ALL ON TABLE public.ai_conversations            TO authenticated, service_role;
GRANT ALL ON TABLE public.uploads                     TO authenticated, service_role;
GRANT ALL ON TABLE public.employees                   TO authenticated, service_role;
GRANT ALL ON TABLE public.billing_payments            TO authenticated, service_role;
GRANT ALL ON TABLE public.invitations                 TO authenticated, service_role;
GRANT ALL ON TABLE public.inventory_movements         TO authenticated, service_role;
GRANT ALL ON TABLE public.product_variants            TO authenticated, service_role;
GRANT ALL ON TABLE public.chart_of_accounts           TO authenticated, service_role;
GRANT ALL ON TABLE public.suppliers                   TO authenticated, service_role;
GRANT ALL ON TABLE public.customer_notes              TO authenticated, service_role;
GRANT ALL ON TABLE public.notification_preferences    TO authenticated, service_role;
GRANT ALL ON TABLE public.employee_payroll            TO authenticated, service_role;
GRANT ALL ON TABLE public.warehouses                  TO authenticated, service_role;
GRANT ALL ON TABLE public.sale_items                  TO authenticated, service_role;
GRANT ALL ON TABLE public.purchases                   TO authenticated, service_role;
GRANT ALL ON TABLE public.sales                       TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_adjustments           TO authenticated, service_role;
GRANT ALL ON TABLE public.recurring_expenses          TO authenticated, service_role;
GRANT ALL ON TABLE public.purchase_items              TO authenticated, service_role;
GRANT ALL ON TABLE public.onboarding_states           TO authenticated, service_role;
GRANT ALL ON TABLE public.cash_registers              TO authenticated, service_role;
GRANT ALL ON TABLE public.cashflow_snapshots          TO authenticated, service_role;
GRANT ALL ON TABLE public.bank_transactions           TO authenticated, service_role;
GRANT ALL ON TABLE public.documents                   TO authenticated, service_role;
GRANT ALL ON TABLE public.business_members            TO authenticated, service_role;
GRANT ALL ON TABLE public.expenses                    TO authenticated, service_role;
GRANT ALL ON TABLE public.balance_sheet_snapshots     TO authenticated, service_role;
GRANT ALL ON TABLE public.account_period_balances     TO authenticated, service_role;
GRANT ALL ON TABLE public.money_transfers             TO authenticated, service_role;
GRANT ALL ON TABLE public.ai_recommendations          TO authenticated, service_role;
GRANT ALL ON TABLE public.journal_entries             TO authenticated, service_role;
GRANT ALL ON TABLE public.journal_entry_lines         TO authenticated, service_role;
GRANT ALL ON TABLE public.product_categories          TO authenticated, service_role;
GRANT ALL ON TABLE public.bank_accounts               TO authenticated, service_role;
GRANT ALL ON TABLE public.units_of_measure            TO authenticated, service_role;
GRANT ALL ON TABLE public.notifications               TO authenticated, service_role;
-- Tables with user_id
GRANT ALL ON TABLE public.products                    TO authenticated, service_role;
GRANT ALL ON TABLE public.payments                    TO authenticated, service_role;
GRANT ALL ON TABLE public.subscriptions               TO authenticated, service_role;
GRANT ALL ON TABLE public.user_preferences            TO authenticated, service_role;
GRANT ALL ON TABLE public.invoices                    TO authenticated, service_role;
-- Tables with owner_id
GRANT ALL ON TABLE public.businesses                  TO authenticated, service_role;
-- Tables with id = auth.uid()
GRANT ALL ON TABLE public.profiles                    TO authenticated, service_role;
-- Tables linked via FK (no direct auth col)
GRANT ALL ON TABLE public.ai_messages                 TO authenticated, service_role;
GRANT ALL ON TABLE public.supplier_contacts           TO authenticated, service_role;
GRANT ALL ON TABLE public.customer_addresses          TO authenticated, service_role;
GRANT ALL ON TABLE public.sale_return_items           TO authenticated, service_role;
GRANT ALL ON TABLE public.purchase_return_items       TO authenticated, service_role;
GRANT ALL ON TABLE public.custom_role_permissions     TO authenticated, service_role;
GRANT ALL ON TABLE public.member_permission_overrides TO authenticated, service_role;
-- Public read-only tables
GRANT SELECT ON TABLE public.pricing_plans            TO authenticated, anon;
GRANT SELECT ON TABLE public.permissions              TO authenticated, anon;
GRANT SELECT ON TABLE public.plans                    TO authenticated, anon;

-- ── 3. Enable RLS on ALL tables ───────────────────────────────────────────────
ALTER TABLE public.ai_financial_analysis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_years                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_returns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.low_stock_alerts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equity_statement_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_statement_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_role_permissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payroll            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_states           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflow_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_sheet_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_period_balances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_transfers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units_of_measure            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans                       ENABLE ROW LEVEL SECURITY;

-- ── 4. Drop old policies (clean slate) ───────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── 5. RLS Policies ──────────────────────────────────────────────────────────

-- ── businesses (owner_id) ────────────────────────────────────────────────────
CREATE POLICY "businesses_all" ON public.businesses
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ── profiles (id = auth.uid()) ───────────────────────────────────────────────
CREATE POLICY "profiles_all" ON public.profiles
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ── products (user_id) ───────────────────────────────────────────────────────
CREATE POLICY "products_all" ON public.products
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── payments (user_id) ───────────────────────────────────────────────────────
CREATE POLICY "payments_all" ON public.payments
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── subscriptions (user_id) ──────────────────────────────────────────────────
CREATE POLICY "subscriptions_all" ON public.subscriptions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── user_preferences (user_id) ───────────────────────────────────────────────
CREATE POLICY "user_preferences_all" ON public.user_preferences
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── invoices (user_id) ───────────────────────────────────────────────────────
CREATE POLICY "invoices_all" ON public.invoices
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Tables with business_id (macro: is_business_owner) ───────────────────────
CREATE POLICY "sales_all"                      ON public.sales                      USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "sale_items_all"                 ON public.sale_items                 USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "sale_payments_all"              ON public.sale_payments              USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "sale_returns_all"               ON public.sale_returns               USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "purchases_all"                  ON public.purchases                  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "purchase_items_all"             ON public.purchase_items             USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "purchase_payments_all"          ON public.purchase_payments          USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "purchase_returns_all"           ON public.purchase_returns           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "expenses_all"                   ON public.expenses                   USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "expense_categories_all"         ON public.expense_categories         USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "recurring_expenses_all"         ON public.recurring_expenses         USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "customers_all"                  ON public.customers                  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "customer_transactions_all"      ON public.customer_transactions      USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "customer_notes_all"             ON public.customer_notes             USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "suppliers_all"                  ON public.suppliers                  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "supplier_transactions_all"      ON public.supplier_transactions      USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "employees_all"                  ON public.employees                  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "employee_payroll_all"           ON public.employee_payroll           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "warehouses_all"                 ON public.warehouses                 USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "warehouse_stock_all"            ON public.warehouse_stock            USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "inventory_movements_all"        ON public.inventory_movements        USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "stock_adjustments_all"          ON public.stock_adjustments          USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "low_stock_alerts_all"           ON public.low_stock_alerts           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "product_variants_all"           ON public.product_variants           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "product_categories_all"         ON public.product_categories         USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "units_of_measure_all"           ON public.units_of_measure           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "bank_accounts_all"              ON public.bank_accounts              USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "bank_transactions_all"          ON public.bank_transactions          USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "bank_reconciliations_all"       ON public.bank_reconciliations       USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "cash_registers_all"             ON public.cash_registers             USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "cash_movements_all"             ON public.cash_movements             USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "money_transfers_all"            ON public.money_transfers            USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "chart_of_accounts_all"          ON public.chart_of_accounts          USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "journal_entries_all"            ON public.journal_entries            USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "accounting_periods_all"         ON public.accounting_periods         USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "fiscal_years_all"               ON public.fiscal_years               USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "financial_reports_all"          ON public.financial_reports          USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "income_statement_snapshots_all" ON public.income_statement_snapshots USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "balance_sheet_snapshots_all"    ON public.balance_sheet_snapshots    USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "equity_statement_snapshots_all" ON public.equity_statement_snapshots USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "cashflow_snapshots_all"         ON public.cashflow_snapshots         USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "report_snapshots_all"           ON public.report_snapshots           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "account_period_balances_all"    ON public.account_period_balances    USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "ai_conversations_all"           ON public.ai_conversations           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "ai_insights_all"                ON public.ai_insights                USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "ai_financial_analysis_all"      ON public.ai_financial_analysis      USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "ai_recommendations_all"         ON public.ai_recommendations         USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "notifications_all"              ON public.notifications              USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "notification_preferences_all"   ON public.notification_preferences   USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "documents_all"                  ON public.documents                  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "uploads_all"                    ON public.uploads                    USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "onboarding_states_all"          ON public.onboarding_states          USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "business_subscriptions_all"     ON public.business_subscriptions     USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "billing_invoices_all"           ON public.billing_invoices           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "billing_payments_all"           ON public.billing_payments           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "invitations_all"                ON public.invitations                USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "business_members_all"           ON public.business_members           USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "custom_roles_all"               ON public.custom_roles               USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));

-- ── Tables liées via FK (pas de business_id direct) ──────────────────────────

-- ai_messages → via ai_conversations
CREATE POLICY "ai_messages_all" ON public.ai_messages
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = conversation_id AND is_business_owner(c.business_id)
    )
  );

-- journal_entry_lines → via journal_entries
CREATE POLICY "journal_entry_lines_all" ON public.journal_entry_lines
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id AND is_business_owner(je.business_id)
    )
  );

-- supplier_contacts → via suppliers
CREATE POLICY "supplier_contacts_all" ON public.supplier_contacts
  USING (
    EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = supplier_id AND is_business_owner(s.business_id)
    )
  );

-- customer_addresses → via customers
CREATE POLICY "customer_addresses_all" ON public.customer_addresses
  USING (
    EXISTS (
      SELECT 1 FROM public.customers cu
      WHERE cu.id = customer_id AND is_business_owner(cu.business_id)
    )
  );

-- sale_return_items → via sale_returns
CREATE POLICY "sale_return_items_all" ON public.sale_return_items
  USING (
    EXISTS (
      SELECT 1 FROM public.sale_returns sr
      WHERE sr.id = return_id AND is_business_owner(sr.business_id)
    )
  );

-- purchase_return_items → via purchase_returns
CREATE POLICY "purchase_return_items_all" ON public.purchase_return_items
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_returns pr
      WHERE pr.id = return_id AND is_business_owner(pr.business_id)
    )
  );

-- custom_role_permissions → via custom_roles
CREATE POLICY "custom_role_permissions_all" ON public.custom_role_permissions
  USING (
    EXISTS (
      SELECT 1 FROM public.custom_roles cr
      WHERE cr.id = role_id AND is_business_owner(cr.business_id)
    )
  );

-- member_permission_overrides → via business_members
CREATE POLICY "member_permission_overrides_all" ON public.member_permission_overrides
  USING (
    EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.id = member_id AND is_business_owner(bm.business_id)
    )
  );

-- ── Public read-only tables (tous les users authentifiés peuvent lire) ────────
CREATE POLICY "pricing_plans_select" ON public.pricing_plans FOR SELECT USING (true);
CREATE POLICY "permissions_select"   ON public.permissions   FOR SELECT USING (true);
CREATE POLICY "plans_select"         ON public.plans         FOR SELECT USING (true);

-- ── 6. Grant EXECUTE on helper function ──────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.is_business_owner(uuid) TO authenticated, service_role;

-- ── Done ─────────────────────────────────────────────────────────────────────
SELECT 'SUCCESS: All permissions and RLS policies applied.' AS status;
