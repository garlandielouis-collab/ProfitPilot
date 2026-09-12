// ─────────────────────────────────────────────────────────────────────────────
// GET /api/store/payment/moncash/callback
//
// MonCash renvoie l'acheteur ici après le paiement. On vérifie la transaction
// auprès de MonCash — jamais sur la foi des paramètres d'URL — puis on encaisse.
//
// « Encaisser » veut dire : marquer la commande payée ET la confirmer, ce qui
// crée la vente ProfitPilot, décrémente le stock et écrit le mouvement
// d'inventaire. La version précédente se contentait d'écrire
// `status = 'confirmed'` dans `orders` : la commande payée n'apparaissait ni
// dans les ventes, ni dans les rapports, et le stock ne bougeait pas.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../../../../lib/supabaseServiceClient';
import {
  amountShortfall,
  expectedGatewayAmount,
  readGatewayCredentials,
  settleGatewayOrder,
  storeSlugOf,
  transactionSettledElsewhere,
} from '../../../../../../lib/storePaymentGateway';

const MC_PROD = 'https://moncashbutton.digicelgroup.com/Api';
const MC_SAND = 'https://sandbox.moncashbutton.digicelgroup.com/Api';

async function getMoncashToken(clientId: string, clientSecret: string, sandbox: boolean) {
  const base = sandbox ? MC_SAND : MC_PROD;
  const res = await fetch(`${base}/oauth/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  const json = await res.json();
  return json.access_token as string;
}

async function verifyMoncashTransaction(token: string, sandbox: boolean, transactionId: string) {
  const base = sandbox ? MC_SAND : MC_PROD;
  const res = await fetch(`${base}/v1/RetrieveTransactionPaymentById`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) throw new Error(`MonCash verify failed (${res.status})`);
  return await res.json();
}

type Refusal = {
  /** Le code lu par la page de commande pour choisir son message. */
  code:   'payment_failed' | 'payment_unverified';
  /** Pour le journal serveur uniquement. */
  reason: string;
};

/**
 * Pourquoi ce paiement ne peut pas être encaissé pour CETTE commande — ou
 * `null` s'il le peut.
 *
 * MonCash répond :
 *   { path, payment: { reference, transaction_id, cost, message, payer },
 *     timestamp, status }
 * où `reference` est l'`orderId` passé à CreatePayment — notre UUID de commande
 * (cf. route d'initiation) — et `cost` le montant réellement payé.
 *
 * L'ancienne condition, `message !== 'successful' && status !== 200`, laissait
 * passer toute réponse portant `status: 200` : un paiement refusé, ou la
 * transaction réussie d'une AUTRE commande. Il suffisait de rejouer l'URL de
 * retour d'un achat à 50 gourdes avec l'identifiant d'une commande à 5 000 pour
 * que celle-ci soit marquée payée et le stock décrémenté.
 *
 * Toutes les conditions sont nécessaires, et un champ absent vaut refus : si
 * MonCash change sa réponse, des paiements seront refusés et le journal dira
 * pourquoi — c'est réparable. Une commande marquée payée sans l'être ne l'est
 * pas : la marchandise est partie.
 */
function refuseMoncashPayment(
  verification: any,
  order: { id: string },
  transactionId: string,
  /** Les gourdes demandées au lancement (`expectedGatewayAmount`). */
  expectedHtg: number,
): Refusal | null {
  const payment = verification?.payment;
  if (!payment || typeof payment !== 'object') {
    return { code: 'payment_unverified', reason: 'réponse sans objet `payment`' };
  }

  if (String(payment.message ?? '').toLowerCase() !== 'successful') {
    return { code: 'payment_failed', reason: `message « ${payment.message ?? '(absent)'} »` };
  }

  // La transaction appartient-elle à cette commande ?
  if (String(payment.reference ?? '') !== order.id) {
    return {
      code: 'payment_unverified',
      reason: `référence « ${payment.reference ?? '(absente)'} » ≠ commande ${order.id}`,
    };
  }

  const reportedTx = payment.transaction_id ?? payment.transactionId;
  if (reportedTx != null && String(reportedTx) !== transactionId) {
    return { code: 'payment_unverified', reason: `transaction « ${reportedTx} » ≠ « ${transactionId} »` };
  }

  // Le montant payé couvre-t-il les gourdes demandées au lancement ? Plus le
  // total : pour une commande en USD, il est en dollars, et quelques gourdes
  // l'auraient « couvert ».
  const shortfall = amountShortfall(payment.cost, expectedHtg);
  if (shortfall) {
    return { code: 'payment_unverified', reason: shortfall };
  }

  return null;
}

export async function GET(req: NextRequest) {
  const svc = getSupabaseService();
  const { searchParams } = req.nextUrl;
  const transactionId = searchParams.get('transactionId');
  // Posé par la route d'initiation sur l'URL de retour : sans lui on ne sait
  // pas de quelle commande — donc de quel marchand — il s'agit, et on ne peut
  // pas récupérer les identifiants pour vérifier.
  const orderDbId = searchParams.get('orderId');

  if (!transactionId) {
    return NextResponse.redirect(new URL('/store?error=missing_transaction', req.url));
  }
  if (!orderDbId) {
    return NextResponse.redirect(new URL('/store?error=missing_order', req.url));
  }

  // Connu dès que la commande est lue. Un échec survenu ensuite renvoie
  // l'acheteur sur la page de commande DE SA BOUTIQUE, qui affiche le message
  // et son panier intact — plus sur « /store », qui n'est la page de personne.
  let slug = '';
  const backToCheckout = (code: string) =>
    NextResponse.redirect(
      new URL(slug ? `/store/${slug}/checkout?error=${code}` : `/store?error=${code}`, req.url),
    );

  try {
    const { data: order } = await svc
      .from('orders')
      .select('id, business_id, order_number, payment_status, total, currency')
      .eq('id', orderDbId)
      .maybeSingle();

    if (!order) {
      return NextResponse.redirect(new URL('/store?error=order_not_found', req.url));
    }

    slug = await storeSlugOf(order.business_id);

    // Déjà encaissée : on renvoie vers la confirmation sans rappeler MonCash.
    if (order.payment_status === 'paid') {
      return NextResponse.redirect(
        new URL(
          `/store/${slug}/confirmation?id=${order.id}&paid=1`,
          req.url,
        ),
      );
    }

    // Une transaction qui a déjà réglé une autre commande ne règle pas
    // celle-ci. Contrôle local, indépendant de la forme de la réponse MonCash.
    if (await transactionSettledElsewhere({ gateway: 'moncash', transactionId, orderId: order.id })) {
      console.error('[moncash callback] paiement non encaissé : transaction déjà rattachée à une autre commande', {
        orderId: order.id,
        order:   order.order_number,
        transactionId,
      });
      return backToCheckout('payment_unverified');
    }

    const creds = await readGatewayCredentials(order.business_id, 'moncash');
    if (!creds) {
      return backToCheckout('payment_unavailable');
    }

    // Les gourdes que ce paiement doit couvrir. Sans elles on ne peut rien
    // comparer ; l'acheteur a peut-être déjà payé, d'où `payment_unverified`
    // (« contactez la boutique ») plutôt que « choisissez un autre moyen ».
    const expected = await expectedGatewayAmount({ order, gateway: 'moncash' });
    if (!expected.ok) {
      console.error('[moncash callback] paiement non encaissé : montant attendu inconnu —', expected.reason, {
        orderId: order.id,
        order:   order.order_number,
        transactionId,
      });
      return backToCheckout('payment_unverified');
    }

    const accessToken  = await getMoncashToken(creds.client_id, creds.client_secret, creds.sandbox);
    const verification = await verifyMoncashTransaction(accessToken, creds.sandbox, transactionId);

    const refusal = refuseMoncashPayment(verification, order, transactionId, expected.amount);
    if (refusal) {
      console.error('[moncash callback] paiement non encaissé :', refusal.reason, {
        orderId: order.id,
        order:   order.order_number,
        transactionId,
      });
      return backToCheckout(refusal.code);
    }

    const settled = await settleGatewayOrder({
      orderId:       order.id,
      gateway:       'moncash',
      transactionId,
    });

    if (!settled.ok) {
      return NextResponse.redirect(new URL('/store?error=order_not_found', req.url));
    }

    return NextResponse.redirect(
      new URL(
        `/store/${settled.slug}/confirmation?id=${settled.orderId}&paid=1`,
        req.url,
      ),
    );
  } catch (err: any) {
    console.error('[moncash callback] error:', err.message);
    return backToCheckout('payment_error');
  }
}
