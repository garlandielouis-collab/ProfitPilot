// ─────────────────────────────────────────────────────────────────────────────
// GET /api/store/payment/natcash/callback
//
// Même contrat que le rappel MonCash : on vérifie la transaction auprès de
// NatCash — jamais sur la foi des paramètres d'URL — puis on encaisse via
// `settleGatewayOrder`, qui marque la commande payée ET la confirme,
// c'est-à-dire crée la vente ProfitPilot et décrémente le stock dans une seule
// transaction.
//
// La version précédente encaissait dès que NatCash répondait « success », sans
// regarder À QUELLE commande ni POUR QUEL montant la transaction avait été
// payée : l'URL de retour d'un achat à 50 gourdes, rejouée avec l'identifiant
// d'une commande à 5 000, marquait celle-ci payée.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseService } from '../../../../../../lib/supabaseServiceClient';
import {
  amountShortfall,
  expectedGatewayAmount,
  readGatewayCredentials,
  recordGatewayRefusal,
  settleGatewayOrder,
  storeSlugOf,
  transactionSettledElsewhere,
} from '../../../../../../lib/storePaymentGateway';

const NC_PROD = 'https://www.natcash.com/api/v1';
const NC_SAND = 'https://sandbox.natcash.com/api/v1';

async function getNatcashToken(clientId: string, clientSecret: string, sandbox: boolean) {
  const base = sandbox ? NC_SAND : NC_PROD;
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`NatCash auth failed (${res.status})`);
  const json = await res.json();
  if (!json?.access_token) throw new Error('NatCash auth: jeton absent de la réponse');
  return json.access_token as string;
}

async function verifyNatcashPayment(token: string, sandbox: boolean, transactionId: string) {
  const base = sandbox ? NC_SAND : NC_PROD;
  const res = await fetch(`${base}/payment/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) throw new Error(`NatCash verify failed (${res.status})`);
  return await res.json();
}

type Refusal = {
  /** Le code lu par la page de commande pour choisir son message. */
  code:   'payment_failed' | 'payment_unverified';
  /** Pour le journal serveur uniquement. */
  reason: string;
};

/** Le premier champ présent parmi plusieurs noms possibles. */
function pick(obj: any, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj?.[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

/**
 * Pourquoi ce paiement ne peut pas être encaissé pour CETTE commande — ou
 * `null` s'il le peut.
 *
 * La forme de la réponse de `/payment/verify` n'est documentée nulle part dans
 * ce code (les docs NatCash s'obtiennent sur le portail marchand). On lit donc
 * les champs sous les noms que la route d'initiation ENVOIE à `/payment/create`
 * — `orderId` (notre UUID de commande), `amount`, `currency: 'HTG'`,
 * `transactionId` —, avec leurs équivalents MonCash (`reference`, `cost`,
 * `transaction_id`), à plat ou sous `payment` / `data`.
 *
 * Même règle que MonCash : toutes les conditions sont nécessaires, et un champ
 * absent vaut refus. Si la réponse réelle de NatCash nomme autrement la
 * référence ou le montant, les paiements seront refusés et le journal dira
 * pourquoi — c'est réparable. Une commande marquée payée sans l'être ne l'est
 * pas.
 */
function refuseNatcashPayment(
  result: any,
  order: { id: string },
  transactionId: string,
  /** Les gourdes demandées au lancement (`expectedGatewayAmount`). */
  expectedHtg: number,
): Refusal | null {
  if (!result || typeof result !== 'object') {
    return { code: 'payment_unverified', reason: 'réponse vide ou illisible' };
  }
  const nested  = result.payment ?? result.data;
  const payment = nested && typeof nested === 'object' ? nested : result;

  // Le paiement a-t-il abouti ? Un statut texte autre que « success » l'emporte
  // sur un message « successful », qui peut ne décrire que l'appel d'API.
  const rawStatus = pick(payment, 'status') ?? pick(result, 'status');
  const status    = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : null;
  const message   = String(pick(payment, 'message') ?? pick(result, 'message') ?? '').toLowerCase();
  if (status !== null && status !== 'success') {
    return { code: 'payment_failed', reason: `statut « ${rawStatus} »` };
  }
  if (status !== 'success' && message !== 'successful') {
    return { code: 'payment_failed', reason: `statut « ${rawStatus ?? '(absent)'} », message « ${message || '(absent)'} »` };
  }

  // La transaction appartient-elle à cette commande ?
  const reference = pick(payment, 'orderId', 'order_id', 'reference');
  if (String(reference ?? '') !== order.id) {
    return {
      code: 'payment_unverified',
      reason: `référence « ${reference ?? '(absente)'} » ≠ commande ${order.id}`,
    };
  }

  const reportedTx = pick(payment, 'transactionId', 'transaction_id');
  if (reportedTx != null && String(reportedTx) !== transactionId) {
    return { code: 'payment_unverified', reason: `transaction « ${reportedTx} » ≠ « ${transactionId} »` };
  }

  // L'initiation demande des gourdes : un montant dans une autre devise ne se
  // compare pas au montant attendu.
  const currency = pick(payment, 'currency');
  if (currency != null && String(currency).toUpperCase() !== 'HTG') {
    return { code: 'payment_unverified', reason: `devise « ${currency} » ≠ HTG` };
  }

  // Le montant payé couvre-t-il les gourdes demandées au lancement ? Plus le
  // total : pour une commande en USD, il est en dollars, et quelques gourdes
  // l'auraient « couvert ».
  const shortfall = amountShortfall(pick(payment, 'amount', 'cost'), expectedHtg);
  if (shortfall) {
    return { code: 'payment_unverified', reason: shortfall };
  }

  return null;
}

export async function GET(req: NextRequest) {
  const svc = getSupabaseService();
  const { searchParams } = req.nextUrl;
  const transactionId = searchParams.get('transactionId');
  // Posé par la route d'initiation sur l'URL de retour.
  const orderDbId     = searchParams.get('orderId');

  if (!transactionId || !orderDbId) {
    return NextResponse.redirect(new URL('/store?error=missing_params', req.url));
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

    if (!order) return NextResponse.redirect(new URL('/store?error=order_not_found', req.url));

    slug = await storeSlugOf(order.business_id);

    // Déjà encaissée : on renvoie vers la confirmation sans rappeler NatCash.
    if (order.payment_status === 'paid') {
      return NextResponse.redirect(
        new URL(
          `/store/${slug}/confirmation?id=${order.id}&paid=1`,
          req.url,
        ),
      );
    }

    // Une transaction qui a déjà réglé une autre commande ne règle pas
    // celle-ci. Contrôle local, indépendant de la forme de la réponse NatCash.
    if (await transactionSettledElsewhere({ gateway: 'natcash', transactionId, orderId: order.id })) {
      console.error('[natcash callback] paiement non encaissé : transaction déjà rattachée à une autre commande', {
        orderId: order.id,
        order:   order.order_number,
        transactionId,
      });
      await recordGatewayRefusal({
        orderId: order.id,
        gateway: 'natcash',
        code:    'payment_unverified',
        reason:  'transaction déjà rattachée à une autre commande',
        transactionId,
      });
      return backToCheckout('payment_unverified');
    }

    const creds = await readGatewayCredentials(order.business_id, 'natcash');
    if (!creds) {
      return backToCheckout('payment_unavailable');
    }

    // Les gourdes que ce paiement doit couvrir. Sans elles on ne peut rien
    // comparer ; l'acheteur a peut-être déjà payé, d'où `payment_unverified`
    // (« contactez la boutique ») plutôt que « choisissez un autre moyen ».
    // La tentative reste `pending` : ne pas savoir n'est pas un refus.
    const expected = await expectedGatewayAmount({ order, gateway: 'natcash' });
    if (!expected.ok) {
      console.error('[natcash callback] paiement non encaissé : montant attendu inconnu —', expected.reason, {
        orderId: order.id,
        order:   order.order_number,
        transactionId,
      });
      return backToCheckout('payment_unverified');
    }

    const accessToken = await getNatcashToken(creds.client_id, creds.client_secret, creds.sandbox);
    const result      = await verifyNatcashPayment(accessToken, creds.sandbox, transactionId);

    const refusal = refuseNatcashPayment(result, order, transactionId, expected.amount);
    if (refusal) {
      console.error('[natcash callback] paiement non encaissé :', refusal.reason, {
        orderId: order.id,
        order:   order.order_number,
        transactionId,
      });
      await recordGatewayRefusal({
        orderId:          order.id,
        gateway:          'natcash',
        code:             refusal.code,
        reason:           refusal.reason,
        transactionId,
        providerResponse: result,
      });
      return backToCheckout(refusal.code);
    }

    const settled = await settleGatewayOrder({
      orderId:          order.id,
      gateway:          'natcash',
      transactionId,
      providerResponse: result,
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
    console.error('[natcash callback] error:', err.message);
    return backToCheckout('payment_error');
  }
}
