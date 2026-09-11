# SQL archivé

Scripts SQL qui vivaient à la racine du dépôt, hors de `supabase/migrations`.
On ne sait pas s'ils ont été appliqués à la base de production, ni dans quel
ordre : ce ne sont PAS des migrations, et ils ne doivent pas être rejoués tels
quels.

- `RLS_FIXES.sql`, `supabase_fix_all_permissions.sql` — correctifs de politiques
  RLS de juin 2026, repris depuis par les migrations datées.
- `supabase_accounting_engine.sql` — première version des fonctions du moteur
  comptable, remplacée par `migrations/20260526_accounting_engine_v4.sql`.
- `DIAGNOSTIC_RLS.sql` — requêtes de lecture seule pour inspecter les politiques.
  Utilisable sans risque dans le SQL Editor.

Toute modification de schéma passe par un nouveau fichier daté dans
`supabase/migrations/`, collé à la main dans le SQL Editor.
