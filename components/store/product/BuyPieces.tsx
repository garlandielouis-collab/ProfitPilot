'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Les pièces communes des colonnes d'achat
//
// Six gabarits achètent différemment, mais ils écrivent tous un prix, comptent
// tous une quantité et montrent tous une taille. Ces pièces-là sont ici, dites
// une seule fois : c'est ce qui permet à six colonnes d'avoir six mécaniques
// sans avoir six typographies.
//
// Ce que chacune respecte :
//
//   Rien d'inventé. Une pastille de couleur montre la couleur que le marchand
//   a SAISIE dans les attributs de sa fiche ; elle ne décide pas qu'un produit
//   existe en trois coloris.
//
//   Rien qui promette une bascule. ProfitPilot gère un produit par variante :
//   la taille d'une fiche est une caractéristique, pas un sélecteur. Les
//   maquettes montrent des pastilles ; les nôtres se lisent, elles ne changent
//   pas d'article — et celle du produit affiché est marquée.
// ─────────────────────────────────────────────────────────────────────────────

import { Minus, Plus, Star, Truck, Shield, RefreshCw, Phone, CreditCard, Clock } from 'lucide-react';
import { storeMoney } from '../format';
import type { ThemeConfig } from '../../../lib/storeTheme';
import type { StoreProduct, StoreView } from '../types';
import type { ShippingMode } from '../../../app/actions/store-public';

// ── L'en-tête : rayon, étiquette, nom, accroche ─────────────────────────────

export function ProductEyebrow({ product, discount }: { product: StoreProduct; discount: number | null }) {
  if (!product.category && !product.is_new && discount === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {product.category && (
        <p className="text-[12px] uppercase tracking-wide text-[var(--st-ink-3)]">{product.category}</p>
      )}
      {(discount !== null || product.is_new) && (
        <span
          className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold uppercase"
          style={{
            letterSpacing: '0.06em',
            borderRadius:  'var(--st-radius-btn)',
            background:    discount !== null ? 'var(--st-accent)' : 'var(--st-surface-2)',
            color:         discount !== null ? 'var(--st-accent-ink)' : 'var(--st-ink-2)',
            border:        discount !== null ? 'none' : '1px solid var(--st-border)',
          }}
        >
          {discount !== null ? `−${discount} %` : 'Nouveau'}
        </span>
      )}
    </div>
  );
}

export function ProductTitle({ name, upper }: { name: string; upper: boolean }) {
  return (
    <h1
      className="mt-1 text-[var(--st-ink)]"
      style={{
        fontFamily:    'var(--st-font-heading)',
        fontSize:      'var(--st-h2)',
        fontWeight:    upper ? 500 : 600,
        lineHeight:    1.15,
        letterSpacing: 'var(--st-tracking)',
        textTransform: upper ? 'uppercase' : undefined,
      }}
    >
      {name}
    </h1>
  );
}

export function RatingRow({ average, count }: { average: number; count: number }) {
  if (count === 0) return null;
  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="flex gap-0.5" aria-label={`${average} sur 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className="h-4 w-4"
            strokeWidth={1.5}
            style={{
              fill:  i < Math.round(average) ? 'var(--st-accent)' : 'transparent',
              color: i < Math.round(average) ? 'var(--st-accent)' : 'var(--st-ink-3)',
            }}
            aria-hidden
          />
        ))}
      </div>
      <a href="#avis" className="text-[13px] text-[var(--st-ink-2)] underline underline-offset-4">
        {count} avis
      </a>
    </div>
  );
}

/**
 * Le prix.
 *
 * `unit` porte ce que le prix couvre — « par tête » chez un éleveur, « la
 * séance » chez un prestataire. C'est le marchand qui le rend vrai : nous ne
 * l'écrivons que là où le gabarit vend à l'unité de son métier.
 */
export function PriceRow({
  price, compareAt, discount, currency, unit, className = 'mt-5',
}: {
  price: number; compareAt: number | null; discount: number | null;
  currency: string; unit?: string; className?: string;
}) {
  return (
    <p className={`${className} flex flex-wrap items-baseline gap-3`}>
      <span className="text-[32px] font-semibold tabular-nums text-[var(--st-ink)]">
        {storeMoney(price, currency)}
      </span>
      {compareAt !== null && (
        <>
          <span className="text-[17px] tabular-nums text-[var(--st-ink-3)] line-through">
            {storeMoney(compareAt, currency)}
          </span>
          {discount !== null && (
            <span
              className="rounded-[6px] px-2 py-0.5 text-[12px] font-semibold"
              style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)' }}
            >
              −{discount} %
            </span>
          )}
        </>
      )}
      {unit && (
        <span
          className="px-2 py-0.5 text-[12px] font-medium text-[var(--st-ink-2)]"
          style={{ border: '1px solid var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
        >
          {unit}
        </span>
      )}
    </p>
  );
}

export function StockLine({ product, show }: { product: StoreProduct; show: boolean }) {
  if (!show) return null;
  const soldOut = product.stock <= 0;
  const out = soldOut && !product.allow_backorders;
  return (
    <p
      className="mt-2 text-[13px] font-semibold"
      style={{ color: out ? '#B23A2F' : soldOut || product.stock <= 5 ? '#B45309' : '#0B7F54' }}
    >
      {out
        ? 'Épuisé'
        : soldOut
          ? 'Sur commande — délai à confirmer avec le marchand'
          : product.stock <= 5
            ? `Plus que ${product.stock} en stock`
            : 'En stock'}
    </p>
  );
}

// ── Les caractéristiques, en pastilles ──────────────────────────────────────

/**
 * Les couleurs les plus courantes d'un catalogue haïtien, et leur teinte.
 *
 * Elle ne sert qu'à DESSINER la pastille : le mot affiché reste celui que le
 * marchand a écrit. Une couleur inconnue n'est pas approximée — elle garde sa
 * pastille neutre et son nom, ce qui est encore la façon la plus honnête de
 * montrer « Bleu pétrole ».
 */
const COLORS: Record<string, string> = {
  noir: '#111111', blanc: '#FFFFFF', gris: '#9AA0A6', rouge: '#D32F2F',
  rose: '#E91E8C', bordeaux: '#7B1F2B', orange: '#F57C00', jaune: '#F5C518',
  vert: '#2E7D32', kaki: '#6B705C', turquoise: '#1BA3A3', bleu: '#1565C0',
  marine: '#1B2A4A', violet: '#7B1FA2', marron: '#6D4C41', beige: '#E3D5C0',
  crème: '#F5EFE0', creme: '#F5EFE0', ivoire: '#FFFFF0', camel: '#C19A6B',
  taupe: '#8B7E74', or: '#C9A227', argent: '#C0C0C0', doré: '#C9A227',
};

function colorOf(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (COLORS[key]) return COLORS[key];
  // « Bleu marine », « Vert olive » : le premier mot décide, faute de mieux.
  const first = key.split(/[\s-]/)[0];
  return COLORS[first] ?? null;
}

const COLOR_KEY = /couleur|color|coloris|teinte/i;
const SIZE_KEY  = /taille|size|pointure|format|parts?|portions?/i;

/**
 * Les attributs, montrés comme les maquettes les montrent : les couleurs en
 * pastilles, les tailles en jetons, le reste en paires.
 *
 * Un attribut ne se choisit pas — il décrit CETTE fiche. Le jeton de la fiche
 * courante est donc marqué, et rien n'est cliquable : promettre une bascule qui
 * n'existe pas coûte plus cher qu'un affichage sobre.
 */
export function AttributeChips({ attributes }: { attributes: Record<string, string> }) {
  const rows = Object.entries(attributes ?? {}).filter(([, v]) => String(v).trim());
  if (rows.length === 0) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {rows.map(([key, raw]) => {
        const value = String(raw);
        const isColor = COLOR_KEY.test(key);
        const isSize  = SIZE_KEY.test(key);
        return (
          <div key={key}>
            <p className="text-[13px] text-[var(--st-ink-3)]">
              {key} : <span className="font-semibold text-[var(--st-ink)]">{value}</span>
            </p>
            {isColor && (
              <span
                className="mt-2 inline-flex h-8 w-8 items-center justify-center"
                style={{
                  borderRadius: '999px',
                  border: '2px solid var(--st-ink)',
                  padding: 2,
                }}
                aria-hidden
              >
                <span
                  className="h-full w-full"
                  style={{
                    borderRadius: '999px',
                    background: colorOf(value) ?? 'var(--st-surface-2)',
                    border: '1px solid var(--st-border)',
                  }}
                />
              </span>
            )}
            {isSize && !isColor && (
              <span
                className="mt-2 inline-flex min-h-[36px] min-w-[44px] items-center justify-center px-3 text-[14px] font-semibold text-[var(--st-ink)]"
                style={{ border: '1px solid var(--st-ink)', borderRadius: 'var(--st-radius-btn)' }}
                aria-hidden
              >
                {value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Les caractéristiques en TABLEAU, quand la fiche se lit avant de se regarder.
 *
 * Deux rayons en ont besoin pour la même raison : l'acheteur compare. Un
 * éleveur compare un poids, un âge et une race ; un rayon d'électronique une
 * capacité, une autonomie et une garantie. Les pastilles de `AttributeChips`
 * décrivent une pièce qu'on regarde ; ce tableau répond à une question qu'on
 * se pose.
 *
 * Les lignes sont celles que le marchand a SAISIES, dans l'ordre où il les a
 * saisies. Aucune n'est complétée, aucune n'est traduite.
 */
export function SpecTable({ rows }: { rows: Array<[string, string]> }) {
  if (rows.length === 0) return null;
  return (
    <dl className="mt-6 flex flex-col">
      {rows.map(([key, value]) => (
        <div
          key={key}
          className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-0"
          style={{ borderColor: 'var(--st-border)' }}
        >
          <dt className="text-[13px] text-[var(--st-ink-3)]">{key}</dt>
          <dd className="text-right text-[14px] font-semibold text-[var(--st-ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── La quantité ─────────────────────────────────────────────────────────────

export function QtyStepper({ qty, setQty, label = 'Quantité' }: {
  qty: number;
  setQty: (fn: (q: number) => number) => void;
  label?: string;
}) {
  return (
    <div className="mt-6 flex items-center gap-4">
      <span className="text-[14px] font-semibold text-[var(--st-ink)]">{label}</span>
      <div
        className="flex items-center border"
        style={{ borderColor: 'var(--st-border)', borderRadius: 'var(--st-radius-btn)' }}
      >
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          aria-label="Diminuer la quantité"
          className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
        >
          <Minus className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <span className="min-w-[36px] text-center text-[15px] font-semibold tabular-nums text-[var(--st-ink)]">
          {qty}
        </span>
        <button
          type="button"
          onClick={() => setQty((q) => q + 1)}
          aria-label="Augmenter la quantité"
          className="flex h-11 w-11 items-center justify-center text-[var(--st-ink-2)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── La rangée d'engagements ─────────────────────────────────────────────────

const BADGE_ICONS = {
  truck: Truck, shield: Shield, refresh: RefreshCw, phone: Phone,
  card: CreditCard, clock: Clock,
} as const;

/**
 * Les engagements du marchand, en rangée sous le bouton d'achat.
 *
 * C'est la bande des maquettes — « Livraison rapide · Paiement mobile · Retour
 * facile · Service client ». Elle ne dit que ce qui est vrai : le premier
 * élément vient des modes de livraison RÉELS de la caisse, les suivants des
 * engagements que le marchand a écrits. Rien de rempli → rien d'affiché.
 */
export function AssuranceRow({ theme, shippingModes, currency, railed = false }: {
  theme: ThemeConfig;
  shippingModes: ShippingMode[];
  currency: string;
  /**
   * Vrai quand la fiche porte le rail de réassurance (`TrustRail`).
   *
   * La rangée ne disparaît pas pour autant : le rail est masqué sous `lg`,
   * parce qu'une troisième colonne sur un téléphone est une pile de plus entre
   * la photo et le bouton. Les deux se relaient donc au point de rupture, et
   * ne coexistent jamais.
   */
  railed?: boolean;
}) {
  const items: { Icon: typeof Truck; label: string; note?: string }[] = [];

  const modes = shippingModes.filter((m) => m.label?.trim());
  if (modes.length > 0) {
    const cheapest = [...modes].sort((a, b) => a.price - b.price)[0];
    items.push({
      Icon: Truck,
      label: cheapest.price === 0 ? 'Livraison offerte' : cheapest.label,
      note: cheapest.price === 0
        ? (cheapest.days?.trim() || undefined)
        : `${storeMoney(cheapest.price, currency)}${cheapest.days?.trim() ? ` · ${cheapest.days}` : ''}`,
    });
  }

  if (theme.trust.enabled) {
    for (const badge of theme.trust.badges) {
      if (!badge.label.trim()) continue;
      items.push({ Icon: BADGE_ICONS[badge.icon] ?? Shield, label: badge.label, note: badge.note || undefined });
    }
  }

  if (items.length === 0) return null;

  return (
    <ul
      className={`mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-5 sm:grid-cols-4${railed ? ' lg:hidden' : ''}`}
      style={{ borderColor: 'var(--st-border)' }}
      aria-label="Nos engagements"
    >
      {items.slice(0, 4).map(({ Icon, label, note }, i) => (
        <li key={`${label}-${i}`} className="flex flex-col items-start gap-1.5">
          <Icon className="h-5 w-5 text-[var(--st-ink-3)]" strokeWidth={1.6} aria-hidden />
          <p className="text-[12px] font-semibold leading-snug text-[var(--st-ink)]">{label}</p>
          {note && <p className="text-[11px] leading-snug text-[var(--st-ink-3)]">{note}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Les points forts du produit, en liste cochée — « Pourquoi on l'aime ? ». */
export function HighlightList({ items, title }: { items: string[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6">
      {title && <p className="mb-3 text-[14px] font-semibold text-[var(--st-ink)]">{title}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((line, i) => (
          <li key={`${i}-${line}`} className="flex items-start gap-2">
            <span
              className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center"
              style={{ borderRadius: '999px', background: 'var(--st-surface-2)' }}
              aria-hidden
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="var(--st-accent)" strokeWidth={2}>
                <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="min-w-0 text-[14px] leading-snug text-[var(--st-ink-2)]">{line}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Un champ de la fiche : libellé au-dessus, contrôle dessous. */
export function FieldRow({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-[var(--st-ink)]">{label}</span>
      {hint && <span className="mt-0.5 block text-[12px] text-[var(--st-ink-3)]">{hint}</span>}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

export const INPUT_CLASS =
  'w-full min-h-[44px] px-3 text-[14px] text-[var(--st-ink)] outline-none transition ' +
  'placeholder:text-[var(--st-ink-3)] focus:ring-2 focus:ring-[var(--st-accent)]';

export const INPUT_STYLE: React.CSSProperties = {
  background:   'var(--st-surface)',
  border:       '1px solid var(--st-border)',
  borderRadius: 'var(--st-radius-input, var(--st-radius-btn))',
};

export { storeMoney };
export type { StoreView };
