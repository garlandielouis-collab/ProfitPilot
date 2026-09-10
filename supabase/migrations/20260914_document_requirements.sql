-- ─────────────────────────────────────────────────────────────────────────────
-- Document Center — Phase 3 : le référentiel des documents attendus
--
--   `document_requirements`  §51, §52 — ce qu'un commerce devrait avoir
--
-- Cette table est ce qui empêche le score de santé documentaire d'être
-- arbitraire. Sans elle, « il vous manque des documents » serait une phrase
-- sans référence : manquants par rapport à QUOI ?
--
-- ── La règle du §51, écrite dans la contrainte ──────────────────────────────
--
-- Le §51 et le §83 interdisent d'annoncer une obligation légale sans source.
-- Ici, cette interdiction n'est pas une consigne de code : c'est un `CHECK`.
-- Une ligne ne peut porter `commonly_required` que si elle porte aussi une
-- `source_url`. Sans source, la valeur retombe forcément sur `recommended`, et
-- l'application ne peut donc pas dire « obligatoire » là où personne n'a
-- vérifié.
--
-- Aucune valeur `legally_required` n'existe dans cette contrainte. Le jour où
-- un juriste aura vérifié le corpus haïtien, elle s'ajoutera par migration,
-- avec les sources — pas avant.
--
-- ── Ce que le catalogue livré contient, et ce qu'il ne contient pas ─────────
--
-- Douze lignes universelles, toutes en `recommended`, dont la justification
-- parle de la CONDUITE DU COMMERCE et jamais du droit : « sans ce papier, la
-- banque refuse le dossier », pas « la loi l'exige ». C'est vrai partout, et
-- vérifiable par n'importe qui.
--
-- Le référentiel haïtien sourcé — patente, NIF, DGI, ONA, OFATMA — est un
-- travail de DONNÉES, pas de code : des lignes à insérer avec leur
-- `source_url` et leur `source_verified_at` une fois la vérification faite.
-- La table les attend ; l'application les affichera au bon niveau dès qu'elles
-- existeront, sans rien changer au code.
--
-- ── PRÉREQUIS ───────────────────────────────────────────────────────────────
-- 20260911_document_center_foundation.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.document_types') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'PRÉREQUIS MANQUANT — la table document_types n''existe pas.',
      HINT    = 'Appliquez 20260911_document_center_foundation.sql avant ce fichier.';
  END IF;
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. `document_requirements`
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_requirements (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = référentiel livré avec le produit. Sinon : exigence ajoutée par une
  -- entreprise pour elle-même (« notre bailleur veut une attestation »).
  business_id  UUID        REFERENCES businesses(id) ON DELETE CASCADE,

  -- NULL = vrai partout. 'HT', 'DO', 'US'… quand la ligne est propre à un pays.
  country_code TEXT,
  -- NULL = toutes industries. 'retail', 'restaurant', 'services'…
  industry     TEXT,

  document_type_id UUID    NOT NULL REFERENCES document_types(id) ON DELETE CASCADE,

  necessity    TEXT        NOT NULL DEFAULT 'recommended'
                 CHECK (necessity IN ('recommended', 'commonly_required', 'optional')),

  -- POURQUOI ce document compte, en français et en créole. Affiché tel quel :
  -- une exigence qu'on n'explique pas est une exigence qu'on ignore.
  rationale    JSONB       NOT NULL DEFAULT '{}'::jsonb,

  source_url   TEXT,
  source_verified_at DATE,

  -- Tous les combien ce document se refait. Sert à la « fraîcheur » du score
  -- (§64) : une liste de prix de trois ans n'est pas expirée, elle est
  -- périmée — et ce sont deux états différents.
  renewal_months INTEGER   CHECK (renewal_months IS NULL OR renewal_months > 0),

  sort_order   INTEGER     NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Le §51, en dur. Cette contrainte est le cœur de la table : elle rend
  -- IMPOSSIBLE d'affirmer qu'un document est couramment exigé sans dire par
  -- qui. Une consigne se contourne, un CHECK non.
  CONSTRAINT document_requirements_sourced
    CHECK (necessity <> 'commonly_required' OR source_url IS NOT NULL)
);

-- Une exigence par type, par pays, par industrie et par entreprise. Sans cet
-- index, le catalogue se doublerait à chaque réexécution de la migration.
CREATE UNIQUE INDEX IF NOT EXISTS document_requirements_global_uq
  ON document_requirements (document_type_id, COALESCE(country_code, ''), COALESCE(industry, ''))
  WHERE business_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_requirements_lookup
  ON document_requirements (country_code, industry) WHERE is_active;

COMMENT ON TABLE document_requirements IS
  'Ce qu''un commerce devrait avoir (§51, §52). `commonly_required` exige une source vérifiée — la contrainte le garantit.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. POLITIQUES
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Le référentiel global est public pour tout utilisateur authentifié : il ne
-- contient aucune donnée d'entreprise, seulement des recommandations. Les
-- exigences propres à une entreprise ne se lisent que par ses membres, et ne
-- s'écrivent que par ceux qui administrent.

ALTER TABLE document_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_requirements_select" ON public.document_requirements;
DROP POLICY IF EXISTS "document_requirements_write"  ON public.document_requirements;

CREATE POLICY "document_requirements_select" ON public.document_requirements
  FOR SELECT USING (business_id IS NULL OR is_business_member(business_id));

CREATE POLICY "document_requirements_write" ON public.document_requirements
  FOR ALL
  USING      (business_id IS NOT NULL AND fn_has_role(business_id, 'owner', 'admin'))
  WITH CHECK (business_id IS NOT NULL AND fn_has_role(business_id, 'owner', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON document_requirements TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. LE RÉFÉRENTIEL UNIVERSEL
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Douze lignes, toutes `recommended`, toutes sans source — et c'est cohérent :
-- aucune ne prétend à une obligation. Chaque justification répond à « qu'est-ce
-- que ça me coûte de ne pas l'avoir ? », dans les termes du commerce.

INSERT INTO document_requirements
  (business_id, country_code, industry, document_type_id, necessity, renewal_months, sort_order, rationale)
SELECT
  NULL, NULL, NULL, dt.id, 'recommended', v.renewal_months, v.sort_order,
  jsonb_build_object('fr', v.fr, 'ht', v.ht)
FROM (VALUES
  ('business_license', 12, 10,
   'L''autorisation d''exercer. C''est le premier papier qu''on demande lors d''un contrôle, et souvent le seul qui manque.',
   'Otorizasyon pou fè komès. Se premye papye yo mande lè gen kontwòl, epi souvan se li menm ki manke.'),

  ('company_registration', NULL, 20,
   'La preuve que le commerce existe officiellement. Sans elle, pas de compte bancaire professionnel ni de contrat sérieux.',
   'Prèv komès la egziste ofisyèlman. San li, pa gen kont labank pwofesyonèl ni kontra serye.'),

  ('tax_document', 12, 30,
   'Votre situation fiscale, par écrit. Une banque, un bailleur ou un gros client la demandent avant de s''engager.',
   'Sitiyasyon fiskal ou, sou papye. Yon bank, yon mèt kay oswa yon gwo kliyan mande l anvan yo angaje yo.'),

  ('id_document', NULL, 40,
   'La pièce d''identité du propriétaire. Elle est exigée dans presque toutes les démarches, et se cherche toujours au mauvais moment.',
   'Pyès idantite mèt komès la. Yo mande l nan prèske tout demach, epi se toujou nan move moman ou chèche l.'),

  ('insurance', 12, 50,
   'Le contrat d''assurance du local ou du stock. En cas d''incendie ou de vol, c''est ce document — et sa date — qui décide de tout.',
   'Kontra asirans lokal la oswa stòk la. Si gen dife oswa vòl, se dokiman sa a — ak dat li — ki deside tout bagay.'),

  ('contract', NULL, 60,
   'Le bail du local, ou l''accord qui vous permet d''occuper les lieux. Un désaccord verbal avec le propriétaire ne se règle pas.',
   'Kontra kay la, oswa akò ki pèmèt ou ret nan kote a. Yon dezakò ki fèt sèlman nan pale pa ka regle.'),

  ('employment_agreement', NULL, 70,
   'Un contrat par employé. Il protège les deux côtés le jour où quelqu''un part fâché.',
   'Yon kontra pou chak anplwaye. Li pwoteje toude bò lè yon moun ale fache.'),

  ('supplier_agreement', NULL, 80,
   'Ce que votre fournisseur s''engage à livrer, à quel prix. C''est ce qui rend une réclamation possible.',
   'Sa founisè ou a angaje l pou l livre, a ki pri. Se sa ki fè yon reklamasyon posib.'),

  ('price_list', 6, 90,
   'Vos prix par écrit, à jour. Sans liste, chaque employé invente son prix, et la marge disparaît sans qu''on sache où.',
   'Pri ou yo sou papye, ajou. San yon lis, chak anplwaye envante pri pa l, epi benefis la disparèt san ou pa konnen kote.'),

  ('sop', 12, 100,
   'Comment le travail se fait chez vous, écrit une fois. C''est ce qui permet au commerce de tourner le jour où vous n''êtes pas là.',
   'Kijan travay la fèt lakay ou, ekri yon fwa. Se sa ki fè komès la mache jou ou pa la.'),

  ('inventory_document', 3, 110,
   'Le dernier inventaire compté à la main. Il est la seule façon de savoir si le stock affiché correspond au stock réel.',
   'Dènye envantè ou konte alamen. Se sèl fason pou konnen si stòk ki afiche a se stòk reyèl la.'),

  ('income_statement', 12, 120,
   'Le compte de résultat de l''année. C''est le document que demande toute banque, et ProfitPilot sait le produire depuis vos ventes.',
   'Kont rezilta ane a. Se dokiman tout bank mande, epi ProfitPilot konn fè l apati vant ou yo.')
) AS v(type_key, renewal_months, sort_order, fr, ht)
JOIN document_types dt ON dt.key = v.type_key AND dt.business_id IS NULL
ON CONFLICT DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. VÉRIFICATION
-- ═════════════════════════════════════════════════════════════════════════════

SELECT 'exigences du référentiel' AS controle, count(*)::text AS valeur
FROM   document_requirements WHERE business_id IS NULL
UNION ALL
SELECT 'dont annoncées comme couramment exigées (doivent porter une source)', count(*)::text
FROM   document_requirements WHERE necessity = 'commonly_required'
UNION ALL
SELECT 'politiques document_requirements', count(*)::text
FROM   pg_policies WHERE tablename = 'document_requirements';
