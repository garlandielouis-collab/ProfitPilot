// ─────────────────────────────────────────────────────────────────────────────
// Cron quotidien — créances (Diagnostic 3), stock bas (Bonus 6), parrainage,
// et depuis la Phase 3 du centre documentaire, les échéances de papiers (§34).
//
// « Les gens me doivent de l'argent, mais j'oublie qui et depuis quand. »
// C'est l'app qui doit se souvenir : chaque matin, elle prévient le marchand
// des échéances qui approchent, de celles dépassées, des produits qui vont
// tomber en rupture, et des documents qui vont périmer.
//
// Une notification par entité et par jour au maximum : un marchand noyé sous
// les alertes les désactive toutes, et on perd la fonctionnalité entière.
//
// ── Pourquoi chaque balayage est une fonction ───────────────────────────────
//
// La route portait trois traitements écrits à la suite dans le corps du `GET`.
// En ajouter un quatrième dans la même veine aurait donné cent lignes dont on
// ne sait plus où l'une finit. Chacun est donc nommé, rend son compte, et
// échoue pour lui seul : une lecture de créances en panne ne doit pas empêcher
// la patente de prévenir qu'elle expire demain.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseService } from '../../../../lib/supabaseServiceClient';
import { isAuthorizedCron } from '../../../../lib/cronAuth';
import { notify } from '../../../../lib/notify';
import { sweepDocumentExpirations } from '../../../../lib/documents/expirationSweep';
import { sweepReferralActivations } from '../../../actions/referrals';
import { sweepReviewRequests } from '../../../../lib/reviewRequestSweep';

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

// ─────────────────────────────────────────────────────────────────────────────
// Créances à relancer
// ─────────────────────────────────────────────────────────────────────────────

async function sweepReceivables(svc: SupabaseClient): Promise<number> {
  const { data: receivables, error } = await svc
    .from('v_receivables')
    .select('sale_id, business_id, customer_name, balance_due, currency, due_date, days_overdue, status, last_reminder_at')
    .in('status', ['due_soon', 'overdue', 'critical']);

  if (error) throw new Error(error.message);

  let alerts = 0;
  for (const r of receivables ?? []) {
    if (remindedToday(r.last_reminder_at)) continue;

    const overdue = Number(r.days_overdue ?? 0);
    const amount  = money(Number(r.balance_due ?? 0), r.currency ?? 'HTG');

    await notify({
      companyId: r.business_id,
      type: 'generic',
      // Le type ne dit rien de la créance : c'est `payment_due` — l'interrupteur
      // « Relance des créances » — qui décide si la relance part.
      preference: 'payment_due',
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

    alerts++;
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock bas
//
// Le seuil vit sur le produit : 5 sacs de riz et 5 téléviseurs ne portent pas
// le même risque, et un seuil global n'aurait donc aucun sens.
// ─────────────────────────────────────────────────────────────────────────────

async function sweepLowStock(svc: SupabaseClient): Promise<number> {
  const { data: businesses } = await svc
    .from('businesses')
    .select('id, owner_id, low_stock_alerts_enabled');

  let alerts = 0;
  for (const biz of businesses ?? []) {
    if (biz.low_stock_alerts_enabled === false) continue;

    // Par entreprise. Cadré sur `owner_id`, l'alerte ignorait tout produit
    // saisi par un employé — c'est-à-dire, dans un commerce à deux personnes,
    // une bonne partie du stock.
    const { data: products } = await svc
      .from('products')
      .select('id, name, stock_quantity, reorder_point')
      .eq('business_id', biz.id);

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

    alerts++;
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const svc = getSupabaseService();
  const failures: string[] = [];

  // Chaque balayage est isolé : une vue en panne ne fait pas taire les trois
  // autres. Ce qui a échoué est nommé dans la réponse — un cron qui rend
  // `{ ok: true }` en ayant échoué à moitié est pire qu'un cron qui échoue.
  const run = async <T>(name: string, task: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await task();
    } catch (err) {
      failures.push(`${name}: ${err instanceof Error ? err.message : 'échec'}`);
      return fallback;
    }
  };

  const receivableAlerts = await run('receivables', () => sweepReceivables(svc), 0);
  const stockAlerts      = await run('stock', () => sweepLowStock(svc), 0);

  // Le §34 : les papiers qui vont périmer. Une patente oubliée coûte le
  // commerce ; c'est le genre d'alerte pour laquelle ce cron existe.
  const documents = await run('documents', () => sweepDocumentExpirations(), {
    transitioned: 0, alerts: 0,
  });

  // Le deuxième barreau de l'échelle de parrainage se franchit avec le TEMPS —
  // sept jours et de vraies ventes — et personne n'est là au bon moment pour le
  // déclencher.
  const referralActivations = await run('referrals', () => sweepReferralActivations(), 0);

  // La demande d'avis, trois jours après livraison. C'est le seul balayage qui
  // écrit à un CLIENT du marchand et non au marchand : il est donc le plus
  // prudent des cinq — une seule relance par commande, jamais deux, et une
  // fenêtre de trente jours qui empêche le rattrapage historique de devenir un
  // envoi de masse le premier soir.
  const reviews = await run('reviews', () => sweepReviewRequests(), {
    sent: 0, skipped: 0, failed: 0,
  });

  return NextResponse.json({
    ok: failures.length === 0,
    receivableAlerts,
    stockAlerts,
    documentAlerts: documents.alerts,
    documentsExpired: documents.transitioned,
    referralActivations,
    reviewRequestsSent:    reviews.sent,
    reviewRequestsSkipped: reviews.skipped,
    reviewRequestsFailed:  reviews.failed,
    ...(failures.length > 0 ? { failures } : {}),
  });
}
