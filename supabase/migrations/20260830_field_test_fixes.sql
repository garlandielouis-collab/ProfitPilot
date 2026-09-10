-- ═══════════════════════════════════════════════════════════════════════════
--  Correctifs issus du test de terrain du 30/08/2026
--
--  À exécuter dans Supabase → SQL Editor, bloc par bloc.
--  Les blocs 3 et 4 sont précédés d'un SELECT de contrôle : lis-le avant de
--  lancer l'UPDATE qui suit.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Table `backups` (migration 20260705_backups.sql, jamais appliquée) ────
--    Sans elle : page Sauvegarde, /api/backup/restore et /api/backup/[id]/download
--    échouent tous les trois.

CREATE TABLE IF NOT EXISTS backups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         TEXT,
  storage_path  TEXT NOT NULL,
  size_bytes    BIGINT DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | ready | error
  error         TEXT,
  entity_counts JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_backups_company_created
  ON backups (company_id, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backups_select_owner" ON backups;
CREATE POLICY "backups_select_owner" ON backups FOR SELECT
  USING (company_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() AND deleted_at IS NULL));

DROP POLICY IF EXISTS "backups_insert_owner" ON backups;
CREATE POLICY "backups_insert_owner" ON backups FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() AND deleted_at IS NULL));

DROP POLICY IF EXISTS "backups_update_owner" ON backups;
CREATE POLICY "backups_update_owner" ON backups FOR UPDATE
  USING (company_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() AND deleted_at IS NULL));

-- Le bucket de stockage doit exister, sinon l'upload de la sauvegarde échoue
-- après la création de la ligne.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('backups', 'backups', false, 104857600)
ON CONFLICT (id) DO NOTHING;


-- ── 2. Table `login_sessions` (migration 20260705_login_sessions.sql) ────────
--    Sans elle : page Sécurité / sessions actives (app/actions/security.ts).

CREATE TABLE IF NOT EXISTS login_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  ip          TEXT,
  user_agent  TEXT,
  browser     TEXT,
  device_type TEXT,                                -- desktop | mobile | tablet
  os          TEXT,
  country     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ DEFAULT NULL,
  revoked_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_user_created
  ON login_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_sessions_business_created
  ON login_sessions (business_id, created_at DESC);

ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_sessions_select_own" ON login_sessions;
CREATE POLICY "login_sessions_select_own" ON login_sessions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "login_sessions_insert_own" ON login_sessions;
CREATE POLICY "login_sessions_insert_own" ON login_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "login_sessions_update_own" ON login_sessions;
CREATE POLICY "login_sessions_update_own" ON login_sessions FOR UPDATE
  USING (user_id = auth.uid());


-- ── 3. Rattacher les produits à leur entreprise ──────────────────────────────
--
--    Les 10 produits de la base ont `business_id = NULL`. Le catalogue se lit
--    par `user_id` (modèle historique) et continue de fonctionner, mais trois
--    lecteurs filtrent par entreprise et ne voient donc rien :
--      • app/actions/reports.ts:202   → stock valorisé à 0 dans les rapports
--      • app/actions/ai.ts:364        → l'AI Pilot croit le stock vide
--      • app/actions/backup.ts:38     → aucun produit dans l'export
--
--    Règle de rattachement : l'entreprise vivante la plus ancienne du
--    propriétaire — exactement le critère de getOwnedBusiness() dans
--    lib/serverAuth.ts, pour que l'app et la base désignent le même commerce.

-- CONTRÔLE — vérifie que chaque produit reçoit bien l'entreprise attendue :
SELECT p.id, p.name, p.user_id, b.id AS business_cible, b.name AS entreprise
FROM products p
LEFT JOIN LATERAL (
  SELECT id, name FROM businesses
  WHERE owner_id = p.user_id AND deleted_at IS NULL
  ORDER BY created_at ASC LIMIT 1
) b ON TRUE
WHERE p.business_id IS NULL
ORDER BY b.name, p.name;

-- APPLICATION :
--
-- Sous-requête corrélée dans le SET, et non `FROM LATERAL` : dans un UPDATE,
-- la table cible ne fait pas partie du FROM, donc une clause LATERAL ne peut
-- pas la référencer (ERROR 42P10). Le SET, lui, voit bien `p`.
UPDATE products p
SET business_id = (
  SELECT b.id FROM businesses b
  WHERE b.owner_id = p.user_id AND b.deleted_at IS NULL
  ORDER BY b.created_at ASC LIMIT 1
)
WHERE p.business_id IS NULL
  -- Un produit dont le propriétaire n'a aucune entreprise vivante est laissé
  -- tel quel : le SET l'écraserait avec NULL, sans rien corriger.
  AND EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.owner_id = p.user_id AND b.deleted_at IS NULL
  );


-- ── 4. Archiver les entreprises fantômes ─────────────────────────────────────
--
--    Le compte garlandielouis178@gmail.com possède 63 entreprises vivantes,
--    dont 62 vides et 59 portant le même nom « Gaga Louis ». Elles ont été
--    créées en rafale entre le 04 et le 09/07/2026 par l'insert de secours en
--    fin de lib/serverAuth.ts. La duplication a cessé depuis, mais le sélecteur
--    d'entreprise reste inutilisable.
--
--    On archive (soft delete) uniquement une entreprise qui, cumulativement :
--      • ne porte AUCUNE donnée métier ;
--      • n'est pas la plus ancienne de son propriétaire — celle-là est le
--        commerce principal et reste, même vide, sinon un compte neuf perdrait
--        son entreprise d'inscription.
--
--    Rien n'est effacé : `deleted_at` se remet à NULL pour annuler.

-- CONTRÔLE — liste exactement ce qui sera archivé (attendu : 62 lignes) :
WITH principale AS (
  SELECT DISTINCT ON (owner_id) id
  FROM businesses WHERE deleted_at IS NULL
  ORDER BY owner_id, created_at ASC
),
occupees AS (
  SELECT business_id AS id FROM sales                 WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM expenses              WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM customers             WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM purchases             WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM suppliers             WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM orders                WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM journal_entries       WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM customer_transactions WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM store_settings        WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM products              WHERE business_id IS NOT NULL
  UNION SELECT company_id  FROM employees             WHERE company_id  IS NOT NULL
)
SELECT id, name, owner_id, created_at
FROM businesses
WHERE deleted_at IS NULL
  AND id NOT IN (SELECT id FROM principale)
  AND id NOT IN (SELECT id FROM occupees)
ORDER BY owner_id, created_at;

-- APPLICATION (ne la lance qu'après avoir lu le SELECT ci-dessus) :
WITH principale AS (
  SELECT DISTINCT ON (owner_id) id
  FROM businesses WHERE deleted_at IS NULL
  ORDER BY owner_id, created_at ASC
),
occupees AS (
  SELECT business_id AS id FROM sales                 WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM expenses              WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM customers             WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM purchases             WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM suppliers             WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM orders                WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM journal_entries       WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM customer_transactions WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM store_settings        WHERE business_id IS NOT NULL
  UNION SELECT business_id FROM products              WHERE business_id IS NOT NULL
  UNION SELECT company_id  FROM employees             WHERE company_id  IS NOT NULL
)
UPDATE businesses SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND id NOT IN (SELECT id FROM principale)
  AND id NOT IN (SELECT id FROM occupees);


-- ── 5. Contrôle final ────────────────────────────────────────────────────────
SELECT 'entreprises vivantes'  AS mesure, COUNT(*)::text AS valeur FROM businesses WHERE deleted_at IS NULL
UNION ALL SELECT 'produits sans entreprise', COUNT(*)::text FROM products WHERE business_id IS NULL
UNION ALL SELECT 'table backups',            COUNT(*)::text FROM backups
UNION ALL SELECT 'table login_sessions',     COUNT(*)::text FROM login_sessions;
