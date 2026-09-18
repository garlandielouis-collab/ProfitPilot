// ─────────────────────────────────────────────────────────────────────────────
// Le registre des gabarits
//
// Un gabarit n'est pas un composant. C'est un NOM, une intention, et trois
// choses que trois fichiers portent :
//
//   `lib/storeSections.ts → presetFor`  l'ordre de sa page d'accueil
//   `lib/storeDesign.ts   → designFor`  sa direction artistique
//   `store_settings.theme_config`       les couleurs et les textes du marchand
//
// Il l'a été autrement : trois composants dessinaient chacun leur bannière,
// leurs catégories et leur grille. Trois fois le même code, donc trois fois la
// même correction à faire — et deux fois faite en pratique.
//
// ── Vingt-deux gabarits, dix-neuf proposés ─────────────────────────────────
//
// Six gabarits métier (§34), huit gabarits de marque en ligne (§35) et cinq
// presets de rayon (§33) sont offerts au marchand.
// Trois gabarits historiques restent valides mais ne sont plus proposés à la
// création : des vitrines en production les portent, et les retirer changerait
// leur identité du jour au lendemain sans que personne l'ait demandé. Le
// marchand qui en porte un le voit dans son éditeur, sélectionné, avec la
// mention qui va bien — et il peut passer à un preset quand il le veut.
//
// ── Dix-neuf choix, et pourquoi ils tiennent quand même ────────────────────
//
// Dix-neuf cartes à la file seraient un catalogue, pas un choix. Deux choses
// l'évitent : `family` les range en trois groupes que l'éditeur titre, et
// `preview` porte la vignette — le marchand reconnaît sa boutique sur une
// image en une seconde, là où il aurait fallu lire trois lignes.
//
// Les vignettes sont des MAQUETTES, pas des captures de la vitrine du
// marchand. Elles montrent la composition — où va la bannière, la forme des
// rayons, la densité de la grille — et rien d'autre ne doit s'en déduire :
// aucun chiffre, aucun produit, aucune note qui y figure n'appartient à
// personne. C'est pour cela que « Voir ma boutique dans ce gabarit » reste
// juste dessous : la vignette dit à quoi cela ressemble, l'aperçu dit ce que
// CE marchand obtiendra avec SON catalogue.
//
// Les dix-neuf gabarits proposés en ont une, et elles ne se ressemblent pas :
// les quatorze gabarits métier et marque ont une maquette photographique, les
// cinq presets de rayon un schéma en aplats dessiné par
// `scripts/gabarits-vignettes.js` à partir de `designFor`, `presetFor` et
// `brandPresetFor`. La différence se voit, et c'est assumé : une maquette
// photographique demande des photographies, et en inventer pour un gabarit
// reviendrait à montrer une boutique qui n'existe pas. Le schéma, lui, ne peut
// pas mentir sur la page qu'il annonce — le gabarit change, il se regénère.
//
// `resolveTemplate` ne lève jamais et retombe sur « modern ». `template_id` est
// du texte libre côté base : une vitrine dont le gabarit a été retiré, ou dont
// la valeur a été écrite à la main, doit s'afficher — pas renvoyer une erreur
// au client du marchand.
// ─────────────────────────────────────────────────────────────────────────────

import { isTemplateId, type TemplateId } from '../../../lib/storeTheme';
import {
  presetFor, defaultSectionTitle, SECTIONS, type SectionKey,
} from '../../../lib/storeSections';

/**
 * Le groupe sous lequel l'éditeur range ce gabarit.
 *
 *   'metier'      ce que je fais       — un commerce, un métier
 *   'marque'      comment je le vends  — une marque à catalogue court
 *   'rayon'       ce que je vends      — un préréglage de rayon
 *   'historique'  ce que je portais    — jamais proposé, toujours rendu
 */
export type TemplateFamily = 'metier' | 'marque' | 'rayon' | 'historique';

export const FAMILY_LABELS: Record<TemplateFamily, { title: string; hint: string }> = {
  metier: {
    title: 'Par métier',
    hint:  'Ce que vous faites décide de la page : ce qu\'on regarde en premier, et par quel geste la commande part.',
  },
  marque: {
    title: 'Marques en ligne',
    hint:  'Pour un catalogue court, vendu par le discours : une promesse, une preuve, un argumentaire.',
  },
  rayon: {
    title: 'Par rayon',
    hint:  'Des mises en page générales, quand aucun des choix ci-dessus ne vous ressemble.',
  },
  historique: {
    title: 'Votre gabarit actuel',
    hint:  'Il n\'est plus proposé aux nouvelles boutiques, mais la vôtre le porte et continue de fonctionner.',
  },
};

export type TemplateDefinition = {
  id:      TemplateId;
  name:    string;
  tagline: string;
  family:  TemplateFamily;
  /** Les rayons pour lesquels il a été dessiné — affiché dans l'éditeur. */
  bestFor: string[];
  /** Ce que le gabarit apporte, en clair, pour que le choix soit informé. */
  highlights: string[];
  /**
   * La maquette montrée dans le sélecteur, sous `public/`. Les dix-neuf
   * gabarits proposés en ont une ; seuls les trois historiques restent à
   * `null`, et l'éditeur pose alors leur palette à la place — plutôt que la
   * vignette d'un autre gabarit : un aperçu qui ment est pire qu'absent.
   */
  preview: string | null;
  /**
   * Faux pour les gabarits historiques : ils restent valides et rendus, mais ne
   * sont plus proposés à la création.
   */
  offered: boolean;
};

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // Les six gabarits métier (§34)
  //
  // Ils ne se choisissent pas sur un rayon mais sur un MÉTIER. C'est ce qui les
  // distingue des cinq presets : deux marchands qui vendent tous les deux des
  // vêtements n'ont pas la même vitrine selon qu'ils tiennent une boutique de
  // quartier ou qu'ils vendent depuis un compte Instagram.
  // ═══════════════════════════════════════════════════════════════════════════

  proximite: {
    id:      'proximite',
    name:    'Boutique de proximité',
    tagline: 'Épuré et rapide, pensé pour le téléphone avant tout',
    family:  'metier',
    bestFor: ['Prêt-à-porter', 'Cosmétiques', 'Chaussures', 'Commerce général'],
    highlights: [
      'Réassurance dès la bannière : livraison, MonCash, retours',
      'Meilleures ventes au premier écran, note et prix sur chaque carte',
      'Deux colonnes dès le plus petit écran, aucune animation qui retarde',
    ],
    preview: '/gabarits/proximite.webp',
    offered: true,
  },

  social: {
    id:      'social',
    name:    'Vendeur social',
    tagline: 'Pour le trafic Instagram, TikTok et WhatsApp',
    family:  'metier',
    bestFor: ['Nouveautés', 'Gadgets', 'Cosmétiques', 'Revente'],
    highlights: [
      'En-tête sombre, bannière en aplat, arguments en pastilles',
      'Rayons en médaillons ronds — la grammaire des stories',
      'Étiquette « Nouveau », note réelle, galerie de vos publications',
    ],
    preview: '/gabarits/social.webp',
    offered: true,
  },

  artisan: {
    id:      'artisan',
    name:    'Créateur / Artisan',
    tagline: 'Typographie éditoriale, matière et savoir-faire',
    family:  'metier',
    bestFor: ['Bijoux', 'Décoration', 'Objets faits main', 'Produits locaux'],
    highlights: [
      'Beaucoup d\'air, angles droits, apparitions au défilement',
      'Section « comment nos pièces sont faites » et galerie d\'atelier',
      'Les créations avant l\'histoire : on regarde d\'abord, on lit ensuite',
    ],
    preview: '/gabarits/artisan.webp',
    offered: true,
  },

  services: {
    id:      'services',
    name:    'Prestataire de services',
    tagline: 'La conversion n\'est pas un panier, c\'est un rendez-vous',
    family:  'metier',
    bestFor: ['Coaching', 'Consulting', 'Formation', 'Prestations techniques'],
    highlights: [
      'Bouton « Prendre rendez-vous » présent dans l\'en-tête',
      'Vos chiffres sous la bannière, votre méthode en étapes',
      'Cartes de prestation avec durée et tarif, jamais « Ajouter au panier »',
    ],
    preview: '/gabarits/services.webp',
    offered: true,
  },

  agri: {
    id:      'agri',
    name:    'Élevage & Bétail',
    tagline: 'Disponibilité, prix à l\'unité, contact direct',
    family:  'metier',
    bestFor: ['Volailles', 'Porcins', 'Bovins', 'Caprins', 'Aliments'],
    highlights: [
      'Votre numéro dans l\'en-tête, cliquable',
      'Rayons en onglets posés au-dessus du catalogue',
      'Cartes « à partir de », unité de vente et disponibilité réelle',
    ],
    preview: '/gabarits/agri.webp',
    offered: true,
  },

  traiteur: {
    id:      'traiteur',
    name:    'Traiteur & Pâtissier',
    tagline: 'La photographie vend, la commande prend une date',
    family:  'metier',
    bestFor: ['Plats cuisinés', 'Pâtisserie', 'Buffets', 'Événements'],
    highlights: [
      'Grandes photos en paysage, quatre par rangée, jamais démesurées',
      'Carte en onglets : plats, pâtisseries, buffets, événements',
      'Demande sur mesure avec date et heure, envoyée sur WhatsApp',
    ],
    preview: '/gabarits/traiteur.webp',
    offered: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Les huit gabarits de marque en ligne (§35)
  //
  // Les six métiers répondent à « qu'est-ce que je fais ? ». Ceux-ci répondent
  // à « comment ma marque parle-t-elle ? ». Le marchand concerné n'a pas un
  // rayon, il a dix références et un discours — et c'est le discours qui vend.
  //
  // Deux d'entre eux ressemblent de loin à un gabarit métier : « Fait main &
  // récit » à l'Artisan, « Mode éditoriale » à Fashion Atelier. Ils ne font
  // pourtant pas le même travail, et leurs pages ne se lisent pas dans le même
  // ordre. Chaque fiche dit lequel choisir.
  // ═══════════════════════════════════════════════════════════════════════════

  wellness: {
    id:      'wellness',
    name:    'Compléments & Bien-être',
    tagline: 'Une promesse, une preuve, un flacon qui respire',
    family:  'marque',
    bestFor: ['Compléments', 'Vitamines', 'Nutrition', 'Produits de santé'],
    highlights: [
      'Bannière en deux colonnes : le discours à gauche, le produit à droite',
      'Produits détourés avec de l\'air autour, note réelle sur chaque carte',
      'Votre démarche après les meilleures ventes, pas avant',
    ],
    preview: '/gabarits/wellness.webp',
    offered: true,
  },

  skincare: {
    id:      'skincare',
    name:    'Soin & Skincare',
    tagline: 'La peau en grand, l\'ingrédient en petit',
    family:  'marque',
    bestFor: ['Soins visage', 'Soins corps', 'Cheveux', 'Cosmétique naturelle'],
    highlights: [
      'Bannière photographique pleine largeur : le résultat, pas le pot',
      'Rayons par BESOIN — peau sèche, taches, anti-âge — et non par produit',
      'Cartes très aérées, angles presque droits, seconde photo au survol',
    ],
    preview: '/gabarits/skincare.webp',
    offered: true,
  },

  animalerie: {
    id:      'animalerie',
    name:    'Animalerie',
    tagline: 'La réassurance avant la bannière : on achète pour un autre',
    family:  'marque',
    bestFor: ['Alimentation animale', 'Accessoires', 'Soins vétérinaires', 'Hygiène'],
    highlights: [
      'Le seul gabarit dont la réassurance passe AVANT la bannière',
      'Rayons en médaillons ronds, un par animal',
      'Cartes claires, produit détouré, note réelle et disponibilité',
    ],
    preview: '/gabarits/animalerie.webp',
    offered: true,
  },

  magazine: {
    id:      'magazine',
    name:    'Mode Éditoriale',
    tagline: 'La campagne plein écran, la grille dense juste dessous',
    family:  'marque',
    bestFor: ['Prêt-à-porter', 'Sacs', 'Lunettes', 'Accessoires de mode'],
    highlights: [
      'Bannière plein écran, puis les rayons TOUT DE SUITE',
      'Quatre colonnes en portrait, seconde photo et ajout au survol',
      'À préférer à Fashion Atelier si l\'on vient chercher une pièce, pas parcourir une saison',
    ],
    preview: '/gabarits/magazine.webp',
    offered: true,
  },

  sport: {
    id:      'sport',
    name:    'Sport & Performance',
    tagline: 'Page noire, titres en capitales, une seule chose qui brille',
    family:  'marque',
    bestFor: ['Nutrition sportive', 'Équipement', 'Programmes', 'Salle de sport'],
    highlights: [
      'Le seul gabarit à fond sombre : la couleur d\'action y est la seule lumière',
      'Titres en capitales, très grands — ce rayon se vend par l\'affirmation',
      'Galerie « de vrais résultats » : la preuve par la photo, avant les avis',
    ],
    preview: '/gabarits/sport.webp',
    offered: true,
  },

  maker: {
    id:      'maker',
    name:    'Fait main & Récit',
    tagline: 'L\'histoire au deuxième écran, les objets ensuite',
    family:  'marque',
    bestFor: ['Coopératives', 'Commerce équitable', 'Vannerie', 'Produits du terroir'],
    highlights: [
      'Votre histoire juste après la bannière, avant tout produit',
      'Section « comment c\'est fait » et galerie de celles et ceux qui font',
      'À préférer à Créateur / Artisan quand c\'est le récit qui vend, pas la pièce',
    ],
    preview: '/gabarits/maker.webp',
    offered: true,
  },

  naturel: {
    id:      'naturel',
    name:    'Clean & Naturel',
    tagline: 'Vos chiffres sous la bannière, à la place des avis',
    family:  'marque',
    bestFor: ['Bien-être', 'Produits naturels', 'Hygiène', 'Infusions'],
    highlights: [
      'Vos résultats chiffrés dès le deuxième écran',
      'Palette froide et claire — le versant clinique du bien-être',
      'Bannière en deux colonnes, produits détourés, beaucoup d\'air',
    ],
    preview: '/gabarits/naturel.webp',
    offered: true,
  },

  monoproduit: {
    id:      'monoproduit',
    name:    'Produit unique',
    tagline: 'Pas de bannière : l\'article EST la page',
    family:  'marque',
    bestFor: ['Un seul produit', 'Lancement', 'Précommande', 'Édition limitée'],
    highlights: [
      'La fiche produit au premier écran : photo, prix, arguments, bouton',
      'Puis « pourquoi vous allez l\'aimer », les avis, les objections',
      'Une colonne sur mobile : un catalogue de trois articles n\'est pas une grille',
    ],
    preview: '/gabarits/monoproduit.webp',
    offered: true,
  },

  fashion: {
    id:      'fashion',
    name:    'Fashion Atelier',
    tagline: 'Éditorial, beaucoup d\'air, la photographie au premier plan',
    family:  'rayon',
    bestFor: ['Prêt-à-porter', 'Chaussures', 'Sacs', 'Accessoires de mode'],
    highlights: [
      'Bannière plein écran avec accroche de saison',
      'Photos en portrait 4/5, la seconde apparaît au survol',
      'Cœur « favoris » sur chaque article, trois colonnes aérées',
    ],
    preview: '/gabarits/fashion.webp',
    offered: true,
  },

  beauty: {
    id:      'beauty',
    name:    'Beauty Studio',
    tagline: 'Doux et soigné, les produits détourés qui respirent',
    family:  'rayon',
    bestFor: ['Cosmétiques', 'Parfums', 'Soins', 'Cheveux'],
    highlights: [
      'Cadres carrés arrondis, produit centré avec de l\'air autour',
      'Note moyenne réelle sur chaque carte, dès le premier avis publié',
      'Meilleures ventes avant le catalogue : la preuve d\'abord',
    ],
    preview: '/gabarits/beauty.webp',
    offered: true,
  },

  tech: {
    id:      'tech',
    name:    'Tech Store',
    tagline: 'Dense et informatif, pour un rayon où l\'on compare',
    family:  'rayon',
    bestFor: ['Électronique', 'Téléphonie', 'Informatique', 'Électroménager'],
    highlights: [
      'Un produit à la une, avec ses caractéristiques et son prix',
      'Caractéristique courte et disponibilité sur chaque carte',
      'Quatre colonnes, cartes bordées, rythme serré',
    ],
    preview: '/gabarits/tech.webp',
    offered: true,
  },

  food: {
    id:      'food',
    name:    'Food Market',
    tagline: 'Chaleureux et appétissant, la carte au premier écran',
    family:  'rayon',
    bestFor: ['Restauration', 'Épicerie', 'Pâtisserie', 'Traiteur'],
    highlights: [
      'Bannière immersive et photos en paysage, jamais démesurées',
      'Les plus demandés avant tout le reste',
      'Section « Nous trouver » avec lien vers le plan',
    ],
    preview: '/gabarits/food.webp',
    offered: true,
  },

  retail: {
    id:      'retail',
    name:    'Modern Retail',
    tagline: 'Polyvalent et commercial, le catalogue au centre',
    family:  'rayon',
    bestFor: ['Boutiques', 'Maison', 'Lifestyle', 'Petits commerces'],
    highlights: [
      'Bannière en carte : les produits visibles dès le premier écran',
      'Réassurance, avis vérifiés et lots',
      'Quatre colonnes réglables, cartes claires',
    ],
    preview: '/gabarits/retail.webp',
    offered: true,
  },

  // ── Les gabarits historiques ────────────────────────────────────────────

  luxe: {
    id:      'luxe',
    name:    'Luxe & Minimaliste',
    tagline: 'Grands visuels, typographie serif, rien de superflu',
    family:  'historique',
    bestFor: ['Cosmétiques', 'Parfums', 'Bijoux', 'Mode'],
    highlights: [
      'La bannière et votre histoire avant le catalogue',
      'Apparitions au défilement, beaucoup d\'air',
      'Remplacé par Fashion Atelier pour les nouvelles boutiques',
    ],
    preview: '/gabarits/luxe.webp',
    offered: false,
  },

  modern: {
    id:      'modern',
    name:    'Moderne & Conversion',
    tagline: 'Le gabarit de repli — vingt sections, réassurance et catalogue',
    family:  'historique',
    bestFor: ['Électronique', 'Accessoires', 'Maison', 'Général'],
    highlights: [
      'Bannière en deux colonnes, rayons en vignettes photo',
      'Note sur les cartes et achat en un geste',
      'Le gabarit que reçoit une boutique sans gabarit choisi',
    ],
    preview: '/gabarits/modern.webp',
    offered: false,
  },

  flash: {
    id:      'flash',
    name:    'Catalogue Flash',
    tagline: 'Trafic réseaux sociaux, commande en deux gestes',
    family:  'historique',
    bestFor: ['Revente', 'Prêt-à-porter', 'Alimentation', 'Vente flash'],
    highlights: [
      'Pas de bannière : les produits au premier écran',
      'Grille dense, deux colonnes sur mobile',
      'Bouton WhatsApp flottant en permanence',
    ],
    preview: '/gabarits/flash.webp',
    offered: false,
  },
};

/**
 * Les gabarits proposés, dans l'ordre où l'éditeur les montre.
 *
 * Les six métiers d'abord : ils correspondent à la question que le marchand se
 * pose réellement — « qu'est-ce que je fais ? » — et non à un rayon de grande
 * surface. Les cinq presets de rayon suivent, pour les catalogues qui ne se
 * reconnaissent dans aucun des six.
 */
export const TEMPLATE_LIST: TemplateDefinition[] = [
  // Les métiers d'abord.
  TEMPLATES.proximite,
  TEMPLATES.social,
  TEMPLATES.artisan,
  TEMPLATES.services,
  TEMPLATES.agri,
  TEMPLATES.traiteur,
  // Les marques en ligne ensuite : elles supposent un catalogue court et un
  // discours déjà écrit, ce que le commerçant qui ouvre sa première vitrine
  // n'a pas. Les lui montrer en premier lui ferait choisir une page qu'il ne
  // saurait pas remplir.
  TEMPLATES.wellness,
  TEMPLATES.skincare,
  TEMPLATES.animalerie,
  TEMPLATES.magazine,
  TEMPLATES.sport,
  TEMPLATES.maker,
  TEMPLATES.naturel,
  TEMPLATES.monoproduit,
  // Les rayons en dernier : ce sont les mises en page générales, celles qu'on
  // prend quand on ne s'est reconnu nulle part au-dessus.
  TEMPLATES.retail,
  TEMPLATES.fashion,
  TEMPLATES.beauty,
  TEMPLATES.tech,
  TEMPLATES.food,
];

/**
 * Ce que l'éditeur doit montrer à CE marchand.
 *
 * Les dix-neuf gabarits proposés, plus son gabarit actuel s'il porte un
 * gabarit historique : un marchand ne doit pas découvrir que sa boutique
 * tourne sur un gabarit absent de la liste — il conclurait que quelque chose
 * est cassé.
 */
export function templateChoices(current: unknown): TemplateDefinition[] {
  const id = resolveTemplateId(current);
  const offered = TEMPLATE_LIST;
  return offered.some((t) => t.id === id) ? offered : [TEMPLATES[id], ...offered];
}

/**
 * Les mêmes, groupés par famille et dans l'ordre de `templateChoices`.
 *
 * L'éditeur en a besoin parce qu'une liste de dix-neuf cartes à la file n'est
 * plus un choix : trois titres transforment un catalogue en trois questions
 * courtes, dont le marchand n'a à s'en poser qu'une.
 *
 * Une famille sans gabarit n'apparaît pas — c'est ce qui fait que « Votre
 * gabarit actuel » ne se montre qu'aux vitrines qui en portent un.
 */
export function templateGroups(current: unknown): Array<{
  family:    TemplateFamily;
  title:     string;
  hint:      string;
  templates: TemplateDefinition[];
}> {
  const choices: TemplateDefinition[] = templateChoices(current);
  const order: TemplateFamily[] = ['historique', 'metier', 'marque', 'rayon'];

  return order
    .map((family) => ({
      family,
      title:     FAMILY_LABELS[family].title,
      hint:      FAMILY_LABELS[family].hint,
      templates: choices.filter((t) => t.family === family),
    }))
    .filter((group) => group.templates.length > 0);
}

export function resolveTemplateId(raw: unknown): TemplateId {
  return isTemplateId(raw) ? raw : 'proximite';
}

export function resolveTemplate(raw: unknown): TemplateDefinition {
  return TEMPLATES[resolveTemplateId(raw)];
}

/** Les sections qu'un gabarit propose, dans son ordre, pour l'éditeur. */
export function templateSections(templateId: TemplateId): Array<{
  key:   SectionKey;
  label: string;
  hint:  string;
  /** Le titre que cette section portera en ligne si le marchand n'en met pas. */
  defaultTitle: string;
}> {
  return presetFor(templateId).map((key) => ({
    key,
    label: SECTIONS[key].label,
    hint:  SECTIONS[key].hint,
    defaultTitle: defaultSectionTitle(key, templateId),
  }));
}
