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

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const svc = getSupabaseService();

  const { data: businesses, error } = await svc
    .from('businesses')
    .select('id, name, whatsapp_number, weekly_digest_enabled, default_currency')
    .neq('weekly_digest_enabled', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const end       = new Date();
  const start     = new Date(end.getTime() - 6 * 86_400_000);
  const prevStart = new Date(start.getTime() - 7 * 86_400_000);
  const prevEnd   = new Date(start.getTime() - 86_400_000);

  let sent = 0;

  for (const biz of businesses ?? []) {
    const [{ data: sales }, { data: prevSales }, { data: items }, { data: recv }] = await Promise.all([
      svc.from('sales').select('id, total_amount')
        .eq('business_id', biz.id).is('deleted_at', null)
        .gte('sale_date', iso(start)).lte('sale_date', iso(end)),
      svc.from('sales').select('total_amount')
        .eq('business_id', biz.id).is('deleted_at', null)
        .gte('sale_date', iso(prevStart)).lte('sale_date', iso(prevEnd)),
      svc.from('sale_items')
        .select('product_name, quantity, cost_price, line_total, sales!inner(sale_date, deleted_at)')
        .eq('business_id', biz.id)
        .gte('sales.sale_date', iso(start)).lte('sales.sale_date', iso(end)),
      svc.from('v_receivables')
        .select('customer_name, balance_due, days_overdue, status')
        .eq('business_id', biz.id),
    ]);

    const salesCount = (sales ?? []).length;
    const receivablesDue = (recv ?? [])
      .filter((r: any) => ['due_soon', 'overdue', 'critical'].includes(r.status))
      .map((r: any) => ({
        clientName:  r.customer_name ?? 'Client',
        balanceDue:  num(r.balance_due),
        daysOverdue: Math.max(num(r.days_overdue), 0),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Une semaine sans vente ET sans créance à relancer n'a rien à dire :
    // un message vide chaque dimanche est le meilleur moyen d'être ignoré.
    if (salesCount === 0 && receivablesDue.length === 0) continue;

    const revenue     = (sales ?? []).reduce((s: number, r: any) => s + num(r.total_amount), 0);
    const prevRevenue = (prevSales ?? []).reduce((s: number, r: any) => s + num(r.total_amount), 0);

    const marginByProduct = new Map<string, number>();
    let grossMargin = 0;
    for (const it of items ?? []) {
      const margin = num((it as any).line_total) - num((it as any).cost_price) * num((it as any).quantity);
      grossMargin += margin;
      const name = (it as any).product_name ?? 'Produit';
      marginByProduct.set(name, (marginByProduct.get(name) ?? 0) + margin);
    }

    const topProduct = [...marginByProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, m]) => ({ name, grossMargin: m }))[0] ?? null;

    const message = buildWeeklyDigest({
      businessName:    biz.name ?? 'Mon business',
      currency:        biz.default_currency ?? 'HTG',
      periodStart:     iso(start),
      periodEnd:       iso(end),
      revenue,
      grossMargin,
      salesCount,
      previousRevenue: prevRevenue,
      topProduct,
      receivablesDue,
    });

    const whatsappUrl = buildWhatsAppLink(biz.whatsapp_number, message);

    await svc.from('report_deliveries').insert({
      business_id:  biz.id,
      kind:         'weekly_digest',
      channel:      'whatsapp',
      period_start: iso(start),
      period_end:   iso(end),
      payload:      { revenue, grossMargin, salesCount, whatsappUrl },
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
