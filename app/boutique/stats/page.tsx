'use client';

import { useEffect, useState } from 'react';
import { getStoreStats, type StoreStats } from '../../actions/boutique';

function fmt(n: number) { return new Intl.NumberFormat('fr-HT').format(Math.round(n)) + ' HTG'; }
function Spinner() { return <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" />; }

const STATUS_LABELS: Record<string, string> = {
  pending:   'En attente',
  confirmed: 'Confirmées',
  preparing: 'Préparation',
  shipped:   'Expédiées',
  delivered: 'Livrées',
  cancelled: 'Annulées',
  refunded:  'Remboursées',
};

const STATUS_COLORS: Record<string, string> = {
  pending:   '#f59e0b',
  confirmed: '#3b82f6',
  preparing: '#6366f1',
  shipped:   '#8b5cf6',
  delivered: '#10b981',
  cancelled: '#ef4444',
  refunded:  '#94a3b8',
};

export default function StatsPage() {
  const [stats,   setStats]   = useState<StoreStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);

  function load(d: number) {
    setLoading(true);
    getStoreStats(d).then(setStats).finally(() => setLoading(false));
  }

  useEffect(() => { load(days); }, []);

  const maxRevenue = Math.max(...(stats?.revenueByDay.map((d) => d.total) ?? [1]), 1);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#001F3F]">Statistiques Boutique</h1>
          <p className="mt-1 text-sm text-slate-500">Performances de votre boutique en ligne</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => { setDays(d); load(d); }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${days === d ? 'bg-[#001F3F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {d}j
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center"><Spinner /></div>
      ) : !stats ? null : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Chiffre d\'affaires', value: fmt(stats.totalRevenue), icon: '💰', sub: `${days} derniers jours` },
              { label: 'Commandes',           value: String(stats.totalOrders), icon: '📦', sub: `dont ${stats.pendingOrders} en attente` },
              { label: 'Panier moyen',        value: fmt(stats.avgOrderValue), icon: '🛒', sub: 'par commande' },
              { label: 'Taux de conversion',  value: `—`,                      icon: '📈', sub: 'Bientôt disponible' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{kpi.label}</p>
                  <span className="text-xl">{kpi.icon}</span>
                </div>
                <p className="mt-2 text-2xl font-extrabold text-[#001F3F]">{kpi.value}</p>
                <p className="mt-1 text-xs text-slate-400">{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Revenue chart */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-bold text-slate-800">Chiffre d'affaires par jour</h2>
              {stats.revenueByDay.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-slate-400 text-sm">Aucune donnée</div>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {stats.revenueByDay.slice(-30).map((d) => {
                    const h = Math.max(4, (d.total / maxRevenue) * 100);
                    return (
                      <div key={d.date} className="group relative flex-1 flex flex-col items-center">
                        <div
                          className="w-full rounded-t-sm transition"
                          style={{ height: `${h}%`, backgroundColor: '#001F3F', opacity: 0.7 }}
                          title={`${d.date}: ${fmt(d.total)}`}
                        />
                        <div className="absolute bottom-full mb-1 hidden rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-white group-hover:block whitespace-nowrap">
                          {d.date}<br />{fmt(d.total)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status breakdown */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-bold text-slate-800">Répartition des commandes</h2>
              {Object.keys(stats.statusBreakdown).length === 0 ? (
                <div className="flex h-32 items-center justify-center text-slate-400 text-sm">Aucune donnée</div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.statusBreakdown).map(([s, count]) => {
                    const totalCount = Object.values(stats.statusBreakdown).reduce((a, b) => a + b, 0);
                    const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                    return (
                      <div key={s}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="font-medium text-slate-700">{STATUS_LABELS[s] ?? s}</span>
                          <span className="text-slate-500">{count} ({Math.round(pct)}%)</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[s] ?? '#94a3b8' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top products */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold text-slate-800">🏆 Top 5 produits</h2>
            {stats.topProducts.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-slate-400 text-sm">Aucune vente enregistrée</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="pb-3 text-left">#</th>
                      <th className="pb-3 text-left">Produit</th>
                      <th className="pb-3 text-right">Qté vendue</th>
                      <th className="pb-3 text-right">Revenu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {stats.topProducts.map((p, i) => (
                      <tr key={p.name}>
                        <td className="py-3 pr-4 text-slate-400 font-bold">{i + 1}</td>
                        <td className="py-3 font-medium text-slate-800">{p.name}</td>
                        <td className="py-3 text-right text-slate-600">{p.qty}</td>
                        <td className="py-3 text-right font-bold text-[#001F3F]">{fmt(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
