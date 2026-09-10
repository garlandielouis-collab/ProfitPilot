-- ─────────────────────────────────────────────────────────────────────────────
-- Le catalogue des gabarits, remis en accord avec le produit
--
-- FICHIER GÉNÉRÉ — ne pas modifier à la main.
--   node scripts/gabarits-catalogue.js supabase/migrations/<ce fichier>
--
-- ── Ce qui n'allait pas ─────────────────────────────────────────────────────
--
-- `store_templates` a été semée en septembre avec trois gabarits : luxe,
-- modern, flash. Ce sont exactement les trois que le produit ne propose PLUS à
-- la création. La table publique — `GRANT SELECT ... TO anon` — annonçait donc
-- trois gabarits retirés comme seuls gabarits actifs, et ignorait les
-- 19 réellement offerts.
--
-- ── Où vit la vérité ────────────────────────────────────────────────────────
--
-- Dans `components/store/templates/registry.ts`, et nulle part ailleurs :
-- c'est ce fichier que lisent l'éditeur (`/boutique/builder`), l'aperçu
-- (`/apercu/[template]`) et la vitrine. Aucune ligne de code ne lit
-- `store_templates` aujourd'hui.
--
-- Cette table reste néanmoins la référence PUBLIQUE du catalogue. Une table de
-- référence qui contredit le produit est pire qu'une table absente : le jour
-- où quelque chose la lira — un site vitrine, un export, un tableau de bord
-- d'administration — elle donnera une réponse fausse sans prévenir. On la
-- remet donc en accord, et on note ici la règle : **le registre change, une
-- migration suit.** L'outil ci-dessus la regénère en une commande.
--
-- ── Ce que la migration fait ────────────────────────────────────────────────
--
--   1. Ajoute `family`, le groupe sous lequel l'éditeur range le gabarit.
--   2. Insère les 22 gabarits du registre (19 proposés, 3 historiques).
--   3. Passe les 3 historiques à `is_active = FALSE` — sans les supprimer :
--      des vitrines en production portent leur identifiant, et `template_id`
--      est du texte libre sans clé étrangère. Les retirer de la table ne
--      casserait rien aujourd'hui, mais effacerait la trace de ce que ces
--      boutiques-là portent.
--   4. Ne touche pas à `description` : c'est une colonne héritée que le
--      registre ne remplit plus (il porte `tagline` et `highlights`). Les
--      trois lignes historiques gardent la prose qu'elles avaient.
--
-- 22 des 22 gabarits ont une maquette dans `preview_image`.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE store_templates
  ADD COLUMN IF NOT EXISTS family TEXT NOT NULL DEFAULT 'rayon';

COMMENT ON COLUMN store_templates.family IS
  'metier | marque | rayon | historique — le groupe sous lequel l''éditeur range le gabarit.';

INSERT INTO store_templates
  (id, name, tagline, family, best_for, preview_image, is_active, sort_order)
VALUES
  ('proximite', 'Boutique de proximité', 'Épuré et rapide, pensé pour le téléphone avant tout', 'metier',
   ARRAY['Prêt-à-porter','Cosmétiques','Chaussures','Commerce général'],
   '/gabarits/proximite.webp', TRUE, 1),
  ('social', 'Vendeur social', 'Pour le trafic Instagram, TikTok et WhatsApp', 'metier',
   ARRAY['Nouveautés','Gadgets','Cosmétiques','Revente'],
   '/gabarits/social.webp', TRUE, 2),
  ('artisan', 'Créateur / Artisan', 'Typographie éditoriale, matière et savoir-faire', 'metier',
   ARRAY['Bijoux','Décoration','Objets faits main','Produits locaux'],
   '/gabarits/artisan.webp', TRUE, 3),
  ('services', 'Prestataire de services', 'La conversion n''est pas un panier, c''est un rendez-vous', 'metier',
   ARRAY['Coaching','Consulting','Formation','Prestations techniques'],
   '/gabarits/services.webp', TRUE, 4),
  ('agri', 'Élevage & Bétail', 'Disponibilité, prix à l''unité, contact direct', 'metier',
   ARRAY['Volailles','Porcins','Bovins','Caprins','Aliments'],
   '/gabarits/agri.webp', TRUE, 5),
  ('traiteur', 'Traiteur & Pâtissier', 'La photographie vend, la commande prend une date', 'metier',
   ARRAY['Plats cuisinés','Pâtisserie','Buffets','Événements'],
   '/gabarits/traiteur.webp', TRUE, 6),
  ('wellness', 'Compléments & Bien-être', 'Une promesse, une preuve, un flacon qui respire', 'marque',
   ARRAY['Compléments','Vitamines','Nutrition','Produits de santé'],
   '/gabarits/wellness.webp', TRUE, 7),
  ('skincare', 'Soin & Skincare', 'La peau en grand, l''ingrédient en petit', 'marque',
   ARRAY['Soins visage','Soins corps','Cheveux','Cosmétique naturelle'],
   '/gabarits/skincare.webp', TRUE, 8),
  ('animalerie', 'Animalerie', 'La réassurance avant la bannière : on achète pour un autre', 'marque',
   ARRAY['Alimentation animale','Accessoires','Soins vétérinaires','Hygiène'],
   '/gabarits/animalerie.webp', TRUE, 9),
  ('magazine', 'Mode Éditoriale', 'La campagne plein écran, la grille dense juste dessous', 'marque',
   ARRAY['Prêt-à-porter','Sacs','Lunettes','Accessoires de mode'],
   '/gabarits/magazine.webp', TRUE, 10),
  ('sport', 'Sport & Performance', 'Page noire, titres en capitales, une seule chose qui brille', 'marque',
   ARRAY['Nutrition sportive','Équipement','Programmes','Salle de sport'],
   '/gabarits/sport.webp', TRUE, 11),
  ('maker', 'Fait main & Récit', 'L''histoire au deuxième écran, les objets ensuite', 'marque',
   ARRAY['Coopératives','Commerce équitable','Vannerie','Produits du terroir'],
   '/gabarits/maker.webp', TRUE, 12),
  ('naturel', 'Clean & Naturel', 'Vos chiffres sous la bannière, à la place des avis', 'marque',
   ARRAY['Bien-être','Produits naturels','Hygiène','Infusions'],
   '/gabarits/naturel.webp', TRUE, 13),
  ('monoproduit', 'Produit unique', 'Pas de bannière : l''article EST la page', 'marque',
   ARRAY['Un seul produit','Lancement','Précommande','Édition limitée'],
   '/gabarits/monoproduit.webp', TRUE, 14),
  ('retail', 'Modern Retail', 'Polyvalent et commercial, le catalogue au centre', 'rayon',
   ARRAY['Boutiques','Maison','Lifestyle','Petits commerces'],
   '/gabarits/retail.webp', TRUE, 15),
  ('fashion', 'Fashion Atelier', 'Éditorial, beaucoup d''air, la photographie au premier plan', 'rayon',
   ARRAY['Prêt-à-porter','Chaussures','Sacs','Accessoires de mode'],
   '/gabarits/fashion.webp', TRUE, 16),
  ('beauty', 'Beauty Studio', 'Doux et soigné, les produits détourés qui respirent', 'rayon',
   ARRAY['Cosmétiques','Parfums','Soins','Cheveux'],
   '/gabarits/beauty.webp', TRUE, 17),
  ('tech', 'Tech Store', 'Dense et informatif, pour un rayon où l''on compare', 'rayon',
   ARRAY['Électronique','Téléphonie','Informatique','Électroménager'],
   '/gabarits/tech.webp', TRUE, 18),
  ('food', 'Food Market', 'Chaleureux et appétissant, la carte au premier écran', 'rayon',
   ARRAY['Restauration','Épicerie','Pâtisserie','Traiteur'],
   '/gabarits/food.webp', TRUE, 19),
  ('luxe', 'Luxe & Minimaliste', 'Grands visuels, typographie serif, rien de superflu', 'historique',
   ARRAY['Cosmétiques','Parfums','Bijoux','Mode'],
   '/gabarits/luxe.webp', FALSE, 919),
  ('modern', 'Moderne & Conversion', 'Le gabarit de repli — vingt sections, réassurance et catalogue', 'historique',
   ARRAY['Électronique','Accessoires','Maison','Général'],
   '/gabarits/modern.webp', FALSE, 920),
  ('flash', 'Catalogue Flash', 'Trafic réseaux sociaux, commande en deux gestes', 'historique',
   ARRAY['Revente','Prêt-à-porter','Alimentation','Vente flash'],
   '/gabarits/flash.webp', FALSE, 921)
ON CONFLICT (id) DO UPDATE SET
  name          = EXCLUDED.name,
  tagline       = EXCLUDED.tagline,
  family        = EXCLUDED.family,
  best_for      = EXCLUDED.best_for,
  preview_image = EXCLUDED.preview_image,
  is_active     = EXCLUDED.is_active,
  sort_order    = EXCLUDED.sort_order;

-- Un gabarit qui aurait été semé par une migration antérieure et qui ne serait
-- plus dans le registre ne doit pas rester proposé. Il n'est pas supprimé —
-- une vitrine peut le porter — il est désactivé.
UPDATE store_templates
   SET is_active = FALSE
 WHERE id NOT IN ('proximite', 'social', 'artisan', 'services', 'agri', 'traiteur', 'wellness', 'skincare', 'animalerie', 'magazine', 'sport', 'maker', 'naturel', 'monoproduit', 'retail', 'fashion', 'beauty', 'tech', 'food', 'luxe', 'modern', 'flash');
