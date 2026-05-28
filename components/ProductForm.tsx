'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from './Button';
import { formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabaseClient';
import { ProductImageUploader } from './ProductImageUploader';

type ProductFormProps = {
  onSaved?: () => void;
};

export function ProductForm({ onSaved }: ProductFormProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [salePrice, setSalePrice] = useState('0');
  const [stockQuantity, setStockQuantity] = useState('0');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setOwnerId(data.user?.id ?? null);
    }

    loadUser();
  }, []);

  const canSubmit = useMemo(() => {
    return name.trim().length > 0 && Number(purchasePrice) >= 0 && Number(salePrice) >= 0 && Number(stockQuantity) >= 0;
  }, [name, purchasePrice, salePrice, stockQuantity]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus('submitting');
    setMessage('');

    const payload = {
      owner_id: ownerId || undefined,
      name: name.trim(),
      category: category.trim(),
      purchase_price: Number(purchasePrice),
      sale_price: Number(salePrice),
      stock_quantity: Number(stockQuantity),
      barcode: barcode.trim() || null,
      image_url: imageUrl || null,
      currency: 'HTG',
    } as any;

    const { error } = await supabase.from('products').insert(payload);

    if (error) {
      setStatus('error');
      setMessage(error.message);
      return;
    }

    setStatus('success');
    setMessage('Produit ajouté avec succès.');
    setName('');
    setCategory('');
    setPurchasePrice('0');
    setSalePrice('0');
    setStockQuantity('0');
    setBarcode('');
    setImageUrl('');
    onSaved?.();
  };

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-anthracite">Ajouter un produit</h2>
        <p className="mt-1 text-sm text-anthracite/70">Ajoutez un produit au catalogue et mettez à jour le stock immédiatement.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">Nom du produit</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Savon artisanal"
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">Catégorie</label>
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Ex: Hygiène"
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">Prix d'achat</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">Prix de vente</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">Stock initial</label>
            <input
              type="number"
              min="0"
              value={stockQuantity}
              onChange={(event) => setStockQuantity(event.target.value)}
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">Code-barres</label>
            <input
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              placeholder="Ex: 1234567890123"
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">URL d'image</label>
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://..."
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>
        </div>

        <ProductImageUploader onUpload={(url) => setImageUrl(url)} />

        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-anthracite/80">Valeur estimée</p>
            <p className="text-lg font-semibold text-anthracite">{formatCurrency(Number(salePrice) * Number(stockQuantity) || 0)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="submit" className={canSubmit ? '' : 'bg-slate-200 text-anthracite cursor-not-allowed'} disabled={!canSubmit || status === 'submitting'}>
            Enregistrer le produit
          </Button>
        </div>

        {status !== 'idle' && (
          <div className={`rounded-3xl px-4 py-3 text-sm ${status === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
            {message}
          </div>
        )}
      </form>
    </section>
  );
}
