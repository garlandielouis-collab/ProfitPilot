'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Le stock — ce qui manque, en tête ; le reste, ailleurs (§4.5)
//
// Avant : trois pastilles de trois couleurs (rouge, ambre, bleu), une pastille
// d'émoji par produit (🚫 ⚠️ ✅), une barre de progression teintée, et un pied
// de carte qui était une carte DANS la carte (§5.5).
//
// Après : deux pastilles au plus, et seulement quand elles ont quelque chose à
// dire — un « 0 épuisé » n'est pas une information, c'est du bruit (§3.6). Une
// ligne par produit : nom, catégorie, quantité. La quantité passe au rouge
// quand elle est à zéro : c'est le seul rouge du bloc, donc il alerte.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Badge, Card, Money } from '../ds';

export type StockItem = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  reorderPoint: number;
};

export function StockSection({
  items,
  outOfStock,
  lowStock,
  totalValue,
  currency = 'HTG',
  loading,
  labels,
}: {
  items: StockItem[];
  outOfStock: number;
  lowStock: number;
  totalValue: number;
  currency?: string;
  loading: boolean;
  labels: {
    empty: string; emptyAction: string;
    outOfStock: string; lowStock: string; totalValue: string; fallbackCategory: string;
  };
}) {
  return (
    <Card>
      {(outOfStock > 0 || lowStock > 0) && (
        <div className="flex flex-wrap gap-2 px-4 pt-4">
          {outOfStock > 0 && (
            <Badge tone="danger">{outOfStock} {labels.outOfStock}</Badge>
          )}
          {lowStock > 0 && (
            <Badge tone="warning">{lowStock} {labels.lowStock}</Badge>
          )}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="space-y-2 p-4" aria-hidden>
          {[0, 1, 2].map((i) => <span key={i} className="pp-skeleton block h-11 rounded-control" />)}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="px-4 py-8 text-center">
          <p className="text-body text-text2 dark:text-dark-text2">{labels.empty}</p>
          <Link
            href="/products"
            className="pressable mt-2 inline-flex min-h-touch items-center text-body font-bold text-primary underline underline-offset-4 dark:text-dark-text"
          >
            {labels.emptyAction}
          </Link>
        </div>
      )}

      <ul className="divide-y divide-border dark:divide-dark-border">
        {items.map((item) => {
          const out = item.quantity === 0;
          const low = !out && item.quantity <= item.reorderPoint;
          return (
            <li key={item.id}>
              {/* La ligne entière est cliquable : pas de chevron pour le redire (§3.6) */}
              <Link
                href="/products"
                className="pressable flex min-h-touch items-center justify-between gap-3 px-4 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body text-primary dark:text-dark-text">
                    {item.name}
                  </span>
                  <span className="block truncate text-note text-muted dark:text-dark-muted">
                    {item.category ?? labels.fallbackCategory}
                  </span>
                </span>
                <span
                  className={`amount flex-shrink-0 text-body font-bold ${
                    out ? 'text-danger' : low ? 'text-warning' : 'text-primary dark:text-dark-text'
                  }`}
                >
                  {item.quantity}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {!loading && items.length > 0 && (
        <div className="flex min-h-touch items-center justify-between gap-4 border-t border-border px-4 py-2 dark:border-dark-border">
          <span className="text-note text-muted dark:text-dark-muted">{labels.totalValue}</span>
          <Money value={totalValue} currency={currency} size="body" />
        </div>
      )}
    </Card>
  );
}
