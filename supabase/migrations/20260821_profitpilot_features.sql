-- ============================================================================
-- ProfitPilot — Migration "Diagnostic & Fonctionnalités"
-- Couvre les 9 diagnostics + les 7 bonus du document stratégique produit.
--
--  §1  Taux de change : historique + seuil d'alerte de variation
--  §2  Coût réel produit (achat + livraison + commission + emballage)
--  §3  Créances clients (dettes moun) : échéances, statuts, relances
--  §4  Dépenses : séparation business / personnel
--  §5  Objectifs mensuels (CA, marge, clients)
--  §6  Score de santé financière (snapshots mensuels)
--  §7  Recommandations automatiques + journal d'envoi des rapports
--  §8  Vues d'analyse : rentabilité produit, KPI mois/mois
--  §9  RLS + grants
--
-- Idempotente : peut être rejouée sans effet de bord.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §0. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- fn_is_member() existe déjà (20260702_multi_tenant_v2.sql). On le recrée
-- uniquement pour que cette migration soit auto-portante.
CREATE OR REPLACE FUNCTION fn_is_member(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $fn$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND is_active   = true
      AND deleted_at  IS NULL
  );
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. DIAGNOSTIC 1 — Taux de change : historique + alerte de variation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  rate          NUMERIC(12,4) NOT NULL CHECK (rate > 0),   -- 1 USD = rate HTG
  previous_rate NUMERIC(12,4),
  variation_pct NUMERIC(8,4),                              -- % vs previous_rate
  source        TEXT          NOT NULL DEFAULT 'api',      -- api | manual | import
  captured_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erh_biz_date
  ON exchange_rate_history(business_id, captured_at DESC);

-- Seuil (%) au-delà duquel on prévient le marchand que sa marge bouge.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS rate_alert_threshold NUMERIC(5,2) NOT NULL DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS rate_alert_seen_at   TIMESTAMPTZ;

-- Enregistre un nouveau taux et retourne la variation en % vs le dernier connu.
CREATE OR REPLACE FUNCTION fn_record_exchange_rate(
  p_business_id UUID,
  p_rate        NUMERIC,
  p_source      TEXT DEFAULT 'api'
)
RETURNS TABLE (rate NUMERIC, previous_rate NUMERIC, variation_pct NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_prev NUMERIC;
  v_var  NUMERIC;
BEGIN
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'Taux invalide: %', p_rate;
  END IF;

  SELECT b.exchange_rate INTO v_prev FROM businesses b WHERE b.id = p_business_id;

  v_var := CASE
             WHEN v_prev IS NULL OR v_prev = 0 THEN 0
             ELSE ROUND(((p_rate - v_prev) / v_prev) * 100, 4)
           END;

  INSERT INTO exchange_rate_history (business_id, rate, previous_rate, variation_pct, source)
  VALUES (p_business_id, p_rate, v_prev, v_var, COALESCE(p_source, 'api'));

  UPDATE businesses SET exchange_rate = p_rate WHERE id = p_business_id;

  RETURN QUERY SELECT p_rate::NUMERIC, v_prev::NUMERIC, v_var::NUMERIC;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. DIAGNOSTIC 4 — Coût réel par produit (frais annexes)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS delivery_cost         NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_cost        NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_cost            NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_margin_percent NUMERIC(5,2)  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS reorder_point         INTEGER       NOT NULL DEFAULT 5;

COMMENT ON COLUMN products.delivery_cost         IS 'Frais de livraison unitaire, même devise que purchase_price';
COMMENT ON COLUMN products.commission_percent    IS 'Commission plateforme en % du prix de vente';
COMMENT ON COLUMN products.target_margin_percent IS 'Marge nette cible utilisée par le prix conseillé';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. DIAGNOSTIC 3 — Créances clients : échéances, statuts, relances
-- ─────────────────────────────────────────────────────────────────────────────

-- La source de vérité d'une créance client est la VENTE à crédit
-- (sales.payment_status = 'credit'), pas la table legacy client_credits :
-- c'est déjà ce que lit /dettes. On complète donc `sales`.
-- sales.due_date et sales.balance_due (généré) existent depuis le schéma v2.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count   INTEGER NOT NULL DEFAULT 0;

-- Toute vente à crédit sans échéance obtient 30 jours par défaut.
UPDATE sales
   SET due_date = (sale_date + INTERVAL '30 days')::date
 WHERE due_date IS NULL
   AND payment_status IN ('credit', 'partial', 'pending');

CREATE OR REPLACE FUNCTION fn_sale_default_due_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.due_date IS NULL AND NEW.payment_status IN ('credit', 'partial', 'pending') THEN
    NEW.due_date := (COALESCE(NEW.sale_date, CURRENT_DATE) + INTERVAL '30 days')::date;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sale_default_due_date ON sales;
CREATE TRIGGER trg_sale_default_due_date
  BEFORE INSERT ON sales
  FOR EACH ROW EXECUTE FUNCTION fn_sale_default_due_date();

CREATE INDEX IF NOT EXISTS idx_sales_due
  ON sales(business_id, due_date)
  WHERE payment_status <> 'paid' AND deleted_at IS NULL;

-- Journal des relances (évite de harceler le client, sert d'audit).
CREATE TABLE IF NOT EXISTS receivable_reminders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     UUID        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  business_id UUID        REFERENCES businesses(id) ON DELETE CASCADE,
  channel     TEXT        NOT NULL DEFAULT 'whatsapp'
              CHECK (channel IN ('whatsapp','sms','email','manual','in_app')),
  message     TEXT,
  sent_by     UUID        REFERENCES auth.users(id),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rr_sale ON receivable_reminders(sale_id, sent_at DESC);

-- Vue de travail : statut calculé + retard, prête à afficher.
CREATE OR REPLACE VIEW v_receivables AS
SELECT
  s.id                                    AS sale_id,
  s.business_id,
  s.customer_id,
  COALESCE(s.customer_name, 'Client')     AS customer_name,
  c.phone                                 AS customer_phone,
  s.invoice_number,
  s.total_amount,
  s.paid_amount,
  GREATEST(s.total_amount - s.paid_amount, 0) AS balance_due,
  s.currency,
  s.sale_date,
  s.due_date,
  s.last_reminder_at,
  s.reminder_count,
  (CURRENT_DATE - s.due_date)             AS days_overdue,
  CASE
    WHEN s.payment_status = 'paid' OR s.total_amount - s.paid_amount <= 0 THEN 'paid'
    WHEN s.due_date IS NULL                                               THEN 'open'
    WHEN CURRENT_DATE > s.due_date + 30                                   THEN 'critical'
    WHEN CURRENT_DATE > s.due_date                                        THEN 'overdue'
    WHEN CURRENT_DATE >= s.due_date - 3                                   THEN 'due_soon'
    ELSE 'open'
  END                                     AS status
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id
WHERE s.deleted_at IS NULL
  AND s.payment_status <> 'paid';

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. DIAGNOSTIC 6 — Dépenses : business vs personnel
-- ─────────────────────────────────────────────────────────────────────────────

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_scope') THEN
    CREATE TYPE expense_scope AS ENUM ('business', 'personal', 'mixed');
  END IF;
END
$do$;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS scope              expense_scope NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS business_share_pct NUMERIC(5,2)  NOT NULL DEFAULT 100;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_business_share_pct_range'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_business_share_pct_range
      CHECK (business_share_pct >= 0 AND business_share_pct <= 100);
  END IF;
END
$do$;

COMMENT ON COLUMN expenses.business_share_pct
  IS 'Part professionnelle d''une dépense mixte (ex: 60% du forfait téléphone).';

ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS default_scope expense_scope NOT NULL DEFAULT 'business';

CREATE INDEX IF NOT EXISTS idx_expenses_scope ON expenses(business_id, scope);

-- Une dépense hérite du scope de sa catégorie si l'utilisateur n'a rien choisi.
CREATE OR REPLACE FUNCTION fn_expense_default_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE v_scope expense_scope;
BEGIN
  IF NEW.category_id IS NOT NULL AND NEW.scope = 'business' THEN
    SELECT default_scope INTO v_scope FROM expense_categories WHERE id = NEW.category_id;
    IF v_scope IS NOT NULL THEN NEW.scope := v_scope; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_expense_default_scope ON expenses;
CREATE TRIGGER trg_expense_default_scope
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION fn_expense_default_scope();

-- Catégories personnelles courantes (par entreprise, sans doublon).
INSERT INTO expense_categories (business_id, name, default_scope, is_system)
SELECT b.id, c.name, 'personal'::expense_scope, true
FROM businesses b
CROSS JOIN (VALUES ('Dépenses maison'), ('Écolage'), ('Santé famille'), ('Transport personnel'))
       AS c(name)
WHERE NOT EXISTS (
  SELECT 1 FROM expense_categories ec
  WHERE ec.business_id = b.id AND lower(ec.name) = lower(c.name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §5. DIAGNOSTIC 7 — Objectifs mensuels
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS business_goals (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  metric       TEXT          NOT NULL CHECK (metric IN ('revenue','margin','customers','sales_count')),
  period_start DATE          NOT NULL,          -- 1er jour du mois visé
  target_value NUMERIC(20,4) NOT NULL CHECK (target_value > 0),
  currency     TEXT          NOT NULL DEFAULT 'HTG',
  note         TEXT,
  created_by   UUID          REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, metric, period_start)
);
CREATE INDEX IF NOT EXISTS idx_goals_biz ON business_goals(business_id, period_start DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- §6. BONUS 3 — Score de santé financière (historisé)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financial_health_snapshots (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_start DATE          NOT NULL,
  score        INTEGER       NOT NULL CHECK (score BETWEEN 0 AND 100),
  breakdown    JSONB         NOT NULL DEFAULT '{}'::jsonb,  -- {margin, regularity, cash, recovery}
  revenue      NUMERIC(20,4) NOT NULL DEFAULT 0,
  margin       NUMERIC(20,4) NOT NULL DEFAULT 0,
  receivables  NUMERIC(20,4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_fhs_biz ON financial_health_snapshots(business_id, period_start DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- §7. DIAGNOSTIC 9 + BONUS 1 — Journal d'envoi des rapports
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_deliveries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind         TEXT        NOT NULL CHECK (kind IN ('weekly_digest','credit_export','monthly_review')),
  channel      TEXT        NOT NULL DEFAULT 'whatsapp'
               CHECK (channel IN ('whatsapp','email','in_app','pdf')),
  period_start DATE,
  period_end   DATE,
  payload      JSONB,
  status       TEXT        NOT NULL DEFAULT 'generated'
               CHECK (status IN ('generated','sent','failed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rd_biz ON report_deliveries(business_id, created_at DESC);

-- Préférences produit (WhatsApp hebdo, alertes stock).
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS whatsapp_number          TEXT,
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS low_stock_alerts_enabled BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────────────────
-- §8. DIAGNOSTIC 5 + BONUS 7 — Vues d'analyse
-- ─────────────────────────────────────────────────────────────────────────────

-- Rentabilité par produit : marge totale générée, pas seulement le volume.
CREATE OR REPLACE VIEW v_product_profitability AS
SELECT
  si.business_id,
  si.product_id,
  MAX(si.product_name)                                 AS product_name,
  SUM(si.quantity)                                     AS units_sold,
  SUM(si.line_total)                                   AS revenue,
  SUM(si.cost_price * si.quantity)                     AS cost,
  SUM(si.line_total - si.cost_price * si.quantity)     AS gross_margin,
  CASE WHEN SUM(si.line_total) > 0
       THEN ROUND(SUM(si.line_total - si.cost_price * si.quantity) / SUM(si.line_total) * 100, 2)
       ELSE 0 END                                      AS margin_pct,
  MAX(s.sale_date)                                     AS last_sold_at
FROM sale_items si
JOIN sales s ON s.id = si.sale_id AND s.deleted_at IS NULL
GROUP BY si.business_id, si.product_id;

-- KPI mensuels (base des comparaisons mois/mois et année/année).
CREATE OR REPLACE VIEW v_monthly_kpis AS
WITH sales_m AS (
  SELECT s.business_id,
         date_trunc('month', s.sale_date)::date AS period_start,
         SUM(s.total_amount)                    AS revenue,
         COUNT(*)                               AS sales_count,
         COUNT(DISTINCT s.customer_id)          AS customers
  FROM sales s
  WHERE s.deleted_at IS NULL
  GROUP BY 1, 2
),
cogs_m AS (
  SELECT si.business_id,
         date_trunc('month', s.sale_date)::date AS period_start,
         SUM(si.cost_price * si.quantity)       AS cogs
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id AND s.deleted_at IS NULL
  GROUP BY 1, 2
),
exp_m AS (
  SELECT e.business_id,
         date_trunc('month', e.expense_date)::date AS period_start,
         SUM(e.amount * e.business_share_pct / 100) FILTER (WHERE e.scope <> 'personal') AS business_expenses,
         SUM(e.amount)                              FILTER (WHERE e.scope  = 'personal') AS personal_expenses
  FROM expenses e
  WHERE e.deleted_at IS NULL
  GROUP BY 1, 2
)
SELECT
  s.business_id,
  s.period_start,
  s.revenue,
  s.sales_count,
  s.customers,
  COALESCE(c.cogs, 0)                                                AS cogs,
  s.revenue - COALESCE(c.cogs, 0)                                    AS gross_margin,
  COALESCE(x.business_expenses, 0)                                   AS business_expenses,
  COALESCE(x.personal_expenses, 0)                                   AS personal_expenses,
  s.revenue - COALESCE(c.cogs, 0) - COALESCE(x.business_expenses, 0) AS net_profit
FROM sales_m s
LEFT JOIN cogs_m c ON c.business_id = s.business_id AND c.period_start = s.period_start
LEFT JOIN exp_m  x ON x.business_id = s.business_id AND x.period_start = s.period_start;

-- ─────────────────────────────────────────────────────────────────────────────
-- §9. RLS + grants
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE exchange_rate_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE receivable_reminders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_goals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_deliveries          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erh_members" ON exchange_rate_history;
CREATE POLICY "erh_members" ON exchange_rate_history
  FOR ALL USING (fn_is_member(business_id)) WITH CHECK (fn_is_member(business_id));

DROP POLICY IF EXISTS "rr_members" ON receivable_reminders;
CREATE POLICY "rr_members" ON receivable_reminders
  FOR ALL USING (business_id IS NULL OR fn_is_member(business_id))
  WITH CHECK (business_id IS NULL OR fn_is_member(business_id));

DROP POLICY IF EXISTS "goals_members" ON business_goals;
CREATE POLICY "goals_members" ON business_goals
  FOR ALL USING (fn_is_member(business_id)) WITH CHECK (fn_is_member(business_id));

DROP POLICY IF EXISTS "fhs_members" ON financial_health_snapshots;
CREATE POLICY "fhs_members" ON financial_health_snapshots
  FOR ALL USING (fn_is_member(business_id)) WITH CHECK (fn_is_member(business_id));

DROP POLICY IF EXISTS "rd_members" ON report_deliveries;
CREATE POLICY "rd_members" ON report_deliveries
  FOR ALL USING (fn_is_member(business_id)) WITH CHECK (fn_is_member(business_id));

GRANT ALL    ON ALL TABLES    IN SCHEMA public TO authenticated, service_role;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON v_receivables, v_product_profitability, v_monthly_kpis TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_record_exchange_rate(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- Done
