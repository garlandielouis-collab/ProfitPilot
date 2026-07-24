'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { usePlan } from '../../hooks/usePlan';
import { useLanguage } from '../../components/LanguageWrapper';
import { getSalesAction } from '../actions/sales';
import { getExpenses } from '../actions/expenses';
import Link from 'next/link';

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtHTG = (n: number) =>
  new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0 }).format(Math.round(n)) + ' G';

const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// ── sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#001F3F] dark:border-slate-700 dark:border-t-[#50C878]" />
    </div>
  );
}

function UpgradeWall() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20 p-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-3xl">📊</div>
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text)]">{t({ fr: 'Analyses Avancées', ht: 'Analiz Avanse' })}</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--color-muted)]">
          {t({ fr: 'Disponible en plan Expert. Tendances, prévisions et insights détaillés sur votre activité.', ht: 'Disponib nan plan Expert. Tandans, previzyon ak analiz sou aktivite ou.' })}
        </p>
      </div>
      <Link href="/pricing" className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-purple-700 transition">
        {t({ fr: 'Passer Expert', ht: 'Pase Expert' })}
      </Link>
    </div>
  );
}

function KPICard({ label, value, sub, trend, icon }: { label: string; value: string; sub?: string; trend?: number; icon: string }) {
  const trendPos = trend !== undefined && trend >= 0;
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        {trend !== undefined && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trendPos ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
            {trendPos ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{value}</p>
        <p className="mt-0.5 text-xs font-medium text-[var(--color-muted)] uppercase tracking-widest">{label}</p>
        {sub && <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>}
      </div>
    </div>
  );
}

// SVG bar chart
function BarChart({ data }: { data: { label: string; revenue: number; expenses: number }[] }) {
  const max = Math.max(...data.flatMap(d => [d.revenue, d.expenses]), 1);
  const H = 120;
  const barW = 18;
  const gap = 8;
  const groupW = barW * 2 + gap + 16;
  const W = data.length * groupW + 20;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full min-w-[300px]" style={{ height: H + 30 }}>
        {/* grid lines */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={0} y1={H * (1 - f)} x2={W} y2={H * (1 - f)}
            stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const x = i * groupW + 10;
          const rh = (d.revenue / max) * H;
          const eh = (d.expenses / max) * H;
          return (
            <g key={d.label}>
              {/* revenue bar */}
              <rect x={x} y={H - rh} width={barW} height={rh} rx={3}
                fill="#50C878" fillOpacity="0.85" />
              {/* expense bar */}
              <rect x={x + barW + gap} y={H - eh} width={barW} height={eh} rx={3}
                fill="#F97316" fillOpacity="0.75" />
              {/* label */}
              <text x={x + barW + gap / 2} y={H + 16} textAnchor="middle"
                fontSize="9" fill="currentColor" opacity="0.5">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center gap-4 text-xs text-[var(--color-muted)]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#50C878]" /> Revenus</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-400" /> Dépenses</span>
      </div>
    </div>
  );
}

// Horizontal bar (for categories / rankings)
function HBar({ label, value, max, bgColor, fmtVal }: { label: string; value: number; max: number; bgColor: string; fmtVal: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate max-w-[60%] text-[var(--color-text)]">{label}</span>
        <span className="font-semibold text-[var(--color-text)]">{fmtVal}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: bgColor }} />
      </div>
    </div>
  );
}

// Heat map for days of week
function DayHeatmap({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex gap-2">
      {data.map((v, i) => {
        const intensity = v / max;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="h-10 w-full rounded-lg transition-colors"
              style={{ background: `rgba(80, 200, 120, ${0.1 + intensity * 0.85})` }}
              title={`${v} ventes`}
            />
            <span className="text-[0.6rem] text-[var(--color-muted)]">{DAYS_FR[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

// Donut chart SVG
function Donut({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 36, cx = 50, cy = 50, stroke = 14;
  const circ = 2 * Math.PI * R;
  let cumulative = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-24 w-24 flex-shrink-0 -rotate-90">
        {slices.map((s, i) => {
          const dash   = (s.value / total) * circ;
          const offset = circ - (cumulative / total) * circ;
          cumulative  += s.value;
          return (
            <circle key={i} cx={cx} cy={cy} r={R}
              fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {slices.map(s => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate text-[var(--color-text)]">{s.label}</span>
            <span className="ml-auto font-semibold text-[var(--color-muted)]">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

type SaleRow    = { total_amount: number; sale_date: string | null; created_at: string; payment_method?: string | null };
type ExpenseRow = { amount: number; expense_date?: string; created_at?: string; category?: string };

const CATEGORY_COLORS = ['#6366F1', '#F97316', '#EC4899', '#14B8A6', '#EAB308', '#8B5CF6'];

export default function AnalyticsPage() {
  const { t } = useLanguage();
  const plan = usePlan();
  const [sales, setSales]       = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [period, setPeriod]     = useState<3 | 6 | 12>(6);

  useEffect(() => {
    async function load() {
      try {
        const [s, e] = await Promise.all([getSalesAction(500), getExpenses()]);
        setSales((Array.isArray(s) ? s : []) as SaleRow[]);
        setExpenses((Array.isArray(e) ? e : []) as ExpenseRow[]);
      } catch { /* show empty state */ }
      setLoading(false);
    }
    load();
  }, []);

  const analytics = useMemo(() => {
    const now = new Date();

    // Build monthly buckets for last `period` months
    const buckets: Record<string, { revenue: number; expenses: number }> = {};
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = { revenue: 0, expenses: 0 };
    }

    for (const s of sales) {
      const m = (s.sale_date ?? s.created_at)?.slice(0, 7) ?? '';
      if (buckets[m]) buckets[m].revenue += Number(s.total_amount ?? 0);
    }
    for (const e of expenses) {
      const m = (e.expense_date ?? e.created_at ?? '')?.slice(0, 7);
      if (m && buckets[m]) buckets[m].expenses += Number(e.amount ?? 0);
    }

    const months = Object.entries(buckets).map(([ym, v]) => ({
      ym, label: monthLabel(ym), ...v, profit: v.revenue - v.expenses,
    }));

    // totals
    const totalRevenue  = months.reduce((s, m) => s + m.revenue,  0);
    const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
    const totalProfit   = totalRevenue - totalExpenses;
    const margin        = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // MoM trend (last 2 complete months)
    const last  = months[months.length - 1]?.revenue ?? 0;
    const prev  = months[months.length - 2]?.revenue ?? 0;
    const momTrend = prev > 0 ? ((last - prev) / prev) * 100 : 0;

    // Best month
    const bestMonth = [...months].sort((a, b) => b.revenue - a.revenue)[0];

    // Forecast next month: simple avg of last 3
    const last3 = months.slice(-3).map(m => m.revenue);
    const forecast = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;

    // Day of week heatmap
    const dayTotals = Array(7).fill(0);
    for (const s of sales) {
      const d = new Date(s.sale_date ?? s.created_at);
      if (!isNaN(d.getTime())) dayTotals[d.getDay()] += 1;
    }

    // Expense by category
    const catMap: Record<string, number> = {};
    for (const e of expenses) {
      const cat = e.category ?? 'Autre';
      catMap[cat] = (catMap[cat] ?? 0) + Number(e.amount ?? 0);
    }
    const categories = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

    // Payment methods
    const pmMap: Record<string, number> = {};
    for (const s of sales) {
      const pm = s.payment_method ?? 'Autre';
      pmMap[pm] = (pmMap[pm] ?? 0) + 1;
    }
    const payMethods = Object.entries(pmMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

    return { months, totalRevenue, totalExpenses, totalProfit, margin, momTrend, bestMonth, forecast, dayTotals, categories, payMethods };
  }, [sales, expenses, period]);

  const { months, totalRevenue, totalExpenses, totalProfit, margin, momTrend, bestMonth, forecast, dayTotals, categories, payMethods } = analytics;
  const maxCat = categories[0]?.value ?? 1;
  const maxPM  = payMethods[0]?.value ?? 1;

  if (plan.loading || loading) return <ProtectedRoute><Spinner /></ProtectedRoute>;

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">
              {t({ fr: 'Analyses Avancées', ht: 'Analiz Avanse' })}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {t({ fr: 'Vue complète sur la santé financière de votre business', ht: 'Vi konplè sou sante finansyè biznis ou' })}
            </p>
          </div>
          {/* Period selector */}
          <div className="flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 self-start">
            {([3, 6, 12] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${period === p ? 'bg-[#001F3F] text-white dark:bg-[#50C878] dark:text-[#001F3F]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
                {p}M
              </button>
            ))}
          </div>
        </div>

        {!plan.can('advanced_analytics') ? <UpgradeWall /> : (
          <>
            {/* KPI row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard icon="💰" label={t({ fr: 'Revenus totaux', ht: 'Revni total' })} value={fmtHTG(totalRevenue)} trend={momTrend} sub={t({ fr: `${period} derniers mois`, ht: `${period} dènye mwa` })} />
              <KPICard icon="📉" label={t({ fr: 'Dépenses totales', ht: 'Depans total' })} value={fmtHTG(totalExpenses)} />
              <KPICard icon="✨" label={t({ fr: 'Profit net', ht: 'Pwofi nèt' })} value={fmtHTG(totalProfit)} sub={`Marge ${margin.toFixed(1)}%`} trend={totalRevenue > 0 ? margin : undefined} />
              <KPICard icon="🔮" label={t({ fr: 'Prévision mois prochain', ht: 'Previzyon mwa pwochen' })} value={fmtHTG(forecast)} sub={t({ fr: 'Basé sur la tendance', ht: 'Base sou tandans' })} />
            </div>

            {/* Revenue vs Expenses chart */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">
                  {t({ fr: 'Revenus vs Dépenses', ht: 'Revni vs Depans' })}
                </h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${momTrend >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {t({ fr: 'Tendance', ht: 'Tandans' })} {fmtPct(momTrend)}
                </span>
              </div>
              {months.every(m => m.revenue === 0 && m.expenses === 0) ? (
                <p className="py-8 text-center text-sm text-[var(--color-muted)]">{t({ fr: 'Aucune donnée pour cette période', ht: 'Pa gen done pou peryòd sa a' })}</p>
              ) : (
                <BarChart data={months} />
              )}
            </div>

            {/* Middle row */}
            <div className="grid gap-4 lg:grid-cols-2">

              {/* Best day heatmap */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] p-6 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text)]">{t({ fr: 'Jours les plus actifs', ht: 'Jou ki pi aktif yo' })}</h2>
                  <p className="text-xs text-[var(--color-muted)]">{t({ fr: 'Nombre de ventes par jour de la semaine', ht: 'Kantite vant pa jou nan semèn' })}</p>
                </div>
                <DayHeatmap data={dayTotals} />
                {(() => {
                  const bestDay = dayTotals.indexOf(Math.max(...dayTotals));
                  return dayTotals[bestDay] > 0 ? (
                    <p className="text-xs text-[var(--color-muted)]">
                      🏆 {t({ fr: 'Meilleur jour :', ht: 'Meyè jou :' })} <strong className="text-[var(--color-text)]">{DAYS_FR[bestDay]}</strong>
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Best month insight */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] p-6 space-y-4">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">{t({ fr: 'Insights clés', ht: 'Insights kle' })}</h2>
                <div className="space-y-3">
                  {bestMonth && bestMonth.revenue > 0 && (
                    <div className="flex items-start gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3.5">
                      <span className="text-xl">🏆</span>
                      <div>
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t({ fr: 'Meilleur mois', ht: 'Meyè mwa' })}</p>
                        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{bestMonth.label} — {fmtHTG(bestMonth.revenue)}</p>
                      </div>
                    </div>
                  )}
                  <div className={`flex items-start gap-3 rounded-xl border p-3.5 ${totalProfit >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
                    <span className="text-xl">{totalProfit >= 0 ? '📈' : '⚠️'}</span>
                    <div>
                      <p className={`text-xs font-semibold ${totalProfit >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-orange-800 dark:text-orange-300'}`}>
                        {totalProfit >= 0 ? t({ fr: 'Rentabilité positive', ht: 'Wentabilite pozitif' }) : t({ fr: 'Attention aux dépenses', ht: 'Fè atansyon ak depans yo' })}
                      </p>
                      <p className={`text-sm font-bold ${totalProfit >= 0 ? 'text-blue-900 dark:text-blue-200' : 'text-orange-900 dark:text-orange-200'}`}>
                        {t({ fr: 'Marge nette', ht: 'Mach nèt' })} {margin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-3.5">
                    <span className="text-xl">🔮</span>
                    <div>
                      <p className="text-xs font-semibold text-purple-800 dark:text-purple-300">{t({ fr: 'Prévision mois prochain', ht: 'Previzyon mwa pwochen' })}</p>
                      <p className="text-sm font-bold text-purple-900 dark:text-purple-200">{fmtHTG(forecast)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row */}
            <div className="grid gap-4 lg:grid-cols-2">

              {/* Expense categories */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] p-6 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text)]">{t({ fr: 'Dépenses par catégorie', ht: 'Depans pa kategori' })}</h2>
                  <p className="text-xs text-[var(--color-muted)]">{t({ fr: 'Où va votre argent ?', ht: 'Kote kòb ou ale?' })}</p>
                </div>
                {categories.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">{t({ fr: 'Aucune dépense enregistrée', ht: 'Pa gen depans anrejistre' })}</p>
                ) : (
                  <>
                    <Donut slices={categories} />
                    <div className="space-y-2.5 pt-2 border-t border-[var(--color-border)]">
                      {categories.map(c => (
                        <HBar key={c.label} label={c.label} value={c.value} max={maxCat}
                          bgColor={c.color} fmtVal={fmtHTG(c.value)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Payment methods */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] p-6 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text)]">{t({ fr: 'Moyens de paiement', ht: 'Mwayen peman' })}</h2>
                  <p className="text-xs text-[var(--color-muted)]">{t({ fr: 'Comment vos clients paient-ils ?', ht: 'Kijan kliyan ou yo peye?' })}</p>
                </div>
                {payMethods.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">{t({ fr: 'Aucune vente enregistrée', ht: 'Pa gen vant anrejistre' })}</p>
                ) : (
                  <>
                    <Donut slices={payMethods} />
                    <div className="space-y-2.5 pt-2 border-t border-[var(--color-border)]">
                      {payMethods.map(pm => (
                        <HBar key={pm.label} label={pm.label} value={pm.value} max={maxPM}
                          bgColor={pm.color} fmtVal={`${pm.value} vente${pm.value > 1 ? 's' : ''}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Monthly table */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[#0F172A] overflow-hidden">
              <div className="border-b border-[var(--color-border)] px-5 py-4">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">{t({ fr: 'Détail mensuel', ht: 'Detay chak mwa' })}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-surface)]">
                    <tr>
                      {[t({ fr: 'Mois', ht: 'Mwa' }), t({ fr: 'Revenus', ht: 'Revni' }), t({ fr: 'Dépenses', ht: 'Depans' }), t({ fr: 'Profit', ht: 'Pwofi' }), t({ fr: 'Marge', ht: 'Mach' })].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {[...months].reverse().map(m => {
                      const marge = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
                      return (
                        <tr key={m.ym} className="hover:bg-[var(--color-surface)] transition-colors">
                          <td className="px-5 py-3 font-medium text-[var(--color-text)]">{m.label}</td>
                          <td className="px-5 py-3 text-emerald-600 dark:text-emerald-400">{fmtHTG(m.revenue)}</td>
                          <td className="px-5 py-3 text-red-500 dark:text-red-400">{fmtHTG(m.expenses)}</td>
                          <td className={`px-5 py-3 font-semibold ${m.profit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-500 dark:text-orange-400'}`}>{fmtHTG(m.profit)}</td>
                          <td className="px-5 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${marge >= 20 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : marge > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                              {marge.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
