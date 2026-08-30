'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le passage d'un écran à l'autre — moment n° 6 (§7)
//
// « Balayage retour avec glissement parallaxe (l'écran précédent revient depuis
//   ≈ 35 % de décalage) […] La colle invisible entre tous les moments. »
//
// C'était le dernier moment manquant, et c'est celui qui se remarque le plus
// quand il n'est pas là : sans lui, chaque navigation est une coupure sèche et
// le marchand perd le fil de l'endroit d'où il vient.
//
// Trois règles, tenues ici :
//
//   Informer, pas décorer.  Le décalage de 35 % dit « il y a un écran derrière
//   celui-ci, et le voici qui revient ». Coupez-le : l'écran glisse sur du vide
//   et le geste ne veut plus rien dire.
//
//   Toujours interruptible. Le doigt commande ; rien ne se joue par-dessus lui.
//   Un balayage abandonné à mi-course revient en place.
//
//   Sobre sur un Android modeste. Uniquement `transform` — la seule propriété
//   que le téléphone compose sans repeindre — et pas un seul rendu React
//   pendant le glissement : les positions passent par le style de l'élément.
//   Le réglage « réduire les animations » du téléphone supprime le glissement ;
//   le geste, lui, continue de ramener en arrière.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/** Le geste ne part que du bord : ailleurs, c'est un défilement horizontal. */
const EDGE_PX = 24;
/** « L'écran précédent revient depuis ≈ 35 % de décalage » (§7). */
const PARALLAX = 0.35;
/** Au-delà de 40 % de la largeur, le geste est un retour. En deçà, il revient. */
const COMMIT_RATIO = 0.4;
/** Un balayage rapide compte, même court : le pouce pressé est une intention. */
const COMMIT_VELOCITY = 0.5; // px/ms

/** Les écrans d'où il n'y a rien à quitter par la gauche. */
const ROOTS = new Set(['/dashboard', '/']);

export function ScreenTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const screenRef = useRef<HTMLDivElement>(null);
  const backRef   = useRef<HTMLDivElement>(null);

  // Tout l'état du geste vit dans des refs : un `setState` par `touchmove`,
  // c'est soixante rendus par seconde sur un téléphone qui n'en a pas les moyens.
  const startX   = useRef(0);
  const startY   = useRef(0);
  const lastX    = useRef(0);
  const lastT    = useRef(0);
  const speed    = useRef(0);
  const dx       = useRef(0);
  const active   = useRef(false);
  const decided  = useRef(false);
  const leaving  = useRef(false);

  useEffect(() => {
    const screen = screenRef.current;
    const back   = backRef.current;
    if (!screen || !back) return;

    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Pose les deux couches. `settle` demande le retour amorti en 220 ms. */
    function place(offset: number, settle: boolean) {
      const width = window.innerWidth || 1;
      screen!.classList.toggle('pp-settle', settle);
      back!.classList.toggle('pp-settle', settle);
      screen!.style.transform = offset ? `translateX(${offset}px)` : '';
      // Le décalage : la couche du dessous rattrape son retard à 35 % du geste.
      const progress = Math.min(1, Math.max(0, offset / width));
      back!.style.transform = `translateX(${-(1 - progress) * PARALLAX * width}px)`;
    }

    function reset(settle: boolean) {
      active.current  = false;
      decided.current = false;
      dx.current      = 0;
      speed.current   = 0;
      screen!.classList.remove('pp-drag');
      place(0, settle);
    }

    // Un nouvel écran : ardoise propre, même si le précédent a été quitté au
    // milieu d'un geste.
    leaving.current = false;
    reset(false);

    function onStart(e: TouchEvent) {
      if (leaving.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch.clientX > EDGE_PX) return;
      // Rien derrière : le geste n'aurait nulle part où aller.
      if (ROOTS.has(pathname ?? '') || window.history.length <= 1) return;

      active.current  = true;
      decided.current = false;
      startX.current  = touch.clientX;
      startY.current  = touch.clientY;
      lastX.current   = touch.clientX;
      lastT.current   = e.timeStamp;
      speed.current   = 0;
      dx.current      = 0;
    }

    function onMove(e: TouchEvent) {
      if (!active.current) return;
      const touch = e.touches[0];
      const moveX = touch.clientX - startX.current;
      const moveY = touch.clientY - startY.current;

      // Le premier mouvement tranche : horizontal, c'est un retour ; vertical,
      // c'est un défilement et on rend la main sans rien avoir bougé.
      if (!decided.current) {
        if (Math.abs(moveX) < 8 && Math.abs(moveY) < 8) return;
        if (Math.abs(moveY) > Math.abs(moveX)) { reset(false); return; }
        decided.current = true;
        screen!.classList.add('pp-drag');
      }

      const dt = e.timeStamp - lastT.current;
      if (dt > 0) speed.current = (touch.clientX - lastX.current) / dt;
      lastX.current = touch.clientX;
      lastT.current = e.timeStamp;
      dx.current    = Math.max(0, moveX);

      if (!reduced) place(dx.current, false);
      // Le geste est pris en charge : le navigateur ne défile pas en plus.
      if (e.cancelable) e.preventDefault();
    }

    function onEnd() {
      if (!active.current) return;
      const width  = window.innerWidth || 1;
      const commit = decided.current
        && (dx.current > width * COMMIT_RATIO || speed.current > COMMIT_VELOCITY);

      if (!commit) { reset(true); return; }

      active.current  = false;
      decided.current = false;
      leaving.current = true;
      screen!.classList.remove('pp-drag');

      if (reduced) { router.back(); return; }

      // L'écran finit sa sortie, puis on revient. L'écran d'arrivée jouera son
      // entrée : les deux mouvements se relaient au lieu de se superposer.
      place(width, true);
      window.setTimeout(() => router.back(), 160);
      // Filet : si l'historique ne bouge pas — page ouverte directement, retour
      // bloqué — l'écran ne reste pas coincé hors de la vue.
      window.setTimeout(() => { if (leaving.current) reset(true); }, 700);
    }

    function onCancel() { reset(true); }

    screen.addEventListener('touchstart',  onStart,  { passive: true });
    screen.addEventListener('touchmove',   onMove,   { passive: false });
    screen.addEventListener('touchend',    onEnd,    { passive: true });
    screen.addEventListener('touchcancel', onCancel, { passive: true });

    return () => {
      screen.removeEventListener('touchstart',  onStart);
      screen.removeEventListener('touchmove',   onMove);
      screen.removeEventListener('touchend',    onEnd);
      screen.removeEventListener('touchcancel', onCancel);
    };
  }, [pathname, router]);

  return (
    <div className="relative">
      {/* La couche du dessous. Elle ne montre pas l'écran précédent — le
          navigateur ne l'a plus — mais elle en tient la place et en donne la
          profondeur. Elle ne dit rien de faux : c'est du mouvement, pas une
          donnée. Sur bureau il n'y a pas de balayage : elle n'existe pas. */}
      <div ref={backRef} className="pp-back lg:hidden" aria-hidden />

      {/* `key` sur le chemin : chaque écran rejoue son entrée. */}
      <div
        key={pathname}
        ref={screenRef}
        className="pp-screen pp-screen-in min-h-[calc(100vh-3.5rem)]"
      >
        {children}
      </div>
    </div>
  );
}
