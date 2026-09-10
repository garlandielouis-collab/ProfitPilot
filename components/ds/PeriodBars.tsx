'use client';

// ─────────────────────────────────────────────────────────────────────────────
// PeriodBars — un graphique est réussi quand l'utilisateur peut en citer un
// chiffre. S'il ne peut pas, c'est une image (§3.8).
//
// Ce que ce composant refuse, délibérément :
//   · les sommets arrondis      on ne voit pas où la barre s'arrête
//   · les dégradés dans l'aire  la donnée n'est pas une décoration
//   · l'absence d'axe chiffré   un graphique de trésorerie sans axe ne sert
//                               à rien à un marchand qui doit décider s'il
//                               peut se payer cette semaine
//   · seize barres pour sept jours — une barre par période, pas une de plus
//
// La période EN COURS porte l'accent ; toutes les autres sont grises (§6.2).
// C'est le seul point d'émeraude du graphique — donc il se voit.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { chartColors } from '../../theme.config';
import { barGap, showsLabel } from './chartScale';
import { formatAmount } from './Money';
import { cn } from '../../lib/utils';

export type BarPoint = { label: string; value: number };

const fmtTick = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${Math.round(n / 1_000)}k`
  : String(Math.round(n));

export function PeriodBars({
  data,
  currency = 'HTG',
  currentIndex,
  height = 176,
  className,
}: {
  data: BarPoint[];
  currency?: string;
  /** L'index de la période en cours — la seule barre en émeraude. */
  currentIndex?: number;
  height?: number;
  className?: string;
}) {
  // La valeur exacte est accessible au toucher : le graphique reste un outil.
  const [touched, setTouched] = useState<number | null>(null);

  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  // L'écart dépend du nombre de barres : en classe fixe, trente périodes ne
  // laissaient plus qu'un pixel et demi de barre sur un téléphone.
  const gap = barGap(data.length);
  // Trois ou quatre repères, pas davantage : l'axe informe, il ne quadrille pas.
  const ticks = [max, max * 0.5, 0];
  const active = touched ?? currentIndex ?? null;

  return (
    <div className={cn('select-none', className)}>
      <div className="flex gap-3">
        {/* Axe vertical chiffré, en gourdes — le repère qui rend le reste lisible */}
        <div
          className="flex w-10 flex-shrink-0 flex-col justify-between text-right"
          style={{ height }}
          aria-hidden
        >
          {ticks.map((t, i) => (
            <span key={i} className="amount text-note leading-none text-muted">
              {fmtTick(t)}
            </span>
          ))}
        </div>

        {/* Les barres */}
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {/* Lignes de repère — au niveau des graduations, et nulle part ailleurs */}
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
              const h = Math.max(2, (d.value / max) * 100);
              return (
                <button
                  key={d.label + i}
                  type="button"
                  onClick={() => setTouched(touched === i ? null : i)}
                  aria-label={`${d.label} : ${formatAmount(d.value, currency)}`}
                  className="group relative flex h-full min-w-0 flex-1 items-end"
                >
                  <span
                    // Barre plate. Aucun rayon en haut : on lit exactement où
                    // elle s'arrête.
                    className={cn(
                      'block w-full transition-[height] duration-move ease-pp',
                      isCurrent && 'pp-live',
                    )}
                    style={{
                      height: `${h}%`,
                      background: isCurrent ? chartColors.current : chartColors.data,
                      opacity: active !== null && active !== i ? 0.45 : 1,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Libellés de période — courts : L, M, M, J, V, S, D */}
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

      {/* La valeur exacte de la barre touchée — l'axe donne l'ordre de grandeur,
          le toucher donne le chiffre. */}
      <p className="mt-3 min-h-[1.125rem] text-note text-text2 dark:text-dark-text2">
        {active !== null && data[active] && (
          <>
            {data[active].label} · <span className="amount font-bold text-primary dark:text-dark-text">
              {formatAmount(data[active].value, currency)}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
