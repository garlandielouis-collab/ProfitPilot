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
//   le seuil offert     du réglage `freeShipping` du thème
//   le support          du téléphone de contact de la boutique
//   les retours, la garantie, le reste  des badges que le marchand a écrits
//
// Rien n'apparaît par défaut. Une boutique qui n'a rien renseigné n'affiche pas
// ce bloc — c'est mieux qu'un « Retours sous 30 jours » que le marchand
// découvrirait le jour où un client le réclame.
// ─────────────────────────────────────────────────────────────────────────────

import { Truck, Shield, RefreshCw, Phone, CreditCard, Clock, ChevronRight } from 'lucide-react';
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

type Line = { Icon: typeof Truck; label: string; note?: string };

export function ProductAssurance({
  theme, shippingModes, contactPhone, currency, railed = false,
}: {
  theme:          ThemeConfig;
  shippingModes:  ShippingMode[];
  contactPhone:   string | null;
  currency:       string;
  /**
   * Vrai quand la fiche porte le rail de réassurance (`TrustRail`).
   *
   * Les tuiles passent alors au rail au-dessus de `lg` et restent ici en
   * dessous, où une troisième colonne n'existe pas. La ligne de contact, elle,
   * ne bouge pas : c'est un lien qu'on appuie, pas un engagement qu'on lit, et
   * sa place est sous le bouton à toutes les largeurs.
   */
  railed?: boolean;
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

  // Le paiement ne figure PLUS ici : `PaymentMarks`, juste au-dessus, le dit en
  // marques reconnaissables plutôt qu'en énumération. Les deux ensemble
  // répétaient la même phrase à dix pixels d'intervalle.
  //
  // La liste venait d'ailleurs d'une table locale qui contenait « Carte
  // bancaire » — un moyen qu'aucune passerelle n'encaisse. La fiche promettait
  // donc un paiement que la caisse refusait à l'étape suivante (§10).

  // Les engagements écrits par le marchand : retours, garantie, ce qu'il veut.
  // Ils viennent après la livraison parce qu'ils sont libres, donc les moins
  // prévisibles.
  //
  // Le badge « téléphone » (« On vous répond — WhatsApp du lundi au samedi »)
  // n'est pas une tuile de plus : il dit la même chose que la ligne de contact
  // du bas, et la liste répétait « Une question ? » puis « On vous répond » à
  // deux lignes d'écart. Il est fondu dans cette ligne quand elle existe.
  const phone = contactPhone?.trim() || null;
  let supportBadge: { label: string; note?: string } | null = null;

  if (theme.trust.enabled) {
    for (const badge of theme.trust.badges) {
      if (!badge.label.trim()) continue;
      if (phone && badge.icon === 'phone' && !supportBadge) {
        supportBadge = { label: badge.label, note: badge.note || undefined };
        continue;
      }
      lines.push({
        Icon:  BADGE_ICONS[badge.icon] ?? Shield,
        label: badge.label,
        note:  badge.note || undefined,
      });
    }
  }

  if (lines.length === 0 && !phone) return null;

  const tiles = lines.slice(0, 6);

  return (
    <div className="mt-7 border-t pt-6" style={{ borderColor: 'var(--st-border)' }}>
      {tiles.length > 0 && (
        <ul
          className={`grid grid-cols-2 gap-x-4 gap-y-5${railed ? ' lg:hidden' : ''}`}
          aria-label="Nos engagements"
        >
          {tiles.map(({ Icon, label, note }, i) => (
            <li key={`${label}-${i}`} className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
                style={{ background: 'var(--st-surface-2)', borderRadius: 'var(--st-radius-btn)' }}
                aria-hidden
              >
                <Icon className="h-[18px] w-[18px] text-[var(--st-ink-2)]" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[13px] font-semibold leading-snug text-[var(--st-ink)]">{label}</p>
                {note && <p className="mt-0.5 text-[12px] leading-snug text-[var(--st-ink-3)]">{note}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {phone && (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, '')}`}
          className={`group flex min-h-[56px] items-center gap-3 border px-4 py-3 transition hover:bg-[var(--st-surface-2)] ${tiles.length > 0 ? (railed ? 'mt-6 lg:mt-0' : 'mt-6') : ''}`}
          style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-card)' }}
        >
          <Phone className="h-[18px] w-[18px] flex-shrink-0 text-[var(--st-ink-2)]" strokeWidth={1.7} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-[var(--st-ink)]">
              Une question ? {supportBadge?.label ?? 'Appelez-nous'}
            </span>
            <span className="block truncate text-[12px] text-[var(--st-ink-3)]">
              <span className="tabular-nums">{prettyPhone(phone)}</span>
              {supportBadge?.note && <> · {supportBadge.note}</>}
            </span>
          </span>
          <ChevronRight
            className="h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)] transition group-hover:translate-x-0.5"
            strokeWidth={2}
            aria-hidden
          />
        </a>
      )}
    </div>
  );
}

/**
 * « +50935045946 » → « +509 3504 5946 ». Un numéro haïtien se lit et se recopie
 * par blocs de quatre ; tout autre format est rendu tel que le marchand l'a
 * saisi, plutôt que découpé au hasard.
 */
function prettyPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('509')) {
    return `+509 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return raw.trim();
}
