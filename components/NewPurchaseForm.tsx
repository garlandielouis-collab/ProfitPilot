'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { savePurchase } from '../app/actions/purchases';
import {
  quickCreateSupplier, quickCreateProduct,
  type QuickSupplierResult, type QuickProductResult,
} from '../app/actions/quickCreate';

// ── Types ─────────────────────────────────────────────────────────────────────

type SupplierOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type ProductOption = {
  id: string;
  name: string;
  purchase_price: number;
  stock_quantity: number;
  category: string;
};

type PaymentStatusKey = 'Payé' | 'À Crédit';

type PaymentMethodKey = 'Moncash' | 'Natcash' | 'Carte Visa' | 'Espèces';

// ── Payment method config ─────────────────────────────────────────────────────

const PAYMENT_METHODS: {
  key: PaymentMethodKey;
  label: string;
  phone: string | null;
  icon: string;
  color: string;
  activeClass: string;
}[] = [
  {
    key: 'Moncash',
    label: 'Moncash',
    phone: '50937304541',
    icon: '📱',
    color: 'text-pink-600',
    activeClass: 'bg-pink-600 text-white border-pink-600',
  },
  {
    key: 'Natcash',
    label: 'Natcash',
    phone: '50935951252',
    icon: '📲',
    color: 'text-purple-600',
    activeClass: 'bg-purple-600 text-white border-purple-600',
  },
  {
    key: 'Carte Visa',
    label: 'Carte Visa',
    phone: null,
    icon: '💳',
    color: 'text-blue-600',
    activeClass: 'bg-blue-600 text-white border-blue-600',
  },
  {
    key: 'Espèces',
    label: 'Espèces',
    phone: null,
    icon: '💵',
    color: 'text-emerald-600',
    activeClass: 'bg-emerald-600 text-white border-emerald-600',
  },
];

const PRODUCT_CATEGORIES = [
  'Alimentation', 'Boissons', 'Hygiène', 'Nettoyage',
  'Électronique', 'Vêtements', 'Fournitures', 'Médicaments', 'Autre',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' HTG';
}

function inputClass(error?: string) {
  return `w-full rounded-2xl border px-4 py-2.5 text-sm text-[#212529] outline-none transition
    ${error ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-slate-200 bg-slate-50 focus:border-[#0056b3] focus:bg-white'}`;
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
      <label className="text-sm font-medium text-[#212529]/80">{label}</label>
      <div className="relative">
        {/* Trigger */}
        <button
          type="button"
          onClick={handleOpen}
          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-sm transition
            ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50 hover:bg-white'}
            ${open ? 'border-[#0056b3] bg-white ring-2 ring-[#0056b3]/15' : ''}`}
        >
          <span className={selected ? 'text-[#212529]' : 'text-[#212529]/35'}>
            {selected ? selected.name : placeholder}
          </span>
          <svg className={`h-4 w-4 text-[#212529]/40 transition-transform ${open ? 'rotate-180' : ''}`}
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
                <svg className="h-3.5 w-3.5 text-[#212529]/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rechèch rapid…"
                  className="flex-1 bg-transparent text-xs text-[#212529] outline-none placeholder-[#212529]/30"
                />
              </div>
            </div>

            {/* Options list */}
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs text-[#212529]/40 text-center">
                  {query ? `Okenn rezilta pou "${query}"` : 'Okenn opsyon'}
                </p>
              ) : filtered.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={`w-full px-3 py-2.5 text-left text-sm transition hover:bg-slate-50
                    ${selected?.id === item.id ? 'bg-blue-50 text-[#0056b3] font-semibold' : 'text-[#212529]'}`}
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
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#0056b3] hover:bg-blue-50 transition"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0056b3] text-white text-[10px] font-bold">+</span>
                {query ? `Kreye "${query}"` : 'Kreye nouvo'}
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

  async function handleSave() {
    if (!name.trim()) { setErr('Non obligatwa.'); return; }
    setSaving(true);
    try {
      const created: QuickSupplierResult = await quickCreateSupplier({ name, phone, email, owner_id: ownerId });
      onCreated({ id: created.id, name: created.name, phone: created.phone, email: created.email });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <ModalWrapper title="Nouvo Founisè" onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#212529]/70">Non <span className="text-red-500">*</span></label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="ex: Distribisyon ABC"
            className={inputClass()} onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#212529]/70">Telefòn</label>
          <input value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="ex: 50937304541"
            className={inputClass()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#212529]/70">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="ex: contact@abc.com"
            className={inputClass()} />
        </div>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm text-[#212529]/60 hover:bg-slate-50 transition">
            Anile
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !name.trim()}
            className="flex-1 rounded-2xl bg-[#0056b3] py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#0047a1] transition">
            {saving ? 'Anrejistreman…' : 'Kreye Founisè'}
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

  async function handleSave() {
    if (!name.trim())    { setErr('Non obligatwa.'); return; }
    if (!category.trim()) { setErr('Kategori obligatwa.'); return; }
    const pp = parseFloat(buyPrice)  || 0;
    const sp = parseFloat(sellPrice) || 0;
    setSaving(true);
    try {
      const created: QuickProductResult = await quickCreateProduct({
        name, category,
        purchase_price: pp,
        sale_price: sp,
        owner_id: ownerId,
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
    <ModalWrapper title="Nouvo Pwodui" onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#212529]/70">Non pwodui <span className="text-red-500">*</span></label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="ex: Riz 50kg" className={inputClass()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#212529]/70">Kategori <span className="text-red-500">*</span></label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className={inputClass()}>
            <option value="">— Chwazi —</option>
            {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#212529]/70">Pri acha (HTG)</label>
            <input type="number" min={0} step={0.01} value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
              placeholder="0.00" className={inputClass()} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#212529]/70">Pri vant (HTG)</label>
            <input type="number" min={0} step={0.01} value={sellPrice} onChange={e => setSellPrice(e.target.value)}
              placeholder="0.00" className={inputClass()} />
          </div>
        </div>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm text-[#212529]/60 hover:bg-slate-50 transition">
            Anile
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !name.trim() || !category.trim()}
            className="flex-1 rounded-2xl bg-[#0056b3] py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#0047a1] transition">
            {saving ? 'Anrejistreman…' : 'Kreye Pwodui'}
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
          <h3 className="font-semibold text-[#212529]">{title}</h3>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#212529]/40 hover:bg-slate-100 hover:text-[#212529] transition">
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
  // Data
  const [suppliers,     setSuppliers]     = useState<SupplierOption[]>([]);
  const [products,      setProducts]      = useState<ProductOption[]>([]);
  const [ownerId,       setOwnerId]       = useState<string | null>(null);

  // Form state
  const [supplier,      setSupplier]      = useState<SupplierOption | null>(null);
  const [product,       setProduct]       = useState<ProductOption | null>(null);
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
      const [suppRes, prodRes, userRes] = await Promise.all([
        supabase.from('suppliers').select('id,name,phone,email').order('name'),
        supabase.from('products').select('id,name,purchase_price,stock_quantity,category').order('name'),
        supabase.auth.getUser(),
      ]);
      setSuppliers((suppRes.data ?? []) as SupplierOption[]);
      setProducts((prodRes.data ?? []) as ProductOption[]);
      setOwnerId(userRes.data.user?.id ?? null);
    }
    load();
  }, []);

  // Auto-fill unit price from product
  useEffect(() => {
    if (product) setUnitPrice(product.purchase_price);
  }, [product]);

  // ── Derived totals ─────────────────────────────────────────────────────────

  const subtotal      = useMemo(() => quantity * unitPrice, [quantity, unitPrice]);
  const discountAmt   = useMemo(() => parseFloat((subtotal * discountPct / 100).toFixed(2)), [subtotal, discountPct]);
  const total         = useMemo(() => Math.max(0, parseFloat((subtotal - discountAmt).toFixed(2))), [subtotal, discountAmt]);

  const selectedMethod = PAYMENT_METHODS.find(m => m.key === payMethod)!;

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
    if (!supplier)       errs.supplier = 'Chwazi yon founisè.';
    if (!product)        errs.product  = 'Chwazi yon pwodui.';
    if (quantity < 1)    errs.quantity  = 'Kantite dwe ≥ 1.';
    if (unitPrice < 0)   errs.unitPrice = 'Pri pa valab.';
    if (discountPct < 0 || discountPct > 100) errs.discount = 'Rabè 0–100%.';

    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!ownerId) { setSaveErr('Non otantifye.'); return; }

    // Build metadata for mobile money
    const metadata: Record<string, string> | undefined =
      selectedMethod.phone
        ? { payment_phone: selectedMethod.phone, payment_network: selectedMethod.key }
        : undefined;

    setSaving(true);
    setSaveErr('');
    setSuccess('');

    try {
      await savePurchase({
        supplier_id:            supplier!.id,
        product_id:             product!.id,
        quantity,
        purchase_price_per_unit: unitPrice,
        total_purchase_amount:  total,
        discount_percent:       discountPct,
        payment_status:         payStatus,
        payment_method:         payStatus === 'Payé' ? payMethod : undefined,
        metadata,
        owner_id:               ownerId,
      });

      setSuccess('✓ Acha anrejistre avèk siksè!');
      // Reset form
      setSupplier(null);
      setProduct(null);
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

  const canSubmit = !!supplier && !!product && quantity >= 1 && !saving;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#0056b3]/70">Achats</p>
            <h2 className="text-xl font-bold text-[#212529]">Nouvo Acha</h2>
            <p className="mt-0.5 text-sm text-[#212529]/50">Chwazi founisè, pwodui, kantite, ak metòd peman.</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">Payé</span>
            <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700">À Crédit</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Supplier + Product comboboxes ── */}
          <div className="grid gap-5 sm:grid-cols-2">

            {/* Supplier */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#212529]/80">Founisè <span className="text-red-500">*</span></span>
                <button type="button" onClick={() => setSupplierModal(true)}
                  title="Kreye nouvo founisè"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0056b3]/10 text-[#0056b3] hover:bg-[#0056b3] hover:text-white transition text-sm font-bold">
                  +
                </button>
              </div>
              <Combobox
                label=""
                placeholder="Chwazi yon founisè…"
                options={suppliers}
                selected={supplier}
                onSelect={s => { setSupplier(s); setErrors(e => ({ ...e, supplier: '' })); }}
                onCreateNew={() => setSupplierModal(true)}
                renderOption={s => (
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.phone && <p className="text-[11px] text-[#212529]/40">{s.phone}</p>}
                  </div>
                )}
                error={errors.supplier}
              />
            </div>

            {/* Product */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#212529]/80">Pwodui <span className="text-red-500">*</span></span>
                <button type="button" onClick={() => setProductModal(true)}
                  title="Kreye nouvo pwodui"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0056b3]/10 text-[#0056b3] hover:bg-[#0056b3] hover:text-white transition text-sm font-bold">
                  +
                </button>
              </div>
              <Combobox
                label=""
                placeholder="Chwazi yon pwodui…"
                options={products}
                selected={product}
                onSelect={p => { setProduct(p); setErrors(e => ({ ...e, product: '' })); }}
                onCreateNew={() => setProductModal(true)}
                renderOption={p => (
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-[11px] text-[#212529]/40">{p.category}</p>
                    </div>
                    <span className={`text-xs font-semibold ${p.stock_quantity < 5 ? 'text-orange-500' : 'text-[#212529]/40'}`}>
                      Stock: {p.stock_quantity}
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
              <label className="text-sm font-medium text-[#212529]/80">Kantite</label>
              <input
                type="number" min={1} value={quantity}
                onChange={e => { setQuantity(Math.max(1, Number(e.target.value) || 1)); setErrors(e2 => ({ ...e2, quantity: '' })); }}
                className={inputClass(errors.quantity)}
              />
              {errors.quantity && <p className="text-xs text-red-500">{errors.quantity}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#212529]/80">Pri inite (HTG)</label>
              <input
                type="number" min={0} step={0.01} value={unitPrice}
                onChange={e => { setUnitPrice(Number(e.target.value) || 0); setErrors(e2 => ({ ...e2, unitPrice: '' })); }}
                className={inputClass(errors.unitPrice)}
              />
              {errors.unitPrice && <p className="text-xs text-red-500">{errors.unitPrice}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#212529]/80">
                Rabè / Eskonpt (%)
              </label>
              <div className="relative">
                <input
                  type="number" min={0} max={100} step={0.5} value={discountPct}
                  onChange={e => { setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value)))); setErrors(e2 => ({ ...e2, discount: '' })); }}
                  className={inputClass(errors.discount) + ' pr-8'}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#212529]/40">%</span>
              </div>
              {errors.discount && <p className="text-xs text-red-500">{errors.discount}</p>}
            </div>
          </div>

          {/* ── Payment Status toggle ── */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#212529]/80">Estati Peman</label>
            <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {(['Payé', 'À Crédit'] as PaymentStatusKey[]).map(s => (
                <button key={s} type="button" onClick={() => setPayStatus(s)}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition
                    ${payStatus === s
                      ? s === 'Payé' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-[#212529] hover:bg-slate-100'}`}>
                  {s === 'Payé' ? '✓ Peye' : '⏳ À Crédit'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Payment Method (only when Payé) ── */}
          {payStatus === 'Payé' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#212529]/80">Metòd Peman</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setPayMethod(m.key)}
                    className={`flex flex-col items-center gap-1 rounded-2xl border py-3 px-2 text-xs font-semibold transition
                      ${payMethod === m.key
                        ? m.activeClass
                        : 'border-slate-200 bg-slate-50 text-[#212529]/70 hover:bg-slate-100'}`}
                  >
                    <span className="text-lg">{m.icon}</span>
                    <span className="leading-tight text-center">
                      {m.key === 'Moncash' ? (
                        <>Moncash<br /><span className="text-[10px] opacity-70">50937304541</span></>
                      ) : m.key === 'Natcash' ? (
                        <>Natcash<br /><span className="text-[10px] opacity-70">50935951252</span></>
                      ) : m.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Mobile money notification */}
              {selectedMethod.phone && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <span className="text-lg mt-0.5">ℹ️</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-800">
                      Peman via {selectedMethod.key}
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Nimewo <span className="font-bold">{selectedMethod.phone}</span> a ap anrejistre nan metadata tranzaksyon an.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Total summary ── */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm text-[#212529]/60">
                <span>Sous-total ({quantity} × {fmt(unitPrice)})</span>
                <span className="font-medium text-[#212529]">{fmt(subtotal)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Rabè ({discountPct}%)</span>
                  <span className="font-semibold">−{fmt(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-slate-200 pt-2.5">
                <div>
                  <p className="text-sm font-medium text-[#212529]/60">Total Final</p>
                  {payStatus === 'Payé' && selectedMethod.phone && (
                    <p className="text-xs text-[#212529]/40 mt-0.5">
                      Peman: {selectedMethod.key} · {selectedMethod.phone}
                    </p>
                  )}
                </div>
                <p className="text-3xl font-extrabold text-[#0056b3]">{fmt(total)}</p>
              </div>
            </div>
          </div>

          {/* ── Feedback ── */}
          {success && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700">
              <span>✓</span> {success}
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
            className="w-full rounded-2xl bg-[#0056b3] py-3.5 text-sm font-bold text-white shadow-md transition
              hover:bg-[#0047a1] hover:scale-[1.01] active:scale-[0.99]
              disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {saving ? 'Anrejistreman…' : payStatus === 'À Crédit' ? '⏳ Anrejistre Acha a Kredi' : '✓ Anrejistre Acha'}
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
