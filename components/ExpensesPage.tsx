'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from './ProtectedRoute';
import { supabase } from '../lib/supabaseClient';
import { upsertExpense, deleteExpense } from '../app/actions/expenses';

// ── Types ────────────────────────────────────────────────────────────────────

type Currency  = 'HTG' | 'USD';
type PayStatus = 'Payé' | 'En attente' | 'Dette';
type PayMethod = 'Espèces' | 'Carte' | 'Mobile';

type ExpenseRecord = {
  id: string;
  description: string;
  category: string;
  amount: number;
  currency: Currency;
  payment_status: PayStatus;
  payment_method: PayMethod;
  date: string;
  supplier_id: string | null;
  supplier_name?: string;
};

type Supplier = { id: string; name: string };

// ── Config ───────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'Salaire',        label: 'Salè',              badge: 'bg-blue-500/15 text-blue-300',   dot: '#60A5FA' },
  { value: 'Loyer',          label: 'Lwaye',             badge: 'bg-violet-500/15 text-violet-300', dot: '#A78BFA' },
  { value: 'Stock',          label: 'Achte Stock',       badge: 'bg-cyan-500/15 text-cyan-300',   dot: '#22D3EE' },
  { value: 'Remboursements', label: 'Rembòsman Dèt',     badge: 'bg-orange-500/15 text-orange-300', dot: '#FB923C' },
  { value: 'Autre',          label: 'Lòt',               badge: 'bg-slate-500/15 text-slate-400', dot: '#94A3B8' },
] as const;

const STATUS_CFG: Record<PayStatus, { label: string; cls: string }> = {
  'Payé':       { label: '✓ Payé',        cls: 'bg-emerald-500/15 text-emerald-300' },
  'En attente': { label: '⏳ En attente',  cls: 'bg-amber-500/15 text-amber-300'    },
  'Dette':      { label: '⚠ Dette',       cls: 'bg-red-500/15 text-red-400'        },
};

const catOf = (v: string) => CATEGORIES.find(c => c.value === v) ?? CATEGORIES[4];

// ── Mock data (visible until real DB data loads) ──────────────────────────────

const MOCK_SUPPLIERS: Supplier[] = [
  { id: 'mock-sup-1', name: 'Founisè Mizik SA' },
  { id: 'mock-sup-2', name: 'Founisè Tekstil Kreyòl' },
  { id: 'mock-sup-3', name: 'Founisè Bati Lakay' },
];

const MOCK_EXPENSES: ExpenseRecord[] = [
  {
    id: 'demo-1', date: '2026-05-02', description: 'Salè Janvye — Équipe boutik',
    category: 'Salaire', amount: 85000, currency: 'HTG',
    payment_status: 'Payé', payment_method: 'Espèces', supplier_id: null,
  },
  {
    id: 'demo-2', date: '2026-05-06', description: 'Lwaye boutik Pétionville',
    category: 'Loyer', amount: 35000, currency: 'HTG',
    payment_status: 'En attente', payment_method: 'Carte', supplier_id: null,
  },
  {
    id: 'demo-3', date: '2026-05-14', description: 'Rembòsman Dèt Founisè Mizik SA',
    category: 'Remboursements', amount: 12500, currency: 'USD',
    payment_status: 'Dette', payment_method: 'Mobile',
    supplier_id: 'mock-sup-1', supplier_name: 'Founisè Mizik SA',
  },
  {
    id: 'demo-4', date: '2026-05-18', description: 'Achte Stock Materyèl elektwonik',
    category: 'Stock', amount: 65000, currency: 'HTG',
    payment_status: 'Payé', payment_method: 'Espèces', supplier_id: null,
  },
  {
    id: 'demo-5', date: '2026-05-20', description: 'Peman Dèt Founisè Tekstil',
    category: 'Remboursements', amount: 24000, currency: 'HTG',
    payment_status: 'Dette', payment_method: 'Carte',
    supplier_id: 'mock-sup-2', supplier_name: 'Founisè Tekstil Kreyòl',
  },
];

// ── Helper: format amount with currency ──────────────────────────────────────

function fmtAmt(amount: number, currency: Currency) {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 2,
    }).format(amount);
  }
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount) + ' HTG';
}

// ── Default form ─────────────────────────────────────────────────────────────

const FORM_DEF = {
  description:    '',
  category:       'Salaire',
  amount:         '',
  currency:       'HTG' as Currency,
  payment_status: 'Payé' as PayStatus,
  payment_method: 'Espèces' as PayMethod,
  date:           new Date().toISOString().slice(0, 10),
  supplier_id:    '',
};

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

function ExpenseModal({
  record, suppliers, ownerId, onClose, onSaved,
}: {
  record: ExpenseRecord | null;
  suppliers: Supplier[];
  ownerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
    record
      ? {
          description:    record.description,
          category:       record.category,
          amount:         String(record.amount),
          currency:       record.currency,
          payment_status: record.payment_status,
          payment_method: record.payment_method,
          date:           record.date.slice(0, 10),
          supplier_id:    record.supplier_id ?? '',
        }
      : FORM_DEF,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof FORM_DEF, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const isDebt = form.category === 'Remboursements';
  // Filter out mock suppliers from the real dropdown
  const realSuppliers = suppliers.filter(s => !s.id.startsWith('mock-'));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!form.description.trim()) return setErr('Description obligatoire.');
    if (!amt || amt <= 0) return setErr('Montant invalide (> 0).');
    setSaving(true); setErr('');
    try {
      await upsertExpense({
        id:             record?.id,
        owner_id:       ownerId,
        description:    form.description.trim(),
        category:       form.category,
        amount:         amt,
        currency:       form.currency,
        payment_status: form.payment_status,
        payment_method: form.payment_method,
        date:           form.date,
        supplier_id:    isDebt && form.supplier_id ? form.supplier_id : undefined,
      });
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  const field = (label: string, children: React.ReactNode, span = '') => (
    <div className={span}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[#8b96b8]">
        {label}
      </label>
      {children}
    </div>
  );

  const input = 'w-full rounded-2xl border border-white/10 bg-[#0f1628] px-4 py-3 text-sm text-slate-100 outline-none ring-1 ring-transparent transition placeholder:text-slate-600 focus:ring-[#6b5cff]/50';
  const sel   = `${input} appearance-none pr-10`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 bg-[#101426] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#7c85b6]">
              {record ? 'Modifye' : 'Nouvo dépense'}
            </p>
            <h3 className="mt-0.5 text-xl font-semibold text-white">
              {record ? 'Modifye dépense' : 'Ajoute yon dépense'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          {/* Description */}
          {field('Deskripsyon *',
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Salè Janvye, Rembòsman Dèt Founisè X…"
              className={input} required />
          )}

          {/* Category */}
          {field('Kategori *',
            <div className="relative">
              <select value={form.category} onChange={e => set('category', e.target.value)} className={sel}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}

          {/* Supplier (only for Remboursements) */}
          {isDebt && realSuppliers.length > 0 && (
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-orange-400">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Quick Action — Chwazi Founisè
              </p>
              <div className="relative">
                <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className={sel}>
                  <option value="">— Choisir yon founisè —</option>
                  {realSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* Amount + Currency */}
          {field('Montan *',
            <div className="flex gap-2">
              <div className="flex overflow-hidden rounded-2xl border border-white/10 text-sm shrink-0">
                {(['HTG', 'USD'] as Currency[]).map(c => (
                  <button key={c} type="button" onClick={() => set('currency', c)}
                    className={`px-4 py-3 font-bold transition ${form.currency === c
                      ? 'bg-[#6b5cff] text-white'
                      : 'bg-[#0f1628] text-slate-400 hover:bg-white/5'}`}>
                    {c}
                  </button>
                ))}
              </div>
              <input value={form.amount} onChange={e => set('amount', e.target.value)}
                type="number" min={0} step={0.01} placeholder="0.00" required
                className={`${input} flex-1`} />
            </div>
          )}

          {/* Status + Method + Date */}
          <div className="grid grid-cols-3 gap-3">
            {field('Estati',
              <div className="relative">
                <select value={form.payment_status} onChange={e => set('payment_status', e.target.value as PayStatus)} className={sel}>
                  <option value="Payé">✓ Payé</option>
                  <option value="En attente">⏳ En attente</option>
                  <option value="Dette">⚠ Dette</option>
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            {field('Metòd',
              <div className="relative">
                <select value={form.payment_method} onChange={e => set('payment_method', e.target.value as PayMethod)} className={sel}>
                  <option value="Espèces">💵 Espèces</option>
                  <option value="Carte">💳 Carte</option>
                  <option value="Mobile">📱 Mobile</option>
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            {field('Dat', <input value={form.date} onChange={e => set('date', e.target.value)} type="date" required className={input} />)}
          </div>

          {err && (
            <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-400">
              {err}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10">
              Anile
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-2xl bg-[#6b5cff] py-3 text-sm font-semibold text-white shadow-lg shadow-[#6b5cff]/25 transition hover:bg-[#5840e0] disabled:opacity-50">
              {saving ? 'Anrejistreman…' : record ? 'Sove Chanjman' : 'Ajoute Dépense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({
  record, onClose, onConfirm,
}: {
  record: ExpenseRecord;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const isDemo = record.id.startsWith('demo-');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-white/10 bg-[#101426] p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <svg className="h-6 w-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">Efase dépense?</h3>
        <p className="mt-2 text-sm text-slate-400">
          <span className="font-medium text-slate-200">{record.description}</span>
          {' '}—{' '}
          <span className="font-semibold text-red-400">{fmtAmt(record.amount, record.currency)}</span>
          {' '}pral efase pou toujou.
        </p>
        {isDemo && (
          <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            Enfo: sa a se yon done demo — li pa nan baz de done reyèl.
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10">
            Anile
          </button>
          {!isDemo && (
            <button
              onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
              disabled={busy}
              className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
              {busy ? 'Efasman…' : 'Wi, Efase'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ExpensesPage() {
  const [expenses,  setExpenses]  = useState<ExpenseRecord[]>(MOCK_EXPENSES);
  const [suppliers, setSuppliers] = useState<Supplier[]>(MOCK_SUPPLIERS);
  const [loading,   setLoading]   = useState(true);
  const [ownerId,   setOwnerId]   = useState<string | null>(null);
  const [isDemo,    setIsDemo]    = useState(true);

  // Modal states
  const [showModal,   setShowModal]   = useState(false);
  const [editRecord,  setEditRecord]  = useState<ExpenseRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null);

  // Filter states
  const [quickFilter,   setQuickFilter]   = useState<'tout' | 'salaire' | 'dette' | 'attente'>('tout');
  const [filterCat,     setFilterCat]     = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterMonth,   setFilterMonth]   = useState('');
  const [filterMethod,  setFilterMethod]  = useState('');
  const [search,        setSearch]        = useState('');

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then((r: any) => setOwnerId(r.data?.user?.id ?? null));
    loadAll();
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    const [expRes, supRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('id,description,category,amount,currency,payment_status,payment_method,date,supplier_id')
        .order('date', { ascending: false }),
      supabase.from('suppliers').select('id,name').order('name'),
    ]);

    const supMap: Record<string, string> = {};
    for (const s of supRes.data ?? []) supMap[s.id] = s.name;

    if (supRes.data && supRes.data.length > 0) {
      setSuppliers(supRes.data as Supplier[]);
    }

    if (expRes.data && expRes.data.length > 0) {
      setExpenses(
        expRes.data.map((e: any) => ({
          id:             e.id,
          description:    e.description,
          category:       e.category       ?? 'Autre',
          amount:         Number(e.amount),
          currency:       (e.currency      ?? 'HTG') as Currency,
          payment_status: (e.payment_status ?? 'Payé') as PayStatus,
          payment_method: (e.payment_method ?? 'Espèces') as PayMethod,
          date:           e.date,
          supplier_id:    e.supplier_id ?? null,
          supplier_name:  e.supplier_id ? supMap[e.supplier_id] : undefined,
        }))
      );
      setIsDemo(false);
    } else {
      setIsDemo(true); // show mock data
    }

    setLoading(false);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditRecord(null);
    setShowModal(true);
  }

  function openEdit(rec: ExpenseRecord) {
    setEditRecord(rec);
    setShowModal(true);
  }

  async function handleDelete(rec: ExpenseRecord) {
    try {
      await deleteExpense(rec.id);
      setDeleteTarget(null);
      await loadAll();
    } catch (e: any) { alert(e.message); }
  }

  // ── Filtered list ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (filterCat    && e.category !== filterCat)           return false;
      if (filterStatus && e.payment_status !== filterStatus)  return false;
      if (filterMonth  && !e.date.startsWith(filterMonth))    return false;
      if (filterMethod && e.payment_method !== filterMethod)  return false;
      if (search && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (quickFilter === 'salaire' && e.category !== 'Salaire')            return false;
      if (quickFilter === 'dette'   && e.category !== 'Remboursements')     return false;
      if (quickFilter === 'attente' && e.payment_status !== 'En attente')   return false;
      return true;
    });
  }, [expenses, filterCat, filterStatus, filterMonth, filterMethod, search, quickFilter]);

  // ── Summary stats ────────────────────────────────────────────────────────────

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const stats = useMemo(() => {
    const thisMonth  = expenses.filter(e => e.date.startsWith(currentMonth));
    const totalMonth = thisMonth.reduce((s, e) => s + e.amount, 0);
    const totalSalary= expenses.filter(e => e.category === 'Salaire').reduce((s, e) => s + e.amount, 0);
    const totalDebt  = expenses.filter(e => e.category === 'Remboursements').reduce((s, e) => s + e.amount, 0);
    const pending    = expenses.filter(e => e.payment_status === 'En attente').reduce((s, e) => s + e.amount, 0);
    return { totalMonth, totalSalary, totalDebt, pending };
  }, [expenses, currentMonth]);

  // ── Card helper ──────────────────────────────────────────────────────────────

  function StatCard({ label, value, sub, icon, accent }: {
    label: string; value: string; sub: string;
    icon: React.ReactNode; accent: string;
  }) {
    return (
      <div className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-[0_20px_70px_-40px_rgba(255,255,255,0.1)] backdrop-blur-xl`}>
        <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-10 blur-2xl ${accent}`} />
        <div className="relative">
          <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${accent} bg-opacity-20`}>
            {icon}
          </div>
          <p className="text-xs uppercase tracking-[0.28em] text-[#8b96b8]">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{sub}</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0B0F19] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">

          {/* ── Page header ── */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-[#7C82A1]">Depans</p>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">
                Suivi des sorties de trésorerie
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300/80">
                Contrôlez tous vos cash outflows en temps réel — salaires, loyers, stocks et remboursements.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isDemo && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400">
                  📊 Données démo
                </span>
              )}
              <button
                onClick={openAdd}
                className="flex items-center gap-2 rounded-2xl bg-[#6b5cff] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#6b5cff]/30 transition hover:bg-[#5840e0] active:scale-95"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Ajoute Dépense
              </button>
            </div>
          </div>

          {/* ── Summary cards ── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total mwa sa a"
              value={fmtAmt(stats.totalMonth, 'HTG')}
              sub="Dépenses mois courant"
              accent="bg-[#6b5cff]"
              icon={<svg className="h-5 w-5 text-[#a39bff]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" /></svg>}
            />
            <StatCard
              label="Total Salè"
              value={fmtAmt(stats.totalSalary, 'HTG')}
              sub="Salaires cumulés"
              accent="bg-blue-500"
              icon={<svg className="h-5 w-5 text-blue-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            />
            <StatCard
              label="Total Dèt Peye"
              value={fmtAmt(stats.totalDebt, 'HTG')}
              sub="Remboursements"
              accent="bg-orange-500"
              icon={<svg className="h-5 w-5 text-orange-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>}
            />
            <StatCard
              label="An Atant"
              value={fmtAmt(stats.pending, 'HTG')}
              sub="À payer bientôt"
              accent="bg-amber-500"
              icon={<svg className="h-5 w-5 text-amber-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </div>

          {/* ── Filters ── */}
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            {/* Quick filters */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {([
                { k: 'tout',    label: 'Tout afficher' },
                { k: 'salaire', label: '💼 Sèlman Salè' },
                { k: 'dette',   label: '💳 Sèlman Dèt' },
                { k: 'attente', label: '⏳ Sèlman En Attente' },
              ] as const).map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setQuickFilter(k)}
                  className={`rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                    quickFilter === k
                      ? 'bg-[#6b5cff] text-white shadow-md shadow-[#6b5cff]/30'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  }`}>
                  {label}
                </button>
              ))}
              {(filterCat || filterStatus || filterMonth || filterMethod || search || quickFilter !== 'tout') && (
                <button type="button"
                  onClick={() => { setFilterCat(''); setFilterStatus(''); setFilterMonth(''); setFilterMethod(''); setSearch(''); setQuickFilter('tout'); }}
                  className="ml-auto flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Efase filtè
                </button>
              )}
            </div>

            {/* Advanced filters */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {/* Search */}
              <div className="col-span-2 lg:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Rechèch</label>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Chèche pa deskripsyon…"
                  className="w-full rounded-2xl border border-white/10 bg-[#0f1628] px-4 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-[#6b5cff]/50 focus:ring-1 focus:ring-[#6b5cff]/30" />
              </div>
              {/* Category */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Kategori</label>
                <div className="relative">
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-[#0f1628] px-4 py-2.5 pr-9 text-sm text-slate-200 outline-none focus:border-[#6b5cff]/50">
                    <option value="">Tout</option>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              {/* Status */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Estati</label>
                <div className="relative">
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-[#0f1628] px-4 py-2.5 pr-9 text-sm text-slate-200 outline-none focus:border-[#6b5cff]/50">
                    <option value="">Tout</option>
                    <option value="Payé">✓ Payé</option>
                    <option value="En attente">⏳ En attente</option>
                    <option value="Dette">⚠ Dette</option>
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              {/* Month */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Mwa</label>
                <input value={filterMonth} onChange={e => setFilterMonth(e.target.value)} type="month"
                  className="w-full rounded-2xl border border-white/10 bg-[#0f1628] px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-[#6b5cff]/50" />
              </div>
            </div>
          </div>

          {/* ── Transactions table ── */}
          <div className="rounded-[32px] border border-white/10 bg-white/5 shadow-[0_28px_90px_-40px_rgba(255,255,255,0.08)] backdrop-blur-xl">
            {/* Table header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-white">Istorik Tranzaksyon yo</h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  {filtered.length} rezilta
                  {filtered.length !== expenses.length
                    ? ` (sou ${expenses.length} total)`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M3 8h18M3 12h12M3 16h8" />
                </svg>
                {filtered.length}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#6b5cff]" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <svg className="mx-auto mb-4 h-12 w-12 text-white/10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
                <p className="text-sm font-medium text-slate-500">Okenn rezilta koresponn ak filtè yo</p>
                <p className="mt-1 text-xs text-slate-600">Ajiste filtè yo oswa ajoute yon nouvo dépense</p>
              </div>
            ) : (
              <>
                {/* Mobile-scrollable table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {['Dat', 'Deskripsyon', 'Kategori', 'Montan', 'Metòd', 'Estati', ''].map(h => (
                          <th key={h} className="whitespace-nowrap px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((exp, i) => {
                        const cat = catOf(exp.category);
                        const sts = STATUS_CFG[exp.payment_status] ?? STATUS_CFG['Payé'];
                        return (
                          <tr key={exp.id}
                            className={`group border-b border-white/5 transition-colors hover:bg-white/5 ${i === filtered.length - 1 ? 'border-b-0' : ''}`}>
                            {/* Date */}
                            <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400">
                              {new Date(exp.date).toLocaleDateString('fr-FR', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </td>
                            {/* Description */}
                            <td className="px-5 py-4">
                              <p className="max-w-[220px] truncate font-medium text-slate-200">
                                {exp.description}
                              </p>
                              {exp.supplier_name && (
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  🏢 {exp.supplier_name}
                                </p>
                              )}
                            </td>
                            {/* Category badge */}
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${cat.badge}`}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.dot }} />
                                {cat.label}
                              </span>
                            </td>
                            {/* Amount */}
                            <td className="whitespace-nowrap px-5 py-4">
                              <p className="font-bold text-slate-100">{fmtAmt(exp.amount, exp.currency)}</p>
                            </td>
                            {/* Method */}
                            <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400">
                              {exp.payment_method === 'Espèces' ? '💵' : exp.payment_method === 'Carte' ? '💳' : '📱'}
                              {' '}{exp.payment_method}
                            </td>
                            {/* Status badge */}
                            <td className="px-5 py-4">
                              <span className={`inline-block rounded-full px-3 py-1 text-[11px] font-semibold ${sts.cls}`}>
                                {sts.label}
                              </span>
                            </td>
                            {/* Actions — visible on hover */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  onClick={() => openEdit(exp)}
                                  title="Modifye"
                                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-[#6b5cff]/20 hover:text-[#a39bff]">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(exp)}
                                  title="Efase"
                                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-red-500/20 hover:text-red-400">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer total */}
                <div className="flex items-center justify-between border-t border-white/10 px-6 py-3">
                  <span className="text-xs text-slate-500">
                    {filtered.length} dépense{filtered.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-bold text-white">
                    Total :{' '}
                    <span className="text-[#a39bff]">
                      {fmtAmt(filtered.reduce((s, e) => s + e.amount, 0), 'HTG')}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ── Modals ── */}
      {showModal && ownerId && (
        <ExpenseModal
          record={editRecord}
          suppliers={suppliers}
          ownerId={ownerId}
          onClose={() => { setShowModal(false); setEditRecord(null); }}
          onSaved={loadAll}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          record={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
    </ProtectedRoute>
  );
}
