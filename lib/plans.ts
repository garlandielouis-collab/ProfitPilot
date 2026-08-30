// ─────────────────────────────────────────────────────────────────────────────
// Offres ProfitPilot — Esansyel (1 000 HTG) / Kwasans (2 500) / Elit (7 500)
//
// Les clés techniques ('Ti Machann' | 'Business Pilot' | 'Expert') restent
// celles stockées en base (subscriptions.plan_key, plans.key) pour ne rien
// casser. Les noms commerciaux du document de vente sont exposés comme
// libellés + acceptés en alias par `normalizePlanKey()`.
//
// Une offre n'est pas une liste de cases cochées, c'est un STADE de vie du
// marchand — d'où le champ `stage`, qui est ce qu'il lit en premier sur la
// page de prix. Il doit s'y reconnaître, pas s'y classer.
//
// Les arguments ci-dessous sont écrits de son côté de l'écran : « ce que chaque
// produit vous rapporte vraiment », jamais « analyse de marge par référence ».
// Le registre technique correspondant vit dans `planFeatures.ts` — c'est lui
// qui décide, celui-ci ne fait que le raconter.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanKey = 'Ti Machann' | 'Business Pilot' | 'Expert';

/** Nom commercial affiché au marchand (créole). */
export type PlanLabel = 'Esansyel' | 'Kwasans' | 'Elit';

/** Un texte affiché au marchand, dans ses deux langues. */
export type Bilingual = { fr: string; ht: string };

export type Plan = {
  key: PlanKey;
  /** Nom commercial affiché (Esansyel / Kwasans / Elit). */
  label: PlanLabel;
  priceG: number;
  priceUsd: number;
  /** Le stade de vie : la devise créole, et à qui elle parle. */
  stage: { kreyol: string; fr: Bilingual };
  description: Bilingual;
  /** Profil de marchand ciblé, repris du script de vente. */
  audience: string;
  features: Bilingual[];
  /** Ce que l'offre règle en une phrase, sous le bouton. */
  promise: Bilingual;
  highlight: Bilingual;
  popular?: boolean;
};

export const USD_RATE = 0.012;

export const PLANS: Plan[] = [
  {
    key: 'Ti Machann',
    label: 'Esansyel',
    priceG: 1000,
    priceUsd: 1000 * USD_RATE,
    stage: {
      kreyol: 'Kite kaye a',
      fr: {
        fr: 'Vous tenez encore vos comptes dans un cahier',
        ht: 'Ou toujou ap kenbe kont ou nan yon kaye',
      },
    },
    description: {
      fr: 'Sortir du cahier papier et ne plus rien perdre.',
      ht: 'Soti nan kaye papye a pou w pa pèdi anyen ankò.',
    },
    audience: 'Marchand seul, une boutique, qui démarre son suivi',
    features: [
      { fr: 'Ventes, dépenses et crédits illimités',            ht: 'Vant, depans ak kredi san limit' },
      { fr: 'Fonctionne sans internet, se synchronise après',   ht: 'Mache san entènèt, li senkronize apre' },
      { fr: "Argent de la maison séparé de l'argent du commerce", ht: 'Lajan kay la separe ak lajan komès la' },
      { fr: 'Qui vous doit combien, et depuis quand',           ht: 'Kiyès ki dwe ou konbyen, e depi kilè' },
      { fr: "Votre journée et votre semaine en un coup d'œil",  ht: 'Jounen ou ak semèn ou nan yon sèl kout je' },
      { fr: "Jusqu'à 50 produits, une boutique, une personne", ht: 'Jiska 50 pwodwi, yon boutik, yon moun' },
    ],
    promise: {
      fr: "Tout ce qu'il faut pour ne plus rien perdre.",
      ht: 'Tout sa w bezwen pou w pa pèdi anyen ankò.',
    },
    highlight: { fr: 'Petit commerce', ht: 'Ti komès' },
  },
  {
    key: 'Business Pilot',
    label: 'Kwasans',
    priceG: 2500,
    priceUsd: 2500 * USD_RATE,
    stage: {
      kreyol: 'Konprann pou grandi',
      fr: {
        fr: 'Vos chiffres sont là, il faut maintenant les lire',
        ht: 'Chif ou yo la, kounye a fòk ou li yo',
      },
    },
    description: {
      fr: 'Transformer ce que vous enregistrez en décisions.',
      ht: 'Fè sa w anrejistre a tounen desizyon.',
    },
    audience: 'Marchand avec une activité régulière, prêt à grandir',
    features: [
      { fr: 'Tout Esansyel, sans limite de produits',            ht: 'Tout Esansyel, san limit pwodwi' },
      { fr: 'Ce que chaque produit vous rapporte vraiment',      ht: 'Sa chak pwodwi rapòte ou vre' },
      { fr: 'Achetez en dollars, vendez en gourdes : le taux du jour fait le calcul', ht: 'Achte an dola, vann an goud : to jounen an fè kalkil la' },
      { fr: 'Relance WhatsApp écrite pour vous, montant et date compris', ht: 'Rapèl WhatsApp ekri pou ou, ak montan an ak dat la' },
      { fr: 'Prévenu avant la rupture de stock',                 ht: 'Yo avèti w anvan stòk la fini' },
      { fr: '30 questions par mois à votre assistant',           ht: '30 kesyon pa mwa pou asistan ou' },
      { fr: "Votre objectif du mois, et jusqu'à 3 personnes", ht: 'Objektif mwa ou, ak jiska 3 moun' },
    ],
    promise: {
      fr: 'L’offre de ceux qui veulent grandir cette année.',
      ht: 'Ofr moun ki vle grandi ane sa a.',
    },
    highlight: { fr: 'Recommandé', ht: 'Rekòmande' },
    popular: true,
  },
  {
    key: 'Expert',
    label: 'Elit',
    priceG: 7500,
    priceUsd: 7500 * USD_RATE,
    stage: {
      kreyol: 'Dirije tankou yon patron',
      fr: {
        fr: "D'autres tiennent la caisse à votre place",
        ht: 'Lòt moun ap kenbe kès la pou ou',
      },
    },
    description: {
      fr: 'Déléguer, se multiplier, et prévoir au lieu de subir.',
      ht: 'Delege, miltipliye tèt ou, epi prevwa olye pou w sibi.',
    },
    audience: 'Marchand qui délègue et suit plusieurs points de vente',
    features: [
      { fr: 'Tout Kwasans, sans compter les questions',          ht: 'Tout Kwasans, san konte kesyon yo' },
      { fr: "Jusqu'à 3 boutiques, comparées entre elles",     ht: 'Jiska 3 boutik, konpare youn ak lòt' },
      { fr: "Autant d'employés qu'il faut : chacun ne voit que ce qui le concerne", ht: 'Otan anplwaye ou bezwen : chak moun wè sèlman sa k gade l' },
      { fr: 'Qui a saisi, qui a annulé : le journal complet',    ht: 'Kiyès ki antre, kiyès ki anile : jounal konplè a' },
      { fr: 'Vos relances partent toutes seules',                ht: 'Rapèl ou yo pati pou kont yo' },
      { fr: 'Ce qu’il vous restera dans deux semaines, calculé pour vous', ht: 'Sa k ap rete ou nan de semèn, kalkile pou ou' },
      { fr: 'Un numéro WhatsApp qui répond en priorité',         ht: 'Yon nimewo WhatsApp ki reponn an priyorite' },
    ],
    promise: {
      fr: 'Pour diriger sans être derrière le comptoir.',
      ht: 'Pou w dirije san w pa dèyè kontwa a.',
    },
    highlight: { fr: 'Premium', ht: 'Premium' },
  },
];

/**
 * Ce que les trois offres partagent — affiché sous les cartes, parce que c'est
 * la peur qui empêche de payer : ce qu'il enregistre ne sera jamais retenu
 * contre lui.
 */
export const PLAN_COMMON_GROUND: Bilingual[] = [
  { fr: 'Ventes et dépenses illimitées',          ht: 'Vant ak depans san limit' },
  { fr: 'Fonctionne hors ligne',                  ht: 'Li mache san entènèt' },
  { fr: 'Vos données exportables à tout moment',  ht: 'Done ou yo ekspòtab nenpòt kilè' },
  { fr: "Changement d'offre immédiat",            ht: 'Chanjman ofr imedya' },
];

/** Clé technique → nom commercial. */
export const PLAN_LABELS: Record<PlanKey, PlanLabel> = {
  'Ti Machann':     'Esansyel',
  'Business Pilot': 'Kwasans',
  'Expert':         'Elit',
};

/**
 * L'offre appliquée quand le compte n'a AUCUN abonnement actif en base.
 *
 * Elle vaut Esansyel — le socle — et non Elit. Le repli précédent donnait
 * l'offre la plus haute à tout compte sans ligne d'abonnement : autrement dit
 * à presque tout le monde, y compris à celui qui venait de souscrire Esansyel.
 * C'est ce qui faisait que l'interface ne changeait jamais d'une offre à
 * l'autre — le verrouillage était bien écrit, mais il jugeait toujours un
 * « Elit » fictif.
 *
 * Une seule constante, lue par le serveur (`entitlements.ts`) ET par le
 * contexte client (`app/actions/company.ts`) : deux replis différents, et les
 * deux côtés répondraient différemment à « qu'a-t-il le droit de voir ? ».
 *
 * Pour offrir Elit pendant l'essai, ce n'est pas cette constante qu'il faut
 * changer : c'est une ligne `subscriptions` d'essai qu'il faut écrire à
 * l'inscription — sinon l'essai n'existe nulle part en base, et rien ne peut
 * l'expirer.
 */
export const FALLBACK_PLAN_KEY: PlanKey = 'Ti Machann';

/** Alias acceptés (noms commerciaux, anciens noms, casse libre). */
const PLAN_ALIASES: Record<string, PlanKey> = {
  'ti machann':     'Ti Machann',
  'esansyel':       'Ti Machann',
  'essentiel':      'Ti Machann',
  'business pilot': 'Business Pilot',
  'kwasans':        'Business Pilot',
  'croissance':     'Business Pilot',
  'expert':         'Expert',
  'elit':           'Expert',
  'elite':          'Expert',
};

/**
 * Normalise n'importe quelle écriture d'offre vers la clé stockée en base.
 * Retourne `null` si la valeur est vide ou inconnue (= pas d'abonnement).
 */
export function normalizePlanKey(value: string | null | undefined): PlanKey | null {
  if (!value) return null;
  return PLAN_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function getPlanByKey(key: string): Plan | undefined {
  const normalized = normalizePlanKey(key);
  return normalized ? PLANS.find((p) => p.key === normalized) : undefined;
}

/** Libellé commercial à afficher, avec repli propre si le plan est inconnu. */
export function getPlanLabel(key: string | null | undefined): string {
  const normalized = normalizePlanKey(key);
  return normalized ? PLAN_LABELS[normalized] : 'Essai gratuit';
}

/** Le stade de vie du marchand pour une offre — vide si l'offre est inconnue. */
export function getPlanStage(key: string | null | undefined): string {
  const normalized = normalizePlanKey(key);
  return normalized ? PLANS.find((p) => p.key === normalized)!.stage.kreyol : '';
}
