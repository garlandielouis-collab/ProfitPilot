-- ══════════════════════════════════════════════════════════════════════════════
-- PROFITPILOT — COMPLETE PRODUCTION BACKEND SCHEMA v2.0
-- PostgreSQL 15+ | Supabase | Multi-tenant SaaS | Fintech-grade ERP
-- Date: 2026-05-26
-- Architecture: Double-entry Accounting + Inventory ERP + CRM + AI
-- ══════════════════════════════════════════════════════════════════════════════
-- APPLY ORDER: This migration supersedes all prior migrations.
-- Run against a clean Supabase project or carefully diff against existing DB.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- § 0. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- full-text fuzzy search
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- accent-insensitive search (French/Creole)


-- ─────────────────────────────────────────────────────────────────────────────
-- § 1. ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

-- Currency
CREATE TYPE currency_code AS ENUM ('HTG', 'USD');

-- Payment methods accepted in Haiti
CREATE TYPE payment_method_type AS ENUM (
  'Cash', 'MonCash', 'Natcash', 'Card',
  'Virement', 'Chèque', 'Crédit'
);

-- Generic payment / document status
CREATE TYPE payment_status_type AS ENUM (
  'pending',    -- en attente
  'partial',    -- partiellement payé
  'paid',       -- payé
  'credit',     -- à crédit
  'overdue',    -- en retard
  'cancelled',  -- annulé
  'refunded'    -- remboursé
);

-- Business member roles (for access control)
CREATE TYPE member_role_type AS ENUM (
  'owner',              -- full access, cannot be removed
  'admin',              -- full access, manages team
  'accountant',         -- accounting + reports, no sales
  'cashier',            -- POS / sales only
  'inventory_manager',  -- stock management only
  'viewer'              -- read-only
);

-- Double-entry accounting: account classes
CREATE TYPE account_class_type AS ENUM (
  'Asset',            -- Actif
  'Liability',        -- Passif
  'Equity',           -- Capitaux propres
  'Revenue',          -- Revenus
  'Expense',          -- Charges
  'ContraRevenue',    -- Retours de ventes
  'ContraExpense'     -- Remises / avoirs
);

-- Journal entry lifecycle
CREATE TYPE journal_entry_status AS ENUM ('draft', 'posted', 'void');

-- Inventory movement direction
CREATE TYPE inventory_movement_type AS ENUM (
  'purchase_in',      -- stock received from supplier
  'sale_out',         -- stock sold to customer
  'return_in',        -- customer return / supplier return in
  'return_out',       -- sent back to supplier
  'adjustment_in',    -- manual positive adjustment
  'adjustment_out',   -- manual negative adjustment (shrinkage, loss)
  'transfer_in',      -- received from another warehouse
  'transfer_out'      -- sent to another warehouse
);

-- Sales / purchase document status
CREATE TYPE document_status AS ENUM (
  'draft', 'confirmed', 'invoiced', 'partially_paid',
  'paid', 'cancelled', 'refunded'
);

-- Recurring expense frequency
CREATE TYPE recurrence_frequency AS ENUM (
  'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'
);

-- Notification priority
CREATE TYPE notification_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Subscription status
CREATE TYPE subscription_status_type AS ENUM (
  'trialing', 'active', 'past_due', 'cancelled', 'expired', 'paused'
);

-- Report type
CREATE TYPE financial_report_type AS ENUM (
  'income_statement',   -- Compte de résultat
  'balance_sheet',      -- Bilan
  'cashflow',           -- Flux de trésorerie
  'equity_statement',   -- Variations des capitaux propres
  'trial_balance',      -- Balance générale
  'general_ledger',     -- Grand livre
  'tax_report'          -- Déclaration fiscale
);

-- Bank account type
CREATE TYPE bank_account_type AS ENUM (
  'checking',   -- Compte courant
  'savings',    -- Compte épargne
  'petty_cash', -- Petite caisse
  'mobile'      -- MonCash / Natcash wallet
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 2. UTILITY FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE ON LANGUAGE CHOICE:
--   LANGUAGE SQL   → validates table references at CREATE time (compile-time).
--                    Fails if referenced tables don't exist yet.
--   LANGUAGE plpgsql → deferred binding: tables validated only at EXECUTE time.
--                    Safe to define before the tables they reference.
-- fn_is_member / fn_get_role / fn_has_role reference business_members which is
-- created later in § 3, so they MUST use LANGUAGE plpgsql.
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-update updated_at on any table
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Generate unique invoice / PO / reference number (no table deps → LANGUAGE SQL is fine)
CREATE SEQUENCE IF NOT EXISTS global_doc_seq START 100000 INCREMENT 1 NO CYCLE;

CREATE OR REPLACE FUNCTION fn_generate_ref(p_prefix TEXT)
RETURNS TEXT LANGUAGE SQL AS $$
  SELECT p_prefix || '-' || EXTRACT(YEAR FROM NOW())::TEXT
         || '-' || LPAD(nextval('global_doc_seq')::TEXT, 6, '0');
$$;

-- Check if current user is an active member of a business
-- MUST be plpgsql: business_members doesn't exist at § 2 execution time.
CREATE OR REPLACE FUNCTION fn_is_member(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND is_active   = true
      AND deleted_at  IS NULL
  );
END;
$$;

-- Get current user's role in a business
CREATE OR REPLACE FUNCTION fn_get_role(p_business_id UUID)
RETURNS member_role_type LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_role member_role_type;
BEGIN
  SELECT role INTO v_role
  FROM business_members
  WHERE business_id = p_business_id
    AND user_id     = auth.uid()
    AND is_active   = true
    AND deleted_at  IS NULL
  LIMIT 1;
  RETURN v_role;
END;
$$;

-- Check if user has one of the given roles in a business
CREATE OR REPLACE FUNCTION fn_has_role(p_business_id UUID, VARIADIC p_roles member_role_type[])
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND role        = ANY(p_roles)
      AND is_active   = true
      AND deleted_at  IS NULL
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § 3. AUTHENTICATION & BUSINESSES
-- ─────────────────────────────────────────────────────────────────────────────

-- Extended user profile (one per auth.users row)
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT,
  avatar_url   TEXT,
  phone        TEXT,
  language     TEXT        NOT NULL DEFAULT 'fr',        -- fr | ht (Kreyòl)
  timezone     TEXT        NOT NULL DEFAULT 'America/Port-au-Prince',
  onboarded    BOOLEAN     NOT NULL DEFAULT false,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE profiles IS 'Extends auth.users with app-specific user data.';

-- Businesses (tenants)
CREATE TABLE IF NOT EXISTS businesses (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name              TEXT        NOT NULL,
  legal_name        TEXT,
  sector            TEXT,                   -- boutique, restaurant, cosmetics, ...
  description       TEXT,
  logo_url          TEXT,
  website           TEXT,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  city              TEXT,
  country           TEXT        NOT NULL DEFAULT 'Haiti',
  tax_id            TEXT,                   -- NIF / TIN
  default_currency  currency_code NOT NULL DEFAULT 'HTG',
  secondary_currency currency_code,
  exchange_rate     NUMERIC(10,6) NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),
  fiscal_year_start INTEGER     NOT NULL DEFAULT 1 CHECK (fiscal_year_start BETWEEN 1 AND 12),
  timezone          TEXT        NOT NULL DEFAULT 'America/Port-au-Prince',
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  settings          JSONB       NOT NULL DEFAULT '{}',   -- theme, invoice prefix, etc.
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
COMMENT ON TABLE businesses IS 'Core tenant. All data is isolated per business_id.';

-- Business membership (replaces the simple "employees" auth table)
CREATE TABLE IF NOT EXISTS business_members (
  id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID              NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         member_role_type  NOT NULL DEFAULT 'viewer',
  is_active    BOOLEAN           NOT NULL DEFAULT true,
  invited_by   UUID              REFERENCES auth.users(id),
  joined_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (business_id, user_id)
);
COMMENT ON TABLE business_members IS 'Maps users to businesses with roles. Core of RBAC.';

-- Team invitations
CREATE TABLE IF NOT EXISTS invitations (
  id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID              NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email        TEXT              NOT NULL,
  role         member_role_type  NOT NULL DEFAULT 'viewer',
  token        TEXT              NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by   UUID              NOT NULL REFERENCES auth.users(id),
  accepted_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Onboarding state machine
CREATE TABLE IF NOT EXISTS onboarding_states (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  step         TEXT    NOT NULL DEFAULT 'business_info',
  completed    JSONB   NOT NULL DEFAULT '[]',   -- array of completed step keys
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: auto-create profile & owner membership when user signs up
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- § 4. ROLES & PERMISSIONS (Fine-grained)
-- ─────────────────────────────────────────────────────────────────────────────

-- Permission registry (what actions exist in the system)
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,      -- e.g. 'sales.create', 'reports.view'
  module      TEXT NOT NULL,             -- 'sales', 'inventory', 'accounting', ...
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom roles per business (beyond the built-in member_role_type)
CREATE TABLE IF NOT EXISTS custom_roles (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT false,   -- system roles cannot be deleted
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (business_id, name)
);

-- Which permissions each custom role has
CREATE TABLE IF NOT EXISTS custom_role_permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id      UUID NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, permission_id)
);

-- Per-member permission overrides (grant or revoke a specific permission)
CREATE TABLE IF NOT EXISTS member_permission_overrides (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID    NOT NULL REFERENCES business_members(id) ON DELETE CASCADE,
  permission_id UUID    NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted       BOOLEAN NOT NULL DEFAULT true,   -- true = grant, false = revoke
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, permission_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 5. CUSTOMER MANAGEMENT (CRM)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name              TEXT          NOT NULL,
  phone             TEXT,
  email             TEXT,
  whatsapp          TEXT,
  instagram_handle  TEXT,
  address           TEXT,
  city              TEXT,
  tax_id            TEXT,
  credit_limit      NUMERIC(20,4) NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(20,4) NOT NULL DEFAULT 0,  -- denormalized, updated by trigger
  total_purchases   NUMERIC(20,4) NOT NULL DEFAULT 0,    -- lifetime value
  notes             TEXT,
  tags              TEXT[],
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  metadata          JSONB,
  created_by        UUID          REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
COMMENT ON TABLE customers IS 'CRM: customers with credit tracking and lifetime value.';
CREATE INDEX idx_customers_biz     ON customers(business_id);
CREATE INDEX idx_customers_phone   ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_name_trgm ON customers USING gin(name gin_trgm_ops);

-- Customer mailing / delivery addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID    NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL DEFAULT 'Principal',   -- Livraison, Facturation, ...
  address     TEXT    NOT NULL,
  city        TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRM interaction notes
CREATE TABLE IF NOT EXISTS customer_notes (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID    NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  business_id UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  content     TEXT    NOT NULL,
  created_by  UUID    REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 6. SUPPLIER MANAGEMENT
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name                TEXT          NOT NULL,
  legal_name          TEXT,
  phone               TEXT,
  email               TEXT,
  whatsapp            TEXT,
  address             TEXT,
  city                TEXT,
  country             TEXT          DEFAULT 'Haiti',
  tax_id              TEXT,
  payment_terms_days  INTEGER       NOT NULL DEFAULT 0,   -- net-30, net-60, etc.
  default_currency    currency_code NOT NULL DEFAULT 'HTG',
  discount_percent    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(20,4) NOT NULL DEFAULT 0,   -- AP balance (what we owe)
  total_purchased     NUMERIC(20,4) NOT NULL DEFAULT 0,   -- lifetime
  notes               TEXT,
  tags                TEXT[],
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  metadata            JSONB,
  created_by          UUID          REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
COMMENT ON TABLE suppliers IS 'Supplier master with AP balance tracking.';
CREATE INDEX idx_suppliers_biz ON suppliers(business_id);

-- Multiple contacts per supplier
CREATE TABLE IF NOT EXISTS supplier_contacts (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID    NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  role        TEXT,                -- Directeur, Commercial, Comptable, ...
  phone       TEXT,
  email       TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 7. INVENTORY MANAGEMENT
-- ─────────────────────────────────────────────────────────────────────────────

-- Unit of measure (unité de mesure)
CREATE TABLE IF NOT EXISTS units_of_measure (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    REFERENCES businesses(id) ON DELETE CASCADE,  -- NULL = global
  name         TEXT    NOT NULL,   -- Pièce, Kg, Litre, Carton, Boîte, ...
  abbreviation TEXT    NOT NULL,   -- pcs, kg, L, ctn, bx
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product categories (hierarchical)
CREATE TABLE IF NOT EXISTS product_categories (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  parent_id   UUID    REFERENCES product_categories(id) ON DELETE SET NULL,
  name        TEXT    NOT NULL,
  description TEXT,
  color       TEXT,   -- for UI display
  icon        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  UNIQUE (business_id, name, parent_id)
);

-- Warehouses / locations
CREATE TABLE IF NOT EXISTS warehouses (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  address     TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- Products master (SKU catalog)
CREATE TABLE IF NOT EXISTS products (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id       UUID          REFERENCES product_categories(id) ON DELETE SET NULL,
  unit_id           UUID          REFERENCES units_of_measure(id) ON DELETE SET NULL,
  name              TEXT          NOT NULL,
  description       TEXT,
  sku               TEXT,         -- internal SKU
  barcode           TEXT,         -- EAN-13, QR, etc.
  purchase_price    NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  sale_price        NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  currency          currency_code NOT NULL DEFAULT 'HTG',
  tax_rate          NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- % TCA / TVA
  reorder_point     INTEGER       NOT NULL DEFAULT 0,   -- trigger low-stock alert
  reorder_quantity  INTEGER       NOT NULL DEFAULT 0,   -- suggested reorder qty
  track_inventory   BOOLEAN       NOT NULL DEFAULT true,
  allow_backorder   BOOLEAN       NOT NULL DEFAULT false,
  image_url         TEXT,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  tags              TEXT[],
  metadata          JSONB,
  created_by        UUID          REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (business_id, sku) NULLS NOT DISTINCT,
  UNIQUE (business_id, barcode) NULLS NOT DISTINCT
);
COMMENT ON TABLE products IS 'Product / SKU catalog. Stock is tracked per warehouse in warehouse_stock.';
CREATE INDEX idx_products_biz      ON products(business_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_barcode  ON products(barcode) WHERE barcode IS NOT NULL;

-- Product variants (size, color, flavor...)
CREATE TABLE IF NOT EXISTS product_variants (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           TEXT          NOT NULL,   -- "Rouge XL", "500ml"
  sku            TEXT,
  barcode        TEXT,
  purchase_price NUMERIC(20,4),            -- override parent if different
  sale_price     NUMERIC(20,4),
  attributes     JSONB,                    -- {"color":"Rouge","size":"XL"}
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- Stock levels per product per warehouse
CREATE TABLE IF NOT EXISTS warehouse_stock (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  warehouse_id    UUID    NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id      UUID    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID    REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL DEFAULT 0,
  reserved_qty    INTEGER NOT NULL DEFAULT 0,   -- reserved for pending orders
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, product_id, variant_id) NULLS NOT DISTINCT
);
CREATE INDEX idx_wstock_biz     ON warehouse_stock(business_id);
CREATE INDEX idx_wstock_product ON warehouse_stock(product_id);

-- Full audit trail of every stock movement
CREATE TABLE IF NOT EXISTS inventory_movements (
  id               UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID                    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  warehouse_id     UUID                    NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id       UUID                    NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id       UUID                    REFERENCES product_variants(id),
  movement_type    inventory_movement_type NOT NULL,
  quantity         INTEGER                 NOT NULL,   -- positive = in, negative = out
  unit_cost        NUMERIC(20,4),
  total_cost       NUMERIC(20,4),
  currency         currency_code           NOT NULL DEFAULT 'HTG',
  reference_type   TEXT,   -- 'sale', 'purchase', 'adjustment', 'transfer', ...
  reference_id     UUID,   -- FK to the source document
  notes            TEXT,
  created_by       UUID    REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE inventory_movements IS 'Immutable ledger of every stock movement. Never DELETE.';
CREATE INDEX idx_invmov_biz     ON inventory_movements(business_id);
CREATE INDEX idx_invmov_product ON inventory_movements(product_id);
CREATE INDEX idx_invmov_ref     ON inventory_movements(reference_type, reference_id);
CREATE INDEX idx_invmov_date    ON inventory_movements(created_at DESC);

-- Manual stock adjustment records
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  warehouse_id UUID    NOT NULL REFERENCES warehouses(id),
  product_id   UUID    NOT NULL REFERENCES products(id),
  variant_id   UUID    REFERENCES product_variants(id),
  quantity_before INTEGER NOT NULL,
  quantity_after  INTEGER NOT NULL,
  reason       TEXT    NOT NULL,   -- "Pèt", "Inventaire physique", "Vol", ...
  approved_by  UUID    REFERENCES auth.users(id),
  created_by   UUID    REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active low-stock alerts
CREATE TABLE IF NOT EXISTS low_stock_alerts (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id   UUID    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id UUID    REFERENCES warehouses(id),
  current_qty  INTEGER NOT NULL,
  reorder_point INTEGER NOT NULL,
  is_resolved  BOOLEAN NOT NULL DEFAULT false,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- required for trg_updated_at
);
CREATE INDEX idx_lsa_biz     ON low_stock_alerts(business_id);
CREATE INDEX idx_lsa_product ON low_stock_alerts(product_id);
CREATE INDEX idx_lsa_active  ON low_stock_alerts(business_id) WHERE is_resolved = false;


-- ─────────────────────────────────────────────────────────────────────────────
-- § 8. SALES ENGINE (POS + Invoice)
-- ─────────────────────────────────────────────────────────────────────────────

-- Sale header (one per transaction)
CREATE TABLE IF NOT EXISTS sales (
  id               UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  warehouse_id     UUID                 REFERENCES warehouses(id),
  customer_id      UUID                 REFERENCES customers(id) ON DELETE SET NULL,
  customer_name    TEXT,                -- snapshot (client may be anonymous)
  invoice_number   TEXT                 NOT NULL DEFAULT fn_generate_ref('INV'),
  sale_date        DATE                 NOT NULL DEFAULT CURRENT_DATE,
  status           document_status      NOT NULL DEFAULT 'confirmed',
  currency         currency_code        NOT NULL DEFAULT 'HTG',
  exchange_rate    NUMERIC(10,6)        NOT NULL DEFAULT 1.0,
  subtotal_amount  NUMERIC(20,4)        NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(20,4)        NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2)         NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(20,4)        NOT NULL DEFAULT 0,
  total_amount     NUMERIC(20,4)        NOT NULL DEFAULT 0,
  paid_amount      NUMERIC(20,4)        NOT NULL DEFAULT 0,
  balance_due      NUMERIC(20,4)        GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  payment_method   payment_method_type,
  payment_status   payment_status_type  NOT NULL DEFAULT 'pending',
  due_date         DATE,
  notes            TEXT,
  internal_notes   TEXT,
  tags             TEXT[],
  metadata         JSONB,
  created_by       UUID                 REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (business_id, invoice_number)
);
COMMENT ON TABLE sales IS 'Sale header. Line items in sale_items. Payments in sale_payments.';
CREATE INDEX idx_sales_biz          ON sales(business_id);
CREATE INDEX idx_sales_customer     ON sales(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_sales_date         ON sales(sale_date DESC);
CREATE INDEX idx_sales_status       ON sales(business_id, payment_status);
CREATE INDEX idx_sales_invoice      ON sales(invoice_number);
CREATE INDEX idx_sales_created      ON sales(business_id, created_at DESC);

-- Sale line items
CREATE TABLE IF NOT EXISTS sale_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID          NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id      UUID          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id      UUID          REFERENCES product_variants(id),
  product_name    TEXT          NOT NULL,    -- snapshot
  sku             TEXT,
  quantity        INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(20,4) NOT NULL CHECK (unit_price >= 0),
  cost_price      NUMERIC(20,4) NOT NULL DEFAULT 0,   -- COGS snapshot
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
  line_total      NUMERIC(20,4) NOT NULL,   -- (unit_price - discount) * qty + tax
  currency        currency_code NOT NULL DEFAULT 'HTG',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- Sale payments (supports partial and split payments)
CREATE TABLE IF NOT EXISTS sale_payments (
  id             UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        UUID                 NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  business_id    UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount         NUMERIC(20,4)        NOT NULL CHECK (amount > 0),
  currency       currency_code        NOT NULL DEFAULT 'HTG',
  payment_method payment_method_type  NOT NULL,
  payment_date   DATE                 NOT NULL DEFAULT CURRENT_DATE,
  reference      TEXT,               -- MonCash TX ID, bank ref, cheque #, ...
  notes          TEXT,
  received_by    UUID                 REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX idx_sale_payments_biz  ON sale_payments(business_id, payment_date DESC);

-- Sale returns (retours clients)
CREATE TABLE IF NOT EXISTS sale_returns (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id        UUID          NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  return_number  TEXT          NOT NULL DEFAULT fn_generate_ref('RET'),
  return_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
  reason         TEXT          NOT NULL,
  total_amount   NUMERIC(20,4) NOT NULL,
  refund_method  payment_method_type,
  refund_status  payment_status_type NOT NULL DEFAULT 'pending',
  notes          TEXT,
  created_by     UUID          REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id      UUID          NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id   UUID          REFERENCES sale_items(id),
  product_id     UUID          NOT NULL REFERENCES products(id),
  product_name   TEXT          NOT NULL,
  quantity       INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price     NUMERIC(20,4) NOT NULL,
  line_total     NUMERIC(20,4) NOT NULL,
  restock        BOOLEAN       NOT NULL DEFAULT true,   -- put back in inventory?
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 9. PURCHASE ENGINE (Achats fournisseurs)
-- ─────────────────────────────────────────────────────────────────────────────

-- Purchase header
CREATE TABLE IF NOT EXISTS purchases (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id     UUID                 NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id    UUID                 REFERENCES warehouses(id),
  po_number       TEXT                 NOT NULL DEFAULT fn_generate_ref('PO'),
  purchase_date   DATE                 NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  received_date   DATE,
  status          document_status      NOT NULL DEFAULT 'confirmed',
  currency        currency_code        NOT NULL DEFAULT 'HTG',
  exchange_rate   NUMERIC(10,6)        NOT NULL DEFAULT 1.0,
  subtotal_amount NUMERIC(20,4)        NOT NULL DEFAULT 0,
  discount_amount NUMERIC(20,4)        NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(20,4)        NOT NULL DEFAULT 0,
  shipping_cost   NUMERIC(20,4)        NOT NULL DEFAULT 0,
  total_amount    NUMERIC(20,4)        NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(20,4)        NOT NULL DEFAULT 0,
  balance_due     NUMERIC(20,4)        GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  payment_method  payment_method_type,
  payment_status  payment_status_type  NOT NULL DEFAULT 'pending',
  due_date        DATE,
  notes           TEXT,
  metadata        JSONB,
  created_by      UUID                 REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (business_id, po_number)
);
COMMENT ON TABLE purchases IS 'Purchase header. Line items in purchase_items. AP payments in purchase_payments.';
CREATE INDEX idx_purchases_biz      ON purchases(business_id);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_purchases_date     ON purchases(purchase_date DESC);
CREATE INDEX idx_purchases_status   ON purchases(business_id, payment_status);
CREATE INDEX idx_purchases_credit   ON purchases(business_id) WHERE payment_status = 'credit';

-- Purchase line items
CREATE TABLE IF NOT EXISTS purchase_items (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id    UUID          NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id     UUID          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id     UUID          REFERENCES product_variants(id),
  product_name   TEXT          NOT NULL,
  quantity       INTEGER       NOT NULL CHECK (quantity > 0),
  unit_cost      NUMERIC(20,4) NOT NULL CHECK (unit_cost >= 0),
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  tax_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount     NUMERIC(20,4) NOT NULL DEFAULT 0,
  line_total     NUMERIC(20,4) NOT NULL,
  quantity_received INTEGER    NOT NULL DEFAULT 0,
  currency       currency_code NOT NULL DEFAULT 'HTG',
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product  ON purchase_items(product_id);

-- Purchase payments (AP payments)
CREATE TABLE IF NOT EXISTS purchase_payments (
  id             UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id    UUID                 NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  business_id    UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount         NUMERIC(20,4)        NOT NULL CHECK (amount > 0),
  currency       currency_code        NOT NULL DEFAULT 'HTG',
  payment_method payment_method_type  NOT NULL,
  payment_date   DATE                 NOT NULL DEFAULT CURRENT_DATE,
  reference      TEXT,
  notes          TEXT,
  paid_by        UUID                 REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_purchase_payments_purchase ON purchase_payments(purchase_id);
CREATE INDEX idx_purchase_payments_biz      ON purchase_payments(business_id, payment_date DESC);

-- Purchase returns (retours fournisseurs)
CREATE TABLE IF NOT EXISTS purchase_returns (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  purchase_id   UUID          NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  return_number TEXT          NOT NULL DEFAULT fn_generate_ref('PRN'),
  return_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  reason        TEXT          NOT NULL,
  total_amount  NUMERIC(20,4) NOT NULL,
  credit_method payment_method_type,
  status        payment_status_type NOT NULL DEFAULT 'pending',
  notes         TEXT,
  created_by    UUID          REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id     UUID    NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  purchase_item_id UUID REFERENCES purchase_items(id),
  product_id    UUID    NOT NULL REFERENCES products(id),
  product_name  TEXT    NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost     NUMERIC(20,4) NOT NULL,
  line_total    NUMERIC(20,4) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 10. EXPENSE MANAGEMENT
-- ─────────────────────────────────────────────────────────────────────────────

-- Expense categories (hierarchical)
CREATE TABLE IF NOT EXISTS expense_categories (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    REFERENCES businesses(id) ON DELETE CASCADE,  -- NULL = global defaults
  parent_id    UUID    REFERENCES expense_categories(id) ON DELETE SET NULL,
  name         TEXT    NOT NULL,
  description  TEXT,
  account_code TEXT,   -- links to chart_of_accounts.code
  color        TEXT,
  icon         TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT false,   -- built-in categories
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- Expense records
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id     UUID                 REFERENCES expense_categories(id) ON DELETE SET NULL,
  supplier_id     UUID                 REFERENCES suppliers(id) ON DELETE SET NULL,
  expense_number  TEXT                 NOT NULL DEFAULT fn_generate_ref('EXP'),
  expense_date    DATE                 NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT                 NOT NULL,
  amount          NUMERIC(20,4)        NOT NULL CHECK (amount >= 0),
  currency        currency_code        NOT NULL DEFAULT 'HTG',
  payment_method  payment_method_type,
  payment_status  payment_status_type  NOT NULL DEFAULT 'paid',
  is_recurring    BOOLEAN              NOT NULL DEFAULT false,
  recurring_id    UUID,               -- FK to recurring_expenses (circular, set after)
  receipt_url     TEXT,               -- Supabase Storage URL
  notes           TEXT,
  tags            TEXT[],
  metadata        JSONB,
  approved_by     UUID                 REFERENCES auth.users(id),
  created_by      UUID                 REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
COMMENT ON TABLE expenses IS 'Expense records. Supports one-time and recurring expenses.';
CREATE INDEX idx_expenses_biz      ON expenses(business_id);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_date     ON expenses(business_id, expense_date DESC);
CREATE INDEX idx_expenses_supplier ON expenses(supplier_id) WHERE supplier_id IS NOT NULL;

-- Template for auto-generated recurring expenses
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id            UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id   UUID                 REFERENCES expense_categories(id) ON DELETE SET NULL,
  supplier_id   UUID                 REFERENCES suppliers(id) ON DELETE SET NULL,
  description   TEXT                 NOT NULL,
  amount        NUMERIC(20,4)        NOT NULL CHECK (amount > 0),
  currency      currency_code        NOT NULL DEFAULT 'HTG',
  payment_method payment_method_type,
  frequency     recurrence_frequency NOT NULL DEFAULT 'monthly',
  start_date    DATE                 NOT NULL,
  end_date      DATE,
  next_due_date DATE                 NOT NULL,
  last_generated_date DATE,
  is_active     BOOLEAN              NOT NULL DEFAULT true,
  created_by    UUID                 REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

-- Add FK after both tables exist
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS recurring_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- § 11. ACCOUNTING ENGINE (Double-Entry)
-- ─────────────────────────────────────────────────────────────────────────────

-- Fiscal years per business
CREATE TABLE IF NOT EXISTS fiscal_years (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,        -- "Exercice 2026"
  start_date   DATE    NOT NULL,
  end_date     DATE    NOT NULL,
  is_closed    BOOLEAN NOT NULL DEFAULT false,
  closed_at    TIMESTAMPTZ,
  closed_by    UUID    REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_date < end_date),
  UNIQUE (business_id, start_date)
);

-- Accounting periods (monthly within a fiscal year)
CREATE TABLE IF NOT EXISTS accounting_periods (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  fiscal_year_id UUID    NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,       -- "Janvier 2026"
  start_date     DATE    NOT NULL,
  end_date       DATE    NOT NULL,
  is_closed      BOOLEAN NOT NULL DEFAULT false,
  closed_at      TIMESTAMPTZ,
  closed_by      UUID    REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- required for trg_updated_at
  UNIQUE (business_id, start_date)
);

-- Chart of Accounts (Plan Comptable)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id             UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID               NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  parent_id      UUID               REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  code           TEXT               NOT NULL,    -- "5310", "7010", ...
  name           TEXT               NOT NULL,    -- "Caisse HTG", "Ventes de marchandises"
  name_ht        TEXT,                           -- Haitian Creole name
  account_class  account_class_type NOT NULL,
  is_system      BOOLEAN            NOT NULL DEFAULT false,  -- system accounts cannot be deleted
  is_active      BOOLEAN            NOT NULL DEFAULT true,
  description    TEXT,
  created_at     TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,
  UNIQUE (business_id, code)
);
COMMENT ON TABLE chart_of_accounts IS 'Plan Comptable Général (PCG) adapted for Haiti.';
CREATE INDEX idx_coa_biz    ON chart_of_accounts(business_id);
CREATE INDEX idx_coa_code   ON chart_of_accounts(business_id, code);
CREATE INDEX idx_coa_class  ON chart_of_accounts(business_id, account_class);

-- Journal entry header (every financial event)
CREATE TABLE IF NOT EXISTS journal_entries (
  id             UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_id      UUID                 REFERENCES accounting_periods(id),
  entry_number   TEXT                 NOT NULL DEFAULT fn_generate_ref('JE'),
  entry_date     DATE                 NOT NULL DEFAULT CURRENT_DATE,
  reference      TEXT,               -- invoice #, PO #, ...
  reference_type TEXT,               -- 'sale', 'purchase', 'expense', 'manual'
  reference_id   UUID,
  description    TEXT                 NOT NULL,
  status         journal_entry_status NOT NULL DEFAULT 'posted',
  currency       currency_code        NOT NULL DEFAULT 'HTG',
  exchange_rate  NUMERIC(10,6)        NOT NULL DEFAULT 1.0,
  total_debit    NUMERIC(20,4)        NOT NULL DEFAULT 0,
  total_credit   NUMERIC(20,4)        NOT NULL DEFAULT 0,
  is_auto        BOOLEAN              NOT NULL DEFAULT false,   -- generated by trigger
  notes          TEXT,
  created_by     UUID                 REFERENCES auth.users(id),
  voided_by      UUID                 REFERENCES auth.users(id),
  voided_at      TIMESTAMPTZ,
  voided_reason  TEXT,
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, entry_number),
  CHECK (status = 'void' OR ABS(total_debit - total_credit) < 0.001)  -- must balance
);
COMMENT ON TABLE journal_entries IS 'Double-entry journal. Every posted entry must balance (debit = credit).';
CREATE INDEX idx_je_biz       ON journal_entries(business_id);
CREATE INDEX idx_je_date      ON journal_entries(business_id, entry_date DESC);
CREATE INDEX idx_je_ref       ON journal_entries(reference_type, reference_id);
CREATE INDEX idx_je_period    ON journal_entries(period_id);

-- Journal entry lines (the actual debit/credit lines)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID          NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  business_id      UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id       UUID          NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  description      TEXT,
  debit_amount     NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (debit_amount  >= 0),
  credit_amount    NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  currency         currency_code NOT NULL DEFAULT 'HTG',
  exchange_rate    NUMERIC(10,6) NOT NULL DEFAULT 1.0,
  base_debit       NUMERIC(20,4) NOT NULL DEFAULT 0,   -- converted to HTG
  base_credit      NUMERIC(20,4) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  )  -- each line is either debit OR credit, never both
);
CREATE INDEX idx_jel_entry   ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines(account_id);
CREATE INDEX idx_jel_biz     ON journal_entry_lines(business_id);

-- Running account balance (materialized per period — updated by trigger)
CREATE TABLE IF NOT EXISTS account_period_balances (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id   UUID          NOT NULL REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
  period_id    UUID          NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
  opening_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_debit  NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_credit NUMERIC(20,4) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, period_id)
);
CREATE INDEX idx_apb_biz     ON account_period_balances(business_id, period_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 12. BANKING & CASHFLOW
-- ─────────────────────────────────────────────────────────────────────────────

-- Bank and cash accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID               NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id      UUID               REFERENCES chart_of_accounts(id),   -- links to CoA
  name            TEXT               NOT NULL,
  account_type    bank_account_type  NOT NULL DEFAULT 'checking',
  bank_name       TEXT,
  account_number  TEXT,
  currency        currency_code      NOT NULL DEFAULT 'HTG',
  opening_balance NUMERIC(20,4)      NOT NULL DEFAULT 0,
  current_balance NUMERIC(20,4)      NOT NULL DEFAULT 0,   -- updated by trigger
  is_default      BOOLEAN            NOT NULL DEFAULT false,
  is_active       BOOLEAN            NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_bank_accounts_biz ON bank_accounts(business_id);

-- Bank and cash transactions
CREATE TABLE IF NOT EXISTS bank_transactions (
  id               UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bank_account_id  UUID                 NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  transaction_date DATE                 NOT NULL DEFAULT CURRENT_DATE,
  type             TEXT                 NOT NULL,   -- 'credit', 'debit'
  amount           NUMERIC(20,4)        NOT NULL CHECK (amount > 0),
  currency         currency_code        NOT NULL DEFAULT 'HTG',
  description      TEXT                 NOT NULL,
  reference        TEXT,
  reference_type   TEXT,                -- 'sale_payment', 'purchase_payment', 'transfer', ...
  reference_id     UUID,
  balance_after    NUMERIC(20,4),       -- running balance snapshot
  is_reconciled    BOOLEAN              NOT NULL DEFAULT false,
  reconciled_at    TIMESTAMPTZ,
  created_by       UUID                 REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_tx_account ON bank_transactions(bank_account_id);
CREATE INDEX idx_bank_tx_date    ON bank_transactions(business_id, transaction_date DESC);
CREATE INDEX idx_bank_tx_ref     ON bank_transactions(reference_type, reference_id);

-- Cash register sessions (for POS)
CREATE TABLE IF NOT EXISTS cash_registers (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bank_account_id UUID          NOT NULL REFERENCES bank_accounts(id),
  name            TEXT          NOT NULL DEFAULT 'Caisse Principale',
  opened_by       UUID          REFERENCES auth.users(id),
  closed_by       UUID          REFERENCES auth.users(id),
  opening_amount  NUMERIC(20,4) NOT NULL DEFAULT 0,
  expected_amount NUMERIC(20,4),            -- calculated from session sales
  closing_amount  NUMERIC(20,4),            -- actual count at close
  difference      NUMERIC(20,4) GENERATED ALWAYS AS (closing_amount - expected_amount) STORED,
  opened_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()  -- required for trg_updated_at
);

-- Cash movements within a register session
CREATE TABLE IF NOT EXISTS cash_movements (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  register_id     UUID          NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
  type            TEXT          NOT NULL CHECK (type IN ('in', 'out')),
  amount          NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  reason          TEXT          NOT NULL,
  reference_type  TEXT,
  reference_id    UUID,
  created_by      UUID          REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Internal money transfers (cash to bank, warehouse A to warehouse B, ...)
CREATE TABLE IF NOT EXISTS money_transfers (
  id               UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID                NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_account_id  UUID                NOT NULL REFERENCES bank_accounts(id),
  to_account_id    UUID                NOT NULL REFERENCES bank_accounts(id),
  amount           NUMERIC(20,4)       NOT NULL CHECK (amount > 0),
  currency         currency_code       NOT NULL DEFAULT 'HTG',
  transfer_date    DATE                NOT NULL DEFAULT CURRENT_DATE,
  reference        TEXT,
  notes            TEXT,
  status           payment_status_type NOT NULL DEFAULT 'pending',
  created_by       UUID                REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  CHECK (from_account_id <> to_account_id)
);

-- Bank reconciliation records
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bank_account_id  UUID          NOT NULL REFERENCES bank_accounts(id),
  reconciliation_date DATE       NOT NULL,
  statement_balance   NUMERIC(20,4) NOT NULL,
  book_balance        NUMERIC(20,4) NOT NULL,
  difference          NUMERIC(20,4) GENERATED ALWAYS AS (statement_balance - book_balance) STORED,
  is_balanced      BOOLEAN       NOT NULL DEFAULT false,
  notes            TEXT,
  created_by       UUID          REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 13. FINANCIAL STATEMENTS & REPORTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Report generation records
CREATE TABLE IF NOT EXISTS financial_reports (
  id           UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID                  NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  report_type  financial_report_type NOT NULL,
  name         TEXT                  NOT NULL,
  period_start DATE                  NOT NULL,
  period_end   DATE                  NOT NULL,
  currency     currency_code         NOT NULL DEFAULT 'HTG',
  status       TEXT                  NOT NULL DEFAULT 'generating', -- generating, ready, error
  pdf_url      TEXT,                 -- Supabase Storage URL
  data         JSONB,                -- cached report data
  generated_by UUID                  REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reports_biz  ON financial_reports(business_id);
CREATE INDEX idx_reports_type ON financial_reports(business_id, report_type);

-- Point-in-time snapshots (for historical comparisons)
CREATE TABLE IF NOT EXISTS report_snapshots (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  report_id       UUID    REFERENCES financial_reports(id) ON DELETE SET NULL,
  snapshot_date   DATE    NOT NULL,
  snapshot_type   TEXT    NOT NULL,   -- 'income_statement', 'balance_sheet', ...
  data            JSONB   NOT NULL,   -- full report data at this point in time
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 14. AI MODULE (Pilot AI)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_conversations (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT,
  context      JSONB,   -- business context injected at conversation start
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX idx_ai_conv_biz  ON ai_conversations(business_id);
CREATE INDEX idx_ai_conv_user ON ai_conversations(user_id);

CREATE TABLE IF NOT EXISTS ai_messages (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID    NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             TEXT    NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT    NOT NULL,
  tokens_used      INTEGER,
  model            TEXT,    -- claude-3-7-sonnet, etc.
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_msg_conv ON ai_messages(conversation_id);

-- AI-generated business insights (proactive)
CREATE TABLE IF NOT EXISTS ai_insights (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL,   -- 'revenue_trend', 'expense_anomaly', 'stock_risk', ...
  title        TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  severity     notification_priority NOT NULL DEFAULT 'medium',
  data         JSONB,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  valid_until  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_insights_biz    ON ai_insights(business_id);
CREATE INDEX idx_insights_unread ON ai_insights(business_id) WHERE is_read = false;

-- AI-generated recommendations
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category     TEXT    NOT NULL,   -- 'pricing', 'reorder', 'cashflow', 'expense_cut', ...
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  impact       TEXT,               -- expected impact description
  action_url   TEXT,               -- deep link in app
  data         JSONB,
  is_applied   BOOLEAN NOT NULL DEFAULT false,
  applied_at   TIMESTAMPTZ,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 15. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID                  NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      UUID                  REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = all members
  type         TEXT                  NOT NULL,   -- 'low_stock', 'payment_due', 'sale', ...
  title        TEXT                  NOT NULL,
  body         TEXT,
  priority     notification_priority NOT NULL DEFAULT 'medium',
  is_read      BOOLEAN               NOT NULL DEFAULT false,
  read_at      TIMESTAMPTZ,
  action_url   TEXT,
  reference_type TEXT,
  reference_id   UUID,
  metadata     JSONB,
  created_at   TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_biz    ON notifications(business_id, is_read);
CREATE INDEX idx_notif_user   ON notifications(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_notif_date   ON notifications(business_id, created_at DESC);

-- Per-user, per-business notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id         UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  low_stock       BOOLEAN NOT NULL DEFAULT true,
  payment_due     BOOLEAN NOT NULL DEFAULT true,
  new_sale        BOOLEAN NOT NULL DEFAULT false,
  new_purchase    BOOLEAN NOT NULL DEFAULT false,
  new_expense     BOOLEAN NOT NULL DEFAULT false,
  ai_insights     BOOLEAN NOT NULL DEFAULT true,
  weekly_summary  BOOLEAN NOT NULL DEFAULT true,
  push_enabled    BOOLEAN NOT NULL DEFAULT false,
  email_enabled   BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, user_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 16. SUBSCRIPTIONS & BILLING
-- ─────────────────────────────────────────────────────────────────────────────

-- Plan definitions (managed by ProfitPilot, not per-business)
CREATE TABLE IF NOT EXISTS plans (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT    NOT NULL UNIQUE,  -- 'Ti Machann', 'Business Pilot', 'Expert'
  description         TEXT,
  price_htg           NUMERIC(20,4) NOT NULL DEFAULT 0,
  price_usd           NUMERIC(20,4) NOT NULL DEFAULT 0,
  billing_cycle       TEXT    NOT NULL DEFAULT 'monthly',   -- monthly, annually
  max_users           INTEGER NOT NULL DEFAULT 1,
  max_products        INTEGER NOT NULL DEFAULT 100,
  max_sales_per_month INTEGER,                  -- NULL = unlimited
  features            JSONB   NOT NULL DEFAULT '[]',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  is_public           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business subscriptions
CREATE TABLE IF NOT EXISTS business_subscriptions (
  id              UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID                      NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id         UUID                      NOT NULL REFERENCES plans(id),
  status          subscription_status_type  NOT NULL DEFAULT 'trialing',
  currency        currency_code             NOT NULL DEFAULT 'HTG',
  price           NUMERIC(20,4)             NOT NULL DEFAULT 0,
  trial_ends_at   TIMESTAMPTZ,
  current_period_start DATE                 NOT NULL DEFAULT CURRENT_DATE,
  current_period_end   DATE                 NOT NULL,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

-- Billing invoices (ProfitPilot charges to the business)
CREATE TABLE IF NOT EXISTS billing_invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subscription_id UUID          NOT NULL REFERENCES business_subscriptions(id),
  invoice_number  TEXT          NOT NULL DEFAULT fn_generate_ref('BIL'),
  period_start    DATE          NOT NULL,
  period_end      DATE          NOT NULL,
  amount          NUMERIC(20,4) NOT NULL,
  currency        currency_code NOT NULL DEFAULT 'HTG',
  status          payment_status_type NOT NULL DEFAULT 'pending',
  due_date        DATE          NOT NULL,
  paid_at         TIMESTAMPTZ,
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Billing payments
CREATE TABLE IF NOT EXISTS billing_payments (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID                 NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id      UUID                 NOT NULL REFERENCES billing_invoices(id),
  amount          NUMERIC(20,4)        NOT NULL,
  currency        currency_code        NOT NULL DEFAULT 'HTG',
  payment_method  payment_method_type  NOT NULL,
  payment_date    DATE                 NOT NULL DEFAULT CURRENT_DATE,
  reference       TEXT,                -- MonCash TXN ID, bank ref, ...
  status          TEXT                 NOT NULL DEFAULT 'completed',
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 17. FILE STORAGE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uploads (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  uploaded_by  UUID    REFERENCES auth.users(id),
  bucket       TEXT    NOT NULL,         -- Supabase bucket name
  path         TEXT    NOT NULL,         -- path within bucket
  url          TEXT    NOT NULL,         -- public or signed URL
  filename     TEXT    NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  reference_type TEXT,                   -- 'expense_receipt', 'product_image', 'invoice_pdf', ...
  reference_id   UUID,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX idx_uploads_biz ON uploads(business_id);
CREATE INDEX idx_uploads_ref ON uploads(reference_type, reference_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 18. ANALYTICS VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- Dashboard KPI view
CREATE OR REPLACE VIEW v_dashboard_kpi AS
WITH
  rev_month AS (
    SELECT business_id, SUM(total_amount) AS revenue
    FROM sales
    WHERE deleted_at IS NULL
      AND sale_date >= DATE_TRUNC('month', CURRENT_DATE)
      AND payment_status != 'cancelled'
    GROUP BY business_id
  ),
  exp_month AS (
    SELECT business_id, SUM(amount) AS expenses
    FROM expenses
    WHERE deleted_at IS NULL
      AND expense_date >= DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY business_id
  ),
  rev_year AS (
    SELECT business_id, SUM(total_amount) AS revenue
    FROM sales
    WHERE deleted_at IS NULL
      AND sale_date >= DATE_TRUNC('year', CURRENT_DATE)
      AND payment_status != 'cancelled'
    GROUP BY business_id
  ),
  exp_year AS (
    SELECT business_id, SUM(amount) AS expenses
    FROM expenses
    WHERE deleted_at IS NULL
      AND expense_date >= DATE_TRUNC('year', CURRENT_DATE)
    GROUP BY business_id
  )
SELECT
  COALESCE(rm.business_id, em.business_id) AS business_id,
  COALESCE(rm.revenue,  0)                   AS revenue_this_month,
  COALESCE(em.expenses, 0)                   AS expenses_this_month,
  COALESCE(rm.revenue,0) - COALESCE(em.expenses,0) AS profit_this_month,
  COALESCE(ry.revenue,  0)                   AS revenue_this_year,
  COALESCE(ey.expenses, 0)                   AS expenses_this_year,
  COALESCE(ry.revenue,0) - COALESCE(ey.expenses,0) AS profit_this_year
FROM rev_month rm
FULL JOIN exp_month em USING (business_id)
FULL JOIN rev_year  ry USING (business_id)
FULL JOIN exp_year  ey USING (business_id);

-- Top products by revenue
CREATE OR REPLACE VIEW v_top_products AS
SELECT
  si.business_id,
  si.product_id,
  si.product_name,
  SUM(si.quantity)   AS total_units_sold,
  SUM(si.line_total) AS total_revenue,
  SUM(si.quantity * si.cost_price) AS total_cogs,
  SUM(si.line_total) - SUM(si.quantity * si.cost_price) AS gross_profit,
  COUNT(DISTINCT s.id) AS nb_orders
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.deleted_at IS NULL
  AND s.payment_status != 'cancelled'
GROUP BY si.business_id, si.product_id, si.product_name;

-- Customer ranking by lifetime value
CREATE OR REPLACE VIEW v_customer_rankings AS
SELECT
  s.business_id,
  s.customer_id,
  s.customer_name,
  COUNT(DISTINCT s.id)  AS total_orders,
  SUM(s.total_amount)   AS lifetime_value,
  AVG(s.total_amount)   AS avg_order_value,
  MAX(s.sale_date)      AS last_purchase_date,
  SUM(s.balance_due)    AS outstanding_balance
FROM sales s
WHERE s.deleted_at IS NULL
  AND s.customer_id IS NOT NULL
  AND s.payment_status != 'cancelled'
GROUP BY s.business_id, s.customer_id, s.customer_name;

-- Supplier debt summary
CREATE OR REPLACE VIEW v_supplier_debt_summary AS
SELECT
  p.business_id,
  p.supplier_id,
  su.name         AS supplier_name,
  su.phone        AS supplier_phone,
  COUNT(p.id)     AS nb_open_orders,
  SUM(p.balance_due) AS total_owed,
  MIN(p.purchase_date) AS oldest_debt_date,
  MAX(p.due_date) AS next_due_date
FROM purchases p
JOIN suppliers su ON su.id = p.supplier_id
WHERE p.deleted_at IS NULL
  AND p.payment_status IN ('credit', 'partial', 'pending')
GROUP BY p.business_id, p.supplier_id, su.name, su.phone;

-- Stock valuation per warehouse
CREATE OR REPLACE VIEW v_stock_valuation AS
SELECT
  ws.business_id,
  ws.warehouse_id,
  w.name         AS warehouse_name,
  ws.product_id,
  p.name         AS product_name,
  p.sku,
  p.category_id,
  ws.quantity,
  ws.reserved_qty,
  p.purchase_price,
  p.sale_price,
  p.currency,
  ws.quantity * p.purchase_price AS inventory_cost_value,
  ws.quantity * p.sale_price     AS inventory_retail_value,
  p.reorder_point,
  CASE WHEN ws.quantity <= p.reorder_point THEN true ELSE false END AS is_low_stock
FROM warehouse_stock ws
JOIN products   p ON p.id = ws.product_id
JOIN warehouses w ON w.id = ws.warehouse_id
WHERE p.deleted_at IS NULL
  AND p.track_inventory = true;

-- Monthly P&L aggregated
CREATE OR REPLACE VIEW v_monthly_pnl AS
SELECT
  s.business_id,
  DATE_TRUNC('month', s.sale_date) AS period_month,
  COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_status != 'cancelled'), 0) AS revenue,
  COALESCE((
    SELECT SUM(e.amount)
    FROM expenses e
    WHERE e.business_id = s.business_id
      AND DATE_TRUNC('month', e.expense_date::TIMESTAMPTZ) = DATE_TRUNC('month', s.sale_date::TIMESTAMPTZ)
      AND e.deleted_at IS NULL
  ), 0) AS expenses,
  COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_status != 'cancelled'), 0)
    - COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.business_id = s.business_id
          AND DATE_TRUNC('month', e.expense_date::TIMESTAMPTZ) = DATE_TRUNC('month', s.sale_date::TIMESTAMPTZ)
          AND e.deleted_at IS NULL
      ), 0) AS net_profit
FROM sales s
WHERE s.deleted_at IS NULL
GROUP BY s.business_id, DATE_TRUNC('month', s.sale_date);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 19. TRIGGERS — updated_at automation (applied to ALL tables with that column)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Apply updated_at trigger to every table that has the updated_at column ───
-- IMPORTANT: Only list tables that define `updated_at TIMESTAMPTZ`.
-- Adding a table here that lacks updated_at will NOT error at creation time
-- (plpgsql is deferred) but WILL error at runtime on first UPDATE.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- § 3  Auth & Businesses
    'profiles', 'businesses', 'business_members', 'invitations', 'onboarding_states',
    -- § 4  Roles
    'custom_roles',
    -- § 5  CRM
    'customers', 'customer_addresses', 'customer_notes',
    -- § 6  Suppliers
    'suppliers', 'supplier_contacts',
    -- § 7  Inventory
    'product_categories', 'products', 'product_variants',
    'warehouses', 'warehouse_stock', 'low_stock_alerts',
    -- § 8  Sales
    'sales', 'sale_returns',
    -- § 9  Purchases
    'purchases', 'purchase_returns',
    -- § 10 Expenses
    'expenses', 'recurring_expenses',
    -- § 11 Accounting
    'fiscal_years', 'accounting_periods', 'chart_of_accounts',
    'journal_entries', 'account_period_balances',
    -- § 12 Banking
    'bank_accounts', 'cash_registers', 'money_transfers', 'bank_reconciliations',
    -- § 13 Reports
    'financial_reports',
    -- § 14 AI
    'ai_conversations',
    -- § 15 Notifications
    'notification_preferences',
    -- § 16 Billing
    'plans', 'business_subscriptions', 'billing_invoices'
    -- Intentionally excluded (created_at only, immutable ledgers):
    --   inventory_movements, stock_adjustments, sale_items, sale_payments,
    --   sale_return_items, purchase_items, purchase_payments, purchase_return_items,
    --   customer_notes (has updated_at ✓ — listed above),
    --   ai_messages, ai_insights, ai_recommendations,
    --   notifications, billing_payments, uploads, cash_movements, bank_transactions,
    --   member_permission_overrides, custom_role_permissions, invitations (*already above)
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at_%1$s ON %2$I;
       CREATE TRIGGER trg_updated_at_%1$s
         BEFORE UPDATE ON %2$I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;

-- ── Inventory movement trigger: update warehouse_stock on every movement ──────
CREATE OR REPLACE FUNCTION fn_apply_inventory_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO warehouse_stock (business_id, warehouse_id, product_id, variant_id, quantity)
  VALUES (NEW.business_id, NEW.warehouse_id, NEW.product_id, NEW.variant_id, NEW.quantity)
  ON CONFLICT (warehouse_id, product_id, variant_id) DO UPDATE
    SET quantity   = warehouse_stock.quantity + NEW.quantity,
        updated_at = NOW();

  -- Raise a low-stock alert if needed
  IF NEW.quantity < 0 THEN
    INSERT INTO low_stock_alerts (business_id, product_id, warehouse_id, current_qty, reorder_point)
    SELECT NEW.business_id, NEW.product_id, NEW.warehouse_id,
           ws.quantity, p.reorder_point
    FROM warehouse_stock ws
    JOIN products p ON p.id = NEW.product_id
    WHERE ws.warehouse_id = NEW.warehouse_id
      AND ws.product_id   = NEW.product_id
      AND ws.quantity <= p.reorder_point
      AND p.reorder_point > 0
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_movement
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION fn_apply_inventory_movement();

-- ── Sale trigger: decrement stock + record inventory movement ─────────────────
CREATE OR REPLACE FUNCTION fn_on_sale_item_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_warehouse_id UUID;
  v_business_id  UUID;
BEGIN
  -- Get warehouse from sale header
  SELECT warehouse_id, business_id INTO v_warehouse_id, v_business_id
  FROM sales WHERE id = NEW.sale_id;

  IF v_warehouse_id IS NULL THEN
    -- Use default warehouse
    SELECT id INTO v_warehouse_id FROM warehouses
    WHERE business_id = v_business_id AND is_default = true LIMIT 1;
  END IF;

  IF v_warehouse_id IS NOT NULL THEN
    INSERT INTO inventory_movements (
      business_id, warehouse_id, product_id, variant_id,
      movement_type, quantity, unit_cost, total_cost, currency,
      reference_type, reference_id, created_by
    )
    SELECT
      v_business_id, v_warehouse_id, NEW.product_id, NEW.variant_id,
      'sale_out', -NEW.quantity, NEW.cost_price, NEW.cost_price * NEW.quantity,
      NEW.currency, 'sale_item', NEW.id, s.created_by
    FROM sales s WHERE s.id = NEW.sale_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_item_stock
  AFTER INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION fn_on_sale_item_insert();

-- ── Sale payment trigger: update sale paid_amount + payment_status ────────────
CREATE OR REPLACE FUNCTION fn_on_sale_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total      NUMERIC;
  v_paid       NUMERIC;
  v_new_status payment_status_type;
BEGIN
  SELECT total_amount INTO v_total FROM sales WHERE id = NEW.sale_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM sale_payments WHERE sale_id = NEW.sale_id;

  v_new_status := CASE
    WHEN v_paid <= 0           THEN 'pending'
    WHEN v_paid < v_total      THEN 'partial'
    WHEN v_paid >= v_total     THEN 'paid'
    ELSE 'pending'
  END;

  UPDATE sales
  SET paid_amount    = v_paid,
      payment_status = v_new_status,
      updated_at     = NOW()
  WHERE id = NEW.sale_id;

  -- Update customer outstanding balance
  UPDATE customers c
  SET outstanding_balance = (
    SELECT COALESCE(SUM(balance_due), 0)
    FROM sales s
    WHERE s.customer_id = c.id
      AND s.payment_status IN ('credit','partial','pending','overdue')
      AND s.deleted_at IS NULL
  )
  WHERE id = (SELECT customer_id FROM sales WHERE id = NEW.sale_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_payment_update
  AFTER INSERT ON sale_payments
  FOR EACH ROW EXECUTE FUNCTION fn_on_sale_payment();

-- ── Purchase payment trigger: update purchase paid_amount + AP balance ────────
CREATE OR REPLACE FUNCTION fn_on_purchase_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total  NUMERIC;
  v_paid   NUMERIC;
  v_status payment_status_type;
BEGIN
  SELECT total_amount INTO v_total FROM purchases WHERE id = NEW.purchase_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM purchase_payments WHERE purchase_id = NEW.purchase_id;

  v_status := CASE
    WHEN v_paid <= 0       THEN 'pending'
    WHEN v_paid < v_total  THEN 'partial'
    WHEN v_paid >= v_total THEN 'paid'
    ELSE 'pending'
  END;

  UPDATE purchases
  SET paid_amount    = v_paid,
      payment_status = v_status,
      updated_at     = NOW()
  WHERE id = NEW.purchase_id;

  -- Update supplier outstanding AP
  UPDATE suppliers s
  SET outstanding_balance = (
    SELECT COALESCE(SUM(balance_due), 0)
    FROM purchases p
    WHERE p.supplier_id = s.id
      AND p.payment_status IN ('credit','partial','pending','overdue')
      AND p.deleted_at IS NULL
  )
  WHERE id = (SELECT supplier_id FROM purchases WHERE id = NEW.purchase_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_payment_update
  AFTER INSERT ON purchase_payments
  FOR EACH ROW EXECUTE FUNCTION fn_on_purchase_payment();

-- ── Auto journal entry on confirmed sale ──────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_journal_sale()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_id    UUID;
  v_je_id        UUID;
  v_cash_acct    UUID;
  v_recv_acct    UUID;
  v_rev_acct     UUID;
BEGIN
  IF NEW.status NOT IN ('confirmed','invoiced','paid') THEN RETURN NEW; END IF;

  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = NEW.business_id
    AND start_date <= NEW.sale_date AND end_date >= NEW.sale_date
    AND is_closed = false LIMIT 1;

  IF v_period_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve accounts from chart_of_accounts
  SELECT id INTO v_rev_acct  FROM chart_of_accounts WHERE business_id = NEW.business_id AND code = '7010';
  SELECT id INTO v_recv_acct FROM chart_of_accounts WHERE business_id = NEW.business_id AND code = '4110';

  -- Cash account depends on payment method
  SELECT id INTO v_cash_acct FROM chart_of_accounts
  WHERE business_id = NEW.business_id
    AND code = CASE NEW.payment_method
                 WHEN 'Cash'     THEN '5310'
                 WHEN 'MonCash'  THEN '5121'
                 WHEN 'Natcash'  THEN '5122'
                 WHEN 'Card'     THEN '5123'
                 WHEN 'Virement' THEN '5110'
                 ELSE '4110' END;  -- default to receivable

  INSERT INTO journal_entries (
    business_id, period_id, entry_date, reference, reference_type, reference_id,
    description, status, currency, total_debit, total_credit, is_auto, created_by
  ) VALUES (
    NEW.business_id, v_period_id, NEW.sale_date,
    NEW.invoice_number, 'sale', NEW.id,
    'Vente - ' || NEW.invoice_number, 'posted',
    NEW.currency, NEW.total_amount, NEW.total_amount, true, NEW.created_by
  ) RETURNING id INTO v_je_id;

  -- DR Cash / Receivable
  INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, description, debit_amount, credit_amount, currency)
  VALUES (v_je_id, NEW.business_id, COALESCE(v_cash_acct, v_recv_acct), 'Encaissement vente', NEW.total_amount, 0, NEW.currency);

  -- CR Revenue
  INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, description, debit_amount, credit_amount, currency)
  VALUES (v_je_id, NEW.business_id, v_rev_acct, 'Revenus de vente', 0, NEW.total_amount, NEW.currency);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_journal_sale
  AFTER INSERT OR UPDATE OF status ON sales
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_sale();

-- ── Auto journal entry on expense ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_journal_expense()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_id  UUID;
  v_je_id      UUID;
  v_exp_acct   UUID;
  v_cash_acct  UUID;
  v_ap_acct    UUID;
BEGIN
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE business_id = NEW.business_id
    AND start_date <= NEW.expense_date AND end_date >= NEW.expense_date
    AND is_closed = false LIMIT 1;

  IF v_period_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve expense account from category or default
  SELECT coa.id INTO v_exp_acct
  FROM chart_of_accounts coa
  JOIN expense_categories ec ON ec.account_code = coa.code AND ec.business_id = NEW.business_id
  WHERE ec.id = NEW.category_id LIMIT 1;

  IF v_exp_acct IS NULL THEN
    SELECT id INTO v_exp_acct FROM chart_of_accounts
    WHERE business_id = NEW.business_id AND code = '6500' LIMIT 1; -- Default: Other expenses
  END IF;

  SELECT id INTO v_cash_acct FROM chart_of_accounts WHERE business_id = NEW.business_id AND code = '5310';
  SELECT id INTO v_ap_acct   FROM chart_of_accounts WHERE business_id = NEW.business_id AND code = '4010';

  INSERT INTO journal_entries (
    business_id, period_id, entry_date, reference_type, reference_id,
    description, status, currency, total_debit, total_credit, is_auto, created_by
  ) VALUES (
    NEW.business_id, v_period_id, NEW.expense_date, 'expense', NEW.id,
    'Dépense - ' || NEW.description, 'posted',
    NEW.currency, NEW.amount, NEW.amount, true, NEW.created_by
  ) RETURNING id INTO v_je_id;

  -- DR Expense account
  INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, description, debit_amount, credit_amount, currency)
  VALUES (v_je_id, NEW.business_id, v_exp_acct, NEW.description, NEW.amount, 0, NEW.currency);

  -- CR Cash or AP depending on payment status
  INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, description, debit_amount, credit_amount, currency)
  VALUES (v_je_id, NEW.business_id,
    CASE WHEN NEW.payment_status = 'credit' THEN v_ap_acct ELSE v_cash_acct END,
    'Règlement dépense', 0, NEW.amount, NEW.currency);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_journal_expense
  AFTER INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION fn_auto_journal_expense();


-- ─────────────────────────────────────────────────────────────────────────────
-- § 20. ROW LEVEL SECURITY — All Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on every table
ALTER TABLE profiles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_states           ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_role_permissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE units_of_measure            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stock             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE low_stock_alerts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_returns                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_years                ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_period_balances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_registers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_transfers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_snapshots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads                     ENABLE ROW LEVEL SECURITY;

-- ── Profiles: own record only ─────────────────────────────────────────────────
CREATE POLICY "profiles: own" ON profiles FOR ALL USING (id = auth.uid());

-- ── Businesses: owner sees own; members see their business ────────────────────
CREATE POLICY "businesses: member access" ON businesses FOR SELECT
  USING (fn_is_member(id));
CREATE POLICY "businesses: owner manages" ON businesses FOR ALL
  USING (owner_id = auth.uid());

-- ── Business members: members see team, owners/admins manage ─────────────────
CREATE POLICY "members: see team" ON business_members FOR SELECT
  USING (fn_is_member(business_id));
CREATE POLICY "members: admin manages" ON business_members FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin'));

-- ── Invitations ───────────────────────────────────────────────────────────────
CREATE POLICY "invitations: admin manages" ON invitations FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin'));
CREATE POLICY "invitations: see own token" ON invitations FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- ── Core data tables: members can read, roles restrict writes ─────────────────
-- Pattern macro: member SELECT, cashier/above INSERT, admin DELETE (with soft delete)

-- Customers
CREATE POLICY "customers: member read" ON customers FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "customers: cashier write" ON customers FOR INSERT WITH CHECK (fn_is_member(business_id));
CREATE POLICY "customers: admin update"  ON customers FOR UPDATE USING (fn_is_member(business_id));
CREATE POLICY "customers: admin delete"  ON customers FOR DELETE USING (fn_has_role(business_id,'owner','admin'));

-- Suppliers
CREATE POLICY "suppliers: member read" ON suppliers FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "suppliers: admin write"  ON suppliers FOR INSERT WITH CHECK (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "suppliers: admin update" ON suppliers FOR UPDATE USING (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "suppliers: admin delete" ON suppliers FOR DELETE USING (fn_has_role(business_id,'owner','admin'));

-- Products
CREATE POLICY "products: member read"   ON products FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "products: inv mgr write" ON products FOR INSERT WITH CHECK (fn_has_role(business_id,'owner','admin','inventory_manager'));
CREATE POLICY "products: inv mgr update"ON products FOR UPDATE USING (fn_has_role(business_id,'owner','admin','inventory_manager'));
CREATE POLICY "products: admin delete"  ON products FOR DELETE USING (fn_has_role(business_id,'owner','admin'));

-- Sales: cashiers create, everyone reads
CREATE POLICY "sales: member read"     ON sales FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "sales: cashier create"  ON sales FOR INSERT WITH CHECK (fn_is_member(business_id));
CREATE POLICY "sales: admin update"    ON sales FOR UPDATE USING (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "sales: admin delete"    ON sales FOR DELETE USING (fn_has_role(business_id,'owner','admin'));

-- Sale items follow the parent sale policy
CREATE POLICY "sale_items: member read"   ON sale_items FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "sale_items: cashier write" ON sale_items FOR INSERT WITH CHECK (fn_is_member(business_id));

-- Sale payments
CREATE POLICY "sale_payments: member read" ON sale_payments FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "sale_payments: cashier add" ON sale_payments FOR INSERT WITH CHECK (fn_is_member(business_id));

-- Purchases: admin/accountant only
CREATE POLICY "purchases: member read"    ON purchases FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "purchases: admin write"    ON purchases FOR INSERT WITH CHECK (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "purchases: admin update"   ON purchases FOR UPDATE USING (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "purchases: admin delete"   ON purchases FOR DELETE USING (fn_has_role(business_id,'owner','admin'));

CREATE POLICY "purchase_items: member read"  ON purchase_items FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "purchase_items: admin write"  ON purchase_items FOR INSERT WITH CHECK (fn_has_role(business_id,'owner','admin','accountant'));

CREATE POLICY "purchase_payments: member read" ON purchase_payments FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "purchase_payments: admin write" ON purchase_payments FOR INSERT WITH CHECK (fn_has_role(business_id,'owner','admin','accountant'));

-- Expenses: admin/accountant
CREATE POLICY "expenses: member read"    ON expenses FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "expenses: admin write"    ON expenses FOR INSERT WITH CHECK (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "expenses: admin update"   ON expenses FOR UPDATE USING (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "expenses: admin delete"   ON expenses FOR DELETE USING (fn_has_role(business_id,'owner','admin'));

-- Accounting: accountant + admin
CREATE POLICY "coa: member read"        ON chart_of_accounts FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "coa: admin manage"       ON chart_of_accounts FOR ALL USING (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "je: accountant read"     ON journal_entries FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "je: accountant manage"   ON journal_entries FOR ALL USING (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "jel: accountant read"    ON journal_entry_lines FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "jel: accountant manage"  ON journal_entry_lines FOR ALL USING (fn_has_role(business_id,'owner','admin','accountant'));

-- Banking
CREATE POLICY "bank: admin manage" ON bank_accounts    FOR ALL USING (fn_has_role(business_id,'owner','admin','accountant'));
CREATE POLICY "bank_tx: admin"     ON bank_transactions FOR ALL USING (fn_has_role(business_id,'owner','admin','accountant'));

-- Inventory movements: read for members, write via triggers
CREATE POLICY "invmov: member read"  ON inventory_movements FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "invmov: system write" ON inventory_movements FOR INSERT WITH CHECK (fn_is_member(business_id));

-- Warehouse stock
CREATE POLICY "wstock: member read"  ON warehouse_stock FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "wstock: system write" ON warehouse_stock FOR ALL   USING (fn_is_member(business_id));

-- Notifications
CREATE POLICY "notif: own"   ON notifications FOR SELECT USING (
  fn_is_member(business_id) AND (user_id IS NULL OR user_id = auth.uid())
);
CREATE POLICY "notif: update read" ON notifications FOR UPDATE USING (
  fn_is_member(business_id) AND (user_id IS NULL OR user_id = auth.uid())
);

-- Financial reports
CREATE POLICY "reports: member read"  ON financial_reports FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "reports: admin manage" ON financial_reports FOR ALL   USING (fn_has_role(business_id,'owner','admin','accountant'));

-- AI features
CREATE POLICY "ai_conv: own"       ON ai_conversations FOR ALL USING (user_id = auth.uid() AND fn_is_member(business_id));
CREATE POLICY "ai_msg: own"        ON ai_messages      FOR ALL USING (
  conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = auth.uid())
);
CREATE POLICY "ai_insights: member"ON ai_insights      FOR SELECT USING (fn_is_member(business_id));

-- Subscriptions & billing
CREATE POLICY "sub: owner manage"  ON business_subscriptions FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
);
CREATE POLICY "billing_inv: owner" ON billing_invoices FOR SELECT USING (fn_is_member(business_id));

-- Uploads
CREATE POLICY "uploads: member read"  ON uploads FOR SELECT USING (fn_is_member(business_id));
CREATE POLICY "uploads: member write" ON uploads FOR INSERT WITH CHECK (fn_is_member(business_id));
CREATE POLICY "uploads: owner delete" ON uploads FOR DELETE USING (fn_has_role(business_id,'owner','admin'));

-- Plans are public
CREATE POLICY "plans: public read" ON plans FOR SELECT USING (is_public = true AND is_active = true);


-- ─────────────────────────────────────────────────────────────────────────────
-- § 21. SEED DATA
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Global units of measure ───────────────────────────────────────────────────
INSERT INTO units_of_measure (id, business_id, name, abbreviation) VALUES
  (gen_random_uuid(), NULL, 'Pièce',   'pcs'),
  (gen_random_uuid(), NULL, 'Carton',  'ctn'),
  (gen_random_uuid(), NULL, 'Boîte',   'bx'),
  (gen_random_uuid(), NULL, 'Sac',     'sac'),
  (gen_random_uuid(), NULL, 'Litre',   'L'),
  (gen_random_uuid(), NULL, 'Kg',      'kg'),
  (gen_random_uuid(), NULL, 'Gramme',  'g'),
  (gen_random_uuid(), NULL, 'Mètre',   'm'),
  (gen_random_uuid(), NULL, 'Paire',   'pr'),
  (gen_random_uuid(), NULL, 'Douzaine','dz')
ON CONFLICT DO NOTHING;

-- ── Global expense categories ─────────────────────────────────────────────────
INSERT INTO expense_categories (id, business_id, name, account_code, color, is_system) VALUES
  (gen_random_uuid(), NULL, 'Achats marchandises',  '6010', '#3B82F6', true),
  (gen_random_uuid(), NULL, 'Salaires & Personnel', '6410', '#10B981', true),
  (gen_random_uuid(), NULL, 'Loyer & Local',        '6130', '#F59E0B', true),
  (gen_random_uuid(), NULL, 'Électricité & Eau',    '6160', '#EF4444', true),
  (gen_random_uuid(), NULL, 'Transport',             '6240', '#8B5CF6', true),
  (gen_random_uuid(), NULL, 'Marketing & Pub',      '6230', '#EC4899', true),
  (gen_random_uuid(), NULL, 'Matériel & Fournitures','6220',  '#14B8A6', true),
  (gen_random_uuid(), NULL, 'Frais bancaires',       '6270', '#F97316', true),
  (gen_random_uuid(), NULL, 'Téléphone & Internet',  '6260', '#6366F1', true),
  (gen_random_uuid(), NULL, 'Maintenance & Réparations','6150','#84CC16', true),
  (gen_random_uuid(), NULL, 'Impôts & Taxes',        '6350', '#DC2626', true),
  (gen_random_uuid(), NULL, 'Assurances',            '6160', '#0891B2', true),
  (gen_random_uuid(), NULL, 'Autres charges',        '6500', '#9CA3AF', true)
ON CONFLICT DO NOTHING;

-- ── Subscription plans ────────────────────────────────────────────────────────
INSERT INTO plans (name, description, price_htg, price_usd, max_users, max_products, features, sort_order) VALUES
  (
    'Ti Machann',
    'Pafè pou ti komès ki kòmanse — vant, stock, depans',
    1500, 15, 1, 100,
    '["POS Sales","Stock Management","Basic Expenses","1 Warehouse","WhatsApp Invoice"]',
    1
  ),
  (
    'Business Pilot',
    'Pou komès k ap grandi — rapò, kliyan, founisè, ekip',
    4500, 45, 5, 1000,
    '["Everything in Ti Machann","Full CRM","Supplier Management","Team (5 users)","Financial Reports","Pilot AI Basic","Multi-warehouse"]',
    2
  ),
  (
    'Expert',
    'ERP konplè — kontabilite, multi-biznis, AI avanse',
    9500, 95, NULL, NULL,
    '["Everything in Business Pilot","Double-Entry Accounting","Multi-business","Unlimited Users","Advanced AI (Pilot AI Pro)","API Access","Priority Support","Custom Reports"]',
    3
  )
ON CONFLICT (name) DO UPDATE SET
  price_htg = EXCLUDED.price_htg,
  price_usd = EXCLUDED.price_usd,
  features  = EXCLUDED.features;

-- ── Permission registry ───────────────────────────────────────────────────────
INSERT INTO permissions (code, module, description) VALUES
  ('sales.view',         'Sales',     'View sales records'),
  ('sales.create',       'Sales',     'Create new sale'),
  ('sales.edit',         'Sales',     'Edit existing sale'),
  ('sales.delete',       'Sales',     'Delete / cancel sale'),
  ('sales.discount',     'Sales',     'Apply discount on sale'),
  ('inventory.view',     'Inventory', 'View products and stock'),
  ('inventory.manage',   'Inventory', 'Add / edit products and adjust stock'),
  ('purchases.view',     'Purchases', 'View purchases and supplier orders'),
  ('purchases.manage',   'Purchases', 'Create and manage purchases'),
  ('expenses.view',      'Expenses',  'View expenses'),
  ('expenses.manage',    'Expenses',  'Create and manage expenses'),
  ('customers.view',     'CRM',       'View customer records'),
  ('customers.manage',   'CRM',       'Manage customer records'),
  ('suppliers.view',     'Suppliers', 'View supplier records'),
  ('suppliers.manage',   'Suppliers', 'Manage supplier records'),
  ('accounting.view',    'Accounting','View journal entries and ledger'),
  ('accounting.post',    'Accounting','Post manual journal entries'),
  ('reports.view',       'Reports',   'View financial reports'),
  ('reports.export',     'Reports',   'Export reports as PDF'),
  ('settings.manage',    'Settings',  'Manage business settings'),
  ('team.manage',        'Team',      'Invite and manage team members'),
  ('ai.access',          'AI',        'Access Pilot AI features')
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- NOTE ON CHART OF ACCOUNTS SEED:
-- The chart of accounts must be seeded per-business during onboarding.
-- Use the fn_seed_chart_of_accounts(p_business_id UUID) function below.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_seed_chart_of_accounts(p_business_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO chart_of_accounts (business_id, code, name, name_ht, account_class, is_system) VALUES
    -- ── ASSETS (Actifs) ──────────────────────────────────────────────────
    (p_business_id, '1000', 'Actifs',                     'Aktif',              'Asset',     true),
    (p_business_id, '1100', 'Actifs courants',            'Aktif Kouran',       'Asset',     true),
    (p_business_id, '5310', 'Caisse HTG',                 'Kès HTG',            'Asset',     true),
    (p_business_id, '5320', 'Caisse USD',                 'Kès USD',            'Asset',     true),
    (p_business_id, '5110', 'Banque HTG',                 'Bank HTG',           'Asset',     true),
    (p_business_id, '5120', 'Banque USD',                 'Bank USD',           'Asset',     true),
    (p_business_id, '5121', 'MonCash',                    'MonCash',            'Asset',     true),
    (p_business_id, '5122', 'Natcash',                    'Natcash',            'Asset',     true),
    (p_business_id, '5123', 'Carte Bancaire',             'Kat Bank',           'Asset',     true),
    (p_business_id, '4110', 'Clients — Comptes clients',  'Kliyan yo dwe',      'Asset',     true),
    (p_business_id, '3700', 'Stocks de marchandises',     'Stock machandiz',    'Asset',     true),
    (p_business_id, '3100', 'Matières premières',         'Matye premyè',       'Asset',     true),
    (p_business_id, '4710', 'Avances et acomptes versés', 'Avans peye',         'Asset',     true),
    (p_business_id, '2100', 'Immobilisations corporelles','Ekipman',            'Asset',     true),
    (p_business_id, '2800', 'Amortissements',             'Amotisman',          'Asset',     true),
    -- ── LIABILITIES (Passif) ────────────────────────────────────────────
    (p_business_id, '2000', 'Passif',                     'Pasif',              'Liability', true),
    (p_business_id, '4010', 'Fournisseurs — Dettes AP',   'Founisè yo dwe',     'Liability', true),
    (p_business_id, '4020', 'Effets à payer',             'Biye peyab',         'Liability', true),
    (p_business_id, '4200', 'Personnel — Salaires à payer','Salè pou peye',     'Liability', true),
    (p_business_id, '4440', 'État — Impôts à payer',      'Taks pou peye',      'Liability', true),
    (p_business_id, '4450', 'TVA / TCA collectée',        'TVA kolekte',        'Liability', true),
    (p_business_id, '1640', 'Emprunts bancaires',         'Prè bank',           'Liability', true),
    (p_business_id, '4190', 'Avances clients reçues',     'Avans kliyan resevwa','Liability',true),
    -- ── EQUITY (Capitaux propres) ────────────────────────────────────────
    (p_business_id, '3000', 'Capitaux propres',           'Kapital pwòp',       'Equity',    true),
    (p_business_id, '1010', 'Capital social',             'Kapital sosyal',     'Equity',    true),
    (p_business_id, '1070', 'Report à nouveau',           'Rezilta anvan',      'Equity',    true),
    (p_business_id, '1300', 'Résultat de l''exercice',    'Pwofi ane a',        'Equity',    true),
    (p_business_id, '4580', 'Prélèvements propriétaire',  'Prelèvman pwopriyetè','Equity',   true),
    -- ── REVENUE (Revenus) ───────────────────────────────────────────────
    (p_business_id, '7000', 'Revenus',                    'Revni',              'Revenue',   true),
    (p_business_id, '7010', 'Ventes de marchandises',     'Vant machandiz',     'Revenue',   true),
    (p_business_id, '7020', 'Prestations de services',    'Sèvis',              'Revenue',   true),
    (p_business_id, '7090', 'Autres revenus',             'Lòt revni',          'Revenue',   true),
    (p_business_id, '7091', 'Revenus financiers',         'Revni finansye',     'Revenue',   true),
    -- ── CONTRA REVENUE ──────────────────────────────────────────────────
    (p_business_id, '7090R','Retours et remises sur ventes','Retou vant',       'ContraRevenue', true),
    -- ── EXPENSES (Charges) ──────────────────────────────────────────────
    (p_business_id, '6000', 'Charges',                    'Depans',             'Expense',   true),
    (p_business_id, '6010', 'Achats de marchandises',     'Acha machandiz',     'Expense',   true),
    (p_business_id, '6020', 'Variation de stocks',        'Chanjman stock',     'Expense',   true),
    (p_business_id, '6130', 'Loyers et charges locatives','Lwaye',              'Expense',   true),
    (p_business_id, '6150', 'Entretien et réparations',   'Antretyen',          'Expense',   true),
    (p_business_id, '6160', 'Primes d''assurances',       'Asirans',            'Expense',   true),
    (p_business_id, '6220', 'Fournitures de bureau',      'Founiti biwo',       'Expense',   true),
    (p_business_id, '6230', 'Publicité et marketing',     'Piblisite',          'Expense',   true),
    (p_business_id, '6240', 'Transport et déplacements',  'Transpò',            'Expense',   true),
    (p_business_id, '6260', 'Télécom & Internet',         'Telefòn ak entènèt', 'Expense',   true),
    (p_business_id, '6270', 'Frais bancaires',            'Frè bank',           'Expense',   true),
    (p_business_id, '6350', 'Impôts et taxes',            'Taks',               'Expense',   true),
    (p_business_id, '6410', 'Salaires du personnel',      'Salè anplwaye',      'Expense',   true),
    (p_business_id, '6430', 'Charges sociales',           'Chaj sosyal',        'Expense',   true),
    (p_business_id, '6500', 'Autres charges',             'Lòt depans',         'Expense',   true),
    (p_business_id, '6600', 'Charges financières',        'Enterè prè',         'Expense',   true),
    (p_business_id, '6810', 'Dotations amortissements',   'Amotisman',          'Expense',   true)
  ON CONFLICT (business_id, code) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION fn_seed_chart_of_accounts IS
  'Call this function after creating a new business to seed its Chart of Accounts (PCG Haiti).';

-- ══════════════════════════════════════════════════════════════════════════════
-- END OF PROFITPILOT COMPLETE SCHEMA v2.0
-- Tables: 55+  |  ENUMs: 12  |  Functions: 12  |  Triggers: 8  |  Views: 5
-- RLS Policies: 60+  |  Indexes: 45+
-- ══════════════════════════════════════════════════════════════════════════════
