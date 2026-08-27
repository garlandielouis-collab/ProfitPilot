'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Vente en 10 secondes — Diagnostic 2 (la comptabilité invisible)
//
// Trois gestes, pas plus : je tape le produit, je confirme la quantité, je tape
// le mode de paiement. Tout le reste (prix, marge, stock, écritures) est déduit.
// Le panier complet reste disponible via <NewSaleForm /> pour les cas riches.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Minus, Plus, Search, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { createSaleAction } from '../../app/actions/sales';
import { getProductsAction, type Product } from '../../app/actions/products';
import { useCompany } from '../../hooks/useCompany';
import { computeMargin } from '../../lib/margin';
import { newClientRef, queueSale } from '../../lib/offlineQueue';

type PaymentMode = 'Espèces' | 'MonCash' | 'Natcash' | 'Carte' | 'Crédit';

const MODE_TO_DB: Record<PaymentMode, 'Cash' | 'MonCash' | 'Natcash' | 'Card'> = {
  'Espèces': 'Cash',
  'MonCash': 'MonCash',
  'Natcash': 'Natcash',
  'Carte':   'Card',
  'Crédit':  'Cash',
};

const MODES: Array<{ mode: PaymentMode; emoji: string; className: string }> = [
  { mode: 'Espèces', emoji: '💵', className: 'bg-[#50C878] text-white' },
  { mode: 'MonCash', emoji: '📱', className: 'bg-[#e91e8c] text-white' },
  { mode: 'Natcash', emoji: '📲', className: 'bg-purple-600 text-white' },
  { mode: 'Carte',   emoji: '💳', className: 'bg-[#0056b3] text-white' },
  { mode: 'Crédit',  emoji: '⏳', className: 'bg-amber-500 text-white' },
];

const fmt = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

export function QuickSaleForm({ onSaved }: { onSaved?: () => void }) {
  const { company } = useCompany();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting]     = useState(false);

  const exchangeRate = company?.exchangeRate ?? 1;
  const currency     = company?.defaultCurrency ?? 'HTG';

  useEffect(() => {
    getProductsAction()
      .then(setProducts)
      .catch(() => toast.error('Impossible de charger les produits.'))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter((p) => p.name.toLowerCase().includes(q))
      : products;
    return list.slice(0, 12);
  }, [products, search]);

  // Marge de la vente en cours — le marchand voit ce qu'il gagne AVANT de valider.
  const margin = useMemo(() => {
    if (!selected) return null;
    return computeMargin({
      purchasePrice: selected.purchase_price,
      costCurrency:  selected.currency ?? 'HTG',
      salePrice:     selected.sale_price,
      saleCurrency:  selected.currency ?? 'HTG',
      quantity,
      exchangeRate,
      displayCurrency: currency,
    });
  }, [selected, quantity, exchangeRate, currency]);

  function reset() {
    setSelected(null);
    setQuantity(1);
    setCustomerName('');
    setSearch('');
  }

  async function submit(mode: PaymentMode) {
    if (!selected || !company?.id) return;
    const isCredit = mode === 'Crédit';

    if (isCredit && !customerName.trim()) {
      toast.error('Nom du client requis pour une vente à crédit.');
      return;
    }

    setSubmitting(true);

    // Clé d'idempotence générée AVANT l'appel : c'est elle qui permet de
    // rejouer la vente hors-ligne sans jamais la compter deux fois.
    const clientRef = newClientRef();
    const payload = {
      business_id:      company.id,
      currency:         (selected.currency ?? 'HTG') as 'HTG' | 'USD',
      payment_method:   MODE_TO_DB[mode],
      payment_status:   (isCredit ? 'credit' : 'paid') as 'credit' | 'paid',
      discount_percent: 0,
      tax_amount:       0,
      customer_name:    customerName.trim() || undefined,
      client_ref:       clientRef,
      items: [
        {
          product_id:       selected.id,
          product_name:     selected.name,
          quantity,
          unit_price:       selected.sale_price,
          discount_percent: 0,
          tax_rate:         0,
        },
      ],
    };

    // Hors-ligne : on met en file tout de suite plutôt que de faire échouer la
    // vente. Le marchand a encaissé, la saisie ne doit pas être perdue.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await queueSale(clientRef, payload);
      window.dispatchEvent(new Event('pp:sale-queued'));
      toast.success('Vant sere — l ap anrejistre lè entènèt la tounen.');
      reset();
      setSubmitting(false);
      return;
    }

    try {
      const result = await createSaleAction(payload);

      if (!result.success) {
        toast.error(result.errors[0]?.message ?? 'Enregistrement impossible.');
        return;
      }

      toast.success(
        `Vente enregistrée — ${fmt(result.totalAmount, selected.currency ?? 'HTG')}`,
        { description: margin ? `Marge : ${fmt(margin.netMargin, margin.currency)}` : undefined },
      );

      // Décrémente le stock localement pour un retour immédiat.
      setProducts((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? { ...p, stock_quantity: Math.max(p.stock_quantity - quantity, 0) }
            : p,
        ),
      );
      reset();
      onSaved?.();
    } catch (err) {
      // Coupure réseau pendant l'appel : même traitement que le cas hors-ligne.
      // Le `client_ref` garantit qu'un rejeu ne créera pas de doublon même si
      // la requête était en fait passée côté serveur.
      await queueSale(clientRef, payload);
      window.dispatchEvent(new Event('pp:sale-queued'));
      toast.success('Koneksyon koupe — vant la sere pou sinkronizasyon.');
      reset();
      onSaved?.();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-3 bg-[#001F3F] px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#50C878]/20">
          <Zap className="h-5 w-5 text-[#50C878]" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Vente rapide</h3>
          <p className="text-xs text-slate-300">Produit · quantité · paiement</p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* Étape 1 — produit */}
        {!selected && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Chercher un produit…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition
                           focus:border-[#50C878] focus:ring-2 focus:ring-[#50C878]/20
                           dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : visible.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Aucun produit. Ajoutez-en un pour vendre en 10 secondes.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {visible.map((p) => {
                  const out = p.stock_quantity <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => { setSelected(p); setQuantity(1); }}
                      className={`rounded-xl border p-3 text-left transition active:scale-[0.98] ${
                        out
                          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50 dark:border-slate-800 dark:bg-slate-900'
                          : 'border-slate-200 bg-white hover:border-[#50C878] hover:shadow-card dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-[#001F3F] dark:text-slate-100">
                        {p.name}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-[#50C878]">
                        {fmt(p.sale_price, p.currency ?? 'HTG')}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {out ? 'Rupture' : `Stock : ${p.stock_quantity}`}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Étape 2 — quantité + paiement */}
        {selected && (
          <>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#001F3F] dark:text-slate-100">
                  {selected.name}
                </p>
                <p className="text-xs text-slate-500">
                  {fmt(selected.sale_price, selected.currency ?? 'HTG')} · l'unité
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Changer
              </button>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-16 text-center text-3xl font-black tabular-nums text-[#001F3F] dark:text-slate-100">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(q + 1, Math.max(selected.stock_quantity, 1)))}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {margin && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Total {fmt(margin.revenue, margin.currency)}
                </span>
                <span className={`text-xs font-bold ${margin.isLoss ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  Marge {fmt(margin.netMargin, margin.currency)} ({margin.marginPercent.toFixed(0)}%)
                </span>
              </div>
            )}

            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nom du client (obligatoire si crédit)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition
                         focus:border-[#50C878] focus:ring-2 focus:ring-[#50C878]/20
                         dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODES.map(({ mode, emoji, className }) => (
                <button
                  key={mode}
                  type="button"
                  disabled={submitting}
                  onClick={() => submit(mode)}
                  className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition active:scale-[0.97] disabled:opacity-60 ${className}`}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>{emoji}</span>}
                  {mode}
                </button>
              ))}
            </div>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Check className="h-3 w-3" />
              Un seul geste : la vente, le stock et la marge sont enregistrés
            </p>
          </>
        )}
      </div>
    </div>
  );
}
