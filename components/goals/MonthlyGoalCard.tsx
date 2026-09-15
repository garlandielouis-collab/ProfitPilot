'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Objectifs mensuels — Diagnostic 7 (la croissance sans boussole)
//
// Un objectif, une barre de progression, un rythme quotidien à tenir.
// Le réalisé vient des ventes déjà enregistrées : rien à ressaisir.
//
// Passage au système (§4.3, §4.4, §3.2) : les couleurs en dur (#50C878,
// #001F3F, #3daa62) laissent place aux tokens, les quatre tailles de texte aux
// quatre rôles, et la carte prend l'ombre unique. La barre de progression garde
// UNE couleur : le vert de la marque quand la trajectoire tient, l'ambre quand
// le rythme faiblit, le rouge quand il ne suffira pas — trois états, trois
// significations, aucune décoration (§4.2).
//
// Et quand l'objectif tombe, le moment 5 se déclenche : le seul plein écran de
// célébration de l'application, une fois par mois au maximum (§7).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import { getGoalProgress, upsertGoal, type GoalProgress } from '../../app/actions/goals';
import { GOAL_LABELS, type GoalMetric } from '../../lib/goals';
import { Button, Card } from '../ds';
import { GoalReached, alreadyCelebrated } from './GoalReached';
import { unwrap, screenMessage  } from '../../lib/actionResult';

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
  const [celebrating, setCelebrating] = useState(false);

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

  // Moment 5 — un objectif tenu se fête une fois, puis plus jamais ce mois-ci.
  useEffect(() => {
    if (!goal || goal.progressPercent < 100) return;
    if (alreadyCelebrated(goal.metric)) return;
    setCelebrating(true);
  }, [goal]);

  async function save() {
    const target = Number(draft);
    if (!(target > 0)) {
      toast.error('Entrez un objectif supérieur à zéro.');
      return;
    }
    setSaving(true);
    try {
      unwrap(await upsertGoal({ metric, targetValue: target }));
      toast.success('Objectif enregistré.');
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(screenMessage(err, 'Enregistrement impossible.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <span className="pp-skeleton block h-24 rounded-control" aria-hidden />
      </Card>
    );
  }

  // ── Aucun objectif fixé : invitation directe ──────────────────────────────
  if (!goal || editing) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden />
          <h3 className="text-card font-bold text-primary dark:text-dark-text">
            Objectif du mois — {GOAL_LABELS[metric]}
          </h3>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={goal ? String(goal.targetValue) : 'Ex. 150000'}
            aria-label={`Objectif du mois — ${GOAL_LABELS[metric]}`}
            className="amount min-h-touch min-w-0 flex-1 rounded-surface border border-border bg-white px-4 text-body font-bold text-primary outline-none transition-colors duration-press focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
          />
          {/* L'unique appel à l'action de la carte : les 10 % tombent ici. */}
          <Button variant="accent" size="sm" loading={saving} loadingLabel="…" onClick={save}>
            Fixer
          </Button>
        </div>

        <p className="mt-2 text-note text-muted dark:text-dark-muted">
          Un objectif chiffré transforme « je veux grandir » en progression mesurable.
        </p>
      </Card>
    );
  }

  // ── Objectif en cours ─────────────────────────────────────────────────────
  const progress = Math.min(goal.progressPercent, 100);
  const barColor = goal.onTrack ? 'bg-accent' : progress >= 50 ? 'bg-warning' : 'bg-danger';

  return (
    <>
      {celebrating && (
        <GoalReached
          metric={goal.metric}
          label={`Objectif du mois — ${GOAL_LABELS[goal.metric]}`}
          value={fmt(goal.actualValue, goal.currency, goal.metric)}
          onClose={() => setCelebrating(false)}
        />
      )}

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden />
              <h3 className="truncate text-card font-bold text-primary dark:text-dark-text">
                Objectif — {GOAL_LABELS[goal.metric]}
              </h3>
            </div>
            <p className="mt-1 text-note text-muted dark:text-dark-muted">
              {fmt(goal.actualValue, goal.currency, goal.metric)} sur{' '}
              {fmt(goal.targetValue, goal.currency, goal.metric)}
            </p>
          </div>

          {/* Le second appel à l'action est un lien, jamais un bouton (§4.5). */}
          <button
            type="button"
            onClick={() => { setDraft(String(goal.targetValue)); setEditing(true); }}
            className="pressable min-h-touch flex-shrink-0 text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
          >
            Modifier
          </button>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="amount text-amount font-bold text-primary dark:text-dark-text">
              {goal.progressPercent} %
            </span>
            <span className={`text-note font-bold ${goal.onTrack ? 'text-success' : 'text-warning'}`}>
              {goal.onTrack ? 'Sur la bonne trajectoire' : 'Rythme à accélérer'}
            </span>
          </div>

          <span className="mt-2 block h-2 overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2">
            <span
              className={`block h-full rounded-pill transition-[width] duration-moment ease-pp ${barColor}`}
              style={{ width: `${progress}%` }}
            />
          </span>
        </div>

        {goal.daysLeft > 0 && goal.progressPercent < 100 && (
          <p className="mt-4 text-note text-text2 dark:text-dark-text2">
            Il reste <strong className="font-bold text-primary dark:text-dark-text">{goal.daysLeft} jour{goal.daysLeft > 1 ? 's' : ''}</strong> — il faut environ{' '}
            <strong className="amount font-bold text-primary dark:text-dark-text">
              {fmt(goal.dailyPaceNeeded, goal.currency, goal.metric)}
            </strong> par jour pour y arriver.
          </p>
        )}
      </Card>
    </>
  );
}
