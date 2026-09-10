'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le score de santé documentaire, à l'écran (§5, §64)
//
// ── Le chiffre ne suffit jamais ─────────────────────────────────────────────
//
// « 62 / 100 » ne dit pas quoi faire. Les cinq facteurs sont donc affichés
// sous le total, avec leur décompte : « 28 sur 35 — il manque deux documents
// attendus ». C'est cette ligne-là qui déclenche une action, pas le total.
//
// ── Aucune couleur qui punit ────────────────────────────────────────────────
//
// Trois teintes, et la rouge est réservée à `critical` — pas à « en dessous de
// la moyenne ». Un marchand qui commence à ranger ses papiers voit d'abord un
// score bas ; le peindre en rouge lui apprendrait qu'il a échoué à un exercice
// qu'il vient de commencer.
// ─────────────────────────────────────────────────────────────────────────────

import { useLanguage } from '../LanguageWrapper';
import { Card } from '../ds';
import { STATE_LABELS, type HealthScore } from '../../lib/documents/health';

const TONE: Record<'healthy' | 'needs_attention' | 'critical', {
  text: string; bar: string; ring: string;
}> = {
  healthy:         { text: 'text-success', bar: 'bg-success', ring: 'bg-success/10' },
  needs_attention: { text: 'text-warning', bar: 'bg-warning', ring: 'bg-warning/10' },
  critical:        { text: 'text-danger',  bar: 'bg-danger',  ring: 'bg-danger/10' },
};

export function HealthScoreCard({ score }: { score: HealthScore }) {
  const { t } = useLanguage();

  // `first_run` n'affiche pas de carte : l'écran qui l'appelle montre un
  // `FirstRun` à la place. Un score de zéro serait un chiffre affiché sans
  // être une mesure (§83).
  if (score.state === 'first_run' || score.total === null) return null;

  const tone = TONE[score.state];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <span className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-pill ${tone.ring}`}>
          <span className={`amount text-xl font-bold ${tone.text}`}>{score.total}</span>
        </span>

        <div className="min-w-0 flex-1">
          <p className={`text-body font-bold ${tone.text}`}>{t(STATE_LABELS[score.state])}</p>
          <p className="mt-0.5 text-note text-muted dark:text-dark-muted">
            {t({
              fr: `${score.total} points sur 100, répartis sur cinq facteurs.`,
              ht: `${score.total} pwen sou 100, sou senk pwen kontwòl.`,
            })}
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {score.factors.map((factor) => (
          <li key={factor.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-note font-bold text-primary dark:text-dark-text">
                {t(factor.label)}
              </span>
              <span className="amount text-note text-muted dark:text-dark-muted">
                {factor.earned} / {factor.max}
              </span>
            </div>

            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2">
              <div
                className={`h-full ${tone.bar}`}
                style={{ width: `${Math.round((factor.earned / factor.max) * 100)}%` }}
              />
            </div>

            <p className="mt-1 text-note text-muted dark:text-dark-muted">{t(factor.detail)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
