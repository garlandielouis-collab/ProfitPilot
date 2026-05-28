'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/utils';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AlertTriangle, Bot, Minus, Moon, Package, Plus, Star, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type RawProduct = {
  id: string;
  name: string;
  category: string;
  sale_price: number;
  purchase_price: number;
  stock_quantity: number;
  image_url?: string;
  isStar: boolean;
  isDormant: boolean;
  salesRevenue: number;
};

type EnrichedProduct = RawProduct & { stockLimit: number };

// ── Stock Adjustment Modal ────────────────────────────────────────────────────

function AdjustmentModal({
  product,
  onClose,
  onSave,
}: {
  product: EnrichedProduct;
  onClose: () => void;
  onSave: (id: string, qty: number) => void;
}) {
  const [qty, setQty] = useState(product.stock_quantity);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setSaving(true);
    setErr('');
    const { error } = await supabase
      .from('products')
      .update({ stock_quantity: qty })
      .eq('id', product.id);
    if (error) {
      setErr(error.message);
      setSaving(false);
    } else {
      onSave(product.id, qty);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#212529]">Ajustement de stock</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <p className="mb-5 text-sm text-slate-500">{product.name}</p>

        <div className="mb-5 flex items-center justify-center gap-4">
          <button
            onClick={() => setQty(q => Math.max(0, q - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            value={qty}
            min={0}
            onChange={e => setQty(Math.max(0, Number(e.target.value)))}
            className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-center text-2xl font-bold text-[#212529] outline-none focus:border-[#0056b3]"
          />
          <button
            onClick={() => setQty(q => q + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {err && <p className="mb-3 text-xs text-red-600">{err}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-[#0056b3] py-2.5 text-sm font-medium text-white hover:bg-[#004494] disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PilotAI Panel ─────────────────────────────────────────────────────────────

function PilotAIPanel({ products, onClose }: { products: EnrichedProduct[]; onClose: () => void }) {
  const critical = products.filter(p => p.stock_quantity === 0);
  const lowStock = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.stockLimit);
  const stars = products.filter(p => p.isStar);
  const dormants = products.filter(p => p.isDormant);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center sm:pb-0">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-3 bg-[#0056b3] px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white">PilotAI — Analiz Envantè</p>
            <p className="text-xs text-white/70">Insights jenere otomatikman</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-full p-1 hover:bg-white/20">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {critical.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-sm font-semibold text-red-700">🚨 {critical.length} pwodwi san estòk</p>
              <ul className="space-y-1">
                {critical.map(p => (
                  <li key={p.id} className="text-xs text-red-600">• {p.name}</li>
                ))}
              </ul>
            </div>
          )}

          {lowStock.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-700">⚠️ {lowStock.length} pwodwi ap fini</p>
              <ul className="space-y-1">
                {lowStock.slice(0, 6).map(p => (
                  <li key={p.id} className="text-xs text-amber-600">
                    • {p.name} — <span className="font-semibold">{p.stock_quantity}</span> inite
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stars.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-1 text-sm font-semibold text-yellow-700">⭐ Stars ou yo (Pareto 80/20)</p>
              <p className="mb-2 text-xs text-yellow-600">Pwodwi sa yo jenere 80% revni ou.</p>
              <ul className="space-y-1">
                {stars.slice(0, 6).map(p => (
                  <li key={p.id} className="text-xs text-yellow-600">
                    • {p.name} — {formatCurrency(p.salesRevenue)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dormants.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-600">
                😴 {dormants.length} Pwodwi Dormants (30 dènye jou)
              </p>
              <ul className="space-y-1">
                {dormants.slice(0, 6).map(p => (
                  <li key={p.id} className="text-xs text-slate-500">• {p.name}</li>
                ))}
              </ul>
            </div>
          )}

          {critical.length === 0 && lowStock.length === 0 && stars.length === 0 && dormants.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">Tout estòk yo anfòm! ✅</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [rawProducts, setRawProducts] = useState<RawProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockLimits, setStockLimits] = useState<Record<string, number>>({});
  const [adjustProduct, setAdjustProduct] = useState<EnrichedProduct | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);

  // Persist stock limits in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pp_stock_limits');
      if (saved) setStockLimits(JSON.parse(saved));
    } catch {}
  }, []);

  function saveStockLimit(productId: string, limit: number) {
    const updated = { ...stockLimits, [productId]: limit };
    setStockLimits(updated);
    try {
      localStorage.setItem('pp_stock_limits', JSON.stringify(updated));
    } catch {}
  }

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [prodRes, salesRes, recentRes] = await Promise.all([
        supabase
          .from('products')
          .select('id,name,category,sale_price,purchase_price,stock_quantity,image_url')
          .order('name'),
        supabase.from('sales').select('product_id,total_amount'),
        supabase
          .from('sales')
          .select('product_id')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      if (prodRes.error || !prodRes.data) {
        console.error('[InventoryPage]', prodRes.error?.message);
        setLoading(false);
        return;
      }

      // Revenue per product
      const revenueMap: Record<string, number> = {};
      for (const s of salesRes.data ?? []) {
        if (s.product_id) {
          revenueMap[s.product_id] = (revenueMap[s.product_id] ?? 0) + Number(s.total_amount);
        }
      }

      // Active products in last 30 days
      const recentSet = new Set((recentRes.data ?? []).map((s: any) => s.product_id as string));

      // Pareto: accumulate sorted revenue until 80% reached
      const totalRevenue = Object.values(revenueMap).reduce((a, b) => a + b, 0);
      const starSet = new Set<string>();
      if (totalRevenue > 0) {
        const sorted = [...prodRes.data].sort(
          (a: any, b: any) => (revenueMap[b.id] ?? 0) - (revenueMap[a.id] ?? 0)
        );
        let cumulative = 0;
        for (const p of sorted) {
          const rev = revenueMap[p.id] ?? 0;
          if (rev === 0) break;
          cumulative += rev;
          starSet.add(p.id);
          if (cumulative >= totalRevenue * 0.8) break;
        }
      }

      setRawProducts(
        prodRes.data.map((item: any) => ({
          id: item.id,
          name: item.name,
          category: item.category || '',
          sale_price: Number(item.sale_price),
          purchase_price: Number(item.purchase_price ?? 0),
          stock_quantity: Number(item.stock_quantity),
          image_url: item.image_url || undefined,
          isStar: starSet.has(item.id),
          isDormant: !recentSet.has(item.id),
          salesRevenue: revenueMap[item.id] ?? 0,
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  const enriched = useMemo<EnrichedProduct[]>(
    () => rawProducts.map(p => ({ ...p, stockLimit: stockLimits[p.id] ?? 5 })),
    [rawProducts, stockLimits]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return enriched;
    return enriched.filter(
      p => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)
    );
  }, [enriched, search]);

  // Header stats
  const totalStockValue = useMemo(
    () => enriched.reduce((s, p) => s + p.stock_quantity * p.sale_price, 0),
    [enriched]
  );
  const starCount = useMemo(() => enriched.filter(p => p.isStar).length, [enriched]);
  const lowStockCount = useMemo(
    () => enriched.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.stockLimit).length,
    [enriched]
  );
  const dormantCount = useMemo(() => enriched.filter(p => p.isDormant).length, [enriched]);

  function handleStockSaved(id: string, qty: number) {
    setRawProducts(prev => prev.map(p => (p.id === id ? { ...p, stock_quantity: qty } : p)));
  }

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[#f8fbff] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">

          {/* Page header */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-[#0056b3]/90">Inventaire</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#212529] md:text-3xl">Gestion des Stocks</h1>
                <p className="mt-1 text-sm text-[#212529]/60">
                  Suivez, analysez et optimisez votre inventaire en temps réel.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un produit..."
                  className="min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#0056b3] focus:bg-white"
                />
                <button
                  onClick={() => setShowAI(true)}
                  className="flex shrink-0 items-center gap-2 rounded-xl bg-[#0056b3] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#004494]"
                >
                  <Bot className="h-4 w-4" />
                  PilotAI
                </button>
              </div>
            </div>
          </div>

          {/* 4 horizontal stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100">
                <Package className="h-6 w-6 text-[#0056b3]" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-widest text-[#212529]/50">Vale Total Stock</p>
                <p className="mt-0.5 truncate text-xl font-bold text-[#212529]">{formatCurrency(totalStockValue)}</p>
                <p className="text-[10px] text-[#212529]/40">{enriched.length} produits</p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-100">
                <Star className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-[#212529]/50">Pwodwi Stars</p>
                <p className="mt-0.5 text-2xl font-bold text-[#212529]">{starCount}</p>
                <p className="text-[10px] text-[#212529]/40">Pareto 80/20</p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-[#212529]/50">Stock Ba</p>
                <p className="mt-0.5 text-2xl font-bold text-[#212529]">{lowStockCount}</p>
                <p className="text-[10px] text-[#212529]/40">Anba limite</p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
                <Moon className="h-6 w-6 text-slate-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-[#212529]/50">Dormants</p>
                <p className="mt-0.5 text-2xl font-bold text-[#212529]">{dormantCount}</p>
                <p className="text-[10px] text-[#212529]/40">30 dènye jou</p>
              </div>
            </div>
          </div>

          {/* Products table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-semibold text-[#212529]">Liste des Produits</h2>
              <p className="text-sm text-[#212529]/60">
                {enriched.length} produit{enriched.length !== 1 ? 's' : ''} en inventaire · Cliquez sur la limite pour la modifier
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-14 px-4 py-3">Image</th>
                    <th className="px-4 py-3">Produit</th>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3 text-right">Limite ✎</th>
                    <th className="px-4 py-3 text-right">Prix vente</th>
                    <th className="px-4 py-3 text-center">⭐</th>
                    <th className="px-4 py-3 text-center">Statut</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                        Chargement…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                        Aucun produit trouvé.
                      </td>
                    </tr>
                  ) : (
                    filtered.map(p => {
                      const isOut = p.stock_quantity === 0;
                      const isLow = !isOut && p.stock_quantity <= p.stockLimit;
                      return (
                        <tr key={p.id} className="transition-colors hover:bg-slate-50">
                          {/* Image */}
                          <td className="px-4 py-3">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="h-10 w-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[9px] font-bold uppercase text-slate-400">
                                IMG
                              </div>
                            )}
                          </td>

                          {/* Nom */}
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#212529]">{p.name}</p>
                          </td>

                          {/* Catégorie */}
                          <td className="px-4 py-3 text-slate-500">{p.category || '—'}</td>

                          {/* Stock */}
                          <td className="px-4 py-3 text-right font-semibold text-[#212529]">
                            {p.stock_quantity}
                          </td>

                          {/* Limite (editable inline) */}
                          <td className="px-4 py-3 text-right">
                            {editingLimit === p.id ? (
                              <input
                                type="number"
                                defaultValue={p.stockLimit}
                                min={0}
                                autoFocus
                                onBlur={e => {
                                  saveStockLimit(p.id, Math.max(0, Number(e.target.value)));
                                  setEditingLimit(null);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    saveStockLimit(
                                      p.id,
                                      Math.max(0, Number((e.target as HTMLInputElement).value))
                                    );
                                    setEditingLimit(null);
                                  }
                                  if (e.key === 'Escape') setEditingLimit(null);
                                }}
                                className="w-16 rounded border border-[#0056b3] px-1 py-0.5 text-right text-sm outline-none"
                              />
                            ) : (
                              <button
                                onClick={() => setEditingLimit(p.id)}
                                className="rounded px-2 py-0.5 text-slate-600 hover:bg-slate-100 hover:text-[#0056b3]"
                                title="Cliquer pour modifier"
                              >
                                {p.stockLimit}
                              </button>
                            )}
                          </td>

                          {/* Prix vente */}
                          <td className="px-4 py-3 text-right text-[#212529]">
                            {formatCurrency(p.sale_price)}
                          </td>

                          {/* Star */}
                          <td className="px-4 py-3 text-center">
                            {p.isStar ? (
                              <span title="Produit Star (Pareto 80/20)">⭐</span>
                            ) : (
                              <span className="text-slate-200">—</span>
                            )}
                          </td>

                          {/* Statut */}
                          <td className="px-4 py-3 text-center">
                            {isOut ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                Rupture
                              </span>
                            ) : isLow ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                Stock Ba
                              </span>
                            ) : p.isDormant ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                😴 Dormant
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                OK
                              </span>
                            )}
                          </td>

                          {/* Ajuster */}
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setAdjustProduct(p)}
                              className="rounded-lg bg-[#0056b3]/10 px-3 py-1.5 text-xs font-medium text-[#0056b3] transition-colors hover:bg-[#0056b3]/20"
                            >
                              Ajuster
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>

      {adjustProduct && (
        <AdjustmentModal
          product={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onSave={handleStockSaved}
        />
      )}

      {showAI && <PilotAIPanel products={enriched} onClose={() => setShowAI(false)} />}
    </ProtectedRoute>
  );
}
