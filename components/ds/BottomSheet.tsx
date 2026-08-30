'use client';

// ─────────────────────────────────────────────────────────────────────────────
// BottomSheet — agir sans changer de contexte (§5.7)
//
// Quand une tâche secondaire surgit au milieu d'une tâche principale, arracher
// l'utilisateur vers une autre page casse son fil. La feuille monte par-dessus
// l'écran, garde le contexte visible derrière, et se ferme d'un geste.
//
// Chez ProfitPilot : le choix du mode de paiement pendant une vente (la vente
// reste visible derrière), un remboursement partiel depuis une créance, le
// filtre d'une liste, le détail d'un point de graphique.
//
// Le balayage vertical la ferme (§5.8) — mais le geste n'est jamais le seul
// chemin : la poignée et la touche Échap font la même chose.
//
// ── Moment 6 (§7) ────────────────────────────────────────────────────────────
// « Feuilles inférieures qui font reculer l'arrière-plan. »
// La feuille se monte dans le corps du document, pas dans l'application : c'est
// ce qui permet à `#pp-app` de reculer d'un cran derrière elle sans emporter la
// feuille dans le mouvement. Le contexte reste lisible — c'est tout l'intérêt
// d'une feuille — mais il passe visiblement au second plan, et on comprend sans
// y penser que la feuille se refermera.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

/** Plusieurs feuilles peuvent se superposer : l'arrière-plan ne revient au
 *  premier plan que lorsque la dernière s'est refermée. */
let openSheets = 0;

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  /** Un titre court. Il ne répète pas le libellé du bouton qui a ouvert la feuille. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const [mounted, setMounted] = useState(false);
  const startY = useRef<number | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Échap ferme — le geste a toujours son équivalent visible et clavier.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    // L'arrière-plan ne défile pas pendant qu'une feuille est ouverte, et il
    // recule d'un cran : c'est le moment 6 (§7).
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    openSheets += 1;
    document.body.dataset.sheet = 'open';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      openSheets = Math.max(0, openSheets - 1);
      if (openSheets === 0) delete document.body.dataset.sheet;
    };
  }, [open, onClose]);

  useEffect(() => { if (!open) setDragY(0); }, [open]);

  if (!open || !mounted) return null;

  function onTouchStart(e: React.TouchEvent) { startY.current = e.touches[0].clientY; }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setDragY(dy);
  }

  function onTouchEnd() {
    // Au-delà du quart de la hauteur, le geste est une fermeture — sinon la
    // feuille revient en place : le doigt n'a pas à être précis.
    if (dragY > 120) onClose();
    else setDragY(0);
    startY.current = null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      {/* L'arrière-plan recule légèrement : le contexte reste lisible derrière. */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-primary/40 backdrop-blur-[2px]"
        style={{ opacity: Math.max(0, 1 - dragY / 400) }}
      />

      <div
        className={cn(
          'pp-drop relative max-h-[88vh] overflow-hidden rounded-t-[16px] bg-white shadow-pop',
          'dark:bg-dark-surface',
        )}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY ? 'none' : 'transform var(--dur-move) var(--ease-pp)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* La poignée : elle enseigne le geste, une fois. */}
        <div
          className="flex cursor-grab touch-none flex-col items-center pt-3"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="h-1 w-10 rounded-pill bg-border dark:bg-dark-border" />
        </div>

        <div className="flex min-h-touch items-center justify-between gap-4 px-4 pt-2">
          <h2 className="text-card font-bold text-primary dark:text-dark-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="pressable -mr-2 flex h-touch w-touch items-center justify-center rounded-pill text-muted"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="max-h-[64vh] overflow-y-auto px-4 pb-4 pt-2">{children}</div>

        {footer && (
          <div className="border-t border-border px-4 py-4 dark:border-dark-border">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
