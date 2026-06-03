'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { supabase } from '../../lib/supabaseClient';
import { upsertClient, deleteClient, markClientCreditPaid } from '../actions/clients';

// ── Types ─────────────────────────────────────────────────────────────────────

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  outstanding_balance: number;
  created_at: string;
  // enriched client-side
  totalPurchases: number;
  saleCount: number;
  isVIP: boolean;
};

type Sale = {
  id: string;
  invoice_number: string | null;
  total_amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  discount_percent: number;
  created_at: string;
};

type ClientCredit = {
  id: string;
  invoice_number: string | null;
  amount: number;
  currency: string;
  payment_status: 'À Crédit' | 'Payé';
  created_at: string;
};

type Invoice = {
  invoice_number: string;
  total: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  date: string;
  itemCount: number;
};

// ── Config ────────────────────────────────────────────────────────────────────

const VIP_THRESHOLD  = 50_000;   // HTG — total purchases to be VIP
const VIP_SALE_COUNT = 5;        // OR >= 5 sales

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'HTG') {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
  }
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' HTG';
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── Mock data (shown when DB is empty) ───────────────────────────────────────

const MOCK_CLIENTS: Client[] = [
  { id: 'demo-1', name: 'Marie Josette Pierre',  phone: '+509 3712-4521', email: 'marie.pierre@gmail.com', outstanding_balance: 15000, created_at: '2026-02-10T10:00:00Z', totalPurchases: 142500, saleCount: 12, isVIP: true  },
  { id: 'demo-2', name: 'Jean-Baptiste Duval',   phone: '+509 4822-6340', email: null,                      outstanding_balance: 35000, created_at: '2026-03-05T10:00:00Z', totalPurchases: 87500,  saleCount: 7,  isVIP: true  },
  { id: 'demo-3', name: 'Claudette Morisseau',   phone: '+509 3611-8820', email: 'cmorisseau@yahoo.fr',    outstanding_balance: 0,     created_at: '2026-04-14T10:00:00Z', totalPurchases: 22000,  saleCount: 3,  isVIP: false },
  { id: 'demo-4', name: 'Réginald Saint-Louis',  phone: '+509 3920-1145', email: null,                      outstanding_balance: 8500,  created_at: '2026-04-28T10:00:00Z', totalPurchases: 18500,  saleCount: 2,  isVIP: false },
  { id: 'demo-5', name: 'Nadège Compère',        phone: '+509 4710-3382', email: 'nadege@profitpilot.ht',  outstanding_balance: 0,     created_at: '2026-05-03T10:00:00Z', totalPurchases: 9500,   saleCount: 1,  isVIP: false },
];

const MOCK_INVOICES: Invoice[] = [
  { invoice_number: 'PP-2026-182543', total: 45000, currency: 'HTG', payment_method: 'Cash',    payment_status: 'Payé',     date: '2026-05-18T08:30:00Z', itemCount: 3 },
  { invoice_number: 'PP-2026-097622', total: 32500, currency: 'HTG', payment_method: 'MonCash', payment_status: 'À Crédit', date: '2026-05-10T14:20:00Z', itemCount: 2 },
  { invoice_number: 'PP-2026-043001', total: 65000, currency: 'HTG', payment_method: 'Cash',    payment_status: 'Payé',     date: '2026-04-22T09:15:00Z', itemCount: 5 },
];

const MOCK_CREDITS: ClientCredit[] = [
  { id: 'cc-1', invoice_number: 'PP-2026-097622', amount: 32500, currency: 'HTG', payment_status: 'À Crédit', created_at: '2026-05-10T14:20:00Z' },
];

// ── ClientModal (Add / Edit) ──────────────────────────────────────────────────

function ClientModal({
  client, onClose, onSaved,
}: {
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name,  setName]  = useState(client?.name  ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('Non kliyan an obligatwa.');
    setSaving(true); setErr('');
    try {
      await upsertClient({ id: client?.id, name, phone: phone || undefined, email: email || undefined });
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  const inp = 'w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none ring-1 ring-transparent transition placeholder:text-slate-600 focus:ring-[#001F3F]/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--color-muted)]">{client ? 'Modifye' : 'Nouvo Kliyan'}</p>
            <h3 className="mt-0.5 text-xl font-semibold text-[#001F3F]">
              {client ? 'Modifye Kliyan' : 'Ajoute yon Kliyan'}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100 hover:text-white">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Non Kliyan *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Marie Josette Pierre" className={inp} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Telefòn</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+509 XXXX-XXXX" className={inp} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@example.com" className={inp} />
            </div>
          </div>
          {err && <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">Anile</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002D5B] disabled:opacity-50">
              {saving ? 'Anrejistreman…' : client ? 'Sove Chanjman' : 'Ajoute Kliyan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ client, onClose, onConfirm }: { client: Client; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const isDemo = client.id.startsWith('demo-');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-[#001F3F]">Efase kliyan?</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          <span className="font-medium text-[var(--color-text)]">{client.name}</span> pral efase. Ventes li yo ap rete men san lyen.
        </p>
        {isDemo && <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-400">Sa a se done demo — li pa nan DB reyèl.</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">Anile</button>
          {!isDemo && (
            <button onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }} disabled={busy}
              className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
              {busy ? 'Efasman…' : 'Wi, Efase'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-[#001F3F]/30 text-[#001F3F]',
  'bg-blue-500/20 text-blue-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-orange-500/20 text-orange-300',
  'bg-pink-500/20 text-pink-300',
  'bg-cyan-500/20 text-cyan-300',
];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// ── Inner page (needs useSearchParams) ───────────────────────────────────────

function ClientsCRMInner() {
  const params = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [clients,      setClients]      = useState<Client[]>(MOCK_CLIENTS);
  const [selectedId,   setSelectedId]   = useState<string | null>(params.get('id') ?? MOCK_CLIENTS[0].id);
  const [isDemo,       setIsDemo]       = useState(true);
  const [loading,      setLoading]      = useState(true);
  const [detailLoad,   setDetailLoad]   = useState(false);

  // detail data
  const [invoices,     setInvoices]     = useState<Invoice[]>(MOCK_INVOICES);
  const [credits,      setCredits]      = useState<ClientCredit[]>(MOCK_CREDITS);
  const [busyCredit,   setBusyCredit]   = useState<Set<string>>(new Set());

  // modals
  const [showModal,    setShowModal]    = useState(false);
  const [editClient,   setEditClient]   = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  // filters
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState<'all' | 'vip' | 'debtor'>('all');

  // print ref
  const printRef = useRef<HTMLDivElement>(null);

  // ── Load all clients ───────────────────────────────────────────────────────

  const loadClients = useCallback(async () => {
    setLoading(true);
    const [clientRes, salesRes] = await Promise.all([
      supabase.from('customers').select('id,name,phone,email,outstanding_balance,created_at').is('deleted_at', null).order('name'),
      supabase.from('sales').select('customer_id,total_amount').not('customer_id', 'is', null),
    ]);

    if (clientRes.error || !clientRes.data?.length) {
      setIsDemo(true); setLoading(false); return;
    }

    // Aggregate sales per customer
    const agg: Record<string, { total: number; count: number }> = {};
    for (const s of salesRes.data ?? []) {
      if (!s.customer_id) continue;
      if (!agg[s.customer_id]) agg[s.customer_id] = { total: 0, count: 0 };
      agg[s.customer_id].total += Number(s.total_amount);
      agg[s.customer_id].count += 1;
    }

    const enriched: Client[] = clientRes.data.map((c: any) => {
      const { total = 0, count = 0 } = agg[c.id] ?? {};
      return {
        id: c.id, name: c.name, phone: c.phone ?? null, email: c.email ?? null,
        outstanding_balance: Number(c.outstanding_balance ?? 0), created_at: c.created_at,
        totalPurchases: total, saleCount: count,
        isVIP: total >= VIP_THRESHOLD || count >= VIP_SALE_COUNT,
      };
    });

    setClients(enriched);
    setIsDemo(false);
    if (!selectedId && enriched.length > 0) setSelectedId(enriched[0].id);
    setLoading(false);
  }, [selectedId]);

  // ── Load client detail ─────────────────────────────────────────────────────

  const loadDetail = useCallback(async (clientId: string) => {
    if (clientId.startsWith('demo-')) {
      setInvoices(MOCK_INVOICES); setCredits(MOCK_CREDITS); return;
    }
    setDetailLoad(true);
    const [salesRes, creditsRes] = await Promise.all([
      supabase.from('sales')
        .select('id,invoice_number,total_amount,currency,payment_method,payment_status,discount_percent,created_at')
        .eq('customer_id', clientId)
        .order('created_at', { ascending: false }),
      supabase.from('customer_transactions')
        .select('id,reference_id,amount,currency,type,description,created_at')
        .eq('customer_id', clientId)
        .eq('type', 'credit')
        .order('created_at', { ascending: false }),
    ]);

    // Group sales → invoices
    const invMap: Record<string, Invoice> = {};
    for (const s of salesRes.data ?? []) {
      const key = s.invoice_number ?? s.id;
      if (!invMap[key]) invMap[key] = { invoice_number: s.invoice_number ?? '—', total: 0, currency: s.currency, payment_method: s.payment_method, payment_status: s.payment_status, date: s.created_at, itemCount: 0 };
      invMap[key].total += Number(s.total_amount);
      invMap[key].itemCount += 1;
    }
    setInvoices(Object.values(invMap).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setCredits((creditsRes.data ?? []).map((c: any) => ({
      id: c.id, invoice_number: c.reference_id ?? null, amount: Number(c.amount),
      currency: c.currency ?? 'HTG', payment_status: 'À Crédit' as const, created_at: c.created_at,
    })));
    setDetailLoad(false);
  }, []);

  // ── Init + re-load on selection ────────────────────────────────────────────

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handlePayCredit(creditId: string) {
    setBusyCredit(s => new Set(s).add(creditId));
    try {
      await markClientCreditPaid(creditId);
      if (selectedId) await loadDetail(selectedId);
      await loadClients();
    } catch (e: any) { alert(e.message); }
    finally { setBusyCredit(s => { const n = new Set(s); n.delete(creditId); return n; }); }
  }

  async function handleDeleteConfirm(client: Client) {
    try {
      await deleteClient(client.id);
      setDeleteTarget(null);
      if (selectedId === client.id) setSelectedId(null);
      await loadClients();
    } catch (e: any) { alert(e.message); }
  }

  // ── Print report ──────────────────────────────────────────────────────────

  function handlePrint() {
    const style = document.createElement('style');
    style.innerHTML = `@media print {
      body * { visibility: hidden !important; }
      #pp-print, #pp-print * { visibility: visible !important; }
      #pp-print { position: fixed; inset: 0; background: white; color: #111; padding: 32px; font-family: sans-serif; overflow: auto; }
    }`;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    let list = clients;
    if (search) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()));
    if (filter === 'vip')    list = list.filter(c => c.isVIP);
    if (filter === 'debtor') list = [...list].sort((a, b) => b.outstanding_balance - a.outstanding_balance).filter(c => c.outstanding_balance > 0);
    return list;
  }, [clients, search, filter]);

  const selected = useMemo(() => clients.find(c => c.id === selectedId) ?? null, [clients, selectedId]);

  const totalDebtActive = useMemo(() => credits.filter(c => c.payment_status === 'À Crédit').reduce((s, c) => s + c.amount, 0), [credits]);

  // ── Render ────────────────────────────────────────────────────────────────

  const listVisible   = !selectedId || true;   // always render list (CSS hides it on mobile)
  const detailVisible = !!selectedId;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">

      {/* ════════════════════════════════════════
          LEFT PANEL — Master (client list)
          Hidden on mobile when detail is open
      ════════════════════════════════════════ */}
      <aside className={`flex w-full flex-col border-r border-[var(--color-border)] md:w-80 lg:w-96 ${selectedId ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="border-b border-[var(--color-border)] px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">CRM</p>
              <h1 className="mt-0.5 text-xl font-semibold text-[#001F3F]">Kliyan yo</h1>
            </div>
            <button onClick={() => { setEditClient(null); setShowModal(true); }}
              className="flex items-center gap-1.5 rounded-2xl bg-[#001F3F] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#002D5B] active:scale-95">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Ajoute
            </button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chèche kliyan…"
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-9 pr-4 text-sm text-[var(--color-text)] outline-none placeholder:text-slate-600 focus:border-[#001F3F]/50 focus:ring-1 focus:ring-[#6b5cff]/30" />
          </div>

          {/* Filter tabs */}
          <div className="mt-3 flex gap-1.5">
            {([['all', 'Tout'], ['vip', '⭐ VIP'], ['debtor', '⚠ Debitè']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${filter === k ? 'bg-[#001F3F] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-slate-100'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Client list */}
        <div className="flex-1 overflow-y-auto py-2">
          {isDemo && (
            <div className="mx-3 mb-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
              📊 Données démo — konekte DB pou done reyèl
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />
            </div>
          ) : filteredClients.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-muted)]">Okenn kliyan jwenn</p>
          ) : filteredClients.map(c => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={`w-full px-4 py-3.5 text-left transition ${selectedId === c.id ? 'bg-[#EAF1F8]' : 'hover:bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${avatarColor(c.name)}`}>
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">{c.name}</p>
                    {c.isVIP && <span className="shrink-0 text-xs">⭐</span>}
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">{c.saleCount} vente{c.saleCount !== 1 ? 's' : ''} · {fmt(c.totalPurchases)}</p>
                </div>
                {c.outstanding_balance > 0 && (
                  <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
                    {fmt(c.outstanding_balance)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* List footer */}
        <div className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-muted)]">
          {filteredClients.length} kliyan · {filteredClients.filter(c => c.isVIP).length} VIP
        </div>
      </aside>

      {/* ════════════════════════════════════════
          RIGHT PANEL — Detail view
      ════════════════════════════════════════ */}
      <main className={`flex flex-1 flex-col overflow-hidden ${!detailVisible ? 'hidden md:flex' : 'flex'}`}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <svg className="mb-4 h-16 w-16 text-slate-200" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p className="text-[var(--color-muted)]">Chwazi yon kliyan pou wè detay li</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto">

            {/* Detail header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-border)] bg-white/95 px-6 py-4 backdrop-blur-xl">
              {/* Back on mobile */}
              <button onClick={() => setSelectedId(null)} className="mr-1 flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-muted)] transition hover:bg-slate-100 md:hidden">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Retounen
              </button>

              {/* Avatar + name */}
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold ${avatarColor(selected.name)}`}>
                {initials(selected.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-[#001F3F]">{selected.name}</h2>
                  {selected.isVIP && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400">⭐ VIP</span>
                  )}
                  {selected.outstanding_balance > 0 && (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">⚠ Dèt</span>
                  )}
                </div>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  Kliyan depi {new Date(selected.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  {' · '}{daysSince(selected.created_at)} jou
                </p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={handlePrint} title="Imprimer"
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                </button>
                <button onClick={() => { setEditClient(selected); setShowModal(true); }} title="Éditer"
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => setDeleteTarget(selected)} title="Supprimer"
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-red-500/15 hover:text-red-400">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            {/* Detail content */}
            <div className="flex-1 space-y-6 px-6 py-6">

              {/* ── Profile ── */}
              <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 backdrop-blur-xl">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Pwofil Kliyan</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: 'Telefòn', value: selected.phone ?? '—', icon: '📞' },
                    { label: 'Email', value: selected.email ?? '—', icon: '✉️' },
                    { label: 'Enskripsyon', value: new Date(selected.created_at).toLocaleDateString('fr-FR'), icon: '📅' },
                    { label: 'ID Kliyan', value: selected.id.slice(0, 8) + '…', icon: '🔑' },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="rounded-2xl bg-[var(--color-surface)] p-3">
                      <p className="mb-1 text-lg">{icon}</p>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">{label}</p>
                      <p className="mt-0.5 break-all text-sm font-medium text-[var(--color-text)]">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Analytics cards ── */}
              <section>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Analitik</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Total Acha', value: fmt(selected.totalPurchases), sub: `${selected.saleCount} ventes`, color: 'text-[#001F3F]', bg: 'bg-[#001F3F]/10' },
                    { label: 'Dèt Aktif', value: fmt(selected.outstanding_balance),   sub: totalDebtActive > 0 ? 'En cours' : 'Aucune', color: totalDebtActive > 0 ? 'text-red-400' : 'text-emerald-400', bg: totalDebtActive > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10' },
                    { label: 'Mwayèn / Vant', value: selected.saleCount ? fmt(selected.totalPurchases / selected.saleCount) : '—', sub: 'Panier moyen', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                    { label: 'Estatistik', value: selected.isVIP ? '⭐ VIP' : 'Regilye', sub: selected.isVIP ? `+${VIP_THRESHOLD / 1000}k HTG` : `< ${VIP_THRESHOLD / 1000}k HTG`, color: selected.isVIP ? 'text-amber-400' : 'text-[var(--color-muted)]', bg: selected.isVIP ? 'bg-amber-500/10' : 'bg-[var(--color-surface)]' },
                  ].map(({ label, value, sub, color, bg }) => (
                    <div key={label} className={`rounded-[20px] border border-[var(--color-border)] ${bg} p-4 backdrop-blur-xl`}>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">{label}</p>
                      <p className={`mt-1.5 text-xl font-bold ${color}`}>{value}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Credit/Debt section ── */}
              {credits.some(c => c.payment_status === 'À Crédit') && (
                <section className="rounded-[24px] border border-red-500/20 bg-red-500/5 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-red-400">⚠ Kreyans an kou</p>
                    <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-400">{fmt(totalDebtActive)}</span>
                  </div>
                  <div className="space-y-2">
                    {credits.filter(c => c.payment_status === 'À Crédit').map(cc => (
                      <div key={cc.id} className="flex items-center justify-between rounded-2xl bg-[var(--color-surface)] px-4 py-3">
                        <div>
                          <p className="font-mono text-xs text-[var(--color-muted)]">{cc.invoice_number ?? '—'}</p>
                          <p className="text-[11px] text-[var(--color-muted)]">{new Date(cc.created_at).toLocaleDateString('fr-FR')} · {daysSince(cc.created_at)} jou</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-bold text-red-400">{fmt(cc.amount, cc.currency)}</p>
                          <button onClick={() => handlePayCredit(cc.id)} disabled={busyCredit.has(cc.id)}
                            className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                            {busyCredit.has(cc.id) ? '…' : 'Touche ✓'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Transaction history ── */}
              <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
                    Istorik Tranzaksyon ({invoices.length})
                  </p>
                  {detailLoad && <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />}
                </div>

                {invoices.length === 0 ? (
                  <p className="py-10 text-center text-sm text-[var(--color-muted)]">Okenn tranzaksyon anregistre</p>
                ) : (
                  <div className="divide-y divide-[var(--color-border)]">
                    {invoices.map(inv => (
                      <div key={inv.invoice_number} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50">
                        {/* Icon */}
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm ${inv.payment_status === 'Payé' ? 'bg-emerald-500/15' : 'bg-blue-500/15'}`}>
                          {inv.payment_status === 'Payé' ? '✅' : '📋'}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-semibold text-[var(--color-text)]">{inv.invoice_number}</p>
                          <p className="text-[11px] text-[var(--color-muted)]">
                            {new Date(inv.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' · '}{inv.payment_method}
                            {' · '}{inv.itemCount} atik
                          </p>
                        </div>
                        {/* Amount + Status */}
                        <div className="text-right">
                          <p className="font-bold text-[var(--color-text)]">{fmt(inv.total, inv.currency)}</p>
                          <span className={`text-[10px] font-semibold ${inv.payment_status === 'Payé' ? 'text-emerald-400' : 'text-blue-400'}`}>
                            {inv.payment_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* History total */}
                <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
                  <span className="text-xs text-[var(--color-muted)]">{invoices.length} fakti</span>
                  <span className="text-sm font-bold text-[#001F3F]">
                    Total: {fmt(invoices.reduce((s, i) => s + i.total, 0))}
                  </span>
                </div>
              </section>

            </div>{/* end detail content */}
          </div>
        )}
      </main>

      {/* ════ Hidden print section ════ */}
      {selected && (
        <div id="pp-print" style={{ display: 'none' }}>
          <div style={{ fontFamily: 'sans-serif', color: '#111', padding: 32 }}>
            <div style={{ borderBottom: '2px solid #111', paddingBottom: 16, marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>ProfitPilot — Rapport Client</h1>
              <p style={{ margin: '4px 0 0', color: '#555', fontSize: 13 }}>Imprimé le {new Date().toLocaleDateString('fr-FR')}</p>
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>{selected.name}</h2>
            <p style={{ color: '#555', fontSize: 13, marginBottom: 4 }}>📞 {selected.phone ?? '—'} &nbsp;·&nbsp; ✉️ {selected.email ?? '—'}</p>
            <p style={{ color: '#555', fontSize: 13, marginBottom: 24 }}>Kliyan depi {new Date(selected.created_at).toLocaleDateString('fr-FR')}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 32 }}>
              {[['Total Acha', fmt(selected.totalPurchases)], ['Dèt Aktif', fmt(selected.outstanding_balance)], ['Nòm Ventes', String(selected.saleCount)]].map(([l, v]) => (
                <div key={l} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
                  <p style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p>
                  <p style={{ fontSize: 20, fontWeight: 700 }}>{v}</p>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Istorik Tranzaksyon</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  {['Dat', 'Nimewo Fakti', 'Metòd', 'Montan', 'Estati'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, textTransform: 'uppercase', color: '#555' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={inv.invoice_number} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px' }}>{new Date(inv.date).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                    <td style={{ padding: '8px 12px' }}>{inv.payment_method}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{fmt(inv.total, inv.currency)}</td>
                    <td style={{ padding: '8px 12px', color: inv.payment_status === 'Payé' ? '#16a34a' : '#2563eb' }}>{inv.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 32, fontSize: 11, color: '#aaa', textAlign: 'center' }}>ProfitPilot · Rapport généré automatiquement</p>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => { setShowModal(false); setEditClient(null); }}
          onSaved={loadClients}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          client={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDeleteConfirm(deleteTarget)}
        />
      )}
    </div>
  );
}

// ── Page root (wraps Suspense for useSearchParams) ────────────────────────────

export default function ClientsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#001F3F]" />
        </div>
      }>
        <ClientsCRMInner />
      </Suspense>
    </ProtectedRoute>
  );
}
