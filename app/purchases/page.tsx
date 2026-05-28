'use client';

import Link from 'next/link';
import { NewPurchaseForm } from '../../components/NewPurchaseForm';
import { useLanguage } from '../../components/LanguageWrapper';

export default function PurchasesPage() {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-primary/90">{t({ fr: 'Achats', ht: 'Acha' })}</p>
            <h1 className="text-2xl font-semibold text-anthracite md:text-3xl">{t({ fr: 'Créer un nouvel achat', ht: 'Kreye yon nouvo acha' })}</h1>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="rounded-3xl bg-slate-50 px-4 py-3 text-sm text-anthracite/80">
              {t({ fr: 'Les achats à crédit sont visibles dans une vue dédiée sans impacter immédiatement le cash-flow.', ht: 'Acha ak kredi parèt nan yon vi espesyal san yo pa afekte lajan kach imedyatman.' })}
            </div>
            <Link href="/purchases/credits" className="inline-flex rounded-3xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0047a1]">
              {t({ fr: 'Voir les achats à crédit', ht: 'Wè acha ak kredi' })}
            </Link>
          </div>
        </div>
      </div>

      <NewPurchaseForm />
    </div>
  );
}
