// ─────────────────────────────────────────────────────────────────────────────
// Les badges de réassurance
//
// Ils répondent aux trois questions qui bloquent un achat en ligne en Haïti :
// est-ce que je serai livré, est-ce que je peux payer comme d'habitude, est-ce
// que je peux joindre quelqu'un si ça se passe mal.
//
// Le marchand écrit les siens dans l'éditeur. Rien n'est inventé à sa place :
// afficher « Livraison gratuite » sur la vitrine d'un marchand qui livre à
// 250 HTG, c'est une promesse que le client viendra réclamer.
// ─────────────────────────────────────────────────────────────────────────────

import { Truck, Shield, RefreshCw, Phone, CreditCard, Clock } from 'lucide-react';
import type { ThemeConfig } from '../../../lib/storeTheme';

const ICONS = {
  truck:   Truck,
  shield:  Shield,
  refresh: RefreshCw,
  phone:   Phone,
  card:    CreditCard,
  clock:   Clock,
} as const;

export function TrustBadges({ trust }: { trust: ThemeConfig['trust'] }) {
  if (!trust.enabled || trust.badges.length === 0) return null;

  return (
    <section
      aria-label="Nos engagements"
      className="border-y py-8"
      style={{ borderColor: 'var(--st-border)', background: 'var(--st-surface-2)' }}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 sm:px-6 md:grid-cols-4">
        {trust.badges.map((badge, i) => {
          const Icon = ICONS[badge.icon] ?? Shield;
          return (
            <div key={`${badge.label}-${i}`} className="flex items-start gap-3">
              <Icon
                className="h-5 w-5 flex-shrink-0 text-[var(--st-ink-2)]"
                strokeWidth={1.6}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[var(--st-ink)]">{badge.label}</p>
                {badge.note && (
                  <p className="mt-0.5 text-[12px] text-[var(--st-ink-3)]">{badge.note}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
