// ─────────────────────────────────────────────────────────────────────────────
// Les crédits IA — ce que coûte chaque geste, et qui le paie
//
// Le cahier des charges (§39) demande un système de crédits : 100 par mois sur
// Premium, 500 sur Business, et un coût par action configurable côté serveur.
// La base tient déjà tout ça depuis 20260906 — `ai_credit_costs` pour la
// grille, `ai_credit_ledger` pour le compte, et trois fonctions SQL pour les
// mouvements. Ce fichier est le seul chemin de l'application vers elles.
//
// ── Trois choses qui ne sont pas négociables ────────────────────────────────
//
// LE DÉBIT PASSE PAR LA BASE. `ai_credit_spend()` prend un verrou consultatif
// sur l'entreprise avant de lire le solde. Sans lui, un marchand qui lance
// trois retouches dans la même seconde passe trois fois le contrôle avec le
// même solde et descend sous zéro. Lire le solde ici puis décider ici
// reproduirait exactement ce bug, une couche plus haut.
//
// L'ALLOCATION VIENT DE L'OFFRE, PAS DE LA BASE. La grille tarifaire
// (`PLAN_AI_CREDITS`) est une décision commerciale ; elle change avec la page
// de prix, pas avec une migration. La base reçoit le nombre du mois en
// paramètre et se contente de garantir qu'il n'est crédité qu'une fois.
//
// UN TRAVAIL RATÉ NE SE FACTURE PAS. Chaque appelant qui débite avant de
// lancer doit rembourser quand le fournisseur échoue. `refundCredits()` existe
// pour ça, et l'oublier se voit : le marchand perd des crédits sans rien
// recevoir, et c'est le genre de chose qui se raconte.
// ─────────────────────────────────────────────────────────────────────────────

import { getActivePlanKey } from '../entitlements';
import { planAiCredits } from '../planFeatures';
import { getSupabaseService } from '../supabaseServiceClient';
import type { PlanKey } from '../plans';
import type { EnhancementType } from './imageEnhancer';
import { storeResultImage } from './storeResultImage';

/** Les actions facturées. Les mêmes chaînes que `ai_credit_costs.action`. */
export type AiAction =
  | 'image_enhance'
  | 'image_background'
  | 'image_upscale'
  | 'product_description'
  | 'product_seo'
  | 'store_presentation'
  | 'merchandising'
  | 'bundle';

export type CreditCost = {
  action:  string;
  credits: number;
  label:   string;
};

/** Levée quand le solde ne suffit pas. Portée pour que l'appelant l'affiche. */
export class InsufficientCreditsError extends Error {
  constructor(readonly cost: number, readonly remaining: number) {
    super(
      `Cette action coûte ${cost} crédit${cost > 1 ? 's' : ''} IA et il vous en ` +
      `reste ${remaining}. Vos crédits se rechargent le 1ᵉʳ du mois.`,
    );
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * L'allocation mensuelle de l'entreprise ouverte.
 *
 * `Infinity` n'existe pas ici, contrairement aux autres quotas : un réservoir
 * illimité d'appels payants chez un tiers n'est pas une offre, c'est une
 * ardoise ouverte. Elit reçoit 500, beaucoup, mais un nombre.
 */
export async function monthlyAllowance(planKey?: PlanKey | string | null): Promise<number> {
  const key = planKey !== undefined ? planKey : await getActivePlanKey();
  const value = planAiCredits(key);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Le solde, allocation du mois créditée au passage.
 *
 * C'est `ai_credit_balance()` qui crédite, et l'index unique
 * `(business_id, period)` qui garantit qu'un marchand qui ouvre son écran
 * quinze fois dans la journée n'est crédité qu'une fois.
 */
export async function creditBalance(businessId: string, planKey?: PlanKey | string | null): Promise<number> {
  const monthly = await monthlyAllowance(planKey);

  const { data, error } = await getSupabaseService().rpc('ai_credit_balance', {
    p_business_id: businessId,
    p_monthly:     monthly,
  });

  // Migration non jouée : on ne bloque pas le Studio pour un compteur. Le
  // marchand voit ses crédits à zéro, jamais une erreur technique.
  if (error) return 0;
  return Number(data) || 0;
}

/** La grille tarifaire, telle qu'elle est en base. Pour l'afficher, pas pour décider. */
export async function creditCosts(): Promise<CreditCost[]> {
  const { data } = await getSupabaseService()
    .from('ai_credit_costs')
    .select('action, credits, label')
    .order('credits', { ascending: true });

  return (data ?? []) as CreditCost[];
}

/**
 * Débite, ou lève.
 *
 * À appeler AVANT de lancer le travail, et à compenser par `refundCredits()`
 * si le travail échoue. L'ordre inverse — lancer puis débiter — laisse passer
 * gratuitement toute action dont le débit échoue, et c'est le sens dans lequel
 * on préfère se tromper quand l'argent part chez un tiers à chaque appel.
 */
export async function spendCredits(
  businessId: string,
  userId:     string,
  action:     AiAction,
  reference?: string,
  planKey?:   PlanKey | string | null,
): Promise<{ cost: number; remaining: number }> {
  const monthly = await monthlyAllowance(planKey);

  const { data, error } = await getSupabaseService().rpc('ai_credit_spend', {
    p_business_id: businessId,
    p_user_id:     userId,
    p_action:      action,
    p_monthly:     monthly,
    p_reference:   reference ?? null,
  });

  // La fonction rend une TABLE : PostgREST renvoie donc un tableau d'une ligne.
  const row = Array.isArray(data) ? data[0] : data;

  // Absente de la base (migration non jouée) : on laisse passer. Refuser
  // rendrait le Studio inutilisable sur une installation à jour du code mais
  // pas du schéma, et c'est précisément l'ordre dans lequel ce projet déploie.
  if (error || !row) return { cost: 0, remaining: 0 };

  const cost      = Number(row.cost) || 0;
  const remaining = Number(row.remaining) || 0;

  if (!row.ok) throw new InsufficientCreditsError(cost, remaining);

  return { cost, remaining };
}

/** Rend les crédits d'une action qui n'a rien produit. Ne lève jamais. */
export async function refundCredits(
  businessId: string,
  action:     AiAction,
  reference?: string,
): Promise<void> {
  try {
    await getSupabaseService().rpc('ai_credit_refund', {
      p_business_id: businessId,
      p_action:      action,
      p_reference:   reference ?? null,
    });
  } catch {
    // Un remboursement raté ne doit pas masquer l'erreur qu'il accompagne :
    // l'appelant est déjà en train de rapporter un échec au marchand.
  }
}

/**
 * Rend ce qui a été débité sous une référence, et seulement ce qui n'a pas
 * encore été rendu. Renvoie le nombre de crédits rendus. Ne lève jamais.
 *
 * Deux différences avec `refundCredits()`, et elles sont la raison d'être de
 * cette fonction :
 *
 *   LE MONTANT VIENT DU GRAND LIVRE, pas de la grille. `ai_credit_refund()`
 *   relit `ai_credit_costs` au moment du remboursement : si le tarif a changé
 *   entre le lancement et l'échec, le marchand récupère un autre montant que
 *   celui qu'il a payé. Et si le débit n'a jamais eu lieu (fonctions absentes,
 *   coût nul à l'époque), il récupère des crédits qu'il n'a jamais dépensés.
 *
 *   ELLE NE REND PAS DEUX FOIS. Rien dans la base n'empêche deux lignes de
 *   remboursement pour la même référence (pas d'index unique, et en ajouter un
 *   demande une migration). On compare donc débité et déjà rendu avant
 *   d'écrire. Ce contrôle lit puis écrit : il n'est pas atomique, c'est une
 *   ceinture. La garantie, pour le Studio photo, est la transition de statut de
 *   `failImageJob()` ; ceci rattrape un appelant qui l'oublierait.
 *
 * La référence doit désigner UN geste facturé (`imageJobCreditRef()`), pas un
 * objet sur lequel on en fait plusieurs : sous `product:<id>`, le remboursement
 * de la deuxième retouche ratée croiserait le débit de la première réussie.
 */
export async function refundDebit(businessId: string, reference: string): Promise<number> {
  try {
    const svc = getSupabaseService();
    const { data, error } = await svc
      .from('ai_credit_ledger')
      .select('action, delta')
      .eq('business_id', businessId)
      .eq('reference', reference);

    if (error || !data) {
      console.error('[ai-credits] lecture du grand livre impossible, remboursement non fait', reference, error?.message);
      return 0;
    }

    // Par action : `image_enhance` débité, `image_enhance_refund` rendu — la
    // convention que suit déjà `ai_credit_refund()`.
    const debited  = new Map<string, number>();
    const refunded = new Map<string, number>();
    for (const row of data as { action: string; delta: number }[]) {
      const delta = Number(row.delta) || 0;
      if (row.action.endsWith('_refund')) {
        const base = row.action.slice(0, -'_refund'.length);
        refunded.set(base, (refunded.get(base) ?? 0) + delta);
      } else if (delta < 0) {
        debited.set(row.action, (debited.get(row.action) ?? 0) - delta);
      }
    }

    let total = 0;
    for (const [action, paid] of debited) {
      const due = paid - (refunded.get(action) ?? 0);
      if (due <= 0) continue;

      const { error: insertErr } = await svc.from('ai_credit_ledger').insert({
        business_id: businessId,
        delta:       due,
        action:      `${action}_refund`,
        reference,
      });
      if (insertErr) {
        console.error('[ai-credits] remboursement non écrit', reference, insertErr.message);
        continue;
      }
      total += due;
    }
    return total;
  } catch (err) {
    console.error('[ai-credits] remboursement impossible', reference, err);
    return 0;
  }
}

// ── Studio photo ────────────────────────────────────────────────────────────
//
// Une retouche se débite au lancement mais n'échoue souvent que plus tard :
// dans le rappel du fournisseur, ou quand on va l'interroger parce que le
// rappel s'est perdu. Ces deux chemins peuvent découvrir le même échec, dans
// n'importe quel ordre, parfois dans la même seconde. Les fonctions ci-dessous
// sont le seul endroit où un travail passe en échec, pour qu'un seul d'entre
// eux rembourse.

/** Le geste facturé, selon la retouche demandée : les trois lignes « image » de `ai_credit_costs`. */
export const IMAGE_CREDIT_ACTION: Record<EnhancementType, AiAction> = {
  full:            'image_enhance',
  background_only: 'image_background',
  upscale_only:    'image_upscale',
};

/** La référence du débit d'une retouche : le travail, pas le produit (voir `refundDebit()`). */
export function imageJobCreditRef(jobId: string): string {
  return `ai_asset_job:${jobId}`;
}

/** Les statuts d'où un travail peut encore finir, d'une façon ou d'une autre. */
const OPEN_JOB_STATUSES = ['pending', 'processing'] as const;

/**
 * Fait passer une retouche en échec et rembourse — une seule fois, quel que
 * soit le nombre d'appelants qui constatent l'échec.
 *
 * La garantie est la requête elle-même : `UPDATE … WHERE status IN ('pending',
 * 'processing') RETURNING id`. Deux appels concurrents se sérialisent sur le
 * verrou de la ligne ; le second réévalue sa condition sur la version écrite
 * par le premier, ne trouve plus rien, et ne rembourse pas. Un travail déjà
 * terminé ne change pas non plus : on ne rembourse jamais une retouche livrée.
 *
 * Renvoie `true` si CET appel a fait la transition. Ne lève jamais : un rappel
 * de fournisseur ne doit pas échouer à cause d'un remboursement.
 */
export async function failImageJob(
  job:     { id: string; business_id: string },
  message: string,
): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseService()
      .from('ai_asset_jobs')
      .update({ status: 'failed', error_message: message.slice(0, 500) })
      .eq('id', job.id)
      .in('status', [...OPEN_JOB_STATUSES])
      .select('id');

    if (error || !data || data.length === 0) return false;

    await refundDebit(job.business_id, imageJobCreditRef(job.id));
    return true;
  } catch (err) {
    console.error('[ai-credits] échec de retouche non enregistré', job.id, err);
    return false;
  }
}

/**
 * Marque une retouche terminée, si elle ne l'est pas déjà — ni en échec.
 *
 * Même transition conditionnelle que `failImageJob()`, et pour la même raison :
 * sans elle, un rappel qui échoue à rapatrier l'image (échec, remboursement)
 * pouvait être suivi d'une interrogation qui réussit et écrase le statut —
 * retouche livrée ET remboursée.
 *
 * Renvoie `true` si CET appel a fait la transition.
 */
export async function completeImageJob(jobId: string, processedImageUrl: string): Promise<boolean> {
  const { data, error } = await getSupabaseService()
    .from('ai_asset_jobs')
    .update({ status: 'completed', processed_image_url: processedImageUrl, error_message: null })
    .eq('id', jobId)
    .in('status', [...OPEN_JOB_STATUSES])
    .select('id');

  return !error && !!data && data.length > 0;
}

/**
 * Âge à partir duquel une retouche encore ouverte est tenue pour bloquée.
 *
 * Une retouche normale se termine en deux minutes ; à trente, le rappel s'est
 * perdu ou le lancement n'a jamais abouti. C'est le seuil du balayage du cron
 * quotidien (`app/api/cron/daily`), et celui à partir duquel l'interrogation du
 * Studio croit un « introuvable » du fournisseur (`PollResult`).
 */
export const IMAGE_JOB_STALE_MS = 30 * 60_000;

/**
 * Rapatrie l'image rendue par le fournisseur, puis marque la retouche terminée.
 *
 * Image irrécupérable : échec et remboursement — plutôt qu'un travail « terminé »
 * sur l'URL éphémère d'un fournisseur, qui expirera en silence, ou qu'un
 * travail laissé « en cours » pour toujours.
 *
 * Le chemin commun du rappel, de l'interrogation du Studio et du balayage.
 * Renvoie ce que CET appel a écrit : `unchanged` quand un autre chemin a clos
 * le travail entre-temps. Ne lève pas.
 */
export async function deliverImageJob(
  job:        { id: string; business_id: string },
  sourceUrl:  string,
  timeoutMs?: number,
): Promise<'completed' | 'failed' | 'unchanged'> {
  let stored: string;
  try {
    stored = await storeResultImage(sourceUrl, job.business_id, job.id, timeoutMs);
  } catch (err) {
    const failed = await failImageJob(job, err instanceof Error ? err.message : 'Image irrécupérable.');
    return failed ? 'failed' : 'unchanged';
  }

  const completed = await completeImageJob(job.id, stored).catch(() => false);
  return completed ? 'completed' : 'unchanged';
}
