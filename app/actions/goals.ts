'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Objectifs mensuels — Diagnostic 7 (la croissance sans boussole)
//
// Un objectif chiffré par mois et par métrique, comparé automatiquement au
// réalisé (vue v_monthly_kpis). Pas de saisie manuelle du réalisé.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '../../lib/serverAuth';
import { assertFeature } from '../../lib/entitlements';

// `GoalMetric` n'est volontairement PAS ré-exporté d'ici. Le chargeur de
// server actions dresse la liste des exports AVANT l'effacement des types : il
// prenait `export type { GoalMetric }` pour une action et produisait
// `registerServerReference(GoalMetric, …)` sur un identifiant qui n'existe pas
// à l'exécution — ReferenceError au chargement du module. Les consommateurs
// importent le type depuis `lib/goals`, qui en est la source.
import type { GoalMetric } from '../../lib/goals';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

export type Goal = {
  id: string;
  metric: GoalMetric;
  periodStart: string;      // YYYY-MM-01
  targetValue: number;
  currency: string;
  note: string | null;
};

export type GoalProgress = Goal & {
  /** Réalisé depuis le début du mois. */
  actualValue: number;
  /** Avancement en % de l'objectif (peut dépasser 100). */
  progressPercent: number;
  /** Jours restants dans le mois. */
  daysLeft: number;
  /** Rythme nécessaire par jour restant pour atteindre l'objectif. */
  dailyPaceNeeded: number;
  /** `true` si le rythme actuel projette une atteinte de l'objectif. */
  onTrack: boolean;
};

/** Premier jour du mois d'une date (défaut : aujourd'hui), en YYYY-MM-DD. */
function monthStart(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function daysInMonth(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Crée ou met à jour l'objectif du mois pour une métrique. */
export async function upsertGoal(input: {
  metric: GoalMetric;
  targetValue: number;
  periodStart?: string;
  note?: string;
}): Promise<ActionResult<Goal>> {
  return attempt(async () => {
  await assertFeature('monthly_goals');
  const { supabase, businessId, userId, defaultCurrency, can } = await getBusinessContext();
  if (!can('settings:write') && !can('reports:read')) throw new UserFacingError('Action non autorisée.');
  if (!(input.targetValue > 0)) throw new UserFacingError('L’objectif doit être supérieur à zéro.');

  const period = input.periodStart ?? monthStart();

  const { data, error } = await supabase
    .from('business_goals')
    .upsert(
      {
        business_id:  businessId,
        metric:       input.metric,
        period_start: period,
        target_value: input.targetValue,
        currency:     defaultCurrency,
        note:         input.note ?? null,
        created_by:   userId,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'business_id,metric,period_start' },
    )
    .select('id, metric, period_start, target_value, currency, note')
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/analytics');

  return {
    id:          data.id,
    metric:      data.metric as GoalMetric,
    periodStart: data.period_start,
    targetValue: Number(data.target_value),
    currency:    data.currency,
    note:        data.note,
  };
  });
}

export async function deleteGoal(id: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();
  const { error } = await supabase
    .from('business_goals')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}

/**
 * Objectifs du mois + avancement réel.
 * Le réalisé vient de v_monthly_kpis : aucune double saisie.
 */
export async function getGoalProgress(periodStart?: string): Promise<GoalProgress[]> {
  await assertFeature('monthly_goals');
  const { supabase, businessId } = await getBusinessContext();
  const period = periodStart ?? monthStart();

  const [{ data: goals, error }, { data: kpi }] = await Promise.all([
    supabase
      .from('business_goals')
      .select('id, metric, period_start, target_value, currency, note')
      .eq('business_id', businessId)
      .eq('period_start', period),
    supabase
      .from('v_monthly_kpis')
      .select('revenue, gross_margin, customers, sales_count')
      .eq('business_id', businessId)
      .eq('period_start', period)
      .maybeSingle(),
  ]);

  if (error) throw new Error(error.message);

  const actuals: Record<GoalMetric, number> = {
    revenue:     Number(kpi?.revenue ?? 0),
    margin:      Number(kpi?.gross_margin ?? 0),
    customers:   Number(kpi?.customers ?? 0),
    sales_count: Number(kpi?.sales_count ?? 0),
  };

  const today       = new Date();
  const isCurrent   = period === monthStart(today);
  const totalDays   = daysInMonth(period);
  const elapsedDays = isCurrent ? today.getUTCDate() : totalDays;
  const daysLeft    = Math.max(totalDays - elapsedDays, 0);

  return (goals ?? []).map((g: any) => {
    const target  = Number(g.target_value);
    const actual  = actuals[g.metric as GoalMetric] ?? 0;
    const missing = Math.max(target - actual, 0);
    const projected = elapsedDays > 0 ? (actual / elapsedDays) * totalDays : 0;

    return {
      id:              g.id,
      metric:          g.metric as GoalMetric,
      periodStart:     g.period_start,
      targetValue:     target,
      currency:        g.currency,
      note:            g.note,
      actualValue:     actual,
      progressPercent: target > 0 ? Math.round((actual / target) * 100) : 0,
      daysLeft,
      dailyPaceNeeded: daysLeft > 0 ? Math.ceil(missing / daysLeft) : missing,
      onTrack:         projected >= target,
    };
  });
}
