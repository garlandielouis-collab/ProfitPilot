'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { listActivityLogs, type ActivityLog } from '../../lib/activityLog';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIONS = ['create','update','delete','archive','restore','duplicate','switch','pay','confirm','invite'] as const;
const ENTITIES = ['sale','product','client','expense','purchase','supplier','employee','company','store','order','role','invitation','payment','debt'] as const;

const ACTION_CFG: Record<string, { label: string; color: string }> = {
  create:    { label: 'Créé',      color: 'bg-emerald-100 text-emerald-700' },
  update:    { label: 'Modifié',   color: 'bg-blue-100    text-blue-700'    },
  delete:    { label: 'Supprimé',  color: 'bg-red-100     text-red-700'     },
  archive:   { label: 'Archivé',   color: 'bg-amber-100   text-amber-700'   },
  restore:   { label: 'Restauré',  color: 'bg-teal-100    text-teal-700'    },
  duplicate: { label: 'Dupliqué',  color: 'bg-purple-100  text-purple-700'  },
  switch:    { label: 'Switché',   color: 'bg-indigo-100  text-indigo-700'  },
  pay:       { label: 'Payé',      color: 'bg-emerald-100 text-emerald-700' },
  confirm:   { label: 'Confirmé',  color: 'bg-emerald-100 text-emerald-700' },
  invite:    { label: 'Invité',    color: 'bg-violet-100  text-violet-700'  },
};

const ENTITY_ICON: Record<string, string> = {
  sale: '🧾', product: '📦', client: '👤', expense: '💸',
  purchase: '🛒', supplier: '🚚', employee: '👷', company: '🏢',
  store: '🏪', order: '📬', role: '🛡️', invitation: '📧',
  payment: '💳', debt: '⚠️',
};

const ENTITY_LABEL: Record<string, string> = {
  sale: 'Vente', product: 'Produit', client: 'Client', expense: 'Dépense',
  purchase: 'Achat', supplier: 'Fournisseur', employee: 'Employé', company: 'Entreprise',
  store: 'Boutique', order: 'Commande', role: 'Rôle', invitation: 'Invitation',
  payment: 'Paiement', debt: 'Dette',
};

function relDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000)     return 'il y a quelques secondes';
  if (diff < 3_600_000)  return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" />;
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function LogDetailModal({ log, onClose }: { log: ActivityLog; onClose: () => void }) {
  const ac = ACTION_CFG[log.action] ?? { label: log.action, color: 'bg-slate-100 text-slate-600' };

  function JsonBlock({ value }: { value: any }) {
    if (!value) return <span className="text-slate-400 text-xs">—</span>;
    return (
      <pre className="overflow-x-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700 leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{ENTITY_ICON[log.entity] ?? '📋'}</span>
            <div>
              <h2 className="font-bold text-[#001F3F]">{ENTITY_LABEL[log.entity] ?? log.entity}</h2>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${ac.color}`}>
                {ac.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Utilisateur</p>
              <p className="mt-1 font-medium text-slate-700 truncate">{log.userEmail ?? log.userId}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Date</p>
              <p className="mt-1 text-slate-700">{new Date(log.createdAt).toLocaleString('fr-FR')}</p>
            </div>
            {log.entityId && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Référence</p>
                <p className="mt-1 font-mono text-slate-700 text-xs">{log.entityId}</p>
              </div>
            )}
            {log.ip && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">IP</p>
                <p className="mt-1 font-mono text-slate-700 text-xs">{log.ip}</p>
              </div>
            )}
          </div>
          {log.userAgent && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">User Agent</p>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 break-all">{log.userAgent}</p>
            </div>
          )}
          {log.oldValues && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Avant</p>
              <JsonBlock value={log.oldValues} />
            </div>
          )}
          {log.newValues && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Après</p>
              <JsonBlock value={log.newValues} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

export default function ActivityPage() {
  const [logs,     setLogs]     = useState<ActivityLog[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<ActivityLog | null>(null);
  const [offset,   setOffset]   = useState(0);

  const [search,   setSearch]   = useState('');
  const [action,   setAction]   = useState('');
  const [entity,   setEntity]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const [, startPending] = useTransition();

  const load = useCallback((off: number, s: string, a: string, e: string, df: string, dt: string) => {
    setLoading(true);
    startPending(async () => {
      const { logs: data, total: t } = await listActivityLogs({
        search:   s  || undefined,
        action:   a  || undefined,
        entity:   e  || undefined,
        dateFrom: df || undefined,
        dateTo:   dt || undefined,
        limit:    PAGE_SIZE,
        offset:   off,
      });
      setLogs(data);
      setTotal(t);
      setOffset(off);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(0, '', '', '', '', ''); }, [load]);

  function handleSearch(ev: React.FormEvent) {
    ev.preventDefault();
    load(0, search, action, entity, dateFrom, dateTo);
  }

  function handleReset() {
    setSearch(''); setAction(''); setEntity(''); setDateFrom(''); setDateTo('');
    load(0, '', '', '', '', '');
  }

  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {selected && <LogDetailModal log={selected} onClose={() => setSelected(null)} />}

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#001F3F]">Journal d'activité</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total.toLocaleString('fr-FR')} événement{total !== 1 ? 's' : ''} enregistré{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-[#001F3F]/40 focus:bg-white lg:col-span-2"
          />
          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-[#001F3F]/40">
            <option value="">Toutes les actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_CFG[a]?.label ?? a}</option>
            ))}
          </select>
          <select value={entity} onChange={(e) => setEntity(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-[#001F3F]/40">
            <option value="">Toutes les entités</option>
            {ENTITIES.map((en) => (
              <option key={en} value={en}>{ENTITY_ICON[en]} {ENTITY_LABEL[en]}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="submit"
              className="flex flex-1 items-center justify-center rounded-xl bg-[#001F3F] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#002D5B]">
              Filtrer
            </button>
            <button type="button" onClick={handleReset}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">
              Reset
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Du</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#001F3F]/40" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Au</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#001F3F]/40" />
          </div>
        </div>
      </form>

      {/* List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center"><Spinner /></div>
      ) : logs.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-slate-400">
          <p className="text-3xl">📋</p>
          <p className="mt-2 text-sm">Aucun événement trouvé.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-5 py-3 text-left">Quand</th>
                <th className="px-5 py-3 text-left">Utilisateur</th>
                <th className="px-5 py-3 text-left">Action</th>
                <th className="px-5 py-3 text-left">Entité</th>
                <th className="px-5 py-3 text-left">Référence</th>
                <th className="px-5 py-3 text-left">IP</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((log) => {
                const ac = ACTION_CFG[log.action] ?? { label: log.action, color: 'bg-slate-100 text-slate-600' };
                return (
                  <tr key={log.id} onClick={() => setSelected(log)}
                    className="cursor-pointer transition hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                      {relDate(log.createdAt)}
                    </td>
                    <td className="max-w-[180px] px-5 py-3.5">
                      <p className="truncate text-xs font-medium text-slate-700">
                        {log.userEmail ?? log.userId.slice(0, 8) + '…'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${ac.color}`}>
                        {ac.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <span>{ENTITY_ICON[log.entity] ?? '📋'}</span>
                        <span className="text-xs">{ENTITY_LABEL[log.entity] ?? log.entity}</span>
                      </span>
                    </td>
                    <td className="max-w-[140px] px-5 py-3.5 font-mono text-[11px] text-slate-500">
                      <span className="block truncate">{log.entityId ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                      {log.ip ?? '—'}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <svg className="h-4 w-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <p className="text-xs text-slate-500">
                Page {currentPage} / {totalPages} · {total} événements
              </p>
              <div className="flex gap-2">
                <button disabled={currentPage <= 1}
                  onClick={() => load(offset - PAGE_SIZE, search, action, entity, dateFrom, dateTo)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-30">
                  ← Précédent
                </button>
                <button disabled={currentPage >= totalPages}
                  onClick={() => load(offset + PAGE_SIZE, search, action, entity, dateFrom, dateTo)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-30">
                  Suivant →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
