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
// ── L'étude de marché inversée (octobre 2026, §13) ──────────────────────────
//
// Les trois stades sont désormais dits à la première personne, dans la phrase
// que le marchand prononcerait lui-même : « Mwen vle KONNEN », « Mwen vle
// KONTWOLE », « Mwen vle GRANDI ». Les prix ne bougent pas ; c'est le contenu
// qui change, et l'écran qui s'adapte au métier (commerce ou service) — un
// commerce et un service paient le même prix, mais ne voient pas les mêmes
// outils. D'où `forWhom` et `extras`, chacun en deux versions.
//
// Les arguments ci-dessous sont écrits de son côté de l'écran : « ce que chaque
// produit vous rapporte vraiment », jamais « analyse de marge par référence ».
// Jamais « comptabilité », « bilan », « créance » (§6 et §11.1 de l'étude).
// Le registre technique correspondant vit dans `planFeatures.ts` — c'est lui
// qui décide, celui-ci ne fait que le raconter.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanKey = 'Ti Machann' | 'Business Pilot' | 'Expert';

/** Nom commercial affiché au marchand (créole). */
export type PlanLabel = 'Esansyel' | 'Kwasans' | 'Elit';

/** Un texte affiché au marchand, dans ses deux langues. */
export type Bilingual = { fr: string; ht: string };

/** Un texte qui change selon le métier : commerce fixe ou entreprise de service. */
export type ByTrade<T> = { commerce: T; service: T };

export type Plan = {
  key: PlanKey;
  /** Nom commercial affiché (Esansyel / Kwasans / Elit). */
  label: PlanLabel;
  priceG: number;
  priceUsd: number;
  /** Le stade de vie : la phrase créole, et ce qu'elle veut dire. */
  stage: { kreyol: string; fr: Bilingual };
  /** La promesse complète de l'offre, telle que l'étude l'écrit (§13). */
  description: Bilingual;
  /** Profil de marchand ciblé, repris du script de vente. */
  audience: string;
  /** À qui elle parle, dans le métier du lecteur. */
  forWhom: ByTrade<Bilingual>;
  /** Inclus pour tous, quel que soit le métier. */
  features: Bilingual[];
  /** En plus, selon le métier. */
  extras: ByTrade<Bilingual[]>;
  /** Ce que l'offre ne fait pas — dit avant qu'il le découvre. */
  limits: Bilingual;
  /** Le signe qu'il est temps de passer à l'offre suivante. */
  nextSignal: Bilingual;
  /** Ce que l'offre règle en une phrase, sous le bouton. */
  promise: Bilingual;
  highlight: Bilingual;
  popular?: boolean;
};

export const USD_RATE = 0.012;

/**
 * Le prix d'une journée, arrondi à la gourde : 1 000 HTG par mois, c'est
 * « 33 goud pa jou », moins qu'un kola (§7 de l'étude). Le prix mensuel reste
 * celui qu'on encaisse ; celui-ci sert à le rendre lisible.
 */
export function pricePerDay(priceG: number): number {
  return Math.round(priceG / 30);
}

// ── Les périodes de paiement ────────────────────────────────────────────────
//
// Un mois, ou six mois payés d'avance (§13.4 « Modalités recommandées »). Pas
// de remise sur les six mois : l'étude n'en fixe aucune, et une remise inventée
// ici serait un prix que personne n'a décidé.

export type BillingMonths = 1 | 6;
export const BILLING_PERIODS: BillingMonths[] = [1, 6];

export function normalizeBillingMonths(value: unknown): BillingMonths {
  return Number(value) === 6 ? 6 : 1;
}

/**
 * Ce que coûte une période entière. Le bon de parrainage ne vaut qu'un mois
 * (`upgrade_credits` se décompte mois par mois) : il s'applique au premier, les
 * suivants sont au tarif.
 */
export function periodTotalHtg(firstMonthHtg: number, baseHtg: number, months: BillingMonths): number {
  return firstMonthHtg + (months - 1) * baseHtg;
}

export const PLANS: Plan[] = [
  {
    key: 'Ti Machann',
    label: 'Esansyel',
    priceG: 1000,
    priceUsd: 1000 * USD_RATE,
    stage: {
      kreyol: 'Mwen vle KONNEN',
      fr: {
        fr: 'Savoir chaque soir ce que je gagne, ce que je dépense et qui me doit',
        ht: 'Konnen chak swa sa m fè, sa m depanse ak kiyès ki dwe m',
      },
    },
    description: {
      fr: "Chaque soir, savoir combien j'ai vendu, combien j'ai dépensé, combien je gagne vraiment et qui me doit de l'argent, en moins de 5 minutes par jour.",
      ht: 'Chak swa, konnen konbyen m vann, konbyen m depanse, konbyen m fè vre ak kiyès ki dwe m lajan, nan mwens pase 5 minit pa jou.',
    },
    audience: 'Le marchand ou le prestataire seul, qui veut sortir du cahier',
    forWhom: {
      commerce: {
        fr: 'Boutik de quartier, marchande installée au marché, petit dépôt tenu seul.',
        ht: 'Boutik katye, machann ki chita nan mache, ti depo yon sèl moun kenbe.',
      },
      service: {
        fr: 'Coiffeuse ou barbier seul, couturière, réparateur de téléphones indépendant.',
        ht: 'Kwafèz oswa kwafè poukont li, koutiryè, moun ki ranje telefòn poukont li.',
      },
    },
    features: [
      { fr: 'Noter une vente en 3 secondes : un favori, ou juste le montant', ht: 'Note yon vant an 3 segonn : yon favori, oswa montan an sèlman' },
      { fr: 'Parler au kaye : dites la vente ou la dépense en kreyòl',        ht: 'Pale ak kaye a : di vant lan oswa depans lan an kreyòl' },
      { fr: 'Les dépenses, avec la photo du reçu',                            ht: 'Depans yo, ak foto resi a' },
      { fr: "Salè mèt la : votre salaire, et l'argent pris pour la maison",    ht: 'Salè mèt la : salè w, ak lajan w pran pou lakay' },
      { fr: 'Le cahier de crédit : qui vous doit combien, et depuis quand',  ht: 'Kaye kredi a : kiyès ki dwe w konbyen, e depi kilè' },
      { fr: 'Le bilan du soir arrive tout seul, prêt à partir sur votre WhatsApp', ht: 'Rapò chak swa a vini poukont li, pare pou l pati sou WhatsApp ou' },
      { fr: 'Goud, dola ayisyen, dollar et taux du jour',                     ht: 'Goud, dola ayisyen, dola ameriken ak to jounen an' },
      { fr: 'La caisse : cash, MonCash, NatCash, et la caisse attendue le soir', ht: 'Kès la : kach, MonCash, NatCash, ak kès atandi a chak swa' },
      { fr: 'Vente sans internet, envoyée au retour du réseau',               ht: 'Vann san entènèt, li pati lè rezo a tounen' },
      { fr: 'Pran foto kaye ou : votre cahier de crédit recopié à l’installation', ht: 'Pran foto kaye ou : kaye kredi w antre nan telefòn lan depi premye jou a' },
      { fr: 'Ekri nou : une aide WhatsApp en kreyòl, en un tap',              ht: 'Ekri nou : yon èd WhatsApp an kreyòl, yon sèl tap' },
    ],
    extras: {
      commerce: [
        { fr: 'Vos 30 produits favoris, en tête de chaque vente',                ht: '30 pwodwi favori w yo, an tèt chak vant' },
        { fr: "La marge de chaque produit, à partir du prix d'achat",            ht: 'Maj chak pwodwi, apati pri w te achte l' },
        { fr: 'Stock simple : déduit à chaque vente, alerte « prèske fini »',     ht: 'Stòk senp : li desann chak vant, alèt « prèske fini »' },
      ],
      service: [
        { fr: 'Vos 30 services favoris, avec leurs prix',                        ht: '30 sèvis favori w yo, ak pri yo' },
        { fr: 'Avance et solde simples sur une vente',                           ht: 'Avans ak balans senp sou yon vant' },
      ],
    },
    limits: {
      fr: '1 seul utilisateur · 50 produits · pas de fiches de travail ni de rappels de crédit',
      ht: '1 sèl moun · 50 pwodwi · pa gen fich travay ni rapèl kredi',
    },
    nextSignal: {
      fr: 'Passez à Kwasans dès que vous avez plus de 15 clients à crédit, un aide qui encaisse, ou des marchandises qui disparaissent.',
      ht: 'Pase nan Kwasans depi w gen plis pase 15 kliyan kredi, yon èd k ap touche lajan, oswa machandiz k ap disparèt.',
    },
    promise: {
      fr: 'Sortir du cahier, sans rien perdre.',
      ht: 'Soti nan kaye a, san pèdi anyen.',
    },
    highlight: { fr: 'Pour commencer', ht: 'Pou kòmanse' },
  },
  {
    key: 'Business Pilot',
    label: 'Kwasans',
    priceG: 2500,
    priceUsd: 2500 * USD_RATE,
    stage: {
      kreyol: 'Mwen vle KONTWOLE',
      fr: {
        fr: 'Contrôler ce que je ne vois pas',
        ht: 'Kontwole sa m pa wè',
      },
    },
    description: {
      fr: 'Contrôler ce que je ne vois pas : mon stock ou mes travaux en cours, l’argent que mes clients me doivent et ce que mes aides encaissent, sans être là en permanence.',
      ht: 'Kontwole sa m pa wè : stòk mwen oswa travay k ap fèt, lajan kliyan yo dwe m ak sa èd mwen yo touche, san m pa bezwen la tout tan.',
    },
    audience: 'Le petit business avec 1 ou 2 aides, du stock ou des travaux en cours',
    forWhom: {
      commerce: {
        fr: 'Dépôt de boissons avec 1 ou 2 vendeurs, mini-boutique avec un gros stock, quincaillerie de quartier.',
        ht: 'Depo bwason ak 1 oswa 2 vandè, ti boutik ak anpil stòk, kenkayri katye.',
      },
      service: {
        fr: 'Salon de 2 ou 3 chaises, atelier de couture avec apprentis, réparation de téléphones avec des travaux en attente.',
        ht: 'Salon 2 oswa 3 chèz, atelye koutiryè ak apranti, ranje telefòn ak travay k ap tann.',
      },
    },
    features: [
      { fr: 'Tout Esansyel',                                                    ht: 'Tout Esansyel' },
      { fr: 'Pran foto kaye ou, autant de fois qu’il faut',                     ht: 'Pran foto kaye ou, otan fwa ou bezwen' },
      { fr: 'Rappel de crédit WhatsApp en un tap, montant exact compris',      ht: 'Rapèl kredi WhatsApp an yon tap, ak montan egzak la' },
      { fr: '2 aides : ils notent les ventes sans voir le profit ni la caisse', ht: '2 èd : yo note vant yo san yo pa wè pwofi a ni kès la' },
      { fr: 'La paie des aides, à la journée ou au pourcentage, calculée',      ht: 'Peman èd yo, pa jounen oswa pa pousantaj, kalkile pou ou' },
      { fr: 'Sòl et sabotaj : les cotisations prévues dans la caisse',          ht: 'Sòl ak sabotaj : kotizasyon yo prevwa nan kès la' },
      { fr: 'Votre assistant en kreyòl : 30 questions par mois',                ht: 'Asistan w an kreyòl : 30 kesyon pa mwa' },
      { fr: 'Le rapport du mois',                                               ht: 'Rapò mwa a' },
    ],
    extras: {
      commerce: [
        { fr: 'Les produits qui dorment, et ceux qui rapportent le plus',        ht: 'Pwodwi k ap dòmi yo, ak sa ki rapòte plis yo' },
      ],
      service: [
        { fr: 'Fiches de travail : avance, solde, statut, message « li pare »',   ht: 'Fich travay : avans, balans, eta, mesaj « li pare »' },
        { fr: 'Le coût réel de chaque prestation',                               ht: 'Vrè pri chak sèvis koute w' },
        { fr: 'Rendez-vous, avec rappel WhatsApp la veille',                      ht: 'Randevou, ak rapèl WhatsApp lavèy' },
      ],
    },
    limits: {
      fr: '3 utilisateurs (vous et 2 aides) · 1 seul point de vente · pas de dossier de financement complet',
      ht: '3 moun (ou menm ak 2 èd) · 1 sèl pwen vant · pa gen dosye finansman konplè',
    },
    nextSignal: {
      fr: 'Passez à Elit avec un deuxième point de vente, plus de 2 aides, des écarts de caisse inexpliqués, ou un projet de crédit.',
      ht: 'Pase nan Elit lè w gen yon dezyèm pwen vant, plis pase 2 èd, kès ki pa bon san w pa konnen poukisa, oswa yon pwojè kredi.',
    },
    promise: {
      fr: 'Savoir ce qui se passe, même quand vous n’êtes pas là.',
      ht: 'Konnen sa k ap pase, menm lè w pa la.',
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
      kreyol: 'Mwen vle GRANDI',
      fr: {
        fr: 'Déléguer, piloter plusieurs points, obtenir un financement',
        ht: 'Delege, dirije plizyè pwen, jwenn finansman',
      },
    },
    description: {
      fr: 'Déléguer sans me faire voler, piloter plusieurs points depuis mon téléphone, et obtenir un financement grâce à mes chiffres.',
      ht: 'Delege san yo pa vòlè m, dirije plizyè pwen depi nan telefòn mwen, epi jwenn finansman gras a chif mwen yo.',
    },
    audience: 'Le business qui grandit : plusieurs employés ou plusieurs points',
    forWhom: {
      commerce: {
        fr: 'Mini-market, quincaillerie établie, commerçant avec 2 ou 3 boutiques, grossiste de quartier.',
        ht: 'Mini-mache, kenkayri ki byen chita, machann ki gen 2 oswa 3 boutik, grosis katye.',
      },
      service: {
        fr: 'Salon de 4 employés ou plus, garage moto, atelier de couture avec plusieurs tailleurs, cyber avec plusieurs postes.',
        ht: 'Salon 4 anplwaye oswa plis, garaj moto, atelye koutiryè ak plizyè tayè, sibè ak plizyè pòs.',
      },
    },
    features: [
      { fr: 'Tout Kwasans',                                                     ht: 'Tout Kwasans' },
      { fr: '10 aides, avec la paie à la journée ou au pourcentage',            ht: '10 èd, ak peman pa jounen oswa pa pousantaj' },
      { fr: 'Un assistant sans limite, qui vous prévient lui-même : prix, réassort, dépenses anormales', ht: 'Yon asistan san limit, ki avèti w poukont li : pri, machandiz pou achte, depans ki pa nòmal' },
      { fr: 'Le dossier de financement complet, sur 6, 12 ou 24 mois',         ht: 'Dosye finansman konplè a, sou 6, 12 oswa 24 mwa' },
      { fr: "Jusqu'à 3 points de vente",                                        ht: 'Jiska 3 pwen vant' },
      { fr: 'Les écarts de caisse aide par aide, et qui a noté quoi',          ht: 'Diferans kès èd pa èd, ak kiyès ki note kisa' },
      { fr: 'Une revue de 30 minutes par mois avec un conseiller',              ht: 'Yon revizyon 30 minit chak mwa ak yon konseye' },
      { fr: 'Support prioritaire',                                              ht: 'Sipò priyorite' },
      { fr: 'La comparaison anonyme avec des commerces semblables, dès qu’ils sont assez nombreux', ht: 'Konparezon anonim ak biznis ki sanble ak pa w, depi yo ase' },
    ],
    extras: {
      commerce: [
        { fr: 'Fournisseurs et achats en dollars : échéances, prix d’achat suivis, alerte quand la marge baisse', ht: 'Founisè ak acha an dola : dat pou peye, pri acha swiv, alèt lè maj la desann' },
      ],
      service: [
        { fr: 'Les commissions par employé et par service',                      ht: 'Komisyon pa anplwaye ak pa sèvis' },
        { fr: 'Le classement des services qui rapportent le plus',               ht: 'Klasman sèvis ki rapòte plis yo' },
      ],
    },
    limits: {
      fr: '3 points de vente et 11 utilisateurs (vous et 10 aides) · au-delà, offre sur devis',
      ht: '3 pwen vant ak 11 moun (ou menm ak 10 èd) · pi plis pase sa, n ap fè yon ofr apa',
    },
    nextSignal: {
      fr: 'Au-delà de 3 points, ou pour des outils comptables formels : une offre sur mesure.',
      ht: 'Pi plis pase 3 pwen, oswa pou zouti kontab fòmèl : yon ofr sou mezi.',
    },
    promise: {
      fr: 'Grandir sans tout porter seul.',
      ht: 'Grandi san w pa pote tout poukont ou.',
    },
    highlight: { fr: 'Premium', ht: 'Premium' },
  },
];

/**
 * Ce que les trois offres partagent — affiché sous les cartes, parce que c'est
 * la peur qui empêche de payer : ce qu'il enregistre ne sera jamais retenu
 * contre lui (§6, « leta ou vòlè ap konnen »).
 */
export const PLAN_COMMON_GROUND: Bilingual[] = [
  { fr: 'Kreyòl d’abord, français si vous voulez',           ht: 'Kreyòl dabò, franse si w vle' },
  { fr: 'Vente rapide hors ligne',                          ht: 'Vann rapid san entènèt' },
  { fr: 'Vos chiffres ne sont partagés avec personne sans votre accord', ht: 'Chif ou yo pa pataje ak pèsonn san w pa dakò' },
  { fr: 'Vos données exportables à tout moment',            ht: 'Done ou yo ekspòtab nenpòt kilè' },
  { fr: "Changement d'offre immédiat",                      ht: 'Chanjman ofr imedya' },
];

// ── Le tableau comparatif (§13.4) ───────────────────────────────────────────
//
// Une cellule vaut `true` (inclus), `false` (absent) ou un texte court quand
// l'offre l'inclut avec une limite (« 2 aides », « Illimité »). `trade` marque
// les lignes qui ne concernent qu'un métier : la page de prix les montre au
// lecteur de ce métier et les tait à l'autre.

export type ComparisonCell = boolean | Bilingual;

export type ComparisonRow = {
  label: Bilingual;
  trade?: 'commerce' | 'service';
  cells: [ComparisonCell, ComparisonCell, ComparisonCell];
};

const txt = (fr: string, ht: string): Bilingual => ({ fr, ht });

export const PLAN_COMPARISON: ComparisonRow[] = [
  { label: txt('Vente rapide et à la voix', 'Vann rapid ak vwa'),                             cells: [true, true, true] },
  { label: txt('Dépenses, salaire du patron, caisse', 'Depans, salè mèt la, kès'),             cells: [true, true, true] },
  { label: txt('Cahier de crédit', 'Kaye kredi'),                                              cells: [true, true, true] },
  { label: txt('Bilan du soir sur WhatsApp', 'Rapò chak swa sou WhatsApp'),                    cells: [true, true, true] },
  { label: txt('Goud, dola, dollar, taux du jour', 'Goud, dola, dola ameriken, to jounen an'), cells: [true, true, true] },
  { label: txt('Vente sans internet', 'Vann san entènèt'),                                     cells: [true, true, true] },
  { label: txt('Cahier recopié par photo', 'Kaye antre pa foto'),
    cells: [txt("À l'installation", 'Premye jou a'), txt('Illimité', 'San limit'), txt('Illimité', 'San limit')] },
  { label: txt('Rappels de crédit WhatsApp', 'Rapèl kredi WhatsApp'),                          cells: [false, true, true] },
  { label: txt('Stock simple', 'Stòk senp'), trade: 'commerce',                                cells: [true, true, true] },
  { label: txt('Fiches de travail, coût des prestations, rendez-vous', 'Fich travay, pri sèvis, randevou'), trade: 'service',
    cells: [false, true, true] },
  { label: txt('Comptes des aides', 'Kont èd yo'),
    cells: [false, txt('2 aides', '2 èd'), txt('10 aides', '10 èd')] },
  { label: txt('Sòl et sabotaj', 'Sòl ak sabotaj'),                                           cells: [false, true, true] },
  { label: txt('Assistant en kreyòl', 'Asistan an kreyòl'),
    cells: [false, txt('30 questions', '30 kesyon'), txt('Conseils proactifs', 'Konsèy poukont li')] },
  { label: txt('Rapport du mois et dossier de crédit', 'Rapò mwa ak dosye kredi'),
    cells: [false, txt('Rapport', 'Rapò'), txt('Dossier complet', 'Dosye konplè')] },
  { label: txt('Plusieurs points de vente', 'Plizyè pwen vant'),
    cells: [false, false, txt("Jusqu'à 3", 'Jiska 3')] },
  { label: txt('Fournisseurs et achats en dollars', 'Founisè ak acha an dola'), trade: 'commerce', cells: [false, false, true] },
  { label: txt('Contrôle des écarts', 'Kontwòl diferans yo'),                                  cells: [false, false, true] },
  { label: txt('Comparaison anonyme', 'Konparezon anonim'),
    cells: [false, false, txt('Bientôt', 'Talè')] },
  { label: txt('Revue mensuelle avec un conseiller', 'Revizyon chak mwa ak yon konseye'),      cells: [false, false, true] },
  { label: txt('Support WhatsApp en kreyòl', 'Sipò WhatsApp an kreyòl'),
    cells: [txt('Standard', 'Nòmal'), txt('Standard', 'Nòmal'), txt('Prioritaire', 'Priyorite')] },
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

/**
 * L'offre servie pendant l'essai gratuit, et sa durée.
 *
 * Elle vaut Elit : un essai qui ne montre que le socle ne vend rien — le
 * marchand ne saurait pas ce qu'il achète, et la page de prix lui promet
 * « l'essai gratuit », pas « l'essai d'Esansyel ». Trente jours, comme annoncé
 * sur la page de prix et dans `TRIAL_HOURS` (hooks/useSubscription.ts).
 *
 * L'essai n'est pas un repli : c'est une vraie ligne `subscriptions`, écrite
 * une fois par `lib/trial.ts`. Il se voit en base, il s'expire seul, et le 31ᵉ
 * jour le compte retombe sur `FALLBACK_PLAN_KEY` sans qu'aucun code ne bouge.
 *
 * Changer cette constante change l'essai des comptes À VENIR ; les lignes déjà
 * écrites gardent l'offre qu'elles portent.
 */
export const TRIAL_PLAN_KEY: PlanKey = 'Expert';
export const TRIAL_DAYS = 30;

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
