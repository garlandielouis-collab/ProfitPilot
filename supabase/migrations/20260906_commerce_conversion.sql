-- ══════════════════════════════════════════════════════════════════════════════
-- COMMERCE — avis, promotions, traçabilité, mesure, crédits IA
--
-- Phases 3, 5, 6 et 7 du plan.
--
--   §1  `order_status_history` et `payment_transactions` — la commande cesse
--       d'être un état sans passé (§23, §49).
--   §2  `reviews` — des avis de VRAIS acheteurs, et rien d'autre (§27).
--   §3  `coupons` — les promotions, appliquées côté serveur (§28).
--   §4  `store_analytics_events` — l'entonnoir, mesuré (§30).
--   §5  `ai_credit_ledger` — les actions IA se paient en crédits (§39).
--   §6  `create_store_order` reprend le tout : coupon, vente à découvert,
--       événement d'achat.
--
-- Idempotente. Rejouable.
-- ══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- §1. LA COMMANDE A UNE HISTOIRE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS order_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  note        TEXT,
  changed_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_history_order
  ON order_status_history (order_id, created_at DESC);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_history_member_read" ON order_status_history;
CREATE POLICY "order_history_member_read" ON order_status_history
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = order_status_history.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(order_status_history.business_id)
  );

/**
 * Consigne chaque changement d'état.
 *
 * Un déclencheur, et non un appel applicatif : le statut se modifie depuis
 * l'écran des commandes, depuis les rappels de passerelle et depuis les
 * fonctions SQL. Trois chemins, et il n'en faut qu'un qui oublie pour que
 * l'historique mente.
 */
CREATE OR REPLACE FUNCTION fn_orders_track_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_status_history (order_id, business_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NEW.business_id, NULL, NEW.status, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO order_status_history (order_id, business_id, from_status, to_status, note, changed_by)
    VALUES (
      NEW.id, NEW.business_id, OLD.status, NEW.status,
      CASE WHEN NEW.payment_status IS DISTINCT FROM OLD.payment_status
           THEN 'paiement : ' || OLD.payment_status || ' → ' || NEW.payment_status END,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_track_status ON orders;
CREATE TRIGGER trg_orders_track_status
  AFTER INSERT OR UPDATE OF status, payment_status ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_orders_track_status();


-- Les tentatives de paiement, réussies ou non. `orders.payment_transaction_id`
-- ne garde que la dernière ; c'est insuffisant le jour où un client conteste.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id       UUID          REFERENCES orders(id) ON DELETE SET NULL,
  gateway        TEXT          NOT NULL,
  transaction_id TEXT,
  amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       TEXT          NOT NULL DEFAULT 'HTG',
  status         TEXT          NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','succeeded','failed','refunded')),
  -- La réponse du fournisseur, telle quelle. Sans elle, une réconciliation six
  -- mois plus tard se fait à l'aveugle.
  raw            JSONB,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_order ON payment_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_biz   ON payment_transactions (business_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_tx_gateway_ref
  ON payment_transactions (gateway, transaction_id) WHERE transaction_id IS NOT NULL;

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_tx_member_read" ON payment_transactions;
CREATE POLICY "payment_tx_member_read" ON payment_transactions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = payment_transactions.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(payment_transactions.business_id)
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- §2. LES AVIS — DE VRAIS CLIENTS, ET RIEN D'AUTRE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- « Ne jamais inventer de reviews. Les avis doivent provenir de vrais
-- clients. » (§27)
--
-- Ce n'est pas une intention, c'est une contrainte de schéma : `order_id` est
-- NOT NULL. Un avis sans commande ne peut pas exister. La contrainte d'unicité
-- fait le reste : une ligne de commande, un avis.
--
-- Et le marchand ne peut pas en écrire. Aucune politique d'écriture n'est
-- accordée : seule la clé service insère, après avoir vérifié que l'adresse du
-- déposant est bien celle de la commande.

CREATE TABLE IF NOT EXISTS reviews (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id   UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id     UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id  UUID        REFERENCES customers(id) ON DELETE SET NULL,
  author_name  TEXT        NOT NULL,
  rating       SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         TEXT,
  -- Le marchand modère : il peut refuser une insulte, il ne peut pas fabriquer
  -- un éloge. `pending` par défaut, jamais `published`.
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','published','rejected')),
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_published
  ON reviews (product_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_reviews_business
  ON reviews (business_id, created_at DESC);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Trois politiques, et VOLONTAIREMENT aucune pour l'INSERT.
--
-- Un membre lit (pour modérer), modifie (le statut) et supprime (un avis
-- diffamatoire). Il ne peut pas en créer : sans politique d'INSERT, RLS refuse.
-- C'est la garantie structurelle du §27 — « ne jamais inventer de reviews » ne
-- repose pas sur la discipline du code applicatif.
--
-- Le dépôt d'un avis passe par la clé service, après vérification que l'adresse
-- du déposant est celle de la commande.

DROP POLICY IF EXISTS "reviews_member_manage" ON reviews;
DROP POLICY IF EXISTS "reviews_member_read"   ON reviews;
DROP POLICY IF EXISTS "reviews_member_update" ON reviews;
DROP POLICY IF EXISTS "reviews_member_delete" ON reviews;

CREATE POLICY "reviews_member_read" ON reviews
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = reviews.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(reviews.business_id)
  );

CREATE POLICY "reviews_member_update" ON reviews
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = reviews.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(reviews.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = reviews.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(reviews.business_id)
  );

CREATE POLICY "reviews_member_delete" ON reviews
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = reviews.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(reviews.business_id)
  );

/** La note moyenne et le nombre d'avis publiés, par produit. */
CREATE OR REPLACE VIEW v_product_ratings
WITH (security_invoker = true) AS
  SELECT
    business_id,
    product_id,
    ROUND(AVG(rating)::NUMERIC, 2) AS rating_average,
    COUNT(*)::BIGINT               AS rating_count
  FROM reviews
  WHERE status = 'published'
  GROUP BY business_id, product_id;

GRANT SELECT ON v_product_ratings TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- §3. LES PROMOTIONS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coupons (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code           TEXT          NOT NULL,
  kind           TEXT          NOT NULL DEFAULT 'percent'
                               CHECK (kind IN ('percent','amount','free_shipping')),
  value          NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_subtotal   NUMERIC(12,2) NOT NULL DEFAULT 0,
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  -- NULL = sans limite. 0 serait ambigu : « épuisé » ou « illimité » ?
  max_uses       INTEGER,
  used_count     INTEGER       NOT NULL DEFAULT 0,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Un code se saisit sans se soucier de la casse : « BONJOUR » et « bonjour »
-- sont le même coupon, et deux coupons ne peuvent pas s'en disputer un.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code
  ON coupons (business_id, upper(code));

DROP TRIGGER IF EXISTS trg_coupons_updated_at ON coupons;
CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_member_all" ON coupons;
CREATE POLICY "coupons_member_all" ON coupons
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = coupons.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(coupons.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = coupons.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(coupons.business_id)
  );

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_id   UUID REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT;

/**
 * Ce qu'un code vaut sur un sous-total donné, ou pourquoi il ne vaut rien.
 *
 * Renvoie toujours une ligne : le tunnel d'achat a besoin d'un message, pas
 * d'une exception. `discount` est le montant à retirer du sous-total ;
 * `free_shipping` est traité à part parce qu'il porte sur les frais de port,
 * pas sur la marchandise.
 */
CREATE OR REPLACE FUNCTION public.evaluate_store_coupon(
  p_business_id UUID,
  p_code        TEXT,
  p_subtotal    NUMERIC
)
RETURNS TABLE (
  coupon_id     UUID,
  is_valid      BOOLEAN,
  reason        TEXT,
  discount      NUMERIC,
  free_shipping BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c coupons%ROWTYPE;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, NULL::TEXT, 0::NUMERIC, FALSE;
    RETURN;
  END IF;

  SELECT * INTO c FROM coupons
  WHERE business_id = p_business_id AND upper(code) = upper(btrim(p_code));

  IF NOT FOUND OR c.is_active = FALSE THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Ce code n''existe pas.', 0::NUMERIC, FALSE;
    RETURN;
  END IF;

  IF c.starts_at IS NOT NULL AND NOW() < c.starts_at THEN
    RETURN QUERY SELECT c.id, FALSE, 'Ce code n''est pas encore actif.', 0::NUMERIC, FALSE;
    RETURN;
  END IF;

  IF c.ends_at IS NOT NULL AND NOW() > c.ends_at THEN
    RETURN QUERY SELECT c.id, FALSE, 'Ce code a expiré.', 0::NUMERIC, FALSE;
    RETURN;
  END IF;

  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN QUERY SELECT c.id, FALSE, 'Ce code a atteint sa limite d''utilisation.', 0::NUMERIC, FALSE;
    RETURN;
  END IF;

  IF p_subtotal < c.min_subtotal THEN
    RETURN QUERY SELECT c.id, FALSE,
      'Ce code s''applique à partir de ' || trim(to_char(c.min_subtotal, 'FM999G999G999D99')) || '.',
      0::NUMERIC, FALSE;
    RETURN;
  END IF;

  IF c.kind = 'free_shipping' THEN
    RETURN QUERY SELECT c.id, TRUE, NULL::TEXT, 0::NUMERIC, TRUE;
  ELSIF c.kind = 'percent' THEN
    -- Borné au sous-total : un code à 150 % ne rend pas d'argent.
    RETURN QUERY SELECT c.id, TRUE, NULL::TEXT,
      LEAST(ROUND(p_subtotal * LEAST(c.value, 100) / 100, 2), p_subtotal), FALSE;
  ELSE
    RETURN QUERY SELECT c.id, TRUE, NULL::TEXT, LEAST(ROUND(c.value, 2), p_subtotal), FALSE;
  END IF;
END $$;

REVOKE ALL     ON FUNCTION public.evaluate_store_coupon(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.evaluate_store_coupon(UUID, TEXT, NUMERIC) TO   service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- §4. LA MESURE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- L'entonnoir du §30 : Visiteurs → Vues produit → Panier → Checkout → Achat.
--
-- Aucune donnée personnelle. `session_id` est un identifiant aléatoire posé par
-- le navigateur pour la durée de l'onglet ; il ne suit personne d'un site à
-- l'autre et ne survit pas à la fermeture. C'est assez pour compter un
-- entonnoir, et c'est tout ce qu'il faut.

CREATE TABLE IF NOT EXISTS store_analytics_events (
  id          BIGSERIAL   PRIMARY KEY,
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  session_id  TEXT        NOT NULL,
  event_type  TEXT        NOT NULL
                          CHECK (event_type IN (
                            'page_view','product_view','add_to_cart',
                            'checkout_started','purchase','whatsapp_click'
                          )),
  product_id  UUID,
  value       NUMERIC(12,2),
  path        TEXT,
  -- L'hôte de provenance seulement (« instagram.com »), jamais l'URL complète :
  -- une URL de référent porte parfois un identifiant de campagne, parfois le
  -- nom du visiteur.
  referrer    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_biz_time
  ON store_analytics_events (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_biz_type
  ON store_analytics_events (business_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_product
  ON store_analytics_events (product_id) WHERE product_id IS NOT NULL;

ALTER TABLE store_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_member_read" ON store_analytics_events;
CREATE POLICY "events_member_read" ON store_analytics_events
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = store_analytics_events.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(store_analytics_events.business_id)
  );

/** L'entonnoir sur une fenêtre donnée. Une requête, cinq nombres. */
CREATE OR REPLACE FUNCTION public.store_funnel(p_business_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  visitors          BIGINT,
  product_views     BIGINT,
  add_to_carts      BIGINT,
  checkouts_started BIGINT,
  purchases         BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(DISTINCT session_id)                                                    AS visitors,
    COUNT(*) FILTER (WHERE event_type = 'product_view')                           AS product_views,
    COUNT(*) FILTER (WHERE event_type = 'add_to_cart')                            AS add_to_carts,
    COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'checkout_started')     AS checkouts_started,
    COUNT(*) FILTER (WHERE event_type = 'purchase')                               AS purchases
  FROM store_analytics_events
  WHERE business_id = p_business_id
    AND created_at >= NOW() - make_interval(days => GREATEST(1, p_days))
$$;

REVOKE ALL     ON FUNCTION public.store_funnel(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.store_funnel(UUID, INTEGER) TO   service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- §5. LES CRÉDITS IA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un grand livre de mouvements, pas un compteur. Un solde stocké se désynchronise
-- au premier incident ; une somme de lignes se recalcule et s'auditera toujours.
--
-- L'allocation mensuelle est une ligne comme une autre, créée à la demande le
-- premier jour du mois où le marchand s'en sert. Pas de tâche planifiée à
-- surveiller : ce qui n'a pas tourné n'a pas de conséquence.

CREATE TABLE IF NOT EXISTS ai_credit_costs (
  action  TEXT    PRIMARY KEY,
  credits INTEGER NOT NULL CHECK (credits >= 0),
  label   TEXT    NOT NULL
);

INSERT INTO ai_credit_costs (action, credits, label) VALUES
  ('image_enhance',       2, 'Retouche photo produit'),
  ('image_background',    2, 'Remplacement d''arrière-plan'),
  ('image_upscale',       3, 'Agrandissement haute résolution'),
  ('product_description', 1, 'Rédaction de fiche produit'),
  ('product_seo',         1, 'Optimisation SEO'),
  ('merchandising',       2, 'Analyse du catalogue'),
  ('bundle',              2, 'Proposition de lot')
ON CONFLICT (action) DO UPDATE
  SET credits = EXCLUDED.credits, label = EXCLUDED.label;

ALTER TABLE ai_credit_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_costs_read" ON ai_credit_costs;
CREATE POLICY "ai_costs_read" ON ai_credit_costs FOR SELECT TO authenticated USING (TRUE);
GRANT SELECT ON ai_credit_costs TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS ai_credit_ledger (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Positif = allocation ou bonus. Négatif = consommation.
  delta       INTEGER     NOT NULL,
  action      TEXT        NOT NULL,
  -- 'YYYY-MM' pour une allocation mensuelle : sert de clé d'idempotence.
  period      TEXT,
  reference   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_ledger_biz ON ai_credit_ledger (business_id, created_at DESC);
-- Une allocation par entreprise et par mois, garantie par la base.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_ledger_grant_period
  ON ai_credit_ledger (business_id, period) WHERE action = 'monthly_grant';

ALTER TABLE ai_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_ledger_member_read" ON ai_credit_ledger;
CREATE POLICY "ai_ledger_member_read" ON ai_credit_ledger
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = ai_credit_ledger.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(ai_credit_ledger.business_id)
  );

/**
 * Crédite l'allocation du mois si elle ne l'a pas déjà été, puis rend le solde.
 *
 * `p_monthly` vient de l'offre, calculée côté application : la base n'a pas à
 * connaître la grille tarifaire.
 */
CREATE OR REPLACE FUNCTION public.ai_credit_balance(p_business_id UUID, p_monthly INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period  TEXT := to_char(NOW(), 'YYYY-MM');
  v_balance INTEGER;
BEGIN
  IF p_monthly > 0 THEN
    INSERT INTO ai_credit_ledger (business_id, delta, action, period, reference)
    VALUES (p_business_id, p_monthly, 'monthly_grant', v_period, 'Allocation ' || v_period)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO v_balance
  FROM ai_credit_ledger WHERE business_id = p_business_id;

  RETURN v_balance;
END $$;

/**
 * Consomme des crédits pour une action, ou refuse.
 *
 * Le verrou consultatif sérialise les débits d'une même entreprise : sans lui,
 * deux retouches lancées ensemble passent toutes deux le contrôle de solde et
 * le font descendre sous zéro.
 */
CREATE OR REPLACE FUNCTION public.ai_credit_spend(
  p_business_id UUID,
  p_user_id     UUID,
  p_action      TEXT,
  p_monthly     INTEGER,
  p_reference   TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, cost INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost    INTEGER;
  v_balance INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pp_ai_credits:' || p_business_id::TEXT));

  SELECT credits INTO v_cost FROM ai_credit_costs WHERE action = p_action;
  -- Action inconnue : on ne facture pas au hasard, on laisse passer à 0.
  IF v_cost IS NULL THEN v_cost := 0; END IF;

  v_balance := public.ai_credit_balance(p_business_id, p_monthly);

  IF v_cost > 0 AND v_balance < v_cost THEN
    RETURN QUERY SELECT FALSE, v_cost, v_balance;
    RETURN;
  END IF;

  IF v_cost > 0 THEN
    INSERT INTO ai_credit_ledger (business_id, user_id, delta, action, reference)
    VALUES (p_business_id, p_user_id, -v_cost, p_action, p_reference);
    v_balance := v_balance - v_cost;
  END IF;

  RETURN QUERY SELECT TRUE, v_cost, v_balance;
END $$;

/** Rembourse une action qui a échoué. Un travail raté ne se facture pas. */
CREATE OR REPLACE FUNCTION public.ai_credit_refund(
  p_business_id UUID,
  p_action      TEXT,
  p_reference   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cost INTEGER;
BEGIN
  SELECT credits INTO v_cost FROM ai_credit_costs WHERE action = p_action;
  IF COALESCE(v_cost, 0) > 0 THEN
    INSERT INTO ai_credit_ledger (business_id, delta, action, reference)
    VALUES (p_business_id, v_cost, p_action || '_refund', p_reference);
  END IF;
END $$;

REVOKE ALL     ON FUNCTION public.ai_credit_balance(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ai_credit_balance(UUID, INTEGER) TO   service_role;
REVOKE ALL     ON FUNCTION public.ai_credit_spend(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ai_credit_spend(UUID, UUID, TEXT, INTEGER, TEXT) TO   service_role;
REVOKE ALL     ON FUNCTION public.ai_credit_refund(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ai_credit_refund(UUID, TEXT, TEXT) TO   service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- §6. `create_store_order` REPREND LE TOUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ajouts par rapport à 20260904 : le coupon (évalué en base, jamais reçu du
-- navigateur), la vente à découvert (`allow_backorders`), et l'événement
-- d'achat qui boucle l'entonnoir.

DROP FUNCTION IF EXISTS public.create_store_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_store_order(
  p_business_id      UUID,
  p_customer_name    TEXT,
  p_customer_email   TEXT,
  p_customer_phone   TEXT,
  p_shipping_address JSONB,
  p_shipping_mode    TEXT,
  p_payment_method   TEXT,
  p_notes            TEXT,
  p_items            JSONB,
  p_coupon_code      TEXT DEFAULT NULL,
  p_session_id       TEXT DEFAULT NULL
)
RETURNS TABLE (
  out_order_id       UUID,
  out_order_number   TEXT,
  out_order_total    NUMERIC,
  out_discount       NUMERIC,
  out_coupon_applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store       store_settings%ROWTYPE;
  v_only_pub    BOOLEAN := FALSE;
  v_item        JSONB;
  v_lines       JSONB   := '[]'::jsonb;
  v_p           RECORD;
  v_qty         INTEGER;
  v_price       NUMERIC(12,2);
  v_line_total  NUMERIC(12,2);
  v_subtotal    NUMERIC(12,2) := 0;
  v_shipping    NUMERIC(12,2) := 0;
  v_discount    NUMERIC(12,2) := 0;
  v_total       NUMERIC(12,2);
  v_mode        JSONB;
  v_customer_id UUID;
  v_order_id    UUID;
  v_number      TEXT;
  v_first       TEXT;
  v_last        TEXT;
  v_email       TEXT;
  v_coupon      RECORD;
  v_coupon_id   UUID    := NULL;
  v_coupon_ok   BOOLEAN := FALSE;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Votre panier est vide.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_store
  FROM store_settings
  WHERE business_id = p_business_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette boutique n''est pas ouverte.' USING ERRCODE = 'P0002';
  END IF;

  v_only_pub := COALESCE(v_store.theme_config -> 'catalog' ->> 'mode', 'all') = 'selected';

  -- ── Les lignes, relues depuis le catalogue ────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(1, LEAST(999, COALESCE((v_item ->> 'quantity')::INTEGER, 1)));

    SELECT p.id, p.name, p.sale_price, p.purchase_price, p.stock_quantity,
           p.image_url, p.enhanced_image_url, p.is_published_to_store,
           p.allow_backorders
      INTO v_p
      FROM products p
     WHERE p.id          = (v_item ->> 'product_id')::UUID
       AND p.business_id = p_business_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Un article de votre panier n''est plus disponible.'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_only_pub AND COALESCE(v_p.is_published_to_store, FALSE) = FALSE THEN
      RAISE EXCEPTION '« % » n''est plus en vente.', v_p.name USING ERRCODE = 'P0002';
    END IF;

    -- §25 : le stock ne bloque que si le marchand n'a pas autorisé la vente à
    -- découvert sur cette fiche.
    IF COALESCE(v_p.allow_backorders, FALSE) = FALSE
       AND COALESCE(v_p.stock_quantity, 0) < v_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour « % » : il en reste %.',
        v_p.name, GREATEST(0, COALESCE(v_p.stock_quantity, 0))
        USING ERRCODE = '23514';
    END IF;

    v_price      := ROUND(COALESCE(v_p.sale_price, v_p.purchase_price, 0)::NUMERIC, 2);
    v_line_total := ROUND(v_price * v_qty, 2);
    v_subtotal   := v_subtotal + v_line_total;

    v_lines := v_lines || jsonb_build_object(
      'product_id',    v_p.id,
      'product_name',  v_p.name,
      'product_image', COALESCE(v_p.enhanced_image_url, v_p.image_url),
      'quantity',      v_qty,
      'unit_price',    v_price,
      'total_price',   v_line_total
    );
  END LOOP;

  -- ── Les frais de port ─────────────────────────────────────────────────────
  IF p_shipping_mode IS NOT NULL AND p_shipping_mode <> '' THEN
    SELECT m INTO v_mode
    FROM jsonb_array_elements(COALESCE(v_store.shipping_modes, '[]'::jsonb)) m
    WHERE m ->> 'id' = p_shipping_mode
    LIMIT 1;

    IF v_mode IS NULL THEN
      RAISE EXCEPTION 'Mode de livraison inconnu.' USING ERRCODE = '22023';
    END IF;

    v_shipping := ROUND(COALESCE((v_mode ->> 'price')::NUMERIC, 0), 2);
  END IF;

  IF p_payment_method IS NULL
     OR NOT (v_store.payment_methods @> to_jsonb(p_payment_method::TEXT)) THEN
    RAISE EXCEPTION 'Ce mode de paiement n''est pas proposé par la boutique.'
      USING ERRCODE = '22023';
  END IF;

  -- ── Le coupon ─────────────────────────────────────────────────────────────
  --
  -- Le navigateur envoie un CODE, jamais un montant. Un code invalide ne fait
  -- pas échouer la commande : il ne s'applique pas, et l'appelant le voit à
  -- `out_coupon_applied`. Refuser toute la commande parce qu'un code a expiré
  -- entre le panier et le paiement ferait perdre une vente déjà faite.
  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    SELECT * INTO v_coupon
    FROM public.evaluate_store_coupon(p_business_id, p_coupon_code, v_subtotal);

    IF v_coupon.is_valid THEN
      v_coupon_id := v_coupon.coupon_id;
      v_coupon_ok := TRUE;
      IF v_coupon.free_shipping THEN
        v_shipping := 0;
      ELSE
        v_discount := v_coupon.discount;
      END IF;

      UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon_id;
    END IF;
  END IF;

  v_total := ROUND(GREATEST(0, v_subtotal - v_discount) + v_shipping, 2);

  -- ── Le client ─────────────────────────────────────────────────────────────
  v_email := lower(trim(COALESCE(p_customer_email, '')));
  v_first := NULLIF(split_part(trim(COALESCE(p_customer_name, '')), ' ', 1), '');
  v_last  := NULLIF(trim(substr(trim(COALESCE(p_customer_name, '')),
                                length(COALESCE(v_first, '')) + 1)), '');

  IF v_email <> '' THEN
    INSERT INTO customers (business_id, email, first_name, last_name, phone)
    VALUES (p_business_id, v_email,
            COALESCE(v_first, 'Client'), COALESCE(v_last, '-'),
            NULLIF(trim(COALESCE(p_customer_phone, '')), ''))
    ON CONFLICT (business_id, email) DO UPDATE
      SET phone = COALESCE(EXCLUDED.phone, customers.phone)
    RETURNING id INTO v_customer_id;
  END IF;

  -- ── La commande ───────────────────────────────────────────────────────────
  v_number := public.next_store_order_number(p_business_id);

  INSERT INTO orders (
    business_id, order_number, customer_id,
    customer_name, customer_email, customer_phone,
    status, payment_status, payment_method,
    subtotal, shipping_amount, discount_amount, total, currency,
    shipping_address, shipping_mode, notes,
    coupon_id, coupon_code
  ) VALUES (
    p_business_id, v_number, v_customer_id,
    trim(COALESCE(p_customer_name, 'Client')), v_email,
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    'pending', 'unpaid', p_payment_method,
    v_subtotal, v_shipping, v_discount, v_total,
    COALESCE(v_store.currency, 'HTG'),
    p_shipping_address, NULLIF(p_shipping_mode, ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_coupon_id, CASE WHEN v_coupon_ok THEN upper(btrim(p_coupon_code)) END
  )
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (
    order_id, business_id, product_id, product_name, product_image,
    quantity, unit_price, total_price
  )
  SELECT v_order_id, p_business_id,
         (l ->> 'product_id')::UUID,
         l ->> 'product_name',
         l ->> 'product_image',
         (l ->> 'quantity')::INTEGER,
         (l ->> 'unit_price')::NUMERIC,
         (l ->> 'total_price')::NUMERIC
  FROM jsonb_array_elements(v_lines) l;

  -- Le bout de l'entonnoir. Enregistré ici et pas dans le navigateur : c'est le
  -- seul endroit où « acheté » est certain.
  IF p_session_id IS NOT NULL AND btrim(p_session_id) <> '' THEN
    INSERT INTO store_analytics_events (business_id, session_id, event_type, value)
    VALUES (p_business_id, left(p_session_id, 64), 'purchase', v_total);
  END IF;

  RETURN QUERY SELECT v_order_id, v_number, v_total, v_discount, v_coupon_ok;
END $$;

REVOKE ALL ON FUNCTION public.create_store_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT)
  TO service_role;
