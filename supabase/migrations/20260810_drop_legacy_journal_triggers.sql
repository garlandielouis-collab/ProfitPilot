-- ═════════════════════════════════════════════════════════════════════════════
-- RETRAIT DES TRIGGERS COMPTABLES LEGACY
--
-- Deux moteurs comptables tournaient en parallèle :
--   1. les triggers DB de 20260526_accounting_engine_v4(_supplemental).sql
--   2. app/actions/accounting.ts (POSTING_RULES), seule source de vérité depuis
--      la décision prise dans 20260607_disable_auto_journal_triggers.sql
--
-- Ce jour-là, seul le trigger DÉPENSES avait été retiré. Les triggers ventes et
-- achats sont restés vivants, avec deux conséquences :
--
--   • ÉCRASEMENT — le trigger poste sur (reference_type='sale', reference_id) et
--     event_type prend son DEFAULT 'created'. L'appel applicatif qui suit heurte
--     uq_je_document_event, est traité comme idempotent, et rend la main sans
--     rien écrire : c'est l'écriture du trigger qui reste, avec ses codes
--     erronés (5121/5122/5123 absents du plan comptable, COGS en 6900 au lieu
--     de 6030).
--
--   • DOUBLON — les règlements passent par un reference_type différent
--     ('sale_payment' / 'purchase_payment' côté trigger, 'sale'/'purchase' +
--     event_type='payment' côté app). Aucune collision, donc DEUX écritures :
--     l'encaissement est compté deux fois.
--
-- On ne touche pas à fn_create_journal_entry ni aux fonctions fn_journal_*
-- appelées explicitement (retrait de fonds, prêt, paie, amortissement…) : ce
-- sont des RPC volontaires, pas de la comptabilisation automatique invisible.
-- ═════════════════════════════════════════════════════════════════════════════

-- DROP TRIGGER échoue si la table n'existe pas (sale_returns / purchase_returns
-- ne sont pas déployés partout), d'où le garde-fou sur to_regclass.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('trg_journal_sale',            'sales'),
      ('trg_journal_sale_payment',    'sale_payments'),
      ('trg_journal_purchase',        'purchases'),
      ('trg_journal_purch_payment',   'purchase_payments'),
      ('trg_journal_sale_return',     'sale_returns'),
      ('trg_journal_purchase_return', 'purchase_returns')
    ) AS v(trigger_name, table_name)
  LOOP
    IF to_regclass('public.' || quote_ident(t.table_name)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t.trigger_name, t.table_name);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS fn_auto_journal_sale() CASCADE;
DROP FUNCTION IF EXISTS fn_auto_journal_sale_payment() CASCADE;
DROP FUNCTION IF EXISTS fn_auto_journal_purchase() CASCADE;
DROP FUNCTION IF EXISTS fn_auto_journal_purchase_payment() CASCADE;
DROP FUNCTION IF EXISTS fn_auto_journal_sale_return() CASCADE;
DROP FUNCTION IF EXISTS fn_auto_journal_purchase_return() CASCADE;

-- ── Vérification ─────────────────────────────────────────────────────────────
-- Doit renvoyer 0 ligne. S'il en reste, un trigger porte un autre nom dans cette
-- base et continuerait à doubler les écritures.
--
--   SELECT c.relname AS table_name, t.tgname AS trigger_name
--   FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE NOT t.tgisinternal AND n.nspname = 'public'
--     AND t.tgname LIKE '%journal%';
--
-- Les écritures legacy DÉJÀ posées ne sont pas touchées : ce fichier ne concerne
-- que les transactions à venir. Pour reprendre l'historique, annuler puis
-- relancer le backfill depuis /rapports/comptabilite :
--
--   UPDATE journal_entries SET status = 'void',
--          voided_reason = 'Trigger legacy — codes comptables erronés'
--   WHERE status = 'posted' AND is_auto = true
--     AND reference_type IN ('sale', 'sale_cogs', 'sale_payment',
--                            'purchase', 'purchase_payment');
