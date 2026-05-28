'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/utils';
import { upsertSupplier, deleteSupplier, markPurchasePaid } from '../actions/suppliers';
import {
  ChevronDown, ChevronUp, CreditCard, Edit2, Loader2, Plus,
  Trash2, Users, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Purchase = {
  id: string;
  product_name: string;
  quantity: number;
  purchase_price_per_unit: number;
  total_purchase_amount: number;
  payment_status: 'Payé' | 'À Crédit';
  purchase_date: string;
};

type Supplier = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  discount_percent: number;
  created_at: string;
  purchases: Purchase[];
  totalDebt: number;
  totalPaid: number;
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
          <h3 className="text-lg font-semibold text-[#212529]">Modifier le fournisseur</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nom *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0056b3]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0056b3]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Téléphone</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0056b3]"
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0056b3]"
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
            className="flex-1 rounded-xl bg-[#0056b3] py-2.5 text-sm font-medium text-white hover:bg-[#004494] disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
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
  const [busy, setBusy] = useState(false);
  const hasPurchases = supplier.purchases.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <Trash2 className="h-5 w-5 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-[#212529]">
          Supprimer &ldquo;{supplier.name}&rdquo; ?
        </h3>
        {hasPurchases ? (
          <p className="mt-2 text-sm text-red-600">
            Ce fournisseur a {supplier.purchases.length} achat(s) enregistré(s). Vous devez d&apos;abord
            supprimer ou réassigner ces achats avant de pouvoir supprimer ce fournisseur.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Cette action est irréversible. Le fournisseur sera définitivement supprimé.
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          {!hasPurchases && (
            <button
              onClick={async () => {
                setBusy(true);
                await onConfirm();
                setBusy(false);
              }}
              disabled={busy}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Suppression…' : 'Supprimer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
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
    const [suppRes, purchRes] = await Promise.all([
      supabase
        .from('suppliers')
        .select('id,name,email,phone,discount_percent,created_at')
        .order('name'),
      supabase
        .from('purchases')
        .select(
          'id,supplier_id,quantity,purchase_price_per_unit,total_purchase_amount,payment_status,purchase_date,products(name)'
        )
        .order('purchase_date', { ascending: false }),
    ]);

    // Map: supplier_id → purchases
    const purchMap: Record<string, Purchase[]> = {};
    for (const p of purchRes.data ?? []) {
      if (!purchMap[p.supplier_id]) purchMap[p.supplier_id] = [];
      purchMap[p.supplier_id].push({
        id: p.id,
        product_name: (p as any).products?.name ?? '—',
        quantity: Number(p.quantity),
        purchase_price_per_unit: Number(p.purchase_price_per_unit),
        total_purchase_amount: Number(p.total_purchase_amount),
        payment_status: p.payment_status as 'Payé' | 'À Crédit',
        purchase_date: p.purchase_date,
      });
    }

    setSuppliers(
      (suppRes.data ?? []).map((s: any) => {
        const purchases = purchMap[s.id] ?? [];
        return {
          id: s.id,
          name: s.name,
          email: s.email ?? undefined,
          phone: s.phone ?? undefined,
          discount_percent: Number(s.discount_percent ?? 0),
          created_at: s.created_at,
          purchases,
          totalDebt: purchases
            .filter(p => p.payment_status === 'À Crédit')
            .reduce((acc, p) => acc + p.total_purchase_amount, 0),
          totalPaid: purchases
            .filter(p => p.payment_status === 'Payé')
            .reduce((acc, p) => acc + p.total_purchase_amount, 0),
        };
      })
    );
    setLoading(false);
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
        owner_id: ownerId,
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
      await markPurchasePaid(purchaseId);
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyPurchases(s => { const n = new Set(s); n.delete(purchaseId); return n; });
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────────

  const totalDebt = useMemo(
    () => suppliers.reduce((s, sup) => s + sup.totalDebt, 0),
    [suppliers]
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[#f8fbff] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">

          {/* ── Page header ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm uppercase tracking-[0.3em] text-[#0056b3]/90">Fournisseurs</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#212529] md:text-3xl">
              Gestion des Fournisseurs
            </h1>
            <p className="mt-1 text-sm text-[#212529]/60">
              Ajoutez des fournisseurs, suivez les dettes crédit et consultez l&apos;historique des achats.
            </p>
          </div>

          {/* ── Inline add form (horizontal) ── */}
          <form
            onSubmit={handleAdd}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Ajouter un fournisseur
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {/* Nom */}
              <div className="flex-[2] min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500">Nom *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Founisè S.A."
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#0056b3] focus:bg-white"
                />
              </div>
              {/* Email */}
              <div className="flex-1 min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
                <input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contact@founisè.com"
                  type="email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#0056b3] focus:bg-white"
                />
              </div>
              {/* Téléphone */}
              <div className="flex-1 min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500">Téléphone</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+509 XXXX-XXXX"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#0056b3] focus:bg-white"
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
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#0056b3] focus:bg-white"
                />
              </div>
              {/* Submit */}
              <button
                type="submit"
                disabled={formSaving || !form.name.trim()}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-[#0056b3] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#004494] disabled:opacity-50"
              >
                {formSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Ajouter
              </button>
            </div>
            {formErr && <p className="mt-2 text-xs text-red-600">{formErr}</p>}
          </form>

          {/* ── Analytics cards ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100">
                <Users className="h-6 w-6 text-[#0056b3]" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-[#212529]/50">Total Founisè</p>
                <p className="mt-0.5 text-2xl font-bold text-[#212529]">{suppliers.length}</p>
                <p className="text-[10px] text-[#212529]/40">Fournisseurs actifs</p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100">
                <CreditCard className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-[#212529]/50">
                  Total Achat à Crédit
                </p>
                <p className="mt-0.5 text-2xl font-bold text-[#212529]">
                  {formatCurrency(totalDebt)}
                </p>
                <p className="text-[10px] text-[#212529]/40">Dette totale en cours</p>
              </div>
            </div>
          </div>

          {/* ── Suppliers table ── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-semibold text-[#212529]">Liste des Fournisseurs</h2>
              <p className="text-sm text-[#212529]/60">
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
                  const hasDebt = sup.totalDebt > 0;

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
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0056b3]/10 text-sm font-bold text-[#0056b3]">
                          {sup.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Name + contact */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-[#212529]">{sup.name}</p>
                          <p className="truncate text-xs text-slate-400">
                            {sup.email || '—'}
                            {sup.phone ? ` · ${sup.phone}` : ''}
                          </p>
                        </div>

                        {/* Escompte */}
                        <div className="hidden w-20 text-center sm:block">
                          <p className="text-[10px] text-slate-400">Escompte</p>
                          <p className="text-sm font-medium text-[#212529]">
                            {sup.discount_percent}%
                          </p>
                        </div>

                        {/* Nb achats */}
                        <div className="hidden w-20 text-center md:block">
                          <p className="text-[10px] text-slate-400">Achats</p>
                          <p className="text-sm font-medium text-[#212529]">
                            {sup.purchases.length}
                          </p>
                        </div>

                        {/* Dette + badge */}
                        <div className="w-36 text-right">
                          <p className={`text-sm font-bold ${hasDebt ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatCurrency(sup.totalDebt)}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              hasDebt
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {hasDebt ? '⏳ Dette' : '✓ Soldé'}
                          </span>
                        </div>

                        {/* Edit / Delete */}
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setEditSupplier(sup)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#0056b3]"
                            title="Modifier"
                            aria-label="Modifier"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(sup)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title="Supprimer"
                            aria-label="Supprimer"
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
                                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-400">
                                      <th className="pb-2 pr-4 font-medium">Produit</th>
                                      <th className="pb-2 px-2 text-right font-medium">Qté</th>
                                      <th className="pb-2 px-2 text-right font-medium">Prix unit.</th>
                                      <th className="pb-2 px-2 text-right font-medium">Total</th>
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
                                        <td className="py-2.5 pr-4 font-medium text-[#212529]">
                                          {p.product_name}
                                        </td>
                                        <td className="py-2.5 px-2 text-right text-slate-600">
                                          {p.quantity}
                                        </td>
                                        <td className="py-2.5 px-2 text-right text-slate-600">
                                          {formatCurrency(p.purchase_price_per_unit)}
                                        </td>
                                        <td className="py-2.5 px-2 text-right font-semibold text-[#212529]">
                                          {formatCurrency(p.total_purchase_amount)}
                                        </td>
                                        <td className="py-2.5 px-2 text-center text-xs text-slate-500">
                                          {new Date(p.purchase_date).toLocaleDateString('fr-FR')}
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                          <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                              p.payment_status === 'Payé'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-red-100 text-red-700'
                                            }`}
                                          >
                                            {p.payment_status === 'Payé' ? '✓ Payé' : '⏳ Crédit'}
                                          </span>
                                        </td>
                                        <td className="py-2.5 pl-2">
                                          {p.payment_status === 'À Crédit' && (
                                            <button
                                              onClick={() => handlePurchasePaid(p.id)}
                                              disabled={busyPurchases.has(p.id)}
                                              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
                                  Total payé :{' '}
                                  <span className="font-semibold text-emerald-600">
                                    {formatCurrency(sup.totalPaid)}
                                  </span>
                                </span>
                                <span className="text-xs text-slate-500">
                                  Restant dû :{' '}
                                  <span className={`font-semibold ${sup.totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {formatCurrency(sup.totalDebt)}
                                  </span>
                                </span>
                              </div>
                            </>
                          )}
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
