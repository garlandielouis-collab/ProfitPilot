'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from './ProtectedRoute';
import { supabase } from '../lib/supabaseClient';
import { upsertExpense, deleteExpense, getExpenses } from '../app/actions/expenses';
import { Button, FirstRun, NoResult, closestMatch } from './ds';
// Les modes de paiement étaient annoncés par 💵 💳 📱 — trois dessins faits par
// le téléphone, jamais les mêmes d'un appareil à l'autre, et illisibles en
// plein soleil. Le mot suffisait déjà ; l'icône, quand elle reste, est en
// lucide et de la couleur du texte (§3.5).
import { Banknote, Building2, CreditCard, Smartphone } from 'lucide-react';
import {
  businessShareOf, personalShareOf, SCOPE_LABELS, type ExpenseScope,
} from '../lib/expenseScope';

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
  /** Diagnostic 6 : business, personnel, ou partagé entre les deux. */
  scope: ExpenseScope;
  business_share_pct: number;
};

type Supplier = { id: string; name: string };

// ── Config ───────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'Salaire',               label: 'Salè',                    badge: 'bg-blue-100 text-blue-700',       dot: '#60A5FA' },
  { value: 'Loyer',                 label: 'Lwaye',                   badge: 'bg-violet-100 text-violet-700',   dot: '#A78BFA' },
  { value: 'Stock',                 label: 'Achte Stock',             badge: 'bg-cyan-100 text-cyan-700',       dot: '#22D3EE' },
  { value: 'Marketing',             label: 'Marketing',               badge: 'bg-pink-100 text-pink-700',       dot: '#64748B' },
  { value: 'Publicité',             label: 'Réklam',                  badge: 'bg-red-100 text-red-700',         dot: '#DC2626' },
  { value: 'Téléphone',             label: 'Telepòn/Internet',        badge: 'bg-teal-100 text-teal-700',       dot: '#50C878' },
  { value: 'Électricité',           label: 'Elektrisite',             badge: 'bg-yellow-100 text-yellow-700',   dot: '#FBBF24' },
  { value: 'Internet',              label: 'Entènèt',                 badge: 'bg-indigo-100 text-indigo-700',   dot: '#64748B' },
  { value: 'Frais Entretien',       label: 'Frè Antretyen',           badge: 'bg-emerald-100 text-emerald-700', dot: '#50C878' },
  { value: 'Frais Bancaires',       label: 'Frè Bank',                badge: 'bg-amber-100 text-amber-700',     dot: '#B45309' },
  { value: 'Matériel Bureau',       label: 'Materyal Biwo',           badge: 'bg-fuchsia-100 text-fuchsia-700', dot: '#D946EF' },
  { value: 'Fournitures',           label: 'Founiti',                 badge: 'bg-lime-100 text-lime-700',       dot: '#84CC16' },
  { value: 'Achat Équipement',      label: 'Ach Ekipman',             badge: 'bg-rose-100 text-rose-700',       dot: '#F43F5E' },
  { value: 'Véhicule',              label: 'Veyikil',                 badge: 'bg-cyan-100 text-cyan-700',       dot: '#64748B' },
  { value: 'Terrain/Bâtiment',      label: 'Tèren/Batisman',          badge: 'bg-orange-100 text-orange-700',   dot: '#B45309' },
  { value: 'Remboursements',        label: 'Rembòsman Dèt',           badge: 'bg-orange-100 text-orange-700',   dot: '#B45309' },
  { value: 'Autre',                 label: 'Lòt',                     badge: 'bg-slate-100 text-slate-400',     dot: '#94A3B8' },
] as const;

const STATUS_CFG: Record<PayStatus, { label: string; cls: string }> = {
  'Payé':       { label: 'Payé',        cls: 'bg-emerald-100 text-emerald-700' },
  'En attente': { label: 'En attente',  cls: 'bg-amber-100 text-amber-700'    },
  'Dette':      { label: 'Dette',       cls: 'bg-red-100 text-red-600'        },
};

const catOf = (v: string) => CATEGORIES.find(c => c.value === v) ?? CATEGORIES[4];

// ── Aucune dépense de démonstration (audit §1.1, §5.10) ──────────────────────
//
// Cinq dépenses inventées — un salaire de 85 000 HTG, un loyer de Pétionville,
// une dette fournisseur en dollars — et trois fournisseurs qui n'existaient pas,
// affichés tant que la base ne répondait pas, et laissés en place quand elle
// échouait. La page était intitulée « Suivi des sorties de trésorerie » : elle
// suivait celles de personne.
//
// « Dans un logiciel de gestion, un chiffre affiché est une promesse. »

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
  scope:          'business' as ExpenseScope,
  share:          '100',
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
          scope:          record.scope ?? 'business',
          share:          String(record.business_share_pct ?? 100),
        }
      : FORM_DEF,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof FORM_DEF, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const isDebt = form.category === 'Remboursements';
  // Plus de fournisseurs fictifs à écarter : la liste ne contient que ceux
  // que le marchand a lui-même saisis.
  const realSuppliers = suppliers;

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
        scope:              form.scope,
        business_share_pct: form.scope === 'mixed' ? Number(form.share) || 0 : undefined,
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

  const input = 'w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none ring-1 ring-transparent transition placeholder:text-[var(--color-muted)] focus:ring-primary/30';
  const sel   = `${input} appearance-none pr-10`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-surface border border-[var(--color-border)] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">
              {record ? 'Modifye' : 'Nouvo dépense'}
            </p>
            <h3 className="mt-0.5 text-xl font-semibold text-primary">
              {record ? 'Modifye dépense' : 'Ajoute yon dépense'}
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
              <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}

          {/* Business / Personnel — Diagnostic 6.
              Sans cette distinction, impossible de dire si le business est
              rentable ou s'il est maintenu à flot par la poche du foyer. */}
          {field('Sa se depans ki moun ? *',
            <div>
              <div className="grid grid-cols-3 gap-2">
                {(['business', 'personal', 'mixed'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('scope', s)}
                    className={
                      form.scope === s
                        ? 'rounded-2xl border-2 border-primary bg-primary px-3 py-2.5 text-sm font-semibold text-white transition'
                        : 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm font-medium text-[var(--color-text)] transition hover:border-primary/40'
                    }
                  >
                    {SCOPE_LABELS[s].label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                {SCOPE_LABELS[form.scope as ExpenseScope].hint}
              </p>

              {form.scope === 'mixed' && (
                <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--color-text)]">Pati biznis la</span>
                    <span className="font-bold text-primary">{form.share}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" step="5"
                    value={form.share}
                    onChange={e => set('share', e.target.value)}
                    className="mt-2 w-full accent-accent"
                  />
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Egzanp : yon fòfè telefòn 60% pou biznis la, 40% pou lakay.
                  </p>
                </div>
              )}
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
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* Amount + Currency */}
          {field('Montan *',
            <div className="flex gap-2">
              <div className="flex overflow-hidden rounded-2xl border border-[var(--color-border)] text-sm shrink-0">
                {(['HTG', 'USD'] as Currency[]).map(c => (
                  <button key={c} type="button" onClick={() => set('currency', c)}
                    className={`px-4 py-3 font-bold transition ${form.currency === c
                      ? 'bg-primary text-white'
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
            {field('Estati',
              <div className="relative">
                <select value={form.payment_status} onChange={e => set('payment_status', e.target.value as PayStatus)} className={sel}>
                  <option value="Payé">Payé</option>
                  <option value="En attente">En attente</option>
                  <option value="Dette">Dette</option>
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            {field('Metòd',
              <div className="relative">
                <select value={form.payment_method} onChange={e => set('payment_method', e.target.value as PayMethod)} className={sel}>
                  <option value="Espèces">Espèces</option>
                  <option value="Carte">Carte</option>
                  <option value="Mobile">Mobile</option>
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
              className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">
              Anile
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-h disabled:opacity-50">
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


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-surface border border-[var(--color-border)] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <svg className="h-6 w-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-primary">Efase dépense?</h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          <span className="font-medium text-[var(--color-text)]">{record.description}</span>
          {' '}—{' '}
          <span className="font-semibold text-red-400">{fmtAmt(record.amount, record.currency)}</span>
          {' '}pral efase pou toujou.
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-slate-100">
            Anile
          </button>
          <button
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
            disabled={busy}
            className="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Efasman…' : 'Wi, Efase'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ExpensesPage() {
  const [expenses,  setExpenses]  = useState<ExpenseRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [ownerId,   setOwnerId]   = useState<string | null>(null);

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
    try {
      const [expenses, supRes] = await Promise.all([
        getExpenses(),
        supabase.from('suppliers').select('id,name').order('name'),
      ]);

      setSuppliers((supRes.data ?? []) as Supplier[]);

      const supMap: Record<string, string> = {};
      for (const s of supRes.data ?? []) supMap[s.id] = s.name;

      // Zéro dépense est une réponse valide : c'est un mois sans sortie, ou un
      // compte neuf. Dans les deux cas la liste reste vide.
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
          scope:              (e.scope ?? 'business') as ExpenseScope,
          business_share_pct: Number(e.business_share_pct ?? 100),
        }))
      );
    } catch (e: any) {
      console.error('[ExpensesPage] loadAll:', e?.message);
      setExpenses([]);
      setSuppliers([]);
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

    // Diagnostic 6 : ce que l'entreprise a réellement dépensé, et ce que le
    // foyer a pris au passage. Ces deux chiffres ne doivent jamais être additionnés.
    const businessMonth = thisMonth.reduce(
      (s, e) => s + businessShareOf(e.amount, e.scope, e.business_share_pct), 0);
    const personalMonth = thisMonth.reduce(
      (s, e) => s + personalShareOf(e.amount, e.scope, e.business_share_pct), 0);

    return { totalMonth, totalSalary, totalDebt, pending, businessMonth, personalMonth };
  }, [expenses, currentMonth]);

  // ── Card helper ──────────────────────────────────────────────────────────────

  function StatCard({ label, value, sub, icon, accent }: {
    label: string; value: string; sub: string;
    icon: React.ReactNode; accent: string;
  }) {
    return (
      <div className={`relative overflow-hidden rounded-surface border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm`}>
        <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-10 blur-2xl ${accent}`} />
        <div className="relative">
          <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${accent} bg-opacity-20`}>
            {icon}
          </div>
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-primary">{value}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[var(--color-bg)] px-4 py-6 text-[var(--color-text)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">

          {/* ── Page header ── */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              {/* Trois lignes disaient la même chose, dont une en anglais :
                  « Depans », « Suivi des sorties de trésorerie », puis
                  « Contrôlez tous vos cash outflows en temps réel ». Le marchand
                  qui ouvre cet écran sait déjà qu'il vient voir ses dépenses ;
                  ce qu'il ne sait pas, c'est ce qu'il doit en faire (audit §9,
                  contrôles 1 et 10). */}
              <h1 className="text-3xl font-semibold text-primary md:text-4xl">
                Dépenses
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
                Chaque dépense notée est une dépense qui cesse de manger votre marge sans qu'on sache où.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">

              <button
                onClick={openAdd}
                className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-h active:scale-95"
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
              label="Depans biznis mwa a"
              value={fmtAmt(stats.businessMonth, 'HTG')}
              sub={stats.personalMonth > 0
                ? `+ ${fmtAmt(stats.personalMonth, 'HTG')} pèsonèl (pa nan rezilta a)`
                : 'Sèlman sa ki nan rezilta antrepriz la'}
              accent="bg-primary"
              icon={<svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" /></svg>}
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
          <div className="rounded-surface border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            {/* Quick filters */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {([
                { k: 'tout',    label: 'Tout afficher' },
                { k: 'salaire', label: 'Salaires seulement' },
                { k: 'dette',   label: 'Dettes seulement' },
                { k: 'attente', label: 'En attente seulement' },
              ] as const).map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setQuickFilter(k)}
                  className={`rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                    quickFilter === k
                      ? 'bg-primary text-white shadow-sm'
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
                  Efase filtè
                </button>
              )}
            </div>

            {/* Advanced filters */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {/* Search */}
              <div className="col-span-2 lg:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">Rechèch</label>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Chèche pa deskripsyon…"
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)] focus:border-primary/50 focus:ring-1 focus:ring-muted/30" />
              </div>
              {/* Category */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">Kategori</label>
                <div className="relative">
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 pr-9 text-sm text-[var(--color-text)] outline-none focus:border-primary/50">
                    <option value="">Tout</option>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              {/* Status */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">Estati</label>
                <div className="relative">
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 pr-9 text-sm text-[var(--color-text)] outline-none focus:border-primary/50">
                    <option value="">Tout</option>
                    <option value="Payé">Payé</option>
                    <option value="En attente">En attente</option>
                    <option value="Dette">Dette</option>
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              {/* Month */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">Mwa</label>
                <input value={filterMonth} onChange={e => setFilterMonth(e.target.value)} type="month"
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-primary/50" />
              </div>
            </div>
          </div>

          {/* ── Transactions table ── */}
          <div className="rounded-surface border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            {/* Table header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-primary">Istorik Tranzaksyon yo</h2>
                <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                  {filtered.length} rezilta
                  {filtered.length !== expenses.length
                    ? ` (sou ${expenses.length} total)`
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
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#64748b]" />
              </div>
            ) : expenses.length === 0 ? (
              /* Premier accueil : aucune dépense n'a jamais été saisie (§5.10). */
              <FirstRun
                title="Vos sorties d'argent s'inscriront ici"
                hint="Loyer, salaires, stock, transport : chaque dépense notée est une dépense qui cesse de manger votre marge sans qu'on sache où."
                action={
                  <Button variant="accent" block onClick={openAdd}>
                    Noter une dépense
                  </Button>
                }
              />
            ) : filtered.length === 0 ? (
              search ? (
                <NoResult
                  query={search}
                  noun="mouvement"
                  suggestion={closestMatch(search, expenses.map(e => e.description))}
                  onUseSuggestion={setSearch}
                  onClear={() => setSearch('')}
                />
              ) : (
                <p className="px-4 py-16 text-center text-body text-[var(--color-muted)]">
                  Aucune dépense ne correspond à ces filtres.
                </p>
              )
            ) : (
              <>
                {/* Mobile-scrollable table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        {['Dat', 'Deskripsyon', 'Kategori', 'Montan', 'Metòd', 'Estati', ''].map(h => (
                          <th key={h} className="whitespace-nowrap px-5 py-4 text-note font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
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
                                <p className="mt-0.5 text-note text-[var(--color-muted)]">
                                  <Building2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={1.8} aria-hidden />
                                  {exp.supplier_name}
                                </p>
                              )}
                            </td>
                            {/* Category badge + périmètre business/personnel */}
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-note font-semibold ${cat.badge}`}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.dot }} />
                                {cat.label}
                              </span>
                              {exp.scope !== 'business' && (
                                <span className={exp.scope === 'personal'
                                  ? 'ml-1.5 inline-flex items-center rounded-full bg-slate-200 px-2 py-1 text-note font-semibold text-slate-600'
                                  : 'ml-1.5 inline-flex items-center rounded-full bg-indigo-100 px-2 py-1 text-note font-semibold text-indigo-700'}
                                >
                                  {exp.scope === 'personal'
                                    ? 'Pèsonèl'
                                    : `Melanje ${exp.business_share_pct}%`}
                                </span>
                              )}
                            </td>
                            {/* Amount */}
                            <td className="whitespace-nowrap px-5 py-4">
                              <p className="font-bold text-[var(--color-text)]">{fmtAmt(exp.amount, exp.currency)}</p>
                            </td>
                            {/* Method */}
                            <td className="whitespace-nowrap px-5 py-4 text-xs text-[var(--color-muted)]">
                              {exp.payment_method === 'Espèces'
                                ? <Banknote className="mr-1 inline h-4 w-4 align-[-3px]" strokeWidth={1.8} aria-hidden />
                                : exp.payment_method === 'Carte'
                                  ? <CreditCard className="mr-1 inline h-4 w-4 align-[-3px]" strokeWidth={1.8} aria-hidden />
                                  : <Smartphone className="mr-1 inline h-4 w-4 align-[-3px]" strokeWidth={1.8} aria-hidden />}
                              {exp.payment_method}
                            </td>
                            {/* Status badge */}
                            <td className="px-5 py-4">
                              <span className={`inline-block rounded-full px-3 py-1 text-note font-semibold ${sts.cls}`}>
                                {sts.label}
                              </span>
                            </td>
                            {/* Actions — visible on hover */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  onClick={() => openEdit(exp)}
                                  title="Modifye"
                                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-muted)] transition hover:bg-nav-active hover:text-primary">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(exp)}
                                  title="Efase"
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
                    {filtered.length} dépense{filtered.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    Total :{' '}
                    <span className="text-primary">
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
