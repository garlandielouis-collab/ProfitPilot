'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La trésorerie — « un graphique est réussi quand l'utilisateur peut en citer
// un chiffre. S'il ne peut pas, c'est une image. » (§3.8)
//
// Ce que l'ancien graphique d'aires faisait, et qui a disparu :
//   · trois dégradés verticaux sous trois courbes superposées — du volume donné
//     à une information qui n'en a pas
//   · une troisième série « profit » en pointillés, qui n'était que la
//     soustraction des deux autres : une redondance dessinée (§3.6)
//   · des sommets arrondis de 5 px : on ne voyait pas où la barre s'arrêtait
//   · un axe vertical en 10 px, illisible en plein soleil
//   · une infobulle « verre dépoli » avec ombre XXL
//
// Ce qui reste : deux barres plates par période — ce qui entre, ce qui sort —
// un axe chiffré en gourdes, la période en cours en émeraude, et la valeur
// exacte au toucher. Le marchand peut en citer un chiffre.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { chartColors } from '../../theme.config';
import { barGap, formatAmount, showsLabel } from '../ds';
import { cn } from '../../lib/utils';

export type FlowPoint = { label: string; cashIn: number; cashOut: number };

const fmtTick = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${Math.round(n / 1_000)}k`
  : String(Math.round(n));

export function CashflowChart({
  data,
  currency = 'HTG',
  currentIndex,
  height = 176,
  labels,
  className,
}: {
  data: FlowPoint[];
  currency?: string;
  /** La période en cours — la seule barre en émeraude (§6.2). */
  currentIndex?: number;
  height?: number;
  labels: { in: string; out: string; empty: string };
  className?: string;
}) {
  const [touched, setTouched] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-body text-muted dark:text-dark-muted">{labels.empty}</p>
    );
  }

  const max = Math.max(...data.flatMap((d) => [d.cashIn, d.cashOut]), 1);
  // Un mois compte trente et un jours : à écart fixe, il ne restait que deux
  // pixels et demi par barre sur un téléphone. L'écart suit donc le nombre de
  // périodes — c'est la même règle pour tous les graphiques du produit.
  const gap = barGap(data.length);
  const ticks = [max, max * 0.5, 0];
  const active = touched ?? currentIndex ?? null;
  const shown = active !== null ? data[active] : null;

  return (
    <div className={cn('select-none', className)}>
      {/* La légende dit ce que sont les deux teintes — deux mots, pas plus. */}
      <div className="mb-3 flex items-center gap-4 text-note text-muted dark:text-dark-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-3 flex-shrink-0" style={{ background: chartColors.current }} />
          {labels.in}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-3 flex-shrink-0" style={{ background: chartColors.data }} />
          {labels.out}
        </span>
      </div>

      <div className="flex gap-3">
        {/* L'axe vertical, chiffré en gourdes : trois repères, pas un quadrillage */}
        <div
          className="flex w-10 flex-shrink-0 flex-col justify-between text-right"
          style={{ height }}
          aria-hidden
        >
          {ticks.map((t, i) => (
            <span key={i} className="amount text-note leading-none text-muted">{fmtTick(t)}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }}>
          {[0, 50, 100].map((pct) => (
            <span
              key={pct}
              className="absolute left-0 right-0 border-t"
              style={{ top: `${pct}%`, borderColor: chartColors.grid }}
              aria-hidden
            />
          ))}

          <div className="absolute inset-0 flex items-end" style={{ gap }}>
            {data.map((d, i) => {
              const isCurrent = i === currentIndex;
              return (
                <button
                  key={d.label + i}
                  type="button"
                  onClick={() => setTouched(touched === i ? null : i)}
                  aria-label={`${d.label} · ${labels.in} ${formatAmount(d.cashIn, currency)} · ${labels.out} ${formatAmount(d.cashOut, currency)}`}
                  className="flex h-full min-w-0 flex-1 items-end gap-px"
                  style={{ opacity: active !== null && active !== i ? 0.45 : 1 }}
                >
                  {/* Barres plates : aucun rayon en haut, on lit où elles s'arrêtent */}
                  <span
                    className="block min-w-0 flex-1 transition-[height] duration-move ease-pp"
                    style={{
                      height: `${Math.max(1, (d.cashIn / max) * 100)}%`,
                      background: isCurrent ? chartColors.current : chartColors.axis,
                    }}
                  />
                  <span
                    className="block min-w-0 flex-1 transition-[height] duration-move ease-pp"
                    style={{
                      height: `${Math.max(1, (d.cashOut / max) * 100)}%`,
                      background: chartColors.data,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Libellés courts — une étiquette par période, pas une de plus */}
      <div className="mt-2 flex gap-3">
        <span className="w-10 flex-shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1" style={{ gap }}>
          {data.map((d, i) => {
            const shown = showsLabel(i, data.length);
            // La case d'un libellé fait la largeur d'une barre — huit pixels sur
            // un mois complet. Le texte doit donc pouvoir DÉBORDER de sa case
            // sans la déformer : il est posé en absolu, la case garde sa largeur,
            // et les barres restent alignées sur leurs noms.
            //
            // Aux deux extrémités il s'aligne sur le bord au lieu de se centrer :
            // centré, il dépasserait du graphique — et un écran qui défile de
            // trois pixels sur le côté est un écran cassé.
            const anchor =
              i === 0                 ? 'left-0'
              : i === data.length - 1 ? 'right-0'
              : 'left-1/2 -translate-x-1/2';

            return (
              <span
                key={d.label + i}
                className={cn(
                  'relative min-w-0 flex-1 text-center text-note',
                  i === currentIndex ? 'font-bold text-primary dark:text-dark-text' : 'text-muted',
                )}
              >
                &nbsp;
                {shown && (
                  <span className={cn('absolute top-0 whitespace-nowrap', anchor)}>{d.label}</span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* L'axe donne l'ordre de grandeur ; le toucher donne le chiffre exact. */}
      <p className="mt-3 min-h-[1.125rem] text-note text-text2 dark:text-dark-text2">
        {shown && (
          <>
            {shown.label} · {labels.in}{' '}
            <span className="amount font-bold text-primary dark:text-dark-text">
              {formatAmount(shown.cashIn, currency)}
            </span>
            {' · '}{labels.out}{' '}
            <span className="amount font-bold text-primary dark:text-dark-text">
              {formatAmount(shown.cashOut, currency)}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
