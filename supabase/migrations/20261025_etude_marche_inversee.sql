-- ═════════════════════════════════════════════════════════════════════════════
-- L'étude de marché inversée (octobre 2026) — le schéma qu'elle demande
--
-- Une seule migration pour tout le chantier, rangée par fonctionnalité (les
-- numéros F01…F25 sont ceux du §12 de l'étude). Chaque bloc est idempotent :
-- la recoller ne casse rien.
--
-- À coller dans Supabase → SQL Editor → Run, AVANT de déployer le code qui
-- s'en sert (voir supabase/migrations/A_APPLIQUER.md).
-- ═════════════════════════════════════════════════════════════════════════════


-- ── §13.4 · Six mois payés d'avance ──────────────────────────────────────────
--
-- Sans cette colonne, l'approbation accorderait trente jours à un paiement de
-- six mois. Le code refuse donc l'option tant qu'elle n'existe pas.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS billing_months SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_billing_months_check') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_billing_months_check CHECK (billing_months IN (1, 6));
  END IF;
END $$;


-- ── F01 · F13 · Les produits qui ne se stockent pas ──────────────────────────
--
-- Une coupe de cheveux, une réparation, la « vente au montant » : rien à sortir
-- d'un entrepôt. `products.track_inventory` existe depuis le schéma v2 ; le
-- déclencheur de vente l'ignorait et écrivait un mouvement de stock pour
-- chaque ligne. Le code de vente (app/actions/sales.ts) saute déjà ces lignes ;
-- le déclencheur en fait autant, sinon les deux moitiés du mouvement — celle
-- du déclencheur et celle du code — ne s'annuleraient plus.

CREATE OR REPLACE FUNCTION fn_on_sale_item_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_warehouse_id UUID;
  v_business_id  UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND track_inventory = false) THEN
    RETURN NEW;
  END IF;

  SELECT warehouse_id, business_id INTO v_warehouse_id, v_business_id
  FROM sales WHERE id = NEW.sale_id;

  IF v_warehouse_id IS NULL THEN
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


-- ── F08 · F22 · La caisse du jour : attendue, comptée, aide par aide ─────────
--
-- Une ligne par jour et par caisse. `member_user_id` NULL = la caisse du
-- commerce ; sinon la caisse tenue par un aide (F22, Elit). La caisse ATTENDUE
-- se calcule (fond de caisse + ventes en espèces + versements en espèces −
-- dépenses en espèces ± sòl) ; elle est figée ici à la clôture, à côté de ce
-- que le marchand a compté. L'écart, c'est la différence des deux.
--
-- Pas de `cash_registers` (schéma v2) : il exige un compte bancaire, et le
-- marchand de quartier n'en a pas pour sa caisse.

CREATE TABLE IF NOT EXISTS cash_days (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day            DATE          NOT NULL,
  member_user_id UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  opening_cash   NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  counted_cash   NUMERIC(20,4) CHECK (counted_cash IS NULL OR counted_cash >= 0),
  expected_cash  NUMERIC(20,4),
  closed_at      TIMESTAMPTZ,
  closed_by      UUID          REFERENCES auth.users(id),
  note           TEXT,
  created_by     UUID          REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT cash_days_one_per_day UNIQUE NULLS NOT DISTINCT (business_id, day, member_user_id)
);
CREATE INDEX IF NOT EXISTS idx_cash_days_biz_day ON cash_days(business_id, day DESC);


-- ── F17 · Sòl ak sabotaj ─────────────────────────────────────────────────────
--
-- Une cotisation n'est pas une dépense : l'argent revient le jour de la main.
-- Elle ne touche donc pas au profit, seulement à la caisse — c'est exactement
-- ce qui « sort de la caisse sans être prévu » (§12, F17).

CREATE TABLE IF NOT EXISTS sol_groups (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind          TEXT          NOT NULL DEFAULT 'sol' CHECK (kind IN ('sol', 'sabotaj')),
  name          TEXT          NOT NULL,
  contribution  NUMERIC(20,4) NOT NULL CHECK (contribution > 0),
  frequency     TEXT          NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  hands         INTEGER       CHECK (hands IS NULL OR hands > 0),
  start_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
  payout_date   DATE,
  payout_amount NUMERIC(20,4) CHECK (payout_amount IS NULL OR payout_amount >= 0),
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_by    UUID          REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sol_groups_biz ON sol_groups(business_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS sol_payments (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sol_id         UUID          NOT NULL REFERENCES sol_groups(id) ON DELETE CASCADE,
  -- 'out' = cotisation versée ; 'in' = la main reçue.
  direction      TEXT          NOT NULL DEFAULT 'out' CHECK (direction IN ('out', 'in')),
  amount         NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  paid_on        DATE          NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT          NOT NULL DEFAULT 'Cash',
  created_by     UUID          REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sol_payments_biz_day ON sol_payments(business_id, paid_on DESC);


-- ── F13 · Les fiches de travail (service) ────────────────────────────────────
--
-- Le travail est une vente à crédit dès qu'il est accepté : `sale_id` pointe
-- vers elle, l'avance est un versement sur cette vente, le solde est ce qui
-- reste dû — exactement le cahier de crédit, qui sait déjà suivre les
-- paiements partiels. La fiche ajoute ce que la vente ne dit pas : quoi,
-- pour quand, et où en est le travail.

CREATE TABLE IF NOT EXISTS work_orders (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id        UUID          REFERENCES sales(id) ON DELETE SET NULL,
  customer_id    UUID          REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  TEXT          NOT NULL,
  customer_phone TEXT,
  description    TEXT          NOT NULL,
  price          NUMERIC(20,4) NOT NULL CHECK (price >= 0),
  deposit        NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  status         TEXT          NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress', 'ready', 'delivered', 'cancelled')),
  due_date       DATE,
  ready_at       TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  created_by     UUID          REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_orders_biz_status ON work_orders(business_id, status, created_at DESC);


-- ── F14 · Ce que coûte une prestation ────────────────────────────────────────
--
-- Les consommables d'un service (« mèch », « pwodui defrisaj ») et leur coût
-- par prestation. Leur somme devient le prix d'achat du service
-- (`products.purchase_price`) : la marge de chaque coupe se calcule alors
-- par le même chemin que celle d'un produit, sans rien réécrire.

CREATE TABLE IF NOT EXISTS service_consumables (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_product_id UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label              TEXT          NOT NULL,
  cost               NUMERIC(20,4) NOT NULL CHECK (cost >= 0),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_consumables_service ON service_consumables(service_product_id);


-- ── F15 · Les rendez-vous ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_name    TEXT        NOT NULL,
  customer_phone   TEXT,
  service          TEXT,
  starts_at        TIMESTAMPTZ NOT NULL,
  duration_min     INTEGER     NOT NULL DEFAULT 30 CHECK (duration_min > 0),
  status           TEXT        NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned', 'done', 'no_show', 'cancelled')),
  reminder_sent_at TIMESTAMPTZ,
  note             TEXT,
  created_by       UUID        REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appointments_biz_start ON appointments(business_id, starts_at);


-- ── F16 · La paie des aides ──────────────────────────────────────────────────
--
-- À la journée (un montant par jour où l'aide a noté au moins une vente) ou au
-- pourcentage (de ce qu'il a vendu). Rien de plus : le module RH complet est
-- retiré des offres (§12.1).

ALTER TABLE business_members
  ADD COLUMN IF NOT EXISTS pay_mode TEXT,
  ADD COLUMN IF NOT EXISTS pay_rate NUMERIC(20,4);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_members_pay_mode_check') THEN
    ALTER TABLE business_members
      ADD CONSTRAINT business_members_pay_mode_check
      CHECK (pay_mode IS NULL OR pay_mode IN ('daily', 'percent'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_members_pay_rate_check') THEN
    ALTER TABLE business_members
      ADD CONSTRAINT business_members_pay_rate_check
      CHECK (pay_rate IS NULL OR pay_rate >= 0);
  END IF;
END $$;

-- « Ils notent, ils ne voient pas le profit » (§13.2) : un aide invité arrive
-- caissier — il enregistre des ventes, il ne lit pas les rapports. Le rôle
-- `viewer`, défaut d'avant, lisait les rapports et ne pouvait PAS vendre :
-- exactement l'inverse de ce qu'on attend d'un aide.
DO $$
BEGIN
  ALTER TABLE employee_invitations ALTER COLUMN role SET DEFAULT 'cashier';
EXCEPTION WHEN undefined_table OR undefined_column OR invalid_text_representation OR datatype_mismatch THEN
  RAISE NOTICE 'employee_invitations.role : défaut non modifié.';
END $$;


-- ── La sécurité des nouvelles tables ─────────────────────────────────────────
--
-- Membre actif du commerce : lire et écrire. Comme partout ailleurs, la
-- décision fine (qui voit la caisse, qui règle la paie) est prise par les
-- actions serveur, à partir du rôle.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_days', 'sol_groups', 'sol_payments', 'work_orders', 'service_consumables', 'appointments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_member_rw', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id))',
      t || '_member_rw', t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;
