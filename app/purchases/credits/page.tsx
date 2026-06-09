'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../lib/utils';
import { useLanguage } from '../../../components/LanguageWrapper';
import { Button } from '../../../components/Button';

type CreditPurchase = {
  id: string;
  supplier_name: string;
  product_name: string;
  quantity: number;
  total_purchase_amount: number;
  purchase_date: string;
};

export default function CreditPurchasesPage() {
  const { t } = useLanguage();
  const [credits, setCredits] = useState<CreditPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCredits() {
      const [purchasesResponse, suppliersResponse, productsResponse] = await Promise.all([
        supabase
          .from('purchases')
          .select('id,supplier_id,product_id,quantity,total_purchase_amount,purchase_date')
          .eq('payment_status', 'À Crédit')
          .order('purchase_date', { ascending: false }),
        supabase.from('suppliers').select('id,name'),
        supabase.from('products').select('id,name'),
      ]);

      const purchaseData = purchasesResponse.data ?? [];
      const suppliersData = suppliersResponse.data ?? [];
      const productsData = productsResponse.data ?? [];

      const supplierMap = new Map(suppliersData.map((supplier: any) => [supplier.id, supplier.name]));
      const productMap = new Map(productsData.map((product: any) => [product.id, product.name]));

      if (purchasesResponse.error) {
        console.error('[CreditPurchasesPage] erreur', purchasesResponse.error.message);
        setCredits([]);
      } else {
        setCredits(
          purchaseData.map((item: any) => ({
            id: item.id,
            supplier_name: supplierMap.get(item.supplier_id) ?? '—',
            product_name: productMap.get(item.product_id) ?? '—',
            quantity: Number(item.quantity),
            total_purchase_amount: Number(item.total_purchase_amount),
            purchase_date: item.purchase_date,
          }))
        );
      }

      setLoading(false);
    }

    loadCredits();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-primary/90">{t({ fr: 'Achats à crédit', ht: 'Acha a kredi' })}</p>
            <h1 className="text-3xl font-semibold text-anthracite">{t({ fr: 'Transactions en attente', ht: 'Tranzaksyon annatant' })}</h1>
            <p className="mt-2 max-w-2xl text-sm text-anthracite/70">Les achats marqués «À Crédit» sont visibles ici sans impacter immédiatement le cash-flow.</p>
          </div>
          <Button type="button" onClick={() => window.history.back()}>
            {t({ fr: 'Retour', ht: 'Retounen' })}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="py-10 text-center text-anthracite/70">{t({ fr: 'Chargement des achats à crédit…', ht: 'Chajman acha a kredi…' })}</p>
        ) : credits.length === 0 ? (
          <p className="py-10 text-center text-anthracite/70">{t({ fr: 'Aucun achat à crédit trouvé.', ht: 'Pa gen acha a kredi jwenn.' })}</p>
        ) : (
          <table className="min-w-full border-collapse text-left text-sm text-anthracite">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3">{t({ fr: 'Fournisseur', ht: 'Founisè' })}</th>
                <th className="px-4 py-3">{t({ fr: 'Produit', ht: 'Pwodui' })}</th>
                <th className="px-4 py-3">{t({ fr: 'Quantité', ht: 'Kantite' })}</th>
                <th className="px-4 py-3">{t({ fr: 'Montant', ht: 'Montan' })}</th>
                <th className="px-4 py-3">{t({ fr: 'Date', ht: 'Dat' })}</th>
              </tr>
            </thead>
            <tbody>
              {credits.map((credit) => (
                <tr key={credit.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-4 font-medium text-anthracite">{credit.supplier_name}</td>
                  <td className="px-4 py-4 text-anthracite/90">{credit.product_name}</td>
                  <td className="px-4 py-4 text-anthracite/90">{credit.quantity}</td>
                  <td className="px-4 py-4 text-anthracite font-semibold">{formatCurrency(credit.total_purchase_amount)}</td>
                  <td className="px-4 py-4 text-anthracite/70">{new Date(credit.purchase_date).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
