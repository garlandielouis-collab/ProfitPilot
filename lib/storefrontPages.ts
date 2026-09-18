// ─────────────────────────────────────────────────────────────────────────────
// Les pages internes d'une vitrine
//
// Une vitrine avait huit adresses : l'accueil, le catalogue, la fiche, le
// rayon, le panier, la caisse, la confirmation, les favoris. Tout le reste —
// qui est ce marchand, comment on le joint, ce qu'il répond aux questions
// qu'on se pose avant de payer, comment il livre et ce qu'il reprend — vivait
// en bas de la page d'accueil, dans un empilement qu'il fallait faire défiler
// dix écrans pour atteindre.
//
// Ce n'est pas un problème de longueur, c'est un problème d'ADRESSE. Une
// question fréquente qu'on ne peut pas envoyer par message, une adresse
// postale qu'on ne peut pas mettre en favori, des conditions de retour
// qu'aucun lien ne désigne : le marchand n'a pas un site, il a une affiche.
//
// ── Ce que ce fichier décide, et ce qu'il ne décide pas ────────────────────
//
// Il décide QUELLES pages existent, dans quel ORDRE elles rangent leurs
// sections, et sous quel LIBELLÉ elles apparaissent. Il ne rend rien : chaque
// page est faite des sections que le moteur rend déjà pour l'accueil et pour la
// fiche produit. Aucune section nouvelle, aucun rendu en double — la même règle
// que `loadProductPageSections`, pour la même raison : une section recopiée
// ailleurs vieillit à la première correction faite dans l'autre.
//
// ── Une page vide n'existe pas ─────────────────────────────────────────────
//
// `infoPagesFor` ne rend que les pages dont CE marchand a la matière. Les deux
// conséquences comptent autant l'une que l'autre :
//
//   · le pied de page et la navigation ne proposent jamais un lien qui mène à
//     une page blanche — la même règle que le socle mobile, qui rétrécit
//     plutôt que de pointer dans le vide ;
//   · l'adresse elle-même rend 404, donc rien ne s'indexe et rien ne se
//     partage. Une vitrine de trois produits n'a pas à porter cinq pages vides
//     pour ressembler à un grand site.
//
// Les prédicats reprennent la garde de chaque section. C'est une duplication
// assumée et volontairement littérale : la garde vit dans le composant parce
// qu'il sert aussi l'accueil, et la décision d'ouvrir une adresse ne peut pas
// se prendre en rendant un composant React. `tests/storefrontPages.test.ts`
// tient les deux alignées.
// ─────────────────────────────────────────────────────────────────────────────

import {
  resolveSections, sectionTitle, sectionConfigSchema,
  type SectionKey, type StoredSection, type ResolvedSection,
} from './storeSections';
import type { ThemeConfig, TemplateId } from './storeTheme';

/**
 * Ce qu'une page interne a besoin de savoir de la vitrine.
 *
 * Structurel plutôt que nominal : `StoreView` le satisfait tel quel, et ce
 * fichier reste testable avec un objet littéral, sans monter une vitrine
 * entière.
 */
export type StorefrontLike = {
  theme:          ThemeConfig;
  paymentMethods: string[];
  shippingModes:  Array<{ label: string }>;
  whatsappPhone:  string | null;
  contactPhone:   string | null;
  contactEmail:   string | null;
  contactAddress: string | null;
  /** Vrai dès qu'un avis d'acheteur est publié. Vient de la base, pas du thème. */
  hasReviews:     boolean;
};

export type InfoPageKey = 'a-propos' | 'contact' | 'faq' | 'livraison-retours' | 'temoignages';

/**
 * Une page interne, telle que l'en-tête et le pied de page la reçoivent.
 *
 * DONNÉE PURE, et ce n'est pas un détail de style : `StorefrontHeader` est un
 * composant client. Un prédicat posé sur cet objet le traverserait, et React
 * refuse une fonction à cette frontière — « Functions cannot be passed directly
 * to Client Components ». La première version portait `hasContent` ici : elle
 * cassait TOUTES les pages de la vitrine, accueil compris, parce que l'en-tête
 * est partout. Les prédicats vivent donc dans `CONTENU` ci-dessous, que seul
 * le serveur lit.
 */
export type InfoPage = {
  key: InfoPageKey;
  /**
   * Le segment d'adresse. Il part dans des liens partagés et dans le sitemap :
   * il ne change plus.
   */
  slug: InfoPageKey;
  /** Le libellé court, pour le pied de page et la navigation. */
  label: string;
  /** Le titre de la page. */
  title: string;
  /**
   * Les sections de CETTE page, dans SON ordre.
   *
   * Ce n'est pas l'ordre de l'accueil : sur « À propos », l'histoire vient
   * avant le savoir-faire, qui vient avant l'équipe, quelle que soit la place
   * que le marchand leur a donnée sur sa page d'accueil. Une section dont le
   * thème est vide rend `null` d'elle-même.
   */
  sections: SectionKey[];
};

const filled = (value: string | null | undefined) => Boolean(value && value.trim());

/** Les liens de contact que `ContactSection` sait construire. */
function contactLinkCount(store: StorefrontLike): number {
  return [store.whatsappPhone, store.contactPhone, store.contactEmail].filter(filled).length;
}

/** Les réseaux réellement renseignés, comme `SocialSection` les compte. */
function socialCount(theme: ThemeConfig): number {
  const s = theme.social;
  return [s.instagram, s.facebook, s.tiktok].filter(filled).length;
}

/**
 * Les cinq pages, dans l'ordre où le pied de page les range.
 *
 * L'ordre suit ce qu'un acheteur cherche, du plus fréquent au plus rare :
 * comment on livre et ce qu'on reprend d'abord — c'est la question qui arrête
 * une commande —, les questions fréquentes ensuite, puis qui est ce marchand,
 * ce que ses clients en disent, et enfin comment le joindre.
 */
export const INFO_PAGES: InfoPage[] = [
  {
    key:   'livraison-retours',
    slug:  'livraison-retours',
    label: 'Livraison & retours',
    title: 'Livraison & retours',
    sections: ['shipping', 'payments', 'size_guide'],
  },
  {
    key:   'faq',
    slug:  'faq',
    label: 'Questions fréquentes',
    title: 'Questions fréquentes',
    sections: ['faq'],
  },
  {
    key:   'a-propos',
    slug:  'a-propos',
    label: 'À propos',
    title: 'À propos',
    // L'histoire, puis ce qu'on fait, puis comment on le fait, avec quoi, par
    // qui — et les preuves autour à la fin : chiffres, partenaires, journal.
    sections: [
      'brand_story', 'presentation', 'process', 'ingredients',
      'team', 'gallery', 'stats', 'partners', 'journal',
    ],
  },
  {
    key:   'temoignages',
    slug:  'temoignages',
    label: 'Témoignages',
    title: 'Ce que nos clients en disent',
    sections: ['testimonials'],
  },
  {
    key:   'contact',
    slug:  'contact',
    label: 'Nous joindre',
    title: 'Nous joindre',
    sections: ['contact', 'location', 'social'],
  },
];

/**
 * La matière existe-t-elle chez ce marchand ?
 *
 * Une table plutôt qu'un champ sur chaque page : voir l'avertissement sur
 * `InfoPage`. Ces fonctions ne quittent jamais le serveur.
 *
 * Chacune reprend la garde de la section correspondante — c'est la duplication
 * assumée annoncée en tête de fichier, et `tests/storefrontPages.test.ts` la
 * tient alignée.
 */
const CONTENU: Record<InfoPageKey, (store: StorefrontLike) => boolean> = {
  'livraison-retours': (s) => {
    const modes = s.shippingModes.filter((m) => filled(m.label)).length;
    const ship  = s.theme.shipping.enabled
      && (modes > 0 || filled(s.theme.shipping.note) || filled(s.theme.shipping.returns));
    const pay   = s.theme.payments.enabled
      && (s.paymentMethods.length > 0 || filled(s.theme.payments.note));
    const guide = s.theme.sizeGuide.enabled
      && s.theme.sizeGuide.rows.some((r) => filled(r.cells));
    return ship || pay || guide;
  },

  faq: (s) =>
    s.theme.faq.enabled
    && s.theme.faq.items.some((i) => filled(i.question) && filled(i.answer)),

  'a-propos': (s) => {
    const t = s.theme;
    return (t.brandStory.enabled && filled(t.brandStory.body))
      || (t.presentation.enabled
          && (filled(t.presentation.intro) || t.presentation.items.some((i) => filled(i.title))))
      || (t.process.enabled && t.process.steps.some((i) => filled(i.title)))
      || (t.ingredients.enabled
          && (filled(t.ingredients.body) || t.ingredients.items.some((i) => filled(i.name))))
      || (t.team.enabled && t.team.members.some((m) => filled(m.name)))
      || (t.gallery.enabled && t.gallery.images.some((i) => filled(i)))
      || (t.stats.enabled && t.stats.items.some((i) => filled(i.label)))
      || (t.partners.enabled && t.partners.items.some((i) => filled(i.name)))
      || (t.journal.enabled && t.journal.items.some((i) => filled(i.title)));
  },

  // Les avis d'acheteurs d'abord ; les citations du marchand ne portent la page
  // que tant qu'aucun vrai avis n'existe — exactement la règle de
  // `TestimonialsSection`.
  temoignages: (s) =>
    s.hasReviews
    || (s.theme.socialProof.enabled && s.theme.socialProof.items.some((i) => filled(i.text))),

  contact: (s) => {
    const c = s.theme.contact;
    const joignable = c.enabled
      && (filled(c.body) || c.hours.some((h) => filled(h.days)) || contactLinkCount(s) > 0);
    return joignable || filled(s.contactAddress) || socialCount(s.theme) > 0;
  },
};

/** La matière de CETTE page chez CE marchand. Serveur uniquement. */
export function infoPageHasContent(page: InfoPage, store: StorefrontLike): boolean {
  return CONTENU[page.key](store);
}

/** La page qui répond à ce segment d’adresse, si c’en est un. */
export function infoPageBySlug(slug: string): InfoPage | null {
  return INFO_PAGES.find((p) => p.slug === slug) ?? null;
}

/**
 * Les pages que CETTE vitrine porte réellement.
 *
 * Le pied de page, la navigation et le sitemap lisent tous cette liste : une
 * page absente d'ici n'est proposée nulle part et ne s'indexe pas.
 */
export function infoPagesFor(store: StorefrontLike): InfoPage[] {
  return INFO_PAGES.filter((p) => CONTENU[p.key](store));
}

/**
 * Les sections d'une page interne, dans l'ordre de la page.
 *
 * ── L'ordre du gabarit décide de l'ACCUEIL, pas de ce qu'une page contient ──
 *
 * `resolveSections` rend les sections du préréglage du gabarit, plus celles que
 * le marchand a touchées. La première version filtrait cette liste pour ne
 * garder que les sections de la page : le CONTENU d'une page dédiée dépendait
 * alors de la composition de la page d'accueil — deux décisions qui n'ont rien
 * à voir l'une avec l'autre.
 *
 * Le résultat se voyait. Le préréglage `agri` ne porte pas `testimonials` :
 * sa page « Témoignages » s'ouvrait sur son titre et rien d'autre, tout en
 * étant annoncée dans le pied de page. Douze préréglages ne portent ni
 * `contact`, ni `location`, ni `social` : leur page « Nous joindre » était vide
 * de la même façon, alors que le marchand avait bien saisi un numéro, et neuf
 * autres n’en montraient qu’un morceau. Six ne portent pas `faq`. C'est l'inverse exact de la règle que ces pages se
 * donnent — une page vide n'existe pas.
 *
 * La page porte donc ses sections elle-même : celle que le marchand a réglée si
 * elle existe, sa configuration par défaut sinon. `enabled` est forcé pour la
 * même raison — une section décrochée de l'accueil n'est pas une section
 * retirée du site, sans quoi « Nous joindre » disparaîtrait parce que le bloc
 * contact a été rangé ailleurs. Ce qui garde une page honnête reste
 * `infoPageHasContent` : l'adresse n'ouvre que si la matière existe.
 */
export function infoPageSections(
  templateId: TemplateId,
  storedSections: StoredSection[] | null | undefined,
  page: InfoPage,
): ResolvedSection[] {
  const resolus = new Map(
    resolveSections(templateId, storedSections).map((s) => [s.key, s]),
  );

  const ordered: ResolvedSection[] = page.sections.map((key, index) => {
    const s = resolus.get(key);
    return s
      ? { ...s, position: index, enabled: true }
      : { key, position: index, enabled: true, config: sectionConfigSchema.parse({}) };
  });

  // Le titre de la page suffit une fois.
  //
  // Sur « Questions fréquentes », le titre de la page et celui de sa seule
  // section sont le même mot. Afficher les deux donnerait un h1 suivi d'un h2
  // identique à dix pixels dessous. On vide donc le titre de la première
  // section quand il répète celui de la page : `SectionHeader` s'efface de
  // lui-même sur un titre vide, et le h1 de la page reste seul.
  return ordered.map((s, i) => {
    if (i !== 0) return s;
    const shown = sectionTitle(s, templateId).trim().toLowerCase();
    const repete = [page.label, page.title]
      .some((t) => t.trim().toLowerCase() === shown);
    if (!repete) return s;
    return { ...s, config: { ...s.config, title: '' } };
  });
}
