-- ─────────────────────────────────────────────────────────────────────────────
-- Document Center — Phase 0 : réparer la fondation
--
-- La table `documents` existe depuis 20260526_schema_v3_completion.sql et
-- personne ne s'en est jamais servi : aucune ligne de TypeScript ne la lit ni
-- ne l'écrit. Elle porte trois défauts qui la rendent inutilisable telle quelle
-- pour un centre documentaire d'entreprise.
--
--   1. `documents_access` est en `FOR ALL USING (is_business_member(...))`.
--      Cette fonction ne connaît que l'APPARTENANCE, jamais le RÔLE. Un
--      `viewer` peut donc lire, modifier ET supprimer les fiches de paie et les
--      contrats de l'entreprise. Acceptable pour `uploads` (photos de reçus),
--      inacceptable ici (§42, §78, §83).
--
--   2. `url TEXT NOT NULL` stocke une URL. Une URL signée expire ; une URL
--      publique sur un contrat est publique pour toujours. Le §57 et le §83
--      l'interdisent. Il faut le couple bucket + chemin, et fabriquer l'URL
--      signée à la lecture, dans une route authentifiée.
--
--   3. `type` est un CHECK figé de 13 valeurs. Le §3 en demande une soixantaine
--      réparties en six catégories. Un CHECK rendrait chaque nouvelle catégorie
--      dépendante d'une migration.
--
-- Cette migration corrige les trois, sans détruire quoi que ce soit : elle
-- ajoute, remplit, puis retire la contrainte devenue fausse. `type` reste en
-- place, dépréciée, le temps d'une version.
--
-- ── PRÉREQUIS ───────────────────────────────────────────────────────────────
--
-- 20260910_member_role_reconciliation.sql DOIT avoir été joué avant, et dans
-- une exécution séparée. Ce fichier utilise les rôles 'manager' et 'employee' ;
-- PostgreSQL refuse d'employer une valeur d'énumération dans la transaction qui
-- l'a ajoutée.
--
-- ── APPLICATION ─────────────────────────────────────────────────────────────
--
-- Ce projet n'a ni psql ni endpoint SQL : copier ce fichier dans le SQL Editor
-- de Supabase et l'exécuter AVANT de déployer le code qui en dépend. Une
-- migration non jouée ne casse pas le build — elle produit des erreurs
-- silencieuses à l'exécution.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 0. GARDE-FOU — le prérequis, vérifié avant tout le reste
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Sans cette vérification, oublier la migration précédente produit une erreur
-- illisible — « invalid input value for enum member_role_type: "manager" » —
-- au milieu du fichier, sur une politique, quatre cents lignes plus bas, une
-- fois la moitié du travail déjà faite. Mieux vaut échouer tout de suite et
-- dire quoi faire.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'member_role_type'::regtype AND enumlabel IN ('manager', 'employee')
    GROUP BY enumtypid HAVING count(*) = 2
  ) THEN
    -- Forme `USING` : contrairement au format de RAISE, qui doit être UN SEUL
    -- littéral, MESSAGE et HINT acceptent une expression — donc la
    -- concaténation explicite y est permise, et le texte reste lisible.
    RAISE EXCEPTION USING
      MESSAGE = 'PRÉREQUIS MANQUANT — l''énumération member_role_type ne contient pas'
             || ' encore « manager » et « employee ».',
      HINT    = 'Exécutez d''abord 20260910_member_role_reconciliation.sql, SEULE dans'
             || ' son exécution. PostgreSQL interdit d''employer une valeur'
             || ' d''énumération dans la transaction qui l''ajoute : les deux fichiers'
             || ' ne peuvent pas être lancés ensemble.';
  END IF;
END $$;

-- Les deux fonctions dont dépendent toutes les politiques ci-dessous. Elles
-- viennent de migrations anciennes (20260526 et 20260606) — mais ce projet
-- applique ses migrations à la main, et rien ne garantit qu'elles soient toutes
-- passées. Sans cette vérification, l'absence de l'une se manifesterait par un
-- « function is_business_member(uuid) does not exist » sur une politique, loin
-- de sa cause.

DO $$
DECLARE
  v_manquantes TEXT := '';
BEGIN
  IF to_regprocedure('public.is_business_member(uuid)') IS NULL THEN
    v_manquantes := v_manquantes || 'is_business_member(uuid) [20260606_rls_business_membership.sql] ';
  END IF;
  IF to_regprocedure('public.fn_has_role(uuid, member_role_type[])') IS NULL THEN
    v_manquantes := v_manquantes || 'fn_has_role(uuid, member_role_type[]) [20260526_complete_schema_v2.sql] ';
  END IF;

  IF v_manquantes <> '' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'DÉPENDANCE MANQUANTE — fonction(s) absente(s) : ' || v_manquantes,
      HINT    = 'Appliquez la ou les migrations indiquées entre crochets avant celle-ci.';
  END IF;
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. LE CATALOGUE DES TYPES — ce qui remplace le CHECK figé
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Deux axes distincts, et c'est délibéré :
--
--   `category`     range les documents dans l'interface (§3). Six valeurs.
--   `sensitivity`  décide QUI a le droit de lire (§41). Quatre valeurs.
--
-- Ce ne sont pas le même axe. Un contrat de partenariat est de catégorie
-- `sales_legal` et de sensibilité `legal` ; une fiche de paie est de catégorie
-- `hr` et de sensibilité `hr` ; un bilan est `finance` et `financial`. Les
-- confondre obligerait à écrire les règles d'accès en dur dans le SQL, une
-- catégorie à la fois. Ici, `can_read_document()` ne lit QUE `sensitivity`.
--
-- `business_id` est nullable : NULL = type du catalogue global, livré avec le
-- produit. Une valeur = type créé par une entreprise pour elle seule. La colonne
-- coûte zéro aujourd'hui et évite une migration le jour où les types deviennent
-- personnalisables.

CREATE TABLE IF NOT EXISTS document_types (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = catalogue global. Sinon : type propre à une entreprise.
  business_id UUID        REFERENCES businesses(id) ON DELETE CASCADE,

  key         TEXT        NOT NULL,
  category    TEXT        NOT NULL
                CHECK (category IN ('strategy','finance','operations','sales_legal','hr','compliance')),

  -- Bilingue en base, parce que l'application l'est (§ t({fr, ht})). Mettre ces
  -- libellés dans le TypeScript obligerait à redéployer pour corriger une faute.
  label_fr    TEXT        NOT NULL,
  label_ht    TEXT        NOT NULL,

  -- Qui a le droit de lire ce type de document. Voir can_read_document().
  sensitivity TEXT        NOT NULL DEFAULT 'general'
                CHECK (sensitivity IN ('general','financial','hr','legal')),

  -- Le document a-t-il normalement une date d'expiration ? Sert au moteur
  -- d'expiration (§34) et au score de santé (§64) : un permis sans date est un
  -- document incomplet, un business plan sans date ne l'est pas.
  requires_expiration BOOLEAN NOT NULL DEFAULT FALSE,

  -- Généré depuis les données ProfitPilot plutôt que téléversé (§28, §29).
  -- Un P&L ne se dépose pas à la main quand le moteur comptable sait le produire.
  is_dynamic  BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Visibilité posée par défaut à la création d'un document de ce type (§42).
  default_visibility TEXT NOT NULL DEFAULT 'company'
                CHECK (default_visibility IN ('company','restricted','private')),

  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Une clé est unique dans le catalogue global, et unique par entreprise pour
-- les types personnalisés. Deux index partiels, parce qu'un UNIQUE ordinaire
-- traiterait chaque NULL comme distinct et laisserait passer les doublons.
CREATE UNIQUE INDEX IF NOT EXISTS document_types_global_key_uq
  ON document_types (key) WHERE business_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_types_business_key_uq
  ON document_types (business_id, key) WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_types_category
  ON document_types (category, sort_order) WHERE is_active;

COMMENT ON TABLE document_types IS
  'Catalogue des types de documents (§3). Remplace le CHECK figé de documents.type. '
  'category = rangement dans l''interface ; sensitivity = qui a le droit de lire.';


-- ── Le catalogue livré ──────────────────────────────────────────────────────
--
-- Les treize clés héritées du CHECK d'origine sont reprises VERBATIM. C'est ce
-- qui rend le remplissage de `document_type_id` trivial plus bas : une jointure
-- sur `key = documents.type`, sans table de correspondance. Réécrire ces clés
-- « proprement » aurait coûté une table de mapping et une occasion de se
-- tromper, pour un gain nul.

INSERT INTO document_types (key, category, label_fr, label_ht, sensitivity, requires_expiration, is_dynamic, default_visibility, sort_order) VALUES
  -- ── STRATEGY ──────────────────────────────────────────────────────────────
  ('business_plan',          'strategy', 'Plan d''affaires',            'Plan biznis',                'general',   FALSE, FALSE, 'company',    10),
  ('business_model_canvas',  'strategy', 'Business Model Canvas',       'Business Model Canvas',      'general',   FALSE, FALSE, 'company',    11),
  ('strategic_plan',         'strategy', 'Plan stratégique',            'Plan estratejik',            'general',   FALSE, FALSE, 'restricted', 12),
  ('annual_plan',            'strategy', 'Plan annuel',                 'Plan anyèl',                 'general',   FALSE, FALSE, 'company',    13),
  ('growth_plan',            'strategy', 'Plan de croissance',          'Plan kwasans',               'general',   FALSE, FALSE, 'company',    14),
  ('swot_analysis',          'strategy', 'Analyse SWOT',                'Analiz SWOT',                'general',   FALSE, FALSE, 'company',    15),
  ('market_analysis',        'strategy', 'Analyse de marché',           'Analiz mache',               'general',   FALSE, FALSE, 'company',    16),
  ('brand_strategy',         'strategy', 'Stratégie de marque',         'Estrateji mak',              'general',   FALSE, FALSE, 'company',    17),
  ('brand_guidelines',       'strategy', 'Charte de marque',            'Chat mak',                   'general',   FALSE, FALSE, 'company',    18),
  ('logo',                   'strategy', 'Logo',                        'Logo',                       'general',   FALSE, FALSE, 'company',    19),

  -- ── FINANCE ───────────────────────────────────────────────────────────────
  -- `is_dynamic` : ProfitPilot sait déjà produire ces états depuis le moteur
  -- comptable. Le §28 interdit d'en refaire une saisie manuelle.
  ('income_statement',       'finance', 'Compte de résultat',           'Kont rezilta',               'financial', FALSE, TRUE,  'restricted', 20),
  ('cash_flow',              'finance', 'Flux de trésorerie',           'Mouvman lajan',              'financial', FALSE, TRUE,  'restricted', 21),
  ('balance_sheet',          'finance', 'Bilan',                        'Bilan',                      'financial', FALSE, TRUE,  'restricted', 22),
  ('budget',                 'finance', 'Budget',                       'Bidjè',                      'financial', FALSE, FALSE, 'restricted', 23),
  ('financial_forecast',     'finance', 'Prévisions financières',       'Previzyon finansye',         'financial', FALSE, FALSE, 'restricted', 24),
  ('general_ledger',         'finance', 'Grand livre',                  'Gran liv',                   'financial', FALSE, TRUE,  'restricted', 25),
  ('sales_register',         'finance', 'Journal des ventes',           'Jounal vant',                'financial', FALSE, TRUE,  'restricted', 26),
  ('expense_register',       'finance', 'Journal des dépenses',         'Jounal depans',              'financial', FALSE, TRUE,  'restricted', 27),
  ('accounts_receivable',    'finance', 'Créances clients',             'Kredi kliyan',               'financial', FALSE, TRUE,  'restricted', 28),
  ('accounts_payable',       'finance', 'Dettes fournisseurs',          'Dèt founisè',                'financial', FALSE, TRUE,  'restricted', 29),
  ('report_pdf',             'finance', 'Rapport financier',            'Rapò finansye',              'financial', FALSE, TRUE,  'restricted', 30),
  ('receipt',                'finance', 'Reçu',                         'Resi',                       'financial', FALSE, FALSE, 'company',    31),
  ('expense_receipt',        'finance', 'Justificatif de dépense',      'Prèv depans',                'financial', FALSE, FALSE, 'company',    32),

  -- ── OPERATIONS ────────────────────────────────────────────────────────────
  ('inventory_document',     'operations', 'Document d''inventaire',    'Dokiman envantè',            'general',   FALSE, FALSE, 'company',    40),
  ('product_catalog',        'operations', 'Catalogue produits',        'Katalòg pwodwi',             'general',   FALSE, FALSE, 'company',    41),
  ('price_list',             'operations', 'Liste de prix',             'Lis pri',                    'general',   FALSE, FALSE, 'company',    42),
  ('sop',                    'operations', 'Procédure (SOP)',           'Pwosedi (SOP)',              'general',   FALSE, FALSE, 'company',    43),
  ('process_documentation',  'operations', 'Documentation de processus','Dokimantasyon pwosesis',     'general',   FALSE, FALSE, 'company',    44),
  ('checklist',              'operations', 'Liste de contrôle',         'Lis kontwòl',                'general',   FALSE, FALSE, 'company',    45),
  ('quality_control',        'operations', 'Contrôle qualité',          'Kontwòl kalite',             'general',   FALSE, FALSE, 'company',    46),
  ('supplier_document',      'operations', 'Document fournisseur',      'Dokiman founisè',            'general',   FALSE, FALSE, 'company',    47),
  ('logistics_document',     'operations', 'Document logistique',       'Dokiman lojistik',           'general',   FALSE, FALSE, 'company',    48),
  ('purchase_order',         'operations', 'Bon de commande',           'Bon kòmand',                 'general',   FALSE, FALSE, 'company',    49),
  ('product_image',          'operations', 'Photo produit',             'Foto pwodwi',                'general',   FALSE, FALSE, 'company',    50),
  ('other',                  'operations', 'Autre',                     'Lòt',                        'general',   FALSE, FALSE, 'company',    99),

  -- ── SALES & LEGAL ─────────────────────────────────────────────────────────
  ('quote',                  'sales_legal', 'Devis',                    'Deviz',                      'general',   FALSE, FALSE, 'company',    60),
  ('invoice_pdf',            'sales_legal', 'Facture',                  'Fakti',                      'financial', FALSE, FALSE, 'company',    61),
  ('contract',               'sales_legal', 'Contrat',                  'Kontra',                     'legal',     TRUE,  FALSE, 'restricted', 62),
  ('partnership_agreement',  'sales_legal', 'Accord de partenariat',    'Akò patenarya',              'legal',     TRUE,  FALSE, 'restricted', 63),
  ('service_agreement',      'sales_legal', 'Contrat de prestation',    'Kontra sèvis',               'legal',     TRUE,  FALSE, 'restricted', 64),
  ('supplier_agreement',     'sales_legal', 'Accord fournisseur',       'Akò founisè',                'legal',     TRUE,  FALSE, 'restricted', 65),
  ('terms_conditions',       'sales_legal', 'Conditions générales',     'Kondisyon jeneral',          'legal',     FALSE, FALSE, 'company',    66),
  ('terms_of_use',           'sales_legal', 'Conditions d''utilisation','Kondisyon itilizasyon',      'legal',     FALSE, FALSE, 'company',    67),
  ('privacy_policy',         'sales_legal', 'Politique de confidentialité','Politik konfidansyalite', 'legal',     FALSE, FALSE, 'company',    68),
  ('refund_policy',          'sales_legal', 'Politique de remboursement','Politik ranbousman',        'legal',     FALSE, FALSE, 'company',    69),

  -- ── HR ────────────────────────────────────────────────────────────────────
  -- `restricted` par défaut, sans exception : un dossier d'employé n'a aucune
  -- raison d'être visible de toute l'entreprise le jour de son dépôt.
  ('employee_document',      'hr', 'Dossier employé',                   'Dosye anplwaye',             'hr',        FALSE, FALSE, 'restricted', 70),
  ('employment_agreement',   'hr', 'Contrat de travail',                'Kontra travay',              'hr',        TRUE,  FALSE, 'restricted', 71),
  ('job_description',        'hr', 'Fiche de poste',                    'Fich pòs',                   'general',   FALSE, FALSE, 'company',    72),
  ('hr_policy',              'hr', 'Règlement intérieur',               'Règleman entèn',             'general',   FALSE, FALSE, 'company',    73),
  ('training_document',      'hr', 'Document de formation',             'Dokiman fòmasyon',           'general',   FALSE, FALSE, 'company',    74),
  ('performance_document',   'hr', 'Évaluation de performance',         'Evalyasyon pèfòmans',        'hr',        FALSE, FALSE, 'restricted', 75),
  ('id_document',            'hr', 'Pièce d''identité',                 'Pyès idantite',              'hr',        TRUE,  FALSE, 'restricted', 76),

  -- ── COMPLIANCE ────────────────────────────────────────────────────────────
  ('company_registration',   'compliance', 'Enregistrement de l''entreprise','Anrejistreman antrepriz','legal',    FALSE, FALSE, 'restricted', 80),
  ('articles_statutes',      'compliance', 'Statuts',                   'Estati',                     'legal',     FALSE, FALSE, 'restricted', 81),
  ('tax_document',           'compliance', 'Document fiscal',           'Dokiman fiskal',             'financial', TRUE,  FALSE, 'restricted', 82),
  ('business_license',       'compliance', 'Licence d''exploitation',   'Lisans eksplwatasyon',       'legal',     TRUE,  FALSE, 'restricted', 83),
  ('permit',                 'compliance', 'Permis',                    'Pèmi',                       'legal',     TRUE,  FALSE, 'restricted', 84),
  ('certificate',            'compliance', 'Certificat',                'Sètifika',                   'legal',     TRUE,  FALSE, 'restricted', 85),
  ('insurance',              'compliance', 'Assurance',                 'Asirans',                    'legal',     TRUE,  FALSE, 'restricted', 86),
  ('tax_filing',             'compliance', 'Déclaration fiscale',       'Deklarasyon fiskal',         'financial', TRUE,  FALSE, 'restricted', 87),
  ('social_declaration',     'compliance', 'Déclaration sociale',       'Deklarasyon sosyal',         'hr',        TRUE,  FALSE, 'restricted', 88)
ON CONFLICT DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. `documents` — les colonnes qui manquent
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Tout est ajouté avec un DEFAULT ou en NULL : aucune ligne existante n'est
-- invalidée, aucune écriture en cours n'est cassée.

ALTER TABLE documents
  -- § Classification
  ADD COLUMN IF NOT EXISTS document_type_id  UUID REFERENCES document_types(id),

  -- § Cycle de vie (§9)
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','pending_review','approved','expired','archived','needs_update')),

  -- § Confidentialité (§42) — voir can_read_document()
  ADD COLUMN IF NOT EXISTS visibility        TEXT NOT NULL DEFAULT 'company'
    CHECK (visibility IN ('company','restricted','private')),

  -- § Stockage (§57) — ce qui remplace `url`
  --
  -- On garde le couple bucket + chemin, jamais l'URL. L'URL signée se fabrique
  -- à la lecture, vit soixante secondes, et n'est jamais écrite nulle part.
  ADD COLUMN IF NOT EXISTS storage_bucket    TEXT,
  ADD COLUMN IF NOT EXISTS storage_path      TEXT,

  -- § Versions (§38, §71)
  ADD COLUMN IF NOT EXISTS current_version   INTEGER NOT NULL DEFAULT 1,

  -- § Propriété et revue (§8, §39)
  ADD COLUMN IF NOT EXISTS owner_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- § Signature (§40) — on prépare les colonnes, on ne construit pas le service
  ADD COLUMN IF NOT EXISTS signature_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS signature_status   TEXT
    CHECK (signature_status IS NULL OR signature_status IN ('pending','signed','declined','expired')),

  -- § Expiration (§34) — une DATE, et pas un instant
  --
  -- `expires_at` est un TIMESTAMPTZ, et c'est le mauvais type pour ce qu'il
  -- porte. « La licence expire le 14 décembre 2027 » n'est pas un instant :
  -- c'est une date au calendrier. Un TIMESTAMPTZ oblige à choisir une heure
  -- qui n'existe pas dans le document papier, puis à la reconvertir pour
  -- l'afficher — et cette reconversion dépend du fuseau de la session.
  --
  -- Concrètement : une licence enregistrée « 2027-12-14 00:00:00+00 » se lit
  -- comme expirant le 13 décembre à 19 h pour une session réglée sur l'heure
  -- d'Haïti. Le moteur d'expiration préviendrait un jour trop tôt, et le
  -- tableau de bord afficherait une date différente de celle du papier.
  --
  -- Pire pour la suite : toute tentative d'indexer `(expires_at AT TIME ZONE
  -- 'America/Port-au-Prince')::date` échouerait. La surcharge
  -- `timezone(text, timestamptz)` est STABLE et non IMMUTABLE — les noms de
  -- fuseaux sont redéfinissables — et PostgreSQL refuse toute fonction non
  -- immuable dans une expression d'index ou une colonne générée. On se serait
  -- heurté au mur en Phase 3, une fois le moteur écrit.
  --
  -- D'où une vraie colonne DATE, remplie par l'application, qui sait ce que le
  -- marchand a saisi. `expires_at` passe en dépréciée, comme `url` et `type`.
  ADD COLUMN IF NOT EXISTS expires_on        DATE,

  -- § Documents financiers dynamiques (§29, §30)
  --
  -- `snapshot_locked_at` est ce qui empêche un P&L d'août de changer en silence
  -- parce qu'une vente d'août a été corrigée en septembre. Celui-là est bien un
  -- INSTANT — le moment où l'on a figé les chiffres — donc TIMESTAMPTZ est le
  -- bon type. `period_start` / `period_end` désignent en revanche des bornes de
  -- calendrier : « août 2026 » ne change pas de sens selon le fuseau du
  -- lecteur, donc DATE.
  ADD COLUMN IF NOT EXISTS is_dynamic        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS snapshot_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_start      DATE,
  ADD COLUMN IF NOT EXISTS period_end        DATE,

  -- § IA (§13, §61, §63)
  --
  -- `ai_analysis_allowed` est vérifié dans `documentService`, jamais chez
  -- l'appelant : un document marqué confidentiel ne part JAMAIS vers un modèle.
  ADD COLUMN IF NOT EXISTS ocr_text          TEXT,
  ADD COLUMN IF NOT EXISTS ai_analysis_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ai_confidence     NUMERIC(4,3)
    CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ADD COLUMN IF NOT EXISTS ai_analyzed_at    TIMESTAMPTZ;

-- `url` a été créée NOT NULL. On ne peut pas stocker un document sans URL tant
-- que la contrainte tient, et le nouveau chemin n'en produit plus.
ALTER TABLE documents ALTER COLUMN url DROP NOT NULL;

COMMENT ON COLUMN documents.url IS
  'DÉPRÉCIÉE — conservée le temps d''une version. Utiliser storage_bucket + '
  'storage_path et fabriquer une URL signée à la lecture (§57, §83).';


-- ── Remplir document_type_id depuis l'ancienne colonne ──────────────────────
--
-- Trivial, parce que les clés du catalogue reprennent verbatim les treize
-- valeurs du CHECK d'origine.

UPDATE documents d
SET    document_type_id = dt.id
FROM   document_types dt
WHERE  dt.business_id IS NULL
  AND  dt.key = d.type
  AND  d.document_type_id IS NULL;


-- ── Retirer le CHECK devenu faux ────────────────────────────────────────────
--
-- La contrainte a été créée en ligne, donc nommée automatiquement par
-- PostgreSQL. On la retrouve par sa forme — une contrainte de vérification
-- portant sur la seule colonne `type` — plutôt qu'en pariant sur son nom.

DO $$
DECLARE
  v_conname TEXT;
  v_attnum  SMALLINT;
BEGIN
  SELECT attnum INTO v_attnum
  FROM   pg_attribute
  WHERE  attrelid = 'public.documents'::regclass AND attname = 'type';

  FOR v_conname IN
    SELECT con.conname
    FROM   pg_constraint con
    WHERE  con.conrelid = 'public.documents'::regclass
      AND  con.contype  = 'c'
      AND  con.conkey   = ARRAY[v_attnum]
  LOOP
    EXECUTE format('ALTER TABLE public.documents DROP CONSTRAINT %I', v_conname);
    RAISE NOTICE 'Contrainte % retirée de documents.type', v_conname;
  END LOOP;
END $$;

-- ── Reprendre les dates d'expiration existantes ─────────────────────────────
--
-- Conversion faite ICI, une fois, dans un UPDATE ponctuel — et c'est
-- précisément l'endroit où une fonction STABLE est légitime : elle est évaluée
-- au moment où la migration tourne, son résultat est écrit en dur dans une
-- colonne DATE, et plus rien ne le recalcule. C'est ce qui distingue une
-- conversion d'un piège : le piège, c'est de laisser la conversion se rejouer à
-- chaque lecture, avec le fuseau de la session du moment.
--
-- Le fuseau est nommé explicitement. Il n'est jamais hérité de `TimeZone`, qui
-- vaut UTC sur les connexions Supabase mais que rien ne garantit : un client
-- SQL, un outil d'administration ou un futur pooler peuvent l'avoir réglé
-- autrement, et la même migration produirait alors des dates différentes.
--
-- 'America/Port-au-Prince' et non un décalage fixe '-05:00' : Haïti observe
-- l'heure d'été. Un intervalle constant serait faux la moitié de l'année.

UPDATE documents
SET    expires_on = (expires_at AT TIME ZONE 'America/Port-au-Prince')::date
WHERE  expires_at IS NOT NULL
  AND  expires_on IS NULL;

-- Index sur une colonne DATE nue : rien à évaluer, donc rien qui puisse être
-- non immuable. C'est le moteur d'expiration du §34 qui le lira.
CREATE INDEX IF NOT EXISTS idx_documents_expires_on
  ON documents (expires_on)
  WHERE expires_on IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN documents.expires_on IS
  'Date d''expiration au calendrier (§34). Source de vérité — c''est elle que '
  'lisent le moteur d''expiration, le score de santé et l''interface.';

COMMENT ON COLUMN documents.expires_at IS
  'DÉPRÉCIÉE — TIMESTAMPTZ pour une notion calendaire. Utiliser expires_on. '
  'Conservée le temps d''une version pour les lignes antérieures.';


-- Retirer le CHECK ne suffit pas : la colonne reste NOT NULL, et tout code neuf
-- serait obligé de remplir une colonne qu'on vient de déprécier — en y écrivant
-- quoi, d'ailleurs ? La contrainte de présence tombe avec la contrainte de
-- valeur ; les lignes existantes gardent la leur.
ALTER TABLE documents ALTER COLUMN type DROP NOT NULL;

COMMENT ON COLUMN documents.type IS
  'DÉPRÉCIÉE — remplacée par document_type_id → document_types. Conservée pour '
  'les lignes antérieures ; ne plus écrire dedans.';


-- ── Recherche plein texte (§16) ─────────────────────────────────────────────
--
-- Configuration 'simple' et non 'french' : une colonne générée exige des
-- fonctions IMMUTABLE, et `unaccent()` ne l'est pas par défaut. 'simple' + le
-- filtrage `pg_trgm` côté requête couvrent le besoin sans piéger la migration.
-- La recherche accentuée fine se fera au moment de la requête, pas de l'index.

-- ── Pourquoi `tags` n'est PAS dans ce vecteur ───────────────────────────────
--
-- La version précédente y mettait `array_to_string(tags, ' ')`, et PostgreSQL
-- refusait la colonne : « generation expression is not immutable ».
--
-- `array_to_string(anyarray, text)` est STABLE, pas IMMUTABLE — elle appelle la
-- fonction de sortie du type des éléments, et pour certains types (horodatages
-- notamment) cette sortie dépend de réglages de session comme `DateStyle` ou
-- `TimeZone`. Que `tags` soit un TEXT[] n'y change rien : la volatilité est
-- déclarée sur la fonction, pas déduite des arguments.
--
-- Aucune perte : les étiquettes ont déjà leur propre index GIN juste en
-- dessous, et `tags @> ARRAY['licence']` est de toute façon une meilleure
-- recherche par étiquette qu'un mot noyé dans un vecteur plein texte.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(ocr_text, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_documents_search      ON documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_documents_tags        ON documents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_documents_type_id     ON documents (document_type_id);
CREATE INDEX IF NOT EXISTS idx_documents_status      ON documents (business_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_visibility  ON documents (business_id, visibility) WHERE deleted_at IS NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. `document_permissions` — la liste nominative des documents restreints
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Créée ici, et pas en phase 1, parce que `can_read_document()` la lit : une
-- fonction ne peut pas dépendre d'une table qui n'existe pas encore.
--
-- Une entrée autorise SOIT une personne (`user_id`), SOIT un rôle entier
-- (`role`) — jamais les deux, jamais aucun des deux.

CREATE TABLE IF NOT EXISTS document_permissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  -- Redondant avec documents.business_id, et volontairement : sans lui, la
  -- politique RLS de CETTE table devrait relire `documents` à chaque ligne.
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  role        member_role_type,

  can_write   BOOLEAN     NOT NULL DEFAULT FALSE,
  granted_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT document_permissions_target_ck
    CHECK ((user_id IS NOT NULL AND role IS NULL) OR (user_id IS NULL AND role IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS document_permissions_user_uq
  ON document_permissions (document_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_permissions_role_uq
  ON document_permissions (document_id, role)    WHERE role    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_permissions_doc
  ON document_permissions (document_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. QUI A LE DROIT DE LIRE — la fonction qui remplace `is_business_member`
-- ═════════════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER, pour la même raison que `is_business_member` l'est déjà
-- (cf. 20260629_fix_rls_recursion.sql) : la fonction lit `documents` alors
-- qu'elle est appelée DEPUIS la politique de `documents`. Sans le contournement
-- de RLS à l'intérieur, la récursion serait infinie.
--
-- ── Les trois portes, dans l'ordre ──────────────────────────────────────────
--
--   1. Appartenance. Pas membre actif : rien. C'est l'isolation entre
--      entreprises (§77), et elle ne souffre aucune exception.
--
--   2. Sensibilité. C'est la porte que `is_business_member` n'avait pas.
--      Le comptable voit les documents financiers ; le gérant voit
--      l'opérationnel et le juridique ; les fiches de paie ne se voient qu'en
--      haut. Le propriétaire passe partout — c'est son entreprise.
--
--   3. Visibilité. `company` s'arrête à la porte 2. `restricted` exige une
--      entrée nominative. `private` ne s'ouvre qu'au créateur.
--
-- ── Une décision qui mérite d'être écrite ───────────────────────────────────
--
-- Pour un document `restricted`, l'entrée nominative REMPLACE la porte de
-- sensibilité au lieu de s'y ajouter. Autrement dit : partager explicitement un
-- contrat avec un employé nommé lui donne accès, même si son rôle ne lui
-- ouvrait pas les documents juridiques.
--
-- C'est délibéré. `restricted` n'est pas un cran de plus dans la même échelle,
-- c'est une autre échelle : quelqu'un a désigné cette personne pour ce document.
-- L'alternative — exiger les deux — rendrait le partage nominatif inutile
-- précisément dans les cas où on s'en sert : montrer un contrat à celui qui doit
-- le signer. La trace de qui a accordé quoi reste dans `granted_by`.

CREATE OR REPLACE FUNCTION public.can_read_document(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc         RECORD;
  v_role        member_role_type;
  v_sensitivity TEXT;
  v_is_owner    BOOLEAN;
BEGIN
  SELECT d.business_id, d.visibility, d.created_by, d.owner_user_id, d.document_type_id
  INTO   v_doc
  FROM   documents d
  WHERE  d.id = p_document_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- ── Porte 1 : appartenance ────────────────────────────────────────────────
  SELECT bm.role INTO v_role
  FROM   business_members bm
  WHERE  bm.business_id = v_doc.business_id
    AND  bm.user_id     = auth.uid()
    AND  bm.is_active   = TRUE
    AND  bm.deleted_at IS NULL
  LIMIT  1;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.id = v_doc.business_id AND b.owner_id = auth.uid()
  ) INTO v_is_owner;

  -- Le propriétaire de l'entreprise passe toutes les portes. Lui refuser un
  -- document de sa propre entreprise n'aurait aucun sens ; et c'est lui qui pose
  -- les restrictions, il ne peut pas s'enfermer dehors.
  IF v_is_owner OR v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  -- ── Porte 3, prise en premier quand elle décide seule ─────────────────────
  IF v_doc.visibility = 'private' THEN
    RETURN v_doc.created_by = auth.uid() OR v_doc.owner_user_id = auth.uid();
  END IF;

  IF v_doc.visibility = 'restricted' THEN
    RETURN EXISTS (
      SELECT 1 FROM document_permissions dp
      WHERE  dp.document_id = p_document_id
        AND (dp.user_id = auth.uid() OR dp.role = v_role)
    ) OR v_doc.created_by = auth.uid() OR v_doc.owner_user_id = auth.uid();
  END IF;

  -- ── Porte 2 : sensibilité (visibilité 'company') ──────────────────────────
  SELECT dt.sensitivity INTO v_sensitivity
  FROM   document_types dt
  WHERE  dt.id = v_doc.document_type_id;

  -- Type inconnu (document antérieur au catalogue) : on retient la lecture la
  -- plus prudente. Un document non classé n'est pas un document public.
  v_sensitivity := coalesce(v_sensitivity, 'general');

  RETURN CASE v_sensitivity
    WHEN 'financial' THEN v_role IN ('admin', 'accountant')
    WHEN 'hr'        THEN v_role IN ('admin')
    WHEN 'legal'     THEN v_role IN ('admin', 'manager')
    ELSE TRUE   -- 'general' : tout membre actif
  END;
END;
$$;

COMMENT ON FUNCTION public.can_read_document(UUID) IS
  'Appartenance + sensibilité du type + visibilité du document (§41, §42, §78). '
  'Remplace is_business_member() pour les documents, qui ignorait le rôle.';


-- ── Écrire : lire, plus un rôle qui en a le droit ───────────────────────────
--
-- Le créateur garde la main sur son propre document — sinon un employé qui
-- dépose une pièce ne pourrait plus corriger le nom qu'il vient de lui donner.

CREATE OR REPLACE FUNCTION public.can_write_document(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc  RECORD;
  v_role member_role_type;
BEGIN
  IF NOT can_read_document(p_document_id) THEN
    RETURN FALSE;
  END IF;

  SELECT d.business_id, d.created_by, d.status
  INTO   v_doc
  FROM   documents d
  WHERE  d.id = p_document_id;

  -- Un document approuvé ne se modifie plus en place : il se re-versionne
  -- (§71). Seuls le propriétaire et l'administrateur peuvent y revenir.
  SELECT bm.role INTO v_role
  FROM   business_members bm
  WHERE  bm.business_id = v_doc.business_id
    AND  bm.user_id     = auth.uid()
    AND  bm.is_active   = TRUE
    AND  bm.deleted_at IS NULL
  LIMIT  1;

  IF v_doc.status = 'approved' THEN
    RETURN v_role IN ('owner', 'admin');
  END IF;

  RETURN v_role IN ('owner', 'admin', 'manager')
      OR v_doc.created_by = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_read_document(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_document(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. LES POLITIQUES — quatre verbes, quatre règles
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `FOR ALL` faisait de « lire » et « supprimer » le même droit. C'est ce qui
-- permettait à un `viewer` d'effacer un contrat.

ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_permissions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_access" ON public.documents;
DROP POLICY IF EXISTS "documents_select" ON public.documents;
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_update" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;

CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (can_read_document(id));

-- À l'insertion, le document n'a pas encore d'identifiant : `can_read_document`
-- n'a rien à interroger. On vérifie donc l'appartenance et le rôle, et les
-- règles fines s'appliquent dès la ligne écrite.
--
-- `created_by` est contraint à l'appelant. Sans cette clause, un membre pouvait
-- déposer un document en l'attribuant à quelqu'un d'autre — et comme
-- `can_write_document()` rend la main au créateur, il suffisait de se désigner
-- soi-même pour garder l'écriture sur un document qu'on aurait dû lâcher. Sur
-- une table dont le §43 fait un objet auditable, l'auteur ne se choisit pas.
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (
    fn_has_role(business_id, 'owner', 'admin', 'manager', 'accountant',
                             'cashier', 'employee', 'inventory_manager')
    AND (created_by IS NULL OR created_by = auth.uid())
  );

CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (can_write_document(id)) WITH CHECK (can_write_document(id));

-- Supprimer reste le geste le plus rare et le plus grave (§38 : « ne jamais
-- supprimer sans une action administrative explicite »).
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (fn_has_role(business_id, 'owner', 'admin'));


-- Le catalogue : lisible par tout utilisateur connecté pour la partie globale,
-- et par les membres pour les types personnalisés. Écriture réservée au
-- propriétaire et à l'administrateur de l'entreprise concernée.
DROP POLICY IF EXISTS "document_types_select" ON public.document_types;
DROP POLICY IF EXISTS "document_types_write"  ON public.document_types;

CREATE POLICY "document_types_select" ON public.document_types
  FOR SELECT TO authenticated
  USING (business_id IS NULL OR is_business_member(business_id));

CREATE POLICY "document_types_write" ON public.document_types
  FOR ALL TO authenticated
  USING (business_id IS NOT NULL AND fn_has_role(business_id, 'owner', 'admin'))
  WITH CHECK (business_id IS NOT NULL AND fn_has_role(business_id, 'owner', 'admin'));


-- Les autorisations nominatives : visibles de ceux qui peuvent déjà lire le
-- document, modifiables seulement par ceux qui peuvent l'administrer.
DROP POLICY IF EXISTS "document_permissions_select" ON public.document_permissions;
DROP POLICY IF EXISTS "document_permissions_write"  ON public.document_permissions;

CREATE POLICY "document_permissions_select" ON public.document_permissions
  FOR SELECT USING (can_read_document(document_id));

CREATE POLICY "document_permissions_write" ON public.document_permissions
  FOR ALL
  USING (fn_has_role(business_id, 'owner', 'admin', 'manager'))
  WITH CHECK (fn_has_role(business_id, 'owner', 'admin', 'manager'));


-- Les GRANT ouvrent la table au rôle ; ce sont les politiques ci-dessus qui
-- décident ligne par ligne. Sans GRANT, RLS n'est même pas consulté — la
-- requête échoue avant.
GRANT SELECT, INSERT, UPDATE, DELETE ON document_types       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents            TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. LE BUCKET — privé, sans exception
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `store-assets` est public parce qu'une vitrine s'affiche pour des inconnus.
-- Ici, c'est l'inverse exact : aucune lecture publique, jamais. Le navigateur
-- ne reçoit que des URL signées de soixante secondes, fabriquées par une route
-- authentifiée qui a d'abord appelé `can_read_document()`.
--
-- Le premier segment du chemin est le `business_id` : c'est ce qui rend la
-- politique de `storage.objects` écrivable (`storage.foldername(name)[1]`).
--   <business_id>/<document_id>/<version>/<nom-assaini>

-- La création du bucket est protégée au même titre que la politique : sur
-- certains projets, le rôle qui joue la migration n'a pas la main sur le schéma
-- `storage`. Le reste de la migration — catalogue, colonnes, fonctions,
-- politiques — n'a aucune raison d'échouer parce qu'un bucket doit être créé à
-- la souris.
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'business-documents', 'business-documents', FALSE, 26214400,
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
      'image/jpeg','image/png','image/webp','image/heic'
    ]
  )
  ON CONFLICT (id) DO UPDATE SET
    public             = FALSE,
    file_size_limit    = 26214400,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'Bucket non créé (privilèges insuffisants). À créer depuis Supabase → Storage : nom « business-documents », PRIVÉ, 25 Mo.';
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "business_documents_member_rw" ON storage.objects;

  -- Membre actif de l'entreprise dont l'identifiant préfixe le chemin. Rien de
  -- plus fin ici : c'est la SECONDE barrière, celle qui arrête un appel direct
  -- au client Supabase depuis le navigateur. La vraie décision — rôle,
  -- sensibilité, visibilité — est prise par `can_read_document()` dans la route
  -- de téléchargement, avant que la moindre URL signée ne soit fabriquée.
  CREATE POLICY "business_documents_member_rw" ON storage.objects
    FOR ALL TO authenticated
    USING (
      bucket_id = 'business-documents'
      AND EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.user_id   = auth.uid()
          AND bm.is_active = TRUE
          AND bm.deleted_at IS NULL
          AND bm.business_id::text = (storage.foldername(name))[1]
      )
    )
    WITH CHECK (
      bucket_id = 'business-documents'
      AND EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.user_id   = auth.uid()
          AND bm.is_active = TRUE
          AND bm.deleted_at IS NULL
          AND bm.business_id::text = (storage.foldername(name))[1]
      )
    );
EXCEPTION WHEN insufficient_privilege THEN
  -- Sur certains projets hébergés, `storage.objects` n'appartient pas au rôle
  -- qui joue la migration — c'est déjà arrivé pour `store-assets`.
  RAISE NOTICE 'Politique storage non appliquée (privilèges insuffisants). À poser depuis Supabase → Storage → business-documents → Policies.';
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. VÉRIFICATION — à lire dans la sortie du SQL Editor
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'types au catalogue'      AS controle, count(*)::text AS valeur FROM document_types WHERE business_id IS NULL
UNION ALL
SELECT 'documents reclassés',    count(*)::text FROM documents WHERE document_type_id IS NOT NULL
UNION ALL
SELECT 'documents sans type',    count(*)::text FROM documents WHERE document_type_id IS NULL AND deleted_at IS NULL
UNION ALL
SELECT 'politiques sur documents', count(*)::text FROM pg_policies WHERE tablename = 'documents'
UNION ALL
SELECT 'bucket privé',           (NOT public)::text FROM storage.buckets WHERE id = 'business-documents';
