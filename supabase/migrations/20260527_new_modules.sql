-- ══════════════════════════════════════════════════════════════════════════════
-- PROFITPILOT — NEW MODULES v5
-- 1. user_preferences   (Settings module)
-- 2. sale_invoices      (Ventes CRM PDF invoices)
-- 3. sale_invoice_items (line items for sale invoices)
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- § 1. USER PREFERENCES
-- One row per authenticated user. Stores UI/UX preferences.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language               TEXT        NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'ht')),
  currency               TEXT        NOT NULL DEFAULT 'HTG' CHECK (currency IN ('HTG', 'USD')),
  dark_mode              BOOLEAN     NOT NULL DEFAULT false,
  notifications_enabled  BOOLEAN     NOT NULL DEFAULT true,
  auto_save              BOOLEAN     NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_preferences_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_preferences(user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION fn_touch_user_preferences()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_preferences_updated ON user_preferences;
CREATE TRIGGER trg_user_preferences_updated
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION fn_touch_user_preferences();

-- RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_prefs: own" ON user_preferences;
CREATE POLICY "user_prefs: own"
  ON user_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- § 2. SALE INVOICES  (distinct from billing_invoices which is for subscriptions)
-- Professional invoice sent to a client for goods/services sold.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sale_invoices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  business_id      UUID        REFERENCES businesses(id)            ON DELETE SET NULL,
  client_id        UUID        REFERENCES clients(id)               ON DELETE SET NULL,
  client_name      TEXT,
  invoice_number   TEXT        NOT NULL,           -- e.g. "INV-2026-0042"
  currency         TEXT        NOT NULL DEFAULT 'HTG' CHECK (currency IN ('HTG', 'USD')),
  status           TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
  payment_method   TEXT,
  subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total   NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  due_at           DATE,
  sent_at          TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sale_invoice_number_owner_unique UNIQUE (owner_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_sale_inv_owner  ON sale_invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_sale_inv_client ON sale_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_sale_inv_status ON sale_invoices(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION fn_touch_sale_invoices()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_invoices_updated ON sale_invoices;
CREATE TRIGGER trg_sale_invoices_updated
  BEFORE UPDATE ON sale_invoices
  FOR EACH ROW EXECUTE FUNCTION fn_touch_sale_invoices();

-- RLS
ALTER TABLE sale_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_inv: own" ON sale_invoices;
CREATE POLICY "sale_inv: own"
  ON sale_invoices FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- § 3. SALE INVOICE ITEMS  (line items)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sale_invoice_items (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     UUID         NOT NULL REFERENCES sale_invoices(id) ON DELETE CASCADE,
  product_id     UUID         REFERENCES products(id)               ON DELETE SET NULL,
  product_name   TEXT         NOT NULL,
  quantity       INTEGER      NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_pct   NUMERIC(5,2) NOT NULL DEFAULT 0  CHECK (discount_pct BETWEEN 0 AND 100),
  tax_pct        NUMERIC(5,2) NOT NULL DEFAULT 0  CHECK (tax_pct      BETWEEN 0 AND 100),
  line_total     NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(
      quantity * unit_price
        * (1 - discount_pct / 100)
        * (1 + tax_pct      / 100),
      2
    )
  ) STORED,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_inv_items_invoice ON sale_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sale_inv_items_product ON sale_invoice_items(product_id);

-- RLS — inherit access from parent invoice via owner_id join
ALTER TABLE sale_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_inv_items: own" ON sale_invoice_items;
CREATE POLICY "sale_inv_items: own"
  ON sale_invoice_items FOR ALL
  USING (
    invoice_id IN (SELECT id FROM sale_invoices WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    invoice_id IN (SELECT id FROM sale_invoices WHERE owner_id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- § 4. FUNCTION — auto-generate invoice number
-- Calling convention: SELECT fn_next_invoice_number(owner_id)
--   returns e.g. "INV-2026-0042"
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_next_invoice_number(p_owner UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_year  INT  := EXTRACT(YEAR FROM now());
  v_count INT;
BEGIN
  SELECT COUNT(*) + 1
    INTO v_count
    FROM sale_invoices
   WHERE owner_id = p_owner
     AND EXTRACT(YEAR FROM created_at) = v_year;

  RETURN 'INV-' || v_year::TEXT || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- § 5. GRANT select on new tables to authenticated role (Supabase RLS tables)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT ALL ON user_preferences    TO authenticated;
GRANT ALL ON sale_invoices        TO authenticated;
GRANT ALL ON sale_invoice_items   TO authenticated;

-- Done ✓
