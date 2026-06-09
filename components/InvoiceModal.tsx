'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from './LanguageWrapper';
import { getInvoiceDetails, type InvoiceData } from '../app/actions/invoice';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmt(n: number, currency = 'HTG') {
  return new Intl.NumberFormat('fr-HT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + ' ' + currency;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function whatsappLink(invoice: InvoiceData, businessName: string): string {
  const lines = [
    `*Fakti ${invoice.invoice_number}*`,
    `Dat: ${fmtDate(invoice.date)}`,
    `Kliyan: ${invoice.client_name ?? 'Kliyan Anonim'}`,
    '',
    ...invoice.items.map(i => `• ${i.product_name} ×${i.quantity} = ${fmtAmt(i.line_total, invoice.currency)}`),
    '',
    invoice.discount_amount > 0 ? `Rabè: -${fmtAmt(invoice.discount_amount, invoice.currency)}` : '',
    `*TOTAL: ${fmtAmt(invoice.total, invoice.currency)}*`,
    `Peman: ${invoice.payment_method}`,
    '',
    `Mèsi pou w fè konfyans ak ${businessName} 🙏`,
  ].filter(l => l !== null);

  return `https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join('\n'))}`;
}

function mailtoLink(invoice: InvoiceData, businessName: string): string {
  const subject = `Fakti ${invoice.invoice_number} — ${businessName}`;
  const body = [
    `Bonjou ${invoice.client_name ?? ''},`,
    '',
    `Tanpri jwenn fakti ou a:`,
    `Fakti #: ${invoice.invoice_number}`,
    `Dat: ${fmtDate(invoice.date)}`,
    '',
    ...invoice.items.map(i => `${i.product_name}  ×${i.quantity}  ${fmtAmt(i.line_total, invoice.currency)}`),
    '',
    invoice.discount_amount > 0 ? `Rabè: -${fmtAmt(invoice.discount_amount, invoice.currency)}` : '',
    `TOTAL: ${fmtAmt(invoice.total, invoice.currency)}`,
    `Metòd Peman: ${invoice.payment_method}`,
    `Estati: ${invoice.payment_status}`,
    '',
    `Mèsi pou konfyans ou — ${businessName}`,
  ].filter(Boolean).join('\n');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── Print styles injected at runtime ─────────────────────────────────────────

const PRINT_CSS = `
@media print {
  body > *:not(#pp-invoice-print) { display: none !important; }
  #pp-invoice-print { display: block !important; position: fixed; inset: 0; background: white; padding: 40px; z-index: 99999; }
  .no-print { display: none !important; }
}
`;

// ── Skeleton ──────────────────────────────────────────────────────────────────

function InvoiceSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 w-1/2 bg-slate-100 rounded-lg" />
      <div className="h-4 w-1/3 bg-slate-100 rounded-lg" />
      <div className="mt-6 space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-lg" />
        ))}
      </div>
      <div className="h-12 bg-slate-200 rounded-xl" />
    </div>
  );
}

// ── InvoicePrintView (the actual printable content) ───────────────────────────

function InvoicePrintView({ invoice, businessName }: { invoice: InvoiceData; businessName: string }) {
  const { t } = useLanguage();
  return (
    <div id="pp-invoice-print" className="bg-white text-[#212529]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0056b3] tracking-tight">{businessName}</h1>
          <p className="mt-1 text-xs text-slate-400 uppercase tracking-widest">{t({ fr: 'Facture Officielle', ht: 'Fakti Ofisyèl' })}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-wider">{t({ fr: 'Facture N°', ht: 'Fakti #' })}</p>
          <p className="font-bold text-[#212529] font-mono">{invoice.invoice_number}</p>
          <p className="mt-1 text-xs text-slate-500">{fmtDate(invoice.date)}</p>
        </div>
      </div>

      {/* Client info */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-slate-400 mb-1">{t({ fr: 'Facturé à', ht: 'Faktire pou' })}</p>
        <p className="font-semibold text-[#212529] text-lg">{invoice.client_name ?? t({ fr: 'Client Anonyme', ht: 'Kliyan Anonim' })}</p>
      </div>

      {/* Items table */}
      <table className="w-full text-sm mb-6 border-collapse">
        <thead>
          <tr className="bg-[#0056b3] text-white">
            <th className="px-3 py-2.5 text-left font-semibold rounded-tl-lg">{t({ fr: 'Produit', ht: 'Pwodui' })}</th>
            <th className="px-3 py-2.5 text-right font-semibold">{t({ fr: 'Qté', ht: 'Kte' })}</th>
            <th className="px-3 py-2.5 text-right font-semibold">{t({ fr: 'Prix Unitaire', ht: 'Pri Inite' })}</th>
            <th className="px-3 py-2.5 text-right font-semibold">{t({ fr: 'Remise', ht: 'Rabe' })}</th>
            <th className="px-3 py-2.5 text-right font-semibold rounded-tr-lg">{t({ fr: 'Total', ht: 'Total' })}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-3 py-2.5 font-medium text-[#212529] border-b border-slate-100">{item.product_name}</td>
              <td className="px-3 py-2.5 text-right text-slate-600 border-b border-slate-100">{item.quantity}</td>
              <td className="px-3 py-2.5 text-right text-slate-600 border-b border-slate-100">{fmtAmt(item.unit_price, invoice.currency)}</td>
              <td className="px-3 py-2.5 text-right text-red-500 border-b border-slate-100">
                {item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-[#212529] border-b border-slate-100">{fmtAmt(item.line_total, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-2">
          <div className="flex justify-between text-sm text-slate-500">
            <span>{t({ fr: 'Sous-total', ht: 'Sou-total' })}</span>
            <span>{fmtAmt(invoice.subtotal, invoice.currency)}</span>
          </div>
          {invoice.discount_amount > 0 && (
            <div className="flex justify-between text-sm text-red-500">
              <span>{t({ fr: 'Remise totale', ht: 'Rabe total' })}</span>
              <span>−{fmtAmt(invoice.discount_amount, invoice.currency)}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t-2 border-[#0056b3] pt-2">
            <span className="font-extrabold text-lg text-[#212529]">{t({ fr: 'TOTAL', ht: 'TOTAL' })}</span>
            <span className="font-extrabold text-2xl text-[#0056b3]">{fmtAmt(invoice.total, invoice.currency)}</span>
          </div>
        </div>
      </div>

      {/* Payment info */}
      <div className="mt-6 flex gap-4 text-xs text-slate-500">
        <span>{t({ fr: 'Méthode de paiement:', ht: 'Metòd Peman:' })} <strong className="text-[#212529]">{invoice.payment_method}</strong></span>
        <span>·</span>
        <span>{t({ fr: 'Statut:', ht: 'Estati:' })} <strong className={invoice.payment_status === 'paid' || invoice.payment_status === 'Payé' ? 'text-emerald-600' : 'text-amber-600'}>
          {invoice.payment_status === 'paid' ? t({ fr: 'Payé', ht: 'Peye' }) : invoice.payment_status === 'credit' ? t({ fr: 'À Crédit', ht: 'À Kredi' }) : invoice.payment_status}
        </strong></span>
      </div>

      {/* Footer */}
      <div className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        {t({ fr: 'Ce document a été généré par', ht: 'Dokiman sa a jenere pa' })} <strong>{businessName}</strong> via ProfitPilot · {new Date().toLocaleDateString('fr-FR')}
      </div>
    </div>
  );
}

// ── InvoiceModal ──────────────────────────────────────────────────────────────

interface InvoiceModalProps {
  invoiceNumber: string;
  onClose: () => void;
}

export function InvoiceModal({ invoiceNumber, onClose }: InvoiceModalProps) {
  const [invoice, setInvoice]   = useState<InvoiceData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState('');
  const printStyleRef           = useRef<HTMLStyleElement | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    getInvoiceDetails(invoiceNumber).then(data => {
      if (data) setInvoice(data); else setError(t({ fr: 'Facture introuvable.', ht: 'Fakti pa jwenn.' }));
      setLoading(false);
    }).catch(() => { setError(t({ fr: 'Erreur de chargement.', ht: 'Erè chajman.' })); setLoading(false); });
  }, [invoiceNumber]);

  const businessName = invoice?.business_name ?? t({ fr: 'Mon Entreprise', ht: 'Mon Entreprise' });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function handlePrint() {
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    printStyleRef.current = style;
    window.print();
    setTimeout(() => {
      if (printStyleRef.current) {
        document.head.removeChild(printStyleRef.current);
        printStyleRef.current = null;
      }
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[92vh]">

        {/* Modal header */}
        <div className="no-print flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="font-bold text-[#212529]">{t({ fr: 'Facture Officielle', ht: 'Fakti Ofisyèl' })}</h2>
            {invoice && <p className="text-xs text-slate-400 mt-0.5 font-mono">{invoice.invoice_number}</p>}
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading && <InvoiceSkeleton />}
          {error   && <p className="py-10 text-center text-sm text-red-500">{error}</p>}
          {invoice && <InvoicePrintView invoice={invoice} businessName={businessName} />}
        </div>

        {/* Actions footer */}
        {invoice && (
          <div className="no-print border-t border-slate-100 px-6 py-4 flex flex-wrap gap-2 justify-between items-center shrink-0">
            <div className="flex gap-2">
              {/* Print */}
              <button onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056b3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0047a1] transition">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                </svg>
                {t({ fr: 'Imprimer', ht: 'Enprime' })}
              </button>

              {/* WhatsApp */}
              <a href={whatsappLink(invoice, businessName)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1fbd5a] transition">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {t({ fr: 'WhatsApp', ht: 'WhatsApp' })}
              </a>

              {/* Email */}
              <a href={mailtoLink(invoice, businessName)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#212529] hover:bg-slate-50 transition">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
                {t({ fr: 'Email', ht: 'Imèl' })}
              </a>
            </div>

            <button onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 transition">
              {t({ fr: 'Fermer', ht: 'Fèmen' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
