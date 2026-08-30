'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from './StoreCartContext';
import type { StoreProduct } from '../../actions/store-public';
import { Package } from 'lucide-react';

type Props = {
  product:   StoreProduct;
  slug:      string;
  showPrice: boolean;
  showStock: boolean;
};

function fmt(n: number, currency = 'HTG') {
  return new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0 }).format(n) + ' ' + currency;
}

export function ProductCard({ product, slug, showPrice, showStock }: Props) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const price       = product.sale_price ?? product.price;
  const hasDiscount = product.sale_price !== null && product.sale_price < product.price;
  const outOfStock  = product.stock <= 0;

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    if (outOfStock) return;
    addItem(product, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <Link href={`/store/${slug}/products/${product.id}`} className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden transition hover:shadow-md hover:border-slate-300">
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300"><Package className="h-8 w-8" strokeWidth={1.5} aria-hidden /></div>
        )}
        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {hasDiscount && (
            <span className="rounded-lg bg-red-500 px-2 py-0.5 text-note font-bold text-white">
              -{Math.round((1 - product.sale_price! / product.price) * 100)}%
            </span>
          )}
          {product.is_new && !hasDiscount && (
            <span className="rounded-lg bg-emerald-500 px-2 py-0.5 text-note font-bold text-white">NOUVEAU</span>
          )}
          {product.is_featured && (
            <span className="rounded-lg px-2 py-0.5 text-note font-bold text-white" style={{ backgroundColor: 'var(--store-primary)' }}>VEDETTE</span>
          )}
        </div>
        {outOfStock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="rounded-xl bg-white/90 px-3 py-1 text-xs font-bold text-slate-700">Épuisé</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        <p className="text-xs text-slate-400 truncate">{product.category ?? ''}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-800 line-clamp-2">{product.name}</p>

        {showPrice && (
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-base font-bold" style={{ color: 'var(--store-primary)' }}>{fmt(price)}</span>
            {hasDiscount && (
              <span className="text-xs text-slate-400 line-through">{fmt(product.price)}</span>
            )}
          </div>
        )}

        {showStock && (
          <p className={`mt-1 text-note font-medium ${product.stock > 5 ? 'text-emerald-600' : product.stock > 0 ? 'text-amber-600' : 'text-red-500'}`}>
            {product.stock > 0 ? `${product.stock} en stock` : 'Épuisé'}
          </p>
        )}

        <button
          onClick={handleAdd}
          disabled={outOfStock}
          className="mt-3 w-full rounded-xl py-2 text-xs font-bold text-white transition disabled:opacity-40"
          style={{ backgroundColor: added ? '#50c878' : 'var(--store-primary)' }}
        >
          {added ? 'Ajouté' : outOfStock ? 'Épuisé' : '+ Ajouter au panier'}
        </button>
      </div>
    </Link>
  );
}
