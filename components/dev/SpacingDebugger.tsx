'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le carré rouge, version développeur (masterclass §2)
//
// « On dessine des carrés rouges de 8, 16, 24, 32 et 48 points et on les glisse
//   physiquement entre les objets pour vérifier chaque distance. Ce n'est pas
//   une décoration pédagogique : c'est un instrument de mesure. Une distance
//   qu'on ne peut pas nommer par un carré est une distance fausse. »
//
// Et le piège que le cours répète en boucle : « faire confiance à l'œil.
// L'instinct place les éléments à un ou deux points de la bonne position, et
// ces petites erreurs s'accumulent en une impression générale de désordre qu'on
// ne sait pas expliquer. »
//
// D'où ce mode : il MESURE, il ne juge pas. Il lit les marges et les écarts
// calculés par le navigateur — pas les classes écrites dans le code, qui
// mentent dès qu'un style en ligne ou une bibliothèque tierce s'en mêle — et
// surligne ce qui tombe hors de la grille.
//
//   rouge   la valeur n'est pas un multiple de 4 : c'est une faute, pas un choix
//   ambre   multiple de 4 mais pas de 8 : le 4 est réservé au micro-espacement
//           (icône et texte, deux lignes d'un même bloc). Au-delà, il se justifie.
//
// Ouverture : `Maj + G`, ou `?grid=1` dans l'adresse. Le réglage tient dans le
// navigateur, pour survivre à un rechargement pendant une revue d'écran.
//
// Ce composant n'existe qu'en développement — `app/layout.tsx` ne le monte que
// si `NODE_ENV` vaut `development`. Il ne part jamais chez un marchand.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';

/** Les propriétés qui décident des distances. Les bordures et les rayons ne
 *  sont pas des distances : ils ont leur propre système (§23). */
const PROPS = [
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'rowGap', 'columnGap',
] as const;

type Offense = { el: HTMLElement; prop: string; px: number; grave: boolean };

/** Une distance nommable par un carré : 0, ou un multiple de 4. */
function judge(px: number): { flag: boolean; grave: boolean } {
  if (!Number.isFinite(px) || px === 0) return { flag: false, grave: false };
  // Le navigateur rend en pixels fractionnaires (13.6px pour 0.85rem) : on
  // arrondit au dixième avant de juger, sinon tout l'écran est en faute.
  const v = Math.round(px * 10) / 10;
  if (v % 4 !== 0) return { flag: true, grave: true };
  if (v % 8 !== 0 && v > 8) return { flag: true, grave: false };
  return { flag: false, grave: false };
}

function scan(): Offense[] {
  const out: Offense[] = [];
  const all = document.querySelectorAll<HTMLElement>('#pp-app *, main *');
  let seen = 0;

  for (const el of all) {
    if (seen++ > 4000) break;                       // une revue, pas un profilage
    if (el.dataset.ppGridIgnore !== undefined) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const cs = getComputedStyle(el);
    for (const prop of PROPS) {
      const px = parseFloat(cs[prop]);
      const { flag, grave } = judge(px);
      if (flag) out.push({ el, prop, px, grave });
    }
  }
  return out;
}

const STYLE_ID = 'pp-grid-style';
const CSS = `
  [data-pp-grid-off]  { outline: 1px solid #B23A2F !important; outline-offset: -1px; }
  [data-pp-grid-warn] { outline: 1px dashed #B45309 !important; outline-offset: -1px; }
`;

export function SpacingDebugger() {
  const [on, setOn] = useState(false);
  const [count, setCount] = useState({ grave: 0, warn: 0 });

  // Au premier rendu seulement : l'adresse l'emporte sur le réglage retenu.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('grid');
    setOn(param === '1' || (param === null && localStorage.getItem('pp-grid') === '1'));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.shiftKey && (e.key === 'G' || e.key === 'g') && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement | null;
        if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
        setOn((v) => {
          localStorage.setItem('pp-grid', v ? '0' : '1');
          return !v;
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const measure = useCallback(() => {
    document.querySelectorAll('[data-pp-grid-off],[data-pp-grid-warn]').forEach((el) => {
      el.removeAttribute('data-pp-grid-off');
      el.removeAttribute('data-pp-grid-warn');
    });

    const found = scan();
    for (const o of found) {
      o.el.setAttribute(o.grave ? 'data-pp-grid-off' : 'data-pp-grid-warn', String(o.px));
    }
    setCount({
      grave: found.filter((o) => o.grave).length,
      warn:  found.filter((o) => !o.grave).length,
    });

    if (found.length) {
      // eslint-disable-next-line no-console
      console.groupCollapsed(`[grille] ${found.length} distances hors grille`);
      // eslint-disable-next-line no-console
      console.table(found.map((o) => ({
        élément: o.el.tagName.toLowerCase() + (o.el.className ? '.' + String(o.el.className).split(' ')[0] : ''),
        propriété: o.prop,
        px: o.px,
        verdict: o.grave ? 'hors grille de 4' : 'hors grille de 8',
      })));
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  }, []);

  useEffect(() => {
    const existing = document.getElementById(STYLE_ID);
    if (!on) {
      existing?.remove();
      document.querySelectorAll('[data-pp-grid-off],[data-pp-grid-warn]').forEach((el) => {
        el.removeAttribute('data-pp-grid-off');
        el.removeAttribute('data-pp-grid-warn');
      });
      return;
    }

    if (!existing) {
      const tag = document.createElement('style');
      tag.id = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // Une mesure au montage, puis à chaque respiration de la page : un écran
    // qui charge ses données change de distances en cours de route.
    measure();
    const timer = window.setInterval(measure, 1500);
    return () => window.clearInterval(timer);
  }, [on, measure]);

  if (!on) return null;

  return (
    <div
      data-pp-grid-ignore
      className="fixed bottom-24 left-4 z-[9999] rounded-surface border border-border bg-white px-4 py-3 text-note text-text"
      style={{ boxShadow: '0 2px 4px rgba(15,23,42,0.06), 0 16px 40px rgba(15,23,42,0.14)' }}
    >
      <p className="font-bold">Grille de 8 — mode mesure</p>
      <p className="mt-1">
        <span style={{ color: '#B23A2F' }}>■</span> {count.grave} hors grille de 4
        {'  ·  '}
        <span style={{ color: '#B45309' }}>■</span> {count.warn} hors grille de 8
      </p>
      <p className="mt-1 text-muted">Maj + G pour refermer</p>
    </div>
  );
}
