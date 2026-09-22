// ─────────────────────────────────────────────────────────────────────────────
// La fiche produit, gabarit par gabarit (§16, §34)
//
// Une seule fiche servait les vingt-trois gabarits : même colonne d'achat, même
// bloc de détails repliés, même « Vous aimerez aussi ». C'était le dernier
// écran où six métiers se ressemblaient encore, et c'est l'écran où la vente se
// décide.
//
// Ce que les maquettes demandent n'est pas une décoration par gabarit : c'est
// un ORDRE D'INFORMATION différent, parce que la question qui bloque l'achat
// n'est pas la même —
//
//   Proximité   quelle taille, quelle couleur, combien — et au panier
//   Social      est-ce que c'est encore dispo, et pourquoi je l'aimerais
//   Artisan     qui l'a faite, avec quoi, et puis-je la personnaliser
//   Services    ce qui est inclus, pour qui, et quand se voit-on
//   Élevage     poids, âge, race, et le prix si j'en prends trente
//   Traiteur    quelle taille, pour quelle date, livré ou retiré
//
// Les marques en ligne (§35) et les presets de rayon (§33) ont suivi, et pour
// la même raison : une marque de compléments se lit « ce que ça m'apporte,
// puis ce qu'il y a dedans », un vêtement « quelle taille, et si elle ne va
// pas », un appareil « quelles caractéristiques, et quelle garantie ». Les
// vingt gabarits proposés ont donc leur fiche ; les trois historiques gardent
// celle du commerce, parce que des vitrines en production la portent.
//
// ── Ce fichier ne dessine rien ──────────────────────────────────────────────
//
// Il ne porte que le PROFIL : quelle colonne d'achat, quels onglets, quels
// mots. Les composants le lisent. C'est la même séparation que `storeDesign.ts`
// pour la page d'accueil, et elle a la même raison : un gabarit de plus est une
// entrée dans une table, pas un quatrième fichier à maintenir en parallèle.
//
// ── Rien n'est inventé ──────────────────────────────────────────────────────
//
// Chaque onglet lit une donnée RÉELLE : la description du produit, ses
// attributs, les modes de livraison de la caisse, les avis publiés, les
// questions fréquentes du thème. Un onglet dont la source est vide ne s'affiche
// pas — sauf dans l'aperçu du marchand, où il montre un exemple gris qui lui
// dit quoi remplir et que ses clients ne voient jamais (`ProductTabs`).
// ─────────────────────────────────────────────────────────────────────────────

import type { TemplateId } from './storeTheme';

/**
 * La colonne d'achat, à droite de la galerie.
 *
 * C'est le seul endroit de la vitrine où le gabarit change la MÉCANIQUE et pas
 * seulement le style : on ajoute au panier, on réserve un créneau, on demande
 * un prix pour trente têtes ou on commande pour samedi. Un même composant à
 * six styles aurait redit six fois « ajouter au panier » en six couleurs.
 */
export type BuyColumn =
  /** Panier classique : déclinaisons, quantité, ajouter, acheter. */
  | 'cart'
  /** Vendeur social : rareté, compte à rebours, pourquoi on l'aime. */
  | 'social'
  /** Artisan : personnalisation, délai de fabrication, garanties du fait-main. */
  | 'craft'
  /** Prestataire : durée, ce qui est inclus, date et créneau. */
  | 'booking'
  /** Éleveur : fiche technique, prix par tête, prix dégressif, demande de lot. */
  | 'livestock'
  /** Traiteur : nombre de parts, date de livraison, retrait ou livraison. */
  | 'catering'
  /** Marque : ce que le produit apporte, puis ce qu'il y a dedans. */
  | 'benefit'
  /** Prêt-à-porter : la taille de la fiche, et le guide des tailles réel. */
  | 'apparel'
  /** Rayon technique : les caractéristiques en tableau, puis la garantie. */
  | 'spec'
  /** Produit unique : l'article EST la page — l'offre, la preuve, le bouton. */
  | 'landing';

/**
 * Ce qu'un onglet montre. La clé dit la SOURCE, pas le libellé : « Histoire de
 * la pièce » chez l'artisan et « Description » chez le commerçant lisent la
 * même colonne, et c'est le gabarit qui choisit le mot.
 */
export type PdpTabKey =
  /** `product.description`. */
  | 'description'
  /** `product.attributes` — poids, âge, race, matière, dimensions. */
  | 'attributes'
  /** Les modes de livraison de la caisse, et le seuil offert. */
  | 'shipping'
  /** La politique de retour du thème, et les engagements du marchand. */
  | 'returns'
  /** Les avis publiés. */
  | 'reviews'
  /** Les questions fréquentes du thème. */
  | 'faq'
  /** `theme.process` — comment c'est fait, comment ça se passe. */
  | 'process'
  /** `theme.ingredients` — matières, composition, ce qu'il y a dedans. */
  | 'ingredients'
  /** `theme.caseStudies` — d'où part le client, où il arrive. */
  | 'results'
  /** `theme.gallery` — les photos qui ne sont pas des fiches produit. */
  | 'gallery'
  /** `theme.sizeGuide` — le tableau des mesures. */
  | 'sizeGuide';

export type PdpTab = { key: PdpTabKey; label: string };

/**
 * La section de boutique que cet onglet porte déjà.
 *
 * La fiche reprend sous elle des sections de la page d'accueil
 * (`pdpSectionsFor`). Celles qu'un onglet porte sont retirées de cette
 * reprise : depuis que la fiche a ses onglets, « Composition » ou « Questions
 * fréquentes » paraîtraient deux fois sur la même page, une fois à hauteur de
 * décision et une fois en pleine largeur. L'onglet gagne.
 *
 * Les onglets absents de cette table lisent le PRODUIT — sa description, ses
 * attributs — ou des données que la fiche porte déjà autrement : aucune
 * section ne les double.
 */
export const TAB_SECTION: Partial<Record<PdpTabKey, string>> = {
  ingredients: 'ingredients',
  process:     'process',
  faq:         'faq',
  gallery:     'gallery',
  sizeGuide:   'size_guide',
  results:     'case_studies',
};

export type PdpProfile = {
  buy: BuyColumn;
  tabs: PdpTab[];
  /** Le titre de la grille de suggestions, sous la fiche. */
  relatedTitle: string;
  /**
   * Le mot que CE métier emploie pour le bouton principal quand il ne va pas
   * au panier. Vide : le libellé du panier convient.
   */
  primaryLabel?: string;
  /**
   * La réassurance tient-elle une COLONNE, à droite de l'achat ?
   *
   * Faux : elle reste une rangée de pictos sous le bouton, et la fiche est en
   * deux colonnes. C'est la fiche des neuf marques en ligne, livrée telle
   * quelle.
   *
   * Vrai : la page passe à trois colonnes — galerie, achat, rail — et deux
   * choses suivent, parce qu'elles règlent le même défaut :
   *
   *   la BANDE sous la galerie. Mesurée le 19/09/2026 : la colonne de gauche
   *   se terminait 500 px avant celle de droite, et la fiche donnait l'air
   *   d'être vide à l'endroit où l'on regarde le produit. La bande reprend
   *   l'histoire du marchand — écrite une fois pour sa page d'accueil.
   *
   *   les SUGGESTIONS en bande compacte plutôt qu'en grille pleine largeur.
   *   Quatre grandes cartes sous une fiche, c'est une deuxième page d'accueil ;
   *   la bande dit « il y a autre chose » sans reprendre la décision.
   *
   * Ce qui ne change pas : la mécanique d'achat. Un éleveur demande toujours
   * son lot, un traiteur donne toujours sa date. Le rail déplace la
   * réassurance, il ne déplace pas la vente.
   */
  rail?: boolean;
  /**
   * Le titre des points forts de la fiche dans la colonne.
   *
   * Ce sont les mêmes points forts partout — ceux que le marchand a écrits sur
   * SA fiche — mais on ne les annonce pas du même mot selon ce qu'on vend :
   * « Pourquoi on l'aime ? » chez un vendeur social, « Ce que ça vous
   * apporte » chez une marque de compléments, « Ce qui est inclus » chez un
   * prestataire. Vide : la liste s'affiche sans titre.
   */
  highlightsTitle?: string;
  /**
   * Le titre de la bande de TUILES, sous la zone d'achat. Vide : pas de bande.
   *
   * Le rayon où l'on compare porte dix ou douze caractéristiques. En tableau
   * dans la colonne, elles poussent le bouton d'achat sous la ligne de
   * flottaison ; en tuiles, en pleine largeur, elles se balaient (`SpecGrid`).
   *
   * Un gabarit qui pose cette bande ne garde PAS d'onglet « Caractéristiques »,
   * et sa colonne ne pose plus le tableau : la même donnée deux fois sur une
   * page fait douter de la deuxième.
   */
  specGrid?: string;
};

// ── Les onglets communs ─────────────────────────────────────────────────────
//
// Nommés une fois : « Livraison » s'écrit pareil chez cinq gabarits sur six, et
// le jour où l'on y ajoute les retours, on ne veut pas le faire six fois.

const DESCRIPTION: PdpTab = { key: 'description', label: 'Description' };
const DETAILS:     PdpTab = { key: 'attributes',  label: 'Détails' };
const SHIPPING:    PdpTab = { key: 'shipping',    label: 'Livraison' };
const RETURNS:     PdpTab = { key: 'returns',     label: 'Retours' };
const REVIEWS:     PdpTab = { key: 'reviews',     label: 'Avis' };
const FAQ:         PdpTab = { key: 'faq',         label: 'FAQ' };

const PROFILES: Partial<Record<TemplateId, PdpProfile>> = {

  // ── Proximité ────────────────────────────────────────────────────────────
  //
  // Le commerce de quartier : la taille, la couleur, le prix, le panier. Ses
  // onglets sont ceux d'un rayon — ce que c'est, ce que ça mesure, comment ça
  // arrive, ce qui se passe si ça ne va pas.
  proximite: {
    buy: 'cart',
    rail: true,
    tabs: [DESCRIPTION, DETAILS, SHIPPING, RETURNS, REVIEWS, FAQ],
    relatedTitle: 'Produits similaires',
  },

  // ── Social ───────────────────────────────────────────────────────────────
  //
  // Le trafic vient d'Instagram et n'a pas de patience : ce qui compte est
  // qu'il en reste, et pourquoi celui-ci plutôt qu'un autre. La galerie du
  // marchand tient lieu de dernier onglet — c'est là que ce rayon montre ses
  // clients, et c'est ce que la maquette appelle « UGC ».
  social: {
    buy: 'social',
    rail: true,
    tabs: [DESCRIPTION, DETAILS, REVIEWS, { key: 'gallery', label: 'Sur nos réseaux' }],
    relatedTitle: 'Produits similaires',
  },

  // ── Artisan ──────────────────────────────────────────────────────────────
  //
  // Une pièce faite à la main se vend par son histoire, sa matière et son
  // geste. Les dimensions sont des attributs comme les autres — c'est le mot
  // qui change, pas la colonne.
  artisan: {
    buy: 'craft',
    rail: true,
    tabs: [
      { key: 'description',  label: 'Histoire de la pièce' },
      { key: 'ingredients',  label: 'Matériaux' },
      { key: 'process',      label: 'Fabrication' },
      { key: 'attributes',   label: 'Dimensions' },
      REVIEWS,
    ],
    relatedTitle: 'Produits complémentaires',
    primaryLabel: 'Commander cette création',
  },

  // ── Services ─────────────────────────────────────────────────────────────
  //
  // On n'achète pas une séance, on prend un rendez-vous. La preuve passe avant
  // la question fréquente : un prestataire se juge sur des résultats.
  services: {
    buy: 'booking',
    rail: true,
    tabs: [
      DESCRIPTION,
      { key: 'results',  label: 'Résultats' },
      { key: 'reviews',  label: 'Témoignages' },
      FAQ,
    ],
    relatedTitle: 'Vous pourriez aussi être intéressé par',
    primaryLabel: 'Réserver cette séance',
  },

  // ── Élevage ──────────────────────────────────────────────────────────────
  //
  // L'acheteur veut un poids, un âge, une race et un prix à la tête. Le suivi
  // sanitaire et l'alimentation sont les deux questions qui suivent, et elles
  // lisent ce que le marchand a écrit une fois pour sa page d'accueil.
  agri: {
    buy: 'livestock',
    rail: true,
    tabs: [
      DESCRIPTION,
      { key: 'attributes',  label: 'Infos techniques' },
      { key: 'process',     label: 'Suivi sanitaire' },
      { key: 'ingredients', label: 'Alimentation' },
      REVIEWS,
    ],
    relatedTitle: 'Produits similaires',
    primaryLabel: 'Demander ce lot',
  },

  // ── Traiteur ─────────────────────────────────────────────────────────────
  //
  // Une commande vaut une date. Le reste — parts, allergènes, buffet — se lit
  // avant, et se décide sur la fiche.
  traiteur: {
    buy: 'catering',
    rail: true,
    tabs: [
      DESCRIPTION,
      { key: 'ingredients', label: 'Ingrédients' },
      REVIEWS,
      FAQ,
    ],
    relatedTitle: 'Vous aimerez aussi',
    primaryLabel: 'Commander',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Les neuf gabarits de marque en ligne (§35)
  //
  // Les six métiers répondent à « qu'est-ce que je vends ? ». Ceux-ci répondent
  // à « pourquoi celui-ci plutôt qu'un autre ? » — le marchand concerné a dix
  // références et un discours, et c'est le discours qui vend.
  //
  // Leur colonne va donc au panier comme celle du commerçant : ce n'est pas la
  // MÉCANIQUE qui les distingue, c'est l'ORDRE. Un complément se vend sur ce
  // qu'il apporte puis sur ce qu'il contient ; un vêtement sur sa taille et
  // sur ce qui se passe si elle ne va pas. Deux ordres, deux colonnes —
  // `benefit` et `apparel` — et non deux décorations du même bloc.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Compléments & bien-être ──────────────────────────────────────────────
  //
  // On n'achète pas un flacon, on achète ce qu'il promet — puis on vérifie ce
  // qu'il y a dedans avant de le mettre dans sa bouche. La composition monte
  // donc dans la colonne, en résumé, avec le renvoi vers l'onglet complet.
  wellness: {
    buy: 'benefit',
    tabs: [
      DESCRIPTION,
      { key: 'ingredients', label: 'Composition' },
      { key: 'process',     label: 'Comment le prendre' },
      DETAILS,
      REVIEWS,
      FAQ,
    ],
    relatedTitle:    'Complétez votre routine',
    highlightsTitle: 'Ce que ça vous apporte',
  },

  // ── Soin & skincare ──────────────────────────────────────────────────────
  //
  // Même ordre que le complément, un vocabulaire plus près de la peau : on
  // achète un résultat, on lit un ingrédient, on demande comment l'appliquer.
  skincare: {
    buy: 'benefit',
    tabs: [
      { key: 'description', label: 'Le soin' },
      { key: 'ingredients', label: 'Ingrédients' },
      { key: 'process',     label: 'Comment l\'appliquer' },
      DETAILS,
      REVIEWS,
      FAQ,
    ],
    relatedTitle:    'Complétez votre routine',
    highlightsTitle: 'Ce que ce soin fait',
  },

  // ── Animalerie ───────────────────────────────────────────────────────────
  //
  // On achète pour un animal qui ne pourra pas dire que ça ne lui va pas : la
  // composition et la livraison sont ici des questions d'avant-achat, pas des
  // mentions de bas de page.
  animalerie: {
    buy: 'benefit',
    tabs: [
      DESCRIPTION,
      { key: 'ingredients', label: 'Composition' },
      DETAILS,
      SHIPPING,
      REVIEWS,
      FAQ,
    ],
    relatedTitle:    'Aussi pour votre animal',
    highlightsTitle: 'Pourquoi le choisir',
  },

  // ── Mode éditoriale ──────────────────────────────────────────────────────
  //
  // L'objection n° 1 du prêt-à-porter est la taille, et la deuxième est « et
  // si elle ne va pas ». Le guide des tailles est donc dans la colonne — le
  // vrai, celui que le marchand a saisi — et les retours sont un onglet.
  magazine: {
    buy: 'apparel',
    tabs: [
      DESCRIPTION,
      DETAILS,
      { key: 'sizeGuide', label: 'Guide des tailles' },
      SHIPPING,
      RETURNS,
      REVIEWS,
    ],
    relatedTitle: 'Complétez le look',
  },

  // ── Sport & performance ──────────────────────────────────────────────────
  //
  // Ce rayon se vend par l'affirmation et se vérifie par la preuve : ce que ça
  // change, ce qu'il y a dedans, comment on l'utilise, et ce que d'autres ont
  // obtenu.
  sport: {
    buy: 'benefit',
    tabs: [
      DESCRIPTION,
      { key: 'ingredients', label: 'Composition' },
      { key: 'process',     label: 'Comment l\'utiliser' },
      { key: 'results',     label: 'Résultats' },
      REVIEWS,
      FAQ,
    ],
    relatedTitle:    'Dans la même gamme',
    highlightsTitle: 'Ce que ça change',
  },

  // ── Fait main & récit ────────────────────────────────────────────────────
  //
  // La même colonne que l'Artisan — on commande une pièce, souvent
  // personnalisée — mais l'ordre des onglets s'inverse : ici c'est le RÉCIT
  // qui vend, et la pièce vient l'illustrer.
  maker: {
    buy: 'craft',
    tabs: [
      { key: 'description', label: 'Notre histoire' },
      { key: 'ingredients', label: 'Matériaux' },
      { key: 'process',     label: 'Comment c\'est fait' },
      { key: 'attributes',  label: 'Dimensions' },
      REVIEWS,
    ],
    relatedTitle: 'D\'autres pièces de l\'atelier',
    primaryLabel: 'Commander cette pièce',
  },

  // ── Clean & naturel ──────────────────────────────────────────────────────
  //
  // Le versant clinique du bien-être : ce gabarit met ses CHIFFRES là où les
  // autres mettent les avis, sur sa page d'accueil comme sur sa fiche.
  naturel: {
    buy: 'benefit',
    tabs: [
      DESCRIPTION,
      { key: 'ingredients', label: 'Composition' },
      { key: 'results',     label: 'Nos résultats' },
      DETAILS,
      REVIEWS,
      FAQ,
    ],
    relatedTitle:    'Dans la même gamme',
    highlightsTitle: 'Ce que ça vous apporte',
  },

  // ── Produit unique ───────────────────────────────────────────────────────
  //
  // Une boutique d'un seul article : sa fiche n'est pas une page parmi
  // d'autres, c'est LA page. La colonne porte donc ce qu'une page de vente
  // porte — l'offre qui finit s'il y en a une, la promesse, la preuve — et les
  // objections passent en onglets plutôt qu'en pied de page.
  monoproduit: {
    buy: 'landing',
    tabs: [
      DESCRIPTION,
      { key: 'ingredients', label: 'Ce qu\'il y a dedans' },
      { key: 'process',     label: 'Comment ça marche' },
      REVIEWS,
      FAQ,
      SHIPPING,
    ],
    relatedTitle:    'À découvrir aussi',
    highlightsTitle: 'Pourquoi vous allez l\'aimer',
  },

  // ── Style chic ───────────────────────────────────────────────────────────
  //
  // Une boutique de mode qui reçoit : mêmes questions que la mode éditoriale —
  // la taille, l'envoi, le retour — dans le vocabulaire de la tenue.
  chic: {
    buy: 'apparel',
    // La maquette pose la matière, la finition et l'entretien en rangée de
    // cartes sous la bande, pas en onglet fermé : sur une pièce chère, c'est
    // le détail qui justifie le prix, et un onglet le cache.
    specGrid: 'Le détail de la pièce',
    tabs: [
      DESCRIPTION,
      { key: 'sizeGuide', label: 'Guide des tailles' },
      SHIPPING,
      RETURNS,
      REVIEWS,
    ],
    relatedTitle: 'Complétez votre tenue',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Les cinq presets de rayon (§33)
  //
  // Ce sont les mises en page générales, celles que prend le marchand qui ne
  // s'est reconnu dans aucun métier ni aucune marque. Leur fiche suit donc le
  // RAYON et rien d'autre : on compare des caractéristiques en électronique,
  // on lit une composition en cosmétique, on donne une date en restauration.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Modern Retail ────────────────────────────────────────────────────────
  //
  // Le polyvalent : la fiche d'un rayon, sans hypothèse sur ce qu'il contient.
  retail: {
    buy: 'cart',
    rail: true,
    tabs: [DESCRIPTION, DETAILS, SHIPPING, RETURNS, REVIEWS, FAQ],
    relatedTitle: 'Vous aimerez aussi',
  },

  // ── Fashion Atelier ──────────────────────────────────────────────────────
  fashion: {
    buy: 'apparel',
    rail: true,
    tabs: [
      DESCRIPTION,
      DETAILS,
      { key: 'sizeGuide', label: 'Guide des tailles' },
      SHIPPING,
      RETURNS,
      REVIEWS,
    ],
    relatedTitle: 'Complétez le look',
  },

  // ── Beauty Studio ────────────────────────────────────────────────────────
  beauty: {
    buy: 'benefit',
    rail: true,
    tabs: [
      DESCRIPTION,
      { key: 'ingredients', label: 'Ingrédients' },
      { key: 'process',     label: 'Comment l\'appliquer' },
      DETAILS,
      REVIEWS,
      FAQ,
    ],
    relatedTitle:    'Complétez votre routine',
    highlightsTitle: 'Ce que ce produit fait',
  },

  // ── Tech Store ───────────────────────────────────────────────────────────
  //
  // Le seul rayon où l'on COMPARE avant d'acheter : les caractéristiques
  // passent dans la colonne, en tableau, et la garantie tient l'onglet des
  // retours — c'est la question qu'on pose sur un appareil, pas « puis-je le
  // renvoyer s'il ne me plaît pas ».
  tech: {
    buy: 'spec',
    rail: true,
    // La bande de tuiles remplace à la fois le tableau de la colonne et l'onglet
    // « Caractéristiques » : c'est la même donnée, et elle se lit mieux à plat
    // qu'en colonne étroite ou derrière un onglet fermé.
    specGrid: 'Caractéristiques techniques',
    tabs: [
      DESCRIPTION,
      SHIPPING,
      { key: 'returns',    label: 'Garantie & retours' },
      REVIEWS,
      FAQ,
    ],
    relatedTitle: 'Dans le même rayon',
  },

  // ── Food Market ──────────────────────────────────────────────────────────
  //
  // Une commande de nourriture vaut une date : c'est déjà ce que la caisse de
  // ce gabarit demande (`checkout.schedule: 'delivery'`), et la fiche la
  // demande maintenant au même endroit que le traiteur.
  food: {
    buy: 'catering',
    rail: true,
    // Provenance, conservation, poids : ce qu'on vérifie AVANT de commander
    // à manger, et ce que la maquette pose en cartes sous les onglets.
    specGrid: 'Bon à savoir',
    tabs: [
      DESCRIPTION,
      { key: 'ingredients', label: 'Ingrédients' },
      SHIPPING,
      REVIEWS,
      FAQ,
    ],
    relatedTitle: 'Vous aimerez aussi',
    primaryLabel: 'Commander',
  },
};

/**
 * Le profil par défaut : les trois gabarits historiques, et eux seuls.
 *
 * Les vingt gabarits proposés ont désormais leur fiche. `luxe`, `modern` et
 * `flash` gardent celle du commerce — c'est ce que leurs vitrines portent
 * aujourd'hui, et un marchand qui n'a rien demandé ne doit pas voir sa fiche
 * changer d'ordre du jour au lendemain. Il peut passer à un gabarit proposé
 * quand il le veut, et c'est ce jour-là que sa fiche change.
 *
 * C'est aussi le repli d'un `template_id` écrit à la main en base : du texte
 * libre côté base, donc une valeur qui doit s'afficher plutôt que lever.
 */
const FALLBACK: PdpProfile = {
  buy: 'cart',
  // Les trois historiques prennent le rail comme les onze autres. Leur fiche
  // ne CHANGE pas d'ordre du jour — mêmes onglets, même mécanique, mêmes mots.
  // Elle cesse seulement de se terminer par 500 px de vide, et `modern` est le
  // gabarit de repli : l'y refuser, c'est le refuser à la plupart des vitrines.
  rail: true,
  tabs: [DESCRIPTION, DETAILS, SHIPPING, RETURNS, REVIEWS, FAQ],
  relatedTitle: 'Vous aimerez aussi',
};

/**
 * Le guide des tailles chez `modern`.
 *
 * C'est l'objection n° 1 du prêt-à-porter, et `modern` est le gabarit de repli
 * de toutes les vitrines qui n'en ont pas choisi : le retirer priverait de leur
 * onglet celles qui vendent des vêtements. Les quatre autres gabarits qui
 * figuraient ici ont maintenant leur profil, et le portent en propre.
 */
const SIZE_GUIDE_TEMPLATES: ReadonlySet<TemplateId> = new Set<TemplateId>(['modern']);

/**
 * Ce gabarit a-t-il sa propre fiche, ou retombe-t-il sur celle du commerce ?
 *
 * Utile aux tests, qui tiennent l'invariant : un gabarit PROPOSÉ au marchand
 * doit avoir sa fiche. Sans cela, en ajouter un au registre lui donnerait
 * silencieusement la fiche générique — exactement ce que ce fichier existe
 * pour éviter.
 */
export function hasOwnPdpProfile(templateId: TemplateId): boolean {
  return PROFILES[templateId] !== undefined;
}

export function pdpProfileFor(templateId: TemplateId): PdpProfile {
  const profile = PROFILES[templateId];
  if (profile) return profile;
  if (SIZE_GUIDE_TEMPLATES.has(templateId)) {
    return {
      ...FALLBACK,
      tabs: [
        DESCRIPTION, DETAILS,
        { key: 'sizeGuide', label: 'Guide des tailles' },
        SHIPPING, RETURNS, REVIEWS, FAQ,
      ],
    };
  }
  return FALLBACK;
}
