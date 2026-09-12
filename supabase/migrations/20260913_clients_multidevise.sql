-- ─────────────────────────────────────────────────────────────────────────────
-- Classement des clients multidevise — ne plus additionner des USD et des HTG
--
-- ── APPLICATION ─────────────────────────────────────────────────────────────
--
-- À appliquer à la main dans le SQL Editor de Supabase (ce projet n'a ni psql
-- ni endpoint SQL). L'ordre avec le déploiement est indifférent :
-- `v_customer_rankings` garde EXACTEMENT les mêmes colonnes, dans le même ordre
-- et du même type. Aucune ligne de TypeScript ne change pour la lire.
--
-- L'ordre avec les autres migrations est indifférent aussi : aucune autre ne
-- touche `v_customer_rankings`, et la fonction de conversion est recréée
-- ci-dessous, à l'identique de 20260911_views_multidevise.sql. Cette migration
-- peut passer avant ou après 20260911 et 20260912.
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
--
-- `v_customer_rankings` (20260526_complete_schema_v2.sql, jamais redéfinie
-- depuis) faisait :
--
--   SUM(s.total_amount)  AS lifetime_value
--   AVG(s.total_amount)  AS avg_order_value
--   SUM(s.balance_due)   AS outstanding_balance
--   WHERE … AND s.payment_status != 'cancelled'
--
-- 1. Sans regarder `sales.currency`. Constaté en base le 11/09/2026 : un client
--    d'un commerce en HTG a « 82 739 » de valeur, dont une vente de 10 500 USD
--    comptée 10 500 gourdes ; un autre « 3 526,77 », dont 26,77 USD comptés
--    26,77 gourdes. Faux : le top 5 des clients et la valeur moyenne par client
--    du tableau de bord (app/actions/dashboard.ts, bloc Clients), trié sur
--    `lifetime_value`.
-- 2. Les ventes `refunded` restaient comptées (seul `cancelled` était écarté).
-- 3. La vue n'avait jamais reçu `security_invoker` : absente de
--    20260826_views_security_invoker.sql, elle s'exécutait avec les droits de
--    son propriétaire et contournait la RLS de `sales` — un compte connecté
--    pouvait lire noms et valeurs des clients des autres commerces.
--
-- ── LA RÈGLE ────────────────────────────────────────────────────────────────
--
-- Celle de 20260911 : chaque montant est ramené à `businesses.default_currency`
-- au taux `businesses.exchange_rate` (1 USD = taux HTG).
--
--   même devise      → tel quel
--   USD → HTG        → × taux
--   HTG → USD        → ÷ taux
--   taux NULL ou ≤ 1 → le montant en devise étrangère est EXCLU, jamais inventé
--
-- Ventes prises en compte : non supprimées (`deleted_at IS NULL`), rattachées à
-- un client, dont `payment_status` n'est ni `cancelled` ni `refunded` — même
-- vocabulaire que `v_receivables` (20260912). Un `payment_status` NULL reste
-- exclu, comme avant (NOT IN, comme !=, rend NULL ; la colonne est NOT NULL).
--
-- Colonne par colonne :
--   • total_orders, last_purchase_date : toutes les ventes retenues. Ce ne sont
--     pas des montants : un achat en USD sans taux reste un achat.
--   • lifetime_value : somme des montants convertis. COALESCE(…, 0) quand aucun
--     n'est convertible : un NULL remonterait EN TÊTE du tri décroissant du
--     tableau de bord (PostgreSQL range les NULL premiers en DESC), qui
--     l'affiche déjà comme 0.
--   • avg_order_value : moyenne des seuls montants convertibles ; NULL si aucun
--     ne l'est (aucun lecteur ne l'additionne).
--   • outstanding_balance : alignée sur `v_receivables.balance_due` —
--     GREATEST(total − payé, 0) des ventes non `paid`, converti. Avant, SUM de
--     la colonne générée `balance_due` : un trop-perçu (négatif) effaçait la
--     dette d'une autre vente, et une vente `paid` mal soldée restait due ici
--     alors que /creances ne la montrait plus. Aucun lecteur dans le code.
--
-- `sales.status` (énum document_status, défaut `confirmed`) n'est PAS filtré :
-- aucun code n'y écrit `cancelled`/`refunded` (toutes les ventes en base sont
-- `confirmed`), et `v_receivables`, `v_monthly_kpis`, `v_product_profitability`
-- ne le lisent pas non plus. Le filtrer ici seul ferait diverger les vues.
--
-- ── CE QUI NE CHANGE PAS ────────────────────────────────────────────────────
--
--   • Colonnes, ordre, types (uuid, uuid, text, bigint, numeric, numeric, date,
--     numeric) : CREATE OR REPLACE VIEW le vérifie et refuse sinon.
--   • Le regroupement (business_id, customer_id, customer_name), conservé tel
--     quel.
--   • Aucun DROP VIEW … CASCADE : CREATE OR REPLACE conserve objets dépendants
--     et droits.
--   • Le LEFT JOIN vers `businesses` n'ajoute ni ne retire aucune ligne (clé
--     primaire).
--
-- ── CE QUI CHANGE POUR LES DROITS ───────────────────────────────────────────
--
-- `WITH (security_invoker = on)` : la vue lit `sales` et `businesses` avec les
-- droits de l'appelant, comme `v_receivables` et `v_monthly_kpis`. Le seul
-- lecteur (tableau de bord) passe par la session du marchand, qui lit déjà
-- `sales` et `businesses` de son commerce en direct : il voit les mêmes lignes.
--
-- Idempotente : peut être rejouée. Si 20260526_complete_schema_v2.sql est
-- rejouée APRÈS celle-ci, elle remet les sommes aveugles et retire
-- security_invoker : rejouer alors celle-ci.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. La conversion — copie CONFORME de 20260911_views_multidevise.sql §1
--
-- Présente ici parce que cette migration peut être appliquée avant 20260911.
-- Ne pas la modifier ici seule : toute évolution se fait dans tous les fichiers
-- qui la recréent (20260911, 20260912, 20260913).
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
-- 1. Classement des clients
--
-- Colonnes : business_id, customer_id, customer_name, total_orders,
-- lifetime_value, avg_order_value, last_purchase_date, outstanding_balance.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_customer_rankings
WITH (security_invoker = on) AS
WITH lines AS (
  SELECT
    s.business_id,
    s.customer_id,
    s.customer_name,
    s.id,
    s.sale_date,
    s.payment_status,
    fn_to_business_currency(
      s.total_amount,
      s.currency::text,
      b.default_currency::text,
      b.exchange_rate
    ) AS amount,
    fn_to_business_currency(
      GREATEST(s.total_amount - s.paid_amount, 0),
      s.currency::text,
      b.default_currency::text,
      b.exchange_rate
    ) AS remaining
  FROM sales s
  LEFT JOIN businesses b ON b.id = s.business_id
  WHERE s.deleted_at IS NULL
    AND s.customer_id IS NOT NULL
    AND s.payment_status NOT IN ('cancelled', 'refunded')
)
SELECT
  l.business_id,
  l.customer_id,
  l.customer_name,
  COUNT(DISTINCT l.id)                                        AS total_orders,
  COALESCE(SUM(l.amount), 0)                                  AS lifetime_value,
  AVG(l.amount)                                               AS avg_order_value,
  MAX(l.sale_date)                                            AS last_purchase_date,
  COALESCE(SUM(l.remaining) FILTER (WHERE l.payment_status <> 'paid'), 0)
                                                              AS outstanding_balance
FROM lines l
GROUP BY l.business_id, l.customer_id, l.customer_name;

-- Les droits survivent à CREATE OR REPLACE ; les reposer ne coûte rien.
GRANT SELECT ON v_customer_rankings TO authenticated, service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification — à lire dans la sortie du SQL Editor
--
-- Une seule ligne attendue :
--   • view_options            contient security_invoker=on (vide = la vue
--                             contourne la RLS : ne pas déployer, relancer ce
--                             fichier) ;
--   • clients_multidevise     nombre de clients ayant acheté dans plusieurs
--                             devises, dans un commerce au taux renseigné
--                             (2 au 11/09/2026) ;
--   • sommes_aveugles         = 0 (clients dont la valeur est encore la somme
--                             brute des montants, toutes devises confondues) ;
--   • ecart_commandes         = 0 (commandes comptées par la vue − ventes
--                             retenues par la règle ; > 0 = une vente refunded
--                             est encore comptée : la vue en place n'est pas
--                             celle-ci) ;
--   • fn_to_business_currency = true.
-- ─────────────────────────────────────────────────────────────────────────────

WITH mixed AS (
  SELECT s.business_id, s.customer_id, s.customer_name,
         SUM(s.total_amount) AS raw_sum
    FROM sales s
    JOIN businesses b ON b.id = s.business_id
   WHERE s.deleted_at IS NULL
     AND s.customer_id IS NOT NULL
     AND s.payment_status NOT IN ('cancelled', 'refunded')
     AND b.exchange_rate > 1
   GROUP BY 1, 2, 3
  HAVING COUNT(DISTINCT s.currency) > 1
),
kept AS (
  SELECT COUNT(*) AS n
    FROM sales s
   WHERE s.deleted_at IS NULL
     AND s.customer_id IS NOT NULL
     AND s.payment_status NOT IN ('cancelled', 'refunded')
)
SELECT
  (SELECT c.reloptions
     FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relname = 'v_customer_rankings')                         AS view_options,
  (SELECT COUNT(*) FROM mixed)                                       AS clients_multidevise,
  (SELECT COUNT(*)
     FROM mixed m
     JOIN v_customer_rankings r
       ON r.business_id = m.business_id
      AND r.customer_id = m.customer_id
      AND r.customer_name IS NOT DISTINCT FROM m.customer_name
    WHERE r.lifetime_value = m.raw_sum)                              AS sommes_aveugles,
  (SELECT COALESCE(SUM(r.total_orders), 0) FROM v_customer_rankings r)
    - (SELECT n FROM kept)                                           AS ecart_commandes,
  (to_regprocedure('public.fn_to_business_currency(numeric,text,text,numeric)') IS NOT NULL)
                                                                     AS fn_to_business_currency;
