'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { getOrderByNumber } from '../../../actions/store-public';

function fmt(n: number) { return new Intl.NumberFormat('fr-HT').format(n) + ' HTG'; }

function ConfirmationInner() {
  const params      = useSearchParams();
  const orderNumber = params.get('order') ?? '';
  const bizId       = params.get('biz')   ?? '';
  const paid        = params.get('paid')  === '1';
  const slug        = typeof window !== 'undefined' ? window.location.pathname.split('/')[2] : '';

  const [order,   setOrder]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderNumber || !bizId) { setLoading(false); return; }
    getOrderByNumber(bizId, orderNumber)
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [orderNumber, bizId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 text-center">
      {/* Success icon */}
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
        <svg className="h-10 w-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="text-3xl font-extrabold text-slate-800">Commande confirmée ! 🎉</h1>
      {paid ? (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
          ✅ Paiement reçu et vérifié
        </div>
      ) : (
        <p className="mt-3 text-slate-500">
          Merci pour votre commande. Nous vous contacterons bientôt pour confirmer.
        </p>
      )}

      {order && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Commande #{order.order_number}</h2>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">En attente</span>
          </div>

          {/* Items */}
          <div className="divide-y divide-slate-100">
            {(order.order_items ?? []).map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 py-3">
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {item.product_image
                    ? <img src={item.product_image} alt={item.product_name} className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center text-xl">📦</div>}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{item.product_name}</p>
                  <p className="text-xs text-slate-400">Qté: {item.quantity}</p>
                </div>
                <p className="text-sm font-bold text-slate-700">{fmt(item.total_price)}</p>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Sous-total</span><span>{fmt(order.subtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Livraison</span><span>{order.shipping_amount === 0 ? 'Gratuit' : fmt(order.shipping_amount)}</span></div>
            <div className="flex justify-between text-base font-bold text-slate-800 border-t border-slate-100 pt-2 mt-2">
              <span>Total</span>
              <span style={{ color: 'var(--store-primary)' }}>{fmt(order.total)}</span>
            </div>
          </div>

          {/* Customer */}
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
            <p><strong>Nom :</strong> {order.customer_name}</p>
            <p><strong>Email :</strong> {order.customer_email}</p>
            {order.shipping_address && (
              <p><strong>Livraison :</strong> {order.shipping_address.line1}, {order.shipping_address.city}</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href={slug ? `/store/${slug}` : '/'}
          className="rounded-2xl px-8 py-3 text-sm font-bold text-white transition"
          style={{ backgroundColor: 'var(--store-primary)' }}
        >
          Continuer les achats →
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" /></div>}>
      <ConfirmationInner />
    </Suspense>
  );
}
