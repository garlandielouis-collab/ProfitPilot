'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Le parrainage — une échelle à trois barreaux, pas une prime unique
//
// ── Ce qui se passe, dans l'ordre ──────────────────────────────────────────
//
//   1. Le marchand ouvre « Parrainage ». Son code naît à ce moment-là, une
//      seule fois, et ne change plus : il finira écrit à la main sur un papier
//      ou collé dans un statut WhatsApp.
//   2. Il partage son lien. Le filleul s'inscrit ; le code voyage dans les
//      métadonnées du compte, comme le numéro de téléphone, parce que
//      l'inscription avec confirmation par e-mail ne pose pas de session et
//      qu'on ne peut donc rien écrire en base à cet instant.
//   3. À la première connexion du filleul, `ensureReferralClaimed()` rattrape
//      le code, écrit la ligne de parrainage, et franchit le BARREAU 1 :
//      +10 questions et +10 fiches produits pour le parrain, −50 % sur le
//      premier mois pour le filleul.
//   4. Sept jours plus tard, si le filleul vend vraiment, le BARREAU 2 ouvre
//      au parrain sept jours d'une capacité de l'étage au-dessus.
//   5. Le jour où le filleul paie son premier mois, le BARREAU 3 accorde au
//      parrain un mois de Rapports et un bon de réduction sur l'offre
//      supérieure à la sienne.
//
// Les chiffres, les durées et les seuils vivent dans `lib/referral.ts` : ce
// fichier ne fait que les appliquer. Un fichier `'use server'` n'exporte que
// des fonctions asynchrones — c'est pour ça que les constantes sont ailleurs.
//
// ── Pourquoi les récompenses s'écrivent avec la clé de service ─────────────
//
// Parce qu'elles appartiennent à quelqu'un d'autre que celui qui les déclenche.
// Le filleul ne doit pas pouvoir écrire dans les droits du parrain — ni dans
// ceux de personne. `feature_grants`, `quota_grants` et `upgrade_credits`
// n'ont aucune politique d'écriture : le seul chemin passe par les fonctions
// `SECURITY DEFINER`, appelées ici, côté serveur.
//
// ── La fraude, et ce qu'on accepte ─────────────────────────────────────────
//
// Deux personnes peuvent créer deux comptes et se parrainer l'une l'autre.
// C'est vrai de tout programme de parrainage. Ce qui change avec l'échelle,
// c'est ce que ça rapporte : une inscription fabriquée ne donne plus qu'un
// supplément de quota. L'argent — la réduction — n'arrive qu'après un
// encaissement réel, et le déblocage n'arrive qu'après des ventes réelles.
// Fabriquer un faux compte coûte alors plus cher que ce qu'il rapporte, ce qui
// est la seule définition utile d'un garde-fou.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { notify } from '../../lib/notify';
import { FALLBACK_PLAN_KEY, getPlanLabel, normalizePlanKey } from '../../lib/plans';
import type { Feature } from '../../lib/planFeatures';
import {
  ACTIVATION_DAYS,
  ACTIVATION_MIN_SALES,
  ACTIVATION_UNLOCK,
  ACTIVATION_UNLOCK_DAYS,
  CLAIM_WINDOW_DAYS,
  PRODUCT_SLOTS_CAP,
  REFERRAL_REWARD,
  REFERRAL_REWARD_DAYS,
  SIGNUP_AI_ACCESS_DAYS,
  SIGNUP_AI_QUESTIONS,
  SIGNUP_PRODUCT_SLOTS,
  UPGRADE_CREDIT_DAYS,
  UPGRADE_REWARD,
  WELCOME_CREDIT_DAYS,
  WELCOME_CREDIT_MONTHS,
  WELCOME_DISCOUNT_PCT,
  normalizeReferralCode,
  randomReferralCode,
  type ClaimResult,
  type CreditView,
  type ReferralSummary,
} from '../../lib/referral';

type Service = ReturnType<typeof getSupabaseService>;

/** Une ligne de parrainage, telle que le serveur la manipule. */
type ReferralRow = {
  id: string;
  referrer_id: string;
  referred_id: string;
  created_at: string;
  signup_rewarded_at: string | null;
  activated_at: string | null;
  paid_at: string | null;
};

/**
 * `*` et pas la liste des colonnes, à dessein : nommer `signup_rewarded_at`
 * ferait échouer TOUTE réclamation sur une installation où la seconde migration
 * n'est pas encore jouée. L'étoile rend les anciennes colonnes, les nouvelles
 * arrivent à `undefined`, et l'échelle se contente de ne pas avancer.
 */
const REFERRAL_COLUMNS = '*';

// ─────────────────────────────────────────────────────────────────────────────
// Ce que l'écran affiche
// ─────────────────────────────────────────────────────────────────────────────

export async function getReferralSummary(): Promise<ReferralSummary> {
  const empty: ReferralSummary = {
    code: null,
    invited: 0,
    rewardUntil: null,
    available: false,
    ladder: { signedUp: 0, active: 0, paying: 0 },
    planKey: null,
    unlockUntil: null,
    unlockFeature: null,
    bonusAiQuestions: 0,
    bonusProductSlots: 0,
    credits: [],
  };

  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return empty;

    const code = await ensureReferralCode(user.id);
    if (!code) return empty;

    // Le barreau 2 se franchit avec le temps, pas avec un clic : personne n'est
    // là pour le déclencher au bon moment. Le balayage quotidien s'en charge
    // pour tout le monde ; celui-ci rattrape le parrain qui ouvre son écran
    // entre deux passages, pour qu'il n'y lise jamais un chiffre en retard.
    await syncReferralMilestones();

    const planKey = normalizePlanKey(await readPlanKey(supabase, user.id)) ?? FALLBACK_PLAN_KEY;

    const [{ count }, { data: grant }] = await Promise.all([
      supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', user.id),
      supabase
        .from('feature_grants')
        .select('expires_at')
        .eq('user_id', user.id)
        .eq('feature', REFERRAL_REWARD)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle(),
    ]);

    const base: ReferralSummary = {
      ...empty,
      code,
      invited: count ?? 0,
      rewardUntil: (grant as { expires_at?: string } | null)?.expires_at ?? null,
      available: true,
      planKey,
      ladder: { signedUp: count ?? 0, active: 0, paying: 0 },
      unlockFeature: ACTIVATION_UNLOCK[planKey],
    };

    // L'échelle, les bonus et les bons vivent dans la seconde migration. Si
    // elle n'est pas jouée, l'écran retombe sur l'ancienne vue au lieu de
    // s'effondrer : le code et le compteur suffisent à partager un lien.
    try {
      const unlockFeature = ACTIVATION_UNLOCK[planKey];

      const [ladderRows, quotaRows, creditRows, unlockGrant] = await Promise.all([
        supabase
          .from('referrals')
          .select('activated_at, paid_at')
          .eq('referrer_id', user.id),
        supabase
          .from('quota_grants')
          .select('quota, amount')
          .eq('user_id', user.id),
        supabase
          .from('upgrade_credits')
          .select('id, target_plan_key, percent_off, months_total, months_used, expires_at, source')
          .eq('user_id', user.id)
          .gt('expires_at', new Date().toISOString()),
        unlockFeature
          ? supabase
              .from('feature_grants')
              .select('expires_at')
              .eq('user_id', user.id)
              .eq('feature', unlockFeature)
              .eq('source', 'referral_activation')
              .gt('expires_at', new Date().toISOString())
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (ladderRows.error) return base;

      const rows = (ladderRows.data ?? []) as Array<{ activated_at: string | null; paid_at: string | null }>;
      const quotas = (quotaRows.data ?? []) as Array<{ quota: string; amount: number }>;
      const credits = ((creditRows.data ?? []) as Array<{
        id: string;
        target_plan_key: string | null;
        percent_off: number;
        months_total: number;
        months_used: number;
        expires_at: string;
        source: string;
      }>)
        .filter((c) => c.months_used < c.months_total)
        .map<CreditView>((c) => ({
          id: c.id,
          targetPlanKey: c.target_plan_key,
          percentOff: c.percent_off,
          monthsLeft: c.months_total - c.months_used,
          expiresAt: c.expires_at,
          source: c.source,
        }));

      const bonus = (key: string) =>
        quotas.filter((q) => q.quota === key).reduce((sum, q) => sum + (Number(q.amount) || 0), 0);

      return {
        ...base,
        ladder: {
          signedUp: rows.length,
          active:   rows.filter((r) => r.activated_at).length,
          paying:   rows.filter((r) => r.paid_at).length,
        },
        unlockUntil: (unlockGrant?.data as { expires_at?: string } | null)?.expires_at ?? null,
        bonusAiQuestions:  bonus('ai_questions'),
        bonusProductSlots: bonus('products'),
        credits,
      };
    } catch {
      return base;
    }
  } catch {
    return empty;
  }
}

/**
 * Rend le code du marchand, en le créant au premier passage.
 *
 * Le tirage peut tomber sur un code déjà pris : on réessaie. Trois tentatives
 * suffisent très largement — 32⁶ possibilités, soit plus d'un milliard de codes.
 */
async function ensureReferralCode(userId: string): Promise<string | null> {
  const supabase = await getSupabaseServer();

  const { data: existing, error } = await supabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();

  // Table absente : la migration n'a pas été jouée. On le dit à l'écran plutôt
  // que d'afficher un code qui ne mènerait nulle part.
  if (error) return null;
  if (existing?.code) return (existing as { code: string }).code;

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomReferralCode();
    const { error: insertError } = await supabase
      .from('referral_codes')
      .insert({ user_id: userId, code });

    if (!insertError) return code;
    // 23505 = code déjà pris. Toute autre erreur est définitive.
    if (insertError.code !== '23505') return null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// La réclamation — barreau 1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enregistre le parrainage du compte connecté et franchit le premier barreau.
 *
 * Appelée à l'inscription quand la session est immédiate, et sinon rattrapée à
 * la première connexion par `ensureReferralClaimed()`.
 */
export async function claimReferral(rawCode: string): Promise<ClaimResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, reason: 'unknown_code' };

  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: 'unavailable' };

    // Le compte doit être récent : passé la fenêtre, ce n'est plus quelqu'un
    // qu'on a amené, c'est quelqu'un qui était déjà là.
    const ageDays = (Date.now() - new Date(user.created_at).getTime()) / 86_400_000;
    if (ageDays > CLAIM_WINDOW_DAYS) return { ok: false, reason: 'too_late' };

    // La clé de service, parce que la suite touche les données du PARRAIN : son
    // code, sa ligne de parrainage, ses droits. Rien de tout cela n'est lisible
    // ni inscriptible par le filleul sous les politiques RLS.
    const service = getSupabaseService();

    const { data: owner, error: ownerError } = await service
      .from('referral_codes')
      .select('user_id')
      .eq('code', code)
      .maybeSingle();

    if (ownerError) return { ok: false, reason: 'unavailable' };
    if (!owner)     return { ok: false, reason: 'unknown_code' };

    const referrerId = (owner as { user_id: string }).user_id;
    if (referrerId === user.id) return { ok: false, reason: 'self' };

    const { data: inserted, error: insertError } = await service
      .from('referrals')
      .insert({ referrer_id: referrerId, referred_id: user.id, code })
      .select(REFERRAL_COLUMNS)
      .single();

    // 23505 = ce compte a déjà un parrain. Ce n'est pas une panne à signaler :
    // c'est simplement déjà fait.
    if (insertError) {
      return { ok: false, reason: insertError.code === '23505' ? 'already' : 'unavailable' };
    }

    // Le barreau 1 est best-effort, et la ligne de parrainage RESTE même s'il
    // échoue. C'est l'inverse du choix précédent, où l'on supprimait la ligne
    // pour ne pas laisser un parrain sans récompense — mais la ligne est
    // justement ce qui permet de rejouer la récompense plus tard. La supprimer
    // rendait l'échec définitif, puisqu'elle est unique par filleul.
    await awardSignupRewards(service, inserted as ReferralRow);

    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Barreau 1 — le filleul a un compte.
 *
 * Pour le parrain : dix questions et dix fiches produits. Deux choses qui ne
 * coûtent presque rien à servir, qui se remarquent immédiatement, et qui
 * donnent envie de l'étage au-dessus au lieu de le remplacer.
 *
 * Pour le filleul : son bon de bienvenue. Il est émis ICI, à l'inscription, et
 * pas à sa première visite en caisse — un marchand qui découvre une réduction
 * au moment de payer y voit un prix, pas un cadeau.
 *
 * Idempotent : `signup_rewarded_at` garde la porte, et les fonctions de base
 * ne recréent jamais un bon déjà émis.
 */
async function awardSignupRewards(service: Service, referral: ReferralRow): Promise<void> {
  if (referral.signup_rewarded_at) return;

  try {
    await Promise.all([
      // Sans plafond : une question se consomme, elle ne s'accumule pas
      // indéfiniment au bilan.
      service.rpc('add_quota_grant', {
        p_user:   referral.referrer_id,
        p_quota:  'ai_questions',
        p_amount: SIGNUP_AI_QUESTIONS,
        p_cap:    null,
        p_source: 'referral',
      }),
      // Plafonné : au-delà de +50 fiches, ce n'est plus un coup de pouce, c'est
      // Kwasans donné.
      service.rpc('add_quota_grant', {
        p_user:   referral.referrer_id,
        p_quota:  'products',
        p_amount: SIGNUP_PRODUCT_SLOTS,
        p_cap:    PRODUCT_SLOTS_CAP,
        p_source: 'referral',
      }),
      // La porte de l'assistant, sans quoi le paquet de questions resterait
      // derrière un écran verrouillé pour un marchand Esansyel. Le cadeau reste
      // borné par les questions elles-mêmes, pas par cette durée.
      service.rpc('grant_feature_days', {
        p_user:    referral.referrer_id,
        p_feature: 'ai_assistant',
        p_days:    SIGNUP_AI_ACCESS_DAYS,
        p_source:  'referral_ai',
      }),
      service.rpc('mint_upgrade_credit', {
        p_user:     referral.referred_id,
        // Aucune offre visée : il ne sait pas encore laquelle il prendra, et
        // on n'a aucune raison de le pousser vers l'une plutôt que l'autre.
        p_plan:     null,
        p_percent:  WELCOME_DISCOUNT_PCT,
        p_months:   WELCOME_CREDIT_MONTHS,
        p_days:     WELCOME_CREDIT_DAYS,
        p_source:   'welcome',
        p_referral: referral.id,
      }),
    ]);

    await service
      .from('referrals')
      .update({ signup_rewarded_at: new Date().toISOString() })
      .eq('id', referral.id);

    void notifyReferrer(
      referral.referrer_id,
      'Un marchand a rejoint ProfitPilot avec votre code',
      `+${SIGNUP_AI_QUESTIONS} questions à votre assistant et +${SIGNUP_PRODUCT_SLOTS} fiches produits.`,
    );
  } catch {
    // Le balayage quotidien repassera : la ligne existe, la date manque.
  }
}

/**
 * Rattrape le code laissé dans les métadonnées à l'inscription.
 *
 * Même mécanique que le numéro de téléphone : quand la confirmation par e-mail
 * est active, l'inscription ne pose pas de session, et le code attend là. Sans
 * ce rattrapage, aucun parrainage ne serait jamais compté sur une installation
 * qui exige la confirmation — c'est-à-dire la nôtre.
 */
export async function ensureReferralClaimed(): Promise<void> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const pending = (user.user_metadata as Record<string, unknown> | null)?.referral_code;
    if (typeof pending !== 'string' || !pending) return;

    await claimReferral(pending);
  } catch {
    // Un rattrapage qui échoue n'empêche jamais une connexion.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Barreau 2 — le filleul devient actif
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fait avancer les parrainages du marchand connecté sur l'échelle.
 *
 * Appelée quand il ouvre son écran de parrainage, pour qu'il n'y lise jamais un
 * chiffre en retard sur la réalité. Le balayage nocturne fait le même travail
 * pour tout le monde — ceci n'est qu'un rattrapage, jamais la seule occasion.
 */
export async function syncReferralMilestones(): Promise<void> {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const service = getSupabaseService();

    const { data, error } = await service
      .from('referrals')
      .select(REFERRAL_COLUMNS)
      .eq('referrer_id', user.id)
      .or('activated_at.is.null,signup_rewarded_at.is.null');

    if (error) return;

    for (const row of (data ?? []) as ReferralRow[]) {
      if (!row.signup_rewarded_at) await awardSignupRewards(service, row);
      if (!row.activated_at)       await tryActivate(service, row);
    }
  } catch {
    // Un rattrapage qui échoue laisse l'écran dans son état précédent.
  }
}

/**
 * Le même travail, pour tout le monde, une fois par nuit.
 *
 * Appelé par le cron quotidien. La borne haute existe pour que le passage
 * garde une durée bornée : ce qui n'est pas traité ce soir le sera demain, et
 * un parrain n'a jamais construit son commerce sur sept jours de Relance
 * WhatsApp arrivés douze heures plus tard.
 */
export async function sweepReferralActivations(limit = 500): Promise<number> {
  try {
    const service = getSupabaseService();
    const cutoff  = new Date(Date.now() - ACTIVATION_DAYS * 86_400_000).toISOString();

    const { data, error } = await service
      .from('referrals')
      .select(REFERRAL_COLUMNS)
      .is('activated_at', null)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) return 0;

    let activated = 0;
    for (const row of (data ?? []) as ReferralRow[]) {
      if (await tryActivate(service, row)) activated += 1;
    }
    return activated;
  } catch {
    return 0;
  }
}

/**
 * Franchit le barreau 2 si le filleul le mérite.
 *
 * « Mérite » veut dire deux choses ensemble : le parrainage a au moins sept
 * jours, ET le filleul a enregistré de vraies ventes depuis. L'un sans l'autre
 * ne prouve rien — un compte peut dormir sept jours, et cinq ventes le jour de
 * l'inscription sont le profil exact d'un compte fabriqué pour la prime.
 */
async function tryActivate(service: Service, referral: ReferralRow): Promise<boolean> {
  if (referral.activated_at) return false;

  const ageDays = (Date.now() - new Date(referral.created_at).getTime()) / 86_400_000;
  if (ageDays < ACTIVATION_DAYS) return false;

  const sales = await countSalesSince(service, referral.referred_id, referral.created_at);
  if (sales < ACTIVATION_MIN_SALES) return false;

  // Garde contre le double passage : deux processus (l'écran et le cron) qui
  // se croisent ne doivent pas ouvrir quatorze jours au lieu de sept.
  const { data: claimed, error } = await service
    .from('referrals')
    .update({ activated_at: new Date().toISOString() })
    .eq('id', referral.id)
    .is('activated_at', null)
    .select('id');

  if (error || !claimed || claimed.length === 0) return false;

  const planKey = normalizePlanKey(await readPlanKey(service, referral.referrer_id)) ?? FALLBACK_PLAN_KEY;
  const feature = ACTIVATION_UNLOCK[planKey];

  // Elit possède déjà tout : le filleul est compté, il n'y a rien à ouvrir.
  if (!feature) return true;

  const { error: grantError } = await service.rpc('grant_feature_days', {
    p_user:    referral.referrer_id,
    p_feature: feature,
    p_days:    ACTIVATION_UNLOCK_DAYS,
    // Une source distincte de 'referral' : sans elle, les sept jours de Relance
    // et les trente jours de Rapports se seraient écrasés dans la même ligne
    // (`feature_grants` est unique par marchand, capacité et origine).
    p_source:  'referral_activation',
  });

  if (!grantError) {
    void notifyReferrer(
      referral.referrer_id,
      'Votre filleul est actif : une fonction s’ouvre pour vous',
      `${featureLabel(feature)} vous est ouvert ${ACTIVATION_UNLOCK_DAYS} jours.`,
    );
  }

  return true;
}

/**
 * Ventes enregistrées par un marchand depuis une date.
 *
 * `sales` ne porte pas d'identifiant d'utilisateur : elle porte l'entreprise.
 * On passe donc par les entreprises que le filleul possède — c'est le même
 * chemin que partout ailleurs dans le produit, et il tient quand un marchand a
 * plusieurs boutiques.
 */
async function countSalesSince(service: Service, userId: string, since: string): Promise<number> {
  const { data: businesses, error } = await service
    .from('businesses')
    .select('id')
    .eq('owner_id', userId)
    .is('deleted_at', null);

  if (error || !businesses || businesses.length === 0) return 0;

  const { count } = await service
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .in('business_id', (businesses as Array<{ id: string }>).map((b) => b.id))
    .is('deleted_at', null)
    .gte('created_at', since);

  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Barreau 3 — le filleul paie son premier mois
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Solde le parrainage d'un marchand qui vient de payer.
 *
 * Appelée par la route d'approbation, une fois l'abonnement réellement activé —
 * jamais depuis le navigateur, et jamais sur un paiement en attente. C'est le
 * seul barreau qui coûte de l'argent, et c'est donc le seul qui exige un
 * encaissement constaté.
 *
 * Rend `true` si le barreau a été franchi à cet appel. Un second appel sur le
 * même filleul rend `false` sans rien réémettre : `paid_at` est la garde.
 */
export async function settleReferralPayment(
  referredUserId: string,
  paidPlanKey: string,
): Promise<boolean> {
  try {
    const service = getSupabaseService();

    const { data, error } = await service
      .from('referrals')
      .select(REFERRAL_COLUMNS)
      .eq('referred_id', referredUserId)
      .maybeSingle();

    if (error || !data) return false;

    const referral = data as ReferralRow;
    if (referral.paid_at) return false;

    // Le même verrou que pour l'activation : la mise à jour conditionnelle est
    // ce qui empêche deux approbations simultanées d'émettre deux bons.
    const { data: claimed, error: claimError } = await service
      .from('referrals')
      .update({ paid_at: new Date().toISOString(), paid_plan_key: paidPlanKey })
      .eq('id', referral.id)
      .is('paid_at', null)
      .select('id');

    if (claimError || !claimed || claimed.length === 0) return false;

    const planKey = normalizePlanKey(await readPlanKey(service, referral.referrer_id)) ?? FALLBACK_PLAN_KEY;
    const reward  = UPGRADE_REWARD[planKey];

    // Le mois de Rapports : une capacité de l'étage au-dessus pour un parrain
    // Esansyel, et de toute façon jamais un mois de son propre abonnement.
    await service.rpc('grant_feature_days', {
      p_user:    referral.referrer_id,
      p_feature: REFERRAL_REWARD,
      p_days:    REFERRAL_REWARD_DAYS,
      p_source:  'referral',
    });

    // Le bon de réduction — la vraie récompense, celle qui pousse vers le haut.
    await service.rpc('mint_upgrade_credit', {
      p_user:     referral.referrer_id,
      p_plan:     reward.target,
      p_percent:  reward.percent,
      p_months:   reward.months,
      p_days:     UPGRADE_CREDIT_DAYS,
      p_source:   'referral_paid',
      p_referral: referral.id,
    });

    void notifyReferrer(
      referral.referrer_id,
      'Votre filleul a payé son premier mois',
      `−${reward.percent} % sur ${getPlanLabel(reward.target)} pendant ${reward.months} mois, et les Rapports ${REFERRAL_REWARD_DAYS} jours de plus.`,
    );

    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Petites choses partagées
// ─────────────────────────────────────────────────────────────────────────────

/** L'offre réellement payée par un marchand, quel que soit le client Supabase. */
async function readPlanKey(client: any, userId: string): Promise<string | null> {
  const { data } = await client
    .from('subscriptions')
    .select('plan_key')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { plan_key?: string } | null)?.plan_key ?? null;
}

/** Le nom de la capacité, tel que le marchand le lit dans le menu. */
function featureLabel(feature: Feature): string {
  const labels: Partial<Record<Feature, string>> = {
    receivable_reminders: 'La relance WhatsApp',
    advanced_analytics:   'L’écran Analytique',
  };
  return labels[feature] ?? 'Une fonction supplémentaire';
}

/**
 * Prévient le parrain, dans l'application. Best-effort : une notification
 * perdue ne doit jamais annuler une récompense déjà accordée.
 */
async function notifyReferrer(referrerId: string, title: string, body: string): Promise<void> {
  try {
    const service = getSupabaseService();
    const { data: business } = await service
      .from('businesses')
      .select('id')
      .eq('owner_id', referrerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!business) return;

    await notify({
      companyId:   (business as { id: string }).id,
      recipientId: referrerId,
      type:        'generic',
      title,
      body,
    });
  } catch {
    // idem
  }
}

