'use client';

import { useLanguage } from './LanguageWrapper';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { InvoiceModal } from './InvoiceModal';
import { csvFilename, downloadCsv, toCsv } from '../lib/documents/csv';

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

/** Taille d'une tranche : l'historique se charge par paquets, à la demande. */
const PAGE_SIZE = 100;

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

/**
 * Une tranche de ventes avec leurs lignes, les plus récentes d'abord.
 *
 * Pagination par curseur (`before` = date de la dernière vente chargée) plutôt
 * que par décalage : une vente enregistrée entre deux « Charger plus » décalerait
 * les rangs et ferait réapparaître une facture déjà affichée.
 */
async function fetchSalesPage(before?: string): Promise<SaleRow[]> {
  // 1. Fetch sales (no join to products — they're in sale_items)
  let query = supabase
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
    .limit(PAGE_SIZE);
  if (before) query = query.lt('created_at', before);

  const { data: salesData, error: sErr } = await query;
  if (sErr) throw sErr;
  if (!salesData?.length) return [];

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
  return salesData.map((r: any) => ({
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
  }));
}

const METHOD_BADGE: Record<string, string> = {
  Cash:    'bg-emerald-100 text-emerald-700',
  MonCash: 'bg-pink-100 text-pink-700',
  Natcash: 'bg-purple-100 text-purple-700',
  Card:    'bg-blue-100 text-blue-700',
};

function PaymentBadge({ method, status }: { method: string; status?: string }) {
  const { t } = useLanguage();
  if (status === 'credit' || status === 'À Crédit') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-note font-semibold text-amber-700">
        ⏳ {t({ fr: 'Crédit', ht: 'Kredi' })}
      </span>
    );
  }
  const label: Record<string, { fr: string; ht: string }> = {
    Cash: { fr: 'Espèces', ht: 'Kach' }, MonCash: { fr: 'MonCash', ht: 'MonCash' }, Natcash: { fr: 'NatCash', ht: 'NatCash' }, Card: { fr: 'Visa', ht: 'Visa' },
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-note font-semibold ${METHOD_BADGE[method] ?? 'bg-slate-100 text-slate-600'}`}>
      {label[method] ? t(label[method]) : method}
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [activeInvoice, setActiveInvoice] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const rows = await fetchSalesPage();
        setSales(rows);
        setHasMore(rows.length === PAGE_SIZE);
      } catch (e: any) {
        console.error('[SalesHistoryTable]', e?.message ?? e);
        setSales([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  async function loadMore() {
    const last = sales[sales.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await fetchSalesPage(last.created_at);
      setSales((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e: any) {
      console.error('[SalesHistoryTable] loadMore', e?.message ?? e);
    } finally {
      setLoadingMore(false);
    }
  }

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

  // La recherche porte sur ce qui est chargé : « Charger plus » élargit le champ.
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      g.invoice_number.toLowerCase().includes(q) ||
      (g.customer_name ?? '').toLowerCase().includes(q));
  }, [groups, search]);

  // Exporte les factures chargées et affichées (recherche comprise).
  function exportCsv() {
    const csv = toCsv(visibleGroups, [
      { header: t({ fr: 'Facture', ht: 'Fakti' }),          value: (g) => g.invoice_number },
      { header: t({ fr: 'Date', ht: 'Dat' }),               value: (g) => new Date(g.created_at).toLocaleDateString('fr-FR') },
      { header: t({ fr: 'Client', ht: 'Kliyan' }),          value: (g) => g.customer_name ?? '' },
      { header: t({ fr: 'Produits', ht: 'Pwodui' }),        value: (g) => g.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ') },
      { header: 'Total',                                    value: (g) => g.total },
      { header: t({ fr: 'Devise', ht: 'Deviz' }),           value: (g) => g.currency },
      { header: t({ fr: 'Paiement', ht: 'Peman' }),         value: (g) => g.payment_method },
      { header: t({ fr: 'Statut', ht: 'Estati' }),          value: (g) => g.payment_status },
    ]);
    downloadCsv(csv, csvFilename('ventes'));
  }

  return (
    <>
      <div className="rounded-surface border border-slate-200 bg-white p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-anthracite">Istorik Vant yo</h2>
            <p className="mt-1 text-sm text-anthracite/60">
              {loading
                ? t({ fr: 'Chargement…', ht: 'Ap chaje…' })
                // Tant qu'il reste des ventes à charger, le compte n'est pas un total.
                : search.trim()
                  ? t({ fr: `${visibleGroups.length} sur ${groups.length} factures chargées`, ht: `${visibleGroups.length} sou ${groups.length} fakti chaje` })
                  : hasMore
                    ? t({ fr: `${groups.length} factures chargées`, ht: `${groups.length} fakti chaje` })
                    : `${groups.length} fakti`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t({ fr: 'Client ou n° de facture…', ht: 'Kliyan oswa nimewo fakti…' })}
              className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={loading || visibleGroups.length === 0}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {t({ fr: 'Exporter (CSV)', ht: 'Ekspòte (CSV)' })}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-note uppercase tracking-wider text-slate-500">
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
                  <td colSpan={7} className="py-12 text-center text-sm text-anthracite/40">
                    Pa gen vant ankò.
                  </td>
                </tr>
              ) : visibleGroups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-anthracite/40">
                    {hasMore
                      ? t({ fr: `Aucune facture chargée ne correspond à « ${search.trim()} ». Chargez plus de ventes pour chercher plus loin.`, ht: `Okenn fakti ki chaje pa koresponn ak « ${search.trim()} ». Chaje plis vant pou chèche pi lwen.` })
                      : t({ fr: `Aucune facture ne correspond à « ${search.trim()} ».`, ht: `Okenn fakti pa koresponn ak « ${search.trim()} ».` })}
                  </td>
                </tr>
              ) : (
                visibleGroups.map((g) => (
                  <tr key={g.invoice_number} className="transition hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <span className="font-mono text-note text-slate-400">
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
                              <p key={i} className="truncate font-medium text-anthracite">
                                {item.product_name}
                                <span className="ml-1 text-slate-400">×{item.quantity}</span>
                              </p>
                            ))}
                            {g.items.length > 2 && (
                              <p className="text-note text-slate-400">+{g.items.length - 2} lòt</p>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {g.customer_name ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-anthracite">
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
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-note font-semibold text-blue-600 transition hover:bg-blue-100"
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

        {!loading && hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingMore
                ? t({ fr: 'Chargement…', ht: 'Ap chaje…' })
                : t({ fr: 'Charger plus', ht: 'Chaje plis' })}
            </button>
          </div>
        )}
      </div>

      {activeInvoice && (
        <InvoiceModal invoiceNumber={activeInvoice} onClose={() => setActiveInvoice(null)} />
      )}
    </>
  );
}
