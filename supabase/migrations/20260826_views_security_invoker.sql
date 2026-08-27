-- ─────────────────────────────────────────────────────────────────────────────
-- Les vues du module ProfitPilot doivent respecter la RLS de l'appelant
--
-- Une vue PostgreSQL s'exécute par défaut avec les droits de son PROPRIÉTAIRE
-- (`security_definer`). Créées par le rôle `postgres`, `v_receivables`,
-- `v_product_profitability` et `v_monthly_kpis` contournaient donc la RLS des
-- tables sous-jacentes (`sales`, `products`, `expenses`…), alors qu'un
-- `GRANT SELECT … TO authenticated` les rend interrogeables depuis le client.
--
-- Concrètement : n'importe quel utilisateur connecté pouvait lire les créances,
-- les marges et les KPI de TOUS les commerces en changeant simplement le filtre
-- `business_id`. Sur un produit multi-tenant qui vend la confidentialité des
-- chiffres à des commerçants concurrents, c'est la fuite la plus grave possible.
--
-- `security_invoker = on` (PostgreSQL 15+) fait exécuter la vue avec les droits
-- de celui qui l'interroge : la RLS déjà en place sur les tables s'applique de
-- nouveau, sans qu'aucune politique supplémentaire soit nécessaire.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER VIEW IF EXISTS v_receivables           SET (security_invoker = on);
ALTER VIEW IF EXISTS v_product_profitability SET (security_invoker = on);
ALTER VIEW IF EXISTS v_monthly_kpis          SET (security_invoker = on);
