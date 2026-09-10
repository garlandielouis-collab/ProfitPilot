// ─────────────────────────────────────────────────────────────────────────────
// La réassurance d'une fiche produit (§17)
//
// Livraison, paiement, retours, garantie, support. Ce sont les cinq questions
// qui restent une fois le produit choisi, et y répondre à cet endroit précis —
// juste sous le bouton d'achat — évite le message WhatsApp qui, la moitié du
// temps, n'est jamais envoyé.
//
// ── La règle, et elle n'a pas d'exception ──────────────────────────────────
//
// « Ne jamais inventer de politique. Afficher uniquement les informations
//   configurées par le marchand. »
//
// Chaque ligne d'ici vient donc d'une donnée réelle :
//
//   la livraison        des modes de livraison saisis (`shipping_modes`)
//   le paiement         des moyens réellement activés (`payment_methods`)
//   le seuil offert     du réglage `freeShipping` du thème
//   le support          du téléphone de contact de la boutique
//   les retours, la garantie, le reste  des badges que le marchand a écrits
//
// Rien n'apparaît par défaut. Une boutique qui n'a rien renseigné n'affiche pas
// ce bloc — c'est mieux qu'un « Retours sous 30 jours » que le marchand
// découvrirait le jour où un client le réclame.
// ─────────────────────────────────────────────────────────────────────────────

import { Truck, Shield, RefreshCw, Phone, CreditCard, Clock, Banknote } from 'lucide-react';
import { storeMoney } from '../format';
import type { ThemeConfig } from '../../../lib/storeTheme';
import type { ShippingMode } from '../../../app/actions/store-public';

const BADGE_ICONS = {
  truck:   Truck,
  shield:  Shield,
  refresh: RefreshCw,
  phone:   Phone,
  card:    CreditCard,
  clock:   Clock,
} as const;

const PAYMENT_LABELS: Record<string, string> = {
  cash:    'Paiement à la livraison',
  moncash: 'MonCash',
  natcash: 'NatCash',
  card:    'Carte bancaire',
};

type Line = { Icon: typeof Truck; label: string; note?: string };

export function ProductAssurance({
  theme, shippingModes, paymentMethods, contactPhone, currency,
}: {
  theme:          ThemeConfig;
  shippingModes:  ShippingMode[];
  paymentMethods: string[];
  contactPhone:   string | null;
  currency:       string;
}) {
  const lines: Line[] = [];

  // La livraison : le mode le moins cher fait la promesse, les autres restent
  // au paiement. Annoncer « à partir de » est exact ; annoncer un prix unique
  // quand il y en a trois ne l'est pas.
  if (shippingModes.length > 0) {
    const cheapest = [...shippingModes].sort((a, b) => a.price - b.price)[0];
    const free = theme.freeShipping.enabled && theme.freeShipping.threshold > 0;
    lines.push({
      Icon:  Truck,
      label: cheapest.price === 0
        ? 'Livraison offerte'
        : `Livraison à partir de ${storeMoney(cheapest.price, currency)}`,
      note: free
        ? `Offerte dès ${storeMoney(theme.freeShipping.threshold, currency)}`
        : (cheapest.days || undefined),
    });
  }

  if (paymentMethods.length > 0) {
    lines.push({
      Icon:  paymentMethods.includes('cash') ? Banknote : CreditCard,
      label: 'Paiement',
      note:  paymentMethods.map((m) => PAYMENT_LABELS[m] ?? m).join(' · '),
    });
  }

  if (contactPhone) {
    lines.push({ Icon: Phone, label: 'Une question ?', note: contactPhone });
  }

  // Les engagements écrits par le marchand : retours, garantie, ce qu'il veut.
  // Ils viennent en dernier parce qu'ils sont libres, donc les moins
  // prévisibles — et parce que les trois précédents répondent aux questions
  // qu'on se pose en premier.
  if (theme.trust.enabled) {
    for (const badge of theme.trust.badges) {
      if (!badge.label.trim()) continue;
      lines.push({
        Icon:  BADGE_ICONS[badge.icon] ?? Shield,
        label: badge.label,
        note:  badge.note || undefined,
      });
    }
  }

  if (lines.length === 0) return null;

  return (
    <ul
      className="mt-7 flex flex-col gap-3 border-t pt-6"
      style={{ borderColor: 'var(--st-border)' }}
      aria-label="Nos engagements"
    >
      {lines.slice(0, 6).map(({ Icon, label, note }, i) => (
        <li key={`${label}-${i}`} className="flex items-start gap-3">
          <Icon
            className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-[var(--st-ink-3)]"
            strokeWidth={1.7}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[var(--st-ink)]">{label}</p>
            {note && <p className="text-[13px] text-[var(--st-ink-3)]">{note}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
