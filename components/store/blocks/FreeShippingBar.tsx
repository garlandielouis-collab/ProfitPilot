'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le seuil de livraison offerte
//
// « Encore 350 HTG pour la livraison offerte. » C'est la seule incitation de
// la vitrine qui pousse à ajouter un article, et elle est honnête : le seuil
// est celui que le marchand a saisi, le montant restant est calculé sur le
// panier réel, et la barre disparaît une fois le seuil franchi.
//
// Ce n'est pas de la rareté fabriquée — le §29 l'interdit, et à raison. C'est
// un objectif réel, affiché à l'endroit où il peut être atteint. La différence
// tient en une phrase : rien ici n'est faux si le visiteur vérifie.
//
// La section entière ne s'affiche pas quand le marchand n'a pas configuré de
// seuil. Une barre de progression vers une récompense inexistante serait
// exactement le dark pattern que la règle écarte.
// ─────────────────────────────────────────────────────────────────────────────

import { Truck, Check } from 'lucide-react';
import { storeMoney } from '../format';
import type { ThemeConfig } from '../../../lib/storeTheme';

export function FreeShippingBar({
  theme, total, currency, className,
}: {
  theme:    ThemeConfig;
  total:    number;
  currency: string;
  className?: string;
}) {
  const { enabled, threshold } = theme.freeShipping;
  if (!enabled || threshold <= 0) return null;

  const reached   = total >= threshold;
  const remaining = Math.max(0, threshold - total);
  const progress  = Math.min(100, threshold === 0 ? 100 : (total / threshold) * 100);

  return (
    <div
      className={`p-3.5 ${className ?? ''}`}
      style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-card)' }}
    >
      <p className="flex items-center gap-2 text-[13px] text-[var(--st-ink-2)]">
        {reached ? (
          <>
            <Check className="h-4 w-4 flex-shrink-0" strokeWidth={2.2} style={{ color: 'var(--st-accent)' }} aria-hidden />
            <span className="font-semibold text-[var(--st-ink)]">Livraison offerte</span>
          </>
        ) : (
          <>
            <Truck className="h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.7} aria-hidden />
            <span>
              Encore{' '}
              <strong className="font-semibold tabular-nums text-[var(--st-ink)]">
                {storeMoney(remaining, currency)}
              </strong>{' '}
              pour la livraison offerte
            </span>
          </>
        )}
      </p>

      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--st-ink) 12%, transparent)' }}
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progression vers la livraison offerte"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${progress}%`, background: 'var(--st-accent)' }}
        />
      </div>
    </div>
  );
}
