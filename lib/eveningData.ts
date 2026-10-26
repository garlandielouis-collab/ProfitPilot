// ─────────────────────────────────────────────────────────────────────────────
// La lecture d'une journée — partagée par les actions du bilan et par le cron
//
// Ce module n'est PAS un fichier 'use server' : `deliverEveningReportForBusiness`
// lit avec la clé de service, et une action serveur exportée est appelable par
// n'importe quel navigateur, avec n'importe quel identifiant d'entreprise. Il
// n'est importé que par du code serveur (app/actions/evening.ts, le cron).
// ─────────────────────────────────────────────────────────────────────────────

import { makeToReport, isExchangeRateSet } from './currency';
import { readKaye } from './kaye';
import { buildWhatsAppLink } from './whatsappReport';
import {
  buildEveningMessage, computeDay, nextDay, pickTip, solDueOn, weekStart, zonedDayBounds,
  type Debtor, type EveningReport, type ExpenseRow, type PaymentRow, type SaleRow, type SolGroup, type SolRow,
} from './eveningReport';
import { getSupabaseService } from './supabaseServiceClient';
import type { BusinessContext } from './serverAuth';

export const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** Table absente (migration 20261025 non jouée) : on lit « rien », sans casser l'écran. */
export const missing = (error: any) => error && ['42P01', 'PGRST205', 'PGRST200', '42703'].includes(error.code);

export type DayCtx = Pick<BusinessContext, 'supabase' | 'businessId' | 'exchangeRate' | 'exchangeRateSet' | 'defaultCurrency' | 'can'>;

export async function businessFacts(ctx: DayCtx) {
  const { data } = await ctx.supabase
    .from('businesses')
    .select('name, timezone, settings, whatsapp_number, phone')
    .eq('id', ctx.businessId)
    .maybeSingle();
  // `whatsapp_number` vient d'une migration plus tardive : relecture sans elle.
  if (!data) {
    const { data: base } = await ctx.supabase
      .from('businesses')
      .select('name, timezone, settings, phone')
      .eq('id', ctx.businessId)
      .maybeSingle();
    return { ...(base ?? {}), whatsapp_number: null } as any;
  }
  return data as any;
}

/**
 * Les chiffres d'une journée. `memberUserId` restreint à ce qu'un aide a
 * encaissé lui-même (F22) ; sans lui, c'est la journée du commerce entier.
 */
export async function readDay(ctx: DayCtx, day: string, timeZone: string, memberUserId: string | null, ownerWeeklySalary: number | null) {
  const { supabase, businessId } = ctx;
  const { start, end } = zonedDayBounds(day, timeZone);
  const monday = weekStart(day);
  const tomorrow = nextDay(day);

  let salesQ = supabase
    .from('sales')
    .select('id, total_amount, paid_amount, currency, payment_method, payment_status, created_by, sale_items(cost_price, quantity)')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('created_at', start)
    .lt('created_at', end)
    // Un crédit recopié du cahier (F10) est une dette ancienne : il n'a pas été
    // vendu aujourd'hui, il compte seulement dans « qui doit ».
    .or('metadata->>source.is.null,metadata->>source.neq.notebook_import');
  if (memberUserId) salesQ = salesQ.eq('created_by', memberUserId);

  let paymentsQ = supabase
    .from('sale_payments')
    .select('sale_id, amount, currency, payment_method, received_by')
    .eq('business_id', businessId)
    .gte('created_at', start)
    .lt('created_at', end);
  if (memberUserId) paymentsQ = paymentsQ.eq('received_by', memberUserId);

  let expensesQ = supabase
    .from('expenses')
    .select('amount, currency, payment_method, payment_status, scope, business_share_pct, created_by')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .eq('expense_date', day);
  if (memberUserId) expensesQ = expensesQ.eq('created_by', memberUserId);

  let cashQ = supabase
    .from('cash_days')
    .select('opening_cash, counted_cash, closed_at')
    .eq('business_id', businessId)
    .eq('day', day);
  cashQ = memberUserId ? cashQ.eq('member_user_id', memberUserId) : cashQ.is('member_user_id', null);

  const [salesRes, paymentsRes, expensesRes, solPayRes, cashRes, owedRes, weekRes, solGroupsRes, stockRes] = await Promise.all([
    salesQ,
    paymentsQ,
    expensesQ,
    memberUserId
      ? Promise.resolve({ data: [], error: null } as any)
      : supabase.from('sol_payments').select('amount, direction, payment_method').eq('business_id', businessId).eq('paid_on', day),
    cashQ.maybeSingle(),
    supabase
      .from('sales')
      .select('customer_name, total_amount, paid_amount, currency, created_at')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .in('payment_status', ['credit', 'partial']),
    supabase
      .from('expenses')
      .select('amount, currency, scope, business_share_pct')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('expense_date', monday)
      .lte('expense_date', day)
      .in('scope', ['personal', 'mixed']),
    supabase.from('sol_groups').select('name, contribution, frequency, start_date, payout_date').eq('business_id', businessId).eq('is_active', true),
    supabase.from('products').select('stock_quantity, reorder_point, track_inventory').eq('business_id', businessId).eq('is_active', true),
  ]);

  // Ce que les ventes du jour ont reçu APRÈS coup : retiré de « payé à la vente ».
  const saleIds = (salesRes.data ?? []).map((s: any) => s.id);
  const later = new Map<string, number>();
  if (saleIds.length > 0) {
    const { data: laterRows } = await supabase.from('sale_payments').select('sale_id, amount').in('sale_id', saleIds);
    for (const r of laterRows ?? []) later.set(r.sale_id, (later.get(r.sale_id) ?? 0) + num(r.amount));
  }

  const convert = makeToReport(ctx);

  const sales: SaleRow[] = (salesRes.data ?? []).map((s: any) => ({
    total: num(s.total_amount),
    paidAmount: num(s.paid_amount),
    laterPayments: later.get(s.id) ?? 0,
    currency: s.currency ?? 'HTG',
    method: s.payment_method ?? null,
    status: s.payment_status ?? null,
    cost: (s.sale_items ?? []).reduce((sum: number, i: any) => sum + num(i.cost_price) * num(i.quantity), 0),
  }));
  const payments: PaymentRow[] = (paymentsRes.data ?? []).map((p: any) => ({
    amount: num(p.amount), currency: p.currency ?? 'HTG', method: p.payment_method ?? null,
  }));
  const expenses: ExpenseRow[] = (expensesRes.error ? [] : expensesRes.data ?? []).map((e: any) => ({
    amount: num(e.amount), currency: e.currency ?? 'HTG', method: e.payment_method ?? null,
    status: e.payment_status ?? null, scope: e.scope ?? 'business', sharePct: e.business_share_pct ?? null,
  }));
  const sol: SolRow[] = (missing(solPayRes.error) ? [] : solPayRes.data ?? []).map((p: any) => ({
    amount: num(p.amount), direction: p.direction === 'in' ? 'in' : 'out', method: p.payment_method ?? null,
  }));

  const cashRow = missing(cashRes.error) ? null : cashRes.data;
  const figures = computeDay({ sales, payments, expenses, sol, openingCash: num(cashRow?.opening_cash), convert });

  // Qui doit : regroupé par client, le plus ancien d'abord.
  const byClient = new Map<string, Debtor>();
  let owed = 0;
  const now = Date.now();
  for (const s of owedRes.data ?? []) {
    const balance = convert(Math.max(0, num(s.total_amount) - num(s.paid_amount)), s.currency);
    if (balance === null || balance < 0.01) continue;
    owed += balance;
    const name = String(s.customer_name ?? '').trim() || 'Kliyan';
    const days = Math.max(0, Math.floor((now - new Date(s.created_at).getTime()) / 86_400_000));
    const prev = byClient.get(name);
    byClient.set(name, { name, balance: (prev?.balance ?? 0) + balance, days: Math.max(prev?.days ?? 0, days) });
  }
  const debtors = [...byClient.values()].sort((a, b) => b.days - a.days || b.balance - a.balance);

  let weekWithdrawals = 0;
  for (const e of weekRes.error ? [] : weekRes.data ?? []) {
    const amount = convert(num(e.amount), e.currency);
    if (amount === null) continue;
    const share = e.scope === 'mixed' ? Math.min(Math.max(num(e.business_share_pct), 0), 100) / 100 : 0;
    weekWithdrawals += amount * (1 - share);
  }

  const groups: SolGroup[] = (missing(solGroupsRes.error) ? [] : solGroupsRes.data ?? []).map((g: any) => ({
    name: g.name, contribution: num(g.contribution), frequency: g.frequency, startDate: g.start_date, payoutDate: g.payout_date,
  }));
  const solTomorrow = groups.filter((g) => solDueOn(g, tomorrow)).map((g) => ({ name: g.name, amount: g.contribution }));

  const lowStock = (stockRes.data ?? []).filter((p: any) =>
    p.track_inventory !== false && num(p.stock_quantity) <= (num(p.reorder_point) || 5)).length;

  const report: EveningReport = {
    ...figures,
    day,
    currency: ctx.defaultCurrency,
    owed: Math.round(owed),
    debtors: debtors.slice(0, 5),
    weekWithdrawals: Math.round(weekWithdrawals),
    ownerWeeklySalary,
    solTomorrow,
    lowStock,
    countedCash: cashRow?.counted_cash === null || cashRow?.counted_cash === undefined ? null : num(cashRow.counted_cash),
    showProfit: ctx.can('reports:read'),
  };

  return { report, cashOpened: Boolean(cashRow), cashClosed: Boolean(cashRow?.closed_at) };
}

/** Le dépôt de la notification, partagé avec le cron. Vrai si elle vient d'être posée. */
export async function postEveningNotification(input: {
  businessId: string;
  day: string;
  build: () => Promise<{ report: EveningReport; name: string; to: string | null }>;
}): Promise<boolean> {
  const svc = getSupabaseService();
  const { data: already } = await svc
    .from('notifications')
    .select('id')
    .eq('business_id', input.businessId)
    .eq('reference_type', 'evening_report')
    .eq('metadata->>day', input.day)
    .limit(1);
  if (already && already.length > 0) return false;

  const { report, name, to } = await input.build();
  const { data: biz } = await svc.from('businesses').select('owner_id').eq('id', input.businessId).maybeSingle();
  if (!biz?.owner_id) return false;

  const ht = buildEveningMessage(report, 'ht', name);
  const tip = pickTip(report);
  const { error } = await svc.from('notifications').insert({
    business_id:    input.businessId,
    user_id:        biz.owner_id,
    // `generic` : un type inconnu échouerait si `notifications.type` est passé
    // en énum (voir lib/notify.ts). Le genre se lit dans `reference_type`.
    type:           'generic',
    title:          `Rapò jounen an · ${report.showProfit ? `pwofi ${Math.round(report.profit).toLocaleString('fr-FR')} G` : `vann ${Math.round(report.sold).toLocaleString('fr-FR')} G`}`,
    body:           tip.ht,
    reference_type: 'evening_report',
    metadata:       { kind: 'evening_report', day: input.day, whatsapp_link: buildWhatsAppLink(to, ht) },
  });
  return !error;
}

export async function deliverEveningReportForBusiness(businessId: string, day: string): Promise<boolean> {
  // Lecture par la clé de service : le cron n'a pas de session marchand.
  const svc = getSupabaseService();
  const { data: biz } = await svc
    .from('businesses')
    .select('id, name, owner_id, timezone, settings, default_currency, exchange_rate, phone')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz) return false;
  const kaye = readKaye(biz.settings);
  if (!kaye.eveningEnabled) return false;

  const ctx: any = {
    supabase: svc,
    businessId,
    userId: biz.owner_id,
    exchangeRate: Number(biz.exchange_rate ?? 1),
    exchangeRateSet: isExchangeRateSet(biz.exchange_rate),
    defaultCurrency: String(biz.default_currency ?? 'HTG').toUpperCase() === 'USD' ? 'USD' : 'HTG',
    can: () => true,
  };
  const timeZone = biz.timezone || 'America/Port-au-Prince';
  return postEveningNotification({
    businessId,
    day,
    build: async () => {
      const { report } = await readDay(ctx, day, timeZone, null, kaye.ownerWeeklySalary);
      return { report, name: String(biz.name ?? 'ProfitPilot'), to: biz.phone ?? null };
    },
  });
}

