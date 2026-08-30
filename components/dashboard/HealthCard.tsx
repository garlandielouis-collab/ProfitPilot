'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le score de santé — moment chorégraphié n° 3 (§7)
//
// « À l'ouverture du tableau de bord, la jauge se remplit depuis zéro jusqu'à
//   sa valeur en ≈ 800 ms. L'œil est attiré une fois, au bon endroit — puis la
//   jauge reste sage. »
//
// Ce qui a disparu : le halo `drop-shadow(0 0 10px …)` autour de l'arc et
// l'ombre `drop-shadow-2xl` sur le SVG entier (§3.2 — si un élément a besoin
// d'une lueur pour se détacher, c'est le contraste qui manque), les quatre
// couleurs de piliers (émeraude, bleu, violet, ambre : quatre accents en
// concurrence sur un même bloc, §4.1), et le libellé du grade en 10 px.
//
// L'animation respecte « réduire les animations » : la règle est dans
// globals.css, pas ici — un seul endroit pour une seule décision.
// ─────────────────────────────────────────────────────────────────────────────

import { Card } from '../ds';
import { themeColors } from '../../theme.config';

export type HealthPillar = {
  label: string;
  score: number;
  max: number;
  comment?: string;
};

/** Le vert et le rouge sont des couleurs système : ici ils disent l'état du
 *  commerce, et rien d'autre (§4.2). */
function toneOf(score: number): string {
  if (score >= 70) return themeColors.success;
  if (score >= 40) return themeColors.warning;
  return themeColors.danger;
}

export function HealthCard({
  score,
  grade,
  pillars,
  loading,
  labels,
}: {
  score: number;
  grade: string;
  pillars: HealthPillar[];
  loading: boolean;
  labels: { title: string; hint: string };
}) {
  return (
    <Card className="p-4">
      <p className="text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
        {labels.title}
      </p>

      <div className="my-4 flex justify-center">
        {loading
          ? <span className="pp-skeleton block h-40 w-40 rounded-pill" aria-hidden />
          : <Gauge score={score} grade={grade} />}
      </div>

      {/* Un score sans explication ne se corrige pas : les quatre piliers, avec
          leur poids réel. Barres neutres — le score est déjà la couleur. */}
      <ul className="space-y-3">
        {pillars.map((p) => (
          <li key={p.label}>
            <div className="flex items-center gap-3">
              <span className="w-28 flex-shrink-0 truncate text-note text-text2 dark:text-dark-text2">
                {p.label}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface2 dark:bg-dark-surface2">
                <span
                  className="block h-full rounded-pill bg-primary transition-[width] duration-moment ease-pp dark:bg-dark-text2"
                  style={{ width: `${Math.round((p.score / p.max) * 100)}%` }}
                />
              </span>
              <span className="amount w-12 flex-shrink-0 text-right text-note font-bold text-primary dark:text-dark-text">
                {p.score}/{p.max}
              </span>
            </div>
            {p.comment && (
              <p className="mt-1 text-note text-muted dark:text-dark-muted">{p.comment}</p>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-note text-muted dark:text-dark-muted">{labels.hint}</p>
    </Card>
  );
}

const R = 72;
const CX = 100;
const CY = 104;
// 270° d'arc : la longueur totale que la jauge peut remplir.
const ARC_LEN = 2 * Math.PI * R * 0.75;

function polar(deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function Gauge({ score, grade }: { score: number; grade: string }) {
  const from = polar(135);
  const to = polar(405);
  const track = `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${R} ${R} 0 1 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  const filled = ARC_LEN * (Math.max(0, Math.min(100, score)) / 100);
  const tone = toneOf(score);

  return (
    <svg viewBox="0 0 200 180" className="h-40 w-40" role="img" aria-label={`${score} / 100 — ${grade}`}>
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
      {/* Le chiffre domine ; le grade le qualifie. Deux tailles, pas cinq. */}
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
