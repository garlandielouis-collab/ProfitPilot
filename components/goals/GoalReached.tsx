'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Moment 5 — l'objectif mensuel atteint (§7)
//
// « Le seul moment de vraie célébration : plein écran bref, confettis sobres
//   aux couleurs de la palette, montant final en chasse fixe, partage possible.
//   Une fois par mois maximum — c'est ce qui lui garde sa valeur. »
//
// Le budget d'animation est strict : un plein écran par mois, jamais deux. La
// clé de mémorisation porte le mois ET la métrique, donc un objectif atteint en
// août ne se re-fête pas en rouvrant l'application le lendemain. Les confettis
// sont douze pastilles de la palette — ni or, ni rose, ni dégradé.
//
// « Pour un marchand qui hésite entre son cahier et une application, chaque
//   moment de satisfaction compte double : le cahier, lui, ne félicite jamais. »
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Button } from '../ds';

const SEEN_KEY = 'pp_goal_celebrated';

/** Une fois par mois et par métrique. Le mois fait partie de la clé. */
function keyFor(metric: string): string {
  const now = new Date();
  return `${SEEN_KEY}:${metric}:${now.getFullYear()}-${now.getMonth()}`;
}

export function alreadyCelebrated(metric: string): boolean {
  try {
    return localStorage.getItem(keyFor(metric)) === '1';
  } catch {
    // Navigation privée, stockage refusé : mieux vaut ne pas fêter que fêter
    // deux fois. Le silence est le repli sûr.
    return true;
  }
}

function markCelebrated(metric: string) {
  try { localStorage.setItem(keyFor(metric), '1'); } catch { /* stockage refusé */ }
}

// Douze pastilles, trois couleurs de la palette, des trajectoires fixes : pas
// de hasard, donc pas de rendu différent d'un appareil à l'autre.
const CONFETTI = Array.from({ length: 12 }, (_, i) => ({
  left:  `${(i * 8.5 + 6) % 96}%`,
  delay: `${(i % 6) * 60}ms`,
  tone:  i % 3 === 0 ? 'bg-accent' : i % 3 === 1 ? 'bg-primary' : 'bg-success',
}));

export function GoalReached({
  metric,
  label,
  value,
  onClose,
}: {
  metric: string;
  label: string;
  /** Déjà formaté : un objectif peut être un montant ou un nombre de clients. */
  value: string;
  onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    markCelebrated(metric);
    // Bref : le marchand a des clients devant lui. Il peut aussi fermer avant.
    const timer = setTimeout(() => setLeaving(true), 3200);
    return () => clearTimeout(timer);
  }, [metric]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onClose, 220);
    return () => clearTimeout(timer);
  }, [leaving, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={() => setLeaving(true)}
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white px-8 text-center transition-opacity duration-move ease-pp dark:bg-dark-bg ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Les confettis : sobres, de la palette, et purement décoratifs — donc
          invisibles pour les lecteurs d'écran. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden" aria-hidden>
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className={`pp-drop absolute top-0 h-2 w-2 rounded-pill ${c.tone}`}
            style={{ left: c.left, animationDelay: c.delay }}
          />
        ))}
      </div>

      <p className="pp-celebrate text-card font-bold text-primary dark:text-dark-text">
        Objectif atteint
      </p>

      {/* Le chiffre final, en chasse fixe : il est le héros du moment. */}
      <p className="pp-celebrate amount mt-4 text-amount-lg font-bold text-primary dark:text-dark-text">
        {value}
      </p>

      <p className="mt-2 max-w-xs text-body text-text2 dark:text-dark-text2">{label}</p>

      <div className="mt-8 w-full max-w-xs">
        <Button variant="primary" size="lg" block onClick={() => setLeaving(true)}>
          Continuer
        </Button>
      </div>
    </div>
  );
}
