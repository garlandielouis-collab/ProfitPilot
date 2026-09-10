// ─────────────────────────────────────────────────────────────────────────────
// Les règles du parrainage — la partie qui n'appelle pas la base
//
// Elles vivent ici, et pas dans `app/actions/referrals.ts`, pour une raison
// technique qui a déjà mordu ce dépôt : **un fichier `'use server'` ne peut
// exporter que des fonctions asynchrones.** Une constante ou un type exportés
// depuis une action serveur font échouer la compilation — et le message ne dit
// pas toujours lequel.
//
// L'écran de parrainage a besoin des chiffres pour écrire ses phrases ; le
// serveur en a besoin pour poser les droits ; la caisse en a besoin pour
// calculer le montant dû. C'est donc ici, lu des trois côtés, plutôt qu'écrit
// trois fois.
//
// ── LE PRINCIPE, en une phrase ─────────────────────────────────────────────
//
// On ne récompense jamais par un mois gratuit de l'offre que le marchand paie
// déjà. On récompense en MONNAIE D'UPGRADE : des capacités et des réductions
// qui n'existent qu'à l'étage au-dessus. Un cadeau qui rend l'offre actuelle
// suffisante est un cadeau qui coûte deux fois — le mois offert, puis la
// montée en gamme qui n'arrivera jamais.
//
// ── L'ÉCHELLE, du moins cher au plus cher ──────────────────────────────────
//
//   1. INSCRIT  le filleul crée son compte
//               → +10 questions à l'assistant, +10 fiches produits
//                 Coût marginal quasi nul, valeur perçue forte, et l'assistant
//                 est le meilleur avant-goût d'Elit qu'on ait.
//
//   2. ACTIF    7 jours plus tard, et il a vraiment vendu
//               → 7 jours de Relance WhatsApp (la capacité de l'étage
//                 au-dessus), datés, avec une date de fin affichée.
//                 C'est le parrainage qui ouvre la porte ; c'est l'abonnement
//                 qui la garde ouverte.
//
//   3. PAYANT   le filleul paie son premier mois
//               → 30 jours de Rapports + un bon de réduction sur l'offre
//                 AU-DESSUS de celle du parrain.
//
// Le troisième barreau est le seul qui coûte de l'argent, et c'est le seul qui
// exige un encaissement. Récompenser l'inscription en monnaie sonnante, c'est
// financer la fabrication de faux comptes.
// ─────────────────────────────────────────────────────────────────────────────

import type { Feature } from './planFeatures';
import { normalizePlanKey, type PlanKey } from './plans';

// ─────────────────────────────────────────────────────────────────────────────
// Barreau 3 — le filleul paie
// ─────────────────────────────────────────────────────────────────────────────

/** Ce que le parrainage offre en capacité. Une capacité du registre, pas un changement d'offre. */
export const REFERRAL_REWARD: Feature = 'monthly_reports';

/** Un mois. Chaque filleul PAYANT repousse l'échéance d'autant. */
export const REFERRAL_REWARD_DAYS = 30;

/**
 * Le bon de réduction, par offre du PARRAIN.
 *
 * `target` n'est jamais l'offre du parrain : c'est celle du dessus. Un marchand
 * Esansyel avec trois filleuls payants paie Kwasans 1 000 HTG pendant deux
 * mois — il goûte l'étage, et un marchand qui a goûté deux mois redescend
 * rarement.
 *
 * Elit est au sommet : il n'y a pas d'étage au-dessus. La proposition d'origine
 * y prévoit une commission MonCash — c'est le programme Anbasadè, qui n'est pas
 * construit. En attendant, son bon porte sur son propre renouvellement : c'est
 * la seule récompense automatique qu'on puisse tenir sans promettre un
 * versement que personne n'exécute encore.
 */
export type UpgradeReward = {
  /** L'offre sur laquelle le bon s'applique. */
  target: PlanKey;
  /** Réduction accordée par filleul payant. */
  percent: number;
  /** Nombre de mois d'abonnement couverts par le bon. */
  months: number;
};

export const UPGRADE_REWARD: Record<PlanKey, UpgradeReward> = {
  'Ti Machann':     { target: 'Business Pilot', percent: 20, months: 2 },
  'Business Pilot': { target: 'Expert',         percent: 15, months: 2 },
  'Expert':         { target: 'Expert',         percent: 15, months: 2 },
};

/**
 * Combien de bons de parrainage se cumulent sur un même mois.
 *
 * Trois — d'où le « cumulable jusqu'à −60 % » d'Esansyel (3 × 20) et le
 * « −45 % » de Kwasans (3 × 15). Le quatrième filleul n'est pas perdu : son bon
 * attend son tour, puisque chaque bon vaut deux mois et se consomme
 * séparément. C'est ce qui fait remonter le prix PROGRESSIVEMENT au lieu de le
 * faire bondir au plein tarif d'un coup.
 */
export const MAX_STACKED_REFERRAL_CREDITS = 3;

/** Durée de vie d'un bon non utilisé. Une récompense éternelle n'en est plus une. */
export const UPGRADE_CREDIT_DAYS = 180;

/** Réduction maximale affichable pour l'offre d'un parrain — sert aux phrases de l'écran. */
export function maxUpgradePercent(planKey: PlanKey): number {
  return Math.min(
    UPGRADE_REWARD[planKey].percent * MAX_STACKED_REFERRAL_CREDITS,
    MAX_TOTAL_DISCOUNT_PCT,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Barreau 1 — le filleul s'inscrit (micro-récompenses)
// ─────────────────────────────────────────────────────────────────────────────

/** Questions à l'assistant offertes par filleul inscrit. Sans plafond : elles se consomment. */
export const SIGNUP_AI_QUESTIONS = 10;

/**
 * Combien de temps la PORTE de l'assistant reste ouverte après un parrainage.
 *
 * Les questions offertes ne servent à rien si l'écran reste verrouillé : un
 * marchand Esansyel n'a pas `ai_assistant` dans son offre, et sans ce droit
 * temporaire il verrait son compteur monter sans jamais pouvoir s'en servir.
 *
 * Large exprès. Ce n'est pas cette durée qui borne le cadeau — c'est le paquet
 * de questions, qui se vide à l'unité. Une porte ouverte trois mois sur dix
 * questions coûte dix questions, pas trois mois.
 */
export const SIGNUP_AI_ACCESS_DAYS = 90;

/** Fiches produits ajoutées au plafond d'Esansyel par filleul inscrit. */
export const SIGNUP_PRODUCT_SLOTS = 10;

/**
 * Plafond du bonus produits. Utile, mais ne remplace jamais Kwasans : au-delà
 * de +50, ce n'est plus un coup de pouce, c'est l'offre du dessus donnée.
 */
export const PRODUCT_SLOTS_CAP = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Barreau 2 — le filleul devient actif
// ─────────────────────────────────────────────────────────────────────────────

/** Âge minimum du parrainage avant de pouvoir parler d'un filleul « actif ». */
export const ACTIVATION_DAYS = 7;

/**
 * Ventes réellement enregistrées par le filleul dans ces sept jours.
 *
 * Un compte ouvert et jamais utilisé n'est pas un marchand amené : c'est une
 * ligne dans une table. Le seuil est bas exprès — cinq ventes, c'est une
 * matinée de marché — parce qu'il doit trier les faux comptes, pas les petits
 * commerces.
 */
export const ACTIVATION_MIN_SALES = 5;

/** Durée du déblocage obtenu au barreau 2. */
export const ACTIVATION_UNLOCK_DAYS = 7;

/**
 * Ce qui s'ouvre, selon l'offre du parrain — toujours une capacité de l'étage
 * AU-DESSUS, jamais une qu'il possède déjà. Un cadeau qu'on a déjà ne se
 * remarque pas, et ne fait monter personne.
 *
 * Chacune de ces capacités ouvre un ÉCRAN que le marchand voyait verrouillé.
 * C'est la condition pour qu'un déblocage se remarque : `auto_reminders`, la
 * suite naturelle de la Relance WhatsApp, était le choix évident sur le papier
 * — sauf qu'aucun écran ni aucune action ne l'interroge aujourd'hui. L'offrir
 * n'aurait donc rien ouvert du tout, et un cadeau invisible se lit comme un
 * mensonge. Analytique, elle, est branchée sur `/analytics` et se voit le jour
 * même.
 *
 * Elit possède tout : rien à ouvrir. Ses filleuls actifs sont comptés, et son
 * bon de réduction l'attend au barreau 3.
 */
export const ACTIVATION_UNLOCK: Record<PlanKey, Feature | null> = {
  'Ti Machann':     'receivable_reminders',
  'Business Pilot': 'advanced_analytics',
  'Expert':         null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Le bon de bienvenue du filleul
// ─────────────────────────────────────────────────────────────────────────────

/**
 * −50 % sur le PREMIER mois du filleul, une seule fois.
 *
 * Sans lui, l'échelle entière repose sur un barreau que personne ne franchit :
 * le parrain n'est payé que si son filleul paie, et le filleul n'a aucune
 * raison particulière de payer plus tôt qu'un autre. C'est l'incitation
 * d'entrée qui met la machine en marche.
 */
export const WELCOME_DISCOUNT_PCT = 50;
export const WELCOME_CREDIT_MONTHS = 1;
export const WELCOME_CREDIT_DAYS = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Les garde-fous
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aucune récompense ne descend le prix payé sous 40 % du tarif.
 *
 * Le plancher est GLOBAL : bon de bienvenue et bons de parrainage se cumulent
 * jusqu'ici, puis s'arrêtent. Sans lui, un filleul devenu parrain à son tour
 * arrivait à −110 %, c'est-à-dire à un remboursement.
 */
export const MAX_TOTAL_DISCOUNT_PCT = 60;

/**
 * Au-delà, une réclamation n'est plus un parrainage : c'est un échange de codes
 * entre comptes déjà installés. Sept jours laissent la place à une confirmation
 * par e-mail qui traîne, sans ouvrir la porte au troc.
 */
export const CLAIM_WINDOW_DAYS = 7;

/** Sans I, O, 0 ni 1 : le code se dicte au téléphone sans faire répéter. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const REFERRAL_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export function randomReferralCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** « pp-3f7k », « PP 3F7K » et « pp3f7k » désignent le même code. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
  return REFERRAL_CODE_RE.test(cleaned) ? cleaned : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Les bons, et le calcul du prix — logique pure, testable sans base
// ─────────────────────────────────────────────────────────────────────────────

export type CreditSource = 'referral_paid' | 'welcome' | 'manual';

export type UpgradeCredit = {
  id: string;
  /** Offre visée, ou `null` = valable sur n'importe laquelle (bon de bienvenue). */
  targetPlanKey: string | null;
  percentOff: number;
  monthsTotal: number;
  monthsUsed: number;
  expiresAt: string;
  source: string;
};

/** Un bon retenu dans un devis, tel que l'écran l'explique au marchand. */
export type AppliedCredit = {
  id: string;
  percentOff: number;
  source: string;
};

export type CheckoutQuote = {
  planKey: PlanKey;
  /** Tarif affiché de l'offre, en gourdes. */
  baseHtg: number;
  /** Réduction retenue, plafond global compris. */
  percentOff: number;
  /** Ce que le marchand paie réellement ce mois-ci. */
  amountHtg: number;
  /** Les bons retenus — ce sont eux, et eux seuls, qu'on décomptera. */
  applied: AppliedCredit[];
};

/** Un bon est utilisable s'il lui reste des mois, qu'il n'est pas mort, et qu'il vise cette offre. */
function isUsable(credit: UpgradeCredit, planKey: PlanKey, now: Date): boolean {
  if (credit.monthsUsed >= credit.monthsTotal) return false;
  if (new Date(credit.expiresAt).getTime() <= now.getTime()) return false;
  if (credit.targetPlanKey === null) return true;
  return normalizePlanKey(credit.targetPlanKey) === planKey;
}

/**
 * Choisit les bons à appliquer à un mois d'abonnement.
 *
 * L'ordre n'est pas cosmétique : on prend d'abord le bon de bienvenue (il ne
 * vaut qu'un mois et meurt vite), puis les bons de parrainage du plus proche de
 * l'échéance au plus lointain. Un bon qu'on garde « pour plus tard » finit par
 * expirer, et le marchand a l'impression qu'on lui a repris quelque chose.
 *
 * On s'arrête dès que le plafond global est atteint : un bon qui n'apporterait
 * plus rien ne doit pas être consommé.
 */
export function selectCredits(
  credits: UpgradeCredit[],
  planKey: PlanKey,
  now: Date = new Date(),
): { percentOff: number; applied: AppliedCredit[] } {
  const usable = credits.filter((c) => isUsable(c, planKey, now));
  const byExpiry = (a: UpgradeCredit, b: UpgradeCredit) =>
    new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();

  const welcome  = usable.filter((c) => c.source === 'welcome').sort(byExpiry).slice(0, 1);
  const referral = usable.filter((c) => c.source !== 'welcome').sort(byExpiry);

  const applied: AppliedCredit[] = [];
  let percentOff = 0;
  let stacked = 0;

  for (const credit of [...welcome, ...referral]) {
    if (percentOff >= MAX_TOTAL_DISCOUNT_PCT) break;
    if (credit.source !== 'welcome') {
      if (stacked >= MAX_STACKED_REFERRAL_CREDITS) break;
      stacked += 1;
    }
    applied.push({ id: credit.id, percentOff: credit.percentOff, source: credit.source });
    percentOff += credit.percentOff;
  }

  return { percentOff: Math.min(percentOff, MAX_TOTAL_DISCOUNT_PCT), applied };
}

/** Le montant dû, arrondi à la gourde : on n'encaisse pas des centimes en MonCash. */
export function discountedPrice(baseHtg: number, percentOff: number): number {
  const pct = Math.max(0, Math.min(percentOff, MAX_TOTAL_DISCOUNT_PCT));
  return Math.round((baseHtg * (100 - pct)) / 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ce que l'écran affiche
// ─────────────────────────────────────────────────────────────────────────────

/** Où en est chaque filleul sur l'échelle. */
export type ReferralLadder = {
  /** Comptes créés avec le code. */
  signedUp: number;
  /** Filleuls qui vendent vraiment depuis au moins une semaine. */
  active: number;
  /** Filleuls qui ont payé leur premier mois. */
  paying: number;
};

/** Un bon vivant, tel que l'écran de parrainage le montre. */
export type CreditView = {
  id: string;
  targetPlanKey: string | null;
  percentOff: number;
  monthsLeft: number;
  expiresAt: string;
  source: string;
};

export type ReferralSummary = {
  code: string | null;
  /** Nombre de filleuls confirmés (compte créé). Compatible avec l'ancien écran. */
  invited: number;
  /** Fin du mois de Rapports offert, ou `null` si aucun droit en cours. */
  rewardUntil: string | null;
  /** `false` quand la migration n'a pas encore été appliquée. */
  available: boolean;
  /** L'échelle, barreau par barreau. */
  ladder: ReferralLadder;
  /** L'offre du parrain — c'est elle qui décide de la récompense. */
  planKey: PlanKey | null;
  /** Fin du déblocage obtenu au barreau 2, si un est en cours. */
  unlockUntil: string | null;
  /** La capacité débloquée au barreau 2 pour cette offre. */
  unlockFeature: Feature | null;
  /** Questions à l'assistant gagnées, en plus de celles de l'offre. */
  bonusAiQuestions: number;
  /** Fiches produits gagnées, en plus du plafond de l'offre. */
  bonusProductSlots: number;
  /** Les bons de réduction vivants. */
  credits: CreditView[];
};

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'unknown_code' | 'self' | 'already' | 'too_late' | 'unavailable' };
