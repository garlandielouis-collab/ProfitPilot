-- ─────────────────────────────────────────────────────────────────────────────
-- Réconciliation des rôles — préalable au Document Center
--
-- ── Le problème ─────────────────────────────────────────────────────────────
--
-- Il y a deux vocabulaires de rôles dans ce projet, et ils ne se recouvrent pas.
--
--   `member_role_type` (l'énumération, 20260526_complete_schema_v2.sql) :
--       owner · admin · accountant · cashier · inventory_manager · viewer
--
--   `Role` (lib/rbac.ts, ce que TOUTE l'application suppose) :
--       owner · admin · manager · cashier · accountant · employee · viewer
--
-- Conséquences, aujourd'hui, en production :
--
--   `manager` et `employee` ne peuvent pas être écrits dans
--   `business_members.role` — l'énumération les rejette. Les deux branches
--   correspondantes de `ROLE_PERMISSIONS` sont donc mortes : personne ne peut
--   avoir ces rôles, alors que l'interface les propose.
--
--   `inventory_manager` PEUT y être écrit, et n'existe pas côté TypeScript.
--   `ROLE_PERMISSIONS['inventory_manager']` vaut `undefined`, et
--   `roleHasPermission()` renvoie `false` pour tout : un gestionnaire de stock
--   n'a aucun droit dans l'application. Il voit une interface vide sans qu'un
--   seul message ne lui dise pourquoi.
--
-- ── Pourquoi corriger ça MAINTENANT ─────────────────────────────────────────
--
-- Le Document Center pose ses permissions par rôle (§41 du cahier des charges),
-- et sa fonction `can_read_document()` interroge `business_members.role` en SQL.
-- Bâtir ce modèle sur deux vocabulaires divergents produirait des règles qui se
-- contredisent : un `manager` autorisé côté TypeScript, inexistant côté base.
--
-- On aligne donc la base sur le TypeScript — pas l'inverse. L'application, les
-- écrans de rôles et les libellés parlent déjà le vocabulaire à sept valeurs ;
-- c'est l'énumération qui est en retard. `inventory_manager` est conservé (des
-- lignes en production peuvent le porter, et deux politiques RLS de
-- `products` s'en servent) et rejoint le registre TypeScript de son côté.
--
-- ── Pourquoi ce fichier ne contient QUE ça ──────────────────────────────────
--
-- PostgreSQL refuse d'utiliser une valeur d'énumération dans la transaction qui
-- l'a ajoutée. Toute migration qui écrirait 'manager' ou 'employee' — une
-- politique, un INSERT, une fonction appelée — doit donc être jouée SÉPARÉMENT,
-- APRÈS celle-ci. C'est la seule raison d'être de ce fichier isolé.
--
-- ── Application ─────────────────────────────────────────────────────────────
--
--   1. Copier ce fichier dans le SQL Editor de Supabase. L'exécuter. Seul.
--   2. Puis seulement, jouer 20260911_document_center_foundation.sql.
--
-- Additif et irréversible : PostgreSQL ne sait pas retirer une valeur d'une
-- énumération. C'est sans danger — aucune ligne existante n'est touchée, et une
-- valeur inutilisée ne coûte rien.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE member_role_type ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE member_role_type ADD VALUE IF NOT EXISTS 'employee';

-- Vérification (à lire dans la sortie du SQL Editor) : huit valeurs attendues —
-- owner, admin, accountant, cashier, inventory_manager, viewer, manager, employee.
SELECT enumlabel AS role_disponible
FROM pg_enum
WHERE enumtypid = 'member_role_type'::regtype
ORDER BY enumsortorder;
