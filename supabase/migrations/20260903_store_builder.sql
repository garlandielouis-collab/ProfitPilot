-- ══════════════════════════════════════════════════════════════════════════════
-- STORE BUILDER — moteur de templates, domaines, publication produits, Studio IA
--
-- Cette migration ÉTEND l'existant, elle ne le remplace pas.
--
--   Pas de table `stores`. Le mot est déjà pris : dans ProfitPilot une
--   « boutique » EST une ligne de `businesses` (cf. app/actions/stores.ts, le
--   sélecteur d'entreprise). La vitrine en ligne d'une entreprise vit dans
--   `store_settings`, une ligne par `business_id`. Créer une table `stores`
--   portée par `user_id` casserait le multi-entreprise : un compte qui possède
--   deux commerces n'aurait plus qu'une vitrine, et le premier `maybeSingle()`
--   lèverait au lieu de choisir.
--
--   Tout ce que la spécification demandait sur `stores` — template_id,
--   theme_config, custom_domain — s'ajoute donc en colonnes de
--   `store_settings`.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS partout, aucun DROP TABLE.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. store_settings : gabarit, thème, domaine ──────────────────────────────

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS template_id        TEXT   NOT NULL DEFAULT 'modern',
  ADD COLUMN IF NOT EXISTS theme_config       JSONB  NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_domain      TEXT,
  ADD COLUMN IF NOT EXISTS domain_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_number    TEXT,
  ADD COLUMN IF NOT EXISTS published_at       TIMESTAMPTZ;

-- Le domaine personnalisé est la clé de résolution du middleware : il doit être
-- unique, en minuscules, et indexé — sinon deux marchands peuvent revendiquer
-- le même hôte et la vitrine servie dépend de l'ordre de lecture.
-- Index partiel : les vitrines sans domaine (la majorité) n'entrent pas dans
-- l'unicité.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_settings_custom_domain
  ON store_settings (lower(custom_domain))
  WHERE custom_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_settings_slug_active
  ON store_settings (slug) WHERE is_active = TRUE;

-- Un slug ne peut pas usurper une route de l'application. Sans cette
-- contrainte, un marchand qui choisit le slug « auth » capture
-- auth.profitpilot.app et voit passer les connexions.
-- NOT VALID : les vitrines déjà créées ne sont pas invalidées rétroactivement,
-- la règle s'applique aux écritures futures.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_slug_reserved_chk'
  ) THEN
    ALTER TABLE store_settings ADD CONSTRAINT store_settings_slug_reserved_chk
      CHECK (
        slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
        AND slug NOT IN (
          'www','app','api','admin','auth','dashboard','store','boutique','checkout',
          'blog','docs','help','support','mail','ftp','cdn','assets','static','staging',
          'dev','test','preview','vercel','profitpilot','pricing','settings','onboarding'
        )
      )
      NOT VALID;
  END IF;
END $$;

-- ── 2. products : publication vitrine et visuels ─────────────────────────────
--
-- `products` porte À LA FOIS user_id et business_id dans ce schéma, et les
-- lecteurs de la vitrine (app/actions/store-public.ts) filtrent sur user_id
-- résolu depuis businesses.owner_id. Ces colonnes ne changent pas ce cadrage :
-- elles s'y ajoutent.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_published_to_store BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS store_description     TEXT,
  ADD COLUMN IF NOT EXISTS enhanced_image_url    TEXT,
  ADD COLUMN IF NOT EXISTS gallery_urls          TEXT[] NOT NULL DEFAULT '{}';

-- « Les produits publiés de ce marchand » est la requête chaude de la vitrine.
CREATE INDEX IF NOT EXISTS idx_products_published_store
  ON products (user_id) WHERE is_published_to_store = TRUE;

-- ── 3. store_templates : le catalogue des gabarits ───────────────────────────
--
-- Table de référence : lisible par tous, écrite par personne depuis le client.
-- Elle existe pour qu'un gabarit puisse être retiré ou décrit autrement sans
-- redéployer le bundle.

CREATE TABLE IF NOT EXISTS store_templates (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  tagline       TEXT,
  description   TEXT,
  preview_image TEXT,
  best_for      TEXT[]      NOT NULL DEFAULT '{}',
  config_schema JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO store_templates (id, name, tagline, description, best_for, sort_order) VALUES
  ('luxe',   'Luxe & Minimaliste',
   'Grands visuels, typographie serif, rien de superflu',
   'Pour les produits qu''on achète avec les yeux : cosmétiques, parfums, bijoux, mode. Peu de produits par écran, beaucoup d''air, une seule action visible à la fois.',
   ARRAY['Cosmétiques','Parfums','Bijoux','Mode'], 1),
  ('modern', 'Moderne & Conversion',
   'Preuve sociale, réassurance, panier collant',
   'Le gabarit par défaut. Badges de réassurance, compte à rebours optionnel, bouton d''ajout au panier toujours visible sur mobile.',
   ARRAY['Électronique','Accessoires','Maison','Général'], 2),
  ('flash',  'Catalogue Flash',
   'Trafic réseaux sociaux, commande en deux gestes',
   'Pour vendre depuis TikTok, Instagram ou WhatsApp. Grille compacte, chargement minimal, commande WhatsApp sans formulaire.',
   ARRAY['Revente','Prêt-à-porter','Alimentation','Vente flash'], 3)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  tagline     = EXCLUDED.tagline,
  description = EXCLUDED.description,
  best_for    = EXCLUDED.best_for,
  sort_order  = EXCLUDED.sort_order;

ALTER TABLE store_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_public_read" ON store_templates;
CREATE POLICY "templates_public_read" ON store_templates
  FOR SELECT USING (is_active = TRUE);
-- Aucune politique d'écriture : le catalogue se modifie par migration.

-- ── 4. ai_asset_jobs : les traitements du Studio IA ──────────────────────────

CREATE TABLE IF NOT EXISTS ai_asset_jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id          UUID        REFERENCES products(id) ON DELETE SET NULL,
  original_image_url  TEXT        NOT NULL,
  processed_image_url TEXT,
  prompt_preset       TEXT        NOT NULL DEFAULT 'studio_minimal',
  enhancement_type    TEXT        NOT NULL DEFAULT 'full'
                                  CHECK (enhancement_type IN ('full','background_only','upscale_only')),
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','processing','completed','failed')),
  provider            TEXT,
  provider_job_id     TEXT,
  -- Secret partagé avec le webhook. Le fournisseur nous rappelle sur une URL
  -- publique : sans ce jeton, n'importe qui pourrait POSTer une image arbitraire
  -- et la voir remplacer la photo produit d'un marchand.
  callback_token      TEXT        NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  error_message       TEXT,
  applied_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_business ON ai_asset_jobs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_product  ON ai_asset_jobs (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_jobs_pending  ON ai_asset_jobs (status) WHERE status IN ('pending','processing');
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_jobs_provider_job
  ON ai_asset_jobs (provider, provider_job_id) WHERE provider_job_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ai_asset_jobs_updated_at ON ai_asset_jobs;
CREATE TRIGGER trg_ai_asset_jobs_updated_at BEFORE UPDATE ON ai_asset_jobs
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE ai_asset_jobs ENABLE ROW LEVEL SECURITY;

-- Membres actifs, pas seulement le propriétaire : un employé qui tient le
-- catalogue doit pouvoir retoucher une photo.
DROP POLICY IF EXISTS "ai_jobs_member_all" ON ai_asset_jobs;
CREATE POLICY "ai_jobs_member_all" ON ai_asset_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = ai_asset_jobs.business_id
        AND bm.user_id     = auth.uid()
        AND bm.is_active   = TRUE
        AND bm.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = ai_asset_jobs.business_id AND b.owner_id = auth.uid()
    )
  );

-- Le callback_token ne doit jamais partir vers le navigateur. La vue expose
-- tout sauf lui ; l'éditeur lit la vue, le webhook lit la table via la clé
-- service.
CREATE OR REPLACE VIEW v_ai_asset_jobs
WITH (security_invoker = true) AS
  SELECT id, business_id, user_id, product_id, original_image_url, processed_image_url,
         prompt_preset, enhancement_type, status, provider, error_message,
         applied_at, created_at, updated_at
  FROM ai_asset_jobs;

GRANT SELECT ON v_ai_asset_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_asset_jobs TO authenticated;
GRANT SELECT ON store_templates TO anon, authenticated;

-- ── 5. Bucket de stockage des visuels de vitrine ─────────────────────────────
--
-- Public en lecture : ces images s'affichent sur une vitrine ouverte à tous.
-- Écriture réservée aux membres, dans un dossier préfixé par l'identifiant de
-- l'entreprise : `<business_id>/<fichier>`.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-assets', 'store-assets', TRUE, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public             = TRUE,
  file_size_limit    = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/avif'];

DO $$
BEGIN
  DROP POLICY IF EXISTS "store_assets_public_read"  ON storage.objects;
  DROP POLICY IF EXISTS "store_assets_member_write" ON storage.objects;

  CREATE POLICY "store_assets_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'store-assets');

  CREATE POLICY "store_assets_member_write" ON storage.objects
    FOR ALL TO authenticated
    USING (
      bucket_id = 'store-assets'
      AND EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.user_id   = auth.uid()
          AND bm.is_active = TRUE
          AND bm.business_id::text = (storage.foldername(name))[1]
      )
    )
    WITH CHECK (
      bucket_id = 'store-assets'
      AND EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.user_id   = auth.uid()
          AND bm.is_active = TRUE
          AND bm.business_id::text = (storage.foldername(name))[1]
      )
    );
EXCEPTION WHEN insufficient_privilege THEN
  -- Sur certains projets hébergés, `storage.objects` n'appartient pas au rôle
  -- qui exécute la migration. Les politiques se posent alors depuis
  -- Supabase → Storage → store-assets → Policies.
  RAISE NOTICE 'Politiques storage non appliquées (privilèges insuffisants) — à poser depuis le dashboard Supabase.';
END $$;
