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

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  sale_created:        { icon: '🛍️',  color: 'bg-emerald-100 text-emerald-700' },
  invoice_paid:        { icon: '✅',  color: 'bg-green-100 text-green-700' },
  stock_low:           { icon: '⚠️',  color: 'bg-amber-100 text-amber-700' },
  expense_created:     { icon: '💸',  color: 'bg-red-100 text-red-700' },
  purchase_created:    { icon: '📦',  color: 'bg-blue-100 text-blue-700' },
  client_created:      { icon: '👤',  color: 'bg-purple-100 text-purple-700' },
  employee_created:    { icon: '👷',  color: 'bg-indigo-100 text-indigo-700' },
  invitation_accepted: { icon: '🎉',  color: 'bg-pink-100 text-pink-700' },
  company_created:     { icon: '🏢',  color: 'bg-slate-100 text-slate-700' },
  generic:             { icon: '🔔',  color: 'bg-slate-100 text-slate-600' },
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
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#0F172A]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800 dark:text-white">Notifications</span>
              {unread > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                  {unread} non lue{unread > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-[11px] font-semibold text-[#001F3F] hover:underline dark:text-slate-300"
                >
                  Tout lire
                </button>
              )}
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-[11px] text-slate-400 hover:text-slate-600"
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
                <p className="text-2xl">🔔</p>
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
                    <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-sm ${c.color}`}>
                      {c.icon}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-xs leading-snug ${n.readAt ? 'font-medium text-slate-600 dark:text-slate-400' : 'font-bold text-slate-800 dark:text-white'}`}>
                          {n.title}
                        </p>
                        <span className="flex-shrink-0 text-[10px] text-slate-400">{relDate(n.createdAt)}</span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-[11px] text-slate-400 leading-snug line-clamp-2">{n.body}</p>
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
