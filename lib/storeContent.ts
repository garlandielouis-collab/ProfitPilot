// ─────────────────────────────────────────────────────────────────────────────
// Le contenu de démarrage d'un gabarit
//
// ── Le problème que ce fichier résout ───────────────────────────────────────
//
// Le moteur de sections applique une règle simple : « rien à saisir, rien
// d'affiché ». Elle est juste — une section vide vaut mieux qu'une section qui
// invente. Mais elle a un effet de bord que personne n'avait mesuré : un
// marchand qui vient de créer sa vitrine a un `theme_config` VIDE, donc une
// page d'accueil de cinq sections là où son gabarit en prévoit dix-huit. Il
// n'en voit aucune, ne sait pas qu'elles existent, et conclut que le gabarit
// est pauvre.
//
// C'était mesurable : sur une vitrine réelle, préréglage `modern` — quatorze
// sections — la page en rendait cinq. Les neuf autres attendaient un texte que
// rien ne demandait au marchand d'écrire.
//
// Ici, chaque gabarit porte un contenu de DÉMARRAGE : le texte qu'une boutique
// de ce métier écrirait, dans la voix de ce métier. La page est complète dès la
// première seconde, et le marchand édite au lieu de partir d'une page blanche —
// ce qui est, de très loin, le geste le plus facile des deux.
//
// ── La règle de substitution, et ce qu'elle protège ─────────────────────────
//
// Le contenu du gabarit ne passe JAMAIS devant celui du marchand. Section par
// section :
//
//   le marchand a écrit quelque chose   → on garde le sien, intégralement
//   le marchand a explicitement coupé   → la section reste coupée
//   la section est restée au défaut     → le gabarit la remplit
//
// « A écrit quelque chose » se mesure par différence avec le schéma, pas par
// présence de clé : `saveContent` réenregistre le thème ENTIER à chaque
// sauvegarde, donc toutes les clés existent dès le premier enregistrement. Une
// substitution fondée sur la présence aurait donc disparu au premier « Enregistrer »
// — la page se serait vidée d'un coup, sans que rien ne l'explique.
//
// ── Ce que ce contenu s'interdit ────────────────────────────────────────────
//
// Aucun CHIFFRE d'activité : pas de chiffre d'affaires, pas de stock, pas de
// nombre de commandes, pas de note moyenne. Ces nombres-là appartiennent au
// marchand et à lui seul — c'est la règle qui tient tout le produit, et elle ne
// bouge pas d'un pouce ici.
//
// Ce que ce fichier écrit est du DISCOURS : une promesse, une explication, une
// question fréquente et sa réponse. Rien qu'un marchand ne dirait lui-même, et
// tout est modifiable dans l'éditeur, mot pour mot.
//
// Deux réserves à connaître, parce qu'elles engagent le marchand devant ses
// clients et qu'aucune ligne de code ne peut les lever à sa place :
//
//   `socialProof` porte des AVIS signés de prénoms. Ce sont des exemples de
//   mise en page, pas des clients. Ils s'affichent tant que le marchand n'a
//   pas mis les siens.
//
//   `stats` porte des CHIFFRES DE VENTE — « 7j/7 », « 48 h ». Ce sont des
//   engagements : un marchand qui livre en cinq jours doit corriger la ligne.
//
// Les deux se coupent d'un seul geste : `DEMO_SECTIONS` ci-dessous.
// ─────────────────────────────────────────────────────────────────────────────

// Import de TYPES uniquement, et c'est structurel : `storeTheme` appelle
// `applyContentPreset`, donc une importation de valeur ferait un cycle. Le
// schéma par défaut arrive en argument pour cette raison exacte.
import type { ThemeConfig, TemplateId } from './storeTheme';

/** Un contenu de gabarit : des bouts de sections, jamais une section entière. */
type ContentPreset = {
  [K in keyof ThemeConfig]?: Partial<ThemeConfig[K]>;
};

/**
 * Les deux sections dont le contenu de démarrage ENGAGE le marchand.
 *
 * Un avis signé « Naïka, Pétion-Ville » et un « Réponse en 2 h » ne sont pas
 * du même ordre qu'un texte de présentation : le premier attribue une parole à
 * quelqu'un, le second promet un délai. Les retirer d'ici les fait disparaître
 * de toutes les vitrines qui n'ont pas saisi les leurs, sans toucher au reste.
 */
const DEMO_SECTIONS: Array<keyof ThemeConfig> = ['socialProof', 'stats'];

// ═════════════════════════════════════════════════════════════════════════════
// LE SOCLE
//
// Ce que toute boutique haïtienne dit, quel que soit ce qu'elle vend. Les voix
// ci-dessous le réécrivent là où leur métier parle autrement, et le gardent
// partout ailleurs — une question sur le paiement MonCash se pose dans les
// mêmes termes chez un traiteur et chez un éleveur.
// ═════════════════════════════════════════════════════════════════════════════

const BASE: ContentPreset = {
  announcement: {
    enabled: true,
    text: 'Livraison partout en Haïti · Paiement MonCash, NatCash ou à la livraison',
  },

  hero: {
    headline:    'Commandez en ligne,\nrecevez chez vous.',
    subheadline: 'Parcourez le catalogue, ajoutez au panier et payez avec le moyen qui vous arrange. Une question ? Écrivez-nous, on répond.',
    ctaLabel:    'Voir le catalogue',
  },

  trust: {
    enabled: true,
    badges: [
      { icon: 'truck',   label: 'Livraison rapide',   note: 'Port-au-Prince et régions' },
      { icon: 'card',    label: 'MonCash & NatCash',  note: 'Ou paiement à la livraison' },
      { icon: 'refresh', label: 'Échange possible',   note: 'Produit non conforme' },
      { icon: 'phone',   label: 'On vous répond',     note: 'WhatsApp du lundi au samedi' },
    ],
  },

  presentation: {
    enabled: true,
    intro:
      "Nous vendons ce que nous utilisons nous-mêmes. Chaque article du catalogue "
      + "a été choisi, vérifié et mis en ligne avec son vrai prix — celui que vous "
      + "payez, sans surprise à la livraison.",
    items: [
      // Les titres seuls s'affichent, en « 01 · 02 · 03 » sous « Notre
      // histoire » : ils doivent se lire en trois ou quatre mots.
      { title: 'Sélection soignée',           body: "Le catalogue est court parce qu'il est trié. Ce qui ne nous convainc pas n'y entre pas." },
      { title: 'Prix affichés clairement',    body: "Ce que vous voyez est ce que vous payez. La livraison est annoncée avant la commande, jamais après." },
      { title: 'Service humain sur WhatsApp', body: "Un doute sur une taille, une couleur, un délai ? Écrivez-nous sur WhatsApp avant de commander." },
    ],
  },

  promotion: {
    enabled:  true,
    title:    'Les arrivages du moment',
    subtitle: "Les dernières pièces entrées en boutique. Les quantités sont réelles : quand c'est parti, c'est parti.",
    ctaLabel: 'Découvrir',
    // Relatif à la VITRINE, pas au site : la section le préfixe au rendu avec
    // la base de routage (`storeLink`, components/store/sections/storeLink.ts). Écrit « /products »
    // pour rester lisible dans l'éditeur.
    ctaHref:  '/products',
  },

  brandStory: {
    enabled: true,
    // Le titre s'affiche en grand : c'est une phrase, pas une étiquette. Le
    // surtitre « La maison » au-dessus fait déjà office d'étiquette.
    title:   'Une boutique pensée pour la vraie vie.',
    body:
      "Cette boutique a commencé comme beaucoup commencent ici : quelques articles, "
      + "un téléphone, et des clients qui écrivaient pour demander le prix.\n\n"
      + "Elle a grandi de la même façon — en répondant, en livrant, en recommandant. "
      + "La vitrine que vous lisez n'est que la suite de ça : les mêmes produits, les "
      + "mêmes prix, disponibles sans avoir à écrire pour les connaître.",
  },

  process: {
    enabled: true,
    steps: [
      { title: 'Choisissez',   body: 'Parcourez le catalogue et ajoutez au panier ce qui vous plaît.' },
      { title: 'Commandez',    body: 'Nom, téléphone, adresse. Trois champs, pas de compte à créer.' },
      // Pas de « carte » : aucune passerelle carte n'est branchée, et le tunnel
      // d'achat ne la propose pas. Un préréglage ne promet que ce qui existe.
      { title: 'Payez',        body: 'MonCash, NatCash, ou en espèces à la livraison.' },
      { title: 'Recevez',      body: 'On vous confirme sur WhatsApp et on vous livre.' },
    ],
  },

  socialProof: {
    enabled: true,
    items: [
      { author: 'Naïka, Pétion-Ville',   text: "Commandé le matin, reçu le lendemain. Le produit correspond exactement aux photos.", rating: 5 },
      { author: 'Jean-Robert, Delmas',   text: "J'ai posé mes questions sur WhatsApp avant de payer, on m'a répondu tout de suite.", rating: 5 },
      { author: 'Mirlande, Cap-Haïtien', text: "La livraison en province a pris deux jours, comme annoncé. Rien à redire.", rating: 5 },
    ],
  },

  stats: {
    enabled: true,
    items: [
      { value: '7j/7',  label: 'On vous répond',   note: 'WhatsApp' },
      { value: '48 h',  label: 'Livraison capitale', note: 'Après confirmation' },
      { value: '3',     label: 'Moyens de paiement', note: 'MonCash, NatCash, espèces' },
      { value: '100 %', label: 'Prix annoncés',   note: 'Livraison comprise' },
    ],
  },

  gallery: {
    enabled: true,
    caption: "La boutique, les arrivages, les commandes qui partent. Suivez-nous pour voir passer les nouveautés.",
  },

  faq: {
    enabled: true,
    items: [
      { question: 'Comment puis-je payer ?',
        answer:   "MonCash, NatCash, ou en espèces à la livraison. Vous choisissez au moment de la commande — aucun moyen de paiement n'est obligatoire pour parcourir le catalogue." },
      { question: 'Combien coûte la livraison ?',
        answer:   "Le tarif dépend de votre zone et s'affiche AVANT que vous validiez la commande, jamais après. Pour les zones éloignées, écrivez-nous : on vous donne le montant exact avant que vous payiez quoi que ce soit." },
      { question: 'En combien de temps je reçois ma commande ?',
        answer:   "Dans la zone métropolitaine, comptez 24 à 48 heures après confirmation. En province, deux à quatre jours selon la destination. On vous prévient sur WhatsApp dès que la commande part." },
      { question: 'Et si le produit ne me convient pas ?',
        answer:   "Signalez-le le jour de la réception, photo à l'appui. Un article abîmé, non conforme ou trompé de référence est échangé ou remboursé — c'est notre erreur, pas la vôtre." },
      { question: 'Est-ce que je peux commander sans compte ?',
        answer:   "Oui. Le formulaire de commande demande votre nom, votre téléphone et votre adresse. Rien d'autre, et aucun mot de passe à retenir." },
      { question: 'Comment vous joindre ?',
        answer:   "Par WhatsApp, c'est le plus rapide. Le bouton est présent sur chaque page. Vous pouvez aussi appeler aux horaires indiqués plus bas." },
    ],
  },

  shipping: {
    enabled: true,
    note:    "Livraison dans la zone métropolitaine et en province. Le tarif exact s'affiche à la commande, selon la zone que vous indiquez.",
    returns:
      "Un article abîmé, non conforme à sa description ou livré par erreur est repris. "
      + "Signalez-le le jour de la réception, avec une photo, et on procède à l'échange "
      + "ou au remboursement. Les articles d'hygiène et les produits alimentaires ne "
      + "peuvent pas être repris une fois ouverts.",
  },

  payments: {
    enabled: true,
    note:    "Payez de la façon qui vous arrange. Rien n'est prélevé tant que la commande n'est pas confirmée.",
  },

  contact: {
    enabled: true,
    body:    "Une question avant de commander ? Écrivez-nous sur WhatsApp, c'est le plus rapide — on répond aux horaires ci-dessous.",
    hours: [
      { days: 'Lundi — Vendredi', hours: '8 h 00 — 17 h 00' },
      { days: 'Samedi',           hours: '9 h 00 — 14 h 00' },
      { days: 'Dimanche',         hours: 'Fermé' },
    ],
  },

  newsletter: {
    enabled: true,
    body:    "Recevez un message quand un nouvel arrivage entre en boutique. Pas plus d'un par semaine, et vous vous désinscrivez d'un clic.",
  },

  ctaBand: {
    enabled:  true,
    title:    'Une question avant de commander ?',
    body:     "Écrivez-nous. On répond aux vraies questions — taille, délai, disponibilité — avant que vous payiez.",
    ctaLabel: 'Nous écrire',
    ctaHref:  '/products',
  },

  orderForm: {
    enabled:  true,
    title:    'Une commande particulière ?',
    body:     "Une quantité importante, une demande sur mesure, une date précise : dites-nous ce qu'il vous faut et on vous répond avec un prix.",
    ctaLabel: 'Envoyer ma demande',
    askDate:  true,
  },

  video: {
    enabled: true,
    body:    "Une minute pour voir les produits en vrai — les couleurs, les dimensions, la finition. Ce qu'une photo ne rend jamais complètement.",
  },

  partners: {
    enabled: true,
    items: [
      { name: 'MonCash',    logoUrl: null },
      { name: 'NatCash',    logoUrl: null },
      { name: 'Visa',       logoUrl: null },
      { name: 'Mastercard', logoUrl: null },
    ],
  },

  team: {
    enabled: true,
    members: [
      { name: 'Le comptoir',   role: 'Conseil et commandes',   photoUrl: null },
      { name: 'La livraison',  role: 'Capitale et province',   photoUrl: null },
      { name: "L'atelier",     role: 'Préparation et contrôle', photoUrl: null },
    ],
  },

  journal: {
    enabled: true,
    items: [
      { title: 'Comment choisir sans se tromper',   excerpt: "Les trois questions à se poser avant de commander, et ce qu'on regarde nous-mêmes avant de mettre un article en ligne.", date: '', href: '', imageUrl: null },
      { title: 'Ce qui arrive ce mois-ci',          excerpt: "Les nouveautés entrées en boutique, et pourquoi on les a choisies plutôt que d'autres.", date: '', href: '', imageUrl: null },
      { title: "Livraison : ce qu'il faut savoir",  excerpt: "Zones, délais, tarifs. Tout ce qu'on nous demande sur WhatsApp, réuni en une page.", date: '', href: '', imageUrl: null },
    ],
  },

  sizeGuide: {
    enabled: true,
    note:    "Mesurez un article qui vous va bien, à plat, et comparez au tableau. En cas de doute entre deux tailles, prenez la plus grande.",
    columns: 'Taille · Poitrine (cm) · Taille (cm) · Hanches (cm)',
    rows: [
      { cells: 'S · 88 · 72 · 94' },
      { cells: 'M · 94 · 78 · 100' },
      { cells: 'L · 100 · 84 · 106' },
      { cells: 'XL · 108 · 92 · 114' },
      { cells: 'XXL · 116 · 100 · 122' },
    ],
  },

  ingredients: {
    enabled: true,
    body:    "Ce qui entre dans le produit, et à quoi ça sert. Si une composition vous manque, demandez-la : on l'ajoute.",
    items: [
      { name: 'Composition',  role: "Indiquée sur chaque fiche produit, telle qu'elle figure sur l'emballage." },
      { name: 'Origine',      role: "Nous précisons d'où vient le produit quand l'information est disponible." },
      { name: 'Conservation', role: "À garder à l'abri de la chaleur et de l'humidité, hors de portée des enfants." },
      { name: 'Précautions',  role: "En cas d'allergie connue, lisez la composition complète avant usage." },
    ],
  },

  wholesale: {
    enabled: true,
    body:    "Vous achetez pour revendre, pour une entreprise ou pour un événement ? Le prix baisse avec la quantité.",
    tiers: [
      { quantity: '1 — 9 unités',   price: 'Prix boutique', note: 'Sans engagement' },
      { quantity: '10 — 49 unités', price: 'Remise revendeur', note: 'Sur demande' },
      { quantity: '50 unités et +', price: 'Sur devis',     note: 'Réponse sous 24 h' },
    ],
    ctaLabel: 'Demander un devis',
  },

  packages: {
    enabled: true,
    body:    "Trois formules, un même sérieux. Vous pouvez changer à tout moment.",
    items: [
      { name: 'Essentiel', price: 'Sur devis', period: '', body: "Pour démarrer, sans engagement.", features: "Premier échange\nDiagnostic de départ\nRéponse sous 48 h", ctaLabel: 'En savoir plus', ctaHref: '', featured: false },
      { name: 'Complet',   price: 'Sur devis', period: '', body: "La formule la plus demandée.",   features: "Tout l'Essentiel\nSuivi régulier\nRéponse prioritaire\nCompte-rendu écrit", ctaLabel: 'En savoir plus', ctaHref: '', featured: true },
      { name: 'Sur mesure', price: 'Sur devis', period: '', body: "Quand rien de standard ne convient.", features: "Périmètre défini ensemble\nInterlocuteur dédié\nDisponibilité étendue", ctaLabel: 'Nous écrire', ctaHref: '', featured: false },
    ],
  },

  caseStudies: {
    enabled: true,
    body:    "Deux situations réelles, racontées simplement : le point de départ, ce qui a changé.",
    items: [
      { client: 'Un commerce de quartier', before: "Toutes les commandes passaient par WhatsApp, une par une, et le stock se comptait de tête.", after: "Le catalogue est en ligne, les commandes arrivent avec l'adresse déjà écrite, et le stock se met à jour tout seul.", quote: "Je passe mes matinées à préparer, plus à recompter.", imageUrl: null },
      { client: 'Une petite marque',       before: "Une page Instagram, de belles photos, et aucun moyen de payer sans écrire.", after: "La même page, avec un lien qui encaisse. Les clients commandent la nuit, sans que personne ait à répondre.", quote: "Les ventes du week-end ont doublé sans un message de plus.", imageUrl: null },
    ],
  },

  videoWall: {
    enabled: true,
    body:    "Les produits en mouvement, filmés à la boutique.",
  },

  availability: {
    enabled: true,
    note:    "Ce qui est réellement disponible aujourd'hui. La liste change au fil des arrivages — écrivez-nous pour réserver.",
  },

  urgency: {
    enabled: false,
    message: "Offre valable jusqu'à la fin de la semaine",
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// LES VOIX
//
// Six métiers, six façons de parler. Une voix ne réécrit que ce que son métier
// dit autrement : le reste du socle passe tel quel — la question « comment je
// paie » se pose dans les mêmes mots chez tout le monde.
// ═════════════════════════════════════════════════════════════════════════════

/** 01 · Boutique — l'achat rapide. Le prix, le panier, la livraison. */
const V_BOUTIQUE: ContentPreset = {
  hero: {
    headline:    'Votre style.\nVotre boutique.\nVotre choix.',
    subheadline: "Nouveautés, meilleures ventes et essentiels du quotidien. Commandez depuis votre téléphone, payez comme vous voulez, recevez chez vous.",
    ctaLabel:    'Découvrir la boutique',
  },
  presentation: {
    title: 'Pourquoi acheter ici',
    intro: "Une boutique de quartier qui a mis son rayon en ligne. Les mêmes articles, les mêmes prix, la même personne au bout du téléphone.",
    items: [
      { title: 'Produits sélectionnés', body: "On ne met en ligne que ce qu'on vendrait à un proche. Le catalogue est trié, pas empilé." },
      { title: 'Prix accessibles',      body: "Le prix affiché est le prix payé. La livraison s'ajoute au moment de la commande, annoncée d'avance." },
      { title: 'Livraison fiable',      body: "Capitale et province. On confirme le départ sur WhatsApp, vous savez quand attendre." },
      { title: 'Service WhatsApp',      body: "Une question sur une taille ou une couleur ? La réponse arrive avant que vous payiez." },
    ],
  },
  promotion: {
    title:    'Nouvelle collection',
    subtitle: "Les dernières pièces arrivées en boutique. Voyez-les avant qu'elles partent.",
    ctaLabel: 'Découvrir la collection',
  },
};

/** 02 · Social — le désir et l'urgence. On arrive d'une story. */
const V_SOCIAL: ContentPreset = {
  announcement: {
    enabled: true,
    text: '🔥 Nouveautés chaque semaine · Quantités limitées · Commandez sur WhatsApp',
  },
  hero: {
    headline:    'Les tendances\nsont ici.',
    subheadline: "Ce que tout le monde découvre en ce moment. Les quantités sont réelles et elles partent vite.",
    ctaLabel:    'Voir les nouveautés',
  },
  presentation: {
    title: 'Comment ça marche',
    intro: "Vous avez vu un article passer sur Instagram ou TikTok ? Il est ici, avec son prix. Pas besoin d'écrire pour le demander.",
    items: [
      { title: 'Vu sur les réseaux',  body: "Tout ce qui passe sur nos pages est dans le catalogue, au même prix." },
      { title: 'Quantités réelles',   body: "Quand une pièce est marquée disponible, elle l'est. On ne fait pas de fausse rareté." },
      { title: 'Commande en 2 min',   body: "Panier, nom, téléphone, adresse. Ou une capture d'écran sur WhatsApp, comme vous préférez." },
    ],
  },
  promotion: {
    title:    'La sélection de la semaine',
    subtitle: "Renouvelée chaque semaine. Ce qui reste de la précédente est marqué comme tel.",
    ctaLabel: 'Voir la sélection',
  },
  ctaBand: {
    enabled:  true,
    title:    "Vous avez vu quelque chose sur Instagram ?",
    body:     "Envoyez-nous simplement la capture d'écran sur WhatsApp. On retrouve l'article, on vous donne le prix, et c'est réglé.",
    ctaLabel: 'Commander sur WhatsApp',
  },
  videoWall: {
    enabled: true,
    body:    "Les articles filmés, en vrai. Ce qu'une photo retouchée ne montre jamais.",
  },
  urgency: {
    enabled: false,
    message: 'La sélection change dimanche soir',
  },
};

/** 03 · Artisan — l'histoire, la matière, le geste. */
const V_ARTISAN: ContentPreset = {
  announcement: {
    enabled: true,
    text: 'Pièces façonnées à la main · Commandes sur mesure acceptées',
  },
  hero: {
    headline:    "Des créations uniques,\nune histoire vraie.",
    subheadline: "Des pièces façonnées une par une, avec patience et avec des matières choisies. Aucune n'est tout à fait identique à une autre.",
    ctaLabel:    'Découvrir la collection',
  },
  presentation: {
    title: 'Notre engagement',
    intro: "Nous ne fabriquons pas des objets. Nous faisons des pièces, et chacune porte la trace de la main qui l'a faite.",
    items: [
      { title: 'Fait à la main',      body: "Chaque pièce est façonnée à l'atelier. Les petites différences entre deux exemplaires ne sont pas des défauts : c'est la preuve." },
      { title: 'Matières choisies',   body: "Bois, fibres, perles, métal : nous savons d'où vient ce que nous employons, et nous le disons." },
      { title: 'Sur mesure possible', body: "Une dimension, une couleur, une gravure : dites-nous, et nous étudions la demande." },
    ],
  },
  brandStory: {
    enabled: true,
    title:   'Derrière chaque pièce, une personne',
    body:
      "L'atelier a commencé avec un établi, quelques outils et beaucoup d'essais ratés. "
      + "Les premières pièces sont parties chez des proches, qui en ont parlé autour d'eux.\n\n"
      + "Rien n'a vraiment changé depuis, sinon le nombre de mains. On travaille toujours "
      + "à la commande, on prend toujours le temps qu'il faut, et on préfère toujours "
      + "livrer une semaine plus tard qu'une pièce à moitié finie.",
  },
  process: {
    enabled: true,
    title:   'De la matière à la pièce',
    steps: [
      { title: 'La matière',   body: "On choisit le bois, la fibre ou la perle. C'est là que la pièce se décide, avant le premier geste." },
      { title: "L'atelier",    body: "Découpe, montage, ajustement. La partie longue, celle qui ne se voit pas sur la photo finale." },
      { title: 'La finition',  body: "Ponçage, huile, polissage. C'est ce qui sépare une pièce faite d'une pièce finie." },
      { title: 'Le contrôle',  body: "Chaque pièce est reprise en main avant l'emballage. Ce qui ne passe pas ne part pas." },
    ],
  },
  ingredients: {
    enabled: true,
    title:   'Les matières',
    body:    "Ce que nous employons, et pourquoi.",
    items: [
      { name: 'Bois local',        role: "Travaillé sec, huilé à la main. Il fonce avec le temps — c'est normal et c'est beau." },
      { name: 'Fibres naturelles', role: "Tressées à la main. Chaque tressage a sa tension propre, donc son grain propre." },
      { name: 'Perles choisies',   role: "Triées une par une avant montage. Les irrégulières sont écartées." },
      { name: 'Métal',             role: "Sans nickel, pour que la pièce se porte au contact de la peau sans réaction." },
    ],
  },
  orderForm: {
    enabled:  true,
    title:    'Une création rien que pour vous',
    body:     "Une dimension particulière, une couleur, une gravure, une pièce à offrir pour une date précise : décrivez ce que vous avez en tête, on vous répond avec un prix et un délai.",
    ctaLabel: 'Commander cette création',
    askDate:  true,
  },
  socialProof: {
    enabled: true,
    items: [
      { author: 'Fabiola, Jacmel',        text: "J'ai commandé une pièce sur mesure pour un mariage. Le rendu était au-delà de ce que j'avais imaginé.", rating: 5 },
      { author: 'Patrick, Port-au-Prince', text: "On sent que c'est fait à la main. Ça n'a rien à voir avec ce qu'on trouve ailleurs.", rating: 5 },
      { author: 'Chantal, Les Cayes',      text: "Le délai annoncé a été tenu, et l'emballage était soigné jusqu'au dernier détail.", rating: 5 },
    ],
  },
};

/** 04 · Services — pas de panier. Une prise de rendez-vous. */
const V_SERVICES: ContentPreset = {
  announcement: {
    enabled: true,
    text: 'Premier échange sans engagement · Séances en présentiel ou à distance',
  },
  hero: {
    headline:    'Votre réussite\ncommence ici.',
    subheadline: "Accompagnement, conseil et formation pour avancer sur ce qui compte vraiment. Le premier échange sert à savoir si nous sommes les bonnes personnes.",
    ctaLabel:    'Réserver un échange',
  },
  presentation: {
    title: 'Ce que nous faisons',
    intro: "Nous travaillons avec des personnes qui savent où elles veulent aller mais pas encore par où passer. Notre travail commence là.",
    items: [
      { title: 'Un diagnostic honnête', body: "Le premier échange sert à comprendre votre situation. S'il n'y a rien à faire, nous le disons." },
      { title: 'Un plan écrit',         body: "Vous repartez avec des étapes concrètes, pas avec des principes généraux." },
      { title: 'Un suivi réel',         body: "Entre deux séances, vous pouvez écrire. Une question qui attend trois semaines ne sert plus à rien." },
    ],
  },
  stats: {
    enabled: true,
    items: [
      { value: '1 h',   label: 'Premier échange',   note: 'Sans engagement' },
      { value: '48 h',  label: 'Réponse à un message', note: 'Jours ouvrés' },
      { value: '100 %', label: 'Plan écrit',       note: 'Après chaque séance' },
      { value: '3',     label: 'Formules',         note: 'Ou sur mesure' },
    ],
  },
  process: {
    enabled: true,
    title:   'Comment ça se passe',
    steps: [
      { title: 'Réservez',            body: "Choisissez un créneau. Le premier échange dure une heure et ne vous engage à rien." },
      { title: 'Échangeons',          body: "Vous exposez la situation, nous posons les questions qui manquent." },
      { title: 'Construisons',        body: "Nous vous remettons un plan d'action écrit, avec des étapes datées." },
      { title: 'Avancez',             body: "Nous suivons l'exécution et corrigeons ce qui doit l'être en cours de route." },
    ],
  },
  ctaBand: {
    enabled:  true,
    title:    "Prêt à passer à l'action ?",
    body:     "Le premier échange dure une heure, ne coûte rien et sert d'abord à savoir si nous pouvons vraiment vous aider.",
    ctaLabel: 'Réserver maintenant',
  },
  faq: {
    enabled: true,
    items: [
      { question: 'Comment se déroule une séance ?',
        answer:   "Une heure, en présentiel ou à distance. Vous exposez la situation, nous posons des questions, et vous repartez avec des étapes écrites — pas avec des notes à recopier." },
      { question: 'Combien coûte un accompagnement ?',
        answer:   "Cela dépend du périmètre et de la durée. Les formules ci-dessus donnent le cadre ; le prix exact est fixé après le premier échange, quand nous savons ce qu'il y a à faire." },
      { question: 'Puis-je annuler ou déplacer un rendez-vous ?',
        answer:   "Oui, jusqu'à 24 heures avant. Passé ce délai, la séance est due — le créneau a été réservé pour vous et n'a pas pu être proposé à quelqu'un d'autre." },
      { question: 'Travaillez-vous à distance ?',
        answer:   "Oui, et cela ne change rien à la méthode. Une bonne partie de nos accompagnements se fait entièrement par visioconférence et messages." },
      { question: 'Que se passe-t-il si ça ne marche pas ?',
        answer:   "Nous le disons avant de commencer. Si le premier échange montre que le besoin est ailleurs, nous ne vendons pas une formule pour vendre une formule." },
    ],
  },
  packages: {
    enabled: true,
    title:   'Nos formules',
    body:    "Trois cadres possibles. Le premier échange sert justement à savoir lequel vous convient — ou s'il en faut un quatrième.",
    items: [
      { name: 'Découverte', price: 'Sur devis', period: 'la séance', body: "Une séance, un diagnostic, un plan.", features: "1 séance d'une heure\nDiagnostic écrit\nPlan d'action daté\nRéponse aux questions sous 48 h", ctaLabel: 'Réserver', ctaHref: '', featured: false },
      { name: 'Accompagnement', price: 'Sur devis', period: 'par mois', body: "La formule la plus choisie.", features: "2 séances par mois\nSuivi écrit entre les séances\nAccès direct par message\nBilan mensuel", ctaLabel: 'Réserver', ctaHref: '', featured: true },
      { name: 'Sur mesure', price: 'Sur devis', period: '', body: "Pour une équipe ou un projet précis.", features: "Périmètre défini ensemble\nDisponibilité étendue\nInterventions sur site possibles\nCompte-rendu à chaque étape", ctaLabel: 'Nous écrire', ctaHref: '', featured: false },
    ],
  },
  team: {
    enabled: true,
    title:   "Qui vous accompagne",
    members: [
      { name: "L'accompagnement", role: 'Séances et suivi',        photoUrl: null },
      { name: 'Le conseil',       role: 'Diagnostic et méthode',   photoUrl: null },
      { name: 'La formation',     role: 'Sessions collectives',    photoUrl: null },
    ],
  },
  orderForm: {
    enabled:  true,
    title:    'Prendre rendez-vous',
    body:     "Dites-nous en deux lignes où vous en êtes et quand vous êtes disponible. On vous propose un créneau.",
    ctaLabel: 'Réserver une séance',
    askDate:  true,
  },
};

/** 05 · Élevage — la disponibilité, les données techniques, le téléphone. */
const V_AGRI: ContentPreset = {
  announcement: {
    enabled: true,
    text: 'Arrivages réguliers · Vente à l\'unité et par lots · Livraison possible',
  },
  hero: {
    headline:    'Des animaux sains,\npour une production meilleure.',
    subheadline: "Volailles, porcs, bovins et caprins, selon les arrivages. Suivi sanitaire assuré, conseil au téléphone, vente à l'unité comme par lots.",
    ctaLabel:    'Voir les disponibilités',
  },
  trust: {
    enabled: true,
    badges: [
      { icon: 'shield',  label: 'Suivi sanitaire',   note: 'Vaccination à jour' },
      { icon: 'truck',   label: 'Livraison possible', note: 'Selon la quantité' },
      { icon: 'clock',   label: 'Vente par lots',    note: 'Prix dégressif' },
      { icon: 'phone',   label: 'Conseil au téléphone', note: 'Avant la commande' },
    ],
  },
  presentation: {
    title: 'Nous savons ce que nous vendons',
    intro: "Chaque animal vient de nos parcs ou de partenaires que nous connaissons. Nous pouvons dire ce qu'il a mangé, quel âge il a, et ce qu'il a reçu.",
    items: [
      { title: 'Alimentation suivie', body: "Ration connue et régulière. Nous indiquons ce que l'animal a reçu depuis son arrivée." },
      { title: 'Vaccination à jour',  body: "Le calendrier sanitaire est tenu. Nous vous le communiquons avant la vente, pas après." },
      { title: 'Origine tracée',      body: "Nous savons d'où vient chaque lot. Une question sur la provenance trouve toujours une réponse." },
      { title: 'Conseil inclus',      body: "Premier achat, changement d'espèce, montée en volume : appelez avant de commander." },
    ],
  },
  availability: {
    enabled: true,
    title:   'Disponibles actuellement',
    note:    "Ce que nous avons en parc aujourd'hui. Les quantités bougent vite — appelez pour réserver avant de vous déplacer.",
  },
  wholesale: {
    enabled: true,
    title:   'Vous achetez en quantité ?',
    body:    "Le prix baisse avec le volume. Au-delà de cinquante têtes, nous établissons un devis qui tient compte du transport.",
    tiers: [
      { quantity: '1 — 20 têtes',   price: 'Prix unitaire', note: 'Retrait sur place' },
      { quantity: '21 — 50 têtes',  price: 'Prix dégressif', note: 'Livraison négociable' },
      { quantity: '51 têtes et +',  price: 'Sur devis',     note: 'Transport inclus' },
    ],
    ctaLabel: 'Demander un devis',
  },
  process: {
    enabled: true,
    title:   'Comment commander',
    steps: [
      { title: 'Appelez',   body: "Dites-nous l'espèce, la quantité et la date. Nous confirmons ce qui est réellement disponible." },
      { title: 'Réservez',  body: "Un acompte réserve le lot. Sans acompte, nous ne pouvons pas garantir la quantité." },
      { title: 'Contrôlez', body: "Venez voir les animaux avant l'enlèvement, ou demandez des photos si vous êtes loin." },
      { title: 'Enlevez',   body: "Retrait à la ferme ou livraison selon le volume et la distance." },
    ],
  },
  faq: {
    enabled: true,
    items: [
      { question: 'Puis-je voir les animaux avant d\'acheter ?',
        answer:   "Oui, et nous le recommandons. Prévenez-nous par téléphone pour que quelqu'un soit disponible pour vous recevoir." },
      { question: 'Vendez-vous en petite quantité ?',
        answer:   "Oui. La vente à l'unité est possible sur la plupart des espèces. Le prix par tête baisse à partir de vingt et une têtes." },
      { question: 'Assurez-vous la livraison ?',
        answer:   "Selon la quantité et la distance. Pour un petit nombre, le retrait à la ferme reste le plus simple. Au-delà, nous organisons le transport et l'intégrons au devis." },
      { question: 'Les animaux sont-ils vaccinés ?',
        answer:   "Le calendrier sanitaire est tenu et nous vous le communiquons avant la vente. Demandez-le systématiquement : c'est votre droit et c'est notre pratique." },
      { question: 'Comment se passe le paiement ?',
        answer:   "Un acompte réserve le lot, le solde se règle à l'enlèvement. MonCash, NatCash ou espèces." },
    ],
  },
  journal: {
    enabled: true,
    title:   'Conseils',
    items: [
      { title: 'Comment choisir un poulet de qualité', excerpt: "Ce qu'on regarde en premier : le plumage, la vivacité, le poids réel plutôt que l'apparence.", date: '', href: '', imageUrl: null },
      { title: 'Préparer l\'arrivée de vos animaux',   excerpt: "L'espace, l'eau, la litière et l'alimentation à prévoir avant l'enlèvement, pas après.", date: '', href: '', imageUrl: null },
      { title: 'Quelle alimentation choisir',          excerpt: "Les rations selon l'âge et l'objectif, et les erreurs qui coûtent le plus cher.", date: '', href: '', imageUrl: null },
    ],
  },
  orderForm: {
    enabled:  true,
    title:    'Demander un lot',
    body:     "Indiquez l'espèce, la quantité et la date souhaitée. Nous confirmons la disponibilité et le prix par retour.",
    ctaLabel: 'Demander ce lot',
    askDate:  true,
  },
  ctaBand: {
    enabled:  true,
    title:    'Une commande importante ?',
    body:     "Au-delà de cinquante têtes, appelez-nous directement. Le devis tient compte du transport et de la date.",
    ctaLabel: 'Nous appeler',
  },
  socialProof: {
    enabled: true,
    items: [
      { author: 'Wilner, Croix-des-Bouquets', text: "J'achète par lots depuis un moment. Les quantités annoncées sont toujours les bonnes.", rating: 5 },
      { author: 'Rosemène, Arcahaie',         text: "On m'a conseillée au téléphone avant mon premier achat. Ça m'a évité une erreur.", rating: 5 },
      { author: 'Jonas, Léogâne',             text: "Livraison organisée pour une commande importante, tout est arrivé en bon état.", rating: 5 },
    ],
  },
};

/** 06 · Traiteur — la carte, la date, la commande sur mesure. */
const V_TRAITEUR: ContentPreset = {
  announcement: {
    enabled: true,
    text: 'Commandes du jour jusqu\'à 11 h · Gâteaux et buffets sur commande',
  },
  hero: {
    headline:    'Des saveurs\nqui font plaisir.',
    subheadline: "Plats faits maison, gâteaux personnalisés et buffets pour vos moments importants. Commandez la veille, on s'occupe du reste.",
    ctaLabel:    'Voir la carte',
  },
  trust: {
    enabled: true,
    badges: [
      { icon: 'clock',   label: 'Préparé du jour',  note: 'Rien de la veille' },
      { icon: 'truck',   label: 'Livraison chaude', note: 'Zone métropolitaine' },
      { icon: 'card',    label: 'MonCash & NatCash', note: 'Ou à la livraison' },
      { icon: 'phone',   label: 'Devis événement',  note: 'Réponse le jour même' },
    ],
  },
  presentation: {
    title: 'Notre cuisine',
    intro: "Tout est préparé le jour même, à la commande. C'est pour cela que nous demandons une date : nous ne cuisinons pas d'avance.",
    items: [
      { title: 'Fait maison',         body: "Préparé sur place, le jour de la livraison. Aucun plat n'est réchauffé d'une veille." },
      { title: 'Sur commande',        body: "Gâteaux, buffets, coffrets : dites-nous la date et le nombre de personnes, on s'adapte." },
      { title: 'Livré chaud',         body: "Dans la zone métropolitaine, les plats partent emballés pour arriver à température." },
    ],
  },
  process: {
    enabled: true,
    title:   'Comment commander',
    steps: [
      { title: 'Choisissez',        body: "La carte du jour ou une commande sur mesure — gâteau, buffet, coffret." },
      { title: 'Date et heure',     body: "Indiquez quand vous voulez être servi. Comptez 24 h pour un plat, 72 h pour un gâteau." },
      { title: 'Livraison ou retrait', body: "Vous passez chercher, ou nous livrons dans la zone métropolitaine." },
      { title: 'Payez et recevez',  body: "MonCash, NatCash ou à la livraison. On confirme sur WhatsApp." },
    ],
  },
  orderForm: {
    enabled:  true,
    title:    'Votre gâteau, votre histoire',
    body:     "Nombre de parts, parfum, décoration, message à écrire, date et heure de livraison : donnez-nous les détails, on vous répond avec un prix ferme.",
    ctaLabel: 'Commander maintenant',
    askDate:  true,
  },
  ingredients: {
    enabled: true,
    title:   "Ce qu'il y a dedans",
    body:    "Les allergènes courants sont signalés sur chaque fiche. En cas d'allergie sévère, prévenez-nous avant de commander.",
    items: [
      { name: 'Œufs et laitages',   role: "Présents dans la plupart des pâtisseries. Des versions sans sont possibles sur commande." },
      { name: 'Gluten',             role: "Présent dans les préparations à base de farine de blé." },
      { name: 'Arachides et noix',  role: "Certaines décorations en contiennent. Signalez-nous toute allergie à la commande." },
      { name: 'Conservation',       role: "Nos plats se consomment dans les 24 h. Les gâteaux se gardent au frais 48 h." },
    ],
  },
  faq: {
    enabled: true,
    items: [
      { question: 'Combien de temps à l\'avance dois-je commander ?',
        answer:   "Un plat de la carte : la veille, avant 11 h. Un gâteau personnalisé : trois jours. Un buffet d'événement : une semaine, pour que nous puissions réserver la matière." },
      { question: 'Livrez-vous ?',
        answer:   "Oui, dans la zone métropolitaine. Le tarif dépend du quartier et s'affiche à la commande. Le retrait sur place est possible et gratuit." },
      { question: 'Puis-je personnaliser un gâteau ?',
        answer:   "Oui : nombre de parts, parfum, couleur, décoration et message. Passez par le formulaire de commande sur mesure, on vous répond avec un prix ferme." },
      { question: 'Faites-vous les événements ?',
        answer:   "Anniversaires, mariages, réunions d'entreprise, baptêmes. Dites-nous la date et le nombre de couverts, nous établissons un devis." },
      { question: 'Gérez-vous les allergies ?',
        answer:   "Les allergènes courants sont signalés. Pour une allergie sévère, prévenez-nous AVANT de commander : nous préférons refuser une commande que prendre un risque." },
    ],
  },
  ctaBand: {
    enabled:  true,
    title:    'Une occasion spéciale ?',
    body:     "Anniversaire, mariage, réunion d'entreprise : dites-nous la date et le nombre de personnes. On s'occupe du reste.",
    ctaLabel: 'Demander un devis',
  },
  socialProof: {
    enabled: true,
    items: [
      { author: 'Marjorie, Delmas',      text: "Le gâteau d'anniversaire était exactement comme demandé, et livré à l'heure.", rating: 5 },
      { author: 'Ricardo, Pétion-Ville', text: "Buffet pour trente personnes, tout est arrivé chaud et bien présenté.", rating: 5 },
      { author: 'Nadège, Tabarre',       text: "Je commande le midi depuis des mois. La qualité ne bouge pas.", rating: 5 },
    ],
  },
  gallery: {
    enabled: true,
    caption: "Les plats du jour, les gâteaux livrés, les buffets dressés. Ce que nous avons servi cette semaine.",
  },
};

/** Une marque en ligne : catalogue court, vendu par le discours. */
const V_MARQUE: ContentPreset = {
  hero: {
    headline:    'Moins de produits.\nMieux choisis.',
    subheadline: "Un catalogue court, assumé, où chaque référence a une raison d'être là. Nous préférons trois produits qui tiennent leurs promesses à trente qui les font.",
    ctaLabel:    'Découvrir',
  },
  presentation: {
    title: 'Notre promesse',
    intro: "Nous ne sortons un produit que lorsqu'il apporte quelque chose que les autres n'apportent pas. C'est pour cela que le catalogue est court.",
    items: [
      { title: 'Formulé, pas assemblé', body: "Chaque référence a été pensée pour un usage précis, pas déclinée pour remplir une gamme." },
      { title: 'Composition lisible',   body: "Ce qu'il y a dedans est écrit, en clair, sur chaque fiche. Sans mot savant destiné à impressionner." },
      { title: 'Testé avant vente',     body: "Nous utilisons ce que nous vendons, longtemps, avant de le proposer." },
    ],
  },
  brandStory: {
    enabled: true,
    title:   'Pourquoi cette marque existe',
    body:
      "Nous cherchions un produit simple, honnête, dont la composition tienne sur une ligne. "
      + "Nous ne l'avons pas trouvé.\n\n"
      + "Alors nous l'avons fait. La gamme est restée courte volontairement : chaque nouvelle "
      + "référence doit justifier sa place, sinon elle ne sort pas.",
  },
  process: {
    enabled: true,
    title:   'Comment nous travaillons',
    steps: [
      { title: 'On cherche',  body: "Un besoin réel, mal couvert. C'est le point de départ, jamais une tendance." },
      { title: 'On formule',  body: "Le moins d'ingrédients possible, chacun justifié par ce qu'il apporte." },
      { title: 'On teste',    body: "Sur la durée, en usage réel, avant toute mise en vente." },
      { title: 'On assume',   body: "Composition affichée, origine annoncée, prix expliqué." },
    ],
  },
  ctaBand: {
    enabled:  true,
    title:    'Commencez par un seul produit',
    body:     "Pas besoin de tout prendre. Choisissez celui qui répond à votre besoin, et jugez sur pièce.",
    ctaLabel: 'Voir le catalogue',
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// LA CARTE DES GABARITS
//
// Chaque gabarit part d'une voix, et n'ajoute que ce qui le distingue vraiment.
// Un gabarit qui n'ajoute rien n'est pas un oubli : sa voix lui suffit, et lui
// écrire un texte différent pour la seule raison qu'il porte un autre nom
// serait la définition du remplissage.
// ═════════════════════════════════════════════════════════════════════════════

const BY_TEMPLATE: Record<TemplateId, ContentPreset[]> = {
  // ── Les six métiers ───────────────────────────────────────────────────────
  proximite: [V_BOUTIQUE],
  social:    [V_SOCIAL],
  artisan:   [V_ARTISAN],
  services:  [V_SERVICES],
  agri:      [V_AGRI],
  traiteur:  [V_TRAITEUR],

  // ── Les huit marques en ligne ─────────────────────────────────────────────
  wellness: [V_MARQUE, {
    hero: {
      headline:    'Prenez soin de vous,\nsimplement.',
      subheadline: "Des produits pensés pour un usage quotidien, avec des compositions courtes et lisibles.",
      ctaLabel:    'Découvrir la gamme',
    },
  }],

  skincare: [V_MARQUE, {
    hero: {
      headline:    'Une peau qu\'on\nn\'agresse pas.',
      subheadline: "Des soins courts, sans surcharge, formulés pour être utilisés tous les jours sans lassitude ni réaction.",
      ctaLabel:    'Découvrir les soins',
    },
    ingredients: {
      enabled: true,
      title:   'Ce qu\'il y a dedans',
      body:    "La liste complète figure sur chaque produit. Voici ce qui revient partout, et à quoi ça sert.",
      items: [
        { name: 'Agents hydratants', role: "Retiennent l'eau dans la peau. C'est la base de tout le reste." },
        { name: 'Huiles végétales',  role: "Nourrissent sans occlure. Choisies pour ne pas laisser de film gras." },
        { name: 'Sans parfum ajouté', role: "Le parfum est la première cause de réaction. Nous n'en ajoutons pas." },
        { name: 'Testé dermatologiquement', role: "Sur peaux sensibles, avant mise en vente." },
      ],
    },
  }],

  animalerie: [V_BOUTIQUE, {
    hero: {
      headline:    'Ce qu\'il faut\npour vos animaux.',
      subheadline: "Alimentation, soins et accessoires choisis avec des vétérinaires. Parce qu'un animal ne peut pas dire que le produit lui a fait du mal.",
      ctaLabel:    'Voir les produits',
    },
    presentation: {
      title: 'Pourquoi nous faire confiance',
      intro: "Nous vendons à des gens qui achètent pour quelqu'un qui ne peut pas se plaindre. Cela nous oblige.",
      items: [
        { title: 'Choisi avec des vétérinaires', body: "Chaque référence alimentaire est validée avant d'entrer au catalogue." },
        { title: 'Composition affichée',         body: "Ce que contient la ration est écrit sur la fiche, pas seulement sur le sac." },
        { title: 'Conseil avant vente',          body: "Âge, poids, espèce : dites-nous, on vous oriente vers le bon produit." },
      ],
    },
  }],

  magazine: [V_BOUTIQUE, {
    hero: {
      headline:    'La collection\nde la saison.',
      subheadline: "Les pièces qui définissent le moment, présentées comme elles se portent.",
      ctaLabel:    'Voir la collection',
    },
  }],

  sport: [V_MARQUE, {
    hero: {
      headline:    'Ça commence\nquand vous décidez.',
      subheadline: "Des équipements qui tiennent à l'usage. Pas de promesse de performance : du matériel qui ne lâche pas.",
      ctaLabel:    'Voir l\'équipement',
    },
    presentation: {
      title: 'Ce que ça change',
      intro: "Un équipement se juge après trois mois, pas en photo. C'est le seul critère qui nous intéresse.",
      items: [
        { title: 'Testé à l\'usage',  body: "En conditions réelles, sur la durée, avant d'entrer au catalogue." },
        { title: 'Réparable',         body: "Nous privilégions ce qui se répare à ce qui se remplace." },
        { title: 'Conseil de taille', body: "Un doute ? Écrivez-nous avant de commander, c'est plus simple qu'un échange." },
      ],
    },
  }],

  maker: [V_ARTISAN, {
    hero: {
      headline:    'Fait ici,\npar des mains d\'ici.',
      subheadline: "Une coopérative d'artisans. Chaque pièce vendue fait vivre l'atelier qui l'a faite — et nous vous disons lequel.",
      ctaLabel:    'Voir les pièces',
    },
  }],

  naturel: [V_MARQUE, {
    hero: {
      headline:    'Ce que la nature\nfait déjà bien.',
      subheadline: "Des produits d'origine naturelle, avec des compositions courtes et une origine annoncée.",
      ctaLabel:    'Découvrir',
    },
  }],

  monoproduit: [V_MARQUE, {
    hero: {
      headline:    'Un seul produit.\nBien fait.',
      subheadline: "Nous n'en vendons qu'un, et c'est délibéré. Toute notre attention va au même endroit.",
      ctaLabel:    'Voir le produit',
    },
    presentation: {
      title: 'Pourquoi un seul',
      intro: "Une gamme large dilue l'attention. Nous avons préféré concentrer la nôtre sur une seule chose et la faire correctement.",
      items: [
        { title: 'Une seule référence', body: "Pas de version « premium » qui laisse entendre que l'autre est moins bonne." },
        { title: 'Amélioré, pas décliné', body: "Chaque révision remplace la précédente. Nous ne vendons pas deux générations en même temps." },
        { title: 'Prix unique',         body: "Un produit, un prix. Le seul choix qui vous reste est la quantité." },
      ],
    },
  }],

  // ── Les cinq presets de rayon ─────────────────────────────────────────────
  fashion: [V_BOUTIQUE, {
    hero: {
      headline:    'La pièce\nqui fait la tenue.',
      subheadline: "Une sélection courte, renouvelée à chaque saison. Guide des tailles détaillé pour commander juste du premier coup.",
      ctaLabel:    'Voir la collection',
    },
  }],

  beauty: [V_MARQUE, {
    hero: {
      headline:    'Votre routine,\nen plus simple.',
      subheadline: "Des soins choisis pour aller ensemble, avec des compositions écrites en clair.",
      ctaLabel:    'Découvrir les soins',
    },
  }],

  tech: [V_BOUTIQUE, {
    hero: {
      headline:    'Le bon appareil,\nau bon prix.',
      subheadline: "Caractéristiques complètes, garantie annoncée, et quelqu'un au bout du téléphone si vous hésitez entre deux modèles.",
      ctaLabel:    'Voir le catalogue',
    },
    presentation: {
      title: 'Avant d\'acheter',
      intro: "Un appareil se choisit sur ses caractéristiques, pas sur sa photo. Elles sont toutes indiquées.",
      items: [
        { title: 'Fiches complètes', body: "Capacité, compatibilité, contenu de la boîte : tout est écrit sur la fiche." },
        { title: 'Garantie annoncée', body: "La durée est indiquée avant l'achat, et nous l'appliquons." },
        { title: 'Conseil avant achat', body: "Hésitation entre deux modèles ? Écrivez-nous, on vous dit lequel correspond à votre usage." },
      ],
    },
  }],

  food: [V_TRAITEUR, {
    hero: {
      headline:    'Le marché,\nlivré chez vous.',
      subheadline: "Produits frais, épicerie et plats préparés. Commandez le matin, recevez dans la journée.",
      ctaLabel:    'Voir le marché',
    },
  }],

  retail: [V_BOUTIQUE, {
    hero: {
      headline:    'Tout ce qu\'il vous faut,\nau même endroit.',
      subheadline: "Un catalogue large, des prix clairs et une livraison qui suit. Commandez ce dont vous avez besoin, quand vous en avez besoin.",
      ctaLabel:    'Parcourir le catalogue',
    },
  }],

  // ── Les trois gabarits historiques ────────────────────────────────────────
  //
  // `modern` est la valeur de repli du produit : c'est le gabarit que porte
  // toute vitrine dont le `template_id` est vide ou inconnu. C'est donc lui
  // qui doit être le plus complet des trois, et non le plus pauvre.
  luxe: [V_MARQUE, {
    hero: {
      headline:    'Le choix,\navant la quantité.',
      subheadline: "Une sélection restreinte, présentée comme elle le mérite.",
      ctaLabel:    'Découvrir la sélection',
    },
  }],

  modern: [V_BOUTIQUE, {
    hero: {
      headline:    'Choisissez, commandez,\nrecevez.',
      subheadline: "Le catalogue complet, les prix à jour, et la livraison annoncée avant que vous payiez. Rien de plus compliqué que ça.",
      ctaLabel:    'Voir la boutique',
    },
  }],

  flash: [V_SOCIAL, {
    hero: {
      headline:    'Ça part vite.',
      subheadline: "Le catalogue en entier, dès le premier écran. Pas de détour : ce qui est affiché est disponible.",
      ctaLabel:    'Tout voir',
    },
  }],
};

// ═════════════════════════════════════════════════════════════════════════════
// LA SUBSTITUTION
// ═════════════════════════════════════════════════════════════════════════════

/** Fusionne des bouts de sections, le dernier gagnant. */
function merge(layers: ContentPreset[]): ContentPreset {
  const out: Record<string, Record<string, unknown>> = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      out[key] = { ...(out[key] ?? {}), ...(value as Record<string, unknown>) };
    }
  }
  return out as ContentPreset;
}

/** Le contenu de démarrage d'un gabarit. Ne lève jamais. */
export function contentPresetFor(templateId: TemplateId | string): ContentPreset {
  const layers = BY_TEMPLATE[templateId as TemplateId] ?? BY_TEMPLATE.retail;
  return merge([BASE, ...layers]);
}

/** Égalité structurelle, suffisante pour du JSON de configuration. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameValue(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/**
 * Le marchand a-t-il écrit quelque chose dans cette section ?
 *
 * Mesuré par différence avec le schéma, jamais par présence de clé — voir
 * l'en-tête. `enabled` et `title` ne comptent pas : une section cochée sans
 * texte ne rend rien, et un titre seul non plus.
 */
function merchantWrote(current: unknown, fallback: unknown): boolean {
  if (!current || typeof current !== 'object') return false;
  const cur = current as Record<string, unknown>;
  const def = (fallback ?? {}) as Record<string, unknown>;

  return Object.keys(cur).some((k) =>
    k !== 'enabled' && k !== 'title' && !sameValue(cur[k], def[k]));
}

/**
 * Pose le contenu du gabarit là où le marchand n'a rien écrit.
 *
 * Appelée par `parseThemeConfig`, donc au seul endroit où un thème entre dans
 * l'application — et ses trois appelants (`buildStorefrontContext`,
 * `toStoreView`, l'éditeur) voient par construction exactement la même page.
 * C'est la condition pour que l'éditeur ne mente pas sur ce que le visiteur
 * verra, et la raison de ne pas câbler la substitution appelant par appelant.
 *
 * @param defaults Le thème au schéma, qui sert de référence pour savoir si le
 *                 marchand a écrit quelque chose. Passé en argument et non
 *                 importé : voir la note sur le cycle, en tête de fichier.
 * @param demo  Faux pour retirer les deux sections qui engagent le marchand
 *              (avis signés, chiffres de vente). Voir `DEMO_SECTIONS`.
 */
export function applyContentPreset(
  theme: ThemeConfig,
  templateId: TemplateId | string,
  defaults: ThemeConfig,
  demo = true,
): ThemeConfig {
  const preset = contentPresetFor(templateId);
  const out = { ...theme } as Record<string, unknown>;

  for (const [key, value] of Object.entries(preset)) {
    if (!demo && DEMO_SECTIONS.includes(key as keyof ThemeConfig)) continue;

    const current  = (theme as Record<string, unknown>)[key];
    const fallback = (defaults as Record<string, unknown>)[key];

    // Le marchand a écrit : on ne touche à rien.
    if (merchantWrote(current, fallback)) continue;

    // Le marchand a coupé une section que le schéma allume : on respecte. Sans
    // cette ligne, décocher « Questions fréquentes » sur une vitrine qui n'a
    // pas encore ses questions n'aurait aucun effet visible — la section
    // reviendrait avec le texte du gabarit, et le marchand recliquerait.
    const cur = (current ?? {}) as Record<string, unknown>;
    const def = (fallback ?? {}) as Record<string, unknown>;
    if (cur.enabled === false && def.enabled === true) continue;

    // `enabled: true` par défaut — mais le contenu du gabarit garde le dernier
    // mot s'il a dit explicitement le contraire.
    //
    // Le bug que cette ligne corrige : `urgency` est posée à `enabled: false`
    // dans le socle, parce qu'un compte à rebours sans date de fin n'a aucun
    // sens et qu'aucune date ne peut être inventée à la place du marchand.
    // Forcer `true` après avoir étalé le preset allumait donc les vingt-deux
    // gabarits contre l'intention écrite trois cents lignes plus haut.
    const wanted = value as Record<string, unknown>;
    out[key] = {
      ...cur,
      ...wanted,
      enabled: 'enabled' in wanted ? wanted.enabled : true,
    };
  }

  return out as ThemeConfig;
}
