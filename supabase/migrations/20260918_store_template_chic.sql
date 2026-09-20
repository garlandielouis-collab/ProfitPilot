-- ─────────────────────────────────────────────────────────────────────────────
-- « Style Chic » dans le catalogue des gabarits
--
-- Le registre (components/store/templates/registry.ts) fait foi : aucune ligne
-- du code ne lit `store_templates`, et une vitrine peut porter `chic` sans
-- cette migration. Elle tient le miroir à jour, pour qu'une requête sur la
-- table dise la même chose que l'éditeur.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO store_templates
  (id, name, tagline, family, best_for, preview_image, is_active, sort_order)
VALUES
  ('chic', 'Style Chic', 'Vert bouteille et or : la boutique de mode qui reçoit', 'marque',
   ARRAY['Prêt-à-porter','Accessoires','Bijoux','Sacs','Chaussures'],
   '/gabarits/chic.webp', TRUE, 15)
ON CONFLICT (id) DO UPDATE SET
  name          = EXCLUDED.name,
  tagline       = EXCLUDED.tagline,
  family        = EXCLUDED.family,
  best_for      = EXCLUDED.best_for,
  preview_image = EXCLUDED.preview_image,
  is_active     = EXCLUDED.is_active,
  sort_order    = EXCLUDED.sort_order;

-- Les rayons suivent : ils reculent d'un rang.
UPDATE store_templates SET sort_order = sort_order + 1
 WHERE id IN ('retail', 'fashion', 'beauty', 'tech', 'food');
