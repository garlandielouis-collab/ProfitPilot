'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCart } from '../StoreCartContext';
import { createStoreOrder, getStoreBySlug } from '../../../actions/store-public';

function fmt(n: number) { return new Intl.NumberFormat('fr-HT').format(n) + ' HTG'; }

const PAYMENT_LABELS: Record<string, string> = {
  cash:    'Paiement à la livraison',
  moncash: 'MonCash',
  natcash: 'NatCash',
  card:    'Carte bancaire',
};

export default function CheckoutPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const router = useRouter();
  const { items, total, clear } = useCart();

  const [paymentMethods, setPaymentMethods] = useState(['cash']);
  const [shippingModes,  setShippingModes]  = useState<Array<{ id: string; label: string; price: number; days: string }>>([]);
  const [businessId,     setBusinessId]     = useState('');
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    line1: '', line2: '', city: '', country: 'HT',
    shipping_mode: '', payment: 'cash', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    getStoreBySlug(slug).then((s) => {
      if (!s) return;
      setPaymentMethods(s.payment_methods as string[]);
      setShippingModes(s.shipping_modes as any[]);
      setBusinessId(s.business_id);
      const first = (s.shipping_modes as any[])[0];
      if (first) setForm((f) => ({ ...f, shipping_mode: first.id }));
    });
  }, [slug]);

  const shippingPrice = shippingModes.find((m) => m.id === form.shipping_mode)?.price ?? 0;
  const orderTotal    = total + shippingPrice;
  const inp = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100';

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-4xl">🛒</p>
        <p className="mt-4 text-lg font-semibold text-slate-700">Votre panier est vide</p>
        <a href={`/store/${slug}/products`} className="mt-4 inline-block text-sm underline text-slate-500">Voir les produits</a>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.line1.trim() || !form.city.trim()) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (!businessId) { setError('Erreur boutique.'); return; }
    setSubmitting(true);

    const orderData = {
      business_id:      businessId,
      customer_name:    form.name.trim(),
      customer_email:   form.email.trim(),
      customer_phone:   form.phone.trim(),
      shipping_address: { line1: form.line1, line2: form.line2, city: form.city, country: form.country },
      shipping_mode:    form.shipping_mode,
      payment_method:   form.payment,
      notes:            form.notes.trim() || undefined,
      items: items.map((i) => ({
        product_id:    i.product.id,
        product_name:  i.product.name,
        product_image: i.product.image_url,
        quantity:      i.quantity,
        unit_price:    i.product.sale_price ?? i.product.price,
      })),
    };

    try {
      // ── Gateway payments: redirect to external payment page ─────────────────
      if (form.payment === 'moncash' || form.payment === 'natcash') {
        const gateway  = form.payment; // 'moncash' | 'natcash'
        const res      = await fetch(`/api/store/payment/${gateway}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ businessId, orderData: { ...orderData, total: orderTotal } }),
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          setError(json.error ?? 'Erreur paiement.');
          setSubmitting(false);
          return;
        }
        // Clear cart before leaving (order is already created server-side)
        clear();
        // Redirect to payment gateway
        window.location.href = json.redirectUrl;
        return;
      }

      // ── Cash / card: create order directly ──────────────────────────────────
      const { orderNumber } = await createStoreOrder(orderData);
      clear();
      router.push(`/store/${slug}/confirmation?order=${orderNumber}&biz=${businessId}`);
    } catch (err: any) {
      setError(err.message ?? 'Erreur lors de la commande.');
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold text-slate-800">Passer la commande</h1>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-bold text-slate-800">📋 Informations de contact</h2>
            <div className="space-y-3">
              <input className={inp} placeholder="Nom complet *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className={inp} type="email" placeholder="Email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input className={inp} type="tel" placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-bold text-slate-800">🏠 Adresse de livraison</h2>
            <div className="space-y-3">
              <input className={inp} placeholder="Adresse *" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} required />
              <input className={inp} placeholder="Apt, suite, etc." value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
              <input className={inp} placeholder="Ville *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
              <select className={inp} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                <option value="HT">Haïti</option>
                <option value="DO">République Dominicaine</option>
                <option value="US">États-Unis</option>
                <option value="FR">France</option>
              </select>
            </div>
          </section>
          {shippingModes.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 font-bold text-slate-800">🚚 Mode de livraison</h2>
              <div className="space-y-2">
                {shippingModes.map((mode) => (
                  <label key={mode.id} className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition ${form.shipping_mode === mode.id ? 'border-slate-700 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-center gap-3">
                      <input type="radio" name="shipping" value={mode.id} checked={form.shipping_mode === mode.id} onChange={() => setForm({ ...form, shipping_mode: mode.id })} className="accent-slate-700" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{mode.label}</p>
                        <p className="text-xs text-slate-400">{mode.days}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold">{mode.price === 0 ? 'Gratuit' : fmt(mode.price)}</span>
                  </label>
                ))}
              </div>
            </section>
          )}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-bold text-slate-800">💳 Mode de paiement</h2>
            <div className="space-y-2">
              {paymentMethods.map((method) => (
                <label key={method} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${form.payment === method ? 'border-slate-700 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="payment" value={method} checked={form.payment === method} onChange={() => setForm({ ...form, payment: method })} className="accent-slate-700" />
                  <span className="text-sm font-medium">{PAYMENT_LABELS[method] ?? method}</span>
                </label>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-bold text-slate-800">📝 Notes (optionnel)</h2>
            <textarea className={inp} rows={3} placeholder="Instructions spéciales…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </section>
        </div>

        {/* Right: summary */}
        <div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sticky top-24">
            <h2 className="mb-4 font-bold text-slate-800">📦 Récapitulatif</h2>
            <div className="space-y-3">
              {items.map(({ product, quantity }) => {
                const price = product.sale_price ?? product.price;
                return (
                  <div key={product.id} className="flex items-center gap-3">
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {product.image_url ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-lg">📦</div>}
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[9px] text-white font-bold">{quantity}</span>
                    </div>
                    <p className="flex-1 text-xs text-slate-700 line-clamp-2">{product.name}</p>
                    <p className="text-xs font-bold">{fmt(price * quantity)}</p>
                  </div>
                );
              })}
            </div>
            <div className="my-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between text-slate-600"><span>Sous-total</span><span>{fmt(total)}</span></div>
              <div className="flex justify-between text-slate-600"><span>Livraison</span><span>{shippingPrice === 0 ? 'Gratuit' : fmt(shippingPrice)}</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-800">
                <span>Total</span>
                <span style={{ color: 'var(--store-primary)' }}>{fmt(orderTotal)}</span>
              </div>
            </div>
            {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white transition shadow-md hover:shadow-lg disabled:opacity-50"
              style={{ backgroundColor: 'var(--store-primary)' }}>
              {submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Traitement…</> : `Confirmer — ${fmt(orderTotal)}`}
            </button>
            <p className="mt-3 text-center text-xs text-slate-400">🔒 Commande sécurisée</p>
          </div>
        </div>
      </form>
    </div>
  );
}
