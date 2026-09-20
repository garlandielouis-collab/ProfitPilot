// ─────────────────────────────────────────────────────────────────────────────
// Les sections d'une page d'accueil de vitrine
//
// C'est le « Template ↓ Theme ↓ Sections ↓ Components ↓ Data » du cahier des
// charges (§8), et la réponse au §6 : chaque section s'active, se désactive, se
// déplace et se configure.
//
// ── Le partage des rôles ────────────────────────────────────────────────────
//
//   Le GABARIT fournit l'ordre de départ et le style. C'est lui qui sait qu'une
//   boutique de bijoux montre son histoire avant son catalogue, et qu'une
//   boutique de revente montre son catalogue tout de suite.
//
//   La TABLE `store_sections` porte l'ordre et l'activation choisis par le
//   marchand. Elle ne porte PAS le contenu.
//
//   Le THÈME porte le contenu (titre de bannière, texte de l'histoire,
//   questions fréquentes…). Une seule source de vérité : sans cela, désactiver
//   puis réactiver une section effacerait son texte.
//
// ── Pourquoi `section_key` est du texte libre en base ───────────────────────
//
// Ajouter une section ne demande pas de migration : une entrée dans SECTIONS,
// un composant dans le registre, et c'est tout. Symétriquement, une clé que le
// code ne connaît plus est simplement ignorée au rendu — retirer une section du
// produit ne casse aucune vitrine en production.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type { TemplateId } from './storeTheme';

// ── Le catalogue des sections ───────────────────────────────────────────────

export const SECTION_KEYS = [
  'announcement',
  'hero',
  'benefits',
  'categories',
  'featured',
  'featured_product',
  'stats',
  'process',
  'gallery',
  'order_form',
  'cta_band',
  'bestsellers',
  'new_arrivals',
  'bundles',
  'promotion',
  'brand_story',
  'catalog',
  'testimonials',
  'faq',
  'newsletter',
  'location',
  'social',

  // ── Les sections qui RÉPONDENT (§36) ──────────────────────────────────────
  //
  // Les vingt-deux premières vendent. Celles-ci lèvent les objections qui
  // arrêtent l'achat : le prix de la livraison, le mode de paiement, l'heure
  // d'ouverture, la taille, la composition, la personne en face. Elles sont ce
  // qui séparait nos vitrines d'un vrai site marchand — pas une bannière de
  // plus.
  'presentation',
  'shipping',
  'payments',
  'contact',
  'countdown',
  'video',
  'partners',
  'size_guide',
  'ingredients',
  'team',

  // ── Les six sections qui achèvent les gabarits métier (§34) ────────────────
  //
  // Chacune répond à une question qu'UN métier pose et que les cinq autres ne
  // posent pas. C'est pourquoi elles ne sont pas dans le préréglage de tout le
  // monde : une grille de prix dégressifs sur la vitrine d'un pâtissier est une
  // section vide de plus à comprendre.
  'availability',
  'wholesale',
  'packages',
  'case_studies',
  'journal',
  'video_wall',

  // La barre « Vous avez une question ? » : WhatsApp, juste avant « Comment
  // payer », sur tous les gabarits. Rien à saisir — elle suit le numéro de la
  // boutique et disparaît sans lui.
  'whatsapp_help',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export function isSectionKey(v: unknown): v is SectionKey {
  return typeof v === 'string' && (SECTION_KEYS as readonly string[]).includes(v);
}

/**
 * La configuration d'une section : ce qui varie d'une vitrine à l'autre sans
 * être du contenu. Un titre de remplacement, un nombre d'articles.
 *
 * Volontairement minuscule. Le §6 dit « pas besoin de recréer Canva » : un
 * marchand qui doit régler douze paramètres par section n'en règle aucun.
 */
export const sectionConfigSchema = z.object({
  title: z.string().max(80).catch(''),
  limit: z.number().int().min(2).max(24).catch(8),
}).catch(() => ({ title: '', limit: 8 }));

export type SectionConfig = z.infer<typeof sectionConfigSchema>;

export type SectionDefinition = {
  key:   SectionKey;
  label: string;
  /** Ce que la section fait, en une phrase, pour le marchand. */
  hint:  string;
  /** Vrai si le nombre d'articles a un sens pour cette section. */
  hasLimit: boolean;
  /** Vrai si la section peut être vide et donc disparaître d'elle-même. */
  canBeEmpty: boolean;
  defaultTitle: string;
};

export const SECTIONS: Record<SectionKey, SectionDefinition> = {
  announcement: {
    key: 'announcement', label: 'Bandeau d\'annonce',
    hint: 'Une phrase tout en haut : livraison gratuite, horaires, promotion en cours.',
    hasLimit: false, canBeEmpty: true, defaultTitle: '',
  },
  hero: {
    key: 'hero', label: 'Bannière',
    hint: 'La première image et la phrase qui dit ce que vous vendez.',
    hasLimit: false, canBeEmpty: false, defaultTitle: '',
  },
  benefits: {
    key: 'benefits', label: 'Réassurance',
    hint: 'Livraison, paiement, garantie — ce qui lève les doutes avant l\'achat.',
    hasLimit: false, canBeEmpty: true, defaultTitle: '',
  },
  categories: {
    key: 'categories', label: 'Catégories',
    hint: 'Les rayons de la boutique, pour que le visiteur trouve son chemin.',
    hasLimit: true, canBeEmpty: true, defaultTitle: 'Nos rayons',
  },
  featured: {
    key: 'featured', label: 'Produits mis en avant',
    hint: 'Ceux que vous cochez « en vedette » dans le catalogue.',
    hasLimit: true, canBeEmpty: true, defaultTitle: 'Nos coups de cœur',
  },
  featured_product: {
    key: 'featured_product', label: 'Produit à la une',
    hint: 'Un seul article, en grand, avec ses caractéristiques et son prix.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Le produit du moment',
  },
  stats: {
    key: 'stats', label: 'Vos chiffres',
    hint: 'Clients accompagnés, années d\'expérience, taux de satisfaction.',
    hasLimit: false, canBeEmpty: true, defaultTitle: '',
  },
  process: {
    key: 'process', label: 'Comment ça se passe',
    hint: 'Trois ou quatre étapes. Indispensable quand ce que vous vendez demande une explication.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Comment ça se passe',
  },
  gallery: {
    key: 'gallery', label: 'Galerie',
    hint: 'Vos photos qui ne sont pas des fiches produit : l\'atelier, la vitrine, un événement.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'En images',
  },
  order_form: {
    key: 'order_form', label: 'Commande sur mesure',
    hint: 'Une demande avec une date, envoyée sur WhatsApp. Pour ce qu\'un panier ne sait pas prendre.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Commandez maintenant',
  },
  cta_band: {
    key: 'cta_band', label: 'Appel final',
    hint: 'Une phrase et un bouton, sur un aplat de votre couleur, pour fermer la page.',
    hasLimit: false, canBeEmpty: true, defaultTitle: '',
  },
  bestsellers: {
    key: 'bestsellers', label: 'Meilleures ventes',
    hint: 'Calculées sur vos ventes des 90 derniers jours. Rien à cocher.',
    hasLimit: true, canBeEmpty: true, defaultTitle: 'Les plus vendus',
  },
  new_arrivals: {
    key: 'new_arrivals', label: 'Nouveautés',
    hint: 'Les fiches ajoutées ces trente derniers jours.',
    hasLimit: true, canBeEmpty: true, defaultTitle: 'Nouveautés',
  },
  bundles: {
    key: 'bundles', label: 'Lots',
    hint: 'Plusieurs produits à un prix groupé. Composés dans Merchandising.',
    hasLimit: true, canBeEmpty: true, defaultTitle: 'Nos lots',
  },
  promotion: {
    key: 'promotion', label: 'Bannière promotion',
    hint: 'Un encart large pour une offre en cours.',
    hasLimit: false, canBeEmpty: true, defaultTitle: '',
  },
  brand_story: {
    key: 'brand_story', label: 'Notre histoire',
    hint: 'Qui vous êtes. C\'est ce qui fait acheter chez vous plutôt qu\'ailleurs.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Notre histoire',
  },
  catalog: {
    key: 'catalog', label: 'Catalogue',
    hint: 'La grille de tous vos produits en ligne.',
    hasLimit: true, canBeEmpty: false, defaultTitle: 'Nos produits',
  },
  testimonials: {
    key: 'testimonials', label: 'Avis clients',
    hint: 'Les avis déposés par de vrais acheteurs, une fois publiés par vous.',
    hasLimit: true, canBeEmpty: true, defaultTitle: 'Ce qu\'en disent nos clients',
  },
  faq: {
    key: 'faq', label: 'Questions fréquentes',
    hint: 'Livraison, paiement, retours. Répondre ici, c\'est dix messages de moins.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Questions fréquentes',
  },
  newsletter: {
    key: 'newsletter', label: 'Inscription',
    hint: 'Récupérer une adresse pour prévenir des nouveautés.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Restez informé',
  },
  location: {
    key: 'location', label: 'Nous trouver',
    hint: 'Votre adresse et votre téléphone, avec un lien vers le plan.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Nous trouver',
  },
  social: {
    key: 'social', label: 'Réseaux sociaux',
    hint: 'Les liens vers vos pages. Utile quand le trafic vient d\'Instagram.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Suivez-nous',
  },

  // ── Les neuf sections qui répondent (§36) ────────────────────────────────

  presentation: {
    key: 'presentation', label: 'Présentation & services',
    hint: 'Qui vous êtes et ce que vous faites, en trois ou quatre points. Rédigeable par l\'IA depuis vos vraies données.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Ce que nous faisons',
  },
  shipping: {
    key: 'shipping', label: 'Livraison & retours',
    hint: 'Vos modes de livraison, leurs délais et leurs prix. Ils viennent de vos réglages — rien à retaper.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Livraison & retours',
  },
  payments: {
    key: 'payments', label: 'Moyens de paiement',
    hint: 'Ce que votre caisse accepte vraiment : MonCash, NatCash, carte, espèces.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Comment payer',
  },
  contact: {
    key: 'contact', label: 'Nous joindre',
    hint: 'Vos horaires, votre téléphone, WhatsApp. « Ouvert ? » est la question d\'avant le déplacement.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Nous joindre',
  },
  countdown: {
    key: 'countdown', label: 'Compte à rebours',
    hint: 'Une offre qui se termine à une date précise. Le compte tourne tout seul et s\'efface à l\'échéance.',
    hasLimit: false, canBeEmpty: true, defaultTitle: '',
  },
  video: {
    key: 'video', label: 'Vidéo',
    hint: 'Un lien YouTube, Vimeo ou Facebook. Ce qu\'une photo ne montre pas : le geste, la matière, l\'usage.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'En vidéo',
  },
  partners: {
    key: 'partners', label: 'Ils nous font confiance',
    hint: 'Les marques que vous distribuez, vos partenaires, vos clients de référence.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Ils nous font confiance',
  },
  size_guide: {
    key: 'size_guide', label: 'Guide des tailles',
    hint: 'Le tableau des mesures. C\'est ce qui fait revenir un vêtement, ou pas.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Guide des tailles',
  },
  ingredients: {
    key: 'ingredients', label: 'Composition',
    hint: 'Ce qu\'il y a dedans, et à quoi ça sert. Un complément, un soin ou un plat se vendent là-dessus.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Ce qu\'il y a dedans',
  },
  team: {
    key: 'team', label: 'L\'équipe',
    hint: 'Qui vous recevra. Une prestation ne s\'achète pas à une entreprise, elle s\'achète à quelqu\'un.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'L\'équipe',
  },

  // ── Les six sections des gabarits métier ────────────────────────────────

  availability: {
    key: 'availability', label: 'Disponibles actuellement',
    hint: 'Ce qui est en stock aujourd\'hui, avec les quantités réelles. Rien à saisir : elles viennent de votre inventaire.',
    hasLimit: true, canBeEmpty: true, defaultTitle: 'Disponibles actuellement',
  },
  wholesale: {
    key: 'wholesale', label: 'Vente en gros',
    hint: 'Votre grille de prix par quantité. C\'est elle qui décide l\'acheteur qui en veut trente.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Vous achetez en quantité ?',
  },
  packages: {
    key: 'packages', label: 'Forfaits',
    hint: 'Deux à quatre formules comparables. Un client ne compare pas deux prestations, il compare deux niveaux.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Nos formules',
  },
  case_studies: {
    key: 'case_studies', label: 'Résultats obtenus',
    hint: 'D\'où partait le client, où il est arrivé. C\'est l\'écart qui vend, pas la promesse.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Des résultats concrets',
  },
  journal: {
    key: 'journal', label: 'Journal & conseils',
    hint: 'Vos articles, où qu\'ils soient déjà publiés. Le savoir-faire se lit avant de s\'acheter.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Le journal',
  },
  video_wall: {
    key: 'video_wall', label: 'Mur de vidéos',
    hint: 'Vos vidéos, chacune reliée à un article. Le visiteur a vu le produit là — il vient le retrouver.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'À voir',
  },

  whatsapp_help: {
    key: 'whatsapp_help', label: 'Question WhatsApp',
    hint: 'Une barre « Vous avez une question ? » qui ouvre WhatsApp. Elle suit votre numéro ; sans numéro, elle ne s\'affiche pas.',
    hasLimit: false, canBeEmpty: true, defaultTitle: 'Vous avez une question ?',
  },
};

// ── Les ordres de départ, par gabarit ───────────────────────────────────────
//
// Ils ne sont pas arbitraires : chacun suit l'ordre des objections du client
// type de son gabarit.

const PRESETS: Record<TemplateId, SectionKey[]> = {

  // ── Les six gabarits métier (§34) ───────────────────────────────────────
  //
  // L'ordre suit les objections du client de CE métier, pas un modèle unique
  // décliné six fois. C'est la différence entre six gabarits et six palettes.

  // Proximité : le prix et le panier au plus vite. La réassurance monte juste
  // sous la bannière — livraison, MonCash, retours — parce que ce sont les
  // trois questions qu'un acheteur haïtien se pose AVANT de regarder un
  // article, et qu'y répondre plus bas, c'est y répondre trop tard.
  //
  // La galerie et l'inscription ferment la page côté vente : c'est la boucle du
  // commerce de quartier — on montre la boutique vivante sur Instagram, puis on
  // garde le contact pour la prochaine arrivée de marchandise.
  proximite: [
    'announcement', 'hero', 'benefits', 'bestsellers', 'brand_story',
    'categories', 'new_arrivals', 'promotion', 'catalog', 'testimonials',
    'gallery', 'newsletter', 'size_guide', 'shipping', 'whatsapp_help', 'payments', 'faq',
    'contact', 'social',
  ],

  // Social : la nouveauté d'abord, les rayons en médaillons, la preuve par
  // l'image. Le catalogue complet ferme la page — celui qui y arrive cherchait
  // déjà autre chose que ce qu'il avait vu.
  // Le mur de vidéos se place APRÈS les coups de cœur et avant les meilleures
  // ventes : c'est le geste de retrouver un produit vu ailleurs, et il ne sert
  // à rien à celui qui n'a pas encore vu de produit du tout. La bande d'appel
  // ferme la page sur le seul geste que ce trafic fait vraiment — écrire.
  social: [
    'announcement', 'hero', 'categories', 'new_arrivals', 'featured',
    'video_wall', 'bestsellers', 'brand_story', 'gallery',
    'bundles', 'catalog', 'testimonials', 'countdown', 'promotion', 'cta_band', 'shipping',
    'whatsapp_help', 'payments', 'social',
  ],

  // Artisan : la réassurance du fait-main, les créations, puis l'atelier. La
  // fabrication vient APRÈS les pièces : on regarde d'abord, on veut savoir
  // ensuite. L'inverse — l'histoire avant tout — fait une page qu'on quitte
  // avant d'avoir vu un seul objet.
  // Les matières viennent juste après la fabrication : on vient d'expliquer le
  // geste, la question suivante est « avec quoi ». La commande sur mesure
  // ensuite — c'est le panier moyen le plus élevé d'un artisan — et le journal
  // en dernier, pour celui qui n'a pas encore décidé.
  artisan: [
    'announcement', 'hero', 'benefits', 'featured',
    'categories', 'brand_story', 'process', 'ingredients', 'gallery',
    'catalog', 'testimonials', 'order_form', 'journal', 'team', 'shipping',
    'whatsapp_help', 'payments', 'faq', 'newsletter',
  ],

  // Services : la promesse, les chiffres qui la soutiennent, les prestations,
  // la méthode, la preuve, les objections, le rendez-vous. Aucun panier dans
  // cette liste : la vente se termine par une réservation.
  // Les résultats suivent immédiatement la méthode : on vient de dire comment
  // on travaille, la question suivante est « et ça donne quoi ». Les forfaits
  // arrivent après les témoignages, une fois la confiance faite — un tableau de
  // prix montré trop tôt fait comparer avant d'avoir donné envie.
  //
  // Ni meilleures ventes ni rayons ici : « Notre histoire » suit donc le
  // catalogue des prestations, qui en tient lieu.
  services: [
    'announcement', 'hero', 'stats', 'catalog', 'testimonials', 'brand_story', 'process',
    'case_studies', 'video', 'team',
    'packages', 'partners', 'faq', 'whatsapp_help', 'payments', 'contact', 'cta_band', 'social',
  ],

  // Élevage : disponibilité, espèces, catalogue. La réassurance porte ici sur
  // le sanitaire et la livraison, pas sur le style. L'adresse et le téléphone
  // ferment la page — une commande de bétail se conclut de vive voix.
  // Les disponibilités passent AVANT tout le reste du catalogue : c'est la seule
  // question de cet acheteur — « qu'est-ce que vous avez, maintenant ». La
  // grille de gros suit le catalogue, parce qu'elle ne parle qu'à celui qui a
  // déjà vu ce qu'il achète.
  agri: [
    'announcement', 'hero', 'benefits', 'availability',
    'categories', 'catalog', 'bestsellers', 'brand_story', 'wholesale',
    'journal', 'faq', 'shipping', 'whatsapp_help', 'payments', 'order_form', 'contact',
    'location', 'social',
  ],

  // Traiteur : la carte tout de suite, la commande sur mesure juste après —
  // c'est elle qui porte les gâteaux personnalisés et les buffets, donc les
  // paniers moyens les plus élevés. Les événements et l'adresse ensuite.
  // « Aujourd'hui » — les fiches que le marchand a cochées — se pose entre les
  // plus commandés et la carte complète : c'est le plat du jour, et il n'a de
  // sens qu'entouré du reste. Les étapes de commande viennent après le
  // formulaire sur mesure : elles répondent à « et ensuite ? », pas à « quoi ? ».
  traiteur: [
    'announcement', 'hero', 'benefits', 'categories',
    'bestsellers', 'brand_story', 'featured', 'catalog', 'testimonials', 'order_form', 'process',
    'promotion', 'gallery', 'ingredients', 'faq', 'shipping',
    'whatsapp_help', 'payments', 'cta_band', 'contact', 'location',
  ],

  // ── Fashion Atelier (§7) ────────────────────────────────────────────────
  //
  // L'ordre du prêt-à-porter : la campagne, la collection en cours, les
  // nouveautés, un second temps éditorial, les valeurs sûres, la maison, ce
  // qu'en disent les clientes, l'inscription. Le catalogue complet arrive tard
  // — sur ce rayon, on ne cherche pas un article, on parcourt une saison.
  fashion: [
    'announcement', 'hero', 'featured', 'new_arrivals',
    'promotion', 'bestsellers', 'brand_story', 'categories',
    'catalog', 'testimonials', 'size_guide', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],

  // ── Beauty Studio (§8) ──────────────────────────────────────────────────
  //
  // L'ordre du cahier : bannière, meilleures ventes, la maison, rayons,
  // bénéfices, sélection, avis, questions d'usage, inscription. La cosmétique
  // se vend par la preuve — ce que d'autres ont acheté, et pourquoi.
  beauty: [
    'announcement', 'hero', 'bestsellers', 'brand_story', 'categories',
    'benefits', 'featured',
    'ingredients', 'faq', 'catalog', 'testimonials', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],

  // ── Tech Store (§9) ─────────────────────────────────────────────────────
  //
  // Le rayon où l'on compare : un produit à la une tout de suite, les rayons,
  // les valeurs sûres, la réassurance, les avis, puis les réponses aux
  // questions qui bloquent — garantie, livraison, compatibilité.
  tech: [
    'announcement', 'hero', 'featured_product', 'categories', 'bestsellers',
    'brand_story', 'benefits', 'catalog', 'testimonials', 'bundles',
    'partners', 'faq', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],

  // ── Food Market (§10) ───────────────────────────────────────────────────
  //
  // On commande ce qui se voit : les plus demandés d'abord, la maison, les
  // rayons, l'offre du jour, la carte complète, les avis, l'adresse. La
  // section « nous trouver » ferme la page — c'est la dernière question du
  // client qui vient chercher.
  food: [
    'announcement', 'hero', 'bestsellers', 'brand_story', 'categories',
    'promotion', 'catalog', 'testimonials', 'bundles', 'ingredients',
    'shipping', 'whatsapp_help', 'payments', 'contact', 'location',
  ],

  // ── Modern Retail (§11) ─────────────────────────────────────────────────
  //
  // Le polyvalent, et le catalogue est le centre : bannière courte,
  // réassurance, rayons, sélection, meilleures ventes, lots, avis, catalogue.
  retail: [
    'announcement', 'hero', 'benefits', 'categories',
    'featured', 'bestsellers', 'brand_story', 'bundles', 'catalog', 'testimonials', 'faq',
    'shipping', 'whatsapp_help', 'payments', 'contact', 'newsletter',
  ],

  // ── Les neuf gabarits de marque en ligne (§35) ──────────────────────────
  //
  // Ces neuf-là ont un catalogue COURT. L'ordre y compte donc plus qu'ailleurs :
  // sur une page de dix références, le visiteur voit tout, et ce qu'il a lu
  // avant de voir le prix décide de l'achat. C'est l'inverse d'un catalogue de
  // rayon, où l'on cherche un article et où le discours est un obstacle.

  // Compléments : la promesse, ce qui la rend crédible, puis ce que les autres
  // ont acheté. La caution — « notre démarche » — arrive après les meilleures
  // ventes : on la lit pour se rassurer d'un achat qu'on envisage déjà, pas
  // pour se décider à l'envisager.
  wellness: [
    'announcement', 'hero', 'benefits', 'bestsellers', 'brand_story',
    'featured', 'ingredients', 'partners',
    'catalog', 'testimonials', 'faq', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],

  // Soin : même colonne vertébrale, avec les besoins (peau sèche, taches,
  // anti-âge) en rayons juste après le récit. En cosmétique, on n'achète pas
  // une catégorie de produit, on achète une réponse à un besoin.
  skincare: [
    'announcement', 'hero', 'benefits', 'bestsellers', 'brand_story',
    'categories', 'ingredients', 'catalog', 'testimonials',
    'faq', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],

  // Animalerie : la réassurance AVANT la bannière, et c'est le seul gabarit du
  // produit où elle passe devant. On achète ici pour un animal qui ne peut pas
  // dire que le produit lui a fait du mal ; « recommandé par les vétérinaires »
  // n'est pas un argument de bas de page, c'est la condition de l'achat.
  animalerie: [
    'announcement', 'benefits', 'hero', 'categories',
    'bestsellers', 'brand_story', 'promotion', 'featured', 'catalog', 'testimonials',
    'faq', 'shipping', 'whatsapp_help', 'payments', 'contact', 'newsletter',
  ],

  // Mode éditoriale : la campagne, les rayons juste dessous — c'est ce qui la
  // sépare de Fashion Atelier, qui fait attendre ses rayons jusqu'au septième
  // écran — puis les tendances, la sélection, la maison.
  magazine: [
    'announcement', 'hero', 'categories', 'new_arrivals',
    'featured', 'promotion', 'bestsellers', 'brand_story',
    'catalog', 'testimonials', 'size_guide', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],

  // Sport : l'affirmation, ce que le produit fait, ce qui se vend le plus, et
  // les photos de ceux qui l'ont pris. La galerie n'est pas décorative sur ce
  // gabarit : c'est la preuve, et elle vaut tous les avis écrits.
  sport: [
    'announcement', 'hero', 'benefits', 'bestsellers', 'brand_story',
    'featured', 'gallery', 'video', 'catalog', 'testimonials', 'faq',
    'shipping', 'whatsapp_help', 'payments', 'cta_band',
  ],

  // Fait main : les pièces, les collections, puis l'histoire — elle vient
  // aussitôt les rayons montrés, comme sur tous les gabarits, et la fabrication
  // la suit : on vient de dire qui fait, on dit comment.
  maker: [
    'announcement', 'hero', 'benefits',
    'featured', 'categories', 'brand_story', 'process', 'gallery', 'team',
    'catalog', 'testimonials', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],

  // Naturel : les chiffres à la place des avis, tout de suite sous la
  // bannière. C'est la seule différence de fond avec « Compléments », et elle
  // suffit : une marque qui affiche « 97 % de sommeil amélioré » ne se raconte
  // pas de la même façon que celle qui affiche quatre étoiles et demie.
  naturel: [
    'announcement', 'hero', 'stats', 'bestsellers', 'brand_story',
    'benefits', 'featured', 'ingredients',
    'partners', 'catalog', 'testimonials', 'faq', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],

  // Mono-produit : pas de bannière. La fiche EST la page — prix, arguments,
  // bouton — et tout ce qui suit n'existe que pour lever une objection. Le
  // catalogue ferme la marche, pour les deux ou trois variantes qu'une telle
  // marque finit toujours par avoir.
  monoproduit: [
    'announcement', 'featured_product', 'benefits', 'brand_story',
    'process', 'ingredients', 'video', 'faq', 'countdown',
    'cta_band', 'catalog', 'testimonials', 'shipping', 'whatsapp_help', 'payments',
  ],

  // Style Chic : l'ordre exact de sa maquette. Les rayons collent à la
  // bannière, sans titre ; les meilleures ventes ; la ligne de réassurance ;
  // la collection en aplat ; l'histoire ; les avis ; et la barre WhatsApp, qui
  // ferme l'accueil sur la question qu'on n'a pas osé poser. Livraison,
  // paiement et questions fréquentes ont leurs pages : l'accueil s'arrête là.
  // Pas de `whatsapp_help` ici : sa bande d'appel EST déjà cette barre.
  chic: [
    'announcement', 'hero', 'categories', 'bestsellers', 'benefits',
    'promotion', 'brand_story', 'testimonials', 'cta_band',
  ],

  // ── Les trois gabarits historiques ──────────────────────────────────────

  // Le luxe se vend par l'envie puis par la confiance : l'image, une sélection
  // courte, les rayons, l'histoire, et seulement ensuite le catalogue.
  luxe: [
    'hero', 'featured', 'categories', 'brand_story',
    'catalog', 'testimonials', 'faq', 'shipping', 'whatsapp_help', 'payments', 'newsletter',
  ],
  // La conversion se vend par la réassurance : ce que vous vendez, pourquoi
  // vous faire confiance, ce que d'autres en disent, puis tout le reste.
  //
  // C'est le gabarit le plus important du produit, et pour une raison qui n'a
  // rien à voir avec ses qualités : `resolveTemplateId` y retombe pour tout
  // `template_id` vide ou inconnu. Une vitrine créée avant le Store Builder,
  // une ligne dont la colonne n'a jamais été écrite, une clé mal recopiée —
  // toutes atterrissent ici. Il ne peut donc pas être le plus pauvre des
  // vingt-trois : il est celui que le plus grand nombre de marchands voient
  // sans l'avoir choisi.
  //
  // Il suit maintenant l'ordre du commerce de détail (§01) : la réassurance
  // sous la bannière, les rayons, ce qui se vend, les arrivages, la promotion,
  // la preuve, le catalogue, puis tout ce qui répond avant l'achat. Les
  // nouveautés et la promotion sont l'ajout qui compte le plus : un catalogue
  // qui bouge doit pouvoir le montrer, et rien ne le permettait.
  modern: [
    'announcement', 'hero', 'benefits', 'categories',
    'bestsellers', 'brand_story', 'new_arrivals', 'featured', 'promotion', 'bundles',
    'catalog', 'testimonials', 'gallery', 'size_guide', 'faq',
    'shipping', 'whatsapp_help', 'payments', 'contact', 'newsletter', 'social',
  ],
  // Le trafic social n'a pas de patience : les produits au premier écran.
  flash: [
    'announcement', 'countdown', 'categories', 'catalog',
    'bundles', 'promotion', 'bestsellers', 'brand_story', 'shipping', 'whatsapp_help', 'payments', 'social',
  ],
};

/**
 * Les sections qui ne se rendent plus, nulle part.
 *
 * « Présentation & services » (`presentation`) a été retirée de tous les
 * gabarits le 18/09/2026 : elle redisait « Notre histoire » en moins bien. Ses
 * points numérotés sont désormais les « 01 · 02 · 03 » de `BrandStorySection`,
 * et son contenu reste dans le thème — c'est lui qui les porte.
 *
 * La clé reste dans `SECTION_KEYS` parce que des vitrines l'ont enregistrée
 * dans `store_sections` : `resolveSections` l'écarte, et l'éditeur ne la
 * propose plus. Sans cela, un marchand qui a un jour réglé ses sections la
 * verrait encore, seul parmi tous.
 */
const RETIRED_SECTIONS: ReadonlySet<SectionKey> = new Set<SectionKey>(['presentation']);

export function isRetiredSection(key: string): boolean {
  return RETIRED_SECTIONS.has(key as SectionKey);
}

export function presetFor(templateId: TemplateId): SectionKey[] {
  return PRESETS[templateId] ?? PRESETS.retail;
}

// ── Ce que la FICHE PRODUIT reprend de la boutique ──────────────────────────
//
// Le cahier (§16 et les six fiches du §34) demande une fiche produit qui ne
// s'arrête pas au bouton d'achat : sous la galerie viennent les questions du
// rayon. Elles ne sont pas les mêmes selon le métier —
//
//   « Je fais quelle taille ? »              → prêt-à-porter
//   « Qu'est-ce qu'il y a dedans ? »         → cosmétique, complément, plat
//   « Comment cette pièce est-elle faite ? » → artisanat
//   « Et si j'en prends cinquante ? »        → élevage, gros
//   « Comment ça se passe après ? »          → prestation
//   « Comment les autres l'utilisent ? »     → vendeur social
//
// Ce ne sont PAS de nouvelles sections : ce sont celles que le marchand a déjà
// remplies pour sa page d'accueil, reprises là où la vente se décide. Il ne
// saisit rien deux fois, et rien ne peut divergir entre les deux pages.
//
// Trois choses qui manquent volontairement à cette liste : la livraison, le
// paiement et les avis. La fiche les porte déjà — `ProductAssurance` pour les
// deux premiers, `ProductReviews` pour le troisième — et les répéter en
// pleine largeur rallongerait la page sans rien y ajouter.
//
// Une section que le marchand n'a pas remplie ne s'affiche pas : la règle du
// moteur vaut ici comme ailleurs, et c'est ce qui permet de proposer cette
// liste à tous les gabarits sans allonger la fiche de personne.

const PDP_SECTIONS: Partial<Record<TemplateId, SectionKey[]>> = {
  // Les six métiers (§34).
  proximite: ['size_guide', 'faq'],
  social:    ['gallery'],
  artisan:   ['ingredients', 'process', 'faq'],
  services:  ['process', 'faq'],
  agri:      ['wholesale', 'faq'],
  traiteur:  ['ingredients', 'process', 'faq'],

  // Les neuf marques en ligne (§35).
  //
  // Cette liste et les onglets de `storeProductPage.ts` parlent de la même
  // fiche : ce qu'un onglet porte, la liste doit le connaître — sinon la page
  // rend la section en pleine largeur SOUS l'onglet qui la porte déjà, et le
  // marchand lit deux fois sa composition. La déduplication de
  // `products/[id]/page.tsx` s'appuie dessus, et un test tient l'accord.
  wellness:    ['ingredients', 'process', 'faq'],
  skincare:    ['ingredients', 'process', 'faq'],
  animalerie:  ['ingredients', 'faq'],
  magazine:    ['size_guide', 'faq'],
  sport:       ['ingredients', 'process', 'case_studies', 'faq'],
  maker:       ['ingredients', 'process'],
  naturel:     ['ingredients', 'case_studies', 'faq'],
  monoproduit: ['ingredients', 'process', 'faq'],
  chic:        ['size_guide', 'faq'],

  // Les cinq presets de rayon (§33).
  fashion: ['size_guide', 'faq'],
  beauty:  ['ingredients', 'process', 'faq'],
  tech:    ['faq'],
  food:    ['ingredients', 'faq'],
  retail:  ['faq'],
};

/**
 * Les sections que la fiche produit reprend, dans son ordre.
 *
 * Les gabarits historiques n'en ont pas de liste propre et retombent sur les
 * questions fréquentes seules : leurs fiches n'ont jamais rien porté d'autre,
 * et leur en ajouter d'un coup changerait la page d'un marchand qui n'a rien
 * demandé.
 */
export function pdpSectionsFor(templateId: TemplateId): SectionKey[] {
  return PDP_SECTIONS[templateId] ?? ['faq'];
}

// ── La résolution ───────────────────────────────────────────────────────────

export type ResolvedSection = {
  key:      SectionKey;
  position: number;
  enabled:  boolean;
  config:   SectionConfig;
};

export type StoredSection = {
  section_key: string;
  position:    number;
  is_enabled:  boolean;
  config:      unknown;
};

/**
 * L'ordre final des sections d'une vitrine.
 *
 * Le préréglage du gabarit donne la liste et l'ordre ; les lignes enregistrées
 * les remplacent quand elles existent. Une section enregistrée que le gabarit
 * ne prévoyait pas est ajoutée à la fin : changer de gabarit ne fait pas
 * disparaître une section que le marchand avait activée.
 *
 * Ne lève jamais. Une ligne dont la clé n'existe plus est ignorée.
 */
export function resolveSections(
  templateId: TemplateId,
  stored: StoredSection[] | null | undefined,
): ResolvedSection[] {
  const rows = (stored ?? []).filter(
    (r) => isSectionKey(r.section_key) && !isRetiredSection(r.section_key),
  );
  const byKey = new Map(rows.map((r) => [r.section_key as SectionKey, r]));

  const preset = presetFor(templateId);
  const extras = rows
    .map((r) => r.section_key as SectionKey)
    .filter((k) => !preset.includes(k));

  const ordered = [...preset, ...extras];

  return ordered
    .map((key, index) => {
      const row = byKey.get(key);
      return {
        key,
        // La position enregistrée fait foi ; l'index du préréglage sert de
        // repli, décalé de mille pour que les sections jamais touchées
        // conservent leur ordre relatif sans jamais devancer les autres.
        position: row ? row.position : index,
        enabled:  row ? row.is_enabled : true,
        config:   sectionConfigSchema.parse(row?.config ?? {}),
      };
    })
    .sort((a, b) => a.position - b.position);
}

// ── Le vocabulaire d'un gabarit ─────────────────────────────────────────────
//
// « Nos produits » sur la vitrine d'un pâtissier, c'est le mot d'un logiciel de
// gestion, pas celui d'une boutique. Un artisan a des créations, un traiteur
// des spécialités, un prestataire des services — et le marchand ne devrait pas
// avoir à le corriger dans l'éditeur pour que sa page parle sa langue.
//
// Ce ne sont que des DÉFAUTS : le titre saisi par le marchand passe devant, et
// un gabarit sans entrée ici garde le libellé général.
const TITLES: Partial<Record<TemplateId, Partial<Record<SectionKey, string>>>> = {
  proximite: {
    bestsellers:  'Nos meilleures ventes',
    categories:   'Nos catégories',
    catalog:      'Notre boutique',
    new_arrivals: 'Nouveautés',
    shipping:      'Livraison & retrait',
    contact:       'Passer nous voir',
    presentation:  'Ce que nous faisons',
    gallery:       'Découvrez-nous sur Instagram',
    newsletter:    'Ne ratez aucune nouveauté',
  },
  social: {
    featured:     'Coups de cœur du moment',
    shipping:      'Livraison',
    payments:      'Modes de paiement',
    new_arrivals: 'Les nouveautés',
    categories:   'Parcourir',
    catalog:      'Tout le catalogue',
    gallery:      'Vu sur nos réseaux',
    video_wall:    'À voir en vidéo',
    promotion:     'Le drop du moment',
    cta_band:      'Vous avez vu quelque chose sur nos réseaux ?',
  },
  artisan: {
    featured:     'Nos créations',
    categories:   'Nos collections',
    catalog:      'Toutes nos pièces',
    brand_story:  'Notre atelier',
    process:      'Comment nos pièces sont faites',
    gallery:      'L\'atelier en images',
    testimonials: 'Ils portent nos pièces',
    team:          'Les mains derrière les pièces',
    shipping:      'Expédition & retours',
    presentation:  'Notre savoir-faire',
    ingredients:   'Nos matières',
    order_form:    'Une création rien que pour vous',
    journal:       'Le journal de l\'atelier',
  },
  services: {
    catalog:      'Nos services',
    featured:     'Nos formules',
    process:      'Comment ça se passe',
    brand_story:  'À propos',
    testimonials: 'Témoignages de nos clients',
    contact:       'Nous joindre',
    team:          'L\'équipe',
    payments:      'Régler votre séance',
    video:         'Nous voir travailler',
    presentation:  'Nos services',
    packages:      'Nos forfaits',
    case_studies:  'Des résultats concrets',
  },
  agri: {
    categories:   'Nos catégories',
    catalog:      'Nos produits',
    bestsellers:  'Les plus demandés',
    brand_story:  'Notre élevage',
    order_form:   'Demander un devis',
    location:     'Nous trouver',
    shipping:      'Livraison & retrait',
    contact:       'Nous joindre',
    presentation:  'Notre élevage',
    availability:  'Disponibles actuellement',
    wholesale:     'Vous achetez en quantité ?',
    journal:       'Nos conseils d\'élevage',
  },
  traiteur: {
    categories:   'Nos spécialités',
    catalog:      'Notre carte',
    bestsellers:  'Les plus commandés',
    order_form:   'Commandez maintenant',
    gallery:      'Nos réalisations',
    testimonials: 'Ce qu\'en disent nos clients',
    shipping:      'Livraison & retrait',
    ingredients:   'Nos ingrédients',
    contact:       'Nous joindre',
    presentation:  'Ce que nous préparons',
    featured:      'Aujourd\'hui',
    process:       'Comment commander ?',
    cta_band:      'Une occasion spéciale ?',
  },

  // Les huit marques en ligne (§35). Elles parlent d'elles-mêmes plus que les
  // métiers ne le font — « notre démarche » plutôt que « à propos » — parce
  // que c'est précisément ce qu'elles vendent.
  wellness: {
    bestsellers:  'Les plus vendus',
    featured:     'Notre sélection',
    catalog:      'Tous nos produits',
    brand_story:  'Notre démarche',
    testimonials: 'Ce qu\'en disent nos clients',
    ingredients:   'La formule',
    partners:      'Ils nous distribuent',
    presentation:  'Notre approche',
  },
  skincare: {
    bestsellers:  'Nos meilleures ventes',
    categories:   'Par besoin',
    catalog:      'Tous nos soins',
    brand_story:  'Notre philosophie',
    testimonials: 'Les résultats de nos clientes',
    ingredients:   'Nos actifs',
    presentation:  'Notre approche du soin',
  },
  animalerie: {
    categories:   'Par animal',
    bestsellers:  'Les préférés',
    featured:     'Notre sélection',
    catalog:      'Tous nos produits',
    testimonials: 'Ce qu\'en disent leurs maîtres',
    contact:       'Nous joindre',
    shipping:      'Livraison',
    presentation:  'Ce que nous faisons',
  },
  magazine: {
    categories:   'Rayons',
    new_arrivals: 'Tendances du moment',
    featured:     'La sélection',
    catalog:      'Toute la collection',
    brand_story:  'La maison',
    size_guide:    'Guide des tailles',
  },
  sport: {
    bestsellers:  'Nos programmes',
    featured:     'La sélection',
    gallery:      'De vrais résultats',
    catalog:      'Tous nos programmes',
    testimonials: 'Ils l\'ont fait',
    video:         'La séance en vidéo',
    presentation:  'Notre méthode',
  },
  maker: {
    featured:     'Nos pièces',
    categories:   'Nos collections',
    catalog:      'Toute la collection',
    brand_story:  'Notre histoire',
    process:      'Comment c\'est fait',
    gallery:      'Celles et ceux qui les font',
    team:          'Celles et ceux qui font',
    presentation:  'Notre façon de faire',
  },
  naturel: {
    bestsellers:  'Les plus vendus',
    featured:     'Notre sélection',
    catalog:      'Tous nos produits',
    brand_story:  'La science derrière',
    ingredients:   'La formule',
    partners:      'Ils nous accompagnent',
    presentation:  'Notre approche',
  },
  monoproduit: {
    // « Comment ça se passe » n'a pas de sens sur une page qui vend un seul
    // article : ce que le visiteur veut lire à cet endroit, ce sont les
    // raisons de l'acheter.
    process:      'Pourquoi vous allez l\'aimer',
    catalog:      'Aussi disponible',
    testimonials: 'Ce qu\'en disent nos clients',
    ingredients:   'Ce qu\'il y a dedans',
    video:         'Le voir en vrai',
    presentation:  'Pourquoi ce produit',
  },

  chic: {
    bestsellers:  'Meilleures ventes',
    brand_story:  'Notre histoire',
    testimonials: "Ce qu'elles disent",
  },

  // Les cinq presets de rayon parlent la langue générale : « Nos produits »
  // convient à une boutique de meubles comme à une quincaillerie. Ils n'ont
  // donc d'entrée ici que là où la section elle-même impose un mot.
  food: {
    ingredients:   'Nos produits',
    contact:       'Nous joindre',
  },
  fashion: {
    size_guide:    'Guide des tailles',
  },
};

/** Le libellé de départ d'une section sur CE gabarit. */
export function defaultSectionTitle(key: SectionKey, templateId?: TemplateId): string {
  return (templateId && TITLES[templateId]?.[key]) || SECTIONS[key].defaultTitle;
}

/** Le titre affiché : celui du marchand s'il en a mis un, sinon le défaut. */
export function sectionTitle(section: ResolvedSection, templateId?: TemplateId): string {
  return section.config.title.trim() || defaultSectionTitle(section.key, templateId);
}
