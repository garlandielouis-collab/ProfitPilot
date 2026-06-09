-- Désactive les triggers DB qui créent automatiquement des écritures comptables
-- L'application gère déjà la comptabilité via app/actions/accounting.ts (recordExpenseEntry)
-- Les triggers utilisaient des codes comptables incorrects (5310 au lieu de 1110, 4810 au lieu de 2110, 6500 au lieu des codes de charges spécifiques)
-- Cela créait des DOUBLONS ou des écritures incohérentes avec l'app-side

DROP TRIGGER IF EXISTS trg_journal_expense ON expenses;
DROP FUNCTION IF EXISTS fn_auto_journal_expense;

DROP TRIGGER IF EXISTS trg_auto_journal_expense ON expenses;

-- Note: après avoir désactivé ce trigger, exécutez le backfill depuis /rapports/comptabilite
-- pour recréer les écritures manquantes avec les bons codes comptables.
-- Si des écritures existent déjà avec les mauvais codes, utilisez :
--   UPDATE journal_entries SET status = 'void', voided_reason = 'Mauvais code trigger'
--   WHERE status = 'posted' AND is_auto = true AND reference_type = 'expense';
-- Puis re-exécutez le backfill pour recréer les écritures correctes.
