'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from './ProtectedRoute';
import { supabase } from '../lib/supabaseClient';
import { upsertExpense, deleteExpense, getExpenses, cleanupDeletedExpenses } from '../app/actions/expenses';
import { useLanguage } from './LanguageWrapper';

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
  { value: 'Salaire',               label: 'Salè',                    badge: 'bg-blue-100 text-blue-700',       dot: '#60A5FA' },
  { value: 'Loyer',                 label: 'Lwaye',                   badge: 'bg-violet-100 text-violet-700',   dot: '#A78BFA' },
  { value: 'Stock',                 label: 'Achte Stock',             badge: 'bg-cyan-100 text-cyan-700',       dot: '#22D3EE' },
  { value: 'Marketing',             label: 'Marketing',               badge: 'bg-pink-100 text-pink-700',       dot: '#EC4899' },
  { value: 'Publicité',             label: 'Réklam',                  badge: 'bg-red-100 text-red-700',         dot: '#EF4444' },
  { value: 'Téléphone',             label: 'Telepòn/Internet',        badge: 'bg-teal-100 text-teal-700',       dot: '#14B8A6' },
  { value: 'Électricité',           label: 'Elektrisite',             badge: 'bg-yellow-100 text-yellow-700',   dot: '#FBBF24' },
  { value: 'Internet',              label: 'Entènèt',                 badge: 'bg-indigo-100 text-indigo-700',   dot: '#6366F1' },
  { value: 'Frais Entretien',       label: 'Frè Antretyen',           badge: 'bg-emerald-100 text-emerald-700', dot: '#10B981' },
  { value: 'Frais Bancaires',       label: 'Frè Bank',                badge: 'bg-amber-100 text-amber-700',     dot: '#F59E0B' },
  { value: 'Matériel Bureau',       label: 'Materyal Biwo',           badge: 'bg-fuchsia-100 text-fuchsia-700', dot: '#D946EF' },
  { value: 'Fournitures',           label: 'Founiti',                 badge: 'bg-lime-100 text-lime-700',       dot: '#84CC16' },
  { value: 'Achat Équipement',      label: 'Ach Ekipman',             badge: 'bg-rose-100 text-rose-700',       dot: '#F43F5E' },
  { value: 'Transport et Frais de déplacement', label: 'Transpò ak Frè Deplasman', badge: 'bg-cyan-100 text-cyan-700', dot: '#06B6D4' },
  { value: 'Terrain/Bâtiment',      label: 'Tèren/Batisman',          badge: 'bg-orange-100 text-orange-700',   dot: '#FB923C' },
  { value: 'Remboursements',        label: 'Rembòsman Dèt',           badge: 'bg-orange-100 text-orange-700',   dot: '#FB923C' },
  { value: 'Autre',                 label: 'Lòt',                     badge: 'bg-slate-100 text-slate-400',     dot: '#94A3B8' },
] as const;

const STATUS_CFG: Record<PayStatus, { label: { fr: string; ht: string }; cls: string }> = {
  'Payé':       { label: { fr: '✓ Payé', ht: '✓ Peye' },        cls: 'bg-emerald-100 text-emerald-700' },
  'En attente': { label: { fr: '⏳ En attente', ht: '⏳ Ap tann' },  cls: 'bg-amber-100 text-amber-700'    },
  'Dette':      { label: { fr: '⚠ Dette', ht: '⚠ Dèt' },       cls: 'bg-red-100 text-red-600'        },
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
  const { t } = useLanguage();

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
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </label>
      {children}
    </div>
  );

  const input = 'w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none ring-1 ring-transparent transition placeholder:text-[var(--color-muted)] focus:ring-[#001F3F]/30';
  const sel   = `${input} appearance-none pr-10`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">
              {record ? t({ fr: 'Modifier', ht: 'Modifye' }) : t({ fr: 'Nouvelle dépense', ht: 'Nouvo depans' })}
            </p>
            <h3 className="mt-0.5 text-xl font-semibold text-[#001F3F]">
              {record ? t({ fr: 'Modifier la dépense', ht: 'Modifye depans' }) : t({ fr: 'Ajouter une dépense', ht: 'Ajoute yon depans' })}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-slate-100 hover:text-[var(--color-text)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          {/* Description */}
          {field(t({ fr: 'Description *', ht: 'Deskripsyon *' }),
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder={t({ fr: 'Salaire janvier, remboursement dette fournisseur X…', ht: 'Salè Janvye, Rembòsman Dèt Founisè X…' })}
              className={input} required />
          )}

          {/* Category */}
          {field(t({ fr: 'Catégorie *', ht: 'Kategori *' }),
            <div className="relative">
              <select value={form.category} onChange={e => set('category', e.target.value)} className={sel}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
                {t({ fr: 'Action rapide — Choisir un fournisseur', ht: 'Aksyon rapid — Chwazi yon founisè' })}
              </p>
              <div className="relative">
                <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className={sel}>
                  <option value="">{t({ fr: '— Choisir un fournisseur —', ht: '— Chwazi yon founisè —' })}</option>
                  {realSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* Amount + Currency */}
          {field(t({ fr: 'Montant *', ht: 'Montan *' }),
            <div className="flex gap-2">
              <div className="flex overflow-hidden rounded-2xl border border-[var(--color-border)] text-sm shrink-0">
                {(['HTG', 'USD'] as Currency[]).map(c => (
                  <button key={c} type="button" onClick={() => set('currency', c)}
                    className={`px-4 py-3 font-bold transition ${form.currency === c
                      ? 'bg-[#001F3F] text-white'
                      : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-slate-50'}`}>
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
            {field(t({ fr: 'Statut', ht: 'Estati' }),
              <div className="relative">
                <select value={form.payment_status} onChange={e => set('payment_status', e.target.value as PayStatus)} className={sel}>
                  <option value="Payé">{t({ fr: '✓ Payé', ht: '✓ Peye' })}</option>
                  <option value="En attente">{t({ fr: '⏳ En attente', ht: '⏳ Ap tann' })}</option>
                  <option value="Dette">{t({ fr: '⚠ Dette', ht: '⚠ Dèt' })}</option>
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            {field(t({ fr: 'Méthode', ht: 'Metòd' }),
              <div className="relative">
                <select value={form.payment_method} onChange={e => set('payment_method', e.target.value as PayMethod)} className={sel}>
                  <option value="Espèces">{t({ fr: '💵 Espèces', ht: '💵 Lajan' })}</option>
                  <option value="Carte">{t({ fr: '💳 Carte', ht: '💳 Kat' })}</option>
                  <option value="Mobile">{t({ fr: '📱 Mobile', ht: '📱 Mobil' })}</option>
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            {field(t({ fr: 'Date', ht: 'Dat' }), <input value={form.date} onChange={e => set('date', e.target.value)} type="date" required className={input} />)}
          </div>

          {err && (
            <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-400">
              {err}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">
              {t({ fr: 'Annuler', ht: 'Anile' })}
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002D5B] disabled:opacity-50">
              {saving ? t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' }) : record ? t({ fr: 'Sauvegarder', ht: 'Sove Chanjman' }) : t({ fr: 'Ajouter Dépense', ht: 'Ajoute Depans' })}
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
  const { t } = useLanguage();
  const isDemo = record.id.startsWith('demo-');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <svg className="h-6 w-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[#001F3F]">{t({ fr: 'Supprimer la dépense?', ht: 'Efase depans?' })}</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          <span className="font-medium text-[var(--color-text)]">{record.description}</span>
          {' '}—{' '}
          <span className="font-semibold text-red-400">{fmtAmt(record.amount, record.currency)}</span>
          {' '}{t({ fr: 'sera supprimée définitivement.', ht: 'pral efase pou toujou.' })}
        </p>
        {isDemo && (
          <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            {t({ fr: 'Info: ceci est une donnée de démonstration — elle n\'est pas dans la base de données réelle.', ht: 'Enfo: sa a se yon done demo — li pa nan baz de done reyèl.' })}
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">
            {t({ fr: 'Annuler', ht: 'Anile' })}
          </button>
          {!isDemo && (
            <button
              onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
              disabled={busy}
              className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
              {busy ? t({ fr: 'Suppression…', ht: 'Efasman…' }) : t({ fr: 'Oui, Supprimer', ht: 'Wi, Efase' })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; accent: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm`}>
      <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-10 blur-2xl ${accent}`} />
      <div className="relative">
        <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${accent} bg-opacity-20`}>
          {icon}
        </div>
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-[#001F3F]">{value}</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ExpensesPage() {
  const [expenses,     setExpenses]     = useState<ExpenseRecord[]>(MOCK_EXPENSES);
  const [suppliers,    setSuppliers]    = useState<Supplier[]>(MOCK_SUPPLIERS);
  const [exchangeRate, setExchangeRate] = useState(130);
  const [loading,      setLoading]      = useState(true);
  const [ownerId,      setOwnerId]      = useState<string | null>(null);
  const [isDemo,       setIsDemo]       = useState(true);
  const { t } = useLanguage();

  // Modal states
  const [showModal,   setShowModal]   = useState(false);
  const [editRecord,  setEditRecord]  = useState<ExpenseRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null);

  // Filter states
  const [quickFilter,   setQuickFilter]   = useState<'tout' | 'salaire' | 'dette' | 'attente' | 'actif'>('tout');
  const [filterCat,     setFilterCat]     = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterMonth,   setFilterMonth]   = useState('');
  const [filterMethod,  setFilterMethod]  = useState('');
  const [search,        setSearch]        = useState('');

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then((r: any) => setOwnerId(r.data?.user?.id ?? null));
    loadAll();
    // cleanupDeletedExpenses is no longer needed on every load — deleteExpense handles it inline
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────────

  async function loadAll() {
    // ── Show cached data immediately ──────────────────────────────────────────
    try {
      const cached = sessionStorage.getItem('pp_expenses_list');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.expenses?.length) { setExpenses(parsed.expenses); setIsDemo(false); setLoading(false); }
        if (parsed.suppliers?.length) setSuppliers(parsed.suppliers);
      }
    } catch { /* ignore */ }

    setLoading(true);
    try {
      // Use getSession() — reads from localStorage cache, much faster than getUser()
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? ownerId;
      let bizId: string | null = null;
      if (uid) {
        // Cache business ID to avoid re-querying on every load
        const cachedBizId = sessionStorage.getItem('pp_biz_id');
        const cachedRate  = sessionStorage.getItem('pp_biz_rate');
        if (cachedBizId) {
          bizId = cachedBizId;
          if (cachedRate) setExchangeRate(Number(cachedRate));
        } else {
          const { data: biz } = await supabase
            .from('businesses')
            .select('id, exchange_rate')
            .eq('owner_id', uid)
            .maybeSingle();
          if (biz) {
            bizId = biz.id;
            setExchangeRate(Number(biz.exchange_rate ?? 130));
            try { sessionStorage.setItem('pp_biz_id', bizId!); sessionStorage.setItem('pp_biz_rate', String(biz.exchange_rate ?? 130)); } catch { /* full */ }
          }
        }
      }

      const [expenses, supRes] = await Promise.all([
        getExpenses(),
        supabase.from('suppliers').select('id,name').eq('business_id', bizId ?? '').order('name'),
      ]);

      if (supRes.data?.length) {
        setSuppliers(supRes.data as Supplier[]);
      }

      const supMap: Record<string, string> = {};
      for (const s of supRes.data ?? []) supMap[s.id] = s.name;

      if (expenses.length > 0) {
        setExpenses(
          expenses.map((e: any) => ({
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
        // Persist to sessionStorage for instant re-load
        try {
          const supList = supRes.data ?? [];
          sessionStorage.setItem('pp_expenses_list', JSON.stringify({ expenses: expenses.map((e: any) => ({
            id: e.id, description: e.description, category: e.category ?? 'Autre',
            amount: Number(e.amount), currency: e.currency ?? 'HTG',
            payment_status: e.payment_status ?? 'Payé', payment_method: e.payment_method ?? 'Espèces',
            date: e.date, supplier_id: e.supplier_id ?? null,
          })), suppliers: supList }));
        } catch { /* storage full */ }
      } else {
        setIsDemo(true);
      }
    } catch (e: any) {
      console.error('[ExpensesPage] loadAll:', e?.message);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
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

  const ASSET_CATS = ['Matériel Bureau', 'Fournitures', 'Achat Équipement', 'Terrain/Bâtiment', 'Transport et Frais de déplacement'];

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
      if (quickFilter === 'actif'   && !ASSET_CATS.includes(e.category))    return false;
      // Default view: hide asset categories so they don't mix with expenses
      if (quickFilter === 'tout'    && ASSET_CATS.includes(e.category))     return false;
      return true;
    });
  }, [expenses, filterCat, filterStatus, filterMonth, filterMethod, search, quickFilter]);

  // ── Summary stats ────────────────────────────────────────────────────────────

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const toHtg = (amount: number, currency: string) =>
    currency === 'USD' ? amount * exchangeRate : amount;

  const stats = useMemo(() => {
    const thisMonth  = expenses.filter(e => e.date.startsWith(currentMonth));
    const totalMonth = thisMonth
      .filter(e => !ASSET_CATS.includes(e.category))
      .reduce((s, e) => s + toHtg(e.amount, e.currency), 0);
    const totalSalary= expenses.filter(e => !ASSET_CATS.includes(e.category) && e.category === 'Salaire').reduce((s, e) => s + toHtg(e.amount, e.currency), 0);
    const totalDebt  = expenses.filter(e => e.category === 'Remboursements').reduce((s, e) => s + toHtg(e.amount, e.currency), 0);
    const pending    = expenses.filter(e => !ASSET_CATS.includes(e.category) && e.payment_status === 'En attente').reduce((s, e) => s + toHtg(e.amount, e.currency), 0);
    const totalAsset = expenses.filter(e => ASSET_CATS.includes(e.category)).reduce((s, e) => s + toHtg(e.amount, e.currency), 0);
    return { totalMonth, totalSalary, totalDebt, pending, totalAsset };
  }, [expenses, currentMonth, exchangeRate]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[var(--color-bg)] px-4 py-6 text-[var(--color-text)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">

          {/* ── Page header ── */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-[var(--color-muted)]">{t({ fr: 'Dépenses', ht: 'Depans' })}</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#001F3F] md:text-4xl">
                {t({ fr: 'Suivi des sorties de trésorerie', ht: 'Sivi sou lajan k ap soti' })}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
                {t({ fr: 'Contrôlez tous vos cash outflows en temps réel — salaires, loyers, stocks et remboursements.', ht: 'Kontwole tout lajan k ap soti an tan reyèl — salè, lwaye, stock ak ranbousman.' })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isDemo && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400">
                  📊 {t({ fr: 'Données démo', ht: 'Done Demo' })}
                </span>
              )}
              <button
                onClick={openAdd}
                className="flex items-center gap-2 rounded-2xl bg-[#001F3F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002D5B] active:scale-95"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t({ fr: 'Ajouter Dépense', ht: 'Ajoute Depans' })}
              </button>
            </div>
          </div>

          {/* ── Summary cards ── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label={t({ fr: 'Total ce mois-ci', ht: 'Total mwa sa a' })}
              value={fmtAmt(stats.totalMonth, 'HTG')}
              sub={t({ fr: 'Dépenses du mois courant', ht: 'Depans mwa sa a' })}
              accent="bg-[#001F3F]"
              icon={<svg className="h-5 w-5 text-[#001F3F]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" /></svg>}
            />
            <StatCard
              label={t({ fr: 'Total Salaires', ht: 'Total Salè' })}
              value={fmtAmt(stats.totalSalary, 'HTG')}
              sub={t({ fr: 'Salaires cumulés', ht: 'Salè kimyile' })}
              accent="bg-blue-500"
              icon={<svg className="h-5 w-5 text-blue-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            />
            <StatCard
              label={t({ fr: 'Total Dettes Payées', ht: 'Total Dèt Peye' })}
              value={fmtAmt(stats.totalDebt, 'HTG')}
              sub={t({ fr: 'Remboursements', ht: 'Ranbousman' })}
              accent="bg-orange-500"
              icon={<svg className="h-5 w-5 text-orange-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>}
            />
            <StatCard
              label={t({ fr: 'En Attente', ht: 'An Atant' })}
              value={fmtAmt(stats.pending, 'HTG')}
              sub={t({ fr: 'À payer bientôt', ht: 'Peye talè' })}
              accent="bg-amber-500"
              icon={<svg className="h-5 w-5 text-amber-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard
              label={t({ fr: 'Achats Actifs', ht: 'Acha Aktif' })}
              value={fmtAmt(stats.totalAsset, 'HTG')}
              sub={t({ fr: 'Équipement, terrain, matériel', ht: 'Ekipman, tèren, materyèl' })}
              accent="bg-amber-600"
              icon={<svg className="h-5 w-5 text-amber-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>}
            />
          </div>

          {/* ── Filters ── */}
          <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            {/* Quick filters */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {([
                { k: 'tout',    label: t({ fr: 'Tout afficher', ht: 'Montre tout' }) },
                { k: 'salaire', label: t({ fr: '💼 Salaires seulement', ht: '💼 Sèlman Salè' }) },
                { k: 'dette',   label: t({ fr: '💳 Dettes seulement', ht: '💳 Sèlman Dèt' }) },
                { k: 'attente', label: t({ fr: '⏳ En attente seulement', ht: '⏳ Sèlman An Atant' }) },
                { k: 'actif',   label: t({ fr: '🏗 Actifs seulement', ht: '🏗 Sèlman Aktif' }) },
              ] as const).map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setQuickFilter(k)}
                  className={`rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                    quickFilter === k
                      ? 'bg-[#001F3F] text-white shadow-sm'
                      : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'
                  }`}>
                  {label}
                </button>
              ))}
              {(filterCat || filterStatus || filterMonth || filterMethod || search || quickFilter !== 'tout') && (
                <button type="button"
                  onClick={() => { setFilterCat(''); setFilterStatus(''); setFilterMonth(''); setFilterMethod(''); setSearch(''); setQuickFilter('tout'); }}
                  className="ml-auto flex items-center gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-muted)] transition hover:bg-slate-100 hover:text-[var(--color-text)]">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {t({ fr: 'Effacer filtres', ht: 'Efase filtè' })}
                </button>
              )}
            </div>

            {/* Advanced filters */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {/* Search */}
              <div className="col-span-2 lg:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">{t({ fr: 'Recherche', ht: 'Rechèch' })}</label>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={t({ fr: 'Rechercher par description…', ht: 'Chèche pa deskripsyon…' })}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)] focus:border-[#001F3F]/50 focus:ring-1 focus:ring-[#6b5cff]/30" />
              </div>
              {/* Category */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">{t({ fr: 'Catégorie', ht: 'Kategori' })}</label>
                <div className="relative">
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 pr-9 text-sm text-[var(--color-text)] outline-none focus:border-[#001F3F]/50">
                    <option value="">{t({ fr: 'Tout', ht: 'Tout' })}</option>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              {/* Status */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">{t({ fr: 'Statut', ht: 'Estati' })}</label>
                <div className="relative">
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 pr-9 text-sm text-[var(--color-text)] outline-none focus:border-[#001F3F]/50">
                    <option value="">{t({ fr: 'Tout', ht: 'Tout' })}</option>
                    <option value="Payé">{t({ fr: '✓ Payé', ht: '✓ Peye' })}</option>
                    <option value="En attente">{t({ fr: '⏳ En attente', ht: '⏳ Ap tann' })}</option>
                    <option value="Dette">{t({ fr: '⚠ Dette', ht: '⚠ Dèt' })}</option>
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              {/* Month */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">{t({ fr: 'Mois', ht: 'Mwa' })}</label>
                <input value={filterMonth} onChange={e => setFilterMonth(e.target.value)} type="month"
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[#001F3F]/50" />
              </div>
            </div>
          </div>

          {/* ── Transactions table ── */}
          <div className="rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            {/* Table header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-[#001F3F]">{t({ fr: 'Historique des transactions', ht: 'Istorik Tranzaksyon yo' })}</h2>
                <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                  {filtered.length} {t({ fr: filtered.length > 1 ? 'résultats' : 'résultat', ht: 'rezilta' })}
                  {filtered.length !== expenses.length
                    ? ` (${t({ fr: 'sur', ht: 'sou' })} ${expenses.length} ${t({ fr: 'total', ht: 'total' })})`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M3 8h18M3 12h12M3 16h8" />
                </svg>
                {filtered.length}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#6b5cff]" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <svg className="mx-auto mb-4 h-12 w-12 text-slate-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
                <p className="text-sm font-medium text-[var(--color-muted)]">{t({ fr: 'Aucun résultat ne correspond aux filtres', ht: 'Okenn rezilta koresponn ak filtè yo' })}</p>
                <p className="mt-1 text-xs text-slate-400">{t({ fr: 'Ajustez les filtres ou ajoutez une nouvelle dépense', ht: 'Ajiste filtè yo oswa ajoute yon nouvo depans' })}</p>
              </div>
            ) : (
              <>
                {/* Mobile-scrollable table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        {[t({ fr: 'Date', ht: 'Dat' }), t({ fr: 'Description', ht: 'Deskripsyon' }), t({ fr: 'Catégorie', ht: 'Kategori' }), t({ fr: 'Montant', ht: 'Montan' }), t({ fr: 'Méthode', ht: 'Metòd' }), t({ fr: 'Statut', ht: 'Estati' }), ''].map(h => (
                          <th key={h} className="whitespace-nowrap px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((exp, i) => {
                        const isAsset = ASSET_CATS.includes(exp.category);
    const cat = catOf(exp.category);
                        const sts = STATUS_CFG[exp.payment_status] ?? STATUS_CFG['Payé'];
                        return (
                          <tr key={exp.id}
                            className={`group border-b border-white/5 transition-colors hover:bg-slate-50 ${i === filtered.length - 1 ? 'border-b-0' : ''}`}>
                            {/* Date */}
                            <td className="whitespace-nowrap px-5 py-4 text-xs text-[var(--color-muted)]">
                              {new Date(exp.date).toLocaleDateString('fr-FR', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </td>
                            {/* Description */}
                            <td className="px-5 py-4">
                              <p className="max-w-[220px] truncate font-medium text-[var(--color-text)]">
                                {exp.description}
                              </p>
                              {exp.supplier_name && (
                                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
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
                              {isAsset && (
                                <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                                  🏗 Actif
                                </span>
                              )}
                            </td>
                            {/* Amount */}
                            <td className="whitespace-nowrap px-5 py-4">
                              <p className="font-bold text-[var(--color-text)]">{fmtAmt(exp.amount, exp.currency)}</p>
                            </td>
                            {/* Method */}
                            <td className="whitespace-nowrap px-5 py-4 text-xs text-[var(--color-muted)]">
                              {exp.payment_method === 'Espèces' ? '💵' : exp.payment_method === 'Carte' ? '💳' : '📱'}
                              {' '}{exp.payment_method}
                            </td>
                            {/* Status badge */}
                            <td className="px-5 py-4">
                              <span className={`inline-block rounded-full px-3 py-1 text-[11px] font-semibold ${sts.cls}`}>
                                {t(sts.label)}
                              </span>
                            </td>
                            {/* Actions — visible on hover */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  onClick={() => openEdit(exp)}
                                  title={t({ fr: 'Modifier', ht: 'Modifye' })}
                                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-[#EAF1F8] hover:text-[#001F3F]">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(exp)}
                                  title={t({ fr: 'Supprimer', ht: 'Efase' })}
                                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-red-500/20 hover:text-red-400">
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
                <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-3">
                  <span className="text-xs text-[var(--color-muted)]">
                    {filtered.length} {t({ fr: 'dépense', ht: 'depans' })}{filtered.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-bold text-[#001F3F]">
                    {t({ fr: 'Total : ', ht: 'Total : ' })}
                    <span className="text-[#001F3F]">
                      {fmtAmt(filtered.reduce((s, e) => s + toHtg(e.amount, e.currency), 0), 'HTG')}
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
