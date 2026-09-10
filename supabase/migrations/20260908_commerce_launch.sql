-- ══════════════════════════════════════════════════════════════════════════════
-- COMMERCE — le lot se vend, la commande à découvert se confirme, l'entonnoir
--            se lit
--
-- Fin des phases 6 et 7 du plan. Quatre blocs :
--
--   §1  `order_items` sait de quel lot vient une ligne. Sans ça, un lot accepté
--       par le marchand reste un objet de catalogue que personne ne peut
--       acheter : joli dans l'écran de merchandising, invisible en caisse.
--
--   §2  `create_store_order` accepte une ligne de LOT. Le prix du lot est celui
--       de `product_bundles.price`, relu en base comme tous les autres prix ;
--       l'écart avec la somme des pièces devient une remise de commande, au
--       même endroit et sous la même forme qu'une remise de coupon.
--
--   §3  `confirm_store_order` cesse de refuser les commandes que
--       `create_store_order` a acceptées. Depuis 20260906, une fiche marquée
--       `allow_backorders` peut être commandée en rupture (§25) — mais la
--       confirmation, écrite en 20260904, l'ignorait et bloquait. Le marchand
--       qui active la vente à découvert prend donc des commandes qu'il ne peut
--       jamais confirmer : ni vente, ni mouvement de stock, ni rapport.
--
--   §4  Trois fonctions de lecture pour l'écran d'analyse (§30) : les produits
--       qui marchent, d'où viennent les visiteurs, et ce qui s'est perdu entre
--       le panier et le paiement.
--
-- Idempotente. Rejouable.
-- ══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- §1. UNE LIGNE DE COMMANDE SAIT D'OÙ ELLE VIENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le lot n'est PAS une ligne de commande. Ce que le client reçoit, ce sont les
-- produits ; ce que le stock doit décrémenter, ce sont les produits ; ce que la
-- vente ProfitPilot doit contenir, ce sont les produits. Une ligne « Starter
-- Pack » sans `product_id` casserait `confirm_store_order`, qui refuse — à
-- raison — d'écrire une vente dont une ligne ne désigne aucune fiche.
--
-- Le lot est donc un GROUPEMENT : chaque pièce garde sa ligne, à son prix de
-- catalogue, et deux colonnes disent de quel lot elle provient. C'est ce qui
-- permet à l'écran des commandes d'afficher « Starter Pack (3 articles) » au
-- lieu de trois lignes sans lien apparent et d'une remise inexpliquée.
--
-- `ON DELETE SET NULL` : un lot supprimé six mois plus tard ne doit pas
-- emporter l'historique des commandes qui l'ont vendu. Le nom reste, en clair,
-- pour cette raison exacte.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS bundle_id   UUID REFERENCES product_bundles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bundle_name TEXT;

CREATE INDEX IF NOT EXISTS idx_order_items_bundle
  ON order_items (bundle_id) WHERE bundle_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- §2. LE LOT SE VEND
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Une entrée de `p_items` porte désormais SOIT `product_id`, SOIT `bundle_id`.
-- Le navigateur n'envoie toujours qu'un identifiant et une quantité : le prix
-- du lot est relu depuis `product_bundles`, exactement comme le prix d'un
-- produit est relu depuis `products`.
--
-- ── Pourquoi une remise, et pas un prix de ligne écrasé ─────────────────────
--
-- On aurait pu répartir le prix du lot sur ses pièces au prorata. On ne le fait
-- pas, pour trois raisons qui tiennent toutes à la comptabilité :
--
--   Une répartition au prorata ne tombe jamais juste. 39 réparti sur trois
--   pièces à 15/15/15 donne 13/13/13 ; sur 20/15/10, il faut arrondir, et la
--   somme des lignes cesse d'égaler le total de la commande. Un écart d'une
--   gourde entre le total et la somme de ses lignes est exactement le genre de
--   chose qui fait perdre confiance dans un logiciel de gestion.
--
--   Le prix unitaire d'une ligne de vente sert au calcul de marge. Écrasé par
--   une part de lot, il fait croire que le savon se vend 13 gourdes, et la
--   rentabilité par produit devient fausse pour toujours.
--
--   `sales` sait déjà porter une remise : `discount_amount` existe, et
--   `confirm_store_order` la recopie depuis la commande. La remise de lot
--   emprunte donc un chemin déjà éprouvé plutôt que d'en ouvrir un second.
--
-- ── L'ordre des remises ────────────────────────────────────────────────────
--
-- La remise de lot s'applique d'abord ; le coupon est ensuite évalué sur ce qui
-- reste réellement à payer. L'inverse — un coupon de 20 % calculé sur le prix
-- avant lot — ferait payer au marchand deux fois la même remise, et un panier
-- entièrement composé de lots pourrait tomber sous zéro.

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
  v_bundle_off  NUMERIC(12,2) := 0;
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
  v_bundle      RECORD;
  v_bi          RECORD;
  v_regular     NUMERIC(12,2);
  v_bqty        INTEGER;
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

    -- ══ Une ligne de LOT ═══════════════════════════════════════════════════
    IF (v_item ? 'bundle_id') AND NULLIF(v_item ->> 'bundle_id', '') IS NOT NULL THEN

      SELECT pb.id, pb.name, pb.price, pb.is_active
        INTO v_bundle
        FROM product_bundles pb
       WHERE pb.id          = (v_item ->> 'bundle_id')::UUID
         AND pb.business_id = p_business_id;

      IF NOT FOUND OR COALESCE(v_bundle.is_active, FALSE) = FALSE THEN
        RAISE EXCEPTION 'Ce lot n''est plus proposé.' USING ERRCODE = 'P0002';
      END IF;

      v_regular := 0;

      -- Chaque pièce du lot devient une ligne, à son prix de catalogue.
      FOR v_bi IN
        SELECT p.id, p.name, p.sale_price, p.purchase_price, p.stock_quantity,
               p.image_url, p.enhanced_image_url, p.is_published_to_store,
               p.allow_backorders, bi.quantity AS bundle_qty
          FROM product_bundle_items bi
          JOIN products p ON p.id = bi.product_id
         WHERE bi.bundle_id = v_bundle.id
         ORDER BY p.id
      LOOP
        v_bqty := GREATEST(1, COALESCE(v_bi.bundle_qty, 1)) * v_qty;

        -- Le mode « sélection » vaut aussi pour les pièces d'un lot : un
        -- produit retiré de la vitrine ne s'y réintroduit pas par un lot.
        IF v_only_pub AND COALESCE(v_bi.is_published_to_store, FALSE) = FALSE THEN
          RAISE EXCEPTION '« % » n''est plus en vente.', v_bi.name USING ERRCODE = 'P0002';
        END IF;

        IF COALESCE(v_bi.allow_backorders, FALSE) = FALSE
           AND COALESCE(v_bi.stock_quantity, 0) < v_bqty THEN
          RAISE EXCEPTION 'Stock insuffisant pour « % » : il en reste %.',
            v_bi.name, GREATEST(0, COALESCE(v_bi.stock_quantity, 0))
            USING ERRCODE = '23514';
        END IF;

        v_price      := ROUND(COALESCE(v_bi.sale_price, v_bi.purchase_price, 0)::NUMERIC, 2);
        v_line_total := ROUND(v_price * v_bqty, 2);
        v_regular    := v_regular + v_line_total;
        v_subtotal   := v_subtotal + v_line_total;

        v_lines := v_lines || jsonb_build_object(
          'product_id',    v_bi.id,
          'product_name',  v_bi.name,
          'product_image', COALESCE(v_bi.enhanced_image_url, v_bi.image_url),
          'quantity',      v_bqty,
          'unit_price',    v_price,
          'total_price',   v_line_total,
          'bundle_id',     v_bundle.id,
          'bundle_name',   v_bundle.name
        );
      END LOOP;

      -- Un lot vidé de ses pièces (produits supprimés) n'est plus un lot.
      IF v_regular = 0 THEN
        RAISE EXCEPTION 'Ce lot n''est plus disponible.' USING ERRCODE = 'P0002';
      END IF;

      -- L'économie du lot. Jamais négative : un « lot » plus cher que ses
      -- pièces ne majore pas la commande, il ne remise simplement rien.
      v_bundle_off := v_bundle_off
                    + GREATEST(0, v_regular - ROUND(COALESCE(v_bundle.price, 0) * v_qty, 2));

    -- ══ Une ligne de PRODUIT ═══════════════════════════════════════════════
    ELSE
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
        'total_price',   v_line_total,
        'bundle_id',     NULL,
        'bundle_name',   NULL
      );
    END IF;
  END LOOP;

  v_discount := v_bundle_off;

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
  --
  -- Il s'évalue sur ce qui reste à payer APRÈS la remise de lot : voir
  -- l'en-tête du bloc.
  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    SELECT * INTO v_coupon
    FROM public.evaluate_store_coupon(
      p_business_id, p_coupon_code, GREATEST(0, v_subtotal - v_bundle_off));

    IF v_coupon.is_valid THEN
      v_coupon_id := v_coupon.coupon_id;
      v_coupon_ok := TRUE;
      IF v_coupon.free_shipping THEN
        v_shipping := 0;
      ELSE
        v_discount := v_discount + v_coupon.discount;
      END IF;

      UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon_id;
    END IF;
  END IF;

  v_discount := LEAST(v_discount, v_subtotal);
  v_total    := ROUND(GREATEST(0, v_subtotal - v_discount) + v_shipping, 2);

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

  -- Deux lignes d'un même produit peuvent arriver ici — une vendue seule, une
  -- venue d'un lot. Elles restent DEUX lignes : les fusionner effacerait le
  -- rattachement au lot, donc l'explication de la remise.
  INSERT INTO order_items (
    order_id, business_id, product_id, product_name, product_image,
    quantity, unit_price, total_price, bundle_id, bundle_name
  )
  SELECT v_order_id, p_business_id,
         (l ->> 'product_id')::UUID,
         l ->> 'product_name',
         l ->> 'product_image',
         (l ->> 'quantity')::INTEGER,
         (l ->> 'unit_price')::NUMERIC,
         (l ->> 'total_price')::NUMERIC,
         NULLIF(l ->> 'bundle_id', '')::UUID,
         l ->> 'bundle_name'
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


-- ═══════════════════════════════════════════════════════════════════════════
-- §3. LA COMMANDE À DÉCOUVERT SE CONFIRME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `allow_backorders` est arrivé en 20260905 et `create_store_order` l'honore
-- depuis 20260906 : une fiche marquée « vente à découvert autorisée » se
-- commande même en rupture. `confirm_store_order`, écrite en 20260904, ne le
-- savait pas et refusait toute confirmation dont le stock ne couvrait pas la
-- quantité.
--
-- Le résultat était une impasse silencieuse : la boutique prenait la commande,
-- le client payait, et le marchand ne pouvait plus rien en faire — ni vente, ni
-- mouvement de stock, ni ligne de rapport. Exactement le défaut que la phase 1
-- avait corrigé ailleurs, réintroduit par la porte de la phase 5.
--
-- Le stock passe négatif, et c'est voulu : il dit alors ce qu'il doit, ce qui
-- est l'information dont le marchand a besoin pour se réapprovisionner. Un
-- décrément bloqué à zéro perdrait la trace des unités dues.
--
-- Le reste de la fonction est repris à l'identique de 20260904 : verrou par
-- produit dans un ordre stable, mouvement d'inventaire, vente et lignes,
-- idempotence par `orders.sale_id`.

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
  v_back     BOOLEAN;
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

  v_currency := CASE WHEN upper(COALESCE(v_order.currency, 'HTG')) = 'USD'
                     THEN 'USD' ELSE 'HTG' END::currency_code;

  v_method := CASE lower(COALESCE(v_order.payment_method, 'cash'))
                WHEN 'moncash'  THEN 'MonCash'
                WHEN 'natcash'  THEN 'Natcash'
                WHEN 'card'     THEN 'Card'
                WHEN 'virement' THEN 'Virement'
                ELSE 'Cash'
              END::payment_method_type;

  v_rate := CASE WHEN v_currency = 'USD'
                 THEN COALESCE(v_biz.exchange_rate, 1)
                 ELSE 1 END;

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

  FOR v_it IN
    SELECT oi.product_id, oi.product_name, oi.quantity, oi.unit_price, oi.total_price
    FROM order_items oi
    WHERE oi.order_id = v_order.id
    ORDER BY oi.product_id
  LOOP
    v_cost := 0;

    IF v_it.product_id IS NULL THEN
      RAISE EXCEPTION
        '« % » n''est plus rattaché à une fiche produit : la commande ne peut pas être convertie en vente.',
        v_it.product_name USING ERRCODE = 'P0002';
    END IF;

    SELECT p.stock_quantity, COALESCE(p.purchase_price, 0), COALESCE(p.allow_backorders, FALSE)
      INTO v_stock, v_cost, v_back
      FROM products p
     WHERE p.id = v_it.product_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        '« % » n''existe plus dans votre catalogue : recréez la fiche ou annulez la commande.',
        v_it.product_name USING ERRCODE = 'P0002';
    END IF;

    -- La seule différence avec 20260904, et elle vaut d'être nommée : une fiche
    -- en vente à découvert se confirme, quitte à passer le stock en négatif.
    IF v_back = FALSE AND COALESCE(v_stock, 0) < v_it.quantity THEN
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


-- ═══════════════════════════════════════════════════════════════════════════
-- §4. CE QUE L'ÉCRAN D'ANALYSE A BESOIN DE LIRE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `store_funnel()` (20260906) rend les cinq nombres de l'entonnoir. Il manquait
-- les trois lectures que le §30 demande à côté : les produits qui marchent, la
-- provenance des visiteurs, et les paniers perdus.
--
-- Trois fonctions plutôt que trois requêtes dans l'application, pour la raison
-- habituelle : ce sont des agrégats sur une table qui grossit vite, et un
-- GROUP BY exécuté en base coûte une fraction de ce que coûte le transfert de
-- dix mille lignes vers Node pour y être compté.

/**
 * Les produits qui marchent. Vues d'un côté, ventes de l'autre — les deux
 * comptées sur la même fenêtre, jamais mélangées.
 *
 * Un produit très vu et peu acheté n'a pas le même problème qu'un produit peu
 * vu et souvent acheté : le premier a un souci de fiche, le second un souci de
 * visibilité. Les afficher dans deux colonnes est ce qui permet de le voir.
 */
CREATE OR REPLACE FUNCTION public.store_top_products(
  p_business_id UUID,
  p_days        INTEGER DEFAULT 30,
  p_limit       INTEGER DEFAULT 8
)
RETURNS TABLE (
  product_id   UUID,
  product_name TEXT,
  views        BIGINT,
  units_sold   BIGINT,
  revenue      NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_start AS (
    SELECT NOW() - make_interval(days => GREATEST(1, p_days)) AS since
  ),
  seen AS (
    SELECT e.product_id, COUNT(*)::BIGINT AS views
      FROM store_analytics_events e, window_start w
     WHERE e.business_id = p_business_id
       AND e.event_type  = 'product_view'
       AND e.product_id IS NOT NULL
       AND e.created_at >= w.since
     GROUP BY e.product_id
  ),
  sold AS (
    SELECT oi.product_id,
           SUM(oi.quantity)::BIGINT              AS units_sold,
           SUM(oi.total_price)::NUMERIC(12,2)    AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id, window_start w
     WHERE o.business_id = p_business_id
       AND o.created_at >= w.since
       AND o.status NOT IN ('cancelled', 'refunded')
       AND oi.product_id IS NOT NULL
     GROUP BY oi.product_id
  )
  SELECT p.id,
         p.name,
         COALESCE(seen.views, 0)::BIGINT,
         COALESCE(sold.units_sold, 0)::BIGINT,
         COALESCE(sold.revenue, 0)::NUMERIC(12,2)
    FROM products p
    LEFT JOIN seen ON seen.product_id = p.id
    LEFT JOIN sold ON sold.product_id = p.id
   WHERE p.business_id = p_business_id
     AND (seen.views IS NOT NULL OR sold.units_sold IS NOT NULL)
   ORDER BY COALESCE(sold.revenue, 0) DESC, COALESCE(seen.views, 0) DESC
   LIMIT GREATEST(1, LEAST(50, p_limit))
$$;

REVOKE ALL     ON FUNCTION public.store_top_products(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.store_top_products(UUID, INTEGER, INTEGER) TO   service_role;


/**
 * D'où viennent les visiteurs. Comptés par SESSION, pas par événement : une
 * personne qui ouvre douze pages est un visiteur, pas douze.
 *
 * Le référent est déjà réduit à son hôte à l'entrée (`/api/store/track`). On le
 * dépouille ici de son « www. » pour que `www.facebook.com` et `facebook.com`
 * ne fassent pas deux lignes dans un tableau qui en compte cinq.
 */
CREATE OR REPLACE FUNCTION public.store_traffic_sources(
  p_business_id UUID,
  p_days        INTEGER DEFAULT 30
)
RETURNS TABLE (source TEXT, sessions BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(regexp_replace(lower(btrim(e.referrer)), '^www\.', ''), ''), 'direct')
           AS source,
         COUNT(DISTINCT e.session_id)::BIGINT AS sessions
    FROM store_analytics_events e
   WHERE e.business_id = p_business_id
     AND e.created_at >= NOW() - make_interval(days => GREATEST(1, p_days))
   GROUP BY 1
   ORDER BY 2 DESC
   LIMIT 8
$$;

REVOKE ALL     ON FUNCTION public.store_traffic_sources(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.store_traffic_sources(UUID, INTEGER) TO   service_role;


/**
 * Les paniers perdus (§30).
 *
 * Une session qui a mis quelque chose au panier et n'a pas acheté. Le montant
 * est la somme des `value` des ajouts au panier de ces sessions : c'est une
 * ESTIMATION de ce qui s'est perdu, pas une créance — un visiteur qui ajoute,
 * retire, puis ajoute autre chose est compté deux fois. Le nombre de sessions
 * est le chiffre fiable ; le montant sert d'ordre de grandeur, et l'écran le
 * dit.
 */
CREATE OR REPLACE FUNCTION public.store_abandoned_carts(
  p_business_id UUID,
  p_days        INTEGER DEFAULT 30
)
RETURNS TABLE (sessions BIGINT, estimated_value NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_session AS (
    SELECT e.session_id,
           BOOL_OR(e.event_type = 'add_to_cart')                      AS added,
           BOOL_OR(e.event_type = 'purchase')                         AS bought,
           SUM(CASE WHEN e.event_type = 'add_to_cart'
                    THEN COALESCE(e.value, 0) ELSE 0 END)             AS cart_value
      FROM store_analytics_events e
     WHERE e.business_id = p_business_id
       AND e.created_at >= NOW() - make_interval(days => GREATEST(1, p_days))
     GROUP BY e.session_id
  )
  SELECT COUNT(*)::BIGINT,
         COALESCE(SUM(cart_value), 0)::NUMERIC(12,2)
    FROM per_session
   WHERE added AND NOT bought
$$;

REVOKE ALL     ON FUNCTION public.store_abandoned_carts(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.store_abandoned_carts(UUID, INTEGER) TO   service_role;
