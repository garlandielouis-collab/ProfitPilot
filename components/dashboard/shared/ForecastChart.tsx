'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La prévision — §31
//
// « Afficher : Actual, Forecast, Confidence. »
// « Ne jamais présenter une prédiction comme une certitude. »
//
// Le dessin le dit avant les mots : le passé est un trait plein, l'avenir un
// trait pointillé qui s'arrête à un point creux. Sous le graphique, la
// fourchette basse et haute — parce qu'une prévision sans fourchette est un
// chiffre déguisé en fait.
//
// Quand `forecast` est `null`, ce composant ne s'affiche pas du tout : c'est
// l'appelant qui met « pas encore assez de données » à la place (§42). Une
// prévision sur trois mois n'existe pas ; en dessiner une serait pire que ne
// rien dessiner.
// ─────────────────────────────────────────────────────────────────────────────

import { Badge, Card, Money, type BadgeTone } from '../../ds';
import { chartColors } from '../../../theme.config';
import { confidenceBand, type Forecast } from '../forecast';

export function ForecastChart({
  history,
  forecast,
  currency = 'HTG',
  labels,
}: {
  /** Les valeurs observées, dans l'ordre chronologique. */
  history: Array<{ label: string; value: number }>;
  forecast: Forecast;
  currency?: string;
  labels: {
    /** « Prévision du mois prochain » */
    title: string;
    /** « Confiance » */
    confidence: string;
    /** « Fourchette » */
    range: string;
    /** « Calculée sur N mois observés » — la phrase reçoit déjà le nombre. */
    basis: string;
    /** Trois mots pour les trois paliers de confiance. */
    bands: { low: string; medium: string; high: string };
  };
}) {
  const band = confidenceBand(forecast.confidence);
  const tone: BadgeTone = band === 'high' ? 'success' : band === 'medium' ? 'warning' : 'neutral';

  const values = [...history.map((h) => h.value), forecast.high, forecast.low];
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  // Le point prévu occupe une position de plus que l'historique : la ligne
  // pointillée relie le dernier mois observé à lui, et rien au-delà.
  const total = history.length + 1;
  const x = (i: number) => (i / Math.max(1, total - 1)) * 100;
  const y = (v: number) => 100 - ((v - min) / span) * 88 - 6;

  const solid = history
    .map((h, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(h.value).toFixed(2)}`)
    .join(' ');

  const last = history[history.length - 1];
  const dashed = last
    ? `M ${x(history.length - 1).toFixed(2)} ${y(last.value).toFixed(2)} L ${x(total - 1).toFixed(2)} ${y(forecast.next).toFixed(2)}`
    : '';

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
            {labels.title}
          </p>
          <Money value={forecast.next} currency={currency} size="amount-lg" className="mt-1 block" />
        </div>
        <Badge tone={tone}>
          {labels.confidence} {forecast.confidence} % · {labels.bands[band]}
        </Badge>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mt-4 h-40 w-full"
        role="img"
        aria-label={labels.title}
      >
        <path d={solid} fill="none" stroke={chartColors.data} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {dashed && (
          <path d={dashed} fill="none" stroke={chartColors.current} strokeWidth="2"
                strokeDasharray="4 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        {/* Le point creux : l'avenir n'est pas plein. */}
        <circle
          cx={x(total - 1)} cy={y(forecast.next)} r="2.5"
          fill="white" stroke={chartColors.current} strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-3 space-y-1 text-note text-muted dark:text-dark-muted">
        <p>
          {labels.range} : <Money value={forecast.low} currency={currency} size="note" tone="muted" />
          {' — '}
          <Money value={forecast.high} currency={currency} size="note" tone="muted" />
        </p>
        <p>{labels.basis}</p>
      </div>
    </Card>
  );
}
