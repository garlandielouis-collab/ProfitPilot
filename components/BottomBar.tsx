'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La barre du bas — cinq cibles, l'action la plus fréquente au centre (§5.1)
//
// Le marchand enregistre une vente vingt fois par jour et consulte un rapport
// une fois par semaine. La vente est donc au centre, à un pouce du bord, et
// atteignable depuis n'importe quel écran ; le rapport vit dans « Plus ».
//
// « + Vente » n'est pas une destination mais une ACTION : elle ouvre une
// feuille par-dessus l'écran en cours (§5.7), ce qui évite de perdre le fil de
// ce qu'on était en train de faire.
//
// Chaque cible fait 44 px minimum (§5.9). Chaque icône porte son libellé (§3.5).
//
// ── Moment 6 (§7) ────────────────────────────────────────────────────────────
// « Barre de navigation qui s'efface en saisie et revient ensuite. »
// Sur un téléphone, le clavier prend la moitié de l'écran. Une barre de
// navigation qui reste là mange le peu de place qu'il reste au champ que le
// marchand est en train de remplir — et lui propose de partir ailleurs au
// moment précis où il essaie de finir quelque chose. Elle s'écarte, et revient.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { BOTTOM_BAR, MORE_SECTIONS, type Entry } from './nav';
import { useLanguage } from './LanguageWrapper';
import { cn } from '../lib/utils';
import { clearAttention, hasAttention, subscribeAttention } from '../lib/pendingAttention';

/** Les champs où l'on tape. Une case à cocher ou un bouton n'ouvre pas de
 *  clavier : la barre n'a aucune raison de s'écarter pour eux. */
const TYPED_INPUTS = new Set([
  'text', 'search', 'email', 'tel', 'url', 'password', 'number', 'date', 'datetime-local', 'time',
]);

function isTypingTarget(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  if (node instanceof HTMLTextAreaElement) return true;
  if (node instanceof HTMLInputElement) return TYPED_INPUTS.has(node.type);
  return false;
}

/** `true` tant qu'un champ de saisie a le focus. Le petit délai à la sortie
 *  évite que la barre clignote quand on passe d'un champ au suivant. */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    let timer: number | undefined;

    function onFocusIn(e: FocusEvent) {
      window.clearTimeout(timer);
      if (isTypingTarget(e.target)) setTyping(true);
    }
    function onFocusOut() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTyping(false), 120);
    }

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return typing;
}

/** Les pages atteintes depuis « Plus » gardent « Plus » allumé : l'utilisateur
 *  voit toujours d'où il vient. */
const MORE_HREFS = new Set(MORE_SECTIONS.flatMap((s) => s.entries.map((e) => e.href)));

function isActive(entry: Entry, pathname: string | null): boolean {
  if (!pathname) return false;
  if (entry.href === '/plus') return pathname === '/plus' || MORE_HREFS.has(pathname);
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

/** La pastille de l'onglet « Créances » (§3.7) : elle s'allume quand une vente
 *  à crédit vient d'être créée depuis un autre écran, et s'éteint dès que le
 *  marchand ouvre l'écran. Une pastille qui ne s'éteint jamais devient un décor. */
function useReceivablesDot(pathname: string | null): boolean {
  const [dot, setDot] = useState(false);

  useEffect(() => {
    const sync = () => setDot(hasAttention('receivables'));
    sync();
    return subscribeAttention(sync);
  }, []);

  useEffect(() => {
    if (pathname === '/creances' || pathname?.startsWith('/creances/')) clearAttention('receivables');
  }, [pathname]);

  return dot;
}

export function BottomBar({ onNewSale }: { onNewSale: () => void }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const typing = useTyping();
  const receivablesDot = useReceivablesDot(pathname);

  const [home, sales, receivables, more] = BOTTOM_BAR;

  return (
    <nav
      aria-label={t({ fr: 'Navigation principale', ht: 'Navigasyon prensipal' })}
      aria-hidden={typing || undefined}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 lg:hidden',
        'border-t border-border bg-white/95 backdrop-blur',
        'dark:border-dark-border dark:bg-dark-surface/95',
        // Elle descend, elle ne disparaît pas : le mouvement dit où elle est
        // partie, et donc qu'elle va revenir.
        'transition-transform duration-move ease-pp',
        typing && 'pointer-events-none translate-y-full',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        <Tab entry={home}        active={isActive(home, pathname)} />
        <Tab entry={sales}       active={isActive(sales, pathname)} />

        {/* L'action centrale — le seul élément en émeraude de la barre.
            Les 10 % de la palette tombent exactement là où le marchand va. */}
        <button
          type="button"
          onClick={onNewSale}
          className="pressable flex w-touch flex-col items-center justify-center pt-2"
          aria-label={t({ fr: 'Enregistrer une vente', ht: 'Anrejistre yon vant' })}
        >
          <span className="flex h-13 w-13 items-center justify-center rounded-pill bg-accent text-white shadow-card">
            <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="mt-1 text-note font-bold text-primary dark:text-dark-text">
            {t({ fr: 'Vente', ht: 'Vant' })}
          </span>
        </button>

        <Tab entry={receivables} active={isActive(receivables, pathname)} dot={receivablesDot} />
        <Tab entry={more}        active={isActive(more, pathname)} />
      </div>
    </nav>
  );
}

function Tab({ entry, active, dot = false }: { entry: Entry; active: boolean; dot?: boolean }) {
  const { t } = useLanguage();
  const Icon = entry.icon;

  return (
    <Link
      href={entry.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        // 44 px de large, 72 px de haut : la cible dépasse largement le dessin.
        'pressable flex min-h-nav w-touch flex-col items-center justify-center gap-1',
        active ? 'text-primary dark:text-accent' : 'text-muted dark:text-dark-muted',
      )}
    >
      {/* La sélection se marque par le contraste et la graisse, pas par une
          pastille de couleur de plus (§4.5). */}
      <span className="relative">
        <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
        {/* Un point, pas un compteur : le marchand n'a pas besoin de savoir
            combien avant d'ouvrir — il a besoin de savoir QU'IL doit ouvrir.
            Le rouge système ne convient pas : rien n'est en retard, quelque
            chose est simplement nouveau (§4.2). */}
        {dot && (
          <span
            className="absolute -right-1 -top-0.5 h-2 w-2 rounded-pill bg-accent ring-2 ring-white dark:ring-dark-surface"
            aria-hidden
          />
        )}
      </span>
      <span className={cn('text-note leading-none', active && 'font-bold')}>
        {t(entry.label)}
        {/* La pastille est un signal visuel ; sans ce mot, un lecteur d'écran
            annoncerait « Créances » exactement comme s'il n'y avait rien. */}
        {dot && <span className="sr-only"> — {t({ fr: 'du nouveau', ht: 'gen nouvo' })}</span>}
      </span>
    </Link>
  );
}
