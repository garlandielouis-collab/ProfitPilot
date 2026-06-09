'use client';

import { useRef } from 'react';
import { useLanguage } from './LanguageWrapper';
import { X, Printer } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InvoiceItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
};

export type InvoiceData = {
  invoiceNumber: string;
  date: Date;
  clientName?: string;
  items: InvoiceItem[];
  discountPercent: number;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string;
  isCredit: boolean;
  currency: 'HTG' | 'USD';
};

type Props = {
  data: InvoiceData;
  onClose: () => void;
  businessName?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, currency: 'HTG' | 'USD') {
  return currency === 'HTG'
    ? `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} HTG`
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SaleInvoiceModal({ data, onClose, businessName: rawBusinessName = 'Mon Entreprise' }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const businessName = rawBusinessName === 'Mon Entreprise' ? t({ fr: 'Mon Entreprise', ht: 'Mon Entreprise' }) : rawBusinessName;

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;

    const win = window.open('', '_blank', 'width=820,height=700');
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Facture ${data.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .logo { font-size: 22px; font-weight: 800; color: #0056b3; }
    .logo span { color: #6c63ff; }
    .inv-meta { text-align: right; }
    .inv-meta h2 { font-size: 28px; font-weight: 700; color: #0056b3; }
    .inv-meta p { font-size: 13px; color: #555; margin-top: 4px; }
    .divider { border: none; border-top: 2px solid #e2e8f0; margin: 24px 0; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
    .party h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #888; margin-bottom: 8px; }
    .party p { font-size: 14px; color: #1a1a2e; }
    .party .name { font-size: 16px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f0f4ff; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #0056b3; }
    td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid #eef2ff; }
    tr:last-child td { border-bottom: none; }
    .text-right { text-align: right; }
    .totals { margin-left: auto; width: 280px; }
    .totals table { margin: 0; }
    .totals td { padding: 6px 14px; font-size: 13px; border: none; }
    .totals .total-row td { font-size: 16px; font-weight: 800; color: #0056b3; padding-top: 12px; border-top: 2px solid #0056b3; }
    .discount-row { color: #e53e3e; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge-credit { background: #fff3cd; color: #b45309; }
    .badge-paid { background: #d1fae5; color: #065f46; }
    .footer { margin-top: 48px; text-align: center; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  ${el.innerHTML}
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`);
    win.document.close();
  };

  const { invoiceNumber, date, clientName, items, discountPercent, subtotal, discountAmount, totalAmount, paymentMethod, isCredit, currency } = data;
  const bizName = businessName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[28px] bg-white shadow-2xl">

        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[28px] border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1a1a2e]">{t({ fr: 'Facture', ht: 'Fakti' })}</h2>
            <p className="text-sm text-slate-500">{invoiceNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#0056b3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0047a1] active:scale-95"
            >
              <Printer size={15} />
              {t({ fr: 'Imprimer / PDF', ht: 'Enprime / PDF' })}
            </button>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 transition">
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Invoice content — this div is cloned into the print window */}
        <div ref={printRef} className="p-8">

          {/* Header */}
          <div className="header flex items-start justify-between">
            <div className="logo">
              <span className="text-[#0056b3] text-2xl font-extrabold">Profit</span>
              <span className="text-[#6c63ff] text-2xl font-extrabold">Pilot</span>
            </div>
            <div className="inv-meta text-right">
              <h2 className="text-2xl font-bold text-[#0056b3]">{t({ fr: 'FACTURE', ht: 'FAKTI' })}</h2>
              <p className="mt-1 text-sm text-slate-500">{invoiceNumber}</p>
              <p className="text-sm text-slate-500">
                {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          <hr className="my-6 border-slate-200" />

          {/* Parties */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400 mb-2">{t({ fr: 'Émetteur', ht: 'Emétè' })}</p>
              <p className="text-base font-bold text-[#1a1a2e]">{bizName}</p>
              <p className="text-sm text-slate-500">via ProfitPilot</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400 mb-2">{t({ fr: 'Facturé à', ht: 'Faktire a' })}</p>
              <p className="text-base font-bold text-[#1a1a2e]">{clientName || t({ fr: 'Client comptoir', ht: 'Kliyan kontwa' })}</p>
              <p className="text-sm text-slate-500">{t({ fr: 'Devise:', ht: 'Deviz:' })} {currency}</p>
            </div>
          </div>

          {/* Items table */}
          <table className="w-full border-collapse text-sm mb-6">
            <thead>
              <tr className="bg-[#f0f4ff]">
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-widest text-[#0056b3] font-semibold">{t({ fr: 'Produit', ht: 'Pwodui' })}</th>
                <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-widest text-[#0056b3] font-semibold">{t({ fr: 'Qté', ht: 'Kte' })}</th>
                <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-widest text-[#0056b3] font-semibold">{t({ fr: 'Prix unitaire', ht: 'Pri inite' })}</th>
                <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-widest text-[#0056b3] font-semibold">{t({ fr: 'Total', ht: 'Total' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2ff]">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-3 font-medium text-[#1a1a2e]">{item.product_name}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{item.quantity}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{fmt(item.unit_price, currency)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-[#1a1a2e]">{fmt(item.unit_price * item.quantity, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="ml-auto w-72">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1.5 text-slate-500">{t({ fr: 'Sous-total HT', ht: 'Sou-total HT' })}</td>
                  <td className="py-1.5 text-right font-medium text-[#1a1a2e]">{fmt(subtotal, currency)}</td>
                </tr>
                {discountPercent > 0 && (
                  <tr className="text-red-600">
                    <td className="py-1.5">{t({ fr: 'Remise', ht: 'Remiz' })} ({discountPercent}%)</td>
                    <td className="py-1.5 text-right font-medium">−{fmt(discountAmount, currency)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-[#0056b3]">
                  <td className="pt-3 pb-1 text-base font-bold text-[#0056b3]">{t({ fr: 'TOTAL', ht: 'TOTAL' })}</td>
                  <td className="pt-3 pb-1 text-right text-base font-extrabold text-[#0056b3]">{fmt(totalAmount, currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Payment badge */}
          <div className="mt-6 flex items-center gap-3">
            <p className="text-sm text-slate-500">{t({ fr: 'Mode de paiement:', ht: 'Mòd peman:' })}</p>
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${isCredit ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {isCredit ? `⏳ ${t({ fr: 'À Crédit', ht: 'À Kredi' })}` : `✓ ${paymentMethod}`}
            </span>
          </div>

          {/* Footer */}
          <div className="mt-10 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-400">
            {t({ fr: 'Merci pour votre confiance', ht: 'Mèsi pou konfyans ou' })} — {bizName} © {new Date().getFullYear()} · via ProfitPilot
          </div>
        </div>
      </div>
    </div>
  );
}
