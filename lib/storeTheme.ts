// ─────────────────────────────────────────────────────────────────────────────
// Le contrat de thème d'une vitrine
//
// `store_settings.theme_config` est du JSONB : la base ne le valide pas. Si le
// moteur de gabarits lit ce JSON tel quel, la première clé absente — une
// vitrine créée avant cette fonctionnalité en a zéro — casse le rendu de la
// boutique d'un marchand en production, et il l'apprend par un client.
//
// Donc : un schéma qui donne toujours un objet complet. `parseThemeConfig` ne
// lève jamais et ne renvoie jamais `undefined` sur un champ. Une valeur
// aberrante est remplacée par le défaut, pas propagée.
//
// La couleur mérite un mot. Le marchand choisit SA couleur de marque — c'est sa
// vitrine, pas un écran du produit, la constitution visuelle ne s'y applique
// pas telle quelle. Mais le contraste, si : `readableInk()` calcule sur quelle
// encre poser un texte, au lieu de parier sur le blanc. Un bouton « Commander »
// blanc sur un jaune de marque est illisible dehors — le même problème que le
// §31 a réglé pour le produit, transposé à la vitrine.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { applyContentPreset } from './storeContent';

// ── Gabarits ────────────────────────────────────────────────────────────────

// Vingt-deux : six gabarits métier (§34), huit gabarits de marque en ligne
// (§35), cinq presets de rayon (§33) et trois gabarits historiques. Ces
// derniers ne sont pas dépréciés au sens où ils cesseraient de fonctionner :
// des vitrines en production les portent, et `template_id` est du texte libre
// en base. Les retirer changerait l'identité de ces boutiques du jour au
// lendemain, sans que leur marchand ait rien demandé.
//
// Ce qui distingue ces vingt-deux gabarits ne vit PAS ici :
// `lib/storeDesign.ts` porte la direction artistique de chacun,
// `lib/storeSections.ts` l'ordre de sa page d'accueil, et `BRAND_PRESETS` plus
// bas sa palette de départ. Ce fichier ne connaît que les noms.
export const TEMPLATE_IDS = [
  // Les six gabarits métier (§34). Ils ne sont pas six palettes posées sur une
  // même page : chacun a sa composition de bannière, sa carte produit, son
  // en-tête, l'ordre de ses sections et son vocabulaire.
  'proximite', 'social', 'artisan', 'services', 'agri', 'traiteur',
  // Les huit gabarits de marque en ligne (§35). Le métier dit ce qu'on vend ;
  // ceux-ci disent comment on le vend — une marque qui pousse un catalogue
  // court, assumé, avec sa promesse, sa preuve et son argumentaire.
  'wellness', 'skincare', 'animalerie', 'magazine',
  'sport', 'maker', 'naturel', 'monoproduit',
  // Les cinq presets de rayon (§33).
  'fashion', 'beauty', 'tech', 'food', 'retail',
  // Les trois gabarits historiques.
  'luxe', 'modern', 'flash',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export function isTemplateId(v: unknown): v is TemplateId {
  return typeof v === 'string' && (TEMPLATE_IDS as readonly string[]).includes(v);
}

// ── Schéma ──────────────────────────────────────────────────────────────────

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hex = (fallback: string) =>
  z.string().regex(HEX).catch(fallback);

/** Les familles proposées à l'éditeur. Une par intention, pas un catalogue. */
export const FONT_CHOICES = {
  inter:     { label: 'Inter — neutre, moderne',      stack: 'var(--font-inter), system-ui, sans-serif' },
  serif:     { label: 'Playfair — élégante, éditoriale', stack: 'var(--font-playfair), Georgia, serif' },
  system:    { label: 'Système — la plus rapide',      stack: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
} as const;
export type FontKey = keyof typeof FONT_CHOICES;

const fontKey = z.enum(['inter', 'serif', 'system'] as const);

/**
 * Un sous-objet qui se remplit tout seul.
 *
 * Chaque feuille porte déjà son `.catch()`, donc `parse({})` rend l'objet
 * complet. `.catch()` posé sur l'objet entier étend la garantie à la clé
 * absente : `theme_config = {}` — le cas de toutes les vitrines existantes —
 * donne un thème complet au lieu d'un `undefined` qui casserait le rendu.
 * `.default({})` ne conviendrait pas : Zod 4 exige alors le type d'entrée
 * complet, que nous n'avons justement pas.
 */
function selfFilling<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return schema.catch(() => schema.parse({}));
}

export const themeConfigSchema = z.object({
  palette: selfFilling(z.object({
    /** Structure : navigation, titres, aplats sombres. */
    primary:   hex('#001F3F'),
    /** Action : le bouton qui déclenche l'achat. */
    accent:    hex('#50C878'),
    /** Le fond de page. */
    surface:   hex('#FFFFFF'),
    /** Le fond des cartes et sections alternées. */
    surface2:  hex('#F6F8FA'),
    /** Le texte courant. */
    ink:       hex('#2A3846'),
  })),

  typography: selfFilling(z.object({
    heading: fontKey.catch('inter'),
    body:    fontKey.catch('inter'),
  })),

  hero: selfFilling(z.object({
    headline:    z.string().max(120).catch(''),
    subheadline: z.string().max(240).catch(''),
    ctaLabel:    z.string().max(40).catch(''),
    imageUrl:    z.string().url().nullable().catch(null),
    /** Voile posé sur l'image pour que le texte reste lisible. 0 → 80. */
    overlay:     z.number().min(0).max(80).catch(35),
  })),

  catalog: selfFilling(z.object({
    // 'all' : tout l'inventaire part en vitrine — le comportement des boutiques
    // existantes, conservé pour ne pas vider leur catalogue à la migration.
    // 'selected' : seuls les produits cochés dans l'éditeur.
    mode:            z.enum(['all', 'selected']).catch('all'),
    columns:         z.union([z.literal(2), z.literal(3), z.literal(4)]).catch(3),
    showSearch:      z.boolean().catch(true),
    showCategories:  z.boolean().catch(true),
    /** Cacher les produits à zéro plutôt que les afficher barrés. */
    hideOutOfStock:  z.boolean().catch(false),
  })),

  trust: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    badges:  z.array(z.object({
      icon:  z.enum(['truck', 'shield', 'refresh', 'phone', 'card', 'clock']).catch('shield'),
      label: z.string().max(40),
      note:  z.string().max(80).catch(''),
    })).max(4).catch([]),
  })),

  // La preuve sociale du gabarit « Conversion ».
  //
  // Elle est SAISIE par le marchand, jamais générée. Un avis inventé sur la
  // vitrine d'un commerçant l'expose personnellement — c'est lui que le client
  // ira voir, pas nous — et la règle « aucune donnée fictive » du produit ne
  // s'arrête pas au tableau de bord. Section vide → section absente.
  socialProof: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    title:   z.string().max(60).catch('Ce qu\'en disent nos clients'),
    items:   z.array(z.object({
      author: z.string().max(60),
      text:   z.string().max(280),
      /** 1 à 5, ou 0 quand le marchand ne veut pas d'étoiles. */
      rating: z.number().min(0).max(5).catch(0),
    })).max(6).catch([]),
  })),

  urgency: selfFilling(z.object({
    enabled:  z.boolean().catch(false),
    /** ISO. Le compte à rebours ne s'affiche que si la date est dans le futur. */
    deadline: z.string().datetime().nullable().catch(null),
    message:  z.string().max(80).catch(''),
  })),

  whatsapp: selfFilling(z.object({
    enabled:  z.boolean().catch(false),
    /** Vide → on retombe sur store_settings.whatsapp_number. */
    number:   z.string().max(24).catch(''),
    greeting: z.string().max(120).catch(''),
  })),

  announcement: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    text:    z.string().max(120).catch(''),
  })),

  // ── Les contenus des sections ajoutées au §6 ──────────────────────────────
  //
  // Ils vivent ICI et non dans `store_sections.config`. Une seule source de
  // vérité pour le contenu : la table des sections ne porte que l'ORDRE et
  // l'ACTIVATION. Sans cette séparation, un marchand qui désactive puis
  // réactive une section perd son texte.

  /** L'histoire de la marque. Deux paragraphes, une image. */
  brandStory: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Notre histoire'),
    body:    z.string().max(1200).catch(''),
    imageUrl: z.string().url().nullable().catch(null),
  })),

  /** La bannière de promotion : un message, un lien, une couleur. */
  promotion: selfFilling(z.object({
    enabled:  z.boolean().catch(false),
    title:    z.string().max(80).catch(''),
    subtitle: z.string().max(160).catch(''),
    ctaLabel: z.string().max(40).catch(''),
    ctaHref:  z.string().max(200).catch(''),
    imageUrl: z.string().url().nullable().catch(null),
  })),

  /**
   * Les questions qu'on pose avant d'acheter.
   *
   * Livraison, paiement, retours. Un marchand qui y répond une fois sur sa page
   * répond dix fois de moins sur WhatsApp — c'est la section la plus rentable
   * du lot, et la moins spectaculaire.
   */
  faq: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    title:   z.string().max(80).catch('Questions fréquentes'),
    items:   z.array(z.object({
      question: z.string().max(160),
      answer:   z.string().max(800),
    })).max(12).catch([]),
  })),

  newsletter: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Restez informé'),
    body:    z.string().max(200).catch(''),
  })),

  /** Le seuil de livraison offerte (§28). Zéro : pas de seuil affiché. */
  freeShipping: selfFilling(z.object({
    enabled:   z.boolean().catch(false),
    threshold: z.number().min(0).max(1_000_000).catch(0),
  })),

  // ── Les contenus des six gabarits métier (§34) ────────────────────────────
  //
  // Chacun répond à une question que son métier pose et que les autres ne
  // posent pas. Un prestataire de services doit prouver un résultat avant de
  // vendre une séance ; un artisan doit montrer comment la pièce est faite ;
  // un traiteur doit prendre une date. Ces trois besoins ne se rangent pas
  // dans « catalogue » et « avis ».
  //
  // Tous suivent la règle du fichier : vide → la section n'existe pas. Aucun
  // chiffre, aucune étape, aucune image n'est inventé à la place du marchand.

  /**
   * Les chiffres de la preuve — « +200 clients », « 98 % de satisfaction ».
   *
   * Ils sont SAISIS. Un taux de satisfaction calculé par nous serait faux, et
   * un taux inventé engage le marchand devant ses propres clients.
   */
  stats: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    items:   z.array(z.object({
      value: z.string().max(16),
      label: z.string().max(40),
      note:  z.string().max(40).catch(''),
    })).max(4).catch([]),
  })),

  /**
   * La méthode, en trois ou quatre temps.
   *
   * « Choisissez → Réservez → On s'occupe du reste » chez un prestataire,
   * « La matière → L'atelier → La pièce » chez un artisan. C'est le motif que
   * le cahier appelle « How it works » : il vend ce qui ne se photographie pas.
   */
  process: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Comment ça se passe'),
    steps:   z.array(z.object({
      title: z.string().max(60),
      body:  z.string().max(240).catch(''),
    })).max(4).catch([]),
  })),

  /**
   * La galerie : les photos qui ne sont pas des fiches produit.
   *
   * L'atelier, la vitrine, un buffet livré, une publication Instagram. Le
   * trafic social achète ce qu'il a vu chez quelqu'un d'autre.
   */
  gallery: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('En images'),
    caption: z.string().max(160).catch(''),
    images:  z.array(z.string().url()).max(12).catch([]),
  })),

  /**
   * La demande de commande sur mesure.
   *
   * Le gâteau d'anniversaire, le buffet de mariage, le lot de trente poulets :
   * trois commandes qu'aucun panier ne sait prendre, parce qu'il leur manque
   * une date, un nombre de parts ou un poids. Le formulaire ne les encaisse
   * pas — il ouvre WhatsApp avec le message déjà écrit, ce qui est exactement
   * la façon dont ces commandes se passent réellement.
   */
  orderForm: selfFilling(z.object({
    enabled:  z.boolean().catch(false),
    title:    z.string().max(80).catch('Commandez maintenant'),
    body:     z.string().max(240).catch(''),
    ctaLabel: z.string().max(40).catch('Envoyer ma demande'),
    /** Vrai quand la demande porte une date et une heure — traiteur, événement. */
    askDate:  z.boolean().catch(true),
  })),

  /**
   * La bande d'appel final : une phrase, un bouton, sur un aplat de marque.
   *
   * Elle ferme la page d'un prestataire, dont la vente n'est pas un panier
   * mais un rendez-vous. Une grille de produits n'en a pas besoin ; une page
   * qui a raconté pendant six sections, si.
   */
  ctaBand: selfFilling(z.object({
    enabled:  z.boolean().catch(false),
    title:    z.string().max(100).catch(''),
    body:     z.string().max(200).catch(''),
    ctaLabel: z.string().max(40).catch(''),
    ctaHref:  z.string().max(200).catch(''),
  })),

  // ── Ce qu'une vraie boutique dit et qu'aucune section ne disait ──────────
  //
  // Les sections précédentes vendent. Celles-ci répondent — et ce sont
  // les réponses qui manquaient : « combien coûte la livraison », « est-ce que
  // vous prenez MonCash », « à quelle heure êtes-vous ouverts », « je fais quel
  // taille », « qu'est-ce qu'il y a dedans ». Un marchand qui n'y répond pas
  // sur sa page y répond dix fois par jour sur WhatsApp, et perd les acheteurs
  // qui n'écrivent pas.
  //
  // Deux d'entre elles ne se saisissent presque pas : « Livraison » et
  // « Paiement » lisent les modes RÉELS des réglages de la boutique — ceux que
  // la caisse appliquera. Le marchand n'écrit ici que ce qu'ils ne disent pas :
  // sa zone, sa politique de retour.

  /**
   * La présentation : qui vous êtes, et ce que vous faites pour vos clients.
   *
   * C'est la section qui manquait le plus. « Notre histoire » raconte le passé
   * de la maison ; celle-ci dit le PRÉSENT — ce que le visiteur peut attendre,
   * en trois ou quatre points, avec les mots qui donnent envie.
   *
   * Elle se rédige à l'IA depuis l'éditeur (`draftStorePresentation`), à partir
   * des faits réels de la boutique : son nom, ses rayons, ses modes de livraison
   * et de paiement. Le marchand relit, corrige, enregistre. Rien n'est publié
   * sans son geste, et le rédacteur a interdiction d'inventer une ancienneté,
   * un nombre de clients ou une certification — c'est la règle qui vaut déjà
   * pour les fiches produits (`lib/ai/copywriter.ts`).
   */
  presentation: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    title:   z.string().max(80).catch(''),
    intro:   z.string().max(600).catch(''),
    items:   z.array(z.object({
      title: z.string().max(70),
      body:  z.string().max(320).catch(''),
    })).max(4).catch([]),
    ctaLabel: z.string().max(40).catch(''),
    ctaHref:  z.string().max(200).catch(''),
  })),

  /**
   * Livraison & retours.
   *
   * Les modes et leurs prix viennent de `store_settings.shipping_modes` : les
   * retaper ici, c'est signer une promesse que la caisse ne tiendra pas le jour
   * où l'un des deux change.
   */
  shipping: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    title:   z.string().max(80).catch('Livraison & retours'),
    /** La zone couverte, les jours de tournée — ce que les modes ne disent pas. */
    note:    z.string().max(240).catch(''),
    /** La politique de retour, en clair. Vide : aucune promesse n'est écrite. */
    returns: z.string().max(400).catch(''),
  })),

  /** Comment payer. Les modes viennent de `store_settings.payment_methods`. */
  payments: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    title:   z.string().max(80).catch('Comment payer'),
    note:    z.string().max(240).catch(''),
  })),

  /**
   * Nous joindre : les horaires, et les moyens de contact déjà enregistrés.
   *
   * Le téléphone, l'adresse et WhatsApp ne se ressaisissent pas — ils sont dans
   * les réglages. Les horaires, si : ils n'existent nulle part ailleurs, et
   * « ouvert ? » est la question qu'on pose avant de traverser la ville.
   */
  contact: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    title:   z.string().max(80).catch('Nous joindre'),
    body:    z.string().max(240).catch(''),
    hours:   z.array(z.object({
      days:  z.string().max(40),
      hours: z.string().max(40).catch(''),
    })).max(7).catch([]),
  })),

  /**
   * La vidéo.
   *
   * Elle n'est pas hébergée : c'est un lien YouTube, Vimeo ou Facebook, et la
   * page l'ouvre chez eux plutôt que d'embarquer un lecteur de 300 ko sur une
   * connexion haïtienne. La vignette reste l'affaire du marchand.
   */
  video: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('En vidéo'),
    body:    z.string().max(240).catch(''),
    url:     z.string().url().nullable().catch(null),
  })),

  /** Ils nous font confiance : marques, partenaires, distributeurs. */
  partners: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Ils nous font confiance'),
    items:   z.array(z.object({
      name:    z.string().max(60),
      logoUrl: z.string().url().nullable().catch(null),
    })).max(8).catch([]),
  })),

  /**
   * Le guide des tailles.
   *
   * Un tableau, saisi en lignes de valeurs séparées par des virgules — « S, 86,
   * 68, 92 ». C'est moins élégant qu'un éditeur de tableau, et c'est le seul
   * format qu'un marchand remplit depuis un téléphone sans y passer l'après-midi.
   * Il divise par deux les retours en prêt-à-porter, ce qu'aucune photo ne fait.
   */
  sizeGuide: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Guide des tailles'),
    note:    z.string().max(240).catch(''),
    /** L'en-tête : « Taille, Poitrine, Tour de taille, Hanches ». */
    columns: z.string().max(160).catch(''),
    rows:    z.array(z.object({ cells: z.string().max(160) })).max(14).catch([]),
  })),

  /**
   * La composition : ce qu'il y a dedans, et à quoi ça sert.
   *
   * Un complément, un soin ou un plat se vendent sur leur composition. Le
   * marchand la donne ; nous ne l'inventons pas — une allégation de santé
   * écrite à sa place l'expose lui, pas nous.
   */
  ingredients: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Ce qu\'il y a dedans'),
    body:    z.string().max(240).catch(''),
    items:   z.array(z.object({
      name: z.string().max(60),
      role: z.string().max(160).catch(''),
    })).max(8).catch([]),
  })),

  /** L'équipe : qui vous recevra. Une prestation s'achète à quelqu'un. */
  team: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('L\'équipe'),
    members: z.array(z.object({
      name:     z.string().max(60),
      role:     z.string().max(60).catch(''),
      photoUrl: z.string().url().nullable().catch(null),
    })).max(6).catch([]),
  })),

  // ── Ce que les six métiers demandaient encore ────────────────────────────
  //
  // Les sections précédentes vendent et répondent. Ces six-là closent l'écart
  // qui restait entre nos vitrines et un vrai site du métier concerné :
  //
  //   Élevage      un prix qui baisse avec la quantité, et ce qui est dispo
  //   Prestataire  des forfaits comparables, et la preuve d'un résultat
  //   Artisan      un journal, parce que le savoir-faire se lit
  //   Vendeur      des vidéos, parce que c'est là que le produit a été vu
  //
  // Même règle que tout ce qui précède : vide → la section n'existe pas, et
  // aucun chiffre n'est inventé à la place du marchand.

  /**
   * Les prix dégressifs : « 1 à 20 → 1 300 HTG », « 51 et plus → sur devis ».
   *
   * Le cœur de la vente en gros, et ce qui manquait au gabarit Élevage : sans
   * cette grille, l'acheteur qui veut trente têtes doit écrire pour connaître
   * son prix, et la moitié n'écrit pas.
   *
   * Quantités et prix sont du TEXTE, pas des nombres. « Sur devis » est un prix
   * parfaitement valide sur ce rayon, et « 21 à 50 » n'est pas un entier.
   */
  wholesale: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Vous achetez en quantité ?'),
    body:    z.string().max(240).catch(''),
    tiers:   z.array(z.object({
      quantity: z.string().max(40),
      price:    z.string().max(40),
      note:     z.string().max(60).catch(''),
    })).max(6).catch([]),
    ctaLabel: z.string().max(40).catch('Demander un devis'),
  })),

  /**
   * Les forfaits d'un prestataire, comparés côte à côte.
   *
   * Une prestation ne se vend pas comme un produit : le client ne compare pas
   * deux objets, il compare deux niveaux d'accompagnement. Les avantages se
   * saisissent une ligne par ligne — c'est le seul format qu'on remplit depuis
   * un téléphone sans y passer l'après-midi, comme le guide des tailles.
   */
  packages: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Nos formules'),
    body:    z.string().max(240).catch(''),
    items:   z.array(z.object({
      name:     z.string().max(60),
      price:    z.string().max(40).catch(''),
      /** « par séance », « par mois » — ce que le prix couvre. */
      period:   z.string().max(30).catch(''),
      body:     z.string().max(200).catch(''),
      /** Un avantage par ligne. */
      features: z.string().max(600).catch(''),
      ctaLabel: z.string().max(40).catch(''),
      ctaHref:  z.string().max(200).catch(''),
      /**
       * Le forfait mis en avant. Un seul est mis en valeur au rendu — trois
       * formules toutes « recommandées » ne recommandent rien.
       */
      featured: z.boolean().catch(false),
    })).max(4).catch([]),
  })),

  /**
   * Les résultats obtenus : d'où le client partait, où il est arrivé.
   *
   * C'est ce qui vend une prestation, et c'est aussi ce qu'un prestataire n'a
   * nulle part où écrire aujourd'hui. Le « avant » et le « après » sont deux
   * champs distincts parce que c'est l'ÉCART qui est l'argument, et qu'un
   * paragraphe unique le noie.
   */
  caseStudies: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Des résultats concrets'),
    body:    z.string().max(240).catch(''),
    items:   z.array(z.object({
      client:   z.string().max(60).catch(''),
      before:   z.string().max(240),
      after:    z.string().max(240),
      quote:    z.string().max(280).catch(''),
      imageUrl: z.string().url().nullable().catch(null),
    })).max(4).catch([]),
  })),

  /**
   * Le journal : conseils, coulisses, savoir-faire.
   *
   * Chez un artisan, il vend la pièce mieux que la pièce ; chez un éleveur,
   * « comment choisir un poulet de qualité » amène les acheteurs qui ne
   * savaient pas encore qu'ils achèteraient.
   *
   * Les articles ne sont pas hébergés ici : le lien pointe où le marchand écrit
   * déjà — une publication Facebook, un billet, une vidéo. Une salle de
   * rédaction dans un logiciel de gestion resterait vide.
   */
  journal: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('Le journal'),
    body:    z.string().max(240).catch(''),
    items:   z.array(z.object({
      title:    z.string().max(120),
      excerpt:  z.string().max(280).catch(''),
      imageUrl: z.string().url().nullable().catch(null),
      href:     z.string().max(200).catch(''),
      /** Libre : « Mars 2026 », « la semaine dernière ». Vide : rien ne s'affiche. */
      date:     z.string().max(40).catch(''),
    })).max(6).catch([]),
  })),

  /**
   * Le mur de vidéos, chacune reliée à un article du catalogue.
   *
   * C'est la grammaire du vendeur social : le visiteur a vu le produit dans une
   * vidéo, il vient le retrouver. Le lien vers la fiche est donc le vrai sujet
   * de la section — pas la vidéo.
   *
   * Rien n'est embarqué : la vignette vient de l'article ou du marchand, et la
   * vidéo s'ouvre chez son hébergeur. Quatre lecteurs sur une même page
   * coûteraient plus d'un mégaoctet sur une connexion comptée.
   */
  videoWall: selfFilling(z.object({
    enabled: z.boolean().catch(false),
    title:   z.string().max(80).catch('À voir'),
    body:    z.string().max(240).catch(''),
    items:   z.array(z.object({
      url:   z.string().url(),
      label: z.string().max(60).catch(''),
      /** L'article montré. Vide : la vignette n'ouvre que la vidéo. */
      productId: z.string().max(60).catch(''),
      posterUrl: z.string().url().nullable().catch(null),
    })).max(6).catch([]),
  })),

  /**
   * Les disponibilités du moment.
   *
   * Elle ne stocke qu'un titre et une note : les quantités viennent du STOCK
   * réel, article par article. C'est tout l'intérêt — une liste de
   * disponibilités tenue à la main est fausse le lendemain, et sur un rayon
   * d'élevage, une disponibilité fausse est un déplacement pour rien.
   */
  availability: selfFilling(z.object({
    enabled: z.boolean().catch(true),
    title:   z.string().max(80).catch('Disponibles actuellement'),
    note:    z.string().max(240).catch(''),
  })),

  social: selfFilling(z.object({
    instagram: z.string().max(200).catch(''),
    facebook:  z.string().max(200).catch(''),
    tiktok:    z.string().max(200).catch(''),
    whatsapp:  z.string().max(200).catch(''),
  })),

  /**
   * Le lancement guidé (§45).
   *
   * Neuf des dix étapes se LISENT dans la base : un logo est là ou n'y est
   * pas, un mode de paiement existe ou non. Aucune n'a besoin d'être stockée,
   * et c'est ce qui empêche la liste de mentir — elle ne peut pas afficher
   * « fait » sur une étape défaite entre-temps.
   *
   * La dixième, l'aperçu, est la seule qui ne laisse aucune trace en base :
   * regarder sa vitrine ne modifie rien. Elle est donc notée ici, à la date où
   * le marchand a réellement ouvert l'aperçu. C'est du contenu de vitrine au
   * sens strict, non — mais c'est le seul endroit déjà attaché à
   * `store_settings` et déjà versionné avec elle, et cela évite une colonne de
   * plus pour un horodatage.
   */
  launch: selfFilling(z.object({
    previewedAt: z.string().max(40).nullable().catch(null),
  })),
});

export type ThemeConfig = z.infer<typeof themeConfigSchema>;

/** Le thème complet, tous champs remplis, quand la base ne dit rien. */
export const DEFAULT_THEME: ThemeConfig = themeConfigSchema.parse({});

// ── La palette de départ d'un gabarit ───────────────────────────────────────
//
// Un gabarit sans couleurs propres n'est pas un gabarit : c'est une mise en
// page. Le marine et l'émeraude de ProfitPilot conviennent à un tableau de
// bord ; posés sur la vitrine d'un traiteur, ils en font une application de
// comptabilité qui vend des gâteaux.
//
// Ces palettes sont donc un POINT DE DÉPART, jamais une contrainte : le
// marchand les voit dans ses sélecteurs de couleur, elles sont modifiables, et
// une vitrine qui a déjà ses couleurs les garde (voir `parseThemeConfig`).
//
// Chacune respecte la même discipline que la palette du produit : un fond
// neutre, une couleur de structure, UNE couleur d'action — et le contraste du
// bouton d'achat est vérifié, pas supposé (`readableInk`).

type BrandPreset = {
  palette:    ThemeConfig['palette'];
  typography: ThemeConfig['typography'];
};

const BRAND_PRESETS: Partial<Record<TemplateId, BrandPreset>> = {

  // Boutique de proximité : blanc franc, encre presque noire, une action rose
  // vif. Le rose n'est pas décoratif — c'est le seul point coloré de la page,
  // donc l'œil ne peut le confondre avec rien d'autre que « acheter ».
  proximite: {
    palette: { primary: '#141B22', accent: '#D6165F', surface: '#FFFFFF',
               surface2: '#F7F4F5', ink: '#1C242C' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Vendeur social : fond sombre pour la bannière, magenta pour l'action. La
  // grammaire d'un fil Instagram, transposée sans en copier les codes ratés.
  social: {
    palette: { primary: '#160B24', accent: '#D91B84', surface: '#FFFFFF',
               surface2: '#F8F3FB', ink: '#1B1226' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Artisan : ivoire, brun, un or mat. La typographie éditoriale porte le
  // reste — sur ce gabarit, la couleur se tait pour que la matière parle.
  artisan: {
    palette: { primary: '#3A2A1B', accent: '#A9763A', surface: '#FFFCF7',
               surface2: '#F4EDE3', ink: '#2E241B' },
    typography: { heading: 'serif', body: 'inter' },
  },

  // Prestataire : bleu profond de confiance, bleu franc pour la prise de
  // rendez-vous. Deux bleus, donc, et c'est voulu : la structure et l'action
  // appartiennent ici au même monde, celui du sérieux professionnel.
  services: {
    palette: { primary: '#0F2A4A', accent: '#1D5FCB', surface: '#FFFFFF',
               surface2: '#F1F5FA', ink: '#16212E' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Élevage : vert sombre, vert franc, blanc. Le vert d'action est plus foncé
  // que l'émeraude du produit — il se lit dehors, sur un téléphone, au marché.
  agri: {
    palette: { primary: '#143D28', accent: '#17753A', surface: '#FFFFFF',
               surface2: '#F2F7F2', ink: '#18241C' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Traiteur : crème, chocolat, terracotta. Les trois couleurs de la nourriture
  // photographiée — elles n'entrent jamais en concurrence avec l'assiette.
  traiteur: {
    palette: { primary: '#40200F', accent: '#D9631A', surface: '#FFFDFA',
               surface2: '#FBF2EA', ink: '#2B1A10' },
    typography: { heading: 'serif', body: 'inter' },
  },

  // ── Les cinq presets de rayon (§33) ───────────────────────────────────────
  //
  // Ils sont restés un temps sans couleurs, et la vitrine le disait : « Fashion
  // Atelier » rendait une mise en page éditoriale avec le bouton émeraude du
  // tableau de bord. C'est exactement ce que l'en-tête de ce bloc interdit —
  // une application de comptabilité qui vend des robes.
  //
  // Chacune est choisie pour ne ressembler à aucune des six autres : sur onze
  // aperçus parcourus à la file, deux palettes voisines font douter le marchand
  // d'avoir changé de gabarit.

  // Fashion Atelier : monochrome. Le noir n'est pas une absence de couleur ici,
  // c'est LA couleur du prêt-à-porter — et la photographie, seule chose colorée
  // de la page, n'a plus rien contre quoi lutter.
  fashion: {
    palette: { primary: '#141414', accent: '#1C1C1C', surface: '#FFFFFF',
               surface2: '#F4F1EE', ink: '#1A1A1A' },
    typography: { heading: 'serif', body: 'inter' },
  },

  // Beauty Studio : mauve profond et rose sourd sur un blanc à peine rosé. Plus
  // sombre que les deux magentas de Proximité et Social, avec lesquels il ne
  // doit pas se confondre — c'est de la douceur, pas de la promotion.
  beauty: {
    palette: { primary: '#3B2B36', accent: '#A8577C', surface: '#FFFDFD',
               surface2: '#F8F0F3', ink: '#2A1F26' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Tech Store : encre bleu-nuit et un sarcelle franc. Le bleu de Prestataire
  // était déjà pris, et deux bleus voisins sur deux gabarits voisins ne se
  // distinguent pas ; le sarcelle se lit « technique » sans copier personne.
  tech: {
    palette: { primary: '#101A24', accent: '#0E7C86', surface: '#FFFFFF',
               surface2: '#F2F5F8', ink: '#141C26' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Food Market : olive sombre et rouge tomate sur un crème. Le Traiteur porte
  // le chocolat et la terracotta d'une pâtisserie ; celui-ci est un marché, et
  // le rouge y est la couleur de l'étal, pas du dessert.
  food: {
    palette: { primary: '#1F2A16', accent: '#C43C2B', surface: '#FFFDF8',
               surface2: '#F5F2E9', ink: '#22271C' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Modern Retail : le marine et l'émeraude de ProfitPilot, et c'est délibéré.
  // C'est le gabarit polyvalent, celui que prend le marchand qui ne se
  // reconnaît dans aucun rayon ; c'est aussi le successeur de « modern », dont
  // les vitrines portent déjà ces deux couleurs. L'écrire ici plutôt que de le
  // laisser au repli dit que c'est un choix, pas un oubli.
  retail: {
    palette: { primary: '#001F3F', accent: '#50C878', surface: '#FFFFFF',
               surface2: '#F6F8FA', ink: '#2A3846' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // ── Les huit gabarits de marque en ligne (§35) ────────────────────────────
  //
  // Un mot d'honnêteté sur ces huit-là. La règle plus haut — deux palettes
  // voisines font douter le marchand d'avoir changé de gabarit — a été écrite
  // pour onze. À dix-neuf, elle ne tient plus toute seule : ces huit marques
  // vivent dans le même registre (fond clair, une couleur de structure sombre,
  // une action franche), et cinq d'entre elles vendent quelque chose de
  // « sain », donc cinq d'entre elles sont vertes.
  //
  // Ce qui les sépare n'est donc pas la seule teinte. C'est la composition
  // (`storeDesign`), l'ordre de la page (`storeSections`) et la typographie.
  // Deux verts foncés sur deux pages qui ne se ressemblent en rien ne se
  // confondent pas — et le marchand voit maintenant la vignette avant de
  // choisir, ce qui règle ce que la couleur seule ne réglait pas.
  //
  // Les teintes ont quand même été écartées les unes des autres autant que le
  // sujet le permettait : forêt sourd, olive, menthe, sapin froid.

  // Compléments : vert forêt très sombre sur un crème chaud, typographie
  // sérif. La couleur d'action est SOURDE, pas franche — un complément
  // alimentaire se vend par le sérieux, et un bouton criard le décrédibilise.
  wellness: {
    palette: { primary: '#24402C', accent: '#31593B', surface: '#FFFDF8',
               surface2: '#F3EFE4', ink: '#232C25' },
    typography: { heading: 'serif', body: 'inter' },
  },

  // Soin : sable chaud, sapin pour la structure, brun presque noir pour
  // l'action. Le noir chaud plutôt que le noir neutre de Fashion Atelier :
  // c'est ce qui empêche les deux monochromes de se confondre.
  skincare: {
    palette: { primary: '#2C4230', accent: '#3A3128', surface: '#FDFBF7',
               surface2: '#F3EBE0', ink: '#241F1B' },
    typography: { heading: 'serif', body: 'inter' },
  },

  // Animalerie : olive chaud sur blanc franc. L'olive est le seul des cinq
  // verts qui tire vers le jaune — c'est ce qui le distingue au premier coup
  // d'œil de l'émeraude de l'élevage et de la menthe du bien-être.
  animalerie: {
    palette: { primary: '#3D5230', accent: '#5A7A32', surface: '#FFFFFF',
               surface2: '#F2F5EB', ink: '#232A1E' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Mode éditoriale : noir et greige. Fashion Atelier est un lookbook en sérif
  // très aéré ; celui-ci est une boutique, en sans-sérif et plus dense. Même
  // monochrome, deux pages qui ne se lisent pas du tout pareil.
  magazine: {
    palette: { primary: '#0E0E0E', accent: '#0E0E0E', surface: '#FCFBF9',
               surface2: '#EEEAE4', ink: '#1A1A1A' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Sport : le seul gabarit du produit dont la SURFACE est sombre. Ce n'est
  // pas un en-tête sombre posé sur une page claire — c'est une page noire, et
  // le vert citron y est la seule chose qui brille, donc la seule chose qu'on
  // clique. `themeCssVars` sait tenir ce cas : les encres secondaires et les
  // filets se calculent vers la surface, pas vers le blanc.
  sport: {
    palette: { primary: '#0B0C0E', accent: '#C6F048', surface: '#0E0F12',
               surface2: '#191B20', ink: '#F2F4F1' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Fait main : écorce et argile sur un crème plus vert que celui de
  // l'Artisan. Les deux gabarits partagent la matière ; l'un vend des pièces
  // (bijoux), l'autre vend un récit (coopérative, commerce équitable).
  maker: {
    palette: { primary: '#4A3527', accent: '#9A5F32', surface: '#FDFAF4',
               surface2: '#F1E9DC', ink: '#2E2318' },
    typography: { heading: 'serif', body: 'inter' },
  },

  // Naturel : sapin froid et menthe sur un blanc bleuté. C'est le versant
  // clair et clinique du bien-être, quand `wellness` en est le versant chaud
  // et premium.
  naturel: {
    palette: { primary: '#1E4A3F', accent: '#10836B', surface: '#FBFDFC',
               surface2: '#E9F3EF', ink: '#1A2A26' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Produit unique : bleu-nuit presque noir, et rien d'autre. Une page qui ne
  // vend qu'un article n'a pas besoin d'une couleur d'action distincte de sa
  // structure — il n'y a qu'un bouton sur la page, on ne peut pas le rater.
  monoproduit: {
    palette: { primary: '#13212E', accent: '#13212E', surface: '#FFFFFF',
               surface2: '#F2F5F7', ink: '#1A222B' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // ── Les trois gabarits historiques ────────────────────────────────────────
  //
  // Ils n'en avaient pas, et l'argument était bon : leur en donner un
  // repeindrait la vitrine d'un marchand qui n'a rien demandé. Sauf qu'il
  // produisait le défaut exact que les presets existent pour empêcher —
  // `retail`, `luxe`, `modern` et `flash` rendaient LA MÊME palette, le marine
  // et l'émeraude du tableau de bord. Quatre gabarits sur vingt-deux
  // indiscernables par la couleur, dont le gabarit de REPLI : celui que voit
  // tout marchand qui n'a jamais ouvert le sélecteur.
  //
  // Ce qui rend la correction sûre, et c'est la seule raison de la faire :
  // `parseThemeConfig` n'applique un preset qu'à une vitrine **qui n'a pas
  // enregistré sa palette**. Un marchand qui a choisi ses couleurs les garde,
  // intégralement. Celui qui est repeint est celui qui n'avait jamais choisi —
  // et qui affichait donc, sans le savoir, les couleurs de l'application de
  // gestion plutôt que les siennes.
  //
  // `retail` garde le marine : c'est écrit plus haut comme un choix, avec sa
  // raison — le gabarit polyvalent, successeur de `modern`. Trois palettes
  // neuves, pas quatre.

  // Luxe : presque-noir CHAUD et or sourd sur un ivoire. `fashion` et
  // `magazine` sont eux aussi quasi monochromes, mais froids ; c'est la
  // température qui les sépare à l'œil, et le serif qui achève de le dire.
  //
  // L'or a été assombri de #8C7B5A à #756648, et c'est la méthode du §31 : le
  // premier ne donnait que 4,35:1 avec la meilleure encre des deux — sous le
  // plancher AA, sur le bouton qui porte le montant. Teinte et saturation
  // conservées à l'identique, luminosité descendue : 5,6:1 en blanc.
  luxe: {
    palette: { primary: '#1A1714', accent: '#756648', surface: '#FDFBF7',
               surface2: '#F2EDE4', ink: '#211C17' },
    typography: { heading: 'serif', body: 'inter' },
  },

  // Moderne & Conversion : encre violette et violet franc. Le violet était la
  // seule famille libre des dix-huit autres palettes — aucun gabarit ne
  // l'emploie — et c'est ce qui compte ici plus qu'ailleurs : ce gabarit est le
  // repli du produit, donc celui qu'on risque le plus de confondre avec un
  // autre. Il ne ressemble désormais à rien d'autre du catalogue.
  modern: {
    palette: { primary: '#1E1B33', accent: '#6D4AFF', surface: '#FFFFFF',
               surface2: '#F4F3FB', ink: '#201D33' },
    typography: { heading: 'inter', body: 'inter' },
  },

  // Catalogue Flash : graphite et ambre. La grammaire de la vente éclair, et
  // l'ambre est libre lui aussi. Il se distingue des trois oranges du catalogue
  // — terracotta du traiteur, rouge d'étal du marché, bronze de l'artisan — par
  // sa saturation : celui-ci est un signal, pas une matière.
  flash: {
    palette: { primary: '#121417', accent: '#FFB703', surface: '#FFFFFF',
               surface2: '#F5F5F3', ink: '#1A1D21' },
    typography: { heading: 'inter', body: 'inter' },
  },
};

/**
 * Les couleurs et les familles typographiques que ce gabarit propose.
 *
 * Les vingt-deux en ont un, y compris les trois historiques depuis le
 * 9 septembre 2026 — voir le bloc qui les introduit pour la raison du
 * changement et pour ce qui le rend sûr. Le repli ci-dessous ne sert donc plus
 * qu'à un `template_id` écrit à la main en base, que `resolveTemplateId` aurait
 * de toute façon ramené sur `modern`.
 */
export function brandPresetFor(templateId: TemplateId | string): BrandPreset {
  return (
    BRAND_PRESETS[templateId as TemplateId] ?? {
      palette:    DEFAULT_THEME.palette,
      typography: DEFAULT_THEME.typography,
    }
  );
}

// ── Ce que valent les deux couleurs héritées ────────────────────────────────
//
// `store_settings.primary_color` et `secondary_color` sont NOT NULL avec un
// DEFAULT en base (`20260702_online_store.sql`) : toute vitrine en porte deux,
// y compris celle créée il y a une minute par un marchand qui n'a jamais ouvert
// un sélecteur de couleur.
//
// Les prendre pour un choix rendait donc les palettes de gabarit
// INACCESSIBLES — pas rarement, jamais. « Traiteur » et « Fashion Atelier »
// décrivaient leur crème et leur monochrome dans ces fichiers, et rendaient le
// marine et l'émeraude du tableau de bord sur toutes les vitrines du produit.
//
// Une valeur égale au défaut de la colonne n'est donc pas un choix : c'est
// l'absence de choix. Elle laisse passer la couleur du gabarit.
//
// Le prix de cette règle, dit franchement : le marchand qui choisit
// délibérément ce marine-là dans l'ancien écran de réglages est indistinguable
// de celui qui n'a rien touché, et verra la couleur de son gabarit. Il la
// change dans l'éditeur, qui écrit alors une vraie palette — et une palette
// enregistrée passe devant tout, gabarit compris.
/** Les DEFAULT des deux colonnes héritées : ce qu'elles valent sans choix. */
export const LEGACY_DEFAULT_COLORS = { primary: '#001F3F', accent: '#50C878' } as const;

const LEGACY_DEFAULT_PRIMARY = LEGACY_DEFAULT_COLORS.primary.toLowerCase();
const LEGACY_DEFAULT_ACCENT  = LEGACY_DEFAULT_COLORS.accent.toLowerCase();

function chosenColor(value: string | null | undefined, columnDefault: string): string | null {
  if (!HEX.test(value ?? '')) return null;
  return value!.toLowerCase() === columnDefault ? null : value!;
}

/**
 * Vrai quand les colonnes héritées portent une couleur réellement choisie.
 *
 * L'éditeur en a besoin pour savoir si changer de gabarit peut changer les
 * couleurs : la vitrine d'avant le Store Builder dont le marchand avait posé
 * son bleu dans l'ancien écran le garde, exactement comme `parseThemeConfig`
 * le lui rend.
 */
export function hasLegacyColorChoice(
  legacy?: { primary_color?: string | null; secondary_color?: string | null } | null,
): boolean {
  return chosenColor(legacy?.primary_color, LEGACY_DEFAULT_PRIMARY) !== null
    || chosenColor(legacy?.secondary_color, LEGACY_DEFAULT_ACCENT) !== null;
}

/**
 * Le thème tel qu'il s'ÉCRIT en base.
 *
 * `parseThemeConfig` rend une palette complète à qui n'en a pas : c'est ce
 * qu'il faut pour afficher, pas pour enregistrer. Réécrire cet objet tel quel
 * posait la clé `palette` en base — et une palette enregistrée passe devant le
 * gabarit, pour TOUS les gabarits. Un enregistrement de contenu, ou la simple
 * ouverture de l'aperçu, figeait donc les couleurs du moment : les vingt-deux
 * gabarits rendaient la même teinte, et en changer ne changeait plus que la
 * mise en page.
 *
 * Seules s'écrivent la palette et la typographie que le marchand a choisies.
 * `chosen` les porte ; rien d'autre ne les fait entrer.
 */
export function themeForStorage(
  theme: ThemeConfig,
  chosen: { palette?: unknown; typography?: unknown },
): Record<string, unknown> {
  const stored: Record<string, unknown> = { ...theme };
  delete stored.palette;
  delete stored.typography;
  if (chosen.palette !== undefined) stored.palette = chosen.palette;
  if (chosen.typography !== undefined) stored.typography = chosen.typography;
  return stored;
}

/**
 * Lit un `theme_config` venu de la base. Ne lève jamais.
 *
 * Les couleurs héritées (`primary_color` / `secondary_color`, présentes sur
 * toutes les vitrines créées avant le Store Builder) servent de valeurs de
 * départ : un marchand qui avait choisi son bleu le retrouve, il n'a pas à
 * refaire son réglage parce que nous avons changé de moteur.
 */
export function parseThemeConfig(
  raw: unknown,
  legacy?: { primary_color?: string | null; secondary_color?: string | null },
  templateId?: TemplateId | string,
): ThemeConfig {
  const base = themeConfigSchema.safeParse(raw ?? {});
  const theme = base.success ? base.data : DEFAULT_THEME;

  const owns = (key: string) =>
    raw !== null && typeof raw === 'object' && key in (raw as object);

  const preset = brandPresetFor(templateId ?? '');

  // La typographie du gabarit ne s'applique qu'à qui n'en a pas choisi une.
  const typography = owns('typography') ? theme.typography : preset.typography;

  // Le CONTENU du gabarit se pose là où le marchand n'a rien écrit, et sur les
  // deux chemins de retour. Une vitrine neuve rendait cinq sections sur
  // quatorze — les neuf autres attendaient un texte que rien ne lui demandait
  // d'écrire. Voir `lib/storeContent.ts` pour la règle de substitution : elle
  // ne passe jamais devant ce que le marchand a saisi.
  const withContent = (t: ThemeConfig): ThemeConfig =>
    applyContentPreset(t, templateId ?? '', DEFAULT_THEME);

  // Une vitrine qui a enregistré sa palette la garde, intégralement. Changer
  // les couleurs d'un marchand parce qu'il a changé de gabarit, ce serait
  // défaire à sa place un réglage qu'il a fait exprès.
  if (owns('palette')) return withContent({ ...theme, typography });

  // Sinon : les couleurs du gabarit, puis les deux couleurs héritées quand
  // elles disent quelque chose. L'ordre compte — une boutique créée avant le
  // Store Builder porte un `primary_color` qu'un marchand a réellement choisi,
  // et ce choix-là passe devant le preset. Le défaut de la colonne, non : voir
  // le bloc au-dessus.
  return withContent({
    ...theme,
    typography,
    palette: {
      ...preset.palette,
      primary: chosenColor(legacy?.primary_color, LEGACY_DEFAULT_PRIMARY)
        ?? preset.palette.primary,
      accent: chosenColor(legacy?.secondary_color, LEGACY_DEFAULT_ACCENT)
        ?? preset.palette.accent,
    },
  });
}

// ── Contraste ───────────────────────────────────────────────────────────────

function toRgb(color: string): [number, number, number] {
  let h = color.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(color: string): number {
  const [r, g, b] = toRgb(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio WCAG entre deux couleurs. 4,5 est le plancher AA du texte courant. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * L'encre à poser sur un fond donné : celle des deux qui contraste le plus.
 *
 * Le marine plutôt que le noir pur — la même raison que dans le produit : le
 * noir pur sur une couleur saturée vibre. Le blanc n'est choisi que s'il gagne
 * vraiment.
 */
export function readableInk(background: string, dark = '#0E1822', light = '#FFFFFF'): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

/**
 * Rapproche une couleur d'une autre. `t = 0` rend `color`, `t = 1` rend `towards`.
 *
 * C'est ce qui remplace `shade()` pour tout ce qui se DÉDUIT du thème : une
 * encre secondaire, un filet. `shade(ink, 0.28)` éclaircissait vers le blanc,
 * ce qui n'a de sens que sur une page blanche — sur le gabarit Sport, dont la
 * surface est noire et l'encre presque blanche, il donnait des filets blancs
 * et un texte secondaire plus clair que le principal.
 *
 * Sur une surface blanche les deux fonctions sont identiques au bit près : les
 * vitrines existantes ne changent pas d'un pixel.
 */
export function mixToward(color: string, towards: string, t: number): string {
  const [r1, g1, b1] = toRgb(color);
  const [r2, g2, b2] = toRgb(towards);
  const f = (a: number, b: number) =>
    Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
  return `#${[f(r1, r2), f(g1, g2), f(b1, b2)]
    .map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Assombrit une couleur — pour un survol, ou pour rattraper un contraste. */
export function shade(color: string, amount: number): string {
  const [r, g, b] = toRgb(color);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + (amount < 0 ? v : 255 - v) * amount)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ── Variables CSS ───────────────────────────────────────────────────────────

/**
 * Le thème devient des variables CSS, posées une fois par le layout de la
 * vitrine. Les gabarits n'écrivent jamais une couleur en dur : ils lisent
 * `var(--st-accent)`. C'est ce qui rend le changement de gabarit instantané et
 * le changement de couleur global.
 */
export function themeCssVars(theme: ThemeConfig): Record<string, string> {
  const { palette, typography } = theme;
  return {
    '--st-primary':      palette.primary,
    '--st-primary-ink':  readableInk(palette.primary),
    '--st-primary-soft': mixToward(palette.primary, palette.surface, 0.9),
    '--st-accent':       palette.accent,
    // L'encre du bouton d'achat est calculée, jamais supposée blanche.
    '--st-accent-ink':   readableInk(palette.accent),
    '--st-accent-hover': shade(palette.accent, -0.12),
    '--st-surface':      palette.surface,
    '--st-surface-2':    palette.surface2,
    '--st-ink':          palette.ink,
    // Les encres secondaires et le filet se calculent VERS LA SURFACE, pas
    // vers le blanc : c'est la seule façon qu'ils aient un sens aussi bien sur
    // le crème d'un traiteur que sur le noir du gabarit Sport.
    '--st-ink-2':        mixToward(palette.ink, palette.surface, 0.28),
    '--st-ink-3':        mixToward(palette.ink, palette.surface, 0.48),
    '--st-border':       mixToward(palette.ink, palette.surface, 0.86),
    '--st-font-heading': FONT_CHOICES[typography.heading].stack,
    '--st-font-body':    FONT_CHOICES[typography.body].stack,
  };
}

/** La même chose, prête à poser dans un attribut `style`. */
export function themeStyle(theme: ThemeConfig): React.CSSProperties {
  return themeCssVars(theme) as unknown as React.CSSProperties;
}

// ── Domaines ────────────────────────────────────────────────────────────────

/**
 * Le domaine racine sur lequel les sous-domaines de vitrine sont servis.
 * En développement : `localhost:3000`, donc `maboutique.localhost:3000`.
 */
export function storeRootDomain(): string {
  return (
    process.env.NEXT_PUBLIC_STORE_ROOT_DOMAIN ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') ??
    'localhost:3000'
  );
}

/**
 * Le domaine racine accepte-t-il des sous-domaines de vitrine ?
 *
 * Non sur un domaine `*.vercel.app` : Vercel ne route ni ne certifie les
 * sous-domaines du domaine par défaut d'un projet. `maboutique.mon-projet.vercel.app`
 * résout (le joker DNS existe) mais la connexion échoue — le marchand qui tape
 * « Voir ma boutique » depuis son téléphone tombe sur une erreur de navigateur,
 * pas sur sa vitrine. Le lien marchait en développement, où le domaine racine
 * est `localhost:3000` et où les sous-domaines répondent.
 *
 * Le jour où un vrai domaine est posé (`NEXT_PUBLIC_STORE_ROOT_DOMAIN` avec un
 * DNS joker), les sous-domaines redeviennent la forme normale sans rien changer
 * ici.
 */
export function subdomainsRoutable(root = storeRootDomain()): boolean {
  return !root.endsWith('.vercel.app');
}

/** L'adresse publique d'une vitrine : domaine perso s'il existe, sinon slug. */
export function storePublicUrl(store: { slug: string; custom_domain?: string | null }): string {
  if (store.custom_domain) return `https://${store.custom_domain}`;
  const root = storeRootDomain();
  const protocol = root.startsWith('localhost') ? 'http' : 'https';
  // Pas de sous-domaine possible : le chemin, qui lui répond partout.
  if (!subdomainsRoutable(root)) return `${protocol}://${root}/store/${store.slug}`;
  return `${protocol}://${store.slug}.${root}`;
}

/**
 * L'adresse telle qu'on la MONTRE au marchand, découpée pour un champ de saisie :
 * ce qui précède le slug, et ce qui le suit. Un champ qui annonce
 * « .mon-projet.vercel.app » promet une adresse qui ne répond pas.
 */
export function storeAddressAffixes(root = storeRootDomain()): { prefix: string; suffix: string } {
  if (!subdomainsRoutable(root)) {
    return { prefix: `${root}/store/`, suffix: "" };
  }
  return { prefix: "", suffix: `.${root}` };
}

/**
 * Vrai quand l'hôte courant sert une VITRINE et non l'application.
 *
 * Pourquoi ce n'est pas déductible du chemin : le middleware réécrit
 * `maboutique.profitpilot.app/produits` vers `/store/maboutique/produits`, mais
 * une réécriture ne change pas la barre d'adresse — et `usePathname()` rend ce
 * que voit le navigateur, c'est-à-dire `/produits`. Tout code client qui
 * cherche `/store/` pour reconnaître une vitrine se trompe donc exactement là
 * où le marchand a mis son propre domaine.
 *
 * La conséquence était sévère : le garde-fou d'authentification de l'AppShell
 * ne reconnaissait pas ces pages comme publiques et envoyait le client du
 * marchand vers l'écran de connexion de ProfitPilot.
 *
 * La règle est prudente dans le bon sens : en cas de doute — variable
 * d'environnement absente, hôte inattendu — elle répond « faux ». Un doute ne
 * doit pas rendre l'application publique ; c'est le chemin `/store/` qui prend
 * alors le relais.
 */
export function isStorefrontHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();

  const appHost = (process.env.NEXT_PUBLIC_APP_URL ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();

  // L'application elle-même, sous toutes ses formes connues.
  if (!h || h === appHost || h === `www.${appHost}`) return false;
  if (h.startsWith('localhost') || h.startsWith('127.0.0.1')) return false;
  if (h.endsWith('.vercel.app')) return false;

  const root = storeRootDomain().toLowerCase();
  // Un sous-domaine de vitrine : « maboutique.profitpilot.app ».
  if (root && h.endsWith(`.${root}`)) {
    const candidate = h.slice(0, -(root.length + 1));
    return candidate.length > 0 && !candidate.includes('.');
  }

  // Un domaine personnalisé : ni l'application, ni un sous-domaine connu. Le
  // middleware l'a résolu côté serveur ; côté navigateur, on ne peut que le
  // constater.
  return h !== root && h !== appHost;
}

/**
 * L'adresse publique d'un rayon (§31).
 *
 * `/collections/soins-du-visage` plutôt que `/products?category=<uuid>`. Un
 * moteur de recherche indexe la première comme une page de rayon ; la seconde,
 * il la traite comme un filtre — quand il la garde. Et un visiteur qui colle
 * l'adresse dans un message sait ce qu'il envoie.
 *
 * Le libellé est normalisé, pas l'identifiant : c'est le libellé qui se lit.
 * La route accepte les deux, pour que les liens déjà en circulation continuent
 * de fonctionner.
 */
export function collectionHref(base: string, category: { id: string; name: string }): string {
  const segment = slugify(category.name) || encodeURIComponent(category.id);
  return `${base}/collections/${segment}`;
}

const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'auth', 'dashboard', 'store', 'boutique', 'checkout',
  'blog', 'docs', 'help', 'support', 'mail', 'ftp', 'cdn', 'assets', 'static', 'staging',
  'dev', 'test', 'preview', 'vercel', 'profitpilot', 'pricing', 'settings', 'onboarding',
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // « Épicerie » → « epicerie »
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** Même règle que la contrainte SQL — les deux doivent rester d'accord. */
export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (slug.length < 3)  return { ok: false, reason: 'Trois caractères au minimum.' };
  if (slug.length > 63) return { ok: false, reason: 'Soixante-trois caractères au maximum.' };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return { ok: false, reason: 'Lettres minuscules, chiffres et tirets ; ni au début ni à la fin.' };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, reason: `« ${slug} » est réservé par ProfitPilot.` };
  }
  return { ok: true };
}
