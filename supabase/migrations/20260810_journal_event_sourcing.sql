-- ═════════════════════════════════════════════════════════════════════════════
-- JOURNAL EVENT SOURCING
--
-- Avant : une écriture par DOCUMENT (sale/purchase/expense) — seul l'événement
-- « création » était comptabilisé. Les règlements de dettes (client qui paie,
-- paiement fournisseur) n'atteignaient jamais le journal, donc 4110 Clients et
-- 4010 Fournisseurs restaient gonflés indéfiniment.
--
-- Après : une écriture par (DOCUMENT, ÉVÉNEMENT). Un document a un cycle de vie
-- complet : created → payment → voided, chacun avec sa propre écriture.
--
-- Idempotence garantie par index UNIQUE au lieu d'un SELECT préalable (fragile
-- dès qu'un document porte plusieurs événements).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. event_type : quel moment du cycle de vie cette écriture représente ────
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'created';

-- Toutes les écritures existantes sont des créations de document.
UPDATE public.journal_entries SET event_type = 'created' WHERE event_type IS NULL;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_event_type_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_event_type_check
  CHECK (event_type IN ('created', 'payment', 'cogs', 'reversal', 'adjustment'));

-- ── 2. Lien de contre-écriture (on corrige par reversal, jamais par UPDATE) ──
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_je_reversal_of ON public.journal_entries(reversal_of);

-- ── 3. Règlement : quel versement précis cette écriture solde ────────────────
-- Un document peut recevoir PLUSIEURS règlements partiels. Sans cette colonne,
-- la clé d'idempotence n'autoriserait qu'un seul 'payment' par document et le
-- 2e versement serait avalé en silence — l'encaissement disparaîtrait du journal.
-- NULL pour les événements non-règlement (created, cogs) et pour les règlements
-- soldés en une fois qui ne matérialisent pas de ligne de versement.
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS settlement_id uuid;

CREATE INDEX IF NOT EXISTS idx_je_settlement ON public.journal_entries(settlement_id);

-- ── 4. Clé d'idempotence ─────────────────────────────────────────────────────
-- Partielle à double titre :
--   status <> 'void'      → une écriture annulée ne bloque pas un nouveau post
--   reference_id NOT NULL → les écritures manuelles ne sont pas contraintes
-- COALESCE plutôt que settlement_id nu : en SQL, NULL <> NULL, donc une colonne
-- nullable dans un index UNIQUE laisserait passer autant de doublons qu'on veut
-- sur les événements sans règlement (created, cogs) — exactement ce que l'index
-- doit empêcher. Le uuid nul sert de sentinelle « aucun versement ».
-- Un double post devient une violation d'unicité que la couche app traite
-- comme un no-op, au lieu de créer un doublon silencieux.
--
-- Les contre-écritures sont HORS index : un document annulé en produit une par
-- écriture d'origine (created ET cogs), toutes en event_type='reversal'. Sous
-- l'index, la 2e serait rejetée et la sortie de stock resterait au bilan. Leur
-- idempotence vient d'ailleurs : reverseDocumentEntries ne balaie que les
-- écritures non-void et void l'originale avant de contre-passer, donc un 2e
-- passage ne trouve plus rien à annuler.
DROP INDEX IF EXISTS public.uq_je_document_event;
CREATE UNIQUE INDEX uq_je_document_event
  ON public.journal_entries (
    business_id, reference_type, reference_id, event_type,
    COALESCE(settlement_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status <> 'void' AND reference_id IS NOT NULL AND event_type <> 'reversal';

CREATE INDEX IF NOT EXISTS idx_je_ref_lookup
  ON public.journal_entries (business_id, reference_type, reference_id);

-- ── 5. Échecs de comptabilisation ────────────────────────────────────────────
-- La comptabilisation reste non-bloquante (on ne refuse jamais une vente parce
-- que le journal a échoué) — mais elle ne peut plus échouer en silence.
CREATE TABLE IF NOT EXISTS public.journal_posting_failures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  reference_type text NOT NULL,
  reference_id   uuid NOT NULL,
  event_type     text NOT NULL,
  settlement_id  uuid,
  error_message  text NOT NULL,
  payload        jsonb,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Un seul enregistrement d'échec ouvert par (document, événement, versement) :
-- un retry qui échoue à nouveau met à jour la ligne existante au lieu d'empiler
-- du bruit. Même sentinelle COALESCE que uq_je_document_event, pour la même
-- raison : deux versements échoués ne doivent pas s'écraser l'un l'autre.
DROP INDEX IF EXISTS public.uq_jpf_open;
CREATE UNIQUE INDEX uq_jpf_open
  ON public.journal_posting_failures (
    business_id, reference_type, reference_id, event_type,
    COALESCE(settlement_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jpf_unresolved
  ON public.journal_posting_failures (business_id)
  WHERE resolved_at IS NULL;

ALTER TABLE public.journal_posting_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_posting_failures_access" ON public.journal_posting_failures;
CREATE POLICY "journal_posting_failures_access" ON public.journal_posting_failures
  FOR ALL USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

GRANT ALL ON TABLE public.journal_posting_failures TO authenticated, service_role;

-- ── 6. Compte 6030 — Coût des marchandises vendues ───────────────────────────
-- Inventaire PERMANENT : l'achat entre en stock (3700, actif) et la sortie de
-- stock est constatée en charge au moment de la vente. Donne une marge brute
-- exacte en temps réel, contrairement à l'inventaire périodique.
-- chart_of_accounts est par business ; on ne crée le compte que là où il manque.
INSERT INTO public.chart_of_accounts (business_id, code, name, name_ht, account_class, is_system)
SELECT b.id, '6030', 'Coût des marchandises vendues', 'Pri machandiz vandi', 'Expense', true
FROM public.businesses b
ON CONFLICT (business_id, code) DO NOTHING;

COMMENT ON COLUMN public.journal_entries.event_type IS
  'Moment du cycle de vie : created | payment | cogs | reversal | adjustment';
COMMENT ON COLUMN public.journal_entries.reversal_of IS
  'Si cette écriture est une contre-écriture, pointe vers l''écriture annulée.';
COMMENT ON COLUMN public.journal_entries.settlement_id IS
  'Règlements uniquement : id de la ligne de versement soldée, pour autoriser N paiements partiels sur un même document.';
