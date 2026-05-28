-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Audit Fixes - ProfitPilot Backend
-- Date: 2026-05-26
-- Description: Indexes manyan, View pwofi, kolòn business_id mankan, sekirite
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: INDEXES MANKAN YO
-- ─────────────────────────────────────────────────────────────────────────────

-- == SALES ==
CREATE INDEX IF NOT EXISTS idx_sales_owner_id       ON sales(owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_business_id    ON sales(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at     ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_product_id     ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_client_id      ON sales(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number) WHERE invoice_number IS NOT NULL;
-- Index konpoze pou filtre pa machan + dat (rechèch rapò ki pi komen)
CREATE INDEX IF NOT EXISTS idx_sales_owner_date     ON sales(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_biz_date       ON sales(business_id, created_at DESC);

-- == EXPENSES ==
CREATE INDEX IF NOT EXISTS idx_expenses_owner_id    ON expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business_id ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date        ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category    ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id ON expenses(supplier_id) WHERE supplier_id IS NOT NULL;
-- Index konpoze pou rapò
CREATE INDEX IF NOT EXISTS idx_expenses_owner_date  ON expenses(owner_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_biz_date    ON expenses(business_id, date DESC);

-- == PURCHASES ==
CREATE INDEX IF NOT EXISTS idx_purchases_owner_id       ON purchases(owner_id);
CREATE INDEX IF NOT EXISTS idx_purchases_business_id    ON purchases(business_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id    ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_product_id     ON purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date  ON purchases(purchase_date DESC);
-- Index pou filtre "À Crédit" (dèt founisè) - ki pi souvan filtre
CREATE INDEX IF NOT EXISTS idx_purchases_credit_status  ON purchases(owner_id, payment_status) WHERE payment_status = 'À Crédit';
CREATE INDEX IF NOT EXISTS idx_purchases_biz_date       ON purchases(business_id, purchase_date DESC);

-- == PRODUCTS ==
CREATE INDEX IF NOT EXISTS idx_products_owner_id    ON products(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_business_id ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category);
-- Index pou rechèch stock ki ba
CREATE INDEX IF NOT EXISTS idx_products_low_stock   ON products(owner_id, stock_quantity) WHERE stock_quantity <= 5;

-- == CLIENTS ==
CREATE INDEX IF NOT EXISTS idx_clients_owner_id     ON clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone        ON clients(phone) WHERE phone IS NOT NULL;

-- == CLIENT_CREDITS ==
CREATE INDEX IF NOT EXISTS idx_client_credits_owner_id      ON client_credits(owner_id);
CREATE INDEX IF NOT EXISTS idx_client_credits_client_id     ON client_credits(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_credits_sale_id       ON client_credits(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_credits_payment_status ON client_credits(payment_status);
CREATE INDEX IF NOT EXISTS idx_client_credits_owner_date    ON client_credits(owner_id, created_at DESC);

-- == BUSINESSES ==
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id  ON businesses(owner_id);

-- == EMPLOYEES ==
CREATE INDEX IF NOT EXISTS idx_employees_user_id    ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_biz_id     ON employees(business_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: AJOUTE business_id nan tab ki manke l yo
-- (clients, client_credits, customer_transactions - izole multi-tenant)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_business_id ON clients(business_id) WHERE business_id IS NOT NULL;

ALTER TABLE client_credits
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_credits_biz_id ON client_credits(business_id) WHERE business_id IS NOT NULL;

ALTER TABLE customer_transactions
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ct_business_id ON customer_transactions(business_id) WHERE business_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: SQL VIEWS POU KALKIL PWOFI (retire lojik la nan JavaScript)
-- ─────────────────────────────────────────────────────────────────────────────

-- === VIEW 3A: Rezime revni pa jou/mwa/ane (pou dashboard) ===
CREATE OR REPLACE VIEW v_sales_summary AS
SELECT
  owner_id,
  business_id,
  currency,
  DATE_TRUNC('day',   created_at)   AS period_day,
  DATE_TRUNC('month', created_at)   AS period_month,
  DATE_TRUNC('year',  created_at)   AS period_year,
  COUNT(*)                           AS nb_transactions,
  SUM(total_amount)                  AS total_revenue
FROM sales
GROUP BY owner_id, business_id, currency,
         DATE_TRUNC('day',   created_at),
         DATE_TRUNC('month', created_at),
         DATE_TRUNC('year',  created_at);

COMMENT ON VIEW v_sales_summary IS 'Revni agreje pa peryòd - pou evite agreje nan JavaScript';

-- === VIEW 3B: Rezime depans pa jou/mwa/ane ===
CREATE OR REPLACE VIEW v_expenses_summary AS
SELECT
  owner_id,
  business_id,
  currency,
  category,
  DATE_TRUNC('day',   date::timestamptz) AS period_day,
  DATE_TRUNC('month', date::timestamptz) AS period_month,
  DATE_TRUNC('year',  date::timestamptz) AS period_year,
  COUNT(*)                                AS nb_transactions,
  SUM(amount)                             AS total_expenses
FROM expenses
GROUP BY owner_id, business_id, currency, category,
         DATE_TRUNC('day',   date::timestamptz),
         DATE_TRUNC('month', date::timestamptz),
         DATE_TRUNC('year',  date::timestamptz);

COMMENT ON VIEW v_expenses_summary IS 'Depans agreje pa kategori ak peryòd';

-- === VIEW 3C: KALKIL PWOFI - Revenus - Depans (HTG sèlman) ===
-- Remplace tout kalkil JavaScript nan financialReporting.ts ak reports.ts
CREATE OR REPLACE VIEW v_profit_by_period AS
WITH
  rev AS (
    SELECT
      owner_id,
      business_id,
      DATE_TRUNC('month', created_at) AS period_month,
      SUM(
        CASE currency
          WHEN 'USD' THEN total_amount * COALESCE(
            (SELECT exchange_rate FROM businesses b WHERE b.id = business_id), 1
          )
          ELSE total_amount
        END
      ) AS revenue_htg
    FROM sales
    GROUP BY owner_id, business_id, DATE_TRUNC('month', created_at)
  ),
  exp AS (
    SELECT
      owner_id,
      business_id,
      DATE_TRUNC('month', date::timestamptz) AS period_month,
      SUM(
        CASE currency
          WHEN 'USD' THEN amount * COALESCE(
            (SELECT exchange_rate FROM businesses b WHERE b.id = business_id), 1
          )
          ELSE amount
        END
      ) AS expenses_htg
    FROM expenses
    GROUP BY owner_id, business_id, DATE_TRUNC('month', date::timestamptz)
  )
SELECT
  COALESCE(r.owner_id,    e.owner_id)    AS owner_id,
  COALESCE(r.business_id, e.business_id) AS business_id,
  COALESCE(r.period_month, e.period_month)::date AS period_month,
  COALESCE(r.revenue_htg,  0)            AS revenue_htg,
  COALESCE(e.expenses_htg, 0)            AS expenses_htg,
  COALESCE(r.revenue_htg, 0) - COALESCE(e.expenses_htg, 0) AS profit_htg
FROM rev   r
FULL OUTER JOIN exp e
  ON  r.owner_id    = e.owner_id
  AND r.business_id = e.business_id
  AND r.period_month = e.period_month;

COMMENT ON VIEW v_profit_by_period IS
  'Pwofi nèt = Revni - Depans, konvèti nan HTG - remplace kalkil JavaScript yo';

-- === VIEW 3D: Dashboard KPI (karèm kouran, mwa kouran, ane a) ===
CREATE OR REPLACE VIEW v_dashboard_kpi AS
SELECT
  owner_id,
  business_id,
  -- Mwa kouran
  SUM(revenue_htg)  FILTER (WHERE period_month = DATE_TRUNC('month', NOW())) AS revenue_this_month,
  SUM(expenses_htg) FILTER (WHERE period_month = DATE_TRUNC('month', NOW())) AS expenses_this_month,
  SUM(profit_htg)   FILTER (WHERE period_month = DATE_TRUNC('month', NOW())) AS profit_this_month,
  -- Trimès kouran
  SUM(revenue_htg)  FILTER (WHERE period_month >= DATE_TRUNC('quarter', NOW())) AS revenue_this_quarter,
  SUM(expenses_htg) FILTER (WHERE period_month >= DATE_TRUNC('quarter', NOW())) AS expenses_this_quarter,
  SUM(profit_htg)   FILTER (WHERE period_month >= DATE_TRUNC('quarter', NOW())) AS profit_this_quarter,
  -- Ane kouran
  SUM(revenue_htg)  FILTER (WHERE period_month >= DATE_TRUNC('year', NOW())) AS revenue_this_year,
  SUM(expenses_htg) FILTER (WHERE period_month >= DATE_TRUNC('year', NOW())) AS expenses_this_year,
  SUM(profit_htg)   FILTER (WHERE period_month >= DATE_TRUNC('year', NOW())) AS profit_this_year
FROM v_profit_by_period
GROUP BY owner_id, business_id;

COMMENT ON VIEW v_dashboard_kpi IS
  'KPI dashboard: revni/depans/pwofi pou mwa, trimès, ak ane kouran';

-- === VIEW 3E: Dèt founisè aktif (remplase filtre JS sou purchases) ===
CREATE OR REPLACE VIEW v_supplier_debts AS
SELECT
  p.id            AS purchase_id,
  p.owner_id,
  p.business_id,
  p.supplier_id,
  s.name          AS supplier_name,
  s.phone         AS supplier_phone,
  p.product_id,
  pr.name         AS product_name,
  p.quantity,
  p.total_purchase_amount,
  p.currency,
  p.purchase_date,
  p.created_at,
  -- Laj dèt an jou
  (CURRENT_DATE - p.purchase_date) AS days_outstanding
FROM purchases p
JOIN suppliers  s  ON s.id  = p.supplier_id
JOIN products   pr ON pr.id = p.product_id
WHERE p.payment_status = 'À Crédit'
ORDER BY p.purchase_date ASC;  -- pi vye an premye

COMMENT ON VIEW v_supplier_debts IS 'Tout dèt founisè ki poko peye ak laj yo (jou)';

-- === VIEW 3F: Kreyans kliyan (dèt kliyan yo dwe) ===
CREATE OR REPLACE VIEW v_client_receivables AS
SELECT
  cc.id,
  cc.owner_id,
  cc.client_id,
  cc.client_name,
  c.phone         AS client_phone,
  cc.sale_id,
  cc.invoice_number,
  cc.amount,
  cc.currency,
  cc.created_at,
  (CURRENT_DATE - cc.created_at::date) AS days_outstanding
FROM client_credits cc
LEFT JOIN clients c ON c.id = cc.client_id
WHERE cc.payment_status = 'À Crédit'
ORDER BY cc.created_at ASC;

COMMENT ON VIEW v_client_receivables IS 'Tout kreyans kliyan ki poko peye ak laj yo (jou)';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: KORIJE POLITIK RLS DOUBLE (suppliers ak purchases)
-- ─────────────────────────────────────────────────────────────────────────────
-- Retire ansyen politik "_own" ki duplike "_admin" yo

DROP POLICY IF EXISTS suppliers_select_own ON suppliers;
DROP POLICY IF EXISTS suppliers_insert_own ON suppliers;
DROP POLICY IF EXISTS suppliers_update_own ON suppliers;
DROP POLICY IF EXISTS suppliers_delete_own ON suppliers;

DROP POLICY IF EXISTS purchases_select_own ON purchases;
DROP POLICY IF EXISTS purchases_insert_own ON purchases;
DROP POLICY IF EXISTS purchases_update_own ON purchases;
DROP POLICY IF EXISTS purchases_delete_own ON purchases;

-- Kontwole: politik "_admin" yo rete aktif (yo genyen plis nivo ak wòl)
-- suppliers_select_admin, purchases_select_admin, etc. - KITE YO KANPE


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: FONKSYON SQL POU RAPÒ P&L (remplace financialReporting.ts)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_profit_and_loss(
  p_business_id UUID,
  p_start_date  DATE,
  p_end_date    DATE,
  p_currency    TEXT DEFAULT 'HTG'
)
RETURNS TABLE (
  total_revenue   NUMERIC,
  cogs            NUMERIC,
  total_expenses  NUMERIC,
  gross_profit    NUMERIC,
  net_profit      NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  WITH
    exchange AS (
      SELECT COALESCE(exchange_rate, 1) AS rate
      FROM businesses
      WHERE id = p_business_id
    ),
    rev AS (
      SELECT
        SUM(
          CASE
            WHEN p_currency = 'HTG' AND currency = 'USD' THEN total_amount * (SELECT rate FROM exchange)
            WHEN p_currency = 'USD' AND currency = 'HTG' THEN total_amount / (SELECT rate FROM exchange)
            ELSE total_amount
          END
        ) AS total_revenue
      FROM sales
      WHERE business_id = p_business_id
        AND created_at::date BETWEEN p_start_date AND p_end_date
    ),
    pur AS (
      SELECT
        SUM(
          CASE
            WHEN p_currency = 'HTG' AND currency = 'USD' THEN total_purchase_amount * (SELECT rate FROM exchange)
            WHEN p_currency = 'USD' AND currency = 'HTG' THEN total_purchase_amount / (SELECT rate FROM exchange)
            ELSE total_purchase_amount
          END
        ) AS cogs
      FROM purchases
      WHERE business_id = p_business_id
        AND purchase_date BETWEEN p_start_date AND p_end_date
    ),
    exp AS (
      SELECT
        SUM(
          CASE
            WHEN p_currency = 'HTG' AND currency = 'USD' THEN amount * (SELECT rate FROM exchange)
            WHEN p_currency = 'USD' AND currency = 'HTG' THEN amount / (SELECT rate FROM exchange)
            ELSE amount
          END
        ) AS total_expenses
      FROM expenses
      WHERE business_id = p_business_id
        AND date BETWEEN p_start_date AND p_end_date
    )
  SELECT
    COALESCE(rev.total_revenue, 0)                          AS total_revenue,
    COALESCE(pur.cogs, 0)                                   AS cogs,
    COALESCE(exp.total_expenses, 0)                         AS total_expenses,
    COALESCE(rev.total_revenue, 0) - COALESCE(pur.cogs, 0) AS gross_profit,
    COALESCE(rev.total_revenue, 0)
      - COALESCE(pur.cogs, 0)
      - COALESCE(exp.total_expenses, 0)                     AS net_profit
  FROM rev, pur, exp;
$$;

COMMENT ON FUNCTION get_profit_and_loss IS
  'Kalkile P&L dirèkteman nan SQL - plus efikas ke kalkil JavaScript';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: SEKITE - Ajoute numero fakti sekans (remplace Math.random())
-- ─────────────────────────────────────────────────────────────────────────────

-- Kreye yon sekans pou nimewo fakti unik garanti
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq
  START 100000
  INCREMENT 1
  NO CYCLE;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT 'PP-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 6, '0');
$$;

COMMENT ON FUNCTION generate_invoice_number IS
  'Jenere nimewo fakti unik garanti (remplace Math.random() nan JS)';
