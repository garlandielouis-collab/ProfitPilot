'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le score de santé — §16 (Kwasans) et §28 (Elit)
//
// Le même score, deux tailles de lecture :
//
//   compact  Kwasans · « 82 / 100 » + les dimensions en trois états
//   hero     Elit    · le grand score, puis les cinq dimensions chiffrées
//
// Le §16 demande trois catégories — Good / Attention / Critical — et le §48
// interdit de les distinguer par la seule couleur. Chaque état porte donc un
// signe : ✓ pour bon, ⚠ pour attention, ● pour critique. Exactement les trois
// symboles que le document écrit lui-même.
//
// La jauge reprend le geste chorégraphié n° 3 : elle se remplit depuis zéro à
// l'ouverture, une fois, puis reste sage. L'animation vit dans `globals.css`
// (`.pp-gauge`), pas ici — un seul endroit pour une seule décision.
// ─────────────────────────────────────────────────────────────────────────────

import { Card } from '../../ds';
import { themeColors } from '../../../theme.config';
import { cn } from '../../../lib/utils';

export type HealthDimension = {
  key: string;
  label: string;
  score: number;
  max: number;
  /** Une phrase courte. Elle explique le chiffre, elle ne le répète pas. */
  comment?: string;
};

export type HealthState = 'good' | 'attention' | 'critical';

/** Le seuil est le même partout : 70 % du maximum pour « bon », 40 % pour « attention ». */
export function stateOf(score: number, max: number): HealthState {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'attention';
  return 'critical';
}

const STATE_MARK: Record<HealthState, string> = {
  good: '✓', attention: '⚠', critical: '●',
};

const STATE_CLASS: Record<HealthState, string> = {
  good:      'text-success',
  attention: 'text-warning',
  critical:  'text-danger',
};

function toneOf(state: HealthState): string {
  if (state === 'good') return themeColors.success;
  if (state === 'attention') return themeColors.warning;
  return themeColors.danger;
}

export function HealthScore({
  score,
  grade,
  dimensions,
  stateLabels,
  hint,
  variant = 'compact',
  loading = false,
}: {
  score: number;
  /** Le mot qui qualifie le score : « SOLIDE », « FRAGILE »… */
  grade: string;
  dimensions: HealthDimension[];
  /** Les trois mots du §16, traduits par l'appelant. */
  stateLabels: Record<HealthState, string>;
  hint?: string;
  variant?: 'compact' | 'hero';
  loading?: boolean;
}) {
  const state = stateOf(score, 100);

  return (
    <Card className="p-4">
      <div className={cn(variant === 'hero' && 'sm:flex sm:items-center sm:gap-8')}>
        <div className="flex justify-center">
          {loading
            ? <span className="pp-skeleton block h-40 w-40 rounded-pill" aria-hidden />
            : <Gauge score={score} grade={grade} state={state} big={variant === 'hero'} />}
        </div>

        <ul className={cn('mt-4 space-y-3', variant === 'hero' && 'sm:mt-0 sm:flex-1')}>
          {dimensions.map((d) => {
            const s = stateOf(d.score, d.max);
            return (
              <li key={d.key}>
                <div className="flex items-center gap-3">
                  <span className="w-28 flex-shrink-0 truncate text-note text-text2 dark:text-dark-text2">
                    {d.label}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2">
                    <span
                      className="block h-full rounded-pill bg-primary transition-[width] duration-moment ease-pp dark:bg-dark-text2"
                      style={{ width: `${Math.round((d.score / d.max) * 100)}%` }}
                    />
                  </span>
                  {/* Le signe AVANT le chiffre : c'est lui qui porte l'état,
                      la couleur ne fait que le confirmer (§48). */}
                  <span className={cn('flex-shrink-0 text-note font-bold', STATE_CLASS[s])}>
                    <span aria-hidden>{STATE_MARK[s]}</span>
                    <span className="sr-only">{stateLabels[s]}</span>
                  </span>
                  <span className="amount w-12 flex-shrink-0 text-right text-note font-bold text-primary dark:text-dark-text">
                    {d.max === 100 ? d.score : `${d.score}/${d.max}`}
                  </span>
                </div>
                {d.comment && (
                  <p className="mt-1 text-note text-muted dark:text-dark-muted">{d.comment}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {hint && <p className="mt-4 text-note text-muted dark:text-dark-muted">{hint}</p>}
    </Card>
  );
}

// ── La jauge ────────────────────────────────────────────────────────────────

const R = 72;
const CX = 100;
const CY = 104;
const ARC_LEN = 2 * Math.PI * R * 0.75;

function polar(deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function Gauge({
  score, grade, state, big,
}: {
  score: number; grade: string; state: HealthState; big: boolean;
}) {
  const from = polar(135);
  const to   = polar(405);
  const track = `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${R} ${R} 0 1 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  const filled = ARC_LEN * (Math.max(0, Math.min(100, score)) / 100);
  const tone = toneOf(state);

  return (
    <svg
      viewBox="0 0 200 180"
      className={big ? 'h-52 w-52' : 'h-40 w-40'}
      role="img"
      aria-label={`${score} / 100 — ${grade}`}
    >
      <path d={track} fill="none" stroke={themeColors.border} strokeWidth={10} strokeLinecap="round" />
      <path
        className="pp-gauge"
        d={track}
        fill="none"
        stroke={tone}
        strokeWidth={10}
        strokeLinecap="round"
        style={{
          strokeDasharray: ARC_LEN,
          strokeDashoffset: ARC_LEN - filled,
          ['--gauge-len' as string]: `${ARC_LEN}`,
        }}
      />
      <text x={CX} y={CY - 2} textAnchor="middle" fill={themeColors.primary} fontSize="40" fontWeight="700">
        {score}
      </text>
      <text x={CX} y={CY + 20} textAnchor="middle" fill={themeColors.muted} fontSize="15">
        / 100
      </text>
      <text x={CX} y={CY + 44} textAnchor="middle" fill={tone} fontSize="15" fontWeight="700">
        {grade}
      </text>
    </svg>
  );
}
