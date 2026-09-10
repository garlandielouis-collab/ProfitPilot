-- ══════════════════════════════════════════════════════════════════════════════
-- COMMERCE — cloisonnement, intégrité des commandes, convergence du catalogue
--
-- Cette migration répare quatre choses que l'audit a trouvées, et n'en ajoute
-- aucune fonctionnalité. Elle étend l'existant : aucun DROP TABLE, aucune
-- colonne métier supprimée sans que son contenu ait d'abord été déplacé.
--
--   §1  Les identifiants de passerelle quittent `store_settings`.
--       `store_settings` porte une politique de lecture publique (is_active) ET
--       un GRANT à `authenticated` : n'importe quel marchand connecté pouvait
--       lire `payment_credentials` de toutes les boutiques actives. Une colonne
--       secrète dans une table publiquement lisible ne se protège pas par une
--       promesse — elle se déplace.
--
--   §2  La vitrine se résout par fonction, plus par lecture directe.
--       Le proxy interrogeait `store_settings` avec la clé anon, qui n'a jamais
--       eu de GRANT dessus : la requête revenait « permission denied » et la
--       fonction avalait l'échec. Les domaines personnalisés ne résolvaient donc
--       jamais, silencieusement.
--
--   §3  `products.business_id` devient la clé de cadrage.
--       La table portait les deux (user_id ET business_id) et l'application
--       lisait tantôt l'un, tantôt l'autre : les rapports et la sauvegarde
--       filtraient par entreprise pendant que le catalogue et la vitrine
--       filtraient par utilisateur. Un produit créé par un employé était
--       invisible en boutique.
--
--   §4  La commande devient atomique et le prix vient du serveur.
--       `createStoreOrder` acceptait `unit_price` depuis le navigateur, et
--       `confirmOrderAsSale` faisait un lire-puis-écrire du stock hors
--       transaction — deux confirmations simultanées perdaient un décrément.
--       Cette même fonction écrivait par ailleurs dans des colonnes qui
--       n'existent pas (`sales.client_name`, `sale_items.total_price`) : la
--       synchronisation vitrine → ProfitPilot n'a jamais produit une seule
--       vente.
--
-- Idempotente. Rejouable.
-- ══════════════════════════════════════════════════════════════════════════════

-- Le trigger de mise à jour de `updated_at`, si une migration antérieure ne l'a
-- pas déjà posé.
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- §1. LES IDENTIFIANTS DE PASSERELLE SORTENT DE `store_settings`
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS store_payment_credentials (
  business_id UUID        PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  -- { "moncash": { "client_id": "", "client_secret": "", "sandbox": false },
  --   "natcash":  { … } }
  credentials JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_store_payment_credentials_updated_at ON store_payment_credentials;
CREATE TRIGGER trg_store_payment_credentials_updated_at
  BEFORE UPDATE ON store_payment_credentials
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Déménagement du contenu, puis suppression de la colonne. Dans cet ordre, et
-- dans la même transaction : rien ne se perd même si la migration est
-- interrompue.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'store_settings'
      AND column_name  = 'payment_credentials'
  ) THEN
    INSERT INTO store_payment_credentials (business_id, credentials)
    SELECT business_id, payment_credentials
    FROM store_settings
    WHERE payment_credentials IS NOT NULL
      AND payment_credentials <> '{}'::jsonb
    ON CONFLICT (business_id) DO NOTHING;

    ALTER TABLE store_settings DROP COLUMN payment_credentials;
  END IF;
END $$;

-- Aucune politique RLS n'est créée : sans politique, RLS refuse tout. Seul
-- `service_role`, qui contourne RLS, lit cette table — c'est-à-dire uniquement
-- les routes serveur des passerelles.
ALTER TABLE store_payment_credentials ENABLE ROW LEVEL SECURITY;

-- Le REVOKE est indispensable : `20260713_grant_all_tables.sql` a posé un
-- ALTER DEFAULT PRIVILEGES qui accorde tout à `authenticated` sur CHAQUE table
-- créée ensuite, celle-ci comprise.
REVOKE ALL ON store_payment_credentials FROM anon, authenticated;
GRANT  ALL ON store_payment_credentials TO   service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- §2. VITRINE — QUI PEUT LIRE, ET COMMENT LE PROXY RÉSOUT UN DOMAINE
-- ═══════════════════════════════════════════════════════════════════════════

-- `ss_public_read` autorisait la lecture de TOUTE ligne active par n'importe
-- quel rôle disposant d'un GRANT — c'est-à-dire tout compte connecté. Elle
-- disparaît : la vitrine publique est servie par la clé service, qui contourne
-- RLS de toute façon, et la résolution de domaine passe désormais par la
-- fonction ci-dessous.
DROP POLICY IF EXISTS "ss_public_read" ON store_settings;

-- `ss_owner_all` ne connaissait que le propriétaire. Un employé chargé du
-- catalogue pouvait retoucher une photo (`ai_jobs_member_all` l'autorise) mais
-- pas publier la boutique. Les deux politiques s'accordent maintenant.
DROP POLICY IF EXISTS "ss_owner_all"                ON store_settings;
DROP POLICY IF EXISTS "store_settings_member_all"   ON store_settings;
CREATE POLICY "store_settings_member_all" ON store_settings
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = store_settings.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(store_settings.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = store_settings.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(store_settings.business_id)
  );

/**
 * Le slug servi derrière un domaine acheté par le marchand.
 *
 * SECURITY DEFINER et rien d'autre : la fonction ne rend qu'un slug, jamais une
 * ligne. C'est exactement ce dont le proxy a besoin sur l'edge, et c'est tout
 * ce qu'un visiteur non authentifié peut en tirer.
 */
CREATE OR REPLACE FUNCTION public.resolve_store_domain(p_host TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.slug
  FROM store_settings s
  WHERE s.is_active = TRUE
    AND lower(s.custom_domain) = lower(trim(p_host))
  LIMIT 1
$$;

REVOKE ALL     ON FUNCTION public.resolve_store_domain(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_store_domain(TEXT) TO   anon, authenticated;


-- ── Les portes ouvertes du parcours invité ──────────────────────────────────
--
-- `WITH CHECK (TRUE)` autorisait n'importe quel compte connecté à écrire une
-- commande, une ligne de commande ou un client dans l'entreprise de quelqu'un
-- d'autre. Ces politiques ne servaient personne : le tunnel d'achat écrit par
-- la clé service, qui ne passe pas par RLS.

DROP POLICY IF EXISTS "orders_public_insert"      ON orders;
DROP POLICY IF EXISTS "order_items_public_insert" ON order_items;
DROP POLICY IF EXISTS "customers_public_insert"   ON customers;
DROP POLICY IF EXISTS "addresses_public_insert"   ON customer_addresses;

-- Et pendant qu'on y est : les mêmes tables ne connaissaient que le
-- propriétaire en écriture. Le CRM (`app/actions/customers.ts`) écrit avec le
-- client authentifié — un employé ne pouvait donc pas enregistrer un client.
DROP POLICY IF EXISTS "customers_owner_all"  ON customers;
DROP POLICY IF EXISTS "customers_member_all" ON customers;
CREATE POLICY "customers_member_all" ON customers
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = customers.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(customers.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = customers.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(customers.business_id)
  );

DROP POLICY IF EXISTS "addresses_owner_all"  ON customer_addresses;
DROP POLICY IF EXISTS "addresses_member_all" ON customer_addresses;
CREATE POLICY "addresses_member_all" ON customer_addresses
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = customer_addresses.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(customer_addresses.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = customer_addresses.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(customer_addresses.business_id)
  );

DROP POLICY IF EXISTS "orders_owner_all"  ON orders;
DROP POLICY IF EXISTS "orders_member_read" ON orders;
DROP POLICY IF EXISTS "orders_member_all"  ON orders;
CREATE POLICY "orders_member_all" ON orders
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = orders.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(orders.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = orders.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(orders.business_id)
  );

DROP POLICY IF EXISTS "order_items_owner_all"  ON order_items;
DROP POLICY IF EXISTS "order_items_member_read" ON order_items;
DROP POLICY IF EXISTS "order_items_member_all"  ON order_items;
CREATE POLICY "order_items_member_all" ON order_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = order_items.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(order_items.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = order_items.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(order_items.business_id)
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- §3. CATALOGUE — `business_id` DEVIENT LA CLÉ DE CADRAGE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La politique RLS `products_access` (20260606) accepte déjà les deux :
-- `user_id = auth.uid() OR is_business_member(business_id)`. Il ne manquait que
-- la donnée — et qu'un seul des deux chemins soit choisi côté application.

-- 1. À quelle entreprise appartient un produit orphelin ?
--
--    D'abord la plus ancienne entreprise vivante de son créateur : le commerce
--    principal, celui créé à l'inscription. Ensuite seulement, s'il n'en possède
--    aucune, la plus ancienne dont il est membre actif — c'est le cas d'un
--    employé qui tient le catalogue. Sans ce second recours, sa fiche resterait
--    orpheline et DISPARAÎTRAIT de l'écran produits, où elle était visible par
--    `user_id`. Une migration de cadrage ne doit rien faire disparaître.
CREATE OR REPLACE FUNCTION fn_business_of_user(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT b.id
  FROM businesses b
  WHERE b.owner_id = p_user_id AND b.deleted_at IS NULL
  ORDER BY b.created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION fn_business_or_membership_of_user(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    fn_business_of_user(p_user_id),
    (SELECT bm.business_id
       FROM business_members bm
       JOIN businesses b ON b.id = bm.business_id AND b.deleted_at IS NULL
      WHERE bm.user_id   = p_user_id
        AND bm.is_active = TRUE
        AND bm.deleted_at IS NULL
      ORDER BY bm.created_at ASC
      LIMIT 1)
  )
$$;

UPDATE products p
SET business_id = fn_business_or_membership_of_user(p.user_id)
WHERE p.business_id IS NULL
  AND p.user_id IS NOT NULL;

-- 2. Et pour l'avenir : une insertion qui oublie `business_id` ne crée plus un
--    orphelin invisible, elle le rattache. Le garde-fou vaut mieux que la
--    contrainte seule — il répare au lieu de refuser.
CREATE OR REPLACE FUNCTION fn_products_default_business()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.business_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.business_id := fn_business_or_membership_of_user(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_default_business ON products;
CREATE TRIGGER trg_products_default_business
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION fn_products_default_business();

-- 3. NOT NULL seulement si plus rien ne traîne. Un compte sans entreprise —
--    inscription interrompue — laisserait un orphelin qu'on ne veut pas rendre
--    ininsérable au milieu d'une migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE business_id IS NULL) THEN
    ALTER TABLE products ALTER COLUMN business_id SET NOT NULL;
  ELSE
    RAISE NOTICE
      'products.business_id laissé nullable : % ligne(s) sans entreprise rattachable.',
      (SELECT COUNT(*) FROM products WHERE business_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_business ON products (business_id);

-- « Les produits publiés de cette entreprise » devient la requête chaude de la
-- vitrine. L'index posé par le Store Builder portait sur `user_id`.
DROP INDEX IF EXISTS idx_products_published_store;
CREATE INDEX IF NOT EXISTS idx_products_published_business
  ON products (business_id) WHERE is_published_to_store = TRUE;


-- ═══════════════════════════════════════════════════════════════════════════
-- §4. LA COMMANDE — NUMÉROTATION, CRÉATION, CONFIRMATION
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 4.1 Un compteur, pas un COUNT(*) ────────────────────────────────────────
--
-- `ORD-2026-` + (count + 1) donne le même numéro à deux commandes simultanées :
-- la seconde viole `UNIQUE (business_id, order_number)` et se perd. Un compteur
-- incrémenté par UPDATE ... RETURNING est sérialisé par la ligne elle-même.

CREATE TABLE IF NOT EXISTS store_order_counters (
  business_id UUID   PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  next_number BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE store_order_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_order_counters FROM anon, authenticated;
GRANT  ALL ON store_order_counters TO   service_role;

-- Amorçage : au-delà du plus grand numéro déjà attribué, et au-delà du nombre
-- de commandes existantes — le plus grand des deux, pour qu'une suppression
-- passée ne provoque pas de collision.
INSERT INTO store_order_counters (business_id, next_number)
SELECT
  o.business_id,
  GREATEST(
    COUNT(*),
    COALESCE(MAX(CASE WHEN o.order_number ~ '^ORD-\d{4}-\d+$'
                      THEN split_part(o.order_number, '-', 3)::BIGINT END), 0)
  ) + 1
FROM orders o
GROUP BY o.business_id
ON CONFLICT (business_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_store_order_number(p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n BIGINT;
BEGIN
  UPDATE store_order_counters
     SET next_number = next_number + 1
   WHERE business_id = p_business_id
  RETURNING next_number - 1 INTO v_n;

  IF v_n IS NULL THEN
    INSERT INTO store_order_counters (business_id, next_number)
    VALUES (p_business_id, 2)
    ON CONFLICT (business_id) DO UPDATE
      SET next_number = store_order_counters.next_number + 1
    RETURNING next_number - 1 INTO v_n;
  END IF;

  RETURN 'ORD-' || to_char(NOW(), 'YYYY') || '-' || lpad(v_n::TEXT, 5, '0');
END $$;

REVOKE ALL     ON FUNCTION public.next_store_order_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.next_store_order_number(UUID) TO   service_role;


-- ── 4.2 Créer une commande ──────────────────────────────────────────────────
--
-- Le navigateur n'envoie que `{product_id, quantity}`. Tout le reste — prix,
-- nom, image, frais de port, sous-total, total — est relu ici. C'est la seule
-- façon de fermer « manipuler une commande côté client » (§48 du cahier des
-- charges) : tant que le prix voyage depuis le navigateur, il est modifiable.
--
-- Le stock est vérifié au même endroit. Il n'est pas encore décrémenté : la
-- commande est passée, pas confirmée. Le décrément appartient à 4.3 — et sans
-- réservation à expiration, décrémenter ici laisserait du stock bloqué par des
-- paniers jamais payés.

CREATE OR REPLACE FUNCTION public.create_store_order(
  p_business_id      UUID,
  p_customer_name    TEXT,
  p_customer_email   TEXT,
  p_customer_phone   TEXT,
  p_shipping_address JSONB,
  p_shipping_mode    TEXT,
  p_payment_method   TEXT,
  p_notes            TEXT,
  p_items            JSONB
)
-- Les colonnes de sortie sont préfixées `out_` à dessein : nommées `order_id`
-- et `order_number`, elles deviendraient des variables plpgsql homonymes de
-- colonnes de `orders`, et la moindre référence non qualifiée remonterait en
-- « column reference is ambiguous ».
RETURNS TABLE (out_order_id UUID, out_order_number TEXT, out_order_total NUMERIC)
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
  v_total       NUMERIC(12,2);
  v_mode        JSONB;
  v_customer_id UUID;
  v_order_id    UUID;
  v_number      TEXT;
  v_first       TEXT;
  v_last        TEXT;
  v_email       TEXT;
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

  -- Vitrine en mode « sélection » : seuls les produits cochés sont commandables.
  v_only_pub := COALESCE(v_store.theme_config -> 'catalog' ->> 'mode', 'all') = 'selected';

  -- ── Les lignes, relues depuis le catalogue ────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(1, LEAST(999, COALESCE((v_item ->> 'quantity')::INTEGER, 1)));

    SELECT p.id, p.name, p.sale_price, p.purchase_price, p.stock_quantity,
           p.image_url, p.enhanced_image_url, p.is_published_to_store
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

    IF COALESCE(v_p.stock_quantity, 0) < v_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour « % » : il en reste %.',
        v_p.name, GREATEST(0, COALESCE(v_p.stock_quantity, 0))
        USING ERRCODE = '23514';
    END IF;

    -- Le même prix que la vitrine affiche (cf. `mapProduct`).
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

  -- ── Les frais de port, relus depuis les réglages de la boutique ───────────
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

  -- Le mode de paiement doit être un de ceux que le marchand a activés.
  IF p_payment_method IS NULL
     OR NOT (v_store.payment_methods @> to_jsonb(p_payment_method::TEXT)) THEN
    RAISE EXCEPTION 'Ce mode de paiement n''est pas proposé par la boutique.'
      USING ERRCODE = '22023';
  END IF;

  v_total := ROUND(v_subtotal + v_shipping, 2);

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
    shipping_address, shipping_mode, notes
  ) VALUES (
    p_business_id, v_number, v_customer_id,
    trim(COALESCE(p_customer_name, 'Client')), v_email,
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    'pending', 'unpaid', p_payment_method,
    v_subtotal, v_shipping, 0, v_total,
    COALESCE(v_store.currency, 'HTG'),
    p_shipping_address, NULLIF(p_shipping_mode, ''),
    NULLIF(trim(COALESCE(p_notes, '')), '')
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

  RETURN QUERY SELECT v_order_id, v_number, v_total;
END $$;

REVOKE ALL     ON FUNCTION public.create_store_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_store_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB)
  TO service_role;


-- ── 4.3 Confirmer une commande ──────────────────────────────────────────────
--
-- Une seule transaction pour : verrouiller chaque produit, vérifier le stock,
-- le décrémenter, écrire le mouvement d'inventaire, créer la vente ProfitPilot
-- et ses lignes, puis rattacher la vente à la commande.
--
-- Idempotente par `orders.sale_id` : le rappel d'une passerelle qui arrive deux
-- fois ne crée pas deux ventes.

CREATE OR REPLACE FUNCTION public.confirm_store_order(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    orders%ROWTYPE;
  v_biz      RECORD;
  v_sale_id  UUID;
  v_invoice  TEXT;
  v_n        BIGINT;
  v_it       RECORD;
  v_stock    INTEGER;
  v_cost     NUMERIC(12,2);
  v_rate     NUMERIC;
  v_method   payment_method_type;
  v_currency currency_code;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.sale_id IS NOT NULL THEN
    RETURN v_order.sale_id;   -- déjà intégrée
  END IF;

  SELECT b.exchange_rate, b.default_currency INTO v_biz
  FROM businesses b WHERE b.id = v_order.business_id;

  -- ── Traduire la commande en vocabulaire « ventes » ────────────────────────
  --
  -- `orders` est du texte libre en minuscules ('cash', 'moncash') ; `sales`
  -- porte des ÉNUMÉRATIONS capitalisées ('Cash', 'MonCash') et
  -- `currency_code`. C'est précisément là que l'ancienne version se cassait :
  -- elle écrivait `client_name` (colonne inexistante) et poussait 'cash' dans
  -- un enum qui ne le connaît pas. PostgREST renvoyait une erreur, le code
  -- l'ignorait — et aucune commande de la boutique n'a jamais produit de vente.
  v_currency := CASE WHEN upper(COALESCE(v_order.currency, 'HTG')) = 'USD'
                     THEN 'USD' ELSE 'HTG' END::currency_code;

  v_method := CASE lower(COALESCE(v_order.payment_method, 'cash'))
                WHEN 'moncash' THEN 'MonCash'
                WHEN 'natcash' THEN 'Natcash'
                WHEN 'card'    THEN 'Card'
                WHEN 'virement' THEN 'Virement'
                ELSE 'Cash'
              END::payment_method_type;

  v_rate := CASE WHEN v_currency = 'USD'
                 THEN COALESCE(v_biz.exchange_rate, 1)
                 ELSE 1 END;

  -- ── Le numéro de facture ──────────────────────────────────────────────────
  -- Verrou consultatif porté par la transaction : deux confirmations
  -- simultanées dans la même entreprise se sérialisent ici, et nulle part
  -- ailleurs.
  PERFORM pg_advisory_xact_lock(hashtext('pp_invoice:' || v_order.business_id::TEXT));

  SELECT GREATEST(
           COUNT(*),
           COALESCE(MAX(CASE WHEN s.invoice_number ~ '^INV-\d{4}-\d+$'
                             THEN split_part(s.invoice_number, '-', 3)::BIGINT END), 0)
         ) + 1
    INTO v_n
    FROM sales s
   WHERE s.business_id = v_order.business_id;

  v_invoice := 'INV-' || to_char(NOW(), 'YYYY') || '-' || lpad(v_n::TEXT, 5, '0');

  -- ── La vente ──────────────────────────────────────────────────────────────
  INSERT INTO sales (
    business_id, invoice_number, customer_id, customer_name, sale_date,
    currency, exchange_rate, payment_method, payment_status,
    subtotal_amount, discount_amount, tax_amount, total_amount, paid_amount,
    notes
  ) VALUES (
    v_order.business_id, v_invoice, v_order.customer_id,
    v_order.customer_name, CURRENT_DATE,
    v_currency, v_rate,
    v_method,
    (CASE WHEN v_order.payment_status = 'paid' THEN 'paid' ELSE 'pending' END)::payment_status_type,
    v_order.subtotal, v_order.discount_amount, 0, v_order.total,
    CASE WHEN v_order.payment_status = 'paid' THEN v_order.total ELSE 0 END,
    'Commande boutique #' || v_order.order_number
  )
  RETURNING id INTO v_sale_id;

  -- ── Les lignes, le stock, les mouvements ──────────────────────────────────
  FOR v_it IN
    SELECT oi.product_id, oi.product_name, oi.quantity, oi.unit_price, oi.total_price
    FROM order_items oi
    WHERE oi.order_id = v_order.id
    -- Ordre stable : deux confirmations qui touchent les mêmes produits
    -- prennent leurs verrous dans le même ordre, donc ne s'interbloquent pas.
    ORDER BY oi.product_id
  LOOP
    v_cost := 0;

    -- `sale_items.product_id` est NOT NULL et référence `products` en RESTRICT :
    -- une vente sans produit ne peut pas s'écrire. Plutôt que de créer une vente
    -- amputée d'une ligne — dont le total ne correspondrait plus à la somme de
    -- ses lignes — on refuse, en nommant le produit manquant. Le marchand le
    -- recrée, ou annule la commande.
    IF v_it.product_id IS NULL THEN
      RAISE EXCEPTION
        '« % » n''est plus rattaché à une fiche produit : la commande ne peut pas être convertie en vente.',
        v_it.product_name USING ERRCODE = 'P0002';
    END IF;

    SELECT p.stock_quantity, COALESCE(p.purchase_price, 0)
      INTO v_stock, v_cost
      FROM products p
     WHERE p.id = v_it.product_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        '« % » n''existe plus dans votre catalogue : recréez la fiche ou annulez la commande.',
        v_it.product_name USING ERRCODE = 'P0002';
    END IF;

    IF COALESCE(v_stock, 0) < v_it.quantity THEN
      RAISE EXCEPTION
        'Stock insuffisant pour « % » : % en stock, % commandé(s). La commande n''a pas été confirmée.',
        v_it.product_name, GREATEST(0, COALESCE(v_stock, 0)), v_it.quantity
        USING ERRCODE = '23514';
    END IF;

    UPDATE products
       SET stock_quantity = stock_quantity - v_it.quantity
     WHERE id = v_it.product_id;

    INSERT INTO inventory_movements (
      business_id, product_id, movement_type, quantity,
      unit_cost, total_cost, currency, reference_type, reference_id, notes
    ) VALUES (
      v_order.business_id, v_it.product_id, 'sale_out', v_it.quantity,
      v_cost, ROUND(v_cost * v_it.quantity, 2),
      v_currency, 'sale', v_sale_id,
      'Commande boutique — ' || v_order.order_number
    );

    INSERT INTO sale_items (
      sale_id, business_id, product_id, product_name,
      quantity, unit_price, cost_price,
      discount_percent, discount_amount, tax_rate, tax_amount,
      line_total, currency
    ) VALUES (
      v_sale_id, v_order.business_id, v_it.product_id, v_it.product_name,
      v_it.quantity, v_it.unit_price, v_cost,
      0, 0, 0, 0,
      v_it.total_price, v_currency
    );
  END LOOP;

  UPDATE orders
     SET sale_id = v_sale_id,
         status  = 'confirmed'
   WHERE id = v_order.id;

  RETURN v_sale_id;
END $$;

REVOKE ALL     ON FUNCTION public.confirm_store_order(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_store_order(UUID) TO   service_role;


-- ── 4.4 Un vestige qui ne peut que nuire ────────────────────────────────────
--
-- `20260601_clean_products_rebuild.sql` recrée un trigger BEFORE INSERT sur
-- `sales` qui lit `NEW.product_id` et `NEW.quantity`. Ces colonnes n'existent
-- pas sur la table `sales` actuelle : s'il a survécu quelque part, il fait
-- échouer toute insertion de vente. Il n'a plus d'objet — le décrément vit
-- désormais dans `sale_items` (app/actions/sales.ts) et dans 4.3.
DROP TRIGGER  IF EXISTS sales_decrement_stock_trigger ON sales;
DROP FUNCTION IF EXISTS decrement_product_stock() CASCADE;
