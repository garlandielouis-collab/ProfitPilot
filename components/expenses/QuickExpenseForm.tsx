'use client';

// ─────────────────────────────────────────────────────────────────────────────
// DEPANS — une dépense en cinq secondes (étude de marché inversée, §11.2)
//
// « Montant + catégorie, ou photo du reçu, ou voix. » Un montant, un tap sur
// la catégorie, c'est fini. La photo est facultative ; elle garde la preuve
// (F03). « Kay » est une catégorie comme les autres à l'écran, mais pas en
// base : c'est l'argent pris pour la maison (F04), qui sort de la caisse sans
// toucher au profit du commerce — `scope = 'personal'`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Camera, Home, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../LanguageWrapper';
import { useCompany } from '../../hooks/useCompany';
import { upsertExpense } from '../../app/actions/expenses';
import { supabase } from '../../lib/supabaseClient';
import { compressImage } from '../../lib/imageCompress';
import { localDay } from '../../lib/eveningReport';
import { Button, PaymentPicker, type PaymentKey } from '../ds';
import { cn } from '../../lib/utils';
import { notifyEntrySaved, type ExpensePreset } from '../../lib/quickSheets';
import { AmountInput, toHtg, type AmountUnit } from '../sales/AmountInput';
import { VoiceButton } from '../voice/VoiceButton';

type Category = { value: string; label: { fr: string; ht: string }; household?: boolean };

// Les catégories que le marchand nomme lui-même (§11.2 : « machandiz, transpò,
// kouran, kay… »). La valeur est celle de la liste complète de /expenses, pour
// que le plan comptable classe la dépense au même endroit.
const CATEGORIES: Category[] = [
  { value: 'Stock',       label: { fr: 'Marchandise', ht: 'Machandiz' } },
  { value: 'Transport',   label: { fr: 'Transport',   ht: 'Transpò' } },
  { value: 'Électricité', label: { fr: 'Courant',     ht: 'Kouran' } },
  { value: 'Téléphone',   label: { fr: 'Recharge',    ht: 'Kat / rechaj' } },
  { value: 'Loyer',       label: { fr: 'Loyer',       ht: 'Lwaye' } },
  { value: 'Salaire',     label: { fr: 'Aide',        ht: 'Peye èd' } },
  { value: 'Fournitures', label: { fr: 'Produits',    ht: 'Pwodui' } },
  { value: 'Autre',       label: { fr: 'Autre',       ht: 'Lòt' } },
  { value: 'Retrait personnel', label: { fr: 'Maison', ht: 'Kay' }, household: true },
];

const METHOD_LABEL: Record<PaymentKey, string> = {
  cash: 'Espèces', moncash: 'MonCash', natcash: 'Natcash', card: 'Carte', credit: 'Espèces',
};

export function QuickExpenseForm({ preset, onSaved }: { preset?: ExpensePreset; onSaved?: () => void }) {
  const { t } = useLanguage();
  const { company } = useCompany();
  const [amount, setAmount] = useState(preset?.amount ? String(preset.amount) : '');
  const [unit, setUnit] = useState<AmountUnit>('HTG');
  const [category, setCategory] = useState<Category | null>(
    preset?.household ? CATEGORIES[CATEGORIES.length - 1]
      : preset?.category ? CATEGORIES.find((c) => c.value === preset.category) ?? null
      : null,
  );
  const [note, setNote] = useState(preset?.note ?? '');
  const [method, setMethod] = useState<PaymentKey>('cash');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const methods = [
    { key: 'cash' as const,    label: t({ fr: 'Espèces', ht: 'Kach' }), hint: t({ fr: 'Sorti de la caisse', ht: 'Soti nan kès la' }), icon: 'cash' as const },
    { key: 'moncash' as const, label: 'MonCash', hint: 'Digicel', icon: 'phone' as const },
    { key: 'natcash' as const, label: 'NatCash', hint: 'Natcom',  icon: 'phone' as const },
  ];

  function pickPhoto(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadReceipt(): Promise<string | null> {
    if (!photo || !company?.id) return null;
    const blob = await compressImage(photo);
    const path = `${company.id}/receipts/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from('business-documents').upload(path, blob, {
      contentType: 'image/jpeg', upsert: false,
    });
    if (error) {
      // La dépense passe quand même : le montant compte plus que la preuve.
      toast.error(t({ fr: 'La photo n’a pas pu être envoyée ; la dépense est notée sans elle.', ht: 'Foto a pa t ka pati ; depans lan note san li.' }));
      return null;
    }
    return path;
  }

  async function submit() {
    const value = toHtg(Number(amount.replace(',', '.')), unit);
    if (!(value > 0)) {
      toast.error(t({ fr: 'Tapez le montant.', ht: 'Tape montan an.' }));
      return;
    }
    if (!category) {
      toast.error(t({ fr: 'Choisissez à quoi a servi l’argent.', ht: 'Chwazi pou kisa lajan an te ye.' }));
      return;
    }
    setSubmitting(true);
    try {
      const receiptPath = await uploadReceipt();
      const res = await upsertExpense({
        description:    note.trim() || t(category.label),
        category:       category.value,
        amount:         unit === 'USD' ? Number(amount.replace(',', '.')) : value,
        currency:       unit === 'USD' ? 'USD' : 'HTG',
        payment_status: 'Payé',
        payment_method: METHOD_LABEL[method],
        date:           localDay(new Date(), company?.timezone || 'America/Port-au-Prince'),
        scope:          category.household ? 'personal' : 'business',
        receipt_path:   receiptPath,
      });
      if (!res.ok) { toast.error(res.message); return; }
      if (res.data?.error) { toast.error(res.data.error); return; }
      setConfirmed(true);
      notifyEntrySaved();
      toast.success(category.household
        ? t({ fr: 'Noté : argent pris pour la maison.', ht: 'Note : lajan pou lakay.' })
        : t({ fr: 'Dépense notée.', ht: 'Depans lan note.' }));
      setTimeout(() => onSaved?.(), 500);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <AmountInput value={amount} onChange={setAmount} unit={unit} onUnitChange={setUnit} autoFocus />
        </div>
        <VoiceButton
          kind="expense"
          onResult={(r) => {
            if (r.amount) setAmount(String(r.amount));
            if (r.unit) setUnit(r.unit);
            if (r.note) setNote(r.note);
            if (r.category) {
              const found = CATEGORIES.find((c) => c.value === r.category);
              if (found) setCategory(found);
            }
          }}
        />
      </div>

      <div className="space-y-2">
        <span className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
          {t({ fr: 'Pour quoi ?', ht: 'Pou kisa ?' })}
        </span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t({ fr: 'Catégorie', ht: 'Kategori' })}>
          {CATEGORIES.map((c) => {
            const selected = category?.value === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCategory(c)}
                className={cn(
                  'pressable flex min-h-13 items-center justify-center gap-1 rounded-surface px-2 text-body font-bold transition-colors duration-press',
                  selected ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-border dark:bg-dark-surface2 dark:text-dark-text',
                )}
              >
                {c.household && <Home className="h-4 w-4" aria-hidden />}
                {t(c.label)}
              </button>
            );
          })}
        </div>
        {category?.household && (
          <p className="text-note text-muted dark:text-dark-muted">
            {t({
              fr: 'L’argent pris pour la maison sort de la caisse, pas du profit. Le soir, vous voyez combien vous avez pris cette semaine.',
              ht: 'Lajan w pran pou lakay soti nan kès la, li pa soti nan pwofi a. Aswè, w ap wè konbyen w pran semèn sa a.',
            })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <span className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
          {t({ fr: 'Payé avec', ht: 'Peye ak' })}
        </span>
        <PaymentPicker value={method} onChange={setMethod} methods={methods} />
      </div>

      <div className="space-y-2">
        <label htmlFor="pp-expense-note" className="block text-note font-bold uppercase tracking-wide text-muted dark:text-dark-muted">
          {t({ fr: 'Détail (facultatif)', ht: 'Detay (si w vle)' })}
        </label>
        <input
          id="pp-expense-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t({ fr: 'Ex. : taxi pour le marché', ht: 'Egz. : taksi pou mache a' })}
          className="min-h-13 w-full rounded-surface border border-border bg-surface px-4 text-body text-primary outline-none placeholder:text-muted focus:border-accent dark:border-dark-border dark:bg-dark-surface2 dark:text-dark-text"
        />
      </div>

      {/* La photo du reçu : un tap, l'appareil photo s'ouvre (F03). */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        <div className="flex items-center gap-3 rounded-surface border border-border p-2 dark:border-dark-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={t({ fr: 'Photo du reçu', ht: 'Foto resi a' })} className="h-14 w-14 rounded-control object-cover" />
          <span className="flex-1 text-body text-primary dark:text-dark-text">{t({ fr: 'Reçu joint', ht: 'Resi a la' })}</span>
          <button
            type="button"
            onClick={() => pickPhoto(null)}
            aria-label={t({ fr: 'Retirer la photo', ht: 'Retire foto a' })}
            className="pressable flex h-touch w-touch items-center justify-center rounded-surface text-muted hover:bg-surface"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      ) : (
        <Button variant="quiet" size="lg" block onClick={() => fileRef.current?.click()}>
          <Camera className="h-5 w-5" aria-hidden />
          {t({ fr: 'Photo du reçu (facultatif)', ht: 'Foto resi a (si w vle)' })}
        </Button>
      )}

      <Button
        variant="accent"
        size="lg"
        block
        loading={submitting}
        confirmed={confirmed}
        loadingLabel={t({ fr: 'Enregistrement…', ht: 'N ap anrejistre…' })}
        onClick={submit}
      >
        {t({ fr: 'Noter la dépense', ht: 'Note depans lan' })}
      </Button>
    </div>
  );
}
