// ─────────────────────────────────────────────────────────────────────────────
// Les volets d'information de la fiche produit (§16)
//
// Sous le bouton d'achat, `ProductAssurance` donne les trois réponses courtes :
// « livraison à partir de 250 HTG », « paiement : MonCash · NatCash », « une
// question ? ». Elles suffisent à rassurer, pas à décider.
//
// Ce qui manquait, et que le marchand a pourtant DÉJÀ écrit :
//
//   le tarif de CHAQUE zone       — « combien pour la province ? » est la
//                                   question qui fait fermer la page, et le
//                                   « à partir de » n'y répond pas
//   la politique de retour        — écrite dans le thème, visible seulement
//                                   sur la page d'accueil jusqu'ici
//   la note de paiement           — les conditions que le marchand a posées
//
// Trois volets repliés : la page ne s'allonge pas, et la réponse est à un
// geste. Des `<details>` natifs — ils s'ouvrent sans JavaScript, le clavier et
// le lecteur d'écran les connaissent, et ils ne coûtent pas un octet de
// bundle.
//
// La règle du produit s'applique ici comme partout : un volet sans contenu
// n'existe pas, et rien n'est écrit à la place du marchand. Une fiche dont la
// boutique n'a ni zone de livraison ni politique de retour n'affiche aucun
// volet — plutôt qu'un « Retours sous 30 jours » qu'il découvrirait le jour où
// un client le lui réclame.
// ─────────────────────────────────────────────────────────────────────────────

import { ChevronDown, Truck, RefreshCw, CreditCard } from 'lucide-react';
import { storeMoney } from '../format';
import type { ThemeConfig } from '../../../lib/storeTheme';
import type { ShippingMode } from '../../../app/actions/store-public';

const PAYMENT_LABELS: Record<string, string> = {
  cash:    'Paiement à la livraison',
  moncash: 'MonCash',
  natcash: 'NatCash',
  card:    'Carte bancaire',
  transfer: 'Virement bancaire',
};

type Panel = {
  id:    string;
  Icon:  typeof Truck;
  title: string;
  body:  React.ReactNode;
};

export function ProductPanels({
  theme, shippingModes, paymentMethods, currency,
}: {
  theme:          ThemeConfig;
  shippingModes:  ShippingMode[];
  paymentMethods: string[];
  currency:       string;
}) {
  const panels: Panel[] = [];

  // ── Livraison : toutes les zones, avec leur prix et leur délai ───────────
  const modes = shippingModes.filter((m) => m.label?.trim());
  if (modes.length > 0 || theme.shipping.note.trim()) {
    panels.push({
      id:    'livraison',
      Icon:  Truck,
      title: 'Livraison',
      body: (
        <>
          {modes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {modes.map((m) => (
                <li key={m.id || m.label} className="flex items-baseline justify-between gap-4">
                  <span className="text-[14px] text-[var(--st-ink)]">
                    {m.label}
                    {m.days?.trim() && (
                      <span className="text-[13px] text-[var(--st-ink-3)]"> · {m.days}</span>
                    )}
                  </span>
                  <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-[var(--st-ink)]">
                    {m.price === 0 ? 'Offerte' : storeMoney(m.price, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {theme.freeShipping.enabled && theme.freeShipping.threshold > 0 && (
            <p className="mt-3 text-[13px] font-medium text-[var(--st-ink-2)]">
              Livraison offerte à partir de {storeMoney(theme.freeShipping.threshold, currency)}.
            </p>
          )}
          {theme.shipping.note.trim() && (
            <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-[var(--st-ink-2)]">
              {theme.shipping.note}
            </p>
          )}
        </>
      ),
    });
  }

  // ── Retours ──────────────────────────────────────────────────────────────
  if (theme.shipping.returns.trim()) {
    panels.push({
      id:    'retours',
      Icon:  RefreshCw,
      title: 'Retours & échanges',
      body: (
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-[var(--st-ink-2)]">
          {theme.shipping.returns}
        </p>
      ),
    });
  }

  // ── Paiement ─────────────────────────────────────────────────────────────
  if (paymentMethods.length > 0 || theme.payments.note.trim()) {
    panels.push({
      id:    'paiement',
      Icon:  CreditCard,
      title: 'Paiement',
      body: (
        <>
          {paymentMethods.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {paymentMethods.map((m) => (
                <li
                  key={m}
                  className="border px-2.5 py-1 text-[13px] font-medium text-[var(--st-ink-2)]"
                  style={{ borderColor: 'var(--st-border)', borderRadius: '6px' }}
                >
                  {PAYMENT_LABELS[m] ?? m}
                </li>
              ))}
            </ul>
          )}
          {theme.payments.note.trim() && (
            <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-[var(--st-ink-2)]">
              {theme.payments.note}
            </p>
          )}
        </>
      ),
    });
  }

  if (panels.length === 0) return null;

  return (
    <div className="mt-7 border-t" style={{ borderColor: 'var(--st-border)' }}>
      {panels.map(({ id, Icon, title, body }) => (
        <details key={id} className="group border-b" style={{ borderColor: 'var(--st-border)' }}>
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 text-[15px] font-semibold text-[var(--st-ink)]">
            <Icon className="h-[18px] w-[18px] flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.7} aria-hidden />
            <span className="flex-1">{title}</span>
            <ChevronDown
              className="h-4 w-4 flex-shrink-0 text-[var(--st-ink-3)] transition-transform group-open:rotate-180"
              strokeWidth={1.8}
              aria-hidden
            />
          </summary>
          <div className="pb-5">{body}</div>
        </details>
      ))}
    </div>
  );
}
