'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le sélecteur de période — la sélection se marque par le CONTRASTE (§3.4)
//
// Avant : l'émeraude pour les mois, le violet pour les trimestres, le bleu pour
// les semestres. Trois accents concurrents sur un même contrôle, et l'œil ne
// savait plus lequel était l'état « choisi ».
//
// Après : fond marine, texte blanc. Un seul motif de sélection dans toute
// l'application. Une seule direction de défilement pour la rangée de pastilles
// — horizontale, jamais verticale (§5.3). Chaque pastille fait 44 px (§5.9).
// ─────────────────────────────────────────────────────────────────────────────

import { FilterPill } from '../ds';
import {
  MONTHS, QUARTERS, SEMESTERS,
  type Period, type PeriodMode,
} from './period';

const MODES: PeriodMode[] = ['mois', 'trimestre', 'semestre'];

export function PeriodPicker({
  period,
  onChange,
}: {
  period: Period;
  onChange: (next: Period) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="inline-flex gap-1 rounded-pill bg-surface2 p-1 dark:bg-dark-surface2">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ ...period, mode })}
            aria-pressed={period.mode === mode}
            className={`pressable min-h-touch rounded-pill px-4 text-note font-bold capitalize transition-colors duration-press ease-pp ${
              period.mode === mode ? 'bg-primary text-white' : 'text-text2 dark:text-dark-text2'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        {period.mode === 'mois' && MONTHS.map((m, i) => (
          <FilterPill
            key={m}
            label={m.slice(0, 3)}
            selected={period.month === i}
            onClick={() => onChange({ ...period, month: i })}
          />
        ))}
        {period.mode === 'trimestre' && QUARTERS.map((q, i) => (
          <FilterPill
            key={q.label}
            label={q.label}
            selected={period.quarter === i}
            onClick={() => onChange({ ...period, quarter: i })}
          />
        ))}
        {period.mode === 'semestre' && SEMESTERS.map((s, i) => (
          <FilterPill
            key={s.label}
            label={s.label}
            selected={period.semester === i}
            onClick={() => onChange({ ...period, semester: i })}
          />
        ))}
      </div>
    </div>
  );
}
