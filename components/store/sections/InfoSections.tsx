// ─────────────────────────────────────────────────────────────────────────────
// Les sections qui RÉPONDENT
//
// Les vingt-deux premières sections vendent : elles montrent, elles racontent,
// elles mettent en avant. Celles-ci font l'autre moitié du travail — elles
// lèvent les objections qui arrêtent la main au moment de commander :
//
//   « Combien coûte la livraison chez moi ? »  → Livraison & retours
//   « Est-ce que vous prenez MonCash ? »       → Comment payer
//   « Vous êtes ouverts à quelle heure ? »     → Nous joindre
//   « Je fais quelle taille ? »                → Guide des tailles
//   « Qu'est-ce qu'il y a dedans ? »           → Composition
//
// C'est ce qui séparait nos vitrines d'un vrai site marchand, et ce n'était pas
// une bannière de plus : un visiteur qui ne trouve pas ces réponses n'écrit pas
// pour les demander, il ferme la page. Le marchand ne voit jamais cette
// vente-là partir — c'est pour cela qu'elle ne se réclame pas.
//
// ── Deux d'entre elles ne se saisissent pas ────────────────────────────────
//
// « Livraison » et « Comment payer » lisent les modes RÉELS de la boutique,
// ceux que la caisse appliquera (`store_settings.shipping_modes` et
// `payment_methods`). Les faire retaper dans l'éditeur créerait deux vérités :
// le jour où le marchand change son tarif de livraison dans ses réglages, la
// page d'accueil continuerait d'annoncer l'ancien. Ici, elle ne peut pas.
//
// ── La règle du fichier, comme partout ─────────────────────────────────────
//
// Rien à dire → rien d'affiché. Aucune de ces sections n'invente un délai, un
// tarif, un horaire, une mesure ni un ingrédient : ce sont des engagements que
// le client viendra réclamer au marchand, pas à nous.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Truck, RotateCcw, Banknote, CreditCard, Smartphone, Clock, Phone,
  MessageCircle, Mail, MapPin, Ruler, Leaf,
} from 'lucide-react';
import { Section, SectionHeader } from './Shell';
import { storeMoney } from '../format';
import { sectionTitle } from '../../../lib/storeSections';
import type { SectionProps } from './types';
import type { StoreView } from '../types';

// ── Livraison & retours ─────────────────────────────────────────────────────

/**
 * Les modes de livraison, tels que la caisse les appliquera.
 *
 * Un mode à zéro s'affiche « Offerte » et non « 0 HTG » : c'est le même
 * chiffre, et ce n'est pas la même phrase. Un délai vide ne s'invente pas —
 * « 24 à 48 h » écrit à la place du marchand est une promesse qu'il n'a pas
 * faite.
 */
export function ShippingSection({ store, section, design }: SectionProps) {
  const s = store.theme.shipping;
  const modes = store.shippingModes.filter((m) => m.label?.trim());

  if (!s.enabled) return null;
  if (modes.length === 0 && !s.note.trim() && !s.returns.trim()) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} tone="surface-2" label={title} id="livraison">
      <SectionHeader design={design} title={title} eyebrow="Avant de commander" description={s.note.trim() || undefined} />

      {modes.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((mode) => (
            <li
              key={mode.id || mode.label}
              className="flex items-start gap-3 p-4"
              style={{
                background:   'var(--st-surface)',
                border:       '1px solid var(--st-border)',
                borderRadius: 'var(--st-radius-card)',
              }}
            >
              <Truck className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[var(--st-ink)]">{mode.label}</p>
                {mode.days?.trim() && (
                  <p className="mt-0.5 text-[13px] text-[var(--st-ink-2)]">{mode.days}</p>
                )}
                <p className="mt-1 text-[14px] font-semibold text-[var(--st-ink)]">
                  {mode.price > 0 ? storeMoney(mode.price, store.currency) : 'Offerte'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {s.returns.trim() && (
        <div className={`flex items-start gap-3 ${modes.length > 0 ? 'mt-6' : ''}`}>
          <RotateCcw className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />
          <p className="max-w-2xl whitespace-pre-line text-[14px] leading-relaxed text-[var(--st-ink-2)]">
            {s.returns}
          </p>
        </div>
      )}
    </Section>
  );
}

// ── Comment payer ───────────────────────────────────────────────────────────

/**
 * Les modes de paiement du checkout, annoncés dès la page d'accueil.
 *
 * Les libellés sont les mêmes qu'à la caisse (`CheckoutClient`) : un visiteur
 * qui a lu « Paiement à la livraison » ici doit retrouver ce mot-là au moment
 * de payer, sans se demander si c'est la même chose.
 */
const PAYMENT_LABELS: Record<string, { label: string; note: string }> = {
  cash:     { label: 'Paiement à la livraison', note: 'Vous payez en recevant' },
  moncash:  { label: 'MonCash',                 note: 'Paiement mobile Digicel' },
  natcash:  { label: 'NatCash',                 note: 'Paiement mobile Natcom' },
  visa:     { label: 'Carte Visa',              note: 'Crédit ou débit' },
  card:     { label: 'Carte bancaire',          note: 'Crédit ou débit' },
  transfer: { label: 'Virement',                note: 'Depuis votre banque' },
  check:    { label: 'Chèque',                  note: '' },
};

function paymentIcon(method: string) {
  if (method === 'cash')     return Banknote;
  if (method === 'moncash' || method === 'natcash') return Smartphone;
  return CreditCard;
}

export function PaymentsSection({ store, section, design }: SectionProps) {
  const p = store.theme.payments;
  if (!p.enabled) return null;

  // Un mode inconnu du libellé — une valeur ajoutée en base plus tard — n'est
  // pas affiché sous son identifiant technique : « bank_transfer » sur une
  // vitrine ne veut rien dire pour un acheteur.
  const methods = store.paymentMethods.filter((m) => PAYMENT_LABELS[m]);
  if (methods.length === 0 && !p.note.trim()) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} label={title} id="paiement">
      <SectionHeader design={design} title={title} eyebrow="Paiement" description={p.note.trim() || undefined} />

      {methods.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {methods.map((method) => {
            const Icon = paymentIcon(method);
            const { label, note } = PAYMENT_LABELS[method];
            return (
              <li
                key={method}
                className="flex items-center gap-3 p-4"
                style={{
                  border:       '1px solid var(--st-border)',
                  borderRadius: 'var(--st-radius-card)',
                }}
              >
                <Icon className="h-5 w-5 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[var(--st-ink)]">{label}</p>
                  {note && <p className="mt-0.5 text-[12px] text-[var(--st-ink-3)]">{note}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ── Nous joindre ────────────────────────────────────────────────────────────

/**
 * Les horaires et les moyens de contact.
 *
 * Trois des quatre lignes sont déjà en base — téléphone, WhatsApp, courriel :
 * les redemander dans l'éditeur, c'est se garantir deux numéros différents sur
 * la même page. Seuls les horaires se saisissent, parce qu'ils n'existent nulle
 * part ailleurs.
 */
function contactLinks(store: StoreView) {
  const links: Array<{ href: string; label: string; value: string; Icon: typeof Phone }> = [];

  if (store.whatsappPhone) {
    links.push({
      href:  `https://wa.me/${store.whatsappPhone.replace(/[^\d]/g, '')}`,
      label: 'WhatsApp',
      value: store.whatsappPhone,
      Icon:  MessageCircle,
    });
  }
  if (store.contactPhone) {
    links.push({
      href:  `tel:${store.contactPhone.replace(/\s/g, '')}`,
      label: 'Téléphone',
      value: store.contactPhone,
      Icon:  Phone,
    });
  }
  if (store.contactEmail) {
    links.push({ href: `mailto:${store.contactEmail}`, label: 'Courriel', value: store.contactEmail, Icon: Mail });
  }
  if (store.contactAddress) {
    links.push({
      href:  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.contactAddress)}`,
      label: 'Adresse',
      value: store.contactAddress,
      Icon:  MapPin,
    });
  }
  return links;
}

export function ContactSection({ store, section, design }: SectionProps) {
  const c = store.theme.contact;
  if (!c.enabled) return null;

  const hours = c.hours.filter((h) => h.days.trim());
  const links = contactLinks(store);
  if (hours.length === 0 && links.length === 0 && !c.body.trim()) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} tone="surface-2" label={title}>
      <SectionHeader design={design} title={title} eyebrow="Contact" description={c.body.trim() || undefined} />

      {/* `grid-cols-1` et non « pas de colonnes » : une grille sans
          `grid-template-columns` dimensionne sa colonne sur le CONTENU MINIMAL
          le plus large de ses enfants — ici une adresse insécable — et déborde
          la page à 320 pixels. La classe de Tailwind pose `minmax(0, 1fr)`,
          qui autorise la colonne à rétrécir. */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {hours.length > 0 && (
          <div className="min-w-0">
            <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]">
              <Clock className="h-4 w-4" strokeWidth={1.6} aria-hidden />
              Horaires
            </p>
            <ul className="flex flex-col">
              {hours.map((h, i) => (
                <li
                  key={`${h.days}-${i}`}
                  // `flex-wrap` + `min-w-0` : un jour écrit « Lundi —
                  // Vendredi » et une plage « 8 h 00 — 17 h 00 » font ensemble
                  // 308 pixels, et un élément flex ne descend pas sous son
                  // contenu par défaut. Sur un écran de 320, la ligne
                  // débordait donc la page entière — pas seulement le bloc.
                  className="flex flex-wrap items-baseline justify-between gap-x-4 border-b py-2 last:border-0"
                  style={{ borderColor: 'var(--st-border)' }}
                >
                  <span className="min-w-0 text-[14px] text-[var(--st-ink-2)]">{h.days}</span>
                  <span className="min-w-0 text-[14px] font-semibold text-[var(--st-ink)]">
                    {h.hours.trim() || 'Fermé'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {links.length > 0 && (
          <ul className="flex flex-col gap-2">
            {links.map(({ href, label, value, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="flex min-h-[48px] items-center gap-3 px-4 transition hover:bg-[var(--st-surface)]"
                  style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
                >
                  <Icon className="h-5 w-5 flex-shrink-0 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[12px] text-[var(--st-ink-3)]">{label}</span>
                    <span className="block truncate text-[14px] font-semibold text-[var(--st-ink)]">{value}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

// ── Guide des tailles ───────────────────────────────────────────────────────

/** Une ligne saisie « S, 86, 68, 92 » devient quatre cellules. */
function cells(line: string): string[] {
  return line.split(',').map((c) => c.trim());
}

export function SizeGuideSection({ store, section, design }: SectionProps) {
  const g = store.theme.sizeGuide;
  if (!g.enabled) return null;

  const head = g.columns.trim() ? cells(g.columns) : [];
  const rows = g.rows.map((r) => cells(r.cells)).filter((r) => r.some((c) => c));
  if (rows.length === 0) return null;

  const title = sectionTitle(section, store.templateId);
  const width = Math.max(head.length, ...rows.map((r) => r.length));

  return (
    <Section design={design} label={title} id="tailles">
      <SectionHeader design={design} title={title} eyebrow="Trouver sa taille" description={g.note.trim() || undefined} />

      {/* Un tableau de mesures dépasse la largeur d'un téléphone. Il défile
          dans son propre cadre plutôt que d'élargir la page entière. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[420px] border-collapse text-[14px]">
          {head.length > 0 && (
            <thead>
              <tr>
                {Array.from({ length: width }, (_, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="border-b px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-[var(--st-ink-3)]"
                    style={{ borderColor: 'var(--st-border)' }}
                  >
                    {head[i] ?? ''}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 ? 'var(--st-surface-2)' : undefined }}>
                {Array.from({ length: width }, (_, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 tabular-nums ${j === 0 ? 'font-semibold text-[var(--st-ink)]' : 'text-[var(--st-ink-2)]'}`}
                  >
                    {row[j] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex items-center gap-2 text-[12px] text-[var(--st-ink-3)]">
        <Ruler className="h-4 w-4" strokeWidth={1.6} aria-hidden />
        Mesures données par la boutique.
      </p>
    </Section>
  );
}

// ── Composition ─────────────────────────────────────────────────────────────

export function IngredientsSection({ store, section, design }: SectionProps) {
  const g = store.theme.ingredients;
  if (!g.enabled) return null;

  const items = g.items.filter((i) => i.name.trim());
  if (items.length === 0 && !g.body.trim()) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} tone="surface-2" label={title}>
      <SectionHeader design={design} title={title} eyebrow="Composition" description={g.body.trim() || undefined} />

      {items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <li
              key={`${item.name}-${i}`}
              className="p-4"
              style={{
                background:   'var(--st-surface)',
                border:       '1px solid var(--st-border)',
                borderRadius: 'var(--st-radius-card)',
              }}
            >
              <Leaf className="h-5 w-5 text-[var(--st-accent)]" strokeWidth={1.6} aria-hidden />
              <p className="mt-3 text-[15px] font-semibold text-[var(--st-ink)]">{item.name}</p>
              {item.role.trim() && (
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--st-ink-2)]">{item.role}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
