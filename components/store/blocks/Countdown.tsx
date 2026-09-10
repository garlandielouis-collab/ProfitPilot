'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le compte à rebours
//
// L'urgence vend, et l'urgence fausse détruit la confiance plus vite qu'elle ne
// vend. Trois garde-fous, donc :
//
//   Il faut une VRAIE date de fin, réglée par le marchand. Pas de « se réarme
//   toutes les 24 h » : le client qui revient le lendemain et retrouve les
//   mêmes « 4 heures restantes » sait qu'on lui a menti, et il le sait pour
//   tout le reste de la vitrine, y compris les prix.
//
//   Échéance passée → le composant disparaît. Il ne se rallonge pas, il ne
//   reste pas figé sur 00:00:00.
//
//   Rien n'est rendu côté serveur : le HTML statique afficherait le temps
//   restant au moment du build, faux pour tout le monde.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { ThemeConfig } from '../../../lib/storeTheme';

function remaining(deadline: number) {
  const ms = deadline - Date.now();
  if (ms <= 0) return null;
  return {
    days:    Math.floor(ms / 86_400_000),
    hours:   Math.floor((ms / 3_600_000) % 24),
    minutes: Math.floor((ms / 60_000) % 60),
    seconds: Math.floor((ms / 1_000) % 60),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ urgency }: { urgency: ThemeConfig['urgency'] }) {
  const deadline = urgency.deadline ? new Date(urgency.deadline).getTime() : NaN;
  const valid = urgency.enabled && Number.isFinite(deadline);

  const [left, setLeft] = useState<ReturnType<typeof remaining>>(null);

  useEffect(() => {
    if (!valid) return;
    setLeft(remaining(deadline));
    const id = window.setInterval(() => {
      const next = remaining(deadline);
      setLeft(next);
      if (!next) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [valid, deadline]);

  if (!valid || !left) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-3 text-center"
      style={{ background: 'var(--st-primary)', color: 'var(--st-primary-ink)' }}
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold">
        <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />
        {urgency.message || 'Offre limitée'}
      </span>
      <span className="text-[15px] font-semibold tabular-nums" aria-live="off">
        {left.days > 0 && `${left.days}j `}
        {pad(left.hours)}:{pad(left.minutes)}:{pad(left.seconds)}
      </span>
    </div>
  );
}
