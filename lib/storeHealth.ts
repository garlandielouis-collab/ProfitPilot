// ─────────────────────────────────────────────────────────────────────────────
// Store Health Score — ce qui manque à la boutique, chiffré (§43, §44)
//
// « Store Health 82/100 », puis des recommandations : « Améliorez 5 photos »,
// « Ajoutez une description à 3 produits », « Ajoutez un mode de livraison ».
//
// ── Un score n'est utile que s'il est réparable ─────────────────────────────
//
// Chaque critère porte trois choses : ce qu'il vaut, ce qui lui manque EN
// NOMBRE, et l'écran où on le répare. Un score qui dit « SEO incomplet » sans
// dire combien de fiches ni où cliquer ne fait rien avancer — il informe le
// marchand qu'il a un problème et le laisse le chercher.
//
// ── Ce que le score ne fait pas ─────────────────────────────────────────────
//
// Il ne juge pas la QUALITÉ d'une photo. Le §44 parle de « qualité images » ;
// ici, la seule chose mesurable sans mentir est la PRÉSENCE d'une image. Un
// modèle qui noterait la netteté d'une photo produirait un chiffre que le
// marchand ne pourrait ni vérifier ni contester, et ce produit s'interdit les
// chiffres invérifiables (§10 de la constitution visuelle). Le Studio photo est
// proposé à côté ; il ne se déguise pas en note.
//
// Il ne s'invente pas de barème mouvant non plus : les poids sont écrits ici,
// en clair, et la somme fait exactement 100. Un score dont on ne peut pas
// reconstituer le calcul est un score auquel on ne croit pas.
//
// Fonction pure : aucune lecture de base. Les faits sont assemblés par
// `app/actions/storeInsights.ts`, et la note se calcule — et se teste — sans
// réseau.
// ─────────────────────────────────────────────────────────────────────────────

/** Les faits, tous comptés en base, jamais estimés. */
export type StoreHealthFacts = {
  /** La vitrine est ouverte au public. */
  isActive: boolean;

  /** Le catalogue de l'entreprise, toutes fiches confondues. */
  productCount: number;
  /** Ce qui est réellement visible sur la vitrine. */
  publishedCount: number;
  /** Parmi les fiches visibles : celles auxquelles il manque quelque chose. */
  missingImage: number;
  missingDescription: number;
  missingSeo: number;
  missingCategory: number;

  /** Réglages de la vitrine. */
  hasStoreSeo: boolean;
  hasLogo: boolean;
  hasTagline: boolean;
  hasCustomColors: boolean;
  hasContact: boolean;
  paymentMethodCount: number;
  /** Une passerelle est proposée mais ses identifiants manquent. */
  gatewayMissingCredentials: boolean;
  shippingModeCount: number;
};

export type HealthStatus = 'ok' | 'warn' | 'todo';

export type HealthCriterion = {
  key: string;
  /** Deux ou trois mots. C'est une ligne de liste, pas une phrase. */
  label: string;
  weight: number;
  /** Entre 0 et `weight`. */
  earned: number;
  status: HealthStatus;
  /** L'état, en clair : « 12 fiches sur 14 ». */
  detail: string;
  /** Ce qu'il faut faire. Absent quand le critère est tenu. */
  recommendation?: string;
  /** L'écran qui répare. */
  href: string;
};

export type StoreHealth = {
  score: number;
  /** `neuf` tant qu'aucun produit n'existe : la note n'a alors rien à dire. */
  level: 'neuf' | 'faible' | 'correct' | 'bon' | 'excellent';
  criteria: HealthCriterion[];
  /** Les critères non tenus, les plus lourds d'abord. */
  todo: HealthCriterion[];
};

const BUILDER = '/boutique/builder';
const SETTINGS = '/boutique';
const MERCH = '/boutique/merchandising';
const PRODUCTS = '/products';

/** Une proportion bornée, et 1 quand il n'y a rien à évaluer. */
function ratio(missing: number, total: number): number {
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, (total - missing) / total));
}

/** « 1 fiche » / « 3 fiches » — l'accord fait partie du soin. */
function fiches(n: number): string {
  return n === 1 ? '1 fiche' : `${n} fiches`;
}

export function computeStoreHealth(facts: StoreHealthFacts): StoreHealth {
  const visible = Math.max(0, facts.publishedCount);
  const c: HealthCriterion[] = [];

  // ── La vitrine est ouverte ────────────────────────────────────────────────
  c.push({
    key: 'published',
    label: 'Boutique en ligne',
    weight: 10,
    earned: facts.isActive ? 10 : 0,
    status: facts.isActive ? 'ok' : 'todo',
    detail: facts.isActive ? 'Ouverte au public' : 'Pas encore publiée',
    recommendation: facts.isActive ? undefined : 'Publiez votre boutique',
    href: BUILDER,
  });

  // ── Il y a de quoi acheter ────────────────────────────────────────────────
  //
  // Huit fiches : en dessous, une boutique se parcourt en un écran et ne donne
  // pas envie de revenir. Ce n'est pas un seuil de qualité, c'est le moment où
  // le catalogue commence à ressembler à un catalogue.
  const stockScore = visible === 0 ? 0 : Math.min(15, Math.round((visible / 8) * 15));
  c.push({
    key: 'catalog',
    label: 'Produits en vitrine',
    weight: 15,
    earned: stockScore,
    status: visible === 0 ? 'todo' : visible < 8 ? 'warn' : 'ok',
    detail:
      visible === 0
        ? 'Aucun produit publié'
        : `${fiches(visible)} sur ${facts.productCount} en vitrine`,
    recommendation:
      visible === 0
        ? facts.productCount === 0
          ? 'Créez votre premier produit'
          : 'Publiez au moins un produit sur la vitrine'
        : visible < 8
          ? `Publiez ${8 - visible} produit${8 - visible > 1 ? 's' : ''} de plus`
          : undefined,
    href: facts.productCount === 0 ? PRODUCTS : BUILDER,
  });

  // ── Les photos ────────────────────────────────────────────────────────────
  const photoRatio = ratio(facts.missingImage, visible);
  c.push({
    key: 'photos',
    label: 'Photos',
    weight: 15,
    earned: Math.round(photoRatio * 15),
    status: facts.missingImage === 0 ? 'ok' : facts.missingImage <= 2 ? 'warn' : 'todo',
    detail:
      visible === 0
        ? 'Rien à évaluer'
        : facts.missingImage === 0
          ? 'Toutes les fiches visibles ont une photo'
          : `${fiches(facts.missingImage)} sans photo`,
    recommendation:
      facts.missingImage > 0
        ? `Ajoutez une photo à ${fiches(facts.missingImage)}`
        : undefined,
    href: BUILDER,
  });

  // ── Les descriptions ──────────────────────────────────────────────────────
  const copyRatio = ratio(facts.missingDescription, visible);
  c.push({
    key: 'descriptions',
    label: 'Descriptions',
    weight: 15,
    earned: Math.round(copyRatio * 15),
    status:
      facts.missingDescription === 0 ? 'ok' : facts.missingDescription <= 2 ? 'warn' : 'todo',
    detail:
      visible === 0
        ? 'Rien à évaluer'
        : facts.missingDescription === 0
          ? 'Toutes les fiches visibles sont décrites'
          : `${fiches(facts.missingDescription)} sans description`,
    recommendation:
      facts.missingDescription > 0
        ? `Rédigez la description de ${fiches(facts.missingDescription)}`
        : undefined,
    href: MERCH,
  });

  // ── Le SEO des fiches ─────────────────────────────────────────────────────
  const seoRatio = ratio(facts.missingSeo, visible);
  c.push({
    key: 'product_seo',
    label: 'SEO des fiches',
    weight: 10,
    earned: Math.round(seoRatio * 10),
    status: facts.missingSeo === 0 ? 'ok' : facts.missingSeo <= 3 ? 'warn' : 'todo',
    detail:
      visible === 0
        ? 'Rien à évaluer'
        : facts.missingSeo === 0
          ? 'Toutes les fiches ont un titre Google'
          : `${fiches(facts.missingSeo)} sans titre Google`,
    recommendation:
      facts.missingSeo > 0 ? `Complétez le SEO de ${fiches(facts.missingSeo)}` : undefined,
    href: MERCH,
  });

  // ── Le SEO de la boutique ─────────────────────────────────────────────────
  c.push({
    key: 'store_seo',
    label: 'SEO de la boutique',
    weight: 5,
    earned: facts.hasStoreSeo ? 5 : 0,
    status: facts.hasStoreSeo ? 'ok' : 'todo',
    detail: facts.hasStoreSeo ? 'Titre et description renseignés' : 'Titre ou description manquant',
    recommendation: facts.hasStoreSeo
      ? undefined
      : 'Écrivez le titre et la description Google de la boutique',
    href: SETTINGS,
  });

  // ── Les rayons ────────────────────────────────────────────────────────────
  const catRatio = ratio(facts.missingCategory, visible);
  c.push({
    key: 'categories',
    label: 'Rayons',
    weight: 5,
    earned: Math.round(catRatio * 5),
    status: facts.missingCategory === 0 ? 'ok' : 'warn',
    detail:
      visible === 0
        ? 'Rien à évaluer'
        : facts.missingCategory === 0
          ? 'Toutes les fiches sont rangées'
          : `${fiches(facts.missingCategory)} sans rayon`,
    recommendation:
      facts.missingCategory > 0
        ? `Rangez ${fiches(facts.missingCategory)} dans un rayon`
        : undefined,
    href: PRODUCTS,
  });

  // ── Comment on vous joint ─────────────────────────────────────────────────
  c.push({
    key: 'contact',
    label: 'Contact',
    weight: 5,
    earned: facts.hasContact ? 5 : 0,
    status: facts.hasContact ? 'ok' : 'todo',
    detail: facts.hasContact ? 'Téléphone ou courriel affiché' : 'Aucun moyen de vous joindre',
    recommendation: facts.hasContact ? undefined : 'Ajoutez un numéro ou un courriel de contact',
    href: SETTINGS,
  });

  // ── Le paiement ───────────────────────────────────────────────────────────
  //
  // Une passerelle proposée sans identifiants est PIRE que pas de passerelle :
  // l'acheteur choisit MonCash, arrive sur une erreur, et ne revient pas. Ce
  // cas ne vaut donc pas la moitié des points, il en vaut zéro.
  const payOk = facts.paymentMethodCount > 0 && !facts.gatewayMissingCredentials;
  c.push({
    key: 'payment',
    label: 'Paiement',
    weight: 10,
    earned: payOk ? 10 : 0,
    status: payOk ? 'ok' : 'todo',
    detail: facts.gatewayMissingCredentials
      ? 'Une passerelle est proposée sans ses identifiants'
      : facts.paymentMethodCount === 0
        ? 'Aucun mode de paiement'
        : `${facts.paymentMethodCount} mode${facts.paymentMethodCount > 1 ? 's' : ''} accepté${facts.paymentMethodCount > 1 ? 's' : ''}`,
    recommendation: facts.gatewayMissingCredentials
      ? 'Renseignez les identifiants de votre passerelle de paiement'
      : facts.paymentMethodCount === 0
        ? 'Choisissez au moins un mode de paiement'
        : undefined,
    href: SETTINGS,
  });

  // ── La livraison ──────────────────────────────────────────────────────────
  const shipOk = facts.shippingModeCount > 0;
  c.push({
    key: 'shipping',
    label: 'Livraison',
    weight: 5,
    earned: shipOk ? 5 : 0,
    status: shipOk ? 'ok' : 'todo',
    detail: shipOk
      ? `${facts.shippingModeCount} mode${facts.shippingModeCount > 1 ? 's' : ''} de livraison`
      : 'Aucun mode de livraison',
    recommendation: shipOk ? undefined : 'Ajoutez un mode de livraison et son tarif',
    href: SETTINGS,
  });

  // ── L'identité ────────────────────────────────────────────────────────────
  const brandParts = [facts.hasLogo, facts.hasTagline, facts.hasCustomColors];
  const brandDone = brandParts.filter(Boolean).length;
  c.push({
    key: 'branding',
    label: 'Identité',
    weight: 5,
    earned: Math.round((brandDone / brandParts.length) * 5),
    status: brandDone === 3 ? 'ok' : brandDone >= 1 ? 'warn' : 'todo',
    detail: `${brandDone} sur 3 — logo, phrase d'accroche, couleurs`,
    recommendation:
      brandDone === 3
        ? undefined
        : !facts.hasLogo
          ? 'Ajoutez votre logo'
          : !facts.hasTagline
            ? "Écrivez la phrase d'accroche de la boutique"
            : 'Choisissez vos couleurs',
    href: BUILDER,
  });

  const score = Math.max(0, Math.min(100, c.reduce((sum, x) => sum + x.earned, 0)));

  const level: StoreHealth['level'] =
    facts.productCount === 0
      ? 'neuf'
      : score >= 90
        ? 'excellent'
        : score >= 75
          ? 'bon'
          : score >= 50
            ? 'correct'
            : 'faible';

  // Les manques, les plus lourds d'abord : c'est l'ordre dans lequel une heure
  // de travail rapporte le plus de points.
  const todo = c
    .filter((x) => x.recommendation)
    .sort((a, b) => b.weight - a.weight || b.earned - a.earned);

  return { score, level, criteria: c, todo };
}

/** Le ton de la note. Sert la couleur ET le mot affiché, pour qu'ils s'accordent. */
export function healthTone(level: StoreHealth['level']): 'neutral' | 'danger' | 'warning' | 'success' {
  switch (level) {
    case 'neuf':
      return 'neutral';
    case 'faible':
      return 'danger';
    case 'correct':
      return 'warning';
    default:
      return 'success';
  }
}
