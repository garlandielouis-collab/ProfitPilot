-- ============================================================================
-- PROFITPILOT — AUDIT RLS : requêtes pour l'éditeur Supabase
-- ============================================================================
-- Ces requêtes SQL sont conçues pour être exécutées périodiquement dans
-- l'éditeur SQL Supabase afin de détecter les anomalies de sécurité.
--
-- Exécution recommandée : toutes les semaines (ou après chaque déploiement)
-- ============================================================================

-- ============================================================================
-- 1.  TABLES SANS RLS
-- ============================================================================
-- Une table sans RLS laisse TOUS les utilisateurs authentifiés (et parfois
-- même les utilisateurs anonymes) lire/écrire toutes ses lignes.

SELECT
  schemaname,
  tablename,
  'RISK_CRITICAL' AS severity,
  'Table sans RLS activé — données exposées à tous les utilisateurs authentifiés' AS message
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('schema_migrations', 'audit_log')  -- exclusions
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE pg_policies.schemaname = pg_tables.schemaname
      AND pg_policies.tablename = pg_tables.tablename
  )
ORDER BY tablename;

-- ============================================================================
-- 2.  POLITIQUES TROP PERMISSIVES
-- ============================================================================

-- 2a. USING(true) — autorise toutes les lignes sans aucune condition
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  'RISK_CRITICAL' AS severity,
  'Politique USING(true) — pas de filtre, toutes les lignes sont accessibles' AS message
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'TRUE'::text
ORDER BY tablename, cmd;

-- 2b. WITH CHECK(true) — autorise l'écriture sans condition
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  'RISK_CRITICAL' AS severity,
  'Politique WITH CHECK(true) — écriture sans restriction' AS message
FROM pg_policies
WHERE schemaname = 'public'
  AND with_check = 'TRUE'::text
ORDER BY tablename, cmd;

-- 2c. Politiques qui référencent des colonnes qui n'existent plus
-- (politiques cassées = pas de protection)
SELECT
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd,
  'RISK_HIGH' AS severity,
  'La colonne référencée a peut-être été renommée ou supprimée' AS message
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND (
    p.qual ILIKE '%owner_id%'
    OR p.with_check ILIKE '%owner_id%'
  )
  AND p.tablename IN (
    -- Inclure ici les tables qui utilisent business_id et non owner_id
    'sales', 'expenses', 'purchases', 'suppliers', 'customers',
    'products', 'inventory_movements', 'customer_transactions',
    'sale_items', 'purchase_items'
  )
ORDER BY p.tablename, p.policyname;

-- ============================================================================
-- 3.  POLITIQUES PAR TABLE — VUE D'ENSEMBLE
-- ============================================================================

SELECT
  schemaname,
  tablename,
  count(*) FILTER (WHERE cmd = 'SELECT')  AS policies_select,
  count(*) FILTER (WHERE cmd = 'INSERT')  AS policies_insert,
  count(*) FILTER (WHERE cmd = 'UPDATE')  AS policies_update,
  count(*) FILTER (WHERE cmd = 'DELETE')  AS policies_delete,
  count(*) FILTER (WHERE cmd = 'ALL')     AS policies_all,
  string_agg(policyname, ', ' ORDER BY cmd) AS policy_names
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- ============================================================================
-- 4.  POLITIQUES BUSINESS → DÉTECTION DE DÉRIVE
-- ============================================================================
-- Vérifie que les tables métier critiques utilisent bien
-- is_business_member() et non une méthode obsolète.

SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual ILIKE '%is_business_owner%' THEN 'DRIFT: utilise is_business_owner au lieu de is_business_member'
    WHEN qual ILIKE '%is_business_member%' THEN 'OK'
    WHEN qual ILIKE '%auth.uid() = owner_id%' THEN 'DRIFT: owner_id direct au lieu de business_members'
    ELSE 'À VÉRIFIER'
  END AS check_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'sales', 'expenses', 'purchases', 'suppliers', 'customers',
    'products', 'inventory_movements', 'customer_transactions',
    'product_categories', 'warehouses', 'product_variants',
    'warehouse_stock', 'bank_accounts', 'journal_entries',
    'uploads', 'employees', 'documents'
  )
ORDER BY tablename, check_status;

-- ============================================================================
-- 5.  GRILLE FINALE : tables / RLS ACTIF / POLICIES
-- ============================================================================

SELECT
  t.tablename,
  CASE WHEN t.relhasrules THEN 'OUI' ELSE 'NON' END AS rls_active,
  COALESCE(p.policies, 0) AS nb_policies,
  CASE
    WHEN t.relhasrules AND COALESCE(p.policies, 0) > 0 THEN '✅'
    WHEN t.relhasrules AND COALESCE(p.policies, 0) = 0 THEN '⚠️ RLS sans policies = tout bloqué'
    ELSE '❌ AUCUNE PROTECTION'
  END AS status
FROM (
  SELECT tablename, relhasrules
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
) t
LEFT JOIN (
  SELECT tablename, count(*) AS policies
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
) p ON p.tablename = t.tablename
ORDER BY status, t.tablename;

-- ============================================================================
-- 6.  VÉRIFICATION DE L'INTÉGRITÉ DES POLITIQUES EXISTANTES
-- ============================================================================
-- Vérifie que nos politiques de référence (business_membership V3) existent
-- toujours et n'ont pas été écrasées.

WITH expected AS (
  SELECT unnest(ARRAY[
    'businesses_select', 'businesses_insert', 'businesses_update', 'businesses_delete',
    'business_members_select', 'business_members_insert',
    'sales_access', 'customers_access', 'suppliers_access',
    'expenses_access', 'purchases_access',
    'products_access', 'profiles_select_own', 'permissions_select_all',
    'ai_conversations_access', 'ai_messages_access',
    'notifications_access'
  ]) AS policy_name
)
SELECT
  e.policy_name,
  CASE WHEN p.policyname IS NOT NULL THEN '✅' ELSE '❌ MANQUANTE' END AS status
FROM expected e
LEFT JOIN pg_policies p ON p.policyname = e.policy_name AND p.schemaname = 'public'
ORDER BY e.policy_name;

-- ============================================================================
-- 7.  STRATÉGIE DE LOG — AUDIT DES ACCÈS NON AUTORISÉS
-- ============================================================================
-- Supabase ne logge pas les rejets RLS au niveau applicatif PostgreSQL.
-- On met en place deux mécanismes :

-- ── 7a. Table d'audit dédiée ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    text NOT NULL,      -- 'rls_violation', 'auth_failure', etc.
  table_name    text,
  operation     text,               -- SELECT, INSERT, UPDATE, DELETE
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id   uuid,
  details       jsonb,
  client_ip     text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Seul le service_role peut écrire dans audit_log
CREATE POLICY "audit_log_insert_service" ON public.audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "audit_log_select_admin" ON public.audit_log
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR auth.uid() = user_id
  );

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id   ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_type       ON public.audit_log(event_type);

-- ── 7b. Fonction de log appelée depuis les Server Actions ────────────────────

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event_type  text,
  p_table_name  text DEFAULT NULL,
  p_operation   text DEFAULT NULL,
  p_user_id     uuid DEFAULT NULL,
  p_business_id uuid DEFAULT NULL,
  p_details     jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (event_type, table_name, operation, user_id, business_id, details)
  VALUES (p_event_type, p_table_name, p_operation, p_user_id, p_business_id, p_details);
END;
$$;

-- ── 7c. Utilisation côté application (exemple pour une Server Action) ────────
-- À ajouter dans chaque Server Action avant de throw une erreur de permission :
--
--   import { createClient } from '@supabase/supabase-js'
--   const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
--   await svc.rpc('log_audit_event', {
--     p_event_type: 'rls_violation',
--     p_table_name: 'sales',
--     p_operation: 'INSERT',
--     p_user_id: attemptedUserId,
--     p_business_id: attemptedBusinessId,
--     p_details: jsonb_build_object('reason', 'not a business member')
--   })

-- ============================================================================
-- 8.  RECOMMANDATIONS POUR UN MONITORING CONTINU
-- ============================================================================

-- 8a. Automatisation : créer une fonction programmée (pg_cron si dispo)
-- qui exécute la grille (requête 5) chaque semaine et insère le résultat
-- dans audit_log si des anomalies sont détectées.

-- 8b. Supabase Logs Explorer :
--    Aller dans Supabase Dashboard → Logs → Explorer
--    Exécuter cette requête pour voir les RLS rejections :
--
--    SELECT
--      timestamp,
--      msg,
--      detail
--    FROM supabase_functions.function_logs
--    WHERE msg ILIKE '%policy%'
--       OR msg ILIKE '%permission denied%'
--       OR msg ILIKE '%new row violates%'
--    ORDER BY timestamp DESC
--    LIMIT 100;

-- 8c. Supabase Log Drains (Pro) :
--    Configurer un Log Drain → envoie tous les logs vers un service externe
--    (Datadog, Grafana, etc.) pour une surveillance en temps réel.
--    Dashboard → Project Settings → Logs → Log Drains

-- 8d. Alertes webhook :
--    Dans Supabase Dashboard → Database → Webhooks, créer un webhook
--    sur la table audit_log (INSERT) qui POSTe vers Slack/Discord/Email
--    pour toute nouvelle entrée avec event_type = 'rls_violation'.

-- ============================================================================
-- 9.  CHECKLIST HEBDOMADAIRE
-- ============================================================================
-- Copier-coller dans l'éditeur SQL chaque semaine :
--
--   1. Exécuter les requêtes 1 à 6 ci-dessus
--   2. Vérifier qu'aucune ligne ❌ n'apparaît dans la grille
--   3. Vérifier qu'aucune politique DRIFT n'est listée
--   4. Vérifier que le nombre de policies est stable
--      (toute divergence indique une modification non suivie)
--   5. Consulter audit_log :
--      SELECT * FROM public.audit_log
--      WHERE created_at > now() - interval '7 days'
--      ORDER BY created_at DESC;

-- ============================================================================
-- FIN — RLS AUDIT QUERIES
-- ============================================================================
