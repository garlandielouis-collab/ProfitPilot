// ─────────────────────────────────────────────────────────────────────────────
// L'essai de 30 jours — la ligne d'abonnement qui manquait
//
// Le produit promet un essai gratuit sur la page de prix, sur la page d'accueil
// et dans l'assistant d'installation. Cet essai n'existait QUE dans le
// navigateur : `hooks/useSubscription.ts` posait un horodatage dans
// `localStorage` et considérait le marchand « en essai » tant qu'il n'était pas
// périmé. La table `subscriptions`, elle, restait vide.
//
// Or c'est la table que lit tout le verrouillage par offre — `entitlements.ts`
// côté serveur, `getClientTenantContext()` côté écran. Sans ligne, les deux
// appliquent le repli, c'est-à-dire le SOCLE (Esansyel). Résultat : un compte
// tout neuf, en plein essai, se voyait refuser la Boutique en ligne, la Vitrine
// et les gabarits, le Lancement, le Merchandising, les Rapports, l'assistant —
// tout ce qui commence à Kwasans. L'écran de verrou s'affichait à la place,
// et le marchand concluait que la boutique n'existait pas.
//
// Le commentaire de `FALLBACK_PLAN_KEY` disait déjà quoi faire : « c'est une
// ligne `subscriptions` d'essai qu'il faut écrire ». C'est ce que fait ce
// fichier, à la première lecture de l'offre plutôt qu'à l'inscription — sinon
// les comptes créés AVANT ce correctif n'auraient jamais d'essai, et resteraient
// bloqués sur le socle sans avoir jamais rien essayé.
//
// L'essai est une vraie ligne, donc : il se voit en base, il s'expire tout seul
// à l'échéance, un exploitant peut le prolonger, et le marchand retombe sur le
// socle le 31ᵉ jour sans qu'aucun code ne s'en mêle.
// ─────────────────────────────────────────────────────────────────────────────

import type { getSupabaseServer } from './supabaseServerClient';
import {
  FALLBACK_PLAN_KEY,
  TRIAL_DAYS,
  TRIAL_PLAN_KEY,
  normalizePlanKey,
  type PlanKey,
} from './plans';

type ServerClient = Awaited<ReturnType<typeof getSupabaseServer>>;

type SubscriptionRow = {
  plan_key:   string | null;
  status:     string | null;
  expires_at: string | null;
};

/** Une ligne d'abonnement encore valable aujourd'hui. */
function isLive(row: SubscriptionRow, now: number): boolean {
  if (row.status !== 'active') return false;
  return !row.expires_at || +new Date(row.expires_at) >= now;
}

/**
 * L'offre du compte — en ouvrant l'essai si le compte n'a JAMAIS eu
 * d'abonnement.
 *
 * Rend `null` quand il n'y a rien à accorder : essai déjà consommé, abonnement
 * expiré, ou écriture refusée. L'appelant applique alors son repli
 * (`FALLBACK_PLAN_KEY`), exactement comme avant.
 *
 * Une seule lecture, la même qu'avant : les filtres `status`/`expires_at` sont
 * passés en mémoire, parce qu'il faut distinguer « aucune ligne » (jamais
 * d'essai → on l'ouvre) de « une ligne périmée » (essai fini → le socle).
 *
 * @param businessId L'entreprise à porter sur la ligne. `null` quand
 *   l'utilisateur n'est pas propriétaire : la politique RLS de `subscriptions`
 *   juge sur la propriété de l'entreprise, et un employé n'ouvre pas l'essai du
 *   compte de son patron.
 */
export async function getPlanOrStartTrial(
  supabase: ServerClient,
  userId: string,
  businessId: string | null,
): Promise<PlanKey | null> {
  const now = Date.now();

  // Cinq lignes, pas une : un abonnement annulé dont l'échéance est lointaine
  // se classerait devant l'abonnement actif et masquerait l'offre réelle.
  const { data: rows, error } = await supabase
    .from('subscriptions')
    .select('plan_key, status, expires_at')
    .eq('user_id', userId)
    .order('expires_at', { ascending: false })
    .limit(5);

  // Table illisible (RLS, migration non jouée) : on ne tente rien d'autre.
  // Ouvrir un essai ici écrirait une ligne qu'on ne saurait pas relire.
  if (error) return null;

  const history = (rows ?? []) as SubscriptionRow[];

  const live = history.find((row) => isLive(row, now));
  if (live) return normalizePlanKey(live.plan_key ?? undefined) ?? null;

  // Une ligne existe, mais aucune n'est vivante : l'essai a servi, ou
  // l'abonnement est arrivé à terme. On ne rouvre pas un essai — sinon il
  // suffirait d'attendre l'expiration pour en obtenir un autre.
  if (history.length > 0) return null;

  if (!businessId) return null;

  const startsAt  = new Date(now);
  const expiresAt = new Date(now + TRIAL_DAYS * 86_400_000);

  const { error: insertError } = await supabase.from('subscriptions').insert({
    user_id:    userId,
    business_id: businessId,
    plan_key:   TRIAL_PLAN_KEY,
    status:     'active',
    starts_at:  startsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  // Écriture refusée : l'application continue sur le socle. Un essai manquant
  // dégrade l'offre, il ne casse pas l'écran.
  if (insertError) {
    console.warn('[trial] essai non ouvert:', insertError.message);
    return null;
  }

  return TRIAL_PLAN_KEY;
}

/** Le même appel, mais qui rend toujours une offre — le repli inclus. */
export async function resolvePlanKey(
  supabase: ServerClient,
  userId: string,
  businessId: string | null,
): Promise<PlanKey> {
  return (await getPlanOrStartTrial(supabase, userId, businessId)) ?? FALLBACK_PLAN_KEY;
}
