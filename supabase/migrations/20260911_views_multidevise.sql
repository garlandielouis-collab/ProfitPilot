-- ─────────────────────────────────────────────────────────────────────────────
-- Vues d'analyse multidevise — ne plus additionner des USD et des HTG
--
-- ── APPLICATION ─────────────────────────────────────────────────────────────
--
-- À appliquer à la main dans le SQL Editor de Supabase (ce projet n'a ni psql
-- ni endpoint SQL). L'ordre avec le déploiement est indifférent : les deux vues
-- gardent EXACTEMENT les mêmes colonnes, dans le même ordre et du même type.
-- Aucune ligne de TypeScript ne change pour les lire. Avant application, les
-- montants restent faux ; après, ils sont justes.
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
--
-- `v_monthly_kpis` et `v_product_profitability` (20260821_profitpilot_features.sql)
-- faisaient SUM(total_amount), SUM(line_total), SUM(amount) sans regarder la
-- colonne `currency`. Une vente de 100 USD et une vente de 100 HTG faisaient
-- « 200 », affichés dans la devise de l'entreprise. Étaient faux : CA, marge,
-- dépenses et bénéfice de la comparaison mois/mois, du score de santé, des
-- recommandations, du dossier crédit, des objectifs mensuels, de l'historique
-- du tableau de bord ; CA, coût, marge et % de marge par produit.
--
-- ── LA RÈGLE ────────────────────────────────────────────────────────────────
--
-- Chaque montant est ramené à `businesses.default_currency` au taux
-- `businesses.exchange_rate` (1 USD = taux HTG) :
--
--   même devise   → tel quel
--   USD → HTG     → × taux
--   HTG → USD     → ÷ taux
--   taux NULL ou ≤ 1 → le montant en devise étrangère est EXCLU de la somme
--
-- 1 est la valeur par défaut de la colonne : il veut dire « jamais renseigné »,
-- pas « 1 USD = 1 HTG ». Compter ce montant à 1, ou à un taux de repli, serait
-- afficher un chiffre inventé. C'est la règle de `makeToReport`
-- (lib/currency.ts), qui convertit les totaux côté code.
--
-- Les comptes (sales_count, customers, units_sold) comptent toutes les lignes :
-- ce ne sont pas des montants, ils ne dépendent d'aucun taux.
--
-- ── POURQUOI LE TAUX DE L'ENTREPRISE, ET NON `sales.exchange_rate` ──────────
--
--   1. Cohérence. Tout le code de rapport (tableau de bord, pilotage, résumé
--      hebdomadaire, Pilot AI) convertit au taux de l'entreprise. Deux règles,
--      et le même mois afficherait deux chiffres d'affaires selon l'écran.
--   2. Le taux de ligne n'existe pas partout : `sale_items` n'en a pas, et les
--      ventes et dépenses en HTG portent 1 — inutilisable pour HTG → USD.
--   3. Il n'est pas fiable : 1 par défaut sur les lignes anciennes ou importées,
--      et la conversion d'une commande boutique écrit COALESCE(taux, 1)
--      (20260908_commerce_launch.sql). Ce 1 ne se distingue pas d'un taux absent.
--
-- Contrepartie assumée : un historique en devise étrangère est revalorisé au
-- taux courant. C'est déjà ce que fait chaque écran calculé côté code.
--
-- Hypothèse partagée avec le code : `sale_items.cost_price` est exprimé dans la
-- devise de sa ligne (`sale_items.currency`), comme le lisent le tableau de bord
-- et le résumé hebdomadaire.
--
-- ── CE QUI NE CHANGE PAS ────────────────────────────────────────────────────
--
--   • Colonnes, ordre, types : CREATE OR REPLACE VIEW le vérifie et refuse
--     sinon. Pas de colonne ajoutée : rejouer 20260821 après celle-ci
--     échouerait alors (« cannot drop columns from view »).
--   • Aucun DROP VIEW … CASCADE : il détruirait les objets qui dépendent des
--     vues. CREATE OR REPLACE les conserve.
--   • Filtres : ventes et dépenses supprimées exclues, part professionnelle des
--     dépenses mixtes, dépenses personnelles hors du bénéfice. Le LEFT JOIN
--     vers `businesses` n'ajoute ni ne retire aucune ligne (clé primaire).
--   • `security_invoker = on` (20260826_views_security_invoker.sql).
--     CREATE OR REPLACE VIEW REMPLACE les options de la vue : sans la clause
--     WITH, la vue repasserait en droits du propriétaire et contournerait de
--     nouveau la RLS. La clause est donc répétée ci-dessous.
--
-- Idempotente : peut être rejouée. Si 20260821_profitpilot_features.sql est
-- rejouée APRÈS celle-ci, elle remet les sommes aveugles à la devise : rejouer
-- alors celle-ci.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La conversion, écrite une fois
--
-- `NULL` = conversion impossible. SUM() ignore les NULL : le montant sort de la
-- somme au lieu d'y entrer à un taux inventé. Devise NULL = HTG, comme
-- `makeToReport` et `getBusinessContext()`. Une devise inconnue n'est pas
-- convertie (NULL) : `currency_code` ne connaît que HTG et USD.
--
-- IMMUTABLE et sans clause SET : PostgreSQL peut ainsi l'inliner dans les vues.
-- Elle ne lit aucune table, le search_path ne la concerne pas.
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
-- 2. Rentabilité par produit
--
-- Colonnes : business_id, product_id, product_name, units_sold, revenue, cost,
-- gross_margin, margin_pct, last_sold_at. Une ligne exclue l'est de revenue,
-- cost ET gross_margin à la fois (même devise, même taux) : le % de marge reste
-- calculé sur des montants homogènes. last_sold_at et units_sold voient toutes
-- les ventes : un produit vendu en USD sans taux n'est pas « dormant ».
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_product_profitability
WITH (security_invoker = on) AS
WITH lines AS (
  SELECT
    si.business_id,
    si.product_id,
    si.product_name,
    si.quantity,
    s.sale_date,
    fn_to_business_currency(
      si.line_total,
      COALESCE(si.currency, s.currency)::text,
      b.default_currency::text,
      b.exchange_rate
    ) AS revenue,
    fn_to_business_currency(
      si.cost_price * si.quantity,
      COALESCE(si.currency, s.currency)::text,
      b.default_currency::text,
      b.exchange_rate
    ) AS cost
  FROM sale_items si
  JOIN sales s          ON s.id = si.sale_id AND s.deleted_at IS NULL
  LEFT JOIN businesses b ON b.id = si.business_id
)
SELECT
  l.business_id,
  l.product_id,
  MAX(l.product_name)                              AS product_name,
  SUM(l.quantity)                                  AS units_sold,
  SUM(l.revenue)                                   AS revenue,
  SUM(l.cost)                                      AS cost,
  SUM(l.revenue - l.cost)                          AS gross_margin,
  CASE WHEN SUM(l.revenue) > 0
       THEN ROUND(SUM(l.revenue - l.cost) / SUM(l.revenue) * 100, 2)
       ELSE 0 END                                  AS margin_pct,
  MAX(l.sale_date)                                 AS last_sold_at
FROM lines l
GROUP BY l.business_id, l.product_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. KPI mensuels
--
-- Colonnes : business_id, period_start, revenue, sales_count, customers, cogs,
-- gross_margin, business_expenses, personal_expenses, net_profit. Même
-- structure que 20260821 : seules les sommes passent par la conversion.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_monthly_kpis
WITH (security_invoker = on) AS
WITH sales_m AS (
  SELECT s.business_id,
         date_trunc('month', s.sale_date)::date AS period_start,
         SUM(fn_to_business_currency(
               s.total_amount,
               s.currency::text,
               b.default_currency::text,
               b.exchange_rate))                AS revenue,
         COUNT(*)                               AS sales_count,
         COUNT(DISTINCT s.customer_id)          AS customers
  FROM sales s
  LEFT JOIN businesses b ON b.id = s.business_id
  WHERE s.deleted_at IS NULL
  GROUP BY 1, 2
),
cogs_m AS (
  SELECT si.business_id,
         date_trunc('month', s.sale_date)::date AS period_start,
         SUM(fn_to_business_currency(
               si.cost_price * si.quantity,
               COALESCE(si.currency, s.currency)::text,
               b.default_currency::text,
               b.exchange_rate))                AS cogs
  FROM sale_items si
  JOIN sales s          ON s.id = si.sale_id AND s.deleted_at IS NULL
  LEFT JOIN businesses b ON b.id = si.business_id
  GROUP BY 1, 2
),
exp_m AS (
  SELECT e.business_id,
         date_trunc('month', e.expense_date)::date AS period_start,
         SUM(fn_to_business_currency(
               e.amount * e.business_share_pct / 100,
               e.currency::text,
               b.default_currency::text,
               b.exchange_rate))
           FILTER (WHERE e.scope <> 'personal')    AS business_expenses,
         SUM(fn_to_business_currency(
               e.amount,
               e.currency::text,
               b.default_currency::text,
               b.exchange_rate))
           FILTER (WHERE e.scope  = 'personal')    AS personal_expenses
  FROM expenses e
  LEFT JOIN businesses b ON b.id = e.business_id
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

-- Les droits survivent à CREATE OR REPLACE ; les reposer ne coûte rien.
GRANT SELECT ON v_product_profitability, v_monthly_kpis TO authenticated, service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification — à lire dans la sortie du SQL Editor
--
-- Deux lignes attendues, chacune avec {security_invoker=on} dans reloptions.
-- Une valeur vide voudrait dire que la vue contourne la RLS : ne pas déployer,
-- relancer ce fichier.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT c.relname, c.reloptions
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('v_monthly_kpis', 'v_product_profitability')
ORDER BY c.relname;
