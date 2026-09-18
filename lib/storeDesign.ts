// ─────────────────────────────────────────────────────────────────────────────
// La direction artistique d'un gabarit
//
// Le design system fournit les primitives ; le gabarit fournit l'identité (§24
// du cahier de refonte). Ce fichier est la charnière entre les deux : il dit,
// pour chaque gabarit, comment le système doit être réglé.
//
// ── Pourquoi ce fichier existe ──────────────────────────────────────────────
//
// Avant lui, la différence entre deux gabarits tenait dans une poignée de
// `if (variant === 'luxe')` dispersés dans six composants. Résultat : trois
// boutiques qui étaient le même site avec trois palettes — exactement ce que le
// §6 interdit. Et surtout, ajouter un quatrième gabarit demandait de rouvrir
// ces six composants.
//
// Ici, un gabarit est une LIGNE DE DONNÉES : sa densité de grille, le cadrage
// de ses photos, son rythme vertical, la forme de ses boutons, la composition
// de sa bannière. Les composants lisent des variables CSS, jamais le nom du
// gabarit — sauf là où la composition elle-même change (une bannière éditoriale
// n'est pas une bannière immersive avec d'autres marges).
//
// ── Le cadrage des photos, qui est le vrai sujet ────────────────────────────
//
// `cover` remplit le cadre en rognant : c'est ce qu'il faut pour une
// photographie de mise en scène, où le sujet occupe déjà l'image. `contain`
// pose le produit entier dans le cadre et laisse de l'air autour : c'est ce
// qu'il faut pour une photo de produit détouré, où le sujet est petit et
// centré. Utiliser `cover` partout — l'erreur d'avant — donne des flacons
// coupés en deux et des téléphones en gros plan sur un coin d'écran.
//
// Le `pad` complète : même en `contain`, un produit collé aux bords de sa
// vignette paraît à l'étroit. Les rayons cosmétique et électronique respirent ;
// la mode, dont les images sont des plans larges, ne respire pas — elle remplit.
// ─────────────────────────────────────────────────────────────────────────────

import type { TemplateId } from './storeTheme';

// ── Vocabulaire ─────────────────────────────────────────────────────────────

/** La peau de la carte produit (§5). Une par intention de rayon. */
export type CardStyle =
  | 'minimal' | 'editorial' | 'fashion' | 'beauty' | 'tech' | 'compact'
  // Les trois peaux des gabarits métier (§34).
  | 'service'    // une prestation : durée, à partir de, « Réserver »
  | 'wholesale'  // un lot : unité, prix de gros, « Commander »
  | 'social';    // un produit tendance : étiquette, note, prix, ajout direct

/** La composition de la bannière (§7 à §11, §34). */
export type HeroStyle =
  | 'editorial' | 'split' | 'immersive' | 'card' | 'compact'
  | 'feature'   // photo pleine largeur, discours calé à gauche, réassurance dessous
  | 'social'    // aplat sombre, photo à droite, pastilles d'arguments flottantes
  | 'pro';      // photo sombre, promesse, prise de rendez-vous, chiffres attenants

/** La structure de l'en-tête. */
export type NavStyle = 'centered' | 'classic' | 'compact' | 'action';

/**
 * Le bouton que l'en-tête porte à droite, sur les métiers dont la vente ne
 * commence pas par un panier.
 *
 *   'none'     rien — le panier suffit
 *   'booking'  « Prendre rendez-vous » : la conversion d'un prestataire
 *   'phone'    le numéro, cliquable — un éleveur se commande au téléphone
 */
export type NavCta = 'none' | 'booking' | 'phone';

/**
 * La forme des rayons.
 *
 *   'tiles'   vignettes photo — on choisit une catégorie parce qu'elle est belle
 *   'chips'   pastilles de texte — on sait déjà ce qu'on cherche
 *   'circles' médaillons ronds — la grammaire des stories, pour le trafic social
 *   'tabs'    onglets posés au-dessus du catalogue — un menu, une liste d'espèces
 */
export type CategoryStyle = 'tiles' | 'chips' | 'circles' | 'tabs';

/**
 * Une entrée du socle de navigation mobile (§4).
 *
 *   'home'          l'accueil
 *   'catalog'       le catalogue — son libellé change avec le métier
 *   'categories'    ouvre le tiroir des rayons, celui de l'en-tête
 *   'search'        la page catalogue, dont le champ de recherche est en haut
 *   'cart'          ouvre le tiroir du panier
 *   'availability'  le catalogue filtré sur ce qui est réellement en stock
 *   'book'          la prise de rendez-vous
 *   'whatsapp'      la conversation, pré-remplie
 *   'call'          le numéro, composé
 *   'checkout'      la commande — le panier vide, il renvoie au catalogue
 */
export type DockItem =
  | 'home' | 'catalog' | 'categories' | 'search' | 'cart'
  | 'availability' | 'book' | 'whatsapp' | 'call' | 'checkout';

/**
 * Ce que le tunnel de commande doit demander en plus, selon le métier (§6).
 *
 *   'none'         rien de plus : le panier classique suffit
 *   'delivery'     une date et une heure de LIVRAISON — un gâteau, un buffet
 *   'appointment'  une date et une heure de RENDEZ-VOUS — une prestation
 *
 * La différence entre les deux dernières n'est pas cosmétique : « Pour quand
 * voulez-vous être livré ? » et « Quel créneau vous arrange ? » ne se répondent
 * pas de la même façon, et le marchand ne lit pas la même chose sur sa commande.
 */
export type CheckoutSchedule = 'none' | 'delivery' | 'appointment';

/**
 * La forme de la preuve sociale (§12).
 *
 *   'cards'      trois cartes bordées — le rendu neutre, celui du commerce
 *   'editorial'  une citation en grand, les suivantes en colonne dessous ;
 *                la typographie de titre, aucun cadre, beaucoup d'air
 *   'band'       une bande qui défile au doigt, vignettes courtes et nombreuses
 *   'ledger'     des lignes, pas des cartes : nom, ce qui a été commandé, note.
 *                Ce qu'un acheteur professionnel lit — une liste de références
 */
export type ProofStyle = 'cards' | 'editorial' | 'band' | 'ledger';

/** Comment une photo est posée dans son cadre. */
export type MediaFit = 'cover' | 'contain';

export type MediaRule = {
  /** Le rapport du cadre, en notation CSS : « 4 / 5 ». */
  ratio: string;
  fit:   MediaFit;
  /** L'air autour du produit, en pourcentage du cadre. 0 → l'image touche les bords. */
  pad:   number;
};

export type DesignProfile = {
  id: TemplateId;

  card: CardStyle;
  hero: HeroStyle;
  nav:  NavStyle;
  navCta: NavCta;
  /** Vrai quand l'en-tête est un aplat de la couleur de structure. */
  headerDark: boolean;
  categories: CategoryStyle;

  /** Le cadrage en grille (cartes) et en fiche produit (galerie). */
  media:    MediaRule;
  mediaPdp: MediaRule;

  grid: {
    mobile:  1 | 2;
    tablet:  2 | 3;
    desktop: 3 | 4;
    /** L'espace entre deux cartes, en pixels. */
    gap:     number;
  };

  radius: {
    card:   number;
    media:  number;
    button: number;
    input:  number;
  };

  /** Le rythme vertical : ce qui sépare deux sections. */
  space: { section: number; sectionLg: number };

  type: {
    /** Taille du titre de bannière, mobile puis grand écran. */
    h1: number; h1Lg: number;
    /** Taille d'un titre de section. */
    h2: number; h2Lg: number;
    /** Le nom du produit sur sa carte. */
    cardTitle: number;
    /** Titres en capitales et lettrage écarté — la signature du prêt-à-porter. */
    upper: boolean;
    tracking: number;
    /** Le petit sur-titre au-dessus des titres de section. */
    eyebrow: boolean;
  };

  /** L'ombre portée des cartes. Recette maison : jamais du noir pur. */
  shadow:      string;
  shadowHover: string;

  /**
   * Vrai quand la carte porte la note moyenne du produit.
   *
   * Jamais une note par défaut : un produit sans avis publié n'affiche rien
   * (§29). Le drapeau dit seulement « ce gabarit a de la place pour elle » —
   * c'est la présence d'avis réels qui décide de l'affichage.
   */
  showRating: boolean;

  /**
   * La forme que prend la preuve sociale.
   *
   * Elle manquait, et c'était le dernier endroit où les vingt-deux gabarits se
   * ressemblaient vraiment : une même grille de trois cartes bordées, du
   * prestataire au vendeur social. Or un avis ne se montre pas de la même façon
   * selon ce qu'il cautionne. Chez un artisan, c'est une phrase qu'on lit — elle
   * mérite d'être grande et seule. Chez un vendeur social, c'est un volume — dix
   * vignettes qui défilent disent « beaucoup de monde » mieux que trois pavés.
   * Chez un éleveur, c'est une référence — le nom, la ville, la commande.
   */
  proof: ProofStyle;

  /** Vrai quand la carte montre sa seconde photo au survol (§27). */
  hoverSwap: boolean;

  /** Vrai quand le bouton d'ajout n'apparaît qu'au survol, sur grand écran. */
  hoverAction: boolean;

  /** Vrai quand les sections apparaissent au défilement. */
  reveal: boolean;

  /**
   * Le téléphone, qui n'est pas un grand écran réduit (§4).
   *
   * Un socle de trois ou quatre entrées remplace la navigation complète, et
   * la fiche produit porte un bouton collant dont le VERBE change avec le
   * métier : on ajoute au panier chez un commerçant, on réserve chez un
   * prestataire, on demande un lot chez un éleveur. « Ajouter au panier »
   * partout ferait de six métiers une seule boutique.
   *
   * Les entrées dont la destination n'existe pas chez CE marchand — pas de
   * WhatsApp, aucun rayon créé — ne s'affichent pas : le socle rétrécit,
   * il ne pointe pas dans le vide.
   */
  mobile: {
    dock: DockItem[];
    /** Le verbe du bouton collant de la fiche produit (§5). */
    cta:  string;
    /** Le mot que CE métier emploie pour son catalogue. Court : c'est un socle. */
    catalogLabel: string;
  };

  /**
   * Le tunnel de commande, adapté à ce que le métier vend (§6).
   *
   * Un panier classique suffit à un commerçant. Il ne suffit pas à un
   * pâtissier — dont la commande vaut une date — ni à un artisan — dont la
   * pièce se personnalise — ni à un éleveur, dont l'acheteur veut un prix
   * pour trente têtes avant de commander une seule.
   *
   * Tout ce qui est demandé ici part dans les NOTES de la commande, que le
   * marchand lit sur sa fiche. Rien ne modifie le montant : un prix calculé à
   * partir d'une case cochée serait un prix que la caisse ne confirmerait pas.
   */
  checkout: {
    schedule: CheckoutSchedule;
    /** Un champ libre de personnalisation : gravure, message, dimensions. */
    customisation: boolean;
    /** La conversation WhatsApp est proposée AVANT le formulaire. */
    whatsappFirst: boolean;
    /** Le tunnel propose de demander un prix pour une quantité supérieure. */
    quote: boolean;
    /**
     * La fiche produit porte un « Acheter maintenant » à côté du panier.
     *
     * Il n'a de sens que là où l'achat est un réflexe — un commerçant, un
     * vendeur social, un traiteur. Sur une prestation ou un lot de bétail, il
     * n'y a rien à acheter en un geste : il y a un rendez-vous à prendre ou un
     * prix à demander.
     */
    buyNow: boolean;
  };
};

// ── Les profils ─────────────────────────────────────────────────────────────
//
// Six gabarits métier (§34), huit gabarits de marque en ligne (§35), cinq
// presets de rayon (§33) et trois gabarits historiques, ces derniers conservés
// parce que des vitrines en production les portent : `template_id` est du texte
// libre en base, et un marchand ne doit pas voir sa boutique changer d'identité
// parce que nous avons renommé une clé.

const PROFILES: Record<TemplateId, DesignProfile> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // Les six gabarits métier (§34)
  //
  // Ils ne sont pas six variantes d'une même page. Ce qui les sépare est ce qui
  // sépare six métiers : ce qu'on regarde en premier, ce qu'on doit savoir
  // avant de payer, et par quel geste la commande part.
  //
  //   Proximité   je veux voir le prix et ajouter au panier, tout de suite
  //   Social      j'arrive d'une story, je veux la nouveauté avant tout
  //   Artisan     je paie une pièce unique, je veux savoir qui l'a faite
  //   Services    je n'achète pas un objet, je réserve un créneau
  //   Élevage     je commande un lot, il me faut poids, âge, prix dégressif
  //   Traiteur    je commande pour une date, et la photo décide de tout
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. Boutique de proximité ────────────────────────────────────────────
  //
  // Mobile d'abord, et littéralement : l'essentiel du trafic d'un commerçant
  // haïtien arrive d'un téléphone, souvent sur une connexion comptée. D'où
  // deux colonnes dès le plus petit écran, un rythme vertical court, aucune
  // apparition au défilement — la page charge d'un bloc et se parcourt au
  // pouce. La note figure sur la carte : dans un commerce de quartier, la
  // recommandation est le premier argument, avant le prix.
  proximite: {
    id: 'proximite',
    card: 'minimal', hero: 'feature', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '4 / 5', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 5', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 18 },
    radius: { card: 14, media: 12, button: 10, input: 10 },
    space:  { section: 44, sectionLg: 72 },
    type:   { h1: 34, h1Lg: 54, h2: 20, h2Lg: 27, cardTitle: 14,
              upper: false, tracking: -0.01, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(20,27,34,0.06)',
    shadowHover: '0 10px 24px -10px rgba(20,27,34,0.20)',
    showRating: true,
    proof: 'cards',
    hoverSwap: true, hoverAction: false, reveal: false,
    mobile: { dock: ['home', 'categories', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Boutique' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: true },
  },

  // ── 2. Vendeur social ───────────────────────────────────────────────────
  //
  // Le visiteur vient de voir le produit chez quelqu'un. Il n'a pas de
  // patience et il n'a pas de question : il veut retrouver l'article et
  // partir. En-tête sombre, rayons en médaillons ronds — la grammaire qu'il
  // vient de quitter — cartes rondes, boutons pleinement arrondis, et aucune
  // apparition différée : sur ce trafic, une section qui se dévoile est une
  // section qu'on a déjà dépassée.
  social: {
    id: 'social',
    card: 'social', hero: 'social', nav: 'classic',
    navCta: 'none', headerDark: true, categories: 'circles',
    media:    { ratio: '1 / 1', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '1 / 1', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 16 },
    radius: { card: 16, media: 14, button: 999, input: 999 },
    space:  { section: 40, sectionLg: 64 },
    type:   { h1: 34, h1Lg: 56, h2: 20, h2Lg: 27, cardTitle: 14,
              upper: false, tracking: -0.02, eyebrow: false },
    shadow:      '0 1px 3px 0 rgba(22,11,36,0.08)',
    shadowHover: '0 14px 30px -12px rgba(22,11,36,0.28)',
    showRating: true,
    proof: 'band',
    hoverSwap: true, hoverAction: false, reveal: false,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Acheter maintenant', catalogLabel: 'Tendances' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: true, quote: false, buyNow: true },
  },

  // ── 3. Créateur / artisan ───────────────────────────────────────────────
  //
  // Une pièce faite main se vend au prix de son histoire. Le gabarit donne
  // donc ce que les autres refusent : de l'air (cent pixels entre deux
  // sections), une typographie éditoriale, des angles presque droits, aucune
  // ombre portée franche. Les sections apparaissent au défilement — ici, la
  // lenteur fait partie de l'objet.
  artisan: {
    id: 'artisan',
    card: 'minimal', hero: 'feature', nav: 'centered',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '1 / 1', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 5', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 24 },
    radius: { card: 6, media: 4, button: 4, input: 4 },
    space:  { section: 60, sectionLg: 100 },
    type:   { h1: 36, h1Lg: 58, h2: 22, h2Lg: 30, cardTitle: 15,
              upper: false, tracking: 0.01, eyebrow: true },
    shadow:      '0 1px 2px 0 rgba(58,42,27,0.06)',
    shadowHover: '0 12px 28px -14px rgba(58,42,27,0.24)',
    showRating: true,
    proof: 'editorial',
    hoverSwap: true, hoverAction: false, reveal: true,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Commander cette pièce', catalogLabel: 'Collection' },
    checkout: { schedule: 'none', customisation: true, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 4. Prestataire de services ──────────────────────────────────────────
  //
  // La seule vitrine du lot qui ne vend pas un objet. Sa conversion n'est pas
  // un panier mais un rendez-vous, et c'est pour cela que l'en-tête porte un
  // bouton : sur une page qu'on lit longtemps, l'action doit rester à portée
  // sans qu'on remonte. Photos en 4/3, format d'une personne au travail —
  // c'est le prestataire qu'on achète, pas un produit détouré.
  services: {
    id: 'services',
    card: 'service', hero: 'pro', nav: 'action',
    navCta: 'booking', headerDark: false, categories: 'chips',
    media:    { ratio: '4 / 3', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 3', fit: 'cover', pad: 0 },
    grid:   { mobile: 1, tablet: 2, desktop: 4, gap: 20 },
    radius: { card: 12, media: 10, button: 8, input: 8 },
    space:  { section: 52, sectionLg: 84 },
    type:   { h1: 36, h1Lg: 56, h2: 21, h2Lg: 28, cardTitle: 15,
              upper: false, tracking: -0.01, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(15,42,74,0.06)',
    shadowHover: '0 12px 26px -12px rgba(15,42,74,0.22)',
    showRating: true,
    proof: 'editorial',
    hoverSwap: false, hoverAction: false, reveal: true,
    mobile: { dock: ['home', 'catalog', 'book'], cta: 'Réserver', catalogLabel: 'Services' },
    checkout: { schedule: 'appointment', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 5. Élevage et bétail ────────────────────────────────────────────────
  //
  // Ici, l'esthétique passe après trois choses : ce qui est disponible
  // aujourd'hui, à quel prix par unité, et comment joindre quelqu'un. D'où le
  // numéro dans l'en-tête, les rayons en onglets posés directement au-dessus
  // du catalogue — on choisit une espèce, pas une ambiance — et une carte qui
  // affiche l'unité de vente plutôt qu'un prix nu.
  agri: {
    id: 'agri',
    card: 'wholesale', hero: 'feature', nav: 'action',
    navCta: 'phone', headerDark: false, categories: 'tabs',
    media:    { ratio: '4 / 3', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 3', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 16 },
    radius: { card: 10, media: 8, button: 8, input: 8 },
    space:  { section: 44, sectionLg: 68 },
    type:   { h1: 32, h1Lg: 50, h2: 20, h2Lg: 26, cardTitle: 14,
              upper: false, tracking: 0, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(20,61,40,0.07)',
    shadowHover: '0 10px 22px -10px rgba(20,61,40,0.22)',
    showRating: true,
    proof: 'ledger',
    hoverSwap: false, hoverAction: false, reveal: false,
    mobile: { dock: ['catalog', 'availability', 'whatsapp'], cta: 'Demander ce lot', catalogLabel: 'Produits' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: true, buyNow: false },
  },

  // ── 6. Traiteur et pâtissier ────────────────────────────────────────────
  //
  // Le gabarit où la photographie vend seule. Paysage 4/3 — le plat vu de
  // dessus — et « cover » : une assiette ne se détoure pas. Mais quatre
  // colonnes et un rythme court, parce que la faim vient de la comparaison :
  // quatre plats côte à côte donnent envie, un plat en pleine largeur
  // intimide. Onglets au-dessus du catalogue : c'est une carte de restaurant.
  traiteur: {
    id: 'traiteur',
    card: 'minimal', hero: 'feature', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'tabs',
    media:    { ratio: '4 / 3', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 3', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 20 },
    radius: { card: 16, media: 14, button: 999, input: 14 },
    space:  { section: 48, sectionLg: 76 },
    type:   { h1: 36, h1Lg: 56, h2: 21, h2Lg: 28, cardTitle: 15,
              upper: false, tracking: -0.01, eyebrow: true },
    shadow:      '0 2px 6px -2px rgba(64,32,15,0.10)',
    shadowHover: '0 14px 30px -12px rgba(64,32,15,0.24)',
    showRating: true,
    proof: 'band',
    hoverSwap: false, hoverAction: false, reveal: false,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Commander maintenant', catalogLabel: 'Menu' },
    checkout: { schedule: 'delivery', customisation: true, whatsappFirst: false, quote: false, buyNow: true },
  },

  // ── Fashion Atelier (§7) ────────────────────────────────────────────────
  //
  // Éditorial. Beaucoup d'air, typographie forte en capitales espacées,
  // photographie de mise en scène qui remplit son cadre en portrait 4/5 — le
  // format du prêt-à-porter, celui qui montre une silhouette entière. Trois
  // colonnes seulement sur grand écran : une quatrième réduirait chaque
  // mannequin à une vignette.
  fashion: {
    id: 'fashion',
    card: 'fashion', hero: 'editorial', nav: 'centered',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '4 / 5', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 5', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 3, gap: 24 },
    radius: { card: 0, media: 2, button: 2, input: 2 },
    space:  { section: 64, sectionLg: 104 },
    type:   { h1: 34, h1Lg: 62, h2: 20, h2Lg: 26, cardTitle: 14,
              upper: true, tracking: 0.14, eyebrow: true },
    shadow: 'none',
    shadowHover: 'none',
    showRating: false,
    proof: 'editorial',
    hoverSwap: true, hoverAction: true, reveal: true,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Collection' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── Beauty Studio (§8) ──────────────────────────────────────────────────
  //
  // Doux et aspirationnel. Le flacon est détouré : `contain` et 14 % d'air
  // autour, sinon il sort du cadre. Cadre carré, coins très arrondis, ombre
  // légère — le vocabulaire de la cosmétique. Le §8 le demande explicitement :
  // « suffisamment petits pour respirer ».
  beauty: {
    id: 'beauty',
    card: 'beauty', hero: 'split', nav: 'centered',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 14 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 10 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 20 },
    radius: { card: 20, media: 18, button: 999, input: 12 },
    space:  { section: 56, sectionLg: 88 },
    type:   { h1: 32, h1Lg: 52, h2: 20, h2Lg: 28, cardTitle: 14,
              upper: false, tracking: 0, eyebrow: true },
    shadow:      '0 2px 8px -2px rgba(0,31,63,0.06)',
    shadowHover: '0 12px 28px -10px rgba(0,31,63,0.16)',
    showRating: true,
    proof: 'cards',
    hoverSwap: true, hoverAction: false, reveal: true,
    mobile: { dock: ['home', 'categories', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Boutique' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── Tech Store (§9) ─────────────────────────────────────────────────────
  //
  // Dense et informatif. Quatre colonnes, cartes bordées, produit détouré sur
  // fond clair. La carte porte une caractéristique courte et la disponibilité :
  // sur ce rayon, on compare avant d'acheter, et comparer demande des chiffres.
  tech: {
    id: 'tech',
    card: 'tech', hero: 'split', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'chips',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 10 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 8 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 16 },
    radius: { card: 12, media: 10, button: 10, input: 10 },
    space:  { section: 48, sectionLg: 72 },
    type:   { h1: 32, h1Lg: 48, h2: 19, h2Lg: 24, cardTitle: 14,
              upper: false, tracking: 0, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(0,31,63,0.05)',
    shadowHover: '0 8px 20px -8px rgba(0,31,63,0.18)',
    showRating: false,
    proof: 'ledger',
    hoverSwap: false, hoverAction: false, reveal: false,
    mobile: { dock: ['home', 'categories', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Produits' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── Food Market (§10) ───────────────────────────────────────────────────
  //
  // Appétissant et chaleureux. Le paysage 4/3 est le format du plat vu de
  // dessus. `cover` : une assiette remplit son cadre, elle ne se détoure pas.
  // Mais le §10 prévient — « ne pas faire des photos gigantesques » : d'où
  // quatre colonnes sur grand écran et un rythme vertical serré, qui posent
  // plusieurs plats côte à côte au lieu d'un seul en pleine largeur.
  food: {
    id: 'food',
    card: 'minimal', hero: 'immersive', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '4 / 3', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 3', fit: 'cover', pad: 0 },
    grid:   { mobile: 1, tablet: 2, desktop: 4, gap: 20 },
    radius: { card: 16, media: 14, button: 999, input: 12 },
    space:  { section: 48, sectionLg: 76 },
    type:   { h1: 34, h1Lg: 54, h2: 20, h2Lg: 27, cardTitle: 15,
              upper: false, tracking: -0.01, eyebrow: true },
    shadow:      '0 2px 6px -2px rgba(0,31,63,0.08)',
    shadowHover: '0 14px 30px -12px rgba(0,31,63,0.20)',
    showRating: false,
    proof: 'band',
    hoverSwap: false, hoverAction: false, reveal: false,
    mobile: { dock: ['catalog', 'search', 'cart', 'checkout'], cta: 'Commander', catalogLabel: 'Carte' },
    checkout: { schedule: 'delivery', customisation: false, whatsappFirst: false, quote: false, buyNow: true },
  },

  // ── Modern Retail (§11) ─────────────────────────────────────────────────
  //
  // Le polyvalent. Ni éditorial ni technique : commercial. Le catalogue est le
  // centre de l'expérience, la bannière tient en une carte et laisse voir les
  // produits sous elle dès le premier écran.
  retail: {
    id: 'retail',
    card: 'minimal', hero: 'card', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'chips',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 8 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 6 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 20 },
    radius: { card: 14, media: 12, button: 10, input: 10 },
    space:  { section: 48, sectionLg: 76 },
    type:   { h1: 32, h1Lg: 48, h2: 20, h2Lg: 26, cardTitle: 14,
              upper: false, tracking: 0, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(0,31,63,0.05)',
    shadowHover: '0 10px 24px -10px rgba(0,31,63,0.18)',
    showRating: false,
    proof: 'cards',
    hoverSwap: true, hoverAction: false, reveal: false,
    mobile: { dock: ['home', 'categories', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Boutique' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Les huit gabarits de marque en ligne (§35)
  //
  // Les six métiers répondent à « qu'est-ce que je fais ? ». Ceux-ci répondent
  // à une autre question : « comment ma marque parle-t-elle ? ». C'est le
  // registre de la marque en ligne — catalogue court et assumé, une promesse
  // en haut de page, une preuve juste dessous, un argumentaire qui se lit.
  //
  // Le marchand concerné n'est pas le commerçant de quartier : c'est celui qui
  // a dix références et qui les vend par le discours plutôt que par le rayon.
  //
  //   Compléments   la promesse, puis la caution scientifique
  //   Soin          la peau en grand, l'ingrédient en petit
  //   Animalerie    la réassurance AVANT la bannière — on achète pour un autre
  //   Mode édito    la campagne plein écran, la grille dense dessous
  //   Sport         page noire, une seule chose qui brille
  //   Fait main     l'histoire en deuxième écran, avant les produits
  //   Naturel       la preuve chiffrée à la place des avis
  //   Mono-produit  pas de bannière du tout : l'article EST la page
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. Compléments & bien-être ──────────────────────────────────────────
  //
  // Le flacon est détouré : `contain` et de l'air autour, sinon il sort du
  // cadre. Bannière en deux colonnes — le discours à gauche, le produit à
  // droite — parce que ce qui se vend ici est une PROMESSE illustrée par un
  // flacon, pas une photographie de mise en scène. Trois colonnes seulement :
  // une marque à dix références qui en aligne quatre paraît en avoir mille.
  wellness: {
    id: 'wellness',
    card: 'beauty', hero: 'split', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'chips',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 12 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 8 },
    grid:   { mobile: 2, tablet: 3, desktop: 3, gap: 22 },
    radius: { card: 14, media: 12, button: 8, input: 10 },
    space:  { section: 56, sectionLg: 92 },
    type:   { h1: 34, h1Lg: 54, h2: 21, h2Lg: 28, cardTitle: 14,
              upper: false, tracking: -0.005, eyebrow: true },
    shadow:      '0 1px 2px 0 rgba(36,64,44,0.06)',
    shadowHover: '0 12px 26px -12px rgba(36,64,44,0.22)',
    showRating: true,
    proof: 'cards',
    hoverSwap: false, hoverAction: false, reveal: true,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Produits' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 2. Soin & skincare ──────────────────────────────────────────────────
  //
  // La bannière est une photographie de peau en pleine largeur : c'est le
  // résultat qu'on achète, pas le pot. D'où `feature` et non `split`. Les
  // cartes, elles, sont l'inverse : pot détouré, beaucoup d'air, angles
  // presque droits — le vocabulaire de la parfumerie.
  skincare: {
    id: 'skincare',
    card: 'beauty', hero: 'feature', nav: 'centered',
    navCta: 'none', headerDark: false, categories: 'chips',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 14 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 10 },
    grid:   { mobile: 2, tablet: 3, desktop: 3, gap: 24 },
    radius: { card: 10, media: 8, button: 6, input: 8 },
    space:  { section: 60, sectionLg: 96 },
    type:   { h1: 34, h1Lg: 56, h2: 21, h2Lg: 28, cardTitle: 14,
              upper: false, tracking: 0.005, eyebrow: true },
    shadow:      '0 1px 2px 0 rgba(44,66,48,0.05)',
    shadowHover: '0 12px 28px -14px rgba(44,66,48,0.20)',
    showRating: true,
    proof: 'editorial',
    hoverSwap: true, hoverAction: false, reveal: true,
    mobile: { dock: ['home', 'categories', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Soins' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 3. Animalerie ───────────────────────────────────────────────────────
  //
  // Le seul gabarit dont la réassurance passe AVANT la bannière (voir son
  // préréglage). Ce n'est pas une coquetterie : on achète ici pour un animal
  // qui ne peut pas se plaindre, et « recommandé par les vétérinaires » est
  // l'argument, pas un détail de bas de page.
  //
  // Rayons en médaillons ronds, comme le vendeur social — mais ici le rond
  // n'est pas la grammaire des stories, c'est la tête de l'animal.
  animalerie: {
    id: 'animalerie',
    card: 'minimal', hero: 'feature', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'circles',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 10 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 8 },
    grid:   { mobile: 2, tablet: 3, desktop: 3, gap: 20 },
    radius: { card: 14, media: 12, button: 10, input: 10 },
    space:  { section: 48, sectionLg: 80 },
    type:   { h1: 34, h1Lg: 52, h2: 21, h2Lg: 28, cardTitle: 14,
              upper: false, tracking: -0.01, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(61,82,48,0.07)',
    shadowHover: '0 10px 24px -10px rgba(61,82,48,0.22)',
    showRating: true,
    proof: 'cards',
    hoverSwap: false, hoverAction: false, reveal: false,
    mobile: { dock: ['home', 'categories', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Boutique' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 4. Mode éditoriale ──────────────────────────────────────────────────
  //
  // Le cousin sans-sérif et plus dense de Fashion Atelier. Les deux existent
  // parce qu'ils ne font pas le même métier : Fashion Atelier est un lookbook
  // — trois colonnes, capitales espacées, on parcourt une saison. Celui-ci est
  // une boutique — quatre colonnes, rangée de rayons juste sous la campagne,
  // on cherche une pièce.
  magazine: {
    id: 'magazine',
    card: 'fashion', hero: 'editorial', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '4 / 5', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 5', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 18 },
    radius: { card: 0, media: 4, button: 3, input: 3 },
    space:  { section: 52, sectionLg: 84 },
    type:   { h1: 34, h1Lg: 58, h2: 20, h2Lg: 26, cardTitle: 13,
              upper: false, tracking: 0.02, eyebrow: false },
    shadow: 'none',
    shadowHover: 'none',
    showRating: true,
    proof: 'editorial',
    hoverSwap: true, hoverAction: true, reveal: true,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Collection' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 5. Sport & performance ──────────────────────────────────────────────
  //
  // Le seul gabarit du produit dont la SURFACE est sombre — sa palette porte
  // un fond noir, pas un en-tête sombre posé sur une page claire. Sur une
  // page noire, la couleur d'action est la seule chose qui brille, donc la
  // seule chose qu'on clique : c'est tout le mécanisme de ce gabarit.
  //
  // Titres en capitales, et gros : ce rayon se vend par l'affirmation. Aucune
  // apparition au défilement — l'énergie ne se dévoile pas, elle est là.
  sport: {
    id: 'sport',
    card: 'minimal', hero: 'feature', nav: 'classic',
    navCta: 'none', headerDark: true, categories: 'chips',
    media:    { ratio: '1 / 1', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '1 / 1', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 3, gap: 18 },
    radius: { card: 12, media: 10, button: 999, input: 10 },
    space:  { section: 48, sectionLg: 78 },
    type:   { h1: 38, h1Lg: 62, h2: 22, h2Lg: 30, cardTitle: 14,
              upper: true, tracking: 0.02, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(0,0,0,0.55)',
    shadowHover: '0 16px 34px -14px rgba(0,0,0,0.85)',
    showRating: true,
    proof: 'band',
    hoverSwap: false, hoverAction: false, reveal: false,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Acheter maintenant', catalogLabel: 'Programmes' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 6. Fait main & récit ────────────────────────────────────────────────
  //
  // Il partage la matière du Créateur / Artisan, pas son ordre. L'artisan
  // montre ses pièces puis raconte son atelier ; celui-ci raconte d'abord —
  // c'est une marque de commerce équitable ou de coopérative, dont l'argument
  // de vente EST le récit, et dont les objets seraient banals sans lui.
  maker: {
    id: 'maker',
    card: 'minimal', hero: 'feature', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '1 / 1', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 5', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 22 },
    radius: { card: 8, media: 6, button: 4, input: 6 },
    space:  { section: 56, sectionLg: 92 },
    type:   { h1: 36, h1Lg: 56, h2: 22, h2Lg: 29, cardTitle: 14,
              upper: false, tracking: 0.005, eyebrow: true },
    shadow:      '0 1px 2px 0 rgba(74,53,39,0.06)',
    shadowHover: '0 12px 28px -14px rgba(74,53,39,0.22)',
    showRating: true,
    proof: 'editorial',
    hoverSwap: false, hoverAction: false, reveal: true,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Ajouter à ma collection', catalogLabel: 'Pièces' },
    checkout: { schedule: 'none', customisation: true, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 7. Clean & naturel ──────────────────────────────────────────────────
  //
  // Même composition de bannière que « Compléments », et c'est assumé : les
  // deux vendent une promesse illustrée par un flacon, et il n'y a pas deux
  // façons de composer cela. Ce qui les sépare est ailleurs — le froid contre
  // le chaud, le sans-sérif contre le sérif, et surtout la preuve : celui-ci
  // met ses CHIFFRES sous la bannière là où l'autre met ses avis.
  naturel: {
    id: 'naturel',
    card: 'beauty', hero: 'split', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'chips',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 12 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 8 },
    grid:   { mobile: 2, tablet: 3, desktop: 3, gap: 20 },
    radius: { card: 12, media: 10, button: 8, input: 10 },
    space:  { section: 52, sectionLg: 84 },
    type:   { h1: 34, h1Lg: 54, h2: 21, h2Lg: 28, cardTitle: 14,
              upper: false, tracking: -0.005, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(30,74,63,0.06)',
    shadowHover: '0 12px 26px -12px rgba(30,74,63,0.20)',
    showRating: true,
    proof: 'cards',
    hoverSwap: false, hoverAction: false, reveal: true,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Produits' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  // ── 8. Produit unique ───────────────────────────────────────────────────
  //
  // Le seul gabarit dont le préréglage ne contient PAS de bannière. Une marque
  // qui vend un article n'a rien à annoncer avant lui : la fiche est la page.
  // `hero` reste réglé sur la composition compacte pour le marchand qui
  // réactive la section — mais il n'y arrive pas par défaut.
  //
  // Une colonne sur mobile : ce catalogue-là compte trois articles, et deux
  // colonnes en feraient une grille de supermarché à moitié vide.
  monoproduit: {
    id: 'monoproduit',
    card: 'minimal', hero: 'compact', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'chips',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 10 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 6 },
    grid:   { mobile: 1, tablet: 2, desktop: 3, gap: 20 },
    radius: { card: 12, media: 10, button: 8, input: 8 },
    space:  { section: 52, sectionLg: 84 },
    type:   { h1: 32, h1Lg: 48, h2: 22, h2Lg: 30, cardTitle: 15,
              upper: false, tracking: -0.01, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(19,33,46,0.06)',
    shadowHover: '0 10px 24px -10px rgba(19,33,46,0.20)',
    showRating: true,
    proof: 'editorial',
    hoverSwap: false, hoverAction: false, reveal: false,
    mobile: { dock: ['home', 'catalog', 'cart'], cta: 'Commander maintenant', catalogLabel: 'Le produit' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: true },
  },

  // ── Les trois gabarits historiques ──────────────────────────────────────
  //
  // Ils ne sont pas des alias : ce sont les profils que leurs vitrines portent
  // déjà, remis au niveau du reste. Un marchand qui rouvre sa boutique la
  // reconnaît — mieux dessinée, pas différente.

  /** L'ancêtre de Fashion Atelier : serif, centré, très aéré. */
  luxe: {
    id: 'luxe',
    card: 'editorial', hero: 'editorial', nav: 'centered',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '4 / 5', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '4 / 5', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 3, gap: 28 },
    radius: { card: 0, media: 4, button: 4, input: 6 },
    space:  { section: 64, sectionLg: 96 },
    type:   { h1: 34, h1Lg: 58, h2: 21, h2Lg: 28, cardTitle: 15,
              upper: false, tracking: 0.02, eyebrow: true },
    shadow: 'none', shadowHover: 'none',
    showRating: false,
    proof: 'editorial',
    hoverSwap: true, hoverAction: true, reveal: true,
    mobile: { dock: ['home', 'catalog', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Boutique' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: false },
  },

  /** L'ancêtre de Modern Retail : réassurance et preuve sociale. */
  // Le gabarit de repli, et donc le plus vu du produit — toute vitrine dont le
  // `template_id` est vide ou inconnu arrive ici. Il tenait le rôle avec la
  // composition la plus effacée des vingt-deux : bannière en carte, rayons en
  // pastilles de texte, aucune note, aucun achat en un geste.
  //
  // Il prend la grammaire du commerce de détail (§01), celle qui convient au
  // plus grand nombre :
  //
  //   `split`  la bannière du §3 — discours à gauche, photographie à droite.
  //            La carte flottante convenait à une page courte ; sur vingt
  //            sections, elle ouvre sur du vide.
  //   `tiles`  le §5 le demande explicitement — « chaque catégorie possède une
  //            image, pas simplement une icône ». Les pastilles de texte
  //            supposent qu'on sait déjà ce qu'on cherche.
  //   note     la carte produit du §6 porte les étoiles. Elles ne s'affichent
  //            que sur les fiches réellement notées : montrer l'emplacement ne
  //            fabrique aucune note.
  //   `buyNow` le §6 de la page produit — « ACHETER MAINTENANT » à côté du
  //            panier. Sur un commerce de détail, l'achat est un réflexe.
  modern: {
    id: 'modern',
    card: 'minimal', hero: 'split', nav: 'classic',
    navCta: 'none', headerDark: false, categories: 'tiles',
    media:    { ratio: '1 / 1', fit: 'contain', pad: 8 },
    mediaPdp: { ratio: '1 / 1', fit: 'contain', pad: 6 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 20 },
    radius: { card: 14, media: 12, button: 10, input: 10 },
    space:  { section: 48, sectionLg: 72 },
    type:   { h1: 34, h1Lg: 50, h2: 21, h2Lg: 27, cardTitle: 14,
              upper: false, tracking: 0, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(0,31,63,0.05)',
    shadowHover: '0 10px 24px -10px rgba(0,31,63,0.18)',
    showRating: true,
    proof: 'cards',
    hoverSwap: true, hoverAction: true, reveal: false,
    mobile: { dock: ['home', 'categories', 'search', 'cart'], cta: 'Ajouter au panier', catalogLabel: 'Boutique' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: false, quote: false, buyNow: true },
  },

  /** Le catalogue dense, pour le trafic réseaux sociaux. */
  flash: {
    id: 'flash',
    card: 'compact', hero: 'compact', nav: 'compact',
    navCta: 'none', headerDark: false, categories: 'chips',
    media:    { ratio: '1 / 1', fit: 'cover', pad: 0 },
    mediaPdp: { ratio: '1 / 1', fit: 'cover', pad: 0 },
    grid:   { mobile: 2, tablet: 3, desktop: 4, gap: 12 },
    radius: { card: 10, media: 8, button: 8, input: 8 },
    space:  { section: 32, sectionLg: 48 },
    type:   { h1: 28, h1Lg: 40, h2: 18, h2Lg: 22, cardTitle: 13,
              upper: false, tracking: 0, eyebrow: false },
    shadow:      '0 1px 2px 0 rgba(0,31,63,0.05)',
    shadowHover: '0 6px 16px -8px rgba(0,31,63,0.18)',
    showRating: false,
    proof: 'band',
    hoverSwap: false, hoverAction: false, reveal: false,
    mobile: { dock: ['catalog', 'search', 'cart', 'whatsapp'], cta: 'Ajouter au panier', catalogLabel: 'Catalogue' },
    checkout: { schedule: 'none', customisation: false, whatsappFirst: true, quote: false, buyNow: true },
  },
};

/** Ne lève jamais : un gabarit inconnu retombe sur le polyvalent. */
export function designFor(templateId: TemplateId | string): DesignProfile {
  return PROFILES[templateId as TemplateId] ?? PROFILES.retail;
}

// ── Les variables CSS du gabarit ────────────────────────────────────────────
//
// Elles se posent une fois, sur le layout de la vitrine, à côté des couleurs.
// Les composants lisent `var(--st-radius-card)` et n'ont donc pas à connaître
// le gabarit : c'est ce qui permet d'ajouter un neuvième profil sans rouvrir
// une seule carte produit.

/** La hauteur du socle mobile, en pixels. Une seule définition. */
export const DOCK_HEIGHT = 58;

export function designCssVars(d: DesignProfile): Record<string, string> {
  return {
    '--st-radius-card':   `${d.radius.card}px`,
    '--st-radius-media':  `${d.radius.media}px`,
    '--st-radius-btn':    `${d.radius.button}px`,
    '--st-radius-input':  `${d.radius.input}px`,

    '--st-grid-gap':      `${d.grid.gap}px`,
    '--st-section-y':     `${d.space.section}px`,
    '--st-section-y-lg':  `${d.space.sectionLg}px`,

    '--st-h1':            `${d.type.h1}px`,
    '--st-h1-lg':         `${d.type.h1Lg}px`,
    '--st-h2':            `${d.type.h2}px`,
    '--st-h2-lg':         `${d.type.h2Lg}px`,
    '--st-card-title':    `${d.type.cardTitle}px`,
    '--st-tracking':      `${d.type.tracking}em`,

    '--st-shadow':        d.shadow,
    '--st-shadow-hover':  d.shadowHover,

    '--st-media-ratio':   d.media.ratio,
    '--st-media-pad':     `${d.media.pad}%`,

    // La hauteur du socle mobile. Elle sert à deux endroits qui ne se
    // connaissent pas : le calage du pied de page, et la barre d'achat de la
    // fiche produit, qui se pose AU-DESSUS du socle et non dessous.
    '--st-dock-h':        `${DOCK_HEIGHT}px`,
  };
}

/**
 * Les colonnes de la grille, en classes Tailwind écrites en toutes lettres.
 *
 * Elles ne sont pas construites par concaténation à la volée : Tailwind lit les
 * fichiers source, une classe assemblée à l'exécution n'existerait dans aucune
 * feuille de style.
 */
export function gridClass(d: DesignProfile): string {
  const mobile  = d.grid.mobile === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const tablet  = d.grid.tablet === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';
  const desktop = d.grid.desktop === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';
  // Le palier intermédiaire évite le saut de deux à quatre colonnes sur une
  // tablette en paysage, où quatre cartes deviennent illisibles.
  return `${mobile} ${tablet} md:grid-cols-3 ${desktop}`;
}

/**
 * L'attribut `sizes` qui correspond à cette grille.
 *
 * Sans lui, le navigateur télécharge la variante pleine largeur d'une image qui
 * s'affiche à 300 pixels (§26). Il se déduit des colonnes, il ne se devine pas.
 */
export function gridSizes(d: DesignProfile): string {
  const mobileVw  = d.grid.mobile === 1 ? 100 : 50;
  const tabletVw  = Math.round(100 / d.grid.tablet);
  const desktopVw = Math.round(100 / d.grid.desktop);
  return [
    `(max-width: 640px) ${mobileVw}vw`,
    `(max-width: 1024px) ${tabletVw}vw`,
    `${Math.min(desktopVw, 25)}vw`,
  ].join(', ');
}
