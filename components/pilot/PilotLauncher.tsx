'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La bulle de Pilot AI — un copilote qu'on appelle, pas un chatbot qui parle
//
// Une bulle d'assistant rate de deux façons opposées. Trop discrète, personne ne
// la voit : elle coûte un coin d'écran et ne rend rien. Trop bruyante — pastille
// géante, rebond permanent, message qui s'ouvre tout seul à chaque page — et le
// marchand apprend à la fermer sans lire, ce qui est pire : il a maintenant un
// réflexe de rejet contre la seule aide du produit.
//
// D'où les trois décisions qui tiennent ce fichier :
//
//   1. 56 sur téléphone, 64 sur grand écran. Marine, l'émeraude réduite à un
//      point — l'aplat d'accent de l'écran est déjà pris par le bouton de vente
//      de la barre mobile, et le §4 n'en autorise qu'un.
//   2. La capsule ne s'ouvre pas à chaque page. Une fois par écran et par
//      session, elle se rétracte seule au bout de dix secondes, et « Pa montre
//      ankò » l'éteint pour toute la session.
//   3. Elle dit quelque chose de l'écran. « Besoin d'aide ? » sur les ventes ne
//      vaut pas « Je peux vous aider à analyser vos ventes » : la première
//      demande au marchand de formuler son problème, la seconde le formule pour
//      lui. La table vit dans `lib/pilotContext.ts`.
//
// La géométrie (16 du bord, 16 au-dessus de la barre mobile de 72, 24 sur grand
// écran) vit dans `app/globals.css`, bloc « PILOT AI » : elle dépend de la
// hauteur de la barre et de l'encoche, deux valeurs qui ne sont pas à ce
// composant.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bot, X } from 'lucide-react';

import { checkSubscriptionExpired } from '../../hooks/useSubscription';
import { useLanguage } from '../LanguageWrapper';
import {
  EXPIRED_PILOT_ROUTE, isPilotSurface, pilotRouteFor, type PilotRoute,
} from '../../lib/pilotContext';
import { cn } from '../../lib/utils';
import { PilotPanel } from './PilotPanel';

/** Les capsules déjà montrées, et l'extinction générale, pour cette session. */
const SEEN_KEY   = 'pp_pilot_seen';
const SILENT_KEY = 'pp_pilot_silent';

/** Dix secondes : le temps de lire deux lignes sans que ça devienne un meuble. */
const CAPSULE_LIFE = 10_000;
/** Le temps que l'écran se pose avant qu'on lui parle. */
const CAPSULE_DELAY = 1_200;

function seenRoutes(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // Navigation privée, stockage refusé : la capsule se montrera une fois de
    // plus que prévu, ce qui est sans conséquence. Elle ne doit jamais faire
    // tomber l'écran pour autant.
    return new Set();
  }
}

function markSeen(key: string) {
  try {
    const seen = seenRoutes();
    seen.add(key);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch { /* voir ci-dessus */ }
}

export function PilotLauncher() {
  const pathname = usePathname();
  const { t }    = useLanguage();

  const [open,    setOpen]    = useState(false);
  const [capsule, setCapsule] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => { setExpired(checkSubscriptionExpired()); }, []);

  const here: PilotRoute = expired ? EXPIRED_PILOT_ROUTE : pilotRouteFor(pathname);
  const onSurface        = isPilotSurface(pathname);

  // ── Quand la capsule paraît ────────────────────────────────────────────────
  //
  // Une fois par écran et par session. Le compte à rebours repart à chaque
  // changement d'adresse, et il est annulé si le marchand ouvre le panneau
  // entre-temps : proposer de l'aide à quelqu'un qui est déjà en train d'en
  // demander est le genre de détail qui fait passer un produit pour une
  // machine.
  useEffect(() => {
    if (!onSurface || open) { setCapsule(false); return; }

    let silent = false;
    try { silent = sessionStorage.getItem(SILENT_KEY) === '1'; } catch { /* idem */ }
    if (silent || seenRoutes().has(here.key)) return;

    const show = window.setTimeout(() => {
      setCapsule(true);
      markSeen(here.key);
    }, CAPSULE_DELAY);

    return () => window.clearTimeout(show);
  }, [pathname, onSurface, open, here.key]);

  // Elle se rétracte seule. Un message qui reste devient un meuble, et un
  // meuble se contourne du regard.
  useEffect(() => {
    if (!capsule) return;
    const hide = window.setTimeout(() => setCapsule(false), CAPSULE_LIFE);
    return () => window.clearTimeout(hide);
  }, [capsule]);

  const silence = useCallback(() => {
    try { sessionStorage.setItem(SILENT_KEY, '1'); } catch { /* idem */ }
    setCapsule(false);
  }, []);

  const openPanel = useCallback(() => {
    setCapsule(false);
    setOpen(true);
  }, []);

  if (!onSurface) return null;

  return (
    <>
      {/* ── La capsule ───────────────────────────────────────────────────────
          Elle est posée au-dessus de la bulle, pas accrochée à elle : une
          flèche qui pointe la bulle aurait demandé un pseudo-élément et un
          angle à refaire à chaque changement de taille. La proximité (8 px)
          suffit à dire qu'elles vont ensemble — c'est la règle de proximité,
          et elle est plus solide qu'un ergot. */}
      {capsule && (
        <div className="pp-pilot-capsule pp-enter fixed z-40 w-[230px]">
          <div className="rounded-surface bg-primary p-3 shadow-pop">
            <div className="flex items-start gap-2">
              {/* La phrase EST le bouton. Une capsule qui dit « je peux vous
                  aider » et ne réagit pas au doigt qui appuie dessus enseigne
                  que ce produit ne répond pas — et on n'appuie plus. La bulle
                  reste le second chemin, juste en dessous. */}
              <button
                type="button"
                onClick={openPanel}
                // `min-h-touch` même si la phrase tient sur une ligne : c'est la
                // cible principale de la capsule, elle ne peut pas descendre
                // sous 44 parce qu'un écran a une capsule plus courte que les
                // autres.
                className="pressable -m-1 flex min-h-touch flex-1 items-center rounded-control p-1 text-left text-body leading-5 text-white/90 transition hover:text-white"
              >
                {here.capsule}
              </button>
              <button
                type="button"
                onClick={() => setCapsule(false)}
                aria-label={t({ fr: 'Fermer', ht: 'Fèmen' })}
                className="pressable -mr-2 -mt-2 flex h-touch w-touch flex-shrink-0 items-center justify-center rounded-control text-white/40 transition hover:text-white/80"
              >
                {/* 16 px de dessin dans 44 px de zone : le §8 ne descend pas
                    sous 16, et la croix héritée de l'ancien guide en faisait
                    12. */}
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>

            {/* La rangée fait 44 de haut et les deux liens la remplissent :
                écrits en 12, ils n'offraient que 16 px au pouce, soit moins de
                la moitié du plancher du §8. On agrandit la zone, jamais le
                dessin — le texte reste en 12. */}
            <div className="-mb-1 mt-1 flex min-h-touch items-center justify-between gap-2">
              {here.next ? (
                <Link
                  href={here.next.href}
                  onClick={() => setCapsule(false)}
                  className="flex h-touch items-center text-note font-semibold text-accent underline underline-offset-2"
                >
                  {here.next.label}
                </Link>
              ) : <span />}

              <button
                type="button"
                onClick={silence}
                className="flex h-touch items-center text-note text-white/40 transition hover:text-white/70"
              >
                {t({ fr: 'Ne plus montrer', ht: 'Pa montre ankò' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── La bulle ─────────────────────────────────────────────────────────
          `group` sert l'infobulle du survol. Le point émeraude est le témoin
          d'antenne : il dit « ça pense » sans clignoter, parce qu'un point qui
          clignote en permanence dans un coin d'écran finit par se faire
          détester. */}
      <div className="pp-pilot-launcher group fixed z-40">
        {/* L'infobulle, grand écran seulement : elle explique l'icône à qui ne
            l'a jamais cliquée (§1 de la liste UI — un signifiant, pas une
            devinette). Le pouce n'a pas de survol, donc rien à afficher. */}
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute right-full top-1/2 mr-2 hidden -translate-y-1/2 whitespace-nowrap',
            'rounded-control bg-primary px-3 py-2 text-note text-white opacity-0 transition-opacity',
            // Rien à expliquer quand le panneau est ouvert : le pointeur reste
            // sur la bulle après le clic, et l'infobulle flottait à côté de la
            // fenêtre qu'elle venait d'annoncer.
            !open && 'group-hover:opacity-100',
            'lg:block',
          )}
        >
          {t({ fr: 'Pilot AI — votre copilote', ht: 'Pilot AI — kopilòt ou' })}
        </span>

        <button
          type="button"
          onClick={openPanel}
          aria-expanded={open}
          aria-label={t({ fr: 'Ouvrir Pilot AI, votre copilote', ht: 'Louvri Pilot AI, kopilòt ou' })}
          className={cn(
            'pressable relative flex h-14 w-14 items-center justify-center rounded-pill lg:h-16 lg:w-16',
            'bg-primary text-white shadow-pop transition-transform duration-move ease-pp',
            'hover:scale-[1.04] focus-visible:scale-[1.04]',
            // §6 : en sombre, l'ombre ne porte pas sur un fond sombre — le
            // liseré prend son rôle, et elle s'efface pour ne pas doubler.
            'dark:shadow-none dark:ring-1 dark:ring-white/15',
          )}
        >
          <Bot className="h-6 w-6 lg:h-7 lg:w-7" strokeWidth={1.8} aria-hidden />
          <span className="absolute right-3 top-3 h-2 w-2 rounded-pill bg-accent lg:right-4 lg:top-4" aria-hidden />
        </button>
      </div>

      <PilotPanel open={open} onClose={() => setOpen(false)} route={here} />
    </>
  );
}
