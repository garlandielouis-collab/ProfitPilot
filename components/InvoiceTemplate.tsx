'use client';

import { useLanguage } from './LanguageWrapper';

type InvoiceLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
};

export type InvoiceTemplateProps = {
  invoiceNumber: string;
  date: Date;
  items: InvoiceLineItem[];
  clientName: string;
  totalAmount: number;
};

function formatCurrency(value: number) {
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} HTG`;
}

export function InvoiceTemplate({
  invoiceNumber,
  date,
  items,
  clientName,
  totalAmount,
}: InvoiceTemplateProps) {
  const { t } = useLanguage();

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const totalDiscount = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity * ((item.discount || 0) / 100)), 0);
  const total = Math.max(0, subtotal - totalDiscount);

  return (
    <div className="w-full max-w-2xl bg-white p-8 text-anthracite print:bg-white print:p-0">
      {/* Header */}
      <div className="border-b-2 border-primary pb-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white font-bold">
              PP
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">ProfitPilot</h1>
              <p className="text-sm text-anthracite/70">{t({ fr: 'Facture', ht: 'Fakti' })}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-anthracite/80">
              {t({ fr: 'N° Facture', ht: 'No Fakti' })}: <span className="font-bold text-primary">{invoiceNumber}</span>
            </p>
            <p className="text-sm text-anthracite/70">
              {t({ fr: 'Date', ht: 'Dat' })}: {date.toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
      </div>

      {/* Client Info */}
      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-primary/80">
            {t({ fr: 'Client', ht: 'Kliyant' })}
          </p>
          <p className="mt-2 font-semibold text-anthracite">{clientName}</p>
          <p className="mt-1 text-sm text-anthracite/70">ProfitPilot Inc.</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.12em] text-primary/80">
            {t({ fr: 'Date d\'émission', ht: 'Dat Emisyon' })}
          </p>
          <p className="mt-2 font-semibold text-anthracite">{date.toLocaleDateString('fr-FR')}</p>
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary">
              <th className="px-3 py-3 text-left font-semibold text-primary">
                {t({ fr: 'Description', ht: 'Deskripsyon' })}
              </th>
              <th className="px-3 py-3 text-center font-semibold text-primary">
                {t({ fr: 'Quantité', ht: 'Kantite' })}
              </th>
              <th className="px-3 py-3 text-right font-semibold text-primary">
                {t({ fr: 'P.U.', ht: 'P.U.' })}
              </th>
              <th className="px-3 py-3 text-right font-semibold text-primary">
                {t({ fr: 'Total', ht: 'Total' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const lineTotal = item.quantity * item.unitPrice;
              const discountAmount = lineTotal * ((item.discount || 0) / 100);
              const finalTotal = lineTotal - discountAmount;

              return (
                <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="px-3 py-3 text-anthracite">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.discount ? (
                        <p className="text-xs text-danger">
                          {t({ fr: 'Remise', ht: 'Remiz' })}: -{item.discount}%
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-anthracite">{item.quantity}</td>
                  <td className="px-3 py-3 text-right text-anthracite">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-anthracite">
                    {formatCurrency(finalTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="mb-8 flex justify-end">
        <div className="w-full max-w-sm space-y-2">
          <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
            <span className="text-anthracite/80">{t({ fr: 'Sous-total', ht: 'Sou-total' })}</span>
            <span className="font-semibold text-anthracite">{formatCurrency(subtotal)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between rounded-2xl bg-success/10 px-4 py-2">
              <span className="text-success">{t({ fr: 'Remises', ht: 'Remiz yo' })}</span>
              <span className="font-semibold text-success">- {formatCurrency(totalDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between rounded-2xl border-2 border-primary bg-primary/5 px-4 py-3">
            <span className="font-bold text-primary">{t({ fr: 'Total TTC', ht: 'Total TTC' })}</span>
            <span className="text-2xl font-bold text-primary">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 pt-6 text-center text-xs text-anthracite/60">
        <p>{t({ fr: 'Merci pour votre achat !', ht: 'Mèsi pou acha ou a !' })}</p>
        <p className="mt-2">ProfitPilot © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
