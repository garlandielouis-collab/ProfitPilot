'use client';

import { useMemo, useState } from 'react';
import { Button } from './Button';
import { useLanguage } from './LanguageWrapper';

type ActionType = 'sale' | 'expense';

type CategoryOption = {
  value: string;
  label: { fr: string; ht: string };
};

type QuickActionFormProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: { type: ActionType; name: string; amount: number; category: string; discount?: number }) => void;
};

const categories: CategoryOption[] = [
  { value: 'Vente', label: { fr: 'Vente', ht: 'Vant' } },
  { value: 'Achat', label: { fr: 'Achat', ht: 'Acha' } },
  { value: 'Transport', label: { fr: 'Transport', ht: 'Transpòt' } },
  { value: 'Autre', label: { fr: 'Autre', ht: 'Lòt' } },
];

export function QuickActionForm({ open, onClose, onSave }: QuickActionFormProps) {
  const { language, t } = useLanguage();
  const [type, setType] = useState<ActionType>('sale');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(categories[0].value);
  const [discount, setDiscount] = useState('');

  const amountValue = Number(amount.replace(',', '.'));
  const discountValue = Number(discount) || 0;
  const isValid = amountValue > 0 && discountValue >= 0 && discountValue <= 100;

  const categoryOptions = useMemo(
    () => categories.map((option) => ({ value: option.value, label: t(option.label) })),
    [t]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center">
      <div className="w-full max-w-xl overflow-hidden rounded-[32px] bg-white text-anthracite shadow-2xl sm:mx-4">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-primary/90">{t({ fr: 'Action rapide', ht: 'Aksyon rapid' })}</p>
            <h2 className="mt-2 text-xl font-semibold">{t({ fr: 'Enregistrer une transaction', ht: 'Anrejistre yon tranzaksyon' })}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-anthracite transition hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setType('sale')}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${type === 'sale' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-slate-50 text-anthracite'}`}
            >
              {t({ fr: 'Vente', ht: 'Vant' })}
            </button>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${type === 'expense' ? 'border-danger bg-danger/10 text-danger' : 'border-slate-200 bg-slate-50 text-anthracite'}`}
            >
              {t({ fr: 'Dépense', ht: 'Depans' })}
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">{t({ fr: "Nom de l'article", ht: 'Non atik la' })}</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t({ fr: "Ex: Vente produits", ht: 'Eg: Vant pwodwi' })}
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">{t({ fr: 'Montant', ht: 'Montan' })}</label>
            <input
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-5 text-2xl font-semibold text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
            <p className="text-xs text-anthracite/60">
              {t({ fr: 'Le montant doit être supérieur à 0', ht: 'Montan an dwe pi gran pase 0' })}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">{t({ fr: 'Catégorie', ht: 'Kategory' })}</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-anthracite/90">{t({ fr: 'Remise (%)', ht: 'Remiz (%)' })}</label>
            <input
              type="number"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              placeholder="0"
              min="0"
              max="100"
              step="1"
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-anthracite outline-none transition focus:border-primary focus:bg-white"
            />
            <p className="text-xs text-anthracite/60">
              {t({ fr: 'Pourcentage de remise (0-100%)', ht: 'Pousantaj remiz (0-100%)' })}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" onClick={onClose} className="bg-slate-100 text-anthracite hover:bg-slate-200">
              {t({ fr: 'Annuler', ht: 'Anile' })}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!isValid) return;
                onSave({
                  type,
                  name: name.trim() || t({ fr: 'Transaction sans nom', ht: 'Tranzaksyon san non' }),
                  amount: amountValue,
                  category,
                  discount: discountValue,
                });
                setName('');
                setAmount('');
                setDiscount('');
                setCategory(categories[0].value);
                setType('sale');
                onClose();
              }}
              className={`${isValid ? 'bg-primary text-white' : 'bg-slate-200 text-anthracite cursor-not-allowed'}`}
              disabled={!isValid}
            >
              {t({ fr: 'Enregistrer', ht: 'Sere' })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
