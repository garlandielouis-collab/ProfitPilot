-- ─────────────────────────────────────────────────────────────────────────────
-- Créances sans ventes annulées — confirmation boutique au taux figé
--
-- ── APPLICATION ─────────────────────────────────────────────────────────────
--
-- À appliquer à la main dans le SQL Editor de Supabase (ce projet n'a ni psql
-- ni endpoint SQL). L'ordre avec le déploiement est indifférent :
--   • `v_receivables` garde EXACTEMENT les mêmes colonnes, dans le même ordre et
--     du même type ;
--   • `confirm_store_order(UUID)` garde la même signature, le même retour, les
--     mêmes droits. Aucune ligne de TypeScript ne change pour les appeler.
-- Avant application, les deux défauts ci-dessous persistent ; après, ils sont
-- corrigés. Cette migration peut être jouée AVANT 20260911_views_multidevise.sql :
-- elle recrée elle-même, à l'identique, la fonction de conversion qu'elle lit.
--
-- ── DÉFAUT 1 — LES VENTES ANNULÉES RESTAIENT DES CRÉANCES ───────────────────
--
-- `v_receivables` (20260821_profitpilot_features.sql) n'écartait que les ventes
-- `paid`. Une vente `cancelled` ou `refunded` gardait un reste dû : elle
-- apparaissait sur /creances, /dettes, la fiche client, le pilotage, le tableau
-- de bord, la relance quotidienne et le résumé hebdomadaire. La fiche client
-- (app/customers/page.tsx) la filtrait déjà côté code ; les autres écrans non.
--
-- Règle : une créance est une vente non supprimée dont `payment_status` n'est
-- ni `paid`, ni `cancelled`, ni `refunded`. Le filtre des ventes supprimées
-- (`deleted_at IS NULL`) était déjà là et reste. Un `payment_status` NULL reste
-- exclu, comme avant (NOT IN, comme <>, rend NULL).
--
-- ── DÉFAUT 2 — `confirm_store_order` : TAUX DU JOUR, COÛT NON CONVERTI ──────
--
-- a) Taux. Pour une commande en USD, la vente recevait
--    `COALESCE(businesses.exchange_rate, 1)`, le taux du JOUR de la
--    confirmation. Or le lancement d'un paiement MonCash/NatCash fige le
--    montant en gourdes et le taux appliqué dans `payment_transactions`
--    (`raw->>'stage' = 'initiation'`, `raw->>'exchange_rate'`,
--    lib/storePaymentGateway.ts → prepareGatewayCharge). Le rappel réaligne la
--    vente sur ce taux (alignSaleExchangeRate), mais seulement au premier
--    règlement et si la RPC réussit à ce moment-là. Une confirmation manuelle
--    ultérieure (updateOrderStatus) ou une RPC échouée au rappel puis rejouée
--    par le marchand créait la vente au taux du jour.
--
--    Règle, commande en USD :
--      1. le taux figé de la tentative d'initiation la plus récente de la
--         commande, s'il est > 1. Priorité à la passerelle qui a réglé la
--         commande (`orders.payment_gateway`), c'est la ligne que relit le
--         rappel ; à défaut, la plus récente toutes passerelles confondues ;
--      2. sinon `businesses.exchange_rate`, s'il est > 1 ;
--      3. sinon — COMPORTEMENT CONSERVÉ — `COALESCE(businesses.exchange_rate, 1)`.
--         Un taux ≤ 1 veut dire « jamais renseigné » ; la vente porte alors ce
--         taux inutilisable, que les vues et `makeToReport` savent écarter
--         (montant exclu, jamais inventé). Refuser la confirmation laisserait une
--         commande déjà payée sans vente, sans mouvement de stock et sans ligne
--         de rapport : c'est pire.
--    Commande en HTG : 1, inchangé.
--
--    `payment_transactions` naît en 20260906_commerce_conversion.sql. Sa
--    lecture est gardée par `to_regclass` : sur une base où elle n'existe pas,
--    l'étape 1 est simplement sautée. Un `raw->>'exchange_rate'` non numérique
--    est ignoré au lieu de faire échouer la confirmation.
--
-- b) Coût. `sale_items.cost_price` (et `inventory_movements.unit_cost`, même
--    variable) recopiait `products.purchase_price` sans conversion. La devise de
--    ce prix est établie : `products.currency` (20260606_add_products_currency.sql,
--    TEXT NOT NULL DEFAULT 'HTG') est la « Devise d'achat » de la fiche
--    (app/products/ProductsClient.tsx), et le tableau de bord comme les rapports
--    convertissent `purchase_price` depuis `products.currency`. De l'autre côté,
--    `sale_items.cost_price` est lu dans la devise de SA ligne
--    (20260911_views_multidevise.sql, dashboard, pilotage, résumé hebdo).
--    Un produit acheté 10 USD vendu dans une vitrine en HTG avait donc un coût
--    de « 10 gourdes » : marge presque égale au chiffre d'affaires.
--
--    Règle : coût de la ligne = `fn_to_business_currency(purchase_price,
--    products.currency, devise de la commande, taux)` avec pour taux celui de
--    la VENTE en USD (étape a, cohérent avec `sales.exchange_rate`) et
--    `businesses.exchange_rate` en HTG. Même devise → tel quel. Conversion
--    impossible (taux NULL ou ≤ 1) → COMPORTEMENT CONSERVÉ : le prix d'achat
--    est recopié tel quel. Mettre 0 afficherait une marge de 100 % tout aussi
--    fausse, et `cost_price` est NOT NULL.
--    Le coût reste arrondi au centime (variable NUMERIC(12,2), inchangée).
--
-- ── CE QUI NE CHANGE PAS ────────────────────────────────────────────────────
--
--   • `v_receivables` : colonnes, ordre, types, expressions, jointure vers
--     `customers`. CREATE OR REPLACE VIEW vérifie colonnes et types et refuse
--     sinon. Aucun DROP VIEW … CASCADE : aucune vue ni fonction des migrations
--     ne lit `v_receivables`, et CREATE OR REPLACE conserve de toute façon les
--     objets dépendants et les droits.
--   • `security_invoker = on` (20260826_views_security_invoker.sql). CREATE OR
--     REPLACE VIEW REMPLACE les options de la vue : sans la clause WITH, la vue
--     repasserait en droits du propriétaire et exposerait les créances de tous
--     les commerces. La clause est donc répétée ci-dessous.
--   • `confirm_store_order` : reprise à l'identique de
--     20260908_commerce_launch.sql §3 — signature `(p_order_id UUID)`, retour
--     UUID, plpgsql, SECURITY DEFINER, `search_path = public`, REVOKE/GRANT
--     (service_role seul), verrou de la commande, idempotence par
--     `orders.sale_id`, numérotation des factures sous verrou consultatif, refus
--     des lignes sans produit ou de produit disparu, vente à découvert,
--     décrément du stock, mouvement `sale_out`, lignes de vente, commande
--     `confirmed`. Seuls le calcul de `v_rate` et celui de `v_cost` changent.
--   • `fn_to_business_currency` : recréée identique à 20260911 (corps,
--     commentaire, droits). Rejouer l'une ou l'autre ne change rien.
--   • Le code : `alignSaleExchangeRate` (lib/storePaymentGateway.ts) écrit
--     ensuite le même taux figé ; il devient redondant mais reste juste, et
--     reste nécessaire tant que cette migration n'est pas appliquée.
--
-- Pas de reprise des données : les ventes déjà créées gardent leur taux et leur
-- coût. Les créances annulées disparaissent des écrans dès l'application (vue).
--
-- Idempotente : peut être rejouée. Si 20260821_profitpilot_features.sql ou
-- 20260908_commerce_launch.sql est rejouée APRÈS celle-ci, elle réintroduit le
-- défaut correspondant : rejouer alors celle-ci.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. La conversion — copie CONFORME de 20260911_views_multidevise.sql §1
--
-- Présente ici parce que cette migration peut être appliquée avant 20260911.
-- Ne pas la modifier ici seule : toute évolution se fait dans les deux fichiers.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_to_business_currency(
  p_amount        NUMERIC,
  p_from_currency TEXT,
  p_to_currency   TEXT,
  p_rate          NUMERIC   -- 1 USD = p_rate HTG
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN upper(COALESCE(p_from_currency, 'HTG')) = upper(COALESCE(p_to_currency, 'HTG'))
      THEN p_amount
    WHEN p_rate IS NULL OR p_rate <= 1
      THEN NULL
    WHEN upper(COALESCE(p_from_currency, 'HTG')) = 'USD' AND upper(COALESCE(p_to_currency, 'HTG')) = 'HTG'
      THEN p_amount * p_rate
    WHEN upper(COALESCE(p_from_currency, 'HTG')) = 'HTG' AND upper(COALESCE(p_to_currency, 'HTG')) = 'USD'
      THEN p_amount / p_rate
    ELSE NULL
  END
$fn$;

COMMENT ON FUNCTION fn_to_business_currency(NUMERIC, TEXT, TEXT, NUMERIC) IS
  'Ramène un montant à la devise de l''entreprise (1 USD = p_rate HTG). NULL si le taux n''est pas renseigné (NULL ou <= 1) : le montant est exclu, jamais inventé. Même règle que makeToReport (lib/currency.ts).';

GRANT EXECUTE ON FUNCTION fn_to_business_currency(NUMERIC, TEXT, TEXT, NUMERIC)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Créances — les ventes annulées et remboursées n'en sont pas
--
-- Colonnes : sale_id, business_id, customer_id, customer_name, customer_phone,
-- invoice_number, total_amount, paid_amount, balance_due, currency, sale_date,
-- due_date, last_reminder_at, reminder_count, days_overdue, status.
-- Seule la dernière ligne du WHERE diffère de 20260821.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_receivables
WITH (security_invoker = on) AS
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
  AND s.payment_status NOT IN ('paid', 'cancelled', 'refunded');

-- Les droits survivent à CREATE OR REPLACE ; les reposer ne coûte rien.
GRANT SELECT ON v_receivables TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Confirmation d'une commande boutique — taux figé, coût dans la devise
--
-- Copie de 20260908_commerce_launch.sql §3. Les deux passages modifiés sont
-- balisés « 20260912 ».
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

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification — à lire dans la sortie du SQL Editor
--
-- Une seule ligne attendue :
--   • view_options            contient security_invoker=on (vide = la vue
--                             contourne la RLS : ne pas déployer, relancer ce
--                             fichier) ;
--   • cancelled_in_view       = 0 (ventes annulées/remboursées encore listées) ;
--   • fn_security_definer     = true ;
--   • fn_search_path          = {search_path=public} ;
--   • fn_reads_frozen_rate    = true (la fonction en place est bien celle-ci) ;
--   • fn_to_business_currency = true.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  (SELECT c.reloptions
     FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relname = 'v_receivables')                               AS view_options,
  (SELECT COUNT(*)
     FROM v_receivables r
     JOIN sales s ON s.id = r.sale_id
    WHERE s.payment_status IN ('cancelled', 'refunded'))             AS cancelled_in_view,
  p.prosecdef                                                        AS fn_security_definer,
  p.proconfig                                                        AS fn_search_path,
  (pg_get_functiondef(p.oid) LIKE '%payment_transactions%')          AS fn_reads_frozen_rate,
  (to_regprocedure('public.fn_to_business_currency(numeric,text,text,numeric)') IS NOT NULL)
                                                                     AS fn_to_business_currency
FROM pg_proc p
WHERE p.oid = 'public.confirm_store_order(uuid)'::regprocedure;
