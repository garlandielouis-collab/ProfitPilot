'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Switch — l'interrupteur, une seule fois pour toute l'application (§3.4)
//
// Deux écrans le redessinaient chacun de son côté (les notifications et
// l'automatisation), avec deux couleurs d'état actif, deux tailles de pastille
// et, dans les deux cas, une cible de 24 px de haut — soit la moitié des 44 px
// exigés (§5.9). Un interrupteur qu'on rate au pouce se rattrape en le touchant
// une seconde fois : on l'a alors éteint puis rallumé, et on ne sait plus dans
// quel état il est.
//
// ── Deux choix qui ne sautent pas aux yeux ─────────────────────────────────
//
// L'état actif est MARINE, pas émeraude. L'émeraude est la couleur des 10 % :
// l'action principale de l'écran. Une page de préférences avec douze
// interrupteurs verts, c'est douze actions principales — donc aucune (§4.1).
//
// Le libellé fait partie de la cible : `<label>` enveloppe le tout. Toucher le
// texte bascule l'interrupteur, ce qui multiplie la surface utile par cinq sans
// rien ajouter à l'écran.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Switch({
  checked,
  onChange,
  label,
  hint,
  icon,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Ce que l'interrupteur commande. Il se lit sans le contexte de la ligne. */
  label: string;
  /** Une ligne : ce qui se passera une fois activé. */
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex min-h-touch cursor-pointer items-center gap-3 py-1',
        disabled && 'cursor-not-allowed opacity-45',
      )}
    >
      {icon && <span className="flex-shrink-0 text-muted dark:text-dark-muted">{icon}</span>}

      <span className="min-w-0 flex-1">
        <span className="block text-body text-primary dark:text-dark-text">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-note text-muted dark:text-dark-muted">{hint}</span>
        )}
      </span>

      {/* La case native reste : elle porte l'état, le focus clavier et
          l'annonce du lecteur d'écran. Elle est masquée, jamais retirée. */}
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />

      <span
        aria-hidden
        className={cn(
          'relative h-6 w-11 flex-shrink-0 rounded-pill transition-colors duration-press ease-pp',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2',
          checked ? 'bg-primary dark:bg-accent' : 'bg-border dark:bg-dark-border',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-4 w-4 rounded-pill bg-white shadow-card',
            'transition-transform duration-press ease-pp',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </label>
  );
}
