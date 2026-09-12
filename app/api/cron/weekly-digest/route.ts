// ─────────────────────────────────────────────────────────────────────────────
// Cron hebdomadaire — résumé WhatsApp du dimanche soir (Bonus 1)
//
// « L'information vient à lui au lieu qu'il aille la chercher. » Le cron
// prépare le message pour chaque entreprise, le journalise dans
// `report_deliveries` et le pousse en notification in-app avec le lien wa.me
// prêt à ouvrir.
//
// L'envoi automatique par l'API WhatsApp Business demande un compte vérifié
// Meta ; tant qu'il n'est pas branché, le message est prêt en un tap plutôt
// qu'expédié tout seul. Le contenu, lui, est identique.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';
import { isAuthorizedCron } from '../../../../lib/cronAuth';
import { notify } from '../../../../lib/notify';
import { buildWeeklyDigest, buildWhatsAppLink } from '../../../../lib/whatsappReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const iso = (d: Date): string => d.toISOString().slice(0, 10);

// Même règle que `makeToReport` dans app/actions/ai.ts (non importable : un
// fichier 'use server' n'exporte que des fonctions async). Ramène un montant à
// la devise de l'entreprise au taux `exchange_rate` (1 USD = taux HTG) ; `null`
// quand le taux est absent ou nul — le montant est alors exclu, jamais inventé.
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

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const svc = getSupabaseService();

  const { data: businesses, error } = await svc
    .from('businesses')
    .select('id, name, whatsapp_number, weekly_digest_enabled, default_currency, exchange_rate')
    .neq('weekly_digest_enabled', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const end       = new Date();
  const start     = new Date(end.getTime() - 6 * 86_400_000);
  const prevStart = new Date(start.getTime() - 7 * 86_400_000);
  const prevEnd   = new Date(start.getTime() - 86_400_000);

  let sent = 0;

  for (const biz of businesses ?? []) {
    // Devise ET taux de CETTE entreprise : le message affiche ses montants en
    // `default_currency`, et chaque vente y est ramenée au taux `exchange_rate`.
    // Pas de taux de repli : un taux absent exclut la vente, et le message le
    // dit. Chaque vente exclue est comptée une fois (par id), même si elle
    // apparaît aussi en ligne de vente et en créance.
    const reportCurrency: 'HTG' | 'USD' =
      String(biz.default_currency ?? 'HTG').toUpperCase() === 'USD' ? 'USD' : 'HTG';
    const convert = makeToReport(Number(biz.exchange_rate), reportCurrency);
    const unconverted = new Set<string>();
    const toReport = (amount: number, currency: string | null | undefined, saleId: string): number | null => {
      if (amount === 0) return 0;
      const v = convert(amount, currency);
      if (v === null) unconverted.add(saleId);
      return v;
    };

    const [{ data: sales }, { data: prevSales }, { data: items }, { data: recv }] = await Promise.all([
      svc.from('sales').select('id, total_amount, currency')
        .eq('business_id', biz.id).is('deleted_at', null)
        .gte('sale_date', iso(start)).lte('sale_date', iso(end)),
      svc.from('sales').select('id, total_amount, currency')
        .eq('business_id', biz.id).is('deleted_at', null)
        .gte('sale_date', iso(prevStart)).lte('sale_date', iso(prevEnd)),
      svc.from('sale_items')
        .select('sale_id, product_name, quantity, cost_price, line_total, currency, sales!inner(sale_date, deleted_at)')
        .eq('business_id', biz.id).is('sales.deleted_at', null)
        .gte('sales.sale_date', iso(start)).lte('sales.sale_date', iso(end)),
      svc.from('v_receivables')
        .select('sale_id, customer_name, balance_due, days_overdue, status, currency')
        .eq('business_id', biz.id),
    ]);

    const salesCount = (sales ?? []).length;
    const dueRows = ((recv ?? []) as any[])
      .filter((r: any) => ['due_soon', 'overdue', 'critical'].includes(r.status));

    // Une semaine sans vente ET sans créance à relancer n'a rien à dire :
    // un message vide chaque dimanche est le meilleur moyen d'être ignoré.
    // Testé AVANT conversion : des créances exclues faute de taux restent un
    // sujet, et le message dira pourquoi elles manquent.
    if (salesCount === 0 && dueRows.length === 0) continue;

    const receivablesDue: Array<{ clientName: string; balanceDue: number; daysOverdue: number }> = [];
    for (const r of dueRows) {
      const balanceDue = toReport(num(r.balance_due), r.currency, r.sale_id);
      if (balanceDue === null) continue;
      receivablesDue.push({
        clientName:  r.customer_name ?? 'Client',
        balanceDue,
        daysOverdue: Math.max(num(r.days_overdue), 0),
      });
    }
    receivablesDue.sort((a, b) => b.daysOverdue - a.daysOverdue);

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

    const message = buildWeeklyDigest({
      businessName:    biz.name ?? 'Mon business',
      currency:        reportCurrency,
      periodStart:     iso(start),
      periodEnd:       iso(end),
      revenue,
      grossMargin,
      salesCount,
      previousRevenue: prevRevenue,
      topProduct,
      receivablesDue,
      unconvertedCount: unconverted.size,
    });

    const whatsappUrl = buildWhatsAppLink(biz.whatsapp_number, message);

    await svc.from('report_deliveries').insert({
      business_id:  biz.id,
      kind:         'weekly_digest',
      channel:      'whatsapp',
      period_start: iso(start),
      period_end:   iso(end),
      payload:      {
        revenue, grossMargin, salesCount, whatsappUrl,
        currency: reportCurrency, unconvertedCount: unconverted.size,
      },
      status:       'generated',
    });

    await notify({
      companyId: biz.id,
      type: 'generic',
      // Le réglage d'entreprise (`weekly_digest_enabled`) filtre plus haut ;
      // celui-ci laisse chaque destinataire couper le résumé pour lui seul.
      preference: 'weekly_summary',
      title: 'Rezime semèn nan pare',
      body: message.slice(0, 180),
      entity: 'report',
      data: { href: '/rapports', whatsappUrl },
    });

    sent++;
  }

  return NextResponse.json({ ok: true, businesses: (businesses ?? []).length, sent });
}
