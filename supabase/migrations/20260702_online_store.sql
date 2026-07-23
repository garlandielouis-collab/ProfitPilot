-- ══════════════════════════════════════════════════════════════════════════════
-- BOUTIQUE EN LIGNE — ProfitPilot Premium
-- Tables: store_settings, customers, customer_addresses, orders, order_items, store_pages
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Helper (idempotent) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ── 1. store_settings ─────────────────────────────────────────────────────────
DROP TABLE IF EXISTS store_settings CASCADE;
CREATE TABLE store_settings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  slug                TEXT        NOT NULL UNIQUE,
  is_active           BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Branding
  store_name          TEXT,
  tagline             TEXT,
  logo_url            TEXT,
  banner_url          TEXT,
  banner_text         TEXT        DEFAULT 'Bienvenue dans notre boutique',
  primary_color       TEXT        NOT NULL DEFAULT '#001F3F',
  secondary_color     TEXT        NOT NULL DEFAULT '#50C878',
  -- Display
  show_prices         BOOLEAN     NOT NULL DEFAULT TRUE,
  show_stock          BOOLEAN     NOT NULL DEFAULT FALSE,
  currency            TEXT        NOT NULL DEFAULT 'HTG',
  -- Payment & Shipping
  payment_methods     JSONB       NOT NULL DEFAULT '["cash"]',
  shipping_modes      JSONB       NOT NULL DEFAULT '[]',
  -- SEO
  meta_title          TEXT,
  meta_description    TEXT,
  -- Contact
  contact_email       TEXT,
  contact_phone       TEXT,
  contact_address     TEXT,
  -- Social
  social_links        JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_store_settings_updated_at BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── 2. customers ──────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS customers CASCADE;
CREATE TABLE customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  first_name  TEXT        NOT NULL,
  last_name   TEXT        NOT NULL,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, email)
);
CREATE INDEX idx_customers_business ON customers(business_id);
CREATE INDEX idx_customers_email    ON customers(business_id, email);

-- ── 3. customer_addresses ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS customer_addresses CASCADE;
CREATE TABLE customer_addresses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  business_id   UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  label         TEXT        DEFAULT 'Domicile',
  address_line1 TEXT        NOT NULL,
  address_line2 TEXT,
  city          TEXT        NOT NULL,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT        NOT NULL DEFAULT 'HT',
  is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);

-- ── 4. orders ─────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS orders CASCADE;
CREATE TABLE orders (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_number     TEXT        NOT NULL,
  -- Customer (guest or registered)
  customer_id      UUID        REFERENCES customers(id) ON DELETE SET NULL,
  customer_name    TEXT        NOT NULL,
  customer_email   TEXT        NOT NULL,
  customer_phone   TEXT,
  -- Status
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','confirmed','preparing','shipped','delivered','cancelled','refunded')),
  payment_status   TEXT        NOT NULL DEFAULT 'unpaid'
                               CHECK (payment_status IN ('unpaid','paid','refunded')),
  payment_method   TEXT,
  -- Amounts
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency         TEXT        NOT NULL DEFAULT 'HTG',
  -- Shipping
  shipping_address JSONB,
  shipping_mode    TEXT,
  -- Notes & tracking
  notes            TEXT,
  tracking_number  TEXT,
  -- ProfitPilot integration
  sale_id          UUID,
  -- Timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, order_number)
);
CREATE INDEX idx_orders_business ON orders(business_id);
CREATE INDEX idx_orders_status   ON orders(business_id, status);
CREATE INDEX idx_orders_created  ON orders(business_id, created_at DESC);
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── 5. order_items ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS order_items CASCADE;
CREATE TABLE order_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id   UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id    UUID,
  product_name  TEXT          NOT NULL,
  product_image TEXT,
  quantity      INTEGER       NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_order_items_order    ON order_items(order_id);
CREATE INDEX idx_order_items_business ON order_items(business_id);
CREATE INDEX idx_order_items_product  ON order_items(product_id) WHERE product_id IS NOT NULL;

-- ── 6. store_pages (CMS) ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS store_pages CASCADE;
CREATE TABLE store_pages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  content     TEXT,
  is_published BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, slug)
);
CREATE TRIGGER trg_store_pages_updated_at BEFORE UPDATE ON store_pages
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── 7. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE store_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_pages        ENABLE ROW LEVEL SECURITY;

-- store_settings: public read active stores; owner full access
CREATE POLICY "ss_public_read" ON store_settings
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "ss_owner_all" ON store_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = store_settings.business_id AND b.owner_id = auth.uid())
  );

-- customers: owner full access; public insert (guest checkout)
CREATE POLICY "customers_owner_all" ON customers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = customers.business_id AND b.owner_id = auth.uid())
  );
CREATE POLICY "customers_public_insert" ON customers
  FOR INSERT WITH CHECK (TRUE);

-- customer_addresses: owner access
CREATE POLICY "addresses_owner_all" ON customer_addresses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = customer_addresses.business_id AND b.owner_id = auth.uid())
  );
CREATE POLICY "addresses_public_insert" ON customer_addresses
  FOR INSERT WITH CHECK (TRUE);

-- orders: owner full access; public insert (guest checkout)
CREATE POLICY "orders_owner_all" ON orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = orders.business_id AND b.owner_id = auth.uid())
  );
CREATE POLICY "orders_member_read" ON orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM business_members bm WHERE bm.business_id = orders.business_id AND bm.user_id = auth.uid() AND bm.is_active = TRUE)
  );
CREATE POLICY "orders_public_insert" ON orders
  FOR INSERT WITH CHECK (TRUE);

-- order_items: owner full access; public insert
CREATE POLICY "order_items_owner_all" ON order_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = order_items.business_id AND b.owner_id = auth.uid())
  );
CREATE POLICY "order_items_member_read" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM business_members bm WHERE bm.business_id = order_items.business_id AND bm.user_id = auth.uid() AND bm.is_active = TRUE)
  );
CREATE POLICY "order_items_public_insert" ON order_items
  FOR INSERT WITH CHECK (TRUE);

-- store_pages: public read published; owner all
CREATE POLICY "pages_public_read" ON store_pages
  FOR SELECT USING (is_published = TRUE);
CREATE POLICY "pages_owner_all" ON store_pages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = store_pages.business_id AND b.owner_id = auth.uid())
  );
