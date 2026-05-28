'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { supabase } from '../../lib/supabaseClient';
// Image upload via direct Supabase Storage (anon key + user session)
// We do NOT call the server action because the service-role key is not valid yet.
async function uploadImageClientSide(file: File): Promise<string> {
  const ext      = file.name.split('.').pop() ?? 'jpg';
  const filename = `product-${Date.now()}.${ext}`;
  const path     = `product-images/${filename}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { upsert: true });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('URL imaj pa disponib.');
  return data.publicUrl;
}

// ── Demo products (inserted client-side — no service-role key needed) ──────────

const DEMO_PRODUCTS = [
  { name: 'Riz Blanc 50kg',            category: 'Alimentation', purchase_price: 2200, sale_price: 2750, stock_quantity:  50 },
  { name: 'Huile Végétale 4L',          category: 'Alimentation', purchase_price:  850, sale_price: 1100, stock_quantity:  30 },
  { name: 'Sucre en Poudre 5kg',       category: 'Alimentation', purchase_price:  450, sale_price:  600, stock_quantity:  45 },
  { name: 'Pâte Alimentaire 500g',     category: 'Alimentation', purchase_price:  120, sale_price:  175, stock_quantity:  80 },
  { name: 'Lait Carnation 410ml',      category: 'Alimentation', purchase_price:  140, sale_price:  200, stock_quantity:  60 },
  { name: 'Bouillon Maggi (boîte)',    category: 'Alimentation', purchase_price:   80, sale_price:  125, stock_quantity: 200 },
  { name: 'Haricots Rouges 1kg',      category: 'Alimentation', purchase_price:  220, sale_price:  300, stock_quantity:  70 },
  { name: 'Farine de Blé 5kg',        category: 'Alimentation', purchase_price:  380, sale_price:  520, stock_quantity:  35 },
  { name: 'Savon Lux (boîte 50u)',     category: 'Hygiène',      purchase_price:  180, sale_price:  250, stock_quantity: 100 },
  { name: 'Détergent Ajax 1kg',        category: 'Entretien',    purchase_price:  350, sale_price:  480, stock_quantity:  40 },
  { name: 'Eau Minérale 1.5L (cais.)', category: 'Boissons',     purchase_price:  450, sale_price:  650, stock_quantity:  25 },
  { name: 'Jus Tropicana 1L',          category: 'Boissons',     purchase_price:  180, sale_price:  260, stock_quantity:  48 },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  category: string;
  sale_price: number;
  purchase_price: number;
  stock_quantity: number;
  barcode?: string;
  image_url?: string;
};

type FormState = {
  name: string;
  category: string;
  purchase_price: string;
  sale_price: string;
  stock_quantity: string;
  barcode: string;
  image_url: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  category: '',
  purchase_price: '0',
  sale_price: '0',
  stock_quantity: '0',
  barcode: '',
  image_url: '',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return (
    new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) +
    ' HTG'
  );
}

function marginPct(purchase: number, sale: number): number {
  if (purchase <= 0 || sale <= 0) return 0;
  return Math.round(((sale - purchase) / sale) * 100);
}

// ── StockBadge ────────────────────────────────────────────────────────────────

function StockBadge({ qty }: { qty: number }) {
  if (qty <= 0)
    return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-semibold text-red-700">Estòk vid</span>;
  if (qty <= 5)
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">Prèske fini ({qty})</span>;
  return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">{qty} an estòk</span>;
}

// ── ImageUploadZone ───────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

function ImageUploadZone({
  currentUrl,
  onUpload,
}: {
  currentUrl: string;
  onUpload: (url: string) => void;
}) {
  const inputRef               = useRef<HTMLInputElement>(null);
  const [preview, setPreview]  = useState(currentUrl);
  const [status,  setStatus]   = useState<UploadStatus>('idle');
  const [err,     setErr]      = useState('');
  const [dragging,setDragging] = useState(false);

  // Sync if parent resets form
  useEffect(() => { setPreview(currentUrl); }, [currentUrl]);

  const processFile = async (file: File) => {
    // Validate
    if (!file.type.startsWith('image/')) {
      setErr('Fichye a dwe yon imaj (JPG, PNG, WEBP…).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr('Imaj la twò gwo — maksimòm 5 MB.');
      return;
    }

    setErr('');
    setStatus('uploading');

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    try {
      const publicUrl = await uploadImageClientSide(file);
      setPreview(publicUrl);
      setStatus('done');
      onUpload(publicUrl);
    } catch (e) {
      setErr((e as Error).message ?? 'Erè telechajman.');
      setStatus('error');
      setPreview('');   // clear broken preview
      onUpload('');
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const clearImage = () => {
    setPreview('');
    setStatus('idle');
    setErr('');
    onUpload('');
  };

  return (
    <div className="space-y-1.5">
      {/* Hidden native file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="hidden"
      />

      {preview ? (
        /* ── Preview card ── */
        <div className="group relative overflow-hidden rounded-xl border border-slate-200">
          <img
            src={preview}
            alt="Foto pwodui"
            className="h-44 w-full object-cover"
          />

          {/* Spinner overlay while uploading */}
          {status === 'uploading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
              <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
            </div>
          )}

          {/* Success badge */}
          {status === 'done' && (
            <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow-sm">
              ✓
            </div>
          )}

          {/* Hover actions */}
          {status !== 'uploading' && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#212529] transition hover:bg-white"
              >
                📷 Chanje
              </button>
              <button
                type="button"
                onClick={clearImage}
                className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                Retire
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Drop zone ── */
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition select-none ${
            dragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          } ${status === 'uploading' ? 'pointer-events-none' : ''}`}
        >
          {status === 'uploading' ? (
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
          ) : (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-500">
                  {dragging ? 'Lage foto a isit…' : 'Klike oswa glise yon foto'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">JPG, PNG, WEBP — maksimòm 5 MB</p>
              </div>
            </>
          )}
        </div>
      )}

      {err && (
        <p className="text-xs text-red-500">{err}</p>
      )}
    </div>
  );
}

// ── ProductModal (Add / Edit) ─────────────────────────────────────────────────

function ProductModal({
  initial,
  ownerId,
  onClose,
  onSaved,
}: {
  initial?: Product;
  ownerId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name:           initial.name,
          category:       initial.category ?? '',
          purchase_price: String(initial.purchase_price),
          sale_price:     String(initial.sale_price),
          stock_quantity: String(initial.stock_quantity),
          barcode:        initial.barcode  ?? '',
          image_url:      initial.image_url ?? '',
        }
      : EMPTY_FORM
  );
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');
  const [showBarcode, setShowBarcode] = useState(Boolean(initial?.barcode));

  const isEdit  = Boolean(initial);
  const margin  = marginPct(Number(form.purchase_price), Number(form.sale_price));
  const profit  = Number(form.sale_price) - Number(form.purchase_price);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Non pwodui a obligatwa.'); return; }
    if (Number(form.sale_price) < 0 || Number(form.purchase_price) < 0) {
      setErr('Pri yo pa ka negatif.');
      return;
    }
    setSaving(true);
    setErr('');

    const payload = {
      owner_id:       ownerId,
      name:           form.name.trim(),
      category:       form.category.trim(),
      purchase_price: Number(form.purchase_price),
      sale_price:     Number(form.sale_price),
      stock_quantity: Number(form.stock_quantity),
      barcode:        form.barcode.trim() || null,
      image_url:      form.image_url.trim() || null,
      currency:       'HTG',
    };

    const { error } = isEdit
      ? await supabase.from('products').update(payload).eq('id', initial!.id)
      : await supabase.from('products').insert(payload);

    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-8"
      onClick={onClose}
    >
      <div
        className="mb-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#212529]">
              {isEdit ? '✏️ Modifye Pwodui' : '+ Ajoute Pwodui'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {isEdit ? 'Mete ajou enfòmasyon pwodui a' : 'Ranpli fòm nan pou ajoute yon nouvo pwodui'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">

          {/* ── Photo ── */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Foto Pwodui <span className="font-normal normal-case text-slate-400">(opsyonèl)</span>
            </label>
            <ImageUploadZone
              currentUrl={form.image_url}
              onUpload={(url) => setForm((f) => ({ ...f, image_url: url }))}
            />
          </div>

          {/* ── Name + Category ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Non Pwodui <span className="text-red-400">*</span>
              </label>
              <input
                value={form.name}
                onChange={set('name')}
                placeholder="Ex: Riz Blanc 50kg"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#212529] outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Kategori
              </label>
              <input
                value={form.category}
                onChange={set('category')}
                placeholder="Ex: Alimentation"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#212529] outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>

          {/* ── Prices + Stock ── */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pri Acha (HTG)
              </label>
              <input
                type="number" min="0" step="0.01"
                value={form.purchase_price}
                onChange={set('purchase_price')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#212529] outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pri Vant (HTG)
              </label>
              <input
                type="number" min="0" step="0.01"
                value={form.sale_price}
                onChange={set('sale_price')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#212529] outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Kantite Estòk
              </label>
              <input
                type="number" min="0"
                value={form.stock_quantity}
                onChange={set('stock_quantity')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#212529] outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>

          {/* ── Margin preview ── */}
          {Number(form.sale_price) > 0 && Number(form.purchase_price) > 0 && (
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
              margin >= 20 ? 'bg-emerald-50' : margin >= 8 ? 'bg-amber-50' : 'bg-red-50'
            }`}>
              <span className="text-slate-500">Maj estimé</span>
              <div className="flex items-center gap-3">
                <span className={`font-bold text-base ${
                  margin >= 20 ? 'text-emerald-700' : margin >= 8 ? 'text-amber-700' : 'text-red-600'
                }`}>
                  {margin}%
                </span>
                <span className="text-slate-400 text-xs">
                  +{fmtCurrency(profit)} / inite
                </span>
              </div>
            </div>
          )}

          {/* ── Barcode (optional, collapsible) ── */}
          <div>
            {!showBarcode ? (
              <button
                type="button"
                onClick={() => setShowBarcode(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-blue-500"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
                Ajoute kòd bar (opsyonèl)
              </button>
            ) : (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Kòd Bar <span className="font-normal normal-case">(opsyonèl)</span>
                  </label>
                  {!form.barcode && (
                    <button
                      type="button"
                      onClick={() => setShowBarcode(false)}
                      className="text-[10px] text-slate-300 hover:text-slate-500 transition"
                    >
                      Kache ✕
                    </button>
                  )}
                </div>
                <input
                  value={form.barcode}
                  onChange={set('barcode')}
                  placeholder="Ex: 3700123400127"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-[#212529] outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </div>
            )}
          </div>

          {err && (
            <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600">
              {err}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Anile
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"/>
                Ap sove…
              </span>
            ) : isEdit ? 'Mete Ajou' : 'Anrejistre Pwodui'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product Card ───────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const margin = marginPct(product.purchase_price, product.sale_price);

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* Thumbnail */}
      <div className="relative h-36 flex-shrink-0 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
        )}

        {/* Category */}
        {product.category && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur-sm">
            {product.category}
          </span>
        )}

        {/* Margin badge */}
        <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ${
          margin >= 25 ? 'bg-emerald-500' : margin >= 12 ? 'bg-amber-500' : 'bg-red-400'
        }`}>
          {margin}% maj
        </span>

        {/* Barcode chip */}
        {product.barcode && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-white/80 backdrop-blur-sm">
            {product.barcode}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-sm font-semibold leading-snug text-[#212529]">{product.name}</p>

        <div className="mt-2.5 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Pri Vant</p>
            <p className="text-lg font-bold text-[#212529]">{fmtCurrency(product.sale_price)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Pri Acha</p>
            <p className="text-sm text-slate-400">{fmtCurrency(product.purchase_price)}</p>
          </div>
        </div>

        <div className="mt-2.5">
          <StockBadge qty={product.stock_quantity} />
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            ✏️ Modifye
          </button>
          <button
            onClick={onDelete}
            className="rounded-xl border border-red-100 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:border-red-200 hover:bg-red-50"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton grid ──────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="h-36 bg-slate-100"/>
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 rounded-lg bg-slate-100"/>
            <div className="h-5 w-1/2 rounded-lg bg-slate-100"/>
            <div className="h-3 w-1/3 rounded-full bg-slate-100"/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [products,      setProducts]      = useState<Product[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [ownerId,       setOwnerId]       = useState<string | null>(null);
  const [search,        setSearch]        = useState('');
  const [categoryFilter,setCategoryFilter]= useState('');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editTarget,    setEditTarget]    = useState<Product | undefined>(undefined);
  const [seeding,       setSeeding]       = useState(false);
  const [seedMsg,       setSeedMsg]       = useState<{ text: string; ok: boolean } | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? null;
    setOwnerId(uid);
    if (!uid) { setLoading(false); return; }

    const { data } = await supabase
      .from('products')
      .select('id,name,category,sale_price,purchase_price,stock_quantity,barcode,image_url')
      .eq('owner_id', uid)
      .order('name');

    setProducts((data ?? []) as Product[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort() as string[],
    [products]
  );

  const filtered = useMemo(() =>
    products.filter(p => {
      const ms = !search        || p.name.toLowerCase().includes(search.toLowerCase());
      const mc = !categoryFilter || p.category === categoryFilter;
      return ms && mc;
    }),
    [products, search, categoryFilter]
  );

  const totalStockValue = useMemo(() => products.reduce((s, p) => s + p.sale_price * p.stock_quantity, 0), [products]);
  const lowStockCount   = products.filter(p => p.stock_quantity <= 5).length;

  const handleDelete = async (product: Product) => {
    if (!confirm(`Efase "${product.name}" definitivman?`)) return;
    await supabase.from('products').delete().eq('id', product.id);
    loadProducts();
  };

  const openAdd  = () => { setEditTarget(undefined); setModalOpen(true); };
  const openEdit = (p: Product) => { setEditTarget(p); setModalOpen(true); };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMsg(null);

    if (!ownerId) {
      setSeedMsg({ text: 'Konekte anvan ou ka ajoute pwodui demo.', ok: false });
      setSeeding(false);
      return;
    }

    // Fetch existing names to avoid duplicates
    const { data: existing } = await supabase
      .from('products')
      .select('name')
      .eq('owner_id', ownerId);

    const existingNames = new Set((existing ?? []).map((p: any) => p.name as string));
    const toInsert = DEMO_PRODUCTS.filter(p => !existingNames.has(p.name));

    if (toInsert.length === 0) {
      setSeedMsg({ text: `ℹ️ Tout pwodui demo yo deja egziste (${DEMO_PRODUCTS.length} total).`, ok: true });
      setSeeding(false);
      return;
    }

    const rows = toInsert.map(p => ({
      ...p,
      owner_id: ownerId,
      currency: 'HTG',
    }));

    const { error, data } = await supabase
      .from('products')
      .insert(rows)
      .select('id');

    if (error) {
      setSeedMsg({ text: `Erè: ${error.message}`, ok: false });
    } else {
      const inserted = (data ?? []).length;
      const skipped  = DEMO_PRODUCTS.length - toInsert.length;
      setSeedMsg({
        text: `✅ ${inserted} pwodui demo ajoute${skipped > 0 ? ` · ${skipped} te deja la` : ''}.`,
        ok: true,
      });
    }

    setSeeding(false);
    loadProducts();
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[#f8fbff] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-blue-600">Katalòg</p>
                <h1 className="text-2xl font-semibold text-[#212529] md:text-3xl">Pwodui & Estòk</h1>
                <p className="mt-1 text-sm text-[#212529]/60">Jere katalòg ou ak envantè an tan reyèl.</p>
              </div>

              <div className="flex flex-wrap items-start gap-3">
                {/* Stats */}
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Tout Pwodui</p>
                  <p className="mt-1 text-xl font-bold text-[#212529]">{products.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Valè Estòk</p>
                  <p className="mt-1 text-xl font-bold text-[#212529]">{fmtCurrency(totalStockValue)}</p>
                </div>
                {lowStockCount > 0 && (
                  <div className="rounded-2xl bg-amber-50 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-amber-600">Estòk Ba</p>
                    <p className="mt-1 text-xl font-bold text-amber-700">{lowStockCount}</p>
                  </div>
                )}

                {/* Seed demo */}
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                  title="Ajoute 12 pwodui demo pou teste aplikasyon an"
                >
                  {seeding ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"/>
                      Ap chaje…
                    </span>
                  ) : '🌱 Pwodui Demo'}
                </button>

                {/* Add button */}
                <button
                  onClick={openAdd}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  + Ajoute Pwodui
                </button>
              </div>
            </div>

            {seedMsg && (
              <div className={`mt-4 rounded-xl px-4 py-2.5 text-sm ${
                seedMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
              }`}>
                {seedMsg.text}
              </div>
            )}
          </div>

          {/* ── Filters ────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Chèche yon pwodui…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-[#212529] shadow-sm outline-none transition focus:border-blue-400"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-[#212529] shadow-sm outline-none transition focus:border-blue-400"
            >
              <option value="">Tout Kategori</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(search || categoryFilter) && (
              <button
                onClick={() => { setSearch(''); setCategoryFilter(''); }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                Efase Filtè
              </button>
            )}
          </div>

          {/* ── Grid ───────────────────────────────────────────────────────── */}
          {loading ? (
            <SkeletonGrid />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-sm">
              {products.length === 0 ? (
                <>
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
                    <svg className="h-10 w-10 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-[#212529]">Pa gen pwodui yo</p>
                  <p className="mt-1 text-sm text-slate-500">Kòmanse pa ajoute premye pwodui ou a, oswa chaje pwodui demo yo.</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button onClick={openAdd}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                      + Ajoute Premye Pwodui
                    </button>
                    <button onClick={handleSeed} disabled={seeding}
                      className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
                      {seeding ? 'Ap chaje…' : '🌱 Chaje 12 Pwodui Demo'}
                    </button>
                  </div>
                  {seedMsg && (
                    <p className={`mt-4 text-sm font-medium ${seedMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {seedMsg.text}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-[#212529]">Pa gen rezilta</p>
                  <p className="mt-1 text-sm text-slate-500">Chanje rechèch ou a oswa filtè a.</p>
                  <button onClick={() => { setSearch(''); setCategoryFilter(''); }}
                    className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
                    Efase filtè yo
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                {filtered.length} pwodui{filtered.length !== products.length ? ` (sou ${products.length})` : ''}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map(p => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onEdit={() => openEdit(p)}
                    onDelete={() => handleDelete(p)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <ProductModal
          initial={editTarget}
          ownerId={ownerId}
          onClose={() => { setModalOpen(false); setEditTarget(undefined); }}
          onSaved={loadProducts}
        />
      )}
    </ProtectedRoute>
  );
}
