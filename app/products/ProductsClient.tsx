'use client';

import { useState, useCallback, useRef } from 'react';
import {
  getProductsAction,
  createProductAction,
  updateProductAction,
  deleteProductAction,
  type Product,
  type ProductPayload,
} from '../actions/products';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, AlertTriangle, X,
  Upload, ImageIcon, Package, TrendingUp, Tag,
  ShoppingBag, Star, BarChart2, CheckCircle,
} from 'lucide-react';

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BUCKET = 'product-images';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function publicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

function calcMargin(p: Product) {
  if (!p.sale_price || p.sale_price <= p.purchase_price) return 0;
  return ((p.sale_price - p.purchase_price) / p.sale_price) * 100;
}

function fmtHTG(n: number) {
  return new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function stockBadge(qty: number) {
  if (qty === 0) return { label: 'Epuize', cls: 'bg-red-100 text-red-600' };
  if (qty <= 5)  return { label: `${qty} rÃ¨s`, cls: 'bg-amber-100 text-amber-700' };
  return { label: `${qty} en stock`, cls: 'bg-emerald-100 text-emerald-700' };
}

// â”€â”€ Image upload helper (client-side only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function uploadProductImage(userId: string, productId: string, file: File): Promise<string> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${userId}/${productId}/photo.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  return publicUrl(path);
}

// â”€â”€ Skeleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden animate-pulse">
      <div className="aspect-square bg-slate-100" />
      <div className="p-4 space-y-2">
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-100" />
        <div className="h-5 w-2/3 rounded bg-slate-200 mt-3" />
      </div>
    </div>
  );
}

// â”€â”€ Image Upload Zone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ImageUploadZone({
  currentUrl,
  onUpload,
  uploading,
}: {
  currentUrl: string | null;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) onUpload(file);
  }

  return (
    <div
      onClick={() => !uploading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all overflow-hidden
        ${dragging ? 'border-[#001F3F] bg-slate-50' : 'border-slate-200 hover:border-[#001F3F] hover:bg-slate-50'}
        ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
      style={{ aspectRatio: '1 / 1' }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
      />

      {currentUrl ? (
        <>
          <img src={currentUrl} alt="Product" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
            <Upload size={20} className="text-white" />
            <span className="text-white text-xs font-medium">Chanje foto</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
          {uploading ? (
            <>
              <div className="h-6 w-6 rounded-full border-2 border-[#001F3F] border-t-transparent animate-spin" />
              <span className="text-xs text-slate-500">Ap telechajeâ€¦</span>
            </>
          ) : (
            <>
              <div className="rounded-full bg-slate-50 p-3">
                <ImageIcon size={20} className="text-[#001F3F]" />
              </div>
              <p className="text-xs text-slate-500 text-center">
                Klike oswa trennen yon imaj<br />
                <span className="text-slate-400">JPG, PNG, WebP</span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Product Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProductModal({
  product,
  userId,
  onClose,
  onSaved,
}: {
  product: Product | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [form, setForm] = useState<ProductPayload>({
    name:           product?.name ?? '',
    category:       product?.category ?? '',
    purchase_price: product?.purchase_price ?? 0,
    sale_price:     product?.sale_price ?? 0,
    stock_quantity: product?.stock_quantity ?? 0,
    image_url:      product?.image_url ?? null,
  });
  const [uploading, setUploading] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  // For new products, we need the ID before uploading
  const [tempId,    setTempId]    = useState<string | null>(product?.id ?? null);

  const previewMargin = form.sale_price > 0
    ? ((form.sale_price - form.purchase_price) / form.sale_price * 100).toFixed(1)
    : null;

  async function handleImageUpload(file: File) {
    setUploading(true);
    setError('');
    try {
      // For new products, create a temp ID for the path
      const idForPath = tempId ?? `temp-${Date.now()}`;
      const url = await uploadProductImage(userId, idForPath, file);
      setForm(f => ({ ...f, image_url: url }));
    } catch (e: any) {
      setError('ErÃ¨ telechajman: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Non pwodui obligatwa.'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await updateProductAction(product.id, form);
      } else {
        const newId = await createProductAction(form);
        // If image was uploaded with temp path, re-upload under real ID
        if (form.image_url && form.image_url.includes('temp-')) {
          setTempId(newId);
        }
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'ErÃ¨');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl my-4"
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1e293b]">
              {isEdit ? 'Modifye Pwodui' : 'Nouvo Pwodui'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {isEdit ? 'Mete ajou enfÃ²masyon ak foto pwodui ou a' : 'Ajoute yon nouvo pwodui ak foto li'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          {/* Photo + fields layout */}
          <div className="flex gap-5">
            {/* Left: image */}
            <div className="w-36 shrink-0">
              <label className="block text-sm font-medium text-slate-700 mb-2">Foto Pwodui</label>
              <ImageUploadZone
                currentUrl={form.image_url ?? null}
                onUpload={handleImageUpload}
                uploading={uploading}
              />
            </div>

            {/* Right: fields */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Non Pwodui *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ex: Diri blanc 5kg"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Kategori</label>
                <input
                  value={form.category ?? ''}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="ex: Alimantasyon"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Kantite Stock</label>
                <input
                  type="number" min="0"
                  value={form.stock_quantity}
                  onChange={e => setForm(f => ({ ...f, stock_quantity: parseInt(e.target.value) || 0 }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 transition"
                />
              </div>
            </div>
          </div>

          {/* Prices row */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Pri Acha (HTG)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.purchase_price}
                onChange={e => setForm(f => ({ ...f, purchase_price: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Pri Vant (HTG)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.sale_price}
                onChange={e => setForm(f => ({ ...f, sale_price: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30 transition"
              />
            </div>
          </div>

          {/* Margin preview */}
          {previewMargin !== null && parseFloat(previewMargin) > 0 && (
            <div className="mt-3 rounded-xl bg-slate-50 border border-emerald-100 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <TrendingUp size={14} />
                MÃ²j pwojete
              </div>
              <span className="font-bold text-emerald-700">{previewMargin}%</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-5">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Anile
            </button>
            <button
              type="submit" disabled={saving || uploading}
              className="flex-1 rounded-xl bg-[#001F3F] py-2.5 text-sm font-semibold text-white hover:bg-[#002D5B] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving
                ? <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Ap soveâ€¦</>
                : <><CheckCircle size={15} /> {isEdit ? 'Mete Ajou' : 'Kreye Pwodui'}</>
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// â”€â”€ Delete Confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center"
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <Trash2 size={20} className="text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-[#1e293b]">Efase pwodui?</h3>
        <p className="mt-1.5 text-sm text-slate-500">
          <span className="font-medium text-[#1e293b]">"{name}"</span> pral efase pou toujou.
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            Anile
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition">
            Wi, Efase
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// â”€â”€ Product Card (e-commerce style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const margin  = calcMargin(product);
  const badge   = stockBadge(product.stock_quantity);
  const imgUrl  = product.image_url;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-[#001F3F]/20 transition-all duration-200"
    >
      {/* Product image */}
      <div className="relative aspect-square bg-[#F8FAFC] overflow-hidden">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300">
            <Package size={40} strokeWidth={1.5} />
            <span className="text-xs">Pas de photo</span>
          </div>
        )}

        {/* Stock badge */}
        <div className="absolute top-2.5 left-2.5">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        {/* Margin badge */}
        {margin > 0 && (
          <div className="absolute top-2.5 right-2.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#1e293b]/80 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white">
              <TrendingUp size={10} />
              {margin.toFixed(0)}%
            </span>
          </div>
        )}

        {/* Hover actions overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-end p-3 gap-2">
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#1e293b] shadow hover:bg-slate-50 hover:text-[#001F3F] transition"
          >
            <Edit2 size={12} className="inline mr-1" />
            Modifye
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow hover:bg-red-50 transition"
          >
            <Trash2 size={12} className="inline mr-1" />
            Efase
          </button>
        </div>
      </div>

      {/* Product info */}
      <div className="p-4">
        {product.category && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[#001F3F] mb-1.5">
            <Tag size={9} />
            {product.category}
          </span>
        )}
        <h3 className="font-semibold text-[#1e293b] text-sm leading-snug line-clamp-2 mb-3">
          {product.name}
        </h3>

        {/* Prices */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">Pri Vant</p>
            <p className="text-lg font-bold text-[#1e293b]">
              {fmtHTG(product.sale_price)} <span className="text-xs font-normal text-slate-400">HTG</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 mb-0.5">Pri Acha</p>
            <p className="text-sm text-slate-500">{fmtHTG(product.purchase_price)}</p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            ValÃ¨: <span className="font-medium text-[#1e293b]">{fmtHTG(product.purchase_price * product.stock_quantity)} HTG</span>
          </span>
          <button
            onClick={onEdit}
            className="rounded-lg bg-[#001F3F]/10 px-2.5 py-1 text-xs font-semibold text-[#001F3F] hover:bg-[#001F3F]/20 transition"
          >
            <Upload size={10} className="inline mr-1" />
            Foto
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ProductsClient({ initialProducts, initialUserId }: { initialProducts: Product[]; initialUserId: string }) {
  const [products,     setProducts]     = useState<Product[]>(initialProducts);
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState('');
  const [filterCat,    setFilterCat]    = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [editProduct,  setEditProduct]  = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [userId]                        = useState(initialUserId);
  const [error,        setError]        = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const prods = await getProductsAction();
      setProducts(prods);
    } catch (e: any) {
      setError(e?.message ?? 'ErÃ¨ chajman.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Computed stats
  const totalValue  = products.reduce((s, p) => s + p.purchase_price * p.stock_quantity, 0);
  const avgMargin   = products.length
    ? products.reduce((s, p) => s + calcMargin(p), 0) / products.length
    : 0;
  const outOfStock  = products.filter(p => p.stock_quantity === 0).length;
  const withPhotos  = products.filter(p => p.image_url).length;

  // Categories
  const categories  = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];

  // Filtered
  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !search || p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q);
    const matchCat    = !filterCat || p.category === filterCat;
    return matchSearch && matchCat;
  });

  function openAdd()            { setEditProduct(null); setShowModal(true); }
  function openEdit(p: Product) { setEditProduct(p);    setShowModal(true); }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProductAction(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 space-y-6">

        {/* â”€â”€ Header â”€â”€ */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#001F3F]/70">KatalÃ²g</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-800">Pwodui & KatalÃ²g</h1>
            <p className="mt-1 text-sm text-slate-500">Jere pwodui, pri, foto ak stock ou yo an tan reyÃ¨l.</p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-[#001F3F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#002D5B] active:scale-95 transition-all"
          >
            <Plus size={16} />
            Nouvo Pwodui
          </button>
        </div>

        {/* â”€â”€ KPI Strip â”€â”€ */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total Pwodui',  value: String(products.length),    icon: Package,   accent: 'bg-blue-100 text-[#001F3F]' },
            { label: 'ValÃ¨ Stock',    value: fmtHTG(totalValue) + ' G',   icon: BarChart2,  accent: 'bg-emerald-100 text-emerald-800' },
            { label: 'MwayÃ¨n MÃ²j',   value: avgMargin.toFixed(1) + '%',  icon: TrendingUp, accent: 'bg-purple-100 text-purple-800' },
            { label: 'Foto Mete',     value: `${withPhotos}/${products.length}`, icon: Star, accent: 'bg-amber-100 text-amber-800' },
          ].map(k => (
            <div key={k.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${k.accent}`}>
                <k.icon size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className="text-xl font-bold text-slate-800">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* â”€â”€ Toolbar â”€â”€ */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ChÃ¨che pwoduiâ€¦"
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001F3F]/30/30 transition"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterCat('')}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${!filterCat ? 'bg-[#001F3F] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                Tout
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCat(cat === filterCat ? '' : cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${filterCat === cat ? 'bg-[#001F3F] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400 ml-auto shrink-0">
            {filtered.length} pwodui
          </p>
        </div>

        {/* â”€â”€ Product Grid â”€â”€ */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="mb-4 rounded-full bg-slate-100 p-5">
              <Package size={36} className="text-[#001F3F]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">
              {search || filterCat ? 'Okenn rezilta' : 'KatalÃ²g ou a vid'}
            </h3>
            <p className="mt-1.5 text-sm text-slate-500 max-w-xs">
              {search || filterCat
                ? 'Eseye chanje filtre ou yo oswa chÃ¨che yon lÃ²t mo.'
                : 'KÃ²manse ajoute pwodui ou yo pou bati katalÃ²g ou a.'}
            </p>
            {!search && !filterCat && (
              <button
                onClick={openAdd}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#001F3F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#002D5B] transition"
              >
                <Plus size={15} />
                Ajoute Premye Pwodui
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <AnimatePresence>
              {filtered.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onEdit={() => openEdit(p)}
                  onDelete={() => setDeleteTarget(p)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* â”€â”€ Modals â”€â”€ */}
      <AnimatePresence>
        {showModal && (
          <ProductModal
            product={editProduct}
            userId={userId}
            onClose={() => setShowModal(false)}
            onSaved={load}
          />
        )}
        {deleteTarget && (
          <DeleteConfirm
            name={deleteTarget.name}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Default export removed â€” use ProductsClient named export instead

