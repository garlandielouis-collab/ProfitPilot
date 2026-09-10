'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La courbe — UNE visualisation principale (§6)
//
// « Ne pas afficher 4 graphiques différents. »
//
// D'où un seul composant, et un sélecteur de série au lieu d'une grille de
// graphiques : le marchand choisit ce qu'il regarde, il ne subit pas quatre
// dessins qui disent la même chose. Kwasans y ajoute la comparaison avec la
// période précédente (§15) — la même courbe, en pointillé, pas un second
// graphique.
//
// Le dessin suit le §3.8 de la constitution : un trait, pas d'aire, pas de
// dégradé, pas d'ombre. La valeur exacte s'obtient au toucher, comme sur
// `ds/PeriodBars` — un graphique reste un outil, pas une illustration.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Card, FilterPill, formatAmount } from '../../ds';
import { chartColors } from '../../../theme.config';

export type TrendSeries = {
  key: string;
  label: string;
  points: Array<{ label: string; value: number }>;
  /** Tracée en pointillé — la comparaison, jamais la donnée principale. */
  ghost?: boolean;
};

export function TrendChart({
  series,
  currency = 'HTG',
  emptyLabel,
  height = 180,
}: {
  /** Une ou plusieurs séries. La première est celle qui s'affiche d'abord. */
  series: TrendSeries[];
  currency?: string;
  emptyLabel: string;
  height?: number;
}) {
  const selectable = series.filter((s) => !s.ghost);
  const [activeKey, setActiveKey] = useState(selectable[0]?.key ?? '');
  const [touched, setTouched] = useState<number | null>(null);

  const active = selectable.find((s) => s.key === activeKey) ?? selectable[0];
  const ghost  = series.find((s) => s.ghost);

  const scale = useMemo(() => {
    const values = [
      ...(active?.points.map((p) => p.value) ?? []),
      ...(ghost?.points.map((p) => p.value) ?? []),
    ];
    if (values.length === 0) return null;
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    return { max, min, span: max - min || 1 };
  }, [active, ghost]);

  if (!active || active.points.length < 2 || !scale) {
    return (
      <Card className="px-4 py-10 text-center">
        <p className="text-body text-text2 dark:text-dark-text2">{emptyLabel}</p>
      </Card>
    );
  }

  const path = (points: Array<{ value: number }>): string =>
    points
      .map((p, i) => {
        const x = (i / Math.max(1, points.length - 1)) * 100;
        const y = 100 - ((p.value - scale.min) / scale.span) * 92 - 4;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');

  const shown = touched != null ? active.points[touched] : null;
  const step = Math.max(1, Math.ceil(active.points.length / 6));

  return (
    <Card className="p-4">
      {selectable.length > 1 && (
        <div className="scrollbar-none mb-4 flex gap-2 overflow-x-auto pb-1">
          {selectable.map((s) => (
            <FilterPill
              key={s.key}
              label={s.label}
              selected={s.key === active.key}
              onClick={() => { setActiveKey(s.key); setTouched(null); }}
            />
          ))}
        </div>
      )}

      {/* La valeur exacte occupe une ligne FIXE au-dessus du dessin : sans
          elle, l'apparition au toucher décalerait tout le graphique. */}
      <p className="mb-2 min-h-touch text-note text-muted dark:text-dark-muted">
        {shown ? (
          <span className="amount text-body font-bold text-primary dark:text-dark-text">
            {shown.label} · {formatAmount(shown.value, currency)}
          </span>
        ) : (
          active.label
        )}
      </p>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ height }}
        className="w-full touch-pan-y"
        role="img"
        aria-label={`${active.label} — ${active.points.length} points`}
      >
        {ghost && ghost.points.length > 1 && (
          <path
            d={path(ghost.points)}
            fill="none"
            stroke={chartColors.axis}
            strokeWidth="1.5"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={path(active.points)}
          fill="none"
          stroke={chartColors.data}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Des zones de toucher larges : sur un téléphone, viser un point de
            deux pixels est impossible (§5.9). */}
        {active.points.map((p, i) => (
          <rect
            key={`${p.label}-${i}`}
            x={(i / Math.max(1, active.points.length - 1)) * 100 - 2}
            y={0}
            width={4}
            height={100}
            fill="transparent"
            onPointerEnter={() => setTouched(i)}
            onPointerDown={() => setTouched(i)}
            onPointerLeave={() => setTouched(null)}
          />
        ))}
      </svg>

      <div className="mt-2 flex justify-between text-note text-muted dark:text-dark-muted">
        {active.points
          .filter((_, i) => i % step === 0)
          .map((p, i) => <span key={`${p.label}-${i}`} className="amount">{p.label}</span>)}
      </div>

      {ghost && (
        <p className="mt-3 flex items-center gap-2 text-note text-muted dark:text-dark-muted">
          <span className="inline-block h-0 w-6 border-t-2 border-dashed border-border" aria-hidden />
          {ghost.label}
        </p>
      )}
    </Card>
  );
}
