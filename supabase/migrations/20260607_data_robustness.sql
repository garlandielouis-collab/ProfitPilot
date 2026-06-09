-- ============================================================================
-- PROFITPILOT — DATA ROBUSTNESS IMPROVEMENTS
-- ============================================================================
-- 1.  Custom ENUM types pour les colonnes text avec CHECK inline
-- 2.  Contraintes CHECK manquantes sur les colonnes numériques
-- 3.  Actions ON DELETE CASCADE / SET NULL / RESTRICT manquantes sur les FK
--
-- Exécuter dans Supabase Dashboard → SQL Editor
-- ============================================================================

-- ============================================================================
-- 1.  CRÉATION DES TYPES ENUM MANQUANTS
-- ============================================================================
-- Ces colonnes utilisent actuellement text + CHECK inline.
-- On migre vers des types ENUM pour la cohérence et la documentation.

DO $$ BEGIN
  CREATE TYPE cash_movement_direction AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE customer_transaction_type AS ENUM (
    'sale', 'payment_received', 'credit_note', 'debit_note',
    'return', 'opening_balance', 'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE supplier_transaction_type AS ENUM (
    'purchase', 'payment_made', 'return', 'credit_received',
    'debit_note', 'opening_balance', 'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE employment_type AS ENUM (
    'full_time', 'part_time', 'contract', 'intern', 'seasonal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE employment_status AS ENUM (
    'active', 'inactive', 'on_leave', 'terminated', 'suspended'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE salary_type AS ENUM (
    'monthly', 'hourly', 'daily', 'weekly', 'commission_only'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE financial_analysis_type AS ENUM (
    'monthly_review', 'quarterly_review', 'annual_review',
    'cashflow_forecast', 'expense_analysis', 'profitability_analysis',
    'stock_analysis', 'ar_ap_analysis', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'invoice_pdf', 'receipt', 'expense_receipt', 'purchase_order',
    'contract', 'employee_document', 'id_document', 'business_license',
    'tax_document', 'report_pdf', 'product_image', 'logo', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('generating', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly', 'quarterly', 'weekly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'low_stock', 'payment_due', 'new_sale', 'new_purchase',
    'new_expense', 'ai_insight', 'weekly_summary', 'member_invite',
    'system', 'reminder'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2.  MIGRATION DES COLONNES text → ENUM
-- ============================================================================

-- Note : Chaque ALTER COLUMN est encapsulée dans un bloc DO pour être
-- idempotente (ne pas échouer si la colonne utilise déjà le type).

DO $$ BEGIN
  ALTER TABLE public.cash_movements
    ALTER COLUMN type TYPE cash_movement_direction
    USING type::cash_movement_direction;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customer_transactions
    ALTER COLUMN type TYPE customer_transaction_type
    USING type::customer_transaction_type;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.supplier_transactions
    ALTER COLUMN type TYPE supplier_transaction_type
    USING type::supplier_transaction_type;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ai_messages
    ALTER COLUMN role TYPE ai_message_role
    USING role::ai_message_role;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.employees
    ALTER COLUMN employment_type TYPE employment_type
    USING employment_type::employment_type;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.employees
    ALTER COLUMN employment_status TYPE employment_status
    USING employment_status::employment_status;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.employees
    ALTER COLUMN salary_type TYPE salary_type
    USING salary_type::salary_type;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ai_financial_analysis
    ALTER COLUMN type TYPE financial_analysis_type
    USING type::financial_analysis_type;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.documents
    ALTER COLUMN type TYPE document_type
    USING type::document_type;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_reports
    ALTER COLUMN status TYPE report_status
    USING status::report_status;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.billing_payments
    ALTER COLUMN status TYPE billing_payment_status
    USING status::billing_payment_status;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.plans
    ALTER COLUMN billing_cycle TYPE billing_cycle
    USING billing_cycle::billing_cycle;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications
    ALTER COLUMN type TYPE notification_type
    USING type::notification_type;
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 3.  CONTRAINTES CHECK MANQUANTES
-- ============================================================================

-- ── 3.1  customers ──────────────────────────────────────────────────────────

ALTER TABLE public.customers
  ADD CONSTRAINT customers_credit_limit_check
  CHECK (credit_limit >= 0),
  ALTER COLUMN credit_limit SET DEFAULT 0;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_outstanding_balance_check
  CHECK (outstanding_balance >= 0);

ALTER TABLE public.customers
  ADD CONSTRAINT customers_total_purchases_check
  CHECK (total_purchases >= 0);

-- ── 3.2  suppliers ──────────────────────────────────────────────────────────

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_discount_percent_check
  CHECK (discount_percent >= 0 AND discount_percent <= 100);

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_outstanding_balance_check
  CHECK (outstanding_balance >= 0);

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_total_purchased_check
  CHECK (total_purchased >= 0);

-- ── 3.3  product_variants ───────────────────────────────────────────────────

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_purchase_price_check
  CHECK (purchase_price IS NULL OR purchase_price >= 0);

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_sale_price_check
  CHECK (sale_price IS NULL OR sale_price >= 0);

-- ── 3.4  warehouse_stock ────────────────────────────────────────────────────

ALTER TABLE public.warehouse_stock
  ADD CONSTRAINT warehouse_stock_quantity_check
  CHECK (quantity >= 0);

ALTER TABLE public.warehouse_stock
  ADD CONSTRAINT warehouse_stock_reserved_qty_check
  CHECK (reserved_qty >= 0);

ALTER TABLE public.warehouse_stock
  ADD CONSTRAINT warehouse_stock_reserved_not_exceed_quantity
  CHECK (reserved_qty <= quantity);

-- ── 3.5  inventory_movements ────────────────────────────────────────────────

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_quantity_check
  CHECK (quantity > 0);

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_unit_cost_check
  CHECK (unit_cost IS NULL OR unit_cost >= 0);

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_total_cost_check
  CHECK (total_cost IS NULL OR total_cost >= 0);

-- ── 3.6  stock_adjustments ──────────────────────────────────────────────────

ALTER TABLE public.stock_adjustments
  ADD CONSTRAINT stock_adjustments_quantity_before_check
  CHECK (quantity_before >= 0);

ALTER TABLE public.stock_adjustments
  ADD CONSTRAINT stock_adjustments_quantity_after_check
  CHECK (quantity_after >= 0);

-- ── 3.7  sales ──────────────────────────────────────────────────────────────

ALTER TABLE public.sales
  ADD CONSTRAINT sales_subtotal_amount_check
  CHECK (subtotal_amount >= 0);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_discount_amount_check
  CHECK (discount_amount >= 0);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_discount_percent_check
  CHECK (discount_percent >= 0 AND discount_percent <= 100);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_tax_amount_check
  CHECK (tax_amount >= 0);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_total_amount_check
  CHECK (total_amount >= 0);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_paid_amount_check
  CHECK (paid_amount >= 0);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_paid_not_exceed_total
  CHECK (paid_amount <= total_amount);

-- ── 3.8  sale_items ─────────────────────────────────────────────────────────

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_cost_price_check
  CHECK (cost_price >= 0);

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_discount_percent_check
  CHECK (discount_percent >= 0 AND discount_percent <= 100);

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_discount_amount_check
  CHECK (discount_amount >= 0);

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_tax_rate_check
  CHECK (tax_rate >= 0);

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_tax_amount_check
  CHECK (tax_amount >= 0);

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_line_total_check
  CHECK (line_total >= 0);

-- ── 3.9  sale_returns ───────────────────────────────────────────────────────

ALTER TABLE public.sale_returns
  ADD CONSTRAINT sale_returns_total_amount_check
  CHECK (total_amount >= 0);

-- ── 3.10  sale_return_items ─────────────────────────────────────────────────

ALTER TABLE public.sale_return_items
  ADD CONSTRAINT sale_return_items_unit_price_check
  CHECK (unit_price >= 0);

ALTER TABLE public.sale_return_items
  ADD CONSTRAINT sale_return_items_line_total_check
  CHECK (line_total >= 0);

-- ── 3.11  purchases ─────────────────────────────────────────────────────────

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_subtotal_amount_check
  CHECK (subtotal_amount >= 0);

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_discount_amount_check
  CHECK (discount_amount >= 0);

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_tax_amount_check
  CHECK (tax_amount >= 0);

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_shipping_cost_check
  CHECK (shipping_cost >= 0);

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_total_amount_check
  CHECK (total_amount >= 0);

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_paid_amount_check
  CHECK (paid_amount >= 0);

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_exchange_rate_check
  CHECK (exchange_rate > 0);

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_paid_not_exceed_total
  CHECK (paid_amount <= total_amount);

-- ── 3.12  purchase_items ────────────────────────────────────────────────────

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_discount_percent_check
  CHECK (discount_percent >= 0 AND discount_percent <= 100);

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_discount_amount_check
  CHECK (discount_amount >= 0);

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_tax_rate_check
  CHECK (tax_rate >= 0);

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_tax_amount_check
  CHECK (tax_amount >= 0);

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_line_total_check
  CHECK (line_total >= 0);

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_quantity_received_check
  CHECK (quantity_received >= 0);

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_received_not_exceed_qty
  CHECK (quantity_received <= quantity);

-- ── 3.13  purchase_returns ──────────────────────────────────────────────────

ALTER TABLE public.purchase_returns
  ADD CONSTRAINT purchase_returns_total_amount_check
  CHECK (total_amount >= 0);

-- ── 3.14  purchase_return_items ─────────────────────────────────────────────

ALTER TABLE public.purchase_return_items
  ADD CONSTRAINT purchase_return_items_unit_cost_check
  CHECK (unit_cost >= 0);

ALTER TABLE public.purchase_return_items
  ADD CONSTRAINT purchase_return_items_line_total_check
  CHECK (line_total >= 0);

-- ── 3.15  employee_payroll ──────────────────────────────────────────────────

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_base_salary_check
  CHECK (base_salary >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_overtime_hours_check
  CHECK (overtime_hours >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_overtime_amount_check
  CHECK (overtime_amount >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_commission_check
  CHECK (commission >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_bonuses_check
  CHECK (bonuses >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_allowances_check
  CHECK (allowances >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_gross_pay_check
  CHECK (gross_pay >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_social_charges_check
  CHECK (social_charges >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_income_tax_check
  CHECK (income_tax >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_other_deductions_check
  CHECK (other_deductions >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_total_deductions_check
  CHECK (total_deductions >= 0);

ALTER TABLE public.employee_payroll
  ADD CONSTRAINT employee_payroll_net_pay_check
  CHECK (net_pay >= 0);

-- ── 3.16  journal_entries ───────────────────────────────────────────────────

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_total_debit_check
  CHECK (total_debit >= 0);

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_total_credit_check
  CHECK (total_credit >= 0);

-- ── 3.17  bank_accounts ─────────────────────────────────────────────────────

ALTER TABLE public.bank_accounts
  ADD CONSTRAINT bank_accounts_opening_balance_check
  CHECK (opening_balance >= 0);

-- ── 3.18  products ──────────────────────────────────────────────────────────

ALTER TABLE public.products
  ADD CONSTRAINT products_purchase_price_check
  CHECK (purchase_price IS NULL OR purchase_price >= 0);

ALTER TABLE public.products
  ADD CONSTRAINT products_sale_price_check
  CHECK (sale_price IS NULL OR sale_price >= 0);

ALTER TABLE public.products
  ADD CONSTRAINT products_stock_quantity_check
  CHECK (stock_quantity >= 0);

-- ============================================================================
-- 4.  AJOUT / CORRECTION DES ON DELETE ACTIONS
-- ============================================================================
-- Le schéma actuel n'a PAS de clauses ON DELETE (NO ACTION par défaut).
-- On supprime les FK existantes et on les recrée avec l'action appropriée.

-- ── 4.1  profiles ───────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey,
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- ── 4.2  businesses ─────────────────────────────────────────────────────────

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_owner_id_fkey,
  ADD CONSTRAINT businesses_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id)
  ON DELETE RESTRICT;

-- ── 4.3  business_members ───────────────────────────────────────────────────

ALTER TABLE public.business_members
  DROP CONSTRAINT IF EXISTS business_members_business_id_fkey,
  ADD CONSTRAINT business_members_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.business_members
  DROP CONSTRAINT IF EXISTS business_members_user_id_fkey,
  ADD CONSTRAINT business_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.business_members
  DROP CONSTRAINT IF EXISTS business_members_invited_by_fkey,
  ADD CONSTRAINT business_members_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.4  invitations ────────────────────────────────────────────────────────

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_business_id_fkey,
  ADD CONSTRAINT invitations_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey,
  ADD CONSTRAINT invitations_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.5  customers ──────────────────────────────────────────────────────────

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_business_id_fkey,
  ADD CONSTRAINT customers_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_created_by_fkey,
  ADD CONSTRAINT customers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.6  customer_addresses ─────────────────────────────────────────────────

ALTER TABLE public.customer_addresses
  DROP CONSTRAINT IF EXISTS customer_addresses_customer_id_fkey,
  ADD CONSTRAINT customer_addresses_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON DELETE CASCADE;

-- ── 4.7  customer_notes ─────────────────────────────────────────────────────

ALTER TABLE public.customer_notes
  DROP CONSTRAINT IF EXISTS customer_notes_customer_id_fkey,
  ADD CONSTRAINT customer_notes_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON DELETE CASCADE;

ALTER TABLE public.customer_notes
  DROP CONSTRAINT IF EXISTS customer_notes_business_id_fkey,
  ADD CONSTRAINT customer_notes_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.customer_notes
  DROP CONSTRAINT IF EXISTS customer_notes_created_by_fkey,
  ADD CONSTRAINT customer_notes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.8  suppliers ──────────────────────────────────────────────────────────

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_business_id_fkey,
  ADD CONSTRAINT suppliers_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_created_by_fkey,
  ADD CONSTRAINT suppliers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.9  supplier_contacts ──────────────────────────────────────────────────

ALTER TABLE public.supplier_contacts
  DROP CONSTRAINT IF EXISTS supplier_contacts_supplier_id_fkey,
  ADD CONSTRAINT supplier_contacts_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
  ON DELETE CASCADE;

-- ── 4.10  sales ─────────────────────────────────────────────────────────────

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_business_id_fkey,
  ADD CONSTRAINT sales_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_customer_id_fkey,
  ADD CONSTRAINT sales_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON DELETE SET NULL;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_warehouse_id_fkey,
  ADD CONSTRAINT sales_warehouse_id_fkey
  FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
  ON DELETE SET NULL;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_created_by_fkey,
  ADD CONSTRAINT sales_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.11  sale_items ────────────────────────────────────────────────────────

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey,
  ADD CONSTRAINT sale_items_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES public.sales(id)
  ON DELETE CASCADE;

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_business_id_fkey,
  ADD CONSTRAINT sale_items_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_variant_id_fkey,
  ADD CONSTRAINT sale_items_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id)
  ON DELETE RESTRICT;

-- ── 4.12  sale_payments ─────────────────────────────────────────────────────

ALTER TABLE public.sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_sale_id_fkey,
  ADD CONSTRAINT sale_payments_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES public.sales(id)
  ON DELETE CASCADE;

ALTER TABLE public.sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_business_id_fkey,
  ADD CONSTRAINT sale_payments_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_received_by_fkey,
  ADD CONSTRAINT sale_payments_received_by_fkey
  FOREIGN KEY (received_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.13  sale_returns ──────────────────────────────────────────────────────

ALTER TABLE public.sale_returns
  DROP CONSTRAINT IF EXISTS sale_returns_business_id_fkey,
  ADD CONSTRAINT sale_returns_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.sale_returns
  DROP CONSTRAINT IF EXISTS sale_returns_sale_id_fkey,
  ADD CONSTRAINT sale_returns_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES public.sales(id)
  ON DELETE RESTRICT;

ALTER TABLE public.sale_returns
  DROP CONSTRAINT IF EXISTS sale_returns_created_by_fkey,
  ADD CONSTRAINT sale_returns_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.14  sale_return_items ─────────────────────────────────────────────────

ALTER TABLE public.sale_return_items
  DROP CONSTRAINT IF EXISTS sale_return_items_return_id_fkey,
  ADD CONSTRAINT sale_return_items_return_id_fkey
  FOREIGN KEY (return_id) REFERENCES public.sale_returns(id)
  ON DELETE CASCADE;

ALTER TABLE public.sale_return_items
  DROP CONSTRAINT IF EXISTS sale_return_items_sale_item_id_fkey,
  ADD CONSTRAINT sale_return_items_sale_item_id_fkey
  FOREIGN KEY (sale_item_id) REFERENCES public.sale_items(id)
  ON DELETE SET NULL;

-- ── 4.15  purchases ─────────────────────────────────────────────────────────

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_business_id_fkey,
  ADD CONSTRAINT purchases_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_supplier_id_fkey,
  ADD CONSTRAINT purchases_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
  ON DELETE RESTRICT;

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_warehouse_id_fkey,
  ADD CONSTRAINT purchases_warehouse_id_fkey
  FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
  ON DELETE SET NULL;

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_created_by_fkey,
  ADD CONSTRAINT purchases_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.16  purchase_items ────────────────────────────────────────────────────

ALTER TABLE public.purchase_items
  DROP CONSTRAINT IF EXISTS purchase_items_purchase_id_fkey,
  ADD CONSTRAINT purchase_items_purchase_id_fkey
  FOREIGN KEY (purchase_id) REFERENCES public.purchases(id)
  ON DELETE CASCADE;

ALTER TABLE public.purchase_items
  DROP CONSTRAINT IF EXISTS purchase_items_business_id_fkey,
  ADD CONSTRAINT purchase_items_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.purchase_items
  DROP CONSTRAINT IF EXISTS purchase_items_variant_id_fkey,
  ADD CONSTRAINT purchase_items_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id)
  ON DELETE RESTRICT;

-- ── 4.17  purchase_payments ─────────────────────────────────────────────────

ALTER TABLE public.purchase_payments
  DROP CONSTRAINT IF EXISTS purchase_payments_purchase_id_fkey,
  ADD CONSTRAINT purchase_payments_purchase_id_fkey
  FOREIGN KEY (purchase_id) REFERENCES public.purchases(id)
  ON DELETE CASCADE;

ALTER TABLE public.purchase_payments
  DROP CONSTRAINT IF EXISTS purchase_payments_business_id_fkey,
  ADD CONSTRAINT purchase_payments_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.purchase_payments
  DROP CONSTRAINT IF EXISTS purchase_payments_paid_by_fkey,
  ADD CONSTRAINT purchase_payments_paid_by_fkey
  FOREIGN KEY (paid_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.18  purchase_returns ──────────────────────────────────────────────────

ALTER TABLE public.purchase_returns
  DROP CONSTRAINT IF EXISTS purchase_returns_business_id_fkey,
  ADD CONSTRAINT purchase_returns_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.purchase_returns
  DROP CONSTRAINT IF EXISTS purchase_returns_purchase_id_fkey,
  ADD CONSTRAINT purchase_returns_purchase_id_fkey
  FOREIGN KEY (purchase_id) REFERENCES public.purchases(id)
  ON DELETE RESTRICT;

ALTER TABLE public.purchase_returns
  DROP CONSTRAINT IF EXISTS purchase_returns_created_by_fkey,
  ADD CONSTRAINT purchase_returns_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.19  purchase_return_items ─────────────────────────────────────────────

ALTER TABLE public.purchase_return_items
  DROP CONSTRAINT IF EXISTS purchase_return_items_return_id_fkey,
  ADD CONSTRAINT purchase_return_items_return_id_fkey
  FOREIGN KEY (return_id) REFERENCES public.purchase_returns(id)
  ON DELETE CASCADE;

ALTER TABLE public.purchase_return_items
  DROP CONSTRAINT IF EXISTS purchase_return_items_purchase_item_id_fkey,
  ADD CONSTRAINT purchase_return_items_purchase_item_id_fkey
  FOREIGN KEY (purchase_item_id) REFERENCES public.purchase_items(id)
  ON DELETE SET NULL;

-- ── 4.20  expenses ──────────────────────────────────────────────────────────

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_business_id_fkey,
  ADD CONSTRAINT expenses_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_category_id_fkey,
  ADD CONSTRAINT expenses_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.expense_categories(id)
  ON DELETE SET NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_supplier_id_fkey,
  ADD CONSTRAINT expenses_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
  ON DELETE SET NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_approved_by_fkey,
  ADD CONSTRAINT expenses_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_created_by_fkey,
  ADD CONSTRAINT expenses_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.21  recurring_expenses ────────────────────────────────────────────────

ALTER TABLE public.recurring_expenses
  DROP CONSTRAINT IF EXISTS recurring_expenses_business_id_fkey,
  ADD CONSTRAINT recurring_expenses_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.recurring_expenses
  DROP CONSTRAINT IF EXISTS recurring_expenses_category_id_fkey,
  ADD CONSTRAINT recurring_expenses_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.expense_categories(id)
  ON DELETE SET NULL;

ALTER TABLE public.recurring_expenses
  DROP CONSTRAINT IF EXISTS recurring_expenses_supplier_id_fkey,
  ADD CONSTRAINT recurring_expenses_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
  ON DELETE SET NULL;

ALTER TABLE public.recurring_expenses
  DROP CONSTRAINT IF EXISTS recurring_expenses_created_by_fkey,
  ADD CONSTRAINT recurring_expenses_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.22  fiscal_years ──────────────────────────────────────────────────────

ALTER TABLE public.fiscal_years
  DROP CONSTRAINT IF EXISTS fiscal_years_business_id_fkey,
  ADD CONSTRAINT fiscal_years_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.fiscal_years
  DROP CONSTRAINT IF EXISTS fiscal_years_closed_by_fkey,
  ADD CONSTRAINT fiscal_years_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.23  accounting_periods ────────────────────────────────────────────────

ALTER TABLE public.accounting_periods
  DROP CONSTRAINT IF EXISTS accounting_periods_business_id_fkey,
  ADD CONSTRAINT accounting_periods_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.accounting_periods
  DROP CONSTRAINT IF EXISTS accounting_periods_fiscal_year_id_fkey,
  ADD CONSTRAINT accounting_periods_fiscal_year_id_fkey
  FOREIGN KEY (fiscal_year_id) REFERENCES public.fiscal_years(id)
  ON DELETE CASCADE;

ALTER TABLE public.accounting_periods
  DROP CONSTRAINT IF EXISTS accounting_periods_closed_by_fkey,
  ADD CONSTRAINT accounting_periods_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.24  chart_of_accounts ─────────────────────────────────────────────────

ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_business_id_fkey,
  ADD CONSTRAINT chart_of_accounts_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_parent_id_fkey,
  ADD CONSTRAINT chart_of_accounts_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.chart_of_accounts(id)
  ON DELETE SET NULL;

-- ── 4.25  journal_entries ───────────────────────────────────────────────────

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_business_id_fkey,
  ADD CONSTRAINT journal_entries_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_period_id_fkey,
  ADD CONSTRAINT journal_entries_period_id_fkey
  FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id)
  ON DELETE RESTRICT;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_created_by_fkey,
  ADD CONSTRAINT journal_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_voided_by_fkey,
  ADD CONSTRAINT journal_entries_voided_by_fkey
  FOREIGN KEY (voided_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.26  journal_entry_lines ───────────────────────────────────────────────

ALTER TABLE public.journal_entry_lines
  DROP CONSTRAINT IF EXISTS journal_entry_lines_journal_entry_id_fkey,
  ADD CONSTRAINT journal_entry_lines_journal_entry_id_fkey
  FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id)
  ON DELETE CASCADE;

ALTER TABLE public.journal_entry_lines
  DROP CONSTRAINT IF EXISTS journal_entry_lines_business_id_fkey,
  ADD CONSTRAINT journal_entry_lines_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.journal_entry_lines
  DROP CONSTRAINT IF EXISTS journal_entry_lines_account_id_fkey,
  ADD CONSTRAINT journal_entry_lines_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id)
  ON DELETE RESTRICT;

-- ── 4.27  account_period_balances ───────────────────────────────────────────

ALTER TABLE public.account_period_balances
  DROP CONSTRAINT IF EXISTS account_period_balances_business_id_fkey,
  ADD CONSTRAINT account_period_balances_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.account_period_balances
  DROP CONSTRAINT IF EXISTS account_period_balances_account_id_fkey,
  ADD CONSTRAINT account_period_balances_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id)
  ON DELETE CASCADE;

ALTER TABLE public.account_period_balances
  DROP CONSTRAINT IF EXISTS account_period_balances_period_id_fkey,
  ADD CONSTRAINT account_period_balances_period_id_fkey
  FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id)
  ON DELETE CASCADE;

-- ── 4.28  bank_accounts ─────────────────────────────────────────────────────

ALTER TABLE public.bank_accounts
  DROP CONSTRAINT IF EXISTS bank_accounts_business_id_fkey,
  ADD CONSTRAINT bank_accounts_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.bank_accounts
  DROP CONSTRAINT IF EXISTS bank_accounts_account_id_fkey,
  ADD CONSTRAINT bank_accounts_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id)
  ON DELETE SET NULL;

-- ── 4.29  bank_transactions ─────────────────────────────────────────────────

ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_business_id_fkey,
  ADD CONSTRAINT bank_transactions_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_bank_account_id_fkey,
  ADD CONSTRAINT bank_transactions_bank_account_id_fkey
  FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id)
  ON DELETE CASCADE;

ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_created_by_fkey,
  ADD CONSTRAINT bank_transactions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.30  cash_registers ────────────────────────────────────────────────────

ALTER TABLE public.cash_registers
  DROP CONSTRAINT IF EXISTS cash_registers_business_id_fkey,
  ADD CONSTRAINT cash_registers_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.cash_registers
  DROP CONSTRAINT IF EXISTS cash_registers_bank_account_id_fkey,
  ADD CONSTRAINT cash_registers_bank_account_id_fkey
  FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id)
  ON DELETE CASCADE;

ALTER TABLE public.cash_registers
  DROP CONSTRAINT IF EXISTS cash_registers_opened_by_fkey,
  ADD CONSTRAINT cash_registers_opened_by_fkey
  FOREIGN KEY (opened_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.cash_registers
  DROP CONSTRAINT IF EXISTS cash_registers_closed_by_fkey,
  ADD CONSTRAINT cash_registers_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.31  money_transfers ───────────────────────────────────────────────────

ALTER TABLE public.money_transfers
  DROP CONSTRAINT IF EXISTS money_transfers_business_id_fkey,
  ADD CONSTRAINT money_transfers_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.money_transfers
  DROP CONSTRAINT IF EXISTS money_transfers_from_account_id_fkey,
  ADD CONSTRAINT money_transfers_from_account_id_fkey
  FOREIGN KEY (from_account_id) REFERENCES public.bank_accounts(id)
  ON DELETE RESTRICT;

ALTER TABLE public.money_transfers
  DROP CONSTRAINT IF EXISTS money_transfers_to_account_id_fkey,
  ADD CONSTRAINT money_transfers_to_account_id_fkey
  FOREIGN KEY (to_account_id) REFERENCES public.bank_accounts(id)
  ON DELETE RESTRICT;

ALTER TABLE public.money_transfers
  DROP CONSTRAINT IF EXISTS money_transfers_created_by_fkey,
  ADD CONSTRAINT money_transfers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.32  bank_reconciliations ──────────────────────────────────────────────

ALTER TABLE public.bank_reconciliations
  DROP CONSTRAINT IF EXISTS bank_reconciliations_business_id_fkey,
  ADD CONSTRAINT bank_reconciliations_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.bank_reconciliations
  DROP CONSTRAINT IF EXISTS bank_reconciliations_bank_account_id_fkey,
  ADD CONSTRAINT bank_reconciliations_bank_account_id_fkey
  FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id)
  ON DELETE CASCADE;

ALTER TABLE public.bank_reconciliations
  DROP CONSTRAINT IF EXISTS bank_reconciliations_created_by_fkey,
  ADD CONSTRAINT bank_reconciliations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.33  financial_reports ─────────────────────────────────────────────────

ALTER TABLE public.financial_reports
  DROP CONSTRAINT IF EXISTS financial_reports_business_id_fkey,
  ADD CONSTRAINT financial_reports_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.financial_reports
  DROP CONSTRAINT IF EXISTS financial_reports_generated_by_fkey,
  ADD CONSTRAINT financial_reports_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.34  report_snapshots ──────────────────────────────────────────────────

ALTER TABLE public.report_snapshots
  DROP CONSTRAINT IF EXISTS report_snapshots_business_id_fkey,
  ADD CONSTRAINT report_snapshots_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.report_snapshots
  DROP CONSTRAINT IF EXISTS report_snapshots_report_id_fkey,
  ADD CONSTRAINT report_snapshots_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES public.financial_reports(id)
  ON DELETE SET NULL;

-- ── 4.35  ai_conversations ──────────────────────────────────────────────────

ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_business_id_fkey,
  ADD CONSTRAINT ai_conversations_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_user_id_fkey,
  ADD CONSTRAINT ai_conversations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- ── 4.36  ai_messages ───────────────────────────────────────────────────────

ALTER TABLE public.ai_messages
  DROP CONSTRAINT IF EXISTS ai_messages_conversation_id_fkey,
  ADD CONSTRAINT ai_messages_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id)
  ON DELETE CASCADE;

-- ── 4.37  ai_insights / ai_recommendations ──────────────────────────────────

ALTER TABLE public.ai_insights
  DROP CONSTRAINT IF EXISTS ai_insights_business_id_fkey,
  ADD CONSTRAINT ai_insights_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.ai_recommendations
  DROP CONSTRAINT IF EXISTS ai_recommendations_business_id_fkey,
  ADD CONSTRAINT ai_recommendations_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

-- ── 4.38  notifications / notification_preferences ─────────────────────────

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_business_id_fkey,
  ADD CONSTRAINT notifications_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_business_id_fkey,
  ADD CONSTRAINT notification_preferences_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_user_id_fkey,
  ADD CONSTRAINT notification_preferences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- ── 4.39  business_subscriptions / billing ──────────────────────────────────

ALTER TABLE public.business_subscriptions
  DROP CONSTRAINT IF EXISTS business_subscriptions_business_id_fkey,
  ADD CONSTRAINT business_subscriptions_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.business_subscriptions
  DROP CONSTRAINT IF EXISTS business_subscriptions_plan_id_fkey,
  ADD CONSTRAINT business_subscriptions_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES public.plans(id)
  ON DELETE RESTRICT;

ALTER TABLE public.billing_invoices
  DROP CONSTRAINT IF EXISTS billing_invoices_business_id_fkey,
  ADD CONSTRAINT billing_invoices_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.billing_invoices
  DROP CONSTRAINT IF EXISTS billing_invoices_subscription_id_fkey,
  ADD CONSTRAINT billing_invoices_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.business_subscriptions(id)
  ON DELETE CASCADE;

ALTER TABLE public.billing_payments
  DROP CONSTRAINT IF EXISTS billing_payments_business_id_fkey,
  ADD CONSTRAINT billing_payments_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.billing_payments
  DROP CONSTRAINT IF EXISTS billing_payments_invoice_id_fkey,
  ADD CONSTRAINT billing_payments_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id)
  ON DELETE CASCADE;

-- ── 4.40  uploads / documents ───────────────────────────────────────────────

ALTER TABLE public.uploads
  DROP CONSTRAINT IF EXISTS uploads_business_id_fkey,
  ADD CONSTRAINT uploads_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.uploads
  DROP CONSTRAINT IF EXISTS uploads_uploaded_by_fkey,
  ADD CONSTRAINT uploads_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_business_id_fkey,
  ADD CONSTRAINT documents_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_upload_id_fkey,
  ADD CONSTRAINT documents_upload_id_fkey
  FOREIGN KEY (upload_id) REFERENCES public.uploads(id)
  ON DELETE SET NULL;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_created_by_fkey,
  ADD CONSTRAINT documents_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.41  employees / employee_payroll ──────────────────────────────────────

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_business_id_fkey,
  ADD CONSTRAINT employees_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_member_id_fkey,
  ADD CONSTRAINT employees_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.business_members(id)
  ON DELETE SET NULL;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_created_by_fkey,
  ADD CONSTRAINT employees_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.employee_payroll
  DROP CONSTRAINT IF EXISTS employee_payroll_business_id_fkey,
  ADD CONSTRAINT employee_payroll_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.employee_payroll
  DROP CONSTRAINT IF EXISTS employee_payroll_employee_id_fkey,
  ADD CONSTRAINT employee_payroll_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id)
  ON DELETE CASCADE;

ALTER TABLE public.employee_payroll
  DROP CONSTRAINT IF EXISTS employee_payroll_created_by_fkey,
  ADD CONSTRAINT employee_payroll_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.42  customer_transactions / supplier_transactions ─────────────────────

ALTER TABLE public.customer_transactions
  DROP CONSTRAINT IF EXISTS customer_transactions_business_id_fkey,
  ADD CONSTRAINT customer_transactions_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.customer_transactions
  DROP CONSTRAINT IF EXISTS customer_transactions_customer_id_fkey,
  ADD CONSTRAINT customer_transactions_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON DELETE CASCADE;

ALTER TABLE public.customer_transactions
  DROP CONSTRAINT IF EXISTS customer_transactions_created_by_fkey,
  ADD CONSTRAINT customer_transactions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.supplier_transactions
  DROP CONSTRAINT IF EXISTS supplier_transactions_business_id_fkey,
  ADD CONSTRAINT supplier_transactions_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.supplier_transactions
  DROP CONSTRAINT IF EXISTS supplier_transactions_supplier_id_fkey,
  ADD CONSTRAINT supplier_transactions_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
  ON DELETE CASCADE;

ALTER TABLE public.supplier_transactions
  DROP CONSTRAINT IF EXISTS supplier_transactions_created_by_fkey,
  ADD CONSTRAINT supplier_transactions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.43  ai_financial_analysis ─────────────────────────────────────────────

ALTER TABLE public.ai_financial_analysis
  DROP CONSTRAINT IF EXISTS ai_financial_analysis_business_id_fkey,
  ADD CONSTRAINT ai_financial_analysis_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.ai_financial_analysis
  DROP CONSTRAINT IF EXISTS ai_financial_analysis_conversation_id_fkey,
  ADD CONSTRAINT ai_financial_analysis_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id)
  ON DELETE SET NULL;

ALTER TABLE public.ai_financial_analysis
  DROP CONSTRAINT IF EXISTS ai_financial_analysis_created_by_fkey,
  ADD CONSTRAINT ai_financial_analysis_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.44  balance sheet / income / cashflow / equity snapshots ──────────────

ALTER TABLE public.balance_sheet_snapshots
  DROP CONSTRAINT IF EXISTS balance_sheet_snapshots_business_id_fkey,
  ADD CONSTRAINT balance_sheet_snapshots_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.balance_sheet_snapshots
  DROP CONSTRAINT IF EXISTS balance_sheet_snapshots_report_id_fkey,
  ADD CONSTRAINT balance_sheet_snapshots_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES public.financial_reports(id)
  ON DELETE SET NULL;

ALTER TABLE public.balance_sheet_snapshots
  DROP CONSTRAINT IF EXISTS balance_sheet_snapshots_generated_by_fkey,
  ADD CONSTRAINT balance_sheet_snapshots_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.income_statement_snapshots
  DROP CONSTRAINT IF EXISTS income_statement_snapshots_business_id_fkey,
  ADD CONSTRAINT income_statement_snapshots_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.income_statement_snapshots
  DROP CONSTRAINT IF EXISTS income_statement_snapshots_report_id_fkey,
  ADD CONSTRAINT income_statement_snapshots_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES public.financial_reports(id)
  ON DELETE SET NULL;

ALTER TABLE public.income_statement_snapshots
  DROP CONSTRAINT IF EXISTS income_statement_snapshots_generated_by_fkey,
  ADD CONSTRAINT income_statement_snapshots_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.cashflow_snapshots
  DROP CONSTRAINT IF EXISTS cashflow_snapshots_business_id_fkey,
  ADD CONSTRAINT cashflow_snapshots_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.cashflow_snapshots
  DROP CONSTRAINT IF EXISTS cashflow_snapshots_report_id_fkey,
  ADD CONSTRAINT cashflow_snapshots_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES public.financial_reports(id)
  ON DELETE SET NULL;

ALTER TABLE public.cashflow_snapshots
  DROP CONSTRAINT IF EXISTS cashflow_snapshots_generated_by_fkey,
  ADD CONSTRAINT cashflow_snapshots_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.equity_statement_snapshots
  DROP CONSTRAINT IF EXISTS equity_statement_snapshots_business_id_fkey,
  ADD CONSTRAINT equity_statement_snapshots_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.equity_statement_snapshots
  DROP CONSTRAINT IF EXISTS equity_statement_snapshots_report_id_fkey,
  ADD CONSTRAINT equity_statement_snapshots_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES public.financial_reports(id)
  ON DELETE SET NULL;

ALTER TABLE public.equity_statement_snapshots
  DROP CONSTRAINT IF EXISTS equity_statement_snapshots_generated_by_fkey,
  ADD CONSTRAINT equity_statement_snapshots_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── 4.45  payments / subscriptions / invoices (billing system) ──────────────

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_user_id_fkey,
  ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_plan_key_fkey,
  ADD CONSTRAINT payments_plan_key_fkey
  FOREIGN KEY (plan_key) REFERENCES public.pricing_plans(key)
  ON DELETE RESTRICT;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_reviewed_by_fkey,
  ADD CONSTRAINT payments_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey,
  ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_key_fkey,
  ADD CONSTRAINT subscriptions_plan_key_fkey
  FOREIGN KEY (plan_key) REFERENCES public.pricing_plans(key)
  ON DELETE RESTRICT;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_payment_id_fkey,
  ADD CONSTRAINT subscriptions_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments(id)
  ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_business_id_fkey,
  ADD CONSTRAINT subscriptions_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE CASCADE;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_user_id_fkey,
  ADD CONSTRAINT invoices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_subscription_id_fkey,
  ADD CONSTRAINT invoices_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id)
  ON DELETE SET NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_payment_id_fkey,
  ADD CONSTRAINT invoices_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments(id)
  ON DELETE SET NULL;

-- ── 4.46  products ──────────────────────────────────────────────────────────

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_user_id_fkey,
  ADD CONSTRAINT products_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_business_id_fkey,
  ADD CONSTRAINT products_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 5.  VERIFICATION
-- ============================================================================

SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.businesses'::regclass
ORDER BY contype, conname;
