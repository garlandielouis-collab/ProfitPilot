'use client';

// ─────────────────────────────────────────────────────────────────────────────
// L'objectif — §21 (Kwasans) et §38 (Elit)
//
// Le §21 demande : objectif, réalisé, pourcentage, barre de progression, et un
// bouton « Set goal ». Le §38 ajoute une quatrième colonne : la PRÉVISION —
// « Current / Target / Progress / Forecast ».
//
// La barre ne se colore pas en rouge quand on est en retard. Un objectif est un
// cap, pas une faute : le retard se dit dans la phrase (« il reste 9 jours,
// à ce rythme… »), là où on peut encore agir dessus. Le rouge est réservé à ce
// qui coûte de l'argent maintenant (§4.2 de la constitution).
//
// ── « Set goal » se fait ICI ────────────────────────────────────────────────
//
// Le bouton de l'état vide renvoyait vers `/rapports`, qui ne permet pas de
// fixer un objectif. La seule carte qui le permettait (`MonthlyGoalCard`) vivait
// dans `<PilotageBand/>`, retirée avec la refonte par offre : plus aucun écran
// ne fixait d'objectif, et le lien envoyait le marchand chercher ce qui
// n'existait nulle part. La cible se fixe et se modifie donc sur la carte qui
// l'affiche, via `editor`. La brique n'appelle pas le serveur elle-même : c'est
// la composition qui enregistre puis relit, pour qu'elle reste partagée.
// ─────────────────────────────────────────────────────────────────────────────

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, Card, Money } from '../../ds';
import { cn } from '../../../lib/utils';

export type GoalRow = {
  id: string;
  /** La métrique (`lib/goals`) — nécessaire pour modifier la cible sur place. */
  metric?: string;
  label: string;
  current: number;
  target: number;
  currency?: string;
  /** Vrai si le rythme actuel projette une atteinte de l'objectif. */
  onTrack?: boolean;
  /** La projection de fin de période (§38). `null` quand on ne sait pas. */
  forecast?: number | null;
  /** Une phrase : « il reste 9 jours, 32 000 HTG par jour ». */
  hint?: string;
};

/** De quoi fixer ou modifier une cible sans quitter le tableau de bord. */
export type GoalEditor = {
  /** La métrique proposée quand aucun objectif n'existe encore. */
  defaultMetric: string;
  /** Enregistre la cible ; lève avec un message lisible si c'est refusé. */
  save: (metric: string, target: number) => Promise<void>;
  labels: {
    /** L'intitulé du champ, pour une métrique donnée. */
    input: (metric: string) => string;
    submit: string;
    edit: string;
    cancel: string;
    invalid: string;
    saved: string;
  };
};

function TargetForm({
  editor,
  metric,
  initial,
  onCancel,
  onDone,
}: {
  editor: GoalEditor;
  metric: string;
  initial?: number;
  onCancel?: () => void;
  onDone?: () => void;
}) {
  const inputId = useId();
  const [draft, setDraft]   = useState(initial != null ? String(initial) : '');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const target = Number(draft);
    if (!(target > 0)) {
      toast.error(editor.labels.invalid);
      return;
    }
    setSaving(true);
    try {
      await editor.save(metric, target);
      toast.success(editor.labels.saved);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : editor.labels.invalid);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 text-left">
      <label htmlFor={inputId} className="block text-note text-muted dark:text-dark-muted">
        {editor.labels.input(metric)}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="amount min-h-touch min-w-0 flex-1 rounded-surface border border-border bg-white px-4 text-body font-bold text-primary outline-none transition-colors duration-press focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
        />
        <Button type="submit" variant="accent" size="sm" loading={saving} loadingLabel="…">
          {editor.labels.submit}
        </Button>
        {onCancel && (
          // Le second appel à l'action est un lien, jamais un bouton (§4.5).
          <button
            type="button"
            onClick={onCancel}
            className="pressable min-h-touch flex-shrink-0 text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
          >
            {editor.labels.cancel}
          </button>
        )}
      </div>
    </form>
  );
}

export function GoalProgress({
  goals,
  emptyLabel,
  emptyAction,
  emptyHref,
  forecastLabel,
  loading = false,
  editor,
}: {
  goals: GoalRow[];
  emptyLabel: string;
  emptyAction: string;
  /**
   * Sans `editor`, l'écran qui permet de fixer un objectif. Pas de valeur par
   * défaut : un lien vers un écran qui ne le permet pas est pire que pas de lien.
   */
  emptyHref?: string;
  /** « Prévision » — l'intitulé de la quatrième colonne du §38. */
  forecastLabel?: string;
  loading?: boolean;
  editor?: GoalEditor;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  if (loading) {
    return (
      <Card className="space-y-4 p-4" aria-hidden>
        <span className="pp-skeleton block h-5 w-40 rounded-control" />
        <span className="pp-skeleton block h-3 rounded-pill" />
      </Card>
    );
  }

  if (goals.length === 0) {
    return (
      <Card className="px-4 py-8 text-center">
        <p className="text-body text-text2 dark:text-dark-text2">{emptyLabel}</p>
        {editor ? (
          <div className="mx-auto mt-4 max-w-sm">
            <TargetForm editor={editor} metric={editor.defaultMetric} />
          </div>
        ) : emptyHref ? (
          <Link
            href={emptyHref}
            className="pressable mt-2 inline-flex min-h-touch items-center text-body font-bold text-primary underline underline-offset-4 dark:text-dark-text"
          >
            {emptyAction}
          </Link>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-border dark:divide-dark-border">
        {goals.map((goal) => {
          const pct = goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0;
          const canEdit = Boolean(editor && goal.metric);

          if (editor && goal.metric && editing === goal.id) {
            return (
              <li key={goal.id} className="p-4">
                <TargetForm
                  editor={editor}
                  metric={goal.metric}
                  initial={goal.target}
                  onCancel={() => setEditing(null)}
                  onDone={() => setEditing(null)}
                />
              </li>
            );
          }

          return (
            <li key={goal.id} className="space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate text-body text-text2 dark:text-dark-text2">
                  {goal.label}
                </span>
                <span className="flex flex-shrink-0 items-baseline gap-4">
                  <span className="amount text-body font-bold text-primary dark:text-dark-text">
                    {pct} %
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(goal.id)}
                      className="pressable min-h-touch text-note font-bold text-primary underline underline-offset-4 dark:text-dark-text"
                    >
                      {editor!.labels.edit}
                    </button>
                  )}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <Money value={goal.current} currency={goal.currency ?? 'HTG'} size="card" />
                <span className="text-note text-muted dark:text-dark-muted">/</span>
                <Money
                  value={goal.target}
                  currency={goal.currency ?? 'HTG'}
                  size="note"
                  tone="muted"
                />
              </div>

              <span
                className="block h-2 overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2"
                role="progressbar"
                aria-valuenow={Math.min(pct, 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={goal.label}
              >
                <span
                  className={cn(
                    'block h-full rounded-pill transition-[width] duration-moment ease-pp',
                    goal.onTrack === false ? 'bg-primary/60 dark:bg-dark-text2' : 'bg-accent',
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </span>

              {(goal.hint || (forecastLabel && goal.forecast != null)) && (
                <p className="text-note text-muted dark:text-dark-muted">
                  {goal.hint}
                  {forecastLabel && goal.forecast != null && (
                    <>
                      {goal.hint ? ' · ' : ''}
                      {forecastLabel}{' '}
                      <Money
                        value={goal.forecast}
                        currency={goal.currency ?? 'HTG'}
                        size="note"
                        tone="muted"
                      />
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
