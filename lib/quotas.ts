// ─────────────────────────────────────────────────────────────────────────────
// Les quotas — un plafond n'est pas une porte
//
// `entitlements.ts` répond à « a-t-il le droit ? » (oui/non). Ce fichier répond
// à « combien ? » : 50 fiches produits sur Esansyel, 30 questions par mois sur
// Kwasans. La distinction n'est pas académique — un quota se consomme, se
// compte, et se relève ; une capacité s'ouvre et se referme.
//
// ── Pourquoi ce fichier existe maintenant ──────────────────────────────────
//
// Les plafonds étaient écrits dans `planFeatures.ts` depuis le premier jour et
// personne ne les lisait : `PLAN_MAX_PRODUCTS` et `PLAN_AI_QUESTIONS`
// n'apparaissaient nulle part ailleurs que dans l'aperçu des offres. La page de
// prix promettait donc « 50 produits » et « 30 questions par mois » sans que
// rien ne les tienne.
//
// Le parrainage a forcé la main : « +10 questions par filleul » posé au-dessus
// d'un plafond qui n'existe pas n'est pas une récompense, c'est une phrase. Ce
// produit n'affiche pas de chiffres qui ne sont pas vrais.
//
// ── Le bonus vient d'ailleurs que de l'offre ───────────────────────────────
//
// Exactement comme `feature_grants` pour les capacités : `quota_grants` pose un
// supplément PAR-DESSUS l'offre, sans y toucher. Le marchand reste sur
// Esansyel, sa facture ne bouge pas, et son catalogue accepte 60 fiches au lieu
// de 50.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';

import { getBusinessContext } from './serverAuth';
import { getSupabaseService } from './supabaseServiceClient';
import { getActivePlanKey } from './entitlements';
import {
  UNLIMITED,
  planAiQuestions,
  planMaxProducts,
} from './planFeatures';
import { normalizePlanKey, type PlanKey } from './plans';

/** Les quotas relevables. La même chaîne que dans `quota_grants.quota`. */
export type QuotaKey = 'ai_questions' | 'products';

/**
 * Les suppléments du compte courant, tous quotas confondus.
 *
 * `cache()` pour la même raison que le reste du gating : une action qui vérifie
 * deux plafonds ne doit pas relire la table deux fois.
 *
 * Table absente (migration non jouée) : aucun supplément. Le produit
 * fonctionne, simplement personne n'a de bonus.
 */
export const getQuotaBonuses = cache(async (): Promise<Record<QuotaKey, number>> => {
  const empty: Record<QuotaKey, number> = { ai_questions: 0, products: 0 };

  try {
    const { supabase, userId } = await getBusinessContext();

    const { data, error } = await supabase
      .from('quota_grants')
      .select('quota, amount')
      .eq('user_id', userId);

    if (error) return empty;

    return (data ?? []).reduce((acc, row) => {
      const { quota, amount } = row as { quota: QuotaKey; amount: number };
      if (quota in acc) acc[quota] += Number(amount) || 0;
      return acc;
    }, { ...empty });
  } catch {
    return empty;
  }
});

/**
 * Le même calcul, mais pour un marchand désigné et avec la clé de service.
 *
 * L'assistant tourne dans une route d'API qui connaît l'identité de
 * l'appelant mais doit décompter côté serveur, sous une fonction que le
 * navigateur n'a pas le droit d'exécuter. Il ne peut donc pas passer par la
 * version memoïsée ci-dessus.
 */
export async function quotaBonusFor(userId: string, quota: QuotaKey): Promise<number> {
  try {
    const service = getSupabaseService();
    const { data, error } = await service
      .from('quota_grants')
      .select('amount')
      .eq('user_id', userId)
      .eq('quota', quota);

    if (error) return 0;
    return (data ?? []).reduce((sum, row) => sum + (Number((row as { amount: number }).amount) || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Fiches produits autorisées pour le compte courant, bonus de parrainage
 * compris. `Infinity` sur Kwasans et Elit — le plafond n'existe qu'à Esansyel.
 */
export async function productAllowance(): Promise<number> {
  const planKey = await getActivePlanKey();
  const base    = planMaxProducts(planKey);
  if (!Number.isFinite(base)) return UNLIMITED;

  const { products } = await getQuotaBonuses();
  return base + products;
}

/**
 * Questions comprises dans l'offre, pour le mois en cours. `UNLIMITED` sur Elit.
 *
 * Le bonus de parrainage n'est PAS ajouté ici, et ce n'est pas un oubli : les
 * deux réservoirs n'ont pas la même nature. Le quota de l'offre se remet à zéro
 * le 1ᵉʳ du mois ; le paquet gagné se vide question par question et ne se
 * recharge jamais tout seul. Les additionner ferait de « +10 questions » un
 * « +10 questions CHAQUE MOIS, pour toujours » — une promesse bien plus grosse
 * que celle qu'on affiche.
 *
 * Le second réservoir est servi par `consume_ai_question()`, quand le premier
 * est vide.
 *
 * Un marchand sans offre couvrant l'assistant a droit à zéro question de son
 * offre : il ne consommera donc que son paquet.
 */
export function aiMonthlyAllowance(planKey: PlanKey | string | null | undefined): number {
  const key = normalizePlanKey(typeof planKey === 'string' ? planKey : planKey ?? null);
  if (!key) return 0;

  const base = planAiQuestions(key);
  return Number.isFinite(base) ? base : UNLIMITED;
}
