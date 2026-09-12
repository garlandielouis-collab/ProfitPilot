'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Pilotage — Diagnostic 9 (recommandations) + Bonus 1, 3, 5, 7
//
//   • KPI mensuels + comparaison mois/mois et année/année   (Bonus 7)
//   • Score de santé financière historisé                   (Bonus 3)
//   • Recommandations automatiques                          (Diagnostic 9)
//   • Résumé hebdomadaire WhatsApp                          (Bonus 1)
//   • Dossier prêt pour une demande de crédit / microfinance (Bonus 5)
// ─────────────────────────────────────────────────────────────────────────────

import { getBusinessContext } from '../../lib/serverAuth';
import { assertFeature, hasFeature } from '../../lib/entitlements';
import { refreshRateWithAlert, type RateAlert } from './exchangeRate';
import { getGoalProgress, type GoalProgress } from './goals';
import { computeHealthScore, type HealthResult } from '../../lib/healthScore';
import { generateInsights, type Insight } from '../../lib/insights';
import { buildWeeklyDigest, buildWhatsAppLink } from '../../lib/whatsappReport';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de période
// ─────────────────────────────────────────────────────────────────────────────

function monthStartOf(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function addMonths(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1))
    .toISOString()
    .slice(0, 10);
}

function endOfMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ─────────────────────────────────────────────────────────────────────────────
// Conversion vers la devise de l'entreprise
//
// Même règle que `makeToReport` dans app/actions/ai.ts (un fichier 'use server'
// n'exporte que des fonctions async : elle ne peut pas être importée d'ici).
// `v_receivables`, `sales` et `sale_items` portent chacun leur devise :
// 100 USD + 100 HTG ne font pas « 200 HTG ». Chaque montant est ramené à
// `businesses.default_currency` au taux `businesses.exchange_rate`
// (1 USD = taux HTG). `null` = conversion impossible (taux absent ou nul) :
// l'appelant exclut le montant ET le compte, au lieu d'inventer un chiffre.
// ─────────────────────────────────────────────────────────────────────────────

function makeToReport(exchangeRate: number, reportCurrency: 'HTG' | 'USD') {
  const rateOk = Number.isFinite(exchangeRate) && exchangeRate > 0;
  return (amount: number, currency: string | null | undefined): number | null => {
    const c = (currency ?? 'HTG').toUpperCase();
    if (c === reportCurrency) return amount;
    if (!rateOk) return null;
    if (reportCurrency === 'HTG' && c === 'USD') return amount * exchangeRate;
    if (reportCurrency === 'USD' && c === 'HTG') return amount / exchangeRate;
    return amount;
  };
}

/** Créances ouvertes / en retard, converties ; les inconvertibles sont comptées à part. */
function sumReceivables(
  rows: any[] | null | undefined,
  convert: ReturnType<typeof makeToReport>,
): { open: number; overdue: number; unconvertedCount: number } {
  let open = 0;
  let overdue = 0;
  let unconvertedCount = 0;
  for (const r of rows ?? []) {
    // Une créance soldée (solde 0) n'a rien à convertir : elle ne doit pas
    // gonfler le compte des montants exclus.
    const amount = num(r.balance_due);
    const v = amount === 0 ? 0 : convert(amount, r.currency);
    if (v === null) { unconvertedCount += 1; continue; }
    open += v;
    if (r.status === 'overdue' || r.status === 'critical') overdue += v;
  }
  return { open, overdue, unconvertedCount };
}

/** Recommandation qui dit que des créances manquent au calcul, faute de taux. */
function unconvertedInsight(count: number, reportCurrency: 'HTG' | 'USD'): Insight {
  const other = reportCurrency === 'HTG' ? 'USD' : 'HTG';
  const s = count > 1 ? 's' : '';
  return {
    id:       'fx-rate-missing',
    severity: 'warning',
    message:  `${count} créance${s} en ${other} non comptée${s} : le taux de change de l’entreprise est absent.`,
    action:   'Renseignez le taux USD/HTG dans les paramètres.',
    href:     '/settings',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI mensuels & comparaisons (Bonus 7)
// ─────────────────────────────────────────────────────────────────────────────

export type MonthlyKpi = {
  periodStart: string;
  revenue: number;
  salesCount: number;
  customers: number;
  cogs: number;
  grossMargin: number;
  businessExpenses: number;
  personalExpenses: number;
  netProfit: number;
};

export type MonthComparison = {
  current: MonthlyKpi;
  previousMonth: MonthlyKpi | null;
  sameMonthLastYear: MonthlyKpi | null;
  /** Variations en % vs mois précédent. */
  momPercent: { revenue: number; grossMargin: number; netProfit: number };
  /** Variations en % vs même mois l'an dernier. */
  yoyPercent: { revenue: number; grossMargin: number; netProfit: number } | null;
  currency: string;
};

const EMPTY_KPI = (periodStart: string): MonthlyKpi => ({
  periodStart,
  revenue: 0,
  salesCount: 0,
  customers: 0,
  cogs: 0,
  grossMargin: 0,
  businessExpenses: 0,
  personalExpenses: 0,
  netProfit: 0,
});

function mapKpi(row: any, fallbackPeriod: string): MonthlyKpi {
  if (!row) return EMPTY_KPI(fallbackPeriod);
  return {
    periodStart:      row.period_start,
    revenue:          num(row.revenue),
    salesCount:       num(row.sales_count),
    customers:        num(row.customers),
    cogs:             num(row.cogs),
    grossMargin:      num(row.gross_margin),
    businessExpenses: num(row.business_expenses),
    personalExpenses: num(row.personal_expenses),
    netProfit:        num(row.net_profit),
  };
}

const variation = (now: number, before: number): number =>
  before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : 0;

/** KPI du mois demandé, comparés au mois précédent et au même mois N-1. */
export async function getMonthComparison(periodStart?: string): Promise<MonthComparison> {
  await assertFeature('month_comparison');
  const { supabase, businessId, defaultCurrency } = await getBusinessContext();

  const current  = periodStart ?? monthStartOf(new Date());
  const previous = addMonths(current, -1);
  const lastYear = addMonths(current, -12);

  const { data, error } = await supabase
    .from('v_monthly_kpis')
    .select('*')
    .eq('business_id', businessId)
    .in('period_start', [current, previous, lastYear]);

  if (error) throw new Error(error.message);

  const byPeriod = new Map((data ?? []).map((r: any) => [r.period_start, r]));
  const cur  = mapKpi(byPeriod.get(current), current);
  const prev = byPeriod.get(previous) ? mapKpi(byPeriod.get(previous), previous) : null;
  const yoy  = byPeriod.get(lastYear) ? mapKpi(byPeriod.get(lastYear), lastYear) : null;

  return {
    current: cur,
    previousMonth: prev,
    sameMonthLastYear: yoy,
    momPercent: {
      revenue:     variation(cur.revenue,     prev?.revenue     ?? 0),
      grossMargin: variation(cur.grossMargin, prev?.grossMargin ?? 0),
      netProfit:   variation(cur.netProfit,   prev?.netProfit   ?? 0),
    },
    yoyPercent: yoy
      ? {
          revenue:     variation(cur.revenue,     yoy.revenue),
          grossMargin: variation(cur.grossMargin, yoy.grossMargin),
          netProfit:   variation(cur.netProfit,   yoy.netProfit),
        }
      : null,
    currency: defaultCurrency,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Score de santé financière (Bonus 3)
// ─────────────────────────────────────────────────────────────────────────────

export type HealthSnapshot = HealthResult & {
  periodStart: string;
  revenue: number;
  grossMargin: number;
  openReceivables: number;
  currency: string;
  /** Créances dans l'autre devise laissées hors du score faute de taux valide. */
  unconvertedCount: number;
};

/**
 * Calcule le score du mois et l'historise (un snapshot par mois).
 * Historiser permet d'afficher la progression, ce qui crée le réflexe d'usage.
 */
export async function getHealthScore(periodStart?: string): Promise<HealthSnapshot> {
  await assertFeature('health_score');
  const { supabase, businessId, defaultCurrency, exchangeRate } = await getBusinessContext();

  const period = periodStart ?? monthStartOf(new Date());
  const from   = period;
  const to     = endOfMonth(period);

  const [{ data: kpi }, { data: saleDays }, { data: receivables }] = await Promise.all([
    supabase
      .from('v_monthly_kpis')
      .select('*')
      .eq('business_id', businessId)
      .eq('period_start', period)
      .maybeSingle(),
    supabase
      .from('sales')
      .select('sale_date')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to),
    supabase
      .from('v_receivables')
      .select('balance_due, status, currency')
      .eq('business_id', businessId),
  ]);

  const k = mapKpi(kpi, period);

  const activeDays = new Set((saleDays ?? []).map((r: any) => r.sale_date)).size;
  const periodDays = Number(to.slice(8, 10));

  const {
    open: openReceivables,
    overdue: overdueReceivables,
    unconvertedCount,
  } = sumReceivables(receivables, makeToReport(exchangeRate, defaultCurrency));

  const result = computeHealthScore({
    revenue:          k.revenue,
    grossMargin:      k.grossMargin,
    businessExpenses: k.businessExpenses,
    activeDays,
    periodDays,
    openReceivables,
    overdueReceivables,
  });

  // Historisation best-effort : un échec ne doit pas casser l'affichage.
  await supabase
    .from('financial_health_snapshots')
    .upsert(
      {
        business_id:  businessId,
        period_start: period,
        score:        result.score,
        breakdown:    result.breakdown,
        revenue:      k.revenue,
        margin:       k.grossMargin,
        receivables:  openReceivables,
      },
      { onConflict: 'business_id,period_start' },
    );

  return {
    ...result,
    periodStart:     period,
    revenue:         k.revenue,
    grossMargin:     k.grossMargin,
    openReceivables,
    currency:        defaultCurrency,
    unconvertedCount,
  };
}

/** Historique des scores, pour montrer la progression mois après mois. */
export async function getHealthHistory(months = 6): Promise<
  Array<{ periodStart: string; score: number }>
> {
  const { supabase, businessId } = await getBusinessContext();
  const { data } = await supabase
    .from('financial_health_snapshots')
    .select('period_start, score')
    .eq('business_id', businessId)
    .order('period_start', { ascending: false })
    .limit(months);

  return (data ?? [])
    .map((r: any) => ({ periodStart: r.period_start, score: num(r.score) }))
    .reverse();
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommandations automatiques (Diagnostic 9)
// ─────────────────────────────────────────────────────────────────────────────

export async function getInsights(limit = 5): Promise<Insight[]> {
  await assertFeature('auto_recommendations');
  const { supabase, businessId, defaultCurrency, exchangeRate } = await getBusinessContext();

  const period   = monthStartOf(new Date());
  const previous = addMonths(period, -1);

  const [{ data: kpis }, { data: prof }, { data: products }, { data: recv }, { data: rate }] =
    await Promise.all([
      supabase
        .from('v_monthly_kpis')
        .select('*')
        .eq('business_id', businessId)
        .in('period_start', [period, previous]),
      supabase
        .from('v_product_profitability')
        .select('product_id, product_name, units_sold, gross_margin, margin_pct')
        .eq('business_id', businessId),
      supabase
        .from('products')
        .select('id, name, stock_quantity, reorder_point')
        // Cadrage par entreprise : `user_id` n'est que l'auteur de la fiche. Un
        // produit créé par un employé échappait sinon à l'alerte de stock.
        .eq('business_id', businessId),
      supabase
        .from('v_receivables')
        .select('sale_id, customer_name, balance_due, days_overdue, currency')
        .eq('business_id', businessId),
      supabase
        .from('exchange_rate_history')
        .select('variation_pct')
        .eq('business_id', businessId)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const byPeriod = new Map((kpis ?? []).map((r: any) => [r.period_start, r]));
  const cur  = mapKpi(byPeriod.get(period), period);
  const prev = mapKpi(byPeriod.get(previous), previous);

  const stockMap = new Map(
    (products ?? []).map((p: any) => [
      p.id,
      { stock: num(p.stock_quantity), reorder: num(p.reorder_point) || 5, name: p.name },
    ]),
  );

  const productInputs = (prof ?? []).map((r: any) => {
    const meta = stockMap.get(r.product_id);
    return {
      id:            r.product_id,
      name:          r.product_name ?? meta?.name ?? 'Produit',
      unitsSold:     num(r.units_sold),
      grossMargin:   num(r.gross_margin),
      marginPct:     num(r.margin_pct),
      stockQuantity: meta?.stock ?? 0,
      reorderPoint:  meta?.reorder ?? 5,
    };
  });

  // Produits en stock jamais vendus : eux aussi méritent une recommandation.
  const seen = new Set(productInputs.map((p) => p.id));
  for (const [id, meta] of stockMap) {
    if (seen.has(id) || meta.stock <= 0) continue;
    productInputs.push({
      id, name: meta.name, unitsSold: 0, grossMargin: 0, marginPct: 0,
      stockQuantity: meta.stock, reorderPoint: meta.reorder,
    });
  }

  // Les messages affichent `defaultCurrency` : chaque créance y est ramenée.
  // Une créance inconvertible est exclue du total et signalée à part.
  const convert = makeToReport(exchangeRate, defaultCurrency);
  let unconvertedCount = 0;
  const receivables: Array<{ id: string; clientName: string; balanceDue: number; daysOverdue: number }> = [];
  for (const r of (recv ?? []) as any[]) {
    const amount     = num(r.balance_due);
    const balanceDue = amount === 0 ? 0 : convert(amount, r.currency);
    if (balanceDue === null) { unconvertedCount += 1; continue; }
    receivables.push({
      id:          r.sale_id,
      clientName:  r.customer_name ?? 'Client',
      balanceDue,
      daysOverdue: num(r.days_overdue),
    });
  }

  const list = generateInsights(
    {
      currency:            defaultCurrency,
      revenue:             cur.revenue,
      grossMargin:         cur.grossMargin,
      businessExpenses:    cur.businessExpenses,
      salesCount:          cur.salesCount,
      previousRevenue:     prev.revenue,
      previousGrossMargin: prev.grossMargin,
      personalExpenses:    cur.personalExpenses,
      products:            productInputs,
      receivables,
      dormantCustomers: [],
      rateVariationPercent: rate?.variation_pct != null ? num(rate.variation_pct) : undefined,
    },
    limit,
  );
  if (unconvertedCount === 0) return list;

  // Après les alertes critiques, avant le reste : le total des créances affiché
  // plus haut est incomplet, le marchand doit le savoir.
  const firstNonCritical = list.findIndex((i) => i.severity !== 'critical');
  const at = firstNonCritical === -1 ? list.length : firstNonCritical;
  return [...list.slice(0, at), unconvertedInsight(unconvertedCount, defaultCurrency), ...list.slice(at)]
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Résumé hebdomadaire WhatsApp (Bonus 1)
// ─────────────────────────────────────────────────────────────────────────────

export type WeeklyDigest = {
  message: string;
  whatsappUrl: string;
  periodStart: string;
  periodEnd: string;
  revenue: number;
  grossMargin: number;
  salesCount: number;
  /** Devise de tous les montants ci-dessus : celle de l'entreprise. */
  currency: string;
  /** Ventes dans l'autre devise laissées hors des totaux faute de taux valide. */
  unconvertedCount: number;
};

/**
 * Construit le résumé de la semaine écoulée et le journalise.
 * L'envoi effectif est fait par l'appelant (clic du marchand ou cron + API).
 */
export async function buildWeeklyReport(reference = new Date()): Promise<WeeklyDigest> {
  await assertFeature('weekly_whatsapp_report');
  const { supabase, businessId, defaultCurrency, exchangeRate } = await getBusinessContext();

  const end   = new Date(reference);
  const start = new Date(end.getTime() - 6 * 86_400_000);
  const prevStart = new Date(start.getTime() - 7 * 86_400_000);
  const prevEnd   = new Date(start.getTime() - 86_400_000);

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [{ data: biz }, { data: sales }, { data: prevSales }, { data: items }, { data: recv }] =
    await Promise.all([
      supabase.from('businesses').select('name, whatsapp_number').eq('id', businessId).maybeSingle(),
      supabase
        .from('sales')
        .select('id, total_amount, currency')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .gte('sale_date', iso(start))
        .lte('sale_date', iso(end)),
      supabase
        .from('sales')
        .select('id, total_amount, currency')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .gte('sale_date', iso(prevStart))
        .lte('sale_date', iso(prevEnd)),
      supabase
        .from('sale_items')
        .select('sale_id, product_name, quantity, unit_price, cost_price, line_total, currency, sales!inner(sale_date, deleted_at)')
        .eq('business_id', businessId)
        // Le CA ci-dessus exclut les ventes supprimées ; la marge aussi.
        .is('sales.deleted_at', null)
        .gte('sales.sale_date', iso(start))
        .lte('sales.sale_date', iso(end)),
      supabase
        .from('v_receivables')
        .select('sale_id, customer_name, balance_due, days_overdue, status, currency')
        .eq('business_id', businessId),
    ]);

  // Le message affiche `defaultCurrency` : ventes, marges et créances y sont
  // ramenées. Une vente inconvertible est exclue des totaux et comptée une
  // seule fois (par id), même si elle apparaît aussi en ligne et en créance.
  const convert = makeToReport(exchangeRate, defaultCurrency);
  const unconverted = new Set<string>();
  const toReport = (amount: number, currency: string | null | undefined, saleId: string): number | null => {
    if (amount === 0) return 0;
    const v = convert(amount, currency);
    if (v === null) unconverted.add(saleId);
    return v;
  };
  const sumSales = (rows: any[] | null | undefined): number =>
    (rows ?? []).reduce((s: number, r: any) => s + (toReport(num(r.total_amount), r.currency, r.id) ?? 0), 0);

  const revenue     = sumSales(sales);
  const prevRevenue = sumSales(prevSales);

  const marginByProduct = new Map<string, number>();
  let grossMargin = 0;
  for (const it of items ?? []) {
    const margin = toReport(
      num((it as any).line_total) - num((it as any).cost_price) * num((it as any).quantity),
      (it as any).currency,
      (it as any).sale_id,
    );
    if (margin === null) continue;
    grossMargin += margin;
    const name = (it as any).product_name ?? 'Produit';
    marginByProduct.set(name, (marginByProduct.get(name) ?? 0) + margin);
  }

  const topProduct = [...marginByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, m]) => ({ name, grossMargin: m }))[0] ?? null;

  const receivablesDue: Array<{ clientName: string; balanceDue: number; daysOverdue: number }> = [];
  for (const r of (recv ?? []) as any[]) {
    if (!['due_soon', 'overdue', 'critical'].includes(r.status)) continue;
    const balanceDue = toReport(num(r.balance_due), r.currency, r.sale_id);
    if (balanceDue === null) continue;
    receivablesDue.push({
      clientName:  r.customer_name ?? 'Client',
      balanceDue,
      daysOverdue: Math.max(num(r.days_overdue), 0),
    });
  }
  receivablesDue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  const unconvertedCount = unconverted.size;

  // Le message porte déjà sa propre ligne « taux manquant » : la recommandation
  // équivalente ferait doublon.
  const insights = (await hasFeature('auto_recommendations'))
    ? (await getInsights(4)).filter((i) => i.id !== 'fx-rate-missing').slice(0, 3)
    : [];

  const message = buildWeeklyDigest({
    businessName:    biz?.name ?? 'Mon business',
    currency:        defaultCurrency,
    periodStart:     iso(start),
    periodEnd:       iso(end),
    revenue,
    grossMargin,
    salesCount:      (sales ?? []).length,
    previousRevenue: prevRevenue,
    topProduct,
    receivablesDue,
    insights,
    unconvertedCount,
  });

  await supabase.from('report_deliveries').insert({
    business_id:  businessId,
    kind:         'weekly_digest',
    channel:      'whatsapp',
    period_start: iso(start),
    period_end:   iso(end),
    payload:      {
      revenue, grossMargin, salesCount: (sales ?? []).length,
      currency: defaultCurrency, unconvertedCount,
    },
    status:       'generated',
  });

  return {
    message,
    whatsappUrl: buildWhatsAppLink(biz?.whatsapp_number, message),
    periodStart: iso(start),
    periodEnd:   iso(end),
    revenue,
    grossMargin,
    salesCount:  (sales ?? []).length,
    currency:    defaultCurrency,
    unconvertedCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dossier crédit / microfinance (Bonus 5)
// ─────────────────────────────────────────────────────────────────────────────

export type CreditFile = {
  businessName: string;
  ownerName: string | null;
  currency: string;
  generatedAt: string;
  months: MonthlyKpi[];
  totals: {
    revenue: number;
    grossMargin: number;
    businessExpenses: number;
    netProfit: number;
    averageMonthlyRevenue: number;
    marginPercent: number;
  };
  /** En devise de l'entreprise ; `unconvertedCount` créances exclues faute de taux valide. */
  receivables: { open: number; overdue: number; unconvertedCount: number };
  healthScore: number | null;
};

/**
 * Dossier lisible par une banque ou une institution de microfinance :
 * historique mensuel du CA et de la marge, hors dépenses personnelles.
 */
export async function getCreditFile(months = 12): Promise<CreditFile> {
  await assertFeature('credit_export');
  const { supabase, businessId, defaultCurrency, exchangeRate } = await getBusinessContext();

  const firstPeriod = addMonths(monthStartOf(new Date()), -(months - 1));

  const [{ data: biz }, { data: kpis }, { data: recv }, { data: health }] = await Promise.all([
    supabase.from('businesses').select('name, legal_name').eq('id', businessId).maybeSingle(),
    supabase
      .from('v_monthly_kpis')
      .select('*')
      .eq('business_id', businessId)
      .gte('period_start', firstPeriod)
      .order('period_start', { ascending: true }),
    supabase
      .from('v_receivables')
      .select('balance_due, status, currency')
      .eq('business_id', businessId),
    supabase
      .from('financial_health_snapshots')
      .select('score')
      .eq('business_id', businessId)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = (kpis ?? []).map((r: any) => mapKpi(r, r.period_start));
  const recvTotals = sumReceivables(recv, makeToReport(exchangeRate, defaultCurrency));

  const revenue          = rows.reduce((s, r) => s + r.revenue, 0);
  const grossMargin      = rows.reduce((s, r) => s + r.grossMargin, 0);
  const businessExpenses = rows.reduce((s, r) => s + r.businessExpenses, 0);
  const netProfit        = rows.reduce((s, r) => s + r.netProfit, 0);

  await supabase.from('report_deliveries').insert({
    business_id:  businessId,
    kind:         'credit_export',
    channel:      'pdf',
    period_start: firstPeriod,
    period_end:   endOfMonth(monthStartOf(new Date())),
    payload:      { months: rows.length, revenue },
    status:       'generated',
  });

  return {
    businessName: biz?.name ?? 'Mon business',
    ownerName:    (biz as any)?.legal_name ?? null,
    currency:     defaultCurrency,
    generatedAt:  new Date().toISOString(),
    months:       rows,
    totals: {
      revenue,
      grossMargin,
      businessExpenses,
      netProfit,
      averageMonthlyRevenue: rows.length > 0 ? revenue / rows.length : 0,
      marginPercent:         revenue > 0 ? Math.round((grossMargin / revenue) * 1000) / 10 : 0,
    },
    receivables: {
      open:             recvTotals.open,
      overdue:          recvTotals.overdue,
      unconvertedCount: recvTotals.unconvertedCount,
    },
    healthScore: health?.score != null ? num(health.score) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bande de pilotage — un seul aller-retour
//
// Le dashboard déclenchait six server actions au montage (tableau, score,
// alerte taux, objectif, comparaison, recommandations). Next.js met les server
// actions d'un même client en file : elles partaient donc les unes APRÈS les
// autres, et chacune refaisait `auth.getUser()` — un appel réseau vers l'API
// Auth de Supabase, pas une lecture locale — puis relisait l'entreprise et le
// rôle. Sur une connexion mobile haïtienne, c'est plusieurs secondes d'écran
// vide avant le moindre chiffre.
//
// Ici tout se joue dans une seule requête : un seul contexte, et les lectures
// en parallèle via `Promise.allSettled`. « allSettled » et non « all » parce
// qu'un bloc auquel l'offre ne donne pas droit ne doit pas faire disparaître
// les autres — c'est la règle que portait déjà `<PilotageBand/>`.
// ─────────────────────────────────────────────────────────────────────────────

export type PilotageBundle = {
  rateAlert:  RateAlert | null;
  goals:      GoalProgress[];
  comparison: MonthComparison | null;
  insights:   Insight[];
  health:     HealthSnapshot | null;
};

export async function getPilotageBundle(insightLimit = 5): Promise<PilotageBundle> {
  // Réchauffe le contexte une fois : les appels suivants tapent le cache de
  // requête au lieu de refaire l'authentification chacun de leur côté.
  await getBusinessContext();

  const [rate, goals, comparison, insights, health] = await Promise.allSettled([
    refreshRateWithAlert(),
    getGoalProgress(),
    getMonthComparison(),
    getInsights(insightLimit),
    getHealthScore(),
  ]);

  const value = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  return {
    rateAlert:  value(rate, null),
    goals:      value(goals, []),
    comparison: value(comparison, null),
    insights:   value(insights, []),
    health:     value(health, null),
  };
}
