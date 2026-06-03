'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { InvoiceModal } from './InvoiceModal';

// ── Types ──────────────────────────────────────────────────────────────────────

type SaleRow = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  total_amount: number;
  discount_percent: number;
  payment_method: string;
  payment_status: string;
  currency: string;
  created_at: string;
  items: Array<{ product_name: string; quantity: number }>;
};

type InvoiceGroup = {
  invoice_number: string;
  customer_name: string | null;
  payment_method: string;
  payment_status: string;
  currency: string;
  created_at: string;
  total: number;
  items: Array<{ product_name: string; quantity: number }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtAmount(n: number, currency = 'HTG') {
  return (
    new Intl.NumberFormat('fr-HT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) +
    ' ' +
    currency
  );
}

const METHOD_BADGE: Record<string, string> = {
  Cash:    'bg-emerald-100 text-emerald-700',
  MonCash: 'bg-pink-100 text-pink-700',
  Natcash: 'bg-purple-100 text-purple-700',
  Card:    'bg-blue-100 text-blue-700',
};

function PaymentBadge({ method, status }: { method: string; status?: string }) {
  if (status === 'credit' || status === 'À Crédit') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        ⏳ Crédit
      </span>
    );
  }
  const label: Record<string, string> = {
    Cash: 'Espèces', MonCash: 'MonCash', Natcash: 'NatCash', Card: 'Visa', Crédit: 'Crédit',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${METHOD_BADGE[method] ?? 'bg-slate-100 text-slate-600'}`}>
      {label[method] ?? method}
    </span>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-3 w-full rounded bg-slate-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SalesHistoryTable({ refreshKey }: { refreshKey?: number }) {
  const [sales, setSales]   = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeInvoice, setActiveInvoice] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // 1. Fetch sales (no join to products — they're in sale_items)
        const { data: salesData, error: sErr } = await supabase
          .from('sales')
          .select(`
            id,
            invoice_number,
            customer_name,
            total_amount,
            discount_percent,
            payment_method,
            payment_status,
            currency,
            created_at
          `)
          .order('created_at', { ascending: false })
          .limit(100);

        if (sErr) throw sErr;

        if (!salesData?.length) { setSales([]); setLoading(false); return; }

        // 2. Fetch sale_items for those sales
        const saleIds = salesData.map((s: any) => s.id);
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('sale_id, product_name, quantity')
          .in('sale_id', saleIds);

        // 3. Build items map
        const itemsMap: Record<string, Array<{ product_name: string; quantity: number }>> = {};
        for (const item of itemsData ?? []) {
          if (!itemsMap[item.sale_id]) itemsMap[item.sale_id] = [];
          itemsMap[item.sale_id].push({ product_name: item.product_name, quantity: item.quantity });
        }

        // 4. Merge
        setSales(
          salesData.map((r: any) => ({
            id:               r.id,
            invoice_number:   r.invoice_number ?? r.id,
            customer_name:    r.customer_name ?? null,
            total_amount:     Number(r.total_amount),
            discount_percent: Number(r.discount_percent ?? 0),
            payment_method:   r.payment_method ?? '—',
            payment_status:   r.payment_status ?? 'Payé',
            currency:         r.currency ?? 'HTG',
            created_at:       r.created_at,
            items:            itemsMap[r.id] ?? [],
          }))
        );
      } catch (e: any) {
        console.error('[SalesHistoryTable]', e?.message ?? e);
        setSales([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  // Group rows by invoice_number
  const groups = useMemo<InvoiceGroup[]>(() => {
    const map = new Map<string, InvoiceGroup>();
    for (const s of sales) {
      if (!map.has(s.invoice_number)) {
        map.set(s.invoice_number, {
          invoice_number: s.invoice_number,
          customer_name:  s.customer_name,
          payment_method: s.payment_method,
          payment_status: s.payment_status,
          currency:       s.currency,
          created_at:     s.created_at,
          total:          s.total_amount,
          items:          s.items,
        });
      }
    }
    return Array.from(map.values());
  }, [sales]);

  return (
    <>
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[#212529]">Istorik Vant yo</h2>
            <p className="mt-1 text-sm text-[#212529]/60">
              {loading ? 'Ap chaje…' : `${groups.length} fakti`}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3">Fakti #</th>
                <th className="px-3 py-3">Pwodui</th>
                <th className="px-3 py-3">Kliyan</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3">Peman</th>
                <th className="px-3 py-3">Dat</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows />
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-[#212529]/40">
                    Pa gen vant ankò.
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr key={g.invoice_number} className="transition hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <span className="font-mono text-[10px] text-slate-400">
                        {g.invoice_number.length > 16 ? g.invoice_number.slice(0, 14) + '…' : g.invoice_number}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[200px] space-y-0.5">
                        {g.items.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <>
                            {g.items.slice(0, 2).map((item, i) => (
                              <p key={i} className="truncate font-medium text-[#212529]">
                                {item.product_name}
                                <span className="ml-1 text-slate-400">×{item.quantity}</span>
                              </p>
                            ))}
                            {g.items.length > 2 && (
                              <p className="text-[10px] text-slate-400">+{g.items.length - 2} lòt</p>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {g.customer_name ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-[#212529]">
                      {fmtAmount(g.total, g.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <PaymentBadge method={g.payment_method} status={g.payment_status} />
                    </td>
                    <td className="px-3 py-3 text-slate-400">
                      {new Date(g.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setActiveInvoice(g.invoice_number)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-100"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Fakti
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeInvoice && (
        <InvoiceModal invoiceNumber={activeInvoice} onClose={() => setActiveInvoice(null)} />
      )}
    </>
  );
}
