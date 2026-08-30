'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCart } from '../../StoreCartContext';
import type { StoreProduct } from '../../../../actions/store-public';
import { Package } from 'lucide-react';

function fmt(n: number) { return new Intl.NumberFormat('fr-HT').format(n) + ' HTG'; }

export function ProductDetailClient({
  product, slug, showPrice, showStock,
}: { product: StoreProduct; slug: string; showPrice: boolean; showStock: boolean }) {
  const { addItem } = useCart();
  const [qty,   setQty]   = useState(1);
  const [img,   setImg]   = useState(product.image_url ?? null);
  const [added, setAdded] = useState(false);

  const price       = product.sale_price ?? product.price;
  const hasDiscount = product.sale_price !== null && product.sale_price < product.price;
  const discount    = hasDiscount ? Math.round((1 - product.sale_price! / product.price) * 100) : 0;
  const images      = [product.image_url, ...(product.images ?? [])].filter(Boolean) as string[];
  const outOfStock  = product.stock <= 0;

  function handleAdd() {
    if (outOfStock) return;
    addItem(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate-400">
        <Link href={`/store/${slug}`} className="hover:text-slate-600">Accueil</Link>
        <span>/</span>
        <Link href={`/store/${slug}/products`} className="hover:text-slate-600">Produits</Link>
        {product.category && <><span>/</span><span>{product.category}</span></>}
        <span>/</span>
        <span className="text-slate-600 font-medium truncate max-w-[150px]">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Images */}
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
            {img ? (
              <img src={img} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-300"><Package className="h-14 w-14" strokeWidth={1.5} aria-hidden /></div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setImg(src)}
                  className={`flex-shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition ${img === src ? 'border-slate-700' : 'border-transparent hover:border-slate-300'}`}
                >
                  <img src={src} alt={`Image ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col">
          {/* Badges */}
          <div className="mb-3 flex flex-wrap gap-2">
            {product.is_featured && (
              <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: 'var(--store-primary)' }}>Vedette</span>
            )}
            {product.is_new && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Nouveau</span>
            )}
            {hasDiscount && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">-{discount}%</span>
            )}
          </div>

          {product.category && <p className="text-sm text-slate-400">{product.category}</p>}
          <h1 className="mt-1 text-2xl font-extrabold text-slate-800">{product.name}</h1>

          {showPrice && (
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold" style={{ color: 'var(--store-primary)' }}>{fmt(price)}</span>
              {hasDiscount && <span className="text-lg text-slate-400 line-through">{fmt(product.price)}</span>}
            </div>
          )}

          {showStock && (
            <p className={`mt-2 text-sm font-medium ${product.stock > 5 ? 'text-emerald-600' : product.stock > 0 ? 'text-amber-600' : 'text-red-500'}`}>
              {outOfStock ? 'Épuisé' : product.stock <= 5 ? `Seulement ${product.stock} en stock` : `En stock (${product.stock})`}
            </p>
          )}

          {product.description && (
            <p className="mt-6 text-sm leading-relaxed text-slate-600">{product.description}</p>
          )}

          {/* Quantity */}
          {!outOfStock && (
            <div className="mt-8 flex items-center gap-4">
              <label className="text-sm font-semibold text-slate-700">Quantité</label>
              <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden">
                <button onClick={() => setQty(Math.max(1, qty - 1))}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-50 transition">−</button>
                <span className="w-12 text-center text-sm font-bold">{qty}</span>
                <button onClick={() => setQty(Math.min(product.stock, qty + 1))}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-50 transition">+</button>
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleAdd}
              disabled={outOfStock}
              className="flex-1 rounded-2xl py-3.5 text-sm font-bold text-white transition shadow-md hover:shadow-lg disabled:opacity-40"
              style={{ backgroundColor: added ? '#50c878' : 'var(--store-primary)' }}
            >
              {added ? 'Ajouté au panier' : outOfStock ? 'Épuisé' : `Ajouter au panier — ${fmt(price * qty)}`}
            </button>
            <Link
              href={`/store/${slug}/cart`}
              className="flex-shrink-0 rounded-2xl border border-slate-200 px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 text-center"
            >
              Voir le panier
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
