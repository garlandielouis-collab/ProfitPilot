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
  Truck, RotateCcw, Banknote, CreditCard, Smartphone, Ruler, Leaf,
} from 'lucide-react';
import { Section, SectionHeader } from './Shell';
import { storeMoney } from '../format';
import { sectionTitle } from '../../../lib/storeSections';
import { offeredPayments, PAYMENT_LABEL, PAYMENT_NOTE } from '../../../lib/storePayments';
import type { SectionProps } from './types';

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
    <Section design={design} tone="surface-2" label={title}>
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
 * Les libellés viennent de `lib/storePayments.ts`, donc de la même table que la
 * caisse : un visiteur qui a lu « Paiement à la livraison » ici retrouve ce
 * mot-là au moment de payer, sans se demander si c'est la même chose.
 *
 * La table vivait ici aussi, et elle offrait « Carte Visa », « Virement » et
 * « Chèque » : trois tuiles pour des moyens qu'aucune passerelle n'encaisse.
 */
function paymentIcon(method: string) {
  if (method === 'cash')     return Banknote;
  if (method === 'moncash' || method === 'natcash') return Smartphone;
  return CreditCard;
}

export function PaymentsSection({ store, section, design }: SectionProps) {
  const p = store.theme.payments;
  if (!p.enabled) return null;

  // Un mode inconnu — une valeur ajoutée en base plus tard, ou une valeur morte
  // laissée par un ancien réglage — n'est pas affiché : ni sous son identifiant
  // technique, qui ne veut rien dire pour un acheteur, ni sous un joli libellé
  // pour un paiement que la caisse refusera.
  const methods = offeredPayments(store.paymentMethods);
  if (methods.length === 0 && !p.note.trim()) return null;

  const title = sectionTitle(section, store.templateId);

  return (
    <Section design={design} label={title}>
      <SectionHeader design={design} title={title} eyebrow="Paiement" description={p.note.trim() || undefined} />

      {methods.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {methods.map((method) => {
            const Icon = paymentIcon(method);
            const label = PAYMENT_LABEL[method];
            const note  = PAYMENT_NOTE[method];
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
//
// Elle a quitté ce fichier : un bandeau, une fiche de contact, un plan et des
// horaires ne tiennent plus dans les quarante lignes d'une section qui répond.
// Voir `ContactSection.tsx`, qui la réexporte pour le registre.

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
    <Section design={design} label={title}>
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
