// ─────────────────────────────────────────────────────────────────────────────
// Cron quotidien — rappels de créances (Diagnostic 3) + stock bas (Bonus 6)
//
// « Les gens me doivent de l'argent, mais j'oublie qui et depuis quand. »
// C'est l'app qui doit se souvenir : chaque matin, elle prévient le marchand
// des échéances qui approchent, de celles dépassées, et des produits qui
// vont tomber en rupture avant que la vente ne soit perdue.
//
// Une notification par créance et par jour au maximum : un marchand noyé sous
// les alertes les désactive toutes, et on perd la fonctionnalité entière.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';
import { isAuthorizedCron } from '../../../../lib/cronAuth';
import { notify } from '../../../../lib/notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const money = (n: number, currency: string): string =>
  `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;

/** Une relance par jour maximum sur une même créance. */
function remindedToday(lastReminderAt: string | null): boolean {
  if (!lastReminderAt) return false;
  const last = new Date(lastReminderAt);
  const now  = new Date();
  return last.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const svc = getSupabaseService();
  let receivableAlerts = 0;
  let stockAlerts = 0;

  // ── Créances à relancer ────────────────────────────────────────────────────
  const { data: receivables, error: recvError } = await svc
    .from('v_receivables')
    .select('sale_id, business_id, customer_name, balance_due, currency, due_date, days_overdue, status, last_reminder_at')
    .in('status', ['due_soon', 'overdue', 'critical']);

  if (recvError) {
    return NextResponse.json({ error: recvError.message }, { status: 500 });
  }

  for (const r of receivables ?? []) {
    if (remindedToday(r.last_reminder_at)) continue;

    const overdue = Number(r.days_overdue ?? 0);
    const amount  = money(Number(r.balance_due ?? 0), r.currency ?? 'HTG');

    await notify({
      companyId: r.business_id,
      type: 'generic',
      title: overdue > 0
        ? `Kredi an reta : ${r.customer_name}`
        : `Echeyans pwoche : ${r.customer_name}`,
      body: overdue > 0
        ? `${amount} an reta depi ${overdue} jou. Voye yon ti rapèl.`
        : `${amount} rive a echeyans${r.due_date ? ` ${r.due_date}` : ''}.`,
      entity: 'sale',
      entityId: r.sale_id,
      data: { href: '/creances', status: r.status, balanceDue: Number(r.balance_due ?? 0) },
    });

    receivableAlerts++;
  }

  // ── Stock bas ──────────────────────────────────────────────────────────────
  // Le seuil vit sur le produit : 5 sacs de riz et 5 téléviseurs ne portent
  // pas le même risque, et un seuil global n'aurait donc aucun sens.
  const { data: businesses } = await svc
    .from('businesses')
    .select('id, owner_id, low_stock_alerts_enabled');

  for (const biz of businesses ?? []) {
    if (biz.low_stock_alerts_enabled === false) continue;

    const { data: products } = await svc
      .from('products')
      .select('id, name, stock_quantity, reorder_point')
      .eq('user_id', biz.owner_id);

    const low = (products ?? []).filter(
      (p: any) => Number(p.stock_quantity) <= Number(p.reorder_point ?? 5),
    );
    if (low.length === 0) continue;

    const outOfStock = low.filter((p: any) => Number(p.stock_quantity) === 0);

    await notify({
      companyId: biz.id,
      type: 'stock_low',
      title: outOfStock.length > 0
        ? `${outOfStock.length} pwodwi fini nan stock`
        : `${low.length} pwodwi rive nan sèy rekòmand`,
      body: low.slice(0, 3).map((p: any) => `${p.name} (${p.stock_quantity})`).join(' · '),
      entity: 'product',
      data: { href: '/inventory', count: low.length },
    });

    stockAlerts++;
  }

  return NextResponse.json({ ok: true, receivableAlerts, stockAlerts });
}
