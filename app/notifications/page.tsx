'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getNotifPreferences,
  setNotifPreference,
  type Notification,
  type NotifPreference,
} from '../actions/notifications';

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  sale_created:        { icon: '🛍️',  label: 'Nouvelle vente',          color: 'bg-emerald-100 text-emerald-700' },
  invoice_paid:        { icon: '✅',  label: 'Facture payée',            color: 'bg-green-100 text-green-700' },
  stock_low:           { icon: '⚠️',  label: 'Stock faible',             color: 'bg-amber-100 text-amber-700' },
  expense_created:     { icon: '💸',  label: 'Nouvelle dépense',         color: 'bg-red-100 text-red-700' },
  purchase_created:    { icon: '📦',  label: 'Nouvel achat',             color: 'bg-blue-100 text-blue-700' },
  client_created:      { icon: '👤',  label: 'Nouveau client',           color: 'bg-purple-100 text-purple-700' },
  employee_created:    { icon: '👷',  label: 'Nouvel employé',           color: 'bg-indigo-100 text-indigo-700' },
  invitation_accepted: { icon: '🎉',  label: 'Invitation acceptée',      color: 'bg-pink-100 text-pink-700' },
  company_created:     { icon: '🏢',  label: 'Nouvelle entreprise',      color: 'bg-slate-100 text-slate-700' },
  generic:             { icon: '🔔',  label: 'Notification',             color: 'bg-slate-100 text-slate-600' },
};

const ALL_PREF_TYPES = Object.entries(TYPE_CONFIG).map(([type, cfg]) => ({ type, ...cfg }));

function cfg(type: string) { return TYPE_CONFIG[type] ?? TYPE_CONFIG.generic; }

function relDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)     return 'À l\'instant';
  if (diff < 3600)   return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400)  return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [tab, setTab]           = useState<'feed' | 'preferences'>('feed');
  const [notifs, setNotifs]     = useState<Notification[]>([]);
  const [prefs, setPrefs]       = useState<NotifPreference[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | 'unread'>('all');
  const [offset, setOffset]     = useState(0);
  const [hasMore, setHasMore]   = useState(false);
  const LIMIT = 30;

  const loadNotifs = useCallback(async (newOffset = 0, unreadOnly = filter === 'unread') => {
    setLoading(true);
    const data = await listNotifications({ limit: LIMIT + 1, offset: newOffset, unreadOnly });
    setHasMore(data.length > LIMIT);
    setNotifs(data.slice(0, LIMIT));
    setOffset(newOffset);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadNotifs(0); }, [loadNotifs]);

  useEffect(() => {
    if (tab === 'preferences') {
      getNotifPreferences().then(setPrefs);
    }
  }, [tab]);

  async function handleMarkRead(id: string) {
    await markAsRead(id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
  }

  async function handleMarkAll() {
    await markAllAsRead();
    setNotifs(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }

  async function handleTogglePref(type: string, enabled: boolean) {
    await setNotifPreference(type, enabled);
    setPrefs(prev => {
      const existing = prev.find(p => p.type === type);
      if (existing) return prev.map(p => p.type === type ? { ...p, enabled } : p);
      return [...prev, { type, enabled }];
    });
  }

  function isPrefEnabled(type: string): boolean {
    const p = prefs.find(p => p.type === type);
    return p ? p.enabled : true; // default enabled
  }

  const unreadCount = notifs.filter(n => !n.readAt).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#001F3F] text-lg text-white">
              🔔
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Notifications</h1>
              <p className="text-sm text-slate-500">Centre de notifications en temps réel</p>
            </div>
          </div>
          {tab === 'feed' && unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Tout marquer lu
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {[
            { key: 'feed',        label: 'Flux' },
            { key: 'preferences', label: 'Préférences' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                tab === key
                  ? 'bg-[#001F3F] text-white'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Feed tab */}
        {tab === 'feed' && (
          <>
            {/* Filter */}
            <div className="flex gap-2">
              {(['all', 'unread'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); loadNotifs(0, f === 'unread'); }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    filter === f
                      ? 'bg-[#001F3F] text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f === 'all' ? 'Toutes' : `Non lues${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" />
                </div>
              ) : notifs.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-4xl">🔔</p>
                  <p className="mt-3 text-sm font-medium text-slate-500">Aucune notification</p>
                  <p className="text-xs text-slate-400">
                    {filter === 'unread' ? 'Tout est lu !' : 'Les notifications apparaîtront ici.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifs.map((n) => {
                    const c = cfg(n.type);
                    return (
                      <div
                        key={n.id}
                        onClick={() => !n.readAt && handleMarkRead(n.id)}
                        className={`flex cursor-pointer items-start gap-4 px-5 py-4 transition hover:bg-slate-50 ${
                          !n.readAt ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        {/* Icon */}
                        <span className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg ${c.color}`}>
                          {c.icon}
                        </span>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm leading-snug ${n.readAt ? 'font-medium text-slate-600' : 'font-bold text-slate-800'}`}>
                              {n.title}
                            </p>
                            <span className="flex-shrink-0 text-[11px] text-slate-400">{relDate(n.createdAt)}</span>
                          </div>
                          {n.body && (
                            <p className="mt-0.5 text-xs text-slate-400 leading-snug">{n.body}</p>
                          )}
                          <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.color}`}>
                            {c.icon} {c.label}
                          </span>
                        </div>

                        {/* Unread dot */}
                        {!n.readAt && (
                          <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {(offset > 0 || hasMore) && (
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                  <button
                    onClick={() => loadNotifs(Math.max(0, offset - LIMIT))}
                    disabled={offset === 0 || loading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    ← Précédent
                  </button>
                  <button
                    onClick={() => loadNotifs(offset + LIMIT)}
                    disabled={!hasMore || loading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Suivant →
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Preferences tab */}
        {tab === 'preferences' && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-bold text-slate-800">Types de notifications</p>
              <p className="text-xs text-slate-500 mt-0.5">Activez ou désactivez chaque type de notification</p>
            </div>
            <div className="divide-y divide-slate-100">
              {ALL_PREF_TYPES.map(({ type, icon, label, color }) => {
                const enabled = isPrefEnabled(type);
                return (
                  <div key={type} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-base ${color}`}>
                        {icon}
                      </span>
                      <span className="text-sm font-medium text-slate-700">{label}</span>
                    </div>

                    {/* Toggle */}
                    <button
                      onClick={() => handleTogglePref(type, !enabled)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        enabled ? 'bg-[#001F3F]' : 'bg-slate-200'
                      }`}
                      role="switch"
                      aria-checked={enabled}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        enabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
