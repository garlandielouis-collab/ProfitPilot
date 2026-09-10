-- ─────────────────────────────────────────────────────────────────────────────
-- Document Center — Phase 1 : versions et relations
--
-- Deux tables, et rien d'autre. La Phase 0 a posé le socle (catalogue,
-- colonnes, permissions, bucket) ; celle-ci ajoute ce dont la bibliothèque a
-- besoin pour exister vraiment.
--
--   `document_versions`  §38, §71 — un document important garde son passé
--   `document_links`     §36, §37 — un document appartient à plusieurs choses
--
-- ── PRÉREQUIS ───────────────────────────────────────────────────────────────
-- 20260911_document_center_foundation.sql. Vérifié en tête de fichier.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.can_read_document(uuid)') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'PRÉREQUIS MANQUANT — la fonction can_read_document(uuid) n''existe pas.',
      HINT    = 'Appliquez 20260911_document_center_foundation.sql avant ce fichier.';
  END IF;
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. `document_versions` — le passé d'un document
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Le §38 est catégorique : « Ne jamais supprimer définitivement une version
-- historique sans une action administrative explicite. » Et le §71 précise le
-- cas qui compte le plus — quand l'IA réécrit un document, elle n'écrase pas :
-- elle ajoute. Version 1 Original, version 2 Brouillon IA, version 3 Approuvé.
--
-- ── Pourquoi le fichier est répété ici plutôt que référencé ─────────────────
--
-- Chaque version porte son propre `storage_path`. On aurait pu n'en garder
-- qu'un sur `documents` et ne stocker ici que des métadonnées — mais alors
-- « restaurer la version 2 » n'aurait rien à restaurer : le fichier de la
-- version 2 aurait été remplacé par celui de la version 3 au moment du dépôt.
-- Un historique qui ne conserve pas les fichiers n'est pas un historique, c'est
-- une liste de dates.
--
-- `documents.current_version` désigne la version vive ; cette table les tient
-- toutes, y compris la courante. C'est ce qui permet à « comparer » et
-- « restaurer » d'être symétriques.

CREATE TABLE IF NOT EXISTS document_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID        NOT NULL REFERENCES documents(id)  ON DELETE CASCADE,
  -- Redondant avec documents.business_id, et volontairement : sans lui, la
  -- politique RLS devrait relire `documents` à chaque ligne.
  business_id    UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  version        INTEGER     NOT NULL CHECK (version >= 1),

  storage_bucket TEXT,
  storage_path   TEXT,
  mime_type      TEXT,
  size_bytes     BIGINT      CHECK (size_bytes IS NULL OR size_bytes >= 0),

  -- Ce que le marchand lit dans la liste : « Original », « Brouillon PilotAI »,
  -- « Approuvé par Marie ». Bilingue côté application, libre ici.
  label          TEXT,

  -- Qui a produit cette version. `ai` sert au §71 : une version générée ne se
  -- confond jamais avec une version écrite, même six mois plus tard.
  origin         TEXT        NOT NULL DEFAULT 'user'
                   CHECK (origin IN ('user', 'ai', 'system')),

  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Suppression douce uniquement. La purge est une action administrative
  -- séparée, jamais un effet de bord d'un dépôt.
  deleted_at     TIMESTAMPTZ,

  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc
  ON document_versions (document_id, version DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_document_versions_business
  ON document_versions (business_id, created_at DESC);

COMMENT ON TABLE document_versions IS
  'Historique complet d''un document (§38, §71). Chaque version garde SON fichier : sans cela, restaurer n''aurait rien à restaurer.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. `document_links` — ce à quoi un document se rattache
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `documents.reference_type` / `reference_id` existent depuis 20260526 et ne
-- portent qu'UNE relation. Or le §36 en liste huit types, et un contrat de
-- fourniture lie à la fois un fournisseur, l'entreprise, et parfois un produit.
-- Le §37 en fait une exigence d'écran : la fiche fournisseur doit lister ses
-- documents.
--
-- ── Le piège du vocabulaire ─────────────────────────────────────────────────
--
-- `entity_type` est une chaîne contrainte, et ses valeurs sont celles de CE
-- module — pas celles des tables visées. Le module commerce écrit `orders` en
-- minuscules là où `sales` emploie une énumération capitalisée ; recopier l'un
-- ou l'autre ici aurait importé la divergence. La traduction se fait à
-- l'insertion, côté application, une fois.
--
-- Pas de clé étrangère sur `entity_id` : elle pointe vers onze tables
-- différentes. C'est le prix d'une relation polymorphique, et c'est pourquoi
-- `entity_type` est contraint — sans lui, la colonne ne voudrait rien dire.

CREATE TABLE IF NOT EXISTS document_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID        NOT NULL REFERENCES documents(id)  ON DELETE CASCADE,
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  entity_type TEXT        NOT NULL
                CHECK (entity_type IN (
                  'business', 'employee', 'customer', 'supplier', 'product',
                  'order', 'sale', 'purchase', 'expense', 'contract', 'transaction'
                )),
  entity_id   UUID        NOT NULL,

  -- À quel titre. « attached » couvre la quasi-totalité des cas ; les autres
  -- servent quand le rôle du document dans la relation change son affichage.
  relation    TEXT        NOT NULL DEFAULT 'attached'
                CHECK (relation IN ('attached', 'signed_by', 'issued_to', 'received_from', 'concerns')),

  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (document_id, entity_type, entity_id, relation)
);

-- Le sens de lecture le plus fréquent n'est PAS « les liens de ce document »,
-- c'est « les documents de ce fournisseur » (§37). D'où cet index-ci en premier.
CREATE INDEX IF NOT EXISTS idx_document_links_entity
  ON document_links (business_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_document_links_document
  ON document_links (document_id);

COMMENT ON TABLE document_links IS
  'Rattachements d''un document aux objets ProfitPilot (§36, §37). entity_type emploie le vocabulaire de CE module ; la traduction se fait à l''insertion.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. POLITIQUES
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Les deux tables sont des satellites de `documents` : leur droit de lecture
-- est exactement celui du document, pas un droit propre. `can_read_document()`
-- répond déjà à la question, et la faire répondre deux fois de deux manières
-- différentes serait le meilleur moyen de les voir diverger.

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_links    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_versions_select" ON public.document_versions;
DROP POLICY IF EXISTS "document_versions_insert" ON public.document_versions;
DROP POLICY IF EXISTS "document_versions_update" ON public.document_versions;
DROP POLICY IF EXISTS "document_versions_delete" ON public.document_versions;

CREATE POLICY "document_versions_select" ON public.document_versions
  FOR SELECT USING (can_read_document(document_id));

CREATE POLICY "document_versions_insert" ON public.document_versions
  FOR INSERT WITH CHECK (
    can_write_document(document_id)
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- Une version ne se modifie pas : elle est un instantané. La seule écriture
-- admise est la suppression douce, donc l'UPDATE reste ouvert à ceux qui
-- administrent — et le DELETE physique n'est ouvert à personne.
CREATE POLICY "document_versions_update" ON public.document_versions
  FOR UPDATE USING (fn_has_role(business_id, 'owner', 'admin'))
  WITH CHECK (fn_has_role(business_id, 'owner', 'admin'));

-- Pas de politique DELETE : sans elle, RLS refuse TOUTE suppression physique.
-- C'est exactement ce que demande le §38. La purge, si elle devient nécessaire,
-- passera par une fonction SECURITY DEFINER dédiée et journalisée.


DROP POLICY IF EXISTS "document_links_select" ON public.document_links;
DROP POLICY IF EXISTS "document_links_write"  ON public.document_links;

CREATE POLICY "document_links_select" ON public.document_links
  FOR SELECT USING (can_read_document(document_id));

CREATE POLICY "document_links_write" ON public.document_links
  FOR ALL USING (can_write_document(document_id))
  WITH CHECK (can_write_document(document_id));


GRANT SELECT, INSERT, UPDATE         ON document_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_links    TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. VÉRIFICATION
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'tables créées'  AS controle,
       count(*)::text   AS valeur
FROM   information_schema.tables
WHERE  table_schema = 'public' AND table_name IN ('document_versions', 'document_links')
UNION ALL
SELECT 'politiques document_versions', count(*)::text
FROM   pg_policies WHERE tablename = 'document_versions'
UNION ALL
SELECT 'politiques document_links', count(*)::text
FROM   pg_policies WHERE tablename = 'document_links';
