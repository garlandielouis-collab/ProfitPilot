'use client';

import { useEffect, useState, useTransition } from 'react';
import { listOrders, updateOrderStatus, type OrderRow } from '../../actions/boutique';
import { Package } from 'lucide-react';

const STATUSES = [
  { value: 'all',       label: 'Toutes',       color: 'bg-slate-100 text-slate-700' },
  { value: 'pending',   label: 'En attente',   color: 'bg-amber-100 text-amber-700' },
  { value: 'confirmed', label: 'Confirmée',    color: 'bg-blue-100 text-blue-700' },
  { value: 'preparing', label: 'Préparation',  color: 'bg-indigo-100 text-indigo-700' },
  { value: 'shipped',   label: 'Expédiée',     color: 'bg-purple-100 text-purple-700' },
  { value: 'delivered', label: 'Livrée',       color: 'bg-emerald-100 text-emerald-700' },
  { value: 'cancelled', label: 'Annulée',      color: 'bg-red-100 text-red-700' },
  { value: 'refunded',  label: 'Remboursée',   color: 'bg-slate-100 text-slate-500' },
];

function statusInfo(s: string) { return STATUSES.find((x) => x.value === s) ?? STATUSES[0]; }
function fmt(n: number) { return new Intl.NumberFormat('fr-HT').format(n) + ' HTG'; }
function relDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function Spinner() { return <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#001F3F]" />; }

export default function CommandesPage() {
  const [orders,     setOrders]     = useState<OrderRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [status,     setStatus]     = useState('all');
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<OrderRow | null>(null);
  const [updating,   startUpdating] = useTransition();
  const [newStatus,  setNewStatus]  = useState('');
  const [tracking,   setTracking]   = useState('');
  // Confirmer une commande crée la vente et décrémente le stock : l'opération
  // peut légitimement refuser (stock devenu insuffisant, produit supprimé du
  // catalogue). Sans cet état, le marchand cliquait et rien ne se passait.
  const [updateError, setUpdateError] = useState('');

  function load(s: string, q: string) {
    setLoading(true);
    listOrders({ status: s !== 'all' ? s : undefined, search: q || undefined, limit: 50 })
      .then(({ orders: o, total: t }) => { setOrders(o); setTotal(t); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(status, search); }, []);

  function handleFilter(s: string) { setStatus(s); load(s, search); }
  function handleSearch(e: React.FormEvent) { e.preventDefault(); load(status, search); }

  function handleUpdateStatus() {
    if (!selected || !newStatus) return;
    setUpdateError('');
    startUpdating(async () => {
      try {
        await updateOrderStatus(selected.id, newStatus, tracking || undefined);
        setSelected(null);
        load(status, search);
      } catch (err) {
        // Le message vient du serveur et nomme le produit en cause
        // (« Stock insuffisant pour « Savon karité » : 2 en stock… ») : on le
        // montre tel quel, et la commande reste dans son statut précédent.
        setUpdateError(
          err instanceof Error ? err.message : "La mise à jour n'a pas abouti.",
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Commandes</h1>
          <p className="mt-1 text-sm text-slate-500">{total} commande{total !== 1 ? 's' : ''} au total</p>
        </div>
      </div>

      {/* Status filters */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map((s) => (
          <button key={s.value} onClick={() => handleFilter(s.value)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${status === s.value ? s.color + ' ring-2 ring-offset-1 ring-slate-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par numéro, nom, email…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary/40"
        />
        <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary-h">
          Rechercher
        </button>
      </form>

      {/* Table */}
      {loading ? (
        <div className="flex h-48 items-center justify-center"><Spinner /></div>
      ) : orders.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-slate-400">
          <Package className="mx-auto h-9 w-9 text-slate-300" strokeWidth={1.5} aria-hidden />
          <p className="mt-2 text-sm">Aucune commande trouvée.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-5 py-3 text-left">Commande</th>
                <th className="px-5 py-3 text-left">Client</th>
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Total</th>
                <th className="px-5 py-3 text-left">Statut</th>
                <th className="px-5 py-3 text-left">Paiement</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orders.map((order) => {
                const si = statusInfo(order.status);
                return (
                  <tr key={order.id} className="hover:bg-slate-50 transition cursor-pointer" onClick={() => { setSelected(order); setNewStatus(order.status); setTracking(order.tracking_number ?? ''); }}>
                    <td className="px-5 py-4 font-mono font-semibold text-slate-700">{order.order_number}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{order.customer_name}</p>
                      <p className="text-xs text-slate-400">{order.customer_email}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">{relDate(order.created_at)}</td>
                    <td className="px-5 py-4 font-bold text-slate-800">{fmt(order.total)}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${si.color}`}>{si.label}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${order.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {order.payment_status === 'paid' ? 'Payé' : 'Impayé'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg overflow-y-auto max-h-[90vh] rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-primary">Commande {selected.order_number}</h2>
                <p className="text-xs text-slate-500">{relDate(selected.created_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Customer */}
              <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1">
                <p><strong>Client :</strong> {selected.customer_name}</p>
                <p><strong>Email :</strong> {selected.customer_email}</p>
                {selected.customer_phone && <p><strong>Tél :</strong> {selected.customer_phone}</p>}
                {selected.shipping_address && (
                  <p><strong>Adresse :</strong> {(selected.shipping_address as any).line1}, {(selected.shipping_address as any).city}</p>
                )}
              </div>

              {/* Items */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Articles</p>
                {(selected.order_items ?? []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 text-sm border-b border-slate-100 last:border-0">
                    <span className="text-slate-700">{item.product_name} ×{item.quantity}</span>
                    <span className="font-bold text-slate-800">{fmt(item.total_price)}</span>
                  </div>
                ))}
                <div className="mt-3 flex justify-between text-sm font-bold text-slate-800 border-t border-slate-200 pt-3">
                  <span>Total</span>
                  <span>{fmt(selected.total)}</span>
                </div>
              </div>

              {/* Update status */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Changer le statut</p>
                <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                  {STATUSES.filter((s) => s.value !== 'all').map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {(newStatus === 'shipped' || newStatus === 'delivered') && (
                  <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" placeholder="Numéro de suivi (optionnel)" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                )}
                {updateError && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                    {updateError}
                  </p>
                )}
                <button onClick={handleUpdateStatus} disabled={updating}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary-h disabled:opacity-50">
                  {updating && <Spinner />}
                  Mettre à jour
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
