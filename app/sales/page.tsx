'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, ShoppingCart, Users, Receipt,
  ArrowUpRight, ChevronDown, ChevronUp, Search,
  Calendar, CreditCard, DollarSign, Star,
} from 'lucide-react';

import { NewSaleForm }         from '../../components/NewSaleForm';
import { SalesHistoryTable }   from '../../components/SalesHistoryTable';
import { useLanguage }         from '../../components/LanguageWrapper';
import { ProtectedRoute }      from '../../components/ProtectedRoute';
import { cn }                  from '../../lib/utils';
import { getSalesMetrics, getSalesCRMData, type ClientSummary } from '../actions/sales';

// ── types ──────────────────────────────────────────────────────────────────────

type Metrics = {
  monthlyTotal:  number;
  allTimeTotal:  number;
  monthlyCount:  number;
  topClient:     string | null;
};

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'HTG') {
  return new Intl.NumberFormat('fr-HT', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n) + ' ' + currency;
}

function relDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KPI({
  icon: Icon, label, value, sub, accent,
}: { icon: React.ElementType; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className={cn(
      'flex items-center gap-4 rounded-2xl border p-5 shadow-sm',
      'border-slate-200 bg-white',
    )}>
      <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', accent)}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-[10px] text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

// ── CRM panel ─────────────────────────────────────────────────────────────────

function CRMPanel({ clients, loading }: { clients: ClientSummary[]; loading: boolean }) {
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#001F3F] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher un client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-800 outline-none focus:border-[#001F3F]/50 focus:ring-2 focus:ring-[#001F3F]/10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          {clients.length === 0
            ? 'Aucune vente avec client enregistrée pour l\'instant.'
            : `Aucun client trouvé pour "${search}".`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c, i) => {
            const isOpen = expanded === c.name;
            return (
              <div
                key={c.name}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : c.name)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition"
                >
                  {/* Rank badge */}
                  <div className={cn(
                    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold',
                    i === 0 ? 'bg-amber-100 text-amber-700' :
                    i === 1 ? 'bg-slate-200 text-slate-600' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-500',
                  )}>
                    {i < 3 ? <Star className="h-4 w-4" /> : `#${i + 1}`}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400">
                      {c.count} achat{c.count > 1 ? 's' : ''} · Dernier: {relDate(c.lastDate)}
                    </p>
                  </div>

                  <div className="text-right mr-3">
                    <p className="font-bold text-slate-800">{fmt(c.total)}</p>
                    <p className="text-xs text-slate-400">chiffre d'affaires</p>
                  </div>

                  {isOpen
                    ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      <div className="grid grid-cols-3 gap-3 px-5 py-4">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Total achats</p>
                          <p className="mt-1 font-bold text-slate-800">{fmt(c.total)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Panier moyen</p>
                          <p className="mt-1 font-bold text-slate-800">{fmt(c.total / c.count)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Méthodes</p>
                          <p className="mt-1 text-sm font-medium text-slate-700 truncate">
                            {[...new Set(c.methods)].join(', ') || '—'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE ROOT
// ═══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'pos',      label: 'Point de Vente',  icon: ShoppingCart },
  { id: 'history',  label: 'Historique',       icon: Receipt      },
  { id: 'crm',      label: 'CRM Clients',      icon: Users        },
] as const;
const TAB_LABELS: Record<string, { fr: string; ht: string }> = {
  pos:     { fr: 'Point de Vente', ht: 'Pwen Vant' },
  history: { fr: 'Historique',     ht: 'Istoryal' },
  crm:     { fr: 'CRM Clients',    ht: 'KRM Kliyan' },
};
type TabId = typeof TABS[number]['id'];

export default function SalesPage() {
  const { t } = useLanguage();
  const [activeTab,   setActiveTab]   = useState<TabId>('pos');
  const [historyKey,  setHistoryKey]  = useState(0);
  const [metrics,     setMetrics]     = useState<Metrics>({
    monthlyTotal: 0, allTimeTotal: 0, monthlyCount: 0, topClient: null,
  });
  const [clients,     setClients]     = useState<ClientSummary[]>([]);
  const [crmLoading,  setCrmLoading]  = useState(false);

  // ── Load metrics — with sessionStorage instant cache ──────────────────────
  const loadMetrics = useCallback(async () => {
    const CACHE = 'pp_sales_metrics';
    try {
      const raw = sessionStorage.getItem(CACHE);
      if (raw) setMetrics(JSON.parse(raw)); // show instantly from cache
    } catch { /* ignore */ }
    try {
      const data = await getSalesMetrics();
      setMetrics(data);
      try { sessionStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* full */ }
    } catch { /* silent */ }
  }, []);

  // ── Load CRM data ────────────────────────────────────────────────────────────
  const loadCRM = useCallback(async () => {
    setCrmLoading(true);
    try {
      const data = await getSalesCRMData();
      setClients(data);
    } catch { /* silent */ }
    setCrmLoading(false);
  }, []);

  useEffect(() => { loadMetrics(); }, [loadMetrics, historyKey]);
  useEffect(() => { if (activeTab === 'crm') loadCRM(); }, [activeTab, loadCRM, historyKey]);

  const handleSaleComplete = () => setHistoryKey((k) => k + 1);

  const now = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[var(--color-bg)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">

          {/* ── Header ───────────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-[#001F3F]/90">{t({ fr: 'Module', ht: 'Modil' })}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-800 md:text-3xl">
              {t({ fr: 'Ventes & CRM', ht: 'Vant & KRM' })}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t({ fr: 'Enregistrez des ventes, consultez l\'historique et analysez vos clients.', ht: 'Anrejistre vant, konsilte istorik la epi analize kliyan ou yo.' })}
            </p>
          </div>

          {/* ── KPIs ─────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPI
              icon={TrendingUp}
              label={t({ fr: 'Ventes ce mois', ht: 'Vant mwa sa a' })}
              value={fmt(metrics.monthlyTotal)}
              sub={now}
              accent="bg-blue-100 text-[#001F3F]"
            />
            <KPI
              icon={ShoppingCart}
              label={t({ fr: 'Ventes totales', ht: 'Vant total' })}
              value={fmt(metrics.allTimeTotal)}
              sub={t({ fr: 'Depuis le début', ht: 'Depi kòmansman' })}
              accent="bg-emerald-100 text-emerald-600"
            />
            <KPI
              icon={Receipt}
              label={t({ fr: 'Transactions / mois', ht: 'Tranzaksyon / mwa' })}
              value={String(metrics.monthlyCount)}
              sub={now}
              accent="bg-violet-100 text-violet-600"
            />
            <KPI
              icon={Star}
              label={t({ fr: 'Top client (mois)', ht: 'Pi bon kliyan (mwa)' })}
              value={metrics.topClient ?? '—'}
              sub={t({ fr: 'Par chiffre d\'affaires', ht: 'Pa chif afè' })}
              accent="bg-amber-100 text-amber-600"
            />
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    active
                      ? 'bg-[#001F3F] text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t(TAB_LABELS[id] ?? { fr: label, ht: label })}</span>
                </button>
              );
            })}
          </div>

          {/* ── Tab content ──────────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {activeTab === 'pos' && (
                <NewSaleForm onSaleComplete={handleSaleComplete} />
              )}

              {activeTab === 'history' && (
                <SalesHistoryTable refreshKey={historyKey} />
              )}

              {activeTab === 'crm' && (
                <CRMPanel clients={clients} loading={crmLoading} />
              )}
            </motion.div>
          </AnimatePresence>

        </div>
      </main>
    </ProtectedRoute>
  );
}
