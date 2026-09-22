-- ─────────────────────────────────────────────────────────────────────────────
-- Commandes du site jamais comptabilisées — `warehouse_id` obligatoire
--
-- ── APPLICATION ─────────────────────────────────────────────────────────────
--
-- À coller dans le SQL Editor. Même signature, même retour, mêmes droits :
-- aucune ligne de TypeScript ne change. Rejouable.
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
--
-- `confirm_store_order` insérait son mouvement de stock SANS entrepôt. En
-- production, `inventory_movements.warehouse_id` est NOT NULL (20260726, qui le
-- rendait facultatif, n'y est pas passée). Pour un commerce sans entrepôt, la
-- transaction entière échouait : pas de vente, pas de stock décrémenté, commande
-- laissée `pending`. Payment Bridge rattrape l'erreur (paiement enregistré,
-- `settlement_error` au journal) ; la confirmation manuelle et MonCash/NatCash,
-- elles, échouaient aussi. Constaté le 30/09 sur ORD-2026-00004, payée NatCash.
--
-- ── LA CORRECTION ───────────────────────────────────────────────────────────
--
-- Le même comportement que `fn_on_sale_item_insert` (trg_sale_item_stock), le
-- déclencheur des ventes en magasin : l'entrepôt par défaut du commerce s'il en
-- a un, sinon pas de mouvement. `products.stock_quantity`, qui est le stock que
-- lit la vitrine, est décrémenté dans les deux cas.
--
-- Les deux mouvements restent appariés : le déclencheur écrit −qté et cette
-- fonction +qté sur le MÊME entrepôt, ou aucun des deux n'écrit. Ne pas changer
-- l'un sans l'autre (voir le chantier « signe des mouvements »).
--
-- Seul passage modifié : balisé « 20260930 ». Le reste est la copie exacte de
-- 20260912_creances_confirmation_taux.sql §2.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_store_order(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order     orders%ROWTYPE;
  v_biz       RECORD;
  v_sale_id   UUID;
  v_invoice   TEXT;
  v_n         BIGINT;
  v_it        RECORD;
  v_stock     INTEGER;
  v_back      BOOLEAN;
  v_cost      NUMERIC(12,2);
  v_rate      NUMERIC;
  v_method    payment_method_type;
  v_currency  currency_code;
  -- 20260912
  v_frozen    NUMERIC;   -- taux figé au lancement du paiement (USD)
  v_cost_cur  TEXT;      -- devise du prix d'achat du produit
  v_cost_rate NUMERIC;   -- taux de conversion du coût vers la devise de la ligne
  -- 20260930
  v_warehouse UUID;      -- entrepôt par défaut, NULL si le commerce n'en a pas
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

  -- 20260912 — le taux d'une vente en USD : celui auquel les gourdes ont été
  -- demandées, pas celui du jour de la confirmation.
  IF v_currency = 'USD' THEN
    IF to_regclass('public.payment_transactions') IS NOT NULL THEN
      SELECT CASE WHEN pt.raw->>'exchange_rate' ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                  THEN (pt.raw->>'exchange_rate')::NUMERIC END
        INTO v_frozen
        FROM payment_transactions pt
       WHERE pt.order_id = v_order.id
         AND pt.raw->>'stage' = 'initiation'
       ORDER BY (pt.gateway = v_order.payment_gateway) DESC NULLS LAST,
                pt.created_at DESC
       LIMIT 1;
    END IF;

    v_rate := CASE
                WHEN v_frozen > 1            THEN v_frozen
                WHEN v_biz.exchange_rate > 1 THEN v_biz.exchange_rate
                -- Aucun taux utilisable : comportement de 20260908 conservé,
                -- la confirmation d'une commande payée ne doit pas échouer.
                ELSE COALESCE(v_biz.exchange_rate, 1)
              END;
    v_cost_rate := v_rate;
  ELSE
    v_rate      := 1;
    v_cost_rate := v_biz.exchange_rate;
  END IF;

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

    SELECT p.stock_quantity, COALESCE(p.purchase_price, 0), COALESCE(p.allow_backorders, FALSE),
           p.currency
      INTO v_stock, v_cost, v_back, v_cost_cur
      FROM products p
     WHERE p.id = v_it.product_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        '« % » n''existe plus dans votre catalogue : recréez la fiche ou annulez la commande.',
        v_it.product_name USING ERRCODE = 'P0002';
    END IF;

    -- 20260912 — le prix d'achat est exprimé dans `products.currency` ; la
    -- ligne de vente et le mouvement le lisent dans la devise de la commande.
    -- Conversion impossible (taux NULL ou ≤ 1) : prix recopié tel quel, comme
    -- avant.
    v_cost := COALESCE(
                fn_to_business_currency(v_cost, v_cost_cur, v_currency::TEXT, v_cost_rate),
                v_cost
              );

    -- Une fiche en vente à découvert se confirme, quitte à passer le stock en
    -- négatif (20260908).
    IF v_back = FALSE AND COALESCE(v_stock, 0) < v_it.quantity THEN
      RAISE EXCEPTION
        'Stock insuffisant pour « % » : % en stock, % commandé(s). La commande n''a pas été confirmée.',
        v_it.product_name, GREATEST(0, COALESCE(v_stock, 0)), v_it.quantity
        USING ERRCODE = '23514';
    END IF;

    UPDATE products
       SET stock_quantity = stock_quantity - v_it.quantity
     WHERE id = v_it.product_id;

    -- 20260930 — l'entrepôt que choisira `trg_sale_item_stock` pour la ligne de
    -- vente ci-dessous (la vente n'en porte pas : c'est donc le défaut). Sans
    -- entrepôt, le déclencheur n'écrit rien ; cette fonction non plus.
    IF v_warehouse IS NULL THEN
      SELECT w.id INTO v_warehouse
        FROM warehouses w
       WHERE w.business_id = v_order.business_id AND w.is_default = TRUE
       LIMIT 1;
    END IF;

    IF v_warehouse IS NOT NULL THEN
      INSERT INTO inventory_movements (
        business_id, warehouse_id, product_id, movement_type, quantity,
        unit_cost, total_cost, currency, reference_type, reference_id, notes
      ) VALUES (
        v_order.business_id, v_warehouse, v_it.product_id, 'sale_out', v_it.quantity,
        v_cost, ROUND(v_cost * v_it.quantity, 2),
        v_currency, 'sale', v_sale_id,
        'Commande boutique — ' || v_order.order_number
      );
    END IF;

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


-- ─────────────────────────────────────────────────────────────────────────────
-- Rattrapage — les commandes PAYÉES restées sans vente
--
-- L'argent est encaissé (`payment_status = 'paid'`), la vente n'existe pas.
-- Au 30/09 : ORD-2026-00004 (NatCash, 15 564 HTG, confirmée par Payment Bridge
-- le 29/09). Les commandes impayées ne sont pas touchées : les confirmer reste
-- la décision du marchand.
--
-- Une commande par bloc : si l'une échoue (stock devenu insuffisant, fiche
-- supprimée), les autres passent quand même et le motif s'affiche dans les
-- messages du SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, order_number FROM orders
     WHERE payment_status = 'paid'
       AND sale_id IS NULL
       AND status NOT IN ('cancelled', 'refunded')
     ORDER BY created_at
  LOOP
    BEGIN
      PERFORM confirm_store_order(r.id);
      RAISE NOTICE 'Comptabilisée : %', r.order_number;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'NON comptabilisée : % — %', r.order_number, SQLERRM;
    END;
  END LOOP;
END $$;

-- Vérification : doit rendre 0 ligne.
SELECT order_number, status, payment_status
  FROM orders
 WHERE payment_status = 'paid' AND sale_id IS NULL
   AND status NOT IN ('cancelled', 'refunded');
