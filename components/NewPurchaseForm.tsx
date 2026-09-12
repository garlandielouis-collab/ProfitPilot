'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { savePurchase } from '../app/actions/purchases';
import {
  quickCreateSupplier, quickCreateProduct,
  type QuickSupplierResult, type QuickProductResult,
} from '../app/actions/quickCreate';
import { useLanguage } from './LanguageWrapper';
import { PaymentPicker, PAYMENT_METHODS, type PaymentKey } from './ds';
import { Check } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SupplierOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  discount_percent: number;
};

type ProductOption = {
  id: string;
  name: string;
  purchase_price: number;
  stock_quantity: number;
  category: string;
};

type WarehouseOption = {
  id: string;
  name: string;
};

type PaymentStatusKey = 'Payé' | 'À Crédit';

type PaymentMethodKey = 'Moncash' | 'Natcash' | 'Carte Visa' | 'Espèces';

// ── Modes de paiement ─────────────────────────────────────────────────────────
//
// Avant : quatre boutons traités comme quatre composants distincts — rose pour
// Moncash, violet pour Natcash, bleu pour la carte, émeraude pour les espèces —
// avec un émoji chacun. Quatre couleurs saturées côte à côte sur l'écran le
// plus utilisé du produit : personne ne sait où regarder (§3.4, §4.2).
//
// Après : le composant unique de la bibliothèque. Un seul style, une icône de
// trait, la sélection marquée par le CONTRASTE — fond marine, texte blanc.

/** Les méthodes qui passent par un numéro de téléphone. Il n'y a plus de
 *  numéro écrit en dur : c'étaient deux numéros fixes, pas ceux du fournisseur. */
const MOBILE_METHODS: PaymentMethodKey[] = ['Moncash', 'Natcash'];

/** Les clés du composant partagé ↔ celles que la base attend. */
const KEY_TO_PAY: Record<PaymentKey, PaymentMethodKey> = {
  cash: 'Espèces', moncash: 'Moncash', natcash: 'Natcash', card: 'Carte Visa', credit: 'Espèces',
};
const PAY_TO_KEY: Record<PaymentMethodKey, PaymentKey> = {
  'Espèces': 'cash', 'Moncash': 'moncash', 'Natcash': 'natcash', 'Carte Visa': 'card',
};

/** Le crédit n'est pas un mode de paiement ici : il est déjà porté par le
 *  statut « À Crédit » juste au-dessus. Le répéter serait un doublon (§3.6). */
const PURCHASE_METHODS = PAYMENT_METHODS.filter((m) => m.key !== 'credit');

const PRODUCT_CATEGORIES = [
  'Alimentation', 'Boissons', 'Hygiène', 'Nettoyage',
  'Électronique', 'Vêtements', 'Fournitures', 'Médicaments', 'Autre',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' HTG';
}

function inputClass(error?: string) {
  return `w-full rounded-2xl border px-4 py-2.5 text-sm text-anthracite outline-none transition
    ${error ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-slate-200 bg-slate-50 focus:border-primary focus:bg-white'}`;
}

// ── Custom Combobox ───────────────────────────────────────────────────────────

interface ComboboxProps<T extends { id: string; name: string }> {
  label: string;
  placeholder: string;
  options: T[];
  selected: T | null;
  onSelect: (item: T | null) => void;
  onCreateNew: () => void;
  renderOption?: (item: T) => React.ReactNode;
  error?: string;
}

function Combobox<T extends { id: string; name: string }>({
  label, placeholder, options, selected, onSelect, onCreateNew, renderOption, error,
}: ComboboxProps<T>) {
  const { t } = useLanguage();
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const ref                 = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.name.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function handleSelect(item: T) {
    onSelect(item);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="space-y-1.5" ref={ref}>
      <label className="text-sm font-medium text-anthracite/80">{label}</label>
      <div className="relative">
        {/* Trigger */}
        <button
          type="button"
          onClick={handleOpen}
          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-sm transition
            ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50 hover:bg-white'}
            ${open ? 'border-primary bg-white ring-2 ring-primary/15' : ''}`}
        >
          <span className={selected ? 'text-anthracite' : 'text-anthracite/35'}>
            {selected ? selected.name : placeholder}
          </span>
          <svg className={`h-4 w-4 text-anthracite/40 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full left-0 z-40 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-slate-100">
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5">
                <svg className="h-3.5 w-3.5 text-anthracite/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t({ fr: 'Recherche rapide…', ht: 'Rechèch rapid…' })}
                  className="flex-1 bg-transparent text-xs text-anthracite outline-none placeholder-anthracite/30"
                />
              </div>
            </div>

            {/* Options list */}
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs text-anthracite/40 text-center">
                    {query ? `Okenn rezilta pou "${query}"` : t({ fr: 'Aucune option', ht: 'Okenn opsyon' })}
                </p>
              ) : filtered.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={`w-full px-3 py-2.5 text-left text-sm transition hover:bg-slate-50
                    ${selected?.id === item.id ? 'bg-blue-50 text-primary font-semibold' : 'text-anthracite'}`}
                >
                  {renderOption ? renderOption(item) : item.name}
                </button>
              ))}
            </div>

            {/* Create new footer */}
            <div className="border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => { setOpen(false); onCreateNew(); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-primary hover:bg-blue-50 transition"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-note font-bold">+</span>
                {query ? `Kreye "${query}"` : t({ fr: 'Créer nouveau', ht: 'Kreye nouvo' })}
              </button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── Quick Create Supplier Modal ───────────────────────────────────────────────

interface QuickCreateSupplierModalProps {
  ownerId: string;
  onCreated: (s: SupplierOption) => void;
  onClose: () => void;
}

function QuickCreateSupplierModal({ ownerId, onCreated, onClose }: QuickCreateSupplierModalProps) {
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [err,   setErr]   = useState('');
  const { t } = useLanguage();

  async function handleSave() {
    if (!name.trim()) { setErr(t({ fr: 'Nom obligatoire.', ht: 'Non obligatwa.' })); return; }
    setSaving(true);
    try {
      const created: QuickSupplierResult = await quickCreateSupplier({ name, phone, email });
      onCreated({ id: created.id, name: created.name, phone: created.phone, email: created.email, discount_percent: created.discount_percent ?? 0 });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <ModalWrapper title={t({ fr: 'Nouveau Fournisseur', ht: 'Nouvo Founisè' })} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-anthracite/70">{t({ fr: 'Nom ', ht: 'Non ' })}<span className="text-red-500">*</span></label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="ex: Distribisyon ABC"
            className={inputClass()} onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-anthracite/70">{t({ fr: 'Téléphone', ht: 'Telefòn' })}</label>
          <input value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="ex: 50937304541"
            className={inputClass()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-anthracite/70">{t({ fr: 'Email', ht: 'Imèl' })}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="ex: contact@abc.com"
            className={inputClass()} />
        </div>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm text-anthracite/60 hover:bg-slate-50 transition">
            {t({ fr: 'Annuler', ht: 'Anile' })}
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !name.trim()}
            className="flex-1 rounded-2xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-primary-h transition">
            {saving ? t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' }) : t({ fr: 'Créer Fournisseur', ht: 'Kreye Founisè' })}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// ── Quick Create Product Modal ────────────────────────────────────────────────

interface QuickCreateProductModalProps {
  ownerId: string;
  onCreated: (p: ProductOption) => void;
  onClose: () => void;
}

function QuickCreateProductModal({ ownerId, onCreated, onClose }: QuickCreateProductModalProps) {
  const [name,       setName]      = useState('');
  const [category,   setCategory]  = useState('');
  const [buyPrice,   setBuyPrice]  = useState('');
  const [sellPrice,  setSellPrice] = useState('');
  const [saving,     setSaving]    = useState(false);
  const [err,        setErr]       = useState('');
  const { t } = useLanguage();

  async function handleSave() {
    if (!name.trim())    { setErr(t({ fr: 'Nom obligatoire.', ht: 'Non obligatwa.' })); return; }
    if (!category.trim()) { setErr(t({ fr: 'Catégorie obligatoire.', ht: 'Kategori obligatwa.' })); return; }
    const pp = parseFloat(buyPrice)  || 0;
    const sp = parseFloat(sellPrice) || 0;
    setSaving(true);
    try {
      const created: QuickProductResult = await quickCreateProduct({
        name, category,
        purchase_price: pp,
        sale_price: sp,
      });
      onCreated({
        id: created.id,
        name: created.name,
        purchase_price: created.purchase_price,
        stock_quantity: created.stock_quantity,
        category: created.category,
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <ModalWrapper title={t({ fr: 'Nouveau Produit', ht: 'Nouvo Pwodui' })} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-anthracite/70">{t({ fr: 'Nom produit ', ht: 'Non pwodui ' })}<span className="text-red-500">*</span></label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="ex: Riz 50kg" className={inputClass()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-anthracite/70">{t({ fr: 'Catégorie ', ht: 'Kategori ' })}<span className="text-red-500">*</span></label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className={inputClass()}>
            <option value="">{t({ fr: '— Choisir —', ht: '— Chwazi —' })}</option>
            {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-anthracite/70">{t({ fr: "Prix d'achat (HTG)", ht: 'Pri acha (HTG)' })}</label>
            <input type="number" min={0} step={0.01} value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
              placeholder="0.00" className={inputClass()} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-anthracite/70">{t({ fr: "Prix de vente (HTG)", ht: 'Pri vant (HTG)' })}</label>
            <input type="number" min={0} step={0.01} value={sellPrice} onChange={e => setSellPrice(e.target.value)}
              placeholder="0.00" className={inputClass()} />
          </div>
        </div>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm text-anthracite/60 hover:bg-slate-50 transition">
            {t({ fr: 'Annuler', ht: 'Anile' })}
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !name.trim() || !category.trim()}
            className="flex-1 rounded-2xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-primary-h transition">
            {saving ? t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' }) : t({ fr: 'Créer Produit', ht: 'Kreye Pwodui' })}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// ── Modal Wrapper ─────────────────────────────────────────────────────────────

function ModalWrapper({ title, children, onClose }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-anthracite">{title}</h3>
          <button type="button" onClick={onClose}
            className="min-h-touch min-w-touch flex h-7 w-7 items-center justify-center rounded-full text-anthracite/40 hover:bg-slate-100 hover:text-anthracite transition">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function NewPurchaseForm() {
  const { t } = useLanguage();
  // Data
  const [suppliers,     setSuppliers]     = useState<SupplierOption[]>([]);
  const [products,      setProducts]      = useState<ProductOption[]>([]);
  const [warehouses,    setWarehouses]    = useState<WarehouseOption[]>([]);
  const [ownerId,       setOwnerId]       = useState<string | null>(null);

  // Form state
  const [supplier,      setSupplier]      = useState<SupplierOption | null>(null);
  const [product,       setProduct]       = useState<ProductOption | null>(null);
  const [warehouse,     setWarehouse]     = useState<WarehouseOption | null>(null);
  const [quantity,      setQuantity]      = useState(1);
  const [unitPrice,     setUnitPrice]     = useState(0);
  const [discountPct,   setDiscountPct]   = useState(0);
  const [payStatus,     setPayStatus]     = useState<PaymentStatusKey>('Payé');
  const [payMethod,     setPayMethod]     = useState<PaymentMethodKey>('Espèces');

  // Quick create modal state
  const [supplierModal, setSupplierModal] = useState(false);
  const [productModal,  setProductModal]  = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Submission
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState('');
  const [saveErr,  setSaveErr]  = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [suppRes, prodRes, whRes, userRes] = await Promise.all([
        // Suppression douce (app/actions/suppliers.ts) : un fournisseur supprimé
        // ne doit plus être proposé, comme sur /suppliers et /dettes.
        supabase.from('suppliers').select('id,name,phone,email,discount_percent').is('deleted_at', null).order('name'),
        supabase.from('products').select('id,name,purchase_price,stock_quantity,category').order('name'),
        // Tous les comptes n'ont pas d'entrepôt (ni même la table) : l'absence
        // se traite comme une liste vide, le serveur retombe alors sur
        // l'entrepôt par défaut du commerce.
        supabase.from('warehouses').select('id,name').order('created_at'),
        supabase.auth.getUser(),
      ]);
      setSuppliers((suppRes.data ?? []) as SupplierOption[]);
      setProducts((prodRes.data ?? []) as ProductOption[]);

      const whList = (whRes.data ?? []) as WarehouseOption[];
      setWarehouses(whList);
      // Présélectionner évite de faire choisir là où il n'y a rien à choisir.
      if (whList.length > 0) setWarehouse((w) => w ?? whList[0]);

      setOwnerId(userRes.data.user?.id ?? null);
    }
    load();
  }, []);

  // Auto-fill unit price from product
  useEffect(() => {
    if (product) setUnitPrice(product.purchase_price);
  }, [product]);

  // Auto-fill discount from supplier profile
  useEffect(() => {
    if (supplier) setDiscountPct(supplier.discount_percent ?? 0);
    else setDiscountPct(0);
  }, [supplier]);

  // ── Derived totals ─────────────────────────────────────────────────────────

  const subtotal      = useMemo(() => quantity * unitPrice, [quantity, unitPrice]);
  const discountAmt   = useMemo(() => parseFloat((subtotal * discountPct / 100).toFixed(2)), [subtotal, discountPct]);
  const total         = useMemo(() => Math.max(0, parseFloat((subtotal - discountAmt).toFixed(2))), [subtotal, discountAmt]);

  // Le téléphone enregistré du fournisseur choisi, pour un paiement mobile
  // seulement ; sans fournisseur ou sans numéro, rien ne s'affiche.
  const selectedPhone =
    payStatus === 'Payé' && MOBILE_METHODS.includes(payMethod) ? (supplier?.phone || null) : null;

  // ── Quick create handlers ──────────────────────────────────────────────────

  function handleSupplierCreated(s: SupplierOption) {
    setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
    setSupplier(s);
    setErrors(e => ({ ...e, supplier: '' }));
  }

  function handleProductCreated(p: ProductOption) {
    setProducts(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
    setProduct(p);
    setUnitPrice(p.purchase_price);
    setErrors(e => ({ ...e, product: '' }));
  }

  // ── Validate + Submit ──────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!supplier)       errs.supplier = t({ fr: 'Choisissez un fournisseur.', ht: 'Chwazi yon founisè.' });
    if (!product)        errs.product  = t({ fr: 'Choisissez un produit.', ht: 'Chwazi yon pwodui.' });
    if (quantity < 1)    errs.quantity  = t({ fr: 'La quantité doit être ≥ 1.', ht: 'Kantite dwe ≥ 1.' });
    if (unitPrice < 0)   errs.unitPrice = t({ fr: 'Prix non valide.', ht: 'Pri pa valab.' });
    if (discountPct < 0 || discountPct > 100) errs.discount = t({ fr: 'Remise 0–100%.', ht: 'Rabè 0–100%.' });

    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!ownerId) { setSaveErr(t({ fr: 'Non authentifié.', ht: 'Non otantifye.' })); return; }

    // Trace du paiement mobile : savePurchase la range dans purchases.metadata.
    const metadata: Record<string, string> | undefined =
      selectedPhone
        ? { payment_phone: selectedPhone, payment_network: payMethod }
        : undefined;

    setSaving(true);
    setSaveErr('');
    setSuccess('');

    try {
      const res = await savePurchase({
        supplier_id:             supplier!.id,
        product_id:              product!.id,
        product_name:            product!.name,
        quantity,
        purchase_price_per_unit: unitPrice,
        total_purchase_amount:   total,
        discount_percent:        discountPct,
        payment_status:          payStatus,
        payment_method:          payStatus === 'Payé' ? payMethod : undefined,
        metadata,
        warehouse_id:            warehouse?.id,
      });
      // Refus renvoyé (et non levé) : son message survit en production.
      if (res !== true) throw new Error(res.error);

      setSuccess(t({ fr: 'Achat enregistré.', ht: 'Acha anrejistre.' }));
      // Reset form
      setSupplier(null);
      setProduct(null);
      setWarehouse(null);
      setQuantity(1);
      setUnitPrice(0);
      setDiscountPct(0);
      setPayStatus('Payé');
      setPayMethod('Espèces');
      setErrors({});
    } catch (err) {
      setSaveErr((err as Error).message);
    }
    setSaving(false);
  }

  // L'entrepôt n'est exigé que s'il y a réellement un choix à faire : sans
  // entrepôt configuré, le serveur utilise celui par défaut du commerce.
  const canSubmit =
    !!supplier && !!product && quantity >= 1 && !saving &&
    (warehouses.length === 0 || !!warehouse);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <section className="rounded-surface border border-slate-200 bg-white p-6">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">{t({ fr: 'Achats', ht: 'Acha' })}</p>
            <h2 className="text-xl font-bold text-anthracite">{t({ fr: 'Nouvel Achat', ht: 'Nouvo Acha' })}</h2>
            <p className="mt-0.5 text-sm text-anthracite/50">{t({ fr: 'Choisissez fournisseur, produit, quantité, et méthode de paiement.', ht: 'Chwazi founisè, pwodui, kantite, ak metòd peman.' })}</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">{t({ fr: 'Payé', ht: 'Peye' })}</span>
            <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700">{t({ fr: 'À Crédit', ht: 'À Kredi' })}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Supplier + Product comboboxes ── */}
          <div className="grid gap-5 sm:grid-cols-2">

            {/* Supplier */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-anthracite/80">{t({ fr: 'Fournisseur ', ht: 'Founisè ' })}<span className="text-red-500">*</span></span>
                <button type="button" onClick={() => setSupplierModal(true)}
                  title={t({ fr: 'Créer nouveau fournisseur', ht: 'Kreye nouvo founisè' })}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition text-sm font-bold">
                  +
                </button>
              </div>
              <Combobox
                label=""
                placeholder={t({ fr: 'Choisissez un fournisseur…', ht: 'Chwazi yon founisè…' })}
                options={suppliers}
                selected={supplier}
                onSelect={s => { setSupplier(s); setErrors(e => ({ ...e, supplier: '' })); }}
                onCreateNew={() => setSupplierModal(true)}
                renderOption={s => (
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.phone && <p className="text-note text-anthracite/40">{s.phone}</p>}
                  </div>
                )}
                error={errors.supplier}
              />
            </div>

            {/* Product */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-anthracite/80">{t({ fr: 'Produit ', ht: 'Pwodui ' })}<span className="text-red-500">*</span></span>
                <button type="button" onClick={() => setProductModal(true)}
                  title={t({ fr: 'Créer nouveau produit', ht: 'Kreye nouvo pwodui' })}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition text-sm font-bold">
                  +
                </button>
              </div>
              <Combobox
                label=""
                placeholder={t({ fr: 'Choisissez un produit…', ht: 'Chwazi yon pwodui…' })}
                options={products}
                selected={product}
                onSelect={p => { setProduct(p); setErrors(e => ({ ...e, product: '' })); }}
                onCreateNew={() => setProductModal(true)}
                renderOption={p => (
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-note text-anthracite/40">{p.category}</p>
                    </div>
                    <span className={`text-xs font-semibold ${p.stock_quantity < 5 ? 'text-orange-500' : 'text-anthracite/40'}`}>
                      {t({ fr: 'Stock: ', ht: 'Stock: ' })}{p.stock_quantity}
                    </span>
                  </div>
                )}
                error={errors.product}
              />
            </div>
          </div>

          {/* ── Quantity + Unit Price + Discount ── */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-anthracite/80">{t({ fr: 'Quantité', ht: 'Kantite' })}</label>
              <input
                type="number" min={1} value={quantity}
                onChange={e => { setQuantity(Math.max(1, Number(e.target.value) || 1)); setErrors(e2 => ({ ...e2, quantity: '' })); }}
                className={inputClass(errors.quantity)}
              />
              {errors.quantity && <p className="text-xs text-red-500">{errors.quantity}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-anthracite/80">{t({ fr: 'Prix unitaire (HTG)', ht: 'Pri inite (HTG)' })}</label>
              <input
                type="number" min={0} step={0.01} value={unitPrice}
                onChange={e => { setUnitPrice(Number(e.target.value) || 0); setErrors(e2 => ({ ...e2, unitPrice: '' })); }}
                className={inputClass(errors.unitPrice)}
              />
              {errors.unitPrice && <p className="text-xs text-red-500">{errors.unitPrice}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-anthracite/80">
                {t({ fr: 'Remise / Escompte (%)', ht: 'Rabè / Eskonpt (%)' })}
              </label>
              <div className="relative">
                <input
                  type="number" min={0} max={100} step={0.5} value={discountPct}
                  onChange={e => { setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value)))); setErrors(e2 => ({ ...e2, discount: '' })); }}
                  className={inputClass(errors.discount) + ' pr-8'}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-anthracite/40">%</span>
              </div>
              {errors.discount && <p className="text-xs text-red-500">{errors.discount}</p>}
            </div>
          </div>

          {/* ── Warehouse selector ── */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/80">
              {t({ fr: 'Entrepôt', ht: 'Depo' })}
              {warehouses.length > 0 && <span className="text-red-500">*</span>}
            </label>
            <select
              value={warehouse?.id ?? ''}
              onChange={e => {
                const selected = warehouses.find(w => w.id === e.target.value) ?? null;
                setWarehouse(selected);
                setErrors(err => ({ ...err, warehouse: '' }));
              }}
              className={inputClass(errors.warehouse)}
            >
              <option value="">{t({ fr: 'Choisissez un entrepôt…', ht: 'Chwazi yon depo…' })}</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {errors.warehouse && <p className="text-xs text-red-500">{errors.warehouse}</p>}
          </div>

          {/* ── Payment Status toggle ── */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/80">{t({ fr: 'Statut du Paiement', ht: 'Estati Peman' })}</label>
            <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {(['Payé', 'À Crédit'] as PaymentStatusKey[]).map(s => (
                // Deux états d'un même contrôle : la sélection se marque par le
                // contraste, pas par deux teintes qui se disputent l'œil (§3.4).
                <button key={s} type="button" onClick={() => setPayStatus(s)}
                  className={`pressable min-h-touch flex-1 rounded-control px-4 text-body font-bold transition-colors duration-press ease-pp
                    ${payStatus === s
                      ? 'bg-primary text-white'
                      : 'bg-white text-primary hover:bg-surface2'}`}>
                  {s === 'Payé' ? t({ fr: 'Payé', ht: 'Peye' }) : t({ fr: 'À crédit', ht: 'Sou kredi' })}
                </button>
              ))}
            </div>
          </div>

          {/* ── Payment Method (only when Payé) ── */}
          {payStatus === 'Payé' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-anthracite/80">{t({ fr: 'Méthode de Paiement', ht: 'Metòd Peman' })}</label>
              <PaymentPicker
                methods={PURCHASE_METHODS}
                value={PAY_TO_KEY[payMethod]}
                onChange={(k) => setPayMethod(KEY_TO_PAY[k])}
              />

              {/* Le téléphone enregistré du fournisseur. Une mention, pas une
                  alerte : ni fond d'avertissement, ni émoji (§3.6). Rien ne
                  garantit que ce soit son compte mobile : on ne le dit pas « crédité ». */}
              {selectedPhone && (
                <p className="text-note text-muted">
                  {t({ fr: 'Téléphone du fournisseur : ', ht: 'Telefòn founisè a : ' })}
                  <span className="amount font-bold text-primary">{selectedPhone}</span>
                </p>
              )}
            </div>
          )}

          {/* ── Total summary ── */}
          <div className="rounded-surface border border-border bg-surface p-5">
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm text-anthracite/60">
                <span>{t({ fr: 'Sous-total ', ht: 'Sous-total ' })}({quantity} × {fmt(unitPrice)})</span>
                <span className="font-medium text-anthracite">{fmt(subtotal)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>{t({ fr: 'Remise ', ht: 'Rabè ' })}({discountPct}%)</span>
                  <span className="font-semibold">−{fmt(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-slate-200 pt-2.5">
                <div>
                  <p className="text-sm font-medium text-anthracite/60">{t({ fr: 'Total Final', ht: 'Total Final' })}</p>
                  {payStatus === 'Payé' && selectedPhone && (
                    <p className="text-xs text-anthracite/40 mt-0.5">
                      {t({ fr: 'Paiement: ', ht: 'Peman: ' })}{payMethod} · {selectedPhone}
                    </p>
                  )}
                </div>
                <p className="text-3xl font-extrabold text-primary">{fmt(total)}</p>
              </div>
            </div>
          </div>

          {/* ── Feedback ── */}
          {success && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700">
              <Check className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} aria-hidden /> {success}
            </div>
          )}
          {saveErr && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {saveErr}
            </div>
          )}

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-md transition
              hover:bg-primary-h hover:scale-[1.01] active:scale-[0.99]
              disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {saving ? t({ fr: 'Enregistrement…', ht: 'Anrejistreman…' }) : payStatus === 'À Crédit' ? t({ fr: 'Enregistrer l’achat à crédit', ht: 'Anrejistre acha a kredi' }) : t({ fr: 'Enregistrer l’achat', ht: 'Anrejistre acha a' })}
          </button>

        </form>
      </section>

      {/* ── Quick Create Modals ── */}
      {supplierModal && ownerId && (
        <QuickCreateSupplierModal
          ownerId={ownerId}
          onCreated={handleSupplierCreated}
          onClose={() => setSupplierModal(false)}
        />
      )}
      {productModal && ownerId && (
        <QuickCreateProductModal
          ownerId={ownerId}
          onCreated={handleProductCreated}
          onClose={() => setProductModal(false)}
        />
      )}
    </>
  );
}
