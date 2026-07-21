'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCart } from '../StoreCartContext';

function fmt(n: number) { return new Intl.NumberFormat('fr-HT').format(n) + ' HTG'; }

export default function CartPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const { items, total, updateQty, removeItem } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <p className="text-5xl">🛒</p>
        <h1 className="mt-4 text-2xl font-bold text-slate-800">Votre panier est vide</h1>
        <p className="mt-2 text-sm text-slate-500">Ajoutez des produits pour commencer vos achats.</p>
        <Link
          href={`/store/${slug}/products`}
          className="mt-8 inline-block rounded-2xl px-8 py-3 text-sm font-bold text-white transition"
          style={{ backgroundColor: 'var(--store-primary)' }}
        >
          Voir les produits →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold text-slate-800">Mon panier ({items.length})</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Items */}
        <div className="space-y-4 lg:col-span-2">
          {items.map(({ product, quantity }) => {
            const price = product.sale_price ?? product.price;
            return (
              <div key={product.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                {/* Image */}
                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {product.image_url
                    ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center text-2xl">📦</div>}
                </div>
                {/* Info */}
                <div className="flex flex-1 flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{product.name}</p>
                      {product.category && <p className="text-xs text-slate-400">{product.category}</p>}
                    </div>
                    <button onClick={() => removeItem(product.id)} className="text-slate-300 hover:text-red-500 transition">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    {/* Qty */}
                    <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-sm">
                      <button onClick={() => updateQty(product.id, quantity - 1)} className="px-3 py-1.5 hover:bg-slate-50">−</button>
                      <span className="w-8 text-center font-bold">{quantity}</span>
                      <button onClick={() => updateQty(product.id, quantity + 1)} className="px-3 py-1.5 hover:bg-slate-50">+</button>
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--store-primary)' }}>{fmt(price * quantity)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 h-fit">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Récapitulatif</h2>
          <div className="space-y-2 text-sm">
            {items.map(({ product, quantity }) => {
              const price = product.sale_price ?? product.price;
              return (
                <div key={product.id} className="flex justify-between text-slate-600">
                  <span className="truncate max-w-[140px]">{product.name} ×{quantity}</span>
                  <span>{fmt(price * quantity)}</span>
                </div>
              );
            })}
          </div>
          <div className="my-4 border-t border-slate-100" />
          <div className="flex justify-between text-base font-bold text-slate-800">
            <span>Total</span>
            <span style={{ color: 'var(--store-primary)' }}>{fmt(total)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Livraison calculée à l'étape suivante</p>
          <Link
            href={`/store/${slug}/checkout`}
            className="mt-5 block w-full rounded-2xl py-3.5 text-center text-sm font-bold text-white transition shadow-md hover:shadow-lg"
            style={{ backgroundColor: 'var(--store-primary)' }}
          >
            Commander →
          </Link>
          <Link href={`/store/${slug}/products`} className="mt-3 block text-center text-xs text-slate-400 hover:underline">
            Continuer les achats
          </Link>
        </div>
      </div>
    </div>
  );
}
