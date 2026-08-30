'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les DEUX états vides (§5.10) — ils ne se traitent pas pareil.
//
//   FirstRun    le compte est neuf, rien n'existe encore. On attire l'attention
//               sur l'action principale, avec une phrase et un geste montré.
//               C'est ce qui remplace, définitivement, les fausses données de
//               démonstration : montrer un faux flux de trésorerie à un marchand
//               qui vient de s'inscrire est la pire réponse possible.
//
//   NoResult    une recherche sans résultat. Elle le DIT, suggère une correction
//               en cas de faute probable, et offre une sortie.
//
// « Dans un logiciel de gestion, un chiffre affiché est une promesse. »
// Un état vide n'est jamais un écran raté : c'est un moment de design.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Premier accueil — plein écran, une illustration légère, une phrase, l'action.
 * Une seule info-bulle d'apprentissage, qui montre où se trouve le geste.
 */
export function FirstRun({
  illustration,
  title,
  hint,
  action,
  pointsTo,
  className,
}: {
  illustration?: ReactNode;
  /** Une phrase. « Votre commerce s'affichera ici. » */
  title: string;
  /** Ce qu'il faut faire pour que l'écran se remplisse. */
  hint?: string;
  action?: ReactNode;
  /** Le libellé de la cible que la flèche désigne — « + Vente », en bas. */
  pointsTo?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-8 text-center', className)}>
      {illustration && <div className="mb-6 text-muted dark:text-dark-muted">{illustration}</div>}

      <p className="max-w-xs text-card font-bold text-primary dark:text-dark-text">{title}</p>

      {hint && (
        <p className="mt-2 max-w-xs text-body text-text2 dark:text-dark-text2">{hint}</p>
      )}

      {action && <div className="mt-8 w-full max-w-xs">{action}</div>}

      {pointsTo && (
        <p className="mt-8 inline-flex items-center gap-2 text-note text-muted dark:text-dark-muted">
          <ArrowDown />
          {pointsTo}
        </p>
      )}
    </div>
  );
}

/**
 * Résultat introuvable — constat explicite, suggestion, action de sortie.
 * « Aucun produit “savn” — vouliez-vous dire “savon” ? » + « Créer ce produit »
 */
export function NoResult({
  query,
  noun,
  suggestion,
  onUseSuggestion,
  onClear,
  action,
}: {
  query: string;
  /** Ce qu'on cherchait : « produit », « client », « vente ». */
  noun: string;
  /** La correction probable, si on sait la calculer. */
  suggestion?: string | null;
  onUseSuggestion?: (value: string) => void;
  onClear?: () => void;
  /** La sortie utile : créer l'élément manquant sur-le-champ. */
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-body text-text2 dark:text-dark-text2">
        Aucun {noun} ne correspond à <span className="font-bold text-primary dark:text-dark-text">« {query} »</span>.
      </p>

      {suggestion && onUseSuggestion && (
        <button
          type="button"
          onClick={() => onUseSuggestion(suggestion)}
          className="pressable mt-2 min-h-touch text-body text-primary underline underline-offset-4 dark:text-accent"
        >
          Vouliez-vous dire « {suggestion} » ?
        </button>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        {action}
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="pressable min-h-touch text-note text-muted underline underline-offset-4 dark:text-dark-muted"
          >
            Effacer la recherche
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Distance de Levenshtein bornée — sert à proposer « savon » pour « savn ».
 * Une suggestion n'est offerte que si elle est proche : une correction fausse
 * est pire qu'une absence de correction.
 */
export function closestMatch(query: string, candidates: string[], maxDistance = 2): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return null;

  let best: string | null = null;
  let bestScore = maxDistance + 1;

  for (const candidate of candidates) {
    const c = candidate.toLowerCase();
    const d = distance(q, c);
    if (d < bestScore) {
      bestScore = d;
      best = candidate;
    }
  }
  return bestScore <= maxDistance ? best : null;
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const row = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = row[j];
  }
  return prev[b.length];
}

function ArrowDown() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}
