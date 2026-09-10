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
