'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ProductCard } from '../ProductCard';
import type { StoreProduct, StoreCategory } from '../../../actions/store-public';
import { Package } from 'lucide-react';

type Props = {
  products:        StoreProduct[];
  categories:      StoreCategory[];
  slug:            string;
  showPrice:       boolean;
  showStock:       boolean;
  initialCategory: string;
  initialSort:     string;
  initialSearch:   string;
};

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Les plus récents' },
  { value: 'price_asc',  label: 'Prix croissant'   },
  { value: 'price_desc', label: 'Prix décroissant'  },
  { value: 'name',       label: 'Nom A→Z'           },
];

export function ProductsClient({
  products, categories, slug, showPrice, showStock,
  initialCategory, initialSort, initialSearch,
}: Props) {
  const router = useRouter();
  const [search,   setSearch]   = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [sort,     setSort]     = useState(initialSort);
  const [, start] = useTransition();

  function apply(params: { search?: string; category?: string; sort?: string }) {
    const s = new URLSearchParams();
    const sr = params.search   ?? search;
    const ca = params.category ?? category;
    const so = params.sort     ?? sort;
    if (sr) s.set('search',   sr);
    if (ca) s.set('category', ca);
    if (so) s.set('sort',     so);
    start(() => router.push(`/store/${slug}/products?${s.toString()}`));
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Tous les produits</h1>
        <p className="mt-1 text-sm text-slate-500">{products.length} produit{products.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-56 flex-shrink-0">
          {/* Search */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Recherche</label>
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && apply({ search })}
                placeholder="Rechercher…"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <button onClick={() => apply({ search })}
                className="rounded-xl px-3 py-2 text-white text-sm" style={{ backgroundColor: 'var(--store-primary)' }}>
                →
              </button>
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Catégorie</label>
              <div className="space-y-1">
                <button
                  onClick={() => { setCategory(''); apply({ category: '' }); }}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${!category ? 'font-semibold text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  style={!category ? { backgroundColor: 'var(--store-primary)' } : {}}
                >
                  Tout ({products.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setCategory(cat.id); apply({ category: cat.id }); }}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${category === cat.id ? 'font-semibold text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                    style={category === cat.id ? { backgroundColor: 'var(--store-primary)' } : {}}
                  >
                    {cat.name} ({cat.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sort */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">Trier par</label>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); apply({ sort: e.target.value }); }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </aside>

        {/* ── Grid ── */}
        <div className="flex-1">
          {products.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-slate-400">
              <p className="text-4xl"><Package className="h-6 w-6" strokeWidth={1.5} aria-hidden /></p>
              <p className="mt-3 text-sm">Aucun produit trouvé.</p>
              <button onClick={() => { setSearch(''); setCategory(''); apply({ search: '', category: '' }); }}
                className="mt-3 text-sm font-medium underline">
                Effacer les filtres
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} slug={slug} showPrice={showPrice} showStock={showStock} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
