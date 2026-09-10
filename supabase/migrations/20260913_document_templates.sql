-- ─────────────────────────────────────────────────────────────────────────────
-- Document Center — Phase 2 : modèles, contenu par blocs, versions de contenu
--
-- La Phase 1 sait ranger un fichier déposé. Celle-ci apprend à l'application à
-- PRODUIRE un document : un contrat de travail, une reconnaissance de dette,
-- une procédure — écrits depuis un modèle, avec les données du commerce déjà
-- dedans.
--
--   `document_templates`          §19, §53, §54 — la bibliothèque de modèles
--   `documents.content_blocks`    §20 — un document sans fichier, fait de blocs
--   `document_versions.content_blocks`  §38 — le passé d'un texte, pas d'un PDF
--
-- ── Pourquoi des blocs et pas du HTML ───────────────────────────────────────
--
-- Le §20 demande un éditeur de documents, pas un traitement de texte. Stocker
-- du HTML libre ferait entrer dans la base tout ce qu'un navigateur accepte —
-- balises de script comprises — et rendrait l'export PDF dépendant du style que
-- l'utilisateur a collé depuis Word. Une liste de blocs typés se rend en HTML,
-- en texte, en PDF, et se relit dans six mois sans deviner ce que l'auteur
-- voulait dire.
--
-- ── PRÉREQUIS ───────────────────────────────────────────────────────────────
-- 20260911_document_center_foundation.sql
-- 20260912_document_center_relations.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.document_types') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'PRÉREQUIS MANQUANT — la table document_types n''existe pas.',
      HINT    = 'Appliquez 20260911_document_center_foundation.sql avant ce fichier.';
  END IF;

  IF to_regclass('public.document_versions') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'PRÉREQUIS MANQUANT — la table document_versions n''existe pas.',
      HINT    = 'Appliquez 20260912_document_center_relations.sql avant ce fichier.';
  END IF;
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. `document_templates` — ce à partir de quoi on écrit
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `business_id IS NULL` désigne le catalogue livré avec le produit : les mêmes
-- modèles pour tout le monde, corrigibles par une migration. Une entreprise qui
-- adapte un modèle en crée une copie qui porte SON `business_id` — l'original
-- reste intact pour les autres, ce qui est exactement ce qu'on veut d'un
-- catalogue partagé.

CREATE TABLE IF NOT EXISTS document_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        REFERENCES businesses(id) ON DELETE CASCADE,

  key          TEXT        NOT NULL,
  document_type_id UUID    REFERENCES document_types(id) ON DELETE SET NULL,
  category     TEXT        NOT NULL
                 CHECK (category IN ('strategy','finance','operations','sales_legal','hr','compliance')),

  title_fr     TEXT        NOT NULL,
  title_ht     TEXT        NOT NULL,
  summary_fr   TEXT,
  summary_ht   TEXT,

  -- À qui ce modèle parle. NULL = à tout le monde. Le §53 demande des modèles
  -- par industrie ; le référentiel des pays arrive avec la Phase 3.
  industry     TEXT,
  country_code TEXT,

  -- Le corps du modèle : un tableau de blocs typés, chaque texte bilingue.
  -- Voir lib/documents/blocks.ts — c'est ce fichier-là qui fait foi sur la
  -- forme, et la validation se fait à la lecture, pas par une contrainte SQL
  -- qui aurait à être migrée à chaque nouveau type de bloc.
  blocks       JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Les variables que le modèle attend — `company.name`, `employee.full_name`…
  -- Redondant avec `blocks` (on pourrait les extraire), et volontairement :
  -- l'écran de choix doit pouvoir dire « ce modèle a besoin d'un employé »
  -- sans parcourir tout le corps du texte.
  variables    TEXT[]      NOT NULL DEFAULT '{}',

  -- §23 : tout document juridique, fiscal ou réglementaire porte la mention de
  -- vérification professionnelle. Le drapeau vit ici pour que l'écran ne
  -- l'oublie jamais, et pour qu'on puisse répondre « lesquels ? » en une
  -- requête le jour où la question se pose.
  requires_professional_review BOOLEAN NOT NULL DEFAULT FALSE,

  sort_order   INTEGER     NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,

  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deux index partiels plutôt qu'un UNIQUE ordinaire : celui-ci traiterait
-- chaque NULL comme distinct et laisserait le catalogue global se doubler.
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_global_key_uq
  ON document_templates (key) WHERE business_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_business_key_uq
  ON document_templates (business_id, key) WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_templates_category
  ON document_templates (category, sort_order) WHERE is_active;

COMMENT ON TABLE document_templates IS
  'Modèles de documents (§19, §53). business_id NULL = catalogue global livré avec le produit.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Un document peut n'avoir aucun fichier
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Jusqu'ici, `documents` décrivait un fichier déposé : `storage_path` menait au
-- bucket. Un document écrit depuis un modèle n'a pas de fichier — il A un
-- contenu. Les deux formes cohabitent dans la même table, et c'est voulu : la
-- bibliothèque, la recherche, l'expiration, les rattachements et les
-- permissions valent pour l'un comme pour l'autre. Deux tables auraient
-- dédoublé tout cela pour la seule raison que l'un est un PDF et l'autre non.
--
-- `storage_path IS NULL AND content_blocks IS NOT NULL` : document écrit.
-- `storage_path IS NOT NULL` : document déposé.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_blocks JSONB,
  ADD COLUMN IF NOT EXISTS template_id    UUID REFERENCES document_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.documents.content_blocks IS
  'Corps d''un document écrit dans l''application (§20). NULL pour un fichier déposé.';

-- Le passé d'un texte se garde comme celui d'un fichier : la version porte SON
-- contenu. Sans cette colonne, « restaurer la version 2 » d'un contrat écrit
-- n'aurait rien à restaurer — exactement le défaut que le §38 interdit.
ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS content_blocks JSONB;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. POLITIQUES
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Le catalogue global se lit par tout utilisateur authentifié : ce sont des
-- modèles vierges, ils ne contiennent aucune donnée d'entreprise. Les modèles
-- d'une entreprise ne se lisent que par ses membres.
--
-- L'écriture n'est ouverte qu'aux rôles qui administrent, et JAMAIS sur le
-- catalogue global : `business_id IS NOT NULL` dans le WITH CHECK est ce qui
-- empêche un marchand de réécrire le modèle de contrat de tous les autres.

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_templates_select" ON public.document_templates;
DROP POLICY IF EXISTS "document_templates_write"  ON public.document_templates;

CREATE POLICY "document_templates_select" ON public.document_templates
  FOR SELECT USING (
    business_id IS NULL
    OR is_business_member(business_id)
  );

CREATE POLICY "document_templates_write" ON public.document_templates
  FOR ALL
  USING      (business_id IS NOT NULL AND fn_has_role(business_id, 'owner', 'admin'))
  WITH CHECK (business_id IS NOT NULL AND fn_has_role(business_id, 'owner', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON document_templates TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. LE CATALOGUE LIVRÉ
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Huit modèles, en français et en créole, écrits pour un commerce haïtien.
--
-- ⚠️ Aucun n'est un avis juridique. Ceux qui engagent — contrat de travail,
-- reconnaissance de dette, contrat de fourniture, règlement intérieur — portent
-- `requires_professional_review`, et l'application affiche la mention du §23
-- partout où ils apparaissent. Un modèle est un point de départ ; il ne
-- remplace ni un avocat ni un comptable.
--
-- Les `{{variables}}` sont résolues à la création du document, par
-- lib/documents/variables.ts. Une variable inconnue reste visible telle quelle
-- dans le texte : mieux vaut un `{{employee.position}}` qui saute aux yeux
-- qu'un blanc qu'on ne remarque pas.

INSERT INTO document_templates
  (business_id, key, category, title_fr, title_ht, summary_fr, summary_ht,
   variables, requires_professional_review, sort_order, blocks)
VALUES

-- ── 1. Contrat de travail ───────────────────────────────────────────────────
(NULL, 'contrat_travail', 'hr',
 'Contrat de travail', 'Kontra travay',
 'Le contrat de base entre le commerce et un employé : poste, salaire, horaires, durée.',
 'Kontra debaz ant komès la ak yon anplwaye : pòs, salè, orè, dire.',
 ARRAY['company.name','company.address','company.phone','employee.full_name','employee.position','employee.hire_date','employee.salary','date.today'],
 TRUE, 10,
 '[
   {"type":"heading","level":1,"text":{"fr":"Contrat de travail","ht":"Kontra travay"}},
   {"type":"fields","items":[
     {"label":{"fr":"Employeur","ht":"Anplwayè"},"value":"{{company.name}}"},
     {"label":{"fr":"Adresse","ht":"Adrès"},"value":"{{company.address}}"},
     {"label":{"fr":"Employé","ht":"Anplwaye"},"value":"{{employee.full_name}}"},
     {"label":{"fr":"Poste","ht":"Pòs"},"value":"{{employee.position}}"},
     {"label":{"fr":"Date d''entrée","ht":"Dat antre"},"value":"{{employee.hire_date}}"}
   ]},
   {"type":"heading","level":2,"text":{"fr":"1. Objet","ht":"1. Objè"}},
   {"type":"paragraph","text":{"fr":"{{company.name}} engage {{employee.full_name}} au poste de {{employee.position}}. L''employé accepte d''exercer ses fonctions avec soin et selon les instructions de l''employeur.","ht":"{{company.name}} anboche {{employee.full_name}} nan pòs {{employee.position}}. Anplwaye a aksepte fè travay li ak swen, dapre enstriksyon anplwayè a."}},
   {"type":"heading","level":2,"text":{"fr":"2. Rémunération","ht":"2. Salè"}},
   {"type":"paragraph","text":{"fr":"Le salaire est fixé à {{employee.salary}}, payable selon la périodicité convenue entre les parties.","ht":"Salè a se {{employee.salary}}, y ap peye l dapre peryòd de pati yo antann yo."}},
   {"type":"heading","level":2,"text":{"fr":"3. Horaires et lieu de travail","ht":"3. Orè ak kote travay la"}},
   {"type":"paragraph","text":{"fr":"Les horaires et le lieu de travail sont précisés ci-dessous et peuvent être ajustés d''un commun accord.","ht":"Orè ak kote travay la ekri anba a, epi de pati yo ka chanje yo ansanm."}},
   {"type":"list","items":[
     {"fr":"Horaires : ______________________","ht":"Orè : ______________________"},
     {"fr":"Jours de repos : ______________________","ht":"Jou repo : ______________________"},
     {"fr":"Lieu de travail : {{company.address}}","ht":"Kote travay : {{company.address}}"}
   ]},
   {"type":"heading","level":2,"text":{"fr":"4. Durée","ht":"4. Dire"}},
   {"type":"paragraph","text":{"fr":"Le présent contrat prend effet le {{employee.hire_date}}. Sa durée et ses conditions de rupture sont précisées ci-dessous.","ht":"Kontra sa a kòmanse {{employee.hire_date}}. Dire l ak kondisyon pou kase l ekri anba a."}},
   {"type":"notice","text":{"fr":"Ce modèle est un point de départ. Faites-le vérifier par un professionnel du droit du travail avant signature : les obligations légales varient et évoluent.","ht":"Modèl sa a se yon pwen depa. Fè yon pwofesyonèl nan dwa travay verifye l anvan ou siyen : obligasyon legal yo chanje."}},
   {"type":"signature","parties":[
     {"fr":"L''employeur — {{company.name}}","ht":"Anplwayè a — {{company.name}}"},
     {"fr":"L''employé — {{employee.full_name}}","ht":"Anplwaye a — {{employee.full_name}}"}
   ]},
   {"type":"paragraph","text":{"fr":"Fait à ______________________, le {{date.today}}.","ht":"Fèt nan ______________________, jou {{date.today}}."}}
 ]'::jsonb),

-- ── 2. Attestation d''emploi ────────────────────────────────────────────────
(NULL, 'attestation_emploi', 'hr',
 'Attestation d''emploi', 'Atestasyon travay',
 'La preuve qu''une personne travaille bien chez vous — demandée par les banques et les bailleurs.',
 'Prèv yon moun ap travay lakay ou — bank ak mèt kay konn mande l.',
 ARRAY['company.name','company.address','employee.full_name','employee.position','employee.hire_date','date.today'],
 FALSE, 20,
 '[
   {"type":"heading","level":1,"text":{"fr":"Attestation d''emploi","ht":"Atestasyon travay"}},
   {"type":"paragraph","text":{"fr":"Je soussigné, représentant de {{company.name}}, atteste que {{employee.full_name}} est employé(e) au sein de notre entreprise depuis le {{employee.hire_date}}, au poste de {{employee.position}}.","ht":"Mwen menm, reprezantan {{company.name}}, m ap atèste {{employee.full_name}} ap travay nan antrepriz nou an depi {{employee.hire_date}}, nan pòs {{employee.position}}."}},
   {"type":"paragraph","text":{"fr":"La présente attestation est délivrée à l''intéressé(e) pour servir et valoir ce que de droit.","ht":"Nou bay atestasyon sa a pou moun nan sèvi avè l kote li bezwen."}},
   {"type":"fields","items":[
     {"label":{"fr":"Entreprise","ht":"Antrepriz"},"value":"{{company.name}}"},
     {"label":{"fr":"Adresse","ht":"Adrès"},"value":"{{company.address}}"},
     {"label":{"fr":"Fait le","ht":"Fèt jou"},"value":"{{date.today}}"}
   ]},
   {"type":"signature","parties":[
     {"fr":"Pour {{company.name}}","ht":"Pou {{company.name}}"}
   ]}
 ]'::jsonb),

-- ── 3. Reconnaissance de dette ──────────────────────────────────────────────
(NULL, 'reconnaissance_dette', 'sales_legal',
 'Reconnaissance de dette', 'Rekonesans dèt',
 'Le client reconnaît par écrit ce qu''il doit, et quand il paiera. À faire signer.',
 'Kliyan an rekonèt sou papye sa li dwe a, ak kilè l ap peye. Fè l siyen.',
 ARRAY['company.name','company.address','customer.name','customer.phone','customer.balance','date.today'],
 TRUE, 30,
 '[
   {"type":"heading","level":1,"text":{"fr":"Reconnaissance de dette","ht":"Rekonesans dèt"}},
   {"type":"paragraph","text":{"fr":"Je soussigné(e) {{customer.name}}, reconnais devoir à {{company.name}} la somme de {{customer.balance}}.","ht":"Mwen menm {{customer.name}}, mwen rekonèt mwen dwe {{company.name}} yon sòm {{customer.balance}}."}},
   {"type":"heading","level":2,"text":{"fr":"Modalités de remboursement","ht":"Jan pou peye"}},
   {"type":"list","items":[
     {"fr":"Montant dû : {{customer.balance}}","ht":"Kòb ki dwe : {{customer.balance}}"},
     {"fr":"Date limite de paiement : ______________________","ht":"Dat limit pou peye : ______________________"},
     {"fr":"Versements convenus : ______________________","ht":"Vèsman yo antann yo sou li : ______________________"}
   ]},
   {"type":"paragraph","text":{"fr":"Cette reconnaissance est établie de bonne foi entre les parties. Elle ne remplace aucune formalité légale exigée pour le recouvrement.","ht":"Rekonesans sa a fèt ak bon fwa ant de pati yo. Li pa ranplase okenn fòmalite legal yo mande pou rekipere lajan an."}},
   {"type":"notice","text":{"fr":"Avant d''utiliser ce document pour une créance importante, faites-le vérifier par un professionnel du droit.","ht":"Anvan ou sèvi ak papye sa a pou yon gwo dèt, fè yon pwofesyonèl nan dwa verifye l."}},
   {"type":"fields","items":[
     {"label":{"fr":"Téléphone du client","ht":"Telefòn kliyan an"},"value":"{{customer.phone}}"},
     {"label":{"fr":"Fait le","ht":"Fèt jou"},"value":"{{date.today}}"}
   ]},
   {"type":"signature","parties":[
     {"fr":"Le débiteur — {{customer.name}}","ht":"Moun ki dwe a — {{customer.name}}"},
     {"fr":"Le créancier — {{company.name}}","ht":"Moun yo dwe a — {{company.name}}"}
   ]}
 ]'::jsonb),

-- ── 4. Contrat de fourniture ────────────────────────────────────────────────
(NULL, 'contrat_fourniture', 'sales_legal',
 'Contrat de fourniture', 'Kontra founiti',
 'Ce que le fournisseur livre, à quel prix, dans quels délais, et qui paie quoi.',
 'Sa founisè a ap livre, a ki pri, nan ki delè, e kiyès ki peye kisa.',
 ARRAY['company.name','company.address','company.phone','supplier.name','supplier.phone','date.today'],
 TRUE, 40,
 '[
   {"type":"heading","level":1,"text":{"fr":"Contrat de fourniture","ht":"Kontra founiti"}},
   {"type":"fields","items":[
     {"label":{"fr":"Acheteur","ht":"Achtè"},"value":"{{company.name}}"},
     {"label":{"fr":"Fournisseur","ht":"Founisè"},"value":"{{supplier.name}}"},
     {"label":{"fr":"Téléphone du fournisseur","ht":"Telefòn founisè a"},"value":"{{supplier.phone}}"}
   ]},
   {"type":"heading","level":2,"text":{"fr":"1. Marchandises","ht":"1. Machandiz"}},
   {"type":"table","columns":[{"fr":"Produit","ht":"Pwodwi"},{"fr":"Quantité","ht":"Kantite"},{"fr":"Prix unitaire","ht":"Pri chak"}],
    "rows":[["______________________","__________","__________"],["______________________","__________","__________"]]},
   {"type":"heading","level":2,"text":{"fr":"2. Livraison","ht":"2. Livrezon"}},
   {"type":"list","items":[
     {"fr":"Lieu de livraison : {{company.address}}","ht":"Kote pou livre : {{company.address}}"},
     {"fr":"Délai convenu : ______________________","ht":"Delè yo antann yo : ______________________"},
     {"fr":"Frais de transport à la charge de : ______________________","ht":"Kiyès ki peye transpò : ______________________"}
   ]},
   {"type":"heading","level":2,"text":{"fr":"3. Paiement","ht":"3. Peman"}},
   {"type":"paragraph","text":{"fr":"Les conditions de paiement sont convenues entre les parties et précisées ci-dessous. Tout retard de livraison ou de paiement est signalé par écrit.","ht":"Kondisyon peman yo se de pati yo ki antann yo sou yo, epi yo ekri anba a. Tout reta nan livrezon oswa nan peman dwe siyale sou papye."}},
   {"type":"notice","text":{"fr":"Ce modèle couvre les cas simples. Pour un engagement long ou de montant élevé, faites-le vérifier par un professionnel du droit.","ht":"Modèl sa a bon pou ka senp yo. Pou yon angajman ki long oswa ki gwo, fè yon pwofesyonèl nan dwa verifye l."}},
   {"type":"signature","parties":[
     {"fr":"L''acheteur — {{company.name}}","ht":"Achtè a — {{company.name}}"},
     {"fr":"Le fournisseur — {{supplier.name}}","ht":"Founisè a — {{supplier.name}}"}
   ]},
   {"type":"paragraph","text":{"fr":"Fait le {{date.today}}.","ht":"Fèt jou {{date.today}}."}}
 ]'::jsonb),

-- ── 5. Devis ────────────────────────────────────────────────────────────────
(NULL, 'devis', 'sales_legal',
 'Devis', 'Deviz',
 'Le prix annoncé au client avant la vente, avec sa durée de validité.',
 'Pri ou anonse kliyan an anvan vant lan, ak konbyen tan li bon.',
 ARRAY['company.name','company.address','company.phone','customer.name','customer.phone','date.today'],
 FALSE, 50,
 '[
   {"type":"heading","level":1,"text":{"fr":"Devis","ht":"Deviz"}},
   {"type":"fields","items":[
     {"label":{"fr":"De","ht":"Soti nan"},"value":"{{company.name}} — {{company.phone}}"},
     {"label":{"fr":"Pour","ht":"Pou"},"value":"{{customer.name}}"},
     {"label":{"fr":"Date","ht":"Dat"},"value":"{{date.today}}"}
   ]},
   {"type":"table","columns":[{"fr":"Désignation","ht":"Deskripsyon"},{"fr":"Quantité","ht":"Kantite"},{"fr":"Prix unitaire","ht":"Pri chak"},{"fr":"Total","ht":"Total"}],
    "rows":[["______________________","______","__________","__________"],["______________________","______","__________","__________"],["______________________","______","__________","__________"]]},
   {"type":"fields","items":[
     {"label":{"fr":"Total à payer","ht":"Total pou peye"},"value":"______________________"},
     {"label":{"fr":"Devis valable jusqu''au","ht":"Deviz la bon jiska"},"value":"______________________"}
   ]},
   {"type":"paragraph","text":{"fr":"Ce devis n''engage le client qu''après acceptation écrite. Passé la date de validité, les prix peuvent changer.","ht":"Deviz sa a pa angaje kliyan an toutotan li pa aksepte l sou papye. Apre dat la, pri yo ka chanje."}},
   {"type":"signature","parties":[
     {"fr":"Bon pour accord — {{customer.name}}","ht":"Dakò — {{customer.name}}"}
   ]}
 ]'::jsonb),

-- ── 6. Reçu de versement ────────────────────────────────────────────────────
(NULL, 'recu_versement', 'finance',
 'Reçu de versement', 'Resi vèsman',
 'La preuve écrite qu''un client a payé une partie de ce qu''il doit.',
 'Prèv sou papye yon kliyan peye yon pòsyon nan sa l dwe a.',
 ARRAY['company.name','company.phone','customer.name','date.today'],
 FALSE, 60,
 '[
   {"type":"heading","level":1,"text":{"fr":"Reçu de versement","ht":"Resi vèsman"}},
   {"type":"paragraph","text":{"fr":"{{company.name}} reconnaît avoir reçu de {{customer.name}} la somme indiquée ci-dessous.","ht":"{{company.name}} rekonèt li resevwa nan men {{customer.name}} sòm ki make anba a."}},
   {"type":"fields","items":[
     {"label":{"fr":"Montant reçu","ht":"Kòb yo resevwa"},"value":"______________________"},
     {"label":{"fr":"Mode de paiement","ht":"Fason yo peye"},"value":"______________________"},
     {"label":{"fr":"Reste à payer","ht":"Rès pou peye"},"value":"______________________"},
     {"label":{"fr":"Date","ht":"Dat"},"value":"{{date.today}}"}
   ]},
   {"type":"signature","parties":[
     {"fr":"Pour {{company.name}}","ht":"Pou {{company.name}}"}
   ]}
 ]'::jsonb),

-- ── 7. Procédure interne (SOP) ──────────────────────────────────────────────
(NULL, 'procedure_interne', 'operations',
 'Procédure interne', 'Pwosedi enteryè',
 'Comment une tâche se fait chez vous, étape par étape — pour que ça se passe pareil sans vous.',
 'Kijan yon travay fèt lakay ou, etap pa etap — pou l fèt menm jan an lè ou pa la.',
 ARRAY['company.name','date.today'],
 FALSE, 70,
 '[
   {"type":"heading","level":1,"text":{"fr":"Procédure interne","ht":"Pwosedi enteryè"}},
   {"type":"fields","items":[
     {"label":{"fr":"Entreprise","ht":"Antrepriz"},"value":"{{company.name}}"},
     {"label":{"fr":"Nom de la procédure","ht":"Non pwosedi a"},"value":"______________________"},
     {"label":{"fr":"Responsable","ht":"Responsab"},"value":"______________________"},
     {"label":{"fr":"Mise à jour le","ht":"Mete ajou jou"},"value":"{{date.today}}"}
   ]},
   {"type":"heading","level":2,"text":{"fr":"Pourquoi cette procédure existe","ht":"Poukisa pwosedi sa a la"}},
   {"type":"paragraph","text":{"fr":"______________________________________________","ht":"______________________________________________"}},
   {"type":"heading","level":2,"text":{"fr":"Les étapes","ht":"Etap yo"}},
   {"type":"list","ordered":true,"items":[
     {"fr":"______________________________________________","ht":"______________________________________________"},
     {"fr":"______________________________________________","ht":"______________________________________________"},
     {"fr":"______________________________________________","ht":"______________________________________________"}
   ]},
   {"type":"heading","level":2,"text":{"fr":"Ce qu''il ne faut jamais faire","ht":"Sa ou pa dwe janm fè"}},
   {"type":"list","items":[
     {"fr":"______________________________________________","ht":"______________________________________________"}
   ]}
 ]'::jsonb),

-- ── 8. Règlement intérieur ──────────────────────────────────────────────────
(NULL, 'reglement_interieur', 'hr',
 'Règlement intérieur', 'Règleman enteryè',
 'Les règles de la maison : horaires, absences, tenue, matériel. Affiché et signé.',
 'Règ kay la : orè, absans, jan pou abiye, materyèl. Afiche epi siyen.',
 ARRAY['company.name','company.address','date.today'],
 TRUE, 80,
 '[
   {"type":"heading","level":1,"text":{"fr":"Règlement intérieur","ht":"Règleman enteryè"}},
   {"type":"paragraph","text":{"fr":"Le présent règlement s''applique à toute personne travaillant pour {{company.name}}, à l''adresse {{company.address}}.","ht":"Règleman sa a aplike pou tout moun k ap travay pou {{company.name}}, nan adrès {{company.address}}."}},
   {"type":"heading","level":2,"text":{"fr":"1. Horaires et présence","ht":"1. Orè ak prezans"}},
   {"type":"list","items":[
     {"fr":"Heures d''ouverture : ______________________","ht":"Lè pou louvri : ______________________"},
     {"fr":"Toute absence est annoncée au plus tôt, et au plus tard : ______________________","ht":"Tout absans dwe anonse pi vit posib, epi pi ta : ______________________"}
   ]},
   {"type":"heading","level":2,"text":{"fr":"2. Caisse et marchandise","ht":"2. Kès ak machandiz"}},
   {"type":"list","items":[
     {"fr":"La caisse est comptée à l''ouverture et à la fermeture.","ht":"Yo konte kès la lè yo louvri e lè yo fèmen."},
     {"fr":"Toute sortie de marchandise est enregistrée dans ProfitPilot.","ht":"Tout machandiz ki soti dwe anrejistre nan ProfitPilot."}
   ]},
   {"type":"heading","level":2,"text":{"fr":"3. Respect et sécurité","ht":"3. Respè ak sekirite"}},
   {"type":"paragraph","text":{"fr":"Le respect entre collègues et envers les clients est attendu de tous. Tout incident est signalé au responsable le jour même.","ht":"Tout moun dwe respekte kòlèg yo ak kliyan yo. Tout ensidan dwe siyale bay responsab la menm jou a."}},
   {"type":"notice","text":{"fr":"Le contenu d''un règlement intérieur est encadré par la loi. Faites-le vérifier avant de l''afficher ou de le faire signer.","ht":"Lalwa ankadre sa yon règleman enteryè ka di. Fè yon pwofesyonèl verifye l anvan ou afiche l oswa fè moun siyen l."}},
   {"type":"fields","items":[
     {"label":{"fr":"En vigueur depuis le","ht":"An vigè depi"},"value":"{{date.today}}"}
   ]},
   {"type":"signature","parties":[
     {"fr":"Lu et approuvé — l''employé","ht":"Mwen li e mwen dakò — anplwaye a"}
   ]}
 ]'::jsonb)

ON CONFLICT DO NOTHING;


-- Le rattachement au catalogue de types, quand la clé correspond. Un modèle
-- sans type reste utilisable : le document créé sera simplement « Sans type »,
-- et le marchand le classera.
UPDATE document_templates t
   SET document_type_id = dt.id
  FROM document_types dt
 WHERE t.business_id IS NULL
   AND t.document_type_id IS NULL
   AND dt.business_id IS NULL
   AND dt.key = CASE t.key
                  WHEN 'contrat_travail'      THEN 'employment_agreement'
                  WHEN 'attestation_emploi'   THEN 'employee_document'
                  WHEN 'reconnaissance_dette' THEN 'contract'
                  WHEN 'contrat_fourniture'   THEN 'supplier_agreement'
                  WHEN 'devis'                THEN 'quote'
                  WHEN 'recu_versement'       THEN 'receipt'
                  WHEN 'procedure_interne'    THEN 'sop'
                  WHEN 'reglement_interieur'  THEN 'hr_policy'
                  ELSE NULL
                END;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. VÉRIFICATION
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'modèles du catalogue'        AS controle, count(*)::text AS valeur
FROM   document_templates WHERE business_id IS NULL
UNION ALL
SELECT 'modèles rattachés à un type', count(*)::text
FROM   document_templates WHERE business_id IS NULL AND document_type_id IS NOT NULL
UNION ALL
SELECT 'politiques document_templates', count(*)::text
FROM   pg_policies WHERE tablename = 'document_templates'
UNION ALL
SELECT 'documents.content_blocks', count(*)::text
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'documents' AND column_name = 'content_blocks'
UNION ALL
SELECT 'document_versions.content_blocks', count(*)::text
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'document_versions' AND column_name = 'content_blocks';
