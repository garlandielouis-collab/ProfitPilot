'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La bande d'avis qui glisse, à toutes les largeurs
//
// Sur téléphone, on la fait glisser au doigt. Sur tablette et ordinateur, le
// pavé tactile le permet aussi, mais pas la molette d'une souris : deux
// flèches, sous la bande, avancent d'une page de cartes. Elles ne
// s'affichent que si la bande déborde — trois avis qui tiennent à l'écran
// n'ont rien à faire défiler — et chacune s'éteint au bout de sa course.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Une carte : 82 % sur téléphone, deux sur tablette, trois sur ordinateur. */
export const SLIDE_ITEM = 'w-[82%] flex-shrink-0 snap-start sm:w-[calc((100%_-_var(--st-grid-gap))_/_2)] lg:w-[calc((100%_-_2_*_var(--st-grid-gap))_/_3)]';

export function ReviewSlider({ children, label }: { children: ReactNode; label: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 4,
      end:   el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };

  const overflows = !(edges.start && edges.end);

  return (
    <div>
      {/* `-mx-4 px-4` sur téléphone : la bande dépasse des marges, la carte
          suivante sort de l'écran et dit qu'il y en a une suivante. */}
      <ul
        ref={track}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        style={{ gap: 'var(--st-grid-gap)', scrollbarWidth: 'none' }}
      >
        {children}
      </ul>

      {overflows && (
        <div className="mt-4 hidden justify-end gap-2 sm:flex">
          <Arrow label="Avis précédents" disabled={edges.start} onClick={() => go(-1)}>
            <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Arrow>
          <Arrow label="Avis suivants" disabled={edges.end} onClick={() => go(1)}>
            <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Arrow>
        </div>
      )}
    </div>
  );
}

function Arrow({ label, disabled, onClick, children }: {
  label: string; disabled: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center border transition hover:brightness-95 disabled:cursor-default disabled:opacity-35"
      style={{
        borderColor:  'var(--st-border)',
        background:   'var(--st-surface)',
        color:        'var(--st-ink)',
        borderRadius: '999px',
      }}
    >
      {children}
    </button>
  );
}
