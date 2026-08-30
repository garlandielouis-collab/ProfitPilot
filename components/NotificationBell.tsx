'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  type Notification,
} from '../app/actions/notifications';
// Le même jeu d'icônes que l'écran /notifications : la cloche et sa liste ne
// peuvent pas montrer deux dessins différents pour un même événement (§3.4).
import {
  AlertTriangle, Bell, Building2, CheckCircle2, MailCheck, Receipt,
  ShoppingBag, ShoppingCart, UserCog, Users,
  type LucideIcon,
} from 'lucide-react';

// ── Config ────────────────────────────────────────────────────────────────────

// Un seul ton par nature d'événement, comme sur l'écran complet : ambre pour
// le stock qui s'épuise, vert pour l'argent encaissé, gris pour le reste. Dix
// fonds colorés dans une liste de dix lignes ne hiérarchisent rien (§4.2).
const TYPE_CONFIG: Record<string, { icon: LucideIcon; color: string }> = {
  sale_created:        { icon: ShoppingCart, color: 'bg-surface2 text-muted' },
  invoice_paid:        { icon: CheckCircle2, color: 'bg-success-sub text-success' },
  stock_low:           { icon: AlertTriangle, color: 'bg-warning-sub text-warning' },
  expense_created:     { icon: Receipt,      color: 'bg-surface2 text-muted' },
  purchase_created:    { icon: ShoppingBag,  color: 'bg-surface2 text-muted' },
  client_created:      { icon: Users,        color: 'bg-surface2 text-muted' },
  employee_created:    { icon: UserCog,      color: 'bg-surface2 text-muted' },
  invitation_accepted: { icon: MailCheck,    color: 'bg-surface2 text-muted' },
  company_created:     { icon: Building2,    color: 'bg-surface2 text-muted' },
  generic:             { icon: Bell,         color: 'bg-surface2 text-muted' },
};

function relDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen]             = useState(false);
  const [notifs, setNotifs]         = useState<Notification[]>([]);
  const [unread, setUnread]         = useState(0);
  const [loading, setLoading]       = useState(false);
  const [userId, setUserId]         = useState<string | null>(null);
  const dropdownRef                 = useRef<HTMLDivElement>(null);

  // Fetch on open
  const loadNotifs = useCallback(async () => {
    setLoading(true);
    const data = await listNotifications({ limit: 20 });
    setNotifs(data);
    setUnread(data.filter(n => !n.readAt).length);
    setLoading(false);
  }, []);

  // Initial unread count
  useEffect(() => {
    getUnreadCount().then(setUnread);
    supabase.auth.getUser().then(({ data }: any) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifs:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const n = payload.new as any;
          const newNotif: Notification = {
            id: n.id, companyId: n.company_id, type: n.type,
            title: n.title, body: n.body ?? null,
            entity: n.entity ?? null, entityId: n.entity_id ?? null,
            data: n.data ?? null, readAt: n.read_at ?? null,
            createdAt: n.created_at, triggeredBy: n.triggered_by ?? null,
          };
          setNotifs(prev => [newNotif, ...prev].slice(0, 20));
          setUnread(prev => prev + 1);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleOpen() {
    if (!open) {
      setOpen(true);
      await loadNotifs();
    } else {
      setOpen(false);
    }
  }

  async function handleMarkRead(id: string) {
    await markAsRead(id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    setUnread(prev => Math.max(0, prev - 1));
  }

  async function handleMarkAll() {
    await markAllAsRead();
    setNotifs(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }

  const cfg = (type: string) => TYPE_CONFIG[type] ?? TYPE_CONFIG.generic;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/5"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-note font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-dark-surface">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800 dark:text-white">Notifications</span>
              {unread > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-note font-bold text-red-600">
                  {unread} non lue{unread > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-note font-semibold text-primary hover:underline dark:text-slate-300"
                >
                  Tout lire
                </button>
              )}
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-note text-slate-400 hover:text-slate-600"
              >
                Voir tout →
              </Link>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F]" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="mx-auto h-6 w-6 text-slate-300" strokeWidth={1.8} aria-hidden />
                <p className="mt-2 text-sm text-slate-400">Aucune notification</p>
              </div>
            ) : (
              notifs.map((n) => {
                const c = cfg(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleMarkRead(n.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                      !n.readAt ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    {/* Icon */}
                    <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${c.color}`}>
                      <c.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-xs leading-snug ${n.readAt ? 'font-medium text-slate-600 dark:text-slate-400' : 'font-bold text-slate-800 dark:text-white'}`}>
                          {n.title}
                        </p>
                        <span className="flex-shrink-0 text-note text-slate-400">{relDate(n.createdAt)}</span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-note text-slate-400 leading-snug line-clamp-2">{n.body}</p>
                      )}
                    </div>

                    {/* Unread dot */}
                    {!n.readAt && (
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
