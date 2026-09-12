-- ─────────────────────────────────────────────────────────────────────────────
-- Toutes les vues exposées respectent la RLS de l'appelant — suite de 20260826
--
-- ── APPLICATION ─────────────────────────────────────────────────────────────
--
-- À appliquer à la main dans le SQL Editor de Supabase (ce projet n'a ni psql
-- ni endpoint SQL). URGENT : chaque jour sans elle, un compte connecté peut
-- lire les chiffres des autres commerces.
--
-- L'ordre avec le déploiement est indifférent : aucune définition ne change
-- (ni colonne, ni filtre, ni droit), seule l'option d'exécution de la vue. Aucun
-- lecteur dans le code ne voit une ligne de différence (voir « Écrans vérifiés »).
--
-- L'ordre avec les autres migrations est indifférent aussi. `v_customer_rankings`
-- n'est PAS traitée ici : 20260913_clients_multidevise.sql la recrée avec
-- `WITH (security_invoker = on)`. Tant que celle-ci n'est pas appliquée, la
-- fuite de `v_customer_rankings` (noms et valeurs des clients de tous les
-- commerces) reste ouverte. Appliquer les deux le même jour.
--
-- ── LA FAILLE ───────────────────────────────────────────────────────────────
--
-- Une vue PostgreSQL s'exécute par défaut avec les droits de son PROPRIÉTAIRE
-- (`postgres`), qui contourne la RLS. 20260826_views_security_invoker.sql n'a
-- corrigé que `v_receivables`, `v_product_profitability` et `v_monthly_kpis`.
-- Huit autres vues, créées avant elle, n'ont jamais reçu l'option :
--
--   vue                       tables lues                                  définition en vigueur
--   v_ap_aging                purchases, suppliers                         20260526_schema_v3_completion
--   v_balance_verification    journal_entry_lines, journal_entries,        supabase/archive/supabase_accounting_engine
--                             chart_of_accounts
--   v_dashboard_kpi           sales, expenses                              20260526_complete_schema_v2
--   v_grand_livre             journal_entry_lines, journal_entries,        supabase/archive/supabase_accounting_engine
--                             chart_of_accounts
--   v_monthly_pnl             sales, sale_items, expenses                  20260526_accounting_engine_v4
--   v_supplier_debt_summary   purchases, suppliers                         20260526_complete_schema_v2
--   v_top_products            sale_items, sales                            20260526_complete_schema_v2
--   v_top_products_margin     sale_items, sales                            20260526_accounting_engine_v4
--
-- (Définitions identifiées par les colonnes que l'API expose en production le
-- 11/09/2026 : 20260526_accounting_engine_v4_supplemental et 20260526_audit_fixes
-- redéfinissent `v_ap_aging` et `v_dashboard_kpi` autrement, mais ce ne sont pas
-- les versions en base.)
--
-- Aucune ne filtre sur `auth.uid()`. Or `authenticated` a le droit de les lire :
-- `20260713_grant_all_tables.sql` fait GRANT ALL ON ALL TABLES (les vues en
-- sont) TO authenticated, et ALTER DEFAULT PRIVILEGES pour les suivantes.
-- L'inscription étant libre, n'importe qui peut créer un compte et lire, par
-- l'API REST avec son jeton de session :
--   • le grand livre complet et la balance de TOUS les commerces ;
--   • leur CA, dépenses et bénéfice du mois et de l'année ;
--   • CA, coût et marge par produit ;
--   • leurs fournisseurs (nom, téléphone) et ce qu'ils leur doivent.
--
-- ── LA MESURE ───────────────────────────────────────────────────────────────
--
-- 11/09/2026, en lecture seule :
--   • `anon` est refusé sur les 17 vues exposées (42501) : aucun GRANT à `anon`
--     à retirer, aucune migration n'en pose.
--   • Le test avec un vrai jeton `authenticated` n'a PAS pu être fait : le
--     secret JWT du projet n'est pas dans l'environnement local. Fuite donc
--     déduite, non observée : GRANT à `authenticated` (ci-dessus) + vue en
--     droits du propriétaire (aucune migration n'a posé security_invoker ni
--     security_barrier sur ces huit vues) + aucun filtre par utilisateur.
--   • Vérification après application, avec un compte de test SANS entreprise :
--     GET /rest/v1/v_grand_livre?select=business_id&limit=5 doit renvoyer [].
--
-- ── LA CORRECTION ───────────────────────────────────────────────────────────
--
-- `security_invoker = on` : la vue lit ses tables avec les droits de l'appelant,
-- la RLS existante s'applique. Toutes les tables lues ont une politique
-- `is_business_member(business_id)` (20260606_rls_business_membership.sql,
-- jamais retirée depuis) : un membre continue de lire les lignes de son
-- commerce, un compte étranger n'en lit plus aucune. Aucune politique à créer.
--
-- Réaffirmées, sans changement attendu : `v_ai_asset_jobs`, `v_store_bestsellers`,
-- `v_store_bought_together`, `v_product_ratings`, `v_product_bundle_totals` sont
-- créées `WITH (security_invoker = true)` (20260903 à 20260907), et
-- `v_receivables`, `v_product_profitability`, `v_monthly_kpis` le sont par
-- 20260826 / 20260911 / 20260912. La vérification de la base n'étant possible
-- que dans le SQL Editor, l'option est reposée : sans effet si elle y est déjà,
-- elle referme la vue sinon. Les vues de vitrine n'en sont pas cassées : la
-- vitrine publique les lit par la clé service (voir ci-dessous), qui contourne
-- la RLS. Ce qu'elles exposent — volumes vendus par produit, paires achetées
-- ensemble — est une donnée commerciale d'un commerce : elle n'a pas à être
-- lisible par les comptes des autres.
--
-- Laissée volontairement : `v_customer_rankings`, traitée par
-- 20260913_clients_multidevise.sql (voir « Application »).
--
-- ── ÉCRANS VÉRIFIÉS ─────────────────────────────────────────────────────────
--
-- Recherche de chaque nom de vue dans app/, lib/, components/, hooks/,
-- contexts/, scripts/ :
--   • v_ap_aging, v_balance_verification, v_dashboard_kpi, v_grand_livre,
--     v_monthly_pnl, v_supplier_debt_summary, v_top_products,
--     v_top_products_margin : AUCUN lecteur. Aucun écran touché.
--   • v_ai_asset_jobs (app/actions/aiStudio.ts, Studio IA),
--     v_store_bestsellers, v_store_bought_together, v_product_bundle_totals
--     (app/actions/store-public.ts, vitrine publique ;
--     app/actions/merchandising.ts, merchandising du marchand) : lus par
--     `getSupabaseService()`, qui contourne la RLS. Non affectés.
--   • v_product_ratings : aucun lecteur par ce nom dans le code.
--   • v_receivables, v_monthly_kpis, v_product_profitability : déjà en
--     security_invoker, lues en session depuis 20260826. Inchangées.
--
-- Idempotente : peut être rejouée. Si une migration qui fait CREATE OR REPLACE
-- VIEW sans clause WITH sur l'une de ces vues est rejouée APRÈS celle-ci
-- (20260526_*, supabase/archive/supabase_accounting_engine.sql), la vue repasse
-- en droits du propriétaire : rejouer alors celle-ci.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Les huit vues qui contournaient la RLS ──────────────────────────────────
ALTER VIEW IF EXISTS v_ap_aging              SET (security_invoker = on);
ALTER VIEW IF EXISTS v_balance_verification  SET (security_invoker = on);
ALTER VIEW IF EXISTS v_dashboard_kpi         SET (security_invoker = on);
ALTER VIEW IF EXISTS v_grand_livre           SET (security_invoker = on);
ALTER VIEW IF EXISTS v_monthly_pnl           SET (security_invoker = on);
ALTER VIEW IF EXISTS v_supplier_debt_summary SET (security_invoker = on);
ALTER VIEW IF EXISTS v_top_products          SET (security_invoker = on);
ALTER VIEW IF EXISTS v_top_products_margin   SET (security_invoker = on);

-- ── Réaffirmées (déjà créées en security_invoker par leurs migrations) ──────
ALTER VIEW IF EXISTS v_ai_asset_jobs         SET (security_invoker = on);
ALTER VIEW IF EXISTS v_store_bestsellers     SET (security_invoker = on);
ALTER VIEW IF EXISTS v_store_bought_together SET (security_invoker = on);
ALTER VIEW IF EXISTS v_product_ratings       SET (security_invoker = on);
ALTER VIEW IF EXISTS v_product_bundle_totals SET (security_invoker = on);
ALTER VIEW IF EXISTS v_receivables           SET (security_invoker = on);
ALTER VIEW IF EXISTS v_product_profitability SET (security_invoker = on);
ALTER VIEW IF EXISTS v_monthly_kpis          SET (security_invoker = on);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification — à lire dans la sortie du SQL Editor
--
-- 17 lignes attendues, TOUTES avec {security_invoker=on} dans reloptions.
--
-- Seule exception tolérée : `v_customer_rankings` vide tant que
-- 20260913_clients_multidevise.sql n'est pas appliquée — la fuite des clients
-- reste alors ouverte, appliquer cette migration-là.
--
-- Toute autre valeur vide (NULL) = vue qui contourne encore la RLS : ne pas
-- s'arrêter là, relancer ce fichier. Une vue v_* absente de la liste ci-dessus
-- et apparue depuis doit être examinée de la même façon.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT c.relname, c.reloptions
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'v'
  AND c.relname LIKE 'v\_%'
ORDER BY 1;
