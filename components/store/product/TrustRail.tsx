'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le rail de réassurance (§17)
//
// Une troisième colonne, à droite de l'achat, où vivent les engagements du
// marchand : livraison, paiement, échange, garantie, joignabilité.
//
// ── Pourquoi une colonne, et pas la rangée d'avant ─────────────────────────
//
// La rangée vivait SOUS le bouton, c'est-à-dire sous la ligne de flottaison
// une fois la colonne d'achat déroulée. Elle répondait aux cinq questions qui
// bloquent l'achat à l'endroit exact où l'acheteur ne les lisait plus.
//
// Mesuré le 19/09/2026 : la colonne de gauche se terminait 500 px avant celle
// de droite. La page avait la place d'une troisième colonne — elle la laissait
// vide. Le rail l'occupe, et la réassurance remonte à hauteur du prix.
//
// ── Rien n'est inventé ─────────────────────────────────────────────────────
//
// La règle de `ProductAssurance` tient ici sans exception : « Ne jamais
// inventer de politique. » Chaque ligne vient d'une donnée réelle —
//
//   la livraison   du mode le moins cher réellement saisi (`shipping_modes`)
//   le seuil       du réglage `freeShipping` du thème
//   les autres     des engagements que le marchand a écrits (`theme.trust`)
//
// Ces engagements ont un DÉFAUT PAR GABARIT, posé par `parseThemeConfig` :
// « Suivi sanitaire · Vaccination à jour » chez l'éleveur, « Préparé du jour ·
// Rien de la veille » chez le traiteur. C'est du texte écrit dans le code, et
// c'est assumé — mais il s'affiche dans l'éditeur, où le marchand le corrige
// en deux clics, et il ne promet rien qu'un commerce de ce métier ne tienne.
//
// Une boutique dont le marchand a tout effacé n'a pas de rail : la fiche
// repasse en deux colonnes plutôt que d'afficher une colonne vide.
// ─────────────────────────────────────────────────────────────────────────────

import { Truck, Shield, RefreshCw, Phone, CreditCard, Clock } from 'lucide-react';
import { storeMoney } from '../format';
import { MerchantHint } from './MerchantHint';
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

type Line = { Icon: typeof Truck; label: string; note?: string };

/**
 * Les lignes du rail, dans l'ordre où elles répondent.
 *
 * Exportée parce que la fiche doit SAVOIR, avant de dessiner sa grille, si le
 * rail aura de la matière : une colonne vide décalerait la colonne d'achat
 * sans rien apporter.
 */
export function trustLines(theme: ThemeConfig, shippingModes: ShippingMode[], currency: string): Line[] {
  const lines: Line[] = [];

  const modes = shippingModes.filter((m) => m.label?.trim());
  if (modes.length > 0) {
    const cheapest = [...modes].sort((a, b) => a.price - b.price)[0];
    const free = theme.freeShipping.enabled && theme.freeShipping.threshold > 0;
    lines.push({
      Icon:  Truck,
      label: cheapest.price === 0 ? 'Livraison offerte' : cheapest.label,
      note:  free
        ? `Offerte dès ${storeMoney(theme.freeShipping.threshold, currency)}`
        : cheapest.price === 0
          ? (cheapest.days?.trim() || undefined)
          : `${storeMoney(cheapest.price, currency)}${cheapest.days?.trim() ? ` · ${cheapest.days}` : ''}`,
    });
  }

  if (theme.trust.enabled) {
    for (const badge of theme.trust.badges) {
      if (!badge.label.trim()) continue;
      lines.push({
        Icon:  BADGE_ICONS[badge.icon] ?? Shield,
        label: badge.label,
        note:  badge.note?.trim() || undefined,
      });
    }
  }

  // Cinq au plus. Au-delà, le rail devient plus haut que la colonne d'achat et
  // la page se lit de bas en haut.
  return lines.slice(0, 5);
}

export function TrustRail({ theme, shippingModes, currency }: {
  theme:         ThemeConfig;
  shippingModes: ShippingMode[];
  currency:      string;
}) {
  const lines = trustLines(theme, shippingModes, currency);

  if (lines.length === 0) {
    return (
      <MerchantHint title="Vos engagements" where="Éditeur → Contenu → Réassurance">
        <RailList lines={[
          { Icon: Truck,   label: 'Livraison rapide', note: 'Port-au-Prince et régions' },
          { Icon: Shield,  label: 'Paiement sécurisé' },
          { Icon: RefreshCw, label: 'Échange possible', note: 'Produit non conforme' },
        ]} />
      </MerchantHint>
    );
  }

  return (
    <aside className="hidden lg:block" aria-label="Nos engagements">
      {/* Collant : le rail répond aux questions de la colonne d'achat, il doit
          rester à côté d'elle pendant qu'on la déroule. `top-24` dégage
          l'en-tête collant de la vitrine. */}
      <div className="sticky top-24">
        <RailList lines={lines} />
      </div>
    </aside>
  );
}

function RailList({ lines }: { lines: Line[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {lines.map(({ Icon, label, note }, i) => (
        <li
          key={`${label}-${i}`}
          className="flex items-start gap-2.5 border px-3 py-3"
          style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
        >
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center"
            style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-btn)' }}
            aria-hidden
          >
            <Icon className="h-[15px] w-[15px] text-[var(--st-ink-2)]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-snug text-[var(--st-ink)]">{label}</p>
            {note && <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--st-ink-3)]">{note}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
