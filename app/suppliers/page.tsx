'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/utils';
import { upsertSupplier, deleteSupplier, markPurchasePaid } from '../actions/suppliers';
import { useLanguage } from '../../components/LanguageWrapper';
import { useCompany } from '../../hooks/useCompany';
import { EntityDocuments } from '../../components/documents/EntityDocuments';
import {
  ChevronDown, ChevronUp, CreditCard, Edit2, Loader2, Plus,
  Trash2, Users, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Currency = 'HTG' | 'USD';

type Purchase = {
  id: string;
  po_number: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  total_amount: number;
  paid_amount: number;
  /** Reste dû : total_amount − paid_amount, jamais négatif (règle de /dettes). */
  remaining: number;
  currency: Currency;
  payment_status: string;
  purchase_date: string;
};

type Supplier = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  discount_percent: number;
  /** Au moins un achat non soldé avec un reste dû, quelle que soit la devise. */
  hasDebt: boolean;
  created_at: string;
  purchases: Purchase[];
};

// ── Config ────────────────────────────────────────────────────────────────────

// Statuts d'un achat non soldé — ceux que le déclencheur fn_on_purchase_payment
// compte dans la dette fournisseur. `paid`, `cancelled` et `refunded` n'ont rien
// à régler : markPurchasePaid les refuse.
const OPEN_PURCHASE_STATUSES = new Set(['credit', 'partial', 'pending', 'overdue']);
// Sous un centime, markPurchasePaid répond « déjà payé ».
const OWED_MIN = 0.01;

function isOwed(p: Purchase) {
  return OPEN_PURCHASE_STATUSES.has(p.payment_status) && p.remaining >= OWED_MIN;
}

// `purchases.payment_status` est l'énum payment_status_type, en minuscules.
const PURCHASE_STATUS_LABEL: Record<string, { fr: string; ht: string }> = {
  pending:   { fr: 'En attente', ht: 'Annatant' },
  partial:   { fr: 'Partiel',    ht: 'Pasyèl' },
  paid:      { fr: 'Payé',       ht: 'Peye' },
  credit:    { fr: 'Crédit',     ht: 'Kredi' },
  overdue:   { fr: 'En retard',  ht: 'An reta' },
  cancelled: { fr: 'Annulé',     ht: 'Anile' },
  refunded:  { fr: 'Remboursé',  ht: 'Ranbouse' },
};

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(supplier.name);
  const [email, setEmail] = useState(supplier.email ?? '');
  const [phone, setPhone] = useState(supplier.phone ?? '');
  const [discount, setDiscount] = useState(String(supplier.discount_percent));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setErr('');
    try {
      await upsertSupplier({
        id: supplier.id,
        name,
        email: email || undefined,
        phone: phone || undefined,
        discount_percent: parseFloat(discount) || 0,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-anthracite">Modifier le fournisseur</h3>
          <button onClick={onClose} className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-full p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nom *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">{t({ fr: 'Email', ht: 'Imèl' })}</label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t({ fr: 'Téléphone', ht: 'Telefòn' })}</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Escompte (%)</label>
            <input
              value={discount}
              onChange={e => setDiscount(e.target.value)}
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        {err && <p className="mt-3 text-xs text-red-600">{err}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-h disabled:opacity-50"
          >
            {saving
              ? t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' })
              : t({ fr: 'Enregistrer les changements', ht: 'Anrejistre chanjman yo' })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({
  supplier,
  onClose,
  onConfirm,
}: {
  supplier: Supplier;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const hasPurchases = supplier.purchases.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <Trash2 className="h-5 w-5 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-anthracite">
          Supprimer &ldquo;{supplier.name}&rdquo; ?
        </h3>
        {/* La suppression est douce (deleted_at, app/actions/suppliers.ts) : les
            achats ne sont ni effacés ni orphelins, rien n'exige de les réassigner. */}
        <p className="mt-2 text-sm text-slate-500">
          {t({
            fr: 'Le fournisseur ne sera plus proposé dans vos listes ni dans le formulaire d’achat.',
            ht: 'Founisè a p ap parèt ankò nan lis ou yo ni nan fòmilè acha a.',
          })}
        </p>
        {hasPurchases && (
          <p className="mt-2 text-sm text-slate-500">
            {t({
              fr: `Ses ${supplier.purchases.length} achat(s) restent dans votre historique, toujours rattachés à ce fournisseur${supplier.hasDebt ? ', et les dettes en cours restent à payer' : ''}.`,
              ht: `${supplier.purchases.length} acha li yo rete nan istorik ou, toujou mare ak founisè sa a${supplier.hasDebt ? ', epi dèt ki poko peye yo rete pou peye' : ''}.`,
            })}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
            disabled={busy}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? t({ fr: 'Suppression…', ht: 'Siprime…' }) : t({ fr: 'Supprimer', ht: 'Siprime' })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  // Inline add-form state
  const [form, setForm] = useState({ name: '', email: '', phone: '', discount: '' });
  const [formSaving, setFormSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Busy purchase IDs (marking as paid)
  const [busyPurchases, setBusyPurchases] = useState<Set<string>>(new Set());

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      setOwnerId(res.data?.user?.id ?? null);
    });
    loadAll();
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    try {
      // 1. Fetch suppliers with their running totals
      const { data: suppData } = await supabase
        .from('suppliers')
        .select('id,name,email,phone,discount_percent,created_at')
        .is('deleted_at', null)
        .order('name');

      // 2. Fetch purchases with their items in one query
      const { data: purchData } = await supabase
        .from('purchases')
        .select(`
          id, supplier_id, po_number, purchase_date,
          total_amount, paid_amount, currency, payment_status,
          purchase_items ( product_name, quantity, unit_cost )
        `)
        .is('deleted_at', null)
        .order('purchase_date', { ascending: false });

      // 3. Build supplier_id → purchases map
      const purchMap: Record<string, Purchase[]> = {};
      for (const p of purchData ?? []) {
        const items: any[] = (p as any).purchase_items ?? [];
        const firstItem = items[0];
        if (!purchMap[p.supplier_id]) purchMap[p.supplier_id] = [];
        const total = Number(p.total_amount);
        const paid  = Number((p as any).paid_amount ?? 0);
        purchMap[p.supplier_id].push({
          id:           p.id,
          po_number:    p.po_number ?? p.id,
          product_name: items.map((i: any) => i.product_name).join(', ') || '—',
          quantity:     items.reduce((s: number, i: any) => s + Number(i.quantity), 0),
          unit_cost:    Number(firstItem?.unit_cost ?? 0),
          total_amount: total,
          paid_amount:  paid,
          // Ce qui reste dû, pas le total : un règlement partiel alimente
          // paid_amount (même règle que /dettes et markPurchasePaid).
          remaining:    parseFloat(Math.max(0, total - paid).toFixed(2)),
          currency:     (p as any).currency === 'USD' ? 'USD' : 'HTG',
          payment_status: p.payment_status,
          purchase_date: p.purchase_date,
        });
      }

      // Les sommes (dette, total acheté) sont calculées au rendu : elles
      // convertissent les USD au taux de l'entreprise, chargé à part.
      setSuppliers(
        (suppData ?? []).map((s: any) => {
          const supplierPurchases = purchMap[s.id] ?? [];
          return {
            id:                  s.id,
            name:                s.name,
            email:               s.email ?? undefined,
            phone:               s.phone ?? undefined,
            discount_percent:    Number(s.discount_percent ?? 0),
            hasDebt:             supplierPurchases.some(isOwed),
            created_at:          s.created_at,
            purchases:           supplierPurchases,
          };
        })
      );
    } catch (e: any) {
      console.error('[loadAll suppliers]', e?.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !ownerId) return;
    setFormSaving(true);
    setFormErr('');
    try {
      await upsertSupplier({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        discount_percent: parseFloat(form.discount) || 0,
      });
      setForm({ name: '', email: '', phone: '', discount: '' });
      await loadAll();
    } catch (e: any) {
      setFormErr(e.message);
    }
    setFormSaving(false);
  }

  async function handleDelete(supplier: Supplier) {
    try {
      await deleteSupplier(supplier.id);
      setDeleteTarget(null);
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handlePurchasePaid(purchaseId: string) {
    setBusyPurchases(s => new Set(s).add(purchaseId));
    try {
      const res = await markPurchasePaid(purchaseId);
      // Rien de réglé (déjà payé, annulé, ou reste dû changé entre l'affichage
      // et le clic) : on le dit, puis on recharge pour afficher l'état réel.
      if (!res.settled) {
        alert(t(
          res.reason === 'already_settled'
            ? { fr: 'Cet achat est déjà payé : rien n\'a été enregistré.', ht: 'Acha sa a deja peye : anyen pa anrejistre.' }
            : res.reason === 'cancelled'
              ? { fr: 'Cet achat est annulé ou remboursé : rien n\'a été enregistré.', ht: 'Acha sa a anile oswa ranbouse : anyen pa anrejistre.' }
              : { fr: 'Le reste dû vient de changer : rien n\'a été enregistré. Vérifiez le montant puis réessayez.', ht: 'Montan ki rete a sot chanje : anyen pa anrejistre. Verifye montan an epi eseye ankò.' },
        ));
      }
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyPurchases(s => { const n = new Set(s); n.delete(purchaseId); return n; });
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────────

  // Le solde dû additionnait `total_amount` de tout achat non « paid » : un
  // acompte ne le faisait pas baisser, un achat annulé y restait, et 50 USD +
  // 50 HTG y valaient « 100 HTG ». Désormais : reste dû des achats non soldés,
  // USD convertis au taux de l'entreprise comme sur /dettes. Sans taux valide,
  // un total qui contient des USD s'affiche « … » plutôt qu'un chiffre faux.
  const { company } = useCompany();
  const rate = company?.exchangeRate && company.exchangeRate > 0 ? company.exchangeRate : null;

  const totals = useMemo(() => {
    const sumHtg = (items: Purchase[], amount: (p: Purchase) => number): number | null => {
      let sum = 0;
      for (const p of items) {
        const n = amount(p);
        if (p.currency === 'USD') {
          if (rate === null) return null;
          sum += n * rate;
        } else {
          sum += n;
        }
      }
      return sum;
    };

    const bySupplier = new Map<string, { owed: number | null; purchased: number | null }>();
    let debt: number | null = 0;
    for (const sup of suppliers) {
      const owed      = sumHtg(sup.purchases.filter(isOwed), p => p.remaining);
      const purchased = sumHtg(sup.purchases, p => p.total_amount);
      bySupplier.set(sup.id, { owed, purchased });
      debt = debt === null || owed === null ? null : debt + owed;
    }
    return { bySupplier, debt };
  }, [suppliers, rate]);

  const htg = (n: number | null) => (n === null ? '…' : formatCurrency(n));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[var(--color-bg)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">

          {/* ── Page header ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm uppercase tracking-[0.3em] text-primary/90">{t({ fr: 'Fournisseurs', ht: 'Founisè yo' })}</p>
            <h1 className="mt-1 text-2xl font-semibold text-anthracite md:text-3xl">
              Gestion des Fournisseurs
            </h1>
            <p className="mt-1 text-sm text-anthracite/60">
              Ajoutez des fournisseurs, suivez les dettes crédit et consultez l&apos;historique des achats.
            </p>
          </div>

          {/* ── Inline add form (horizontal) ── */}
          <form
            onSubmit={handleAdd}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              {t({ fr: 'Ajouter un fournisseur', ht: 'Ajoute yon founisè' })}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {/* Nom */}
              <div className="flex-[2] min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500">Nom *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t({ fr: 'Fournisseur S.A.', ht: 'Founisè S.A.' })}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white"
                />
              </div>
              {/* Email */}
              <div className="flex-1 min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500">{t({ fr: 'Email', ht: 'Imèl' })}</label>
                <input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contact@founisè.com"
                  type="email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white"
                />
              </div>
              {/* Téléphone */}
              <div className="flex-1 min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500">{t({ fr: 'Téléphone', ht: 'Telefòn' })}</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+509 XXXX-XXXX"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white"
                />
              </div>
              {/* Escompte */}
              <div className="w-28 shrink-0">
                <label className="mb-1 block text-xs font-medium text-slate-500">Escompte (%)</label>
                <input
                  value={form.discount}
                  onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                  placeholder="0"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white"
                />
              </div>
              {/* Submit */}
              <button
                type="submit"
                disabled={formSaving || !form.name.trim()}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-h disabled:opacity-50"
              >
                {formSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t({ fr: 'Ajouter le fournisseur', ht: 'Ajoute founisè a' })}
              </button>
            </div>
            {formErr && <p className="mt-2 text-xs text-red-600">{formErr}</p>}
          </form>

          {/* ── Analytics cards ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-anthracite/50">Total Founisè</p>
                <p className="mt-0.5 text-2xl font-bold text-anthracite">{suppliers.length}</p>
                <p className="text-note text-anthracite/40">Fournisseurs actifs</p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100">
                <CreditCard className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-anthracite/50">
                  Total Achat à Crédit
                </p>
                <p className="mt-0.5 text-2xl font-bold text-anthracite">
                  {htg(totals.debt)}
                </p>
                <p className="text-note text-anthracite/40">Dette totale en cours</p>
              </div>
            </div>
          </div>

          {/* ── Suppliers table ── */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-semibold text-anthracite">Liste des Fournisseurs</h2>
              <p className="text-sm text-anthracite/60">
                Cliquez sur une ligne pour voir l&apos;historique des transactions.
              </p>
            </div>

            {loading ? (
              <p className="py-12 text-center text-sm text-slate-400">Chargement…</p>
            ) : suppliers.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">
                Aucun fournisseur enregistré. Utilisez le formulaire ci-dessus pour en ajouter un.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {suppliers.map(sup => {
                  const isExpanded = expandedId === sup.id;
                  const hasDebt = sup.hasDebt;
                  const supTotals = totals.bySupplier.get(sup.id) ?? { owed: null, purchased: null };

                  return (
                    <div key={sup.id}>
                      {/* ── Supplier row ── */}
                      <div
                        className="flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-slate-50"
                        onClick={() => setExpandedId(isExpanded ? null : sup.id)}
                        role="button"
                        aria-expanded={isExpanded}
                      >
                        {/* Expand toggle */}
                        <div className="shrink-0 text-slate-400">
                          {isExpanded
                            ? <ChevronUp size={16} />
                            : <ChevronDown size={16} />}
                        </div>

                        {/* Avatar */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                          {sup.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Name + contact */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-anthracite">{sup.name}</p>
                          <p className="truncate text-xs text-slate-400">
                            {sup.email || '—'}
                            {sup.phone ? ` · ${sup.phone}` : ''}
                          </p>
                        </div>

                        {/* Escompte */}
                        <div className="hidden w-20 text-center sm:block">
                          <p className="text-note text-slate-400">Escompte</p>
                          <p className="text-sm font-medium text-anthracite">
                            {sup.discount_percent}%
                          </p>
                        </div>

                        {/* Nb achats */}
                        <div className="hidden w-20 text-center md:block">
                          <p className="text-note text-slate-400">Achats</p>
                          <p className="text-sm font-medium text-anthracite">
                            {sup.purchases.length}
                          </p>
                        </div>

                        {/* Dette + badge */}
                        <div className="w-36 text-right">
                          <p className={`text-sm font-bold ${hasDebt ? 'text-red-600' : 'text-emerald-600'}`}>
                            {htg(supTotals.owed)}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-note font-semibold ${
                              hasDebt
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {hasDebt ? 'Dette' : 'Soldé'}
                          </span>
                        </div>

                        {/* Edit / Delete */}
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setEditSupplier(sup)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary"
                            title={t({ fr: 'Modifier', ht: 'Modifye' })}
                            aria-label={t({ fr: 'Modifier', ht: 'Modifye' })}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(sup)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title={t({ fr: 'Supprimer', ht: 'Siprime' })}
                            aria-label={t({ fr: 'Supprimer', ht: 'Siprime' })}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* ── Expanded — transaction history ── */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                          {sup.purchases.length === 0 ? (
                            <p className="py-4 text-center text-sm text-slate-400">
                              Aucune transaction enregistrée pour ce fournisseur.
                            </p>
                          ) : (
                            <>
                              <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                                Historique des transactions ({sup.purchases.length})
                              </h4>

                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left text-note uppercase tracking-wider text-slate-400">
                                      <th className="pb-2 pr-4 font-medium">Produit</th>
                                      <th className="pb-2 px-2 text-right font-medium">Qté</th>
                                      <th className="pb-2 px-2 text-right font-medium">Prix unit.</th>
                                      <th className="pb-2 px-2 text-right font-medium">Total</th>
                                      <th className="pb-2 px-2 text-right font-medium">{t({ fr: 'Reste dû', ht: 'Rès dwe' })}</th>
                                      <th className="pb-2 px-2 text-center font-medium">Date</th>
                                      <th className="pb-2 px-2 text-center font-medium">Statut</th>
                                      <th className="pb-2 pl-2"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {sup.purchases.map(p => (
                                      <tr
                                        key={p.id}
                                        className="transition-colors hover:bg-white"
                                      >
                                        <td className="py-2.5 pr-4 font-medium text-anthracite">
                                          {p.product_name}
                                        </td>
                                        <td className="py-2.5 px-2 text-right text-slate-600">
                                          {p.quantity}
                                        </td>
                                        <td className="py-2.5 px-2 text-right text-slate-600">
                                          {formatCurrency(p.unit_cost, p.currency)}
                                        </td>
                                        <td className="py-2.5 px-2 text-right font-semibold text-anthracite">
                                          {formatCurrency(p.total_amount, p.currency)}
                                        </td>
                                        {/* Reste dû dans la devise de l'achat ; le total en
                                            rappel quand un paiement partiel a été versé. */}
                                        <td className="py-2.5 px-2 text-right">
                                          {isOwed(p) ? (
                                            <>
                                              <p className="font-semibold text-red-600">{formatCurrency(p.remaining, p.currency)}</p>
                                              {p.paid_amount >= OWED_MIN && (
                                                <p className="text-note text-slate-400">
                                                  {t({ fr: 'sur ', ht: 'sou ' })}{formatCurrency(p.total_amount, p.currency)}
                                                </p>
                                              )}
                                            </>
                                          ) : (
                                            <span className="text-slate-400">—</span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-2 text-center text-xs text-slate-500">
                                          {new Date(p.purchase_date).toLocaleDateString('fr-FR')}
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                          <span
                                            className={`rounded-full px-2 py-0.5 text-note font-semibold ${
                                              p.payment_status === 'paid'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : p.payment_status === 'cancelled' || p.payment_status === 'refunded'
                                                  ? 'bg-slate-100 text-slate-600'
                                                  : 'bg-red-100 text-red-700'
                                            }`}
                                          >
                                            {t(PURCHASE_STATUS_LABEL[p.payment_status] ?? { fr: p.payment_status, ht: p.payment_status })}
                                          </span>
                                        </td>
                                        <td className="py-2.5 pl-2">
                                          {/* Tout achat non soldé (credit, partial, pending,
                                              overdue) avec un reste dû : markPurchasePaid règle
                                              ce reste, pas le total. */}
                                          {isOwed(p) && (
                                            <button
                                              onClick={() => handlePurchasePaid(p.id)}
                                              disabled={busyPurchases.has(p.id)}
                                              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-ink hover:bg-accent-h disabled:opacity-50"
                                            >
                                              {busyPurchases.has(p.id) ? (
                                                <Loader2 size={10} className="animate-spin" />
                                              ) : null}
                                              Payer
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Summary row */}
                              <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                                <span className="text-xs text-slate-500">
                                  Total acha :{' '}
                                  <span className="font-semibold text-anthracite">
                                    {htg(supTotals.purchased)}
                                  </span>
                                </span>
                                <span className="text-xs text-slate-500">
                                  Rès dwe :{' '}
                                  <span className={`font-semibold ${hasDebt ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {htg(supTotals.owed)}
                                  </span>
                                </span>
                              </div>
                            </>
                          )}

                          {/* ── Documents rattachés (§37) ────────────────────
                              Dans le repli, pas dans la ligne : le bloc ne se
                              charge que pour le fournisseur qu'on a ouvert. */}
                          <EntityDocuments
                            className="mt-4"
                            entityType="supplier"
                            entityId={sup.id}
                            entityName={sup.name}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── Modals ── */}
      {editSupplier && (
        <EditModal
          supplier={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSaved={loadAll}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          supplier={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
    </ProtectedRoute>
  );
}
