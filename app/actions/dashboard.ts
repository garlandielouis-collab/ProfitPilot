'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Le tableau de bord, côté serveur — un aller-retour par écran (§49)
//
// « Ne pas charger toutes les données simultanément. Utiliser : server-side
//   fetching, parallel queries, caching, lazy loading. »
//
// Deux fonctions, deux lots :
//
//   getDashboardCore()      ce que le marchand doit voir tout de suite —
//                           les KPI, la courbe, les alertes, les produits.
//                           Toutes offres.
//   getDashboardModules()   ce qui arrive juste après — santé, objectifs,
//                           stock, clients, équipe, prévision, boutique.
//                           Kwasans et Elit seulement.
//
// C'est le §49 pris au mot : « les widgets secondaires peuvent charger après
// les KPI principaux ». Un seul contexte d'authentification par lot, et des
// lectures en parallèle via `Promise.all` — la leçon déjà apprise avec
// `getPilotageBundle()`.
//
// ── Deux règles que ce fichier ne négocie pas ──────────────────────────────
//
// §52 « Plan + Permission = accès réel » : sans `reports:read`, le bloc
// financier n'est pas masqué à l'affichage, il n'est pas LU. Un caissier qui
// appellerait l'action à la main reçoit `finance: null`.
//
// §51 « Chaque KPI doit avoir une source identifiable » : aucune valeur n'est
// inventée, aucun repli sur une moyenne plausible. Une donnée absente vaut
// `null`, et l'écran dit « pas encore assez de données » (§42).
// ─────────────────────────────────────────────────────────────────────────────

import { getBusinessContext } from '../../lib/serverAuth';
import { makeToReport, type ReportFx } from '../../lib/currency';
import { getActivePlanKey } from '../../lib/entitlements';
import { planHasFeature } from '../../lib/planFeatures';
import { roleHasPermission } from '../../lib/rbac';
import {
  dashboardLevel, enabledModules, moduleEnabled,
  type DashboardLevel, type DashboardModule,
} from '../../lib/dashboardLevel';
import { computeHealthScore, type HealthResult } from '../../lib/healthScore';
import { getGoalProgress, type GoalProgress } from './goals';

// ─────────────────────────────────────────────────────────────────────────────
// Types du contrat — des NOMBRES, jamais des phrases
//
// Les libellés vivent côté client, parce qu'ils passent par `t({ fr, ht })` :
// un texte français figé dans une réponse serveur serait intraduisible en
// créole, et le créole est la moitié du produit.
// ─────────────────────────────────────────────────────────────────────────────

export type DashboardRangeInput = {
  from: string;          // YYYY-MM-DD, borne incluse
  to: string;            // YYYY-MM-DD, borne incluse
  bucket: 'hour' | 'day' | 'week' | 'month';
  /**
   * La période de comparaison, résolue par le client (`range.ts`).
   *
   * Elle est passée plutôt que recalculée ici, sinon « comparer à l'année
   * précédente » ne changerait rien : le serveur reculerait toujours d'une
   * durée de période, et l'écran afficherait « vs année précédente » au-dessus
   * de chiffres du mois dernier. Un libellé qui ment sur ce qu'il compare est
   * pire qu'une absence de comparaison.
   *
   * Absente : la période de même durée juste avant.
   */
  baseline?: { from: string; to: string } | null;
};

/** Les chiffres financiers d'une période. `null` sans `reports:read` (§52). */
export type FinanceBlock = {
  revenue: number;
  cogs: number;
  grossMargin: number;
  expenses: number;
  netProfit: number;
  /** Encaissé − décaissé sur la période. */
  cashFlow: number;
  salesCount: number;
  averageOrderValue: number;
  /** Ce que l'entreprise doit à ses fournisseurs sur la période. */
  supplierDebt: number;
};

export type SeriesPoint = {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
};

export type AlertsBlock = {
  lowStock: number;
  outOfStock: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  overdueAmount: number;
  /** Créances ouvertes, tous états confondus. */
  openReceivables: number;
  currency: string;
};

export type TopProductRow = {
  id: string;
  name: string;
  units: number;
  revenue: number;
  /** Marge en %, ou `null` quand le coût d'achat n'est pas renseigné (§51). */
  marginPct: number | null;
};

export type StockRow = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  reorderPoint: number;
};

export type DashboardCore = {
  level: DashboardLevel;
  modules: DashboardModule[];
  currency: string;
  company: { id: string; name: string };
  /** Nombre d'entreprises accessibles — le §53 en dépend. */
  companyCount: number;
  range: { from: string; to: string; days: number };
  finance: FinanceBlock | null;
  baseline: FinanceBlock | null;
  series: SeriesPoint[];
  alerts: AlertsBlock;
  topProducts: TopProductRow[];
  stock: StockRow[];
  /** Ce que l'entreprise possède — sert au dashboard adaptatif (§42). */
  presence: {
    hasSales: boolean;
    hasProducts: boolean;
    hasCustomers: boolean;
    hasTeam: boolean;
    hasStore: boolean;
    monthsOfHistory: number;
  };
  /**
   * Documents (vente, dépense, achat…) dont un montant est resté hors des
   * totaux ci-dessus : autre devise, taux de change non saisi. Un document est
   * compté une fois. Optionnel : absent d'un socle mis en cache avant.
   */
  unconvertedCount?: number;
};

export type MonthlyPoint = {
  periodStart: string;
  revenue: number;
  grossMargin: number;
  netProfit: number;
  salesCount: number;
  customers: number;
};

export type InventoryIntel = {
  value: number;
  lowStock: number;
  outOfStock: number;
  /** Vendus au moins une fois sur la fenêtre observée. */
  fastMovers: Array<{ id: string; name: string; units: number; stock: number }>;
  /** En stock, aucune vente sur la fenêtre observée. */
  slowMovers: Array<{ id: string; name: string; stock: number; daysSinceSale: number | null }>;
  /** À réapprovisionner : sous le point de commande. */
  restock: Array<{ id: string; name: string; stock: number; reorderPoint: number }>;
  /** Rotation = unités vendues / stock moyen. `null` sans stock (§51). */
  turnover: number | null;
  /** Nombre de jours observés pour « lent » et « rapide ». */
  windowDays: number;
};

export type CustomerIntel = {
  total: number;
  /** Premiers achats sur la période. */
  newCustomers: number;
  returning: number;
  /** Variation du nombre de clients actifs vs période de comparaison. */
  growthPct: number | null;
  averageValue: number;
  /** Sans achat depuis 60 jours — le §33 les nomme, avec leur nombre. */
  dormant: number;
  top: Array<{ id: string; name: string; orders: number; value: number }>;
};

export type TeamIntel = {
  size: number;
  members: Array<{ id: string; name: string; revenue: number; salesCount: number }>;
  /** Part du chiffre d'affaires réalisée par l'équipe (hors propriétaire). */
  teamRevenue: number;
  /** Variation de cette part vs période de comparaison. */
  teamRevenueDeltaPct: number | null;
};

export type StoreIntel = {
  active: boolean;
  slug: string | null;
  orders: number;
  revenue: number;
  averageOrderValue: number;
  /** Commandes non payées : le panier abandonné du §36, version honnête. */
  pendingOrders: number;
  pendingValue: number;
  currency: string;
};

export type HealthBlock = HealthResult & {
  periodStart: string;
  /** Les scores des mois précédents, pour montrer la pente. */
  history: Array<{ periodStart: string; score: number }>;
};

export type DashboardModules = {
  level: DashboardLevel;
  currency: string;
  health: HealthBlock | null;
  history: MonthlyPoint[];
  goals: GoalProgress[];
  inventory: InventoryIntel | null;
  customers: CustomerIntel | null;
  team: TeamIntel | null;
  store: StoreIntel | null;
  /**
   * Produits et commandes dont un montant est resté hors des totaux du lot :
   * autre devise, taux non saisi. Les ventes et créances que le socle compte
   * déjà sont exclues ici aussi, mais pas recomptées. Optionnel.
   */
  unconvertedCount?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const dayCount = (from: string, to: string): number => {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
};

/** Décale une période de N jours vers le passé, bornes incluses. */
function shiftBack(from: string, to: string): { from: string; to: string } {
  const days = dayCount(from, to);
  const shift = (iso: string, by: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + by);
    return d.toISOString().slice(0, 10);
  };
  return { from: shift(from, -days), to: shift(to, -days) };
}

const MONTHS_SHORT = ['Jan', 'Fev', 'Mas', 'Avr', 'Me', 'Jen', 'Jil', 'Out', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * L'étiquette d'un point de la courbe. Volontairement muette : deux chiffres
 * pour un jour, trois lettres pour un mois. Pas de phrase — l'axe d'un
 * graphique n'est pas un endroit où l'on écrit (§3.8 de la constitution).
 */
function bucketLabel(date: Date, bucket: DashboardRangeInput['bucket']): string {
  if (bucket === 'hour')  return String(date.getHours()).padStart(2, '0');
  if (bucket === 'month') return MONTHS_SHORT[date.getMonth()];
  if (bucket === 'week')  return `S${weekOfYear(date)}`;
  return String(date.getDate()).padStart(2, '0');
}

function weekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
}

function bucketKey(date: Date, bucket: DashboardRangeInput['bucket']): string {
  if (bucket === 'hour')  return `${date.toISOString().slice(0, 10)}#${date.getHours()}`;
  if (bucket === 'month') return `${date.getFullYear()}-${date.getMonth()}`;
  if (bucket === 'week')  return `${date.getFullYear()}-W${weekOfYear(date)}`;
  return date.toISOString().slice(0, 10);
}

/**
 * Le convertisseur d'un lot, vers la devise de l'entreprise, au taux SAISI par
 * le marchand (`makeToReport`). Jamais de taux de repli : un montant
 * inconvertible renvoie `null` et son document (`key`) est noté, pour dire que
 * le total est incomplet. `key` à `null` : exclure sans compter, parce que
 * l'autre lot compte déjà ce document.
 */
function reportConverter(fx: ReportFx) {
  const convert = makeToReport(fx);
  const unconverted = new Set<string>();
  const toReport = (
    amount: unknown, currency: string | null | undefined, key: string | null,
  ): number | null => {
    const n = num(amount);
    if (n === 0) return 0;
    const v = convert(n, currency);
    if (v === null && key !== null) unconverted.add(key);
    return v;
  };
  /** Pour une somme : l'inconvertible y entre pour 0, et reste compté. */
  const add = (amount: unknown, currency: string | null | undefined, key: string | null): number =>
    toReport(amount, currency, key) ?? 0;
  return { toReport, add, unconverted };
}

/** La date d'un mouvement, quelle que soit la colonne qui la porte. */
const dateOf = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ─────────────────────────────────────────────────────────────────────────────
// Lot 1 — le socle
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FINANCE: FinanceBlock = {
  revenue: 0, cogs: 0, grossMargin: 0, expenses: 0, netProfit: 0,
  cashFlow: 0, salesCount: 0, averageOrderValue: 0, supplierDebt: 0,
};

export async function getDashboardCore(input: DashboardRangeInput): Promise<DashboardCore | null> {
  let ctx: Awaited<ReturnType<typeof getBusinessContext>>;
  try {
    ctx = await getBusinessContext();
  } catch {
    // Pas de session, ou pas d'entreprise : l'écran affiche son état vide.
    return null;
  }

  const { supabase, businessId, defaultCurrency, role } = ctx;
  const planKey = await getActivePlanKey();
  const level   = dashboardLevel(planKey);

  const moduleCtx = {
    level,
    can:    (p: any) => roleHasPermission(role, p),
    canUse: (f: any) => planHasFeature(planKey, f),
  };
  const modules = enabledModules(moduleCtx);

  // §52 — la garde qui compte : sans le droit, on ne LIT pas.
  const seesFinance = moduleEnabled('kpi', moduleCtx);
  const seesStock   = moduleEnabled('top_products', moduleCtx);

  const { from, to, bucket } = input;
  const base = input.baseline ?? shiftBack(from, to);
  // Période ET base de comparaison : un montant exclu de la base fausse la
  // variation affichée, il est donc compté aussi.
  const { toReport, add, unconverted } = reportConverter(ctx);

  const salesCols = 'id, sale_date, total_amount, paid_amount, balance_due, currency, payment_status, customer_id, created_by';

  const [
    bizRes, companiesRes,
    salesRes, baseSalesRes,
    itemsRes, baseItemsRes,
    expRes, baseExpRes,
    purchRes,
    productsRes, alertsRes,
    receivablesRes,
    customersRes, storeRes, membersRes,
    firstSaleRes,
  ] = await Promise.all([
    supabase.from('businesses').select('id, name').eq('id', businessId).maybeSingle(),
    supabase.from('business_members').select('business_id').eq('user_id', ctx.userId).eq('is_active', true).is('deleted_at', null),

    seesFinance
      ? supabase.from('sales').select(salesCols).eq('business_id', businessId).is('deleted_at', null)
          .gte('sale_date', from).lte('sale_date', to)
      : Promise.resolve({ data: [] }),
    seesFinance
      ? supabase.from('sales').select(salesCols).eq('business_id', businessId).is('deleted_at', null)
          .gte('sale_date', base.from).lte('sale_date', base.to)
      : Promise.resolve({ data: [] }),

    // Le coût des marchandises vendues et le classement des produits viennent
    // des lignes de vente : c'est la seule source qui connaisse le prix
    // d'achat AU MOMENT de la vente (§51 — la formule est traçable).
    // Les lignes de vente portent `line_total` et `cost_price` : c'est du
    // chiffre financier autant que du produit. Elles suivent donc la même
    // garde que le reste (§52) — sans quoi un caissier reconstituerait le
    // chiffre d'affaires en additionnant le classement des produits.
    seesFinance
      ? supabase.from('sale_items')
          .select('sale_id, product_id, product_name, quantity, line_total, cost_price, currency, sales!inner(business_id, sale_date, deleted_at)')
          .eq('sales.business_id', businessId).is('sales.deleted_at', null)
          .gte('sales.sale_date', from).lte('sales.sale_date', to)
      : Promise.resolve({ data: [] }),
    seesFinance
      ? supabase.from('sale_items')
          .select('sale_id, quantity, line_total, cost_price, currency, sales!inner(business_id, sale_date, deleted_at)')
          .eq('sales.business_id', businessId).is('sales.deleted_at', null)
          .gte('sales.sale_date', base.from).lte('sales.sale_date', base.to)
      : Promise.resolve({ data: [] }),

    seesFinance
      ? supabase.from('expenses').select('id, amount, currency, expense_date, payment_status')
          .eq('business_id', businessId).is('deleted_at', null)
          .gte('expense_date', from).lte('expense_date', to)
      : Promise.resolve({ data: [] }),
    seesFinance
      ? supabase.from('expenses').select('id, amount, currency, expense_date')
          .eq('business_id', businessId).is('deleted_at', null)
          .gte('expense_date', base.from).lte('expense_date', base.to)
      : Promise.resolve({ data: [] }),

    seesFinance
      ? supabase.from('purchases').select('id, total_amount, balance_due, currency, purchase_date')
          .eq('business_id', businessId).is('deleted_at', null)
          .gte('purchase_date', from).lte('purchase_date', to)
      : Promise.resolve({ data: [] }),

    seesStock
      ? supabase.from('products').select('id, name, category, stock_quantity, sale_price, purchase_price, currency')
          .eq('business_id', businessId).order('name')
      : Promise.resolve({ data: [] }),
    seesStock
      ? supabase.from('low_stock_alerts').select('product_id, reorder_point').eq('business_id', businessId)
      : Promise.resolve({ data: [] }),

    supabase.from('v_receivables').select('sale_id, balance_due, status, days_overdue, currency').eq('business_id', businessId),

    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabase.from('store_settings').select('is_active, slug').eq('business_id', businessId).maybeSingle(),
    supabase.from('business_members').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('is_active', true).is('deleted_at', null),

    // La première vente donne la profondeur d'historique — elle décide si la
    // prévision a le droit d'exister (§31).
    supabase.from('sales').select('sale_date').eq('business_id', businessId).is('deleted_at', null)
      .order('sale_date', { ascending: true }).limit(1).maybeSingle(),
  ]);

  const sales      = (salesRes.data     ?? []) as any[];
  const baseSales  = (baseSalesRes.data ?? []) as any[];
  const items      = (itemsRes.data     ?? []) as any[];
  const baseItems  = (baseItemsRes.data ?? []) as any[];
  const expenses   = (expRes.data       ?? []) as any[];
  const baseExp    = (baseExpRes.data   ?? []) as any[];
  const purchases  = (purchRes.data     ?? []) as any[];
  const products   = (productsRes.data  ?? []) as any[];
  const alerts     = (alertsRes.data    ?? []) as any[];
  const receivable = (receivablesRes.data ?? []) as any[];

  // ── Financier ─────────────────────────────────────────────────────────────
  const buildFinance = (
    saleRows: any[], itemRows: any[], expenseRows: any[], purchaseRows: any[],
  ): FinanceBlock => {
    // Le panier moyen se calcule sur les ventes réellement comptées dans le
    // chiffre d'affaires : diviser par toutes les ventes le ferait baisser.
    let revenue = 0;
    let revenueSales = 0;
    for (const r of saleRows) {
      const v = toReport(r.total_amount, r.currency, `sale:${r.id}`);
      if (v === null) continue;
      revenue += v;
      revenueSales += 1;
    }
    const cogs    = itemRows.reduce((s, r) => s + add(num(r.cost_price) * num(r.quantity), r.currency, `sale:${r.sale_id}`), 0);
    const spend   = expenseRows.reduce((s, r) => s + add(r.amount, r.currency, `expense:${r.id}`), 0);
    const cashIn  = saleRows.reduce((s, r) => s + add(r.paid_amount ?? r.total_amount, r.currency, `sale:${r.id}`), 0);
    const debt    = purchaseRows.reduce((s, r) => s + add(r.balance_due ?? 0, r.currency, `purchase:${r.id}`), 0);
    const cashOut = spend + purchaseRows.reduce(
      (s, r) => s + add(num(r.total_amount) - num(r.balance_due ?? 0), r.currency, `purchase:${r.id}`), 0,
    );
    return {
      revenue,
      cogs,
      grossMargin: revenue - cogs,
      expenses: spend,
      // Profit net = marge brute − dépenses (§51, la formule est écrite une fois).
      netProfit: revenue - cogs - spend,
      cashFlow: cashIn - cashOut,
      salesCount: saleRows.length,
      averageOrderValue: revenueSales > 0 ? revenue / revenueSales : 0,
      supplierDebt: debt,
    };
  };

  const finance  = seesFinance ? buildFinance(sales, items, expenses, purchases) : null;
  const baseline = seesFinance ? buildFinance(baseSales, baseItems, baseExp, []) : null;

  // ── La courbe ─────────────────────────────────────────────────────────────
  // Les seaux sont créés à partir des mouvements RÉELS, jamais pré-remplis sur
  // une grille : un mois sans vente ne doit pas dessiner trente points à zéro
  // qui ressemblent à une chute.
  const buckets = new Map<string, SeriesPoint & { at: number }>();
  const put = (raw: string | null | undefined, field: 'revenue' | 'expenses', amount: number) => {
    const d = dateOf(raw);
    if (!d) return;
    const key = bucketKey(d, bucket);
    const entry = buckets.get(key) ?? { label: bucketLabel(d, bucket), revenue: 0, expenses: 0, profit: 0, at: d.getTime() };
    entry[field] += amount;
    entry.profit = entry.revenue - entry.expenses;
    buckets.set(key, entry);
  };

  if (seesFinance) {
    for (const s of sales)     put(s.sale_date,     'revenue',  add(s.total_amount, s.currency, `sale:${s.id}`));
    for (const e of expenses)  put(e.expense_date,  'expenses', add(e.amount, e.currency, `expense:${e.id}`));
    for (const p of purchases) put(p.purchase_date, 'expenses', add(p.total_amount, p.currency, `purchase:${p.id}`));
  }

  const series: SeriesPoint[] = [...buckets.values()]
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...point }) => point);

  // ── Alertes (§8, §29) ─────────────────────────────────────────────────────
  const reorderOf = new Map<string, number>(alerts.map((a) => [a.product_id, num(a.reorder_point)]));
  const stockOf   = (p: any) => num(p.stock_quantity);
  const outOfStock = products.filter((p) => stockOf(p) === 0).length;
  const lowStock   = products.filter((p) => {
    const q = stockOf(p);
    return q > 0 && q <= (reorderOf.get(p.id) ?? 0);
  }).length;

  const openRows    = receivable.filter((r) => r.status !== 'paid');
  const overdueRows = openRows.filter((r) => num(r.days_overdue) > 0);

  const alertsBlock: AlertsBlock = {
    lowStock,
    outOfStock,
    unpaidInvoices: openRows.length,
    overdueInvoices: overdueRows.length,
    overdueAmount: overdueRows.reduce((s, r) => s + add(r.balance_due, r.currency, `sale:${r.sale_id}`), 0),
    openReceivables: openRows.reduce((s, r) => s + add(r.balance_due, r.currency, `sale:${r.sale_id}`), 0),
    currency: defaultCurrency,
  };

  // ── Produits les plus vendus (§9) ─────────────────────────────────────────
  const byProduct = new Map<string, { name: string; units: number; revenue: number; cost: number }>();
  for (const it of items) {
    if (!it.product_id) continue;
    const entry = byProduct.get(it.product_id) ?? { name: it.product_name ?? '—', units: 0, revenue: 0, cost: 0 };
    entry.units   += num(it.quantity);
    // Ligne inconvertible : hors du CA ET du coût à la fois (même devise), la
    // marge reste calculée sur des montants homogènes.
    entry.revenue += add(it.line_total, it.currency, `sale:${it.sale_id}`);
    entry.cost    += add(num(it.cost_price) * num(it.quantity), it.currency, `sale:${it.sale_id}`);
    byProduct.set(it.product_id, entry);
  }

  const topProducts: TopProductRow[] = [...byProduct.entries()]
    .map(([id, v]) => ({
      id,
      name: v.name,
      units: v.units,
      revenue: v.revenue,
      // Marge inconnue quand le coût n'a jamais été renseigné : `null`, pas 100 %.
      marginPct: v.cost > 0 && v.revenue > 0
        ? Math.round(((v.revenue - v.cost) / v.revenue) * 1000) / 10
        : null,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const stock: StockRow[] = [...products]
    .sort((a, b) => stockOf(a) - stockOf(b))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category ?? null,
      quantity: stockOf(p),
      reorderPoint: reorderOf.get(p.id) ?? 0,
    }));

  // ── Présence — le dashboard adaptatif (§42) ───────────────────────────────
  const firstSale = (firstSaleRes as any)?.data?.sale_date as string | undefined;
  const monthsOfHistory = firstSale
    ? Math.max(0, Math.round((Date.now() - new Date(`${firstSale}T00:00:00`).getTime()) / 2_629_800_000))
    : 0;

  return {
    level,
    modules,
    currency: defaultCurrency,
    company: { id: businessId, name: (bizRes as any)?.data?.name ?? '' },
    companyCount: new Set(((companiesRes.data ?? []) as any[]).map((r) => r.business_id)).size || 1,
    range: { from, to, days: dayCount(from, to) },
    finance,
    baseline,
    series,
    alerts: alertsBlock,
    topProducts,
    stock,
    presence: {
      hasSales:     Boolean(firstSale),
      hasProducts:  products.length > 0,
      hasCustomers: num((customersRes as any).count) > 0,
      // Une équipe commence au deuxième membre : le propriétaire seul n'est
      // pas une équipe, et lui montrer « Performance de l'équipe » serait le
      // renvoyer à sa solitude (§42).
      hasTeam:      num((membersRes as any).count) > 1,
      hasStore:     Boolean((storeRes as any)?.data?.is_active),
      monthsOfHistory,
    },
    unconvertedCount: unconverted.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lot 2 — les modules d'analyse (Kwasans et Elit)
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardModules(input: DashboardRangeInput): Promise<DashboardModules | null> {
  let ctx: Awaited<ReturnType<typeof getBusinessContext>>;
  try {
    ctx = await getBusinessContext();
  } catch {
    return null;
  }

  const { supabase, businessId, defaultCurrency, role } = ctx;
  const planKey = await getActivePlanKey();
  const level   = dashboardLevel(planKey);

  const moduleCtx = {
    level,
    can:    (p: any) => roleHasPermission(role, p),
    canUse: (f: any) => planHasFeature(planKey, f),
  };

  const empty: DashboardModules = {
    level, currency: defaultCurrency,
    health: null, history: [], goals: [], inventory: null, customers: null, team: null, store: null,
  };

  // Le socle n'a pas de second lot : Esansyel s'arrête au premier (§11).
  if (level === 'basic') return empty;

  const wantsHealth    = moduleEnabled('business_health', moduleCtx);
  const wantsInventory = moduleEnabled('inventory_intel', moduleCtx);
  const wantsCustomers = moduleEnabled('customer_insights', moduleCtx);
  const wantsTeam      = moduleEnabled('team', moduleCtx);
  const wantsStore     = moduleEnabled('online_store', moduleCtx);
  const wantsHistory   = moduleEnabled('performance_compare', moduleCtx) || moduleEnabled('forecast', moduleCtx);
  const wantsGoals     = moduleEnabled('goals', moduleCtx);

  // Les ventes et créances lues ici, le socle les compte déjà : elles sont
  // exclues des sommes mais notées sans clé (`null`). Seuls les produits et les
  // commandes de la boutique, propres à ce lot, alimentent son compteur.
  const { toReport, add, unconverted } = reportConverter(ctx);
  const { from, to } = input;
  const base = input.baseline ?? shiftBack(from, to);

  // La fenêtre d'observation du stock : 30 jours, comme le §18 l'écrit
  // (« 3 produits n'ont pas été vendus depuis 30 jours »).
  const WINDOW_DAYS = 30;
  const windowFrom = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const monthStart = new Date();
  monthStart.setDate(1);
  const periodStart = monthStart.toISOString().slice(0, 10);

  const [
    historyRes, snapshotRes,
    saleDaysRes, monthReceivablesRes,
    productsRes, alertsRes, windowItemsRes, lastSaleRes,
    rankingsRes, newCustomersRes, baseCustomersRes, periodCustomersRes,
    membersRes, memberSalesRes, baseMemberSalesRes,
    storeRes, ordersRes,
    goalsRes,
  ] = await Promise.all([
    wantsHistory
      ? supabase.from('v_monthly_kpis').select('*').eq('business_id', businessId)
          .order('period_start', { ascending: false }).limit(18)
      : Promise.resolve({ data: [] }),
    wantsHealth
      ? supabase.from('financial_health_snapshots').select('period_start, score')
          .eq('business_id', businessId).order('period_start', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),

    wantsHealth
      ? supabase.from('sales').select('sale_date').eq('business_id', businessId).is('deleted_at', null)
          .gte('sale_date', periodStart)
      : Promise.resolve({ data: [] }),
    wantsHealth
      ? supabase.from('v_receivables').select('balance_due, status, currency').eq('business_id', businessId)
      : Promise.resolve({ data: [] }),

    wantsInventory
      ? supabase.from('products').select('id, name, stock_quantity, purchase_price, sale_price, currency')
          .eq('business_id', businessId)
      : Promise.resolve({ data: [] }),
    wantsInventory
      ? supabase.from('low_stock_alerts').select('product_id, reorder_point').eq('business_id', businessId)
      : Promise.resolve({ data: [] }),
    wantsInventory
      ? supabase.from('sale_items')
          .select('product_id, quantity, sales!inner(business_id, sale_date, deleted_at)')
          .eq('sales.business_id', businessId).is('sales.deleted_at', null)
          .gte('sales.sale_date', windowFrom)
      : Promise.resolve({ data: [] }),
    wantsInventory
      ? supabase.from('v_product_profitability').select('product_id, last_sold_at').eq('business_id', businessId)
      : Promise.resolve({ data: [] }),

    wantsCustomers
      ? supabase.from('v_customer_rankings')
          .select('customer_id, customer_name, total_orders, lifetime_value, avg_order_value, last_purchase_date')
          .eq('business_id', businessId).order('lifetime_value', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    wantsCustomers
      ? supabase.from('customers').select('id', { count: 'exact', head: true })
          .eq('business_id', businessId).gte('created_at', `${from}T00:00:00`)
      : Promise.resolve({ count: 0 }),
    wantsCustomers
      ? supabase.from('sales').select('customer_id').eq('business_id', businessId).is('deleted_at', null)
          .gte('sale_date', base.from).lte('sale_date', base.to).not('customer_id', 'is', null)
      : Promise.resolve({ data: [] }),
    wantsCustomers
      ? supabase.from('sales').select('customer_id').eq('business_id', businessId).is('deleted_at', null)
          .gte('sale_date', from).lte('sale_date', to).not('customer_id', 'is', null)
      : Promise.resolve({ data: [] }),

    wantsTeam
      ? supabase.from('business_members').select('id, user_id, role')
          .eq('business_id', businessId).eq('is_active', true).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    wantsTeam
      ? supabase.from('sales').select('created_by, total_amount, currency')
          .eq('business_id', businessId).is('deleted_at', null)
          .gte('sale_date', from).lte('sale_date', to)
      : Promise.resolve({ data: [] }),
    wantsTeam
      ? supabase.from('sales').select('created_by, total_amount, currency')
          .eq('business_id', businessId).is('deleted_at', null)
          .gte('sale_date', base.from).lte('sale_date', base.to)
      : Promise.resolve({ data: [] }),

    wantsStore
      ? supabase.from('store_settings').select('is_active, slug, currency').eq('business_id', businessId).maybeSingle()
      : Promise.resolve({ data: null }),
    wantsStore
      ? supabase.from('orders').select('id, total, currency, status, payment_status, created_at')
          .eq('business_id', businessId)
          .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`)
      : Promise.resolve({ data: [] }),

    // Les objectifs ont déjà leur lecture, éprouvée et gardée par l'offre.
    // La recopier ici, c'est se donner deux vérités sur « où j'en suis » —
    // celle de la carte d'objectif et celle du tableau de bord.
    wantsGoals
      ? getGoalProgress().catch(() => [] as GoalProgress[])
      : Promise.resolve([] as GoalProgress[]),
  ]);

  // ── Historique mensuel (§15, §31) ─────────────────────────────────────────
  const history: MonthlyPoint[] = ((historyRes.data ?? []) as any[])
    .map((r) => ({
      periodStart: r.period_start,
      revenue:     num(r.revenue),
      grossMargin: num(r.gross_margin),
      netProfit:   num(r.net_profit),
      salesCount:  num(r.sales_count),
      customers:   num(r.customers),
    }))
    .reverse();

  // ── Score de santé (§16, §28) ─────────────────────────────────────────────
  // Recalculé à partir des mêmes entrées que `lib/healthScore.ts` côté
  // pilotage : deux scores différents sur un écran, c'est un score de moins
  // auquel le marchand fait confiance.
  let health: HealthBlock | null = null;
  if (wantsHealth) {
    const currentMonth = history.find((h) => h.periodStart === periodStart);
    const saleDays = new Set(((saleDaysRes.data ?? []) as any[]).map((r) => r.sale_date)).size;
    const periodDays = new Date(
      monthStart.getFullYear(), monthStart.getMonth() + 1, 0,
    ).getDate();

    const openRows = ((monthReceivablesRes.data ?? []) as any[]).filter((r) => r.status !== 'paid');
    const open    = openRows.reduce((s, r) => s + add(r.balance_due, r.currency, null), 0);
    const overdue = openRows.filter((r) => r.status === 'overdue' || r.status === 'critical')
      .reduce((s, r) => s + add(r.balance_due, r.currency, null), 0);

    const result = computeHealthScore({
      revenue:          currentMonth?.revenue ?? 0,
      grossMargin:      currentMonth?.grossMargin ?? 0,
      businessExpenses: Math.max(0, (currentMonth?.grossMargin ?? 0) - (currentMonth?.netProfit ?? 0)),
      activeDays:       saleDays,
      periodDays,
      openReceivables:  open,
      overdueReceivables: overdue,
    });

    health = {
      ...result,
      periodStart,
      history: ((snapshotRes.data ?? []) as any[])
        .map((r) => ({ periodStart: r.period_start, score: num(r.score) }))
        .reverse(),
    };
  }

  // ── Stock (§18, §34) ──────────────────────────────────────────────────────
  let inventory: InventoryIntel | null = null;
  if (wantsInventory) {
    const products = (productsRes.data ?? []) as any[];
    const reorderOf = new Map<string, number>(
      ((alertsRes.data ?? []) as any[]).map((a) => [a.product_id, num(a.reorder_point)]),
    );
    const soldUnits = new Map<string, number>();
    for (const it of ((windowItemsRes.data ?? []) as any[])) {
      if (!it.product_id) continue;
      soldUnits.set(it.product_id, (soldUnits.get(it.product_id) ?? 0) + num(it.quantity));
    }
    const lastSold = new Map<string, string | null>(
      ((lastSaleRes.data ?? []) as any[]).map((r) => [r.product_id, r.last_sold_at ?? null]),
    );

    // Coût d'achat dans la devise de la fiche ; à défaut, le prix de vente, que
    // la fiche produit saisit en HTG. Un produit sans stock ne pèse rien : il
    // n'a pas à compter comme exclu.
    const value = products.reduce((s, p) => {
      const qty = num(p.stock_quantity);
      if (qty <= 0) return s;
      const unit = num(p.purchase_price) > 0
        ? add(p.purchase_price, p.currency, `product:${p.id}`)
        : add(p.sale_price, 'HTG', `product:${p.id}`);
      return s + qty * unit;
    }, 0);
    const totalUnits = [...soldUnits.values()].reduce((s, n) => s + n, 0);
    const totalStock = products.reduce((s, p) => s + num(p.stock_quantity), 0);

    const daysSince = (iso: string | null): number | null => {
      if (!iso) return null;
      return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    };

    inventory = {
      value,
      lowStock: products.filter((p) => num(p.stock_quantity) > 0 && num(p.stock_quantity) <= (reorderOf.get(p.id) ?? 0)).length,
      outOfStock: products.filter((p) => num(p.stock_quantity) === 0).length,
      fastMovers: products
        .filter((p) => (soldUnits.get(p.id) ?? 0) > 0)
        .sort((a, b) => (soldUnits.get(b.id) ?? 0) - (soldUnits.get(a.id) ?? 0))
        .slice(0, 5)
        .map((p) => ({ id: p.id, name: p.name, units: soldUnits.get(p.id) ?? 0, stock: num(p.stock_quantity) })),
      slowMovers: products
        .filter((p) => num(p.stock_quantity) > 0 && !soldUnits.has(p.id))
        .slice(0, 5)
        .map((p) => ({
          id: p.id, name: p.name, stock: num(p.stock_quantity),
          daysSinceSale: daysSince(lastSold.get(p.id) ?? null),
        })),
      restock: products
        .filter((p) => num(p.stock_quantity) <= (reorderOf.get(p.id) ?? 0) && reorderOf.has(p.id))
        .sort((a, b) => num(a.stock_quantity) - num(b.stock_quantity))
        .slice(0, 8)
        .map((p) => ({ id: p.id, name: p.name, stock: num(p.stock_quantity), reorderPoint: reorderOf.get(p.id) ?? 0 })),
      // Rotation sur 30 jours. Sans stock, elle n'existe pas — on ne divise pas
      // par zéro pour obtenir un chiffre rassurant (§51).
      turnover: totalStock > 0 ? Math.round((totalUnits / totalStock) * 100) / 100 : null,
      windowDays: WINDOW_DAYS,
    };
  }

  // ── Clients (§19, §33) ────────────────────────────────────────────────────
  let customers: CustomerIntel | null = null;
  if (wantsCustomers) {
    const rankings = (rankingsRes.data ?? []) as any[];
    const periodIds = new Set(((periodCustomersRes.data ?? []) as any[]).map((r) => r.customer_id));
    const baseIds   = new Set(((baseCustomersRes.data ?? []) as any[]).map((r) => r.customer_id));
    const newCount  = num((newCustomersRes as any).count);

    const DORMANT_DAYS = 60;
    const dormant = rankings.filter((r) => {
      if (!r.last_purchase_date) return false;
      return (Date.now() - new Date(r.last_purchase_date).getTime()) / 86_400_000 > DORMANT_DAYS;
    }).length;

    const lifetime = rankings.reduce((s, r) => s + num(r.lifetime_value), 0);

    customers = {
      total: rankings.length,
      newCustomers: newCount,
      returning: [...periodIds].filter((id) => baseIds.has(id)).length,
      growthPct: baseIds.size > 0
        ? Math.round(((periodIds.size - baseIds.size) / baseIds.size) * 1000) / 10
        : null,
      averageValue: rankings.length > 0 ? lifetime / rankings.length : 0,
      dormant,
      top: rankings.slice(0, 5).map((r) => ({
        id: r.customer_id,
        name: r.customer_name ?? '—',
        orders: num(r.total_orders),
        value: num(r.lifetime_value),
      })),
    };
  }

  // ── Équipe (§20, §37) ─────────────────────────────────────────────────────
  let team: TeamIntel | null = null;
  if (wantsTeam) {
    const members = (membersRes.data ?? []) as any[];
    const userIds = members.map((m) => m.user_id).filter(Boolean);

    // Les noms viennent des profils. Une requête de plus, mais seulement quand
    // le module existe vraiment — pas sur chaque ouverture d'écran.
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] as any[] };
    const nameOf = new Map<string, string>(
      ((profiles ?? []) as any[]).map((p) => [p.id, p.full_name ?? '']),
    );

    const revenueBy = new Map<string, { revenue: number; count: number }>();
    for (const s of ((memberSalesRes.data ?? []) as any[])) {
      if (!s.created_by) continue;
      const entry = revenueBy.get(s.created_by) ?? { revenue: 0, count: 0 };
      entry.revenue += add(s.total_amount, s.currency, null);
      entry.count += 1;
      revenueBy.set(s.created_by, entry);
    }
    const baseRevenueBy = new Map<string, number>();
    for (const s of ((baseMemberSalesRes.data ?? []) as any[])) {
      if (!s.created_by) continue;
      baseRevenueBy.set(s.created_by, (baseRevenueBy.get(s.created_by) ?? 0) + add(s.total_amount, s.currency, null));
    }

    const nonOwner = members.filter((m) => m.role !== 'owner').map((m) => m.user_id);
    const teamRevenue = nonOwner.reduce((s, id) => s + (revenueBy.get(id)?.revenue ?? 0), 0);
    const baseTeamRevenue = nonOwner.reduce((s, id) => s + (baseRevenueBy.get(id) ?? 0), 0);

    team = {
      size: members.length,
      members: members
        .map((m) => ({
          id: m.user_id,
          name: nameOf.get(m.user_id) || '',
          revenue: revenueBy.get(m.user_id)?.revenue ?? 0,
          salesCount: revenueBy.get(m.user_id)?.count ?? 0,
        }))
        .sort((a, b) => b.revenue - a.revenue),
      teamRevenue,
      teamRevenueDeltaPct: baseTeamRevenue > 0
        ? Math.round(((teamRevenue - baseTeamRevenue) / baseTeamRevenue) * 1000) / 10
        : null,
    };
  }

  // ── Boutique en ligne (§36) ───────────────────────────────────────────────
  let store: StoreIntel | null = null;
  if (wantsStore) {
    const settings = (storeRes as any)?.data ?? null;
    const orders = (ordersRes.data ?? []) as any[];
    const paid = orders.filter((o) => o.payment_status === 'paid' || o.status === 'completed');
    // Le panier moyen se calcule sur les commandes comptées dans le total.
    let revenue = 0;
    let revenueOrders = 0;
    for (const o of paid) {
      const v = toReport(o.total, o.currency, `order:${o.id}`);
      if (v === null) continue;
      revenue += v;
      revenueOrders += 1;
    }
    const pending = orders.filter((o) => o.payment_status !== 'paid' && o.status !== 'completed');

    store = {
      active: Boolean(settings?.is_active),
      slug: settings?.slug ?? null,
      orders: paid.length,
      revenue,
      averageOrderValue: revenueOrders > 0 ? revenue / revenueOrders : 0,
      pendingOrders: pending.length,
      pendingValue: pending.reduce((s, o) => s + add(o.total, o.currency, `order:${o.id}`), 0),
      currency: defaultCurrency,
    };
  }

  return {
    level, currency: defaultCurrency,
    health, history,
    goals: (goalsRes ?? []) as GoalProgress[],
    inventory, customers, team, store,
    unconvertedCount: unconverted.size,
  };
}
