-- ══════════════════════════════════════════════════════════════════════════════
-- COMMERCE — catalogue, sections de vitrine, rupture de stock
--
-- Phase 2 (suite) et phase 4 du plan. Trois blocs :
--
--   §1  Le catalogue gagne ce que la fiche produit du cahier des charges
--       demande : ancien prix, SKU, étiquettes, attributs, poids, et surtout
--       une VRAIE catégorie. `products.category` est du texte libre depuis le
--       début alors que `product_categories` existe : deux marchandises
--       identiques écrites « Cosmétique » et « cosmetiques » sont deux
--       catégories, et aucun filtre ne peut s'appuyer là-dessus (§20).
--
--   §2  `store_sections` : la page d'accueil devient une liste ordonnée de
--       sections activables, déplaçables et configurables (§6). Le gabarit
--       fournit l'ordre de départ ; le marchand le modifie sans toucher au
--       code.
--
--   §3  La rupture de stock cesse d'être une impasse : `allow_backorders`, et
--       « prévenez-moi quand c'est disponible » (§25).
--
-- Idempotente. Rejouable.
-- ══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- §1. LE CATALOGUE
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE products
  -- L'ancien prix barré. Nommé `compare_at_price` et non `old_price` : c'est ce
  -- à quoi on compare, pas ce qu'on facturait avant — la nuance compte le jour
  -- où une autorité demande de justifier une remise.
  ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS sku              TEXT,
  ADD COLUMN IF NOT EXISTS tags             TEXT[]  NOT NULL DEFAULT '{}',
  -- Les attributs qui rendent les filtres possibles : { "taille": "M",
  -- "couleur": "Rouge", "marque": "Nivea" }. Du JSONB plutôt qu'une table
  -- d'attributs : un marchand haïtien de quarante références n'a pas besoin
  -- d'un modèle EAV, et les facettes se dérivent très bien d'ici (§20).
  ADD COLUMN IF NOT EXISTS attributes       JSONB   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS weight_grams     INTEGER,
  -- §25 : vendre à découvert, quand le marchand se réapprovisionne vite.
  ADD COLUMN IF NOT EXISTS allow_backorders BOOLEAN NOT NULL DEFAULT FALSE,
  -- Mis en avant par le MARCHAND. À ne pas confondre avec « meilleure vente »,
  -- qui se calcule et ne se décrète pas (voir v_store_bestsellers plus bas).
  ADD COLUMN IF NOT EXISTS is_featured      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS category_id      UUID REFERENCES product_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id)
  WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_featured ON products (business_id)
  WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_products_attributes ON products USING GIN (attributes);

-- Un SKU ne vaut que s'il est unique dans l'entreprise. Index partiel : la
-- plupart des fiches n'en ont pas, et deux fiches sans SKU ne sont pas en
-- conflit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique
  ON products (business_id, lower(sku)) WHERE sku IS NOT NULL AND sku <> '';


-- ── 1.1 Du texte libre aux vraies catégories ────────────────────────────────
--
-- Chaque valeur distincte de `products.category` devient une ligne de
-- `product_categories` (si elle n'existe pas déjà, comparaison insensible à la
-- casse et aux espaces), puis les fiches sont rattachées.
--
-- `products.category` N'EST PAS supprimée. Une dizaine de lecteurs la lisent
-- encore, et un écran qui affiche « — » à la place d'une catégorie est une
-- régression visible par le marchand. Elle devient une copie dénormalisée,
-- tenue à jour par le déclencheur ci-dessous.

INSERT INTO product_categories (business_id, name)
SELECT DISTINCT p.business_id, btrim(p.category)
FROM products p
WHERE p.business_id IS NOT NULL
  AND p.category IS NOT NULL
  AND btrim(p.category) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM product_categories c
    WHERE c.business_id = p.business_id
      AND lower(btrim(c.name)) = lower(btrim(p.category))
      AND c.deleted_at IS NULL
  );

UPDATE products p
SET category_id = c.id
FROM product_categories c
WHERE p.category_id IS NULL
  AND p.business_id  = c.business_id
  AND c.deleted_at IS NULL
  AND p.category IS NOT NULL
  AND lower(btrim(p.category)) = lower(btrim(c.name));

/**
 * Garde `products.category` d'accord avec `products.category_id`.
 *
 * Le libellé suit l'identifiant, jamais l'inverse : c'est `category_id` qui
 * fait foi. Sans ce déclencheur, renommer une catégorie laisserait l'ancien
 * texte sur toutes les fiches, et la vitrine afficherait deux noms pour la
 * même chose.
 */
CREATE OR REPLACE FUNCTION fn_products_sync_category_label()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT c.name INTO NEW.category
    FROM product_categories c WHERE c.id = NEW.category_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_sync_category_label ON products;
CREATE TRIGGER trg_products_sync_category_label
  BEFORE INSERT OR UPDATE OF category_id ON products
  FOR EACH ROW EXECUTE FUNCTION fn_products_sync_category_label();

/** Renommer une catégorie propage son libellé sur les fiches rattachées. */
CREATE OR REPLACE FUNCTION fn_category_rename_propagates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE products SET category = NEW.name WHERE category_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_category_rename_propagates ON product_categories;
CREATE TRIGGER trg_category_rename_propagates
  AFTER UPDATE OF name ON product_categories
  FOR EACH ROW EXECUTE FUNCTION fn_category_rename_propagates();


-- ── 1.2 Les meilleures ventes, calculées ────────────────────────────────────
--
-- « Bestseller » est un badge de preuve sociale (§27). Il ne se coche pas dans
-- un formulaire : il se lit dans les ventes des 90 derniers jours. Un badge
-- « meilleure vente » posé à la main sur un produit qui ne se vend pas est
-- exactement le genre de chiffre inventé que ce produit s'interdit.

CREATE OR REPLACE VIEW v_store_bestsellers
WITH (security_invoker = true) AS
  SELECT
    si.business_id,
    si.product_id,
    SUM(si.quantity)::BIGINT AS units_sold,
    COUNT(DISTINCT si.sale_id)::BIGINT AS orders_count
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id AND s.deleted_at IS NULL
  WHERE s.sale_date >= CURRENT_DATE - INTERVAL '90 days'
    AND si.product_id IS NOT NULL
  GROUP BY si.business_id, si.product_id;

GRANT SELECT ON v_store_bestsellers TO authenticated, service_role;

-- « Souvent achetés ensemble » (§26). Deux produits sont liés s'ils sont
-- apparus sur la même facture. Compté sur un an, seuil laissé au lecteur.
CREATE OR REPLACE VIEW v_store_bought_together
WITH (security_invoker = true) AS
  SELECT
    a.business_id,
    a.product_id       AS product_id,
    b.product_id       AS partner_id,
    COUNT(*)::BIGINT   AS times_together
  FROM sale_items a
  JOIN sale_items b
    ON b.sale_id = a.sale_id
   AND b.product_id <> a.product_id
  JOIN sales s ON s.id = a.sale_id AND s.deleted_at IS NULL
  WHERE s.sale_date >= CURRENT_DATE - INTERVAL '365 days'
    AND a.product_id IS NOT NULL
    AND b.product_id IS NOT NULL
  GROUP BY a.business_id, a.product_id, b.product_id;

GRANT SELECT ON v_store_bought_together TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- §2. LES SECTIONS DE LA PAGE D'ACCUEIL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Une ligne par section et par entreprise. Le gabarit fournit l'ordre de
-- départ (`components/store/sections/presets.ts`) ; dès que le marchand touche
-- à quoi que ce soit, ses lignes font foi.
--
-- `section_key` est du texte, pas une énumération : ajouter une section ne doit
-- pas demander une migration. Le registre côté code ignore simplement une clé
-- qu'il ne connaît pas — une vitrine ne casse jamais parce qu'une section a été
-- retirée du produit.

CREATE TABLE IF NOT EXISTS store_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  section_key TEXT        NOT NULL,
  position    INTEGER     NOT NULL DEFAULT 0,
  is_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  config      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_store_sections_order
  ON store_sections (business_id, position);

DROP TRIGGER IF EXISTS trg_store_sections_updated_at ON store_sections;
CREATE TRIGGER trg_store_sections_updated_at
  BEFORE UPDATE ON store_sections
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE store_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_sections_member_all" ON store_sections;
CREATE POLICY "store_sections_member_all" ON store_sections
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = store_sections.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(store_sections.business_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = store_sections.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(store_sections.business_id)
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- §3. LA RUPTURE DE STOCK N'EST PLUS UNE IMPASSE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- « Prévenez-moi quand c'est disponible » (§25). Une adresse, un produit, et
-- une date d'envoi. Rien d'autre : ce n'est pas un compte client.

CREATE TABLE IF NOT EXISTS product_stock_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Une même adresse ne s'inscrit qu'une fois par produit tant qu'elle n'a pas
  -- été prévenue. Sans cette contrainte, un visiteur qui clique trois fois
  -- reçoit trois courriels.
  UNIQUE (product_id, email)
);

CREATE INDEX IF NOT EXISTS idx_stock_notifications_pending
  ON product_stock_notifications (product_id) WHERE notified_at IS NULL;

ALTER TABLE product_stock_notifications ENABLE ROW LEVEL SECURITY;

-- Lecture par les membres (pour voir la demande), écriture par la clé service
-- seule — l'inscription passe par une route serveur, pas par le navigateur.
DROP POLICY IF EXISTS "stock_notifications_member_read" ON product_stock_notifications;
CREATE POLICY "stock_notifications_member_read" ON product_stock_notifications
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = product_stock_notifications.business_id AND b.owner_id = auth.uid())
    OR public.is_business_member(product_stock_notifications.business_id)
  );
