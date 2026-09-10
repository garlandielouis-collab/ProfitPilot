-- ══════════════════════════════════════════════════════════════════════════════
-- COMMERCE — la fiche produit écrite, le catalogue analysé, les lots
--
-- Phase 6 du plan. §16, §17, §18 du cahier des charges.
--
--   §1  La fiche produit gagne les champs qu'une VRAIE fiche e-commerce a :
--       une accroche, des points forts, un titre et une description SEO. Ils
--       existent avec ou sans IA — l'IA les remplit, elle ne les invente pas
--       comme colonne.
--
--   §2  `product_bundles` — le lot. L'IA en propose, le marchand décide, et ce
--       qui est accepté devient un objet du catalogue, pas une suggestion
--       affichée dans un coin.
--
--   §3  `ai_credit_costs` gagne les actions de la phase.
--
-- Idempotente. Rejouable.
-- ══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- §1. LA FICHE PRODUIT A UN TEXTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `store_description` (20260903) est la description longue. Ce qui manquait,
-- c'est tout ce qui se lit AVANT elle : l'accroche qu'on voit sous le nom, les
-- trois points forts qu'on lit sans faire défiler, et les deux lignes que
-- Google affiche.
--
-- Quatre colonnes plutôt qu'un JSONB `copy` : elles sont lues par la vitrine à
-- chaque page produit, elles servent à des balises `<meta>`, et une colonne
-- qu'on interroge se nomme.

ALTER TABLE products
  -- L'accroche. Une phrase, sous le nom, au-dessus du prix.
  ADD COLUMN IF NOT EXISTS store_short_description TEXT,
  -- Les points forts, tels qu'ils s'affichent : trois à cinq puces courtes.
  -- Un tableau et non du texte à puces — la vitrine les met en forme, elle ne
  -- devine pas où couper.
  ADD COLUMN IF NOT EXISTS store_highlights        TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seo_title               TEXT,
  ADD COLUMN IF NOT EXISTS seo_description         TEXT,
  -- Quand l'IA a écrit pour la dernière fois. Sert au Store Health Score
  -- (§44) et à ne pas reproposer sans arrêt ce qui vient d'être fait.
  ADD COLUMN IF NOT EXISTS ai_copy_at              TIMESTAMPTZ;

-- « Quels produits n'ont pas de texte ? » est la question du merchandising et
-- du score de santé. Index partiel : c'est la minorité qu'on cherche.
CREATE INDEX IF NOT EXISTS idx_products_missing_copy
  ON products (business_id)
  WHERE store_description IS NULL OR store_description = '';


-- ═══════════════════════════════════════════════════════════════════════════
-- §2. LES LOTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- « Produit A + Produit B + Produit C → Starter Pack, $45 → $39. Le
-- propriétaire décide s'il accepte. » (§18)
--
-- Deux décisions portées par le schéma :
--
--   `price` est le prix DU LOT, en clair, décidé par le marchand. Pas un
--   pourcentage de remise appliqué à la volée : le jour où le prix d'un des
--   produits bouge, un lot défini par pourcentage change de prix tout seul,
--   dans le dos du marchand, sur une vitrine publique.
--
--   `source` distingue ce que l'IA a proposé de ce que le marchand a composé.
--   Un lot proposé par l'IA et accepté reste marqué : c'est ce qui permet de
--   dire un jour « vos lots IA rapportent X », et c'est honnête.

CREATE TABLE IF NOT EXISTS product_bundles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  -- Le prix de vente du lot. NUMERIC comme partout ailleurs dans ce schéma :
  -- de l'argent ne se stocke pas en flottant.
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  is_active   BOOLEAN     NOT NULL DEFAULT FALSE,
  source      TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'ai')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_bundles_biz
  ON product_bundles (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_bundles_active
  ON product_bundles (business_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS product_bundle_items (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id  UUID    NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
  product_id UUID    NOT NULL REFERENCES products(id)        ON DELETE CASCADE,
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- Un produit ne figure qu'une fois dans un lot : deux exemplaires se disent
  -- par `quantity`, pas par deux lignes.
  UNIQUE (bundle_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle  ON product_bundle_items (bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_product ON product_bundle_items (product_id);

DROP TRIGGER IF EXISTS trg_product_bundles_updated_at ON product_bundles;
CREATE TRIGGER trg_product_bundles_updated_at
  BEFORE UPDATE ON product_bundles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE product_bundles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_bundle_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bundles_member_all" ON product_bundles;
CREATE POLICY "bundles_member_all" ON product_bundles
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = product_bundles.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(product_bundles.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = product_bundles.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(product_bundles.business_id)
  );

-- Les lignes suivent le lot : il n'y a pas de `business_id` sur
-- `product_bundle_items`, et c'est volontaire — une colonne de cadrage
-- dupliquée est une colonne qui finit par diverger. Le cloisonnement passe par
-- le lot parent.
DROP POLICY IF EXISTS "bundle_items_member_all" ON product_bundle_items;
CREATE POLICY "bundle_items_member_all" ON product_bundle_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM product_bundles pb
       WHERE pb.id = product_bundle_items.bundle_id
         AND (
           EXISTS (SELECT 1 FROM businesses b
                    WHERE b.id = pb.business_id AND b.owner_id = auth.uid())
           OR public.is_business_member(pb.business_id)
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM product_bundles pb
       WHERE pb.id = product_bundle_items.bundle_id
         AND (
           EXISTS (SELECT 1 FROM businesses b
                    WHERE b.id = pb.business_id AND b.owner_id = auth.uid())
           OR public.is_business_member(pb.business_id)
         )
    )
  );

-- La vitrine lit les lots actifs par la clé service, comme le reste du
-- catalogue public : aucune politique `anon` n'est posée ici.
GRANT SELECT, INSERT, UPDATE, DELETE ON product_bundles      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_bundle_items TO authenticated, service_role;

/**
 * Le prix du lot acheté pièce par pièce.
 *
 * Sert à afficher « 45 $ → 39 $ » sans que le navigateur additionne des prix
 * qu'il aurait reçus : l'économie annoncée sur une vitrine est un argument de
 * vente, et un argument de vente se calcule en base.
 */
CREATE OR REPLACE VIEW v_product_bundle_totals
WITH (security_invoker = true) AS
  SELECT
    pb.id                                              AS bundle_id,
    pb.business_id,
    COALESCE(SUM(p.sale_price * bi.quantity), 0)::NUMERIC(12,2) AS regular_total,
    COUNT(bi.id)::INTEGER                              AS item_count,
    -- Un lot dont une pièce est épuisée ne se vend pas : la vitrine a besoin
    -- de le savoir sans relire chaque produit.
    BOOL_AND(COALESCE(p.stock_quantity, 0) > 0 OR COALESCE(p.allow_backorders, FALSE))
                                                       AS in_stock
  FROM product_bundles pb
  LEFT JOIN product_bundle_items bi ON bi.bundle_id = pb.id
  LEFT JOIN products p             ON p.id = bi.product_id
  GROUP BY pb.id, pb.business_id;

GRANT SELECT ON v_product_bundle_totals TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- §3. CE QUE COÛTENT LES NOUVELLES ACTIONS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La grille vit en base (20260906) précisément pour qu'un tarif se change sans
-- redéploiement. Les quatre actions de la phase y étaient déjà décrites ; on
-- les réaffirme pour qu'une base montée directement à cette migration les ait,
-- et on nomme celle qui manquait.
--
-- `product_description` couvre la fiche entière — accroche, description, points
-- forts. C'est un seul aller-retour chez le fournisseur, donc un seul crédit ;
-- le SEO se facture à part parce qu'il se demande à part.

INSERT INTO ai_credit_costs (action, credits, label) VALUES
  ('product_description', 1, 'Rédaction de fiche produit'),
  ('product_seo',         1, 'Optimisation SEO'),
  ('merchandising',       2, 'Analyse du catalogue'),
  ('bundle',              2, 'Proposition de lot')
ON CONFLICT (action) DO UPDATE
  SET credits = EXCLUDED.credits, label = EXCLUDED.label;
