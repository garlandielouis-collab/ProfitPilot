'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Objectifs mensuels — Diagnostic 7 (la croissance sans boussole)
//
// Un objectif, une barre de progression, un rythme quotidien à tenir.
// Le réalisé vient des ventes déjà enregistrées : rien à ressaisir.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Target } from 'lucide-react';
import { toast } from 'sonner';
import { getGoalProgress, upsertGoal, type GoalProgress } from '../../app/actions/goals';
import { GOAL_LABELS, type GoalMetric } from '../../lib/goals';

const fmt = (n: number, currency: string, metric: GoalMetric): string =>
  metric === 'customers' || metric === 'sales_count'
    ? new Intl.NumberFormat('fr-HT').format(Math.round(n))
    : `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

/**
 * `initial` porte la liste complète des objectifs déjà chargée par la bande de
 * pilotage ; la carte y pioche sa métrique. `load()` reste utilisé après une
 * sauvegarde, où il faut de toute façon relire le réalisé.
 */
export function MonthlyGoalCard({
  metric = 'revenue' as GoalMetric,
  initial,
}: {
  metric?: GoalMetric;
  initial?: GoalProgress[];
}) {
  const [goal, setGoal]       = useState<GoalProgress | null>(
    initial ? initial.find((g) => g.metric === metric) ?? null : null,
  );
  const [loading, setLoading] = useState(initial === undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await getGoalProgress();
      setGoal(all.find((g) => g.metric === metric) ?? null);
    } catch {
      setGoal(null);
    } finally {
      setLoading(false);
    }
  }, [metric]);

  useEffect(() => {
    if (initial !== undefined) return;
    void load();
  }, [load, initial]);

  async function save() {
    const target = Number(draft);
    if (!(target > 0)) {
      toast.error('Entrez un objectif supérieur à zéro.');
      return;
    }
    setSaving(true);
    try {
      await upsertGoal({ metric, targetValue: target });
      toast.success('Objectif enregistré.');
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-10 dark:border-slate-800 dark:bg-slate-950">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  // ── Aucun objectif fixé : invitation directe ──────────────────────────────
  if (!goal || editing) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[#50C878]" />
          <h3 className="text-sm font-bold text-[#001F3F] dark:text-slate-100">
            Objectif du mois — {GOAL_LABELS[metric]}
          </h3>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={goal ? String(goal.targetValue) : 'Ex. 150000'}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none transition
                       focus:border-[#50C878] focus:ring-2 focus:ring-[#50C878]/20
                       dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-xl bg-[#50C878] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#3daa62] active:scale-95 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fixer'}
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Un objectif chiffré transforme « je veux grandir » en progression mesurable.
        </p>
      </div>
    );
  }

  // ── Objectif en cours ─────────────────────────────────────────────────────
  const progress = Math.min(goal.progressPercent, 100);
  const barColor = goal.onTrack ? 'bg-[#50C878]' : progress >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[#50C878]" />
            <h3 className="text-sm font-bold text-[#001F3F] dark:text-slate-100">
              Objectif — {GOAL_LABELS[goal.metric]}
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {fmt(goal.actualValue, goal.currency, goal.metric)} sur{' '}
            {fmt(goal.targetValue, goal.currency, goal.metric)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => { setDraft(String(goal.targetValue)); setEditing(true); }}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          Modifier
        </button>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-black tabular-nums text-[#001F3F] dark:text-slate-100">
            {goal.progressPercent}%
          </span>
          <span
            className={`text-xs font-bold ${
              goal.onTrack ? 'text-[#50C878]' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {goal.onTrack ? 'Sur la bonne trajectoire' : 'Rythme à accélérer'}
          </span>
        </div>

        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {goal.daysLeft > 0 && goal.progressPercent < 100 && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          Il reste <strong>{goal.daysLeft} jour{goal.daysLeft > 1 ? 's' : ''}</strong> — il faut
          environ <strong>{fmt(goal.dailyPaceNeeded, goal.currency, goal.metric)}</strong> par jour
          pour y arriver.
        </p>
      )}
    </div>
  );
}
