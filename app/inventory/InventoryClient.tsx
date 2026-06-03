'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  getInventory,
  adjustStock,
  setReorderPoint,
  getInventoryMovements,
  type InventoryProduct,
  type InventoryMovement,
} from '../actions/inventory';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  Clock,
  RefreshCw,
  Sliders,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Warehouse,
  X,
  ChevronRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtHTG(n: number) {
  return new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' HTG';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-HT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const movementConfig: Record<string, { label: string; Icon: any; color: string; bg: string }> = {
  sale_out:       { label: 'Vant',         Icon: ArrowDownRight, color: '#EF4444', bg: '#FEF2F2' },
  purchase_in:    { label: 'Acha',         Icon: ArrowUpRight,   color: '#12B981', bg: '#ECFDF5' },
  adjustment_in:  { label: 'Ajisteman +',  Icon: ArrowUpRight,   color: '#3B82F6', bg: '#EFF6FF' },
  adjustment_out: { label: 'Ajisteman -',  Icon: ArrowDownRight, color: '#F59E0B', bg: '#FFFBEB' },
};

function stockLabel(qty: number): { label: string; color: string; bg: string } {
  if (qty === 0) return { label: 'Epuize', color: '#EF4444', bg: '#FEF2F2' };
  if (qty <= 5)  return { label: 'FÃ¨b',   color: '#F59E0B', bg: '#FFFBEB' };
  return              { label: 'Bon',    color: '#12B981', bg: '#ECFDF5' };
}

const REASONS = [
  'Koreksyon envantÃ¨',
  'PÃ¨t / Domaj',
  'Retou pwodui',
  'Kont fizik',
  'LÃ²t rezon',
];

// â”€â”€ AdjustModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AdjustModalProps = {
  product: InventoryProduct;
  onClose: () => void;
  onSaved: () => void;
};

function AdjustModal({ product, onClose, onSaved }: AdjustModalProps) {
  const [newQty, setNewQty] = useState(product.stock_quantity);
  const [reason, setReason] = useState(REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [reorderPt, setReorderPt] = useState(product.reorder_point ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const diff = newQty - product.stock_quantity;
  const isCustom = reason === 'LÃ²t rezon';
  const finalReason = isCustom ? customReason : reason;

  async function handleSave() {
    if (newQty < 0) { setError('Kantite pa ka negatif.'); return; }
    if (!finalReason.trim()) { setError('Rezon obligatwa.'); return; }
    setSaving(true);
    setError('');
    try {
      await adjustStock({ product_id: product.id, new_quantity: newQty, reason: finalReason });
      await setReorderPoint(product.id, reorderPt);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'ErÃ¨');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Ajiste Stock</h2>
            <p className="text-sm text-slate-500 truncate max-w-xs">{product.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          {/* Current qty display */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
            <span className="text-sm text-slate-600">Stock AktyÃ¨l</span>
            <span className="text-2xl font-semibold text-slate-800">{product.stock_quantity}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nouvo Kantite *</label>
            <input
              type="number"
              min="0"
              value={newQty}
              onChange={e => setNewQty(parseInt(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 transition"
            />
            {diff !== 0 && (
              <p className={`mt-1.5 text-xs font-medium ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {diff > 0 ? `+${diff}` : diff} inite pa rapÃ² ak stock aktyÃ¨l
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Rezon</label>
            <div className="grid grid-cols-1 gap-2">
              {REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`text-left rounded-xl border px-4 py-2.5 text-sm transition ${
                    reason === r
                      ? 'border-[#001F3F] bg-emerald-50 text-emerald-700 font-medium'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {isCustom && (
              <input
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="Ekri rezon ou a..."
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 transition"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Pwen ReÃ²d (alÃ¨t stock fÃ¨b)</label>
            <input
              type="number"
              min="0"
              value={reorderPt}
              onChange={e => setReorderPt(parseInt(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 transition"
            />
            <p className="mt-1 text-xs text-slate-500">Ou pral resevwa alÃ¨t lÃ¨ stock tonbe anba nivo sa a.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Anile
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-[#001F3F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#002D5B] disabled:opacity-60 transition"
            >
              {saving ? 'Sove...' : 'Sove Ajisteman'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// â”€â”€ main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function InventoryClient({
  initialInventory,
  initialMovements,
}: {
  initialInventory: InventoryProduct[];
  initialMovements: InventoryMovement[];
}) {
  const [inventory, setInventory] = useState<InventoryProduct[]>(initialInventory);
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements);
  const [loading,    setLoading]   = useState(false);
  const [movLoading, setMovLoading] = useState(false);
  const [error,      setError]     = useState('');
  const [tab,        setTab]       = useState<'stock' | 'history'>('stock');
  const [adjustProduct, setAdjustProduct] = useState<InventoryProduct | null>(null);
  const [topSold, setTopSold] = useState<Array<{ name: string; qty: number; revenue: number }>>([]);

  // Fetch top products by quantity sold from sale_items
  useEffect(() => {
    supabase
      .from('sale_items')
      .select('product_name, quantity, line_total')
      .then(({ data }: any) => {
        if (!data?.length) return;
        const map: Record<string, { qty: number; revenue: number }> = {};
        for (const r of data) {
          const k = r.product_name ?? 'â€”';
          if (!map[k]) map[k] = { qty: 0, revenue: 0 };
          map[k].qty     += Number(r.quantity ?? 0);
          map[k].revenue += Number(r.line_total ?? 0);
        }
        setTopSold(
          Object.entries(map)
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 8)
            .map(r => ({ ...r, name: r.name.length > 14 ? r.name.slice(0, 14) + 'â€¦' : r.name }))
        );
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getInventory();
      setInventory(data);
    } catch (err: any) {
      setError(err.message ?? 'ErÃ¨ chajman.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMovements = useCallback(async () => {
    setMovLoading(true);
    try {
      const data = await getInventoryMovements(50);
      setMovements(data);
    } catch {
      // silent
    } finally {
      setMovLoading(false);
    }
  }, []);

  // KPIs
  const totalProducts = inventory.length;
  const totalValue = inventory.reduce((s, p) => s + p.purchase_price * p.stock_quantity, 0);
  const lowStockCount = inventory.filter(p => p.alert_active).length;
  const outOfStockCount = inventory.filter(p => p.stock_quantity === 0).length;

  // Health score
  const healthScore = Math.max(0, 100 - outOfStockCount * 15 - lowStockCount * 5);
  const healthColor = healthScore > 75 ? '#12B981' : healthScore > 50 ? '#F59E0B' : '#EF4444';
  const healthLabel = healthScore > 75 ? 'Bon' : healthScore > 50 ? 'Mwayen' : 'Kritik';
  const healthMsg = healthScore > 75
    ? 'EnvantÃ¨ ou an bon sante. Kontinye monitore stock yo.'
    : healthScore > 50
    ? `${lowStockCount} pwodui fÃ¨b. Konsidere rekÃ²mande yo.'`
    : `Atansyon! ${outOfStockCount} pwodui epuize ak ${lowStockCount} ki fÃ¨b. Aksyon ijan nesesÃ¨.`;

  // Chart data
  const topByQty = topSold.map(p => ({ name: p.name, qty: p.qty }));

  const topByValue = [...inventory]
    .sort((a, b) => b.purchase_price * b.stock_quantity - a.purchase_price * a.stock_quantity)
    .slice(0, 8)
    .map(p => ({ name: p.name.length > 12 ? p.name.slice(0, 12) + 'â€¦' : p.name, val: p.purchase_price * p.stock_quantity }));

  const kpis = [
    { label: 'Total Pwodui', value: totalProducts.toString(), icon: Package, color: '#12B981', bg: '#ECFDF5' },
    { label: 'ValÃ¨ Stock', value: fmtHTG(totalValue), icon: Warehouse, color: '#3B82F6', bg: '#EFF6FF' },
    { label: 'Stock FÃ¨b', value: lowStockCount.toString(), icon: TrendingDown, color: '#F59E0B', bg: '#FFFBEB' },
    { label: 'Epuize', value: outOfStockCount.toString(), icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Jesyon EnvantÃ¨</h1>
            <p className="mt-1 text-sm text-slate-500">Swiv stock, mouvman ak alÃ¨t pwodui ou yo.</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Rafraichi
          </motion.button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-3 text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl bg-white border border-slate-200 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.label}</span>
                <div className="rounded-lg p-2" style={{ background: k.bg }}>
                  <k.icon size={16} style={{ color: k.color }} />
                </div>
              </div>
              <p className="text-2xl font-semibold text-slate-800">{loading ? 'â€”' : k.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Health Score */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-white border border-slate-200 p-6"
        >
          <div className="flex items-start gap-6">
            <div className="flex flex-col items-center justify-center shrink-0">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
                style={{ background: healthColor }}
              >
                {loading ? 'â€”' : healthScore}
              </div>
              <span className="mt-2 text-xs font-semibold" style={{ color: healthColor }}>{healthLabel}</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800 mb-1">Sante EnvantÃ¨</h3>
              <p className="text-sm text-slate-600 mb-3">{healthMsg}</p>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: healthColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${healthScore}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
          <button
            onClick={() => setTab('stock')}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition ${
              tab === 'stock' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Package size={15} />
            Stock
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition ${
              tab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History size={15} />
            Istorik Mouvman
          </button>
        </div>

        <AnimatePresence mode="wait">
          {tab === 'stock' ? (
            <motion.div
              key="stock"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-5"
            >
              {/* Low stock alert banner */}
              {lowStockCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-3 flex items-center gap-3"
                >
                  <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-800">
                    <span className="font-semibold">{lowStockCount} pwodui</span> gen stock fÃ¨b epi bezwen atansyon.
                  </p>
                </motion.div>
              )}

              {/* Charts row */}
              {!loading && inventory.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Top by sales qty */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
                      <BarChart3 size={16} className="text-[#001F3F]" />
                      Top Pwodui â€” Pi Plis Vann
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Pa kantite inite vann (tout tan)</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={topByQty.length ? topByQty : [{ name: 'Okenn done', qty: 0 }]} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}
                          formatter={(v: any) => [`${v} inite`, 'Vann']}
                        />
                        <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                          {topByQty.map((_, idx) => (
                            <Cell key={idx} fill={idx === 0 ? '#12B981' : '#A7F3D0'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Top by value */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <TrendingUp size={16} className="text-[#3B82F6]" />
                      Top Pwodui pa ValÃ¨
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={topByValue} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}
                          formatter={(v: any) => [fmtHTG(v), 'ValÃ¨']}
                        />
                        <Bar dataKey="val" radius={[6, 6, 0, 0]}>
                          {topByValue.map((_, idx) => (
                            <Cell key={idx} fill={idx === 0 ? '#3B82F6' : '#BFDBFE'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Stock table */}
              <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                {loading ? (
                  <div className="p-8 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                ) : inventory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Package size={36} className="text-slate-300 mb-3" />
                    <p className="text-slate-500 text-sm">Pa gen pwodui nan envantÃ¨.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          {['Pwodui', 'Kategori', 'Stock', 'Pwen ReÃ²d', 'ValÃ¨', 'Estati', 'Aksyon'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {inventory.map((p, i) => {
                          const sl = stockStatus(p);
                          const val = p.purchase_price * p.stock_quantity;
                          return (
                            <motion.tr
                              key={p.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.02 }}
                              className={`hover:bg-slate-50 transition-colors ${p.alert_active ? 'bg-amber-50/40' : ''}`}
                            >
                              <td className="px-4 py-3 font-medium text-slate-800 max-w-[160px]">
                                <div className="flex items-center gap-2">
                                  {p.alert_active && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                                  <span className="truncate">{p.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{p.category ?? 'â€”'}</td>
                              <td className="px-4 py-3 font-semibold" style={{ color: sl.color }}>
                                {p.stock_quantity}
                              </td>
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                                {p.reorder_point !== null ? p.reorder_point : 'â€”'}
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{fmtHTG(val)}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                                  style={{ background: sl.bg, color: sl.color }}
                                >
                                  {sl.label}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => setAdjustProduct(p)}
                                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition whitespace-nowrap"
                                >
                                  <Sliders size={12} />
                                  Ajiste
                                </button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-3"
            >
              {movLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-2xl bg-white border border-slate-200 animate-pulse" />
                  ))}
                </div>
              ) : movements.length === 0 ? (
                <div className="rounded-2xl bg-white border border-slate-200 flex flex-col items-center justify-center py-16 text-center">
                  <Clock size={36} className="text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm">Pa gen istorik mouvman ankÃ².</p>
                </div>
              ) : (
                movements.map((m, i) => {
                  const cfg = movementConfig[m.movement_type] ?? movementConfig['adjustment_in'];
                  const { Icon } = cfg;
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="rounded-2xl bg-white border border-slate-200 px-5 py-4 flex items-center gap-4"
                    >
                      <div className="rounded-xl p-2.5 shrink-0" style={{ background: cfg.bg }}>
                        <Icon size={18} style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{ background: cfg.bg, color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                          <span className="font-medium text-sm text-slate-800 truncate">{m.product_name}</span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{m.notes ?? 'â€”'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" style={{ color: cfg.color }}>
                          {m.movement_type.includes('out') ? '-' : '+'}{m.quantity}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{fmtDate(m.created_at)}</p>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Adjust Modal */}
      <AnimatePresence>
        {adjustProduct && (
          <AdjustModal
            product={adjustProduct}
            onClose={() => setAdjustProduct(null)}
            onSaved={load}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function stockStatus(p: InventoryProduct): { label: string; color: string; bg: string } {
  if (p.stock_quantity === 0) return { label: 'Epuize', color: '#EF4444', bg: '#FEF2F2' };
  if (p.alert_active || p.stock_quantity <= 5) return { label: 'FÃ¨b', color: '#F59E0B', bg: '#FFFBEB' };
  return { label: 'Bon', color: '#12B981', bg: '#ECFDF5' };
}

// InventoryClient is the named export used by page.tsx

